-- =============================================================================
-- 0057_admin_portfolio_privacy.sql
-- La cartera es del vendedor: el personal deja de leer clientes, precios y cobros
--
-- Referencia normativa: docs/DECISIONS.md D-198, docs/BUSINESS_RULES.md §12.h
-- (BR-Q01..BR-Q10), docs/SECURITY.md §4.19.
--
-- QUE CAMBIA
--
-- Hasta aqui el Dueno y el Administrador leian FILAS COMPLETAS de toda la
-- organizacion en `tickets`, `clients`, `payments`, `payment_allocations`,
-- `audit_logs`, `lottery_ticket_matches`, `seller_commissions` y
-- `commission_ledger`. La RLS limita filas, no columnas: con esa lectura amplia
-- bastaba una sesion del personal y la clave publica para sacar por PostgREST
-- `client_id`, `sale_price`, `paid_amount`, los clientes y los pagos, pintara
-- lo que pintara la pantalla.
--
-- Desde esta migracion:
--
--   1. Esas politicas pierden la rama del personal. El vendedor conserva
--      exactamente la suya, con la misma expresion que ya tenia.
--   2. Lo que el portal administrativo si necesita llega por funciones
--      `SECURITY DEFINER` de lista blanca: el precedente es D-092, que hizo lo
--      mismo con las ventas del equipo en vez de ampliar `tickets_select`.
--      Ninguna recibe organizacion: sale de `current_staff_org_ids()`.
--   3. Las RPC que atendian al vendedor Y al personal quedan solo para el
--      vendedor. Su logica de negocio no cambia ni una linea mas.
--   4. Las RPC que eran solo del personal y ya no tienen sentido —anular un
--      pago, importar con clientes— dejan de ser ejecutables por
--      `authenticated`. Se conservan enteras para poder restaurarlas.
--   5. Los avisos `team.sale` que recibe el personal dejan de llevar el precio,
--      tambien los historicos; la bitacora se lee por una proyeccion redactada.
--
-- QUE NO CAMBIA
--
-- Ninguna tabla, columna, enumerado, disparador financiero ni restriccion. El
-- enumerado `ticket_payment_status` sigue teniendo sus tres valores y `partial`
-- sigue existiendo en la base: lo que ve el personal son DOS estados derivados
-- (`paid` / `unpaid`), calculados aqui y nunca guardados. Las cinco vistas
-- siguen siendo `security_invoker`: para el vendedor devuelven lo mismo; para
-- el personal, nada.
-- =============================================================================

-- =============================================================================
-- 1. Politicas: el personal deja de leer la cartera
-- =============================================================================

-- tickets ---------------------------------------------------------------------
drop policy tickets_select on tickets;
create policy tickets_select on tickets for select to authenticated
using (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
);

-- El personal sigue creando boletas sueltas (`/owner/tickets/new`), pero solo
-- SIN venta: una fila con cliente o precio seria una forma de probar si un
-- `client_id` existe (la FK compuesta se comprueba sin RLS).
drop policy tickets_insert_staff on tickets;
create policy tickets_insert_staff on tickets for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
  and inventory_status in ('draft', 'available')
  and client_id is null
  and sale_price is null
  and base_price is null
  and sale_date is null
  and assigned_at is null
);

-- Sin lectura, un UPDATE con filtro afectaria cero filas; sin filtro seria un
-- UPDATE a ciegas de la organizacion entera. Las ediciones del personal van por
-- `admin_update_ticket_numbers` y las RPC de lote.
drop policy tickets_update_staff on tickets;

-- clients ---------------------------------------------------------------------
drop policy clients_select on clients;
create policy clients_select on clients for select to authenticated
using (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
);

-- `has_org_role` se evalua sobre la fila que se inserta (D-049): impide que una
-- persona del personal abra una «cartera» propia con su perfil.
drop policy clients_insert on clients;
create policy clients_insert on clients for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
  and has_org_role(organization_id, array['seller']::app_role[])
);

drop policy clients_update on clients;
create policy clients_update on clients for update to authenticated
using (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
)
with check (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
);

-- payments y payment_allocations ------------------------------------------------
drop policy payments_select on payments;
create policy payments_select on payments for select to authenticated
using (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
);

drop policy payments_insert on payments;
create policy payments_insert on payments for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
  and voided_at is null
);

-- La anulacion era la unica escritura del personal sobre `payments` y va por
-- `void_payment`, que deja de ser ejecutable desde una sesion (seccion 3).
drop policy payments_update_staff on payments;

drop policy payment_allocations_select on payment_allocations;
create policy payment_allocations_select on payment_allocations for select to authenticated
using (
  exists (
    select 1 from payments p
    where p.id = payment_allocations.payment_id
      and p.organization_id in (select current_org_ids())
      and p.seller_id = (select current_profile_id())
  )
);

drop policy payment_allocations_insert on payment_allocations;
create policy payment_allocations_insert on payment_allocations for insert to authenticated
with check (
  exists (
    select 1 from payments p
    where p.id = payment_allocations.payment_id
      and p.organization_id in (select current_org_ids())
      and p.seller_id = (select current_profile_id())
      and p.voided_at is null
  )
);

