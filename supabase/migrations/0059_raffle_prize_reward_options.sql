-- =============================================================================
-- 0059_raffle_prize_reward_options.sql
-- Premios configurables por rifa — correccion de la Entrega 1: opciones de
-- recompensa, semantica del premio unico frente a las alternativas, y el cruce
-- de dos premios como CONFLICTO de configuracion
--
-- Referencia normativa: docs/DECISIONS.md D-201 (esta correccion) y D-199 (el
-- contrato), docs/BUSINESS_RULES.md §12.i (BR-J02, BR-J08, BR-J15),
-- docs/DATA_MODEL.md §4.20, docs/SECURITY.md §4.20.
--
-- QUE CORRIGE
--
-- 1. LA RECOMPENSA SE NORMALIZA. Hasta ahora una version guardaba UNA
--    recompensa en tres columnas —`reward_type`, `reward_amount`,
--    `reward_description`— y dinero y especie eran excluyentes. El premio mayor
--    del 21 de diciembre no cabe ahi: es UN premio con CUATRO alternativas
--    excluyentes entre las que se elige exactamente una, y dos de ellas mezclan
--    un vehiculo CON dinero. Cada version pasa a tener sus OPCIONES
--    (`raffle_prize_reward_options`): posicion estable, componente en especie
--    opcional, importe en pesos opcional, y al menos uno de los dos.
--
--    La semantica es EXPLICITA y no se deduce del numero de filas:
--    `reward_mode` = `fixed` (exactamente una opcion) o `winner_choice` (dos o
--    mas). Las tres columnas antiguas SE RETIRAN: no quedan dos fuentes de
--    verdad.
--
--    El sistema NO registra cual alternativa se eligio. Eso es otra decision y
--    otra entrega.
--
-- 2. LOS PREMIOS NO SE ACUMULAN: UN CRUCE ES UN ERROR DE CONFIGURACION. Dos
--    premios vigentes que, para una MISMA fecha, juegan con el mismo numero de
--    la boleta, las mismas cifras y la misma loteria efectiva son un CONFLICTO,
--    y publicar o activar esa configuracion se rechaza nombrando los dos
--    premios y el dia. Los cruces se evitan con las FECHAS de cada premio, que
--    es lo que el dueno respondio a la ambiguedad A7.
--
--    El duplicado exacto de 0058 desaparece porque esta regla lo contiene: dos
--    premios identicos comparten todos sus dias.
--
--    CUATRO CIFRAS Y ULTIMAS TRES SI CONVIVEN a proposito —son dos premios de
--    especificidad distinta— y la prioridad de BR-J07 no se toca.
--
-- QUE NO HACE
--
--   * No reescribe la `0058`, que ya se aplico y quedo en un commit.
--   * No toca el panel (Entrega 2) ni el motor de coincidencias (Entrega 3):
--     `match_lottery_result` y `lottery_ticket_matches` siguen intactos.
--   * No cambia el modo de ninguna rifa: todas siguen en `legacy`.
--   * No reprocesa resultados ni toca datos ni logica de cartera (D-198).
--
-- SOBRE LAS TILDES. Las frases NUEVAS que puede leer una persona van
-- acentuadas; los comentarios siguen sin tildes. I-030 no se toca aqui.
-- =============================================================================

-- =============================================================================
-- 1. La semantica de la recompensa (BR-J02)
--
-- EXPLICITA, y no un recuento de filas: `fixed` con dos opciones es un error de
-- quien escribe, no una alternativa que se descubre contando. La comprobacion
-- vive en un disparador diferido, porque las opciones se insertan despues de la
-- version.
-- =============================================================================

create type raffle_prize_reward_mode as enum ('fixed', 'winner_choice');

comment on type raffle_prize_reward_mode is
  'BR-J02: fixed = una sola recompensa; winner_choice = dos o mas alternativas excluyentes entre las que se elige una.';

-- =============================================================================
-- 2. Las opciones de recompensa
--
-- UNA OPCION ES LO QUE SE ENTREGA SI SE ELIGE ESA: un vehiculo, dinero, o el
-- vehiculo Y el dinero. Por eso son dos componentes opcionales con al menos uno
-- presente, y no un tipo excluyente como antes.
--
-- NO HAY TITULO APARTE. El texto de una opcion ES su componente en especie: un
-- titulo libre al lado podria contradecirlo, y esta migracion existe justamente
-- para no tener dos fuentes de verdad de la misma cosa. La aplicacion compone
-- la frase («Renault Alaskan 2023 y $20.000.000») a partir de los componentes.
--
-- EL ORDEN ES ESTABLE Y SIGNIFICA ALGO: es el orden en que se anuncian las
-- alternativas, asi que no se ordena por contenido. El tope de 6 sale de la
-- posicion, que es 1..6, y de su unicidad.
-- =============================================================================

create table raffle_prize_reward_options (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete restrict,
  version_id      uuid not null,
  position        smallint not null check (position between 1 and 6),
  -- El componente en especie: que se entrega. NULL si la opcion es solo dinero.
  description     text,
  -- El componente en dinero, en pesos enteros. NULL si la opcion es solo especie.
  amount          bigint,
  created_at      timestamptz not null default now(),

  constraint raffle_prize_reward_options_version_fk
    foreign key (version_id, organization_id)
    references raffle_prize_versions (id, organization_id) on delete restrict,
  constraint raffle_prize_reward_options_position_key unique (version_id, position),
  -- Una opcion vacia no es una opcion.
  constraint raffle_prize_reward_options_components_check check (
    description is not null or amount is not null
  ),
  -- Los mismos limites de BR-J14, ahora por opcion. Una prueba los compara con
  -- PRIZE_LIMITS en el borde.
  constraint raffle_prize_reward_options_amount_check check (
    amount is null or amount between 1 and 10000000000
  ),
  constraint raffle_prize_reward_options_description_check check (
    description is null
    or (description = btrim(description) and char_length(description) between 2 and 160)
  )
);

comment on table raffle_prize_reward_options is
  'BR-J02: lo que entrega una version de un premio. Una fila = una alternativa; con reward_mode = fixed hay exactamente una.';
comment on column raffle_prize_reward_options.position is
  'BR-J02: orden en que se anuncian las alternativas. Estable: no se ordena por contenido. Maximo 6.';
