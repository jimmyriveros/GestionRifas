import { expect, test } from '@playwright/test'

import {
  CATALOG_DISPONIBLES,
  CATALOG_SLUG,
  abrirSinSesion,
  desmontarCatalogo,
  montarCatalogo,
  type CatalogFixture,
} from './catalogo-helpers'

/**
 * El catalogo publico en el telefono (D-159, BR-K01).
 *
 * ES DONDE DE VERDAD SE USA: quien abre este enlace lo recibio por WhatsApp y
 * lo abre en el movil, casi siempre de pie y con una mano. El proyecto de
 * Playwright «movil» usa un Pixel 7 (412 px) y, ademas, dos pruebas bajan a
 * 320 px, que es el ancho mas estrecho que el encargo exige soportar.
 *
 * LO QUE SE COMPRUEBA AQUI Y NO EN LA OTRA SUITE es lo que solo se rompe cuando
 * falta ancho: que la pagina no se desplace en horizontal, que el numero de la
 * boleta —lo unico que hay que leer— no quede tapado por su insignia, y que lo
 * que se toca mida al menos 44 px.
 */

const SLUG = CATALOG_SLUG
let fixture: CatalogFixture

test.beforeAll(async () => {
  fixture = await montarCatalogo()
})

test.afterAll(async () => {
  await desmontarCatalogo(fixture)
})

test.describe('en el telefono', () => {
  test('la pagina no se desplaza en horizontal', async ({ page }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}`)

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(0)
  })

  test('el encabezado se queda arriba al bajar', async ({ page }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}`)

    const header = page.locator('header')
    await page.mouse.wheel(0, 1500)
    await page.waitForTimeout(300)

    await expect(header).toBeInViewport()
    const caja = await header.boundingBox()
    expect(caja?.y).toBeLessThanOrEqual(1)
  })

  test('el buscador abre el teclado numerico y mide 44 px de alto', async ({ page }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}`)

    const campo = page.getByRole('searchbox')
    // Lo unico que se escribe aqui son cifras: obligar a cambiar de teclado en
    // cada busqueda es un toque de mas en la pantalla que mas se usa.
    await expect(campo).toHaveAttribute('inputmode', 'numeric')

    const caja = await campo.boundingBox()
    expect(caja!.height).toBeGreaterThanOrEqual(44)
  })

  test('el boton «Solicitar» tiene diana tactil suficiente', async ({ page }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}?q=${CATALOG_DISPONIBLES[0]}`)

    const boton = page.getByRole('link', { name: /Solicitar/ }).first()
    const caja = await boton.boundingBox()
    expect(caja!.height).toBeGreaterThanOrEqual(44)
  })
})

test.describe('a 320 px, el ancho mas estrecho que se soporta', () => {
  test.use({ viewport: { width: 320, height: 720 } })

  test('no hay desplazamiento horizontal', async ({ page }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}`)

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(0)
  })

  test('el numero de la boleta se lee entero: la insignia no lo tapa', async ({ page }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}`)

    const tarjetas = page.locator('main ul li')
    const total = await tarjetas.count()
    expect(total).toBeGreaterThan(0)

    for (let i = 0; i < Math.min(total, 8); i++) {
      const tarjeta = tarjetas.nth(i)
      const numero = tarjeta.locator('p').first()
      const insignia = tarjeta.locator('[data-slot="badge"]')

      const cajaNumero = await numero.boundingBox()
      const cajaInsignia = await insignia.boundingBox()

      // O van en filas distintas, o no se solapan en horizontal. Lo que no
      // puede pasar es que la insignia se pinte encima de la cifra, que es el
      // fallo que tenia la primera version de la tarjeta.
      const enFilasDistintas =
        cajaNumero!.y + cajaNumero!.height <= cajaInsignia!.y + 1 ||
        cajaInsignia!.y + cajaInsignia!.height <= cajaNumero!.y + 1
      const sinSolape = cajaNumero!.x + cajaNumero!.width <= cajaInsignia!.x + 1

      expect(
        enFilasDistintas || sinSolape,
        `la insignia tapa el numero en la tarjeta ${i + 1}`,
      ).toBe(true)

      // Y el texto cabe en su caja: sin esto, un numero recortado por
      // `overflow` pasaria la comprobacion de solape.
      const recortado = await numero.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
      expect(recortado, `el numero de la tarjeta ${i + 1} sale recortado`).toBe(false)
    }
  })

  test('el titulo cabe en dos lineas sin desbordar', async ({ page }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}`)

    const titulo = page.getByRole('heading', { level: 1 })
    await expect(titulo).toBeVisible()

    const recortado = await titulo.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    expect(recortado).toBe(false)
  })

  test('un nombre de vendedor largo no rompe el encabezado', async ({ page }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}`)

    // Se alarga el nombre EN EL NAVEGADOR: lo que se comprueba es la caja, no
    // el dato, y asi no hace falta tocar el seed que usan las demas suites.
    await page.evaluate(() => {
      const p = document.querySelector('header p')
      if (p)
        p.textContent = 'Maria Fernanda del Sagrado Corazon Restrepo Villalobos de la Espriella'
    })

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(0)
  })
})
