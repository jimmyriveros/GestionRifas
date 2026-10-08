/**
 * D-255: el ojo del campo de contraseña del ingreso.
 *
 * Lo que se comprueba aquí, sin navegador:
 *
 *   · el HTML del servidor trae la contraseña OCULTA y el ojo como `type="button"` y desactivado
 *     —antes de hidratar no hace nada—, sin tocar la protección de I-204;
 *   · al hidratar, un clic la muestra y otro la oculta sobre el MISMO `<input>`, con su valor;
 *   · alternar no envía el formulario, y el toque no le quita el foco al campo;
 *   · al ingresar se envía lo escrito, el campo vuelve a ocultarse y el ojo se desactiva mientras
 *     se procesa.
 *
 * El foco real, el teclado, el teléfono y la red los prueba `tests/e2e/mostrar-contrasena.spec.ts`
 * (y su variante `-movil`). Se monta con `react-dom`, como `auth-forms-sin-hidratar.test.tsx`.
 */
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { login } = vi.hoisted(() => ({ login: vi.fn() }))

vi.mock('@/features/auth/actions', () => ({ login }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { LoginForm } from '@/features/auth/components/LoginForm'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MOSTRAR = 'Mostrar contraseña'
const OCULTAR = 'Ocultar contraseña'
/** Valores ficticios: no son la contraseña de nadie. */
const CORREO = 'ficticio@ejemplo.test'
const CLAVE = 'valor-ficticio-123'

const campo = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[name="password"]')!
const ojo = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('button[type="button"]')!

/** Escribe como lo haría el navegador: el valor nativo y el evento que escucha React. */
function escribir(input: HTMLInputElement, valor: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function montar() {
  const container = document.createElement('div')
  container.innerHTML = renderToString(<LoginForm />)
  document.body.append(container)
  let root: ReturnType<typeof hydrateRoot> | undefined
  await act(async () => {
    root = hydrateRoot(container, <LoginForm />)
  })
  return { container, desmontar: () => act(async () => root?.unmount()) }
}

beforeEach(() => {
  login.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('D-255: antes de hidratar', () => {
  it('la contraseña llega oculta y el ojo, desactivado y sin enviar nada', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<LoginForm />)

    const input = campo(container)
    expect(input.getAttribute('type')).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('current-password')
    expect(input.getAttribute('spellcheck')).toBe('false')

    const boton = ojo(container)
    expect(boton.disabled).toBe(true)
    expect(boton.textContent).toBe(MOSTRAR)
    // Un solo `type="button"` en el formulario: el ojo. El de enviar sigue siendo el de I-204.
    expect(container.querySelectorAll('button[type="button"]')).toHaveLength(1)
    expect(container.querySelector('form')?.getAttribute('method')).toBe('post')
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
  })

  it('el campo conserva su etiqueta: «Contraseña» no nombra también al ojo', () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<LoginForm />)

    const input = campo(container)
    const label = container.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)
    expect(label?.textContent).toBe('Contraseña')
    expect(ojo(container).hasAttribute('aria-label')).toBe(false)
  })
})

describe('D-255: al hidratar', () => {
  it('un clic la muestra y otro la oculta, con el mismo campo y el mismo valor', async () => {
    const { container, desmontar } = await montar()
    const input = campo(container)
    expect(ojo(container).disabled).toBe(false)

    await act(async () => escribir(input, CLAVE))
    await act(async () => ojo(container).click())

    expect(campo(container)).toBe(input)
    expect(input.type).toBe('text')
    expect(input.value).toBe(CLAVE)
    expect(ojo(container).textContent).toBe(OCULTAR)

    // Se sigue escribiendo con la contraseña a la vista.
    await act(async () => escribir(input, `${CLAVE}4`))
    await act(async () => ojo(container).click())

    expect(campo(container)).toBe(input)
    expect(input.type).toBe('password')
    expect(input.value).toBe(`${CLAVE}4`)
    expect(ojo(container).textContent).toBe(MOSTRAR)

    await desmontar()
  })

  it('mostrar u ocultar no envía el formulario', async () => {
    const { container, desmontar } = await montar()
    const envios = vi.fn()
    container.querySelector('form')!.addEventListener('submit', envios)

    await act(async () => escribir(campo(container), CLAVE))
    await act(async () => ojo(container).click())
    await act(async () => ojo(container).click())

    expect(envios).not.toHaveBeenCalled()
    expect(login).not.toHaveBeenCalled()

    await desmontar()
  })

  it('el toque no le quita el foco al campo', async () => {
    const { container, desmontar } = await montar()

    const toque = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    ojo(container).dispatchEvent(toque)
    expect(toque.defaultPrevented).toBe(true)

    await desmontar()
  })

  it('ingresa con la contraseña visible, vuelve a ocultarla y desactiva el ojo mientras procesa', async () => {
    login.mockReturnValue(new Promise(() => {}))
    const { container, desmontar } = await montar()
    const input = campo(container)

    await act(async () =>
      escribir(container.querySelector<HTMLInputElement>('input[name="email"]')!, CORREO),
    )
    await act(async () => escribir(input, CLAVE))
    await act(async () => ojo(container).click())
    expect(input.type).toBe('text')

    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(),
    )

    expect(login).toHaveBeenCalledTimes(1)
    expect(login).toHaveBeenCalledWith({ email: CORREO, password: CLAVE, next: undefined })
    expect(input.type).toBe('password')
    expect(input.value).toBe(CLAVE)
    expect(input.disabled).toBe(true)
    expect(ojo(container).disabled).toBe(true)
    expect(ojo(container).textContent).toBe(MOSTRAR)

    await desmontar()
  })
})
