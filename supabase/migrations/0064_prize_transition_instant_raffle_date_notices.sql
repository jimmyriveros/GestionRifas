-- =============================================================================
-- 0064_prize_transition_instant_raffle_date_notices.sql
-- Premios configurables por rifa — correccion de la Entrega 5: el INSTANTE
-- EFECTIVO de la transicion, y el aviso de las fechas de una rifa activa
--
-- Referencia normativa: docs/DECISIONS.md D-206 (esta correccion), D-204 (la
-- transicion) y D-203 (el motor y su corte); docs/BUSINESS_RULES.md BR-J09,
-- BR-J11, BR-J13 y BR-R12; docs/KNOWN_ISSUES.md I-127 e I-129.
--
-- POR QUE
--
-- La 0063 detenia la transicion de una rifa activa mientras quedara en su
-- ventana un sorteo ya jugado sin resultado confirmado: el motor leia el modo
-- de la rifa AL BUSCAR coincidencias, y ese sorteo, confirmado despues, se
-- habria buscado con los premios nuevos. En el proyecto real hay 25 sorteos
-- asi (I-127), del 27/07 al 24/08/2026, y ninguno se va a confirmar sin
-- evidencia oficial. El dueno decidio el 2026-09-16: no dejarlos sin
-- coincidencias para siempre, no inventar resultados, y que conserven el motor
-- de siempre.
--
-- QUE HACE
--
-- 1. `raffle_prize_transitions.effective_at`: el INSTANTE EFECTIVO de una
--    transicion, que es la publicacion de la ULTIMA version inicial de sus
--    premios.
--
-- 2. UNA definicion de la frontera, `raffle_prize_transition_draw_mode`, con el
--    corte canonico `raffle_prize_draw_cutoff` (0062):
--
--      corte <= instante efectivo  ->  `legacy`
--      corte  > instante efectivo  ->  `configurable`
--      corte desconocido           ->  NULL: no se supone
--
--    Es coherente con BR-J09, que publica ESTRICTAMENTE antes del corte: toda
--    version inicial se publico en o antes del instante, asi que un sorteo con
--    corte posterior las tiene todas publicadas antes y le aplican. Un sorteo
--    con corte IGUAL al instante no tendria la ultima, y por eso cae del lado
--    de siempre.
--
--    Y `raffle_prize_draw_mode(rifa, sorteo)`, el motor de UNA rifa en UN
--    sorteo: una heredada, `legacy`; una configurable sin transicion,
--    `configurable` siempre, igual que hoy; una transformada, la frontera.
--
-- 3. `match_lottery_result` decide el motor de cada rifa con esa funcion,
--    DESPUES de tomar el cerrojo de configuracion de TODAS las rifas que
--    juegan el sorteo —tambien las heredadas—: una transicion en curso lo tiene
--    tomado, y el motor espera a que termine para decidir. No completa con un
--    motor un resultado que ya tiene fotografias del otro.
--
-- 4. Las dos defensas de los enlaces usan la misma funcion: una fotografia del
--    lado de siempre no lleva enlace, y un enlace solo existe del lado
--    configurable.
--
-- 5. La transicion YA NO ESPERA a los sorteos jugados sin resultado
--    confirmado: se quedan con el motor de siempre y la respuesta los cuenta.
--    SIGUE esperando a un sorteo de una semana ya empezada cuyo corte no se
--    conoce, porque no se sabe de que lado cae; ahora tambien en borrador.
--    Ninguna ocurrencia de un premio puede tener su corte en o antes del
--    instante efectivo.
--
-- 6. AVISO DE FECHAS (BR-R12): cambiar la fecha de inicio o la de fin de una
--    rifa ACTIVA escribe, en la misma transaccion, UN aviso por membresia
--    activa de la organizacion —menos a quien lo hizo— y UNA fila semantica de
--    bitacora. Guardar las mismas fechas no avisa.
--
-- QUE NO HACE
--
--   * No reprocesa resultados, no reescribe fotografias ni enlaces, y no
--     confirma ni carga ningun resultado. Un sorteo historico que se confirme
--     despues, con evidencia, lo resuelve el motor de siempre y avisa como
--     siempre.
--   * No cambia QUE compara cada rama del motor: la heredada es la consulta de
--     0036 y la configurable la de 0062. Cambia QUE rifas entran en cada una.
--   * No cambia las rifas configurables creadas directamente ni las heredadas
--     que no se transforman.
--   * No cambia la fecha de ninguna rifa ni transforma ninguna.
--
-- SOBRE LAS TILDES. Las frases NUEVAS que puede leer una persona van
-- acentuadas; los comentarios siguen sin tildes. I-030 no se toca aqui.
-- =============================================================================

-- =============================================================================
-- 1. El instante efectivo de cada transicion
-- =============================================================================

alter table raffle_prize_transitions
  add column effective_at timestamptz;

-- Las transiciones que ya existieran toman su definicion: la publicacion de su
-- ultima version inicial. En el proyecto real la tabla nace vacia en el mismo
-- despliegue que esta migracion; en una base local puede haber restos. El
-- disparador que impide modificarlas se aparta SOLO para este relleno.
alter table raffle_prize_transitions disable trigger raffle_prize_transitions_guard;

update raffle_prize_transitions t
   set effective_at = greatest(
         t.transitioned_at,
         coalesce(
           (select max(v.published_at)
              from raffle_prize_versions v
             where v.prize_id = any (t.prize_ids)
               and v.version_number = 1),
           t.transitioned_at
         )
       )
 where t.effective_at is null;

alter table raffle_prize_transitions enable trigger raffle_prize_transitions_guard;

alter table raffle_prize_transitions
  alter column effective_at set not null,
  add constraint raffle_prize_transitions_effective_check
    check (effective_at >= transitioned_at);

comment on column raffle_prize_transitions.effective_at is
  'D-206: instante efectivo de la transicion, la publicacion de la ultima version inicial. Un sorteo con corte efectivo (raffle_prize_draw_cutoff) hasta este instante conserva el motor de siempre; uno posterior usa los premios configurables.';

-- =============================================================================
-- 2. La frontera, en una sola definicion
-- =============================================================================

