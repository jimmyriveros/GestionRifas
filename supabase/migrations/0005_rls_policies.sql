-- =============================================================================
-- 0005_rls_policies.sql
-- Fase 2 — Row Level Security completa
--
-- Referencia normativa: docs/SECURITY.md §4, docs/BUSINESS_RULES.md BR-U07,
-- BR-O02.
--
-- Premisa (docs/SECURITY.md §1): si se elimina toda la capa de aplicacion y un
-- atacante consulta Supabase directamente con la clave publica y una sesion de
-- vendedor, no debe poder leer ni modificar un solo registro ajeno.
--
-- Reglas transversales:
--   * ENABLE + FORCE en todas las tablas de negocio.
--   * Sin politica aplicable, PostgreSQL DENIEGA. Los permisos se conceden de
--     forma explicita, nunca por omision.
--   * Toda politica de UPDATE define USING (fila original) y WITH CHECK (fila
--     resultante): sin WITH CHECK, un usuario podria mover un registro fuera de
--     su propio ambito (regalarse una boleta ajena o entregar la suya a otro).
--   * DELETE: ninguna tabla de negocio lo concede. Se archiva o se anula.
-- =============================================================================

alter table raffles             enable row level security;
alter table raffles             force  row level security;
alter table clients             enable row level security;
alter table clients             force  row level security;
alter table tickets             enable row level security;
alter table tickets             force  row level security;
alter table payments            enable row level security;
alter table payments            force  row level security;
alter table payment_allocations enable row level security;
alter table payment_allocations force  row level security;
alter table audit_logs          enable row level security;
alter table audit_logs          force  row level security;

-- =============================================================================
-- raffles
--
-- Todos los miembros activos leen las rifas de su organizacion: el vendedor
-- necesita conocer el precio vigente y si puede crear boletas. Solo el personal
-- (owner/admin) las crea y edita.
-- =============================================================================
create policy raffles_select on raffles for select to authenticated
using (organization_id in (select current_org_ids()));

create policy raffles_insert_staff on raffles for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
);

create policy raffles_update_staff on raffles for update to authenticated
using (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
)
with check (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
);

-- =============================================================================
-- clients
--
-- BR-C05: la cartera es del vendedor. El personal ve toda la organizacion.
-- Sin DELETE: los clientes con historial se archivan (BR-C06).
-- =============================================================================
create policy clients_select on clients for select to authenticated
using (
  organization_id in (select current_org_ids())
  and (is_org_staff(organization_id) or seller_id = current_profile_id())
);

create policy clients_insert on clients for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  -- El personal puede crear clientes para cualquier vendedor; el vendedor,
  -- unicamente para si mismo.
  and (is_org_staff(organization_id) or seller_id = current_profile_id())
);

create policy clients_update on clients for update to authenticated
using (
  organization_id in (select current_org_ids())
  and (is_org_staff(organization_id) or seller_id = current_profile_id())
)
with check (
  organization_id in (select current_org_ids())
  -- WITH CHECK impide que un vendedor transfiera su cliente a otro vendedor.
  and (is_org_staff(organization_id) or seller_id = current_profile_id())
);

-- =============================================================================
-- tickets
--
-- La tabla mas sensible: aqui vive el aislamiento entre vendedores (BR-U07).
-- =============================================================================
create policy tickets_select on tickets for select to authenticated
using (
  organization_id in (select current_org_ids())
  and (is_org_staff(organization_id) or seller_id = current_profile_id())
);

create policy tickets_insert_staff on tickets for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
);

-- BR-I03/BR-R10: el vendedor solo crea boletas si la rifa lo permite y esta
-- activa, siempre a su propio nombre y SIEMPRE en pending_approval. No puede
-- auto-aprobarse.
create policy tickets_insert_seller on tickets for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and seller_id = current_profile_id()
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

create policy tickets_update_staff on tickets for update to authenticated
using (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
)
with check (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
);

-- El vendedor solo corrige los numeros de sus boletas ANTES de que se aprueben.
-- USING acota las filas de partida y WITH CHECK el resultado: al exigir que el
-- estado siga siendo draft/pending_approval, es imposible que un vendedor pase
-- su propia boleta a 'available' saltandose la aprobacion (BR-I09), o que la
-- asigne a un cliente sin pasar por assign_ticket.
create policy tickets_update_seller on tickets for update to authenticated
using (
  organization_id in (select current_org_ids())
  and seller_id = current_profile_id()
  and inventory_status in ('draft', 'pending_approval')
)
with check (
  organization_id in (select current_org_ids())
  and seller_id = current_profile_id()
  and inventory_status in ('draft', 'pending_approval')
);

