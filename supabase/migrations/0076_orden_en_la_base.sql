-- =============================================================================
-- 0076 — ORDENAR Y PAGINAR EN LA BASE (cierre de P1-B y P1-H, D-214)
--
-- QUE QUEDABA PENDIENTE DE LA 0075. Dos cosas, y las dos eran soluciones a
-- medias:
--
--   1. Vendedores, Rifas y Administradores leian la lista ENTERA con
--      `fetchAllRows` y la recortaban en el servidor. El navegador recibia una
--      pagina, si, pero el servidor seguia trayendo y ordenando todas las filas
--      en cada visita.
--   2. «Cliente», «Falta» y «Progreso» de «Mis boletas» dejaron de poder
--      ordenarse porque PostgREST no sabe ordenar por una columna de `clients`
--      —hay dos claves ajenas— ni por una expresion. Que una sintaxis de
--      PostgREST falle no demuestra que la funcionalidad sea imposible: lo que
--      hacia falta era darle a PostgREST una RELACION que si tuviera esas
--      columnas.
--
-- COMO SE CIERRA. Donde el RLS alcanza, una VISTA con `security_invoker`, que
-- PostgREST ordena, filtra, cuenta y pagina como cualquier tabla. Donde no
-- alcanza —el personal NO puede leer `tickets`: `tickets_select` solo devuelve
-- las boletas del propio vendedor—, una funcion `security definer` acotada con
-- `current_staff_org_ids()`, como las `admin_*` de 0057.
--
-- | Lista            | Que se crea              | Por que esa forma                |
-- |------------------|--------------------------|----------------------------------|
-- | Mis boletas      | `v_seller_ticket_list`   | el vendedor SI lee sus boletas   |
-- | Administradores  | `v_org_member_list`      | el personal SI lee `memberships` |
-- | Vendedores       | `admin_list_sellers`     | cuenta boletas: no las puede leer|
-- | Rifas            | `admin_list_raffles`     | igual                            |
--
-- D-198 NO SE TOCA. Las dos funciones del personal devuelven RECUENTOS y nada
-- mas: ni cliente, ni precio de venta, ni abonado, ni saldo. Sus listas blancas
-- de orden tampoco los admiten, porque ordenar por una columna es preguntar por
-- ella. Las columnas de dinero y de cliente que se recuperan son SOLO del
-- portal del vendedor, sobre su propia cartera.
--
-- LAS DOS FUNCIONES DE 0075 se redefinen con `create or replace`: misma firma,
-- mismo resultado, solo cambia el cuerpo. Asi conservan sus privilegios y la
-- 0075 no se reescribe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. v_seller_ticket_list — «Mis boletas», con TODO lo que la pantalla ordena
--
-- `security_invoker`: hereda `tickets_select` y `clients_select`, de modo que un
-- vendedor ve exactamente sus boletas y el nombre de sus clientes, igual que
-- antes. El personal, por esas mismas politicas, no obtiene ni una fila (D-198).
--
-- Las dos columnas calculadas siguen la MISMA regla que `ticketFinancials`
-- (src/features/tickets/financials.ts): vendida es `assigned` Y con precio. Una
-- boleta sin vender vale NULL en las dos, no cero: cero significaria «vendida y
-- sin abonar», y ademas asi caen al final del orden, que es donde la pantalla
-- pinta su «—».
-- -----------------------------------------------------------------------------
create view v_seller_ticket_list
with (security_invoker = true) as
select
  t.id,
  t.organization_id,
  t.internal_code,
  t.daily_number,
  t.weekly_number,
  t.inventory_status,
  t.payment_status,
  t.sale_price,
  t.paid_amount,
  t.sale_date,
  t.created_at,
  t.raffle_id,
  r.name                                as raffle_name,
  r.short_code                          as raffle_short_code,
  t.seller_id,
  sp.full_name                          as seller_name,
  t.client_id,
  c.name                                as client_name,
  t.clearance_receipt_delivered_at,
  t.clearance_receipt_assumed_delivered,
  case
    when t.inventory_status = 'assigned' and t.sale_price is not null
    then greatest(t.sale_price - t.paid_amount, 0)
  end                                   as pending_amount,
  case
    when t.inventory_status = 'assigned' and coalesce(t.sale_price, 0) > 0
    then least(t.paid_amount::numeric / t.sale_price, 1)
  end                                   as paid_ratio
