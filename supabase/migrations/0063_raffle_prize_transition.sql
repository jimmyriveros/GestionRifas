-- =============================================================================
-- 0063_raffle_prize_transition.sql
-- Premios configurables por rifa — Entrega 4: la TRANSICION de una rifa que ya
-- existe, del sistema de siempre (`legacy`) a premios configurables
--
-- Referencia normativa: docs/DECISIONS.md D-204 (esta entrega), D-199 (el
-- contrato, Decision 8), D-201, D-202 y D-203 (el motor y su corte);
-- docs/BUSINESS_RULES.md BR-J09, BR-J11, BR-J12 y BR-J13;
-- docs/DATA_MODEL.md §4.22; docs/SECURITY.md §4.22.
--
-- QUE HACE
--
-- 1. `transition_raffle_prize_mode` convierte UNA rifa, elegida por su
--    identificador, su organizacion y los valores que se esperan de ella
--    (nombre, estado y fechas). En UNA transaccion: valida, escribe los premios
--    con sus versiones, periodos y alternativas, registra la transicion, cambia
--    el modo, escribe UN aviso por membresia activa y UNA fila semantica de
--    bitacora. Si cualquier cosa falla, no queda nada.
--
--    Sin `p_apply` es una VISTA PREVIA: hace exactamente lo mismo —incluidas
--    las comprobaciones diferidas— dentro de un bloque que se deshace al final,
--    y devuelve lo que habria escrito. Asi la previsualizacion y la ejecucion no
--    pueden separarse: son el mismo codigo.
--
-- 2. `raffle_prize_transitions` guarda la transicion de cada rifa: una por rifa,
--    para siempre, inmutable. Es a la vez la HUELLA de la configuracion aplicada
--    —un segundo intento igual no escribe nada y uno distinto se rechaza— y la
--    PUERTA estrecha del disparador de las rifas.
--
-- 3. `raffles_guard_prize_config` conserva TODO lo de 0060 y abre una sola
--    puerta: una rifa `legacy` en borrador o ACTIVA puede pasar a `configurable`
--    sin estar en borrador si, y solo si, en la MISMA transaccion existe su fila
--    de transicion. Esa fila solo la puede escribir esta migracion: ni las
--    sesiones ni la service role tienen privilegios sobre la tabla. Ninguna
--    sesion cambia el modo, igual que antes, y la service role tampoco puede
--    hacerlo con un UPDATE suelto sobre una rifa activa.
--
-- QUE COMPRUEBA ANTES DE CAMBIAR NADA
--
--   * la rifa existe en la organizacion indicada, con el nombre, el estado y las
--     fechas esperados, en borrador o activa, y sigue en `legacy`;
--   * no tiene premios ni una transicion anterior (o la anterior es identica);
--   * cada premio pasa las MISMAS validaciones de las RPC de 0058/0059: campos,
--     recompensa, periodos dentro de la rifa, loteria fija en su dia, sin
--     conflictos entre ellos (BR-J08) y sin sorteos futuros cancelados;
--   * NINGUNA ocurrencia configurada tiene ya su corte efectivo
--     (`raffle_prize_draw_cutoff`), y ninguna de una semana ya empezada tiene un
--     corte desconocido;
--   * si la rifa esta ACTIVA, ningun sorteo de su ventana ya alcanzo su corte
--     sin resultado confirmado, ni tiene un corte desconocido en una semana ya
--     empezada. El motor lee el modo AL BUSCAR coincidencias (D-203, Decision
--     3): un sorteo jugado con el sistema de siempre y confirmado despues de la
--     transicion se buscaria con los premios nuevos.
--
-- QUE NO HACE
--
--   * No recorre boletas, clientes, pagos ni asignaciones: no los lee ni los
--     escribe. El costo depende de los premios y de los dias de la rifa.
--   * No crea ni modifica fotografias (`lottery_ticket_matches`) ni enlaces
--     (`lottery_ticket_match_prizes`), y no reprocesa ningun resultado.
--   * No cambia el estado ni las fechas de la rifa.
--   * No elige ninguna rifa: no hay ningun UPDATE sobre datos reales aqui. La
--     rifa real se identifica y se convierte en la Entrega 5.
--   * No envia nada fuera de la base: el aviso es de la campana.
--
-- SOBRE LAS TILDES. Las frases NUEVAS que puede leer una persona van
-- acentuadas; los comentarios siguen sin tildes. I-030 no se toca aqui.
-- =============================================================================

