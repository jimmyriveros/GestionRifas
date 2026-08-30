-- =============================================================================
-- 0036_lottery_results.sql
-- Resultados oficiales de loterias colombianas — Etapa 1
--
-- Referencia: docs/BUSINESS_RULES.md BR-L01..BR-L16, docs/DECISIONS.md D-140,
-- D-141 y D-142.
--
-- QUE HACE, Y QUE NO HACE
--
-- Deja el contrato persistente: programacion oficial, resultado confirmado,
-- fotografia de coincidencias y registro de sincronizacion. El matching es
-- set-based, textual y exacto. No consulta internet, no pinta el Panel y no
-- crea avisos.
--
-- Programacion y resultados son NACIONALES (no tienen organization_id):
-- Cundinamarca no es de una rifa. Las coincidencias SI pertenecen a una
-- organizacion, una rifa y un vendedor.
--
-- `tickets_select` NO se toca (D-141, D-092). El vendedor ve coincidencias
-- propias por la RLS de `lottery_ticket_matches`, no porque ahora vea boletas
-- ajenas.
--
-- NUMEROS COMO TEXTO (BR-N01, BR-N03, BR-L06). El numero mayor es exactamente
-- cuatro digitos. `0046` no coincide con `46`. No hay casteo, ni lpad, ni
-- trim. Se usa [0-9] y no \d (D-018).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type lottery_code as enum (
  'cundinamarca',
  'cruz_roja',
  'meta',
  'bogota',
  'medellin',
  'boyaca'
);

create type lottery_schedule_status as enum (
  'scheduled',
  'rescheduled_later',
  'rescheduled_earlier',
  'suspended',
  'cancelled',
  'completed',
  'schedule_unverified',
  'schedule_conflict'
);

create type lottery_schedule_change_reason as enum (
  'holiday',
  'official_change',
  'force_majeure',
  'unknown'
);

create type lottery_result_validation_status as enum (
  'pending',
  'confirmed',
  'rejected',
  'conflict'
);

create type lottery_match_field as enum (
  'daily_number',
  'weekly_number'
);

create type lottery_assignment_status as enum (
  'sold',
  'available',
  'late_assignment'
);

create type lottery_sync_kind as enum (
  'schedule',
  'results'
);

create type lottery_sync_outcome as enum (
  'success',
  'partial',
  'failed',
  'skipped'
);

-- Habilita la FK compuesta de las coincidencias: una boleta no puede
-- fotografiarse en otra organizacion.
alter table tickets
  add constraint tickets_id_org_key unique (id, organization_id);

-- =============================================================================
-- lottery_draw_schedules — programacion oficial, una fila por sorteo ordinario
-- =============================================================================
create table lottery_draw_schedules (
  id                      uuid primary key default gen_random_uuid(),
  lottery_code            lottery_code not null,
  draw_number             text not null check (length(btrim(draw_number)) between 1 and 32),
  -- Fecha nominal del premio en el negocio. No cambia si el sorteo se adelanta
  -- o se aplaza (BR-L03).
  reference_date          date not null,
  original_scheduled_at   timestamptz,
  official_scheduled_at   timestamptz,
  schedule_status         lottery_schedule_status not null default 'schedule_unverified',
  change_reason           lottery_schedule_change_reason,
  source_url              text,
  source_authority        text,
  source_document_version text,
  source_content_hash     text check (
    source_content_hash is null or source_content_hash ~ '^[0-9a-f]{64}$'
  ),
  verified_at             timestamptz,
  schedule_version        integer not null default 1 check (schedule_version >= 1),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint lottery_draw_schedules_draw_key
    unique (lottery_code, draw_number),
  constraint lottery_draw_schedules_reference_key
    unique (lottery_code, reference_date),
  -- Sin horario oficial solo se admite el estado "por confirmar". Completado,
  -- aplazado o adelantado exige instante vigente (BR-L04).
  constraint lottery_draw_schedules_official_time_check check (
    schedule_status = 'schedule_unverified'
    or official_scheduled_at is not null
  ),
  constraint lottery_draw_schedules_source_url_check check (
    source_url is null or source_url ~ '^https://'
  )
);

