-- =============================================================================
-- 0014_rls_performance.sql
-- Fase 7 — La RLS deja de llamar a una funcion POR CADA FILA
--
-- Referencia: docs/DECISIONS.md D-063, docs/KNOWN_ISSUES.md I-019.
--
-- EL PROBLEMA, MEDIDO
--
-- `EXPLAIN ANALYZE` sobre `select count(*) from tickets` con 7.278 boletas y la
-- sesion de un Owner real:
--
--   Seq Scan on tickets (actual time=2.512..1724.794 rows=7273)
--     Filter: ((ANY (organization_id = (hashed SubPlan 1).col1))
--              AND (is_org_staff(organization_id) OR seller_id = current_profile_id()))
--     Buffers: shared hit=44367
--
-- 44.367 accesos a buffer para una tabla de 566 paginas: unos 6 por fila. La
-- causa esta en el `Filter`: `current_org_ids()` va envuelto en un subselect y
-- PostgreSQL lo resuelve UNA vez (`hashed SubPlan`), pero `is_org_staff(...)`
-- recibe una COLUMNA como argumento, asi que no puede sacarlo del bucle y lo
-- ejecuta una vez por fila. Y cada llamada consulta memberships, profiles y
-- organizations.
--
-- Medicion aislada sobre la misma tabla:
--
--   count(*) sin la funcion .................    1,46 ms
--   count(*) con is_org_staff(columna) ......  1667,24 ms
--   count(*) con el conjunto precalculado ...    1,18 ms
--
-- Mil cuatrocientas veces mas lento, y el factor CRECE con el numero de filas:
-- es coste por fila. Con 7.000 boletas ya se nota; con 100.000 la aplicacion
-- seria inusable. No es un problema visible en desarrollo, donde el seed tiene
-- treinta boletas.
--
-- LA CORRECCION
--
-- `is_org_staff(X)` se sustituye por `X in (select current_staff_org_ids())`.
-- Al ser un subselect sin dependencias de la fila, el planificador lo evalua
-- una sola vez y deja una comparacion de uuid por fila. Por el mismo motivo,
-- `current_profile_id()` pasa a `(select current_profile_id())`.
--
-- LO QUE NO CAMBIA: NINGUNA REGLA DE ACCESO
--
-- `current_staff_org_ids()` devuelve exactamente las organizaciones en las que
-- `is_org_staff()` habria devuelto verdadero —mismos filtros de rol, de
-- membresia activa, de perfil activo y de organizacion activa—, de modo que
-- cada politica admite y rechaza las mismas filas que antes. Es una
-- reformulacion para el planificador, no un cambio de permisos. Lo comprueban
-- las 26 pruebas de `rls-isolation`, las de `seller-isolation` y las de
-- `phase3-admin`, que siguen ejecutandose con sesiones reales de cada rol.
--
-- `has_org_role()` se deja como estaba en la proteccion del Owner
-- (memberships y profiles): son tablas de decenas de filas, donde el coste por
-- fila es irrelevante, y su logica es la mas delicada del esquema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conjunto de organizaciones donde quien consulta es personal (owner o admin).
--
-- Es el equivalente en conjunto de `is_org_staff(uuid)`: mismos filtros, misma
-- semantica, pero utilizable como subselect que se evalua una sola vez.
-- -----------------------------------------------------------------------------
create function current_staff_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.organization_id
  from memberships m
  join profiles p on p.id = m.profile_id
  join organizations o on o.id = m.organization_id
  where m.profile_id = auth.uid()
    and m.role in ('owner', 'admin')
    and m.is_active and p.is_active and o.is_active
$$;

comment on function current_staff_org_ids() is
  'Organizaciones donde el usuario actual es owner o admin activo. Equivalente en conjunto de is_org_staff(), pensado para usarse como subselect y evaluarse una sola vez por consulta (D-063).';

revoke execute on function current_staff_org_ids() from public;
grant execute on function current_staff_org_ids() to authenticated;

