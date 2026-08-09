-- =============================================================================
-- 0020_bulk_ticket_actions.sql
-- Acciones masivas sobre boletas: asignar, anular, cambiar vendedor y eliminar
--
-- Referencia normativa: docs/BUSINESS_RULES.md BR-B01..BR-B08,
-- docs/DECISIONS.md D-082, D-083, D-084.
--
-- PRINCIPIO
--
--   Una accion masiva usa LAS MISMAS reglas de dominio que la individual,
--   aplicadas de forma segura y transaccional a varias boletas.
--
-- Para que eso sea literal y no una intencion, las reglas de asignar y de
-- anular se EXTRAEN a dos funciones de una sola boleta —`assign_ticket_row` y
-- `cancel_ticket_row`, con el cuerpo exacto que tenian `assign_ticket` y
-- `cancel_ticket` en 0007, mensajes incluidos— y a partir de aqui:
--
--   * `assign_ticket` y `cancel_ticket` pasan a delegar en ellas. Su firma, su
--     resultado y sus mensajes no cambian: lo comprueban las pruebas de 0007
--     que ya existian.
--   * Las versiones masivas las llaman en bucle dentro de una sola transaccion.
--
-- Asi no hay dos copias de la regla que puedan separarse con el tiempo.
--
-- TODO O NADA (CLAUDE.md 18, seccion 28 del encargo)
--
-- Una funcion PL/pgSQL se ejecuta dentro de una unica transaccion: cualquier
-- `raise` deshace todo lo hecho antes. Las cuatro funciones masivas cuentan
-- primero cuantas boletas cumplen las condiciones y, si falta una sola, no
-- tocan ninguna. No existe la operacion parcial silenciosa.
--
-- CONCURRENCIA (seccion 34 del encargo)
--
-- Entre que alguien selecciona y confirma, otra persona puede haber cambiado
-- una boleta. Por eso el servidor NO confia en el estado que vio el navegador:
-- bloquea las filas (`for update`, en orden de id para no provocar interbloqueos
-- entre lotes simultaneos) y vuelve a comprobar todas las condiciones.
--
-- ELIMINAR (secciones 23 a 26 del encargo)
--
-- Es la unica novedad de reglas de esta migracion y se explica entera junto a
-- `bulk_delete_tickets`. Resumen: solo boletas que todavia NO han entrado al
-- flujo comercial, jamas una anulada, y siempre con motivo y bitacora.
--
-- El proyecto sigue sin conceder DELETE a nadie (D-038): ni politica ni
-- privilegio. El borrado ocurre unicamente dentro de esta funcion
-- SECURITY DEFINER, que es justo lo que D-038 pedia — "el borrado fisico exige
-- dos cambios deliberados y visibles".
-- =============================================================================

-- =============================================================================
-- 1. Reglas de UNA boleta, extraidas de 0007 sin cambiar una coma
-- =============================================================================

