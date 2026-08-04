-- =============================================================================
-- 0012_payment_history_visibility.sql
-- Fase 5 — Correccion: el historial ocultaba pagos legitimos, y no decia quien
--          habia anulado
--
-- PROBLEMA 1 (I-015). `v_payment_history` unia `profiles` con INNER JOIN para
-- resolver los nombres del vendedor y de quien registro el pago:
--
--     join profiles seller  on seller.id  = p.seller_id
--     join profiles creator on creator.id = p.created_by
--
-- La vista es `security_invoker`, asi que esos JOIN se evaluan con la RLS de
-- quien consulta. Un vendedor solo ve SU perfil (`profiles_select`), de modo
-- que si un Owner o un Admin registraba un pago de su cliente —cosa que la
-- matriz de permisos permite— `creator` no era visible y el INNER JOIN
-- ELIMINABA LA FILA COMPLETA. Resultado: el vendedor veia el pago en la tabla
-- `payments` (su politica si se lo permite) pero NO en su historial. Un abono
-- que existe y no aparece es exactamente lo que un sistema de cobranza no puede
-- permitirse.
--
-- Comprobado antes de escribir esta migracion, con sesiones reales:
--   * pago creado por el vendedor  -> visible en la vista.
--   * pago creado por el Owner     -> visible en `payments`, AUSENTE en la vista.
--
-- PROBLEMA 2. CLAUDE.md §20 exige mostrar QUIEN anulo un pago, y la vista solo
-- exponia `voided_by` (un uuid), sin nombre.
--
-- CORRECCION. Los tres JOIN sobre `profiles` pasan a LEFT JOIN y se agrega
-- `voided_by_name`. Si un nombre no es visible para quien consulta, se obtiene
-- NULL en esa columna en vez de perder la fila entera; la interfaz muestra un
-- generico ("un administrador"). La union con `clients` se mantiene INNER a
-- proposito: la FK `payments_client_seller_fk` garantiza que el cliente del
-- pago pertenece al mismo vendedor, asi que quien puede ver el pago siempre
-- puede ver su cliente.
--
-- Lo que NO cambia: ninguna politica, ningun privilegio y ningun dato. La vista
-- sigue siendo `security_invoker`, de modo que un vendedor sigue viendo
-- unicamente sus pagos y una organizacion jamas ve los de otra.
--
-- Referencia: docs/BUSINESS_RULES.md BR-F13, CLAUDE.md §20, docs/SECURITY.md §4.
-- =============================================================================

drop view v_payment_history;

create view v_payment_history
with (security_invoker = true) as
select
  p.id              as payment_id,
  p.organization_id,
  p.seller_id,
  p.client_id,
  c.name            as client_name,
  seller.full_name  as seller_name,
  p.total_amount,
  p.payment_date,
  p.payment_method,
  p.notes,
  p.created_at,
  p.created_by,
  creator.full_name as created_by_name,
  p.voided_at,
  p.voided_by,
  voider.full_name  as voided_by_name,
  p.void_reason,
  (p.voided_at is null) as is_active,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'ticket_id',     pa.ticket_id,
             'internal_code', t.internal_code,
             'daily_number',  t.daily_number,
             'weekly_number', t.weekly_number,
             'amount',        pa.amount)
           order by t.internal_code)
    from payment_allocations pa
    join tickets t on t.id = pa.ticket_id
    where pa.payment_id = p.id
  ), '[]'::jsonb) as allocations
from payments p
join clients c            on c.id = p.client_id
-- LEFT JOIN, no INNER: un nombre invisible no puede borrar el pago (I-015).
left join profiles seller  on seller.id  = p.seller_id
left join profiles creator on creator.id = p.created_by
left join profiles voider  on voider.id  = p.voided_by;

comment on view v_payment_history is 'Historial de pagos con cliente, vendedor, metodo, estado y detalle de asignaciones (BR-F13). Los nombres se resuelven con LEFT JOIN: si quien consulta no puede ver un perfil, obtiene NULL en esa columna, nunca la desaparicion del pago (I-015).';

-- El `drop view` se lleva por delante los privilegios: hay que reponerlos
-- (0009/0010). Sin esto, `authenticated` pierde el SELECT sobre la vista.
grant select on v_payment_history to authenticated;
revoke insert, update, delete, truncate on v_payment_history from authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop view v_payment_history;
-- y volver a crear la version de 0008_views.sql (con los INNER JOIN y sin
-- voided_by_name), seguida de:
--   grant select on v_payment_history to authenticated;
-- =============================================================================
