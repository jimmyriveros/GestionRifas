-- =============================================================================
-- 0047_reassign_ticket_client.sql
-- Corregir el cliente de una boleta ya vendida
--
-- Referencia: docs/BUSINESS_RULES.md BR-I13, docs/DECISIONS.md D-168.
--
-- QUE HACE, Y QUE NO HACE
--
-- Una boleta se vendio y se le puso el cliente equivocado. Hasta hoy no habia
-- forma de corregirlo desde la aplicacion: `assign_ticket` solo admite boletas
-- `available`, y devolver la boleta a `available` para volver a venderla
-- simularia una venta nueva —fecha, precio, aviso al equipo—. Esta funcion
-- reescribe UN campo de UNA boleta: `tickets.client_id`.
--
-- NO toca: `seller_id`, `organization_id`, `raffle_id`, `daily_number`,
-- `weekly_number`, `inventory_status`, `sale_price`, `base_price`, `sale_date`,
-- `assigned_at`, `paid_amount`, ni los datos de creacion y aprobacion. No
-- vuelve a pasar por `assign_ticket_row` ni por `available`.
--
-- NO REPITE EL AVISO DE VENTA. `notify_ticket_sold` es un
-- `after update of inventory_status` que ademas exige la TRANSICION a
-- `assigned`: aqui `inventory_status` ni se menciona en el `set` ni cambia de
-- valor, asi que el aviso no se dispara. Es una correccion, no una venta nueva.
--
-- LO QUE SIGUE CORRIENDO SOLO, sin que esta funcion lo reimplemente:
--
--   * `tickets_protect_client_change` (BR-I12) — el disparador de 0004 sigue
--     puesto y sigue bloqueando el cambio con pagos ACTIVOS. Esta funcion es
--     mas estricta que el, no menos: exige CERO filas en `payment_allocations`.
--   * `audit_tickets` → `ticket.update` con el cliente anterior y el nuevo.
--     Se conserva, y ademas se escribe la entrada semantica
--     `ticket.reassign_client`, que es la que lleva el MOTIVO.
--   * `tickets_client_seller_fk`, la FK compuesta `(client_id, seller_id)`.
--     Por eso el cliente de destino tiene que ser del MISMO vendedor: no es una
--     preferencia, es el esquema (nota de BR-G07).
--
-- POR QUE «SIN NINGUNA FILA EN `payment_allocations`» Y NO «SIN PAGOS ACTIVOS»
--
-- BR-I12 habla de pagos activos porque protege el saldo. Aqui el criterio es
-- otro: el HISTORIAL. Un abono anulado (BR-F09) o corregido a $0 (BR-F17)
-- sigue existiendo, con su fecha y su importe, colgado de un cliente concreto.
-- Cambiar de cliente la boleta dejaria ese historial contando la vida de una
-- persona que nunca pago nada. Un pago no se puede mover; la boleta, mientras
-- nadie haya pagado por ella, si.
--
-- POR QUE TAMBIEN BLOQUEA `lottery_ticket_matches`
--
-- Una coincidencia es una FOTOGRAFIA inmutable del momento del sorteo (BR-L14):
-- guarda vendedor y cliente tal como estaban. Cambiar el cliente de la boleta
-- despues dejaria la foto y la boleta contando cosas distintas, y la foto no se
-- puede reescribir —`lottery_ticket_matches_immutable` lo impide—.
--
-- LA RIFA NO TIENE QUE ESTAR ACTIVA. Asignar exige rifa activa (BR-R08) porque
-- es un acto comercial. Esto es una correccion de identidad sobre una venta ya
-- hecha: si la rifa se cerro con el cliente equivocado escrito, prohibirlo
-- dejaria el error grabado para siempre. No mueve un peso: sin pagos, no hay
-- saldo, ni comision, ni cobranza que reordenar.
--
-- SOBRE LAS TILDES DE LOS MENSAJES. Tres frases se copian LITERALMENTE de
-- `assign_ticket_row` —cliente inexistente, archivado y de otro vendedor— y por
-- eso conservan su ortografia sin tildes: son las mismas reglas y tienen que
-- decir lo mismo en los dos caminos. Las frases NUEVAS si van acentuadas. La
-- deuda general de tildes en la base de datos es I-030 y se arregla entera de
-- una vez, no a trozos dentro de una migracion de otra cosa.
-- =============================================================================

