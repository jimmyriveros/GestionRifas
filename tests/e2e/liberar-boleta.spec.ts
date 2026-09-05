import { expect, test } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  purgeTestData,
  raffleTicketPrice,
  serviceClient,
  signedInClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Liberar una boleta vendida (BR-I14, D-169).
 *
 * Lo que se prueba aqui es el RECORRIDO: el boton junto a «Cambiar cliente»
 * bajo la tarjeta del cliente, el dialogo con los dos numeros y el cliente
 * actual, y que la boleta vuelve al inventario y se puede vender otra vez. Las
 * reglas viven en SQL y las prueba `tests/db/release-ticket.test.ts`.
 *
 * El movil vive en `liberar-boleta-movil.spec.ts`.
 */

let refs: SeedRefs
let PRICE: number

const MOTIVO = 'El cliente ya no la quiere'

/**
 * Todo lo que crea esta suite, para borrarlo al terminar (I-035).
 *
 * No es higiene opcional: «Mis clientes» enseña los 25 primeros por nombre sin
 * buscar nada y «Ventas por fecha» cuenta las ventas de HOY, así que unos
 * cuantos clientes y boletas de más tumban pruebas de otras suites que no
 * tienen nada roto. Las boletas se apuntan aparte porque, tras liberarlas, ya
 * no cuelgan de ningún cliente.
 */
const clientesCreados: string[] = []
const ticketsCreados: string[] = []

async function clienteDe(nombre: string, sellerId?: string) {
  const client = await createClientFor(refs, unique(nombre), sellerId)
  clientesCreados.push(client.id)
  return client
}

async function ticketOf(clientId: string) {
  const numbers = randomTicketNumbers()
  const ticket = await createAssignedTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    clientId,
    salePrice: PRICE,
  })
  ticketsCreados.push(ticket.id)
  return { ...ticket, ...numbers }
}

/** La fila de la boleta tal como está HOY en la base. */
async function ticketRow(ticketId: string) {
  const { data, error } = await serviceClient()
    .from('tickets')
    .select(
      'client_id, inventory_status, sale_price, base_price, sale_date, assigned_at, daily_number, weekly_number, seller_id, internal_code',
    )
    .eq('id', ticketId)
    .single()
  if (error) throw error
  return data
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

test.afterAll(async () => {
  await purgeTestData({ clientIds: clientesCreados, ticketIds: ticketsCreados })
})

test.describe('Liberar una boleta — portal del vendedor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('el dialogo dice los dos numeros y el cliente, y deja la boleta disponible', async ({
    page,
  }) => {
    const cliente = await clienteDe('Liberar cliente')
    const ticket = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Liberar boleta' }).click()

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo.getByRole('heading', { name: 'Liberar boleta' })).toBeVisible()
    await expect(dialogo.getByText(new RegExp(`Dejará de estar asignada a`))).toBeVisible()
    await expect(dialogo.getByText('Número diario')).toBeVisible()
    await expect(dialogo.getByText(ticket.daily, { exact: true })).toBeVisible()
    await expect(dialogo.getByText('Número semanal')).toBeVisible()
    await expect(dialogo.getByText(ticket.weekly, { exact: true })).toBeVisible()
    await expect(dialogo.getByText('Cliente actual')).toBeVisible()
    await expect(dialogo.getByText(cliente.name).first()).toBeVisible()

    await dialogo.getByLabel('Motivo de la liberación').fill(MOTIVO)
    await dialogo.getByRole('button', { name: 'Confirmar liberación' }).click()

    await expectToast(page, new RegExp(`La boleta ${ticket.daily} / ${ticket.weekly} quedó`))
    await expect(page).toHaveURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    // La pantalla ya la enseña sin cliente y sin venta.
    await expect(page.getByText('Todavía no la has vendido.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Liberar boleta' })).toHaveCount(0)

    const fila = await ticketRow(ticket.id)
    expect(fila.inventory_status).toBe('available')
    expect(fila.client_id).toBeNull()
    expect(fila.sale_price).toBeNull()
    expect(fila.base_price).toBeNull()
    expect(fila.sale_date).toBeNull()
    expect(fila.assigned_at).toBeNull()
    // Y lo que no es de la venta se queda como estaba.
    expect(fila.daily_number).toBe(ticket.daily)
    expect(fila.weekly_number).toBe(ticket.weekly)
    expect(fila.seller_id).toBe(refs.sellerId)
    expect(fila.internal_code).toBe(ticket.internalCode)
  })

  test('sin motivo no se puede confirmar, y al cancelar no cambia nada', async ({ page }) => {
    const cliente = await clienteDe('Liberar sin motivo')
    const ticket = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Liberar boleta' }).click()

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo.getByRole('button', { name: 'Confirmar liberación' })).toBeDisabled()
    // Cuatro caracteres tampoco: el mínimo son cinco.
    await dialogo.getByLabel('Motivo de la liberación').fill('nada')
    await expect(dialogo.getByRole('button', { name: 'Confirmar liberación' })).toBeDisabled()

    await dialogo.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialogo).toHaveCount(0)

    const fila = await ticketRow(ticket.id)
    expect(fila.inventory_status).toBe('assigned')
    expect(fila.client_id).toBe(cliente.id)
    expect(fila.sale_price).toBe(PRICE)
  })

  test('la boleta sale de la ficha del cliente y se puede vender otra vez', async ({ page }) => {
    const cliente = await clienteDe('Liberar ficha')
    const otro = await clienteDe('Liberar comprador nuevo')
    const ticket = await ticketOf(cliente.id)
    // La boleta se nombra por sus DOS numeros, que es lo unico unico en la
    // rifa (BR-N04, BR-N11): buscarla por el diario suelto acabaria en la
    // boleta de otra prueba (I-055).
    const enlace = `Ver la boleta ${ticket.daily} / ${ticket.weekly}`

    await page.goto(`/seller/clients/${cliente.id}`)
    await expect(page.getByRole('link', { name: enlace })).toBeVisible()

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Liberar boleta' }).click()
    const dialogo = page.getByRole('alertdialog')
    await dialogo.getByLabel('Motivo de la liberación').fill(MOTIVO)
    await dialogo.getByRole('button', { name: 'Confirmar liberación' }).click()
    await expectToast(page, /quedó disponible/)

    // Ya no está en la ficha de quien la tenía.
    await page.goto(`/seller/clients/${cliente.id}`)
    await expect(page.getByRole('heading', { name: cliente.name })).toBeVisible()
    await expect(page.getByRole('link', { name: enlace })).toHaveCount(0)

    // Y se vende otra vez por el flujo normal, desde la misma pantalla.
    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()
    const venta = page.getByRole('dialog')
    await venta.getByLabel('Buscar').fill(otro.name)
    await venta.getByRole('option', { name: otro.name }).click()
    await venta.getByRole('button', { name: 'Asignar boleta' }).click()
    await expectToast(page, /asignad/i)

    const fila = await ticketRow(ticket.id)
    expect(fila.inventory_status).toBe('assigned')
    expect(fila.client_id).toBe(otro.id)
    expect(fila.sale_price).toBe(PRICE)
  })

  test('una boleta con abonos explica que no puede cambiar de cliente NI liberarse', async ({
    page,
  }) => {
    const cliente = await clienteDe('Liberar con abono')
    const ticket = await ticketOf(cliente.id)

    const seller = await signedInClient(ACCOUNTS.seller)
    const { error } = await seller.rpc('create_payment', {
      p_client_id: cliente.id,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 10_000 }],
    })
    expect(error).toBeNull()

    await page.goto(`/seller/tickets/${ticket.id}`)
    // UNA sola frase, con las dos consecuencias (D-169).
    const aviso = page.getByText(/tiene abonos en su historial/)
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('liberarse')
    await expect(page.getByRole('button', { name: 'Liberar boleta' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cambiar cliente' })).toHaveCount(0)
  })

  test('una boleta sin vender no ofrece ni el boton ni la explicación', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const { data, error } = await serviceClient()
      .from('tickets')
      .insert({
        organization_id: refs.organizationId,
        raffle_id: refs.raffleId,
        seller_id: refs.sellerId,
        daily_number: numbers.daily,
        weekly_number: numbers.weekly,
        inventory_status: 'available',
        created_by: refs.ownerId,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    ticketsCreados.push(data!.id)

    await page.goto(`/seller/tickets/${data!.id}`)
    await expect(page.getByText('Todavía no la has vendido.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Liberar boleta' })).toHaveCount(0)
    await expect(page.getByText(/no se puede liberar/)).toHaveCount(0)
  })
})

