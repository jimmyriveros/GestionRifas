/**
 * DIAGNÓSTICO PREVIO de la configuración de ganancias, contra el esquema ANTERIOR (`0077`)
 * — D-238, `RUNBOOK` §10.1.
 *
 *   npx tsx scripts/earning-precheck.ts (--local | --production --project-ref <ref>)
 *
 * `commission_agreement_problems()` nace en la propia `0078`, así que no sirve para decidir
 * si se puede aplicar. Esta herramienta responde esa pregunta sobre la base tal como está:
 * SOLO LEE —una transacción `repeatable read read only` de `gate-db.ts`, que falla ante
 * cualquier escritura— y no instala nada. Repite en SQL puro lo que la `0078` comprueba y
 * lo que dejará medido:
 *
 *   LA 0078 SE DETENDRÍA (bloquea, exit 2)
 *     · el esquema no está en `0077` o le falta algo que la `0078` quita o usa;
 *     · la lista de tramos de una organización no cumple BR-G32, o no tiene tramos y tiene
 *       integrantes por tramos que ya cobraron;
 *     · una estructura de tres niveles (I-176);
 *     · un fijo de integrante por encima de $10.000.000 (restricción nueva);
 *     · una fila de `seller_commissions` que el recuento de HOY —el motor de la `0031`—
 *       no reproduce, o que le falta a un jefe con cobros de su equipo: la `0078` recuenta
 *       todo y se deshace si un solo peso cambia. Es la huella de I-180;
 *     · una fila cuyo ledger no la explica por partes (BR-G22).
 *
 *   LA 0078 PASARÍA, Y DESPUÉS LO LISTARÍA `commission_agreement_problems()` (exit 2:
 *   el dueño decide antes de seguir, BR-G35)
 *     · par_incompatible: un integrante que puede ganar más que su padre en una rifa;
 *     · faltante_de_equipo: lo que la empresa ya está poniendo por esos pares;
 *     · rebaja_sin_cubrir: una rebaja concedida que su acuerdo ya no cubre.
 *
 *   INFORMA (no cambia el veredicto): volúmenes y organizaciones sin tramos.
 *
 * Todo con los acuerdos que la `0078` CONSERVA: la mitad para quien no tiene padre y, para
 * un integrante, su fijo o la versión 1 de la lista general —sus `commission_tiers`—.
 *
 * No imprime nombres, correos, teléfonos ni ningún dato de clientes: identificadores de
 * vendedor y de rifa, conteos y cifras. El informe se guarda en `build/gate/` (fuera de Git).
 * Termina en 0 si no hay nada, en 2 si hay algo que detiene la puerta y en 1 sin veredicto.
 */
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
  'Uso: npx tsx scripts/earning-precheck.ts (--local | --production --project-ref <ref>)'

type Row = Record<string, unknown>
export type Severity = 'bloquea' | 'decide' | 'informa'
export type Finding = { codigo: string; gravedad: Severity; titulo: string; filas: Row[] }

/** La tarifa de HOY (motor de la `0031`) de cada vendedor en cada rifa donde cobró. */
const PAID_AND_RATES = `
  pagadas as (
    select t.organization_id, t.raffle_id, t.seller_id, count(*)::int as n,
           coalesce(sum(coalesce(t.base_price, t.sale_price) - t.sale_price), 0)::bigint as rebajas
    from tickets t
    where t.inventory_status = 'assigned' and t.payment_status = 'paid'
    group by 1, 2, 3
  ),
  tarifa as (
    select p.organization_id, p.raffle_id, p.seller_id, p.n, p.rebajas, r.ticket_price,
           m.parent_seller_id,
           case
             when m.profile_id is null then 0::bigint
             when m.parent_seller_id is null then r.ticket_price / 2
             when m.commission_model = 'fixed_per_ticket' then coalesce(m.fixed_commission_amount, 0)
             else coalesce((select ct.rate from commission_tiers ct
                             where ct.organization_id = p.organization_id and ct.min_tickets <= p.n
                             order by ct.min_tickets desc limit 1), 0)
           end as rate
    from pagadas p
    join raffles r on r.id = p.raffle_id
    left join memberships m on m.profile_id = p.seller_id and m.organization_id = p.organization_id
  )`

