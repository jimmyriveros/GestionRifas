-- =============================================================================
-- 0084 — Los numeros de una boleta los define su rifa: uno o dos grupos, con
--        nombre y cifras exactas (D-261; reglas BR-N19..BR-N27, BR-J24..BR-J26)
--
-- QUE CAMBIA. Hasta aqui toda boleta tenia DOS numeros de 1 a 4 cifras,
-- `daily_number` y `weekly_number`, llamados siempre «diario» y «semanal». Desde
-- esta migracion cada rifa dice, al crearse y para siempre:
--   * cuantos grupos de numeros tiene cada boleta: uno o dos;
--   * el nombre visible de cada grupo («Diario», «Mayor», «Seco», «Número»…);
--   * cuantas cifras EXACTAS tiene cada uno: 2, 3 o 4.
--
-- LA IDENTIDAD DE UN GRUPO ES SU RANURA, NO SU NOMBRE. El primer grupo vive en
-- `tickets.daily_number` y el segundo en `tickets.weekly_number`: las mismas dos
-- ranuras que ya nombra `lottery_match_field` en premios, coincidencias,
-- historial y cierre. Ningun nombre decide un calendario, una loteria ni una
-- regla de premios; llamar «Diario» a un grupo no lo hace jugar los lunes. El
-- orden en que aparecen es el de sus ranuras. No se renombra ninguna columna
-- (las de `tickets` siguen llamandose daily/weekly por historia).
--
-- ESTRUCTURA INMUTABLE. Cantidad, nombres y cifras se fijan al insertar la rifa
-- y ningun UPDATE los cambia —tampoco en borrador, tampoco con la clave de
-- servicio—: lo impide `raffles_guard_number_groups`.
--
-- FORMATO EXACTO EN LA BASE. `tickets_enforce_number_format` exige, al insertar,
-- al cambiar los numeros, al completar o aprobar una boleta y al venderla, que
-- cada numero tenga exactamente las cifras de su grupo y que una boleta de un
-- grupo no tenga segundo numero. NO RELLENA CEROS: un `7` en un grupo de cuatro
-- cifras se rechaza con su frase. Lo que ya existia y no cumple NO SE TOCA: se
-- sigue leyendo, cobrando, liberando y anulando tal cual, pero no se aprueba ni
-- se vende hasta que alguien corrija sus numeros (procedimiento: D-261).
--
-- UNICIDAD CON UN GRUPO. `tickets_combo_unique` no sirve: con el segundo numero
-- nulo, PostgreSQL considera distintas dos filas iguales. Cada boleta copia el
-- `number_group_count` de su rifa (lo pone el disparador, y nadie lo escribe) y
-- un indice unico PARCIAL `(organization_id, raffle_id, daily_number) where
-- number_group_count = 1` hace la unicidad, tambien en paralelo. Con dos grupos
-- sigue mandando `tickets_combo_unique`, como siempre.
--
-- LAS RIFAS QUE YA EXISTEN. Antes de darles configuracion, la seccion 1 las
-- audita y deja escrito, rifa por rifa, cuantas boletas no cumplirian el
-- formato que se les asigna. Todas reciben «Diario» de 4 cifras y «Semanal» de
-- 4: es la UNICA estructura que existia —ambos numeros obligatorios fuera del
-- borrador, comparados con el numero mayor de cuatro cifras— y la que tiene la
-- rifa en operacion. Ninguna boleta, venta, abono, premio, comision ni
-- resultado cambia. Las que no cumplen quedan en `raffle_number_format_audits`
-- y se listan con `admin_raffle_nonconforming_tickets`.
--
-- PREMIOS. Un premio usa un grupo (su ranura) y compara 4, 3 o 2 cifras, nunca
-- mas que las del grupo. El motor de siempre (rifas heredadas) no cambia. El
-- configurable suma la rama de las dos ultimas cifras y la prioridad pasa de
-- «cuatro sobre tres» a «4 > 3 > 2» con la misma unidad (cliente fotografiado,
-- rifa y resultado). Nada historico se recalcula: el motor solo corre al
-- confirmar un resultado nuevo.
--
-- ORDEN (D-259, D-262). Funciones, la tabla de auditoria —vacia y sin clave
-- foranea— y privilegios primero: no bloquean tablas vivas. TODO lo que toca
-- `tickets` o `raffles` —la auditoria, la clave foranea, los ALTER TABLE, sus
-- indices y disparadores y el catalogo publico— AL FINAL y en UN solo bloque
-- `do` (seccion 12), con los dos cerrojos pedidos seguidos: la CLI aplica el
-- archivo sentencia a sentencia y cada ida y vuelta con el cliente alarga lo que
-- dura un cerrojo. `create or replace` conserva los privilegios de las funciones
-- que ya existian.
-- =============================================================================

-- =============================================================================
-- 1. La tabla de la auditoria (sus filas, en la seccion 12)
-- =============================================================================

create table raffle_number_format_audits (
  raffle_id              uuid primary key,
  organization_id        uuid not null,
  audited_at             timestamptz not null default now(),
  source                 text not null default '0084',
  -- La configuracion que la migracion le asigna.
  number_group_count     smallint not null,
  first_group_name       text not null,
  first_group_digits     smallint not null,
  second_group_name      text,
  second_group_digits    smallint,
  -- Lo que encontro.
  tickets_count          integer not null,
  tickets_with_numbers   integer not null,
  nonconforming_count    integer not null,
  nonconforming_by_status jsonb not null,
  daily_lengths          jsonb not null,
  weekly_lengths         jsonb not null
  -- La clave foránea hacia raffles se añade al final, en el bloque de la sección 12
  -- (D-262): creada aquí, tomaría SHARE ROW EXCLUSIVE sobre raffles durante toda la
  -- migración y nadie podría crear boletas.
);

comment on table raffle_number_format_audits is
  'D-261: lo que encontro la 0084 en cada rifa que ya existia ANTES de asignarle sus grupos de numeros (todas «Diario» 4 + «Semanal» 4). nonconforming_count = boletas con algun numero que no tiene exactamente 4 cifras; ninguna se modifico. Solo la lee la service role.';

alter table raffle_number_format_audits enable row level security;
alter table raffle_number_format_audits force row level security;
revoke all on raffle_number_format_audits from public, anon, authenticated, service_role;
grant select on raffle_number_format_audits to service_role;

-- Sus filas se escriben al final, en el bloque de la sección 12, DESPUÉS de tomar
-- los cerrojos de tickets y raffles (D-262): describen las boletas que había
-- exactamente cuando cambió la estructura.

-- =============================================================================
-- 2. Las reglas, en funciones puras con las frases de la pantalla
--
-- Cada frase vive TAMBIEN en `src/lib/ticket-number-format.ts`, y una prueba de
-- base las compara letra por letra (`tests/db/raffle-number-groups.test.ts`).
-- Cambiar una es cambiar las dos, con una migracion nueva.
-- =============================================================================

-- 2.1 Como se escribe un numero de ejemplo de N cifras ------------------------
create function ticket_number_digits_word(p_digits smallint)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_digits when 2 then 'dos' when 3 then 'tres' when 4 then 'cuatro' end
$$;

