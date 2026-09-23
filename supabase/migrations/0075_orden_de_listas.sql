-- =============================================================================
-- 0075 — ORDEN DE LISTAS: el orden lo decide la base, no el navegador (P1-B)
--
-- EL DEFECTO. `DataTable` ordenaba en el navegador las filas que ya tenia, que
-- son las 25 de la pagina servida. En «Mis pagos» de la operacion local, con
-- «Valor» de mayor a menor la pantalla daba $150.000 como maximo cuando el
-- maximo real de ese vendedor son $2.280.000. La cabecera lo anunciaba ademas
-- con `aria-sort`, asi que la lista no solo se equivocaba: lo afirmaba.
--
-- Las listas que consultan PostgREST se arreglan sin SQL, pasando `.order()`.
-- Las dos que ordenan por RELEVANCIA no pueden: su orden lo decide una funcion,
-- y una columna pedida desde la cabecera tiene que entrar ahi dentro. Son estas
-- dos, y es lo unico que cambia esta migracion.
--
-- COMO SE VALIDA. El nombre de la columna NO se concatena en ninguna parte: se
-- compara contra una lista blanca escrita a mano y, si no esta, la funcion
-- levanta una excepcion. La misma lista existe en TypeScript; se repite aqui
-- porque la pantalla no es una frontera de seguridad (CLAUDE.md 26).
--
-- Y LAS DOS LISTAS SON DISTINTAS. La del personal es mas corta: no puede
-- ordenar por cliente ni por dinero. Ordenar por una columna es una consulta
-- sobre ella —ordenar por saldo y mirar la primera fila dice quien debe mas—,
-- asi que la privacidad de D-198 se respeta tambien en el orden, no solo en las
-- columnas que se pintan.
--
-- QUE NO CAMBIA. Sin `p_sort_column`, las expresiones nuevas valen null y no
-- ordenan nada: las dos funciones devuelven exactamente lo mismo que antes, en
-- el mismo orden. El resto del cuerpo se copia literal de 0049 y 0057.
-- =============================================================================

-- search_tickets — boletas del VENDEDOR (0018 → 0029 → 0049 → aqui) -----------
drop function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer);

create function search_tickets(
  p_search           text,
  p_raffle_id        uuid default null,
  p_seller_id        uuid default null,
  p_client_id        uuid default null,
  p_inventory_status ticket_inventory_status default null,
  p_payment_status   ticket_payment_status default null,
  p_limit            integer default 20,
  p_offset           integer default 0,
  p_sort_column      text default null,
  p_sort_direction   text default null
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
  -- Lista blanca del ORDEN. El parametro no se concatena en ningun sitio: solo
  -- se compara contra estos seis nombres, y lo que no este aqui no ordena nada.
  -- Es la misma lista que `TICKET_SORT_COLUMNS` en queries.ts, y la comprobacion
  -- se repite aqui a proposito: la pantalla no es una frontera (CLAUDE.md 26).
  v_sort   text := nullif(coalesce(p_sort_column, ''), '');
  v_asc    boolean := coalesce(p_sort_direction, 'asc') <> 'desc';
begin
  if v_sort is not null
     and v_sort not in ('dailyNumber', 'raffleShortCode', 'inventoryStatus',
                        'paymentStatus', 'paidAmount', 'salePrice') then
    raise exception 'No se puede ordenar por esa columna.';
  end if;
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
    order by
    -- ORDEN PEDIDO (P1-B). Va DELANTE de la relevancia: si alguien pulsa una
    -- cabecera estando en una busqueda, manda lo que pulso. Una expresion por
    -- tipo, porque `case` no mezcla texto con numero.
    case when v_sort is not null and v_asc then
      case v_sort
        when 'dailyNumber'     then m.t_daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then m.t_inventory_status::text
        when 'paymentStatus'   then m.t_payment_status::text
      end
    end asc nulls last,
    case when v_sort is not null and not v_asc then
      case v_sort
        when 'dailyNumber'     then m.t_daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then m.t_inventory_status::text
        when 'paymentStatus'   then m.t_payment_status::text
      end
    end desc nulls last,
    case when v_sort is not null and v_asc then
      case v_sort
        when 'paidAmount' then m.t_paid_amount
        when 'salePrice'  then m.t_sale_price
      end
    end asc nulls last,
    case when v_sort is not null and not v_asc then
      case v_sort
        when 'paidAmount' then m.t_paid_amount
        when 'salePrice'  then m.t_sale_price
      end
    end desc nulls last,
      m.t_relevance, m.t_daily_number, m.t_weekly_number, m.t_id
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
  order by
    -- ORDEN PEDIDO (P1-B). Va DELANTE de la relevancia: si alguien pulsa una
    -- cabecera estando en una busqueda, manda lo que pulso. Una expresion por
    -- tipo, porque `case` no mezcla texto con numero.
    case when v_sort is not null and v_asc then
      case v_sort
        when 'dailyNumber'     then m.t_daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then m.t_inventory_status::text
        when 'paymentStatus'   then m.t_payment_status::text
      end
    end asc nulls last,
    case when v_sort is not null and not v_asc then
      case v_sort
        when 'dailyNumber'     then m.t_daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then m.t_inventory_status::text
        when 'paymentStatus'   then m.t_payment_status::text
      end
    end desc nulls last,
    case when v_sort is not null and v_asc then
      case v_sort
        when 'paidAmount' then m.t_paid_amount
        when 'salePrice'  then m.t_sale_price
      end
    end asc nulls last,
    case when v_sort is not null and not v_asc then
      case v_sort
        when 'paidAmount' then m.t_paid_amount
        when 'salePrice'  then m.t_sale_price
      end
    end desc nulls last,
    m.t_relevance,
    m.t_client_sort,
    m.t_client_id,
    m.t_daily_number,
    m.t_weekly_number,
    m.t_id
  limit  greatest(p_limit, 0)
  offset greatest(p_offset, 0);
end;
$$;

comment on function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer, text, text) is
  'Busca boletas con UN solo termino: si son de 1 a 4 digitos, por numero diario y semanal (parcial, el diario primero — BR-N11); si es texto, por el nombre del cliente que las tiene (BR-N13). El codigo interno NO participa. Devuelve siempre BOLETAS, ordenadas por relevancia, incluidas las dos columnas del paz y salvo (BR-I15). Con p_sort_column manda el orden pedido sobre la relevancia, validado contra una lista blanca (P1-B). SECURITY INVOKER: hereda tickets_select y clients_select, de modo que un vendedor solo encuentra sus boletas por el nombre de sus clientes.';

