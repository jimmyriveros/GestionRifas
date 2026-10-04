/**
 * El resto de I-204: los formularios de PÁGINA llevan la protección en el HTML que llega del
 * servidor, antes de que exista JavaScript. Los de acceso y de contraseña los comprueba
 * `auth-forms-sin-hidratar.test.tsx`.
 *
 * Antes eran `<form onSubmit noValidate>` sin `method` y con `name` en los campos: pulsar antes de
 * hidratar hacía el envío NATIVO por GET, y el navegador pedía `/seller/clients/new?name=…&phone=…`.
 * Lo que se comprueba aquí, sin navegador:
 *
 *   · cliente (alta y edición), rifa (alta y edición) y boleta: `method="post"`, sin `action`, y el
 *     botón DESACTIVADO —que impide también el envío con Enter— diciendo que el formulario se está
 *     preparando, con el aviso para quien no tiene JavaScript;
 *   · al hidratar, el botón se activa con su texto de siempre;
 *   · la lista general de tramos no tiene ningún campo con nombre —un envío nativo no llevaría
 *     nada a la dirección—, y por eso no se cambió. Si un día los tiene, esta prueba lo dice.
 *
 * El navegador de verdad —clic, Enter, JavaScript desactivado, retrasado o perdido— lo prueba
 * `tests/e2e/formularios-pagina-sin-hidratar.spec.ts`.
 */
import type { ReactElement } from 'react'
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/features/clients/actions', () => ({
  createClientRecord: vi.fn(),
  updateClientRecord: vi.fn(),
}))
vi.mock('@/features/raffles/actions', () => ({ createRaffle: vi.fn(), updateRaffle: vi.fn() }))
vi.mock('@/features/tickets/actions', () => ({ createTicket: vi.fn() }))
vi.mock('@/features/commissions/actions', () => ({ saveCommissionTemplate: vi.fn() }))

import { ClientForm } from '@/features/clients/components/ClientForm'
import { CommissionTemplateForm } from '@/features/commissions/components/CommissionTemplateForm'
import { RaffleForm } from '@/features/raffles/components/RaffleForm'
import { TicketForm } from '@/features/tickets/components/TicketForm'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// El `Switch` de Radix de la rifa mide su caja con `ResizeObserver`, que jsdom no trae. Aquí no se
// mide nada: basta con que exista (como en `raffle-edit-origin.test.tsx`).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const PREPARANDO = 'Preparando el formulario…'
const SIN_JAVASCRIPT =
  'Este formulario necesita JavaScript y tu navegador lo tiene desactivado. Actívalo o abre Rifas en otro navegador.'

const CLIENTE = {
  id: 'cliente-sintetico',
  name: 'Ana Sintética',
  alias: 'Ana',
  phone: '3001234567',
  email: 'ana@ejemplo.test',
  notes: 'Nota',
}
const RIFA = {
  id: 'rifa-sintetica',
  name: 'Rifa sintética',
  description: '',
  ticketPrice: 120000,
  startDate: '2026-10-01',
  endDate: '2026-12-21',
  allowSellerTicketCreation: false,
}

const FORMULARIOS: Array<{ nombre: string; elemento: () => ReactElement; boton: string }> = [
  { nombre: 'crear un cliente', elemento: () => <ClientForm />, boton: 'Crear cliente' },
  {
    nombre: 'editar un cliente',
    elemento: () => <ClientForm client={CLIENTE} />,
    boton: 'Guardar cambios',
  },
  { nombre: 'crear una rifa', elemento: () => <RaffleForm />, boton: 'Crear rifa' },
  {
    nombre: 'editar una rifa',
    elemento: () => <RaffleForm raffle={RIFA} status="draft" />,
    boton: 'Guardar cambios',
  },
  {
    nombre: 'crear una boleta',
    elemento: () => (
      <TicketForm
        raffles={[{ id: 'r1', name: 'Rifa sintética', shortCode: 'R001' }]}
        sellers={[{ id: 's1', fullName: 'Vendedor sintético' }]}
      />
    ),
    boton: 'Crear boleta',
  },
]

afterEach(() => {
  document.body.innerHTML = ''
})

function htmlDelServidor(elemento: ReactElement): HTMLFormElement {
  const container = document.createElement('div')
  container.innerHTML = renderToString(elemento)
  const form = container.querySelector('form')
  if (!form) throw new Error('El HTML del servidor no trae ningún formulario.')
  return form
}

describe('I-204, formularios de página: la protección viaja en el HTML del servidor', () => {
  it.each(FORMULARIOS)(
    '$nombre: method="post" y el botón desactivado antes de hidratar',
    ({ elemento }) => {
      const form = htmlDelServidor(elemento())
      expect(form.getAttribute('method')).toBe('post')
      // Ninguna dirección propia: lo nativo, si ocurre, va a la misma página y por POST.
      expect(form.hasAttribute('action')).toBe(false)
      // Lo que de verdad podría viajar: hay campos con nombre (el motivo de la protección).
      expect(form.querySelectorAll('input[name], textarea[name]').length).toBeGreaterThan(0)

      const enviar = form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')
      expect(enviar).toHaveLength(1)
      expect(enviar[0]!.disabled).toBe(true)
      expect(enviar[0]!.textContent).toContain(PREPARANDO)
      // Ningún otro botón puede enviar: todos los demás son `type="button"`.
      for (const boton of form.querySelectorAll('button')) {
        expect(['submit', 'button']).toContain(boton.getAttribute('type'))
      }
    },
  )

  it.each(FORMULARIOS)(
    '$nombre: explica qué hacer si JavaScript está desactivado',
    ({ elemento }) => {
      const form = htmlDelServidor(elemento())
      const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(form.outerHTML)?.[1] ?? ''
      expect(noscript).toContain(SIN_JAVASCRIPT)
    },
  )

  it('la lista general de tramos no tiene campos con nombre: un envío nativo no llevaría nada', () => {
    for (const template of [
      null,
      { version: 2, savedAt: 'hoy', tiers: [{ minTickets: 1, rate: 20_000 }] },
    ]) {
      const form = htmlDelServidor(<CommissionTemplateForm template={template} />)
      expect(form.querySelectorAll('[name]')).toHaveLength(0)
    }
  })
})

describe('I-204, formularios de página: al hidratar, todo funciona como siempre', () => {
  it.each(FORMULARIOS)('$nombre: el botón se activa con su texto', async ({ elemento, boton }) => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(elemento())
    document.body.append(container)

    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, elemento())
    })

    const enviar = container.querySelector<HTMLButtonElement>('button[type="submit"]')
    expect(enviar?.disabled).toBe(false)
    expect(enviar?.textContent).toBe(boton)
    expect(container.textContent).not.toContain(PREPARANDO)

    await act(async () => root?.unmount())
  })
})
