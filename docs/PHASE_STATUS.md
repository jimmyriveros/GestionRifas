# ESTADO DE LAS FASES

Estado del producto y registro de lo entregado por fase. El relevo del último agente, el arranque y
las advertencias operativas viven en [`HANDOFF.md`](HANDOFF.md); no se duplican aquí.

- **Actualizado:** 2026-08-14
- **Estado global:** plan de 10 fases completado; mantenimiento posterior en curso
- **Fase siguiente:** ninguna autorizada

## Resumen de fases y mantenimiento

| Clasificación | Estado actual |
|---|---|
| **Completada** | Fases 0 a 9, y el mantenimiento posterior: equipos, avisos y comisiones (2026-08-12), dos formas de pago (2026-08-13), corregir a un integrante pendiente (2026-08-14), el precio de la boleta a $120.000 (2026-08-15) y la rebaja del vendedor (2026-08-17, **solo en local**) |
| **En curso** | Ninguna |
| **Pendiente** | Ninguna fase. Mantenimiento no activo I-030, I-037 e I-046–I-052; prerrequisitos operativos I-021, I-023 e I-024 |
| **Bloqueada** | Ninguna fase |

`Bloqueada` describe una fase autorizada que no puede avanzar. Los controles para operar con datos
reales y los defectos sin tarea activa se muestran como pendientes y se detallan en
`KNOWN_ISSUES.md`; no se ocultan bajo el cierre del plan.

| Fase | Nombre | Estado | Entrega funcional | Etiqueta (destino real) |
|---|---|---|---|---|
| 0 | Arquitectura y planificación | Completada | `b4b991c` | `fase-0` → `b4b991c` |
| 1 | Proyecto base y autenticación | Completada | `34b3cb1` | `fase-1` → `34b3cb1` |
| 2 | Base de datos, restricciones y RLS | Completada | `954531c` | `fase-2` → `954531c` |
| 3 | Portal Owner y Admin | Completada | `439e64d` | `fase-3` → `d37ed01` |
| 4 | Portal Seller y clientes | Completada | `36ef2e1` | `fase-4` → `5ff2084` |
| 5 | Pagos, abonos y saldos | Completada | `ecc9eac` | `fase-5` → `3b3bd13` |
| 6 | Dashboards, reportes y UI/UX | Completada | `791e585` | `fase-6` → `791e585` |
| 7 | Pruebas, seguridad y endurecimiento | Completada | `caa6298` | `fase-7` → `caa6298` |
| 8 | Despliegue y documentación operativa | Completada | `bcd6dc0` | `fase-8` → `bcd6dc0` |
| 9 | Auditoría final independiente | Completada | `a8c4083` | `fase-9` → `0becc47` |

Las etiquetas 3, 4, 5 y 9 apuntan a checkpoints documentales posteriores al commit funcional. Es
historia válida; no deben moverse para hacer coincidir las columnas.

---

## Cómo leer las secciones siguientes

Cada fase conserva la fotografía que era cierta al cerrarse. Por eso una sección antigua puede decir
«15 migraciones» o mostrar I-004 como abierto: no es el estado actual y no se reescribe. Para el
estado vigente usa la tabla superior, `HANDOFF.md` §1 y `KNOWN_ISSUES.md`; para ejecutar comandos o
tocar producción, usa `HANDOFF.md`, `DEPLOYMENT.md` y `RUNBOOK.md`.

El mantenimiento posterior a la Fase 9 se registra en el historial de este documento solo cuando
cambia el producto. El contexto del último trabajo pertenece a `HANDOFF.md`.

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
- **Rifas**: listado con métricas, creación con precio predeterminado de $120.000 (D-098; era
  $100.000 cuando se cerró esta fase), edición,
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

- **Exportación a CSV** de las cinco tablas, con separador `;`, BOM UTF-8, moneda `$120.000` y fechas
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

✅ **Las 16 migraciones están aplicadas en local y en el proyecto real.** `0016` se aplicó el
2026-08-05 con autorización explícita del usuario, tras respaldo lógico previo, y se verificó allí en
dos niveles: catálogo (9/9, incluida la comprobación de que `anon` y `public` no pueden ejecutar la
función nueva) y **comportamiento** — degradar al Owner en producción es rechazado, comprobado dentro
de una transacción revertida que no dejó ningún cambio.

### Variables de entorno requeridas

Las mismas de las fases anteriores. Ninguna nueva.

### Problemas reales que permanecen

| ID | Problema | Impacto |
|---|---|---|
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

## Referencias operativas

| Necesidad | Fuente vigente |
|---|---|
| Arrancar, sembrar y verificar local | `HANDOFF.md` §2 y §7 |
| Comandos npm | `README.md` |
| Promover una migración | `DEPLOYMENT.md` §2.2 — respaldo, `--dry-run`, `--yes` y `verify:remote` |
| Respaldar o restaurar | `RUNBOOK.md` §5 |
| Alta de organización y primer Owner | `OPERATIONS.md` §1 |

