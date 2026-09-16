-- =============================================================================
-- 0061_configurable_prize_matching.sql
-- Premios configurables por rifa — Entrega 3: el motor de coincidencias
--
-- Referencia normativa: docs/DECISIONS.md D-203 (esta entrega), D-199 (el
-- contrato), D-201 (los premios no se acumulan), D-142 (la fotografia) y D-198
-- (la cartera); docs/BUSINESS_RULES.md BR-J06, BR-J07, BR-J08, BR-J09 y
-- BR-L05..BR-L12; docs/DATA_MODEL.md §4.21; docs/SECURITY.md §4.21.
--
-- QUE HACE
--
-- 1. `match_lottery_result` busca coincidencias con DOS motores dentro de la
--    MISMA transaccion:
--
--      * `legacy`: el comparador fijo de siempre (BR-L06), con la misma
--        consulta de 0036 y un solo filtro nuevo, `prize_mode = 'legacy'`.
--        Boyaca compara el numero semanal; las demas, el diario; cuatro cifras
--        exactas. No crea ningun enlace a premios.
--      * `configurable`: los premios de cada rifa. Para cada rifa que participa
--        (BR-L05, la misma regla) busca los premios que de verdad juegan ESE
--        sorteo —version aplicable al corte original, vigente, con un periodo
--        que incluye el dia y la loteria—, compara el numero de la boleta que
--        dice cada version con cuatro cifras exactas o con las tres ultimas, y
--        aplica la prioridad de cuatro sobre tres POR CLIENTE (D-203).
--
-- 2. `lottery_ticket_match_prizes` guarda la relacion historica entre una
--    fotografia de `lottery_ticket_matches`, el premio y la VERSION que se le
--    aplico. No copia titulo, recompensa ni calendario: ya estan congelados en
--    la version inmutable. No registra que alternativa se eligio ni ningun
--    pago, entrega o reclamacion.
--
-- 3. Tres defensas. Las dos primeras son disparadores y no dependen de que el
--    motor este bien escrito; la tercera es del propio motor:
--
--      * una fotografia de una rifa configurable se guarda JUNTO con su premio,
--        en la misma sentencia, o no se guarda;
--      * un enlace se valida con las definiciones canonicas de 0058 —la version
--        aplicable al corte y la expansion del calendario— y con la prioridad
--        de cuatro sobre tres;
--      * dos premios que juegan el mismo sorteo con la misma firma —BR-J08 lo
--        impide al guardar— hacen FALLAR el motor entero, sin escribir nada y
--        sin elegir uno por importe, orden, nombre o identificador.
--
-- 4. `confirm_lottery_result` cuenta BOLETAS en sus avisos, no filas: desde
--    esta migracion una boleta puede fotografiarse dos veces en un sorteo, una
--    por cada numero. En una rifa heredada eso no pasa, asi que sus cifras no
--    cambian.
--
-- QUE NO HACE
--
--   * No cambia el modo de ninguna rifa: la transicion es la Entrega 4.
--   * No reprocesa resultados, no crea enlaces para fotografias anteriores y
--     no vuelve a calcular nada si despues cambia un premio.
--   * No toca la cartera (D-198) ni la lectura del personal
--     (`admin_lottery_matches`).
--   * No crea pantallas ni textos para el vendedor o el cliente.
--
-- SOBRE LAS TILDES. Las frases NUEVAS que puede leer una persona van
-- acentuadas; los comentarios siguen sin tildes, y los mensajes que ya existian
-- en `match_lottery_result` se conservan tal cual (I-030 no se toca aqui).
-- =============================================================================

-- =============================================================================
-- 1. La clave que permite atar un enlace a su fotografia
--
-- `id` ya es unico: esta clave no restringe nada nuevo, pero es la que permite
-- que el enlace referencie la fotografia CON su resultado, su organizacion, su
-- rifa y su numero. Asi la base impide un enlace cruzado entre organizaciones,
-- rifas, sorteos o numeros de la boleta, venga la escritura de donde venga.
-- =============================================================================

