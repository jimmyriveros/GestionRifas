# MASTER SPEC — Sistema de Gestión de Rifas

> Especificación funcional consolidada. `AGENTS.md` y `CLAUDE.md` son instrucciones de agente, no
> especificaciones paralelas. En caso de conflicto se aplica la jerarquía de D-086 y se investiga la
> diferencia antes de cambiar comportamiento.

- **Versión del documento:** 1.2
- **Fase que lo produce:** Fase 0 — Arquitectura y planificación
- **Última actualización:** 2026-08-09 (alineación con mantenimiento posterior a la Fase 9)

---

## 1. Propósito

Automatizar la operación de una empresa que hoy administra manualmente rifas, vendedores, clientes,
boletas, abonos y pagos. El sistema debe reemplazar el control en papel/hojas de cálculo por una
aplicación web multiorganización, con aislamiento estricto por vendedor y trazabilidad completa del
dinero.

### 1.1 Objetivos medibles del MVP

| # | Objetivo | Criterio de éxito |
|---|----------|-------------------|
| O1 | Registro confiable de boletas | Ninguna combinación diario+semanal duplicada dentro de una rifa |
| O2 | Trazabilidad del dinero | Todo abono queda registrado, es auditable y nunca se elimina físicamente |
| O3 | Aislamiento entre vendedores | Un vendedor no puede leer ni escribir datos de otro, ni siquiera manipulando IDs |
| O4 | Saldos correctos | El saldo de cada boleta y cliente se calcula desde pagos no anulados, nunca a mano |
| O5 | Operación desde móvil | El vendedor completa asignación y registro de abono desde un teléfono |
| O6 | Carga masiva | Owner/Admin genera y completa hasta 1.000 boletas sin congelar el navegador |

---

## 2. Glosario

| Término | Definición |
|---------|------------|
| **Organización** | Empresa que administra rifas. Frontera de aislamiento de datos de máximo nivel. |
| **Rifa** (`raffle`) | Evento de venta con precio de boleta, fechas y estado propios. |
| **Boleta** (`ticket`) | Unidad vendible. Tiene dos números: uno de premio diario y uno de premio semanal. |
| **Número diario** | Texto de 1 a 4 dígitos, conserva ceros iniciales. Participa en el premio diario. |
| **Número semanal** | Texto de 1 a 4 dígitos, conserva ceros iniciales. Participa en el premio semanal. |
| **Combinación** | Par (`daily_number`, `weekly_number`). Único dentro de una rifa. |
| **Estado de inventario** | Ciclo de vida de la boleta: `draft`, `pending_approval`, `available`, `assigned`, `cancelled`. |
| **Estado de pago** | Estado financiero calculado: Sin pagar, Abonada, Pagada. Nunca se elige manualmente. |
| **Abono** | Pago parcial de una boleta. |
| **Pago** (`payment`) | Dinero recibido de un cliente en una fecha, repartido entre una o varias boletas. |
| **Asignación de pago** (`payment_allocation`) | Porción de un pago aplicada a una boleta concreta. |
| **Anulación** (`void`) | Marcar un pago como no válido sin borrarlo. Sus asignaciones dejan de contar. |
| **Snapshot de precio** | Copia del precio de la rifa en `tickets.sale_price` al momento de la venta. |

---

## 3. Actores

| Actor | Descripción | Portal |
|-------|-------------|--------|
| **Owner** | Dueño de la organización. Máximo privilegio. Único e insustituible por un Admin. | `/owner/*` |
| **Admin** | Administrador delegado. Opera como Owner salvo acciones exclusivas del Owner. | `/owner/*` |
| **Seller** | Vendedor. Solo ve y opera lo suyo. | `/seller/*` |

Referencia normativa de permisos: `docs/SECURITY.md` §2 (Matriz de permisos).

---

## 4. Configuración regional

| Parámetro | Valor |
|-----------|-------|
| Idioma de interfaz | Español (es-CO) |
| Zona horaria de negocio | `America/Bogota` (UTC-5, sin horario de verano) |
| Moneda | COP |
| Formato de presentación | `$100.000`, `$25.000`, `$0` (separador de miles `.`, sin decimales) |
| Precio predeterminado de boleta | `$100.000 COP` |
| Valor interno predeterminado | `100000` (entero, pesos completos) |

**Regla dura:** el dinero se almacena y se opera como entero de pesos colombianos. Nunca `float`,
`double`, `real` ni `number` con decimales. Los cálculos financieros autoritativos ocurren en
PostgreSQL; el frontend solo formatea para presentación.

---

## 5. Modelo multiorganización

