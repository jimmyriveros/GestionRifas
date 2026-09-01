# ESTADO DE LAS FASES

Estado del producto y registro de lo entregado por fase. El relevo del último agente, el arranque y
las advertencias operativas viven en [`HANDOFF.md`](HANDOFF.md); no se duplican aquí.

- **Actualizado:** 2026-09-01 (D-157, observación del ciclo real, etapa 6/6; **auditoría de solo lectura**)
- **Estado global:** plan de 10 fases completado; mantenimiento posterior en curso.
  Cabecera contextual (D-150): el título, la flecha y un CTA suben a la cabecera
  fija de `AppShell` cuando el `PageHeader` sale de la vista. Sin migración.
  **Ya en producción** (`d102108`).
  Etapas 1 a 6 de resultados oficiales de loterías: contrato, adaptadores, sync, Panel,
  Route Handler y programador de producción (`0036`–`0039`, D-140..D-149).
- **Fase siguiente:** ninguna autorizada
- **Estado del programador (2026-09-01, D-156):** `0041` **aplicada** al proyecto real, `145feab`
  **desplegado** y los diez cron **reactivados**. El **primer tick autorizado** entró a las 19:30 UTC
  y dejó **312 programaciones** oficiales de CNJSA y **3 resultados confirmados**; el cerrojo se tomó
  y se liberó. Ya no quedan cambios sin desplegar. **Observado el 2026-09-01 (D-157):** producción
  corre `f9c6e49`, los diez cron siguen activos y sin duplicar, y los tres números guardados coinciden
  con lo que publican hoy sus fuentes. **Lo que falta por demostrar es que un cron dispare el ciclo
  solo**: `lottery_sync_runs` sigue en **7 corridas**, las del tick manual, porque los jobs se
  reactivaron después de las ventanas diurnas. El primero natural es a las **22:20 Bogotá**.
- **Aviso operativo:** de las seis loterías, **tres se confirman solas** en producción —Cruz Roja,
  Medellín y Boyacá, con sus números leídos por el primer tick real— y **tres se revisan a mano**:
  **Cundinamarca** (**I-086**, actas escaneadas), **Bogotá** (**I-087**, Cloudflare y Turnstile) y,
  desde el 2026-09-01, el **Meta** (**I-091**): responde a Colombia pero **bloquea a la IP de
  Vercel**. D-154 lo había dado por automatizable midiéndolo desde el equipo del dueño; desde el
  servidor no lo es. Ninguno de los tres se elude.
- **Aviso operativo:** el adaptador del **Meta** publicaba un número mayor **inventado**
  (**I-088**, corregido en D-154). No llegó a producción. Si tocas `parse/results.ts`, lee antes
  `ARCHITECTURE` §8.19.c: la lectura anclada y el largo exacto de la tirada de dígitos son lo que
  impide que vuelva.
- **Aviso operativo:** producción **sigue siendo el seed de desarrollo** — dos organizaciones y
  cuatro cuentas `@demo.test` que pueden iniciar sesión (**I-077**, abierto el 2026-08-27). Decidirlo
  es condición previa a que entren vendedores reales

## Resumen de fases y mantenimiento

| Clasificación | Estado actual |
|---|---|
| **Completada** | Fases 0 a 9, y el mantenimiento posterior: equipos, avisos y comisiones (2026-08-12), dos formas de pago (2026-08-13), corregir a un integrante pendiente (2026-08-14), el precio de la boleta a $120.000 (2026-08-15), la rebaja del vendedor (2026-08-17), buscar boletas por el cliente (2026-08-21), la auditoría de rendimiento con volumen real y la navegación medida desde el clic (2026-08-22), el **rediseño del detalle de boleta** (2026-08-22), la navegación y las pantallas del teléfono (2026-08-23 y 2026-08-24, D-106 a D-111) , el **rediseño del panel del vendedor** (2026-08-25, D-112), el **rediseño de la ficha del cliente** (2026-08-25, D-113), la **aplicación instalable** con su logo y su ofrecimiento de instalación (2026-08-26, D-115 a D-123), el **dinero fuera de los anillos** y el desbordamiento a 320 px (2026-08-26, D-124 y D-125) y los **tres ajustes de presentación** — el negocio deja de llamarse «Rifas Demo», la flecha de volver se alinea con su título y el detalle de una boleta se titula «Detalle boleta» — (2026-08-27, D-126), el **reparto del equipo** (2026-08-27, D-127), el cierre de **I-078** (2026-08-27, D-128), la **columna «Abono» del importador** (2026-08-27, D-129), **el dinero de cada boleta en la lista** (2026-08-27, D-130), **volver al detalle de la boleta tras registrar un abono** (2026-08-28, D-133), **editar el valor de un abono vigente** (2026-08-28, D-134, **en producción** el 2026-08-29), **volver al origen tras registrar un abono** (2026-08-29, D-135, **en producción** el 2026-08-29) y **las tarjetas de «Mis clientes» en el teléfono** (2026-08-29, D-136, **en producción** el 2026-08-29) y **editar el precio de venta de una boleta asignada** (D-137, BR-P13, migración `0035`, **en producción** el 2026-08-29) y **el rediseño de «Registrar abono» en el teléfono** (D-138, **en producción** el 2026-08-29) y **Fecha ya no tapa Método en ese formulario** (D-139, I-079, **en producción** el 2026-08-29) y **la cabecera contextual al hacer scroll** (D-150, 2026-08-30, **en producción**) y **el reporte «Ventas por fecha» del portal del vendedor** (D-151, BR-T05..BR-T07, migración `0040`, 2026-08-31, **ya en producción**) |
| **En curso** | Loterías, **etapa 6/6 de corrección** (D-157, 2026-09-01): **observación del ciclo real**, de solo lectura. Los tres números guardados coinciden dígito a dígito con lo que publican hoy sus fuentes; las tres bloqueadas fallan por su causa documentada; el Panel enseña lo correcto y no consulta internet. **Pendiente de demostrar: que un cron dispare el ciclo solo** — las 7 corridas siguen siendo las del tick manual. Nuevo: **I-092**. Antes, etapa 5/6 (D-156): promoción a producción. `0041` aplicada, `145feab` desplegado, los 10 cron reactivados y el **primer tick real** entrado: 312 programaciones oficiales y 3 resultados confirmados. Cundinamarca 4818 queda **pendiente** porque su acta es un escaneo, y el **Meta deja de confirmarse solo en producción** (I-091). Antes, etapa 4/6 (D-155): el recuadro pasa a su propio límite de Suspense y el Panel deja de esperarlo —primer byte de 1.628 a 131 ms con la consulta local retrasada 1,5 s—. Sin migración, sin índice nuevo, **sin desplegar**. Antes, etapa 3/6 (D-154): validación real de las seis fuentes oficiales. Cuatro confirmadas contra la fuente y contra el cronograma; tres defectos corregidos, uno de ellos un número mayor **inventado** (I-088). **Sin migración, sin desplegar.** Antes, etapa 2/6 (D-153): Cundinamarca se lee del **acta oficial en PDF** y el verificador de billetes queda retirado. Antes, etapa 1/6 (D-152, `0041`): horizonte de 10 días, tope de 6 descargas por tick, orden determinista y reintentos por sorteo, también **solo local**. Etapas 1 a 6 de construcción entregadas (D-140..D-149); el programador está **activo** desde el 2026-09-01 |
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

| Migración | Qué hace |
|---|---|
| `0033_ticket_import_abono.sql` | La **columna «Abono» del importador** (BR-N14, D-129). `create or replace` de `import_tickets_with_clients` **con la misma firma**: `p_rows` gana una clave opcional `abono` en pesos enteros, se valida contra el `ticket_price` real de la rifa y se registra llamando a **`create_payment`** —la misma función del formulario manual—, un pago por fila con una sola asignación. Devuelve `payments_created` y `payments_total`. Un archivo sin esa clave se comporta **exactamente** como antes |

✅ **`0033` se promovió al proyecto real el 2026-08-27**, con autorización explícita y respaldo previo
en `Rifas-backups/2026-08-27-pre-0033/` (13 tablas con datos, **0** referencias a `auth`, **0**
credenciales). `db push --dry-run` mostró solo `0033`; `db push --yes` la aplicó; `verify:remote`
**14/14**. **Se respetó el orden**: la migración primero y el frontend después, porque sin ella la
clave `abono` se habría ignorado en silencio y las boletas habrían entrado sin sus pagos.

**Comprobado que NO movió ni un peso**, leyendo la misma sonda antes y después: 121 boletas, 58
vendidas, 46 clientes, 3 pagos por $320.000, `paid_amount` 320.000, `sale_price` 6.960.000, comisión
60.000 y 608 filas de bitácora — **idénticos**. Lo único que cambió es la huella de la función
(`9727c72d` → `6c2c499c`, de 9.756 a 12.814 caracteres), que es exactamente lo que hace un
`create or replace`. Detalle en `TEST_RESULTS.md`.

| Migración | Qué hace |
|---|---|
| `0032_internal_function_grants.sql` | **Cierra I-078** (D-128): revoca el privilegio **por defecto** de `execute` para `authenticated` sobre las funciones de `public` —la causa— y revoca explícitamente las **34** funciones internas que lo tenían: los 23 disparadores, el motor de comisión y ayudantes como `write_audit_log` y `notify_profiles`. `service_role` conserva todo. **No toca ni un dato** |

✅ **`0032` se promovió al proyecto real el 2026-08-27**, con autorización explícita y respaldo previo
en `Rifas-backups/2026-08-27-pre-0032/`. `verify:remote` **14/14** con la comprobación nueva; las
funciones internas expuestas pasaron de **34 a 0** y las 26 RPC de la aplicación quedaron intactas.
Comprobado además **asumiendo el rol `authenticated`** con dos usuarios reales y en transacciones
revertidas. Detalle en `TEST_RESULTS.md`.
| `0031_team_commission.sql` | El **reparto del equipo** (D-127): `commission_model` y `fixed_commission_amount` en `memberships`; `team_tickets_paid` y `team_earned` en `seller_commissions`; `team_movement` y `from_seller_id` en `commission_ledger`; `commission_team_earned()`, `team_max_fixed_commission()`, `team_set_commission_model()`; el motor con su segundo bloque y su **cascada al vendedor padre**; `commission_summary()` con `pay_model`. Recalcula lo existente al final |

✅ **`0031` se promovió al proyecto real el 2026-08-27**, con autorización explícita y respaldo previo
en `Rifas-backups/2026-08-27-pre-0031/` (13 tablas con datos, **0** referencias a `auth`, **0**
credenciales). `db push --dry-run` mostró solo `0031`; `db push --yes` la aplicó; `verify:remote`
**13/13**.

**No movió un solo peso, y se comprobó comparando antes y después.** Cambia lo que se le debe a la
gente **de aquí en adelante** (BR-G20), pero en el momento de aplicarla el único equipo de producción
—Juan Hernandez bajo Armando Gordillo— **no tenía ni una boleta cobrada**, así que `team_earned` nació
en cero para todos. La única comisión viva, la de Jaydin Fernando, quedó **idéntica**: 1 boleta,
$60.000, ledger de 1 fila. Detalle en `TEST_RESULTS.md`.

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
Decisiones **D-100** y **D-101**; regla **BR-N13**. **Desplegado en producción el 2026-08-21** con autorización expresa (`0029` + commit `e1b2fe1`).

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
`ticket-search`) · **320** unitarias ✅ (+4) · **15** E2E nuevas (`boleta-cliente`) ✅ · suite E2E completa **274/274** ✅ ·
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
| Ninguno abierto de este trabajo | `0029` se aplicó al proyecto real y el código se desplegó el mismo día (2026-08-21), con el despliegue verificado por SHA. Queda la comprobación visual con sesión real, que un agente no puede hacer |
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

### 7. Promoción a producción (2026-08-21)

Autorizada expresamente por el dueño del producto, con la instrucción de publicar sin esperar a que
terminara la última pasada completa de E2E. Queda dicho aquí porque es parte del registro.

| Paso | Resultado |
|---|---|
| Respaldo lógico previo | `Rifas-backups/2026-08-21-pre-0029/` — 13 tablas con datos, **0** referencias a `auth`, **0** credenciales |
| `db push --dry-run` | Una sola migración: **`0029_ticket_search_by_client.sql`** |
| `db push --yes` | Aplicada |
| `verify:remote` | **13/13** en verde |
| Sonda de comportamiento (solo lectura) | La función es `security invoker`; `authenticated` la ejecuta y **`anon` no**; buscar «Alvaro» devuelve su boleta `0363/4638`; buscar «0000» sigue devolviendo `0000/9999`; un código interno devuelve **0 filas** |
| Vercel | Primero `READY` sobre `df7f1a7` (`dpl_9vkz31LsUvV3SBvG6heJhAxpQzWT`). Ese SHA quedó huérfano al reescribir el historial (punto 2 de abajo), y la reconstrucción dejó el despliegue vigente: **`READY` sobre `16a1b74`** (`dpl_HvXmiCUr1XkEZqa1m5Qphg2WtyCr`), con el alias `gestion-rifas.vercel.app`. **Mismo contenido en los dos** |
| Producción | `/login` en HTTP 200 con sus seis cabeceras de seguridad; `/owner/tickets`, `/seller/tickets` y `/owner/clients` en 307 al login |

**La migración no escribe ni una fila.** Es un `create or replace` del cuerpo de `search_tickets`: no
crea ni borra objetos, no cambia la firma ni las columnas devueltas y por tanto conserva los
privilegios de `0018`. No hacía falta comprobar que no se moviera dinero, porque no hay ninguna
escritura que pudiera moverlo; aun así la sonda posterior confirmó que las dos ramas de búsqueda
responden y que `anon` sigue fuera.

**El orden importó y fue deliberado:** primero la base, después el código. Con `0029` aplicada y el
frontend viejo todavía en línea no cambia nada —el código anterior nunca enviaba texto a la
función—, mientras que al revés la búsqueda por nombre habría devuelto cero resultados sin ningún
error visible (I-061).

**Dos cosas que quedaron pendientes a propósito:**

1. **La pasada completa de E2E se interrumpió** para publicar de inmediato, y se repitió después:
   **274/274 en 13,7 min** sobre una base recién sembrada. Detalle del desvío y de su causa real en
   `TEST_RESULTS.md`.
2. **El asunto del commit de la funcionalidad salió como un `@` suelto**, resto de la sintaxis de
   aquí-documento de PowerShell. Al publicar no se reescribió el historial por un defecto cosmético,
   y menos con un despliegue en vuelo. **Se corrigió después, a petición del dueño**: los tres
   commits cambiaron de SHA (`df7f1a7`→`e1b2fe1`, `ebe797b`→`0ebc3e7`, `5267107`→`463b0ef`), y el
   árbol resultante es **idéntico byte a byte**, comprobado comparando el hash del árbol antes y
   después (`a93b181`). Un cuarto commit, `16a1b74`, actualizó las referencias que quedaron
   colgando. La rama de respaldo se creó para la maniobra y **se borró después**, a petición del
   dueño: los SHA viejos ya no son recuperables, y las menciones que quedan a `df7f1a7` son
   registro de lo que ocurrió, no enlaces vivos.

---

## Mantenimiento post-9 — auditoría de rendimiento y escalabilidad (2026-08-22)

Encargo del dueño: comprobar, **midiendo antes de tocar nada**, que la plataforma seguirá
sintiéndose rápida con cientos de miles de clientes, boletas y abonos; corregir lo que se pueda
corregir sin riesgo y documentar lo que no. Decisiones **D-102** (base de datos) y **D-103**
(aplicación). Problemas abiertos nuevos: **I-062** a **I-065**. **No desplegado**: `0030` está solo
en local.

### 1. Funcionalidades implementadas

No hay funcionalidad nueva **a propósito**: el encargo era de rendimiento y la regla que lo
encabezaba era «performance nunca por delante de la integridad de los datos». Lo que cambió:

- **Seis índices** (`0030`) para los órdenes por defecto que no tenían ninguno: listado de boletas,
  historial de pagos, listado de clientes, «boletas recientes», «ventas recientes» y «clientes
  recientes», más el recuento de comisión que corre en **cada** abono.
- **`v_client_balances`** calcula los saldos con `left join lateral`: el mismo resultado, pero
  agregando 25 clientes en vez de 100.000 para pintar una página.
- **`v_payment_history`** cruza el cliente con `left join`. Es primero una corrección —bajo RLS un
  `join` interno borra el pago entero, no solo el nombre (I-015)— y de paso abarata el conteo.
- **Ninguna pantalla pide dos veces lo mismo** dentro de la misma carga: `listOrgMembers` y la
  lectura de `v_seller_summary` están memoizadas **por petición** con `cache()` de React.
- **`/owner/payments` deja de cargar el panel administrativo entero** para pintar cuatro tarjetas.
- **«Seleccionar todas las que coinciden»** pide una columna en vez de mil filas completas.
- Se corrigió una **inconsistencia latente** del panel: sus diez cifras venían de dos fuentes
  distintas y ahora vienen de una sola (detalle en D-103).

Lo que **no** se tocó, y se comprobó que sigue igual: estados de boleta, precios, precio rebajado,
abonos, saldos, comisiones, ganancias, equipos, permisos, roles, autenticación, importación y
auditoría.

### 2. Pruebas ejecutadas y resultados

**518** de base de datos ✅ (+6: `read-performance` nueva) · **320** unitarias ✅ · suite E2E
completa ✅ · `typecheck`, `lint` y `build` ✅.

Además, y por primera vez en el proyecto, una **medición con volumen real**: 100.005 clientes,
300.033 boletas y 1.000.006 pagos en la base local. Procedimiento, instrumentos y las tablas
completas de antes/después están en `TEST_RESULTS.md`; el resumen es que las cinco pantallas más
usadas pasaron de **0,6–1,4 s** a **0,1–0,3 s** de tiempo de respuesta del servidor.

Errores encontrados durante el trabajo (los cuatro están detallados en `TEST_RESULTS.md`):

| # | Error | Corrección |
|---|---|---|
| 1 | Actualizar `paid_amount` en 200.000 boletas tardaba **más de 12 minutos** | No es un defecto de la aplicación: `payment_status` es una columna generada e indexada, así que ninguna actualización puede ser HOT y hay que reescribir catorce índices por fila, tres GIN. Anotado como **I-065** para futuras migraciones masivas |
| 2 | El primer índice del listado de boletas no sirvió: seguía siendo un barrido | `(organization_id, created_at desc)` no conserva el orden bajo una política que compara contra un conjunto. Se cambió a `(created_at desc)` |
| 3 | El primer índice de «ventas recientes» tampoco | Se cambió a índice **parcial** por `inventory_status` |
| 4 | Un índice de cobertura para el reporte de saldos no mejoró nada | Se descartó en vez de dejarlo «por si acaso» |

### 3. Migraciones

| Migración | Qué hace | Estado |
|---|---|---|
| `0030_read_performance.sql` | Seis índices de lectura; `v_client_balances` con `left join lateral`; `v_payment_history` con `left join` al cliente | ✅ **Aplicada al proyecto real el 2026-08-22** (§7) |

**Es la migración más segura de las últimas.** No escribe ni una fila, no cambia ninguna columna, no
toca privilegios y **desplegar el código sin ella no rompe nada**: las pantallas seguirían tardando
lo que tardaban. Todo lo contrario que `0029` (I-061) o `0027`.

Reversión: la propia migración la documenta al final. Volver atrás no cambia ningún dato ni ningún
permiso; solo devuelve los planes lentos.

### 4. Variables de entorno

Sin cambios.

### 5. Problemas reales que permanecen