-- =============================================================================
-- tickets — la tabla que motiva esta migracion
-- =============================================================================
drop policy tickets_select on tickets;
create policy tickets_select on tickets for select to authenticated
using (
  organization_id in (select current_org_ids())
  and (
    organization_id in (select current_staff_org_ids())
    or seller_id = (select current_profile_id())
  )
);

drop policy tickets_insert_staff on tickets;
create policy tickets_insert_staff on tickets for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
);

drop policy tickets_update_staff on tickets;
create policy tickets_update_staff on tickets for update to authenticated
using (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
)
with check (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
);

-- BR-I03/BR-R10: el vendedor solo crea boletas si la rifa lo permite y esta
-- activa, siempre a su nombre y SIEMPRE en pending_approval. `has_org_role` se
-- conserva: aqui se evalua sobre la fila que se inserta, no sobre una tabla
-- entera, y el vendedor crea como mucho 100 de una vez (D-049).
drop policy tickets_insert_seller on tickets;
create policy tickets_insert_seller on tickets for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
  and has_org_role(organization_id, array['seller']::app_role[])
  and inventory_status = 'pending_approval'
  and client_id is null
  and exists (
    select 1 from raffles r
    where r.id = tickets.raffle_id
      and r.organization_id = tickets.organization_id
      and r.status = 'active'
      and r.allow_seller_ticket_creation
  )
);

-- USING acota las filas de partida y WITH CHECK el resultado: al exigir que el
-- estado siga siendo draft/pending_approval, un vendedor no puede pasar su
-- boleta a 'available' saltandose la aprobacion (BR-I09) ni asignarla sin usar
-- `assign_ticket`.
drop policy tickets_update_seller on tickets;
create policy tickets_update_seller on tickets for update to authenticated
using (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
  and inventory_status in ('draft', 'pending_approval')
)
with check (
  organization_id in (select current_org_ids())
  and seller_id = (select current_profile_id())
  and inventory_status in ('draft', 'pending_approval')
);

-- =============================================================================
-- clients
-- =============================================================================
drop policy clients_select on clients;
create policy clients_select on clients for select to authenticated
using (
  organization_id in (select current_org_ids())
  and (
    organization_id in (select current_staff_org_ids())
    or seller_id = (select current_profile_id())
  )
);

drop policy clients_insert on clients;
create policy clients_insert on clients for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and (
    organization_id in (select current_staff_org_ids())
    or seller_id = (select current_profile_id())
  )
);

drop policy clients_update on clients;
create policy clients_update on clients for update to authenticated
using (
  organization_id in (select current_org_ids())
  and (
    organization_id in (select current_staff_org_ids())
    or seller_id = (select current_profile_id())
  )
)
with check (
  organization_id in (select current_org_ids())
  and (
    organization_id in (select current_staff_org_ids())
    or seller_id = (select current_profile_id())
  )
);

-- =============================================================================
-- payments y payment_allocations
-- =============================================================================
drop policy payments_select on payments;
create policy payments_select on payments for select to authenticated
using (
  organization_id in (select current_org_ids())
  and (
    organization_id in (select current_staff_org_ids())
    or seller_id = (select current_profile_id())
  )
);

drop policy payments_insert on payments;
create policy payments_insert on payments for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and (
    organization_id in (select current_staff_org_ids())
    or seller_id = (select current_profile_id())
  )
  and voided_at is null
);

-- D-013: un pago ya anulado deja de ser actualizable por completo.
drop policy payments_update_staff on payments;
create policy payments_update_staff on payments for update to authenticated
using (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
  and voided_at is null
)
with check (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
);

drop policy payment_allocations_select on payment_allocations;
create policy payment_allocations_select on payment_allocations for select to authenticated
using (
  exists (
    select 1 from payments p
    where p.id = payment_allocations.payment_id
      and p.organization_id in (select current_org_ids())
      and (
        p.organization_id in (select current_staff_org_ids())
        or p.seller_id = (select current_profile_id())
      )
  )
);