/** Lo que el recuento de hoy dice que debería tener cada fila, y lo que tiene. */
export const RECOUNT_SQL = `
  with ${PAID_AND_RATES},
  equipo as (
    select t.organization_id, t.raffle_id, t.parent_seller_id as seller_id,
           sum(t.n)::int as team_n,
           sum(t.n::bigint * greatest(0, t.ticket_price / 2 - t.rate))::bigint as team_earned
    from tarifa t
    where t.parent_seller_id is not null
    group by 1, 2, 3
  ),
  esperado as (
    select coalesce(t.organization_id, e.organization_id) as organization_id,
           coalesce(t.raffle_id, e.raffle_id) as raffle_id,
           coalesce(t.seller_id, e.seller_id) as seller_id,
           coalesce(t.n, 0) as tickets_paid,
           coalesce(t.rate, 0)::bigint as rate,
           greatest(0, coalesce(t.n, 0)::bigint * coalesce(t.rate, 0) - coalesce(t.rebajas, 0))::bigint as earned,
           coalesce(e.team_n, 0) as team_tickets_paid,
           coalesce(e.team_earned, 0)::bigint as team_earned
    from tarifa t
    full join equipo e on e.raffle_id = t.raffle_id and e.seller_id = t.seller_id
  )
  select coalesce(sc.organization_id, x.organization_id) as organization_id,
         coalesce(sc.raffle_id, x.raffle_id) as raffle_id,
         coalesce(sc.seller_id, x.seller_id) as seller_id,
         sc.seller_id is null as falta_la_fila,
         sc.tickets_paid as guardado_boletas, x.tickets_paid as recuento_boletas,
         sc.rate as guardada_tarifa, x.rate as recuento_tarifa,
         sc.earned as guardado_propio, x.earned as recuento_propio,
         sc.team_tickets_paid as guardado_boletas_equipo, x.team_tickets_paid as recuento_boletas_equipo,
         sc.team_earned as guardado_equipo, x.team_earned as recuento_equipo
  from seller_commissions sc
  full join esperado x on x.raffle_id = sc.raffle_id and x.seller_id = sc.seller_id
  where (coalesce(sc.tickets_paid, 0), coalesce(sc.earned, 0), coalesce(sc.team_tickets_paid, 0),
         coalesce(sc.team_earned, 0))
        is distinct from
        (coalesce(x.tickets_paid, 0), coalesce(x.earned, 0), coalesce(x.team_tickets_paid, 0),
         coalesce(x.team_earned, 0))
     or (coalesce(sc.tickets_paid, 0) > 0 and sc.rate is distinct from x.rate)
  order by 1, 2, 3`

/** BR-G22: filas que su ledger no explica por partes. */
export const LEDGER_SQL = `
  select sc.organization_id, sc.raffle_id, sc.seller_id,
         sc.earned as guardado_propio, l.propio as ledger_propio,
         sc.team_earned as guardado_equipo, l.equipo as ledger_equipo
  from seller_commissions sc
  cross join lateral (
    select coalesce(sum(amount) filter (where not team_movement), 0)::bigint as propio,
           coalesce(sum(amount) filter (where team_movement), 0)::bigint as equipo
    from commission_ledger l
    where l.raffle_id = sc.raffle_id and l.seller_id = sc.seller_id
  ) l
  where sc.earned <> l.propio or sc.team_earned <> l.equipo
  order by 1, 2, 3`