| ID | Qué es | A qué volumen empieza a doler |
|---|---|---|
| **I-062** | La búsqueda por texto de clientes no puede usar su índice de trigramas mientras haya RLS (`like`/`ilike` no son *leakproof*). 97 ms con 100.000 fichas | ~1 s con 1.000.000 de clientes. **Necesita decisión del usuario**: las dos salidas tocan seguridad o comportamiento |
| **I-063** | `v_seller_summary` y `v_raffle_summary` agregan la tabla de boletas entera. 160–180 ms con 300.000 | ~500 ms por panel con 1.000.000 de boletas. La salida es una tabla de resumen mantenida por disparadores, como ya hace `seller_commissions` |
| **I-064** | El conteo exacto del historial de pagos recorre la tabla. 231 ms con 1.000.000 | Aceptado a propósito: la alternativa vuelve aproximado el número de páginas |
| **I-065** | Un `update` masivo sobre `tickets` es desproporcionadamente caro por los índices GIN | No afecta a la operación normal; es una precaución para migraciones futuras |

Sigue todo lo anterior: I-021, I-023, I-024 antes de operar con datos reales.

### 6. Qué debe revisar el siguiente agente

1. **`0030` ya está en producción** desde el 2026-08-22 (§7), igual que el código. No queda nada
   pendiente de promover.
2. **No «mejores» los índices de orden añadiéndoles `organization_id` delante.** Es lo primero que
   parece correcto y es justo lo que no funciona; el porqué está en `DATA_MODEL.md` §5 y en D-102.
3. **`cache()` de React memoiza dentro de UNA petición.** No lo conviertas en `unstable_cache` ni le
   pongas `revalidate`: son cifras de dinero y estados de boleta.
4. **Si tocas `v_client_balances` o `v_payment_history`, vuelve a declarar `security_invoker`.**
   `create or replace view` no lo hereda, y perderlo las deja leyendo sin RLS.
   `tests/db/read-performance.test.ts` lo vigila.
5. Antes de dar por buena cualquier optimización futura, **cárgale volumen**: con las treinta
   boletas del seed, las cuatro consultas que motivaron esta migración parecían instantáneas.

### 7. Promoción a producción (2026-08-22)

Autorizada expresamente por el dueño el mismo día. Migración **y** código, en esa orden.

| Paso | Resultado |
|---|---|
| Respaldo previo | `Rifas-backups/2026-08-22-pre-0030/` — 13 tablas con datos, **0** referencias a `auth`, **0** contraseñas (comprobado con `grep`, `RUNBOOK` §5.1) |
| `db push --dry-run` | Mostró **solo** `0030_read_performance.sql` |
| `db push --yes` | Aplicada |
| `verify:remote` | ✅ **13/13**, incluida «Vistas sin security_invoker» |
| Sonda de catálogo (solo lectura) | Los **6 índices** existen con su definición exacta; las **2 vistas** conservan `security_invoker=true`; `schema_migrations` registra `0030` |
| Sonda de equivalencia sobre datos **reales** | `v_client_balances` frente a la formulación anterior: **0 filas distintas** sobre los 46 clientes; `v_payment_history` devuelve **3 = 3** pagos |
| Plan en producción | El listado de boletas ya entra por `Index Scan using tickets_created_at_idx` |
| Código | `d15d386` empujado a `main`; Vercel `READY` (`dpl_8C6NRgGVxUVwe5n7VMsj6dESGjVB`) sobre ese SHA, alias `gestion-rifas.vercel.app` |
| Cabeceras y rutas | `/login` 200 con las seis cabeceras; `/owner/*` y `/seller/*` en 307 al login |
| Pasada con **sesión real** (solo lectura) | Las 9 pantallas del portal administrativo renderizan, **sin un solo error de consola ni respuesta 4xx/5xx**. Clientes: 25 filas, «Mostrando 1–25 de 45». Pagos: los 3 pagos con su cliente y sus boletas. Ficha de cliente: «1 · $120.000 · $0 · $120.000» |

**No se vio ninguna mejora de velocidad en producción, y es lo esperado.** La organización real tiene
hoy **46 clientes, 121 boletas y 3 pagos**: con ese tamaño PostgreSQL elige un barrido secuencial
porque *es* lo más rápido, y así se comprobó en el plan del historial de pagos. `0030` es preventiva:
sus índices empiezan a pagar cuando la tabla crece, que es exactamente cuando ya no se puede parar a
migrar con calma.

**Un error cometido durante esta verificación, y no se oculta.** La primera sonda con sesión real
pulsó «Ingresar» **antes de que React hidratara** —la trampa que el propio `TESTING.md` §5.3
documenta—, así que el formulario cayó a su envío nativo por `GET` y la **contraseña de las cuentas
de demostración viajó en la URL** (`/login?email=…&password=…`) hasta Vercel, donde puede haber
quedado en su registro de accesos. No es una credencial de un cliente real ni da acceso a datos de
terceros, pero es exactamente la superficie que **I-021** ya señalaba. Registrado como **I-066**, con
la recomendación de rotar esa contraseña. La sonda se rehízo esperando la hidratación y bloqueando
cualquier petición que llevara `password=` en la dirección; en la segunda pasada el bloqueo no llegó
a dispararse ni una vez.

---

## Mantenimiento post-9 — la navegación, medida desde el clic (2026-08-22)

Encargo del dueño, después de D-102 y D-103: «en uso real espero ~3 segundos al cambiar de menú, y
eso no es aceptable». Tenía razón, y el fallo era de método: las cifras anteriores medían el
**tiempo de respuesta del servidor**, no lo que espera una persona. Decisión **D-104**. Problema
nuevo: **I-067**. Problema resuelto de rebote: **I-014**. **Ya en producción** (`97e1984`).

### 1. Funcionalidades implementadas

Ninguna: es trabajo de rendimiento, y ninguna regla de negocio cambia. Lo que cambia:

- **Se retiran los catorce `loading.tsx`.** Un fallback de Suspense obliga a React a mantenerlo unos
  300 ms aunque los datos ya estén. El aviso de «se está abriendo» lo da ahora `useLinkStatus` en la
  entrada del menú pulsada, que no crea ningún fallback.
- **Los enlaces de fila de las tablas dejan de precargarse** (`RowLink`). El menú lateral sigue
  precargando: ocho destinos predecibles sí compensan.
- **`listOrgMembers` hace una consulta por pantalla en vez de dos.**
- Tres componentes de esqueleto quedaron huérfanos y se retiran (CLAUDE.md §29).

**Cambio visible que el dueño eligió expresamente:** durante la carga ya no se ve un esqueleto de
tabla, sino la pantalla anterior con la entrada del menú marcada como «abriendo».

### 2. Pruebas ejecutadas y resultados

**320** unitarias ✅ · **518** de base de datos ✅ · `typecheck`, `lint` y `build` ✅ · E2E
**269/274**, y las **5 afectadas 48/48 en aislado**.

De esas cinco, tres eran las inestables ya conocidas. **Dos eran consecuencia real del cambio**:
`security.spec.ts` leía el texto de `main` y, sin `loading.tsx`, la pantalla de «no encontrado» se
pinta con el layout raíz, que no tiene `<main>`. Se comprobó a mano que la aplicación responde
**404** y **500** sin filtrar ninguna firma de PostgreSQL, y el arnés pasa a leer el `body`, que
cubre las dos pantallas y comprueba **más**, no menos.

Errores cometidos durante la propia medición —cuatro, detallados en `TEST_RESULTS.md` §g—: el arnés
tomaba la petición equivocada cuando había precargas en vuelo; los selectores de contenido
coincidían con los enlaces del menú; la capa del recorrido guiado interceptaba los clics; y se
atribuyó el hueco de 250 ms a «render» antes de comprobar que el hilo principal estaba parado.

### 3. Migraciones

Ninguna. Este trabajo no toca la base de datos.

### 4. Variables de entorno

Sin cambios.

### 5. Problemas reales que permanecen

| ID | Qué es | Quién lo resuelve |
|---|---|---|
| **I-067** | El arranque en frío de la función en Vercel: 1.600–5.000 ms tras 45–90 s de inactividad. Es **lo que queda de los 3 segundos** | **El dueño**, activando Fluid Compute en el proyecto de Vercel. No es código y un agente no puede activarlo |
| I-066 | La contraseña de demostración viajó en una URL | El dueño, rotándola |
| I-062 / I-063 | Techos de escala de D-102 | Decisión del dueño |

### 6. Qué debe revisar el siguiente agente

1. **No añadas un `loading.tsx`** sin medir antes: cuesta ~300 ms de espera por el fallback.
2. **No pongas `<Link>` a pelo en una fila de tabla**: usa `RowLink`.
3. Una pantalla de «no encontrado» ahora responde **404** y se pinta **sin menú lateral**. Si
   escribes una prueba sobre ella, lee el `body`, no `main`.
4. **Mide desde el clic, no desde el servidor.** El procedimiento y el arnés están descritos en
   `TEST_RESULTS.md`; un TTFB bueno no significa una navegación buena.

### 7. Fluid Compute y medición final (2026-08-22)

El dueño activó **Fluid Compute** en el proyecto de Vercel al leer el diagnóstico de I-067, y se
redesplegó (`a854e8a`) porque **la opción solo se aplica a despliegues nuevos**.

| Escenario en producción | Antes de todo | Ahora |
|---|---:|---:|
| TTFB tras 45–90 s de pausa | 3.594–4.276 ms | **438–747 ms** (mediana 561) |
| Navegación completa tras 60 s de lectura | 2.900–5.900 ms | **847 ms** (mediana de 6; peor caso 1.357) |
| Navegación encadenada | ~840 ms | **~350 ms** |
| Reacción visual al clic | 33–43 ms | **12–26 ms** |
| Render tras recibir la respuesta | ~300 ms | **14 ms** |

**Ninguna de las seis navegaciones medidas superó los 2 s.** El síntoma que motivó el encargo
—«espero unos 3 segundos al cambiar de menú»— ha desaparecido.

**Dos trampas de medición que costaron tiempo y conviene no repetir:** medir en el minuto siguiente a
un despliegue (todo está frío y las cifras no valen) y medir con ráfagas de peticiones seguidas, que
fuerzan escalado horizontal y fabrican arranques en frío que el uso real no produce. El escenario
que sí informa es «pausa humana + una navegación», repetido varias veces.

**Fluid Compute pasa a ser requisito de despliegue**, no un consejo: `DEPLOYMENT.md` §3.1.b. Si
alguien lo desactiva, los tres segundos vuelven y ningún cambio de código los quitará.

---

## Mantenimiento post-9 — rediseño del detalle de boleta (2026-08-22)

Encargo del dueño: acercar la pantalla **Detalle de boleta** del portal del vendedor a un diseño de
referencia, **sin tocar la lógica**, con el teléfono como prioridad. Decisión **D-105**. Sin
migraciones. **Ya en producción** (`be4a8be`, 2026-08-22).

### 1. Funcionalidades implementadas

Ninguna nueva, y es a propósito: es un cambio de presentación. Lo que cambia:

- **La acción de cobrar sube al encabezado.** «Registrar abono» estaba *debajo* del historial de
  abonos, que es lo último que se lee. Mismo destino (`/seller/payments/new?clientId=…`) y misma
  condición que antes: boleta asignada, con cliente y con saldo pendiente.
- **Cuatro bloques en orden de uso**: identidad (los dos números, precio con su rebaja, fecha y
  cliente) · estado y cobro (estado, estado de pago, anillo de progreso, abonado y pendiente) ·
  abonos de esta boleta · detalles administrativos, al final y en voz baja.
- **El historial de abonos muestra ya «Registrado por» y «Nota»**, que venían en los datos y no se
  enseñaban. En el teléfono cada abono es una tarjeta apilada; desde `lg`, columnas alineadas.
- **Lo administrativo se junta en una sola tarjeta final** (creada, aprobada, asignada, anulada y
  código interno), en lugar de dos tarjetas con el mismo peso visual que el resto.
- **El color solo donde significa algo**: verde lo abonado, ámbar lo pendiente, y ninguno cuando la
  cifra es cero. Los estados siguen siendo los badges con texto de `constants.ts`.

**Lo que se dejó fuera del diseño de referencia a propósito:** «Notas rápidas» y el menú `···` de
cada abono (no existen; un botón que no hace nada es peor que ninguno) y la hora del abono
(`payment_date` es una fecha sin hora).

### 2. Pruebas ejecutadas y resultados

**320** unitarias ✅ · `typecheck`, `lint` y `build` ✅ · E2E **239/239 escritorio** y **35/35
móvil** · capturas a 320, 390, 768, 1024 y 1440 px sin desbordamiento horizontal · **0 errores de
consola**. Tres errores de maquetación encontrados y corregidos durante la propia verificación, y una
trampa de Turbopack que costó un ciclo de capturas: detalle en `TEST_RESULTS.md`.

### 3. Migraciones

Ninguna. La base de datos no se toca: `pending_amount` y el porcentaje se derivan de `sale_price` y
`paid_amount`, que la pantalla ya recibía.

### 4. Variables de entorno

Sin cambios.

### 5. Problemas reales que permanecen

Los de antes (I-066, I-062, I-063 y la columna «Abono» del importador). Este trabajo no abre ninguno
nuevo. Queda **pendiente de decisión** si el detalle de boleta del **portal administrativo** —que
sigue con la rejilla de cuatro columnas— debe recibir la misma disposición.

### 6. Qué debe revisar el siguiente agente

1. El corte de tres columnas es **`xl`, no `lg`**, y el porqué está medido: `ARCHITECTURE.md` §8.7.
2. `TicketPaymentsCard` la comparten los **dos** portales: al tocarla, mira también
   `/owner/tickets/[ticketId]`.
3. El botón dice «Registrar abono» y su `aria-label` es «Registrar un abono de \<cliente\>»; hay
   pruebas que lo buscan por ese nombre.
4. Antes de dibujar otro porcentaje, mira `ProgressRing` y la barra de `CollectionSummaryCard`: el
   porcentaje va **escrito**, nunca solo en el color.

### 7. Promoción a producción (2026-08-22)

Desplegada con autorización expresa del dueño, para verla en Vercel antes de decidir si el portal
administrativo recibe la misma disposición.

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`be4a8be`** (`dpl_vzGmPGBx3X6r8gwyYXgXCKXfVd6J`), *target* producción, alias `gestion-rifas.vercel.app`, región `iad1` |
| CI en GitHub Actions | **2/2** — `verify` (typecheck · lint · 320 unitarias · build) y migraciones desde cero + pruebas de base de datos |
| `/login` | **200**, con las seis cabeceras: CSP por nonce, HSTS `max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy` |
| Rutas protegidas | `/seller/tickets`, `/owner/dashboard` y `/seller/dashboard` → **307** sin sesión |
| Secretos en el navegador | **Ninguna** aparición de `SERVICE_ROLE` en `.next/static` |
| Base de datos | **Sin tocar.** Este cambio no lleva migraciones, así que el orden entre despliegue y base no importaba |

La comprobación visual con sesión real la hace el dueño: no se inician sesiones en producción con
las cuentas de demostración desde aquí, y menos con **I-066** abierto.

---

## Mantenimiento post-9 — la navegación del teléfono baja (2026-08-23)

Encargo del dueño: en móvil, que la aplicación se comporte como una **aplicación nativa** y no como
un escritorio encogido. Decisión **D-106**. Sin migraciones. **Sin desplegar.**

`Route changes: None` · `Business logic changes: None` · `New API calls: None` ·
`New dependencies: None`

### 1. Funcionalidades implementadas

Ninguna nueva, y es a propósito: es un cambio de navegación y presentación.

- **Barra inferior fija en móvil**, con cuatro opciones: **Panel · Boletas · Clientes · Pagos**.
  Sustituye al cajón lateral, que se eliminó. Escritorio conserva su barra lateral intacta, y las dos
  **nunca conviven** (`hidden md:flex` frente a `md:hidden`).
- **Lo que no cabe abajo se lee desde el menú de usuario**, y solo en móvil: **Reportes** en los dos
  portales, más **Rifas, Vendedores y Administradores** en el administrativo y **Mi equipo** en el
  del vendedor. Se extendió el desplegable que ya existía; no hay un segundo menú.
- **Una sola lista de rutas por portal.** Los `navItems` de siempre, con una marca `primary` en
  cuatro entradas: de ahí salen las tres barras.
- **El hueco lo reserva el armazón, una vez**, con `--bottom-nav-height` y `--bottom-nav-space` en
  `globals.css`. Ninguna pantalla añade margen inferior por su cuenta. La barra de selección múltiple
  se ancla a la misma variable y se posa **encima** de la de navegación.
- **Lo activo lo decide la ruta**, con `isNavItemActive` compartida por las dos barras: el detalle de
  una boleta y `/owner/tickets/bulk` siguen siendo «Boletas». En una pantalla que no está en la barra
  no se enciende ninguna opción.
- **El recorrido guiado** dejó de explicar un botón que ya no existe y ahora explica la barra.

### 2. Pruebas ejecutadas y resultados

**325** unitarias ✅ (5 nuevas, `nav-active.test.ts`) · `typecheck`, `lint` y `build` ✅ ·
E2E **44/44 móvil** (9 nuevas en `navegacion-movil.spec.ts`) y **242/242 escritorio** (3 nuevas en
`navegacion.spec.ts`) · **0 errores y 0 avisos de consola** medidos en las 14 rutas de los dos
portales. Comprobados por prueba: cuatro opciones y solo cuatro en los dos portales, la
ruta y la marca de activo de cada una, la barra visible dentro de una ficha de detalle, el final de la
página **por encima** del borde de la barra, y a **320, 375, 390 y 430 px** cero desbordamiento
horizontal con dianas ≥ 44 × 44 px y etiquetas sin cortar.

**Errores encontrados y corregidos durante la verificación** (detalle en `TEST_RESULTS.md`):

1. El indicador de `next dev` se dibuja por defecto **abajo a la izquierda, encima de «Panel»**, y se
   comía el toque. Movido a `top-left` en `next.config.ts`. Solo afecta a desarrollo.
2. Cuatro pruebas de móvil buscaban el botón del cajón lateral, que ya no existe. Reescritas para la
   navegación nueva; ninguna comprobación se perdió.
3. **Ni el fallo de la primera pasada de escritorio ni los 7 anteriores eran del cambio**: los 7
   fueron datos acumulados por correr la suite de móvil antes contra la **misma** base, y el último,
   un `goto` agotando su plazo en una ruta que este trabajo no toca. Confirmado corriendo en aislado.
   Antes de una pasada E2E, `npm run db:reset && npm run seed:local`.

### 3. Migraciones

Ninguna. Este trabajo no toca la base de datos.

### 4. Variables de entorno

Sin cambios.

### 5. Problemas reales que permanecen

Los de antes (I-066, I-062, I-063 y la columna «Abono» del importador). Este trabajo no abre ninguno,
y **no deja nada pendiente de decidir**: el dueño confirmó el 2026-08-23 que «Mi equipo» se queda en
el menú de usuario y no baja a la barra.

`src/components/ui/sheet.tsx` quedó **sin uso** al eliminar el cajón. Se conserva a propósito: es una
primitiva de shadcn/ui, no código del proyecto, y borrarla es una limpieza fuera de alcance.

### 6. Qué debe revisar el siguiente agente

1. `ARCHITECTURE.md` **§8.8** antes de tocar cualquier menú: hay **una sola lista de rutas** por
   portal y basta con marcar `primary`.
2. **No pongas márgenes inferiores pantalla por pantalla.** El hueco sale de `--bottom-nav-space` y lo
   reserva `AppShell`. Si añades otra barra fija abajo, ánclala a esa variable.
3. Si escribes una prueba de móvil, **no copies** el patrón viejo
   `getByRole('button', { name: /menu/i })`: ese botón ya no existe.
4. Las descripciones de la Fase 3 —`IMPLEMENTATION_PLAN.md` §89 y este documento, línea 74— siguen
   diciendo «drawer móvil». Son **fotografías históricas** de aquella fase y se conservan tal cual;
   lo vigente es esta entrada y `ARCHITECTURE.md` §8.8.

### 7. Promoción a producción (2026-08-23)

