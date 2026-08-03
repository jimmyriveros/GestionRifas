# ARQUITECTURA

- **Versión:** 1.1 · **Fase:** 3 · **Actualizado:** 2026-08-03
- Documentos relacionados: `docs/DATA_MODEL.md`, `docs/SECURITY.md`, `docs/IMPLEMENTATION_PLAN.md`

---

## 1. Principios arquitectónicos

1. **La base de datos es la última frontera de seguridad.** RLS + restricciones `CHECK`/`UNIQUE`/FK
   garantizan las invariantes aunque falle todo lo demás. El frontend nunca es frontera de seguridad.
2. **Defensa en tres capas.** Toda regla crítica se valida en cliente (UX), servidor (autorización y
   Zod) y base de datos (restricción o función). Ninguna capa confía en la anterior.
3. **El dinero se calcula en SQL.** El frontend formatea; no decide saldos ni estados.
4. **Server-first.** React Server Components para lectura; Server Actions para escritura. El cliente
   se usa solo donde hay interactividad real (formularios, tablas, filtros).
5. **Operaciones compuestas = una función de base de datos.** Todo lo que deba ser atómico
   (pagos, creación masiva, asignación) se ejecuta en una RPC de PostgreSQL, nunca como una secuencia
   de llamadas desde el navegador.
6. **Módulos por dominio (feature-first).** El código se agrupa por capacidad de negocio, no por tipo
   de archivo.
7. **Tipos generados, no escritos a mano.** Los tipos de base de datos se generan desde el esquema.

---

## 2. Stack y versiones

Versiones estables verificadas en el registro de npm el 2026-08-02. Se fijan con `^` salvo indicación.

| Componente | Paquete | Versión objetivo | Nota |
|------------|---------|------------------|------|
| Runtime | Node.js | `>=20.9.0` (local: 20.20.2) | Requisito de Next 16 |
| Framework | `next` | `16.2.12` | App Router |
| UI | `react`, `react-dom` | `19.2.8` | |
| Lenguaje | `typescript` | `5.9.3` | **No** 7.x — ver D-002 |
| Estilos | `tailwindcss` | `4.3.3` | Motor v4, configuración CSS-first |
| Componentes | `shadcn` (CLI) | `4.16.1` | Genera componentes en el repo, no es dependencia runtime |
| Backend | `@supabase/supabase-js` | `2.109.0` | **No** 2.110+ — ver D-029 |
| Sesiones SSR | `@supabase/ssr` | `0.12.0` | Cookies en proxy y servidor — ver D-029 |
| CLI/BD local | `supabase` (devDep) | `2.111.0` | Migraciones y entorno local |
| Formularios | `react-hook-form` | `7.84.0` | |
| Validación | `zod` | `4.4.3` | Esquemas compartidos cliente/servidor |
| Puente RHF/Zod | `@hookform/resolvers` | `5.7.1` | |
| Tablas | `@tanstack/react-table` | `8.21.3` | Instalado en F3 |
| Virtualización | `@tanstack/react-virtual` | `3.14.9` | Instalado en F3 (carga masiva) |
| Fechas | `date-fns` + `@date-fns/tz` | `4.4.0` | Manejo de `America/Bogota` |
| Notificaciones | `sonner` | `2.0.7` | Toasts (usado por shadcn/ui) |
| Pruebas unitarias | `vitest` | `4.1.10` (entorno `jsdom@29.1.1`) | jsdom 30 exige Node 22+ — ver D-030 |
| Pruebas E2E | `@playwright/test` | `1.62.1` | Instalado en F3 con Chromium; 41 specs |
| Lint | `eslint` + `eslint-config-next` | `9.39.5` / `16.2.12` | **No** ESLint 10 — ver D-031 |
| Formato | `prettier` + `prettier-plugin-tailwindcss` | `3.9.6` | |
| WebSocket (Node 20) | `ws` | `8.21.1` | Runtime dep — ver D-033 |

