-- =============================================================================
-- 0067_prize_award_history.sql
-- Historial de premios ganados — Etapa 1: base, lecturas y los dos premios
-- reconocidos por el dueno
--
-- Referencia normativa: docs/DECISIONS.md D-208 (el contrato, con las respuestas
-- H1, H2 y H3 del dueno), D-203 y D-206 (el motor y la frontera), D-198 (la
-- cartera es del vendedor), D-207 (quien ejecuta cada funcion), D-092 (la
-- proyeccion estrecha); docs/BUSINESS_RULES.md BR-J17..BR-J22 (nuevas),
-- BR-L09..BR-L11, BR-L15, BR-Q01..BR-Q02, BR-I15 (nueva);
-- docs/KNOWN_ISSUES.md I-133, I-134, I-135.
--
-- QUE HACE
--
-- 1. `declared_prize_awards`: los premios que el NEGOCIO reconoce y que el
--    motor no puede producir. Es aditiva y vive APARTE de
--    `lottery_ticket_match_prizes`, que es inmutable y cuyos enlaces solo puede
--    escribir el motor. Cada fila se cuelga de una fotografia que YA existe.
--
--    NO tiene `prize_version_id`, y es a proposito: a estos sorteos no les
--    aplico ninguna version (su corte es anterior al instante efectivo de la
--    transicion, D-206), asi que apuntar a una seria falso. La clasificacion y
--    el importe vienen de la confirmacion del dueno, que se guarda en `basis`,
--    y el titulo tal como se declaro, en `declared_title`.
--
--    `recorded_by` es el ACTOR TECNICO de la carga —NULL cuando la ejecuta un
--    proceso del sistema, que es el caso— y NO la persona que confirmo el
--    premio: esa va nombrada por su rol dentro de `basis`. Son dos cosas
--    distintas y no se mezclan.
--
-- 2. Tres defensas de esa tabla, que no dependen de que el cargador este bien
--    escrito:
--
--      * la fotografia tiene que estar `sold` —un premio necesita cliente—;
--      * el sorteo tiene que resolverse con el sistema de siempre para su rifa
--        (`raffle_prize_draw_mode` = `legacy`), asi que el motor NO puede
--        escribir nunca un enlace para el, y no hay forma de contar dos veces;
--      * no puede existir ya un enlace del motor para esa fotografia y ese
--        premio.
--
--    Y la inmutabilidad de siempre: ni `UPDATE` —salvo la anulacion— ni
--    `DELETE`, tampoco con la service role.
--
-- 3. `record_declared_prize_awards`: el cargador. Por omision es una VISTA
--    PREVIA que valida y reporta sin escribir; con `p_apply` escribe, y es
--    idempotente (`on conflict do nothing`). Entera o nada: con un solo
--    problema, se niega sin escribir. Solo la service role.
--
-- 4. Los numeros de una boleta con coincidencias dejan de poder cambiar
--    (I-134). Es un DISPARADOR sobre `tickets`, no una comprobacion dentro de
--    una RPC: cubre `admin_update_ticket_numbers`, cualquier politica de
--    `UPDATE`, cualquier RPC futura y la service role. Va acompanado de un
--    disparador de restriccion DIFERIDO, que vuelve a mirar al COMMIT y ve las
--    coincidencias que otra transaccion haya confirmado mientras tanto.
--
-- 5. Las lecturas del historial: una definicion interna de que es un premio
--    ganado (`prize_award_rows`) y cuatro envoltorios —listado y totales, por
--    portal—. El del personal NO declara ni devuelve un solo campo de cliente.
--
-- QUE NO HACE
--
--   * No construye otro motor: no recalcula ganadores desde las boletas de hoy.
--     Lee las fotografias, los enlaces y las versiones que ya existen, con la
--     prioridad de cuatro cifras sobre tres POR CLIENTE que el motor ya aplico.
--   * No toca `lottery_ticket_matches`, `lottery_ticket_match_prizes`,
--     `raffle_prize_versions` ni ninguna fila inmutable.
--   * No reprocesa resultados, no confirma ninguno y no cambia el modo de
--     ninguna rifa.
--   * No toca abonos, saldos, precios de venta ni comisiones (D-198).
--   * No carga nada: la fila de los dos premios reconocidos la escribe el
--     script, con autorizacion propia y solo en local en esta etapa.
--   * No crea pantallas ni una interfaz de carga manual.
--
-- SOBRE LAS TILDES. Las frases NUEVAS que puede leer una persona van
-- acentuadas; los comentarios siguen sin tildes. I-030 no se toca aqui.
-- =============================================================================

-- =============================================================================
-- 1. declared_prize_awards — el premio que reconoce el negocio
-- =============================================================================

