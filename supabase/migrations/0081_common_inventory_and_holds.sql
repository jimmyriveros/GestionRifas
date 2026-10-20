-- =============================================================================
-- 0081 — Inventario comun, generador por rangos, lotes y apartados temporales
-- (D-257, BR-I17..BR-I31, BR-N15..BR-N18)
--
-- UNA SOLA DISPONIBILIDAD. Una boleta sigue siendo una fila de `tickets` con
-- una unica identidad durante todo su recorrido. Lo que cambia es QUIEN la tiene:
--
--   seller_id NULL, sin apartado vigente   inventario comun de la rifa: libre
--   seller_id NULL, con apartado vigente   tomada temporalmente por un vendedor
--   seller_id con valor                    con un vendedor: entregada por el
--                                          personal, creada por el o vendida
--
-- `inventory_status` NO cambia de significado: `assigned` sigue siendo «vendida
-- a un cliente». La custodia no es un estado de inventario. No existe un
-- vendedor ficticio: el inventario comun es la ausencia de vendedor, y un CHECK
-- la limita a boletas disponibles o anuladas, sin cliente ni venta.
--
-- LOS APARTADOS NO TOCAN LA BOLETA. Viven en `ticket_holds`, con identidad
-- propia, vencimiento, una sola extension y un identificador de solicitud. La
-- boleta apartada conserva `seller_id` NULL: no entra en «Mis boletas», ni en el
-- catalogo publico, ni en comisiones, ni en coincidencias de loteria. Al
-- venderse, la venta le pone el vendedor y cierra el apartado en la misma
-- transaccion. El vencimiento se interpreta en cada lectura (`expires_at >
-- now()`): ninguna tarea programada lo hace cumplir.
--
-- LAS BOLETAS EXISTENTES NO CAMBIAN. Ninguna fila se migra: todas conservan su
-- vendedor, su estado y su historia, y ninguna recibe un vencimiento.
--
-- ORDEN DE ESTE ARCHIVO. Todo lo que toma un cerrojo sobre `tickets`, `raffles`,
-- `memberships` o `profiles` (alter table, create index, create trigger, llaves
-- foraneas) va AL FINAL, en la seccion 10 y en un solo bloque `do`: la CLI aplica
-- el archivo en una sola transaccion, sentencia a sentencia, y esos cerrojos duran
-- hasta confirmar (leccion de la 0080; D-259). Las funciones y sus privilegios
-- van antes porque crearlas o concederlas no bloquea ninguna tabla.
-- =============================================================================

-- =============================================================================
-- 1. Constantes, con su espejo en TypeScript (`src/features/inventory/rules.ts`)
--
-- Una prueba de base de datos compara las dos versiones. Son funciones y no
-- literales sueltos para que la regla tenga un solo sitio en SQL.
-- =============================================================================

create function ticket_hold_default_minutes()
returns integer language sql immutable set search_path = public, pg_temp
as $$ select 30 $$;

create function ticket_hold_default_max_active()
returns integer language sql immutable set search_path = public, pg_temp
as $$ select 10 $$;

create function ticket_hold_extension_minutes()
returns integer language sql immutable set search_path = public, pg_temp
as $$ select 30 $$;

-- Tope tecnico de UNA generacion (no de la rifa, ni comercial): BR-N16.
create function ticket_generation_max()
returns integer language sql immutable set search_path = public, pg_temp
as $$ select 100000 $$;

-- Tamano de bloque. Medido en local: 5.000 boletas con todos los disparadores e
-- indices de `tickets` tardan ~0,8 s; `authenticated` tiene statement_timeout =
-- 8 s. Queda margen para un servidor mas lento y para el vaciado de las listas
-- pendientes de los indices GIN (D-257).
create function ticket_generation_chunk_size()
returns integer language sql immutable set search_path = public, pg_temp
as $$ select 5000 $$;

comment on function ticket_generation_chunk_size() is
  'D-257: boletas por bloque del generador. Cada bloque es una transaccion; el tope de 8 s de authenticated manda.';

-- El codigo interno es `{short_code}-{lpad(n, 6)}`: lpad CORTA a seis cifras, asi
-- que pasado 999.999 repetiria codigos (I-161). El generador se niega antes.
create function ticket_internal_code_capacity()
returns bigint language sql immutable set search_path = public, pg_temp
as $$ select 999999::bigint $$;

-- Recuento con puntos de miles, para los mensajes: «100.000», no «100000».
create function format_count(p_value bigint)
returns text language sql immutable set search_path = public, pg_temp
as $$ select replace(to_char(p_value, 'FM999,999,999,990'), ',', '.') $$;

