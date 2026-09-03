import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import WebSocket from 'ws'

import type { Database } from '../../src/types/database.types'

/**
 * PREPARACION de datos para las pruebas end-to-end, con la service role.
 *
 * Se usa unicamente para dejar la base en el estado de partida que la prueba
 * necesita (por ejemplo, una boleta pendiente de aprobacion, que hoy solo puede
 * crear el portal del vendedor, que llega en la Fase 4).
 *
 * El ACTO que se prueba siempre ocurre por la interfaz, con la sesion real del
 * usuario: si se usara la service role para eso, la prueba pasaria aunque no
 * existiera ninguna politica de seguridad (docs/TESTING.md, D-043).
 */

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: WebSocket as any },
  })
}

/**
 * Cliente con la SESION REAL de una persona, para preparar escenarios que solo
 * existen pasando por una regla de negocio.
 *
 * Lo necesita el cobro de boletas: `create_payment` empieza por `require_auth()`
 * y el cuadre pago/asignaciones es un constraint diferido, asi que no se puede
 * imitar con inserciones sueltas de service role. Sigue siendo PREPARACION —lo
 * que la prueba comprueba ocurre por la interfaz—, pero por el camino real.
 */
export async function signedInClient(
  email: string,
  password = 'DesarrolloLocal2026',
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: WebSocket as any },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`No se pudo iniciar sesion como ${email}: ${error.message}`)
  return client
}

/**
 * Borra TODO lo que cuelga de unos vendedores, en UNA transaccion.
 *
 * No se puede hacer con PostgREST, y el motivo es de diseño del esquema, no una
 * limitacion del cliente:
 *
 *   * Borrar las asignaciones de un pago SIN borrar el pago deja la suma en
 *     cero y el cuadre diferido `check_payment_balance` lo rechaza al COMMIT.
 *   * Borrar el pago primero choca con `alloc_payment_client_fk`, que es
 *     RESTRICT: sus asignaciones todavia lo referencian.
 *
 * Como cada peticion de PostgREST es una transaccion propia, las dos cosas
 * tienen que ocurrir juntas. Por eso aqui va una conexion directa.
 *
 * Se descubrio porque la limpieza fallaba EN SILENCIO: las cuentas de prueba se
 * acumulaban, el panel del Dueño crecia y acababa tumbando la prueba del
 * recorrido guiado, que mide donde cae el globo.
 */
export async function purgeSellers(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  try {
    await db.query('begin')
    // Pagos y sus asignaciones, juntos: es la unica forma de que cuadre.
    await db.query(
      `delete from payment_allocations pa using payments p
        where pa.payment_id = p.id and p.seller_id = any($1)`,
      [ids],
    )
    await db.query('delete from payments where seller_id = any($1)', [ids])

    await db.query(
      `delete from payment_allocations
        where ticket_id in (select id from tickets where seller_id = any($1))`,
      [ids],
    )
    await db.query(
      `delete from notifications
        where entity_id in (select id from tickets where seller_id = any($1))
           or entity_id in (select id from memberships where profile_id = any($1))
           or recipient_profile_id = any($1)`,
      [ids],
    )
    await db.query('delete from tickets where seller_id = any($1)', [ids])
    await db.query('delete from clients where seller_id = any($1)', [ids])
    await db.query('delete from commission_ledger where seller_id = any($1)', [ids])
    await db.query('delete from seller_commissions where seller_id = any($1)', [ids])

    // Integrantes antes que sus jefes: la FK del vendedor padre es RESTRICT.
    await db.query(
      'delete from memberships where profile_id = any($1) and parent_seller_id is not null',
      [ids],
    )
    await db.query('delete from memberships where profile_id = any($1)', [ids])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  } finally {
    await db.end()
  }
}

