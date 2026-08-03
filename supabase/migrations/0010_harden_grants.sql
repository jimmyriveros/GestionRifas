-- =============================================================================
-- 0010_harden_grants.sql
-- Fase 2 — Revocacion explicita de privilegios destructivos
--
-- POR QUE EXISTE ESTE ARCHIVO
--
-- 0009 concedio los privilegios minimos por tabla, pero GRANT solo AGREGA: no
-- retira lo que ya estuviera concedido. Al aplicar las migraciones al proyecto
-- alojado se comprobo que Supabase ya habia otorgado ALL (incluido DELETE y
-- TRUNCATE) a anon y authenticated mediante sus privilegios por defecto, de
-- modo que el estado final NO era el mismo en local que en el proyecto real:
--
--   local    -> authenticated sin DELETE  (la defensa doble existia)
--   alojado  -> authenticated con DELETE  (solo protegia la ausencia de politica RLS)
--
-- El borrado seguia siendo imposible en ambos casos, porque ninguna tabla tiene
-- politica de DELETE y RLS esta forzada. Pero el diseno buscaba dos capas
-- independientes (docs/KNOWN_ISSUES.md, 0009) y en el entorno que importa solo
-- habia una. Esta migracion parte de un estado conocido y deja ambos entornos
-- identicos.
--
-- Se hace en una migracion NUEVA en lugar de editar 0009 porque 0009 ya se
-- aplico al proyecto alojado, y las migraciones aplicadas son inmutables
-- (docs/ARCHITECTURE.md §12).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Punto de partida deterministico: se revoca TODO a los roles de aplicacion y
-- se vuelve a conceder unicamente lo necesario. `service_role` no se toca: es
-- el rol administrativo de los scripts de servidor y nunca llega al navegador.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant usage on schema public to anon, authenticated;

-- -----------------------------------------------------------------------------
-- authenticated: los mismos verbos minimos de 0009, ahora sobre un estado
-- limpio. Ninguna tabla concede DELETE ni TRUNCATE: el borrado fisico queda
-- prohibido por privilegio ADEMAS de por ausencia de politica RLS.
-- -----------------------------------------------------------------------------
grant select, update         on organizations       to authenticated;
grant select, update         on profiles            to authenticated;
grant select, insert, update on memberships         to authenticated;
grant select, insert, update on raffles             to authenticated;
grant select, insert, update on clients             to authenticated;
grant select, insert, update on tickets             to authenticated;
grant select, insert, update on payments            to authenticated;
grant select, insert         on payment_allocations to authenticated;
grant select                 on audit_logs          to authenticated;

grant select on v_ticket_balances to authenticated;
grant select on v_client_balances to authenticated;
grant select on v_seller_summary  to authenticated;
grant select on v_raffle_summary  to authenticated;
grant select on v_payment_history to authenticated;

-- `anon` (sin sesion) se queda sin ningun privilegio de tabla: la aplicacion no
-- expone datos publicos. El acceso a /login lo resuelve Supabase Auth, que no
-- depende de estos privilegios.

-- -----------------------------------------------------------------------------
-- Los privilegios por defecto para objetos FUTUROS tambien podrian volver a
-- introducir DELETE si el entorno los define. Se fijan de forma explicita.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public grant select on tables to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- grant all on all tables in schema public to anon, authenticated;
-- alter default privileges in schema public grant all on tables to anon, authenticated;
--
-- (Revertir esto REABRE el borrado fisico. Solo tiene sentido para depuracion.)
-- =============================================================================
