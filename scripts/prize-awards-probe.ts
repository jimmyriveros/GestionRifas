/**
 * SONDA DE SOLO LECTURA del historial de premios ganados (Etapa 4 de D-208,
 * `RUNBOOK` §9.1 y §9.6).
 *
 *   npx tsx scripts/prize-awards-probe.ts <etiqueta> (--local | --production --project-ref <ref>)
 *        --organization <uuid> [--since <instante ISO>]
 *
 * Lo que una puerta necesita saber del historial y que la foto por fila no dice:
 *
 *   A  migraciones y qué objetos del historial existen ya
 *   B  la organización, sus membresías por rol y sus rifas
 *   C  las DOS coincidencias confirmadas por el dueño, una por una: sorteo, fecha,
 *      números, campo fotografiado, venta, modo del sorteo, resultado y enlaces
 *   D  el premio que resolvería el título de cada entrada, dentro de su rifa
 *   E  los premios que YA hay en el historial —del motor y reconocidos—, con sus
 *      cuatro indicadores
 *   F  las demás coincidencias VENDIDAS del sistema de siempre sin reconocer: se
 *      identifican como pendientes; no se reconocen ni se les pone importe
 *   G  los totales esperados después de reconocer las dos entradas: los clientes
 *      distintos se RECALCULAN, no se suman
 *   H  la cobertura pendiente (BR-J22), con la definición de la `0069`
 *   I  la actividad desde un instante (`--since`)
 *   J  el sincronizador, los recordatorios y el despachador: para elegir ventana
 *
 * Con la `0067` aplicada, E y G salen de `prize_award_rows`, la definición única;
 * antes, de una réplica de su rama del motor —la única que puede tener filas
 * mientras `declared_prize_awards` no existe—, y el informe dice cuál se usó.
 *
 * NINGÚN DATO DE CLIENTE: ni nombres, ni teléfonos, ni identificadores. Los
 * clientes distintos se cuentan dentro de la base y solo sale el número; un
 * vendedor aparece como «vendedor 1», «vendedor 2»… en el orden de esta sonda.
 */
import { CONFIRMED_PRIZE_AWARDS } from '../src/features/prize-awards/declared'

import {
  fileStamp,
  gateTarget,
  gateTargetLabel,
  parseArgs,
  readOnly,
  runGateTool,
  writeGateFile,
  type Query,
} from './gate-db'

const USAGE =
  'Uso: npx tsx scripts/prize-awards-probe.ts <etiqueta> (--local | --production --project-ref <ref>) ' +
  '--organization <uuid> [--since <instante ISO>]'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** El inicio operativo verificado (BR-J22). Con la `0067`, lo dice la base. */
const HISTORY_START_BEFORE_0067 = '2026-08-09'
/** El último estado documentado del proyecto real (D-208, corrección de la Etapa 1, punto D). */
const DEFAULT_SINCE = '2026-09-17T22:00:00Z'

type Row = Record<string, unknown>

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value)
const plain = (rows: Row[]) =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, iso(v)])))

/** Las entradas confirmadas, como tabla SQL: `entrada(pos, diario, semanal, loteria, fecha, titulo, importe)`. */
const ENTRIES_SQL = `
  entrada as (
    select e.ordinality::int as pos, e.value ->> 'daily_number' as diario,
           e.value ->> 'weekly_number' as semanal, e.value ->> 'lottery_code' as loteria,
           (e.value ->> 'reference_date')::date as fecha, e.value ->> 'prize_title' as titulo,
           (e.value ->> 'amount')::bigint as importe
      from jsonb_array_elements($2::jsonb) with ordinality as e(value, ordinality)
  )`

