/**
 * Corregir el precio de venta de una boleta asignada (BR-P13, D-137).
 *
 * La RPC `update_ticket_sale_price` reescribe UN campo: `tickets.sale_price`.
 * El recálculo de saldo, estado y ganancia lo hacen los disparadores que ya
 * existían. Aquí se comprueba eso, que los abonos no se tocan, que el precio
 * de la rifa no se mueve, y que un vendedor ajeno no puede ni llamando a la
 * RPC.
 *
 * El UPDATE directo con abonos sigue bloqueado (BR-P05): esta suite no revoca
 * esa red; abre un camino documentado.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { Client as PgClient } from 'pg'

import {
  DB_URL,
  insertTicket,
  loadSeedContext,
  randomNumbers,
  signInAs,
  USERS,
  type Client,
} from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let seller2: Client
let owner: Client
let otherOrgSeller: Client
let PRICE: number
let MIN: number

async function assignFreshTicket(
  clientId: string,
  salePrice?: number,
  sellerId = ctx.ids.seller1,
): Promise<string> {
  const { daily, weekly } = randomNumbers()
  const created = await insertTicket(ctx.svc, {
    organization_id: ctx.demoOrg.id,
    raffle_id: ctx.demoRaffle.id,
    seller_id: sellerId,
    created_by: ctx.ids.owner,
    daily_number: daily,
    weekly_number: weekly,
  })
  if (created.error) throw new Error(`No se pudo crear la boleta: ${created.error.message}`)

  const asSeller = sellerId === ctx.ids.seller2 ? seller2 : seller1
  const { error } = await asSeller.rpc('bulk_assign_tickets', {
    p_ticket_ids: [created.data!.id],
    p_client_id: clientId,
    p_sale_price: salePrice,
  })
  if (error) throw new Error(`No se pudo asignar la boleta: ${error.message}`)
  return created.data!.id
}

async function pay(
  asSeller: Client,
  clientId: string,
  ticketId: string,
  amount: number,
): Promise<string> {
  const { data, error } = await asSeller.rpc('create_payment', {
    p_client_id: clientId,
    p_total_amount: amount,
    p_allocations: [{ ticket_id: ticketId, amount }],
  })
  if (error) throw new Error(`No se pudo registrar el abono: ${error.message}`)
  return data as string
}

async function ticketState(ticketId: string) {
  const { data, error } = await ctx.svc
    .from('tickets')
    .select('sale_price, base_price, paid_amount, payment_status, client_id, seller_id')
    .eq('id', ticketId)
    .single()
  if (error) throw error
  return data!
}

async function editPrice(asUser: Client, ticketId: string, salePrice: number, expected: number) {
  return asUser.rpc('update_ticket_sale_price', {
    p_ticket_id: ticketId,
    p_sale_price: salePrice,
    p_expected_sale_price: expected,
  })
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
  otherOrgSeller = await signInAs(USERS.otherOrgSeller)

  const { data: rifa, error } = await ctx.svc
    .from('raffles')
    .select('ticket_price')
    .eq('id', ctx.demoRaffle.id)
    .single()
  if (error) throw error
  PRICE = Number(rifa.ticket_price)

  const ticketId = await assignFreshTicket(ctx.clients.ana.id)
  const { data: limits, error: limitsError } = await seller1.rpc('ticket_sale_price_limits', {
    p_ticket_id: ticketId,
  })
  if (limitsError) throw limitsError
  MIN = Number(limits[0]?.min_sale_price ?? PRICE / 2)
})

describe('update_ticket_sale_price recálculo (BR-P13, BR-F07)', () => {
  it('edita el precio de una boleta asignada sin abonos', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const rebajado = PRICE - 20_000
    expect(rebajado).toBeGreaterThanOrEqual(MIN)

    const { error } = await editPrice(seller1, ticketId, rebajado, PRICE)
    expect(error).toBeNull()

    const after = await ticketState(ticketId)
    expect(after.sale_price).toBe(rebajado)
    expect(after.base_price).toBe(PRICE)
    expect(after.paid_amount).toBe(0)
    expect(after.payment_status).toBe('unpaid')
    expect(after.client_id).toBe(ctx.clients.ana.id)
  })

  it('aumentar el precio de una boleta parcialmente pagada deja el abono intacto', async () => {
    const rebajado = PRICE - 20_000
    const ticketId = await assignFreshTicket(ctx.clients.ana.id, rebajado)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 40_000)

    const { error } = await editPrice(seller1, ticketId, PRICE, rebajado)
    expect(error).toBeNull()

    const after = await ticketState(ticketId)
    expect(after.sale_price).toBe(PRICE)
    expect(after.paid_amount).toBe(40_000)
    expect(after.payment_status).toBe('partial')

    const { data: alloc } = await ctx.svc
      .from('payment_allocations')
      .select('amount')
      .eq('payment_id', paymentId)
      .single()
    expect(alloc!.amount).toBe(40_000)
  })

  it('disminuir el precio sin bajar de lo abonado deja Abonada', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    await pay(seller1, ctx.clients.ana.id, ticketId, 40_000)
    const nuevo = Math.max(MIN, 80_000)

    const { error } = await editPrice(seller1, ticketId, nuevo, PRICE)
    expect(error).toBeNull()

    const after = await ticketState(ticketId)
    expect(after.sale_price).toBe(nuevo)
    expect(after.paid_amount).toBe(40_000)
    expect(after.payment_status).toBe('partial')
  })

  it('una boleta Pagada vuelve a Abonada al subir el precio', async () => {
    const rebajado = PRICE - 20_000
    const ticketId = await assignFreshTicket(ctx.clients.ana.id, rebajado)
    await pay(seller1, ctx.clients.ana.id, ticketId, rebajado)
    expect((await ticketState(ticketId)).payment_status).toBe('paid')

    const { error } = await editPrice(seller1, ticketId, PRICE, rebajado)
    expect(error).toBeNull()

    const after = await ticketState(ticketId)
    expect(after.sale_price).toBe(PRICE)
    expect(after.paid_amount).toBe(rebajado)
    expect(after.payment_status).toBe('partial')
  })

  it('una boleta Abonada queda Pagada al bajar el precio hasta lo abonado', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const abono = Math.max(MIN, PRICE - 20_000)
    await pay(seller1, ctx.clients.ana.id, ticketId, abono)

    const { error } = await editPrice(seller1, ticketId, abono, PRICE)
    expect(error).toBeNull()

    const after = await ticketState(ticketId)
    expect(after.sale_price).toBe(abono)
    expect(after.paid_amount).toBe(abono)
    expect(after.payment_status).toBe('paid')
  })
})

describe('update_ticket_sale_price validacion (BR-P11, BR-P13, BR-F12)', () => {
  it('rechaza un precio menor que el total abonado y no escribe nada', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    await pay(seller1, ctx.clients.ana.id, ticketId, 100_000)

    const { error } = await editPrice(seller1, ticketId, 80_000, PRICE)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/menor que el total abonado/i)

    const after = await ticketState(ticketId)
    expect(after.sale_price).toBe(PRICE)
    expect(after.paid_amount).toBe(100_000)
    expect(after.payment_status).toBe('partial')
  })

  it('no genera un saldo pendiente negativo', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    await pay(seller1, ctx.clients.ana.id, ticketId, 50_000)
    await editPrice(seller1, ticketId, 40_000, PRICE)

    const after = await ticketState(ticketId)
    expect(after.sale_price).toBe(PRICE)
    expect(after.paid_amount).toBeLessThanOrEqual(after.sale_price!)
  })

  it('no modifica el precio de la rifa ni otras boletas', async () => {
    const una = await assignFreshTicket(ctx.clients.ana.id)
    const otra = await assignFreshTicket(ctx.clients.ana.id)
    const { data: rifaAntes } = await ctx.svc
      .from('raffles')
      .select('ticket_price')
      .eq('id', ctx.demoRaffle.id)
      .single()

    await editPrice(seller1, una, PRICE - 20_000, PRICE)

    const { data: rifaDespues } = await ctx.svc
      .from('raffles')
      .select('ticket_price')
      .eq('id', ctx.demoRaffle.id)
      .single()
    expect(rifaDespues!.ticket_price).toBe(rifaAntes!.ticket_price)
    expect((await ticketState(otra)).sale_price).toBe(PRICE)
  })

  it('rechaza cero, negativo y recargo sobre el oficial', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)

    const cero = await editPrice(seller1, ticketId, 0, PRICE)
    expect(cero.error).not.toBeNull()

    const negativo = await editPrice(seller1, ticketId, -1, PRICE)
    expect(negativo.error).not.toBeNull()

    const recargo = await editPrice(seller1, ticketId, PRICE + 1_000, PRICE)
    expect(recargo.error).not.toBeNull()
    expect(recargo.error!.message).toMatch(/más barato, no más caro/i)

    expect((await ticketState(ticketId)).sale_price).toBe(PRICE)
  })

  it('guardar el mismo precio no escribe ni audita', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const { count: antes } = await ctx.svc
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('entity_id', ticketId)
      .eq('action', 'ticket.update_sale_price')

    const { error } = await editPrice(seller1, ticketId, PRICE, PRICE)
    expect(error).toBeNull()

    const { count: despues } = await ctx.svc
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('entity_id', ticketId)
      .eq('action', 'ticket.update_sale_price')
    expect(despues).toBe(antes)
    expect((await ticketState(ticketId)).sale_price).toBe(PRICE)
  })

  it('un expected_sale_price viejo se rechaza', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const { error } = await editPrice(seller1, ticketId, PRICE - 20_000, PRICE - 1)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/ya fue modificada/i)
  })
})

describe('update_ticket_sale_price permisos, restricciones y bitacora', () => {
  it('un vendedor ajeno no puede editar la boleta', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const { error } = await editPrice(seller2, ticketId, PRICE - 20_000, PRICE)
    expect(error).not.toBeNull()
    expect((await ticketState(ticketId)).sale_price).toBe(PRICE)
  })

  it('un vendedor de otra organizacion no puede editarla', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const { error } = await editPrice(otherOrgSeller, ticketId, PRICE - 20_000, PRICE)
    expect(error).not.toBeNull()
  })

  it('el personal si puede editar una boleta de su organizacion', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const { error } = await editPrice(owner, ticketId, PRICE - 20_000, PRICE)
    expect(error).toBeNull()
    expect((await ticketState(ticketId)).sale_price).toBe(PRICE - 20_000)
  })

  it('una boleta anulada no admite cambio de precio', async () => {
    const { daily, weekly } = randomNumbers()
    const created = await insertTicket(ctx.svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    await owner.rpc('cancel_ticket', {
      p_ticket_id: created.data!.id,
      p_reason: 'Anulada para probar el precio',
    })

    const { error } = await editPrice(owner, created.data!.id, PRICE - 20_000, PRICE)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/asignada/i)
  })

  it('en una rifa que no esta activa no se puede cambiar el precio', async () => {
    const { data: rifa } = await ctx.svc
      .from('raffles')
      .insert({
        organization_id: ctx.demoOrg.id,
        name: `Rifa precio cerrada ${randomNumbers().daily}`,
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        created_by: ctx.ids.owner,
        ticket_price: PRICE,
      })
      .select('id')
      .single()
    const { daily, weekly } = randomNumbers()
    const created = await insertTicket(ctx.svc, {
      organization_id: ctx.demoOrg.id,
      raffle_id: rifa!.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.owner,
      daily_number: daily,
      weekly_number: weekly,
    })
    const { error: assignError } = await seller1.rpc('bulk_assign_tickets', {
      p_ticket_ids: [created.data!.id],
      p_client_id: ctx.clients.ana.id,
    })
    expect(assignError).toBeNull()

    await ctx.svc.from('raffles').update({ status: 'closed' }).eq('id', rifa!.id)

    const { error } = await editPrice(seller1, created.data!.id, PRICE - 20_000, PRICE)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no está activa/i)

    const db = new PgClient({ connectionString: DB_URL })
    await db.connect()
    try {
      await db.query('begin')
      await db.query(`delete from notifications where entity_id = $1`, [created.data!.id])
      await db.query(`delete from tickets where id = $1`, [created.data!.id])
      await db.query(`delete from commission_ledger where raffle_id = $1`, [rifa!.id])
      await db.query(`delete from seller_commissions where raffle_id = $1`, [rifa!.id])
      await db.query(`delete from raffles where id = $1`, [rifa!.id])
      await db.query('commit')
    } catch (cleanupError) {
      await db.query('rollback')
      throw cleanupError
    } finally {
      await db.end()
    }
  })

  it('el UPDATE directo con abonos sigue bloqueado (BR-P05)', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    await pay(seller1, ctx.clients.ana.id, ticketId, 20_000)

    const { error } = await ctx.svc.from('tickets').update({ sale_price: 50_000 }).eq('id', ticketId)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/precio de una boleta con pagos/i)
    expect((await ticketState(ticketId)).sale_price).toBe(PRICE)
  })

  it('deja trazabilidad del precio anterior y el nuevo', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const { error } = await editPrice(seller1, ticketId, PRICE - 20_000, PRICE)
    expect(error).toBeNull()

    const { data: log } = await ctx.svc
      .from('audit_logs')
      .select('action, actor_profile_id, old_values, new_values')
      .eq('entity_id', ticketId)
      .eq('action', 'ticket.update_sale_price')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    expect(log!.actor_profile_id).toBe(ctx.ids.seller1)
    expect(log!.old_values).toMatchObject({
      sale_price: PRICE,
      client_id: ctx.clients.ana.id,
      seller_id: ctx.ids.seller1,
    })
    expect(log!.new_values).toMatchObject({
      sale_price: PRICE - 20_000,
      client_id: ctx.clients.ana.id,
      seller_id: ctx.ids.seller1,
    })
  })
})

describe('update_ticket_sale_price concurrencia y ganancia', () => {
  it('dos ediciones concurrentes con el mismo valor esperado: solo una gana', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const aPrice = PRICE - 10_000
    const bPrice = PRICE - 20_000

    const [a, b] = await Promise.allSettled([
      editPrice(seller1, ticketId, aPrice, PRICE),
      editPrice(seller1, ticketId, bPrice, PRICE),
    ])

    const exitosos = [a, b].filter((r) => r.status === 'fulfilled' && r.value.error === null)
    const fallidos = [a, b].filter((r) => r.status === 'fulfilled' && r.value.error !== null)
    expect(exitosos).toHaveLength(1)
    expect(fallidos).toHaveLength(1)
    expect(
      fallidos[0] && fallidos[0].status === 'fulfilled' ? fallidos[0].value.error!.message : '',
    ).toMatch(/ya fue modificada/i)

    const precio = (await ticketState(ticketId)).sale_price
    expect([aPrice, bPrice]).toContain(precio)
  })

  it('al dejar de estar Pagada baja la ganancia; al volver a Pagada no se cuenta dos veces', async () => {
    const rebajado = PRICE - 20_000
    const ticketId = await assignFreshTicket(ctx.clients.ana.id, rebajado)
    await pay(seller1, ctx.clients.ana.id, ticketId, rebajado)

    const { data: cobrada } = await ctx.svc
      .from('seller_commissions')
      .select('tickets_paid, earned')
      .eq('seller_id', ctx.ids.seller1)
      .eq('raffle_id', ctx.demoRaffle.id)
      .single()
    const pagadasAlCobrar = cobrada!.tickets_paid

    const sube = await editPrice(seller1, ticketId, PRICE, rebajado)
    expect(sube.error).toBeNull()
    expect((await ticketState(ticketId)).payment_status).toBe('partial')

    const { data: trasSubir } = await ctx.svc
      .from('seller_commissions')
      .select('tickets_paid, earned')
      .eq('seller_id', ctx.ids.seller1)
      .eq('raffle_id', ctx.demoRaffle.id)
      .single()
    expect(trasSubir!.tickets_paid).toBe(pagadasAlCobrar - 1)
    expect(Number(trasSubir!.earned)).toBeLessThan(Number(cobrada!.earned))

    const baja = await editPrice(seller1, ticketId, rebajado, PRICE)
    expect(baja.error).toBeNull()
    expect((await ticketState(ticketId)).payment_status).toBe('paid')

    const { data: trasBajar } = await ctx.svc
      .from('seller_commissions')
      .select('tickets_paid, earned')
      .eq('seller_id', ctx.ids.seller1)
      .eq('raffle_id', ctx.demoRaffle.id)
      .single()
    expect(trasBajar!.tickets_paid).toBe(pagadasAlCobrar)
    expect(Number(trasBajar!.earned)).toBe(Number(cobrada!.earned))
  })
})
