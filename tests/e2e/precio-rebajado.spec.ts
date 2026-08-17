import { expect, test } from '@playwright/test'

import {
  createClientFor,
  createTicket,
  loadSeedRefs,
  raffleTicketPrice,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Vender una boleta mas barata, desde la pantalla (BR-P09..BR-P11, D-099).
 *
 * Lo que se comprueba aqui es el RECORRIDO de la persona: que la casilla llega
 * precargada con el precio de la rifa, que rebajarlo mueve el total, que un
 * exceso se explica antes de enviar nada, y que despues el cliente debe lo
 * rebajado y no lo oficial. Las reglas financieras —de donde sale la rebaja y
 * que la empresa no la asume— viven en SQL y las prueba `tests/db/sale-discount`.
 *
 * NINGUNA CIFRA DE PRECIO SE ESCRIBE A MANO (D-098): se lee de la rifa y la
 * rebaja se expresa relativa a ella.
 */

let refs: SeedRefs
let PRECIO: number

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRECIO = await raffleTicketPrice(refs)
})

/** Una boleta disponible del vendedor 1. */
async function boletaDisponible() {
  const numbers = randomTicketNumbers()
  return createTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    inventoryStatus: 'available',
  })
}

test.describe('Precio de venta rebajado', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('la casilla llega con el precio de la rifa y no hay que tocarla', async ({ page }) => {
    const ticket = await boletaDisponible()
    const client = await createClientFor(refs, unique('Compra normal'))

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    // Precargada con el precio vigente: el camino de en medio no cambia
    // (seccion 6 del encargo).
    const precio = page.getByLabel('Precio de venta')
    await expect(precio).toHaveValue(formatoCOP(PRECIO))
    await expect(page.getByText(/Lo que rebajes sale de la ganancia/)).toBeVisible()

    await page.getByLabel('Buscar').fill(client.name)
    await page.getByRole('option', { name: new RegExp(client.name) }).click()
    await page.getByRole('button', { name: 'Asignar boleta' }).click()

    await expectToast(page, 'Boleta asignada.')

    // Vendida al precio oficial y SIN mencion de rebaja: anunciar «rebaja de
    // $0» seria ruido (seccion 11 del encargo).
    await expect(page.getByText(formatoCOP(PRECIO)).first()).toBeVisible()
    await expect(page.getByText(/rebaja de/)).toHaveCount(0)
  })

  test('rebaja el precio y el cliente queda debiendo lo rebajado', async ({ page }) => {
    const ticket = await boletaDisponible()
    const client = await createClientFor(refs, unique('Compra rebajada'))
    const rebaja = 20_000
    const rebajado = PRECIO - rebaja

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    await page.getByLabel('Precio de venta').fill(String(rebajado))
    await page.getByLabel('Buscar').fill(client.name)
    await page.getByRole('option', { name: new RegExp(client.name) }).click()

    // El resumen previo ya habla del precio nuevo, no del oficial.
    await expect(page.getByText(`Rebaja de ${formatoCOP(rebaja)}`)).toBeVisible()

    await page.getByRole('button', { name: 'Asignar boleta' }).click()
    await expectToast(page, 'Boleta asignada.')

    // El detalle explica de donde sale el precio distinto.
    await expect(page.getByText(formatoCOP(rebajado)).first()).toBeVisible()
    await expect(
      page.getByText(`Precio de la rifa ${formatoCOP(PRECIO)} · rebaja de ${formatoCOP(rebaja)}`),
    ).toBeVisible()
  })

  test('avisa antes de enviar cuando la rebaja se pasa del limite', async ({ page }) => {
    const ticket = await boletaDisponible()
    const client = await createClientFor(refs, unique('Rebaja excesiva'))

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    // Quien no pertenece a un equipo cobra la mitad: por debajo de esa mitad no
    // hay comision de donde sacar la rebaja (BR-G18).
    const demasiado = Math.floor(PRECIO / 2) - 1_000
    await page.getByLabel('Precio de venta').fill(String(demasiado))

    const aviso = page.getByRole('alert').filter({ hasText: /Es más barato de lo que puedes/ })
    await expect(aviso).toBeVisible()

    await page.getByLabel('Buscar').fill(client.name)
    await page.getByRole('option', { name: new RegExp(client.name) }).click()
    await page.getByRole('button', { name: 'Asignar boleta' }).click()

    // No se vendio: la boleta sigue disponible.
    await expect(page.getByText('Disponible').first()).toBeVisible()
  })

  test('no deja poner un precio mayor que el de la rifa', async ({ page }) => {
    const ticket = await boletaDisponible()

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    await page.getByLabel('Precio de venta').fill(String(PRECIO + 10_000))

    await expect(
      page.getByRole('alert').filter({ hasText: /Puedes vender más barato, no más caro/ }),
    ).toBeVisible()
  })
})

/** El mismo formato que pinta la aplicacion: «$120.000». */
function formatoCOP(amount: number): string {
  return `$${amount.toLocaleString('es-CO')}`
}
