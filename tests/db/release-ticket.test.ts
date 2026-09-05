/**
 * Liberar una boleta vendida que nadie ha abonado (BR-I14, D-169).
 *
 * La RPC `release_ticket_client` deshace UNA venta: devuelve la boleta a
 * `available` y borra cliente, precio, precio base, fecha de venta y
 * `assigned_at`. Aquí se comprueba que no toca nada más, que la rifa, el
 * historial y la cartera mandan sobre la interfaz, y que un vendedor ajeno o de
 * otra organización no puede ni llamando a la función directamente.
 *
 * La red que ya existía NO se toca: el `UPDATE` directo de un vendedor sobre una
 * boleta asignada sigue bloqueado por `tickets_update_seller` (BR-I09), y
 * `tickets_validate_status_transition` sigue impidiendo salir de `assigned` con
 * pagos activos (BR-I11).
 *
 * LIMPIEZA (I-059). Todo lo que crea esta suite se borra al final en UNA
 * transacción por `pg`: `payments_balanced` es un constraint trigger diferido y
 * borrar las asignaciones sueltas por PostgREST revienta sin decirlo. Las
 * comisiones NO se borran a mano: `tickets_sync_commission` se dispara
 * `after delete` y las recuenta solo (D-094).
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  DB_URL,
  insertTicket,
  loadSeedContext,
  randomNumbers,
  signInAs,
  USERS,
  type Client,
} from './helpers'

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let seller2: Client
let owner: Client
let admin: Client
let otherOrgSeller: Client

/** Clientes propios de la suite, para no mover los del seed. */
let clienteA: string
let clienteB: string

const ticketsCreados: string[] = []
const clientesCreados: string[] = []
const resultadosCreados: string[] = []
const programacionesCreadas: string[] = []
const rifasCreadas: string[] = []

const MOTIVO = 'El cliente ya no la quiere'

