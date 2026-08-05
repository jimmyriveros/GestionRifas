# ESTADO DE LAS FASES

Registro de lo entregado por fase. **Leer antes de iniciar cualquier fase.**
Ninguna fase comienza sin autorización explícita del usuario (`CLAUDE.md` §1).
Para arrancar una sesión nueva, empieza por [`HANDOFF.md`](HANDOFF.md).

- **Actualizado:** 2026-08-05 · **Fase actual:** 9 completada · **Siguiente:** ninguna — el plan de
  10 fases está terminado

| Fase | Nombre | Estado | Commit / etiqueta |
|---|---|---|---|
| 0 | Arquitectura y planificación | ✅ | `b4b991c` · `fase-0` |
| 1 | Proyecto base y autenticación | ✅ | `34b3cb1` · `fase-1` |
| 2 | Base de datos, restricciones y RLS | ✅ | `954531c` · `fase-2` |
| 3 | Portal Owner y Admin | ✅ | `439e64d` · `fase-3` |
| 4 | Portal Seller y clientes | ✅ | `36ef2e1` · `fase-4` |
| 5 | Pagos, abonos y saldos | ✅ | `ecc9eac` · `fase-5` |
| 6 | Dashboards, reportes y UI/UX | ✅ | `791e585` · `fase-6` |
| 7 | Pruebas, seguridad y endurecimiento | ✅ | `caa6298` · `fase-7` |
| 8 | Despliegue y documentación operativa | ✅ | `bcd6dc0` · `fase-8` |
| 9 | Auditoría final independiente | ✅ | `<pendiente>` · `fase-9` |

---

## LO PRIMERO, SI RETOMAS ESTE PROYECTO

1. ⚠️ **La migración `0016` NO está aplicada al proyecto real** (I-025). Es la única acción técnica
   pendiente del proyecto entero y **requiere autorización explícita del usuario**. Procedimiento —con
   respaldo lógico previo, obligatorio por I-024— en `docs/AUDIT_REPORT.md` §8.1. Mientras no se
   aplique, el Owner de producción puede dejar la organización sin propietario y hará falta un script
   con `service_role` para repararlo.
2. **Leer** `CLAUDE.md`, `docs/HANDOFF.md` y `docs/AUDIT_REPORT.md` (los hallazgos y lo que quedó
   aceptado).
3. **La aplicación está en producción**: `https://gestion-rifas.vercel.app`, proyecto Vercel
   `gestion-rifas`, contra el mismo proyecto Supabase usado desde la Fase 2 (no hay staging, D-066).
   Las cuentas de demostración (`owner@demo.test`, etc.) siguen activas ahí — ver I-021 antes de
   asumir que cualquier dato que se vea es real.
4. **El proyecto Supabase real está en plan Free: sin backups automáticos, sin PITR** (I-024). La
   única red de seguridad es el respaldo lógico manual (`docs/RUNBOOK.md` §5) — generarlo antes de
   cualquier acción destructiva sobre el proyecto remoto, y **nunca restaurar ni resetear el remoto
   sin mostrar el procedimiento exacto y recibir autorización explícita**, sin excepción.
5. **CI corre en cada push/PR a `main`** (`.github/workflows/ci.yml`): typecheck/lint/test/build +
   migraciones desde cero contra una instancia Supabase efímera. `test:e2e` queda fuera (D-069).
6. Como siempre: `npx supabase start` → `npm run db:reset && npm run seed:local` →
   `npm run test:db` (266 ✅) → `npm run verify` (✅) → `npm run test:e2e` (142 ✅) antes de tocar nada.
   Si el seed falla con `AuthRetryableFetchError`, espera a que GoTrue arranque (I-028).
7. **La limitación de intentos es en memoria por instancia** (D-062) y **las políticas RLS no llaman
   a una función pasándole una columna** (D-057, D-063). **Nada de dinero calculado en TypeScript.**
8. **Las lecturas que puedan superar 1.000 filas usan `fetchAllRows`** o
   `count: 'exact', head: true`. Nunca `data.length` (I-011, R-18).
9. **Si añades una Server Action**, `tests/unit/server-actions-guard.test.ts` la encontrará esté donde
   esté (desde la Fase 9 el recorrido es recursivo) y fallará si se le olvida `authorizeAction`.
10. **Si tocas el seed**, lee `docs/TESTING.md` §6.1: `F6-04` y `F9-02` dependen de que `vendedor2`
    no tenga pagos.

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

