-- =============================================================================
-- 0037_lottery_sync.sql
-- Resultados oficiales de loterias colombianas — Etapa 3
--
-- Referencia: docs/BUSINESS_RULES.md BR-L18, BR-L19; docs/DECISIONS.md D-145,
-- D-146. Reutiliza 0036 (programacion, resultados, coincidencias, matching).
--
-- QUE HACE, Y QUE NO HACE
--
-- Deja el procesamiento local completo: sincronizar la programacion de forma
-- idempotente, confirmar un resultado, buscar coincidencias y crear avisos.
-- No pinta el Panel. No activa cron. No concede EXECUTE a authenticated.
--
-- Las escrituras viven aqui, no en TypeScript, para que un reintento o una
-- interrupcion no duplique resultados, fotografias ni avisos (D-145).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Avisos: dos kinds nuevos. El texto sigue en la aplicacion (I-030, D-093).
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.notifications'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%kind%'
  loop
    execute format('alter table public.notifications drop constraint %I', r.conname);
  end loop;
end
$$;

alter table notifications
  add constraint notifications_kind_check
  check (kind in (
    'team.member_added',
    'team.sale',
    'lottery.result',
    'lottery.schedule_change'
  ));

-- Una aviso de resultado por sorteo y destinatario (BR-L19).
create unique index notifications_lottery_result_once
  on notifications (recipient_profile_id, entity_id)
  where kind = 'lottery.result';

-- Una aviso por cambio, version de programacion, sorteo y destinatario (BR-L19).
create unique index notifications_lottery_schedule_once
  on notifications (
    recipient_profile_id,
    entity_id,
    ((data ->> 'schedule_version'))
  )
  where kind = 'lottery.schedule_change';

comment on constraint notifications_kind_check on notifications is
  'Kinds de equipo (0023) y de loteria (0037). El texto no vive aqui (I-030).';