-- =============================================================================
-- 1. Auxiliares de texto
--
-- Espejos de `LOTTERY_LABELS` (features/lottery/constants.ts) y de
-- `RAFFLE_STATUS_LABELS` (lib/constants.ts), para que los mensajes digan
-- «Cruz Roja» y «activa» y no el codigo. Una prueba de base los compara.
-- =============================================================================

create function raffle_prize_lottery_label(p_code lottery_code)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_code
    when 'cundinamarca' then 'Cundinamarca'
    when 'cruz_roja'    then 'Cruz Roja'
    when 'meta'         then 'Meta'
    when 'bogota'       then 'Bogotá'
    when 'medellin'     then 'Medellín'
    when 'boyaca'       then 'Boyacá'
  end
$$;

comment on function raffle_prize_lottery_label(lottery_code) is
  'D-204: nombre de una loteria para los mensajes. Espejo de LOTTERY_LABELS. Interna.';

-- Como se dice el estado dentro de una frase: «la rifa esta activa», «esta en
-- borrador».
create function raffle_prize_raffle_status_phrase(p_status raffle_status)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_status
    when 'draft'     then 'en borrador'
    when 'active'    then 'activa'
    when 'closed'    then 'cerrada'
    when 'cancelled' then 'anulada'
  end
$$;

comment on function raffle_prize_raffle_status_phrase(raffle_status) is
  'D-204: el estado de una rifa dentro de una frase. Espejo en minusculas de RAFFLE_STATUS_LABELS. Interna.';

-- =============================================================================
-- 2. raffle_prize_transitions — una transicion por rifa
-- =============================================================================

create table raffle_prize_transitions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations (id) on delete restrict,
  raffle_id          uuid not null,
  from_mode          raffle_prize_mode not null default 'legacy',
  to_mode            raffle_prize_mode not null default 'configurable',
  -- Lo que se comprobo de la rifa. La transicion no lo cambia; se guarda para
  -- poder leer despues contra que se hizo.
  raffle_status      raffle_status not null,
  raffle_start_date  date not null,
  raffle_end_date    date not null,
  -- Huella de la configuracion NORMALIZADA: la misma peticion repetida da la
  -- misma huella y no escribe nada; otra configuracion se rechaza.
  configuration_hash text not null,
  prize_ids          uuid[] not null,
  -- La transaccion que la escribio. Es lo que abre la puerta del disparador de
  -- `raffles` SOLO dentro de esa transaccion: despues, ninguna otra coincide.
  xact_id            xid8 not null default pg_current_xact_id(),
  transitioned_at    timestamptz not null default now(),
  -- NULL = un proceso del sistema; la pantalla lo presenta como «Sistema».
  transitioned_by    uuid references profiles (id) on delete restrict,

  constraint raffle_prize_transitions_raffle_org_fk
    foreign key (raffle_id, organization_id)
    references raffles (id, organization_id) on delete restrict,
  -- Una sola por rifa, para siempre: la puerta no se puede volver a abrir.
  constraint raffle_prize_transitions_raffle_key unique (raffle_id),
  constraint raffle_prize_transitions_modes_check check (
    from_mode = 'legacy' and to_mode = 'configurable'
  ),
  constraint raffle_prize_transitions_status_check check (
    raffle_status in ('draft', 'active')
  ),
  constraint raffle_prize_transitions_dates_check check (raffle_end_date >= raffle_start_date),
  constraint raffle_prize_transitions_hash_check check (configuration_hash ~ '^[0-9a-f]{64}$'),
  constraint raffle_prize_transitions_prizes_check check (
    cardinality(prize_ids) between 1 and 50
    and array_position(prize_ids, null) is null
  )
);

comment on table raffle_prize_transitions is
  'BR-J13, D-204: la transicion de una rifa existente de legacy a configurable. Una por rifa, inmutable, escrita solo por transition_raffle_prize_mode.';
comment on column raffle_prize_transitions.xact_id is
  'D-204: transaccion que la escribio. El disparador de raffles solo deja cambiar el modo de una rifa no borrador dentro de ESA transaccion.';
comment on column raffle_prize_transitions.configuration_hash is
  'D-204: SHA-256 de la configuracion normalizada. Un segundo intento igual no escribe nada; uno distinto se rechaza.';

