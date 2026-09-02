-- =============================================================================
-- 0043_public_catalog.sql
-- Catalogo publico de boletas por vendedor: /catalogo/<slug>
--
-- Referencia normativa: docs/BUSINESS_RULES.md BR-K01..BR-K12,
-- docs/DECISIONS.md D-159 y D-160, docs/SECURITY.md 4.5.
--
-- QUE ANADE, Y POR QUE NO ANADE UNA TABLA
--
-- Un vendedor NO es una entidad propia en este esquema: es una `membership` con
-- rol `seller` (docs/DATA_MODEL.md, `features/sellers/queries.ts`). Publicar su
-- catalogo no lo convierte en otra cosa, asi que la configuracion son cuatro
-- columnas mas en esa misma fila. Una tabla `public_sellers` habria creado una
-- SEGUNDA entidad de vendedor —lo que el encargo prohibe expresamente— y con
-- ella la pregunta de cual de las dos manda cuando discrepen.
--
-- LA MIGRACION ES ADITIVA. No toca ninguna tabla, politica, funcion, enum ni
-- restriccion existente. `tickets_select` se queda EXACTAMENTE como estaba: la
-- lectura publica no pasa por RLS de sesion, pasa por dos funciones propias.
--
-- POR QUE DOS FUNCIONES `SECURITY DEFINER` Y NO UNA POLITICA PARA `anon`
--
-- Una politica de `SELECT` para `anon` sobre `tickets` —por estrecha que se
-- escriba— pone a `anon` DENTRO de la tabla de negocio: cualquier columna que
-- alguien anada manana (un precio negociado, una nota) queda expuesta salvo que
-- se recuerde excluirla, y PostgREST permite pedir columnas por nombre. Aqui la
-- proyeccion publica es el TIPO DE RETORNO de la funcion: lo que no esta en el
-- `returns table` no puede salir, hoy ni dentro de un ano. `anon` sigue sin un
-- solo privilegio sobre ninguna tabla de negocio, que es como estaba.
--
-- Las dos se ejecutan UNICAMENTE con la clave de servicio, desde el servidor de
-- Next (`createAdminClient`, `features/catalog/queries.ts`). Ni `anon` ni
-- `authenticated` pueden invocarlas: el navegador nunca habla con ellas.
--
-- LO QUE ESTAS FUNCIONES NO PUEDEN DEVOLVER, POR CONSTRUCCION
--
-- Ni un uuid (vendedor, perfil, organizacion, cliente o boleta), ni el codigo
-- interno, ni el nombre o telefono del cliente, ni `sale_price`, ni
-- `paid_amount`, ni `payment_status`, ni notas, ni auditoria. Una boleta
-- vendida sale del mismo modo que una libre salvo por un booleano: `taken`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La configuracion publica, en la propia membresia
--
-- Las cuatro columnas nacen NULL/false: ninguna organizacion existente publica
-- nada por el hecho de aplicar esta migracion. Publicar es un acto explicito.
-- -----------------------------------------------------------------------------
alter table memberships
  add column public_slug             text,
  add column public_catalog_enabled  boolean not null default false,
  add column public_whatsapp_number  text,
  add column public_raffle_id        uuid;

comment on column memberships.public_slug is
  'BR-K02: identificador de la URL publica. Estable: no cambia al renombrar a la persona; regenerarlo es una accion explicita.';
comment on column memberships.public_catalog_enabled is
  'BR-K04: interruptor del catalogo. Apagarlo no borra nada.';
comment on column memberships.public_whatsapp_number is
  'BR-K05: WhatsApp PUBLICO en formato internacional de solo digitos (573001234567). No es el telefono interno de profiles.phone: se configura a conciencia.';
comment on column memberships.public_raffle_id is
  'BR-K06: la rifa que publica este catalogo. Explicita porque el esquema NO garantiza una unica rifa activa (BR-R01).';

-- El `slug` es normalizado: minusculas, digitos y guiones simples, sin guion al
-- principio ni al final. Lo genera el servidor (`features/catalog/slug.ts`),
-- pero la forma la garantiza la base de datos: es lo que hace que una URL no
-- pueda quedar con mayusculas, tildes o espacios.
alter table memberships add constraint memberships_public_slug_format check (
  public_slug is null
  or (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(public_slug) between 3 and 80)
);

-- Solo digitos, con la longitud de un numero internacional real (E.164 sin `+`).
-- Se rechaza el `0` inicial: ningun indicativo de pais empieza por cero, y
-- «0573001234567» es el error tipico de quien copia un numero nacional.
alter table memberships add constraint memberships_public_whatsapp_format check (
  public_whatsapp_number is null
  or public_whatsapp_number ~ '^[1-9][0-9]{7,14}$'
);

