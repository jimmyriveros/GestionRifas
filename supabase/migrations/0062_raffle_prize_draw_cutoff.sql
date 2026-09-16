-- =============================================================================
-- 0062_raffle_prize_draw_cutoff.sql
-- Premios configurables por rifa — correccion de la Entrega 3: el CORTE
-- EFECTIVO de un sorteo
--
-- Referencia normativa: docs/DECISIONS.md D-203 (Decision 9, la respuesta del
-- dueno a I-125) y D-199 (Decision 5); docs/BUSINESS_RULES.md BR-J09;
-- docs/KNOWN_ISSUES.md I-125.
--
-- QUE CORRIGE
--
-- Hasta aqui el corte de las reglas de un premio era la hora ORIGINAL anunciada
-- del sorteo (BR-J09 en su letra de 0058 y 0061). En un sorteo ADELANTADO la
-- hora oficial es anterior a la original, y entre las dos se podia publicar una
-- version que le aplicaba a un sorteo que ya se habia jugado (I-125,
-- reproducido en local el 2026-09-16).
--
-- El dueno decidio: el corte es la MENOR entre `original_scheduled_at` y
-- `official_scheduled_at`.
--
--   * Sin cambio: las dos horas coinciden y el corte es esa.
--   * Aplazado: la oficial es posterior, y el corte sigue siendo la ORIGINAL.
--   * Adelantado: la oficial es anterior, y el corte pasa a ser la OFICIAL.
--   * Estricto: la version tiene que publicarse ANTES del corte, no en el.
--   * Si falta cualquiera de las dos horas, el corte es NULL y no se supone.
--
-- UNA SOLA DEFINICION. `raffle_prize_draw_cutoff(programacion)` es el unico
-- sitio donde se decide el corte. Lo usan:
--
--   * `match_lottery_result`, la rama configurable;
--   * `lottery_ticket_match_prizes_check`, la defensa de los enlaces;
--   * `raffle_prize_cutoff_problem`, que rechaza publicar cuando el corte de un
--     sorteo de una semana ya empezada no se conoce.
--
-- `raffle_prize_versions_at`, `raffle_prize_applicable_version` y
-- `raffle_prize_draw_prizes` NO cambian: reciben el corte ya calculado y
-- comparan con `published_at < corte`, que sigue siendo estricto.
--
-- QUE NO HACE
--
--   * No cambia la rama `legacy` de `match_lottery_result`: es la misma consulta
--     de 0036, y no usa el corte de los premios.
--   * No toca datos: no reescribe enlaces ni fotografias ya guardados y no
--     reprocesa resultados.
--   * No cambia firmas de las funciones existentes, ni privilegios, ni
--     `SECURITY DEFINER`, ni `search_path`.
--   * No cambia el modo de ninguna rifa.
--
-- SOBRE LAS TILDES. Los mensajes que ya existian se conservan tal cual; los
-- comentarios siguen sin tildes (I-030 no se toca aqui).
-- =============================================================================

-- =============================================================================
-- 1. La definicion canonica del corte
--
-- Recibe la FILA de la programacion, no dos instantes sueltos: asi ningun
-- llamador puede equivocarse de columna. `least()` de PostgreSQL IGNORA los
-- NULL y devolveria la hora que si existe; por eso el NULL se trata antes, y un
-- corte que no se puede determinar es NULL.
--
-- Una programacion que no existe llega como una fila nula (un `left join` sin
-- pareja) y tambien da NULL.
-- =============================================================================

create function raffle_prize_draw_cutoff(p_schedule lottery_draw_schedules)
returns timestamptz
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when (p_schedule).original_scheduled_at is null
      or (p_schedule).official_scheduled_at is null
      then null
    else least((p_schedule).original_scheduled_at, (p_schedule).official_scheduled_at)
  end
$$;

comment on function raffle_prize_draw_cutoff(lottery_draw_schedules) is
  'BR-J09, D-203 Decision 9: el corte efectivo de un sorteo, la menor entre la hora original anunciada y la oficial. NULL si falta cualquiera de las dos. Unica definicion: la usan el motor, la defensa de los enlaces y la validacion de publicaciones.';

