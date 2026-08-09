-- =============================================================================
-- 0021_ticket_import_clients.sql
-- Clientes opcionales en la importacion CSV/JSON de boletas
--
-- Extiende BR-N12 sin cambiar el modelo cliente -> boletas:
--   * nombre y celular siguen siendo obligatorios juntos (BR-C02);
--   * varias filas con la misma identidad reutilizan un solo clients.id;
--   * un cliente existente solo se reutiliza si nombre + celular coinciden de
--     forma inequivoca dentro de la cartera del vendedor;
--   * clientes, boletas y asignaciones se escriben en una sola transaccion.
--
-- Las importaciones antiguas sin cliente siguen por las funciones de 0019.
-- Las boletas creadas por un vendedor siguen pendientes y sin cliente: esta
-- operacion es solo administrativa para no saltarse BR-I03/BR-I09.
-- =============================================================================

-- Normalizacion comparable. No cambia nunca lo que se muestra al usuario.
create function ticket_import_name_key(value text)
returns text
language sql
immutable
parallel safe
returns null on null input
as $$
  select regexp_replace(btrim(search_normalize(value)), '[[:space:]]+', ' ', 'g')
$$;

create function ticket_import_phone_key(value text)
returns text
language sql
immutable
parallel safe
returns null on null input
as $$
  with normalized as (
    select regexp_replace(value, '[^0-9]', '', 'g') as digits
  )
  select case when length(digits) > 10 then right(digits, 10) else digits end
  from normalized
$$;

comment on function ticket_import_name_key(text) is
  'Nombre comparable para identificar clientes dentro de una importacion; no modifica el dato visible.';
comment on function ticket_import_phone_key(text) is
  'Celular comparable por sus digitos nacionales para identificar clientes dentro de una importacion.';

-- La expresion exacta evita recorrer toda la cartera por cada vista previa.
create index clients_seller_import_phone_idx
  on clients (seller_id, ticket_import_phone_key(phone));