create table declared_prize_awards (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations (id) on delete restrict,
  raffle_id           uuid not null,
  result_id           uuid not null references lottery_results (id) on delete restrict,
  -- La fotografia que ya existe. La FK la referencia CON su resultado, su
  -- organizacion, su rifa y su numero, igual que el enlace del motor: un
  -- reconocimiento cruzado entre organizaciones, rifas, sorteos o numeros no se
  -- puede escribir, venga de donde venga.
  match_id            uuid not null,
  match_field         lottery_match_field not null,
  -- La identidad del premio que el dueno nombro. La identidad es estable; sus
  -- condiciones cambian de version, y por eso el titulo se guarda aparte.
  prize_id            uuid not null,
  declared_title      text not null,
  -- La recompensa reconocida, con la misma forma que una alternativa de una
  -- version (0059): dinero, especie, o los dos, y al menos uno.
  amount              bigint,
  in_kind_description text,
  -- El respaldo de negocio: de donde sale este reconocimiento. Nombra el ROL
  -- que lo confirmo, nunca a una persona.
  basis               text not null,
  -- El actor TECNICO de la carga. NULL = un proceso del sistema.
  recorded_by         uuid references profiles (id) on delete restrict,
  recorded_at         timestamptz not null default now(),
  voided_at           timestamptz,
  voided_by           uuid references profiles (id) on delete restrict,
  void_reason         text,

  -- Idempotencia: una fotografia se reconoce como mucho una vez con cada
  -- premio. Un reintento inserta con ON CONFLICT DO NOTHING.
  constraint declared_prize_awards_match_prize_key unique (match_id, prize_id),

  constraint declared_prize_awards_match_fk
    foreign key (match_id, result_id, organization_id, raffle_id, match_field)
    references lottery_ticket_matches (id, result_id, organization_id, raffle_id, match_field)
    on delete restrict,
  constraint declared_prize_awards_prize_fk
    foreign key (prize_id, raffle_id, organization_id)
    references raffle_prizes (id, raffle_id, organization_id)
    on delete restrict,

  constraint declared_prize_awards_reward_check check (
    amount is not null or in_kind_description is not null
  ),
  -- Los mismos limites que una alternativa de una version (BR-J14).
  constraint declared_prize_awards_amount_check check (
    amount is null or amount between 1 and 10000000000
  ),
  constraint declared_prize_awards_in_kind_check check (
    in_kind_description is null
    or (in_kind_description = btrim(in_kind_description)
        and char_length(in_kind_description) between 2 and 160)
  ),
  constraint declared_prize_awards_title_check check (
    declared_title = btrim(declared_title) and char_length(declared_title) between 2 and 80
  ),
  constraint declared_prize_awards_basis_check check (
    basis = btrim(basis) and char_length(basis) between 10 and 500
  ),
  constraint declared_prize_awards_void_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null
        and void_reason is not null
        and void_reason = btrim(void_reason)
        and char_length(void_reason) between 3 and 500)
  )
);

comment on table declared_prize_awards is
  'D-208: premio que reconoce el NEGOCIO sobre una coincidencia que el motor no puede premiar (su sorteo se resuelve con el sistema de siempre). Aditiva, aparte de lottery_ticket_match_prizes.';
comment on column declared_prize_awards.basis is
  'D-208: el respaldo de negocio del reconocimiento, con el ROL que lo confirmo. Nunca un nombre propio.';
comment on column declared_prize_awards.recorded_by is
  'D-208: el actor TECNICO de la carga; NULL = proceso del sistema. NO es quien confirmo el premio, que va en basis.';
comment on column declared_prize_awards.declared_title is
  'D-208: el titulo tal como se declaro. No se lee de la version vigente: renombrar el premio no reescribe la historia.';
comment on column declared_prize_awards.amount is
  'D-208: el componente en dinero reconocido, en pesos enteros. NULL = no hay dinero cierto, y el valor queda pendiente.';

create index declared_prize_awards_org_idx
  on declared_prize_awards (organization_id, raffle_id);

create index declared_prize_awards_match_idx
  on declared_prize_awards (match_id);

-- =============================================================================
-- 2. Las defensas de la tabla
-- =============================================================================

-- Un reconocimiento solo cabe donde el motor NUNCA va a poder escribir un
-- enlace: una fotografia `sold` de un sorteo que, para su rifa, se resuelve con
-- el sistema de siempre (D-206). Asi el doble conteo es imposible por
-- construccion, no por una comprobacion del cargador.
create function declared_prize_awards_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match    lottery_ticket_matches;
  v_schedule lottery_draw_schedules;
  v_mode     raffle_prize_mode;
begin
  select * into v_match from lottery_ticket_matches m where m.id = new.match_id;
  if not found then
    raise exception 'La coincidencia indicada no existe.';
  end if;

  if v_match.assignment_status <> 'sold' then
    raise exception 'Esa boleta no estaba vendida cuando se jugó el sorteo, así que no puede tener premio.'
      using errcode = 'check_violation';
  end if;

  select s.* into v_schedule
    from lottery_results r
    join lottery_draw_schedules s on s.id = r.schedule_id
   where r.id = new.result_id;
  if not found then
    raise exception 'El resultado indicado no existe.';
  end if;

  v_mode := raffle_prize_draw_mode(new.raffle_id, v_schedule);
  if v_mode is distinct from 'legacy' then
    raise exception 'Ese sorteo se resuelve con los premios configurables de la rifa, así que su premio lo registra el sistema y no se puede reconocer a mano.'
      using errcode = 'check_violation',
            detail = format('rifa %s; sorteo %s de %s del %s',
                            new.raffle_id, v_schedule.draw_number, v_schedule.lottery_code,
                            to_char(v_schedule.reference_date, 'DD/MM/YYYY'));
  end if;

  if exists (
    select 1 from lottery_ticket_match_prizes lp
     where lp.match_id = new.match_id and lp.prize_id = new.prize_id
  ) then
    raise exception 'Esa coincidencia ya tiene ese premio registrado por el sistema.'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

