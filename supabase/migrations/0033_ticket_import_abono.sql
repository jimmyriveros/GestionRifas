-- =============================================================================
-- 0033_ticket_import_abono.sql
-- La columna «Abono» del importador CSV/JSON
--
-- Referencia: docs/BUSINESS_RULES.md BR-N14, D-129. Amplia 0021 sin cambiar su
-- firma: `p_rows` gana una clave OPCIONAL `abono` con el valor ya en pesos
-- enteros. Un archivo sin esa clave se comporta exactamente igual que antes, y
-- por eso esto es un `create or replace` y no una funcion nueva.
--
-- QUE HACE, Y QUE NO HACE
--
-- No hay ni una regla de dinero nueva. El abono se registra llamando a
-- `create_payment`, la MISMA funcion que usa el formulario de abono manual, con
-- un reparto de una sola boleta. De ahi salen gratis, y sin duplicar codigo:
--
--   * la fila en `payments` y la fila en `payment_allocations` (BR-F05);
--   * el recalculo de `tickets.paid_amount` por el disparador de 0004;
--   * el estado de pago —Sin pagar / Abonada / Pagada— que deriva de ahi (BR-F07);
--   * el bloqueo de sobrepago contra `sale_price` (BR-F12);
--   * la comision del vendedor, que se mueve sola al cobrar (BR-G*);
--   * la fila `payment.create` en la bitacora.
--
-- Un campo acumulado escrito a mano habria saltado las seis cosas a la vez.
--
-- POR QUE UN PAGO POR FILA
--
-- El abono de una fila es de SU boleta: el encargo lo pide explicitamente («no
-- debe distribuirse ni sumarse entre otras boletas del mismo cliente»). Un solo
-- pago por cliente con varias asignaciones cuadraria igual de bien en las
-- cuentas, pero el historial diria «un abono de $170.000» donde de verdad hubo
-- tres cobros distintos, y ese historial es lo que el vendedor le enseña al
-- cliente cuando reclama.
--
-- ATOMICIDAD
--
-- Una funcion PL/pgSQL es una transaccion. Si un abono es invalido —o si lo
-- rechaza `create_payment`— revierte TODO: los pagos, las asignaciones, los
-- clientes creados, las boletas y el contador de la rifa. No puede quedar una
-- boleta creada sin su abono ni un cliente sin boletas.
-- =============================================================================

