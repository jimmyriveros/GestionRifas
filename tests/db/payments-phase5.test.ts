/**
 * Pruebas de base de datos de la Fase 5: pagos, abonos y saldos.
 *
 * La Fase 2 ya cubrio las invariantes financieras crudas (sobrepago,
 * atomicidad, concurrencia) en `payments.test.ts`. Este archivo cubre lo que
 * la Fase 5 pone encima: los caminos que recorre la INTERFAZ —vendedor
 * registrando abonos, personal anulando— y las reglas que solo se activan
 * cuando existen pagos.
 *
 * Ninguna prueba usa la service role para el acto probado (D-043).
 *
 * D-198: el personal ya no anula ni registra abonos. `void_payment` quedo
 * dormida y su cuerpo se ejecuta con `voidPaymentAs` (ver `helpers.ts`).
 *
 * Reglas cubiertas: BR-F02, BR-F03, BR-F05, BR-F06, BR-F07, BR-F08, BR-F09,
 * BR-F10, BR-F11, BR-F12, BR-F13, BR-I11, BR-I12.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import {
  asProfile,
  loadSeedContext,
  randomNumbers,
  signInAs,
  USERS,
  voidPaymentAs,
  type Client,
} from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let seller2: Client
let owner: Client
let admin: Client

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
})

/** Boleta asignada nueva del vendedor 1, con su precio completo por cobrar. */
async function assignedTicket(clientId: string): Promise<{ id: string; price: number }> {
  const numbers = randomNumbers()
  const { data: ticket, error } = await ctx.svc
    .from('tickets')
    .insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'available',
      created_by: ctx.ids.owner,
    })
    .select('id')
    .single()
  if (error) throw error

  const { error: assignError } = await seller1.rpc('assign_ticket', {
    p_ticket_id: ticket.id,
    p_client_id: clientId,
  })
  if (assignError) throw assignError

  const { data: assigned } = await ctx.svc
    .from('tickets')
    .select('sale_price')
    .eq('id', ticket.id)
    .single()

  return { id: ticket.id, price: assigned!.sale_price! }
}

async function ticketState(ticketId: string) {
  const { data } = await ctx.svc
    .from('tickets')
    .select('paid_amount, payment_status, inventory_status')
    .eq('id', ticketId)
    .single()
  return data!
}

