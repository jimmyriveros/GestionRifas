-- =============================================================================
-- 0072_prize_award_seller_scope_privileges.sql
-- Historial de premios ganados — Etapa 3: `current_seller_org_ids()` no puede
-- depender del privilegio por defecto para no ser de `service_role`
--
-- Referencia normativa: docs/DECISIONS.md D-208 (§«Etapa 3»), D-207 (privilegios
-- explicitos, I-132); docs/KNOWN_ISSUES.md I-143; docs/SECURITY.md §4.24.
--
-- La `0067` a la `0071` ya se aplicaron y NO se reescriben (AGENTS.md): esta es
-- la siguiente, con el siguiente numero libre.
--
-- EL DEFECTO, REPRODUCIDO ANTES DE TOCARLO. La `0068` CREA
-- `current_seller_org_ids()` y solo le revoca `EXECUTE` a `public`. En la pila
-- local eso basta, porque el privilegio por defecto de las funciones es
-- `{postgres=X}`. En el proyecto alojado es `{postgres=X, service_role=X}`
-- (I-132), asi que ahi la funcion naceria ejecutable por `service_role`, contra
-- la lista de D-207 —solo `authenticated`—. Ensayado en local con ese privilegio
-- reproducido (escenario B): `db reset --version 0066`, `alter default
-- privileges ... grant execute on functions to service_role` y `migration up`.
-- Resultado: las otras 14 funciones del historial y la tabla, identicas al
-- escenario normal; `current_seller_org_ids()` con `service_role=X`, y
-- `verify-remote` contra esa base, UNA comprobacion en rojo:
-- «current_seller_org_ids() -> service_role=true».
--
-- IMPACTO: bajo. La service role ya se salta la RLS, y sin sesion la funcion no
-- devuelve ninguna organizacion. Se corrige porque la matriz declarada tiene que
-- cumplirse de verdad, y porque sin esto `verify:remote` quedaria en rojo
-- despues de la puerta 1 de `RUNBOOK` §9.
--
-- LO QUE HACE: repite los privilegios de la `0068` nombrando a `service_role`,
-- y despues SE COMPRUEBA A SI MISMA, como la `0066`: si el `EXECUTE` efectivo de
-- alguna de las 15 funciones del historial no es exactamente el de la lista
-- (`scripts/prize-function-grants.ts`), o aparece una sobrecarga sin
-- clasificar, falla y no deja nada. En local no cambia ningun privilegio.
--
-- LO QUE NO CAMBIA: ninguna firma, cuerpo, politica, tabla ni dato.
--
-- SOBRE LAS TILDES. Los comentarios siguen sin tildes (I-030).
-- =============================================================================

revoke execute on function current_seller_org_ids() from public, anon, service_role;
grant  execute on function current_seller_org_ids() to authenticated;

-- =============================================================================
-- Comprobacion: la matriz exacta de las 15 funciones del historial
-- =============================================================================

do $$
declare
  v_problemas text;
begin
  with esperado (firma, publico, anonimo, autenticado, servicio) as (
    values
      -- Las lecturas del historial y el alcance del vendedor: una sesion.
      ('admin_prize_award_sellers()', false, false, true, false),
      ('admin_prize_award_totals(uuid,uuid,date,date)', false, false, true, false),
      ('admin_prize_awards(uuid,uuid,date,date,integer,integer)', false, false, true, false),
      ('seller_prize_award_totals(uuid,uuid,date,date)', false, false, true, false),
      ('current_seller_org_ids()', false, false, true, false),
      ('prize_award_coverage()', false, false, true, false),
      ('prize_award_history_start()', false, false, true, false),
      ('seller_prize_awards(uuid,uuid,date,date,integer,integer)', false, false, true, false),
      -- El cargador: solo la service role.
      ('record_declared_prize_awards(uuid,text,jsonb,boolean)', false, false, false, true),
      -- Lo que no ejecuta nadie directamente.
      ('declared_prize_award_plan(uuid,jsonb)', false, false, false, false),
      ('lottery_ticket_matches_number_check()', false, false, false, false),
      ('declared_prize_awards_check()', false, false, false, false),
      ('declared_prize_awards_immutable()', false, false, false, false),
      ('prize_award_rows(uuid[],uuid[],uuid,uuid,date,date)', false, false, false, false),
      ('tickets_guard_matched_numbers()', false, false, false, false)
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
    raise exception 'La 0072 no dejó el EXECUTE esperado en el historial de premios: %', v_problemas;
  end if;

  select string_agg(p.oid::regprocedure::text, '; ')
    into v_problemas
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = any (array['admin_prize_award_sellers', 'admin_prize_award_totals', 'admin_prize_awards',
                                'seller_prize_award_totals', 'current_seller_org_ids', 'prize_award_coverage',
                                'prize_award_history_start', 'seller_prize_awards', 'record_declared_prize_awards',
                                'declared_prize_award_plan', 'lottery_ticket_matches_number_check',
                                'declared_prize_awards_check', 'declared_prize_awards_immutable',
                                'prize_award_rows', 'tickets_guard_matched_numbers'])
     and p.oid::regprocedure::text <> all (array[
           'admin_prize_award_sellers()',
           'admin_prize_award_totals(uuid,uuid,date,date)',
           'admin_prize_awards(uuid,uuid,date,date,integer,integer)',
           'seller_prize_award_totals(uuid,uuid,date,date)',
           'current_seller_org_ids()',
           'prize_award_coverage()',
           'prize_award_history_start()',
           'seller_prize_awards(uuid,uuid,date,date,integer,integer)',
           'record_declared_prize_awards(uuid,text,jsonb,boolean)',
           'declared_prize_award_plan(uuid,jsonb)',
           'lottery_ticket_matches_number_check()',
           'declared_prize_awards_check()',
           'declared_prize_awards_immutable()',
           'prize_award_rows(uuid[],uuid[],uuid,uuid,date,date)',
           'tickets_guard_matched_numbers()']);

  if v_problemas is not null then
    raise exception 'Funciones del historial de premios sin clasificar en la 0072: %', v_problemas;
  end if;
end;
$$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   No hay nada que deshacer: la migracion no crea ni cambia funciones, solo
--   repite privilegios. Volver a conceder `EXECUTE` a `service_role` sobre
--   `current_seller_org_ids()` contradice D-207 y no se hace sin decidirlo.
-- =============================================================================