-- 2.2 Los grupos de una rifa, al crearla ----------------------------------------
-- NULL = valen. Nombres ya sin espacios exteriores (los quita el disparador).
create function raffle_number_groups_problem(
  p_count         smallint,
  p_first_name    text,
  p_first_digits  smallint,
  p_second_name   text,
  p_second_digits smallint
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_count is null or p_count not in (1, 2)
      then 'Cada boleta tiene uno o dos números.'
    when p_first_name is null or p_first_name = ''
      then 'Escribe el nombre del primer número.'
    when p_count = 2 and (p_second_name is null or p_second_name = '')
      then 'Escribe el nombre del segundo número.'
    when p_count = 1 and (p_second_name is not null or p_second_digits is not null)
      then 'Con un solo número por boleta no hay segundo número.'
    when char_length(p_first_name) not between 2 and 20
      or (p_count = 2 and char_length(p_second_name) not between 2 and 20)
      then 'El nombre de cada número tiene de 2 a 20 caracteres.'
    when p_first_name ~ '[[:cntrl:]]' or (p_count = 2 and p_second_name ~ '[[:cntrl:]]')
      then 'El nombre de cada número va en una sola línea, sin caracteres invisibles.'
    when p_first_digits is null or p_first_digits not in (2, 3, 4)
      or (p_count = 2 and (p_second_digits is null or p_second_digits not in (2, 3, 4)))
      then 'Cada número tiene 2, 3 o 4 cifras.'
    when p_count = 2 and lower(p_first_name) = lower(p_second_name)
      then 'Los dos números necesitan nombres distintos.'
  end
$$;

-- 2.3 Los numeros de UNA boleta contra los grupos de su rifa -------------------
-- `p_require_complete`: fuera del borrador, cada grupo necesita su numero.
-- NULL = valen. NUNCA rellena ni recorta: dice que escribir.
create function ticket_numbers_problem(
  p_count            smallint,
  p_first_name       text,
  p_first_digits     smallint,
  p_second_name      text,
  p_second_digits    smallint,
  p_daily            text,
  p_weekly           text,
  p_require_complete boolean
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_slot   integer;
  v_value  text;
  v_name   text;
  v_digits smallint;
begin
  if p_count = 1 and p_weekly is not null then
    return format('Esta rifa tiene un solo número por boleta («%s»): la boleta no lleva otro número.',
                  p_first_name);
  end if;

  for v_slot in 1 .. p_count loop
    if v_slot = 1 then
      v_value := p_daily;  v_name := p_first_name;  v_digits := p_first_digits;
    else
      v_value := p_weekly; v_name := p_second_name; v_digits := p_second_digits;
    end if;

    if v_value is null or v_value = '' then
      if p_require_complete then
        return format('Escribe el número «%s».', v_name);
      end if;
      continue;
    end if;

    if v_value !~ '^[0-9]+$' then
      return format('El número «%s» lleva solo cifras, sin letras ni símbolos.', v_name);
    end if;

    if char_length(v_value) < v_digits then
      return format('El número «%s» lleva exactamente %s cifras: escribe %s.',
                    v_name, v_digits, lpad(v_value, v_digits, '0'));
    end if;

    if char_length(v_value) > v_digits then
      return format('El número «%s» lleva exactamente %s cifras, y %s tiene %s.',
                    v_name, v_digits, v_value, char_length(v_value));
    end if;
  end loop;

  return null;
end;
$$;

-- 2.4 Lo mismo, leyendo la rifa -------------------------------------------------
create function raffle_ticket_numbers_problem(
  p_raffle_id        uuid,
  p_daily            text,
  p_weekly           text,
  p_require_complete boolean
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return (
    select ticket_numbers_problem(
             r.number_group_count, r.first_group_name, r.first_group_digits,
             r.second_group_name, r.second_group_digits,
             p_daily, p_weekly, p_require_complete)
      from raffles r
     where r.id = p_raffle_id
  );
end;
$$;

-- 2.5 Cuantas cifras compara un premio ------------------------------------------
create function raffle_prize_digits_count(p_digits raffle_prize_digits)
returns smallint
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_digits
           when 'four' then 4
           when 'last_three' then 3
           when 'last_two' then 2
         end::smallint
$$;

-- =============================================================================
-- 3. La rifa: grupos validos al crearla, y nunca mas un cambio
-- =============================================================================

-- SECURITY DEFINER: las reglas puras de la seccion 2 no las ejecuta ninguna
-- sesion (seccion 11), y la rifa se inserta con la de quien la crea.
create function raffles_guard_number_groups()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_problem text;
begin
  if tg_op = 'INSERT' then
    -- Sin espacios exteriores, para comparar y para pintar.
    new.first_group_name  := btrim(new.first_group_name);
    new.second_group_name := nullif(btrim(new.second_group_name), '');

    v_problem := raffle_number_groups_problem(
      new.number_group_count, new.first_group_name, new.first_group_digits,
      new.second_group_name, new.second_group_digits);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- D-261: la estructura de los numeros es para siempre, tambien en borrador y
  -- venga de donde venga. Las boletas ya generadas dependen de ella.
  if new.number_group_count  is distinct from old.number_group_count
     or new.first_group_name    is distinct from old.first_group_name
     or new.first_group_digits  is distinct from old.first_group_digits
     or new.second_group_name   is distinct from old.second_group_name
     or new.second_group_digits is distinct from old.second_group_digits then
    raise exception 'Los números de una rifa no se cambian después de crearla: ni cuántos son, ni sus nombres, ni sus cifras.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 4. La boleta: el formato exacto de su rifa
--
-- Se comprueba al INSERTAR, al cambiar los numeros o la rifa, al completar o
-- aprobar (de borrador o pendiente a disponible o asignada) y al VENDER (de
-- disponible a asignada). No al cobrar, liberar ni anular: una boleta que ya
-- existia fuera de formato se puede seguir gestionando, no meter en una venta.
-- `number_group_count` lo pone SIEMPRE la rifa: nadie lo escribe.
-- =============================================================================

-- SECURITY DEFINER por lo mismo: la boleta la escribe una sesion —un vendedor
-- por PostgREST— y la regla no se le concede. Solo lee la rifa de la fila.
create function tickets_enforce_number_format()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count         smallint;
  v_first_name    text;
  v_first_digits  smallint;
  v_second_name   text;
  v_second_digits smallint;
  v_numbers_set   boolean;
  v_entering      boolean;
  v_problem       text;
begin
  if tg_op = 'UPDATE' then
    v_numbers_set := new.daily_number is distinct from old.daily_number
                  or new.weekly_number is distinct from old.weekly_number
                  or new.raffle_id is distinct from old.raffle_id;
    v_entering := (old.inventory_status in ('draft', 'pending_approval')
                   and new.inventory_status in ('available', 'assigned'))
               or (old.inventory_status = 'available' and new.inventory_status = 'assigned');

    if not v_numbers_set and not v_entering
       and new.number_group_count is not distinct from old.number_group_count then
      return new;
    end if;
  else
    v_numbers_set := true;
    v_entering := false;
  end if;

  select r.number_group_count, r.first_group_name, r.first_group_digits,
         r.second_group_name, r.second_group_digits
    into v_count, v_first_name, v_first_digits, v_second_name, v_second_digits
    from raffles r
   where r.id = new.raffle_id;

  if not found then
    -- La FK de la rifa responde con su propio error.
    return new;
  end if;

  new.number_group_count := v_count;

  if not v_numbers_set and not v_entering then
    return new;
  end if;

  v_problem := ticket_numbers_problem(
    v_count, v_first_name, v_first_digits, v_second_name, v_second_digits,
    new.daily_number, new.weekly_number, new.inventory_status <> 'draft');

  if v_problem is null then
    return new;
  end if;

  if v_numbers_set then
    raise exception '%', v_problem using errcode = 'check_violation';
  end if;

  -- Una boleta que YA existia fuera de formato y ahora entra en una venta o se
  -- aprueba: se dice cual y por que, sin tocar sus numeros.
  raise exception 'La boleta % no tiene el formato de esta rifa. % Hasta que se corrijan sus números, no se puede aprobar ni vender.',
    case when v_count = 1 or new.weekly_number is null
         then coalesce(new.daily_number, '—')
         else coalesce(new.daily_number, '—') || ' / ' || new.weekly_number
    end,
    v_problem
    using errcode = 'check_violation';
end;
$$;

-- =============================================================================
-- 5. El generador por rangos lee la rifa (BR-N15, D-261)
--
-- El ANCHO lo da el grupo, no lo escrito: con cuatro cifras, del 0 al 5 sale
-- 0000…0005. Un extremo con mas cifras que el grupo se rechaza; nunca se recorta.
-- Las generaciones nuevas guardan sus extremos ya con el ancho de su grupo, y
-- con un solo grupo los del segundo van nulos.
-- =============================================================================

-- 5.1 Por que no vale el rango de un grupo --------------------------------------
create function ticket_generation_group_range_problem(
  p_from   text,
  p_to     text,
  p_digits smallint,
  p_name   text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_from is null or p_to is null or p_from = '' or p_to = ''
      then format('Escribe el primer y el último número del rango de «%s».', p_name)
    when p_from !~ '^[0-9]+$' or p_to !~ '^[0-9]+$'
      then format('Escribe el rango de «%s» solo con cifras, sin letras ni símbolos.', p_name)
    when char_length(p_from) > p_digits or char_length(p_to) > p_digits
      then format('El número «%s» tiene %s cifras: su rango va como mucho del %s al %s.',
                  p_name, p_digits, repeat('0', p_digits), repeat('9', p_digits))
    when p_from::integer > p_to::integer
      then format('En el rango de «%s», el primer número no puede ser mayor que el último.', p_name)
  end
$$;

-- 5.2 Los extremos de una generacion, con el ancho de la rifa -------------------
-- Devuelve los cuatro textos ya rellenados con ceros —el formato final que se
-- ve en la vista previa— o lanza la frase del primer problema. Con un grupo,
-- el segundo par sale nulo y se ignora lo que se haya escrito en el.
create function ticket_generation_padded_ranges(
  p_raffle      raffles,
  p_daily_from  text,
  p_daily_to    text,
  p_weekly_from text,
  p_weekly_to   text
)
returns table (daily_from text, daily_to text, weekly_from text, weekly_to text, total_count bigint)
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_problem text;
begin
  v_problem := ticket_generation_group_range_problem(
    p_daily_from, p_daily_to, p_raffle.first_group_digits, p_raffle.first_group_name);
  if v_problem is null and p_raffle.number_group_count = 2 then
    v_problem := ticket_generation_group_range_problem(
      p_weekly_from, p_weekly_to, p_raffle.second_group_digits, p_raffle.second_group_name);
  end if;
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;

  daily_from := lpad(p_daily_from, p_raffle.first_group_digits, '0');
  daily_to   := lpad(p_daily_to,   p_raffle.first_group_digits, '0');
  if p_raffle.number_group_count = 2 then
    weekly_from := lpad(p_weekly_from, p_raffle.second_group_digits, '0');
    weekly_to   := lpad(p_weekly_to,   p_raffle.second_group_digits, '0');
    total_count := (daily_to::bigint - daily_from::bigint + 1)
                   * (weekly_to::bigint - weekly_from::bigint + 1);
  else
    weekly_from := null;
    weekly_to   := null;
    total_count := daily_to::bigint - daily_from::bigint + 1;
  end if;
  return next;
end;
$$;

-- 5.3 La vista previa ------------------------------------------------------------
create or replace function admin_ticket_generation_preview(
  p_raffle_id   uuid,
  p_daily_from  text,
  p_daily_to    text,
  p_weekly_from text,
  p_weekly_to   text
)
returns table (
  total_count              bigint,
  existing_count           bigint,
  existing_generated_count bigint,
  in_progress_run_id       uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_raffle  raffles%rowtype;
  v_range   record;
begin
  perform require_auth();

  select * into v_raffle from raffles r where r.id = p_raffle_id;
  if not found or not is_org_staff(v_raffle.organization_id) then
    raise exception 'La rifa no existe o no tienes acceso a ella.';
  end if;

  select * into v_range
    from ticket_generation_padded_ranges(v_raffle, p_daily_from, p_daily_to,
                                         p_weekly_from, p_weekly_to);

  return query
  select
    v_range.total_count,
    count(t.id),
    count(t.id) filter (where t.generation_run_id is not null),
    (select g.id
       from ticket_generation_runs g
      where g.raffle_id = p_raffle_id
        and g.status = 'in_progress'
        and g.daily_from = v_range.daily_from and g.daily_to = v_range.daily_to
        and g.weekly_from is not distinct from v_range.weekly_from
        and g.weekly_to is not distinct from v_range.weekly_to
      order by g.created_at desc
      limit 1)
  from tickets t
  where t.organization_id = v_raffle.organization_id
    and t.raffle_id = p_raffle_id
    and char_length(t.daily_number) = char_length(v_range.daily_from)
    and t.daily_number between v_range.daily_from and v_range.daily_to
    and (
      v_raffle.number_group_count = 1
      or (char_length(t.weekly_number) = char_length(v_range.weekly_from)
          and t.weekly_number between v_range.weekly_from and v_range.weekly_to)
    );
end;
$$;

-- 5.4 Empezar una generacion -----------------------------------------------------
create or replace function admin_start_ticket_generation(
  p_raffle_id   uuid,
  p_daily_from  text,
  p_daily_to    text,
  p_weekly_from text,
  p_weekly_to   text,
  p_request_id  uuid
)
returns table (
  outcome                  text,
  run_id                   uuid,
  raffle_id                uuid,
  daily_from               text,
  daily_to                 text,
  weekly_from              text,
  weekly_to                text,
  total_count              integer,
  processed_count          integer,
  created_count            integer,
  existing_count           integer,
  existing_generated_count integer,
  status                   text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_raffle  raffles%rowtype;
  v_run     ticket_generation_runs%rowtype;
  v_outcome text;
  v_range   record;
begin
  if p_request_id is null then
    raise exception 'Falta el identificador de la solicitud. Vuelve a abrir el generador.';
  end if;

  select * into v_raffle from raffles r where r.id = p_raffle_id;
  if not found or not is_org_staff(v_raffle.organization_id) then
    raise exception 'La rifa no existe o no tienes acceso a ella.';
  end if;

  -- Los extremos con el ancho de la rifa: «0» y «0000» son la misma generacion.
  select * into v_range
    from ticket_generation_padded_ranges(v_raffle, p_daily_from, p_daily_to,
                                         p_weekly_from, p_weekly_to);

  -- La misma solicitud, otra vez: lo que se creo la primera.
  select * into v_run
    from ticket_generation_runs g
   where g.organization_id = v_raffle.organization_id
     and g.request_id = p_request_id;

  if found then
    if v_run.raffle_id <> p_raffle_id
       or v_run.daily_from <> v_range.daily_from or v_run.daily_to <> v_range.daily_to
       or v_run.weekly_from is distinct from v_range.weekly_from
       or v_run.weekly_to is distinct from v_range.weekly_to then
      raise exception 'Esta solicitud ya se usó para otra generación. Vuelve a abrir el generador.';
    end if;
    v_outcome := 'existing_request';
  else
    -- BR-R08: rifas cerradas o anuladas no admiten boletas nuevas.
    if v_raffle.status not in ('draft', 'active') then
      raise exception 'La rifa está % y ya no admite boletas nuevas.', raffle_status_word(v_raffle.status);
    end if;

    -- BR-N16: tope TECNICO de una generacion, con la explicacion visible.
    if v_range.total_count > ticket_generation_max() then
      raise exception 'Esos rangos dan % combinaciones. El generador crea hasta % de una vez: acorta uno de los dos rangos.',
        format_count(v_range.total_count), format_count(ticket_generation_max());
    end if;

    -- I-161: el codigo interno tiene seis cifras.
    if v_raffle.ticket_counter + v_range.total_count > ticket_internal_code_capacity() then
      raise exception 'Esta rifa ya no tiene códigos internos para % boletas más. Genera menos combinaciones.',
        format_count(v_range.total_count);
    end if;

    -- La misma generacion sin terminar: se continua, no se empieza otra.
    select * into v_run
      from ticket_generation_runs g
     where g.raffle_id = p_raffle_id
       and g.status = 'in_progress'
       and g.daily_from = v_range.daily_from and g.daily_to = v_range.daily_to
       and g.weekly_from is not distinct from v_range.weekly_from
       and g.weekly_to is not distinct from v_range.weekly_to
     order by g.created_at desc
     limit 1;

    if found then
      v_outcome := 'resumed';
    else
      insert into ticket_generation_runs (
        organization_id, raffle_id, request_id, daily_from, daily_to,
        weekly_from, weekly_to, total_count, created_by
      ) values (
        v_raffle.organization_id, p_raffle_id, p_request_id,
        v_range.daily_from, v_range.daily_to, v_range.weekly_from, v_range.weekly_to,
        v_range.total_count::integer, v_uid
      )
      returning * into v_run;

      perform write_audit_log(
        v_raffle.organization_id, 'ticket.generation_start', 'ticket_generation', v_run.id, null,
        jsonb_build_object('raffle_id', p_raffle_id,
                           'daily_from', v_range.daily_from, 'daily_to', v_range.daily_to,
                           'weekly_from', v_range.weekly_from, 'weekly_to', v_range.weekly_to,
                           'total_count', v_range.total_count)
      );
      v_outcome := 'created';
    end if;
  end if;

  return query
  select v_outcome, v_run.id, v_run.raffle_id, v_run.daily_from, v_run.daily_to,
         v_run.weekly_from, v_run.weekly_to, v_run.total_count, v_run.processed_count,
         v_run.created_count, v_run.existing_count, v_run.existing_generated_count,
         v_run.status;
end;
$$;

-- 5.5 Procesar el bloque siguiente ------------------------------------------------
-- El cuerpo de la 0081 (con D-260) y, con un grupo, el segundo numero nulo: el
-- indice k es el numero y la unicidad la da `tickets_single_group_unique`. Con
-- dos grupos, lo de siempre. El ancho es el de los extremos guardados, que en
-- las generaciones nuevas es el del grupo (5.2).
create or replace function admin_process_ticket_generation(p_run_id uuid, p_processed_count integer)
returns table (
  outcome                  text,
  run_id                   uuid,
  raffle_id                uuid,
  daily_from               text,
  daily_to                 text,
  weekly_from              text,
  weekly_to                text,
  total_count              integer,
  processed_count          integer,
  created_count            integer,
  existing_count           integer,
  existing_generated_count integer,
  status                   text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
-- El destino del ON CONFLICT de un solo numero nombra columnas que tambien son
-- parametros de salida (`raffle_id`); un indice parcial no tiene nombre de
-- restriccion que usar. Todo lo demas del cuerpo va calificado.
#variable_conflict use_column
declare
  v_uid        uuid := require_auth();
  v_run        ticket_generation_runs%rowtype;
  v_raffle     raffles%rowtype;
  v_outcome    text;
  v_single     boolean;
  v_from       integer;
  v_to         integer;
  v_dfrom      integer;
  v_wfrom      integer;
  v_wspan      integer;
  v_dw         integer;
  v_ww         integer;
  v_missing    integer;
  v_inserted   integer;
  v_generated  integer;
begin
  select * into v_run from ticket_generation_runs g where g.id = p_run_id for update;
  if not found or not is_org_staff(v_run.organization_id) then
    raise exception 'La generación no existe o no tienes acceso a ella.';
  end if;

  if v_run.status = 'completed' then
    v_outcome := 'completed';
  elsif p_processed_count is null or p_processed_count < v_run.processed_count then
    v_outcome := 'already_processed';
  elsif p_processed_count > v_run.processed_count then
    raise exception 'El avance de la generación no coincide con lo guardado. Vuelve a abrirla para continuar.';
  else
    -- La rifa bloqueada: serializa con cualquier otra creacion de boletas en
    -- ella (las demas reservan codigos con un UPDATE de esta misma fila).
    select * into v_raffle from raffles r where r.id = v_run.raffle_id for update;

    if v_raffle.status not in ('draft', 'active') then
      raise exception 'La rifa está % y ya no admite boletas nuevas.', raffle_status_word(v_raffle.status);
    end if;

    v_single := v_run.weekly_from is null;
    v_dfrom  := v_run.daily_from::integer;
    v_dw     := char_length(v_run.daily_from);
    if v_single then
      v_wfrom := 0;
      v_wspan := 1;
      v_ww    := 0;
    else
      v_wfrom := v_run.weekly_from::integer;
      v_wspan := v_run.weekly_to::integer - v_wfrom + 1;
      v_ww    := char_length(v_run.weekly_from);
    end if;
    v_from  := v_run.processed_count;
    v_to    := least(v_run.total_count, v_from + ticket_generation_chunk_size());

    if v_raffle.ticket_counter + (v_to - v_from) > ticket_internal_code_capacity() then
      raise exception 'Esta rifa ya no tiene códigos internos para más boletas.';
    end if;

    -- Las que faltan reciben codigos consecutivos desde el contador, que no se
    -- mueve mientras la rifa esta bloqueada. Se reservan TODAS las que faltan,
    -- aunque alguna choque al insertar: un codigo de mas deja un hueco, uno de
    -- menos repetiria codigos.
    if v_single then
      with combos as materialized (
        select k,
               lpad((v_dfrom + k)::text, v_dw, '0') as daily_number
          from generate_series(v_from, v_to - 1) as k
      ),
      existing as materialized (
        select c.k, t.generation_run_id
          from combos c
          join tickets t
            on t.organization_id = v_run.organization_id
           and t.raffle_id = v_run.raffle_id
           and t.daily_number = c.daily_number
      ),
      missing as materialized (
        select c.daily_number,
               row_number() over (order by c.k) as n
          from combos c
         where not exists (select 1 from existing e where e.k = c.k)
      ),
      ins as (
        insert into tickets (
          organization_id, raffle_id, seller_id, internal_code,
          daily_number, weekly_number, inventory_status, created_by, generation_run_id
        )
        select v_run.organization_id, v_run.raffle_id, null,
               v_raffle.short_code || '-' || lpad((v_raffle.ticket_counter + m.n)::text, 6, '0'),
               m.daily_number, null, 'available', v_uid, v_run.id
          from missing m
        on conflict (organization_id, raffle_id, daily_number)
          where number_group_count = 1
          do nothing
        returning 1
      )
      select (select count(*) from missing)::integer,
             (select count(*) from ins)::integer,
             (select count(*) from existing e where e.generation_run_id is not null)::integer
        into v_missing, v_inserted, v_generated;
    else
      with combos as materialized (
        select k,
               lpad((v_dfrom + k / v_wspan)::text, v_dw, '0') as daily_number,
               lpad((v_wfrom + k % v_wspan)::text, v_ww, '0') as weekly_number
          from generate_series(v_from, v_to - 1) as k
      ),
      existing as materialized (
        select c.k, t.generation_run_id
          from combos c
          join tickets t
            on t.organization_id = v_run.organization_id
           and t.raffle_id = v_run.raffle_id
           and t.daily_number = c.daily_number
           and t.weekly_number = c.weekly_number
      ),
      missing as materialized (
        select c.daily_number, c.weekly_number,
               row_number() over (order by c.k) as n
          from combos c
         where not exists (select 1 from existing e where e.k = c.k)
      ),
      ins as (
        insert into tickets (
          organization_id, raffle_id, seller_id, internal_code,
          daily_number, weekly_number, inventory_status, created_by, generation_run_id
        )
        select v_run.organization_id, v_run.raffle_id, null,
               v_raffle.short_code || '-' || lpad((v_raffle.ticket_counter + m.n)::text, 6, '0'),
               m.daily_number, m.weekly_number, 'available', v_uid, v_run.id
          from missing m
        on conflict on constraint tickets_combo_unique do nothing
        returning 1
      )
      select (select count(*) from missing)::integer,
             (select count(*) from ins)::integer,
             (select count(*) from existing e where e.generation_run_id is not null)::integer
        into v_missing, v_inserted, v_generated;
    end if;

    if v_missing > 0 then
      update raffles r set ticket_counter = r.ticket_counter + v_missing where r.id = v_run.raffle_id;
    end if;

    update ticket_generation_runs g
       set processed_count          = v_to,
           created_count            = g.created_count + v_inserted,
           existing_count           = g.existing_count + (v_to - v_from - v_inserted),
           existing_generated_count = g.existing_generated_count + v_generated,
           status                   = case when v_to = g.total_count then 'completed' else 'in_progress' end,
           completed_at             = case when v_to = g.total_count then now() end,
           updated_at               = now()
     where g.id = v_run.id
    returning * into v_run;

    -- UNA fila de bitacora por bloque, no una por boleta (D-257).
    perform write_audit_log(
      v_run.organization_id, 'ticket.generate', 'ticket_generation', v_run.id, null,
      jsonb_build_object('raffle_id', v_run.raffle_id, 'from_index', v_from, 'to_index', v_to,
                         'created', v_inserted, 'existing', v_to - v_from - v_inserted,
                         'existing_generated', v_generated)
    );

    -- La estadistica de `tickets`, al dia ANTES de confirmar (I-214, D-260): en
    -- el PRIMER bloque y en el ULTIMO, sin esperar a nadie (SKIP_LOCKED).
    if v_from = 0 or v_run.status = 'completed' then
      analyze (skip_locked) tickets;
    end if;

    v_outcome := case when v_run.status = 'completed' then 'completed' else 'processed' end;
  end if;

  return query
  select v_outcome, v_run.id, v_run.raffle_id, v_run.daily_from, v_run.daily_to,
         v_run.weekly_from, v_run.weekly_to, v_run.total_count, v_run.processed_count,
         v_run.created_count, v_run.existing_count, v_run.existing_generated_count,
         v_run.status;
end;
$$;

-- 5.6 Las que ya existian, paginadas (BR-N17) -------------------------------------
create or replace function admin_ticket_generation_existing(
  p_run_id uuid,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  ticket_id        uuid,
  daily_number     text,
  weekly_number    text,
  inventory_status ticket_inventory_status,
  other_generation boolean,
  total_count      bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_run    ticket_generation_runs%rowtype;
  v_single boolean;
  v_wspan  integer;
begin
  perform require_auth();

  select * into v_run from ticket_generation_runs g where g.id = p_run_id;
  if not found or not is_org_staff(v_run.organization_id) then
    return;
  end if;

  v_single := v_run.weekly_from is null;
  v_wspan  := case when v_single then 1
                   else v_run.weekly_to::integer - v_run.weekly_from::integer + 1 end;

  return query
  select t.id, t.daily_number, t.weekly_number, t.inventory_status,
         (t.generation_run_id is not null),
         count(*) over ()
    from tickets t
   where t.organization_id = v_run.organization_id
     and t.raffle_id = v_run.raffle_id
     and char_length(t.daily_number) = char_length(v_run.daily_from)
     and t.daily_number between v_run.daily_from and v_run.daily_to
     and (
       v_single
       or (char_length(t.weekly_number) = char_length(v_run.weekly_from)
           and t.weekly_number between v_run.weekly_from and v_run.weekly_to)
     )
     and t.generation_run_id is distinct from v_run.id
     -- Solo dentro de lo ya procesado: el indice de la combinacion.
     and (t.daily_number::integer - v_run.daily_from::integer) * v_wspan
         + case when v_single then 0
                else t.weekly_number::integer - v_run.weekly_from::integer end
         < v_run.processed_count
   order by t.daily_number, t.weekly_number
   limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- =============================================================================
-- 6. Las demas vias de escritura con la estructura de la rifa
-- =============================================================================

-- 6.1 Crear en lote (personal) ---------------------------------------------------
-- El cuerpo de la 0007 con tres cambios: cada fila se valida contra los grupos
-- de la rifa y el error dice su numero de fila; con un grupo, la boleta esta
-- completa con su unico numero; y la unicidad con un grupo es la del indice
-- parcial. La creacion parcial como borrador sigue igual.
create or replace function bulk_create_tickets(p_raffle_id uuid, p_seller_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := require_auth();
  v_raffle     raffles%rowtype;
  v_count      integer;
  v_base       bigint;
  v_inserted   integer;
  v_conflicts  jsonb;
  v_bad        record;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'No se recibio una lista valida de boletas.';
  end if;

  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 1000 then
    raise exception 'La cantidad de boletas debe estar entre 1 y 1.000.';
  end if;

  select * into v_raffle from raffles where id = p_raffle_id;
  if not found then
    raise exception 'La rifa no existe o no tienes acceso a ella.';
  end if;

  if not is_org_staff(v_raffle.organization_id) then
    raise exception 'No tienes permiso para crear boletas en esta organizacion.'
      using errcode = 'insufficient_privilege';
  end if;

  -- BR-R08: rifas cerradas o anuladas no admiten boletas nuevas.
  if v_raffle.status not in ('draft', 'active') then
    raise exception 'La rifa esta % y no admite boletas nuevas.', v_raffle.status;
  end if;

  if not exists (
    select 1 from memberships m
    where m.profile_id = p_seller_id
      and m.organization_id = v_raffle.organization_id
      and m.role = 'seller'
      and m.is_active
  ) then
    raise exception 'El vendedor indicado no es un vendedor activo de la organizacion.';
  end if;

  -- D-261: el formato exacto de la rifa, fila por fila y antes de crear nada.
  -- Una fila incompleta sigue siendo un borrador; una mal escrita, un error con
  -- su numero de fila.
  select i.ord, i.problem into v_bad
    from (
      select ord,
             ticket_numbers_problem(
               v_raffle.number_group_count, v_raffle.first_group_name, v_raffle.first_group_digits,
               v_raffle.second_group_name, v_raffle.second_group_digits,
               nullif(btrim(coalesce(r ->> 'daily_number', '')), ''),
               nullif(btrim(coalesce(r ->> 'weekly_number', '')), ''),
               false) as problem
        from jsonb_array_elements(p_rows) with ordinality as t(r, ord)
    ) i
   where i.problem is not null
   order by i.ord
   limit 1;

  if found then
    raise exception 'Fila %: %', v_bad.ord, v_bad.problem using errcode = 'check_violation';
  end if;

  -- Reserva del bloque de codigos en una sola operacion.
  update raffles
     set ticket_counter = ticket_counter + v_count
   where id = p_raffle_id
  returning ticket_counter - v_count into v_base;

  if v_raffle.number_group_count = 1 then
    with input as (
      select
        ord,
        nullif(btrim(coalesce(r ->> 'daily_number', '')), '') as daily_number
      from jsonb_array_elements(p_rows) with ordinality as t(r, ord)
    ),
    ins as (
      insert into tickets (
        organization_id, raffle_id, seller_id, internal_code,
        daily_number, weekly_number, inventory_status, created_by
      )
      select
        v_raffle.organization_id,
        p_raffle_id,
        p_seller_id,
        v_raffle.short_code || '-' || lpad((v_base + i.ord)::text, 6, '0'),
        i.daily_number,
        null,
        case
          when i.daily_number is null then 'draft'::ticket_inventory_status
          else 'available'::ticket_inventory_status
        end,
        v_uid
      from input i
      on conflict (organization_id, raffle_id, daily_number)
        where number_group_count = 1
        do nothing
      returning daily_number
    ),
    counted as (
      select count(*)::integer as n from ins
    )
    select
      counted.n,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'daily_number', i.daily_number,
                 'weekly_number', null))
        from input i
        where i.daily_number is not null
          and not exists (select 1 from ins where ins.daily_number = i.daily_number)
      ), '[]'::jsonb)
      into v_inserted, v_conflicts
    from counted;
  else
    with input as (
      select
        ord,
        nullif(btrim(coalesce(r ->> 'daily_number', '')), '')  as daily_number,
        nullif(btrim(coalesce(r ->> 'weekly_number', '')), '') as weekly_number
      from jsonb_array_elements(p_rows) with ordinality as t(r, ord)
    ),
    ins as (
      insert into tickets (
        organization_id, raffle_id, seller_id, internal_code,
        daily_number, weekly_number, inventory_status, created_by
      )
      select
        v_raffle.organization_id,
        p_raffle_id,
        p_seller_id,
        v_raffle.short_code || '-' || lpad((v_base + i.ord)::text, 6, '0'),
        i.daily_number,
        i.weekly_number,
        case
          when i.daily_number is null or i.weekly_number is null
            then 'draft'::ticket_inventory_status
          else 'available'::ticket_inventory_status
        end,
        v_uid
      from input i
      on conflict on constraint tickets_combo_unique do nothing
      returning daily_number, weekly_number
    ),
    counted as (
      select count(*)::integer as n from ins
    )
    select
      counted.n,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'daily_number', i.daily_number,
                 'weekly_number', i.weekly_number))
        from input i
        where i.daily_number is not null
          and i.weekly_number is not null
          and not exists (
            select 1 from ins
            where ins.daily_number = i.daily_number
              and ins.weekly_number = i.weekly_number
          )
      ), '[]'::jsonb)
      into v_inserted, v_conflicts
    from counted;
  end if;

  perform write_audit_log(
    v_raffle.organization_id, 'ticket.bulk_create', 'ticket', null, null,
    jsonb_build_object('raffle_id', p_raffle_id, 'seller_id', p_seller_id,
                       'requested', v_count, 'inserted', v_inserted)
  );

  return jsonb_build_object(
    'requested', v_count,
    'inserted',  v_inserted,
    'conflicts', v_conflicts
  );
end;
$$;

-- 6.2 Que numeros ya estan tomados (personal y vendedor) ---------------------------
-- Con un grupo, se compara solo el primer numero: el segundo de lo pedido se
-- ignora. Con dos, la combinacion, como siempre.
create or replace function taken_ticket_combinations(p_raffle_id uuid, p_combos jsonb)
returns table (daily_number text, weekly_number text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid;
  v_count smallint;
begin
  perform require_auth();

  if p_combos is null or jsonb_typeof(p_combos) <> 'array' then
    raise exception 'No se recibio una lista valida de combinaciones.';
  end if;

  if jsonb_array_length(p_combos) > 1000 then
    raise exception 'No se pueden comprobar mas de 1.000 combinaciones a la vez.';
  end if;

  select r.organization_id, r.number_group_count into v_org, v_count
    from raffles r where r.id = p_raffle_id;
  if not found then
    raise exception 'La rifa no existe o no tienes acceso a ella.';
  end if;

  -- Pertenecer a la organizacion, cualquiera que sea el rol. Un vendedor de
  -- otra empresa no puede preguntar por esta rifa.
  if not (v_org in (select current_org_ids())) then
    raise exception 'No tienes acceso a esta rifa.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select t.daily_number, t.weekly_number
  from tickets t
  join (
    select
      c ->> 'daily_number'  as daily_number,
      c ->> 'weekly_number' as weekly_number
    from jsonb_array_elements(p_combos) as c
  ) pedido
    on pedido.daily_number = t.daily_number
   and (v_count = 1 or pedido.weekly_number = t.weekly_number)
  where t.raffle_id = p_raffle_id;
end;
$$;

-- 6.3 Corregir los numeros de una boleta (personal) ---------------------------------
-- El cuerpo de la 0057 con la regla de la rifa en lugar de «de 1 a 4 cifras».
-- Con un grupo, el segundo numero va vacio.
create or replace function admin_update_ticket_numbers(
  p_ticket_id     uuid,
  p_daily_number  text,
  p_weekly_number text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket  tickets%rowtype;
  v_daily   text := nullif(p_daily_number, '');
  v_weekly  text := nullif(p_weekly_number, '');
  v_problem text;
begin
  perform require_auth();

  -- El bloqueo solo cae sobre una fila que quien llama puede administrar.
  select * into v_ticket
    from tickets
   where id = p_ticket_id
     and is_org_staff(organization_id)
   for update;

  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  -- BR-I06, D-046: una boleta anulada conserva sus numeros tal como quedaron.
  if v_ticket.inventory_status = 'cancelled' then
    raise exception 'La boleta está anulada y sus números ya no se pueden cambiar.';
  end if;

  -- D-261: cada numero con exactamente las cifras de su grupo, sin tocar los
  -- ceros de delante. Corregir es completar: todos los numeros de la rifa.
  v_problem := raffle_ticket_numbers_problem(v_ticket.raffle_id, v_daily, v_weekly, true);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'check_violation';
  end if;

  -- CLAUDE.md 15: completar un borrador con sus numeros lo deja listo.
  update tickets
     set daily_number     = v_daily,
         weekly_number    = v_weekly,
         inventory_status = case
                              when inventory_status = 'draft' then 'available'::ticket_inventory_status
                              else inventory_status
                            end
   where id = p_ticket_id;
end;
$$;

-- =============================================================================
-- 7. Premios: el grupo que usa, cuantas cifras compara, y 4 > 3 > 2
-- =============================================================================

-- 7.1 Lo que hace invalida una version (BR-J08 y, desde aqui, BR-J24) -----------
-- El cuerpo de la 0066 y, ANTES de todo, que el grupo exista en la rifa y que
-- el premio no compare mas cifras de las que tiene ese grupo.
create or replace function raffle_prize_version_problem(p_version_id uuid, p_start date, p_end date)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_version raffle_prize_versions%rowtype;
  v_raffle  raffles%rowtype;
  v_group   text;
  v_gdigits smallint;
  v_day     date;
  v_other   text;
begin
  select * into v_version from raffle_prize_versions v where v.id = p_version_id;
  select * into v_raffle from raffles r where r.id = v_version.raffle_id;

  -- D-261: el grupo que usa el premio, y cuantas cifras tiene.
  if v_version.number_field = 'weekly_number' and v_raffle.number_group_count = 1 then
    return format('El premio «%s» juega con un número que esta rifa no tiene. Elige «%s».',
                  v_version.title, v_raffle.first_group_name);
  end if;

  if v_version.number_field = 'weekly_number' then
    v_group := v_raffle.second_group_name;  v_gdigits := v_raffle.second_group_digits;
  else
    v_group := v_raffle.first_group_name;   v_gdigits := v_raffle.first_group_digits;
  end if;

  if raffle_prize_digits_count(v_version.digits) > v_gdigits then
    return format('El premio «%s» compara %s cifras, pero el número «%s» tiene %s. Elige menos cifras.',
                  v_version.title, raffle_prize_digits_count(v_version.digits), v_group, v_gdigits);
  end if;

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

-- 7.2 El motor de coincidencias: dos cifras y 4 > 3 > 2 (BR-J06, BR-J07) ------
-- Cuerpo de la 0081 SIN OTRO CAMBIO que las dos ramas de `last_two` en `hits`
-- y la prioridad por rango en `resolved` (comparado linea a linea). La rama del
-- motor de siempre (rifas heredadas) no se toca. `create or replace` conserva
-- los privilegios de la 0066: nadie lo ejecuta, lo llama confirm_lottery_result.
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
    -- D-257: una boleta sin vendedor (inventario comun, libre o apartada) no
    -- es de nadie: no se fotografia. Ademas `lottery_ticket_matches.seller_id`
    -- es obligatorio y la confirmacion del resultado fallaria entera.
    and t.seller_id is not null
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
      -- D-261: las DOS ultimas cifras, con la misma regla de texto exacto que
      -- las tres: con el resultado 5307, un 07 coincide; un 7, no.
      union all
      select a.prize_id, a.version_id, a.number_field, a.digits, t.id
        from applicable a
        join tickets t
          on t.organization_id = a.organization_id
         and t.raffle_id = a.raffle_id
         and char_length(t.daily_number) >= 2
         and right(t.daily_number, 2) = right(v_result.winning_number, 2)
       where a.number_field = 'daily_number' and a.digits = 'last_two'
      union all
      select a.prize_id, a.version_id, a.number_field, a.digits, t.id
        from applicable a
        join tickets t
          on t.organization_id = a.organization_id
         and t.raffle_id = a.raffle_id
         and char_length(t.weekly_number) >= 2
         and right(t.weekly_number, 2) = right(v_result.winning_number, 2)
       where a.number_field = 'weekly_number' and a.digits = 'last_two'
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
        -- D-257: una boleta sin vendedor (inventario comun, libre o apartada) no
        -- es de nadie: no se fotografia. Ademas `lottery_ticket_matches.seller_id`
        -- es obligatorio y la confirmacion del resultado fallaria entera.
        and t.seller_id is not null
        and (
          (t.approved_at is null and t.inventory_status in ('available', 'assigned'))
          or (t.approved_at is not null and t.approved_at <= v_schedule.official_scheduled_at)
          or (t.assigned_at is not null and t.assigned_at <= v_schedule.official_scheduled_at)
        )
    ),
    -- MANDAN LAS MAS CIFRAS: 4 > 3 > 2, POR CLIENTE (BR-J07, D-203; D-261).
    -- Antes de D-261 decia «las cuatro sobre las tres»; ahora es el rango: se
    -- conservan las coincidencias de la MAYOR cantidad de cifras acertadas del
    -- reclamante en este resultado y se descartan todas las de menos —de sus
    -- otras boletas y de sus otros numeros—. Entre las de la misma cantidad no
    -- se elige ninguna: se conservan todas.
    -- Quien reclama es el cliente FOTOGRAFIADO dentro de su rifa: si tiene al
    -- menos una coincidencia de cuatro cifras en este resultado, pierde TODAS
    -- las de tres y de dos; si su mejor es de tres, pierde las de dos. Una
    -- boleta sin cliente en la fotografia es su propia unidad: no se mezcla con ninguna otra. El
    -- valor, la categoria, el nombre y el orden no deciden nada.
    -- Las cifras se cuentan con un CASE en linea, no con
    -- raffle_prize_digits_count: el motor no llama a ninguna funcion por boleta
    -- (M10, D-203), y una funcion con SET search_path no se integra en la consulta.
    resolved as (
      select c.*
        from (
          select c.*,
                 max(case c.digits when 'four' then 4 when 'last_three' then 3 when 'last_two' then 2 end) over (
                   partition by c.raffle_id, c.client_id,
                                case when c.client_id is null then c.ticket_id end
                 ) as claimant_best_digits
            from candidates c
        ) c
       where case c.digits when 'four' then 4 when 'last_three' then 3 when 'last_two' then 2 end
             = c.claimant_best_digits
    ),
    -- Solo se fotografia lo que conserva al menos un premio: una coincidencia de
    -- menos cifras descartada por la prioridad no es una coincidencia.
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

-- 7.3 La defensa de los enlaces: la prioridad, por rango (BR-J07) ----------------
-- El cuerpo de la 0062/0066 con UNA diferencia: un mismo reclamante no puede
-- conservar en un resultado premios de dos cantidades de cifras distintas. Con
-- `four` y `last_three` dice lo mismo que antes; ahora tambien cubre `last_two`.
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
      having count(distinct v.digits) > 1
    ) g
   limit 1;

  if v_detail is not null then
    raise exception 'Un mismo cliente no puede conservar un premio de menos cifras cuando tiene uno de más cifras en el mismo resultado.'
      using errcode = 'check_violation', detail = v_detail;
  end if;

  return null;
end;
$$;

-- =============================================================================
-- 9. El aviso de una venta dice cuantos numeros tiene la boleta
--
-- El cuerpo de la 0057 con UNA clave mas en el aviso: `number_group_count`, para
-- que el texto no escriba «123 / —» cuando la boleta solo tiene un numero.
-- =============================================================================

create or replace function notify_ticket_sold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent      uuid;
  v_seller_name text;
  v_data        jsonb;
begin
  if new.inventory_status <> 'assigned' or old.inventory_status = 'assigned' then
    return null;
  end if;

  select m.parent_seller_id into v_parent
  from memberships m
  where m.profile_id = new.seller_id
    and m.organization_id = new.organization_id;

  select p.full_name into v_seller_name from profiles p where p.id = new.seller_id;

  v_data := jsonb_build_object(
    'seller_name', v_seller_name,
    'daily_number', new.daily_number,
    'weekly_number', new.weekly_number,
    'number_group_count', new.number_group_count
  );

  -- D-198: el Dueno y los Administradores, sin el precio. El texto del aviso
  -- nunca lo uso (`features/notifications/text.ts`).
  perform notify_profiles(
    new.organization_id,
    org_staff_profile_ids(new.organization_id),
    'team.sale',
    auth.uid(),
    'ticket',
    new.id,
    v_data
  );

  -- El vendedor padre ya ve el dinero de las ventas de su equipo por
  -- `team_member_sales` (D-092): su aviso conserva la forma de siempre.
  if v_parent is not null then
    perform notify_profiles(
      new.organization_id,
      array[v_parent],
      'team.sale',
      auth.uid(),
      'ticket',
      new.id,
      v_data || jsonb_build_object('sale_price', new.sale_price)
    );
  end if;

  return null;
end;
$$;

-- =============================================================================
-- 10. Las boletas que no cumplen el formato de su rifa (personal)
--
-- Las que ya existian antes de esta migracion y no cumplen: se listan para que
-- el personal decida —corregir sus numeros o, si nunca se vendio, eliminarla—,
-- con las acciones de siempre, que quedan en la bitacora. Solo la lista blanca
-- de D-198: numeros, codigo interno y estado. Ningun dato de la venta.
-- =============================================================================

create function admin_raffle_nonconforming_tickets(
  p_raffle_id uuid,
  p_limit     integer default 25,
  p_offset    integer default 0
)
returns table (
  ticket_id        uuid,
  internal_code    text,
  daily_number     text,
  weekly_number    text,
  inventory_status ticket_inventory_status,
  problem          text,
  total_count      bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_raffle raffles%rowtype;
begin
  perform require_auth();

  select * into v_raffle from raffles r where r.id = p_raffle_id;
  if not found or not is_org_staff(v_raffle.organization_id) then
    return;
  end if;

  return query
  select x.id, x.internal_code, x.daily_number, x.weekly_number, x.inventory_status,
         x.problem, count(*) over ()
    from (
      select t.id, t.internal_code, t.daily_number, t.weekly_number, t.inventory_status,
             ticket_numbers_problem(
               v_raffle.number_group_count, v_raffle.first_group_name, v_raffle.first_group_digits,
               v_raffle.second_group_name, v_raffle.second_group_digits,
               t.daily_number, t.weekly_number, false) as problem
        from tickets t
       where t.organization_id = v_raffle.organization_id
         and t.raffle_id = p_raffle_id
    ) x
   where x.problem is not null
   order by x.internal_code
   limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function admin_raffle_nonconforming_tickets(uuid, integer, integer) is
  'D-261: boletas de una rifa cuyos numeros no tienen exactamente las cifras de sus grupos (las que ya existian antes de la 0084). Personal de la organizacion; lista blanca de D-198. Paginada, hasta 100.';

-- =============================================================================
-- 11. Privilegios (antes de tocar tablas vivas, D-259)
-- =============================================================================

revoke execute on function ticket_number_digits_word(smallint) from public, anon, authenticated, service_role;
revoke execute on function raffle_number_groups_problem(smallint, text, smallint, text, smallint) from public, anon, authenticated, service_role;
revoke execute on function ticket_numbers_problem(smallint, text, smallint, text, smallint, text, text, boolean) from public, anon, authenticated, service_role;
revoke execute on function raffle_ticket_numbers_problem(uuid, text, text, boolean) from public, anon, authenticated, service_role;
revoke execute on function raffle_prize_digits_count(raffle_prize_digits) from public, anon, authenticated, service_role;
revoke execute on function raffles_guard_number_groups() from public, anon, authenticated, service_role;
revoke execute on function tickets_enforce_number_format() from public, anon, authenticated, service_role;
revoke execute on function ticket_generation_group_range_problem(text, text, smallint, text) from public, anon, authenticated, service_role;
revoke execute on function ticket_generation_padded_ranges(raffles, text, text, text, text) from public, anon, authenticated, service_role;

revoke execute on function admin_raffle_nonconforming_tickets(uuid, integer, integer) from public, anon;
grant execute on function admin_raffle_nonconforming_tickets(uuid, integer, integer) to authenticated, service_role;


-- =============================================================================
-- 12. Lo que toca tablas vivas: AL FINAL y en UN solo bloque `do` (D-259, D-262)
--
-- Todo lo que bloquea `tickets` o `raffles` va aqui, en una sola sentencia: la
-- CLI aplica el archivo sentencia a sentencia y cada una paga una ida y vuelta
-- con el cliente mientras los cerrojos siguen tomados. Antes de D-262 esta parte
-- eran unas veinte sentencias, y la clave foranea de la auditoria se creaba al
-- PRINCIPIO del archivo: tomaba SHARE ROW EXCLUSIVE sobre `raffles` durante toda
-- la migracion —crear una boleta actualiza el contador de su rifa, asi que nadie
-- podia crear boletas— y acababa en un interbloqueo con el ALTER de `raffles`
-- (ensayo r2 de D-262).
--
-- Los dos cerrojos se piden seguidos y en el orden en que los toma una boleta
-- nueva o una venta: primero `tickets`, despues `raffles`. Con lock_timeout en la
-- conexion de la CLI (RUNBOOK §13), si alguien tiene una de las dos, la
-- migracion se rinde entera sin aplicar nada y se repite.
--
-- La auditoria se calcula DESPUES de tomar los cerrojos: describe exactamente
-- las boletas que habia cuando cambio la estructura.
-- =============================================================================

do $publicacion$
declare
  v_row record;
begin
  lock table tickets, raffles in access exclusive mode;

  -- 12.1 Lo que encontro en cada rifa que ya existia (seccion 1) ---------------
  insert into raffle_number_format_audits (
    raffle_id, organization_id, number_group_count,
    first_group_name, first_group_digits, second_group_name, second_group_digits,
    tickets_count, tickets_with_numbers, nonconforming_count, nonconforming_by_status,
    daily_lengths, weekly_lengths
  )
  select
    r.id, r.organization_id, 2, 'Diario', 4, 'Semanal', 4,
    coalesce(s.tickets_count, 0),
    coalesce(s.tickets_with_numbers, 0),
    coalesce(s.nonconforming_count, 0),
    coalesce(b.by_status, '{}'::jsonb),
    coalesce(dl.lengths, '{}'::jsonb),
    coalesce(wl.lengths, '{}'::jsonb)
  from raffles r
  left join lateral (
    select count(*)::integer as tickets_count,
           count(*) filter (where t.daily_number is not null or t.weekly_number is not null)::integer
             as tickets_with_numbers,
           count(*) filter (
             where (t.daily_number is not null and t.daily_number !~ '^[0-9]{4}$')
                or (t.weekly_number is not null and t.weekly_number !~ '^[0-9]{4}$')
           )::integer as nonconforming_count
      from tickets t
     where t.raffle_id = r.id
  ) s on true
  left join lateral (
    select jsonb_object_agg(x.inventory_status, x.n) as by_status
      from (
        select t.inventory_status::text, count(*) as n
          from tickets t
         where t.raffle_id = r.id
           and ((t.daily_number is not null and t.daily_number !~ '^[0-9]{4}$')
             or (t.weekly_number is not null and t.weekly_number !~ '^[0-9]{4}$'))
         group by t.inventory_status
      ) x
  ) b on true
  left join lateral (
    select jsonb_object_agg(x.len, x.n) as lengths
      from (select char_length(t.daily_number)::text as len, count(*) as n
              from tickets t where t.raffle_id = r.id and t.daily_number is not null
             group by 1) x
  ) dl on true
  left join lateral (
    select jsonb_object_agg(x.len, x.n) as lengths
      from (select char_length(t.weekly_number)::text as len, count(*) as n
              from tickets t where t.raffle_id = r.id and t.weekly_number is not null
             group by 1) x
  ) wl on true;

  -- Lo que encontro, como aviso: lo ve quien aplica el archivo con psql. La CLI
  -- de Supabase NO muestra los avisos (ensayo de D-262), asi que la publicacion
  -- lee la tabla (RUNBOOK §13) y la puerta la compara con la foto de antes.
  for v_row in
    select r.short_code, a.tickets_count, a.nonconforming_count, a.nonconforming_by_status
      from raffle_number_format_audits a
      join raffles r on r.id = a.raffle_id
     order by r.organization_id, r.short_code
  loop
    raise notice '0084: rifa % — % boletas; % fuera de «Diario» 4 + «Semanal» 4 %',
      v_row.short_code, v_row.tickets_count, v_row.nonconforming_count,
      v_row.nonconforming_by_status;
  end loop;

  alter table raffle_number_format_audits
    add constraint raffle_number_format_audits_raffle_fk
      foreign key (raffle_id, organization_id) references raffles (id, organization_id)
      on delete restrict;

  -- 12.2 Los grupos de cada rifa. Columnas con valor constante: en PostgreSQL 11
  -- o posterior es solo metadatos, y las rifas que ya existian quedan «Diario» 4
  -- + «Semanal» 4, lo auditado arriba. Los valores por omision son los de la rifa
  -- de siempre; la pantalla siempre los envia explicitos.
  alter table raffles
    add column number_group_count  smallint not null default 2,
    add column first_group_name    text     not null default 'Diario',
    add column first_group_digits  smallint not null default 4,
    add column second_group_name   text              default 'Semanal',
    add column second_group_digits smallint          default 4,
    add constraint raffles_number_group_count_check check (number_group_count in (1, 2)),
    add constraint raffles_group_digits_check check (
      first_group_digits in (2, 3, 4)
      and (second_group_digits is null or second_group_digits in (2, 3, 4))
    ),
    add constraint raffles_number_groups_shape_check check (
      (number_group_count = 1 and second_group_name is null and second_group_digits is null)
      or (number_group_count = 2 and second_group_name is not null and second_group_digits is not null)
    ),
    add constraint raffles_group_names_check check (
      first_group_name = btrim(first_group_name)
      and char_length(first_group_name) between 2 and 20
      and (
        second_group_name is null
        or (second_group_name = btrim(second_group_name)
            and char_length(second_group_name) between 2 and 20
            and lower(second_group_name) <> lower(first_group_name))
      )
    );

  comment on column raffles.number_group_count is
    'D-261: cuantos numeros tiene cada boleta de la rifa (1 o 2). Inmutable desde que la rifa existe (raffles_guard_number_groups).';
  comment on column raffles.first_group_name is
    'D-261: nombre visible del primer numero; vive en tickets.daily_number (ranura daily_number de lottery_match_field). Solo se pinta: no decide calendario, loteria ni premio.';
  comment on column raffles.first_group_digits is
    'D-261: cifras exactas del primer numero (2, 3 o 4). Los ceros de delante cuentan.';
  comment on column raffles.second_group_name is
    'D-261: nombre visible del segundo numero, en tickets.weekly_number; NULL si la boleta tiene un solo numero.';
  comment on column raffles.second_group_digits is
    'D-261: cifras exactas del segundo numero; NULL si la boleta tiene un solo numero.';

  create trigger raffles_guard_number_groups
    before insert or update of number_group_count, first_group_name, first_group_digits,
                               second_group_name, second_group_digits
    on raffles
    for each row execute function raffles_guard_number_groups();

  -- 12.3 El catalogo publico dice como se llaman los numeros (BR-K07). SQL puro:
  -- se crea cuando las columnas de `raffles` ya existen. Cambia el tipo de
  -- retorno, asi que se rehace con los mismos privilegios de la 0046.
  drop function if exists public_catalog_seller(text);

  create function public_catalog_seller(p_slug text)
  returns table (
    seller_name         text,
    seller_alias        text,
    whatsapp_number     text,
    raffle_name         text,
    ticket_price        bigint,
    available_count     bigint,
    taken_count         bigint,
    number_group_count  smallint,
    first_group_name    text,
    first_group_digits  smallint,
    second_group_name   text,
    second_group_digits smallint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
  select
    c.full_name,
    c.alias,
    c.whatsapp_number,
    c.raffle_name,
    c.ticket_price,
    s.available_count,
    s.taken_count,
    r.number_group_count,
    r.first_group_name,
    r.first_group_digits,
    r.second_group_name,
    r.second_group_digits
  from public.public_catalog_membership(p_slug) c
  join public.raffles r on r.id = c.raffle_id
  cross join lateral (
    select
      count(*) filter (where t.inventory_status = 'available') as available_count,
      count(*) filter (where t.inventory_status = 'assigned')  as taken_count
    from public.tickets t
    where t.seller_id = c.profile_id
      and t.raffle_id = c.raffle_id
      and t.organization_id = c.organization_id
      and t.inventory_status in ('available', 'assigned')
  ) s;
$$;

  comment on function public_catalog_seller(text) is
    'BR-K07/BR-K14: metadatos publicos de un catalogo, los totales de todo el catalogo (disponibles y tomadas) y, desde la 0084 (D-261), como se llaman y cuantas cifras tienen los numeros de su rifa. No recibe pagina ni busqueda. Solo la ejecuta el servidor con la clave de servicio.';

  -- La proyeccion publica: como en la 0046, solo el servidor.
  revoke all on function public_catalog_seller(text) from public, anon, authenticated;
  grant execute on function public_catalog_seller(text) to service_role;

  -- 12.4 Las generaciones de una rifa de un grupo no tienen segundo rango.
  alter table ticket_generation_runs
    alter column weekly_from drop not null,
    alter column weekly_to drop not null,
    drop constraint ticket_generation_runs_weekly_range,
    drop constraint ticket_generation_runs_total,
    add constraint ticket_generation_runs_weekly_range check (
      (weekly_from is null and weekly_to is null)
      or ticket_generation_range_problem(weekly_from, weekly_to) is null
    ),
    add constraint ticket_generation_runs_total check (
      total_count between 1 and 100000
      and total_count::bigint = (daily_to::bigint - daily_from::bigint + 1)
                                * coalesce(weekly_to::bigint - weekly_from::bigint + 1, 1)
    );

  -- 12.5 `tickets`: la columna, sus reglas, el indice y el disparador. Un solo
  -- ALTER TABLE valida las tres reglas en una sola pasada por la tabla.
  alter table tickets
    add column number_group_count smallint not null default 2,
    add constraint tickets_number_group_count_check check (number_group_count in (1, 2)),
    add constraint tickets_single_group_has_one_number check (
      number_group_count = 2 or weekly_number is null
    ),
    drop constraint tickets_numbers_required_unless_draft,
    add constraint tickets_numbers_required_unless_draft check (
      inventory_status = 'draft'
      or (daily_number is not null and (number_group_count = 1 or weekly_number is not null))
    );

  comment on column tickets.number_group_count is
    'D-261: copia de raffles.number_group_count que pone tickets_enforce_number_format; nadie la escribe. La usa el indice tickets_single_group_unique.';

  -- La unicidad con un grupo (D-261): `tickets_combo_unique` deja pasar dos
  -- filas iguales con el segundo numero nulo.
  create unique index tickets_single_group_unique
    on tickets (organization_id, raffle_id, daily_number)
    where number_group_count = 1;

  create trigger tickets_enforce_number_format
    before insert or update of daily_number, weekly_number, raffle_id, inventory_status,
                               number_group_count
    on tickets
    for each row execute function tickets_enforce_number_format();
end
$publicacion$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA, y solo si ninguna rifa de un grupo ni de
-- otras cifras tiene boletas (las de un grupo violarian las reglas de antes):
--   1. drop trigger tickets_enforce_number_format; drop index
--      tickets_single_group_unique; restaurar tickets_numbers_required_unless_draft
--      de la 0002; drop constraint tickets_number_group_count_check y
--      tickets_single_group_has_one_number; drop column tickets.number_group_count.
--   2. drop trigger raffles_guard_number_groups; drop las cinco columnas de raffles
--      y sus cuatro reglas.
--   3. Volver a crear desde la 0081 las funciones del generador, desde la 0007
--      bulk_create_tickets, desde la 0019 taken_ticket_combinations, desde la
--      0057 admin_update_ticket_numbers y notify_ticket_sold, desde la 0066
--      raffle_prize_version_problem y lottery_ticket_match_prizes_check, desde la
--      0081 match_lottery_result y desde la 0046 public_catalog_seller; devolver
--      ticket_generation_runs a weekly obligatorio.
--   4. `last_two` no se puede quitar de un enum: se deja sin uso.
-- Ninguna boleta, venta ni premio se toca para revertir.
-- =============================================================================
