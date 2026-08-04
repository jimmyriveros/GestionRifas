import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Fase 6, pruebas 6 y 7: los reportes en un telefono, y accesibilidad basica.
 *
 * Se ejecuta solo en el proyecto «movil» (Pixel 7) de playwright.config.ts.
 *
 * El criterio de la fase es que la aplicacion sea utilizable de principio a fin
 * desde un telefono. Una tabla de reporte es lo primero que rompe eso: seis
 * columnas de cifras no caben en 412 px. Aqui se comprueba que el ancho lo
 * absorbe el contenedor de la tabla y no la pagina entera.
 */

const REPORTES = ['sellers', 'ticket-status', 'raffles', 'client-balances', 'payments'] as const

test.describe('Reportes en movil', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('ningun reporte desborda horizontalmente la pagina', async ({ page }) => {
    for (const reporte of REPORTES) {
      await page.goto(`/owner/reports?report=${reporte}`)
      await page.waitForLoadState('networkidle')

      const desbordamiento = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(desbordamiento, `desbordamiento en el reporte ${reporte}`).toBeLessThanOrEqual(2)
    }
  })

  test('la tabla ancha hace scroll dentro de su contenedor, no en la pagina', async ({ page }) => {
    await page.goto('/owner/reports?report=raffles')

    // El contenedor de la tabla es quien puede desplazarse: eso es lo que
    // permite leer todas las columnas sin romper el resto de la pantalla.
    const contenedor = page.locator('div.overflow-x-auto').filter({ has: page.getByRole('table') })
    await expect(contenedor.first()).toBeVisible()

    const scrollable = await contenedor.first().evaluate((el) => el.scrollWidth >= el.clientWidth)
    expect(scrollable).toBe(true)
  })

  test('las columnas secundarias se ocultan y quedan las que importan', async ({ page }) => {
    await page.goto('/owner/reports?report=sellers')

    const encabezados = page.getByRole('table').locator('thead th')
    await expect(encabezados.filter({ hasText: 'Vendedor' })).toBeVisible()
    await expect(encabezados.filter({ hasText: 'Saldo' })).toBeVisible()
    // «Boletas» y «Recaudado» estan marcadas como secundarias.
    await expect(encabezados.filter({ hasText: 'Recaudado' })).toBeHidden()
  })

  test('se llega a los reportes desde el drawer', async ({ page }) => {
    await page.goto('/owner/dashboard')

    await page
      .getByRole('button', { name: /menu|abrir/i })
      .first()
      .click()

    const enlace = page.getByRole('link', { name: 'Reportes' })
    await expect(enlace).toBeVisible()
    await enlace.click()

    await page.waitForURL(/\/owner\/reports/)
    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()
  })

  test('el selector de reporte se desplaza y sigue siendo alcanzable', async ({ page }) => {
    await page.goto('/owner/reports')

    const nav = page.getByRole('navigation', { name: 'Reportes disponibles' })
    await expect(nav).toBeVisible()

    // El ultimo reporte debe poder pulsarse aunque no quepa en pantalla.
    const ultimo = nav.getByRole('link', { name: 'Pagos por fecha' })
    await ultimo.scrollIntoViewIfNeeded()
    await ultimo.click()
    await page.waitForURL(/report=payments/)
  })
})

test.describe('Accesibilidad basica de los reportes (prueba 7)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('cada tabla tiene un titulo para lectores de pantalla', async ({ page }) => {
    for (const reporte of REPORTES) {
      await page.goto(`/owner/reports?report=${reporte}`)
      const caption = page.getByRole('table').locator('caption')
      await expect(caption, `sin caption en ${reporte}`).toHaveCount(1)
      expect((await caption.innerText()).trim().length).toBeGreaterThan(0)
    }
  })

  test('los encabezados de columna son <th> con scope', async ({ page }) => {
    await page.goto('/owner/reports?report=sellers')
    // `count()` no auto-espera: sin esto se ejecutaria contra el esqueleto de
    // carga y contaria cero encabezados.
    await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()

    const th = page.getByRole('table').locator('thead th')
    expect(await th.count()).toBeGreaterThan(0)
    for (const celda of await th.all()) {
      await expect(celda).toHaveAttribute('scope', 'col')
    }
  })

  test('el reporte activo se anuncia con aria-current', async ({ page }) => {
    await page.goto('/owner/reports?report=raffles')

    const activo = page
      .getByRole('navigation', { name: 'Reportes disponibles' })
      .getByRole('link', { name: 'Boletas por rifa' })
    await expect(activo).toHaveAttribute('aria-current', 'page')
  })

  test('cada filtro tiene su etiqueta asociada', async ({ page }) => {
    await page.goto('/owner/reports?report=payments')

    for (const etiqueta of ['Vendedor', 'Desde', 'Hasta', 'Metodo', 'Estado del pago']) {
      await expect(page.getByLabel(etiqueta)).toBeVisible()
    }
  })

  test('los estados vacios explican que hacer, no solo que no hay nada', async ({ page }) => {
    await page.goto('/owner/reports?report=payments&dateFrom=2000-01-01&dateTo=2000-12-31')

    await expect(page.getByText('Ningun pago en este rango')).toBeVisible()
    await expect(page.getByText(/ampliar las fechas/i)).toBeVisible()
  })
})
