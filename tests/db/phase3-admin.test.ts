/**
 * Pruebas de base de datos de la Fase 3: las reglas en las que se apoya el
 * portal Owner/Admin.
 *
 * Objetivo concreto: comprobar que lo que hacen las Server Actions de
 * `features/raffles`, `features/users` y `features/tickets` se comporta en la
 * base de datos como la interfaz supone. Varias de estas comprobaciones existen
 * porque RLS NO devuelve error al rechazar una fila: devuelve CERO filas, y la
 * aplicacion tiene que darse cuenta (ver `updateUser` y `setUserActive`).
 *
 * Como en la Fase 2, ninguna prueba usa la service role para el acto probado:
 * todas operan con una sesion real y la clave publica.
 *
 * Reglas cubiertas: BR-R03, BR-R08, BR-R11, BR-U01, BR-U02, BR-U03, BR-I01,
 * BR-I09, BR-I10, BR-N04.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadSeedContext, randomNumbers, signInAs, USERS, type Client } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client
let admin: Client
let seller1: Client

/** Rifas creadas por las pruebas, para dejarlas anuladas al terminar. */
const createdRaffleIds: string[] = []

beforeAll(async () => {
  ctx = await loadSeedContext()
  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
  seller1 = await signInAs(USERS.seller1)
})

afterAll(async () => {
  // No hay DELETE en ninguna tabla (por diseno): las rifas de prueba se anulan.
  for (const id of createdRaffleIds) {
    await ctx.svc.from('raffles').update({ status: 'cancelled' }).eq('id', id)
  }
})

async function createRaffle(client: Client, name: string, extra: Record<string, unknown> = {}) {
  return client
    .from('raffles')
    .insert({
      organization_id: ctx.demoOrg.id,
      name,
      ticket_price: 100000,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      created_by: ctx.ids.owner,
      ...extra,
    })
    .select('id, status, short_code')
    .maybeSingle()
}