## Fase 7 — Pruebas, seguridad y endurecimiento ✅

### Funcionalidades implementadas

- **Las 25 pruebas mínimas de `CLAUDE.md` §30, automatizadas de verdad.** Auditar la matriz fila por
  fila destapó que **tres** se daban por cubiertas sin estarlo (detalle en `TESTING.md` §3.0):
  la 1 (nadie comprobaba el destino **por rol**: `loginAs` acepta cualquiera de los dos paneles),
  la 2 (verificada a mano en la Fase 1, nunca automatizada) y la 25 (diferida a esta fase).
- **Cabeceras de seguridad**: CSP con **nonce por request** + `strict-dynamic`, HSTS (solo en
  producción), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`.
- **Limitación de intentos** en login, recuperación de contraseña e invitaciones, con su alcance real
  documentado sin adornos (D-062).
- **Protección de APIs y Server Actions** comprobada en dos niveles: una prueba **estructural** que
  falla si alguien añade una acción sin guarda —y que seguirá funcionando para las acciones que aún
  no existen— y una E2E que comprueba las guardas de verdad sobre HTTP, con sesiones reales.
- **Revisión de errores**: ningún mensaje expone estructura interna, ni con un id inexistente, ni con
  uno malformado, ni al iniciar sesión, ni al pedir recuperación de contraseña.
- **`npm audit` en 0 vulnerabilidades**: DT-12 saldada subiendo Next a 16.3.0.
- **Código muerto eliminado**: 8 exports sin un solo uso (`ErrorState`, `useConfirmDialog`,
  `AppError`, `isActionError`, `RAFFLE_STATUS_VALUES`, `getPaymentDetail`, `countPendingApproval`,
  `getOrgMember`).

### Cambios de base de datos

| Archivo | Contenido |
|---|---|
| `0014_rls_performance.sql` | `current_staff_org_ids()` y reescritura de **22 políticas** para que la RLS deje de llamar a una función por fila (I-019, D-063) |
| `0015_harden_function_grants.sql` | Revoca `EXECUTE` a `anon` y a `public` sobre las funciones propias. Corrige una divergencia local/remoto detectada **al verificar el proyecto real** tras aplicar las anteriores (I-020, D-065) |

**Las 15 migraciones están aplicadas en local y en el proyecto real**, verificadas con
`npm run verify:remote`.

### Pruebas ejecutadas y resultados

| Suite | Antes | Ahora |
|---|---|---|
| Unitarias (`npm run test`) | 126 | **162 ✅** |
| Base de datos (`npm run test:db`) | 238 | **254 ✅** |
| End-to-end (`npm run test:e2e`) | 120 | **142 ✅** |
| `npm run verify` | ✅ | ✅ (0 errores de lint; los 2 avisos conocidos de TanStack) |
| `npm audit` | 3 altas | **0 vulnerabilidades** |

### El hallazgo de la fase: I-019

`EXPLAIN ANALYZE` sobre las consultas principales —el entregable 8— mostró que **toda** consulta
sobre `tickets` tardaba ~1,7 s con solo 7.278 filas:

```
Seq Scan on tickets (actual time=2.512..1724.794 rows=7273)
  Filter: (... AND (is_org_staff(organization_id) OR seller_id = current_profile_id()))
  Buffers: shared hit=44367        <- 44.367 accesos para una tabla de 566 paginas