Desplegada con autorización expresa del dueño. **Sin migraciones**, así que el orden entre despliegue
y base de datos no importaba.

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`79e107b`** (`dpl_JDjCmJxuV69GTAUpwyBMaVwpCUcX`), *target* producción, alias `gestion-rifas.vercel.app`, región `iad1`. Build de 23 s con caché caliente |
| CI en GitHub Actions | **2/2** — `verify` (typecheck · lint · 325 unitarias · build) y migraciones desde cero + pruebas de base de datos |
| `/login` | **200**, con las seis cabeceras: CSP por nonce, HSTS `max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy` |
| Rutas protegidas | `/seller/tickets`, `/owner/dashboard` y `/seller/dashboard` → **307** sin sesión |
| Secretos en el navegador | **0 apariciones** de `SERVICE_ROLE`, `service_role` o `sb_secret` en los 15 fragmentos de JavaScript servidos (981 KB) |
| **El código nuevo está de verdad servido** | La CSS de producción trae `--bottom-nav-height: 3.5rem`, `--bottom-nav-space` con su `env(safe-area-inset-bottom, 0px)`, la anulación a `0px` desde `md`, y las tres clases que **solo** existen en el código nuevo: `height:var(--bottom-nav-height)`, `padding-bottom:env(safe-area-inset-bottom,0px)` y `bottom:var(--bottom-nav-space)`. Tailwind solo emite las clases que encuentra en el código, así que su presencia demuestra que `BottomNav.tsx` entró en el build |
| Base de datos | **Sin tocar** |

**Por qué no se comprobó con sesión real desde aquí:** **I-066** sigue abierto —la contraseña de las
cuentas de demostración pudo quedar registrada— y `HANDOFF` §1.a ya fija que esa comprobación la hace
el dueño. La barra inferior se verificó con sesión real **en local**, con capturas a 320, 390, 430 y
1280 px.

**Latencia comprobada tras desplegar, y un falso positivo que conviene no repetir.** Se midió el
tiempo de respuesta con pausas de 45–90 s para confirmar que **Fluid Compute** seguía haciendo su
trabajo (I-067, requisito de `DEPLOYMENT.md` §3.1.b). Las primeras medidas dieron picos de **3,4 s**
y se interpretaron como arranque en frío. **Era falso.** Desglosando la petición en sus fases sobre
diez ciclos:

| Fase | Resultado |
|---|---|
| Tiempo del **servidor** (`time_starttransfer − time_appconnect`) | **132–265 ms en los 10 ciclos**, incluidos los dos que en total tardaron 3,4 s |
| Establecimiento de **conexión** en los dos ciclos lentos | ~3,1 s, clavado — el reintento del SYN de TCP, cuyo plazo inicial en Windows es ~3 s |

**Fluid Compute está bien y el despliegue está bien.** El error fue leer `time_starttransfer` como si
fuera tiempo de servidor: incluye DNS, TCP y TLS. Lo que tumbó la hipótesis fue el control que la
propia D-104 propone —`/denied`, servido por CDN, **también** sufría el pico, y una función en frío no
puede ralentizar un archivo estático—.

**Regla para la próxima medición en producción:** desglosar siempre
`time_namelookup` / `time_connect` / `time_appconnect` / `time_starttransfer`, y comparar contra
`/denied`. El número agregado no distingue un arranque en frío de un mal camino de red.

### 8. Fluid Compute declarado en el repositorio (2026-08-23)

A raíz de la verificación anterior se vio que un **requisito duro de despliegue** —Fluid Compute,
`DEPLOYMENT.md` §3.1.b— vivía **solo** como interruptor del panel de Vercel: no aparecía en ninguna
revisión de código y apagarlo no dejaba rastro. Se declara en `vercel.json`, con autorización del
dueño.

```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "fluid": true }
```

**Solo `fluid`.** `vercel.json` anula únicamente lo que declara; el formato admite `headers`, pero
las cabeceras de seguridad siguen en `next.config.ts` y la CSP con nonce en `src/proxy.ts`, porque
tenerlas en dos sitios sería peor que en uno.

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`ded4181`** (`dpl_DLMzuufXZyqJig9535s7jhzgA2XF`) — la clave fue aceptada |
| CI | **2/2** |
| Cabeceras tras crear el archivo | **6 de 6** |
| Rutas protegidas | 307 |
| Tiempo de **servidor** en 6 ciclos con pausa de 60 s | **149–254 ms** |

**Lo que debe revisar el siguiente agente:** `vercel.json` es ahora la fuente de Fluid Compute. No le
añadas `headers`, `redirects` ni `rewrites` sin leer antes `DEPLOYMENT.md` §3.1.b: duplicarían lo que
ya hacen `next.config.ts` y `src/proxy.ts`.

---

## Mantenimiento post-9 — «Boletas» en el teléfono deja de ser una tabla (2026-08-23)

Encargo del dueño: en el móvil, la lista de boletas **perdía datos importantes** para caber. Decisión
**D-107**. Sin migraciones. **Desplegado a producción el 2026-08-23** (§7).

`Route changes: None` · `Business logic changes: None` · `New API calls: None` ·
`Query changes: None` · `New dependencies: None`

### 1. Funcionalidades implementadas

Ninguna nueva, y es a propósito: es un cambio de presentación. Lo que cambió es **cuánto se ve**.

- **La lista de boletas del teléfono son tarjetas.** Una por boleta, de **95–115 px**, con los
  **seis** datos: los dos números (`1234 / 5678`), la leyenda «Diario · Semanal», el cliente, el
  precio y las dos insignias de estado. Antes la tabla ocultaba bajo `md` justo **Cliente, Pago y
  Precio**, que es lo que un vendedor mira para saber a quién le cobra y cuánto le falta.
- **Escritorio no cambió.** Misma tabla, mismas columnas, mismo orden. Las dos presentaciones se
  renderizan y el navegador oculta una con `md:hidden` / `hidden md:block`; no lo decide JavaScript,
  así que no parpadea al cargar.
- **Una sola fuente de datos.** `listTickets()` → `TicketListItem[]` → las dos. Ninguna consulta
  nueva, ningún efecto, ninguna petición por tarjeta: **no hay N+1**.
- **Los filtros del móvil caben en un botón.** El buscador sigue siempre visible; los desplegables se
  guardan detrás de **«Filtros (n)»**, que dice cuántos hay puestos, y se abren en una hoja inferior
  (`ui/sheet.tsx`, la primitiva que D-106 dejó sin uso). «Limpiar filtros» cierra la hoja.
- **La selección múltiple es la de siempre**, con el mismo contexto y los mismos módulos:
  `row-activation.ts` y `useLongPress`. Toda la tarjeta abre el detalle; en modo selección marca, y
  entonces la flecha desaparece. La casilla de «toda esta página» se conserva en una barra propia
  sobre la lista.
- **Alcance:** las cuatro pantallas que listan boletas —los dos listados, «Ver seleccionadas» y las
  boletas de la ficha de un cliente—. `TicketsTable` no se llama ya desde ninguna pantalla.

### 2. Pruebas ejecutadas y resultados

**325/325** unitarias ✅ (ninguna nueva: no hay lógica nueva que probar) · `typecheck` y `lint` ✅ ·
E2E **49/49 móvil** (5 nuevas en `boletas-movil.spec.ts`) y **242/242 escritorio**, con
`db:reset` + `seed:local` antes de la pasada.

Comprobado además en el navegador, a **320 y 375 px**: alto de tarjeta **95–115 px**,
`scrollWidth == clientWidth` (cero desbordamiento horizontal), nada dentro de una tarjeta pasa de
**291 px** con viewport de 320, un nombre de **56 caracteres** se recorta sin estirar la tarjeta, la
paginación termina **por encima** de la barra inferior, y cargar 25 boletas produce **una** navegación
y **ninguna** petición por tarjeta. **0 errores de consola.**

**Errores encontrados y corregidos durante la verificación** (detalle en `TEST_RESULTS.md`):

1. **La casilla de «toda esta página» se había perdido.** En la tabla la pone el encabezado, y en el
   teléfono aparecía al entrar en modo selección; la lista de tarjetas no la tenía. Con ella se
   perdía también la oferta «Seleccionar las N boletas del filtro», que solo se ofrece cuando la
   página está completa. Añadida a `TicketCardList` con el mismo `togglePage`.
2. **El paso «tus boletas» del recorrido guiado habría desaparecido en silencio.** `usableSteps`
   descarta lo que mida 0 × 0 px, y con dos presentaciones una siempre está oculta. La marca
   `data-tour="data-table"` se puso en el **envoltorio**, que siempre mide lo que se ve.
3. **«Limpiar filtros» dejaba la hoja abierta** encima de la lista que se acababa de destapar. Ahora
   cierra.
4. Tres pruebas de móvil buscaban `columnheader` o `getByRole('row')`, que en el teléfono ya no
   existen. Reescritas por `list` / `listitem`; ninguna comprobación se perdió.

### 3. Migraciones

Ninguna. Este trabajo no toca la base de datos.

### 4. Variables de entorno

Sin cambios.

### 5. Problemas reales que permanecen

Los de antes (I-066, I-062, I-063 y la columna «Abono» del importador). Este trabajo no abre ninguno.

Queda **a criterio del dueño** si la ficha de un cliente debería dejar de repetir su propio nombre en
cada tarjeta. Hoy lo repite porque la tabla de escritorio también lo hace, y quitarlo solo en el
teléfono habría dado dos listas distintas de lo mismo.

### 6. Qué debe revisar el siguiente agente

1. `ARCHITECTURE.md` **§8.9** antes de tocar la lista de boletas: hay **una** consulta y **dos**
   presentaciones, y `TicketsTable` ya no se llama desde ninguna pantalla.
2. **Las dos presentaciones están en el DOM a la vez.** `display:none` las saca del árbol de
   accesibilidad, así que `getByRole` solo ve la del viewport actual; `getByText`, `getByLabel` y
   `getByPlaceholder` **no filtran por visibilidad**. En una prueba nueva, ancla por rol o acota con
   `getByRole('list', { name: 'Boletas' })`.
3. Si mueves `data-tour="data-table"` desde el envoltorio hacia dentro, el paso «tus boletas» del
   recorrido desaparecerá **sin error** en una de las dos pantallas.
4. Antes de creer un fallo E2E del tipo «strict mode violation» sobre un número de boleta repetido:
   `npm run db:reset && npm run seed:local`. Es I-055, no el cambio.

### 7. Promoción a producción (2026-08-23)

Desplegada con autorización expresa del dueño. **Sin migraciones**, así que no había orden que
respetar entre base de datos y código.

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`d3ee139`** (`dpl_CrTdZBMtj5NbXxgDQ47YyBkw8xWc`), alias `gestion-rifas.vercel.app` |
| CI de GitHub | **2/2** — `verify` y `migraciones desde cero + test:db` |
| `/login` | **200**, con las **6** cabeceras de seguridad |
| Rutas protegidas sin sesión | `/seller/tickets`, `/owner/tickets`, `/owner/dashboard`, `/seller/dashboard` → **307** |
| Clave de servicio en el navegador | **0** apariciones en los 15 fragmentos de JavaScript servidos ni en el HTML |
| **El código nuevo está servido de verdad** | La CSS de producción trae **`85dvh`** y **`ring-inset`**, que solo generan la hoja de filtros y la tarjeta. `bottom-nav-height` (D-106) sigue ahí: nada se perdió |
| Tiempo de **servidor** (3 ciclos, desglose `time_starttransfer − time_appconnect`) | **158–185 ms** — en línea con los 149–254 ms del despliegue anterior. Fluid Compute sigue cumpliendo |

Un ciclo mostró **1.282 ms de conexión** con el servidor en 185 ms. Es el patrón ya documentado en
`HANDOFF` §9: el control `/denied`, servido por CDN, tiene el mismo perfil de conexión, y una función
en frío no puede ralentizar un archivo estático. **No es del despliegue.**

**Lo que debe revisar el dueño a mano:** entrar como vendedor desde un teléfono real y confirmar que
la lista se ve como debe. Es lo único que no puede comprobar un agente: las rutas están protegidas y
verificarlas exige una contraseña, que un agente no debe manejar.

---

## Mantenimiento post-9 — la cabecera de «Boletas» deja de ser cuatro bloques sueltos (2026-08-24)

Encargo del dueño: rediseñar **solo** la sección intermedia de «Mis boletas» en el teléfono —título,
«Crear boletas», descripción, buscador, «Filtros» y el botón de selección— sin tocar la cabecera de
la aplicación, la lista de boletas ni la barra inferior. Decisión **D-108**. Sin migraciones.
**Sin desplegar.**

`Route changes: None` · `Business logic changes: None` · `New API calls: None` ·
`Query changes: None` · `New dependencies: None`

### 1. Funcionalidades implementadas

Ninguna nueva: es un cambio de presentación. Lo que cambió es **cuánto ocupa** y **qué tan claro es**.

- **El título y «Crear boletas» comparten fila.** `PageHeader` gana la variante **opcional**
  `inlineActions`, una rejilla en la que título y acción ocupan la fila 1 y la descripción, entera,
  la fila 2. Sin la bandera, el árbol de siempre: las otras 27 pantallas no cambian.
- **El recuadro de filtros es de escritorio.** Bajo `md` no hay caja: el buscador recupera los 32 px
  de `padding` y se alinea con las tarjetas de la lista.
- **El buscador mide 44 px en el teléfono** (`touchSize` en `SearchInput`) y vuelve a 36 px en
  escritorio. El hueco reservado para su pista se conserva: sin él, escribir empujaría la lista.
- **«Filtros» y «Seleccionar varias» son una sola fila de 44 px.** Antes eran dos botones de 32 px en
  bloques distintos, a 24 px uno del otro. Los dos crecen con `grow`, no a mitades: a 320 px una
  mitad son 140 px y el segundo botón necesita 160.
- **El botón dice «Seleccionar varias»**, no «Seleccionar»: lo que enciende es un modo para marcar
  **varias** boletas y actuar sobre todas a la vez. Icono `ListChecks` en vez de una casilla suelta.
- **La barra de selección vacía sale del flujo** (`sr-only`) en vez de cobrar dos huecos de 24 px.
  No se desmonta: dentro está la región `aria-live` del recuento.
- **Resultado:** a 390 px la primera boleta pasa de **y = 448 a y = 322**. Son 126 px, una tarjeta
  entera más de lista.
- **Alcance real:** la fila de botones y la barra de selección afectan a **los dos** listados de
  boletas; `inlineActions` y `touchSize`, solo a «Mis boletas». El encabezado del portal
  administrativo conserva sus dos acciones debajo del título: a 320 px no caben al lado.

### 2. Pruebas ejecutadas y resultados

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ |
| `npx eslint src tests` | ✅ 0 errores, 2 avisos preexistentes de TanStack |
| `npx vitest run` | ✅ **325/325** |
| `npm run build` | ✅ |
| `npm run test:db` | ✅ **518/518** |
| `npx playwright test --project=movil` | ✅ **49/49** |
| `npx playwright test --project=escritorio` | ✅ **242/242** |

Errores encontrados y corregidos: **tres**, todos detallados en `TEST_RESULTS.md` — la descripción
desalineada en las pantallas con flecha de volver, un aviso de `key` de React por el nodo pasado
desde el servidor, y los 24 px muertos de la barra de selección vacía. Medidas del navegador
(320/390/430 px, peor caso de ancho, escritorio sin mover) en el mismo archivo.

### 3. Migraciones

**Ninguna.** Este cambio no toca la base de datos.

### 4. Variables de entorno

**Ninguna nueva.**

### 5. Problemas que permanecen

Los de siempre (I-066, I-062, I-063, columna «Abono» del importador). **De este cambio, ninguno.**

### 6. Lo que debe revisar el siguiente agente

1. **`inlineActions` es opcional y debe seguir siéndolo.** No lo actives en una pantalla con dos
   acciones: a 320 px el título dispone de 288 px y un botón con icono se lleva 132.
2. **El botón de modo selección ya no está en `TicketSelectionToolbar`.** Vive en
   `TicketSelectionModeButton` y lo coloca la página, dentro del hueco `secondaryAction` de
   `TicketFilters`. Si añades una tercera pantalla que liste boletas, tendrás que pasarlo también.
3. **La barra de selección vacía está en `sr-only`, no desmontada.** No la conviertas en
   `{cond ? … : null}`: se perdería la región `aria-live` que anuncia el recuento.
4. **Un localizador de `'Seleccionar'` exacto ya no encuentra nada.** El botón dice «Seleccionar
   varias».
5. **Antes de creer un fallo E2E** del tipo «strict mode violation» sobre un número de boleta
   repetido: `npm run db:reset && npm run seed:local`. Es I-055, no el cambio.

### 7. Promoción a producción (2026-08-24)

Desplegada con autorización expresa del dueño. **Sin migraciones**, así que no había orden que
respetar entre base de datos y código.

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`4381f2b`** (`dpl_2N8vtyRaxqLvzk4dPDVJKRLAb2SH`), alias `gestion-rifas.vercel.app` |
| CI de GitHub | **2/2** — `verify` y `migraciones desde cero + test:db` |
| `/login` | **200**, con las **6** cabeceras de seguridad |
| Rutas protegidas sin sesión | `/seller/tickets`, `/owner/tickets`, `/owner/dashboard`, `/seller/dashboard` → **307** |
| Clave de servicio en el navegador | **0** apariciones en el HTML ni en los **16** recursos que sirve `/login` |
| **El código nuevo está servido de verdad** | La CSS de producción trae `grid-template-columns:minmax(0,1fr) auto`, que **solo** genera la variante `inlineActions` de `PageHeader`, y las cinco clases `md:` nuevas (`md:space-y-3`, `md:h-9`, `md:rounded-lg`, `md:border`, `md:p-4`), una vez cada una. El bundle es idéntico al del build local salvo los hashes de las fuentes |
| Tiempo de **servidor** (3 ciclos, `time_starttransfer − time_appconnect`) | **151, 161 y 259 ms** — en línea con los 158–185 ms del despliegue anterior. Fluid Compute sigue cumpliendo |

**Lo que debe revisar el dueño a mano:** entrar como vendedor desde un teléfono real y confirmar que
la cabecera se ve como debe. Es lo único que no puede comprobar un agente: las rutas están protegidas
y verificarlas exige una contraseña, que un agente no debe manejar.

---

## Mantenimiento post-9 — la misma cabecera en el portal administrativo (2026-08-24)

Encargo del dueño, inmediatamente después de desplegar D-108: aplicar el mismo rediseño a la cabecera
de `/owner/tickets`. Decisión **D-109**. Sin migraciones. **Sin desplegar.**

`Route changes: None` · `Business logic changes: None` · `New API calls: None` ·
`Query changes: None` · `New dependencies: None`

### 1. Funcionalidades implementadas

Ninguna nueva: presentación. La mitad del rediseño ya estaba en esa pantalla desde D-108, porque el
buscador, el recuadro que desaparece bajo `md` y la fila «Filtros» + «Seleccionar varias» los pone
`TicketFilters`, que las dos pantallas comparten. Lo que faltaba era el encabezado.

- **Las dos acciones bajan juntas a una fila propia de 44 px** que va de lado a lado, con los botones
  repartiéndose el ancho. Es el mismo tratamiento que la fila de «Filtros» justo debajo, así que la
  pantalla conserva el ritmo de D-108 sin que nada quede flotando bajo un párrafo.
- **No suben a la fila del título**, y no por gusto: a 320 px el título mide 79 px y las dos acciones
  272, que con su hueco suman **363 px sobre los 288 disponibles**. A 390 px quedan 267 para 272.
- **La disposición la eligió el dueño** entre tres opciones que se le plantearon con sus
  consecuencias. Se descartaron subir solo «Nueva boleta» —el secundario acabaría siendo el botón más
  ancho de la pantalla— y esconder «Crear en lote» tras un menú «···», que habría enterrado la acción
  con la que se cargan las boletas de una rifa entera.
