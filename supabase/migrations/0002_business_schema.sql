-- =============================================================================
-- 0002_business_schema.sql
-- Fase 2 — Base de datos, restricciones y RLS
--
-- Tablas de negocio: raffles, clients, tickets, payments, payment_allocations,
-- audit_logs. Incluye TODAS las restricciones de integridad (CHECK, UNIQUE, FK
-- compuestas). Los indices van en 0003, los triggers en 0004, RLS en 0005,
-- auditoria en 0006, RPC en 0007 y vistas en 0008.
--
-- Referencia normativa: docs/DATA_MODEL.md §3-4, docs/BUSINESS_RULES.md.
--
-- Principio rector (docs/ARCHITECTURE.md §1.1): la base de datos es la ultima
-- frontera de seguridad. Toda regla critica del negocio debe ser imposible de
-- violar aqui, aunque falle toda la capa de aplicacion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos enumerados (docs/DATA_MODEL.md §3.3)
-- -----------------------------------------------------------------------------
create type raffle_status           as enum ('draft', 'active', 'closed', 'cancelled');
create type ticket_inventory_status as enum ('draft', 'pending_approval', 'available', 'assigned', 'cancelled');
create type ticket_payment_status   as enum ('unpaid', 'partial', 'paid');
create type payment_method          as enum ('cash', 'transfer', 'other');

-- -----------------------------------------------------------------------------
-- Fecha de negocio en America/Bogota (D-022)
--
-- sale_date y payment_date son dias calendario, no instantes: un pago hecho a
-- las 23:00 del dia 31 en Bogota pertenece al dia 31, no al 1 (que seria su
-- fecha en UTC).
-- -----------------------------------------------------------------------------
create function today_bogota()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/Bogota')::date
$$;

comment on function today_bogota() is 'Fecha de hoy en America/Bogota. Valor por defecto de las fechas de negocio.';

-- =============================================================================
-- raffles
-- =============================================================================
create table raffles (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references organizations (id) on delete restrict,
  -- Lo genera el trigger raffles_set_short_code (0004). El DEFAULT vacio hace
  -- que sea OPCIONAL al insertar (asi lo reflejan los tipos generados), y el
  -- CHECK garantiza que el trigger efectivamente lo rellenó: si alguien lo
  -- deshabilitara, la fila se rechazaria en vez de guardarse sin codigo.
  short_code                    text not null default '' check (short_code <> ''),
  name                          text not null check (length(btrim(name)) between 2 and 120),
  description                   text,
  ticket_price                  bigint not null default 100000 check (ticket_price > 0),
  currency                      char(3) not null default 'COP' check (currency = 'COP'),
  start_date                    date not null,
  end_date                      date not null,
  status                        raffle_status not null default 'draft',
  allow_seller_ticket_creation  boolean not null default false,
  ticket_counter                bigint not null default 0,
  created_by                    uuid not null references profiles (id) on delete restrict,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  closed_at                     timestamptz,

  -- BR-R07: la rifa no puede terminar antes de empezar
  constraint raffles_dates_check check (end_date >= start_date),
  constraint raffles_org_short_code_key unique (organization_id, short_code),
  -- Habilita la FK compuesta de tickets (garantia de organizacion, D-007)
  constraint raffles_id_org_key unique (id, organization_id)
);

-- BR-R11: nombre unico por organizacion, sin distinguir mayusculas ni espacios
create unique index raffles_org_name_key
  on raffles (organization_id, lower(btrim(name)));

create trigger raffles_set_updated_at
  before update on raffles
  for each row execute function set_updated_at();

comment on table raffles is 'Rifas de una organizacion. El precio de boleta se copia a tickets.sale_price al vender (BR-P03).';
comment on column raffles.ticket_price is 'Precio VIGENTE en pesos enteros. Cambiarlo NO afecta boletas ya vendidas (BR-R06).';
comment on column raffles.ticket_counter is 'Contador para generar tickets.internal_code. Lo mantiene un trigger (0004).';