/** BR-G32 por organización, con los tramos que heredará la versión 1. */
export const TIERS_SQL = `
  select o.id as organization_id,
         count(ct.min_tickets)::int as tramos,
         min(ct.min_tickets) as primero,
         max(ct.min_tickets) as ultimo_desde,
         max(ct.rate) as tarifa_maxima,
         coalesce(bool_or(ct.rate <= ct.anterior), false) as no_crece,
         exists (
           select 1 from memberships m
           join seller_commissions sc on sc.seller_id = m.profile_id and sc.organization_id = m.organization_id
           where m.organization_id = o.id and m.parent_seller_id is not null
             and m.commission_model = 'tiered' and sc.tickets_paid > 0
         ) as integrantes_por_tramos_que_cobraron
  from organizations o
  left join (
    select ct.organization_id, ct.min_tickets, ct.rate,
           lag(ct.rate) over (partition by ct.organization_id order by ct.min_tickets) as anterior
    from commission_tiers ct
  ) ct on ct.organization_id = o.id
  group by o.id
  order by o.id`

export const THREE_LEVELS_SQL = `
  select h.organization_id, h.profile_id as seller_id, h.parent_seller_id as parent_id
  from memberships h
  where h.parent_seller_id is not null
    and exists (select 1 from memberships c
                where c.parent_seller_id = h.profile_id and c.organization_id = h.organization_id)
  order by 1, 2`

export const FIXED_CAP_SQL = `
  select organization_id, profile_id as seller_id, fixed_commission_amount
  from memberships where fixed_commission_amount > 10000000 order by 1, 2`

/**
 * La tarifa más alta y la de un conteo dado del acuerdo de equipo que conserva cada
 * integrante: su fijo, o la versión 1 de la lista general.
 */
const CHILD_AGREEMENT = `
  hijos as (
    select h.organization_id, h.profile_id as seller_id, h.parent_seller_id as parent_id,
           h.commission_model, h.fixed_commission_amount
    from memberships h
    join memberships p on p.profile_id = h.parent_seller_id and p.organization_id = h.organization_id
    where h.parent_seller_id is not null and h.role = 'seller'
  )`

/** par_incompatible: el integrante puede ganar más que la mitad de su padre en una rifa. */
export const PAIRS_SQL = `
  with ${CHILD_AGREEMENT},
  vendidas as (
    select t.raffle_id, t.seller_id, count(*)::int as k
    from tickets t where t.inventory_status = 'assigned' group by 1, 2
  )
  select h.organization_id, h.seller_id, h.parent_id, r.id as raffle_id, r.status::text as estado,
         r.ticket_price / 2 as tarifa_padre,
         case when r.status in ('draft', 'active') then null else v.k end as boletas_vendidas,
         x.tarifa_hijo
  from hijos h
  join raffles r on r.organization_id = h.organization_id and r.status <> 'cancelled'
  left join vendidas v on v.raffle_id = r.id and v.seller_id = h.seller_id
  cross join lateral (
    select case
      when h.commission_model = 'fixed_per_ticket' then h.fixed_commission_amount
      when r.status in ('draft', 'active') then
        (select max(ct.rate) from commission_tiers ct where ct.organization_id = h.organization_id)
      else
        (select ct.rate from commission_tiers ct
          where ct.organization_id = h.organization_id and ct.min_tickets <= coalesce(v.k, 0)
          order by ct.min_tickets desc limit 1)
    end as tarifa_hijo
  ) x
  where (r.status in ('draft', 'active') or (r.status = 'closed' and coalesce(v.k, 0) > 0))
    and x.tarifa_hijo > r.ticket_price / 2
  order by 1, 3, 2, 4`

/** faltante_de_equipo: lo que la empresa ya pone por esos pares, por jefe y rifa. */
export const SHORTFALL_SQL = `
  with ${PAID_AND_RATES}
  select t.organization_id, t.parent_seller_id as seller_id, t.raffle_id,
         sum(t.n::bigint * greatest(0, t.rate - t.ticket_price / 2))::bigint as faltante
  from tarifa t
  where t.parent_seller_id is not null
  group by 1, 2, 3
  having sum(t.n::bigint * greatest(0, t.rate - t.ticket_price / 2)) > 0
  order by 1, 2, 3`