-- -----------------------------------------------------------------------------
-- match_ticket_import_clients — coincidencias seguras para la vista previa
-- -----------------------------------------------------------------------------
create function match_ticket_import_clients(
  p_raffle_id uuid,
  p_seller_id uuid,
  p_clients   jsonb
)
returns table (
  client_key  text,
  client_id   uuid,
  name        text,
  phone       text,
  archived_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  perform require_auth();

  if p_clients is null or jsonb_typeof(p_clients) <> 'array' then
    raise exception 'No se recibió una lista válida de clientes.';
  end if;
  if jsonb_array_length(p_clients) > 1000 then
    raise exception 'No se pueden comprobar más de 1.000 clientes a la vez.';
  end if;

  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if not found or not is_org_staff(v_org) then
    raise exception 'No tienes permiso para comprobar clientes de esta rifa.'
      using errcode = 'insufficient_privilege';
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

  if exists (
    select 1
    from jsonb_array_elements(p_clients) c
    where nullif(btrim(c ->> 'client_key'), '') is null
       or length(btrim(coalesce(c ->> 'name', ''))) not between 2 and 120
       or coalesce(c ->> 'phone', '') !~ '^[0-9+ ()-]{7,20}$'
  ) then
    raise exception 'Hay clientes con nombre o celular inválido.';
  end if;

  return query
  with wanted as (
    select distinct
      c ->> 'client_key' as client_key,
      ticket_import_phone_key(c ->> 'phone') as phone_key
    from jsonb_array_elements(p_clients) c
  )
  select w.client_key, c.id, c.name, c.phone, c.archived_at
  from wanted w
  join clients c
    on c.organization_id = v_org
   and c.seller_id = p_seller_id
   and ticket_import_phone_key(c.phone) = w.phone_key;
end;
$$;

comment on function match_ticket_import_clients(uuid, uuid, jsonb) is
  'Coincidencias por celular para la vista previa administrativa. Solo devuelve clientes de la cartera indicada y de la organizacion autenticada.';

-- -----------------------------------------------------------------------------
-- import_tickets_with_clients — persistencia atomica del archivo administrativo
-- -----------------------------------------------------------------------------
create function import_tickets_with_clients(
  p_raffle_id uuid,
  p_seller_id uuid,
  p_rows      jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid             uuid := require_auth();
  v_raffle          raffles%rowtype;
  v_requested       integer;
  v_inserted        integer;
  v_base            bigint;
  v_inserted_rows   jsonb;
  v_conflicts       jsonb;
  v_group           record;
  v_assignment      record;
  v_phone_matches   integer;
  v_exact_matches   integer;
  v_client_id       uuid;
  v_archived_at     timestamptz;
  v_group_keys      text[] := array[]::text[];
  v_group_ids       uuid[] := array[]::uuid[];
  v_group_key       text;
  v_group_index     integer;
  v_assigned        integer := 0;
  v_clients_created integer := 0;
  v_clients_reused  integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'No se recibió una lista válida de boletas.';
  end if;

  v_requested := jsonb_array_length(p_rows);
  if v_requested < 1 or v_requested > 1000 then
    raise exception 'La cantidad de boletas debe estar entre 1 y 1.000.';
  end if;

  select * into v_raffle from raffles where id = p_raffle_id for update;
  if not found then
    raise exception 'La rifa no existe o no tienes acceso a ella.';
  end if;
  if not is_org_staff(v_raffle.organization_id) then
    raise exception 'No tienes permiso para importar clientes en esta organización.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_raffle.status not in ('draft', 'active') then
    raise exception 'La rifa no admite boletas nuevas.';
  end if;

  if not exists (
    select 1 from memberships m
    where m.profile_id = p_seller_id
      and m.organization_id = v_raffle.organization_id
      and m.role = 'seller'
      and m.is_active
  ) then
    raise exception 'El vendedor indicado no es un vendedor activo de la organización.';
  end if;

  -- Validacion autoritativa del mismo formato que usan Zod y los CHECK.
  if exists (
    select 1
    from jsonb_array_elements(p_rows) r
    where coalesce(r ->> 'daily_number', '') !~ '^[0-9]{1,4}$'
       or coalesce(r ->> 'weekly_number', '') !~ '^[0-9]{1,4}$'
       or ((nullif(btrim(r ->> 'client_name'), '') is null)
            <> (nullif(btrim(r ->> 'client_phone'), '') is null))
       or (
         nullif(btrim(r ->> 'client_name'), '') is not null
         and (
           length(btrim(r ->> 'client_name')) not between 2 and 120
           or coalesce(r ->> 'client_phone', '') !~ '^[0-9+ ()-]{7,20}$'
         )
       )
  ) then
    raise exception 'El archivo tiene filas con números o datos de cliente inválidos.';
  end if;

  if (
    select count(*) <> count(distinct (r ->> 'daily_number', r ->> 'weekly_number'))
    from jsonb_array_elements(p_rows) r
  ) then
    raise exception 'El archivo tiene combinaciones repetidas.';
  end if;

  if v_raffle.status <> 'active' and exists (
    select 1 from jsonb_array_elements(p_rows) r
    where nullif(btrim(r ->> 'client_name'), '') is not null
  ) then
    raise exception 'Activa la rifa antes de importar boletas con cliente.';
  end if;

  -- Reserva un bloque igual que bulk_create_tickets. El trigger no incrementa
  -- de nuevo porque cada INSERT recibe su internal_code.
  update raffles
     set ticket_counter = ticket_counter + v_requested
   where id = p_raffle_id
  returning ticket_counter - v_requested into v_base;

  with input as (
    select
      ord,
      btrim(r ->> 'daily_number') as daily_number,
      btrim(r ->> 'weekly_number') as weekly_number
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
      'available'::ticket_inventory_status,
      v_uid
    from input i
    on conflict on constraint tickets_combo_unique do nothing
    returning id, daily_number, weekly_number
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'ticket_id', id,
      'daily_number', daily_number,
      'weekly_number', weekly_number
    )),
    '[]'::jsonb
  ) into v_inserted_rows
  from ins;

  v_inserted := jsonb_array_length(v_inserted_rows);

  with input as (
    select
      ord,
      btrim(r ->> 'daily_number') as daily_number,
      btrim(r ->> 'weekly_number') as weekly_number
    from jsonb_array_elements(p_rows) with ordinality as t(r, ord)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'daily_number', i.daily_number,
           'weekly_number', i.weekly_number
         ) order by i.ord), '[]'::jsonb)
    into v_conflicts
  from input i
  where not exists (
    select 1
    from jsonb_array_elements(v_inserted_rows) saved
    where saved ->> 'daily_number' = i.daily_number
      and saved ->> 'weekly_number' = i.weekly_number
  );

  -- Solo se crean clientes para grupos que consiguieron al menos una boleta.
  for v_group in
    with input as (
      select
        ord,
        btrim(r ->> 'daily_number') as daily_number,
        btrim(r ->> 'weekly_number') as weekly_number,
        btrim(r ->> 'client_name') as client_name,
        btrim(r ->> 'client_phone') as client_phone,
        ticket_import_name_key(r ->> 'client_name') as name_key,
        ticket_import_phone_key(r ->> 'client_phone') as phone_key
      from jsonb_array_elements(p_rows) with ordinality as t(r, ord)
      where nullif(btrim(r ->> 'client_name'), '') is not null
    )
    select
      i.name_key,
      i.phone_key,
      (array_agg(i.client_name order by i.ord))[1] as client_name,
      (array_agg(i.client_phone order by i.ord))[1] as client_phone
    from input i
    where exists (
      select 1 from jsonb_array_elements(v_inserted_rows) saved
      where saved ->> 'daily_number' = i.daily_number
        and saved ->> 'weekly_number' = i.weekly_number
    )
    group by i.name_key, i.phone_key
  loop
    select
      count(*)::integer,
      count(*) filter (
        where ticket_import_name_key(c.name) = v_group.name_key
      )::integer,
      (array_agg(c.id order by c.id) filter (
        where ticket_import_name_key(c.name) = v_group.name_key
      ))[1],
      (array_agg(c.archived_at order by c.id) filter (
        where ticket_import_name_key(c.name) = v_group.name_key
      ))[1]
      into v_phone_matches, v_exact_matches, v_client_id, v_archived_at
    from clients c
    where c.organization_id = v_raffle.organization_id
      and c.seller_id = p_seller_id
      and ticket_import_phone_key(c.phone) = v_group.phone_key;

    if v_exact_matches > 1 then
      raise exception 'Hay varios clientes con este nombre y celular. Elige uno manualmente.';
    elsif v_exact_matches = 1 and v_archived_at is not null then
      raise exception 'Un cliente del archivo está archivado. Restáuralo antes de importar.';
    elsif v_exact_matches = 1 then
      v_clients_reused := v_clients_reused + 1;
    elsif v_phone_matches > 0 then
      raise exception 'Un celular del archivo ya está registrado con otro nombre.';
    else
      insert into clients (organization_id, seller_id, name, phone)
      values (
        v_raffle.organization_id,
        p_seller_id,
        v_group.client_name,
        v_group.client_phone
      )
      returning id into v_client_id;
      v_clients_created := v_clients_created + 1;
    end if;

    v_group_key := jsonb_build_array(v_group.name_key, v_group.phone_key)::text;
    v_group_keys := array_append(v_group_keys, v_group_key);
    v_group_ids := array_append(v_group_ids, v_client_id);
  end loop;

  -- Reutiliza literalmente la regla individual: snapshot de precio, fechas,
  -- cartera, rifa activa y auditoria. Cualquier fallo revierte toda la funcion.
  for v_assignment in
    with input as (
      select
        btrim(r ->> 'daily_number') as daily_number,
        btrim(r ->> 'weekly_number') as weekly_number,
        ticket_import_name_key(r ->> 'client_name') as name_key,
        ticket_import_phone_key(r ->> 'client_phone') as phone_key
      from jsonb_array_elements(p_rows) r
      where nullif(btrim(r ->> 'client_name'), '') is not null
    )
    select
      (saved ->> 'ticket_id')::uuid as ticket_id,
      i.name_key,
      i.phone_key
    from jsonb_array_elements(v_inserted_rows) saved
    join input i
      on i.daily_number = saved ->> 'daily_number'
     and i.weekly_number = saved ->> 'weekly_number'
  loop
    v_group_key := jsonb_build_array(v_assignment.name_key, v_assignment.phone_key)::text;
    v_group_index := array_position(v_group_keys, v_group_key);
    if v_group_index is null then
      raise exception 'No pudimos identificar uno de los clientes del archivo.';
    end if;

    perform assign_ticket_row(v_assignment.ticket_id, v_group_ids[v_group_index], null);
    v_assigned := v_assigned + 1;
  end loop;

  perform write_audit_log(
    v_raffle.organization_id, 'ticket.bulk_create', 'ticket', null, null,
    jsonb_build_object(
      'raffle_id', p_raffle_id,
      'seller_id', p_seller_id,
      'requested', v_requested,
      'inserted', v_inserted,
      'assigned', v_assigned,
      'clients_created', v_clients_created,
      'clients_reused', v_clients_reused
    )
  );

  return jsonb_build_object(
    'requested', v_requested,
    'inserted', v_inserted,
    'conflicts', v_conflicts,
    'assigned', v_assigned,
    'clients_created', v_clients_created,
    'clients_reused', v_clients_reused
  );
