/**
 * Una línea en el registro del servidor cuando una llamada a Supabase es lenta o falla (I-190, I-198; D-251).
 *
 * POR QUÉ. Los registros de Vercel de este plan no guardan cuánto tardó una petición. De una pantalla lenta no se
 * puede saber si la espera fue la red de quien navega (I-203), una instancia recién creada o Supabase —que tiene
 * abierto un incidente de latencia para lo que sale del este de EE. UU., donde corren estas funciones—. Con esta
 * línea, la hora de una queja se contrasta con el registro.
 *
 * QUÉ ESCRIBE, y solo entonces: el método, la RUTA —la tabla o la función, `/rest/v1/rpc/search_tickets`—, el estado
 * y los milisegundos, cuando la llamada tarda `SLOW_SUPABASE_CALL_MS` o más, responde 5xx o no responde. Nada más:
 * ni el host, ni la consulta —lleva filtros con nombres o teléfonos—, ni cabeceras —llevan la clave y el token—, ni
 * cuerpos. No hace ninguna llamada nueva: envuelve la que ya se hacía. No manda nada a ningún servicio.
 *
 * QUÉ CUESTA: dos lecturas del reloj por llamada (medido en `TEST_RESULTS`, D-251).
 */
export const SLOW_SUPABASE_CALL_MS = 1000

/** El prefijo de la línea, para encontrarla en el registro. */
export const SUPABASE_TIMING_TAG = '[rifas:supabase]'

/** La ruta de la llamada, sin el host ni la consulta. */
export function supabaseCallPath(input: RequestInfo | URL): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  try {
    return new URL(raw).pathname
  } catch {
    return '(dirección no válida)'
  }
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase()
  if (typeof input === 'object' && 'method' in input && input.method)
    return input.method.toUpperCase()
  return 'GET'
}

/**
 * Un `fetch` que mide cada llamada y avisa de las lentas o fallidas. `base` y `now` solo se pasan en las pruebas.
 */
export function timedFetch(
  base: typeof fetch = fetch,
  now: () => number = () => performance.now(),
  log: (line: string) => void = (line) => console.warn(line),
): typeof fetch {
  return async (input, init) => {
    const started = now()
    try {
      const response = await base(input, init)
      const ms = Math.round(now() - started)
      if (ms >= SLOW_SUPABASE_CALL_MS || response.status >= 500) {
        log(
          `${SUPABASE_TIMING_TAG} ${methodOf(input, init)} ${supabaseCallPath(input)} → ${response.status} en ${ms} ms`,
        )
      }
      return response
    } catch (error) {
      const ms = Math.round(now() - started)
      log(
        `${SUPABASE_TIMING_TAG} ${methodOf(input, init)} ${supabaseCallPath(input)} → sin respuesta tras ${ms} ms`,
      )
      throw error
    }
  }
}