/**
 * Borra lo que crea una suite: sus clientes, sus boletas y —si las hubo— sus
 * programaciones de lotería.
 *
 * Hermana de `purgeSellers`, y por la misma razón: **una prueba que crea
 * clientes tiene que borrarlos** (I-035). El listado de «Mis clientes» del
 * vendedor enseña los 25 primeros por nombre sin buscar nada, así que una suite
 * que deja catorce clientes empuja fuera de la primera página al que otra
 * prueba estaba mirando, y esa otra prueba falla apuntando al sitio equivocado.
 * Pasó al añadir `cambiar-cliente.spec.ts`: `seller-clients` dejó de encontrar
 * su «Cliente archivable».
 *
 * Va por `pg` y en UNA transacción por lo de siempre: `payments_balanced` es un
 * constraint trigger diferido y PostgREST manda cada `delete` en su propia
 * transacción, así que borrar las asignaciones sueltas revienta —y el cliente
 * de Supabase **devuelve** el error en vez de lanzarlo, de modo que la limpieza
 * fallaría en silencio (I-059).
 */
export async function purgeTestData(options: {
  clientIds?: string[]
  /** Boletas que no cuelgan de ninguno de esos clientes (una sin vender). */
  ticketIds?: string[]
  lotteryScheduleIds?: string[]
}): Promise<void> {
  const clientIds = options.clientIds ?? []
  const ticketIds = options.ticketIds ?? []
  const scheduleIds = options.lotteryScheduleIds ?? []
  if (clientIds.length === 0 && ticketIds.length === 0 && scheduleIds.length === 0) return

  const db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  // Todas las boletas afectadas: las que se pasaron y las de esos clientes.
  const tickets = `(select id from tickets where id = any($2) or client_id = any($1))`
  const args = [clientIds, ticketIds]
  try {
    await db.query('begin')
    await db.query(
      `delete from payment_allocations pa using payments p
        where pa.payment_id = p.id and p.client_id = any($1)`,
      [clientIds],
    )
    await db.query('delete from payments where client_id = any($1)', [clientIds])
    await db.query(`delete from payment_allocations where ticket_id in ${tickets}`, args)

    // La fotografía de un sorteo es inmutable a propósito (BR-L11): el
    // disparador se apaga SOLO dentro de esta transacción de limpieza.
    await db.query(
      'alter table lottery_ticket_matches disable trigger lottery_ticket_matches_immutable',
    )
    await db.query(`delete from lottery_ticket_matches where ticket_id in ${tickets}`, args)
    await db.query(
      'alter table lottery_ticket_matches enable trigger lottery_ticket_matches_immutable',
    )

    await db.query(`delete from notifications where entity_id in ${tickets}`, args)
    await db.query(`delete from tickets where id in ${tickets}`, args)
    await db.query('delete from clients where id = any($1)', [clientIds])
    await db.query('delete from lottery_results where schedule_id = any($1)', [scheduleIds])
    await db.query('delete from lottery_draw_schedules where id = any($1)', [scheduleIds])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  } finally {
    await db.end()
  }
}

export type SeedRefs = {
  organizationId: string
  raffleId: string
  ownerId: string
  sellerId: string
  otherSellerId: string
}

export async function loadSeedRefs(): Promise<SeedRefs> {
  const svc = serviceClient()

  const { data: org } = await svc
    .from('organizations')
    .select('id')
    .eq('name', 'Rifas Demo')
    .single()
  const { data: raffle } = await svc
    .from('raffles')
    .select('id')
    .eq('name', 'Rifa Navidad 2026')
    .single()
  const { data: profiles } = await svc.from('profiles').select('id, email')

  const byEmail = (email: string) => profiles!.find((p) => p.email === email)!.id

  return {
    organizationId: org!.id,
    raffleId: raffle!.id,
    ownerId: byEmail('owner@demo.test'),
    sellerId: byEmail('vendedor1@demo.test'),
    otherSellerId: byEmail('vendedor2@demo.test'),
  }
}

/** Un recurso que pertenece a OTRO vendedor, para probar el aislamiento. */
export async function findOtherSellerResources(
  refs: SeedRefs,
): Promise<{ ticketId: string | null; clientId: string | null }> {
  const svc = serviceClient()

  const [{ data: tickets }, { data: clients }] = await Promise.all([
    svc.from('tickets').select('id').eq('seller_id', refs.otherSellerId).limit(1),
    svc.from('clients').select('id').eq('seller_id', refs.otherSellerId).limit(1),
  ])

  return { ticketId: tickets?.[0]?.id ?? null, clientId: clients?.[0]?.id ?? null }
}

/**
 * Crea un cliente y devuelve su id y nombre.
 *
 * Sin `sellerId` es del vendedor 1, que es lo que necesitan casi todas las
 * pruebas. Se le puede pasar otro para montar el escenario de una cartera
 * ajena: la correccion de cliente comprueba que esos NO se ofrecen (D-168).
 */
