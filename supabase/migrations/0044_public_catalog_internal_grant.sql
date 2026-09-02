-- =============================================================================
-- 0044_public_catalog_internal_grant.sql
-- `public_catalog_membership` tampoco la ejecuta `service_role`
--
-- Referencia: docs/DECISIONS.md D-159 y D-128, docs/KNOWN_ISSUES.md I-078,
-- docs/SECURITY.md 4.5 y 4.10.
--
-- QUE PASO
--
-- `0043` dice, sobre la funcion interna: «NO se concede a nadie: la llaman las
-- otras dos, que corren con el privilegio de su dueno». En LOCAL era cierto. En
-- el proyecto REAL, no: al promover `0043` (2026-09-02) la comprobacion por
-- comportamiento encontro `service_role` con EXECUTE sobre ella.
--
-- Es EXACTAMENTE la divergencia de I-078 y D-128, otra vez. `0032` arreglo el
-- privilegio por defecto de `authenticated` y **dejo el de `service_role` a
-- proposito** —es el rol de los scripts de servidor y de la reparacion
-- operativa—, asi que cualquier funcion nueva sigue naciendo ejecutable por
-- `service_role` en produccion y no en local. `0043` revoco de `public`, `anon`
-- y `authenticated`, pero no de `service_role`, porque en local no hacia falta.
--
-- POR QUE SE CORRIGE, SI NO ES UN AGUJERO
--
-- No lo es: `service_role` es la clave del servidor y omite la RLS por
-- definicion; podria leer esas mismas tablas directamente. Lo que estaba mal es
-- otra cosa, y es la que costo I-078: **la documentacion y una prueba afirmaban
-- de produccion algo que solo era cierto en local**. `tests/db/public-catalog.test.ts`
-- comprueba `svc === false` para esta funcion y pasaba en verde mientras el
-- proyecto real decia lo contrario. Una prueba que no puede fallar donde importa
-- no protege nada.
--
-- POR QUE ES SEGURO REVOCAR
--
-- Las dos funciones publicas son `SECURITY DEFINER` y su cuerpo se ejecuta con
-- los privilegios de su dueno (`postgres`), asi que la llamada interna no
-- necesita el privilegio de quien las invoco. Comprobado en local ANTES de
-- escribir esta migracion: sin EXECUTE sobre la interna, un
-- `set role service_role; select * from public_catalog_seller(...)` devuelve su
-- fila igual. Es la misma propiedad en la que ya se apoyan las 26 RPC de negocio.
-- =============================================================================

revoke all on function public_catalog_membership(text) from service_role;

comment on function public_catalog_membership(text) is
  'Interna: resuelve un slug publico a su vendedor y su rifa, o nada. Unica definicion de los filtros de BR-K07. NO la ejecuta ningun rol: las dos publicas la llaman con el privilegio de su dueno (0044).';

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- grant execute on function public_catalog_membership(text) to service_role;
-- =============================================================================
