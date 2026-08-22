# MODELO DE DATOS

- **Versión:** 2.5 · **Estado:** implementado · **Actualizado:** 2026-08-22
- **Estado:** el esquema ejecutable vive en las 30 migraciones `0001`–`0030`. `0001`–`0029` están
  aplicadas y verificadas en local y en el proyecto Supabase real; **`0030` solo en local**
  (I-062 a I-065, D-102).
- Este documento describe el diseño; la **fuente de verdad ejecutable** son las migraciones y los
  tipos generados en `src/types/database.types.ts`. Las pruebas de `tests/db/` verifican el
  esquema local; producción se comprueba con `verify:remote` y las sondas registradas en
  `TEST_RESULTS.md`.

### Ajustes introducidos al implementar (Fase 2)

| Cambio | Motivo | Decisión |
|---|---|---|
| `short_code` e `internal_code` con `DEFAULT ''` + `CHECK <> ''` | Los genera un trigger; sin DEFAULT los tipos los exigían al insertar | D-039 |
| Agregaciones monetarias de las vistas casteadas a `bigint` | `sum(bigint)` devuelve `numeric` y rompía la consistencia de tipos | D-040 |
| Trigger `tickets_guard_paid_amount` | Impide escribir un `paid_amount` inventado, aunque se tenga permiso sobre la fila | — |
| Migraciones `0009`/`0010` de privilegios | Los `GRANT` por defecto de Supabase no son iguales en todos los entornos | D-037, D-038 |
| Auditoría con lista de exclusión | Evita miles de entradas por contadores internos y columnas derivadas | D-041 |

### Ajustes introducidos al implementar (Fase 3)

| Cambio | Motivo | Decisión |
|---|---|---|
| `0011`: `profiles_select` deja de exigir que la membresía **objetivo** esté activa | Al desactivar a un usuario desaparecía del listado y no se podía reactivar | I-011 |

### Ajustes introducidos al implementar (Fase 5)

| Cambio | Motivo | Decisión |
|---|---|---|
| `0012`: `v_payment_history` pasa a **LEFT JOIN** sobre `profiles` y añade `voided_by_name` | Con INNER JOIN, un nombre invisible para quien consulta borraba el pago entero de su historial | I-015 |

**Regla que se desprende:** en una vista `security_invoker`, todo `JOIN` contra una tabla con RLS
debe ser `LEFT JOIN` salvo que se pueda demostrar que quien ve la fila principal ve también la
unida. Un INNER JOIN ahí no filtra columnas: elimina filas.

### Ajustes introducidos al implementar (Fase 6)

| Cambio | Motivo | Decisión |
|---|---|---|
| `0013`: funciones `report_payment_totals` y `report_payments_by_day` | El reporte de pagos necesita agregados **parametrizados** por rango, vendedor, método y estado. Una vista no acepta parámetros, y agrupar por todas esas columnas para poder filtrarlas después supera el límite de 1.000 filas de PostgREST | D-057 |

**Regla que se desprende:** un agregado con parámetros es una **función `stable security invoker`**,
no una vista. `SECURITY INVOKER` —al contrario que las RPC de escritura de `0007`, que son
`SECURITY DEFINER`— porque solo lee: así hereda la RLS de quien consulta y el aislamiento entre
vendedores se mantiene sin que la función filtre nada.

---

## 1. Diagrama entidad-relación

```mermaid
erDiagram
    ORGANIZATIONS  ||--o{ MEMBERSHIPS : "tiene"
    ORGANIZATIONS  ||--o{ RAFFLES : "tiene"
    ORGANIZATIONS  ||--o{ CLIENTS : "tiene"
    ORGANIZATIONS  ||--o{ TICKETS : "tiene"
    ORGANIZATIONS  ||--o{ PAYMENTS : "tiene"
    ORGANIZATIONS  ||--o{ AUDIT_LOGS : "tiene"
    PROFILES       ||--o{ MEMBERSHIPS : "pertenece a"
    PROFILES       ||--o{ CLIENTS : "vendedor de"
    PROFILES       ||--o{ TICKETS : "vendedor de"
    PROFILES       ||--o{ PAYMENTS : "registra"
    RAFFLES        ||--o{ TICKETS : "contiene"
    CLIENTS        ||--o{ TICKETS : "compra"
    CLIENTS        ||--o{ PAYMENTS : "paga"
    TICKETS        ||--o{ PAYMENT_ALLOCATIONS : "recibe"
    PAYMENTS       ||--|{ PAYMENT_ALLOCATIONS : "se reparte en"
```

`auth.users` (gestionada por Supabase Auth) se relaciona 1:1 con `profiles` mediante el mismo `id`.

---

## 2. Estrategia multiorganización

| Decisión | Detalle |
|----------|---------|
| Frontera | `organizations.id`. Ningún dato cruza esa frontera. |
| Propagación | **Todas** las tablas de negocio llevan `organization_id` propio y `NOT NULL`. |
| Consistencia | Claves foráneas **compuestas** que incluyen `organization_id` (ver §4.3). Es imposible que una boleta apunte a una rifa de otra organización. |
| Pertenencia de usuario | Tabla `memberships` (usuario × organización × rol). Un usuario puede, en el futuro, pertenecer a varias organizaciones. |
| Organización activa | En el MVP se deriva de la única membresía activa del usuario. Antes de permitir varias, se elegirá explícitamente con contexto firmado y sesión, consultas y RLS deberán compartir ese alcance (I-047). |

---

## 3. Convenciones

### 3.1 Generales
- Claves primarias `uuid` con `DEFAULT gen_random_uuid()`.
- `created_at timestamptz NOT NULL DEFAULT now()`; `updated_at timestamptz NOT NULL DEFAULT now()`
  mantenida por el trigger genérico `set_updated_at()`.
- Nombres de tabla en plural, en inglés, `snake_case`. Valores de enumeración en inglés; las
  etiquetas en español viven en la aplicación (`lib/constants.ts`).
- Borrado físico prohibido en entidades con historial: se usa `archived_at`, `cancelled_at` o
  `voided_at`.

### 3.2 Tipos por naturaleza del dato

| Naturaleza | Tipo | Razón |
|------------|------|-------|
| Dinero | `bigint` (pesos enteros) | Sin errores de punto flotante; `bigint` evita desbordes en acumulados |
| Números de boleta | `text` | Conserva ceros iniciales; nunca se castea a numérico |
| Fecha de negocio (`sale_date`, `payment_date`) | `date` | Es un día calendario en `America/Bogota`, no un instante |
| Marca de tiempo técnica | `timestamptz` | Instante absoluto, almacenado en UTC |
| Estado | `enum` de PostgreSQL | Valores cerrados, validados por el motor |
| Datos flexibles de auditoría | `jsonb` | Estructura variable por entidad |