-- Una transicion no se modifica ni se borra, tampoco con la service role. Y
-- solo nace para una rifa que todavia esta en `legacy`: es el registro de un
-- cambio que todavia no ocurrio dentro de esa transaccion.
create function raffle_prize_transitions_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Una transición de premios no se modifica ni se borra.';
  end if;

  if not exists (
    select 1 from raffles r
    where r.id = new.raffle_id
      and r.organization_id = new.organization_id
      and r.prize_mode = 'legacy'
  ) then
    raise exception 'Solo una rifa con el sistema de premios de siempre puede registrar su transición.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger raffle_prize_transitions_guard
  before insert or update or delete on raffle_prize_transitions
  for each row execute function raffle_prize_transitions_guard();

-- RLS sin politicas y SIN privilegios para nadie: solo las funciones SECURITY
-- DEFINER de esta migracion la leen y la escriben. Los privilegios que no se
-- dan tambien se escriben (I-111): el esquema concede SELECT por defecto.
alter table raffle_prize_transitions enable row level security;
alter table raffle_prize_transitions force  row level security;

revoke all on raffle_prize_transitions from public, anon, authenticated, service_role;

-- =============================================================================
-- 3. La puerta del disparador
-- =============================================================================

-- Si la rifa tiene su fila de transicion escrita en ESTA transaccion. Es la
-- unica forma de que exista: la tabla no concede INSERT a nadie y la fila es
-- unica por rifa, asi que la puerta se abre una sola vez y solo mientras dura la
-- transaccion de `transition_raffle_prize_mode`.
create function raffle_prize_transition_open(p_raffle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from raffle_prize_transitions t
    where t.raffle_id = p_raffle_id
      and t.xact_id = pg_current_xact_id()
  )
$$;

comment on function raffle_prize_transition_open(uuid) is
  'D-204: si la rifa registro su transicion en la transaccion actual. La usa raffles_guard_prize_config. Interna.';

-- El cuerpo de 0060 con UN cambio, en la rama que cambia el modo: la puerta de
-- la transicion. Todo lo demas —la insercion, las fechas y la activacion— es el
-- mismo, linea por linea.
create or replace function raffles_guard_prize_config()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dates_changed boolean := false;
  v_activating    boolean := false;
  v_title         text;
  v_problem       text;
  v_prize         record;
