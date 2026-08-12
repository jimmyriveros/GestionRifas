/**
 * Avisos (migracion 0023, BR-E10..BR-E13).
 *
 * Lo importante aqui no es que el aviso llegue, sino a QUIEN llega y a quien
 * no. La jerarquia del encargo, montada de verdad:
 *
 *   Dueño / Administrador
 *     └─ vendedor1 ─ integrante A
 *     └─ vendedor2 ─ integrante B
 *
 * Cuando A vende, el aviso debe llegar a vendedor1 y al personal, y NO a
 * vendedor2 ni a B.
 *
 * Cada quien consulta su bandeja con su propia sesion (D-043); la service role
 * solo prepara y limpia el escenario.
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
let owner: Client
let seller1: Client
let seller2: Client

/** Integrante de vendedor1 y su sesion. */
let memberAId: string
let memberA: Client
/** Integrante de vendedor2: existe para comprobar a quien NO llegan los avisos. */
let memberB: Client

let clientId: string

const createdProfileIds: string[] = []
const createdTicketIds: string[] = []
const createdClientIds: string[] = []

async function createMember(email: string, name: string, parentId: string): Promise<string> {
  const { data, error } = await ctx.svc.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name, phone: '3001234567' },
  })
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)

  await ctx.svc.auth.admin.updateUserById(data.user.id, { password: SEED_PASSWORD })
  createdProfileIds.push(data.user.id)

  const { error: membershipError } = await ctx.svc.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: data.user.id,
    role: 'seller',
    parent_seller_id: parentId,
  })
  if (membershipError) throw membershipError

  return data.user.id
}

/** Vende una boleta a nombre de `sellerId` y devuelve su id. */
async function sellTicket(sellerId: string): Promise<string> {
  const numbers = randomNumbers()
  const { data, error } = await ctx.svc
    .from('tickets')
    .insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: ctx.demoRaffle.id,
      seller_id: sellerId,
      created_by: ctx.ids.owner,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'available',
    })
    .select('id')
    .single()
  if (error) throw error
  createdTicketIds.push(data.id)

  // La venta es la TRANSICION a `assigned`: es lo que dispara el aviso.
  const { error: sellError } = await ctx.svc
    .from('tickets')
    .update({
      client_id: clientId,
      inventory_status: 'assigned',
      sale_price: 100000,
      sale_date: '2026-08-12',
      assigned_at: new Date().toISOString(),
    })
    .eq('id', data.id)
  if (sellError) throw sellError

  return data.id
}

async function inboxOf(client: Client, kind: string) {
  const { data, error } = await client
    .from('notifications')
    .select('id, kind, data, read_at')
    .eq('kind', kind)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  owner = await signInAs(USERS.owner)
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)

  const stamp = Date.now().toString(36)
  memberAId = await createMember(`aviso-a-${stamp}@demo.test`, 'Pedro Aviso', ctx.ids.seller1)
  await createMember(`aviso-b-${stamp}@demo.test`, 'Felipe Aviso', ctx.ids.seller2)
  memberA = await signInAs(`aviso-a-${stamp}@demo.test`)
  memberB = await signInAs(`aviso-b-${stamp}@demo.test`)

  const { data: cliente, error } = await ctx.svc
    .from('clients')
    .insert({
      organization_id: ctx.demoOrg.id,
      seller_id: memberAId,
      name: 'Cliente de avisos',
      phone: '3007778888',
    })
    .select('id')
    .single()
  if (error) throw error
  clientId = cliente.id
  createdClientIds.push(cliente.id)
})

