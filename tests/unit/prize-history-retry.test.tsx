/**
 * «Reintentar» en el historial de un premio (D-202).
 *
 * El defecto que motivó esta suite: el botón hacía `setPage(page)` con el mismo
 * número, React no volvía a ejecutar el efecto y el historial se quedaba en el
 * aviso de error para siempre. Aquí se monta el diálogo de verdad, con la Server
 * Action sustituida, y se comprueba lo que ve la persona:
 *
 *   1. primera lectura fallida → aviso con «Reintentar»;
 *   2. al pulsarlo, el aviso se va y se ve la espera;
 *   3. segunda lectura correcta → el historial, sin duplicados;
 *
 * además de repetir LA MISMA página después de cambiar de página, de reintentar
 * cuando la acción lanza —sin conexión— y de descartar la respuesta de una
 * petición anterior.
 *
 * El navegador de verdad está en `tests/e2e/premios*.spec.ts`.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrizeHistoryEntry, PrizeHistoryPage } from '@/features/raffle-prizes/actions'
import { PRIZE_HISTORY_COPY } from '@/features/raffle-prizes/copy'
import { singleDateRule } from '@/features/raffle-prizes/schedule'
import type { ActionResultWith } from '@/lib/action-result'

vi.mock('@/features/raffle-prizes/actions', () => ({ fetchPrizeHistory: vi.fn() }))

const actions = await import('@/features/raffle-prizes/actions')
const { PrizeHistoryDialog } =
  await import('@/features/raffle-prizes/components/PrizeHistoryDialog')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const fetchPrizeHistory = vi.mocked(actions.fetchPrizeHistory)

type Response = ActionResultWith<PrizeHistoryPage>

const PREMIO = {
  id: '11111111-2222-4333-8444-555555555551',
  title: 'Premio diario',
  versionId: 'version-2',
}
const OTRO_PREMIO = {
  id: '11111111-2222-4333-8444-555555555552',
  title: 'Premio mayor',
  versionId: 'mayor-1',
}

function entry(versionNumber: number, versionId = `version-${versionNumber}`): PrizeHistoryEntry {
  return {
    versionId,
    versionNumber,
    change: versionNumber === 1 ? 'created' : 'updated',
    status: 'active',
    title: 'Premio diario',
    category: 'daily',
    numberField: 'daily_number',
    digits: 'four',
    conditions: null,
    reward: { mode: 'fixed', options: [{ description: null, amount: 500_000 }] },
    rules: [singleDateRule('2026-12-21')],
    startsOn: '2026-12-21',
    endsOn: '2026-12-21',
    publishedAt: '2026-09-15T15:00:00Z',
    publishedByName: 'Dueño de prueba',
  }
}

function ok(
  entries: PrizeHistoryEntry[],
  page = 1,
  total = entries.length,
  pageSize = 20,
): Response {
  return { ok: true, data: { entries, total, page, pageSize } }
}

const FALLO: Response = { error: 'No pudimos cargar el historial.' }

/** Una promesa que la prueba resuelve cuando quiere ver el estado intermedio. */
function pendiente<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  fetchPrizeHistory.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function abrir(prize: { id: string; title: string; versionId: string } = PREMIO) {
  await act(async () =>
    root.render(<PrizeHistoryDialog open onOpenChange={() => undefined} prize={prize} />),
  )
}

/** El diálogo vive en un portal: se busca en todo el documento. */
function dialogo(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[role="dialog"]')
  if (!element) throw new Error('el diálogo no está abierto')
  return element
}

function boton(nombre: string): HTMLButtonElement | null {
  return (
    [...dialogo().querySelectorAll<HTMLButtonElement>('button')].find(
      (element) => element.textContent?.trim() === nombre,
    ) ?? null
  )
}

function texto(): string {
  return dialogo().textContent ?? ''
}

function versiones(): number {
  return dialogo().querySelectorAll('ol > li').length
}

function esperando(): boolean {
  return (
    dialogo().querySelector('[aria-busy="true"]') !== null &&
    texto().includes(PRIZE_HISTORY_COPY.loading)
  )
}

