-- =============================================================================
-- 0058_raffle_prizes.sql
-- Premios configurables por rifa — Entrega 1: contrato, modelo, versiones,
-- autorizacion, auditoria y avisos
--
-- Referencia normativa: docs/DECISIONS.md D-199 (el contrato) y D-200 (la
-- capacidad central), docs/BUSINESS_RULES.md §12.i (BR-J01..BR-J14),
-- docs/SECURITY.md §4.20.
--
-- QUE HACE
--
-- Cada rifa en modo `configurable` puede tener sus propios premios. Un premio
-- es una IDENTIDAD estable (`raffle_prizes`) con VERSIONES inmutables
-- (`raffle_prize_versions`), y cada version tiene sus PERIODOS de calendario
-- (`raffle_prize_schedule_rules`). Cambiar un premio es publicar una version
-- nueva: nunca se reescribe una anterior y nada se borra.
--
-- Las escrituras son SEIS RPC transaccionales —crear, publicar, archivar,
-- restaurar, reordenar y leer el historial— autorizadas por la capacidad
-- central `raffles.prizes.manage` (`has_org_capability`). Ninguna recibe
-- organizacion ni actor: salen de la rifa y de `auth.uid()`.
--
-- QUE NO HACE
--
--   * No busca coincidencias con los premios: el motor configurable es la
--     Entrega 3. `match_lottery_result` y `lottery_ticket_matches` NO se tocan.
--   * No cambia ninguna rifa existente: todas nacen y siguen en modo `legacy`,
--     y ninguna sesion puede cambiar el modo (D-199, Decision 8).
--   * No reprocesa resultados ni reconstruye premios historicos.
--   * No toca ninguna politica, tabla ni funcion de la cartera (D-198).
--
-- SOBRE LAS TILDES. Las frases NUEVAS que puede leer una persona van
-- acentuadas; los comentarios siguen sin tildes, como el resto de migraciones.
-- La deuda de tildes de la base es I-030 y no se toca aqui.
-- =============================================================================

-- =============================================================================
-- 1. Tipos
-- =============================================================================

-- El sistema de premios de una rifa (BR-J13). `legacy` es el comparador fijo de
-- siempre (BR-L06); `configurable`, el de esta entrega.
create type raffle_prize_mode as enum ('legacy', 'configurable');

create type raffle_prize_status as enum ('active', 'archived');

-- INFORMATIVA (BR-J03): sirve para presentar y para plantillas. Nunca decide el
-- numero, las cifras, el calendario ni la loteria.
create type raffle_prize_category as enum ('main', 'daily', 'weekly', 'special');

create type raffle_prize_reward_type as enum ('cash', 'in_kind');

-- `four`: igualdad textual exacta con el numero mayor. `last_three`: las tres
-- ultimas cifras, con un numero de al menos tres caracteres (BR-J06).
create type raffle_prize_digits as enum ('four', 'last_three');

-- `corresponding`: la loteria del dia (BR-L01). `fixed`: una de las seis, solo
-- en su dia (BR-J05).
create type raffle_prize_lottery_mode as enum ('corresponding', 'fixed');

-- El numero de la boleta con el que juega un premio reutiliza
-- `lottery_match_field` (0036): es exactamente el mismo concepto.

-- =============================================================================
-- 2. Auxiliares puras del calendario
--
-- IMMUTABLE y sin sesion: las usan los CHECK de las reglas, asi que tienen que
-- dar siempre lo mismo. `service_role` necesita EXECUTE para insertar directo
-- (el privilegio de una funcion de un CHECK se comprueba contra quien inserta);
-- ninguna sesion lo tiene.
-- =============================================================================

-- El dia nominal de cada loteria, ISO 1 (lunes) .. 6 (sabado). Es la misma tabla
-- que `LOTTERY_NOMINAL_WEEKDAY` (features/lottery/sources.ts) y que usa el
-- importador del cronograma (BR-L01, D-143).
create function lottery_nominal_weekday(p_code lottery_code)
returns smallint
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_code
    when 'cundinamarca' then 1
    when 'cruz_roja'    then 2
    when 'meta'         then 3
    when 'bogota'       then 4
    when 'medellin'     then 5
    when 'boyaca'       then 6
  end::smallint
$$;

comment on function lottery_nominal_weekday(lottery_code) is
  'BR-L01: dia ISO nominal de cada loteria. Espejo de LOTTERY_NOMINAL_WEEKDAY.';

-- La inversa: la loteria que corresponde a un dia. El domingo no tiene ninguna.
create function lottery_for_weekday(p_weekday smallint)
returns lottery_code
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_weekday
    when 1 then 'cundinamarca'
    when 2 then 'cruz_roja'
    when 3 then 'meta'
    when 4 then 'bogota'
    when 5 then 'medellin'
    when 6 then 'boyaca'
  end::lottery_code
$$;

comment on function lottery_for_weekday(smallint) is
  'BR-J05: la loteria correspondiente de un dia ISO; NULL el domingo, que no tiene.';