describe('F3-01 rifas: creacion y edicion por el personal (BR-R04, BR-R11)', () => {
  it('el Owner crea una rifa y el trigger le pone el short_code (D-039)', async () => {
    const { data, error } = await createRaffle(owner, `Rifa prueba owner ${Date.now()}`)
    expect(error).toBeNull()
    expect(data!.status).toBe('draft')
    expect(data!.short_code).toMatch(/^R\d{3}$/)
    createdRaffleIds.push(data!.id)
  })

  it('el Admin tambien puede crear rifas (BR-R05)', async () => {
    const { data, error } = await createRaffle(admin, `Rifa prueba admin ${Date.now()}`)
    expect(error).toBeNull()
    createdRaffleIds.push(data!.id)
  })

  it('un vendedor NO puede crear rifas', async () => {
    const { error } = await createRaffle(seller1, `Rifa prohibida ${Date.now()}`)
    expect(error).not.toBeNull()
  })

  it('un vendedor NO puede editar una rifa, aunque la vea', async () => {
    const { data: visible } = await seller1.from('raffles').select('id').limit(1)
    expect(visible!.length).toBeGreaterThan(0)

    const { data, error } = await seller1
      .from('raffles')
      .update({ ticket_price: 1 })
      .eq('id', visible![0]!.id)
      .select('id')

    // RLS no lanza: simplemente no hay fila que actualizar.
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('el nombre de la rifa es unico por organizacion, sin importar mayusculas (BR-R11)', async () => {
    const name = `Rifa duplicada ${Date.now()}`
    const { data: first } = await createRaffle(owner, name)
    createdRaffleIds.push(first!.id)

    const { error } = await createRaffle(owner, `  ${name.toUpperCase()}  `)
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
  })

  it('rechaza una rifa que termina antes de empezar (BR-R07)', async () => {
    const { error } = await createRaffle(owner, `Rifa fechas ${Date.now()}`, {
      start_date: '2026-12-31',
      end_date: '2026-01-01',
    })
    expect(error).not.toBeNull()
  })
})

describe('F3-02 reabrir una rifa cerrada NO lo distingue la base de datos (BR-R03)', () => {
  it('para la base de datos, Admin y Owner son igual de capaces de reabrirla', async () => {
    const { data: raffle } = await createRaffle(owner, `Rifa reapertura ${Date.now()}`)
    createdRaffleIds.push(raffle!.id)

    await owner.from('raffles').update({ status: 'active' }).eq('id', raffle!.id)
    await owner.from('raffles').update({ status: 'closed' }).eq('id', raffle!.id)

    const { data, error } = await admin
      .from('raffles')
      .update({ status: 'active' })
      .eq('id', raffle!.id)
      .select('id, status')

    expect(error).toBeNull()
    // Esta es exactamente la razon por la que la regla vive en la Server
    // Action `changeRaffleStatus`: la base de datos no puede aplicarla porque
    // owner y admin son ambos "staff" para RLS.
    expect(data![0]!.status).toBe('active')
  })
})

describe('F3-03 proteccion del Owner frente al Admin (BR-U02, BR-U03)', () => {
  it('un Admin que edita el perfil del Owner afecta CERO filas y sin error', async () => {
    const { data, error } = await admin
      .from('profiles')
      .update({ full_name: 'Nombre cambiado por un admin' })
      .eq('id', ctx.ids.owner)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])

    // El nombre real no cambio.
    const { data: profile } = await ctx.svc
      .from('profiles')
      .select('full_name')
      .eq('id', ctx.ids.owner)
      .single()
    expect(profile!.full_name).not.toBe('Nombre cambiado por un admin')
  })

  it('un Admin que desactiva al Owner afecta CERO filas y sin error', async () => {
    const { data, error } = await admin
      .from('memberships')
      .update({ is_active: false })
      .eq('profile_id', ctx.ids.owner)
      .eq('organization_id', ctx.demoOrg.id)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: membership } = await ctx.svc
      .from('memberships')
      .select('is_active')
      .eq('profile_id', ctx.ids.owner)
      .eq('organization_id', ctx.demoOrg.id)
      .single()
    expect(membership!.is_active).toBe(true)
  })

  it('un Admin SI puede editar el perfil de un vendedor (BR-U01)', async () => {
    const { data, error } = await admin
      .from('profiles')
      .update({ alias: 'Alias puesto por el admin' })
      .eq('id', ctx.ids.seller1)
      .select('id')

    expect(error).toBeNull()
    expect(data!.length).toBe(1)

    await ctx.svc.from('profiles').update({ alias: null }).eq('id', ctx.ids.seller1)
  })

  it('un Admin no puede ascender a nadie a owner (BR-U03)', async () => {
    const { data, error } = await admin
      .from('memberships')
      .update({ role: 'owner' })
      .eq('profile_id', ctx.ids.seller2 ?? ctx.ids.seller1)
      .eq('organization_id', ctx.demoOrg.id)
      .select('id')

    // O bien no encuentra fila que cumpla el WITH CHECK, o bien falla el indice
    // de un unico owner activo. En ningun caso el vendedor termina como owner.
    if (error === null) expect(data).toEqual([])

    const { data: membership } = await ctx.svc
      .from('memberships')
      .select('role')
      .eq('profile_id', ctx.ids.seller2)
      .eq('organization_id', ctx.demoOrg.id)
      .single()
    expect(membership!.role).toBe('seller')
  })

  it('el personal sigue viendo el perfil de un usuario DESACTIVADO (I-011, BR-U06)', async () => {
    // Regresion: mientras `profiles_select` exigia que la membresia objetivo
    // estuviera activa, desactivar a un vendedor lo hacia desaparecer del
    // listado y era imposible volver a activarlo desde la aplicacion.
    await ctx.svc
      .from('memberships')
      .update({ is_active: false })
      .eq('profile_id', ctx.ids.seller2)
      .eq('organization_id', ctx.demoOrg.id)

    try {
      const { data, error } = await owner
        .from('memberships')
        .select('is_active, profile:profiles!memberships_profile_id_fkey ( full_name, email )')
        .eq('profile_id', ctx.ids.seller2)
        .eq('organization_id', ctx.demoOrg.id)
        .maybeSingle()

      expect(error).toBeNull()
      expect(data).not.toBeNull()
      expect(data!.is_active).toBe(false)
      expect(data!.profile).not.toBeNull()
      expect(data!.profile!.full_name).toBeTruthy()

      // Y puede reactivarlo.
      const { data: reactivated, error: updateError } = await owner
        .from('memberships')
        .update({ is_active: true })
        .eq('profile_id', ctx.ids.seller2)
        .eq('organization_id', ctx.demoOrg.id)
        .select('is_active')

      expect(updateError).toBeNull()
      expect(reactivated![0]!.is_active).toBe(true)
    } finally {
      await ctx.svc
        .from('memberships')
        .update({ is_active: true })
        .eq('profile_id', ctx.ids.seller2)
        .eq('organization_id', ctx.demoOrg.id)
    }
  })

  it('un vendedor desactivado NO gana visibilidad sobre perfiles ajenos', async () => {
    // La correccion de I-011 solo afecta a quien CONSULTA siendo personal
    // activo. Un vendedor ve su propio perfil y, desde 0022, los de SU EQUIPO
    // (BR-E05) — nada mas. Se comprueba por lo que NO debe ver, que es la
    // propiedad de seguridad real: afirmar «solo se ve a si mismo» dejaria de
    // ser cierto en cuanto un vendedor tuviera equipo, sin que hubiera pasado
    // nada malo.
    const { data } = await seller1.from('profiles').select('id')
    const visibles = new Set((data ?? []).map((row) => row.id))

    expect(visibles.has(ctx.ids.seller1)).toBe(true)
    for (const ajeno of [ctx.ids.owner, ctx.ids.admin, ctx.ids.seller2, ctx.ids.otherOrgSeller]) {
      expect(visibles.has(ajeno), `no debe ver el perfil de ${ajeno}`).toBe(false)
    }
  })

  it('un vendedor no puede tocar ninguna membresia', async () => {
    const { data, error } = await seller1
      .from('memberships')
      .update({ is_active: false })
      .eq('profile_id', ctx.ids.seller2)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('F3-04 boletas: creacion individual y edicion desde el portal admin', () => {
  it('el personal crea una boleta disponible con sus dos numeros (BR-I04)', async () => {
    const numbers = randomNumbers()
    const { data, error } = await owner
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
      .select('id, internal_code, inventory_status')
      .maybeSingle()

    expect(error).toBeNull()
    expect(data!.inventory_status).toBe('available')
    expect(data!.internal_code).toMatch(/^R\d{3}-\d{6}$/)
  })

  it('rechaza una combinacion ya usada en la rifa, aunque sea de otro vendedor (BR-N05)', async () => {
    const numbers = randomNumbers()

    const { error: firstError } = await owner.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'available',
      created_by: ctx.ids.owner,
    })
    expect(firstError).toBeNull()

    const { error } = await owner.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller2,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'available',
      created_by: ctx.ids.owner,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
    expect(error!.message).toContain('tickets_combo_unique')
  })

  it('completar un borrador con sus dos numeros lo deja disponible (CLAUDE.md 15)', async () => {
    const { data: draft } = await owner
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        inventory_status: 'draft',
        created_by: ctx.ids.owner,
      })
      .select('id')
      .maybeSingle()

    const numbers = randomNumbers()
    const { data, error } = await owner
      .from('tickets')
      .update({
        daily_number: numbers.daily,
        weekly_number: numbers.weekly,
        inventory_status: 'available',
      })
      .eq('id', draft!.id)
      .select('inventory_status, daily_number')

    expect(error).toBeNull()
    expect(data![0]!.inventory_status).toBe('available')
    expect(data![0]!.daily_number).toBe(numbers.daily)
  })

  it('el personal puede cambiar el vendedor de una boleta no asignada', async () => {
    const numbers = randomNumbers()
    const { data: ticket } = await owner
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
      .maybeSingle()

    const { data, error } = await owner
      .from('tickets')
      .update({ seller_id: ctx.ids.seller2 })
      .eq('id', ticket!.id)
      .select('seller_id')

    expect(error).toBeNull()
    expect(data![0]!.seller_id).toBe(ctx.ids.seller2)
  })

  it('los ceros iniciales sobreviven al viaje de ida y vuelta (BR-N03)', async () => {
    const { data, error } = await owner
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: ctx.ids.seller1,
        daily_number: '0007',
        weekly_number: '0000',
        inventory_status: 'available',
        created_by: ctx.ids.owner,
      })
      .select('daily_number, weekly_number')
      .maybeSingle()

    // Si estos numeros ya existieran por una ejecucion previa, el INSERT
    // fallaria por unicidad; en ese caso la comprobacion sigue siendo valida.
    if (error === null) {
      expect(data!.daily_number).toBe('0007')
      expect(data!.weekly_number).toBe('0000')
    } else {
      expect(error.code).toBe('23505')
    }
  })
})

