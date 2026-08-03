import { TICKET_NUMBER_REGEX } from '@/lib/constants'

import type { BulkTicketRow } from '../schemas'

/**
 * Validacion por fila de la creacion masiva (CLAUDE.md 15, BR-N10).
 *
 * Funciones puras y sin dependencias: se ejecutan en el navegador mientras se
 * escribe y en el servidor antes de guardar, con exactamente el mismo
 * resultado. La tercera capa, la restriccion `tickets_combo_unique`, es la que
 * decide de verdad.
 *
 * Los numeros se comparan como TEXTO: `0007/0012` y `7/12` son combinaciones
 * DISTINTAS y ambas pueden existir (BR-N03).
 */

export type RowValidation = {
  index: number
  dailyError?: string
  weeklyError?: string
  rowError?: string
}

export function comboKey(dailyNumber: string, weeklyNumber: string): string {
  return `${dailyNumber}/${weeklyNumber}`
}

/** Fila completa = tiene los dos numeros. Una fila vacia se guarda como borrador. */
export function isComplete(row: BulkTicketRow): boolean {
  return row.dailyNumber !== '' && row.weeklyNumber !== ''
}

export function isEmptyRow(row: BulkTicketRow): boolean {
  return row.dailyNumber === '' && row.weeklyNumber === ''
}

export type ValidateOptions = {
  /** Combinaciones que ya existen en la rifa, en formato `daily/weekly`. */
  existingCombos?: ReadonlySet<string>
}

export function validateBulkRows(
  rows: readonly BulkTicketRow[],
  options: ValidateOptions = {},
): RowValidation[] {
  const existing = options.existingCombos ?? new Set<string>()

  // Primera pasada: donde aparecio por primera vez cada combinacion completa.
  const firstSeen = new Map<string, number>()
  rows.forEach((row, index) => {
    if (!isComplete(row)) return
    const key = comboKey(row.dailyNumber, row.weeklyNumber)
    if (!firstSeen.has(key)) firstSeen.set(key, index)
  })

  return rows.map((row, index) => {
    const validation: RowValidation = { index }

    const dailyFilled = row.dailyNumber !== ''
    const weeklyFilled = row.weeklyNumber !== ''

    if (dailyFilled && !TICKET_NUMBER_REGEX.test(row.dailyNumber)) {
      validation.dailyError = 'Entre 1 y 4 digitos.'
    }
    if (weeklyFilled && !TICKET_NUMBER_REGEX.test(row.weeklyNumber)) {
      validation.weeklyError = 'Entre 1 y 4 digitos.'
    }

    // BR-N09: o los dos numeros, o ninguno (fila en borrador).
    if (dailyFilled !== weeklyFilled) {
      validation.rowError =
        'Completa los dos numeros o deja la fila vacia para guardarla como borrador.'
      return validation
    }

    if (validation.dailyError || validation.weeklyError) return validation
    if (!isComplete(row)) return validation

    const key = comboKey(row.dailyNumber, row.weeklyNumber)

    // BR-N04: duplicado dentro del propio formulario.
    const first = firstSeen.get(key)
    if (first !== undefined && first !== index) {
      validation.rowError = `Combinacion repetida en la fila ${first + 1}.`
      return validation
    }

    // BR-N05/BR-N08: la combinacion ya existe en la rifa, sin importar de que
    // vendedor sea ni si esa boleta fue anulada.
    if (existing.has(key)) {
      validation.rowError = 'Esa combinacion ya existe en esta rifa.'
    }

    return validation
  })
}

export function hasErrors(validations: readonly RowValidation[]): boolean {
  return validations.some((item) => item.dailyError || item.weeklyError || item.rowError)
}

export function countErrors(validations: readonly RowValidation[]): number {
  return validations.filter((item) => item.dailyError || item.weeklyError || item.rowError).length
}

/** Filas listas para enviar: sin errores. Incluye las vacias (borradores). */
export function selectSendableRows(
  rows: readonly BulkTicketRow[],
  validations: readonly RowValidation[],
): { row: BulkTicketRow; index: number }[] {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => {
      const validation = validations[index]
      return !validation?.dailyError && !validation?.weeklyError && !validation?.rowError
    })
}
