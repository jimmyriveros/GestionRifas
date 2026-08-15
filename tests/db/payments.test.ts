/**
 * Pruebas obligatorias 10 y 11 del prompt de la Fase 2, mas las reglas
 * financieras criticas que las acompanan.
 *
 * Reglas cubiertas: BR-F02..BR-F12, BR-I11, BR-I12, BR-P04, BR-P05.
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
let owner: Client

/**
 * Precio VIGENTE de la rifa del seed, leido de la base (D-098).
 *
 * Lo que estas pruebas comprueban es el LIMITE: que el sobrepago se rechace,
 * que el importe exacto marque Pagada y que el precio congelado no se mueva.
 * Ese limite es el precio de la boleta, no un numero concreto: escribirlo a
 * mano convertia un cambio de precio de la rifa en nueve fallos que apuntaban
 * a la logica de pagos, que estaba intacta.
 */
let PRICE: number

/**
 * Crea una boleta NUEVA de vendedor1 y se la asigna al cliente indicado.
 *
 * Crea la boleta en lugar de tomar una del seed a proposito: si las pruebas
 * compitieran por el inventario finito del seed, se agotaria y unas dependerian
 * del orden de ejecucion de otras.
 */
async function assignFreshTicket(clientId: string): Promise<string> {
  const { daily, weekly } = randomNumbers()
  const created = await insertTicket(ctx.svc, {
    organization_id: ctx.demoOrg.id,
    raffle_id: ctx.demoRaffle.id,
    seller_id: ctx.ids.seller1,
    created_by: ctx.ids.owner,
    daily_number: daily,
    weekly_number: weekly,
  })
  if (created.error) throw new Error(`No se pudo crear la boleta: ${created.error.message}`)

  const { error } = await seller1.rpc('assign_ticket', {
    p_ticket_id: created.data!.id,
    p_client_id: clientId,
  })
  if (error) throw new Error(`No se pudo asignar la boleta: ${error.message}`)
  return created.data!.id
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  owner = await signInAs(USERS.owner)

  const { data: rifa, error } = await ctx.svc
    .from('raffles')
    .select('ticket_price')
    .eq('id', ctx.demoRaffle.id)
    .single()
  if (error) throw error
  PRICE = Number(rifa.ticket_price)
})

describe('DB-10 bloqueo de sobrepago (BR-F12)', () => {
  it('rechaza un pago mayor que el precio de la boleta', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: PRICE + 1,
      p_allocations: [{ ticket_id: ticketId, amount: PRICE + 1 }],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/supera su saldo pendiente/i)

    const { data } = await ctx.svc.from('tickets').select('paid_amount').eq('id', ticketId).single()
    expect(data!.paid_amount).toBe(0)
  })

  it('rechaza un abono que, sumado a lo ya pagado, excede el precio', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)

    const primero = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 60_000,
      p_allocations: [{ ticket_id: ticketId, amount: 60_000 }],
    })
    expect(primero.error).toBeNull()

    // Justo un peso por encima de lo que falta: el sobrepago mas pequeno posible.
    const excede = PRICE - 60_000 + 1
    const segundo = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: excede,
      p_allocations: [{ ticket_id: ticketId, amount: excede }],
    })
    expect(segundo.error).not.toBeNull()

    const { data } = await ctx.svc
      .from('tickets')
      .select('paid_amount, payment_status')
      .eq('id', ticketId)
      .single()
    expect(data!.paid_amount).toBe(60_000)
    expect(data!.payment_status).toBe('partial')
  })

  it('acepta el abono que completa EXACTAMENTE el precio y marca Pagada', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)

    await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: PRICE - 30_000,
      p_allocations: [{ ticket_id: ticketId, amount: PRICE - 30_000 }],
    })
    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 30_000,
      p_allocations: [{ ticket_id: ticketId, amount: 30_000 }],
    })
    expect(error).toBeNull()

    const { data } = await ctx.svc
      .from('tickets')
      .select('paid_amount, payment_status')
      .eq('id', ticketId)
      .single()
    expect(data!.paid_amount).toBe(PRICE)
    expect(data!.payment_status).toBe('paid')
  })

  it('dos abonos CONCURRENTES no pueden sobrepasar el precio (riesgo R-02)', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)

    // Dos abonos que caben por separado pero no juntos: uno debe fallar.
    const abono = PRICE - 10_000
    const [a, b] = await Promise.allSettled([
      seller1.rpc('create_payment', {
        p_client_id: ctx.clients.ana.id,
        p_total_amount: abono,
        p_allocations: [{ ticket_id: ticketId, amount: abono }],
      }),
      seller1.rpc('create_payment', {
        p_client_id: ctx.clients.ana.id,
        p_total_amount: abono,
        p_allocations: [{ ticket_id: ticketId, amount: abono }],
      }),
    ])

    const exitosos = [a, b].filter((r) => r.status === 'fulfilled' && r.value.error === null).length
    expect(exitosos).toBe(1)

    const { data } = await ctx.svc
      .from('tickets')
      .select('paid_amount, sale_price')
      .eq('id', ticketId)
      .single()
    expect(data!.paid_amount).toBe(abono)
    expect(data!.paid_amount).toBeLessThanOrEqual(data!.sale_price!)
  })
})