> **Prohibido:** `float`, `real`, `double precision`, `money` y `numeric` para valores monetarios.

### 3.3 Tipos enumerados

```sql
CREATE TYPE app_role            AS ENUM ('owner', 'admin', 'seller');
CREATE TYPE raffle_status       AS ENUM ('draft', 'active', 'closed', 'cancelled');
CREATE TYPE ticket_inventory_status AS ENUM ('draft', 'pending_approval', 'available', 'assigned', 'cancelled');
CREATE TYPE ticket_payment_status   AS ENUM ('unpaid', 'partial', 'paid');
CREATE TYPE payment_method      AS ENUM ('cash', 'transfer', 'other');
```

---

## 4. Tablas

### 4.1 `organizations`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` |
| `name` | `text` | `NOT NULL`, `CHECK (length(btrim(name)) BETWEEN 2 AND 120)` |
| `default_ticket_price` | `bigint` | `NOT NULL DEFAULT 120000` (`0027`), `CHECK (> 0)` |
| `currency` | `char(3)` | `NOT NULL DEFAULT 'COP'`, `CHECK (currency = 'COP')` (MVP) |
| `timezone` | `text` | `NOT NULL DEFAULT 'America/Bogota'` |
| `raffle_counter` | `int` | `NOT NULL DEFAULT 0` — genera `raffles.short_code` |
| `is_active` | `boolean` | `NOT NULL DEFAULT true` |
| `created_at` / `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

### 4.2 `profiles` (1:1 con `auth.users`)

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `uuid` | PK, FK → `auth.users(id)` `ON DELETE CASCADE` |
| `full_name` | `text` | `NOT NULL`, `CHECK (length(btrim(full_name)) >= 2)` |
| `alias` | `text` | `NULL` |
| `phone` | `text` | `NOT NULL`, `CHECK (phone ~ '^[0-9+ ()-]{7,20}$')` |
| `email` | `text` | `NOT NULL` — copia desnormalizada de `auth.users.email` para búsqueda |
| `is_active` | `boolean` | `NOT NULL DEFAULT true` — desactivación global de la persona |
| `activated_at` | `timestamptz` | `NULL` = **invitación pendiente**: nunca configuró su contraseña (`0026`, BR-E14) |
| `created_at` / `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

- Se crea automáticamente con un trigger `AFTER INSERT ON auth.users`. Si la cuenta nace **con**
  contraseña (`auth.admin.createUser`, seed y pruebas), nace también con `activated_at`.
- `email` se sincroniza con un trigger sobre `auth.users`; la fuente de verdad sigue siendo Auth.
- `activated_at` **no** se deduce de `auth.users`: lo escribe `mark_profile_activated()` cuando la
  persona termina de definir su contraseña o entra con una. GoTrue escribe un hash aleatorio en
  `encrypted_password` con solo abrir el enlace de la invitación, así que esa columna no distingue
  «abrió el correo» de «configuró su cuenta» (D-097, prueba BD E2-02). Índice parcial
  `profiles_pending_activation_idx` para la única pregunta que se le hace: quién sigue pendiente.
- `is_active` y `activated_at` responden cosas distintas y no se mezclan: la primera, «¿le quitaron
  el acceso?»; la segunda, «¿llegó a tener cuenta?».

### 4.3 `memberships` (usuario × organización × rol)

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `uuid` | PK |
| `organization_id` | `uuid` | `NOT NULL`, FK → `organizations(id)` `ON DELETE RESTRICT` |
| `profile_id` | `uuid` | `NOT NULL`, FK → `profiles(id)` `ON DELETE RESTRICT` |
| `role` | `app_role` | `NOT NULL` |
| `is_active` | `boolean` | `NOT NULL DEFAULT true` |
| `invited_by` | `uuid` | FK → `profiles(id)`, `NULL` |
| `parent_seller_id` | `uuid` | `NULL`, FK compuesta → `memberships(profile_id, organization_id)` (`0022`, BR-E01) |
| `created_at` / `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

Restricciones clave:

```sql
-- Un usuario tiene un único rol por organización
ALTER TABLE memberships ADD CONSTRAINT memberships_org_profile_key
  UNIQUE (organization_id, profile_id);

-- Habilita las FK compuestas de las tablas hijas (garantía de organización)
ALTER TABLE memberships ADD CONSTRAINT memberships_profile_org_key
  UNIQUE (profile_id, organization_id);

-- COMO MÁXIMO un Owner activo por organización.
-- Un índice único no puede exigir «al menos una fila»: ver más abajo.
CREATE UNIQUE INDEX memberships_one_owner_per_org
  ON memberships (organization_id)
  WHERE role = 'owner' AND is_active;

-- Equipos de vendedores (0022, D-091). La FK es COMPUESTA y se apoya en la
-- unicidad de arriba: hace imposible un vendedor padre de otra organización.
ALTER TABLE memberships ADD CONSTRAINT memberships_parent_seller_fk
  FOREIGN KEY (parent_seller_id, organization_id)
  REFERENCES memberships (profile_id, organization_id) ON DELETE RESTRICT;

ALTER TABLE memberships ADD CONSTRAINT memberships_parent_not_self
  CHECK (parent_seller_id IS NULL OR parent_seller_id <> profile_id);

ALTER TABLE memberships ADD CONSTRAINT memberships_parent_only_for_sellers
  CHECK (parent_seller_id IS NULL OR role = 'seller');
```

**`parent_seller_id`** (BR-E01): nulo = vendedor a cargo del Dueño o el Administrador; con valor =
integrante del equipo de ese vendedor. Lo que un `CHECK` no puede ver —que el padre esté activo, sea
vendedor y no pertenezca a otro equipo— lo impone el trigger `memberships_validate_parent_seller`.
Hoy la jerarquía tiene dos niveles (BR-E03); el modelo admite más sin cambiar de forma.

⚠️ **Este índice garantiza «como máximo uno», no «exactamente uno».** Durante siete fases esta
sección decía «exactamente un Owner activo», y el resto del modelo lo daba por cierto — hasta que la
auditoría de la Fase 9 comprobó que un Owner podía degradarse o desactivarse a sí mismo y dejar la
organización sin propietario, de forma irrecuperable desde la aplicación (A-02, I-025).

La otra mitad la aporta el trigger diferido `memberships_require_active_owner` (`0016`, D-071), que
rechaza al COMMIT cualquier cambio de `role` o `is_active` que deje la organización sin Owner activo.
**Las dos piezas juntas** —índice para el techo, trigger para el suelo— son las que hacen cierto
«exactamente uno». Aplicado en local y en el proyecto real (2026-08-05).

**Acceso efectivo** = `profiles.is_active` **AND** `memberships.is_active` **AND**
`organizations.is_active`. Cualquiera de los tres en `false` bloquea el ingreso y la operación.

#### Patrón de clave foránea compuesta (garantía de organización)

Cada tabla hija expone `UNIQUE (id, organization_id)` para que sus hijas puedan referenciarla
incluyendo la organización. Ejemplo con boletas:

```sql
ALTER TABLE raffles ADD CONSTRAINT raffles_id_org_key UNIQUE (id, organization_id);

