-- =============================================================================
-- 0046_public_catalog_available_only.sql
-- El catalogo publico solo publica boletas DISPONIBLES, y trae sus totales.
--
-- Referencia normativa: docs/BUSINESS_RULES.md BR-K07, BR-K08, BR-K14 (nueva),
-- docs/DECISIONS.md D-164.
--
-- QUE CAMBIA Y POR QUE
--
-- Hasta ahora la reja publica enseñaba las boletas `available` Y las `assigned`,
-- estas ultimas en gris y con la palabra «Tomado». El dueño pide que una boleta
-- vendida NO se publique: no se pinta, no viaja al navegador y no ocupa sitio en
-- la paginacion. A cambio, el visitante necesita saber cuantas hay en total,
-- asi que los CONTEOS pasan a viajar con los metadatos.
--
-- POR QUE `drop` + `create` Y NO `create or replace`
--
-- Las dos funciones cambian su TIPO DE RETORNO —una pierde una columna, la otra
-- gana dos— y PostgreSQL no permite cambiar el `returns table` de una funcion
-- existente. No se edita `0043`: las migraciones aplicadas son inmutables
-- (docs/HANDOFF.md 8.2), asi que el cambio vive aqui y los privilegios se
-- vuelven a conceder al final, porque un `drop` se los lleva con el.
--
-- LOS CONTEOS VAN EN LOS METADATOS, NO EN UNA TERCERA FUNCION
--
-- `getPublicCatalog` ya hace DOS llamadas en paralelo: metadatos y boletas. Una
-- funcion nueva habria anadido una tercera ida y vuelta a cada visita para
-- devolver dos numeros. Colgarlos de `public_catalog_seller` los deja gratis en
-- una llamada que ya se hacia, y de paso garantiza que **no dependen de la
-- pagina ni de la busqueda**: la funcion de metadatos no recibe ninguna de las
-- dos cosas, asi que no puede contarlas mal aunque alguien lo intente.
--
-- UN SOLO RECORRIDO PARA LOS DOS CONTEOS
--
-- `count(*) filter (where ...)` dos veces sobre el MISMO `from` es una sola
-- pasada: no son dos consultas ni dos subconsultas correlacionadas. El indice
-- `tickets_seller_raffle_status_idx (seller_id, raffle_id, inventory_status)`
-- ya existia desde `0003` y cubre exactamente este acceso, asi que **no se crea
-- ningun indice nuevo**; se comprobo con `explain (analyze, buffers)` sobre
-- volumen antes de decidirlo (docs/TEST_RESULTS.md).
--
-- LO QUE NO CAMBIA
--
-- `public_catalog_membership` se queda intacta: sigue siendo la unica
-- definicion de los siete filtros de BR-K10 y la que ata el slug a su vendedor,
-- su organizacion y su rifa. Los conteos cuelgan de ELLA, de modo que un
-- vendedor no puede recibir los totales de otro ni por descuido ni por
-- manipulacion: no hay ningun parametro de vendedor que manipular.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Metadatos publicos + totales del catalogo
--
-- `available_count` y `taken_count` cuentan el catalogo COMPLETO de ese vendedor
-- en esa rifa. `draft`, `pending_approval` y `cancelled` no entran: no forman
-- parte del catalogo, tampoco de sus estadisticas (BR-K14).
--
-- El total no se devuelve: es `available + taken` y calcularlo en un sitio
-- —TypeScript— evita que dos capas puedan discrepar.
-- -----------------------------------------------------------------------------
drop function if exists public_catalog_seller(text);