- Existe la tabla `organizations`.
- Toda entidad de negocio referencia `organization_id` de forma **directa** (columna propia), incluso
  cuando la organización sea deducible por la relación padre. Esto permite políticas RLS simples,
  índices eficientes y restricciones únicas correctas.
- Ningún usuario puede leer ni escribir registros de otra organización, por ninguna vía
  (UI, URL, ID manipulado, request directo, API o cliente Supabase).
- La consistencia entre `organization_id` propio y el del padre se garantiza con claves foráneas
  compuestas (ver `docs/DATA_MODEL.md` §4.3).
- Aunque el arranque sea con una sola empresa, no se toman atajos de organización única.

---

## 6. Entidades del dominio

Resumen; el detalle normativo está en `docs/DATA_MODEL.md`.

| Entidad | Descripción | Pertenece a |
|---------|-------------|-------------|
| `organizations` | Empresa | — |
| `profiles` | Datos de la persona usuaria, 1:1 con `auth.users` | — |
| `memberships` | Vínculo usuario ↔ organización + rol + estado activo | organización |
| `raffles` | Rifas | organización |
| `clients` | Clientes | organización + vendedor |
| `tickets` | Boletas | organización + rifa + vendedor (+ cliente cuando se vende) |
| `payments` | Pagos recibidos | organización + vendedor + cliente |
| `payment_allocations` | Reparto de un pago entre boletas | pago + boleta |
| `audit_logs` | Bitácora de cambios críticos | organización |

---

## 7. Flujos principales

### F1 — Autenticación y enrutamiento por rol
1. Existe **una sola** página de autenticación (`/login`).
2. El usuario ingresa email + contraseña.
3. El servidor valida sesión, membresía activa y rol.
4. Redirección: Owner/Admin → `/owner/dashboard`; Seller → `/seller/dashboard`.
5. Un usuario inactivo no puede ingresar **ni continuar operando con una sesión previa**.

### F2 — Creación de una rifa
1. Owner/Admin crea la rifa con precio predeterminado `100000`.
2. Define fechas, estado inicial `draft` y `allow_seller_ticket_creation`.
3. Activa la rifa (`active`) para habilitar la operación.
4. Cambiar el precio de la rifa **no** altera el `sale_price` de boletas ya vendidas.

### F3 — Creación masiva de boletas (Owner/Admin)
1. Selecciona rifa y vendedor.
2. Indica cantidad entre 1 y 1.000.
3. El sistema genera las filas editables (paginadas/virtualizadas).
4. El usuario completa número diario y semanal por fila.
5. Puede guardar parcialmente como borrador (`draft`).
6. Validación por fila en cliente, servidor y base de datos.
7. Al completarse una fila válida y aprobada, la boleta queda `available`.

### F4 — Creación de boletas por vendedor
1. Solo si la rifa tiene `allow_seller_ticket_creation = true`.
2. El vendedor ingresa cantidad y los dos números.
3. Las boletas quedan en `pending_approval`.
4. Owner/Admin aprueba → `available`.
5. Si la opción está desactivada, la acción se oculta/deshabilita con explicación.

### F5 — Asignación de boleta a cliente
1. La boleta debe estar `available`, de la rifa correcta y del vendedor autenticado
   (o existir autorización administrativa).
2. El vendedor selecciona o crea un cliente en el mismo flujo.
3. Se registran `client_id`, `assigned_at`, `sale_date`.
4. Se copia el precio vigente de la rifa a `sale_price` (snapshot).
5. El estado pasa a `assigned`.

### F6 — Registro de abono o pago
1. El vendedor registra un pago de un cliente: monto total, fecha, método, notas.
2. Reparte el total entre una o varias boletas **del mismo cliente**.
3. La suma de las asignaciones debe ser exactamente igual al total.
4. La operación es atómica: se guarda todo o nada (función transaccional en PostgreSQL).
5. El sistema recalcula `paid_amount`, `pending_amount` y el estado de pago de cada boleta.

### F7 — Anulación de pago
1. Solo Owner/Admin. El vendedor no puede anular.
2. Motivo obligatorio; se registran usuario y fecha de anulación.
3. El pago no se elimina: se marca `voided_at`.
4. Sus asignaciones dejan de contar; saldos y estados se recalculan.
5. Queda registro en `audit_logs`.

### F8 — Importación de boletas desde archivo
1. Owner/Admin o Seller elige CSV o JSON, mapea columnas si hace falta y revisa una vista previa.
2. Elegir el archivo no escribe nada; guardar exige una confirmación posterior.
3. Cada fila puede incluir cliente; cuando lo hace, nombre y celular son obligatorios juntos. Las
   filas sin cliente y los archivos antiguos de dos columnas siguen admitidos.
