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
 * «Comparte tu catálogo» en el teléfono (BR-K13, D-161, D-180).
 *
 * Es donde de verdad se usa: el vendedor abre su panel de pie, con una mano, y
 * lo que quiere es mandarle el enlace a un cliente por WhatsApp. Aquí se
 * comprueba lo que **solo se rompe cuando falta ancho** —que los tres controles
 * quepan en UNA fila, apilando icono y texto, y sigan midiendo 44 px— y lo que
 * solo tiene sentido en un móvil: que **Compartir sea la acción principal** y
 * abra el menú nativo del sistema.
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
  return page.locator('[data-slot="card"]').filter({ hasText: 'Comparte tu catálogo' })
}

test.describe('en el teléfono', () => {
  test.beforeEach(async ({ page }) => {
    await configurarCatalogo(fixture.refs, true)
    await cerrarRifaPublicada(fixture.refs, false)
    await stubShareAndClipboard(page, { share: 'ok' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')
  })

  test('las tres acciones van en UNA fila, y «Compartir» es la más ancha', async ({ page }) => {
    const card = tarjeta(page)
    const compartir = card.getByRole('button', { name: 'Compartir' })
    const copiar = card.getByRole('button', { name: 'Copiar enlace' })
    const ver = card.getByRole('link', { name: 'Ver catálogo' })

    const [cCompartir, cCopiar, cVer] = await Promise.all([
      compartir.boundingBox(),
      copiar.boundingBox(),
      ver.boundingBox(),
    ])

    // Las tres a la misma altura: una sola fila (D-180).
    expect(Math.abs(cCopiar!.y - cCompartir!.y)).toBeLessThan(2)
    expect(Math.abs(cVer!.y - cCompartir!.y)).toBeLessThan(2)
    // Y en este orden de izquierda a derecha.
    expect(cCompartir!.x).toBeLessThan(cCopiar!.x)
    expect(cCopiar!.x).toBeLessThan(cVer!.x)
    // «Compartir» es la acción principal y también se nota en el ancho, no solo
    // en el relleno: 1,4 partes de las 3,4 de la fila.
    expect(cCompartir!.width).toBeGreaterThan(cCopiar!.width)
    expect(cCompartir!.width).toBeGreaterThan(cVer!.width)
  })

  test('los tres controles miden 44 px de lado y llevan texto visible', async ({ page }) => {
    const card = tarjeta(page)
    for (const nombre of ['Compartir', 'Copiar enlace', 'Ver catálogo']) {
      const control = card.getByRole(nombre === 'Ver catálogo' ? 'link' : 'button', {
        name: nombre,
      })
      const caja = await control.boundingBox()
      expect(caja!.height, `${nombre} mide menos de 44 px de alto`).toBeGreaterThanOrEqual(44)
      expect(caja!.width, `${nombre} mide menos de 44 px de ancho`).toBeGreaterThanOrEqual(44)
      // El término entero, aunque se parta en dos renglones bajo el icono.
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

/**
 * Una dirección larga ya no se escribe en la tarjeta (D-180), así que aquí no
 * queda nada que recortar. Lo que sigue importando en un teléfono es que no
 * desborde nada y que las tres acciones reciban la dirección ENTERA.
 */
test.describe('una dirección larga en una pantalla estrecha', () => {
  const SLUG_LARGO = `catalogo-de-prueba-con-un-nombre-larguisimo-que-no-cabe-${'x'.repeat(20)}`

  test.afterAll(async () => {
    await configurarCatalogo(fixture.refs, true)
  })

  test('no se escribe, no desborda, y las acciones siguen usando la completa', async ({ page }) => {
    const { serviceClient } = await import('./db-setup')
    await serviceClient()
      .from('memberships')
      .update({ public_slug: SLUG_LARGO })
      .eq('profile_id', fixture.refs.sellerId)

    await stubShareAndClipboard(page, { share: 'ok' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const card = tarjeta(page)
    await expect(card.getByTestId('catalog-public-url')).toHaveCount(0)
    await expect(card).not.toContainText(SLUG_LARGO)

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