/** rebaja_sin_cubrir: una rebaja concedida mayor que la tarifa mínima de su acuerdo. */
export const DISCOUNTS_SQL = `
  select t.organization_id, t.seller_id, t.raffle_id,
         max(coalesce(t.base_price, t.sale_price) - t.sale_price) as rebaja_maxima,
         min(case
           when m.parent_seller_id is null then r.ticket_price / 2
           when m.commission_model = 'fixed_per_ticket' then m.fixed_commission_amount
           else (select min(ct.rate) from commission_tiers ct where ct.organization_id = t.organization_id)
         end) as tarifa_minima
  from tickets t
  join raffles r on r.id = t.raffle_id
  join memberships m on m.profile_id = t.seller_id and m.organization_id = t.organization_id
  where t.inventory_status = 'assigned' and m.role = 'seller'
  group by 1, 2, 3
  having max(coalesce(t.base_price, t.sale_price) - t.sale_price) > min(case
           when m.parent_seller_id is null then r.ticket_price / 2
           when m.commission_model = 'fixed_per_ticket' then m.fixed_commission_amount
           else (select min(ct.rate) from commission_tiers ct where ct.organization_id = t.organization_id)
         end)
  order by 1, 2, 3`

/** Lo que la `0078` quita o usa sin `if exists`, y lo que crea: tiene que no estar. */
export const SCHEMA_SQL = `
  select 'falta' as problema, x.objeto from (values
    ('table:commission_tiers', to_regclass('public.commission_tiers') is not null),
    ('function:commission_rate_for(uuid,integer)', to_regprocedure('public.commission_rate_for(uuid,integer)') is not null),
    ('function:commission_team_earned(uuid,uuid,uuid)', to_regprocedure('public.commission_team_earned(uuid,uuid,uuid)') is not null),
    ('function:team_max_fixed_commission(uuid)', to_regprocedure('public.team_max_fixed_commission(uuid)') is not null),
    ('function:commission_summary(uuid)', to_regprocedure('public.commission_summary(uuid)') is not null),
    ('function:memberships_validate_commission()', to_regprocedure('public.memberships_validate_commission()') is not null),
    ('function:organizations_seed_commission_tiers()', to_regprocedure('public.organizations_seed_commission_tiers()') is not null),
    ('function:recalc_seller_commission(uuid,uuid,uuid,commission_movement,uuid,uuid)',
       to_regprocedure('public.recalc_seller_commission(uuid,uuid,uuid,commission_movement,uuid,uuid)') is not null),
    ('function:format_cop(bigint)', to_regprocedure('public.format_cop(bigint)') is not null),
    ('function:has_org_capability(uuid,text)', to_regprocedure('public.has_org_capability(uuid,text)') is not null),
    ('function:team_member_guard(uuid)', to_regprocedure('public.team_member_guard(uuid)') is not null),
    ('function:current_profile_leads_team(uuid)', to_regprocedure('public.current_profile_leads_team(uuid)') is not null),
    ('trigger:memberships_validate_commission', exists (select 1 from pg_trigger where tgname = 'memberships_validate_commission' and tgrelid = 'public.memberships'::regclass)),
    ('trigger:memberships_sync_commission', exists (select 1 from pg_trigger where tgname = 'memberships_sync_commission' and tgrelid = 'public.memberships'::regclass)),
    ('trigger:organizations_seed_commission_tiers', exists (select 1 from pg_trigger where tgname = 'organizations_seed_commission_tiers' and tgrelid = 'public.organizations'::regclass))
  ) as x(objeto, existe)
  where not x.existe
  union all
  select 'sobra', x.objeto from (values
    ('type:commission_agreement_mode', to_regtype('public.commission_agreement_mode') is not null),
    ('table:commission_tier_lists', to_regclass('public.commission_tier_lists') is not null),
    ('column:memberships.direct_commission_mode', exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'memberships' and column_name = 'direct_commission_mode')),
    ('column:seller_commissions.tier_tickets_paid', exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'seller_commissions' and column_name = 'tier_tickets_paid'))
  ) as x(objeto, existe)
  where x.existe`

