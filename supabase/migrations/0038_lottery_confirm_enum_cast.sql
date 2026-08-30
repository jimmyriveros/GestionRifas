-- =============================================================================
-- 0038_lottery_confirm_enum_cast.sql
-- El ON CONFLICT de confirm_lottery_result (0037) devolvía text en
-- validation_status. PostgreSQL lo rechaza aunque la fila sea nueva, porque
-- tipa el UPDATE al parsear. 0037 ya estaba aplicada en local: se corrige
-- aqui, sin reescribirla (D-038 de migraciones inmutables).
-- =============================================================================

create or replace function confirm_lottery_result(
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
          when lottery_results.validation_status = 'conflict'::lottery_result_validation_status
            then lottery_results.validation_status
          else excluded.validation_status
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
-- Restaurar el cuerpo de confirm_lottery_result que dejo 0037. No se borra
-- la funcion: 0037 y el matching de 0036 siguen haciendo falta.
-- =============================================================================