alter table lottery_ticket_matches
  add constraint lottery_ticket_matches_prize_link_key
  unique (id, result_id, organization_id, raffle_id, match_field);

-- =============================================================================
-- 2. lottery_ticket_match_prizes — la relacion historica
-- =============================================================================

create table lottery_ticket_match_prizes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete restrict,
  raffle_id        uuid not null,
  result_id        uuid not null references lottery_results (id) on delete restrict,
  match_id         uuid not null,
  -- El numero de la boleta con el que jugo. Repite el de la fotografia y el de
  -- la version, y por eso las dos FK lo incluyen: un enlace no puede unir una
  -- fotografia del numero diario con un premio del semanal.
  match_field      lottery_match_field not null,
  prize_id         uuid not null,
  -- La version HISTORICA que se aplico, nunca la vigente de hoy (BR-J09).
  prize_version_id uuid not null,
  created_at       timestamptz not null default now(),

  -- Idempotencia: una fotografia se relaciona como mucho una vez con cada
  -- premio. Un reintento inserta con ON CONFLICT DO NOTHING.
  constraint lottery_ticket_match_prizes_match_prize_key
    unique (match_id, prize_id),

  constraint lottery_ticket_match_prizes_match_fk
    foreign key (match_id, result_id, organization_id, raffle_id, match_field)
    references lottery_ticket_matches (id, result_id, organization_id, raffle_id, match_field)
    on delete restrict,
  constraint lottery_ticket_match_prizes_prize_fk
    foreign key (prize_id, raffle_id, organization_id)
    references raffle_prizes (id, raffle_id, organization_id)
    on delete restrict,
  constraint lottery_ticket_match_prizes_version_fk
    foreign key (prize_version_id, prize_id)
    references raffle_prize_versions (id, prize_id)
    on delete restrict
);

comment on table lottery_ticket_match_prizes is
  'D-203: con que premio y con que VERSION historica coincidio una fotografia de una rifa configurable. Inmutable e idempotente. Sin recompensa, calendario ni alternativa elegida.';
comment on column lottery_ticket_match_prizes.prize_version_id is
  'BR-J09: la version aplicable al corte original del sorteo, la que se uso. No cambia si despues se publica otra.';
comment on column lottery_ticket_match_prizes.match_field is
  'Numero de la boleta con el que jugo el premio. Atado por FK a la fotografia; el disparador de comprobacion lo compara con la version.';

-- Ni la service role reescribe un enlace, igual que la fotografia (BR-L11).
create function lottery_ticket_match_prizes_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Los premios de una coincidencia no se modifican ni se borran.';
end;
$$;

create trigger lottery_ticket_match_prizes_immutable
  before update or delete on lottery_ticket_match_prizes
  for each row execute function lottery_ticket_match_prizes_immutable();

comment on function lottery_ticket_match_prizes_immutable() is
  'D-203: los enlaces a premios son historia, como la fotografia: ni UPDATE ni DELETE, tampoco con service_role.';

-- =============================================================================
-- 3. Piezas internas del motor configurable
-- =============================================================================

