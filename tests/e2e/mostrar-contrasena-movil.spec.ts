import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs, SEED_PASSWORD } from './fixtures'
import {
  abrirContrasenaNueva,
  abrirIngreso,
  escribirConCursorEnMedio,
  vigilarRed,
} from './mostrar-contrasena'

/**
 * D-255 en el teléfono (proyecto `movil`, Pixel 7 con pantalla táctil): el toque alterna sin
 * quitarle el foco al campo —el teclado no se cierra—, el ojo es un blanco de 44 px dentro de su
 * propio hueco y se ingresa con la contraseña a la vista. Lo demás, en `mostrar-contrasena.spec.ts`.
 */

test.describe('D-255: el ojo en el teléfono', () => {
  test('el toque alterna sin cerrar el teclado, y el ojo no tapa lo escrito', async ({ page }) => {
    const { campo, mostrar, ocultar } = await abrirIngreso(page)
    await campo.tap()
    await escribirConCursorEnMedio(page)
    const red = vigilarRed(page)

    await mostrar.tap()
    await expect(campo).toHaveAttribute('type', 'text')
    await expect(campo).toBeFocused()
    await page.keyboard.type('X')
    await expect(campo).toHaveValue('valorX-ficticio-123')

    await ocultar.tap()
    await expect(campo).toHaveAttribute('type', 'password')
    await expect(campo).toBeFocused()

    // 44 px de alto y de ancho, pegado al borde derecho, y el texto termina donde empieza el ojo.
    const caja = (await campo.boundingBox())!
    const ojo = (await mostrar.boundingBox())!
    expect(caja.height).toBe(44)
    expect(ojo.width).toBe(44)
    expect(ojo.height).toBe(44)
    expect(ojo.x + ojo.width).toBeCloseTo(caja.x + caja.width, 0)
    expect(await campo.evaluate((input) => getComputedStyle(input).paddingRight)).toBe('44px')

    expect(red).toEqual([])
  })

  test('ingresa con la contraseña a la vista', async ({ page }) => {
    const { campo, mostrar } = await abrirIngreso(page)
    await page.getByLabel('Correo electrónico').fill(ACCOUNTS.seller)
    await campo.fill(SEED_PASSWORD)
    await mostrar.tap()
    await expect(campo).toHaveAttribute('type', 'text')

    await page.getByRole('button', { name: 'Ingresar' }).tap()
    await page.waitForURL(/\/seller\/dashboard/)
  })
})

test.describe('D-256: los dos ojos de «Cambiar contraseña» en el teléfono', () => {
  test('cada toque alterna su campo sin cerrar el teclado, y los dos ojos miden 44 px', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    const { nueva, confirmar, ojo } = await abrirContrasenaNueva(page, '/account/password')
    await nueva.tap()
    await escribirConCursorEnMedio(page)
    const red = vigilarRed(page)

    await ojo('Mostrar', 'nueva contraseña').tap()
    await expect(nueva).toHaveAttribute('type', 'text')
    await expect(nueva).toBeFocused()
    await page.keyboard.type('X')
    await expect(nueva).toHaveValue('valorX-ficticio-123')

    await confirmar.tap()
    await ojo('Mostrar', 'confirmación de contraseña').tap()
    await expect(confirmar).toHaveAttribute('type', 'text')
    await expect(confirmar).toBeFocused()
    await expect(nueva).toHaveAttribute('type', 'text')

    for (const [campo, boton] of [
      [nueva, ojo('Ocultar', 'nueva contraseña')],
      [confirmar, ojo('Ocultar', 'confirmación de contraseña')],
    ] as const) {
      const caja = (await campo.boundingBox())!
      const cajaOjo = (await boton.boundingBox())!
      expect([caja.height, cajaOjo.width, cajaOjo.height]).toEqual([44, 44, 44])
      expect(cajaOjo.x + cajaOjo.width).toBeCloseTo(caja.x + caja.width, 0)
    }
    expect(red).toEqual([])
  })
})