create trigger lottery_draw_schedules_set_updated_at
  before update on lottery_draw_schedules
  for each row execute function set_updated_at();

comment on table lottery_draw_schedules is
  'Programacion oficial de los seis sorteos ordinarios. Nacional, sin organization_id (D-141).';
comment on column lottery_draw_schedules.reference_date is
  'Fecha nominal del premio. Se conserva si el sorteo se traslada (BR-L03).';
comment on column lottery_draw_schedules.official_scheduled_at is
  'Instante vigente del sorteo, despues de cambios oficiales (BR-L04).';

create index lottery_draw_schedules_official_idx
  on lottery_draw_schedules (official_scheduled_at)
  where schedule_status in (
    'scheduled', 'rescheduled_later', 'rescheduled_earlier'
  );

create index lottery_draw_schedules_status_idx
  on lottery_draw_schedules (schedule_status, lottery_code);

-- =============================================================================
-- lottery_results — un resultado por sorteo programado
-- =============================================================================
create table lottery_results (
  id                          uuid primary key default gen_random_uuid(),
  schedule_id                 uuid not null unique
    references lottery_draw_schedules (id) on delete restrict,
  winning_number              text check (
    winning_number is null or winning_number ~ '^[0-9]{4}$'
  ),
  series                      text,
  validation_status           lottery_result_validation_status not null default 'pending',
  source_url                  text,
  source_kind                 text check (
    source_kind is null
    or source_kind in (
      'official_page', 'official_bulletin', 'official_act', 'cnjsa_schedule'
    )
  ),
  source_content_hash         text check (
    source_content_hash is null or source_content_hash ~ '^[0-9a-f]{64}$'
  ),
  evidence                    jsonb not null default '{}'::jsonb,
  conflicting_winning_number  text check (
    conflicting_winning_number is null
    or conflicting_winning_number ~ '^[0-9]{4}$'
  ),
  published_at                timestamptz,
  fetched_at                  timestamptz not null default now(),
  confirmed_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint lottery_results_confirmed_number_check check (
    validation_status not in ('confirmed', 'conflict')
    or winning_number ~ '^[0-9]{4}$'
  ),
  constraint lottery_results_source_url_check check (
    source_url is null or source_url ~ '^https://'
  )
);

create trigger lottery_results_set_updated_at
  before update on lottery_results
  for each row execute function set_updated_at();

comment on table lottery_results is
  'Resultado oficial de un sorteo ordinario. Un sorteo confirmado no admite otro numero activo (BR-L08).';
comment on column lottery_results.winning_number is
  'Numero mayor, texto exacto de cuatro digitos. Nunca se castea (BR-L06).';
comment on column lottery_results.series is
  'Serie informativa. Nullable. No participa en la coincidencia (BR-L07).';
comment on column lottery_results.evidence is
  'Campos extraidos estructurados. Nunca HTML ni el documento completo.';

create index lottery_results_status_idx
  on lottery_results (validation_status);

-- Un resultado confirmado conserva su numero. Si una fuente posterior trae
-- otro, se marca conflicto y NO se sobrescribe (BR-L08).
create function lottery_results_protect_confirmed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.winning_number is not null
     and new.winning_number is distinct from old.winning_number then
    new.conflicting_winning_number := new.winning_number;
    new.winning_number := old.winning_number;
    new.validation_status := 'conflict';
  end if;
  return new;
end;
$$;

create trigger lottery_results_protect_confirmed
  before update on lottery_results
  for each row execute function lottery_results_protect_confirmed();

revoke execute on function lottery_results_protect_confirmed() from anon, public, authenticated;

comment on function lottery_results_protect_confirmed() is
  'Impide sobrescribir el numero mayor confirmado: el intento se registra como conflicto (BR-L08).';