-- =============================================================================
-- sync_lottery_schedules
--
-- Recibe el cronograma ya extraido (CNJSA). Conserva reference_date y
-- original_scheduled_at. Solo incrementa schedule_version cuando cambia algo
-- real: hora oficial, estado o motivo. Un hash nuevo del mismo contenido no
-- es un cambio (BR-L18).
-- =============================================================================
create function sync_lottery_schedules(p_draws jsonb, p_source jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item              jsonb;
  v_code              lottery_code;
  v_number            text;
  v_ref               date;
  v_original          timestamptz;
  v_official          timestamptz;
  v_status            lottery_schedule_status;
  v_reason            lottery_schedule_change_reason;
  v_url               text;
  v_authority         text;
  v_doc_version       text;
  v_hash              text;
  v_verified          timestamptz;
  v_existing          lottery_draw_schedules%rowtype;
  v_occupant_id       uuid;
  v_occupant_number   text;
  v_changed           boolean;
  v_inserted          integer := 0;
  v_updated           integer := 0;
  v_skipped           integer := 0;
  v_conflicts         integer := 0;
begin
  perform pg_advisory_xact_lock(8675310, 1);

  v_url := nullif(p_source->>'url', '');
  v_authority := coalesce(nullif(p_source->>'authority', ''), 'CNJSA');
  v_doc_version := nullif(p_source->>'document_version', '');
  v_hash := nullif(p_source->>'content_hash', '');
  v_verified := coalesce((p_source->>'verified_at')::timestamptz, now());

  if v_url is not null and v_url !~ '^https://' then
    raise exception 'La URL de la fuente de programacion debe ser HTTPS.';
  end if;
  if v_hash is not null and v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'El hash de la programacion no es un SHA-256 hexadecimal.';
  end if;

  if p_draws is null or jsonb_typeof(p_draws) <> 'array' then
    raise exception 'La programacion no trae sorteos.';
  end if;

  for v_item in select value from jsonb_array_elements(p_draws)
  loop
    v_number := nullif(btrim(v_item->>'draw_number'), '');
    if v_number is null or length(v_number) > 32 then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if (v_item->>'lottery_code') is null
       or not (v_item->>'lottery_code') = any (enum_range(null::lottery_code)::text[]) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if (v_item->>'reference_date') !~ '^\d{4}-\d{2}-\d{2}$' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if (v_item->>'schedule_status') is null
       or not (v_item->>'schedule_status') = any (enum_range(null::lottery_schedule_status)::text[]) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_code := (v_item->>'lottery_code')::lottery_code;
    v_ref := (v_item->>'reference_date')::date;
    v_status := (v_item->>'schedule_status')::lottery_schedule_status;
    -- Completado lo marca confirm_lottery_result, nunca el cronograma.
    if v_status = 'completed' then
      v_status := 'scheduled';
    end if;

    v_original := nullif(v_item->>'original_scheduled_at', '')::timestamptz;
    v_official := nullif(v_item->>'official_scheduled_at', '')::timestamptz;
    if nullif(v_item->>'change_reason', '') is not null
       and (v_item->>'change_reason') = any (enum_range(null::lottery_schedule_change_reason)::text[]) then
      v_reason := (v_item->>'change_reason')::lottery_schedule_change_reason;
    else
      v_reason := null;
    end if;

    if v_status <> 'schedule_unverified' and v_official is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select * into v_existing
      from lottery_draw_schedules
     where lottery_code = v_code
       and draw_number = v_number
     for update;

    if not found then
      select s.id, s.draw_number into v_occupant_id, v_occupant_number
        from lottery_draw_schedules s
       where s.lottery_code = v_code
         and s.reference_date = v_ref
         and s.draw_number is distinct from v_number
       for update;
      if found then
        update lottery_draw_schedules
           set schedule_status = 'schedule_conflict',
               schedule_version = schedule_version + 1,
               source_url = v_url,
               source_authority = v_authority,
               source_document_version = v_doc_version,
               source_content_hash = v_hash,
               verified_at = v_verified
         where id = v_occupant_id
           and schedule_status not in ('completed', 'schedule_conflict');
        v_conflicts := v_conflicts + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      insert into lottery_draw_schedules (
        lottery_code, draw_number, reference_date,
        original_scheduled_at, official_scheduled_at,
        schedule_status, change_reason,
        source_url, source_authority, source_document_version,
        source_content_hash, verified_at, schedule_version
      ) values (
        v_code, v_number, v_ref,
        v_original, v_official,
        v_status, v_reason,
        v_url, v_authority, v_doc_version,
        v_hash, v_verified, 1
      );
      v_inserted := v_inserted + 1;
      continue;
    end if;

    -- Completado: solo se refresca la procedencia. No se deshace el resultado.
    if v_existing.schedule_status = 'completed' then
      update lottery_draw_schedules
         set source_url = v_url,
             source_authority = v_authority,
             source_document_version = v_doc_version,
             source_content_hash = v_hash,
             verified_at = v_verified
       where id = v_existing.id;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Conflicto ya marcado: no se inventa una resolucion (encargo §14).
    if v_existing.schedule_status = 'schedule_conflict' then
      update lottery_draw_schedules
         set source_url = v_url,
             source_authority = v_authority,
             source_document_version = v_doc_version,
             source_content_hash = v_hash,
             verified_at = v_verified
       where id = v_existing.id;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- La fecha de referencia no cambia. Si el documento trae otra, hay conflicto.
    if v_existing.reference_date is distinct from v_ref then
      update lottery_draw_schedules
         set schedule_status = 'schedule_conflict',
             schedule_version = schedule_version + 1,
             source_url = v_url,
             source_authority = v_authority,
             source_document_version = v_doc_version,
             source_content_hash = v_hash,
             verified_at = v_verified
       where id = v_existing.id;
      v_conflicts := v_conflicts + 1;
      continue;
    end if;

    v_changed :=
      v_existing.official_scheduled_at is distinct from v_official
      or v_existing.schedule_status is distinct from v_status
      or v_existing.change_reason is distinct from v_reason;

    if not v_changed then
      update lottery_draw_schedules
         set source_url = v_url,
             source_authority = v_authority,
             source_document_version = v_doc_version,
             source_content_hash = v_hash,
             verified_at = v_verified,
             original_scheduled_at = coalesce(v_existing.original_scheduled_at, v_original)
       where id = v_existing.id;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update lottery_draw_schedules
       set official_scheduled_at = v_official,
           original_scheduled_at = coalesce(v_existing.original_scheduled_at, v_original),
           schedule_status = v_status,
           change_reason = v_reason,
           schedule_version = schedule_version + 1,
           source_url = v_url,
           source_authority = v_authority,
           source_document_version = v_doc_version,
           source_content_hash = v_hash,
           verified_at = v_verified
     where id = v_existing.id;
    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'changed', v_updated,
    'skipped', v_skipped,
    'conflicts', v_conflicts
  );
end;
$$;

comment on function sync_lottery_schedules(jsonb, jsonb) is
  'Upsert idempotente del cronograma ordinario. Conserva reference_date y original_scheduled_at (BR-L18, D-145).';

