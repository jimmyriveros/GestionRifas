# ESTADO DE LAS FASES

Registro de lo entregado por fase. **Leer antes de iniciar cualquier fase.**
Ninguna fase comienza sin autorización explícita del usuario (`CLAUDE.md` §1).
Para arrancar una sesión nueva, empieza por [`HANDOFF.md`](HANDOFF.md).

- **Actualizado:** 2026-08-04 · **Fase actual:** 6 completada · **Siguiente:** 7 (no autorizada)

| Fase | Nombre | Estado | Commit / etiqueta |
|---|---|---|---|
| 0 | Arquitectura y planificación | ✅ | `b4b991c` · `fase-0` |
| 1 | Proyecto base y autenticación | ✅ | `34b3cb1` · `fase-1` |
| 2 | Base de datos, restricciones y RLS | ✅ | `954531c` · `fase-2` |
| 3 | Portal Owner y Admin | ✅ | `439e64d` · `fase-3` |
| 4 | Portal Seller y clientes | ✅ | `36ef2e1` · `fase-4` |
| 5 | Pagos, abonos y saldos | ✅ | `ecc9eac` · `fase-5` |
| 6 | Dashboards, reportes y UI/UX | ✅ | `791e585` · `fase-6` |
| 7 | Pruebas, seguridad y endurecimiento | ⬜ | — |
| 8 | Despliegue y documentación operativa | ⬜ | — |
| 9 | Auditoría final independiente | ⬜ | — |

---

## ANTES DE EMPEZAR LA FASE 7 — revisar esto

1. **Confirmar autorización explícita** del usuario para la Fase 7.
2. **Leer** `CLAUDE.md`, `docs/HANDOFF.md` y la sección «Fase 7» de `docs/IMPLEMENTATION_PLAN.md`.
   No hace falta leer los demás documentos completos (guía en `HANDOFF.md` §5).
3. **Levantar el entorno** y comprobar que todo pasa antes de tocar nada:
   `npx supabase start` → `npm run db:reset && npm run seed:local` → `npm run test:db` (238 ✅) →
   `npm run verify` (✅) → `npm run test:e2e` (120 ✅).
4. **Aplicar las migraciones `0012` y `0013` al proyecto real.** Ambas están solo en local. Sin la
   `0013` el reporte «Pagos por fecha» **falla** en producción, porque las dos funciones que agrega
   no existen allí (`KNOWN_ISSUES.md` §4):

   ```bash
   npx supabase db push --dry-run --db-url "$SUPABASE_DB_URL"
   ```

   ```bash
   npx supabase db push --yes --db-url "$SUPABASE_DB_URL"
   ```

5. **`npm run test:db` deja 5.000 boletas** en una rifa en **borrador** llamada «Rifa Volumen Fase 6»
   (`tests/db/volume-phase6.test.ts`). Es idempotente: repetir la suite las reutiliza en vez de
   acumular. Aun así, **ejecutar `npm run db:reset && npm run seed:local` antes de `test:e2e`**.
6. **La Fase 7 es la de endurecer, no la de construir.** Su alcance son las 25 pruebas mínimas de
   `CLAUDE.md` §30, la revisión de seguridad y el manejo de errores. No añadir capacidades nuevas.
7. **Dos defectos reales aparecieron en la Fase 6** (I-017 fechas, I-018 nombre accesible). Ambos
   estaban en código de fases anteriores que nadie había mirado con lupa. Merece la pena repetir el
   ejercicio en la Fase 7 sobre las zonas que aún no tienen pruebas propias.
8. **Para desarrollar y probar, `npm run dev:local`** (D-047). `npm run dev` apunta al proyecto real
   según `.env.local` (I-013).
9. **Nada de agregar dinero en TypeScript.** Si un número nuevo hace falta, sale de SQL: vistas
   (`v_*`) o funciones de reporte (`report_*`). Ver D-057.
10. **Las lecturas que puedan superar 1.000 filas usan `fetchAllRows`** (`src/lib/supabase/paginate.ts`)
    o `count: 'exact', head: true`. Nunca `data.length` (I-011, R-18).

---

## Fase 0 — Arquitectura y planificación ✅

