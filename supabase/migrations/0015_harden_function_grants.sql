-- =============================================================================
-- 0015_harden_function_grants.sql
-- Fase 7 (posterior al despliegue de 0012-0014) — `anon` no ejecuta NADA nuestro
--
-- Referencia: docs/KNOWN_ISSUES.md I-020, docs/DECISIONS.md D-065.
--
-- QUE SE DESCUBRIO Y COMO
--
-- Al aplicar 0012-0014 al proyecto real y verificar el catalogo DESPUES —no
-- solo antes— aparecio que en el proyecto alojado `anon` podia ejecutar TODAS
-- las funciones de `public`, incluidas las seis RPC de negocio y las
-- SECURITY DEFINER de seguridad. En local, no.
--
-- La causa es la misma que motivo 0010, ahora con funciones en vez de tablas:
-- Supabase concede privilegios mediante ALTER DEFAULT PRIVILEGES, y esos
-- GRANT van DIRECTOS al rol `anon`. El `revoke execute ... from public` de
-- 0007 y 0013 no los deshace, porque revocar de PUBLIC no toca un privilegio
-- concedido nominalmente a un rol.
--
-- Consecuencia: una invariante que las pruebas daban por cierta —«las RPC de
-- negocio no son ejecutables por anon», `catalog.test.ts`— era cierta en local
-- y FALSA en produccion, que es donde importa.
--
-- QUE TAN GRAVE ERA: NO HUBO FUGA
--
-- Comprobado contra el proyecto real con la clave publica y sin sesion:
--
--   report_payment_totals()  -> 42501 permission denied for table payments
--   report_payments_by_day() -> 42501 permission denied for table payments
--   require_auth()           -> «Debes iniciar sesion para realizar esta accion.»
--   current_org_ids()        -> []
--   is_org_staff(...)        -> false
--
-- Las otras dos capas aguantaron: `anon` no tiene ningun privilegio de tabla
-- (0010) y toda RPC de negocio empieza por `require_auth()` (regla 2 de
-- docs/SECURITY.md §4.5). Poder INVOCAR no es poder hacer.
--
-- Aun asi se corrige: el modelo de este proyecto es que cada capa detenga el
-- ataque por si sola (docs/SECURITY.md §1), y una invariante que el equipo cree
-- garantizada y no lo esta es justo lo que hace que un dia falle la unica capa
-- que quedaba.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Revocacion sobre las funciones PROPIAS
--
-- Se recorren una a una en vez de usar `revoke ... on all functions` para dejar
-- fuera las que pertenecen a una EXTENSION (pg_trgm: gtrgm_*, gin_*, similarity,
-- set_limit...). Esas las llama la maquinaria de indices, no el usuario, y
-- tocarles los privilegios seria meterse donde no toca.
--
-- `oid::regprocedure` da la firma completa, que es lo que `revoke` necesita para
-- distinguir funciones sobrecargadas.
-- -----------------------------------------------------------------------------
-- Se revoca de `anon` Y de `public`. Hay que hacer las dos cosas:
--
--   * De `anon`, porque en el proyecto alojado el GRANT es DIRECTO al rol.
--   * De `public`, porque en local varias funciones —las de trigger, que nunca
--     pasaron por el `revoke ... from public` de 0007— tienen EXECUTE por la vía
--     de PUBLIC, y `anon` lo hereda. Revocar solo del rol no lo quita.
--
-- Revocar EXECUTE a las funciones de TRIGGER es seguro: PostgreSQL comprueba
-- ese privilegio al CREAR el trigger, no cada vez que se dispara. No se dio por
-- supuesto: se comprobo ejecutando con esta migracion aplicada el seed completo
-- —que crea usuarios y dispara los triggers de `auth.users`— y las 254 pruebas
-- de base de datos, que insertan, actualizan, pagan, anulan y auditan.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from anon, public', r.firma);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Y para las funciones FUTURAS
--
-- Sin esto, la proxima funcion que cree una migracion volveria a nacer
-- ejecutable por `anon` y habria que acordarse de revocarla a mano.
--
-- `alter default privileges` solo afecta a los valores por defecto fijados por
-- el rol que ejecuta esta sentencia. Si Supabase los hubiera fijado con otro
-- rol, esta linea no los alcanzaria; por eso la garantia de verdad es la
-- comprobacion de catalogo contra el proyecto REAL (`npm run verify:remote`),
-- que falla si alguna funcion propia vuelve a quedar accesible a `anon`.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- `authenticated` conserva lo que ya tenia
--
-- 0007 y 0013 le conceden EXECUTE explicitamente sobre las RPC y las funciones
-- de reporte. Esta migracion no toca esos privilegios: solo quita los de `anon`.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- alter default privileges in schema public grant execute on functions to anon;
-- grant execute on all functions in schema public to anon;
--
-- Revertir NO se recomienda: devolveria a `anon` la capacidad de invocar las
-- RPC de negocio. Solo tendria sentido si algun dia existiera una funcion
-- pensada para visitantes sin sesion, y en ese caso se le concede a ella sola.
-- =============================================================================