**Restricciones de compatibilidad detectadas en la Fase 0 y la Fase 1** (mismo patrón en los tres
casos: la versión `latest` de un paquete se adelantó a sus propias dependencias o a sus peers):

| Paquete fijado | Versión | Motivo | Decisión |
|---|---|---|---|
| `typescript` | `5.9.3`, no 7.x | `typescript-eslint@8` exige `typescript <6.1.0` | D-002 |
| `@supabase/supabase-js` | `2.109.0`, no 2.110+ | 2.110+ exige Node ≥22; el proyecto usa Node 20.19+ | D-029 |
| `@supabase/ssr` | `0.12.0`, no 0.12.4 | Única versión cuyo peer acepta `supabase-js@2.109.0` | D-029 |
| `jsdom` | `29.1.1`, no 30.x | jsdom 30 exige Node ≥22.22 / ≥24.15 / ≥26 | D-030 |
| `eslint` | `9.39.5`, no 10.x | `eslint-plugin-react` interno de `eslint-config-next` no admite ESLint 10 | D-031 |

No se usarán versiones `beta`, `rc`, `canary` ni `next` de ningún paquete.

---

## 3. Topología del sistema

```
┌──────────────┐   HTTPS    ┌───────────────────────────┐   postgres   ┌──────────────────┐
│  Navegador   │──────────▶ │  Next.js en Vercel        │─────────────▶│  Supabase        │
│ (móvil/desk) │            │  · RSC (lectura)          │              │  · PostgreSQL    │
└──────────────┘            │  · Server Actions (escr.) │              │  · RLS           │
                            │  · Middleware (sesión)    │              │  · Auth          │
                            └───────────────────────────┘              │  · RPC / SQL     │
                                                                       └──────────────────┘
```

- El navegador **nunca** recibe la `SUPABASE_SERVICE_ROLE_KEY`.
- El cliente del navegador usa la clave pública y queda sujeto a RLS.
- Las operaciones sensibles pasan por Server Actions que revalidan sesión, organización y rol.

---

## 4. Clientes de Supabase

| Cliente | Archivo | Contexto | Clave | Uso |
|---------|---------|----------|-------|-----|
| Browser | `src/lib/supabase/client.ts` | Componentes cliente | Publishable | Lecturas reactivas puntuales |
| Server | `src/lib/supabase/server.ts` | RSC y Server Actions | Publishable + cookies de sesión | Uso principal, sujeto a RLS |
| Proxy | `src/lib/supabase/proxy.ts` | `src/proxy.ts` | Publishable | Refresco de sesión y guardas de ruta — ver D-027 |
| Admin | `src/lib/supabase/admin.ts` | **Solo servidor**, invitaciones y seed | `SERVICE_ROLE` | Marcado `import 'server-only'` |

**Nota (D-027):** Next.js 16 renombró `middleware.ts`/`export function middleware()` a `proxy.ts`/
`export function proxy()`. El archivo de nivel raíz es `src/proxy.ts`; el helper de este cliente vive
en `src/lib/supabase/proxy.ts` (antes documentado como `middleware.ts`).

`src/lib/supabase/admin.ts` incluirá `import 'server-only'` para que el build falle si alguna vez se
importa desde un componente cliente.

---

## 5. Arquitectura de carpetas