**Funcionalidades:** ninguna (fase documental). Produjo los 10 documentos de `docs/`, el modelo de
datos, la matriz de permisos, el diseño de RLS y el plan de las 10 fases.
**Pruebas:** revisión de consistencia documental + verificación de versiones del stack en npm.
**Migraciones:** ninguna.
**Decisiones:** D-001 a D-026.
**Hallazgo:** `typescript-eslint@8` no soporta TypeScript 7 → se fijó TypeScript 5.9.3 (D-002).

---

## Fase 1 — Proyecto base y autenticación ✅

### Funcionalidades implementadas
- Next.js 16 (App Router) + TypeScript estricto + Tailwind 4 + shadcn/ui + ESLint + Prettier.
- Clientes Supabase: `client` (browser), `server` (RSC/Actions), `proxy` (sesión), `admin`
  (`server-only`, service role).
- `src/proxy.ts` — refresco de sesión y guardas de ruta (Next 16 renombró `middleware` → `proxy`).
- Login, logout, recuperación y cambio de contraseña.
- Redirección por rol: owner/admin → `/owner/dashboard`, seller → `/seller/dashboard`.
- Bloqueo de usuarios inactivos, **incluso con sesión previa** (BR-A04).
- Layouts responsive de los dos portales (sidebar escritorio / drawer móvil), `/denied`,
  `error.tsx`, `not-found.tsx`, dashboards placeholder.
- `src/lib/`: `money.ts` (COP entero), `dates.ts` (America/Bogota), `errors.ts`, `constants.ts`.

### Pruebas ejecutadas y resultados
| Prueba | Resultado |
|---|---|
| Unitarias (money, dates, errors) | ✅ 14/14 |
| `typecheck` · `lint` · `build` | ✅ |
| Login válido (3 roles) en navegador | ✅ |
| Login inválido | ✅ mensaje correcto |
| Seller → `/owner/*` | ✅ redirige a `/denied` |
| Sin sesión → ruta protegida | ✅ redirige a `/login` |
| Usuario inactivo | ✅ bloqueado y sesión cerrada |
| Logout y persistencia de sesión | ✅ |
| Recuperación de contraseña | ✅ sin revelar si el correo existe |

### Migraciones
`0001_core_identity.sql` — `organizations`, `profiles`, `memberships`, enum `app_role`, funciones de
seguridad, RLS de solo lectura, triggers sobre `auth.users`.

