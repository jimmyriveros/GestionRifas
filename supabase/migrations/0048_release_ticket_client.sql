-- =============================================================================
-- 0048_release_ticket_client.sql
-- Liberar una boleta vendida: el cliente desistio antes de abonar nada
--
-- Referencia: docs/BUSINESS_RULES.md BR-I14, docs/DECISIONS.md D-169.
--
-- QUE HACE, Y QUE NO HACE
--
-- Una boleta se vendio y el cliente se echo atras antes de pagar un peso.
-- Hasta hoy la unica salida era anularla —que la retira de circulacion para
-- siempre y quema sus dos numeros en la rifa (BR-N08)— o pedirle a alguien con
-- la clave de servicio un UPDATE a mano. Esta funcion deshace ESA venta y deja
-- la boleta otra vez en el inventario, con sus mismos numeros, lista para
-- venderse a otra persona.
--
-- Escribe exactamente seis columnas, todas de la venta que se esta deshaciendo:
--
--   inventory_status -> 'available'      client_id   -> null
--   sale_price       -> null             base_price  -> null
--   sale_date        -> null             assigned_at -> null
--
-- NO toca: `seller_id`, `organization_id`, `raffle_id`, `daily_number`,
-- `weekly_number`, `internal_code`, `paid_amount` (que ya vale 0), ni los datos
-- de creacion y aprobacion. La boleta sigue siendo del mismo vendedor y de la
-- misma rifa: liberar no es reasignar (BR-G07) ni eliminar (BR-B05).
--
-- LIBERAR NO ES ANULAR. `cancel_ticket` marca `cancelled`, escribe
-- `cancelled_at` y su motivo, y la combinacion de numeros queda reservada para
-- siempre. Esto es lo contrario: la boleta vuelve a `available` y su
-- combinacion sigue siendo la suya, porque nunca dejo de existir.
--
-- LA TRANSICION YA ERA LEGAL. `tickets_validate_status_transition` (0004)
-- admite `assigned -> available` desde la Fase 2 y la llama «reversion
-- administrativa»; lo que faltaba era el camino para ejecutarla. El disparador
-- sigue puesto y valida este UPDATE como cualquier otro, incluida su propia
-- comprobacion de pagos activos. Esta funcion es MAS estricta que el: exige
-- CERO filas en `payment_allocations`.
--
-- NO CREA NINGUN AVISO. `notify_ticket_sold` es un
-- `after update of inventory_status` que ademas exige la transicion A
-- `assigned`; aqui la transicion es la contraria, asi que no se dispara. Y
-- `tickets_sync_commission` si se dispara —escucha `inventory_status` y
-- `sale_price`—, pero `recalc_seller_commission` cuenta boletas
-- `payment_status = 'paid'`: una boleta sin un solo abono no contaba antes ni
-- cuenta despues, y el recuento no se mueve.
--
-- POR QUE «SIN NINGUNA FILA EN `payment_allocations`» Y NO «SIN SALDO»
--
-- Mismo criterio que BR-I13 y por la misma razon: `paid_amount` es el saldo
-- VIGENTE y vuelve a cero cuando el pago se anula (BR-F09) o cuando el abono se
-- corrige a $0 (BR-F17). La fila del historial se queda, con su fecha y su
-- importe, colgada de un cliente y de una boleta. Liberar la boleta dejaria ese
-- abono apuntando a una venta que ya no existe. Mientras nadie haya pagado
-- nunca por ella, no hay historia que romper.
--
-- POR QUE TAMBIEN BLOQUEA `lottery_ticket_matches`
--
-- Una coincidencia es una fotografia inmutable del momento del sorteo (BR-L14):
-- guarda vendedor, cliente y `inventory_status_at_draw`. Liberar la boleta
-- despues dejaria la foto diciendo «vendida a X» y la boleta diciendo
-- «disponible», y la foto no se puede reescribir.
--
-- LA RIFA SI TIENE QUE ESTAR ACTIVA, al reves que en `reassign_ticket_client`.
-- Corregir el cliente es reparar una identidad mal escrita; liberar devuelve
-- una boleta al INVENTARIO para volver a venderla, y eso es un acto comercial:
-- en una rifa cerrada dejaria disponible algo que ya no se puede vender (BR-R08).
-- Con la rifa cerrada la salida sigue siendo anular.
--
-- SOBRE LAS TILDES DE LOS MENSAJES. Las frases NUEVAS van acentuadas. La deuda
-- general de tildes en la base de datos es I-030 y se arregla entera de una vez,
-- no a trozos dentro de una migracion de otra cosa.
-- =============================================================================

