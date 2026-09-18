/**
 * LA PUERTA del cargador de premios reconocidos (Etapa 4 de D-208, `RUNBOOK` §9.4).
 *
 * PURA: no lee `.env.local`, ni la red, ni el reloj. `scripts/record-prize-awards.ts`
 * la consulta ANTES de resolver ninguna credencial y otra vez cuando ya sabe
 * contra qué proyecto trabaja, igual que la transición (D-205).
 *
 * LO QUE REUTILIZA DE LA TRANSICIÓN, sin copiarlo (`raffle-prize-transition-guard.ts`):
 * que el destino resuelto sea el pedido —`--production` nunca contra una base
 * local, solo un proyecto `https://….supabase.co`—, cómo se nombra el destino
 * sin escribir su dirección y qué error de la base deja la respuesta incierta.
 *
 * LO QUE AÑADE, porque aquí se escribe dinero:
 *
 *   1. el PROYECTO ESPERADO: `--project-ref`, obligatorio con `--production`, y
 *      el destino resuelto tiene que ser exactamente ese proyecto;
 *   2. la organización escrita DOS veces, idéntica, también en la vista previa;
 *   3. aplicar exige, en los DOS destinos, la huella de una vista previa
 *      anterior, que se compara con la de otra vista previa hecha justo antes de
 *      escribir. La huella liga el destino, la organización, el respaldo, las
 *      entradas y TODO lo que respondió la vista previa, en una representación
 *      estable —claves ordenadas, nulos explícitos—;
 *   4. las entradas se validan antes de tocar la red, y cada informe de la base
 *      se contrasta con ellas fila por fila: una fila que no corresponde a su
 *      entrada detiene la operación aunque la base no la rechazara.
 *
 * La autoridad sigue siendo `record_declared_prize_awards` (`0068`): vuelve a
 * comprobarlo todo, escribe entera o nada y es idempotente. Nada de aquí la
 * sustituye; solo impide que una orden equivocada llegue a ella.
 *
 * NINGÚN IDENTIFICADOR DE PRODUCCIÓN VIVE AQUÍ: todos llegan como argumentos.
 */
import { createHash } from 'node:crypto'

import { LOTTERY_CODES } from '../src/features/lottery/constants'
import type { DeclaredPrizeAwardInput } from '../src/features/prize-awards/declared'
import { TICKET_NUMBER_REGEX } from '../src/lib/constants'
import { formatCOP } from '../src/lib/money'
import {
  assertTransitionTarget,
  TransitionGateError,
  transitionErrorIsCertain,
  transitionTargetLabel,
} from './raffle-prize-transition-guard'

export type AwardsTargetKind = 'local' | 'production'

/** Lo que pidió quien ejecuta el cargador, ya comprobado. */
export type AwardsRequest = {
  target: AwardsTargetKind
  /** En minúsculas: la huella no cambia por cómo se escribió. */
  organizationId: string
  /** El proyecto esperado, solo con `--production`. */
  projectRef: string | null
  apply: boolean
  /** Huella de la vista previa anterior (`--preview-hash`). */
  previewHash: string | null
}

/** Una orden que no se ejecuta. El mensaje dice qué falta. */
export class AwardsGateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AwardsGateError'
  }
}

/**
 * Cómo termina el cargador. Quien lo opera decide con esto qué hacer después
 * (`RUNBOOK` §9.7), así que los cuatro significados no se mezclan.
 */
