-- =============================================================================
-- 0032_internal_function_grants.sql
-- Las funciones internas dejan de ser ejecutables desde una sesion
--
-- Referencia: docs/KNOWN_ISSUES.md I-078, docs/SECURITY.md §4.5, D-128.
--
-- QUE ESTABA MAL
--
-- `0024` dice, en un comentario sobre `recalc_seller_commission`: «`authenticated`
-- NO la recibe: nadie mueve dinero de comision desde una sesion, ni siquiera la
-- suya». En el proyecto REAL era falso. Y con el la de otras 33 funciones
-- internas: disparadores, ayudantes y el motor de comision entero.
--
-- POR QUE NADIE LO VIO EN SIETE FASES, Y ES LA PARTE IMPORTANTE
--
-- Porque en local NO PASA. Los privilegios por defecto de `postgres` para las
-- funciones de `public` son distintos en los dos sitios:
--
--   local        {postgres=X/postgres}
--   produccion   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- El proyecto alojado nace con ese `alter default privileges ... grant execute
-- ... to authenticated` puesto por la plataforma, y la pila local de la CLI no.
-- `0015` revoco del default `anon` y `public` —y lo dijo: «`authenticated`
-- conserva lo que ya tenia»— pero nunca `authenticated`.
--
-- Consecuencia: **ninguna prueba local podia detectarlo**, porque en local el
-- comportamiento correcto ya era el vigente. Lo mismo vale para cualquier otra
-- divergencia de privilegios por defecto, y por eso esta migracion no se queda
-- en revocar: arregla el default y ademas se anade una comprobacion a
-- `verify-remote.ts`, que es lo unico que mira el proyecto real.
--
-- POR QUE ES SEGURO
--
-- No es una hipotesis: **local lleva todas las fases funcionando con la postura
-- estricta**, con 544 pruebas de base de datos y 296 de extremo a extremo en
-- verde, y todas usan sesiones reales. Se comprobo ademas fila a fila que la
-- diferencia entre los dos entornos es de 34 funciones en un solo sentido —cero
-- en el contrario—, asi que todo lo que la aplicacion necesita de verdad tiene
-- su `grant` EXPLICITO desde su propia migracion. Y las 26 RPC que llama el
-- codigo no aparecen en la lista de abajo.
--
-- LO QUE ESTO NO ES
--
-- No es un agujero por el que se pudiera robar dinero. `recalc_seller_commission`
-- RECUENTA desde `tickets` y escribe el valor correcto: es idempotente y
-- autocorrectiva, asi que lo peor que consigue quien la llame es forzar el
-- recalculo de otro vendedor a su cifra verdadera. Las de disparador fallan si
-- se invocan sueltas. Las dos que si molestaban de verdad son `write_audit_log`
-- —anotar en la bitacora hechos que no ocurrieron— y `notify_profiles` —crear
-- avisos a nombre de cualquiera—. BR-G11 seguia siendo cierta en lo esencial
-- (no hay privilegio de ESCRITURA sobre las tablas de comision para ninguna
-- sesion); lo que estaba incompleto era su justificacion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La causa: el privilegio por defecto
--
-- Sin esto, la proxima funcion que cree una migracion volveria a nacer
-- ejecutable por `authenticated` en produccion —y no en local—, y estariamos
-- otra vez donde empezamos.
--
-- `service_role` se queda a proposito: es el rol de los scripts de servidor y de
-- la reparacion operativa, y `0024` le concede explicitamente el motor de
-- comision para poder recalcular a mano si algun dia se sospecha de una cifra.
--
-- CONSECUENCIA PARA QUIEN ESCRIBA LA PROXIMA MIGRACION: una funcion nueva que la
-- aplicacion deba poder llamar necesita su `grant execute ... to authenticated`
-- EXPLICITO. Ya era asi en local; a partir de ahora tambien en produccion, que
-- es justo lo que hace que una prueba local signifique algo.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from authenticated;

-- -----------------------------------------------------------------------------
-- 2. Las 34 que ya lo tenian
--
-- Se enumeran una por una, con su firma completa, en vez de resolverlas con un
-- `revoke ... on all functions`. La diferencia no es de estilo: un revoke masivo
-- quitaria tambien los `grant` EXPLICITOS de las 26 RPC que usa la aplicacion
-- —un `revoke` no distingue de donde vino el privilegio— y dejaria el portal
-- entero respondiendo «permission denied for function». La lista se calculo
-- comparando los dos entornos, no a mano.
--
-- En LOCAL estas lineas no hacen nada: alli el privilegio ya no existe. Es lo
-- que se busca — que al terminar los dos entornos sean identificamente estrictos.
-- -----------------------------------------------------------------------------