begin
  if tg_op = 'INSERT' then
    if new.prize_mode = 'configurable' then
      -- Nace en borrador SIEMPRE, venga de donde venga: una rifa que se activa
      -- de golpe no ha podido pasar por la validacion de sus premios.
      if new.status <> 'draft' then
        raise exception 'Una rifa con premios configurables nace en borrador y se activa cuando sus premios están listos.'
          using errcode = 'check_violation';
      end if;

      -- Desde una sesion, solo con la capacidad (D-200, D-202). Sin sesion
      -- —un proceso interno con la service role— se permite como antes.
      if auth.uid() is not null
         and not has_org_capability(new.organization_id, 'raffles.prizes.manage') then
        raise exception 'No tienes permiso para crear una rifa con premios configurables.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    return new;
  end if;

  if new.prize_mode is distinct from old.prize_mode then
    if auth.uid() is not null then
      raise exception 'El sistema de premios de una rifa todavía no se cambia desde la aplicación.'
        using errcode = 'insufficient_privilege';
    end if;

    -- LA PUERTA DE LA TRANSICION (D-204). Solo de `legacy` a `configurable`,
    -- solo con la fila de transicion escrita en esta misma transaccion —que
    -- solo escribe `transition_raffle_prize_mode`—, sin tocar a la vez el
    -- estado ni las fechas, y con la configuracion YA completa: al menos un
    -- premio vigente y ninguno con problemas. El resto de caminos sigue
    -- exigiendo el borrador, como en 0058.
    if old.prize_mode = 'legacy'
       and new.prize_mode = 'configurable'
       and raffle_prize_transition_open(new.id) then
      if new.status is distinct from old.status
         or new.start_date is distinct from old.start_date
         or new.end_date is distinct from old.end_date then
        raise exception 'La transición a premios configurables no cambia el estado ni las fechas de la rifa.'
          using errcode = 'check_violation';
      end if;

      if old.status not in ('draft', 'active') then
        raise exception 'Una rifa cerrada o anulada no cambia de sistema de premios.'
          using errcode = 'check_violation';
      end if;

      perform raffle_prize_lock(new.id);

      if not exists (
        select 1 from raffle_prizes p where p.raffle_id = new.id and p.status = 'active'
      ) then
        raise exception 'La rifa necesita al menos un premio para pasar a premios configurables.'
          using errcode = 'check_violation';
      end if;

      for v_prize in
        select p.current_version_id
        from raffle_prizes p
        where p.raffle_id = new.id and p.status = 'active'
        order by p.position
      loop
        v_problem := raffle_prize_version_problem(v_prize.current_version_id, new.start_date, new.end_date);
        if v_problem is not null then
          raise exception '%', v_problem using errcode = 'check_violation';
        end if;
      end loop;

      return new;
    end if;

    if old.status <> 'draft' or new.status <> 'draft' then
      raise exception 'El sistema de premios de una rifa solo se puede cambiar mientras está en borrador.'
        using errcode = 'check_violation';
    end if;
    if new.prize_mode = 'legacy'
       and exists (select 1 from raffle_prizes p where p.raffle_id = new.id) then
      raise exception 'La rifa ya tiene premios configurados y no puede volver al sistema de siempre.'
        using errcode = 'check_violation';
    end if;
  end if;

  v_dates_changed := new.start_date is distinct from old.start_date
                  or new.end_date is distinct from old.end_date;
  v_activating := new.prize_mode = 'configurable'
              and new.status = 'active'
              and old.status is distinct from 'active';

  if not v_dates_changed and not v_activating then
    return new;
  end if;

  perform raffle_prize_lock(new.id);

  if v_dates_changed then
    select v.title into v_title
    from raffle_prizes p
    join raffle_prize_versions v on v.id = p.current_version_id
    join raffle_prize_schedule_rules r on r.version_id = v.id
    where p.raffle_id = new.id
      and p.status = 'active'
      and (r.start_date < new.start_date or r.end_date > new.end_date)
    order by p.position
    limit 1;

    if v_title is not null then
      raise exception 'El premio «%» tiene fechas fuera de las nuevas fechas de la rifa. Cambia primero el calendario del premio.',
        v_title
        using errcode = 'check_violation';
    end if;
  end if;

  if v_activating then
    if not exists (
      select 1 from raffle_prizes p where p.raffle_id = new.id and p.status = 'active'
    ) then
      raise exception 'La rifa necesita al menos un premio para activarse.'
        using errcode = 'check_violation';
    end if;

    for v_prize in
      select p.current_version_id
      from raffle_prizes p
      where p.raffle_id = new.id and p.status = 'active'
      order by p.position
    loop
      v_problem := raffle_prize_version_problem(v_prize.current_version_id, new.start_date, new.end_date);
      if v_problem is not null then
        raise exception '%', v_problem using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

comment on function raffles_guard_prize_config() is
  'BR-J13: una rifa nueva puede nacer configurable con la capacidad y en borrador (D-202); ninguna sesion cambia el modo; una rifa existente no borrador solo pasa a configurable por la puerta de la transicion (D-204).';

comment on column raffles.prize_mode is
  'BR-J13: legacy = comparador fijo de siempre (BR-L06); configurable = premios de raffle_prizes. Ninguna sesion lo cambia. En borrador lo cambia un proceso sin sesion; una rifa existente activa, solo transition_raffle_prize_mode (D-204).';

-- =============================================================================
-- 4. Las comprobaciones de la transicion
-- =============================================================================

-- Los sorteos de la ventana de una rifa que IMPEDIRIAN la transicion de una rifa
-- activa, en orden:
--
--   * `unconfirmed_result`: ya alcanzaron su corte efectivo y no tienen un
--     resultado CONFIRMADO. Se buscarian con los premios nuevos al confirmarse.
--   * `unknown_schedule`: su corte no se conoce —sin programacion o sin alguna
--     de las dos horas— y su semana ya empezo, asi que pudo jugarse ya.
--
-- Un sorteo CANCELADO no va a tener resultado y no cuenta. Recibe el instante de
-- referencia para poder probar la clasificacion sin depender del reloj; la
-- transicion le pasa `clock_timestamp()`.
--
-- Costo: un dia por fila de la ventana de la rifa, con dos busquedas por indice
-- unico. No mira boletas.
create function raffle_prize_transition_pending_draws(p_raffle raffles, p_now timestamptz)
returns table (
  reference_date date,
  lottery_code   lottery_code,
  draw_number    text,
  reason         text
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
  ),
  draws as (
    select d.reference_date,
           d.lottery_code,
           s.id as schedule_id,
           s.draw_number,
           s.schedule_status,
           raffle_prize_draw_cutoff(s) as cutoff
    from days d
    left join lottery_draw_schedules s
      on s.lottery_code = d.lottery_code
     and s.reference_date = d.reference_date
  )
  select dr.reference_date,
         dr.lottery_code,
         dr.draw_number,
         case when dr.cutoff is null then 'unknown_schedule' else 'unconfirmed_result' end
  from draws dr
  where (dr.schedule_id is null or dr.schedule_status <> 'cancelled')
    and not exists (
      select 1 from lottery_results lr
      where lr.schedule_id = dr.schedule_id
        and lr.validation_status = 'confirmed'
    )
    and (
      (dr.cutoff is not null and dr.cutoff <= p_now)
      or (dr.cutoff is null
          and dr.reference_date - (extract(isodow from dr.reference_date::timestamp)::int - 1)
              <= (p_now at time zone 'America/Bogota')::date)
    )
  order by dr.reference_date