- **Escritorio no cambia:** los dos botones vuelven a 36 px y a su ancho de contenido, a la derecha
  del título.

### 2. Pruebas ejecutadas y resultados

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ |
| `npx eslint src tests` | ✅ 0 errores, 2 avisos preexistentes de TanStack |
| `npx vitest run` | ✅ **325/325** |
| `npx playwright test --project=movil` | ✅ **49/49** |
| `npx playwright test --project=escritorio` | ✅ **242/242** |
| `npm run build` | ✅ |

Medidas del navegador a 320, 390 y 1.280 px, y **un error de diagnóstico que hubo que corregir**
—dos comentarios del código llegaron a explicar con una causa falsa lo que en realidad era caché del
servidor de desarrollo— en `TEST_RESULTS.md`.

### 3. Migraciones

**Ninguna.**

### 4. Variables de entorno

**Ninguna nueva.**

### 5. Problemas que permanecen

Los de siempre (I-066, I-062, I-063, columna «Abono» del importador). **De este cambio, ninguno.**

### 6. Lo que debe revisar el siguiente agente

1. **`PageHeader` no impone tamaño a sus acciones, y no debe empezar a hacerlo.** La pantalla que
   quiera la fila táctil se lo pide a sus botones (`h-11 grow md:h-9 md:grow-0`). Lo comparten 27
   pantallas.
2. **Las dos pantallas de boletas tienen encabezados distintos a propósito** (`ARCHITECTURE` §8.11):
   una acción cabe junto al título, dos no.
3. **Al medir en el navegador después de cambiar clases, navega limpio (`?v=n`).** Un
   `location.reload()` puede servirte un árbol anterior con el CSS nuevo y hacerte culpar a la
   cascada, que es exactamente lo que pasó aquí.

### 7. Promoción a producción (2026-08-24)

Desplegada con autorización expresa del dueño, el mismo día que D-108. **Sin migraciones.**

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`f9d5b20`** (`dpl_5jH2fZ1PhLmCX9Gr2wzX65HbcHUT`), alias `gestion-rifas.vercel.app` |
| CI de GitHub | **2/2** — `verify` y `migraciones desde cero + test:db` |
| `/login` | **200**, con las **6** cabeceras de seguridad |
| Rutas protegidas sin sesión | `/seller/tickets`, `/owner/tickets`, `/owner/dashboard`, `/seller/dashboard` → **307** |
| Clave de servicio en el navegador | **0** apariciones en el HTML ni en los **16** recursos que sirve `/login` |
| **El código nuevo está servido de verdad** | La CSS de producción trae **`md:grow-0`**, que en toda la aplicación solo lo genera la fila de acciones de esta pantalla. Y **conserva las cuatro huellas de D-108** (`grid-template-columns:minmax(0,1fr) auto`, `md:h-9`, `md:space-y-3`, `md:rounded-lg`): no se perdió nada del despliegue anterior |
| Tiempo de **servidor** (3 ciclos, `time_starttransfer − time_appconnect`) | **185, 207 y 208 ms** — en línea con los 151–259 ms de D-108. Fluid Compute sigue cumpliendo |

**Lo que debe revisar el dueño a mano:** entrar como dueño desde un teléfono real y confirmar que la
fila de «Crear en lote» y «Nueva boleta» se ve como debe.

---

## Mantenimiento post-9 — el hueco de la barra de selección múltiple (2026-08-24)

Reporte del dueño sobre las dos pantallas de boletas: al marcar una boleta aparecía un bloque en
blanco bajo «Ver seleccionadas» / «Limpiar selección», y abajo la barra de acciones dejaba una
rendija sobre el menú del teléfono y tapaba la paginación. Decisión **D-110**. Sin migraciones.
**Sin desplegar.**

`Route changes: None` · `Business logic changes: None` · `New API calls: None` ·
`Query changes: None` · `New dependencies: None`

### 1. Funcionalidades implementadas

Ninguna nueva: corrección de presentación. Los tres síntomas eran el mismo error —la barra es un
elemento `fixed` escrito en medio del contenido—, así que se arreglan juntos.

- **El hueco de la barra se pide, no se dibuja.** La barra se marca `data-selection-bar`,
  `globals.css` traduce esa marca a `--selection-bar-space` bajo `md` y `AppShell` la suma al
  `padding-bottom` del contenido, junto al de la barra inferior (D-106). Antes lo reservaba un
  `<div className="h-20">` **escrito donde está el componente**, es decir encima de la lista: dejaba
  80 px en blanco arriba y no reservaba nada abajo, que es donde hacía falta.
- **La barra va envuelta en `display: contents`.** El `space-y-6` de la pantalla daba
  `margin-bottom: 24px` a sus hijos, y en un elemento fijo colocado por `bottom` ese margen **cuenta
  para colocarlo**: la barra flotaba 24 px sobre la navegación y por esa rendija se veía la lista.
- **Escritorio no cambia:** la variable vale 0 px, la barra no se dibuja y las separaciones siguen
  siendo las de siempre.

### 2. Pruebas ejecutadas y resultados

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ |
| `npx eslint .` | ✅ 0 errores, 2 avisos preexistentes de TanStack |
| `npx vitest run` | ✅ **325/325** |
| `npm run test:db` | ✅ **518/518** |
| `npx playwright test --project=movil` | ✅ **50/50** (1 nueva de regresión) |
| `npx playwright test --project=escritorio` (4 archivos de selección y boletas) | ✅ **61/61** |
| `npm run build` | ✅ |

Medidas del navegador a 375, 1.280 y 1.440 px, y la **verificación al revés** de la prueba nueva
—falla midiendo 113 px con el espaciador de vuelta— en `TEST_RESULTS.md`.

### 3. Migraciones

**Ninguna.**

### 4. Variables de entorno

**Ninguna nueva.**

### 5. Problemas que permanecen

Los de siempre (I-066, I-062, I-063, columna «Abono» del importador). **De este cambio, ninguno.**

### 6. Lo que debe revisar el siguiente agente

1. **Una barra fija no reserva su hueco con un div vacío.** Se ancla a `--selection-bar-space`, igual
   que la navegación se ancla a `--bottom-nav-space` (`ARCHITECTURE` §8.8). Un elemento en flujo se
   queda donde está escrito, y el hueco casi siempre hace falta al final.
2. **Un elemento `fixed` dentro de un `space-y-*` se desplaza** por el margen que hereda. Si añades
   otra barra, envuélvela igual.
3. **La suite E2E de escritorio se corrió parcial** (61 de 242) porque bajo `md` este cambio no
   existe. Antes de promover, deja que CI corra las dos completas.

### 7. Promoción a producción (2026-08-24)

Desplegada con autorización expresa del dueño, el mismo día. **Sin migraciones.**

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`ef6bcb2`** (`dpl_KkU3vKAFr169yzRhfA5VBrPpxB7A`), alias `gestion-rifas.vercel.app` |
| CI de GitHub | **2/2** — `verify` y `migraciones desde cero + test:db` |
| `/login` | **200**, con las **6** cabeceras de seguridad |
| Rutas protegidas sin sesión | `/seller/tickets`, `/owner/tickets`, `/owner/dashboard`, `/seller/dashboard` → **307** |
| Clave de servicio en el navegador | **0** apariciones en el HTML ni en los **27** recursos que sirve `/login` |
| **El código nuevo está servido de verdad** | La CSS de producción trae la regla entera `body:has([data-selection-bar]){--selection-bar-space:var(--selection-bar-height)}`, el `padding-bottom:calc(1rem + var(--bottom-nav-space) + var(--selection-bar-space))` de `AppShell` y el **único** `display:contents` de la aplicación |
| Tiempo de **servidor** (3 ciclos, `time_starttransfer − time_appconnect`) | **150, 169 y 202 ms** — en línea con los 185–208 ms de D-109. Fluid Compute sigue cumpliendo |

**Lo que debe revisar el dueño a mano:** entrar como vendedor desde un teléfono real, marcar una
boleta y confirmar dos cosas: que la lista empieza justo debajo del recuento y que, al final de la
lista, se puede tocar «Siguiente» sin que la barra lo tape.

---

## Mantenimiento post-9 — la paginación en el teléfono (2026-08-24)

Encargo del dueño: la paginación funcionaba, pero en el móvil se sentía rígida y con mala jerarquía.
Decisión **D-111**. Sin migraciones. **Sin desplegar.**

`Route changes: None` · `Business logic changes: None` · `New API calls: None` ·
`Query changes: None` · `New dependencies: None`

### 1. Funcionalidades implementadas

Ninguna nueva: presentación. **No se tocó nada del paginado** —ni `page`, ni `pageSize`, ni el cálculo
del rango, ni los filtros, ni la búsqueda, ni el orden, ni los parámetros de la URL, ni volver desde
el detalle de una boleta—. El componente sigue siendo uno solo para los ocho listados.

- **El recuento dice qué cuenta:** «1–25 de 118 **boletas**», con el término del glosario que
  corresponda, en singular o plural. Los nombres viven en `LIST_ITEM_LABELS` (`src/lib/constants.ts`)
  y el parámetro es **obligatorio**: un genérico habría escondido que el reporte de recaudo pagina
  **días**, no pagos.
- **Los botones suben a 44 px** y se van a los dos márgenes de la fila, que es donde llega el pulgar.
  Siguen siendo `outline`: pasar de página no es una acción primaria.
- **El indicador dice «1 de 5»**, sin borde ni fondo, centrado entre los dos botones. La palabra
  «Página» se queda en `sr-only` bajo `md`, así que un lector de pantalla la sigue anunciando.
- **En los extremos los botones se deshabilitan, no desaparecen**, y conservan sus coordenadas
  exactas: nada se mueve bajo el dedo.
- **Escritorio prácticamente no cambia**: los botones siguen midiendo 32 px con 10 px de aire, y la
  fila los mismos 314 px a la derecha del recuento. Cambian dos textos: el recuento (que ahora dice
  qué cuenta) y la tilde de «Página», que faltaba.

### 2. Pruebas ejecutadas y resultados

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ |
| `npx eslint .` | ✅ 0 errores, 2 avisos preexistentes de TanStack |
| `npx vitest run` | ✅ **325/325** |
| `npx playwright test --project=movil` | ✅ **51/51** (1 nueva) |
| `npx playwright test --project=escritorio` | ✅ **242/242** |
| `npm run build` | ✅ |

Medidas a 320, 375, 700 y 1.280 px, el recuento de las cinco listas y la verificación al revés de la
prueba nueva, en `TEST_RESULTS.md`.

### 3. Migraciones

**Ninguna.**

### 4. Variables de entorno

**Ninguna nueva.**

### 5. Problemas que permanecen

Los de siempre (I-066, I-062, I-063, columna «Abono» del importador). **De este cambio, ninguno.**
Queda **fuera a propósito** el paginador de la vista previa del importador (`ImportPreview`): es
estado local sobre filas ya leídas de un archivo, sin URL ni servidor, y unificarlo obligaría a
reescribir uno de los dos.

### 6. Lo que debe revisar el siguiente agente

1. **`items` es obligatorio en `DataTablePagination`.** Una lista nueva tiene que decir qué muestra, y
   el nombre sale de `LIST_ITEM_LABELS`, no de un texto escrito en la pantalla.
2. **Comprueba qué pagina de verdad la lista** antes de elegir el nombre. El reporte de recaudo
   parecía paginar pagos y pagina días.
3. **El corte de esta pantalla es `md`, como el resto de la aplicación.** No lo devuelvas a `sm`: a
   700 px hay barra inferior y tarjetas, o sea, teléfono.

### 7. Promoción a producción (2026-08-24)

Desplegada con autorización expresa del dueño, el mismo día. **Sin migraciones.**

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`7d7cf18`** (`dpl_3fLMzy1uxwJYN9gfMrba7i6GQuUs`), alias `gestion-rifas.vercel.app` |
| CI de GitHub | **2/2** — `verify` y `migraciones desde cero + test:db` |
| `/login` | **200**, con las **6** cabeceras de seguridad |
| Rutas protegidas sin sesión | `/seller/tickets`, `/owner/tickets`, `/owner/dashboard`, `/seller/dashboard` → **307** |
| Clave de servicio en el navegador | **0** apariciones en el HTML ni en los **27** recursos que sirve `/login` |
| **El código nuevo está servido de verdad** | La CSS de producción trae, dentro de `@media (min-width:48rem)`, las cuatro clases que en toda la aplicación solo genera este componente: `.md\:not-sr-only` (la palabra «Página»), `.md\:has-[>svg]\:px-2.5` (el aire lateral que devuelve el botón de escritorio), `.md\:max-w-none` y `.md\:flex-none`. El archivo cambió de nombre respecto al despliegue anterior |
| Tiempo de **servidor** (3 ciclos, `time_starttransfer − time_appconnect`) | **149, 156 y 186 ms** — en línea con los 150–202 ms de D-110 |

**Lo que debe revisar el dueño a mano:** abrir «Mis boletas» en un teléfono real, bajar al final de
la lista y comprobar tres cosas: que el recuento dice «boletas», que los dos botones se tocan sin
apuntar, y que «Anterior» sigue ahí —apagado— en la primera página.

---

## Mantenimiento post-9 — el panel del vendedor, rediseñado (2026-08-25)

Encargo del dueño, con un diseño de referencia: el panel eran once bloques apilados y había que
convertirlo en una pantalla que se lea de un vistazo. Decisión **D-112**. Sin migraciones.
**Desplegado y verificado en producción** (§7).

`Route changes: None` · `Business logic changes: None` · `New dependencies: None` ·
`Migrations: None` · `New API calls: 2 lecturas nuevas, 3 retiradas`

### 1. Funcionalidades implementadas

El panel pasa de once bloques a **siete piezas**, y aparecen dos cosas que antes no existían: un
**selector de período** y un **gráfico de tendencia**.

- **Selector de período** (7 días, 30 días, este mes, mes pasado) arriba a la derecha. Vive en la URL
  (`?range=`), como los filtros de los reportes. Manda sobre **lo que pasó** —el dinero recaudado y
  su tendencia—; el inventario y la cobranza son la foto de **hoy** y no se mueven con él.
- **Cuatro indicadores**: Recaudado (con su comparación contra el período anterior de la misma
  duración), Por cobrar, Cobranza (porcentaje del dinero ya cobrado) y Ganancia por boleta.
- **Resumen financiero**: un anillo que reparte el valor de lo vendido en tres partes que **suman el
  total** — cobrado de las boletas pagadas, abonado de las que aún deben, y lo que falta. Con enlace
  a «Ver detalle de cobranza».
- **Cobranza**: las tres etiquetas de estado con su recuento y **cuánto valen** esas boletas. Los tres
  importes suman el total del anillo. Cada una enlaza a la lista ya filtrada.
- **Mis boletas**: las seis cifras del inventario en una tarjeta, cada una enlazando a su lista.
- **Tendencia de recaudado**: cuánto dinero entró **cada día** del período. Los días sin movimiento
  valen $0 y se dibujan.
- **Actividad reciente**: los últimos pagos recibidos, con la misma consulta de antes.
- **Accesos rápidos**: vender una boleta, nuevo cliente, registrar abono y ver reportes. En el
  teléfono suben al **primer** puesto.

**Nada de esto cambia una regla de negocio.** Los estados de pago siguen saliendo de
`v_seller_summary`, la comisión de `commission_summary` y el precio de `raffles.ticket_price`.

### 2. Pruebas ejecutadas y resultados

| Comando | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ 0 errores, 2 avisos preexistentes de TanStack |
| `npm run test` | ✅ **359/359** (34 nuevas) |
| `npm run test:db` | ✅ **518/518** |
| `npm run build` | ✅ |
| `npx playwright test --project=escritorio` | ✅ **243/243** |
| `npx playwright test --project=movil` | ✅ **51/51** |

**Errores encontrados y corregidos durante el trabajo** (detalle en `TEST_RESULTS.md`):

1. **«Ganancia por boleta» mostraba $0** a un vendedor sin boletas cobradas. `commission_summary`
   devuelve fila también para él, y ahí la tarifa vale 0 porque el primer tramo empieza en la boleta
   1. La tarjeta anterior lo evitaba tratando `ticketsPaid === 0` como caso vacío; el indicador no.
   Detectado con `vendedor@control.test`, que debía mostrar $25.000.
2. **La lista del selector de período aparecía a 1.400 px del botón.** La colocación por defecto de
   Radix necesita un `SelectValue` que medir y este botón lleva las fechas escritas a mano. Se
   resolvió con `position="popper"`.
3. **El eje del gráfico decía «$1»** cuando en todo el período no había entrado dinero: era el valor
   que evita la división por cero, colado en la etiqueta. Ahora el eje solo dice «$0».
4. **Tres piezas se rompían en escritorio y no en el móvil**, porque respondían al ancho de la
   ventana y no al de su tarjeta: la leyenda del anillo se quedaba en 66 px, «Mis boletas» en
   columnas de 43 px y los indicadores cortaban «$2.325.000». Se resolvió con container queries y
   subiendo los indicadores a `xl`.
5. **El nombre del cliente se quedaba en 38 px** a 320 px en «Actividad reciente». Se resolvió
   subiendo el importe a la misma línea que el nombre.
6. **El globo del recorrido guiado no cabía en el teléfono** en el paso del resumen financiero. Dos
   causas: la prueba medía el globo **en pleno vuelo** durante el scroll suave —corregido esperando
   a que la posición se quede quieta— y la tarjeta, con 422 px de alto, no dejaba sitio al globo sin
   taparla. El anillo del móvil bajó de 160 a 128 px y la tarjeta a 374.

### 3. Migraciones

**Ninguna.** Y no por evitarlas: la única cifra que faltaba —lo abonado sobre las boletas a medias—
se lee de `v_ticket_balances`, y de ella se **deduce** todo el reparto por estado de pago. Añadir una
columna a una vista habría obligado a promover una migración al proyecto real **antes** de desplegar
el código, o el panel se caería en producción.

### 4. Variables de entorno

**Ninguna nueva.**

### 5. Problemas que permanecen

Los de siempre (I-066, I-062, I-063, columna «Abono» del importador). **De este cambio, uno**, y no
es un defecto sino una decisión pendiente: **I-068** — con la tarjeta «Tu ganancia» desaparecieron el
aviso de las rebajas (BR-G17) y la advertencia de que la proyección del siguiente nivel «todavía no
es tuya». `CommissionCard` no se borró; volver a montarla es una línea.

### 6. Lo que debe revisar el siguiente agente

1. **El período NO manda sobre el inventario ni sobre la cobranza**, y no es un olvido: la base
   guarda el estado actual de cada boleta, no el que tenía hace siete días. Por eso «Por cobrar»
   tampoco lleva comparación con el período anterior.
2. **El anillo cuadra por construcción.** Si tocas `collection-breakdown.ts`, la prueba unitaria
   comprueba en todos los escenarios que las tres partes suman el total. No la relajes: es lo único
   que impide que el gráfico y la sección «Cobranza» se contradigan en pantalla.
3. **Estas tarjetas responden al ancho de SU TARJETA, no al de la ventana.** Un `sm:` dentro de una
   tarjeta que ocupa media pantalla de escritorio no significa lo que parece. Usa `@container`.
4. **`getSellerDashboard` ya no trae clientes ni ventas recientes.** Si una pantalla nueva los
   necesita, se piden aparte; no se devuelven a esa función «por si acaso».
5. **`CommissionCard` está sin montar a propósito** (I-068). No la borres sin que el dueño confirme.

### 7. Promoción a producción (2026-08-25)

