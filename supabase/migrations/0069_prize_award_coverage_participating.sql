-- =============================================================================
-- 0069_prize_award_coverage_participating.sql
-- Historial de premios ganados — Etapa 2: la cobertura cuenta solo los sorteos
-- que PUDIERON dar un premio
--
-- Referencia normativa: docs/DECISIONS.md D-208 (§«Etapa 2»), BR-J22, BR-J23;
-- docs/KNOWN_ISSUES.md I-133.
--
-- La `0067` y la `0068` ya se aplicaron y NO se reescriben (AGENTS.md): esta es
-- su correccion, con el siguiente numero libre.
--
-- EL DEFECTO, REPRODUCIDO ANTES DE TOCARLO (H12-01). `prize_award_coverage()`
-- dice cuantos sorteos ya jugados no tienen resultado confirmado desde el inicio
-- operativo: la pantalla lo presenta como informacion PENDIENTE, nunca como
-- «cero premios» (BR-J22). Pero contaba dos cosas que no pueden dar un premio a
-- nadie, y las presentaba como si faltaran:
--
--   * sorteos CANCELADOS o SUSPENDIDOS: no se jugaron. El motor ni siquiera
--     confirma un resultado para ellos (`confirm_lottery_result` y
--     `match_lottery_result` los rechazan, 0036 y 0061);
--   * sorteos que solo caen en la ventana de una rifa en BORRADOR o ANULADA: el
--     motor busca coincidencias unicamente en rifas `active` o `closed` (0036,
--     0061, 0062, 0064), asi que ninguna de sus boletas pudo coincidir.
--
-- Medido con la `0068`: seis sorteos nuevos sin resultado —uno jugado en una
-- rifa activa, uno cancelado, uno suspendido, uno en una rifa en borrador, uno
-- en una anulada y uno en una cerrada— subian el recuento en SEIS; de verdad
-- pendientes hay DOS: el de la activa y el de la cerrada.
--
-- LO QUE NO CAMBIA, Y POR QUE:
--
--   * La firma, el tipo de retorno y los privilegios: la lee el vendedor y el
--     personal, con el alcance de SU sesion (`current_org_ids()`), y no recibe
--     ningun parametro del navegador (BR-J23). No es cartera.
--   * El ALCANCE sigue siendo la ORGANIZACION, no el filtro de una pantalla:
--     los sorteos son nacionales y las ventanas son de las rifas. La pantalla lo
--     dice asi, no como si hablara del filtro visible.
--   * Un sorteo en conflicto sigue contando como «sin resultado confirmado»:
--     es literalmente cierto, y el registro que ya tenga se queda y se marca
--     (BR-J18).
--   * `covered_from` y `covered_to` siguen siendo el primer y el ultimo sorteo
--     CON resultado confirmado. No demuestran cobertura continua entre ambos, y
--     tener resultado no garantiza que cada premio de entonces este reconocido:
--     la pantalla no los presenta como «todo cubierto».
--
-- QUE NO HACE: no toca `prize_award_rows`, ni las cuatro lecturas, ni el
-- cargador, ni el motor, ni ninguna politica. No amplia el acceso de nadie.
--
-- SOBRE LAS TILDES. Los comentarios siguen sin tildes (I-030).
-- =============================================================================

create or replace function prize_award_coverage()
returns table (
  history_start   date,
  pending_draws   integer,
  pending_from    date,
  pending_to      date,
  covered_from    date,
  covered_to      date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ventana as (
    select distinct s.id, s.reference_date,
           exists (select 1 from lottery_results r
                    where r.schedule_id = s.id and r.validation_status = 'confirmed') as confirmado
      from lottery_draw_schedules s
      join raffles ra on s.reference_date between ra.start_date and ra.end_date
     where ra.organization_id in (select current_org_ids())
       -- Solo las rifas donde el motor busca coincidencias (0036, 0061).
       and ra.status in ('active', 'closed')
       -- Un sorteo cancelado o suspendido no se jugo: no puede dar un premio.
       and s.schedule_status not in ('cancelled', 'suspended')
       and s.reference_date >= prize_award_history_start()
       and s.official_scheduled_at < now()
  )
  select prize_award_history_start(),
         count(*) filter (where not confirmado)::integer,
         min(reference_date) filter (where not confirmado),
         max(reference_date) filter (where not confirmado),
         min(reference_date) filter (where confirmado),
         max(reference_date) filter (where confirmado)
    from ventana
$$;

comment on function prize_award_coverage() is
  'BR-J22: cuantos sorteos ya jugados, de las rifas que participan (activas o cerradas) y sin cancelar ni suspender, no tienen resultado confirmado desde el inicio operativo. Alcance de la ORGANIZACION de la sesion, no de un filtro (0069).';

-- Los mismos privilegios de la `0068`, repetidos a proposito (D-207, I-132):
-- `create or replace` los conserva, y escribirlos deja claro cuales son.
revoke execute on function prize_award_coverage() from public, anon, service_role;
grant  execute on function prize_award_coverage() to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   Volver a la `0068` es recrear `prize_award_coverage()` con su cuerpo de
--   entonces —sin los dos filtros de rifa y de estado del sorteo—. Vuelve a
--   contar como pendientes sorteos que no pudieron dar ningun premio.
-- =============================================================================