-- =============================================================================
-- clients
-- =============================================================================
create table clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete restrict,
  seller_id        uuid not null,
  name             text not null check (length(btrim(name)) >= 2),
  alias            text,
  phone            text not null check (phone ~ '^[0-9+ ()-]{7,20}$'),
  email            text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- BR-C06: los clientes con historial se archivan, nunca se borran
  archived_at      timestamptz,

  -- BR-C01/BR-C05: el cliente pertenece a un vendedor de ESTA organizacion
  constraint clients_seller_org_fk foreign key (seller_id, organization_id)
    references memberships (profile_id, organization_id) on delete restrict,
  constraint clients_id_org_key unique (id, organization_id),
  -- Habilita las FK compuestas que atan boletas y pagos al vendedor del cliente
  constraint clients_id_seller_key unique (id, seller_id)
);

create trigger clients_set_updated_at
  before update on clients
  for each row execute function set_updated_at();

comment on table clients is 'Cartera de clientes de un vendedor. No se comparte entre vendedores (BR-C05).';

-- =============================================================================
-- tickets
--
-- Tabla central del negocio. Concentra las reglas mas criticas:
-- numeracion (BR-N*), inventario (BR-I*), precio (BR-P*) y saldo (BR-F*).
-- =============================================================================
create table tickets (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete restrict,
  raffle_id         uuid not null,
  seller_id         uuid not null,
  client_id         uuid,
  -- Lo genera el trigger tickets_set_internal_code (0004). Mismo patron que
  -- raffles.short_code: DEFAULT vacio para que sea opcional al insertar, CHECK
  -- para garantizar que el trigger lo rellenó.
  internal_code     text not null default '' check (internal_code <> ''),

  -- BR-N01/BR-N02/BR-N03: TEXTO, 1 a 4 digitos, ceros iniciales conservados.
  -- Se usa [0-9] y no \d: en PostgreSQL \d equivale a [[:digit:]], que bajo una
  -- intercalacion Unicode puede aceptar digitos de otros alfabetos (D-018).
  -- NULL solo se tolera en estado 'draft' (D-017), lo impone el CHECK de abajo.
  daily_number      text check (daily_number ~ '^[0-9]{1,4}$'),
  weekly_number     text check (weekly_number ~ '^[0-9]{1,4}$'),

  -- BR-P02: dinero como entero de pesos. NULL hasta que se vende.
  sale_price        bigint check (sale_price > 0),
  inventory_status  ticket_inventory_status not null default 'draft',

  -- BR-F07: suma de asignaciones de pagos NO anulados. La mantiene un trigger
  -- (0004); materializarla permite el CHECK de sobrepago y filtrar por estado
  -- sin agregar en cada consulta (D-009).
  paid_amount       bigint not null default 0,

  assigned_at       timestamptz,
  sale_date         date,
  created_by        uuid not null references profiles (id) on delete restrict,
  approved_by       uuid references profiles (id) on delete restrict,
  approved_at       timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- ---------------------------------------------------------------------------
  -- BR-N04/BR-N05/BR-N08 — LA restriccion mas importante del sistema.
  --
  -- Sin seller_id  -> la unicidad aplica ENTRE vendedores.
  -- Sin filtro WHERE -> incluye boletas anuladas, por lo que una combinacion
  --                     anulada NO puede reutilizarse en la misma rifa (MVP).
  -- Con raffle_id  -> la misma combinacion SI puede existir en otra rifa.
  -- ---------------------------------------------------------------------------
  constraint tickets_combo_unique unique (organization_id, raffle_id, daily_number, weekly_number),

  constraint tickets_org_internal_code_key unique (organization_id, internal_code),

  -- BR-N09: fuera de 'draft' los dos numeros son obligatorios
  constraint tickets_numbers_required_unless_draft check (
    inventory_status = 'draft'
    or (daily_number is not null and weekly_number is not null)
  ),
  -- BR-I05: una boleta asignada tiene cliente, precio y fechas
  constraint tickets_assigned_requires_sale check (
    inventory_status <> 'assigned'
    or (client_id is not null and sale_price is not null
        and sale_date is not null and assigned_at is not null)
  ),
  -- Solo una boleta vendida (o anulada tras venderse) tiene cliente
  constraint tickets_client_requires_assigned check (
    client_id is null or inventory_status in ('assigned', 'cancelled')
  ),
  -- BR-I04: 'available' significa aprobada y SIN cliente
  constraint tickets_available_has_no_client check (
    inventory_status <> 'available' or client_id is null
  ),
  constraint tickets_approved_fields check (
    (approved_by is null) = (approved_at is null)
  ),
  constraint tickets_cancelled_fields check (
    inventory_status <> 'cancelled' or cancelled_at is not null
  ),
  -- BR-F12: el sobrepago es fisicamente imposible, no solo una validacion de app
  constraint tickets_paid_amount_range check (
    paid_amount >= 0 and (sale_price is null or paid_amount <= sale_price)
  ),

  -- --- FK compuestas: imposible cruzar organizaciones o vendedores (D-007) ---
  constraint tickets_raffle_org_fk foreign key (raffle_id, organization_id)
    references raffles (id, organization_id) on delete restrict,
  constraint tickets_seller_org_fk foreign key (seller_id, organization_id)
    references memberships (profile_id, organization_id) on delete restrict,
  constraint tickets_client_org_fk foreign key (client_id, organization_id)
    references clients (id, organization_id) on delete restrict,
  -- El cliente de la boleta pertenece al MISMO vendedor de la boleta
  constraint tickets_client_seller_fk foreign key (client_id, seller_id)
    references clients (id, seller_id) on delete restrict,

  -- Habilita la FK compuesta que impide pagar la boleta de otro cliente
  constraint tickets_id_client_key unique (id, client_id)
);

