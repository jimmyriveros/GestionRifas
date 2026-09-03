/**
 * Corregir el cliente de una boleta vendida (BR-I13, D-168).
 *
 * La RPC `reassign_ticket_client` reescribe UN campo: `tickets.client_id`. Aquí
 * se comprueba que solo cambia eso, que la cartera y el historial mandan sobre
 * la interfaz, y que un vendedor ajeno o de otra organización no puede ni
 * llamando a la función directamente.
 *
 * La red que ya existía NO se toca: el `UPDATE` directo de un vendedor sobre una
 * boleta asignada sigue bloqueado por `tickets_update_seller` (BR-I09) y el
 * disparador `tickets_protect_client_change` sigue rechazando el cambio con
 * pagos activos (BR-I12). Esta suite abre un camino documentado, más estricto.
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
let clienteArchivado: string
/** Cliente de vendedor2: la cartera equivocada. */
let clienteDeOtroVendedor: string

const ticketsCreados: string[] = []
const clientesCreados: string[] = []
const resultadosCreados: string[] = []
const programacionesCreadas: string[] = []

const MOTIVO = 'La vendí a la persona equivocada'

async function crearCliente(sellerId: string, name: string, phone: string): Promise<string> {
  const { data, error } = await ctx.svc
    .from('clients')
    .insert({
      organization_id: ctx.demoOrg.id,
      seller_id: sellerId,
      name,
      phone,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear el cliente ${name}: ${error.message}`)
  clientesCreados.push(data.id)
  return data.id
}

/**
 * Una boleta nueva, vendida a `clientId`.
 *
 * Los números se buscan LIBRES en vez de sortearse a ciegas: un choque con
 * `tickets_combo_unique` reventaría el escenario y arrastraría el archivo
 * entero, que es exactamente I-057.
 */
async function boletaVendida(clientId: string, sellerId = ctx.ids.seller1): Promise<string> {
  let ticketId: string | null = null
  for (let intento = 0; intento < 25 && ticketId === null; intento += 1) {
    const { daily, weekly } = randomNumbers()
    const created = await insertTicket(ctx.svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: sellerId,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    if (created.error) {
      if (created.error.code === '23505') continue
      throw new Error(`No se pudo crear la boleta: ${created.error.message}`)
    }
    ticketId = created.data!.id
  }
  if (ticketId === null) throw new Error('No se encontró una combinación libre en 25 intentos')
  ticketsCreados.push(ticketId)

  const asSeller = sellerId === ctx.ids.seller2 ? seller2 : seller1
  const { error } = await asSeller.rpc('bulk_assign_tickets', {
    p_ticket_ids: [ticketId],
    p_client_id: clientId,
  })
  if (error) throw new Error(`No se pudo vender la boleta: ${error.message}`)
  return ticketId
}

/** Una boleta creada y NO vendida. */
async function boletaDisponible(): Promise<string> {
  let ticketId: string | null = null
  for (let intento = 0; intento < 25 && ticketId === null; intento += 1) {
    const { daily, weekly } = randomNumbers()
    const created = await insertTicket(ctx.svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
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
       assigned_at, created_by, approved_by, approved_at, created_at, internal_code`,
    )
    .eq('id', ticketId)
    .single()
  if (error) throw error
  return data!
}

function reasignar(
  asUser: Client,
  ticketId: string,
  expectedClientId: string,
  newClientId: string,
  reason = MOTIVO,
) {
  return asUser.rpc('reassign_ticket_client', {
    p_ticket_id: ticketId,
    p_expected_client_id: expectedClientId,
    p_new_client_id: newClientId,
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
      draw_number: `R${Date.now().toString(36)}${Math.floor(Math.random() * 100_000)}`,
      reference_date: `2098-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`,
      original_scheduled_at: '2098-06-01T23:00:00-05:00',
      official_scheduled_at: '2098-06-01T23:00:00-05:00',
      schedule_status: 'scheduled',
      source_url: 'https://cnjsa.coljuegos.gov.co/publicaciones/306418/',
      source_authority: 'CNJSA',
      verified_at: '2098-01-02T12:00:00-05:00',
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
      confirmed_at: '2098-06-01T23:00:00-05:00',
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

  clienteA = await crearCliente(ctx.ids.seller1, 'Reasign Cliente A', '3200000001')
  clienteB = await crearCliente(ctx.ids.seller1, 'Reasign Cliente B', '3200000002')
  clienteArchivado = await crearCliente(ctx.ids.seller1, 'Reasign Archivado', '3200000003')
  clienteDeOtroVendedor = await crearCliente(ctx.ids.seller2, 'Reasign Ajeno', '3200000004')

  const { error } = await ctx.svc
    .from('clients')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', clienteArchivado)
  if (error) throw error
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

describe('E11-01 quién puede corregir el cliente (BR-I13)', () => {
  it('el vendedor mueve su boleta a otro cliente de su cartera', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB)
    expect(error).toBeNull()
    expect((await estado(ticketId)).client_id).toBe(clienteB)
  })

  it('el Dueño puede sobre una boleta de su organización', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(owner, ticketId, clienteA, clienteB)
    expect(error).toBeNull()
    expect((await estado(ticketId)).client_id).toBe(clienteB)
  })

  it('el Administrador también puede', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(admin, ticketId, clienteA, clienteB)
    expect(error).toBeNull()
    expect((await estado(ticketId)).client_id).toBe(clienteB)
  })

  it('otro vendedor de la misma organización es rechazado', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(seller2, ticketId, clienteA, clienteB)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no existe o no tienes acceso/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('otra organización recibe el mismo mensaje que si la boleta no existiera', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(otherOrgSeller, ticketId, clienteA, clienteB)
    expect(error).not.toBeNull()
    // Ni el vendedor, ni el cliente, ni la rifa: solo que no la ve (T15).
    expect(error!.message).toMatch(/no existe o no tienes acceso/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('una sesión anónima no puede ejecutar la función', async () => {
    const ticketId = await boletaVendida(clienteA)
    const { anonClient } = await import('./helpers')

    const { error } = await reasignar(anonClient(), ticketId, clienteA, clienteB)
    expect(error).not.toBeNull()
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })
})

describe('E11-02 el cliente de destino (BR-C05, BR-C07)', () => {
  it('un cliente de otro vendedor es rechazado, aunque lo pida el Dueño', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(owner, ticketId, clienteA, clienteDeOtroVendedor)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/otro vendedor/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('un cliente archivado es rechazado', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteArchivado)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/archivado/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('el mismo cliente que ya la tiene es rechazado', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteA)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/ya es de ese cliente/i)
  })

  it('un cliente de otra organización es rechazado', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(owner, ticketId, clienteA, ctx.clients.fabio.id)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no existe o no pertenece/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })
})

