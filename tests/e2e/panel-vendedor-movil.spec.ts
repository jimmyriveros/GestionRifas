import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * El panel del vendedor en el telefono se lee en el MISMO orden que en
 * escritorio (D-180).
 *
 * Es lo contrario de lo que comprobaba esta prueba hasta D-175: entonces el
 * telefono reordenaba con clases `order-*` para subir los accesos rapidos por
 * encima del dinero, y aqui se verificaba justamente esa diferencia. Con el
 * catalogo y las loterias abriendo la pantalla, ese apaño dejo de hacer falta:
 * lo que un vendedor viene a hacer ya esta arriba en los dos sitios.
 *
 * Sigue siendo una prueba de MOVIL y no una de HTML, porque lo que se comprueba
 * es el orden VISUAL —posicion en pantalla—, que es lo unico capaz de detectar
 * que alguien vuelva a introducir un `order-*`.
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
  test('el catálogo y las loterías abren la pantalla; los accesos rápidos la cierran', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const orden = await regionesEnOrden(page)

    expect(orden.slice(0, 4)).toEqual([
      'Comparte tu catálogo',
      'Loterías',
      'Estado de cobro',
      'Mis boletas',
    ])

    // Lo que ya pasó va después del dinero: primero se cobra, luego se repasa.
    expect(orden.indexOf('Recaudado')).toBeGreaterThan(orden.indexOf('Estado de cobro'))
    expect(orden.indexOf('Actividad reciente')).toBeGreaterThan(orden.indexOf('Recaudado'))

    // Y los accesos rápidos son el último bloque de la pantalla.
    expect(orden.at(-1)).toBe('Accesos rápidos')
  })

  test('el orden visual es EL MISMO que el del documento: ya no hay «order-*»', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    // Es la promesa de D-180, y solo se puede comprobar comparando las dos
    // listas: quien escucha la pantalla recorre el documento, y quien la mira,
    // las posiciones. Si vuelven a separarse, esto falla.
    const visual = await regionesEnOrden(page)
    const enElHtml = await page.locator('main h2').allInnerTexts()
    expect(visual).toEqual(enElHtml.map((t) => t.trim()))
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
