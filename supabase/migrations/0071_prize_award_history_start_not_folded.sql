-- =============================================================================
-- 0071_prize_award_history_start_not_folded.sql
-- Historial de premios ganados — Etapa 3: `anon` no obtiene el inicio operativo
-- por un plan reutilizado
--
-- Referencia normativa: docs/DECISIONS.md D-208 (§«Etapa 3»), BR-J22, BR-J23;
-- D-207 (privilegios explicitos, I-132); docs/SECURITY.md §4.24.
--
-- La `0067` a la `0070` ya se aplicaron y NO se reescriben (AGENTS.md): esta es
-- la siguiente, con el siguiente numero libre.
--
-- EL DEFECTO, REPRODUCIDO ANTES DE TOCARLO (H13-02 y H13-06). La `0068` revoca
-- `EXECUTE` de `prize_award_history_start()` a `anon`, y PostgreSQL lo cumple
-- cuando `anon` prepara la consulta: «permission denied». Pero la funcion es
-- `language sql immutable` y devuelve una constante, asi que el planificador la
-- PLIEGA a `date '2026-08-09'` al planificar. Un plan generico preparado por una
-- sesion con permiso ya no llama a la funcion, y si se reutiliza con `anon` nadie
-- vuelve a comprobar el permiso: `anon` recibe la fecha. PostgREST reutiliza
-- sentencias preparadas por conexion, y por eso
-- `POST /rest/v1/rpc/prize_award_history_start` con la clave anonima devolvio
-- `"2026-08-09"` (200).
--
-- Medido con las variantes, en una transaccion deshecha: ni `security definer`
-- ni `set search_path` bastan mientras siga siendo `immutable` —se sigue
-- plegando—. Con `stable security definer`, la llamada queda en el plan y el
-- permiso se comprueba al ejecutar, con el rol de ese momento: `anon`,
-- denegado.
--
-- IMPACTO: bajo. Es una constante —el inicio operativo, BR-J22— y no un dato de
-- nadie. Se corrige porque la matriz de privilegios declarada (D-207) tiene que
-- cumplirse de verdad, no solo en el catalogo.
--
-- LO QUE NO CAMBIA: la firma, el tipo, el valor y los privilegios (`authenticated`
-- si; `public`, `anon` y `service_role`, no). Las tres funciones que la usan
-- —`prize_award_rows`, `prize_award_coverage` y `declared_prize_award_plan`—
-- son `security definer` y la siguen llamando igual. No toca ninguna politica.
--
-- SOBRE LAS TILDES. Los comentarios siguen sin tildes (I-030).
-- =============================================================================

create or replace function prize_award_history_start()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select date '2026-08-09'
$$;

comment on function prize_award_history_start() is
  'BR-J22: inicio operativo de la plataforma en produccion, verificado (D-208 §0). Suelo del historial de premios ganados. STABLE y SECURITY DEFINER a proposito (0071): una funcion inmutable que devuelve una constante se pliega en el plan, y un plan reutilizado no vuelve a comprobar el permiso.';

-- Los mismos privilegios de la `0068`, repetidos a proposito (D-207, I-132).
revoke execute on function prize_award_history_start() from public, anon, service_role;
grant  execute on function prize_award_history_start() to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   Volver a `language sql immutable` sin `security definer`. Vuelve a dejar que
--   un plan reutilizado le entregue la fecha a `anon`.
-- =============================================================================
