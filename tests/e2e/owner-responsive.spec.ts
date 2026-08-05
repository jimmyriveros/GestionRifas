import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Prueba 15 de la Fase 3: responsive basico.
 *
 * Se ejecuta solo en el proyecto «movil» (Pixel 7) de playwright.config.ts.
 * Comprueba lo que de verdad rompe la experiencia en un telefono: navegacion
 * accesible con el pulgar y ausencia de scroll horizontal en la pagina.
 */

test.describe('Portal administrativo en movil', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('la navegacion se abre desde el drawer', async ({ page }) => {
    await page.goto('/owner/dashboard')

    // En movil la barra lateral esta oculta y hay un boton de menu.
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Rifas' })).toBeHidden()

    await page
      .getByRole('button', { name: /menu|abrir/i })
      .first()
      .click()
    const drawerLink = page.getByRole('link', { name: 'Boletas' })
    await expect(drawerLink).toBeVisible()

    await drawerLink.click()
    await page.waitForURL(/\/owner\/tickets/)
    await expect(page.getByRole('heading', { name: 'Boletas' })).toBeVisible()
  })

  test('ninguna pantalla desborda horizontalmente', async ({ page }) => {
    for (const path of [
      '/owner/dashboard',
      '/owner/raffles',
      '/owner/tickets',
      '/owner/sellers',
      '/owner/clients',
      '/owner/users',
      '/owner/tickets/bulk',
    ]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      // Un par de pixeles de holgura por redondeo de subpixeles.
      expect(overflow, `desbordamiento horizontal en ${path}`).toBeLessThanOrEqual(2)
    }
  })

  test('las columnas secundarias se ocultan y la tabla sigue siendo legible', async ({ page }) => {
    await page.goto('/owner/tickets')

    // El codigo y los numeros se ven siempre; el vendedor solo en escritorio.
    await expect(page.getByRole('columnheader', { name: 'Código' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Diario / Semanal' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Vendedor' })).toBeHidden()
  })

  test('el formulario de boleta es usable con teclado numerico', async ({ page }) => {
    await page.goto('/owner/tickets/new')

    const daily = page.getByLabel('Número diario')
    await expect(daily).toHaveAttribute('inputmode', 'numeric')
    await daily.fill('0007')
    await expect(daily).toHaveValue('0007')
  })
})
