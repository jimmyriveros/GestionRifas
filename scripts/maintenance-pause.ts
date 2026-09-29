/**
 * PAUSA DE PUBLICACIÓN — D-239, `RUNBOOK` §10.
 *
 *   npx tsx scripts/maintenance-pause.ts <orden> (--local | --production --project-ref <ref>) [opciones]
 *
 *   estado                        Solo lectura: si está instalada y ACTÚA (PostgREST recargó el gancho),
 *                                 si está cerrada, a quién deja pasar, las peticiones en curso, los
 *                                 recordatorios que vencen pronto y el candado del sincronizador.
 *   instalar                      `supabase/maintenance/pausa.sql` —ABIERTA— y espera a que PostgREST
 *                                 la use. Si no llega a usarla, lo dice: cerrarla no protegería nada.
 *   cerrar [--horizonte <min>]    Cierra, DRENA —espera a que termine cada petición que ya estaba
 *          [--espera <s>]         dentro— y comprueba que la API responde 423 a `anon` y a
 *                                 `service_role`. Se niega si un recordatorio de pago vence en los
 *                                 próximos <min> minutos (60): ese proceso corre dentro de la base y
 *                                 la pausa no lo detiene.
 *   permitir <uuid>[,<uuid>…]     Con la pausa cerrada, los perfiles que pueden usar la aplicación
 *   permitir --ninguno            —el Dueño que comprueba—. Reemplaza la lista.
 *   abrir --migracion <v>         Comprueba que la última migración aplicada es <v>, que <sha> trae
 *         --commit <sha>          esa misma migración como la última —código y base son PAREJA: el
 *         [--sitio <url>]         puente no abre sobre la `0079`— y que el sitio sirve el build de
 *                                 <sha> (`DEPLOYMENT` §6.1). Solo entonces abre.
 *   retirar                       Con la pausa abierta: quita el gancho, espera a que PostgREST
 *                                 recargue y borra el esquema `pausa`.
 *
 * QUÉ CUBRE Y QUÉ NO. La pausa vive en PostgREST: cubre toda petición a la API de
 * datos —la aplicación, quien llame a la API por su cuenta con su sesión, el
 * catálogo público, el programador de loterías y el despachador de avisos, que
 * usan `service_role`—. No cubre la conexión directa de quien opera —a propósito:
 * es por donde se migra, se verifica y se recupera—, ni `pg_cron` —por eso
 * `cerrar` exige que ningún recordatorio venza en la ventana—, ni Supabase Auth,
 * que no toca `public` salvo al crear una cuenta, y crear cuentas pasa por la API.
 *
 * Nunca imprime la cadena de conexión ni una clave. Cada orden deja un informe en
 * `build/gate/`. Termina en 0 si hizo lo pedido, en 2 si se negó o la comprobación
 * falló (la pausa queda como estaba o CERRADA, nunca abierta a medias) y en 1 si la
 * orden no se entiende.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Client } from 'pg'

import { cronHours } from './gate-diff'
import {
  connectionStringFor,
  fileStamp,
  GateArgsError,
  gateTarget,
  gateTargetLabel,
  parseArgs,
  runGateTool,
  writeGateFile,
  type GateTarget,
} from './gate-db'

const USAGE =
  'Uso: npx tsx scripts/maintenance-pause.ts <estado|instalar|cerrar|permitir|abrir|retirar> ' +
  '(--local | --production --project-ref <ref>) [--horizonte <min>] [--espera <s>] ' +
  '[--migracion <v>] [--commit <sha>] [--sitio <url>] [--ninguno] [<uuid>[,<uuid>…]]'

export const COMMANDS = ['estado', 'instalar', 'cerrar', 'permitir', 'abrir', 'retirar'] as const
export type Command = (typeof COMMANDS)[number]

/** El cerrojo del drenaje: el mismo par que toma `pausa.comprobar_peticion()`. */
export const DRAIN_LOCK = [8675320, 1] as const