ALTER TABLE tickets ADD CONSTRAINT tickets_raffle_same_org_fk
  FOREIGN KEY (raffle_id, organization_id)
  REFERENCES raffles (id, organization_id) ON DELETE RESTRICT;
```

Resultado: **es estructuralmente imposible** que una boleta pertenezca a una rifa de otra
organización, incluso con `SERVICE_ROLE` o con un error de programación.

### 4.4 `raffles`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `uuid` | PK |
| `organization_id` | `uuid` | `NOT NULL`, FK → `organizations(id)` |
| `short_code` | `text` | `NOT NULL`, `UNIQUE (organization_id, short_code)` — generado `R001`, `R002`… |
| `name` | `text` | `NOT NULL`, `UNIQUE (organization_id, lower(btrim(name)))` |
| `description` | `text` | `NULL` |
| `ticket_price` | `bigint` | `NOT NULL DEFAULT 120000` (`0027`), `CHECK (ticket_price > 0)` |
| `currency` | `char(3)` | `NOT NULL DEFAULT 'COP'` |
| `start_date` | `date` | `NOT NULL` |
| `end_date` | `date` | `NOT NULL`, `CHECK (end_date >= start_date)` |
| `status` | `raffle_status` | `NOT NULL DEFAULT 'draft'` |
| `allow_seller_ticket_creation` | `boolean` | `NOT NULL DEFAULT false` |
| `ticket_counter` | `bigint` | `NOT NULL DEFAULT 0` — genera `tickets.internal_code` |
| `created_by` | `uuid` | `NOT NULL`, FK → `profiles(id)` |
| `created_at` / `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `closed_at` | `timestamptz` | `NULL` |

- El precio predeterminado es `120000` (BR-P01, D-098). ⚠️ **Contradicción real detectada al
  corregirlo:** este documento decía que el valor sale de `organizations.default_ticket_price`, pero
  **ningún camino de código lee esa columna**; el formulario de rifa nueva usa la constante
  `DEFAULT_TICKET_PRICE` de `src/lib/constants.ts`. La columna se conserva y se mantiene coherente
  (`0027` la actualizó también), pero hoy es configuración inerte. Se reporta en vez de cambiarse en
  silencio (§36.1 de `CLAUDE.md`).
- Cambiar `ticket_price` **no** afecta boletas ya vendidas (§4.6, `sale_price`). La única excepción es
  corregir un precio que nunca fue correcto, por migración versionada y sin tocar pagos (BR-P07).
- Transiciones de estado válidas: `draft → active → closed`; cualquier estado → `cancelled`.
  `closed → active` se permite solo a Owner (reapertura documentada en auditoría).

### 4.5 `clients`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `uuid` | PK |
| `organization_id` | `uuid` | `NOT NULL`, FK → `organizations(id)` |
| `seller_id` | `uuid` | `NOT NULL`, FK compuesta → `memberships(profile_id, organization_id)` |
| `name` | `text` | `NOT NULL`, `CHECK (length(btrim(name)) >= 2)` |
| `alias` | `text` | `NULL` |
| `phone` | `text` | `NOT NULL`, `CHECK (phone ~ '^[0-9+ ()-]{7,20}$')` |
| `email` | `text` | `NULL`, `CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')` |
| `notes` | `text` | `NULL` |
| `created_at` / `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `archived_at` | `timestamptz` | `NULL` — archivado en lugar de borrado |

Adicional: `UNIQUE (id, organization_id)`, `UNIQUE (id, seller_id)` (habilitan FK compuestas).

- Un cliente pertenece a **un** vendedor; no se comparte automáticamente entre vendedores.
- El mismo teléfono puede repetirse entre vendedores (son carteras separadas); se avisa en UI
  como advertencia, no como error.
- Búsqueda por nombre, alias, teléfono y email mediante índice `pg_trgm` (§5).

### 4.6 `tickets`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `uuid` | PK |
| `organization_id` | `uuid` | `NOT NULL`, FK → `organizations(id)` |
| `raffle_id` | `uuid` | `NOT NULL`, FK compuesta → `raffles(id, organization_id)` |
| `seller_id` | `uuid` | `NOT NULL`, FK compuesta → `memberships(profile_id, organization_id)` |
| `client_id` | `uuid` | `NULL`, FK compuesta → `clients(id, organization_id)` `ON DELETE RESTRICT` |
| `internal_code` | `text` | `NOT NULL`, `UNIQUE (organization_id, internal_code)` — `R001-000123` |
| `daily_number` | `text` | `NULL` solo en `draft`; `CHECK (daily_number ~ '^[0-9]{1,4}$')` |
| `weekly_number` | `text` | `NULL` solo en `draft`; `CHECK (weekly_number ~ '^[0-9]{1,4}$')` |
| `sale_price` | `bigint` | `NULL` hasta la venta; `CHECK (sale_price > 0)`. Es **lo que debe el cliente** |
| `base_price` | `bigint` | `NULL` hasta la venta y en toda boleta vendida antes de `0028`; `CHECK (base_price > 0)`. Precio de la rifa congelado al vender (BR-P10) |
| `inventory_status` | `ticket_inventory_status` | `NOT NULL DEFAULT 'draft'` |
| `paid_amount` | `bigint` | `NOT NULL DEFAULT 0`, materializada por trigger |
| `payment_status` | `ticket_payment_status` | Columna **generada** (§4.6.4) |
| `assigned_at` | `timestamptz` | `NULL` |
| `sale_date` | `date` | `NULL` |
| `created_by` | `uuid` | `NOT NULL`, FK → `profiles(id)` |
| `approved_by` | `uuid` | `NULL`, FK → `profiles(id)` |
| `approved_at` | `timestamptz` | `NULL` |
| `cancelled_at` | `timestamptz` | `NULL` |
| `cancel_reason` | `text` | `NULL` |
| `created_at` / `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

#### 4.6.1 Numeración (regla crítica)

```sql
-- Solo dígitos ASCII, de 1 a 4. Se usa [0-9] y no \d: en PostgreSQL \d puede
-- coincidir con dígitos Unicode de otros alfabetos.
CONSTRAINT tickets_daily_number_format  CHECK (daily_number  ~ '^[0-9]{1,4}$'),
CONSTRAINT tickets_weekly_number_format CHECK (weekly_number ~ '^[0-9]{1,4}$'),
```