### Variables de entorno
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SITE_URL`, `TZ`, `SEED_DEFAULT_PASSWORD`.

### Decisiones
D-027 a D-036. Destacadas: `proxy.ts` en vez de `middleware.ts` (D-027); versiones fijadas por
incompatibilidad con Node 20 (D-029/030/031); `typedRoutes` desactivado (D-032).

---

## Fase 2 — Base de datos, restricciones y RLS ✅

### Funcionalidades implementadas
- **Esquema completo:** `raffles`, `clients`, `tickets`, `payments`, `payment_allocations`,
  `audit_logs` + 5 enums.
- **Integridad estructural:** FK compuestas con `organization_id` (imposible cruzar organizaciones) y
  FK `(ticket_id, client_id)` (imposible pagar la boleta de otro cliente o una sin cliente).
- **Numeración:** texto `^[0-9]{1,4}$`, ceros conservados, combinación única por rifa — aplica entre
  vendedores y a boletas anuladas.
- **Dinero:** `bigint`; `paid_amount` materializado por trigger; `payment_status` columna generada;
  sobrepago imposible incluso concurrente.
- **Pagos:** cuadre exacto pago↔asignaciones (constraint trigger diferido); anulación sin borrado con
  recálculo automático.
- **RLS** habilitada y forzada en las 9 tablas; protección del Owner frente al Admin en ambas
  direcciones; **ningún `DELETE`**: ni política ni privilegio.
- **6 RPC transaccionales:** `assign_ticket`, `create_payment`, `void_payment`,
  `bulk_create_tickets`, `approve_tickets`, `cancel_ticket`.
- **5 vistas** con `security_invoker = true`; **auditoría** append-only sin ciclos.
- **Seed unificado** (`scripts/seed.ts`) con 2 organizaciones para probar aislamiento.

### Pruebas ejecutadas y resultados
**111/111 en verde** (`npm run test:db`), todas con sesiones reales por rol y clave pública.

| Archivo | Nº | Cubre |
|---|---|---|
| `tickets-numbering.test.ts` | 24 | Obligatorias 1–6 y 12: duplicados, dígitos, ceros iniciales, estados |
| `rls-isolation.test.ts` | 26 | Obligatorias 7–9: aislamiento entre vendedores y organizaciones |
| `payments.test.ts` | 19 | Obligatorias 10–11: sobrepago (incl. concurrente), atomicidad, anulación |
| `rpc.test.ts` | 22 | Carga masiva de 1.000 filas, aprobación, anulación, asignación |
| `catalog.test.ts` | 20 | Obligatoria 15 + invariantes: RLS, `search_path`, `security_invoker`, dinero |

Las 15 pruebas obligatorias del prompt están cubiertas. Detalle cronológico con errores y
correcciones en [`TEST_RESULTS.md`](TEST_RESULTS.md).

Además: `npm run verify` ✅ · `db reset` limpio ✅ · seed limpio ✅ · verificación estructural del
proyecto remoto 9/9 ✅ · login en navegador contra el remoto ✅.

### Migraciones
| Archivo | Contenido |
|---|---|
| `0001_core_identity.sql` | (Fase 1) organizations, profiles, memberships, funciones de seguridad |
| `0002_business_schema.sql` | 6 tablas de negocio, enums, todas las restricciones |
| `0003_indexes.sql` | 23 índices (incluye `pg_trgm` para búsqueda de clientes) |
| `0004_triggers.sql` | Códigos, protección de precio/cliente, máquina de estados, recálculo de saldos, cuadre diferido |
| `0005_rls_policies.sql` | RLS de las 9 tablas + protección del Owner |
| `0006_audit.sql` | Bitácora append-only con diff de campos |
| `0007_functions_rpc.sql` | Las 6 RPC transaccionales |
| `0008_views.sql` | 5 vistas con `security_invoker` |
| `0009_grants.sql` | Privilegios explícitos por rol |
| `0010_harden_grants.sql` | Revoca `DELETE`/`TRUNCATE`; iguala local y remoto |

Todas aplicadas en **local y en el proyecto Supabase real**. Cada archivo incluye su nota de
reversión.

### Variables de entorno
Las de la Fase 1 **más** `SUPABASE_DB_URL` (solo para `supabase db push` al remoto; debe ser la
cadena del **session pooler**, no la conexión directa — I-005).

### Problemas reales que permanecen
| ID | Problema | Impacto |
|---|---|---|
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten | Bajo. Riesgo de editar el equivocado; pendiente de que el usuario autorice borrar el `.txt` |
| I-005 | La conexión directa a Postgres no resuelve por DNS aquí | Ninguno con la solución alterna: usar el session pooler |
| I-007 | `createUser` no deja la contraseña usable de inmediato | **Afecta a la Fase 3**: al invitar usuarios hay que llamar `updateUserById` después |
| I-009 | No se pudo automatizar un clic en viewport móvil con la herramienta de este entorno | Bajo. Falta validar responsive en dispositivo real o con Playwright (Fase 7) |
| DT-11 | Playwright no instalado | Se instalará cuando existan specs E2E (Fase 3 en adelante) |
| DT-12 | 3 vulnerabilidades altas de `npm audit` | Están **dentro** de dependencias internas de Next.js (`postcss`, `sharp`); el único «fix» degradaría Next a 2019. Reevaluar al habilitar `next/image` con imágenes remotas |

Ninguno bloquea la Fase 3.

### Decisiones
D-037 a D-043. Destacadas: `GRANT` explícitos porque los de Supabase difieren entre entornos
(D-037/038); agregaciones monetarias casteadas a `bigint` (D-040); seed unificado que usa las RPC
reales (D-042); las pruebas de RLS nunca usan `service_role` (D-043).

---

## Fase 3 — Portal Owner y Admin ✅

### Funcionalidades implementadas

- **Dashboard administrativo real**: rifa activa, vendedores activos, inventario por estado,
  cobranza (sin pagar / abonadas / pagadas, vendido, recaudado, saldo), resumen por vendedor,
  boletas recientes y aviso accionable de boletas pendientes de aprobación.
- **Rifas**: listado con métricas, creación con precio predeterminado de $100.000, edición,
  máquina de estados completa (BR-R03) con **reapertura exclusiva del Owner**, bloqueo de edición en
  rifas cerradas o anuladas, nombre único y validación de fechas.
- **Administradores**: listado, invitación por correo, edición, activación y desactivación, con la
  **protección del Owner frente al Admin** aplicada en RLS y reflejada en la interfaz.
- **Vendedores**: listado con indicadores (boletas, vendidas, por aprobar, vendido, saldo), alta por
  invitación, edición, activación/desactivación, vista detallada con inventario, dinero y accesos
  directos a sus boletas, clientes y carga masiva.
- **Boletas**: tabla global paginada en servidor con búsqueda (código, número diario, número
  semanal) y filtros (rifa, vendedor, estado de inventario, estado de pago); detalle completo;
  creación individual; edición de números; cambio de vendedor; aprobación individual y en lote;
  anulación con motivo obligatorio.
- **Creación masiva de 1 a 1.000 boletas**: virtualización, validación por fila en vivo, detección de
  duplicados dentro del formulario y contra la base de datos, guardado en lotes de 100 con barra de
  progreso y manejo de errores parciales (solo quedan en pantalla las filas rechazadas).
- **Clientes**: consulta global con búsqueda por nombre, alias, teléfono y correo, filtro por
  vendedor, inclusión de archivados y perfil con saldos y boletas.
- **Transversal**: `DataTable` (TanStack Table), paginación de servidor por URL, `StatusBadge`
  siempre con texto, `EmptyState`, `ConfirmDialog`, `MoneyInput`, `TicketNumberInput`, esqueletos de
  carga por segmento y toasts.

### Pruebas ejecutadas y resultados

| Suite | Resultado |
|---|---|
| Unitarias (`npm run test`) | **55 ✅** |
| Base de datos (`npm run test:db`) | **143 ✅** |
| End-to-end (`npm run test:e2e`) | **41 ✅** (37 escritorio + 4 móvil) |
| `npm run verify` | ✅ (0 errores de lint; 2 avisos de `react-hooks/incompatible-library`) |

Las 18 pruebas obligatorias del prompt están cubiertas. **Dos defectos reales los encontraron las
pruebas end-to-end, no la revisión de código**:

1. **I-011 (seguridad/UX):** al desactivar a un usuario desaparecía del listado y era imposible
   reactivarlo. Corregido con la migración `0011` y dos pruebas de regresión en base de datos.
2. **Usabilidad:** el formulario de boleta preseleccionaba la última rifa creada en vez de la activa.
   Corregido ordenando las activas primero.

Detalle cronológico completo, con todos los errores encontrados y corregidos, en
[`TEST_RESULTS.md`](TEST_RESULTS.md).

### Migraciones que existen

Las 10 de la Fase 2 **más**:

| Archivo | Contenido |
|---|---|
| `0011_profiles_visible_when_inactive.sql` | Rehace `profiles_select`: el personal ve los perfiles de su organización aunque la membresía objetivo esté inactiva (I-011) |

**Aplicada en local y en el proyecto Supabase real**, con verificación estructural posterior
(`KNOWN_ISSUES.md` §4).

### Variables de entorno requeridas

Las mismas de las fases 1 y 2. Ninguna nueva. `npm run dev:local` y las pruebas end-to-end no usan
`.env.local` para apuntar a Supabase: inyectan las credenciales de la instancia local (D-047).

### Problemas reales que permanecen

| ID | Problema | Impacto |
|---|---|---|
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten | Bajo. Pendiente de que el usuario autorice borrar el `.txt` |
| I-013 | `.env.local` apunta al proyecto real | Bajo con `npm run dev:local`; alto si alguien lo olvida |
| DT-12 | 3 vulnerabilidades altas de `npm audit` | Dentro de dependencias internas de Next.js. Sin cambios desde la Fase 2 |
| — | Sin exportación CSV ni reportes | Por diseño: son de la Fase 6 |
| — | Los pagos no tienen interfaz | Por diseño: son de la Fase 5 |

### Qué debe revisar el siguiente agente antes de comenzar

Ver la sección «ANTES DE EMPEZAR LA FASE 4» al inicio de este documento.

### Decisiones

D-044 a D-048. Destacadas: `mapPgError` propaga los mensajes de negocio propios pero nunca los de
PostgreSQL (D-044); el alta de usuarios es por invitación por correo, sin contraseñas en texto plano
(D-045); `npm run dev:local` para no escribir datos de prueba en producción (D-047).

---

## Fase 4 — Portal Seller y clientes ✅

### Funcionalidades implementadas

- **Dashboard del vendedor** con sus propias métricas: rifa activa, inventario por estado, cobranza,
  clientes, ventas y clientes recientes. Las dos acciones principales («vender una boleta», «nuevo
  cliente») van arriba y grandes, pensadas para el pulgar.
- **Boletas propias**: tabla paginada en servidor con búsqueda (código, número diario, semanal) y
  filtros (rifa, cliente, estado de inventario, estado de pago); detalle con historial (creada,
  aprobada, asignada, anulada); corrección de números **solo antes de la aprobación**, con
  explicación cuando ya no se puede.
- **Creación de boletas por el vendedor** cuando la rifa lo permite: hasta 100 por lote (D-049),
  validación por fila reutilizando el motor de la carga masiva, ambos números obligatorios, estado
  `pending_approval` y reporte por fila de las combinaciones ya tomadas. Cuando la rifa no lo
  permite, la acción no aparece y la ruta explica por qué.
- **Clientes**: listado con búsqueda por nombre, alias, teléfono y correo; creación, edición,
  archivado y restauración; perfil con saldos, notas y sus boletas.
- **Asignación de boletas**: diálogo con dos caminos —elegir un cliente existente (buscador) o crear
  uno sin salir del flujo—, fecha de venta editable y aviso explícito del precio que quedará
  congelado. Todo sobre la RPC `assign_ticket`.

### Pruebas ejecutadas y resultados

| Suite | Resultado |
|---|---|
| Unitarias (`npm run test`) | **74 ✅** |
| Base de datos (`npm run test:db`) | **170 ✅** |
| End-to-end (`npm run test:e2e`) | **72 ✅** (63 escritorio + 9 móvil) |
| `npm run verify` | ✅ (0 errores de lint; los 2 avisos conocidos de TanStack) |

Las 17 pruebas obligatorias del prompt están cubiertas. Antes de escribir la interfaz se sondeó la
base de datos con sesiones reales para confirmar cada bloqueo; el detalle, junto con el único error
cometido (un script de sondeo que alteró el seed) y su corrección, está en
[`TEST_RESULTS.md`](TEST_RESULTS.md).

### Cambios de base de datos

**No aplica.** La Fase 4 no necesitó ninguna migración: el esquema, las políticas y las RPC de la
Fase 2 ya cubrían todo lo que el portal del vendedor requiere. Las 11 migraciones siguen aplicadas en
local y en el proyecto real.

### Variables de entorno requeridas

Las mismas de las fases anteriores. Ninguna nueva.

### Problemas reales que permanecen

| ID | Problema | Impacto |
|---|---|---|
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten | Bajo. Pendiente de que el usuario autorice borrar el `.txt` |
| I-013 | `.env.local` apunta al proyecto real | Bajo con `npm run dev:local`; alto si alguien lo olvida |
| I-014 | `notFound()` responde 200 en segmentos con `loading.tsx` | Ninguno funcional: no filtra datos. Solo afectaría al SEO de rutas públicas, que no existen |
| DT-12 | 3 vulnerabilidades altas de `npm audit` | Dentro de dependencias internas de Next.js. Sin cambios |
| — | Los pagos no tienen interfaz | Por diseño: son de la Fase 5 |
| — | Sin reportes ni exportación CSV | Por diseño: son de la Fase 6 |

### Qué debe revisar el siguiente agente antes de comenzar

Ver la sección «ANTES DE EMPEZAR LA FASE 5» al inicio de este documento.

### Decisiones

D-049 a D-051: límite de 100 boletas por lote para el vendedor; el cliente se conserva si falla la
asignación posterior; los componentes se parametrizan por portal en vez de duplicarse.

---

## Fase 5 — Pagos, abonos y saldos ✅

### Funcionalidades implementadas

- **Registro de abonos por el vendedor**: elige el cliente (solo aparecen los que deben dinero),
  escribe el valor recibido y el reparto entre sus boletas se sugiere solo, ajustable fila por fila.
  Fecha, método y notas incluidos. La suma debe cuadrar **exactamente** con el total; mientras no
  cuadre, el botón está deshabilitado y se dice cuánto falta o cuánto sobra.
- **Previsualización del estado**: cada fila muestra cómo quedará la boleta (Sin pagar / Abonada /
  Pagada) antes de confirmar. El estado real siempre lo calcula la base de datos.
- **Bloqueos**: sobrepago por boleta, importes ≤ 0, reparto descuadrado y boletas de otro cliente,
  todo rechazado en las tres capas.
- **Historial de abonos** con los campos que exige BR-F13: fecha, valor, cliente, boletas, vendedor,
  quién lo registró, método, notas y estado. Visible en el perfil del cliente, en el detalle de la
  boleta y en la lista de pagos de cada portal.
- **Anulación por Owner/Admin** con motivo obligatorio, desde el detalle del pago. Los saldos se
  recalculan de inmediato, el pago queda tachado en el historial con su motivo, fecha y autor, y la
  acción queda auditada. El vendedor no ve la opción.
- **Consulta global de pagos** (`/owner/payments`) con filtros por vendedor, estado, método y rango
  de fechas, y totales de cobranza de la organización.

### Pruebas ejecutadas y resultados

| Suite | Resultado |
|---|---|
| Unitarias (`npm run test`) | **101 ✅** |
| Base de datos (`npm run test:db`) | **199 ✅** |
| End-to-end (`npm run test:e2e`) | **89 ✅** |
| `npm run verify` | ✅ (0 errores de lint; los 2 avisos conocidos de TanStack) |

Las 13 pruebas obligatorias del prompt están cubiertas. **Dos defectos reales encontrados y
corregidos en esta fase**:

1. **I-015 (integridad de la información):** el historial ocultaba los pagos que un administrador
   registrara para el cliente de un vendedor. Lo detectó el sondeo previo a escribir la interfaz.
   Corregido con la migración `0012`.
2. **I-016 (entrada de datos):** `MoneyInput` concatenaba los dígitos al escribir sobre él de forma
   programática. Lo detectó una prueba end-to-end. Corregido quitándole el estado interno (D-053).

Detalle cronológico completo en [`TEST_RESULTS.md`](TEST_RESULTS.md).

### Migraciones que existen

Las 11 anteriores **más**:

| Archivo | Contenido |
|---|---|
| `0012_payment_history_visibility.sql` | Rehace `v_payment_history`: LEFT JOIN sobre `profiles` para que un nombre invisible no borre el pago (I-015) y añade `voided_by_name` |

**Aplicada en local. Pendiente de aplicar en el proyecto real** (ver `KNOWN_ISSUES.md` §4).

### Variables de entorno requeridas

Las mismas de las fases anteriores. Ninguna nueva.

### Problemas reales que permanecen

| ID | Problema | Impacto |
|---|---|---|
| I-015 | La migración `0012` no está aplicada al proyecto real | **Medio**: en producción, un vendedor no vería los pagos que registre un administrador para sus clientes. Un solo comando lo resuelve |
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten | Bajo |
| I-013 | `.env.local` apunta al proyecto real | Bajo con `npm run dev:local` |
| I-014 | `notFound()` responde 200 en segmentos con `loading.tsx` | Ninguno funcional: no filtra datos |
| DT-12 | 3 vulnerabilidades altas de `npm audit` | Dentro de dependencias internas de Next.js. Sin cambios |
| — | Sin pantalla para que el personal registre abonos | Por diseño (D-054): la capacidad existe en la acción y en la RPC |
| — | Sin reportes ni exportación CSV | Por diseño: son de la Fase 6 |

### Qué debe revisar el siguiente agente antes de comenzar

Ver la sección «ANTES DE EMPEZAR LA FASE 6» al inicio de este documento.

### Decisiones

D-052 a D-054: el reparto se sugiere y se ajusta, pero decide la RPC; `MoneyInput` sin estado
interno; en esta fase solo el vendedor tiene pantalla para registrar abonos.

---

## Fase 6 — Dashboards, reportes y UI/UX ✅

### Funcionalidades implementadas

- **Dashboard administrativo completo**: se añaden los **pagos recientes** que faltaban (con los
  anulados marcados **por texto**, no solo tachados) y desaparecen los avisos de «esto llega en la
  Fase 5/6». Ya cubre los catorce puntos de `CLAUDE.md` §23.
- **Dashboard del vendedor completo**: sus propios pagos recientes, con enlace a registrar el primero
  cuando no hay ninguno.
- **Reportes** (`/owner/reports` y `/seller/reports`), cinco tablas que cubren los siete reportes
  exigidos por `CLAUDE.md` §24 (D-055):

  | Reporte | Cubre | Filtros |
  |---|---|---|
  | Por vendedor | Ventas, recaudo y saldo pendiente por vendedor (1, 2 y 3) | Rifa |
  | Boletas por estado | Boletas por estado (4) | Rifa, vendedor |
  | Boletas por rifa | Boletas por rifa (7) | — |
  | Clientes con saldo | Clientes con saldo pendiente (5) | Vendedor |
  | Pagos por fecha | Pagos por rango de fechas (6) | Vendedor, rango, método, estado |

- **Exportación a CSV** de las cinco tablas, con separador `;`, BOM UTF-8, moneda `$100.000` y fechas
  `DD/MM/AAAA` para que Excel en configuración regional colombiana las abra bien (D-056). Las celdas
  que empiezan por `=`, `+`, `-` o `@` se neutralizan contra **inyección de fórmulas**, sin estropear
  los teléfonos `+57 …`.
- **Filtros en la URL**, no en estado de React: el reporte filtrado es un enlace compartible y el
  botón de exportar reutiliza exactamente los mismos parámetros.
- **Aislamiento del portal Seller**: no se le ofrece el reporte que compara vendedores, pedirlo por
  URL cae al primero disponible y el endpoint de exportación responde **403**. Por debajo, las
  vistas y funciones `security_invoker` hacen que solo pueda obtener sus propias filas (D-059).
- **Pulido de UX**: esqueleto propio de la pantalla de reportes, estados vacíos que explican qué
  hacer, tablas con `caption`, `<th scope="col">` y scroll dentro de su contenedor, reporte activo
  anunciado con `aria-current`, y **nombre accesible en el menú de usuario** (I-018).

### Cambios de base de datos

| Archivo | Contenido |
|---|---|
| `0013_report_functions.sql` | `report_payment_totals` y `report_payments_by_day`: agregados exactos de cobranza, parametrizados y filtrados **antes** de agregar. Las primeras funciones `SECURITY INVOKER` del proyecto (D-057) |

**Aplicada en local. Pendiente en el proyecto real**, junto con la `0012` (`KNOWN_ISSUES.md` §4).
No crea tablas, ni vistas, ni índices: los dos índices que necesita ya existían desde `0003`.

### Pruebas ejecutadas y resultados

| Suite | Antes | Ahora |
|---|---|---|
| Unitarias (`npm run test`) | 101 | **126 ✅** |
| Base de datos (`npm run test:db`) | 199 | **238 ✅** |
| End-to-end (`npm run test:e2e`) | 89 | **120 ✅** |
| `npm run verify` | ✅ | ✅ (0 errores de lint; los 2 avisos conocidos de TanStack) |

Las 8 pruebas del plan para esta fase están cubiertas. **Dos defectos reales encontrados y
corregidos**, ambos en código de fases anteriores:

1. **I-017 (fechas):** toda fecha de día calendario —pagos, ventas, vigencia de rifas— se mostraba
   **un día antes**. `new Date('2026-08-04')` es medianoche UTC, que en Bogotá aún es el día 3.
   Corregido en `src/lib/dates.ts`, lo que arregla de golpe los 8 sitios afectados.
2. **I-018 (accesibilidad):** el menú de usuario no tenía nombre accesible; en un teléfono, donde el
   nombre está oculto, un lector de pantalla anunciaba solo las iniciales del avatar. Lo destapó el
   helper `logout()` de las pruebas, que llevaba tres fases sin funcionar porque nadie lo usaba.

Además, la prueba de volumen **demuestra** el truncamiento silencioso de PostgREST (I-011, R-18):
con 5.000 boletas, una consulta normal devuelve 1.000 filas y ningún error.

Detalle cronológico completo en [`TEST_RESULTS.md`](TEST_RESULTS.md).

### Variables de entorno requeridas

Las mismas de las fases anteriores. Ninguna nueva.

### Problemas reales que permanecen

| ID | Problema | Impacto |
|---|---|---|
| I-015 | Las migraciones `0012` y `0013` no están aplicadas al proyecto real | **Medio-alto**: sin la `0013`, el reporte «Pagos por fecha» falla en producción; sin la `0012`, un vendedor no ve los pagos que registre un administrador. Un solo comando resuelve ambas |
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten | Bajo |
| I-013 | `.env.local` apunta al proyecto real | Bajo con `npm run dev:local` |
| I-014 | `notFound()` responde 200 en segmentos con `loading.tsx` | Ninguno funcional: no filtra datos |
| DT-12 | 3 vulnerabilidades altas de `npm audit` | Dentro de dependencias internas de Next.js. Sin cambios |
| — | Sin pantalla para que el personal registre abonos | Por diseño (D-054) |

### Qué debe revisar el siguiente agente antes de comenzar

Ver la sección «ANTES DE EMPEZAR LA FASE 7» al inicio de este documento.

### Decisiones

D-055 a D-060: siete reportes en cinco tablas; CSV escrito para Excel es-CO; los agregados de pagos
son funciones y no una vista, y son `SECURITY INVOKER`; los reportes no se ordenan en el navegador;
el vendedor también tiene reportes; la exportación es un Route Handler fuera de `(protected)`.

---

## Comandos

```bash
npx supabase start     # instancia local (Docker)
npm run db:reset       # reaplica las 13 migraciones desde cero (local)
npm run seed:local     # datos de desarrollo en local
npm run seed           # datos de desarrollo en el proyecto de .env.local
npm run test:db        # 238 pruebas de base de datos (crea 5.000 boletas de volumen)
npm run test:e2e       # 120 pruebas end-to-end (Playwright)
npm run verify         # typecheck + lint + unitarias + build
npm run dev            # servidor de desarrollo (segun .env.local)
npm run dev:local      # servidor de desarrollo contra la instancia local
```

Aplicar migraciones al proyecto real:

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
```