Desplegado con autorización expresa del dueño, el mismo día. **Sin migraciones**, así que no había
orden que respetar entre base de datos y código.

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`96827dc`** (`dpl_G1ULMPZxjm83GLDyRtsTqYbcS1Xv`), alias `gestion-rifas.vercel.app` |
| CI de GitHub | **2/2** — `verify` y `migraciones desde cero + test:db` |
| `/login` | **200**, con las **6** cabeceras de seguridad |
| Rutas protegidas sin sesión | `/seller/dashboard`, `/owner/dashboard`, `/seller/tickets`, `/owner/tickets` → **307** |
| Clave de servicio en el navegador | **0** apariciones en el HTML ni en los **16** recursos que sirve `/login` |
| **El código nuevo está servido de verdad** | La CSS de producción trae las **tres** reglas `@container` que en toda la aplicación solo genera este panel: `@container (min-width:400px)` (el anillo junto a su leyenda), `@container tickets (min-width:400px)` («Mis boletas» a seis columnas) y `@container (min-width:560px)` (el anillo grande). Además `.fill-emerald-500/10`, que solo existe en el gráfico de tendencia, y `.stroke-blue-600`, que solo existe en el anillo |
| Tiempo de **servidor** (3 ciclos, `time_starttransfer − time_appconnect`) | **240, 171 y 170 ms** — en línea con los 149–208 ms de los despliegues anteriores |

**Lo que un agente no puede comprobar:** entrar como vendedor y mirar el panel con datos reales.
Exige una contraseña, y eso no lo maneja un agente. Queda para el dueño, preferiblemente **desde un
teléfono**, que es donde más se usa esta pantalla.

**Una nota de método que costó un intento.** Al buscar las huellas del código nuevo en la CSS de
producción, los dos primeros patrones dieron cero y parecía que el despliegue no traía el cambio. No
era eso: Tailwind escribe `@container (min-width:400px)`, no `@container (width>=400px)`, que fue lo
que se buscó. La lección de `c1fa849` —construir la barra invertida con `String.fromCharCode(92)`—
sigue valiendo, pero hay que añadirle esta: **antes de concluir que falta una clase, imprime las
reglas que sí existen** y compara. Bastó con listar los `@container` servidos para ver los tres.

---

## Mantenimiento post-9 — la ficha del cliente, rediseñada (2026-08-25)

Encargo del dueño, con un diseño de referencia y la captura de la pantalla actual: reorganizar
visualmente el **detalle del cliente** sin tocar lógica, consultas, rutas ni permisos. Decisión
**D-113**. Sin migraciones. **Desplegado y verificado en producción** (§7).

`Route changes: None` · `Business logic changes: None` · `New dependencies: None` ·
`Migrations: None` · `Query changes: None` · `New API calls: None`

### 1. Funcionalidades implementadas

Es un cambio **visual**: la pantalla pide exactamente los mismos datos que pedía y los presenta de
otra forma. En los **dos** portales, porque son la misma pantalla para dos roles.

- **Encabezado**: el nombre lleva al lado su estado —**Activo** o **Archivado**— y **«Registrar
  abono»** sube ahí como única acción de color; «Editar» y «Archivar cliente» la acompañan como
  secundarias. En el teléfono la principal ocupa el ancho con 44 px de alto y las otras dos se
  reparten la fila siguiente.
- **Información general**: una tira horizontal —teléfono, correo, alta y estado, más el vendedor en
  el portal administrativo— con icono, y separadores verticales **solo en escritorio**. Las notas,
  cuando las hay, bajan a su propia línea dentro de la misma tarjeta.
- **Cuatro cifras** (boletas compradas, total comprado, total pagado, saldo pendiente) en la tarjeta
  de indicador del panel del vendedor (`KpiCard`, D-112), con icono.
- **Dos listados en su propia tarjeta con título** (`TableSection`): «Boletas de este cliente» e
  «Historial de abonos», este último con su «Registrar abono» a la derecha.
- **Columnas retiradas**: «Cliente» en las dos tablas —repetía el nombre del título en todas las
  filas— y, solo en el portal del vendedor, «Rifa», que ahí sobra por D-088. En el administrativo
  «Rifa» y «Vendedor» se quedan: pueden variar.

**Lo que NO cambió:** `getClientDetail`, `listTickets({ clientId })` y `listClientPayments` siguen
siendo las tres consultas de siempre, en el mismo `Promise.all`. Las cuatro cifras siguen saliendo de
`v_client_balances`. La condición para ofrecer el cobro es la de antes —saldo pendiente > 0 y cliente
no archivado—, y el aviso ámbar del cliente archivado sigue donde estaba.


### 2. Pruebas ejecutadas y resultados

| Comando | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ 0 errores, 2 avisos preexistentes de TanStack |
| `npm run test` | ✅ **359/359** |
| `npm run test:db` | ✅ **518/518** |
| `npm run build` | ✅ |
| `npx playwright test --project=escritorio` | ✅ **243/243**, sobre base recién sembrada |
| `npx playwright test --project=movil` | ✅ **51/51** |

**Un aviso que costó una pasada entera.** La primera vuelta completa de escritorio dio **6 fallos**
—cinco de `importar-boletas` y uno de `seller-tickets`— que **no eran del cambio**: la base venía de
tres pasadas encadenadas. Con `db:reset` + `seed:local`, los mismos archivos dieron **26/26** y la
suite completa **243/243**. `HANDOFF` ya lo avisa; queda aquí repetido porque vuelve a morder.

**Verificación en pantalla** (detalle en `TEST_RESULTS.md`): medida a **320, 360, 390 y 1.280 px**,
con desbordamiento horizontal **0** a 320 px (`scrollWidth == clientWidth == 320`). Probados los seis
estados de la pantalla: con datos, sin boletas, sin abonos, sin correo, archivado y con nombre largo.

### 3. Migraciones

**Ninguna.** No hay cambios de esquema, de vistas ni de funciones.

### 4. Variables de entorno

**Ninguna nueva.**

### 5. Problemas que permanecen

Los de siempre (I-068, I-066, I-062, I-063 y la columna «Abono» del importador). **De este cambio,
ninguno.**

### 6. Lo que debe revisar el siguiente agente

1. **Una tabla dentro de una tarjeta se aplana con `SECTION_TABLE_CLASSES`**, no quitándole el borde
   a `DataTable`. El `className` es opcional: las demás pantallas siguen viendo la tabla de siempre.
2. **`showClient` se apaga solo donde el cliente es constante por construcción.** No lo copies a una
   lista que no esté filtrada por `clientId`: esconder un dato que puede variar es esconder
   información. La misma regla vale para «Rifa» y «Vendedor».
3. **`titleBadge` va junto al `h1`, no dentro.** El nombre accesible de un encabezado tiene que
   seguir siendo el nombre; si lo metes dentro, un lector de pantalla anuncia «Liz Espitia Activo».
4. **`KpiCard` ya no es solo del panel.** Vive en `features/dashboard` y la usan dos pantallas; si la
   tocas, míralas las dos.
5. **El botón «Ver» del historial y su columna sin rótulo se dejaron como estaban** a propósito
   (D-113.d): esa tabla la comparten tres pantallas y el encargo pedía no cambiar las otras dos.


### 7. Promoción a producción (2026-08-25)

Desplegado con autorización expresa del dueño, el mismo día. **Sin migraciones**, así que no había
orden que respetar entre base de datos y código.

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`18ad9bd`** (`dpl_EEBWxXrw4zSeU4NMTdAFA6RooM5h`), alias `gestion-rifas.vercel.app` |
| CI de GitHub | **2/2** — `verify` y `migraciones desde cero + test:db` |
| `/login` | **200**, con las **6** cabeceras de seguridad |
| Rutas protegidas sin sesión | `/seller/dashboard`, `/owner/dashboard`, `/seller/clients`, `/owner/clients` → **307** |
| Clave de servicio en el navegador | **0** apariciones en el HTML ni en los **16** recursos que sirve `/login` |
| **El código nuevo está servido de verdad** | La CSS de producción (87.842 bytes) trae las cuatro huellas que en toda la aplicación **solo** genera este cambio: `.lg\:pl-6` y `.lg\:gap-0` (la tira de «Información general»), `.sm\:grow-0` (los botones secundarios del encabezado) y `.sm\:pb-4` (`TableSection`). Trae además `.lg\:grid-cols-5`, la tira de cinco datos del portal administrativo |
| Tiempo de **servidor** (`time_starttransfer − time_appconnect`) | **528** ms en el primer ciclo —la primera petición sobre un despliegue recién creado— y **139, 172, 172, 172 y 241 ms** en los cinco siguientes. El control `/denied`, servido por CDN, dio **132 y 147 ms**: la diferencia es la esperada y está dentro de los 130–270 ms sanos de `DEPLOYMENT` §3.1.b |

**Lo que un agente no puede comprobar:** entrar como vendedor y abrir la ficha de un cliente con
datos reales. Exige una contraseña, y eso no lo maneja un agente. Queda para el dueño,
preferiblemente **desde un teléfono**.

**Si algo va mal, la reversión es inmediata:** Instant Rollback en Vercel al despliegue anterior
(`dpl_FydqcmL6kGEP3s3ug3ksFRYHZhrx`, sobre `3136c9d`). No hay migración que deshacer.

### 7.b Segunda promoción: la cuadrícula del teléfono (2026-08-25)

El mismo día y con autorización expresa, tras el ajuste de «Información general» a cuadrícula 2 × 2.
**Sin migraciones.**

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`9e72fca`** (`dpl_CQV5dU8HJnKYHgjoMt2XRdM7PwPC`), alias `gestion-rifas.vercel.app` |
| CI de GitHub | **2/2** — `verify` y `migraciones desde cero + test:db` |
| `/login` | **200**, **6/6** cabeceras de seguridad |
| Rutas protegidas sin sesión | Las cuatro → **307** |
| Clave de servicio en el navegador | **0** apariciones en el HTML ni en los **16** recursos |
| **El código nuevo está servido** | La CSS de producción (88.088 bytes) trae `.sm\:size-10` y `.lg\:p-5`, que solo genera la cuadrícula nueva |
| **Y el anterior ya no** | `.lg\:pl-6` y `.lg\:gap-0` —las huellas de la versión apilada, verificadas en línea hace una hora— **han desaparecido**. Es la comprobación que faltaba en los despliegues anteriores: no basta con que llegue lo nuevo, hay que ver que lo viejo se fue |
| El resto del rediseño, intacto | `.sm\:grow-0`, `.sm\:pb-4` y `.lg\:grid-cols-5` siguen presentes |
| Tiempo de **servidor** | **169, 236, 172 y 140 ms** en cuatro ciclos. Sin pico de arranque en frío |

**Lo que un agente no puede comprobar:** abrir la ficha en un teléfono real. Queda para el dueño.
Reversión: Instant Rollback a `dpl_AyX7pQqvqy9KjPdAyGpuk7aEufbo` (`13a9771`), sin nada que deshacer
en la base.

---

## Mantenimiento post-9 — la aplicación instalable (PWA) (2026-08-26)

**Encargo:** convertir el proyecto en una PWA instalable en Android y iPhone y optimizar el
rendimiento, sin cambiar frontend, backend, base de datos, usuarios, autenticación, rutas ni una sola
regla de negocio. Decisiones **D-115 a D-120**.

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| **Instalación** | Manifiesto en `/manifest.webmanifest` (`display: standalone`, `start_url: /`, `id: /`, colores del tema, 4 iconos). Se arranca en `/`, que es el reparto por rol que ya existía: no hay un camino paralelo para la aplicación instalada |
| **Iconos** | 192, 512, dos `maskable`, `apple-touch-icon` de 180 y un `favicon.ico` de 16/32/48 — que **no existía**: cada primera visita recibía un 404. **Provisionales**, I-071 |
| **Service worker** | `public/sw.js`, escrito a mano (D-115 explica por qué no Serwist). Guarda archivos con huella de contenido; **no guarda ni una respuesta autenticada** |
| **Sin conexión** | `/offline`, pública y `force-dynamic`, precargada por el worker junto con los archivos que necesita. Botón «Reintentar» que **funciona sin JavaScript** |
| **Versión nueva** | Aviso con botón. **Nunca** recarga sola: activar recarga, y recargar en mitad de un abono se lleva lo escrito |
| **iPhone** | `viewport-fit=cover`, áreas seguras laterales, barra de estado en `default`, `format-detection: telephone=no` (los números de 4 cifras dejaban de ser tocables al convertirse en enlaces de llamada) y las dos etiquetas `capable` que Next no escribe |
| **Rendimiento** | `−Geist_Mono` (11 → 5 `.woff2`; 51,2 → 29,3 KB precargados), `−date-fns`, `−@date-fns/tz`, y `next/dynamic` para el recorrido guiado y los 5 diálogos masivos |

**Corrección añadida con autorización expresa (D-121):** `/forgot-password` pasa a renderizarse por
petición. Estaba **prerenderizada**, la CSP por nonce le bloqueaba todos los scripts, y llevaba **sin
JavaScript en producción desde la Fase 7**: el formulario caía a su envío nativo por GET, no llamaba
a la Server Action y **no enviaba ningún correo**, además de dejar el correo escrito en la URL
(I-070). `/denied` y `/_not-found` se quedan estáticas a propósito —solo tienen un enlace— con un
aviso en su cabecera.

**Lo que NO se hizo, a propósito:** escrituras sin conexión, sincronización diferida, caché de API,
Firebase Cloud Messaging (solo se dejó la arquitectura preparada y documentada en `ARCHITECTURE`
§8.15.a), y `cacheComponents` / `partialPrefetching` de Next 16, que exigiría rediseñar los límites de
Suspense de toda la aplicación y decidir vidas de caché para datos financieros.

### 2. Pruebas ejecutadas y resultados

`npm run verify` **completo en verde**: `typecheck` ✅, `lint` **0 errores**, **374/374** unitarias
(+15) y `build` ✅. Verificación manual del worker contra un build de producción: registro, cachés,
sin conexión, vuelta a la red y ciclo completo de actualización. Detalle, cifras y **los cuatro
errores encontrados** —tres corregidos y uno ajeno que se documentó sin tocar— en `TEST_RESULTS.md`.

**`test:db` 518/518 y `test:e2e` 294/294**, ejecutadas el mismo día al levantar Docker, sembrando
limpio antes de cada pasada (I-073 cerrado). La primera pasada E2E dio 1 fallo que **no era del
código** y que se reprodujo igual sobre el commit anterior a este trabajo: **I-075**.

### 3. Migraciones

**Ninguna.** No se tocó la base de datos.

### 4. Variables de entorno

**Ninguna nueva obligatoria.** `NEXT_PUBLIC_APP_BUILD_ID` la calcula `next.config.ts` a partir del
commit y la inyecta en el build; `APP_BUILD_ID` permite fijarla a mano si algún día se construye
fuera de Git.

### 5. Problemas que permanecen

**I-071** (iconos provisionales), **I-072** (`font-mono` nunca fue Geist Mono), **I-073** (dos suites
sin ejecutar) y **I-074** (la suite E2E corre en modo desarrollo y no puede detectar fallos de
prerenderizado — es la razón de que I-070 sobreviviera dos auditorías). **I-070 quedó corregido** el
mismo día con autorización expresa (D-121). Siguen abiertos I-068, I-066, I-062 e I-063.

### 6. Lo que debe revisar el siguiente agente

1. **Levanta Docker y ejecuta `test:db` y `test:e2e`** antes de promover nada. Cinco pruebas E2E
   cubren justo lo que D-120 tocó.
2. **Lee I-074 antes que nada.** El arnés E2E arranca en modo desarrollo, donde Next renderiza todo
   por petición: **no puede detectar ningún fallo de prerenderizado**, y por eso I-070 tuvo rota la
   recuperación de contraseña desde la Fase 7 sin que 294 pruebas dijeran nada. Todo cambio que
   dependa del modo de renderizado se comprueba a mano sobre `npm run build && npm start`.
3. **Para probar el worker en local: `npm run build && npm start`.** En `next dev` se desregistra a
   propósito.
4. **No añadas nada al matcher de `src/proxy.ts`** que no sea un archivo estático y público.
5. **No empieces a guardar respuestas autenticadas en el worker.** Hoy no hay nada que limpiar al
   cerrar sesión precisamente por eso (D-116).

### 7. Promoción a producción (2026-08-26)

**Desplegado con autorización expresa.** Vercel `READY` sobre **`cc64a99`**
(`dpl_9asLBwX7zTRh9vesgHRbv2vSDkvw`), alias `gestion-rifas.vercel.app`. CI **2/2**. **Sin
migraciones**: cero cambios bajo `supabase/`, así que la reversión es un Instant Rollback sin nada
que deshacer en la base.

Verificado en vivo: las 6 cabeceras —**con `worker-src 'self'`**, sin la cual el navegador
rechazaría el service worker—, las 4 rutas protegidas en 307, las **7 rutas públicas nuevas** en 200
con su tipo correcto, **0** claves de servicio en el HTML y los 15 fragmentos, el worker activo en el
alcance raíz con **19 entradas y 0 ajenas**, el manifiesto con sus 2 iconos `maskable`, y
`/forgot-password` **con la consola limpia y React hidratando**. Tiempos: 342–382 ms en caliente y
423–474 ms tras 60 s de pausa, sin arranque en frío. Detalle en `TEST_RESULTS.md`.

**Que el código servido es este commit** quedó probado con el método nuevo: `f300e003e18b`, el
identificador de versión derivado del commit, aparece en los fragmentos servidos. Eso cierra
**I-069**, abierto el día anterior por no existir forma de comprobarlo.

**Lo que falta y no puede hacer un agente:** entrar como los tres roles —exige contraseñas reales, y
automatizarlo es lo que provocó I-066— e **instalar la aplicación en un teléfono real**.
---

## Mantenimiento post-9 — el dinero de cada boleta se ve en la lista (2026-08-27)

**Encargo:** llevar la información financiera de una boleta —abonado, saldo, porcentaje y precio— a
las dos pantallas que listan boletas, con un diseño propio en cada una y sin tocar ninguna regla de
negocio. Decisión **D-130**.

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Fuente única de la cuenta | `ticketFinancials()` (`features/tickets/financials.ts`): abonado, saldo, porcentaje acotado a [0, 100] y si la boleta está vendida. Reutiliza `calculateCollectionSummary`. La usan **las cuatro** presentaciones con dinero de una boleta, incluido el resumen del detalle |
| «Mis boletas» — escritorio | Los dos números en **una** columna, «Boleta», con la leyenda «Diario · Semanal». Tres columnas nuevas —**Abonado · Falta · Progreso**— y una flecha al final. Fila de 57 px, sin fondos de color |
| «Mis boletas» — teléfono | La tarjeta gana un **pie financiero**: abonado, falta, porcentaje y barra, sobre fondo tenue y separado por una línea. Solo si la boleta está vendida |
| «Boletas de este cliente» | Lista **propia** (`ClientTicketsList`): tabla con «Estado de pago» (insignia + barra), «Abonado» y «Saldo pendiente» con su «de $120.000» debajo; y tarjetas con cifras grandes en el teléfono |
| Barra de cobro | `PaymentProgressBar` (`components/data/`): 4 px, `role="progressbar"`, verde/ámbar/gris, siempre acompañada del porcentaje escrito y de la insignia |
| Anchos | `meta.showFrom` en `DataTable` (`'lg' \| 'xl' \| '2xl'`), que manda sobre `hideOnMobile`. «Vendedor» y «Estado» desde `lg`; «Rifa», desde `2xl` |

### 2. Pruebas ejecutadas y resultados

`npm run verify` en verde: `typecheck` ✅, `lint` **0 errores** (los 2 avisos de siempre), **420/420**
unitarias (+11) y `build` ✅. **`test:db` 552/552** —sin cambios: este trabajo no toca la base— y
**`test:e2e` 305/305** (+8), con base sembrada limpia antes de la pasada.

Además, **medición real en el navegador** en seis anchos: a 1.280 px la tabla mide 959 px en 959 de
hueco en los dos portales, sin desbordar. **Tres errores encontrados y corregidos** —el desbordamiento
por el nombre del cliente, `showFrom` pisado por `hideOnMobile` y un localizador ambiguo— y **dos
pruebas ajenas ajustadas**, todo detallado en `TEST_RESULTS.md`.