export const INSTALL_SQL = path.join('supabase', 'maintenance', 'pausa.sql')
export const RETIRE_SQL = path.join('supabase', 'maintenance', 'pausa_retirar.sql')

/** Una petición de sonda que no lee datos: `limit=0`. */
export const PROBE_PATH = '/rest/v1/organizations?select=id&limit=0'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIGRATION = /^\d{4}$/
const COMMIT = /^[0-9a-f]{40}$/

export type Options = {
  command: Command
  target: GateTarget
  horizonMinutes: number
  drainSeconds: number
  migration: string | null
  commit: string | null
  site: string | null
  allowed: string[]
}

/** La orden, comprobada entera antes de conectar nada. */
export function parseOptions(argv: readonly string[]): Options {
  const parsed = parseArgs(argv, {
    switches: ['--ninguno'],
    valued: ['--horizonte', '--espera', '--migracion', '--commit', '--sitio'],
    positional: 2,
  })
  const [command, extra] = parsed.positional
  if (!command || !(COMMANDS as readonly string[]).includes(command)) {
    throw new GateArgsError(`Indica una orden: ${COMMANDS.join(', ')}.`)
  }
  const target = gateTarget(parsed)
  const only = (flag: string, allowedFor: readonly Command[]) => {
    if (
      (parsed.values.has(flag) || parsed.switches.has(flag)) &&
      !allowedFor.includes(command as Command)
    ) {
      throw new GateArgsError(`${flag} no se usa con «${command}».`)
    }
  }
  only('--horizonte', ['cerrar'])
  only('--espera', ['cerrar'])
  only('--migracion', ['abrir'])
  only('--commit', ['abrir'])
  only('--sitio', ['abrir'])
  only('--ninguno', ['permitir'])

  const positiveInt = (flag: string, fallback: number, max: number) => {
    const raw = parsed.values.get(flag)
    if (raw === undefined) return fallback
    if (!/^\d+$/.test(raw) || Number(raw) > max) {
      throw new GateArgsError(`${flag} es un número entero entre 0 y ${max}.`)
    }
    return Number(raw)
  }

  let allowed: string[] = []
  if (command === 'permitir') {
    const none = parsed.switches.has('--ninguno')
    if (none === (extra !== undefined)) {
      throw new GateArgsError('«permitir» lleva los perfiles separados por comas, o --ninguno.')
    }
    if (extra !== undefined) {
      allowed = extra.split(',').map((id) => id.trim().toLowerCase())
      if (allowed.length === 0 || allowed.some((id) => !UUID.test(id))) {
        throw new GateArgsError('Cada perfil de «permitir» es un identificador (uuid) completo.')
      }
      allowed = [...new Set(allowed)]
    }
  } else if (extra !== undefined) {
    throw new GateArgsError(`No reconozco «${extra}». Una opción mal escrita no se ignora.`)
  }

  const migration = parsed.values.get('--migracion') ?? null
  const commit = parsed.values.get('--commit')?.toLowerCase() ?? null
  if (command === 'abrir') {
    if (migration === null || !MIGRATION.test(migration)) {
      throw new GateArgsError(
        '«abrir» exige --migracion con la última migración esperada (4 cifras).',
      )
    }
    if (commit === null || !COMMIT.test(commit)) {
      throw new GateArgsError(
        '«abrir» exige --commit con el commit servido, completo (40 caracteres).',
      )
    }
  }
  const site = parsed.values.get('--sitio') ?? null
  if (site !== null && !/^https?:\/\/[^/]+$/.test(site)) {
    throw new GateArgsError('--sitio es el origen del sitio, sin ruta: https://ejemplo.vercel.app')
  }

  return {
    command: command as Command,
    target,
    horizonMinutes: positiveInt('--horizonte', 60, 1440),
    drainSeconds: positiveInt('--espera', 30, 600),
    migration,
    commit,
    site,
    allowed,
  }
}

