-- =============================================================================
-- 0035_update_ticket_sale_price.sql
-- Corregir el precio de venta de una boleta ya asignada
--
-- Referencia: docs/BUSINESS_RULES.md BR-P13, D-137.
--
-- QUE HACE, Y QUE NO HACE
--
-- Durante la asignacion el vendedor ya puede rebajar `sale_price` (BR-P09).
-- Una vez asignada, no habia forma de corregir ese valor si se equivoco. Esta
-- funcion reescribe EL MISMO campo de LA MISMA boleta: no crea otra venta, no
-- cambia de cliente y no toca los abonos.
--
-- No hay ni una regla de dinero nueva. Despues del UPDATE corren solos:
--
--   * `payment_status`, columna generada (BR-F07);
--   * el CHECK `tickets_paid_amount_range` (BR-F12) — impide saldo negativo;
--   * `tickets_sync_commission` → `recalc_seller_commission` (BR-G01, BR-G06,
--     BR-G17) si el cambio hace que la boleta entre o salga de Pagada;
--   * `audit_tickets` → `ticket.update` con el precio anterior y el nuevo.
--
-- Lo que NO se toca: `raffles.ticket_price`, `base_price` ya congelado, otras
-- boletas, `payments`, `payment_allocations`, cliente, vendedor, fecha.
--
-- EL TECHO SIGUE SIENDO EL OFICIAL CONGELADO (BR-P11). Esto es para rebajar o
-- para deshacer una rebaja, no para recargar. El suelo es el mismo
-- `ticket_sale_price_limits` de la asignacion, y ademas no puede bajar de lo
-- ya abonado: no hay saldo a favor ni devolucion automatica.
--
-- EL DISPARADOR `tickets_protect_sale_price` SIGUE BLOQUEANDO EL UPDATE DIRECTO
-- cuando hay abonos. Solo esta funcion, SECURITY DEFINER, pone un GUC de
-- transaccion que el disparador reconoce. Un `UPDATE` por PostgREST —aunque lo
-- intente el personal, que SI tiene politica de UPDATE— sigue recibiendo el
-- mensaje de siempre (BR-P05).
-- =============================================================================

create or replace function tickets_protect_sale_price()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.sale_price is not distinct from old.sale_price then
    return new;
  end if;

  if old.paid_amount > 0 then
    -- Solo `update_ticket_sale_price` enciende este GUC, y solo dentro de su
    -- transaccion (`is_local = true`). Cualquier otro UPDATE —PostgREST,
    -- service role, un script— sigue bloqueado (BR-P05).
    if current_setting('rifas.allow_sale_price_edit', true) is distinct from '1' then
      raise exception 'No se puede cambiar el precio de una boleta con pagos registrados. Anula los pagos primero.'
        using errcode = 'check_violation';
    end if;

    if new.sale_price is null or new.sale_price < old.paid_amount then
      raise exception 'El precio de venta no puede ser menor que el total abonado de la boleta.';
    end if;
  end if;

  return new;
end;
$$;

comment on function tickets_protect_sale_price() is
  'Bloquea el UPDATE directo de sale_price con abonos (BR-P05). update_ticket_sale_price puede corregirlo si el nuevo precio no baja de lo abonado (BR-P13, D-137).';

-- =============================================================================
create function update_ticket_sale_price(
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

  -- Misma puerta que assign_ticket_row: personal de la organizacion o
  -- vendedor dueno de la boleta. El vendedor padre no entra: tampoco puede
  -- asignarla (D-092, D-134).
  if not is_org_staff(v_ticket.organization_id) and v_ticket.seller_id <> v_uid then
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

  -- Mismo valor: nada que escribir, nada que auditar. Cubre el doble clic
  -- que llega despues de que el primero ya guardo.
  if v_old = p_sale_price then
    return v_ticket.id;
  end if;

  select * into v_raffle from raffles where id = v_ticket.raffle_id;

  -- La asignacion exige rifa activa (BR-R08). Corregir el precio de una venta
  -- ya hecha reutiliza esa puerta: en una rifa cerrada o anulada no se toca.
  if v_raffle.status <> 'active' then
    raise exception 'La rifa no está activa. No se puede cambiar el precio de venta.';
  end if;

  -- El techo es el oficial CONGELADO en esta venta, no el precio vigente de
  -- la rifa (BR-P04, BR-P10, BR-P11). Una boleta anterior a 0028 no tiene
  -- `base_price`: su venta fue al precio que ya tiene, y eso se congela ahora
  -- para que una rebaja posterior reste de la ganancia como las demas.
  v_official := coalesce(v_ticket.base_price, v_ticket.sale_price);

  select l.min_sale_price into v_min from ticket_sale_price_limits(p_ticket_id) l;

  if p_sale_price > v_official then
    raise exception 'El precio de venta no puede ser mayor que el precio de la rifa (%). Puedes vender más barato, no más caro.',
      format_cop(v_official);
  end if;

  -- Lo abonado manda sobre el minimo de rebaja: bajar de lo cobrado inventaria
  -- un saldo a favor que este producto no tiene (BR-P13).
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

comment on function update_ticket_sale_price(uuid, bigint, bigint) is
  'Corrige el precio de venta de UNA boleta asignada. Recalculo, ganancia y bitacora salen de los disparadores vigentes. D-137, BR-P13.';

revoke execute on function update_ticket_sale_price(uuid, bigint, bigint) from public, anon;
grant execute on function update_ticket_sale_price(uuid, bigint, bigint) to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function update_ticket_sale_price(uuid, bigint, bigint);
-- -- Restaurar tickets_protect_sale_price al cuerpo de 0004 (bloquea cualquier
-- -- cambio de sale_price con paid_amount > 0, sin GUC).
-- =============================================================================