-- La rifa publicada es de la MISMA organizacion que la membresia. No es una
-- comprobacion nueva: reutiliza `raffles_id_org_key`, la clave compuesta que
-- 0002 creo justo para esto (D-007). Sin ella, un Admin podria publicar la rifa
-- de otra organizacion escribiendo su id a mano.
alter table memberships add constraint memberships_public_raffle_org_fk
  foreign key (public_raffle_id, organization_id)
  references raffles (id, organization_id) on delete restrict;

-- Un catalogo encendido esta COMPLETO. Sin esto se podria dejar publicado un
-- vendedor sin WhatsApp —cuyo boton «Solicitar» no llevaria a ninguna parte— o
-- sin rifa, y el fallo solo se veria desde fuera, en la pagina publica.
alter table memberships add constraint memberships_public_catalog_complete check (
  not public_catalog_enabled
  or (public_slug is not null
      and public_whatsapp_number is not null
      and public_raffle_id is not null)
);

-- -----------------------------------------------------------------------------
-- 2. El `slug` es unico en TODO el sistema, no por organizacion
--
-- La URL no lleva organizacion: `/catalogo/laura-gomez-k7m4` tiene que resolver
-- a una sola persona en el mundo. Un unique por (organizacion, slug) permitiria
-- dos duenos del mismo texto y la ruta no sabria a cual servir.
--
-- Parcial (`where public_slug is not null`) porque la inmensa mayoria de las
-- membresias no publica nada y los NULL no deben competir por el indice.
-- -----------------------------------------------------------------------------
create unique index memberships_public_slug_key
  on memberships (public_slug)
  where public_slug is not null;

