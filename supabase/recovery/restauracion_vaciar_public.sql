-- =============================================================================
-- RESTAURAR EL RESPALDO — paso 1 de 3: vaciar `public` SIN borrar el esquema (D-239)
--
-- NO es una migración. Se ejecuta a mano, con autorización expresa del dueño y con
-- la pausa de publicación CERRADA (RUNBOOK §5.2 y §10.6). Después van `roles.sql`,
-- `schema.sql` y `data.sql` del respaldo (§5.1), y `restauracion_despues.sql`.
--
-- POR QUÉ NO `DROP SCHEMA public CASCADE`. Borra lo mismo, pero además se lleva lo
-- que el respaldo no trae y el rol `postgres` no puede volver a poner en el proyecto
-- alojado: el dueño del esquema (`pg_database_owner`) y el USAGE de PUBLIC, los
-- privilegios por defecto de `supabase_admin` en `public` y, al recrear `pg_trgm`
-- sin ellos, las concesiones de sus 31 funciones. Medido en el ensayo de D-239: con
-- este vaciado esas diferencias no existen.
--
-- QUÉ BORRA: toda vista, tabla, secuencia, función y tipo de `public` que no sea de
-- una extensión, con CASCADE —lo mismo que se llevaba el DROP SCHEMA, incluidos los
-- dos disparadores de `auth.users`, que recrea el paso 3—, y, hasta que `schema.sql`
-- los reponga al final, los privilegios por defecto de `postgres` en `public`. Deja
-- el esquema, su ACL, los privilegios por defecto de `supabase_admin` y la extensión
-- `pg_trgm` tal como estaban.
--
-- Si la restauración se corta después de este paso, se repite desde aquí: es
-- repetible, y la comparación de estructura con la foto del respaldo dice qué falta.
--
-- Se niega sin la pausa cerrada: vaciar `public` con la API abierta dejaría a la
-- aplicación sirviendo errores y escribiendo en tablas a medio restaurar.
-- =============================================================================

begin;

do $vaciar$
declare
  r record;
begin
  -- Dos `if`, no uno con `or`: PL/pgSQL planifica la condición entera, y sin la pausa
  -- instalada la consulta a `pausa.estado` fallaba con «relation does not exist» en vez
  -- de decir esto (visto en el ensayo de D-240). Se negaba igual, sin decir por qué.
  if to_regclass('pausa.estado') is null then
    raise exception 'La pausa de publicación no está cerrada: no se vacía public. No se cambió nada.';
  end if;
  if not exists (select 1 from pausa.estado where id = 1 and cerrada) then
    raise exception 'La pausa de publicación no está cerrada: no se vacía public. No se cambió nada.';
  end if;

  -- Lo que pertenece a una extensión (pg_trgm) se queda.
  create temporary table de_extension on commit drop as
  select objid, classid from pg_depend where deptype = 'e';

  -- 1. Vistas, antes que las tablas que leen.
  for r in
    select c.oid::regclass as objeto, c.relkind
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
       and not exists (select 1 from de_extension e where e.objid = c.oid and e.classid = 'pg_class'::regclass)
  loop
    execute format('drop %s if exists %s cascade',
                   case r.relkind when 'm' then 'materialized view' else 'view' end, r.objeto);
  end loop;

  -- 2. Tablas: se llevan sus índices, restricciones, políticas, disparadores y secuencias.
  for r in
    select c.oid::regclass as objeto
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       and not exists (select 1 from de_extension e where e.objid = c.oid and e.classid = 'pg_class'::regclass)
  loop
    execute format('drop table if exists %s cascade', r.objeto);
  end loop;

  -- 3. Secuencias sueltas.
  for r in
    select c.oid::regclass as objeto
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
       and not exists (select 1 from de_extension e where e.objid = c.oid and e.classid = 'pg_class'::regclass)
  loop
    execute format('drop sequence if exists %s cascade', r.objeto);
  end loop;

  -- 4. Funciones y procedimientos (el CASCADE se lleva los disparadores de auth.users).
  for r in
    select p.oid::regprocedure as objeto, p.prokind
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from de_extension e where e.objid = p.oid and e.classid = 'pg_proc'::regclass)
  loop
    execute format('drop %s if exists %s cascade',
                   case r.prokind when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end,
                   r.objeto);
  end loop;

  -- 5. Tipos propios: enumerados, dominios y compuestos sueltos.
  for r in
    select t.oid::regtype as objeto
      from pg_type t
     where t.typnamespace = 'public'::regnamespace
       and t.typtype in ('e', 'd', 'c')
       and (t.typtype <> 'c' or exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c'))
       and not exists (select 1 from de_extension e where e.objid = t.oid and e.classid = 'pg_type'::regclass)
  loop
    execute format('drop type if exists %s cascade', r.objeto);
  end loop;

  -- 6. Los privilegios por defecto de `postgres` en `public`, fuera mientras se
  --    restaura. Si siguieran, cada tabla, secuencia y función que crea
  --    `schema.sql` los heredaría ADEMÁS de las concesiones del respaldo: medido en
  --    el ensayo de D-239, `service_role` recibía ALL sobre `raffle_prizes` y
  --    `raffle_prize_versions`, que son inmutables, y `authenticated` lectura sobre
  --    `raffle_prize_transitions`. `pg_dump` escribe estos privilegios AL FINAL de
  --    `schema.sql` justo por eso: el respaldo los repone tal como estaban. Los de
  --    `supabase_admin` no se tocan (tampoco se podría) y no se aplican a lo que crea
  --    `postgres`.
  alter default privileges for role postgres in schema public
    revoke all on tables from anon, authenticated, service_role;
  alter default privileges for role postgres in schema public
    revoke all on sequences from anon, authenticated, service_role;
  alter default privileges for role postgres in schema public
    revoke all on functions from anon, authenticated, service_role;
  alter default privileges for role postgres in schema public
    revoke all on types from anon, authenticated, service_role;

  -- Lo que queda en public tiene que ser solo de extensiones.
  if exists (
    select 1 from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and not exists (select 1 from de_extension e where e.objid = c.oid and e.classid = 'pg_class'::regclass)
    union all
    select 1 from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from de_extension e where e.objid = p.oid and e.classid = 'pg_proc'::regclass)
  ) then
    raise exception 'public no quedó vacío: queda algo que no es de una extensión. No se cambió nada.';
  end if;

  raise notice 'public vaciado: el esquema, su ACL, sus privilegios por defecto y pg_trgm siguen como estaban.';
end
$vaciar$;

commit;
