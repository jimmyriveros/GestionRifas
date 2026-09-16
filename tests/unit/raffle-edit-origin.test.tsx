/**
 * A dónde vuelve «Editar rifa» (D-202).
 *
 * El formulario se abre desde el detalle de la rifa y desde el paso de premios
 * del proceso de crearla. Guardar y cancelar vuelven a ese origen, que es una
 * LISTA CERRADA: ningún valor recibido en la URL —una dirección externa, una
 * ruta escrita a mano— puede decidir el destino.
 *
 * Primero lo puro (`edit-origin.ts`) y después el formulario montado con el
 * router y la acción sustituidos. El recorrido de verdad, con la página que
 * compone el destino, está en `tests/e2e/premios.spec.ts`.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  parseRaffleEditOrigin,
  raffleEditHref,
  raffleEditReturnHref,
} from '@/features/raffles/edit-origin'

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/features/raffles/actions', () => ({ createRaffle: vi.fn(), updateRaffle: vi.fn() }))
vi.mock('@/lib/navigation-history', () => ({ hasInternalHistory: vi.fn(() => false) }))

const actions = await import('@/features/raffles/actions')
const navigationHistory = await import('@/lib/navigation-history')
const { RaffleForm } = await import('@/features/raffles/components/RaffleForm')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// El `Switch` de Radix mide su caja con `ResizeObserver`, que jsdom no trae. Aquí
// no se mide nada: basta con que exista.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const RAFFLE_ID = '11111111-2222-4333-8444-555555555555'
const DETAIL = `/owner/raffles/${RAFFLE_ID}`
const PRIZES = `/owner/raffles/${RAFFLE_ID}/prizes`

/** Lo que llega en `?from=` cuando alguien lo escribe a mano. */
const FORJADOS = [
  undefined,
  '',
  'https://evil.example',
  '//evil.example',
  '/owner/raffles',
  'javascript:alert(1)',
  'PRIZES',
  'prizes ',
  ['https://evil.example', 'prizes'],
]

// =============================================================================
describe('el origen de la edición es una lista cerrada', () => {
  it('reconoce los dos orígenes', () => {
    expect(parseRaffleEditOrigin('prizes')).toBe('prizes')
    expect(parseRaffleEditOrigin('detail')).toBe('detail')
    expect(parseRaffleEditOrigin(['prizes', 'detail'])).toBe('prizes')
  })

  it('cualquier otra cosa vuelve al detalle, nunca a lo que traiga la URL', () => {
    for (const valor of FORJADOS) {
      expect(parseRaffleEditOrigin(valor)).toBe('detail')
      expect(raffleEditReturnHref(RAFFLE_ID, parseRaffleEditOrigin(valor))).toBe(DETAIL)
    }
  })

  it('el destino se compone con el id de la rifa y nada más', () => {
    expect(raffleEditReturnHref(RAFFLE_ID, 'prizes')).toBe(PRIZES)
    expect(raffleEditReturnHref(RAFFLE_ID, 'detail')).toBe(DETAIL)
  })

  it('el enlace desde el detalle no lleva origen; el de los premios, sí', () => {
    expect(raffleEditHref(RAFFLE_ID)).toBe(`${DETAIL}/edit`)
    expect(raffleEditHref(RAFFLE_ID, 'detail')).toBe(`${DETAIL}/edit`)
    expect(raffleEditHref(RAFFLE_ID, 'prizes')).toBe(`${DETAIL}/edit?from=prizes`)
  })
})

// =============================================================================
describe('el formulario vuelve al origen que le da la página', () => {
  let root: Root
  let container: HTMLDivElement

  const RAFFLE = {
    id: RAFFLE_ID,
    name: 'Rifa Navidad',
    description: '',
    ticketPrice: 120_000,
    startDate: '2026-11-02',
    endDate: '2026-12-31',
    allowSellerTicketCreation: false,
  }

  beforeEach(() => {
    for (const fn of Object.values(router)) fn.mockReset()
    vi.mocked(actions.updateRaffle).mockReset().mockResolvedValue({ ok: true })
    vi.mocked(navigationHistory.hasInternalHistory).mockReturnValue(false)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  function button(name: string): HTMLButtonElement {
    const found = [...container.querySelectorAll('button')].find(
      (element) => element.textContent?.trim() === name,
    )
    if (!found) throw new Error(`no hay un botón «${name}»`)
    return found
  }

  async function save() {
    await act(async () => button('Guardar cambios').click())
    // La validación de react-hook-form y la acción terminan en otra vuelta.
    await act(async () => undefined)
  }

  it('desde los premios: guardar vuelve a los premios', async () => {
    await act(async () => root.render(<RaffleForm raffle={RAFFLE} returnHref={PRIZES} />))
    await save()

    expect(actions.updateRaffle).toHaveBeenCalledWith(expect.objectContaining({ id: RAFFLE_ID }))
    expect(router.push).toHaveBeenCalledWith(PRIZES)
  })

  it('desde los premios: cancelar vuelve a los premios, también sin historial', async () => {
    await act(async () => root.render(<RaffleForm raffle={RAFFLE} returnHref={PRIZES} />))
    await act(async () => button('Cancelar').click())

    expect(router.push).toHaveBeenCalledWith(PRIZES)
    expect(actions.updateRaffle).not.toHaveBeenCalled()
  })

  it('desde el detalle: guardar y cancelar vuelven al detalle', async () => {
    await act(async () => root.render(<RaffleForm raffle={RAFFLE} returnHref={DETAIL} />))
    await act(async () => button('Cancelar').click())
    expect(router.push).toHaveBeenLastCalledWith(DETAIL)

    await save()
    expect(router.push).toHaveBeenLastCalledWith(DETAIL)
  })

  it('sin destino, una edición vuelve al detalle, como siempre', async () => {
    await act(async () => root.render(<RaffleForm raffle={RAFFLE} />))
    await save()
    expect(router.push).toHaveBeenCalledWith(DETAIL)
  })

  it('con historial dentro de la aplicación, cancelar vuelve atrás, como la flecha', async () => {
    vi.mocked(navigationHistory.hasInternalHistory).mockReturnValue(true)
    await act(async () => root.render(<RaffleForm raffle={RAFFLE} returnHref={PRIZES} />))
    await act(async () => button('Cancelar').click())

    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.push).not.toHaveBeenCalled()
  })
})
