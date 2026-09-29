/**
 * La pausa de publicación contra la pila local de verdad (D-239, `RUNBOOK` §10).
 *
 * Todo pasa por la PostgREST local, como pasa en producción: `supabase-js` con
 * sesiones reales del seed, `fetch` con las claves de `anon` y de `service_role`,
 * y quien opera por conexión directa con las funciones de
 * `scripts/maintenance-pause.ts`. Lo que se comprueba es lo que se va a usar:
 *
 *   MP-01 instalada y ABIERTA, la API funciona igual y lo dice;
 *   MP-02 CERRADA, rechaza lecturas, escrituras y RPC de los tres roles, sin tocar
 *         una fila, en milisegundos y sin reintentos; Auth sigue funcionando;
 *   MP-03 un perfil permitido pasa, nadie más, y nadie mientras quien opera tiene
 *         el cerrojo en exclusiva;
 *   MP-04 cerrar ESPERA a la petición que ya estaba dentro, y nada nuevo entra;
 *   MP-05 un turno del programador de loterías, con la pausa cerrada, no escribe nada;
 *   MP-06 cerrar se niega si un recordatorio de pago vence dentro de la ventana;
 *   MP-07 abrir y retirar devuelven la API y la configuración exactamente como estaban;
 *   MP-08 no pisa otro gancho de PostgREST.
 *
 * ⚠️ MIENTRAS CORRE, LA API LOCAL ENTERA ESTÁ CERRADA. `test:db` corre los archivos de
 * uno en uno, y el `afterAll` la retira pase lo que pase: una pausa olvidada dejaría
 * en 423 a todas las suites siguientes.
 */
import { readFileSync } from 'node:fs'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runLotterySyncTick } from '@/features/lottery/job'

import {
  allow,
  close,
  DRAIN_LOCK,
  INSTALL_SQL,
  install,
  probe,
  readState,
  retire,
  type ApiTarget,
  type Options,
} from '../../scripts/maintenance-pause'

import {
  DB_URL,
  LOCAL_ANON_KEY,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_URL,
  loadSeedContext,
  signInAs,
  USERS,
  type Client,
} from './helpers'

const API: ApiTarget = {
  url: LOCAL_URL,
  anonKey: LOCAL_ANON_KEY,
  serviceKey: LOCAL_SERVICE_ROLE_KEY,
  site: 'http://localhost:3000',
}

/** Horizonte 0: los recordatorios de otras suites no deben impedir cerrar aquí. */
const CLOSE: Options = {
  command: 'cerrar',
  target: { kind: 'local', projectRef: null },
  horizonMinutes: 0,
  drainSeconds: 30,
  migration: null,
  commit: null,
  site: null,
  allowed: [],
}

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller: Client
let owner: Client
let settingsBefore: string | null

const SLEEP_FN = 'pausa_prueba_dormir'

async function authenticatorSettings(): Promise<string | null> {
  const { rows } = await db.query(
    `select setconfig::text as c from pg_db_role_setting where setrole = 'authenticator'::regrole`,
  )
  return rows[0]?.c ?? null
}

