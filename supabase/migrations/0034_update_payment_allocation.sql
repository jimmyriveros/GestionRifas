-- =============================================================================
-- 0034_update_payment_allocation.sql
-- Corregir el valor de un abono activo, sin crear otro ni anular el actual
--
-- Referencia: docs/BUSINESS_RULES.md BR-F16, D-134.
--
-- QUE HACE, Y QUE NO HACE
--
-- Un vendedor (o el personal) puede equivocarse al teclear el valor. Hasta
-- ahora la unica correccion era anular el pago —solo Owner/Admin— y registrar
-- uno nuevo. Eso cambia el historial que se le enseña al cliente. Esta funcion
-- corrige EL MISMO registro: la fila de `payment_allocations` y el
-- `total_amount` del pago, en una sola transaccion.
--
-- No hay ni una regla de dinero nueva. Despues del UPDATE corren solos:
--
--   * `payment_allocations_recalc` → `recalc_ticket_paid_amount` (BR-F07);
--   * el estado Sin pagar / Abonada / Pagada, columna generada (BR-F07);
--   * el CHECK `tickets_paid_amount_range` (BR-F12);
--   * el constraint diferido de cuadre pago ↔ asignaciones (BR-F05);
--   * `tickets_sync_commission` → `recalc_seller_commission` (BR-G01, BR-G06);
--   * la fila `payment.update` en la bitacora (BR-F14).
--
-- Lo que NO se toca: boleta, cliente, vendedor, fecha, metodo, notas, ni el
-- identificador del pago. Un pago anulado sigue siendo intocable (D-013,
-- BR-F15). No se concede UPDATE sobre `payment_allocations` a nadie: la
-- politica de 0005 sigue sin existir; solo esta funcion, SECURITY DEFINER,
-- escribe el importe.
--
-- CONCURRENCIA
--
-- Bloquea el pago, la asignacion y la boleta (FOR UPDATE), en ese orden. El
-- tope de sobrepago se calcula con el `paid_amount` ya bloqueado, restando el
-- valor viejo de ESTE abono para no contarlo dos veces. `p_expected_amount`
-- es el valor que la pantalla estaba mostrando: si otro cambio llego antes,
-- se rechaza en vez de pisarlo.
-- =============================================================================

create function update_payment_allocation(
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
  if p_amount is null or p_amount <= 0 then
    raise exception 'El valor del abono debe ser mayor que cero.';
  end if;

  if p_expected_amount is null or p_expected_amount <= 0 then
    raise exception 'El valor del abono debe ser mayor que cero.';
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
  -- este valor, no sumandolo otra vez (BR-F12).
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
  'Corrige el valor de UN abono activo (una asignacion). Recalculo, comision y bitacora salen de los disparadores vigentes. D-134, BR-F16.';

revoke execute on function update_payment_allocation(uuid, uuid, bigint, bigint) from public, anon;
grant execute on function update_payment_allocation(uuid, uuid, bigint, bigint) to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function update_payment_allocation(uuid, uuid, bigint, bigint);
-- =============================================================================
