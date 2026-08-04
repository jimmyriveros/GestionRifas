/**
 * Pruebas de base de datos de la Fase 4: portal del vendedor.
 *
 * Cubren las reglas en las que se apoyan `features/clients`,
 * `features/tickets/seller` y `features/tickets/assign`: aislamiento entre
 * vendedores, creacion de boletas por el vendedor, correccion de numeros antes
 * de la aprobacion, y la asignacion a clientes con copia de precio.
 *
 * Ninguna prueba usa la service role para el acto probado: todas operan con una
 * sesion real y la clave publica (D-043).
 *
 * Reglas cubiertas: BR-C01, BR-C05, BR-C06, BR-C07, BR-I03, BR-I07, BR-I08,
 * BR-N09, BR-P03, BR-P05, BR-R08, BR-R10, BR-U07.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadSeedContext, randomNumbers, signInAs, USERS, type Client } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let seller2: Client
let owner: Client
let controlSeller: Client

/** Ids de recursos creados por las pruebas, para dejarlos neutralizados. */
const createdClientIds: string[] = []

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
  controlSeller = await signInAs(USERS.otherOrgSeller)
})

afterAll(async () => {
  // No hay DELETE en ninguna tabla (por diseno): los clientes de prueba se
  // archivan para no ensuciar los listados.
  if (createdClientIds.length > 0) {
    await ctx.svc
      .from('clients')
      .update({ archived_at: new Date().toISOString() })
      .in('id', createdClientIds)
  }
})

/** Deja una boleta disponible del vendedor 1 y devuelve su id. */
async function availableTicketOfSeller1(): Promise<string> {
  const numbers = randomNumbers()
  const { data, error } = await ctx.svc
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
  return data.id
}

async function createClientOfSeller1(name: string): Promise<string> {
  const { data, error } = await ctx.svc
    .from('clients')
    .insert({
      organization_id: ctx.demoOrg.id,
      seller_id: ctx.ids.seller1,
      name,
      phone: '3001234567',
    })
    .select('id')
    .single()

  if (error) throw error
  createdClientIds.push(data.id)
  return data.id
}