```

`is_org_staff(organization_id)` recibe una **columna**, así que PostgreSQL no puede sacarla del bucle
y la ejecuta **una vez por fila**; cada llamada consulta tres tablas.

| Medición sobre la misma consulta | Tiempo |
|---|---|
| `count(*)` sin la función | 1,46 ms |
| `count(*)` con `is_org_staff(columna)` | **1.667 ms** |
| `count(*)` con el conjunto precalculado | 1,18 ms |

Efecto en la aplicación tras la migración `0014`:

| Consulta | Antes | Después |
|---|---|---|
| Listado de boletas paginado | 1.607 ms | **4,1 ms** |
| Boletas del vendedor filtradas | 1.292 ms | **2,4 ms** |
| `v_seller_summary` (panel) | 1.291 ms | **3,9 ms** |
| `v_payment_history` paginado | 53,7 ms | **7,1 ms** |
| Conteo exacto (paginación) | 1.225 ms | **1,9 ms** |

No cambia **ningún** permiso: la prueba `F7-01` comprueba la equivalencia entre
`current_staff_org_ids()` e `is_org_staff()` para cada combinación de usuario y organización, y
`F7-03` impide que el patrón lento vuelva a entrar.

**Índices:** no se añadió ninguno. Se probó uno sobre `(organization_id, created_at desc)` para el
listado y el planificador **siguió eligiendo *seq scan***, porque el coste no estaba en leer las
filas. Añadirlo solo habría penalizado las cargas masivas de 1.000 boletas.

### Variables de entorno requeridas

Las mismas de las fases anteriores. Ninguna nueva.

### Problemas reales que permanecen

| ID | Problema | Impacto |
|---|---|---|
| — | Ninguno pendiente sobre el proyecto real: las 15 migraciones están aplicadas y verificadas | — |
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten | Bajo |
| I-013 | `.env.local` apunta al proyecto real | Bajo con `npm run dev:local` |
| I-014 | `notFound()` responde 200 en segmentos con `loading.tsx` | Ninguno funcional |
| — | La limitación de intentos es por instancia | Documentado (D-062). Supabase Auth sigue siendo el límite duro del login |

### Qué debe revisar el siguiente agente antes de comenzar

Ver la sección «ANTES DE EMPEZAR LA FASE 8» al inicio de este documento.

### Decisiones

D-061 a D-064: CSP con nonce por request en vez de `unsafe-inline`; limitación de intentos en memoria
con su alcance declarado; las políticas RLS no pueden llamar a una función por fila; `server-only`
aliasado a un stub en las pruebas unitarias.

---

## Fase 8 — Despliegue y documentación operativa ✅

### Funcionalidades implementadas

- **Aplicación en producción**: `https://gestion-rifas.vercel.app` (proyecto Vercel `gestion-rifas`,
  reutilizado — ya existía, importado automáticamente por Vercel al conectar GitHub, con un despliegue
  fallido desde antes de esta fase). Sin entorno de staging separado: el mismo proyecto Supabase de
  las Fases 2–7 hace de producción (**D-066**, decisión explícita del usuario).
- **`scripts/create-organization.ts`**: alta operativa de una organización nueva y su primer Owner por
  invitación real (nunca contraseña en texto plano), el único bootstrap legítimo fuera de RLS
  (**D-068**). Probado en local: idempotente, rechaza un segundo Owner (BR-U04 + índice único
  `memberships_one_owner_per_org`).
- **Documentación operativa nueva**: `docs/DEPLOYMENT.md` (procedimiento de despliegue, variables,
  reversión), `docs/OPERATIONS.md` (manual de operación del negocio), `docs/RUNBOOK.md` (problemas
  frecuentes). `README.md` y `docs/ARCHITECTURE.md` §12 actualizados a la arquitectura real de dos
  niveles.
- **CI** (`.github/workflows/ci.yml`, **D-069**): job `verify` (typecheck/lint/test/build) + job `db`
  que aplica las 15 migraciones desde cero contra Supabase efímero y corre las 254 pruebas de base de
  datos, en cada push/PR a `main`. `test:e2e` queda fuera del pipeline por ahora.
- **Estrategia de backups adaptada a la realidad del plan Free** (**D-070**, instrucción explícita del
  usuario tras confirmar en el dashboard que no hay scheduled backups, PITR ni restore-to-new-project):
  respaldo lógico manual con `supabase db dump` (roles/schema/datos de `public`, nunca `auth`),
  guardado fuera del repositorio y fuera de Supabase, con restauración probada **solo en local**.
- **Cabeceras y variables verificadas en producción real**: HSTS, CSP con nonce apuntando al proyecto
  Supabase correcto, `X-Frame-Options`, todas presentes (`curl -I` contra el dominio real). Ningún
  secreto en el HTML servido ni en el bundle JS del navegador (`.next/static`).

### Pruebas ejecutadas y resultados

| Prueba | Resultado |
|---|---|
| `npm run test:db` (local) | **254 ✅** |
| `npm run test:e2e` (local) | **142 ✅** |
| `npm run verify` | ✅ (0 errores; los 2 avisos conocidos de TanStack) |
| `scripts/create-organization.ts` contra local | ✅ organización + Owner creados, login funcional tras fijar contraseña, segundo Owner rechazado |
| Cabeceras de producción (`curl -I` al dominio real) | ✅ HSTS, CSP con nonce, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Rutas protegidas sin sesión en producción | ✅ `/owner/dashboard`, `/seller/dashboard`, `/api/reports/export` → 307 a `/login` |
| Fuga de secretos al navegador | ✅ ninguna, ni en HTML servido ni en `.next/static` |
| Restauración del respaldo lógico en local | ✅ 9 tablas, 25 políticas RLS, 35 triggers, 5 vistas, 5 enums y todas las filas de negocio recreadas sin error |
| Prueba de humo de los 3 roles en producción | ✅ **la ejecutó el usuario** (login con contraseña está prohibido para un agente — ver Decisiones) |