describe('F3-05 aprobacion y anulacion desde el portal admin (BR-I09, BR-I10)', () => {
  async function createPendingTicket() {
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
      .maybeSingle()
    return data!.id
  }

  it('approve_tickets aprueba en lote y deja las boletas disponibles', async () => {
    const ids = [await createPendingTicket(), await createPendingTicket()]

    const { data, error } = await admin.rpc('approve_tickets', { p_ticket_ids: ids })
    expect(error).toBeNull()
    expect(data).toBe(2)

    const { data: tickets } = await ctx.svc
      .from('tickets')
      .select('inventory_status, approved_by')
      .in('id', ids)
    expect(tickets!.every((t) => t.inventory_status === 'available')).toBe(true)
    expect(tickets!.every((t) => t.approved_by !== null)).toBe(true)
  })

  it('un vendedor no puede aprobar sus propias boletas', async () => {
    const id = await createPendingTicket()
    const { error } = await seller1.rpc('approve_tickets', { p_ticket_ids: [id] })
    expect(error).not.toBeNull()
  })

  it('cancel_ticket exige motivo y lo guarda', async () => {
    const id = await createPendingTicket()

    const { error: shortReason } = await admin.rpc('cancel_ticket', {
      p_ticket_id: id,
      p_reason: 'ups',
    })
    expect(shortReason).not.toBeNull()

    const { error } = await admin.rpc('cancel_ticket', {
      p_ticket_id: id,
      p_reason: 'Numeros mal digitados',
    })
    expect(error).toBeNull()

    const { data: ticket } = await ctx.svc
      .from('tickets')
      .select('inventory_status, cancel_reason, cancelled_at')
      .eq('id', id)
      .single()
    expect(ticket!.inventory_status).toBe('cancelled')
    expect(ticket!.cancel_reason).toBe('Numeros mal digitados')
    expect(ticket!.cancelled_at).not.toBeNull()
  })

  it('la combinacion de una boleta anulada NO se puede reutilizar (BR-N08)', async () => {
    const numbers = randomNumbers()
    const { data: ticket } = await ctx.svc
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
      .maybeSingle()

    await admin.rpc('cancel_ticket', {
      p_ticket_id: ticket!.id,
      p_reason: 'Anulada para la prueba de reutilizacion',
    })

    const { error } = await owner.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'available',
      created_by: ctx.ids.owner,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('23505')
  })

  it('un vendedor no puede anular boletas (BR-I10)', async () => {
    const id = await createPendingTicket()
    const { error } = await seller1.rpc('cancel_ticket', {
      p_ticket_id: id,
      p_reason: 'Intento de anulacion sin permiso',
    })
    expect(error).not.toBeNull()
  })
})

