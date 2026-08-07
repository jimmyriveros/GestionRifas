-- =============================================================================
-- 0017_search_normalization.sql
-- Posterior a la Fase 9 — Busqueda hibrida: normalizacion e indices
--
-- Referencia: docs/DECISIONS.md D-078 y D-079, docs/KNOWN_ISSUES.md I-036.
--
-- QUE RESUELVE
--
-- 1. Buscar «Jose» no encontraba a «José», ni al reves. La comparacion se hacia
--    con `ilike` sobre la columna tal cual, que respeta los acentos.
-- 2. Buscar un telefono con el formato con el que se ve en pantalla
--    («300 555-0000») no encontraba nada si estaba guardado sin separadores, ni
--    al reves. La columna `phone` admite `+`, espacios, parentesis y guion
--    (CHECK de 0002), asi que los dos formatos conviven en la misma tabla.
-- 3. `tickets.internal_code` se buscaba con `ilike '%texto%'` SIN NINGUN INDICE
--    que lo soportara: barrido secuencial de la tabla mas grande del sistema.
--
-- POR QUE `translate` Y NO LA EXTENSION `unaccent`
--
-- `unaccent` es la respuesta habitual, pero aqui pesa mas la prudencia: la
-- extension se instala en un esquema, y ese esquema no es el mismo en la
-- instancia local que en un proyecto Supabase alojado (aqui `pg_trgm` quedo en
-- `public`; en Supabase lo normal es `extensions`). Una columna generada que
-- referencia `public.unaccent` se rompe si en produccion quedo en otro sitio, y
-- eso se descubriria al aplicar la migracion sobre datos reales.
--
-- `translate` es built-in, IMMUTABLE, no depende de ningun esquema y cubre el
-- espanol entero, que es el unico idioma de la aplicacion (CLAUDE.md 6). Menos
-- potente en general, exacto para este caso y sin superficie de fallo nueva.
--
-- La `ñ` se pliega a `n` a proposito: quien escribe «munoz» espera encontrar a
-- «Muñoz». `unaccent` hace exactamente lo mismo. La funcion equivalente del
-- navegador (`foldForSearch`, src/lib/search.ts) pliega igual, y las dos TIENEN
-- que seguir coincidiendo: si una cambia, la busqueda deja de encontrar lo que
-- la otra promete.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- search_normalize(text) — minusculas y sin acentos
--
-- IMMUTABLE porque `lower` y `translate` lo son: es lo que permite usarla en una
-- columna generada y en un indice. Sin `SET search_path`: no es SECURITY
-- DEFINER (no hay privilegios que escalar) y un `SET` la haria no expandible en
-- linea, perdiendo rendimiento justo donde importa.
-- -----------------------------------------------------------------------------
create or replace function search_normalize(value text)
returns text
language sql
immutable
parallel safe
returns null on null input
as $$
  select translate(
    lower(value),
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'
  )
$$;

comment on function search_normalize(text) is
  'Texto comparable para buscar: minusculas y sin acentos. Debe coincidir con foldForSearch() de src/lib/search.ts.';

-- Privilegios: `anon` no ejecuta NADA nuestro (I-020).
--
-- No basta con las default privileges de 0015: se comprobo y esta funcion nacia
-- igualmente ejecutable por `anon`, porque PostgreSQL concede EXECUTE a PUBLIC
-- por defecto y ese GRANT no lo alcanza aquella regla. Lo destapo una prueba
-- (`tests/db/search.test.ts`), no una revision a ojo. Asi que se revoca
-- explicitamente, como ya hace 0015 con las demas.
--
-- El ORDEN importa: primero revocar de `public` —que es de donde `anon` lo
-- hereda— y despues conceder a quien si lo necesita.
revoke execute on function search_normalize(text) from anon, public;