-- =============================================================================
-- lottery_ticket_matches — fotografia inmutable al momento del sorteo
-- =============================================================================
create table lottery_ticket_matches (
  id                        uuid primary key default gen_random_uuid(),
  result_id                 uuid not null
    references lottery_results (id) on delete restrict,
  ticket_id                 uuid not null,
  organization_id           uuid not null references organizations (id) on delete restrict,
  raffle_id                 uuid not null,
  seller_id                 uuid not null,
  -- Solo si estaba asignada ANTES o en el instante oficial. Una asignacion
  -- tardia no rellena este campo: la fotografia no miente (BR-L10).
  client_id                 uuid,
  match_field               lottery_match_field not null,
  matched_number            text not null check (matched_number ~ '^[0-9]{1,4}$'),
  assignment_status         lottery_assignment_status not null,
  inventory_status_at_draw  ticket_inventory_status not null
    check (inventory_status_at_draw in ('available', 'assigned')),
  assigned_at               timestamptz,
  ticket_created_at         timestamptz not null,
  created_at                timestamptz not null default now(),

  constraint lottery_ticket_matches_result_ticket_field_key
    unique (result_id, ticket_id, match_field),

  constraint lottery_ticket_matches_ticket_org_fk
    foreign key (ticket_id, organization_id)
    references tickets (id, organization_id) on delete restrict,
  constraint lottery_ticket_matches_raffle_org_fk
    foreign key (raffle_id, organization_id)
    references raffles (id, organization_id) on delete restrict,
  constraint lottery_ticket_matches_seller_org_fk
    foreign key (seller_id, organization_id)
    references memberships (profile_id, organization_id) on delete restrict,
  constraint lottery_ticket_matches_client_org_fk
    foreign key (client_id, organization_id)
    references clients (id, organization_id) on delete restrict,

  constraint lottery_ticket_matches_sold_fields_check check (
    (assignment_status = 'sold'
      and client_id is not null
      and assigned_at is not null
      and inventory_status_at_draw = 'assigned')
    or
    (assignment_status <> 'sold'
      and client_id is null
      and assigned_at is null
      and inventory_status_at_draw = 'available')
  )
);

comment on table lottery_ticket_matches is
  'Fotografia de una boleta coincidente al instante oficial del sorteo. Inmutable (BR-L11).';
comment on column lottery_ticket_matches.matched_number is
  'Copia textual del numero que coincidio. Conserva ceros iniciales (BR-L06).';
comment on column lottery_ticket_matches.assignment_status is
  'sold = asignada en o antes de official_scheduled_at. No usa payment_status (BR-L09).';

create index lottery_ticket_matches_org_result_idx
  on lottery_ticket_matches (organization_id, result_id);

create index lottery_ticket_matches_seller_result_idx
  on lottery_ticket_matches (seller_id, result_id);

create index lottery_ticket_matches_ticket_idx
  on lottery_ticket_matches (ticket_id);

create index lottery_ticket_matches_raffle_idx
  on lottery_ticket_matches (raffle_id);

-- Ni service_role reescribe una fotografia. Un reintento inserta con
-- ON CONFLICT DO NOTHING.
create function lottery_ticket_matches_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Las coincidencias de un sorteo no se modifican.';
end;
$$;

create trigger lottery_ticket_matches_immutable
  before update or delete on lottery_ticket_matches
  for each row execute function lottery_ticket_matches_immutable();

revoke execute on function lottery_ticket_matches_immutable() from anon, public, authenticated;

comment on function lottery_ticket_matches_immutable() is
  'Las coincidencias son una fotografia: ni UPDATE ni DELETE, tampoco con service_role (BR-L11).';

-- =============================================================================
-- lottery_sync_runs — ejecuciones del sincronizador (Etapas 3 y 5)
-- =============================================================================
create table lottery_sync_runs (
  id               uuid primary key default gen_random_uuid(),
  kind             lottery_sync_kind not null,
  lottery_code     lottery_code,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  outcome          lottery_sync_outcome not null default 'failed',
  records_read     integer not null default 0 check (records_read >= 0),
  records_changed  integer not null default 0 check (records_changed >= 0),
  records_skipped  integer not null default 0 check (records_skipped >= 0),
  error_code       text,
  attempt          integer not null default 1 check (attempt >= 1),
  correlation_id   uuid,
  created_at       timestamptz not null default now()
);