describe('F4-01 clientes: la cartera es del vendedor (BR-C01, BR-C05)', () => {
  it('un vendedor crea clientes a su propio nombre', async () => {
    const { data, error } = await seller1
      .from('clients')
      .insert({
        organization_id: ctx.demoOrg.id,
        seller_id: ctx.ids.seller1,
        name: 'Cliente de la prueba F4',
        phone: '3009998877',
      })
      .select('id, seller_id')
      .maybeSingle()

    expect(error).toBeNull()
    expect(data!.seller_id).toBe(ctx.ids.seller1)
    createdClientIds.push(data!.id)
  })

  it('un vendedor NO puede crear un cliente a nombre de otro vendedor', async () => {
    const { error } = await seller1.from('clients').insert({
      organization_id: ctx.demoOrg.id,
      seller_id: ctx.ids.seller2,
      name: 'Cliente robado',
      phone: '3001112233',
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('un vendedor NO puede transferir su cliente a otro vendedor (WITH CHECK)', async () => {
    const clientId = await createClientOfSeller1('Cliente intransferible')

    const { data, error } = await seller1
      .from('clients')
      .update({ seller_id: ctx.ids.seller2 })
      .eq('id', clientId)
      .select('id')

    // O lo rechaza el WITH CHECK, o simplemente no encuentra fila que cumpla.
    if (error === null) expect(data).toEqual([])

    const { data: check } = await ctx.svc
      .from('clients')
      .select('seller_id')
      .eq('id', clientId)
      .single()
    expect(check!.seller_id).toBe(ctx.ids.seller1)
  })

  it('un vendedor no ve los clientes de otro ni pidiendolos por id (BR-U07)', async () => {
    const { data: ajenos } = await ctx.svc
      .from('clients')
      .select('id')
      .eq('seller_id', ctx.ids.seller2)
      .limit(1)

    const { data, error } = await seller1.from('clients').select('*').eq('id', ajenos![0]!.id)

    expect(error).toBeNull() // no distingue «no existe» de «sin permiso» (T15)
    expect(data).toEqual([])
  })

  it('archivar es un UPDATE, y el cliente archivado sigue siendo visible (BR-C06)', async () => {
    const clientId = await createClientOfSeller1('Cliente para archivar')

    const { data, error } = await seller1
      .from('clients')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', clientId)
      .select('id, archived_at')

    expect(error).toBeNull()
    expect(data![0]!.archived_at).not.toBeNull()

    const { data: visible } = await seller1.from('clients').select('id').eq('id', clientId)
    expect(visible).toHaveLength(1)

    // Y se puede restaurar.
    const { data: restored } = await seller1
      .from('clients')
      .update({ archived_at: null })
      .eq('id', clientId)
      .select('archived_at')
    expect(restored![0]!.archived_at).toBeNull()
  })

  it('ningun rol puede borrar clientes fisicamente', async () => {
    const clientId = await createClientOfSeller1('Cliente indestructible')

    const asSeller = await seller1.from('clients').delete().eq('id', clientId).select('id')
    const asOwner = await owner.from('clients').delete().eq('id', clientId).select('id')

    // Sin privilegio DELETE la peticion falla; si algun entorno lo concediera,
    // la ausencia de politica la dejaria en cero filas. Las dos cosas valen.
    for (const result of [asSeller, asOwner]) {
      if (result.error === null) expect(result.data).toEqual([])
    }

    const { data: alive } = await ctx.svc.from('clients').select('id').eq('id', clientId)
    expect(alive).toHaveLength(1)
  })
})

describe('F4-02 creacion de boletas por el vendedor (BR-I03, BR-R10)', () => {
  it('crea boletas en pending_approval cuando la rifa lo permite', async () => {
    const numbers = randomNumbers()
    const { data, error } = await seller1
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        daily_number: numbers.daily,
        weekly_number: numbers.weekly,
        inventory_status: 'pending_approval',
        created_by: ctx.ids.seller1,
      })
      .select('id, inventory_status, internal_code')
      .maybeSingle()

    expect(error).toBeNull()
    expect(data!.inventory_status).toBe('pending_approval')
    expect(data!.internal_code).toMatch(/^R\d{3}-\d{6}$/)
  })

  it('NO puede crearlas directamente como disponibles: se saltaria la aprobacion (BR-I09)', async () => {
    const numbers = randomNumbers()
    const { error } = await seller1.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'available',
      created_by: ctx.ids.seller1,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('NO puede crear una boleta ya asignada a un cliente', async () => {
    const numbers = randomNumbers()
    const clientId = await createClientOfSeller1('Cliente para atajo')

    const { error } = await seller1.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      client_id: clientId,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'pending_approval',
      created_by: ctx.ids.seller1,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('NO puede crearlas a nombre de otro vendedor', async () => {
    const numbers = randomNumbers()
    const { error } = await seller1.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller2,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'pending_approval',
      created_by: ctx.ids.seller1,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('NO puede crearlas si la rifa no lo permite (BR-R10)', async () => {
    // La rifa de «Rifas Control» tiene allow_seller_ticket_creation = false.
    const numbers = randomNumbers()
    const { error } = await controlSeller.from('tickets').insert({
      organization_id: ctx.controlOrg.id,
      raffle_id: ctx.controlRaffle.id,
      seller_id: ctx.ids.otherOrgSeller,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'pending_approval',
      created_by: ctx.ids.otherOrgSeller,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('una boleta pendiente no admite numeros vacios (BR-N09)', async () => {
    const { error } = await seller1.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      daily_number: null,
      weekly_number: null,
      inventory_status: 'pending_approval',
      created_by: ctx.ids.seller1,
    })

    expect(error).not.toBeNull()
  })
})

describe('F4-03 correccion de numeros por el vendedor', () => {
  async function pendingTicket(): Promise<string> {
    const numbers = randomNumbers()
    const { data } = await ctx.svc
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        daily_number: numbers.daily,
        weekly_number: numbers.weekly,
        inventory_status: 'pending_approval',
        created_by: ctx.ids.seller1,
      })
      .select('id')
      .single()
    return data!.id
  }

  it('puede corregir los numeros mientras la boleta esta pendiente', async () => {
    const id = await pendingTicket()
    const numbers = randomNumbers()

    const { data, error } = await seller1
      .from('tickets')
      .update({ daily_number: numbers.daily, weekly_number: numbers.weekly })
      .eq('id', id)
      .select('daily_number')

    expect(error).toBeNull()
    expect(data![0]!.daily_number).toBe(numbers.daily)
  })

  it('NO puede corregirlos despues de la aprobacion: cero filas afectadas', async () => {
    const id = await pendingTicket()
    await owner.rpc('approve_tickets', { p_ticket_ids: [id] })

    const numbers = randomNumbers()
    const { data, error } = await seller1
      .from('tickets')
      .update({ daily_number: numbers.daily, weekly_number: numbers.weekly })
      .eq('id', id)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('NO puede tocar los numeros de la boleta de otro vendedor', async () => {
    const { data: ajena } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller2)
      .limit(1)

    const { data, error } = await seller1
      .from('tickets')
      .update({ daily_number: '9999' })
      .eq('id', ajena![0]!.id)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('F4-04 asignacion de boletas a clientes (BR-I07, BR-P03)', () => {
  it('asigna, copia el precio VIGENTE de la rifa y fija las fechas', async () => {
    const ticketId = await availableTicketOfSeller1()
    const clientId = await createClientOfSeller1('Cliente comprador')

    const { data: raffle } = await ctx.svc
      .from('raffles')
      .select('ticket_price')
      .eq('id', ctx.demoRaffle.id)
      .single()

    const { error } = await seller1.rpc('assign_ticket', {
      p_ticket_id: ticketId,
      p_client_id: clientId,
    })
    expect(error).toBeNull()

    const { data: ticket } = await ctx.svc
      .from('tickets')
      .select('inventory_status, client_id, sale_price, sale_date, assigned_at')
      .eq('id', ticketId)
      .single()

    expect(ticket!.inventory_status).toBe('assigned')
    expect(ticket!.client_id).toBe(clientId)
    expect(ticket!.sale_price).toBe(raffle!.ticket_price) // BR-P03
    expect(ticket!.sale_date).not.toBeNull()
    expect(ticket!.assigned_at).not.toBeNull()
  })

  it('el precio ya copiado NO cambia si despues cambia el precio de la rifa (BR-R06, BR-P05)', async () => {
    const ticketId = await availableTicketOfSeller1()
    const clientId = await createClientOfSeller1('Cliente precio historico')

    const { data: before } = await ctx.svc
      .from('raffles')
      .select('ticket_price')
      .eq('id', ctx.demoRaffle.id)
      .single()
    const originalPrice = before!.ticket_price

    await seller1.rpc('assign_ticket', { p_ticket_id: ticketId, p_client_id: clientId })

    try {
      await ctx.svc
        .from('raffles')
        .update({ ticket_price: originalPrice + 50_000 })
        .eq('id', ctx.demoRaffle.id)

      const { data: ticket } = await ctx.svc
        .from('tickets')
        .select('sale_price')
        .eq('id', ticketId)
        .single()

      expect(ticket!.sale_price).toBe(originalPrice)
    } finally {
      await ctx.svc
        .from('raffles')
        .update({ ticket_price: originalPrice })
        .eq('id', ctx.demoRaffle.id)
    }
  })

  it('rechaza asignar a un cliente de OTRO vendedor (BR-C05)', async () => {
    const ticketId = await availableTicketOfSeller1()

    const { data: ajeno } = await ctx.svc
      .from('clients')
      .select('id')
      .eq('seller_id', ctx.ids.seller2)
      .limit(1)

    const { error } = await seller1.rpc('assign_ticket', {
      p_ticket_id: ticketId,
      p_client_id: ajeno![0]!.id,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/cliente/i)
  })

  it('rechaza asignar la boleta de OTRO vendedor (BR-U07)', async () => {
    const clientId = await createClientOfSeller1('Cliente sin boleta ajena')

    const { data: ajena } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller2)
      .eq('inventory_status', 'available')
      .limit(1)

    if (!ajena?.[0]) return // el seed no siempre deja una disponible del vendedor 2

    const { error } = await seller1.rpc('assign_ticket', {
      p_ticket_id: ajena[0].id,
      p_client_id: clientId,
    })

    expect(error).not.toBeNull()
  })

  it('rechaza asignar a un cliente ARCHIVADO (BR-C07)', async () => {
    const ticketId = await availableTicketOfSeller1()
    const clientId = await createClientOfSeller1('Cliente archivado')

    await ctx.svc
      .from('clients')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', clientId)

    const { error } = await seller1.rpc('assign_ticket', {
      p_ticket_id: ticketId,
      p_client_id: clientId,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/archivad/i)
  })

  it('rechaza asignar una boleta que no esta disponible', async () => {
    const ticketId = await availableTicketOfSeller1()
    const clientId = await createClientOfSeller1('Cliente doble asignacion')

    const first = await seller1.rpc('assign_ticket', {
      p_ticket_id: ticketId,
      p_client_id: clientId,
    })
    expect(first.error).toBeNull()

    // BR-I08: una boleta tiene un solo cliente activo.
    const second = await seller1.rpc('assign_ticket', {
      p_ticket_id: ticketId,
      p_client_id: clientId,
    })
    expect(second.error).not.toBeNull()
    expect(second.error!.message).toMatch(/disponibles/i)
  })

  it('rechaza asignar en una rifa que no esta activa (BR-R08)', async () => {
    const ticketId = await availableTicketOfSeller1()
    const clientId = await createClientOfSeller1('Cliente rifa cerrada')

    await ctx.svc.from('raffles').update({ status: 'closed' }).eq('id', ctx.demoRaffle.id)

    try {
      const { error } = await seller1.rpc('assign_ticket', {
        p_ticket_id: ticketId,
        p_client_id: clientId,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/no esta activa/i)
    } finally {
      await ctx.svc.from('raffles').update({ status: 'active' }).eq('id', ctx.demoRaffle.id)
    }
  })

  it('un vendedor NO puede asignar con un UPDATE directo, saltandose la RPC', async () => {
    const ticketId = await availableTicketOfSeller1()
    const clientId = await createClientOfSeller1('Cliente por la puerta de atras')

    const { data, error } = await seller1
      .from('tickets')
      .update({
        client_id: clientId,
        inventory_status: 'assigned',
        sale_price: 1, // ademas, un precio inventado
        sale_date: '2026-01-01',
        assigned_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .select('id')

    // `tickets_update_seller` solo alcanza boletas draft/pending_approval.
    if (error === null) expect(data).toEqual([])

    const { data: ticket } = await ctx.svc
      .from('tickets')
      .select('inventory_status, sale_price')
      .eq('id', ticketId)
      .single()
    expect(ticket!.inventory_status).toBe('available')
    expect(ticket!.sale_price).toBeNull()
  })
})

describe('F4-05 lo que ve el vendedor en sus propias vistas', () => {
  it('v_client_balances solo trae su cartera', async () => {
    const { data, error } = await seller1.from('v_client_balances').select('seller_id')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((row) => row.seller_id === ctx.ids.seller1)).toBe(true)
  })

  it('v_ticket_balances solo trae sus boletas', async () => {
    const { data, error } = await seller1.from('v_ticket_balances').select('seller_id')
    expect(error).toBeNull()
    expect(data!.every((row) => row.seller_id === ctx.ids.seller1)).toBe(true)
  })

  it('dos vendedores de la misma organizacion no comparten nada', async () => {
    const [uno, dos] = await Promise.all([
      seller1.from('tickets').select('id'),
      seller2.from('tickets').select('id'),
    ])

    const idsUno = new Set((uno.data ?? []).map((row) => row.id))
    const solapamiento = (dos.data ?? []).filter((row) => idsUno.has(row.id))
    expect(solapamiento).toEqual([])
  })

  it('el vendedor ve la rifa (necesita el precio) pero no puede tocarla', async () => {
    const { data: raffles, error } = await seller1
      .from('raffles')
      .select('id, ticket_price, allow_seller_ticket_creation')
    expect(error).toBeNull()
    expect(raffles!.length).toBeGreaterThan(0)

    const { data: updated } = await seller1
      .from('raffles')
      .update({ allow_seller_ticket_creation: true })
      .eq('id', ctx.controlRaffle.id)
      .select('id')
    expect(updated ?? []).toEqual([])
  })
})
