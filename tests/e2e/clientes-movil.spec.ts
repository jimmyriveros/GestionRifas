import { expect, test, type Page } from '@playwright/test'

import { createClientFor, loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, unique } from './fixtures'

/**
 * «Mis clientes» en un teléfono (D-136).
 *
 * Corre solo en el proyecto `movil` (Pixel 7). Comprueba las promesas del
 * rediseño, que son justo las que la tabla encogida incumplía:
 *
 *   1. No hay tabla horizontal. Cada cliente es una tarjeta con nombre, alias,
 *      celular, boletas y saldo.
 *   2. No hay scroll horizontal, ni con un nombre largo ni a 320 px.
 *   3. Toda la tarjeta abre el detalle, no solo el nombre.
 *   4. El título y «Nuevo cliente» comparten fila.
 *
 * Lo que NO se comprueba aquí porque ya tiene su sitio: crear, editar, archivar
 * y buscar viven en `seller-clients.spec.ts`; que la barra inferior no tape el
 * final de la lista, en `navegacion-movil.spec.ts`.
 */

let refs: SeedRefs

/** Clientes creados por esta suite. Se borran al terminar (I-035). */
const creados: string[] = []

function lista(page: Page) {
  return page.getByRole('list', { name: 'Clientes' })
}

function tarjetaDe(page: Page, clientId: string) {
  return lista(page)
    .getByRole('listitem')
    .filter({ has: page.locator(`a[href$="${clientId}"]`) })
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  if (creados.length > 0) {
    await serviceClient().from('clients').delete().in('id', creados)
  }
})

test.describe('La lista de clientes en el teléfono', () => {
  test('cada cliente es una tarjeta con nombre, celular, boletas y saldo', async ({ page }) => {
    const nombre = unique('Cristian Leon')
    const cliente = await createClientFor(refs, nombre)
    creados.push(cliente.id)
    await serviceClient()
      .from('clients')
      .update({ alias: 'Payaso', phone: '1111111118' })
      .eq('id', cliente.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients?q=${encodeURIComponent(nombre)}`)

    const tarjeta = tarjetaDe(page, cliente.id)
    await expect(tarjeta).toBeVisible()

    await expect(tarjeta.getByRole('link', { name: nombre })).toBeVisible()
    await expect(tarjeta).toContainText('Payaso')
    await expect(tarjeta).toContainText('1111111118')
    await expect(tarjeta).toContainText('Boletas')
    await expect(tarjeta).toContainText('Saldo')

    // El celular va a la derecha del nombre, no repetido debajo.
    const cajaNombre = (await tarjeta.getByRole('link', { name: nombre }).boundingBox())!
    const cajaCelular = (await tarjeta.getByText('1111111118').boundingBox())!
    expect(cajaCelular.x).toBeGreaterThan(cajaNombre.x + cajaNombre.width - 1)

    const cajaAlias = (await tarjeta.getByText('Payaso').boundingBox())!
    expect(cajaAlias.y).toBeGreaterThan(cajaNombre.y)

    await expect(page.getByRole('columnheader', { name: 'Cliente' })).toBeHidden()
  })

  test('toda la tarjeta abre el detalle, no solo el nombre', async ({ page }) => {
    const nombre = unique('Tarjeta completa')
    const cliente = await createClientFor(refs, nombre)
    creados.push(cliente.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients?q=${encodeURIComponent(nombre)}`)

    const tarjeta = tarjetaDe(page, cliente.id)
    await expect(tarjeta).toBeVisible()

    // El pie no es un enlace: si solo el nombre abriera, este toque no haría nada.
    await tarjeta.getByText('Saldo', { exact: true }).tap()
    await page.waitForURL(new RegExp(`/seller/clients/${cliente.id}$`))
    await expect(page.getByRole('heading', { name: nombre })).toBeVisible()
  })

  test('el título y Nuevo cliente caben en la misma fila', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients')

    const titulo = page.getByRole('heading', { name: 'Mis clientes' })
    const accion = page.getByRole('link', { name: 'Nuevo cliente' })
    await expect(titulo).toBeVisible()
    await expect(accion).toBeVisible()

    const cajaTitulo = (await titulo.boundingBox())!
    const cajaAccion = (await accion.boundingBox())!
    expect(Math.abs(cajaTitulo.y - cajaAccion.y)).toBeLessThan(12)
    expect(cajaAccion.x).toBeGreaterThan(cajaTitulo.x + cajaTitulo.width - 1)
  })

  test('caben varias tarjetas por pantalla y ninguna se sale a lo ancho', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients')
    await expect(lista(page)).toBeVisible()

    const tarjetas = lista(page).getByRole('listitem')
    expect(await tarjetas.count()).toBeGreaterThan(3)

    const ancho = page.viewportSize()!.width
    for (const indice of [0, 1, 2]) {
      const caja = (await tarjetas.nth(indice).boundingBox())!
      expect(caja.height, `alto de la tarjeta ${indice + 1}`).toBeGreaterThanOrEqual(72)
      expect(caja.height, `alto de la tarjeta ${indice + 1}`).toBeLessThanOrEqual(220)
      expect(caja.x + caja.width, `ancho de la tarjeta ${indice + 1}`).toBeLessThanOrEqual(
        ancho + 1,
      )
    }

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(2)
  })

  test('un nombre largo baja de línea sin provocar scroll horizontal', async ({ page }) => {
    const nombre = unique('María Fernanda del Socorro Restrepo Villalobos de la Hoz')
    const cliente = await createClientFor(refs, nombre)
    creados.push(cliente.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients?q=${encodeURIComponent(nombre)}`)

    const tarjeta = tarjetaDe(page, cliente.id)
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta.getByRole('link', { name: nombre })).toBeVisible()

    const caja = (await tarjeta.boundingBox())!
    expect(caja.x + caja.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(2)
  })

  test('a 320 px no hay scroll horizontal y el título no se superpone al botón', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients')
    await expect(lista(page)).toBeVisible()

    const titulo = (await page.getByRole('heading', { name: 'Mis clientes' }).boundingBox())!
    const accion = (await page.getByRole('link', { name: 'Nuevo cliente' }).boundingBox())!
    expect(titulo.x + titulo.width).toBeLessThanOrEqual(accion.x + 1)

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(2)
  })

  test('el buscador y el interruptor de archivados siguen a la vista', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients')

    await expect(page.getByPlaceholder('Nombre, alias, teléfono o correo')).toBeVisible()
    await expect(page.getByLabel('Incluir archivados')).toBeVisible()
  })
})