describe('«Reintentar» en el historial de un premio (D-202)', () => {
  it('una lectura fallida se reintenta, enseña la espera y después el historial', async () => {
    const segunda = pendiente<Response>()
    fetchPrizeHistory.mockResolvedValueOnce(FALLO).mockReturnValueOnce(segunda.promise)

    // 1. Primera lectura fallida.
    await abrir()
    expect(texto()).toContain(PRIZE_HISTORY_COPY.failed)
    expect(boton(PRIZE_HISTORY_COPY.retry)).not.toBeNull()
    expect(fetchPrizeHistory).toHaveBeenCalledTimes(1)

    // 2. «Reintentar»: el aviso desaparece en el acto y se ve la espera.
    await act(async () => boton(PRIZE_HISTORY_COPY.retry)!.click())
    expect(fetchPrizeHistory).toHaveBeenCalledTimes(2)
    expect(texto()).not.toContain(PRIZE_HISTORY_COPY.failed)
    expect(boton(PRIZE_HISTORY_COPY.retry)).toBeNull()
    expect(esperando()).toBe(true)

    // 3. Segunda lectura correcta: el historial, una vez cada versión.
    await act(async () => segunda.resolve(ok([entry(2), entry(1)])))
    expect(texto()).toContain('Versión 2')
    expect(texto()).toContain('Versión 1')
    expect(texto()).toContain(PRIZE_HISTORY_COPY.current)
    expect(versiones()).toBe(2)
    expect(esperando()).toBe(false)

    // Las dos lecturas pidieron LA MISMA página del mismo premio.
    expect(fetchPrizeHistory.mock.calls).toEqual([
      [{ prizeId: PREMIO.id, page: 1 }],
      [{ prizeId: PREMIO.id, page: 1 }],
    ])
  })

  it('si la acción lanza —sin conexión—, también se puede reintentar', async () => {
    fetchPrizeHistory
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok([entry(1)]))

    await abrir()
    expect(texto()).toContain(PRIZE_HISTORY_COPY.failed)

    await act(async () => boton(PRIZE_HISTORY_COPY.retry)!.click())
    expect(texto()).toContain('Versión 1')
    expect(versiones()).toBe(1)
  })

  it('un segundo fallo vuelve a ofrecer «Reintentar», y el tercer intento funciona', async () => {
    fetchPrizeHistory
      .mockResolvedValueOnce(FALLO)
      .mockResolvedValueOnce(FALLO)
      .mockResolvedValueOnce(ok([entry(1)]))

    await abrir()
    await act(async () => boton(PRIZE_HISTORY_COPY.retry)!.click())
    expect(texto()).toContain(PRIZE_HISTORY_COPY.failed)

    await act(async () => boton(PRIZE_HISTORY_COPY.retry)!.click())
    expect(texto()).toContain('Versión 1')
    expect(fetchPrizeHistory).toHaveBeenCalledTimes(3)
  })

  it('después de cambiar de página, «Reintentar» repite ESA página', async () => {
    const primera = Array.from({ length: 20 }, (_, index) => entry(25 - index))
    const segunda = Array.from({ length: 5 }, (_, index) => entry(5 - index))
    const reintento = pendiente<Response>()

    fetchPrizeHistory
      .mockResolvedValueOnce(ok(primera, 1, 25))
      .mockResolvedValueOnce(FALLO)
      .mockReturnValueOnce(reintento.promise)

    await abrir()
    expect(versiones()).toBe(20)

    await act(async () => boton(PRIZE_HISTORY_COPY.next)!.click())
    expect(texto()).toContain(PRIZE_HISTORY_COPY.failed)

    // Tras el fallo no hay nada válido que enseñar: ni la página 1 ni el error.
    await act(async () => boton(PRIZE_HISTORY_COPY.retry)!.click())
    expect(esperando()).toBe(true)
    expect(texto()).not.toContain('Versión 25')

    await act(async () => reintento.resolve(ok(segunda, 2, 25)))
    expect(versiones()).toBe(5)
    expect(texto()).toContain(PRIZE_HISTORY_COPY.counter(21, 25, 25))
    expect(texto()).not.toContain('Versión 25')

    expect(fetchPrizeHistory.mock.calls.map(([input]) => input)).toEqual([
      { prizeId: PREMIO.id, page: 1 },
      { prizeId: PREMIO.id, page: 2 },
      { prizeId: PREMIO.id, page: 2 },
    ])
  })

  it('mientras llega otra página se conserva la anterior, sin poder volver a pulsar', async () => {
    const segunda = pendiente<Response>()
    fetchPrizeHistory
      .mockResolvedValueOnce(ok([entry(2), entry(1)], 1, 25, 2))
      .mockReturnValueOnce(segunda.promise)

    await abrir()
    await act(async () => boton(PRIZE_HISTORY_COPY.next)!.click())

    expect(texto()).toContain('Versión 2')
    expect(boton(PRIZE_HISTORY_COPY.next)!.disabled).toBe(true)
    expect(boton(PRIZE_HISTORY_COPY.previous)!.disabled).toBe(true)
    expect(dialogo().querySelector('[aria-busy="true"]')).not.toBeNull()

    await act(async () => segunda.resolve(ok([entry(4, 'v-4'), entry(3, 'v-3')], 2, 25, 2)))
    expect(texto()).toContain('Versión 4')
    expect(texto()).not.toContain('Versión 1')
    expect(versiones()).toBe(2)
  })

  it('la respuesta de una petición anterior no pisa la vigente', async () => {
    const vieja = pendiente<Response>()
    fetchPrizeHistory
      .mockReturnValueOnce(vieja.promise)
      .mockResolvedValueOnce(ok([entry(1, 'mayor-1')]))

    // Se abre el historial de un premio y, antes de que conteste, el de otro.
    await abrir(PREMIO)
    await abrir(OTRO_PREMIO)
    expect(fetchPrizeHistory.mock.calls.map(([input]) => input)).toEqual([
      { prizeId: PREMIO.id, page: 1 },
      { prizeId: OTRO_PREMIO.id, page: 1 },
    ])
    expect(versiones()).toBe(1)

    // La del primero llega tarde, y con más versiones: no se pinta ni se suma.
    await act(async () => vieja.resolve(ok([entry(3), entry(2), entry(1)])))
    expect(versiones()).toBe(1)
    expect(texto()).not.toContain('Versión 3')
  })
})