describe('E11-03 el estado de la boleta y su historial (BR-I13)', () => {
  it('una boleta sin vender es rechazada', async () => {
    const ticketId = await boletaDisponible()

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/boleta vendida/i)
    expect((await estado(ticketId)).client_id).toBeNull()
  })

  it('una boleta con un abono ACTIVO es rechazada', async () => {
    const ticketId = await boletaVendida(clienteA)
    await abonar(clienteA, ticketId, 10_000)

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/abonos en su historial/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
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

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/abonos en su historial/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('un abono corregido a $0 sigue bloqueando el cambio (BR-F17)', async () => {
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

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/abonos en su historial/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('una boleta con coincidencia de lotería es rechazada (BR-L14)', async () => {
    const ticketId = await boletaVendida(clienteA)
    await fotografiarCoincidencia(ticketId)

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/resultado registrado/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('un motivo demasiado corto es rechazado', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB, 'no')
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/motivo/i)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })
})

describe('E11-04 concurrencia: el cliente esperado (D-168)', () => {
  it('una pantalla desactualizada no pisa una corrección más reciente', async () => {
    const ticketId = await boletaVendida(clienteA)

    // Alguien corrige primero: la boleta pasa a B.
    const primera = await reasignar(seller1, ticketId, clienteA, clienteB)
    expect(primera.error).toBeNull()

    // La segunda pantalla todavía cree que la tiene A.
    const segunda = await reasignar(owner, ticketId, clienteA, clienteDeOtroVendedor)
    expect(segunda.error).not.toBeNull()
    expect(segunda.error!.message).toMatch(/ya cambió de cliente/i)
    expect((await estado(ticketId)).client_id).toBe(clienteB)
  })
})

describe('E11-05 solo cambia el cliente (BR-I13)', () => {
  it('precio, vendedor, fechas, estado, números y código interno quedan idénticos', async () => {
    const ticketId = await boletaVendida(clienteA)
    const antes = await estado(ticketId)

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB)
    expect(error).toBeNull()

    const despues = await estado(ticketId)
    expect(despues.client_id).toBe(clienteB)
    expect({ ...despues, client_id: null }).toEqual({ ...antes, client_id: null })
  })

  it('no se repite el aviso de venta al equipo', async () => {
    const ticketId = await boletaVendida(clienteA)
    const { count: antes } = await ctx.svc
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('entity_id', ticketId)

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB)
    expect(error).toBeNull()

    const { count: despues } = await ctx.svc
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('entity_id', ticketId)

    expect(despues).toBe(antes)
  })
})