No copies comandos de producción desde un snapshot de fase: usa siempre el procedimiento propietario
anterior. En particular, un `db push` aislado no es el procedimiento autorizado.

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
| 2026-08-05 | — | **Después de la Fase 9**, sin abrir fase nueva: guía permanente de UX Writing en `docs/UX_COPY_GUIDELINES.md`, importada desde `CLAUDE.md` §35 con `@docs/UX_COPY_GUIDELINES.md` y con seis reglas obligatorias de aplicación (D-072). Reglas de redacción unificadas: `CLAUDE.md` §27, `ARCHITECTURE.md` §8.3 y `BUSINESS_RULES.md` BR-X08 ahora apuntan a la guía en vez de decir cada uno lo suyo. |
| 2026-08-05 | — | **Recorrido guiado interactivo** (`src/features/tour/`, D-074 y D-075): resalta un elemento y lo explica en un globo, con progreso «Paso N de M», avanzar, volver y omitir. Ocho recorridos —cuatro por portal— con todos sus textos en `tours.ts`. Sin dependencias nuevas: el globo se posiciona con el Popover de `radix-ui`, que ya estaba. Los pasos apuntan a `data-tour` puestos en componentes compartidos, así que una pantalla nueva hereda los anclajes. Un paso cuyo elemento no exista o no esté visible se descarta solo (así el paso de la barra lateral cede al del menú en el teléfono). Lo visto se recuerda por perfil en `localStorage`. **+29 unitarias y +10 E2E**, todas ejecutadas: 192 unitarias ✅, 266 de base de datos ✅, **152 E2E ✅** y `verify` ✅. Las E2E destaparon dos defectos reales, corregidos: dos diálogos anidados (accesibilidad) y un `setState` durante el render al terminar el recorrido (I-031). Sin migraciones. |
| 2026-08-05 | — | **Guía aplicada a los textos existentes** (D-073), ya con autorización del usuario: 302 correcciones de ortografía en 89 archivos de `src/` —incluidas las etiquetas de estado de `constants.ts` («Dueño», «Pendiente de aprobación»)— y 18 archivos de pruebas ajustados a los textos nuevos. Cierra I-029. `CLAUDE.md.txt` borrado: cierra I-004. Las palabras cuya tilde depende del significado se revisaron a mano, una por una. **Los ~46 mensajes que lanza la base de datos quedan fuera** y se registran como I-030: cambiarlos exige una migración sobre producción. Sin migraciones ni cambios de esquema. Suites: 163 unitarias ✅, 266 de base de datos ✅, `verify` ✅, 142 E2E ✅. |
| 2026-08-05 | 8 | Despliegue real a producción: `https://gestion-rifas.vercel.app`, mismo proyecto Supabase de siempre como producción (D-066, sin staging). `scripts/create-organization.ts` para el bootstrap de organización/Owner (D-068). CI con GitHub Actions (D-069). Estrategia de backups reescrita de cero al descubrir que el proyecto real está en plan Free: respaldo lógico manual verificado (D-070, I-024) — un intento inicial expuso `auth.users` completo y se corrigió antes de salir de la máquina. Cabeceras, aislamiento de rutas y ausencia de secretos verificados contra producción real; los tres roles los probó el usuario (login está prohibido para un agente). Sin migraciones nuevas. |
| 2026-08-06 | — | **Usabilidad de tablas y listas** (D-076, D-077), a petición del usuario y sin abrir fase nueva. (a) **La fila entera abre el detalle**, no solo el enlace del código: `DataTable` acepta `rowHref` u `onRowActivate`, y la fila trae puntero, hover propio, foco visible y activación con `Enter`/`Espacio`. Lo aplican boletas, clientes, rifas, vendedores y pagos; `UsersTable` no, porque no hay pantalla de detalle de usuario. Las reglas de qué clic la abre viven en `row-activation.ts` — el caso que no es evidente es el menú de Radix, que vive en un portal pero cuyo clic React propaga igual hasta la fila. (b) **Corregido I-033**: el cliente elegido al asignar una boleta se volvía ilegible al pasar el cursor (contraste **1,01**), porque `hover:bg-accent` y `bg-primary text-primary-foreground` convivían en la misma lista de clases. Los estados pasan a escribirse como ramas excluyentes en un componente compartido, `OptionList`, usado también por el selector de cliente de los abonos. **+15 unitarias y +9 E2E**, todas ejecutadas: 207 unitarias ✅, 266 de base de datos ✅, **161 E2E ✅** y `verify` ✅. Las pruebas de contraste se comprobaron **al revés**, restaurando el CSS defectuoso. Sin migraciones ni cambios de esquema. |
| 2026-08-06 | — | **Búsqueda híbrida** (D-078, D-079), a petición del usuario y sin abrir fase nueva. Los cuatro buscadores de lista y los dos selectores de cliente buscan solos tras una pausa de 350 ms, al momento con `Enter` o con el botón, y se limpian con un toque. **No se añadió una capa de fetch**: en este proyecto el término vive en la URL y `router.replace` ES la petición, así que el debounce retrasa la navegación y la cancelación la hace el router; donde sí hay Server Action —los selectores— se descartan las respuestas viejas con un testigo de secuencia, porque una Server Action no se puede abortar. **Lo importante del trabajo no fue la comodidad sino un fallo de corrección**: los selectores precargaban 200 clientes y filtraban en memoria, de modo que un vendedor con más de 200 no podía encontrar a los últimos ni para venderles ni para cobrarles, y sin ningún aviso (I-036). Migración `0017`: columna generada `clients.search_text` (acentos y teléfonos normalizados, con `translate` en vez de la extensión `unaccent` para no depender del esquema donde quede instalada) e índice de trigramas en `tickets.internal_code`, que se buscaba sin ninguno — medido con 20.000 boletas: **13,9 ms → 0,9 ms**. **+19 unitarias, +26 de base de datos y +13 E2E**: 226 unitarias ✅, 292 de base de datos ✅, **174 E2E ✅** y `verify` ✅. Ocho errores propios encontrados y corregidos por el camino, incluidos dos **pruebas vacías** que no podían fallar, una función que nacía ejecutable por `anon` y **I-038**, un fallo intermitente que resultó ser una carrera de navegación en el helper `loginAs`, no un defecto de pagos. **La migración `0017` está aplicada solo en local**: llevarla al proyecto real exige autorización y respaldo previo (D-070). |
| 2026-08-07 | — | **Migración `0017` aplicada al proyecto real**, con autorización explícita del usuario y respaldo lógico previo (D-070). Producción pasa a tener la búsqueda normalizada: «Jose» encuentra a «José», el teléfono se halla escrito de cualquier forma, y la búsqueda de boletas deja de hacer barrido secuencial. Verificada allí de las dos maneras: por catálogo —`verify:remote` 13/13 más 13 comprobaciones propias de `0017`, tres de ellas de privilegios, que es justo donde este proyecto ya tuvo dos divergencias local/remoto (D-038, I-020)— y **por comportamiento**, insertando un cliente con tildes y ñ dentro de una transacción, comprobando que se encuentra escribiéndolo sin ellas y revirtiendo: 6 clientes antes y 6 después. Las 17 migraciones están ahora en local y en producción. |
| 2026-08-08 | — | **Una boleta se busca por sus números, no por su código** (BR-N11, D-080), a petición del usuario y sin abrir fase nueva. La búsqueda deja de mirar `internal_code` y pasa a ser **parcial** sobre los dos números, **ordenada por relevancia** —diario exacto, diario empieza, diario contiene, y después lo mismo con el semanal—. El orden lo decide SQL y no el navegador, porque la lista está paginada en servidor: reordenar la página visible dejaría la mejor coincidencia escondida en la página 7. El código interno sale de todas las listas (tabla de boletas, panel, pagos, reparto de abonos) y baja al detalle, bajo «Información administrativa». Migración `0018`: la función `search_tickets` (`security invoker`, hereda `tickets_select`) y dos índices de trigramas sobre los números. **+19 de base de datos, +10 unitarias y +2 E2E**: 238 unitarias ✅, 311 de base de datos ✅, **178 E2E ✅** y `verify` ✅. Seis errores propios encontrados por el camino, incluidos un orden de resultados sin sentido —visto en una captura de la tabla, no en una prueba— y el cambio de orden del reparto de abonos, que es un efecto lateral real y queda documentado. **La `0018` está aplicada solo en local** y el código ya la llama: desplegar sin aplicarla rompe la búsqueda de boletas en producción (I-040). |
| 2026-08-08 | — | **Importar boletas desde CSV y JSON** (BR-N12, D-081), a petición del usuario y sin abrir fase nueva. Un solo importador para los tres roles: no recibe el rol, recibe el contexto —rifa, vendedor, a dónde volver— y quién puede hacer qué lo deciden la Server Action y la base de datos. El recorrido nunca se salta la parada: elegir archivo → mapear columnas si hace falta → **vista previa** → confirmar → resultado; elegir el archivo no escribe nada. Lee CSV de Excel (marca BOM, saltos de Windows, separador `;`, comillas) y JSON, con reconocimiento automático de encabezados y mapeo manual cuando no los reconoce. **Sin reglas de boletas nuevas**: valida con `validateBulkRows`, el mismo motor de la carga manual, y guarda por los mismos caminos. Migración `0019`: `taken_ticket_combinations` —para que un vendedor sepa que una combinación está tomada **sin ver de quién es**— y `log_ticket_import`, que deja la importación en `audit_logs` sin guardar el archivo. **+26 unitarias, +14 de base de datos y +8 E2E**: 264 unitarias ✅, 325 de base de datos ✅, **186 E2E ✅** y `verify` ✅. Cuatro errores propios corregidos por el camino, dos de ellos destapados por una captura de pantalla y no por una prueba. **La `0019` está aplicada solo en local** (I-042). |
| 2026-08-08 | — | **Selección múltiple y acciones masivas en la lista de boletas** (BR-B01..BR-B08, D-082 a D-085), a petición del usuario y sin abrir fase nueva. Se pueden marcar varias boletas y actuar sobre todas: el vendedor las **vende a un cliente de una vez**; el Dueño y el Administrador **aprueban, anulan, cambian de vendedor y eliminan**. La selección se identifica por `ticket.id`, tope de 1.000, y **sobrevive a buscar, filtrar, ordenar y cambiar de página** porque vive fuera de React, en `sessionStorage` leído con `useSyncExternalStore`; «Limpiar filtros» y «Limpiar selección» son botones distintos que no se tocan. En escritorio, columna de casillas de siempre y barra de acciones en línea; en el teléfono, **modo selección explícito** donde la fila entera es la diana —la casilla se ve de 20 px y se toca en 44—, con pulsación larga como atajo y barra pegada abajo. Las seleccionadas **no se suben arriba** (mueve las filas bajo el dedo): en su lugar, «Ver seleccionadas» cambia la lista sin tocar los filtros. **Ninguna regla nueva de boletas**: el cuerpo de `assign_ticket` y `cancel_ticket` se extrae a dos helpers que usan tanto la acción individual como la masiva, y el cambio de vendedor pasa de TypeScript a SQL, donde una llamada directa a la API ya no puede saltárselo. **Eliminar es lo único nuevo**, y es borrado físico acotado a boletas cargadas por error —sin cliente, sin venta, sin abonos y **nunca anuladas**, cuya combinación queda reservada por BR-N08—; el proyecto sigue sin conceder `DELETE` a nadie (D-038). Migración `0020`: cinco funciones públicas y tres piezas internas sin `EXECUTE` para nadie. **+22 unitarias, +46 de base de datos y +26 E2E**: 286 unitarias ✅, 371 de base de datos ✅, **212 E2E ✅** y `verify` ✅. Seis errores propios corregidos por el camino, el mayor de ellos una carrera de hidratación que hacía fallar 13 pruebas culpando al producto. **La `0020` está aplicada en local y en producción** (2026-08-08, autorizada explícitamente). |
| 2026-08-09 | — | **Clientes opcionales en la importación CSV/JSON** (BR-N12, D-087), a petición del usuario y sin abrir fase. Si una fila incluye cliente, nombre y **celular son obligatorios juntos**; el archivo puede mezclar otras sin cliente y los formatos antiguos siguen iguales. Owner/Admin agrupa por nombre + celular normalizados, reutiliza solo una coincidencia activa/exacta/única de la cartera seleccionada y bloquea archivados, duplicados o el mismo celular con otro nombre. Seller conserva `pending_approval` sin cliente. Migración `0021`: vista previa acotada a cartera e importación transaccional que reutiliza `assign_ticket_row`; cliente, boletas, asignaciones y contador se revierten juntos. **+7 unitarias, +7 de base de datos y +1 E2E**: 293 unitarias ✅, 378 de base de datos ✅, **213 E2E ✅** y `verify` ✅. La primera corrida E2E quedó 212/213 por una frase antigua en la prueba; corregida, la spec pasó 9/9 y la repetición completa 213/213. `0021` se promovió al proyecto real el mismo día, con respaldo y verificaciones remotas; I-054 quedó resuelto y el push de `main` activó el despliegue coordinado. |
| 2026-08-10 | — | **«Mis boletas» del vendedor deja de mostrar la rifa** (D-088), a petición del usuario y sin abrir fase nueva. El negocio operará una sola rifa, así que el filtro «Rifa» ofrecía una única opción y la columna «Rifa» repetía el mismo valor en todas las filas. Se ocultan los dos **solo en el portal del vendedor**, reutilizando el mecanismo que ya existía —`TicketFilters` oculta los selectores que no se le pasan, y `showRaffle` es el hermano de `showSeller` en `TicketsTable`—; «Ver seleccionadas» recibe la misma opción porque es la misma pantalla. El portal administrativo conserva filtro y columna, y la consulta sigue aceptando `raffleId` por la URL, de modo que un enlace guardado sigue filtrando y «Limpiar filtros» sabe quitarlo. Sin migraciones, sin cambios de esquema, RLS ni consultas. **+2 aserciones** en `seller-tickets.spec.ts`: 293 unitarias ✅, 378 de base de datos ✅, **213 E2E ✅** y `verify` ✅, más comprobación visual de las dos pantallas. En el mismo trabajo se corrigieron dos derivas documentales: el conteo de E2E (212 → 213) en `HANDOFF` §7 y `ARCHITECTURE` §2, y «las 20 migraciones» → 21 en `ARCHITECTURE` §11. **Publicado en producción el mismo día** con autorización expresa: `--dry-run` sin migraciones pendientes, CI 2/2, despliegue de Vercel `READY` sobre el SHA del commit y producción en HTTP 200. |
| 2026-08-10 | — | **Flecha de volver en las pantallas de detalle** (BR-X09, D-089), a petición del usuario y sin abrir fase nueva. Un botón/enlace textual «Volver a…» —o, en 6 de 10 pantallas, ninguno— se reemplaza por una flecha junto al título, compartida vía `PageHeader backHref`. Prefiere el historial real de la sesión y no construye ningún sistema propio de filtros/scroll: como esos datos ya viven en la URL (§6.b de `HANDOFF`), `router.back()` los conserva solo. Cuando no hay pantalla anterior real —URL directa, pestaña nueva— cae en un destino de repuesto por entidad, sin salir nunca de la aplicación. Componentes nuevos: `BackButton` (mismo patrón de diana de 44 px que `SelectionCheckbox`, D-085) y `navigation-history.ts` (contador de variable de módulo, no `sessionStorage`: una prueba E2E propia del Caso E encontró que la versión con `sessionStorage` heredaba el historial del login al abrir un detalle por URL directa justo después de iniciar sesión). Sin migraciones, sin cambios de esquema, RLS ni consultas. **+2 specs E2E nuevos**: 293 unitarias ✅, 378 de base de datos ✅, **224 E2E ✅** (213 anteriores + 11 nuevas) y `verify` ✅. **Publicado en producción el mismo día** con autorización expresa: `--dry-run` sin migraciones pendientes, CI 2/2, despliegue de Vercel `READY` sobre el SHA del commit y producción en HTTP 200. |