---

## Historial

| Fecha | Fase | Cambio |
|---|---|---|
| 2026-08-02 | 0 | Documentación completa, repositorio inicializado. |
| 2026-08-03 | 1 | Proyecto base, autenticación, migración de identidad, seed, pruebas en navegador. |
| 2026-08-03 | 2 | Esquema de negocio, RLS, RPC, auditoría, seed y 111 pruebas de BD. Aplicado a local y remoto. |
| 2026-08-03 | — | Documentación reestructurada para continuidad entre sesiones: se añaden `HANDOFF.md` y `TEST_RESULTS.md`, y `CLAUDE.md` §34. |
| 2026-08-03 | 3 | Portal Owner y Admin completo: rifas, usuarios, vendedores, boletas, carga masiva de 1.000, clientes y dashboard. Migración `0011`, 41 pruebas E2E con Playwright, 32 pruebas de BD nuevas. Dos defectos reales detectados y corregidos. |
| 2026-08-03 | — | Migración `0011` aplicada al proyecto Supabase real y verificada. Cierra I-011. |
| 2026-08-03 | 4 | Portal Seller completo: dashboard propio, boletas, creación con aprobación, clientes y asignación con creación de cliente en el flujo. Sin migraciones. +27 pruebas de BD, +31 E2E (incluido el ciclo completo en móvil), +19 unitarias. |
| 2026-08-03 | 5 | Pagos y abonos: registro con reparto entre boletas, historial, anulación administrativa y consulta global. Migración `0012`. Dos defectos reales detectados y corregidos (I-015, I-016). +29 pruebas de BD, +17 E2E, +27 unitarias. |
| 2026-08-04 | 6 | Dashboards completos, cinco reportes con filtros y exportación a CSV en los dos portales, y pulido de UX y accesibilidad. Migración `0013` (dos funciones de agregación de pagos). Dos defectos reales detectados y corregidos (I-017 fechas un día antes, I-018 menú de usuario sin nombre accesible). +39 pruebas de BD (incluida la de volumen a 5.000 boletas), +31 E2E, +25 unitarias. |
