/**
 * Equipos de vendedores — Fase 1: modelo y jerarquia (migracion 0022).
 *
 * Lo que se prueba aqui es exactamente lo que no se puede comprobar mirando la
 * interfaz: que un vendedor no pueda meter gente en el equipo de otro, ni
 * ascenderse, ni ver las ventas de un equipo ajeno, por mucho que llame a
 * PostgREST a mano con su propia sesion.
 *
 * Ninguna prueba usa la service role para el ACTO probado (D-043): se usa solo
 * para preparar y limpiar el escenario —crear las cuentas de Auth, que solo
 * `auth.admin` puede crear, y borrar despues lo que se creo—.
 *
 * Reglas cubiertas: BR-E01, BR-E02, BR-E03, BR-E04, BR-E05, BR-E06, BR-U07.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  loadSeedContext,
  randomNumbers,
  SEED_PASSWORD,
  signInAs,
  USERS,
  type Client,
} from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let seller2: Client
let owner: Client
let controlSeller: Client

/** Sub-vendedor real del equipo de vendedor1, creado por estas pruebas. */
let memberEmail: string
let memberId: string
let member: Client

/** Boleta vendida por el sub-vendedor; sirve para comprobar la visibilidad. */
let memberTicketId: string

/** Todo lo creado aqui, para dejar la base como estaba (I-035). */
const createdProfileIds: string[] = []
const createdTicketIds: string[] = []
const createdClientIds: string[] = []

/**
 * Crea una cuenta de Auth utilizable. `createUser` no deja la contrasena en
 * estado usable hasta que se actualiza (I-007), asi que se hacen los dos pasos.
 */
async function createAuthUser(email: string, fullName: string): Promise<string> {
  const { data, error } = await ctx.svc.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: '3001234567' },
  })
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)

  await ctx.svc.auth.admin.updateUserById(data.user.id, { password: SEED_PASSWORD })
  createdProfileIds.push(data.user.id)
  return data.user.id
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
  controlSeller = await signInAs(USERS.otherOrgSeller)

  const stamp = Date.now()
  memberEmail = `equipo-${stamp}@demo.test`
  memberId = await createAuthUser(memberEmail, 'Pedro Martinez')

  // El alta la hace el VENDEDOR con su propia sesion: es el acto que se prueba
  // en E1-02 y, a la vez, el escenario del resto del archivo.
  const { error } = await seller1.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: memberId,
    role: 'seller',
    parent_seller_id: ctx.ids.seller1,
    invited_by: ctx.ids.seller1,
  })
  if (error) throw new Error(`El vendedor no pudo crear su equipo: ${error.message}`)

  member = await signInAs(memberEmail)

  const numbers = randomNumbers()
  const { data: ticket, error: ticketError } = await ctx.svc
    .from('tickets')
    .insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: memberId,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'available',
      created_by: ctx.ids.owner,
    })
    .select('id')
    .single()
  if (ticketError) throw ticketError
  memberTicketId = ticket.id
  createdTicketIds.push(ticket.id)
})

afterAll(async () => {
  // Orden obligatorio: las boletas referencian al cliente y al vendedor, y las
  // membresias al perfil, todas con `on delete restrict`.
  if (createdTicketIds.length > 0) {
    await ctx.svc.from('tickets').delete().in('id', createdTicketIds)
  }
  if (createdClientIds.length > 0) {
    await ctx.svc.from('clients').delete().in('id', createdClientIds)
  }
  if (createdProfileIds.length > 0) {
    await ctx.svc.from('memberships').delete().in('profile_id', createdProfileIds)
    for (const id of createdProfileIds) {
      await ctx.svc.auth.admin.deleteUser(id)
    }
  }
})

