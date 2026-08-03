# ESTADO DE LAS FASES

Registro de lo entregado por fase. **Leer antes de iniciar cualquier fase.**
Ninguna fase comienza sin autorización explícita del usuario (`CLAUDE.md` §1).
Para arrancar una sesión nueva, empieza por [`HANDOFF.md`](HANDOFF.md).

- **Actualizado:** 2026-08-03 · **Fase actual:** 3 completada · **Siguiente:** 4 (no autorizada)

| Fase | Nombre | Estado | Commit / etiqueta |
|---|---|---|---|
| 0 | Arquitectura y planificación | ✅ | `b4b991c` · `fase-0` |
| 1 | Proyecto base y autenticación | ✅ | `34b3cb1` · `fase-1` |
| 2 | Base de datos, restricciones y RLS | ✅ | `954531c` · `fase-2` |
| 3 | Portal Owner y Admin | ✅ | `fase-3` |
| 4 | Portal Seller y clientes | ⬜ | — |
| 5 | Pagos, abonos y saldos | ⬜ | — |
| 6 | Dashboards, reportes y UI/UX | ⬜ | — |
| 7 | Pruebas, seguridad y endurecimiento | ⬜ | — |
| 8 | Despliegue y documentación operativa | ⬜ | — |
| 9 | Auditoría final independiente | ⬜ | — |

---

## ANTES DE EMPEZAR LA FASE 4 — revisar esto

1. **Confirmar autorización explícita** del usuario para la Fase 4.
2. **Leer** `CLAUDE.md`, `docs/HANDOFF.md` y la sección «Fase 4» de `docs/IMPLEMENTATION_PLAN.md`.
   No hace falta leer los demás documentos completos (guía en `HANDOFF.md` §5).
3. **Levantar el entorno** y comprobar que todo pasa antes de tocar nada:
   `npx supabase start` → `npm run db:reset && npm run seed:local` → `npm run test:db` (143 ✅) →
   `npm run verify` (✅) → `npm run test:e2e` (41 ✅).
4. **Aplicar la migración `0011` al proyecto real** si aún no se ha hecho
   (`npx supabase db push --db-url "$SUPABASE_DB_URL"`). Está en local, no en el remoto. Sin ella,
   desactivar a un usuario lo hace desaparecer del listado (I-011).
5. **Reutilizar lo que ya existe** en vez de duplicarlo: `DataTable`, `StatusBadge`, `EmptyState`,
   `ConfirmDialog`, `MoneyInput`, `TicketNumberInput`, `PageHeader`, `MetricCard`,
   `DataTablePagination`. El portal del vendedor debe verse igual que el administrativo.
6. **Usar `assign_ticket`**, no un `UPDATE` directo, para asignar boletas a clientes: copia el precio
   vigente, valida rifa activa, cliente del mismo vendedor y estado, y audita.
7. **Los clientes ya se leen** en `features/clients/queries.ts` (consulta global del portal admin).
   La Fase 4 añade `schemas.ts` y `actions.ts` de ese mismo módulo; no crear otro.
8. **Para desarrollar y probar, `npm run dev:local`** (D-047). `npm run dev` apunta al proyecto real
   según `.env.local` (I-013).
9. **Las pruebas E2E asumen el seed recién cargado.** Si fallan de forma extraña, ejecutar
   `npm run db:reset && npm run seed:local` antes de investigar.

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

**Aplicada en local. Pendiente de aplicar en el proyecto real** (ver `KNOWN_ISSUES.md` §4).

### Variables de entorno requeridas

Las mismas de las fases 1 y 2. Ninguna nueva. `npm run dev:local` y las pruebas end-to-end no usan
`.env.local` para apuntar a Supabase: inyectan las credenciales de la instancia local (D-047).

### Problemas reales que permanecen

| ID | Problema | Impacto |
|---|---|---|
| I-011 | La migración `0011` no está aplicada al proyecto real | **Medio**: en producción, desactivar a un usuario lo oculta del listado. Un solo comando lo resuelve |
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

## Comandos

```bash
npx supabase start     # instancia local (Docker)
npm run db:reset       # reaplica las 11 migraciones desde cero (local)
npm run seed:local     # datos de desarrollo en local
npm run seed           # datos de desarrollo en el proyecto de .env.local
npm run test:db        # 143 pruebas de base de datos
npm run test:e2e       # 41 pruebas end-to-end (Playwright)
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