-- De que lado del instante efectivo cae un sorteo. Recibe la FILA de la
-- programacion, como el corte: nadie elige la columna. Un sorteo sin
-- programacion llega como una fila nula y da NULL, igual que uno sin alguna de
-- sus dos horas.
create function raffle_prize_transition_draw_mode(
  p_effective_at timestamptz,
  p_schedule     lottery_draw_schedules
)
returns raffle_prize_mode
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_effective_at is null or raffle_prize_draw_cutoff(p_schedule) is null
      then null
    when raffle_prize_draw_cutoff(p_schedule) <= p_effective_at
      then 'legacy'::raffle_prize_mode
    else 'configurable'::raffle_prize_mode
  end
$$;

comment on function raffle_prize_transition_draw_mode(timestamptz, lottery_draw_schedules) is
  'D-206: la frontera de una transicion. Corte efectivo hasta el instante (<=): legacy; posterior: configurable; corte desconocido: NULL. Unica definicion. Interna.';

-- El motor con el que UNA rifa juega UN sorteo. Una rifa heredada, el de
-- siempre. Una configurable que nacio asi, el configurable, sea cual sea el
-- corte: exactamente lo que hacia hasta ahora. Una transformada, la frontera.
create function raffle_prize_draw_mode(p_raffle_id uuid, p_schedule lottery_draw_schedules)
returns raffle_prize_mode
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when r.prize_mode = 'legacy' then 'legacy'::raffle_prize_mode
    when t.id is null then 'configurable'::raffle_prize_mode
    else raffle_prize_transition_draw_mode(t.effective_at, p_schedule)
  end
  from raffles r
  left join raffle_prize_transitions t on t.raffle_id = r.id
  where r.id = p_raffle_id
$$;

comment on function raffle_prize_draw_mode(uuid, lottery_draw_schedules) is
  'D-206: el motor de una rifa en un sorteo. Heredada: legacy. Configurable sin transicion: configurable. Transformada: raffle_prize_transition_draw_mode con su instante efectivo (NULL si el corte no se conoce). Lo usan el motor y las dos defensas. Interna.';

-- =============================================================================
-- 3. El motor
--
-- El cuerpo de 0062 con estos cambios, y ninguno mas:
--
--   * antes de escribir, las rifas que juegan el sorteo toman el cerrojo de su
--     configuracion, TODAS y en orden fijo, y despues se decide el motor de
--     cada una con `raffle_prize_draw_mode`;
--   * el corte desconocido se comprueba ahi, con el mismo mensaje y el mismo
--     codigo, y tambien cuando lo necesita una rifa transformada;
--   * una DEFENSA nueva: un resultado con fotografias de una rifa guardadas con
--     el otro motor no se completa;
--   * la rama heredada recibe las rifas de ese lado (`r.id = any
--     (v_legacy_ids)`) en lugar de `r.prize_mode = 'legacy'`, y la configurable
--     las del suyo. Lo que compara cada una no cambia.
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
  v_participants  uuid[];
  v_legacy_ids    uuid[];
  v_raffle_ids    uuid[];
  v_undecided     boolean := false;
  v_raffle_id     uuid;
  v_mixed_raffle  uuid;
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

  -- El corte EFECTIVO (BR-J09, D-203 Decision 9), de su unica definicion.
  v_cutoff := raffle_prize_draw_cutoff(v_schedule);

  -- ---------------------------------------------------------------------------
  -- 0. Que motor usa cada rifa (D-206).
  --
  -- Las rifas que juegan el sorteo —la MISMA regla de participacion de las dos
  -- ramas (BR-L05)— toman el cerrojo de su configuracion en orden fijo, TODAS,
  -- tambien las heredadas: una transicion en curso ya lo tiene, y el motor
  -- espera a que termine. La decision se lee despues, en una sentencia nueva
  -- que ya ve la transicion confirmada; asi un sorteo no se resuelve con el
  -- sistema de siempre mientras su rifa esta cambiando de sistema.
  -- ---------------------------------------------------------------------------
  select array_agg(r.id order by r.id)
    into v_participants
    from raffles r
   where r.status in ('active', 'closed')
     and r.start_date <= v_schedule.reference_date
     and r.end_date   >= v_schedule.reference_date;

  if v_participants is not null then
    foreach v_raffle_id in array v_participants loop
      perform raffle_prize_lock(v_raffle_id);
    end loop;

    select array_agg(d.raffle_id order by d.raffle_id) filter (where d.mode = 'legacy'),
           array_agg(d.raffle_id order by d.raffle_id) filter (where d.mode = 'configurable'),
           coalesce(bool_or(d.mode is null), false)
      into v_legacy_ids, v_raffle_ids, v_undecided
      from (
        select r.id as raffle_id, raffle_prize_draw_mode(r.id, v_schedule) as mode
          from raffles r
         where r.id = any (v_participants)
      ) d;
  end if;

  -- Sin corte no se sabe que version aplica, ni de que lado de su transicion
  -- cae el sorteo para una rifa transformada. La oficial ya se exigio arriba,
  -- asi que aqui solo puede faltar la original. No se supone: se falla sin
  -- escribir nada. Una rifa que solo usa el motor de siempre no lo necesita.
  if v_cutoff is null and (v_raffle_ids is not null or v_undecided) then
    raise exception 'No se conoce la hora original anunciada de este sorteo, así que no se puede saber con qué versión de sus premios se juega. No se guardó ninguna coincidencia.'
      using errcode = 'data_exception',
            detail = format('sorteo %s de %s del %s',
                            v_schedule.draw_number, v_schedule.lottery_code,
                            to_char(v_schedule.reference_date, 'DD/MM/YYYY'));
  end if;

  -- DEFENSA (D-206): un resultado ya procesado no se completa con el OTRO motor.
  -- Del lado de siempre ninguna fotografia lleva enlace, y del configurable
  -- todas lo llevan. Solo puede fallar si el corte de un sorteo cruzo el
  -- instante efectivo de una transicion DESPUES de guardar sus coincidencias.
  select m.raffle_id
    into v_mixed_raffle
    from lottery_ticket_matches m
   where m.result_id = p_result_id
     and (
       (m.raffle_id = any (v_legacy_ids)
        and exists (select 1 from lottery_ticket_match_prizes l where l.match_id = m.id))
       or
       (m.raffle_id = any (v_raffle_ids)
        and not exists (select 1 from lottery_ticket_match_prizes l where l.match_id = m.id))
     )
   order by m.raffle_id
   limit 1;

  if v_mixed_raffle is not null then
    raise exception 'Este resultado ya tiene coincidencias de una rifa guardadas con el otro sistema de premios, y no se completan mezclando los dos. No se guardó ninguna coincidencia nueva.'
      using errcode = 'check_violation',
            detail = format('resultado %s; rifa %s; sorteo %s de %s del %s',
                            p_result_id, v_mixed_raffle,
                            v_schedule.draw_number, v_schedule.lottery_code,
                            to_char(v_schedule.reference_date, 'DD/MM/YYYY')),
            hint = 'El corte del sorteo cruzó el instante efectivo de la transición de esa rifa después de guardarlas: revisa la programación oficial del sorteo antes de volver a confirmar el resultado.';
  end if;

  -- ---------------------------------------------------------------------------
  -- A. El motor de siempre: la consulta de 0036 sin tocar, con las rifas de
  --    su lado —las heredadas y, de las transformadas, los sorteos con corte
  --    hasta su instante efectivo—.
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
  where r.id = any (v_legacy_ids)
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
  -- B. Premios configurables: las rifas de su lado.
  --
  -- Participan con la MISMA regla que las heredadas (BR-L05) y cada boleta es
  -- elegible con los MISMOS filtros (BR-L09, BR-L10): no hay una segunda
  -- definicion de que rifa o que boleta juega un sorteo, y las pruebas lo
  -- comprueban lado a lado. Sus cerrojos ya se tomaron arriba.
  -- ---------------------------------------------------------------------------
  if v_raffle_ids is not null then
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
  'Busca coincidencias de un resultado confirmado y guarda la fotografia. El motor de cada rifa lo decide raffle_prize_draw_mode con los cerrojos de TODAS las rifas del sorteo tomados (D-206): el de siempre compara con el numero fijo (D-142); el configurable usa la version aplicable al corte efectivo y la prioridad de cuatro cifras por cliente, con sus enlaces (D-203). No mezcla motores en un resultado. Idempotente y atomico. No notifica.';

