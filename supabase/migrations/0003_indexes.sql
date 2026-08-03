-- =============================================================================
-- 0003_indexes.sql
-- Fase 2 — Indices para las consultas frecuentes
--
-- Referencia normativa: docs/DATA_MODEL.md §5.
--
-- Nota: las restricciones UNIQUE de 0002 ya crearon sus propios indices
-- (tickets_combo_unique, tickets_org_internal_code_key, raffles_org_name_key,
-- etc.). Aqui solo se agregan los que faltan para filtros y busquedas.
-- =============================================================================

-- Busqueda por texto parcial en clientes (BR-C08: nombre, alias, telefono, email)
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- raffles
-- -----------------------------------------------------------------------------
create index raffles_org_status_idx on raffles (organization_id, status);

-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------
-- Cartera activa del vendedor (la consulta mas frecuente del portal Seller)
create index clients_org_seller_active_idx
  on clients (organization_id, seller_id)
  where archived_at is null;

-- Busqueda parcial: "juan", "312", "@gmail"
create index clients_name_trgm_idx  on clients using gin (name gin_trgm_ops);
create index clients_alias_trgm_idx on clients using gin (alias gin_trgm_ops);
create index clients_phone_trgm_idx on clients using gin (phone gin_trgm_ops);
create index clients_email_trgm_idx on clients using gin (email gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- tickets
-- -----------------------------------------------------------------------------
-- Tabla global del portal administrativo, con filtro por rifa y estado
create index tickets_org_raffle_status_idx
  on tickets (organization_id, raffle_id, inventory_status);

-- Portal Seller: sus boletas de una rifa, por estado
create index tickets_seller_raffle_status_idx
  on tickets (seller_id, raffle_id, inventory_status);

-- Busqueda por numero diario y por numero semanal (BR-N: busqueda exacta por texto)
create index tickets_org_raffle_daily_idx
  on tickets (organization_id, raffle_id, daily_number);
create index tickets_org_raffle_weekly_idx
  on tickets (organization_id, raffle_id, weekly_number);

-- Perfil de cliente: sus boletas
create index tickets_client_idx
  on tickets (client_id)
  where client_id is not null;

-- Metricas y reportes por estado de pago (columna generada, indexable)
create index tickets_org_raffle_payment_status_idx
  on tickets (organization_id, raffle_id, payment_status);

-- Aprobacion de boletas creadas por vendedores (bandeja del administrador)
create index tickets_org_pending_approval_idx
  on tickets (organization_id, raffle_id)
  where inventory_status = 'pending_approval';

-- -----------------------------------------------------------------------------
-- payments
-- -----------------------------------------------------------------------------
-- Pagos recientes y por rango de fechas, excluyendo anulados
create index payments_org_date_active_idx
  on payments (organization_id, payment_date desc)
  where voided_at is null;

create index payments_seller_date_idx on payments (seller_id, payment_date desc);
create index payments_client_date_idx on payments (client_id, payment_date desc);

-- -----------------------------------------------------------------------------
-- payment_allocations
-- -----------------------------------------------------------------------------
-- Recalculo de saldo de una boleta (lo usa el trigger de 0004 en cada pago)
create index payment_allocations_ticket_idx on payment_allocations (ticket_id);
-- Detalle de un pago y recalculo al anular
create index payment_allocations_payment_idx on payment_allocations (payment_id);
create index payment_allocations_org_idx on payment_allocations (organization_id);

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
create index audit_logs_org_created_idx on audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);

-- =============================================================================
-- Nota de reversion: drop index <nombre>; para cada uno de los anteriores.
-- =============================================================================
