-- =============================================================================
-- RECUPERACIÓN: devolver el ESQUEMA de 0075-0077 al de 0074 (D-221)
--
-- NO es una migración: vive fuera de `supabase/migrations/` para que la CLI no
-- la aplique nunca sola. Se ejecuta a mano, con autorización expresa, y SOLO si
-- el problema está en la base. Si el problema es del código, la recuperación es
-- volver al despliegue anterior SIN tocar la base: el código de 9acbfa8 funciona
-- con 0077 aplicada (medido en local, D-221).
--
-- Generado a partir de los archivos de migración, no escrito a mano:
--   * 0077 -> la función de 0004 (líneas 19-47), con `create or replace`, que
--     conserva sus privilegios;
--   * 0076 -> quitar sus dos vistas y sus dos funciones;
--   * 0075 -> quitar las firmas nuevas y recrear las de 0049 (search_tickets) y
--     0057 (admin_list_tickets), con sus comentarios y privilegios.
--
-- No toca ni una fila. Todo en UNA transacción.
--
-- DESPUÉS, para que el historial diga lo mismo que el esquema:
--   supabase migration repair --status reverted 0077 0076 0075   (--local en el ensayo)
-- =============================================================================

begin;

-- Con una rifa R1000 o mayor, volver a 0004 haría que la SIGUIENTE se recortara
-- y chocara (I-157). En ese caso no se revierte 0077: se para aquí.
do $guard$
begin
  if exists (select 1 from raffles where short_code ~ '^R[0-9]{4,}$') then
    raise exception 'Hay rifas con código de cuatro cifras o más: no se revierte 0077 (I-157).';
  end if;
end;
$guard$;

-- ---------------------------------------------------------------- 0077 -> 0004
create or replace function raffles_set_short_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counter int;
begin
  if new.short_code is not null and btrim(new.short_code) <> '' then
    return new;
  end if;

  -- UPDATE ... RETURNING toma un lock de fila: dos rifas creadas a la vez en la
  -- misma organizacion no pueden recibir el mismo codigo.
  update organizations
     set raffle_counter = raffle_counter + 1
   where id = new.organization_id
  returning raffle_counter into v_counter;

  if v_counter is null then
    raise exception 'La organizacion % no existe', new.organization_id
      using errcode = 'foreign_key_violation';
  end if;

  new.short_code := 'R' || lpad(v_counter::text, 3, '0');
  return new;
end;
$$;

-- ------------------------------------------------------------ 0076 (lo que crea)
drop view v_seller_ticket_list;
drop view v_org_member_list;
drop function admin_list_sellers(uuid, text, text, integer, integer);
drop function admin_list_raffles(text, text, integer, integer);

-- ------------------------------------------------------ 0075 -> 0049 y 0057
drop function search_tickets(text, uuid, uuid, uuid, ticket_inventory_status, ticket_payment_status, integer, integer, text, text);
drop function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer, text, text);

-- search_tickets, de 0049 (líneas 276-508)
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

-- admin_list_tickets, de 0057 (líneas 1200-1329, 1711 y 1719)
create function admin_list_tickets(
  p_search           text default null,
  p_raffle_id        uuid default null,
  p_seller_id        uuid default null,
  p_inventory_status ticket_inventory_status default null,
  p_payment_state    text default null,
  p_ticket_ids       uuid[] default null,
  p_limit            integer default 25,
  p_offset           integer default 0
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
begin
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

comment on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer) is
  'D-198: boletas del personal con lista blanca. Sin cliente, precio, abonado ni saldo; estado de pago en dos valores (paid/unpaid) y solo para boletas asignadas. Busca unicamente por numero.';
revoke execute on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer) from public, anon;
grant execute on function admin_list_tickets(text, uuid, uuid, ticket_inventory_status, text, uuid[], integer, integer) to authenticated, service_role;

commit;
