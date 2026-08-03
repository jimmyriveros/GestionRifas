/**
 * Pruebas obligatorias 7, 8 y 9 del prompt de la Fase 2: aislamiento entre
 * organizaciones y entre vendedores.
 *
 * NINGUNA prueba de este archivo usa la service role para el acto que se esta
 * probando: todas operan con una sesion real y la clave publica, igual que lo
 * haria un atacante desde el navegador (docs/SECURITY.md §1).
 *
 * Reglas cubiertas: BR-O02, BR-U02, BR-U03, BR-U07, BR-F10, BR-I09, BR-D02.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { anonClient, loadSeedContext, signInAs, USERS, type Client } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let owner: Client
let admin: Client
let otherOrgOwner: Client

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
  otherOrgOwner = await signInAs(USERS.otherOrgOwner)
})

describe('DB-08 un vendedor no puede LEER datos de otro vendedor (BR-U07)', () => {
  it('solo ve sus propias boletas', async () => {
    const { data, error } = await seller1.from('tickets').select('id, seller_id')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((t) => t.seller_id === ctx.ids.seller1)).toBe(true)
  })

  it('no ve la boleta de otro vendedor ni pidiendola por su id exacto', async () => {
    const { data: otras } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller2)
      .limit(1)

    const { data, error } = await seller1.from('tickets').select('*').eq('id', otras![0]!.id)
    expect(error).toBeNull() // no distingue "no existe" de "sin permiso" (T15)
    expect(data).toEqual([])
  })

  it('solo ve sus propios clientes', async () => {
    const { data } = await seller1.from('clients').select('id, seller_id')
    expect(data!.every((c) => c.seller_id === ctx.ids.seller1)).toBe(true)
  })

  it('solo ve sus propios pagos', async () => {
    const { data } = await seller1.from('payments').select('id, seller_id')
    expect(data!.every((p) => p.seller_id === ctx.ids.seller1)).toBe(true)
  })

  it('solo ve las asignaciones de sus propios pagos', async () => {
    const { data } = await seller1
      .from('payment_allocations')
      .select('id, payment_id, payments!inner(seller_id)')
    for (const row of data ?? []) {
      expect(row.payments.seller_id).toBe(ctx.ids.seller1)
    }
  })

  it('las VISTAS heredan el aislamiento (security_invoker, D-010)', async () => {
    const { data: balances } = await seller1.from('v_ticket_balances').select('seller_id')
    expect(balances!.length).toBeGreaterThan(0)
    expect(balances!.every((r) => r.seller_id === ctx.ids.seller1)).toBe(true)

    const { data: summary } = await seller1.from('v_seller_summary').select('seller_id')
    expect(summary!.every((r) => r.seller_id === ctx.ids.seller1)).toBe(true)

    const { data: clientes } = await seller1.from('v_client_balances').select('seller_id')
    expect(clientes!.every((r) => r.seller_id === ctx.ids.seller1)).toBe(true)
  })

  it('no puede leer la bitacora de auditoria (BR-D04)', async () => {
    const { data } = await seller1.from('audit_logs').select('id')
    expect(data).toEqual([])
  })
})

describe('DB-09 un vendedor no puede MODIFICAR datos de otro vendedor (BR-U07)', () => {
  it('no puede actualizar la boleta de otro vendedor', async () => {
    const { data: ajena } = await ctx.svc
      .from('tickets')
      .select('id, daily_number')
      .eq('seller_id', ctx.ids.seller2)
      .limit(1)
      .single()

    const { data, error } = await seller1
      .from('tickets')
      .update({ daily_number: '9998' })
      .eq('id', ajena!.id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([]) // cero filas afectadas

    const { data: sinCambios } = await ctx.svc
      .from('tickets')
      .select('daily_number')
      .eq('id', ajena!.id)
      .single()
    expect(sinCambios!.daily_number).toBe(ajena!.daily_number)
  })

  it('no puede robarse una boleta ajena poniendose como vendedor', async () => {
    const { data: ajena } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller2)
      .limit(1)
      .single()

    const { data } = await seller1
      .from('tickets')
      .update({ seller_id: ctx.ids.seller1 })
      .eq('id', ajena!.id)
      .select()
    expect(data).toEqual([])
  })

  it('no puede regalar su propia boleta a otro vendedor (WITH CHECK)', async () => {
    const { data: propia } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller1)
      .eq('inventory_status', 'pending_approval')
      .limit(1)
      .single()

    const { data, error } = await seller1
      .from('tickets')
      .update({ seller_id: ctx.ids.seller2 })
      .eq('id', propia!.id)
      .select()

    // O lo rechaza el WITH CHECK, o simplemente no afecta filas.
    if (error) {
      expect(error.code).toBe('42501')
    } else {
      expect(data).toEqual([])
    }
  })

  it('no puede auto-aprobar su boleta pendiente (BR-I09)', async () => {
    const { data: pendiente } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller1)
      .eq('inventory_status', 'pending_approval')
      .limit(1)
      .single()

    const { data, error } = await seller1
      .from('tickets')
      .update({ inventory_status: 'available' })
      .eq('id', pendiente!.id)
      .select()

    if (error) {
      expect(error.code).toBe('42501')
    } else {
      expect(data).toEqual([])
    }

    const { data: after } = await ctx.svc
      .from('tickets')
      .select('inventory_status')
      .eq('id', pendiente!.id)
      .single()
    expect(after!.inventory_status).toBe('pending_approval')
  })

  it('no puede declararse pagada una boleta escribiendo paid_amount', async () => {
    const { data: propia } = await ctx.svc
      .from('tickets')
      .select('id, paid_amount')
      .eq('seller_id', ctx.ids.seller1)
      .eq('inventory_status', 'assigned')
      .limit(1)
      .single()

    const { error } = await seller1
      .from('tickets')
      .update({ paid_amount: 100_000 })
      .eq('id', propia!.id)
      .select()

    const { data: after } = await ctx.svc
      .from('tickets')
      .select('paid_amount')
      .eq('id', propia!.id)
      .single()

    // La fila esta fuera de su politica de UPDATE (esta 'assigned'), y ademas
    // el trigger tickets_guard_paid_amount rechaza cualquier valor inventado.
    expect(after!.paid_amount).toBe(propia!.paid_amount)
    if (error) expect(['42501', '23514']).toContain(error.code)
  })

  it('no puede anular un pago (BR-F10)', async () => {
    const { data: pago } = await ctx.svc
      .from('payments')
      .select('id')
      .eq('seller_id', ctx.ids.seller1)
      .is('voided_at', null)
      .limit(1)
      .single()

    const { error } = await seller1.rpc('void_payment', {
      p_payment_id: pago!.id,
      p_reason: 'Intento no autorizado desde una prueba',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/permiso/i)

    const { data: after } = await ctx.svc
      .from('payments')
      .select('voided_at')
      .eq('id', pago!.id)
      .single()
    expect(after!.voided_at).toBeNull()
  })
})

describe('DB-07 aislamiento entre organizaciones (BR-O02)', () => {
  it('el owner de una organizacion no ve las boletas de la otra', async () => {
    const { data } = await owner.from('tickets').select('organization_id')
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((t) => t.organization_id === ctx.demoOrg.id)).toBe(true)
  })

  it('el owner de la otra organizacion tampoco ve las de esta', async () => {
    const { data } = await otherOrgOwner.from('tickets').select('organization_id')
    expect(data!.every((t) => t.organization_id === ctx.controlOrg.id)).toBe(true)
  })

  it('no ve clientes, pagos ni rifas de la otra organizacion', async () => {
    for (const table of ['clients', 'payments', 'raffles'] as const) {
      const { data } = await owner.from(table).select('organization_id')
      expect(data!.every((r) => r.organization_id === ctx.demoOrg.id)).toBe(true)
    }
  })

  it('no puede leer una fila de la otra organizacion ni por id exacto', async () => {
    const { data } = await owner.from('clients').select('*').eq('id', ctx.clients.fabio.id)
    expect(data).toEqual([])
  })

  it('no puede crear una boleta en la rifa de la otra organizacion', async () => {
    const { error } = await owner.from('tickets').insert({
      organization_id: ctx.controlOrg.id,
      raffle_id: ctx.controlRaffle.id,
      seller_id: ctx.ids.otherOrgSeller,
      created_by: ctx.ids.owner,
      daily_number: '4321',
      weekly_number: '8765',
      inventory_status: 'available',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501') // RLS
  })
})

describe('proteccion del Owner frente a un Admin (BR-U02, BR-U03)', () => {
  it('un admin no puede desactivar la membresia del owner', async () => {
    const { data: ownerMembership } = await ctx.svc
      .from('memberships')
      .select('id')
      .eq('profile_id', ctx.ids.owner)
      .eq('organization_id', ctx.demoOrg.id)
      .single()

    const { data } = await admin
      .from('memberships')
      .update({ is_active: false })
      .eq('id', ownerMembership!.id)
      .select()
    expect(data).toEqual([])

    const { data: after } = await ctx.svc
      .from('memberships')
      .select('is_active')
      .eq('id', ownerMembership!.id)
      .single()
    expect(after!.is_active).toBe(true)
  })

  it('un admin no puede ascenderse a si mismo a owner', async () => {
    const { data: adminMembership } = await ctx.svc
      .from('memberships')
      .select('id')
      .eq('profile_id', ctx.ids.admin)
      .single()

    const { data, error } = await admin
      .from('memberships')
      .update({ role: 'owner' })
      .eq('id', adminMembership!.id)
      .select()

    if (error) {
      expect(error.code).toBe('42501')
    } else {
      expect(data).toEqual([])
    }

    const { data: after } = await ctx.svc
      .from('memberships')
      .select('role')
      .eq('id', adminMembership!.id)
      .single()
    expect(after!.role).toBe('admin')
  })

  it('un admin no puede crear una segunda membresia de owner', async () => {
    const { error } = await admin.from('memberships').insert({
      organization_id: ctx.demoOrg.id,
      profile_id: ctx.ids.seller1,
      role: 'owner',
    })
    expect(error).not.toBeNull()
  })

  it('un admin SI puede administrar vendedores (no todo esta bloqueado)', async () => {
    const { data: sellerMembership } = await ctx.svc
      .from('memberships')
      .select('id, is_active')
      .eq('profile_id', ctx.ids.seller2)
      .single()

    const { data } = await admin
      .from('memberships')
      .update({ is_active: false })
      .eq('id', sellerMembership!.id)
      .select()
    expect(data!.length).toBe(1)

    // Se restaura para no afectar a las demas pruebas
    await ctx.svc.from('memberships').update({ is_active: true }).eq('id', sellerMembership!.id)
  })
})

describe('DB-18/19 el borrado fisico es imposible (BR-C06, BR-F09, BR-D02)', () => {
  it('nadie puede borrar pagos', async () => {
    const { data: pago } = await ctx.svc.from('payments').select('id').limit(1).single()

    for (const [nombre, client] of [
      ['owner', owner],
      ['vendedor', seller1],
    ] as const) {
      const { error, data } = await client.from('payments').delete().eq('id', pago!.id).select()
      if (error) {
        expect(error.code, nombre).toBe('42501')
      } else {
        expect(data, nombre).toEqual([])
      }
    }

    const { data: sigue } = await ctx.svc.from('payments').select('id').eq('id', pago!.id)
    expect(sigue!.length).toBe(1)
  })

  it('nadie puede borrar ni alterar la bitacora de auditoria', async () => {
    const { data: log } = await ctx.svc.from('audit_logs').select('id').limit(1).single()

    const del = await owner.from('audit_logs').delete().eq('id', log!.id).select()
    if (del.error) expect(del.error.code).toBe('42501')
    else expect(del.data).toEqual([])

    const upd = await owner
      .from('audit_logs')
      .update({ action: 'manipulado' })
      .eq('id', log!.id)
      .select()
    if (upd.error) expect(upd.error.code).toBe('42501')
    else expect(upd.data).toEqual([])

    const { data: intacto } = await ctx.svc
      .from('audit_logs')
      .select('action')
      .eq('id', log!.id)
      .single()
    expect(intacto!.action).not.toBe('manipulado')
  })

  it('nadie puede borrar clientes (se archivan)', async () => {
    const { error, data } = await seller1
      .from('clients')
      .delete()
      .eq('id', ctx.clients.ana.id)
      .select()
    if (error) expect(error.code).toBe('42501')
    else expect(data).toEqual([])

    const { data: sigue } = await ctx.svc.from('clients').select('id').eq('id', ctx.clients.ana.id)
    expect(sigue!.length).toBe(1)
  })
})

describe('un visitante sin sesion no ve absolutamente nada (BR-A03)', () => {
  it('todas las tablas de negocio devuelven vacio', async () => {
    const anon = anonClient()
    for (const table of ['raffles', 'clients', 'tickets', 'payments', 'audit_logs'] as const) {
      const { data, error } = await anon.from(table).select('*')
      // Sin sesion: o no hay privilegio, o RLS no deja ver ninguna fila.
      if (error) expect(['42501', 'PGRST301']).toContain(error.code)
      else expect(data, table).toEqual([])
    }
  })
})