---

## Mantenimiento post-9 — Equipos, avisos y comisiones ✅

**2026-08-12.** Encargo completo del dueño del producto (`Equipo.txt`), ejecutado en sus doce fases.
No es una fase del plan: es mantenimiento autorizado, sin etiqueta `fase-N` (§34.2).

### 1. Funcionalidades implementadas

| Bloque | Qué quedó |
|---|---|
| **Equipos** | Cualquier vendedor puede formar el suyo. Un integrante **es** una membresía con rol `seller` y `parent_seller_id`; no hay rol ni entidad nueva (BR-E01). Dos niveles hoy, más sin rehacer el modelo |
| **«Mi equipo»** | Siempre en el menú del vendedor, tenga equipo o no. Estado vacío que explica; alta por el **mismo** formulario y el **mismo** camino de invitación que el portal administrativo |
| **Panel y detalle del equipo** | Totales del equipo, tarjeta por integrante y sus ventas. Un id ajeno responde «no encontrada», no «denegado» |
| **Avisos** | Tabla `notifications` + campanita, **sin tiempo real**. Se avisa al agregar un integrante (al personal) y al venderse una boleta (al vendedor padre y al personal) |
| **Comisiones** | Tramos retroactivos 1–20/21–30/31–50/51+ sobre boletas **cobradas**, motor derivado, ledger que cuadra, y tarjeta «Tu ganancia» que separa lo ganado de la proyección |
| **Portal administrativo** | Quién tiene equipo, quién pertenece a uno y quién no; ganancia por vendedor; jerarquía enlazada en las dos direcciones |