4. Owner/Admin puede crear o reutilizar un cliente inequívoco de la cartera seleccionada y dejar la
   boleta asignada. Un celular con otro nombre, un cliente archivado o varias coincidencias bloquean
   esas filas; no se adivina la identidad ni se cruza vendedor u organización.
5. Un vendedor solo importa cuando la rifa permite crear boletas; quedan `pending_approval` y, por
   tanto, su archivo no admite cliente.
6. Cliente, boletas y asignaciones administrativas se guardan en una sola transacción y reutilizan
   las reglas de `assign_ticket_row`.
7. La base de datos detecta combinaciones tomadas sin revelar de qué vendedor son. Después de crear
   las boletas intenta registrar el evento sin guardar el archivo; si esa bitácora falla, conserva
   las boletas e informa `auditFailed` (BR-N12, D-081, D-087).

### F9 — Selección y acciones masivas sobre boletas
1. La selección usa `ticket.id`, admite hasta 1.000 y sobrevive a búsqueda, filtros y paginación.
2. Seller puede vender varias boletas elegibles al mismo cliente en una operación atómica.
3. Owner/Admin puede aprobar, anular, cambiar vendedor y eliminar boletas cargadas por error, según
   elegibilidad y permisos.
4. La interfaz explica incompatibles; PostgreSQL bloquea filas, revalida y aplica todo o nada en las
   acciones que declara atómicas (BR-B01..BR-B08, D-082..D-085; excepción conocida I-044).

---

## 8. Reglas críticas (resumen ejecutable)

Detalle normativo con identificadores en `docs/BUSINESS_RULES.md`.

1. `daily_number` y `weekly_number` son **texto**, 1 a 4 dígitos, con ceros iniciales conservados.
2. La combinación (`organization_id`, `raffle_id`, `daily_number`, `weekly_number`) es **única**.
3. La unicidad aplica **entre vendedores** y también a combinaciones **anuladas** (no se reutilizan en el MVP).
4. La misma combinación **sí** puede existir en otra rifa.
5. `sale_price` es un snapshot inmutable del precio de la rifa al vender.
6. Estado de inventario y estado de pago son **dimensiones separadas**.
7. El estado de pago se **calcula**; nunca se selecciona.
8. No se permiten sobrepagos, montos ≤ 0, ni pagos a boletas sin cliente.
9. Un pago y sus asignaciones se crean de forma atómica en el servidor/BD.
10. Los pagos se anulan, nunca se borran.
11. Una boleta con pagos activos no puede cambiar de cliente.
12. RLS activo en todas las tablas de negocio; el frontend no es frontera de seguridad.
13. Una boleta se busca por número diario o semanal, entero o parcial, nunca por código interno
    (BR-N11).
14. Importar reutiliza las mismas reglas y validadores; si una fila incluye cliente, nombre y celular
    son obligatorios juntos y la persistencia administrativa es atómica (BR-N12).
15. Selección, filtros y paginación son estados separados; limpiar uno no borra el otro (BR-B01).
16. Las acciones masivas sensibles se autorizan y revalidan en base de datos; la UI no es su frontera
    de seguridad (BR-B07, con la salvedad documentada en I-044).

---

## 9. Superficie funcional por portal

### 9.1 Portal Owner/Admin (`/owner/*`)
Dashboard general · Rifas · Administradores · Vendedores · Boletas (tabla global, detalle, creación
individual, masiva y por archivo; selección, aprobación, anulación, cambio de vendedor y eliminación
controlada) · Clientes (consulta global) · Pagos (consulta global y anulación) · Reportes con
exportación CSV.

### 9.2 Portal Seller (`/seller/*`)
Dashboard propio · Boletas propias (búsqueda parcial por número diario o semanal; filtros por estado y
cliente; creación manual o por archivo cuando la rifa lo permite; selección y venta múltiple) ·
Clientes propios (crear, editar, archivar, perfil con historial) · Asignación de boletas · Registro de
abonos y pagos · Consulta de saldos e historial · Reportes propios con exportación CSV, sin el que
compara vendedores (D-059, D-080 a D-085).

---

## 10. Fuera de alcance del MVP

Pagos en línea · Portal de clientes · Integración con loterías · Sorteos automáticos · Números
ganadores · WhatsApp · SMS · Facturación electrónica · Comisiones de vendedores · App móvil nativa ·
Integraciones contables.

Estas funciones **no** se construyen durante las fases 0 a 9.

---

## 11. Verificación lógica obligatoria (Fase 0)

Checklist exigido por el prompt de Fase 0. Cada punto está resuelto en el diseño y localizado aquí.