describe('E11-06 auditoría (BR-D01)', () => {
  it('queda ticket.reassign_client con cliente anterior, nuevo, motivo y actor', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB, 'Se la puse a otra')
    expect(error).toBeNull()

    const { data, error: logError } = await ctx.svc
      .from('audit_logs')
      .select('action, actor_profile_id, old_values, new_values, organization_id')
      .eq('entity_id', ticketId)
      .eq('action', 'ticket.reassign_client')
      .single()

    expect(logError).toBeNull()
    expect(data!.actor_profile_id).toBe(ctx.ids.seller1)
    expect(data!.organization_id).toBe(ctx.demoOrg.id)
    expect((data!.old_values as Record<string, unknown>).client_id).toBe(clienteA)
    expect((data!.new_values as Record<string, unknown>).client_id).toBe(clienteB)
    expect((data!.new_values as Record<string, unknown>).reason).toBe('Se la puse a otra')
  })

  it('la auditoría automática de la fila sigue escribiéndose', async () => {
    const ticketId = await boletaVendida(clienteA)

    const { error } = await reasignar(seller1, ticketId, clienteA, clienteB)
    expect(error).toBeNull()

    const { data } = await ctx.svc
      .from('audit_logs')
      .select('action, new_values')
      .eq('entity_id', ticketId)
      .eq('action', 'ticket.update')

    expect(data!.length).toBeGreaterThan(0)
    expect(
      data!.some((row) => (row.new_values as Record<string, unknown>)?.client_id === clienteB),
    ).toBe(true)
  })
})

describe('E11-07 la red anterior sigue puesta', () => {
  it('el vendedor sigue sin poder hacer un UPDATE directo sobre una boleta asignada', async () => {
    const ticketId = await boletaVendida(clienteA)

    // `tickets_update_seller` solo alcanza draft/pending_approval: la fila
    // asignada queda fuera del USING y el UPDATE afecta CERO filas, sin error
    // (docs/SECURITY.md 5.1).
    const { data, error } = await seller1
      .from('tickets')
      .update({ client_id: clienteB })
      .eq('id', ticketId)
      .select('id')

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
    expect((await estado(ticketId)).client_id).toBe(clienteA)
  })

  it('el disparador de BR-I12 sigue bloqueando el UPDATE con pagos activos', async () => {
    const ticketId = await boletaVendida(clienteA)
    await abonar(clienteA, ticketId, 10_000)

    const { error } = await ctx.svc
      .from('tickets')
      .update({ client_id: clienteB })
      .eq('id', ticketId)

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/pagos activos/i)
  })
})