- Los valores se guardan **exactamente** como se escriben: `'007'` ≠ `'7'`. Nunca se aplica
  `TRIM`, `LTRIM`, `::int` ni normalización de ceros en ninguna capa.
- Válidos: `1`, `25`, `007`, `0000`, `9999`. Inválidos: `12345`, `12A4`, `-123`, `12.5`, `''`.
- Una boleta en `draft` puede tener números `NULL` (aún no capturados). Fuera de `draft` son
  obligatorios (§4.6.3).

#### 4.6.2 Snapshot de precio

Al vender se congelan **dos** cifras, y hace falta distinguirlas (BR-P09..BR-P12, D-099):

| Columna | Qué es | Para qué sirve |
|---|---|---|
| `sale_price` | Lo que **debe el cliente** | Saldo, estado de pago, tope de sobrepago, totales de ventas |
| `base_price` | El **precio de la rifa** en ese momento | Calcular la rebaja concedida |

- Las dos las escribe `assign_ticket_row`. Sin precio explícito, `sale_price = base_price =
  raffles.ticket_price`, que es el comportamiento de siempre.
- `CHECK (sale_price <= base_price)`: esto es para rebajar, nunca para recargar.
- **La rebaja no se guarda**: es `base_price - sale_price`. Guardarla sería un tercer número capaz de
  desincronizarse de los otros dos (mismo criterio que `pending_amount`).
- `base_price` **nulo** = boleta vendida antes de `0028`. En todas partes se lee
  `coalesce(base_price, sale_price)`, así que equivale a rebaja cero y se comporta como antes.
- Trigger `tickets_protect_sale_price`: si `paid_amount > 0`, cualquier `UPDATE` de `sale_price`
  se rechaza. Solo un procedimiento administrativo documentado (anular pagos → corregir → volver a
  registrar) puede cambiarlo.
- Modificar `raffles.ticket_price` no propaga cambios a boletas existentes.

⚠️ **`raffles.ticket_price - sale_price` NO es la rebaja.** El precio de la rifa cambia (BR-P04, y
cambió en `0027`), así que esa resta convertiría en «rebaja» ventas hechas al precio correcto. La
rebaja se calcula **siempre** contra `base_price`.

#### 4.6.3 Restricciones de integridad y unicidad

```sql
-- Unicidad de la combinación dentro de la rifa. Sin seller_id: aplica ENTRE vendedores.
-- Sin filtro WHERE: incluye boletas anuladas, por lo que una combinación anulada
-- NO puede reutilizarse dentro de la misma rifa (regla del MVP).
ALTER TABLE tickets ADD CONSTRAINT tickets_combo_unique
  UNIQUE (organization_id, raffle_id, daily_number, weekly_number);

-- Coherencia de estado ↔ datos
CONSTRAINT tickets_numbers_required_unless_draft CHECK (
  inventory_status = 'draft'
  OR (daily_number IS NOT NULL AND weekly_number IS NOT NULL)
),
CONSTRAINT tickets_assigned_requires_sale CHECK (
  inventory_status <> 'assigned'
  OR (client_id IS NOT NULL AND sale_price IS NOT NULL
      AND sale_date IS NOT NULL AND assigned_at IS NOT NULL)
),
CONSTRAINT tickets_client_requires_assigned CHECK (
  client_id IS NULL OR inventory_status IN ('assigned', 'cancelled')
),
CONSTRAINT tickets_available_has_no_client CHECK (
  inventory_status <> 'available' OR client_id IS NULL
),
CONSTRAINT tickets_approved_fields CHECK (
  (approved_by IS NULL) = (approved_at IS NULL)
),
CONSTRAINT tickets_cancelled_fields CHECK (
  inventory_status <> 'cancelled' OR cancelled_at IS NOT NULL
),
CONSTRAINT tickets_paid_amount_range CHECK (
  paid_amount >= 0 AND (sale_price IS NULL OR paid_amount <= sale_price)
),

-- Habilita la FK compuesta que impide pagar la boleta de otro cliente
ALTER TABLE tickets ADD CONSTRAINT tickets_id_client_key UNIQUE (id, client_id);
```

> **Nota sobre `NULL` y unicidad:** PostgreSQL considera distintos los `NULL` en índices únicos, por
> lo que varias boletas `draft` sin números coexisten sin conflicto. En cuanto una fila deja de ser
> `draft`, los números son obligatorios y la unicidad aplica plenamente.

#### 4.6.4 Estado de pago calculado

`inventory_status` y `payment_status` son **dimensiones independientes**. El vendedor nunca
selecciona el estado de pago.

```sql
payment_status ticket_payment_status GENERATED ALWAYS AS (
  CASE
    WHEN sale_price IS NULL OR paid_amount = 0 THEN 'unpaid'::ticket_payment_status
    WHEN paid_amount < sale_price             THEN 'partial'::ticket_payment_status
    ELSE                                            'paid'::ticket_payment_status
  END
) STORED
```

- `pending_amount` = `sale_price - paid_amount` (expuesto por la vista `v_ticket_balances`).
- `paid_amount` lo mantiene el trigger `recalc_ticket_paid_amount()` a partir de asignaciones de
  pagos **no anulados**. La `CHECK` de rango convierte el sobrepago en un error de base de datos,
  no solo de aplicación.

Matriz de combinaciones válidas:

| `inventory_status` | `payment_status` posible | Comentario |
|---|---|---|
| `draft` | `unpaid` | Sin cliente, sin precio |
| `pending_approval` | `unpaid` | Esperando aprobación |
| `available` | `unpaid` | Aprobada, sin cliente |
| `assigned` | `unpaid`, `partial`, `paid` | Único estado que admite pagos |
| `cancelled` | `unpaid` | Solo se anula si no tiene pagos activos |

#### 4.6.5 Generación de `internal_code`

Trigger `BEFORE INSERT` cuando `internal_code IS NULL`: incrementa `raffles.ticket_counter` con
bloqueo de fila y produce `{raffles.short_code}-{lpad(counter,6,'0')}`.
Para la creación masiva, la RPC reserva el bloque completo de una vez
(`UPDATE raffles SET ticket_counter = ticket_counter + n RETURNING …`) y asigna los códigos de forma
conjunta, evitando 1.000 actualizaciones secuenciales.