$$;

comment on function raffle_prize_transition_pending_draws(raffles, timestamptz) is
  'D-204: sorteos de la ventana de una rifa que ya alcanzaron su corte sin resultado confirmado, o cuyo corte no se conoce en una semana ya empezada. Impiden la transicion de una rifa activa. Interna.';

-- La primera ocurrencia de una version cuyo corte efectivo ya llego cuando se
-- publico: esa version nunca le aplicaria (BR-J09, publicada ESTRICTAMENTE antes
-- del corte), y configurarla seria anunciar un premio que no puede jugar.
create function raffle_prize_transition_played_occurrence(p_version_id uuid)
returns table (reference_date date, lottery_code lottery_code)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.reference_date, e.lottery_code
  from raffle_prize_versions v
  cross join lateral raffle_prize_rule_dates(v.id) e
  join lottery_draw_schedules s
    on s.lottery_code = e.lottery_code
   and s.reference_date = e.reference_date
  where v.id = p_version_id
    and raffle_prize_draw_cutoff(s) is not null
    and raffle_prize_draw_cutoff(s) <= v.published_at
  order by e.reference_date
  limit 1
$$;

comment on function raffle_prize_transition_played_occurrence(uuid) is
  'D-204: la primera fecha de una version cuyo corte efectivo (raffle_prize_draw_cutoff) no es posterior a su publicacion. Interna.';

-- La configuracion pedida, validada y NORMALIZADA con las mismas piezas que las
-- RPC: campos, recompensa y periodos dentro de la rifa. Conserva el orden, que
-- es la posicion de cada premio. De aqui sale la huella.
create function raffle_prize_transition_configuration(p_raffle raffles, p_prizes jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_item       jsonb;
  v_config     jsonb := '[]'::jsonb;
  v_category   raffle_prize_category;
  v_mode       raffle_prize_reward_mode;
  v_field      lottery_match_field;
  v_digits     raffle_prize_digits;
  v_title      text;
  v_conditions text;
begin
  if p_prizes is null or jsonb_typeof(p_prizes) <> 'array' or jsonb_array_length(p_prizes) = 0 then
    raise exception 'Indica al menos un premio para la rifa.' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(p_prizes) > 50 then
    raise exception 'Una rifa admite como máximo 50 premios vigentes.' using errcode = 'check_violation';
  end if;

  for v_item in select value from jsonb_array_elements(p_prizes)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'category', '') not in (
         select unnest(enum_range(null::raffle_prize_category))::text)
       or coalesce(v_item ->> 'reward_mode', '') not in (
         select unnest(enum_range(null::raffle_prize_reward_mode))::text)
       or coalesce(v_item ->> 'number_field', '') not in (
         select unnest(enum_range(null::lottery_match_field))::text)
       or coalesce(v_item ->> 'digits', '') not in (
         select unnest(enum_range(null::raffle_prize_digits))::text) then
      raise exception 'Revisa la categoría, la forma de la recompensa, el número de la boleta y las cifras de cada premio.'
        using errcode = 'check_violation';
    end if;

    v_category := (v_item ->> 'category')::raffle_prize_category;
    v_mode := (v_item ->> 'reward_mode')::raffle_prize_reward_mode;
    v_field := (v_item ->> 'number_field')::lottery_match_field;
    v_digits := (v_item ->> 'digits')::raffle_prize_digits;

    select f.clean_title, f.clean_conditions
      into v_title, v_conditions
    from raffle_prize_clean_fields(
      v_item ->> 'title', v_category, v_field, v_digits, v_item ->> 'conditions'
    ) f;

    v_config := v_config || jsonb_build_array(jsonb_build_object(
      'title',          v_title,
      'category',       v_category,
      'reward_mode',    v_mode,
      'reward_options', raffle_prize_normalized_reward(v_mode, v_item -> 'reward_options'),
      'number_field',   v_field,
      'digits',         v_digits,
      'conditions',     v_conditions,
      'rules',          raffle_prize_normalized_rules(p_raffle, v_item -> 'rules')
    ));
  end loop;

  return v_config;
