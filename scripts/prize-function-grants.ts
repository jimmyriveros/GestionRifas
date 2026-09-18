/**
 * Quién ejecuta cada función de premios configurables (D-207, migración `0066`).
 *
 * POR QUÉ EXISTE (I-132)
 *
 * Las migraciones `0058`–`0065` crean o redefinen 62 funciones. En el proyecto
 * alojado, el privilegio por defecto de `postgres` para las funciones de
 * `public` concede EXECUTE a `service_role`; en la pila local no. El preflight
 * de la Puerta 1 (2026-09-17) lo vio antes de escribir nada: aplicadas allí, 35
 * funciones de la entrega —casi todas internas y `SECURITY DEFINER`, algunas
 * que escriben versiones, períodos, recompensas o avisos— habrían quedado
 * ejecutables por la service role, y ninguna prueba local podía notarlo.
 *
 * Aquí vive la lista EXACTA, una sola vez. La usan la `0066` (que la escribe en
 * SQL y se comprueba a sí misma), `scripts/verify-remote.ts` (contra el
 * proyecto real) y `tests/db/prize-function-privileges.test.ts`. Cambiar quién
 * ejecuta una función de premios es cambiar este archivo, una migración nueva y
 * las tres cosas a la vez.
 */

/** Las seis RPC del panel. Autorizan por la capacidad y por `auth.uid()`: solo una sesión. */
export const PRIZE_SESSION_RPCS = [
  'archive_raffle_prize(uuid,uuid)',
  'create_raffle_prize(uuid,text,raffle_prize_category,raffle_prize_reward_mode,jsonb,lottery_match_field,jsonb,raffle_prize_digits,text)',
  'publish_raffle_prize_version(uuid,uuid,text,raffle_prize_category,raffle_prize_reward_mode,jsonb,lottery_match_field,raffle_prize_digits,jsonb,text)',
  'raffle_prize_history(uuid,integer,integer)',
  'reorder_raffle_prizes(uuid,uuid[])',
  'restore_raffle_prize(uuid,uuid)',
] as const

/**
 * La proyección de bitácora de D-198, que la entrega redefinió para entender la
 * entidad `raffle_prize`. Conserva su contrato de D-198 —sesión y service_role—,
 * idéntico en los dos entornos porque su `grant` es explícito. No es de esta
 * funcionalidad: su revisión entra en la auditoría global de I-132.
 */
export const PRIZE_D198_PROJECTIONS = ['admin_audit_log(text,uuid,integer,integer)'] as const

/** Las únicas entradas de la service role en esta funcionalidad. */
export const PRIZE_SERVICE_ROLE_ENTRIES = [
  // El script de transición (D-204, D-205): la única vía para que una rifa que
  // ya existía pase a premios configurables. Nunca desde una sesión.
  'transition_raffle_prize_mode(uuid,uuid,text,raffle_status,date,date,jsonb,boolean)',
  // El sincronizador de loterías (D-145): confirmar un resultado, buscar sus
  // coincidencias y avisar, en una transacción. Lo llama `features/lottery/sync.ts`.
  'confirm_lottery_result(lottery_code,text,text,text,text,text,text,jsonb,date,timestamp with time zone,timestamp with time zone)',
] as const

/**
 * Lo que no ejecuta NADIE directamente —ni PUBLIC, ni anon, ni authenticated,
 * ni service_role—. Lo siguen usando las funciones `SECURITY DEFINER` que lo
 * llaman (con los privilegios de su dueño), sus disparadores y los CHECK que se
 * evalúan dentro de ellas.
 */
