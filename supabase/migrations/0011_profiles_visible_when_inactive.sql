-- =============================================================================
-- 0011_profiles_visible_when_inactive.sql
-- Fase 3 — Correccion: el personal debe seguir viendo a los usuarios inactivos
--
-- Problema detectado por las pruebas end-to-end de la Fase 3 (I-011):
--
--   La politica `profiles_select` de 0001 exigia que la membresia del usuario
--   OBJETIVO estuviera activa para que el personal pudiera leer su perfil:
--
--       and m_target.is_active
--
--   Consecuencia: al desactivar a un vendedor, su perfil dejaba de ser visible
--   para el Owner y el Admin, la fila desaparecia del listado y ya no habia
--   forma de reactivarlo desde la aplicacion. La membresia seguia siendo
--   visible (`memberships_select` no filtra por is_active), pero sin perfil no
--   hay nombre, correo ni telefono que mostrar.
--
-- Correccion: la visibilidad de un perfil depende de que QUIEN CONSULTA sea
-- personal activo de la organizacion, no de que el objetivo lo sea.
-- `is_org_staff()` ya comprueba lo primero (y que la organizacion este activa),
-- de modo que el aislamiento entre organizaciones no cambia en absoluto.
--
-- Lo que NO cambia:
--   * Un vendedor sigue viendo unicamente su propio perfil.
--   * Nadie ve perfiles de otra organizacion.
--   * Un usuario inactivo sigue sin poder INGRESAR ni operar (BR-A04/BR-A05):
--     eso lo deciden `current_org_ids()` y `getActiveMembership()`, no esta
--     politica de lectura.
--
-- Referencia: docs/BUSINESS_RULES.md BR-U06 (desactivar no borra ni oculta el
-- historial), docs/SECURITY.md §4.3.
-- =============================================================================

drop policy profiles_select on profiles;

create policy profiles_select on profiles for select to authenticated
using (
  id = current_profile_id()
  or exists (
    select 1
    from memberships m_target
    where m_target.profile_id = profiles.id
      and is_org_staff(m_target.organization_id)
  )
);

comment on table profiles is
  'Datos de la persona usuaria. Se crea automaticamente al registrarse en auth.users. El personal ve los perfiles de su organizacion, incluidos los inactivos (0011).';

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop policy profiles_select on profiles;
-- create policy profiles_select on profiles for select to authenticated
-- using (
--   id = current_profile_id()
--   or exists (
--     select 1 from memberships m_target
--     where m_target.profile_id = profiles.id
--       and m_target.is_active
--       and is_org_staff(m_target.organization_id)
--   )
-- );
-- =============================================================================
