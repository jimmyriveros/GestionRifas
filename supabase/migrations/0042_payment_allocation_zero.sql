-- =============================================================================
-- 0042_payment_allocation_zero.sql
-- Un abono vigente se puede CORREGIR a $0; crear uno de $0 sigue prohibido
--
-- Referencia: docs/BUSINESS_RULES.md BR-F03 y BR-F16, D-158.
--
-- POR QUE
--
-- Un vendedor aplico un abono a la boleta equivocada. Corregirlo a $0 —dejar
-- la boleta como si ese abono no se hubiera registrado— estaba prohibido en
-- las cuatro capas, asi que tuvo que dejarlo en $1: una cifra inventada que
-- ensucia el saldo, el historial que se le enseña al cliente y la cobranza.
--
-- QUE CAMBIA, Y QUE NO
--
-- Cambia UNA cosa: el limite inferior al CORREGIR una asignacion existente
-- pasa de `> 0` a `>= 0`. Todo lo demas de D-134 sigue igual —solo el valor,
-- misma puerta, `p_expected_amount`, pago anulado intocable, recalculo por los
-- disparadores de siempre—.
--
-- NO cambia el alta. `create_payment` sigue exigiendo `> 0` en el total y en
-- cada linea (0007), y aqui se añade un disparador BEFORE INSERT en las dos
-- tablas para que la base lo siga garantizando: `authenticated` tiene INSERT
-- sobre ambas (0010), asi que sin el, relajar el CHECK dejaria registrar un
-- pago de $0 por PostgREST. BR-F03 se conserva entera para el alta.
--
-- Los negativos siguen rechazados en las cuatro capas.
--
-- QUE PASA CON EL REGISTRO
--
-- Nada: la fila se queda. No se borra la asignacion ni se anula el pago —eso
-- es otra operacion, solo del personal y con motivo obligatorio (BR-F09,
-- BR-F10), e irreversible (D-013)—. El abono corregido a $0 sigue en el
-- historial y la bitacora guarda el valor anterior y el nuevo, como cualquier
-- otra correccion (`payment.update`, BR-F14).
--
-- Un pago cuyas asignaciones quedan todas en $0 tiene `total_amount = 0` y
-- sigue VIGENTE: cuadra (BR-F05), no suma nada a ningun saldo (BR-F07) y se
-- puede volver a subir. Eso es lo que lo diferencia de una anulacion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El limite de fila pasa a `>= 0` en las dos tablas
-- -----------------------------------------------------------------------------
alter table payment_allocations drop constraint payment_allocations_amount_check;
alter table payment_allocations add constraint payment_allocations_amount_not_negative
  check (amount >= 0);

alter table payments drop constraint payments_total_amount_check;
alter table payments add constraint payments_total_amount_not_negative
  check (total_amount >= 0);

comment on constraint payment_allocations_amount_not_negative on payment_allocations is
  'BR-F03: nunca negativo. El cero solo lo escribe update_payment_allocation al corregir (BR-F16, D-158); al insertar lo impide payment_allocations_insert_positive.';

comment on constraint payments_total_amount_not_negative on payments is
  'BR-F03: nunca negativo. El cero solo puede resultar de corregir sus asignaciones (BR-F16, D-158); al insertar lo impide payments_insert_positive.';

-- -----------------------------------------------------------------------------
-- 2. Al INSERTAR sigue siendo `> 0` (BR-F03)
--
-- Un CHECK no distingue INSERT de UPDATE, y esa distincion es justo lo que
-- pide la regla: registrar un abono de $0 no tiene sentido; corregir a $0 uno
-- que ya existe, si.
-- -----------------------------------------------------------------------------
create function payments_insert_positive()
returns trigger
language plpgsql
as $$
begin
  if new.total_amount <= 0 then
    raise exception 'El valor del pago debe ser mayor que cero.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function payment_allocations_insert_positive()
returns trigger
language plpgsql
as $$
begin
  if new.amount <= 0 then
    raise exception 'Cada valor aplicado debe ser mayor que cero.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger payments_insert_positive
  before insert on payments
  for each row execute function payments_insert_positive();

create trigger payment_allocations_insert_positive
  before insert on payment_allocations
  for each row execute function payment_allocations_insert_positive();

comment on function payments_insert_positive() is
  'BR-F03 en el alta: un pago nuevo nace con total mayor que cero. Corregirlo despues a cero es otra cosa (BR-F16, D-158).';
comment on function payment_allocations_insert_positive() is
  'BR-F03 en el alta: una asignacion nueva nace con importe mayor que cero. Corregirla despues a cero es otra cosa (BR-F16, D-158).';

-- I-078: ninguna funcion interna es ejecutable desde una sesion.
revoke execute on function payments_insert_positive() from public, anon, authenticated;
revoke execute on function payment_allocations_insert_positive() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. La correccion acepta cero
--
-- Misma firma y mismo cuerpo que 0034 salvo las guardas de entrada: PL/pgSQL
-- no admite parches parciales, asi que la funcion se reescribe entera.
-- -----------------------------------------------------------------------------
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
  -- D-158: el cero SI se acepta aqui —es como se deshace un abono aplicado a
  -- la boleta equivocada—. El negativo no, en esta ni en ninguna capa.
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

  -- Misma puerta que create_payment: personal de la organizacion o vendedor
  -- dueno del cliente. payments.seller_id = clients.seller_id por FK.
  if not is_org_staff(v_payment.organization_id) and v_payment.seller_id <> v_uid then
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

  -- Mismo valor: nada que escribir, nada que auditar. Cubre el doble clic
  -- que llega despues de que el primero ya guardo.
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

  -- BR-R09: en una rifa cerrada SI se puede cobrar (y por tanto corregir);
  -- en una anulada no.
  select status into v_raffle_status from raffles where id = v_ticket.raffle_id;
  if v_raffle_status = 'cancelled' then
    raise exception 'La rifa está anulada. No se pueden registrar pagos.';
  end if;

  -- paid_amount ya incluye este abono. El tope es lo que cabe REEMPLAZANDO
  -- este valor, no sumandolo otra vez (BR-F12). Bajar a cero nunca lo supera.
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

comment on function update_payment_allocation(uuid, uuid, bigint, bigint) is
  'Corrige el valor de UN abono activo (una asignacion), incluido bajarlo a cero. Recalculo, comision y bitacora salen de los disparadores vigentes. D-134, D-158, BR-F16.';

revoke execute on function update_payment_allocation(uuid, uuid, bigint, bigint) from public, anon;
grant execute on function update_payment_allocation(uuid, uuid, bigint, bigint) to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Solo es reversible si NINGUNA asignacion vale cero; con alguna en cero, el
-- CHECK antiguo no se puede volver a crear sin decidir antes que hacer con
-- esas filas.
--
-- drop trigger payment_allocations_insert_positive on payment_allocations;
-- drop trigger payments_insert_positive on payments;
-- drop function payment_allocations_insert_positive();
-- drop function payments_insert_positive();
-- alter table payment_allocations drop constraint payment_allocations_amount_not_negative;
-- alter table payment_allocations add constraint payment_allocations_amount_check check (amount > 0);
-- alter table payments drop constraint payments_total_amount_not_negative;
-- alter table payments add constraint payments_total_amount_check check (total_amount > 0);
-- -- y volver a aplicar el cuerpo de 0034.
-- =============================================================================