### 2. Pruebas ejecutadas

Detalle completo, con los nueve errores encontrados y corregidos, en
[`TEST_RESULTS.md`](TEST_RESULTS.md) § «Equipos, avisos y comisiones».

| Comando | Resultado |
|---|---|
| `npm run test:db` | ✅ **429/429**, y **429/429 otra vez sobre la misma base** (independencia entre suites) |
| `npm run verify` | ✅ typecheck · lint 0 errores · 299/299 unitarias · build |
| `npx playwright test` | ✅ **242/242** tras `db:reset` + `seed:local` |

### 3. Migraciones que existen

| Migración | Qué hace |
|---|---|
| `0022_seller_teams.sql` | `parent_seller_id`, sus restricciones y su trigger; `current_team_seller_ids()`, `current_profile_leads_team()`; alta de integrantes por el vendedor; `team_sales_summary()` y `team_member_sales()`. **No toca `tickets_select`** (D-092) |
| `0023_notifications.sql` | `notifications`, `notify_profiles()`, y los dos triggers que avisan. El texto **no** se guarda aquí (BR-E13) |
| `0024_commissions.sql` | `commission_tiers`, `seller_commissions`, `commission_ledger`, `recalc_seller_commission()`, el trigger sobre `tickets` y `commission_summary()`. Incluye saldo de partida |

✅ **Las tres se promovieron al proyecto real el 2026-08-13**, con autorización explícita y respaldo
previo en `Rifas-backups/2026-08-13-pre-0022-0024/`. Verificadas por catálogo (`verify:remote` 13/13)
y por comportamiento sobre los datos reales. Detalle en `TEST_RESULTS.md`.

### 4. Variables de entorno requeridas

Ninguna nueva.

### 5. Problemas reales que permanecen

| Problema | Impacto |
|---|---|
| Avisar al personal de **cada** venta puede ser mucho ruido en una rifa grande | El Dueño y el Administrador ya ven todas las ventas en su panel. Se implementó así porque el encargo lo pedía; quitarlo es una línea de `notify_ticket_sold` (D-093) |
| No existe comisión del vendedor padre sobre las ventas de su equipo | Regla comercial **sin definir** por el dueño. La arquitectura queda lista; no se implementó nada |
| Reasignar una boleta vendida sigue siendo imposible | Es del esquema, no de esta funcionalidad (nota de BR-G07). Si el negocio lo necesita, exige rediseñar la relación cliente–vendedor |

### 6. Qué debe revisar el siguiente agente

1. **`tickets_select` no se amplió, y es deliberado** (D-092). Si alguien la abre, media docena de pantallas del vendedor cambian de significado en silencio. La prueba `E1-10` existe para avisarlo.
2. **El dinero no se acumula sumando eventos** (D-094): `recalc_seller_commission` recuenta. No escribas en el ledger a mano.
3. Las tres migraciones **ya están en producción** (2026-08-13). Cualquier corrección sobre ellas exige una migración nueva: son inmutables.

---

## Mantenimiento post-9 — Corregir a un integrante pendiente ✅

