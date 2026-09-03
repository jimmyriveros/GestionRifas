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
 * Corregir el cliente de una boleta vendida (BR-I13, D-168).
 *
 * Lo que se prueba aqui es el RECORRIDO: el boton bajo la tarjeta del cliente,
 * el dialogo con quien la tiene ahora, elegir o crear el cliente correcto, y que
 * la boleta se mueve de una ficha a la otra. Las reglas viven en SQL y las
 * prueba `tests/db/reassign-client.test.ts`.
 *
 * El movil vive en `cambiar-cliente-movil.spec.ts`.
 */

let refs: SeedRefs
let PRICE: number

const MOTIVO = 'La vendi a la persona equivocada'

/**
 * Todo lo que crea esta suite, para borrarlo al terminar (I-035).
 *
 * No es higiene opcional: «Mis clientes» enseña los 25 primeros por nombre sin
 * buscar nada y «Ventas por fecha» cuenta las ventas de HOY, así que catorce
 * clientes y catorce boletas de más tumban pruebas de otras suites que no tienen
 * nada roto. Pasó al escribir esta.
 */
const clientesCreados: string[] = []
const ticketsSueltos: string[] = []

async function clienteDe(nombre: string, sellerId?: string) {
  const client = await createClientFor(refs, unique(nombre), sellerId)
  clientesCreados.push(client.id)
  return client
}

async function ticketOf(clientId: string) {
  const numbers = randomTicketNumbers()
  return createAssignedTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    clientId,
    salePrice: PRICE,
  })
}

/** El cliente que tiene la boleta HOY, leido de la base. */
async function ownerOf(ticketId: string): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from('tickets')
    .select('client_id')
    .eq('id', ticketId)
    .single()
  if (error) throw error
  return data.client_id
}

/** El cliente que creó el propio diálogo: hay que apuntarlo para borrarlo. */
async function clienteCreadoPorLaApp(nombre: string): Promise<{ id: string; seller_id: string }> {
  const { data, error } = await serviceClient()
    .from('clients')
    .select('id, seller_id')
    .eq('name', nombre)
    .single()
  if (error) throw error
  clientesCreados.push(data.id)
  return data
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

test.afterAll(async () => {
  await purgeTestData({ clientIds: clientesCreados, ticketIds: ticketsSueltos })
})

test.describe('Cambiar el cliente de una boleta — portal del vendedor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('el dialogo dice quien la tiene ahora y la pasa a otro cliente', async ({ page }) => {
    const antiguo = await clienteDe('Cambiar cliente antiguo')
    const nuevo = await clienteDe('Cambiar cliente nuevo')
    const ticket = await ticketOf(antiguo.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Cambiar cliente' }).click()

    const dialogo = page.getByRole('dialog')
    await expect(dialogo.getByText('Ahora la tiene')).toBeVisible()
    await expect(dialogo.getByText(antiguo.name)).toBeVisible()

    await dialogo.getByLabel('Motivo de la corrección').fill(MOTIVO)
    await dialogo.getByLabel('Buscar').fill(nuevo.name)
    await dialogo.getByRole('option', { name: nuevo.name }).click()

    await expect(dialogo.getByText(`La boleta pasará a ${nuevo.name}.`)).toBeVisible()
    await dialogo.getByRole('button', { name: 'Cambiar cliente' }).click()

    await expectToast(page, new RegExp(`quedó a nombre de ${nuevo.name}`))
    await expect(page).toHaveURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    await expect(page.getByText(nuevo.name).first()).toBeVisible()
    expect(await ownerOf(ticket.id)).toBe(nuevo.id)
  })

  test('la boleta sale de la ficha del cliente anterior y entra en la del nuevo', async ({
    page,
  }) => {
    const antiguo = await clienteDe('Ficha antigua')
    const nuevo = await clienteDe('Ficha nueva')
    const numbers = randomTicketNumbers()
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: antiguo.id,
      salePrice: PRICE,
    })
    // La boleta se nombra por sus DOS numeros, que es lo unico unico en la
    // rifa (BR-N04, BR-N11): buscarla por el diario suelto acabaria en la
    // boleta de otra prueba (I-055).
    const enlace = `Ver la boleta ${numbers.daily} / ${numbers.weekly}`

    // Antes: la boleta esta en la ficha del cliente equivocado.
    await page.goto(`/seller/clients/${antiguo.id}`)
    await expect(page.getByRole('link', { name: enlace })).toBeVisible()

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Cambiar cliente' }).click()
    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Motivo de la corrección').fill(MOTIVO)
    await dialogo.getByLabel('Buscar').fill(nuevo.name)
    await dialogo.getByRole('option', { name: nuevo.name }).click()
    await dialogo.getByRole('button', { name: 'Cambiar cliente' }).click()
    await expectToast(page, /quedó a nombre de/)

    await page.goto(`/seller/clients/${nuevo.id}`)
    await expect(page.getByRole('heading', { name: nuevo.name })).toBeVisible()
    await expect(page.getByRole('link', { name: enlace })).toBeVisible()

    await page.goto(`/seller/clients/${antiguo.id}`)
    await expect(page.getByRole('heading', { name: antiguo.name })).toBeVisible()
    await expect(page.getByRole('link', { name: enlace })).toHaveCount(0)
    await expect(page.getByText(/Todavía no le has asignado ninguna boleta/)).toBeVisible()
  })

  test('crea el cliente correcto desde el mismo dialogo y le pasa la boleta', async ({ page }) => {
    const antiguo = await clienteDe('Cambiar crear antiguo')
    const nombreNuevo = unique('Cambiar crear nuevo')
    const ticket = await ticketOf(antiguo.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Cambiar cliente' }).click()

    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Motivo de la corrección').fill(MOTIVO)
    await dialogo.getByRole('tab', { name: 'Cliente nuevo' }).click()
    await dialogo.getByLabel('Nombre').fill(nombreNuevo)
    await dialogo.getByLabel('Teléfono').fill('3009998877')
    await dialogo.getByRole('button', { name: 'Crear cliente y cambiar' }).click()

    await expectToast(page, new RegExp(`${nombreNuevo} registrado`))
    await expect(page.getByText(nombreNuevo).first()).toBeVisible()

    const creado = await clienteCreadoPorLaApp(nombreNuevo)
    expect(creado.seller_id).toBe(refs.sellerId)
    expect(await ownerOf(ticket.id)).toBe(creado.id)
  })

  test('sin motivo no se puede confirmar, y al cancelar no cambia nada', async ({ page }) => {
    const antiguo = await clienteDe('Cambiar sin motivo')
    const nuevo = await clienteDe('Cambiar sin motivo destino')
    const ticket = await ticketOf(antiguo.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Cambiar cliente' }).click()

    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Buscar').fill(nuevo.name)
    await dialogo.getByRole('option', { name: nuevo.name }).click()
    await expect(dialogo.getByRole('button', { name: 'Cambiar cliente' })).toBeDisabled()

    await dialogo.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialogo).toHaveCount(0)
    expect(await ownerOf(ticket.id)).toBe(antiguo.id)
  })

  test('el cliente que ya la tiene no aparece entre las opciones', async ({ page }) => {
    const antiguo = await clienteDe('Excluido actual')
    const ticket = await ticketOf(antiguo.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Cambiar cliente' }).click()

    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Buscar').fill(antiguo.name)
    await expect(dialogo.getByRole('option', { name: antiguo.name })).toHaveCount(0)
    await expect(dialogo.getByText(/No encontramos otro cliente de este vendedor/)).toBeVisible()
  })

  test('una boleta con abonos explica por que ya no puede cambiar de cliente', async ({ page }) => {
    const cliente = await clienteDe('Cambiar con abono')
    const ticket = await ticketOf(cliente.id)

    const seller = await signedInClient(ACCOUNTS.seller)
    const { error } = await seller.rpc('create_payment', {
      p_client_id: cliente.id,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 10_000 }],
    })
    expect(error).toBeNull()

    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByText(/tiene abonos en su historial/)).toBeVisible()
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
    // No cuelga de ningún cliente: hay que apuntarla aparte para borrarla.
    ticketsSueltos.push(data!.id)

    await page.goto(`/seller/tickets/${data!.id}`)
    await expect(page.getByText('Todavía no la has vendido.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cambiar cliente' })).toHaveCount(0)
    await expect(page.getByText(/abonos en su historial/)).toHaveCount(0)
  })
})

