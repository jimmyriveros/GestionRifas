import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'
import {
  borrarCarteraSecreta,
  crearCarteraSecreta,
  expectSinSecretos,
  registrarRespuestas,
  type CarteraSecreta,
} from './privacidad-escenario'

/**
 * La cartera es del vendedor (D-198), en el teléfono.
 *
 * Corre en el proyecto `movil` (Pixel 7). En el teléfono la lista son tarjetas
 * (D-107), la navegación es la barra inferior (D-106) y el resto vive en el menú
 * de usuario: tres sitios por donde la cartera podría colarse y que la versión
 * de escritorio (`privacidad-admin.spec.ts`) no recorre. El escenario y la
 * búsqueda de sus valores en lo recibido son los de `privacidad-escenario.ts`.
 */

let cartera: CarteraSecreta

test.beforeAll(async () => {
  cartera = await crearCarteraSecreta()
})

test.afterAll(async () => {
  await borrarCarteraSecreta(cartera)
})

const PERSONAL = [
  { rol: 'Dueño', email: ACCOUNTS.owner },
  { rol: 'Administrador', email: ACCOUNTS.admin },
] as const

/** La tarjeta de la boleta del escenario en la lista del teléfono. */
function tarjetaDeLaBoleta(page: Page) {
  return page
    .getByRole('list', { name: 'Boletas' })
    .getByRole('listitem')
    .filter({ has: page.locator(`a[href$="/${cartera.ticketId}"]`) })
}

function barra(page: Page) {
  return page.getByRole('navigation', { name: 'Navegación principal' })
}

for (const { rol, email } of PERSONAL) {
  test.describe(`${rol} en el teléfono: la cartera del vendedor no llega`, () => {
    test('la tarjeta y el detalle enseñan la boleta sin cliente ni dinero', async ({ page }) => {
      await loginAs(page, email)
      const red = registrarRespuestas(page)

      await page.goto(`/owner/tickets?q=${cartera.numeros.daily}`)
      const tarjeta = tarjetaDeLaBoleta(page)
      await expect(tarjeta).toBeVisible()
      await expect(tarjeta.getByText('Sin pagar', { exact: true })).toBeVisible()
      await expect(tarjeta).not.toContainText('Sin cliente')
      await expect(tarjeta).not.toContainText('Abonada')

      await page.goto(`/owner/tickets/${cartera.ticketId}`)
      await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
      await expect(page.getByText('Sin pagar', { exact: true })).toBeVisible()
      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(desborde).toBeLessThanOrEqual(2)

      expectSinSecretos(
        (await red.texto()) + (await page.content()),
        cartera,
        'boleta en el teléfono',
      )
    })

    test('ni la barra inferior ni el menú de usuario ofrecen Clientes o Pagos, y sus direcciones no existen', async ({
      page,
    }) => {
      await loginAs(page, email)

      await expect(barra(page).getByRole('link')).toHaveCount(2)
      for (const nombre of ['Panel', 'Boletas']) {
        await expect(barra(page).getByRole('link', { name: nombre, exact: true })).toBeVisible()
      }

      await page.getByRole('button', { name: /Menú de usuario/ }).tap()
      await expect(page.getByRole('menuitem', { name: 'Vendedores' })).toBeVisible()
      for (const nombre of ['Clientes', 'Pagos']) {
        await expect(page.getByRole('menuitem', { name: nombre })).toHaveCount(0)
      }
      await page.keyboard.press('Escape')

      for (const ruta of [
        '/owner/clients',
        `/owner/clients/${cartera.clientId}`,
        '/owner/payments',
      ]) {
        const respuesta = await page.goto(ruta)
        expect(respuesta?.status(), ruta).toBe(404)
        await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
      }
    })
  })
}

test.describe('El vendedor conserva su cartera en el teléfono (regresión de D-198)', () => {
  test('su tarjeta enseña el cliente y «Abonada»', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${cartera.numeros.daily}`)

    const tarjeta = tarjetaDeLaBoleta(page)
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta).toContainText(cartera.nombre)
    await expect(tarjeta.getByText('Abonada', { exact: true })).toBeVisible()
  })
})
