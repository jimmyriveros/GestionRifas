/**
 * Un corte pasajero de Supabase en el catalogo publico (BR-K15, D-196, I-114).
 *
 * Primero la regla pura —que cuenta como pasajero y cuantas veces se repite— y
 * despues la lectura de verdad, `getPublicCatalog`, con el cliente de Supabase
 * sustituido por un doble que responde lo que se le pide, llamada a llamada.
 * El caso que la origino: el 2026-09-13 una llamada devolvio
 * `504 {"message":"Gateway Timeout"}` y la pagina respondio 500.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CATALOG_READ_RETRY_DELAY_MS,
  isTransientReadFailure,
  retryTransientReadOnce,
} from '@/features/catalog/read-retry'

type Result = { data: unknown; error: unknown; status: number }

const doble = vi.hoisted(() => ({
  respuestas: new Map<string, Result[]>(),
  llamadas: [] as string[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc(fn: string) {
      doble.llamadas.push(fn)
      // La cola se consume hasta su ultima respuesta, que se repite a partir de ahi.
      const cola = doble.respuestas.get(fn) ?? []
      const respuesta = cola.length > 1 ? cola.shift() : cola[0]
      return Promise.resolve(respuesta ?? { data: [], error: null, status: 200 })
    },
  }),
}))

const { getPublicCatalog } = await import('@/features/catalog/queries')

const GATEWAY_TIMEOUT: Result = { data: null, error: { message: 'Gateway Timeout' }, status: 504 }
const SIN_RED: Result = { data: null, error: { message: 'TypeError: fetch failed' }, status: 0 }
const VENDEDOR: Result = {
  data: [
    {
      seller_name: 'Ana Torres',
      seller_alias: null,
      whatsapp_number: '573001234567',
      raffle_name: 'Rifa Navidad 2026',
      ticket_price: 120000,
      available_count: 2,
      taken_count: 1,
    },
  ],
  error: null,
  status: 200,
}
const BOLETAS: Result = {
  data: [{ daily_number: '0046', weekly_number: '1234' }],
  error: null,
  status: 200,
}

function llamadasA(fn: string): number {
  return doble.llamadas.filter((llamada) => llamada === fn).length
}

beforeEach(() => {
  doble.respuestas = new Map()
  doble.llamadas = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('qué cuenta como un corte pasajero', () => {
  it('el gateway, el balanceador y la red', () => {
    for (const status of [0, 502, 503, 504, 520, 522, 524]) {
      expect(isTransientReadFailure({ error: { message: 'x' }, status }), String(status)).toBe(true)
    }
  })

  it('una respuesta de la base no: repetirla daría lo mismo', () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      expect(isTransientReadFailure({ error: { message: 'x' }, status }), String(status)).toBe(
        false,
      )
    }
  })

  it('sin error no hay nada que repetir, aunque el estado sea raro', () => {
    expect(isTransientReadFailure({ error: null, status: 504 })).toBe(false)
  })
})

describe('se repite UNA sola vez', () => {
  it('si la segunda sale bien, se devuelve esa', async () => {
    const read = vi.fn().mockResolvedValueOnce(GATEWAY_TIMEOUT).mockResolvedValueOnce(BOLETAS)
    const wait = vi.fn(async () => undefined)

    await expect(retryTransientReadOnce(read, wait)).resolves.toBe(BOLETAS)
    expect(read).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(CATALOG_READ_RETRY_DELAY_MS)
  })

  it('si la primera sale bien, ni se espera ni se repite', async () => {
    const read = vi.fn().mockResolvedValue(BOLETAS)
    const wait = vi.fn(async () => undefined)

    await expect(retryTransientReadOnce(read, wait)).resolves.toBe(BOLETAS)
    expect(read).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })

  it('si el corte sigue, devuelve el segundo fallo y no insiste más', async () => {
    const read = vi.fn().mockResolvedValue(GATEWAY_TIMEOUT)
    const wait = vi.fn(async () => undefined)

    await expect(retryTransientReadOnce(read, wait)).resolves.toBe(GATEWAY_TIMEOUT)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('un error de la base no se repite', async () => {
    const denegado: Result = { data: null, error: { message: 'permission denied' }, status: 401 }
    const read = vi.fn().mockResolvedValue(denegado)
    const wait = vi.fn(async () => undefined)

    await expect(retryTransientReadOnce(read, wait)).resolves.toBe(denegado)
    expect(read).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })
})

describe('la lectura del catálogo público', () => {
  it('un 504 de Supabase ya no tumba la página: la segunda llamada la salva', async () => {
    vi.useFakeTimers()
    doble.respuestas.set('public_catalog_seller', [GATEWAY_TIMEOUT, VENDEDOR])
    doble.respuestas.set('public_catalog_tickets', [BOLETAS])

    const promesa = getPublicCatalog({ slug: 'ana-torres' })
    await vi.advanceTimersByTimeAsync(CATALOG_READ_RETRY_DELAY_MS)
    const catalogo = await promesa

    expect(catalogo?.sellerName).toBe('Ana Torres')
    expect(catalogo?.tickets).toEqual([{ dailyNumber: '0046', weeklyNumber: '1234' }])
    expect(llamadasA('public_catalog_seller')).toBe(2)
    expect(llamadasA('public_catalog_tickets')).toBe(1)
  })

  it('también un fallo de red en la lectura de las boletas', async () => {
    vi.useFakeTimers()
    doble.respuestas.set('public_catalog_seller', [VENDEDOR])
    doble.respuestas.set('public_catalog_tickets', [SIN_RED, BOLETAS])

    const promesa = getPublicCatalog({ slug: 'ana-torres', page: 1 })
    await vi.advanceTimersByTimeAsync(CATALOG_READ_RETRY_DELAY_MS)

    await expect(promesa).resolves.toMatchObject({ sellerName: 'Ana Torres' })
    expect(llamadasA('public_catalog_tickets')).toBe(2)
  })

  it('si el corte sigue, lanza, y lo recoge la página de error del catálogo', async () => {
    vi.useFakeTimers()
    doble.respuestas.set('public_catalog_seller', [GATEWAY_TIMEOUT])
    doble.respuestas.set('public_catalog_tickets', [BOLETAS])

    const promesa = getPublicCatalog({ slug: 'ana-torres' })
    const rechazo = expect(promesa).rejects.toMatchObject({ message: 'Gateway Timeout' })
    await vi.advanceTimersByTimeAsync(CATALOG_READ_RETRY_DELAY_MS)

    await rechazo
    expect(llamadasA('public_catalog_seller')).toBe(2)
  })

  it('un catálogo que no existe sigue siendo «no encontrado», sin reintentos', async () => {
    doble.respuestas.set('public_catalog_seller', [{ data: [], error: null, status: 200 }])
    doble.respuestas.set('public_catalog_tickets', [{ data: [], error: null, status: 200 }])

    await expect(getPublicCatalog({ slug: 'no-existe' })).resolves.toBeNull()
    expect(doble.llamadas).toHaveLength(2)
  })
})