/** El identificador de versión que inyecta `next.config.ts`: sha256 del commit, 12 cifras. */
export function buildIdFor(commit: string): string {
  return createHash('sha256').update(commit).digest('hex').slice(0, 12)
}

/**
 * La última migración que trae un commit: la que su código espera encontrar en la
 * base. Es lo que hace que «código y base» sean una PAREJA y no dos comprobaciones
 * sueltas: el puente trae hasta la `0077` y no puede abrirse sobre la `0079`.
 */
export function latestMigrationInTree(listing: string): string | null {
  const versions = listing
    .split(/\r?\n/)
    .map((line) => /(?:^|\/)(\d{4})_[^/]*\.sql$/.exec(line.trim())?.[1])
    .filter((version): version is string => version !== undefined)
    .sort()
  return versions.at(-1) ?? null
}

function latestMigrationOfCommit(commit: string): string | null {
  const listing = execFileSync('git', ['ls-tree', '--name-only', commit, 'supabase/migrations/'], {
    encoding: 'utf8',
  })
  return latestMigrationInTree(listing)
}

/** Las horas UTC del programador de loterías (`vercel.json`). */
export function lotteryCronHours(): Set<number> {
  return cronHours(readFileSync('vercel.json', 'utf8'))
}

// -----------------------------------------------------------------------------
// La API: dónde está y qué responde
// -----------------------------------------------------------------------------

export type ApiTarget = { url: string; anonKey: string; serviceKey: string; site: string }

async function apiTargetFor(target: GateTarget, site: string | null): Promise<ApiTarget> {
  if (target.kind === 'local') {
    // Las claves locales son públicas y viven en `supabase-target.ts`.
    const { resolveTarget } = await import('./supabase-target')
    const local = resolveTarget(['--local'], {})
    return {
      url: local.url,
      anonKey: local.anonKey,
      serviceKey: local.serviceRoleKey,
      site: site ?? 'http://localhost:3000',
    }
  }
  // `connectionStringFor` ya cargó `.env.local` y comprobó el proyecto de la base.
  connectionStringFor(target)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const siteUrl = site ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''
  if (!url || !anonKey || !serviceKey || !siteUrl) {
    throw new GateArgsError(
      'Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SITE_URL en .env.local.',
    )
  }
  if (new URL(url).hostname !== `${target.projectRef}.supabase.co`) {
    throw new GateArgsError(
      'NEXT_PUBLIC_SUPABASE_URL no es la API de --project-ref: no es el proyecto esperado. No se conectó nada.',
    )
  }
  return { url, anonKey, serviceKey, site: siteUrl.replace(/\/$/, '') }
}

export type Probe = { status: number; pausa: string | null; code: string | null }

/** Una petición de sonda como `anon` o como `service_role`. No lee ninguna fila. */
export async function probe(api: ApiTarget, as: 'anon' | 'service'): Promise<Probe> {
  const key = as === 'anon' ? api.anonKey : api.serviceKey
  const headers: Record<string, string> = { apikey: key, Accept: 'application/json' }
  // Las claves antiguas son JWT y van también como portador; las nuevas, solo como `apikey`.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  const response = await fetch(`${api.url}${PROBE_PATH}`, { headers, cache: 'no-store' })
  const text = await response.text()
  let code: string | null = null
  try {
    code = (JSON.parse(text) as { code?: string }).code ?? null
  } catch {
    code = null
  }
  return { status: response.status, pausa: response.headers.get('x-rifas-pausa'), code }
}

/** ¿La sonda dice que la pausa está cerrada y actuando? */
export function probeShowsClosed(p: Probe): boolean {
  return p.status === 423 && p.code === 'RIFAS_PAUSA'
}