describe('E1 — modelo de equipos', () => {
  it('E1-01: ningun vendedor existente se convirtio en sub-vendedor', async () => {
    // La migracion agrega la columna como NULL: los equipos se forman a mano,
    // nunca por efecto secundario de desplegar.
    const { data, error } = await ctx.svc
      .from('memberships')
      .select('profile_id, parent_seller_id')
      .in('profile_id', [ctx.ids.seller1, ctx.ids.seller2, ctx.ids.owner, ctx.ids.admin])

    expect(error).toBeNull()
    expect(data).toHaveLength(4)
    expect(data!.every((row) => row.parent_seller_id === null)).toBe(true)
  })

  it('E1-02: un vendedor crea un integrante y queda colgado de el', async () => {
    // El INSERT lo hizo `seller1` en beforeAll con su sesion real.
    const { data, error } = await ctx.svc
      .from('memberships')
      .select('role, parent_seller_id, invited_by, is_active')
      .eq('profile_id', memberId)
      .single()

    expect(error).toBeNull()
    expect(data!.role).toBe('seller')
    expect(data!.parent_seller_id).toBe(ctx.ids.seller1)
    expect(data!.is_active).toBe(true)
  })

  it('E1-03: un vendedor no puede meter a nadie en el equipo de otro', async () => {
    const id = await createAuthUser(`ajeno-${Date.now()}@demo.test`, 'Intruso Ajeno')

    const { error } = await seller1.from('memberships').insert({
      organization_id: ctx.demoOrg.id,
      profile_id: id,
      role: 'seller',
      parent_seller_id: ctx.ids.seller2, // el equipo de OTRO vendedor
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('E1-04: un vendedor no puede crear administradores ni dueños', async () => {
    const id = await createAuthUser(`escalada-${Date.now()}@demo.test`, 'Escalada Prueba')

    for (const role of ['admin', 'owner'] as const) {
      const { error } = await seller1.from('memberships').insert({
        organization_id: ctx.demoOrg.id,
        profile_id: id,
        role,
        parent_seller_id: ctx.ids.seller1,
      })
      expect(error).not.toBeNull()
      expect(error!.code).toBe('42501')
    }
  })

  it('E1-05: un vendedor no puede crear una membresia suelta, sin vendedor padre', async () => {
    // Sin `parent_seller_id` seria un vendedor a cargo del Dueño creado por
    // alguien que no es personal: eso sigue siendo exclusivo de BR-U01.
    const id = await createAuthUser(`suelto-${Date.now()}@demo.test`, 'Suelto Prueba')

    const { error } = await seller1.from('memberships').insert({
      organization_id: ctx.demoOrg.id,
      profile_id: id,
      role: 'seller',
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('E1-06: un sub-vendedor no puede formar su propio equipo (dos niveles, BR-E03)', async () => {
    const id = await createAuthUser(`nieto-${Date.now()}@demo.test`, 'Nieto Prueba')

    const { error } = await member.from('memberships').insert({
      organization_id: ctx.demoOrg.id,
      profile_id: id,
      role: 'seller',
      parent_seller_id: memberId,
    })

    expect(error).not.toBeNull()
    // Las DOS capas lo rechazan; gana la que corre primero. PostgreSQL evalua
    // los triggers BEFORE ROW antes que el WITH CHECK de la RLS, asi que el
    // usuario recibe `check_violation` con una frase explicable en vez de un
    // error de permisos seco. Si algun dia se quitara el trigger, la politica
    // `memberships_insert_seller` seguiria devolviendo 42501.
    expect(error!.code).toBe('23514')
    expect(error!.message).toMatch(/ya pertenece a un equipo/i)
  })

  it('E1-07: nadie puede ser su propio vendedor padre', async () => {
    // Con la service role: se comprueba la RESTRICCION, no el permiso.
    const { error } = await ctx.svc
      .from('memberships')
      .update({ parent_seller_id: ctx.ids.seller2 })
      .eq('profile_id', ctx.ids.seller2)

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/memberships_parent_not_self/i)
  })

  it('E1-08: el vendedor padre debe ser de la misma organizacion', async () => {
    const id = await createAuthUser(`otraorg-${Date.now()}@demo.test`, 'Otra Org')

    const { error } = await ctx.svc.from('memberships').insert({
      organization_id: ctx.demoOrg.id,
      profile_id: id,
      role: 'seller',
      parent_seller_id: ctx.ids.otherOrgSeller, // vendedor de «Rifas Control»
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/memberships_parent_seller_fk|foreign key/i)
  })

  it('E1-09: un vendedor no puede cambiarse de equipo ni cambiar el de nadie', async () => {
    // No hay politica de UPDATE sobre memberships para quien no es personal:
    // la fila no se actualiza y PostgREST no devuelve error (BD F3-03).
    const { data, error } = await seller1
      .from('memberships')
      .update({ parent_seller_id: null })
      .eq('profile_id', memberId)
      .select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(0)

    const { data: after } = await ctx.svc
      .from('memberships')
      .select('parent_seller_id')
      .eq('profile_id', memberId)
      .single()
    expect(after!.parent_seller_id).toBe(ctx.ids.seller1)
  })
})

describe('E1 — visibilidad del equipo', () => {
  it('E1-10: la RLS de boletas NO cambio: ni el padre las ve por consulta directa', async () => {
    // Es deliberado, y es la parte importante de la migracion. Si esto empezara
    // a devolver 1, «Mis boletas», el panel, los reportes y la busqueda del
    // vendedor habrian pasado a incluir boletas ajenas sin que nadie lo pidiera.
    const { data, error } = await seller1.from('tickets').select('id').eq('id', memberTicketId)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('E1-11: el padre ve las ventas del equipo por `team_sales_summary`', async () => {
    // La boleta creada en beforeAll esta `available`: se vende para que el
    // resumen tenga algo que contar.
    const { data: cliente } = await ctx.svc
      .from('clients')
      .insert({
        organization_id: ctx.demoOrg.id,
        seller_id: memberId,
        name: 'Cliente resumen equipo',
        phone: '3005559999',
      })
      .select('id')
      .single()
    createdClientIds.push(cliente!.id)

    await ctx.svc
      .from('tickets')
      .update({
        client_id: cliente!.id,
        inventory_status: 'assigned',
        sale_price: 100000,
        sale_date: '2026-08-12',
        assigned_at: new Date().toISOString(),
      })
      .eq('id', memberTicketId)

    const { data, error } = await seller1.rpc('team_sales_summary')

    expect(error).toBeNull()
    const fila = data?.find((row) => row.seller_id === memberId)
    expect(fila).toBeDefined()
    expect(Number(fila!.tickets_assigned)).toBe(1)
    expect(Number(fila!.total_sold)).toBe(100000)
  })

  it('E1-11b: quien no tiene equipo recibe un resumen vacio, nunca el de otro', async () => {
    for (const [nombre, client] of [
      ['vendedor2', seller2],
      ['vendedor de otra organizacion', controlSeller],
      ['el propio integrante', member],
    ] as const) {
      const { data, error } = await client.rpc('team_sales_summary')
      expect(error, nombre).toBeNull()
      expect(data, nombre).toHaveLength(0)
    }
  })

  it('E1-11c: `team_member_sales` no responde por un integrante ajeno', async () => {
    // vendedor2 pregunta por el integrante de vendedor1, con su id exacto.
    const { data, error } = await seller2.rpc('team_member_sales', {
      p_member_id: memberId,
      p_limit: 20,
    })

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('E1-12: la visibilidad es en un solo sentido: el integrante no ve las del padre', async () => {
    const { data: propias } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller1)
      .limit(1)

    const delPadre = propias?.[0]
    expect(delPadre).toBeDefined()

    const { data, error } = await member.from('tickets').select('id').eq('id', delPadre!.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('E1-13: el vendedor padre ve el perfil y la membresia de su integrante', async () => {
    const { data: perfil } = await seller1.from('profiles').select('full_name').eq('id', memberId)
    expect(perfil).toHaveLength(1)
    expect(perfil?.[0]?.full_name).toBe('Pedro Martinez')

    const { data: membresia } = await seller1
      .from('memberships')
      .select('is_active')
      .eq('profile_id', memberId)
    expect(membresia).toHaveLength(1)

    // Y un vendedor ajeno sigue sin ver ni el nombre.
    const { data: ajeno } = await seller2.from('profiles').select('id').eq('id', memberId)
    expect(ajeno).toHaveLength(0)
  })

  it('E1-14: el vendedor padre NO ve los clientes ni los pagos de su integrante', async () => {
    // Decision de alcance: el equipo comparte ventas, no cartera ni dinero.
    const { data: cliente } = await ctx.svc
      .from('clients')
      .insert({
        organization_id: ctx.demoOrg.id,
        seller_id: memberId,
        name: 'Cliente del integrante',
        phone: '3009998877',
      })
      .select('id')
      .single()

    const { data: vistos, error } = await seller1.from('clients').select('id').eq('id', cliente!.id)
    expect(error).toBeNull()
    expect(vistos).toHaveLength(0)

    await ctx.svc.from('clients').delete().eq('id', cliente!.id)
  })

  it('E1-15: el personal sigue viendo todo, con equipos o sin ellos', async () => {
    const { data, error } = await owner.from('tickets').select('id').eq('id', memberTicketId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})
