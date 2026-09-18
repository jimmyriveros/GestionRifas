/**
 * FOTO DE SOLO LECTURA para las puertas de producción (Etapa 4 de D-208, `RUNBOOK` §9.0).
 *
 *   npx tsx scripts/gate-snapshot.ts <etiqueta> (--local | --production --project-ref <ref>)
 *        [--base <foto-de-la-línea-base.json>]
 *
 * Versiona y generaliza la foto que usó la Entrega 5 (`build/e5/p1/foto.mjs`, sin
 * versionar). Todo va dentro de UNA transacción `repeatable read read only`, así que
 * la foto es un único instante de la base. Guarda en `build/gate/`:
 *
 *   procedencia (formato `gate-snapshot/v2`, I-145) una captura única, el entorno y el
 *               PROYECTO con el que se conectó —`readOnly` no conecta si
 *               `SUPABASE_DB_URL` nombra otro—, la captura y la huella de la foto base,
 *               y la huella de la foto entera. Ninguna credencial. Sin esto, una foto
 *               no puede dar un veredicto de puerta (`provenanceProblems`)
 *   meta        hora de la transacción, snapshot, versión y usuario
 *   migraciones versión y nombre de cada una
 *   estructura  del esquema public: tablas (RLS, ACL), columnas, restricciones,
 *               índices, disparadores, políticas, funciones (huella del cuerpo,
 *               seguridad, search_path, ACL), tipos, vistas, extensiones, cron,
 *               nombres del Vault —nunca valores—, publicaciones, privilegios por
 *               defecto, ACL del esquema y disparadores de auth.users
 *   filas       por tabla de public y por clave primaria, HUELLAS de la fila —nunca su
 *               contenido—: h (entera), hc (sin las columnas que la bitácora no
 *               registra) y, en avisos, hr (sin read_at). Con --base, además hb/hcb/hrb
 *               sobre las columnas que la tabla tenía en la línea base, para comparar a
 *               través de una migración que añade columnas. La clave de un CLIENTE se
 *               guarda como md5: la foto no contiene ningún identificador de cliente
 *   hechos      rifas (estado, fechas y prize_mode), tablas de premios, avisos por
 *               tipo, cifras de control, sincronizador, cron y recordatorios próximos
 *
 * No imprime datos personales, identificadores de clientes ni la cadena de conexión.
 * La comparan `scripts/gate-compare.ts` y `scripts/gate-mirror-privileges.ts`.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

import {
  AUDIT_IGNORED_COLUMNS,
  fileStamp,
  gateTarget,
  gateTargetLabel,
  parseArgs,
  readOnly,
  HASHED_KEY_TABLES,
  runGateTool,
  writeGateFile,
  type GateTarget,
  type Query,
  type Snapshot,
} from './gate-db'
import { foreignTarget, SNAPSHOT_FORMAT, snapshotDigest, snapshotProblems } from './gate-diff'

const USAGE =
  'Uso: npx tsx scripts/gate-snapshot.ts <etiqueta> (--local | --production --project-ref <ref>) ' +
  '[--base <foto-de-la-línea-base.json>]'

/** Las tablas de premios, con sus filas contadas en los hechos. */
const PRIZE_TABLES = [
  'raffle_prizes',
  'raffle_prize_versions',
  'raffle_prize_schedule_rules',
  'raffle_prize_reward_options',
  'lottery_ticket_match_prizes',
  'raffle_prize_transitions',
  'declared_prize_awards',
]