-- =============================================================================
-- 2. La validacion de publicaciones: un corte desconocido es el EFECTIVO
--
-- El cuerpo de 0058 con una sola condicion cambiada: donde decia
-- `s.original_scheduled_at is null` dice `raffle_prize_draw_cutoff(s) is null`.
-- Una ocurrencia de una semana ya empezada sin hora oficial tampoco tiene corte
-- conocido: podria haberse adelantado y jugado ya. El mensaje no cambia.
-- =============================================================================


create or replace function raffle_prize_cutoff_problem(p_version_ids uuid[])
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with days as (
    select distinct e.reference_date, e.lottery_code
    from unnest(p_version_ids) as v(id)
    cross join lateral raffle_prize_rule_dates(v.id) e
    where v.id is not null
      and e.reference_date - (extract(isodow from e.reference_date::timestamp)::int - 1) <= today_bogota()
  )
  select format(
           'Todavía no conocemos la hora oficial del sorteo del %s, así que no sabemos si ya se jugó. Vuelve a intentarlo cuando la programación oficial la publique.',
           to_char(d.reference_date, 'DD/MM/YYYY')
         )
  from days d
  left join lottery_draw_schedules s
    on s.lottery_code = d.lottery_code
   and s.reference_date = d.reference_date
  where raffle_prize_draw_cutoff(s) is null
  order by d.reference_date
  limit 1
$$;

comment on function raffle_prize_cutoff_problem(uuid[]) is
  'BR-J09: el primer sorteo de una semana ya empezada cuyo corte efectivo (raffle_prize_draw_cutoff) no se conoce, o NULL. Si lo hay, publicar se rechaza en vez de suponer.';

-- =============================================================================
-- 3. La defensa de los enlaces, con el corte efectivo
--
-- El cuerpo de 0061 con una sola expresion cambiada: la version aplicable se
-- pide en `raffle_prize_draw_cutoff(s)`, no en `s.original_scheduled_at`. Un
-- enlace escrito con una version publicada despues de que un sorteo adelantado
-- se jugara se rechaza.
-- =============================================================================


create or replace function lottery_ticket_match_prizes_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_detail text;
begin
  select format('coincidencia %s; premio %s; versión %s', c.match_id, c.prize_id, c.prize_version_id)
    into v_detail
    from (
      select distinct on (i.result_id, i.raffle_id, i.prize_id, i.prize_version_id, i.match_field)
             i.match_id, i.result_id, i.raffle_id, i.prize_id, i.prize_version_id, i.match_field
        from inserted_links i
    ) c
    join lottery_results lr on lr.id = c.result_id
    join lottery_draw_schedules s on s.id = lr.schedule_id
    join raffles r on r.id = c.raffle_id
    join raffle_prize_versions v on v.id = c.prize_version_id
   where r.prize_mode <> 'configurable'
      or v.status <> 'active'
      or v.number_field <> c.match_field
      or raffle_prize_applicable_version(c.prize_id, raffle_prize_draw_cutoff(s))
           is distinct from c.prize_version_id
      or not exists (
        select 1
          from raffle_prize_rule_dates(c.prize_version_id) e
         where e.reference_date = s.reference_date
           and e.lottery_code = s.lottery_code
      )
   limit 1;

  if v_detail is not null then
    raise exception 'El premio enlazado no es el que aplica a este sorteo con esa versión.'
      using errcode = 'check_violation', detail = v_detail;
  end if;

  select format('resultado %s; rifa %s', g.result_id, g.raffle_id)
    into v_detail
    from (
      select m.result_id, m.raffle_id
        from lottery_ticket_matches m
        join lottery_ticket_match_prizes l on l.match_id = m.id
        join raffle_prize_versions v on v.id = l.prize_version_id
       where m.result_id in (select i.result_id from inserted_links i)
       group by m.result_id, m.raffle_id, m.client_id,
                case when m.client_id is null then m.ticket_id end
      having bool_or(v.digits = 'four') and bool_or(v.digits = 'last_three')
    ) g
   limit 1;

  if v_detail is not null then
    raise exception 'Un mismo cliente no puede conservar un premio de tres cifras cuando tiene uno de cuatro en el mismo resultado.'
      using errcode = 'check_violation', detail = v_detail;
  end if;

  return null;