create trigger declared_prize_awards_check
  before insert on declared_prize_awards
  for each row execute function declared_prize_awards_check();

comment on function declared_prize_awards_check() is
  'D-208: un reconocimiento exige fotografia vendida y un sorteo del sistema de siempre, donde el motor no puede escribir enlaces. Interna.';

-- Inmutable, salvo la anulacion: ni la service role reescribe un
-- reconocimiento, igual que una fotografia o un enlace (BR-L11).
create function declared_prize_awards_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un premio reconocido no se borra: se anula con su motivo.';
  end if;

  if new.id                  is distinct from old.id
     or new.organization_id  is distinct from old.organization_id
     or new.raffle_id        is distinct from old.raffle_id
     or new.result_id        is distinct from old.result_id
     or new.match_id         is distinct from old.match_id
     or new.match_field      is distinct from old.match_field
     or new.prize_id         is distinct from old.prize_id
     or new.declared_title   is distinct from old.declared_title
     or new.amount           is distinct from old.amount
     or new.in_kind_description is distinct from old.in_kind_description
     or new.basis            is distinct from old.basis
     or new.recorded_by      is distinct from old.recorded_by
     or new.recorded_at      is distinct from old.recorded_at
  then
    raise exception 'Un premio reconocido no se modifica: lo único que cambia es su anulación.';
  end if;

  if old.voided_at is not null then
    raise exception 'Ese premio reconocido ya está anulado.';
  end if;

  return new;
end;
$$;

create trigger declared_prize_awards_immutable
  before update or delete on declared_prize_awards
  for each row execute function declared_prize_awards_immutable();

comment on function declared_prize_awards_immutable() is
  'D-208: un reconocimiento es historia. Ni UPDATE —salvo la anulacion— ni DELETE, tampoco con service_role.';

-- =============================================================================
-- 3. RLS y privilegios de la tabla
--
-- El vendedor ve los reconocimientos de SUS coincidencias, y nada mas: el
-- `exists` se evalua con su RLS, y `lottery_ticket_matches_select` ya es
-- `seller_id = current_profile_id()` SIN equipo (0057). El personal no lee la
-- tabla: va por `admin_prize_awards`. Es el patron de
-- `lottery_ticket_match_prizes` (0061).
-- =============================================================================

alter table declared_prize_awards enable row level security;
alter table declared_prize_awards force  row level security;

create policy declared_prize_awards_select on declared_prize_awards
for select to authenticated
using (
  organization_id in (select current_org_ids())
  and exists (
    select 1
    from lottery_ticket_matches m
    where m.id = declared_prize_awards.match_id
  )
);

revoke all on declared_prize_awards from public, anon, authenticated, service_role;

grant select on declared_prize_awards to authenticated;
grant select on declared_prize_awards to service_role;

-- =============================================================================
-- 4. Los numeros de una boleta con coincidencias no cambian (I-134)
--
-- POR QUE UN DISPARADOR Y NO UNA COMPROBACION EN LA RPC. Hoy el unico camino
-- vivo es `admin_update_ticket_numbers` (0057), que solo rechaza una boleta
-- anulada. Pero `tickets_update_seller` permite al vendedor un `UPDATE` directo
-- en `draft` y `pending_approval`, la service role tiene sus privilegios, y
-- cualquier RPC futura seria un camino mas. Un disparador cubre TODOS, y es el
-- cambio minimo: una condicion, la misma que ya usan BR-I13 y BR-I14.
--
-- LA CONCURRENCIA. El disparador inmediato mira las coincidencias que ya estan
-- confirmadas. Si el motor confirma una MIENTRAS la edicion esta en vuelo, el
-- inmediato no la ve; el DIFERIDO vuelve a mirar al COMMIT, con una instantanea
-- nueva, y la ve. Queda una sola ordenacion sin cerrar —la edicion se confirma
-- antes de que el motor confirme su fotografia, con el motor leyendo el numero
-- viejo—, que no se cierra aqui porque exigiria que el motor bloqueara las
-- boletas que lee, y eso es tocar el motor autoritativo. Se DETECTA en la
-- lectura del historial, que marca una fotografia cuyo numero no esta entre los
-- dos de la boleta (I-134).
-- =============================================================================

create function tickets_guard_matched_numbers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from lottery_ticket_matches m where m.ticket_id = new.id) then
    raise exception 'Esta boleta ya hace parte de un resultado registrado: sus números no se pueden cambiar.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger tickets_guard_matched_numbers
  before update on tickets
  for each row
  when (old.daily_number  is distinct from new.daily_number
     or old.weekly_number is distinct from new.weekly_number)
  execute function tickets_guard_matched_numbers();