describe('F5-01 registro de abonos por el vendedor (BR-F02, BR-F07)', () => {
  it('un abono parcial deja la boleta Abonada', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 40_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 40_000 }],
      p_payment_method: 'cash',
    })
    expect(error).toBeNull()

    const state = await ticketState(ticket.id)
    expect(state.paid_amount).toBe(40_000)
    expect(state.payment_status).toBe('partial')
  })

  it('completar el saldo la deja Pagada', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 60_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 60_000 }],
    })
    const parcial = await ticketState(ticket.id)
    expect(parcial.payment_status).toBe('partial')

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: ticket.price - 60_000,
      p_allocations: [{ ticket_id: ticket.id, amount: ticket.price - 60_000 }],
    })
    expect(error).toBeNull()

    const state = await ticketState(ticket.id)
    expect(state.paid_amount).toBe(ticket.price)
    expect(state.payment_status).toBe('paid')
  })

  it('un solo peso ya la deja Abonada, no Sin pagar (limites de CLAUDE.md 19)', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 1,
      p_allocations: [{ ticket_id: ticket.id, amount: 1 }],
    })

    const state = await ticketState(ticket.id)
    expect(state.payment_status).toBe('partial')
  })

  it('reparte un pago entre varias boletas del mismo cliente (BR-F05)', async () => {
    const first = await assignedTicket(ctx.clients.ana.id)
    const second = await assignedTicket(ctx.clients.ana.id)

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 70_000,
      p_allocations: [
        { ticket_id: first.id, amount: 50_000 },
        { ticket_id: second.id, amount: 20_000 },
      ],
    })
    expect(error).toBeNull()

    expect((await ticketState(first.id)).paid_amount).toBe(50_000)
    expect((await ticketState(second.id)).paid_amount).toBe(20_000)
  })

  it('rechaza un reparto que no cuadra con el total', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 50_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 30_000 }],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/igual al total/i)
    expect((await ticketState(ticket.id)).paid_amount).toBe(0)
  })

  it('rechaza el sobrepago con un mensaje que dice cuanto queda (BR-F12)', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: ticket.price + 1,
      p_allocations: [{ ticket_id: ticket.id, amount: ticket.price + 1 }],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/supera su saldo pendiente/i)
    expect((await ticketState(ticket.id)).paid_amount).toBe(0)
  })

  it('rechaza importes menores o iguales a cero (BR-F03)', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    for (const amount of [0, -1000]) {
      const { error } = await seller1.rpc('create_payment', {
        p_client_id: ctx.clients.ana.id,
        p_total_amount: amount,
        p_allocations: [{ ticket_id: ticket.id, amount }],
      })
      expect(error).not.toBeNull()
    }
  })

  it('un fallo parcial no deja rastro: atomicidad (BR-F06)', async () => {
    const good = await assignedTicket(ctx.clients.ana.id)
    const bad = await assignedTicket(ctx.clients.ana.id)

    // La segunda asignacion sobrepasa: debe caerse el pago COMPLETO.
    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 10_000 + bad.price + 1,
      p_allocations: [
        { ticket_id: good.id, amount: 10_000 },
        { ticket_id: bad.id, amount: bad.price + 1 },
      ],
    })
    expect(error).not.toBeNull()

    expect((await ticketState(good.id)).paid_amount).toBe(0)
    expect((await ticketState(bad.id)).paid_amount).toBe(0)
  })

  it('rechaza pagar la boleta de otro cliente (BR-F02)', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.carlos.id,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 10_000 }],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no pertenece a este cliente/i)
  })

  it('rechaza pagar una boleta SIN cliente (BR-F04)', async () => {
    const numbers = randomNumbers()
    const { data: free } = await ctx.svc
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        daily_number: numbers.daily,
        weekly_number: numbers.weekly,
        inventory_status: 'available',
        created_by: ctx.ids.owner,
      })
      .select('id')
      .single()

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: free!.id, amount: 10_000 }],
    })

    expect(error).not.toBeNull()
  })

  it('un vendedor no puede registrar pagos del cliente de otro vendedor (BR-U07)', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    const { error } = await seller2.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 10_000 }],
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no existe o no tienes acceso/i)
  })
})