**2026-08-14.** Encargo del dueño del producto (`Equipo.txt`, segunda entrega). Mantenimiento
autorizado, sin etiqueta `fase-N` (§34.2). Decisión **D-097**, reglas **BR-E14..BR-E19**.

### 1. Funcionalidades implementadas

| Bloque | Qué quedó |
|---|---|
| **Estado de la cuenta** | `profiles.activated_at` distingue **«Invitación pendiente»** de **«Cuenta activa»**. Lo marca la aplicación al definir la contraseña o al entrar con contraseña; **abrir el correo no activa nada** (BR-E14). Nada que ver con `is_active`, que sigue significando «le quitaron el acceso» |
| **Etiqueta única** | `AccountStatusBadge` sustituye a `ActiveBadge` en todas las pantallas de personas —equipo, vendedores y usuarios—, para que dos pantallas no se contradigan. Textos en `constants.ts`, como las otras ocho |
| **Corregir datos** | El vendedor padre corrige nombre, alias y celular de los integrantes de **su** equipo, siempre. Por función (`team_update_member`), no por política: `authenticated` tiene UPDATE sobre todas las columnas de `profiles` |
| **Corregir el correo** | Solo mientras la invitación siga pendiente. Cambia en Auth, se reenvía la invitación —lo que **invalida la anterior**, garantía del propio Auth— y se anota en la bitácora. Si el envío falla, el correo vuelve al anterior (BR-E16) |
| **Eliminar el alta** | Solo si nunca se activó y no tiene boletas, clientes ni pagos. Borra la membresía y la cuenta de Auth; el perfil y cualquier invitación pendiente se van en cascada (BR-E17, BR-E18). A quien ya entró se le **desactiva**, y eso sigue siendo del personal |
| **En pantalla** | Aviso ámbar en el detalle del integrante pendiente, «Editar datos» y «Eliminar vendedor» según el estado, correo de solo lectura tras activar, y advertencia en el momento en que el correo deja de ser el de siempre |

### 2. Pruebas ejecutadas

Detalle, con los seis errores encontrados y corregidos y las dos sondas previas al diseño, en
[`TEST_RESULTS.md`](TEST_RESULTS.md) § «Corregir a un integrante pendiente».

| Comando | Resultado |
|---|---|
| `npm run test:db` | ✅ **457/457** (22 nuevas) sobre base recién sembrada. Repetirlo sin `db:reset` es intermitente por I-057, previo a este trabajo |
| `npm run verify` | ✅ typecheck · lint 0 errores · **309/309** unitarias (10 nuevas) · build |
| `npx playwright test` | ✅ **246/246** (3 nuevas) tras `db:reset` + `seed:local` |

### 3. Migraciones que existen

| Migración | Qué hace |
|---|---|
| `0026_team_member_lifecycle.sql` | `profiles.activated_at` con su backfill e índice parcial; `mark_profile_activated()`; `handle_new_auth_user` estampa la activación cuando la cuenta nace con contraseña; `team_member_guard()` (interna) y las tres funciones del vendedor padre: `team_update_member`, `team_confirm_email_change` y `team_delete_member` |

✅ **Promovida al proyecto real el 2026-08-14**, con autorización explícita y respaldo previo en
`Rifas-backups/2026-08-14-pre-0026/`. Verificada por catálogo (`verify:remote` 13/13) y por una sonda
de solo lectura sobre los datos reales: columna, backfill, privilegios de las cuatro funciones e
índice. Detalle en `TEST_RESULTS.md`.

### 4. Variables de entorno requeridas

Ninguna nueva.

### 5. Problemas reales que permanecen

| Problema | Impacto |
|---|---|
| **I-057** — `test:db` falla de forma intermitente al repetirlo sobre la misma base | Preexistente y reproducido sin la suite nueva: dos suites mueven el precio de la rifa compartida y `randomNumbers()` acaba chocando. La primera pasada tras `db:reset && seed:local` siempre fue verde |
| **I-058** — el CSV de vendedores conserva «Activo» | Cosmético. Incluir «Invitación pendiente» exige devolver `activated_at` desde las funciones de reporte |
| Quien abre el enlace y **no** define contraseña sigue contando como pendiente | Es lo que pidió el encargo, y significa que su vendedor padre podría corregirle el correo mientras esa persona tiene una sesión abierta. Ventana estrecha y sin pérdida de datos; la carrera con la activación sí está cerrada (BD E2-15) |
| El portal administrativo **no** gana «eliminar» ni «cambiar correo» | Alcance deliberado: el encargo era el flujo del vendedor padre. El personal conserva exactamente lo que tenía (BR-E08) |

### 6. Qué debe revisar el siguiente agente

1. **`0026` ya está en producción** (2026-08-14). Es inmutable: cualquier corrección exige una migración nueva.
2. **«Activada» no se puede deducir de `auth.users`** (D-097). GoTrue escribe un hash aleatorio en `encrypted_password` con solo abrir el enlace de la invitación; la prueba `E2-02` existe para que nadie vuelva a intentarlo.
3. **Que no queden dos invitaciones válidas lo garantiza Auth**, al reinvitar a una cuenta sin confirmar (`sendInvitation`). La prueba `E2-10` recorre el camino entero: si una versión futura de GoTrue deja de rotar el token, falla ahí y no en producción.
4. Las tres funciones del equipo son **funciones y no políticas** a propósito: `authenticated` tiene UPDATE sobre todas las columnas de `profiles`. La prueba `E2-08` comprueba que esa puerta sigue cerrada.

---

## Mantenimiento post-9 — precio de la boleta a $120.000 (2026-08-15)

### 1. Funcionalidades implementadas

- **El precio de la boleta pasa de `$100.000` a `$120.000`** en toda la aplicación (D-098, BR-P01).
  No fue una subida de precio sino la corrección de un dato que nunca fue correcto, y esa distinción
  decide el tratamiento: se arrastra también el `sale_price` de las boletas ya vendidas de la rifa
  afectada, cosa que una subida real **no** haría (BR-P04).
- **Los movimientos de dinero quedan intactos** (BR-P07). La migración no contiene ni un `UPDATE`
  sobre `payments` ni sobre `payment_allocations`. Una boleta con `$100.000` abonados sobre un precio
  corregido de `$120.000` queda **Abonada con `$20.000` pendientes**, nunca Pagada.
- **Sin capa de precio nueva.** La fuente sigue siendo `raffles.ticket_price`; la base la copia a
  `tickets.sale_price` al vender y calcula saldos y estados en SQL. La aplicación conserva una sola
  constante, `DEFAULT_TICKET_PRICE`, que solo rellena el formulario de una rifa nueva.