-- -----------------------------------------------------------------------------
-- 3. Resolucion del `slug` — una sola definicion de «este catalogo publica»
--
-- Las dos funciones de abajo tienen que aplicar EXACTAMENTE los mismos filtros.
-- Escribirlos dos veces es como acaban discrepando: la de metadatos diria que
-- el catalogo existe y la de boletas devolveria vacio, o al reves. Asi que la
-- condicion vive una sola vez, aqui.
--
-- Comprueba, en este orden: organizacion activa, perfil activo, membresia
-- activa, rol vendedor, catalogo habilitado, y rifa publicada Y activa.
--
-- Es `SECURITY DEFINER` porque lee `memberships`, `profiles`, `organizations` y
-- `raffles`, tablas sin un solo privilegio para `anon`. No la puede invocar
-- nadie desde una sesion: solo las dos funciones publicas, que corren con el
-- mismo dueno.
-- -----------------------------------------------------------------------------
create function public_catalog_membership(p_slug text)
returns table (
  profile_id       uuid,
  organization_id  uuid,
  raffle_id        uuid,
  full_name        text,
  alias            text,
  whatsapp_number  text,
  raffle_name      text,
  ticket_price     bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.profile_id,
    m.organization_id,
    m.public_raffle_id,
    p.full_name,
    p.alias,
    m.public_whatsapp_number,
    r.name,
    r.ticket_price
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  join public.profiles p      on p.id = m.profile_id
  join public.raffles r       on r.id = m.public_raffle_id
                            and r.organization_id = m.organization_id
  where m.public_slug = p_slug
    and m.public_catalog_enabled
    and m.role = 'seller'
    and m.is_active
    and p.is_active
    and o.is_active
    and r.status = 'active'
  limit 1;
$$;

comment on function public_catalog_membership(text) is
  'Interna: resuelve un slug publico a su vendedor y su rifa, o nada. Unica definicion de los filtros de BR-K07.';

-- -----------------------------------------------------------------------------
-- 4. Metadatos publicos del catalogo
--
-- Devuelve el nombre de la persona y el de la rifa, el WhatsApp ya normalizado
-- y el precio oficial. NO devuelve el id de nadie: la pagina publica no
-- necesita ninguno, y lo que no viaja no se puede filtrar.
--
-- `alias` sale porque de el se deriva el nombre corto del saludo de WhatsApp
-- («Hola, Laura»). Es un dato que la propia persona eligio como su nombre
-- visible, no un dato de contacto.
-- -----------------------------------------------------------------------------
create function public_catalog_seller(p_slug text)
returns table (
  seller_name      text,
  seller_alias     text,
  whatsapp_number  text,
  raffle_name      text,
  ticket_price     bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.full_name, c.alias, c.whatsapp_number, c.raffle_name, c.ticket_price
  from public.public_catalog_membership(p_slug) c;
$$;

comment on function public_catalog_seller(text) is
  'BR-K07: metadatos publicos de un catalogo. Solo la ejecuta el servidor con la clave de servicio.';

-- -----------------------------------------------------------------------------
-- 5. Las boletas publicas, paginadas
--
-- QUE SALE Y QUE NO
--
-- Salen los dos numeros y un booleano. `taken` es `inventory_status =
-- 'assigned'`; todo lo demas del inventario —`draft`, `pending_approval`,
-- `cancelled`— NO EXISTE para el publico: no se muestra en gris, no se muestra
-- en absoluto (BR-K08). Una boleta anulada que se enseñara como «Tomado»
-- contaria una mentira: nadie la tiene.
--
-- POR QUE `limit + 1` LO DECIDE QUIEN LLAMA
--
-- La funcion no cuenta. Un `count(*)` exacto sobre el inventario de un vendedor
-- obliga a recorrerlo entero en CADA pagina, y la pagina publica no necesita
-- saber cuantas hay: necesita saber si hay una mas. Quien llama pide
-- `p_limit = tamano + 1` y mira si le devolvieron el extra
-- (`features/catalog/queries.ts`).
--
-- EL TOPE NO ES NEGOCIABLE DESDE FUERA
--
-- `p_limit` se acota aqui dentro, no en TypeScript: aunque alguien llegara a
-- invocar la funcion con 100.000, recibiria 61. Es la unica forma de que el
-- limite sea una garantia y no una costumbre (BR-K11).
--
-- EL ORDEN ES NUMERICO Y LOS CEROS SE CONSERVAN
--
-- Se ordena por `daily_number::int`, no por el texto: en texto «1300» va antes
-- que «25» y la reja publica saldria desordenada. El cast es seguro porque la
-- columna tiene un CHECK de 1 a 4 digitos y, fuera de `draft`, nunca es nula
-- (`tickets_numbers_required_unless_draft`, 0002). Lo que se DEVUELVE sigue
-- siendo el texto original, asi que «0007» llega como «0007».
--
-- El par (diario, semanal) es unico dentro de una rifa (`tickets_combo_unique`),
-- de modo que el orden es total: la paginacion no puede repetir ni saltarse una
-- boleta entre dos paginas.
-- -----------------------------------------------------------------------------
create function public_catalog_tickets(
  p_slug   text,
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  daily_number   text,
  weekly_number  text,
  taken          boolean
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

  -- Slug inexistente, vendedor inactivo, catalogo apagado, rifa cerrada: la
  -- respuesta es la misma —ninguna fila—. La pagina publica traduce todas esas
  -- situaciones a un unico «no encontrado» y no dice cual ocurrio (BR-K10).
  if v_profile is null then
    return;
  end if;

  -- Un termino que no puede ser un numero de boleta (BR-N02) no se consulta: no
  -- hay nada que pueda coincidir. Es la misma regla que aplica `search_tickets`
  -- (0018) y la misma que valida el campo en pantalla.
  if v_search is not null and v_search !~ '^[0-9]{1,4}$' then
    return;
  end if;

  return query
  select t.daily_number, t.weekly_number, t.inventory_status = 'assigned'
  from public.tickets t
  where t.seller_id = v_profile
    and t.raffle_id = v_raffle
    and t.organization_id = v_org
    and t.inventory_status in ('available', 'assigned')
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
  'BR-K08/BR-K11: boletas publicas de un catalogo, solo available/assigned, maximo 61 filas por llamada. Solo la ejecuta el servidor con la clave de servicio.';

-- -----------------------------------------------------------------------------
-- 6. Privilegios: nadie las ejecuta desde una sesion
--
-- `anon` y `authenticated` quedan fuera EXPLICITAMENTE, aunque los privilegios
-- por defecto de este esquema ya no se los concedan (0015 y 0032, D-128): el
-- encargo lo pide escrito, y una revocacion explicita sobrevive a que alguien
-- cambie el default manana.
--
-- `service_role` es el unico que las recibe. Es el rol con el que habla el
-- servidor de Next, y en local NO las tendria por defecto —los privilegios por
-- defecto locales son solo `{postgres=X/postgres}` (0032)—, asi que sin este
-- grant la pagina publica no funcionaria.
--
-- `public_catalog_membership` NO se concede a nadie: la llaman las otras dos,
-- que corren con el privilegio de su dueno.
-- -----------------------------------------------------------------------------
revoke all on function public_catalog_membership(text) from public, anon, authenticated;
revoke all on function public_catalog_seller(text) from public, anon, authenticated;
revoke all on function public_catalog_tickets(text, text, int, int) from public, anon, authenticated;

grant execute on function public_catalog_seller(text) to service_role;
grant execute on function public_catalog_tickets(text, text, int, int) to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function public_catalog_tickets(text, text, int, int);
-- drop function public_catalog_seller(text);
-- drop function public_catalog_membership(text);
-- drop index memberships_public_slug_key;
-- alter table memberships
--   drop constraint memberships_public_catalog_complete,
--   drop constraint memberships_public_raffle_org_fk,
--   drop constraint memberships_public_whatsapp_format,
--   drop constraint memberships_public_slug_format,
--   drop column public_raffle_id,
--   drop column public_whatsapp_number,
--   drop column public_catalog_enabled,
--   drop column public_slug;
-- =============================================================================
