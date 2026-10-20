-- =============================================================================
-- 0082 — Una boleta vendida desde un apartado vuelve al inventario comun al
--        liberarse (D-258; I-209, decision del dueño del 2026-10-19)
--
-- QUE CAMBIA. Hasta aqui, liberar una venta (BR-I14) dejaba la boleta
-- disponible CON su vendedor, viniera de donde viniera. Para una boleta que el
-- vendedor tomo del inventario comun con un apartado (D-257), eso la dejaba a su
-- cargo para siempre, sin vencimiento ni cupo: un apartado que no vencia nunca.
-- Desde esta migracion, si la venta VIGENTE salio de un apartado, liberarla
-- devuelve la boleta al inventario comun, libre para cualquier vendedor —tambien
-- para el mismo—. Una boleta que el personal entrego (BR-I18) o que el vendedor
-- creo se sigue quedando con su vendedor al liberarla, como siempre.
--
-- COMO SE SABE. `tickets.sold_from_hold`: la venta vigente salio de un apartado.
-- La pone `sell_ticket_hold` en la misma transaccion de la venta y la quita la
-- liberacion. Corregir el cliente (BR-I13) o el precio no la tocan: siguen
-- siendo la misma venta. Ninguna sesion la puede escribir: la protege
-- `tickets_guard_inventory`, como al vendedor nulo y a la generacion.
--
-- ORDEN. Las funciones primero —crearlas no bloquea ninguna tabla, y `plpgsql`
-- no exige que la columna exista hasta ejecutarse—; el ALTER TABLE de
-- `tickets` y su disparador, AL FINAL y en un solo bloque `do`, para que el
-- cerrojo dure lo minimo (leccion de la 0080, D-241; y D-259). `create or
-- replace` conserva los privilegios de cada funcion: ninguna cambia de firma ni
-- de quien la ejecuta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La guarda: tampoco se escribe la marca de la venta (0081, seccion 5.2)
-- -----------------------------------------------------------------------------
create or replace function tickets_guard_inventory()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.seller_id is null and (tg_op = 'INSERT' or old.seller_id is not null) then
      raise exception 'Las boletas del inventario común se crean con el generador y se mueven con «Asignar a un vendedor» o «Recuperar».'
        using errcode = 'insufficient_privilege';
    end if;

    if new.generation_run_id is distinct from
       (case when tg_op = 'INSERT' then null else old.generation_run_id end) then
      raise exception 'La generación de una boleta la registra solo el generador.'
        using errcode = 'insufficient_privilege';
    end if;

    -- D-258: de donde salio la venta lo dice la venta, no una sesion.
    if new.sold_from_hold is distinct from
       (case when tg_op = 'INSERT' then false else old.sold_from_hold end) then
      raise exception 'De dónde salió la venta de una boleta lo registra solo la venta.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. La venta desde un apartado deja la marca (0081, seccion 8.10)