- **Se documentó que no existen descuentos** (BR-P08): se buscaron expresamente y no hay ninguno, así
  que `sale_price` **es** el importe que debe el cliente y no hace falta un «precio efectivo» aparte.

### 2. Pruebas ejecutadas y resultados

**471** de base de datos ✅ (+14: la suite nueva `price-migration`) · **312** unitarias ✅ (+3) ·
**247** E2E ✅ (+1) · `typecheck`, `lint` y `build` ✅.

Primera pasada: **9 fallos de base de datos y 1 E2E**, todos por cifras de precio escritas a mano en
las pruebas, no por el producto. Detalle completo, causa por causa, en `TEST_RESULTS.md`.

### 3. Migraciones

| Migración | Qué hace |
|---|---|
| `0027_ticket_price_120000.sql` | Pone `DEFAULT 120000` en `raffles.ticket_price` y `organizations.default_ticket_price`; corrige a `120000` las rifas en operación que valían `100000` y el `sale_price` de sus boletas no anuladas que valían exactamente `100000`; informa por `NOTICE` de todo lo que deja fuera; se niega a correr si encuentra un pago por encima del precio corregido |

Las **26** anteriores siguen sin cambios (son inmutables).

### 4. Variables de entorno

Sin cambios.

### 5. Problemas reales que permanecen

| Asunto | Impacto |
|---|---|
| Ninguno abierto de este trabajo | `0027` se aplicó al proyecto real y el código se desplegó el mismo día (2026-08-15), con CI 2/2 y despliegue verificado por SHA. Queda solo la comprobación visual con sesión real, que un agente no puede hacer |
| `organizations.default_ticket_price` no la lee ningún código | Configuración inerte. `DATA_MODEL` afirmaba que el formulario tomaba de ahí su valor y era falso: se corrigió la documentación, no el comportamiento |
| Sin migración inversa | Deliberado: bajar el precio después de que existan cobros a `$120.000` rompería invariantes o dejaría boletas «Pagadas» que no lo están. La vuelta atrás es restaurar (`RUNBOOK.md` §5.4) |
| **I-059** — limpiar pagos por PostgREST falla en silencio | Encontrado aquí y **corregido en la suite nueva**. `commissions.test.ts` y `commission-modes.test.ts` conservan el patrón y acumulan pagos y boletas en la rifa del seed en cada pasada: es lo que degrada `test:db` al repetirlo. No se tocaron, por alcance |
| **I-060** — `ticket-search` elige la rifa con un `limit 1` sin orden | Puede insertar en una rifa y buscar en otra cuando la base acumula boletas. No es un defecto de `search_tickets`. No se corrigió, por alcance |

### 6. Qué debe revisar el siguiente agente

1. **No escribas cifras de precio en el código ni en las pruebas.** Léelas de `raffles.ticket_price`
   (o de `sale_price`). Once pruebas correctas fallaron por hacerlo, y ese es el coste de repetirlo.
2. **Cambiar el precio de una rifa mueve comisiones** (BR-G15, D-096): a quien cobra «la mitad» le
   sube la tarifa con ajuste retroactivo, y una boleta que deja de estar Pagada deja de contar. Lo
   recalculan los triggers; no se escribe en el ledger a mano.
3. **La prueba de la migración lee el bloque `do $$` del propio `.sql`** y lo ejecuta en una
   transacción que revierte. Si la conviertes en una copia del SQL dejará de probar la migración; si
   le quitas el `rollback`, pisará las rifas a `$100.000` de otras suites.
4. **La columna «Abono» del importador sigue sin empezarse**, por indicación expresa del encargo.

---

## Mantenimiento post-9 — el vendedor puede rebajar el precio (2026-08-17)

Encargo `PriceChangeSeller.txt`. Decisión **D-099**; reglas **BR-P09..BR-P12** y **BR-G17..BR-G19**.
**Desplegado en producción el 2026-08-17** con autorización expresa (`0028` + commit `01df211`).

### 1. Funcionalidades implementadas

- Al vender una boleta, el vendedor puede **rebajar el precio** por debajo del de la rifa. La casilla
  llega precargada con el precio oficial: quien no quiera rebajar nada no toca nada.
- El cliente debe **lo rebajado**. Saldo, estado de pago y tope de sobrepago ya se calculaban contra
  `sale_price`, así que no hizo falta cambiarlos: una boleta vendida en `$100.000` queda **Pagada**
  con `$100.000`.
- La rebaja **la asume entera la ganancia del vendedor**. Lo que le queda a la empresa —`precio
  oficial − tarifa`— no cambia nunca.
- **Límite inferior**: no se puede rebajar más de lo que la comisión puede absorber. Se valida en la
  pantalla, en la Server Action y en la base de datos, con la fila bloqueada.
- El detalle de la boleta explica un precio distinto al de la rifa; una venta normal **no** menciona
  la rebaja.
- La venta múltiple ofrece la casilla solo si todas las boletas comparten precio y límite.

### 2. Pruebas ejecutadas y resultados

**490** de base de datos ✅ (+19: la suite nueva `sale-discount`) · **316** unitarias ✅ (+4) ·
**4** E2E nuevas (`precio-rebajado`) ✅ · `typecheck`, `lint` y `build` ✅.

Errores encontrados y corregidos durante el trabajo:

| # | Error | Corrección |
|---|---|---|
| 1 | `create or replace view` sobre `v_ticket_balances` habría fallado: las columnas nuevas iban en medio y faltaban dos del final | Se retiró el cambio de vista entero: ningún consumidor lo necesitaba y el detalle lee de `tickets` |
| 2 | El `afterAll` de la suite nueva no borraba el cliente que crea la prueba del importador, y la membresía quedaba sin poder borrarse | Se borra por **vendedor**, no por una lista de clientes fijada de antemano |
| 3 | El pago del CASO F lo intentaba un vendedor ajeno al cliente y fallaba en silencio: la boleta nunca quedaba pagada y la aserción medía cero | Lo registra el Dueño, y ahora se comprueba el error del pago |
| 4 | Las cuentas de la suite no se podían borrar: son actores de `audit_logs` (FK, BR-D02) | El alta es idempotente y se borra la **membresía**, no la cuenta. La auditoría no se toca |
| 5 | Vocabulario inconsistente entre capas: la base de datos decía «descuento» y la interfaz «rebaja» | Unificado en **rebaja**, y añadido al glosario del Anexo A |
| 6 | **El botón de confirmar del modal de venta múltiple quedaba fuera de la pantalla**: el campo nuevo lo empujó por encima del alto de la ventana y `DialogContent` no tiene techo ni scroll. Afectaba a la persona, no solo a la prueba | `max-h-[calc(100dvh-2rem)] overflow-y-auto` en los dos modales de asignación. El componente compartido sigue sin techo: **cualquier otro diálogo al que se le añada un campo puede repetirlo** |

