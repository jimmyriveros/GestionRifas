import { expect, test } from '@playwright/test'

import { ACCOUNTS, SEED_PASSWORD } from './fixtures'
import { abrirIngreso, escribirConCursorEnMedio, vigilarRed } from './mostrar-contrasena'

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