type Row = Record<string, unknown>

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`
const textArray = (items: string[]) =>
  `'{${items.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(',')}}'::text[]`
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value)

async function attempt(query: Query, sql: string): Promise<Row[] | { error: string }> {
  try {
    await query('savepoint intento')
    const rows = await query(sql)
    await query('release savepoint intento')
    return rows
  } catch (error) {
    await query('rollback to savepoint intento')
    const e = error as { code?: string; message?: string }
    return { error: e.code ?? String(e.message ?? '').slice(0, 80) }
  }
}

async function structure(query: Query): Promise<Snapshot['estructura']> {
  const e: Snapshot['estructura'] = {}
  e.tablas =
    await query(`select c.relname as nombre, c.relkind::text as tipo, c.relrowsecurity as rls,
      c.relforcerowsecurity as rls_forzada, c.relacl::text as acl
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','S','f')
    order by 1`)
  e.columnas =
    await query(`select c.relname as tabla, a.attname as columna, format_type(a.atttypid, a.atttypmod) as tipo,
      a.attnotnull as no_nulo, pg_get_expr(d.adbin, d.adrelid) as defecto, a.attacl::text as acl
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m') and a.attnum > 0 and not a.attisdropped
    order by 1, a.attnum`)
  e.restricciones =
    await query(`select coalesce(conrelid::regclass::text, contypid::regtype::text) as objeto,
      conname as nombre, contype::text as tipo, pg_get_constraintdef(oid) as def, convalidated as validada
    from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`)
  e.indices = await query(`select tablename as tabla, indexname as nombre, indexdef as def
    from pg_indexes where schemaname = 'public' order by 1, 2`)
  e.disparadores =
    await query(`select tgrelid::regclass::text as tabla, tgname as nombre, tgenabled::text as estado,
      pg_get_triggerdef(oid) as def
    from pg_trigger where not tgisinternal
      and (tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
           or tgrelid = 'auth.users'::regclass)
    order by 1, 2`)
  e.politicas =
    await query(`select tablename as tabla, policyname as nombre, permissive, roles::text as roles, cmd,
      qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`)
  // La huella del cuerpo SIN retornos de carro: la base local se reconstruye desde una
  // copia de trabajo de Windows donde algunas migraciones tienen CRLF, y producción
  // se aplicó con LF. Mismo código, distinto texto; sin esto, 29 funciones idénticas
  // parecerían distintas (medido en la Etapa 4, `TEST_RESULTS`).
  e.funciones = await query(`select p.oid::regprocedure::text as firma, p.prokind::text as tipo,
      p.prosecdef as security_definer, p.provolatile::text as volatilidad, p.proconfig::text as config,
      md5(replace(p.prosrc, chr(13), '')) as cuerpo, pg_get_function_result(p.oid) as devuelve,
      p.proacl::text as acl,
      pg_get_userbyid(p.proowner) as propietario
    from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)
  e.tipos = await query(`select t.typname as nombre, t.typtype::text as tipo,
      (select string_agg(x.enumlabel, ',' order by x.enumsortorder) from pg_enum x where x.enumtypid = t.oid) as valores
    from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype in ('e','d')
    order by 1`)
  e.vistas = await query(
    `select viewname as nombre, md5(definition) as def from pg_views where schemaname = 'public' order by 1`,
  )
  e.extensiones =
    await query(`select extname as nombre, extversion as version, extnamespace::regnamespace::text as esquema
    from pg_extension order by 1`)
  e.cron = await attempt(
    query,
    `select jobname as nombre, schedule, active, md5(command) as comando from cron.job order by 1`,
  )
  e.vault = await attempt(query, `select name as nombre from vault.secrets order by 1`)
  e.publicaciones = await query(
    `select pubname, schemaname, tablename from pg_publication_tables order by 1, 2, 3`,
  )
  e.privilegios_por_defecto = await query(`select pg_get_userbyid(defaclrole) as rol,
      coalesce(defaclnamespace::regnamespace::text, '') as esquema, defaclobjtype::text as tipo, defaclacl::text as acl
    from pg_default_acl order by 1, 2, 3`)
  e.esquema_public = await query(
    `select nspacl::text as acl from pg_namespace where nspname = 'public'`,
  )
  return e
}

