-- =============================================================================
-- 0008_views.sql
-- Fase 2 — Vistas de saldos y resumenes
--
-- Referencia normativa: docs/DATA_MODEL.md §6, D-010.
--
-- REGLA DE SEGURIDAD CRITICA: todas se crean con security_invoker = true.
--
-- Sin esa opcion, una vista de PostgreSQL se ejecuta con los privilegios de su
-- PROPIETARIO y omite por completo las politicas RLS de las tablas base: un
-- vendedor consultando v_seller_summary veria los saldos de todos los demas.
-- Con security_invoker = true la vista se ejecuta con los permisos de quien
-- consulta, de modo que hereda exactamente el mismo aislamiento que las tablas.
--
-- La verificacion automatizada de esta regla esta en tests/db (consulta a
-- pg_class.reloptions) y es punto obligatorio de la auditoria de la Fase 9.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- v_ticket_balances — saldo por boleta
-- -----------------------------------------------------------------------------
create view v_ticket_balances
with (security_invoker = true) as
select
  t.id                as ticket_id,
  t.organization_id,
  t.raffle_id,
  t.seller_id,
  t.client_id,
  t.internal_code,
  t.daily_number,
  t.weekly_number,
  t.inventory_status,
  t.payment_status,
  t.sale_price,
  t.paid_amount,
  -- BR-F08. NULL mientras la boleta no se ha vendido (no hay saldo que deber).
  case when t.sale_price is null then null
       else t.sale_price - t.paid_amount
  end                 as pending_amount,
  t.sale_date,
  t.assigned_at,
  t.created_at
from tickets t;

comment on view v_ticket_balances is 'Saldo por boleta. pending_amount = sale_price - paid_amount (BR-F08).';

-- -----------------------------------------------------------------------------
-- v_client_balances — cartera por cliente (perfil de cliente, BR-C09)
-- -----------------------------------------------------------------------------
create view v_client_balances
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
             filter (where t.inventory_status = 'assigned'), 0)::bigint as pending_amount
from clients c
left join tickets t on t.client_id = c.id
group by c.id;

comment on view v_client_balances is 'Total comprado, pagado y saldo por cliente. Solo cuenta boletas asignadas (las anuladas no deben dinero).';

-- -----------------------------------------------------------------------------
-- v_seller_summary — indicadores por vendedor
--
-- Alimenta el resumen por vendedor del dashboard administrativo y, para un
-- vendedor, sus propios indicadores: la RLS de tickets hace que cada quien vea
-- solo lo que le corresponde, sin necesidad de filtrar aqui.
-- -----------------------------------------------------------------------------
create view v_seller_summary
with (security_invoker = true) as
select
  t.organization_id,
  t.raffle_id,
  t.seller_id,
  count(*)                                                              as tickets_total,
  count(*) filter (where t.inventory_status = 'available')              as tickets_available,
  count(*) filter (where t.inventory_status = 'assigned')               as tickets_assigned,
  count(*) filter (where t.inventory_status = 'pending_approval')       as tickets_pending_approval,
  count(*) filter (where t.inventory_status = 'draft')                  as tickets_draft,
  count(*) filter (where t.inventory_status = 'cancelled')              as tickets_cancelled,
  count(*) filter (where t.inventory_status = 'assigned'
                     and t.payment_status = 'unpaid')                   as tickets_unpaid,
  count(*) filter (where t.payment_status = 'partial')                  as tickets_partial,
  count(*) filter (where t.payment_status = 'paid')                     as tickets_paid,
  coalesce(sum(t.sale_price)  filter (where t.inventory_status = 'assigned'), 0)::bigint as total_sold,
  coalesce(sum(t.paid_amount) filter (where t.inventory_status = 'assigned'), 0)::bigint as total_collected,
  coalesce(sum(t.sale_price - t.paid_amount)
             filter (where t.inventory_status = 'assigned'), 0)::bigint as pending_amount
from tickets t
group by t.organization_id, t.raffle_id, t.seller_id;

comment on view v_seller_summary is 'Indicadores por vendedor y rifa. La RLS de tickets garantiza que un vendedor solo vea los suyos.';

-- -----------------------------------------------------------------------------
-- v_raffle_summary — indicadores por rifa (dashboard administrativo)
-- -----------------------------------------------------------------------------
create view v_raffle_summary
with (security_invoker = true) as
select
  r.id              as raffle_id,
  r.organization_id,
  r.short_code,
  r.name,
  r.status,
  r.ticket_price,
  r.start_date,
  r.end_date,
  r.allow_seller_ticket_creation,
  count(t.id)                                                     as tickets_total,
  count(t.id) filter (where t.inventory_status = 'available')      as tickets_available,
  count(t.id) filter (where t.inventory_status = 'assigned')       as tickets_assigned,
  count(t.id) filter (where t.inventory_status = 'pending_approval') as tickets_pending_approval,
  count(t.id) filter (where t.inventory_status = 'cancelled')      as tickets_cancelled,
  count(t.id) filter (where t.inventory_status = 'assigned'
                        and t.payment_status = 'unpaid')           as tickets_unpaid,
  count(t.id) filter (where t.payment_status = 'partial')          as tickets_partial,
  count(t.id) filter (where t.payment_status = 'paid')             as tickets_paid,
  coalesce(sum(t.sale_price)  filter (where t.inventory_status = 'assigned'), 0)::bigint as total_sold,
  coalesce(sum(t.paid_amount) filter (where t.inventory_status = 'assigned'), 0)::bigint as total_collected,
  coalesce(sum(t.sale_price - t.paid_amount)
             filter (where t.inventory_status = 'assigned'), 0)::bigint as pending_amount
from raffles r
left join tickets t on t.raffle_id = r.id
group by r.id;

comment on view v_raffle_summary is 'Totales de inventario y dinero por rifa.';

-- -----------------------------------------------------------------------------
-- v_payment_history — historial de abonos (BR-F13)
--
-- Incluye los pagos ANULADOS con su motivo: el historial refleja fielmente lo
-- ocurrido, no solo lo vigente (BR-F09).
-- -----------------------------------------------------------------------------
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
join clients c        on c.id = p.client_id
join profiles seller  on seller.id = p.seller_id
join profiles creator on creator.id = p.created_by;

comment on view v_payment_history is 'Historial de pagos con cliente, vendedor, metodo, estado y detalle de asignaciones (BR-F13).';

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop view v_payment_history;
-- drop view v_raffle_summary;
-- drop view v_seller_summary;
-- drop view v_client_balances;
-- drop view v_ticket_balances;
-- =============================================================================