comment on function tickets_guard_matched_numbers() is
  'I-134: los numeros de una boleta con coincidencias no cambian por ninguna via. Se comprueba tambien al COMMIT.';

create constraint trigger tickets_guard_matched_numbers_deferred
  after update on tickets
  deferrable initially deferred
  for each row
  when (old.daily_number  is distinct from new.daily_number
     or old.weekly_number is distinct from new.weekly_number)
  execute function tickets_guard_matched_numbers();

-- =============================================================================
-- 5. Que es un premio ganado: UNA sola definicion
--
-- Un premio ganado es una fotografia `sold` —que por el CHECK de 0036 ya
-- implica cliente y `assigned_at <= official_scheduled_at` (BR-L09, BR-L10)— y
-- o bien un enlace del motor con su VERSION historica, o bien un
-- reconocimiento vigente del negocio.
--
-- NO recalcula nada: la prioridad de cuatro cifras sobre tres por cliente ya la
-- aplico el motor al fotografiar, y una coincidencia descartada no esta aqui
-- porque no se fotografio (D-203).
--
-- LAS ALTERNATIVAS NO MULTIPLICAN FILAS: la recompensa se agrega en
-- subconsultas escalares, nunca con un join.
--
-- EL DINERO. `known_amount` es el dinero CIERTO: el de una recompensa de modo
-- `fixed`, que tiene exactamente una alternativa. `value_pending` dice que el
-- valor completo todavia no esta definido: o la recompensa es de alternativas
-- excluyentes —no se suman, no se elige una, no se toma la de efectivo—, o
-- lleva un componente en especie, que NO se valora en cero.
-- =============================================================================