### 3. Migraciones

**Ninguna.** No se tocó la base de datos: `sale_price` y `paid_amount` ya viajaban en cada fila del
listado.

### 4. Variables de entorno

**Ninguna nueva.**

### 5. Problemas que permanecen

Ninguno de este trabajo. Siguen abiertos I-077, I-072, I-074, I-075, I-068, I-066, I-062 e I-063.

**Lo que costó, y está decidido:** la tarjeta del teléfono de «Mis boletas» pasa de ~115 px a 166 px
cuando la boleta está vendida. Los topes de densidad de `boletas-movil.spec.ts` suben de 130 a 180 px
y de 400 a 560 px para tres tarjetas seguidas.

### 6. Lo que debe revisar el siguiente agente

1. **Si añades una columna a `TicketsTable`, mide el ancho.** A 1.280 px la tabla está exactamente en
   el límite; el siguiente sobrante tendrá que ganarse su `showFrom`.
2. **No fusiones las dos listas de boletas.** Comparten `ticketFinancials`, las insignias, la barra y
   el formato del dinero; la disposición es distinta a propósito (`ARCHITECTURE` §8.9 y §8.14.b).
3. **No repitas la resta.** Si vas a calcular un saldo de boleta, llama a `ticketFinancials()`.
4. **`showFrom` y `hideOnMobile` no se combinan**: el primero manda y el segundo sobra.
5. Este cambio es **solo frontend**: no hay nada que deshacer en la base si hay que revertir.

### 7. Promoción a producción (2026-08-27)

**Desplegado con autorización expresa.** Vercel `READY` sobre **`6ff1a8f`**
(`dpl_3tho7E21GFLiSzG82mLoiKATQD3C`), build de **31 s**, alias `gestion-rifas.vercel.app`.
**Sin migraciones**: cero cambios bajo `supabase/`, así que la reversión es un Instant Rollback
sin nada que deshacer en la base. `verify:remote` **14/14** después del despliegue, que confirma
que la base quedó intacta.

Verificado en vivo: las **6** cabeceras de seguridad en `/login` (200), las **4** rutas protegidas
en 307 y **0** claves de servicio en los 15 fragmentos servidos. **Que el código servido es este
commit** quedó probado con el método de I-069: el identificador de versión `93deb8b4a32d` —sha256
del commit recortado a 12 hex— aparece en 1 de esos fragmentos.

**Dos ajustes posteriores**, pedidos al verlo en producción y desplegados el mismo día
(**`599a3b6`**, `dpl_4Sksned7WwYoezGZTL6UXUrsdwYM`, identificador `54a8115886ee` comprobado en los
fragmentos servidos): el pie de la tarjeta pasa a una rejilla para que «Falta» arranque siempre en
el mismo punto, y «Progreso» se centra en su columna. E2E **305/305** antes de subirlo.

**Lo que falta y no puede hacer un agente:** entrar con una sesión real y mirar las dos pantallas.
Exige contraseñas reales, y automatizar eso es lo que provocó I-066.

---

## Mantenimiento post-9 — la barra lateral se estrecha y se cierra sola (2026-08-28)

**Encargo:** que la barra lateral de escritorio deje de quitarle ancho a la tabla de «Mis boletas»
cuando la ventana se estrecha: ancho eficiente, reducción progresiva, cierre automático cuando ya no
cabe, botón para abrirla y cerrarla a mano, y el teléfono **exactamente igual que ahora**. Decisión
**D-131**.

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Tres anchos | **232 px** desde 1.600; de **208 a 232** entre 1.360 y 1.600, de forma continua; **56 px** —solo iconos— por debajo de 1.360. Bajo `md` no existe: manda la barra inferior (D-106) |
| Punto de corte medido | 1.360 px = tabla más ancha de la aplicación (**1.050 px**) + barra abierta (208) + relleno (48) + barra de desplazamiento (15), redondeado. Ni un número elegido a ojo |
| Botón de abrir y cerrar | Arriba de la barra, con icono que cambia (`PanelLeftClose` / `PanelLeftOpen`), `aria-label`, `aria-expanded`, `aria-controls` y globo. Cuando no cabe abierta: `aria-disabled` y el globo explica por qué |
| Preferencia que se recuerda | Cookie `rifas.sidebar`, leída **en el servidor** por `AppShell`, así que el HTML ya sale con el ancho correcto y no hay parpadeo al hidratar |
| Preferencia ≠ sitio | `sidebar-preference.ts`: la falta de sitio **cierra** una barra abierta pero nunca **abre** una cerrada, y no borra la preferencia. Al recuperar el ancho, la barra vuelve como estaba |
| Nombres con la barra cerrada | Pasan a `sr-only` —no se borran— y aparecen en un globo con el ratón **y** con el foco del teclado |
| Interruptor de CSS | Cinco variables en `globals.css` declaradas dos veces (consulta de medios + `[data-sidebar='collapsed']`); las reglas que las consumen se escriben una sola vez |
| Sin escuchas de `resize` | `matchMedia`, que avisa una vez al cruzar el corte. Y la transición respeta `prefers-reduced-motion` |

### 2. Pruebas ejecutadas y resultados

`npm run verify` en verde: `typecheck` ✅, `lint` **0 errores** (los 2 avisos de siempre), **429/429**
unitarias (+9) y `build` ✅. **`test:db` 552/552** —sin cambios: este trabajo no toca la base— y
**`test:e2e` 315/315** (+10), con base sembrada limpia antes de la pasada.

Además, **medición real en el navegador en ocho anchos**, de 1.600 a 375 px: los tres anchos de la
barra, que ningún nombre se parte ni se recorta a 1.360 —el más apretado—, el centrado exacto de
iconos y botón con la barra cerrada, y **cero desplazamiento horizontal** en todos. El hueco de la
tabla del portal administrativo pasa de **705 a 905 px** a 1.024, y de 1.305 a **1.481** con la barra
cerrada a mano en una ventana amplia. **Tres errores encontrados y corregidos** —el atributo que
dejaba la barra clavada, una utilidad de Tailwind que no existe y siete fallos ajenos por base sin
sembrar—, todo detallado en `TEST_RESULTS.md`.

### 3. Migraciones

**Ninguna.** No se tocó la base de datos.

### 4. Variables de entorno

**Ninguna nueva.** Sí una **cookie nueva**, `rifas.sidebar`, que vale `expanded` o `collapsed`, no
lleva datos de nadie y la escribe la propia pantalla.

### 5. Problemas que permanecen

Ninguno de este trabajo. Siguen abiertos I-077, I-072, I-074, I-075, I-068, I-066, I-062 e I-063.

**Lo que costó, y está decidido:** el nombre de la organización comparte fila con el botón y dispone
de **139 px** en vez de 224, así que un nombre largo se recorta; se lee entero al pasar el ratón por
encima. Con «Rifas» sobra sitio.

### 6. Lo que debe revisar el siguiente agente

1. **El punto de corte está en dos archivos y tienen que decir lo mismo**: la consulta de medios de
   `globals.css` y `SIDEBAR_MIN_EXPANDED` en `sidebar-preference.ts`. Una prueba unitaria lo vigila,
   porque el CSS no se importa.
2. **`data-sidebar` lleva la preferencia, nunca el estado efectivo.** Ponerle el estado efectivo deja
   la barra clavada al ensanchar la ventana; ya pasó una vez.
3. **Si añades una columna a una tabla, vuelve a medir el corte.** 1.360 px sale de que la tabla más
   ancha pide 1.050; si esa cifra sube, el corte sube con ella.
4. **Tailwind 4 no genera `justify-[…]` con valor arbitrario.** Usa
   `[justify-content:var(--…)]`. Si Prettier deja una clase la primera del atributo, es que **no la
   reconoce**: mírala antes de darla por buena.
5. **Los cortes `xl` del detalle de una boleta y del panel del vendedor** se calcularon con la barra
   de 256 px y ahora hay más ancho disponible. **No se revisaron**, a propósito; están anotados en
   `ARCHITECTURE` §8.7 y §8.13.
6. Este cambio es **solo frontend**: no hay nada que deshacer en la base si hay que revertir.

### 7. Promoción a producción (2026-08-28)

**Desplegado con autorización expresa.** Vercel `READY` sobre **`322d80a`**
(`dpl_BXg8weHspbUPJAtiUbgSTVUUgE9r`), alias `gestion-rifas.vercel.app`, región `iad1`, build de
**29 s**. CI **2/2**, incluido el job de migraciones desde cero. **Sin migraciones**: cero cambios
bajo `supabase/`, así que la reversión es un Instant Rollback sin nada que deshacer en la base, y
`verify:remote` **14/14** después del despliegue confirma que la base quedó intacta.

Verificado en vivo: las **6** cabeceras de seguridad en `/login` (200), las **4** rutas protegidas en
307, **0** claves de servicio en los 16 recursos servidos (**1.029 KB**) y la consola sin un solo
error al cargar `/login`.

**Que el código servido es este commit** quedó probado por partida doble. Por el método de I-069: el
identificador de versión `12633e1a9961` —sha256 del commit recortado a 12 hex— aparece en 1 de los 16
fragmentos. Y por las **cinco huellas CSS** que en toda la aplicación genera **solo** este cambio, en
la hoja servida: `--sidebar-width: clamp(13rem, calc(10vw + 4.5rem), 14.5rem)`, la consulta de medios
de 85rem —minificada como `@media not all and (min-width:85rem)`—, `[data-sidebar=collapsed]`,
`sidebar-label` y `motion-reduce:transition-none`.

**Lo que falta y no puede hacer un agente:** entrar con una sesión real y abrir y cerrar la barra en
una ventana de portátil. Exige contraseñas reales, y automatizar eso es lo que provocó I-066.

---

## Mantenimiento post-9 — el menú se abre flotando donde no cabe (2026-08-28)

**Encargo:** el dueño probó D-131 y pidió lo contrario de su decisión 5. Donde la barra no cabe
abierta, el botón no debe quedarse inerte: debe abrirla **encima del contenido**, sin empujarlo, y
cerrarse sola al elegir una opción del menú o al pulsar fuera. Decisión **D-132**, que revoca D-131
§5 y **deja intacto todo lo demás**.

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| El botón siempre actúa | Con sitio (≥ 1.360 px) abre y cierra **empujando**, como en D-131. Sin sitio, abre **flotando**. Se acabó el `aria-disabled` |
| El contenido no se mueve | Al pasar la barra a `fixed`, un hueco del mismo ancho —56 px— se queda en el flujo. Medido: `main` en **x = 56, ancho = 1.029** antes y después de abrir |
| Cinco formas de cerrarla | Elegir una opción, pulsar fuera, `Escape`, llevarse el foco fuera, o cruzar de vuelta los 1.360 px |
| La capa | `z-[45]`, entre el encabezado (`z-40`) y la barra (`z-50`). Atenúa y recoge el clic de fuera. **No es un diálogo**: sin `aria-modal`, sin cepo de foco, sin `aria-hidden` sobre el resto |
| La preferencia no se toca | Flotar no escribe la cookie: es un vistazo, no una forma de trabajar. Comprobado en la prueba E2E leyendo las cookies del contexto |
| Tercera posición del interruptor | `aside[data-sidebar-overlay]` devuelve las cinco variables a sus valores de barra abierta, así que dentro de la barra nada sabe que está flotando |
| Dos textos, no tres | «Abrir el menú» y «Cerrar el menú». Desaparece «No hay espacio para abrir el menú. Amplía la ventana.» |

### 2. Pruebas ejecutadas y resultados

`npm run verify` en verde: `typecheck` ✅, `lint` **0 errores** (los 2 avisos de siempre), **432/432**
unitarias (+3) y `build` ✅. **`test:db` 552/552** y **`test:e2e` 320/320** (+5 netas: 6 nuevas y 1
retirada, la del botón inerte), con base sembrada limpia.

Medido en el navegador a 1.100 px: la barra pasa a `fixed`, 208 px de ancho, alto completo, capa por
debajo de ella, nombres visibles, **cero desplazamiento horizontal** y **el contenido quieto al
píxel**. A 1.600 px nada cambió: sigue empujando (232 → 56 px) y sigue guardando la cookie.

**Un error de diagnóstico, contado en `TEST_RESULTS`:** el cierre por foco parecía roto en las dos
implementaciones que se probaron. No lo estaba — el panel del navegador **no emite ni un evento de
foco** porque su ventana no tiene el foco del sistema. Se comprobó con una sonda que registró cero
eventos. Esa rama se verifica con Playwright.

### 3. Migraciones

**Ninguna.**

### 4. Variables de entorno

**Ninguna nueva.** La cookie `rifas.sidebar` sigue siendo la misma y con el mismo significado.

### 5. Problemas que permanecen

Ninguno de este trabajo. Siguen abiertos I-077, I-072, I-074, I-075, I-068, I-066, I-062 e I-063.

### 6. Lo que debe revisar el siguiente agente

1. **`data-sidebar` sigue llevando la preferencia** y `data-sidebar-overlay` es un atributo aparte.
   No los fundas en uno.
2. **El selector de la superposición lleva `aside` delante a propósito**:
   `[data-sidebar='collapsed']` vive en el mismo elemento y empata en especificidad.
3. **El hueco del flujo no es decorativo.** Si lo quitas, el contenido salta 56 px al abrir y otros
   56 al cerrar, que es justo lo que este trabajo vino a evitar.
4. **No conviertas la capa en un diálogo.** Sin cepo de foco a propósito; lo que hace falta —que el
   teclado no se quede detrás— lo resuelve el cierre por foco.
5. **El panel del navegador no emite eventos de foco ni de `resize`, y congela las transiciones.**
   Lo que dependa de esas tres cosas se comprueba con Playwright, no midiendo ahí.

### 7. Promoción a producción (2026-08-28)

**Desplegado con autorización expresa.** Vercel `READY` sobre **`1d12081`**
(`dpl_J1xFsPeirB6cgFdUWZoefysD5YaQ`), alias `gestion-rifas.vercel.app`, región `iad1`, build de
**27 s**. CI **2/2**, incluido el job de migraciones desde cero. **Sin migraciones**: la reversión es
un Instant Rollback sin nada que deshacer en la base, y `verify:remote` **14/14** después del
despliegue lo confirma.

Verificado en vivo: las **6** cabeceras de seguridad en `/login` (200), las **4** rutas protegidas en
307, **0** claves de servicio en los 16 recursos servidos (**1.030 KB**) y la consola sin un solo
error al cargar `/login`.

**Que el código servido es este commit**, por partida doble. Por el método de I-069: el identificador
de versión `e25b8f1dda89` aparece en 1 de los 16 fragmentos. Y por las **tres huellas CSS** que solo
genera D-132, leídas en la hoja servida: `--sidebar-width-expanded`, `aside[data-sidebar-overlay]` y
el `:not([data-sidebar-overlay])` de las reglas `sr-only`. Más la clase `.z-[45]` de la capa, que
tampoco existía antes.

**Lo que falta y no puede hacer un agente:** entrar con una sesión real, estrechar la ventana por
debajo de 1.360 px y abrir el menú flotante. Exige contraseñas reales, y automatizar eso es lo que
provocó I-066.

---

## Mantenimiento post-9 — resultados de loterías, Etapa 2 (2026-08-30)

**Encargo:** `ResultadosLoterias.txt` Etapa 2, autorizada expresamente («continúa con la etapa 2»).
Adaptadores de fuentes oficiales, testeables, **sin** activar cron, matching, avisos ni Panel.

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Descubrimiento CNJSA | Lee la página estable; elige el xlsx consolidado del año; no fija `idFile`; clasifica Acuerdo 887 / 889 / 888 |
| Cronograma ordinarios | ZIP (store + deflate) + XML. Hoja Extraordinarios descartada. 312 sorteos de las seis loterías en el archivo vigente |
| Fecha de referencia (D-143) | Día nominal de la misma semana lunes–domingo. Casos 2026 revalidados contra el xlsx oficial |
| Resultados | Un extractor por lotería: sorteo, fecha, premio mayor, serie. Ceros conservados. Extra de Medellín rechazado |
| Descarga (D-144) | HTTPS, allowlist, 15 s, 2 MB, 5 redirecciones. `server-only`. `download*` existe y no está programada |
| Fallos seguros | Cloudflare / Imunify / SPA vacía / PDF / estructura cambiada / dato ambiguo: no se inventa un número |

### 2. Pruebas ejecutadas y resultados

`npm run verify` en verde: `typecheck` ✅, `lint` **0 errores** (2 avisos de siempre), **499/499**
unitarias (+29: 24 de adaptadores y 5 de descarga) y `build` ✅. **`test:db` 609/609** —sin cambios
de esquema—. E2E no se reejecuta: no hay UI.

Un fallo encontrado y corregido: el extractor de Medellín tomaba «Sorteo número 4850» como premio
mayor en vez de 2608. `tsc` falló en la primera pasada por `noUncheckedIndexedAccess` y se corrigió
antes del verify.

El xlsx oficial se parseó una vez fuera de la suite (deflate, 98.970 bytes) y **no se commitea**.

### 3. Migraciones

**Ninguna.** La Etapa 1 dejó `0036`, todavía solo local.

### 4. Variables de entorno

**Ninguna nueva.**

### 5. Problemas que permanecen

**I-081:** Cundinamarca es SPA (el JSON oficial exige sorteo y número), Cruz Roja responde Imunify,
Bogotá responde Cloudflare. No se elude. Siguen abiertos I-077, I-072, I-074, I-075, I-068, I-062
e I-063.

### 6. Lo que debe revisar el siguiente agente

1. **No actives el cron ni llames `download*` desde una página.** La Etapa 3 orquesta; el Panel
   solo lee datos locales.
2. **No fijes un `idFile`.** El consolidado se descubre cada vez.
3. **No eludas I-081** ni uses un agregador. Cundinamarca se consulta por JSON cuando el sorteo
   ya es conocido.
4. **`tickets_select` no se toca.** `match_lottery_result` sigue siendo `service_role`.
5. **No hay etiqueta `fase-N`.** Es mantenimiento posterior al plan.

---

## Mantenimiento post-9 — resultados de loterías, Etapa 3 (2026-08-30)

**Encargo:** `ResultadosLoterias.txt` Etapa 3, autorizada expresamente («Incia Etapa 3»).
Sincronización, coincidencias y avisos, **sin** Panel ni cron de producción.

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Programación | `sync_lottery_schedules`: upsert idempotente. Conserva `reference_date` y `original_scheduled_at`. Solo sube `schedule_version` si cambia hora, estado o motivo |
| Resultados | `confirm_lottery_result`: persiste, hace matching, avisa y marca `completed` en una transacción. Publicación al día siguiente se acepta |
| Avisos | `lottery.result` y `lottery.schedule_change` en `notifications`. Un aviso por sorteo y destinatario. 48 h antes del cambio; el historial anual no spamea |
| Orquestación | `publication.ts` + `sync.ts`. Cundinamarca por JSON con sorteo conocido. Sin Route Handler |
| Corrección | `0038` castea `validation_status` al enum en el `ON CONFLICT` de `0037` |

### 2. Pruebas ejecutadas y resultados

`npm run verify` en verde: `typecheck` ✅, `lint` **0 errores** (2 avisos de siempre), **516/516**
unitarias (+17) y `build` ✅. **`test:db` 625/625** (+16). E2E no se reejecuta: no hay UI.

Un fallo encontrado y corregido: el `ON CONFLICT` de `0037` devolvía `text` en `validation_status`
y PostgreSQL rechazaba incluso el insert nuevo (`0038`). Otro, en la primera pasada sucia: 8
pruebas de `ticket-search` vacías porque `randomNumbers()` había creado un `0100` fuera de la
rifa ancla (I-035).

### 3. Migraciones