describe('F5-02 anulacion de pagos (BR-F09, BR-F10, BR-F11)', () => {
  async function paidTicket(): Promise<{ ticketId: string; paymentId: string; price: number }> {
    const ticket = await assignedTicket(ctx.clients.ana.id)
    const { data: paymentId } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 30_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 30_000 }],
    })
    return { ticketId: ticket.id, paymentId: paymentId as string, price: ticket.price }
  }

  it('desde D-198 ninguna sesion anula: ni el Dueño ni el Administrador', async () => {
    const { ticketId, paymentId } = await paidTicket()

    for (const staff of [owner, admin]) {
      const { error } = await staff.rpc('void_payment', {
        p_payment_id: paymentId,
        p_reason: 'Intento desde el portal administrativo',
      })
      expect(error).not.toBeNull()
      expect(error!.code).toBe('42501')
    }

    const { data } = await ctx.svc
      .from('payments')
      .select('voided_at, voided_by, void_reason')
      .eq('id', paymentId)
      .single()
    expect(data).toEqual({ voided_at: null, voided_by: null, void_reason: null })
    expect((await ticketState(ticketId)).paid_amount).toBe(30_000)
  })

  it('anular recalcula el saldo de inmediato', async () => {
    const { ticketId, paymentId } = await paidTicket()
    expect((await ticketState(ticketId)).paid_amount).toBe(30_000)

    await voidPaymentAs(ctx.ids.admin, paymentId, 'Cheque devuelto por el banco')

    const state = await ticketState(ticketId)
    expect(state.paid_amount).toBe(0)
    expect(state.payment_status).toBe('unpaid')
  })

  it('el pago anulado NO se borra: sigue en el historial con su motivo', async () => {
    const { paymentId } = await paidTicket()
    await voidPaymentAs(ctx.ids.owner, paymentId, 'Error de digitacion')

    const { data } = await ctx.svc
      .from('payments')
      .select('voided_at, voided_by, void_reason')
      .eq('id', paymentId)
      .single()

    expect(data!.voided_at).not.toBeNull()
    expect(data!.voided_by).toBe(ctx.ids.owner)
    expect(data!.void_reason).toBe('Error de digitacion')
  })

  it('un vendedor NO puede anular (BR-F10)', async () => {
    const { paymentId } = await paidTicket()

    const { error } = await seller1.rpc('void_payment', {
      p_payment_id: paymentId,
      p_reason: 'Intento sin permiso',
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('exige un motivo de al menos 5 caracteres', async () => {
    const { paymentId } = await paidTicket()

    await expect(voidPaymentAs(ctx.ids.owner, paymentId, 'ups')).rejects.toThrow(/motivo/i)
  })

  it('un pago anulado no se puede volver a anular (D-013)', async () => {
    const { paymentId } = await paidTicket()
    await voidPaymentAs(ctx.ids.owner, paymentId, 'Primera anulacion')

    await expect(voidPaymentAs(ctx.ids.owner, paymentId, 'Segunda anulacion')).rejects.toThrow(
      /ya esta anulado/i,
    )
  })

  it('anular uno de dos pagos deja el saldo del otro intacto', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    const { data: first } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 30_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 30_000 }],
    })
    await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 20_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 20_000 }],
    })
    expect((await ticketState(ticket.id)).paid_amount).toBe(50_000)

    await voidPaymentAs(ctx.ids.owner, first as string, 'Se anula solo el primero')

    expect((await ticketState(ticket.id)).paid_amount).toBe(20_000)
  })

  it('anular libera saldo y permite volver a cobrar sin sobrepasar', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    const { data: paymentId } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: ticket.price,
      p_allocations: [{ ticket_id: ticket.id, amount: ticket.price }],
    })
    expect((await ticketState(ticket.id)).payment_status).toBe('paid')

    await voidPaymentAs(ctx.ids.owner, paymentId as string, 'Pago revertido')

    const { error } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: ticket.price,
      p_allocations: [{ ticket_id: ticket.id, amount: ticket.price }],
    })
    expect(error).toBeNull()
    expect((await ticketState(ticket.id)).payment_status).toBe('paid')
  })

  it('la anulacion queda auditada (BR-D01)', async () => {
    const { paymentId } = await paidTicket()
    await voidPaymentAs(ctx.ids.owner, paymentId, 'Anulacion auditada')

    const { data: logs } = await ctx.svc
      .from('audit_logs')
      .select('action, entity_id, actor_profile_id')
      .eq('entity_id', paymentId)
      .eq('action', 'payment.void')

    expect(logs!.length).toBeGreaterThan(0)
    expect(logs![0]!.actor_profile_id).toBe(ctx.ids.owner)
  })
})

