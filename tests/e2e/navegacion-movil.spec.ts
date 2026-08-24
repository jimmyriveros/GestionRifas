import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Barra de navegacion inferior del telefono (D-106).
 *
 * Corre con viewport de telefono (proyecto `movil`). Comprueba lo unico que no
 * se puede comprobar en escritorio: que la barra lateral desaparece, que la
 * inferior la sustituye con cuatro opciones, que sigue marcando el modulo
 * correcto dentro de una ficha de detalle, y que no tapa el final de la pagina
 * ni desborda a lo ancho a 320 px.
 */

const OPCIONES = ['Panel', 'Boletas', 'Clientes', 'Pagos'] as const

/** Los anchos del encargo: telefono pequeno, estandar y grande. */
const ANCHOS = [320, 375, 390, 430]

function barra(page: Page) {
  return page.getByRole('navigation', { name: 'Navegación principal' })
}

function opcion(page: Page, nombre: string) {
  return barra(page).getByRole('link', { name: nombre, exact: true })
}

/** La opcion encendida: `aria-current="page"`, no un color. */
function activa(page: Page) {
  return barra(page).locator('a[aria-current="page"]')
}

test.describe('Navegación inferior en el teléfono', () => {
  test('sustituye a la barra lateral y ofrece las cuatro opciones', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    // La lateral sigue en el HTML —es la misma lista— pero Tailwind la oculta.
    await expect(page.locator('[data-tour="nav-sidebar"]')).toBeHidden()
    await expect(barra(page)).toBeVisible()

    // Ni una mas ni una menos, y en el orden del encargo.
    await expect(barra(page).getByRole('link')).toHaveCount(4)
    for (const nombre of OPCIONES) {
      await expect(opcion(page, nombre)).toBeVisible()
    }

    // Y el boton de menú del cajón lateral ya no existe: las dos navegaciones
    // no conviven en el teléfono.
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveCount(0)
  })

  test('el dueño ve las mismas cuatro, no las ocho del menú lateral', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)

    await expect(barra(page).getByRole('link')).toHaveCount(4)
    for (const nombre of OPCIONES) {
      await expect(opcion(page, nombre)).toBeVisible()
    }
    await expect(barra(page).getByRole('link', { name: 'Reportes' })).toHaveCount(0)
  })

  test('cada opción lleva a la ruta de siempre y queda marcada', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await expect(activa(page)).toHaveText(/Panel/)

    await opcion(page, 'Boletas').tap()
    await page.waitForURL('**/seller/tickets')
    await expect(activa(page)).toHaveText(/Boletas/)

    await opcion(page, 'Clientes').tap()
    await page.waitForURL('**/seller/clients')
    await expect(activa(page)).toHaveText(/Clientes/)

    await opcion(page, 'Pagos').tap()
    await page.waitForURL('**/seller/payments')
    await expect(activa(page)).toHaveText(/Pagos/)

    await opcion(page, 'Panel').tap()
    await page.waitForURL('**/seller/dashboard')
    await expect(activa(page)).toHaveText(/Panel/)
  })

  test('dentro del detalle de una boleta sigue visible y sigue en «Boletas»', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')

    const primera = page.getByRole('link', { name: /Ver la boleta/ }).first()
    await expect(primera).toBeVisible()
    await primera.tap()
    await page.waitForURL(/\/seller\/tickets\/[0-9a-f-]+$/)

    await expect(barra(page)).toBeVisible()
    await expect(activa(page)).toHaveText(/Boletas/)
  })

  test('una pantalla fuera de la barra no enciende ninguna opción', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/team')

    await expect(barra(page)).toBeVisible()
    await expect(activa(page)).toHaveCount(0)
  })

  test('no tapa el final de la página', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    // En el telefono la lista son tarjetas, no una tabla (D-107).
    await expect(page.getByRole('list', { name: 'Boletas' })).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    // El ultimo elemento real del contenido termina por encima del borde
    // superior de la barra: el hueco lo reserva el armazon, no cada pantalla.
    const barraCaja = (await barra(page).boundingBox())!
    const ultimo = page.locator('main *:not(:has(*))').last()
    const ultimoCaja = (await ultimo.boundingBox())!
    expect(ultimoCaja.y + ultimoCaja.height).toBeLessThanOrEqual(barraCaja.y)
  })

  test('cabe desde 320 px sin cortar etiquetas ni desbordar a lo ancho', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    for (const ancho of ANCHOS) {
      await page.setViewportSize({ width: ancho, height: 800 })
      await expect(barra(page)).toBeVisible()

      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(desborde, `desborde horizontal a ${ancho} px`).toBeLessThanOrEqual(0)

      for (const nombre of OPCIONES) {
        const caja = (await opcion(page, nombre).boundingBox())!
        // Diana comoda para el dedo: al menos 44 px de alto y de ancho.
        expect(caja.height, `alto de «${nombre}» a ${ancho} px`).toBeGreaterThanOrEqual(44)
        expect(caja.width, `ancho de «${nombre}» a ${ancho} px`).toBeGreaterThanOrEqual(44)
        expect(caja.x + caja.width, `«${nombre}» se sale a ${ancho} px`).toBeLessThanOrEqual(
          ancho + 1,
        )
      }

      // Y la etiqueta se lee entera: nada de «Client…».
      const cortada = await opcion(page, 'Clientes').evaluate((link) => {
        const label = link.lastElementChild as HTMLElement
        return label.scrollWidth > label.clientWidth
      })
      expect(cortada, `«Clientes» cortada a ${ancho} px`).toBe(false)
    }
  })
})

test.describe('Reportes en el teléfono', () => {
  test('sale del menú de usuario, con su ruta y su pantalla de siempre', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    await page.getByRole('button', { name: /Menú de usuario/ }).tap()
    const reportes = page.getByRole('menuitem', { name: 'Reportes' })
    await expect(reportes).toBeVisible()
    await reportes.click()

    await page.waitForURL('**/seller/reports')
    await expect(barra(page)).toBeVisible()
  })

  test('el dueño encuentra ahí también rifas, vendedores y administradores', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)

    await page.getByRole('button', { name: /Menú de usuario/ }).tap()
    for (const nombre of ['Rifas', 'Vendedores', 'Reportes', 'Administradores']) {
      await expect(page.getByRole('menuitem', { name: nombre })).toBeVisible()
    }
  })
})