-- =============================================================================
-- payments
--
-- BR-F10: solo el personal anula pagos; el vendedor jamas.
-- D-013: la anulacion es irreversible, garantizado por el `voided_at is null`
-- del USING (un pago ya anulado deja de ser actualizable por completo).
-- =============================================================================
create policy payments_select on payments for select to authenticated
using (
  organization_id in (select current_org_ids())
  and (is_org_staff(organization_id) or seller_id = current_profile_id())
);

create policy payments_insert on payments for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and (is_org_staff(organization_id) or seller_id = current_profile_id())
  and voided_at is null
);

create policy payments_update_staff on payments for update to authenticated
using (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
  and voided_at is null
)
with check (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
);

-- =============================================================================
-- payment_allocations
--
-- Siguen al pago padre. Inmutables: sin UPDATE ni DELETE para nadie. Corregir
-- un pago significa anularlo y registrar uno nuevo (D-013).
-- =============================================================================
create policy payment_allocations_select on payment_allocations for select to authenticated
using (
  exists (
    select 1 from payments p
    where p.id = payment_allocations.payment_id
      and p.organization_id in (select current_org_ids())
      and (is_org_staff(p.organization_id) or p.seller_id = current_profile_id())
  )
);

create policy payment_allocations_insert on payment_allocations for insert to authenticated
with check (
  exists (
    select 1 from payments p
    where p.id = payment_allocations.payment_id
      and p.organization_id in (select current_org_ids())
      and (is_org_staff(p.organization_id) or p.seller_id = current_profile_id())
      and p.voided_at is null
  )
);

-- =============================================================================
-- audit_logs
--
-- BR-D02/BR-D04: solo lectura, solo para el personal de la organizacion.
-- Sin politica de INSERT: la bitacora la escriben unicamente las funciones
-- SECURITY DEFINER de 0006 y 0007. Sin UPDATE ni DELETE para nadie: la
-- evidencia no se altera ni se borra.
-- =============================================================================
create policy audit_logs_select_staff on audit_logs for select to authenticated
using (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
);

-- =============================================================================
-- memberships y profiles: politicas de ESCRITURA
--
-- La Fase 1 dejo estas tablas en solo lectura a proposito (D-036), porque
-- ninguna pantalla las escribia. Aqui se completa el diseno de
-- docs/SECURITY.md §4.3, incluida la proteccion del Owner frente a un Admin
-- (BR-U02, BR-U03).
--
-- Mecanica de la proteccion, en las dos direcciones:
--   USING      -> si la fila OBJETIVO es de un owner, solo un owner puede tocarla
--                 (un admin no puede editar ni desactivar al Owner).
--   WITH CHECK -> si la fila RESULTANTE queda como owner, solo un owner pudo
--                 haberla producido (un admin no puede ascender a nadie, ni a
--                 si mismo, al rol owner).
-- =============================================================================
create policy memberships_insert_staff on memberships for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
  and (
    role <> 'owner'
    or has_org_role(organization_id, array['owner']::app_role[])
  )
);

create policy memberships_update_staff on memberships for update to authenticated
using (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
  and (
    role <> 'owner'
    or has_org_role(organization_id, array['owner']::app_role[])
  )
)
with check (
  organization_id in (select current_org_ids())
  and is_org_staff(organization_id)
  and (
    role <> 'owner'
    or has_org_role(organization_id, array['owner']::app_role[])
  )
);

-- El personal puede editar los perfiles de su organizacion (datos de contacto
-- de sus vendedores), con la misma proteccion del Owner.
create policy profiles_update_staff on profiles for update to authenticated
using (
  exists (
    select 1 from memberships m
    where m.profile_id = profiles.id
      and m.organization_id in (select current_org_ids())
      and is_org_staff(m.organization_id)
      and (
        m.role <> 'owner'
        or has_org_role(m.organization_id, array['owner']::app_role[])
      )
  )
)
with check (
  exists (
    select 1 from memberships m
    where m.profile_id = profiles.id
      and m.organization_id in (select current_org_ids())
      and is_org_staff(m.organization_id)
      and (
        m.role <> 'owner'
        or has_org_role(m.organization_id, array['owner']::app_role[])
      )
  )
);

-- organizations: solo el Owner edita la configuracion de su organizacion
-- (docs/SECURITY.md §2, accion exclusiva del Owner).
create policy organizations_update_owner on organizations for update to authenticated
using (
  id in (select current_org_ids())
  and has_org_role(id, array['owner']::app_role[])
)
with check (
  id in (select current_org_ids())
  and has_org_role(id, array['owner']::app_role[])
);

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop policy <nombre> on <tabla>;  para cada politica anterior.
-- alter table <tabla> disable row level security;  para cada tabla.
-- =============================================================================
