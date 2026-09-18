-- =============================================================================
-- 0068_prize_award_history_fixes.sql
-- Historial de premios ganados — correccion de la Etapa 1
--
-- Referencia normativa: docs/DECISIONS.md D-208 (§«Correccion de la Etapa 1»),
-- D-206 (la frontera), D-198 (la cartera es del vendedor), D-207 (privilegios);
-- docs/BUSINESS_RULES.md BR-J17..BR-J23, BR-I16, BR-Q01, BR-Q02;
-- docs/KNOWN_ISSUES.md I-133, I-134, I-136, I-137.
--
-- La `0067` ya se aplico en local y NO se reescribe (AGENTS.md): esta es su
-- correccion, con el siguiente numero libre.
--
-- QUE CORRIGE, Y CADA COSA ESTA REPRODUCIDA ANTES DE TOCARLA
--
-- 1. UN SOLO RECONOCIMIENTO VIGENTE, Y LA HISTORIA SE CONSERVA. La unicidad de
--    `(match_id, prize_id)` contaba tambien los anulados, asi que anular y
--    volver a registrar era imposible —lo contrario de lo que decia I-136—.
--    Pasa a ser un indice unico PARCIAL, `where voided_at is null`: solo un
--    reconocimiento vigente por coincidencia y premio, y todas las anulaciones
--    y sustituciones se quedan en la tabla.
--
-- 2. EL CARGADOR DICE LO QUE DE VERDAD QUEDO GUARDADO. Antes componia el
--    informe con los datos de ENTRADA y usaba `on conflict do nothing`, asi que
--    ante un reconocimiento vigente con OTRO importe respondia «ya estaba» con
--    el importe pedido y no con el almacenado. Ahora:
--
--      * una peticion incompatible con lo vigente —otro importe u otra especie—
--        es un PROBLEMA con su frase, y con `p_apply` no se escribe nada;
--      * un reintento identico responde «ya estaba» y no reescribe;
--      * el informe sale de las filas ALMACENADAS, no de la entrada;
--      * un duplicado DENTRO de la misma peticion se rechaza;
--      * la vista previa anticipa lo que la aplicacion va a comprobar: el modo
--        del sorteo, los limites del importe y la AMBIGÜEDAD al resolver el
--        premio por su titulo;
--      * dos ejecuciones a la vez se serializan con un cerrojo por
--        organizacion, asi que la segunda ve lo que escribio la primera.
--
-- 3. EL ROL, NO SOLO EL PERFIL. `seller_prize_awards` y
--    `seller_prize_award_totals` filtraban por organizacion activa y por
--    `current_profile_id()`, pero NO exigian rol `seller`: una persona que
--    vendia y pasa a Administrador conservaba el identificador de sus
--    coincidencias y seguia recibiendo nombre e identificador de clientes, que
--    es exactamente lo que BR-Q01 prohibe. Se exige el rol, en la base.
--
--    Y EL MISMO HUECO EXISTE ANTES DE ESTE ENCARGO (I-137): la politica
--    `lottery_ticket_matches_select` de `0057` tampoco pide el rol. Se corrige
--    aqui porque ACOTA —nadie gana acceso— y porque su unico consumidor es el
--    portal del vendedor (`getTicketDetail` y la rama `seller` del recuadro de
--    loterias); el personal ya va por `admin_lottery_matches`.
--
-- 4. `numbers_changed` MIRA EL CAMPO FOTOGRAFIADO. Comparaba contra los dos
--    numeros de la boleta, asi que mover el numero viejo al otro campo
--    escondia la discrepancia. Ahora compara contra el numero que dice
--    `match_field`.
--
-- 5. EL ORIGEN DECLARADO NO PRESENTA LAS CONDICIONES DE HOY COMO HISTORICAS.
--    `prize_category` y `prize_digits` salian de la version VIGENTE del premio,
--    que nadie aplico a ese sorteo. Pasan a NULL para el declarado, y en su
--    lugar viaja lo que SI esta respaldado: el titulo declarado y su recompensa.
--
-- 6. UNA FOTOGRAFIA NO PUEDE QUEDAR INCOHERENTE. Reproducido con dos
--    conexiones: una edicion de numeros y el motor pueden confirmar las dos y
--    dejar la boleta con un numero y la fotografia con otro (I-134). La clave
--    ajena solo hace ESPERAR al motor; no impide nada. Un disparador de
--    restriccion DIFERIDO sobre `lottery_ticket_matches` exige, al COMMIT, que
--    `matched_number` sea el numero de la boleta en `match_field`.
--
-- 7. EL INICIO OPERATIVO SE GARANTIZA EN LA BASE, no con un filtro de la URL:
--    `prize_award_history_start()` es el suelo del historial, y
--    `prize_award_coverage()` dice qué tramo esta pendiente de informacion sin
--    depender de ningun parametro del navegador.
--
-- QUE NO HACE
--
--   * No reescribe la `0067`.
--   * No toca el cuerpo de `match_lottery_result`: la defensa de la fotografia
--     es un disparador sobre su tabla, no un cambio en el motor.
--   * No crea ninguna pantalla ni interfaz de correccion.
--   * No amplia el acceso de nadie: las dos politicas que toca lo ACOTAN.
--   * No reprocesa resultados, no toca abonos, saldos, precios ni comisiones.
--
-- SOBRE LAS TILDES. Las frases NUEVAS que puede leer una persona van
-- acentuadas; los comentarios siguen sin tildes. I-030 no se toca aqui.
-- =============================================================================

