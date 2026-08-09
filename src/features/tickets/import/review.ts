import { comboKey, validateBulkRows, type RowValidation } from '../bulk/duplicates'
import {
  clientIdentityKey,
  clientPhoneKey,
  groupImportClients,
  hasAnyClientData,
  hasCompleteClientData,
  type ClientResolution,
} from './clients'
import type { ImportRow } from './rows'
import { importClientSchema } from './schemas'

/** Revision de archivo sobre los mismos validadores de la carga manual. */

export type ImportRowStatus = 'valid' | 'duplicate' | 'taken' | 'invalid' | 'client-conflict'

export type ReviewedRow = ImportRow & {
  status: ImportRowStatus
  /** Frase para la columna «Problema». Vacia cuando la fila esta bien. */
  problem: string
}

export type ReviewedClient = ClientResolution & { tickets: number }

export type ImportReview = {
  rows: ReviewedRow[]
  total: number
  valid: number
  /** Repetidas dentro del propio archivo. */
  duplicates: number
  /** Su combinacion ya existe en la rifa. */
  taken: number
  /** Numeros o datos de cliente incompletos/mal escritos. */
  invalid: number
  /** Filas bloqueadas por identidad ambigua o por el flujo del vendedor. */
  clientConflicts: number
  /** Desglose de las filas que realmente se pueden guardar. */
  withClient: number
  withoutClient: number
  clients: ReviewedClient[]
}

export type ReviewOptions = {
  existingCombos?: ReadonlySet<string>
  clientResolutions?: ReadonlyMap<string, ClientResolution>
  /** El portal administrativo puede crear/asignar; el vendedor conserva la aprobacion. */
  allowClientAssignments?: boolean
}

function describeTicket(validation: RowValidation | undefined): string {
  if (!validation) return ''

  const parts: string[] = []
  if (validation.dailyError) parts.push('El número diario debe tener entre 1 y 4 dígitos.')
  if (validation.weeklyError) parts.push('El número semanal debe tener entre 1 y 4 dígitos.')

  if (validation.problem === 'incomplete') {
    return 'A esta fila le falta uno de los dos números.'
  }
  if (parts.length > 0) return parts.join(' ')
  if (validation.rowError) return validation.rowError
  return ''
}

function ticketStatus(validation: RowValidation | undefined): ImportRowStatus {
  switch (validation?.problem) {
    case 'duplicate':
      return 'duplicate'
    case 'taken':
      return 'taken'
    case 'format':
    case 'incomplete':
      return 'invalid'
    default:
      return 'valid'
  }
}

function reviewClient(
  row: ImportRow,
  options: ReviewOptions,
  conflictingPhoneKeys: ReadonlySet<string>,
): { status: ImportRowStatus; problem: string } | null {
  if (!hasAnyClientData(row)) return null

  if (!hasCompleteClientData(row)) {
    return {
      status: 'invalid',
      problem: 'Escribe el nombre y el celular del cliente, o deja ambos campos vacíos.',
    }
  }

  const parsed = importClientSchema.safeParse({
    name: row.clientName,
    phone: row.clientPhone,
  })
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    return {
      status: 'invalid',
      problem:
        field === 'phone'
          ? 'El celular del cliente no tiene un formato válido.'
          : 'El nombre del cliente debe tener entre 2 y 120 caracteres.',
    }
  }

  if (conflictingPhoneKeys.has(clientPhoneKey(parsed.data.phone))) {
    return {
      status: 'client-conflict',
      problem: 'El mismo celular aparece con nombres diferentes dentro del archivo.',
    }
  }

  if (!options.allowClientAssignments) {
    return {
      status: 'client-conflict',
      problem:
        'Las boletas con cliente deben importarse desde el portal administrativo para conservar la aprobación del vendedor.',
    }
  }

  const resolution = options.clientResolutions?.get(
    clientIdentityKey(parsed.data.name, parsed.data.phone),
  )
  if (resolution?.status === 'conflict') {
    return {
      status: 'client-conflict',
      problem: resolution.problem ?? 'No pudimos identificar este cliente de forma segura.',
    }
  }

  return null
}

/** Revisa formato, duplicados, clientes y coincidencias existentes en una sola pasada. */
export function reviewRows(rows: readonly ImportRow[], options: ReviewOptions = {}): ImportReview {
  const validations = validateBulkRows(rows, {
    requireComplete: true,
    existingCombos: options.existingCombos,
  })
  const identitiesByPhone = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!hasCompleteClientData(row)) continue
    const parsed = importClientSchema.safeParse({ name: row.clientName, phone: row.clientPhone })
    if (!parsed.success) continue
    const phoneKey = clientPhoneKey(parsed.data.phone)
    const identities = identitiesByPhone.get(phoneKey) ?? new Set<string>()
    identities.add(clientIdentityKey(parsed.data.name, parsed.data.phone))
    identitiesByPhone.set(phoneKey, identities)
  }
  const conflictingPhoneKeys = new Set(
    [...identitiesByPhone].filter(([, identities]) => identities.size > 1).map(([phone]) => phone),
  )

  const reviewed: ReviewedRow[] = rows.map((row, index) => {
    const validation = validations[index]
    const status = ticketStatus(validation)
    if (status !== 'valid') {
      return { ...row, status, problem: describeTicket(validation) }
    }

    const client = reviewClient(row, options, conflictingPhoneKeys)
    return client ? { ...row, ...client } : { ...row, status: 'valid', problem: '' }
  })

  const count = (status: ImportRowStatus) => reviewed.filter((row) => row.status === status).length
  const validRows = reviewed.filter((row) => row.status === 'valid')
  const withClient = validRows.filter(
    (row): row is ReviewedRow & { clientName: string; clientPhone: string } =>
      hasCompleteClientData(row),
  )
  const ticketCounts = new Map<string, number>()

  for (const row of withClient) {
    const key = clientIdentityKey(row.clientName, row.clientPhone)
    ticketCounts.set(key, (ticketCounts.get(key) ?? 0) + 1)
  }

  const clients: ReviewedClient[] = groupImportClients(withClient).map((group) => {
    const resolution = options.clientResolutions?.get(group.key)
    return {
      ...group,
      status: resolution?.status ?? 'new',
      ...(resolution?.clientId ? { clientId: resolution.clientId } : {}),
      ...(resolution?.problem ? { problem: resolution.problem } : {}),
      tickets: ticketCounts.get(group.key) ?? 0,
    }
  })

  return {
    rows: reviewed,
    total: reviewed.length,
    valid: count('valid'),
    duplicates: count('duplicate'),
    taken: count('taken'),
    invalid: count('invalid'),
    clientConflicts: count('client-conflict'),
    withClient: withClient.length,
    withoutClient: validRows.length - withClient.length,
    clients,
  }
}

/** Solo las filas que se pueden guardar, en el orden del archivo. */
export function importableRows(review: ImportReview): ImportRow[] {
  return review.rows
    .filter((row) => row.status === 'valid')
    .map(({ rowNumber, dailyNumber, weeklyNumber, clientName, clientPhone }) => ({
      rowNumber,
      dailyNumber,
      weeklyNumber,
      ...(clientName !== undefined ? { clientName } : {}),
      ...(clientPhone !== undefined ? { clientPhone } : {}),
    }))
}

/** Las combinaciones de un conjunto de filas, en el formato `daily/weekly`. */
export function rowKeys(rows: readonly ImportRow[]): string[] {
  return rows
    .filter((row) => row.dailyNumber !== '' && row.weeklyNumber !== '')
    .map((row) => comboKey(row.dailyNumber, row.weeklyNumber))
}