-- Un conjunto de dias canonico: no vacio, sin repetidos, ordenado y SIN DOMINGO
-- (BR-J04). Canonico para que dos reglas iguales se guarden igual.
create function raffle_prize_weekdays_valid(p_weekdays smallint[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_weekdays is not null
     and cardinality(p_weekdays) between 1 and 6
     and array_position(p_weekdays, null) is null
     and p_weekdays <@ array[1, 2, 3, 4, 5, 6]::smallint[]
     and p_weekdays = (
       select array_agg(d order by d) from (select distinct d from unnest(p_weekdays) d) s
     )
$$;

comment on function raffle_prize_weekdays_valid(smallint[]) is
  'BR-J04: dias ISO 1..6, no vacios, sin repetidos y ordenados. El domingo (7) no tiene loteria.';

-- Cada dia elegido aparece al menos una vez en el periodo: «del 1 al 2 de
-- diciembre, los sabados» no produce ninguna fecha y no es un calendario.
-- Aritmetica de fechas pura, sin generate_series, para poder ser IMMUTABLE.
create function raffle_prize_rule_covers_weekdays(
  p_start    date,
  p_end      date,
  p_weekdays smallint[]
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_start is not null
     and p_end is not null
     and p_weekdays is not null
     and p_end >= p_start
     and not exists (
       select 1
       from unnest(p_weekdays) w
       where p_start + ((w - extract(isodow from p_start::timestamp)::int + 7) % 7) > p_end
     )
$$;

comment on function raffle_prize_rule_covers_weekdays(date, date, smallint[]) is
  'BR-J04: cada dia elegido cae al menos una vez entre la fecha inicial y la final.';

-- =============================================================================
-- 3. La capacidad central (D-200, BR-J10)
--
-- UN SOLO RESOLVEDOR para toda la base. Las RPC preguntan
-- `has_org_capability(org, 'raffles.prizes.manage')` y NUNCA miran el rol: el
-- dia que exista el modulo de permisos se reescribe el cuerpo de estas tres
-- funciones y ninguna RPC cambia.
--
-- La politica inicial es la del encargo:
--   * el Dueno activo tiene todas las capacidades del catalogo;
--   * el Administrador activo obtiene `raffles.prizes.manage` por
--     compatibilidad;
--   * el Vendedor no tiene ninguna.
--
-- Una capacidad que no esta en el catalogo es FALSE para todo el mundo, tambien
-- para el Dueno: un nombre mal escrito falla cerrado.
--
-- El espejo en la aplicacion es `src/lib/auth/capabilities.ts`, y una prueba de
-- base de datos compara las dos tablas para que no se separen.
-- =============================================================================

create function app_capability_catalog()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array['raffles.prizes.manage']::text[]
$$;

comment on function app_capability_catalog() is
  'D-200: catalogo cerrado de capacidades. Espejo de APP_CAPABILITIES.';

create function app_role_default_capabilities(p_role app_role)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_role
    when 'owner' then app_capability_catalog()
    when 'admin' then array['raffles.prizes.manage']::text[]
    else array[]::text[]
  end
$$;

comment on function app_role_default_capabilities(app_role) is
  'D-200: politica inicial por rol, mientras no exista el modulo de permisos. Espejo de ROLE_DEFAULT_CAPABILITIES.';

-- `has_org_role` (0001) comprueba de una vez que la membresia, el perfil y la
-- organizacion sigan activos (BR-A04). Esta hace lo mismo con la capacidad.
create function has_org_capability(p_org uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_capability = any (app_capability_catalog())
     and exists (
       select 1
       from memberships m
       join profiles p on p.id = m.profile_id
       join organizations o on o.id = m.organization_id
       where m.profile_id = auth.uid()
         and m.organization_id = p_org
         and m.is_active and p.is_active and o.is_active
         and p_capability = any (app_role_default_capabilities(m.role))
     )
$$;

comment on function has_org_capability(uuid, text) is
  'D-200: si quien llama tiene la capacidad en la organizacion, con cuenta, membresia y organizacion activas. Interna: la llaman las RPC.';

-- =============================================================================
-- 4. El modo de premios de cada rifa (BR-J13)
--
-- `add column ... default 'legacy'` con una constante no reescribe la tabla ni
-- dispara `audit_raffles`: TODAS las rifas existentes quedan en el sistema de
-- siempre sin un solo UPDATE.
-- =============================================================================

alter table raffles
  add column prize_mode raffle_prize_mode not null default 'legacy';

comment on column raffles.prize_mode is
  'BR-J13: legacy = comparador fijo de siempre (BR-L06); configurable = premios de raffle_prizes. Ninguna sesion lo cambia, y solo cambia en borrador.';

-- =============================================================================
-- 5. Las tres tablas
--
-- raffles
--  └─ raffle_prizes              identidad, orden, estado y version vigente
--      └─ raffle_prize_versions  condiciones inmutables, una por guardado
--          └─ raffle_prize_schedule_rules  periodos de esa version
--
-- CLAVES COMPUESTAS. Cada hija repite `organization_id` y lo ata con una FK
-- compuesta (D-007): una version no puede colgar de un premio de otra
-- organizacion, ni un periodo de una version ajena, venga la escritura de donde
-- venga.
--
-- LA VERSION VIGENTE ES UN PUNTERO CON ESTADO. `raffle_prizes` apunta a su
-- version vigente con `(current_version_id, id, status)`, que referencia
-- `(id, prize_id, status)` de la version: el estado del premio es SIEMPRE el de
-- su version vigente, y el puntero no puede apuntar a la version de otro premio.
--
-- EL CICLO SE CIERRA CON UNA FK DIFERIDA. La version nace antes que el premio
-- (el premio la necesita NOT NULL), asi que la FK version -> premio se
-- comprueba al COMMIT.
-- =============================================================================

create table raffle_prize_versions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations (id) on delete restrict,
  raffle_id           uuid not null,
  prize_id            uuid not null,
  version_number      integer not null check (version_number >= 1),
  previous_version_id uuid,
  -- Archivar y restaurar tambien son versiones: asi el historial dice cuando
  -- dejo de aplicar un premio y la version aplicable a un sorteo se decide con
  -- una sola regla (D-199, Decision 1).
  status              raffle_prize_status not null,
  title               text not null,
  category            raffle_prize_category not null,
  reward_type         raffle_prize_reward_type not null,
  reward_amount       bigint,
  reward_description  text,
  number_field        lottery_match_field not null,
  digits              raffle_prize_digits not null default 'four',
  conditions          text,
  -- `clock_timestamp()` y no `now()`: dos publicaciones del mismo premio en una
  -- transaccion larga no pueden compartir instante.
  published_at        timestamptz not null default clock_timestamp(),
  -- NULL = un proceso del sistema; la pantalla lo presenta como «Sistema».
  published_by        uuid references profiles (id) on delete restrict,

  constraint raffle_prize_versions_raffle_org_fk
    foreign key (raffle_id, organization_id)
    references raffles (id, organization_id) on delete restrict,
  constraint raffle_prize_versions_number_key unique (prize_id, version_number),
  constraint raffle_prize_versions_id_prize_key unique (id, prize_id),
  constraint raffle_prize_versions_id_prize_status_key unique (id, prize_id, status),
  constraint raffle_prize_versions_id_org_key unique (id, organization_id),
  constraint raffle_prize_versions_previous_fk
    foreign key (previous_version_id, prize_id)
    references raffle_prize_versions (id, prize_id) on delete restrict,
  constraint raffle_prize_versions_previous_check check (
    (version_number = 1) = (previous_version_id is null)
  ),
  -- Limites de BR-J14. Los mismos que PRIZE_LIMITS en la aplicacion, y una
  -- prueba los compara en el borde.
  constraint raffle_prize_versions_title_check check (
    title = btrim(title) and char_length(title) between 2 and 80
  ),
  constraint raffle_prize_versions_reward_check check (
    (reward_type = 'cash'
      and reward_amount is not null
      and reward_amount between 1 and 10000000000
      and reward_description is null)
    or
    (reward_type = 'in_kind'
      and reward_amount is null
      and reward_description is not null
      and reward_description = btrim(reward_description)
      and char_length(reward_description) between 2 and 160)
  ),
  constraint raffle_prize_versions_conditions_check check (
    conditions is null
    or (conditions = btrim(conditions) and char_length(conditions) between 1 and 1000)
  )
);

comment on table raffle_prize_versions is
  'BR-J01, BR-J09: condiciones inmutables de un premio. Cada guardado inserta una fila; ninguna se modifica ni se borra.';
comment on column raffle_prize_versions.digits is
  'BR-J06: four = igualdad textual exacta; last_three = tres ultimas cifras. Cuatro por defecto.';
comment on column raffle_prize_versions.published_at is
  'BR-J09: una version aplica a un sorteo si es la ultima publicada ANTES de su hora original anunciada.';

create table raffle_prizes (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations (id) on delete restrict,
  raffle_id          uuid not null,
  status             raffle_prize_status not null default 'active',
  -- Orden de presentacion entre los premios VIGENTES. Un archivado no ocupa
  -- sitio, asi que reordenar nunca choca con el.
  position           integer check (position >= 1),
  current_version_id uuid not null,
  created_by         uuid references profiles (id) on delete restrict,
  created_at         timestamptz not null default now(),
  archived_at        timestamptz,
  archived_by        uuid references profiles (id) on delete restrict,
  updated_at         timestamptz not null default now(),

  constraint raffle_prizes_raffle_org_fk
    foreign key (raffle_id, organization_id)
    references raffles (id, organization_id) on delete restrict,
  constraint raffle_prizes_id_org_key unique (id, organization_id),
  constraint raffle_prizes_id_raffle_org_key unique (id, raffle_id, organization_id),
  -- DEFERRABLE para que reordenar sea UNA sentencia: con una restriccion
  -- diferible la unicidad se comprueba al final de la sentencia, no fila a
  -- fila (el mismo recurso que `seller_payment_accounts`, 0051).
  constraint raffle_prizes_position_key
    unique (raffle_id, position) deferrable initially immediate,
  constraint raffle_prizes_position_status_check check (
    (status = 'active') = (position is not null)
  ),
  constraint raffle_prizes_archived_check check (
    (status = 'active' and archived_at is null and archived_by is null)
    or (status = 'archived' and archived_at is not null)
  ),
  constraint raffle_prizes_current_version_fk
    foreign key (current_version_id, id, status)
    references raffle_prize_versions (id, prize_id, status) on delete restrict
);

comment on table raffle_prizes is
  'BR-J01: identidad estable de un premio de una rifa. No se borra: se archiva con una version nueva.';
comment on column raffle_prizes.current_version_id is
  'BR-J09: la version vigente. La FK incluye el estado, asi que el del premio es siempre el de esa version.';

alter table raffle_prize_versions
  add constraint raffle_prize_versions_prize_fk
  foreign key (prize_id, raffle_id, organization_id)
  references raffle_prizes (id, raffle_id, organization_id)
  on delete restrict
  deferrable initially deferred;

create trigger raffle_prizes_set_updated_at
  before update on raffle_prizes
  for each row execute function set_updated_at();

create table raffle_prize_schedule_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete restrict,
  version_id      uuid not null,
  position        smallint not null check (position between 1 and 10),
  start_date      date not null,
  end_date        date not null,
  weekdays        smallint[] not null,
  lottery_mode    raffle_prize_lottery_mode not null,
  lottery_code    lottery_code,
  created_at      timestamptz not null default now(),

  constraint raffle_prize_schedule_rules_version_fk
    foreign key (version_id, organization_id)
    references raffle_prize_versions (id, organization_id) on delete restrict,
  constraint raffle_prize_schedule_rules_position_key unique (version_id, position),
  constraint raffle_prize_schedule_rules_dates_check check (end_date >= start_date),
  constraint raffle_prize_schedule_rules_weekdays_check check (
    raffle_prize_weekdays_valid(weekdays)
  ),
  constraint raffle_prize_schedule_rules_lottery_check check (
    (lottery_mode = 'fixed') = (lottery_code is not null)
  ),
  -- Una loteria fija solo juega en su dia nominal (BR-J05). Como la fecha de
  -- referencia ES ese dia nominal (D-143), en una fecha valida la fija y la
  -- correspondiente dan la misma loteria.
  constraint raffle_prize_schedule_rules_fixed_day_check check (
    lottery_mode = 'corresponding'
    or weekdays = array[lottery_nominal_weekday(lottery_code)]::smallint[]
  ),
  constraint raffle_prize_schedule_rules_covers_check check (
    raffle_prize_rule_covers_weekdays(start_date, end_date, weekdays)
  )
);

comment on table raffle_prize_schedule_rules is
  'BR-J04: periodos canonicos de una version: fecha inicial, final, dias ISO y loteria. Sin cron, sin RRULE y sin JSON.';
comment on column raffle_prize_schedule_rules.weekdays is
  'BR-J04: dias ISO 1 (lunes) .. 6 (sabado), ordenados y sin repetir. «Una fecha» es un periodo de un dia con su dia.';

-- =============================================================================
-- 6. Invariantes que ni la service role puede romper
-- =============================================================================

-- Una version no se modifica ni se borra, y la cadena es lineal: la 1 no tiene
-- anterior, cada una sigue a la ultima y se publica despues de ella.
create function raffle_prize_versions_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev raffle_prize_versions%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Una versión de un premio no se modifica ni se borra: los cambios se guardan como una versión nueva.';
  end if;

  if new.version_number = 1 then
    if exists (select 1 from raffle_prize_versions v where v.prize_id = new.prize_id) then
      raise exception 'Este premio ya tiene su primera versión.';
    end if;
    return new;
  end if;

  select * into v_prev from raffle_prize_versions v where v.id = new.previous_version_id;

  if not found
     or v_prev.prize_id <> new.prize_id
     or v_prev.version_number <> new.version_number - 1 then
    raise exception 'La versión anterior no corresponde a este premio.';
  end if;

  if exists (
    select 1 from raffle_prize_versions v
    where v.prize_id = new.prize_id and v.version_number > v_prev.version_number
  ) then
    raise exception 'Solo se puede publicar sobre la versión vigente del premio.';
  end if;

  if new.published_at <= v_prev.published_at then
    raise exception 'Una versión nueva tiene que publicarse después de la anterior.';
  end if;

  if new.raffle_id <> v_prev.raffle_id or new.organization_id <> v_prev.organization_id then
    raise exception 'Una versión nueva no cambia el premio de rifa.';
  end if;

  return new;
end;
$$;

create trigger raffle_prize_versions_guard
  before insert or update or delete on raffle_prize_versions
  for each row execute function raffle_prize_versions_guard();

-- Al COMMIT, toda version tiene al menos un periodo: un premio sin calendario no
-- es un estado posible (BR-J04).
create function raffle_prize_versions_require_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from raffle_prize_schedule_rules r where r.version_id = new.id
  ) then
    raise exception 'Un premio necesita al menos un período en su calendario.';
  end if;
  return null;
end;
$$;

create constraint trigger raffle_prize_versions_require_rules
  after insert on raffle_prize_versions
  deferrable initially deferred
  for each row execute function raffle_prize_versions_require_rules();

create function raffle_prize_schedule_rules_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'El calendario de una versión de un premio no se modifica ni se borra.';
end;
$$;

create trigger raffle_prize_schedule_rules_immutable
  before update or delete on raffle_prize_schedule_rules
  for each row execute function raffle_prize_schedule_rules_immutable();

-- Al COMMIT, cada periodo nuevo queda dentro de las fechas de la rifa y ningun
-- dia aparece en dos periodos de la misma version (BR-J04). Un periodo que se
-- solapa es ambiguo: no se sabe con que loteria ni cuantas veces cuenta.
create function raffle_prize_schedule_rules_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start date;
  v_end   date;
  v_day   timestamp;
begin
  select r.start_date, r.end_date into v_start, v_end
  from raffle_prize_versions v
  join raffles r on r.id = v.raffle_id
  where v.id = new.version_id;

  if new.start_date < v_start or new.end_date > v_end then
    raise exception 'Las fechas de un premio tienen que quedar dentro de las fechas de la rifa.';
  end if;

  select g.d into v_day
  from raffle_prize_schedule_rules r
  cross join lateral generate_series(r.start_date::timestamp, r.end_date::timestamp, interval '1 day') as g(d)
  where r.version_id = new.version_id
    and extract(isodow from g.d)::smallint = any (r.weekdays)
  group by g.d
  having count(*) > 1
  order by g.d
  limit 1;

  if v_day is not null then
    raise exception 'Dos períodos de un mismo premio no pueden incluir el mismo día (%).',
      to_char(v_day, 'DD/MM/YYYY');
  end if;

  return null;
end;
$$;

create constraint trigger raffle_prize_schedule_rules_check
  after insert on raffle_prize_schedule_rules
  deferrable initially deferred
  for each row execute function raffle_prize_schedule_rules_check();

-- El premio no cambia de rifa ni de autor, no se borra, nace con su version 1 y
-- su puntero solo avanza a la version mas reciente.
create function raffle_prizes_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_number integer;
  v_old_number integer;
  v_max_number integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'Un premio no se borra: se archiva.';
  end if;

  if tg_op = 'INSERT' then
    if not exists (
      select 1 from raffle_prize_versions v
      where v.id = new.current_version_id
        and v.prize_id = new.id
        and v.version_number = 1
    ) then
      raise exception 'Un premio nace con su primera versión.';
    end if;
    return new;
  end if;

  if new.id <> old.id
     or new.organization_id <> old.organization_id
     or new.raffle_id <> old.raffle_id
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Un premio no cambia de rifa, de organización ni de autor.';
  end if;

  if new.current_version_id is distinct from old.current_version_id then
    select v.version_number into v_new_number
      from raffle_prize_versions v where v.id = new.current_version_id;
    select v.version_number into v_old_number
      from raffle_prize_versions v where v.id = old.current_version_id;
    select max(v.version_number) into v_max_number
      from raffle_prize_versions v where v.prize_id = new.id;

    if v_new_number is null
       or v_new_number <> v_max_number
       or v_new_number <= v_old_number then
      raise exception 'Un premio solo puede apuntar a su versión más reciente.';
    end if;
  end if;

  return new;
end;
$$;

create trigger raffle_prizes_guard
  before insert or update or delete on raffle_prizes
  for each row execute function raffle_prizes_guard();

-- =============================================================================
-- 7. RLS y privilegios
--
-- LECTURA: los miembros activos de la organizacion leen los premios de sus
-- rifas, como leen las rifas (`raffles_select`, 0005). Son condiciones que se
-- comparten con vendedores y clientes, y no llevan nada de la cartera (D-198).
--
-- ESCRITURA: ninguna sesion. No hay politica de INSERT, UPDATE ni DELETE, y
-- `authenticated` solo tiene SELECT. Las seis RPC son la unica puerta, que es lo
-- que hace inevitables la capacidad, la version, la auditoria y el aviso.
--
-- PRIVILEGIOS ESCRITOS, TAMBIEN LOS QUE NO SE DAN (I-111): el esquema concede
-- SELECT por defecto a `authenticated` y todo a `service_role`. Aqui se revoca
-- todo y se concede lo justo. La service role no borra ni actualiza versiones
-- o periodos: tampoco los necesita.
-- =============================================================================

alter table raffle_prizes               enable row level security;
alter table raffle_prizes               force  row level security;
alter table raffle_prize_versions       enable row level security;
alter table raffle_prize_versions       force  row level security;
alter table raffle_prize_schedule_rules enable row level security;
alter table raffle_prize_schedule_rules force  row level security;

create policy raffle_prizes_select on raffle_prizes
for select to authenticated
using (organization_id in (select current_org_ids()));

create policy raffle_prize_versions_select on raffle_prize_versions
for select to authenticated
using (organization_id in (select current_org_ids()));

create policy raffle_prize_schedule_rules_select on raffle_prize_schedule_rules
for select to authenticated
using (organization_id in (select current_org_ids()));

revoke all on raffle_prizes               from public, anon, authenticated, service_role;
revoke all on raffle_prize_versions       from public, anon, authenticated, service_role;
revoke all on raffle_prize_schedule_rules from public, anon, authenticated, service_role;

grant select on raffle_prizes               to authenticated;
grant select on raffle_prize_versions       to authenticated;
grant select on raffle_prize_schedule_rules to authenticated;

grant select, insert, update on raffle_prizes               to service_role;
grant select, insert         on raffle_prize_versions       to service_role;
grant select, insert         on raffle_prize_schedule_rules to service_role;

-- =============================================================================
-- 8. Avisos: un kind nuevo (BR-J11)
--
-- Una fila por VERSION y destinatario: el indice unico es lo que hace el aviso
-- idempotente, y el motor inserta con `on conflict do nothing`. El texto vive en
-- `src/features/notifications/text.ts` (I-030, D-093).
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
    'raffle_prize.changed'
  ));