end;
$$;

comment on function import_tickets_with_clients(uuid, uuid, jsonb) is
  'Importacion administrativa atomica: crea boletas, reutiliza o crea clientes inequivocos y asigna con assign_ticket_row. Las filas sin cliente quedan disponibles.';

-- Privilegios explicitos (I-020). Los helpers son necesarios al mantener el
-- indice; las dos RPC solo se exponen a sesiones autenticadas.
revoke execute on function ticket_import_name_key(text) from public, anon;
revoke execute on function ticket_import_phone_key(text) from public, anon;
revoke execute on function match_ticket_import_clients(uuid, uuid, jsonb) from public, anon;
revoke execute on function import_tickets_with_clients(uuid, uuid, jsonb) from public, anon;

grant execute on function ticket_import_name_key(text) to authenticated, service_role;
grant execute on function ticket_import_phone_key(text) to authenticated, service_role;
grant execute on function match_ticket_import_clients(uuid, uuid, jsonb) to authenticated;
grant execute on function import_tickets_with_clients(uuid, uuid, jsonb) to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   drop function import_tickets_with_clients(uuid, uuid, jsonb);
--   drop function match_ticket_import_clients(uuid, uuid, jsonb);
--   drop index clients_seller_import_phone_idx;
--   drop function ticket_import_phone_key(text);
--   drop function ticket_import_name_key(text);
--
-- Las boletas y los clientes ya importados conservan sus relaciones normales.
-- =============================================================================