create function public_catalog_seller(p_slug text)
returns table (
  seller_name      text,
  seller_alias     text,
  whatsapp_number  text,
  raffle_name      text,
  ticket_price     bigint,
  available_count  bigint,
  taken_count      bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.full_name,
    c.alias,
    c.whatsapp_number,
    c.raffle_name,
    c.ticket_price,
    s.available_count,
    s.taken_count
  from public.public_catalog_membership(p_slug) c
  cross join lateral (
    select
      count(*) filter (where t.inventory_status = 'available') as available_count,
      count(*) filter (where t.inventory_status = 'assigned')  as taken_count
    from public.tickets t
    where t.seller_id = c.profile_id
      and t.raffle_id = c.raffle_id
      and t.organization_id = c.organization_id
      and t.inventory_status in ('available', 'assigned')
  ) s;
$$;

comment on function public_catalog_seller(text) is
  'BR-K07/BR-K14: metadatos publicos de un catalogo y los totales de todo el catalogo (disponibles y tomadas). No recibe pagina ni busqueda, asi que sus totales no dependen de ninguna de las dos. Solo la ejecuta el servidor con la clave de servicio.';

-- -----------------------------------------------------------------------------
-- 2. Las boletas publicas: SOLO las disponibles
--
-- El filtro es de servidor y va ANTES de `limit`/`offset`, que es lo unico que
-- hace que la paginacion cuadre: si se filtrara despues, una pagina traeria
-- menos de 50 tarjetas y `hasNextPage` mentiria.
--
-- DESAPARECE LA COLUMNA `taken`. Valia `inventory_status = 'assigned'` y ahora
-- seria `false` en todas las filas: una columna constante que ya solo puede
-- confundir a quien la lea. Lo que no existe no se puede pintar por error.
--
-- Todo lo demas se conserva palabra por palabra: el tope de 61 filas acotado
-- aqui dentro (BR-K11), el rechazo de terminos que no pueden ser un numero de
-- boleta (BR-N02), el orden numerico que conserva los ceros iniciales, y el
-- «ninguna fila» comun a las siete situaciones de BR-K10.
-- -----------------------------------------------------------------------------
drop function if exists public_catalog_tickets(text, text, int, int);

create function public_catalog_tickets(
  p_slug   text,
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  daily_number   text,
  weekly_number  text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid;
  v_org     uuid;
  v_raffle  uuid;
  v_limit   int  := least(greatest(coalesce(p_limit, 50), 1), 61);
  v_offset  int  := greatest(coalesce(p_offset, 0), 0);
  v_search  text := nullif(btrim(coalesce(p_search, '')), '');
begin
  select c.profile_id, c.organization_id, c.raffle_id
    into v_profile, v_org, v_raffle
  from public.public_catalog_membership(p_slug) c;

  if v_profile is null then
    return;
  end if;

  if v_search is not null and v_search !~ '^[0-9]{1,4}$' then
    return;
  end if;

  return query
  select t.daily_number, t.weekly_number
  from public.tickets t
  where t.seller_id = v_profile
    and t.raffle_id = v_raffle
    and t.organization_id = v_org
    and t.inventory_status = 'available'
    and (
      v_search is null
      or t.daily_number  like '%' || v_search || '%'
      or t.weekly_number like '%' || v_search || '%'
    )
  order by (t.daily_number)::int, (t.weekly_number)::int
  limit v_limit offset v_offset;
end;
$$;

comment on function public_catalog_tickets(text, text, int, int) is
  'BR-K08/BR-K11: boletas publicas de un catalogo, SOLO las disponibles, maximo 61 filas por llamada. Una boleta vendida no viaja hasta aqui. Solo la ejecuta el servidor con la clave de servicio.';

-- -----------------------------------------------------------------------------
-- 3. Privilegios: un `drop` se los lleva, asi que se vuelven a poner
--
-- Identicos a los de `0043` y `0044`: `anon` y `authenticated` fuera de forma
-- explicita, `service_role` como unico ejecutor, y `public_catalog_membership`
-- sin conceder a nadie —la llaman las otras dos, que corren con el privilegio
-- de su dueno—.
-- -----------------------------------------------------------------------------
revoke all on function public_catalog_seller(text) from public, anon, authenticated;
revoke all on function public_catalog_tickets(text, text, int, int) from public, anon, authenticated;

grant execute on function public_catalog_seller(text) to service_role;
grant execute on function public_catalog_tickets(text, text, int, int) to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Volver al comportamiento de 0043 significa recrear las dos funciones con sus
-- firmas anteriores —`public_catalog_seller` sin los dos conteos y
-- `public_catalog_tickets` con `taken` y con `in ('available','assigned')`— y
-- volver a conceder `execute` a `service_role`. El cuerpo original esta en
-- 0043_public_catalog.sql, secciones 4 y 5.
--
-- No hay datos que deshacer: esta migracion no escribe ni una fila.
-- =============================================================================