-- audit_logs ------------------------------------------------------------------
-- Sin politica y con FORCE RLS: una sesion lee cero filas. El personal la
-- consulta por `admin_audit_log`, que redacta; `service_role` la conserva
-- entera para la auditoria interna.
drop policy audit_logs_select_staff on audit_logs;

-- lottery_ticket_matches ------------------------------------------------------
-- La fotografia guarda `client_id`. El personal ve las coincidencias por
-- `admin_lottery_matches`, sin cliente.
drop policy lottery_ticket_matches_select on lottery_ticket_matches;
create policy lottery_ticket_matches_select on lottery_ticket_matches
for select to authenticated
using (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
);

-- seller_commissions y commission_ledger ----------------------------------------
-- La ganancia deja de ser un total visible para el personal (alcance B de D-198)
-- y el ledger trae movimientos por boleta de los que se deducen las rebajas.
drop policy seller_commissions_select on seller_commissions;
create policy seller_commissions_select on seller_commissions for select to authenticated
using (
  organization_id in (select current_org_ids())
  and (
    seller_id = (select current_profile_id())
    or seller_id in (select current_team_seller_ids())
  )
);

drop policy commission_ledger_select on commission_ledger;
create policy commission_ledger_select on commission_ledger for select to authenticated
using (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
);

-- =============================================================================
-- 2. Las RPC compartidas quedan solo para el vendedor
--
-- Cada cuerpo es el vigente, copiado de su ultima migracion, con UN cambio: la
-- condicion `is_org_staff(...) or seller_id = uid` pasa a `seller_id = uid`. El
-- mensaje de rechazo es el mismo que el de un identificador inexistente, asi
-- que el personal no distingue «no existe» de «no es tuyo».
-- =============================================================================

-- assign_ticket_row (cuerpo de 0028) --------------------------------------------
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
  if v_ticket.seller_id <> v_uid then
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