### 3. Migraciones

| Migración | Qué hace |
|---|---|
| `0028_ticket_sale_discount.sql` | Añade `tickets.base_price` (nullable) y el `CHECK sale_price <= base_price`; añade el valor `discount` al enum `commission_movement`; crea `format_cop`, `commission_floor_rate` y `ticket_sale_price_limits`; recrea `assign_ticket_row` y `bulk_assign_tickets` con `p_sale_price` opcional; hace que `recalc_seller_commission` reste las rebajas con suelo en cero; amplía `ticket_bulk_eligibility` con los dos límites |

Las **27** anteriores siguen sin cambios (son inmutables).

**Comprobado en producción antes y después de aplicarla, que es lo que importaba:** la comisión viva
(1 boleta, `$60.000`, `$60.000`), el ledger (1 fila `sale +60.000`), los 3 pagos y el reparto de
boletas (1 Pagada · 2 Abonadas · 55 Sin pagar) quedaron **idénticos**. `base_price` nació con **0**
filas no nulas.

**No hay backfill ni recálculo**, y es deliberado: al instalarla no existe ninguna rebaja, así que
nadie cobra un peso distinto. Además `alter type ... add value` deja el valor nuevo inutilizable
hasta que la transacción confirma, de modo que un bucle de recálculo aquí habría reventado.

### 4. Variables de entorno

Sin cambios.

### 5. Problemas reales que permanecen

| Asunto | Impacto |
|---|---|
| Ninguno abierto de este trabajo | `0028` se aplicó al proyecto real y el código se desplegó el mismo día (2026-08-17). Queda la comprobación visual con sesión real, que un agente no puede hacer |
| Sin migración inversa | Deliberado: deshacerlo con boletas ya vendidas rebajadas obligaría a decidir qué precio pasan a deber esos clientes. Cerrar solo la **entrada** de rebajas nuevas sí es trivial (dejar de enviar `p_sale_price`) |
| **La ganancia de una venta pasada sigue siendo recalculable** (sección 19 del encargo) | Reportado, **no corregido**: no hay snapshot de la tarifa y BR-G15 establece a propósito que cambiar el precio de la rifa cambia lo ya devengado. Es decisión del dueño (D-094, D-096). Lo único congelado por este trabajo es la rebaja |
| **I-059** e **I-060** | Siguen abiertos: fuera del alcance de este encargo |

### 6. Qué debe revisar el siguiente agente

1. **La rebaja es `base_price − sale_price`, nunca `raffles.ticket_price − sale_price`.** El precio de
   la rifa cambia, y ya cambió una vez (`0027`).
2. **El tope de rebaja es la tarifa mínima garantizada**, no la vigente: la tarifa por tramos baja
   sola al anularse un pago (BR-G06).
3. **La línea de rebaja del ledger se calcula por resto.** Es lo que mantiene `sum(ledger) = earned`
   por construcción; no la conviertas en «diferencia de rebajas».
4. **No escribas cifras de precio** en el código ni en las pruebas (sigue vigente de D-098).
5. **La columna «Abono» del importador sigue sin empezarse**, por indicación expresa del encargo
   anterior.

---

## Mantenimiento post-9 — el alto de los diálogos, resuelto en el componente (2026-08-17)

Continuación pedida por el dueño tras ver el defecto que destapó D-099.

### 1. Funcionalidades implementadas

No hay funcionalidad nueva: se cierra una clase entera de defecto. `DialogContent` acota su alto a
`calc(100dvh - 2rem)` y desplaza su contenido, así que **ningún diálogo puede volver a dejar sus
botones fuera de la pantalla**.

Se retiran los tres parches locales que existían para lo mismo —`BulkAssignDialog`,
`AssignTicketDialog` y `TicketImportDialog`, este último con un límite distinto (`max-h-[90dvh]`)
desde antes—. Un solo límite para un solo problema.

Un diálogo puede seguir imponiendo el suyo: `cn` usa `tailwind-merge` y la clase de quien llama gana.

### 2. Pruebas ejecutadas y resultados

Suite nueva **`tests/e2e/dialogos-alcanzables.spec.ts`**: cuatro diálogos (venta de una boleta, venta
múltiple, alta de vendedor e importación) × **dos tamaños de ventana** — 1280×720 y **390×620**, corta
a propósito porque el defecto depende del alto—. Ocho pruebas.

No comprueba que el diálogo sea bajo, sino que **su última acción se alcanza**: `scrollIntoViewIfNeeded()`
y luego `toBeInViewport()`. En el diseño roto no había a dónde desplazar, y ahí está la diferencia.

**Se comprobó que la prueba falla sin el arreglo**, que es lo único que demuestra que protege algo:
al retirar la clase del componente, 2 de las 8 se cayeron; restaurada, 8/8. Una prueba de regresión
que pasa en los dos casos no vigila nada.

`verify` en verde (316 unitarias) · E2E completas.

### 3. Migraciones

No aplica.

### 4. Variables de entorno

Sin cambios.

### 5. Problemas reales que permanecen

| Asunto | Impacto |
|---|---|
| El botón de cerrar (la X) se desplaza con el contenido | En un diálogo muy alto deja de verse al bajar. No atrapa a nadie: `Esc`, el botón «Cancelar» —que esta aplicación pone siempre (Anexo C)— y pulsar fuera siguen cerrando |

### 6. Qué debe revisar el siguiente agente

1. **No vuelvas a poner `max-h` + `overflow-y-auto` en un diálogo concreto.** Ya lo trae el
   componente; repetirlo esconde el comportamiento compartido y multiplica los límites.
2. Si un diálogo nuevo necesita otro alto, pásale solo su `max-h-*`.

---

## Mantenimiento post-9 — buscar boletas por el cliente, y llegar a su ficha (2026-08-21)

Encargo del dueño: reducir pasos en «Boletas» y conectar Boleta ↔ Cliente.
Decisiones **D-100** y **D-101**; regla **BR-N13**. **Todavía NO desplegado.**