export const VOLUME_SQL = `
  select
    (select max(version) from supabase_migrations.schema_migrations) as ultima_migracion,
    (select count(*) from supabase_migrations.schema_migrations where version >= '0078') as posteriores_a_0077,
    (select count(*) from organizations)::int as organizaciones,
    (select count(*) from memberships where role = 'seller')::int as vendedores,
    (select count(distinct parent_seller_id) from memberships where parent_seller_id is not null)::int as jefes,
    (select count(*) from memberships where parent_seller_id is not null and commission_model = 'tiered')::int as integrantes_por_tramos,
    (select count(*) from memberships where parent_seller_id is not null and commission_model = 'fixed_per_ticket')::int as integrantes_fijos,
    (select count(*) from raffles)::int as rifas,
    (select count(*) from tickets)::int as boletas,
    (select count(*) from tickets where inventory_status = 'assigned' and payment_status = 'paid')::int as boletas_cobradas,
    (select count(*) from seller_commissions)::int as filas_de_comision,
    (select count(*) from commission_ledger)::int as filas_de_ledger`

/** Qué dice cada hallazgo de BR-G32 sobre una organización. */
export function tierProblems(row: Row): string[] {
  const tramos = Number(row.tramos)
  const problems: string[] = []
  if (tramos === 0) {
    if (row.integrantes_por_tramos_que_cobraron === true) {
      problems.push('sin tramos y con integrantes por tramos que ya cobraron')
    }
    return problems
  }
  if (tramos > 20) problems.push(`${tramos} tramos (máximo 20)`)
  if (Number(row.primero) !== 1) problems.push(`el primer tramo empieza en ${row.primero}`)
  if (Number(row.ultimo_desde) > 100_000)
    problems.push('un tramo empieza después de la boleta 100.000')
  if (Number(row.tarifa_maxima) > 10_000_000) problems.push('una tarifa pasa de $10.000.000')
  if (row.no_crece === true) problems.push('un tramo no paga más que el anterior')
  return problems
}

/** El veredicto: lo más grave manda. */
export function verdict(findings: Finding[]): 'limpio' | 'bloquea' | 'decide' {
  const withRows = findings.filter((f) => f.filas.length > 0)
  if (withRows.some((f) => f.gravedad === 'bloquea')) return 'bloquea'
  if (withRows.some((f) => f.gravedad === 'decide')) return 'decide'
  return 'limpio'
}

