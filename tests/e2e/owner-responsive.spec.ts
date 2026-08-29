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

  // El detalle de la barra inferior —cuantas opciones, cual queda marcada,
  // que no tapa nada— vive en `navegacion-movil.spec.ts` (D-106). Aqui solo se
  // comprueba que desde el panel se llega a otro modulo con el pulgar.
  test('la navegacion se hace desde la barra inferior', async ({ page }) => {
    await page.goto('/owner/dashboard')

    // La barra lateral esta oculta bajo `md`; lo que se ve es la de abajo.
    await expect(page.locator('[data-tour="nav-sidebar"]')).toBeHidden()

    const barra = page.getByRole('navigation', { name: 'Navegación principal' })
    await expect(barra).toBeVisible()

    await barra.getByRole('link', { name: 'Boletas', exact: true }).tap()
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

  test('en el telefono los clientes son tarjetas, no una tabla encogida', async ({ page }) => {
    await page.goto('/owner/clients')

    const lista = page.getByRole('list', { name: 'Clientes' })
    await expect(lista).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Cliente' })).toBeHidden()

    const tarjeta = lista.getByRole('listitem').first()
    await expect(tarjeta.getByRole('link')).toBeVisible()
    await expect(tarjeta).toContainText('Boletas')
    await expect(tarjeta).toContainText('Saldo')
  })

  test('en el telefono las boletas son tarjetas, no una tabla encogida', async ({ page }) => {
    await page.goto('/owner/tickets')

    // La tabla existe en el DOM pero Tailwind la oculta bajo `md` (D-107): lo
    // que se ve es la lista de tarjetas, y con ella deja de haber encabezados.
    const lista = page.getByRole('list', { name: 'Boletas' })
    await expect(lista).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Boleta', exact: true })).toBeHidden()

    // Y no se pierde nada de lo que la tabla enseña en escritorio: los dos
    // numeros, el vendedor, el cliente, los dos estados y el precio.
    const tarjeta = lista.getByRole('listitem').first()
    await expect(tarjeta.getByRole('link', { name: /Ver la boleta/ })).toBeVisible()
    await expect(tarjeta).toContainText('Diario · Semanal')
  })

  test('el formulario de boleta es usable con teclado numerico', async ({ page }) => {
    await page.goto('/owner/tickets/new')

    const daily = page.getByLabel('Número diario')
    await expect(daily).toHaveAttribute('inputmode', 'numeric')
    await daily.fill('0007')
    await expect(daily).toHaveValue('0007')
  })
})
