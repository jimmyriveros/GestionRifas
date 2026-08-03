-- =============================================================================
-- 0007_functions_rpc.sql
-- Fase 2 — Funciones transaccionales (RPC)
--
-- Referencia normativa: docs/ARCHITECTURE.md §7.3, docs/SECURITY.md §4.5.
--
-- Reglas obligatorias para TODAS las funciones de este archivo
-- (docs/SECURITY.md §4.5):
--   1. SET search_path = public, pg_temp explicito (evita secuestro de esquema).
--   2. Validan permisos internamente: NO asumen que quien llama esta autorizado.
--   3. REVOKE EXECUTE FROM PUBLIC + GRANT EXECUTE TO authenticated.
--   4. Parametros tipados; jamas SQL construido por concatenacion de texto.
--   5. Mensajes de error de negocio en espanol, sin filtrar estructura interna.
--   6. Auditan la accion antes de retornar.
--
-- Son SECURITY DEFINER a proposito: ejecutan operaciones legitimas que las
-- politicas RLS del propio usuario prohiben deliberadamente (por ejemplo, un
-- vendedor no puede pasar su boleta a 'assigned' con un UPDATE directo, pero si
-- puede hacerlo a traves de assign_ticket, que valida todas las reglas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper interno: exige sesion autenticada
-- -----------------------------------------------------------------------------
create function require_auth()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion para realizar esta accion.'
      using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end;
$$;

-- =============================================================================
-- assign_ticket — asignar una boleta a un cliente (BR-I07, BR-P03)
--
-- Copia el precio VIGENTE de la rifa a sale_price (snapshot inmutable) y pasa
-- la boleta a 'assigned' en una sola transaccion.
-- =============================================================================
create function assign_ticket(
  p_ticket_id uuid,
  p_client_id uuid,
  p_sale_date date default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid          uuid := require_auth();
  v_ticket       tickets%rowtype;
  v_client       clients%rowtype;
  v_raffle       raffles%rowtype;
  v_is_staff     boolean;
begin
  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  v_is_staff := is_org_staff(v_ticket.organization_id);

  -- BR-I07: la boleta debe ser del vendedor autenticado, salvo autorizacion
  -- administrativa.
  if not v_is_staff and v_ticket.seller_id <> v_uid then
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

  update tickets
     set client_id        = p_client_id,
         sale_price       = v_raffle.ticket_price,  -- snapshot (BR-P03)
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
                       'sale_price', v_raffle.ticket_price)
  );
end;
$$;