describe('DB-11 el pago solo puede aplicarse a boletas del propio cliente (BR-F02)', () => {
  it('rechaza aplicar el pago de un cliente a la boleta de OTRO cliente', async () => {
    const ticketDeAna = await assignFreshTicket(ctx.clients.ana.id)

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.carlos.id, // paga Carlos...
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: ticketDeAna, amount: 10_000 }], // ...boleta de Ana
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no pertenece a este cliente/i)
  })

  it('rechaza aplicar un pago a una boleta SIN cliente (BR-F04)', async () => {
    const { data: libre } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller1)
      .eq('inventory_status', 'available')
      .limit(1)
      .single()

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: libre!.id, amount: 10_000 }],
    })
    expect(error).not.toBeNull()
  })

  it('un vendedor no puede pagar la boleta de otro vendedor', async () => {
    const { data: ajena } = await ctx.svc
      .from('tickets')
      .select('id, client_id')
      .eq('seller_id', ctx.ids.seller2)
      .eq('inventory_status', 'assigned')
      .limit(1)
      .single()

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ajena!.client_id!,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: ajena!.id, amount: 10_000 }],
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no existe o no tienes acceso/i)
  })
})

describe('cuadre y atomicidad (BR-F05, BR-F06)', () => {
  it('rechaza un pago cuya suma de asignaciones no coincide con el total', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 50_000,
      p_allocations: [{ ticket_id: ticketId, amount: 30_000 }],
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/igual al total/i)
  })

  it('rechaza montos cero o negativos (BR-F03)', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.ana.id)

    for (const amount of [0, -1000]) {
      const { error } = await seller1.rpc('create_payment', {
        p_client_id: ctx.clients.ana.id,
        p_total_amount: amount,
        p_allocations: [{ ticket_id: ticketId, amount }],
      })
      expect(error, `amount=${amount}`).not.toBeNull()
    }
  })

  it('si una asignacion falla, NO queda rastro del pago (atomicidad)', async () => {
    const bueno = await assignFreshTicket(ctx.clients.ana.id)
    const { data: ajena } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller2)
      .eq('inventory_status', 'assigned')
      .limit(1)
      .single()

    const { count: antes } = await ctx.svc
      .from('payments')
      .select('id', { count: 'exact', head: true })

    // La primera asignacion es valida, la segunda no: debe revertirse TODO.
    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 30_000,
      p_allocations: [
        { ticket_id: bueno, amount: 20_000 },
        { ticket_id: ajena!.id, amount: 10_000 },
      ],
    })
    expect(error).not.toBeNull()

    const { count: despues } = await ctx.svc
      .from('payments')
      .select('id', { count: 'exact', head: true })
    expect(despues).toBe(antes)

    const { data: boleta } = await ctx.svc
      .from('tickets')
      .select('paid_amount')
      .eq('id', bueno)
      .single()
    expect(boleta!.paid_amount).toBe(0)
  })

  it('reparte un pago entre varias boletas del mismo cliente (BR-F02)', async () => {
    const t1 = await assignFreshTicket(ctx.clients.carlos.id)
    const t2 = await assignFreshTicket(ctx.clients.carlos.id)

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.carlos.id,
      p_total_amount: PRICE + 30_000,
      p_allocations: [
        { ticket_id: t1, amount: PRICE },
        { ticket_id: t2, amount: 30_000 },
      ],
    })
    expect(error).toBeNull()

    const { data } = await ctx.svc
      .from('tickets')
      .select('id, paid_amount, payment_status')
      .in('id', [t1, t2])

    const uno = data!.find((t) => t.id === t1)!
    const dos = data!.find((t) => t.id === t2)!
    expect(uno.payment_status).toBe('paid')
    expect(dos.payment_status).toBe('partial')
    expect(uno.paid_amount + dos.paid_amount).toBe(PRICE + 30_000)
  })
})

