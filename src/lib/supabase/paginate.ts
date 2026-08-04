import 'server-only'

/**
 * Lectura completa de una consulta paginando con `range()`.
 *
 * POR QUE EXISTE (I-011)
 *
 * PostgREST corta TODA respuesta en 1.000 filas (`max_rows`) y no avisa: se
 * reciben 1.000 filas y un `error` nulo, exactamente igual que si esas fueran
 * todas. Cualquier exportacion a CSV o cualquier agregado hecho sobre el
 * resultado quedaria silenciosamente incompleto en cuanto la organizacion pase
 * de mil boletas. Ese fallo es invisible en desarrollo, donde nunca hay tantas.
 *
 * Aqui se pide por bloques hasta que un bloque venga incompleto, que es la
 * unica senal fiable de haber llegado al final.
 */

/** Tamano de bloque. Coincide con el `max_rows` de PostgREST: pedir mas no trae mas. */
const CHUNK_SIZE = 1000

/**
 * Tope de seguridad de una exportacion.
 *
 * Sin el, un CSV sin filtros sobre una organizacion grande cargaria toda la
 * tabla en la memoria del servidor. 50.000 filas son de sobra para el volumen
 * real de este negocio (50 rifas de 1.000 boletas) y acotan el gasto.
 */
export const EXPORT_ROW_LIMIT = 50_000

export type RangeQuery<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * Ejecuta `query` por bloques y devuelve todas las filas.
 *
 * @param query Closure que aplica `.range(from, to)` a la consulta ya filtrada
 *              y ORDENADA. Sin un orden estable, dos bloques consecutivos
 *              pueden repetir u omitir filas.
 * @param limit Tope de filas; al alcanzarlo se deja de pedir.
 *
 * `truncated` es conservador: si el total fuera EXACTAMENTE `limit`, se marca
 * como truncado aunque no falte nada. Saberlo con certeza costaria una peticion
 * mas, y el error cae del lado seguro —avisar de mas nunca oculta filas—, que
 * es justamente lo que se busca aqui.
 */
export async function fetchAllRows<T>(
  query: RangeQuery<T>,
  limit: number = EXPORT_ROW_LIMIT,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []

  while (rows.length < limit) {
    const from = rows.length
    const to = Math.min(from + CHUNK_SIZE, limit) - 1

    const { data, error } = await query(from, to)
    if (error) throw error

    const batch = data ?? []
    rows.push(...batch)

    // Un bloque incompleto significa que ya no hay mas filas que pedir.
    if (batch.length < to - from + 1) return { rows, truncated: false }
  }

  return { rows, truncated: true }
}
