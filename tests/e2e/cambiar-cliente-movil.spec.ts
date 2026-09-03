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
 * El mismo flujo de D-168, en el viewport del telefono (Pixel 7).
 *
 * Escritorio vive en `cambiar-cliente.spec.ts`. Aqui se comprueba que el boton
 * mide 44 px, que el dialogo cabe y se puede completar entero sin que ningun
 * control se salga de la pantalla, y que la boleta acaba a nombre del cliente
 * correcto.
 */

let refs: SeedRefs
let PRICE: number

/** Todo lo que crea esta suite, para borrarlo al terminar (I-035). */
const clientesCreados: string[] = []
const programacionesCreadas: string[] = []

async function clienteDe(nombre: string) {
  const client = await createClientFor(refs, unique(nombre))
  clientesCreados.push(client.id)
  return client
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

test.afterAll(async () => {
  await purgeTestData({
    clientIds: clientesCreados,
    lotteryScheduleIds: programacionesCreadas,
  })
})

test.describe('Cambiar el cliente de una boleta en el telefono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('el boton mide 44 px y el dialogo se completa sin salirse', async ({ page }) => {
    const antiguo = await clienteDe('Movil cambiar antiguo')
    const nuevo = await clienteDe('Movil cambiar nuevo')
    const numbers = randomTicketNumbers()
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: antiguo.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/tickets/${ticket.id}`)
    const boton = page.getByRole('button', { name: 'Cambiar cliente' })
    const caja = await boton.boundingBox()
    expect(caja).not.toBeNull()
    expect(caja!.height).toBeGreaterThanOrEqual(44)

    await boton.tap()

    const dialogo = page.getByRole('dialog')
    await expect(dialogo.getByText('Ahora la tiene')).toBeVisible()

    await dialogo.getByLabel('Motivo de la corrección').fill('Se la puse a quien no era')
    await dialogo.getByLabel('Buscar').fill(nuevo.name)
    await dialogo.getByRole('option', { name: nuevo.name }).tap()

    // El boton de confirmar tiene que estar DENTRO de la ventana: si el dialogo
    // no acotara su alto, quedaria fuera y solo se veria al desplazar la pagina
    // entera (D-099).
    const confirmar = dialogo.getByRole('button', { name: 'Cambiar cliente' })
    const cajaConfirmar = await confirmar.boundingBox()
    const alto = page.viewportSize()!.height
    expect(cajaConfirmar).not.toBeNull()
    expect(cajaConfirmar!.height).toBeGreaterThanOrEqual(44)
    expect(cajaConfirmar!.y + cajaConfirmar!.height).toBeLessThanOrEqual(alto)

    await confirmar.tap()

    await expectToast(page, new RegExp(`quedó a nombre de ${nuevo.name}`))
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
    await expect(page.getByText(nuevo.name).first()).toBeVisible()

    const { data } = await serviceClient()
      .from('tickets')
      .select('client_id')
      .eq('id', ticket.id)
      .single()
    expect(data!.client_id).toBe(nuevo.id)
  })

  test('el aviso de una boleta bloqueada se lee entero', async ({ page }) => {
    const cliente = await clienteDe('Movil cambiar bloqueada')
    const numbers = randomTicketNumbers()
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })

    // Una coincidencia de loteria: la otra puerta cerrada (BR-L14).
    const svc = serviceClient()
    const { data: schedule, error: scheduleError } = await svc
      .from('lottery_draw_schedules')
      .insert({
        lottery_code: 'boyaca',
        draw_number: `R${Date.now().toString(36)}${Math.floor(Math.random() * 100_000)}`,
        reference_date: `2097-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`,
        original_scheduled_at: '2097-06-01T23:00:00-05:00',
        official_scheduled_at: '2097-06-01T23:00:00-05:00',
        schedule_status: 'scheduled',
        source_url: 'https://cnjsa.coljuegos.gov.co/publicaciones/306418/',
        source_authority: 'CNJSA',
        verified_at: '2097-01-02T12:00:00-05:00',
      })
      .select('id')
      .single()
    expect(scheduleError).toBeNull()
    programacionesCreadas.push(schedule!.id)

    const { data: result, error: resultError } = await svc
      .from('lottery_results')
      .insert({
        schedule_id: schedule!.id,
        winning_number: numbers.daily,
        validation_status: 'confirmed',
        source_url: 'https://www.loteriadeboyaca.gov.co/',
        source_kind: 'official_page',
        confirmed_at: '2097-06-01T23:00:00-05:00',
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
      matched_number: numbers.daily,
      assignment_status: 'sold',
      inventory_status_at_draw: 'assigned',
      assigned_at: ticketRow!.assigned_at,
      ticket_created_at: ticketRow!.created_at,
    })
    expect(matchError).toBeNull()

    await page.goto(`/seller/tickets/${ticket.id}`)
    const aviso = page.getByText(/ya hace parte de un resultado registrado/)
    await expect(aviso).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cambiar cliente' })).toHaveCount(0)

    // El texto no se sale de lado: la pagina no se desplaza en horizontal.
    const ancho = page.viewportSize()!.width
    const caja = await aviso.boundingBox()
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(ancho)
  })
})
