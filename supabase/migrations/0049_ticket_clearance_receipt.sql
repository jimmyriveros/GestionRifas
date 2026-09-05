-- =============================================================================
-- 0049_ticket_clearance_receipt.sql
-- Entrega del paz y salvo: el desprendible que el vendedor le da al cliente
--
-- Referencia: docs/BUSINESS_RULES.md BR-I15, docs/DECISIONS.md D-170.
--
-- QUE ES, Y QUE NO ES
--
-- Cada boleta trae un desprendible —el «paz y salvo»— que el vendedor entrega
-- fisicamente al cliente. Hasta hoy eso se llevaba de memoria o en el cuaderno.
-- Esta migracion le da a la boleta un interruptor para registrarlo.
--
-- ES UN CONTROL DE ORGANIZACION, NO DE DINERO. No mira ni toca el estado de
-- pago, lo abonado, el saldo, el precio de venta, la ganancia, el estado de la
-- rifa ni los resultados de loteria. Una boleta se puede marcar como entregada
-- estando Sin pagar, Abonada o Pagada, y marcarla no mueve ni un peso. Por eso
-- NO es un valor nuevo de `inventory_status` ni de `payment_status`: son dos
-- columnas propias.
--
-- QUE SIGNIFICA CADA COLUMNA
--
--   clearance_receipt_delivered_at      null  -> «Paz y salvo por entregar»
--                                       fecha -> «Paz y salvo entregado»
--   clearance_receipt_assumed_delivered true  -> el estado lo puso ESTA
--                                                migracion, no una persona
--
-- La segunda columna no duplica a la primera: distingue una entrega que alguien
-- registro de una que el sistema dio por hecha al estrenar la funcion. La fecha
-- de una fila heredada es la de la migracion, no la de la entrega real, y la
-- interfaz tiene prohibido presentarla como si lo fuera (D-170).
--
-- EL DATO ES DEL CLIENTE ACTUAL, Y ESO LO GARANTIZA LA BASE
--
-- La entrega se le hizo a UNA persona. Si la boleta cambia de cliente (BR-I13)
-- o vuelve al inventario (BR-I14), lo entregado deja de valer y el estado
-- vuelve a pendiente. Lo hace un disparador, no la aplicacion: hay tres caminos
-- que escriben `client_id` —`assign_ticket_row`, `reassign_ticket_client` y
-- `release_ticket_client`— y ninguno tiene por que acordarse de esto.
--
-- Una boleta ANULADA es la excepcion deliberada: conserva su `client_id`, asi
-- que conserva tambien lo que se hubiera registrado. Es historia, y la interfaz
-- la ensena en modo lectura.
--
-- SOBRE LAS TILDES DE LOS MENSAJES. Las frases NUEVAS van acentuadas. La deuda
-- general de tildes en la base de datos es I-030 y se arregla entera de una vez,
-- no a trozos dentro de una migracion de otra cosa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las dos columnas
--
-- Sin indice, a proposito: no hay busqueda, ni filtro, ni orden por estos
-- campos. Un indice «por si acaso» se paga en cada insercion de boleta, y la
-- regla del proyecto es no crear uno sin evidencia (DATA_MODEL 5).
-- -----------------------------------------------------------------------------
alter table tickets
  add column clearance_receipt_delivered_at      timestamptz,
  add column clearance_receipt_assumed_delivered boolean not null default false;

comment on column tickets.clearance_receipt_delivered_at is
  'Cuando se registro la entrega FISICA del paz y salvo al cliente actual. NULL = por entregar. No tiene ninguna relacion con el pago (BR-I15, D-170).';

comment on column tickets.clearance_receipt_assumed_delivered is
  'true solo en las boletas que la migracion 0049 dio por entregadas al estrenar la funcion. Su fecha es tecnica, no la de la entrega real (BR-I15, D-170).';

-- -----------------------------------------------------------------------------
-- 2. Coherencia, en la base
--
-- Dos combinaciones no pueden existir:
--
--   * «heredada» sin fecha: la marca describe DE DONDE salio una fecha, asi que
--     sin fecha no describe nada.
--   * una entrega registrada en una boleta sin cliente: la entrega es a una
--     persona concreta. El disparador de mas abajo lo mantiene cierto en cada
--     UPDATE; este CHECK lo cierra tambien para un INSERT.
-- -----------------------------------------------------------------------------
alter table tickets
  add constraint tickets_clearance_assumed_requires_delivery check (
    not clearance_receipt_assumed_delivered
    or clearance_receipt_delivered_at is not null
  ),
  add constraint tickets_clearance_requires_client check (
    clearance_receipt_delivered_at is null
    or client_id is not null
  );