end;
$$;

comment on function raffle_prize_transition_configuration(raffles, jsonb) is
  'D-204: valida y normaliza los premios de una transicion con las mismas piezas que las RPC. Conserva el orden. Interna.';

-- =============================================================================
-- 5. La transicion
-- =============================================================================

-- Hace la transicion, o devuelve la que ya estaba si es identica. Todo lo que
-- escribe lo escribe aqui; `transition_raffle_prize_mode` decide si se queda.
create function raffle_prize_transition_apply(
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
  v_pending_count   integer;
  v_pending_list    text;
  v_pending_date    date;
  v_pending_lottery lottery_code;
  v_pending_reason  text;
  v_item          jsonb;
  v_position      integer;
  v_prize_id      uuid;
  v_version_id    uuid;
  v_version       raffle_prize_versions%rowtype;
  v_problem       text;
  v_played        record;
  v_prize_ids     uuid[] := array[]::uuid[];
  v_transition_id uuid := gen_random_uuid();
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
        'notified',           0
      );
    end if;

    raise exception 'Esta rifa ya pasó a premios configurables con otra configuración.'
      using errcode = 'check_violation';
  end if;

  -- LOS SORTEOS PENDIENTES de una rifa activa: si alguno ya alcanzo su corte sin
  -- resultado confirmado, o su corte no se conoce, la transicion espera.
  if v_raffle.status = 'active' then
    select count(*)::integer,
           string_agg(
             format('%s del %s (%s)',
                    raffle_prize_lottery_label(p.lottery_code),
                    to_char(p.reference_date, 'DD/MM/YYYY'),
                    case p.reason
                      when 'unknown_schedule' then 'hora oficial desconocida'
                      else 'resultado sin confirmar'
                    end),
             '; ' order by p.reference_date),
           (array_agg(p.reference_date order by p.reference_date))[1],
           (array_agg(p.lottery_code order by p.reference_date))[1],
           (array_agg(p.reason order by p.reference_date))[1]
      into v_pending_count, v_pending_list, v_pending_date, v_pending_lottery, v_pending_reason
    from raffle_prize_transition_pending_draws(v_raffle, clock_timestamp()) p;

    if v_pending_count > 0 then
      if v_pending_count = 1 and v_pending_reason = 'unknown_schedule' then
        raise exception 'Todavía no conocemos la hora oficial del sorteo de % del %, así que no sabemos si ya se jugó. Vuelve a intentarlo cuando la programación oficial la publique.',
          raffle_prize_lottery_label(v_pending_lottery),
          to_char(v_pending_date, 'DD/MM/YYYY')
          using errcode = 'check_violation',
                detail = format('Sorteo pendiente: %s', v_pending_list);
      end if;

      if v_pending_count = 1 then
        raise exception 'El sorteo de % del % ya se jugó y todavía no tiene el resultado confirmado. Espera a que se confirme antes de la transición: si no, se buscaría con los premios nuevos.',
          raffle_prize_lottery_label(v_pending_lottery),
          to_char(v_pending_date, 'DD/MM/YYYY')
          using errcode = 'check_violation',
                detail = format('Sorteo pendiente: %s', v_pending_list);
      end if;

      raise exception 'Hay % sorteos de la rifa sin resultado confirmado que ya se jugaron o cuya hora oficial no conocemos. El primero es el de % del %. Espera a que se confirmen antes de la transición: si no, se buscarían con los premios nuevos.',
        v_pending_count,
        raffle_prize_lottery_label(v_pending_lottery),
        to_char(v_pending_date, 'DD/MM/YYYY')
        using errcode = 'check_violation',
              detail = format('%s sorteos pendientes: %s', v_pending_count, v_pending_list);
    end if;
  end if;

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

    select * into v_played from raffle_prize_transition_played_occurrence(v_version_id);
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

  -- LA PUERTA: la fila de transicion, y en la misma transaccion el cambio de
  -- modo. El disparador de `raffles` vuelve a exigir la configuracion completa.
  insert into raffle_prize_transitions (
    id, organization_id, raffle_id, raffle_status, raffle_start_date, raffle_end_date,
    configuration_hash, prize_ids, transitioned_by
  )
  values (
    v_transition_id, v_raffle.organization_id, v_raffle.id, v_raffle.status,
    v_raffle.start_date, v_raffle.end_date, v_hash, v_prize_ids, auth.uid()
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
  -- venta: premios, fechas y cifras de la transicion.
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
    'prize_ids',          to_jsonb(v_prize_ids),
    'prizes',             v_prizes,
    'notified',           v_notified,
    'configuration_hash', v_hash
  );