export const PRIZE_INTERNAL_FUNCTIONS = [
  // Capacidades (D-200)
  'app_capability_catalog()',
  'app_role_default_capabilities(app_role)',
  'has_org_capability(uuid,text)',
  // Calendario, normalización y validación
  'lottery_for_weekday(smallint)',
  'lottery_nominal_weekday(lottery_code)',
  'raffle_prize_weekdays_valid(smallint[])',
  'raffle_prize_rule_covers_weekdays(date,date,smallint[])',
  'raffle_prize_rule_dates(uuid)',
  'raffle_prize_validity(uuid)',
  'raffle_prize_version_problem(uuid,date,date)',
  'raffle_prize_cutoff_problem(uuid[])',
  'raffle_prize_normalized_rules(raffles,jsonb)',
  'raffle_prize_normalized_reward(raffle_prize_reward_mode,jsonb)',
  'raffle_prize_clean_fields(text,raffle_prize_category,lottery_match_field,raffle_prize_digits,text)',
  'raffle_prize_is_material(uuid,uuid)',
  // Escritura de versiones, avisos y auditoría
  'raffle_prize_insert_version(uuid,uuid,uuid,uuid,integer,uuid,raffle_prize_status,text,raffle_prize_category,raffle_prize_reward_mode,jsonb,lottery_match_field,raffle_prize_digits,text,jsonb,uuid)',
  'raffle_prize_notify(uuid,uuid,text,uuid,uuid,integer,text,text,uuid)',
  'raffle_prize_audit_values(raffle_prize_versions,text,boolean,integer)',
  'raffle_prize_reward_json(uuid)',
  'raffle_prize_rules_json(uuid)',
  'raffle_prize_manageable_raffle(uuid)',
  'raffle_prize_lock(uuid)',
  // El motor de coincidencias y sus defensas. `match_lottery_result` solo se
  // alcanza por `confirm_lottery_result` (D-207).
  'match_lottery_result(uuid)',
  'raffle_prize_draw_prizes(uuid[],date,lottery_code,timestamp with time zone)',
  'raffle_prize_versions_at(uuid[],timestamp with time zone)',
  'raffle_prize_applicable_version(uuid,timestamp with time zone)',
  'raffle_prize_draw_cutoff(lottery_draw_schedules)',
  'raffle_prize_draw_mode(uuid,lottery_draw_schedules)',
  'raffle_prize_transition_draw_mode(timestamp with time zone,lottery_draw_schedules)',
  'lottery_ticket_match_prizes_check()',
  'lottery_ticket_match_prizes_immutable()',
  'lottery_ticket_matches_prize_links_check()',
  // Disparadores de las tablas de premios y de rifas
  'raffle_prizes_guard()',
  'raffle_prize_versions_guard()',
  'raffle_prize_versions_require_reward()',
  'raffle_prize_versions_require_rules()',
  'raffle_prize_schedule_rules_check()',
  'raffle_prize_schedule_rules_immutable()',
  'raffle_prize_reward_options_check()',
  'raffle_prize_reward_options_immutable()',
  'raffles_guard_prize_config()',
  'raffles_notify_dates_changed()',
  // Piezas de la transición
  'raffle_prize_transition_apply(uuid,uuid,text,raffle_status,date,date,jsonb)',
  'raffle_prize_transition_configuration(raffles,jsonb)',
  'raffle_prize_transition_open(uuid)',
  'raffle_prize_transition_check_window(raffles,timestamp with time zone)',
  'raffle_prize_transition_window_draws(raffles,timestamp with time zone)',
  'raffle_prize_transition_legacy_summary(raffles,timestamp with time zone)',
  'raffle_prize_transition_played_occurrence(uuid,timestamp with time zone)',
  'raffle_prize_transitions_guard()',
  'raffle_prize_lottery_label(lottery_code)',
  'raffle_prize_raffle_status_phrase(raffle_status)',
  // La redacción auxiliar de D-198, que la entrega redefinió
  'admin_audit_redact(text,jsonb)',
] as const

/**
 * El hallazgo del preflight: las 35 funciones que, con los privilegios por
 * defecto del proyecto alojado, habrían quedado ejecutables por service_role.
 */
