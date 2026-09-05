import { expect, test } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  purgeTestData,
  raffleTicketPrice,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * El mismo flujo de D-169, en el viewport del telefono (Pixel 7).
 *
 * Escritorio vive en `liberar-boleta.spec.ts`. Aqui se comprueba que los DOS
 * botones de la tarjeta del cliente miden 44 px y caben uno debajo de otro sin
 * desplazar la pagina de lado, que el dialogo se completa entero, y que la
 * boleta acaba disponible.
 */

let refs: SeedRefs
let PRICE: number

const clientesCreados: string[] = []
const ticketsCreados: string[] = []
const programacionesCreadas: string[] = []

async function clienteDe(nombre: string) {
  const client = await createClientFor(refs, unique(nombre))
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

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

test.afterAll(async () => {
  await purgeTestData({
    clientIds: clientesCreados,
    ticketIds: ticketsCreados,
    lotteryScheduleIds: programacionesCreadas,
  })
})

test.describe('Liberar una boleta en el telefono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('los dos botones miden 44 px, caben, y el dialogo se completa sin salirse', async ({
    page,
  }) => {
    const cliente = await clienteDe('Movil liberar')
    const ticket = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${ticket.id}`)

    const cambiar = page.getByRole('button', { name: 'Cambiar cliente' })
    const liberar = page.getByRole('button', { name: 'Liberar boleta' })
    const cajaCambiar = await cambiar.boundingBox()
    const cajaLiberar = await liberar.boundingBox()
    expect(cajaCambiar).not.toBeNull()
    expect(cajaLiberar).not.toBeNull()
    expect(cajaCambiar!.height).toBeGreaterThanOrEqual(44)
    expect(cajaLiberar!.height).toBeGreaterThanOrEqual(44)
    // Uno DEBAJO del otro, no en la misma fila apretados.
    expect(cajaLiberar!.y).toBeGreaterThanOrEqual(cajaCambiar!.y + cajaCambiar!.height)
    // Y ninguno se sale de lado.
    const ancho = page.viewportSize()!.width
    expect(cajaLiberar!.x + cajaLiberar!.width).toBeLessThanOrEqual(ancho)

    await liberar.tap()

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo.getByText('Cliente actual')).toBeVisible()
    await expect(dialogo.getByText(ticket.daily, { exact: true })).toBeVisible()
    await expect(dialogo.getByText(ticket.weekly, { exact: true })).toBeVisible()

    await dialogo.getByLabel('Motivo de la liberación').fill('Se arrepintió y no abonó nada')

    // El boton de confirmar tiene que estar DENTRO de la ventana: si el dialogo
    // no acotara su alto, quedaria fuera y solo se veria al desplazar la pagina
    // entera (D-099).
    const confirmar = dialogo.getByRole('button', { name: 'Confirmar liberación' })
    const cajaConfirmar = await confirmar.boundingBox()
    const alto = page.viewportSize()!.height
    expect(cajaConfirmar).not.toBeNull()
    expect(cajaConfirmar!.y + cajaConfirmar!.height).toBeLessThanOrEqual(alto)

    await confirmar.tap()

    await expectToast(page, new RegExp(`La boleta ${ticket.daily} / ${ticket.weekly} quedó`))
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
    await expect(page.getByText('Todavía no la has vendido.')).toBeVisible()

    const { data } = await serviceClient()
      .from('tickets')
      .select('inventory_status, client_id, sale_price')
      .eq('id', ticket.id)
      .single()
    expect(data!.inventory_status).toBe('available')
    expect(data!.client_id).toBeNull()
    expect(data!.sale_price).toBeNull()
  })

  test('el aviso de una boleta bloqueada se lee entero', async ({ page }) => {
    const cliente = await clienteDe('Movil liberar bloqueada')
    const ticket = await ticketOf(cliente.id)

    // Una coincidencia de loteria: la puerta que cierra las dos acciones (BR-L14).
    const svc = serviceClient()
    const { data: schedule, error: scheduleError } = await svc
      .from('lottery_draw_schedules')
      .insert({
        lottery_code: 'boyaca',
        draw_number: `L${Date.now().toString(36)}${Math.floor(Math.random() * 100_000)}`,
        reference_date: `2095-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`,
        original_scheduled_at: '2095-06-01T23:00:00-05:00',
        official_scheduled_at: '2095-06-01T23:00:00-05:00',
        schedule_status: 'scheduled',
        source_url: 'https://cnjsa.coljuegos.gov.co/publicaciones/306418/',
        source_authority: 'CNJSA',
        verified_at: '2095-01-02T12:00:00-05:00',
      })
      .select('id')
      .single()
    expect(scheduleError).toBeNull()
    programacionesCreadas.push(schedule!.id)

    const { data: result, error: resultError } = await svc
      .from('lottery_results')
      .insert({
        schedule_id: schedule!.id,
        winning_number: ticket.daily,
        validation_status: 'confirmed',
        source_url: 'https://www.loteriadeboyaca.gov.co/',
        source_kind: 'official_page',
        confirmed_at: '2095-06-01T23:00:00-05:00',
      })
      .select('id')
      .single()
    expect(resultError).toBeNull()

    const { data: ticketRow } = await svc
      .from('tickets')
      .select('assigned_at, created_at')
      .eq('id', ticket.id)
      .single()

    const { error: matchError } = await svc.from('lottery_ticket_matches').insert({
      result_id: result!.id,
      ticket_id: ticket.id,
      organization_id: refs.organizationId,
      raffle_id: refs.raffleId,
      seller_id: refs.sellerId,
      client_id: cliente.id,
      match_field: 'daily_number',
      matched_number: ticket.daily,
      assignment_status: 'sold',
      inventory_status_at_draw: 'assigned',
      assigned_at: ticketRow!.assigned_at,
      ticket_created_at: ticketRow!.created_at,
    })
    expect(matchError).toBeNull()

    await page.goto(`/seller/tickets/${ticket.id}`)
    const aviso = page.getByText(/ya hace parte de un resultado registrado/)
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('liberarse')
    await expect(page.getByRole('button', { name: 'Liberar boleta' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cambiar cliente' })).toHaveCount(0)

    // El texto no se sale de lado: la pagina no se desplaza en horizontal.
    const ancho = page.viewportSize()!.width
    const caja = await aviso.boundingBox()
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(ancho)
  })
})