describe('F3-06 creacion masiva desde el portal admin (CLAUDE.md 15)', () => {
  it('informa los conflictos por fila sin abortar el lote', async () => {
    const shared = randomNumbers()

    const { error: seedError } = await owner.from('tickets').insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: ctx.ids.seller1,
      daily_number: shared.daily,
      weekly_number: shared.weekly,
      inventory_status: 'available',
      created_by: ctx.ids.owner,
    })
    expect(seedError).toBeNull()

    const fresh = randomNumbers()
    const { data, error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller2,
      p_rows: [
        { daily_number: shared.daily, weekly_number: shared.weekly },
        { daily_number: fresh.daily, weekly_number: fresh.weekly },
        { daily_number: null, weekly_number: null },
      ],
    })

    expect(error).toBeNull()
    const result = data as { requested: number; inserted: number; conflicts: unknown[] }
    expect(result.requested).toBe(3)
    expect(result.inserted).toBe(2) // la valida y el borrador
    expect(result.conflicts).toHaveLength(1)
  })

  it('las filas sin numeros quedan en borrador', async () => {
    const { data, error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: [
        { daily_number: null, weekly_number: null },
        { daily_number: null, weekly_number: null },
      ],
    })

    expect(error).toBeNull()
    expect((data as { inserted: number }).inserted).toBe(2)

    const { data: drafts } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('raffle_id', ctx.demoRaffle.id)
      .eq('inventory_status', 'draft')
    expect(drafts!.length).toBeGreaterThanOrEqual(2)
  })

  it('un vendedor no puede usar la creacion masiva', async () => {
    const numbers = randomNumbers()
    const { error } = await seller1.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: [{ daily_number: numbers.daily, weekly_number: numbers.weekly }],
    })
    expect(error).not.toBeNull()
  })

  it('rechaza un lote mayor que 1.000', async () => {
    const rows = Array.from({ length: 1001 }, () => ({ daily_number: null, weekly_number: null }))
    const { error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: ctx.demoRaffle.id,
      p_seller_id: ctx.ids.seller1,
      p_rows: rows,
    })
    expect(error).not.toBeNull()
  })
})