create or replace function import_tickets_with_clients(
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
  v_payments        integer := 0;
  v_payments_total  bigint  := 0;
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

  -- El abono llega YA interpretado en pesos enteros: «20» o «Cancelado» los
  -- traduce el navegador, que es quien lee el archivo. Aqui se comprueba lo que
  -- el navegador no manda: que sea un entero, que sea positivo y que quepa en el
  -- precio VIGENTE de esta rifa, leido de la fila y no de una cifra escrita en
  -- el codigo (BR-P01, D-098).
  -- El `case` no es adorno: PostgreSQL NO garantiza el orden de evaluacion de
  -- un `and`/`or`, asi que un `jsonb_typeof(...) = 'number' and (...)::numeric`
  -- puede intentar el cast antes de la comprobacion y reventar con «cannot cast
  -- jsonb string to type numeric» ante un archivo con «Abono: hola». `case` si
  -- garantiza el orden.
  if exists (
    select 1
    from jsonb_array_elements(p_rows) r
    where r ? 'abono'
      and case jsonb_typeof(r -> 'abono')
            when 'null' then false
            when 'number' then
              (r -> 'abono')::numeric <> trunc((r -> 'abono')::numeric)
              or (r -> 'abono')::numeric <= 0
            else true
          end
  ) then
    raise exception 'El abono debe ser un valor en pesos entero y mayor que cero.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) r
    where case jsonb_typeof(r -> 'abono')
            when 'number' then (r -> 'abono')::numeric > v_raffle.ticket_price
            else false
          end
  ) then
    raise exception 'Un abono del archivo supera el precio de la boleta (%).',
      format_cop(v_raffle.ticket_price);
  end if;

  -- BR-F02/BR-F04: solo se abona una boleta vendida.
  if exists (
    select 1
    from jsonb_array_elements(p_rows) r
    where jsonb_typeof(r -> 'abono') = 'number'
      and nullif(btrim(r ->> 'client_name'), '') is null
  ) then
    raise exception 'Un abono del archivo no tiene cliente. Sin cliente la boleta no está vendida y no admite abonos.';
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

  -- Reutiliza literalmente las reglas individuales: `assign_ticket_row` pone
  -- snapshot de precio, fechas, cartera, rifa activa y auditoria;
  -- `create_payment` hace el abono con su asignacion, su recalculo y su tope de
  -- sobrepago. Cualquier fallo de cualquiera de las dos revierte la funcion
  -- entera.
  --
  -- El abono va en la MISMA vuelta que la asignacion, y no en un bucle aparte,
  -- para que sea imposible cobrar una boleta que no se llego a asignar.
  for v_assignment in
    with input as (
      select
        btrim(r ->> 'daily_number') as daily_number,
        btrim(r ->> 'weekly_number') as weekly_number,
        ticket_import_name_key(r ->> 'client_name') as name_key,
        ticket_import_phone_key(r ->> 'client_phone') as phone_key,
        case jsonb_typeof(r -> 'abono')
          when 'number' then (r -> 'abono')::numeric::bigint
        end as abono
      from jsonb_array_elements(p_rows) r
      where nullif(btrim(r ->> 'client_name'), '') is not null
    )
    select
      (saved ->> 'ticket_id')::uuid as ticket_id,
      i.name_key,
      i.phone_key,
      i.abono
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

    if v_assignment.abono is not null then
      perform create_payment(
        v_group_ids[v_group_index],
        v_assignment.abono,
        jsonb_build_array(jsonb_build_object(
          'ticket_id', v_assignment.ticket_id,
          'amount', v_assignment.abono
        )),
        null::date,
        'cash'::payment_method,
        'Abono importado desde archivo'
      );
      v_payments := v_payments + 1;
      v_payments_total := v_payments_total + v_assignment.abono;
    end if;
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
      'clients_reused', v_clients_reused,
      'payments_created', v_payments,
      'payments_total', v_payments_total
    )
  );

  return jsonb_build_object(
    'requested', v_requested,
    'inserted', v_inserted,
    'conflicts', v_conflicts,
    'assigned', v_assigned,
    'clients_created', v_clients_created,
    'clients_reused', v_clients_reused,
    'payments_created', v_payments,
    'payments_total', v_payments_total
  );
end;
$$;

comment on function import_tickets_with_clients(uuid, uuid, jsonb) is
  'Importacion administrativa atomica: crea boletas, reutiliza o crea clientes inequivocos, asigna con assign_ticket_row y registra el abono de la fila con create_payment. Las filas sin cliente quedan disponibles y sin abono.';

-- `create or replace` CONSERVA los privilegios de la funcion, pero se repiten
-- explicitamente: desde 0032 una funcion de `public` no nace ejecutable por
-- `authenticated` en ninguno de los dos entornos, y dejar esto implicito es
-- justo lo que hizo falta arreglar en I-078.
revoke execute on function import_tickets_with_clients(uuid, uuid, jsonb) from public, anon;
grant execute on function import_tickets_with_clients(uuid, uuid, jsonb) to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Volver a ejecutar el cuerpo de `import_tickets_with_clients` tal y como lo
-- define 0021_ticket_import_clients.sql. La clave `abono` pasaria a ignorarse y
-- las importaciones dejarian de registrar pagos.
--
-- Los abonos YA importados no se tocan: son filas normales de `payments` y
-- `payment_allocations`, indistinguibles de un abono registrado a mano salvo
-- por su nota, y se anulan por el camino de siempre (`void_payment`, BR-F09).
-- =============================================================================
