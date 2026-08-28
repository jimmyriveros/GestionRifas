import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Navegacion en escritorio despues de mover la del telefono abajo (D-106).
 *
 * Corre en el proyecto `escritorio`. Es la prueba de regresion del cambio: la
 * barra lateral tiene que seguir intacta, la inferior no debe aparecer, y el
 * menu de usuario no debe repetir en escritorio lo que ya esta en la lateral.
 *
 * VENTANA PROPIA, 1.440 px (D-131). Los 1.280 del proyecto quedaron por debajo
 * del ancho en el que la barra lateral puede estar abierta, asi que sin esto
 * estas tres pruebas se ejecutarian sobre la barra en modo iconos y dejarian de
 * comprobar lo que fueron escritas para comprobar. Que la barra cerrada
 * funciona es cosa de `menu-lateral.spec.ts`.
 */
test.describe('Navegación en escritorio', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('conserva la barra lateral completa y no muestra la inferior', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)

    const lateral = page.locator('[data-tour="nav-sidebar"]')
    await expect(lateral).toBeVisible()
    for (const nombre of [
      'Panel',
      'Rifas',
      'Boletas',
      'Vendedores',
      'Clientes',
      'Pagos',
      'Reportes',
      'Administradores',
    ]) {
      await expect(lateral.getByRole('link', { name: nombre, exact: true })).toBeVisible()
    }

    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeHidden()
  })

  test('el menú de usuario no repite en escritorio lo que ya está en la lateral', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)

    await page.getByRole('button', { name: /Menú de usuario/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Cambiar contraseña' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Reportes' })).toBeHidden()
  })

  test('la barra lateral marca el módulo dentro de una ficha de detalle', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets/bulk')

    const lateral = page.locator('[data-tour="nav-sidebar"]')
    await expect(lateral.locator('a[aria-current="page"]')).toHaveText(/Boletas/)
  })
})