end;
$$;

comment on function lottery_ticket_match_prizes_check() is
  'D-203: cada enlace nuevo usa la version aplicable al corte efectivo (raffle_prize_draw_cutoff), vigente, del mismo numero y con el sorteo en su calendario; y nadie conserva tres cifras teniendo cuatro.';

-- =============================================================================
-- 4. El motor, con el corte efectivo
--
-- El cuerpo de 0061 con estos cambios, y ninguno mas:
--
--   * una variable `v_cutoff`, calculada con `raffle_prize_draw_cutoff`;
--   * la rama configurable falla si `v_cutoff` es NULL, con el mismo mensaje y
--     el mismo codigo: la hora oficial ya se exige para las dos ramas, asi que
--     aqui solo puede faltar la original;
--   * la defensa de la firma duplicada y la sentencia de coincidencias reciben
--     `v_cutoff` en lugar de la hora original;
--   * un comentario del cerrojo que prometia algo que no se puede garantizar.
--
-- La rama `legacy` es literalmente la de 0036.
-- =============================================================================


create or replace function match_lottery_result(p_result_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result        lottery_results%rowtype;
  v_schedule      lottery_draw_schedules%rowtype;
  v_inserted      integer;
  v_raffle_ids    uuid[];
  v_raffle_id     uuid;
  v_cutoff        timestamptz;
  v_conflict      record;
  v_cfg_inserted  bigint := 0;
  v_links         bigint := 0;
begin
  -- El cerrojo del resultado serializa dos ejecuciones del mismo sorteo: la
  -- segunda espera y encuentra hecho lo que hizo la primera.
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

  -- ---------------------------------------------------------------------------
  -- A. Rifas heredadas: la consulta de 0036 sin tocar, mas `prize_mode`.
  -- ---------------------------------------------------------------------------
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
  where r.prize_mode = 'legacy'
    and r.status in ('active', 'closed')
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

  -- ---------------------------------------------------------------------------
  -- B. Rifas configurables.
  --
  -- Participan con la MISMA regla que las heredadas (BR-L05) y cada boleta es
  -- elegible con los MISMOS filtros (BR-L09, BR-L10): no hay una segunda
  -- definicion de que rifa o que boleta juega un sorteo, y las pruebas lo
  -- comprueban lado a lado.
  -- ---------------------------------------------------------------------------
  select array_agg(r.id order by r.id)
    into v_raffle_ids
    from raffles r
   where r.prize_mode = 'configurable'
     and r.status in ('active', 'closed')
     and r.start_date <= v_schedule.reference_date
     and r.end_date   >= v_schedule.reference_date;

  if v_raffle_ids is not null then
    -- El corte EFECTIVO (BR-J09, D-203 Decision 9): la menor entre la hora
    -- original anunciada y la oficial, y lo calcula UNA sola definicion,
    -- `raffle_prize_draw_cutoff`. La oficial ya se exigio arriba, asi que aqui
    -- solo puede faltar la original: sin ella no se sabe que version aplica, y
    -- no se supone. Se falla sin escribir nada.
    v_cutoff := raffle_prize_draw_cutoff(v_schedule);
    if v_cutoff is null then
      raise exception 'No se conoce la hora original anunciada de este sorteo, así que no se puede saber con qué versión de sus premios se juega. No se guardó ninguna coincidencia.'
        using errcode = 'data_exception',
              detail = format('sorteo %s de %s del %s',
                              v_schedule.draw_number, v_schedule.lottery_code,
                              to_char(v_schedule.reference_date, 'DD/MM/YYYY'));
    end if;

    -- El cerrojo de la configuracion de cada rifa, en orden fijo: una
    -- publicacion que ya tiene el cerrojo termina antes de que se decida que
    -- version aplica.
    foreach v_raffle_id in array v_raffle_ids loop
      perform raffle_prize_lock(v_raffle_id);
    end loop;

    -- DEFENSA: dos premios de una rifa con la misma firma en este sorteo. BR-J08
    -- lo impide al guardar; si aun asi aparece, no se elige ninguno.
    select d.raffle_id, d.number_field, d.digits,
           array_agg(d.prize_id::text order by d.prize_id) as prize_ids
      into v_conflict
      from raffle_prize_draw_prizes(
             v_raffle_ids, v_schedule.reference_date,
             v_schedule.lottery_code, v_cutoff
           ) d
     group by d.raffle_id, d.number_field, d.digits
    having count(*) > 1
     order by d.raffle_id, d.number_field, d.digits
     limit 1;

    if found then
      raise exception 'Dos premios de una misma rifa juegan este sorteo con el mismo número de la boleta y las mismas cifras, así que no se puede decidir cuál aplica. No se guardó ninguna coincidencia.'
        using errcode = 'check_violation',
              detail = format('rifa %s; premios %s; número %s; cifras %s; sorteo %s de %s del %s',
                              v_conflict.raffle_id,
                              array_to_string(v_conflict.prize_ids, ', '),
                              v_conflict.number_field, v_conflict.digits,
                              v_schedule.draw_number, v_schedule.lottery_code,
                              to_char(v_schedule.reference_date, 'DD/MM/YYYY')),
              hint = 'BR-J08 impide guardar esa configuración desde la aplicación: revisa cómo llegaron esos premios a la base antes de volver a confirmar el resultado.';
    end if;

    -- UNA sentencia: premios que juegan, boletas que coinciden, prioridad,
    -- fotografias y enlaces. Si algo falla, no queda nada escrito.
    with applicable as (
      select d.organization_id, d.raffle_id, d.prize_id, d.version_id,
             d.number_field, d.digits
        from raffle_prize_draw_prizes(
               v_raffle_ids, v_schedule.reference_date,
               v_schedule.lottery_code, v_cutoff
             ) d
    ),
    -- Una rama por numero y cifras, para que cada una use su indice: las
    -- cuatro cifras son igualdad textual (BR-J06); las tres ultimas exigen un
    -- numero de al menos tres caracteres. Nunca se castea ni se rellena.
    hits as (
      select a.prize_id, a.version_id, a.number_field, a.digits, t.id as ticket_id
        from applicable a
        join tickets t
          on t.organization_id = a.organization_id
         and t.raffle_id = a.raffle_id
         and t.daily_number = v_result.winning_number
       where a.number_field = 'daily_number' and a.digits = 'four'
      union all
      select a.prize_id, a.version_id, a.number_field, a.digits, t.id
        from applicable a
        join tickets t
          on t.organization_id = a.organization_id
         and t.raffle_id = a.raffle_id
         and t.weekly_number = v_result.winning_number
       where a.number_field = 'weekly_number' and a.digits = 'four'
      union all
      select a.prize_id, a.version_id, a.number_field, a.digits, t.id
        from applicable a
        join tickets t
          on t.organization_id = a.organization_id
         and t.raffle_id = a.raffle_id
         and char_length(t.daily_number) >= 3
         and right(t.daily_number, 3) = right(v_result.winning_number, 3)
       where a.number_field = 'daily_number' and a.digits = 'last_three'
      union all
      select a.prize_id, a.version_id, a.number_field, a.digits, t.id
        from applicable a
        join tickets t
          on t.organization_id = a.organization_id
         and t.raffle_id = a.raffle_id
         and char_length(t.weekly_number) >= 3
         and right(t.weekly_number, 3) = right(v_result.winning_number, 3)
       where a.number_field = 'weekly_number' and a.digits = 'last_three'
    ),
    -- La fotografia de cada boleta que coincide, con los MISMOS filtros de
    -- elegibilidad y las MISMAS expresiones que la rama heredada.
    candidates as (
      select
        h.prize_id,
        h.version_id,
        h.number_field as match_field,
        h.digits,
        t.id as ticket_id,
        t.organization_id,
        t.raffle_id,
        t.seller_id,
        case
          when t.assigned_at is not null
               and t.assigned_at <= v_schedule.official_scheduled_at
            then t.client_id
          else null
        end as client_id,
        case
          when h.number_field = 'weekly_number' then t.weekly_number
          else t.daily_number
        end as matched_number,
        case
          when t.assigned_at is not null
               and t.assigned_at <= v_schedule.official_scheduled_at
            then 'sold'::lottery_assignment_status
          when t.assigned_at is not null
               and t.assigned_at > v_schedule.official_scheduled_at
            then 'late_assignment'::lottery_assignment_status
          else 'available'::lottery_assignment_status
        end as assignment_status,
        case
          when t.assigned_at is not null
               and t.assigned_at <= v_schedule.official_scheduled_at
            then 'assigned'::ticket_inventory_status
          else 'available'::ticket_inventory_status
        end as inventory_status_at_draw,
        case
          when t.assigned_at is not null
               and t.assigned_at <= v_schedule.official_scheduled_at
            then t.assigned_at
          else null
        end as assigned_at,
        t.created_at as ticket_created_at
      from hits h
      join tickets t on t.id = h.ticket_id
      where t.created_at <= v_schedule.official_scheduled_at
        and (t.cancelled_at is null or t.cancelled_at > v_schedule.official_scheduled_at)
        and t.inventory_status not in ('draft', 'pending_approval')
        and (
          (t.approved_at is null and t.inventory_status in ('available', 'assigned'))
          or (t.approved_at is not null and t.approved_at <= v_schedule.official_scheduled_at)
          or (t.assigned_at is not null and t.assigned_at <= v_schedule.official_scheduled_at)
        )
    ),
    -- LAS CUATRO CIFRAS MANDAN SOBRE LAS TRES, POR CLIENTE (BR-J07, D-203).
    -- Quien reclama es el cliente FOTOGRAFIADO dentro de su rifa: si tiene al
    -- menos una coincidencia de cuatro cifras en este resultado, pierde TODAS
    -- las de tres —de otras boletas y del otro numero—. Una boleta sin cliente
    -- en la fotografia es su propia unidad: no se mezcla con ninguna otra. El
    -- valor, la categoria, el nombre y el orden no deciden nada.
    resolved as (
      select c.*
        from (
          select c.*,
                 bool_or(c.digits = 'four') over (
                   partition by c.raffle_id, c.client_id,
                                case when c.client_id is null then c.ticket_id end
                 ) as claimant_has_four
            from candidates c
        ) c
       where c.digits = 'four' or not c.claimant_has_four
    ),
    -- Solo se fotografia lo que conserva al menos un premio: una coincidencia de
    -- tres cifras descartada por la prioridad no es una coincidencia.
    inserted as (
      insert into lottery_ticket_matches (
        result_id, ticket_id, organization_id, raffle_id, seller_id, client_id,
        match_field, matched_number, assignment_status,
        inventory_status_at_draw, assigned_at, ticket_created_at
      )
      select distinct on (r.ticket_id, r.match_field)
        p_result_id, r.ticket_id, r.organization_id, r.raffle_id, r.seller_id,
        r.client_id, r.match_field, r.matched_number, r.assignment_status,
        r.inventory_status_at_draw, r.assigned_at, r.ticket_created_at
        from resolved r
       order by r.ticket_id, r.match_field
      on conflict on constraint lottery_ticket_matches_result_ticket_field_key
        do nothing
      returning id, ticket_id, match_field
    ),
    -- Las fotografias nuevas y las que ya existian de un intento anterior: un
    -- reintento completa lo que falte y no duplica nada.
    snapshots as (
      select i.id, i.ticket_id, i.match_field
        from inserted i
      union all
      select m.id, m.ticket_id, m.match_field
        from lottery_ticket_matches m
       where m.result_id = p_result_id
         and m.raffle_id = any (v_raffle_ids)
    ),
    linked as (
      insert into lottery_ticket_match_prizes (
        organization_id, raffle_id, result_id, match_id, match_field,
        prize_id, prize_version_id
      )
      select r.organization_id, r.raffle_id, p_result_id, s.id, r.match_field,
             r.prize_id, r.version_id
        from resolved r
        join snapshots s
          on s.ticket_id = r.ticket_id
         and s.match_field = r.match_field
      on conflict on constraint lottery_ticket_match_prizes_match_prize_key
        do nothing
      returning 1
    )
    select (select count(*) from inserted), (select count(*) from linked)
      into v_cfg_inserted, v_links;
  end if;

  return jsonb_build_object(
    'result_id', p_result_id,
    'inserted', v_inserted + v_cfg_inserted,
    'prize_links', v_links
  );
end;
$$;

comment on function match_lottery_result(uuid) is
  'Busca coincidencias de un resultado confirmado y guarda la fotografia. Rifas heredadas: comparador fijo (D-142). Rifas configurables: premios con la version aplicable al corte efectivo —la menor entre la hora original y la oficial, raffle_prize_draw_cutoff— y prioridad de cuatro cifras por cliente, con sus enlaces (D-203). Idempotente y atomico. No notifica.';

-- =============================================================================
-- 5. Las piezas que NO cambian, con su descripcion al dia
--
-- Reciben el corte ya calculado. Solo se reescribe su comentario, para que nadie
-- lea en el catalogo que el corte es la hora original.
-- =============================================================================

comment on function raffle_prize_versions_at(uuid[], timestamptz) is
  'BR-J09: la version aplicable de cada premio en un corte: la ultima publicada ESTRICTAMENTE antes. El corte de un sorteo sale de raffle_prize_draw_cutoff. Interna.';

comment on function raffle_prize_applicable_version(uuid, timestamptz) is
  'BR-J09: la version que aplica a un premio en un corte. Delega en raffle_prize_versions_at (0061); el corte de un sorteo sale de raffle_prize_draw_cutoff (0062).';

comment on function raffle_prize_draw_prizes(uuid[], date, lottery_code, timestamptz) is
  'D-203: los premios que juegan un sorteo en unas rifas: version aplicable al corte recibido —el efectivo, raffle_prize_draw_cutoff—, vigente, y calendario y loteria que incluyen el sorteo. Interna.';

comment on column raffle_prize_versions.published_at is
  'BR-J09: una version aplica a un sorteo si es la ultima publicada ESTRICTAMENTE antes de su corte efectivo (raffle_prize_draw_cutoff): la menor entre la hora original anunciada y la oficial.';

comment on column lottery_ticket_match_prizes.prize_version_id is
  'BR-J09: la version aplicable al corte efectivo del sorteo (raffle_prize_draw_cutoff), la que se uso. No cambia si despues se publica otra ni si cambia la programacion.';

-- =============================================================================
-- 6. Privilegios
--
-- `create or replace` conserva los privilegios de las funciones que ya
-- existian; se vuelven a escribir para que esta migracion diga, sola, quien
-- ejecuta que (I-078, I-111). La funcion nueva es interna.
-- =============================================================================

revoke execute on function raffle_prize_draw_cutoff(lottery_draw_schedules) from public, anon, authenticated;
revoke execute on function raffle_prize_cutoff_problem(uuid[]) from public, anon, authenticated;
revoke execute on function lottery_ticket_match_prizes_check() from public, anon, authenticated;
revoke execute on function match_lottery_result(uuid) from public, anon, authenticated;
grant  execute on function match_lottery_result(uuid) to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA, nunca editar esta, y vuelve a abrir I-125:
-- un sorteo adelantado podria volver a tomar una version publicada despues de
-- jugarse.
--
--   1. Volver a escribir los cuerpos anteriores:
--        * `match_lottery_result` y `lottery_ticket_match_prizes_check`, tal
--          como los deja 0061;
--        * `raffle_prize_cutoff_problem`, tal como la deja 0058.
--   2. Solo entonces, cuando ya nadie la llama:
--        drop function raffle_prize_draw_cutoff(lottery_draw_schedules);
--   3. Los comentarios de las piezas del punto 5, si se quieren como estaban.
--
-- Revertir NO toca datos. Los enlaces guardados con el corte efectivo siguen
-- siendo historia y no se reescriben: la defensa solo comprueba escrituras
-- nuevas, asi que no hay nada que migrar en ningun sentido.
-- =============================================================================