export const PREFLIGHT_SERVICE_ROLE_FINDING = [
  'app_capability_catalog()',
  'app_role_default_capabilities(app_role)',
  'has_org_capability(uuid,text)',
  'lottery_ticket_match_prizes_check()',
  'lottery_ticket_match_prizes_immutable()',
  'lottery_ticket_matches_prize_links_check()',
  'raffle_prize_applicable_version(uuid,timestamp with time zone)',
  'raffle_prize_audit_values(raffle_prize_versions,text,boolean,integer)',
  'raffle_prize_clean_fields(text,raffle_prize_category,lottery_match_field,raffle_prize_digits,text)',
  'raffle_prize_cutoff_problem(uuid[])',
  'raffle_prize_draw_cutoff(lottery_draw_schedules)',
  'raffle_prize_draw_prizes(uuid[],date,lottery_code,timestamp with time zone)',
  'raffle_prize_insert_version(uuid,uuid,uuid,uuid,integer,uuid,raffle_prize_status,text,raffle_prize_category,raffle_prize_reward_mode,jsonb,lottery_match_field,raffle_prize_digits,text,jsonb,uuid)',
  'raffle_prize_is_material(uuid,uuid)',
  'raffle_prize_lock(uuid)',
  'raffle_prize_manageable_raffle(uuid)',
  'raffle_prize_normalized_reward(raffle_prize_reward_mode,jsonb)',
  'raffle_prize_normalized_rules(raffles,jsonb)',
  'raffle_prize_notify(uuid,uuid,text,uuid,uuid,integer,text,text,uuid)',
  'raffle_prize_reward_json(uuid)',
  'raffle_prize_reward_options_check()',
  'raffle_prize_reward_options_immutable()',
  'raffle_prize_rule_dates(uuid)',
  'raffle_prize_rules_json(uuid)',
  'raffle_prize_schedule_rules_check()',
  'raffle_prize_schedule_rules_immutable()',
  'raffle_prize_validity(uuid)',
  'raffle_prize_version_problem(uuid,date,date)',
  'raffle_prize_versions_at(uuid[],timestamp with time zone)',
  'raffle_prize_versions_guard()',
  'raffle_prize_versions_require_reward()',
  'raffle_prize_versions_require_rules()',
  'raffle_prizes_guard()',
  'raffles_guard_prize_config()',
  'admin_audit_redact(text,jsonb)',
] as const

// =============================================================================
// El historial de premios ganados (D-208, migraciones `0067` y `0068`; la `0069`
// solo redefine el cuerpo de `prize_award_coverage()` con los mismos privilegios)
//
// Va en una lista APARTE de las 62 de la entrega de premios: la prueba P1-01
// comprueba que la lista de `0058`–`0065` es exactamente la de esas migraciones,
// y meter aquí las de `0067` la rompería diciendo algo falso. Las dos listas se
// comprueban igual, con la misma matriz.
// =============================================================================

/** Las lecturas del historial y el alcance del vendedor: una sesión, nunca la service role. */
export const HISTORY_SESSION_RPCS = [
  'admin_prize_award_totals(uuid,uuid,date,date)',
  'admin_prize_awards(uuid,uuid,date,date,integer,integer)',
  'seller_prize_award_totals(uuid,uuid,date,date)',
  'current_seller_org_ids()',
  'prize_award_coverage()',
  'prize_award_history_start()',
  'seller_prize_awards(uuid,uuid,date,date,integer,integer)',
] as const

/** El cargador de premios reconocidos, como la transición: solo la service role. */
export const HISTORY_SERVICE_ROLE_ENTRIES = [
  'record_declared_prize_awards(uuid,text,jsonb,boolean)',
] as const

/** Lo que no ejecuta nadie directamente: la definición del historial y las defensas. */
export const HISTORY_INTERNAL_FUNCTIONS = [
  'declared_prize_award_plan(uuid,jsonb)',
  'lottery_ticket_matches_number_check()',
  'declared_prize_awards_check()',
  'declared_prize_awards_immutable()',
  'prize_award_rows(uuid[],uuid[],uuid,uuid,date,date)',
  'tickets_guard_matched_numbers()',
] as const