async function rows(
  query: Query,
  snapshot: Snapshot,
  base: Snapshot | null,
): Promise<Snapshot['filas']> {
  const columnsOf = (table: string, source: Snapshot) =>
    (source.estructura.columnas as Row[])
      .filter((c) => c.tabla === table)
      .map((c) => String(c.columna))

  const tables = await query<{ tabla: string; pk: string[] | null }>(`select c.relname as tabla,
      (select array_agg(a.attname::text order by array_position(i.indkey, a.attnum))
         from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
        where i.indrelid = c.oid and i.indisprimary) as pk
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`)

  const out: Snapshot['filas'] = {}
  for (const { tabla, pk } of tables) {
    if (!pk) throw new Error(`La tabla ${tabla} no tiene clave primaria.`)
    const rawKey =
      pk.length === 1
        ? `t.${ident(pk[0]!)}::text`
        : `concat_ws('|', ${pk.map((c) => `t.${ident(c)}::text`).join(', ')})`
    const key = HASHED_KEY_TABLES.has(tabla) ? `'md5:' || md5(${rawKey})` : rawKey
    const notices = tabla === 'notifications'
    const current = columnsOf(tabla, snapshot)
    const added =
      base && base.filas[tabla] ? current.filter((c) => !columnsOf(tabla, base).includes(c)) : []
    const parts = [
      `${key} as k`,
      `md5(j::text) as h`,
      `md5((j - ${textArray(AUDIT_IGNORED_COLUMNS)})::text) as hc`,
      notices ? `md5((j - 'read_at')::text) as hr` : `null::text as hr`,
    ]
    if (added.length > 0) {
      parts.push(`md5((j - ${textArray(added)})::text) as hb`)
      parts.push(
        `md5((j - ${textArray(added)} - ${textArray(AUDIT_IGNORED_COLUMNS)})::text) as hcb`,
      )
      parts.push(
        notices ? `md5((j - ${textArray(added)} - 'read_at')::text) as hrb` : `null::text as hrb`,
      )
    }
    const found = await query<Record<string, string | null>>(
      `select ${parts.join(', ')} from public.${ident(tabla)} t
         cross join lateral (select to_jsonb(t) as j) x order by 1`,
    )
    const map: Record<string, Array<string | null>> = {}
    for (const r of found) {
      map[r.k!] =
        added.length > 0
          ? [r.h!, r.hc!, r.hr ?? null, r.hb!, r.hcb!, r.hrb ?? null]
          : [r.h!, r.hc!, r.hr ?? null]
    }
    out[tabla] = { pk, columnas_nuevas: added, n: found.length, filas: map }
  }
  return out
}