-- =============================================================================
-- approve_tickets — aprobar boletas creadas por vendedores (BR-I09)
-- Solo Owner/Admin. pending_approval -> available.
-- =============================================================================
create function approve_tickets(p_ticket_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := require_auth();
  v_count integer := 0;
  v_id    uuid;
  v_org   uuid;
begin
  if p_ticket_ids is null or array_length(p_ticket_ids, 1) is null then
    raise exception 'No se indicaron boletas para aprobar.';
  end if;

  foreach v_id in array p_ticket_ids loop
    select organization_id into v_org from tickets where id = v_id;
    if v_org is null then
      continue;
    end if;

    if not is_org_staff(v_org) then
      raise exception 'No tienes permiso para aprobar boletas de esta organizacion.'
        using errcode = 'insufficient_privilege';
    end if;

    update tickets
       set inventory_status = 'available',
           approved_by      = v_uid,
           approved_at      = now()
     where id = v_id
       and inventory_status = 'pending_approval';

    if found then
      v_count := v_count + 1;
      perform write_audit_log(v_org, 'ticket.approve', 'ticket', v_id, null,
                              jsonb_build_object('approved_by', v_uid));
    end if;
  end loop;

  return v_count;
end;
$$;

-- =============================================================================
-- cancel_ticket — anular una boleta (BR-I10, BR-I11)
-- Solo Owner/Admin. Imposible si tiene pagos activos.
-- =============================================================================
create function cancel_ticket(p_ticket_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_ticket tickets%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Debes indicar un motivo de al menos 5 caracteres.';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if not is_org_staff(v_ticket.organization_id) then
    raise exception 'No tienes permiso para anular boletas.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_ticket.inventory_status = 'cancelled' then
    raise exception 'La boleta ya esta anulada.';
  end if;

  -- BR-I11: con pagos activos, primero hay que anular los pagos.
  if exists (
    select 1 from payment_allocations pa
    join payments p on p.id = pa.payment_id
    where pa.ticket_id = p_ticket_id and p.voided_at is null
  ) then
    raise exception 'La boleta tiene pagos activos. Anula los pagos antes de anular la boleta.';
  end if;

  update tickets
     set inventory_status = 'cancelled',
         cancelled_at     = now(),
         cancel_reason    = btrim(p_reason)
   where id = p_ticket_id;

  perform write_audit_log(
    v_ticket.organization_id, 'ticket.cancel', 'ticket', p_ticket_id,
    jsonb_build_object('inventory_status', v_ticket.inventory_status),
    jsonb_build_object('inventory_status', 'cancelled', 'cancel_reason', btrim(p_reason))
  );
end;
$$;

-- =============================================================================
-- bulk_create_tickets — creacion masiva de 1 a 1.000 boletas (CLAUDE.md §15)
--
-- Reserva el bloque completo de internal_code de una sola vez, en lugar de
-- disparar 1.000 updates secuenciales sobre raffles.ticket_counter (D-014,
-- riesgo R-15).
--
-- p_rows: [{ "daily_number": "0007", "weekly_number": "1234" }, ...]
-- Los numeros pueden venir nulos: la boleta queda en 'draft' para completarse
-- despues (guardado parcial, CLAUDE.md §15).
--
-- Devuelve { requested, inserted, conflicts: [{daily_number, weekly_number}] }:
-- las filas en conflicto NO abortan el lote, se reportan para mostrarlas por
-- fila en la interfaz (manejo de errores parciales controlado).
-- =============================================================================
create function bulk_create_tickets(
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
  v_uid        uuid := require_auth();
  v_raffle     raffles%rowtype;
  v_count      integer;
  v_base       bigint;
  v_inserted   integer;
  v_conflicts  jsonb;
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

  -- Reserva del bloque de codigos en una sola operacion.
  update raffles
     set ticket_counter = ticket_counter + v_count
   where id = p_raffle_id
  returning ticket_counter - v_count into v_base;

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

-- =============================================================================
-- create_payment — registrar un pago repartido entre boletas (BR-F02..BR-F06)
--
-- ATOMICA por definicion: una funcion PL/pgSQL se ejecuta dentro de una unica
-- transaccion. Si cualquier validacion falla, no queda rastro del pago ni de
-- sus asignaciones (CLAUDE.md §18: "si una parte falla, no debe guardarse
-- ninguna").
--
-- p_allocations: [{ "ticket_id": "...", "amount": 40000 }, ...]
-- =============================================================================
create function create_payment(
  p_client_id      uuid,
  p_total_amount   bigint,
  p_allocations    jsonb,
  p_payment_date   date default null,
  p_payment_method payment_method default 'cash',
  p_notes          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := require_auth();
  v_client     clients%rowtype;
  v_payment_id uuid;
  v_sum        bigint;
  v_alloc      record;
  v_ticket     tickets%rowtype;
  v_raffle_status raffle_status;
begin
  -- ---------------------------------------------------------------- validacion
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'El valor del pago debe ser mayor que cero.';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Debes indicar al menos una boleta a la cual aplicar el pago.';
  end if;

  select * into v_client from clients where id = p_client_id;
  if not found then
    raise exception 'El cliente no existe o no tienes acceso a el.';
  end if;

  -- BR-F02: el pago lo registra el vendedor dueno del cliente (o el personal).
  if not is_org_staff(v_client.organization_id) and v_client.seller_id <> v_uid then
    raise exception 'El cliente no existe o no tienes acceso a el.';
  end if;

  -- BR-F03: montos individuales positivos
  if exists (
    select 1 from jsonb_array_elements(p_allocations) a
    where coalesce((a ->> 'amount')::bigint, 0) <= 0
  ) then
    raise exception 'Cada valor aplicado debe ser mayor que cero.';
  end if;

  -- BR-F05: el reparto debe cuadrar EXACTAMENTE con el total
  select coalesce(sum((a ->> 'amount')::bigint), 0) into v_sum
    from jsonb_array_elements(p_allocations) a;

  if v_sum <> p_total_amount then
    raise exception 'La suma de los valores aplicados (%) debe ser igual al total del pago (%).',
      v_sum, p_total_amount;
  end if;

  -- ------------------------------------------------------------------ el pago
  insert into payments (
    organization_id, seller_id, client_id, total_amount,
    payment_date, payment_method, notes, created_by
  )
  values (
    v_client.organization_id,
    v_client.seller_id,
    p_client_id,
    p_total_amount,
    coalesce(p_payment_date, today_bogota()),
    coalesce(p_payment_method, 'cash'),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_uid
  )
  returning id into v_payment_id;

  -- ------------------------------------------------------------ asignaciones
  -- Se recorren ORDENADAS por ticket_id: si dos pagos concurrentes tocan las
  -- mismas boletas, ambos las bloquean en el mismo orden y no puede haber
  -- interbloqueo (riesgo R-02).
  for v_alloc in
    select (a ->> 'ticket_id')::uuid as ticket_id,
           (a ->> 'amount')::bigint  as amount
      from jsonb_array_elements(p_allocations) a
     order by 1
  loop
    select * into v_ticket from tickets where id = v_alloc.ticket_id for update;

    if not found then
      raise exception 'Una de las boletas indicadas no existe.';
    end if;

    -- BR-F02/BR-F04: la boleta debe ser de ESTE cliente. Cubre de una vez
    -- "boleta de otro cliente", "boleta de otro vendedor" y "boleta sin cliente".
    if v_ticket.client_id is distinct from p_client_id then
      raise exception 'La boleta % no pertenece a este cliente.', v_ticket.internal_code;
    end if;

    if v_ticket.inventory_status <> 'assigned' then
      raise exception 'La boleta % no esta asignada y no admite pagos.', v_ticket.internal_code;
    end if;

    -- BR-R09: en una rifa cerrada SI se pueden cobrar deudas; en una anulada no.
    select status into v_raffle_status from raffles where id = v_ticket.raffle_id;
    if v_raffle_status = 'cancelled' then
      raise exception 'La rifa esta anulada. No se pueden registrar pagos.';
    end if;

    -- BR-F12: bloqueo de sobrepago con mensaje claro. El CHECK
    -- tickets_paid_amount_range es la red final si algo escapara por aqui.
    if v_ticket.paid_amount + v_alloc.amount > v_ticket.sale_price then
      raise exception 'El valor aplicado a la boleta % supera su saldo pendiente (%).',
        v_ticket.internal_code, v_ticket.sale_price - v_ticket.paid_amount;
    end if;

    insert into payment_allocations (
      payment_id, ticket_id, client_id, organization_id, amount
    )
    values (
      v_payment_id, v_alloc.ticket_id, p_client_id,
      v_client.organization_id, v_alloc.amount
    );
  end loop;

  perform write_audit_log(
    v_client.organization_id, 'payment.create', 'payment', v_payment_id, null,
    jsonb_build_object('client_id', p_client_id, 'total_amount', p_total_amount,
                       'allocations', p_allocations)
  );

  return v_payment_id;
end;
$$;

-- =============================================================================
-- void_payment — anular un pago (BR-F09, BR-F10, BR-F11)
--
-- Solo Owner/Admin. No borra nada: marca la anulacion, y el trigger de 0004
-- recalcula el saldo de todas las boletas afectadas.
-- =============================================================================
create function void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_payment payments%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Debes indicar un motivo de anulacion de al menos 5 caracteres.';
  end if;

  select * into v_payment from payments where id = p_payment_id for update;
  if not found then
    raise exception 'El pago no existe o no tienes acceso a el.';
  end if;

  -- BR-F10: el vendedor no puede anular pagos.
  if not is_org_staff(v_payment.organization_id) then
    raise exception 'No tienes permiso para anular pagos.'
      using errcode = 'insufficient_privilege';
  end if;

  -- D-013: la anulacion es irreversible; un pago anulado no se vuelve a tocar.
  if v_payment.voided_at is not null then
    raise exception 'El pago ya esta anulado.';
  end if;

  update payments
     set voided_at   = now(),
         voided_by   = v_uid,
         void_reason = btrim(p_reason)
   where id = p_payment_id;

  perform write_audit_log(
    v_payment.organization_id, 'payment.void', 'payment', p_payment_id,
    jsonb_build_object('voided_at', null),
    jsonb_build_object('voided_at', now(), 'voided_by', v_uid, 'void_reason', btrim(p_reason))
  );
end;
$$;

-- =============================================================================
-- Permisos de ejecucion (docs/SECURITY.md §4.5, regla 3)
-- =============================================================================
revoke execute on function require_auth() from public;
revoke execute on function assign_ticket(uuid, uuid, date) from public;
revoke execute on function approve_tickets(uuid[]) from public;
revoke execute on function cancel_ticket(uuid, text) from public;
revoke execute on function bulk_create_tickets(uuid, uuid, jsonb) from public;
revoke execute on function create_payment(uuid, bigint, jsonb, date, payment_method, text) from public;
revoke execute on function void_payment(uuid, text) from public;

grant execute on function assign_ticket(uuid, uuid, date) to authenticated;
grant execute on function approve_tickets(uuid[]) to authenticated;
grant execute on function cancel_ticket(uuid, text) to authenticated;
grant execute on function bulk_create_tickets(uuid, uuid, jsonb) to authenticated;
grant execute on function create_payment(uuid, bigint, jsonb, date, payment_method, text) to authenticated;
grant execute on function void_payment(uuid, text) to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function void_payment(uuid, text);
-- drop function create_payment(uuid, bigint, jsonb, date, payment_method, text);
-- drop function bulk_create_tickets(uuid, uuid, jsonb);
-- drop function cancel_ticket(uuid, text);
-- drop function approve_tickets(uuid[]);
-- drop function assign_ticket(uuid, uuid, date);
-- drop function require_auth();
-- =============================================================================