-- =============================================================================
-- 4. Las defensas, con la misma frontera
-- =============================================================================

-- Una fotografia del lado configurable se guarda JUNTO con su premio. El cuerpo
-- de 0061 con una sola diferencia: el lado lo decide `raffle_prize_draw_mode`
-- por resultado y rifa, no el modo de la rifa. Un corte desconocido en una rifa
-- transformada EXIGE enlace, y por eso ahi no entra ninguna fotografia.
--
-- Las dos CTE van MATERIALIZADAS a proposito: sin eso PostgreSQL las integra en
-- la consulta y puede evaluar la frontera UNA VEZ POR FOTOGRAFIA —con 5.000
-- boletas, mas de cien llamadas en un sorteo—. Asi se evalua una vez por par
-- resultado-rifa (M10-01 lo vigila).
create or replace function lottery_ticket_matches_prize_links_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_detail text;
begin
  with pairs as materialized (
    select distinct m.result_id, m.raffle_id
      from inserted_matches m
  ),
  configurable_pairs as materialized (
    select p.result_id, p.raffle_id
      from pairs p
      join lottery_results lr on lr.id = p.result_id
      join lottery_draw_schedules s on s.id = lr.schedule_id
     where raffle_prize_draw_mode(p.raffle_id, s) is distinct from 'legacy'
  )
  select format('coincidencia %s; rifa %s', m.id, m.raffle_id)
    into v_detail
    from inserted_matches m
    join configurable_pairs c
      on c.result_id = m.result_id
     and c.raffle_id = m.raffle_id
   where not exists (
     select 1 from lottery_ticket_match_prizes l where l.match_id = m.id
   )
   limit 1;

  if v_detail is not null then
    raise exception 'Una coincidencia de una rifa con premios configurables se guarda junto con el premio con el que coincidió, en la misma operación.'
      using errcode = 'check_violation', detail = v_detail;
  end if;

  return null;
end;
$$;

comment on function lottery_ticket_matches_prize_links_check() is
  'D-203, D-206: ninguna fotografia del lado configurable de su rifa (raffle_prize_draw_mode) queda sin su premio al terminar la sentencia que la escribe. Las del lado de siempre no llevan enlace.';

-- Un enlace dice la verdad. El cuerpo de 0062 con una sola condicion cambiada:
-- donde exigia `r.prize_mode = 'configurable'` exige que ESE sorteo caiga del
-- lado configurable de la rifa. Un sorteo historico de una rifa transformada
-- no admite ningun enlace.
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
    join raffle_prize_versions v on v.id = c.prize_version_id
   where raffle_prize_draw_mode(c.raffle_id, s) is distinct from 'configurable'
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
  'D-203, D-206: cada enlace nuevo es de un sorteo del lado configurable de su rifa (raffle_prize_draw_mode), usa la version aplicable al corte efectivo, vigente, del mismo numero y con el sorteo en su calendario; y nadie conserva tres cifras teniendo cuatro.';

-- =============================================================================
-- 5. Las comprobaciones de la transicion
-- =============================================================================

-- La primera ocurrencia de una version que, en un instante, ya cae del lado de
-- siempre: su corte efectivo no es posterior al instante. Con la publicacion
-- de la version es la regla de 0063 (BR-J09); con el instante efectivo, la de
-- esta migracion. Una sola frontera para las dos.
create function raffle_prize_transition_played_occurrence(p_version_id uuid, p_instant timestamptz)
returns table (reference_date date, lottery_code lottery_code)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.reference_date, e.lottery_code
  from raffle_prize_rule_dates(p_version_id) e
  join lottery_draw_schedules s
    on s.lottery_code = e.lottery_code
   and s.reference_date = e.reference_date
  where raffle_prize_transition_draw_mode(p_instant, s) = 'legacy'
  order by e.reference_date
  limit 1
$$;

comment on function raffle_prize_transition_played_occurrence(uuid, timestamptz) is
  'D-204, D-206: la primera fecha de una version cuyo corte efectivo no es posterior al instante (raffle_prize_transition_draw_mode = legacy). Interna.';