comment on column raffle_prize_reward_options.description is
  'BR-J02: el componente en especie. Es tambien el texto de la opcion: no hay un titulo aparte que pueda contradecirlo.';

create function raffle_prize_reward_options_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'La recompensa de una versión de un premio no se modifica ni se borra: los cambios se guardan como una versión nueva.';
end;
$$;

create trigger raffle_prize_reward_options_immutable
  before update or delete on raffle_prize_reward_options
  for each row execute function raffle_prize_reward_options_immutable();

-- =============================================================================
-- 3. `reward_mode` en la version, y la migracion de lo que ya existia
--
-- `add column ... default` con una constante no reescribe la tabla ni dispara
-- ningun trigger de fila: toda version anterior queda en `fixed`, que es lo que
-- era. Despues se retira el valor por defecto para que nadie lo omita.
-- =============================================================================

alter table raffle_prize_versions
  add column reward_mode raffle_prize_reward_mode not null default 'fixed';

alter table raffle_prize_versions
  alter column reward_mode drop default;

comment on column raffle_prize_versions.reward_mode is
  'BR-J02: fixed = una sola opcion; winner_choice = dos o mas alternativas excluyentes. No se deduce contando filas.';

-- Cada recompensa anterior se convierte en su UNICA opcion: el dinero va al
-- importe y la especie a la descripcion. Es la unica forma de que las dos
-- representaciones digan lo mismo antes de que una desaparezca.
insert into raffle_prize_reward_options (organization_id, version_id, position, description, amount)
select
  v.organization_id,
  v.id,
  1,
  case when v.reward_type = 'in_kind' then v.reward_description end,
  case when v.reward_type = 'cash'    then v.reward_amount      end
from raffle_prize_versions v;

-- La migracion se comprueba a si misma: si alguna version quedara sin su opcion
-- —o con mas de una— la transaccion se cae antes de retirar las columnas
-- viejas, y no se pierde nada.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from raffle_prize_versions v
  where (select count(*) from raffle_prize_reward_options o where o.version_id = v.id) <> 1;

  if v_bad > 0 then
    raise exception 'La migracion de recompensas dejo % versiones sin exactamente una opcion. No se retira la representacion anterior.', v_bad;
  end if;
end;
$$;

-- =============================================================================
-- 4. Se retira la representacion anterior
--
-- Primero las funciones cuya FIRMA nombra el tipo viejo —las dos RPC que
-- escriben, las dos piezas internas y el historial, que lo devuelve— y despues
-- las columnas y el tipo. A partir de aqui la recompensa vive en un solo sitio.
-- =============================================================================

drop function create_raffle_prize(uuid, text, raffle_prize_category, raffle_prize_reward_type, lottery_match_field, jsonb, bigint, text, raffle_prize_digits, text);
drop function publish_raffle_prize_version(uuid, uuid, text, raffle_prize_category, raffle_prize_reward_type, lottery_match_field, raffle_prize_digits, jsonb, bigint, text, text);
drop function raffle_prize_history(uuid, integer, integer);
drop function raffle_prize_insert_version(uuid, uuid, uuid, uuid, integer, uuid, raffle_prize_status, text, raffle_prize_category, raffle_prize_reward_type, bigint, text, lottery_match_field, raffle_prize_digits, text, jsonb, uuid);
drop function raffle_prize_clean_fields(text, raffle_prize_category, raffle_prize_reward_type, bigint, text, lottery_match_field, raffle_prize_digits, text);
drop function raffle_prize_audit_values(raffle_prize_versions, text, boolean, integer);

alter table raffle_prize_versions
  drop column reward_type,
  drop column reward_amount,
  drop column reward_description;

drop type raffle_prize_reward_type;

-- =============================================================================
-- 5. RLS y privilegios de la tabla nueva
--
-- Exactamente los de sus tres hermanas (0058, §7): los miembros activos de la
-- organizacion LEEN, ninguna sesion escribe, y la service role inserta pero no
-- actualiza ni borra. Los privilegios que NO se dan tambien se escriben (I-111).
-- =============================================================================

alter table raffle_prize_reward_options enable row level security;
alter table raffle_prize_reward_options force  row level security;

create policy raffle_prize_reward_options_select on raffle_prize_reward_options
for select to authenticated
using (organization_id in (select current_org_ids()));

revoke all on raffle_prize_reward_options from public, anon, authenticated, service_role;

grant select         on raffle_prize_reward_options to authenticated;
grant select, insert on raffle_prize_reward_options to service_role;

-- =============================================================================
-- 6. Piezas internas de la recompensa
-- =============================================================================

-- Las opciones guardadas de una version, en su forma canonica: el mismo JSON
-- que produce la validacion, para poder comparar un guardado con lo que ya
-- estaba sin volver a leer filas.
create function raffle_prize_reward_json(p_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'description', o.description,
           'amount',      o.amount
         ) order by o.position), '[]'::jsonb)
  from raffle_prize_reward_options o
  where o.version_id = p_version_id
$$;

comment on function raffle_prize_reward_json(uuid) is
  'BR-J02: las opciones de recompensa de una version, canonicas y en su orden.';

