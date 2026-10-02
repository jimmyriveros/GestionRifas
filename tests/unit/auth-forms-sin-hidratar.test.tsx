/**
 * I-204 (D-247): los cuatro formularios de acceso y de contraseña llevan la protección en el HTML
 * que llega del servidor, antes de que exista JavaScript.
 *
 * Antes de la corrección eran `<form onSubmit noValidate>` sin `method`: pulsar antes de hidratar
 * hacía el envío NATIVO por GET y el navegador pedía `/login?email=…&password=…`. Lo que se
 * comprueba aquí, sin navegador:
 *
 *   · el HTML del servidor trae `method="post"` —si algo lo enviara de forma nativa, nada iría en
 *     la dirección— y el botón DESACTIVADO —un botón por defecto desactivado impide también el
 *     envío con Enter—;
 *   · el botón dice que el formulario se está preparando, y un aviso dentro de `<noscript>` explica
 *     qué hacer si JavaScript está desactivado;
 *   · al hidratar, el botón se activa con su texto de siempre.
 *
 * El navegador de verdad —clic, Enter, JavaScript desactivado, retrasado o perdido— lo prueba
 * `tests/e2e/credenciales-sin-hidratar.spec.ts`. No hay Testing Library: se monta con
 * `react-dom`, como `app-error-page.test.tsx`.
 */
import type { ComponentType } from 'react'
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/auth/actions', () => ({
  login: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm'
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PREPARANDO = 'Preparando el formulario…'
const SIN_JAVASCRIPT =
  'Este formulario necesita JavaScript y tu navegador lo tiene desactivado. Actívalo o abre Rifas en otro navegador.'

const FORMULARIOS: Array<{ nombre: string; Form: ComponentType; boton: string }> = [
  { nombre: 'ingresar', Form: () => <LoginForm />, boton: 'Ingresar' },
  { nombre: 'recuperar', Form: ForgotPasswordForm, boton: 'Enviar enlace de recuperación' },
  { nombre: 'definir', Form: ResetPasswordForm, boton: 'Guardar nueva contraseña' },
  { nombre: 'cambiar', Form: ChangePasswordForm, boton: 'Cambiar contraseña' },
]

afterEach(() => {
  document.body.innerHTML = ''
})

describe('I-204: la protección viaja en el HTML del servidor', () => {
  it.each(FORMULARIOS)('$nombre: method="post" y el botón desactivado antes de hidratar', ({ Form }) => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<Form />)

    const form = container.querySelector('form')
    expect(form?.getAttribute('method')).toBe('post')
    // Ninguna dirección propia: lo nativo, si ocurre, va a la misma página y por POST.
    expect(form?.hasAttribute('action')).toBe(false)

    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')
    expect(submit?.disabled).toBe(true)
    expect(submit?.textContent).toContain(PREPARANDO)
  })

  it.each(FORMULARIOS)('$nombre: explica qué hacer si JavaScript está desactivado', ({ Form }) => {
    const markup = renderToString(<Form />)
    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(markup)?.[1] ?? ''
    expect(noscript).toContain(SIN_JAVASCRIPT)
  })
})

describe('I-204: al hidratar, el formulario funciona como siempre', () => {
  it.each(FORMULARIOS)('$nombre: el botón se activa con su texto', async ({ Form, boton }) => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<Form />)
    document.body.append(container)

    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, <Form />)
    })

    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')
    expect(submit?.disabled).toBe(false)
    expect(submit?.textContent).toBe(boton)
    expect(container.textContent).not.toContain(PREPARANDO)

    await act(async () => root?.unmount())
  })
})