export const AWARDS_EXIT = {
  /** Bien, o nada que hacer. */
  ok: 0,
  /** No se escribió nada: la puerta, una entrada, la vista previa o un rechazo claro de la base. */
  refused: 1,
  /** Se escribió y lo almacenado no cuadra con lo pedido: se detiene y se investiga. */
  discrepancy: 2,
  /** No se sabe si se escribió: no se repite a ciegas. */
  uncertain: 3,
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256_HEX = /^[0-9a-f]{64}$/
/** La referencia de un proyecto de Supabase: la primera parte de su dirección. */
const PROJECT_REF = /^[a-z]{20}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** El mismo tope que `record_declared_prize_awards`. */
const MAX_ENTRIES = 100
/** Los mismos límites de importe que una alternativa de un premio (BR-J14). */
const MAX_AMOUNT = 10_000_000_000

const SWITCHES = ['--local', '--production', '--apply'] as const
const VALUED = [
  '--organization',
  '--confirm-organization',
  '--project-ref',
  '--preview-hash',
] as const
type ValuedFlag = (typeof VALUED)[number]

export const AWARDS_USAGE =
  'Uso: npx tsx scripts/record-prize-awards.ts (--local | --production --project-ref <referencia>) ' +
  '--organization <uuid> --confirm-organization <uuid> ' +
  '[--apply --preview-hash <huella de la vista previa>]'

/**
 * Lee y comprueba los argumentos. No acepta opciones desconocidas, repetidas ni
 * contradictorias: una errata en una orden contra producción no debe
 * convertirse en otra orden.
 */
export function parseAwardsArgs(args: readonly string[]): AwardsRequest {
  const values = new Map<ValuedFlag, string>()
  const switches = new Set<string>()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if ((SWITCHES as readonly string[]).includes(arg)) {
      if (switches.has(arg)) throw new AwardsGateError(`${arg} está repetido.`)
      switches.add(arg)
      continue
    }
    if ((VALUED as readonly string[]).includes(arg)) {
      const flag = arg as ValuedFlag
      if (values.has(flag)) throw new AwardsGateError(`${flag} está repetido.`)
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new AwardsGateError(`Falta el valor de ${flag}.`)
      }
      values.set(flag, value)
      index += 1
      continue
    }
    throw new AwardsGateError(
      `No reconozco «${arg}». Revisa la orden: una opción mal escrita no se ignora.`,
    )
  }

  const local = switches.has('--local')
  const production = switches.has('--production')
  if (local && production) {
    throw new AwardsGateError('Elige un solo destino: --local o --production.')
  }
  if (!local && !production) {
    throw new AwardsGateError(
      'Indica el destino: --local para la base local o --production para el proyecto real.',
    )
  }

  const organization = values.get('--organization')
  if (organization === undefined) {
    throw new AwardsGateError('Falta --organization: la organización dueña de las coincidencias.')
  }
  if (!UUID.test(organization)) {
    throw new AwardsGateError('--organization debe ser el identificador de la organización.')
  }
  const confirmation = values.get('--confirm-organization')
  if (confirmation === undefined) {
    throw new AwardsGateError(
      'Escribe otra vez el identificador de la organización con --confirm-organization.',
    )
  }
  // Igualdad EXACTA, carácter por carácter: ni espacios, ni mayúsculas cambiadas.
  if (confirmation !== organization) {
    throw new AwardsGateError(
      '--confirm-organization no coincide con --organization. Tiene que ser exactamente el mismo identificador.',
    )
  }

  const projectRef = values.get('--project-ref') ?? null
  if (local && projectRef !== null) {
    throw new AwardsGateError('--project-ref solo se usa con --production.')
  }
  if (production && projectRef === null) {
    throw new AwardsGateError(
      'Con --production indica el proyecto esperado con --project-ref: la referencia de 20 letras del proyecto en Supabase.',
    )
  }
  if (projectRef !== null && !PROJECT_REF.test(projectRef)) {
    throw new AwardsGateError(
      '--project-ref es la referencia del proyecto en Supabase: 20 letras minúsculas.',
    )
  }

  const apply = switches.has('--apply')
  const previewHash = values.get('--preview-hash') ?? null
  if (!apply && previewHash !== null) {
    throw new AwardsGateError(
      '--preview-hash solo se usa junto con --apply. Sin --apply es una vista previa.',
    )
  }
  if (apply && previewHash === null) {
    throw new AwardsGateError(
      'Para aplicar hace falta una vista previa anterior: ejecuta la orden sin --apply y pasa su huella con --preview-hash.',
    )
  }
  if (previewHash !== null && !SHA256_HEX.test(previewHash)) {
    throw new AwardsGateError(
      '--preview-hash es la huella que imprimió la vista previa: 64 caracteres hexadecimales en minúscula.',
    )
  }

  return {
    target: production ? 'production' : 'local',
    organizationId: organization.toLowerCase(),
    projectRef,
    apply,
    previewHash,
  }
}

/**
 * Comprueba que el destino resuelto es el que se pidió: las comprobaciones de la
 * transición y, para producción, que sea EXACTAMENTE el proyecto esperado.
 */
export function assertAwardsTarget(
  request: Pick<AwardsRequest, 'target' | 'projectRef'>,
  resolved: { isLocal: boolean; url: string },
  env: { SUPABASE_TARGET?: string | undefined },
): void {
  try {
    assertTransitionTarget(request, resolved, env)
  } catch (error) {
    if (error instanceof TransitionGateError) throw new AwardsGateError(error.message)
    throw error
  }
  if (request.target === 'local') return

  // La transición ya comprobó que es una dirección https de supabase.co.
  const host = new URL(resolved.url).hostname
  if (request.projectRef === null || host !== `${request.projectRef}.supabase.co`) {
    throw new AwardsGateError(
      'El destino resuelto no es el proyecto esperado: NEXT_PUBLIC_SUPABASE_URL no corresponde a --project-ref. No se tocó nada.',
    )
  }
}

