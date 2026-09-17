-- =============================================================================
-- 0066_prize_function_privileges.sql
-- Quien ejecuta cada funcion de premios configurables: una lista explicita
--
-- Referencia normativa: docs/DECISIONS.md D-207; docs/SECURITY.md §4.23;
-- docs/KNOWN_ISSUES.md I-132. Fuente unica de la lista:
-- scripts/prize-function-grants.ts.
--
-- POR QUE
--
-- El preflight de la Puerta 1 (2026-09-17) leyo en el proyecto real, ANTES de
-- escribir nada, que el privilegio por defecto de `postgres` para las funciones
-- de `public` concede EXECUTE a `service_role`. En la pila local no. Con
-- 0058–0065 aplicadas alli, 35 funciones de esta entrega —casi todas internas y
-- SECURITY DEFINER, algunas que escriben versiones, periodos, recompensas o
-- avisos— habrian quedado ejecutables por la service role, y ninguna prueba
-- local podia verlo. Es la familia de I-078 (authenticated) e I-111, ahora con
-- service_role. No se aplico nada en produccion.
--
-- QUE HACE
--
-- Para CADA una de las 62 funciones que crean o redefinen 0058–0065 quita
-- EXECUTE a PUBLIC, anon, authenticated y service_role, y concede SOLO:
--
--   authenticated   las seis RPC del panel de premios, que autorizan por la
--                   capacidad `raffles.prizes.manage` y por auth.uid().
--   authenticated y
--   service_role    admin_audit_log: el contrato de D-198, que la entrega solo
--                   redefinio para leer la entidad `raffle_prize`.
--   service_role    transition_raffle_prize_mode (el script de transicion,
--                   D-204 y D-205) y confirm_lottery_result (el sincronizador,
--                   D-145).
--
-- Las otras 53 —capacidades, calendario, normalizacion, validacion, escritura
-- de versiones, avisos, auditoria auxiliar, el motor (match_lottery_result, que
-- solo se alcanza por confirm_lottery_result) y sus defensas, los disparadores y
-- las piezas de la transicion— no las ejecuta NADIE directamente. Las siguen
-- usando las funciones SECURITY DEFINER que las llaman, con los privilegios de
-- su dueno; los disparadores no comprueban EXECUTE al dispararse, y los CHECK se
-- evaluan dentro de esas mismas funciones.
--
-- Al final se comprueba a si misma: si el EXECUTE EFECTIVO de alguna de las 62
-- no es exactamente el esperado —en local o en el proyecto alojado, con sus
-- privilegios por defecto o sin ellos—, o si aparece una sobrecarga sin
-- clasificar, la migracion falla y no deja nada.
--
-- QUE NO HACE
--
-- No cambia los privilegios por defecto del esquema (auditoria aparte, I-132),
-- ni funciones anteriores a la entrega que esta no redefinio, ni tablas, ni
-- secuencias (I-130), ni datos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nadie, para las 62
-- -----------------------------------------------------------------------------