### 1. Funcionalidades implementadas

- **Un solo buscador en «Boletas», que ahora también encuentra por el cliente.** De 1 a 4 dígitos
  siguen siendo los números de la boleta (BR-N11, sin un solo cambio); cualquier otro texto busca el
  cliente que la tiene. No hay pestañas, ni un segundo campo, ni un selector «buscar por…».
- El resultado **sigue siendo una lista de boletas**: dos números, cliente, estado, pago y precio, y
  tocar una abre **esa** boleta. Un cliente con varias boletas devuelve todas, no una ficha suya.
- **Relevancia del nombre**: exacto → empieza → una de sus palabras empieza → el resto. Las boletas
  de una misma persona salen juntas y por número.
- Funciona en los **dos portales**, con los permisos de cada uno y sin ninguna regla nueva.
- **El cliente del detalle de una boleta es una fila pulsable entera** (rótulo, nombre, teléfono y
  flecha `›`) que lleva a la ficha de cliente **que ya existía**. Una boleta sin vender pinta el
  mismo hueco sin enlace ni flecha.
- Volver desde la ficha regresa a la boleta, y otra vez a la lista **con su búsqueda y sus filtros**.
  No hizo falta código: `BackButton` (D-089) ya usaba el historial real.

### 2. Pruebas ejecutadas y resultados

**512** de base de datos ✅ (+22: `ticket-search-client` nueva, 21, y una reescrita en
`ticket-search`) · **320** unitarias ✅ (+4) · **15** E2E nuevas (`boleta-cliente`) ✅ ·
`typecheck`, `lint` y `build` ✅. La suite de base de datos aguanta **dos pasadas seguidas** sobre la
misma base.

Errores encontrados y corregidos durante el trabajo:

| # | Error | Corrección |
|---|---|---|
| 1 | La prueba «más de cuatro cifras no devuelve nada» empezó a fallar: `12345` sí encuentra al cliente cuyo **teléfono** contiene esas cifras, porque `clients.search_text` incluye el teléfono | Es comportamiento correcto y deseado (mismo criterio que el buscador de «Clientes», BR-C08). Se corrigió **la prueba y el texto de la pantalla**, no la consulta: la pista del campo ahora dice «Con más cifras buscamos el teléfono del cliente» |
| 2 | Tres pruebas del código interno afirmaban «devuelve cero filas», algo que dejó de describir la regla al aceptarse texto | Reescritas para afirmar lo que de verdad importa y no depende de qué datos haya: **escribir el código de una boleta NO lleva a esa boleta** |
| 3 | La nueva regla se numeró primero como BR-N12, que ya estaba tomada por la importación CSV/JSON | Renumerada a **BR-N13** en las 15 referencias de código, pruebas y migración |

### 3. Migraciones

| Migración | Qué hace |
|---|---|
| `0029_ticket_search_by_client.sql` | `create or replace` de `search_tickets`: la rama de números queda **idéntica** a `0018` y se añade una segunda rama que cruza `tickets` con `clients` por `search_text` y ordena por relevancia del nombre. No crea ni borra ningún objeto, no cambia la firma ni las columnas devueltas, y por tanto **conserva los privilegios** y no obliga a regenerar tipos |

Las **28** anteriores siguen sin cambios (son inmutables).

**No se creó ningún índice**, y se comprobó con `explain (analyze)` antes de decidirlo, sobre una base
inflada a **5.006 clientes y 20.033 boletas** dentro de una transacción revertida:

| Búsqueda | Plan | Tiempo |
|---|---|---|
| Nombre que encuentra 444 boletas de 111 clientes | `Nested Loop` → `clients` → **`Index Scan using tickets_client_idx`** | **1,4 ms** |
| Término que encuentra las 20.000 boletas (peor caso) | El mismo, más el recuento exacto de `count(*) over ()` | 181–229 ms |

La tabla grande se alcanza **siempre por índice**. `clients` se recorre entero a 5.000 filas porque el
planificador lo considera más barato que su índice de trigramas —es la tabla pequeña—; el índice de
`0017` sigue ahí para cuando deje de serlo. El peor caso es el coste del total exacto de la
paginación, idéntico al que ya tenía la búsqueda por número.

### 4. Variables de entorno

Sin cambios.

### 5. Problemas reales que permanecen

| Asunto | Impacto |
|---|---|
| **`0029` no está en el proyecto real** | Local sí, producción no. Hasta que se aplique, buscar por nombre en producción devolverá cero resultados: el código llama a la función nueva y la vieja descarta el texto. **Migración y despliegue van juntos** |
| Un término de 2 caracteres no usa el índice de trigramas de `clients` | Limitación conocida y heredada de `0017`/`0018`: con dos caracteres no se puede extraer un trigrama completo. Afecta a la tabla pequeña, y el mínimo de la pantalla son 2 |
| El teléfono con separadores no es simétrico desde «Boletas» | El término se compara tal cual contra `search_text`, que guarda el teléfono con y sin separadores; no se aplica la reducción a número nacional que sí hace «Clientes» (`searchNeedle`, I-039). Buscar por nombre —que es la regla— no se ve afectado |
| **I-059** e **I-060** | Siguen abiertos: fuera del alcance. La suite nueva es **inmune a I-060** porque afirma solo sobre los clientes que ella misma crea, no sobre una rifa concreta |

### 6. Qué debe revisar el siguiente agente

1. **La rama de números de `search_tickets` es intocable sin motivo.** Se dejó byte a byte como en
   `0018` justamente para que ampliar la búsqueda no pudiera cambiar un resultado antiguo; sus
   pruebas (`tests/db/ticket-search.test.ts`) son la red que lo demuestra.
2. **No añadas columnas al retorno de `search_tickets` a la ligera.** Cambiar las columnas obliga a
   `drop function` + `create` en vez de un `create or replace`, y con ello a rehacer privilegios y
   tipos generados. Por eso el teléfono del cliente se pide con un segundo alias en `getTicketDetail`
   y **no** viaja en `TicketListItem`.
3. **Los permisos se heredan, no se filtran.** `search_tickets` es `security invoker`; no le añadas
   filtros «de seguridad» por `seller_id`: los que tiene son de usabilidad, y la protección real son
   `tickets_select` y `clients_select`.
4. **Un mismo mensaje no se escribe dos veces.** Las pistas del buscador viven todas en
   `src/features/search/hints.ts`, y la ficha de cliente enlazable en `ClientLinkCard`.