**Cuatro problemas reales encontrados y corregidos durante la fase, ninguno oculto:**

1. El primer despliegue a producción falló: `NEXT_PUBLIC_SUPABASE_URL` no llegaba al build. Causa
   raíz, en dos capas: (a) el proyecto Vercel preexistente no tenía ninguna variable configurada, y
   (b) tras configurarlas, un **error de tipeo** (`NEXT_PUBLIC_SUPABASE_UR` sin la "L" final) lo
   siguió rompiendo. Detectado leyendo el log de build real, no adivinando.
2. Generar el respaldo lógico con `require('dotenv').config()` corrompió `SUPABASE_DB_URL`: el aviso
   promocional que ese paquete imprime por `stdout` se coló dentro del valor capturado por `$(...)`,
   y `supabase db dump` reportó `LegacyDbConfigParseUrlError`. Corregido leyendo el archivo
   directamente con `fs.readFileSync` en vez de `dotenv`.
3. **El volcado de datos, sin restringir el esquema, incluyó `auth.users` completo** —
   `encrypted_password`, tokens de recuperación/confirmación/reautenticación de cada cuenta real—,
   violando directamente la instrucción del usuario de no guardar secretos en el respaldo. Detectado
   al restaurar en local (un error de restricción única ajeno a cualquier tabla de negocio), los tres
   archivos contaminados se borraron de inmediato -nunca salieron de la máquina- y se regeneraron con
   `--schema public --data-only`. Ver I-024 y D-070.
4. Restringir también `schema.sql` a `--schema public` rompía la restauración
   (`operator class "public.gin_trgm_ops" does not exist`): la extensión `pg_trgm` no se recreaba.
   Corregido dejando `schema.sql` sin restringir esquema (solo trae una referencia inofensiva a
   `auth`, la FK de `profiles`, no datos).

Detalle cronológico completo en [`TEST_RESULTS.md`](TEST_RESULTS.md).

### Cambios de base de datos

**No aplica.** La Fase 8 no agregó ni modificó ninguna migración. Las 15 siguen siendo las mismas de
la Fase 7, aplicadas y verificadas en el proyecto real.

### Variables de entorno requeridas

Las mismas de las fases anteriores, ahora también configuradas en Vercel (scope Production
únicamente, `SUPABASE_SERVICE_ROLE_KEY` marcada Sensitive) — detalle exacto en `docs/DEPLOYMENT.md`
§3.1. Sin variables nuevas.

### Problemas reales que permanecen

| ID | Problema | Impacto |
|---|---|---|
| I-024 | El proyecto real está en plan Free: sin backups automáticos ni PITR | **Alto antes de operar con datos reales.** Mitigado con respaldo lógico manual (D-070); requiere upgrade a Pro o automatización externa como prerrequisito — ver `RUNBOOK.md` §5.3 |
| I-021 | Cuentas de demostración conviven con producción, contraseña compartida | Medio. Recomendación operativa en `OPERATIONS.md` §5, no resuelto automáticamente por diseño (decisión del negocio) |
| I-022 | Sin entorno de staging real | Bajo mientras las variables de Supabase solo estén en scope Production de Vercel (ya verificado) |
| I-023 | Enlaces de invitación/recuperación pueden aterrizar en la portada si la URL de producción no está en la lista blanca de Supabase Auth | Resuelto para esta URL: el usuario ya configuró Authentication → URL Configuration con `https://gestion-rifas.vercel.app` |
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten | Bajo. Sin cambios |
| DT-12 | — | Cerrado desde la Fase 7 |

### Qué debe revisar el siguiente agente antes de comenzar

Ver la sección «ANTES DE EMPEZAR LA FASE 9» al inicio de este documento.

### Decisiones

D-066 a D-070: un solo proyecto Supabase como producción, sin staging (D-066); reutilizar el proyecto
Vercel existente (D-067); `create-organization.ts` inserta la membresía de Owner con el cliente admin,
único bootstrap legítimo sin sesión de staff previa (D-068); CI cubre typecheck/lint/test/build y base
de datos, no `test:e2e` (D-069); respaldo lógico manual mientras el proyecto sea plan Free, con
restauración probada solo en local y nunca en el remoto sin autorización explícita cada vez (D-070).