-- Los sorteos de la ventana de una rifa, mirados desde un instante: de que
-- lado caen, si tienen resultado confirmado y si su semana ya empezo. Un sorteo
-- CANCELADO no va a tener resultado y no aparece. Recibe el instante para poder
-- probar la clasificacion sin depender del reloj.
--
-- Costo: un dia por fila de la ventana, con dos busquedas por indice unico. No
-- mira boletas.
create function raffle_prize_transition_window_draws(p_raffle raffles, p_instant timestamptz)
returns table (
  reference_date date,
  lottery_code   lottery_code,
  draw_number    text,
  mode           raffle_prize_mode,
  confirmed      boolean,
  week_started   boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with days as (
    select g.d::date as reference_date,
           lottery_for_weekday(extract(isodow from g.d)::smallint) as lottery_code
    from generate_series(p_raffle.start_date::timestamp, p_raffle.end_date::timestamp, interval '1 day') as g(d)
    where extract(isodow from g.d) <> 7
  )
  select d.reference_date,
         d.lottery_code,
         s.draw_number,
         raffle_prize_transition_draw_mode(p_instant, s),
         exists (
           select 1 from lottery_results lr
           where lr.schedule_id = s.id
             and lr.validation_status = 'confirmed'
         ),
         d.reference_date - (extract(isodow from d.reference_date::timestamp)::int - 1)
           <= (p_instant at time zone 'America/Bogota')::date
  from days d
  left join lottery_draw_schedules s
    on s.lottery_code = d.lottery_code
   and s.reference_date = d.reference_date
  where s.id is null or s.schedule_status <> 'cancelled'
  order by d.reference_date
$$;

comment on function raffle_prize_transition_window_draws(raffles, timestamptz) is
  'D-206: los sorteos no cancelados de la ventana de una rifa en un instante: su lado de la frontera (NULL si el corte no se conoce), si tienen resultado confirmado y si su semana ya empezo. Interna.';

-- Lo que IMPIDE la transicion: un sorteo de una semana ya empezada cuyo corte
-- no se conoce. No se sabe si ya se jugo, y por tanto de que lado cae. Vale
-- para una rifa activa y para un borrador, que tambien puede activarse despues.
-- Un sorteo ya jugado SIN resultado confirmado ya no la impide (D-206): se
-- queda con el motor de siempre.
create function raffle_prize_transition_check_window(p_raffle raffles, p_instant timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_count   integer;
  v_list    text;
  v_date    date;
  v_lottery lottery_code;
begin
  select count(*)::integer,
         string_agg(
           format('%s del %s (hora oficial desconocida)',
                  raffle_prize_lottery_label(w.lottery_code),
                  to_char(w.reference_date, 'DD/MM/YYYY')),
           '; ' order by w.reference_date),
         (array_agg(w.reference_date order by w.reference_date))[1],
         (array_agg(w.lottery_code order by w.reference_date))[1]
    into v_count, v_list, v_date, v_lottery
  from raffle_prize_transition_window_draws(p_raffle, p_instant) w
  where w.mode is null
    and w.week_started;

  if v_count = 1 then
    raise exception 'Todavía no conocemos la hora oficial del sorteo de % del %, así que no sabemos si ya se jugó. Vuelve a intentarlo cuando la programación oficial la publique.',
      raffle_prize_lottery_label(v_lottery),
      to_char(v_date, 'DD/MM/YYYY')
      using errcode = 'check_violation',
            detail = format('Sorteo pendiente: %s', v_list);
  end if;

  if v_count > 1 then
    raise exception 'Todavía no conocemos la hora oficial de % sorteos de la rifa, así que no sabemos si ya se jugaron. El primero es el de % del %. Vuelve a intentarlo cuando la programación oficial las publique.',
      v_count,
      raffle_prize_lottery_label(v_lottery),
      to_char(v_date, 'DD/MM/YYYY')
      using errcode = 'check_violation',
            detail = format('%s sorteos pendientes: %s', v_count, v_list);
  end if;
end;
$$;

comment on function raffle_prize_transition_check_window(raffles, timestamptz) is
  'D-204, D-206: rechaza la transicion si un sorteo no cancelado de una semana ya empezada no tiene corte conocido. Los jugados sin resultado confirmado no la detienen. Interna.';

-- Los sorteos que se quedan con el motor de siempre, en cifras y con los que
-- todavia no tienen resultado confirmado enumerados. Nada de la cartera.
create function raffle_prize_transition_legacy_summary(p_raffle raffles, p_instant timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total',       count(*),
    'confirmed',   count(*) filter (where w.confirmed),
    'unconfirmed', count(*) filter (where not w.confirmed),
    'first_date',  min(w.reference_date),
    'last_date',   max(w.reference_date),
    'unconfirmed_draws', coalesce(
      jsonb_agg(jsonb_build_object(
        'reference_date', w.reference_date,
        'lottery_code',   w.lottery_code,
        'draw_number',    w.draw_number
      ) order by w.reference_date) filter (where not w.confirmed),
      '[]'::jsonb
    )
  )
  from raffle_prize_transition_window_draws(p_raffle, p_instant) w
  where w.mode = 'legacy'
$$;

comment on function raffle_prize_transition_legacy_summary(raffles, timestamptz) is
  'D-206: cuantos sorteos de la ventana de una rifa conservan el motor de siempre en un instante, cuantos sin resultado confirmado y cuales. Interna.';

-- =============================================================================
-- 6. La transicion
--
-- El cuerpo de 0063 con estos cambios, y ninguno mas:
--
--   * la espera por los sorteos pendientes se sustituye por
--     `raffle_prize_transition_check_window`: solo el corte desconocido en una
--     semana ya empezada la detiene, en activa y en borrador;
--   * la ocurrencia ya jugada se mide con la funcion de dos argumentos, con la
--     publicacion de cada version;
--   * despues de escribir los premios se fija el INSTANTE EFECTIVO —la
--     publicacion de la ultima version inicial— y se vuelve a comprobar todo
--     contra el: ninguna ocurrencia con corte hasta el instante, y ningun corte
--     desconocido;
--   * la fila de transicion guarda el instante, y la bitacora y la respuesta lo
--     devuelven junto con los sorteos que conservan el motor de siempre.
-- =============================================================================

create or replace function raffle_prize_transition_apply(
  p_organization_id     uuid,
  p_raffle_id           uuid,
  p_expected_name       text,
  p_expected_status     raffle_status,
  p_expected_start_date date,
  p_expected_end_date   date,
  p_prizes              jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raffle        raffles%rowtype;
  v_existing      raffle_prize_transitions%rowtype;
  v_config        jsonb;
  v_hash          text;
  v_item          jsonb;
  v_position      integer;
  v_prize_id      uuid;
  v_version_id    uuid;
  v_version       raffle_prize_versions%rowtype;
  v_problem       text;
  v_played        record;
  v_prize_ids     uuid[] := array[]::uuid[];
  v_version_ids   uuid[] := array[]::uuid[];
  v_transition_id uuid := gen_random_uuid();
  v_effective_at  timestamptz;
  v_legacy        jsonb;
  v_prizes        jsonb;
  v_notified      integer := 0;
begin
  if p_organization_id is null or p_raffle_id is null then
    raise exception 'Indica la organización y la rifa.' using errcode = 'check_violation';
  end if;

  -- CERROJOS, en el mismo orden que `raffles_guard_prize_config`: primero la
  -- fila de la rifa —nadie cambia su estado ni sus fechas mientras tanto— y
  -- despues el de su configuracion de premios, que esperan las RPC y el motor.
  select * into v_raffle
  from raffles r
  where r.id = p_raffle_id
    and r.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'La rifa no existe en la organización indicada.'
      using errcode = 'no_data_found';
  end if;

  perform raffle_prize_lock(v_raffle.id);

  -- LO ESPERADO. La rifa se elige por su identificador, y su nombre, su estado y
  -- sus fechas tienen que ser los que se dijeron: un identificador pegado mal no
  -- convierte otra rifa.
  if v_raffle.name is distinct from p_expected_name then
    raise exception 'La rifa con ese identificador se llama «%», no «%». Revisa el identificador.',
      v_raffle.name, coalesce(p_expected_name, '')
      using errcode = 'check_violation';
  end if;

  if v_raffle.status is distinct from p_expected_status then
    raise exception 'La rifa está % y se esperaba que estuviera %.',
      raffle_prize_raffle_status_phrase(v_raffle.status),
      coalesce(raffle_prize_raffle_status_phrase(p_expected_status), 'en otro estado')
      using errcode = 'check_violation';
  end if;

  if v_raffle.start_date is distinct from p_expected_start_date
     or v_raffle.end_date is distinct from p_expected_end_date then
    raise exception 'Las fechas de la rifa son del % al %, y se esperaban del % al %.',
      to_char(v_raffle.start_date, 'DD/MM/YYYY'), to_char(v_raffle.end_date, 'DD/MM/YYYY'),
      coalesce(to_char(p_expected_start_date, 'DD/MM/YYYY'), '—'),
      coalesce(to_char(p_expected_end_date, 'DD/MM/YYYY'), '—')
      using errcode = 'check_violation';
  end if;

  if v_raffle.status not in ('draft', 'active') then
    raise exception 'Una rifa cerrada o anulada no cambia de sistema de premios.'
      using errcode = 'check_violation';
  end if;

  -- EL ESTADO DE LA RIFA, antes que la configuracion: un estado que no es el de
  -- partida se dice como tal, no como un error de fechas de un premio.
  select * into v_existing
  from raffle_prize_transitions t
  where t.raffle_id = v_raffle.id;

  if found then
    -- Una transicion registrada con la rifa todavia en el sistema de siempre no
    -- la escribe esta funcion —todo va en una transaccion—: solo una escritura
    -- a mano. Es un estado PARCIAL y no se completa a ciegas.
    if v_raffle.prize_mode = 'legacy' then
      raise exception 'Esta rifa tiene una transición registrada, pero sigue con el sistema de premios de siempre. Revisa cómo llegó a ese estado antes de intentarlo de nuevo.'
        using errcode = 'check_violation';
    end if;
  else
    if v_raffle.prize_mode <> 'legacy' then
      raise exception 'Esta rifa ya usa premios configurables, así que no necesita la transición.'
        using errcode = 'check_violation';
    end if;

    if exists (select 1 from raffle_prizes p where p.raffle_id = v_raffle.id) then
      raise exception 'Esta rifa todavía usa el sistema de premios de siempre, pero ya tiene premios guardados. Revisa cómo llegaron antes de intentar la transición.'
        using errcode = 'check_violation';
    end if;
  end if;

  v_config := raffle_prize_transition_configuration(v_raffle, p_prizes);
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'organization_id', v_raffle.organization_id,
    'raffle_id',       v_raffle.id,
    'prizes',          v_config
  )::text, 'UTF8')), 'hex');

  -- UN SEGUNDO INTENTO. Si es la misma configuracion, la transicion ya esta
  -- hecha y no se escribe nada: ni premios, ni aviso, ni bitacora. Si es otra,
  -- se rechaza: esta puerta no sirve para cambiar premios despues.
  if v_existing.id is not null then
    if v_existing.configuration_hash = v_hash then
      return jsonb_build_object(
        'already_applied',    true,
        'transition_id',      v_existing.id,
        'organization_id',    v_existing.organization_id,
        'raffle_id',          v_existing.raffle_id,
        'prize_ids',          to_jsonb(v_existing.prize_ids),
        'configuration_hash', v_existing.configuration_hash,
        'transitioned_at',    v_existing.transitioned_at,
        'effective_at',       v_existing.effective_at,
        'legacy_draws',       raffle_prize_transition_legacy_summary(v_raffle, v_existing.effective_at),
        'notified',           0
      );
    end if;

    raise exception 'Esta rifa ya pasó a premios configurables con otra configuración.'
      using errcode = 'check_violation';
  end if;

  -- LOS SORTEOS SIN CORTE CONOCIDO, antes de escribir nada: con ellos no se
  -- puede saber de que lado de la frontera caen. Se vuelve a mirar con el
  -- instante efectivo, al final.
  perform raffle_prize_transition_check_window(v_raffle, clock_timestamp());

  -- LOS PREMIOS, uno a uno y en su orden. Cada version se compara con los
  -- premios anteriores (BR-J08 es simetrico, asi que cada pareja se mira una
  -- vez) y con la programacion oficial.
  for v_item, v_position in
    select e.value, e.ordinality::integer
    from jsonb_array_elements(v_config) with ordinality as e(value, ordinality)
  loop
    v_prize_id := gen_random_uuid();
    v_version_id := gen_random_uuid();

    v_version := raffle_prize_insert_version(
      v_raffle.organization_id, v_raffle.id, v_prize_id, v_version_id, 1, null, 'active',
      v_item ->> 'title',
      (v_item ->> 'category')::raffle_prize_category,
      (v_item ->> 'reward_mode')::raffle_prize_reward_mode,
      v_item -> 'reward_options',
      (v_item ->> 'number_field')::lottery_match_field,
      (v_item ->> 'digits')::raffle_prize_digits,
      v_item ->> 'conditions',
      v_item -> 'rules',
      null
    );

    v_problem := raffle_prize_version_problem(v_version_id, v_raffle.start_date, v_raffle.end_date);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;

    select * into v_played
    from raffle_prize_transition_played_occurrence(v_version_id, v_version.published_at);
    if found then
      raise exception 'La hora del sorteo de % del % ya pasó, así que el premio «%» no puede incluirlo. Haz que empiece en el siguiente sorteo.',
        raffle_prize_lottery_label(v_played.lottery_code),
        to_char(v_played.reference_date, 'DD/MM/YYYY'),
        v_version.title
        using errcode = 'check_violation';
    end if;

    v_problem := raffle_prize_cutoff_problem(array[v_version_id]);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;

    insert into raffle_prizes (
      id, organization_id, raffle_id, status, position, current_version_id, created_by
    )
    values (
      v_prize_id, v_raffle.organization_id, v_raffle.id, 'active', v_position, v_version_id, null
    );

    v_prize_ids := v_prize_ids || v_prize_id;
    v_version_ids := v_version_ids || v_version_id;
  end loop;

  -- LAS COMPROBACIONES DIFERIDAS, AHORA: periodos que se solapan dentro de un
  -- premio, recompensa que no cuadra con su forma y la FK del ciclo
  -- premio-version. Sin esto, la vista previa —que se deshace antes del
  -- COMMIT— no las veria nunca. Se devuelven despues a su modo inicial.
  set constraints
    raffle_prize_versions_prize_fk,
    raffle_prize_versions_require_rules,
    raffle_prize_versions_require_reward,
    raffle_prize_schedule_rules_check,
    raffle_prize_reward_options_check
    immediate;
  set constraints
    raffle_prize_versions_prize_fk,
    raffle_prize_versions_require_rules,
    raffle_prize_versions_require_reward,
    raffle_prize_schedule_rules_check,
    raffle_prize_reward_options_check
    deferred;

  -- EL INSTANTE EFECTIVO (D-206): la publicacion de la ULTIMA version inicial.
  -- Desde ahi todos los premios estan publicados, asi que un sorteo con corte
  -- posterior los tiene todos antes de su corte (BR-J09). Todo se vuelve a
  -- comprobar contra el: ninguna ocurrencia puede caer del lado de siempre, y
  -- ningun sorteo de una semana ya empezada puede tener el corte desconocido.
  select max(v.published_at)
    into v_effective_at
  from raffle_prize_versions v
  where v.id = any (v_version_ids);

  for v_version in
    select v.*
    from unnest(v_version_ids) with ordinality as u(id, n)
    join raffle_prize_versions v on v.id = u.id
    order by u.n
  loop
    select * into v_played
    from raffle_prize_transition_played_occurrence(v_version.id, v_effective_at);
    if found then
      raise exception 'La hora del sorteo de % del % ya pasó, así que el premio «%» no puede incluirlo. Haz que empiece en el siguiente sorteo.',
        raffle_prize_lottery_label(v_played.lottery_code),
        to_char(v_played.reference_date, 'DD/MM/YYYY'),
        v_version.title
        using errcode = 'check_violation';
    end if;
  end loop;

  perform raffle_prize_transition_check_window(v_raffle, v_effective_at);

  -- Los sorteos que conservan el motor de siempre: los que ya alcanzaron su
  -- corte en el instante efectivo, con resultado o sin el.
  v_legacy := raffle_prize_transition_legacy_summary(v_raffle, v_effective_at);

  -- LA PUERTA: la fila de transicion, y en la misma transaccion el cambio de
  -- modo. El disparador de `raffles` vuelve a exigir la configuracion completa.
  insert into raffle_prize_transitions (
    id, organization_id, raffle_id, raffle_status, raffle_start_date, raffle_end_date,
    configuration_hash, prize_ids, transitioned_by, effective_at
  )
  values (
    v_transition_id, v_raffle.organization_id, v_raffle.id, v_raffle.status,
    v_raffle.start_date, v_raffle.end_date, v_hash, v_prize_ids, auth.uid(), v_effective_at
  );

  update raffles r
     set prize_mode = 'configurable'
   where r.id = v_raffle.id;

  -- UN AVISO por membresia ACTIVA de la organizacion —Dueno, Administradores y
  -- Vendedores—, solo si la rifa esta activa: un borrador no avisa (BR-J11).
  -- Idempotente por `notifications_raffle_prize_once`, con la transicion como
  -- entidad. Identifica la rifa y el cambio; nada de la cartera.
  if v_raffle.status = 'active' then
    insert into notifications (
      organization_id, recipient_profile_id, actor_profile_id,
      kind, entity_type, entity_id, data
    )
    select
      v_raffle.organization_id,
      m.profile_id,
      null,
      'raffle_prize.changed',
      'raffle_prize_transition',
      v_transition_id,
      jsonb_build_object(
        'raffle_id',   v_raffle.id,
        'raffle_name', v_raffle.name,
        'change',      'transitioned',
        'prize_count', cardinality(v_prize_ids)
      )
    from memberships m
    join profiles pr on pr.id = m.profile_id
    join organizations o on o.id = m.organization_id
    where m.organization_id = v_raffle.organization_id
      and m.role in ('owner', 'admin', 'seller')
      and m.is_active and pr.is_active and o.is_active
    on conflict (recipient_profile_id, entity_id) where kind = 'raffle_prize.changed'
      do nothing;

    get diagnostics v_notified = row_count;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'position',       p.position,
           'prize_id',       p.id,
           'version_id',     v.id,
           'title',          v.title,
           'category',       v.category,
           'reward_mode',    v.reward_mode,
           'reward_options', raffle_prize_reward_json(v.id),
           'number_field',   v.number_field,
           'digits',         v.digits,
           'conditions',     v.conditions,
           'rules',          raffle_prize_rules_json(v.id),
           'starts_on',      w.starts_on,
           'ends_on',        w.ends_on,
           'draws',          (select count(*) from raffle_prize_rule_dates(v.id))
         ) order by p.position), '[]'::jsonb)
    into v_prizes
  from raffle_prizes p
  join raffle_prize_versions v on v.id = p.current_version_id
  cross join lateral raffle_prize_validity(v.id) w
  where p.raffle_id = v_raffle.id;

  -- UNA fila semantica de bitacora. `audit_raffles` escribe ademas, sola, el
  -- `raffle.update` del modo. Ni clientes, ni pagos, ni saldos, ni precios de
  -- venta: premios, fechas, el instante efectivo y los sorteos que conservan el
  -- motor de siempre.
  perform write_audit_log(
    v_raffle.organization_id,
    'raffle.prize_mode_transition',
    'raffle',
    v_raffle.id,
    jsonb_build_object('prize_mode', 'legacy'),
    jsonb_build_object(
      'prize_mode',         'configurable',
      'transition_id',      v_transition_id,
      'status',             v_raffle.status,
      'start_date',         v_raffle.start_date,
      'end_date',           v_raffle.end_date,
      'effective_at',       v_effective_at,
      'legacy_draws',       v_legacy,
      'prize_count',        cardinality(v_prize_ids),
      'prizes',             (
        select jsonb_agg(jsonb_build_object(
                 'prize_id',     e ->> 'prize_id',
                 'version_id',   e ->> 'version_id',
                 'title',        e ->> 'title',
                 'category',     e ->> 'category',
                 'reward_mode',  e ->> 'reward_mode',
                 'number_field', e ->> 'number_field',
                 'digits',       e ->> 'digits',
                 'starts_on',    e ->> 'starts_on',
                 'ends_on',      e ->> 'ends_on'
               ) order by (e ->> 'position')::integer)
        from jsonb_array_elements(v_prizes) e
      ),
      'notified',           v_notified,
      'configuration_hash', v_hash
    )
  );

  return jsonb_build_object(
    'already_applied',    false,
    'transition_id',      v_transition_id,
    'organization_id',    v_raffle.organization_id,
    'raffle_id',          v_raffle.id,
    'raffle',             jsonb_build_object(
      'name',       v_raffle.name,
      'status',     v_raffle.status,
      'start_date', v_raffle.start_date,
      'end_date',   v_raffle.end_date
    ),
    'from_mode',          'legacy',
    'to_mode',            'configurable',
    'effective_at',       v_effective_at,
    'legacy_draws',       v_legacy,
    'prize_ids',          to_jsonb(v_prize_ids),
    'prizes',             v_prizes,
    'notified',           v_notified,
    'configuration_hash', v_hash
  );