-- Valida las opciones que llegan de la aplicacion y las devuelve canonicas.
-- NO las ordena: el orden es el que se anuncia y es parte del dato. Los
-- mensajes dicen que falta y como arreglarlo; los CHECK son la red final.
create function raffle_prize_normalized_reward(
  p_reward_mode raffle_prize_reward_mode,
  p_options     jsonb
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_item        jsonb;
  v_description text;
  v_amount      bigint;
  v_options     jsonb := '[]'::jsonb;
  v_count       integer;
begin
  if p_reward_mode is null then
    raise exception 'Elige si el premio entrega una sola recompensa o varias alternativas.' using errcode = 'check_violation';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) = 0 then
    raise exception 'Escribe qué entrega el premio.' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(p_options) > 6 then
    raise exception 'Un premio admite como máximo 6 alternativas.' using errcode = 'check_violation';
  end if;

  for v_item in select value from jsonb_array_elements(p_options)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Revisa lo que entrega cada alternativa del premio.' using errcode = 'check_violation';
    end if;

    v_description := nullif(btrim(coalesce(v_item ->> 'description', '')), '');

    if v_item ? 'amount' and jsonb_typeof(v_item -> 'amount') not in ('number', 'null') then
      raise exception 'Escribe el valor del premio en pesos.' using errcode = 'check_violation';
    end if;

    if jsonb_typeof(v_item -> 'amount') = 'number' then
      if (v_item ->> 'amount') !~ '^[0-9]+$' then
        raise exception 'El valor del premio se escribe en pesos enteros.' using errcode = 'check_violation';
      end if;
      v_amount := (v_item ->> 'amount')::bigint;
    else
      v_amount := null;
    end if;

    if v_description is null and v_amount is null then
      raise exception 'En cada alternativa escribe el dinero, lo que se entrega, o las dos cosas.' using errcode = 'check_violation';
    end if;

    if v_amount is not null then
      if v_amount < 1 then
        raise exception 'Escribe el valor del premio en pesos.' using errcode = 'check_violation';
      end if;
      if v_amount > 10000000000 then
        raise exception 'El valor del premio no puede superar $10.000.000.000.' using errcode = 'check_violation';
      end if;
    end if;

    if v_description is not null then
      if char_length(v_description) < 2 then
        raise exception 'La descripción del premio debe tener al menos 2 caracteres.' using errcode = 'check_violation';
      end if;
      if char_length(v_description) > 160 then
        raise exception 'La descripción del premio no puede superar 160 caracteres.' using errcode = 'check_violation';
      end if;
    end if;

    if v_options @> jsonb_build_array(jsonb_build_object('description', v_description, 'amount', v_amount)) then
      raise exception 'Hay dos alternativas iguales. Cada alternativa tiene que entregar algo distinto.' using errcode = 'check_violation';
    end if;

    v_options := v_options || jsonb_build_array(jsonb_build_object(
      'description', v_description,
      'amount',      v_amount
    ));
  end loop;

  v_count := jsonb_array_length(v_options);

  if p_reward_mode = 'fixed' and v_count <> 1 then
    raise exception 'Un «Premio único» lleva una sola recompensa. Si quieres que se elija entre varias, cámbialo a «Alternativas a elegir».'
      using errcode = 'check_violation';
  end if;

  if p_reward_mode = 'winner_choice' and v_count < 2 then
    raise exception '«Alternativas a elegir» necesita al menos dos. Agrega otra alternativa o cámbialo a «Premio único».'
      using errcode = 'check_violation';
  end if;

  return v_options;
end;
$$;

comment on function raffle_prize_normalized_reward(raffle_prize_reward_mode, jsonb) is
  'BR-J02, BR-J14: valida las opciones de recompensa y las devuelve canonicas, sin reordenarlas.';

-- Al COMMIT, toda version cumple su propia semantica. Diferido porque las
-- opciones se insertan despues de la version, como los periodos.
create function raffle_prize_versions_require_reward()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from raffle_prize_reward_options o
  where o.version_id = new.id;

  if new.reward_mode = 'fixed' and v_count <> 1 then
    raise exception 'Un «Premio único» lleva una sola recompensa. Si quieres que se elija entre varias, cámbialo a «Alternativas a elegir».';
  end if;

  if new.reward_mode = 'winner_choice' and v_count < 2 then
    raise exception '«Alternativas a elegir» necesita al menos dos. Agrega otra alternativa o cámbialo a «Premio único».';
  end if;

  return null;
end;
$$;

create constraint trigger raffle_prize_versions_require_reward
  after insert on raffle_prize_versions
  deferrable initially deferred
  for each row execute function raffle_prize_versions_require_reward();

-- Y por el otro lado: una opcion que aparezca DESPUES tambien tiene que dejar
-- la version cuadrada. Sin esto, la service role podria anadirle una segunda
-- recompensa a un «Premio único» sin que nada lo notara; el disparador de
-- arriba solo mira en el momento de crear la version, igual que pasa con los
-- periodos y `raffle_prize_schedule_rules_check` (0058).
create function raffle_prize_reward_options_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode  raffle_prize_reward_mode;
  v_count integer;
begin
  select v.reward_mode into v_mode
  from raffle_prize_versions v where v.id = new.version_id;

  select count(*) into v_count
  from raffle_prize_reward_options o where o.version_id = new.version_id;

  if v_mode = 'fixed' and v_count <> 1 then
    raise exception 'Un «Premio único» lleva una sola recompensa. Si quieres que se elija entre varias, cámbialo a «Alternativas a elegir».';
  end if;

  if v_mode = 'winner_choice' and v_count < 2 then
    raise exception '«Alternativas a elegir» necesita al menos dos. Agrega otra alternativa o cámbialo a «Premio único».';
  end if;

  return null;
end;
$$;

create constraint trigger raffle_prize_reward_options_check
  after insert on raffle_prize_reward_options
  deferrable initially deferred
  for each row execute function raffle_prize_reward_options_check();

-- =============================================================================
-- 7. Las piezas de 0058 que cambian de forma
-- =============================================================================

-- Sin las tres columnas de recompensa: ahora solo normaliza el texto.
create function raffle_prize_clean_fields(
  p_title        text,
  p_category     raffle_prize_category,
  p_number_field lottery_match_field,
  p_digits       raffle_prize_digits,
  p_conditions   text,
  out clean_title      text,
  out clean_conditions text
)
returns record
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
begin
  clean_title := btrim(coalesce(p_title, ''));
  clean_conditions := nullif(btrim(coalesce(p_conditions, '')), '');

  if clean_title = '' then
    raise exception 'Escribe el nombre del premio.' using errcode = 'check_violation';
  end if;
  if char_length(clean_title) < 2 then
    raise exception 'El nombre del premio debe tener al menos 2 caracteres.' using errcode = 'check_violation';
  end if;
  if char_length(clean_title) > 80 then
    raise exception 'El nombre del premio no puede superar 80 caracteres.' using errcode = 'check_violation';
  end if;

  if p_category is null then
    raise exception 'Elige la categoría del premio.' using errcode = 'check_violation';
  end if;
  if p_number_field is null then
    raise exception 'Elige con qué número de la boleta juega el premio.' using errcode = 'check_violation';
  end if;
  if p_digits is null then
    raise exception 'Elige con cuántas cifras juega el premio.' using errcode = 'check_violation';
  end if;

  if clean_conditions is not null and char_length(clean_conditions) > 1000 then
    raise exception 'Las aclaraciones no pueden superar 1.000 caracteres.' using errcode = 'check_violation';
  end if;
end;
$$;