/** Cómo se nombra el destino en pantalla, sin escribir la dirección del proyecto. */
export const awardsTargetLabel = transitionTargetLabel

/**
 * Si un error de la base deja el cargador con certeza SIN escribir. Es la misma
 * regla que la transición: un SQLSTATE —salvo los de conexión— es un rechazo que
 * deshizo la transacción; la red, un tiempo de espera o una pasarela, no.
 */
export const awardsErrorIsCertain = transitionErrorIsCertain

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return date.toISOString().slice(0, 10) === value
}

/**
 * Las entradas, antes de tocar la red. La base las vuelve a comprobar; esto solo
 * evita que una lista mal escrita llegue a ella.
 */
export function assertAwardInputs(
  entries: readonly DeclaredPrizeAwardInput[],
  basis: string,
): void {
  if (basis !== basis.trim() || basis.length < 10 || basis.length > 500) {
    throw new AwardsGateError(
      'El respaldo de negocio tiene entre 10 y 500 caracteres, sin espacios en los bordes.',
    )
  }
  if (entries.length === 0) throw new AwardsGateError('No hay ninguna entrada que reconocer.')
  if (entries.length > MAX_ENTRIES) {
    throw new AwardsGateError(`No se pueden reconocer más de ${MAX_ENTRIES} premios a la vez.`)
  }

  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    const n = index + 1
    if (
      !TICKET_NUMBER_REGEX.test(entry.daily_number) ||
      !TICKET_NUMBER_REGEX.test(entry.weekly_number)
    ) {
      throw new AwardsGateError(
        `La entrada ${n} no tiene los dos números de la boleta bien escritos (de 1 a 4 cifras).`,
      )
    }
    if (!(LOTTERY_CODES as readonly string[]).includes(entry.lottery_code)) {
      throw new AwardsGateError(`La entrada ${n} nombra una lotería que no existe.`)
    }
    if (!isIsoDate(entry.reference_date)) {
      throw new AwardsGateError(
        `La entrada ${n} no tiene una fecha de referencia válida (AAAA-MM-DD).`,
      )
    }
    const title = entry.prize_title
    if (title !== title.trim() || title.length < 2 || title.length > 80) {
      throw new AwardsGateError(
        `El nombre del premio de la entrada ${n} tiene entre 2 y 80 caracteres, sin espacios en los bordes.`,
      )
    }
    if (entry.amount === undefined && entry.in_kind_description === undefined) {
      throw new AwardsGateError(
        `La entrada ${n} no dice qué se ganó: hace falta el importe o lo que se ganó.`,
      )
    }
    if (
      entry.amount !== undefined &&
      (!Number.isSafeInteger(entry.amount) || entry.amount < 1 || entry.amount > MAX_AMOUNT)
    ) {
      throw new AwardsGateError(
        `El importe de la entrada ${n} tiene que ser un entero de pesos entre $1 y ${formatCOP(MAX_AMOUNT)}.`,
      )
    }
    const inKind = entry.in_kind_description
    if (
      inKind !== undefined &&
      (inKind !== inKind.trim() || inKind.length < 2 || inKind.length > 160)
    ) {
      throw new AwardsGateError(
        `Lo que se ganó en la entrada ${n} se describe con 2 a 160 caracteres, sin espacios en los bordes.`,
      )
    }
    const key = [
      entry.daily_number,
      entry.weekly_number,
      entry.lottery_code,
      entry.reference_date,
      title,
    ].join('|')
    if (seen.has(key)) {
      throw new AwardsGateError(
        `La entrada ${n} repite la boleta, el sorteo y el premio de otra entrada.`,
      )
    }
    seen.add(key)
  })
}

/** Los resultados que escribe `record_declared_prize_awards` en su informe. */
export const AWARD_OUTCOME = {
  wouldRecord: 'se reconocería',
  alreadyStored: 'ya estaba',
  recorded: 'reconocido',
  rejected: 'rechazado',
  notWritten: 'no se escribió',
} as const

/** Una fila del informe del cargador, tal como la devuelve la base. */
export type AwardReportRow = {
  daily_number: string | null
  weekly_number: string | null
  lottery_code: string | null
  reference_date: string | null
  matched_number: string | null
  prize_title: string | null
  amount: number | null
  in_kind_description: string | null
  outcome: string
  problem: string | null
}

