/**
 * Un corte PASAJERO de Supabase no llega al visitante del catalogo (BR-K15, D-196, I-114).
 *
 * POR QUE AQUI Y NO EN EL CLIENTE. `postgrest-js` ya reintenta, pero solo GET,
 * HEAD y OPTIONS, y solo ante 503 y 520. El catalogo lee con dos RPC que viajan
 * por POST, asi que no se reintentaba nada, y un `504 Gateway Timeout` como el
 * del 2026-09-13 llegaba tal cual a la pagina y la tumbaba. Tampoco se reintenta
 * en `createAdminClient`: ese cliente tambien escribe, y repetir una escritura
 * no es inocuo. Las dos funciones del catalogo son `stable` y de solo lectura:
 * repetirlas no cambia nada.
 *
 * UNA VEZ Y ENSEGUIDA. Un corte de segundos se salva con una segunda llamada; uno
 * de verdad no se arregla dejando al visitante mirando una pantalla en blanco, y
 * para eso esta la pagina de error del catalogo.
 */

/** La espera antes de la segunda llamada: lo justo para no repetir contra el mismo tropiezo. */
export const CATALOG_READ_RETRY_DELAY_MS = 400

/**
 * Lo que se considera pasajero: el gateway o el balanceador (502, 503, 504, y
 * los 520, 522 y 524 de Cloudflare) y la red, que `postgrest-js` anota con
 * estado 0. Un 4xx o un 500 son respuestas de la base —una regla, un error de
 * la funcion— y repetirlos daria lo mismo.
 */
const TRANSIENT_STATUS = new Set([0, 502, 503, 504, 520, 522, 524])

export type SupabaseReadResult = { error: unknown; status: number }

export function isTransientReadFailure(result: SupabaseReadResult): boolean {
  return result.error !== null && result.error !== undefined && TRANSIENT_STATUS.has(result.status)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Hace la lectura y, si falla por algo pasajero, la repite UNA vez. Devuelve el
 * resultado de la ultima llamada, bueno o malo: decidir que hacer con un error
 * sigue siendo cosa de quien llama.
 */
export async function retryTransientReadOnce<T extends SupabaseReadResult>(
  read: () => PromiseLike<T>,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  const first = await read()
  if (!isTransientReadFailure(first)) return first
  await wait(CATALOG_READ_RETRY_DELAY_MS)
  return read()
}
