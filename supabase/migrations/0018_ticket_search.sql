-- =============================================================================
-- 0018_ticket_search.sql
-- Buscar una boleta por sus numeros, no por su codigo interno
--
-- Referencia normativa: docs/BUSINESS_RULES.md BR-N11, docs/DECISIONS.md D-080.
--
-- QUE CAMBIA Y POR QUE
--
-- Hasta ahora la busqueda de boletas miraba tres columnas: `internal_code`
-- (parcial), `daily_number` y `weekly_number` (exactos). Eso no es como se
-- trabaja: vendedores y administradores identifican una boleta por sus DOS
-- numeros —«el 1234 con el 5678»— y nunca por «R001-000019», que es un
-- identificador que genera el sistema y que nadie memoriza.
--
-- La regla funcional queda asi:
--
--   Para quien usa el sistema, una boleta se busca por su NUMERO DIARIO y,
--   en segundo lugar, por su NUMERO SEMANAL. El codigo interno es informacion
--   administrativa y solo aparece dentro del detalle de la boleta.
--
-- POR QUE HACE FALTA UNA FUNCION Y NO BASTA CON PostgREST
--
-- Dos exigencias que un `.or()` de PostgREST no puede cumplir a la vez:
--
--   1. COINCIDENCIA PARCIAL. «123» tiene que encontrar 1234, 0123 y 1237. La
--      comparacion exacta anterior no servia.
--   2. ORDEN POR RELEVANCIA. Lo que coincide en el numero diario va ANTES que
--      lo que solo coincide en el semanal. PostgREST solo ordena por columnas,
--      y la relevancia depende del termino buscado, asi que no es una columna.
--
-- Ordenar en el navegador no es una alternativa: la lista esta paginada en
-- servidor, asi que reordenar la pagina visible dejaria las coincidencias mas
-- relevantes escondidas en la pagina 7. Tiene que decidirlo SQL.
--
-- POR QUE `security invoker`
--
-- Igual que las funciones de reporte de 0013, y al reves que las RPC de 0007:
-- esta funcion solo LEE y no necesita ningun privilegio extra. Al heredar los
-- permisos de quien llama, `tickets_select` se aplica intacta y un vendedor
-- solo puede encontrar SUS boletas, sin que esta funcion filtre por
-- `seller_id` para protegerse. Los parametros son de usabilidad, no de
-- seguridad.
--
-- POR QUE LOS `left join`
--
-- Un `join` interno contra `raffles` o `clients` borraria la boleta entera si
-- quien consulta no puede ver esa fila (I-015). El nombre puede faltar; la
-- boleta no.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- search_tickets — busqueda por numero, ordenada por relevancia
--
-- `p_search` se acepta tal cual llega y se valida aqui dentro: un numero de
-- boleta es de 1 a 4 digitos (BR-N02) y nada mas. Cualquier otra cosa —«R001»,
-- «12A4», un codigo interno completo— no puede coincidir con ningun numero, asi
-- que la funcion devuelve cero filas en vez de inventarse una interpretacion.
--
-- Consecuencia buscada: buscar «R001» ya NO encuentra boletas por su codigo.
--
-- Como el termino queda reducido a digitos, `%` y `_` no pueden colarse dentro
-- del patron de `like`: no hay comodines que escapar.
--
-- `total_count` viaja en cada fila (`count(*) over ()`) para que la paginacion
-- tenga el total exacto sin una segunda consulta.
-- -----------------------------------------------------------------------------
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
  total_count       bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_needle text := trim(coalesce(p_search, ''));
begin
  -- Ni un numero de boleta ni parte de uno: nada que encontrar.
  if v_needle !~ '^[0-9]{1,4}$' then
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
      -- Relevancia: el numero diario manda sobre el semanal, y dentro de cada
      -- uno la coincidencia exacta va antes que el comienzo, y el comienzo
      -- antes que «contiene». Es el orden en que la gente espera encontrarlo.
      case
        when t.daily_number  =    v_needle             then 0
        when t.daily_number  like v_needle || '%'      then 1
        when t.daily_number  like '%' || v_needle || '%' then 2
        when t.weekly_number =    v_needle             then 3
        when t.weekly_number like v_needle || '%'      then 4
        else 5
      end                 as t_relevance,
      count(*) over ()    as t_total_count
    from tickets t
    where (t.daily_number  like '%' || v_needle || '%'
        or t.weekly_number like '%' || v_needle || '%')
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
  left join raffles r on r.id = m.t_raffle_id
  left join clients c on c.id = m.t_client_id
  -- Dentro del mismo escalon de relevancia, por numero. Ordenar por fecha
  -- devolvia «0100, 0103, 0109, 0105…» —el orden en que se crearon, que para
  -- quien mira la lista es ninguno—; por numero sale «0100, 0101, 0102…», que
  -- es como se recorre una lista de boletas con la vista.
  --
  -- Se comparan como TEXTO, igual que se guardan: «0007» va antes que «7», y
  -- eso es preferible a convertirlos a entero y perder los ceros.
  --
  -- `t_id` desempata al final: sin el, dos filas indistinguibles podrian
  -- alternar de pagina entre una consulta y la siguiente.
  order by m.t_relevance, m.t_daily_number, m.t_weekly_number, m.t_id
  limit  greatest(p_limit, 0)
  offset greatest(p_offset, 0);
end;
$$;

comment on function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer) is
  'Busca boletas por numero diario y semanal (parcial), ordenadas por relevancia: diario antes que semanal (BR-N11). El codigo interno NO participa. SECURITY INVOKER: hereda tickets_select, de modo que un vendedor solo encuentra sus boletas.';

-- -----------------------------------------------------------------------------
-- Privilegios (regla 3 de docs/SECURITY.md 4.5)
--
-- PostgreSQL concede EXECUTE a PUBLIC en toda funcion nueva y las default
-- privileges de 0015 no alcanzan a PUBLIC (I-020): se revoca explicitamente.
-- -----------------------------------------------------------------------------
revoke execute on function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer) from public, anon;
grant  execute on function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Indices de trigramas sobre los dos numeros
--
-- El patron pasa a ser `like '%123%'`: el comodin INICIAL impide usar los
-- B-tree de 0003 (`tickets_org_raffle_daily_idx` y su gemelo semanal), que
-- siguen siendo los que sirven a la restriccion de unicidad y a las busquedas
-- exactas y por prefijo. No se tocan.
--
-- Con trigramas el patron si se indexa a partir de TRES caracteres; con dos
-- («00») PostgreSQL no puede extraer ningun trigrama completo y vuelve al
-- barrido. Es una mejora parcial y conocida, no un remedio universal: se
-- documenta asi a proposito.
--
-- `pg_trgm` ya existe desde 0003; no se vuelve a crear.
-- -----------------------------------------------------------------------------
create index tickets_daily_number_trgm_idx  on tickets using gin (daily_number  gin_trgm_ops);
create index tickets_weekly_number_trgm_idx on tickets using gin (weekly_number gin_trgm_ops);

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   drop index tickets_weekly_number_trgm_idx;
--   drop index tickets_daily_number_trgm_idx;
--   drop function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer);
--
-- Revertir devuelve la busqueda de boletas a la version anterior SOLO si
-- tambien se revierte `src/features/tickets/queries.ts`: la aplicacion llama a
-- esta funcion cuando hay termino de busqueda. Sin funcion y con el codigo
-- nuevo, buscar una boleta falla; el listado sin buscar sigue intacto.
-- =============================================================================
