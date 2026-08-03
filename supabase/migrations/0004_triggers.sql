-- =============================================================================
-- 0004_triggers.sql
-- Fase 2 — Triggers de integridad y estados calculados
--
-- Referencia normativa: docs/DATA_MODEL.md §7, docs/BUSINESS_RULES.md.
--
-- Todas las funciones que escriben en OTRA tabla son SECURITY DEFINER con
-- search_path fijo: de lo contrario las politicas RLS del usuario que dispara
-- el trigger bloquearian la escritura interna (docs/SECURITY.md §6, requisito
-- explicito del prompt de la Fase 2: "evita politicas RLS que bloqueen los
-- triggers").
-- =============================================================================

-- =============================================================================
-- Generacion de codigos legibles
-- =============================================================================

-- raffles.short_code -> R001, R002, ... (unico por organizacion)
create function raffles_set_short_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counter int;
begin
  if new.short_code is not null and btrim(new.short_code) <> '' then
    return new;
  end if;

  -- UPDATE ... RETURNING toma un lock de fila: dos rifas creadas a la vez en la
  -- misma organizacion no pueden recibir el mismo codigo.
  update organizations
     set raffle_counter = raffle_counter + 1
   where id = new.organization_id
  returning raffle_counter into v_counter;

  if v_counter is null then
    raise exception 'La organizacion % no existe', new.organization_id
      using errcode = 'foreign_key_violation';
  end if;

  new.short_code := 'R' || lpad(v_counter::text, 3, '0');
  return new;
end;
$$;

create trigger raffles_set_short_code
  before insert on raffles
  for each row execute function raffles_set_short_code();

-- tickets.internal_code -> R001-000123 (unico por organizacion, D-014)
create function tickets_set_internal_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counter bigint;
  v_short_code text;
begin
  if new.internal_code is not null and btrim(new.internal_code) <> '' then
    return new;
  end if;

  update raffles
     set ticket_counter = ticket_counter + 1
   where id = new.raffle_id
  returning ticket_counter, short_code into v_counter, v_short_code;

  if v_counter is null then
    raise exception 'La rifa % no existe', new.raffle_id
      using errcode = 'foreign_key_violation';
  end if;

  new.internal_code := v_short_code || '-' || lpad(v_counter::text, 6, '0');
  return new;
end;
$$;

create trigger tickets_set_internal_code
  before insert on tickets
  for each row execute function tickets_set_internal_code();

comment on function tickets_set_internal_code() is
  'Genera internal_code fila por fila. La RPC bulk_create_tickets (0007) reserva el bloque completo de una vez para no hacer 1.000 updates secuenciales.';

-- =============================================================================
-- tickets: el vendedor debe ser un vendedor real de la organizacion
--
-- No se usa una FK con columna constante porque eso impediria cambiar el rol de
-- una persona que ya tiene boletas, un escenario legitimo del negocio (D-021).
-- =============================================================================
create function tickets_enforce_seller_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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

create trigger tickets_enforce_seller_role
  before insert or update of seller_id, organization_id on tickets
  for each row execute function tickets_enforce_seller_role();

-- =============================================================================
-- tickets: proteccion del precio de venta (BR-P05)
--
-- Con pagos activos, sale_price es inmutable: cambiarlo alteraria saldos ya
-- cobrados. Para corregirlo hay que anular los pagos primero.
-- =============================================================================
create function tickets_protect_sale_price()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Solo interviene si cambia el precio; deja pasar cualquier otro UPDATE
  -- (incluido el recalculo de paid_amount, que ocurre constantemente).
  if new.sale_price is not distinct from old.sale_price then
    return new;
  end if;

  if old.paid_amount > 0 then
    raise exception 'No se puede cambiar el precio de una boleta con pagos registrados. Anula los pagos primero.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger tickets_protect_sale_price
  before update of sale_price on tickets
  for each row execute function tickets_protect_sale_price();

-- =============================================================================
-- tickets: proteccion del cliente (BR-I12)
--
-- Una boleta con pagos activos no puede cambiar de cliente: los abonos quedarian
-- huerfanos o atribuidos a la persona equivocada.
-- =============================================================================
create function tickets_protect_client_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.client_id is not distinct from old.client_id then
    return new;
  end if;

  if exists (
    select 1
    from payment_allocations pa
    join payments p on p.id = pa.payment_id
    where pa.ticket_id = old.id
      and p.voided_at is null
  ) then
    raise exception 'No se puede cambiar el cliente de una boleta con pagos activos. Anula los pagos primero.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger tickets_protect_client_change
  before update of client_id on tickets
  for each row execute function tickets_protect_client_change();

-- =============================================================================
-- tickets: maquina de estados de inventario (BR-I01)
--
--   draft            -> available | pending_approval | cancelled
--   pending_approval -> available | cancelled
--   available        -> assigned  | cancelled
--   assigned         -> cancelled | available  (reversion administrativa)
--   cancelled        -> (estado final, sin salidas)
--
-- Ademas: una boleta con pagos activos no puede anularse ni desasignarse
-- (BR-I11); primero deben anularse los pagos.
-- =============================================================================
create function tickets_validate_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
begin
  if new.inventory_status = old.inventory_status then
    return new;
  end if;

  v_allowed := case old.inventory_status
    when 'draft'            then new.inventory_status in ('available', 'pending_approval', 'cancelled')
    when 'pending_approval' then new.inventory_status in ('available', 'cancelled')
    when 'available'        then new.inventory_status in ('assigned', 'cancelled')
    when 'assigned'         then new.inventory_status in ('cancelled', 'available')
    when 'cancelled'        then false
    else false
  end;

  if not v_allowed then
    raise exception 'Transicion de estado no permitida: % -> %', old.inventory_status, new.inventory_status
      using errcode = 'check_violation';
  end if;

  -- Salir de 'assigned' con pagos activos dejaria el dinero sin boleta.
  if old.inventory_status = 'assigned' and exists (
    select 1
    from payment_allocations pa
    join payments p on p.id = pa.payment_id
    where pa.ticket_id = old.id
      and p.voided_at is null
  ) then
    raise exception 'La boleta tiene pagos activos. Anula los pagos antes de cambiar su estado.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger tickets_validate_status_transition
  before update of inventory_status on tickets
  for each row execute function tickets_validate_status_transition();

-- =============================================================================
-- Recalculo de tickets.paid_amount (BR-F07, BR-F11)
--
-- Unica fuente de escritura de paid_amount. Suma las asignaciones de pagos NO
-- anulados. El CHECK tickets_paid_amount_range convierte cualquier sobrepago en
-- un error de base de datos, incluso bajo concurrencia.
-- =============================================================================
create function recalc_ticket_paid_amount(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Sentencia 1: serializa a los escritores concurrentes sobre esta boleta.
  perform 1 from tickets where id = p_ticket_id for update;

  -- Sentencia 2: en READ COMMITTED toma un snapshot NUEVO, por lo que ya ve las
  -- asignaciones que confirmo la transaccion que nos tenia bloqueados. Sin este
  -- par de pasos, dos abonos simultaneos podrian sumar por encima del precio.
  update tickets t
     set paid_amount = coalesce((
           select sum(pa.amount)
           from payment_allocations pa
           join payments p on p.id = pa.payment_id
           where pa.ticket_id = p_ticket_id
             and p.voided_at is null
         ), 0)
   where t.id = p_ticket_id;
end;
$$;

-- paid_amount es una columna DERIVADA: nadie puede escribirle un valor
-- arbitrario, ni siquiera con un UPDATE directo y permisos de escritura sobre
-- la fila. Solo se acepta exactamente el valor que resulta de los pagos no
-- anulados, asi que un vendedor no puede "declararse pagado" a si mismo.
create function tickets_guard_paid_amount()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected bigint;
begin
  if new.paid_amount is not distinct from old.paid_amount then
    return new;
  end if;

  select coalesce(sum(pa.amount), 0) into v_expected
    from payment_allocations pa
    join payments p on p.id = pa.payment_id
   where pa.ticket_id = old.id
     and p.voided_at is null;

  if new.paid_amount <> v_expected then
    raise exception 'paid_amount es una columna derivada de los pagos registrados; no se puede modificar directamente'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger tickets_guard_paid_amount
  before update of paid_amount on tickets
  for each row execute function tickets_guard_paid_amount();

create function payment_allocations_recalc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform recalc_ticket_paid_amount(old.ticket_id);
    return old;
  end if;

  perform recalc_ticket_paid_amount(new.ticket_id);

  -- Si la asignacion se movio de boleta, hay que recalcular tambien la anterior.
  if tg_op = 'UPDATE' and old.ticket_id is distinct from new.ticket_id then
    perform recalc_ticket_paid_amount(old.ticket_id);
  end if;

  return new;
end;
$$;

create trigger payment_allocations_recalc
  after insert or update or delete on payment_allocations
  for each row execute function payment_allocations_recalc();

-- Anular (o reactivar) un pago cambia el saldo de TODAS sus boletas
create function payments_recalc_on_void()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket_id uuid;
begin
  if new.voided_at is not distinct from old.voided_at then
    return new;
  end if;

  for v_ticket_id in
    select ticket_id from payment_allocations where payment_id = new.id order by ticket_id
  loop
    perform recalc_ticket_paid_amount(v_ticket_id);
  end loop;

  return new;
end;
$$;

create trigger payments_recalc_on_void
  after update of voided_at on payments
  for each row execute function payments_recalc_on_void();

-- =============================================================================
-- Cuadre pago <-> asignaciones (BR-F05)
--
-- SUM(payment_allocations.amount) = payments.total_amount, EXACTO.
--
-- No puede expresarse como CHECK de fila. Se usa un CONSTRAINT TRIGGER
-- DEFERRABLE INITIALLY DEFERRED: se evalua al CONFIRMAR la transaccion, lo que
-- permite insertar el pago y sus asignaciones en cualquier orden, pero impide
-- confirmar un estado descuadrado (D-012).
-- =============================================================================
create function check_payment_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_id uuid;
  v_total bigint;
  v_sum bigint;
begin
  if tg_table_name = 'payments' then
    v_payment_id := new.id;
  elsif tg_op = 'DELETE' then
    v_payment_id := old.payment_id;
  else
    v_payment_id := new.payment_id;
  end if;

  select total_amount into v_total from payments where id = v_payment_id;

  -- El pago ya no existe (solo posible si se borro en la misma transaccion):
  -- nada que cuadrar.
  if v_total is null then
    return null;
  end if;

  select coalesce(sum(amount), 0) into v_sum
    from payment_allocations
   where payment_id = v_payment_id;

  if v_sum <> v_total then
    raise exception 'El pago no cuadra: la suma de las asignaciones (%) debe ser igual al total (%)', v_sum, v_total
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create constraint trigger payments_balance_check
  after insert or update of total_amount on payments
  deferrable initially deferred
  for each row execute function check_payment_balance();

create constraint trigger payment_allocations_balance_check
  after insert or update or delete on payment_allocations
  deferrable initially deferred
  for each row execute function check_payment_balance();

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop trigger payment_allocations_balance_check on payment_allocations;
-- drop trigger payments_balance_check on payments;
-- drop function check_payment_balance();
-- drop trigger payments_recalc_on_void on payments;
-- drop function payments_recalc_on_void();
-- drop trigger payment_allocations_recalc on payment_allocations;
-- drop function payment_allocations_recalc();
-- drop function recalc_ticket_paid_amount(uuid);
-- drop trigger tickets_validate_status_transition on tickets;
-- drop function tickets_validate_status_transition();
-- drop trigger tickets_protect_client_change on tickets;
-- drop function tickets_protect_client_change();
-- drop trigger tickets_protect_sale_price on tickets;
-- drop function tickets_protect_sale_price();
-- drop trigger tickets_enforce_seller_role on tickets;
-- drop function tickets_enforce_seller_role();
-- drop trigger tickets_set_internal_code on tickets;
-- drop function tickets_set_internal_code();
-- drop trigger raffles_set_short_code on raffles;
-- drop function raffles_set_short_code();
-- =============================================================================