-- -----------------------------------------------------------------------------
-- 3. La entrega pertenece al cliente actual (BR-I15)
--
-- `before update of client_id, inventory_status`: no se despierta cuando la RPC
-- de mas abajo escribe solo sus dos columnas, ni cuando se recalcula
-- `paid_amount`, ni al corregir un precio.
--
-- Las dos condiciones no son redundantes aunque hoy se solapen: volver a
-- `available` obliga a `client_id` nulo por `tickets_available_has_no_client`,
-- pero escribir las dos deja la regla dicha tal como se lee en BR-I15 y aguanta
-- que manana alguien afloje aquel CHECK.
--
-- Anular NO limpia: una boleta `cancelled` conserva su cliente (BR-I06) y con el
-- lo que se le hubiera entregado.
-- -----------------------------------------------------------------------------
create function tickets_reset_clearance_receipt()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.client_id is distinct from old.client_id
     or (new.inventory_status = 'available' and old.inventory_status <> 'available') then
    new.clearance_receipt_delivered_at      := null;
    new.clearance_receipt_assumed_delivered := false;
  end if;
  return new;
end;
$$;

create trigger tickets_reset_clearance_receipt
  before update of client_id, inventory_status on tickets
  for each row execute function tickets_reset_clearance_receipt();

comment on function tickets_reset_clearance_receipt is
  'La entrega del paz y salvo es del cliente actual: cambiar de cliente o devolver la boleta al inventario la deja pendiente. Anular no la borra (BR-I15, D-170).';

-- I-020 e I-078, y esta migracion volvio a caer en la trampa antes de escribir
-- estas dos lineas: PostgreSQL concede EXECUTE a PUBLIC en CADA funcion nueva, y
-- las default privileges de 0015 y 0032 no alcanzan a lo que se cree despues.
-- Una funcion de disparador NO necesita EXECUTE para dispararse —el permiso se
-- comprueba sobre la TABLA— asi que aqui no se concede a nadie. Lo vigilan
-- `tests/db/catalog.test.ts` y `scripts/verify-remote.ts`.
revoke execute on function tickets_reset_clearance_receipt() from public, anon, authenticated;

-- =============================================================================
-- 4. set_ticket_clearance_delivery — el interruptor
--
-- POR QUE UNA RPC Y NO UN UPDATE
--
-- `tickets_update_seller` (0005) solo alcanza boletas `draft` y
-- `pending_approval`: un vendedor NO puede tocar una boleta `assigned` con un
-- UPDATE directo, y esa politica no se amplia. Ampliarla abriria la boleta
-- vendida entera —precio, cliente, fechas— para poder escribir un booleano.
--
-- QUIEN PUEDE: SOLO EL VENDEDOR DUENO DE LA BOLETA
--
-- Es su entrega y es su cliente. El Dueno y el Administrador ven el dato, pero
-- no lo cambian: registrar una entrega que no hicieron no significa nada. Un
-- vendedor padre tampoco puede sobre la boleta de un integrante de su equipo
-- (D-092). `has_org_role(org, seller)` comprueba de una vez el rol y que la
-- membresia, el perfil y la organizacion sigan activos (BR-A04).
--
-- LA FECHA LA PONE POSTGRESQL
--
-- `now()`, nunca un valor del navegador. Es un dato de bitacora y el reloj del
-- telefono no es una fuente.
--
-- BLOQUEO OPTIMISTA CON `p_expected_delivered_at`
--
-- La pantalla dice que fecha creia (o `null` si lo veia pendiente). Si la fila
-- ya no dice eso, alguien lo cambio entre medias y esta llamada apagaria o
-- encenderia algo que quien pulso no llego a ver.
--
-- NO hace falta un `p_expected_assumed` ademas: la marca heredada solo cambia
-- ACOMPANANDO a la fecha —la pone esta migracion, la quita cualquier escritura
-- manual—, asi que dos estados distintos nunca comparten fecha. Un parametro
-- mas seria un parametro que nunca puede discrepar.
--
-- SI YA ESTA COMO SE PIDE, NO SE ESCRIBE
--
-- Ni UPDATE, ni `updated_at` movido, ni una fila de bitacora que no describe
-- ninguna decision. Se devuelve el estado que hay.
--
-- NO MIRA DINERO Y NO EXIGE RIFA ACTIVA
--
-- Entregar un papel no es un acto comercial: se puede seguir entregando lo que
-- se vendio en una rifa ya cerrada. Es la diferencia con BR-I14.
-- =============================================================================

