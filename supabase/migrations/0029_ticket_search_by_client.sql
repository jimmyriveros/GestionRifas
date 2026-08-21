-- =============================================================================
-- 0029_ticket_search_by_client.sql
-- El buscador de boletas encuentra tambien por el nombre del cliente
--
-- Referencia normativa: docs/BUSINESS_RULES.md BR-N11 y BR-N13,
-- docs/DECISIONS.md D-100. Amplia 0018 sin cambiar nada de lo que ya hacia.
--
-- QUE CAMBIA Y POR QUE
--
-- Hasta ahora, para ver las boletas de un cliente habia que salir de «Boletas»,
-- entrar en «Clientes», buscar a la persona, abrir su ficha y volver. Es el
-- recorrido mas frecuente del vendedor y son cuatro pantallas para una
-- pregunta de una sola linea: «que tiene Jimmy».
--
-- La regla funcional pasa a ser:
--
--   En «Boletas» hay UN campo de busqueda. Si lo que se escribe es un numero
--   de boleta, busca por sus numeros (igual que antes). Si es texto, busca por
--   el cliente que tiene la boleta. En los dos casos el resultado es una lista
--   de BOLETAS: seguimos en «Boletas».
--
-- POR QUE DOS RAMAS SEPARADAS Y NO UN SOLO `where` CON `or`
--
-- Con un `or` que mezcle numeros y nombre, PostgreSQL tiene que planificar una
-- consulta que sirva para los dos casos y acaba barriendo `tickets` entera.
-- Separandolas, cada rama conserva su propio plan:
--
--   * numeros -> trigramas de `daily_number` y `weekly_number` (0018),
--   * nombre  -> trigrama de `clients.search_text` (0017) y despues
--     `tickets_client_idx` (0003) para saltar a las boletas de esos clientes.
--
-- Ademas, la rama de numeros queda IDENTICA a la de 0018: ampliar la busqueda
-- no puede cambiar ni un resultado ni un orden de los que ya funcionaban.
--
-- POR QUE UN `join` INTERNO CONTRA `clients` EN LA RAMA DE NOMBRE
--
-- Al reves que en 0018 (I-015), aqui el cliente NO es un adorno: una boleta sin
-- cliente no puede coincidir con el nombre de nadie, asi que el `join` interno
-- es la condicion de busqueda, no una perdida de filas. La rama de numeros
-- conserva su `left join` intacto.
--
-- PERMISOS: SE HEREDAN, NO SE AMPLIAN
--
-- La funcion sigue siendo `security invoker`, y por tanto sigue leyendo
-- `tickets` bajo `tickets_select` y ahora tambien `clients` bajo
-- `clients_select`. Las dos politicas son simetricas (organizacion + personal o
-- vendedor propietario), asi que un vendedor solo encuentra SUS boletas por el
-- nombre de SUS clientes, y buscar el nombre de un cliente ajeno no revela ni
-- que exista. No hace falta ni un filtro nuevo: buscar por un camino distinto
-- no abre una puerta distinta.
--
-- `create or replace` conserva los privilegios de 0018 (`authenticated` si,
-- `public` y `anon` no) y NO cambia la firma ni las columnas devueltas: la
-- aplicacion y sus tipos generados siguen valiendo tal cual.
-- =============================================================================

create or replace function search_tickets(
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
  -- RAMA 1 — numeros de la boleta (BR-N11, sin cambios respecto de 0018)
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
  'Busca boletas con UN solo termino: si son de 1 a 4 digitos, por numero diario y semanal (parcial, el diario primero — BR-N11); si es texto, por el nombre del cliente que las tiene (BR-N13). El codigo interno NO participa. Devuelve siempre BOLETAS, ordenadas por relevancia. SECURITY INVOKER: hereda tickets_select y clients_select, de modo que un vendedor solo encuentra sus boletas por el nombre de sus clientes.';

-- =============================================================================
-- Indices
--
-- No se crea ninguno: los dos caminos ya estan cubiertos y se comprobo con
-- `explain` sobre la base local antes de escribir esto.
--
--   * `clients_search_text_trgm_idx` (0017) resuelve `search_text like '%x%'`
--     a partir de tres caracteres. Con dos, PostgreSQL no puede extraer un
--     trigrama completo y vuelve al barrido de `clients` — que es la tabla
--     PEQUENA del sistema, no la grande. Misma limitacion conocida que en 0018.
--   * `tickets_client_idx` (0003) lleva de esos clientes a sus boletas. Es
--     parcial (`where client_id is not null`) y el `join` interno implica esa
--     condicion, asi que el planificador puede usarlo.
--
-- Crear un indice «por si acaso» tiene coste en cada insercion de boleta; la
-- regla del proyecto es no anadir uno sin evidencia de que hace falta.
-- =============================================================================

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- No hay objetos nuevos que borrar: esta migracion solo reemplaza el cuerpo de
-- `search_tickets`. Para volver atras se vuelve a ejecutar el `create function`
-- de 0018 (como `create or replace`) y se revierte `src/lib/search.ts`
-- (`isTicketSearchTerm`), que es quien deja pasar el texto hasta aqui. Con el
-- cuerpo viejo y el codigo nuevo, buscar por nombre devolveria cero filas; no
-- rompe nada mas.
-- =============================================================================
