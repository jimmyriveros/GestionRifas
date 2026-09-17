-- =============================================================================
-- 0065_raffle_date_notices_include_actor.sql
-- El aviso de las fechas de una rifa activa llega TAMBIEN a quien las cambio
--
-- Referencia normativa: docs/DECISIONS.md D-206 (Decision 6, corregida el
-- 2026-09-16); docs/BUSINESS_RULES.md BR-R12.
--
-- POR QUE
--
-- La 0064 excluia de este aviso a quien hacia el cambio, por analogia con
-- BR-J11 (los avisos de las ediciones de premios). El dueno lo corrigio: la
-- decision explicita de BR-R12 es avisar a TODAS las membresias activas, y
-- BR-J11 no la reinterpreta. BR-J11 sigue igual para los premios.
--
-- QUE HACE
--
-- Vuelve a escribir `raffles_notify_dates_changed()` con UN solo cambio: sale
-- la condicion `m.profile_id is distinct from v_actor`. Cada membresia activa
-- de la organizacion —Dueno, Administradores y Vendedores, con perfil y
-- organizacion activos— recibe exactamente un aviso, incluida la de quien
-- cambio las fechas.
--
-- QUE CONSERVA, sin tocarlo
--
--   * El disparador `raffles_notify_dates_changed` y su condicion: solo una rifa
--     que era y sigue activa, y solo si `start_date` o `end_date` cambiaron de
--     verdad. Guardar las mismas fechas no dispara nada.
--   * La atomicidad: el aviso se escribe en el mismo UPDATE; si el cambio se
--     rechaza o se deshace, no queda ninguno.
--   * `actor_profile_id` = `auth.uid()`, que sale de la SESION —nunca de un
--     parametro—: identifica a quien hizo el cambio, y es NULL solo si no hubo
--     sesion. Lo mismo la bitacora: `write_audit_log` y `audit_raffles` toman el
--     actor de `auth.uid()`.
--   * Un evento por cambio (`entity_id`), el indice `notifications_raffle_dates_once`,
--     los datos —rifa, nombre y fechas, nada de la cartera— y la fila semantica
--     `raffle.dates_change`.
--   * Los privilegios: la funcion sigue sin EXECUTE para nadie.
--
-- No toca datos: los avisos que ya existieran no se completan ni se reescriben.
-- =============================================================================

create or replace function raffles_notify_dates_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_change_id uuid := gen_random_uuid();
  v_actor     uuid := auth.uid();
  v_notified  integer := 0;
begin
  -- UN aviso por membresia ACTIVA de la organizacion —Dueno, Administradores y
  -- Vendedores—, INCLUIDA la de quien hizo el cambio (BR-R12, D-206; BR-J11 no
  -- aplica aqui). El actor sale de la sesion y queda en cada aviso. Identifica
  -- la rifa y sus fechas: nada de clientes, ventas, pagos ni cartera.
  insert into notifications (
    organization_id, recipient_profile_id, actor_profile_id,
    kind, entity_type, entity_id, data
  )
  select
    new.organization_id,
    m.profile_id,
    v_actor,
    'raffle.dates_changed',
    'raffle_date_change',
    v_change_id,
    jsonb_build_object(
      'raffle_id',           new.id,
      'raffle_name',         new.name,
      'previous_start_date', old.start_date,
      'previous_end_date',   old.end_date,
      'start_date',          new.start_date,
      'end_date',            new.end_date
    )
  from memberships m
  join profiles pr on pr.id = m.profile_id
  join organizations o on o.id = m.organization_id
  where m.organization_id = new.organization_id
    and m.role in ('owner', 'admin', 'seller')
    and m.is_active and pr.is_active and o.is_active
  on conflict (recipient_profile_id, entity_id) where kind = 'raffle.dates_changed'
    do nothing;

  get diagnostics v_notified = row_count;

  -- UNA fila semantica de bitacora, ademas del `raffle.update` que escribe
  -- `audit_raffles`: cuantos avisos salieron y con que evento. Las dos llevan
  -- como actor a quien hizo el cambio.
  perform write_audit_log(
    new.organization_id,
    'raffle.dates_change',
    'raffle',
    new.id,
    jsonb_build_object('start_date', old.start_date, 'end_date', old.end_date),
    jsonb_build_object(
      'start_date', new.start_date,
      'end_date',   new.end_date,
      'change_id',  v_change_id,
      'notified',   v_notified
    )
  );

  return null;
end;
$$;

comment on function raffles_notify_dates_changed() is
  'BR-R12, D-206: al cambiar la fecha de inicio o de fin de una rifa activa, un aviso por membresia activa de la organizacion, incluida la de quien lo hizo, con su actor, y una fila semantica de bitacora, en la misma transaccion. Sin cartera.';

-- `create or replace` conserva los privilegios; se vuelven a escribir para que
-- esta migracion diga, sola, quien ejecuta que (I-078, I-111).
revoke execute on function raffles_notify_dates_changed() from public, anon, authenticated, service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA que vuelva a escribir el cuerpo de la 0064,
-- con `and m.profile_id is distinct from v_actor` en el WHERE. Contradice la
-- decision del dueno sobre BR-R12. No toca avisos ya entregados.
-- =============================================================================