end;
$$;

comment on function raffle_prize_transition_apply(uuid, uuid, text, raffle_status, date, date, jsonb) is
  'D-204: valida y hace la transicion de una rifa, o devuelve la identica que ya existia. Interna: la llama transition_raffle_prize_mode.';

-- LA OPERACION. Solo la service role, nunca una sesion. Por defecto es una
-- VISTA PREVIA: hace todo dentro de un bloque que se deshace y devuelve lo que
-- habria quedado, con los identificadores en blanco porque no van a existir.
create function transition_raffle_prize_mode(
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
    'prize_ids',     '[]'::jsonb,
    'prizes',        (
      select coalesce(jsonb_agg((e - 'prize_id' - 'version_id') order by (e ->> 'position')::integer), '[]'::jsonb)
      from jsonb_array_elements(v_result -> 'prizes') e
    )
  );
end;
$$;

comment on function transition_raffle_prize_mode(uuid, uuid, text, raffle_status, date, date, jsonb, boolean) is
  'BR-J13, D-204: transicion de UNA rifa existente de legacy a configurable, atomica. Sin p_apply es una vista previa que no deja nada. Solo service_role.';

-- =============================================================================
-- 6. Privilegios (docs/SECURITY.md §4.5 y §4.22)
--
-- La operacion: SOLO la service role. Ni PUBLIC, ni anon, ni authenticated.
-- Todo lo demas es interno: nadie lo ejecuta directamente (I-078).
-- =============================================================================

revoke execute on function transition_raffle_prize_mode(uuid, uuid, text, raffle_status, date, date, jsonb, boolean) from public, anon, authenticated;
grant  execute on function transition_raffle_prize_mode(uuid, uuid, text, raffle_status, date, date, jsonb, boolean) to service_role;

revoke execute on function raffle_prize_transition_apply(uuid, uuid, text, raffle_status, date, date, jsonb) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_configuration(raffles, jsonb) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_played_occurrence(uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_pending_draws(raffles, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transition_open(uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_transitions_guard() from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_lottery_label(lottery_code) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_raffle_status_phrase(raffle_status) from public, anon, authenticated, service_role;
revoke execute on function raffles_guard_prize_config() from public, anon, authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA, nunca editar esta. Antes, mirar si ya hubo
-- alguna transicion: revertir la puerta NO deshace una rifa ya convertida, y sus
-- premios, sus versiones, su aviso y su bitacora siguen siendo historia.
--
--   select raffle_id, transitioned_at from raffle_prize_transitions;
--
--   -- raffles_guard_prize_config: volver a escribir su cuerpo de 0060.
--   drop function transition_raffle_prize_mode(uuid, uuid, text, raffle_status, date, date, jsonb, boolean);
--   drop function raffle_prize_transition_apply(uuid, uuid, text, raffle_status, date, date, jsonb);
--   drop function raffle_prize_transition_configuration(raffles, jsonb);
--   drop function raffle_prize_transition_played_occurrence(uuid);
--   drop function raffle_prize_transition_pending_draws(raffles, timestamptz);
--   drop function raffle_prize_transition_open(uuid);  -- despues del cuerpo de 0060
--   drop table raffle_prize_transitions;               -- solo si no hubo ninguna
--   drop function raffle_prize_transitions_guard();
--   drop function raffle_prize_raffle_status_phrase(raffle_status);
--   drop function raffle_prize_lottery_label(lottery_code);
--
-- Las filas `raffle.prize_mode_transition` de `audit_logs` se conservan: la
-- bitacora es de solo anexado (BR-D02).
-- =============================================================================
