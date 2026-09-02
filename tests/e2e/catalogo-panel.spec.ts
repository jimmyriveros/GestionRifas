import { expect, test } from '@playwright/test'

import {
  CATALOG_SLUG,
  apagarCatalogo,
  cerrarRifaPublicada,
  clipboardWrites,
  configurarCatalogo,
  desmontarCatalogo,
  montarCatalogo,
  shareCalls,
  stubShareAndClipboard,
  type CatalogFixture,
} from './catalogo-helpers'
import { ACCOUNTS, expectToast, loginAs } from './fixtures'

/**
 * «Mi catálogo público» en el panel del vendedor (BR-K13, D-161).
 *
 * LOS TRES BOTONES SE PRUEBAN UNO A UNO, y el de compartir en sus **cuatro**
 * caminos: el navegador abre el menú, la persona lo cancela, el navegador lo
 * rechaza, y el navegador no tiene `navigator.share` en absoluto. El menú
 * nativo del sistema no existe dentro de un navegador de pruebas, así que lo
 * que se comprueba es lo único comprobable y lo que de verdad importa: **qué le
 * pide la aplicación al navegador y qué hace con cada una de sus respuestas**.
 *
 * `stubShareAndClipboard` se instala con `addInitScript`, o sea ANTES de que
 * cargue la página, porque el componente lee `navigator.share` en el momento de
 * pulsar y no al montarse.
 */

const COPIADO = 'Enlace copiado. Ya puedes enviarlo a tus clientes.'
const RIFA = 'Rifa Navidad 2026'

let fixture: CatalogFixture

test.beforeAll(async () => {
  fixture = await montarCatalogo()
})

test.afterAll(async () => {
  await cerrarRifaPublicada(fixture.refs, false)
  await desmontarCatalogo(fixture)
})

/** La tarjeta, por su título. */
function tarjeta(page: import('@playwright/test').Page) {
  return page.locator('[data-slot="card"]').filter({ hasText: 'Mi catálogo público' })
}