export type ExecuteMatrix = {
  public: boolean
  anon: boolean
  authenticated: boolean
  service_role: boolean
}

/** Las 62 funciones de la entrega con su EXECUTE efectivo esperado. */
export const PRIZE_FUNCTION_GRANTS: ReadonlyArray<{ signature: string; expected: ExecuteMatrix }> = [
  ...PRIZE_SESSION_RPCS.map((signature) => ({
    signature,
    expected: { public: false, anon: false, authenticated: true, service_role: false },
  })),
  ...PRIZE_D198_PROJECTIONS.map((signature) => ({
    signature,
    expected: { public: false, anon: false, authenticated: true, service_role: true },
  })),
  ...PRIZE_SERVICE_ROLE_ENTRIES.map((signature) => ({
    signature,
    expected: { public: false, anon: false, authenticated: false, service_role: true },
  })),
  ...PRIZE_INTERNAL_FUNCTIONS.map((signature) => ({
    signature,
    expected: { public: false, anon: false, authenticated: false, service_role: false },
  })),
]

/** Las 14 funciones del historial de premios ganados (0067 a 0069) con su EXECUTE esperado. */
export const HISTORY_FUNCTION_GRANTS: ReadonlyArray<{
  signature: string
  expected: ExecuteMatrix
}> = [
  ...HISTORY_SESSION_RPCS.map((signature) => ({
    signature,
    expected: { public: false, anon: false, authenticated: true, service_role: false },
  })),
  ...HISTORY_SERVICE_ROLE_ENTRIES.map((signature) => ({
    signature,
    expected: { public: false, anon: false, authenticated: false, service_role: true },
  })),
  ...HISTORY_INTERNAL_FUNCTIONS.map((signature) => ({
    signature,
    expected: { public: false, anon: false, authenticated: false, service_role: false },
  })),
]

/** Nombres de las funciones de la entrega (para detectar una sobrecarga sin clasificar). */
export const PRIZE_FUNCTION_NAMES = [
  ...new Set(PRIZE_FUNCTION_GRANTS.map((f) => f.signature.slice(0, f.signature.indexOf('(')))),
]

export type RemoteCheck = {
  nombre: string
  sql: string
  /** Número de filas que debe devolver. */
  esperado: number
}

const literal = (texto: string) => `'${texto.replace(/'/g, "''")}'`

const matrizSql = (
  grants: ReadonlyArray<{ signature: string; expected: ExecuteMatrix }>,
): string =>
  grants
    .map(
      ({ signature, expected: e }) =>
        `(${literal(signature)}, ${e.public}, ${e.anon}, ${e.authenticated}, ${e.service_role})`,
    )
    .join(',\n              ')

const esperadoSql = matrizSql(PRIZE_FUNCTION_GRANTS)

/**
 * Las comprobaciones de la `0066` que corre `npm run verify:remote`. Las mismas
 * que ejecuta la prueba de base de datos contra la pila local.
 */