| Archivo | Qué hace |
|---|---|
| `0037_lottery_sync.sql` | Kinds de aviso, índices únicos, `sync_lottery_schedules`, `notify_lottery_schedule_changes`, `confirm_lottery_result` |
| `0038_lottery_confirm_enum_cast.sql` | `CREATE OR REPLACE` de `confirm_lottery_result` para el casteo del enum |

Ambas **solo local**.

### 4. Variables de entorno

**Ninguna nueva.**

### 5. Problemas que permanecen

**I-081:** Cundinamarca se consulta con `sorteo=` conocido; si la API sigue exigiendo un billete, el fallo se registra. Cruz Roja (Imunify) y Bogotá (Cloudflare) no se eluden. Siguen abiertos I-077, I-072, I-074, I-075, I-068, I-062 e I-063.

### 6. Lo que debe revisar el siguiente agente

1. **Etapa 4 es el Panel.** Lee `lottery_*` locales. No llames `download*` ni `syncDueLotteryResults` desde una página.
2. **No actives cron.** Eso es Etapa 5, y producción es Etapa 6 con autorización expresa.
3. **`0036`–`0038` no van a producción** en esta tanda.
4. **`tickets_select` no se toca.** Las coincidencias se leen de `lottery_ticket_matches`.
5. **No hay etiqueta `fase-N`.**

---

## Mantenimiento post-9 — resultados de loterías, Etapa 4 (2026-08-30)

**Encargo:** `ResultadosLoterias.txt` Etapa 4, autorizada expresamente («Inicia etapa 4»).
Recuadro de programación, resultados y coincidencias en el Panel, **sin** cron ni producción.

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Recuadro | `LotteryResultsCard` compartido en `/owner/dashboard` y `/seller/dashboard`, después de avisos e instalar |
| Lectura | `getLotteryDashboard`: `SELECT` local de programación, resultado y coincidencias. Un error no tumba el Panel |
| Hoy | Fecha de `official_scheduled_at` en Bogotá. Caben dos loterías el mismo día. El último confirmado se etiqueta aparte |
| Ámbito | RLS de coincidencias: vendedor, las suyas; personal, las de su organización |
| Textos | `LOTTERY_DASHBOARD_COPY`. Avisos de programación reutilizan `notificationMessage`. Serie informativa si existe |

### 2. Pruebas ejecutadas y resultados

`typecheck` ✅ · `lint` **0 errores** (2 avisos de siempre) · **534/534** unitarias (+18) ·
`build` ✅ · **`test:db` 626/626** (+1) · E2E de esta tanda **4/4** · regresión del resumen de
cobranza **4/4**. Una caída de `.next/dev/types` por `next dev` concurrente rompió un `tsc`
intermedio; se borró esa carpeta y volvió a pasar.

### 3. Migraciones

**Ninguna.**

### 4. Variables de entorno

**Ninguna nueva.**

### 5. Problemas que permanecen

**I-081** no cambia: el Panel no consulta esas fuentes. Siguen abiertos I-077, I-072, I-074, I-075,
I-068, I-062 e I-063.

### 6. Lo que debe revisar el siguiente agente

1. **Etapa 5 es el programador y el Route Handler**, todavía local. No actives cron ni secretos reales.
2. **No llames `download*` ni `syncDueLotteryResults` desde una página.** El Panel ya lee local.
3. **`0036`–`0038` no van a producción** en esta tanda. Producción es Etapa 6 con autorización expresa.
4. **`tickets_select` no se toca.**
5. **No hay etiqueta `fase-N`.**

---

## Mantenimiento post-9 — resultados de loterías, Etapa 5 (2026-08-30)

**Encargo:** `ResultadosLoterias.txt` Etapa 5, autorizada expresamente («Inicia etapa 5»).
Programador y Route Handler, **sin** producción ni cron real.

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Route Handler | `GET\|POST /api/lottery/sync`. Secreto a tiempo constante. Falla cerrado. `?probe=1` no descarga |
| Tick | Cerrojo `0039`, CNJSA una vez por día Bogotá, resultados según ventanas y reintentos ya definidos |
| Programador previsto | `cron-plan.ts` (Hobby: jobs diarios; Pro: cada 15 min). **`vercel.json` no declara `crons`** |
| Local | `npm run lottery:sync` habla con el Route Handler |

### 2. Pruebas ejecutadas y resultados

`npm run verify` en verde: `typecheck` ✅, `lint` **0 errores** (2 avisos de siempre), **549/549**
unitarias (+15) y `build` ✅. **`test:db` 631/631** (+5). E2E de esta tanda **4/4**. Panel **3/3**.

Errores encontrados: (1) `server-actions-guard` rechazaba el Route Handler sin `getAuthUser` —
excepción documentada por el secreto. (2) Primera `test:e2e` completa sucia por volumen de
`test:db` (I-075 + 5.000 boletas). Tras reset, esas specs pasan salvo un `back-navigation` de
clientes preexistente (D-136).

### 3. Migraciones

| Archivo | Qué hace |
|---|---|
| `0039_lottery_sync_lock.sql` | Tabla singleton + RPC de acquire/release. Sin EXECUTE para `authenticated` |

**Solo local en el momento de cerrar esta etapa.** La promoción es la Etapa 6.

### 4. Variables de entorno

`LOTTERY_SYNC_SECRET` (mínimo 16). Opcional `CRON_SECRET`. No entra en `check-env` / prebuild.

### 5. Problemas que permanecen

**I-081** no cambia. **I-082:** Hobby no admite un cron cada 15 min. Siguen abiertos I-077, I-072, I-074, I-075, I-068, I-062 e I-063.

### 6. Lo que debe revisar el siguiente agente

1. **Etapa 6 es producción**, con autorización expresa: migraciones, secreto, `crons` según el plan de Vercel, no push por su cuenta.
2. **No pongas `crons` en `vercel.json` ni el secreto en Vercel** sin esa autorización.
3. **No llames `download*` ni `runLotterySyncTick` desde una página.**
4. **`tickets_select` no se toca.**
5. **No hay etiqueta `fase-N`.**

---

## Mantenimiento post-9 — resultados de loterías, Etapa 6 (2026-08-30)

**Encargo:** `ResultadosLoterias.txt` Etapa 6, autorizada expresamente («Inicia etapa 6 y luego
tienes mi autorización para subir a producción»). Puesta en producción: migraciones,
programador Hobby y verificación remota.

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Programador | `vercel.json` declara los 10 jobs diarios de Hobby sobre `/api/lottery/sync` (D-149) |
| Secreto | Vercel inyecta `CRON_SECRET` y lo envía como Bearer. No se pone un `LOTTERY_SYNC_SECRET` distinto |
| Migraciones | `0036`–`0039` al proyecto real, tras respaldo lógico |
| Panel | Sigue leyendo solo datos locales (BR-L20) |

### 2. Pruebas ejecutadas y resultados

`npm run verify` en verde: `typecheck` ✅, `lint` **0 errores** (2 avisos de siempre), **549/549**
unitarias y `build` ✅. `verify:remote` **17/17**. Sonda de dinero idéntica. `test:db` no se
reejecutó: el esquema local no cambió. Detalle en `TEST_RESULTS.md`.

### 3. Migraciones

| Archivo | Qué hace |
|---|---|
| `0036_lottery_results.sql` | Programación, resultados, coincidencias, matching |
| `0037_lottery_sync.sql` | Sync, confirmación, avisos |
| `0038_lottery_confirm_enum_cast.sql` | Cast de enum en confirmación |
| `0039_lottery_sync_lock.sql` | Cerrojo del tick |

### 4. Variables de entorno

`CRON_SECRET` (inyectado por Vercel). `LOTTERY_SYNC_SECRET` opcional y, si existe, idéntico.

### 5. Problemas que permanecen

**I-081** (Cruz Roja Imunify, Bogotá Cloudflare, Cundinamarca SPA). **I-082** (precisión Hobby
±59 min). I-077, I-072, I-074, I-075, I-068, I-062, I-063. I-024 (sin backups automáticos).

### 6. Lo que debe revisar el siguiente agente

1. **No declares el job Pro (`*/15`)** mientras el proyecto pueda estar en Hobby.
2. **No pongas `LOTTERY_SYNC_SECRET` distinto de `CRON_SECRET`.**
3. **No llames `download*` ni `runLotterySyncTick` desde una página.**
4. **`tickets_select` no se toca.**
5. **No hay etiqueta `fase-N`.**
6. Cruz Roja y Bogotá pueden no confirmarse solas (I-081): no eludir.

---

## Mantenimiento post-9 — observación de los sorteos reales, etapa 6/6 (2026-09-01)

Autorizado expresamente. **Auditoría de solo lectura**: no se disparó ningún tick, no se desplegó, no
se aplicó ninguna migración y no se escribió ni una fila en producción. Última etapa del encargo de
corrección de loterías; **se repite después de cada ventana de publicación**.

### 1. Funcionalidades implementadas

**Ninguna.** Esta etapa observa; no cambia el producto. Ni una línea de código de la aplicación.

### 2. Pruebas ejecutadas y sus resultados

Detalle completo en [`TEST_RESULTS.md`](TEST_RESULTS.md), sección «etapa 6/6».

| Comprobación | Resultado |
|---|---|
| Las diez suites unitarias de loterías | **154/154 ✅** |
| Las seis fuentes oficiales, con el adaptador real | Cruz Roja **4939**, Medellín **2608** y Boyacá **7660** iguales dígito a dígito a lo guardado; Meta **8134** legible desde Colombia pero no desde Vercel; Bogotá `source_blocked`; Cundinamarca `scanned_document` |
| Cronograma contra CNJSA | El consolidado vigente sigue siendo `idFile=309186`, el mismo `source_url` de las 312 programaciones |
| Cron de Vercel | 10 jobs, ninguno `(disabled)`, con los horarios de `vercel.json` |
| Código servido en producción | Identificador `956d5c2c6c7d` → corre **`f9c6e49`**. 0 secretos en 1.035 KB |
| `/api/lottery/sync` | **401** sin secreto y **401** con un Bearer incorrecto |
| Panel con la RLS real | Dueño 27 programaciones, vendedor 27, anónimo `permission denied` |
| El Panel no consulta internet | Grafo de imports de las dos páginas: **0** módulos que alcancen la descarga, **0** que llamen a `fetch()` |
| Plan de la ventana del Panel | **1,13 ms** (línea base 0,406 ms; presupuesto de la prueba, 200 ms). Mismo plan e mismas 27 filas |
| Tiempo de servidor | `/login` 176–209 ms, `/denied` 119–218 ms: dentro de la banda de D-156 |

**Errores encontrados: ninguno en el producto.** Dos hallazgos de otra clase, los dos escritos:
**I-092** (un sorteo superado en la portada ya no es recuperable) y el aviso engañoso de
`vercel crons ls` sobre «cambios locales pendientes», que es un artefacto del CLI.

### 3. Migraciones que existen

**Ninguna nueva.** Siguen siendo **41**, la última `0041`, todas aplicadas al proyecto real.

### 4. Variables de entorno requeridas

Sin cambios. Confirmado con `vercel env ls production` (que muestra el nombre y nunca el valor):
`CRON_SECRET`, las tres de Supabase y `NEXT_PUBLIC_SITE_URL`. **`LOTTERY_SYNC_SECRET` no existe**, así
que no hay dos secretos que puedan discrepar. **`TZ` tampoco está declarada, y no hace falta**: todas
las conversiones de fecha fijan `America/Bogota` explícitamente (D-157.d, I-049 acotado).

### 5. Problemas reales que permanecen

| Problema | Impacto |
|---|---|
| **Ningún cron ha disparado todavía** | Las 7 corridas de `lottery_sync_runs` son las del tick manual de D-156. El ciclo **automático** aún no está demostrado. Los diez jobs se reactivaron después de las ventanas diurnas del 2026-09-01; el primero natural es a las **22:20 Bogotá** |
| **I-091** — el Meta bloquea a la IP de Vercel | Los miércoles hay que mirar su resultado a mano |
| **I-086** — actas de Cundinamarca escaneadas | Los lunes, a mano |
| **I-087** — Bogotá tras Cloudflare y Turnstile | Los jueves, a mano |
| **I-092** — ventana de captura de las portadas | Un sorteo no capturado a tiempo queda sin resultado para siempre. Ya pasó con **Boyacá 4638** |

### 6. Qué debe revisar el siguiente agente antes de comenzar

1. **`lottery_sync_runs`**: si hay corridas posteriores a las 14:30 del 2026-09-01, el programador ya
   disparó solo y esa es la comprobación que faltaba. Si sigue en 7, **no ha entrado ninguno** y hay
   que averiguar por qué antes de cualquier otra cosa.
2. **El sorteo de la Cruz Roja 3169** (2026-09-01, 22:55): es el primer ciclo entero observable
   —sorteo, tick de las 23:20, resultado, coincidencias, aviso y Panel—.
3. **Cundinamarca 4817 y 4818**: que sigan reintentándose y que ninguno agote sus seis intentos sin
   que quede escrito.
4. Los registros de ejecución de Vercel en Hobby duran alrededor de una hora: **la fuente es la
   tabla, no los logs**.
5. `HANDOFF.md` §1.a y las advertencias de D-157.

---

## Mantenimiento post-9 — promoción a producción y primer tick real, etapa 5/6 (2026-09-01)

Autorizado expresamente: respaldo, migración, push, despliegue, reactivación de los cron y un tick
controlado. **Ya en producción.** No se modificó a mano ninguna boleta, cliente, pago, saldo ni
número ganador.

### 1. Funcionalidades implementadas

Ninguna nueva: esta etapa **promueve** lo de las etapas 1 a 4 y lo comprueba con datos reales.

| Bloque | Qué quedó |
|---|---|
| Migración | **`0041`** aplicada al proyecto real tras el respaldo `Rifas-backups/2026-09-01-pre-0041/`. Aditiva, sobre una tabla con 0 filas |
| Despliegue | `145feab` en producción (`dpl_DExUn3Hop2vc3eF1Rn7bUv7bDXiY`), con D-152, D-153, D-154 y D-155 |
| Programador | Los **10 cron** reactivados por el dueño. Ni recreados ni duplicados |
| Primer tick real | El primero que entra autorizado en la historia del módulo. **312 programaciones** oficiales y **3 resultados confirmados** |
| Cundinamarca 4818 | Programación verificada contra CNJSA; acta **publicada pero escaneada** → **pendiente, sin número inventado**. Los cron la reintentan |

### 2. Pruebas ejecutadas y resultados

Antes: `test:db` **667/667**, `verify` ✅ (**646/646** unitarias), `verify:remote` **17/17**,
`db push --dry-run` con una sola migración pendiente. Después: `verify:remote` **17/17** otra vez.
CI **success** en los dos jobs tras relanzar un fallo de infraestructura (`rate limit` al resolver la
CLI de Supabase).

En vivo: 6/6 cabeceras, 0 secretos en 941 KB, 4/4 rutas protegidas en 307, `/sw.js` y el manifiesto
en 200, `/api/lottery/sync` en 401 sin secreto y con secreto incorrecto, e identificador de versión
`f282f0d813a0` encontrado en el JavaScript servido. El tick devolvió **200**.

El detalle completo —las 7 corridas, los planes de consulta, la lectura del Panel con la RLS real,
los cuatro errores encontrados y la comparación financiera— está en `TEST_RESULTS.md`.

### 3. Migraciones

| Archivo | Qué hace |
|---|---|
| `0041_lottery_sync_runs_schedule.sql` | Añade `lottery_sync_runs.schedule_id`, su `check` y su índice parcial, para contar los reintentos **por sorteo** (D-152, BR-L22). **Aplicada al proyecto real el 2026-09-01.** Total: **41** |

### 4. Variables de entorno

Ninguna nueva. Comprobado sin leer ni descargar ningún valor: **`CRON_SECRET` existe** en Production
y **`LOTTERY_SYNC_SECRET` no existe**, así que el handler usa la primera.

### 5. Problemas que permanecen

**I-084 cerrado**: los cron están activos. **Nuevo I-091**: la Lotería del Meta responde desde
Colombia pero **bloquea a la IP de Vercel**, así que en producción **no se confirma sola**; de cuatro
loterías automatizables quedan **tres**. Siguen: I-086 (actas de Cundinamarca escaneadas, confirmado
con el 4818), I-087, I-081, I-090, I-030, I-059, I-060, I-062, I-063, I-068, I-072, I-074, I-075,
I-077, I-024.

### 6. Qué revisar antes de continuar

1. **Mirar los próximos sorteos reales.** Martes Cruz Roja, viernes Medellín y sábado Boyacá deberían
   confirmarse solos; miércoles Meta, jueves Bogotá y lunes Cundinamarca hay que mirarlos a mano
   (`OPERATIONS` §7).
2. **Cundinamarca 4818 tiene 6 intentos y se le agotarán.** Si su acta sigue escaneada, quedará
   pendiente para siempre y sale de la ventana de 10 días el 2026-09-10.
3. **`TZ` no está en las variables de Production** aunque `DEPLOYMENT` §3.1 la dé por puesta. No
   cambia el comportamiento —Vercel corre en UTC—, pero conviene decidirlo (I-049).
4. Etapa siguiente del encargo: **6/6**, y necesita autorización expresa.

---

## Mantenimiento post-9 — el Panel deja de esperar por las loterías, etapa 4/6 (2026-09-01)

Autorizado expresamente. Rendimiento y aislamiento del Panel. **No cambia ninguna regla de
negocio, ninguna ruta, ninguna política de RLS y ningún texto salvo el del hueco de espera.**

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Aislamiento | El recuadro de resultados oficiales se dibuja dentro de **su propio límite de Suspense** (`LotteryResultsSection`, D-155). Las dos páginas del Panel dejan de importar y de esperar `getLotteryDashboard` |
| Hueco de espera | `LotteryResultsFallback`: la misma tarjeta con el **título real**, cuatro barras de 234 px en total, `aria-busy` y «Buscando los resultados oficiales…» para lector de pantalla |
| Plazo | `LOTTERY_DASHBOARD_TIMEOUT_MS` = 3 s, **un solo `AbortSignal.timeout` compartido por las dos consultas**. Si vence, la petición se cancela y el recuadro cae en el aviso de error que ya existía |
| Consultas | Constantes: 1 de programación + 1 de coincidencias **solo si hay resultados** en la ventana. Sin N+1 por sorteo, resultado, vendedor o boleta. Ni una consulta duplicada, ni capa `services` |
| Índices | **Ninguno nuevo**, decidido midiendo: la ventana es un barrido de una tabla nacional (1,9 ms con 1.599 filas) y las coincidencias las sirve el índice único `(result_id, ticket_id, match_field)` (2,5 ms con 8.025 filas) |
| Sin cambios | El recuadro muestra lo mismo, con las mismas reglas de «hoy» y de «Último resultado» (BR-L20). Cero peticiones a webs oficiales durante la navegación |

### 2. Pruebas ejecutadas y resultados

`npm run verify` ✅ (`typecheck`, lint **0 errores** y 2 avisos de siempre, **646/646** unitarias
(+10), `build`). `npm run test:db` **667/667** (+4). E2E **421/423** en la suite completa (22,7 min) y **39/39** en aislamiento: los dos fallos son **I-090**, dos pruebas que miden «las ventas de hoy» sobre datos que el resto de la suite acumula. Las **6 pruebas nuevas** de esta etapa pasan en las dos corridas.

**Medición, antes y después, con la aplicación construida y PostgREST retrasado 1,5 s solo en las
rutas de loterías:** el primer byte del Panel del dueño pasa de **1.628 ms a 131 ms** y el del
vendedor de **1.634 a 138 ms**; el recuadro llega a los ~1.640 ms, que es lo que tarda su propia
consulta. Sin retraso también mejora (174 → 134 y 142 → 132 ms). Método reproducible, planes de
consulta, recuentos de peticiones, alturas del hueco y los **cuatro errores encontrados durante la
medición** —uno de ellos la primera prueba en vivo del plazo, que se comportó como debía— están en
`TEST_RESULTS.md`.