describe('anulacion y recalculo (BR-F09, BR-F11, D-013)', () => {
  it('al anular un pago, el saldo y el estado se recalculan', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.beatriz.id)

    const { data: paymentId } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.beatriz.id,
      p_total_amount: PRICE,
      p_allocations: [{ ticket_id: ticketId, amount: PRICE }],
    })

    const { data: antes } = await ctx.svc
      .from('tickets')
      .select('paid_amount, payment_status')
      .eq('id', ticketId)
      .single()
    expect(antes!.payment_status).toBe('paid')

    const { error } = await owner.rpc('void_payment', {
      p_payment_id: paymentId as string,
      p_reason: 'Anulacion de prueba automatizada',
    })
    expect(error).toBeNull()

    const { data: despues } = await ctx.svc
      .from('tickets')
      .select('paid_amount, payment_status')
      .eq('id', ticketId)
      .single()
    expect(despues!.paid_amount).toBe(0)
    expect(despues!.payment_status).toBe('unpaid')
  })

  it('el pago anulado permanece en el historial con su motivo (BR-F09)', async () => {
    const { data } = await ctx.svc
      .from('payments')
      .select('id, voided_at, void_reason')
      .not('voided_at', 'is', null)
      .limit(1)
      .single()

    expect(data!.voided_at).not.toBeNull()
    expect(data!.void_reason!.length).toBeGreaterThanOrEqual(5)
  })

  it('un pago anulado no se puede volver a anular ni reactivar (D-013)', async () => {
    const { data: anulado } = await ctx.svc
      .from('payments')
      .select('id')
      .not('voided_at', 'is', null)
      .limit(1)
      .single()

    const otra = await owner.rpc('void_payment', {
      p_payment_id: anulado!.id,
      p_reason: 'Segundo intento de anulacion',
    })
    expect(otra.error).not.toBeNull()

    const reactivar = await owner
      .from('payments')
      .update({ voided_at: null, voided_by: null, void_reason: null })
      .eq('id', anulado!.id)
      .select()
    if (reactivar.error) expect(reactivar.error.code).toBe('42501')
    else expect(reactivar.data).toEqual([])
  })

  it('exige un motivo de al menos 5 caracteres', async () => {
    const { data: activo } = await ctx.svc
      .from('payments')
      .select('id')
      .is('voided_at', null)
      .limit(1)
      .single()

    const { error } = await owner.rpc('void_payment', {
      p_payment_id: activo!.id,
      p_reason: 'no',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/motivo/i)
  })
})

describe('proteccion de boletas con pagos activos (BR-I11, BR-I12, BR-P05)', () => {
  it('no se puede cambiar el cliente de una boleta con pagos (BR-I12)', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.beatriz.id)
    await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.beatriz.id,
      p_total_amount: 20_000,
      p_allocations: [{ ticket_id: ticketId, amount: 20_000 }],
    })

    const { error } = await ctx.svc
      .from('tickets')
      .update({ client_id: ctx.clients.carlos.id })
      .eq('id', ticketId)

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/pagos activos/i)
  })

  it('no se puede cambiar el precio de una boleta con pagos (BR-P05)', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.beatriz.id)
    await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.beatriz.id,
      p_total_amount: 20_000,
      p_allocations: [{ ticket_id: ticketId, amount: 20_000 }],
    })

    const { error } = await ctx.svc
      .from('tickets')
      .update({ sale_price: 50_000 })
      .eq('id', ticketId)

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/precio de una boleta con pagos/i)
  })

  it('no se puede anular una boleta con pagos activos (BR-I11)', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.beatriz.id)
    await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.beatriz.id,
      p_total_amount: 20_000,
      p_allocations: [{ ticket_id: ticketId, amount: 20_000 }],
    })

    const { error } = await owner.rpc('cancel_ticket', {
      p_ticket_id: ticketId,
      p_reason: 'Intento de anulacion con pagos activos',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/pagos activos/i)
  })
})

describe('snapshot del precio de venta (BR-P04)', () => {
  it('cambiar el precio de la rifa NO altera las boletas ya vendidas', async () => {
    const ticketId = await assignFreshTicket(ctx.clients.carlos.id)

    const { data: antes } = await ctx.svc
      .from('tickets')
      .select('sale_price')
      .eq('id', ticketId)
      .single()
    expect(antes!.sale_price).toBe(PRICE)

    await ctx.svc.from('raffles').update({ ticket_price: 250_000 }).eq('id', ctx.demoRaffle.id)

    const { data: despues } = await ctx.svc
      .from('tickets')
      .select('sale_price')
      .eq('id', ticketId)
      .single()
    expect(despues!.sale_price).toBe(PRICE)

    await ctx.svc.from('raffles').update({ ticket_price: PRICE }).eq('id', ctx.demoRaffle.id)
  })
})