create function release_ticket_client(
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
  -- El motivo es lo unico que la bitacora no puede deducir sola. Mismo minimo
  -- que el esquema Zod de la aplicacion; esta es la capa que manda.
  if length(v_reason) < 5 then
    raise exception 'Escribe el motivo de la liberación: al menos 5 caracteres.';
  end if;

  -- Con la fila bloqueada: entre que la pantalla se pinto y llega esta llamada,
  -- otra persona pudo cobrar la boleta, corregirle el cliente o liberarla ya.
  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  -- Misma puerta que `assign_ticket_row` y `reassign_ticket_client`: personal
  -- de la organizacion, o el vendedor dueno de la boleta. El vendedor padre no
  -- entra (D-092). Un id ajeno recibe el MISMO mensaje que uno inexistente: no
  -- se filtra que la boleta existe.
  if not is_org_staff(v_ticket.organization_id) and v_ticket.seller_id <> v_uid then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if v_ticket.inventory_status <> 'assigned' or v_ticket.client_id is null then
    raise exception 'Solo se puede liberar una boleta vendida.';
  end if;

  -- Bloqueo optimista: la pantalla dice a quien creia que pertenecia la boleta.
  -- Si ya no es ese, alguien la corrigio o la vendio otra vez despues de que se
  -- pintara, y esta llamada estaria deshaciendo una venta que nadie miro.
  if v_ticket.client_id is distinct from p_expected_client_id then
    raise exception 'Esta boleta ya cambió de cliente. Recarga la pantalla y vuelve a intentar.';
  end if;

  select * into v_raffle from raffles where id = v_ticket.raffle_id;
  if v_raffle.status <> 'active' then
    raise exception 'La rifa no está activa. No se pueden liberar boletas.';
  end if;

  -- CUALQUIER fila, tambien la de un pago anulado o corregida a $0.
  if exists (select 1 from payment_allocations pa where pa.ticket_id = v_ticket.id) then
    raise exception 'Esta boleta tiene abonos en su historial y ya no puede liberarse.';
  end if;

  if exists (select 1 from lottery_ticket_matches m where m.ticket_id = v_ticket.id) then
    raise exception 'Esta boleta ya hace parte de un resultado registrado y no puede liberarse.';
  end if;

  -- Una sola sentencia: los CHECK de la tabla miran la fila ENTERA ya
  -- actualizada, asi que `tickets_available_has_no_client` y
  -- `tickets_assigned_requires_sale` se cumplen los dos a la vez. Partirla en
  -- dos UPDATE dejaria un estado intermedio invalido.
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

comment on function release_ticket_client(uuid, uuid, text) is
  'Deshace la venta de UNA boleta que nadie ha abonado: la devuelve a available y borra cliente, precio, precio base, fecha de venta y assigned_at. Conserva vendedor, rifa, numeros, codigo interno y aprobacion. Exige rifa activa, cero filas en payment_allocations y cero en lottery_ticket_matches. Escribe ticket.release_client con el motivo. BR-I14, D-169.';

-- Regla 2 de docs/SECURITY.md §4.5. `service_role` se nombra a proposito: en
-- produccion lo hereda del privilegio por defecto y en local NO (D-128), y esa
-- divergencia es exactamente la que costo I-078 y obligo a la `0044`.
revoke execute on function release_ticket_client(uuid, uuid, text) from public, anon;
grant  execute on function release_ticket_client(uuid, uuid, text) to authenticated;
grant  execute on function release_ticket_client(uuid, uuid, text) to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function release_ticket_client(uuid, uuid, text);
--
-- No toca ni un dato: la funcion es la unica novedad. Los disparadores, las
-- politicas y los privilegios de 0004, 0005, 0014 y 0028 quedan como estaban.
-- Las boletas ya liberadas se quedan liberadas: son boletas `available`
-- normales, indistinguibles de las que nunca se vendieron salvo por su entrada
-- `ticket.release_client` en la bitacora.
-- =============================================================================