-- ---------------------------------------------------------------------------
-- BR-F07/BR-F08 — Estado de pago CALCULADO (columna generada).
--
-- inventory_status y payment_status son dimensiones independientes: el vendedor
-- nunca elige el estado de pago, se deriva de paid_amount vs sale_price.
-- Se agrega con ALTER porque una columna generada no puede referenciar columnas
-- declaradas despues de ella dentro del mismo CREATE TABLE.
-- ---------------------------------------------------------------------------
alter table tickets add column payment_status ticket_payment_status
  generated always as (
    case
      when sale_price is null or paid_amount = 0 then 'unpaid'::ticket_payment_status
      when paid_amount < sale_price              then 'partial'::ticket_payment_status
      else                                            'paid'::ticket_payment_status
    end
  ) stored;

create trigger tickets_set_updated_at
  before update on tickets
  for each row execute function set_updated_at();

comment on table tickets is 'Boletas. Cada una tiene numero diario y semanal; la combinacion es unica por rifa (BR-N04).';
comment on column tickets.daily_number is 'TEXTO de 1 a 4 digitos. Conserva ceros iniciales: 007 <> 7 (BR-N03).';
comment on column tickets.weekly_number is 'TEXTO de 1 a 4 digitos. Conserva ceros iniciales (BR-N03).';
comment on column tickets.sale_price is 'Snapshot del precio de la rifa al vender. Inmutable con pagos activos (BR-P04/BR-P05).';
comment on column tickets.paid_amount is 'Materializada por trigger desde pagos NO anulados (BR-F07). No escribir a mano.';
comment on column tickets.payment_status is 'Columna GENERADA: Sin pagar / Abonada / Pagada. Nunca se elige manualmente (BR-F07).';

