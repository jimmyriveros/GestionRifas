import { expect, test } from '@playwright/test'

import { ACCOUNTS, SEED_PASSWORD } from './fixtures'
import { abrirIngreso, escribirConCursorEnMedio, FICTICIO, vigilarRed } from './mostrar-contrasena'

/**
 * D-255: el ojo del campo de contraseña del ingreso, en un navegador de verdad.
 *
 * Lo que la unitaria (`tests/unit/login-mostrar-contrasena.test.tsx`) no puede ver: el foco real,
 * el cursor —Chrome lo llevaba al principio al cambiar el `type` con un clic—, el teclado, la red y
 * un ingreso completo. El teléfono, en `mostrar-contrasena-movil.spec.ts`.
 *
 * VALORES FICTICIOS salvo en el ingreso, que usa la cuenta de desarrollo del seed. La red se vigila
 * anotando solo el método y la ruta de cada petición, nunca su contenido.
 */

test.describe('D-255: mostrar y ocultar la contraseña', () => {
  test('un clic la muestra y otro la oculta: el mismo campo, su valor, el cursor y nada a la red', async ({
    page,
  }) => {
    const { campo, mostrar, ocultar } = await abrirIngreso(page)
    await expect(campo).toHaveAttribute('type', 'password')
    await expect(campo).toHaveAttribute('autocomplete', 'current-password')

    await campo.click()
    await escribirConCursorEnMedio(page)
    await campo.evaluate((input) => ((window as { __campo?: Element }).__campo = input))
    const cajaAntes = await campo.boundingBox()
    const formularioAntes = await page.locator('form').boundingBox()
    const red = vigilarRed(page)

    await mostrar.click()
    await expect(campo).toHaveAttribute('type', 'text')
    await expect(campo).toHaveValue(FICTICIO)
    await expect(campo).toBeFocused()
    await expect(ocultar).toBeVisible()
    // Se sigue escribiendo donde estaba el cursor, no al principio.
    await page.keyboard.type('X')
    await expect(campo).toHaveValue('valorX-ficticio-123')

    await ocultar.click()
    await expect(campo).toHaveAttribute('type', 'password')
    await expect(campo).toBeFocused()
    await page.keyboard.type('Y')
    await expect(campo).toHaveValue('valorXY-ficticio-123')

    // Nada se remonta ni se mueve, y el navegador sigue viendo un campo de contraseña.
    expect(
      await campo.evaluate((input) => input === (window as { __campo?: Element }).__campo),
    ).toBe(true)
    expect(await campo.boundingBox()).toEqual(cajaAntes)
    expect(await page.locator('form').boundingBox()).toEqual(formularioAntes)
    await expect(campo).toHaveAttribute('autocomplete', 'current-password')
    expect(red).toEqual([])
    await expect(page).toHaveURL(/\/login$/)
  })

  test('con el teclado: Tab llega al ojo, Enter y Espacio lo alternan, el foco se ve y nada se envía', async ({
    page,
  }) => {
    const { campo, mostrar, ocultar } = await abrirIngreso(page)
    await campo.click()
    await page.keyboard.type(FICTICIO)
    const red = vigilarRed(page)

    await page.keyboard.press('Tab')
    await expect(mostrar).toBeFocused()
    expect(await mostrar.evaluate((boton) => boton.matches(':focus-visible'))).toBe(true)
    expect(await mostrar.evaluate((boton) => getComputedStyle(boton).boxShadow)).not.toBe('none')

    await page.keyboard.press('Enter')
    await expect(campo).toHaveAttribute('type', 'text')
    await expect(ocultar).toBeFocused()

    await page.keyboard.press('Space')
    await expect(campo).toHaveAttribute('type', 'password')
    await expect(mostrar).toBeFocused()

    await expect(campo).toHaveValue(FICTICIO)
    expect(red).toEqual([])
    await expect(page).toHaveURL(/\/login$/)
  })

  test('ingresa con la contraseña a la vista: se envía oculta y el ojo espera mientras se procesa', async ({
    page,
  }) => {
    const { campo, mostrar } = await abrirIngreso(page)
    let soltar!: () => void
    const retenida = new Promise<void>((resolve) => (soltar = resolve))
    await page.route('**/login', async (route) => {
      if (route.request().method() === 'POST') await retenida
      await route.continue()
    })

    await page.getByLabel('Correo electrónico').fill(ACCOUNTS.seller)
    await campo.fill(SEED_PASSWORD)
    await mostrar.click()
    await expect(campo).toHaveAttribute('type', 'text')

    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(campo).toHaveAttribute('type', 'password')
    await expect(campo).toBeDisabled()
    await expect(mostrar).toBeDisabled()

    soltar()
    await page.waitForURL(/\/seller\/dashboard/)
  })
})