-- =============================================================================
-- 1. Un solo reconocimiento VIGENTE por coincidencia y premio
-- =============================================================================

alter table declared_prize_awards
  drop constraint declared_prize_awards_match_prize_key;

create unique index declared_prize_awards_live_key
  on declared_prize_awards (match_id, prize_id)
  where voided_at is null;

comment on index declared_prize_awards_live_key is
  'D-208: un solo reconocimiento VIGENTE por coincidencia y premio. Los anulados se quedan, asi que anular y volver a registrar es posible (I-136).';

-- =============================================================================
-- 2. El alcance del vendedor, con su rol
--
-- La forma de conjunto, igual que `current_staff_org_ids()` (0014): asi se usa
-- como subselect y se evalua una sola vez por consulta (D-063).
-- =============================================================================

create function current_seller_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.organization_id
  from memberships m
  join profiles p on p.id = m.profile_id
  join organizations o on o.id = m.organization_id
  where m.profile_id = auth.uid()
    and m.role = 'seller'
    and m.is_active and p.is_active and o.is_active
$$;

comment on function current_seller_org_ids() is
  'Organizaciones donde el usuario actual es vendedor ACTIVO. Quien dejo de serlo —o paso a Administrador— no obtiene ninguna (D-208, I-137).';

revoke execute on function current_seller_org_ids() from public;
grant execute on function current_seller_org_ids() to authenticated;

-- =============================================================================
-- 3. Las dos politicas que pedian perfil y ahora piden tambien rol
--
-- Las dos ACOTAN: nadie gana acceso. Quien vendia y hoy es Dueño o
-- Administrador deja de leer por estas vias las coincidencias que dejo atras, y
-- pasa a ver lo que le corresponde por `admin_lottery_matches` y
-- `admin_prize_awards`, sin un solo dato de cliente (BR-Q01).
-- =============================================================================

-- El antecedente de 0057 (I-137). Su unico consumidor es el portal del
-- vendedor: `getTicketDetail` cuenta las coincidencias de SU boleta y el
-- recuadro de loterias lee las suyas; el personal va por `admin_lottery_matches`.
drop policy lottery_ticket_matches_select on lottery_ticket_matches;
create policy lottery_ticket_matches_select on lottery_ticket_matches
for select to authenticated
using (
  organization_id in (select current_seller_org_ids())
  and seller_id = (select current_profile_id())
);

-- El acceso NUEVO de la 0067.
drop policy declared_prize_awards_select on declared_prize_awards;
create policy declared_prize_awards_select on declared_prize_awards
for select to authenticated
using (
  organization_id in (select current_seller_org_ids())
  and exists (
    select 1
    from lottery_ticket_matches m
    where m.id = declared_prize_awards.match_id
  )
);

