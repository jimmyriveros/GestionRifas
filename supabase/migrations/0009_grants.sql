-- =============================================================================
-- 0009_grants.sql
-- Fase 2 — Privilegios explicitos por rol
--
-- POR QUE EXISTE ESTE ARCHIVO
--
-- Supabase concede privilegios a anon/authenticated/service_role mediante
-- ALTER DEFAULT PRIVILEGES. Ese mecanismo depende del rol que aplica la
-- migracion y NO es igual en todos los entornos: verificado en la Fase 2, la
-- instancia local deja las tablas nuevas con REFERENCES/TRIGGER/TRUNCATE pero
-- sin SELECT/INSERT/UPDATE, mientras que el proyecto alojado si las concede.
-- Depender de ese comportamiento implicito hace que el esquema funcione en un
-- entorno y falle en otro. Aqui se declara explicitamente, de forma portatil.
--
-- MODELO DE PRIVILEGIOS (defensa en dos capas independientes)
--
--   GRANT -> que VERBOS puede ejecutar un rol sobre una tabla.
--   RLS   -> que FILAS puede tocar con esos verbos.
--
-- Ninguna tabla de negocio concede DELETE a `authenticated`. El borrado fisico
-- queda prohibido por partida doble: no hay privilegio y no hay politica. Aunque
-- alguien agregara por error una politica DELETE en el futuro, seguiria siendo
-- imposible borrar (BR-C06 archivar, BR-F09 anular, BR-D02 bitacora inalterable).
--
-- `anon` (visitantes sin sesion) no recibe ningun privilegio: la aplicacion no
-- expone datos publicos.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- service_role: acceso administrativo completo (scripts de seed y operaciones
-- de servidor). Omite RLS por diseno; nunca llega al navegador.
-- -----------------------------------------------------------------------------
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- -----------------------------------------------------------------------------
-- authenticated: verbos minimos por tabla. Las filas las acota la RLS de 0005.
-- -----------------------------------------------------------------------------
grant select, update         on organizations       to authenticated;
grant select, update         on profiles            to authenticated;
grant select, insert, update on memberships         to authenticated;
grant select, insert, update on raffles             to authenticated;
grant select, insert, update on clients             to authenticated;
grant select, insert, update on tickets             to authenticated;
grant select, insert, update on payments            to authenticated;
-- Las asignaciones son inmutables: se crean con el pago y solo dejan de contar
-- cuando el pago se anula (D-013). Sin UPDATE.
grant select, insert         on payment_allocations to authenticated;
-- Bitacora de solo lectura (y solo para el personal, segun la RLS de 0005).
grant select                 on audit_logs          to authenticated;

-- Vistas de saldos y resumenes (todas con security_invoker: heredan la RLS de
-- las tablas base, ver 0008).
grant select on v_ticket_balances to authenticated;
grant select on v_client_balances to authenticated;
grant select on v_seller_summary  to authenticated;
grant select on v_raffle_summary  to authenticated;
grant select on v_payment_history to authenticated;

-- -----------------------------------------------------------------------------
-- Privilegios por defecto para objetos FUTUROS creados por este mismo rol, de
-- modo que las migraciones de fases siguientes no repitan el problema.
-- Se conceden de forma conservadora: lectura para authenticated (la RLS sigue
-- decidiendo las filas) y todo para service_role.
-- -----------------------------------------------------------------------------
alter default privileges in schema public grant select on tables to authenticated;
alter default privileges in schema public grant all    on tables to service_role;
alter default privileges in schema public grant all    on sequences to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- revoke all on all tables in schema public from authenticated, service_role;
-- alter default privileges in schema public revoke select on tables from authenticated;
-- alter default privileges in schema public revoke all on tables from service_role;
-- =============================================================================
