import { TICKET_NUMBER_REGEX } from '@/lib/constants'
import { groupNumberProblem, type RaffleNumberFormat } from '@/lib/ticket-number-format'

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

/**
 * Por que falla una fila, aparte del mensaje.
 *
 * El mensaje esta escrito para leerse; esto es para decidir. La importacion de
 * archivos necesita separar «repetida dentro del archivo» de «ya existe en la
 * rifa» para contarlas por separado y ofrecer acciones distintas, y deducirlo
 * comparando textos seria fragil. Es informacion ANADIDA: las reglas y los
 * mensajes no cambian, y quien no lo mire sigue funcionando igual.
 */
export type RowProblem =
  /** Un numero no cumple el formato de 1 a 4 digitos. */
  | 'format'
  /** Falta uno de los dos numeros. */
  | 'incomplete'
  /** La combinacion se repite dentro del mismo lote o archivo. */
  | 'duplicate'
  /** La combinacion ya existe en la rifa, sea de quien sea. */
  | 'taken'

export type RowValidation = {
  index: number
  dailyError?: string
  weeklyError?: string
  rowError?: string
  problem?: RowProblem
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
  /**
   * D-261: los numeros de la rifa —cuantos y con cuantas cifras exactas—. Con
   * el, cada numero se valida contra su grupo con la frase de la base, y en una
   * rifa de un solo numero la fila esta completa con ese numero. Sin el, la
   * regla de antes (1 a 4 cifras, los dos numeros): solo la usan pruebas viejas.
   */
  format?: RaffleNumberFormat
  /** Combinaciones que ya existen en la rifa, en formato `daily/weekly`. */
  existingCombos?: ReadonlySet<string>
  /**
   * Exige los dos numeros en todas las filas. Lo usa la creacion por parte del
   * vendedor: sus boletas nacen en `pending_approval`, y ese estado no admite
   * numeros vacios (BR-N09). Solo el personal puede guardar borradores.
   */
  requireComplete?: boolean
}

export function validateBulkRows(
  rows: readonly BulkTicketRow[],
  options: ValidateOptions = {},
): RowValidation[] {
  if (options.format) return validateWithFormat(rows, options.format, options)
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
      validation.dailyError = 'Entre 1 y 4 dígitos.'
      validation.problem = 'format'
    }
    if (weeklyFilled && !TICKET_NUMBER_REGEX.test(row.weeklyNumber)) {
      validation.weeklyError = 'Entre 1 y 4 dígitos.'
      validation.problem = 'format'
    }

    // BR-N09: o los dos numeros, o ninguno (fila en borrador).
    if (dailyFilled !== weeklyFilled) {
      validation.rowError = options.requireComplete
        ? 'Escribe los dos números.'
        : 'Completa los dos números o deja la fila vacía para guardarla como borrador.'
      validation.problem = 'incomplete'
      return validation
    }

    if (options.requireComplete && !dailyFilled && !weeklyFilled) {
      validation.rowError = 'Escribe los dos números.'
      validation.problem = 'incomplete'
      return validation
    }

    if (validation.dailyError || validation.weeklyError) return validation
    if (!isComplete(row)) return validation

    const key = comboKey(row.dailyNumber, row.weeklyNumber)

    // BR-N04: duplicado dentro del propio formulario.
    const first = firstSeen.get(key)
    if (first !== undefined && first !== index) {
      validation.rowError = `Combinación repetida en la fila ${first + 1}.`
      validation.problem = 'duplicate'
      return validation
    }

    // BR-N05/BR-N08: la combinacion ya existe en la rifa, sin importar de que
    // vendedor sea ni si esa boleta fue anulada.
    if (existing.has(key)) {
      validation.rowError = 'Esa combinación ya existe en esta rifa.'
      validation.problem = 'taken'
    }

    return validation
  })
}

/** Una fila tiene TODOS los numeros de su rifa. */
export function isCompleteFor(row: BulkTicketRow, format: RaffleNumberFormat | undefined): boolean {
  if (format?.groups.length === 1) return row.dailyNumber !== ''
  return isComplete(row)
}

/** La clave de unicidad de una fila: con un numero, el numero solo (D-261). */
export function comboKeyFor(row: BulkTicketRow, format: RaffleNumberFormat | undefined): string {
  return format?.groups.length === 1 ? comboKey(row.dailyNumber, '') : comboKey(row.dailyNumber, row.weeklyNumber)
}

/**
 * La validacion con la estructura de la rifa (D-261). El mismo orden que la de
 * siempre —formato, completitud, repetida, tomada— y las mismas salidas; las
 * frases del formato son las de la base (`ticket_numbers_problem`).
 */
function validateWithFormat(
  rows: readonly BulkTicketRow[],
  format: RaffleNumberFormat,
  options: ValidateOptions,
): RowValidation[] {
  const existing = options.existingCombos ?? new Set<string>()
  const single = format.groups.length === 1
  const [first, second] = format.groups

  const firstSeen = new Map<string, number>()
  rows.forEach((row, index) => {
    if (!isCompleteFor(row, format)) return
    const key = comboKeyFor(row, format)
    if (!firstSeen.has(key)) firstSeen.set(key, index)
  })

  return rows.map((row, index) => {
    const validation: RowValidation = { index }
    const dailyFilled = row.dailyNumber !== ''
    const weeklyFilled = !single && row.weeklyNumber !== ''

    const dailyError = groupNumberProblem(first, dailyFilled ? row.dailyNumber : null, false)
    if (dailyError) {
      validation.dailyError = dailyError
      validation.problem = 'format'
    }
    if (second) {
      const weeklyError = groupNumberProblem(second, weeklyFilled ? row.weeklyNumber : null, false)
      if (weeklyError) {
        validation.weeklyError = weeklyError
        validation.problem = 'format'
      }
    }

    if (single) {
      if (options.requireComplete && !dailyFilled) {
        validation.rowError = `Escribe el número «${first.name}».`
        validation.problem = 'incomplete'
        return validation
      }
    } else {
      // BR-N09: o los dos numeros, o ninguno (fila en borrador).
      if (dailyFilled !== weeklyFilled) {
        validation.rowError = options.requireComplete
          ? 'Escribe los dos números.'
          : 'Completa los dos números o deja la fila vacía para guardarla como borrador.'
        validation.problem = 'incomplete'
        return validation
      }
      if (options.requireComplete && !dailyFilled) {
        validation.rowError = 'Escribe los dos números.'
        validation.problem = 'incomplete'
        return validation
      }
    }

    if (validation.dailyError || validation.weeklyError) return validation
    if (!isCompleteFor(row, format)) return validation

    const key = comboKeyFor(row, format)
    const seen = firstSeen.get(key)
    if (seen !== undefined && seen !== index) {
      validation.rowError = single
        ? `Número repetido en la fila ${seen + 1}.`
        : `Combinación repetida en la fila ${seen + 1}.`
      validation.problem = 'duplicate'
      return validation
    }

    if (existing.has(key)) {
      validation.rowError = single
        ? 'Ese número ya existe en esta rifa.'
        : 'Esa combinación ya existe en esta rifa.'
      validation.problem = 'taken'
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