-- =============================================================================
-- 4. La fotografia no puede quedar con un numero que la boleta ya no tiene
--
-- POR QUE UN DISPARADOR DIFERIDO Y NO UN CAMBIO EN EL MOTOR. La intercalacion
-- que deja una fotografia incoherente es esta, y esta reproducida:
--
--   T1  begin; cambia el numero        (el disparador de `tickets` pasa: aun no
--                                       hay fotografia)
--   T2  begin; corre el motor          (lee el numero VIEJO; su INSERT espera
--                                       por la clave ajena de la boleta)
--   T1  commit                         (el diferido de `tickets` no ve fotografia)
--   T2  commit                         (la fotografia entra con el numero viejo)
--
-- La clave ajena solo hace ESPERAR a T2; no impide nada. Lo que cierra la
-- carrera es comprobar la coherencia al COMMIT de T2, cuando el numero nuevo ya
-- esta confirmado. Se hace sobre `lottery_ticket_matches` —la tabla— y no
-- dentro de `match_lottery_result`, que no se toca: asi las reglas de
-- elegibilidad, la prioridad por cliente y las versiones historicas se quedan
-- exactamente como estan.
--
-- LA INVARIANTE ES EXACTA. Las dos ramas del motor guardan en `matched_number`
-- el numero de la BOLETA en el campo fotografiado —la heredada, `t.weekly_number`
-- para Boyaca y `t.daily_number` para las demas; la configurable, el que dice la
-- version—, tambien cuando el premio compara las tres ultimas cifras. Asi que
-- cualquier escritura legitima la cumple, y solo la incumple una fotografia que
-- se quedo con un numero viejo.
--
-- CONSECUENCIA. En esa carrera el motor FALLA al confirmar y no escribe nada,
-- que es lo que ya hace ante un conflicto de configuracion (D-203). El
-- sincronizador lo reintenta; para entonces el numero esta asentado y, en cuanto
-- exista la fotografia, BR-I16 impide volver a cambiarlo.
-- =============================================================================

create function lottery_ticket_matches_number_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actual text;
begin
  select case when new.match_field = 'weekly_number' then t.weekly_number
              else t.daily_number end
    into v_actual
    from tickets t
   where t.id = new.ticket_id;

  if v_actual is distinct from new.matched_number then
    raise exception 'Los números de la boleta cambiaron mientras se buscaban las coincidencias de este sorteo. No se guardó ninguna.'
      using errcode = 'check_violation',
            detail = format('boleta %s; campo %s; fotografiado %s; ahora %s',
                            new.ticket_id, new.match_field, new.matched_number,
                            coalesce(v_actual, '(sin número)'));
  end if;

  return null;
end;
$$;

comment on function lottery_ticket_matches_number_check() is
  'I-134: al COMMIT, matched_number tiene que ser el numero de la boleta en match_field. Cierra la carrera entre una edicion de numeros y el motor sin tocar el motor.';

create constraint trigger lottery_ticket_matches_number_check
  after insert on lottery_ticket_matches
  deferrable initially deferred
  for each row execute function lottery_ticket_matches_number_check();

revoke execute on function lottery_ticket_matches_number_check()
  from public, anon, authenticated, service_role;

-- =============================================================================
-- 5. El inicio operativo, en la base, y la cobertura pendiente
--
-- BR-J22: el historial empieza en el inicio operativo de la plataforma en
-- produccion, verificado el 2026-09-17 sobre el proyecto real. Es un SUELO de
-- la lectura, no un filtro: un `p_from` anterior no saca ni una fila mas.
--
-- Hoy la plataforma opera UNA organizacion (D-088). Si algun dia entra otra con
-- su propio arranque, esto pasa a ser un dato por organizacion; mientras tanto,
-- una constante con su regla al lado es mas honesto que una tabla vacia.
-- =============================================================================

create function prize_award_history_start()
returns date
language sql
immutable
as $$
  select date '2026-08-09'
$$;

comment on function prize_award_history_start() is
  'BR-J22: inicio operativo de la plataforma en produccion, verificado (D-208 §0). Suelo del historial de premios ganados.';