/** Repite la sonda hasta que se cumpla `done`, como mucho `seconds`. */
async function probeUntil(
  api: ApiTarget,
  as: 'anon' | 'service',
  done: (p: Probe) => boolean,
  seconds: number,
): Promise<{ ok: boolean; last: Probe; waitedMs: number }> {
  const started = Date.now()
  let last = await probe(api, as)
  while (!done(last) && Date.now() - started < seconds * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    last = await probe(api, as)
  }
  return { ok: done(last), last, waitedMs: Date.now() - started }
}

/**
 * ¿El sitio sirve el build de este commit? El método de `DEPLOYMENT` §6.1: se
 * descarga `/login`, se leen sus fragmentos de `/_next/` y se busca el identificador.
 */
export async function siteServesBuild(
  site: string,
  buildId: string,
): Promise<{ found: boolean; chunks: number }> {
  const html = await (await fetch(`${site}/login`, { cache: 'no-store' })).text()
  const sources = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="(\/_next\/[^"]+?\.js(?:\?[^"]*)?)"/g)].map((m) =>
        m[1]!.replace(/&amp;/g, '&'),
      ),
    ),
  ]
  for (const source of sources) {
    const body = await (await fetch(`${site}${source}`, { cache: 'no-store' })).text()
    if (body.includes(buildId)) return { found: true, chunks: sources.length }
  }
  return { found: false, chunks: sources.length }
}

// -----------------------------------------------------------------------------
// La base
// -----------------------------------------------------------------------------

type Row = Record<string, unknown>