async function crearCliente(sellerId: string, name: string, phone: string): Promise<string> {
  const { data, error } = await ctx.svc
    .from('clients')
    .insert({ organization_id: ctx.demoOrg.id, seller_id: sellerId, name, phone })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear el cliente ${name}: ${error.message}`)
  clientesCreados.push(data.id)
  return data.id
}

/**
 * Una boleta nueva y disponible en la rifa indicada.
 *
 * Los números se buscan LIBRES en vez de sortearse a ciegas: un choque con
 * `tickets_combo_unique` reventaría el escenario y arrastraría el archivo
 * entero, que es exactamente I-057.
 */
async function boletaDisponible(
  options: {
    raffleId?: string
    sellerId?: string
    /** El estado de partida. `draft` y `pending_approval` se insertan directos:
     *  la máquina de estados no admite volver a ellos desde `available`. */
    inventoryStatus?: 'available' | 'draft' | 'pending_approval'
  } = {},
): Promise<string> {
  const raffleId = options.raffleId ?? ctx.demoRaffle.id
  const sellerId = options.sellerId ?? ctx.ids.seller1
  let ticketId: string | null = null
  for (let intento = 0; intento < 25 && ticketId === null; intento += 1) {
    const { daily, weekly } = randomNumbers()
    const created = await insertTicket(ctx.svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: raffleId,
      seller_id: sellerId,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
      inventory_status: options.inventoryStatus ?? 'available',
    })
    if (created.error) {
      if (created.error.code === '23505') continue
      throw new Error(`No se pudo crear la boleta: ${created.error.message}`)
    }
    ticketId = created.data!.id
  }
  if (ticketId === null) throw new Error('No se encontró una combinación libre en 25 intentos')
  ticketsCreados.push(ticketId)
  return ticketId
}

/** Una boleta nueva, vendida a `clientId` por su vendedor. */
async function boletaVendida(clientId: string, sellerId = ctx.ids.seller1): Promise<string> {
  const ticketId = await boletaDisponible({ sellerId })
  const asSeller = sellerId === ctx.ids.seller2 ? seller2 : seller1
  const { error } = await asSeller.rpc('bulk_assign_tickets', {
    p_ticket_ids: [ticketId],
    p_client_id: clientId,
  })
  if (error) throw new Error(`No se pudo vender la boleta: ${error.message}`)
  return ticketId
}

async function abonar(clientId: string, ticketId: string, amount: number): Promise<string> {
  const { data, error } = await seller1.rpc('create_payment', {
    p_client_id: clientId,
    p_total_amount: amount,
    p_allocations: [{ ticket_id: ticketId, amount }],
  })
  if (error) throw new Error(`No se pudo registrar el abono: ${error.message}`)
  return data as string
}

async function estado(ticketId: string) {
  const { data, error } = await ctx.svc
    .from('tickets')
    .select(
      `client_id, seller_id, organization_id, raffle_id, daily_number, weekly_number,
       inventory_status, payment_status, sale_price, base_price, paid_amount, sale_date,
       assigned_at, created_by, approved_by, approved_at, created_at, internal_code,
       cancelled_at, cancel_reason`,
    )
    .eq('id', ticketId)
    .single()
  if (error) throw error
  return data!
}

function liberar(asUser: Client, ticketId: string, expectedClientId: string, reason = MOTIVO) {
  return asUser.rpc('release_ticket_client', {
    p_ticket_id: ticketId,
    p_expected_client_id: expectedClientId,
    p_reason: reason,
  })
}

/** Deja una fotografía de coincidencia colgada de la boleta (BR-L14). */
async function fotografiarCoincidencia(ticketId: string) {
  const ticket = await estado(ticketId)

  const { data: schedule, error: scheduleError } = await ctx.svc
    .from('lottery_draw_schedules')
    .insert({
      lottery_code: 'boyaca',
      draw_number: `L${Date.now().toString(36)}${Math.floor(Math.random() * 100_000)}`,
      reference_date: `2096-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`,
      original_scheduled_at: '2096-06-01T23:00:00-05:00',
      official_scheduled_at: '2096-06-01T23:00:00-05:00',
      schedule_status: 'scheduled',
      source_url: 'https://cnjsa.coljuegos.gov.co/publicaciones/306418/',
      source_authority: 'CNJSA',
      verified_at: '2096-01-02T12:00:00-05:00',
    })
    .select('id')
    .single()
  if (scheduleError) throw new Error(`No se pudo crear la programacion: ${scheduleError.message}`)
  programacionesCreadas.push(schedule.id)

  const { data: result, error: resultError } = await ctx.svc
    .from('lottery_results')
    .insert({
      schedule_id: schedule.id,
      winning_number: ticket.daily_number!,
      validation_status: 'confirmed',
      source_url: 'https://www.loteriadeboyaca.gov.co/',
      source_kind: 'official_page',
      confirmed_at: '2096-06-01T23:00:00-05:00',
    })
    .select('id')
    .single()
  if (resultError) throw new Error(`No se pudo crear el resultado: ${resultError.message}`)
  resultadosCreados.push(result.id)

  const { error } = await ctx.svc.from('lottery_ticket_matches').insert({
    result_id: result.id,
    ticket_id: ticketId,
    organization_id: ticket.organization_id,
    raffle_id: ticket.raffle_id,
    seller_id: ticket.seller_id,
    client_id: ticket.client_id,
    match_field: 'daily_number',
    matched_number: ticket.daily_number!,
    assignment_status: 'sold',
    inventory_status_at_draw: 'assigned',
    assigned_at: ticket.assigned_at,
    ticket_created_at: ticket.created_at,
  })
  if (error) throw new Error(`No se pudo crear la coincidencia: ${error.message}`)
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
  otherOrgSeller = await signInAs(USERS.otherOrgSeller)

  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  clienteA = await crearCliente(ctx.ids.seller1, 'Liberar Cliente A', '3210000001')
  clienteB = await crearCliente(ctx.ids.seller1, 'Liberar Cliente B', '3210000002')
}, 60_000)

afterAll(async () => {
  try {
    await db.query('begin')
    await db.query(
      `delete from payment_allocations
        where payment_id in (select id from payments where client_id = any($1::uuid[]))`,
      [clientesCreados],
    )
    await db.query(`delete from payments where client_id = any($1::uuid[])`, [clientesCreados])
    // Una coincidencia es inmutable a propósito (BR-L11), así que el propio
    // disparador impide borrarla. Se apaga SOLO dentro de esta transacción de
    // limpieza y se vuelve a encender antes del commit: si algo falla, el
    // `rollback` lo restituye igual.
    await db.query(
      `alter table lottery_ticket_matches disable trigger lottery_ticket_matches_immutable`,
    )
    await db.query(`delete from lottery_ticket_matches where ticket_id = any($1::uuid[])`, [
      ticketsCreados,
    ])
    await db.query(
      `alter table lottery_ticket_matches enable trigger lottery_ticket_matches_immutable`,
    )
    await db.query(`delete from lottery_results where id = any($1::uuid[])`, [resultadosCreados])
    await db.query(`delete from lottery_draw_schedules where id = any($1::uuid[])`, [
      programacionesCreadas,
    ])
    await db.query(`delete from notifications where entity_id = any($1::uuid[])`, [ticketsCreados])
    await db.query(`delete from audit_logs where entity_id = any($1::uuid[])`, [ticketsCreados])
    await db.query(`delete from tickets where id = any($1::uuid[])`, [ticketsCreados])
    await db.query(`delete from clients where id = any($1::uuid[])`, [clientesCreados])
    // La rifa propia de la suite arrastra su comisión: `tickets_sync_commission`
    // crea la fila de `seller_commissions` al vender la boleta, y su FK compuesta
    // impide borrar la rifa mientras siga ahí.
    await db.query(`delete from commission_ledger where raffle_id = any($1::uuid[])`, [
      rifasCreadas,
    ])
    await db.query(`delete from seller_commissions where raffle_id = any($1::uuid[])`, [
      rifasCreadas,
    ])
    await db.query(`delete from audit_logs where entity_id = any($1::uuid[])`, [rifasCreadas])
    await db.query(`delete from raffles where id = any($1::uuid[])`, [rifasCreadas])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }

  const { rows } = await db.query(
    `select count(*)::int as n from tickets where id = any($1::uuid[])`,
    [ticketsCreados],
  )
  expect(rows[0].n, 'la suite debe dejar la base como la encontró').toBe(0)

  await db.end()
}, 60_000)

describe('E12-01 quién puede liberar una boleta (BR-I14)', () => {
  it('el vendedor libera su propia boleta', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).toBeNull()

    const despues = await estado(ticketId)
    expect(despues.inventory_status).toBe('available')
    expect(despues.client_id).toBeNull()
  })

  it('el Dueño puede sobre una boleta de su organización', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await liberar(owner, ticketId, clienteA)
    expect(error).toBeNull()
    expect((await estado(ticketId)).inventory_status).toBe('available')
  })

  it('el Administrador también puede', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await liberar(admin, ticketId, clienteA)
    expect(error).toBeNull()
    expect((await estado(ticketId)).inventory_status).toBe('available')
  })

  it('otro vendedor de la misma organización es rechazado', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await liberar(seller2, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no existe o no tienes acceso/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('otra organización recibe el mismo mensaje que si la boleta no existiera', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await liberar(otherOrgSeller, ticketId, clienteA)
    expect(error).not.toBeNull()
    // Ni el vendedor, ni el cliente, ni la rifa: solo que no la ve (T15).
    expect(error!.message).toMatch(/no existe o no tienes acceso/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('una sesión anónima no puede ejecutar la función', async () => {
    const ticketId = await boletaVendida(clienteA)
    const { anonClient } = await import('./helpers')

    const { error } = await liberar(anonClient(), ticketId, clienteA)
    expect(error).not.toBeNull()
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })
})

describe('E12-02 solo sobre una boleta vendida (BR-I14)', () => {
  it('una boleta disponible es rechazada', async () => {
    const ticketId = await boletaDisponible()

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/boleta vendida/i)
    expect((await estado(ticketId)).inventory_status).toBe('available')
  })

  it('una boleta en borrador es rechazada', async () => {
    const ticketId = await boletaDisponible({ inventoryStatus: 'draft' })

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/boleta vendida/i)
    expect((await estado(ticketId)).inventory_status).toBe('draft')
  })

  it('una boleta pendiente de aprobación es rechazada', async () => {
    const ticketId = await boletaDisponible({ inventoryStatus: 'pending_approval' })

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/boleta vendida/i)
    expect((await estado(ticketId)).inventory_status).toBe('pending_approval')
  })

  it('una boleta anulada es rechazada', async () => {
    const ticketId = await boletaVendida(clienteA)
    const { error: cancelError } = await owner.rpc('cancel_ticket', {
      p_ticket_id: ticketId,
      p_reason: 'Anulada para la prueba',
    })
    expect(cancelError).toBeNull()

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/boleta vendida/i)
    expect((await estado(ticketId)).inventory_status).toBe('cancelled')
  })
})

describe('E12-03 la rifa, el historial y el motivo (BR-I14)', () => {
  it('una rifa que no está activa es rechazada', async () => {
    const { data: raffle, error: raffleError } = await ctx.svc
      .from('raffles')
      .insert({
        organization_id: ctx.demoOrg.id,
        name: `Rifa liberar cerrada ${Date.now()}`,
        start_date: '2096-01-01',
        end_date: '2199-12-31',
        ticket_price: 120_000,
        status: 'active',
        created_by: ctx.ids.owner,
      })
      .select('id')
      .single()
    expect(raffleError).toBeNull()
    rifasCreadas.push(raffle!.id)

    const ticketId = await boletaDisponible({ raffleId: raffle!.id })
    const { error: assignError } = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: [ticketId],
      p_client_id: clienteA,
    })
    expect(assignError).toBeNull()

    // Se cierra DESPUÉS de vender: es el escenario real.
    const { error: closeError } = await ctx.svc
      .from('raffles')
      .update({ status: 'closed' })
      .eq('id', raffle!.id)
    expect(closeError).toBeNull()

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/rifa no está activa/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('una boleta con un abono ACTIVO es rechazada', async () => {
    const ticketId = await boletaVendida(clienteA)
    await abonar(clienteA, ticketId, 10_000)

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/abonos en su historial/i)
    expect((await estado(ticketId)).inventory_status).toBe('assigned')
  })

  it('una boleta cuyo abono fue ANULADO sigue siendo rechazada', async () => {
    const ticketId = await boletaVendida(clienteA)
    const paymentId = await abonar(clienteA, ticketId, 10_000)

    const { error: voidError } = await owner.rpc('void_payment', {
      p_payment_id: paymentId,
      p_reason: 'Anulado para la prueba',
    })
    expect(voidError).toBeNull()
    // El saldo vuelve a cero, pero la fila de la asignación sigue ahí.
    expect((await estado(ticketId)).paid_amount).toBe(0)

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/abonos en su historial/i)
    expect((await estado(ticketId)).inventory_status).toBe('assigned')
  })

  it('un abono corregido a $0 sigue bloqueando la liberación (BR-F17)', async () => {
    const ticketId = await boletaVendida(clienteA)
    const paymentId = await abonar(clienteA, ticketId, 10_000)

    const { error: zeroError } = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: 0,
      p_expected_amount: 10_000,
    })
    expect(zeroError).toBeNull()
    expect((await estado(ticketId)).paid_amount).toBe(0)

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/abonos en su historial/i)
    expect((await estado(ticketId)).inventory_status).toBe('assigned')
  })

  it('una boleta con coincidencia de lotería es rechazada (BR-L14)', async () => {
    const ticketId = await boletaVendida(clienteA)
    await fotografiarCoincidencia(ticketId)

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/resultado registrado/i)
    expect((await estado(ticketId)).inventory_status).toBe('assigned')
  })

  it('un motivo vacío o demasiado corto es rechazado', async () => {
    const ticketId = await boletaVendida(clienteA)

    for (const motivo of ['', '   ', 'no']) {
      const { error } = await liberar(seller1, ticketId, clienteA, motivo)
      expect(error, `motivo «${motivo}»`).not.toBeNull()
      expect(error!.message).toMatch(/motivo/i)
    }
    expect((await estado(ticketId)).inventory_status).toBe('assigned')
  })
})

describe('E12-04 concurrencia: el cliente esperado (D-169)', () => {
  it('una pantalla desactualizada no libera una asignación que ya cambió', async () => {
    const ticketId = await boletaVendida(clienteA)

    // Alguien corrige el cliente primero: la boleta pasa a B.
    const { error: cambioError } = await seller1.rpc('reassign_ticket_client', {
      p_ticket_id: ticketId,
      p_expected_client_id: clienteA,
      p_new_client_id: clienteB,
      p_reason: 'Corrección previa de la prueba',
    })
    expect(cambioError).toBeNull()

    // La segunda pantalla todavía cree que la tiene A.
    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/ya cambió de cliente/i)

    const despues = await estado(ticketId)
    expect(despues.inventory_status).toBe('assigned')
    expect(despues.client_id).toBe(clienteB)
  })

  it('dos liberaciones simultáneas: una gana y la otra no deja estado parcial', async () => {
    const ticketId = await boletaVendida(clienteA)

    const [primera, segunda] = await Promise.all([
      liberar(seller1, ticketId, clienteA),
      liberar(owner, ticketId, clienteA),
    ])

    const errores = [primera.error, segunda.error].filter((e) => e !== null)
    expect(errores).toHaveLength(1)
    // La segunda encuentra la boleta ya liberada: no queda cliente que esperar.
    expect(errores[0]!.message).toMatch(/boleta vendida/i)

    const despues = await estado(ticketId)
    expect(despues.inventory_status).toBe('available')
    expect(despues.client_id).toBeNull()
    expect(despues.sale_price).toBeNull()
    expect(despues.assigned_at).toBeNull()
  })
})

describe('E12-05 qué cambia y qué se conserva (BR-I14)', () => {
  it('borra la venta entera y no toca nada más', async () => {
    const ticketId = await boletaVendida(clienteA)
    const antes = await estado(ticketId)
    expect(antes.sale_price).not.toBeNull()
    expect(antes.base_price).not.toBeNull()
    expect(antes.sale_date).not.toBeNull()
    expect(antes.assigned_at).not.toBeNull()

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).toBeNull()

    const despues = await estado(ticketId)
    // Lo que se borra: la venta.
    expect(despues.inventory_status).toBe('available')
    expect(despues.client_id).toBeNull()
    expect(despues.sale_price).toBeNull()
    expect(despues.base_price).toBeNull()
    expect(despues.sale_date).toBeNull()
    expect(despues.assigned_at).toBeNull()
    // `payment_status` es una columna GENERADA: sin precio vuelve a «Sin pagar».
    expect(despues.payment_status).toBe('unpaid')
    expect(despues.paid_amount).toBe(0)
    // Y no queda anulada: liberar no es anular (BR-B05, glosario).
    expect(despues.cancelled_at).toBeNull()
    expect(despues.cancel_reason).toBeNull()

    // Lo que se conserva: TODO lo demás, campo a campo.
    const conservados = {
      seller_id: antes.seller_id,
      organization_id: antes.organization_id,
      raffle_id: antes.raffle_id,
      daily_number: antes.daily_number,
      weekly_number: antes.weekly_number,
      internal_code: antes.internal_code,
      created_by: antes.created_by,
      approved_by: antes.approved_by,
      approved_at: antes.approved_at,
      created_at: antes.created_at,
    }
    for (const [campo, valor] of Object.entries(conservados)) {
      expect(despues[campo as keyof typeof despues], campo).toEqual(valor)
    }
  })

  it('no crea ningún pago ni ningún aviso de venta', async () => {
    const ticketId = await boletaVendida(clienteA)
    const { count: avisosAntes } = await ctx.svc
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('entity_id', ticketId)

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).toBeNull()

    const { count: avisosDespues } = await ctx.svc
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('entity_id', ticketId)
    expect(avisosDespues).toBe(avisosAntes)

    const { count: asignaciones } = await ctx.svc
      .from('payment_allocations')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', ticketId)
    expect(asignaciones).toBe(0)
  })

  it('la boleta liberada se puede volver a vender por el flujo normal', async () => {
    const ticketId = await boletaVendida(clienteA)
    const antes = await estado(ticketId)

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).toBeNull()

    const { error: ventaError } = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: [ticketId],
      p_client_id: clienteB,
    })
    expect(ventaError).toBeNull()

    const despues = await estado(ticketId)
    expect(despues.inventory_status).toBe('assigned')
    expect(despues.client_id).toBe(clienteB)
    expect(despues.sale_price).toBe(antes.sale_price)
    // Los números siguen siendo los suyos: liberar no los libera para otra
    // boleta, porque la boleta nunca dejó de existir (BR-N08).
    expect(despues.daily_number).toBe(antes.daily_number)
    expect(despues.weekly_number).toBe(antes.weekly_number)
    expect(despues.internal_code).toBe(antes.internal_code)
  })
})

describe('E12-06 auditoría (BR-D01)', () => {
  it('queda ticket.release_client con el cliente, el precio y la fecha anteriores, y el motivo', async () => {
    const ticketId = await boletaVendida(clienteA)
    const antes = await estado(ticketId)

    const { error } = await liberar(seller1, ticketId, clienteA, 'Desistió antes de abonar')
    expect(error).toBeNull()

    const { data, error: logError } = await ctx.svc
      .from('audit_logs')
      .select('action, actor_profile_id, old_values, new_values, organization_id')
      .eq('entity_id', ticketId)
      .eq('action', 'ticket.release_client')
      .single()

    expect(logError).toBeNull()
    expect(data!.actor_profile_id).toBe(ctx.ids.seller1)
    expect(data!.organization_id).toBe(ctx.demoOrg.id)

    const viejo = data!.old_values as Record<string, unknown>
    expect(viejo.client_id).toBe(clienteA)
    expect(viejo.seller_id).toBe(ctx.ids.seller1)
    expect(viejo.inventory_status).toBe('assigned')
    expect(viejo.sale_price).toBe(antes.sale_price)
    expect(viejo.sale_date).toBe(antes.sale_date)
    expect(viejo.daily_number).toBe(antes.daily_number)
    expect(viejo.weekly_number).toBe(antes.weekly_number)

    const nuevo = data!.new_values as Record<string, unknown>
    expect(nuevo.client_id).toBeNull()
    expect(nuevo.inventory_status).toBe('available')
    expect(nuevo.sale_price).toBeNull()
    expect(nuevo.reason).toBe('Desistió antes de abonar')
  })

  it('la auditoría automática de la fila sigue escribiéndose', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await liberar(seller1, ticketId, clienteA)
    expect(error).toBeNull()

    const { data } = await ctx.svc
      .from('audit_logs')
      .select('action, new_values')
      .eq('entity_id', ticketId)
      .eq('action', 'ticket.update')

    expect(data!.length).toBeGreaterThan(0)
    expect(
      data!.some(
        (row) => (row.new_values as Record<string, unknown>)?.inventory_status === 'available',
      ),
    ).toBe(true)
  })
})

describe('E12-07 la red anterior sigue puesta', () => {
  it('el vendedor sigue sin poder desasignar con un UPDATE directo', async () => {
    const ticketId = await boletaVendida(clienteA)

    // `tickets_update_seller` solo alcanza draft/pending_approval: la fila
    // asignada queda fuera del USING y el UPDATE afecta CERO filas, sin error
    // (docs/SECURITY.md 5.1).
    const { data, error } = await seller1
      .from('tickets')
      .update({ inventory_status: 'available', client_id: null, sale_price: null })
      .eq('id', ticketId)
      .select('id')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
    expect((await estado(ticketId)).inventory_status).toBe('assigned')
  })

  it('el disparador de BR-I11 sigue impidiendo salir de assigned con pagos activos', async () => {
    const ticketId = await boletaVendida(clienteA)
    await abonar(clienteA, ticketId, 10_000)

    const { error } = await ctx.svc
      .from('tickets')
      .update({ inventory_status: 'available', client_id: null, sale_price: null })
      .eq('id', ticketId)

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/pagos activos/i)
  })
})