```
/
├── CLAUDE.md                     # Fuente principal de verdad
├── README.md
├── .env.example
├── .gitignore
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── docs/                         # Documentación obligatoria (§28 CLAUDE.md)
├── supabase/
│   ├── config.toml
│   ├── migrations/               # NNNN_nombre.sql versionadas, inmutables una vez aplicadas
│   ├── functions/                # (reservado) Edge Functions si llegaran a necesitarse
│   └── seed.sql                  # Datos de desarrollo, sin secretos
├── scripts/
│   ├── seed-users.ts             # Crea usuarios de auth con service role (contraseñas por env)
│   └── check-env.ts              # Verifica variables requeridas antes de build
├── tests/
│   ├── unit/                     # Vitest: dinero, validadores, cálculo de estados
│   ├── db/                       # Vitest: restricciones, RLS, RPC (contra Supabase local)
│   └── e2e/                      # Playwright
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── globals.css
    │   ├── error.tsx / not-found.tsx
    │   ├── (public)/
    │   │   ├── login/page.tsx
    │   │   ├── forgot-password/page.tsx
    │   │   └── reset-password/page.tsx
    │   ├── (protected)/
    │   │   ├── layout.tsx                 # Verifica sesión + membresía activa
    │   │   ├── account/password/page.tsx  # Cambio de contraseña (todos los roles)
    │   │   ├── owner/                     # Guard: rol owner|admin
    │   │   │   ├── layout.tsx
    │   │   │   ├── dashboard/page.tsx
    │   │   │   ├── raffles/…
    │   │   │   ├── users/…                # Administradores
    │   │   │   ├── sellers/…
    │   │   │   ├── tickets/…              # incluye bulk/
    │   │   │   ├── clients/…
    │   │   │   ├── payments/…
    │   │   │   └── reports/…
    │   │   └── seller/                    # Guard: rol seller
    │   │       ├── layout.tsx
    │   │       ├── dashboard/page.tsx
    │   │       ├── tickets/…
    │   │       ├── clients/…
    │   │       └── payments/…
    │   ├── auth/callback/route.ts         # Intercambio de código de Supabase Auth
    │   └── denied/page.tsx                # Acceso denegado
    ├── components/
    │   ├── ui/                   # shadcn/ui generado
    │   ├── layout/               # AppShell, Sidebar, MobileNav, Header, UserMenu
    │   ├── data/                 # DataTable, DataTableToolbar, Pagination, EmptyState
    │   ├── feedback/             # Skeletons, ErrorState, ConfirmDialog, Toaster
    │   └── form/                 # FormField, MoneyInput, TicketNumberInput, DatePicker
    ├── features/
    │   ├── auth/                 # actions.ts, schemas.ts, queries.ts, components/
    │   ├── organizations/
    │   ├── raffles/
    │   ├── users/                # admins + perfiles
    │   ├── sellers/
    │   ├── clients/
    │   ├── tickets/              # incluye bulk/
    │   ├── payments/
    │   ├── reports/
    │   └── audit/
    ├── lib/
    │   ├── supabase/             # client | server | middleware | admin
    │   ├── auth/                 # getSession, requireRole, guards de servidor
    │   ├── money.ts              # formatCOP, parseCOP — enteros
    │   ├── dates.ts              # zona America/Bogota
    │   ├── errors.ts             # AppError, mapeo de códigos PG a mensajes en español
    │   ├── csv.ts                # exportación
    │   └── constants.ts          # DEFAULT_TICKET_PRICE = 100000, límites, etiquetas
    ├── types/
    │   └── database.types.ts     # Generado: supabase gen types typescript (D-034: manual hasta la Fase 2)
    └── proxy.ts                  # Antes middleware.ts — ver D-027
```

**Convención de módulo de feature** (obligatoria desde la Fase 3):

```
features/<dominio>/
├── schemas.ts      # Zod, compartido cliente/servidor. Única fuente de validación.
├── queries.ts      # Lecturas para RSC ('server-only')
├── actions.ts      # Server Actions ('use server'): auth → zod → RPC/DML → revalidate
├── mappers.ts      # Fila de BD → tipo de vista
└── components/     # UI del dominio
```

---

## 6. Rutas de Next.js

Grupo `(public)` — sin sesión. Grupo `(protected)` — exige sesión y membresía activa.

