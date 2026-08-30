-- =============================================================================
-- 0039_lottery_sync_lock.sql
-- Resultados oficiales de loterias colombianas — Etapa 5
--
-- Referencia: docs/BUSINESS_RULES.md BR-L21; docs/DECISIONS.md D-148.
-- Reutiliza 0036–0038 (programacion, resultados, coincidencias, sync).
--
-- QUE HACE, Y QUE NO HACE
--
-- Un cerrojo de una sola fila para que dos ticks concurrentes no descarguen
-- la misma fuente. No activa cron. No concede EXECUTE a authenticated.
-- El Route Handler vive en la aplicacion; esta migracion solo cubre el lock.
--
-- Nota de reversion:
--   drop function if exists public.release_lottery_sync_lock(text);
--   drop function if exists public.try_acquire_lottery_sync_lock(text, integer);
--   drop table if exists public.lottery_sync_lock;
-- =============================================================================

create table lottery_sync_lock (
  id           smallint primary key default 1 check (id = 1),
  holder       text,
  acquired_at  timestamptz,
  updated_at   timestamptz not null default now()
);

insert into lottery_sync_lock (id) values (1);

comment on table lottery_sync_lock is
  'Cerrojo singleton del tick de loterias. Una fila. Sin dato de negocio (D-148).';

alter table lottery_sync_lock enable row level security;
alter table lottery_sync_lock force  row level security;

-- SELECT se concede para que PostgREST no distinga "no existe" de "sin
-- permiso" (T15). FORCE RLS sin politica devuelve cero filas.
grant select on lottery_sync_lock to authenticated;
grant all    on lottery_sync_lock to service_role;

create trigger lottery_sync_lock_set_updated_at
  before update on lottery_sync_lock
  for each row execute function set_updated_at();

-- =============================================================================
-- try_acquire_lottery_sync_lock
--
-- Un UPDATE condicional funciona con el pooler en modo transaccion; un
-- advisory lock de sesion no. Si el holder anterior lleva mas de
-- p_stale_minutes, se considera abandonado (caida a mitad de tick).
-- =============================================================================
create function try_acquire_lottery_sync_lock(
  p_holder text,
  p_stale_minutes integer default 5
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n int;
begin
  if p_holder is null or length(btrim(p_holder)) = 0 then
    raise exception 'holder requerido';
  end if;
  if p_stale_minutes is null or p_stale_minutes < 1 or p_stale_minutes > 60 then
    raise exception 'stale_minutes fuera de rango';
  end if;

  update lottery_sync_lock
     set holder = btrim(p_holder),
         acquired_at = now()
   where id = 1
     and (
       acquired_at is null
       or acquired_at < now() - make_interval(mins => p_stale_minutes)
     );

  get diagnostics n = row_count;
  return n = 1;
end;
$$;

comment on function try_acquire_lottery_sync_lock(text, integer) is
  'Toma el cerrojo del tick de loterias. service_role only (D-148).';

revoke execute on function try_acquire_lottery_sync_lock(text, integer)
  from public, anon, authenticated;
grant execute on function try_acquire_lottery_sync_lock(text, integer) to service_role;

create function release_lottery_sync_lock(p_holder text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n int;
begin
  if p_holder is null or length(btrim(p_holder)) = 0 then
    raise exception 'holder requerido';
  end if;

  update lottery_sync_lock
     set holder = null,
         acquired_at = null
   where id = 1
     and holder = btrim(p_holder);

  get diagnostics n = row_count;
  return n = 1;
end;
$$;

comment on function release_lottery_sync_lock(text) is
  'Suelta el cerrojo solo si lo tiene este holder (D-148).';

revoke execute on function release_lottery_sync_lock(text)
  from public, anon, authenticated;
grant execute on function release_lottery_sync_lock(text) to service_role;