revoke execute on function sync_lottery_schedules(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function sync_lottery_schedules(jsonb, jsonb) to service_role;

-- =============================================================================
-- notify_lottery_schedule_changes
--
-- Avisa desde 48 h antes del instante relevante. Un cambio historico del
-- cronograma anual no genera avisos al importarlo. Conflicto y horario sin
-- verificar se avisan en cuanto se detectan, si la fecha de referencia sigue
-- siendo operativa (D-146).
-- =============================================================================
create function notify_lottery_schedule_changes(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row          lottery_draw_schedules%rowtype;
  v_today        date;
  v_relevant     timestamptz;
  v_due          boolean;
  v_notified     integer := 0;
  v_considered   integer := 0;
  v_inserted     integer;
  v_official_date date;
begin
  v_today := (p_now at time zone 'America/Bogota')::date;

  for v_row in
    select *
      from lottery_draw_schedules
     where schedule_status in (
             'rescheduled_later',
             'rescheduled_earlier',
             'suspended',
             'cancelled',
             'schedule_unverified',
             'schedule_conflict'
           )
        or (schedule_status = 'scheduled' and change_reason = 'holiday')
  loop
    v_considered := v_considered + 1;
    v_official_date := case
      when v_row.official_scheduled_at is null then null
      else (v_row.official_scheduled_at at time zone 'America/Bogota')::date
    end;

    if v_row.schedule_status in ('schedule_conflict', 'schedule_unverified') then
      v_due := v_row.reference_date between (v_today - 2) and (v_today + 60);
    else
      v_relevant := coalesce(
        v_row.official_scheduled_at,
        v_row.original_scheduled_at,
        (v_row.reference_date::timestamp at time zone 'America/Bogota')
      );
      v_due := v_relevant is not null
               and p_now >= v_relevant - interval '48 hours'
               and p_now <= v_relevant + interval '24 hours';
    end if;

    if not v_due then
      continue;
    end if;

    with recips as (
      select m.organization_id, m.profile_id
        from memberships m
       where m.is_active
         and m.role in ('owner', 'admin', 'seller')
    ), ins as (
      insert into notifications (
        organization_id, recipient_profile_id, actor_profile_id, kind,
        entity_type, entity_id, data
      )
      select
        recips.organization_id,
        recips.profile_id,
        null,
        'lottery.schedule_change',
        'lottery_draw_schedule',
        v_row.id,
        jsonb_build_object(
          'lottery_code', v_row.lottery_code,
          'draw_number', v_row.draw_number,
          'schedule_status', v_row.schedule_status,
          'change_reason', v_row.change_reason,
          'reference_date', v_row.reference_date,
          'official_date', v_official_date,
          'schedule_version', v_row.schedule_version::text
        )
      from recips
      on conflict (recipient_profile_id, entity_id, ((data ->> 'schedule_version')))
        where kind = 'lottery.schedule_change'
        do nothing
      returning 1
    )
    select count(*)::int into v_inserted from ins;

    v_notified := v_notified + coalesce(v_inserted, 0);
  end loop;

  return jsonb_build_object(
    'considered', v_considered,
    'inserted', v_notified
  );
end;
$$;

comment on function notify_lottery_schedule_changes(timestamptz) is
  'Crea avisos de cambio de programacion, deduplicados por sorteo, version y destinatario (BR-L19, D-146).';

revoke execute on function notify_lottery_schedule_changes(timestamptz)
  from public, anon, authenticated;
grant execute on function notify_lottery_schedule_changes(timestamptz) to service_role;

-- =============================================================================
-- confirm_lottery_result
--
-- Persiste el numero mayor, busca coincidencias, avisa y marca completed.
-- Una sola transaccion: si algo falla no queda un resultado confirmado sin
-- avisos. Reintentar con el mismo numero no duplica (D-145, BR-L19).
-- =============================================================================
create function confirm_lottery_result(
  p_lottery_code lottery_code,
  p_draw_number text,
  p_winning_number text,
  p_series text default null,
  p_source_url text default null,
  p_source_kind text default 'official_page',
  p_source_content_hash text default null,
  p_evidence jsonb default '{}'::jsonb,
  p_official_date date default null,
  p_fetched_at timestamptz default now(),
  p_published_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_schedule         lottery_draw_schedules%rowtype;
  v_result           lottery_results%rowtype;
  v_official_date    date;
  v_match            jsonb;
  v_inserted_matches integer := 0;
  v_notified         integer := 0;
  v_chunk            integer;
  v_org              uuid;
  v_seller           uuid;
  v_sold             integer;
  v_available        integer;
  v_late             integer;
  v_client_name      text;
  v_raffle_names     text[];
  v_raffle_count     integer;
begin
  perform pg_advisory_xact_lock(
    8675311,
    hashtext(p_lottery_code::text || ':' || p_draw_number)
  );

  if p_winning_number is null or p_winning_number !~ '^[0-9]{4}$' then
    raise exception 'El numero mayor no es un texto de cuatro digitos.';
  end if;
  if p_source_url is not null and p_source_url !~ '^https://' then
    raise exception 'La URL de la fuente del resultado debe ser HTTPS.';
  end if;
  if p_source_content_hash is not null and p_source_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'El hash del resultado no es un SHA-256 hexadecimal.';
  end if;
  if p_source_kind is not null
     and p_source_kind not in (
       'official_page', 'official_bulletin', 'official_act', 'cnjsa_schedule'
     ) then
    raise exception 'El tipo de fuente del resultado no es valido.';
  end if;

  select * into v_schedule
    from lottery_draw_schedules
   where lottery_code = p_lottery_code
     and draw_number = p_draw_number
   for update;
  if not found then
    raise exception 'No hay programacion para ese sorteo.';
  end if;

  if v_schedule.schedule_status in (
    'suspended', 'cancelled', 'schedule_conflict', 'schedule_unverified'
  ) then
    raise exception 'La programacion de este sorteo no permite confirmar un resultado.';
  end if;

  if v_schedule.official_scheduled_at is null then
    raise exception 'Este sorteo no tiene horario oficial.';
  end if;

  v_official_date := (v_schedule.official_scheduled_at at time zone 'America/Bogota')::date;
  -- Publicacion despues de medianoche: el resultado sigue siendo de este sorteo.
  if p_official_date is not null
     and p_official_date is distinct from v_official_date
     and p_official_date is distinct from (v_official_date + 1) then
    raise exception 'El resultado no corresponde a la fecha oficial de este sorteo.';
  end if;

  insert into lottery_results (
    schedule_id, winning_number, series, validation_status,
    source_url, source_kind, source_content_hash, evidence,
    fetched_at, published_at, confirmed_at
  ) values (
    v_schedule.id,
    p_winning_number,
    nullif(p_series, ''),
    'confirmed',
    p_source_url,
    p_source_kind,
    p_source_content_hash,
    coalesce(p_evidence, '{}'::jsonb),
    coalesce(p_fetched_at, now()),
    p_published_at,
    now()
  )
  on conflict (schedule_id) do update
    set winning_number = excluded.winning_number,
        series = coalesce(lottery_results.series, excluded.series),
        source_url = coalesce(lottery_results.source_url, excluded.source_url),
        source_kind = coalesce(lottery_results.source_kind, excluded.source_kind),
        source_content_hash = coalesce(
          lottery_results.source_content_hash, excluded.source_content_hash
        ),
        evidence = case
          when lottery_results.evidence = '{}'::jsonb then excluded.evidence
          else lottery_results.evidence
        end,
        fetched_at = excluded.fetched_at,
        published_at = coalesce(lottery_results.published_at, excluded.published_at),
        confirmed_at = coalesce(lottery_results.confirmed_at, excluded.confirmed_at),
        validation_status = case
          when lottery_results.validation_status = 'conflict' then 'conflict'
          else 'confirmed'
        end
  returning * into v_result;

  if v_result.validation_status = 'conflict' then
    return jsonb_build_object(
      'result_id', v_result.id,
      'validation_status', 'conflict',
      'matches_inserted', 0,
      'notifications_inserted', 0,
      'schedule_status', v_schedule.schedule_status
    );
  end if;

  v_match := match_lottery_result(v_result.id);
  v_inserted_matches := coalesce((v_match->>'inserted')::int, 0);

  -- Vendedores con al menos una coincidencia. Sin coincidencias, nadie se avisa.
  for v_org, v_seller, v_sold, v_available, v_late, v_client_name, v_raffle_names, v_raffle_count in
    select
      m.organization_id,
      m.seller_id,
      count(*) filter (where m.assignment_status = 'sold')::int,
      count(*) filter (where m.assignment_status = 'available')::int,
      count(*) filter (where m.assignment_status = 'late_assignment')::int,
      (
        select c.name
          from lottery_ticket_matches sold
          join clients c on c.id = sold.client_id
         where sold.result_id = v_result.id
           and sold.organization_id = m.organization_id
           and sold.seller_id = m.seller_id
           and sold.assignment_status = 'sold'
         order by sold.created_at
         limit 1
      ),
      array_agg(distinct r.name order by r.name),
      count(distinct m.raffle_id)::int
    from lottery_ticket_matches m
    join raffles r
      on r.id = m.raffle_id
     and r.organization_id = m.organization_id
    where m.result_id = v_result.id
    group by m.organization_id, m.seller_id
  loop
    if not exists (
      select 1 from memberships mem
       where mem.profile_id = v_seller
         and mem.organization_id = v_org
         and mem.is_active
    ) then
      continue;
    end if;

    with ins as (
      insert into notifications (
        organization_id, recipient_profile_id, actor_profile_id, kind,
        entity_type, entity_id, data
      ) values (
        v_org,
        v_seller,
        null,
        'lottery.result',
        'lottery_result',
        v_result.id,
        jsonb_build_object(
          'audience', 'seller',
          'lottery_code', v_schedule.lottery_code,
          'draw_number', v_schedule.draw_number,
          'winning_number', v_result.winning_number,
          'reference_date', v_schedule.reference_date,
          'sold_count', v_sold,
          'available_count', v_available + v_late,
          'late_count', v_late,
          'client_name', v_client_name,
          'raffle_names', to_jsonb(v_raffle_names),
          'raffle_count', v_raffle_count
        )
      )
      on conflict (recipient_profile_id, entity_id) where kind = 'lottery.result'
        do nothing
      returning 1
    )
    select count(*)::int into v_chunk from ins;
    v_notified := v_notified + coalesce(v_chunk, 0);
  end loop;

  -- Personal: un aviso agregado por organizacion, solo si hubo coincidencias.
  for v_org, v_sold, v_available, v_late, v_raffle_names, v_raffle_count in
    select
      m.organization_id,
      count(*) filter (where m.assignment_status = 'sold')::int,
      count(*) filter (where m.assignment_status = 'available')::int,
      count(*) filter (where m.assignment_status = 'late_assignment')::int,
      array_agg(distinct r.name order by r.name),
      count(distinct m.raffle_id)::int
    from lottery_ticket_matches m
    join raffles r
      on r.id = m.raffle_id
     and r.organization_id = m.organization_id
    where m.result_id = v_result.id
    group by m.organization_id
  loop
    with recips as (
      select unnest(org_staff_profile_ids(v_org)) as profile_id
    ), ins as (
      insert into notifications (
        organization_id, recipient_profile_id, actor_profile_id, kind,
        entity_type, entity_id, data
      )
      select
        v_org,
        recips.profile_id,
        null,
        'lottery.result',
        'lottery_result',
        v_result.id,
        jsonb_build_object(
          'audience', 'staff',
          'lottery_code', v_schedule.lottery_code,
          'draw_number', v_schedule.draw_number,
          'winning_number', v_result.winning_number,
          'reference_date', v_schedule.reference_date,
          'sold_count', v_sold,
          'available_count', v_available + v_late,
          'late_count', v_late,
          'raffle_names', to_jsonb(v_raffle_names),
          'raffle_count', v_raffle_count
        )
      from recips
      where recips.profile_id is not null
      on conflict (recipient_profile_id, entity_id) where kind = 'lottery.result'
        do nothing
      returning 1
    )
    select count(*)::int into v_chunk from ins;
    v_notified := v_notified + coalesce(v_chunk, 0);
  end loop;

  update lottery_draw_schedules
     set schedule_status = 'completed'
   where id = v_schedule.id
     and schedule_status <> 'completed';

  return jsonb_build_object(
    'result_id', v_result.id,
    'validation_status', v_result.validation_status,
    'matches_inserted', v_inserted_matches,
    'notifications_inserted', v_notified,
    'schedule_status', 'completed'
  );
end;
$$;

comment on function confirm_lottery_result(
  lottery_code, text, text, text, text, text, text, jsonb, date, timestamptz, timestamptz
) is
  'Confirma un resultado, busca coincidencias y avisa. Idempotente. Sin EXECUTE para authenticated (D-145).';

revoke execute on function confirm_lottery_result(
  lottery_code, text, text, text, text, text, text, jsonb, date, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function confirm_lottery_result(
  lottery_code, text, text, text, text, text, text, jsonb, date, timestamptz, timestamptz
) to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function confirm_lottery_result(
--   lottery_code, text, text, text, text, text, text, jsonb, date, timestamptz, timestamptz);
-- drop function notify_lottery_schedule_changes(timestamptz);
-- drop function sync_lottery_schedules(jsonb, jsonb);
-- drop index notifications_lottery_schedule_once;
-- drop index notifications_lottery_result_once;
-- alter table notifications drop constraint notifications_kind_check;
-- alter table notifications add constraint notifications_kind_check
--   check (kind in ('team.member_added', 'team.sale'));
--
-- Revertir no borra avisos ya emitidos ni coincidencias. 0036 se queda.
-- =============================================================================