-- `authenticated` SI la necesita: la columna generada de abajo se evalua al
-- insertar y actualizar clientes, con la sesion de quien lo hace.
grant execute on function search_normalize(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- clients.search_text — todo lo buscable de un cliente, ya normalizado
--
-- Columna GENERADA (no un trigger): la calcula PostgreSQL en cada insercion y
-- actualizacion, no se puede desincronizar y no hay codigo que mantener.
--
-- Lleva el telefono DOS veces, con separadores y sin ellos, para que se
-- encuentre igual escribiendo «300 555-0000» que «3005550000». El dato guardado
-- en `phone` no se toca: esto es una copia para buscar.
-- -----------------------------------------------------------------------------
alter table clients
  add column search_text text
  generated always as (
    search_normalize(name)
    || ' ' || coalesce(search_normalize(alias), '')
    || ' ' || coalesce(phone, '')
    || ' ' || coalesce(regexp_replace(phone, '[^0-9]', '', 'g'), '')
    || ' ' || coalesce(search_normalize(email), '')
  ) stored;

comment on column clients.search_text is
  'Nombre, alias, telefono (con y sin separadores) y correo, normalizados. Solo para buscar; nunca se muestra.';

-- Un solo indice de trigramas sustituye a los cuatro de 0003 en la practica:
-- la busqueda ahora va contra esta columna y no contra los campos sueltos.
create index clients_search_text_trgm_idx on clients using gin (search_text gin_trgm_ops);

-- Los cuatro indices trigrama de 0003 (name, alias, phone, email) NO se
-- eliminan. La regla del proyecto es no quitar un indice sin evidencia de que
-- sobra, y siguen sirviendo a cualquier consulta que filtre por un campo
-- concreto. Si mas adelante se comprueba que nadie los usa
-- (`pg_stat_user_indexes.idx_scan = 0` tras un tiempo en produccion), se
-- retiran en su propia migracion.

-- -----------------------------------------------------------------------------
-- tickets.internal_code — el barrido secuencial que faltaba
--
-- La busqueda de boletas hace `internal_code ilike '%texto%'`. El comodin
-- INICIAL impide usar un indice B-tree: hasta ahora, cada busqueda leia la
-- tabla entera. Con trigramas el patron si se indexa.
--
-- No se normaliza: un codigo interno es «R001-000123», generado por el sistema
-- (trigger de 0004), sin acentos posibles. Solo se pliega a minusculas al
-- comparar, que es lo que `ilike` ya hace.
-- -----------------------------------------------------------------------------
create index tickets_internal_code_trgm_idx on tickets using gin (internal_code gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- v_client_balances expone `search_text`
--
-- El listado de clientes de los dos portales consulta esta vista, no la tabla:
-- sin la columna aqui, la busqueda normalizada solo funcionaria en los
-- selectores. Se repite el cuerpo entero porque `create or replace view` no
-- admite anadir una columna sin reescribir la definicion; lo unico nuevo es la
-- ultima linea del `select`.
--
-- `security_invoker` hay que volver a declararlo: `create or replace view` no
-- conserva las opciones de la vista anterior, y perderlo dejaria la vista
-- ejecutandose con los permisos de su dueno —es decir, sin RLS—.
-- -----------------------------------------------------------------------------
create or replace view v_client_balances
with (security_invoker = true) as
select
  c.id                as client_id,
  c.organization_id,
  c.seller_id,
  c.name,
  c.alias,
  c.phone,
  c.email,
  c.archived_at,
  count(t.id) filter (where t.inventory_status = 'assigned')          as tickets_count,
  coalesce(sum(t.sale_price)  filter (where t.inventory_status = 'assigned'), 0)::bigint as total_purchased,
  coalesce(sum(t.paid_amount) filter (where t.inventory_status = 'assigned'), 0)::bigint as total_paid,
  coalesce(sum(t.sale_price - t.paid_amount)
             filter (where t.inventory_status = 'assigned'), 0)::bigint as pending_amount,
  c.search_text
from clients c
left join tickets t on t.client_id = c.id
group by c.id;

comment on view v_client_balances is 'Total comprado, pagado y saldo por cliente. Solo cuenta boletas asignadas (las anuladas no deben dinero).';

-- =============================================================================
-- Nota de reversion
--
--   drop index tickets_internal_code_trgm_idx;
--   drop index clients_search_text_trgm_idx;
--   alter table clients drop column search_text;
--   drop function search_normalize(text);
--
-- Revertir deja la busqueda como estaba: sin acentos ni formatos de telefono, y
-- con el barrido secuencial en boletas. No rompe datos: `search_text` es
-- derivada y `search_normalize` no la usa nada mas.
-- =============================================================================
