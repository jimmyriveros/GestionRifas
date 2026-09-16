/**
 * Activar una rifa desde su detalle (BR-R03, BR-J13, BR-J16, D-202).
 *
 * Una rifa con premios configurables en BORRADOR no se activa desde el detalle:
 * el detalle ofrece «Revisar y activar», que lleva a la revisión —la pantalla
 * que dice qué falta—. Una rifa heredada conserva «Activar rifa» con su
 * confirmación, y las demás transiciones no cambian: cerrar, anular y la
 * reapertura, que sigue siendo solo del Dueño.
 *
 * Lo que decide es puro (`draftActivation`) y lo que se pinta se comprueba con
 * el componente montado. La autoridad sigue en otra parte: `changeRaffleStatus`
 * se autoriza sola y el disparador de PostgreSQL valida la configuración al
 * activar (`tests/db/raffle-prizes.test.ts`). El recorrido completo, en
 * `tests/e2e/premios.spec.ts`.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RAFFLE_WIZARD_COPY } from '@/features/raffle-prizes/copy'
import { draftActivation, type DraftActivation } from '@/features/raffle-prizes/review'
import type { AppRole, RaffleStatus } from '@/lib/constants'

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/features/raffles/actions', () => ({ changeRaffleStatus: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const actions = await import('@/features/raffles/actions')
const { toast } = await import('sonner')
const { RaffleStatusActions } = await import('@/features/raffles/components/RaffleStatusActions')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RAFFLE_ID = '11111111-2222-4333-8444-555555555555'
const REVIEW = draftActivation({ id: RAFFLE_ID, prizeMode: 'configurable' }, true)

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.mocked(actions.changeRaffleStatus).mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
  router.refresh.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function render(props: {
  status: RaffleStatus
  role?: AppRole
  activation?: DraftActivation
}) {
  await act(async () =>
    root.render(
      <RaffleStatusActions
        raffleId={RAFFLE_ID}
        status={props.status}
        role={props.role ?? 'owner'}
        draftActivation={props.activation}
      />,
    ),
  )
}

function buttons(scope: ParentNode = container): string[] {
  return [...scope.querySelectorAll('button')].map((button) => button.textContent?.trim() ?? '')
}

function links(): { text: string; href: string | null }[] {
  return [...container.querySelectorAll('a')].map((link) => ({
    text: link.textContent?.trim() ?? '',
    href: link.getAttribute('href'),
  }))
}

// =============================================================================
describe('cómo se ofrece activar un borrador (draftActivation)', () => {
  it('una rifa heredada se activa como siempre, con o sin la capacidad', () => {
    expect(draftActivation({ id: RAFFLE_ID, prizeMode: 'legacy' }, true)).toEqual({
      kind: 'direct',
    })
    expect(draftActivation({ id: RAFFLE_ID, prizeMode: 'legacy' }, false)).toEqual({
      kind: 'direct',
    })
  })

  it('una configurable se activa desde la revisión', () => {
    expect(REVIEW).toEqual({
      kind: 'review',
      href: `/owner/raffles/${RAFFLE_ID}/review`,
      label: 'Revisar y activar',
    })
    // Es el nombre del tercer paso del proceso: la misma palabra lleva al mismo sitio.
    expect(REVIEW.kind === 'review' && REVIEW.label).toBe(RAFFLE_WIZARD_COPY.steps.review)
  })

  it('quien no puede configurar los premios no recibe ninguna de las dos', () => {
    expect(draftActivation({ id: RAFFLE_ID, prizeMode: 'configurable' }, false)).toEqual({
      kind: 'none',
    })
  })
})

// =============================================================================
describe('el detalle de la rifa (RaffleStatusActions)', () => {
  it('borrador configurable: NO presenta «Activar rifa»', async () => {
    await render({ status: 'draft', activation: REVIEW })
    expect(buttons()).not.toContain('Activar rifa')
    expect(container.textContent).not.toContain('Activar rifa')
  })

  it('borrador configurable: presenta «Revisar y activar» hacia la revisión', async () => {
    await render({ status: 'draft', activation: REVIEW })
    expect(links()).toEqual([
      { text: 'Revisar y activar', href: `/owner/raffles/${RAFFLE_ID}/review` },
    ])
    // Anular un borrador sigue estando donde estaba.
    expect(buttons()).toEqual(['Anular rifa'])
  })

  it('borrador heredado: conserva «Activar rifa», con su confirmación', async () => {
    vi.mocked(actions.changeRaffleStatus).mockResolvedValue({ ok: true })
    await render({ status: 'draft', activation: { kind: 'direct' } })

    expect(links()).toEqual([])
    expect(buttons()).toEqual(['Activar rifa', 'Anular rifa'])

    const activar = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Activar rifa',
    )!
    await act(async () => activar.click())

    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('Una rifa activa admite creación y asignación')
    const confirmar = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Activar rifa',
    )!
    await act(async () => confirmar.click())

    expect(actions.changeRaffleStatus).toHaveBeenCalledWith({ id: RAFFLE_ID, status: 'active' })
    expect(router.refresh).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('La rifa quedó en estado activa.')
  })

  it('el aviso de cada transición dice «quedó», con tilde (I-124)', async () => {
    vi.mocked(actions.changeRaffleStatus).mockResolvedValue({ ok: true })

    async function transition(status: RaffleStatus, action: string, role: AppRole = 'owner') {
      await render({ status, role })
      const trigger = [...container.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === action,
      )!
      await act(async () => trigger.click())
      const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!
      const confirm = [...dialog.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() !== 'Cancelar',
      )!
      await act(async () => confirm.click())
    }

    await transition('active', 'Cerrar rifa')
    expect(toast.success).toHaveBeenLastCalledWith('La rifa quedó en estado cerrada.')

    await transition('closed', 'Reabrir rifa')
    expect(toast.success).toHaveBeenLastCalledWith('La rifa quedó en estado activa.')

    await transition('active', 'Anular rifa', 'admin')
    expect(toast.success).toHaveBeenLastCalledWith('La rifa quedó en estado anulada.')

    // Ningún aviso vuelve a escribir la forma sin tilde (hasta el 2026-09-16, «quedo»).
    expect(toast.success).toHaveBeenCalledTimes(3)
    for (const [text] of vi.mocked(toast.success).mock.calls) {
      expect(String(text)).not.toMatch(/\bquedo\b/)
    }
  })

  it('sin la prop, el comportamiento de siempre', async () => {
    await render({ status: 'draft' })
    expect(buttons()).toEqual(['Activar rifa', 'Anular rifa'])
  })

  it('sin la capacidad: ni activar ni revisar, y anular sigue', async () => {
    await render({ status: 'draft', activation: { kind: 'none' } })
    expect(links()).toEqual([])
    expect(buttons()).toEqual(['Anular rifa'])
  })

  it('las demás transiciones no cambian: una configurable activa se cierra o se anula', async () => {
    await render({ status: 'active', activation: REVIEW })
    expect(links()).toEqual([])
    expect(buttons()).toEqual(['Cerrar rifa', 'Anular rifa'])
  })

  it('la reapertura sigue siendo solo del Dueño, también en una configurable', async () => {
    await render({ status: 'closed', role: 'owner', activation: REVIEW })
    expect(links()).toEqual([])
    expect(buttons()).toEqual(['Reabrir rifa', 'Anular rifa'])

    await render({ status: 'closed', role: 'admin', activation: REVIEW })
    expect(buttons()).toEqual(['Anular rifa'])
  })
})