-- -----------------------------------------------------------------------------
-- assign_ticket_row — cuerpo original de assign_ticket (BR-I07, BR-P03)
-- -----------------------------------------------------------------------------
create function assign_ticket_row(
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

comment on function assign_ticket_row(uuid, uuid, date) is
  'Reglas de asignacion de UNA boleta (BR-I07, BR-P03). Cuerpo original de assign_ticket, ahora compartido por la asignacion individual y la masiva (D-082).';

-- -----------------------------------------------------------------------------
-- cancel_ticket_row — cuerpo original de cancel_ticket (BR-I10, BR-I11)
-- -----------------------------------------------------------------------------
create function cancel_ticket_row(p_ticket_id uuid, p_reason text)
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

comment on function cancel_ticket_row(uuid, text) is
  'Reglas de anulacion de UNA boleta (BR-I10, BR-I11). Cuerpo original de cancel_ticket, ahora compartido por la anulacion individual y la masiva (D-082).';

-- -----------------------------------------------------------------------------
-- Las funciones publicas de 0007 pasan a delegar. Misma firma, mismo resultado,
-- mismos mensajes: `create or replace` conserva ademas los privilegios.
-- -----------------------------------------------------------------------------
create or replace function assign_ticket(
  p_ticket_id uuid,
  p_client_id uuid,
  p_sale_date date default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform assign_ticket_row(p_ticket_id, p_client_id, p_sale_date);
end;
$$;

create or replace function cancel_ticket(p_ticket_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform cancel_ticket_row(p_ticket_id, p_reason);
end;
$$;

-- =============================================================================
-- 2. Elegibilidad: que puede hacerse con cada boleta seleccionada
--
-- Antes de ejecutar nada, la pantalla necesita saber que acciones valen para el
-- conjunto y, cuando alguna no vale, poder ensenar exactamente cuales estorban
-- (seccion 27 del encargo). Esta funcion responde eso y solo eso.
--
-- Es SECURITY INVOKER a proposito, como las de 0013 y 0018: solo LEE, y al
-- heredar los permisos de quien llama, `tickets_select` se aplica intacta. Un
-- vendedor recibe unicamente sus boletas; los ids que no pueda ver sencillamente
-- no vuelven, y la aplicacion lo detecta comparando cuantas pidio con cuantas
-- recibio. No hay que reproducir la RLS aqui, que es donde se cometen los
-- errores.
--
-- Los pagos de una boleta son siempre visibles para quien ve la boleta: un pago
-- registrado por un administrador para el cliente de un vendedor lleva a ese
-- vendedor en `payments.seller_id` (por eso existe la correccion I-015). Asi que
-- `has_active_payments` y `has_payments` son exactos para los dos roles.
--
-- Esto es para MOSTRAR. Quien decide de verdad son las funciones de abajo, que
-- vuelven a comprobarlo todo con la fila bloqueada.
-- =============================================================================
create function ticket_bulk_eligibility(p_ticket_ids uuid[])
returns table (
  ticket_id           uuid,
  daily_number        text,
  weekly_number       text,
  inventory_status    ticket_inventory_status,
  seller_id           uuid,
  raffle_id           uuid,
  has_client          boolean,
  has_active_payments boolean,
  has_payments        boolean,
  raffle_active       boolean,
  can_approve         boolean,
  can_assign          boolean,
  can_cancel          boolean,
  can_change_seller   boolean,
  can_delete          boolean
)
language plpgsql
stable
security invoker
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
  with base as (
    select
      t.id,
      t.daily_number,
      t.weekly_number,
      t.inventory_status,
      t.seller_id,
      t.raffle_id,
      t.client_id is not null as has_client,
      exists (
        select 1 from payment_allocations pa
        join payments p on p.id = pa.payment_id
        where pa.ticket_id = t.id and p.voided_at is null
      ) as has_active_payments,
      exists (
        select 1 from payment_allocations pa where pa.ticket_id = t.id
      ) as has_payments,
      coalesce(r.status = 'active', false) as raffle_active,
      t.sale_price is not null as was_sold
    from tickets t
    left join raffles r on r.id = t.raffle_id
    where t.id = any (p_ticket_ids)
  )
  select
    b.id,
    b.daily_number,
    b.weekly_number,
    b.inventory_status,
    b.seller_id,
    b.raffle_id,
    b.has_client,
    b.has_active_payments,
    b.has_payments,
    b.raffle_active,
    -- BR-I09: aprobar es pasar de pendiente a disponible. La aprobacion en
    -- lote ya existia desde la Fase 3 (`approve_tickets`); lo que se anade aqui
    -- es que comparta el mismo cuadro de elegibilidad que las demas.
    (b.inventory_status = 'pending_approval'),
    -- BR-I07: disponible y con la rifa activa.
    (b.inventory_status = 'available' and b.raffle_active),
    -- BR-I10/BR-I11: cualquier estado menos anulada, y sin pagos activos.
    (b.inventory_status <> 'cancelled' and not b.has_active_payments),
    -- BR-C05: una boleta vendida arrastra al cliente, que es del vendedor
    -- original; una anulada es historia y no se reasigna.
    (b.inventory_status not in ('assigned', 'cancelled')),
    -- BR-B05: solo lo que nunca entro al flujo comercial. Ver bulk_delete_tickets.
    (b.inventory_status in ('draft', 'pending_approval', 'available')
     and not b.has_client and not b.was_sold and not b.has_payments)
  from base b;
end;
$$;

comment on function ticket_bulk_eligibility(uuid[]) is
  'Que acciones masivas admite cada boleta de la lista y por que. SECURITY INVOKER: hereda tickets_select, asi que un vendedor solo recibe las suyas. Es para MOSTRAR; quien decide son las funciones bulk_* (D-082).';

-- =============================================================================
-- 3. Acciones masivas
--
-- Las cuatro comparten el mismo esqueleto:
--
--   1. Normalizar la entrada: sin nulos, sin repetidos, ordenada por id.
--   2. Bloquear las filas en ese orden (evita interbloqueos entre lotes).
--   3. Contar cuantas cumplen TODAS las condiciones.
--   4. Si falta una sola, `raise` -> la transaccion entera se deshace.
--   5. Aplicar y auditar el lote.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper interno: normaliza y bloquea. Devuelve los ids listos para trabajar.
--
-- No es SECURITY DEFINER por comodidad sino por necesidad: bloquea filas que la
-- RLS del vendedor podria ocultar. Quien puede hacer que con ellas lo deciden
-- las funciones que lo llaman, cada una con su regla.
-- -----------------------------------------------------------------------------
create function lock_ticket_batch(p_ticket_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
begin
  perform require_auth();

  if p_ticket_ids is null or array_length(p_ticket_ids, 1) is null then
    raise exception 'No se indicaron boletas.';
  end if;

  select array_agg(distinct x order by x) into v_ids
  from unnest(p_ticket_ids) as x
  where x is not null;

  if v_ids is null then
    raise exception 'No se indicaron boletas.';
  end if;

  if array_length(v_ids, 1) > 1000 then
    raise exception 'No se pueden procesar más de 1.000 boletas a la vez.';
  end if;

  -- El orden importa: dos lotes simultaneos que se solapen bloquean las filas
  -- comunes en la misma secuencia y por tanto no pueden quedarse esperandose.
  perform 1 from tickets where id = any (v_ids) order by id for update;

  return v_ids;
end;
$$;

comment on function lock_ticket_batch(uuid[]) is
  'Normaliza (sin nulos ni repetidos), acota a 1.000 y bloquea las filas en orden de id. Uso interno de las funciones bulk_* (D-082).';

-- -----------------------------------------------------------------------------
-- bulk_assign_tickets — vender varias boletas al mismo cliente de una vez
--
-- Caso real: un cliente compra seis boletas en la misma operacion. Antes habia
-- que repetir el dialogo seis veces, y las seis eran seis transacciones
-- independientes: si la cuarta fallaba, tres quedaban vendidas.
--
-- Aqui la comprobacion previa da el mensaje agregado que la pantalla necesita
-- ("2 boletas ya no estan disponibles") y el bucle sobre `assign_ticket_row`
-- es el que manda: si algo se escapo a la comprobacion, su `raise` deshace
-- todo igual.
-- -----------------------------------------------------------------------------
create function bulk_assign_tickets(
  p_ticket_ids uuid[],
  p_client_id  uuid,
  p_sale_date  date default null
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
  select count(*)::integer into v_eligible
  from tickets t
  join raffles r on r.id = t.raffle_id
  join clients c on c.id = p_client_id
  where t.id = any (v_ids)
    and (is_org_staff(t.organization_id) or t.seller_id = v_uid)
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
    perform assign_ticket_row(v_id, p_client_id, p_sale_date);
  end loop;

  select organization_id into v_org from tickets where id = v_ids[1];

  perform write_audit_log(
    v_org, 'ticket.bulk_assign', 'client', p_client_id, null,
    jsonb_build_object('count', v_requested, 'ticket_ids', to_jsonb(v_ids),
                       'sale_date', p_sale_date)
  );

  return v_requested;
end;
$$;

comment on function bulk_assign_tickets(uuid[], uuid, date) is
  'Asigna varias boletas al mismo cliente en una sola transaccion. Todo o nada. Reutiliza assign_ticket_row, asi que aplica exactamente las reglas de la asignacion individual (BR-B02).';

-- -----------------------------------------------------------------------------
-- bulk_cancel_tickets — anular varias boletas con un unico motivo
-- -----------------------------------------------------------------------------
create function bulk_cancel_tickets(p_ticket_ids uuid[], p_reason text)
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

  select count(*)::integer into v_eligible
  from tickets t
  where t.id = any (v_ids)
    and is_org_staff(t.organization_id)
    and t.inventory_status <> 'cancelled'
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

comment on function bulk_cancel_tickets(uuid[], text) is
  'Anula varias boletas con un unico motivo, en una sola transaccion. Todo o nada. Reutiliza cancel_ticket_row (BR-B03).';

-- -----------------------------------------------------------------------------
-- bulk_change_ticket_seller — pasar varias boletas a otro vendedor
--
-- Mismas condiciones que el cambio individual, que hasta ahora vivia en la
-- Server Action: ni asignada ni anulada (BR-C05: una boleta vendida arrastra al
-- cliente, que pertenece al vendedor original). El destino tiene que ser un
-- vendedor ACTIVO de la misma organizacion; el trigger
-- `tickets_enforce_seller_role` (0004) lo impondria igual, pero comprobarlo aqui
-- permite decirlo con palabras en vez de con un error de restriccion.
-- -----------------------------------------------------------------------------
create function bulk_change_ticket_seller(p_ticket_ids uuid[], p_seller_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids       uuid[] := lock_ticket_batch(p_ticket_ids);
  v_requested integer := array_length(v_ids, 1);
  v_eligible  integer;
  v_org       uuid;
begin
  -- Todas las boletas del lote son de la misma organizacion: la seleccion nace
  -- de una lista que ya esta acotada por la sesion. Si llegara un id ajeno, el
  -- `is_org_staff` de abajo lo deja fuera del recuento y nada se ejecuta.
  select organization_id into v_org from tickets where id = v_ids[1];
  if v_org is null then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if not is_org_staff(v_org) then
    raise exception 'No tienes permiso para cambiar el vendedor de estas boletas.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from memberships m
    where m.profile_id = p_seller_id
      and m.organization_id = v_org
      and m.role = 'seller'
      and m.is_active
  ) then
    raise exception 'El vendedor indicado no es un vendedor activo de la organizacion.';
  end if;

  select count(*)::integer into v_eligible
  from tickets t
  where t.id = any (v_ids)
    and is_org_staff(t.organization_id)
    and t.inventory_status not in ('assigned', 'cancelled');

  if v_eligible <> v_requested then
    raise exception 'No se realizó ningún cambio: % de las % boletas seleccionadas ya no pueden cambiar de vendedor.',
      v_requested - v_eligible, v_requested;
  end if;

  -- Un solo UPDATE para todo el lote: el trigger de auditoria de 0006 deja el
  -- detalle de cada boleta (`ticket.update` con el seller_id viejo y el nuevo).
  update tickets
     set seller_id = p_seller_id
   where id = any (v_ids)
     and seller_id <> p_seller_id;

  perform write_audit_log(
    v_org, 'ticket.bulk_change_seller', 'ticket', null, null,
    jsonb_build_object('count', v_requested, 'seller_id', p_seller_id,
                       'ticket_ids', to_jsonb(v_ids))
  );

  return v_requested;
end;
$$;

comment on function bulk_change_ticket_seller(uuid[], uuid) is
  'Pasa varias boletas a otro vendedor en una sola transaccion. Todo o nada. Ni asignadas ni anuladas; el destino debe ser vendedor activo de la organizacion (BR-B04).';

-- -----------------------------------------------------------------------------
-- bulk_delete_tickets — BORRADO FISICO de boletas cargadas por error
--
-- QUE ES Y QUE NO ES
--
-- No es una forma rapida de anular. Anular retira de circulacion una boleta que
-- EXISTIO: conserva sus numeros, su historia y su combinacion reservada.
-- Eliminar es para lo contrario: registros que nunca debieron existir —una
-- importacion equivocada, el archivo que no era, numeros tecleados por error—.
--
-- CONDICIONES (BR-B05). Se elimina solo si la boleta no ha entrado al flujo
-- comercial:
--
--   * Estado `draft`, `pending_approval` o `available`.
--   * Sin cliente.
--   * Sin `sale_price`: nunca se vendio.
--   * Sin ninguna asignacion de pago, ni siquiera de un pago anulado.
--
-- UNA BOLETA ANULADA NO SE ELIMINA, y no por prudencia sino por BR-N08: en este
-- MVP la combinacion de una boleta anulada NO puede reutilizarse dentro de la
-- misma rifa. Borrar la fila liberaria la combinacion y romperia esa regla en
-- silencio. Anular es definitivo tambien en este sentido.
--
-- La base de datos lo defiende ademas por su cuenta: `alloc_ticket_client_fk`
-- es `on delete restrict`, de modo que una boleta con pagos no se puede borrar
-- aunque esta funcion se equivocara.
--
-- RASTRO (seccion 26 del encargo)
--
-- Aunque la fila desaparezca, la evidencia administrativa se queda:
--
--   * El trigger `audit_tickets` de 0006 escribe un `ticket.delete` POR BOLETA
--     con la fila entera en `old_values`: organizacion, rifa, vendedor, id,
--     numero diario, numero semanal, estado y fechas.
--   * Esta funcion anade una fila `ticket.bulk_delete` con el hecho
--     administrativo: cuantas, cuales y con que motivo.
--
-- Nunca se guarda nada que sirva para autenticarse: aqui no se maneja ninguna
-- credencial.
-- -----------------------------------------------------------------------------
create function bulk_delete_tickets(p_ticket_ids uuid[], p_reason text)
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
  v_deleted   integer;
  v_detail    jsonb;
begin
  perform require_auth();

  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'Debes indicar un motivo de al menos 5 caracteres.';
  end if;

  v_ids := lock_ticket_batch(p_ticket_ids);
  v_requested := array_length(v_ids, 1);

  select count(*)::integer into v_eligible
  from tickets t
  where t.id = any (v_ids)
    and is_org_staff(t.organization_id)
    and t.inventory_status in ('draft', 'pending_approval', 'available')
    and t.client_id is null
    and t.sale_price is null
    and not exists (select 1 from payment_allocations pa where pa.ticket_id = t.id);

  if v_eligible <> v_requested then
    raise exception 'No se realizó ningún cambio: % de las % boletas seleccionadas no se pueden eliminar.',
      v_requested - v_eligible, v_requested;
  end if;

  select t.organization_id into v_org from tickets t where t.id = v_ids[1];

  -- El detalle se toma ANTES de borrar: despues ya no habria de donde sacarlo.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',            t.id,
           'raffle_id',     t.raffle_id,
           'seller_id',     t.seller_id,
           'daily_number',  t.daily_number,
           'weekly_number', t.weekly_number
         ) order by t.internal_code), '[]'::jsonb)
    into v_detail
  from tickets t
  where t.id = any (v_ids);

  delete from tickets where id = any (v_ids);
  get diagnostics v_deleted = row_count;

  perform write_audit_log(
    v_org, 'ticket.bulk_delete', 'ticket', null,
    jsonb_build_object('tickets', v_detail),
    jsonb_build_object('count', v_deleted, 'reason', btrim(p_reason))
  );

  return v_deleted;
end;
$$;

comment on function bulk_delete_tickets(uuid[], text) is
  'Borrado FISICO de boletas cargadas por error: solo draft/pending_approval/available, sin cliente, sin precio de venta y sin pagos. Nunca una anulada (BR-N08). Todo o nada, con motivo obligatorio y bitacora (BR-B05).';

-- =============================================================================
-- Privilegios (regla 3 de docs/SECURITY.md 4.5)
--
-- PostgreSQL concede EXECUTE a PUBLIC en toda funcion nueva y las default
-- privileges de 0015 no alcanzan a PUBLIC (I-020): se revoca explicitamente.
--
-- Los dos helpers (`*_row`, `lock_ticket_batch`) NO se conceden a nadie: son
-- piezas internas de las funciones publicas, que al ser SECURITY DEFINER las
-- ejecutan con el dueno. Dejarlos fuera reduce la superficie sin perder nada.
-- =============================================================================
revoke execute on function assign_ticket_row(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function cancel_ticket_row(uuid, text) from public, anon, authenticated;
revoke execute on function lock_ticket_batch(uuid[]) from public, anon, authenticated;

revoke execute on function ticket_bulk_eligibility(uuid[]) from public, anon;
revoke execute on function bulk_assign_tickets(uuid[], uuid, date) from public, anon;
revoke execute on function bulk_cancel_tickets(uuid[], text) from public, anon;
revoke execute on function bulk_change_ticket_seller(uuid[], uuid) from public, anon;
revoke execute on function bulk_delete_tickets(uuid[], text) from public, anon;

grant execute on function ticket_bulk_eligibility(uuid[]) to authenticated;
grant execute on function bulk_assign_tickets(uuid[], uuid, date) to authenticated;
grant execute on function bulk_cancel_tickets(uuid[], text) to authenticated;
grant execute on function bulk_change_ticket_seller(uuid[], uuid) to authenticated;
grant execute on function bulk_delete_tickets(uuid[], text) to authenticated;

-- -----------------------------------------------------------------------------
-- Indices: no hace falta ninguno nuevo.
--
-- Todo se busca por `tickets.id` (clave primaria) o por `payment_allocations
-- .ticket_id`, que ya tiene indice desde 0003. La resolucion de «seleccionar
-- todas las que coinciden» reutiliza las mismas consultas del listado, que la
-- Fase 7 dejo en pocos milisegundos (D-063).
-- -----------------------------------------------------------------------------

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   drop function bulk_delete_tickets(uuid[], text);
--   drop function bulk_change_ticket_seller(uuid[], uuid);
--   drop function bulk_cancel_tickets(uuid[], text);
--   drop function bulk_assign_tickets(uuid[], uuid, date);
--   drop function ticket_bulk_eligibility(uuid[]);
--   drop function lock_ticket_batch(uuid[]);
--   -- y volver a poner en assign_ticket / cancel_ticket el cuerpo de 0007
--   -- antes de borrar los dos helpers, porque delegan en ellos:
--   drop function cancel_ticket_row(uuid, text);
--   drop function assign_ticket_row(uuid, uuid, date);
--
-- Revertir deja la aplicacion sin acciones masivas. La asignacion y la
-- anulacion individuales siguen funcionando SOLO si antes se restituye el
-- cuerpo original de `assign_ticket` y `cancel_ticket`.
-- =============================================================================