### 4.7 `payments`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `uuid` | PK |
| `organization_id` | `uuid` | `NOT NULL`, FK → `organizations(id)` |
| `seller_id` | `uuid` | `NOT NULL`, FK compuesta → `memberships(profile_id, organization_id)` |
| `client_id` | `uuid` | `NOT NULL`, FK compuesta → `clients(id, organization_id)` |
| `total_amount` | `bigint` | `NOT NULL`, `CHECK (total_amount > 0)` |
| `payment_date` | `date` | `NOT NULL DEFAULT today_bogota()` |
| `payment_method` | `payment_method` | `NOT NULL DEFAULT 'cash'` |
| `notes` | `text` | `NULL` |
| `created_by` | `uuid` | `NOT NULL`, FK → `profiles(id)` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `voided_at` | `timestamptz` | `NULL` |
| `voided_by` | `uuid` | `NULL`, FK → `profiles(id)` |
| `void_reason` | `text` | `NULL` |

```sql
CONSTRAINT payments_void_fields CHECK (
  (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
  OR (voided_at IS NOT NULL AND voided_by IS NOT NULL
      AND length(btrim(void_reason)) >= 5)
),
-- Habilita la FK compuesta de asignaciones
ALTER TABLE payments ADD CONSTRAINT payments_id_client_key UNIQUE (id, client_id);
```

Los pagos **no se eliminan nunca**. RLS no concede `DELETE` a ningún rol.

### 4.8 `payment_allocations`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `uuid` | PK |
| `payment_id` | `uuid` | `NOT NULL`, FK → `payments(id)` `ON DELETE RESTRICT` |
| `ticket_id` | `uuid` | `NOT NULL`, FK → `tickets(id)` `ON DELETE RESTRICT` |
| `client_id` | `uuid` | `NOT NULL` — desnormalizada para las FK compuestas |
| `organization_id` | `uuid` | `NOT NULL` — desnormalizada para RLS eficiente |
| `amount` | `bigint` | `NOT NULL`, `CHECK (amount > 0)` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

```sql
-- La asignación pertenece al mismo cliente que el pago…
ALTER TABLE payment_allocations ADD CONSTRAINT alloc_payment_client_fk
  FOREIGN KEY (payment_id, client_id) REFERENCES payments (id, client_id);

-- …y la boleta pagada es del MISMO cliente.
-- Como client_id es NOT NULL aquí, una boleta sin cliente no puede recibir pagos.
ALTER TABLE payment_allocations ADD CONSTRAINT alloc_ticket_client_fk
  FOREIGN KEY (ticket_id, client_id) REFERENCES tickets (id, client_id);

-- Una sola asignación por (pago, boleta): evita duplicados accidentales
ALTER TABLE payment_allocations ADD CONSTRAINT alloc_payment_ticket_key
  UNIQUE (payment_id, ticket_id);
```

**Cuadre pago ↔ asignaciones.** `SUM(payment_allocations.amount) = payments.total_amount` se verifica
con un *constraint trigger* `DEFERRABLE INITIALLY DEFERRED` sobre ambas tablas: se comprueba al
confirmar la transacción, permitiendo insertar el pago y sus asignaciones en cualquier orden dentro
de la misma transacción, pero impidiendo confirmar un estado descuadrado.

### 4.9 `audit_logs`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `bigint` | PK, `GENERATED ALWAYS AS IDENTITY` |
| `organization_id` | `uuid` | `NOT NULL`, FK → `organizations(id)` |
| `actor_profile_id` | `uuid` | `NULL` (procesos del sistema), FK → `profiles(id)` |
| `action` | `text` | `NOT NULL` — p. ej. `payment.void`, `ticket.approve` |
| `entity_type` | `text` | `NOT NULL` — `ticket`, `payment`, `raffle`, `membership`, `client` |
| `entity_id` | `uuid` | `NULL` |
| `old_values` | `jsonb` | `NULL` |
| `new_values` | `jsonb` | `NULL` |
| `ip_address` | `inet` | `NULL` |
| `user_agent` | `text` | `NULL` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

Append-only: sin políticas de `UPDATE` ni `DELETE` para ningún rol. La escritura ocurre desde
triggers y funciones `SECURITY DEFINER`. Eventos mínimos registrados: `docs/SECURITY.md` §6.

---

## 5. Índices

| Tabla | Índice | Motivo |
|-------|--------|--------|
| `memberships` | `(organization_id, role) WHERE is_active` | Listados de vendedores/administradores |
| `memberships` | `(profile_id) WHERE is_active` | Resolución de sesión en cada request |
| `raffles` | `(organization_id, status)` | Rifa activa y listados |
| `clients` | `(organization_id, seller_id) WHERE archived_at IS NULL` | Cartera del vendedor |
| `clients` | GIN `pg_trgm` sobre `name`, `alias`, `phone`, `email` | Búsqueda por texto parcial |
| `clients` | GIN `pg_trgm` sobre `search_text` (`0017`) | Búsqueda normalizada: acentos y formatos de teléfono (D-079) |
| `tickets` | GIN `pg_trgm` sobre `internal_code` (`0017`) | Quedó **sin uso en la interfaz** desde `0018` (BR-N11); se conserva porque el código sigue siendo el identificador administrativo |
| `tickets` | GIN `pg_trgm` sobre `daily_number` (`0018`) | `like '%123%'`: el comodín inicial impide usar el B-tree |
| `tickets` | GIN `pg_trgm` sobre `weekly_number` (`0018`) | Igual, para el número semanal |
| `tickets` | `(organization_id, raffle_id, inventory_status)` | Tabla global con filtros |
| `tickets` | `(seller_id, raffle_id, inventory_status)` | Portal Seller |
| `tickets` | `(organization_id, raffle_id, daily_number)` | Comparación exacta y por prefijo del número diario |
| `tickets` | `(organization_id, raffle_id, weekly_number)` | Comparación exacta y por prefijo del número semanal |
| `tickets` | `(organization_id, internal_code)` (único) | Unicidad del código; ya no lo usa ninguna búsqueda de la interfaz |
| `tickets` | `(client_id) WHERE client_id IS NOT NULL` | Perfil de cliente; también los saldos de `v_client_balances` desde `0030` |
| `tickets` | `(organization_id, raffle_id, payment_status)` | Métricas y reportes |
| `tickets` | `(created_at DESC)` (`0030`) | Orden por defecto del listado de boletas (D-102) |
| `tickets` | `(assigned_at DESC) WHERE inventory_status = 'assigned'` (`0030`) | «Ventas recientes» del panel (D-102) |
| `tickets` | `(seller_id, raffle_id, payment_status) WHERE inventory_status = 'assigned'` (`0030`) | Recuento de comisión que corre en **cada** abono (D-102) |
| `clients` | `(name) WHERE archived_at IS NULL` (`0030`) | Orden alfabético del listado de clientes (D-102) |
| `clients` | `(created_at DESC) WHERE archived_at IS NULL` (`0030`) | «Clientes recientes» del panel (D-102) |
| `payments` | `(payment_date DESC, created_at DESC)` (`0030`) | Orden del historial, **incluidos los anulados** (D-102) |
| `payments` | `(organization_id, payment_date DESC) WHERE voided_at IS NULL` | Pagos recientes y por rango |
| `payments` | `(seller_id, payment_date DESC)` | Portal Seller |
| `payments` | `(client_id, payment_date DESC)` | Historial del cliente |
| `payment_allocations` | `(ticket_id)` | Recálculo de saldo |
| `payment_allocations` | `(payment_id)` | Detalle del pago |
| `audit_logs` | `(organization_id, created_at DESC)` | Consulta de bitácora |
| `audit_logs` | `(entity_type, entity_id, created_at DESC)` | Historial por entidad |