test.describe('Cambiar el cliente de una boleta — portal administrativo', () => {
  test('el Dueño usa el mismo dialogo y solo ve la cartera del vendedor de la boleta', async ({
    page,
  }) => {
    const antiguo = await clienteDe('Admin cambiar antiguo')
    const nuevo = await clienteDe('Admin cambiar nuevo')
    // Mismo prefijo de nombre, otra cartera: si la lista no estuviera acotada,
    // saldria al buscar «Admin cambiar».
    const ajeno = await clienteDe('Admin cambiar ajeno', refs.otherSellerId)
    const ticket = await ticketOf(antiguo.id)

    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Cambiar cliente' }).click()

    const dialogo = page.getByRole('dialog')
    await expect(dialogo.getByText(antiguo.name)).toBeVisible()

    await dialogo.getByLabel('Buscar').fill('Admin cambiar')
    await expect(dialogo.getByRole('option', { name: nuevo.name })).toBeVisible()
    await expect(dialogo.getByRole('option', { name: ajeno.name })).toHaveCount(0)

    await dialogo.getByLabel('Motivo de la corrección').fill(MOTIVO)
    await dialogo.getByRole('option', { name: nuevo.name }).click()
    await dialogo.getByRole('button', { name: 'Cambiar cliente' }).click()

    await expectToast(page, new RegExp(`quedó a nombre de ${nuevo.name}`))
    expect(await ownerOf(ticket.id)).toBe(nuevo.id)
  })

  test('el cliente que crea el personal nace en la cartera del vendedor de la boleta', async ({
    page,
  }) => {
    const antiguo = await clienteDe('Admin crea antiguo')
    const nombreNuevo = unique('Admin crea nuevo')
    const ticket = await ticketOf(antiguo.id)

    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Cambiar cliente' }).click()

    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Motivo de la corrección').fill(MOTIVO)
    await dialogo.getByRole('tab', { name: 'Cliente nuevo' }).click()
    await dialogo.getByLabel('Nombre').fill(nombreNuevo)
    await dialogo.getByLabel('Teléfono').fill('3007776655')
    await dialogo.getByRole('button', { name: 'Crear cliente y cambiar' }).click()

    await expectToast(page, new RegExp(`${nombreNuevo} registrado`))

    const creado = await clienteCreadoPorLaApp(nombreNuevo)
    // El vendedor de la boleta, NO el Dueño que ejecuto la accion.
    expect(creado.seller_id).toBe(refs.sellerId)
    expect(await ownerOf(ticket.id)).toBe(creado.id)
  })
})