async function facts(query: Query): Promise<Snapshot['hechos']> {
  const h: Snapshot['hechos'] = {}
  h.rifas = (
    await query(`select r.id, r.organization_id, r.name, r.status::text as status, r.start_date::text as inicio,
        r.end_date::text as fin, to_jsonb(r) ->> 'prize_mode' as prize_mode, r.updated_at
      from raffles r order by r.id`)
  ).map((r) => ({ ...r, updated_at: iso(r.updated_at) }))
  const prizeTables: Record<string, number | null> = {}
  for (const table of PRIZE_TABLES) {
    const [exists] = await query<{ existe: string | null }>(
      `select to_regclass($1)::text as existe`,
      [`public.${table}`],
    )
    prizeTables[table] = exists?.existe
      ? Number(
          (await query<{ n: number }>(`select count(*)::int as n from public.${ident(table)}`))[0]!
            .n,
        )
      : null
  }
  h.tablas_de_premios = prizeTables
  h.avisos_por_tipo = await query(
    `select kind, count(*)::int as n from notifications group by kind order by kind`,
  )
  ;[h.control] = await query(`select
      (select count(*)::int from organizations) as organizaciones,
      (select count(*)::int from raffles) as rifas,
      (select count(*)::int from tickets) as boletas,
      (select count(*)::int from tickets where inventory_status = 'assigned') as boletas_vendidas,
      (select coalesce(sum(sale_price), 0)::bigint from tickets where inventory_status = 'assigned')::text as total_vendido,
      (select count(*)::int from clients) as clientes,
      (select count(*)::int from payments) as pagos,
      (select count(*)::int from payments where voided_at is not null) as pagos_anulados,
      (select coalesce(sum(total_amount) filter (where voided_at is null), 0)::bigint from payments)::text as total_pagado,
      (select count(*)::int from payment_allocations) as asignaciones,
      (select coalesce(sum(amount), 0)::bigint from payment_allocations)::text as total_asignado,
      (select count(*)::int from commission_ledger) as movimientos_comision,
      (select coalesce(sum(amount), 0)::bigint from commission_ledger)::text as total_comisiones,
      (select count(*)::int from lottery_ticket_matches) as coincidencias,
      (select count(*)::int from lottery_results) as resultados,
      (select count(*)::int from lottery_draw_schedules) as programaciones,
      (select count(*)::int from lottery_source_observations) as observaciones,
      (select count(*)::int from lottery_sync_runs) as corridas_sincronizador,
      (select count(*)::int from notifications) as avisos,
      (select count(*)::int from audit_logs) as bitacora,
      (select coalesce(max(id), 0) from audit_logs)::text as bitacora_ultimo_id,
      (select count(*)::int from memberships) as membresias,
      (select count(*)::int from profiles) as perfiles`)
  h.sincronizador_candado = (
    await query(`select holder, acquired_at, updated_at from lottery_sync_lock`)
  ).map((r) => ({
    holder: r.holder,
    acquired_at: iso(r.acquired_at),
    updated_at: iso(r.updated_at),
  }))
  h.sincronizador_ultimas = (
    await query(`select kind::text, lottery_code::text, started_at, finished_at, outcome::text
      from lottery_sync_runs order by started_at desc limit 8`)
  ).map((r) => ({ ...r, started_at: iso(r.started_at), finished_at: iso(r.finished_at) }))
  ;[h.sincronizador_en_curso] = await query(`select
      count(*) filter (where started_at > now() - interval '30 minutes')::int as recientes_sin_terminar,
      count(*)::int as sin_terminar_total from lottery_sync_runs where finished_at is null`)
  h.cron_ultimas = await attempt(
    query,
    `select j.jobname, j.schedule, j.active,
        (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) as estado,
        (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid)::text as ultima,
        (select count(*)::int from cron.job_run_details d where d.jobid = j.jobid and d.status in ('running','starting')) as en_curso
      from cron.job j order by 1`,
  )
  h.recordatorios = (
    await query(`select count(*) filter (where status = 'active')::int as activos,
        min(next_run_at) filter (where status = 'active' and next_run_at > now()) as proximo,
        count(*) filter (where status = 'active' and next_run_at <= now() + interval '3 hours')::int as en_3_horas,
        count(*) filter (where status = 'active' and next_run_at <= now() + interval '24 hours')::int as en_24_horas
      from seller_payment_reminders`)
  ).map((r) => ({ ...r, proximo: iso(r.proximo) }))
  return h
}

/**
 * La foto de `--base`, comprobada ANTES de conectar: completa, de este formato, sin tocar
 * y del MISMO destino que la que se va a tomar. Una foto anterior no sirve de base.
 */
