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
 * «Mi catálogo público» en el teléfono (BR-K13, D-161).
 *
 * Es donde de verdad se usa: el vendedor abre su panel de pie, con una mano, y
 * lo que quiere es mandarle el enlace a un cliente por WhatsApp. Aquí se
 * comprueba lo que **solo se rompe cuando falta ancho** —que la dirección se
 * recorte de verdad, que los tres controles quepan y sigan midiendo 44 px— y lo
 * que solo tiene sentido en un móvil: que **Compartir sea la acción principal**
 * y abra el menú nativo del sistema.
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

function tarjeta(page: import('@playwright/test').Page) {
  return page.locator('[data-slot="card"]').filter({ hasText: 'Mi catálogo público' })
}

test.describe('en el teléfono', () => {
  test.beforeEach(async ({ page }) => {
    await configurarCatalogo(fixture.refs, true)
    await cerrarRifaPublicada(fixture.refs, false)
    await stubShareAndClipboard(page, { share: 'ok' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')
  })

  test('«Compartir» es la acción principal: va primero y ocupa la fila entera', async ({
    page,
  }) => {
    const card = tarjeta(page)
    const compartir = card.getByRole('button', { name: 'Compartir' })
    const copiar = card.getByRole('button', { name: 'Copiar enlace' })
    const ver = card.getByRole('link', { name: 'Ver catálogo' })

    const [cCompartir, cCopiar, cVer, cCard] = await Promise.all([
      compartir.boundingBox(),
      copiar.boundingBox(),
      ver.boundingBox(),
      card.boundingBox(),
    ])

    // Primero en la pantalla, por encima de las otras dos.
    expect(cCompartir!.y).toBeLessThan(cCopiar!.y)
    expect(cCompartir!.y).toBeLessThan(cVer!.y)
    // Y ocupa el ancho entero de la tarjeta; las otras dos se lo reparten.
    expect(cCompartir!.width).toBeGreaterThan(cCopiar!.width * 1.5)
    expect(cCompartir!.width).toBeGreaterThan(cCard!.width * 0.7)
    // Las otras dos comparten fila.
    expect(Math.abs(cCopiar!.y - cVer!.y)).toBeLessThan(2)
  })

  test('los tres controles miden 44 px y llevan texto visible', async ({ page }) => {
    const card = tarjeta(page)
    for (const nombre of ['Compartir', 'Copiar enlace', 'Ver catálogo']) {
      const control = card.getByRole(nombre === 'Ver catálogo' ? 'link' : 'button', {
        name: nombre,
      })
      const caja = await control.boundingBox()
      expect(caja!.height, `${nombre} mide menos de 44 px`).toBeGreaterThanOrEqual(44)
      await expect(control).toContainText(nombre)
    }
  })

  test('la tarjeta no desborda el ancho de la pantalla', async ({ page }) => {
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(0)
  })

  test('«Compartir» abre el menú nativo con el mensaje promocional', async ({ page }) => {
    await tarjeta(page).getByRole('button', { name: 'Compartir' }).click()

    await expect.poll(() => shareCalls(page).then((c) => c.length)).toBe(1)
    const datos = (await shareCalls(page))[0]!
    expect(datos.title).toBe(`Números disponibles — ${RIFA}`)
    expect(datos.text).toContain('Consulta mis números disponibles y solicita el que más te guste:')
    expect(datos.url).toMatch(new RegExp(`/catalogo/${CATALOG_SLUG}$`))
  })

  test('«Copiar enlace» sigue disponible como alternativa', async ({ page }) => {
    await tarjeta(page).getByRole('button', { name: 'Copiar enlace' }).click()

    await expectToast(page, COPIADO)
    expect((await clipboardWrites(page))[0]).toMatch(new RegExp(`/catalogo/${CATALOG_SLUG}$`))
  })
})

test.describe('una dirección larga en una pantalla estrecha', () => {
  const SLUG_LARGO = `catalogo-de-prueba-con-un-nombre-larguisimo-que-no-cabe-${'x'.repeat(20)}`

  test.afterAll(async () => {
    await configurarCatalogo(fixture.refs, true)
  })

  test('se recorta de verdad, y las acciones siguen usando la completa', async ({ page }) => {
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

    // AQUÍ sí: a 412 px la dirección no cabe y el navegador la recorta.
    const recortada = await url.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(recortada, 'la dirección larga no se recorta en el teléfono').toBe(true)

    // Y aun así no desborda la pantalla.
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(0)

    // Las tres acciones usan la dirección entera, no la que se ve.
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

test.describe('sin enlace que compartir, en el teléfono', () => {
  test.afterAll(async () => {
    await configurarCatalogo(fixture.refs, true)
  })

  test('dice «Inactivo» y no deja ningún botón que lleve a una página inválida', async ({
    page,
  }) => {
    await apagarCatalogo(fixture.refs)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const card = tarjeta(page)
    await expect(card.getByText('Inactivo', { exact: true })).toBeVisible()
    await expect(card.getByText('Tu enlace todavía no está disponible')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Compartir' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Copiar enlace' })).toHaveCount(0)
    await expect(card.getByRole('link', { name: 'Ver catálogo' })).toHaveCount(0)
  })
})