create function set_ticket_clearance_delivery(
  p_ticket_id            uuid,
  p_delivered            boolean,
  p_expected_delivered_at timestamptz default null
)
returns table (
  clearance_receipt_delivered_at      timestamptz,
  clearance_receipt_assumed_delivered boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_ticket tickets%rowtype;
begin
  if p_delivered is null then
    raise exception 'Indica si el paz y salvo se entregó o no.';
  end if;

  -- Con la fila bloqueada: entre que la pantalla se pinto y llega esta llamada,
  -- la boleta pudo cambiar de cliente, liberarse o anularse.
  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  -- El personal SI ve esta boleta, asi que se le dice el motivo de verdad; a
  -- quien no deberia saber que existe se le da el mismo mensaje que si no
  -- existiera.
  if is_org_staff(v_ticket.organization_id) then
    raise exception 'Solo el vendedor de la boleta puede registrar la entrega del paz y salvo.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_ticket.seller_id <> v_uid
     or not has_org_role(v_ticket.organization_id, array['seller']::app_role[]) then
    raise exception 'La boleta no existe o no tienes acceso a ella.';
  end if;

  if v_ticket.inventory_status <> 'assigned' or v_ticket.client_id is null then
    raise exception 'Solo se puede registrar el paz y salvo de una boleta vendida.';
  end if;

  if v_ticket.clearance_receipt_delivered_at is distinct from p_expected_delivered_at then
    raise exception 'La entrega del paz y salvo cambió en otro dispositivo. Recarga la pantalla y vuelve a intentar.';
  end if;

  -- Ya esta como se pide: se devuelve tal cual, sin escribir.
  if p_delivered = (v_ticket.clearance_receipt_delivered_at is not null) then
    return query
    select v_ticket.clearance_receipt_delivered_at, v_ticket.clearance_receipt_assumed_delivered;
    return;
  end if;

  -- Encender siempre deja un registro MANUAL: una fila heredada que se apaga y
  -- se vuelve a encender pasa a tener fecha real y deja de ser heredada.
  -- Apagar borra las dos cosas.
  return query
  update tickets t
     set clearance_receipt_delivered_at      = case when p_delivered then now() end,
         clearance_receipt_assumed_delivered = false
   where t.id = p_ticket_id
  returning t.clearance_receipt_delivered_at, t.clearance_receipt_assumed_delivered;
end;
$$;

comment on function set_ticket_clearance_delivery(uuid, boolean, timestamptz) is
  'Registra o retira la entrega FISICA del paz y salvo de UNA boleta vendida. Solo el vendedor dueno de la boleta. La fecha la pone el servidor y la activacion manual deja clearance_receipt_assumed_delivered en false. No consulta ni cambia dinero, y no exige rifa activa. Devuelve el estado resultante. BR-I15, D-170.';

-- Regla 2 de docs/SECURITY.md 4.5. `service_role` se nombra a proposito: en
-- produccion lo hereda del privilegio por defecto y en local NO (D-128), y esa
-- divergencia es exactamente la que costo I-078 y obligo a la 0044.
revoke execute on function set_ticket_clearance_delivery(uuid, boolean, timestamptz) from public, anon;
grant  execute on function set_ticket_clearance_delivery(uuid, boolean, timestamptz) to authenticated;
grant  execute on function set_ticket_clearance_delivery(uuid, boolean, timestamptz) to service_role;

-- =============================================================================
-- 5. search_tickets — las dos columnas viajan tambien al buscar
--
-- El indicador de la lista tiene que verse igual al buscar por numero, al
-- buscar por cliente, al paginar y al filtrar. La lista sin busqueda va por
-- PostgREST y le basta con pedir las columnas nuevas; la busqueda va por esta
-- funcion, que declara su tabla de salida columna a columna.
--
-- Cambiar `RETURNS TABLE` obliga a `drop` + `create`: PostgreSQL no deja que un
-- `create or replace` cambie el tipo de retorno. El `drop` se lleva los
-- privilegios, asi que se vuelven a conceder al final —el mismo patron de 0046,
-- y por la misma razon—.
--
-- LO DEMAS NO SE TOCA, Y ESO ES EL PUNTO: firma de entrada, `security invoker`
-- —y con ella `tickets_select` y `clients_select`—, las dos ramas, sus filtros,
-- su relevancia, su orden y su paginacion son EXACTAMENTE los de 0029. Lo unico
-- nuevo son dos columnas al final de cada `select`.
-- =============================================================================

drop function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer);