const REPORT_TEXT_FIELDS = [
  'daily_number',
  'weekly_number',
  'lottery_code',
  'reference_date',
  'matched_number',
  'prize_title',
  'in_kind_description',
  'problem',
] as const

/**
 * Lee el informe de la base y comprueba su forma. Cualquier otra cosa se
 * rechaza: con un informe que no se entiende, no se decide nada.
 */
export function parseAwardsReport(data: unknown): AwardReportRow[] {
  const malformed = () =>
    new AwardsGateError('La base respondió algo que no es el informe del cargador.')
  if (!Array.isArray(data)) throw malformed()
  return data.map((raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw malformed()
    const record = raw as Record<string, unknown>
    const text = (key: string): string | null => {
      const value = record[key]
      if (value === null || value === undefined) return null
      if (typeof value !== 'string') throw malformed()
      return value
    }
    const amount = record.amount
    if (
      amount !== null &&
      amount !== undefined &&
      (typeof amount !== 'number' || !Number.isSafeInteger(amount))
    ) {
      throw malformed()
    }
    const outcome = text('outcome')
    if (outcome === null) throw malformed()
    const row = Object.fromEntries(REPORT_TEXT_FIELDS.map((key) => [key, text(key)])) as Omit<
      AwardReportRow,
      'amount' | 'outcome'
    >
    return { ...row, amount: amount ?? null, outcome }
  })
}

/** En qué momento se lee un informe: cada uno admite resultados distintos. */
export type AwardsPhase = 'preview' | 'apply' | 'reconcile'

const ALLOWED_OUTCOMES: Record<AwardsPhase, readonly string[]> = {
  preview: [AWARD_OUTCOME.wouldRecord, AWARD_OUTCOME.alreadyStored, AWARD_OUTCOME.rejected],
  apply: [AWARD_OUTCOME.recorded, AWARD_OUTCOME.alreadyStored],
  reconcile: [AWARD_OUTCOME.alreadyStored],
}

const PHASE_NAME: Record<AwardsPhase, string> = {
  preview: 'en una vista previa',
  apply: 'al aplicar',
  reconcile: 'en lo almacenado',
}

export type AwardsAssessment = {
  counts: {
    wouldRecord: number
    alreadyStored: number
    recorded: number
    rejected: number
  }
  /** Lo que el script ve mal al contrastar el informe con las entradas. */
  problems: string[]
  /** Dinero de las filas no rechazadas: lo que hay o lo que habría almacenado. */
  amount: number
}

function describeReward(amount: number | null, inKind: string | null): string {
  const parts = [amount === null ? null : formatCOP(amount), inKind].filter(
    (part): part is string => part !== null,
  )
  return parts.length === 0 ? 'nada' : parts.join(' y ')
}

/**
 * Contrasta un informe con las entradas, fila por fila y en su orden. No sustituye
 * a la base: dice si lo que la base respondió corresponde a lo que se pidió.
 */
export function assessAwardsReport(
  entries: readonly DeclaredPrizeAwardInput[],
  rows: readonly AwardReportRow[],
  phase: AwardsPhase,
): AwardsAssessment {
  const problems: string[] = []
  const counts = { wouldRecord: 0, alreadyStored: 0, recorded: 0, rejected: 0 }
  let amount = 0

  if (rows.length !== entries.length) {
    problems.push(`La base devolvió ${rows.length} filas para ${entries.length} entradas.`)
  }

  rows.forEach((row, index) => {
    const n = index + 1
    if (row.outcome === AWARD_OUTCOME.wouldRecord) counts.wouldRecord += 1
    else if (row.outcome === AWARD_OUTCOME.alreadyStored) counts.alreadyStored += 1
    else if (row.outcome === AWARD_OUTCOME.recorded) counts.recorded += 1
    else if (row.outcome === AWARD_OUTCOME.rejected) counts.rejected += 1

    if (!ALLOWED_OUTCOMES[phase].includes(row.outcome)) {
      problems.push(`Fila ${n}: «${row.outcome}» no es un resultado posible ${PHASE_NAME[phase]}.`)
    }

    const entry = entries[index]
    if (!entry) return
    if (
      row.daily_number !== entry.daily_number ||
      row.weekly_number !== entry.weekly_number ||
      row.lottery_code !== entry.lottery_code ||
      row.reference_date !== entry.reference_date ||
      row.prize_title !== entry.prize_title
    ) {
      problems.push(
        `Fila ${n}: no corresponde a la entrada ${n} (${entry.daily_number} / ${entry.weekly_number}, ${entry.lottery_code} ${entry.reference_date}).`,
      )
      return
    }

    if (row.outcome === AWARD_OUTCOME.rejected) {
      if (row.problem === null) problems.push(`Fila ${n}: rechazada sin decir por qué.`)
      return
    }
    if (row.problem !== null) {
      problems.push(`Fila ${n}: la base anotó un problema sin rechazarla: ${row.problem}`)
    }

    const expectedAmount = entry.amount ?? null
    const expectedInKind = entry.in_kind_description ?? null
    if (row.amount !== expectedAmount || row.in_kind_description !== expectedInKind) {
      problems.push(
        `Fila ${n}: la base tiene ${describeReward(row.amount, row.in_kind_description)} y la entrada dice ${describeReward(expectedAmount, expectedInKind)}.`,
      )
    }
    if (row.matched_number !== entry.daily_number && row.matched_number !== entry.weekly_number) {
      problems.push(`Fila ${n}: el número fotografiado no es ninguno de los dos de la boleta.`)
    }
    amount += row.amount ?? 0
  })

  return { counts, problems, amount }
}