async function diagnose(query: Query): Promise<{ volumen: Row; hallazgos: Finding[] }> {
  const [volumen] = await query(VOLUME_SQL)
  const hallazgos: Finding[] = []

  const esquema = await query(SCHEMA_SQL)
  hallazgos.push({
    codigo: 'esquema',
    gravedad: 'bloquea',
    titulo: 'El esquema no es el de 0077: la 0078 no se puede aplicar tal cual',
    filas: [
      ...(volumen!.ultima_migracion !== '0077'
        ? [{ problema: 'ultima_migracion', objeto: String(volumen!.ultima_migracion) }]
        : []),
      ...esquema,
    ],
  })
  // Con la 0078 ya aplicada, las consultas de abajo leen tablas que ya no existen.
  if (esquema.some((r) => r.problema === 'sobra' || r.objeto === 'table:commission_tiers')) {
    return { volumen: volumen!, hallazgos }
  }

  const tramos = await query(TIERS_SQL)
  hallazgos.push({
    codigo: 'tramos',
    gravedad: 'bloquea',
    titulo: 'Tramos de una organización que no cumplen BR-G32: la 0078 se detiene diciendo cuál',
    filas: tramos
      .map((r) => ({ organization_id: r.organization_id, problemas: tierProblems(r) }))
      .filter((r) => r.problemas.length > 0),
  })
  hallazgos.push({
    codigo: 'sin_tramos',
    gravedad: 'informa',
    titulo: 'Organizaciones sin tramos: recibirán los de siempre como versión 1',
    filas: tramos
      .filter((r) => Number(r.tramos) === 0 && r.integrantes_por_tramos_que_cobraron !== true)
      .map((r) => ({ organization_id: r.organization_id })),
  })
  hallazgos.push({
    codigo: 'tres_niveles',
    gravedad: 'bloquea',
    titulo: 'Estructuras de tres niveles (I-176): la 0078 se detiene',
    filas: await query(THREE_LEVELS_SQL),
  })
  hallazgos.push({
    codigo: 'fijo_fuera_de_rango',
    gravedad: 'bloquea',
    titulo: 'Fijos de integrante por encima de $10.000.000: la restricción nueva no se puede crear',
    filas: await query(FIXED_CAP_SQL),
  })
  hallazgos.push({
    codigo: 'recuento_distinto',
    gravedad: 'bloquea',
    titulo:
      'Filas que el recuento de hoy no reproduce, o que le faltan a un jefe con cobros de su equipo: la 0078 recuenta y se deshace (I-180)',
    filas: await query(RECOUNT_SQL),
  })
  hallazgos.push({
    codigo: 'ledger_por_partes',
    gravedad: 'bloquea',
    titulo: 'Filas que su ledger no explica por partes (BR-G22): la 0078 se detiene',
    filas: await query(LEDGER_SQL),
  })
  hallazgos.push({
    codigo: 'par_incompatible',
    gravedad: 'decide',
    titulo: 'Integrantes que pueden ganar más que la mitad de su padre en una rifa (BR-G28)',
    filas: await query(PAIRS_SQL),
  })
  hallazgos.push({
    codigo: 'faltante_de_equipo',
    gravedad: 'decide',
    titulo: 'Lo que la empresa ya pone por esos pares (quedará en team_shortfall, BR-G35)',
    filas: await query(SHORTFALL_SQL),
  })
  hallazgos.push({
    codigo: 'rebaja_sin_cubrir',
    gravedad: 'decide',
    titulo: 'Rebajas concedidas que el acuerdo conservado ya no cubre (BR-G18, BR-G31)',
    filas: await query(DISCOUNTS_SQL),
  })
  return { volumen: volumen!, hallazgos }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2), { switches: [], valued: [] })
  const target = gateTarget(parsed)

  const { ahora, resultado } = await readOnly(target, async (query) => {
    const [meta] = await query(`select now() as ahora`)
    return {
      ahora: new Date(meta!.ahora as string).toISOString(),
      resultado: await diagnose(query),
    }
  })

  const veredicto = verdict(resultado.hallazgos)
  const file = writeGateFile(
    `diagnostico-0078-${target.kind === 'local' ? 'local' : 'produccion'}-${fileStamp(ahora)}.json`,
    { destino: gateTargetLabel(target), ahora, veredicto, ...resultado },
  )

  console.log(
    `Diagnóstico previo de la 0078 · ${gateTargetLabel(target)} · ${ahora} · solo lectura`,
  )
  console.log('Volumen:', JSON.stringify(resultado.volumen))
  for (const h of resultado.hallazgos) {
    const marca = h.filas.length === 0 ? 'OK    ' : h.gravedad === 'informa' ? 'INFO  ' : 'FALLA '
    console.log(`${marca} [${h.gravedad}] ${h.titulo}: ${h.filas.length}`)
    for (const fila of h.filas.slice(0, 10)) console.log(`         · ${JSON.stringify(fila)}`)
    if (h.filas.length > 10)
      console.log(`         · … y ${h.filas.length - 10} más (ver el informe)`)
  }
  console.log(
    veredicto === 'limpio'
      ? '\nVEREDICTO: nada que impida aplicar la 0078 ni nada que decidir antes.'
      : veredicto === 'bloquea'
        ? '\nVEREDICTO: DETENER. La 0078 se detendría o cambiaría dinero con estos datos. No se aplica nada; decide el dueño (RUNBOOK §10.1).'
        : '\nVEREDICTO: DETENER hasta que el dueño decida. La 0078 pasaría, pero dejaría medidos estos problemas (BR-G35).',
  )
  console.log(`Informe: ${file}`)
  process.exit(veredicto === 'limpio' ? 0 : 2)
}

// Solo al ejecutarlo, no al importarlo (las pruebas unitarias importan las consultas).
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/earning-precheck.ts')) {
  runGateTool(main, USAGE)
}