-- La cobertura pendiente de informacion: sorteos de las rifas de la
-- organizacion que YA se jugaron, desde el inicio operativo, y que no tienen
-- resultado confirmado. Sin ellos no puede existir ninguna coincidencia, asi
-- que el historial no puede decir «cero premios» de ese tramo (BR-J22).
--
-- No es cartera y no depende de ningun parametro del navegador: el alcance sale
-- de la sesion, y la lee cualquier miembro activo.
create function prize_award_coverage()
returns table (
  history_start   date,
  pending_draws   integer,
  pending_from    date,
  pending_to      date,
  covered_from    date,
  covered_to      date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ventana as (
    select distinct s.id, s.reference_date,
           exists (select 1 from lottery_results r
                    where r.schedule_id = s.id and r.validation_status = 'confirmed') as confirmado
      from lottery_draw_schedules s
      join raffles ra on s.reference_date between ra.start_date and ra.end_date
     where ra.organization_id in (select current_org_ids())
       and s.reference_date >= prize_award_history_start()
       and s.official_scheduled_at < now()
  )
  select prize_award_history_start(),
         count(*) filter (where not confirmado)::integer,
         min(reference_date) filter (where not confirmado),
         max(reference_date) filter (where not confirmado),
         min(reference_date) filter (where confirmado),
         max(reference_date) filter (where confirmado)
    from ventana
$$;

comment on function prize_award_coverage() is
  'BR-J22: qué tramo del historial esta pendiente de informacion —sorteos jugados sin resultado confirmado desde el inicio operativo— y qué tramo esta cubierto. El alcance sale de la sesion.';

revoke execute on function prize_award_coverage() from public, anon, service_role;
grant  execute on function prize_award_coverage() to authenticated;

revoke execute on function prize_award_history_start() from public, anon, service_role;
grant  execute on function prize_award_history_start() to authenticated;

-- =============================================================================
-- 6. Las lecturas, rehechas
--
-- Se retiran en orden de dependencia y se vuelven a crear. Cambian el TIPO DE
-- RETORNO —no la firma—, asi que la lista de privilegios de
-- `scripts/prize-function-grants.ts` sigue diciendo lo mismo de ellas.
-- =============================================================================

drop function record_declared_prize_awards(uuid, text, jsonb, boolean);
drop function declared_prize_award_plan(uuid, jsonb);
drop function admin_prize_award_totals(uuid, uuid, date, date);
drop function admin_prize_awards(uuid, uuid, date, date, integer, integer);
drop function seller_prize_award_totals(uuid, uuid, date, date);
drop function seller_prize_awards(uuid, uuid, date, date, integer, integer);
drop function prize_award_rows(uuid[], uuid[], uuid, uuid, date, date);

-- QUE ESTA RESPALDADO POR QUE, y por eso el tipo lo distingue:
--
--   * La FOTOGRAFIA respalda organizacion, rifa, vendedor, cliente, campo y
--     numero fotografiado, y el estado de la venta al instante del sorteo.
--   * La VERSION aplicada respalda, SOLO en el origen del motor, el titulo, la
--     categoria, las cifras y la recompensa con sus alternativas.
--   * La DECLARACION respalda, en el origen reconocido, el titulo declarado y
--     su recompensa. NO respalda categoria ni cifras: a ese sorteo no le aplico
--     ninguna version, y las de hoy no son las de entonces. Van en NULL.
--   * La boleta y el cliente de HOY solo dan los dos numeros actuales y el
--     nombre, que la lectura no presenta como historicos; `numbers_changed`
--     avisa cuando el numero fotografiado ya no es el de la boleta.
--
-- LAS ALTERNATIVAS NO MULTIPLICAN FILAS: `reward_options` es un jsonb ordenado
-- que se arma en una subconsulta escalar.
create function prize_award_rows(
  p_org_ids    uuid[],
  p_seller_ids uuid[] default null,
  p_raffle_id  uuid default null,
  p_client_id  uuid default null,
  p_from       date default null,
  p_to         date default null
)
returns table (
  award_key         text,
  origin            text,
  match_id          uuid,
  organization_id   uuid,
  raffle_id         uuid,
  raffle_name       text,
  raffle_short_code text,
  seller_id         uuid,
  client_id         uuid,
  ticket_id         uuid,
  daily_number      text,
  weekly_number     text,
  match_field       lottery_match_field,
  matched_number    text,
  numbers_changed   boolean,
  result_id         uuid,
  reference_date    date,
  lottery_code      lottery_code,
  draw_number       text,
  winning_number    text,
  result_conflict   boolean,
  prize_id          uuid,
  prize_title       text,
  prize_category    raffle_prize_category,
  prize_digits      raffle_prize_digits,
  prize_version_id  uuid,
  reward_mode       raffle_prize_reward_mode,
  reward_options    jsonb,
  known_amount      bigint,
  value_pending     boolean,
  awarded_at        timestamptz
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
    (m.matched_number is distinct from
       case when m.match_field = 'weekly_number' then t.weekly_number
            else t.daily_number end),
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
    v.reward_mode,
    (select jsonb_agg(jsonb_build_object(
              'position', o.position, 'description', o.description, 'amount', o.amount)
            order by o.position)
       from raffle_prize_reward_options o where o.version_id = v.id),
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
    and s.reference_date >= prize_award_history_start()
    and (p_seller_ids is null or m.seller_id = any (p_seller_ids))
    and (p_raffle_id is null or m.raffle_id = p_raffle_id)
    and (p_client_id is null or m.client_id = p_client_id)
    and (p_from is null or s.reference_date >= p_from)
    and (p_to   is null or s.reference_date <= p_to)

  union all

  -- Los premios que reconoce el NEGOCIO. Sin version: ni categoria ni cifras,
  -- porque a su sorteo no le aplico ninguna y las de hoy no son las de entonces.
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
    (m.matched_number is distinct from
       case when m.match_field = 'weekly_number' then t.weekly_number
            else t.daily_number end),
    r.id,
    s.reference_date,
    s.lottery_code,
    s.draw_number,
    r.winning_number,
    (r.validation_status <> 'confirmed'),
    d.prize_id,
    d.declared_title,
    null::raffle_prize_category,
    null::raffle_prize_digits,
    null::uuid,
    null::raffle_prize_reward_mode,
    jsonb_build_array(jsonb_build_object(
      'position', 1, 'description', d.in_kind_description, 'amount', d.amount)),
    d.amount,
    (d.in_kind_description is not null),
    d.recorded_at
  from declared_prize_awards d
  join lottery_ticket_matches m on m.id = d.match_id
  join raffles ra on ra.id = m.raffle_id
  join tickets t on t.id = m.ticket_id
  join lottery_results r on r.id = m.result_id
  join lottery_draw_schedules s on s.id = r.schedule_id
  where d.voided_at is null
    and m.assignment_status = 'sold'
    and m.organization_id = any (p_org_ids)
    and s.reference_date >= prize_award_history_start()
    and (p_seller_ids is null or m.seller_id = any (p_seller_ids))
    and (p_raffle_id is null or m.raffle_id = p_raffle_id)
    and (p_client_id is null or m.client_id = p_client_id)
    and (p_from is null or s.reference_date >= p_from)
    and (p_to   is null or s.reference_date <= p_to)
$$;

comment on function prize_award_rows(uuid[], uuid[], uuid, uuid, date, date) is
  'D-208: la UNICA definicion de que es un premio ganado. El origen del motor trae su VERSION historica; el declarado, su declaracion, y ni categoria ni cifras. Suelo en prize_award_history_start(). Interna.';

-- -----------------------------------------------------------------------------
-- El vendedor. Ahora exige rol `seller` ACTIVO: quien paso a Administrador no
-- obtiene ninguna fila, aunque sus coincidencias sigan teniendo su
-- identificador (I-137).
-- -----------------------------------------------------------------------------
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
  match_field      lottery_match_field,
  matched_number   text,
  numbers_changed  boolean,
  client_id        uuid,
  client_name      text,
  prize_title      text,
  prize_category   raffle_prize_category,
  prize_digits     raffle_prize_digits,
  reward_mode      raffle_prize_reward_mode,
  reward_options   jsonb,
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
         a.ticket_id, a.daily_number, a.weekly_number, a.match_field, a.matched_number,
         a.numbers_changed, a.client_id, c.name, a.prize_title, a.prize_category,
         a.prize_digits, a.reward_mode, a.reward_options, a.known_amount, a.value_pending,
         count(*) over () as total_count
    from prize_award_rows(
           array(select current_seller_org_ids()),
           array[(select current_profile_id())],
           p_raffle_id, p_client_id, p_from, p_to
         ) a
    left join clients c on c.id = a.client_id
   order by a.reference_date desc, a.lottery_code, a.award_key
   limit v_limit offset v_offset;
end;
$$;

comment on function seller_prize_awards(uuid, uuid, date, date, integer, integer) is
  'D-208: el historial de premios ganados del vendedor de la sesion. Exige rol seller ACTIVO y solo sus coincidencias: tener equipo no concede ninguna mas.';

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
         array(select current_seller_org_ids()),
         array[(select current_profile_id())],
         p_raffle_id, p_client_id, p_from, p_to
       ) a
$$;

comment on function seller_prize_award_totals(uuid, uuid, date, date) is
  'D-208: los cuatro indicadores del vendedor, sobre TODO el filtro. Exige rol seller ACTIVO.';

-- -----------------------------------------------------------------------------
-- El personal. Ni un campo de cliente en el tipo de retorno.
-- -----------------------------------------------------------------------------
create function admin_prize_awards(
  p_raffle_id uuid default null,
  p_seller_id uuid default null,
  p_from      date default null,
  p_to        date default null,
  p_limit     integer default 25,
  p_offset    integer default 0
)
returns table (
  award_key         text,
  origin            text,
  reference_date    date,
  lottery_code      lottery_code,
  draw_number       text,
  winning_number    text,
  result_conflict   boolean,
  raffle_id         uuid,
  raffle_name       text,
  raffle_short_code text,
  seller_id         uuid,
  seller_name       text,
  ticket_id         uuid,
  daily_number      text,
  weekly_number     text,
  match_field       lottery_match_field,
  matched_number    text,
  numbers_changed   boolean,
  prize_title       text,
  prize_category    raffle_prize_category,
  prize_digits      raffle_prize_digits,
  reward_mode       raffle_prize_reward_mode,
  reward_options    jsonb,
  known_amount      bigint,
  value_pending     boolean,
  total_count       bigint
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
         a.daily_number, a.weekly_number, a.match_field, a.matched_number,
         a.numbers_changed, a.prize_title, a.prize_category, a.prize_digits,
         a.reward_mode, a.reward_options, a.known_amount, a.value_pending,
         count(*) over () as total_count
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
  -- identificador de cliente cruza la frontera.
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
-- 7. El cargador, rehecho
--
-- El PLAN resuelve cada entrada y dice, para cada una, qué hay guardado hoy:
-- `stored_id`, `stored_amount` y `stored_in_kind` del reconocimiento VIGENTE.
-- Con eso el informe puede hablar de lo almacenado y no de la entrada, y la
-- discrepancia deja de disfrazarse de «ya estaba».
-- =============================================================================

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
  stored_id           uuid,
  stored_amount       bigint,
  stored_in_kind      text,
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
  -- Un duplicado DENTRO de la peticion: la misma boleta, el mismo sorteo y el
  -- mismo premio dos veces. Se marca la segunda y las siguientes.
  numerada as (
    select i.*,
           row_number() over (
             partition by i.daily_number, i.weekly_number, i.lottery_code,
                          i.reference_date, i.prize_title
             order by i.entry_position
           ) as repeticion
      from entrada i
  ),
  candidata as (
    select
      n.*,
      (select count(*)
         from lottery_ticket_matches m
         join lottery_results r  on r.id = m.result_id
         join lottery_draw_schedules s on s.id = r.schedule_id
         join tickets tk on tk.id = m.ticket_id
        where m.organization_id = p_organization_id
          and m.assignment_status = 'sold'
          and s.lottery_code::text = n.lottery_code
          and s.reference_date = n.reference_date
          and tk.daily_number = n.daily_number
          and tk.weekly_number = n.weekly_number) as coincidencias,
      (select m.id
         from lottery_ticket_matches m
         join lottery_results r  on r.id = m.result_id
         join lottery_draw_schedules s on s.id = r.schedule_id
         join tickets tk on tk.id = m.ticket_id
        where m.organization_id = p_organization_id
          and m.assignment_status = 'sold'
          and s.lottery_code::text = n.lottery_code
          and s.reference_date = n.reference_date
          and tk.daily_number = n.daily_number
          and tk.weekly_number = n.weekly_number
        limit 1) as match_id
    from numerada n
  ),
  resuelta as (
    select
      c.*,
      m.result_id, m.match_field, m.matched_number, m.raffle_id,
      -- La AMBIGÜEDAD importa: dos premios de la misma rifa pueden llamarse
      -- igual, y entonces no se elige ninguno.
      -- Solo los premios VIGENTES son candidatos: uno archivado ya no aplica a
      -- nada, y contarlo convertiria en ambiguo lo que no lo es.
      (select count(*)
         from raffle_prizes p2
         join raffle_prize_versions v2 on v2.id = p2.current_version_id
        where p2.raffle_id = m.raffle_id
          and p2.organization_id = p_organization_id
          and p2.status = 'active'
          and v2.title = c.prize_title) as premios_con_ese_titulo,
      (select p2.id
         from raffle_prizes p2
         join raffle_prize_versions v2 on v2.id = p2.current_version_id
        where p2.raffle_id = m.raffle_id
          and p2.organization_id = p_organization_id
          and p2.status = 'active'
          and v2.title = c.prize_title
        limit 1) as prize_id,
      -- El modo del sorteo, que es lo que el disparador va a comprobar.
      (select raffle_prize_draw_mode(m.raffle_id, s2)
         from lottery_draw_schedules s2
         join lottery_results r2 on r2.schedule_id = s2.id
        where r2.id = m.result_id) as modo
    from candidata c
    left join lottery_ticket_matches m on m.id = c.match_id
  ),
  guardada as (
    select r.*,
           d.id     as stored_id,
           d.amount as stored_amount,
           d.in_kind_description as stored_in_kind
      from resuelta r
      left join declared_prize_awards d
        on d.match_id = r.match_id and d.prize_id = r.prize_id and d.voided_at is null
  )
  select
    g.entry_position, g.daily_number, g.weekly_number, g.lottery_code, g.reference_date,
    g.prize_title, g.amount, g.in_kind_description,
    g.match_id, g.result_id, g.match_field, g.matched_number, g.raffle_id, g.prize_id,
    g.stored_id, g.stored_amount, g.stored_in_kind,
    (g.stored_id is not null) as already,
    case
      when g.daily_number is null or g.weekly_number is null
        or g.lottery_code is null or g.reference_date is null
        or g.prize_title is null
        then 'Falta un dato de la entrada: hacen falta los dos números de la boleta, la lotería, la fecha de referencia y el premio.'
      when g.amount is null and g.in_kind_description is null
        then 'Hace falta el importe reconocido o lo que se ganó.'
      when g.amount is not null and (g.amount < 1 or g.amount > 10000000000)
        then 'El importe reconocido tiene que estar entre $1 y $10.000.000.000.'
      when g.in_kind_description is not null
           and char_length(btrim(g.in_kind_description)) not between 2 and 160
        then 'Lo que se ganó se describe con 2 a 160 caracteres.'
      when char_length(btrim(g.prize_title)) not between 2 and 80
        then 'El nombre del premio tiene entre 2 y 80 caracteres.'
      when g.repeticion > 1
        then 'Esa misma boleta, ese sorteo y ese premio ya vienen en otra entrada de esta petición.'
      when g.coincidencias = 0
        then 'No hay ninguna coincidencia registrada de esa boleta en ese sorteo.'
      when g.coincidencias > 1
        then 'Esa boleta tiene más de una coincidencia en ese sorteo, así que no se puede saber cuál ganó.'
      when g.reference_date < prize_award_history_start()
        then 'Ese sorteo es anterior al inicio operativo de la plataforma, así que queda fuera del historial.'
      when g.premios_con_ese_titulo = 0
        then 'La rifa de esa coincidencia no tiene ningún premio con ese nombre.'
      when g.premios_con_ese_titulo > 1
        then 'La rifa tiene más de un premio con ese nombre, así que no se puede saber cuál es.'
      when g.modo is distinct from 'legacy'
        then 'Ese sorteo se resuelve con los premios configurables de la rifa, así que su premio lo registra el sistema y no se puede reconocer a mano.'
      when exists (select 1 from lottery_ticket_match_prizes lp
                    where lp.match_id = g.match_id and lp.prize_id = g.prize_id)
        then 'Esa coincidencia ya tiene ese premio registrado por el sistema.'
      -- Lo vigente y lo pedido tienen que coincidir: si no, se dice, y no se
      -- aparenta haber aplicado otro importe.
      when g.stored_id is not null
           and (g.stored_amount is distinct from g.amount
                or g.stored_in_kind is distinct from g.in_kind_description)
        then format(
               'Ese premio ya está reconocido con %s y la petición trae %s. Anúlalo antes de registrar otro.',
               coalesce('$' || to_char(g.stored_amount, 'FM999G999G999G999'), 'otra recompensa'),
               coalesce('$' || to_char(g.amount, 'FM999G999G999G999'), 'otra recompensa'))
      else null
    end as problem
  from guardada g
  order by g.entry_position
$$;

comment on function declared_prize_award_plan(uuid, jsonb) is
  'D-208: como se resuelve cada entrada del cargador, con lo que YA esta guardado. Anticipa modo del sorteo, limites, ambigüedad por titulo, duplicado interno y discrepancia. Interna.';

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
  v_previos  uuid[];
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

  -- DOS EJECUCIONES A LA VEZ SE SERIALIZAN. Sin esto, las dos leen el plan
  -- antes de que la otra escriba y las dos creen estar reconociendo: una
  -- terminaria chocando con el indice unico y la otra informaria de algo que no
  -- ocurrio. El cerrojo es por organizacion porque el cargador es una operacion
  -- rara y deliberada, no un camino de la aplicacion.
  if p_apply then
    perform pg_advisory_xact_lock(hashtext('declared_prize_awards:' || p_organization_id::text));
  end if;

  select count(*), count(*) filter (where pl.problem is not null),
         coalesce(array_agg(pl.stored_id) filter (where pl.stored_id is not null), '{}')
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
           pl.prize_id, btrim(pl.prize_title), pl.amount, btrim(pl.in_kind_description),
           btrim(p_basis)
      from declared_prize_award_plan(p_organization_id, p_awards) pl
     where pl.problem is null and not pl.already;

    perform write_audit_log(
      p_organization_id,
      'prize_award.record',
      'declared_prize_award',
      null,
      null,
      jsonb_build_object('entradas', v_total, 'respaldo', btrim(p_basis))
    );
  end if;

  -- EL INFORME SALE DE LO ALMACENADO CUANDO HAY ALGO ALMACENADO. Se vuelve a
  -- pedir el plan —ya con las filas nuevas escritas— y, si existe la fila, el
  -- importe y la especie se leen de ELLA y no de la entrada: asi «reconocido» y
  -- «ya estaba» dicen lo que de verdad hay. En una vista previa todavia no hay
  -- fila, y entonces se muestra lo que se escribiria, que es lo que el propio
  -- «se reconocería» anuncia.
  return query
  select pl.daily_number, pl.weekly_number, pl.lottery_code, pl.reference_date,
         pl.matched_number, pl.prize_title,
         case when pl.stored_id is not null then pl.stored_amount else pl.amount end,
         case when pl.stored_id is not null then pl.stored_in_kind else pl.in_kind_description end,
         case
           when pl.problem is not null then 'rechazado'
           when pl.stored_id = any (v_previos) then 'ya estaba'
           when p_apply and pl.stored_id is not null then 'reconocido'
           when p_apply then 'no se escribió'
           else 'se reconocería'
         end,
         pl.problem
    from declared_prize_award_plan(p_organization_id, p_awards) pl
   order by pl.entry_position;
end;
$$;

comment on function record_declared_prize_awards(uuid, text, jsonb, boolean) is
  'D-208: reconoce premios del negocio sobre coincidencias existentes. Vista previa por omision; con p_apply escribe, entera o nada, idempotente y serializada. El informe sale de lo ALMACENADO. Solo la service role.';

-- =============================================================================
-- 8. Privilegios explicitos (D-207, I-132)
--
-- Las funciones que se recrearon pierden sus privilegios al retirarlas, asi que
-- se vuelven a declarar enteros. Las firmas no cambian: lo que cambio son los
-- tipos de retorno y los cuerpos.
-- =============================================================================

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

revoke execute on function record_declared_prize_awards(uuid, text, jsonb, boolean)
  from public, anon, authenticated;
grant  execute on function record_declared_prize_awards(uuid, text, jsonb, boolean)
  to service_role;

revoke execute on function prize_award_rows(uuid[], uuid[], uuid, uuid, date, date)
  from public, anon, authenticated, service_role;
revoke execute on function declared_prize_award_plan(uuid, jsonb)
  from public, anon, authenticated, service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   Volver a la `0067` exige recrear sus seis funciones tal como estaban, la
--   restriccion `declared_prize_awards_match_prize_key` —que solo se puede si no
--   hay dos reconocimientos del mismo par, uno anulado y otro vigente—, las dos
--   politicas con la forma anterior (sin rol), y retirar
--   `lottery_ticket_matches_number_check`, `prize_award_coverage`,
--   `prize_award_history_start` y `current_seller_org_ids`.
--
--   Revertir las politicas AMPLIA el acceso: no se hace sin decidirlo.
-- =============================================================================