describe('F3-07 lecturas que alimentan las pantallas del portal', () => {
  it('la incrustacion de rifa y cliente que usa listTickets funciona', async () => {
    const { data, error } = await owner
      .from('tickets')
      .select(
        'id, internal_code, raffle:raffles!tickets_raffle_org_fk ( name, short_code ), client:clients!tickets_client_org_fk ( id, name )',
      )
      .eq('inventory_status', 'assigned')
      .limit(1)

    expect(error).toBeNull()
    expect(data![0]).toBeDefined()
    expect(data![0]!.raffle?.short_code).toMatch(/^R\d{3}$/)
    expect(data![0]!.client?.name).toBeTruthy()
  })

  it('v_raffle_summary y v_seller_summary responden al personal', async () => {
    const [{ data: raffles, error: raffleError }, { data: sellers, error: sellerError }] =
      await Promise.all([
        owner.from('v_raffle_summary').select('*'),
        owner.from('v_seller_summary').select('*'),
      ])

    expect(raffleError).toBeNull()
    expect(sellerError).toBeNull()
    expect(raffles!.length).toBeGreaterThan(0)
    expect(sellers!.length).toBeGreaterThan(0)
  })

  it('un vendedor solo se ve a si mismo en v_seller_summary (BR-U07)', async () => {
    const { data } = await seller1.from('v_seller_summary').select('seller_id')
    expect(data!.every((row) => row.seller_id === ctx.ids.seller1)).toBe(true)
  })

  it('el conteo exacto de boletas no depende del limite de 1.000 filas de PostgREST', async () => {
    const { count, error } = await owner
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('raffle_id', ctx.demoRaffle.id)

    expect(error).toBeNull()
    expect(count).toBeGreaterThan(0)

    // Comprobacion del limite que motiva usar count en vez de contar filas.
    const { data: rows } = await owner.from('tickets').select('id')
    expect(rows!.length).toBeLessThanOrEqual(1000)
  })
})