-- =============================================================================
-- payments
-- =============================================================================
create table payments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete restrict,
  seller_id        uuid not null,
  client_id        uuid not null,
  -- BR-F03: montos enteros estrictamente positivos
  total_amount     bigint not null check (total_amount > 0),
  payment_date     date not null default today_bogota(),
  payment_method   payment_method not null default 'cash',
  notes            text,
  created_by       uuid not null references profiles (id) on delete restrict,
  created_at       timestamptz not null default now(),

  -- BR-F09: los pagos NUNCA se borran, se anulan con motivo obligatorio
  voided_at        timestamptz,
  voided_by        uuid references profiles (id) on delete restrict,
  void_reason      text,

  constraint payments_void_fields check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null
        and length(btrim(void_reason)) >= 5)
  ),

  constraint payments_seller_org_fk foreign key (seller_id, organization_id)
    references memberships (profile_id, organization_id) on delete restrict,
  constraint payments_client_org_fk foreign key (client_id, organization_id)
    references clients (id, organization_id) on delete restrict,
  -- El pago lo registra el vendedor DUENO del cliente: junto con la FK de
  -- asignaciones, hace imposible pagar la boleta de otro vendedor.
  constraint payments_client_seller_fk foreign key (client_id, seller_id)
    references clients (id, seller_id) on delete restrict,

  -- Habilita la FK compuesta de payment_allocations
  constraint payments_id_client_key unique (id, client_id)
);

comment on table payments is 'Dinero recibido de un cliente. Se reparte entre boletas en payment_allocations. Nunca se elimina (BR-F09).';
comment on column payments.voided_at is 'Anulacion: las asignaciones dejan de contar y los saldos se recalculan (BR-F11).';

-- =============================================================================
-- payment_allocations
--
-- Reparto de un pago entre boletas. Las FK compuestas hacen estructuralmente
-- imposible pagar la boleta de otro cliente (BR-F02) o una boleta sin cliente
-- (BR-F04), sin depender de ninguna validacion de aplicacion.
-- =============================================================================
create table payment_allocations (
  id               uuid primary key default gen_random_uuid(),
  payment_id       uuid not null,
  ticket_id        uuid not null,
  -- Desnormalizados a proposito: habilitan las FK compuestas y una RLS eficiente
  client_id        uuid not null,
  organization_id  uuid not null references organizations (id) on delete restrict,
  amount           bigint not null check (amount > 0),
  created_at       timestamptz not null default now(),

  -- La asignacion pertenece al mismo cliente que el pago...
  constraint alloc_payment_client_fk foreign key (payment_id, client_id)
    references payments (id, client_id) on delete restrict,
  -- ...y la boleta pagada es del MISMO cliente.
  -- Como client_id es NOT NULL aqui y tickets.client_id es NULL en una boleta
  -- sin vender, una boleta sin cliente jamas puede recibir un pago.
  constraint alloc_ticket_client_fk foreign key (ticket_id, client_id)
    references tickets (id, client_id) on delete restrict,

  -- Una sola asignacion por (pago, boleta): evita duplicados accidentales
  constraint alloc_payment_ticket_key unique (payment_id, ticket_id)
);

comment on table payment_allocations is 'Porcion de un pago aplicada a una boleta. SUM(amount) debe igualar payments.total_amount (BR-F05).';

-- =============================================================================
-- audit_logs
--
-- Append-only: sin politicas de UPDATE ni DELETE para ningun rol (ver 0005).
-- La escritura ocurre desde triggers y funciones SECURITY DEFINER (0006, 0007).
-- =============================================================================
create table audit_logs (
  id                bigint primary key generated always as identity,
  organization_id   uuid not null references organizations (id) on delete restrict,
  actor_profile_id  uuid references profiles (id) on delete restrict,
  action            text not null,
  entity_type       text not null,
  entity_id         uuid,
  old_values        jsonb,
  new_values        jsonb,
  ip_address        inet,
  user_agent        text,
  created_at        timestamptz not null default now()
);

comment on table audit_logs is 'Bitacora de solo anexado. Sin UPDATE ni DELETE para ningun rol (BR-D02).';

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop table payment_allocations;
-- drop table payments;
-- drop table tickets;
-- drop table clients;
-- drop table raffles;
-- drop table audit_logs;
-- drop function today_bogota();
-- drop type payment_method;
-- drop type ticket_payment_status;
-- drop type ticket_inventory_status;
-- drop type raffle_status;
--
-- Estrategia de recuperacion completa: docs/DEPLOYMENT.md (Fase 8) y
-- docs/KNOWN_ISSUES.md. En desarrollo: `npx supabase db reset` reconstruye
-- todo desde cero (migraciones + seed).
-- =============================================================================