revoke execute on function archive_raffle_prize(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function create_raffle_prize(uuid, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, jsonb, raffle_prize_digits, text) from public, anon, authenticated, service_role;
revoke execute on function publish_raffle_prize_version(uuid, uuid, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, raffle_prize_digits, jsonb, text) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_history(uuid, integer, integer) from public, anon, authenticated, service_role;
revoke execute on function reorder_raffle_prizes(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke execute on function restore_raffle_prize(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function admin_audit_log(text, uuid, integer, integer) from public, anon, authenticated, service_role;
revoke execute on function transition_raffle_prize_mode(uuid, uuid, text, raffle_status, date, date, jsonb, boolean) from public, anon, authenticated, service_role;
revoke execute on function confirm_lottery_result(lottery_code, text, text, text, text, text, text, jsonb, date, timestamp with time zone, timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function app_capability_catalog() from public, anon, authenticated, service_role;
revoke execute on function app_role_default_capabilities(app_role) from public, anon, authenticated, service_role;
revoke execute on function has_org_capability(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function lottery_for_weekday(smallint) from public, anon, authenticated, service_role;
revoke execute on function lottery_nominal_weekday(lottery_code) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_weekdays_valid(smallint[]) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_rule_covers_weekdays(date, date, smallint[]) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_rule_dates(uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_validity(uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_version_problem(uuid, date, date) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_cutoff_problem(uuid[]) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_normalized_rules(raffles, jsonb) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_normalized_reward(raffle_prize_reward_mode, jsonb) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_clean_fields(text, raffle_prize_category, lottery_match_field, raffle_prize_digits, text) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_is_material(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_insert_version(uuid, uuid, uuid, uuid, integer, uuid, raffle_prize_status, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, raffle_prize_digits, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_notify(uuid, uuid, text, uuid, uuid, integer, text, text, uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_audit_values(raffle_prize_versions, text, boolean, integer) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_reward_json(uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_rules_json(uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_manageable_raffle(uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_lock(uuid) from public, anon, authenticated, service_role;
revoke execute on function match_lottery_result(uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_draw_prizes(uuid[], date, lottery_code, timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_versions_at(uuid[], timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_applicable_version(uuid, timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_draw_cutoff(lottery_draw_schedules) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_draw_mode(uuid, lottery_draw_schedules) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_draw_mode(timestamp with time zone, lottery_draw_schedules) from public, anon, authenticated, service_role;
revoke execute on function lottery_ticket_match_prizes_check() from public, anon, authenticated, service_role;
revoke execute on function lottery_ticket_match_prizes_immutable() from public, anon, authenticated, service_role;
revoke execute on function lottery_ticket_matches_prize_links_check() from public, anon, authenticated, service_role;
revoke execute on function raffle_prizes_guard() from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_versions_guard() from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_versions_require_reward() from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_versions_require_rules() from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_schedule_rules_check() from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_schedule_rules_immutable() from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_reward_options_check() from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_reward_options_immutable() from public, anon, authenticated, service_role;
revoke execute on function raffles_guard_prize_config() from public, anon, authenticated, service_role;
revoke execute on function raffles_notify_dates_changed() from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_apply(uuid, uuid, text, raffle_status, date, date, jsonb) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_configuration(raffles, jsonb) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_open(uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_check_window(raffles, timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_window_draws(raffles, timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_legacy_summary(raffles, timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_played_occurrence(uuid, timestamp with time zone) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transitions_guard() from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_lottery_label(lottery_code) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_raffle_status_phrase(raffle_status) from public, anon, authenticated, service_role;
revoke execute on function admin_audit_redact(text, jsonb) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Las seis RPC del panel: solo una sesion
-- -----------------------------------------------------------------------------

grant execute on function archive_raffle_prize(uuid, uuid) to authenticated;
grant execute on function create_raffle_prize(uuid, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, jsonb, raffle_prize_digits, text) to authenticated;
grant execute on function publish_raffle_prize_version(uuid, uuid, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, raffle_prize_digits, jsonb, text) to authenticated;
grant execute on function raffle_prize_history(uuid, integer, integer) to authenticated;
grant execute on function reorder_raffle_prizes(uuid, uuid[]) to authenticated;
grant execute on function restore_raffle_prize(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. La proyeccion de bitacora de D-198: su contrato de siempre
-- -----------------------------------------------------------------------------

grant execute on function admin_audit_log(text, uuid, integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Las dos entradas de la service role
-- -----------------------------------------------------------------------------

grant execute on function transition_raffle_prize_mode(uuid, uuid, text, raffle_status, date, date, jsonb, boolean) to service_role;
grant execute on function confirm_lottery_result(lottery_code, text, text, text, text, text, text, jsonb, date, timestamp with time zone, timestamp with time zone) to service_role;

-- -----------------------------------------------------------------------------
-- 5. La migracion se comprueba a si misma
-- -----------------------------------------------------------------------------

do $$
declare
  v_problemas text;
begin
  with esperado (firma, publico, anonimo, autenticado, servicio) as (
    values
      ('archive_raffle_prize(uuid,uuid)', false, false, true, false),
      ('create_raffle_prize(uuid,text,raffle_prize_category,raffle_prize_reward_mode,jsonb,lottery_match_field,jsonb,raffle_prize_digits,text)', false, false, true, false),
      ('publish_raffle_prize_version(uuid,uuid,text,raffle_prize_category,raffle_prize_reward_mode,jsonb,lottery_match_field,raffle_prize_digits,jsonb,text)', false, false, true, false),
      ('raffle_prize_history(uuid,integer,integer)', false, false, true, false),
      ('reorder_raffle_prizes(uuid,uuid[])', false, false, true, false),
      ('restore_raffle_prize(uuid,uuid)', false, false, true, false),
      ('admin_audit_log(text,uuid,integer,integer)', false, false, true, true),
      ('transition_raffle_prize_mode(uuid,uuid,text,raffle_status,date,date,jsonb,boolean)', false, false, false, true),
      ('confirm_lottery_result(lottery_code,text,text,text,text,text,text,jsonb,date,timestamp with time zone,timestamp with time zone)', false, false, false, true),
      ('app_capability_catalog()', false, false, false, false),
      ('app_role_default_capabilities(app_role)', false, false, false, false),
      ('has_org_capability(uuid,text)', false, false, false, false),
      ('lottery_for_weekday(smallint)', false, false, false, false),
      ('lottery_nominal_weekday(lottery_code)', false, false, false, false),
      ('raffle_prize_weekdays_valid(smallint[])', false, false, false, false),
      ('raffle_prize_rule_covers_weekdays(date,date,smallint[])', false, false, false, false),
      ('raffle_prize_rule_dates(uuid)', false, false, false, false),
      ('raffle_prize_validity(uuid)', false, false, false, false),
      ('raffle_prize_version_problem(uuid,date,date)', false, false, false, false),
      ('raffle_prize_cutoff_problem(uuid[])', false, false, false, false),
      ('raffle_prize_normalized_rules(raffles,jsonb)', false, false, false, false),
      ('raffle_prize_normalized_reward(raffle_prize_reward_mode,jsonb)', false, false, false, false),
      ('raffle_prize_clean_fields(text,raffle_prize_category,lottery_match_field,raffle_prize_digits,text)', false, false, false, false),
      ('raffle_prize_is_material(uuid,uuid)', false, false, false, false),
      ('raffle_prize_insert_version(uuid,uuid,uuid,uuid,integer,uuid,raffle_prize_status,text,raffle_prize_category,raffle_prize_reward_mode,jsonb,lottery_match_field,raffle_prize_digits,text,jsonb,uuid)', false, false, false, false),
      ('raffle_prize_notify(uuid,uuid,text,uuid,uuid,integer,text,text,uuid)', false, false, false, false),
      ('raffle_prize_audit_values(raffle_prize_versions,text,boolean,integer)', false, false, false, false),
      ('raffle_prize_reward_json(uuid)', false, false, false, false),
      ('raffle_prize_rules_json(uuid)', false, false, false, false),
      ('raffle_prize_manageable_raffle(uuid)', false, false, false, false),
      ('raffle_prize_lock(uuid)', false, false, false, false),
      ('match_lottery_result(uuid)', false, false, false, false),
      ('raffle_prize_draw_prizes(uuid[],date,lottery_code,timestamp with time zone)', false, false, false, false),
      ('raffle_prize_versions_at(uuid[],timestamp with time zone)', false, false, false, false),
      ('raffle_prize_applicable_version(uuid,timestamp with time zone)', false, false, false, false),
      ('raffle_prize_draw_cutoff(lottery_draw_schedules)', false, false, false, false),
      ('raffle_prize_draw_mode(uuid,lottery_draw_schedules)', false, false, false, false),
      ('raffle_prize_transition_draw_mode(timestamp with time zone,lottery_draw_schedules)', false, false, false, false),
      ('lottery_ticket_match_prizes_check()', false, false, false, false),
      ('lottery_ticket_match_prizes_immutable()', false, false, false, false),
      ('lottery_ticket_matches_prize_links_check()', false, false, false, false),
      ('raffle_prizes_guard()', false, false, false, false),
      ('raffle_prize_versions_guard()', false, false, false, false),
      ('raffle_prize_versions_require_reward()', false, false, false, false),
      ('raffle_prize_versions_require_rules()', false, false, false, false),
      ('raffle_prize_schedule_rules_check()', false, false, false, false),
      ('raffle_prize_schedule_rules_immutable()', false, false, false, false),
      ('raffle_prize_reward_options_check()', false, false, false, false),
      ('raffle_prize_reward_options_immutable()', false, false, false, false),
      ('raffles_guard_prize_config()', false, false, false, false),
      ('raffles_notify_dates_changed()', false, false, false, false),
      ('raffle_prize_transition_apply(uuid,uuid,text,raffle_status,date,date,jsonb)', false, false, false, false),
      ('raffle_prize_transition_configuration(raffles,jsonb)', false, false, false, false),
      ('raffle_prize_transition_open(uuid)', false, false, false, false),
      ('raffle_prize_transition_check_window(raffles,timestamp with time zone)', false, false, false, false),
      ('raffle_prize_transition_window_draws(raffles,timestamp with time zone)', false, false, false, false),
      ('raffle_prize_transition_legacy_summary(raffles,timestamp with time zone)', false, false, false, false),
      ('raffle_prize_transition_played_occurrence(uuid,timestamp with time zone)', false, false, false, false),
      ('raffle_prize_transitions_guard()', false, false, false, false),
      ('raffle_prize_lottery_label(lottery_code)', false, false, false, false),
      ('raffle_prize_raffle_status_phrase(raffle_status)', false, false, false, false),
      ('admin_audit_redact(text,jsonb)', false, false, false, false)
  ),
  resuelto as (
    select e.*, to_regprocedure('public.' || e.firma)::oid as funcion from esperado e
  ),
  efectivo as (
    select r.*,
           exists (
             select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = r.funcion and a.grantee = 0 and a.privilege_type = 'EXECUTE'
           ) as v_publico,
           case when r.funcion is not null then has_function_privilege('anon', r.funcion, 'EXECUTE') end as v_anonimo,
           case when r.funcion is not null then has_function_privilege('authenticated', r.funcion, 'EXECUTE') end as v_autenticado,
           case when r.funcion is not null then has_function_privilege('service_role', r.funcion, 'EXECUTE') end as v_servicio
      from resuelto r
  )
  select string_agg(
           firma || case when funcion is null then ' no existe' else ' (PUBLIC=' || v_publico || ', anon=' || v_anonimo
             || ', authenticated=' || v_autenticado || ', service_role=' || v_servicio || ')' end,
           '; ' order by firma)
    into v_problemas
    from efectivo
   where funcion is null
      or v_publico is distinct from publico
      or v_anonimo is distinct from anonimo
      or v_autenticado is distinct from autenticado
      or v_servicio is distinct from servicio;

  if v_problemas is not null then
    raise exception 'La 0066 no dejó el EXECUTE esperado: %', v_problemas;
  end if;

  select string_agg(p.oid::regprocedure::text, '; ')
    into v_problemas
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = any (array['archive_raffle_prize', 'create_raffle_prize', 'publish_raffle_prize_version', 'raffle_prize_history', 'reorder_raffle_prizes', 'restore_raffle_prize', 'admin_audit_log', 'transition_raffle_prize_mode', 'confirm_lottery_result', 'app_capability_catalog', 'app_role_default_capabilities', 'has_org_capability', 'lottery_for_weekday', 'lottery_nominal_weekday', 'raffle_prize_weekdays_valid', 'raffle_prize_rule_covers_weekdays', 'raffle_prize_rule_dates', 'raffle_prize_validity', 'raffle_prize_version_problem', 'raffle_prize_cutoff_problem', 'raffle_prize_normalized_rules', 'raffle_prize_normalized_reward', 'raffle_prize_clean_fields', 'raffle_prize_is_material', 'raffle_prize_insert_version', 'raffle_prize_notify', 'raffle_prize_audit_values', 'raffle_prize_reward_json', 'raffle_prize_rules_json', 'raffle_prize_manageable_raffle', 'raffle_prize_lock', 'match_lottery_result', 'raffle_prize_draw_prizes', 'raffle_prize_versions_at', 'raffle_prize_applicable_version', 'raffle_prize_draw_cutoff', 'raffle_prize_draw_mode', 'raffle_prize_transition_draw_mode', 'lottery_ticket_match_prizes_check', 'lottery_ticket_match_prizes_immutable', 'lottery_ticket_matches_prize_links_check', 'raffle_prizes_guard', 'raffle_prize_versions_guard', 'raffle_prize_versions_require_reward', 'raffle_prize_versions_require_rules', 'raffle_prize_schedule_rules_check', 'raffle_prize_schedule_rules_immutable', 'raffle_prize_reward_options_check', 'raffle_prize_reward_options_immutable', 'raffles_guard_prize_config', 'raffles_notify_dates_changed', 'raffle_prize_transition_apply', 'raffle_prize_transition_configuration', 'raffle_prize_transition_open', 'raffle_prize_transition_check_window', 'raffle_prize_transition_window_draws', 'raffle_prize_transition_legacy_summary', 'raffle_prize_transition_played_occurrence', 'raffle_prize_transitions_guard', 'raffle_prize_lottery_label', 'raffle_prize_raffle_status_phrase', 'admin_audit_redact'])
     and p.oid <> all (array(
           select o from (
             select to_regprocedure('public.' || e.firma)::oid as o
               from (values
                 ('archive_raffle_prize(uuid,uuid)', false, false, true, false),
                 ('create_raffle_prize(uuid,text,raffle_prize_category,raffle_prize_reward_mode,jsonb,lottery_match_field,jsonb,raffle_prize_digits,text)', false, false, true, false),
                 ('publish_raffle_prize_version(uuid,uuid,text,raffle_prize_category,raffle_prize_reward_mode,jsonb,lottery_match_field,raffle_prize_digits,jsonb,text)', false, false, true, false),
                 ('raffle_prize_history(uuid,integer,integer)', false, false, true, false),
                 ('reorder_raffle_prizes(uuid,uuid[])', false, false, true, false),
                 ('restore_raffle_prize(uuid,uuid)', false, false, true, false),
                 ('admin_audit_log(text,uuid,integer,integer)', false, false, true, true),
                 ('transition_raffle_prize_mode(uuid,uuid,text,raffle_status,date,date,jsonb,boolean)', false, false, false, true),
                 ('confirm_lottery_result(lottery_code,text,text,text,text,text,text,jsonb,date,timestamp with time zone,timestamp with time zone)', false, false, false, true),
                 ('app_capability_catalog()', false, false, false, false),
                 ('app_role_default_capabilities(app_role)', false, false, false, false),
                 ('has_org_capability(uuid,text)', false, false, false, false),
                 ('lottery_for_weekday(smallint)', false, false, false, false),
                 ('lottery_nominal_weekday(lottery_code)', false, false, false, false),
                 ('raffle_prize_weekdays_valid(smallint[])', false, false, false, false),
                 ('raffle_prize_rule_covers_weekdays(date,date,smallint[])', false, false, false, false),
                 ('raffle_prize_rule_dates(uuid)', false, false, false, false),
                 ('raffle_prize_validity(uuid)', false, false, false, false),
                 ('raffle_prize_version_problem(uuid,date,date)', false, false, false, false),
                 ('raffle_prize_cutoff_problem(uuid[])', false, false, false, false),
                 ('raffle_prize_normalized_rules(raffles,jsonb)', false, false, false, false),
                 ('raffle_prize_normalized_reward(raffle_prize_reward_mode,jsonb)', false, false, false, false),
                 ('raffle_prize_clean_fields(text,raffle_prize_category,lottery_match_field,raffle_prize_digits,text)', false, false, false, false),
                 ('raffle_prize_is_material(uuid,uuid)', false, false, false, false),
                 ('raffle_prize_insert_version(uuid,uuid,uuid,uuid,integer,uuid,raffle_prize_status,text,raffle_prize_category,raffle_prize_reward_mode,jsonb,lottery_match_field,raffle_prize_digits,text,jsonb,uuid)', false, false, false, false),
                 ('raffle_prize_notify(uuid,uuid,text,uuid,uuid,integer,text,text,uuid)', false, false, false, false),
                 ('raffle_prize_audit_values(raffle_prize_versions,text,boolean,integer)', false, false, false, false),
                 ('raffle_prize_reward_json(uuid)', false, false, false, false),
                 ('raffle_prize_rules_json(uuid)', false, false, false, false),
                 ('raffle_prize_manageable_raffle(uuid)', false, false, false, false),
                 ('raffle_prize_lock(uuid)', false, false, false, false),
                 ('match_lottery_result(uuid)', false, false, false, false),
                 ('raffle_prize_draw_prizes(uuid[],date,lottery_code,timestamp with time zone)', false, false, false, false),
                 ('raffle_prize_versions_at(uuid[],timestamp with time zone)', false, false, false, false),
                 ('raffle_prize_applicable_version(uuid,timestamp with time zone)', false, false, false, false),
                 ('raffle_prize_draw_cutoff(lottery_draw_schedules)', false, false, false, false),
                 ('raffle_prize_draw_mode(uuid,lottery_draw_schedules)', false, false, false, false),
                 ('raffle_prize_transition_draw_mode(timestamp with time zone,lottery_draw_schedules)', false, false, false, false),
                 ('lottery_ticket_match_prizes_check()', false, false, false, false),
                 ('lottery_ticket_match_prizes_immutable()', false, false, false, false),
                 ('lottery_ticket_matches_prize_links_check()', false, false, false, false),
                 ('raffle_prizes_guard()', false, false, false, false),
                 ('raffle_prize_versions_guard()', false, false, false, false),
                 ('raffle_prize_versions_require_reward()', false, false, false, false),
                 ('raffle_prize_versions_require_rules()', false, false, false, false),
                 ('raffle_prize_schedule_rules_check()', false, false, false, false),
                 ('raffle_prize_schedule_rules_immutable()', false, false, false, false),
                 ('raffle_prize_reward_options_check()', false, false, false, false),
                 ('raffle_prize_reward_options_immutable()', false, false, false, false),
                 ('raffles_guard_prize_config()', false, false, false, false),
                 ('raffles_notify_dates_changed()', false, false, false, false),
                 ('raffle_prize_transition_apply(uuid,uuid,text,raffle_status,date,date,jsonb)', false, false, false, false),
                 ('raffle_prize_transition_configuration(raffles,jsonb)', false, false, false, false),
                 ('raffle_prize_transition_open(uuid)', false, false, false, false),
                 ('raffle_prize_transition_check_window(raffles,timestamp with time zone)', false, false, false, false),
                 ('raffle_prize_transition_window_draws(raffles,timestamp with time zone)', false, false, false, false),
                 ('raffle_prize_transition_legacy_summary(raffles,timestamp with time zone)', false, false, false, false),
                 ('raffle_prize_transition_played_occurrence(uuid,timestamp with time zone)', false, false, false, false),
                 ('raffle_prize_transitions_guard()', false, false, false, false),
                 ('raffle_prize_lottery_label(lottery_code)', false, false, false, false),
                 ('raffle_prize_raffle_status_phrase(raffle_status)', false, false, false, false),
                 ('admin_audit_redact(text,jsonb)', false, false, false, false)
               ) as e (firma, publico, anonimo, autenticado, servicio)
           ) s where o is not null));

  if v_problemas is not null then
    raise exception 'Funciones de premios sin clasificar en la 0066: %', v_problemas;
  end if;
end;
$$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA que vuelva a conceder lo que concedian
-- 0058–0065: las seis RPC y las cuatro auxiliares de los CHECK tambien a
-- service_role, y match_lottery_result a service_role. En el proyecto alojado
-- eso NO devuelve el estado anterior de las otras 34: alli las habria concedido
-- el privilegio por defecto, que es justo lo que esta migracion cierra. No se
-- recomienda revertir sin la auditoria de I-132.
-- =============================================================================