---

## Fase 9 — Auditoría final independiente ✅

Informe completo, con la evidencia de cada hallazgo: [`AUDIT_REPORT.md`](AUDIT_REPORT.md).

### Funcionalidades implementadas

La Fase 9 no añade producto: audita el que existe. Lo entregado es evidencia y dos correcciones.

- **`docs/AUDIT_REPORT.md`**: informe con los 4 entregables de auditoría (seguridad, integridad,
  funcional y calidad), los hallazgos clasificados por severidad con su recomendación, y **lo que se
  intentó romper y no cedió** — porque sin eso, «no encontré nada» no se distingue de «no busqué».
- **Auditoría por ejecución, no por lectura**: 15 consultas al catálogo escritas desde cero (sin
  reutilizar `catalog.test.ts`), **47 intentos adversarios** con sesiones reales y clave pública
  (nunca `service_role`, D-043), y `npm run verify:remote` contra el proyecto real.
- **Corrección A-01** (`tests/unit/server-actions-guard.test.ts`): el recorrido pasa a ser recursivo.
  Antes analizaba 22 de las 28 Server Actions; las 6 de `tickets/assign`, `tickets/bulk` y
  `tickets/seller` quedaban fuera de la red.
- **Corrección A-02** (migración `0016`): una organización ya no puede quedarse sin Owner activo.
- **`tests/db/audit-phase9.test.ts`**: 12 pruebas nuevas (`F9-01`, `F9-02`) que cubren los dos
  hallazgos y el aislamiento de cobranza en **ambas** direcciones.

### Pruebas ejecutadas y resultados

| Suite | Antes | Ahora |
|---|---|---|
| Unitarias (`npm run test`) | 162 | **163 ✅** |
| Base de datos (`npm run test:db`) | 254 | **266 ✅** |
| End-to-end (`npm run test:e2e`) | 142 | **142 ✅** (reejecutadas tras `0016`) |
| `npm run verify` | ✅ | ✅ (0 errores de lint; los 2 avisos conocidos de TanStack) |
| `npm run verify:remote` (proyecto **real**, solo lectura) | 13/13 | **13/13 ✅** |
| Sonda adversaria | — | **47 intentos · 45 bloqueados · 2 falsos positivos verificados** |

**Errores encontrados durante la fase, ninguno oculto:**

1. **A-01 — 6 de las 28 Server Actions estaban fuera de la prueba estructural.** No hubo
   vulnerabilidad: las 6 tienen su `authorizeAction`. Faltaba la red que impide olvidarla mañana.
   Comprobado inyectando temporalmente una acción sin guarda: antes pasaba inadvertida, ahora falla.
2. **A-02 — Una organización podía quedarse sin Owner, irrecuperablemente.** Reproducido con la
   sesión real del Owner: 1 fila afectada, 0 Owners activos después, y ni el ex-Owner ni un Admin
   pueden repararlo. Corregido con `0016`.
3. **Dos falsos positivos de mi propia sonda**, investigados y descartados: las 39 asignaciones y los
   36 pagos que «veía de más» un vendedor eran todos **suyos**. De ahí salió A-03.
4. **`F9-02` rompió `F6-04` al primer intento**: anular el pago de prueba no bastaba, porque un pago
   anulado sigue apareciendo en `report_payments_by_day`. Corregido borrándolo de verdad, en una sola
   transacción. Verificado ejecutando `test:db` dos veces sin resembrar: 266 ✅ las dos veces.
5. **El seed falla si se lanza justo tras `db:reset`** (`AuthRetryableFetchError` 502): GoTrue tarda
   más que Postgres en arrancar. Registrado como I-028.

Cronología completa en [`TEST_RESULTS.md`](TEST_RESULTS.md).

### Migraciones que existen

Las 15 anteriores **más**:

| Archivo | Contenido |
|---|---|
| `0016_organization_keeps_owner.sql` | Constraint trigger **diferido** sobre `memberships`: rechaza al COMMIT todo cambio de `role` o `is_active` que deje la organización sin Owner activo. Diferido a propósito, para que transferir la propiedad en **una** transacción siga siendo posible (I-025, D-071) |

⚠️ **Aplicada y probada solo en LOCAL.** Las `0001`–`0015` siguen aplicadas y verificadas en el
proyecto real. Aplicar `0016` al remoto requiere autorización explícita del usuario —
`AUDIT_REPORT.md` §8.1.