test.describe('la tarjeta con el catálogo activo', () => {
  test.beforeEach(async ({ page }) => {
    await configurarCatalogo(fixture.refs, true)
    await cerrarRifaPublicada(fixture.refs, false)
    await stubShareAndClipboard(page, { share: 'ok' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')
  })

  test('está cerca de la parte superior, antes del recuadro de loterías', async ({ page }) => {
    const titulos = await page
      .locator('h1, [data-slot="card-title"]')
      .filter({ hasText: /Hola,|Mi catálogo público|Resultados oficiales|Resumen financiero/ })
      .allTextContents()

    const catalogo = titulos.findIndex((t) => t.includes('Mi catálogo público'))
    const loterias = titulos.findIndex((t) => t.includes('Resultados oficiales'))
    const financiero = titulos.findIndex((t) => t.includes('Resumen financiero'))

    expect(catalogo).toBeGreaterThanOrEqual(0)
    expect(catalogo).toBeLessThan(loterias === -1 ? Number.MAX_SAFE_INTEGER : loterias)
    expect(catalogo).toBeLessThan(financiero)
  })

  test('dice «Activo» y muestra la dirección', async ({ page }) => {
    const card = tarjeta(page)
    await expect(card).toBeVisible()
    await expect(card.getByText('Activo', { exact: true })).toBeVisible()
    await expect(card.getByTestId('catalog-public-url')).toContainText(`/catalogo/${CATALOG_SLUG}`)
  })

  test('los tres botones llevan texto visible y miden 44 px', async ({ page }) => {
    const card = tarjeta(page)
    for (const nombre of ['Compartir', 'Copiar enlace', 'Ver catálogo']) {
      const control = card.getByRole(nombre === 'Ver catálogo' ? 'link' : 'button', {
        name: nombre,
      })
      await expect(control).toBeVisible()
      // Texto visible junto al icono: el nombre accesible es el texto.
      await expect(control).toHaveAccessibleName(new RegExp(nombre))
      const caja = await control.boundingBox()
      expect(caja!.height, `${nombre} mide menos de 44 px`).toBeGreaterThanOrEqual(44)
    }
  })

  test('se recorren con el teclado y se activan con Enter', async ({ page }) => {
    const compartir = tarjeta(page).getByRole('button', { name: 'Compartir' })
    await compartir.focus()
    await expect(compartir).toBeFocused()
    await page.keyboard.press('Enter')

    await expect.poll(() => shareCalls(page).then((c) => c.length)).toBe(1)
  })

  test('«Ver catálogo» abre la página pública correcta', async ({ page, context }) => {
    const enlace = tarjeta(page).getByRole('link', { name: 'Ver catálogo' })
    // Usa la dirección COMPLETA, no la recortada que se ve.
    await expect(enlace).toHaveAttribute('href', new RegExp(`/catalogo/${CATALOG_SLUG}$`))
    await expect(enlace).toHaveAttribute('rel', /noopener/)

    const [publica] = await Promise.all([context.waitForEvent('page'), enlace.click()])
    await publica.waitForLoadState('domcontentloaded')
    expect(publica.url()).toContain(`/catalogo/${CATALOG_SLUG}`)
    await expect(publica.getByRole('heading', { level: 1 })).toContainText('NÚMEROS DISPONIBLES')
    await publica.close()
  })

  test('«Copiar enlace» copia la dirección completa y lo confirma', async ({ page }) => {
    await tarjeta(page).getByRole('button', { name: 'Copiar enlace' }).click()

    await expectToast(page, COPIADO)
    const copiado = await clipboardWrites(page)
    expect(copiado).toHaveLength(1)
    expect(copiado[0]).toMatch(new RegExp(`^https?://.+/catalogo/${CATALOG_SLUG}$`))
  })

  test('«Compartir» abre el menú nativo con título, texto y URL', async ({ page }) => {
    await tarjeta(page).getByRole('button', { name: 'Compartir' }).click()

    await expect.poll(() => shareCalls(page).then((c) => c.length)).toBe(1)
    const datos = (await shareCalls(page))[0]!

    expect(datos.title).toBe(`Números disponibles — ${RIFA}`)
    expect(datos.text).toBe(
      `Números disponibles — ${RIFA}\n\nConsulta mis números disponibles y solicita el que más te guste:`,
    )
    expect(datos.url).toMatch(new RegExp(`^https?://.+/catalogo/${CATALOG_SLUG}$`))

    // Compartir NO copia nada: el enlace se fue por el menú del sistema.
    expect(await clipboardWrites(page)).toEqual([])
  })
})

test.describe('«Compartir» cuando no sale bien', () => {
  async function abrir(
    page: import('@playwright/test').Page,
    opciones: Parameters<typeof stubShareAndClipboard>[1],
  ) {
    await configurarCatalogo(fixture.refs, true)
    await cerrarRifaPublicada(fixture.refs, false)
    await stubShareAndClipboard(page, opciones)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')
    await tarjeta(page).getByRole('button', { name: 'Compartir' }).click()
  }

  test('si la persona CANCELA el menú, no se avisa ni se copia nada', async ({ page }) => {
    await abrir(page, { share: 'cancelled' })

    await expect.poll(() => shareCalls(page).then((c) => c.length)).toBe(1)
    // Cancelar a propósito no es un error: ni toast, ni portapapeles.
    await page.waitForTimeout(700)
    expect(await clipboardWrites(page)).toEqual([])
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  })

  test('si el navegador RECHAZA compartir, copia el enlace y lo confirma', async ({ page }) => {
    await abrir(page, { share: 'failed' })

    await expectToast(page, COPIADO)
    const copiado = await clipboardWrites(page)
    expect(copiado).toHaveLength(1)
    expect(copiado[0]).toMatch(new RegExp(`/catalogo/${CATALOG_SLUG}$`))
  })

  test('en un navegador SIN navigator.share, copia el enlace y lo confirma', async ({ page }) => {
    await abrir(page, { share: 'unsupported' })

    await expectToast(page, COPIADO)
    expect(await shareCalls(page)).toEqual([])
    const copiado = await clipboardWrites(page)
    expect(copiado[0]).toMatch(new RegExp(`/catalogo/${CATALOG_SLUG}$`))
  })

  test('si además falla el portapapeles, lo dice sin prometer nada', async ({ page }) => {
    await abrir(page, { share: 'failed', clipboard: 'failed' })

    await expectToast(page, 'No pudimos compartir ni copiar el enlace')
    expect(await clipboardWrites(page)).toEqual([])
  })
})

test.describe('«Copiar enlace» cuando el portapapeles falla', () => {
  test('avisa de que no se copió, en vez de decir que sí', async ({ page }) => {
    await configurarCatalogo(fixture.refs, true)
    await cerrarRifaPublicada(fixture.refs, false)
    await stubShareAndClipboard(page, { share: 'ok', clipboard: 'failed' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    await tarjeta(page).getByRole('button', { name: 'Copiar enlace' }).click()

    await expectToast(page, 'No pudimos copiar el enlace')
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: COPIADO })).toHaveCount(0)
  })
})

test.describe('sin enlace que compartir (BR-K13)', () => {
  test.afterEach(async () => {
    await configurarCatalogo(fixture.refs, true)
    await cerrarRifaPublicada(fixture.refs, false)
  })

  test('con el catálogo apagado dice «Inactivo» y NO ofrece ninguna acción', async ({ page }) => {
    await apagarCatalogo(fixture.refs)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const card = tarjeta(page)
    await expect(card).toBeVisible()
    await expect(card.getByText('Inactivo', { exact: true })).toBeVisible()
    await expect(card.getByText('Tu enlace todavía no está disponible')).toBeVisible()

    await expect(card.getByRole('button', { name: 'Compartir' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Copiar enlace' })).toHaveCount(0)
    await expect(card.getByRole('link', { name: 'Ver catálogo' })).toHaveCount(0)
    // Y no se filtra la dirección de un catálogo que no abre.
    await expect(card).not.toContainText('/catalogo/')
  })

  test('con la rifa CERRADA tampoco: el interruptor engaña, la página daría 404', async ({
    page,
  }) => {
    await configurarCatalogo(fixture.refs, true)
    await cerrarRifaPublicada(fixture.refs, true)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const card = tarjeta(page)
    await expect(card.getByText('Inactivo', { exact: true })).toBeVisible()
    await expect(card.getByRole('link', { name: 'Ver catálogo' })).toHaveCount(0)
  })
})

test.describe('una dirección larga', () => {
  const SLUG_LARGO = `catalogo-de-prueba-con-un-nombre-larguisimo-que-no-cabe-${'x'.repeat(20)}`

  test.afterAll(async () => {
    await configurarCatalogo(fixture.refs, true)
  })

  test('se recorta a la vista, pero las acciones usan la completa', async ({ page }) => {
    const { serviceClient } = await import('./db-setup')
    await serviceClient()
      .from('memberships')
      .update({ public_slug: SLUG_LARGO })
      .eq('profile_id', fixture.refs.sellerId)

    await stubShareAndClipboard(page, { share: 'ok' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const card = tarjeta(page)
    const url = card.getByTestId('catalog-public-url')

    /*
     * En ESCRITORIO se comprueba el mecanismo, no el efecto: la tarjeta es
     * ancha y una dirección de ~105 caracteres cabe entera, así que exigir aquí
     * `scrollWidth > clientWidth` sería exigir que se recorte algo que no
     * sobra. Que de verdad se recorte cuando falta sitio lo comprueba
     * `catalogo-panel-movil.spec.ts`, donde la tarjeta mide 375 px.
     */
    const css = await url.evaluate((el) => {
      const s = getComputedStyle(el)
      return { overflow: s.overflow, textOverflow: s.textOverflow, whiteSpace: s.whiteSpace }
    })
    expect(css).toEqual({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })

    // Recortada o no, el texto completo sigue en el HTML: lo lee un lector de
    // pantalla y lo copia quien seleccione.
    await expect(url).toContainText(SLUG_LARGO)
    await expect(url).toHaveAttribute('title', new RegExp(SLUG_LARGO))

    // …y entera en las tres acciones.
    await expect(card.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute(
      'href',
      new RegExp(`/catalogo/${SLUG_LARGO}$`),
    )

    await card.getByRole('button', { name: 'Copiar enlace' }).click()
    await expect.poll(() => clipboardWrites(page)).toHaveLength(1)
    expect((await clipboardWrites(page))[0]).toContain(SLUG_LARGO)

    await card.getByRole('button', { name: 'Compartir' }).click()
    await expect.poll(() => shareCalls(page).then((c) => c.length)).toBe(1)
    expect((await shareCalls(page))[0]!.url).toContain(SLUG_LARGO)
  })
})