### 3. Migraciones

Ninguna.

### 4. Variables de entorno

Ninguna nueva.

### 5. Problemas que permanecen

Los de siempre: I-030, I-059, I-060, I-062, I-063, I-068, I-072, I-074, I-075, I-077, I-081, I-082,
I-084, I-085, I-086, I-087, I-024. **Nuevo: I-090**, dos pruebas E2E que dependen del orden —defecto
de las pruebas, no del producto; en aislamiento pasan—. Una limitación aceptada y medida: el hueco de
espera no puede clavar la altura del recuadro, que va de 210 a 578 px según cuántos sorteos y
coincidencias haya; se eligió la altura de un bloque de sorteo y se explica en D-155 (d).

### 6. Qué revisar antes de continuar

1. **`0041` sigue solo en local** y el código de D-152 ya la usa. Los cron siguen **pausados**
   (I-084). Para desplegar hay que subir D-152 + D-153 + D-154 + D-155 juntos, aplicando `0041`
   antes.
2. **No devuelvas `getLotteryDashboard` al `Promise.all` de ninguna de las dos páginas.** Compila,
   pasa las pruebas de pantalla y devuelve el defecto sin ningún síntoma; por eso hay una prueba que
   lee el código fuente de las dos (`L-82`).
3. **Ninguna guarda de sesión puede bajar dentro del límite de Suspense.** Cuando sale el primer
   trozo, el estado HTTP ya se envió y un redirect deja de ser posible (`SECURITY.md` §4.8).
4. Etapa siguiente del encargo: **5/6**, y necesita autorización expresa.

---

## Mantenimiento post-9 — validación real de las seis fuentes oficiales, etapa 3/6 (2026-09-01)

**Encargo:** `PROMPT 3 — Validar y corregir las otras loterías`, autorizado expresamente.
Comprobar contra las fuentes oficiales reales —no contra fixtures— que cada adaptador obtiene y
valida el resultado ordinario más reciente. **No se desplegó nada. Sin migración.**

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Lectura anclada | Todo campo se lee dentro de la ventana que sigue a un encabezado con **sorteo y fecha juntos**. Nunca «la primera coincidencia de la página» (BR-L24) |
| Limpieza previa | `stripTags` borra `<script>`, `<style>`, `<noscript>`, `<template>` y comentarios, y quita etiquetas **respetando las comillas** de los atributos |
| Dígitos exactos | Tras una etiqueta se aceptan dígitos separados por espacios, se corta en la primera letra y la tirada tiene que medir **exactamente** lo esperado. Si no, no se publica |
| Serie después del mayor | Se busca dentro de la misma ventana y **detrás** del número mayor, para que no capture la de un seco |
| Señuelo ≠ muro | `imunify-bot-check` sale de las marcas de desafío. Se añade `cf-mitigated: challenge`, que Cloudflare manda sea cual sea el estado |
| Error distinguible nuevo | `classifyOfficialResultFit` → `match` / `not_published` / `ambiguous`. Una portada que aún muestra el sorteo anterior es una **espera**, no un formato roto |
| Cuatro loterías confirmadas | Cruz Roja 3168, Meta 3313, Medellín 4850 y Boyacá 4639, contra la fuente oficial **y** contra el cronograma CNJSA |

### 2. Pruebas ejecutadas y resultados

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ |
| `npm run lint` | ✅ 0 errores (2 avisos de siempre) |
| `npm run test` | ✅ **636/636** (+18) |
| `npm run build` | ✅ |
| `npm run db:reset && npm run seed:local` | ✅ |
| `npm run test:db` | ✅ **663/663** |
| `npx playwright test loterias-cron loterias-panel loterias-panel-movil` | ✅ **8/8** (la primera pasada agotó el arranque del servidor: I-075, `.next/dev` frío) |
| Ensayo en vivo contra las seis fuentes | 4 MATCH, 1 `scanned_document`, 1 `source_blocked`. Tabla completa en `TEST_RESULTS` |

**Errores encontrados y corregidos.** Tres defectos del producto, los tres invisibles desde las
pruebas porque los fixtures no reproducían las páginas reales:

1. **La Lotería del Meta publicaba `6262` como número mayor**, concatenado de los nombres de
   clase `.tdi_62,.tdi_62` de su hoja de estilos; el oficial era `8134`. Y la serie, `391`, de
   `body.page-id-391`. **Sorteo y fecha eran correctos**, así que nada aguas abajo podía
   frenarlo: se habría confirmado y habría marcado como coincidentes las boletas terminadas en
   6262 (**I-088**).
2. **La Cruz Roja estaba marcada como bloqueada sin estarlo**: Imunify360 inyecta un
   enlace-señuelo oculto en las páginas que **sí** entrega (**I-089**).
3. **La serie de la Cruz Roja era `200`**, tomada de «GANADOR SECO 200 MILLONES», en vez de `112`.

Y dos aciertos por casualidad, corregidos aunque ese día no dieran un dato falso: Boyacá fechaba
el sorteo con la primera fecha de la página —que está en un desplegable de fechas anteriores— y
Medellín tenía `08-05-2024` a un carácter, dentro de un comentario de Elementor.

Además fallaron **dos pruebas existentes**, y las dos estaban mal: un fixture del Meta con la
fecha en un formato que la página real no usa, y una que afirmaba que el señuelo de Imunify
significaba bloqueo —el defecto mismo—.

### 3. Migraciones que existen

**Ninguna nueva.** Sigue vigente `0041` (D-152), **solo en local**.

### 4. Variables de entorno requeridas

Sin cambios. `LOTTERY_SYNC_SECRET` o `CRON_SECRET` para el Route Handler.

### 5. Problemas reales que permanecen

| Id | Qué | Impacto |
|---|---|---|
| I-087 | **Bogotá no tiene ningún canal oficial automatizable.** Cloudflare en el sitio, Turnstile en su API, actas retiradas, Datos Abiertos con diez sorteos de retraso | Su resultado se revisa a mano. No se elude nada |
| I-086 | Las actas de Cundinamarca son escaneos sin texto | Igual: revisión manual, sin OCR |
| I-084 | Los cron siguen pausados por el dueño | Ningún tick corre hasta que se desplieguen `0041`, D-152, D-153, D-154 y D-155 |
| I-082 | Vercel Hobby dispara cada cron una vez al día, ±59 min | Los reintentos se reparten a lo largo del día |
| I-075 | La primera E2E con `.next/dev` frío agota su tiempo | Volver a lanzar; no es del código |
| I-077 | Producción sigue siendo el seed de desarrollo | Condición previa a datos reales |

### 6. Qué debe revisar el siguiente agente antes de comenzar

1. **`0041` sigue solo en local** y el código de D-152 ya la usa. No despliegues el frontend sin
   aplicarla.
2. **Los cron siguen pausados.** No los reactives sin desplegar antes.
3. **En el proyecto real, las cuatro tablas de loterías tienen 0 filas.** Comprobado el
   2026-09-01: ningún tick llegó nunca a completarse, así que no hay ni un número equivocado
   guardado.
4. **No relajes el largo exacto de la tirada de dígitos** de `labeledDigits` ni saques la lectura
   de su ventana anclada: eso es exactamente lo que producía I-088.
5. **No devuelvas `imunify-bot-check` a las marcas de desafío**, y no sigas ese enlace.
6. **No intentes resolver el Turnstile de Bogotá**, ni cambies el `User-Agent`, ni uses un proxy
   o un agregador.
7. Cuando cada adaptador corra de verdad por primera vez, **compara el número con la página
   oficial al día siguiente** (`OPERATIONS.md` §7).
8. `CorrecionesLoterias.txt`, el prompt de esta etapa y `prueba-abono.csv` son del dueño; no se
   commitean.

---

## Mantenimiento post-9 — adaptador del acta oficial de Cundinamarca, etapa 2/6 (2026-09-01)

**Encargo:** `PROMPT 2 — Sustituir el adaptador de Cundinamarca`, autorizado expresamente.
Sustituir el adaptador defectuoso por uno basado en las actas oficiales en PDF.
**No se desplegó nada. Sin migración.**

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Fuente nueva | El **acta oficial en PDF**. La URL se arma con el año y el sorteo de la programación: `/files/results-records/{año}/{sorteo}.pdf`. Una petición por sorteo |
| Fuente retirada | El **verificador de billetes** `/api/v1/result/public`: fuera la URL, la función que la armaba, la rama JSON del extractor y el host de la allowlist |
| Allowlist | El host de Azure se autoriza **solo con su ruta** (`ALLOWED_SOURCE_PATHS`), comprobada también en cada redirección |
| Validación de la descarga | HTTPS, host, ruta, estado, tipo de contenido, **firma `%PDF-`**, tamaño (tope propio de 6 MB) y timeout |
| Lector de PDF | `parse/pdf.ts`, mínimo y acotado: flujos de contenido, operadores de texto, `FlateDecode`. **Sin librería nueva y sin OCR** |
| Lectura del acta | Solo una fila **inequívoca** de `PREMIO MAYOR`, con el sorteo que se esperaba. Ceros iniciales intactos; serie informativa y opcional |
| Estados propios | `not_published` (404, se reintenta), `scanned_document` (PDF sin texto), `ambiguous` (dos candidatas, otro sorteo, número corto) |
| Evidencia | URL final, autoridad, hash y campos estructurados. **Ni el PDF ni su texto** |

### 2. Pruebas ejecutadas y resultados

`npm run verify` en verde: `typecheck` ✅, `lint` **0 errores** (2 avisos de siempre),
**618/618** unitarias (+39) y `build` ✅. `npm run test:db` **663/663** (sin migración; se
ejecuta para probar que nada regresó).

Errores encontrados y corregidos, **todos de las pruebas**: la prueba vieja importaba la función
del verificador ya retirada; otra daba por buena la lectura del JSON de ese verificador; el
cuerpo simulado de `fetch` no encajaba en `BodyInit`; y quedaban scripts de exploración en la
raíz que rompían el lint. Detalle en `TEST_RESULTS.md`.

### 3. Migraciones

**Ninguna.** Esta etapa no toca el esquema. Sigue pendiente de promover la `0041` de la etapa 1.

### 4. Variables de entorno

Ninguna nueva.

### 5. Problemas reales que permanecen

**I-086** (abierto, y es el importante): **las actas de Cundinamarca son PDF escaneados sin capa
de texto** —cero fuentes, solo imágenes, `/Author CamScanner`—, así que **Cundinamarca no se
confirma automáticamente**. El adaptador hace lo correcto: registra `scanned_document` y no
inventa nada. El resultado queda para revisión manual, como Cruz Roja y Bogotá (I-081). **I-085**
queda resuelto con la retirada del verificador. **I-084** sigue: los cron los pausó el dueño el
2026-09-01. Siguen I-082, I-077, I-072, I-074, I-075, I-068, I-062, I-063 e I-024.

### 6. Lo que debe revisar el siguiente agente

1. **Cundinamarca no se arregla insistiendo con el adaptador**: el acta no tiene texto (I-086).
   OCR es la única vía técnica que queda y **no está autorizada**; un dígito mal leído marcaría
   boletas ajenas como coincidentes.
2. **No devuelvas el verificador de billetes** ni su host a la allowlist: no descubre nada y su
   certificado está vencido (I-085).
3. **No autorices `blob.core.windows.net` entero.** El host va con su ruta, siempre.
4. **`0041` sigue solo en local** y el código de D-152 ya la usa.
5. **No hay etiqueta `fase-N`.** Siguiente etapa autorizable: validar las otras cinco loterías (3/6).

---

## Mantenimiento post-9 — estabilizar el sincronizador de loterías, etapa 1/6 (2026-09-01)

**Encargo:** `CorrecionesLoterias.txt`, PROMPT 1, autorizado expresamente. Corregir el
sincronizador para que una ejecución automática nunca recorra el cronograma anual ni exceda un
presupuesto seguro de trabajo. **No se desplegó nada.**

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Horizonte | La consulta de resultados solo mira sorteos ya jugados de los últimos **10 días** —el mismo horizonte hacia atrás que el Panel (D-147)— y hasta `now`: un sorteo que no ha jugado no puede tener resultado |
| Tope por tick | **6 descargas externas** como máximo, una por lotería. Lo que no cabe se informa como `deferred` y lo atiende el tick siguiente |
| Tope de candidatos | **60** filas examinadas, red de seguridad que además mantiene el `in.()` lejos del límite de URI de PostgREST |
| Orden | Determinista: `official_scheduled_at desc`, `lottery_code asc`. Dos ticks con los mismos datos eligen los mismos sorteos |
| Reintentos | Se cuentan **por sorteo** (`lottery_sync_runs.schedule_id`, `0041`), no por lotería |
| Aislamiento de etapas | Si la etapa de resultados se cae entera, el tick devuelve `results.errorCode` y **conserva** la programación ya sincronizada |
| Programación | **No se toca:** el cronograma anual se sigue guardando completo, porque hace falta para avisar de cambios y festivos (BR-L18) |

### 2. Pruebas ejecutadas y resultados

`npm run verify` en verde: `typecheck` ✅, `lint` **0 errores** (2 avisos de siempre),
**579/579** unitarias (+5) y `build` ✅. `npm run test:db` **663/663** (+12).

Errores encontrados y corregidos durante el trabajo, todos en las pruebas nuevas: tres dobles de
`syncResults` sin los campos nuevos; `URI too long` al limpiar la bitácora con 318 UUID; y un
`duplicate key` porque la corrida fallida anterior había dejado el cronograma puesto. Detalle,
con las cifras de la causa reproducida, en `TEST_RESULTS.md`.

### 3. Migraciones

| Archivo | Qué hace |
|---|---|
| `0041_lottery_sync_runs_schedule.sql` | Añade `lottery_sync_runs.schedule_id` (FK `on delete set null`), su CHECK de `kind` y el índice parcial `(schedule_id, started_at DESC)` |

**Solo local.** No se promovió al proyecto real.

### 4. Variables de entorno

Ninguna nueva. Se **corrige** lo que decían los documentos: `CRON_SECRET` la crea una persona en
Vercel; **no la genera Vercel al declarar `crons`**. Sin ella, el programador recibe 401 en cada
ejecución, que es lo que pasó del 2026-08-30 al 2026-09-01 (I-083).

### 5. Problemas que permanecen

**I-084** (abierto): los diez cron siguen **activos** y este entorno no puede pausarlos —el MCP de
Vercel no los expone y la CLI no tiene token—. Mientras `0041` y el código de D-152 no estén
desplegados, un tick autorizado corre con el comportamiento anterior. **I-081** (Cruz Roja
Imunify, Bogotá Cloudflare, Cundinamarca SPA) e **I-082** (precisión Hobby ±59 min) no cambian.
Siguen I-077, I-072, I-074, I-075, I-068, I-062, I-063 e I-024.

### 6. Lo que debe revisar el siguiente agente

1. **`0041` está solo en local.** El código ya la usa: no despliegues el frontend sin aplicarla.
2. **Los cron siguen activos** (I-084). Confírmalo antes de tocar nada.
3. **No subas el tope de descargas «para ponerse al día»:** es lo que provoca que una fuente
   oficial bloquee la IP (I-081).
4. **El horizonte y la ventana del Panel están atados por una prueba.** Cambiar uno exige decidir
   sobre el otro.
5. **No llames `download*` ni `runLotterySyncTick` desde una página.**
6. **No hay etiqueta `fase-N`.** Siguiente etapa autorizable: el adaptador de Cundinamarca (2/6).

---

## Mantenimiento post-9 — «Ventas por fecha», reporte del vendedor (2026-08-31)

Autorizado expresamente. Añade un reporte al portal del vendedor. **No toca el portal
administrativo**, ni reglas de venta, pagos, saldos, rebajas, ganancias ni RLS.

### 1. Funcionalidades implementadas

| Bloque | Qué hay |
|---|---|
| Reporte | **«Ventas por fecha»** en `/seller/reports?report=sales-by-date`. Es el que se abre al entrar a `/seller/reports`, **sin redirección**: el día de hoy se deduce de que la URL no traiga fechas |
| Indicadores | Boletas vendidas · Total vendido · Abonado · Saldo pendiente, calculados en SQL sobre **todo** el rango por `report_sales_totals` (`0040`). Se cumple `vendido − abonado = saldo` |
| Detalle | Fecha · Boleta (sus dos números) · Cliente · Precio · Abonado · Falta · Pago. Cliente y boleta enlazan dentro del portal del vendedor. Paginación **de servidor**, orden `sale_date desc, assigned_at desc, id` |
| Definición de venta | La de siempre (BR-T05): `inventory_status = 'assigned'` fechada por `tickets.sale_date`. Las anuladas no entran |
| Significado | «Abonado» es lo que llevan pagado **hoy** esas boletas, no el dinero recibido esos días. La pantalla lo explica con un ejemplo (BR-T06). **«Pagos por fecha» no se tocó** |
| Predeterminado por portal | `OWNER_REPORT_KEYS` y `SELLER_REPORT_KEYS`; el primero de cada lista manda (BR-T07). `/owner/reports` conserva «Por vendedor» |
| CSV | Mismas fechas y filtros que la pantalla, todas las filas hasta `EXPORT_ROW_LIMIT`, `;` + BOM + CRLF + `DD/MM/AAAA`, protección de fórmulas, y aviso si se alcanza el tope |
| Rendimiento | Índice `tickets_sale_date_idx` (`0040`), **elegido midiendo** con 300.000 boletas: 59 ms → 0,74 ms en el caso normal |

### 2. Pruebas ejecutadas y resultados

`npm run verify` ✅ (`typecheck`, lint 0 errores, **574/574** unitarias, `build`). `npm run test:db`
**651/651**. E2E de esta tanda **23/23** (18 escritorio + 5 móvil) y suite completa **416/417**: el
único fallo es el de orden de ejecución que ya registró D-150 —el pago anulado del seed sale de los
5 más recientes—, verde en aislamiento con base limpia. Los errores encontrados —cinco en las pruebas
de base de datos y siete en las E2E, **todos de las pruebas, ninguno del producto**— y las medidas de
rendimiento están en `TEST_RESULTS.md`.

### 3. Migraciones

| Archivo | Qué hace |
|---|---|
| `0040_report_sales_by_date.sql` | `report_sales_totals(from, to)` —`stable`, `security invoker`, `search_path` fijo, sin parámetro de vendedor ni de organización— y el índice parcial `tickets_sale_date_idx (sale_date desc, assigned_at desc) where inventory_status = 'assigned'`. **Aplicada al proyecto real el 2026-08-31**, tras el respaldo `Rifas-backups/2026-08-31-pre-0040/`. No contiene ninguna sentencia de datos |

### 4. Variables de entorno

Ninguna nueva.

### 5. Problemas que permanecen

Los de siempre: I-030, I-062, I-063, I-068, I-072, I-074, I-075, I-077, I-081, I-082, I-024. Ninguno
nuevo. Queda **una observación de fuera de alcance**: otras suites de `tests/db` limpian pagos por
PostgREST e ignoran el error, así que su limpieza puede no estar ocurriendo (ver `TEST_RESULTS.md`,
apartado b.1). No se tocó.

### 6. Lo que debe revisar el siguiente agente

1. **`0040` ya está en el proyecto real** (2026-08-31). Es inmutable: cualquier ajuste es una
   migración nueva.
2. **No pongas `seller_id` delante en `tickets_sale_date_idx`.** Se midió y es peor; la prueba
   `D151-05` falla si alguien lo «mejora» así.
3. **No devuelvas las guardas `is null` a `report_sales_totals`.** Valen 60 ms y un barrido de tabla.
4. **No añadas «Ventas por fecha» a `OWNER_REPORT_KEYS`** sin decidirlo: el encargo lo dejó fuera.
5. **`tickets_select` no se tocó** y no hace falta tocarla.
6. **No hay etiqueta `fase-N`**: es mantenimiento.