-- -----------------------------------------------------------------------------
-- Por que no vale un rango, con las MISMAS palabras que el formulario
-- (`rangeProblem` en `src/features/inventory/rules.ts`). NULL = vale.
--
-- El ancho es EXPLICITO: los dos extremos se escriben con la misma cantidad de
-- cifras, y esa cantidad es la de todos los numeros generados. «007» a «010» da
-- 007, 008, 009 y 010; nunca 7, 8, 9 y 10 (BR-N03, BR-N15).
-- -----------------------------------------------------------------------------
create function ticket_generation_range_problem(p_from text, p_to text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_from is null or p_to is null or p_from = '' or p_to = ''
      then 'Escribe el primer y el último número del rango.'
    when p_from !~ '^[0-9]{1,4}$' or p_to !~ '^[0-9]{1,4}$'
      then 'Cada número tiene de 1 a 4 cifras, sin letras ni símbolos.'
    when char_length(p_from) <> char_length(p_to)
      then 'Escribe los dos números con la misma cantidad de cifras. Por ejemplo: 00 y 99.'
    when p_from::integer > p_to::integer
      then 'El primer número no puede ser mayor que el último.'
  end
$$;

comment on function ticket_generation_range_problem(text, text) is
  'D-257, BR-N15: por que no vale un rango del generador, con las mismas frases que la pantalla. NULL = vale.';

-- =============================================================================
-- 2. La capacidad del Dueño para configurar los apartados (BR-I27)
--
-- `raffles.holds.manage`: la duracion y el cupo de los apartados de una rifa.
-- La politica predeterminada se la da SOLO al Dueño: el encargo pide no
-- ampliarla a otros roles por conveniencia. Los mismos dos espejos de siempre
-- (`src/lib/auth/capabilities.ts`), comparados por una prueba.
-- =============================================================================

create or replace function app_capability_catalog()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array['raffles.prizes.manage', 'sellers.earnings.manage', 'settlements.manage',
               'raffles.holds.manage']::text[]
$$;

create or replace function app_role_default_capabilities(p_role app_role)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_role
    when 'owner' then app_capability_catalog()
    -- El Administrador conserva exactamente las tres de antes (D-241).
    when 'admin' then array['raffles.prizes.manage', 'sellers.earnings.manage', 'settlements.manage']::text[]
    else array[]::text[]
  end
$$;

-- =============================================================================
-- 3. Tablas nuevas
--
-- Las tres con RLS forzada y SIN politicas: no se leen ni se escriben desde una
-- sesion, solo a traves de las funciones de abajo (mismo patron que la 0080).
-- Las llaves foraneas hacia tablas que ya existian se anaden en la seccion 10.
-- =============================================================================

-- 3.1 La configuracion de los apartados de una rifa ----------------------------
-- Sin fila = los valores predeterminados (30 minutos, 10 boletas).
create table raffle_hold_settings (
  raffle_id             uuid primary key,
  organization_id       uuid not null,
  duration_minutes      integer not null,
  max_active_per_seller integer not null,
  updated_by            uuid not null,
  updated_at            timestamptz not null default now(),
  constraint raffle_hold_settings_duration check (duration_minutes between 5 and 180),
  constraint raffle_hold_settings_max_active check (max_active_per_seller between 0 and 100)
);

comment on table raffle_hold_settings is
  'D-257, BR-I27: duracion inicial y cupo de apartados simultaneos por vendedor de una rifa. Sin fila, 30 minutos y 10 boletas. Solo por set_raffle_hold_settings.';

-- 3.2 Las generaciones por rangos ----------------------------------------------
create table ticket_generation_runs (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null,
  raffle_id                uuid not null,
  request_id               uuid not null,
  daily_from               text not null,
  daily_to                 text not null,
  weekly_from              text not null,
  weekly_to                text not null,
  total_count              integer not null,
  processed_count          integer not null default 0,
  created_count            integer not null default 0,
  existing_count           integer not null default 0,
  -- De las que ya existian, cuantas las habia creado OTRA generacion: es lo que
  -- distingue «ya estaba» de «la creo un intento anterior».
  existing_generated_count integer not null default 0,
  status                   text not null default 'in_progress',
  created_by               uuid not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  completed_at             timestamptz,
  constraint ticket_generation_runs_request_key unique (organization_id, request_id),
  constraint ticket_generation_runs_id_raffle_key unique (id, raffle_id),
  constraint ticket_generation_runs_daily_range check (
    ticket_generation_range_problem(daily_from, daily_to) is null
  ),
  constraint ticket_generation_runs_weekly_range check (
    ticket_generation_range_problem(weekly_from, weekly_to) is null
  ),
  constraint ticket_generation_runs_total check (
    total_count between 1 and 100000
    and total_count::bigint = (daily_to::bigint - daily_from::bigint + 1)
                              * (weekly_to::bigint - weekly_from::bigint + 1)
  ),
  constraint ticket_generation_runs_progress check (
    processed_count between 0 and total_count
    and created_count >= 0 and existing_count >= 0
    and existing_generated_count between 0 and existing_count
    and created_count + existing_count = processed_count
  ),
  constraint ticket_generation_runs_status check (status in ('in_progress', 'completed')),
  constraint ticket_generation_runs_completed check (
    (status = 'completed') = (processed_count = total_count)
    and (status = 'completed') = (completed_at is not null)
  )
);

create index ticket_generation_runs_raffle_idx
  on ticket_generation_runs (raffle_id, created_at desc);
create index ticket_generation_runs_org_idx
  on ticket_generation_runs (organization_id, created_at desc);

comment on table ticket_generation_runs is
  'D-257, BR-N15..BR-N18: una generacion por rangos. Su avance confirmado (processed_count) es lo que permite continuar tras una interrupcion sin duplicar nada.';

-- 3.3 Los apartados temporales -------------------------------------------------
create table ticket_holds (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  raffle_id       uuid not null,
  ticket_id       uuid not null,
  seller_id       uuid not null,
  request_id      uuid not null,
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  extended_at     timestamptz,
  ended_at        timestamptz,
  end_reason      text,
  -- Repetir la MISMA solicitud devuelve el mismo apartado (BR-I25).
  constraint ticket_holds_request_key unique (organization_id, seller_id, request_id),
  constraint ticket_holds_end check ((ended_at is null) = (end_reason is null)),
  constraint ticket_holds_end_reason check (
    end_reason is null or end_reason in ('returned', 'expired', 'sold', 'seller_inactive')
  ),
  constraint ticket_holds_expires check (expires_at > started_at),
  constraint ticket_holds_extended check (extended_at is null or extended_at >= started_at)
);

-- Un apartado abierto por boleta, como mucho. Un apartado vencido que nadie
-- cerro sigue abierto hasta que alguien toca la boleta: quien la toma, quien la
-- entrega o quien la anula lo cierra primero (perezoso, BR-I22).
create unique index ticket_holds_one_open_per_ticket
  on ticket_holds (ticket_id) where ended_at is null;
create index ticket_holds_seller_open_idx
  on ticket_holds (seller_id, raffle_id) where ended_at is null;
create index ticket_holds_raffle_open_idx
  on ticket_holds (raffle_id) where ended_at is null;

comment on table ticket_holds is
  'D-257, BR-I20..BR-I26: apartados temporales de boletas del inventario comun. Vigente = ended_at null y expires_at > now(). La boleta no se modifica mientras dura.';

alter table raffle_hold_settings enable row level security;
alter table raffle_hold_settings force row level security;
alter table ticket_generation_runs enable row level security;
alter table ticket_generation_runs force row level security;
alter table ticket_holds enable row level security;
alter table ticket_holds force row level security;

-- I-111: una tabla nueva nace legible por `authenticated`. Aqui nadie la lee
-- directamente; la service role solo puede mirar.
revoke all on raffle_hold_settings from public, anon, authenticated, service_role;
revoke all on ticket_generation_runs from public, anon, authenticated, service_role;
revoke all on ticket_holds from public, anon, authenticated, service_role;
grant select on raffle_hold_settings to service_role;
grant select on ticket_generation_runs to service_role;
grant select on ticket_holds to service_role;

-- =============================================================================
-- 4. Lecturas y reglas internas
-- =============================================================================

-- La politica de apartados de una rifa: su fila o los valores predeterminados.
create function raffle_hold_policy(p_raffle_id uuid)
returns table (duration_minutes integer, max_active_per_seller integer, is_default boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(s.duration_minutes, ticket_hold_default_minutes()),
         coalesce(s.max_active_per_seller, ticket_hold_default_max_active()),
         s.raffle_id is null
    from (select p_raffle_id as raffle_id) x
    left join raffle_hold_settings s on s.raffle_id = x.raffle_id
$$;

-- Si una boleta tiene un apartado VIGENTE. Es la unica definicion: la usan las
-- lecturas, los disparadores y las RPC.
create function ticket_hold_is_active(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from ticket_holds h
     where h.ticket_id = p_ticket_id
       and h.ended_at is null
       and h.expires_at > now()
  )
$$;

-- Cierra, con su hora de vencimiento, el apartado vencido que nadie cerro. No
-- toca uno vigente. Devuelve cuantos cerro (0 o 1).
create function ticket_hold_close_expired(p_ticket_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed integer;
begin
  update ticket_holds h
     set ended_at = h.expires_at,
         end_reason = 'expired'
   where h.ticket_id = p_ticket_id
     and h.ended_at is null
     and h.expires_at <= now();
  get diagnostics v_closed = row_count;
  return v_closed;
end;
$$;

-- Nombre en espanol del estado de una rifa, para los mensajes.
create function raffle_status_word(p_status raffle_status)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_status
    when 'draft' then 'en borrador'
    when 'active' then 'activa'
    when 'closed' then 'cerrada'
    when 'cancelled' then 'anulada'
  end
$$;

-- =============================================================================
-- 5. Disparadores (las funciones; los disparadores se crean en la seccion 10)
-- =============================================================================

-- 5.1 El vendedor de una boleta, NULL incluido ---------------------------------
-- Hasta aqui un NULL fallaba siempre. Ahora es el inventario comun: lo que puede
-- ser una boleta sin vendedor lo dice el CHECK `tickets_without_seller_is_inventory`
-- y quien puede ponerla ahi, `tickets_guard_inventory`.
create or replace function tickets_enforce_seller_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.seller_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.seller_id = old.seller_id then
    return new;
  end if;

  if not exists (
    select 1 from memberships m
    where m.profile_id = new.seller_id
      and m.organization_id = new.organization_id
      and m.role = 'seller'
      and m.is_active
  ) then
    raise exception 'El usuario asignado no es un vendedor activo de la organizacion'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- 5.2 Solo las funciones de la base mueven el inventario comun (BR-I19) ---------
-- SECURITY INVOKER a proposito: `current_user` es el rol de quien escribe. Una
-- peticion de la API corre como `authenticated`; dentro de una RPC SECURITY
-- DEFINER, como el dueño de la funcion. Asi una sesion no puede crear boletas
-- sin vendedor, devolver una al inventario comun ni marcar a mano la generacion
-- de una boleta, aunque la politica de INSERT del personal la deje escribir.
create function tickets_guard_inventory()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.seller_id is null and (tg_op = 'INSERT' or old.seller_id is not null) then
      raise exception 'Las boletas del inventario común se crean con el generador y se mueven con «Asignar a un vendedor» o «Recuperar».'
        using errcode = 'insufficient_privilege';
    end if;

    if new.generation_run_id is distinct from
       (case when tg_op = 'INSERT' then null else old.generation_run_id end) then
      raise exception 'La generación de una boleta la registra solo el generador.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

-- 5.3 Una boleta apartada no se toca (BR-I23) -----------------------------------
-- Mientras un apartado esta vigente, NADA modifica ni borra la boleta: ni
-- anularla, ni eliminarla, ni cambiar sus numeros, ni asignarla a un vendedor.
-- La unica salida es la del propio apartado —venderla, devolverla o que venza—,
-- y la venta cierra el apartado ANTES de tocar la boleta. Solo corre para
-- boletas sin vendedor, que son las unicas que se pueden apartar: una vendida o
-- entregada no paga esta comprobacion.
create function tickets_guard_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if ticket_hold_is_active(old.id) then
    raise exception 'Esta boleta está apartada por un vendedor. Espera a que la venda, la devuelva o venza el apartado.'
      using errcode = 'check_violation';
  end if;

  -- El que vencio y nadie cerro, se cierra ahora con su hora de vencimiento.
  perform ticket_hold_close_expired(old.id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- 5.4 Quien deja de vender, deja sus apartados (BR-I26) -------------------------
-- Desactivar a una persona o cambiarle el rol cierra en el acto sus apartados
-- vigentes: sus boletas vuelven al inventario comun y nadie tiene que esperar a
-- que venzan. Los vencidos se cierran como vencidos.
create function memberships_end_ticket_holds()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.is_active is distinct from old.is_active and not new.is_active)
     or (new.role is distinct from old.role and new.role <> 'seller') then
    update ticket_holds h
       set ended_at = least(now(), h.expires_at),
           end_reason = case when h.expires_at <= now() then 'expired' else 'seller_inactive' end
     where h.organization_id = new.organization_id
       and h.seller_id = new.profile_id
       and h.ended_at is null;
  end if;
  return null;
end;
$$;

create function profiles_end_ticket_holds()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_active is distinct from old.is_active and not new.is_active then
    update ticket_holds h
       set ended_at = least(now(), h.expires_at),
           end_reason = case when h.expires_at <= now() then 'expired' else 'seller_inactive' end
     where h.seller_id = new.id
       and h.ended_at is null;
  end if;
  return null;
end;
$$;

-- =============================================================================
-- 6. Las reglas de siempre, con el inventario comun en cuenta
-- =============================================================================

-- 6.1 assign_ticket_row: un NULL ya no pasa (cuerpo de 0057) --------------------
-- `v_ticket.seller_id <> v_uid` con un vendedor NULL vale NULL y NO lanzaba: una
-- boleta del inventario comun habria llegado hasta el UPDATE (lo habria parado
-- el CHECK, con un mensaje tecnico). Se dice antes y con el mensaje de siempre.
-- Una boleta apartada se vende con `sell_ticket_hold`, que le pone el vendedor y
-- luego llama aqui: las reglas de venta siguen siendo estas, y solo estas.
create or replace function assign_ticket_row(
  p_ticket_id  uuid,
  p_client_id  uuid,
  p_sale_date  date default null,
  p_sale_price bigint default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := require_auth();
  v_ticket   tickets%rowtype;
  v_client   clients%rowtype;
  v_raffle   raffles%rowtype;
  v_base     bigint;
  v_min      bigint;
  v_price    bigint;
begin
  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  -- BR-I07 y D-198: la boleta debe ser del vendedor autenticado. La
  -- autorizacion administrativa desaparece: el personal no vende a clientes.
  -- D-257: una del inventario comun no es de nadie.
  if v_ticket.seller_id is null or v_ticket.seller_id <> v_uid then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if v_ticket.inventory_status <> 'available' then
    raise exception 'Solo se pueden asignar boletas disponibles. Estado actual: %.',
      v_ticket.inventory_status;
  end if;

  select * into v_client from clients where id = p_client_id;
  if not found or v_client.organization_id <> v_ticket.organization_id then
    raise exception 'El cliente no existe o no pertenece a tu organizacion.';
  end if;

  if v_client.archived_at is not null then
    raise exception 'El cliente esta archivado. Restauralo antes de asignarle boletas.';
  end if;

  -- BR-C05: la cartera es del vendedor; la boleta y el cliente deben coincidir.
  if v_client.seller_id <> v_ticket.seller_id then
    raise exception 'El cliente pertenece a otro vendedor.';
  end if;

  select * into v_raffle from raffles where id = v_ticket.raffle_id;

  -- BR-R08: no se asignan boletas en rifas cerradas o anuladas.
  if v_raffle.status <> 'active' then
    raise exception 'La rifa no esta activa. No se pueden asignar boletas.';
  end if;

  -- BR-P09/BR-P11: el precio de venta. Sin precio explicito, el oficial.
  v_base  := v_raffle.ticket_price;
  v_price := coalesce(p_sale_price, v_base);

  select l.min_sale_price into v_min from ticket_sale_price_limits(p_ticket_id) l;

  if v_price <= 0 then
    raise exception 'El precio de venta debe ser mayor que cero.';
  end if;

  if v_price > v_base then
    raise exception 'El precio de venta no puede ser mayor que el precio de la rifa (%). Puedes vender más barato, no más caro.',
      format_cop(v_base);
  end if;

  if v_price < v_min then
    raise exception 'La rebaja es mayor de lo que puedes asumir. Para esta boleta puedes vender desde % hasta %.',
      format_cop(v_min), format_cop(v_base);
  end if;

  update tickets
     set client_id        = p_client_id,
         sale_price       = v_price,
         base_price       = v_base,
         sale_date        = coalesce(p_sale_date, today_bogota()),
         assigned_at      = now(),
         inventory_status = 'assigned'
   where id = p_ticket_id;

  perform write_audit_log(
    v_ticket.organization_id,
    'ticket.assign_client',
    'ticket',
    p_ticket_id,
    jsonb_build_object('client_id', v_ticket.client_id, 'inventory_status', v_ticket.inventory_status),
    jsonb_build_object('client_id', p_client_id, 'inventory_status', 'assigned',
                       'sale_price', v_price, 'base_price', v_base,
                       'discount', v_base - v_price)
  );
end;
$$;

-- 6.2 bulk_change_ticket_seller: solo entre vendedores (cuerpo de 0020) --------
-- Con un vendedor NULL, `seller_id <> p_seller_id` valia NULL: la boleta contaba
-- como elegible y NO se movia, y la funcion respondia que si. Una boleta del
-- inventario comun pasa a un vendedor con `admin_assign_inventory_tickets`, que
-- explica lo que hace; aqui ya no cuenta como elegible.
create or replace function bulk_change_ticket_seller(p_ticket_ids uuid[], p_seller_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids       uuid[] := lock_ticket_batch(p_ticket_ids);
  v_requested integer := array_length(v_ids, 1);
  v_eligible  integer;
  v_org       uuid;
begin
  select organization_id into v_org from tickets where id = v_ids[1];
  if v_org is null then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if not is_org_staff(v_org) then
    raise exception 'No tienes permiso para cambiar el vendedor de estas boletas.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from memberships m
    where m.profile_id = p_seller_id
      and m.organization_id = v_org
      and m.role = 'seller'
      and m.is_active
  ) then
    raise exception 'El vendedor indicado no es un vendedor activo de la organizacion.';
  end if;

  select count(*)::integer into v_eligible
  from tickets t
  where t.id = any (v_ids)
    and is_org_staff(t.organization_id)
    and t.seller_id is not null
    and t.inventory_status not in ('assigned', 'cancelled');

  if v_eligible <> v_requested then
    raise exception 'No se realizó ningún cambio: % de las % boletas seleccionadas ya no pueden cambiar de vendedor.',
      v_requested - v_eligible, v_requested;
  end if;

  update tickets
     set seller_id = p_seller_id
   where id = any (v_ids)
     and seller_id <> p_seller_id;

  perform write_audit_log(
    v_org, 'ticket.bulk_change_seller', 'ticket', null, null,
    jsonb_build_object('count', v_requested, 'seller_id', p_seller_id,
                       'ticket_ids', to_jsonb(v_ids))
  );

  return v_requested;
end;
$$;

-- =============================================================================
-- 7. El generador por rangos (personal; BR-N15..BR-N18)
-- =============================================================================

-- 7.1 La vista previa: cuantas combinaciones y cuantas ya existen --------------
-- No escribe nada. `existing_generated_count` es cuantas de las que ya existen
-- las creo una generacion, y `in_progress_run_id` la generacion IGUAL que quedo
-- sin terminar, para ofrecer continuarla en vez de empezar otra.
create function admin_ticket_generation_preview(
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
  v_problem text;
  v_total   bigint;
  v_dw      integer;
  v_ww      integer;
begin
  perform require_auth();

  select * into v_raffle from raffles r where r.id = p_raffle_id;
  if not found or not is_org_staff(v_raffle.organization_id) then
    raise exception 'La rifa no existe o no tienes acceso a ella.';
  end if;

  v_problem := coalesce(ticket_generation_range_problem(p_daily_from, p_daily_to),
                        ticket_generation_range_problem(p_weekly_from, p_weekly_to));
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;

  v_total := (p_daily_to::bigint - p_daily_from::bigint + 1)
             * (p_weekly_to::bigint - p_weekly_from::bigint + 1);
  v_dw := char_length(p_daily_from);
  v_ww := char_length(p_weekly_from);

  return query
  select
    v_total,
    count(t.id),
    count(t.id) filter (where t.generation_run_id is not null),
    (select g.id
       from ticket_generation_runs g
      where g.raffle_id = p_raffle_id
        and g.status = 'in_progress'
        and g.daily_from = p_daily_from and g.daily_to = p_daily_to
        and g.weekly_from = p_weekly_from and g.weekly_to = p_weekly_to
      order by g.created_at desc
      limit 1)
  from tickets t
  where t.organization_id = v_raffle.organization_id
    and t.raffle_id = p_raffle_id
    and char_length(t.daily_number) = v_dw
    and t.daily_number between p_daily_from and p_daily_to
    and char_length(t.weekly_number) = v_ww
    and t.weekly_number between p_weekly_from and p_weekly_to;
end;
$$;

-- 7.2 Empezar una generacion ---------------------------------------------------
-- IDEMPOTENTE: la misma solicitud devuelve la misma generacion, y una igual que
-- quedo sin terminar se CONTINUA en vez de duplicarse. No crea boletas: eso lo
-- hace cada bloque de `admin_process_ticket_generation`.
create function admin_start_ticket_generation(
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
  v_problem text;
  v_total   bigint;
begin
  if p_request_id is null then
    raise exception 'Falta el identificador de la solicitud. Vuelve a abrir el generador.';
  end if;

  select * into v_raffle from raffles r where r.id = p_raffle_id;
  if not found or not is_org_staff(v_raffle.organization_id) then
    raise exception 'La rifa no existe o no tienes acceso a ella.';
  end if;

  -- La misma solicitud, otra vez: lo que se creo la primera.
  select * into v_run
    from ticket_generation_runs g
   where g.organization_id = v_raffle.organization_id
     and g.request_id = p_request_id;

  if found then
    if v_run.raffle_id <> p_raffle_id
       or v_run.daily_from <> p_daily_from or v_run.daily_to <> p_daily_to
       or v_run.weekly_from <> p_weekly_from or v_run.weekly_to <> p_weekly_to then
      raise exception 'Esta solicitud ya se usó para otra generación. Vuelve a abrir el generador.';
    end if;
    v_outcome := 'existing_request';
  else
    -- BR-R08: rifas cerradas o anuladas no admiten boletas nuevas.
    if v_raffle.status not in ('draft', 'active') then
      raise exception 'La rifa está % y ya no admite boletas nuevas.', raffle_status_word(v_raffle.status);
    end if;

    v_problem := coalesce(ticket_generation_range_problem(p_daily_from, p_daily_to),
                          ticket_generation_range_problem(p_weekly_from, p_weekly_to));
    if v_problem is not null then
      raise exception '%', v_problem;
    end if;

    v_total := (p_daily_to::bigint - p_daily_from::bigint + 1)
               * (p_weekly_to::bigint - p_weekly_from::bigint + 1);

    -- BR-N16: tope TECNICO de una generacion, con la explicacion visible.
    if v_total > ticket_generation_max() then
      raise exception 'Esos rangos dan % combinaciones. El generador crea hasta % de una vez: acorta uno de los dos rangos.',
        format_count(v_total), format_count(ticket_generation_max());
    end if;

    -- I-161: el codigo interno tiene seis cifras.
    if v_raffle.ticket_counter + v_total > ticket_internal_code_capacity() then
      raise exception 'Esta rifa ya no tiene códigos internos para % boletas más. Genera menos combinaciones.',
        format_count(v_total);
    end if;

    -- La misma generacion sin terminar: se continua, no se empieza otra.
    select * into v_run
      from ticket_generation_runs g
     where g.raffle_id = p_raffle_id
       and g.status = 'in_progress'
       and g.daily_from = p_daily_from and g.daily_to = p_daily_to
       and g.weekly_from = p_weekly_from and g.weekly_to = p_weekly_to
     order by g.created_at desc
     limit 1;

    if found then
      v_outcome := 'resumed';
    else
      insert into ticket_generation_runs (
        organization_id, raffle_id, request_id, daily_from, daily_to,
        weekly_from, weekly_to, total_count, created_by
      ) values (
        v_raffle.organization_id, p_raffle_id, p_request_id, p_daily_from, p_daily_to,
        p_weekly_from, p_weekly_to, v_total::integer, v_uid
      )
      returning * into v_run;

      perform write_audit_log(
        v_raffle.organization_id, 'ticket.generation_start', 'ticket_generation', v_run.id, null,
        jsonb_build_object('raffle_id', p_raffle_id,
                           'daily_from', p_daily_from, 'daily_to', p_daily_to,
                           'weekly_from', p_weekly_from, 'weekly_to', p_weekly_to,
                           'total_count', v_total)
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

-- 7.3 Procesar el bloque siguiente ---------------------------------------------
-- UN bloque por llamada y por transaccion. `p_processed_count` es el avance que
-- la pantalla cree confirmado:
--   igual al guardado   se procesa el bloque siguiente;
--   menor               ese bloque ya se confirmo (un reintento): no hace nada;
--   mayor               imposible sin manipular la peticion: se rechaza.
-- Asi una interrupcion —una pestana cerrada, un corte de red, una respuesta que
-- no llego— nunca duplica boletas ni se salta combinaciones.
--
-- Las combinaciones salen en orden diario-semanal: el indice k vale
-- diario = desde + k / ancho_semanal y semanal = desde + k % ancho_semanal, con
-- el ancho explicito de cada rango y los ceros de delante (BR-N15).
create function admin_process_ticket_generation(p_run_id uuid, p_processed_count integer)
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
  v_uid        uuid := require_auth();
  v_run        ticket_generation_runs%rowtype;
  v_raffle     raffles%rowtype;
  v_outcome    text;
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

    v_dfrom := v_run.daily_from::integer;
    v_wfrom := v_run.weekly_from::integer;
    v_wspan := v_run.weekly_to::integer - v_wfrom + 1;
    v_dw    := char_length(v_run.daily_from);
    v_ww    := char_length(v_run.weekly_from);
    v_from  := v_run.processed_count;
    v_to    := least(v_run.total_count, v_from + ticket_generation_chunk_size());

    if v_raffle.ticket_counter + (v_to - v_from) > ticket_internal_code_capacity() then
      raise exception 'Esta rifa ya no tiene códigos internos para más boletas.';
    end if;

    -- Las que faltan reciben codigos consecutivos desde el contador, que no se
    -- mueve mientras la rifa esta bloqueada. Se reservan TODAS las que faltan,
    -- aunque alguna choque al insertar: un codigo de mas deja un hueco, uno de
    -- menos repetiria codigos.
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

    -- UNA fila de bitacora por bloque, no una por boleta (D-257): cada boleta
    -- lleva su `generation_run_id`, y esta fila dice que indices cubrio el
    -- bloque, cuantas creo y cuantas ya existian.
    perform write_audit_log(
      v_run.organization_id, 'ticket.generate', 'ticket_generation', v_run.id, null,
      jsonb_build_object('raffle_id', v_run.raffle_id, 'from_index', v_from, 'to_index', v_to,
                         'created', v_inserted, 'existing', v_to - v_from - v_inserted,
                         'existing_generated', v_generated)
    );

    -- La estadistica de `tickets`, al dia ANTES de confirmar (I-214, D-260).
    -- Sin esto, hasta el siguiente analisis automatico el planificador no sabe
    -- que la rifa tiene estas boletas ni que no tienen vendedor: cree que tiene
    -- una. Entonces la cuenta del equipo de `recalc_seller_commission` —una por
    -- boleta entregada a un vendedor con equipo— lee todas las de la rifa por
    -- un indice que solo fija la organizacion y la rifa: ~23 ms por boleta con
    -- 100.000, y un lote de 350 pasa de los 8 s y se deshace entero. En el
    -- PRIMER bloque, para que la rifa entre en la estadistica aunque la
    -- generacion se interrumpa; en el ULTIMO, con su tamano real. ANALYZE cuenta
    -- las filas que esta misma transaccion inserto y toma SHARE UPDATE
    -- EXCLUSIVE, que no bloquea lecturas ni escrituras. SKIP_LOCKED: si un
    -- vacuum u otro analisis tiene la tabla en ese momento, no espera; el bloque
    -- termina igual y la estadistica la pone el analisis automatico.
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

-- 7.4 Las generaciones de la organizacion --------------------------------------
create function admin_ticket_generation_runs(
  p_raffle_id uuid default null,
  p_run_id    uuid default null,
  p_limit     integer default 20
)
returns table (
  id                       uuid,
  raffle_id                uuid,
  raffle_name              text,
  raffle_short_code        text,
  daily_from               text,
  daily_to                 text,
  weekly_from              text,
  weekly_to                text,
  total_count              integer,
  processed_count          integer,
  created_count            integer,
  existing_count           integer,
  existing_generated_count integer,
  status                   text,
  created_by_name          text,
  created_at               timestamptz,
  completed_at             timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id, g.raffle_id, r.name, r.short_code,
         g.daily_from, g.daily_to, g.weekly_from, g.weekly_to,
         g.total_count, g.processed_count, g.created_count, g.existing_count,
         g.existing_generated_count, g.status, p.full_name, g.created_at, g.completed_at
    from ticket_generation_runs g
    join raffles r on r.id = g.raffle_id
    left join profiles p on p.id = g.created_by
   where g.organization_id in (select current_staff_org_ids())
     and (p_raffle_id is null or g.raffle_id = p_raffle_id)
     and (p_run_id is null or g.id = p_run_id)
   order by (g.status = 'in_progress') desc, g.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- 7.5 Las que ya existian, paginadas (BR-N17) -----------------------------------
-- Las combinaciones de los rangos de una generacion que NO creo ella, solo entre
-- las que ya proceso. Nunca un listado entero: paginas de hasta 100.
-- `other_generation` dice si esa boleta la creo otra generacion.
create function admin_ticket_generation_existing(
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
  v_run   ticket_generation_runs%rowtype;
  v_wspan integer;
begin
  perform require_auth();

  select * into v_run from ticket_generation_runs g where g.id = p_run_id;
  if not found or not is_org_staff(v_run.organization_id) then
    return;
  end if;

  v_wspan := v_run.weekly_to::integer - v_run.weekly_from::integer + 1;

  return query
  select t.id, t.daily_number, t.weekly_number, t.inventory_status,
         (t.generation_run_id is not null),
         count(*) over ()
    from tickets t
   where t.organization_id = v_run.organization_id
     and t.raffle_id = v_run.raffle_id
     and char_length(t.daily_number) = char_length(v_run.daily_from)
     and t.daily_number between v_run.daily_from and v_run.daily_to
     and char_length(t.weekly_number) = char_length(v_run.weekly_from)
     and t.weekly_number between v_run.weekly_from and v_run.weekly_to
     and t.generation_run_id is distinct from v_run.id
     -- Solo dentro de lo ya procesado: el indice de la combinacion.
     and (t.daily_number::integer - v_run.daily_from::integer) * v_wspan
         + (t.weekly_number::integer - v_run.weekly_from::integer) < v_run.processed_count
   order by t.daily_number, t.weekly_number
   limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- =============================================================================
-- 8. Lotes, apartados y lecturas del inventario
-- =============================================================================

-- 8.1 Asignar boletas del inventario comun a un vendedor (BR-I18) --------------
-- TODO O NADA (BR-B07), con las filas bloqueadas en orden de id. Las que ya son
-- de ese vendedor —un reintento de esta misma operacion— cuentan como hechas, no
-- como error: repetir la peticion no cambia nada. Sin vencimiento y sin tocar el
-- cupo de apartados. Una boleta apartada no se puede asignar (BR-I23).
create function admin_assign_inventory_tickets(p_ticket_ids uuid[], p_seller_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids       uuid[] := lock_ticket_batch(p_ticket_ids);
  v_requested integer := array_length(v_ids, 1);
  v_org       uuid;
  v_eligible  integer;
  v_already   integer;
  v_assigned  integer;
begin
  select t.organization_id into v_org from tickets t where t.id = v_ids[1];
  if v_org is null or not is_org_staff(v_org) then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if not exists (
    select 1 from memberships m
     where m.profile_id = p_seller_id
       and m.organization_id = v_org
       and m.role = 'seller'
       and m.is_active
  ) then
    raise exception 'El vendedor indicado no es un vendedor activo de la organización.';
  end if;

  select
    count(*) filter (where t.seller_id is null and h.id is null)::integer
    + count(*) filter (where t.seller_id = p_seller_id)::integer,
    count(*) filter (where t.seller_id = p_seller_id)::integer
    into v_eligible, v_already
  from tickets t
  join raffles r on r.id = t.raffle_id
  left join ticket_holds h
    on t.seller_id is null
   and h.ticket_id = t.id and h.ended_at is null and h.expires_at > now()
  where t.id = any (v_ids)
    and t.organization_id = v_org
    and t.inventory_status = 'available'
    and t.client_id is null
    and r.status in ('draft', 'active');

  if v_eligible <> v_requested then
    raise exception 'No se realizó ningún cambio: % de las % boletas seleccionadas ya no están libres en el inventario común.',
      v_requested - v_eligible, v_requested;
  end if;

  -- El disparador de la boleta (tickets_guard_hold) vuelve a comprobar el
  -- apartado y cierra los vencidos; el de auditoria deja el detalle de cada una.
  update tickets t
     set seller_id = p_seller_id
   where t.id = any (v_ids)
     and t.seller_id is null;
  get diagnostics v_assigned = row_count;

  perform write_audit_log(
    v_org, 'ticket.inventory_assign', 'ticket', null, null,
    jsonb_build_object('count', v_requested, 'assigned', v_assigned, 'already', v_already,
                       'seller_id', p_seller_id, 'ticket_ids', to_jsonb(v_ids))
  );

  return jsonb_build_object('requested', v_requested, 'assigned', v_assigned, 'already', v_already);
end;
$$;

-- 8.2 Recuperar boletas sin vender (BR-I19) -------------------------------------
-- Vuelven al inventario comun. Solo las DISPONIBLES y sin ningun abono en su
-- historia: nunca una vendida, con cliente o con dinero. Una venta en curso tiene
-- la fila bloqueada; esta funcion espera y, si la venta se confirma, lo ve y no
-- recupera nada. Las que ya estan en el inventario comun cuentan como hechas.
create function admin_recover_inventory_tickets(p_ticket_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids       uuid[] := lock_ticket_batch(p_ticket_ids);
  v_requested integer := array_length(v_ids, 1);
  v_org       uuid;
  v_eligible  integer;
  v_already   integer;
  v_recovered integer;
begin
  select t.organization_id into v_org from tickets t where t.id = v_ids[1];
  if v_org is null or not is_org_staff(v_org) then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  select
    count(*)::integer,
    count(*) filter (where t.seller_id is null)::integer
    into v_eligible, v_already
  from tickets t
  join raffles r on r.id = t.raffle_id
  where t.id = any (v_ids)
    and t.organization_id = v_org
    and t.inventory_status = 'available'
    and t.client_id is null
    and t.sale_price is null
    and r.status in ('draft', 'active')
    and not exists (select 1 from payment_allocations pa where pa.ticket_id = t.id);

  if v_eligible <> v_requested then
    raise exception 'No se realizó ningún cambio: % de las % boletas seleccionadas ya no se pueden recuperar. Solo vuelven al inventario común las disponibles, sin vender.',
      v_requested - v_eligible, v_requested;
  end if;

  update tickets t
     set seller_id = null
   where t.id = any (v_ids)
     and t.seller_id is not null;
  get diagnostics v_recovered = row_count;

  perform write_audit_log(
    v_org, 'ticket.inventory_recover', 'ticket', null, null,
    jsonb_build_object('count', v_requested, 'recovered', v_recovered, 'already', v_already,
                       'ticket_ids', to_jsonb(v_ids))
  );

  return jsonb_build_object('requested', v_requested, 'recovered', v_recovered, 'already', v_already);
end;
$$;

-- 8.3 La configuracion de apartados de una rifa --------------------------------
-- La lee cualquier persona activa de la organizacion: el vendedor necesita saber
-- cuanto dura su apartado y cual es su cupo. `can_manage` dice si quien pregunta
-- puede cambiarla.
create function raffle_hold_settings_for(p_raffle_id uuid)
returns table (
  raffle_id             uuid,
  duration_minutes      integer,
  max_active_per_seller integer,
  extension_minutes     integer,
  is_default            boolean,
  can_manage            boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, p.duration_minutes, p.max_active_per_seller,
         ticket_hold_extension_minutes(), p.is_default,
         has_org_capability(r.organization_id, 'raffles.holds.manage')
    from raffles r
    cross join lateral raffle_hold_policy(r.id) p
   where r.id = p_raffle_id
     and r.organization_id in (select current_org_ids())
$$;

-- BR-I27: solo con `raffles.holds.manage` (el Dueño). Un cambio vale para los
-- apartados NUEVOS; los vigentes conservan su vencimiento. Bajar el cupo por
-- debajo de lo que alguien ya tiene no le quita nada: solo le impide apartar mas
-- hasta quedar por debajo.
create function set_raffle_hold_settings(
  p_raffle_id             uuid,
  p_duration_minutes      integer,
  p_max_active_per_seller integer
)
returns table (
  raffle_id             uuid,
  duration_minutes      integer,
  max_active_per_seller integer,
  extension_minutes     integer,
  is_default            boolean,
  can_manage            boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_raffle raffles%rowtype;
  v_old    record;
begin
  select * into v_raffle from raffles r where r.id = p_raffle_id;
  if not found or v_raffle.organization_id not in (select current_org_ids()) then
    raise exception 'La rifa no existe o no tienes acceso a ella.';
  end if;

  if not has_org_capability(v_raffle.organization_id, 'raffles.holds.manage') then
    raise exception 'No tienes permiso para cambiar los apartados de esta rifa.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_duration_minutes is null or p_duration_minutes not between 5 and 180 then
    raise exception 'La duración del apartado debe estar entre 5 y 180 minutos.';
  end if;

  if p_max_active_per_seller is null or p_max_active_per_seller not between 0 and 100 then
    raise exception 'El cupo por vendedor debe estar entre 0 y 100 boletas.';
  end if;

  select * into v_old from raffle_hold_policy(p_raffle_id);

  insert into raffle_hold_settings as s (
    raffle_id, organization_id, duration_minutes, max_active_per_seller, updated_by, updated_at
  ) values (
    p_raffle_id, v_raffle.organization_id, p_duration_minutes, p_max_active_per_seller, v_uid, now()
  )
  on conflict on constraint raffle_hold_settings_pkey do update
     set duration_minutes      = excluded.duration_minutes,
         max_active_per_seller = excluded.max_active_per_seller,
         updated_by            = excluded.updated_by,
         updated_at            = excluded.updated_at;

  perform write_audit_log(
    v_raffle.organization_id, 'raffle.hold_settings', 'raffle', p_raffle_id,
    jsonb_build_object('duration_minutes', v_old.duration_minutes,
                       'max_active_per_seller', v_old.max_active_per_seller),
    jsonb_build_object('duration_minutes', p_duration_minutes,
                       'max_active_per_seller', p_max_active_per_seller)
  );

  return query select * from raffle_hold_settings_for(p_raffle_id);
end;
$$;

-- 8.4 Lo que ve el vendedor de cada rifa activa ---------------------------------
create function seller_inventory_summary()
returns table (
  raffle_id             uuid,
  raffle_name           text,
  raffle_short_code     text,
  ticket_price          bigint,
  free_count            bigint,
  my_active_holds       bigint,
  duration_minutes      integer,
  max_active_per_seller integer,
  extension_minutes     integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.name, r.short_code, r.ticket_price,
         (select count(*)
            from tickets t
           where t.raffle_id = r.id
             and t.organization_id = r.organization_id
             and t.seller_id is null
             and t.inventory_status = 'available'
             and not exists (
               select 1 from ticket_holds h
                where h.ticket_id = t.id and h.ended_at is null and h.expires_at > now()
             )),
         (select count(*)
            from ticket_holds h
           where h.raffle_id = r.id
             and h.seller_id = auth.uid()
             and h.ended_at is null
             and h.expires_at > now()),
         p.duration_minutes, p.max_active_per_seller, ticket_hold_extension_minutes()
    from raffles r
    cross join lateral raffle_hold_policy(r.id) p
   where r.status = 'active'
     and has_org_role(r.organization_id, array['seller']::app_role[])
   order by r.start_date desc, r.name
$$;

-- 8.5 El catalogo interno (BR-I20, BR-I21) -------------------------------------
-- Busca en TODA la rifa por numero diario, semanal o los dos, con coincidencia
-- parcial (BR-N11). Lo ajeno solo se ve como «no disponible»: sin vendedor, sin
-- cliente, sin estado de venta, sin identificador. La ocultacion es del tipo de
-- retorno, no de la pantalla.
--
--   free         del inventario comun, sin apartado vigente: se puede apartar
--   held_by_me   la aparte yo, y el apartado sigue vigente
--   mine         ya es mia: entregada, creada por mi o vendida por mi
--   unavailable  cualquier otra cosa
create function seller_inventory_tickets(
  p_raffle_id uuid,
  p_daily     text default null,
  p_weekly    text default null,
  p_only_free boolean default true,
  p_limit     integer default 25,
  p_offset    integer default 0
)
returns table (
  ticket_id       uuid,
  daily_number    text,
  weekly_number   text,
  availability    text,
  hold_id         uuid,
  hold_expires_at timestamptz,
  total_count     bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_raffle raffles%rowtype;
  v_daily  text := nullif(btrim(coalesce(p_daily, '')), '');
  v_weekly text := nullif(btrim(coalesce(p_weekly, '')), '');
begin
  select * into v_raffle from raffles r where r.id = p_raffle_id;
  if not found
     or v_raffle.status <> 'active'
     or not has_org_role(v_raffle.organization_id, array['seller']::app_role[]) then
    return;
  end if;

  -- Un termino que no es un numero de boleta no consulta nada.
  if (v_daily is not null and v_daily !~ '^[0-9]{1,4}$')
     or (v_weekly is not null and v_weekly !~ '^[0-9]{1,4}$') then
    return;
  end if;

  return query
  with matching as (
    select t.id, t.daily_number, t.weekly_number, t.seller_id, t.inventory_status, h.id as hold_id,
           h.seller_id as hold_seller, h.expires_at as hold_expires_at
      from tickets t
      left join ticket_holds h
        on h.ticket_id = t.id and h.ended_at is null and h.expires_at > now()
     where t.raffle_id = p_raffle_id
       and t.organization_id = v_raffle.organization_id
       and t.daily_number is not null
       and t.weekly_number is not null
       and (v_daily is null or t.daily_number like '%' || v_daily || '%')
       and (v_weekly is null or t.weekly_number like '%' || v_weekly || '%')
       and (not coalesce(p_only_free, true)
            or (t.seller_id is null and t.inventory_status = 'available' and h.id is null))
  )
  select
    case
      when m.seller_id is null and m.inventory_status = 'available' and m.hold_id is null then m.id
      when m.hold_seller = v_uid then m.id
      when m.seller_id = v_uid then m.id
    end,
    m.daily_number,
    m.weekly_number,
    case
      when m.seller_id is null and m.inventory_status = 'available' and m.hold_id is null then 'free'
      when m.hold_seller = v_uid then 'held_by_me'
      when m.seller_id = v_uid then 'mine'
      else 'unavailable'
    end,
    case when m.hold_seller = v_uid then m.hold_id end,
    case when m.hold_seller = v_uid then m.hold_expires_at end,
    count(*) over ()
  from matching m
  order by m.daily_number, m.weekly_number, m.id
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- 8.6 Mis apartados vigentes ----------------------------------------------------
-- Con lo necesario para vender sin otra consulta: el precio de la rifa y la
-- rebaja maxima de QUIEN pregunta, que es quien va a venderla (BR-P11). Y la hora
-- de la base, para que la cuenta atras no dependa del reloj del telefono.
create function seller_ticket_holds(p_raffle_id uuid default null)
returns table (
  hold_id        uuid,
  ticket_id      uuid,
  raffle_id      uuid,
  daily_number   text,
  weekly_number  text,
  started_at     timestamptz,
  expires_at     timestamptz,
  extended       boolean,
  base_price     bigint,
  min_sale_price bigint,
  server_now     timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select h.id, h.ticket_id, h.raffle_id, t.daily_number, t.weekly_number,
         h.started_at, h.expires_at, h.extended_at is not null,
         r.ticket_price,
         greatest(r.ticket_price - commission_floor_rate(h.organization_id, h.raffle_id, h.seller_id), 1)::bigint,
         now()
    from ticket_holds h
    join tickets t on t.id = h.ticket_id
    join raffles r on r.id = h.raffle_id
   where h.seller_id = auth.uid()
     and h.ended_at is null
     and h.expires_at > now()
     and (p_raffle_id is null or h.raffle_id = p_raffle_id)
     and has_org_role(h.organization_id, array['seller']::app_role[])
   order by h.expires_at, h.id
$$;

-- 8.7 Apartar una boleta (BR-I20, BR-I22, BR-I24, BR-I25) ------------------------
-- Sin aprobacion del personal. Quien decide que se puede es esta funcion, con la
-- fila bloqueada:
--   * dos vendedores sobre la misma boleta: el segundo espera el cerrojo de la
--     fila y, al obtenerlo, ve el apartado del primero;
--   * varias solicitudes del MISMO vendedor en paralelo: un cerrojo de aviso por
--     (rifa, vendedor) las pone en fila, y el cupo se cuenta con todas dentro;
--   * la misma solicitud repetida devuelve el mismo apartado, con su mismo
--     vencimiento: recargar o abrir otra pestana no reinicia el plazo.
-- El plazo empieza cuando la base confirma: `now()` de esta transaccion.
create function take_ticket_hold(p_ticket_id uuid, p_request_id uuid)
returns table (
  outcome       text,
  hold_id       uuid,
  ticket_id     uuid,
  daily_number  text,
  weekly_number text,
  started_at    timestamptz,
  expires_at    timestamptz,
  extended      boolean,
  -- Si el apartado devuelto sigue vigente. Con `already_requested` puede no
  -- estarlo: es la respuesta de una solicitud anterior que ya termino.
  is_active     boolean,
  active_count  bigint,
  max_active    integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_ticket  tickets%rowtype;
  v_raffle  raffles%rowtype;
  v_hold    ticket_holds%rowtype;
  v_policy  record;
  v_active  bigint;
  v_outcome text;
begin
  if p_request_id is null then
    raise exception 'Falta el identificador de la solicitud. Vuelve a cargar la página.';
  end if;

  select * into v_ticket from tickets t where t.id = p_ticket_id;
  if not found
     or not has_org_role(v_ticket.organization_id, array['seller']::app_role[]) then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  select * into v_raffle from raffles r where r.id = v_ticket.raffle_id;
  select * into v_policy from raffle_hold_policy(v_ticket.raffle_id);

  -- Las solicitudes de este vendedor en esta rifa, una detras de otra.
  perform pg_advisory_xact_lock(
    hashtextextended('ticket_hold:' || v_ticket.raffle_id::text || ':' || v_uid::text, 0)
  );

  -- La misma solicitud, otra vez: lo mismo que la primera, sin tocar nada.
  select * into v_hold
    from ticket_holds h
   where h.organization_id = v_ticket.organization_id
     and h.seller_id = v_uid
     and h.request_id = p_request_id;

  if found then
    if v_hold.ticket_id <> p_ticket_id then
      raise exception 'Esta solicitud ya se usó para otra boleta. Vuelve a cargar la página.';
    end if;
    v_outcome := 'already_requested';
  else
    if v_raffle.status <> 'active' then
      raise exception 'La rifa no está activa: no se pueden apartar boletas.';
    end if;

    -- La boleta, bloqueada: ordena esta toma frente a otras tomas, ventas,
    -- entregas, anulaciones y borrados de la misma boleta.
    select * into v_ticket from tickets t where t.id = p_ticket_id for update;

    -- Ya la tengo apartada (otra pestana, otra solicitud): la misma, sin
    -- reiniciar el plazo.
    select * into v_hold
      from ticket_holds h
     where h.ticket_id = p_ticket_id
       and h.ended_at is null
       and h.expires_at > now()
       and h.seller_id = v_uid;

    if found then
      v_outcome := 'already_mine';
    else
      perform ticket_hold_close_expired(p_ticket_id);

      if v_ticket.seller_id is not null
         or v_ticket.client_id is not null
         or v_ticket.inventory_status <> 'available'
         or ticket_hold_is_active(p_ticket_id) then
        raise exception 'Esta boleta ya no está disponible. Busca otra libre.';
      end if;

      select count(*) into v_active
        from ticket_holds h
       where h.raffle_id = v_ticket.raffle_id
         and h.seller_id = v_uid
         and h.ended_at is null
         and h.expires_at > now();

      if v_active >= v_policy.max_active_per_seller then
        if v_policy.max_active_per_seller = 0 then
          raise exception 'En esta rifa no se pueden apartar boletas por ahora.';
        end if;
        raise exception 'Ya tienes % en esta rifa, que es el máximo. Vende o devuelve alguna para apartar otra.',
          case when v_active = 1 then '1 boleta apartada'
               else format_count(v_active) || ' boletas apartadas' end;
      end if;

      insert into ticket_holds (
        organization_id, raffle_id, ticket_id, seller_id, request_id, started_at, expires_at
      ) values (
        v_ticket.organization_id, v_ticket.raffle_id, p_ticket_id, v_uid, p_request_id, now(),
        now() + make_interval(mins => v_policy.duration_minutes)
      )
      returning * into v_hold;

      perform write_audit_log(
        v_ticket.organization_id, 'ticket.hold_take', 'ticket', p_ticket_id, null,
        jsonb_build_object('hold_id', v_hold.id, 'seller_id', v_uid,
                           'expires_at', v_hold.expires_at, 'request_id', p_request_id)
      );
      v_outcome := 'taken';
    end if;
  end if;

  select count(*) into v_active
    from ticket_holds h
   where h.raffle_id = v_ticket.raffle_id
     and h.seller_id = v_uid
     and h.ended_at is null
     and h.expires_at > now();

  return query
  select v_outcome, v_hold.id, v_hold.ticket_id, v_ticket.daily_number, v_ticket.weekly_number,
         v_hold.started_at, v_hold.expires_at, v_hold.extended_at is not null,
         (v_hold.ended_at is null and v_hold.expires_at > now()),
         v_active, v_policy.max_active_per_seller;
end;
$$;

-- 8.8 Pedir los 30 minutos de mas (BR-I24) --------------------------------------
-- Una sola vez por apartado, antes de que venza, y se suma al vencimiento
-- vigente. Repetirla no suma otra vez: responde `already_extended` con el mismo
-- vencimiento. Un apartado que ya termino no se extiende, aunque la boleta
-- tenga otro apartado posterior: ese es otro apartado.
create function extend_ticket_hold(p_hold_id uuid)
returns table (outcome text, hold_id uuid, expires_at timestamptz, extended boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_hold    ticket_holds%rowtype;
  v_outcome text;
begin
  select * into v_hold from ticket_holds h where h.id = p_hold_id;
  if not found or v_hold.seller_id <> v_uid
     or not has_org_role(v_hold.organization_id, array['seller']::app_role[]) then
    raise exception 'El apartado no existe o no es tuyo.';
  end if;

  -- La boleta primero, como toda operacion sobre ella; luego el apartado.
  perform 1 from tickets t where t.id = v_hold.ticket_id for update;
  select * into v_hold from ticket_holds h where h.id = p_hold_id for update;

  if v_hold.ended_at is not null or v_hold.expires_at <= now() then
    raise exception 'Este apartado ya terminó. Si la boleta sigue libre, vuelve a apartarla.';
  end if;

  if not exists (select 1 from raffles r where r.id = v_hold.raffle_id and r.status = 'active') then
    raise exception 'La rifa no está activa: el apartado no se puede extender.';
  end if;

  if v_hold.extended_at is not null then
    v_outcome := 'already_extended';
  else
    update ticket_holds h
       set expires_at = h.expires_at + make_interval(mins => ticket_hold_extension_minutes()),
           extended_at = now()
     where h.id = p_hold_id
    returning * into v_hold;

    perform write_audit_log(
      v_hold.organization_id, 'ticket.hold_extend', 'ticket', v_hold.ticket_id, null,
      jsonb_build_object('hold_id', v_hold.id, 'expires_at', v_hold.expires_at)
    );
    v_outcome := 'extended';
  end if;

  return query select v_outcome, v_hold.id, v_hold.expires_at, v_hold.extended_at is not null;
end;
$$;

-- 8.9 Devolver un apartado antes de que venza (BR-I24) ---------------------------
-- La boleta vuelve al inventario comun en el acto, y el mismo vendedor puede
-- volver a apartarla enseguida: no hay tiempo de espera (decision del encargo).
-- Un apartado que ya termino responde `already_ended`: una devolucion antigua no
-- libera nunca una boleta que ahora tiene OTRO apartado.
create function return_ticket_hold(p_hold_id uuid)
returns table (outcome text, hold_id uuid, ticket_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_hold    ticket_holds%rowtype;
  v_outcome text;
begin
  select * into v_hold from ticket_holds h where h.id = p_hold_id;
  if not found or v_hold.seller_id <> v_uid then
    raise exception 'El apartado no existe o no es tuyo.';
  end if;

  perform 1 from tickets t where t.id = v_hold.ticket_id for update;
  select * into v_hold from ticket_holds h where h.id = p_hold_id for update;

  if v_hold.ended_at is not null then
    v_outcome := 'already_ended';
  elsif v_hold.expires_at <= now() then
    perform ticket_hold_close_expired(v_hold.ticket_id);
    v_outcome := 'already_ended';
  else
    update ticket_holds h
       set ended_at = now(), end_reason = 'returned'
     where h.id = p_hold_id;

    perform write_audit_log(
      v_hold.organization_id, 'ticket.hold_return', 'ticket', v_hold.ticket_id, null,
      jsonb_build_object('hold_id', v_hold.id)
    );
    v_outcome := 'returned';
  end if;

  return query select v_outcome, v_hold.id, v_hold.ticket_id;
end;
$$;

-- 8.10 Vender una boleta apartada (BR-I25) ---------------------------------------
-- Con el MISMO apartado con el que se abrio la venta: si vencio, o si la boleta
-- se devolvio y se volvio a apartar, una pantalla antigua no vende con el. Cierra
-- el apartado, le pone el vendedor a la boleta y llama a `assign_ticket_row`,
-- que aplica las reglas de venta de siempre —cliente de su cartera, rifa activa,
-- precio y rebaja—. Todo en una transaccion: si la venta no cabe, el apartado
-- sigue vigente como estaba. Repetirla tras una venta confirmada con el mismo
-- cliente devuelve la boleta, sin vender dos veces.
create function sell_ticket_hold(
  p_hold_id    uuid,
  p_client_id  uuid,
  p_sale_date  date default null,
  p_sale_price bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_hold   ticket_holds%rowtype;
  v_ticket tickets%rowtype;
begin
  select * into v_hold from ticket_holds h where h.id = p_hold_id;
  if not found or v_hold.seller_id <> v_uid
     or not has_org_role(v_hold.organization_id, array['seller']::app_role[]) then
    raise exception 'El apartado no existe o no es tuyo.';
  end if;

  select * into v_ticket from tickets t where t.id = v_hold.ticket_id for update;
  select * into v_hold from ticket_holds h where h.id = p_hold_id for update;

  if v_hold.ended_at is not null then
    if v_hold.end_reason = 'sold'
       and v_ticket.seller_id = v_uid
       and v_ticket.client_id = p_client_id
       and v_ticket.inventory_status = 'assigned' then
      return v_ticket.id;
    end if;
    raise exception 'Este apartado ya terminó. Si la boleta sigue libre, vuelve a apartarla para venderla.';
  end if;

  if v_hold.expires_at <= now() then
    raise exception 'El apartado de esta boleta venció. Si sigue libre, vuelve a apartarla para venderla.';
  end if;

  -- Mientras el apartado estuvo vigente nadie pudo tocar la boleta
  -- (tickets_guard_hold): sigue en el inventario comun y disponible.
  update ticket_holds h
     set ended_at = now(), end_reason = 'sold'
   where h.id = p_hold_id;

  update tickets t
     set seller_id = v_uid
   where t.id = v_hold.ticket_id;

  perform assign_ticket_row(v_hold.ticket_id, p_client_id, p_sale_date, p_sale_price);

  perform write_audit_log(
    v_hold.organization_id, 'ticket.hold_sell', 'ticket', v_hold.ticket_id, null,
    jsonb_build_object('hold_id', v_hold.id, 'client_id', p_client_id)
  );

  return v_hold.ticket_id;
end;
$$;

-- =============================================================================
-- 8.bis Las proyecciones del personal, con el inventario comun (D-198)
--
-- Cambian de tipo de retorno, asi que se borran y se crean. Ninguna columna
-- nueva es de la cartera: quien tiene apartada una boleta y hasta cuando es
-- inventario, y el dueño puede verlo (encargo, seccion 5).
-- =============================================================================

drop function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer, text, text);

create function admin_list_tickets(
  p_search           text default null,
  p_raffle_id        uuid default null,
  p_seller_id        uuid default null,
  p_inventory_status ticket_inventory_status default null,
  p_payment_state    text default null,
  p_ticket_ids       uuid[] default null,
  p_limit            integer default 25,
  p_offset           integer default 0,
  p_sort_column      text default null,
  p_sort_direction   text default null,
  p_custody          text default null
)
returns table (
  id                uuid,
  daily_number      text,
  weekly_number     text,
  inventory_status  ticket_inventory_status,
  payment_state     text,
  clearance_state   text,
  raffle_id         uuid,
  raffle_name       text,
  raffle_short_code text,
  seller_id         uuid,
  held_by           uuid,
  hold_expires_at   timestamptz,
  total_count       bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 0), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total  bigint;
  v_sort   text := nullif(coalesce(p_sort_column, ''), '');
  v_asc    boolean := coalesce(p_sort_direction, 'asc') <> 'desc';
begin
  if v_sort is not null
     and v_sort not in ('dailyNumber', 'raffleShortCode',
                        'inventoryStatus', 'paymentState', 'clearance',
                        'sellerName') then
    raise exception 'No se puede ordenar por esa columna.';
  end if;
  if p_payment_state is not null and p_payment_state not in ('paid', 'unpaid') then
    raise exception 'El estado de pago no es válido.';
  end if;
  -- D-257: quien tiene la boleta. `common` = sin vendedor y sin apartado
  -- vigente; `held` = apartada ahora; `seller` = con un vendedor.
  if p_custody is not null and p_custody not in ('common', 'held', 'seller') then
    raise exception 'El filtro de inventario no es válido.';
  end if;

  if coalesce(array_length(p_ticket_ids, 1), 0) > 1000 then
    raise exception 'No se pueden consultar más de 1.000 boletas a la vez.';
  end if;

  if v_search <> '' and v_search !~ '^[0-9]{1,4}$' then
    return;
  end if;

  select count(*) into v_total
    from tickets t
   where t.organization_id in (select current_staff_org_ids())
     and (v_search = ''
          or t.daily_number like '%' || v_search || '%'
          or t.weekly_number like '%' || v_search || '%')
     and (p_ticket_ids is null or t.id = any (p_ticket_ids))
     and (p_raffle_id is null or t.raffle_id = p_raffle_id)
     and (p_seller_id is null or t.seller_id = p_seller_id)
     and (p_inventory_status is null or t.inventory_status = p_inventory_status)
     and (p_payment_state is null
          or (t.inventory_status = 'assigned'
              and (case when t.payment_status = 'paid' then 'paid' else 'unpaid' end)
                  = p_payment_state))
     -- En linea y no con `ticket_hold_is_active`: una funcion SECURITY DEFINER
     -- no se integra en la consulta, y con 100.000 boletas serian 100.000
     -- llamadas (I-019, D-063).
     and (p_custody is null
          or (p_custody = 'seller' and t.seller_id is not null)
          or (p_custody = 'common' and t.seller_id is null
              and not exists (select 1 from ticket_holds h
                               where h.ticket_id = t.id and h.ended_at is null
                                 and h.expires_at > now()))
          or (p_custody = 'held' and t.seller_id is null
              and exists (select 1 from ticket_holds h
                           where h.ticket_id = t.id and h.ended_at is null
                             and h.expires_at > now())));

  if v_total = 0 then
    return;
  end if;

  return query
  select
    t.id,
    t.daily_number,
    t.weekly_number,
    t.inventory_status,
    case
      when t.inventory_status <> 'assigned' then null
      when t.payment_status = 'paid' then 'paid'
      else 'unpaid'
    end,
    case
      when t.inventory_status <> 'assigned' then null
      when t.clearance_receipt_delivered_at is null then 'pending'
      when t.clearance_receipt_assumed_delivered then 'assumed'
      else 'delivered'
    end,
    t.raffle_id,
    r.name,
    r.short_code,
    t.seller_id,
    h.seller_id,
    h.expires_at,
    v_total
  from tickets t
  left join raffles r on r.id = t.raffle_id
  left join profiles sp on sp.id = t.seller_id
  left join ticket_holds h
    on t.seller_id is null
   and h.ticket_id = t.id and h.ended_at is null and h.expires_at > now()
  where t.organization_id in (select current_staff_org_ids())
    and (v_search = ''
         or t.daily_number like '%' || v_search || '%'
         or t.weekly_number like '%' || v_search || '%')
    and (p_ticket_ids is null or t.id = any (p_ticket_ids))
    and (p_raffle_id is null or t.raffle_id = p_raffle_id)
    and (p_seller_id is null or t.seller_id = p_seller_id)
    and (p_inventory_status is null or t.inventory_status = p_inventory_status)
    and (p_payment_state is null
         or (t.inventory_status = 'assigned'
             and (case when t.payment_status = 'paid' then 'paid' else 'unpaid' end)
                 = p_payment_state))
    and (p_custody is null
         or (p_custody = 'seller' and t.seller_id is not null)
         or (p_custody = 'common' and t.seller_id is null and h.id is null)
         or (p_custody = 'held' and t.seller_id is null and h.id is not null))
  order by
    case when v_sort is not null and v_asc then
      case v_sort
        when 'dailyNumber'     then t.daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then t.inventory_status::text
        when 'paymentState'    then case
          when t.inventory_status <> 'assigned' then null
          when t.payment_status = 'paid' then 'paid'
          else 'unpaid' end
        when 'clearance'       then case
          when t.inventory_status <> 'assigned' then null
          when t.clearance_receipt_delivered_at is null then 'pending'
          when t.clearance_receipt_assumed_delivered then 'assumed'
          else 'delivered' end
        when 'sellerName'      then sp.full_name
      end
    end asc nulls last,
    case when v_sort is not null and not v_asc then
      case v_sort
        when 'dailyNumber'     then t.daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then t.inventory_status::text
        when 'paymentState'    then case
          when t.inventory_status <> 'assigned' then null
          when t.payment_status = 'paid' then 'paid'
          else 'unpaid' end
        when 'clearance'       then case
          when t.inventory_status <> 'assigned' then null
          when t.clearance_receipt_delivered_at is null then 'pending'
          when t.clearance_receipt_assumed_delivered then 'assumed'
          else 'delivered' end
        when 'sellerName'      then sp.full_name
      end
    end desc nulls last,
    case
      when v_search = '' then 0
      when t.daily_number = v_search then 0
      when t.daily_number like v_search || '%' then 1
      when t.daily_number like '%' || v_search || '%' then 2
      when t.weekly_number = v_search then 3
      when t.weekly_number like v_search || '%' then 4
      else 5
    end,
    case when v_search = '' then t.created_at end desc nulls last,
    case when v_search <> '' then t.daily_number end,
    case when v_search <> '' then t.weekly_number end,
    t.id
  limit v_limit
  offset v_offset;
end;
$$;

comment on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer, text, text, text) is
  'D-198, D-257: lista administrativa de boletas. Lista blanca sin cartera; con quien tiene apartada cada boleta del inventario comun y hasta cuando.';

drop function admin_ticket_detail(uuid);

create function admin_ticket_detail(p_ticket_id uuid)
returns table (
  id                     uuid,
  internal_code          text,
  daily_number           text,
  weekly_number          text,
  inventory_status       ticket_inventory_status,
  payment_state          text,
  sale_date              date,
  created_at             timestamptz,
  approved_at            timestamptz,
  cancelled_at           timestamptz,
  cancel_reason          text,
  raffle_id              uuid,
  raffle_name            text,
  raffle_short_code      text,
  raffle_status          raffle_status,
  seller_id              uuid,
  clearance_state        text,
  clearance_delivered_at timestamptz,
  held_by                uuid,
  hold_expires_at        timestamptz,
  hold_extended          boolean,
  generation_run_id      uuid
)
-- PL/pgSQL y no SQL: el cuerpo nombra `tickets.generation_run_id`, que se anade
-- en la seccion 10, y una funcion SQL se valida al crearla.
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    t.id,
    t.internal_code,
    t.daily_number,
    t.weekly_number,
    t.inventory_status,
    case
      when t.inventory_status <> 'assigned' then null
      when t.payment_status = 'paid' then 'paid'
      else 'unpaid'
    end,
    case when t.inventory_status = 'assigned' then t.sale_date end,
    t.created_at,
    t.approved_at,
    t.cancelled_at,
    t.cancel_reason,
    t.raffle_id,
    r.name,
    r.short_code,
    r.status,
    t.seller_id,
    case
      when t.inventory_status <> 'assigned' then null
      when t.clearance_receipt_delivered_at is null then 'pending'
      when t.clearance_receipt_assumed_delivered then 'assumed'
      else 'delivered'
    end,
    case
      when t.inventory_status = 'assigned' and not t.clearance_receipt_assumed_delivered
        then t.clearance_receipt_delivered_at
    end,
    h.seller_id,
    h.expires_at,
    h.extended_at is not null and h.id is not null,
    t.generation_run_id
  from tickets t
  join raffles r on r.id = t.raffle_id
  left join ticket_holds h
    on t.seller_id is null
   and h.ticket_id = t.id and h.ended_at is null and h.expires_at > now()
  where t.id = p_ticket_id
    and t.organization_id in (select current_staff_org_ids());
end;
$$;

comment on function admin_ticket_detail(uuid) is
  'D-198, D-257: detalle administrativo de una boleta, con quien la tiene apartada. Un id ajeno o inexistente devuelve cero filas.';

drop function admin_ticket_bulk_eligibility(uuid[]);

create function admin_ticket_bulk_eligibility(p_ticket_ids uuid[])
returns table (
  ticket_id            uuid,
  daily_number         text,
  weekly_number        text,
  inventory_status     ticket_inventory_status,
  seller_id            uuid,
  raffle_id            uuid,
  raffle_active        boolean,
  held_by              uuid,
  can_approve          boolean,
  can_cancel           boolean,
  can_change_seller    boolean,
  can_delete           boolean,
  can_assign_to_seller boolean,
  can_recover          boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_ticket_ids is null or array_length(p_ticket_ids, 1) is null then
    return;
  end if;

  if array_length(p_ticket_ids, 1) > 1000 then
    raise exception 'No se pueden consultar más de 1.000 boletas a la vez.';
  end if;

  return query
  select
    t.id,
    t.daily_number,
    t.weekly_number,
    t.inventory_status,
    t.seller_id,
    t.raffle_id,
    coalesce(r.status = 'active', false),
    h.seller_id,
    (t.inventory_status = 'pending_approval'),
    -- Una apartada no se toca (BR-I23).
    (t.inventory_status in ('draft', 'pending_approval', 'available') and h.id is null),
    -- Solo entre vendedores: la del inventario comun se ASIGNA (D-257).
    (t.inventory_status in ('draft', 'pending_approval', 'available') and t.seller_id is not null),
    (t.inventory_status in ('draft', 'pending_approval', 'available')
     and t.client_id is null
     and t.sale_price is null
     and h.id is null
     and not exists (select 1 from payment_allocations pa where pa.ticket_id = t.id)),
    (t.seller_id is null
     and t.inventory_status = 'available'
     and h.id is null
     and coalesce(r.status in ('draft', 'active'), false)),
    (t.seller_id is not null
     and t.inventory_status = 'available'
     and t.client_id is null
     and t.sale_price is null
     and coalesce(r.status in ('draft', 'active'), false)
     and not exists (select 1 from payment_allocations pa where pa.ticket_id = t.id))
  from tickets t
  left join raffles r on r.id = t.raffle_id
  left join ticket_holds h
    on t.seller_id is null
   and h.ticket_id = t.id and h.ended_at is null and h.expires_at > now()
  where t.id = any (p_ticket_ids)
    and t.organization_id in (select current_staff_org_ids());
end;
$$;

comment on function admin_ticket_bulk_eligibility(uuid[]) is
  'D-198, D-257: que acciones de lote admite cada boleta para el personal, incluidas asignar del inventario comun y recuperar. Sin cliente, precio ni abonos.';

drop function admin_ticket_inventory(uuid);

create function admin_ticket_inventory(p_raffle_id uuid default null)
returns table (
  raffle_id                uuid,
  seller_id                uuid,
  tickets_total            bigint,
  tickets_available        bigint,
  tickets_assigned         bigint,
  tickets_pending_approval bigint,
  tickets_draft            bigint,
  tickets_cancelled        bigint,
  tickets_paid             bigint,
  tickets_not_paid         bigint,
  tickets_held             bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.raffle_id,
    t.seller_id,
    count(*),
    count(*) filter (where t.inventory_status = 'available'),
    count(*) filter (where t.inventory_status = 'assigned'),
    count(*) filter (where t.inventory_status = 'pending_approval'),
    count(*) filter (where t.inventory_status = 'draft'),
    count(*) filter (where t.inventory_status = 'cancelled'),
    count(*) filter (where t.inventory_status = 'assigned' and t.payment_status = 'paid'),
    count(*) filter (where t.inventory_status = 'assigned' and t.payment_status <> 'paid'),
    -- Solo en la fila del inventario comun (`seller_id` NULL): apartadas ahora.
    count(*) filter (where t.seller_id is null and t.inventory_status = 'available'
                       and h.id is not null)
  from tickets t
  -- Un apartado abierto por boleta como mucho (indice unico): no duplica filas.
  left join ticket_holds h
    on t.seller_id is null
   and h.ticket_id = t.id and h.ended_at is null and h.expires_at > now()
  where t.organization_id in (select current_staff_org_ids())
    and (p_raffle_id is null or t.raffle_id = p_raffle_id)
  group by t.raffle_id, t.seller_id
$$;

comment on function admin_ticket_inventory(uuid) is
  'D-198, D-257: recuentos por rifa y vendedor; la fila con seller_id NULL es el inventario comun, con las apartadas ahora en tickets_held. Ningun importe.';

-- =============================================================================
-- 8.ter El motor de coincidencias no fotografia el inventario comun (D-257)
--
-- Cuerpo de la 0064, SIN OTRO CAMBIO que el filtro `t.seller_id is not null` en
-- sus dos ramas. `create or replace` conserva el dueño y los privilegios que
-- dejo la 0066 (nadie lo ejecuta directamente; lo llama confirm_lottery_result).
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

-- =============================================================================
-- 9. Privilegios (SECURITY §4.5, I-020, I-078, I-132)
--
-- Toda funcion nueva nace ejecutable por PUBLIC: se revoca a todos y se concede
-- solo a quien la llama de verdad. Las internas y las de disparador, a nadie.
--
-- Van ANTES de la seccion 10 a proposito (D-259): no tocan ninguna tabla, y
-- detras de un cerrojo sobre `tickets` cada una de estas 56 sentencias alargaba
-- la espera de toda lectura y escritura de boletas una ida y vuelta de red.
-- =============================================================================

revoke execute on function ticket_hold_default_minutes() from public, anon, authenticated, service_role;
revoke execute on function ticket_hold_default_max_active() from public, anon, authenticated, service_role;
revoke execute on function ticket_hold_extension_minutes() from public, anon, authenticated, service_role;
revoke execute on function ticket_generation_max() from public, anon, authenticated, service_role;
revoke execute on function ticket_generation_chunk_size() from public, anon, authenticated, service_role;
revoke execute on function ticket_internal_code_capacity() from public, anon, authenticated, service_role;
revoke execute on function format_count(bigint) from public, anon, authenticated, service_role;
revoke execute on function ticket_generation_range_problem(text, text) from public, anon, authenticated, service_role;
revoke execute on function raffle_hold_policy(uuid) from public, anon, authenticated, service_role;
revoke execute on function ticket_hold_is_active(uuid) from public, anon, authenticated, service_role;
revoke execute on function ticket_hold_close_expired(uuid) from public, anon, authenticated, service_role;
revoke execute on function raffle_status_word(raffle_status) from public, anon, authenticated, service_role;
revoke execute on function tickets_guard_inventory() from public, anon, authenticated, service_role;
revoke execute on function tickets_guard_hold() from public, anon, authenticated, service_role;
revoke execute on function memberships_end_ticket_holds() from public, anon, authenticated, service_role;
revoke execute on function profiles_end_ticket_holds() from public, anon, authenticated, service_role;

-- Proyecciones y escrituras del personal: como las de D-198, sesion y service role.
revoke execute on function admin_ticket_generation_preview(uuid, text, text, text, text) from public, anon;
revoke execute on function admin_start_ticket_generation(uuid, text, text, text, text, uuid) from public, anon;
revoke execute on function admin_process_ticket_generation(uuid, integer) from public, anon;
revoke execute on function admin_ticket_generation_runs(uuid, uuid, integer) from public, anon;
revoke execute on function admin_ticket_generation_existing(uuid, integer, integer) from public, anon;
revoke execute on function admin_assign_inventory_tickets(uuid[], uuid) from public, anon;
revoke execute on function admin_recover_inventory_tickets(uuid[]) from public, anon;
revoke execute on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer, text, text, text) from public, anon;
revoke execute on function admin_ticket_detail(uuid) from public, anon;
revoke execute on function admin_ticket_bulk_eligibility(uuid[]) from public, anon;
revoke execute on function admin_ticket_inventory(uuid) from public, anon;

grant execute on function admin_ticket_generation_preview(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function admin_start_ticket_generation(uuid, text, text, text, text, uuid) to authenticated, service_role;
grant execute on function admin_process_ticket_generation(uuid, integer) to authenticated, service_role;
grant execute on function admin_ticket_generation_runs(uuid, uuid, integer) to authenticated, service_role;
grant execute on function admin_ticket_generation_existing(uuid, integer, integer) to authenticated, service_role;
grant execute on function admin_assign_inventory_tickets(uuid[], uuid) to authenticated, service_role;
grant execute on function admin_recover_inventory_tickets(uuid[]) to authenticated, service_role;
grant execute on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer, text, text, text) to authenticated, service_role;
grant execute on function admin_ticket_detail(uuid) to authenticated, service_role;
grant execute on function admin_ticket_bulk_eligibility(uuid[]) to authenticated, service_role;
grant execute on function admin_ticket_inventory(uuid) to authenticated, service_role;

-- Del vendedor y de la configuracion: solo la sesion.
revoke execute on function raffle_hold_settings_for(uuid) from public, anon, authenticated, service_role;
revoke execute on function set_raffle_hold_settings(uuid, integer, integer) from public, anon, authenticated, service_role;
revoke execute on function seller_inventory_summary() from public, anon, authenticated, service_role;
revoke execute on function seller_inventory_tickets(uuid, text, text, boolean, integer, integer) from public, anon, authenticated, service_role;
revoke execute on function seller_ticket_holds(uuid) from public, anon, authenticated, service_role;
revoke execute on function take_ticket_hold(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function extend_ticket_hold(uuid) from public, anon, authenticated, service_role;
revoke execute on function return_ticket_hold(uuid) from public, anon, authenticated, service_role;
revoke execute on function sell_ticket_hold(uuid, uuid, date, bigint) from public, anon, authenticated, service_role;

grant execute on function raffle_hold_settings_for(uuid) to authenticated;
grant execute on function set_raffle_hold_settings(uuid, integer, integer) to authenticated;
grant execute on function seller_inventory_summary() to authenticated;
grant execute on function seller_inventory_tickets(uuid, text, text, boolean, integer, integer) to authenticated;
grant execute on function seller_ticket_holds(uuid) to authenticated;
grant execute on function take_ticket_hold(uuid, uuid) to authenticated;
grant execute on function extend_ticket_hold(uuid) to authenticated;
grant execute on function return_ticket_hold(uuid) to authenticated;
grant execute on function sell_ticket_hold(uuid, uuid, date, bigint) to authenticated;

-- =============================================================================
-- 10. Lo que bloquea tablas existentes, AL FINAL y en UNA sola sentencia
--
-- La CLI envia el archivo sentencia a sentencia y espera cada respuesta, y un
-- cerrojo dura hasta confirmar: cada sentencia que siga a la primera que bloquea
-- `tickets` alarga, en el proyecto alojado, una ida y vuelta (~90 ms desde el
-- equipo del dueño, P0 de D-240) la espera de toda lectura y escritura de
-- boletas. Ensayado el 2026-10-19 con 94 ms de ida y vuelta sobre una copia de
-- produccion: con esta seccion en 16 sentencias y los privilegios detras,
-- `tickets` estuvo 10,5 s bajo ACCESS EXCLUSIVE y tres peticiones cayeron por los
-- 8 s de `statement_timeout`. En un solo bloque `do`, la espera es este bloque,
-- la fila de historial y la confirmacion (D-259). Mismas sentencias y mismo
-- orden que antes: el esquema que queda no cambia.
-- =============================================================================

do $seccion10$
begin
  -- 10.1 La boleta: vendedor opcional, generacion y la regla del inventario comun --
  alter table tickets
    alter column seller_id drop not null,
    add column generation_run_id uuid,
    add constraint tickets_without_seller_is_inventory check (
      seller_id is not null
      or (client_id is null
          and sale_price is null
          and base_price is null
          and sale_date is null
          and assigned_at is null
          and paid_amount = 0
          and inventory_status in ('available', 'cancelled'))
    );

  comment on column tickets.seller_id is
    'Quien tiene la boleta. NULL = inventario comun de la rifa (D-257): solo disponible o anulada, sin cliente ni venta.';
  comment on column tickets.generation_run_id is
    'D-257: la generacion por rangos que creo esta boleta. Distingue lo que creo una generacion de lo que ya existia.';

  -- El catalogo interno y el inventario comun del personal recorren las boletas
  -- sin vendedor de UNA rifa en orden de numero.
  create index tickets_common_inventory_idx
    on tickets (raffle_id, daily_number, weekly_number)
    where seller_id is null;
  create index tickets_generation_run_idx
    on tickets (generation_run_id)
    where generation_run_id is not null;

  -- 10.2 Disparadores de la boleta -------------------------------------------------
  create trigger tickets_guard_inventory
    before insert or update of seller_id, generation_run_id on tickets
    for each row execute function tickets_guard_inventory();

  create trigger tickets_guard_hold
    before update or delete on tickets
    for each row
    when (old.seller_id is null)
    execute function tickets_guard_hold();

  -- La bitacora de una boleta GENERADA va por bloque (D-257). Todo lo demas —las
  -- boletas creadas de cualquier otra forma, y cualquier cambio o borrado de
  -- cualquier boleta, generada o no— sigue auditandose fila a fila como siempre.
  drop trigger audit_tickets on tickets;
  create trigger audit_tickets
    after update or delete on tickets
    for each row execute function audit_row_change('ticket');
  create trigger audit_tickets_insert
    after insert on tickets
    for each row
    when (new.generation_run_id is null)
    execute function audit_row_change('ticket');

  -- 10.3 Llaves foraneas hacia tablas existentes ----------------------------------
  alter table raffle_hold_settings
    add constraint raffle_hold_settings_raffle_org_fk
      foreign key (raffle_id, organization_id) references raffles(id, organization_id) on delete restrict,
    add constraint raffle_hold_settings_updated_by_fkey
      foreign key (updated_by) references profiles(id) on delete restrict;

  alter table ticket_generation_runs
    add constraint ticket_generation_runs_raffle_org_fk
      foreign key (raffle_id, organization_id) references raffles(id, organization_id) on delete restrict,
    add constraint ticket_generation_runs_created_by_fkey
      foreign key (created_by) references profiles(id) on delete restrict;

  -- Borrar una boleta cargada por error (`bulk_delete_tickets`, D-084) se lleva su
  -- historia de apartados; la bitacora conserva cada toma, extension y devolucion.
  -- `tickets_guard_hold` impide borrar una con un apartado vigente.
  alter table ticket_holds
    add constraint ticket_holds_ticket_org_fk
      foreign key (ticket_id, organization_id) references tickets(id, organization_id) on delete cascade,
    add constraint ticket_holds_raffle_org_fk
      foreign key (raffle_id, organization_id) references raffles(id, organization_id) on delete restrict,
    add constraint ticket_holds_seller_org_fk
      foreign key (seller_id, organization_id) references memberships(profile_id, organization_id) on delete restrict;

  alter table tickets
    add constraint tickets_generation_run_fk
      foreign key (generation_run_id, raffle_id) references ticket_generation_runs(id, raffle_id) on delete restrict;

  -- 10.4 Quien deja de vender, deja sus apartados ----------------------------------
  create trigger memberships_end_ticket_holds
    after update of is_active, role on memberships
    for each row execute function memberships_end_ticket_holds();

  create trigger profiles_end_ticket_holds
    after update of is_active on profiles
    for each row execute function profiles_end_ticket_holds();
end
$seccion10$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA, y depende de si ya hay inventario comun:
--
--   1. Comprobar: select count(*) from tickets where seller_id is null;
--                 select count(*) from ticket_holds where ended_at is null;
--                 select count(*) from tickets where generation_run_id is not null;
--   2. Si hay boletas sin vendedor, NO se puede volver a `seller_id not null`
--      sin decidir antes que hacer con ellas: asignarlas a un vendedor con
--      admin_assign_inventory_tickets, o eliminarlas con bulk_delete_tickets
--      si nunca se vendieron. Ninguna boleta vendida esta en el inventario
--      comun: el CHECK tickets_without_seller_is_inventory lo impide.
--   3. Retirar las funciones de las secciones 7 y 8 y sus privilegios; volver a
--      crear admin_list_tickets, admin_ticket_detail,
--      admin_ticket_bulk_eligibility y admin_ticket_inventory como en la 0076
--      y la 0057; assign_ticket_row y bulk_change_ticket_seller como en la 0057
--      y la 0020; tickets_enforce_seller_role como en la 0004;
--      match_lottery_result como en la 0064; app_capability_catalog() y
--      app_role_default_capabilities() como en la 0080.
--   4. Recrear audit_tickets como after insert or update or delete y retirar
--      audit_tickets_insert; retirar tickets_guard_inventory, tickets_guard_hold,
--      memberships_end_ticket_holds y profiles_end_ticket_holds.
--   5. alter table tickets drop constraint tickets_generation_run_fk,
--      drop constraint tickets_without_seller_is_inventory,
--      drop column generation_run_id, alter column seller_id set not null;
--      drop index tickets_common_inventory_idx (se va con la columna el otro).
--   6. drop table ticket_holds, ticket_generation_runs, raffle_hold_settings.
--
-- Los apartados y las generaciones son historia: antes de borrar sus tablas hay
-- que exportarlas. La bitacora (audit_logs) conserva cada toma, extension,
-- devolucion, venta, asignacion, recuperacion y bloque generado.
-- =============================================================================