async function probe(query: Query, org: string, since: string) {
  const out: Record<string, unknown> = {}
  const entries = JSON.stringify(CONFIRMED_PRIZE_AWARDS)

  // --------------------------------------------------------------------- A
  const [meta] = await query(`select now() as ahora, pg_current_snapshot()::text as snapshot,
      (now() at time zone 'America/Bogota')::text as ahora_bogota`)
  out.meta = plain([meta!])[0]
  out.migraciones = await query(`select count(*)::int as total, max(version) as ultima,
      array_agg(version order by version) filter (where version >= '0060') as desde_0060
    from supabase_migrations.schema_migrations`)
  const [objetos] = await query<Record<string, boolean>>(`select
      to_regclass('public.declared_prize_awards') is not null as declared_prize_awards,
      to_regprocedure('public.prize_award_rows(uuid[],uuid[],uuid,uuid,date,date)') is not null as prize_award_rows,
      to_regprocedure('public.record_declared_prize_awards(uuid,text,jsonb,boolean)') is not null as cargador,
      to_regprocedure('public.prize_award_coverage()') is not null as cobertura,
      to_regprocedure('public.prize_award_history_start()') is not null as inicio,
      to_regprocedure('public.admin_prize_award_sellers()') is not null as vendedores_0070,
      to_regprocedure('public.current_seller_org_ids()') is not null as alcance_0068,
      to_regprocedure('public.raffle_prize_draw_mode(uuid,lottery_draw_schedules)') is not null as modo_0064`)
  out.objetos = objetos
  const has0067 = Boolean(objetos!.declared_prize_awards && objetos!.prize_award_rows)
  const start = objetos!.inicio
    ? String((await query<{ d: string }>(`select prize_award_history_start()::text as d`))[0]!.d)
    : HISTORY_START_BEFORE_0067
  out.inicio_operativo = {
    fecha: start,
    fuente: objetos!.inicio ? 'prize_award_history_start()' : 'constante verificada (BR-J22)',
  }

  // --------------------------------------------------------------------- B
  const [orgRow] = await query(`select count(*)::int as existe from organizations where id = $1`, [
    org,
  ])
  out.organizacion = {
    existe: Number(orgRow!.existe) === 1,
    membresias_activas_por_rol: await query(
      `select role::text as rol, count(*)::int as n from memberships
        where organization_id = $1 and is_active group by 1 order by 1`,
      [org],
    ),
    rifas: plain(
      await query(
        `select r.id, r.name as nombre, r.status::text as estado, r.start_date::text as inicio,
                r.end_date::text as fin, to_jsonb(r) ->> 'prize_mode' as modo,
                (select t.effective_at from raffle_prize_transitions t where t.raffle_id = r.id) as instante_efectivo
           from raffles r where r.organization_id = $1 order by r.created_at`,
        [org],
      ),
    ),
  }

  // Los vendedores, por orden de aparición en esta sonda: nunca su identificador.
  const sellers = new Map<string, string>()
  const seller = (id: unknown) => {
    if (typeof id !== 'string') return null
    if (!sellers.has(id)) sellers.set(id, `vendedor ${sellers.size + 1}`)
    return sellers.get(id)!
  }

  // --------------------------------------------------------------------- C
  const declaredCounts = has0067
    ? `(select count(*)::int from declared_prize_awards d where d.match_id = m.id and d.voided_at is null) as reconocidos_vigentes,
       (select count(*)::int from declared_prize_awards d where d.match_id = m.id and d.voided_at is not null) as reconocidos_anulados`
    : `null::int as reconocidos_vigentes, null::int as reconocidos_anulados`
  const matches = await query(
    `with ${ENTRIES_SQL}
     select e.pos, e.loteria, e.fecha::text as fecha, e.diario, e.semanal,
            s.draw_number as sorteo, s.schedule_status::text as estado_programacion,
            s.official_scheduled_at as hora_oficial, r.winning_number as numero_mayor,
            r.validation_status::text as estado_resultado,
            (r.conflicting_winning_number is not null) as con_numero_en_conflicto,
            m.id is not null as hay_coincidencia, m.match_field::text as campo, m.matched_number as numero_fotografiado,
            m.assignment_status::text as asignacion, m.inventory_status_at_draw::text as inventario_al_sorteo,
            (m.assigned_at <= s.official_scheduled_at) as asignada_antes_del_sorteo,
            case when m.id is null then null else raffle_prize_draw_mode(m.raffle_id, s) end as modo,
            (select count(*)::int from lottery_ticket_match_prizes lp where lp.match_id = m.id) as enlaces_del_motor,
            ${declaredCounts},
            t.inventory_status::text as boleta_hoy,
            case when t.id is null then null else t.client_id is not null end as boleta_con_cliente_hoy,
            case when m.id is null then null else t.client_id is not distinct from m.client_id end
              as mismo_cliente_que_la_foto,
            (case when m.match_field = 'weekly_number' then t.weekly_number else t.daily_number end
               = m.matched_number) as numero_igual_a_la_boleta,
            m.raffle_id, ra.name as rifa, to_jsonb(ra) ->> 'prize_mode' as modo_rifa, m.seller_id
       from entrada e
       left join lottery_draw_schedules s on s.lottery_code::text = e.loteria and s.reference_date = e.fecha
       left join lottery_results r on r.schedule_id = s.id
       left join tickets t on t.organization_id = $1 and t.daily_number = e.diario and t.weekly_number = e.semanal
                          and exists (select 1 from lottery_ticket_matches mm where mm.ticket_id = t.id and mm.result_id = r.id)
       left join lottery_ticket_matches m on m.ticket_id = t.id and m.result_id = r.id and m.organization_id = $1
       left join raffles ra on ra.id = m.raffle_id
      order by e.pos, m.id`,
    [org, entries],
  )
  out.coincidencias_confirmadas = plain(matches).map(({ seller_id, ...rest }) => ({
    ...rest,
    vendedor: seller(seller_id),
  }))

  // --------------------------------------------------------------------- D
  out.premio_por_titulo = plain(
    await query(
      `with ${ENTRIES_SQL},
       coincidencia as (
         select distinct e.pos, e.titulo, m.raffle_id
           from entrada e
           join lottery_draw_schedules s on s.lottery_code::text = e.loteria and s.reference_date = e.fecha
           join lottery_results r on r.schedule_id = s.id
           join lottery_ticket_matches m on m.result_id = r.id and m.organization_id = $1
           join tickets t on t.id = m.ticket_id and t.daily_number = e.diario and t.weekly_number = e.semanal
       )
       select c.pos, c.titulo, c.raffle_id,
              (select count(*)::int from raffle_prizes p join raffle_prize_versions v on v.id = p.current_version_id
                where p.raffle_id = c.raffle_id and p.organization_id = $1 and p.status = 'active'
                  and v.title = c.titulo) as vigentes_con_ese_titulo,
              (select count(*)::int from raffle_prizes p join raffle_prize_versions v on v.id = p.current_version_id
                where p.raffle_id = c.raffle_id and p.organization_id = $1 and p.status <> 'active'
                  and v.title = c.titulo) as archivados_con_ese_titulo,
              (select jsonb_agg(jsonb_build_object(
                        'premio', p.id, 'version', v.version_number, 'categoria', v.category,
                        'recompensa', v.reward_mode, 'campo', v.number_field, 'cifras', v.digits,
                        'publicada', v.published_at,
                        'importes', (select jsonb_agg(o.amount order by o.position)
                                       from raffle_prize_reward_options o where o.version_id = v.id))
                      order by p.position)
                 from raffle_prizes p join raffle_prize_versions v on v.id = p.current_version_id
                where p.raffle_id = c.raffle_id and p.organization_id = $1 and p.status = 'active'
                  and v.title = c.titulo) as detalle
         from coincidencia c order by c.pos`,
      [org, entries],
    ),
  )

  // --------------------------------------------------------------------- E
  // Las filas del historial. Con la 0067, las de la definición única; antes, la
  // rama del motor de esa misma definición, copiada tal cual.
  const historyRows = has0067
    ? `select a.origin as origen, a.match_id, a.client_id, a.seller_id, a.reference_date::text as reference_date, a.lottery_code::text as loteria,
              a.draw_number, a.daily_number, a.weekly_number, a.match_field::text as campo, a.matched_number,
              a.prize_title, a.prize_digits::text as cifras, a.reward_mode::text as recompensa,
              a.known_amount, a.value_pending, a.result_conflict
         from prize_award_rows(array[$1::uuid], null, null, null, null, null) a`
    : `select 'engine' as origen, m.id as match_id, m.client_id, m.seller_id, s.reference_date::text as reference_date,
              s.lottery_code::text as loteria, s.draw_number, t.daily_number, t.weekly_number,
              m.match_field::text as campo, m.matched_number, v.title as prize_title, v.digits::text as cifras,
              v.reward_mode::text as recompensa,
              case when v.reward_mode = 'fixed'
                then (select o.amount from raffle_prize_reward_options o where o.version_id = v.id limit 1)
              end as known_amount,
              (v.reward_mode <> 'fixed'
               or exists (select 1 from raffle_prize_reward_options o
                           where o.version_id = v.id and o.description is not null)) as value_pending,
              (r.validation_status <> 'confirmed') as result_conflict
         from lottery_ticket_match_prizes lp
         join lottery_ticket_matches m on m.id = lp.match_id
         join raffle_prize_versions v on v.id = lp.prize_version_id
         join tickets t on t.id = m.ticket_id
         join lottery_results r on r.id = m.result_id
         join lottery_draw_schedules s on s.id = r.schedule_id
        where m.assignment_status = 'sold' and m.organization_id = $1
          and s.reference_date >= $2::date`
  const historyParams = has0067 ? [org] : [org, start]
  const history = await query(
    `${historyRows} order by reference_date, loteria, match_id`,
    historyParams,
  )
  const [totals] = await query(
    `select count(*)::int as premios, count(distinct client_id)::int as clientes,
            coalesce(sum(known_amount), 0)::bigint::text as dinero_conocido,
            count(*) filter (where value_pending)::int as con_valor_pendiente
       from (${historyRows}) h`,
    historyParams,
  )
  out.historial_actual = {
    fuente: has0067
      ? 'prize_award_rows (0067)'
      : 'réplica de la rama del motor de prize_award_rows (antes de la 0067)',
    totales: totals,
    filas: plain(history).map(({ client_id: _cliente, match_id: _foto, seller_id, ...rest }) => ({
      ...rest,
      vendedor: seller(seller_id),
    })),
  }

  // --------------------------------------------------------------------- F
  const declaredFlag = has0067
    ? `exists (select 1 from declared_prize_awards d where d.match_id = m.id and d.voided_at is null)`
    : `false`
  const legacy = await query(
    `with ${ENTRIES_SQL}
     select s.lottery_code::text as loteria, s.reference_date::text as fecha, s.draw_number as sorteo,
            r.validation_status::text as estado_resultado, t.daily_number as diario, t.weekly_number as semanal,
            m.match_field::text as campo, m.matched_number as numero_fotografiado,
            exists (select 1 from entrada e where e.loteria = s.lottery_code::text and e.fecha = s.reference_date
                      and e.diario = t.daily_number and e.semanal = t.weekly_number) as confirmada_por_el_dueno,
            ${declaredFlag} as ya_reconocida,
            m.seller_id
       from lottery_ticket_matches m
       join lottery_results r on r.id = m.result_id
       join lottery_draw_schedules s on s.id = r.schedule_id
       join tickets t on t.id = m.ticket_id
      where m.organization_id = $1 and m.assignment_status = 'sold'
        and raffle_prize_draw_mode(m.raffle_id, s) = 'legacy'
      order by s.reference_date, s.lottery_code, t.daily_number`,
    [org, entries],
  )
  out.coincidencias_vendidas_del_sistema_de_siempre = plain(legacy).map(
    ({ seller_id, ...rest }) => ({
      ...rest,
      vendedor: seller(seller_id),
    }),
  )
  out.coincidencias_no_vendidas = await query(
    `select assignment_status::text as asignacion, count(*)::int as n from lottery_ticket_matches
      where organization_id = $1 and assignment_status <> 'sold' group by 1 order by 1`,
    [org],
  )

  // --------------------------------------------------------------------- G
  // Lo que habrá después de reconocer las entradas que todavía no lo están. Los
  // clientes distintos se recalculan sobre el conjunto nuevo.
  const [expected] = await query(
    `with ${ENTRIES_SQL},
     actuales as (select client_id, known_amount, value_pending from (${historyRows
       .replace(/\$1/g, () => '$3')
       .replace(/\$2/g, () => '$4')}) h),
     nuevas as (
       select m.client_id, e.importe as known_amount, false as value_pending
         from entrada e
         join lottery_draw_schedules s on s.lottery_code::text = e.loteria and s.reference_date = e.fecha
         join lottery_results r on r.schedule_id = s.id
         join lottery_ticket_matches m on m.result_id = r.id and m.organization_id = $1 and m.assignment_status = 'sold'
         join tickets t on t.id = m.ticket_id and t.daily_number = e.diario and t.weekly_number = e.semanal
        where not ${declaredFlag}
     ),
     todo as (select * from actuales union all select * from nuevas)
     select (select count(*)::int from nuevas) as entradas_por_reconocer,
            (select coalesce(sum(known_amount), 0)::bigint::text from nuevas) as dinero_por_reconocer,
            count(*)::int as premios, count(distinct client_id)::int as clientes,
            coalesce(sum(known_amount), 0)::bigint::text as dinero_conocido,
            count(*) filter (where value_pending)::int as con_valor_pendiente
       from todo`,
    has0067 ? [org, entries, org] : [org, entries, org, start],
  )
  out.totales_esperados_tras_la_carga = expected

  // --------------------------------------------------------------------- H
  const [coverage] = await query(
    `with ventana as (
       select distinct s.id, s.reference_date,
              exists (select 1 from lottery_results r
                       where r.schedule_id = s.id and r.validation_status = 'confirmed') as confirmado
         from lottery_draw_schedules s
         join raffles ra on s.reference_date between ra.start_date and ra.end_date
        where ra.organization_id = $1 and ra.status in ('active', 'closed')
          and s.schedule_status not in ('cancelled', 'suspended')
          and s.reference_date >= $2::date and s.official_scheduled_at < now()
     )
     select count(*) filter (where not confirmado)::int as sorteos_pendientes,
            min(reference_date) filter (where not confirmado)::text as desde,
            max(reference_date) filter (where not confirmado)::text as hasta,
            min(reference_date) filter (where confirmado)::text as primer_confirmado,
            max(reference_date) filter (where confirmado)::text as ultimo_confirmado,
            count(*) filter (where confirmado)::int as confirmados
       from ventana`,
    [org, start],
  )
  out.cobertura = {
    definicion: 'la de prize_award_coverage() (0069), con la organización fija',
    ...coverage,
  }

  // --------------------------------------------------------------------- I
  out.actividad_desde = since
  out.actividad = {
    boletas_vendidas: await query(
      `select count(*)::int as n from tickets where organization_id = $1 and assigned_at >= $2`,
      [org, since],
    ),
    pagos: await query(
      `select count(*)::int as n, count(*) filter (where voided_at is not null)::int as anulados
         from payments where organization_id = $1 and created_at >= $2`,
      [org, since],
    ),
    clientes_nuevos: await query(
      `select count(*)::int as n from clients where organization_id = $1 and created_at >= $2`,
      [org, since],
    ),
    resultados: plain(
      await query(
        `select s.lottery_code::text as loteria, s.reference_date::text as fecha, s.draw_number as sorteo,
                r.winning_number as numero_mayor, r.validation_status::text as estado, r.source_kind::text as fuente,
                r.confirmed_at, r.created_at
           from lottery_results r join lottery_draw_schedules s on s.id = r.schedule_id
          where r.created_at >= $1 or r.updated_at >= $1 order by s.reference_date, s.lottery_code`,
        [since],
      ),
    ),
    coincidencias: await query(
      `select assignment_status::text as asignacion, count(*)::int as n from lottery_ticket_matches
        where organization_id = $1 and created_at >= $2 group by 1`,
      [org, since],
    ),
    enlaces_del_motor: await query(
      `select count(*)::int as n from lottery_ticket_match_prizes lp
         join lottery_ticket_matches m on m.id = lp.match_id
        where m.organization_id = $1 and lp.created_at >= $2`,
      [org, since],
    ),
    versiones_de_premio: plain(
      await query(
        `select v.title as premio, v.version_number as version, v.published_at from raffle_prize_versions v
          where v.organization_id = $1 and v.published_at >= $2 order by v.published_at`,
        [org, since],
      ),
    ),
    avisos_por_tipo: await query(
      `select kind, count(*)::int as n from notifications
        where organization_id = $1 and created_at >= $2 group by 1 order by 1`,
      [org, since],
    ),
    bitacora_por_accion: await query(
      `select action, count(*)::int as n from audit_logs
        where organization_id = $1 and created_at >= $2 group by 1 order by 1`,
      [org, since],
    ),
  }

  // --------------------------------------------------------------------- J
  out.sincronizador = {
    candado: plain(await query(`select holder, acquired_at, updated_at from lottery_sync_lock`)),
    corridas_48h: plain(
      await query(`select date_trunc('hour', started_at) as hora, kind::text, outcome::text, count(*)::int as n
          from lottery_sync_runs where started_at > now() - interval '48 hours'
         group by 1, 2, 3 order by 1, 2, 3`),
    ),
    sin_terminar: await query(
      `select count(*)::int as n from lottery_sync_runs where finished_at is null`,
    ),
  }
  out.recordatorios = plain(
    await query(`select date_trunc('hour', next_run_at) as hora, count(*)::int as n
        from seller_payment_reminders
       where status = 'active' and next_run_at between now() and now() + interval '48 hours'
       group by 1 order by 1`),
  )
  out.despachador = await query(
    `select status::text as estado, count(*)::int as n from push_outbox group by 1 order by 1`,
  )
  return out
}