-- -----------------------------------------------------------------------------
create or replace function sell_ticket_hold(
  p_hold_id    uuid,
  p_client_id  uuid,
  p_sale_date  date default null,
  p_sale_price bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_hold   ticket_holds%rowtype;
  v_ticket tickets%rowtype;
begin
  select * into v_hold from ticket_holds h where h.id = p_hold_id;
  if not found or v_hold.seller_id <> v_uid
     or not has_org_role(v_hold.organization_id, array['seller']::app_role[]) then
    raise exception 'El apartado no existe o no es tuyo.';
  end if;

  select * into v_ticket from tickets t where t.id = v_hold.ticket_id for update;
  select * into v_hold from ticket_holds h where h.id = p_hold_id for update;

  if v_hold.ended_at is not null then
    if v_hold.end_reason = 'sold'
       and v_ticket.seller_id = v_uid
       and v_ticket.client_id = p_client_id
       and v_ticket.inventory_status = 'assigned' then
      return v_ticket.id;
    end if;
    raise exception 'Este apartado ya terminó. Si la boleta sigue libre, vuelve a apartarla para venderla.';
  end if;

  if v_hold.expires_at <= now() then
    raise exception 'El apartado de esta boleta venció. Si sigue libre, vuelve a apartarla para venderla.';
  end if;

  -- Mientras el apartado estuvo vigente nadie pudo tocar la boleta
  -- (tickets_guard_hold): sigue en el inventario comun y disponible.
  update ticket_holds h
     set ended_at = now(), end_reason = 'sold'
   where h.id = p_hold_id;

  update tickets t
     set seller_id = v_uid
   where t.id = v_hold.ticket_id;

  perform assign_ticket_row(v_hold.ticket_id, p_client_id, p_sale_date, p_sale_price);

  -- D-258: esta venta sale de un apartado; si se libera, la boleta vuelve al
  -- inventario comun en vez de quedarse con este vendedor. DESPUES de la venta:
  -- `tickets_sold_from_hold_is_a_sale` solo admite la marca en una vendida.
  update tickets t
     set sold_from_hold = true
   where t.id = v_hold.ticket_id;

  perform write_audit_log(
    v_hold.organization_id, 'ticket.hold_sell', 'ticket', v_hold.ticket_id, null,
    jsonb_build_object('hold_id', v_hold.id, 'client_id', p_client_id)
  );

  return v_hold.ticket_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Liberar (BR-I14, D-169; ultima version en la 0057, D-198)
--
-- Todo como en la 0057 salvo dos cosas:
--   * si la venta vigente salio de un apartado, la boleta vuelve al inventario
--     comun: sin vendedor, y la marca se quita en la misma escritura. El CHECK
--     del inventario comun exige justo lo que la liberacion ya borra —cliente,
--     precio, fechas— y `paid_amount = 0`, que ya garantizaba el historial de
--     abonos vacio;
--   * la comparacion del vendedor es `is distinct from`: con `<>`, una boleta
--     sin vendedor pasaba la puerta y la paraba la comprobacion siguiente.
-- -----------------------------------------------------------------------------
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
  v_uid       uuid := require_auth();
  v_ticket    tickets%rowtype;
  v_raffle    raffles%rowtype;
  v_reason    text := btrim(coalesce(p_reason, ''));
  v_to_common boolean;
begin
  if length(v_reason) < 5 then
    raise exception 'Escribe el motivo de la liberación: al menos 5 caracteres.';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  -- D-198: solo el vendedor dueno de la boleta.
  if v_ticket.seller_id is distinct from v_uid then
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

  v_to_common := v_ticket.sold_from_hold;

  update tickets
     set inventory_status = 'available',
         client_id        = null,
         sale_price       = null,
         base_price       = null,
         sale_date        = null,
         assigned_at      = null,
         seller_id        = case when v_to_common then null else seller_id end,
         sold_from_hold   = false
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
      'weekly_number', v_ticket.weekly_number,
      'sold_from_hold', v_ticket.sold_from_hold
    ),
    jsonb_build_object(
      'client_id', null,
      'seller_id', case when v_to_common then null else v_ticket.seller_id end,
      'inventory_status', 'available',
      'sale_price', null,
      'base_price', null,
      'sale_date', null,
      'assigned_at', null,
      'daily_number', v_ticket.daily_number,
      'weekly_number', v_ticket.weekly_number,
      'to_common_inventory', v_to_common,
      'reason', v_reason
    )
  );

  return v_ticket.id;
end;
$$;

-- =============================================================================
-- 4. La columna, su regla y el disparador (AL FINAL, en UNA sola sentencia)
--
-- En un bloque `do` por lo mismo que la seccion 10 de la 0081 (D-259): detras del
-- ALTER TABLE, cada sentencia suelta costaba una ida y vuelta de red con
-- `tickets` bajo ACCESS EXCLUSIVE (1,0 s ensayados con 94 ms de ida y vuelta).
-- =============================================================================

do $seccion4$
begin
  -- Columna con valor constante: en PostgreSQL 11 o posterior es solo metadatos,
  -- no reescribe la tabla.
  alter table tickets
    add column sold_from_hold boolean not null default false;

  -- Solo una venta vigente —o una boleta anulada, que conserva su historia— puede
  -- decir que salio de un apartado. Una disponible con la marca haria que una
  -- venta posterior, que no salio de un apartado, volviera al inventario comun.
  alter table tickets
    add constraint tickets_sold_from_hold_is_a_sale
    check (
      not sold_from_hold
      or (seller_id is not null and inventory_status in ('assigned', 'cancelled'))
    );

  comment on column tickets.sold_from_hold is
    'D-258 (I-209): la venta vigente salio de un apartado del inventario comun. La pone sell_ticket_hold y la quita release_ticket_client, que en ese caso devuelve la boleta al inventario comun. Ninguna sesion la escribe (tickets_guard_inventory).';

  -- La guarda ahora tambien mira la marca.
  drop trigger tickets_guard_inventory on tickets;
  create trigger tickets_guard_inventory
    before insert or update of seller_id, generation_run_id, sold_from_hold on tickets
    for each row execute function tickets_guard_inventory();
end
$seccion4$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA:
--   1. Volver a crear release_ticket_client como en la 0057 y sell_ticket_hold y
--      tickets_guard_inventory como en la 0081; recrear el disparador
--      tickets_guard_inventory con `update of seller_id, generation_run_id`.
--   2. alter table tickets drop constraint tickets_sold_from_hold_is_a_sale,
--      drop column sold_from_hold;
-- Las boletas que ya volvieron al inventario comun al liberarse se quedan ahi:
-- revertir no se las devuelve a nadie. La bitacora (`ticket.release_client`,
-- con `to_common_inventory`) dice cuales fueron.
-- =============================================================================
