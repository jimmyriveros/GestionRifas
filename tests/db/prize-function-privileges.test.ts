/**
 * Quién ejecuta cada función de premios configurables (D-207, migración `0066`,
 * I-132).
 *
 * El preflight de la Puerta 1 (2026-09-17) encontró, antes de escribir nada en
 * producción, que el proyecto alojado concede EXECUTE a `service_role` en toda
 * función nueva de `public` y la pila local no: 35 funciones de 0058–0065,
 * casi todas internas, habrían quedado ejecutables por la service role. Esta
 * suite fija la lista exacta —la misma de `scripts/prize-function-grants.ts`,
 * que también usan la `0066` y `verify:remote`— y comprueba que:
 *
 *   P1  el inventario está completo y el EXECUTE efectivo de las 62 funciones es
 *       exactamente el esperado; `verify:remote` pasa y falla si reaparece
 *       cualquiera de los 35 permisos;
 *   P2  ninguna pieza interna se ejecuta directamente —42501—, tampoco con la
 *       service role, y la transición no se ejecuta desde una sesión;
 *   P3  los caminos permitidos siguen funcionando: las seis RPC del panel con
 *       una sesión, el motor por `confirm_lottery_result` y la vista previa y la
 *       aplicación de la transición con la service role;
 *   P4  ningún rol recibe permisos implícitos de más sobre las tablas nuevas.
 *
 * Las rifas y sorteos de esta suite viven en 2091 y se borran al final.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { TransitionPrizePayload, TransitionResult } from '@/features/raffle-prizes/transition'
import type { Json } from '@/types/database.types'

import {
  PREFLIGHT_SERVICE_ROLE_FINDING,
  PRIZE_D198_PROJECTIONS,
  PRIZE_FUNCTION_CHECKS,
  PRIZE_FUNCTION_GRANTS,
  PRIZE_INTERNAL_FUNCTIONS,
  PRIZE_SERVICE_ROLE_ENTRIES,
  PRIZE_SESSION_RPCS,
} from '../../scripts/prize-function-grants'
import {
  anonClient,
  DB_URL,
  loadSeedContext,
  randomNumbers,
  serviceClient,
  signInAs,
  USERS,
  type Client,
} from './helpers'

const PREFIJO = 'P1 privilegios'
const SORTEO = 'P1PRIV-'
const stamp = Date.now().toString(36)
const REDEFINIDAS = [
  'admin_audit_log(text,uuid,integer,integer)',
  'admin_audit_redact(text,jsonb)',
  'confirm_lottery_result(lottery_code,text,text,text,text,text,text,jsonb,date,timestamp with time zone,timestamp with time zone)',
  'match_lottery_result(uuid)',
]

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient
let owner: Client
let svc: Client
let anon: Client

const nombreDe = (firma: string) => firma.slice(0, firma.indexOf('('))

/** `select public.f(null::t1, null::t2, …)` para una firma de regprocedure. */
function llamadaConNulos(firma: string): string {
  const tipos = firma.slice(firma.indexOf('(') + 1, -1)
  const argumentos = tipos === '' ? [] : tipos.split(',').map((t) => `null::${t}`)
  return `select public.${nombreDe(firma)}(${argumentos.join(', ')})`
}

/** Ejecuta `sql` con el rol indicado y devuelve el SQLSTATE, o null si no falló. */
async function codigoComo(rol: 'anon' | 'authenticated' | 'service_role', sql: string): Promise<string | null> {
  await db.query('begin')
  try {
    await db.query(`set local role ${rol}`)
    await db.query(sql)
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? 'desconocido'
  } finally {
    await db.query('rollback')
  }
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + days, 12)).toISOString().slice(0, 10)
}

function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y!, m! - 1, d!, 12)).getUTCDay()
  return day === 0 ? 7 : day
}

function lunesDesde(date: string): string {
  let d = date
  while (isoWeekday(d) !== 1) d = addDays(d, 1)
  return d
}

function unDia(fecha: string) {
  return {
    start_date: fecha,
    end_date: fecha,
    weekdays: [isoWeekday(fecha)],
    lottery_mode: 'corresponding' as const,
    lottery_code: null,
  }
}