create function prize_award_rows(
  p_org_ids    uuid[],
  p_seller_ids uuid[] default null,
  p_raffle_id  uuid default null,
  p_client_id  uuid default null,
  p_from       date default null,
  p_to         date default null
)
returns table (
  award_key        text,
  origin           text,
  match_id         uuid,
  organization_id  uuid,
  raffle_id        uuid,
  raffle_name      text,
  raffle_short_code text,
  seller_id        uuid,
  client_id        uuid,
  ticket_id        uuid,
  daily_number     text,
  weekly_number    text,
  match_field      lottery_match_field,
  matched_number   text,
  numbers_changed  boolean,
  result_id        uuid,
  reference_date   date,
  lottery_code     lottery_code,
  draw_number      text,
  winning_number   text,
  result_conflict  boolean,
  prize_id         uuid,
  prize_title      text,
  prize_category   raffle_prize_category,
  prize_digits     raffle_prize_digits,
  prize_version_id uuid,
  known_amount     bigint,
  value_pending    boolean,
  awarded_at       timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Los premios que escribio el MOTOR: fotografia + enlace + version historica.
  select
    'engine:' || lp.id::text,
    'engine',
    m.id,
    m.organization_id,
    m.raffle_id,
    ra.name,
    ra.short_code,
    m.seller_id,
    m.client_id,
    m.ticket_id,
    t.daily_number,
    t.weekly_number,
    m.match_field,
    m.matched_number,
    (m.matched_number is distinct from t.daily_number
     and m.matched_number is distinct from t.weekly_number),
    r.id,
    s.reference_date,
    s.lottery_code,
    s.draw_number,
    r.winning_number,
    (r.validation_status <> 'confirmed'),
    v.prize_id,
    v.title,
    v.category,
    v.digits,
    v.id,
    case when v.reward_mode = 'fixed'
      then (select o.amount from raffle_prize_reward_options o where o.version_id = v.id limit 1)
    end,
    (v.reward_mode <> 'fixed'
     or exists (select 1 from raffle_prize_reward_options o
                 where o.version_id = v.id and o.description is not null)),
    lp.created_at
  from lottery_ticket_match_prizes lp
  join lottery_ticket_matches m on m.id = lp.match_id
  join raffle_prize_versions v on v.id = lp.prize_version_id
  join raffles ra on ra.id = m.raffle_id
  join tickets t on t.id = m.ticket_id
  join lottery_results r on r.id = m.result_id
  join lottery_draw_schedules s on s.id = r.schedule_id
  where m.assignment_status = 'sold'
    and m.organization_id = any (p_org_ids)
    and (p_seller_ids is null or m.seller_id = any (p_seller_ids))
    and (p_raffle_id is null or m.raffle_id = p_raffle_id)
    and (p_client_id is null or m.client_id = p_client_id)
    and (p_from is null or s.reference_date >= p_from)
    and (p_to   is null or s.reference_date <= p_to)

  union all

  -- Los premios que reconoce el NEGOCIO. Sin version, porque a su sorteo no le
  -- aplico ninguna: el titulo y el importe son los declarados.
  select
    'declared:' || d.id::text,
    'declared',
    m.id,
    m.organization_id,
    m.raffle_id,
    ra.name,
    ra.short_code,
    m.seller_id,
    m.client_id,
    m.ticket_id,
    t.daily_number,
    t.weekly_number,
    m.match_field,
    m.matched_number,
    (m.matched_number is distinct from t.daily_number
     and m.matched_number is distinct from t.weekly_number),
    r.id,
    s.reference_date,
    s.lottery_code,
    s.draw_number,
    r.winning_number,
    (r.validation_status <> 'confirmed'),
    d.prize_id,
    d.declared_title,
    pv.category,
    pv.digits,
    null::uuid,
    d.amount,
    (d.in_kind_description is not null),
    d.recorded_at
  from declared_prize_awards d
  join lottery_ticket_matches m on m.id = d.match_id
  join raffles ra on ra.id = m.raffle_id
  join tickets t on t.id = m.ticket_id
  join lottery_results r on r.id = m.result_id
  join lottery_draw_schedules s on s.id = r.schedule_id
  join raffle_prizes p on p.id = d.prize_id
  join raffle_prize_versions pv on pv.id = p.current_version_id
  where d.voided_at is null
    and m.assignment_status = 'sold'
    and m.organization_id = any (p_org_ids)
    and (p_seller_ids is null or m.seller_id = any (p_seller_ids))
    and (p_raffle_id is null or m.raffle_id = p_raffle_id)
    and (p_client_id is null or m.client_id = p_client_id)
    and (p_from is null or s.reference_date >= p_from)
    and (p_to   is null or s.reference_date <= p_to)
$$;

comment on function prize_award_rows(uuid[], uuid[], uuid, uuid, date, date) is
  'D-208: la UNICA definicion de que es un premio ganado. Compone los enlaces del motor con los reconocimientos del negocio, sin duplicar y sin multiplicar por las alternativas. Interna: el alcance lo deciden los envoltorios, nunca el llamante.';

-- =============================================================================
-- 6. Las cuatro lecturas
--
-- Ninguna recibe organizacion, vendedor ni actor: el alcance sale de la sesion
-- (D-198, D-199 Decision 7). El vendedor ve SOLO lo suyo —tener equipo no
-- concede nada (respuesta del dueno)—; el personal, su organizacion entera y
-- NI UN CAMPO de cliente (BR-Q01, BR-Q02).
-- =============================================================================

create function seller_prize_awards(
  p_raffle_id uuid default null,
  p_client_id uuid default null,
  p_from      date default null,
  p_to        date default null,
  p_limit     integer default 25,
  p_offset    integer default 0
)
returns table (
  award_key        text,
  origin           text,
  reference_date   date,
  lottery_code     lottery_code,
  draw_number      text,
  winning_number   text,
  result_conflict  boolean,
  raffle_id        uuid,
  raffle_name      text,
  ticket_id        uuid,
  daily_number     text,
  weekly_number    text,
  matched_number   text,
  numbers_changed  boolean,
  client_id        uuid,
  client_name      text,
  prize_title      text,
  prize_category   raffle_prize_category,
  prize_digits     raffle_prize_digits,
  known_amount     bigint,
  value_pending    boolean,
  total_count      bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 0), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  return query
  select a.award_key, a.origin, a.reference_date, a.lottery_code, a.draw_number,
         a.winning_number, a.result_conflict, a.raffle_id, a.raffle_name,
         a.ticket_id, a.daily_number, a.weekly_number, a.matched_number,
         a.numbers_changed, a.client_id, c.name, a.prize_title, a.prize_category,
         a.prize_digits, a.known_amount, a.value_pending,
         count(*) over () as total_count
    from prize_award_rows(
           array(select current_org_ids()),
           array[(select current_profile_id())],
           p_raffle_id, p_client_id, p_from, p_to
         ) a
    left join clients c on c.id = a.client_id
   order by a.reference_date desc, a.lottery_code, a.award_key
   limit v_limit offset v_offset;
end;
$$;

comment on function seller_prize_awards(uuid, uuid, date, date, integer, integer) is
  'D-208: el historial de premios ganados del vendedor de la sesion. Solo sus coincidencias: tener equipo no concede ninguna mas.';

create function seller_prize_award_totals(
  p_raffle_id uuid default null,
  p_client_id uuid default null,
  p_from      date default null,
  p_to        date default null
)
returns table (
  prizes_count        bigint,
  clients_count       bigint,
  known_amount        bigint,
  value_pending_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*),
    count(distinct a.client_id),
    coalesce(sum(a.known_amount), 0),
    count(*) filter (where a.value_pending)
  from prize_award_rows(
         array(select current_org_ids()),
         array[(select current_profile_id())],
         p_raffle_id, p_client_id, p_from, p_to
       ) a
$$;

comment on function seller_prize_award_totals(uuid, uuid, date, date) is
  'D-208: los cuatro indicadores del vendedor, sobre TODO el filtro y no sobre la pagina. Calculados en PostgreSQL, en pesos enteros.';

-- El personal: ni un campo de cliente en el tipo de retorno, asi que no hay
-- nada que ocultar despues (D-198, Decision 7).
create function admin_prize_awards(
  p_raffle_id uuid default null,
  p_seller_id uuid default null,
  p_from      date default null,
  p_to        date default null,
  p_limit     integer default 25,
  p_offset    integer default 0
)
returns table (
  award_key        text,
  origin           text,
  reference_date   date,
  lottery_code     lottery_code,
  draw_number      text,
  winning_number   text,
  result_conflict  boolean,
  raffle_id        uuid,
  raffle_name      text,
  raffle_short_code text,
  seller_id        uuid,
  seller_name      text,
  ticket_id        uuid,
  daily_number     text,
  weekly_number    text,
  matched_number   text,
  numbers_changed  boolean,
  prize_title      text,
  prize_category   raffle_prize_category,
  prize_digits     raffle_prize_digits,
  known_amount     bigint,
  value_pending    boolean,
  total_count      bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 0), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  return query
  select a.award_key, a.origin, a.reference_date, a.lottery_code, a.draw_number,
         a.winning_number, a.result_conflict, a.raffle_id, a.raffle_name,
         a.raffle_short_code, a.seller_id, pr.full_name, a.ticket_id,
         a.daily_number, a.weekly_number, a.matched_number, a.numbers_changed,
         a.prize_title, a.prize_category, a.prize_digits, a.known_amount,
         a.value_pending, count(*) over () as total_count
    from prize_award_rows(
           array(select current_staff_org_ids()),
           case when p_seller_id is null then null else array[p_seller_id] end,
           p_raffle_id, null, p_from, p_to
         ) a
    left join profiles pr on pr.id = a.seller_id
   order by a.reference_date desc, a.lottery_code, a.award_key
   limit v_limit offset v_offset;
end;
$$;

comment on function admin_prize_awards(uuid, uuid, date, date, integer, integer) is
  'D-208: el historial de premios ganados de la organizacion, para el personal. Sin nombre, identificador ni ningun otro dato de cliente (BR-Q01).';

create function admin_prize_award_totals(
  p_raffle_id uuid default null,
  p_seller_id uuid default null,
  p_from      date default null,
  p_to        date default null
)
returns table (
  prizes_count        bigint,
  clients_count       bigint,
  known_amount        bigint,
  value_pending_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- `clients_count` se calcula DENTRO de la base y sale como un numero: ningun
  -- identificador de cliente cruza la frontera (respuesta del dueno).
  select
    count(*),
    count(distinct a.client_id),
    coalesce(sum(a.known_amount), 0),
    count(*) filter (where a.value_pending)
  from prize_award_rows(
         array(select current_staff_org_ids()),
         case when p_seller_id is null then null else array[p_seller_id] end,
         p_raffle_id, null, p_from, p_to
       ) a
$$;

comment on function admin_prize_award_totals(uuid, uuid, date, date) is
  'D-208: los cuatro indicadores del personal. El recuento de clientes distintos se calcula aqui y solo sale el numero.';

-- =============================================================================
-- 7. El cargador de los premios reconocidos
--
-- Por omision es una VISTA PREVIA: valida y reporta sin escribir. Con
-- `p_apply` escribe, y entera o nada: con un solo problema se niega. Es
-- idempotente —`on conflict do nothing`— asi que repetirla no duplica ni
-- reescribe.
--
-- Cada entrada de `p_awards` trae: `daily_number`, `weekly_number`,
-- `lottery_code`, `reference_date`, `prize_title`, y `amount` o
-- `in_kind_description`. La boleta y el sorteo IDENTIFICAN la coincidencia que
-- ya existe; el premio se busca por su titulo entre los de la rifa. Nada se
-- crea: si la coincidencia o el premio no existen, es un problema y se dice.
-- =============================================================================

-- El PLAN: una sola definicion de como se resuelve una entrada, que usan el
-- recuento de problemas, la escritura y el informe. Sin tablas temporales: una
-- funcion de conjunto se puede volver a llamar en la misma transaccion, y una
-- tabla temporal `on commit drop` chocaria consigo misma.
--
-- AMBIGÜEDAD. Si una entrada cuadra con MAS de una coincidencia —la misma
-- boleta con sus dos numeros en el mismo sorteo— no se elige ninguna: se
-- rechaza y se dice. Elegir una seria inventar cual gano.
create function declared_prize_award_plan(p_organization_id uuid, p_awards jsonb)
returns table (
  entry_position      integer,
  daily_number        text,
  weekly_number       text,
  lottery_code        text,
  reference_date      date,
  prize_title         text,
  amount              bigint,
  in_kind_description text,
  match_id            uuid,
  result_id           uuid,
  match_field         lottery_match_field,
  matched_number      text,
  raffle_id           uuid,
  prize_id            uuid,
  already             boolean,
  problem             text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with entrada as (
    select
      t.ord::integer                                as entry_position,
      t.e ->> 'daily_number'                        as daily_number,
      t.e ->> 'weekly_number'                       as weekly_number,
      t.e ->> 'lottery_code'                        as lottery_code,
      (nullif(t.e ->> 'reference_date', ''))::date  as reference_date,
      t.e ->> 'prize_title'                         as prize_title,
      (nullif(t.e ->> 'amount', ''))::bigint        as amount,
      nullif(t.e ->> 'in_kind_description', '')     as in_kind_description
    from jsonb_array_elements(p_awards) with ordinality as t(e, ord)
  ),
  candidata as (
    select
      i.*,
      (select count(*)
         from lottery_ticket_matches m
         join lottery_results r  on r.id = m.result_id
         join lottery_draw_schedules s on s.id = r.schedule_id
         join tickets tk on tk.id = m.ticket_id
        where m.organization_id = p_organization_id
          and m.assignment_status = 'sold'
          and s.lottery_code::text = i.lottery_code
          and s.reference_date = i.reference_date
          and tk.daily_number = i.daily_number
          and tk.weekly_number = i.weekly_number) as cuantas,
      (select m.id
         from lottery_ticket_matches m
         join lottery_results r  on r.id = m.result_id
         join lottery_draw_schedules s on s.id = r.schedule_id
         join tickets tk on tk.id = m.ticket_id
        where m.organization_id = p_organization_id
          and m.assignment_status = 'sold'
          and s.lottery_code::text = i.lottery_code
          and s.reference_date = i.reference_date
          and tk.daily_number = i.daily_number
          and tk.weekly_number = i.weekly_number
        limit 1) as match_id
    from entrada i
  ),
  resuelta as (
    select
      c.*,
      m.result_id, m.match_field, m.matched_number, m.raffle_id,
      (select p2.id
         from raffle_prizes p2
         join raffle_prize_versions v2 on v2.id = p2.current_version_id
        where p2.raffle_id = m.raffle_id
          and p2.organization_id = p_organization_id
          and v2.title = c.prize_title
        limit 1) as prize_id
    from candidata c
    left join lottery_ticket_matches m on m.id = c.match_id
  )
  select
    r.entry_position, r.daily_number, r.weekly_number, r.lottery_code, r.reference_date,
    r.prize_title, r.amount, r.in_kind_description,
    r.match_id, r.result_id, r.match_field, r.matched_number, r.raffle_id, r.prize_id,
    coalesce(
      exists (select 1 from declared_prize_awards d
               where d.match_id = r.match_id and d.prize_id = r.prize_id
                 and d.voided_at is null),
      false) as already,
    case
      when r.daily_number is null or r.weekly_number is null
        or r.lottery_code is null or r.reference_date is null
        or r.prize_title is null
        then 'Falta un dato de la entrada: hacen falta los dos números de la boleta, la lotería, la fecha de referencia y el premio.'
      when r.amount is null and r.in_kind_description is null
        then 'Hace falta el importe reconocido o lo que se entregó.'
      when r.cuantas = 0
        then 'No hay ninguna coincidencia registrada de esa boleta en ese sorteo.'
      when r.cuantas > 1
        then 'Esa boleta tiene más de una coincidencia en ese sorteo, así que no se puede saber cuál ganó.'
      when r.prize_id is null
        then 'La rifa de esa coincidencia no tiene ningún premio con ese nombre.'
      when exists (select 1 from lottery_ticket_match_prizes lp
                    where lp.match_id = r.match_id and lp.prize_id = r.prize_id)
        then 'Esa coincidencia ya tiene ese premio registrado por el sistema.'
      else null
    end as problem
  from resuelta r
  order by r.entry_position
$$;

comment on function declared_prize_award_plan(uuid, jsonb) is
  'D-208: como se resuelve cada entrada del cargador. Una sola definicion, que usan el recuento, la escritura y el informe. Interna.';

create function record_declared_prize_awards(
  p_organization_id uuid,
  p_basis           text,
  p_awards          jsonb,
  p_apply           boolean default false
)
returns table (
  daily_number        text,
  weekly_number       text,
  lottery_code        text,
  reference_date      date,
  matched_number      text,
  prize_title         text,
  amount              bigint,
  in_kind_description text,
  outcome             text,
  problem             text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total    integer;
  v_problems integer;
  -- Lo que YA estaba, capturado ANTES de escribir: despues de insertar, el plan
  -- diria que todo «ya estaba» y el informe mentiria sobre lo que hizo.
  v_previos  text[];
begin
  if p_organization_id is null then
    raise exception 'Hace falta la organización.';
  end if;
  if p_basis is null or char_length(btrim(p_basis)) < 10 then
    raise exception 'Hace falta el respaldo de negocio de este reconocimiento.';
  end if;
  if jsonb_typeof(p_awards) <> 'array' or jsonb_array_length(p_awards) = 0 then
    raise exception 'Hace falta al menos un premio que reconocer.';
  end if;
  if jsonb_array_length(p_awards) > 100 then
    raise exception 'No se pueden reconocer más de 100 premios a la vez.';
  end if;

  select count(*), count(*) filter (where pl.problem is not null),
         coalesce(array_agg(pl.match_id::text || ':' || pl.prize_id::text)
                  filter (where pl.already), '{}')
    into v_total, v_problems, v_previos
    from declared_prize_award_plan(p_organization_id, p_awards) pl;

  -- Entera o nada: con un solo problema no se escribe nada (el patron de la
  -- transicion, D-204).
  if p_apply and v_problems > 0 then
    raise exception 'No se reconoció ningún premio: % de las % entradas tienen un problema.',
      v_problems, v_total
      using errcode = 'check_violation';
  end if;

  if p_apply then
    insert into declared_prize_awards (
      organization_id, raffle_id, result_id, match_id, match_field,
      prize_id, declared_title, amount, in_kind_description, basis
    )
    select p_organization_id, pl.raffle_id, pl.result_id, pl.match_id, pl.match_field,
           pl.prize_id, pl.prize_title, pl.amount, pl.in_kind_description, btrim(p_basis)
      from declared_prize_award_plan(p_organization_id, p_awards) pl
     where pl.problem is null and not pl.already
    on conflict (match_id, prize_id) do nothing;

    perform write_audit_log(
      p_organization_id,
      'prize_award.record',
      'declared_prize_award',
      null,
      null,
      jsonb_build_object('entradas', v_total, 'respaldo', btrim(p_basis))
    );
  end if;

  return query
  select pl.daily_number, pl.weekly_number, pl.lottery_code, pl.reference_date,
         pl.matched_number, pl.prize_title, pl.amount, pl.in_kind_description,
         case
           when pl.problem is not null then 'rechazado'
           when (pl.match_id::text || ':' || pl.prize_id::text) = any (v_previos)
             then 'ya estaba'
           when p_apply then 'reconocido'
           else 'se reconocería'
         end,
         pl.problem
    from declared_prize_award_plan(p_organization_id, p_awards) pl
   order by pl.entry_position;
end;
$$;

comment on function record_declared_prize_awards(uuid, text, jsonb, boolean) is
  'D-208: reconoce premios del negocio sobre coincidencias existentes. Por omision es vista previa; con p_apply escribe, entera o nada e idempotente. Solo la service role.';

-- =============================================================================
-- 8. Privilegios explicitos, uno por funcion (D-207, I-132)
--
-- En el proyecto alojado toda funcion nueva de `public` nace ejecutable por
-- `service_role`; en la pila local no. Ninguna se queda sin decir quien la
-- ejecuta, y `scripts/prize-function-grants.ts` repite esta misma lista para
-- que `verify:remote` y la prueba de base de datos la comprueben.
-- =============================================================================

-- Las dos lecturas del vendedor y las dos del personal: una sesion, nunca la
-- service role ni `anon`.
revoke execute on function seller_prize_awards(uuid, uuid, date, date, integer, integer)
  from public, anon, service_role;
grant  execute on function seller_prize_awards(uuid, uuid, date, date, integer, integer)
  to authenticated;

revoke execute on function seller_prize_award_totals(uuid, uuid, date, date)
  from public, anon, service_role;
grant  execute on function seller_prize_award_totals(uuid, uuid, date, date)
  to authenticated;

revoke execute on function admin_prize_awards(uuid, uuid, date, date, integer, integer)
  from public, anon, service_role;
grant  execute on function admin_prize_awards(uuid, uuid, date, date, integer, integer)
  to authenticated;

revoke execute on function admin_prize_award_totals(uuid, uuid, date, date)
  from public, anon, service_role;
grant  execute on function admin_prize_award_totals(uuid, uuid, date, date)
  to authenticated;

-- El cargador: solo la service role, como la transicion (D-204, D-207).
revoke execute on function record_declared_prize_awards(uuid, text, jsonb, boolean)
  from public, anon, authenticated;
grant  execute on function record_declared_prize_awards(uuid, text, jsonb, boolean)
  to service_role;

-- Internas: no las ejecuta NADIE directamente. Las siguen usando las funciones
-- `SECURITY DEFINER` que las llaman y sus disparadores.
revoke execute on function prize_award_rows(uuid[], uuid[], uuid, uuid, date, date)
  from public, anon, authenticated, service_role;
revoke execute on function declared_prize_award_plan(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function declared_prize_awards_check()
  from public, anon, authenticated, service_role;
revoke execute on function declared_prize_awards_immutable()
  from public, anon, authenticated, service_role;
revoke execute on function tickets_guard_matched_numbers()
  from public, anon, authenticated, service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   drop function record_declared_prize_awards(uuid, text, jsonb, boolean);
--   drop function declared_prize_award_plan(uuid, jsonb);
--   drop function admin_prize_award_totals(uuid, uuid, date, date);
--   drop function admin_prize_awards(uuid, uuid, date, date, integer, integer);
--   drop function seller_prize_award_totals(uuid, uuid, date, date);
--   drop function seller_prize_awards(uuid, uuid, date, date, integer, integer);
--   drop function prize_award_rows(uuid[], uuid[], uuid, uuid, date, date);
--   drop trigger tickets_guard_matched_numbers_deferred on tickets;
--   drop trigger tickets_guard_matched_numbers on tickets;
--   drop function tickets_guard_matched_numbers();
--   drop table declared_prize_awards;
--   drop function declared_prize_awards_immutable();
--   drop function declared_prize_awards_check();
--
-- Los reconocimientos ya escritos se PIERDEN si se borra la tabla: antes de
-- revertir, exportarlos.
-- =============================================================================