| # | Punto a verificar | Resolución de diseño | Dónde se aplica | Referencia |
|---|-------------------|----------------------|-----------------|------------|
| 1 | Precio predeterminado `$100.000 COP` | `raffles.ticket_price bigint NOT NULL DEFAULT 100000` | BD (default) + UI (valor inicial del formulario) | DATA_MODEL §4.4, BR-P01 |
| 2 | Dinero como enteros | Todas las columnas monetarias `bigint`; prohibido `numeric`/`float` | BD + tipos TS + Zod `z.int()` | DATA_MODEL §3.2, BR-P02 |
| 3 | Números guardados como texto | `daily_number text`, `weekly_number text` | BD | DATA_MODEL §4.6, BR-N01 |
| 4 | Máximo 4 dígitos | `CHECK (daily_number ~ '^[0-9]{1,4}$')` + Zod `regex` | BD + servidor + cliente | BR-N02 |
| 5 | Conservación de ceros iniciales | Nunca se castea a numérico; comparación por texto; sin `TRIM`/`LTRIM` | BD + servidor + cliente | BR-N03 |
| 6 | Combinación única por rifa | `UNIQUE (organization_id, raffle_id, daily_number, weekly_number)` | BD | DATA_MODEL §4.6.3, BR-N04 |
| 7 | Prohibición de duplicados entre vendedores | La restricción única **no** incluye `seller_id` | BD | BR-N05 |
| 8 | Snapshot de `sale_price` | Se copia al asignar; trigger impide cambiarlo con pagos activos | BD (trigger) + servidor | BR-P03, BR-P04 |
| 9 | Separación inventario / pago | `inventory_status` (enum) vs `payment_status` (columna generada desde `paid_amount`) | BD | DATA_MODEL §4.6.4 |
| 10 | Pagos distribuidos entre boletas | `payments` 1:N `payment_allocations`; `SUM(amount) = total_amount` validado | BD (trigger diferido) + RPC | BR-F05 |
| 11 | Atomicidad de pagos | RPC `create_payment(...)` en una única transacción con bloqueo de filas | BD (`SECURITY DEFINER`) | ARCHITECTURE §7.2 |
| 12 | Anulación sin eliminación física | `voided_at`, `voided_by`, `void_reason`; sin `DELETE` permitido por RLS | BD + servidor | BR-F09 |
| 13 | RLS para vendedores | Políticas por `seller_id = current_profile_id()` en 4 tablas + `payment_allocations` vía `EXISTS` | BD | SECURITY §4 |
| 14 | RLS entre organizaciones | Toda política exige `organization_id IN (SELECT ... current_user_org_ids())` | BD | SECURITY §4.2 |
| 15 | Auditoría | `audit_logs` append-only, escrita por triggers y RPC `SECURITY DEFINER` | BD | SECURITY §6 |

**Conclusión de la revisión:** no se detectaron contradicciones internas en la especificación.
Las ambigüedades encontradas se resolvieron y quedaron registradas en `docs/DECISIONS.md`
(D-001 a D-026).

---

## 12. Trazabilidad histórica con la especificación original (`CLAUDE.md`)

Esta tabla conserva la relación con el prompt que originó la Fase 0. No convierte `CLAUDE.md` en una
segunda fuente funcional ni incluye por sí sola el mantenimiento posterior; para eso rige D-086.

| Sección de `CLAUDE.md` | Documento que la desarrolla |
|------------------------|-----------------------------|
| §4, §10–§24 Producto y módulos | `docs/MASTER_SPEC.md`, `docs/BUSINESS_RULES.md` |
| §5 Stack | `docs/ARCHITECTURE.md` §2 |
| §6 Configuración regional | `docs/ARCHITECTURE.md` §9 |
| §7 Multiorganización | `docs/DATA_MODEL.md` §2, `docs/SECURITY.md` §4.2 |
| §8, §9 Roles y usuarios | `docs/SECURITY.md` §2, §3 |
| §13–§20 Boletas y pagos | `docs/DATA_MODEL.md` §4, `docs/BUSINESS_RULES.md` |
| §25 Auditoría | `docs/SECURITY.md` §6 |
| §26 Seguridad | `docs/SECURITY.md` completo |
| §27 UX | `docs/ARCHITECTURE.md` §8 |
| §35 UX Writing y redacción | `docs/UX_COPY_GUIDELINES.md` (fuente única de todo texto visible) |
| §28 Documentación | Este conjunto de documentos |
| §30 Pruebas mínimas | `docs/TESTING.md` §3 (matriz de trazabilidad) |
| §33 Orden de fases | `docs/IMPLEMENTATION_PLAN.md` |
