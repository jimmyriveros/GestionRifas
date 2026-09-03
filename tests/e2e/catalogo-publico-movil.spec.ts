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

  test('en el telefono se descarga UNA composicion, la vertical (D-163)', async ({ page }) => {
    const imagenes: string[] = []
    page.on('response', (res) => {
      const url = res.url()
      if (url.includes('/_next/image') || /\.(webp|png|jpg|avif)(\?|$)/i.test(url)) {
        imagenes.push(decodeURIComponent(url))
      }
    })

    await abrirSinSesion(page, `/catalogo/${SLUG}`)
    await page.waitForLoadState('networkidle')

    const heroes = imagenes.filter((url) => url.includes('/images/catalog/catalog-hero-'))
    expect(heroes).toHaveLength(1)
    // La vertical, que es la que deja el hueco de arriba para el texto. Bajar
    // aqui la horizontal significaria pagar 300 KB por una composicion que
    // ademas no encaja.
    expect(heroes[0]).toContain('catalog-hero-mobile')
    expect(heroes[0]).not.toContain('catalog-hero-desktop')
  })

  test('el encabezado fijo no se come la pantalla (D-163)', async ({ page }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}`)

    const header = await page.locator('header').boundingBox()
    const alto = await page.evaluate(() => window.innerHeight)

    // Antes del rediseño llevaba dentro el titulo y el buscador y pasaba de
    // 150 px. Ahora dice quien es y como escribirle, y nada mas.
    expect(header!.height).toBeLessThan(alto * 0.14)
  })

  test('el buscador se posa bajo el encabezado sin perder lo escrito ni desbordar (D-164)', async ({
    page,
  }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}`)

    const campo = page.getByRole('searchbox')
    // «0» a proposito: casi todas las boletas lo llevan, asi que la lista sigue
    // siendo larga y queda pagina que bajar. Con un termino que filtrara a dos
    // resultados no habria scroll que probar.
    await campo.pressSequentially('0', { delay: 30 })

    // HAY QUE ESPERAR A QUE LA NAVEGACION ATERRICE ANTES DE BAJAR, y no es una
    // manera de dormir: al llegar, el enrutador devuelve la pagina arriba del
    // todo. Bajar antes y medir despues daba un buscador «sin posar» que en
    // realidad si se habia posado y habia vuelto.
    await expect(page).toHaveURL(/q=0/)

    await page.evaluate(() => window.scrollTo(0, 4000))
    await page.waitForTimeout(400)

    const header = (await page.locator('header').boundingBox())!
    const caja = (await campo.boundingBox())!

    // DENTRO de la fila del encabezado, no en una franja debajo (D-165).
    expect(caja.y).toBeGreaterThanOrEqual(header.y - 1)
    expect(caja.y + caja.height).toBeLessThanOrEqual(header.y + header.height + 1)

    // Sigue siendo UNO, conserva el valor y mantiene una diana tactil de 40 px,
    // que es lo que cabe en una fila de encabezado de 56.
    await expect(campo).toHaveCount(1)
    await expect(campo).toHaveValue('0')
    expect(caja.height).toBeGreaterThanOrEqual(40)

    // Y la pagina no se desplaza en horizontal por tener un elemento fijo.
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(0)
  })

  test('ninguna etiqueta del resumen se recorta, y la principal manda (D-165)', async ({ page }) => {
    await abrirSinSesion(page, `/catalogo/${SLUG}`)

    const resumen = page.getByRole('region', { name: 'Resumen del catálogo' })
    await expect(resumen).toBeVisible()

    // El fallo real: con tres columnas en el telefono salia «números dis…» y
    // «ya fueron to…». Una cifra sin su nombre entero no dice nada.
    for (const texto of ['números disponibles', 'ya fueron tomados', 'reservado']) {
      const etiqueta = resumen.getByText(texto, { exact: true })
      await expect(etiqueta, `«${texto}» no está entero`).toBeVisible()
      const recortado = await etiqueta.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
      expect(recortado, `«${texto}» sale recortado`).toBe(false)
    }

    // «Números disponibles» es la metrica principal: ocupa la fila entera y su
    // cifra es la mas grande.
    const valores = resumen.locator('[data-testid="catalog-stat-value"]')
    const cajas = await valores.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { y: Math.round(r.y), alto: Math.round(parseFloat(getComputedStyle(el).fontSize)) }
      }),
    )
    expect(cajas).toHaveLength(3)
    expect(cajas[0]!.alto).toBeGreaterThan(cajas[1]!.alto)
    // Las dos secundarias comparten fila, y la principal va sola encima.
    expect(cajas[1]!.y).toBe(cajas[2]!.y)
    expect(cajas[0]!.y).toBeLessThan(cajas[1]!.y)
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
