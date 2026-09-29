-- =============================================================================
-- 0078_seller_earning_agreements.sql
-- Configuracion de ganancias de los vendedores
--
-- Referencia: docs/DECISIONS.md D-237; docs/BUSINESS_RULES.md §3.c (BR-G27..BR-G35
-- y las reglas que sustituye); docs/DATA_MODEL.md §4.24; docs/KNOWN_ISSUES.md I-176.
--
-- QUE CAMBIA, EN UNA LINEA POR PIEZA
--
--   * La lista de tramos deja de ser una tabla mutable que el motor lee en vivo
--     (`commission_tiers`) y pasa a ser una LISTA GENERAL VERSIONADA: guardarla
--     crea una version nueva y ningun acuerdo existente cambia (BR-G29).
--   * Cada vendedor tiene DOS acuerdos en su membresia, y rige uno: el
--     ADMINISTRATIVO mientras no tiene vendedor padre —la mitad de siempre, un
--     fijo o unos tramos— y el DE EQUIPO mientras lo tiene —el de D-127—.
--   * El tramo de un jefe de equipo cuenta SUS boletas mas las de su equipo; el
--     de un integrante, solo las suyas (BR-G27).
--   * El padre gana, por cada boleta de un integrante, SU tarifa menos la del
--     integrante; la mitad deja de estar escrita en la formula (BR-G20).
--   * Un acuerdo que pudiera prometerle a un integrante mas de lo que tiene su
--     padre no se admite, con ningun conteo ni en ninguna rifa (BR-G28).
--
-- LO QUE NO CAMBIA
--
-- El motor de D-094: el importe es una FUNCION DEL ESTADO, recontada, nunca una
-- suma de eventos. El ledger sigue explicando lo propio y lo del equipo por
-- separado (BR-G22), el bloqueo de fila sigue serializando, la cascada sigue
-- siendo integrante -> padre y la rebaja la sigue asumiendo quien la concede
-- (BR-G17). Ni un peso de pagos, asignaciones o precios se toca.
--
-- CONSERVACION (seccion 10): todo lo que existe queda con el acuerdo que ya
-- tenia —la mitad para quien no tiene padre, la version 1 de la lista general
-- (identica a sus `commission_tiers`) para los integrantes por tramos— y el
-- recalculo final no puede cambiar ni un importe: lo comprueba la propia
-- migracion antes de terminar.
-- =============================================================================

-- =============================================================================
-- 1. Tipos
-- =============================================================================

-- El acuerdo administrativo. `half_price` es la regla de siempre (BR-G13) y se
-- conserva para quien ya la tiene; ninguna sesion puede asignarla de nuevo.
create type commission_agreement_mode as enum ('half_price', 'fixed_per_ticket', 'tiered');

-- `template` es una version de la lista general; `custom`, la de un vendedor.
create type commission_tier_list_kind as enum ('template', 'custom');

-- =============================================================================
-- 2. Las listas de tramos, inmutables
--
-- Una lista se crea ENTERA en una transaccion y no se modifica nunca: cambiar
-- tramos es crear otra. Asi cada acuerdo conserva la version exacta que recibio
-- (BR-G29) y la lista general puede cambiar sin mover el dinero de nadie.
--
-- Cada tramo guarda DESDE cuantas boletas aplica y cuanto vale cada boleta. El
-- «hasta» no se guarda: es el inicio del siguiente menos uno, y el ultimo queda
-- abierto por construccion. No hay huecos ni solapes que validar.
-- =============================================================================

create table commission_tier_lists (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete restrict,
  kind             commission_tier_list_kind not null,
  -- 1, 2, 3... solo en la lista general.
  template_version integer,
  -- El unico vendedor que puede usar una lista personalizada.
  owner_profile_id uuid references profiles (id) on delete cascade,
  -- Quien la guardo. NULL = el sistema (esta migracion, el alta de una
  -- organizacion o un proceso con la service role).
  created_by       uuid references profiles (id) on delete restrict,
  created_at       timestamptz not null default now(),

  constraint commission_tier_lists_id_org_key unique (id, organization_id),
  constraint commission_tier_lists_org_version_key unique (organization_id, template_version),
  constraint commission_tier_lists_shape check (
    (kind = 'template' and template_version is not null and template_version >= 1
       and owner_profile_id is null)
    or (kind = 'custom' and template_version is null and owner_profile_id is not null)
  )
);

comment on table commission_tier_lists is
  'D-237: listas de tramos inmutables. template = version N de la lista general de la organizacion (la vigente es la de version mas alta); custom = la de un solo vendedor (BR-G29).';

create table commission_tier_list_items (
  list_id     uuid not null references commission_tier_lists (id) on delete cascade,
  min_tickets integer not null,
  rate        bigint not null,

  primary key (list_id, min_tickets),
  -- Limites de cordura, no de negocio: evitan un error de dedo y el desborde.
  constraint commission_tier_list_items_min_check check (min_tickets between 1 and 100000),
  constraint commission_tier_list_items_rate_check check (rate between 1 and 10000000)
);

comment on table commission_tier_list_items is
  'D-237: los tramos de una lista: desde cuantas boletas pagadas aplica y cuanto vale cada boleta (retroactivo, BR-G02). El hasta se deriva del siguiente.';

-- La RLS se activa AQUI, con las tablas vacias: mas abajo la comprobacion
-- diferida de cada lista deja eventos pendientes, y PostgreSQL no deja alterar
-- una tabla que los tiene. Las politicas, en la seccion 15.
alter table commission_tier_lists enable row level security;
alter table commission_tier_lists force row level security;
alter table commission_tier_list_items enable row level security;
alter table commission_tier_list_items force row level security;

-- -----------------------------------------------------------------------------
-- commission_tiers_problem — que tiene de malo una lista, dicho para una persona
--
-- Recibe la lista tal como llega de la pantalla: un arreglo de objetos
-- `{min_tickets, rate}`, en cualquier orden. Devuelve NULL si es valida. La usan
-- las RPC ANTES de escribir, para contestar con una frase, y la comprobacion al
-- confirmar de cualquier lista, sea cual sea el camino (BR-G32).
-- -----------------------------------------------------------------------------
create function commission_tiers_problem(p_tiers jsonb)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_item      jsonb;
  v_min       numeric;
  v_rate      numeric;
  v_prev_min  integer;
  v_prev_rate bigint;
  v_count     integer := 0;
  r           record;
begin
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) = 0 then
    return 'Escribe al menos un tramo.';
  end if;

  if jsonb_array_length(p_tiers) > 20 then
    return 'Puedes tener como máximo 20 tramos.';
  end if;

  for v_item in select value from jsonb_array_elements(p_tiers) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item -> 'min_tickets') is distinct from 'number'
       or jsonb_typeof(v_item -> 'rate') is distinct from 'number' then
      return 'Cada tramo necesita desde cuántas boletas aplica y cuánto se gana por boleta.';
    end if;

    v_min := (v_item ->> 'min_tickets')::numeric;
    v_rate := (v_item ->> 'rate')::numeric;

    if v_min <> trunc(v_min) or v_rate <> trunc(v_rate) then
      return 'Escribe cantidades enteras: boletas sin decimales y pesos sin centavos.';
    end if;
    if v_min < 1 then
      return 'Un tramo tiene que empezar en 1 boleta o más.';
    end if;
    if v_min > 100000 then
      return 'Un tramo no puede empezar después de la boleta 100.000.';
    end if;
    if v_rate <= 0 then
      return 'La ganancia por boleta tiene que ser mayor que cero.';
    end if;
    if v_rate > 10000000 then
      return 'La ganancia por boleta no puede pasar de $10.000.000.';
    end if;
  end loop;

  for r in
    select (e ->> 'min_tickets')::integer as desde, (e ->> 'rate')::bigint as tarifa
    from jsonb_array_elements(p_tiers) e
    order by 1
  loop
    v_count := v_count + 1;

    if v_count = 1 and r.desde <> 1 then
      return 'El primer tramo tiene que empezar en 1 boleta.';
    end if;
    if v_prev_min is not null and r.desde = v_prev_min then
      return format(
        'Dos tramos empiezan desde %s %s. Cada tramo tiene que empezar en una cantidad distinta de boletas.',
        r.desde, case when r.desde = 1 then 'boleta' else 'boletas' end
      );
    end if;
    -- BR-G32: ganar mas al subir de tramo. Dos tramos seguidos que pagan lo
    -- mismo no son dos tramos, y uno que paga menos castigaria vender mas.
    if v_prev_rate is not null and r.tarifa <= v_prev_rate then
      return format(
        'El tramo que empieza en %s boletas tiene que pagar más que el anterior, que paga %s por boleta.',
        r.desde, format_cop(v_prev_rate)
      );
    end if;

    v_prev_min := r.desde;
    v_prev_rate := r.tarifa;
  end loop;

  return null;
end;
$$;

comment on function commission_tiers_problem(jsonb) is
  'D-237, BR-G32: NULL si la lista es valida; si no, la frase que lo explica. Primer tramo desde 1, inicios distintos y enteros, tarifas enteras, positivas y crecientes, como mucho 20 tramos.';

-- La lista, en la forma canonica con la que se comparan dos listas.
create function commission_tiers_normalized(p_tiers jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('min_tickets', (e ->> 'min_tickets')::integer, 'rate', (e ->> 'rate')::bigint)
      order by (e ->> 'min_tickets')::integer
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(p_tiers) e
$$;

-- Los tramos de una lista guardada, en esa misma forma.
create function commission_list_json(p_list uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('min_tickets', i.min_tickets, 'rate', i.rate) order by i.min_tickets),
    '[]'::jsonb
  )
  from commission_tier_list_items i
  where i.list_id = p_list
$$;

-- -----------------------------------------------------------------------------
-- La lista se escribe entera y no vuelve a tocarse
-- -----------------------------------------------------------------------------

-- Al CONFIRMAR, toda lista nueva tiene tramos y los tiene bien, sea cual sea el
-- camino por el que se creo (RPC, esta migracion o la service role).
create function commission_tier_lists_complete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_problem text;
begin
  if not exists (select 1 from commission_tier_lists where id = new.id) then
    return null;  -- borrada en la misma transaccion
  end if;

  v_problem := commission_tiers_problem(commission_list_json(new.id));
  if v_problem is not null then
    raise exception 'La lista de tramos no es válida: %', v_problem
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger commission_tier_lists_complete
  after insert on commission_tier_lists
  deferrable initially deferred
  for each row execute function commission_tier_lists_complete();

-- Los tramos solo se escriben en la transaccion que crea la lista. `created_at`
-- toma `now()`, que es el instante de la transaccion: otra transaccion no puede
-- tener el mismo, asi que una lista ya confirmada no gana tramos despues.
create function commission_tier_list_items_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from commission_tier_lists l where l.id = new.list_id and l.created_at = now()
  ) then
    raise exception 'Los tramos de una lista se escriben al crearla. Para cambiarlos, guarda una lista nueva.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger commission_tier_list_items_guard
  before insert on commission_tier_list_items
  for each row execute function commission_tier_list_items_guard();

create function commission_tier_lists_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Una lista de tramos no se modifica: se guarda una nueva.'
    using errcode = 'check_violation';
end;
$$;

create trigger commission_tier_lists_immutable
  before update on commission_tier_lists
  for each row execute function commission_tier_lists_immutable();

create trigger commission_tier_list_items_immutable
  before update on commission_tier_list_items
  for each row execute function commission_tier_lists_immutable();