describe('F5-03 boletas con pagos activos (BR-I11, BR-I12)', () => {
  it('no se puede anular una boleta con pagos activos, y si tras anularlos', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)
    const { data: paymentId } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 10_000 }],
    })

    // D-198: el personal ya no anula una boleta vendida, tenga o no abonos. Un
    // rechazo distinto segun el abono dejaria adivinar la «Abonada» detras de
    // «Sin pagar».
    const blocked = await owner.rpc('cancel_ticket', {
      p_ticket_id: ticket.id,
      p_reason: 'Intento con pagos activos',
    })
    expect(blocked.error).not.toBeNull()
    expect(blocked.error!.message).toMatch(/ya está vendida/i)

    // BR-I11 sigue en el disparador: ni cambiando el estado a mano sale de
    // «asignada» una boleta con pagos activos...
    const anular = {
      inventory_status: 'cancelled' as const,
      cancelled_at: new Date().toISOString(),
      cancel_reason: 'Directo, con la service role',
    }
    const directo = await ctx.svc.from('tickets').update(anular).eq('id', ticket.id)
    expect(directo.error).not.toBeNull()
    expect(directo.error!.message).toMatch(/pagos activos/i)

    await voidPaymentAs(ctx.ids.owner, paymentId as string, 'Libera la boleta')

    // ...y con el pago anulado, si. Desde una sesion del personal sigue sin
    // poder: la boleta continua vendida.
    const staffAfter = await owner.rpc('cancel_ticket', {
      p_ticket_id: ticket.id,
      p_reason: 'Tras anular el pago',
    })
    expect(staffAfter.error!.message).toMatch(/ya está vendida/i)

    const allowed = await ctx.svc.from('tickets').update(anular).eq('id', ticket.id)
    expect(allowed.error).toBeNull()
    expect((await ticketState(ticket.id)).inventory_status).toBe('cancelled')
  })

  it('no se puede cambiar el cliente de una boleta con pagos activos (BR-I12)', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)
    await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 10_000 }],
    })

    const { error } = await ctx.svc
      .from('tickets')
      .update({ client_id: ctx.clients.carlos.id })
      .eq('id', ticket.id)

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/pagos activos/i)
  })

  it('no se puede cambiar el precio de una boleta con pagos (BR-P05)', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)
    await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 10_000 }],
    })

    const { error } = await ctx.svc.from('tickets').update({ sale_price: 1 }).eq('id', ticket.id)

    expect(error).not.toBeNull()
  })

  it('nadie puede escribir paid_amount a mano', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)

    const { error } = await ctx.svc
      .from('tickets')
      .update({ paid_amount: 99_999 })
      .eq('id', ticket.id)

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/derivada/i)
  })
})