-- El `drop` se lleva los privilegios. Se restituyen los mismos que tenia.
revoke execute on function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer, text, text) from public, anon;
grant  execute on function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer, text, text) to authenticated;

-- admin_list_tickets — boletas del PERSONAL (0057 → aqui) ---------------------
drop function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer);

create function admin_list_tickets(
  p_search           text default null,
  p_raffle_id        uuid default null,
  p_seller_id        uuid default null,
  p_inventory_status ticket_inventory_status default null,
  p_payment_state    text default null,
  p_ticket_ids       uuid[] default null,
  p_limit            integer default 25,
  p_offset           integer default 0,
  p_sort_column      text default null,
  p_sort_direction   text default null
)
returns table (
  id                uuid,
  daily_number      text,
  weekly_number     text,
  inventory_status  ticket_inventory_status,
  payment_state     text,
  clearance_state   text,
  raffle_id         uuid,
  raffle_name       text,
  raffle_short_code text,
  seller_id         uuid,
  total_count       bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 0), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total  bigint;
  -- Lista blanca del ORDEN, y es MAS CORTA que la del vendedor a proposito: el
  -- personal no puede ordenar por cliente ni por dinero, porque el orden de una
  -- lista delata lo que la lista no muestra (D-198, BR-Q01). Tampoco por
  -- «Vendedor»: el nombre no sale de esta consulta, lo resuelve un mapa en
  -- memoria. El parametro no se concatena en ningun sitio.
  v_sort   text := nullif(coalesce(p_sort_column, ''), '');
  v_asc    boolean := coalesce(p_sort_direction, 'asc') <> 'desc';