-- Disparadores. No necesitan EXECUTE para dispararse: PostgreSQL comprueba el
-- permiso sobre la TABLA, no sobre la funcion del trigger. Lo demuestra local,
-- donde llevan asi desde el principio y las 544 pruebas pasan.
revoke execute on function audit_row_change() from authenticated;
revoke execute on function check_payment_balance() from authenticated;
revoke execute on function handle_new_auth_user() from authenticated;
revoke execute on function memberships_require_active_owner() from authenticated;
revoke execute on function memberships_sync_commission() from authenticated;
revoke execute on function memberships_validate_commission() from authenticated;
revoke execute on function memberships_validate_parent_seller() from authenticated;
revoke execute on function notify_team_member_added() from authenticated;
revoke execute on function notify_ticket_sold() from authenticated;
revoke execute on function organizations_seed_commission_tiers() from authenticated;
revoke execute on function payment_allocations_recalc() from authenticated;
revoke execute on function payments_recalc_on_void() from authenticated;
revoke execute on function raffles_set_short_code() from authenticated;
revoke execute on function raffles_sync_commission() from authenticated;
revoke execute on function set_updated_at() from authenticated;
revoke execute on function sync_profile_email() from authenticated;
revoke execute on function tickets_enforce_seller_role() from authenticated;
revoke execute on function tickets_guard_paid_amount() from authenticated;
revoke execute on function tickets_protect_client_change() from authenticated;
revoke execute on function tickets_protect_sale_price() from authenticated;
revoke execute on function tickets_set_internal_code() from authenticated;
revoke execute on function tickets_sync_commission() from authenticated;
revoke execute on function tickets_validate_status_transition() from authenticated;

-- El motor de comision. Es lo que decia `0024` y no era cierto (BR-G11).
revoke execute on function commission_floor_rate(uuid, uuid, uuid) from authenticated;
revoke execute on function commission_rate_for(uuid, integer) from authenticated;
revoke execute on function commission_rate_for_seller(uuid, uuid, uuid, integer) from authenticated;
revoke execute on function commission_team_earned(uuid, uuid, uuid) from authenticated;
revoke execute on function recalc_seller_commission(uuid, uuid, uuid, commission_movement, uuid, uuid)
  from authenticated;

-- Ayudantes internos. `write_audit_log` y `notify_profiles` son los dos que de
-- verdad importaban: con ellos, una sesion podia escribir en la bitacora hechos
-- que no ocurrieron y crear avisos a nombre de cualquiera.
revoke execute on function notify_profiles(uuid, uuid[], text, uuid, text, uuid, jsonb) from authenticated;
revoke execute on function org_staff_profile_ids(uuid) from authenticated;
revoke execute on function recalc_ticket_paid_amount(uuid) from authenticated;
revoke execute on function require_auth() from authenticated;
revoke execute on function today_bogota() from authenticated;
revoke execute on function write_audit_log(uuid, text, text, uuid, jsonb, jsonb) from authenticated;

-- -----------------------------------------------------------------------------
-- Lo que NO se revoca, y por que
--
--   * Las funciones que usan las POLITICAS de RLS —`current_org_ids`,
--     `current_profile_id`, `current_staff_org_ids`, `current_team_seller_ids`,
--     `current_profile_leads_team`, `has_org_role`, `is_org_staff`—. La
--     expresion de una politica se evalua como el rol que consulta, asi que sin
--     EXECUTE toda lectura fallaria. Tienen su `grant` explicito y se quedan.
--   * Las 26 RPC que llama la aplicacion. Tienen su `grant` explicito desde su
--     propia migracion; ninguna aparece arriba, y se comprobo.
--   * Las funciones de la extension `pg_trgm` (`similarity`, `gtrgm_*`, …). No
--     son nuestras, no tocan datos y `verify-remote` ya las excluye.
--   * `service_role`. Conserva todo, tambien en el default: es el rol de la
--     reparacion operativa.
-- =============================================================================

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- alter default privileges in schema public grant execute on functions to authenticated;
-- ... y `grant execute on function <cada una de las 34> to authenticated;`
--
-- Revertir NO toca ni un dato: solo devuelve a `authenticated` la capacidad de
-- llamar a las funciones internas. Si algo se rompiera despues de aplicar esto,
-- el sintoma seria «permission denied for function <nombre>» en el registro del
-- servidor, y la reparacion es conceder EXPLICITAMENTE esa funcion concreta —no
-- deshacer el default—, porque el default es la causa del problema original.
-- =============================================================================