| Ruta | Rol | Fase | Descripción |
|------|-----|------|-------------|
| `/` | — | 1 | Redirige a `/login` o al dashboard según rol |
| `/login` | público | 1 | Única página de autenticación |
| `/forgot-password` | público | 1 | Solicitud de recuperación |
| `/reset-password` | público (con token) | 1 | Definir nueva contraseña |
| `/auth/callback` | público | 1 | Route Handler de intercambio de código |
| `/denied` | autenticado | 1 | Acceso denegado |
| `/account/password` | todos | 1 | Cambio de contraseña |
| `/owner/dashboard` | owner, admin | 1 → **3 ✅** → 6 | Métricas generales |
| `/owner/raffles` | owner, admin | **3 ✅** | Listado de rifas |
| `/owner/raffles/new` | owner, admin | **3 ✅** | Crear rifa |
| `/owner/raffles/[raffleId]` | owner, admin | **3 ✅** | Detalle (la edición está en `/edit`) |
| `/owner/raffles/[raffleId]/edit` | owner, admin | **3 ✅** | Edición (bloqueada en rifas cerradas o anuladas) |
| `/owner/users` | owner, admin | **3 ✅** | Administradores |
| `/owner/sellers` | owner, admin | **3 ✅** | Vendedores |
| `/owner/sellers/[sellerId]` | owner, admin | **3 ✅** | Detalle del vendedor |
| `/owner/tickets` | owner, admin | **3 ✅** | Tabla global de boletas |
| `/owner/tickets/new` | owner, admin | **3 ✅** | Creación individual |
| `/owner/tickets/bulk` | owner, admin | **3 ✅** | Creación masiva (1–1.000) |
| `/owner/tickets/[ticketId]` | owner, admin | **3 ✅** | Detalle, edición, anulación, aprobación |
| `/owner/clients` | owner, admin | **3 ✅** | Consulta global de clientes |
| `/owner/clients/[clientId]` | owner, admin | **3 ✅** | Perfil de cliente |
| `/owner/payments` | owner, admin | 5 | Consulta global y anulación |
| `/owner/reports` | owner, admin | 6 | Reportes + exportación CSV |
| `/seller/dashboard` | seller | 1 (placeholder) → 4 → 6 | Métricas propias |
| `/seller/tickets` | seller | 4 | Boletas propias |
| `/seller/tickets/new` | seller | 4 | Crear boletas (si la rifa lo permite) |
| `/seller/tickets/[ticketId]` | seller | 4 | Detalle y asignación |
| `/seller/clients` | seller | 4 | Clientes propios |
| `/seller/clients/new` | seller | 4 | Crear cliente |
| `/seller/clients/[clientId]` | seller | 4 | Perfil con boletas e historial |
| `/seller/payments` | seller | 5 | Registro e historial de pagos |
| `/seller/payments/new` | seller | 5 | Registrar abono/pago |

**Nota de nomenclatura:** el prefijo de ruta es `/owner` para Owner **y** Admin, tal como exige
`CLAUDE.md` §21. El segmento de URL no implica que el usuario sea Owner; el rol se verifica en cada
operación.

---

## 7. Flujo de datos

### 7.1 Lectura
```
RSC (page.tsx)
  └─ features/<dom>/queries.ts   ('server-only')
       └─ createServerClient() con cookies de sesión
            └─ SELECT sujeto a RLS  ─────▶  solo filas visibles para el usuario
```
No se filtran datos "a mano" en el frontend por seguridad: se filtra por RLS y, adicionalmente, por
cláusulas explícitas para eficiencia y claridad.

### 7.2 Escritura
```
Componente cliente (RHF + Zod)
  └─ Server Action ('use server')
       1. requireUser()            → sesión válida
       2. requireActiveMembership() → membresía activa (bloquea usuarios inactivos)
       3. requireRole([...])        → rol autorizado
       4. schema.parse(input)       → Zod, sin mass assignment (allowlist de campos)
       5. supabase.rpc(...) o DML   → RLS + CHECK + FK como red final
       6. mapPgError(e)             → mensaje comprensible en español
       7. revalidatePath(...)
       8. return { ok } | { error }
```

### 7.3 Funciones transaccionales (RPC)

Definidas en Fase 2; su interfaz se congela aquí. Todas son `SECURITY DEFINER` con
`SET search_path = public, pg_temp` y validan permisos internamente.