-- Inserta una version con sus periodos Y sus opciones de recompensa, todos ya
-- limpios y canonicos. La posicion de cada uno es su ordinal.
create function raffle_prize_insert_version(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_prize_id        uuid,
  p_version_id      uuid,
  p_version_number  integer,
  p_previous_id     uuid,
  p_status          raffle_prize_status,
  p_title           text,
  p_category        raffle_prize_category,
  p_reward_mode     raffle_prize_reward_mode,
  p_reward_options  jsonb,
  p_number_field    lottery_match_field,
  p_digits          raffle_prize_digits,
  p_conditions      text,
  p_rules           jsonb,
  p_actor           uuid
)
returns raffle_prize_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version raffle_prize_versions%rowtype;
begin
  insert into raffle_prize_versions (
    id, organization_id, raffle_id, prize_id, version_number, previous_version_id,
    status, title, category, reward_mode, number_field, digits, conditions, published_by
  )
  values (
    p_version_id, p_organization_id, p_raffle_id, p_prize_id, p_version_number, p_previous_id,
    p_status, p_title, p_category, p_reward_mode, p_number_field, p_digits, p_conditions, p_actor
  )
  returning * into v_version;

  insert into raffle_prize_reward_options (
    organization_id, version_id, position, description, amount
  )
  select
    p_organization_id,
    p_version_id,
    o.ord::smallint,
    o.item ->> 'description',
    (o.item ->> 'amount')::bigint
  from jsonb_array_elements(p_reward_options) with ordinality as o(item, ord);

  insert into raffle_prize_schedule_rules (
    organization_id, version_id, position, start_date, end_date, weekdays,
    lottery_mode, lottery_code
  )
  select
    p_organization_id,
    p_version_id,
    r.ord::smallint,
    (r.item ->> 'start_date')::date,
    (r.item ->> 'end_date')::date,
    (select array_agg((w #>> '{}')::smallint order by (w #>> '{}')::smallint)
       from jsonb_array_elements(r.item -> 'weekdays') w),
    (r.item ->> 'lottery_mode')::raffle_prize_lottery_mode,
    (r.item ->> 'lottery_code')::lottery_code
  from jsonb_array_elements(p_rules) with ordinality as r(item, ord);

  return v_version;
end;
$$;

-- El resumen de la bitacora, con la recompensa en su forma nueva. Sigue sin
-- llevar nada de la cartera.
create function raffle_prize_audit_values(
  p_version  raffle_prize_versions,
  p_change   text,
  p_material boolean,
  p_notified integer
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'raffle_id',               p_version.raffle_id,
    'prize_id',                p_version.prize_id,
    'version_id',              p_version.id,
    'version_number',          p_version.version_number,
    'previous_version_id',     p_version.previous_version_id,
    'change',                  p_change,
    'status',                  p_version.status,
    'title',                   p_version.title,
    'category',                p_version.category,
    'reward_mode',             p_version.reward_mode,
    'reward_options',          raffle_prize_reward_json(p_version.id),
    'number_field',            p_version.number_field,
    'digits',                  p_version.digits,
    'rules_count',             (select count(*) from raffle_prize_schedule_rules r where r.version_id = p_version.id),
    'material',                p_material,
    'notified',                p_notified
  )
$$;

-- La vigencia de una version: el PRIMER y el ULTIMO dia en que el premio juega
-- de verdad. No son `min(start_date)` y `max(end_date)`: «los sabados del 1 al
-- 31 de diciembre» empieza el 5, no el 1, y eso es lo que hay que poder leer.
create function raffle_prize_validity(p_version_id uuid)
returns table (starts_on date, ends_on date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select min(e.reference_date), max(e.reference_date)
  from raffle_prize_rule_dates(p_version_id) e
$$;

comment on function raffle_prize_validity(uuid) is
  'BR-J04: desde cuando y hasta cuando aplica una version; el primero y el ultimo dia que juega de verdad.';

-- El primer problema de una version dentro de su rifa, o NULL:
--
--   * un calendario sin periodos, fuera de la rifa o con un dia repetido;
--   * un sorteo FUTURO que la programacion oficial ya dio por cancelado;
--   * un CONFLICTO con otro premio vigente (BR-J08).
--
-- EL CONFLICTO SUSTITUYE AL DUPLICADO EXACTO DE 0058. Los premios no se
-- acumulan: si dos premios vigentes juegan el mismo dia con el mismo numero de
-- la boleta, las mismas cifras y la misma loteria efectiva, no hay forma de
-- decir cual se paga, y eso es un error de configuracion que se corrige con las
-- fechas. La recompensa NO entra en la comparacion: dos premios distintos que
-- pagan cosas distintas el mismo dia con la misma regla siguen siendo un cruce.
--
-- Cuatro cifras y ultimas tres NO chocan: `digits` es parte de la comparacion,
-- asi que conviven a proposito y la prioridad de BR-J07 decide despues.
create or replace function raffle_prize_version_problem(
  p_version_id uuid,
  p_start      date,
  p_end        date
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_version raffle_prize_versions%rowtype;
  v_day     date;
  v_other   text;
begin
  select * into v_version from raffle_prize_versions v where v.id = p_version_id;

  if not exists (select 1 from raffle_prize_schedule_rules r where r.version_id = p_version_id) then
    return format('El premio «%s» no tiene calendario. Agrega al menos un período.', v_version.title);
  end if;

  if exists (
    select 1 from raffle_prize_schedule_rules r
    where r.version_id = p_version_id
      and (r.start_date < p_start or r.end_date > p_end)
  ) then
    return format(
      'Las fechas del premio «%s» tienen que quedar dentro de las fechas de la rifa: del %s al %s.',
      v_version.title, to_char(p_start, 'DD/MM/YYYY'), to_char(p_end, 'DD/MM/YYYY')
    );
  end if;

  select e.reference_date into v_day
  from raffle_prize_rule_dates(p_version_id) e
  group by e.reference_date
  having count(*) > 1
  order by e.reference_date
  limit 1;

  if v_day is not null then
    return format(
      'Dos períodos del premio «%s» incluyen el mismo día (%s). Deja cada día en un solo período.',
      v_version.title, to_char(v_day, 'DD/MM/YYYY')
    );
  end if;

  if v_version.status <> 'active' then
    return null;
  end if;

  select e.reference_date into v_day
  from raffle_prize_rule_dates(p_version_id) e
  join lottery_draw_schedules s
    on s.lottery_code = e.lottery_code
   and s.reference_date = e.reference_date
  where s.schedule_status = 'cancelled'
    and e.reference_date >= today_bogota()
  order by e.reference_date
  limit 1;

  if v_day is not null then
    return format(
      'El sorteo del %s está cancelado en la programación oficial y no va a tener resultado. Quita ese día del calendario del premio «%s».',
      to_char(v_day, 'DD/MM/YYYY'), v_version.title
    );
  end if;

  select o.title, o.reference_date into v_other, v_day
  from (
    select v.title, e.reference_date, e.lottery_code
    from raffle_prizes p
    join raffle_prize_versions v on v.id = p.current_version_id
    cross join lateral raffle_prize_rule_dates(v.id) e
    where p.raffle_id = v_version.raffle_id
      and p.status = 'active'
      and p.id <> v_version.prize_id
      and v.number_field = v_version.number_field
      and v.digits = v_version.digits
  ) o
  join raffle_prize_rule_dates(p_version_id) m
    on m.reference_date = o.reference_date
   and m.lottery_code  = o.lottery_code
  order by o.reference_date, o.title
  limit 1;

  if v_other is not null then
    return format(
      'El premio «%s» y el premio «%s» juegan el %s con el mismo número de la boleta, las mismas cifras y la misma lotería. Cambia las fechas, el número o las cifras de uno de los dos.',
      v_version.title, v_other, to_char(v_day, 'DD/MM/YYYY')
    );
  end if;

  return null;
end;
$$;

-- Si una version cambia algo que un vendedor necesita saber (BR-J11). Ahora la
-- recompensa se compara por su forma canonica: cambiar una alternativa, su
-- orden o el modo es material; el nombre y la categoria siguen sin serlo.
create or replace function raffle_prize_is_material(p_old_version_id uuid, p_new_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.status is distinct from n.status
      or o.reward_mode is distinct from n.reward_mode
      or raffle_prize_reward_json(o.id) is distinct from raffle_prize_reward_json(n.id)
      or o.number_field is distinct from n.number_field
      or o.digits is distinct from n.digits
      or o.conditions is distinct from n.conditions
      or (select array_agg(e.reference_date::text || ':' || e.lottery_code::text order by e.reference_date)
            from raffle_prize_rule_dates(o.id) e)
         is distinct from
         (select array_agg(e.reference_date::text || ':' || e.lottery_code::text order by e.reference_date)
            from raffle_prize_rule_dates(n.id) e)
  from raffle_prize_versions o, raffle_prize_versions n
  where o.id = p_old_version_id and n.id = p_new_version_id
$$;

-- =============================================================================
-- 8. Las RPC que escriben la recompensa
-- =============================================================================

create function create_raffle_prize(
  p_raffle_id      uuid,
  p_title          text,
  p_category       raffle_prize_category,
  p_reward_mode    raffle_prize_reward_mode,
  p_reward_options jsonb,
  p_number_field   lottery_match_field,
  p_rules          jsonb,
  p_digits         raffle_prize_digits default 'four',
  p_conditions     text default null
)
returns table (prize_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid        uuid := require_auth();
  v_raffle     raffles%rowtype;
  v_prize_id   uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_version    raffle_prize_versions%rowtype;
  v_title      text;
  v_conditions text;
  v_reward     jsonb;
  v_rules      jsonb;
  v_active     integer;
  v_last       integer;
  v_problem    text;
  v_notified   integer := 0;
begin
  v_raffle := raffle_prize_manageable_raffle(p_raffle_id);

  select count(*), coalesce(max(p.position), 0)
    into v_active, v_last
  from raffle_prizes p
  where p.raffle_id = v_raffle.id and p.status = 'active';

  if v_active >= 50 then
    raise exception 'La rifa ya tiene 50 premios vigentes, que es el máximo. Archiva uno para agregar otro.'
      using errcode = 'check_violation';
  end if;

  select f.clean_title, f.clean_conditions
    into v_title, v_conditions
  from raffle_prize_clean_fields(
    p_title, p_category, p_number_field, coalesce(p_digits, 'four'), p_conditions
  ) f;

  v_reward := raffle_prize_normalized_reward(p_reward_mode, p_reward_options);
  v_rules := raffle_prize_normalized_rules(v_raffle, p_rules);

  v_version := raffle_prize_insert_version(
    v_raffle.organization_id, v_raffle.id, v_prize_id, v_version_id, 1, null, 'active',
    v_title, p_category, p_reward_mode, v_reward,
    p_number_field, coalesce(p_digits, 'four'), v_conditions, v_rules, v_uid
  );

  v_problem := raffle_prize_version_problem(v_version_id, v_raffle.start_date, v_raffle.end_date);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'check_violation';
  end if;

  if v_raffle.status = 'active' then
    v_problem := raffle_prize_cutoff_problem(array[v_version_id]);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;
  end if;

  insert into raffle_prizes (
    id, organization_id, raffle_id, status, position, current_version_id, created_by
  )
  values (
    v_prize_id, v_raffle.organization_id, v_raffle.id, 'active', v_last + 1, v_version_id, v_uid
  );

  if v_raffle.status = 'active' then
    v_notified := raffle_prize_notify(
      v_raffle.organization_id, v_raffle.id, v_raffle.name, v_prize_id,
      v_version_id, 1, v_title, 'created', v_uid
    );
  end if;

  perform write_audit_log(
    v_raffle.organization_id, 'raffle_prize.create', 'raffle_prize', v_prize_id,
    null,
    raffle_prize_audit_values(v_version, 'created', v_raffle.status = 'active', v_notified)
  );

  return query select v_prize_id, v_version_id, 1;
end;
$$;

comment on function create_raffle_prize(uuid, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, jsonb, raffle_prize_digits, text) is
  'BR-J01..BR-J11: crea un premio con su version 1 en una rifa configurable, con una recompensa fija o varias alternativas. No recibe organizacion ni actor.';

create function publish_raffle_prize_version(
  p_prize_id            uuid,
  p_expected_version_id uuid,
  p_title               text,
  p_category            raffle_prize_category,
  p_reward_mode         raffle_prize_reward_mode,
  p_reward_options      jsonb,
  p_number_field        lottery_match_field,
  p_digits              raffle_prize_digits,
  p_rules               jsonb,
  p_conditions          text default null
)
returns table (prize_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid        uuid := require_auth();
  v_prize      raffle_prizes%rowtype;
  v_raffle     raffles%rowtype;
  v_old        raffle_prize_versions%rowtype;
  v_new        raffle_prize_versions%rowtype;
  v_new_id     uuid := gen_random_uuid();
  v_title      text;
  v_conditions text;
  v_reward     jsonb;
  v_rules      jsonb;
  v_problem    text;
  v_material   boolean;
  v_notified   integer := 0;
begin
  select * into v_prize from raffle_prizes p where p.id = p_prize_id;
  if not found then
    raise exception 'El premio no existe o no tienes permiso para cambiarlo.'
      using errcode = 'insufficient_privilege';
  end if;

  v_raffle := raffle_prize_manageable_raffle(v_prize.raffle_id);

  select * into v_prize from raffle_prizes p where p.id = p_prize_id for update;

  if v_prize.current_version_id is distinct from p_expected_version_id then
    raise exception 'Alguien cambió este premio mientras lo editabas. Vuelve a abrirlo para ver cómo quedó y haz tu cambio otra vez.';
  end if;

  select * into v_old from raffle_prize_versions v where v.id = v_prize.current_version_id;

  select f.clean_title, f.clean_conditions
    into v_title, v_conditions
  from raffle_prize_clean_fields(
    p_title, p_category, p_number_field, p_digits, p_conditions
  ) f;

  v_reward := raffle_prize_normalized_reward(p_reward_mode, p_reward_options);
  v_rules := raffle_prize_normalized_rules(v_raffle, p_rules);

  if v_old.title = v_title
     and v_old.category = p_category
     and v_old.reward_mode = p_reward_mode
     and raffle_prize_reward_json(v_old.id) = v_reward
     and v_old.number_field = p_number_field
     and v_old.digits = p_digits
     and v_old.conditions is not distinct from v_conditions
     and raffle_prize_rules_json(v_old.id) = v_rules then
    return query select v_prize.id, v_old.id, v_old.version_number;
    return;
  end if;

  v_new := raffle_prize_insert_version(
    v_raffle.organization_id, v_raffle.id, v_prize.id, v_new_id,
    v_old.version_number + 1, v_old.id, v_old.status,
    v_title, p_category, p_reward_mode, v_reward,
    p_number_field, p_digits, v_conditions, v_rules, v_uid
  );

  v_problem := raffle_prize_version_problem(v_new_id, v_raffle.start_date, v_raffle.end_date);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'check_violation';
  end if;

  if v_raffle.status = 'active' and v_old.status = 'active' then
    v_problem := raffle_prize_cutoff_problem(array[v_old.id, v_new_id]);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;
  end if;

  update raffle_prizes p
     set current_version_id = v_new_id
   where p.id = v_prize.id;

  v_material := raffle_prize_is_material(v_old.id, v_new_id);

  if v_raffle.status = 'active' and v_new.status = 'active' and v_material then
    v_notified := raffle_prize_notify(
      v_raffle.organization_id, v_raffle.id, v_raffle.name, v_prize.id,
      v_new_id, v_new.version_number, v_title, 'updated', v_uid
    );
  end if;

  perform write_audit_log(
    v_raffle.organization_id, 'raffle_prize.publish', 'raffle_prize', v_prize.id,
    jsonb_build_object(
      'version_id', v_old.id, 'version_number', v_old.version_number,
      'status', v_old.status, 'title', v_old.title
    ),
    raffle_prize_audit_values(v_new, 'updated', v_material, v_notified)
  );

  return query select v_prize.id, v_new_id, v_new.version_number;
end;
$$;

comment on function publish_raffle_prize_version(uuid, uuid, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, raffle_prize_digits, jsonb, text) is
  'BR-J09: publica una version nueva con control optimista. Sin cambios no escribe nada. En una rifa activa solo afecta sorteos no bloqueados y un cambio material avisa (BR-J11).';

-- Archivar y restaurar copian la recompensa de la version vigente tal cual: su
-- modo y sus opciones, en su orden.
create or replace function archive_raffle_prize(p_prize_id uuid, p_expected_version_id uuid)
returns table (prize_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid      uuid := require_auth();
  v_prize    raffle_prizes%rowtype;
  v_raffle   raffles%rowtype;
  v_old      raffle_prize_versions%rowtype;
  v_new      raffle_prize_versions%rowtype;
  v_new_id   uuid := gen_random_uuid();
  v_problem  text;
  v_notified integer := 0;
begin
  select * into v_prize from raffle_prizes p where p.id = p_prize_id;
  if not found then
    raise exception 'El premio no existe o no tienes permiso para cambiarlo.'
      using errcode = 'insufficient_privilege';
  end if;

  v_raffle := raffle_prize_manageable_raffle(v_prize.raffle_id);

  select * into v_prize from raffle_prizes p where p.id = p_prize_id for update;

  if v_prize.current_version_id is distinct from p_expected_version_id then
    raise exception 'Alguien cambió este premio mientras lo editabas. Vuelve a abrirlo para ver cómo quedó y haz tu cambio otra vez.';
  end if;

  if v_prize.status = 'archived' then
    raise exception 'Este premio ya está archivado.' using errcode = 'check_violation';
  end if;

  if v_raffle.status = 'active'
     and (select count(*) from raffle_prizes p
          where p.raffle_id = v_raffle.id and p.status = 'active') <= 1 then
    raise exception 'La rifa está activa y necesita al menos un premio vigente. Agrega otro premio antes de archivar este.'
      using errcode = 'check_violation';
  end if;

  select * into v_old from raffle_prize_versions v where v.id = v_prize.current_version_id;

  if v_raffle.status = 'active' then
    v_problem := raffle_prize_cutoff_problem(array[v_old.id]);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;
  end if;

  v_new := raffle_prize_insert_version(
    v_raffle.organization_id, v_raffle.id, v_prize.id, v_new_id,
    v_old.version_number + 1, v_old.id, 'archived',
    v_old.title, v_old.category, v_old.reward_mode, raffle_prize_reward_json(v_old.id),
    v_old.number_field, v_old.digits, v_old.conditions,
    raffle_prize_rules_json(v_old.id), v_uid
  );

  update raffle_prizes p
     set status             = 'archived',
         position           = null,
         current_version_id = v_new_id,
         archived_at        = v_new.published_at,
         archived_by        = v_uid
   where p.id = v_prize.id;

  if v_raffle.status = 'active' then
    v_notified := raffle_prize_notify(
      v_raffle.organization_id, v_raffle.id, v_raffle.name, v_prize.id,
      v_new_id, v_new.version_number, v_new.title, 'archived', v_uid
    );
  end if;

  perform write_audit_log(
    v_raffle.organization_id, 'raffle_prize.archive', 'raffle_prize', v_prize.id,
    jsonb_build_object(
      'version_id', v_old.id, 'version_number', v_old.version_number,
      'status', v_old.status, 'position', v_prize.position
    ),
    raffle_prize_audit_values(v_new, 'archived', true, v_notified)
  );

  return query select v_prize.id, v_new_id, v_new.version_number;
end;
$$;

create or replace function restore_raffle_prize(p_prize_id uuid, p_expected_version_id uuid)
returns table (prize_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid      uuid := require_auth();
  v_prize    raffle_prizes%rowtype;
  v_raffle   raffles%rowtype;
  v_old      raffle_prize_versions%rowtype;
  v_new      raffle_prize_versions%rowtype;
  v_new_id   uuid := gen_random_uuid();
  v_rules    jsonb;
  v_active   integer;
  v_last     integer;
  v_problem  text;
  v_notified integer := 0;
begin
  select * into v_prize from raffle_prizes p where p.id = p_prize_id;
  if not found then
    raise exception 'El premio no existe o no tienes permiso para cambiarlo.'
      using errcode = 'insufficient_privilege';
  end if;

  v_raffle := raffle_prize_manageable_raffle(v_prize.raffle_id);

  select * into v_prize from raffle_prizes p where p.id = p_prize_id for update;

  if v_prize.current_version_id is distinct from p_expected_version_id then
    raise exception 'Alguien cambió este premio mientras lo editabas. Vuelve a abrirlo para ver cómo quedó y haz tu cambio otra vez.';
  end if;

  if v_prize.status = 'active' then
    raise exception 'Este premio ya está vigente.' using errcode = 'check_violation';
  end if;

  select count(*), coalesce(max(p.position), 0)
    into v_active, v_last
  from raffle_prizes p
  where p.raffle_id = v_raffle.id and p.status = 'active';

  if v_active >= 50 then
    raise exception 'La rifa ya tiene 50 premios vigentes, que es el máximo. Archiva uno para restaurar este.'
      using errcode = 'check_violation';
  end if;

  select * into v_old from raffle_prize_versions v where v.id = v_prize.current_version_id;

  v_rules := raffle_prize_normalized_rules(v_raffle, raffle_prize_rules_json(v_old.id));

  v_new := raffle_prize_insert_version(
    v_raffle.organization_id, v_raffle.id, v_prize.id, v_new_id,
    v_old.version_number + 1, v_old.id, 'active',
    v_old.title, v_old.category, v_old.reward_mode, raffle_prize_reward_json(v_old.id),
    v_old.number_field, v_old.digits, v_old.conditions,
    v_rules, v_uid
  );

  v_problem := raffle_prize_version_problem(v_new_id, v_raffle.start_date, v_raffle.end_date);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'check_violation';
  end if;

  if v_raffle.status = 'active' then
    v_problem := raffle_prize_cutoff_problem(array[v_new_id]);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;
  end if;

  update raffle_prizes p
     set status             = 'active',
         position           = v_last + 1,
         current_version_id = v_new_id,
         archived_at        = null,
         archived_by        = null
   where p.id = v_prize.id;

  if v_raffle.status = 'active' then
    v_notified := raffle_prize_notify(
      v_raffle.organization_id, v_raffle.id, v_raffle.name, v_prize.id,
      v_new_id, v_new.version_number, v_new.title, 'restored', v_uid
    );
  end if;

  perform write_audit_log(
    v_raffle.organization_id, 'raffle_prize.restore', 'raffle_prize', v_prize.id,
    jsonb_build_object(
      'version_id', v_old.id, 'version_number', v_old.version_number, 'status', v_old.status
    ),
    raffle_prize_audit_values(v_new, 'restored', true, v_notified)
  );

  return query select v_prize.id, v_new_id, v_new.version_number;
end;
$$;

-- El historial, con la recompensa en su forma nueva y con la VIGENCIA de cada
-- version: desde cuando y hasta cuando aplicaba. Se lee de las versiones, no de
-- la bitacora, y solo con la capacidad.
create function raffle_prize_history(
  p_prize_id uuid,
  p_limit    integer default 20,
  p_offset   integer default 0
)
returns table (
  version_id          uuid,
  version_number      integer,
  previous_version_id uuid,
  change              text,
  status              raffle_prize_status,
  title               text,
  category            raffle_prize_category,
  reward_mode         raffle_prize_reward_mode,
  reward_options      jsonb,
  number_field        lottery_match_field,
  digits              raffle_prize_digits,
  conditions          text,
  rules               jsonb,
  starts_on           date,
  ends_on             date,
  published_at        timestamptz,
  published_by        uuid,
  published_by_name   text,
  total_count         bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with prize as (
    select p.id
    from raffle_prizes p
    where p.id = p_prize_id
      and has_org_capability(p.organization_id, 'raffles.prizes.manage')
  ),
  total as (
    select count(*) as n
    from raffle_prize_versions v
    join prize on prize.id = v.prize_id
  )
  select
    v.id,
    v.version_number,
    v.previous_version_id,
    case
      when v.previous_version_id is null then 'created'
      when prev.status = 'active' and v.status = 'archived' then 'archived'
      when prev.status = 'archived' and v.status = 'active' then 'restored'
      else 'updated'
    end,
    v.status,
    v.title,
    v.category,
    v.reward_mode,
    raffle_prize_reward_json(v.id),
    v.number_field,
    v.digits,
    v.conditions,
    raffle_prize_rules_json(v.id),
    w.starts_on,
    w.ends_on,
    v.published_at,
    v.published_by,
    pr.full_name,
    total.n
  from raffle_prize_versions v
  join prize on prize.id = v.prize_id
  left join raffle_prize_versions prev on prev.id = v.previous_version_id
  left join profiles pr on pr.id = v.published_by
  cross join lateral raffle_prize_validity(v.id) w
  cross join total
  order by v.version_number desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

comment on function raffle_prize_history(uuid, integer, integer) is
  'BR-J12: historial paginado de un premio desde sus versiones, con su recompensa, su vigencia y su actor (NULL = Sistema). Solo con la capacidad raffles.prizes.manage.';

-- =============================================================================
-- 9. La bitacora del personal, con la recompensa nueva (D-198)
--
-- Mismo cuerpo de 0058 §12 con DOS claves cambiadas en la lista blanca de
-- `raffle_prize`: `reward_type` y `reward_amount` ya no existen; entran
-- `reward_mode` y `reward_options`. Un premio sigue sin llevar nada de la
-- cartera: ni cliente, ni precio de venta, ni abonos.
-- =============================================================================

create or replace function admin_audit_redact(p_entity_type text, p_values jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_values is null then null
    when p_entity_type in ('raffle', 'user') then p_values
    else coalesce(
      (
        select jsonb_object_agg(e.key, e.value)
          from jsonb_each(p_values) e
         where e.key = any (
           case p_entity_type
             when 'ticket' then array[
               'id', 'organization_id', 'raffle_id', 'seller_id', 'internal_code',
               'daily_number', 'weekly_number', 'inventory_status', 'created_by',
               'created_at', 'approved_by', 'approved_at', 'cancelled_at',
               'cancel_reason', 'clearance_receipt_delivered_at',
               'clearance_receipt_assumed_delivered', 'count', 'reason',
               'ticket_ids', 'tickets', 'requested', 'inserted', 'skipped', 'source'
             ]
             when 'membership' then array[
               'id', 'organization_id', 'profile_id', 'role', 'is_active', 'invited_by',
               'created_at', 'parent_seller_id', 'commission_model',
               'fixed_commission_amount', 'public_slug', 'public_catalog_enabled',
               'public_whatsapp_number', 'public_raffle_id'
             ]
             when 'raffle_prize' then array[
               'raffle_id', 'prize_id', 'prize_ids', 'version_id', 'version_number',
               'previous_version_id', 'change', 'status', 'title', 'category',
               'reward_mode', 'reward_options', 'number_field', 'digits', 'rules_count',
               'material', 'notified', 'position', 'count'
             ]
             else array[]::text[]
           end
         )
      ),
      '{}'::jsonb
    )
  end
$$;

-- =============================================================================
-- 10. Privilegios (docs/SECURITY.md §4.5)
--
-- Las dos RPC que cambiaron de firma vuelven a concederse; las piezas internas
-- nuevas no las ejecuta ninguna sesion (I-078). Las funciones que solo
-- cambiaron de cuerpo conservan sus privilegios y no se tocan.
-- =============================================================================

revoke execute on function create_raffle_prize(uuid, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, jsonb, raffle_prize_digits, text) from public, anon;
revoke execute on function publish_raffle_prize_version(uuid, uuid, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, raffle_prize_digits, jsonb, text) from public, anon;
revoke execute on function raffle_prize_history(uuid, integer, integer) from public, anon;

grant execute on function create_raffle_prize(uuid, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, jsonb, raffle_prize_digits, text) to authenticated, service_role;
grant execute on function publish_raffle_prize_version(uuid, uuid, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, raffle_prize_digits, jsonb, text) to authenticated, service_role;
grant execute on function raffle_prize_history(uuid, integer, integer) to authenticated, service_role;

revoke execute on function raffle_prize_reward_json(uuid) from public, anon, authenticated;
revoke execute on function raffle_prize_normalized_reward(raffle_prize_reward_mode, jsonb) from public, anon, authenticated;
revoke execute on function raffle_prize_validity(uuid) from public, anon, authenticated;
revoke execute on function raffle_prize_clean_fields(text, raffle_prize_category, lottery_match_field, raffle_prize_digits, text) from public, anon, authenticated;
revoke execute on function raffle_prize_insert_version(uuid, uuid, uuid, uuid, integer, uuid, raffle_prize_status, text, raffle_prize_category, raffle_prize_reward_mode, jsonb, lottery_match_field, raffle_prize_digits, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function raffle_prize_audit_values(raffle_prize_versions, text, boolean, integer) from public, anon, authenticated;
revoke execute on function raffle_prize_reward_options_immutable() from public, anon, authenticated;
revoke execute on function raffle_prize_versions_require_reward() from public, anon, authenticated;
revoke execute on function raffle_prize_reward_options_check() from public, anon, authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA, nunca editar esta. Devuelve la recompensa a
-- las tres columnas de 0058 y el duplicado exacto a `raffle_prize_version_problem`.
-- SOLO es reversible sin perdida mientras ninguna version use `winner_choice` ni
-- una opcion con los dos componentes: eso no cabe en la representacion anterior.
--
--   -- 1. Comprobar que no haya nada que no quepa:
--   --    select count(*) from raffle_prize_versions where reward_mode <> 'fixed';
--   --    select count(*) from raffle_prize_reward_options where description is not null and amount is not null;
--   create type raffle_prize_reward_type as enum ('cash', 'in_kind');
--   alter table raffle_prize_versions
--     add column reward_type raffle_prize_reward_type,
--     add column reward_amount bigint,
--     add column reward_description text;
--   -- 2. Rellenar desde las opciones (con el disparador de versiones desactivado).
--   -- 3. Volver a poner los NOT NULL y el CHECK de 0058, y los cuerpos de 0058
--   --    de: create_raffle_prize, publish_raffle_prize_version,
--   --    raffle_prize_history, raffle_prize_insert_version,
--   --    raffle_prize_clean_fields, raffle_prize_audit_values,
--   --    raffle_prize_version_problem, raffle_prize_is_material,
--   --    archive_raffle_prize, restore_raffle_prize y admin_audit_redact.
--   drop trigger raffle_prize_reward_options_check on raffle_prize_reward_options;
--   drop function raffle_prize_reward_options_check();
--   drop trigger raffle_prize_versions_require_reward on raffle_prize_versions;
--   drop function raffle_prize_versions_require_reward();
--   drop function raffle_prize_validity(uuid);
--   drop function raffle_prize_normalized_reward(raffle_prize_reward_mode, jsonb);
--   drop function raffle_prize_reward_json(uuid);
--   drop table raffle_prize_reward_options;
--   drop function raffle_prize_reward_options_immutable();
--   alter table raffle_prize_versions drop column reward_mode;
--   drop type raffle_prize_reward_mode;
--
-- Las filas `raffle_prize.*` de `audit_logs` se conservan: la bitacora es de
-- solo anexado (BR-D02).
-- =============================================================================