create function search_tickets(
  p_search           text,
  p_raffle_id        uuid default null,
  p_seller_id        uuid default null,
  p_client_id        uuid default null,
  p_inventory_status ticket_inventory_status default null,
  p_payment_status   ticket_payment_status default null,
  p_limit            integer default 20,
  p_offset           integer default 0
)
returns table (
  id                uuid,
  internal_code     text,
  daily_number      text,
  weekly_number     text,
  inventory_status  ticket_inventory_status,
  payment_status    ticket_payment_status,
  sale_price        bigint,
  paid_amount       bigint,
  sale_date         date,
  created_at        timestamptz,
  raffle_id         uuid,
  raffle_name       text,
  raffle_short_code text,
  seller_id         uuid,
  client_id         uuid,
  client_name       text,
  clearance_receipt_delivered_at      timestamptz,
  clearance_receipt_assumed_delivered boolean,
  total_count       bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_raw    text := trim(coalesce(p_search, ''));
  v_needle text;
begin
  if v_raw = '' then
    -- Buscar «todo» no es buscar.
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- RAMA 1 — numeros de la boleta (BR-N11, sin cambios respecto de 0029)
  --
  -- De 1 a 4 digitos y nada mas (BR-N02). Como el termino queda reducido a
  -- digitos, `%` y `_` no pueden colarse dentro del patron de `like`.
  -- ---------------------------------------------------------------------------
  if v_raw ~ '^[0-9]{1,4}$' then
    return query
    with matched as (
      select
        t.id                as t_id,
        t.internal_code     as t_internal_code,
        t.daily_number      as t_daily_number,
        t.weekly_number     as t_weekly_number,
        t.inventory_status  as t_inventory_status,
        t.payment_status    as t_payment_status,
        t.sale_price        as t_sale_price,
        t.paid_amount       as t_paid_amount,
        t.sale_date         as t_sale_date,
        t.created_at        as t_created_at,
        t.raffle_id         as t_raffle_id,
        t.seller_id         as t_seller_id,
        t.client_id         as t_client_id,
        t.clearance_receipt_delivered_at      as t_clearance_at,
        t.clearance_receipt_assumed_delivered as t_clearance_assumed,
        -- Relevancia: el numero diario manda sobre el semanal, y dentro de cada
        -- uno la coincidencia exacta va antes que el comienzo, y el comienzo
        -- antes que «contiene». Es el orden en que la gente espera encontrarlo.
        case
          when t.daily_number  =    v_raw               then 0
          when t.daily_number  like v_raw || '%'        then 1
          when t.daily_number  like '%' || v_raw || '%' then 2
          when t.weekly_number =    v_raw               then 3
          when t.weekly_number like v_raw || '%'        then 4
          else 5
        end                 as t_relevance,
        count(*) over ()    as t_total_count
      from tickets t
      where (t.daily_number  like '%' || v_raw || '%'
          or t.weekly_number like '%' || v_raw || '%')
        and (p_raffle_id        is null or t.raffle_id        = p_raffle_id)
        and (p_seller_id        is null or t.seller_id        = p_seller_id)
        and (p_client_id        is null or t.client_id        = p_client_id)
        and (p_inventory_status is null or t.inventory_status = p_inventory_status)
        and (p_payment_status   is null or t.payment_status   = p_payment_status)
    )
    select
      m.t_id,
      m.t_internal_code,
      m.t_daily_number,
      m.t_weekly_number,
      m.t_inventory_status,
      m.t_payment_status,
      m.t_sale_price,
      m.t_paid_amount,
      m.t_sale_date,
      m.t_created_at,
      m.t_raffle_id,
      r.name,
      r.short_code,
      m.t_seller_id,
      m.t_client_id,
      c.name,
      m.t_clearance_at,
      m.t_clearance_assumed,
      m.t_total_count
    from matched m
    -- `left join`: si quien consulta no puede ver la rifa o el cliente, se
    -- pierde el nombre, nunca la boleta (I-015).
    left join raffles r on r.id = m.t_raffle_id
    left join clients c on c.id = m.t_client_id
    -- Dentro del mismo escalon de relevancia, por numero: «0100, 0101, 0102…»
    -- es como se recorre una lista de boletas con la vista. Se comparan como
    -- TEXTO, igual que se guardan, para no perder los ceros de delante.
    -- `t_id` desempata al final, para que la paginacion sea estable.
    order by m.t_relevance, m.t_daily_number, m.t_weekly_number, m.t_id
    limit  greatest(p_limit, 0)
    offset greatest(p_offset, 0);

    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- RAMA 2 — nombre del cliente (BR-N13)
  --
  -- El termino se pliega igual que la columna contra la que se compara:
  -- `search_normalize` (0017) quita tildes y mayusculas, de modo que «jose»
  -- encuentra a «José» y «munoz» a «Muñoz». Es la misma funcion que usa la
  -- busqueda de clientes; no hay una segunda forma de normalizar.
  --
  -- `%`, `_` y `\` se BORRAN del termino: dentro de `like` significarian «lo
  -- que sea» en vez de si mismos. No es defensa contra inyeccion —el valor
  -- viaja como parametro—, es que el termino signifique lo que se escribio.
  -- ---------------------------------------------------------------------------
  v_needle := translate(search_normalize(v_raw), '%_\', '');

  -- Una sola letra devolveria media tabla y no ayuda a nadie. El mismo minimo
  -- que aplica el navegador (SEARCH_MIN_CHARS.tickets, src/lib/search.ts).
  if length(v_needle) < 2 then
    return;
  end if;

  return query
  with matched as (
    select
      t.id                as t_id,
      t.internal_code     as t_internal_code,
      t.daily_number      as t_daily_number,
      t.weekly_number     as t_weekly_number,
      t.inventory_status  as t_inventory_status,
      t.payment_status    as t_payment_status,
      t.sale_price        as t_sale_price,
      t.paid_amount       as t_paid_amount,
      t.sale_date         as t_sale_date,
      t.created_at        as t_created_at,
      t.raffle_id         as t_raffle_id,
      t.seller_id         as t_seller_id,
      t.client_id         as t_client_id,
      c.name              as t_client_name,
      t.clearance_receipt_delivered_at      as t_clearance_at,
      t.clearance_receipt_assumed_delivered as t_clearance_assumed,
      -- Relevancia del nombre: el nombre completo exacto primero, despues el
      -- que EMPIEZA por lo escrito, despues aquel en el que lo escrito empieza
      -- una de sus palabras —asi «Riveros» encuentra a «Jimmy Riveros»— y por
      -- ultimo el resto (coincidencia suelta, alias, correo o telefono).
      case
        when search_normalize(c.name) =    v_needle                 then 0
        when search_normalize(c.name) like v_needle || '%'          then 1
        when search_normalize(c.name) like '% ' || v_needle || '%'  then 2
        else 3
      end                 as t_relevance,
      -- Las boletas del MISMO cliente salen juntas, y los clientes por orden
      -- alfabetico. Dos personas pueden llamarse igual: el id desempata para
      -- que no se entremezclen sus boletas (nunca se identifica a nadie por su
      -- nombre, ni aqui ni al navegar).
      search_normalize(c.name) as t_client_sort,
      count(*) over ()    as t_total_count
    from tickets t
    -- `join` INTERNO a proposito: una boleta sin cliente —o cuyo cliente no
    -- puede ver quien consulta— no coincide con ningun nombre.
    join clients c on c.id = t.client_id
    where c.search_text like '%' || v_needle || '%'
      and (p_raffle_id        is null or t.raffle_id        = p_raffle_id)
      and (p_seller_id        is null or t.seller_id        = p_seller_id)
      and (p_client_id        is null or t.client_id        = p_client_id)
      and (p_inventory_status is null or t.inventory_status = p_inventory_status)
      and (p_payment_status   is null or t.payment_status   = p_payment_status)
  )
  select
    m.t_id,
    m.t_internal_code,
    m.t_daily_number,
    m.t_weekly_number,
    m.t_inventory_status,
    m.t_payment_status,
    m.t_sale_price,
    m.t_paid_amount,
    m.t_sale_date,
    m.t_created_at,
    m.t_raffle_id,
    r.name,
    r.short_code,
    m.t_seller_id,
    m.t_client_id,
    m.t_client_name,
    m.t_clearance_at,
    m.t_clearance_assumed,
    m.t_total_count
  from matched m
  left join raffles r on r.id = m.t_raffle_id
  order by m.t_relevance,
           m.t_client_sort,
           m.t_client_id,
           m.t_daily_number,
           m.t_weekly_number,
           m.t_id
  limit  greatest(p_limit, 0)
  offset greatest(p_offset, 0);
end;
$$;

comment on function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer) is
  'Busca boletas con UN solo termino: si son de 1 a 4 digitos, por numero diario y semanal (parcial, el diario primero — BR-N11); si es texto, por el nombre del cliente que las tiene (BR-N13). El codigo interno NO participa. Devuelve siempre BOLETAS, ordenadas por relevancia, incluidas las dos columnas del paz y salvo (BR-I15). SECURITY INVOKER: hereda tickets_select y clients_select, de modo que un vendedor solo encuentra sus boletas por el nombre de sus clientes.';

-- El `drop` se llevo los privilegios de 0018. Se restituyen exactamente los que
-- habia: `authenticated` si, `public` y `anon` no.
revoke execute on function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer) from public, anon;
grant  execute on function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer) to authenticated;

-- =============================================================================
-- 6. CARGA INICIAL — una sola vez, aqui dentro
--
-- Excepcion autorizada expresamente por el dueno, y acotada a esta migracion:
-- las boletas que YA estaban vendidas cuando se estrena la funcion se dan por
-- entregadas. Sin esto, el dia del despliegue las 600 boletas vendidas de la
-- operacion real aparecerian todas «por entregar» y nadie iba a repasarlas una
-- por una; la lista naceria mintiendo.
--
-- QUE TOCA: solo boletas `assigned` CON cliente y sin entrega registrada —que
-- son todas, porque la columna acaba de nacer—. No toca disponibles, borradores,
-- pendientes de aprobacion ni anuladas.
--
-- QUE ESCRIBE: exactamente las dos columnas nuevas. Ni un campo financiero, ni
-- cliente, ni vendedor, ni numeros, ni precio, ni fecha de venta.
--
-- LA FECHA ES TECNICA. `now()` es el instante de aplicar la migracion, no el de
-- ninguna entrega: por eso va acompanada de `assumed_delivered = true`, y por
-- eso la interfaz tiene PROHIBIDO escribir «Entregado el <esa fecha>» (D-170).
--
-- AUDITORIA: la escribe sola `audit_tickets` (0006), una fila `ticket.update`
-- por boleta con los valores viejos y los nuevos. `auth.uid()` es NULL dentro de
-- una migracion, asi que el actor queda nulo: eso ES el actor de sistema, y es
-- lo que distingue esta carga de una activacion manual. No se anade una segunda
-- fila semantica: serian dos entradas por boleta diciendo lo mismo.
--
-- POR QUE NO SE DISPARA NADA MAS: `tickets_sync_commission` escucha
-- `paid_amount, sale_price, base_price, inventory_status, seller_id, raffle_id`;
-- `notify_ticket_sold` y `tickets_validate_status_transition`, `inventory_status`;
-- `tickets_protect_client_change` y el disparador nuevo, `client_id`. Ninguna de
-- esas columnas esta en este UPDATE. `tickets_set_updated_at` si se dispara, y
-- `updated_at` es justo una de las columnas que la auditoria filtra.
--
-- LAS VENTAS POSTERIORES NACEN PENDIENTES. Esto no es un comportamiento: es un
-- UPDATE que corre una vez. `assign_ticket_row` no escribe estas columnas, asi
-- que una boleta vendida manana empieza con la entrega por hacer.
-- =============================================================================
update tickets
   set clearance_receipt_delivered_at      = now(),
       clearance_receipt_assumed_delivered = true
 where inventory_status = 'assigned'
   and client_id is not null
   and clearance_receipt_delivered_at is null;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function set_ticket_clearance_delivery(uuid, boolean, timestamptz);
-- drop trigger tickets_reset_clearance_receipt on tickets;
-- drop function tickets_reset_clearance_receipt();
-- alter table tickets
--   drop constraint tickets_clearance_requires_client,
--   drop constraint tickets_clearance_assumed_requires_delivery,
--   drop column clearance_receipt_assumed_delivered,
--   drop column clearance_receipt_delivered_at;
-- -- y volver a ejecutar el `create function search_tickets` de 0029 con sus
-- -- `grant`, para devolverle su tabla de salida de 17 columnas.
--
-- Revertir BORRA lo registrado: las dos columnas se van con el `drop column` y
-- no hay copia en ninguna otra tabla. Lo unico que sobrevive es la bitacora
-- (`ticket.update` en `audit_logs`), que no se toca. Nada financiero cambia en
-- ningun sentido: esta migracion no escribe un solo peso.
-- =============================================================================