| Función | Fase | Responsabilidad | Atomicidad |
|---------|------|-----------------|-----------|
| `create_payment(p_client_id, p_total_amount, p_payment_date, p_payment_method, p_notes, p_allocations jsonb)` | 2 (fn) / 5 (UI) | Crea pago + asignaciones, valida sobrepago con bloqueo de filas, audita | Sí — una transacción |
| `void_payment(p_payment_id, p_reason)` | 2 / 5 | Marca anulación, recalcula saldos, audita | Sí |
| `assign_ticket(p_ticket_id, p_client_id, p_sale_date)` | 2 / 4 | Valida disponibilidad y propiedad, copia `sale_price`, cambia estado, audita | Sí |
| `bulk_create_tickets(p_raffle_id, p_seller_id, p_rows jsonb)` | 2 / 3 | Inserta lote, devuelve filas insertadas y conflictos por índice | Sí por lote |
| `approve_tickets(p_ticket_ids uuid[])` | 2 / 3 | `pending_approval` → `available`, audita | Sí |
| `cancel_ticket(p_ticket_id, p_reason)` | 2 / 3 | Anula boleta si no tiene pagos activos, audita | Sí |
| ~~`create_user_membership(...)`~~ | — | **Descartada en la Fase 3 (D-045).** Una función SQL no puede llamar a `auth.admin`, así que el alta necesitaba igualmente la service role desde el servidor. El alta la hace `features/users/actions.ts`: invitación por correo + inserción de la membresía **sujeta a RLS** | — |

Funciones auxiliares de seguridad (`STABLE`, `SECURITY DEFINER`): `current_profile_id()`,
`current_org_ids()`, `has_org_role(org uuid, roles text[])`. Detalle en `docs/SECURITY.md` §4.1.

---

## 8. Arquitectura de UI

### 8.1 Estructura visual
- **Escritorio:** `AppShell` con sidebar fijo, header con selector de rifa activa y menú de usuario.
- **Móvil (mobile-first):** header compacto + drawer de navegación; acciones primarias accesibles con
  el pulgar; tablas degradan a listas de tarjetas.

### 8.2 Componentes transversales

| Componente | Propósito |
|------------|-----------|
| `DataTable` | Envoltura de TanStack Table: ordenamiento, paginación, selección, estado vacío, skeleton |
| `FilterBar` | Filtros con chips y botón «Limpiar filtros» siempre visible |
| `MoneyInput` / `formatCOP` | Entrada y presentación de enteros COP |
| `TicketNumberInput` | Solo dígitos, máx. 4, preserva ceros, `inputMode="numeric"` |
| `StatusBadge` | Badge **con texto** (nunca solo color) para estados de inventario y pago |
| `ConfirmDialog` | Confirmación de acciones sensibles (anular, desactivar, aprobar) |
| `EmptyState` | Estado vacío con acción sugerida |
| `PageSkeleton` | Carga mediante `loading.tsx` por segmento |

### 8.3 Etiquetas en español (fuente única: `lib/constants.ts`)

| Valor en BD | Etiqueta |
|-------------|----------|
| `draft` | Borrador |
| `pending_approval` | Pendiente de aprobación |
| `available` | Disponible |
| `assigned` | Asignada |
| `cancelled` | Anulada |
| `unpaid` | Sin pagar |
| `partial` | Abonada |
| `paid` | Pagada |

### 8.4 Accesibilidad
Contraste AA · foco visible · etiquetas asociadas a inputs · errores anunciados con `aria-live` ·
navegación por teclado · nunca depender solo del color (siempre texto o icono acompañante).

---

## 9. Configuración regional

- **Dinero:** entero de pesos. `formatCOP(100000) === "$100.000"` usando
  `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`
  con normalización del separador. Nunca se usa `toFixed` ni aritmética flotante.
