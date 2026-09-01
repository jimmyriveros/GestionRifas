/**
 * Plazo maximo de la lectura local del recuadro (D-155, BR-L25).
 *
 * Desde que el recuadro tiene su propio limite de Suspense, la respuesta HTTP
 * del Panel no se cierra hasta que ese limite resuelve. Si PostgREST dejara de
 * contestar, el resto de la pantalla ya estaria pintado —eso lo demuestra
 * `lottery-panel-streaming.test.tsx`—, pero la peticion quedaria colgada. El
 * plazo lo impide: se cancela de verdad y el recuadro cae en `error`.
 *
 * El doble de Supabase reproduce el encadenado real (`from().select()...`) y
 * anota que senal recibe cada consulta. Con eso se comprueba lo que importa:
 * que hay UNA sola senal para las dos, y que un aborto no revienta el Panel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LOTTERY_DASHBOARD_TIMEOUT_MS } from '@/features/lottery/dashboard'

type Respuesta = { data: unknown; error: unknown } | Error

const estado = vi.hoisted(() => ({
  signals: [] as AbortSignal[],
  tablas: [] as string[],
  respuestas: new Map<string, () => Respuesta>(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from(table: string) {
      estado.tablas.push(table)
      const chain: Record<string, unknown> = {}
      for (const metodo of ['select', 'gte', 'lte', 'order', 'in', 'eq']) {
        chain[metodo] = () => chain
      }
      chain.abortSignal = (signal: AbortSignal) => {
        estado.signals.push(signal)
        return chain
      }
      chain.then = (
        onFulfilled: (value: unknown) => unknown,
        onRejected: (reason: unknown) => unknown,
      ) => {
        const respuesta = estado.respuestas.get(table)?.() ?? { data: [], error: null }
        return respuesta instanceof Error
          ? Promise.reject(respuesta).then(onFulfilled, onRejected)
          : Promise.resolve(respuesta).then(onFulfilled, onRejected)
      }
      return chain
    },
  }),
}))

const { getLotteryDashboard } = await import('@/features/lottery/queries')

/**
 * Lo que lanza `fetch` cuando la senal aborta. Se fabrica a mano y no con
 * `DOMException`: jsdom trae la suya y no hereda de `Error`, asi que el doble
 * no la distinguiria de una respuesta.
 */
function abortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

beforeEach(() => {
  estado.signals = []
  estado.tablas = []
  estado.respuestas = new Map()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('la lectura del recuadro esta acotada en el tiempo (D-155)', () => {
  it('el plazo se pide una sola vez y las dos consultas comparten la misma senal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    estado.respuestas.set('lottery_draw_schedules', () => ({
      data: [
        {
          id: 'schedule-1',
          lottery_code: 'meta',
          draw_number: '2800',
          reference_date: '2026-09-01',
          original_scheduled_at: '2026-09-01T22:50:00-05:00',
          official_scheduled_at: '2026-09-01T22:50:00-05:00',
          schedule_status: 'scheduled',
          change_reason: null,
          source_url: null,
          source_authority: 'CNJSA',
          verified_at: null,
          lottery_results: {
            id: 'result-1',
            winning_number: '0046',
            series: null,
            validation_status: 'confirmed',
            source_url: null,
            fetched_at: '2026-09-01T23:10:00-05:00',
            confirmed_at: '2026-09-01T23:10:00-05:00',
          },
        },
      ],
      error: null,
    }))

    const dashboard = await getLotteryDashboard(new Date('2026-09-01T12:00:00-05:00'))

    expect(dashboard.kind).not.toBe('error')
    expect(estado.tablas).toEqual(['lottery_draw_schedules', 'lottery_ticket_matches'])
    expect(timeout).toHaveBeenCalledTimes(1)
    expect(timeout).toHaveBeenCalledWith(LOTTERY_DASHBOARD_TIMEOUT_MS)
    expect(estado.signals).toHaveLength(2)
    expect(estado.signals[0], 'las dos consultas comparten presupuesto').toBe(estado.signals[1])
  })

  it('si el plazo vence, el recuadro cae en error y el Panel no revienta', async () => {
    estado.respuestas.set('lottery_draw_schedules', () => abortError())

    const dashboard = await getLotteryDashboard()

    expect(dashboard).toEqual({ kind: 'error' })
  })

  it('tambien si vence durante la segunda consulta, la de las coincidencias', async () => {
    estado.respuestas.set('lottery_draw_schedules', () => ({
      data: [
        {
          id: 'schedule-1',
          lottery_code: 'meta',
          draw_number: '2800',
          reference_date: '2026-09-01',
          original_scheduled_at: null,
          official_scheduled_at: null,
          schedule_status: 'schedule_unverified',
          change_reason: null,
          source_url: null,
          source_authority: null,
          verified_at: null,
          lottery_results: {
            id: 'result-1',
            winning_number: '0046',
            series: null,
            validation_status: 'confirmed',
            source_url: null,
            fetched_at: '2026-09-01T23:10:00-05:00',
            confirmed_at: '2026-09-01T23:10:00-05:00',
          },
        },
      ],
      error: null,
    }))
    estado.respuestas.set('lottery_ticket_matches', () => abortError())

    const dashboard = await getLotteryDashboard()

    expect(dashboard).toEqual({ kind: 'error' })
  })
})