async function nuevaRifa(nombre: string, desde: string, hasta: string, modo: 'legacy' | 'configurable') {
  const { rows } = await db.query<{ id: string; name: string }>(
    `insert into raffles (organization_id, name, ticket_price, start_date, end_date, created_by, prize_mode)
     values ($1, $2, 120000, $3, $4, $5, $6)
     returning id, name`,
    [ctx.demoOrg.id, `${PREFIJO} ${nombre} ${stamp}`, desde, hasta, ctx.ids.owner, modo],
  )
  return rows[0]!
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  owner = await signInAs(USERS.owner)
  svc = serviceClient()
  anon = anonClient()
})

afterAll(async () => {
  await db.query('begin')
  try {
    await db.query(`set local session_replication_role = replica`)
    const { rows: rifas } = await db.query<{ id: string }>(`select id from raffles where name like $1`, [
      `${PREFIJO} %`,
    ])
    const { rows: sorteos } = await db.query<{ id: string }>(
      `select id from lottery_draw_schedules where draw_number like $1`,
      [`${SORTEO}%`],
    )
    const rifaIds = rifas.map((r) => r.id)
    const sorteoIds = sorteos.map((s) => s.id)
    await db.query(
      `delete from lottery_ticket_match_prizes where raffle_id = any ($1::uuid[])
          or result_id in (select id from lottery_results where schedule_id = any ($2::uuid[]))`,
      [rifaIds, sorteoIds],
    )
    await db.query(
      `delete from lottery_ticket_matches where raffle_id = any ($1::uuid[])
          or result_id in (select id from lottery_results where schedule_id = any ($2::uuid[]))`,
      [rifaIds, sorteoIds],
    )
    await db.query(
      `delete from notifications
        where entity_id in (select id from lottery_results where schedule_id = any ($2::uuid[]))
           or entity_id in (select id from tickets where raffle_id = any ($1::uuid[]))
           or entity_id in (select id from raffle_prize_transitions where raffle_id = any ($1::uuid[]))
           or (kind = 'raffle_prize.changed' and (data ->> 'raffle_id')::uuid = any ($1::uuid[]))`,
      [rifaIds, sorteoIds],
    )
    await db.query(`delete from lottery_results where schedule_id = any ($1::uuid[])`, [sorteoIds])
    await db.query(`delete from lottery_draw_schedules where id = any ($1::uuid[])`, [sorteoIds])
    await db.query(
      `delete from audit_logs
        where entity_id in (select id from tickets where raffle_id = any ($1::uuid[]))
           or entity_id = any ($1::uuid[])
           or entity_id in (select id from raffle_prize_transitions where raffle_id = any ($1::uuid[]))
           or (entity_type = 'raffle_prize'
               and (coalesce(new_values, old_values) ->> 'raffle_id')::uuid = any ($1::uuid[]))`,
      [rifaIds],
    )
    await db.query(`delete from commission_ledger where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(`delete from seller_commissions where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(`delete from tickets where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(
      `delete from raffle_prize_reward_options where version_id in (
         select id from raffle_prize_versions where raffle_id = any ($1::uuid[]))`,
      [rifaIds],
    )
    await db.query(
      `delete from raffle_prize_schedule_rules where version_id in (
         select id from raffle_prize_versions where raffle_id = any ($1::uuid[]))`,
      [rifaIds],
    )
    await db.query(`delete from raffle_prize_transitions where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(`delete from raffle_prizes where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(`delete from raffle_prize_versions where raffle_id = any ($1::uuid[])`, [rifaIds])
    await db.query(`delete from raffles where id = any ($1::uuid[])`, [rifaIds])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  } finally {
    await db.end()
  }
})

// =============================================================================
describe('P1 — la lista exacta (0066)', () => {
  it('P1-01: toda función que crean o redefinen 0058–0065 está clasificada, y ninguna más', async () => {
    const carpeta = join(process.cwd(), 'supabase', 'migrations')
    const nombres = new Set<string>()
    for (const archivo of readdirSync(carpeta).filter((f) => /^00(5[89]|6[0-5])_/.test(f))) {
      const sql = readFileSync(join(carpeta, archivo), 'utf8').replace(/--.*$/gm, '')
      for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
        nombres.add(m[1]!.toLowerCase())
      }
    }
    // Las que las propias migraciones retiraron ya no existen.
    const { rows: existentes } = await db.query<{ firma: string }>(
      `select p.oid::regprocedure::text as firma from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = any ($1)
        order by 1`,
      [[...nombres]],
    )
    const clasificadas = PRIZE_FUNCTION_GRANTS.map((f) => f.signature).sort()
    expect(existentes.map((r) => r.firma)).toEqual(clasificadas)
    expect(clasificadas).toHaveLength(62)
    expect(PRIZE_INTERNAL_FUNCTIONS).toHaveLength(53)
  })

  it('P1-02: el EXECUTE efectivo de las 62, rol por rol, es exactamente el de la lista', async () => {
    const { rows } = await db.query<{
      firma: string
      public: boolean
      anon: boolean
      authenticated: boolean
      service_role: boolean
    }>(
      `select f.firma,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
         from unnest($1::text[]) as f(firma)
         join pg_proc p on p.oid = to_regprocedure('public.' || f.firma)
        order by f.firma`,
      [PRIZE_FUNCTION_GRANTS.map((f) => f.signature)],
    )
    expect(rows).toHaveLength(62)
    const esperado = Object.fromEntries(PRIZE_FUNCTION_GRANTS.map((f) => [f.signature, f.expected]))
    for (const { firma, ...real } of rows) expect(real, firma).toEqual(esperado[firma])
  })

  it('P1-03: la service role ejecuta exactamente sus dos entradas, y de las funciones NUEVAS solo la transición', async () => {
    const { rows } = await db.query<{ firma: string; nueva: boolean }>(
      `select f.firma, not (f.firma = any ($2::text[])) as nueva
         from unnest($1::text[]) as f(firma)
        where has_function_privilege('service_role', to_regprocedure('public.' || f.firma), 'EXECUTE')
        order by f.firma`,
      [PRIZE_FUNCTION_GRANTS.map((f) => f.signature), REDEFINIDAS],
    )
    expect(rows.map((r) => r.firma)).toEqual([...PRIZE_D198_PROJECTIONS, ...PRIZE_SERVICE_ROLE_ENTRIES].sort())
    expect(rows.filter((r) => r.nueva).map((r) => r.firma)).toEqual([
      'transition_raffle_prize_mode(uuid,uuid,text,raffle_status,date,date,jsonb,boolean)',
    ])
    // Y una sesión, exactamente las seis del panel y la proyección de D-198.
    const { rows: sesion } = await db.query<{ firma: string }>(
      `select f.firma from unnest($1::text[]) as f(firma)
        where has_function_privilege('authenticated', to_regprocedure('public.' || f.firma), 'EXECUTE')
        order by f.firma`,
      [PRIZE_FUNCTION_GRANTS.map((f) => f.signature)],
    )
    expect(sesion.map((r) => r.firma)).toEqual([...PRIZE_SESSION_RPCS, ...PRIZE_D198_PROJECTIONS].sort())
  })

  it('P1-04: las comprobaciones de verify:remote de la 0066 pasan en local', async () => {
    for (const check of PRIZE_FUNCTION_CHECKS) {
      const { rows } = await db.query<{ x: string }>(check.sql)
      expect(rows.map((r) => r.x), check.nombre).toHaveLength(check.esperado)
    }
  })

  it('P1-05: y fallan si reaparece CUALQUIERA de los 35 permisos del preflight', async () => {
    expect(PREFLIGHT_SERVICE_ROLE_FINDING).toHaveLength(35)
    const [exacta, hallazgo] = PRIZE_FUNCTION_CHECKS
    for (const firma of PREFLIGHT_SERVICE_ROLE_FINDING) {
      await db.query('begin')
      try {
        await db.query(`grant execute on function public.${firma} to service_role`)
        const { rows: a } = await db.query<{ x: string }>(exacta!.sql)
        const { rows: b } = await db.query<{ x: string }>(hallazgo!.sql)
        expect(a.map((r) => r.x), firma).toEqual([`${firma} -> service_role=true`])
        expect(b.map((r) => r.x), firma).toEqual([firma])
      } finally {
        await db.query('rollback')
      }
    }
  })
})

// =============================================================================
describe('P2 — nadie ejecuta las piezas internas directamente', () => {
  it('P2-01: la service role no ejecuta raffle_prize_insert_version (42501)', async () => {
    const firma = PRIZE_INTERNAL_FUNCTIONS.find((f) => f.startsWith('raffle_prize_insert_version('))!
    expect(await codigoComo('service_role', llamadaConNulos(firma))).toBe('42501')
  })

  it('P2-02: raffle_prize_notify tampoco, ni por PostgreSQL ni por la API con la service role', async () => {
    const firma = PRIZE_INTERNAL_FUNCTIONS.find((f) => f.startsWith('raffle_prize_notify('))!
    expect(await codigoComo('service_role', llamadaConNulos(firma))).toBe('42501')

    const { error } = await svc.rpc('raffle_prize_notify' as never, {
      p_organization_id: ctx.demoOrg.id,
      p_raffle_id: ctx.demoRaffle.id,
      p_raffle_name: 'no',
      p_prize_id: ctx.demoRaffle.id,
      p_version_id: ctx.demoRaffle.id,
      p_version_number: 1,
      p_title: 'no',
      p_change: 'updated',
      p_actor: ctx.ids.owner,
    } as never)
    expect(error?.code).toBe('42501')
  })

  it('P2-03: ninguna de las 53 internas se ejecuta directamente como anon, authenticated ni service_role', async () => {
    const fallos: string[] = []
    for (const firma of PRIZE_INTERNAL_FUNCTIONS) {
      for (const rol of ['anon', 'authenticated', 'service_role'] as const) {
        const codigo = await codigoComo(rol, llamadaConNulos(firma))
        if (codigo !== '42501') fallos.push(`${rol} ${firma}: ${codigo}`)
      }
    }
    expect(fallos).toEqual([])
  })

  it('P2-04: transition_raffle_prize_mode solo la ejecuta la service role', async () => {
    const firma = PRIZE_SERVICE_ROLE_ENTRIES[0]
    expect(await codigoComo('authenticated', llamadaConNulos(firma))).toBe('42501')
    expect(await codigoComo('anon', llamadaConNulos(firma))).toBe('42501')

    const argumentos = {
      p_organization_id: ctx.demoOrg.id,
      p_raffle_id: ctx.demoRaffle.id,
      p_expected_name: ctx.demoRaffle.name,
      p_expected_status: 'active' as const,
      p_expected_start_date: '2026-01-01',
      p_expected_end_date: '2026-12-31',
      p_prizes: [] as unknown as Json,
      p_apply: false,
    }
    for (const cliente of [owner, anon]) {
      const { error } = await cliente.rpc('transition_raffle_prize_mode', argumentos)
      expect(error?.code).toBe('42501')
    }
  })

  it('P2-05: las seis RPC del panel y el motor no se ejecutan con la service role', async () => {
    for (const firma of PRIZE_SESSION_RPCS) {
      expect(await codigoComo('service_role', llamadaConNulos(firma)), firma).toBe('42501')
    }
    const motor = PRIZE_INTERNAL_FUNCTIONS.find((f) => f.startsWith('match_lottery_result('))!
    expect(await codigoComo('service_role', llamadaConNulos(motor))).toBe('42501')
    const { error } = await svc.rpc('match_lottery_result', { p_result_id: ctx.demoRaffle.id })
    expect(error?.code).toBe('42501')
  })
})

// =============================================================================
describe('P3 — los caminos permitidos siguen funcionando', () => {
  it('P3-01: las seis RPC del panel, con la sesión del Dueño', async () => {
    const lunes = lunesDesde('2091-03-01')
    const rifa = await nuevaRifa('panel', lunes, addDays(lunes, 27), 'configurable')
    const crear = (titulo: string, dia: string) =>
      owner.rpc('create_raffle_prize', {
        p_raffle_id: rifa.id,
        p_title: titulo,
        p_category: 'daily',
        p_reward_mode: 'fixed',
        p_reward_options: [{ description: null, amount: 500_000 }],
        p_number_field: 'daily_number',
        p_rules: [unDia(dia)],
      })

    const primero = await crear('Premio uno', addDays(lunes, 1))
    expect(primero.error).toBeNull()
    const segundo = await crear('Premio dos', addDays(lunes, 2))
    expect(segundo.error).toBeNull()
    const uno = (primero.data as unknown as { prize_id: string; version_id: string }[])[0]!
    const dos = (segundo.data as unknown as { prize_id: string; version_id: string }[])[0]!

    const publicar = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: uno.prize_id,
      p_expected_version_id: uno.version_id,
      p_title: 'Premio uno, corregido',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: [{ description: null, amount: 600_000 }],
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [unDia(addDays(lunes, 1))],
    })
    expect(publicar.error).toBeNull()

    const historial = await owner.rpc('raffle_prize_history', { p_prize_id: uno.prize_id, p_limit: 10, p_offset: 0 })
    expect(historial.error).toBeNull()
    expect((historial.data as unknown[]).length).toBeGreaterThanOrEqual(2)

    const reordenar = await owner.rpc('reorder_raffle_prizes', {
      p_raffle_id: rifa.id,
      p_prize_ids: [dos.prize_id, uno.prize_id],
    })
    expect(reordenar.error).toBeNull()

    const archivar = await owner.rpc('archive_raffle_prize', {
      p_prize_id: dos.prize_id,
      p_expected_version_id: dos.version_id,
    })
    expect(archivar.error).toBeNull()

    const { rows } = await db.query<{ current_version_id: string; status: string }>(
      `select current_version_id, status::text as status from raffle_prizes where id = $1`,
      [dos.prize_id],
    )
    expect(rows[0]!.status).toBe('archived')
    const restaurar = await owner.rpc('restore_raffle_prize', {
      p_prize_id: dos.prize_id,
      p_expected_version_id: rows[0]!.current_version_id,
    })
    expect(restaurar.error).toBeNull()
    const { rows: final } = await db.query<{ status: string }>(
      `select status::text as status from raffle_prizes where id = $1`,
      [dos.prize_id],
    )
    expect(final[0]!.status).toBe('active')

    // Y la misma RPC con la service role no entra.
    const { error } = await svc.rpc('raffle_prize_history', { p_prize_id: uno.prize_id, p_limit: 1, p_offset: 0 })
    expect(error?.code).toBe('42501')
  })

  it('P3-02: confirm_lottery_result con la service role confirma y corre el motor, que sigue sin ser ejecutable', async () => {
    const lunes = lunesDesde('2091-05-01')
    const fecha = addDays(lunes, 2) // miércoles: Meta
    const rifa = await nuevaRifa('heredada motor', lunes, addDays(lunes, 6), 'legacy')
    await db.query(`update raffles set status = 'active' where id = $1`, [rifa.id])

    const { daily, weekly } = randomNumbers()
    const { rows: boleta } = await db.query<{ id: string }>(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, weekly_number,
                            inventory_status, created_at)
       values ($1, $2, $3, $4, $5, $6, 'available', '2026-01-01T08:00:00-05:00')
       returning id`,
      [ctx.demoOrg.id, rifa.id, ctx.ids.seller1, ctx.ids.owner, daily, weekly],
    )
    await db.query(
      `update tickets set client_id = $2, inventory_status = 'assigned', sale_price = 120000,
              sale_date = '2026-01-02', assigned_at = '2026-01-02T08:00:00-05:00'
        where id = $1`,
      [boleta[0]!.id, ctx.clients.ana.id],
    )

    const drawNumber = `${SORTEO}${stamp}`
    await db.query(
      `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                           original_scheduled_at, official_scheduled_at, schedule_status)
       values ('meta', $1, $2, $3, $3, 'scheduled')`,
      [drawNumber, fecha, `${fecha}T22:30:00-05:00`],
    )

    const { data, error } = await svc.rpc('confirm_lottery_result', {
      p_lottery_code: 'meta',
      p_draw_number: drawNumber,
      p_winning_number: daily,
    })
    expect(error).toBeNull()
    const resultId = (data as unknown as { result_id: string }).result_id

    const { rows: coincidencias } = await db.query<{ n: number }>(
      `select count(*)::int as n from lottery_ticket_matches where result_id = $1 and ticket_id = $2`,
      [resultId, boleta[0]!.id],
    )
    expect(coincidencias[0]!.n).toBe(1)

    const motor = await svc.rpc('match_lottery_result', { p_result_id: resultId })
    expect(motor.error?.code).toBe('42501')
  })

  it('P3-03: la transición con la service role: vista previa y aplicación', async () => {
    const lunes = lunesDesde('2091-07-01')
    const dia = addDays(lunes, 3)
    const rifa = await nuevaRifa('transición', lunes, addDays(lunes, 13), 'legacy')
    await db.query(`update raffles set status = 'active' where id = $1`, [rifa.id])
    const premio: TransitionPrizePayload = {
      title: 'Premio de un día',
      category: 'daily',
      reward_mode: 'fixed',
      reward_options: [{ description: null, amount: 500_000 }],
      number_field: 'daily_number',
      digits: 'four',
      rules: [unDia(dia)],
      conditions: null,
    }
    const argumentos = (apply: boolean) => ({
      p_organization_id: ctx.demoOrg.id,
      p_raffle_id: rifa.id,
      p_expected_name: rifa.name,
      p_expected_status: 'active' as const,
      p_expected_start_date: lunes,
      p_expected_end_date: addDays(lunes, 13),
      p_prizes: [premio] as unknown as Json,
      p_apply: apply,
    })

    const vista = await svc.rpc('transition_raffle_prize_mode', argumentos(false))
    expect(vista.error).toBeNull()
    expect(vista.data as unknown as TransitionResult).toMatchObject({ applied: false, transition_id: null })
    const { rows: antes } = await db.query<{ modo: string }>(`select prize_mode::text as modo from raffles where id = $1`, [rifa.id])
    expect(antes[0]!.modo).toBe('legacy')

    const aplicada = await svc.rpc('transition_raffle_prize_mode', argumentos(true))
    expect(aplicada.error).toBeNull()
    expect((aplicada.data as unknown as TransitionResult).applied).toBe(true)
    const { rows: despues } = await db.query<{ modo: string; premios: number; transiciones: number }>(
      `select r.prize_mode::text as modo,
              (select count(*)::int from raffle_prizes where raffle_id = r.id) as premios,
              (select count(*)::int from raffle_prize_transitions where raffle_id = r.id) as transiciones
         from raffles r where r.id = $1`,
      [rifa.id],
    )
    expect(despues[0]).toEqual({ modo: 'configurable', premios: 1, transiciones: 1 })
  })
})

// =============================================================================
describe('P4 — sin permisos implícitos de más', () => {
  it('P4-01: las seis tablas de la entrega conceden exactamente lo que dicen sus migraciones', async () => {
    const { rows } = await db.query<{ tabla: string; rol: string; privilegio: string }>(
      `select table_name as tabla, grantee as rol, privilege_type as privilegio
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('raffle_prizes', 'raffle_prize_versions', 'raffle_prize_schedule_rules',
                             'raffle_prize_reward_options', 'lottery_ticket_match_prizes', 'raffle_prize_transitions')
          and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
        order by 1, 2, 3`,
    )
    expect(rows.map((r) => `${r.tabla} ${r.rol} ${r.privilegio}`)).toEqual([
      'lottery_ticket_match_prizes authenticated SELECT',
      'lottery_ticket_match_prizes service_role SELECT',
      'raffle_prize_reward_options authenticated SELECT',
      'raffle_prize_reward_options service_role INSERT',
      'raffle_prize_reward_options service_role SELECT',
      'raffle_prize_schedule_rules authenticated SELECT',
      'raffle_prize_schedule_rules service_role INSERT',
      'raffle_prize_schedule_rules service_role SELECT',
      'raffle_prize_versions authenticated SELECT',
      'raffle_prize_versions service_role INSERT',
      'raffle_prize_versions service_role SELECT',
      'raffle_prizes authenticated SELECT',
      'raffle_prizes service_role INSERT',
      'raffle_prizes service_role SELECT',
      'raffle_prizes service_role UPDATE',
    ])
  })

  it('P4-02: ninguna función de la entrega queda con EXECUTE para PUBLIC ni para anon', async () => {
    const { rows } = await db.query<{ firma: string }>(
      `select f.firma from unnest($1::text[]) as f(firma)
        where has_function_privilege('anon', to_regprocedure('public.' || f.firma), 'EXECUTE')
           or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where p.oid = to_regprocedure('public.' || f.firma) and a.grantee = 0
                         and a.privilege_type = 'EXECUTE')`,
      [PRIZE_FUNCTION_GRANTS.map((f) => f.signature)],
    )
    expect(rows).toEqual([])
  })
})