-- bulk_assign_tickets (cuerpo de 0028) ------------------------------------------
create or replace function bulk_assign_tickets(
  p_ticket_ids uuid[],
  p_client_id  uuid,
  p_sale_date  date default null,
  p_sale_price bigint default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := require_auth();
  v_ids       uuid[] := lock_ticket_batch(p_ticket_ids);
  v_requested integer := array_length(v_ids, 1);
  v_eligible  integer;
  v_org       uuid;
  v_id        uuid;
begin
  -- D-198: solo las boletas del vendedor que llama.
  select count(*)::integer into v_eligible
  from tickets t
  join raffles r on r.id = t.raffle_id
  join clients c on c.id = p_client_id
  where t.id = any (v_ids)
    and t.seller_id = v_uid
    and t.inventory_status = 'available'
    and r.status = 'active'
    and c.organization_id = t.organization_id
    and c.seller_id = t.seller_id
    and c.archived_at is null;

  if v_eligible <> v_requested then
    raise exception 'No se realizó ningún cambio: % de las % boletas seleccionadas ya no se pueden asignar.',
      v_requested - v_eligible, v_requested;
  end if;

  foreach v_id in array v_ids loop
    perform assign_ticket_row(v_id, p_client_id, p_sale_date, p_sale_price);
  end loop;

  select organization_id into v_org from tickets where id = v_ids[1];

  perform write_audit_log(
    v_org, 'ticket.bulk_assign', 'client', p_client_id, null,
    jsonb_build_object('count', v_requested, 'ticket_ids', to_jsonb(v_ids),
                       'sale_date', p_sale_date, 'sale_price', p_sale_price)
  );

  return v_requested;
end;
$$;

-- create_payment (cuerpo de 0007) -----------------------------------------------
create or replace function create_payment(
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

  -- BR-F02 y D-198: el pago lo registra el vendedor dueno del cliente.
  if v_client.seller_id <> v_uid then
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
  -- Ordenadas por ticket_id: dos pagos concurrentes bloquean en el mismo orden.
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

    -- BR-F12: bloqueo de sobrepago con mensaje claro.
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

-- update_payment_allocation (cuerpo de 0042) ------------------------------------
create or replace function update_payment_allocation(
  p_payment_id      uuid,
  p_ticket_id       uuid,
  p_amount          bigint,
  p_expected_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid           uuid := require_auth();
  v_payment       payments%rowtype;
  v_alloc         payment_allocations%rowtype;
  v_ticket        tickets%rowtype;
  v_raffle_status raffle_status;
  v_old           bigint;
  v_new_total     bigint;
begin
  -- D-158: el cero SI se acepta aqui; el negativo no.
  if p_amount is null or p_expected_amount is null then
    raise exception 'Ingresa el valor del abono.';
  end if;

  if p_amount < 0 or p_expected_amount < 0 then
    raise exception 'El valor del abono no puede ser negativo.';
  end if;

  select * into v_payment from payments where id = p_payment_id for update;
  if not found then
    raise exception 'El pago no existe o no tienes acceso a él.';
  end if;

  -- D-198: solo el vendedor dueno del cliente. payments.seller_id =
  -- clients.seller_id por FK.
  if v_payment.seller_id <> v_uid then
    raise exception 'El pago no existe o no tienes acceso a él.';
  end if;

  -- D-013 / BR-F15: un pago anulado no se vuelve a tocar.
  if v_payment.voided_at is not null then
    raise exception 'El pago está anulado y no se puede modificar.';
  end if;

  select * into v_alloc
    from payment_allocations
   where payment_id = p_payment_id
     and ticket_id = p_ticket_id
   for update;

  if not found then
    raise exception 'Este abono no está aplicado a esa boleta.';
  end if;

  v_old := v_alloc.amount;

  if v_old is distinct from p_expected_amount then
    raise exception 'Este abono ya fue modificado. Recarga la pantalla y vuelve a intentar.';
  end if;

  if v_old = p_amount then
    return v_payment.id;
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Una de las boletas indicadas no existe.';
  end if;

  if v_ticket.client_id is distinct from v_payment.client_id then
    raise exception 'La boleta % no pertenece a este cliente.', v_ticket.internal_code;
  end if;

  if v_ticket.inventory_status <> 'assigned' then
    raise exception 'La boleta % no está asignada y no admite pagos.', v_ticket.internal_code;
  end if;

  -- BR-R09: en una rifa cerrada SI se puede cobrar (y por tanto corregir).
  select status into v_raffle_status from raffles where id = v_ticket.raffle_id;
  if v_raffle_status = 'cancelled' then
    raise exception 'La rifa está anulada. No se pueden registrar pagos.';
  end if;

  -- BR-F12: el tope es lo que cabe REEMPLAZANDO este valor.
  if v_ticket.paid_amount - v_old + p_amount > v_ticket.sale_price then
    raise exception 'El valor aplicado a la boleta % supera su saldo pendiente (%).',
      v_ticket.internal_code, v_ticket.sale_price - (v_ticket.paid_amount - v_old);
  end if;

  v_new_total := v_payment.total_amount - v_old + p_amount;

  update payment_allocations
     set amount = p_amount
   where id = v_alloc.id;

  update payments
     set total_amount = v_new_total
   where id = v_payment.id;

  perform write_audit_log(
    v_payment.organization_id,
    'payment.update',
    'payment',
    v_payment.id,
    jsonb_build_object(
      'ticket_id', p_ticket_id,
      'amount', v_old,
      'total_amount', v_payment.total_amount
    ),
    jsonb_build_object(
      'ticket_id', p_ticket_id,
      'amount', p_amount,
      'total_amount', v_new_total
    )
  );

  return v_payment.id;
end;
$$;

-- update_ticket_sale_price (cuerpo de 0035) -------------------------------------
create or replace function update_ticket_sale_price(
  p_ticket_id            uuid,
  p_sale_price           bigint,
  p_expected_sale_price  bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := require_auth();
  v_ticket    tickets%rowtype;
  v_raffle    raffles%rowtype;
  v_official  bigint;
  v_min       bigint;
  v_old       bigint;
begin
  if p_sale_price is null or p_sale_price <= 0 then
    raise exception 'El precio de venta debe ser mayor que cero.';
  end if;

  if p_expected_sale_price is null or p_expected_sale_price <= 0 then
    raise exception 'El precio de venta debe ser mayor que cero.';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  -- D-198: solo el vendedor dueno de la boleta. El vendedor padre tampoco
  -- entra (D-092, D-134).
  if v_ticket.seller_id <> v_uid then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if v_ticket.inventory_status <> 'assigned' then
    raise exception 'Solo se puede editar el precio de una boleta asignada.';
  end if;

  if v_ticket.sale_price is null then
    raise exception 'Solo se puede editar el precio de una boleta asignada.';
  end if;

  v_old := v_ticket.sale_price;

  if v_old is distinct from p_expected_sale_price then
    raise exception 'Esta boleta ya fue modificada. Recarga la pantalla y vuelve a intentar.';
  end if;

  if v_old = p_sale_price then
    return v_ticket.id;
  end if;

  select * into v_raffle from raffles where id = v_ticket.raffle_id;

  if v_raffle.status <> 'active' then
    raise exception 'La rifa no está activa. No se puede cambiar el precio de venta.';
  end if;

  v_official := coalesce(v_ticket.base_price, v_ticket.sale_price);

  select l.min_sale_price into v_min from ticket_sale_price_limits(p_ticket_id) l;

  if p_sale_price > v_official then
    raise exception 'El precio de venta no puede ser mayor que el precio de la rifa (%). Puedes vender más barato, no más caro.',
      format_cop(v_official);
  end if;

  if p_sale_price < v_ticket.paid_amount then
    raise exception 'El precio de venta no puede ser menor que el total abonado de la boleta.';
  end if;

  if p_sale_price < v_min then
    raise exception 'La rebaja es mayor de lo que puedes asumir. Para esta boleta puedes vender desde % hasta %.',
      format_cop(v_min), format_cop(v_official);
  end if;

  perform set_config('rifas.allow_sale_price_edit', '1', true);

  update tickets
     set sale_price = p_sale_price,
         base_price = coalesce(base_price, v_official)
   where id = p_ticket_id;

  perform write_audit_log(
    v_ticket.organization_id,
    'ticket.update_sale_price',
    'ticket',
    p_ticket_id,
    jsonb_build_object(
      'sale_price', v_old,
      'base_price', v_ticket.base_price,
      'paid_amount', v_ticket.paid_amount,
      'client_id', v_ticket.client_id,
      'seller_id', v_ticket.seller_id
    ),
    jsonb_build_object(
      'sale_price', p_sale_price,
      'base_price', coalesce(v_ticket.base_price, v_official),
      'paid_amount', v_ticket.paid_amount,
      'client_id', v_ticket.client_id,
      'seller_id', v_ticket.seller_id
    )
  );

  return v_ticket.id;
end;
$$;

-- reassign_ticket_client (cuerpo de 0047) ---------------------------------------
create or replace function reassign_ticket_client(
  p_ticket_id          uuid,
  p_expected_client_id uuid,
  p_new_client_id      uuid,
  p_reason             text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_ticket tickets%rowtype;
  v_client clients%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if length(v_reason) < 5 then
    raise exception 'Escribe el motivo de la corrección: al menos 5 caracteres.';
  end if;

  if p_new_client_id is null then
    raise exception 'Selecciona el cliente correcto.';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  -- D-198: solo el vendedor dueno de la boleta. Un id ajeno recibe el MISMO
  -- mensaje que uno inexistente.
  if v_ticket.seller_id <> v_uid then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if v_ticket.inventory_status <> 'assigned' or v_ticket.client_id is null then
    raise exception 'Solo se puede cambiar el cliente de una boleta vendida.';
  end if;

  if v_ticket.client_id is distinct from p_expected_client_id then
    raise exception 'Esta boleta ya cambió de cliente. Recarga la pantalla y vuelve a intentar.';
  end if;

  if p_new_client_id = v_ticket.client_id then
    raise exception 'Esta boleta ya es de ese cliente. Elige otro.';
  end if;

  select * into v_client from clients where id = p_new_client_id;
  if not found or v_client.organization_id <> v_ticket.organization_id then
    raise exception 'El cliente no existe o no pertenece a tu organizacion.';
  end if;

  if v_client.archived_at is not null then
    raise exception 'El cliente esta archivado. Restauralo antes de asignarle boletas.';
  end if;

  if v_client.seller_id <> v_ticket.seller_id then
    raise exception 'El cliente pertenece a otro vendedor.';
  end if;

  if exists (select 1 from payment_allocations pa where pa.ticket_id = v_ticket.id) then
    raise exception 'Esta boleta tiene abonos en su historial y ya no puede cambiar de cliente.';
  end if;

  if exists (select 1 from lottery_ticket_matches m where m.ticket_id = v_ticket.id) then
    raise exception 'Esta boleta ya hace parte de un resultado registrado y no puede cambiar de cliente.';
  end if;

  update tickets
     set client_id = p_new_client_id
   where id = p_ticket_id;

  perform write_audit_log(
    v_ticket.organization_id,
    'ticket.reassign_client',
    'ticket',
    p_ticket_id,
    jsonb_build_object(
      'client_id', v_ticket.client_id,
      'seller_id', v_ticket.seller_id,
      'inventory_status', v_ticket.inventory_status,
      'sale_price', v_ticket.sale_price,
      'sale_date', v_ticket.sale_date
    ),
    jsonb_build_object(
      'client_id', p_new_client_id,
      'seller_id', v_ticket.seller_id,
      'inventory_status', v_ticket.inventory_status,
      'sale_price', v_ticket.sale_price,
      'sale_date', v_ticket.sale_date,
      'reason', v_reason
    )
  );

  return v_ticket.id;
end;
$$;

-- release_ticket_client (cuerpo de 0048) ----------------------------------------
create or replace function release_ticket_client(
  p_ticket_id          uuid,
  p_expected_client_id uuid,
  p_reason             text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_ticket tickets%rowtype;
  v_raffle raffles%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if length(v_reason) < 5 then
    raise exception 'Escribe el motivo de la liberación: al menos 5 caracteres.';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  -- D-198: solo el vendedor dueno de la boleta.
  if v_ticket.seller_id <> v_uid then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if v_ticket.inventory_status <> 'assigned' or v_ticket.client_id is null then
    raise exception 'Solo se puede liberar una boleta vendida.';
  end if;

  if v_ticket.client_id is distinct from p_expected_client_id then
    raise exception 'Esta boleta ya cambió de cliente. Recarga la pantalla y vuelve a intentar.';
  end if;

  select * into v_raffle from raffles where id = v_ticket.raffle_id;
  if v_raffle.status <> 'active' then
    raise exception 'La rifa no está activa. No se pueden liberar boletas.';
  end if;

  if exists (select 1 from payment_allocations pa where pa.ticket_id = v_ticket.id) then
    raise exception 'Esta boleta tiene abonos en su historial y ya no puede liberarse.';
  end if;

  if exists (select 1 from lottery_ticket_matches m where m.ticket_id = v_ticket.id) then
    raise exception 'Esta boleta ya hace parte de un resultado registrado y no puede liberarse.';
  end if;

  update tickets
     set inventory_status = 'available',
         client_id        = null,
         sale_price       = null,
         base_price       = null,
         sale_date        = null,
         assigned_at      = null
   where id = p_ticket_id;

  perform write_audit_log(
    v_ticket.organization_id,
    'ticket.release_client',
    'ticket',
    p_ticket_id,
    jsonb_build_object(
      'client_id', v_ticket.client_id,
      'seller_id', v_ticket.seller_id,
      'inventory_status', v_ticket.inventory_status,
      'sale_price', v_ticket.sale_price,
      'base_price', v_ticket.base_price,
      'sale_date', v_ticket.sale_date,
      'assigned_at', v_ticket.assigned_at,
      'daily_number', v_ticket.daily_number,
      'weekly_number', v_ticket.weekly_number
    ),
    jsonb_build_object(
      'client_id', null,
      'seller_id', v_ticket.seller_id,
      'inventory_status', 'available',
      'sale_price', null,
      'base_price', null,
      'sale_date', null,
      'assigned_at', null,
      'daily_number', v_ticket.daily_number,
      'weekly_number', v_ticket.weekly_number,
      'reason', v_reason
    )
  );

  return v_ticket.id;
end;
$$;

-- ticket_sale_price_limits (cuerpo de 0028) -------------------------------------
-- Hasta aqui respondia por CUALQUIER boleta a cualquier sesion, de cualquier
-- organizacion: el minimo delata la ganancia minima de su vendedor. Ahora solo
-- responde al vendedor de la boleta, o a un proceso sin sesion (`service_role`).
-- Dentro de `assign_ticket_row` y `update_ticket_sale_price` la sesion es la de
-- quien llama, asi que esos caminos no cambian.
create or replace function ticket_sale_price_limits(p_ticket_id uuid)
returns table (base_price bigint, min_sale_price bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.ticket_price,
    greatest(
      r.ticket_price - commission_floor_rate(t.organization_id, t.raffle_id, t.seller_id),
      1
    )::bigint
  from tickets t
  join raffles r on r.id = t.raffle_id
  where t.id = p_ticket_id
    and (auth.uid() is null or t.seller_id = auth.uid())
$$;

-- =============================================================================
-- 3. Anular una boleta vendida deja de estar al alcance del personal
--
-- El rechazo «tiene pagos activos» es un canal lateral: sobre una boleta que el
-- personal ve como «Sin pagar», anularla con exito diria `unpaid` y fallar
-- diria `partial`. Con esta regla una boleta asignada se rechaza SIEMPRE, antes
-- de mirar ningun pago.
-- =============================================================================

-- cancel_ticket_row (cuerpo de 0020) --------------------------------------------
create or replace function cancel_ticket_row(p_ticket_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket tickets%rowtype;
begin
  perform require_auth();

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

  -- D-198: antes que los pagos, y para cualquier boleta vendida.
  if v_ticket.inventory_status = 'assigned' then
    raise exception 'Esta boleta ya está vendida y no se puede anular.';
  end if;

  -- BR-I11: con pagos activos, primero hay que anular los pagos. Sin venta no
  -- puede haberlos; se conserva como defensa.
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

-- bulk_cancel_tickets (cuerpo de 0020) ------------------------------------------
create or replace function bulk_cancel_tickets(p_ticket_ids uuid[], p_reason text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids       uuid[];
  v_requested integer;
  v_eligible  integer;
  v_org       uuid;
  v_id        uuid;
begin
  perform require_auth();

  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Debes indicar un motivo de al menos 5 caracteres.';
  end if;

  v_ids := lock_ticket_batch(p_ticket_ids);
  v_requested := array_length(v_ids, 1);

  -- D-198: una boleta vendida no se cuenta como anulable, y el mensaje no dice
  -- por que: no distingue una boleta con abonos de una sin ellos.
  select count(*)::integer into v_eligible
  from tickets t
  where t.id = any (v_ids)
    and is_org_staff(t.organization_id)
    and t.inventory_status not in ('assigned', 'cancelled')
    and not exists (
      select 1 from payment_allocations pa
      join payments p on p.id = pa.payment_id
      where pa.ticket_id = t.id and p.voided_at is null
    );

  if v_eligible <> v_requested then
    raise exception 'No se realizó ningún cambio: % de las % boletas seleccionadas ya no se pueden anular.',
      v_requested - v_eligible, v_requested;
  end if;

  foreach v_id in array v_ids loop
    perform cancel_ticket_row(v_id, p_reason);
  end loop;

  select organization_id into v_org from tickets where id = v_ids[1];

  perform write_audit_log(
    v_org, 'ticket.bulk_cancel', 'ticket', null, null,
    jsonb_build_object('count', v_requested, 'reason', btrim(p_reason),
                       'ticket_ids', to_jsonb(v_ids))
  );

  return v_requested;
end;
$$;

-- =============================================================================
-- 4. RPC del personal que dejan de ser ejecutables desde una sesion
--
-- Se conservan enteras. `service_role` se nombra por la misma razon que en 0047:
-- en produccion lo hereda del privilegio por defecto y en local no (D-128).
-- =============================================================================

-- Anular un pago exige verlo, y el personal ya no ve pagos. El vendedor sigue
-- sin poder anular (BR-F10); lo que conserva es corregir un abono a $0 (BR-F17).
revoke execute on function void_payment(uuid, text) from authenticated;
grant  execute on function void_payment(uuid, text) to service_role;

-- La importacion con clientes crea o reutiliza clientes de una cartera, asigna
-- y registra abonos: es administrar la cartera de otro. La del vendedor nunca
-- admitio clientes y no cambia.
revoke execute on function match_ticket_import_clients(uuid, uuid, jsonb) from authenticated;
revoke execute on function import_tickets_with_clients(uuid, uuid, jsonb) from authenticated;
grant  execute on function match_ticket_import_clients(uuid, uuid, jsonb) to service_role;
grant  execute on function import_tickets_with_clients(uuid, uuid, jsonb) to service_role;

-- =============================================================================
-- 5. Avisos de venta: el personal los recibe sin precio
-- =============================================================================

-- notify_ticket_sold (cuerpo de 0023) -------------------------------------------
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
    'weekly_number', new.weekly_number
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

-- Los historicos. El precio autoritativo sigue en `tickets.sale_price` y en
-- `audit_logs`; lo que se quita es una copia que ninguna pantalla pinto nunca.
update notifications n
   set data = n.data - 'sale_price'
 where n.kind = 'team.sale'
   and n.data ? 'sale_price'
   and exists (
     select 1 from memberships m
     where m.profile_id = n.recipient_profile_id
       and m.organization_id = n.organization_id
       and m.role in ('owner', 'admin')
   );

-- Y los de quien llegue al personal despues: un vendedor padre ascendido a
-- Administrador no se lleva los precios de su antiguo equipo.
create function memberships_redact_staff_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role in ('owner', 'admin') and old.role is distinct from new.role then
    update notifications n
       set data = n.data - 'sale_price'
     where n.recipient_profile_id = new.profile_id
       and n.organization_id = new.organization_id
       and n.kind = 'team.sale'
       and n.data ? 'sale_price';
  end if;
  return null;
end;
$$;

comment on function memberships_redact_staff_notifications() is
  'D-198: quien pasa a ser personal deja de guardar el precio en sus avisos team.sale.';

create trigger memberships_redact_staff_notifications
  after update of role on memberships
  for each row execute function memberships_redact_staff_notifications();

revoke execute on function memberships_redact_staff_notifications() from public, anon, authenticated;

-- =============================================================================
-- 6. Proyecciones del portal administrativo (lista blanca)
--
-- Reglas comunes, las de docs/SECURITY.md §4.5:
--   * `SECURITY DEFINER` porque la politica ya no deja leer la tabla;
--   * `search_path` fijo;
--   * la organizacion sale de `current_staff_org_ids()`, nunca de un parametro;
--   * quien no es personal activo recibe un conjunto vacio, igual que un id que
--     no existe: no hay forma de distinguir «no existe» de «no es tuyo».
--
-- NINGUNA devuelve cliente, `client_id`, precio, precio base, abonado, saldo,
-- porcentaje, asignaciones de pago ni el valor `partial`: el estado de pago
-- administrativo es `paid` o `unpaid`, y solo existe para una boleta asignada.
-- =============================================================================

-- admin_list_tickets: listado, busqueda, filtros, conteo y seleccion --------------
create function admin_list_tickets(
  p_search           text default null,
  p_raffle_id        uuid default null,
  p_seller_id        uuid default null,
  p_inventory_status ticket_inventory_status default null,
  p_payment_state    text default null,
  p_ticket_ids       uuid[] default null,
  p_limit            integer default 25,
  p_offset           integer default 0
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
begin
  if p_payment_state is not null and p_payment_state not in ('paid', 'unpaid') then
    raise exception 'El estado de pago no es válido.';
  end if;

  if coalesce(array_length(p_ticket_ids, 1), 0) > 1000 then
    raise exception 'No se pueden consultar más de 1.000 boletas a la vez.';
  end if;

  -- BR-N11 y D-198: el personal busca SOLO por numero. Un nombre, un telefono
  -- o un codigo interno no consultan nada y devuelven lo mismo que un numero
  -- que no existe.
  if v_search <> '' and v_search !~ '^[0-9]{1,4}$' then
    return;
  end if;

  -- El recuento va aparte y ANTES de paginar: cuenta exactamente el conjunto
  -- filtrado, y deja que la pagina use el indice de `created_at`.
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
     -- «Sin pagar» es `unpaid` O `partial`, y solo de boletas vendidas.
     and (p_payment_state is null
          or (t.inventory_status = 'assigned'
              and (case when t.payment_status = 'paid' then 'paid' else 'unpaid' end)
                  = p_payment_state));

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
    v_total
  from tickets t
  left join raffles r on r.id = t.raffle_id
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
  order by
    -- Sin busqueda, lo mas reciente primero (como `listTickets`). Con busqueda,
    -- la relevancia de `search_tickets`: el diario manda sobre el semanal.
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

comment on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer) is
  'D-198: boletas del personal con lista blanca. Sin cliente, precio, abonado ni saldo; estado de pago en dos valores (paid/unpaid) y solo para boletas asignadas. Busca unicamente por numero.';

-- admin_ticket_detail -----------------------------------------------------------
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
  clearance_delivered_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
    -- La fecha de venta solo de una boleta vendida HOY: en una anulada diria que
    -- alguna vez tuvo cliente.
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
    -- La fecha de una carga inicial es tecnica y no se ensena (D-170).
    case
      when t.inventory_status = 'assigned' and not t.clearance_receipt_assumed_delivered
        then t.clearance_receipt_delivered_at
    end
  from tickets t
  join raffles r on r.id = t.raffle_id
  where t.id = p_ticket_id
    and t.organization_id in (select current_staff_org_ids())
$$;

comment on function admin_ticket_detail(uuid) is
  'D-198: detalle administrativo de una boleta. Mismo contrato de lista blanca que admin_list_tickets; un id ajeno o inexistente devuelve cero filas.';

-- admin_ticket_bulk_eligibility -------------------------------------------------
-- Las reglas son las de las funciones `bulk_*` para el personal, escritas sobre
-- el estado de inventario. No devuelve si la boleta tiene cliente ni si tiene
-- abonos: la pantalla explica los rechazos sin nombrarlos.
create function admin_ticket_bulk_eligibility(p_ticket_ids uuid[])
returns table (
  ticket_id         uuid,
  daily_number      text,
  weekly_number     text,
  inventory_status  ticket_inventory_status,
  seller_id         uuid,
  raffle_id         uuid,
  raffle_active     boolean,
  can_approve       boolean,
  can_cancel        boolean,
  can_change_seller boolean,
  can_delete        boolean
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
    (t.inventory_status = 'pending_approval'),
    (t.inventory_status in ('draft', 'pending_approval', 'available')),
    (t.inventory_status in ('draft', 'pending_approval', 'available')),
    -- Igual que `bulk_delete_tickets`: nunca entro a la operacion.
    (t.inventory_status in ('draft', 'pending_approval', 'available')
     and t.client_id is null
     and t.sale_price is null
     and not exists (select 1 from payment_allocations pa where pa.ticket_id = t.id))
  from tickets t
  left join raffles r on r.id = t.raffle_id
  where t.id = any (p_ticket_ids)
    and t.organization_id in (select current_staff_org_ids());
end;
$$;

comment on function admin_ticket_bulk_eligibility(uuid[]) is
  'D-198: que acciones de lote admite cada boleta para el personal. Sin cliente, precio ni abonos.';

-- admin_update_ticket_numbers ---------------------------------------------------
-- Sustituye al UPDATE directo que hacia la aplicacion bajo `tickets_update_staff`.
create function admin_update_ticket_numbers(
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
  v_ticket tickets%rowtype;
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

  -- BR-N02, BR-N03: texto de 1 a 4 digitos, sin tocar los ceros de delante.
  if p_daily_number is null or p_weekly_number is null
     or p_daily_number !~ '^[0-9]{1,4}$' or p_weekly_number !~ '^[0-9]{1,4}$' then
    raise exception 'Cada número debe tener entre 1 y 4 dígitos, sin letras ni símbolos.';
  end if;

  -- CLAUDE.md 15: completar un borrador con sus dos numeros lo deja listo.
  update tickets
     set daily_number     = p_daily_number,
         weekly_number    = p_weekly_number,
         inventory_status = case
                              when inventory_status = 'draft' then 'available'::ticket_inventory_status
                              else inventory_status
                            end
   where id = p_ticket_id;
end;
$$;

comment on function admin_update_ticket_numbers(uuid, text, text) is
  'D-198: el personal corrige los numeros de una boleta no anulada. La auditoria la escribe audit_tickets.';

-- admin_ticket_inventory: recuentos por rifa y vendedor -------------------------
-- Alimenta el panel, «Vendedores», «Rifas» y los reportes del personal. Solo
-- recuentos: ningun importe (alcance B de D-198). `tickets_not_paid` es el
-- «Sin pagar» administrativo, `unpaid` + `partial`, de boletas vendidas.
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
  tickets_not_paid         bigint
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
    count(*) filter (where t.inventory_status = 'assigned' and t.payment_status <> 'paid')
  from tickets t
  where t.organization_id in (select current_staff_org_ids())
    and (p_raffle_id is null or t.raffle_id = p_raffle_id)
  group by t.raffle_id, t.seller_id
$$;

comment on function admin_ticket_inventory(uuid) is
  'D-198: recuentos de inventario y de pago administrativo (paid / not_paid) por rifa y vendedor. Ningun importe.';

-- admin_lottery_matches ---------------------------------------------------------
create function admin_lottery_matches(p_result_ids uuid[])
returns table (
  result_id         uuid,
  assignment_status lottery_assignment_status,
  matched_number    text,
  ticket_id         uuid,
  raffle_name       text,
  daily_number      text,
  weekly_number     text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_result_ids is null or array_length(p_result_ids, 1) is null then
    return;
  end if;

  if array_length(p_result_ids, 1) > 200 then
    raise exception 'No se pueden consultar tantos resultados a la vez.';
  end if;

  return query
  select
    m.result_id,
    m.assignment_status,
    m.matched_number,
    m.ticket_id,
    r.name,
    t.daily_number,
    t.weekly_number
  from lottery_ticket_matches m
  join raffles r on r.id = m.raffle_id
  join tickets t on t.id = m.ticket_id
  where m.result_id = any (p_result_ids)
    and m.organization_id in (select current_staff_org_ids());
end;
$$;

comment on function admin_lottery_matches(uuid[]) is
  'D-198: coincidencias de loteria para el personal, sin cliente.';

-- admin_audit_log: la bitacora, redactada ---------------------------------------
-- Entra solo lo que describe la operacion del personal —boletas, rifas, personas
-- y membresias— y de cada fila, solo claves de una lista blanca. Nunca entran
-- clientes, pagos, cuentas de cobro, recordatorios ni dispositivos, ni las
-- acciones que tratan de un cliente o de un precio.
create function admin_audit_redact(p_entity_type text, p_values jsonb)
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
             else array[]::text[]
           end
         )
      ),
      '{}'::jsonb
    )
  end
$$;

revoke execute on function admin_audit_redact(text, jsonb) from public, anon, authenticated;

create function admin_audit_log(
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
      and a.entity_type in ('ticket', 'raffle', 'membership', 'user')
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

comment on function admin_audit_log(text, uuid, integer, integer) is
  'D-198: bitacora del personal con lista blanca de entidades, acciones y claves. La completa sigue disponible para service_role.';

-- Privilegios de las proyecciones: ni PUBLIC ni anon; sesion y service_role.
revoke execute on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer) from public, anon;
revoke execute on function admin_ticket_detail(uuid) from public, anon;
revoke execute on function admin_ticket_bulk_eligibility(uuid[]) from public, anon;
revoke execute on function admin_update_ticket_numbers(uuid, text, text) from public, anon;
revoke execute on function admin_ticket_inventory(uuid) from public, anon;
revoke execute on function admin_lottery_matches(uuid[]) from public, anon;
revoke execute on function admin_audit_log(text, uuid, integer, integer) from public, anon;

grant execute on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer) to authenticated, service_role;
grant execute on function admin_ticket_detail(uuid) to authenticated, service_role;
grant execute on function admin_ticket_bulk_eligibility(uuid[]) to authenticated, service_role;
grant execute on function admin_update_ticket_numbers(uuid, text, text) to authenticated, service_role;
grant execute on function admin_ticket_inventory(uuid) to authenticated, service_role;
grant execute on function admin_lottery_matches(uuid[]) to authenticated, service_role;
grant execute on function admin_audit_log(text, uuid, integer, integer) to authenticated, service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable) — D-198, «Reactivar el acceso
-- administrativo»
--
-- Reactivar NO es revertir esta migracion a mano en produccion: exige una
-- migracion NUEVA, revisada y con pruebas, porque los avisos historicos ya no
-- guardan el precio y eso no vuelve. Lo que tendria que contener:
--
--   1. Politicas: volver a crear con la rama del personal, tal como quedaron en
--      0014 (tickets_select, tickets_insert_staff, tickets_update_staff,
--      clients_select/insert/update, payments_select/insert,
--      payments_update_staff, payment_allocations_select/insert), 0014
--      (audit_logs_select_staff), 0036 (lottery_ticket_matches_select) y 0024
--      (seller_commissions_select, commission_ledger_select).
--   2. Funciones compartidas: volver a ejecutar los cuerpos de 0028
--      (assign_ticket_row, bulk_assign_tickets, ticket_sale_price_limits), 0007
--      (create_payment), 0042 (update_payment_allocation), 0035
--      (update_ticket_sale_price), 0047 (reassign_ticket_client), 0048
--      (release_ticket_client) y 0020 (cancel_ticket_row, bulk_cancel_tickets)
--      como `create or replace`.
--   3. Privilegios: `grant execute ... to authenticated` sobre void_payment,
--      match_ticket_import_clients e import_tickets_with_clients.
--   4. Avisos: el cuerpo de notify_ticket_sold de 0032 (el ultimo antes de
--      esta migracion), y
--      `drop trigger memberships_redact_staff_notifications on memberships;
--       drop function memberships_redact_staff_notifications();`
--   5. Las proyecciones `admin_*` pueden quedarse: no conceden nada que las
--      politicas restauradas no concedan ya.
--
-- Y despues, en la aplicacion: rutas, navegacion, consultas y acciones del
-- portal administrativo (D-198 lista cuales) y las pruebas que hoy afirman lo
-- contrario.
-- =============================================================================