comment on constraint notifications_kind_check on notifications is
  'Kinds de equipo (0023), de loteria (0037), de recordatorio de pago (0052) y de premios (0058). El texto no vive aqui (I-030).';

create unique index notifications_raffle_prize_once
  on notifications (recipient_profile_id, entity_id)
  where kind = 'raffle_prize.changed';

-- =============================================================================
-- 9. Piezas internas de las RPC
--
-- SECURITY DEFINER, `search_path` fijo y SIN EXECUTE para ninguna sesion: solo
-- las llaman las RPC y los disparadores.
-- =============================================================================

-- El cerrojo de la configuracion de premios de una rifa. Lo toman las RPC y los
-- disparadores de fechas y activacion de `raffles`, para que ninguna
-- publicacion se cuele entre una validacion y su COMMIT. Es de aviso y no de
-- fila: un cerrojo de fila chocaria con `ticket_counter`, que se actualiza al
-- crear cada boleta.
create function raffle_prize_lock(p_raffle_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select pg_advisory_xact_lock(hashtextextended('raffle_prizes:' || p_raffle_id::text, 0))
$$;

-- La rifa cuyos premios quiere configurar quien llama, ya con el cerrojo.
-- Rechaza con el MISMO mensaje una rifa inexistente, de otra organizacion o sin
-- la capacidad: no se distingue «no existe» de «no es tuya».
create function raffle_prize_manageable_raffle(p_raffle_id uuid)
returns raffles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raffle raffles%rowtype;
begin
  perform require_auth();

  select * into v_raffle from raffles r where r.id = p_raffle_id;

  if not found
     or not has_org_capability(v_raffle.organization_id, 'raffles.prizes.manage') then
    raise exception 'La rifa no existe o no tienes permiso para configurar sus premios.'
      using errcode = 'insufficient_privilege';
  end if;

  perform raffle_prize_lock(v_raffle.id);

  -- Otra vez, ya con el cerrojo: las fechas o el estado pudieron cambiar
  -- mientras se esperaba.
  select * into v_raffle from raffles r where r.id = p_raffle_id;

  if v_raffle.prize_mode <> 'configurable' then
    raise exception 'Esta rifa todavía no usa premios configurables.'
      using errcode = 'check_violation';
  end if;

  if v_raffle.status in ('closed', 'cancelled') then
    raise exception 'La rifa está cerrada o anulada, así que sus premios ya no se pueden cambiar.'
      using errcode = 'check_violation';
  end if;

  return v_raffle;
end;
$$;

-- Normaliza y valida los campos de una version. Los mensajes dicen que falta y
-- como arreglarlo; los CHECK de la tabla son la red final.
create function raffle_prize_clean_fields(
  p_title              text,
  p_category           raffle_prize_category,
  p_reward_type        raffle_prize_reward_type,
  p_reward_amount      bigint,
  p_reward_description text,
  p_number_field       lottery_match_field,
  p_digits             raffle_prize_digits,
  p_conditions         text,
  out clean_title       text,
  out clean_description text,
  out clean_conditions  text
)
returns record
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
begin
  clean_title := btrim(coalesce(p_title, ''));
  clean_description := nullif(btrim(coalesce(p_reward_description, '')), '');
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
  if p_reward_type is null then
    raise exception 'Elige si el premio es en dinero o en especie.' using errcode = 'check_violation';
  end if;

  if p_reward_type = 'cash' then
    if p_reward_amount is null or p_reward_amount <= 0 then
      raise exception 'Escribe el valor del premio en pesos.' using errcode = 'check_violation';
    end if;
    if p_reward_amount > 10000000000 then
      raise exception 'El valor del premio no puede superar $10.000.000.000.' using errcode = 'check_violation';
    end if;
    if clean_description is not null then
      raise exception 'Un premio en dinero no lleva descripción: escribe solo su valor.' using errcode = 'check_violation';
    end if;
  else
    if p_reward_amount is not null then
      raise exception 'Un premio en especie no lleva valor en pesos: describe qué se entrega.' using errcode = 'check_violation';
    end if;
    if clean_description is null then
      raise exception 'Describe el premio en especie. Por ejemplo: una camioneta.' using errcode = 'check_violation';
    end if;
    if char_length(clean_description) < 2 then
      raise exception 'La descripción del premio debe tener al menos 2 caracteres.' using errcode = 'check_violation';
    end if;
    if char_length(clean_description) > 160 then
      raise exception 'La descripción del premio no puede superar 160 caracteres.' using errcode = 'check_violation';
    end if;
  end if;

  if clean_conditions is not null and char_length(clean_conditions) > 1000 then
    raise exception 'Las aclaraciones no pueden superar 1.000 caracteres.' using errcode = 'check_violation';
  end if;
end;
$$;

-- Valida los periodos que llegan de la aplicacion y los devuelve CANONICOS:
-- dias ordenados y sin repetir, y los periodos ordenados. Dos calendarios
-- iguales dan exactamente el mismo JSON, que es lo que permite saber si un
-- guardado no cambio nada. JSON solo como parametro: lo que se guarda son filas.
create function raffle_prize_normalized_rules(p_raffle raffles, p_rules jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_item      jsonb;
  v_start     date;
  v_end       date;
  v_days      smallint[];
  v_mode      raffle_prize_lottery_mode;
  v_code      lottery_code;
  v_weekday   smallint;
  v_rules     jsonb := '[]'::jsonb;
  v_plural    constant text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) = 0 then
    raise exception 'Agrega al menos un período al calendario del premio.' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(p_rules) > 10 then
    raise exception 'Un premio admite como máximo 10 períodos.' using errcode = 'check_violation';
  end if;

  for v_item in select value from jsonb_array_elements(p_rules)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'start_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or coalesce(v_item ->> 'end_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or jsonb_typeof(v_item -> 'weekdays') is distinct from 'array'
       or coalesce(v_item ->> 'lottery_mode', '') not in ('corresponding', 'fixed') then
      raise exception 'Revisa las fechas, los días y la lotería de cada período del premio.'
        using errcode = 'check_violation';
    end if;

    begin
      v_start := (v_item ->> 'start_date')::date;
      v_end := (v_item ->> 'end_date')::date;
    exception when others then
      raise exception 'Una de las fechas del calendario no existe. Revísala.'
        using errcode = 'check_violation';
    end;

    if v_end < v_start then
      raise exception 'En cada período, la fecha final no puede ser anterior a la inicial.'
        using errcode = 'check_violation';
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_item -> 'weekdays') w
      where jsonb_typeof(w) <> 'number' or (w #>> '{}') !~ '^[1-7]$'
    ) then
      raise exception 'Elige los días de la semana de cada período.' using errcode = 'check_violation';
    end if;

    select array_agg(d order by d) into v_days
    from (
      select distinct (w #>> '{}')::smallint as d
      from jsonb_array_elements(v_item -> 'weekdays') w
    ) s;

    if v_days is null then
      raise exception 'Elige al menos un día de la semana en cada período.' using errcode = 'check_violation';
    end if;

    if 7 = any (v_days) then
      raise exception 'El domingo no tiene lotería, así que un premio no puede jugar ese día.'
        using errcode = 'check_violation';
    end if;

    v_mode := (v_item ->> 'lottery_mode')::raffle_prize_lottery_mode;
    v_code := null;

    if v_mode = 'fixed' then
      if coalesce(v_item ->> 'lottery_code', '') not in (
        select unnest(enum_range(null::lottery_code))::text
      ) then
        raise exception 'Elige la lotería con la que juega el premio.' using errcode = 'check_violation';
      end if;

      v_code := (v_item ->> 'lottery_code')::lottery_code;
      v_weekday := lottery_nominal_weekday(v_code);

      if v_days <> array[v_weekday]::smallint[] then
        raise exception 'La lotería que elegiste solo juega los %. En ese período deja únicamente ese día.',
          v_plural[v_weekday]
          using errcode = 'check_violation';
      end if;
    elsif jsonb_typeof(v_item -> 'lottery_code') is not null
          and jsonb_typeof(v_item -> 'lottery_code') <> 'null' then
      raise exception 'Con la lotería correspondiente de cada día no se elige una lotería fija.'
        using errcode = 'check_violation';
    end if;

    if not raffle_prize_rule_covers_weekdays(v_start, v_end, v_days) then
      raise exception 'El período del % al % no incluye todos los días que elegiste. Revisa las fechas o los días.',
        to_char(v_start, 'DD/MM/YYYY'), to_char(v_end, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;

    if v_start < p_raffle.start_date or v_end > p_raffle.end_date then
      raise exception 'Las fechas del premio tienen que quedar dentro de las fechas de la rifa: del % al %.',
        to_char(p_raffle.start_date, 'DD/MM/YYYY'), to_char(p_raffle.end_date, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;

    v_rules := v_rules || jsonb_build_array(jsonb_build_object(
      'start_date',   v_start,
      'end_date',     v_end,
      'weekdays',     to_jsonb(v_days),
      'lottery_mode', v_mode,
      'lottery_code', v_code
    ));
  end loop;

  select coalesce(jsonb_agg(r order by
           r ->> 'start_date',
           r ->> 'end_date',
           (r -> 'weekdays')::text,
           r ->> 'lottery_mode',
           coalesce(r ->> 'lottery_code', '')), '[]'::jsonb)
    into v_rules
  from jsonb_array_elements(v_rules) r;

  return v_rules;
end;
$$;

-- Los periodos guardados de una version, con la MISMA forma canonica.
create function raffle_prize_rules_json(p_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'start_date',   r.start_date,
           'end_date',     r.end_date,
           'weekdays',     to_jsonb(r.weekdays),
           'lottery_mode', r.lottery_mode,
           'lottery_code', r.lottery_code
         ) order by r.position), '[]'::jsonb)
  from raffle_prize_schedule_rules r
  where r.version_id = p_version_id
$$;

-- Inserta una version y sus periodos, que ya llegan limpios y canonicos. El
-- orden de los periodos es el canonico: su posicion es su ordinal.
create function raffle_prize_insert_version(
  p_organization_id    uuid,
  p_raffle_id          uuid,
  p_prize_id           uuid,
  p_version_id         uuid,
  p_version_number     integer,
  p_previous_id        uuid,
  p_status             raffle_prize_status,
  p_title              text,
  p_category           raffle_prize_category,
  p_reward_type        raffle_prize_reward_type,
  p_reward_amount      bigint,
  p_reward_description text,
  p_number_field       lottery_match_field,
  p_digits             raffle_prize_digits,
  p_conditions         text,
  p_rules              jsonb,
  p_actor              uuid
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
    status, title, category, reward_type, reward_amount, reward_description,
    number_field, digits, conditions, published_by
  )
  values (
    p_version_id, p_organization_id, p_raffle_id, p_prize_id, p_version_number, p_previous_id,
    p_status, p_title, p_category, p_reward_type, p_reward_amount, p_reward_description,
    p_number_field, p_digits, p_conditions, p_actor
  )
  returning * into v_version;

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

-- Las fechas de referencia de una version, cada una con su loteria. Es la
-- expansion canonica: la usan la validacion, la materialidad y el corte. En una
-- fecha valida la loteria fija y la correspondiente coinciden (D-143).
create function raffle_prize_rule_dates(p_version_id uuid)
returns table (reference_date date, lottery_code lottery_code)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.d::date,
         coalesce(r.lottery_code, lottery_for_weekday(extract(isodow from g.d)::smallint))
  from raffle_prize_schedule_rules r
  cross join lateral generate_series(r.start_date::timestamp, r.end_date::timestamp, interval '1 day') as g(d)
  where r.version_id = p_version_id
    and extract(isodow from g.d)::smallint = any (r.weekdays)
$$;

-- El primer problema de una version dentro de su rifa, o NULL. Lo usan las RPC
-- al publicar y el disparador de activacion para cada premio vigente.
--
--   * un calendario sin periodos, fuera de la rifa o con un dia repetido;
--   * un sorteo FUTURO que la programacion oficial ya dio por cancelado: no va
--     a tener resultado (BR-J05). Lo pasado no se valida: no se puede arreglar;
--   * un duplicado exacto de otro premio vigente (BR-J08): mismo numero, mismas
--     cifras, misma recompensa y exactamente las mismas fechas.
create function raffle_prize_version_problem(
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

  with mine as (
    select array_agg(e.reference_date order by e.reference_date) as days
    from raffle_prize_rule_dates(p_version_id) e
  ),
  others as (
    select v.title,
           (select array_agg(e.reference_date order by e.reference_date)
              from raffle_prize_rule_dates(v.id) e) as days
    from raffle_prizes p
    join raffle_prize_versions v on v.id = p.current_version_id
    where p.raffle_id = v_version.raffle_id
      and p.status = 'active'
      and p.id <> v_version.prize_id
      and v.number_field = v_version.number_field
      and v.digits = v_version.digits
      and v.reward_type = v_version.reward_type
      and v.reward_amount is not distinct from v_version.reward_amount
      and lower(v.reward_description) is not distinct from lower(v_version.reward_description)
  )
  select o.title into v_other
  from others o, mine m
  where o.days = m.days
  order by o.title
  limit 1;

  if v_other is not null then
    return format(
      'Ya existe un premio con las mismas condiciones y la misma recompensa: «%s». Cambia algo de este o archiva el otro.',
      v_other
    );
  end if;

  return null;
end;
$$;

-- El corte de una ocurrencia es la hora ORIGINAL anunciada de su sorteo
-- (`original_scheduled_at`): llegada esa hora, la version que le aplica ya no
-- cambia, aunque el sorteo se aplace (BR-J09).
--
-- Una version nueva solo afecta a lo que todavia no se bloqueo, y eso se decide
-- con instantes: aplica la ultima version publicada ANTES del corte. Por eso la
-- unica duda posible es una ocurrencia cuyo corte no conocemos y que PODRIA
-- haber pasado ya: la de una semana que ya empezo. Ahi se falla de forma segura
-- en vez de suponer. Una semana que no ha empezado no puede haberse jugado,
-- porque la fecha de referencia es el dia nominal de la MISMA semana lunes a
-- domingo que el sorteo (D-143).
create function raffle_prize_cutoff_problem(p_version_ids uuid[])
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
  where s.original_scheduled_at is null
  order by d.reference_date
  limit 1
$$;

-- Si una version cambia algo que un vendedor necesita saber (BR-J11): la
-- recompensa, el numero, las cifras, las fechas o la loteria efectivas, el
-- estado o las aclaraciones. El nombre y la categoria NO: son presentacion. Las
-- fechas se comparan expandidas, asi que partir un periodo en dos no avisa.
create function raffle_prize_is_material(p_old_version_id uuid, p_new_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.status is distinct from n.status
      or o.reward_type is distinct from n.reward_type
      or o.reward_amount is distinct from n.reward_amount
      or o.reward_description is distinct from n.reward_description
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

-- Un aviso por membresia ACTIVA de la organizacion —Dueno, Administradores y
-- Vendedores—, menos quien hizo el cambio (BR-E10, BR-E12). Idempotente por
-- `notifications_raffle_prize_once`. `data` identifica la rifa y el premio y
-- nada mas: ni clientes, ni pagos, ni saldos, ni precios de venta.
create function raffle_prize_notify(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_raffle_name     text,
  p_prize_id        uuid,
  p_version_id      uuid,
  p_version_number  integer,
  p_title           text,
  p_change          text,
  p_actor           uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  insert into notifications (
    organization_id, recipient_profile_id, actor_profile_id,
    kind, entity_type, entity_id, data
  )
  select
    p_organization_id,
    m.profile_id,
    p_actor,
    'raffle_prize.changed',
    'raffle_prize_version',
    p_version_id,
    jsonb_build_object(
      'raffle_id',      p_raffle_id,
      'raffle_name',    p_raffle_name,
      'prize_id',       p_prize_id,
      'prize_title',    p_title,
      'version_number', p_version_number,
      'change',         p_change
    )
  from memberships m
  join profiles pr on pr.id = m.profile_id
  join organizations o on o.id = m.organization_id
  where m.organization_id = p_organization_id
    and m.role in ('owner', 'admin', 'seller')
    and m.is_active and pr.is_active and o.is_active
    and m.profile_id is distinct from p_actor
  on conflict (recipient_profile_id, entity_id) where kind = 'raffle_prize.changed'
    do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- El resumen de la bitacora: UNA fila semantica por guardado, con lo que
-- permite reconstruir que paso sin leer las versiones. Nada de la cartera.
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
    'reward_type',             p_version.reward_type,
    'reward_amount',           p_version.reward_amount,
    'number_field',            p_version.number_field,
    'digits',                  p_version.digits,
    'rules_count',             (select count(*) from raffle_prize_schedule_rules r where r.version_id = p_version.id),
    'material',                p_material,
    'notified',                p_notified
  )
$$;

-- La version que aplica a un sorteo, para el motor de la Entrega 3: la ULTIMA
-- publicada antes de su corte. Si esa version esta archivada, el premio no
-- aplica; si su calendario no incluye el dia, tampoco. Hoy no la llama nadie en
-- produccion: fija la regla de BR-J09 y la prueban `tests/db`.
create function raffle_prize_applicable_version(p_prize_id uuid, p_cutoff timestamptz)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.id
  from raffle_prize_versions v
  where v.prize_id = p_prize_id
    and v.published_at < p_cutoff
  order by v.version_number desc
  limit 1
$$;

-- =============================================================================
-- 10. Las RPC
--
-- Todas: `require_auth()`, capacidad sobre la organizacion DE LA RIFA, cerrojo
-- de la rifa, y rechazo de las rifas cerradas o anuladas (BR-J09). Ninguna
-- recibe organizacion, actor ni rol.
--
-- BORRADOR: se edita libremente, sin corte y sin avisos.
-- ACTIVA: cada cambio aplica a los sorteos que todavia no se bloquearon, y un
-- cambio material avisa a toda la organizacion.
-- =============================================================================

create function create_raffle_prize(
  p_raffle_id          uuid,
  p_title              text,
  p_category           raffle_prize_category,
  p_reward_type        raffle_prize_reward_type,
  p_number_field       lottery_match_field,
  p_rules              jsonb,
  p_reward_amount      bigint default null,
  p_reward_description text default null,
  p_digits             raffle_prize_digits default 'four',
  p_conditions         text default null
)
returns table (prize_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid         uuid := require_auth();
  v_raffle      raffles%rowtype;
  v_prize_id    uuid := gen_random_uuid();
  v_version_id  uuid := gen_random_uuid();
  v_version     raffle_prize_versions%rowtype;
  v_title       text;
  v_description text;
  v_conditions  text;
  v_rules       jsonb;
  v_active      integer;
  v_last        integer;
  v_problem     text;
  v_notified    integer := 0;
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

  select f.clean_title, f.clean_description, f.clean_conditions
    into v_title, v_description, v_conditions
  from raffle_prize_clean_fields(
    p_title, p_category, p_reward_type, p_reward_amount, p_reward_description,
    p_number_field, coalesce(p_digits, 'four'), p_conditions
  ) f;

  v_rules := raffle_prize_normalized_rules(v_raffle, p_rules);

  v_version := raffle_prize_insert_version(
    v_raffle.organization_id, v_raffle.id, v_prize_id, v_version_id, 1, null, 'active',
    v_title, p_category, p_reward_type, p_reward_amount, v_description,
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

comment on function create_raffle_prize(uuid, text, raffle_prize_category, raffle_prize_reward_type, lottery_match_field, jsonb, bigint, text, raffle_prize_digits, text) is
  'BR-J01..BR-J11: crea un premio con su version 1 en una rifa configurable. Cuatro cifras por defecto. No recibe organizacion ni actor.';

-- Publicar una version nueva. CONTROL OPTIMISTA: la persona manda la version
-- que estaba viendo; si ya no es la vigente, se rechaza con una frase que dice
-- que hacer. Un guardado que no cambia nada no crea version, ni bitacora, ni
-- aviso: devuelve la vigente.
--
-- Un premio ARCHIVADO tambien se puede corregir, y su version sigue archivada:
-- es la salida cuando las fechas de la rifa cambiaron mientras estaba archivado
-- y hay que ajustarlo antes de restaurarlo.
create function publish_raffle_prize_version(
  p_prize_id            uuid,
  p_expected_version_id uuid,
  p_title               text,
  p_category            raffle_prize_category,
  p_reward_type         raffle_prize_reward_type,
  p_number_field        lottery_match_field,
  p_digits              raffle_prize_digits,
  p_rules               jsonb,
  p_reward_amount       bigint default null,
  p_reward_description  text default null,
  p_conditions          text default null
)
returns table (prize_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid         uuid := require_auth();
  v_prize       raffle_prizes%rowtype;
  v_raffle      raffles%rowtype;
  v_old         raffle_prize_versions%rowtype;
  v_new         raffle_prize_versions%rowtype;
  v_new_id      uuid := gen_random_uuid();
  v_title       text;
  v_description text;
  v_conditions  text;
  v_rules       jsonb;
  v_problem     text;
  v_material    boolean;
  v_notified    integer := 0;
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

  select f.clean_title, f.clean_description, f.clean_conditions
    into v_title, v_description, v_conditions
  from raffle_prize_clean_fields(
    p_title, p_category, p_reward_type, p_reward_amount, p_reward_description,
    p_number_field, p_digits, p_conditions
  ) f;

  v_rules := raffle_prize_normalized_rules(v_raffle, p_rules);

  if v_old.title = v_title
     and v_old.category = p_category
     and v_old.reward_type = p_reward_type
     and v_old.reward_amount is not distinct from p_reward_amount
     and v_old.reward_description is not distinct from v_description
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
    v_title, p_category, p_reward_type, p_reward_amount, v_description,
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

comment on function publish_raffle_prize_version(uuid, uuid, text, raffle_prize_category, raffle_prize_reward_type, lottery_match_field, raffle_prize_digits, jsonb, bigint, text, text) is
  'BR-J09: publica una version nueva con control optimista. Sin cambios no escribe nada. En una rifa activa solo afecta sorteos no bloqueados y un cambio material avisa (BR-J11).';

-- Archivar es una version nueva con las mismas condiciones y estado archivado.
-- Una rifa ACTIVA no se queda sin premios vigentes.
create function archive_raffle_prize(p_prize_id uuid, p_expected_version_id uuid)
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
    v_old.title, v_old.category, v_old.reward_type, v_old.reward_amount,
    v_old.reward_description, v_old.number_field, v_old.digits, v_old.conditions,
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

comment on function archive_raffle_prize(uuid, uuid) is
  'BR-J01, BR-J09: archiva un premio con una version nueva. No borra nada. Una rifa activa conserva al menos un premio vigente.';

-- Restaurar vuelve a validar TODO contra la rifa de hoy: fechas, duplicados y
-- sorteos cancelados. El premio vuelve al final del orden.
create function restore_raffle_prize(p_prize_id uuid, p_expected_version_id uuid)
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
    v_old.title, v_old.category, v_old.reward_type, v_old.reward_amount,
    v_old.reward_description, v_old.number_field, v_old.digits, v_old.conditions,
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

comment on function restore_raffle_prize(uuid, uuid) is
  'BR-J09: devuelve a vigente un premio archivado con una version nueva, revalidando fechas, duplicados y sorteos cancelados.';

-- Reordenar es presentacion: NO crea version y NO avisa (BR-J11). Exige el
-- conjunto EXACTO de premios vigentes, sin repetidos ni ajenos.
create function reorder_raffle_prizes(p_raffle_id uuid, p_prize_ids uuid[])
returns table (prize_id uuid, "position" integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_raffle raffles%rowtype;
  v_active integer;
  v_same   boolean;
begin
  v_raffle := raffle_prize_manageable_raffle(p_raffle_id);

  select count(*) into v_active
  from raffle_prizes p
  where p.raffle_id = v_raffle.id and p.status = 'active';

  if p_prize_ids is null
     or coalesce(cardinality(p_prize_ids), 0) <> v_active
     or v_active <> (
       select count(*) from raffle_prizes p
       where p.raffle_id = v_raffle.id and p.status = 'active' and p.id = any (p_prize_ids)
     )
     or v_active <> (select count(distinct x) from unnest(p_prize_ids) x) then
    raise exception 'El orden que enviaste no corresponde a los premios vigentes de la rifa.'
      using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(p.id order by p.position), array[]::uuid[]) = p_prize_ids
    into v_same
  from raffle_prizes p
  where p.raffle_id = v_raffle.id and p.status = 'active';

  if not v_same then
    update raffle_prizes p
       set position = o.ord::integer
      from unnest(p_prize_ids) with ordinality as o(id, ord)
     where p.id = o.id
       and p.raffle_id = v_raffle.id;

    perform write_audit_log(
      v_raffle.organization_id, 'raffle_prize.reorder', 'raffle_prize', null,
      null,
      jsonb_build_object('raffle_id', v_raffle.id, 'prize_ids', to_jsonb(p_prize_ids), 'count', v_active)
    );
  end if;

  return query
    select p.id, p.position
    from raffle_prizes p
    where p.raffle_id = v_raffle.id and p.status = 'active'
    order by p.position;
end;
$$;

comment on function reorder_raffle_prizes(uuid, uuid[]) is
  'BR-J11: reordena los premios vigentes de una rifa. No crea version ni avisa; audita una vez si el orden cambia.';

-- El historial de un premio, paginado y del mas reciente al mas antiguo, con
-- sus periodos y quien publico cada version. Sale de las VERSIONES, no de la
-- bitacora (BR-J12). Solo lo lee quien puede configurar los premios; a los demas
-- —otra organizacion, un vendedor, un id que no existe— les devuelve cero filas.
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
  reward_type         raffle_prize_reward_type,
  reward_amount       bigint,
  reward_description  text,
  number_field        lottery_match_field,
  digits              raffle_prize_digits,
  conditions          text,
  rules               jsonb,
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
    v.reward_type,
    v.reward_amount,
    v.reward_description,
    v.number_field,
    v.digits,
    v.conditions,
    raffle_prize_rules_json(v.id),
    v.published_at,
    v.published_by,
    pr.full_name,
    total.n
  from raffle_prize_versions v
  join prize on prize.id = v.prize_id
  left join raffle_prize_versions prev on prev.id = v.previous_version_id
  left join profiles pr on pr.id = v.published_by
  cross join total
  order by v.version_number desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

comment on function raffle_prize_history(uuid, integer, integer) is
  'BR-J12: historial paginado de un premio desde sus versiones, con actor (NULL = Sistema). Solo con la capacidad raffles.prizes.manage; si no, cero filas.';

-- =============================================================================
-- 11. Las rifas: modo, fechas y activacion (BR-J13)
-- =============================================================================

create function raffles_guard_prize_config()
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
    if new.prize_mode <> 'legacy' and auth.uid() is not null then
      raise exception 'El sistema de premios de una rifa todavía no se elige desde la aplicación.'
        using errcode = 'insufficient_privilege';
    end if;
    if new.prize_mode = 'configurable' and new.status <> 'draft' then
      raise exception 'Una rifa con premios configurables nace en borrador y se activa cuando sus premios están listos.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.prize_mode is distinct from old.prize_mode then
    if auth.uid() is not null then
      raise exception 'El sistema de premios de una rifa todavía no se cambia desde la aplicación.'
        using errcode = 'insufficient_privilege';
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

create trigger raffles_guard_prize_config
  before insert or update of start_date, end_date, status, prize_mode on raffles
  for each row execute function raffles_guard_prize_config();

-- =============================================================================
-- 12. La bitacora del personal ve los premios (D-198)
--
-- `admin_audit_log` y `admin_audit_redact` se vuelven a escribir con UNA
-- entidad mas, `raffle_prize`, y su lista blanca de claves. Todo lo demas es el
-- cuerpo de 0057, sin tocar. Un premio no lleva nada de la cartera: ni cliente,
-- ni precio de venta, ni abonos.
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
               'reward_type', 'reward_amount', 'number_field', 'digits', 'rules_count',
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

create or replace function admin_audit_log(
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_limit       integer default 50,
  p_offset      integer default 0
)
returns table (
  id               bigint,
  organization_id  uuid,
  actor_profile_id uuid,
  action           text,
  entity_type      text,
  entity_id        uuid,
  old_values       jsonb,
  new_values       jsonb,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with visible as (
    select
      a.id,
      a.organization_id,
      a.actor_profile_id,
      a.action,
      a.entity_type,
      a.entity_id,
      admin_audit_redact(a.entity_type, a.old_values) as old_values,
      admin_audit_redact(a.entity_type, a.new_values) as new_values,
      a.created_at,
      (a.old_values is not null or a.new_values is not null) as had_values
    from audit_logs a
    where a.organization_id in (select current_staff_org_ids())
      and a.entity_type in ('ticket', 'raffle', 'membership', 'user', 'raffle_prize')
      and a.action not in (
        'ticket.assign_client', 'ticket.bulk_assign', 'ticket.update_sale_price',
        'ticket.reassign_client', 'ticket.release_client'
      )
      and (p_entity_type is null or a.entity_type = p_entity_type)
      and (p_entity_id is null or a.entity_id = p_entity_id)
  )
  select
    v.id, v.organization_id, v.actor_profile_id, v.action, v.entity_type, v.entity_id,
    v.old_values, v.new_values, v.created_at
  from visible v
  -- Una fila cuyos cambios eran TODOS sensibles —una venta, un cambio de
  -- precio— se queda sin claves y no se ensena: una fila vacia seguiria
  -- diciendo que paso algo con el dinero de esa boleta.
  where not (
    v.had_values
    and coalesce(v.old_values, '{}'::jsonb) = '{}'::jsonb
    and coalesce(v.new_values, '{}'::jsonb) = '{}'::jsonb
  )
  order by v.created_at desc, v.id desc
  limit least(greatest(coalesce(p_limit, 50), 0), 500)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- =============================================================================
-- 13. Privilegios de las funciones (docs/SECURITY.md §4.5)
--
-- Las seis RPC: sesion y service_role, nunca PUBLIC ni anon. `service_role` se
-- nombra a proposito: en produccion lo hereda del privilegio por defecto y en
-- local no (D-128).
--
-- Todo lo demas es interno: ninguna sesion lo ejecuta (I-078). Las auxiliares
-- de los CHECK si se conceden a `service_role`, que inserta directo.
-- =============================================================================

revoke execute on function create_raffle_prize(uuid, text, raffle_prize_category, raffle_prize_reward_type, lottery_match_field, jsonb, bigint, text, raffle_prize_digits, text) from public, anon;
revoke execute on function publish_raffle_prize_version(uuid, uuid, text, raffle_prize_category, raffle_prize_reward_type, lottery_match_field, raffle_prize_digits, jsonb, bigint, text, text) from public, anon;
revoke execute on function archive_raffle_prize(uuid, uuid) from public, anon;
revoke execute on function restore_raffle_prize(uuid, uuid) from public, anon;
revoke execute on function reorder_raffle_prizes(uuid, uuid[]) from public, anon;
revoke execute on function raffle_prize_history(uuid, integer, integer) from public, anon;

grant execute on function create_raffle_prize(uuid, text, raffle_prize_category, raffle_prize_reward_type, lottery_match_field, jsonb, bigint, text, raffle_prize_digits, text) to authenticated, service_role;
grant execute on function publish_raffle_prize_version(uuid, uuid, text, raffle_prize_category, raffle_prize_reward_type, lottery_match_field, raffle_prize_digits, jsonb, bigint, text, text) to authenticated, service_role;
grant execute on function archive_raffle_prize(uuid, uuid) to authenticated, service_role;
grant execute on function restore_raffle_prize(uuid, uuid) to authenticated, service_role;
grant execute on function reorder_raffle_prizes(uuid, uuid[]) to authenticated, service_role;
grant execute on function raffle_prize_history(uuid, integer, integer) to authenticated, service_role;

revoke execute on function lottery_nominal_weekday(lottery_code) from public, anon, authenticated;
revoke execute on function lottery_for_weekday(smallint) from public, anon, authenticated;
revoke execute on function raffle_prize_weekdays_valid(smallint[]) from public, anon, authenticated;
revoke execute on function raffle_prize_rule_covers_weekdays(date, date, smallint[]) from public, anon, authenticated;
grant  execute on function lottery_nominal_weekday(lottery_code) to service_role;
grant  execute on function lottery_for_weekday(smallint) to service_role;
grant  execute on function raffle_prize_weekdays_valid(smallint[]) to service_role;
grant  execute on function raffle_prize_rule_covers_weekdays(date, date, smallint[]) to service_role;

revoke execute on function app_capability_catalog() from public, anon, authenticated;
revoke execute on function app_role_default_capabilities(app_role) from public, anon, authenticated;
revoke execute on function has_org_capability(uuid, text) from public, anon, authenticated;

revoke execute on function raffle_prize_lock(uuid) from public, anon, authenticated;
revoke execute on function raffle_prize_manageable_raffle(uuid) from public, anon, authenticated;
revoke execute on function raffle_prize_clean_fields(text, raffle_prize_category, raffle_prize_reward_type, bigint, text, lottery_match_field, raffle_prize_digits, text) from public, anon, authenticated;
revoke execute on function raffle_prize_normalized_rules(raffles, jsonb) from public, anon, authenticated;
revoke execute on function raffle_prize_rules_json(uuid) from public, anon, authenticated;
revoke execute on function raffle_prize_insert_version(uuid, uuid, uuid, uuid, integer, uuid, raffle_prize_status, text, raffle_prize_category, raffle_prize_reward_type, bigint, text, lottery_match_field, raffle_prize_digits, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function raffle_prize_rule_dates(uuid) from public, anon, authenticated;
revoke execute on function raffle_prize_version_problem(uuid, date, date) from public, anon, authenticated;
revoke execute on function raffle_prize_cutoff_problem(uuid[]) from public, anon, authenticated;
revoke execute on function raffle_prize_is_material(uuid, uuid) from public, anon, authenticated;
revoke execute on function raffle_prize_notify(uuid, uuid, text, uuid, uuid, integer, text, text, uuid) from public, anon, authenticated;
revoke execute on function raffle_prize_audit_values(raffle_prize_versions, text, boolean, integer) from public, anon, authenticated;
revoke execute on function raffle_prize_applicable_version(uuid, timestamptz) from public, anon, authenticated;

revoke execute on function raffle_prize_versions_guard() from public, anon, authenticated;
revoke execute on function raffle_prize_versions_require_rules() from public, anon, authenticated;
revoke execute on function raffle_prize_schedule_rules_immutable() from public, anon, authenticated;
revoke execute on function raffle_prize_schedule_rules_check() from public, anon, authenticated;
revoke execute on function raffle_prizes_guard() from public, anon, authenticated;
revoke execute on function raffles_guard_prize_config() from public, anon, authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA, nunca editar esta. Borra los premios, sus
-- versiones y sus avisos; no toca boletas, pagos, resultados ni coincidencias,
-- porque esta entrega no los usa.
--
--   drop trigger raffles_guard_prize_config on raffles;
--   drop function raffles_guard_prize_config();
--   -- admin_audit_log y admin_audit_redact: volver a ejecutar sus cuerpos de 0057.
--   drop function raffle_prize_history(uuid, integer, integer);
--   drop function reorder_raffle_prizes(uuid, uuid[]);
--   drop function restore_raffle_prize(uuid, uuid);
--   drop function archive_raffle_prize(uuid, uuid);
--   drop function publish_raffle_prize_version(uuid, uuid, text, raffle_prize_category, raffle_prize_reward_type, lottery_match_field, raffle_prize_digits, jsonb, bigint, text, text);
--   drop function create_raffle_prize(uuid, text, raffle_prize_category, raffle_prize_reward_type, lottery_match_field, jsonb, bigint, text, raffle_prize_digits, text);
--   drop function raffle_prize_applicable_version(uuid, timestamptz);
--   drop function raffle_prize_audit_values(raffle_prize_versions, text, boolean, integer);
--   drop function raffle_prize_notify(uuid, uuid, text, uuid, uuid, integer, text, text, uuid);
--   drop function raffle_prize_is_material(uuid, uuid);
--   drop function raffle_prize_cutoff_problem(uuid[]);
--   drop function raffle_prize_version_problem(uuid, date, date);
--   drop function raffle_prize_rule_dates(uuid);
--   drop function raffle_prize_insert_version(uuid, uuid, uuid, uuid, integer, uuid, raffle_prize_status, text, raffle_prize_category, raffle_prize_reward_type, bigint, text, lottery_match_field, raffle_prize_digits, text, jsonb, uuid);
--   drop function raffle_prize_rules_json(uuid);
--   drop function raffle_prize_normalized_rules(raffles, jsonb);
--   drop function raffle_prize_clean_fields(text, raffle_prize_category, raffle_prize_reward_type, bigint, text, lottery_match_field, raffle_prize_digits, text);
--   drop function raffle_prize_manageable_raffle(uuid);
--   drop function raffle_prize_lock(uuid);
--   delete from notifications where kind = 'raffle_prize.changed';
--   drop index notifications_raffle_prize_once;
--   alter table notifications drop constraint notifications_kind_check;
--   alter table notifications add constraint notifications_kind_check check (kind in (
--     'team.member_added', 'team.sale', 'lottery.result', 'lottery.schedule_change',
--     'payment_reminder.due'));
--   alter table raffle_prizes drop constraint raffle_prizes_current_version_fk;
--   drop table raffle_prize_schedule_rules;
--   drop table raffle_prize_versions;
--   drop table raffle_prizes;
--   drop function raffle_prizes_guard();
--   drop function raffle_prize_schedule_rules_check();
--   drop function raffle_prize_schedule_rules_immutable();
--   drop function raffle_prize_versions_require_rules();
--   drop function raffle_prize_versions_guard();
--   alter table raffles drop column prize_mode;
--   drop function has_org_capability(uuid, text);
--   drop function app_role_default_capabilities(app_role);
--   drop function app_capability_catalog();
--   drop function raffle_prize_rule_covers_weekdays(date, date, smallint[]);
--   drop function raffle_prize_weekdays_valid(smallint[]);
--   drop function lottery_for_weekday(smallint);
--   drop function lottery_nominal_weekday(lottery_code);
--   drop type raffle_prize_lottery_mode;
--   drop type raffle_prize_digits;
--   drop type raffle_prize_reward_type;
--   drop type raffle_prize_category;
--   drop type raffle_prize_status;
--   drop type raffle_prize_mode;
--
-- Las filas `raffle_prize.*` de `audit_logs` se conservan: la bitacora es de
-- solo anexado (BR-D02).
-- =============================================================================
