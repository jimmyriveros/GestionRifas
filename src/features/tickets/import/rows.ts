import type { ColumnMapping } from './columns'
import type { CsvTable } from './csv'

/**
 * La fila tal y como entra al importador, venga de CSV o de JSON.
 *
 * Los dos numeros son SIEMPRE texto, de principio a fin del proceso (BR-N03).
 * Nada de `Number()`, `parseInt()` ni `parseFloat()`: «0046» convertido a
 * numero vuelve como 46, que es una boleta distinta y ademas puede existir por
 * separado.
 *
 * Tampoco se rellena con ceros: si el archivo dice «46», la boleta se llama
 * «46». El sistema guarda lo que el usuario escribio.
 */
export type ImportRow = {
  /** Numero de fila DE DATOS, contando desde 1 y sin el encabezado. */
  rowNumber: number
  dailyNumber: string
  weeklyNumber: string
}

/** Celda de una fila, recortada por los extremos y como texto. */
function cell(row: readonly string[], index: number): string {
  if (index < 0) return ''
  return (row[index] ?? '').trim()
}

/**
 * Pasa de la tabla del CSV a filas del importador, usando el mapeo de columnas.
 *
 * Las columnas que no estan en el mapeo —la numeracion «#», notas, cualquier
 * otra— no se leen: ignorarlas es no mirarlas.
 */
export function tableToRows(table: CsvTable, mapping: ColumnMapping): ImportRow[] {
  return table.rows.map((row, index) => ({
    rowNumber: index + 1,
    dailyNumber: cell(row, mapping.daily),
    weeklyNumber: cell(row, mapping.weekly),
  }))
}