export const PRIZE_FUNCTION_CHECKS: RemoteCheck[] = [
  {
    // 0066 (D-207, I-132): cada función de la entrega, con su EXECUTE efectivo
    // exacto para PUBLIC, anon, authenticated y service_role.
    nombre: 'Funciones de premios con EXECUTE distinto de la lista blanca exacta (0066)',
    sql: `with esperado (firma, publico, anonimo, autenticado, servicio) as (
            values
              ${esperadoSql}
          )
          select e.firma || ' -> ' || case when r.oid is null then 'no existe' else concat_ws(', ',
                   case when v.publico is distinct from e.publico then 'PUBLIC=' || v.publico end,
                   case when v.anonimo is distinct from e.anonimo then 'anon=' || v.anonimo end,
                   case when v.autenticado is distinct from e.autenticado then 'authenticated=' || v.autenticado end,
                   case when v.servicio is distinct from e.servicio then 'service_role=' || v.servicio end) end as x
            from esperado e
            cross join lateral (select to_regprocedure('public.' || e.firma)::oid as oid) r
            left join lateral (
              select exists (
                       select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where p.oid = r.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
                     has_function_privilege('anon', r.oid, 'EXECUTE') as anonimo,
                     has_function_privilege('authenticated', r.oid, 'EXECUTE') as autenticado,
                     has_function_privilege('service_role', r.oid, 'EXECUTE') as servicio
               where r.oid is not null
            ) v on true
           where r.oid is null
              or v.publico is distinct from e.publico
              or v.anonimo is distinct from e.anonimo
              or v.autenticado is distinct from e.autenticado
              or v.servicio is distinct from e.servicio`,
    esperado: 0,
  },
  {
    // 0066: el hallazgo del preflight de la Puerta 1. Si reaparece UNO de los 35
    // permisos —por el privilegio por defecto o por un grant nuevo—, falla.
    nombre: 'Alguna de las 35 funciones del preflight ejecutable por service_role (0066)',
    sql: `select f.firma as x
            from unnest(array[${PREFLIGHT_SERVICE_ROLE_FINDING.map(literal).join(', ')}]) as f(firma)
           where to_regprocedure('public.' || f.firma) is null
              or has_function_privilege('service_role', to_regprocedure('public.' || f.firma), 'EXECUTE')`,
    esperado: 0,
  },
  {
    // 0066: una sobrecarga nueva con el nombre de una función de la entrega no
    // puede escapar de la lista.
    nombre: 'Funciones de premios sin clasificar en la lista blanca (0066)',
    sql: `select p.oid::regprocedure::text as x
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = any (array[${PRIZE_FUNCTION_NAMES.map(literal).join(', ')}])
             and p.oid::regprocedure::text <> all (array[${PRIZE_FUNCTION_GRANTS.map((f) => literal(f.signature)).join(', ')}])`,
    esperado: 0,
  },
  {
    // 0067 y 0068 (D-208): las 14 del historial de premios ganados, con la misma
    // matriz exacta. En el proyecto alojado toda función nueva nace ejecutable
    // por `service_role` (I-132), así que ninguna se queda sin comprobar.
    nombre: 'Funciones del historial de premios con EXECUTE distinto de su lista (0067, 0068)',
    sql: `with esperado (firma, publico, anonimo, autenticado, servicio) as (
            values
              ${matrizSql(HISTORY_FUNCTION_GRANTS)}
          )
          select e.firma || ' -> ' || case when r.oid is null then 'no existe' else concat_ws(', ',
                   case when v.publico is distinct from e.publico then 'PUBLIC=' || v.publico end,
                   case when v.anonimo is distinct from e.anonimo then 'anon=' || v.anonimo end,
                   case when v.autenticado is distinct from e.autenticado then 'authenticated=' || v.autenticado end,
                   case when v.servicio is distinct from e.servicio then 'service_role=' || v.servicio end) end as x
            from esperado e
            cross join lateral (select to_regprocedure('public.' || e.firma)::oid as oid) r
            left join lateral (
              select exists (
                       select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where p.oid = r.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
                     has_function_privilege('anon', r.oid, 'EXECUTE') as anonimo,
                     has_function_privilege('authenticated', r.oid, 'EXECUTE') as autenticado,
                     has_function_privilege('service_role', r.oid, 'EXECUTE') as servicio
               where r.oid is not null
            ) v on true
           where r.oid is null
              or v.publico is distinct from e.publico
              or v.anonimo is distinct from e.anonimo
              or v.autenticado is distinct from e.autenticado
              or v.servicio is distinct from e.servicio`,
    esperado: 0,
  },
]