create function reassign_ticket_client(
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
  -- El motivo es lo unico que la bitacora no puede deducir sola. Mismo minimo
  -- que el esquema Zod de la aplicacion; esta es la capa que manda.
  if length(v_reason) < 5 then
    raise exception 'Escribe el motivo de la corrección: al menos 5 caracteres.';
  end if;

  if p_new_client_id is null then
    raise exception 'Selecciona el cliente correcto.';
  end if;

  -- Con la fila bloqueada: entre que la pantalla se pinto y llega esta llamada,
  -- otra persona pudo cobrar la boleta o corregirla ya.
  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  -- Misma puerta que `assign_ticket_row` y `update_ticket_sale_price`: personal
  -- de la organizacion, o el vendedor dueno de la boleta. El vendedor padre no
  -- entra (D-092). Un id ajeno recibe el MISMO mensaje que uno inexistente: no
  -- se filtra que la boleta existe.
  if not is_org_staff(v_ticket.organization_id) and v_ticket.seller_id <> v_uid then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if v_ticket.inventory_status <> 'assigned' or v_ticket.client_id is null then
    raise exception 'Solo se puede cambiar el cliente de una boleta vendida.';
  end if;

  -- Bloqueo optimista: la pantalla dice a quien creia que pertenecia la boleta.
  -- Si ya no es ese, alguien corrigio antes y esta llamada pisaria su trabajo.
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

  -- BR-C05, y ademas `tickets_client_seller_fk`: la cartera es del vendedor.
  if v_client.seller_id <> v_ticket.seller_id then
    raise exception 'El cliente pertenece a otro vendedor.';
  end if;

  -- CUALQUIER fila, tambien la de un pago anulado o corregida a $0.
  if exists (select 1 from payment_allocations pa where pa.ticket_id = v_ticket.id) then
    raise exception 'Esta boleta tiene abonos en su historial y ya no puede cambiar de cliente.';
  end if;

  if exists (select 1 from lottery_ticket_matches m where m.ticket_id = v_ticket.id) then
    raise exception 'Esta boleta ya hace parte de un resultado registrado y no puede cambiar de cliente.';
  end if;

  -- UNA columna. `tickets_protect_client_change` valida este UPDATE como
  -- cualquier otro; no hay GUC que lo esquive porque no hace falta esquivarlo.
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

comment on function reassign_ticket_client(uuid, uuid, uuid, text) is
  'Corrige el cliente de UNA boleta vendida, dentro de la cartera de su mismo vendedor y solo si no tiene ninguna fila en payment_allocations ni en lottery_ticket_matches. Escribe ticket.reassign_client con el motivo. BR-I13, D-168.';

-- Regla 2 de docs/SECURITY.md §4.5. `service_role` se nombra a proposito: en
-- produccion lo hereda del privilegio por defecto y en local NO (D-128), y esa
-- divergencia es exactamente la que costo I-078 y obligo a la `0044`.
revoke execute on function reassign_ticket_client(uuid, uuid, uuid, text) from public, anon;
grant  execute on function reassign_ticket_client(uuid, uuid, uuid, text) to authenticated;
grant  execute on function reassign_ticket_client(uuid, uuid, uuid, text) to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function reassign_ticket_client(uuid, uuid, uuid, text);
--
-- No toca ni un dato: la funcion es la unica novedad. Los disparadores, las
-- politicas y los privilegios de 0004, 0005 y 0014 quedan como estaban.
-- =============================================================================
