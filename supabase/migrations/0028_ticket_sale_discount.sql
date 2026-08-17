-- =============================================================================
-- 0028_ticket_sale_discount.sql
-- El vendedor puede vender una boleta por debajo del precio oficial
--
-- Referencia: docs/BUSINESS_RULES.md BR-P09..BR-P12 y BR-G17..BR-G19,
--             docs/DECISIONS.md D-099.
--
-- LA REGLA, EN UNA LINEA
--
-- El vendedor decide vender mas barato; el descuento sale INTEGRO de su propia
-- comision, y lo que le corresponde a la empresa no se mueve ni un peso.
--
-- QUE YA EXISTIA Y NO SE TOCA
--
-- Casi todo. `tickets.sale_price` ya era «lo que debe el cliente» (BR-P08) y de
-- el ya salian el saldo (`v_ticket_balances`), el estado de pago (columna
-- GENERADA), el bloqueo de sobrepago y los totales de las tres vistas de
-- resumen. Bajar el precio de venta no exige tocar nada de eso: exige unicamente
-- dejar que `sale_price` nazca por debajo del precio de la rifa.
--
-- LO QUE SI HACE FALTA
--
--   1. `base_price` — el precio oficial CONGELADO en el momento de la venta.
--      Sin el, el descuento habria que deducirlo de `raffles.ticket_price`, que
--      cambia (BR-P04, y de hecho cambio en 0027): una rifa que sube de precio
--      convertiria retroactivamente en «descuento» boletas vendidas al precio
--      correcto, y hundiria la comision de todo el mundo a la vez.
--
--   2. Un limite inferior. Sin el, un descuento suficientemente grande dejaria
--      la comision del vendedor en negativo, que es una figura que este negocio
--      NO tiene: no existe «el vendedor le debe dinero al Dueño».
--
--   3. Que el motor de comision reste el descuento.
--
-- EL DESCUENTO NO SE GUARDA
--
-- Se deriva: `base_price - sale_price`. Guardarlo seria un tercer numero que
-- puede desincronizarse de los otros dos. Igual que `pending_amount`, que
-- tampoco se guarda.
--
-- COMPATIBILIDAD HACIA ATRAS
--
-- `base_price` nace NULL en las 121 boletas que ya existen. En todas partes se
-- lee `coalesce(base_price, sale_price)`, asi que una boleta antigua tiene
-- descuento CERO y se comporta exactamente igual que antes de esta migracion.
-- No hay backfill, no hay reescritura de datos y no hay recalculo de comisiones:
-- nadie cobra un peso distinto por aplicar esto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- El movimiento nuevo del ledger
--
-- Va PRIMERO y solo: `alter type ... add value` deja el valor inutilizable hasta
-- que la transaccion confirma. Esta migracion no lo usa —no recalcula ninguna
-- comision, porque todavia no existe ni un descuento que restar—, asi que no hay
-- conflicto. Si algun dia se anade aqui un bucle de recalculo, tendra que ir en
-- una migracion posterior.
-- -----------------------------------------------------------------------------
alter type commission_movement add value if not exists 'discount';

-- -----------------------------------------------------------------------------
-- format_cop — dinero legible dentro de un mensaje de error
--
-- Un vendedor al que se le dice «el precio minimo es 100000» tiene que contar
-- ceros. Los mensajes de esta migracion dicen «$100.000» (BR-X03).
-- -----------------------------------------------------------------------------
-- `stable` y no `immutable`: el separador de miles de `to_char` sale de
-- `lc_numeric`, que es un parametro de sesion.
--
-- Y por eso mismo el separador no se da por supuesto: segun el locale del
-- servidor, `to_char` devuelve «120,000», «120.000» o «120 000». El `translate`
-- lleva los tres al punto colombiano (BR-X03), en vez de arreglar solo la coma
-- y dejar que en otro servidor salga un importe con el separador equivocado.
create function format_cop(p_amount bigint)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select '$' || translate(to_char(coalesce(p_amount, 0), 'FM9G999G999G999'), ',. ', '...')
$$;

comment on function format_cop is
  'Formato colombiano de un importe entero de pesos, para los mensajes que lee una persona (BR-X03).';