comment on table lottery_sync_runs is
  'Registro de una ejecucion de sincronizacion. No guarda HTML ni documentos (BR-L16).';

create index lottery_sync_runs_started_idx
  on lottery_sync_runs (started_at desc);

-- =============================================================================
-- RLS
--
-- Lectura: cualquier miembro activo ve la programacion y el resultado oficiales
-- (son publicos). Las coincidencias se aislan por organizacion y, para el
-- vendedor, por seller_id. Sin INSERT/UPDATE/DELETE para authenticated.
-- I-019: conjuntos precalculados, nunca is_org_staff(columna).
-- =============================================================================
alter table lottery_draw_schedules  enable row level security;
alter table lottery_draw_schedules  force  row level security;
alter table lottery_results         enable row level security;
alter table lottery_results         force  row level security;
alter table lottery_ticket_matches  enable row level security;
alter table lottery_ticket_matches  force  row level security;
alter table lottery_sync_runs       enable row level security;
alter table lottery_sync_runs       force  row level security;

create policy lottery_draw_schedules_select on lottery_draw_schedules
for select to authenticated
using (exists (select 1 from current_org_ids()));

create policy lottery_results_select on lottery_results
for select to authenticated
using (exists (select 1 from current_org_ids()));

create policy lottery_ticket_matches_select on lottery_ticket_matches
for select to authenticated
using (
  organization_id in (select current_staff_org_ids())
  or (
    organization_id in (select current_org_ids())
    and seller_id = (select current_profile_id())
  )
);

-- lottery_sync_runs: sin politica de SELECT para authenticated. Es bitacora
-- operativa del proceso interno, no correspondencia ni dato de negocio.

grant select on lottery_draw_schedules to authenticated;
grant select on lottery_results        to authenticated;
grant select on lottery_ticket_matches to authenticated;
-- SELECT se concede para que PostgREST no distinga "no existe" de "sin
-- permiso" (T15). FORCE RLS sin politica devuelve cero filas.
grant select on lottery_sync_runs to authenticated;
grant all on lottery_draw_schedules to service_role;
grant all on lottery_results        to service_role;
grant all on lottery_ticket_matches to service_role;
grant all on lottery_sync_runs      to service_role;