function summary(out: Record<string, unknown>): string[] {
  const lines: string[] = []
  const obj = (k: string) => out[k] as Record<string, unknown>
  lines.push(`Migraciones: ${JSON.stringify(out.migraciones)}`)
  lines.push(`Objetos del historial: ${JSON.stringify(out.objetos)}`)
  lines.push(`Inicio operativo: ${JSON.stringify(out.inicio_operativo)}`)
  const org = obj('organizacion')
  lines.push(
    `Organización existe: ${String(org.existe)} · membresías activas: ${JSON.stringify(org.membresias_activas_por_rol)}`,
  )
  for (const r of org.rifas as Row[]) {
    lines.push(
      `  Rifa ${String(r.id)} «${String(r.nombre)}» ${String(r.estado)} ${String(r.inicio)}→${String(r.fin)} ${String(r.modo)} instante ${String(r.instante_efectivo ?? '—')}`,
    )
  }
  lines.push('Coincidencias confirmadas por el dueño:')
  for (const c of out.coincidencias_confirmadas as Row[]) lines.push(`  ${JSON.stringify(c)}`)
  lines.push('Premio que resuelve el título:')
  for (const p of out.premio_por_titulo as Row[]) lines.push(`  ${JSON.stringify(p)}`)
  const hist = obj('historial_actual')
  lines.push(`Historial actual (${String(hist.fuente)}): ${JSON.stringify(hist.totales)}`)
  for (const f of hist.filas as Row[]) lines.push(`  ${JSON.stringify(f)}`)
  lines.push('Coincidencias vendidas del sistema de siempre:')
  for (const f of out.coincidencias_vendidas_del_sistema_de_siempre as Row[])
    lines.push(`  ${JSON.stringify(f)}`)
  lines.push(`Coincidencias no vendidas: ${JSON.stringify(out.coincidencias_no_vendidas)}`)
  lines.push(
    `Totales esperados tras la carga: ${JSON.stringify(out.totales_esperados_tras_la_carga)}`,
  )
  lines.push(`Cobertura: ${JSON.stringify(out.cobertura)}`)
  lines.push(`Actividad desde ${String(out.actividad_desde)}: ${JSON.stringify(out.actividad)}`)
  lines.push(`Sincronizador: ${JSON.stringify(out.sincronizador)}`)
  lines.push(
    `Recordatorios próximos 48 h: ${JSON.stringify(out.recordatorios)} · despachador: ${JSON.stringify(out.despachador)}`,
  )
  return lines
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2), {
    switches: [],
    valued: ['--organization', '--since'],
    positional: 1,
  })
  const etiqueta = parsed.positional[0]
  if (!etiqueta || !/^[a-z0-9-]{1,40}$/.test(etiqueta)) {
    throw new Error(`Falta la etiqueta de la sonda (minúsculas, cifras y guiones).\n\n${USAGE}`)
  }
  const target = gateTarget(parsed)
  const org = parsed.values.get('--organization')
  if (!org || !UUID.test(org))
    throw new Error(`Falta --organization con un identificador válido.\n\n${USAGE}`)
  const since = parsed.values.get('--since') ?? DEFAULT_SINCE
  if (Number.isNaN(Date.parse(since))) throw new Error('--since tiene que ser un instante ISO.')

  const out = await readOnly(target, (query) => probe(query, org, since))
  const meta = out.meta as Row
  const file = writeGateFile(
    `sonda-${etiqueta}-${target.kind}-${fileStamp(String(meta.ahora))}.json`,
    { etiqueta, destino: target.kind, ...out },
  )
  console.log(`Sonda «${etiqueta}» · ${gateTargetLabel(target)} · ${String(meta.ahora)}`)
  for (const line of summary(out)) console.log(line)
  console.log(`Guardada en ${file}`)
}

runGateTool(main, USAGE)