revoke execute on function format_cop(bigint) from anon, public;
grant execute on function format_cop(bigint) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- El precio oficial, congelado al vender
-- -----------------------------------------------------------------------------
alter table tickets add column base_price bigint check (base_price > 0);

-- El precio de venta nunca puede SUPERAR al oficial: esta funcionalidad es para
-- descuentos, no para recargos (seccion 15 del encargo). Las filas antiguas
-- tienen `base_price` nulo y la pasan sin tocarlas.
alter table tickets add constraint tickets_sale_price_not_above_base
  check (base_price is null or sale_price is null or sale_price <= base_price);

comment on column tickets.base_price is
  'Precio oficial de la rifa en el momento de la venta. El descuento concedido es base_price - sale_price. Nulo en las boletas vendidas antes de 0028: equivale a descuento cero (BR-P10).';

-- -----------------------------------------------------------------------------
-- commission_floor_rate — la tarifa MAS BAJA que este vendedor puede llegar a
-- tener en esta rifa
--
-- Es lo que fija el descuento maximo, y no es la tarifa actual. Motivo: en el
-- pago por tramos la tarifa es RETROACTIVA y baja sola (BR-G02, BR-G06). Alguien
-- que hoy cobra $40.000 por boleta y descontara $40.000 se quedaria con la
-- comision en negativo en cuanto se anulara un pago y volviera al tramo de
-- $20.000 —una venta pasada convertida en deuda sin que nadie la tocara—.
--
-- Tomando el suelo, el descuento cabe SIEMPRE dentro de la comision, se mueva
-- el tramo hacia donde se mueva.
--
--   por tramos      -> el tramo mas bajo de la organizacion ($20.000)
--   mitad del precio -> la mitad del precio vigente de la rifa
--
-- Sin tramos configurados devuelve 0, que significa «no se permite descuento».
-- Es el fallo seguro: antes se deja de poder descontar que de pagar bien.
-- -----------------------------------------------------------------------------
create function commission_floor_rate(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_seller_id       uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_por_tramos boolean;
  v_precio     bigint;
begin
  select m.parent_seller_id is not null
    into v_por_tramos
  from memberships m
  where m.profile_id = p_seller_id
    and m.organization_id = p_organization_id;

  if v_por_tramos is null then
    return 0;  -- no es miembro de la organizacion
  end if;

  if v_por_tramos then
    return coalesce((
      select min(ct.rate)
      from commission_tiers ct
      where ct.organization_id = p_organization_id
    ), 0);
  end if;

  select r.ticket_price / 2 into v_precio from raffles r where r.id = p_raffle_id;
  return coalesce(v_precio, 0);
end;
$$;

comment on function commission_floor_rate is
  'Tarifa minima garantizada de un vendedor en una rifa. Fija el descuento maximo: nunca se concede mas de lo que la comision puede absorber (BR-G18).';

revoke execute on function commission_floor_rate(uuid, uuid, uuid) from anon, public;
grant execute on function commission_floor_rate(uuid, uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- ticket_sale_price_limits — entre que dos cifras se puede vender esta boleta
--
-- UNA sola definicion del limite, para los tres sitios que lo necesitan: la
-- validacion de `assign_ticket_row`, el cuadro de elegibilidad que alimenta el
-- dialogo de venta multiple y el detalle de la boleta. Calcularlo por separado
-- en cada uno era la forma segura de que acabaran discrepando.
--
-- `security definer` porque tiene que poder mirar la membresia y los tramos, que
-- un vendedor no lee enteros. Devuelve solo dos cifras de SU propia boleta: la
-- RLS de `tickets` es la que decide si esa boleta es suya, porque sin acceso a
-- la fila no hay resultado.
-- -----------------------------------------------------------------------------
create function ticket_sale_price_limits(p_ticket_id uuid)
returns table (base_price bigint, min_sale_price bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.ticket_price,
    -- `greatest(..., 1)`: el precio de venta tiene que ser mayor que cero
    -- (restriccion de 0002). Con los datos reales nunca llega a activarse —la
    -- mitad de un precio siempre deja la otra mitad—, pero una tabla de tramos
    -- mal configurada no debe producir un minimo de cero.
    greatest(
      r.ticket_price - commission_floor_rate(t.organization_id, t.raffle_id, t.seller_id),
      1
    )::bigint
  from tickets t
  join raffles r on r.id = t.raffle_id
  where t.id = p_ticket_id
$$;

comment on function ticket_sale_price_limits is
  'Precio oficial y precio minimo de venta de una boleta. Fuente unica del limite para la validacion, el dialogo de venta y el detalle (BR-P11).';

revoke execute on function ticket_sale_price_limits(uuid) from anon, public;
grant execute on function ticket_sale_price_limits(uuid) to authenticated, service_role;

-- =============================================================================
-- La asignacion acepta un precio
--
-- `drop` + `create` en vez de `create or replace`: anadir un parametro con valor
-- por defecto crearia una SOBRECARGA, y las llamadas de tres argumentos que ya
-- existen se volverian ambiguas. Los tres consumidores —`assign_ticket`,
-- `bulk_assign_tickets` e `import_tickets_with_clients`— la resuelven por nombre
-- en tiempo de ejecucion, asi que siguen funcionando sin tocarlos y sin pasar
-- precio: reciben el oficial, que es el comportamiento de siempre (seccion 16
-- del encargo, la importacion masiva no cambia de contrato).
-- =============================================================================
drop function assign_ticket_row(uuid, uuid, date);

create function assign_ticket_row(
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
  v_is_staff boolean;
  v_base     bigint;
  v_min      bigint;
  v_price    bigint;
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

  -- BR-P09/BR-P11: el precio de venta. Sin precio explicito, el oficial: es el
  -- camino que recorren la importacion masiva y todo lo escrito antes de 0028.
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
         sale_price       = v_price,             -- lo que debe el cliente (BR-P09)
         base_price       = v_base,              -- el oficial, congelado (BR-P10)
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

comment on function assign_ticket_row(uuid, uuid, date, bigint) is
  'Reglas de asignacion de UNA boleta (BR-I07, BR-P03, BR-P09..BR-P11). Compartida por la asignacion individual, la masiva y la importacion (D-082, D-099).';

revoke execute on function assign_ticket_row(uuid, uuid, date, bigint) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- bulk_assign_tickets — el precio se aplica a CADA boleta del lote
--
-- No es un total repartido: es el precio de cada una. Cada boleta lo valida
-- contra SU rifa y SU vendedor dentro de `assign_ticket_row`, asi que un lote
-- que mezclara rifas de precios distintos con un precio que no le sirva a alguna
-- se rechaza entero (todo o nada, BR-B07). La pantalla no ofrece el campo en ese
-- caso, pero el que decide es esto.
-- -----------------------------------------------------------------------------
drop function bulk_assign_tickets(uuid[], uuid, date);

create function bulk_assign_tickets(
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

comment on function bulk_assign_tickets(uuid[], uuid, date, bigint) is
  'Asigna varias boletas al mismo cliente en una sola transaccion. Todo o nada. p_sale_price es el precio de CADA boleta, validado una por una en assign_ticket_row (BR-B02, BR-P09).';

revoke execute on function bulk_assign_tickets(uuid[], uuid, date, bigint) from public, anon;
grant execute on function bulk_assign_tickets(uuid[], uuid, date, bigint) to authenticated;

-- =============================================================================
-- El motor de comision resta el descuento
--
-- LA REGLA CRITICA DEL ENCARGO (seccion 3): lo que le corresponde a la empresa
-- se calcula sobre el precio OFICIAL y no se toca. En este sistema esa cifra no
-- se configura como un porcentaje —se configura al reves, lo que gana el
-- vendedor (BR-G13)—, asi que la parte de la empresa es lo que sobra:
--
--     participacion de la empresa = precio oficial − tarifa del vendedor
--     ganancia del vendedor       = precio de venta − participacion
--                                 = tarifa − descuento
--
-- Y `n × tarifa(n) − Σ descuentos` es exactamente eso sumado sobre las boletas
-- cobradas. El descuento lo asume integro quien lo concedio.
--
-- SIGUE SIENDO UNA FUNCION DEL ESTADO (D-094). No se acumulan eventos: se
-- recuenta todo y se anota la diferencia, asi que la idempotencia y la
-- autocorreccion se conservan intactas.
--
-- LA INVARIANTE `sum(ledger) = earned` (BR-G10) SE MANTIENE POR CONSTRUCCION:
-- las dos lineas de siempre explican volumen y tramo, y la tercera anota
-- EXACTAMENTE lo que falte para cuadrar. No hay forma de que se separen.
-- =============================================================================
create or replace function recalc_seller_commission(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_seller_id       uuid,
  p_movement        commission_movement default null,
  p_ticket_id       uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n_before      integer;
  v_rate_before   bigint;
  v_earned_before bigint;
  v_n_after       integer;
  v_rate_after    bigint;
  v_earned_after  bigint;
  v_descuentos    bigint;
  v_delta         integer;
  v_movement      commission_movement;
  v_anotado       bigint := 0;
  v_resto         bigint;
begin
  if p_seller_id is null or p_raffle_id is null then
    return;
  end if;

  insert into seller_commissions (organization_id, raffle_id, seller_id)
  values (p_organization_id, p_raffle_id, p_seller_id)
  on conflict (raffle_id, seller_id) do nothing;

  select tickets_paid, rate, earned
    into v_n_before, v_rate_before, v_earned_before
  from seller_commissions
  where raffle_id = p_raffle_id and seller_id = p_seller_id
  for update;

  -- El recuento y los descuentos salen de la MISMA lectura: pedirlos por
  -- separado permitiria que contaran conjuntos distintos de boletas.
  -- `coalesce(base_price, sale_price)` da descuento cero en las boletas
  -- vendidas antes de 0028.
  select
    count(*)::integer,
    coalesce(sum(coalesce(t.base_price, t.sale_price) - t.sale_price), 0)::bigint
    into v_n_after, v_descuentos
  from tickets t
  where t.raffle_id = p_raffle_id
    and t.seller_id = p_seller_id
    and t.inventory_status = 'assigned'
    and t.payment_status = 'paid';

  v_rate_after := commission_rate_for_seller(
    p_organization_id, p_raffle_id, p_seller_id, v_n_after
  );

  -- `greatest(0, ...)` es el cinturon de seguridad, no la regla: el limite de
  -- `commission_floor_rate` ya impide llegar aqui en negativo por un descuento.
  -- Queda para el unico camino que aun podria hacerlo —bajar el precio de la
  -- rifa a la mitad despues de una venta con descuento (BR-G15)— porque este
  -- negocio no tiene ganancias negativas y `earned` no las admite.
  v_earned_after := greatest(0, v_n_after::bigint * v_rate_after - v_descuentos);

  if v_earned_after = v_earned_before and v_n_after = v_n_before then
    return;
  end if;

  v_delta := v_n_after - v_n_before;

  if v_delta <> 0 then
    v_movement := coalesce(
      p_movement,
      case when v_delta > 0 then 'sale'::commission_movement
           else 'sale_reverted'::commission_movement
      end
    );

    v_anotado := v_anotado + v_delta::bigint * v_rate_after;

    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id, v_movement,
      v_delta::bigint * v_rate_after, v_n_after, v_rate_after, p_ticket_id
    );
  end if;

  if v_rate_after <> v_rate_before and v_n_before > 0 then
    v_anotado := v_anotado + v_n_before::bigint * (v_rate_after - v_rate_before);

    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id, 'tier_adjustment',
      v_n_before::bigint * (v_rate_after - v_rate_before),
      v_n_after, v_rate_after, p_ticket_id
    );
  end if;

  -- Lo que falte para cuadrar: el descuento concedido, y el recorte a cero si
  -- alguna vez llegara a hacer falta. Se calcula como resto en vez de como
  -- «diferencia de descuentos» a proposito — asi la invariante de BR-G10 no
  -- depende de que estas tres formulas sigan siendo consistentes entre si.
  v_resto := (v_earned_after - v_earned_before) - v_anotado;

  if v_resto <> 0 then
    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id, 'discount',
      v_resto, v_n_after, v_rate_after, p_ticket_id
    );
  end if;

  update seller_commissions
     set tickets_paid = v_n_after,
         rate = v_rate_after,
         earned = v_earned_after,
         updated_at = now()
   where raffle_id = p_raffle_id and seller_id = p_seller_id;
end;
$$;

-- El trigger de `tickets` ya escuchaba `sale_price`; ahora tambien tiene que
-- escuchar `base_price`, porque el descuento se compone de los dos.
drop trigger tickets_sync_commission on tickets;

create trigger tickets_sync_commission
  after insert or delete or update of
    paid_amount, sale_price, base_price, inventory_status, seller_id, raffle_id
  on tickets
  for each row execute function tickets_sync_commission();

-- =============================================================================
-- Lectura: el dialogo de venta necesita saber hasta donde puede bajar
--
-- Se anade al cuadro de elegibilidad que ese dialogo YA pide (D-082) en vez de
-- crear una consulta nueva: son los mismos ids, en el mismo momento, para la
-- misma pantalla. Una segunda llamada habria sido un viaje de red mas y una
-- ventana en la que las dos respuestas pudieran no coincidir.
-- =============================================================================
drop function ticket_bulk_eligibility(uuid[]);

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
  can_delete          boolean,
  base_price          bigint,
  min_sale_price      bigint
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
      t.sale_price is not null as was_sold,
      limits.base_price,
      limits.min_sale_price
    from tickets t
    left join raffles r on r.id = t.raffle_id
    left join lateral ticket_sale_price_limits(t.id) as limits on true
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
    -- BR-I09: aprobar es pasar de pendiente a disponible.
    (b.inventory_status = 'pending_approval'),
    -- BR-I07: disponible y con la rifa activa.
    (b.inventory_status = 'available' and b.raffle_active),
    -- BR-I10/BR-I11: cualquier estado menos anulada, y sin pagos activos.
    (b.inventory_status <> 'cancelled' and not b.has_active_payments),
    -- BR-C05: una boleta vendida arrastra al cliente, que es del vendedor
    -- original; una anulada es historia y no se reasigna.
    (b.inventory_status not in ('assigned', 'cancelled')),
    -- BR-B05: solo lo que nunca entro al flujo comercial.
    (b.inventory_status in ('draft', 'pending_approval', 'available')
     and not b.has_client and not b.was_sold and not b.has_payments),
    b.base_price,
    b.min_sale_price
  from base b;
end;
$$;

comment on function ticket_bulk_eligibility(uuid[]) is
  'Que acciones masivas admite cada boleta y entre que precios se puede vender. SECURITY INVOKER: hereda tickets_select, asi que un vendedor solo recibe las suyas. Es para MOSTRAR; quien decide son las funciones bulk_* (D-082, D-099).';

revoke execute on function ticket_bulk_eligibility(uuid[]) from public, anon;
grant execute on function ticket_bulk_eligibility(uuid[]) to authenticated;

-- =============================================================================
-- Lo que NO se toca, y por que
--
--   * `v_ticket_balances`, `v_client_balances`, `v_seller_summary` y
--     `v_raffle_summary` ya suman `sale_price`, que es justo lo que el cliente
--     debe. Vender mas barato ya se refleja solo en el saldo, en el vendido, en
--     el pendiente y en el estado de pago. Anadirles el descuento seria dato sin
--     consumidor: el detalle de la boleta lo lee de `tickets` (seccion 18 del
--     encargo — no guardar ni exponer derivados que nadie usa).
--   * `tickets_protect_sale_price` (0004) sigue prohibiendo cambiar el precio de
--     una boleta con abonos. Cubre tal cual la seccion 13 del encargo: cambiar
--     el precio despues de cobrar exige anular los pagos primero, asi que no hay
--     forma de producir un saldo negativo ni un estado `paid` incoherente.
--   * `payments`, `payment_allocations` y el tope de sobrepago: intactos. El
--     limite siempre fue `sale_price` y lo sigue siendo.
-- =============================================================================

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- No hay migracion inversa, y es deliberado (mismo criterio que 0027). Deshacer
-- esto con boletas ya vendidas con descuento significaria decidir que precio
-- pasan a deber esos clientes, y esa no es una decision que pueda tomar un
-- script. La vuelta atras es restaurar un respaldo (RUNBOOK 5.4).
--
-- Si hiciera falta cerrar solo la ENTRADA de descuentos nuevos sin tocar los
-- existentes, basta con dejar de enviar `p_sale_price` desde la aplicacion: cada
-- venta volveria al precio oficial sin cambiar una sola fila.
-- =============================================================================