- **Fechas de negocio** (`sale_date`, `payment_date`): tipo `date`, interpretadas en `America/Bogota`.
  El valor por defecto en el servidor se obtiene con la función SQL `today_bogota()`.
- **Marcas de tiempo técnicas** (`created_at`, `updated_at`, `voided_at`, …): `timestamptz` en UTC,
  presentadas en `America/Bogota`.
- El proceso de Node se ejecuta con `TZ=UTC`; la conversión a hora local es explícita en la capa de
  presentación (`lib/dates.ts`). Así el resultado no depende del reloj del servidor de Vercel.

---

## 10. Rendimiento

- Índices para todo filtro frecuente (ver `docs/DATA_MODEL.md` §5).
- Sin N+1: las vistas de listado consultan con `join`/vistas agregadas, no en bucle.
- `paid_amount` **materializado** en `tickets` y mantenido por trigger → los listados no agregan en
  tiempo real y los saldos son indexables.
- Paginación en servidor (`range`) para todas las tablas grandes.
- Creación masiva: virtualización de filas + envío en lotes de 100 con indicador de progreso.
- `revalidatePath` selectivo tras cada mutación; sin sobre-invalidar.

---

## 11. Estrategia de datos de desarrollo (seed)

Dos piezas separadas, porque los usuarios de `auth.users` no deben crearse desde SQL plano:

1. **`scripts/seed-users.ts`** — usa `SERVICE_ROLE` (solo local) y
   `auth.admin.createUser()` para crear Owner, Admin y dos Sellers. Las contraseñas se leen de
   variables de entorno (`SEED_OWNER_PASSWORD`, …). **Nunca** se versionan contraseñas.
2. **`supabase/seed.sql`** — crea la organización, membresías, una rifa activa de `$100.000`,
   clientes, boletas disponibles/asignadas y pagos parciales y completos, referenciando a los usuarios
   por email.

Ejecución: `supabase db reset` (aplica migraciones + `seed.sql`) seguido de `npm run seed:users`.
El seed es idempotente: si el dato existe, no se duplica.

Detalle y datos exactos: `docs/IMPLEMENTATION_PLAN.md` Fase 2 y `docs/TESTING.md` §6.

---

## 12. Estrategia de despliegue

| Entorno | Frontend | Base de datos | Propósito |
|---------|----------|---------------|-----------|
| Local | `next dev` | Supabase local (Docker) | Desarrollo y pruebas de BD/RLS |
| Preview | Vercel Preview (por rama) | Proyecto Supabase de staging | Revisión funcional |
| Producción | Vercel Production | Proyecto Supabase de producción | Operación real |

**Migraciones:** versionadas en `supabase/migrations`, inmutables una vez aplicadas a producción.
Cambios posteriores se hacen con una migración nueva. Promoción con `supabase db push` desde CI,
nunca editando el esquema por la interfaz web.

**Variables de entorno:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (públicas,
D-028) y `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, marcada como sensible en Vercel). `scripts/check-env.ts`
falla el build si falta alguna.

**Reversión:** cada migración incluye una nota de reversión documentada; los datos se protegen con
backups automáticos de Supabase (PITR en producción). Detalle en Fase 8.

---

## 13. Riesgos arquitectónicos

Registro completo con probabilidad, impacto y mitigación en `docs/KNOWN_ISSUES.md` §2.
Los tres principales:

1. **Recursión de RLS** al consultar `memberships` dentro de políticas de `memberships`.
   Mitigación: funciones `SECURITY DEFINER` que omiten RLS, marcadas `STABLE`.
2. **Sobrepago bajo concurrencia** (dos abonos simultáneos sobre la misma boleta).
   Mitigación: `SELECT … FOR UPDATE` ordenado por `ticket_id` dentro de la RPC + `CHECK` sobre la
   columna materializada `paid_amount`.
3. **Congelamiento del navegador con 1.000 filas.**
   Mitigación: virtualización, validación diferida (debounce), envío por lotes y trabajo en el
   servidor para la detección de duplicados existentes.
