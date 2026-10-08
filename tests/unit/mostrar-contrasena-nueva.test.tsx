/**
 * D-256: el ojo en los dos formularios de contraseña nueva —«Nueva contraseña» (definir) y «Cambiar
 * contraseña»—, cada uno con dos campos. El del ingreso lo prueba `login-mostrar-contrasena.test.tsx`.
 *
 * Lo que se comprueba aquí, sin navegador:
 *
 *   · el HTML del servidor trae los dos campos ocultos y dos ojos desactivados, cada uno con su
 *     nombre —dos botones iguales en la misma pantalla no se distinguirían—, sin tocar I-204;
 *   · al hidratar, cada ojo alterna SU campo, sobre el mismo nodo y con su valor, sin enviar nada;
 *   · un error de validación NO los vuelve a tapar: hay que poder ver qué no coincide;
 *   · al guardar, la acción recibe lo escrito y los dos campos se tapan y se desactivan.
 *
 * El foco real, el cursor y la red, en `tests/e2e/mostrar-contrasena.spec.ts`.
 */
import type { ComponentType } from 'react'
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const { resetPassword, changePassword } = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
}))

vi.mock('@/features/auth/actions', () => ({ resetPassword, changePassword }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm'
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Valores ficticios: no son la contraseña de nadie. */
const CLAVE = 'valor-ficticio-123'

const FORMULARIOS: Array<{ nombre: string; Form: ComponentType; accion: Mock }> = [
  { nombre: 'definir la contraseña', Form: ResetPasswordForm, accion: resetPassword },
  { nombre: 'cambiar la contraseña', Form: ChangePasswordForm, accion: changePassword },
]

const nueva = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[name="password"]')!
const confirmar = (c: HTMLElement) =>
  c.querySelector<HTMLInputElement>('input[name="confirmPassword"]')!
const ojos = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('button[type="button"]')]
const nombres = (c: HTMLElement) => ojos(c).map((boton) => boton.textContent)

/** Escribe como lo haría el navegador: el valor nativo y el evento que escucha React. */
function escribir(input: HTMLInputElement, valor: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function montar(Form: ComponentType) {
  const container = document.createElement('div')
  container.innerHTML = renderToString(<Form />)
  document.body.append(container)
  let root: ReturnType<typeof hydrateRoot> | undefined
  await act(async () => {
    root = hydrateRoot(container, <Form />)
  })
  return { container, desmontar: () => act(async () => root?.unmount()) }
}

const enviar = (c: HTMLElement) =>
  act(async () => c.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())

beforeEach(() => {
  resetPassword.mockReset()
  changePassword.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('D-256: antes de hidratar', () => {
  it.each(FORMULARIOS)(
    '$nombre: los dos campos llegan ocultos, con un ojo desactivado y con nombre propio cada uno',
    ({ Form }) => {
      const container = document.createElement('div')
      container.innerHTML = renderToString(<Form />)

      for (const input of [nueva(container), confirmar(container)]) {
        expect(input.getAttribute('type')).toBe('password')
        expect(input.getAttribute('autocomplete')).toBe('new-password')
      }
      expect(nombres(container)).toEqual([
        'Mostrar nueva contraseña',
        'Mostrar confirmación de contraseña',
      ])
      for (const ojo of ojos(container)) {
        expect(ojo.disabled).toBe(true)
        expect(ojo.hasAttribute('aria-label')).toBe(false)
      }
      expect(container.querySelector('form')?.getAttribute('method')).toBe('post')
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
        true,
      )
    },
  )
})

describe('D-256: al hidratar', () => {
  it.each(FORMULARIOS)(
    '$nombre: cada ojo alterna su campo, con el mismo nodo y su valor, sin enviar nada',
    async ({ Form, accion }) => {
      const { container, desmontar } = await montar(Form)
      const [primero, segundo] = [nueva(container), confirmar(container)]
      const envios = vi.fn()
      container.querySelector('form')!.addEventListener('submit', envios)

      await act(async () => escribir(primero, CLAVE))
      await act(async () => escribir(segundo, `${CLAVE}-otra`))

      await act(async () => ojos(container)[0]!.click())
      expect(primero.type).toBe('text')
      expect(segundo.type).toBe('password')
      expect(nombres(container)).toEqual([
        'Ocultar nueva contraseña',
        'Mostrar confirmación de contraseña',
      ])

      await act(async () => ojos(container)[1]!.click())
      await act(async () => ojos(container)[0]!.click())
      expect(primero.type).toBe('password')
      expect(segundo.type).toBe('text')

      expect([nueva(container), confirmar(container)]).toEqual([primero, segundo])
      expect([primero.value, segundo.value]).toEqual([CLAVE, `${CLAVE}-otra`])
      expect(envios).not.toHaveBeenCalled()
      expect(accion).not.toHaveBeenCalled()

      await desmontar()
    },
  )

  it.each(FORMULARIOS)(
    '$nombre: si no coinciden, siguen a la vista para poder corregirlas',
    async ({ Form, accion }) => {
      const { container, desmontar } = await montar(Form)
      await act(async () => escribir(nueva(container), CLAVE))
      await act(async () => escribir(confirmar(container), `${CLAVE}-otra`))
      for (const ojo of ojos(container)) await act(async () => ojo.click())

      await enviar(container)

      expect(container.textContent).toContain('Las contraseñas no coinciden.')
      expect(accion).not.toHaveBeenCalled()
      expect([nueva(container).type, confirmar(container).type]).toEqual(['text', 'text'])
      expect(ojos(container).every((ojo) => !ojo.disabled)).toBe(true)

      await desmontar()
    },
  )

  it.each(FORMULARIOS)(
    '$nombre: al guardar con las dos a la vista, se envían, se tapan y esperan desactivadas',
    async ({ Form, accion }) => {
      accion.mockReturnValue(new Promise(() => {}))
      const { container, desmontar } = await montar(Form)
      await act(async () => escribir(nueva(container), CLAVE))
      await act(async () => escribir(confirmar(container), CLAVE))
      for (const ojo of ojos(container)) await act(async () => ojo.click())

      await enviar(container)

      expect(accion).toHaveBeenCalledTimes(1)
      expect(accion).toHaveBeenCalledWith({ password: CLAVE, confirmPassword: CLAVE })
      for (const input of [nueva(container), confirmar(container)]) {
        expect(input.type).toBe('password')
        expect(input.value).toBe(CLAVE)
        expect(input.disabled).toBe(true)
      }
      expect(nombres(container)).toEqual([
        'Mostrar nueva contraseña',
        'Mostrar confirmación de contraseña',
      ])
      expect(ojos(container).every((ojo) => ojo.disabled)).toBe(true)

      await desmontar()
    },
  )
})
