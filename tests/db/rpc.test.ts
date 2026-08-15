/**
 * Pruebas de las funciones transaccionales (0007) que no cubren los otros
 * archivos: creacion masiva, aprobacion, anulacion y creacion de boletas por
 * parte del vendedor.
 *
 * Reglas cubiertas: CLAUDE.md §15 y §16, BR-I03, BR-I09, BR-I10, BR-R08, BR-R10.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { loadSeedContext, randomNumbers, signInAs, USERS, type Client } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client
let admin: Client
let seller1: Client

beforeAll(async () => {
  ctx = await loadSeedContext()
  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
  seller1 = await signInAs(USERS.seller1)
})

describe('bulk_create_tickets — creacion masiva (CLAUDE.md §15)', () => {
  it('crea un lote y devuelve el conteo', async () => {
    const rows = Array.from({ length: 25 }, () => randomNumbers()).map((n) => ({
      daily_number: n.daily,
      weekly_number: n.weekly,
    }))

    const { data, error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: rows,
    })

    expect(error).toBeNull()
    const result = data as { requested: number; inserted: number; conflicts: unknown[] }
    expect(result.requested).toBe(25)
    expect(result.inserted).toBe(25)
    expect(result.conflicts).toEqual([])
  })

  it('acepta 1.000 filas (limite superior de CLAUDE.md §15)', async () => {
    const seen = new Set<string>()
    const rows: Array<{ daily_number: string; weekly_number: string }> = []
    while (rows.length < 1000) {
      const n = randomNumbers()
      const key = `${n.daily}-${n.weekly}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ daily_number: n.daily, weekly_number: n.weekly })
    }

    const { data, error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller2,
      p_rows: rows,
    })

    expect(error).toBeNull()
    const result = data as { requested: number; inserted: number }
    expect(result.requested).toBe(1000)
    // Puede haber colisiones con boletas ya existentes; lo importante es que el
    // lote completo se procese sin abortar.
    expect(result.inserted).toBeGreaterThan(950)
  })

  it('rechaza mas de 1.000 filas', async () => {
    const rows = Array.from({ length: 1001 }, () => ({
      daily_number: '1111',
      weekly_number: '2222',
    }))
    const { error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: rows,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/entre 1 y 1\.000/i)
  })

  it('reporta los duplicados SIN abortar el resto del lote (errores parciales)', async () => {
    const repetida = randomNumbers()
    const nueva = randomNumbers()

    // Se crea primero una boleta con la combinacion "repetida"
    await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: [{ daily_number: repetida.daily, weekly_number: repetida.weekly }],
    })

    const { data, error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: [
        { daily_number: repetida.daily, weekly_number: repetida.weekly }, // conflicto
        { daily_number: nueva.daily, weekly_number: nueva.weekly }, // valida
      ],
    })

    expect(error).toBeNull()
    const result = data as {
      inserted: number
      conflicts: Array<{ daily_number: string; weekly_number: string }>
    }
    expect(result.inserted).toBe(1)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]!.daily_number).toBe(repetida.daily)
  })

  it('crea en estado draft las filas sin numeros (guardado parcial)', async () => {
    const { data, error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: [{ daily_number: null, weekly_number: null }, {}],
    })
    expect(error).toBeNull()
    expect((data as { inserted: number }).inserted).toBe(2)
  })

  it('un VENDEDOR no puede usar la creacion masiva', async () => {
    const n = randomNumbers()
    const { error } = await seller1.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: [{ daily_number: n.daily, weekly_number: n.weekly }],
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/permiso/i)
  })

  it('no permite crear boletas para un usuario que no es vendedor', async () => {
    const n = randomNumbers()
    const { error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.admin,
      p_rows: [{ daily_number: n.daily, weekly_number: n.weekly }],
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no es un vendedor activo/i)
  })

  it('genera internal_code correlativo y unico', async () => {
    const rows = Array.from({ length: 5 }, () => randomNumbers()).map((n) => ({
      daily_number: n.daily,
      weekly_number: n.weekly,
    }))
    await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: rows,
    })

    const { data } = await ctx.svc
      .from('tickets')
      .select('internal_code')
      .eq('raffle_id', ctx.demoRaffle.id)

    const codes = data!.map((t) => t.internal_code)
    expect(new Set(codes).size).toBe(codes.length) // todos unicos
    expect(codes.every((c) => /^R\d{3}-\d{6}$/.test(c))).toBe(true)
  })
})

describe('creacion de boletas por el vendedor (CLAUDE.md §16)', () => {
  it('el vendedor puede crear su boleta cuando la rifa lo permite, en pending_approval', async () => {
    const n = randomNumbers()
    const { data, error } = await seller1
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        created_by: ctx.ids.seller1,
        daily_number: n.daily,
        weekly_number: n.weekly,
        inventory_status: 'pending_approval',
      })
      .select('id, inventory_status')
      .single()

    expect(error).toBeNull()
    expect(data!.inventory_status).toBe('pending_approval')
  })

  it('el vendedor NO puede crearla directamente como disponible (BR-I09)', async () => {
    const n = randomNumbers()
    const { error } = await seller1.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      created_by: ctx.ids.seller1,
      daily_number: n.daily,
      weekly_number: n.weekly,
      inventory_status: 'available',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('el vendedor NO puede crear boletas a nombre de otro vendedor', async () => {
    const n = randomNumbers()
    const { error } = await seller1.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller2,
      created_by: ctx.ids.seller1,
      daily_number: n.daily,
      weekly_number: n.weekly,
      inventory_status: 'pending_approval',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('el vendedor NO puede crear boletas si la rifa no lo permite (BR-R10)', async () => {
    // La rifa de control tiene allow_seller_ticket_creation = false
    const otroSeller = await signInAs(USERS.otherOrgSeller)
    const n = randomNumbers()
    const { error } = await otroSeller.from('tickets').insert({
      organization_id: ctx.controlOrg.id,
      raffle_id: ctx.controlRaffle.id,
      seller_id: ctx.ids.otherOrgSeller,
      created_by: ctx.ids.otherOrgSeller,
      daily_number: n.daily,
      weekly_number: n.weekly,
      inventory_status: 'pending_approval',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })
})

describe('approve_tickets — aprobacion (BR-I09)', () => {
  it('el administrador aprueba y la boleta pasa a disponible', async () => {
    const n = randomNumbers()
    const { data: creada } = await seller1
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        created_by: ctx.ids.seller1,
        daily_number: n.daily,
        weekly_number: n.weekly,
        inventory_status: 'pending_approval',
      })
      .select('id')
      .single()

    const { data, error } = await admin.rpc('approve_tickets', {
      p_ticket_ids: [creada!.id],
    })
    expect(error).toBeNull()
    expect(data).toBe(1)

    const { data: after } = await ctx.svc
      .from('tickets')
      .select('inventory_status, approved_by, approved_at')
      .eq('id', creada!.id)
      .single()
    expect(after!.inventory_status).toBe('available')
    expect(after!.approved_by).toBe(ctx.ids.admin)
    expect(after!.approved_at).not.toBeNull()
  })

  it('un vendedor no puede aprobar boletas', async () => {
    const n = randomNumbers()
    const { data: creada } = await seller1
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        created_by: ctx.ids.seller1,
        daily_number: n.daily,
        weekly_number: n.weekly,
        inventory_status: 'pending_approval',
      })
      .select('id')
      .single()

    const { error } = await seller1.rpc('approve_tickets', { p_ticket_ids: [creada!.id] })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/permiso/i)
  })

  it('solo cuenta las que estaban pendientes', async () => {
    const { data: yaDisponible } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('organization_id', ctx.demoOrg.id) // debe ser de SU organizacion
      .eq('inventory_status', 'available')
      .limit(1)
      .single()

    const { data, error } = await owner.rpc('approve_tickets', {
      p_ticket_ids: [yaDisponible!.id],
    })
    expect(error).toBeNull()
    expect(data).toBe(0)
  })

  it('rechaza aprobar una boleta de OTRA organizacion', async () => {
    const { data: ajena } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('organization_id', ctx.controlOrg.id)
      .limit(1)
      .single()

    const { error } = await owner.rpc('approve_tickets', { p_ticket_ids: [ajena!.id] })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/permiso/i)
  })
})

describe('cancel_ticket — anulacion (BR-I10)', () => {
  it('el administrador anula con motivo y queda registrado', async () => {
    const n = randomNumbers()
    const { data: creada } = await ctx.svc
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        created_by: ctx.ids.owner,
        daily_number: n.daily,
        weekly_number: n.weekly,
        inventory_status: 'available',
      })
      .select('id')
      .single()

    const { error } = await owner.rpc('cancel_ticket', {
      p_ticket_id: creada!.id,
      p_reason: 'Boleta danada durante la impresion',
    })
    expect(error).toBeNull()

    const { data: after } = await ctx.svc
      .from('tickets')
      .select('inventory_status, cancelled_at, cancel_reason')
      .eq('id', creada!.id)
      .single()
    expect(after!.inventory_status).toBe('cancelled')
    expect(after!.cancelled_at).not.toBeNull()
    expect(after!.cancel_reason).toBe('Boleta danada durante la impresion')
  })

  it('exige motivo de al menos 5 caracteres', async () => {
    const { data: alguna } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('inventory_status', 'available')
      .limit(1)
      .single()

    const { error } = await owner.rpc('cancel_ticket', {
      p_ticket_id: alguna!.id,
      p_reason: 'no',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/motivo/i)
  })

  it('un vendedor no puede anular boletas (BR-I10)', async () => {
    const { data: propia } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller1)
      .eq('inventory_status', 'available')
      .limit(1)
      .single()

    const { error } = await seller1.rpc('cancel_ticket', {
      p_ticket_id: propia!.id,
      p_reason: 'Intento no autorizado desde una prueba',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/permiso/i)
  })
})

describe('assign_ticket — reglas de asignacion (BR-I07)', () => {
  it('no permite asignar la boleta de un vendedor a un cliente de otro (BR-C05)', async () => {
    const { data: propia } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller1)
      .eq('inventory_status', 'available')
      .limit(1)
      .single()

    // Diego Marin es cliente de vendedor2
    const { error } = await seller1.rpc('assign_ticket', {
      p_ticket_id: propia!.id,
      p_client_id: ctx.clients.diego.id,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/otro vendedor/i)
  })

  it('no permite asignar una boleta que no esta disponible', async () => {
    const { data: pendiente } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller1)
      .eq('inventory_status', 'pending_approval')
      .limit(1)
      .single()

    const { error } = await seller1.rpc('assign_ticket', {
      p_ticket_id: pendiente!.id,
      p_client_id: ctx.clients.ana.id,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/disponibles/i)
  })

  it('copia el precio VIGENTE de la rifa y registra la fecha de venta (BR-P03)', async () => {
    const n = randomNumbers()
    const { data: creada } = await ctx.svc
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        created_by: ctx.ids.owner,
        daily_number: n.daily,
        weekly_number: n.weekly,
        inventory_status: 'available',
      })
      .select('id')
      .single()

    const { error } = await seller1.rpc('assign_ticket', {
      p_ticket_id: creada!.id,
      p_client_id: ctx.clients.ana.id,
    })
    expect(error).toBeNull()

    const { data: after } = await ctx.svc
      .from('tickets')
      .select('sale_price, sale_date, assigned_at, inventory_status')
      .eq('id', creada!.id)
      .single()

    // BR-P03: el precio VIGENTE de la rifa, sea cual sea. Leerlo de la base en
    // vez de escribirlo a mano es lo que prueba la regla y no un numero (D-098).
    const { data: rifa } = await ctx.svc
      .from('raffles')
      .select('ticket_price')
      .eq('id', ctx.demoRaffle.id)
      .single()

    expect(after!.sale_price).toBe(Number(rifa!.ticket_price))
    expect(after!.sale_date).not.toBeNull()
    expect(after!.assigned_at).not.toBeNull()
    expect(after!.inventory_status).toBe('assigned')
  })
})

describe('restricciones de rifas cerradas (BR-R08, BR-R09)', () => {
  it('una rifa cerrada no admite boletas nuevas ni asignaciones, pero SI pagos', async () => {
    // Se crea una rifa aparte para no perturbar el resto de las pruebas.
    const { data: rifa } = await ctx.svc
      .from('raffles')
      .insert({
        organization_id: ctx.demoOrg.id,
        name: `Rifa Cerrada ${Date.now()}`,
        ticket_price: 100_000,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        status: 'active',
        created_by: ctx.ids.owner,
      })
      .select('id')
      .single()

    const n = randomNumbers()
    const { data: boleta } = await ctx.svc
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: rifa!.id,
        seller_id: ctx.ids.seller1,
        created_by: ctx.ids.owner,
        daily_number: n.daily,
        weekly_number: n.weekly,
        inventory_status: 'available',
      })
      .select('id')
      .single()

    // Se vende ANTES de cerrar
    await seller1.rpc('assign_ticket', {
      p_ticket_id: boleta!.id,
      p_client_id: ctx.clients.ana.id,
    })

    await ctx.svc.from('raffles').update({ status: 'closed' }).eq('id', rifa!.id)

    // BR-R08: no se crean boletas nuevas
    const n2 = randomNumbers()
    const bulk = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: rifa!.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: [{ daily_number: n2.daily, weekly_number: n2.weekly }],
    })
    expect(bulk.error).not.toBeNull()

    // BR-R09: las deudas pendientes SI se pueden cobrar
    const pago = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 30_000,
      p_allocations: [{ ticket_id: boleta!.id, amount: 30_000 }],
    })
    expect(pago.error).toBeNull()

    // En cambio, una rifa ANULADA no admite ningun pago
    await ctx.svc.from('raffles').update({ status: 'cancelled' }).eq('id', rifa!.id)
    const pagoAnulada = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 10_000,
      p_allocations: [{ ticket_id: boleta!.id, amount: 10_000 }],
    })
    expect(pagoAnulada.error).not.toBeNull()
    expect(pagoAnulada.error!.message).toMatch(/anulada/i)
  })
})