afterAll(async () => {
  // Los avisos se borran por la ENTIDAD que los provoco, no por el
  // destinatario: cada venta avisa tambien al personal, cuyas bandejas son del
  // seed y no de esta suite. Borrar por actor tampoco sirve —la service role no
  // deja `auth.uid()`, asi que el actor es NULL— y esas copias sobrevivirian
  // para ensuciar las pruebas siguientes (I-035).
  const membresias =
    createdProfileIds.length > 0
      ? ((await ctx.svc.from('memberships').select('id').in('profile_id', createdProfileIds))
          .data ?? [])
      : []

  const entidades = [...createdTicketIds, ...membresias.map((row) => row.id)]
  if (entidades.length > 0) {
    await ctx.svc.from('notifications').delete().in('entity_id', entidades)
  }
  if (createdProfileIds.length > 0) {
    await ctx.svc.from('notifications').delete().in('recipient_profile_id', createdProfileIds)
  }

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

describe('E4 — avisos de equipo', () => {
  it('E4-01: el personal se entera de que un vendedor armo su equipo', async () => {
    const avisos = await inboxOf(owner, 'team.member_added')
    const delEquipo = avisos.filter(
      (aviso) => (aviso.data as Record<string, unknown>).member_name === 'Pedro Aviso',
    )

    expect(delEquipo).toHaveLength(1)
    const data = delEquipo[0]!.data as Record<string, unknown>
    expect(data.parent_name).toBe('Julian Vargas')
    // Fue el primero de ese equipo: la aplicacion dira «armó su equipo» en vez
    // de «agregó a».
    expect(data.is_first).toBe(true)
  })

  it('E4-02: el segundo integrante ya no es «armó su equipo»', async () => {
    const email = `aviso-a2-${Date.now().toString(36)}@demo.test`
    await createMember(email, 'Andrea Aviso', ctx.ids.seller1)

    const avisos = await inboxOf(owner, 'team.member_added')
    const segundo = avisos.find(
      (aviso) => (aviso.data as Record<string, unknown>).member_name === 'Andrea Aviso',
    )

    expect(segundo).toBeDefined()
    expect((segundo!.data as Record<string, unknown>).is_first).toBe(false)
  })

  it('E4-03: un vendedor NO se entera de los equipos de los demas', async () => {
    // vendedor2 no debe ver que vendedor1 armo equipo.
    const avisos = await inboxOf(seller2, 'team.member_added')
    const ajenos = avisos.filter(
      (aviso) => (aviso.data as Record<string, unknown>).parent_name === 'Julian Vargas',
    )

    expect(ajenos).toHaveLength(0)
  })
})

describe('E4 — avisos de venta', () => {
  it('E4-04: la venta de un integrante llega a su vendedor padre y al personal', async () => {
    await sellTicket(memberAId)

    for (const [nombre, client] of [
      ['el vendedor padre', seller1],
      ['el Dueño', owner],
    ] as const) {
      const avisos = await inboxOf(client, 'team.sale')
      const deA = avisos.filter(
        (aviso) => (aviso.data as Record<string, unknown>).seller_name === 'Pedro Aviso',
      )
      expect(deA, nombre).toHaveLength(1)
    }
  })

  it('E4-05: NO llega al vendedor de otro equipo ni a los companeros', async () => {
    for (const [nombre, client] of [
      ['el vendedor de otro equipo', seller2],
      ['un integrante de otro equipo', memberB],
    ] as const) {
      const avisos = await inboxOf(client, 'team.sale')
      const deA = avisos.filter(
        (aviso) => (aviso.data as Record<string, unknown>).seller_name === 'Pedro Aviso',
      )
      expect(deA, nombre).toHaveLength(0)
    }
  })

  it('E4-06: quien vende no recibe aviso de su propia venta', async () => {
    const avisos = await inboxOf(memberA, 'team.sale')
    expect(avisos).toHaveLength(0)
  })

  it('E4-07: el aviso lleva los dos numeros de la boleta, no su codigo interno', async () => {
    const avisos = await inboxOf(seller1, 'team.sale')
    const data = avisos[0]!.data as Record<string, unknown>

    expect(typeof data.daily_number).toBe('string')
    expect(typeof data.weekly_number).toBe('string')
    expect(data).not.toHaveProperty('internal_code')
  })

  it('E4-08: un abono posterior no vuelve a avisar la misma venta', async () => {
    const antes = (await inboxOf(seller1, 'team.sale')).length

    await ctx.svc
      .from('tickets')
      .update({ sale_date: '2026-08-11' })
      .eq('id', createdTicketIds[createdTicketIds.length - 1]!)

    const despues = (await inboxOf(seller1, 'team.sale')).length
    expect(despues).toBe(antes)
  })
})

describe('E4 — la bandeja es privada', () => {
  it('E4-09: nadie puede leer la bandeja de otro, ni el personal', async () => {
    // El Dueño consulta TODAS las notificaciones que la RLS le deje ver.
    const { data, error } = await owner.from('notifications').select('recipient_profile_id')

    expect(error).toBeNull()
    const ajenas = (data ?? []).filter((row) => row.recipient_profile_id !== ctx.ids.owner)
    expect(ajenas).toHaveLength(0)
  })

  it('E4-10: nadie puede escribir un aviso a mano', async () => {
    const { error } = await owner.from('notifications').insert({
      organization_id: ctx.demoOrg.id,
      recipient_profile_id: ctx.ids.seller1,
      kind: 'team.sale',
      data: { seller_name: 'Inventado' },
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('E4-11: se pueden marcar como leidos los propios avisos, y solo eso', async () => {
    const { error } = await seller1
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
    expect(error).toBeNull()

    const { data } = await seller1.from('notifications').select('read_at').is('read_at', null)
    expect(data).toHaveLength(0)

    // Reescribir el contenido no es posible: `authenticated` solo tiene
    // privilegio sobre la columna `read_at`.
    const { error: rewriteError } = await seller1
      .from('notifications')
      .update({ kind: 'team.member_added' })
      .eq('recipient_profile_id', ctx.ids.seller1)

    expect(rewriteError).not.toBeNull()
    expect(rewriteError!.code).toBe('42501')
  })
})