from tickets t
-- `left join` en los tres: si quien consulta no puede ver la rifa, el cliente o
-- el perfil, se pierde el nombre, nunca la boleta (I-015).
left join raffles  r  on r.id  = t.raffle_id
left join clients  c  on c.id  = t.client_id
left join profiles sp on sp.id = t.seller_id;

comment on view v_seller_ticket_list is
  'D-214: «Mis boletas» con el nombre del cliente, el del vendedor, el saldo y el progreso como COLUMNAS, para que el orden y la paginacion los resuelva la base. security_invoker: un vendedor ve solo sus boletas; el personal, ninguna (D-198).';

revoke all on v_seller_ticket_list from public, anon;
grant select on v_seller_ticket_list to authenticated;

-- -----------------------------------------------------------------------------
-- 2. v_org_member_list — «Administradores», y el equipo de «Vendedores»
--
-- `security_invoker`: hereda `memberships_select` y `profiles_select`. El
-- personal ve a los miembros de su organizacion; un vendedor, a si mismo y a su
-- equipo, que es lo que ya veia.
--
-- `account_active` es la conjuncion de las dos banderas, como `mapMember`
-- (BR-A05): el acceso efectivo exige membresia Y perfil activos, y ordenar por
-- una sola de las dos daria una lista que no cuadra con lo que se pinta.
-- -----------------------------------------------------------------------------
create view v_org_member_list
with (security_invoker = true) as
select
  m.id                       as membership_id,
  m.organization_id,
  m.profile_id,
  m.role,
  m.created_at,
  m.parent_seller_id,
  m.commission_model,
  m.fixed_commission_amount,
  p.full_name,
  p.alias,
  p.phone,
  p.email,
  p.activated_at,
  (m.is_active and p.is_active) as account_active,
  -- Cuantos vendedores tiene a su cargo, y de quien depende. Los dos salian
  -- antes de recorrer la lista completa en el servidor (BR-E08).
  (select count(*)
     from memberships h
    where h.parent_seller_id = m.profile_id
      and h.organization_id  = m.organization_id) as team_size,
  pp.full_name               as parent_seller_name
from memberships m
join profiles p on p.id = m.profile_id
left join memberships pm
       on pm.profile_id      = m.parent_seller_id
      and pm.organization_id = m.organization_id
left join profiles pp on pp.id = pm.profile_id;

comment on view v_org_member_list is
  'D-214: miembros de la organizacion con el nombre, el estado efectivo de la cuenta, el tamano de su equipo y de quien dependen, como COLUMNAS. security_invoker: hereda memberships_select y profiles_select.';

revoke all on v_org_member_list from public, anon;
grant select on v_org_member_list to authenticated;