end;
$$;

comment on function raffle_prize_transition_apply(uuid, uuid, text, raffle_status, date, date, jsonb) is
  'D-204, D-206: valida y hace la transicion de una rifa, con su instante efectivo, o devuelve la identica que ya existia. Los sorteos con corte hasta ese instante conservan el motor de siempre. Interna: la llama transition_raffle_prize_mode.';

-- LA OPERACION. El cuerpo de 0063 con una sola diferencia en la vista previa:
-- el instante efectivo sale en blanco, igual que los identificadores, porque la
-- transicion no va a existir. Los sorteos que conservarian el motor de siempre
-- se cuentan con el instante de la vista previa.
create or replace function transition_raffle_prize_mode(
  p_organization_id     uuid,
  p_raffle_id           uuid,
  p_expected_name       text,
  p_expected_status     raffle_status,
  p_expected_start_date date,
  p_expected_end_date   date,
  p_prizes              jsonb,
  p_apply               boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  -- Nadie con sesion, aunque alguien concediera EXECUTE por error.
  if auth.uid() is not null then
    raise exception 'La transición del sistema de premios no se hace desde la aplicación.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(p_apply, false) then
    v_result := raffle_prize_transition_apply(
      p_organization_id, p_raffle_id, p_expected_name, p_expected_status,
      p_expected_start_date, p_expected_end_date, p_prizes
    );
    return v_result || jsonb_build_object(
      'applied', not coalesce((v_result ->> 'already_applied')::boolean, false)
    );
  end if;

  -- Un subbloque es un punto de guardado: la excepcion propia lo deshace todo y
  -- las variables conservan lo que se calculo. Cualquier OTRA excepcion sale tal
  -- cual, y la vista previa falla con el mismo mensaje que fallaria aplicar.
  begin
    v_result := raffle_prize_transition_apply(
      p_organization_id, p_raffle_id, p_expected_name, p_expected_status,
      p_expected_start_date, p_expected_end_date, p_prizes
    );
    raise exception 'vista previa de la transición de premios' using errcode = 'RP204';
  exception
    when sqlstate 'RP204' then
      null;
  end;

  if coalesce((v_result ->> 'already_applied')::boolean, false) then
    return v_result || jsonb_build_object('applied', false);
  end if;

  return v_result || jsonb_build_object(
    'applied',       false,
    'transition_id', null,
    'effective_at',  null,
    'prize_ids',     '[]'::jsonb,
    'prizes',        (
      select coalesce(jsonb_agg((e - 'prize_id' - 'version_id') order by (e ->> 'position')::integer), '[]'::jsonb)
      from jsonb_array_elements(v_result -> 'prizes') e
    )
  );
end;
$$;

comment on function transition_raffle_prize_mode(uuid, uuid, text, raffle_status, date, date, jsonb, boolean) is
  'BR-J13, D-204, D-206: transicion de UNA rifa existente de legacy a configurable, atomica, con su instante efectivo. Sin p_apply es una vista previa que no deja nada. Solo service_role.';

-- Las dos piezas de 0063 que ya no llama nadie: la espera por los sorteos
-- pendientes y la ocurrencia jugada de un argumento. Las sustituyen
-- `raffle_prize_transition_check_window` y la version de dos argumentos.
drop function raffle_prize_transition_pending_draws(raffles, timestamptz);
drop function raffle_prize_transition_played_occurrence(uuid);

-- =============================================================================
-- 7. El aviso de las fechas de una rifa activa (BR-R12)
--
-- Un DISPARADOR y no la Server Action, por la misma razon que los avisos de
-- equipo (0023): ocurre en la MISMA transaccion que el cambio de fechas, venga
-- de donde venga —la pantalla de editar la rifa o un proceso con la service
-- role—. Si el cambio se rechaza, no hay aviso; si hay aviso, el cambio quedo.
--
-- IDEMPOTENTE FRENTE A REINTENTOS: repetir el mismo cambio no cambia ninguna
-- fecha, asi que no dispara nada. Cada cambio real es UN evento con su propio
-- identificador, y el indice unico impide dos avisos del mismo evento a la
-- misma persona.
-- =============================================================================

alter table notifications drop constraint notifications_kind_check;

alter table notifications
  add constraint notifications_kind_check
  check (kind in (
    'team.member_added',
    'team.sale',
    'lottery.result',
    'lottery.schedule_change',
    'payment_reminder.due',
    'raffle_prize.changed',
    'raffle.dates_changed'
  ));

comment on constraint notifications_kind_check on notifications is
  'Kinds de equipo (0023), de loteria (0037), de recordatorio de pago (0052), de premios (0058) y de fechas de una rifa (0064). El texto no vive aqui (I-030).';

create unique index notifications_raffle_dates_once
  on notifications (recipient_profile_id, entity_id)
  where kind = 'raffle.dates_changed';

create function raffles_notify_dates_changed()
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
  -- Vendedores—, menos a quien hizo el cambio (BR-J11: nadie se avisa a si
  -- mismo). Sin sesion, un proceso del sistema, lo reciben todas. Identifica la
  -- rifa y sus fechas: nada de clientes, ventas, pagos ni cartera.
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
    and m.profile_id is distinct from v_actor
  on conflict (recipient_profile_id, entity_id) where kind = 'raffle.dates_changed'
    do nothing;

  get diagnostics v_notified = row_count;

  -- UNA fila semantica de bitacora, ademas del `raffle.update` que escribe
  -- `audit_raffles`: cuantos avisos salieron y con que evento.
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
  'BR-R12, D-206: al cambiar la fecha de inicio o de fin de una rifa activa, un aviso por membresia activa (menos quien lo hizo) y una fila semantica de bitacora, en la misma transaccion. Sin cartera.';

-- Solo una rifa que ERA y SIGUE activa, y solo si alguna fecha cambio de
-- verdad: guardar las mismas fechas, un borrador o una rifa que se cierra en la
-- misma sentencia no avisan.
create trigger raffles_notify_dates_changed
  after update of start_date, end_date on raffles
  for each row
  when (
    old.status = 'active'
    and new.status = 'active'
    and (old.start_date is distinct from new.start_date
         or old.end_date is distinct from new.end_date)
  )
  execute function raffles_notify_dates_changed();

-- =============================================================================
-- 8. Privilegios (docs/SECURITY.md §4.5 y §4.22)
--
-- `create or replace` conserva los privilegios de lo que ya existia; se
-- vuelven a escribir para que esta migracion diga, sola, quien ejecuta que
-- (I-078, I-111). Todo lo nuevo es interno: nadie lo ejecuta directamente, ni
-- la service role.
-- =============================================================================

revoke execute on function raffle_prize_transition_draw_mode(timestamptz, lottery_draw_schedules) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_draw_mode(uuid, lottery_draw_schedules) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_played_occurrence(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_window_draws(raffles, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_check_window(raffles, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_legacy_summary(raffles, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_apply(uuid, uuid, text, raffle_status, date, date, jsonb) from public, anon, authenticated, service_role;
revoke execute on function raffles_notify_dates_changed() from public, anon, authenticated, service_role;

revoke execute on function transition_raffle_prize_mode(uuid, uuid, text, raffle_status, date, date, jsonb, boolean) from public, anon, authenticated;
grant  execute on function transition_raffle_prize_mode(uuid, uuid, text, raffle_status, date, date, jsonb, boolean) to service_role;

revoke execute on function match_lottery_result(uuid) from public, anon, authenticated;
grant  execute on function match_lottery_result(uuid) to service_role;

revoke execute on function lottery_ticket_matches_prize_links_check() from public, anon, authenticated;
revoke execute on function lottery_ticket_match_prizes_check() from public, anon, authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA, nunca editar esta. Antes, mirar si ya hay
-- alguna transicion y avisos de fechas:
--
--   select raffle_id, effective_at from raffle_prize_transitions;
--   select count(*) from notifications where kind = 'raffle.dates_changed';
--
-- Revertir VUELVE A ABRIR I-127: sin la frontera, un sorteo historico de una
-- rifa transformada que se confirme despues se buscaria con los premios nuevos.
-- Y no deshace nada ya guardado: fotografias, enlaces, avisos y bitacora son
-- historia.
--
--   1. drop trigger raffles_notify_dates_changed on raffles;
--      drop function raffles_notify_dates_changed();
--      drop index notifications_raffle_dates_once;
--      El CHECK de kinds, sin 'raffle.dates_changed', SOLO si no queda ningun
--      aviso de ese tipo (no se borran avisos entregados sin decidirlo).
--   2. Volver a escribir los cuerpos de 0063 de `raffle_prize_transition_apply`
--      y `transition_raffle_prize_mode`, y crear otra vez
--      `raffle_prize_transition_pending_draws(raffles, timestamptz)` y
--      `raffle_prize_transition_played_occurrence(uuid)`.
--   3. Volver a escribir los cuerpos de 0062 de `match_lottery_result` y
--      `lottery_ticket_match_prizes_check`, y el de 0061 de
--      `lottery_ticket_matches_prize_links_check`.
--   4. Solo entonces, cuando ya nadie las llama:
--        drop function raffle_prize_transition_legacy_summary(raffles, timestamptz);
--        drop function raffle_prize_transition_check_window(raffles, timestamptz);
--        drop function raffle_prize_transition_window_draws(raffles, timestamptz);
--        drop function raffle_prize_transition_played_occurrence(uuid, timestamptz);
--        drop function raffle_prize_draw_mode(uuid, lottery_draw_schedules);
--        drop function raffle_prize_transition_draw_mode(timestamptz, lottery_draw_schedules);
--   5. `effective_at` se puede conservar: sin la frontera nadie la lee. Quitarla
--      exige apartar el disparador de la tabla, igual que al rellenarla.
-- =============================================================================