### Variables de entorno requeridas

Las mismas de las fases anteriores. Ninguna nueva.

### Problemas reales que permanecen

| ID | Problema | Impacto |
|---|---|---|
| I-025 | `0016` sin aplicar al proyecto real | **Medio.** En producción, el Owner puede dejar la organización sin propietario; repararlo exige un script con `service_role`. Un solo comando lo resuelve, pero necesita autorización |
| I-024 | Plan Free: sin backups automáticos ni PITR | **Alto antes de operar con datos reales.** Sin cambios desde la Fase 8 |
| I-021 | Cuentas de demostración en producción con contraseña compartida | Medio. Decisión del negocio (`OPERATIONS.md` §5) |
| I-022 | Sin staging real | Bajo mientras las variables de Supabase solo estén en scope Production |
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten | Bajo. Pendiente de que el usuario autorice borrar el `.txt` |
| I-014 | `notFound()` responde 200 en segmentos con `loading.tsx` | Ninguno funcional: no filtra datos |
| A-04 | 25 tipos exportados sin consumidor | Ninguno. Aceptado: es una convención uniforme, se borran al compilar |

### Qué debe revisar el siguiente agente antes de comenzar

Ver «LO PRIMERO, SI RETOMAS ESTE PROYECTO» al inicio de este documento. El plan de 10 fases está
terminado; lo que queda son decisiones del usuario, no trabajo pendiente de ingeniería.

### Decisiones

D-071: el «al menos un Owner» se garantiza con un constraint trigger **diferido**, no endureciendo la
política ni comprobándolo en la Server Action. Diferido porque transferir la propiedad obliga a pasar
por un estado intermedio sin Owner, y un trigger inmediato lo haría imposible para siempre.

---

## Comandos

```bash
npx supabase start     # instancia local (Docker)
npm run db:reset       # reaplica las 16 migraciones desde cero (local)
npm run seed:local     # datos de desarrollo en local
npm run seed           # datos de desarrollo en el proyecto de .env.local
npm run test:db        # 266 pruebas de base de datos (crea 5.000 boletas de volumen)
npm run test:e2e       # 142 pruebas end-to-end (Playwright)
npm run verify         # typecheck + lint + unitarias + build
npm run dev            # servidor de desarrollo (segun .env.local)
npm run dev:local      # servidor de desarrollo contra la instancia local
npm run create-org -- --name "..." --owner-email ... --owner-name ... --owner-phone ...
                       # alta de una organizacion nueva y su primer Owner (docs/OPERATIONS.md)
```

Aplicar migraciones al proyecto real:

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
```

Respaldo lógico manual (plan Free, sin backups automáticos — procedimiento completo y advertencias en
`docs/RUNBOOK.md` §5):

```bash
npx supabase db dump -f "<carpeta-fuera-del-repo>/roles.sql" --role-only --db-url "$SUPABASE_DB_URL"
npx supabase db dump -f "<carpeta-fuera-del-repo>/schema.sql" --db-url "$SUPABASE_DB_URL"
npx supabase db dump -f "<carpeta-fuera-del-repo>/data.sql" --schema public --data-only --db-url "$SUPABASE_DB_URL"
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
| 2026-08-04 | 7 | Endurecimiento: cabeceras de seguridad con CSP por nonce, limitación de intentos y las 25 pruebas mínimas automatizadas por fin (la 1, la 2 y la 25 se daban por cubiertas sin estarlo). Migración `0014`: la RLS deja de llamar a una función por fila y pasa de ~1.667 ms a ~1,2 ms (I-019). DT-12 saldada subiendo Next a 16.3.0: `npm audit` en 0. Código muerto eliminado. +15 pruebas de BD, +22 E2E, +36 unitarias. |
| 2026-08-05 | 8 | Despliegue real a producción: `https://gestion-rifas.vercel.app`, mismo proyecto Supabase de siempre como producción (D-066, sin staging). `scripts/create-organization.ts` para el bootstrap de organización/Owner (D-068). CI con GitHub Actions (D-069). Estrategia de backups reescrita de cero al descubrir que el proyecto real está en plan Free: respaldo lógico manual verificado (D-070, I-024) — un intento inicial expuso `auth.users` completo y se corrigió antes de salir de la máquina. Cabeceras, aislamiento de rutas y ausencia de secretos verificados contra producción real; los tres roles los probó el usuario (login está prohibido para un agente). Sin migraciones nuevas. |
