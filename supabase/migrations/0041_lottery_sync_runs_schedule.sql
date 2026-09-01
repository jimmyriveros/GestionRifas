-- =============================================================================
-- 0041_lottery_sync_runs_schedule.sql
-- Los intentos de resultado se cuentan por SORTEO, no por loteria
--
-- Referencia normativa: docs/DECISIONS.md D-152, docs/BUSINESS_RULES.md BR-L22.
-- Reutiliza 0036 (lottery_draw_schedules, lottery_sync_runs) y 0037–0039.
--
-- QUE ESTABA MAL
--
-- `lottery_sync_runs` guardaba `lottery_code` pero no A QUE SORTEO pertenecia
-- el intento. El sincronizador contaba los reintentos con
-- `kind = 'results' and lottery_code = X and started_at >= <hora oficial del
-- sorteo>`, y eso mezcla sorteos distintos de la misma loteria en cuanto hay
-- mas de uno vivo en la ventana:
--
--   * Cundinamarca juega todos los lunes. Con el sorteo del 24 y el del 31
--     abiertos, cada intento del 31 tambien contaba como intento del 24,
--     porque el 31 es posterior al 24. El sorteo viejo agotaba su tope de
--     seis intentos sin haberse consultado ni una vez.
--   * Al reves, un sorteo que ya agoto sus intentos seguia sumando al
--     recuento del siguiente si se reintentaba a mano.
--
-- El resultado practico es que el tope de reintentos y la conciliacion de la
-- manana (D-145) se aplicaban a la loteria entera y no a cada sorteo, que es
-- lo que dice la regla.
--
-- QUE HACE ESTA MIGRACION, Y QUE NO HACE
--
-- Anade la columna `schedule_id` y su indice. Nada mas: no toca datos, no
-- crea funciones, no cambia RLS ni privilegios, no reescribe una migracion
-- aplicada. La bitacora anterior queda con `schedule_id` nulo, que es la
-- verdad: de esas filas no se sabe a que sorteo pertenecian.
--
-- POR QUE NULLABLE Y CON `on delete set null`
--
-- `kind = 'schedule'` sincroniza el cronograma entero y no pertenece a ningun
-- sorteo: para esas filas la columna es nula por definicion, y el CHECK lo
-- exige. Y esta es una bitacora operativa: borrar una programacion no puede
-- fallar por culpa de su registro de intentos, asi que la referencia se anula
-- en vez de restringir. Es la unica FK de loterias que no usa `restrict`, y
-- es a proposito.
--
-- Nota de reversion:
--   drop index if exists public.lottery_sync_runs_schedule_idx;
--   alter table public.lottery_sync_runs
--     drop constraint if exists lottery_sync_runs_schedule_kind_check;
--   alter table public.lottery_sync_runs drop column if exists schedule_id;
-- =============================================================================

alter table lottery_sync_runs
  add column schedule_id uuid
    references lottery_draw_schedules (id) on delete set null;

alter table lottery_sync_runs
  add constraint lottery_sync_runs_schedule_kind_check check (
    schedule_id is null or kind = 'results'
  );

comment on column lottery_sync_runs.schedule_id is
  'Sorteo consultado. Nulo para kind = schedule. Los reintentos se cuentan por sorteo, no por loteria (BR-L22, D-152).';

-- El sincronizador pregunta siempre lo mismo: los intentos de ESTE sorteo, del
-- mas reciente al mas antiguo. Parcial porque las filas de programacion —una
-- por dia— no participan en esa consulta.
create index lottery_sync_runs_schedule_idx
  on lottery_sync_runs (schedule_id, started_at desc)
  where schedule_id is not null;
