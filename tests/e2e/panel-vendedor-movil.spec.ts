import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * El panel del vendedor en el telefono NO es el de escritorio apilado (D-175).
 *
 * Es la unica forma de comprobar la promesa del rediseño: el orden del
 * documento manda en escritorio, y en el telefono lo cambian las clases
 * `order-*`. Una prueba que solo mirase el HTML veria el orden de escritorio en
 * los dos casos y no diria nada.
 *
 * Lo que se fija aqui es la PRIORIDAD, no la maquetacion: quien abre el panel
 * desde el telefono viene a vender o a cobrar, asi que lo primero son los
 * accesos rapidos y justo detras el dinero. El catalogo y el ofrecimiento de
 * instalar son apoyo y van al final.
 */

/** Los titulos de las regiones, en el orden en que se ven de arriba abajo. */
async function regionesEnOrden(page: import('@playwright/test').Page): Promise<string[]> {
  const cajas = await page.locator('main h2').evaluateAll((nodes) =>
    nodes.map((node) => ({
      texto: (node.textContent ?? '').trim(),
      y: node.getBoundingClientRect().top + window.scrollY,
    })),
  )
  return cajas.sort((a, b) => a.y - b.y).map((caja) => caja.texto)
}

test.describe('Panel del vendedor en móvil', () => {
  test('lo primero son las acciones y el dinero; el apoyo va al final', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const orden = await regionesEnOrden(page)

    expect(orden.slice(0, 3)).toEqual(['Accesos rápidos', 'Estado de cobro', 'Mis boletas'])

    // Lo que ya pasó va al final: primero se cobra, luego se repasa.
    expect(orden.indexOf('Actividad reciente')).toBeGreaterThan(orden.indexOf('Mi catálogo público'))
    expect(orden.indexOf('Recaudado')).toBeGreaterThan(orden.indexOf('Estado de cobro'))

    // Y NO es el orden del documento: ahi «Estado de cobro» va primero.
    const enElHtml = await page.locator('main h2').allInnerTexts()
    expect(enElHtml[0]).toBe('Estado de cobro')
  })

  test('el selector de período vive dentro de «Recaudado» y se puede tocar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const tarjeta = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole('heading', { name: 'Recaudado', exact: true }) })
    const selector = tarjeta.getByLabel(/^Período de las cifras/)

    await expect(selector).toBeVisible()
    // 44 px de alto en el telefono, como el resto de controles (D-085).
    const caja = await selector.boundingBox()
    expect(caja!.height).toBeGreaterThanOrEqual(44)

    await selector.tap()
    await page.getByRole('option', { name: 'Últimos 30 días' }).tap()

    await page.waitForURL(/range=30d/)
    await expect(tarjeta.getByLabel(/^Período de las cifras/)).toBeVisible()
  })
})