drop policy payment_allocations_insert on payment_allocations;
create policy payment_allocations_insert on payment_allocations for insert to authenticated
with check (
  exists (
    select 1 from payments p
    where p.id = payment_allocations.payment_id
      and p.organization_id in (select current_org_ids())
      and (
        p.organization_id in (select current_staff_org_ids())
        or p.seller_id = (select current_profile_id())
      )
      and p.voided_at is null
  )
);

-- =============================================================================
-- raffles
-- =============================================================================
drop policy raffles_insert_staff on raffles;
create policy raffles_insert_staff on raffles for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
);

drop policy raffles_update_staff on raffles;
create policy raffles_update_staff on raffles for update to authenticated
using (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
)
with check (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
);

-- =============================================================================
-- audit_logs — solo lectura, y solo para el personal
-- =============================================================================
drop policy audit_logs_select_staff on audit_logs;
create policy audit_logs_select_staff on audit_logs for select to authenticated
using (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
);

-- =============================================================================
-- memberships y profiles
--
-- Tablas de decenas de filas: el coste por fila no se nota. Se reescriben
-- igualmente las llamadas a `is_org_staff` y `current_profile_id` por
-- CONSISTENCIA —para que nadie copie el patron lento de aqui— pero se conserva
-- `has_org_role(...)` tal cual en la proteccion del Owner (BR-U03), que es la
-- logica mas delicada del esquema y no vale la pena tocar por unos microsegundos.
-- =============================================================================
drop policy memberships_select on memberships;
create policy memberships_select on memberships for select to authenticated
using (
  profile_id = (select current_profile_id())
  or organization_id in (select current_staff_org_ids())
);

drop policy memberships_insert_staff on memberships;
create policy memberships_insert_staff on memberships for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
  and (role <> 'owner' or has_org_role(organization_id, array['owner']::app_role[]))
);

drop policy memberships_update_staff on memberships;
create policy memberships_update_staff on memberships for update to authenticated
using (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
  and (role <> 'owner' or has_org_role(organization_id, array['owner']::app_role[]))
)
with check (
  organization_id in (select current_org_ids())
  and organization_id in (select current_staff_org_ids())
  and (role <> 'owner' or has_org_role(organization_id, array['owner']::app_role[]))
);

-- I-011: la visibilidad depende de que QUIEN CONSULTA sea personal activo, no
-- de que lo sea el objetivo. Esa correccion de 0011 se conserva intacta.
drop policy profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
using (
  id = (select current_profile_id())
  or exists (
    select 1
    from memberships m_target
    where m_target.profile_id = profiles.id
      and m_target.organization_id in (select current_staff_org_ids())
  )
);

-- Cada quien edita su propio perfil.
drop policy profiles_update_self on profiles;
create policy profiles_update_self on profiles for update to authenticated
using (id = (select current_profile_id()))
with check (id = (select current_profile_id()));

drop policy profiles_update_staff on profiles;
create policy profiles_update_staff on profiles for update to authenticated
using (
  exists (
    select 1 from memberships m
    where m.profile_id = profiles.id
      and m.organization_id in (select current_org_ids())
      and m.organization_id in (select current_staff_org_ids())
      and (m.role <> 'owner' or has_org_role(m.organization_id, array['owner']::app_role[]))
  )
)
with check (
  exists (
    select 1 from memberships m
    where m.profile_id = profiles.id
      and m.organization_id in (select current_org_ids())
      and m.organization_id in (select current_staff_org_ids())
      and (m.role <> 'owner' or has_org_role(m.organization_id, array['owner']::app_role[]))
  )
);

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Volver a crear las 19 politicas con `is_org_staff(<columna>)` y
-- `current_profile_id()` sin envolver, tal como quedaron tras 0005 y 0011, y
-- despues:
--   drop function current_staff_org_ids();
--
-- Revertir NO cambia quien puede ver que: solo devuelve el plan lento.
-- =============================================================================
