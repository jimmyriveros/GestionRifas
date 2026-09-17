/**
 * Utilidades para las pruebas de base de datos.
 *
 * Principio (docs/TESTING.md §2): las pruebas de RLS NO usan la service role.
 * Cada una inicia sesion con `signInWithPassword` como un usuario real y opera
 * con la clave publica, exactamente como lo haria un atacante con acceso al
 * navegador. Si una prueba pasara con service role, no probaria nada.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient, type QueryResult, type QueryResultRow } from 'pg'
import WebSocket from 'ws'

import type { Database } from '../../src/types/database.types'

export const LOCAL_URL = 'http://127.0.0.1:54321'
export const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
export const SEED_PASSWORD = 'DesarrolloLocal2026'

export const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const realtime = { transport: WebSocket as any }

export type Client = SupabaseClient<Database>

/** Cliente con la clave publica, SIN sesion: simula a un visitante anonimo. */
export function anonClient(): Client {
  return createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime,
  })
}

/** Cliente administrativo. Solo para PREPARAR datos, nunca para probar RLS. */
export function serviceClient(): Client {
  return createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime,
  })
}

/**
 * Ejecuta SQL con la IDENTIDAD de una persona del seed, pero conectado como
 * superusuario, en una sola transaccion (D-198).
 *
 * SOLO para dos cosas. Una, las RPC que D-198 dejo DORMIDAS —`void_payment`,
 * `match_ticket_import_clients` e `import_tickets_with_clients`—: ya no son
 * ejecutables por `authenticated`, pero su cuerpo no cambio, porque
 * reactivarlas es volver a conceder EXECUTE; estas pruebas comprueban que ese
 * cuerpo sigue haciendo lo mismo. Otra, dejar datos con la forma que tenian
 * antes de D-198, como un abono que registro el personal.
 *
 * NO prueba RLS ni permisos: el superusuario se salta los dos. Para eso estan
 * las sesiones reales de `signInAs`.
 */
export async function asProfile<T extends QueryResultRow = QueryResultRow>(
  profileId: string,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  try {
    await db.query('begin')
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: profileId, role: 'authenticated' }),
    ])
    const result = await db.query<T>(sql, params)
    await db.query('commit')
    return result
  } catch (error) {
    await db.query('rollback')
    throw error
  } finally {
    await db.end()
  }
}

export type EngineError = { message: string; code?: string; details?: string; hint?: string }

/**
 * Corre el motor de coincidencias sobre un resultado ya guardado, como el dueño
 * de la base.
 *
 * Desde la `0066` (D-207) `match_lottery_result` es interno: nadie lo ejecuta
 * directamente —tampoco la service role— y solo lo alcanza
 * `confirm_lottery_result`, que es el camino del sincronizador y el que
 * prueban las suites con la service role. Las pruebas que insertan un
 * resultado a mano para mirar el motor lo invocan aquí, con PostgreSQL directo,
 * como hace la propia función que lo llama. Devuelve la misma forma que
 * `rpc()`: `{ data, error }`, con el error de PostgreSQL en `code`, `message`,
 * `details` y `hint`.
 */
export async function runLotteryEngine(
  resultId: string,
): Promise<{ data: unknown; error: EngineError | null }> {
  const db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  try {
    const { rows } = await db.query<{ r: unknown }>('select match_lottery_result($1) as r', [
      resultId,
    ])
    return { data: rows[0]!.r, error: null }
  } catch (error) {
    const e = error as { message: string; code?: string; detail?: string; hint?: string }
    return { data: null, error: { message: e.message, code: e.code, details: e.detail, hint: e.hint } }
  } finally {
    await db.end()
  }
}

/** Anula un pago con `void_payment`, con la identidad de quien anula (ver `asProfile`). */
export async function voidPaymentAs(profileId: string, paymentId: string, reason: string) {
  await asProfile(profileId, 'select void_payment($1, $2)', [paymentId, reason])
}

/** Cliente autenticado como un usuario real del seed. */
export async function signInAs(email: string): Promise<Client> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD })
  if (error) throw new Error(`No se pudo iniciar sesion como ${email}: ${error.message}`)
  return client
}

export const USERS = {
  owner: 'owner@demo.test',
  admin: 'admin@demo.test',
  seller1: 'vendedor1@demo.test',
  seller2: 'vendedor2@demo.test',
  otherOrgOwner: 'owner@control.test',
  otherOrgSeller: 'vendedor@control.test',
} as const

/** Contexto del seed que casi todas las pruebas necesitan. */
export async function loadSeedContext() {
  const svc = serviceClient()

  const { data: orgs } = await svc.from('organizations').select('id, name')
  const demoOrg = orgs!.find((o) => o.name === 'Rifas Demo')!
  const controlOrg = orgs!.find((o) => o.name === 'Rifas Control')!

  const { data: raffles } = await svc.from('raffles').select('id, name, organization_id')
  const demoRaffle = raffles!.find((r) => r.name === 'Rifa Navidad 2026')!
  const controlRaffle = raffles!.find((r) => r.name === 'Rifa Control 2026')!

  const { data: profiles } = await svc.from('profiles').select('id, email')
  const byEmail = (email: string) => profiles!.find((p) => p.email === email)!.id

  const { data: clients } = await svc.from('clients').select('id, name, seller_id, organization_id')

  return {
    svc,
    demoOrg,
    controlOrg,
    demoRaffle,
    controlRaffle,
    ids: {
      owner: byEmail(USERS.owner),
      admin: byEmail(USERS.admin),
      seller1: byEmail(USERS.seller1),
      seller2: byEmail(USERS.seller2),
      otherOrgSeller: byEmail(USERS.otherOrgSeller),
    },
    clients: {
      ana: clients!.find((c) => c.name === 'Ana Torres')!,
      carlos: clients!.find((c) => c.name === 'Carlos Diaz')!,
      beatriz: clients!.find((c) => c.name === 'Beatriz Rojas')!,
      diego: clients!.find((c) => c.name === 'Diego Marin')!,
      fabio: clients!.find((c) => c.name === 'Fabio Nieto')!,
    },
  }
}

/** Inserta una boleta con service role; devuelve el error de Postgres si lo hay. */
export async function insertTicket(
  svc: Client,
  values: {
    organization_id: string
    raffle_id: string
    seller_id: string
    created_by: string
    daily_number?: string | null
    weekly_number?: string | null
    inventory_status?: Database['public']['Enums']['ticket_inventory_status']
  },
) {
  return svc
    .from('tickets')
    .insert({
      inventory_status: 'available',
      ...values,
    })
    .select('id')
    .maybeSingle()
}

/** Numeros aleatorios de 4 digitos para no colisionar entre pruebas. */
export function randomNumbers() {
  const n = () => {
    let value: string
    do {
      value = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
      // `0100` es el ancla de ticket-search.test.ts (`limit 1` sin rifa).
      // Un 0100 suelto en otra rifa hace que esa suite busque en el sitio
      // equivocado y devuelva cero filas (I-035).
    } while (value === '0100')
    return value
  }
  return { daily: n(), weekly: n() }
}