La unicidad de `tickets_combo_unique` genera su propio índice, que además sirve para detectar
duplicados durante la carga masiva.

**`clients.search_text`** (`0017`, D-079) es una columna **generada** con nombre, alias, teléfono
—con separadores y sin ellos— y correo, todo en minúsculas y sin acentos mediante
`search_normalize()`. Nunca se muestra: existe solo para buscar, y por ser generada no puede quedar
desincronizada del dato real. `search_normalize()` tiene que dar exactamente lo mismo que
`foldForSearch()` de `src/lib/search.ts`; lo comprueba `tests/db/search.test.ts`.

Los cuatro índices trigrama de `0003` se conservan pese a que la búsqueda ya no los usa: no se retira
un índice sin evidencia de que sobra (`pg_stat_user_indexes.idx_scan` tras un tiempo en producción).
Lo mismo vale para el de `internal_code` desde `0018`.

**Los trigramas sobre los números (`0018`) ayudan a partir de tres cifras, no antes.** Medido con
7.278 boletas: `like '%123%'` usa el índice (*bitmap index scan*, 58 páginas); `like '%00%'` no puede
extraer ningún trigrama completo y vuelve al barrido secuencial (165 páginas, 1,2 ms). Como el
mínimo para buscar sola son dos caracteres, una parte de las búsquedas seguirá recorriendo la tabla:
es una mejora parcial y conocida, no un remedio universal.

**Los índices de trigramas sobre `clients` no se usan mientras haya RLS.** Medido con 100.000 fichas
(D-102): la misma búsqueda tarda 2,7 ms con el índice sin RLS y 97 ms con `Seq Scan` desde la sesión
de un usuario, y no cambia forzando `enable_seqscan = off`. `like` e `ilike` no están marcadas
`leakproof` en PostgreSQL, y con RLS una condición no *leakproof* no puede evaluarse antes que la
política —que es lo que haría un recorrido por índice—. No es un fallo del esquema y no se corrigió
aquí: ver **I-062**, que documenta las dos salidas posibles y por qué las dos son una decisión del
usuario.

**Por qué los índices de orden (`0030`) NO empiezan por `organization_id`.** Porque la política
compara esa columna contra un CONJUNTO (`organization_id in (select current_org_ids())`) y un índice
compuesto solo conserva el orden cuando su primera columna está fijada a un **valor**. Se probaron
las dos formas: con el compuesto, el listado de boletas seguía siendo un barrido de 120 ms; con
`(created_at desc)` a secas, 2 ms. Es la contrapartida del patrón de D-063, y conviene recordarla
antes de «mejorar» uno de estos índices añadiéndole la organización delante.

---

## 6. Vistas

> **Regla de seguridad obligatoria:** todas las vistas se crean con
> `WITH (security_invoker = true)`. Sin esa opción, una vista se ejecuta con los permisos de su
> propietario y **omitiría las políticas RLS** de las tablas base, filtrando datos entre vendedores.

| Vista | Contenido | Consumidor |
|-------|-----------|------------|
| `v_ticket_balances` | boleta + `sale_price`, `paid_amount`, `pending_amount`, `payment_status` | Listados, perfil de cliente |
| `v_client_balances` | por cliente: total comprado, total pagado, saldo, número de boletas | Perfil de cliente, reportes |
| `v_seller_summary` | por vendedor: boletas por estado, vendido, recaudado, saldo | Dashboard admin, reportes |
| `v_raffle_summary` | por rifa: totales de inventario y dinero | Dashboard admin |
| `v_payment_history` | pagos con cliente, vendedor, método, estado activo/anulado y asignaciones | Historial y anulaciones |

**Dos de ellas se reescribieron en `0030` sin cambiar ni una fila de su resultado (D-102):**

* **`v_client_balances`** calcula los saldos con `left join lateral` en vez de `left join tickets` +
  `group by`. Misma cuenta, pero el agregado depende ahora de la fila de `clients`, así que el
  planificador puede ordenar y recortar la página **antes** de sumar y solo calcula los saldos de los
  25 clientes que sobreviven. Para `count(*)` ni siquiera ejecuta la subconsulta, porque un
  `left join lateral` no puede añadir ni quitar filas.
* **`v_payment_history`** cruza el cliente con `left join`, como ya hacía con los tres perfiles desde
  `0012`. El motivo principal es de corrección —bajo RLS un `join` interno borra la fila entera, no
  solo el nombre (I-015)—; el efecto secundario es que contar el historial deja de cruzar la tabla
  de pagos con la de clientes.

La equivalencia no se supone: `tests/db/read-performance.test.ts` compara fila a fila la vista nueva
contra la formulación anterior y comprueba que las dos conservan `security_invoker` —que
`create or replace view` **no** hereda—.

### 6.b Funciones de reporte (Fase 6, migración `0013`)

Cuando el agregado necesita **parámetros**, una vista no sirve. Estas dos son `stable`,
`security invoker` y `set search_path`, y filtran **antes** de agregar (D-057):

| Función | Devuelve | Consumidor |
|---|---|---|
| `report_payment_totals(from, to, seller, method, status)` | **una fila**: nº de pagos, total, y el desglose vigente/anulado | Encabezado del reporte «Pagos por fecha» |
| `report_payments_by_day(from, to, seller, method, status)` | **una fila por día**: nº de pagos, total, recaudado y anulado | Tabla del mismo reporte y su CSV |

`p_seller_id` sirve para que el **personal** acote el reporte a un vendedor. No es un control de
seguridad: la RLS de `payments` ya limita lo que cada quien puede agregar, así que un vendedor que
pase el id de otro obtiene ceros (prueba F6-04).

### 6.c Búsqueda de boletas (migraciones `0018` y `0029`)

| Función | Devuelve | Consumidor |
|---|---|---|
| `search_tickets(search, raffle, seller, client, inventory, payment, limit, offset)` | Boletas que coinciden por número diario o semanal, **o por el cliente que las tiene**, ordenadas por relevancia, con `total_count` en cada fila | `listTickets` de `src/features/tickets/queries.ts`, cuando hay término de búsqueda |