/** Una petición cruda: estado, cabecera de la pausa y código del cuerpo. */
async function raw(path: string, key: string, init: RequestInit = {}, token?: string) {
  const response = await fetch(`${LOCAL_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  let code: string | null = null
  try {
    code = (JSON.parse(text) as { code?: string }).code ?? null
  } catch {
    code = null
  }
  return { status: response.status, pausa: response.headers.get('x-rifas-pausa'), code }
}

async function setOpen(open: boolean, permitidos: string[] = []) {
  await db.query(`update pausa.estado set cerrada = $1, permitidos = $2::uuid[] where id = 1`, [
    !open,
    permitidos,
  ])
}

/** La deja como si nunca hubiera existido, esté como esté. */
async function forceRetire() {
  if ((await db.query(`select to_regclass('pausa.estado') as t`)).rows[0].t) await setOpen(true)
  await db.query(`alter role authenticator reset pgrst.db_pre_request`)
  await db.query(`notify pgrst, 'reload config'`)
  for (let i = 0; i < 40; i++) {
    const p = await probe(API, 'service')
    if (p.pausa === null && p.status < 400) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  await db.query('drop schema if exists pausa cascade')
}

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  ctx = await loadSeedContext()
  await forceRetire()
  settingsBefore = await authenticatorSettings()
  seller = await signInAs(USERS.seller1)
  owner = await signInAs(USERS.owner)
}, 60_000)

afterAll(async () => {
  await forceRetire()
  await db.query(`drop function if exists public.${SLEEP_FN}(integer)`)
  expect(await authenticatorSettings()).toBe(settingsBefore)
  await db.end()
}, 60_000)

describe('MP — la pausa de publicación contra la API local', () => {
  it('MP-01: instalada y ABIERTA, la API funciona igual y lo dice', async () => {
    const outcome = await install(db, API)
    expect(outcome.ok, outcome.lines.join('\n')).toBe(true)

    const state = await readState(db, 60)
    expect(state).toMatchObject({ instalada: true, gancho_configurado: true })
    expect(state.pausa).toMatchObject({ cerrada: false, permitidos: [] })

    expect(await probe(API, 'service')).toMatchObject({ status: 200, pausa: 'abierta' })
    const { data, error } = await seller.from('tickets').select('id').limit(1)
    expect(error).toBeNull()
    expect(data).toBeDefined()

    // Nadie de la API lee ni escribe la fila: solo la función, que es SECURITY DEFINER.
    const { rows } = await db.query(`select
        has_table_privilege('anon', 'pausa.estado', 'select') as anon_lee,
        has_table_privilege('authenticated', 'pausa.estado', 'update') as auth_escribe,
        has_table_privilege('service_role', 'pausa.estado', 'update') as servicio_escribe,
        has_function_privilege('anon', 'pausa.comprobar_peticion()', 'execute') as anon_ejecuta,
        has_function_privilege('service_role', 'pausa.comprobar_peticion()', 'execute') as servicio_ejecuta`)
    expect(rows[0]).toEqual({
      anon_lee: false,
      auth_escribe: false,
      servicio_escribe: false,
      anon_ejecuta: true,
      servicio_ejecuta: true,
    })
  })

  it('MP-02: CERRADA, rechaza lecturas, escrituras y RPC de los tres roles sin tocar una fila', async () => {
    const outcome = await close(db, API, CLOSE)
    expect(outcome.ok, outcome.lines.join('\n')).toBe(true)

    const { rows: before } = await db.query(
      `select id, name, updated_at from clients where seller_id = $1 order by id limit 1`,
      [ctx.ids.seller1],
    )
    expect(before, 'el seed tiene clientes de vendedor1').toHaveLength(1)

    // supabase-js, como la aplicación: 423 RIFAS_PAUSA enseguida y sin reintentar.
    const started = Date.now()
    const read = await seller.from('tickets').select('id').limit(1)
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(read.status).toBe(423)
    expect(read.error?.code).toBe('RIFAS_PAUSA')
    expect(read.error?.message).toBe(
      'Estamos actualizando Rifas. Vuelve a intentarlo en unos minutos.',
    )

    const write = await seller
      .from('clients')
      .update({ name: 'Cambiado en la pausa' })
      .eq('id', before[0].id)
    expect(write.error?.code).toBe('RIFAS_PAUSA')
    const rpc = await seller.rpc('search_tickets', { p_search: '1' })
    expect(rpc.error?.code).toBe('RIFAS_PAUSA')

    // La API directa, con las claves: anon y service_role, lectura y RPC.
    expect(await raw('/rest/v1/raffles?select=id&limit=1', LOCAL_ANON_KEY)).toMatchObject({
      status: 423,
      code: 'RIFAS_PAUSA',
    })
    expect(await raw('/rest/v1/raffles?select=id&limit=1', LOCAL_SERVICE_ROLE_KEY)).toMatchObject({
      status: 423,
      code: 'RIFAS_PAUSA',
    })
    expect(
      await raw('/rest/v1/rpc/try_acquire_lottery_sync_lock', LOCAL_SERVICE_ROLE_KEY, {
        method: 'POST',
        body: JSON.stringify({ p_holder: 'prueba-pausa' }),
      }),
    ).toMatchObject({ status: 423, code: 'RIFAS_PAUSA' })

    // Ninguna fila cambió, tampoco el candado del programador.
    const { rows: after } = await db.query(
      `select id, name, updated_at from clients where id = $1`,
      [before[0].id],
    )
    expect(after[0]).toEqual(before[0])
    const { rows: lock } = await db.query(`select holder from lottery_sync_lock`)
    expect(lock.every((l) => l.holder !== 'prueba-pausa')).toBe(true)

    // Supabase Auth no pasa por PostgREST: entrar sigue funcionando (y es lo que
    // permite que la sesión sobreviva a la pausa).
    const again = await signInAs(USERS.seller2)
    expect(again).toBeDefined()
  })

  it('MP-03: un perfil permitido pasa, nadie más, y nadie con el cerrojo en exclusiva', async () => {
    const ownerId = ctx.ids.owner
    expect((await allow(db, { ...CLOSE, command: 'permitir', allowed: [ownerId] })).ok).toBe(true)

    const mine = await owner.from('memberships').select('role').eq('profile_id', ownerId)
    expect(mine.error).toBeNull()
    expect(mine.data).toEqual([{ role: 'owner' }])
    expect((await seller.from('tickets').select('id').limit(1)).error?.code).toBe('RIFAS_PAUSA')
    expect(await raw('/rest/v1/raffles?select=id&limit=1', LOCAL_SERVICE_ROLE_KEY)).toMatchObject({
      status: 423,
    })

    // Quien opera toma el cerrojo en exclusiva (lo que hace mientras drena): ni el permitido entra.
    const operator = new PgClient({ connectionString: DB_URL })
    await operator.connect()
    try {
      await operator.query('select pg_advisory_lock($1, $2)', [...DRAIN_LOCK])
      expect(
        (await owner.from('memberships').select('role').eq('profile_id', ownerId)).error?.code,
      ).toBe('RIFAS_PAUSA')
      await operator.query('select pg_advisory_unlock($1, $2)', [...DRAIN_LOCK])
      expect(
        (await owner.from('memberships').select('role').eq('profile_id', ownerId)).error,
      ).toBeNull()
    } finally {
      await operator.end()
    }

    expect((await allow(db, { ...CLOSE, command: 'permitir', allowed: [] })).ok).toBe(true)
    expect(
      (await owner.from('memberships').select('role').eq('profile_id', ownerId)).error?.code,
    ).toBe('RIFAS_PAUSA')
  })

  it('MP-04: cerrar ESPERA a la petición que ya estaba dentro, y nada nuevo entra', async () => {
    await setOpen(true)
    // Una RPC lenta de verdad, solo para esta prueba (se borra en el afterAll).
    await db.query(`create or replace function public.${SLEEP_FN}(p_ms integer) returns integer
      language sql security invoker set search_path = public, pg_temp
      as $$ select pg_sleep(p_ms / 1000.0); select p_ms $$`)
    await db.query(`revoke all on function public.${SLEEP_FN}(integer) from public`)
    await db.query(`grant execute on function public.${SLEEP_FN}(integer) to anon`)
    await db.query(`notify pgrst, 'reload schema'`)
    for (let i = 0; i < 40; i++) {
      const r = await raw(`/rest/v1/rpc/${SLEEP_FN}`, LOCAL_ANON_KEY, {
        method: 'POST',
        body: JSON.stringify({ p_ms: 0 }),
      })
      if (r.status === 200) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    const slow = raw(`/rest/v1/rpc/${SLEEP_FN}`, LOCAL_ANON_KEY, {
      method: 'POST',
      body: JSON.stringify({ p_ms: 2_500 }),
    })
    await new Promise((resolve) => setTimeout(resolve, 400))
    const started = Date.now()
    const outcome = await close(db, API, CLOSE)
    const elapsed = Date.now() - started

    expect(outcome.ok, outcome.lines.join('\n')).toBe(true)
    // La lenta entró abierta y terminó bien; cerrar no volvió hasta que acabó.
    expect(await slow).toMatchObject({ status: 200 })
    expect(elapsed).toBeGreaterThan(1_500)
    expect(Number(outcome.report.drenaje_ms)).toBeGreaterThan(1_500)
    // Después, nada entra.
    expect(
      await raw(`/rest/v1/rpc/${SLEEP_FN}`, LOCAL_ANON_KEY, {
        method: 'POST',
        body: JSON.stringify({ p_ms: 0 }),
      }),
    ).toMatchObject({ status: 423, code: 'RIFAS_PAUSA' })
  })

  it('MP-05: un turno del programador de loterías, con la pausa cerrada, no escribe nada', async () => {
    // Sigue cerrada desde MP-04. El turno usa la service role, como en Vercel.
    const antes = (
      await db.query(`select
          (select count(*)::int from lottery_sync_runs) as corridas,
          (select coalesce(string_agg(coalesce(holder, '-') || '@' || coalesce(acquired_at::text, '-'), ','), '')
             from lottery_sync_lock) as candado`)
    ).rows[0]
    await expect(runLotterySyncTick({ client: ctx.svc })).rejects.toMatchObject({
      code: 'RIFAS_PAUSA',
    })
    const despues = (
      await db.query(`select
          (select count(*)::int from lottery_sync_runs) as corridas,
          (select coalesce(string_agg(coalesce(holder, '-') || '@' || coalesce(acquired_at::text, '-'), ','), '')
             from lottery_sync_lock) as candado`)
    ).rows[0]
    expect(despues).toEqual(antes)
  })

  it('MP-06: cerrar se niega si un recordatorio de pago vence dentro de la ventana', async () => {
    await setOpen(true)
    // Sin disparadores, para fijar la hora a mano: la prueba es de la pausa, no del motor.
    await db.query('begin')
    await db.query('set local session_replication_role = replica')
    const { rows } = await db.query(
      `insert into seller_payment_reminders (organization_id, seller_id, weekday, time_of_day, next_run_at)
       values ($1, $2, 1, '07:00', now() + interval '20 minutes') returning id`,
      [ctx.demoOrg.id, ctx.ids.seller1],
    )
    await db.query('commit')
    try {
      const outcome = await close(db, API, { ...CLOSE, horizonMinutes: 30 })
      expect(outcome.ok).toBe(false)
      expect(outcome.lines.join('\n')).toContain(
        'recordatorio(s) de pago vencen en los próximos 30 min',
      )
      expect((await readState(db, 30)).pausa).toMatchObject({ cerrada: false })
      expect(await probe(API, 'service')).toMatchObject({ status: 200, pausa: 'abierta' })
    } finally {
      await db.query('delete from seller_payment_reminders where id = $1', [rows[0].id])
    }
  })

  it('MP-07: abrir y retirar devuelven la API y la configuración exactamente como estaban', async () => {
    await setOpen(true)
    expect((await seller.from('tickets').select('id').limit(1)).error).toBeNull()
    expect(await probe(API, 'service')).toMatchObject({ status: 200, pausa: 'abierta' })

    const outcome = await retire(db, API)
    expect(outcome.ok, outcome.lines.join('\n')).toBe(true)
    expect(await probe(API, 'service')).toMatchObject({ status: 200, pausa: null })
    expect((await db.query(`select to_regnamespace('pausa') as n`)).rows[0].n).toBeNull()
    expect(await authenticatorSettings()).toBe(settingsBefore)
    expect((await seller.from('tickets').select('id').limit(1)).error).toBeNull()
  })

  it('MP-08: no pisa otro gancho de PostgREST ni instala nada a medias', async () => {
    // Sin avisar a PostgREST: el valor no llega a usarse.
    await db.query(`alter role authenticator set pgrst.db_pre_request = 'public.otro_gancho'`)
    try {
      await expect(db.query(readFileSync(INSTALL_SQL, 'utf8'))).rejects.toThrow(
        'authenticator ya tiene otro pgrst.db_pre_request',
      )
      await db.query('rollback').catch(() => {})
      expect((await db.query(`select to_regnamespace('pausa') as n`)).rows[0].n).toBeNull()
    } finally {
      await db.query(`alter role authenticator reset pgrst.db_pre_request`)
    }
    expect(await authenticatorSettings()).toBe(settingsBefore)
  })
})