export async function createClientFor(
  refs: SeedRefs,
  name: string,
  sellerId = refs.sellerId,
): Promise<{ id: string; name: string }> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('clients')
    .insert({
      organization_id: refs.organizationId,
      seller_id: sellerId,
      name,
      phone: '3005550000',
    })
    .select('id, name')
    .single()

  if (error) throw error
  return data
}

/**
 * Boleta YA VENDIDA a un cliente, lista para recibir abonos.
 *
 * Se inserta directamente con la service role en vez de llamar a
 * `assign_ticket`: esa RPC necesita `auth.uid()`, que no existe con la clave de
 * servicio. Es PREPARACION del estado de partida; el acto que se prueba —el
 * registro del abono— pasa siempre por la interfaz (D-043).
 */
export async function createAssignedTicket(
  refs: SeedRefs,
  options: { dailyNumber: string; weeklyNumber: string; clientId: string; salePrice: number },
): Promise<{ id: string; internalCode: string }> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('tickets')
    .insert({
      organization_id: refs.organizationId,
      raffle_id: refs.raffleId,
      seller_id: refs.sellerId,
      client_id: options.clientId,
      daily_number: options.dailyNumber,
      weekly_number: options.weeklyNumber,
      inventory_status: 'assigned',
      sale_price: options.salePrice,
      sale_date: new Date().toISOString().slice(0, 10),
      assigned_at: new Date().toISOString(),
      created_by: refs.ownerId,
    })
    .select('id, internal_code')
    .single()

  if (error) throw error
  return { id: data.id, internalCode: data.internal_code }
}

/** Saldo pendiente actual de una boleta, leido de la vista de saldos. */
export async function ticketBalance(
  ticketId: string,
): Promise<{ paidAmount: number; pendingAmount: number; paymentStatus: string }> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('v_ticket_balances')
    .select('paid_amount, pending_amount, payment_status')
    .eq('ticket_id', ticketId)
    .single()

  if (error) throw error
  return {
    paidAmount: data.paid_amount ?? 0,
    pendingAmount: data.pending_amount ?? 0,
    paymentStatus: data.payment_status ?? 'unpaid',
  }
}

/** Precio vigente de la rifa del seed. */
export async function raffleTicketPrice(refs: SeedRefs): Promise<number> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('raffles')
    .select('ticket_price')
    .eq('id', refs.raffleId)
    .single()

  if (error) throw error
  return data.ticket_price
}

/** Crea una boleta en el estado indicado y devuelve su codigo interno. */
export async function createTicket(
  refs: SeedRefs,
  options: {
    dailyNumber: string
    weeklyNumber: string
    inventoryStatus: Database['public']['Enums']['ticket_inventory_status']
  },
): Promise<{ id: string; internalCode: string }> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('tickets')
    .insert({
      organization_id: refs.organizationId,
      raffle_id: refs.raffleId,
      seller_id: refs.sellerId,
      daily_number: options.dailyNumber,
      weekly_number: options.weeklyNumber,
      inventory_status: options.inventoryStatus,
      created_by: refs.sellerId,
    })
    .select('id, internal_code')
    .single()

  if (error) throw error
  return { id: data.id, internalCode: data.internal_code }
}

/**
 * Devuelve una membresia a su estado activo.
 *
 * Se usa para RESTITUIR el seed despues de una prueba que desactiva a alguien
 * (BR-A04). Va por la service role a proposito: si la restitucion dependiera de
 * la interfaz, un fallo o un timeout en mitad de la prueba dejaria al vendedor
 * inactivo y las DEMAS pruebas empezarian a fallar por un motivo que no tiene
 * nada que ver con ellas. Preparar y restituir estado es justo para lo que se
 * admite la service role (docs/TESTING.md §2.1).
 */
export async function setMembershipActive(email: string, isActive: boolean): Promise<void> {
  const svc = serviceClient()

  const { data: profile, error: profileError } = await svc
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()
  if (profileError) throw profileError

  const { error } = await svc
    .from('memberships')
    .update({ is_active: isActive })
    .eq('profile_id', profile.id)
  if (error) throw error
}