describe('F5-04 historial de pagos: lo que alimenta la interfaz (BR-F13)', () => {
  it('la vista trae todos los campos que exige el prompt', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)
    const { data: paymentId } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 25_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 25_000 }],
      p_payment_method: 'transfer',
      p_notes: 'Consignacion 123',
    })

    const { data, error } = await seller1
      .from('v_payment_history')
      .select('*')
      .eq('payment_id', paymentId as string)
      .single()

    expect(error).toBeNull()
    expect(data!.payment_date).not.toBeNull()
    expect(data!.total_amount).toBe(25_000)
    expect(data!.client_name).toBe('Ana Torres')
    expect(data!.seller_name).toBe('Julian Vargas')
    expect(data!.payment_method).toBe('transfer')
    expect(data!.notes).toBe('Consignacion 123')
    expect(data!.is_active).toBe(true)
    expect(Array.isArray(data!.allocations)).toBe(true)
    expect((data!.allocations as { ticket_id: string }[])[0]!.ticket_id).toBe(ticket.id)
  })

  it('el historial muestra QUIEN anulo el pago (CLAUDE.md 20)', async () => {
    const ticket = await assignedTicket(ctx.clients.ana.id)
    const { data: paymentId } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 15_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 15_000 }],
    })
    await voidPaymentAs(
      ctx.ids.owner,
      paymentId as string,
      'Para comprobar el nombre de quien anula',
    )

    // El nombre lo pone la VISTA: es un calculo, no un permiso, y se comprueba
    // con la service role.
    const { data } = await ctx.svc
      .from('v_payment_history')
      .select('voided_by_name, void_reason, is_active')
      .eq('payment_id', paymentId as string)
      .single()

    expect(data!.is_active).toBe(false)
    expect(data!.voided_by_name).toBe('Camila Restrepo')
    expect(data!.void_reason).toBe('Para comprobar el nombre de quien anula')

    // Su vendedor lo sigue viendo anulado y con su motivo: es su cartera.
    const { data: delVendedor } = await seller1
      .from('v_payment_history')
      .select('void_reason, is_active')
      .eq('payment_id', paymentId as string)
      .single()
    expect(delVendedor).toEqual({
      void_reason: 'Para comprobar el nombre de quien anula',
      is_active: false,
    })

    // El Dueño ya no ve pagos de ningun vendedor, ni siquiera el que anulo (D-198).
    const { data: delDueno } = await owner
      .from('v_payment_history')
      .select('payment_id')
      .eq('payment_id', paymentId as string)
    expect(delDueno).toEqual([])
  })

  it('I-015: el vendedor VE el pago que registro un administrador para su cliente', async () => {
    // Regresion. Con INNER JOIN sobre `profiles`, el perfil del administrador no
    // era visible para el vendedor y la fila ENTERA desaparecia de su historial,
    // aunque `payments_select` si le permitiera verla en la tabla base.
    //
    // Desde D-198 el personal ya no registra abonos, pero los que registro antes
    // siguen en la base. El pago se deja con esa forma —`created_by` del
    // Administrador— y en una sola transaccion, como lo escribia la RPC.
    const ticket = await assignedTicket(ctx.clients.ana.id)
    const { rows } = await asProfile<{ payment_id: string }>(
      ctx.ids.admin,
      `with pago as (
         insert into payments
           (organization_id, seller_id, client_id, total_amount, payment_method, created_by)
         values ($1, $2, $3, 12000, 'cash', $4)
         returning id, organization_id, client_id
       )
       insert into payment_allocations (payment_id, ticket_id, client_id, organization_id, amount)
       select id, $5, client_id, organization_id, 12000 from pago
       returning payment_id`,
      [ctx.demoOrg.id, ctx.ids.seller1, ctx.clients.ana.id, ctx.ids.admin, ticket.id],
    )
    const paymentId = rows[0]!.payment_id

    const { data: inTable } = await seller1
      .from('payments')
      .select('id')
      .eq('id', paymentId as string)
    const { data: inView } = await seller1
      .from('v_payment_history')
      .select('payment_id, created_by_name')
      .eq('payment_id', paymentId as string)

    expect(inTable).toHaveLength(1)
    expect(inView).toHaveLength(1)
    // El nombre del administrador no es visible para el vendedor: llega NULL,
    // que es justo lo que se busca. Lo que no puede pasar es perder el pago.
    expect(inView![0]!.created_by_name).toBeNull()
  })

  it('un vendedor solo ve sus pagos en el historial (BR-U07)', async () => {
    const { data } = await seller1.from('v_payment_history').select('seller_id')
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((row) => row.seller_id === ctx.ids.seller1)).toBe(true)
  })

  it('una organizacion no ve los pagos de otra (BR-O02)', async () => {
    const otherOrgOwner = await signInAs(USERS.otherOrgOwner)
    const { data } = await otherOrgOwner.from('v_payment_history').select('organization_id')
    expect((data ?? []).every((row) => row.organization_id === ctx.controlOrg.id)).toBe(true)
  })

  it('los saldos por cliente salen de SQL, no de la aplicacion (BR-F08)', async () => {
    const ticket = await assignedTicket(ctx.clients.beatriz.id)
    await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.beatriz.id,
      p_total_amount: 20_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 20_000 }],
    })

    const { data: balance } = await seller1
      .from('v_client_balances')
      .select('total_purchased, total_paid, pending_amount')
      .eq('client_id', ctx.clients.beatriz.id)
      .single()

    expect(balance!.pending_amount).toBe(balance!.total_purchased! - balance!.total_paid!)
  })
})
