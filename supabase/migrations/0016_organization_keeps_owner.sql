-- =============================================================================
-- 0016_organization_keeps_owner.sql
-- Fase 9 (auditoria final) — una organizacion nunca se queda sin Owner
--
-- Referencia: docs/AUDIT_REPORT.md A-02, docs/KNOWN_ISSUES.md I-025,
--             docs/DECISIONS.md D-071.
--
-- QUE SE ENCONTRO
--
-- `memberships_one_owner_per_org` (0001) es un indice unico parcial sobre
-- (organization_id) where role = 'owner' and is_active. Garantiza «COMO MAXIMO
-- un Owner». Nunca garantizo «AL MENOS uno».
--
-- La politica `memberships_update_staff` (0005) permite a un Owner actualizar
-- su propia membresia mientras el rol RESULTANTE no sea 'owner' —o lo sea y el
-- que llama tambien—, asi que un Owner puede degradarse a `seller` o
-- desactivarse a si mismo con una llamada directa a PostgREST.
--
-- Reproducido en la Fase 9 contra la instancia local, con la clave publica y la
-- sesion real del Owner:
--
--   update memberships set role = 'seller' where profile_id = <owner>  -> 1 fila
--
-- Y el estado resultante es IRRECUPERABLE desde la aplicacion:
--
--   * El ex-Owner ya no es staff -> `memberships_update_staff` le da 0 filas.
--   * Un Admin no puede ascender a nadie a Owner (BR-U03, comprobado: 42501).
--
-- Solo `service_role`, desde un script fuera de la aplicacion, puede repararlo.
-- Se pierden para siempre las funciones exclusivas del Owner: configurar la
-- organizacion (`organizations_update_owner`) y reabrir una rifa (BR-R03).
--
-- ALCANCE REAL: no es una escalada de privilegios. Exige las credenciales del
-- propio Owner y una peticion hecha a mano —la interfaz no expone el cambio de
-- rol, `updateUser` solo toca nombre, alias y telefono—. Nadie GANA permisos:
-- el Owner los PIERDE. Pero es irreversible, y por eso se corrige.
--
-- POR QUE UN CONSTRAINT TRIGGER DIFERIDO Y NO UNO NORMAL
--
-- Transferir la propiedad exige pasar por un estado intermedio: el indice unico
-- impide que existan dos Owners activos a la vez, asi que hay que degradar a
-- uno ANTES de ascender al otro. Un trigger inmediato haria imposible la
-- transferencia; uno diferido la permite dentro de UNA transaccion y sigue
-- rechazando el descuido, porque PostgREST hace una peticion por transaccion.
--
-- Es el mismo mecanismo que ya usa `check_payment_balance` (D-012): validar al
-- COMMIT, no en mitad de la operacion.
-- =============================================================================

create function memberships_require_active_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  -- En un UPDATE interesa la organizacion de la fila tocada. `old` y `new`
  -- comparten organization_id: no hay politica que permita moverla de una
  -- organizacion a otra.
  v_org := coalesce(new.organization_id, old.organization_id);

  if not exists (
    select 1
    from memberships m
    where m.organization_id = v_org
      and m.role = 'owner'
      and m.is_active
  ) then
    raise exception
      'La organizacion quedaria sin ningun Owner activo. Asigna otro Owner antes de hacer este cambio.'
      using errcode = 'check_violation';
  end if;

  return null; -- AFTER trigger: el valor devuelto se ignora.
end;
$$;

comment on function memberships_require_active_owner is
  'Fase 9 (A-02): impide dejar una organizacion sin Owner activo. Diferido, '
  'para que una transferencia de propiedad en UNA transaccion siga siendo posible.';

-- Solo hace falta vigilar lo que puede QUITAR al ultimo Owner: bajar el rol o
-- desactivar la membresia. Un INSERT nunca deja a la organizacion sin Owner,
-- y no existe DELETE en ninguna tabla (0010).
create constraint trigger memberships_require_active_owner
  after update of role, is_active on memberships
  deferrable initially deferred
  for each row execute function memberships_require_active_owner();

-- `anon` y `public` no ejecutan nada nuestro (0015). Las funciones de trigger
-- no necesitan EXECUTE para dispararse: PostgreSQL lo comprueba al CREAR el
-- trigger, no en cada disparo.
revoke execute on function memberships_require_active_owner() from anon, public;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop trigger memberships_require_active_owner on memberships;
-- drop function memberships_require_active_owner();
--
-- Revertir devuelve la posibilidad de dejar una organizacion sin Owner de forma
-- irrecuperable desde la aplicacion. Solo tendria sentido si algun dia se
-- decidiera que una organizacion puede existir sin propietario.
-- =============================================================================
