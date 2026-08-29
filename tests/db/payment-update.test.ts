/**
 * Corregir el valor de un abono activo (BR-F16, D-134).
 *
 * La RPC `update_payment_allocation` reescribe UN registro: la asignacion y el
 * total del pago. El recálculo de saldo, estado y ganancia lo hacen los
 * disparadores que ya existian. Aqui se comprueba eso, y que un vendedor ajeno
 * no puede ni llamando a la RPC.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import {
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

async function assignFreshTicket(clientId: string, sellerId = ctx.ids.seller1): Promise<string> {
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
  const { error } = await asSeller.rpc('assign_ticket', {
    p_ticket_id: created.data!.id,
    p_client_id: clientId,
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
    .select('paid_amount, payment_status, sale_price')
    .eq('id', ticketId)
    .single()
  if (error) throw error
  return data!
}

async function paymentCount(clientId: string) {
  const { count, error } = await ctx.svc
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
  if (error) throw error
  return count ?? 0
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
})

describe('update_payment_allocation recálculo (BR-F07, BR-F16)', () => {
  it('aumentar el abono sube lo pagado y puede dejar la boleta Pagada', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 40_000)

    const { error } = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: PRICE,
      p_expected_amount: 40_000,
    })
    expect(error).toBeNull()

    const state = await ticketState(ticketId)
    expect(state.paid_amount).toBe(PRICE)
    expect(state.payment_status).toBe('paid')
  })

  it('disminuir el abono baja lo pagado y una Pagada vuelve a Abonada', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, PRICE)

    expect((await ticketState(ticketId)).payment_status).toBe('paid')

    const { error } = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: 25_000,
      p_expected_amount: PRICE,
    })
    expect(error).toBeNull()

    const state = await ticketState(ticketId)
    expect(state.paid_amount).toBe(25_000)
    expect(state.payment_status).toBe('partial')
  })

  it('editar uno de varios abonos no toca los demas ni crea un pago nuevo', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.carlos.id)
    const primero = await pay(seller1, ctx.clients.carlos.id, ticketId, 20_000)
    const segundo = await pay(seller1, ctx.clients.carlos.id, ticketId, 30_000)
    const antes = await paymentCount(ctx.clients.carlos.id)

    const { error } = await seller1.rpc('update_payment_allocation', {
      p_payment_id: segundo,
      p_ticket_id: ticketId,
      p_amount: 45_000,
      p_expected_amount: 30_000,
    })
    expect(error).toBeNull()

    expect(await paymentCount(ctx.clients.carlos.id)).toBe(antes)

    const { data: filas } = await ctx.svc
      .from('payment_allocations')
      .select('payment_id, amount')
      .eq('ticket_id', ticketId)
    const dePrimero = filas!.find((row) => row.payment_id === primero)!
    const deSegundo = filas!.find((row) => row.payment_id === segundo)!
    expect(dePrimero.amount).toBe(20_000)
    expect(deSegundo.amount).toBe(45_000)
    expect(filas).toHaveLength(2)

    const state = await ticketState(ticketId)
    expect(state.paid_amount).toBe(65_000)
    expect(state.payment_status).toBe('partial')
  })

  it('en un pago repartido solo cambia la boleta indicada y el total cuadra', async () => {
    const t1 = await assignFreshTicket(ctx.clients.carlos.id)
    const t2 = await assignFreshTicket(ctx.clients.carlos.id)

    const { data: paymentId, error: createError } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.carlos.id,
      p_total_amount: 70_000,
      p_allocations: [
        { ticket_id: t1, amount: 40_000 },
        { ticket_id: t2, amount: 30_000 },
      ],
    })
    expect(createError).toBeNull()

    const { error } = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId as string,
      p_ticket_id: t1,
      p_amount: 50_000,
      p_expected_amount: 40_000,
    })
    expect(error).toBeNull()

    expect((await ticketState(t1)).paid_amount).toBe(50_000)
    expect((await ticketState(t2)).paid_amount).toBe(30_000)

    const { data: pago } = await ctx.svc
      .from('payments')
      .select('total_amount')
      .eq('id', paymentId as string)
      .single()
    expect(pago!.total_amount).toBe(80_000)

    const { data: asignaciones } = await ctx.svc
      .from('payment_allocations')
      .select('ticket_id, amount')
      .eq('payment_id', paymentId as string)
    expect(asignaciones!.find((row) => row.ticket_id === t2)!.amount).toBe(30_000)
  })
})

describe('update_payment_allocation validacion (BR-F03, BR-F12, BR-F15)', () => {
  it('rechaza cero y negativo y no mueve el saldo', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 40_000)

    for (const amount of [0, -1000]) {
      const { error } = await seller1.rpc('update_payment_allocation', {
        p_payment_id: paymentId,
        p_ticket_id: ticketId,
        p_amount: amount,
        p_expected_amount: 40_000,
      })
      expect(error, `amount=${amount}`).not.toBeNull()
    }

    expect((await ticketState(ticketId)).paid_amount).toBe(40_000)
  })

  it('rechaza un valor que haria superar el precio, sin dejar el cambio a medias', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 40_000)
    await pay(seller1, ctx.clients.ana.id, ticketId, 30_000)

    const { error } = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: PRICE,
      p_expected_amount: 40_000,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/supera su saldo pendiente/i)

    const state = await ticketState(ticketId)
    expect(state.paid_amount).toBe(70_000)
    expect(state.payment_status).toBe('partial')

    const { data: asignacion } = await ctx.svc
      .from('payment_allocations')
      .select('amount')
      .eq('payment_id', paymentId)
      .eq('ticket_id', ticketId)
      .single()
    expect(asignacion!.amount).toBe(40_000)
  })

  it('un pago anulado no se puede editar (BR-F15)', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 15_000)

    const anulacion = await owner.rpc('void_payment', {
      p_payment_id: paymentId,
      p_reason: 'Anulacion para probar que no se edita',
    })
    expect(anulacion.error).toBeNull()

    const { error } = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: 20_000,
      p_expected_amount: 15_000,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/anulado/i)
    expect((await ticketState(ticketId)).paid_amount).toBe(0)
  })

  it('el mismo valor es idempotente: no escribe ni audita de nuevo', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 18_000)

    const { count: auditoriaAntes } = await ctx.svc
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'payment.update')
      .eq('entity_id', paymentId)

    const { error } = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: 18_000,
      p_expected_amount: 18_000,
    })
    expect(error).toBeNull()

    const { count: auditoriaDespues } = await ctx.svc
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'payment.update')
      .eq('entity_id', paymentId)
    expect(auditoriaDespues).toBe(auditoriaAntes)
    expect((await ticketState(ticketId)).paid_amount).toBe(18_000)
  })
})

describe('update_payment_allocation permisos y bitacora', () => {
  it('un vendedor no edita el abono de otro (BR-U07)', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 12_000)

    const { error } = await seller2.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: 20_000,
      p_expected_amount: 12_000,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no existe o no tienes acceso/i)
    expect((await ticketState(ticketId)).paid_amount).toBe(12_000)
  })

  it('un vendedor de otra organizacion no edita el abono', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 11_000)

    const { error } = await otherOrgSeller.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: 20_000,
      p_expected_amount: 11_000,
    })
    expect(error).not.toBeNull()
    expect((await ticketState(ticketId)).paid_amount).toBe(11_000)
  })

  it('el personal puede corregir el abono de un vendedor', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 22_000)

    const { error } = await owner.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: 35_000,
      p_expected_amount: 22_000,
    })
    expect(error).toBeNull()
    expect((await ticketState(ticketId)).paid_amount).toBe(35_000)
  })

  it('un vendedor no puede cambiar el importe por UPDATE directo', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 14_000)

    const { data: alloc } = await ctx.svc
      .from('payment_allocations')
      .select('id')
      .eq('payment_id', paymentId)
      .single()

    const directo = await seller1
      .from('payment_allocations')
      .update({ amount: 50_000 })
      .eq('id', alloc!.id)
      .select()
    if (directo.error) expect(directo.error.code).toBe('42501')
    else expect(directo.data).toEqual([])

    expect((await ticketState(ticketId)).paid_amount).toBe(14_000)
  })

  it('la bitacora guarda el valor anterior y el nuevo (BR-F14)', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 16_000)

    const { error } = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: 27_000,
      p_expected_amount: 16_000,
    })
    expect(error).toBeNull()

    const { data: logs } = await ctx.svc
      .from('audit_logs')
      .select('action, old_values, new_values, actor_profile_id')
      .eq('entity_id', paymentId)
      .eq('action', 'payment.update')
      .order('created_at', { ascending: false })
      .limit(1)
    const log = logs![0]!
    expect(log.actor_profile_id).toBe(ctx.ids.seller1)
    expect(log.old_values).toMatchObject({ ticket_id: ticketId, amount: 16_000 })
    expect(log.new_values).toMatchObject({ ticket_id: ticketId, amount: 27_000 })
  })
})

describe('update_payment_allocation concurrencia y ganancia', () => {
  it('dos ediciones concurrentes con el mismo valor esperado: solo una gana', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, 20_000)

    const [a, b] = await Promise.allSettled([
      seller1.rpc('update_payment_allocation', {
        p_payment_id: paymentId,
        p_ticket_id: ticketId,
        p_amount: 30_000,
        p_expected_amount: 20_000,
      }),
      seller1.rpc('update_payment_allocation', {
        p_payment_id: paymentId,
        p_ticket_id: ticketId,
        p_amount: 45_000,
        p_expected_amount: 20_000,
      }),
    ])

    const exitosos = [a, b].filter((r) => r.status === 'fulfilled' && r.value.error === null)
    const fallidos = [a, b].filter((r) => r.status === 'fulfilled' && r.value.error !== null)
    expect(exitosos).toHaveLength(1)
    expect(fallidos).toHaveLength(1)
    expect(
      fallidos[0] && fallidos[0].status === 'fulfilled' ? fallidos[0].value.error!.message : '',
    ).toMatch(/ya fue modificado/i)

    const pagado = (await ticketState(ticketId)).paid_amount
    expect([30_000, 45_000]).toContain(pagado)
  })

  it('al dejar de estar Pagada baja la ganancia; al volver a Pagada sube (BR-G01, BR-G06)', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)
    const paymentId = await pay(seller1, ctx.clients.ana.id, ticketId, PRICE)

    const { data: cobrada } = await ctx.svc
      .from('seller_commissions')
      .select('tickets_paid, earned')
      .eq('seller_id', ctx.ids.seller1)
      .eq('raffle_id', ctx.demoRaffle.id)
      .single()
    const pagadasAlCobrar = cobrada!.tickets_paid

    const baja = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: PRICE - 1_000,
      p_expected_amount: PRICE,
    })
    expect(baja.error).toBeNull()
    expect((await ticketState(ticketId)).payment_status).toBe('partial')

    const { data: trasBajar } = await ctx.svc
      .from('seller_commissions')
      .select('tickets_paid, earned')
      .eq('seller_id', ctx.ids.seller1)
      .eq('raffle_id', ctx.demoRaffle.id)
      .single()
    expect(trasBajar!.tickets_paid).toBe(pagadasAlCobrar - 1)
    expect(Number(trasBajar!.earned)).toBeLessThan(Number(cobrada!.earned))

    const sube = await seller1.rpc('update_payment_allocation', {
      p_payment_id: paymentId,
      p_ticket_id: ticketId,
      p_amount: PRICE,
      p_expected_amount: PRICE - 1_000,
    })
    expect(sube.error).toBeNull()
    expect((await ticketState(ticketId)).payment_status).toBe('paid')

    const { data: trasSubir } = await ctx.svc
      .from('seller_commissions')
      .select('tickets_paid, earned')
      .eq('seller_id', ctx.ids.seller1)
      .eq('raffle_id', ctx.demoRaffle.id)
      .single()
    expect(trasSubir!.tickets_paid).toBe(pagadasAlCobrar)
    expect(Number(trasSubir!.earned)).toBe(Number(cobrada!.earned))
    // No se afirma el ledger entero de vendedor1: es cuenta del seed y de
    // otras suites. La invariante BR-G10 vive en `commissions.test.ts`.
  })
})
