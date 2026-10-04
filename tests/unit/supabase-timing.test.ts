/**
 * D-251: la línea del registro cuando una llamada a Supabase es lenta o falla (`src/lib/supabase/timing.ts`).
 *
 * Lo que importa probar: que solo escribe cuando hace falta, que lo que escribe no lleva el host, la consulta, las
 * cabeceras ni el cuerpo —la consulta puede llevar el nombre o el teléfono de un cliente; las cabeceras, la clave y el
 * token—, que la llamada sigue siendo la misma y que un fallo de red se vuelve a lanzar tal cual.
 */
import { describe, expect, it, vi } from 'vitest'

import { SLOW_SUPABASE_CALL_MS, supabaseCallPath, timedFetch } from '@/lib/supabase/timing'

const URL_CON_FILTRO =
  'http://127.0.0.1:54321/rest/v1/clients?select=id%2Cname&name=ilike.*Ana%20Sint%C3%A9tica*&phone=eq.3001234567'
const CABECERAS = { apikey: 'clave-sintetica', Authorization: 'Bearer token-sintetico' }

/** Un reloj que avanza lo que se le diga entre la primera y la segunda lectura. */
function reloj(ms: number) {
  let lecturas = 0
  return () => (lecturas++ === 0 ? 1_000 : 1_000 + ms)
}

function respuesta(status: number) {
  return new Response('{"datos":"sinteticos"}', { status })
}

describe('D-251: cuándo escribe', () => {
  it('una llamada rápida y correcta no escribe nada y devuelve la misma respuesta', async () => {
    const base = vi.fn(async () => respuesta(200))
    const log = vi.fn()
    const r = await timedFetch(base, reloj(40), log)(URL_CON_FILTRO, { headers: CABECERAS })
    expect(r.status).toBe(200)
    expect(await r.text()).toBe('{"datos":"sinteticos"}')
    expect(base).toHaveBeenCalledWith(URL_CON_FILTRO, { headers: CABECERAS })
    expect(log).not.toHaveBeenCalled()
  })

  it(`una llamada de ${SLOW_SUPABASE_CALL_MS} ms o más escribe UNA línea con método, ruta, estado y tiempo`, async () => {
    const log = vi.fn()
    await timedFetch(
      async () => respuesta(200),
      reloj(SLOW_SUPABASE_CALL_MS),
      log,
    )('http://127.0.0.1:54321/rest/v1/rpc/search_tickets', {
      method: 'post',
      body: '{"p_term":"Ana"}',
      headers: CABECERAS,
    })
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      '[rifas:supabase] POST /rest/v1/rpc/search_tickets → 200 en 1000 ms',
    )
  })

  it('un 5xx escribe aunque sea rápido; un 4xx rápido, no', async () => {
    const log = vi.fn()
    await timedFetch(async () => respuesta(503), reloj(12), log)(URL_CON_FILTRO)
    await timedFetch(async () => respuesta(401), reloj(12), log)(URL_CON_FILTRO)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('[rifas:supabase] GET /rest/v1/clients → 503 en 12 ms')
  })

  it('un fallo de red escribe «sin respuesta» y se vuelve a lanzar el mismo error', async () => {
    const log = vi.fn()
    const error = new TypeError('fetch failed')
    const llamada = timedFetch(
      async () => {
        throw error
      },
      reloj(8_000),
      log,
    )('http://127.0.0.1:54321/auth/v1/user', { headers: CABECERAS })
    await expect(llamada).rejects.toBe(error)
    expect(log).toHaveBeenCalledWith(
      '[rifas:supabase] GET /auth/v1/user → sin respuesta tras 8000 ms',
    )
  })
})

describe('D-251: lo que nunca escribe', () => {
  it('ni el host, ni la consulta, ni la clave, ni el token, ni el cuerpo', async () => {
    const log = vi.fn()
    await timedFetch(
      async () => respuesta(200),
      reloj(2_500),
      log,
    )(URL_CON_FILTRO, {
      method: 'POST',
      headers: CABECERAS,
      body: '{"name":"Ana Sintética"}',
    })
    const linea = String(log.mock.calls[0]?.[0])
    for (const secreto of [
      '127.0.0.1',
      '54321',
      '?',
      'select',
      'Ana',
      'Sint',
      '3001234567',
      'clave',
      'token',
      'Bearer',
    ]) {
      expect(linea).not.toContain(secreto)
    }
    expect(linea).toBe('[rifas:supabase] POST /rest/v1/clients → 200 en 2500 ms')
  })

  it('la ruta sale igual de una cadena, de una URL y de un Request', () => {
    expect(supabaseCallPath(URL_CON_FILTRO)).toBe('/rest/v1/clients')
    expect(supabaseCallPath(new URL(URL_CON_FILTRO))).toBe('/rest/v1/clients')
    expect(supabaseCallPath(new Request(URL_CON_FILTRO))).toBe('/rest/v1/clients')
    expect(supabaseCallPath('no es una dirección')).toBe('(dirección no válida)')
  })

  it('el método de un Request también se respeta', async () => {
    const log = vi.fn()
    await timedFetch(
      async () => respuesta(500),
      reloj(5),
      log,
    )(new Request('http://127.0.0.1:54321/rest/v1/rpc/x', { method: 'PATCH' }))
    expect(log).toHaveBeenCalledWith('[rifas:supabase] PATCH /rest/v1/rpc/x → 500 en 5 ms')
  })
})