-- -----------------------------------------------------------------------------
-- 3. admin_list_sellers — «Vendedores», contando en SQL
--
-- `security definer` porque cuenta BOLETAS y el personal no puede leerlas
-- (`tickets_select` es del vendedor). Se acota con `current_staff_org_ids()`,
-- igual que las `admin_*` de 0057: quien no sea personal activo recibe un
-- conjunto vacio, que es lo mismo que recibiria un id que no existe.
--
-- DEVUELVE RECUENTOS, NUNCA DINERO (D-198, BR-Q08).
-- -----------------------------------------------------------------------------
create function admin_list_sellers(
  p_raffle_id      uuid default null,
  p_sort_column    text default null,
  p_sort_direction text default null,
  p_limit          integer default 25,
  p_offset         integer default 0
)
returns table (
  membership_id            uuid,
  profile_id               uuid,
  role                     app_role,
  account_active           boolean,
  full_name                text,
  alias                    text,
  phone                    text,
  email                    text,
  created_at               timestamptz,
  activated_at             timestamptz,
  parent_seller_id         uuid,
  parent_seller_name       text,
  commission_model         commission_model,
  fixed_commission_amount  bigint,
  team_size                bigint,
  tickets_total            bigint,
  tickets_available        bigint,
  tickets_assigned         bigint,
  tickets_pending_approval bigint,
  tickets_draft            bigint,
  tickets_cancelled        bigint,
  tickets_paid             bigint,
  tickets_not_paid         bigint,
  total_count              bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  -- Lista blanca del orden. Son los `id` de las columnas de `SellersTable`, y
  -- no hay ninguna de dinero: el personal no ve la cartera de nadie.
  v_sort text := nullif(coalesce(p_sort_column, ''), '');
  v_asc  boolean := coalesce(p_sort_direction, 'asc') <> 'desc';
  v_total bigint;
begin
  if v_sort is not null
     and v_sort not in ('fullName', 'isActive', 'ticketsTotal',
                        'ticketsAssigned', 'ticketsPendingApproval') then
    raise exception 'No se puede ordenar por esa columna.';
  end if;

  -- El recuento va ANTES de paginar y cuenta exactamente el conjunto: es lo que
  -- la barra de paginacion anuncia.
  select count(*) into v_total
    from memberships m
   where m.organization_id in (select current_staff_org_ids())
     and m.role = 'seller';

  if v_total = 0 then
    return;
  end if;

  /*
    CAMINO RAPIDO: el orden no depende de los recuentos, asi que la pagina se
    elige mirando solo `memberships` y `profiles`, y las boletas se cuentan
    despues UNICAMENTE para esas 25 personas.

    Medido: agregar `tickets` entero para ensenar 25 filas costaba mas que leer
    la lista completa, que es justo lo que este trabajo venia a evitar.
  */
  if v_sort is null or v_sort not in ('ticketsTotal', 'ticketsAssigned',
                                      'ticketsPendingApproval') then
    return query
    with pagina as (
      -- Cada columna con su nombre: el `lateral` de abajo las referencia por el.
      select
        m.id                          as membership_id,
        m.profile_id                  as profile_id,
        m.role                        as role,
        (m.is_active and p.is_active) as account_active,
        p.full_name                   as full_name,
        p.alias                       as alias,
        p.phone                       as phone,
        p.email                       as email,
        m.created_at                  as created_at,
        p.activated_at                as activated_at,
        m.parent_seller_id            as parent_seller_id,
        pp.full_name                  as parent_seller_name,
        m.commission_model            as commission_model,
        m.fixed_commission_amount     as fixed_commission_amount,
        (select count(*)
           from memberships h
          where h.parent_seller_id = m.profile_id
            and h.organization_id  = m.organization_id) as team_size
      from memberships m
      join profiles p on p.id = m.profile_id
      left join memberships pm
             on pm.profile_id      = m.parent_seller_id
            and pm.organization_id = m.organization_id
      left join profiles pp on pp.id = pm.profile_id
      where m.organization_id in (select current_staff_org_ids())
        and m.role = 'seller'
      order by
        case when v_sort is not null and v_asc then
          case v_sort when 'fullName' then p.full_name end
        end asc nulls last,
        case when v_sort is not null and not v_asc then
          case v_sort when 'fullName' then p.full_name end
        end desc nulls last,
        case when v_sort = 'isActive' and v_asc
             then (m.is_active and p.is_active)::int end asc nulls last,
        case when v_sort = 'isActive' and not v_asc
             then (m.is_active and p.is_active)::int end desc nulls last,
        m.created_at,
        m.profile_id
      limit  least(greatest(coalesce(p_limit, 25), 0), 1000)
     offset greatest(coalesce(p_offset, 0), 0)
    )
    select
      pg.membership_id, pg.profile_id, pg.role, pg.account_active, pg.full_name, pg.alias,
      pg.phone, pg.email, pg.created_at, pg.activated_at, pg.parent_seller_id,
      pg.parent_seller_name, pg.commission_model, pg.fixed_commission_amount,
      pg.team_size,
      k.c_total, k.c_available, k.c_assigned, k.c_pending,
      k.c_draft, k.c_cancelled, k.c_paid, k.c_not_paid,
      v_total
    from pagina pg
    cross join lateral (
      select
        count(*)                                                        as c_total,
        count(*) filter (where t.inventory_status = 'available')        as c_available,
        count(*) filter (where t.inventory_status = 'assigned')         as c_assigned,
        count(*) filter (where t.inventory_status = 'pending_approval') as c_pending,
        count(*) filter (where t.inventory_status = 'draft')            as c_draft,
        count(*) filter (where t.inventory_status = 'cancelled')        as c_cancelled,
        count(*) filter (where t.inventory_status = 'assigned'
                           and t.payment_status = 'paid')               as c_paid,
        count(*) filter (where t.inventory_status = 'assigned'
                           and t.payment_status <> 'paid')              as c_not_paid
      from tickets t
      where t.seller_id = pg.profile_id
        and t.organization_id in (select current_staff_org_ids())
        and (p_raffle_id is null or t.raffle_id = p_raffle_id)
    ) k;
    return;
  end if;

  -- CAMINO LENTO, y no hay otro: ordenar POR un recuento exige contarlos todos.
  return query
  with conteo as (
    select
      t.seller_id,
      count(*)                                                        as c_total,
      count(*) filter (where t.inventory_status = 'available')        as c_available,
      count(*) filter (where t.inventory_status = 'assigned')         as c_assigned,
      count(*) filter (where t.inventory_status = 'pending_approval') as c_pending,
      count(*) filter (where t.inventory_status = 'draft')            as c_draft,
      count(*) filter (where t.inventory_status = 'cancelled')        as c_cancelled,
      count(*) filter (where t.inventory_status = 'assigned'
                         and t.payment_status = 'paid')               as c_paid,
      count(*) filter (where t.inventory_status = 'assigned'
                         and t.payment_status <> 'paid')              as c_not_paid
    from tickets t
    where t.organization_id in (select current_staff_org_ids())
      and (p_raffle_id is null or t.raffle_id = p_raffle_id)
    group by t.seller_id
  )
  select
      m.id, m.profile_id, m.role, (m.is_active and p.is_active),
      p.full_name, p.alias, p.phone, p.email, m.created_at, p.activated_at,
      m.parent_seller_id, pp.full_name, m.commission_model, m.fixed_commission_amount,
      (select count(*)
         from memberships h
        where h.parent_seller_id = m.profile_id
          and h.organization_id  = m.organization_id),
    coalesce(k.c_total, 0), coalesce(k.c_available, 0), coalesce(k.c_assigned, 0),
    coalesce(k.c_pending, 0), coalesce(k.c_draft, 0), coalesce(k.c_cancelled, 0),
    coalesce(k.c_paid, 0), coalesce(k.c_not_paid, 0),
    v_total
  from memberships m
  join profiles p on p.id = m.profile_id
  left join memberships pm
         on pm.profile_id      = m.parent_seller_id
        and pm.organization_id = m.organization_id
  left join profiles pp on pp.id = pm.profile_id
  left join conteo k on k.seller_id = m.profile_id
  where m.organization_id in (select current_staff_org_ids())
    and m.role = 'seller'
  order by
    case when v_asc then
      case v_sort
        when 'ticketsTotal'           then coalesce(k.c_total, 0)
        when 'ticketsAssigned'        then coalesce(k.c_assigned, 0)
        when 'ticketsPendingApproval' then coalesce(k.c_pending, 0)
      end
    end asc nulls last,
    case when not v_asc then
      case v_sort
        when 'ticketsTotal'           then coalesce(k.c_total, 0)
        when 'ticketsAssigned'        then coalesce(k.c_assigned, 0)
        when 'ticketsPendingApproval' then coalesce(k.c_pending, 0)
      end
    end desc nulls last,
    m.created_at,
    m.profile_id
  limit  least(greatest(coalesce(p_limit, 25), 0), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function admin_list_sellers(uuid, text, text, integer, integer) is
  'D-214: una pagina de «Vendedores» ordenada y contada en SQL, con su equipo y sus recuentos de inventario. D-198: ni un importe, y la lista blanca de orden no admite dinero.';

revoke execute on function admin_list_sellers(uuid, text, text, integer, integer) from public, anon;
grant  execute on function admin_list_sellers(uuid, text, text, integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. admin_list_raffles — «Rifas», contando en SQL
--
-- Mismo motivo y misma forma. El precio de la rifa SI es del personal —es
-- configuracion de la rifa, no la cartera de nadie— y por eso se puede ordenar.
-- -----------------------------------------------------------------------------
create function admin_list_raffles(
  p_sort_column    text default null,
  p_sort_direction text default null,
  p_limit          integer default 25,
  p_offset         integer default 0
)
returns table (
  id                          uuid,
  short_code                  text,
  name                        text,
  status                      raffle_status,
  ticket_price                bigint,
  start_date                  date,
  end_date                    date,
  allow_seller_ticket_creation boolean,
  description                 text,
  created_at                  timestamptz,
  closed_at                   timestamptz,
  prize_mode                  text,
  tickets_total               bigint,
  tickets_available           bigint,
  tickets_assigned            bigint,
  tickets_pending_approval    bigint,
  tickets_draft               bigint,
  tickets_cancelled           bigint,
  tickets_paid                bigint,
  tickets_not_paid            bigint,
  total_count                 bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sort text := nullif(coalesce(p_sort_column, ''), '');
  v_asc  boolean := coalesce(p_sort_direction, 'asc') <> 'desc';
  v_total bigint;
begin
  if v_sort is not null
     and v_sort not in ('shortCode', 'name', 'status', 'ticketPrice',
                        'ticketsTotal', 'ticketsAssigned', 'startDate') then
    raise exception 'No se puede ordenar por esa columna.';
  end if;

  select count(*) into v_total
    from raffles rf
   where rf.organization_id in (select current_staff_org_ids());

  if v_total = 0 then
    return;
  end if;

  /*
    CAMINO RAPIDO: el orden no depende de los recuentos, asi que la pagina se
    elige mirando solo `raffles` y las boletas se cuentan despues, unicamente
    para esas 25 filas.
  */
  if v_sort is null or v_sort not in ('ticketsTotal', 'ticketsAssigned') then
    return query
    with pagina as (
      select rf.*
        from raffles rf
       where rf.organization_id in (select current_staff_org_ids())
       order by
        case when v_sort is not null and v_asc then
          case v_sort
            when 'shortCode' then rf.short_code
            when 'name'      then rf.name
            when 'status'    then rf.status::text
          end
        end asc nulls last,
        case when v_sort is not null and not v_asc then
          case v_sort
            when 'shortCode' then rf.short_code
            when 'name'      then rf.name
            when 'status'    then rf.status::text
          end
        end desc nulls last,
        case when v_sort = 'ticketPrice' and v_asc then rf.ticket_price end asc nulls last,
        case when v_sort = 'ticketPrice' and not v_asc then rf.ticket_price end desc nulls last,
        case when v_sort = 'startDate' and v_asc then rf.start_date end asc nulls last,
        case when v_sort = 'startDate' and not v_asc then rf.start_date end desc nulls last,
        rf.short_code desc,
        rf.id
       limit  least(greatest(coalesce(p_limit, 25), 0), 1000)
      offset greatest(coalesce(p_offset, 0), 0)
    )
    select
      pg.id, pg.short_code, pg.name, pg.status, pg.ticket_price, pg.start_date,
      pg.end_date, pg.allow_seller_ticket_creation, pg.description, pg.created_at,
      pg.closed_at, pg.prize_mode::text,
      k.c_total, k.c_available, k.c_assigned, k.c_pending,
      k.c_draft, k.c_cancelled, k.c_paid, k.c_not_paid,
      v_total
    from pagina pg
    cross join lateral (
      select
        count(*)                                                        as c_total,
        count(*) filter (where t.inventory_status = 'available')        as c_available,
        count(*) filter (where t.inventory_status = 'assigned')         as c_assigned,
        count(*) filter (where t.inventory_status = 'pending_approval') as c_pending,
        count(*) filter (where t.inventory_status = 'draft')            as c_draft,
        count(*) filter (where t.inventory_status = 'cancelled')        as c_cancelled,
        count(*) filter (where t.inventory_status = 'assigned'
                           and t.payment_status = 'paid')               as c_paid,
        count(*) filter (where t.inventory_status = 'assigned'
                           and t.payment_status <> 'paid')              as c_not_paid
      from tickets t
      where t.raffle_id = pg.id
        and t.organization_id in (select current_staff_org_ids())
    ) k;
    return;
  end if;

  -- CAMINO LENTO, y no hay otro: ordenar POR un recuento exige contarlos todos.
  return query
  with conteo as (
    select
      t.raffle_id,
      count(*)                                                        as c_total,
      count(*) filter (where t.inventory_status = 'available')        as c_available,
      count(*) filter (where t.inventory_status = 'assigned')         as c_assigned,
      count(*) filter (where t.inventory_status = 'pending_approval') as c_pending,
      count(*) filter (where t.inventory_status = 'draft')            as c_draft,
      count(*) filter (where t.inventory_status = 'cancelled')        as c_cancelled,
      count(*) filter (where t.inventory_status = 'assigned'
                         and t.payment_status = 'paid')               as c_paid,
      count(*) filter (where t.inventory_status = 'assigned'
                         and t.payment_status <> 'paid')              as c_not_paid
    from tickets t
    where t.organization_id in (select current_staff_org_ids())
    group by t.raffle_id
  )
  select
    rf.id, rf.short_code, rf.name, rf.status, rf.ticket_price, rf.start_date,
    rf.end_date, rf.allow_seller_ticket_creation, rf.description, rf.created_at,
    rf.closed_at, rf.prize_mode::text,
    coalesce(k.c_total, 0), coalesce(k.c_available, 0), coalesce(k.c_assigned, 0),
    coalesce(k.c_pending, 0), coalesce(k.c_draft, 0), coalesce(k.c_cancelled, 0),
    coalesce(k.c_paid, 0), coalesce(k.c_not_paid, 0),
    v_total
  from raffles rf
  left join conteo k on k.raffle_id = rf.id
  where rf.organization_id in (select current_staff_org_ids())
  order by
    case when v_asc then
      case v_sort
        when 'ticketsTotal'    then coalesce(k.c_total, 0)
        when 'ticketsAssigned' then coalesce(k.c_assigned, 0)
      end
    end asc nulls last,
    case when not v_asc then
      case v_sort
        when 'ticketsTotal'    then coalesce(k.c_total, 0)
        when 'ticketsAssigned' then coalesce(k.c_assigned, 0)
      end
    end desc nulls last,
    rf.short_code desc,
    rf.id
  limit  least(greatest(coalesce(p_limit, 25), 0), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function admin_list_raffles(text, text, integer, integer) is
  'D-214: una pagina de «Rifas» ordenada y contada en SQL, con sus recuentos de inventario. D-198: ningun importe de cartera; el precio de la rifa si, que es configuracion.';

revoke execute on function admin_list_raffles(text, text, integer, integer) from public, anon;
grant  execute on function admin_list_raffles(text, text, integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. search_tickets — el buscador del vendedor ordena tambien por cliente,
--    saldo y progreso. Misma firma: `create or replace` conserva privilegios.
-- -----------------------------------------------------------------------------
create or replace function search_tickets(
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
                        'paymentStatus', 'paidAmount', 'salePrice',
                        -- Las tres que 0075 dejo fuera por no poder ordenarlas
                        -- desde PostgREST. Aqui si se pueden: el nombre del
                        -- cliente esta en el join y las dos cifras se calculan
                        -- con las mismas reglas que ticketFinancials.
                        'clientName', 'pendingAmount', 'percentage') then
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
    -- ORDEN PEDIDO (P1-B, ampliado en D-214). Va DELANTE de la relevancia: si
    -- alguien pulsa una cabecera estando en una busqueda, manda lo que pulso.
    -- Una expresion por tipo, porque `case` no mezcla texto con numero.
    case when v_sort is not null and v_asc then
      case v_sort
        when 'dailyNumber'     then m.t_daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then m.t_inventory_status::text
        when 'paymentStatus'   then m.t_payment_status::text
        when 'clientName'      then c.name
      end
    end asc nulls last,
    case when v_sort is not null and not v_asc then
      case v_sort
        when 'dailyNumber'     then m.t_daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then m.t_inventory_status::text
        when 'paymentStatus'   then m.t_payment_status::text
        when 'clientName'      then c.name
      end
    end desc nulls last,
    case when v_sort is not null and v_asc then
      case v_sort
        when 'paidAmount'     then m.t_paid_amount::numeric
        when 'salePrice'      then m.t_sale_price::numeric
        when 'pendingAmount'  then case
          when m.t_inventory_status = 'assigned' and m.t_sale_price is not null
          then greatest(m.t_sale_price - m.t_paid_amount, 0)::numeric
        end
        when 'percentage'     then case
          when m.t_inventory_status = 'assigned' and coalesce(m.t_sale_price, 0) > 0
          then least(m.t_paid_amount::numeric / m.t_sale_price, 1)
        end
      end
    end asc nulls last,
    case when v_sort is not null and not v_asc then
      case v_sort
        when 'paidAmount'     then m.t_paid_amount::numeric
        when 'salePrice'      then m.t_sale_price::numeric
        when 'pendingAmount'  then case
          when m.t_inventory_status = 'assigned' and m.t_sale_price is not null
          then greatest(m.t_sale_price - m.t_paid_amount, 0)::numeric
        end
        when 'percentage'     then case
          when m.t_inventory_status = 'assigned' and coalesce(m.t_sale_price, 0) > 0
          then least(m.t_paid_amount::numeric / m.t_sale_price, 1)
        end
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
    -- ORDEN PEDIDO (P1-B, ampliado en D-214). Va DELANTE de la relevancia: si
    -- alguien pulsa una cabecera estando en una busqueda, manda lo que pulso.
    -- Una expresion por tipo, porque `case` no mezcla texto con numero.
    case when v_sort is not null and v_asc then
      case v_sort
        when 'dailyNumber'     then m.t_daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then m.t_inventory_status::text
        when 'paymentStatus'   then m.t_payment_status::text
        when 'clientName'      then m.t_client_name
      end
    end asc nulls last,
    case when v_sort is not null and not v_asc then
      case v_sort
        when 'dailyNumber'     then m.t_daily_number
        when 'raffleShortCode' then r.short_code
        when 'inventoryStatus' then m.t_inventory_status::text
        when 'paymentStatus'   then m.t_payment_status::text
        when 'clientName'      then m.t_client_name
      end
    end desc nulls last,
    case when v_sort is not null and v_asc then
      case v_sort
        when 'paidAmount'     then m.t_paid_amount::numeric
        when 'salePrice'      then m.t_sale_price::numeric
        when 'pendingAmount'  then case
          when m.t_inventory_status = 'assigned' and m.t_sale_price is not null
          then greatest(m.t_sale_price - m.t_paid_amount, 0)::numeric
        end
        when 'percentage'     then case
          when m.t_inventory_status = 'assigned' and coalesce(m.t_sale_price, 0) > 0
          then least(m.t_paid_amount::numeric / m.t_sale_price, 1)
        end
      end
    end asc nulls last,
    case when v_sort is not null and not v_asc then
      case v_sort
        when 'paidAmount'     then m.t_paid_amount::numeric
        when 'salePrice'      then m.t_sale_price::numeric
        when 'pendingAmount'  then case
          when m.t_inventory_status = 'assigned' and m.t_sale_price is not null
          then greatest(m.t_sale_price - m.t_paid_amount, 0)::numeric
        end
        when 'percentage'     then case
          when m.t_inventory_status = 'assigned' and coalesce(m.t_sale_price, 0) > 0
          then least(m.t_paid_amount::numeric / m.t_sale_price, 1)
        end
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
-- -----------------------------------------------------------------------------
-- 6. admin_list_tickets — el personal ordena tambien por «Vendedor».
-- -----------------------------------------------------------------------------
create or replace function admin_list_tickets(
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
                        'inventoryStatus', 'paymentState', 'clearance',
                        -- 0075 lo dejo fuera porque el nombre lo resolvia un
                        -- mapa en memoria. Aqui se une a `profiles` y se ordena
                        -- de verdad. Sigue sin ser un dato de cliente (D-198).
                        'sellerName') then
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
  -- Solo para ORDENAR por «Vendedor». No se proyecta: el `returns table` es el
  -- mismo de 0057 y la aplicacion sigue resolviendo el nombre con su mapa.
  left join profiles sp on sp.id = t.seller_id
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
        when 'sellerName'      then sp.full_name
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
        when 'sellerName'      then sp.full_name
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
-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Reversible SIN perdida de datos: esta migracion no crea ni cambia ninguna
-- tabla, columna, restriccion ni fila. Crea dos vistas de lectura y dos
-- funciones nuevas, y redefine dos funciones existentes sin tocar su firma.
--
--   drop view v_seller_ticket_list;
--   drop view v_org_member_list;
--   drop function admin_list_sellers(uuid, text, text, integer, integer);
--   drop function admin_list_raffles(text, text, integer, integer);
--   -- y volver a aplicar los `create or replace` de la 0075 para
--   -- `search_tickets` y `admin_list_tickets`, que conservan su firma.
--
-- QUE HAY QUE CAMBIAR ANTES EN LA APLICACION: «Mis boletas» vuelve a consultar
-- la tabla `tickets` en vez de la vista, y sus columnas «Cliente», «Falta» y
-- «Progreso» vuelven a no ofrecer orden; «Vendedores», «Rifas» y
-- «Administradores» vuelven a leer la lista entera y a recortarla en el
-- servidor con `sortAndPaginate`. Nada de eso pierde datos: son formas
-- distintas de leer lo mismo.
-- =============================================================================