-- La version que aplica a VARIOS premios en un corte, de una vez (BR-J09): la
-- ULTIMA publicada antes del corte. Si esa version esta archivada, el premio no
-- juega; eso lo decide quien la usa. Es la forma de conjunto de
-- `raffle_prize_applicable_version`, que desde aqui la llama: una sola
-- definicion para la regla, y el motor no hace una consulta por premio.
create function raffle_prize_versions_at(p_prize_ids uuid[], p_cutoff timestamptz)
returns table (prize_id uuid, version_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct on (v.prize_id) v.prize_id, v.id
  from raffle_prize_versions v
  where v.prize_id = any (p_prize_ids)
    and v.published_at < p_cutoff
  order by v.prize_id, v.version_number desc
$$;

comment on function raffle_prize_versions_at(uuid[], timestamptz) is
  'BR-J09: la version aplicable de cada premio en un corte: la ultima publicada antes. Interna.';

create or replace function raffle_prize_applicable_version(p_prize_id uuid, p_cutoff timestamptz)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.version_id from raffle_prize_versions_at(array[p_prize_id], p_cutoff) a
$$;

comment on function raffle_prize_applicable_version(uuid, timestamptz) is
  'BR-J09: la version que aplica a un premio en un corte. Delega en raffle_prize_versions_at (0061): una sola definicion.';

-- Los premios que JUEGAN un sorteo en un conjunto de rifas: la version aplicable
-- al corte, vigente, con un periodo que incluye la fecha de referencia y cuya
-- loteria efectiva —la fija, o la correspondiente al dia— es la del sorteo.
--
-- Se miran TODOS los premios de la rifa, tambien los archivados hoy: lo que
-- decide es la version que aplicaba en el corte, no el estado actual.
--
-- EL CALENDARIO se evalua con un predicado sobre los periodos, no expandiendo
-- fechas: es la misma regla que `raffle_prize_rule_dates` (0058), y el
-- disparador de comprobacion de los enlaces la contrasta con esa expansion en
-- cada escritura, asi que las dos formas no pueden separarse en silencio.
create function raffle_prize_draw_prizes(
  p_raffle_ids     uuid[],
  p_reference_date date,
  p_lottery        lottery_code,
  p_cutoff         timestamptz
)
returns table (
  organization_id uuid,
  raffle_id       uuid,
  prize_id        uuid,
  version_id      uuid,
  number_field    lottery_match_field,
  digits          raffle_prize_digits
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.organization_id, p.raffle_id, p.id, v.id, v.number_field, v.digits
  from raffle_prize_versions_at(
         array(select p2.id from raffle_prizes p2 where p2.raffle_id = any (p_raffle_ids)),
         p_cutoff
       ) a
  join raffle_prizes p on p.id = a.prize_id
  join raffle_prize_versions v on v.id = a.version_id and v.prize_id = p.id
  where v.status = 'active'
    and exists (
      select 1
      from raffle_prize_schedule_rules r
      where r.version_id = v.id
        and p_reference_date between r.start_date and r.end_date
        and extract(isodow from p_reference_date)::smallint = any (r.weekdays)
        and coalesce(
              r.lottery_code,
              lottery_for_weekday(extract(isodow from p_reference_date)::smallint)
            ) = p_lottery
    )
$$;

comment on function raffle_prize_draw_prizes(uuid[], date, lottery_code, timestamptz) is
  'D-203: los premios que juegan un sorteo en unas rifas: version aplicable al corte, vigente, y calendario y loteria que incluyen el sorteo. Interna.';

-- =============================================================================
-- 4. Las defensas
-- =============================================================================

-- Una fotografia de una rifa configurable se guarda JUNTO con su premio.
--
-- Disparador de SENTENCIA con tabla de transicion: una sola consulta por
-- escritura, no una por fila. Se dispara al terminar la sentencia completa —con
-- sus CTE—, y por eso el motor inserta fotografias y enlaces en la misma
-- sentencia. Una rifa heredada no necesita enlaces: sus fotografias pasan.
create function lottery_ticket_matches_prize_links_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_detail text;
begin
  select format('coincidencia %s; rifa %s', m.id, m.raffle_id)
    into v_detail
    from inserted_matches m
    join raffles r on r.id = m.raffle_id
   where r.prize_mode = 'configurable'
     and not exists (
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

create trigger lottery_ticket_matches_prize_links_check
  after insert on lottery_ticket_matches
  referencing new table as inserted_matches
  for each statement execute function lottery_ticket_matches_prize_links_check();

comment on function lottery_ticket_matches_prize_links_check() is
  'D-203: ninguna fotografia de una rifa configurable queda sin su premio al terminar la sentencia que la escribe.';

-- Un enlace dice la verdad, comprobado con las definiciones CANONICAS:
--
--   1. POR VERSION DISTINTA (pocas por sentencia): la rifa usa premios
--      configurables; la version esta vigente; juega con el numero de la
--      fotografia; es la que devuelve `raffle_prize_applicable_version` en el
--      corte original del sorteo; y su calendario —expandido con
--      `raffle_prize_rule_dates`— incluye la fecha y la loteria del sorteo.
--   2. POR RESULTADO: nadie conserva a la vez un premio de cuatro cifras y uno
--      de tres en el mismo resultado y la misma rifa. «Nadie» es el cliente
--      fotografiado o, si la boleta no estaba vendida, la boleta (D-203).
--
-- No comprueba que el motor haya encontrado TODAS las coincidencias: eso lo
-- prueban `tests/db`.
create function lottery_ticket_match_prizes_check()
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
      or raffle_prize_applicable_version(c.prize_id, s.original_scheduled_at)
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

create trigger lottery_ticket_match_prizes_check
  after insert on lottery_ticket_match_prizes
  referencing new table as inserted_links
  for each statement execute function lottery_ticket_match_prizes_check();

comment on function lottery_ticket_match_prizes_check() is
  'D-203: cada enlace nuevo usa la version aplicable al corte, vigente, del mismo numero y con el sorteo en su calendario; y nadie conserva tres cifras teniendo cuatro.';

-- =============================================================================
-- 5. RLS y privilegios de la tabla nueva
--
-- LECTURA: exactamente la de la fotografia padre, porque la politica PREGUNTA a
-- la fotografia —su RLS se aplica dentro de la subconsulta—. Hoy eso es: el
-- vendedor lee los enlaces de SUS fotografias y nadie mas; el personal no lee
-- la tabla de fotografias desde D-198 (guarda el cliente), asi que tampoco sus
-- enlaces. Si un dia cambia la politica de la fotografia, esta la sigue sola.
--
-- ESCRITURA: ninguna sesion y tampoco la service role. Solo el motor, que es
-- SECURITY DEFINER. Los privilegios que no se dan tambien se escriben (I-111).
-- =============================================================================

alter table lottery_ticket_match_prizes enable row level security;
alter table lottery_ticket_match_prizes force  row level security;

create policy lottery_ticket_match_prizes_select on lottery_ticket_match_prizes
for select to authenticated
using (
  organization_id in (select current_org_ids())
  and exists (
    select 1
    from lottery_ticket_matches m
    where m.id = lottery_ticket_match_prizes.match_id
  )
);

revoke all on lottery_ticket_match_prizes from public, anon, authenticated, service_role;

grant select on lottery_ticket_match_prizes to authenticated;
grant select on lottery_ticket_match_prizes to service_role;

-- =============================================================================
-- 6. match_lottery_result — los dos motores en una transaccion
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
    -- El corte es la hora ORIGINAL anunciada (BR-J09). Sin ella no se sabe que
    -- version aplica, y no se supone: se falla sin escribir nada.
    if v_schedule.original_scheduled_at is null then
      raise exception 'No se conoce la hora original anunciada de este sorteo, así que no se puede saber con qué versión de sus premios se juega. No se guardó ninguna coincidencia.'
        using errcode = 'data_exception',
              detail = format('sorteo %s de %s del %s',
                              v_schedule.draw_number, v_schedule.lottery_code,
                              to_char(v_schedule.reference_date, 'DD/MM/YYYY'));
    end if;

    -- El cerrojo de la configuracion de cada rifa, en orden fijo: una
    -- publicacion que ya tiene el cerrojo termina antes de que se decida que
    -- version aplica, y una que llega despues se publica tras el corte.
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
             v_schedule.lottery_code, v_schedule.original_scheduled_at
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
               v_schedule.lottery_code, v_schedule.original_scheduled_at
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
  'Busca coincidencias de un resultado confirmado y guarda la fotografia. Rifas heredadas: comparador fijo (D-142). Rifas configurables: premios con version aplicable al corte original y prioridad de cuatro cifras por cliente, con sus enlaces (D-203). Idempotente y atomico. No notifica.';

-- =============================================================================
-- 7. confirm_lottery_result — los avisos cuentan BOLETAS
--
-- El cuerpo de 0038 con UN cambio: `count(distinct m.ticket_id)` donde decia
-- `count(*)`. Una boleta de una rifa configurable puede fotografiarse dos veces
-- en un sorteo —su numero diario y su numero semanal, cada uno con su premio—, y
-- el aviso tiene que decir «1 boleta», no «2». En una rifa heredada cada boleta
-- tiene como mucho una fotografia por sorteo: las cifras son las mismas.
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
      count(distinct m.ticket_id) filter (where m.assignment_status = 'sold')::int,
      count(distinct m.ticket_id) filter (where m.assignment_status = 'available')::int,
      count(distinct m.ticket_id) filter (where m.assignment_status = 'late_assignment')::int,
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
      count(distinct m.ticket_id) filter (where m.assignment_status = 'sold')::int,
      count(distinct m.ticket_id) filter (where m.assignment_status = 'available')::int,
      count(distinct m.ticket_id) filter (where m.assignment_status = 'late_assignment')::int,
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
  'Confirma un resultado, busca coincidencias y avisa contando boletas, no fotografias (0061). Idempotente. Sin EXECUTE para authenticated (D-145).';

-- =============================================================================
-- 8. Privilegios de las funciones
--
-- `create or replace` conserva los privilegios; se vuelven a escribir para que
-- esta migracion diga, sola, quien ejecuta que (I-078, I-111).
-- =============================================================================

revoke execute on function match_lottery_result(uuid) from public, anon, authenticated;
grant  execute on function match_lottery_result(uuid) to service_role;

revoke execute on function confirm_lottery_result(
  lottery_code, text, text, text, text, text, text, jsonb, date, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function confirm_lottery_result(
  lottery_code, text, text, text, text, text, text, jsonb, date, timestamptz, timestamptz
) to service_role;

revoke execute on function raffle_prize_versions_at(uuid[], timestamptz) from public, anon, authenticated;
revoke execute on function raffle_prize_applicable_version(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function raffle_prize_draw_prizes(uuid[], date, lottery_code, timestamptz) from public, anon, authenticated;
revoke execute on function lottery_ticket_match_prizes_immutable() from public, anon, authenticated;
revoke execute on function lottery_ticket_match_prizes_check() from public, anon, authenticated;
revoke execute on function lottery_ticket_matches_prize_links_check() from public, anon, authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA. Antes, mirar si ya hay enlaces: revertir los
-- pierde, y las fotografias de rifas configurables quedarian sin su premio.
--
--   select count(*) from lottery_ticket_match_prizes;
--
--   drop trigger lottery_ticket_match_prizes_check on lottery_ticket_match_prizes;
--   drop trigger lottery_ticket_matches_prize_links_check on lottery_ticket_matches;
--   drop function lottery_ticket_match_prizes_check();
--   drop function lottery_ticket_matches_prize_links_check();
--   drop table lottery_ticket_match_prizes;
--   drop function lottery_ticket_match_prizes_immutable();
--   drop function raffle_prize_draw_prizes(uuid[], date, lottery_code, timestamptz);
--   -- raffle_prize_applicable_version: volver a escribir su cuerpo de 0058
--   -- ANTES de borrar raffle_prize_versions_at, que ahora usa.
--   drop function raffle_prize_versions_at(uuid[], timestamptz);
--   -- match_lottery_result: el cuerpo de 0036. confirm_lottery_result: el de 0038.
--   alter table lottery_ticket_matches drop constraint lottery_ticket_matches_prize_link_key;
--
-- Revertir no borra fotografias: siguen siendo historia (BR-L11).
-- =============================================================================