/** La versión de la representación. Cambiarla invalida las huellas anteriores, a propósito. */
export const AWARDS_PREVIEW_FORMAT = 'record-prize-awards/v1'

/**
 * JSON con las claves de cada objeto ordenadas y sin espacios: la misma entrada
 * da siempre la misma cadena, venga en el orden que venga. Un `undefined` en un
 * objeto se omite; por eso las filas se normalizan antes con nulos explícitos.
 */
export function stableJson(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value)
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Un número no finito no tiene huella.')
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
    }
    default:
      throw new TypeError(`No se puede representar un valor de tipo ${typeof value}.`)
  }
}

function normalizedEntry(entry: DeclaredPrizeAwardInput) {
  return {
    daily_number: entry.daily_number,
    weekly_number: entry.weekly_number,
    lottery_code: entry.lottery_code,
    reference_date: entry.reference_date,
    prize_title: entry.prize_title,
    amount: entry.amount ?? null,
    in_kind_description: entry.in_kind_description ?? null,
  }
}

function normalizedRow(row: AwardReportRow) {
  return {
    daily_number: row.daily_number,
    weekly_number: row.weekly_number,
    lottery_code: row.lottery_code,
    reference_date: row.reference_date,
    matched_number: row.matched_number,
    prize_title: row.prize_title,
    amount: row.amount,
    in_kind_description: row.in_kind_description,
    outcome: row.outcome,
    problem: row.problem,
  }
}

/**
 * La HUELLA de una vista previa: destino, organización, respaldo, entradas y
 * todo lo que respondió la base, en ese orden de campos fijo. Si entre la
 * vista previa revisada y la de antes de aplicar cambia cualquiera de esas
 * cosas —otra ejecución reconoció un premio, se archivó el premio, se apunta a
 * otro proyecto—, la huella es otra y no se aplica nada.
 */
export function awardsPreviewHash(input: {
  target: AwardsTargetKind
  projectRef: string | null
  organizationId: string
  basis: string
  entries: readonly DeclaredPrizeAwardInput[]
  preview: readonly AwardReportRow[]
}): string {
  const representation = stableJson({
    formato: AWARDS_PREVIEW_FORMAT,
    destino: {
      tipo: input.target,
      proyecto: input.target === 'production' ? input.projectRef : null,
    },
    organizacion: input.organizationId.toLowerCase(),
    respaldo: input.basis,
    entradas: input.entries.map(normalizedEntry),
    vista_previa: input.preview.map(normalizedRow),
  })
  return createHash('sha256').update(representation, 'utf8').digest('hex')
}

/**
 * Antes de aplicar: la vista previa que se acaba de repetir tiene que ser la que
 * se revisó. En este cargador la huella se exige en los dos destinos.
 */
export function assertSamePreview(expected: string | null, current: string): void {
  if (expected === null) {
    throw new AwardsGateError(
      'Para aplicar hace falta la huella de una vista previa anterior (--preview-hash).',
    )
  }
  if (expected !== current) {
    throw new AwardsGateError(
      'La vista previa cambió desde la que revisaste —por ejemplo, porque otra ejecución ya reconoció alguno de estos premios o porque cambió la rifa—. No se escribió nada: vuelve a ejecutar la vista previa y revisa la nueva.',
    )
  }
}