`stable`, `security invoker` y `set search_path`, igual que las de reporte: hereda `tickets_select`
—y, desde `0029`, también `clients_select`—, de modo que un vendedor solo encuentra sus boletas y
solo por el nombre de sus clientes (BR-N11, BR-N13, D-080, D-100).

**Dos ramas, un solo parámetro** (`0029`). El término decide cuál:

| Término | Rama | Contra qué compara | `join` a `clients` |
|---|---|---|---|
| `^[0-9]{1,4}$` | Números (idéntica a `0018`) | `daily_number`, `weekly_number` | `LEFT` — un `join` interno borraría la boleta entera cuando quien consulta no puede ver el nombre (I-015) |
| Cualquier otro texto, ≥ 2 caracteres | Cliente | `clients.search_text` (columna generada de `0017`) | **`INNER`** — aquí el cliente es la condición de búsqueda: una boleta sin cliente no puede coincidir con ningún nombre |

Están separadas a propósito y no unidas con un `or`: mezclarlas obligaría al planificador a una
consulta que sirva para los dos casos, y acabaría barriendo `tickets` entera. Así cada una conserva
su plan y la tabla grande se alcanza siempre por índice (`tickets_daily_number_trgm_idx` y su gemelo
en una; `clients_search_text_trgm_idx` → `tickets_client_idx` en la otra).