-- =============================================================================
-- match_lottery_result — coincidencia set-based (BR-L05, BR-L06, BR-L09..L12)
--
-- SECURITY DEFINER porque escribe en una tabla sin INSERT para authenticated.
-- NO se concede a authenticated ni a anon: la llama el proceso interno
-- (service_role) en las etapas siguientes. No avisa y no marca el sorteo
-- como completed: eso es orquestacion de la Etapa 3.
-- =============================================================================
create function match_lottery_result(p_result_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result    lottery_results%rowtype;
  v_schedule  lottery_draw_schedules%rowtype;
  v_inserted  integer;
begin
  select * into v_result
    from lottery_results
   where id = p_result_id
   for update;
  if not found then
    raise exception 'El resultado no existe.';
  end if;

  if v_result.validation_status <> 'confirmed' then
    raise exception 'Solo se buscan coincidencias de un resultado confirmado.';
  end if;

  if v_result.winning_number is null or v_result.winning_number !~ '^[0-9]{4}$' then
    raise exception 'El numero mayor no es un texto de cuatro digitos.';
  end if;

  select * into v_schedule
    from lottery_draw_schedules
   where id = v_result.schedule_id
   for update;
  if not found then
    raise exception 'La programacion de este sorteo no existe.';
  end if;

  if v_schedule.schedule_status in (
    'suspended', 'cancelled', 'schedule_conflict', 'schedule_unverified'
  ) then
    raise exception 'La programacion de este sorteo no permite buscar coincidencias.';
  end if;

  if v_schedule.official_scheduled_at is null then
    raise exception 'Este sorteo no tiene horario oficial.';
  end if;

  insert into lottery_ticket_matches (
    result_id, ticket_id, organization_id, raffle_id, seller_id, client_id,
    match_field, matched_number, assignment_status,
    inventory_status_at_draw, assigned_at, ticket_created_at
  )
  select
    p_result_id,
    t.id,
    t.organization_id,
    t.raffle_id,
    t.seller_id,
    case
      when t.assigned_at is not null
           and t.assigned_at <= v_schedule.official_scheduled_at
        then t.client_id
      else null
    end,
    case
      when v_schedule.lottery_code = 'boyaca' then 'weekly_number'::lottery_match_field
      else 'daily_number'::lottery_match_field
    end,
    case
      when v_schedule.lottery_code = 'boyaca' then t.weekly_number
      else t.daily_number
    end,
    case
      when t.assigned_at is not null
           and t.assigned_at <= v_schedule.official_scheduled_at
        then 'sold'::lottery_assignment_status
      when t.assigned_at is not null
           and t.assigned_at > v_schedule.official_scheduled_at
        then 'late_assignment'::lottery_assignment_status
      else 'available'::lottery_assignment_status
    end,
    case
      when t.assigned_at is not null
           and t.assigned_at <= v_schedule.official_scheduled_at
        then 'assigned'::ticket_inventory_status
      else 'available'::ticket_inventory_status
    end,
    case
      when t.assigned_at is not null
           and t.assigned_at <= v_schedule.official_scheduled_at
        then t.assigned_at
      else null
    end,
    t.created_at
  from raffles r
  join tickets t
    on t.raffle_id = r.id
   and t.organization_id = r.organization_id
  where r.status in ('active', 'closed')
    and r.start_date <= v_schedule.reference_date
    and r.end_date   >= v_schedule.reference_date
    and t.created_at <= v_schedule.official_scheduled_at
    and (t.cancelled_at is null or t.cancelled_at > v_schedule.official_scheduled_at)
    and t.inventory_status not in ('draft', 'pending_approval')
    and (
      (t.approved_at is null and t.inventory_status in ('available', 'assigned'))
      or (t.approved_at is not null and t.approved_at <= v_schedule.official_scheduled_at)
      or (t.assigned_at is not null and t.assigned_at <= v_schedule.official_scheduled_at)
    )
    and (
      (v_schedule.lottery_code = 'boyaca' and t.weekly_number = v_result.winning_number)
      or
      (v_schedule.lottery_code <> 'boyaca' and t.daily_number = v_result.winning_number)
    )
  on conflict on constraint lottery_ticket_matches_result_ticket_field_key
    do nothing;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'result_id', p_result_id,
    'inserted', v_inserted
  );
end;
$$;

comment on function match_lottery_result(uuid) is
  'Busca coincidencias exactas de un resultado confirmado y guarda la fotografia. Idempotente. No notifica (D-142).';

revoke execute on function match_lottery_result(uuid) from anon, public, authenticated;
grant execute on function match_lottery_result(uuid) to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function match_lottery_result(uuid);
-- drop trigger lottery_ticket_matches_immutable on lottery_ticket_matches;
-- drop function lottery_ticket_matches_immutable();
-- drop table lottery_ticket_matches;
-- drop trigger lottery_results_protect_confirmed on lottery_results;
-- drop function lottery_results_protect_confirmed();
-- drop table lottery_results;
-- drop table lottery_draw_schedules;
-- drop table lottery_sync_runs;
-- alter table tickets drop constraint tickets_id_org_key;
-- drop type lottery_sync_outcome;
-- drop type lottery_sync_kind;
-- drop type lottery_assignment_status;
-- drop type lottery_match_field;
-- drop type lottery_result_validation_status;
-- drop type lottery_schedule_change_reason;
-- drop type lottery_schedule_status;
-- drop type lottery_code;
--
-- Revertir borra programacion, resultados y fotografias. No toca boletas,
-- pagos ni avisos. Las coincidencias son copias de algo que sigue en tickets.
-- =============================================================================