test.describe('Liberar una boleta — portal administrativo', () => {
  test('el Dueño usa el mismo dialogo y la boleta vuelve al inventario', async ({ page }) => {
    const cliente = await clienteDe('Admin liberar')
    const ticket = await ticketOf(cliente.id)

    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets/${ticket.id}`)

    // Los dos botones conviven bajo la tarjeta del cliente.
    await expect(page.getByRole('button', { name: 'Cambiar cliente' })).toBeVisible()
    await page.getByRole('button', { name: 'Liberar boleta' }).click()

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo.getByText('Cliente actual')).toBeVisible()
    await expect(dialogo.getByText(cliente.name).first()).toBeVisible()
    await dialogo.getByLabel('Motivo de la liberación').fill(MOTIVO)
    await dialogo.getByRole('button', { name: 'Confirmar liberación' }).click()

    await expectToast(page, /quedó disponible/)
    await expect(page.getByText('Esta boleta todavía no se ha vendido.')).toBeVisible()

    const fila = await ticketRow(ticket.id)
    expect(fila.inventory_status).toBe('available')
    expect(fila.client_id).toBeNull()
  })

  test('un vendedor no puede liberar la boleta de otro: no ve la pantalla', async ({ page }) => {
    const cliente = await clienteDe('Liberar ajena', refs.otherSellerId)
    const numbers = randomTicketNumbers()
    const { data, error } = await serviceClient()
      .from('tickets')
      .insert({
        organization_id: refs.organizationId,
        raffle_id: refs.raffleId,
        seller_id: refs.otherSellerId,
        client_id: cliente.id,
        daily_number: numbers.daily,
        weekly_number: numbers.weekly,
        inventory_status: 'assigned',
        sale_price: PRICE,
        sale_date: new Date().toISOString().slice(0, 10),
        assigned_at: new Date().toISOString(),
        created_by: refs.ownerId,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    ticketsCreados.push(data!.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${data!.id}`)
    // RLS no le devuelve la boleta: la pantalla es un «no encontrado» (BR-U07).
    await expect(page.getByRole('button', { name: 'Liberar boleta' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()

    expect((await ticketRow(data!.id)).inventory_status).toBe('assigned')
  })
})
