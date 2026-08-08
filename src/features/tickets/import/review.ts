import { comboKey, validateBulkRows, type RowValidation } from '../bulk/duplicates'
import type { ImportRow } from './rows'

/**
 * Revision de las filas leidas de un archivo: que se puede importar y que no.
 *
 * NO reimplementa ninguna regla. Llama a `validateBulkRows`, que es el mismo
 * motor que usan la carga masiva del personal y la creacion de boletas del
 * vendedor, y se limita a traducir su resultado a lo que la vista previa
 * necesita: un estado por fila, una frase que explique el problema y unos
 * totales.
 *
 * `requireComplete: true` siempre. Una fila importada a la que le falte un
 * numero es un error del archivo, no un borrador: nadie sube un archivo para
 * dejar boletas a medias, y en el caso del vendedor un borrador ni siquiera
 * seria valido (BR-N09).
 */

export type ImportRowStatus = 'valid' | 'duplicate' | 'taken' | 'invalid'

export type ReviewedRow = ImportRow & {
  status: ImportRowStatus
  /** Frase para la columna «Problema». Vacia cuando la fila esta bien. */
  problem: string
}

export type ImportReview = {
  rows: ReviewedRow[]
  total: number
  valid: number
  /** Repetidas dentro del propio archivo. */
  duplicates: number
  /** Su combinacion ya existe en la rifa. */
  taken: number
  /** Numeros mal escritos o filas incompletas. */
  invalid: number
}

/**
 * Frase unica para la columna «Problema».
 *
 * Los mensajes de `validateBulkRows` estan pensados para ir DEBAJO de un campo
 * («Entre 1 y 4 dígitos.»), donde ya se sabe de que numero se habla. En una
 * tabla hay que decirlo entero, asi que aqui se componen.
 */
function describe(validation: RowValidation | undefined): string {
  if (!validation) return ''

  const partes: string[] = []
  if (validation.dailyError) partes.push('El número diario debe tener entre 1 y 4 dígitos.')
  if (validation.weeklyError) partes.push('El número semanal debe tener entre 1 y 4 dígitos.')

  if (validation.problem === 'incomplete') {
    return 'A esta fila le falta uno de los dos números.'
  }
  if (partes.length > 0) return partes.join(' ')
  if (validation.rowError) return validation.rowError
  return ''
}

function statusOf(validation: RowValidation | undefined): ImportRowStatus {
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

/**
 * Revisa todas las filas de una vez.
 *
 * `existingCombos` son las combinaciones que ya existen en la rifa, obtenidas
 * en UNA consulta por lote (nunca una por fila). Puede venir vacio: entonces la
 * revision solo cubre formato y repeticiones dentro del archivo, y el choque
 * con la rifa lo dira la base de datos al guardar.
 */
export function reviewRows(
  rows: readonly ImportRow[],
  existingCombos: ReadonlySet<string> = new Set(),
): ImportReview {
  const validations = validateBulkRows(rows, { requireComplete: true, existingCombos })

  const reviewed: ReviewedRow[] = rows.map((row, index) => {
    const validation = validations[index]
    return { ...row, status: statusOf(validation), problem: describe(validation) }
  })

  const count = (status: ImportRowStatus) => reviewed.filter((row) => row.status === status).length

  return {
    rows: reviewed,
    total: reviewed.length,
    valid: count('valid'),
    duplicates: count('duplicate'),
    taken: count('taken'),
    invalid: count('invalid'),
  }
}

/** Solo las filas que se pueden guardar, en el orden del archivo. */
export function importableRows(review: ImportReview): ImportRow[] {
  return review.rows
    .filter((row) => row.status === 'valid')
    .map(({ rowNumber, dailyNumber, weeklyNumber }) => ({ rowNumber, dailyNumber, weeklyNumber }))
}

/** Las combinaciones de un conjunto de filas, en el formato `daily/weekly`. */
export function rowKeys(rows: readonly ImportRow[]): string[] {
  return rows
    .filter((row) => row.dailyNumber !== '' && row.weeklyNumber !== '')
    .map((row) => comboKey(row.dailyNumber, row.weeklyNumber))
}