async function connect(target: GateTarget): Promise<Client> {
  const client = new Client({
    connectionString: connectionStringFor(target),
    ssl: target.kind === 'production' ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()
  await client.query(`set statement_timeout = '120s'`)
  return client
}

/** Lo que se sabe de la pausa y de su entorno, en SOLO LECTURA. */
export const STATE_SQL = `
  select
    to_regclass('pausa.estado') is not null as instalada,
    exists (
      select 1 from pg_db_role_setting s cross join lateral unnest(s.setconfig) as c(valor)
       where s.setrole = 'authenticator'::regrole and c.valor = 'pgrst.db_pre_request=pausa.comprobar_peticion'
    ) as gancho_configurado,
    (select string_agg(c.valor, ', ') from pg_db_role_setting s cross join lateral unnest(s.setconfig) as c(valor)
      where s.setrole = 'authenticator'::regrole and c.valor like 'pgrst.%') as configuracion_pgrst,
    (select max(version) from supabase_migrations.schema_migrations) as ultima_migracion,
    (select count(*)::int from pg_stat_activity
      where usename = 'authenticator' and xact_start is not null and pid <> pg_backend_pid()) as peticiones_en_curso,
    (select holder from lottery_sync_lock limit 1) as candado_sincronizador,
    now() as ahora`

const PAUSE_ROW_SQL = `select cerrada, permitidos::text[] as permitidos, motivo, cambiada_en from pausa.estado where id = 1`

const DUE_REMINDERS_SQL = `
  select count(*)::int as n, min(next_run_at) as primero
    from seller_payment_reminders
   where status = 'active' and next_run_at <= now() + make_interval(mins => $1::int)`

async function readState(client: Client, horizonMinutes: number): Promise<Row> {
  await client.query('begin isolation level repeatable read read only')
  try {
    const [state] = (await client.query(STATE_SQL)).rows as Row[]
    const pause = state!.instalada ? ((await client.query(PAUSE_ROW_SQL)).rows[0] as Row) : null
    const [due] = (await client.query(DUE_REMINDERS_SQL, [horizonMinutes])).rows as Row[]
    return { ...state, pausa: pause, recordatorios: due }
  } finally {
    await client.query('rollback')
  }
}

// -----------------------------------------------------------------------------
// Las órdenes
// -----------------------------------------------------------------------------

type Outcome = { ok: boolean; lines: string[]; report: Row }

async function install(client: Client, api: ApiTarget): Promise<Outcome> {
  await client.query(readFileSync(INSTALL_SQL, 'utf8'))
  const loaded = await probeUntil(api, 'service', (p) => p.pausa === 'abierta', 30)
  return {
    ok: loaded.ok,
    lines: loaded.ok
      ? [
          `Instalada y ABIERTA. PostgREST la usa desde hace ${loaded.waitedMs} ms (cabecera «abierta»).`,
        ]
      : [
          `Instalada, pero PostgREST NO la usa (sonda: ${loaded.last.status}, cabecera ${loaded.last.pausa ?? 'ninguna'}).`,
          'Cerrarla ahora no protegería nada. No sigas: revisa que PostgREST recargue su configuración.',
        ],
    report: { sonda: loaded.last, espera_ms: loaded.waitedMs },
  }
}

async function close(client: Client, api: ApiTarget, options: Options): Promise<Outcome> {
  const lines: string[] = []
  const state = await readState(client, options.horizonMinutes)
  if (!state.instalada) return refuse('La pausa no está instalada: primero «instalar».', state)

  const before = await probe(api, 'service')
  if (before.pausa !== 'abierta' && before.pausa !== 'permitida' && !probeShowsClosed(before)) {
    return refuse(
      `PostgREST no está usando la pausa (sonda: ${before.status}, cabecera ${before.pausa ?? 'ninguna'}). Cerrarla no protegería nada.`,
      state,
    )
  }
  const due = state.recordatorios as { n: number; primero: Date | null }
  if (due.n > 0) {
    return refuse(
      `${due.n} recordatorio(s) de pago vencen en los próximos ${options.horizonMinutes} min (el primero, ${due.primero?.toISOString()}). Ese proceso corre dentro de la base y la pausa no lo detiene: elige otra ventana.`,
      state,
    )
  }
  const hour = new Date().getUTCHours()
  if (lotteryCronHours().has(hour)) {
    lines.push(
      `Aviso: ${hour}:00 UTC es hora del programador de loterías. La pausa lo detiene —sus peticiones reciben 423 y no escribe nada—, pero ese turno se pierde hasta el siguiente.`,
    )
  }
  if (state.candado_sincronizador) {
    lines.push(
      'Aviso: el sincronizador de loterías tiene su candado; el drenaje espera su transacción en curso y las siguientes reciben 423.',
    )
  }

  await client.query(
    `update pausa.estado set cerrada = true, permitidos = '{}', motivo = 'publicacion', cambiada_en = now() where id = 1`,
  )
  lines.push(`CERRADA a las ${new Date().toISOString()}. Nadie tiene permiso para pasar.`)

  // El drenaje: el cerrojo en exclusiva llega cuando termina la última petición que ya estaba dentro.
  const started = Date.now()
  try {
    await client.query(`set lock_timeout = '${options.drainSeconds}s'`)
    await client.query('select pg_advisory_lock($1, $2)', [...DRAIN_LOCK])
    await client.query('select pg_advisory_unlock($1, $2)', [...DRAIN_LOCK])
  } catch (error) {
    const pending = (
      await client.query(
        `select count(*)::int as n from pg_stat_activity where usename = 'authenticator' and xact_start is not null`,
      )
    ).rows[0] as { n: number }
    return {
      ok: false,
      lines: [
        ...lines,
        `NO SE DRENÓ en ${options.drainSeconds} s: quedan ${pending.n} petición(es) en curso (${error instanceof Error ? error.message : 'error'}).`,
        'La pausa sigue CERRADA. Repite «cerrar» para volver a esperar; no migres hasta que drene.',
      ],
      report: { estado: state, drenaje_ms: Date.now() - started, pendientes: pending.n },
    }
  } finally {
    await client.query(`reset lock_timeout`)
  }
  const drainMs = Date.now() - started
  lines.push(`Drenada en ${drainMs} ms: no queda ninguna petición de la API en curso.`)

  const anon = await probe(api, 'anon')
  const service = await probe(api, 'service')
  const effective = probeShowsClosed(anon) && probeShowsClosed(service)
  lines.push(
    effective
      ? 'La API responde 423 RIFAS_PAUSA a anon y a service_role.'
      : `LA API NO ESTÁ CERRADA (anon ${anon.status} ${anon.code ?? ''}, service_role ${service.status} ${service.code ?? ''}). No migres.`,
  )
  return { ok: effective, lines, report: { estado: state, drenaje_ms: drainMs, anon, service } }
}

async function allow(client: Client, options: Options): Promise<Outcome> {
  const state = await readState(client, 60)
  const pause = state.pausa as { cerrada: boolean } | null
  if (!pause) return refuse('La pausa no está instalada.', state)
  if (!pause.cerrada) return refuse('La pausa está abierta: no hay a quién dejar pasar.', state)
  if (options.allowed.length > 0) {
    const found = (
      await client.query('select count(*)::int as n from profiles where id = any($1::uuid[])', [
        options.allowed,
      ])
    ).rows[0] as { n: number }
    if (found.n !== options.allowed.length) {
      return refuse(
        `${options.allowed.length - found.n} de los perfiles no existen en esta base. No se cambió nada.`,
        state,
      )
    }
  }
  await client.query(
    `update pausa.estado set permitidos = $1::uuid[], cambiada_en = now() where id = 1`,
    [options.allowed],
  )
  return {
    ok: true,
    lines: [
      options.allowed.length === 0
        ? 'Nadie tiene permiso para pasar.'
        : `Pueden pasar ${options.allowed.length} perfil(es); nadie más. La pausa sigue CERRADA.`,
    ],
    report: { permitidos: options.allowed.length },
  }
}

async function open(client: Client, api: ApiTarget, options: Options): Promise<Outcome> {
  const state = await readState(client, 60)
  const pause = state.pausa as { cerrada: boolean } | null
  if (!pause) return refuse('La pausa no está instalada.', state)
  if (state.ultima_migracion !== options.migration) {
    return refuse(
      `La última migración aplicada es ${String(state.ultima_migracion)}, no ${options.migration}. La pausa sigue como estaba.`,
      state,
    )
  }
  let expected: string | null
  try {
    expected = latestMigrationOfCommit(options.commit!)
  } catch {
    return refuse(
      `No encuentro el commit ${options.commit!.slice(0, 7)} en este repositorio. La pausa sigue como estaba.`,
      state,
    )
  }
  if (expected !== options.migration) {
    return refuse(
      `El código de ${options.commit!.slice(0, 7)} espera la base en ${String(expected)}, y está en ${options.migration}: no son pareja. La pausa sigue como estaba.`,
      state,
    )
  }
  const buildId = buildIdFor(options.commit!)
  const served = await siteServesBuild(api.site, buildId)
  if (!served.found) {
    return refuse(
      `${api.site} no sirve el build de ${options.commit!.slice(0, 7)} (${buildId}, buscado en ${served.chunks} fragmentos). La pausa sigue como estaba.`,
      state,
    )
  }
  await client.query(
    `update pausa.estado set cerrada = false, permitidos = '{}', motivo = null, cambiada_en = now() where id = 1`,
  )
  const after = await probeUntil(api, 'service', (p) => p.pausa === 'abierta', 10)
  return {
    ok: after.ok,
    lines: [
      `Comprobado: base en ${options.migration} y sitio con el build ${buildId}.`,
      after.ok
        ? `ABIERTA a las ${new Date().toISOString()}.`
        : `Se abrió en la base, pero la sonda no lo confirma (${after.last.status}).`,
    ],
    report: { migracion: options.migration, build: buildId, sonda: after.last },
  }
}

async function retire(client: Client, api: ApiTarget): Promise<Outcome> {
  const state = await readState(client, 60)
  const pause = state.pausa as { cerrada: boolean } | null
  if (pause?.cerrada) return refuse('La pausa está cerrada: «abrir» antes de retirarla.', state)
  await client.query(readFileSync(RETIRE_SQL, 'utf8'))
  const unloaded = await probeUntil(api, 'service', (p) => p.pausa === null && p.status < 400, 30)
  if (!unloaded.ok) {
    return {
      ok: false,
      lines: [
        `El gancho se quitó, pero PostgREST aún no lo confirma (sonda: ${unloaded.last.status}, cabecera ${unloaded.last.pausa ?? 'ninguna'}).`,
        'NO se borró el esquema `pausa`: bórralo con «retirar» cuando la sonda ya no traiga la cabecera.',
      ],
      report: { sonda: unloaded.last },
    }
  }
  await client.query('drop schema if exists pausa cascade')
  return {
    ok: true,
    lines: [`Retirada: PostgREST dejó de usarla en ${unloaded.waitedMs} ms y el esquema se borró.`],
    report: { espera_ms: unloaded.waitedMs },
  }
}

function refuse(message: string, state: Row): Outcome {
  return { ok: false, lines: [`NO: ${message}`], report: { estado: state } }
}

async function status(client: Client, api: ApiTarget, options: Options): Promise<Outcome> {
  const state = await readState(client, options.horizonMinutes)
  const service = await probe(api, 'service')
  const anon = await probe(api, 'anon')
  const pause = state.pausa as { cerrada: boolean; permitidos: string[] } | null
  const due = state.recordatorios as { n: number; primero: Date | null }
  const acting = service.pausa !== null || probeShowsClosed(service)
  return {
    ok: true,
    lines: [
      `Instalada: ${state.instalada ? 'sí' : 'no'} · gancho configurado: ${state.gancho_configurado ? 'sí' : 'no'} · PostgREST la usa: ${acting ? 'sí' : 'no'}`,
      `Estado: ${pause ? (pause.cerrada ? `CERRADA, ${pause.permitidos.length} perfil(es) permitido(s)` : 'abierta') : '—'}`,
      `Sonda: service_role ${service.status} (${service.pausa ?? 'sin cabecera'}), anon ${anon.status} (${anon.code ?? anon.pausa ?? '—'})`,
      `Última migración: ${String(state.ultima_migracion)} · peticiones de la API en curso: ${String(state.peticiones_en_curso)}`,
      `Recordatorios que vencen en ${options.horizonMinutes} min: ${due.n}${due.primero ? ` (el primero, ${due.primero.toISOString()})` : ''}`,
      `Candado del sincronizador: ${state.candado_sincronizador ? 'OCUPADO' : 'libre'}`,
    ],
    report: { estado: state, service, anon },
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))
  const api = await apiTargetFor(options.target, options.site)
  const client = await connect(options.target)
  let outcome: Outcome
  try {
    switch (options.command) {
      case 'estado':
        outcome = await status(client, api, options)
        break
      case 'instalar':
        outcome = await install(client, api)
        break
      case 'cerrar':
        outcome = await close(client, api, options)
        break
      case 'permitir':
        outcome = await allow(client, options)
        break
      case 'abrir':
        outcome = await open(client, api, options)
        break
      case 'retirar':
        outcome = await retire(client, api)
        break
    }
  } finally {
    await client.end().catch(() => {})
  }
  const now = new Date().toISOString()
  const file = writeGateFile(`pausa-${options.command}-${fileStamp(now)}.json`, {
    destino: gateTargetLabel(options.target),
    orden: options.command,
    ahora: now,
    ok: outcome.ok,
    ...outcome.report,
  })
  console.log(
    `Pausa de publicación · ${options.command} · ${gateTargetLabel(options.target)} · ${now}`,
  )
  for (const line of outcome.lines) console.log(`  ${line}`)
  console.log(`Informe: ${file}`)
  process.exit(outcome.ok ? 0 : 2)
}

// Solo al ejecutarlo, no al importarlo (las pruebas importan las funciones).
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/maintenance-pause.ts')) {
  runGateTool(main, USAGE)
}

export { install, close, allow, open, retire, status, readState, apiTargetFor, connect }