begin
  if v_sort is not null
     and v_sort not in ('dailyNumber', 'raffleShortCode',
                        'inventoryStatus', 'paymentState', 'clearance') then
    raise exception 'No se puede ordenar por esa columna.';
  end if;
  if p_payment_state is not null and p_payment_state not in ('paid', 'unpaid') then
    raise exception 'El estado de pago no es válido.';
  end if;

  if coalesce(array_length(p_ticket_ids, 1), 0) > 1000 then
    raise exception 'No se pueden consultar más de 1.000 boletas a la vez.';
  end if;

  -- BR-N11 y D-198: el personal busca SOLO por numero. Un nombre, un telefono
  -- o un codigo interno no consultan nada y devuelven lo mismo que un numero
  -- que no existe.
  if v_search <> '' and v_search !~ '^[0-9]{1,4}$' then
    return;
  end if;

  -- El recuento va aparte y ANTES de paginar: cuenta exactamente el conjunto
  -- filtrado, y deja que la pagina use el indice de `created_at`.
  select count(*) into v_total
    from tickets t
   where t.organization_id in (select current_staff_org_ids())
     and (v_search = ''
          or t.daily_number like '%' || v_search || '%'
          or t.weekly_number like '%' || v_search || '%')
     and (p_ticket_ids is null or t.id = any (p_ticket_ids))
     and (p_raffle_id is null or t.raffle_id = p_raffle_id)
     and (p_seller_id is null or t.seller_id = p_seller_id)
     and (p_inventory_status is null or t.inventory_status = p_inventory_status)
     -- «Sin pagar» es `unpaid` O `partial`, y solo de boletas vendidas.
     and (p_payment_state is null
          or (t.inventory_status = 'assigned'
              and (case when t.payment_status = 'paid' then 'paid' else 'unpaid' end)
                  = p_payment_state));

  if v_total = 0 then
    return;
  end if;

  return query
  select
    t.id,
    t.daily_number,
    t.weekly_number,
    t.inventory_status,
    case
      when t.inventory_status <> 'assigned' then null
      when t.payment_status = 'paid' then 'paid'
      else 'unpaid'
    end,
    case
      when t.inventory_status <> 'assigned' then null
      when t.clearance_receipt_delivered_at is null then 'pending'
      when t.clearance_receipt_assumed_delivered then 'assumed'
      else 'delivered'
    end,
    t.raffle_id,
    r.name,
    r.short_code,
    t.seller_id,
    v_total
  from tickets t
  left join raffles r on r.id = t.raffle_id
  where t.organization_id in (select current_staff_org_ids())
    and (v_search = ''
         or t.daily_number like '%' || v_search || '%'
         or t.weekly_number like '%' || v_search || '%')
    and (p_ticket_ids is null or t.id = any (p_ticket_ids))
    and (p_raffle_id is null or t.raffle_id = p_raffle_id)
    and (p_seller_id is null or t.seller_id = p_seller_id)
    and (p_inventory_status is null or t.inventory_status = p_inventory_status)
    and (p_payment_state is null
         or (t.inventory_status = 'assigned'
             and (case when t.payment_status = 'paid' then 'paid' else 'unpaid' end)
                 = p_payment_state))
  order by
    -- ORDEN PEDIDO (P1-B). Delante de todo: si alguien pulsa una cabecera
    -- estando en una busqueda, manda lo que pulso. Una expresion por tipo.
    -- Con `v_sort` nulo las cuatro valen null y no ordenan nada: queda
    -- exactamente el orden de antes, sin tocar una coma.
    case when v_sort is not null and v_asc then
      case v_sort
        when 'dailyNumber'     then t.daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then t.inventory_status::text
        when 'paymentState'    then case
          when t.inventory_status <> 'assigned' then null
          when t.payment_status = 'paid' then 'paid'
          else 'unpaid' end
        when 'clearance'       then case
          when t.inventory_status <> 'assigned' then null
          when t.clearance_receipt_delivered_at is null then 'pending'
          when t.clearance_receipt_assumed_delivered then 'assumed'
          else 'delivered' end
      end
    end asc nulls last,
    case when v_sort is not null and not v_asc then
      case v_sort
        when 'dailyNumber'     then t.daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then t.inventory_status::text
        when 'paymentState'    then case
          when t.inventory_status <> 'assigned' then null
          when t.payment_status = 'paid' then 'paid'
          else 'unpaid' end
        when 'clearance'       then case
          when t.inventory_status <> 'assigned' then null
          when t.clearance_receipt_delivered_at is null then 'pending'
          when t.clearance_receipt_assumed_delivered then 'assumed'
          else 'delivered' end
      end
    end desc nulls last,
    -- Sin busqueda, lo mas reciente primero (como `listTickets`). Con busqueda,
    -- la relevancia de `search_tickets`: el diario manda sobre el semanal.
    case
      when v_search = '' then 0
      when t.daily_number = v_search then 0
      when t.daily_number like v_search || '%' then 1
      when t.daily_number like '%' || v_search || '%' then 2
      when t.weekly_number = v_search then 3
      when t.weekly_number like v_search || '%' then 4
      else 5
    end,
    case when v_search = '' then t.created_at end desc nulls last,
    case when v_search <> '' then t.daily_number end,
    case when v_search <> '' then t.weekly_number end,
    t.id
  limit v_limit
  offset v_offset;
end;
$$;

comment on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer, text, text) is
  'D-198: boletas del personal con lista blanca. Sin cliente, precio, abonado ni saldo; estado de pago en dos valores (paid/unpaid) y solo para boletas asignadas. Busca unicamente por numero. El orden pedido (p_sort_column) tiene su propia lista blanca, mas corta: ni cliente ni dinero, porque el orden de una lista delata lo que la lista no muestra.';

revoke execute on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer, text, text) from public, anon;
grant  execute on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer, text, text) to authenticated, service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Reversible SIN perdida de datos: esta migracion no crea ni cambia ninguna
-- tabla, columna, restriccion ni fila. Solo redefine dos funciones de lectura
-- anadiendoles dos parametros con `default null`.
--
-- Para volver atras, se vuelven a crear con la firma de 0049 y 0057 —el cuerpo
-- es el mismo sin las expresiones de `order by` nuevas— y se restituyen sus
-- privilegios, que el `drop` se lleva:
--
--   drop function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer, text, text);
--   drop function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer, text, text);
--   -- y a continuacion, el bloque `create function` de 0049 (lineas 276-500) y
--   -- el de 0057 (lineas 1200-1326), con sus `revoke`/`grant`:
--   --   search_tickets      -> authenticated
--   --   admin_list_tickets  -> authenticated, service_role
--
-- QUE HAY QUE CAMBIAR ANTES EN LA APLICACION: `listTickets`, `listAdminTickets`
-- y las dos paginas de boletas dejan de pasar `p_sort_column` y
-- `p_sort_direction`; sin eso, la llamada falla por firma. El resto del orden
-- —el de PostgREST, en pagos, clientes, vendedores, rifas y administradores— no
-- depende de esta migracion y seguiria funcionando.
-- =============================================================================