-- La lista general vigente: la version mas alta. La sirve el indice unico
-- (organization_id, template_version), leido hacia atras.
create function commission_current_template(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.id
  from commission_tier_lists l
  where l.organization_id = p_organization_id
    and l.kind = 'template'
  order by l.template_version desc
  limit 1
$$;

-- -----------------------------------------------------------------------------
-- commission_create_tier_list — escribir una lista entera
--
-- Valida, numera la version si es la general y escribe la lista con todos sus
-- tramos. Quien la llama es responsable de haber tomado el cerrojo de la lista
-- general de la organizacion cuando crea una version (save_commission_template).
-- -----------------------------------------------------------------------------
create function commission_create_tier_list(
  p_organization_id uuid,
  p_kind            commission_tier_list_kind,
  p_owner           uuid,
  p_tiers           jsonb,
  p_created_by      uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_problem text := commission_tiers_problem(p_tiers);
  v_version integer;
  v_id      uuid;
begin
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'check_violation';
  end if;

  if p_kind = 'template' then
    select coalesce(max(l.template_version), 0) + 1 into v_version
    from commission_tier_lists l
    where l.organization_id = p_organization_id and l.kind = 'template';
  end if;

  insert into commission_tier_lists (organization_id, kind, template_version, owner_profile_id, created_by)
  values (
    p_organization_id, p_kind, v_version,
    case when p_kind = 'custom' then p_owner end,
    p_created_by
  )
  returning id into v_id;

  insert into commission_tier_list_items (list_id, min_tickets, rate)
  select v_id, (e ->> 'min_tickets')::integer, (e ->> 'rate')::bigint
  from jsonb_array_elements(p_tiers) e;

  return v_id;
end;
$$;

-- =============================================================================
-- 2.b Antes de tocar nada: tres niveles
--
-- Un vendedor que tiene equipo y a la vez pertenece al de otro (I-176) cobraba,
-- con el motor de 0031, la parte de su equipo con la mitad del precio. Con los
-- dos niveles de BR-E03 esa parte ya no existe, y conservarla exigiria inventar
-- una regla: la migracion se detiene y dice quien, para que se decida antes.
-- =============================================================================

do $$
declare
  v_casos text;
begin
  select string_agg(format('%s (equipo de %s)', coalesce(p.full_name, h.profile_id::text),
                           coalesce(pp.full_name, h.parent_seller_id::text)), ', ')
    into v_casos
  from memberships h
  left join profiles p on p.id = h.profile_id
  left join profiles pp on pp.id = h.parent_seller_id
  where h.parent_seller_id is not null
    and exists (select 1 from memberships c
                where c.parent_seller_id = h.profile_id and c.organization_id = h.organization_id);

  if v_casos is not null then
    raise exception 'Hay vendedores con equipo propio dentro del equipo de otro (I-176): %. Decide su estructura antes de aplicar esta migración.', v_casos;
  end if;
end
$$;

-- =============================================================================
-- 3. La version 1 de la lista general de cada organizacion
--
-- Es EXACTAMENTE lo que hoy tiene `commission_tiers`. Si una organizacion tiene
-- tramos que no cumplen las reglas nuevas, la migracion se DETIENE diciendo
-- cual, en vez de reinterpretarlos: cambiarlos cambiaria lo que se le debe a sus
-- integrantes, y eso no lo decide un script.
-- =============================================================================

do $$
declare
  o         record;
  v_tiers   jsonb;
  v_problem text;
  v_id      uuid;
begin
  for o in select id, name from organizations order by created_at, id loop
    select jsonb_agg(jsonb_build_object('min_tickets', ct.min_tickets, 'rate', ct.rate) order by ct.min_tickets)
      into v_tiers
    from commission_tiers ct
    where ct.organization_id = o.id;

    if v_tiers is null then
      -- Sin tramos, ningun integrante por tramos podia cobrar. Solo se le dan
      -- los de siempre si no hay nadie a quien eso le cambiaria el dinero.
      if exists (
        select 1
        from memberships m
        join seller_commissions sc on sc.seller_id = m.profile_id and sc.organization_id = m.organization_id
        where m.organization_id = o.id
          and m.parent_seller_id is not null
          and m.commission_model = 'tiered'
          and sc.tickets_paid > 0
      ) then
        raise exception 'La organización «%» no tiene tramos y tiene integrantes que ya cobraron por tramos. Revisa sus tramos antes de aplicar esta migración.', o.name;
      end if;
      v_tiers := '[{"min_tickets":1,"rate":20000},{"min_tickets":21,"rate":25000},{"min_tickets":31,"rate":30000},{"min_tickets":51,"rate":40000}]'::jsonb;
    end if;

    v_problem := commission_tiers_problem(v_tiers);
    if v_problem is not null then
      raise exception 'Los tramos de la organización «%» no cumplen las reglas nuevas: %', o.name, v_problem;
    end if;

    v_id := commission_create_tier_list(o.id, 'template', null, v_tiers, null);
  end loop;
end
$$;

-- Las comprobaciones diferidas de estas listas, AHORA: sin eventos pendientes, las
-- FK de `memberships` hacia ellas pueden crearse mas abajo en la misma transaccion.
set constraints commission_tier_lists_complete immediate;

-- Y las organizaciones que se creen despues. Sin esto una empresa nueva no
-- tendria lista general y no podria ofrecer tramos (misma razon de 0024).
create function organizations_seed_commission_template()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform commission_create_tier_list(
    new.id,
    'template',
    null,
    '[{"min_tickets":1,"rate":20000},{"min_tickets":21,"rate":25000},{"min_tickets":31,"rate":30000},{"min_tickets":51,"rate":40000}]'::jsonb,
    null
  );
  return null;
end;
$$;

drop trigger organizations_seed_commission_tiers on organizations;
drop function organizations_seed_commission_tiers();

create trigger organizations_seed_commission_template
  after insert on organizations
  for each row execute function organizations_seed_commission_template();

-- =============================================================================
-- 4. Los dos acuerdos, en la membresia
--
-- La fila de `memberships` ES la relacion entre la organizacion y el vendedor, y
-- entre el vendedor padre y su integrante (D-127): los dos acuerdos viven en
-- ella. Rige el administrativo mientras `parent_seller_id` es nulo y el de
-- equipo mientras no lo es; el que no rige queda INERTE, no se borra, y vuelve
-- tal cual al salir o entrar de un equipo (BR-G16).
--
-- EL VALOR POR DEFECTO ES LA REGLA DE SIEMPRE, a proposito: toda membresia que
-- ya existe cobraba la mitad sin padre, y todo camino que hoy crea una membresia
-- sin decir nada —el seed, los scripts, las pruebas y el alta de un integrante
-- por su padre, cuyo acuerdo administrativo queda inerte— sigue haciendo lo
-- mismo. Lo que NO puede hacer ninguna sesion es asignar la mitad de nuevo
-- (seccion 7): el alta del personal elige fijo o tramos.
-- =============================================================================

alter table memberships
  add column direct_commission_mode commission_agreement_mode not null default 'half_price',
  add column direct_fixed_amount    bigint,
  add column direct_tier_list_id    uuid,
  add column team_tier_list_id      uuid;

comment on column memberships.direct_commission_mode is
  'D-237: acuerdo administrativo, el que rige sin vendedor padre. half_price = la mitad del precio vigente de la rifa (se conserva para quien ya la tiene); fixed_per_ticket; tiered.';
comment on column memberships.direct_fixed_amount is
  'D-237: ganancia fija por boleta del acuerdo administrativo. Solo con fixed_per_ticket.';
comment on column memberships.direct_tier_list_id is
  'D-237: lista de tramos del acuerdo administrativo: una version de la lista general o una personalizada de este vendedor. Solo con tiered.';
comment on column memberships.team_tier_list_id is
  'D-237: version de la lista general que recibio su acuerdo de equipo por tramos. Se fija al entrar a un equipo o al pasar a tramos, y ningun cambio posterior de la lista general la mueve.';

-- Los integrantes por tramos quedan en la version 1, que es su tabla de hoy.
-- Va ANTES de las restricciones y de los disparadores nuevos: esto no es un
-- cambio de acuerdo, es fijar el que ya tenian. `audit_memberships` lo anota.
update memberships m
   set team_tier_list_id = commission_current_template(m.organization_id)
 where m.parent_seller_id is not null
   and m.commission_model = 'tiered';

alter table memberships
  add constraint memberships_direct_tier_list_fk
    foreign key (direct_tier_list_id, organization_id)
    references commission_tier_lists (id, organization_id),
  add constraint memberships_team_tier_list_fk
    foreign key (team_tier_list_id, organization_id)
    references commission_tier_lists (id, organization_id),
  -- Las tres formas del acuerdo administrativo, y ninguna mas. Los `is not null`
  -- no son redundantes: un CHECK se cumple cuando su resultado es NULL (D-127).
  add constraint memberships_direct_agreement_shape check (
    (direct_commission_mode = 'half_price'
       and direct_fixed_amount is null and direct_tier_list_id is null)
    or (direct_commission_mode = 'fixed_per_ticket'
       and direct_fixed_amount is not null and direct_fixed_amount between 1 and 10000000
       and direct_tier_list_id is null)
    or (direct_commission_mode = 'tiered'
       and direct_tier_list_id is not null and direct_fixed_amount is null)
  ),
  -- La lista del acuerdo de equipo: solo con tramos, y obligatoria mientras rige.
  add constraint memberships_team_tier_list_shape check (
    (commission_model = 'tiered' or team_tier_list_id is null)
    and (parent_seller_id is null or commission_model = 'fixed_per_ticket'
         or team_tier_list_id is not null)
  ),
  add constraint memberships_team_fixed_cap check (
    fixed_commission_amount is null or fixed_commission_amount <= 10000000
  );

-- =============================================================================
-- 5. La tarifa de un acuerdo, sin leer ninguna membresia
--
-- Una sola definicion para el motor, la rebaja maxima, la compatibilidad y las
-- pantallas: recibe el acuerdo por parametros, asi que sirve tambien para un
-- acuerdo que TODAVIA no esta guardado (el disparador de validacion).
-- =============================================================================

-- El acuerdo de equipo, dicho con los modos del administrativo. Sin `set` para
-- que se pueda inlinar: no toca ninguna tabla.
create function commission_team_mode(p_model commission_model)
returns commission_agreement_mode
language sql
immutable
as $$
  select case when p_model = 'fixed_per_ticket' then 'fixed_per_ticket'::public.commission_agreement_mode
              else 'tiered'::public.commission_agreement_mode end
$$;

-- Tarifa con `p_count` boletas en el conteo del tramo. Cero sin boletas: sin
-- nada cobrado no hay tarifa que aplicar (0024), y asi la fila no muestra una
-- tarifa junto a un cero.
--
-- SIN `security definer` y sin `set`, a proposito: asi PostgreSQL la puede
-- INLINAR dentro de la consulta que la llama, y el motor calcula la tarifa de
-- cada integrante en la misma lectura que cuenta sus boletas en vez de hacer una
-- llamada por integrante. Solo la llaman funciones `security definer` (nadie
-- mas tiene EXECUTE), asi que corre con los privilegios de su dueño.
create function commission_agreement_rate(
  p_mode  commission_agreement_mode,
  p_fixed bigint,
  p_list  uuid,
  p_price bigint,
  p_count integer
)
returns bigint
language sql
stable
as $$
  select case
    when p_count is null or p_count <= 0 then 0::bigint
    -- BR-G15: la mitad del precio VIGENTE; division entera, como el resto.
    when p_mode = 'half_price' then coalesce(p_price / 2, 0)
    when p_mode = 'fixed_per_ticket' then coalesce(p_fixed, 0)
    -- Con el esquema escrito: sin `set search_path` no se depende del de nadie.
    else coalesce((
      select i.rate
      from public.commission_tier_list_items i
      where i.list_id = p_list and i.min_tickets <= p_count
      order by i.min_tickets desc
      limit 1
    ), 0)
  end
$$;

-- La tarifa MAS BAJA que puede llegar a tener (BR-G18): fija la rebaja maxima.
create function commission_agreement_floor(
  p_mode  commission_agreement_mode,
  p_fixed bigint,
  p_list  uuid,
  p_price bigint
)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_mode = 'half_price' then coalesce(p_price / 2, 0)
    when p_mode = 'fixed_per_ticket' then coalesce(p_fixed, 0)
    else coalesce((select min(i.rate) from commission_tier_list_items i where i.list_id = p_list), 0)
  end
$$;

-- La tarifa MAS ALTA que puede llegar a tener, con cualquier conteo.
create function commission_agreement_max(
  p_mode  commission_agreement_mode,
  p_fixed bigint,
  p_list  uuid,
  p_price bigint
)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_mode = 'half_price' then coalesce(p_price / 2, 0)
    when p_mode = 'fixed_per_ticket' then coalesce(p_fixed, 0)
    else coalesce((select max(i.rate) from commission_tier_list_items i where i.list_id = p_list), 0)
  end
$$;

-- El acuerdo que RIGE para una membresia: el administrativo sin padre, el de
-- equipo con padre.
create function commission_effective_agreement(
  p_organization_id uuid,
  p_seller_id       uuid,
  out mode      commission_agreement_mode,
  out fixed     bigint,
  out list_id   uuid,
  out parent_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case when m.parent_seller_id is null then m.direct_commission_mode
         else commission_team_mode(m.commission_model) end,
    case when m.parent_seller_id is null then m.direct_fixed_amount
         else m.fixed_commission_amount end,
    case when m.parent_seller_id is null then m.direct_tier_list_id
         else m.team_tier_list_id end,
    m.parent_seller_id
  from memberships m
  where m.profile_id = p_seller_id
    and m.organization_id = p_organization_id
$$;

-- -----------------------------------------------------------------------------
-- commission_rate_for_seller — la tarifa de ESTE vendedor con `p_count` boletas
-- en el conteo de su tramo
--
-- El conteo lo decide quien llama (el motor): propias + equipo para un jefe,
-- solo las propias para los demas (BR-G27). Aqui solo se aplica el acuerdo que
-- rige. Mismo nombre y firma que en 0025/0031.
-- -----------------------------------------------------------------------------
create or replace function commission_rate_for_seller(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_seller_id       uuid,
  p_count           integer
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ag     record;
  v_precio bigint;
begin
  if p_count is null or p_count <= 0 then
    return 0;
  end if;

  select * into v_ag from commission_effective_agreement(p_organization_id, p_seller_id);
  if v_ag.mode is null then
    return 0;  -- no es miembro de la organizacion
  end if;

  if v_ag.mode = 'half_price' then
    select r.ticket_price into v_precio from raffles r where r.id = p_raffle_id;
  end if;

  return commission_agreement_rate(v_ag.mode, v_ag.fixed, v_ag.list_id, v_precio, p_count);
end;
$$;

comment on function commission_rate_for_seller is
  'D-237: tarifa por boleta del acuerdo que rige (administrativo sin padre, de equipo con padre) con p_count boletas en el conteo del tramo, que decide el motor (BR-G27).';

-- -----------------------------------------------------------------------------
-- commission_floor_rate — la rebaja maxima de este vendedor en esta rifa
-- (BR-G18), sacada de SU acuerdo: nunca se le aplica a un vendedor directo el
-- limite pensado para un integrante, ni al reves.
-- -----------------------------------------------------------------------------
create or replace function commission_floor_rate(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_seller_id       uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ag     record;
  v_precio bigint;
begin
  select * into v_ag from commission_effective_agreement(p_organization_id, p_seller_id);
  if v_ag.mode is null then
    return 0;  -- no es miembro: no se permite rebaja
  end if;

  select r.ticket_price into v_precio from raffles r where r.id = p_raffle_id;

  -- Sin tramos devuelve 0, que significa «no se permite rebaja»: el fallo seguro.
  return commission_agreement_floor(v_ag.mode, v_ag.fixed, v_ag.list_id, v_precio);
end;
$$;

-- =============================================================================
-- 6. Compatibilidad padre–hijo (BR-G28)
--
-- El conteo del padre incluye las boletas del hijo, y las listas son crecientes
-- (BR-G32): la tarifa del padre con su conteo nunca es menor que la que tendria
-- con el del hijo solo. El peor caso posible —el padre no vende y nadie mas del
-- equipo tampoco— es que los dos cuenten lo mismo. Por eso el acuerdo del hijo
-- es compatible si y solo si, PARA TODO conteo n >= 1,
--
--     tarifa_hijo(n) <= tarifa_padre(n)
--
-- Las dos son escalonadas: basta mirar n = 1 y cada inicio de tramo de las dos
-- listas, porque entre dos inicios seguidos ninguna cambia.
--
-- Un padre en la mitad no tiene conteo: tiene PRECIO, y cada rifa el suyo. Se
-- mira rifa por rifa donde el hijo puede ganar:
--   * en borrador o activa, puede llegar a cualquier conteo: su maximo;
--   * cerrada, solo cobra las que ya vendio (BR-R08, BR-R09): su tarifa con esas;
--   * anulada, nada.
-- =============================================================================

-- El primer conteo en el que el hijo gana mas que el padre, sin rifa de por
-- medio (padre fijo o por tramos). Ninguna fila = compatibles.
create function commission_pair_violation(
  p_parent_mode  commission_agreement_mode,
  p_parent_fixed bigint,
  p_parent_list  uuid,
  p_child_mode   commission_agreement_mode,
  p_child_fixed  bigint,
  p_child_list   uuid
)
returns table (at_count integer, child_rate bigint, parent_rate bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_b integer;
  v_c bigint;
  v_p bigint;
begin
  for v_b in
    select 1
    union
    select i.min_tickets
    from commission_tier_list_items i
    where i.list_id in (p_parent_list, p_child_list)
    order by 1
  loop
    v_c := commission_agreement_rate(p_child_mode, p_child_fixed, p_child_list, null, v_b);
    v_p := commission_agreement_rate(p_parent_mode, p_parent_fixed, p_parent_list, null, v_b);
    if v_c > v_p then
      return query select v_b, v_c, v_p;
      return;
    end if;
  end loop;
end;
$$;

-- Un padre en la mitad, en UNA rifa dada por sus datos (sirve tambien para una
-- rifa que se esta creando y todavia no esta en la tabla).
create function commission_half_raffle_violation(
  p_child_id     uuid,
  p_child_mode   commission_agreement_mode,
  p_child_fixed  bigint,
  p_child_list   uuid,
  p_raffle_id    uuid,
  p_price        bigint,
  p_status       raffle_status
)
returns table (at_count integer, child_rate bigint, parent_rate bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mitad bigint := p_price / 2;
  v_b     integer;
  v_c     bigint;
  v_reach integer;
begin
  if p_status in ('draft', 'active') then
    for v_b in
      select 1
      union
      select i.min_tickets from commission_tier_list_items i where i.list_id = p_child_list
      order by 1
    loop
      v_c := commission_agreement_rate(p_child_mode, p_child_fixed, p_child_list, null, v_b);
      if v_c > v_mitad then
        return query select v_b, v_c, v_mitad;
        return;
      end if;
    end loop;
  elsif p_status = 'closed' and p_child_id is not null then
    select count(*)::integer into v_reach
    from tickets t
    where t.raffle_id = p_raffle_id
      and t.seller_id = p_child_id
      and t.inventory_status = 'assigned';

    if v_reach > 0 then
      v_c := commission_agreement_rate(p_child_mode, p_child_fixed, p_child_list, null, v_reach);
      if v_c > v_mitad then
        return query select v_reach, v_c, v_mitad;
      end if;
    end if;
  end if;
end;
$$;

-- El primer incumplimiento de un par, con la rifa si la hay. Para un padre en la
-- mitad se miran las rifas de la organizacion de la mas barata a la mas cara:
-- la primera que falla es la que pone el limite.
create function commission_pair_problem_detail(
  p_organization_id uuid,
  p_child_id        uuid,
  p_parent_mode     commission_agreement_mode,
  p_parent_fixed    bigint,
  p_parent_list     uuid,
  p_child_mode      commission_agreement_mode,
  p_child_fixed     bigint,
  p_child_list      uuid
)
returns table (
  at_count     integer,
  child_rate   bigint,
  parent_rate  bigint,
  raffle_id    uuid,
  raffle_name  text,
  raffle_price bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v record;
begin
  if p_parent_mode <> 'half_price' then
    return query
    select v2.at_count, v2.child_rate, v2.parent_rate, null::uuid, null::text, null::bigint
    from commission_pair_violation(p_parent_mode, p_parent_fixed, p_parent_list,
                                   p_child_mode, p_child_fixed, p_child_list) v2;
    return;
  end if;

  for r in
    select rf.id, rf.name, rf.ticket_price, rf.status
    from raffles rf
    where rf.organization_id = p_organization_id
      and rf.status <> 'cancelled'
    order by rf.ticket_price, rf.name, rf.id
  loop
    select * into v
    from commission_half_raffle_violation(p_child_id, p_child_mode, p_child_fixed, p_child_list,
                                          r.id, r.ticket_price, r.status);
    if found then
      return query select v.at_count, v.child_rate, v.parent_rate, r.id, r.name, r.ticket_price;
      return;
    end if;
  end loop;
end;
$$;

-- Lo mas que un padre puede pagarle a un integrante con un fijo: su tarifa mas
-- baja donde el integrante puede ganar. NULL = sin limite todavia (un padre en la
-- mitad sin ninguna rifa donde vender).
create function commission_parent_cap(
  p_organization_id uuid,
  p_child_id        uuid,
  p_parent_mode     commission_agreement_mode,
  p_parent_fixed    bigint,
  p_parent_list     uuid
)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_parent_mode = 'fixed_per_ticket' then p_parent_fixed
    when p_parent_mode = 'tiered' then commission_agreement_floor(p_parent_mode, null, p_parent_list, null)
    else (
      select min(rf.ticket_price / 2)
      from raffles rf
      where rf.organization_id = p_organization_id
        and (rf.status in ('draft', 'active')
             or (rf.status = 'closed' and p_child_id is not null and exists (
                   select 1 from tickets t
                   where t.raffle_id = rf.id and t.seller_id = p_child_id
                     and t.inventory_status = 'assigned')))
    )
  end
$$;

-- «1 boleta cobrada» y «25 boletas cobradas»: nunca «1 boletas» (D-111).
create function commission_tickets_phrase(p_count integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_count = 1 then '1 boleta cobrada' else p_count || ' boletas cobradas' end
$$;

create function commission_person_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select nullif(btrim(p.full_name), '') from profiles p where p.id = p_profile_id),
                  'Este vendedor')
$$;

-- -----------------------------------------------------------------------------
-- commission_pair_problem — la frase, o NULL si el par es compatible
--
-- p_side:  'child'  se esta fijando el acuerdo del integrante o su equipo
--          'parent' se esta fijando el acuerdo del padre
-- p_actor: 'parent' quien lo hace es el propio padre (se le habla de «tú»)
--          'staff'  cualquier otro: el personal, un proceso
-- -----------------------------------------------------------------------------
create function commission_pair_problem(
  p_organization_id uuid,
  p_parent_id       uuid,
  p_parent_mode     commission_agreement_mode,
  p_parent_fixed    bigint,
  p_parent_list     uuid,
  p_child_id        uuid,
  p_child_mode      commission_agreement_mode,
  p_child_fixed     bigint,
  p_child_list      uuid,
  p_side            text,
  p_actor           text
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v        record;
  v_donde  text;
  v_cap    bigint;
  v_padre  text := commission_person_name(p_parent_id);
  v_hijo   text := case when p_child_id is null then 'el integrante' else commission_person_name(p_child_id) end;
begin
  select * into v
  from commission_pair_problem_detail(p_organization_id, p_child_id,
                                      p_parent_mode, p_parent_fixed, p_parent_list,
                                      p_child_mode, p_child_fixed, p_child_list);
  if not found then
    return null;
  end if;

  v_donde := case when v.raffle_name is not null then format(' en la rifa «%s»', v.raffle_name) else '' end;

  if p_side = 'parent' then
    return format(
      'Con este acuerdo, %s ganaría %s por boleta%s y %s, de su equipo, puede llegar a %s. La ganancia de un integrante sale de la de su vendedor a cargo: cambia primero la de %s o elige otro acuerdo.',
      v_padre,
      format_cop(v.parent_rate),
      case when p_parent_mode = 'tiered' then ' con ' || commission_tickets_phrase(v.at_count) else v_donde end,
      v_hijo, format_cop(v.child_rate), v_hijo
    );
  end if;

  if p_actor = 'parent' then
    if p_child_mode = 'fixed_per_ticket' then
      return format(
        'No puedes pagarle más de %s por boleta: es lo que ganas tú por cada boleta%s, y de ahí sale su ganancia.',
        format_cop(v.parent_rate),
        case when p_parent_mode = 'tiered' then ' en tu primer tramo' else v_donde end
      );
    end if;

    v_cap := commission_parent_cap(p_organization_id, p_child_id, p_parent_mode, p_parent_fixed, p_parent_list);
    return format(
      'Con la lista general, al llegar a %s ganaría %s por boleta y tú ganas %s%s. Elige una ganancia fija%s.',
      commission_tickets_phrase(v.at_count), format_cop(v.child_rate), format_cop(v.parent_rate), v_donde,
      case when v_cap is null then '' else format(' de hasta %s', format_cop(v_cap)) end
    );
  end if;

  if p_child_mode = 'fixed_per_ticket' then
    return format(
      '%s no puede ganar %s por boleta: %s gana %s por boleta%s y de ahí sale su ganancia.',
      v_hijo, format_cop(v.child_rate), v_padre, format_cop(v.parent_rate),
      case when p_parent_mode = 'tiered' then ' en su primer tramo' else v_donde end
    );
  end if;

  return format(
    'Con %s, %s ganaría %s por boleta y %s gana %s%s. La ganancia de un integrante sale de la de su vendedor a cargo y no puede superarla.',
    commission_tickets_phrase(v.at_count), v_hijo, format_cop(v.child_rate), v_padre, format_cop(v.parent_rate), v_donde
  );
end;
$$;

-- Todos los integrantes de un equipo se validan bajo UN cerrojo por jefe: dos
-- cambios del mismo equipo se serializan, uno ve lo que confirmo el otro, y
-- nunca se esperan filas de membresia entre si (sin abrazos).
create function commission_team_lock(p_head_id uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select pg_advisory_xact_lock(hashtextextended('commission_team:' || p_head_id::text, 0))
$$;

-- -----------------------------------------------------------------------------
-- commission_discount_problem — ¿alguna rebaja ya concedida deja de caber?
--
-- La rebaja la asume quien la concede (BR-G17), y cabe porque se limito a su
-- tarifa minima (BR-G18). Si un acuerdo nuevo baja esa tarifa por debajo de una
-- rebaja YA concedida, la diferencia la pondria la empresa (BR-G19). Por eso un
-- cambio explicito de acuerdo se rechaza en ese caso (BR-G31).
-- -----------------------------------------------------------------------------
create function commission_discount_problem(
  p_organization_id uuid,
  p_seller_id       uuid,
  p_mode            commission_agreement_mode,
  p_fixed           bigint,
  p_list            uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r       record;
  v_floor bigint;
begin
  for r in
    select rf.name, rf.ticket_price,
           max(coalesce(t.base_price, t.sale_price) - t.sale_price) as rebaja
    from tickets t
    join raffles rf on rf.id = t.raffle_id
    where t.seller_id = p_seller_id
      and t.organization_id = p_organization_id
      and t.inventory_status = 'assigned'
    group by rf.id, rf.name, rf.ticket_price
    having max(coalesce(t.base_price, t.sale_price) - t.sale_price) > 0
    order by 3 desc, rf.name
  loop
    v_floor := commission_agreement_floor(p_mode, p_fixed, p_list, r.ticket_price);
    if r.rebaja > v_floor then
      return format(
        '%s ya rebajó %s en una boleta vendida de la rifa «%s», y con esta ganancia solo ganaría %s por esa boleta. La rebaja la asume quien la concede: elige una ganancia de al menos %s por boleta.',
        commission_person_name(p_seller_id), format_cop(r.rebaja), r.name,
        format_cop(v_floor), format_cop(r.rebaja)
      );
    end if;
  end loop;
  return null;
end;
$$;

-- =============================================================================
-- 7. La validacion, en la base: cubre TODO camino de escritura
--
-- El alta del personal, el alta de un integrante por su padre (politica
-- `memberships_insert_seller`), el cambio del padre (`team_set_commission_model`),
-- el del personal (`staff_set_seller_agreement`) y un UPDATE directo del
-- personal por PostgREST (`memberships_update_staff`), que sigue existiendo para
-- reorganizar equipos (BR-E06, BR-E08). Por eso vive aqui y no en las RPC.
--
-- Se llama con `_seller_agreements` para dispararse DESPUES de
-- `memberships_validate_parent_seller` (orden alfabetico): el padre ya es un
-- vendedor activo de la organizacion cuando se mira su acuerdo.
-- =============================================================================

drop trigger memberships_validate_commission on memberships;
drop function memberships_validate_commission();

create function memberships_validate_seller_agreements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid               uuid := auth.uid();
  v_insert            boolean := tg_op = 'INSERT';
  v_parent_changed    boolean;
  v_team_changed      boolean;
  v_direct_changed    boolean;
  v_effective_changed boolean;
  v_kind              commission_tier_list_kind;
  v_owner             uuid;
  v_parent            record;
  v_child             record;
  v_problem           text;
  v_actor             text;
begin
  -- 1. El acuerdo de equipo, completo. Con fijo no hay lista; por tramos dentro
  --    de un equipo, la version de la lista general que rige al empezar a regir
  --    (entrar al equipo o pasar a tramos). Fuera de un equipo queda como este.
  if new.commission_model = 'fixed_per_ticket' then
    new.team_tier_list_id := null;
  elsif new.parent_seller_id is not null and new.team_tier_list_id is null then
    new.team_tier_list_id := commission_current_template(new.organization_id);
  end if;

  v_parent_changed := v_insert or new.parent_seller_id is distinct from old.parent_seller_id;
  v_team_changed := v_insert
    or (new.commission_model, new.fixed_commission_amount, new.team_tier_list_id)
       is distinct from (old.commission_model, old.fixed_commission_amount, old.team_tier_list_id);
  v_direct_changed := v_insert
    or (new.direct_commission_mode, new.direct_fixed_amount, new.direct_tier_list_id)
       is distinct from (old.direct_commission_mode, old.direct_fixed_amount, old.direct_tier_list_id);

  -- 2. Que lista puede usar cada acuerdo (la organizacion la garantizan las FK
  --    compuestas). El de equipo usa la lista general: el padre elige tramos o
  --    fijo, no escribe tramos (BR-G24). El administrativo, la general o una
  --    personalizada DE ESTE vendedor (BR-G29).
  if new.team_tier_list_id is not null
     and (v_insert or new.team_tier_list_id is distinct from old.team_tier_list_id) then
    select l.kind into v_kind from commission_tier_lists l where l.id = new.team_tier_list_id;
    if v_kind is distinct from 'template' then
      raise exception 'La ganancia por tramos de un integrante usa la lista general.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.direct_tier_list_id is not null
     and (v_insert or new.direct_tier_list_id is distinct from old.direct_tier_list_id) then
    select l.kind, l.owner_profile_id into v_kind, v_owner
    from commission_tier_lists l where l.id = new.direct_tier_list_id;
    if v_kind = 'custom' and v_owner is distinct from new.profile_id then
      raise exception 'Esa lista de tramos es de otro vendedor.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- 3. Quien puede (BR-G34). Solo con sesion: un proceso de la service role o
  --    esta misma migracion no tienen `auth.uid()`.
  if v_uid is not null then
    -- El alta de un vendedor, antes que cualquier regla de su acuerdo: solo el
    -- personal con la capacidad o su propio vendedor padre. Quien no puede dar
    -- de alta recibe el mismo rechazo de permisos que le daria la RLS, no una
    -- explicacion de un acuerdo que no le toca (E1-05).
    if v_insert and new.role = 'seller'
       and not (new.parent_seller_id is not distinct from v_uid
                or has_org_capability(new.organization_id, 'sellers.earnings.manage')) then
      raise exception 'No tienes permiso para dar de alta a este vendedor.'
        using errcode = 'insufficient_privilege';
    end if;

    if ((not v_insert and v_direct_changed) or (v_insert and new.direct_commission_mode <> 'half_price'))
       and not has_org_capability(new.organization_id, 'sellers.earnings.manage') then
      raise exception 'No tienes permiso para cambiar cómo se le paga a este vendedor.'
        using errcode = 'insufficient_privilege';
    end if;

    if ((not v_insert and v_team_changed)
        or (v_insert and (new.commission_model <> 'tiered' or new.fixed_commission_amount is not null)))
       and not (new.parent_seller_id is not distinct from v_uid
                or has_org_capability(new.organization_id, 'sellers.earnings.manage')) then
      raise exception 'No tienes permiso para cambiar cómo se le paga a este vendedor.'
        using errcode = 'insufficient_privilege';
    end if;

    -- La mitad del precio se conserva para quien ya la tiene; ninguna sesion la
    -- asigna de nuevo, ni al dar de alta ni al cambiar un acuerdo (BR-G30).
    if new.role = 'seller' and new.direct_commission_mode = 'half_price'
       and ((v_insert and new.parent_seller_id is null)
            or (not v_insert and old.direct_commission_mode <> 'half_price')) then
      raise exception 'La mitad del precio se conserva para quien ya la tiene, pero no se puede asignar de nuevo. Elige una ganancia fija o por tramos.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- 4. Dos niveles (BR-E03). Quien ya tiene equipo no pasa al de otro: el alta
  --    de 0022 solo miraba que el padre nuevo no tuviera padre (I-176).
  if new.parent_seller_id is not null and v_parent_changed
     and exists (
       select 1 from memberships h
       where h.parent_seller_id = new.profile_id
         and h.organization_id = new.organization_id
     ) then
    raise exception '% tiene su propio equipo y no puede pasar al equipo de otro vendedor.',
      commission_person_name(new.profile_id)
      using errcode = 'check_violation';
  end if;

  if new.role <> 'seller' then
    return new;
  end if;

  -- 5. Compatibilidad padre–hijo (BR-G28), bajo el cerrojo del equipo.
  if new.parent_seller_id is not null and (v_parent_changed or v_team_changed) then
    perform commission_team_lock(new.parent_seller_id);

    select m.direct_commission_mode, m.direct_fixed_amount, m.direct_tier_list_id
      into v_parent
    from memberships m
    where m.profile_id = new.parent_seller_id
      and m.organization_id = new.organization_id;

    v_actor := case when v_uid is not null and v_uid = new.parent_seller_id then 'parent' else 'staff' end;

    v_problem := commission_pair_problem(
      new.organization_id,
      new.parent_seller_id, v_parent.direct_commission_mode, v_parent.direct_fixed_amount,
      v_parent.direct_tier_list_id,
      new.profile_id, commission_team_mode(new.commission_model), new.fixed_commission_amount,
      new.team_tier_list_id,
      'child', v_actor
    );
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;
  end if;

  if new.parent_seller_id is null and not v_insert and v_direct_changed then
    perform commission_team_lock(new.profile_id);

    for v_child in
      select m.profile_id, m.commission_model, m.fixed_commission_amount, m.team_tier_list_id
      from memberships m
      where m.parent_seller_id = new.profile_id
        and m.organization_id = new.organization_id
      order by m.profile_id
    loop
      v_problem := commission_pair_problem(
        new.organization_id,
        new.profile_id, new.direct_commission_mode, new.direct_fixed_amount, new.direct_tier_list_id,
        v_child.profile_id, commission_team_mode(v_child.commission_model),
        v_child.fixed_commission_amount, v_child.team_tier_list_id,
        'parent', 'staff'
      );
      if v_problem is not null then
        raise exception '%', v_problem using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  -- 6. Las rebajas ya concedidas tienen que seguir cabiendo (BR-G31).
  v_effective_changed := not v_insert and (
    v_parent_changed
    or (new.parent_seller_id is null and v_direct_changed)
    or (new.parent_seller_id is not null and v_team_changed)
  );

  if v_effective_changed then
    if new.parent_seller_id is null then
      v_problem := commission_discount_problem(
        new.organization_id, new.profile_id,
        new.direct_commission_mode, new.direct_fixed_amount, new.direct_tier_list_id
      );
    else
      v_problem := commission_discount_problem(
        new.organization_id, new.profile_id,
        commission_team_mode(new.commission_model), new.fixed_commission_amount, new.team_tier_list_id
      );
    end if;
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger memberships_validate_seller_agreements
  before insert or update of
    parent_seller_id, role, commission_model, fixed_commission_amount, team_tier_list_id,
    direct_commission_mode, direct_fixed_amount, direct_tier_list_id
  on memberships
  for each row execute function memberships_validate_seller_agreements();

comment on function memberships_validate_seller_agreements() is
  'D-237: completa el acuerdo de equipo con la version vigente de la lista general, y valida en todo camino la lista que usa cada acuerdo, quien puede cambiarlo (BR-G34), que nadie reciba la mitad de nuevo (BR-G30), los dos niveles (I-176), la compatibilidad padre-hijo (BR-G28) y las rebajas ya concedidas (BR-G31).';

-- =============================================================================
-- 8. Las rifas tambien pueden romper un par: el precio de un padre en la mitad
--
-- Crear una rifa, bajarle el precio o reactivarla pone a un padre en la mitad
-- ante un limite nuevo. Subir el precio nunca empeora nada y no se mira.
-- =============================================================================

create function raffles_validate_team_agreements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_restrictive boolean;
  h             record;
  c             record;
  v             record;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_restrictive := true;
  else
    v_restrictive := new.ticket_price < old.ticket_price
      or (old.status in ('closed', 'cancelled') and new.status in ('draft', 'active'));
  end if;

  if not v_restrictive then
    return new;
  end if;

  for h in
    select m.profile_id
    from memberships m
    where m.organization_id = new.organization_id
      and m.role = 'seller'
      and m.parent_seller_id is null
      and m.direct_commission_mode = 'half_price'
      and exists (
        select 1 from memberships c2
        where c2.parent_seller_id = m.profile_id and c2.organization_id = m.organization_id
      )
    order by m.profile_id
  loop
    perform commission_team_lock(h.profile_id);

    -- Releido bajo el cerrojo: el acuerdo pudo cambiar mientras se esperaba.
    if not exists (
      select 1 from memberships m
      where m.profile_id = h.profile_id and m.organization_id = new.organization_id
        and m.parent_seller_id is null and m.direct_commission_mode = 'half_price'
    ) then
      continue;
    end if;

    for c in
      select m.profile_id, m.commission_model, m.fixed_commission_amount, m.team_tier_list_id
      from memberships m
      where m.parent_seller_id = h.profile_id and m.organization_id = new.organization_id
      order by m.profile_id
    loop
      select * into v
      from commission_half_raffle_violation(
        c.profile_id, commission_team_mode(c.commission_model), c.fixed_commission_amount,
        c.team_tier_list_id, new.id, new.ticket_price, new.status
      );
      if found then
        raise exception 'Con la rifa «%» a %, % ganaría % por boleta —la mitad del precio— y %, de su equipo, puede llegar a ganar %. Cambia primero alguno de los dos acuerdos.',
          new.name, format_cop(new.ticket_price), commission_person_name(h.profile_id),
          format_cop(v.parent_rate), commission_person_name(c.profile_id), format_cop(v.child_rate)
          using errcode = 'check_violation';
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

create trigger raffles_validate_team_agreements
  before insert or update of ticket_price, status on raffles
  for each row execute function raffles_validate_team_agreements();

-- =============================================================================
-- 9. El motor
--
-- Lo mismo que 0031 con TRES cambios, y ninguno de principio:
--
--   1. El conteo del tramo de un jefe es propias + equipo; el de los demas, las
--      propias (BR-G27). Se guarda aparte: `tier_tickets_paid`.
--   2. El padre recibe, por cada boleta de un integrante, SU tarifa menos la del
--      integrante (BR-G20), no la mitad menos la tarifa.
--   3. Si un par incompatible YA existia, el `greatest(0, …)` por integrante
--      sigue impidiendo una ganancia negativa, pero lo que absorbe se ANOTA en
--      `team_shortfall`: no se esconde (BR-G35). En un acuerdo admitido vale 0.
--
-- La idempotencia, la autocorreccion, el orden de cerrojos (integrante antes que
-- padre), la cascada con `p_team_source` de freno y las dos invariantes del
-- ledger siguen exactamente como estaban.
-- =============================================================================

alter table seller_commissions
  add column tier_tickets_paid integer not null default 0 check (tier_tickets_paid >= 0),
  add column team_shortfall    bigint  not null default 0 check (team_shortfall >= 0);

comment on column seller_commissions.tier_tickets_paid is
  'D-237, BR-G27: boletas que determinan el tramo. Para un jefe de equipo, las suyas mas las de su equipo; para los demas, las suyas.';
comment on column seller_commissions.team_shortfall is
  'D-237, BR-G35: lo que la empresa pone porque un integrante gana mas que su padre en un par que ya existia antes de validarse. Cero en todo acuerdo admitido.';

create or replace function recalc_seller_commission(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_seller_id       uuid,
  p_movement        commission_movement default null,
  p_ticket_id       uuid default null,
  p_team_source     uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n_before       integer;
  v_rate_before    bigint;
  v_earned_before  bigint;
  v_team_n_before  integer;
  v_team_before    bigint;
  v_tier_n_before  integer;
  v_short_before   bigint;
  v_n_after        integer;
  v_rate_after     bigint;
  v_earned_after   bigint;
  v_descuentos     bigint;
  v_padre          uuid;
  v_mode           commission_agreement_mode;
  v_fixed          bigint;
  v_list           uuid;
  v_price          bigint;
  v_hijos_n        integer[] := '{}';
  v_hijos_rate     bigint[] := '{}';
  v_team_n         integer := 0;
  v_team_earned    bigint := 0;
  v_short          bigint := 0;
  v_tier_n         integer;
  i                integer;
  v_delta          integer;
  v_movement       commission_movement;
  v_anotado        bigint := 0;
  v_resto          bigint;
begin
  if p_seller_id is null or p_raffle_id is null then
    return;
  end if;

  insert into seller_commissions (organization_id, raffle_id, seller_id)
  values (p_organization_id, p_raffle_id, p_seller_id)
  on conflict (raffle_id, seller_id) do nothing;

  select tickets_paid, rate, earned, team_tickets_paid, team_earned, tier_tickets_paid, team_shortfall
    into v_n_before, v_rate_before, v_earned_before, v_team_n_before, v_team_before,
         v_tier_n_before, v_short_before
  from seller_commissions
  where raffle_id = p_raffle_id and seller_id = p_seller_id
  for update;

  -- Lo que vendio el mismo, con sus rebajas, en UNA lectura (0028).
  select
    count(*)::integer,
    coalesce(sum(coalesce(t.base_price, t.sale_price) - t.sale_price), 0)::bigint
    into v_n_after, v_descuentos
  from tickets t
  where t.raffle_id = p_raffle_id
    and t.seller_id = p_seller_id
    and t.inventory_status = 'assigned'
    and t.payment_status = 'paid';

  -- El acuerdo que rige y el precio vigente de la rifa, en UNA lectura (la
  -- misma regla que `commission_effective_agreement`, escrita en la consulta).
  -- Sin membresia no hay acuerdo y la tarifa es cero, como en 0024.
  select m.parent_seller_id,
         case when m.parent_seller_id is null then m.direct_commission_mode
              else commission_team_mode(m.commission_model) end,
         case when m.parent_seller_id is null then m.direct_fixed_amount
              else m.fixed_commission_amount end,
         case when m.parent_seller_id is null then m.direct_tier_list_id
              else m.team_tier_list_id end,
         r.ticket_price
    into v_padre, v_mode, v_fixed, v_list, v_price
  from memberships m
  join raffles r on r.id = p_raffle_id
  where m.profile_id = p_seller_id
    and m.organization_id = p_organization_id;

  -- Lo que vendio su equipo, integrante por integrante y con la tarifa de cada
  -- uno ya calculada con SU conteo, en la misma lectura. Solo un jefe tiene
  -- equipo (dos niveles, BR-E03): a un integrante no se le pregunta.
  if v_mode is not null and v_padre is null then
    select coalesce(array_agg(h.n order by h.seller_id), '{}'),
           coalesce(array_agg(
             commission_agreement_rate(commission_team_mode(h.commission_model),
                                       h.fixed_commission_amount, h.team_tier_list_id,
                                       v_price, h.n)
             order by h.seller_id), '{}'),
           coalesce(sum(h.n), 0)::integer
      into v_hijos_n, v_hijos_rate, v_team_n
    from (
      select t.seller_id, m.commission_model, m.fixed_commission_amount, m.team_tier_list_id,
             count(*)::integer as n
      from tickets t
      join memberships m
        on m.profile_id = t.seller_id
       and m.organization_id = t.organization_id
      where t.raffle_id = p_raffle_id
        and t.organization_id = p_organization_id
        and t.inventory_status = 'assigned'
        and t.payment_status = 'paid'
        and m.parent_seller_id = p_seller_id
      group by t.seller_id, m.commission_model, m.fixed_commission_amount, m.team_tier_list_id
    ) as h;
  end if;

  -- BR-G27: el tramo de un jefe cuenta lo suyo y lo de su equipo.
  v_tier_n := v_n_after + v_team_n;
  v_rate_after := coalesce(commission_agreement_rate(v_mode, v_fixed, v_list, v_price, v_tier_n), 0);

  v_earned_after := greatest(0, v_n_after::bigint * v_rate_after - v_descuentos);

  -- BR-G20: por cada boleta de un integrante, la tarifa del padre menos la del
  -- integrante, cada uno con SU conteo. Las rebajas del integrante no entran: las
  -- asume el (BR-G17).
  for i in 1 .. coalesce(array_length(v_hijos_n, 1), 0) loop
    v_team_earned := v_team_earned + v_hijos_n[i]::bigint * greatest(0, v_rate_after - v_hijos_rate[i]);
    v_short := v_short + v_hijos_n[i]::bigint * greatest(0, v_hijos_rate[i] - v_rate_after);
  end loop;

  if v_earned_after = v_earned_before
     and v_n_after = v_n_before
     and v_team_earned = v_team_before
     and v_team_n = v_team_n_before
     and v_rate_after = v_rate_before
     and v_tier_n = v_tier_n_before
     and v_short = v_short_before
  then
    -- Nada que registrar: el camino de la idempotencia. Tampoco cascadea: si
    -- nada cambio para este vendedor, tampoco cambio para su padre por su culpa.
    return;
  end if;

  v_delta := v_n_after - v_n_before;

  if v_delta <> 0 then
    v_movement := coalesce(
      p_movement,
      case when v_delta > 0 then 'sale'::commission_movement
           else 'sale_reverted'::commission_movement
      end
    );

    v_anotado := v_anotado + v_delta::bigint * v_rate_after;

    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id, v_movement,
      v_delta::bigint * v_rate_after, v_n_after, v_rate_after, p_ticket_id
    );
  end if;

  -- Ajuste retroactivo por cambio de tarifa: de tramo —ahora tambien porque
  -- vendio el equipo—, de precio en la mitad o de acuerdo.
  if v_rate_after <> v_rate_before and v_n_before > 0 then
    v_anotado := v_anotado + v_n_before::bigint * (v_rate_after - v_rate_before);

    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id, 'tier_adjustment',
      v_n_before::bigint * (v_rate_after - v_rate_before),
      v_n_after, v_rate_after, p_ticket_id
    );
  end if;

  -- Lo que falte para cuadrar lo PROPIO: la rebaja y el recorte a cero, como
  -- resto (0028).
  v_resto := (v_earned_after - v_earned_before) - v_anotado;

  if v_resto <> 0 then
    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id, 'discount',
      v_resto, v_n_after, v_rate_after, p_ticket_id
    );
  end if;

  -- El movimiento del equipo: una linea con la diferencia, siempre marcada como
  -- de equipo (BR-G22), con el integrante que la provoco cuando se sabe.
  if v_team_earned <> v_team_before then
    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id, team_movement, from_seller_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id,
      case when v_team_earned > v_team_before then 'sale'::commission_movement
           else 'sale_reverted'::commission_movement
      end,
      v_team_earned - v_team_before,
      v_team_n,
      case when v_team_n > 0 then v_team_earned / v_team_n else 0 end,
      p_ticket_id,
      true,
      p_team_source
    );
  end if;

  update seller_commissions
     set tickets_paid      = v_n_after,
         rate              = v_rate_after,
         earned            = v_earned_after,
         team_tickets_paid = v_team_n,
         team_earned       = v_team_earned,
         tier_tickets_paid = v_tier_n,
         team_shortfall    = v_short,
         updated_at        = now()
   where raffle_id = p_raffle_id and seller_id = p_seller_id;

  -- La cascada al padre, al final y con freno (0031).
  if p_team_source is null and v_padre is not null then
    perform recalc_seller_commission(
      p_organization_id, p_raffle_id, v_padre, null, p_ticket_id, p_seller_id
    );
  end if;
end;
$$;

comment on function recalc_seller_commission is
  'Recuenta lo que vendio un vendedor Y lo que vendio su equipo, con el tramo del jefe contando las dos cosas (BR-G27), anota las diferencias en el ledger por partes y actualiza su comision. Cascadea al vendedor padre. Idempotente por construccion (BR-G05, BR-G10, BR-G20, BR-G22).';

drop function commission_team_earned(uuid, uuid, uuid);
drop function commission_rate_for(uuid, integer);

-- -----------------------------------------------------------------------------
-- El disparador de membresias escucha tambien los acuerdos nuevos
-- -----------------------------------------------------------------------------
drop trigger memberships_sync_commission on memberships;

create or replace function memberships_sync_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila record;
begin
  if (new.parent_seller_id, new.commission_model, new.fixed_commission_amount, new.team_tier_list_id,
      new.direct_commission_mode, new.direct_fixed_amount, new.direct_tier_list_id)
     is not distinct from
     (old.parent_seller_id, old.commission_model, old.fixed_commission_amount, old.team_tier_list_id,
      old.direct_commission_mode, old.direct_fixed_amount, old.direct_tier_list_id)
  then
    return null;
  end if;

  -- El afectado, en todas sus rifas (BR-G16, BR-G25). Si es un jefe, su fila
  -- recuenta lo propio y lo del equipo; si es un integrante, la cascada lleva el
  -- cambio a su padre ACTUAL.
  for v_fila in
    select raffle_id from seller_commissions where seller_id = new.profile_id
  loop
    perform recalc_seller_commission(new.organization_id, v_fila.raffle_id, new.profile_id);
  end loop;

  -- Y el padre ANTERIOR, al que la cascada ya no alcanza.
  if old.parent_seller_id is not null
     and old.parent_seller_id is distinct from new.parent_seller_id
  then
    for v_fila in
      select raffle_id from seller_commissions where seller_id = old.parent_seller_id
    loop
      perform recalc_seller_commission(
        new.organization_id, v_fila.raffle_id, old.parent_seller_id, null, null, new.profile_id
      );
    end loop;
  end if;

  return null;
end;
$$;

create trigger memberships_sync_commission
  after update of
    parent_seller_id, commission_model, fixed_commission_amount, team_tier_list_id,
    direct_commission_mode, direct_fixed_amount, direct_tier_list_id
  on memberships
  for each row execute function memberships_sync_commission();

-- =============================================================================
-- 10. La capacidad (D-200): la lista general y los acuerdos administrativos
--
-- Mismos dos espejos: aqui y `src/lib/auth/capabilities.ts`, comparados por una
-- prueba. El Dueño tiene todas; el Administrador recibe esta por compatibilidad,
-- como la de premios.
-- =============================================================================

create or replace function app_capability_catalog()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array['raffles.prizes.manage', 'sellers.earnings.manage']::text[]
$$;

create or replace function app_role_default_capabilities(p_role app_role)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_role
    when 'owner' then app_capability_catalog()
    when 'admin' then array['raffles.prizes.manage', 'sellers.earnings.manage']::text[]
    else array[]::text[]
  end
$$;

-- =============================================================================
-- 11. Las RPC
-- =============================================================================

-- La lista que usa un acuerdo por tramos: la general si no se personalizo o si la
-- personalizada es igual a la general; la que ya tenia si es igual; si no, una
-- personalizada nueva de este vendedor.
create function commission_resolve_tier_list(
  p_organization_id uuid,
  p_seller_id       uuid,
  p_tiers           jsonb,
  p_current_list    uuid,
  p_created_by      uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_template uuid := commission_current_template(p_organization_id);
  v_problem  text;
  v_wanted   jsonb;
begin
  if p_tiers is null then
    return v_template;
  end if;

  v_problem := commission_tiers_problem(p_tiers);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'check_violation';
  end if;

  v_wanted := commission_tiers_normalized(p_tiers);

  if v_template is not null and commission_list_json(v_template) = v_wanted then
    return v_template;
  end if;

  if p_current_list is not null and commission_list_json(p_current_list) = v_wanted then
    return p_current_list;
  end if;

  return commission_create_tier_list(p_organization_id, 'custom', p_seller_id, p_tiers, p_created_by);
end;
$$;

-- Lo que la bitacora guarda de un acuerdo administrativo: modo, cifra, lista y
-- sus tramos. Nada de la cartera (BR-Q10).
create function commission_direct_agreement_json(
  p_mode  commission_agreement_mode,
  p_fixed bigint,
  p_list  uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'direct_commission_mode', p_mode,
    'direct_fixed_amount', p_fixed,
    'direct_tier_list_id', p_list,
    'tiers', case when p_list is null then null else commission_list_json(p_list) end,
    'tier_list_kind', (select l.kind from commission_tier_lists l where l.id = p_list),
    'template_version', (select l.template_version from commission_tier_lists l where l.id = p_list)
  )
$$;

-- -----------------------------------------------------------------------------
-- save_commission_template — guardar la lista general entera (BR-G29)
--
-- Una version nueva, o ninguna si la lista es igual a la vigente: repetir el
-- guardado o un doble clic no crean versiones. NO recalcula a nadie: cada
-- acuerdo conserva la version que recibio.
-- -----------------------------------------------------------------------------
create function save_commission_template(p_organization_id uuid, p_tiers jsonb)
returns table (list_id uuid, template_version integer, changed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_current uuid;
  v_new     uuid;
  v_problem text;
begin
  if not has_org_capability(p_organization_id, 'sellers.earnings.manage') then
    raise exception 'No tienes permiso para cambiar la lista general de tramos.'
      using errcode = 'insufficient_privilege';
  end if;

  v_problem := commission_tiers_problem(p_tiers);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'check_violation';
  end if;

  -- Dos guardados a la vez se serializan aqui: el segundo ve la version del
  -- primero y, si es la misma lista, no crea otra.
  perform pg_advisory_xact_lock(hashtextextended('commission_template:' || p_organization_id::text, 0));

  v_current := commission_current_template(p_organization_id);

  if v_current is not null
     and commission_list_json(v_current) = commission_tiers_normalized(p_tiers) then
    return query
    select l.id, l.template_version, false from commission_tier_lists l where l.id = v_current;
    return;
  end if;

  v_new := commission_create_tier_list(p_organization_id, 'template', null, p_tiers, v_uid);

  perform write_audit_log(
    p_organization_id,
    'commission_template.update',
    'commission_template',
    v_new,
    case when v_current is null then null else jsonb_build_object(
      'list_id', v_current,
      'template_version', (select l.template_version from commission_tier_lists l where l.id = v_current),
      'tiers', commission_list_json(v_current)
    ) end,
    jsonb_build_object(
      'list_id', v_new,
      'template_version', (select l.template_version from commission_tier_lists l where l.id = v_new),
      'tiers', commission_list_json(v_new)
    )
  );

  return query
  select l.id, l.template_version, true from commission_tier_lists l where l.id = v_new;
end;
$$;

comment on function save_commission_template(uuid, jsonb) is
  'D-237, BR-G29: guarda la lista general como una version nueva (o ninguna si no cambio). Capacidad sellers.earnings.manage. No recalcula a nadie.';

-- -----------------------------------------------------------------------------
-- staff_create_seller_membership — el alta de un vendedor por el personal, con
-- su acuerdo, en UNA transaccion (BR-G30)
--
-- La cuenta de Auth ya existe (la creo la invitacion); aqui nace la membresia
-- con el acuerdo completo y, si hace falta, su lista personalizada. Si algo
-- falla no queda ninguna de las dos, y la aplicacion borra la cuenta (D-045): no
-- hay un instante en que el vendedor pueda operar con un acuerdo a medias.
-- -----------------------------------------------------------------------------
create function staff_create_seller_membership(
  p_organization_id uuid,
  p_profile_id      uuid,
  p_mode            commission_agreement_mode,
  p_fixed_amount    bigint default null,
  p_tiers           jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := require_auth();
  v_list uuid;
  v_id   uuid;
begin
  if not has_org_capability(p_organization_id, 'sellers.earnings.manage') then
    raise exception 'No tienes permiso para dar de alta vendedores con su ganancia.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_mode is null or p_mode = 'half_price' then
    raise exception 'Elige cómo se le va a pagar: una ganancia fija o por tramos.'
      using errcode = 'check_violation';
  end if;

  if p_mode = 'fixed_per_ticket' and (p_fixed_amount is null or p_fixed_amount <= 0) then
    raise exception 'Escribe cuánto ganará por cada boleta que cobre completa.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from profiles p where p.id = p_profile_id) then
    raise exception 'La cuenta de la persona no existe.' using errcode = 'foreign_key_violation';
  end if;

  if p_mode = 'tiered' then
    v_list := commission_resolve_tier_list(p_organization_id, p_profile_id, p_tiers, null, v_uid);
  end if;

  insert into memberships (
    organization_id, profile_id, role, invited_by,
    direct_commission_mode, direct_fixed_amount, direct_tier_list_id
  )
  values (
    p_organization_id, p_profile_id, 'seller', v_uid,
    p_mode,
    case when p_mode = 'fixed_per_ticket' then p_fixed_amount end,
    v_list
  )
  returning id into v_id;

  perform write_audit_log(
    p_organization_id, 'user.commission_agreement', 'user', p_profile_id,
    null,
    commission_direct_agreement_json(
      p_mode, case when p_mode = 'fixed_per_ticket' then p_fixed_amount end, v_list
    ) || jsonb_build_object('changed_by', v_uid, 'source', 'create')
  );

  return v_id;
end;
$$;

comment on function staff_create_seller_membership(uuid, uuid, commission_agreement_mode, bigint, jsonb) is
  'D-237, BR-G30: membresia de vendedor con su acuerdo administrativo (fijo, lista general o tramos propios) en una transaccion. Capacidad sellers.earnings.manage. Nunca la mitad.';

-- -----------------------------------------------------------------------------
-- staff_set_seller_agreement — cambiar el acuerdo administrativo (BR-G31)
--
-- Explicito y con consecuencias: el disparador valida (compatibilidad con su
-- equipo, rebajas ya concedidas) y recalcula hacia atras todas sus rifas en esta
-- misma transaccion. Si no cambia nada, no escribe nada.
-- -----------------------------------------------------------------------------
create function staff_set_seller_agreement(
  p_seller_id    uuid,
  p_mode         commission_agreement_mode,
  p_fixed_amount bigint default null,
  p_tiers        jsonb default null
)
returns table (changed boolean, raffles_recalculated integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_m       memberships%rowtype;
  v_list    uuid;
  v_fixed   bigint;
  v_raffles integer;
begin
  select m.* into v_m
  from memberships m
  where m.profile_id = p_seller_id
    and m.role = 'seller'
    and m.organization_id in (select current_staff_org_ids())
  for update;

  -- Uno ajeno y uno inexistente responden igual.
  if not found or not has_org_capability(v_m.organization_id, 'sellers.earnings.manage') then
    raise exception 'El vendedor no existe o no tienes acceso a él.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_mode is null then
    raise exception 'Elige cómo se le va a pagar.' using errcode = 'check_violation';
  end if;

  if p_mode = 'half_price' and v_m.direct_commission_mode <> 'half_price' then
    raise exception 'La mitad del precio se conserva para quien ya la tiene, pero no se puede asignar de nuevo. Elige una ganancia fija o por tramos.'
      using errcode = 'check_violation';
  end if;

  if p_mode = 'fixed_per_ticket' then
    if p_fixed_amount is null or p_fixed_amount <= 0 then
      raise exception 'Escribe cuánto ganará por cada boleta que cobre completa.'
        using errcode = 'check_violation';
    end if;
    v_fixed := p_fixed_amount;
  elsif p_mode = 'tiered' then
    -- Sin tramos: la lista general VIGENTE. Con tramos: la general si son iguales
    -- a ella, la que ya tenia si son iguales a esa, o una personalizada nueva.
    v_list := commission_resolve_tier_list(
      v_m.organization_id, p_seller_id, p_tiers, v_m.direct_tier_list_id, v_uid
    );
  end if;

  if (p_mode, v_fixed, v_list)
     is not distinct from (v_m.direct_commission_mode, v_m.direct_fixed_amount, v_m.direct_tier_list_id) then
    return query select false, 0;
    return;
  end if;

  update memberships
     set direct_commission_mode = p_mode,
         direct_fixed_amount    = v_fixed,
         direct_tier_list_id    = v_list
   where id = v_m.id;

  select count(*)::integer into v_raffles
  from seller_commissions sc
  where sc.seller_id = p_seller_id and sc.organization_id = v_m.organization_id;

  perform write_audit_log(
    v_m.organization_id, 'user.commission_agreement', 'user', p_seller_id,
    commission_direct_agreement_json(v_m.direct_commission_mode, v_m.direct_fixed_amount, v_m.direct_tier_list_id),
    commission_direct_agreement_json(p_mode, v_fixed, v_list)
      || jsonb_build_object('changed_by', v_uid, 'source', 'change',
                            'raffles_recalculated', v_raffles)
  );

  return query select true, v_raffles;
end;
$$;

comment on function staff_set_seller_agreement(uuid, commission_agreement_mode, bigint, jsonb) is
  'D-237, BR-G31: cambia el acuerdo administrativo de un vendedor. Valida y recalcula hacia atras en la misma transaccion; sin cambios no escribe nada. Capacidad sellers.earnings.manage.';

-- -----------------------------------------------------------------------------
-- team_set_commission_model — el padre cambia la ganancia de un integrante
--
-- La de 0031, con tres diferencias: pasar a tramos fija la version vigente de la
-- lista general; no cambiar nada no escribe nada (ni en la bitacora); y el tope
-- ya no es la mitad del precio, es el acuerdo del propio padre (BR-G28), que
-- valida el disparador.
-- -----------------------------------------------------------------------------
create or replace function team_set_commission_model(
  p_member_id uuid,
  p_model     commission_model,
  p_amount    bigint default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid;
  v_before record;
  v_amount bigint := case when p_model = 'fixed_per_ticket' then p_amount else null end;
  v_list   uuid;
begin
  v_org := team_member_guard(p_member_id);

  if p_model = 'fixed_per_ticket' and coalesce(v_amount, 0) <= 0 then
    raise exception 'Escribe cuánto ganará por cada boleta que cobre completa.'
      using errcode = 'check_violation';
  end if;

  select m.commission_model, m.fixed_commission_amount, m.team_tier_list_id
    into v_before
  from memberships m
  where m.profile_id = p_member_id and m.organization_id = v_org
  for update;

  -- Seguir por tramos no cambia la version que ya recibio; pasar a tramos toma la
  -- vigente.
  if p_model = 'tiered' then
    v_list := case when v_before.commission_model = 'tiered' then v_before.team_tier_list_id
                   else commission_current_template(v_org) end;
  end if;

  if (p_model, v_amount, v_list)
     is not distinct from (v_before.commission_model, v_before.fixed_commission_amount, v_before.team_tier_list_id) then
    return;
  end if;

  update memberships
     set commission_model        = p_model,
         fixed_commission_amount = v_amount,
         team_tier_list_id       = v_list
   where profile_id = p_member_id
     and organization_id = v_org;

  perform write_audit_log(
    v_org, 'user.commission_model', 'user', p_member_id,
    jsonb_build_object('commission_model', v_before.commission_model,
                       'fixed_commission_amount', v_before.fixed_commission_amount,
                       'team_tier_list_id', v_before.team_tier_list_id),
    jsonb_build_object('commission_model', p_model,
                       'fixed_commission_amount', v_amount,
                       'team_tier_list_id', v_list,
                       'changed_by', auth.uid())
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- team_commission_limits — lo que el padre puede ofrecerle a un integrante NUEVO
--
-- Para que la pantalla no ofrezca algo que la base va a rechazar: el fijo mas
-- alto posible y si la lista general cabe en su acuerdo. La ultima palabra la
-- sigue teniendo el disparador, que ademas mira las rifas cerradas donde un
-- integrante ya vendio y sus rebajas.
-- -----------------------------------------------------------------------------
create function team_commission_limits(p_organization_id uuid)
returns table (max_fixed bigint, template_list_id uuid, template_problem text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := require_auth();
  v_head     record;
  v_template uuid := commission_current_template(p_organization_id);
begin
  if not current_profile_leads_team(p_organization_id) then
    raise exception 'Solo un vendedor a cargo de su equipo puede consultar esto.'
      using errcode = 'insufficient_privilege';
  end if;

  select m.direct_commission_mode, m.direct_fixed_amount, m.direct_tier_list_id
    into v_head
  from memberships m
  where m.profile_id = v_uid and m.organization_id = p_organization_id;

  return query
  select
    commission_parent_cap(p_organization_id, null, v_head.direct_commission_mode,
                          v_head.direct_fixed_amount, v_head.direct_tier_list_id),
    v_template,
    commission_pair_problem(
      p_organization_id, v_uid,
      v_head.direct_commission_mode, v_head.direct_fixed_amount, v_head.direct_tier_list_id,
      null, 'tiered', null, v_template,
      'child', 'parent'
    );
end;
$$;

comment on function team_commission_limits(uuid) is
  'D-237: para el vendedor a cargo que llama, el fijo mas alto que puede pagarle a un integrante nuevo y si la lista general cabe en su acuerdo (BR-G28). Solo informa: valida el disparador.';

drop function team_max_fixed_commission(uuid);

-- =============================================================================
-- 12. Lectura: commission_summary con el conteo del tramo
-- =============================================================================

drop function commission_summary(uuid);

create function commission_summary(p_raffle_id uuid default null)
returns table (
  seller_id         uuid,
  raffle_id         uuid,
  -- Con que regla se le paga, la que RIGE: half_price, tiered o fixed.
  pay_model         text,
  -- Verdadero solo si rige un acuerdo por tramos: la condicion para hablar de
  -- subir de tramo.
  by_tiers          boolean,
  tickets_paid      integer,
  rate              bigint,
  earned            bigint,
  team_tickets_paid integer,
  team_earned       bigint,
  -- BR-G27: las boletas que determinan su tramo.
  tier_tickets_paid integer,
  next_min_tickets  integer,
  next_rate         bigint,
  tickets_to_next   integer,
  -- PROYECCION de lo propio al llegar al siguiente tramo. Solo sin equipo que
  -- cuente: con equipo, el siguiente tramo depende de quien venda.
  projected_earned  bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    sc.seller_id,
    sc.raffle_id,
    case ag.mode when 'half_price' then 'half_price' when 'fixed_per_ticket' then 'fixed' else 'tiered' end,
    ag.mode = 'tiered',
    sc.tickets_paid,
    sc.rate,
    sc.earned,
    sc.team_tickets_paid,
    sc.team_earned,
    sc.tier_tickets_paid,
    siguiente.min_tickets,
    siguiente.rate,
    siguiente.min_tickets - sc.tier_tickets_paid,
    case when siguiente.min_tickets is not null and sc.team_tickets_paid = 0
         then siguiente.min_tickets::bigint * siguiente.rate end
  from seller_commissions sc
  join memberships m
    on m.profile_id = sc.seller_id
   and m.organization_id = sc.organization_id
  -- En linea y no con `commission_team_mode`: esta funcion es de INVOCADOR, y
  -- una sesion no ejecuta las piezas internas del motor (D-128).
  cross join lateral (
    select
      case when m.parent_seller_id is null then m.direct_commission_mode
           when m.commission_model = 'fixed_per_ticket' then 'fixed_per_ticket'::commission_agreement_mode
           else 'tiered'::commission_agreement_mode end as mode,
      case when m.parent_seller_id is null then m.direct_tier_list_id
           else m.team_tier_list_id end as list_id
  ) as ag
  left join lateral (
    select i.min_tickets, i.rate
    from commission_tier_list_items i
    where ag.mode = 'tiered'
      and i.list_id = ag.list_id
      and i.min_tickets > sc.tier_tickets_paid
    order by i.min_tickets
    limit 1
  ) as siguiente on true
  where (p_raffle_id is null or sc.raffle_id = p_raffle_id)
$$;

comment on function commission_summary is
  'Comision propia, de equipo, conteo del tramo (BR-G27), forma de pago que rige y proximo tramo por vendedor y rifa. SECURITY INVOKER: hereda la RLS de seller_commissions y de las listas de tramos (BR-G11, BR-G13).';

-- =============================================================================
-- 13. Diagnostico, solo para la service role
--
-- Lo que la migracion no corrige porque cambiaria dinero, y hay que poder medir
-- antes de decidir (seccion 3.8 del encargo): pares incompatibles que ya
-- existian, tres niveles (I-176), faltantes que la empresa esta poniendo y
-- rebajas que un acuerdo ya no cubre.
-- =============================================================================

create function commission_agreement_problems()
returns table (
  problem         text,
  organization_id uuid,
  seller_id       uuid,
  parent_id       uuid,
  raffle_id       uuid,
  detail          text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  m       record;
  v_texto text;
begin
  for m in
    select h.organization_id, h.profile_id, h.parent_seller_id, h.commission_model,
           h.fixed_commission_amount, h.team_tier_list_id,
           p.direct_commission_mode, p.direct_fixed_amount, p.direct_tier_list_id
    from memberships h
    join memberships p
      on p.profile_id = h.parent_seller_id and p.organization_id = h.organization_id
    where h.parent_seller_id is not null and h.role = 'seller'
    order by h.organization_id, h.parent_seller_id, h.profile_id
  loop
    v_texto := commission_pair_problem(
      m.organization_id, m.parent_seller_id,
      m.direct_commission_mode, m.direct_fixed_amount, m.direct_tier_list_id,
      m.profile_id, commission_team_mode(m.commission_model), m.fixed_commission_amount,
      m.team_tier_list_id, 'child', 'staff'
    );
    if v_texto is not null then
      return query select 'par_incompatible'::text, m.organization_id, m.profile_id,
                          m.parent_seller_id, null::uuid, v_texto;
    end if;
  end loop;

  return query
  select 'tres_niveles'::text, h.organization_id, h.profile_id, h.parent_seller_id, null::uuid,
         format('%s pertenece al equipo de %s y además tiene equipo propio.',
                commission_person_name(h.profile_id), commission_person_name(h.parent_seller_id))
  from memberships h
  where h.parent_seller_id is not null
    and exists (select 1 from memberships c
                where c.parent_seller_id = h.profile_id and c.organization_id = h.organization_id);

  return query
  select 'faltante_de_equipo'::text, sc.organization_id, sc.seller_id, null::uuid, sc.raffle_id,
         format('La empresa pone %s porque integrantes de %s ganan más que él.',
                format_cop(sc.team_shortfall), commission_person_name(sc.seller_id))
  from seller_commissions sc
  where sc.team_shortfall > 0;

  for m in
    select mm.organization_id, mm.profile_id, ag.mode, ag.fixed, ag.list_id
    from memberships mm
    cross join lateral commission_effective_agreement(mm.organization_id, mm.profile_id) ag
    where mm.role = 'seller'
  loop
    v_texto := commission_discount_problem(m.organization_id, m.profile_id, m.mode, m.fixed, m.list_id);
    if v_texto is not null then
      return query select 'rebaja_sin_cubrir'::text, m.organization_id, m.profile_id,
                          null::uuid, null::uuid, v_texto;
    end if;
  end loop;
end;
$$;

comment on function commission_agreement_problems() is
  'D-237, BR-G35: diagnostico de solo lectura. Pares incompatibles, tres niveles (I-176), faltantes de equipo y rebajas que un acuerdo ya no cubre. Solo la service role.';

-- =============================================================================
-- 14. Las tablas viejas se van
-- =============================================================================

drop table commission_tiers;

-- =============================================================================
-- 15. RLS y privilegios de las tablas nuevas
-- =============================================================================

-- La lista general es la regla del juego: la lee toda la organizacion, como la
-- leia `commission_tiers`. Una personalizada, su dueño y el personal.
create policy commission_tier_lists_select on commission_tier_lists for select to authenticated
using (
  organization_id in (select current_org_ids())
  and (
    kind = 'template'
    or owner_profile_id = (select current_profile_id())
    or organization_id in (select current_staff_org_ids())
  )
);

-- Un tramo se ve si se ve su lista: la politica de la lista hace el trabajo.
create policy commission_tier_list_items_select on commission_tier_list_items for select to authenticated
using (exists (select 1 from commission_tier_lists l where l.id = list_id));

-- Ninguna sesion escribe listas: solo las RPC (BR-G11, BR-G34).
grant select on commission_tier_lists      to authenticated;
grant select on commission_tier_list_items to authenticated;
grant all    on commission_tier_lists      to service_role;
grant all    on commission_tier_list_items to service_role;

-- =============================================================================
-- 16. La bitacora del personal: las claves nuevas de una membresia y la lista
--     general (D-198). Un acuerdo no es cartera: lo configura el personal.
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
               'fixed_commission_amount', 'team_tier_list_id', 'direct_commission_mode',
               'direct_fixed_amount', 'direct_tier_list_id', 'public_slug',
               'public_catalog_enabled', 'public_whatsapp_number', 'public_raffle_id'
             ]
             when 'raffle_prize' then array[
               'raffle_id', 'prize_id', 'prize_ids', 'version_id', 'version_number',
               'previous_version_id', 'change', 'status', 'title', 'category',
               'reward_mode', 'reward_options', 'number_field', 'digits', 'rules_count',
               'material', 'notified', 'position', 'count'
             ]
             when 'commission_template' then array['list_id', 'template_version', 'tiers']
             else array[]::text[]
           end
         )
      ),
      '{}'::jsonb
    )
  end
$$;

-- =============================================================================
-- 17. Quien ejecuta cada funcion (D-207, I-132): una lista explicita
--
-- En el proyecto alojado toda funcion nueva nace ejecutable por `service_role`;
-- en local no. Se quita a TODOS y se concede solo lo que hace falta. Espejo:
-- `scripts/earning-function-grants.ts`, que usan `verify-remote` y las pruebas.
-- =============================================================================

-- Nadie, para todo lo interno.
revoke execute on function commission_tiers_problem(jsonb) from public, anon, authenticated, service_role;
revoke execute on function commission_tiers_normalized(jsonb) from public, anon, authenticated, service_role;
revoke execute on function commission_list_json(uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_tier_lists_complete() from public, anon, authenticated, service_role;
revoke execute on function commission_tier_list_items_guard() from public, anon, authenticated, service_role;
revoke execute on function commission_tier_lists_immutable() from public, anon, authenticated, service_role;
revoke execute on function commission_current_template(uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_create_tier_list(uuid, commission_tier_list_kind, uuid, jsonb, uuid) from public, anon, authenticated, service_role;
revoke execute on function organizations_seed_commission_template() from public, anon, authenticated, service_role;
revoke execute on function commission_team_mode(commission_model) from public, anon, authenticated, service_role;
revoke execute on function commission_agreement_rate(commission_agreement_mode, bigint, uuid, bigint, integer) from public, anon, authenticated, service_role;
revoke execute on function commission_agreement_floor(commission_agreement_mode, bigint, uuid, bigint) from public, anon, authenticated, service_role;
revoke execute on function commission_agreement_max(commission_agreement_mode, bigint, uuid, bigint) from public, anon, authenticated, service_role;
revoke execute on function commission_effective_agreement(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_rate_for_seller(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke execute on function commission_floor_rate(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_pair_violation(commission_agreement_mode, bigint, uuid, commission_agreement_mode, bigint, uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_half_raffle_violation(uuid, commission_agreement_mode, bigint, uuid, uuid, bigint, raffle_status) from public, anon, authenticated, service_role;
revoke execute on function commission_pair_problem_detail(uuid, uuid, commission_agreement_mode, bigint, uuid, commission_agreement_mode, bigint, uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_parent_cap(uuid, uuid, commission_agreement_mode, bigint, uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_tickets_phrase(integer) from public, anon, authenticated, service_role;
revoke execute on function commission_person_name(uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_pair_problem(uuid, uuid, commission_agreement_mode, bigint, uuid, uuid, commission_agreement_mode, bigint, uuid, text, text) from public, anon, authenticated, service_role;
revoke execute on function commission_team_lock(uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_discount_problem(uuid, uuid, commission_agreement_mode, bigint, uuid) from public, anon, authenticated, service_role;
revoke execute on function memberships_validate_seller_agreements() from public, anon, authenticated, service_role;
revoke execute on function raffles_validate_team_agreements() from public, anon, authenticated, service_role;
revoke execute on function memberships_sync_commission() from public, anon, authenticated, service_role;
revoke execute on function commission_resolve_tier_list(uuid, uuid, jsonb, uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_direct_agreement_json(commission_agreement_mode, bigint, uuid) from public, anon, authenticated, service_role;

-- Las RPC de una sesion: autorizan por la capacidad, por ser el padre o por la RLS.
revoke execute on function save_commission_template(uuid, jsonb) from public, anon, authenticated, service_role;
revoke execute on function staff_create_seller_membership(uuid, uuid, commission_agreement_mode, bigint, jsonb) from public, anon, authenticated, service_role;
revoke execute on function staff_set_seller_agreement(uuid, commission_agreement_mode, bigint, jsonb) from public, anon, authenticated, service_role;
revoke execute on function team_set_commission_model(uuid, commission_model, bigint) from public, anon, authenticated, service_role;
revoke execute on function team_commission_limits(uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_summary(uuid) from public, anon, authenticated, service_role;
grant execute on function save_commission_template(uuid, jsonb) to authenticated;
grant execute on function staff_create_seller_membership(uuid, uuid, commission_agreement_mode, bigint, jsonb) to authenticated;
grant execute on function staff_set_seller_agreement(uuid, commission_agreement_mode, bigint, jsonb) to authenticated;
grant execute on function team_set_commission_model(uuid, commission_model, bigint) to authenticated;
grant execute on function team_commission_limits(uuid) to authenticated;
grant execute on function commission_summary(uuid) to authenticated;

-- La service role: el motor para la reparacion operativa (0024) y el diagnostico.
revoke execute on function recalc_seller_commission(uuid, uuid, uuid, commission_movement, uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function commission_agreement_problems() from public, anon, authenticated, service_role;
grant execute on function recalc_seller_commission(uuid, uuid, uuid, commission_movement, uuid, uuid) to service_role;
grant execute on function commission_agreement_problems() to service_role;

-- =============================================================================
-- 18. Recalculo de lo existente, y la prueba de que no movio dinero
--
-- Se recuentan todas las filas —tambien las de un jefe sin fila propia— para
-- rellenar `tier_tickets_paid` y `team_shortfall`. Con los acuerdos conservados,
-- ni `earned` ni `team_earned` pueden cambiar y el ledger no puede ganar una sola
-- fila: si ocurriera, la migracion se deshace entera.
-- =============================================================================

do $$
declare
  r             record;
  v_distintas   integer;
  v_nuevas      integer;
  v_ledger      record;
  v_antes       record;
  v_partes      integer;
  v_problemas   integer;
  v_privilegios text;
begin
  -- La foto de antes, en el mismo bloque que el recalculo y la comparacion.
  create temporary table antes_0078 as
  select raffle_id, seller_id, tickets_paid, earned, team_tickets_paid, team_earned
  from seller_commissions;

  select count(*) as filas, coalesce(sum(amount), 0) as suma into v_antes from commission_ledger;

  for r in
    select organization_id, raffle_id, seller_id from seller_commissions
    union
    select t.organization_id, t.raffle_id, m.parent_seller_id
    from tickets t
    join memberships m
      on m.profile_id = t.seller_id and m.organization_id = t.organization_id
    where m.parent_seller_id is not null
    group by t.organization_id, t.raffle_id, m.parent_seller_id
  loop
    perform recalc_seller_commission(r.organization_id, r.raffle_id, r.seller_id);
  end loop;

  select count(*) into v_distintas
  from antes_0078 a
  join seller_commissions sc using (raffle_id, seller_id)
  where (a.tickets_paid, a.earned, a.team_tickets_paid, a.team_earned)
        is distinct from (sc.tickets_paid, sc.earned, sc.team_tickets_paid, sc.team_earned);

  select count(*) into v_nuevas
  from seller_commissions sc
  where not exists (select 1 from antes_0078 a where a.raffle_id = sc.raffle_id and a.seller_id = sc.seller_id)
    and (sc.earned <> 0 or sc.team_earned <> 0);

  select count(*) as filas, coalesce(sum(amount), 0) as suma into v_ledger from commission_ledger;
  drop table antes_0078;

  if v_distintas <> 0 or v_nuevas <> 0 or v_ledger.filas <> v_antes.filas or v_ledger.suma <> v_antes.suma then
    raise exception '0078 cambiaría dinero: % filas de comisión distintas, % filas nuevas con importe, ledger de % a % filas (suma % a %). No se aplica.',
      v_distintas, v_nuevas, v_antes.filas, v_ledger.filas, v_antes.suma, v_ledger.suma;
  end if;

  -- BR-G22, por partes, en todas las filas.
  select count(*) into v_partes
  from seller_commissions sc
  where sc.earned <> coalesce((select sum(l.amount) from commission_ledger l
                                where l.raffle_id = sc.raffle_id and l.seller_id = sc.seller_id
                                  and not l.team_movement), 0)
     or sc.team_earned <> coalesce((select sum(l.amount) from commission_ledger l
                                     where l.raffle_id = sc.raffle_id and l.seller_id = sc.seller_id
                                       and l.team_movement), 0);
  if v_partes <> 0 then
    raise exception '0078: % filas de comisión no cuadran con su ledger por partes (BR-G22).', v_partes;
  end if;

  -- Quien ejecuta cada funcion de esta migracion, EFECTIVO (con o sin el
  -- privilegio por defecto del proyecto alojado).
  select string_agg(format('%s (%s)', f.firma, f.quien), ', ')
    into v_privilegios
  from (
    select p.oid::regprocedure::text as firma,
           concat_ws('+',
             case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
             case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end,
             case when has_function_privilege('service_role', p.oid, 'EXECUTE') then 'service_role' end
           ) as quien,
           p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'commission_tiers_problem', 'commission_tiers_normalized', 'commission_list_json',
        'commission_tier_lists_complete', 'commission_tier_list_items_guard',
        'commission_tier_lists_immutable', 'commission_current_template',
        'commission_create_tier_list', 'organizations_seed_commission_template',
        'commission_team_mode', 'commission_agreement_rate', 'commission_agreement_floor',
        'commission_agreement_max', 'commission_effective_agreement',
        'commission_rate_for_seller', 'commission_floor_rate', 'commission_pair_violation',
        'commission_half_raffle_violation', 'commission_pair_problem_detail',
        'commission_parent_cap', 'commission_person_name', 'commission_tickets_phrase',
        'commission_pair_problem',
        'commission_team_lock', 'commission_discount_problem',
        'memberships_validate_seller_agreements', 'raffles_validate_team_agreements',
        'memberships_sync_commission', 'commission_resolve_tier_list',
        'commission_direct_agreement_json', 'save_commission_template',
        'staff_create_seller_membership', 'staff_set_seller_agreement',
        'team_set_commission_model', 'team_commission_limits', 'commission_summary',
        'recalc_seller_commission', 'commission_agreement_problems'
      )
  ) f
  where f.quien is distinct from (
    case
      when f.proname in ('save_commission_template', 'staff_create_seller_membership',
                         'staff_set_seller_agreement', 'team_set_commission_model',
                         'team_commission_limits', 'commission_summary') then 'authenticated'
      when f.proname in ('recalc_seller_commission', 'commission_agreement_problems') then 'service_role'
      else ''
    end
  );

  if v_privilegios is not null then
    raise exception '0078: privilegios de EXECUTE distintos de los esperados: %', v_privilegios;
  end if;

  select count(*) into v_problemas from commission_agreement_problems();
  raise notice '0078: acuerdos conservados sin mover dinero. Diagnóstico: % problemas preexistentes (select * from commission_agreement_problems()).', v_problemas;
end
$$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA. Solo es reversible sin perdida mientras
-- ningun acuerdo administrativo sea distinto de la mitad, ningun integrante este
-- en una version de la lista general distinta de la 1 y la lista general no
-- tenga mas versiones: nada de eso cabe en `commission_tiers`.
--
--   1. Comprobar: select count(*) from memberships where direct_commission_mode <> 'half_price';
--                 select count(*) from commission_tier_lists where kind = 'custom' or template_version > 1;
--   2. Volver a crear `commission_tiers` con la version 1 de cada organizacion, y
--      los cuerpos de 0031 de: commission_rate_for, commission_rate_for_seller,
--      commission_floor_rate, commission_team_earned, recalc_seller_commission,
--      memberships_validate_commission (+ su disparador), memberships_sync_commission
--      (+ su disparador de tres columnas), team_set_commission_model,
--      team_max_fixed_commission, commission_summary y organizations_seed_commission_tiers;
--      y los de 0058 de app_capability_catalog, app_role_default_capabilities, y 0059
--      de admin_audit_redact.
--   3. drop trigger raffles_validate_team_agreements, memberships_validate_seller_agreements,
--      organizations_seed_commission_template; drop de las funciones nuevas; drop de las
--      columnas nuevas de memberships y seller_commissions; drop de las dos tablas
--      nuevas y de los dos tipos.
--   4. El mismo bucle de recalculo del final.
--
-- Revertir le quitaria a un jefe por tramos el conteo de su equipo y a un vendedor
-- directo su fijo o sus tramos: es un cambio de lo que se le debe a la gente.
-- =============================================================================