`%`, `_` y `\` se **borran** del término de texto antes de comparar: dentro de `like` significarían
«lo que sea». En la rama de números no hace falta, porque el término ya son solo dígitos.

Sin término de búsqueda, el listado **no** pasa por aquí: sigue por PostgREST, ordenado por fecha de
creación.

### 6.d Importación de boletas (migración `0019`)

| Función | Devuelve | Consumidor |
|---|---|---|
| `taken_ticket_combinations(raffle, combos)` | De la lista dada, **cuáles ya existen** en la rifa. Nada más: ni de quién son, ni en qué estado | La vista previa del importador, en **una** llamada por archivo |
| `log_ticket_import(raffle, seller, source, requested, inserted, skipped)` | — | Deja una fila `ticket.import` en `audit_logs` |

`taken_ticket_combinations` es `SECURITY DEFINER` **a propósito**, al revés que las de reporte: un
vendedor no ve las boletas de otros, así que heredando su RLS respondería «disponible» a una
combinación tomada. Mirando por encima de la RLS puede ocultar el **detalle** en vez de ocultar la
fila, que es justo lo que BR-U07 pide. Comprueba que quien llama pertenece a la organización de la
rifa, y su salida está acotada por la **entrada** (como mucho, tantas filas como combinaciones se
pregunten), no por el tamaño de la rifa.

`log_ticket_import` existe porque `authenticated` solo tiene `SELECT` sobre `audit_logs`: la bitácora
la escriben funciones `SECURITY DEFINER` (0006). No guarda el archivo, solo el recuento (D-081).

### 6.e Acciones masivas de boletas (migración `0020`)

| Función | Devuelve | Consumidor |
|---|---|---|
| `ticket_bulk_eligibility(ids)` | Por boleta: sus dos números, su estado, si tiene cliente o abonos, y qué acciones admite | La barra de selección y los diálogos, para decir qué se puede y qué no (BR-B06) |
| `bulk_assign_tickets(ids, client, date)` | Cuántas se asignaron | `assignTickets`, la única acción de asignación, con una boleta o con veinte |
| `bulk_cancel_tickets(ids, reason)` | Cuántas se anularon | `bulkCancelTickets` |
| `bulk_change_ticket_seller(ids, seller)` | Cuántas cambiaron | `bulkChangeTicketSeller` **y** el cambio individual del detalle |
| `bulk_delete_tickets(ids, reason)` | Cuántas se eliminaron | `bulkDeleteTickets` **y** el botón «Eliminar boleta» del detalle |

Tres piezas internas, **sin `EXECUTE` para nadie** salvo el dueño: `assign_ticket_row` y
`cancel_ticket_row` —el cuerpo que `assign_ticket` y `cancel_ticket` tenían en `0007`, ahora extraído
y compartido— y `lock_ticket_batch`, que normaliza la lista y bloquea las filas en orden de id.

`ticket_bulk_eligibility` es `SECURITY INVOKER`, como las de reporte: solo lee y hereda
`tickets_select`, así que un vendedor únicamente recibe las suyas. Las cuatro que escriben son
`SECURITY DEFINER` y validan rol, organización, propiedad y estado por su cuenta (D-082, D-083).

**`bulk_delete_tickets` es el único punto del sistema donde se borra una fila de negocio.** El
proyecto sigue sin conceder `DELETE` a ningún rol (D-038): el borrado ocurre dentro de esta función,
solo para boletas sin cliente, sin `sale_price` y sin ninguna asignación de pago, nunca para una
anulada —su combinación queda reservada por BR-N08— y siempre con motivo y bitacora (D-084).
`payment_allocations.alloc_ticket_client_fk` es `on delete restrict`, así que la base de datos lo
impediría igual aunque la función se equivocara.

**Índices: ninguno nuevo.** Todo se busca por `tickets.id` (clave primaria) o por
`payment_allocations.ticket_id`, que ya tenía índice desde `0003`.

### 6.f Clientes en la importación de boletas (migración `0021`)

| Función o pieza | Responsabilidad | Consumidor |
|---|---|---|
| `match_ticket_import_clients(raffle, seller, clients)` | Devuelve coincidencias por celular **solo** de la organización y cartera seleccionadas; nombre y estado permiten decidir coincidencia exacta, archivada o ambigua | Vista previa administrativa, una llamada por archivo |
| `import_tickets_with_clients(raffle, seller, rows)` | Crea las boletas no tomadas, reutiliza o crea un cliente por identidad y asigna mediante `assign_ticket_row`; devuelve insertadas, conflictos, asignadas y clientes creados/reutilizados | Confirmación del importador Owner/Admin |
| `ticket_import_name_key(text)` / `ticket_import_phone_key(text)` | Claves comparables de nombre y celular; no cambian el valor visible | Las dos RPC y el índice funcional |
| `clients_seller_import_phone_idx` | Evita recorrer la cartera completa al resolver los celulares del archivo | `match_ticket_import_clients` e importación |

El cliente sigue siendo la misma fila de `clients`, con `phone NOT NULL` (BR-C02), y la boleta sigue
apuntando por `tickets.client_id`. No existe tabla de importaciones ni identidad paralela. Nombre y
celular deben estar los dos o ninguno en cada elemento JSON. Un grupo sin coincidencias crea una
sola fila; una coincidencia activa, exacta y única la reutiliza. El mismo celular con otro nombre,
una coincidencia archivada o varias coincidencias abortan para no fusionar personas por adivinación.

La función es transaccional: reserva los códigos, inserta, resuelve clientes y llama al helper
vigente `assign_ticket_row`. Un error revierte también `raffles.ticket_counter`. Un grupo cuyas
boletas chocaron todas con `tickets_combo_unique` no crea un cliente huérfano (D-087).

---

## 7. Triggers

| Trigger | Tabla | Momento | Función |
|---------|-------|---------|---------|
| `set_updated_at` | todas con `updated_at` | `BEFORE UPDATE` | Actualiza la marca de tiempo |
| `handle_new_auth_user` | `auth.users` | `AFTER INSERT` | Crea el `profile` correspondiente |
| `sync_profile_email` | `auth.users` | `AFTER UPDATE OF email` | Sincroniza `profiles.email` |
| `tickets_set_internal_code` | `tickets` | `BEFORE INSERT` | Genera `internal_code` |
| `tickets_enforce_seller_role` | `tickets` | `BEFORE INSERT/UPDATE` | `seller_id` debe tener membresía activa con rol `seller` |
| `tickets_protect_sale_price` | `tickets` | `BEFORE UPDATE` | Bloquea cambio de `sale_price` con `paid_amount > 0` |
| `tickets_protect_client_change` | `tickets` | `BEFORE UPDATE` | Bloquea cambio de `client_id` con pagos activos |
| `tickets_validate_status_transition` | `tickets` | `BEFORE UPDATE` | Aplica la máquina de estados (BR-I01) |
| `recalc_ticket_paid_amount` | `payment_allocations` | `AFTER INSERT/UPDATE/DELETE` | Recalcula `tickets.paid_amount` |
| `recalc_on_payment_void` | `payments` | `AFTER UPDATE OF voided_at` | Recalcula las boletas afectadas |
| `payments_balance_check` | `payments`, `payment_allocations` | `CONSTRAINT … DEFERRABLE` | Cuadre suma = total |
| `memberships_require_active_owner` | `memberships` | `CONSTRAINT … DEFERRABLE`, `AFTER UPDATE OF role, is_active` | La organización nunca queda sin Owner activo (Fase 9, `0016`, D-071) |
| `audit_*` | tablas críticas | `AFTER INSERT/UPDATE` | Escribe en `audit_logs` |

**Por qué dos de ellos son diferidos.** `payments_balance_check` y `memberships_require_active_owner`
validan un estado que solo tiene sentido al final de la operación: un pago se escribe antes que sus
asignaciones, y transferir la propiedad obliga a degradar a un Owner antes de ascender al siguiente
—el índice único `memberships_one_owner_per_org` impide que existan dos a la vez—. Comprobarlos de
inmediato haría imposibles ambas operaciones legítimas. Diferidos, el estado intermedio existe dentro
de la transacción y el descuido se sigue rechazando, porque PostgREST hace una petición por
transacción.

**Prevención de recursión:** los triggers de auditoría escriben en `audit_logs` mediante una función
`SECURITY DEFINER` que no dispara triggers adicionales, y `audit_logs` no tiene triggers propios.
Las funciones de trigger declaran `SET search_path = public, pg_temp`.

---

## 8. Cardinalidades y pertenencia

| Relación | Cardinalidad | Borrado | Pertenencia (ownership) |
|----------|--------------|---------|-------------------------|
| organización → membresías | 1:N | `RESTRICT` | Organización |
| perfil → membresías | 1:N | `RESTRICT` | Persona |
| organización → rifas | 1:N | `RESTRICT` | Organización |
| rifa → boletas | 1:N | `RESTRICT` | Organización + rifa |
| vendedor → boletas | 1:N | `RESTRICT` | Organización + vendedor |
| vendedor → clientes | 1:N | `RESTRICT` (se archiva) | Organización + vendedor |
| cliente → boletas | 1:N | `RESTRICT` | Cliente (dentro del vendedor) |
| cliente → pagos | 1:N | `RESTRICT` | Organización + vendedor + cliente |
| pago → asignaciones | 1:N (≥1) | `RESTRICT` | Pago |
| boleta → asignaciones | 1:N | `RESTRICT` | Boleta |

Reglas de pertenencia derivadas:
- Una boleta tiene **un solo cliente activo**; un cliente puede tener **varias boletas**.
- Un cliente pertenece a un vendedor; **no** se comparte automáticamente entre vendedores.
- Un pago pertenece a un cliente y, por tanto, a un vendedor.
- Ninguna entidad con historial se borra físicamente.

---

## 9. Casos extremos cubiertos por el modelo

| # | Caso | Comportamiento del modelo |
|---|------|---------------------------|
| E1 | Dos boletas con la misma combinación en la misma rifa | Rechazo por `tickets_combo_unique` |
| E2 | Misma combinación en distinta rifa | Permitido |
| E3 | Combinación de una boleta anulada, reutilizada | Rechazo (el índice único incluye anuladas) |
| E4 | `0000` como número | Válido (1–4 dígitos) |
| E5 | `007` vs `7` | Combinaciones distintas; ambas pueden coexistir |
| E6 | Boleta `draft` sin números | Permitido; obligatorio al salir de `draft` |
| E7 | Pago a boleta sin cliente | Imposible: FK compuesta exige `client_id` no nulo |
| E8 | Pago a boleta de otro cliente | Imposible: FK `alloc_ticket_client_fk` |
| E9 | Sobrepago | Rechazo por `tickets_paid_amount_range` + validación en RPC con bloqueo |
| E10 | Dos abonos simultáneos que juntos exceden el saldo | El segundo falla: bloqueo de fila + `CHECK` |
| E11 | Pago que no cuadra con sus asignaciones | Rechazo al confirmar (constraint trigger diferido) |
| E12 | Anular un pago | `paid_amount` se recalcula; `payment_status` vuelve a `unpaid`/`partial` |
| E13 | Cambiar el precio de la rifa después de vender | Boletas vendidas conservan `sale_price` |
| E14 | Cambiar el cliente de una boleta con pagos | Bloqueado por trigger |
| E15 | Anular una boleta con pagos activos | Bloqueado; primero deben anularse los pagos |
| E16 | Boleta de una rifa de otra organización | Imposible por FK compuesta |
| E17 | Vendedor desactivado con boletas activas | Los datos permanecen; el acceso se bloquea por RLS |
| E18 | Dos Owners activos en una organización | Rechazo por índice único parcial |
| E19 | Cliente con historial que se intenta borrar | `RESTRICT`; la UI ofrece archivar |
| E20 | Acumulado monetario grande (1.000 boletas × $120.000) | `bigint` soporta el rango sin desborde |