function readBase(file: string, target: GateTarget): Snapshot {
  let base: unknown
  try {
    base = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new Error(`No se pudo leer la foto base «${file}»: no existe o no es un JSON completo.`)
  }
  const problems = snapshotProblems(base, 'base')
  if (problems.length > 0) throw new Error(problems.join('\n'))
  const b = base as Snapshot
  const foreign = foreignTarget(b, target)
  if (foreign) {
    throw new Error(
      `La foto base («${b.etiqueta}») es de ${foreign} y esta foto es de ${gateTargetLabel(target)}: ` +
        'una foto se toma con --base de otra del mismo destino. No se conectó nada.',
    )
  }
  return b
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2), {
    switches: [],
    valued: ['--base'],
    positional: 1,
  })
  const etiqueta = parsed.positional[0]
  if (!etiqueta || !/^[a-z0-9-]{1,40}$/.test(etiqueta)) {
    throw new Error(`Falta la etiqueta de la foto (minúsculas, cifras y guiones).\n\n${USAGE}`)
  }
  const target = gateTarget(parsed)
  const basePath = parsed.values.get('--base')
  const base = basePath ? readBase(basePath, target) : null

  const snapshot = await readOnly(target, async (query) => {
    const s = {
      formato: SNAPSHOT_FORMAT,
      captura: randomUUID(),
      etiqueta,
      entorno: target.kind === 'local' ? 'local' : 'produccion',
      // El proyecto con el que se conectó: `readOnly` no llega hasta aquí si
      // `SUPABASE_DB_URL` nombra otro distinto de `--project-ref`.
      proyecto: target.projectRef,
      base: base
        ? {
            etiqueta: base.etiqueta,
            ahora: base.meta.ahora,
            captura: base.captura!,
            huella: base.huella!,
          }
        : null,
    } as Snapshot
    const [meta] =
      await query(`select now() as ahora, clock_timestamp() as reloj, pg_current_snapshot()::text as snapshot,
        current_setting('server_version') as version, current_user as usuario, pg_is_in_recovery() as replica`)
    s.meta = {
      ahora: iso(meta!.ahora) as string,
      reloj: iso(meta!.reloj) as string,
      snapshot: String(meta!.snapshot),
      version: String(meta!.version),
      usuario: String(meta!.usuario),
      replica: Boolean(meta!.replica),
    }
    s.migraciones = (await query(
      `select version, name from supabase_migrations.schema_migrations order by version`,
    )) as Snapshot['migraciones']
    s.estructura = await structure(query)
    s.filas = await rows(query, s, base)
    s.hechos = await facts(query)
    return s
  })

  // La huella se calcula sobre exactamente lo que se escribe: la foto ya pasada a JSON.
  const written = JSON.parse(JSON.stringify(snapshot)) as Snapshot
  const huella = snapshotDigest(written)
  written.huella = huella
  const file = writeGateFile(
    `foto-${etiqueta}-${snapshot.entorno}-${fileStamp(snapshot.meta.ahora)}.json`,
    JSON.stringify(written),
  )

  // Resumen imprimible: recuentos y huellas, sin un dato de nadie.
  const { createHash } = await import('node:crypto')
  const tableHash = (t: Snapshot['filas'][string]) =>
    createHash('md5')
      .update(
        Object.entries(t.filas)
          .map(([k, v]) => `${k}:${v[0]}`)
          .join(','),
      )
      .digest('hex')
  console.log(
    `Foto «${etiqueta}» · ${gateTargetLabel(target)} · ${snapshot.meta.ahora} · snapshot ${snapshot.meta.snapshot}`,
  )
  console.log(
    `Procedencia: ${SNAPSHOT_FORMAT} · captura ${written.captura} · huella ${huella.slice(0, 12)}…` +
      (written.base ? ` · base «${written.base.etiqueta}» (${written.base.ahora})` : ''),
  )
  console.log(
    `Migraciones: ${snapshot.migraciones.length}, última ${snapshot.migraciones.at(-1)?.version ?? '—'}`,
  )
  const e = snapshot.estructura as Record<string, Row[]>
  console.log(
    `Estructura: ${e.tablas!.length} relaciones, ${e.funciones!.length} funciones, ${e.politicas!.length} políticas, ` +
      `${e.disparadores!.length} disparadores, ${e.indices!.length} índices`,
  )
  for (const [tabla, t] of Object.entries(snapshot.filas)) {
    const added =
      t.columnas_nuevas.length > 0 ? `  columnas nuevas: ${t.columnas_nuevas.join(', ')}` : ''
    console.log(`  ${tabla.padEnd(32)} ${String(t.n).padStart(6)} filas  ${tableHash(t)}${added}`)
  }
  const h = snapshot.hechos as Record<string, unknown>
  console.log(
    'Rifas:',
    JSON.stringify(
      (h.rifas as Row[]).map(({ id, status, inicio, fin, prize_mode }) => ({
        id,
        status,
        inicio,
        fin,
        prize_mode,
      })),
    ),
  )
  console.log('Tablas de premios:', JSON.stringify(h.tablas_de_premios))
  console.log('Avisos por tipo:', JSON.stringify(h.avisos_por_tipo))
  console.log('Control:', JSON.stringify(h.control))
  console.log(
    'Sincronizador: candado',
    JSON.stringify(h.sincronizador_candado),
    '· sin terminar',
    JSON.stringify(h.sincronizador_en_curso),
  )
  console.log('Últimas corridas:', JSON.stringify((h.sincronizador_ultimas as Row[]).slice(0, 3)))
  console.log('Cron:', JSON.stringify(h.cron_ultimas))
  console.log('Recordatorios:', JSON.stringify(h.recordatorios))
  console.log(`Guardada en ${file}`)
}

runGateTool(main, USAGE)
