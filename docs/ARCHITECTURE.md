# ARQUITECTURA

- **Versión:** 1.11 · **Estado:** implementado · **Actualizado:** 2026-08-24
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
| Runtime | Node.js | `>=20.19.0` | Requisito declarado en `package.json` |
| Framework | `next` | `16.3.0` | App Router. Subido en F7: resuelve 3 avisos altos de `npm audit` (DT-12) |
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
| Pruebas E2E | `@playwright/test` | `1.62.1` | Chromium; 213 pruebas (escritorio y móvil) |
| Lint | `eslint` + `eslint-config-next` | `9.39.5` / `16.3.0` | **No** ESLint 10 — ver D-031 |
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
                            │  · Proxy (sesión)         │              │  · Auth          │
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
├── AGENTS.md                     # Instrucciones operativas para Codex
├── CLAUDE.md                     # Especificación original e instrucciones para Claude Code
├── README.md
├── .env.example
├── .gitignore
├── next.config.ts
├── vercel.json                   # Solo `fluid: true` (D-106). Las cabeceras NO van aquí
├── tsconfig.json
├── eslint.config.mjs
├── vitest.config.mts
├── vitest.db.config.mts
├── playwright.config.ts
├── docs/                         # Fuentes del proyecto; mapa en HANDOFF.md §5
├── supabase/
│   ├── config.toml
│   └── migrations/               # 0001–0021; inmutables una vez aplicadas
├── scripts/
│   ├── seed.ts                   # Seed unificado e idempotente; local o remoto explícito
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
    │   ├── layout/               # AppShell, NavLinks, BottomNav, UserMenu
    │   ├── data/                 # DataTable, Pagination, MetricCard, StatusBadge, EmptyState
    │   ├── feedback/             # Skeletons y ConfirmDialog
    │   └── form/                 # MoneyInput, TicketNumberInput, OptionList, SelectionCheckbox
    ├── features/
    │   ├── auth/                 # actions.ts y schemas.ts
    │   ├── raffles/
    │   ├── users/                # admins + perfiles
    │   ├── sellers/
    │   ├── clients/
    │   ├── tickets/              # incluye bulk/
    │   ├── payments/
    │   ├── reports/
    │   ├── search/               # Búsqueda híbrida compartida
    │   └── tour/                 # Recorridos guiados
    ├── lib/
    │   ├── supabase/             # client | server | proxy | admin | paginate (fetchAllRows, I-011)
    │   ├── auth/                 # getAuthUser, getActiveMembership y guardas de servidor
    │   ├── money.ts              # formatCOP, parseCOP — enteros
    │   ├── dates.ts              # zona America/Bogota; distingue día calendario de instante (I-017)
    │   ├── errors.ts             # mapeo de códigos PG a mensajes en español (D-044)
    │   ├── csv.ts                # exportación: separador ;, BOM, anti-inyección de fórmulas (D-056)
    │   ├── rate-limit.ts         # limitación de intentos, en memoria (D-062)
    │   ├── security-headers.ts   # CSP con nonce + cabeceras estáticas (D-061)
    │   └── constants.ts          # DEFAULT_TICKET_PRICE = 120000 (D-098), límites, etiquetas
    ├── types/
    │   └── database.types.ts     # Generado con supabase gen types typescript
    └── proxy.ts                  # Antes middleware.ts — ver D-027
```

**Convención de módulo de feature** (aplicada según lo que necesite cada dominio):

```
features/<dominio>/
├── schemas.ts      # Zod, compartido cliente/servidor. Única fuente de validación.
├── queries.ts      # Lecturas para RSC ('server-only')
├── actions.ts      # Server Actions ('use server'): auth → zod → RPC/DML → revalidate
└── components/     # UI del dominio
```

No se crea por defecto una capa paralela de `services`, `repositories`, estado global o `hooks`
genéricos. Primero se reutilizan las consultas, acciones y componentes existentes; una abstracción
nueva solo se justifica cuando resuelve repetición real en más de un consumidor (D-086).

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
| `/owner/dashboard` | owner, admin | 1 → 3 → **6 ✅** | Métricas generales (`CLAUDE.md` §23 completo) |
| `/owner/raffles` | owner, admin | **3 ✅** | Listado de rifas |
| `/owner/raffles/new` | owner, admin | **3 ✅** | Crear rifa |
| `/owner/raffles/[raffleId]` | owner, admin | **3 ✅** | Detalle (la edición está en `/edit`) |
| `/owner/raffles/[raffleId]/edit` | owner, admin | **3 ✅** | Edición (bloqueada en rifas cerradas o anuladas) |
| `/owner/users` | owner, admin | **3 ✅** | Administradores |
| `/owner/sellers` | owner, admin | **3 ✅** | Vendedores |
| `/owner/sellers/[sellerId]` | owner, admin | **3 ✅** · post-9 | Detalle del vendedor, su equipo y su comisión (BR-E08) |
| `/owner/tickets` | owner, admin | **3 ✅** | Tabla global de boletas |
| `/owner/tickets/new` | owner, admin | **3 ✅** | Creación individual |
| `/owner/tickets/bulk` | owner, admin | **3 ✅** | Creación masiva (1–1.000) |
| `/owner/tickets/[ticketId]` | owner, admin | **3 ✅** | Detalle, edición, anulación, aprobación |
| `/owner/clients` | owner, admin | **3 ✅** | Consulta global de clientes |
| `/owner/clients/[clientId]` | owner, admin | **3 ✅** | Perfil de cliente |
| `/owner/payments` | owner, admin | **5 ✅** | Consulta global y anulación |
| `/owner/reports` | owner, admin | **6 ✅** | Cinco reportes con filtros + exportación CSV |
| `/seller/dashboard` | seller | 1 → 4 → **6 ✅** | Métricas propias (`CLAUDE.md` §23 completo) |
| `/seller/tickets` | seller | **4 ✅** | Boletas propias |
| `/seller/tickets/new` | seller | **4 ✅** | Crear boletas (si la rifa lo permite) |
| `/seller/tickets/[ticketId]` | seller | **4 ✅** | Detalle y asignación |
| `/seller/clients` | seller | **4 ✅** | Clientes propios |
| `/seller/clients/new` | seller | **4 ✅** | Crear cliente |
| `/seller/clients/[clientId]` | seller | **4 ✅** | Perfil con boletas |
| `/seller/clients/[clientId]/edit` | seller | **4 ✅** | Edición del cliente |
| `/seller/team` | seller | post-9 ✅ | **Mi equipo.** Siempre en el menú, tenga equipo o no (BR-E01) |
| `/seller/team/[sellerId]` | seller | post-9 ✅ | Detalle de un integrante y sus ventas. Un id ajeno responde «no encontrada», no «denegado» (BR-E05) |
| `/seller/payments` | seller | **5 ✅** | Historial de pagos |
| `/seller/payments/new` | seller | **5 ✅** | Registrar abono |
| `/seller/reports` | seller | **6 ✅** | Sus reportes, sin el que compara vendedores (D-059) |
| `/api/reports/export` | según rol | **6 ✅** | Descarga CSV. **Fuera de `(protected)` a propósito**: un Route Handler no pasa por el layout, así que se protege a mano (D-060) |

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
       1. authorizeAction([...])    → sesión, membresía activa y rol
       2. schema.safeParse(input)   → Zod, sin mass assignment (allowlist de campos)
       3. createClient()            → cliente de la sesión, sujeto a RLS
       4. supabase.rpc(...) o DML   → RLS + CHECK + FK como red final
       5. mapPgError(e)             → mensaje comprensible en español
       6. revalidatePath(...)
       7. return { ok } | { error }
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
| `approve_tickets(p_ticket_ids uuid[])` | 2 / 3 | `pending_approval` → `available`, audita | Una transacción, pero omite inelegibles (I-044) |
| `cancel_ticket(p_ticket_id, p_reason)` | 2 / 3 | Anula boleta si no tiene pagos activos, audita | Sí |
| ~~`create_user_membership(...)`~~ | — | **Descartada en la Fase 3 (D-045).** Una función SQL no puede llamar a `auth.admin`, así que el alta necesitaba igualmente la service role desde el servidor. El alta la hace `features/users/actions.ts`: invitación por correo + inserción de la membresía **sujeta a RLS** | — |
| `bulk_assign_tickets(ids, client, date)` · `bulk_cancel_tickets(ids, reason)` · `bulk_change_ticket_seller(ids, seller)` · `bulk_delete_tickets(ids, reason)` | post-9 | Acciones masivas (BR-B01..BR-B08). Bloquean las filas en orden de id, revalidan todo y aplican o abortan | Sí — **todo o nada** |
| `ticket_bulk_eligibility(ids)` | post-9 | Qué admite cada boleta seleccionada. **`SECURITY INVOKER`**: solo lee y hereda `tickets_select` | — |
| `import_tickets_with_clients(raffle, seller, rows)` | post-9 | Importación Owner/Admin: crea boletas, resuelve un cliente conservadoramente y reutiliza `assign_ticket_row` | Sí — clientes, boletas, asignaciones y contador |
| `match_ticket_import_clients(raffle, seller, clients)` | post-9 | Coincidencias acotadas a una cartera para la vista previa; no escribe | — |

**`assign_ticket` y `cancel_ticket` ya no llevan las reglas dentro: delegan** (D-083). Su cuerpo se
extrajo a `assign_ticket_row` y `cancel_ticket_row`, que también usan las versiones masivas en bucle.
Firma, resultado y mensajes no cambian. El cambio de vendedor recorrió el camino inverso: sus reglas
vivían en la Server Action y ahora están en `bulk_change_ticket_seller`, que usan tanto el cambio
individual como el masivo.

Funciones auxiliares de seguridad (`STABLE`, `SECURITY DEFINER`): `current_profile_id()`,
`current_org_ids()`, `has_org_role(org uuid, roles app_role[])`. Detalle en `docs/SECURITY.md` §4.1.

El flujo anterior es la norma de las acciones parametrizadas de negocio. Autenticación y `logout`
usan guardas propias; I-051 registra una acción auxiliar que todavía no valida con Zod.

---

## 8. Arquitectura de UI

### 8.1 Estructura visual
- **Escritorio:** `AppShell` con sidebar fijo, nombre de la organización y menú de usuario.
- **Móvil (mobile-first):** header compacto + **barra de navegación inferior** (§8.8, D-106);
  acciones primarias accesibles con el pulgar; las tablas conservan su estructura y ocultan columnas
  secundarias (D-048). El **drawer** que había hasta el 2026-08-23 ya no existe.

Las dos barras **nunca conviven**: la lateral es `hidden md:flex` y la inferior, `md:hidden`.

### 8.2 Componentes transversales

| Componente | Propósito |
|------------|-----------|
| `DataTable` | Envoltura de TanStack Table: ordenamiento, paginación, selección, estado vacío, skeleton y **fila seleccionable** (`rowHref` / `onRowActivate`, D-076). En modo selección, `onRowSelect` hace que la fila marque en vez de abrir, y `onRowLongPress` da el atajo táctil (D-085) |
| `DataTablePagination` | La paginación de los **ocho** listados. Servidor: escribe `page` en la URL. Dice qué cuenta —«1–25 de 118 boletas», con el nombre de `LIST_ITEM_LABELS`— y bajo `md` reparte la fila de otra forma: botones de 44 px en los dos márgenes e indicador centrado entre ellos (§8.12, D-111) |
| `TicketsList` | El envoltorio de la lista de boletas: **una fuente de datos, dos presentaciones** (§8.9, D-107). Escritorio recibe `TicketsTable`; el teléfono, `TicketCardList`. Lo elige Tailwind, no JavaScript |
| `TicketCardList` | La lista de boletas en el teléfono (D-107): una tarjeta de 95–115 px por boleta con sus **seis** datos. Sin consulta, sin efecto, sin estado propio; reutiliza `row-activation.ts` y `useLongPress`, igual que `DataTable` |
| `row-activation.ts` | Reglas de la fila seleccionable: qué clic la abre y cuál ya lo atiende otro elemento (D-076) |
| `use-long-press.ts` | Pulsación larga con el dedo: solo táctil, se cancela si el dedo se mueve, y anula el `click` posterior (D-085) |
| `SelectionCheckbox` | Casilla de 20 px con diana de 44 px. Cuadrada, nunca circular: un círculo se lee como «elige uno» (D-085) |
| `useMediaQuery` / `useIsCompactScreen` | Consulta de medios sin romper la hidratación. Solo para decidir **comportamiento**; lo que se ve lo decide Tailwind |
| `OptionList` / `OptionListItem` | Lista de opciones elegibles (clientes). Estados **excluyentes** normal/hover/foco/elegido/elegido+hover/deshabilitado, con visto además del color (D-077) |
| `SearchInput` | Campo de búsqueda compartido: etiqueta, limpiar, indicador retrasado, `aria-busy` (D-078). `touchSize` sube campo y botón a 44 px **solo bajo `md`** (D-108) |
| `PageHeader` | Título, descripción y acciones de cada pantalla. `inlineActions` sube la acción a la fila del título en el teléfono; sin esa bandera, la disposición de siempre (§8.10, D-108). **No impone tamaño a sus acciones**: la pantalla que quiera la fila táctil se lo pide a sus botones (§8.11, D-109) |
| `TicketSelectionModeButton` | Enciende y apaga el modo selección del teléfono: «Seleccionar varias» / «Cancelar». Se pinta en la fila de «Filtros», no en la barra de selección (§8.10, D-108) |
| `useUrlSearch` | Búsqueda híbrida para listas paginadas: el término va a la URL y el RSC reconsulta |
| `useRemoteSearch` | Búsqueda híbrida para diálogos y selectores, contra una Server Action, con testigo de secuencia |
| `lib/search.ts` | Normalización del término y valores por defecto (pausa, mínimos). Lo usan navegador y servidor |
| Filtros de cada dominio | Controles en URL, paginación y acción «Limpiar filtros» |
| `MoneyInput` / `formatCOP` | Entrada y presentación de enteros COP |
| `TicketNumberInput` | Solo dígitos, máx. 4, preserva ceros, `inputMode="numeric"` |
| `StatusBadge` | Badge **con texto** (nunca solo color) para estados de inventario y pago |
| `DonutChart` / `TrendChart` | Los dos gráficos del panel del vendedor: SVG dibujado en el servidor, **sin librería y sin JavaScript** en el navegador. Escalan con `viewBox`, igual que `ProgressRing` (§8.13, D-112) |
| `CollectionSummaryCard` | Resumen de cobranza del panel (D-090): recibe `totals` ya agregado, no calcula nada; barra de progreso accesible con el mismo patrón que `BulkTicketCreator` |
| `CommissionCard` | «Tu ganancia» del panel del vendedor (D-095). No calcula nada: recibe la fila de `commission_summary`. Separa **lo ganado** de **la proyección** deliberadamente, y la barra lleva su valor en `aria-valuetext` |
| `NotificationBell` / `NotificationMenu` | Campanita del encabezado (D-093). El servidor lee la bandeja al pintar la pantalla; sin peticiones desde el navegador ni tiempo real. El contador va también en el `aria-label`, no solo en el punto rojo |
| `TableSection` | Tarjeta con título —y acción opcional— que envuelve un listado (§8.14, D-113). La tabla de dentro se aplana con `SECTION_TABLE_CLASSES` para no pintar dos bordes concéntricos; el relleno está calculado para que la primera columna quede alineada con el título |
| `ConfirmDialog` | Confirmación de acciones sensibles (anular, desactivar, aprobar) |
| `EmptyState` | Estado vacío con acción sugerida |
| `RowLink` | Enlace de una **fila** de tabla: un `Link` con `prefetch={false}`. Veinticinco filas precargadas son veinticinco invocaciones del servidor que casi nadie usa, y en Vercel enfrían la función que atenderá el clic siguiente (D-104) |
| `NavLinks` → `NavPending` | El menú lateral y su aviso de «se está abriendo», con `useLinkStatus`. Sustituye a los `loading.tsx`, que costaban ~300 ms de espera por fallback de Suspense (D-104) |
| `BottomNav` | La barra de navegación del teléfono (§8.8, D-106). Solo las entradas `primary`, solo bajo `md`. No consulta nada: `usePathname()` y ya. Conserva el aviso de «se está abriendo» de `NavPending`, en el sitio del icono |
| `nav-active.ts` | `isNavItemActive(pathname, href)`: qué entrada se enciende. La comparten la barra lateral y la inferior, para que no puedan discrepar (D-106) |
| `ProgressRing` | Anillo de progreso accesible (D-105): un `<svg>` con `stroke-dasharray`, sin librería de gráficas. Lleva el porcentaje **escrito** en el centro y `role="progressbar"`; es la versión compacta de la barra de `CollectionSummaryCard`, para cuando el porcentaje comparte fila con cifras de dinero |
| `TicketPaymentSummary` | Estado, estado de pago y —si ya se vendió— anillo, abonado y pendiente de UNA boleta (D-105). No consulta ni calcula: recibe `sale_price` y `paid_amount` y pide el porcentaje a `calculateCollectionSummary`, la misma cuenta del panel |
| `PageHeader` | Título, descripción y acciones de toda pantalla. `backHref` activa la flecha de volver de las pantallas de detalle (§8.6, D-089) |
| `BackButton` | Flecha de volver: historial real con destino de repuesto. La usa `PageHeader`, no se llama suelta |
| `navigation-history.ts` | Cuenta los cambios de ruta reales de esta pestaña, para que `BackButton` sepa si el historial es de fiar (D-089) |

**Búsqueda — dónde y con qué valores** (D-078). No hay capa de fetch en el navegador: en las listas
la búsqueda **es** una navegación al Server Component, y por eso no hay ni hace falta
`AbortController`.

| Pantalla | Tipo | Busca en | Pausa | Mínimo |
|---|---|---|---|---|
| `/owner/tickets`, `/seller/tickets` | URL → RSC | número diario y semanal (parcial), por relevancia; **y el cliente que tiene la boleta** (BR-N13). **No** el código interno (BR-N11) | 350 ms | 2 |
| `/owner/clients`, `/seller/clients` | URL → RSC | nombre, alias, teléfono, correo | 350 ms | 2 |
| Asignar boleta → «Cliente existente» | Server Action | nombre, alias, teléfono | 350 ms | 2 |
| Registrar abono → selector de cliente | Server Action | nombre, alias, teléfono | 350 ms | 2 |

`Enter` y el botón «Buscar» se saltan el mínimo.

**Boletas** (BR-N11, D-080): se busca por los dos números, por coincidencia **parcial** y siempre
como **texto** —«123» encuentra `1234` y `0123`; «00» encuentra `0017`—, nunca convertidos a entero,
que perdería los ceros de delante (BR-N03). El orden lo decide SQL, no el navegador: la función
`search_tickets` de la migración `0018` pone las coincidencias del número diario por delante de las
del semanal. Reordenar en el cliente no serviría, porque la lista está paginada en servidor.

**El mismo campo encuentra también por el cliente** (BR-N13, D-100, migración `0029`): si lo escrito
no son de 1 a 4 dígitos, se busca contra `clients.search_text` —la **misma** columna del buscador de
clientes— y se devuelven las boletas de quien coincida, ordenadas por relevancia del nombre. No hay
un segundo buscador ni un selector: la consulta distingue sola. El resultado sigue siendo una lista
de boletas, y el código interno sigue sin participar en ninguna de las dos ramas.

**Fila seleccionable — a qué tablas se aplica** (D-076): boletas, clientes, rifas y vendedores abren
su detalle; pagos abre su diálogo. `UsersTable` **no** la lleva: no hay pantalla de detalle de
usuario. El enlace de la primera columna se conserva siempre: es lo único que da menú contextual,
«abrir en otra pestaña» y una parada de teclado con nombre.

### 8.2.b Selección múltiple de boletas (`src/features/tickets/selection/`, D-082 a D-085)

```
TicketSelectionProvider          contexto: ids marcados, modo, «ver seleccionadas»
├── selection-store.ts           donde vive la lista, fuera de React (sessionStorage)
├── eligibility.ts               recuentos, incompatibles y el porqué. Código puro
├── queries.ts / actions.ts      elegibilidad, resolver «todas», y las cuatro acciones
├── TicketSelectionToolbar       contar, ver, limpiar, «seleccionar todas» y las acciones
│   ├── (escritorio) botones en línea
│   └── (teléfono) «Seleccionar» arriba + barra pegada abajo con menú
├── TicketListSlot               cambia la lista por «solo las seleccionadas»
└── Bulk*Dialog                  aprobar · anular · cambiar vendedor · eliminar · asignar
```

| Decisión | Dónde |
|---|---|
| La selección se guarda por `ticket.id`, tope 1.000, fuera de React | `selection-store.ts` (D-082) |
| La regla de qué se puede hacer está en SQL; aquí solo se cuenta y se explica | `eligibility.ts` (D-083) |
| En escritorio la columna de casillas está siempre; en el teléfono, solo en modo selección | `TicketsTable` con `hideOnMobile` (D-085) |
| La fila entera marca solo en modo selección; el resto del tiempo abre el detalle | `DataTable.onRowSelect` (D-085) |
| Asignar una boleta o veinte usa **un solo** formulario | `AssignTicketsForm` |

`TicketsTable` funciona **con y sin** proveedor: la usan también las fichas de cliente, donde no hay
selección múltiple y por tanto no aparece la columna de casillas.

### 8.3 Etiquetas en español (fuente única: `lib/constants.ts`)

Esta tabla fija **solo** las etiquetas de estado. La redacción del resto de la interfaz —botones,
errores, confirmaciones, estados vacíos, ayudas de formulario— se rige por
[`UX_COPY_GUIDELINES.md`](UX_COPY_GUIDELINES.md), importada desde `CLAUDE.md` §35.

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

**Estado de una persona** (`accountStatus()` + `ACCOUNT_STATUS_LABELS`, BR-E14). No sale de una sola
columna: lo derivan `memberships.is_active` y `profiles.activated_at`, en este orden.

| Situación | Etiqueta |
|---|---|
| `is_active` en falso | Inactivo |
| Activo, `activated_at` nulo | Invitación pendiente |
| Activo y con `activated_at` | Cuenta activa |

Lo pinta `AccountStatusBadge`, que sustituyó a `ActiveBadge` en todas las pantallas que muestran
personas: aquella decía «Activo» de alguien que nunca había entrado. `ActiveBadge` sigue existiendo
para lo que de verdad es un interruptor y no tiene invitación de por medio.

**Estado de un cliente** (`CLIENT_STATUS_LABELS`, D-113). Sale de `clients.archived_at`: con fecha,
**Archivado**; sin ella, **Activo**. Lo pinta `ClientStatusBadge` —verde y gris pizarra, los mismos
de una rifa en marcha y cerrada— y va junto al nombre en la ficha (§8.14). Archivar no es anular: por
eso no lleva el rojo de «Anulada».

### 8.4 Recorrido guiado (`src/features/tour/`)

Onboarding por pantalla: resalta un elemento y lo explica en un globo. Sin librería de tours (D-074).

| Archivo | Responsabilidad |
|---|---|
| `tours.ts` | **Configuración central**: qué recorrido corre en cada ruta y rol, y **todo** su texto |
| `storage.ts` | Qué recorridos ya vio cada perfil (`localStorage`, D-075) |
| `use-tour.ts` | Lógica: paso actual, descarte de pasos sin elemento, scroll y seguimiento de posición |
| `components/TourProvider.tsx` | Arranque automático, contexto y reinicio |
| `components/TourOverlay.tsx` | Presentación: foco sobre el elemento y globo (Radix Popover) |
| `components/TourLauncher.tsx` | «Ver recorrido guiado» en el menú de usuario |

Los pasos apuntan a atributos **`data-tour`**, nunca a clases ni a la estructura del HTML. El
vocabulario (`TourTarget`) está puesto en componentes compartidos —`PageHeader`, `DataTable`, los
tres componentes de filtros, `AppShell`—, así que una pantalla nueva hereda los puntos de anclaje sin
escribir nada.

Un paso cuyo elemento no exista o no esté visible **se descarta al arrancar**: así el paso de la
barra lateral desaparece solo en el teléfono y cede el turno al del botón de menú, sin preguntar por
el ancho de la pantalla. Por eso el contador dice «Paso 2 de 5» y no siempre el mismo total.

### 8.5 Accesibilidad
Contraste AA · foco visible · etiquetas asociadas a inputs · errores anunciados con `aria-live` ·
navegación por teclado · nunca depender solo del color (siempre texto o icono acompañante).

### 8.6 Flecha de volver en las pantallas de detalle (D-089)

Toda pantalla de detalle —boleta, cliente, vendedor, rifa, editar rifa, editar cliente, crear
boletas del vendedor, cambiar contraseña— usa `<PageHeader backHref="…">` en vez de un botón o
enlace de texto «Volver a…». La flecha vive **dentro** de `PageHeader`, a la izquierda del título; no
es una pieza suelta que cada pantalla arme por su cuenta.

```
BackButton (src/components/data/BackButton.tsx)
  · Botón de icono, 44 px de diana (mismo patrón que SelectionCheckbox, D-085)
  · onClick: hasInternalHistory() ? router.back() : router.push(fallbackHref)

navigation-history.ts (src/lib/)
  · Un contador de MÓDULO, no de sessionStorage
  · NavigationHistoryTracker (montado una vez en el layout raíz) lo incrementa
    cada vez que cambia el pathname, salvo el primer montaje
```

**Por qué el historial se conserva solo, sin código nuevo.** Búsqueda, filtros, página y orden ya
viven en la URL (§6.b). Cuando el usuario entra a un detalle desde una lista filtrada, esa URL
filtrada queda como la entrada anterior real del historial del navegador: `router.back()` vuelve
exactamente ahí, con el scroll que el propio navegador restaura en una navegación atrás. No hay
ningún sistema nuevo de estado para recordar filtros o posición; sería redundante con lo que la URL
y el historial ya hacen.

**Por qué el contador es una variable de módulo y no `sessionStorage`.** La primera versión usaba una
marca en `sessionStorage` («cuántas entradas de historial había al llegar a esta pestaña»), y parecía
correcta hasta probarla contra el login real: `sessionStorage` sobrevive a una carga dura, así que
abrir una boleta por URL directa justo después de iniciar sesión heredaba el historial *del login* y
la flecha mandaba al panel en vez de al listado de boletas. Una variable de módulo no tiene ese
problema: una carga dura (URL escrita a mano, marcador, refrescar) reinicia todo el contexto de
JavaScript y dejaba el contador en 0 sola, sin código adicional. El costo aceptado: si alguien
refresca la página de detalle y *entonces* pulsa la flecha, usa el destino de repuesto en vez del
historial exacto —el botón físico Atrás del navegador sigue funcionando perfecto en ese caso, porque
ese no depende de JavaScript—.

**Destino de repuesto por entidad**, usado solo cuando no hay historial real en esta pestaña:

| Detalle | `backHref` |
|---|---|
| Boleta (Owner/Admin) | `/owner/tickets?raffleId=<rifa de la boleta>` |
| Boleta (Seller) | `/seller/tickets` |
| Cliente (Owner/Admin) | `/owner/clients` |
| Cliente (Seller) | `/seller/clients` |
| Editar cliente (Seller) | El detalle de ese cliente, no el listado |
| Vendedor (Owner/Admin) | `/owner/sellers` |
| Rifa (Owner/Admin) | `/owner/raffles` |
| Editar rifa (Owner/Admin) | El detalle de esa rifa, no el listado |
| Crear boletas (Seller) | `/seller/tickets` |
| Cambiar contraseña | El panel del rol (`dashboardPathForRole`) |

**Deliberadamente sin tocar:** el botón «Volver a los resultados» de `TicketSelectionToolbar` (D-082)
alterna un estado local —qué lista se ve, seleccionadas o todas—, no navega entre pantallas. Los
botones «Cancelar» de `RaffleForm`/`ClientForm`/`PaymentForm`/`TicketForm` cancelan una edición en
curso con `router.back()` directo, un propósito distinto al de esta flecha; no se tocaron porque nadie
pidió endurecerlos y este proyecto no tiene protección de cambios sin guardar que preservar ni romper.
`forgot-password` es una pantalla pública fuera del portal, no una pantalla de detalle.

### 8.7 Disposición del detalle de una boleta (D-105)

Un solo árbol de HTML para todos los tamaños. El orden del marcado es el del **teléfono** y la
rejilla lo recoloca en pantallas anchas con `col-start`; no hay bloques `hidden` que repitan el
mismo texto ni una tabla encogida.

| Bloque | Teléfono (base) | Tableta (`sm`) | Escritorio |
|---|---|---|---|
| Identidad (números · precio · cliente) | apilado: números → cliente → precio → fecha | 2 columnas, cliente a lo ancho debajo | 3 columnas desde **`xl`**, cliente a la derecha |
| Estado y cobro | los dos estados en una fila; el resumen baja debajo, tras una línea horizontal | igual | **tres secciones hermanas** separadas por línea vertical desde `lg` — estado · estado de pago · resumen —, y la tercera reparte anillo, abonado y pendiente en horizontal |
| Abonos de esta boleta | cada abono, una tarjeta apilada | igual | columnas alineadas con su encabezado desde `lg` |

**Por qué el corte grande es `xl` y no `lg`.** Con la barra lateral de 256 px, una ventana de 1.024
px deja 672 px de contenido: una tableta de 768 px tiene **menos** ancho útil que un teléfono
apaisado de 640 px. Comprobado con capturas a 320, 390, 768, 1024 y 1440 px.

**Las tres secciones de «estado y cobro» se miden por su ROTULO, no por su contenido.** El reparto
es `1fr · 1fr · 2.2fr`: con menos ancho en las dos primeras, «Estado de pago» parte en dos líneas a
1.024 px aunque el badge quepa de sobra. Las líneas divisorias van en cada sección (`lg:border-l`),
no con `divide-x`, porque en esta rejilla el orden del marcado no siempre es el orden visual.

**El encabezado de columnas del historial va `aria-hidden`**, y cada fila lleva su propio rótulo
`lg:sr-only` («Registrado por», «Nota»): en escritorio el rótulo se oculta a la vista pero el lector
de pantalla lo sigue leyendo, que es justo lo que un `<div>` en rejilla no da gratis.

### 8.8 Navegación del teléfono: barra inferior (D-106)

En móvil no hay barra lateral ni drawer. Hay una **barra inferior fija** con cuatro opciones, y el
resto del menú se lee desde el menú de usuario.

```
                 navItems  (una sola lista por portal)
                     │
        ┌────────────┼──────────────┐
        │            │              │
   NavLinks      BottomNav      UserMenu
   (todas)       (primary)      (el resto, md:hidden)
   hidden md:flex  md:hidden
```

| Portal | Barra inferior (`primary`) | Menú de usuario, solo en móvil |
|---|---|---|
| Owner / Admin | Panel · Boletas · Clientes · Pagos | Rifas · Vendedores · Reportes · Administradores |
| Seller | Panel · Boletas · Clientes · Pagos | Mi equipo · Reportes |

**Las rutas y los permisos no cambiaron**: solo cambió desde dónde se entra en el teléfono.

| Regla | Dónde vive |
|---|---|
| Qué entrada es primaria y su etiqueta corta | `NavItem.primary` / `NavItem.shortLabel`, declarados en el `layout.tsx` de cada portal |
| Qué entrada se enciende | `isNavItemActive` (`nav-active.ts`), compartida con la barra lateral |
| Alto de la barra y hueco que debe dejar el contenido | `--bottom-nav-height` / `--bottom-nav-space` (`globals.css`) |
| Reserva de ese hueco | `AppShell`, **una vez**; ninguna pantalla añade margen por su cuenta |
| Altura de la barra de selección múltiple | `bottom: var(--bottom-nav-space)`: se apila encima, no la sustituye |
| Hueco de esa segunda barra | `--selection-bar-space`, que vale 0 hasta que la barra aparece (D-110) |

**Dos barras apiladas, un solo sitio donde se reserva su hueco (D-110).** La de selección múltiple
solo existe mientras hay boletas marcadas, así que su hueco tampoco es fijo: la barra se marca
`data-selection-bar`, `globals.css` traduce esa marca a `--selection-bar-space` bajo `md`, y
`AppShell` la suma al `padding-bottom` del contenido junto a la de navegación. **Ninguna pantalla
dibuja un elemento vacío para hacerse sitio**: uno en flujo se queda donde está escrito —en medio de
la lista— y el hueco hace falta al final. Además, la barra va envuelta en un `display: contents`,
porque el margen de un `space-y-*` cuenta para colocar un elemento fijo y la levantaba 24 px sobre la
navegación.

En el portal del vendedor la barra dice **«Boletas»**, **«Clientes»** y **«Pagos»** (`shortLabel`),
mientras el título de la pantalla sigue diciendo «Mis boletas». A 320 px cada opción dispone de
~72 px y el posesivo no cabe; el término del glosario es el mismo.

**En una pantalla que no está en la barra —Mi equipo, Rifas, Reportes— no se enciende ninguna
opción.** Es lo correcto: la barra dice dónde estás, no dónde estuviste.

**Área segura.** `env(safe-area-inset-bottom, 0px)`. No se activó `viewport-fit=cover`: sin ella el
navegador ya mantiene los elementos fijos por encima del indicador del iPhone, y activarla metería el
contenido bajo la muesca en **todas** las pantallas. El valor de repuesto deja el cambio preparado
por si algún día se activa.

**El icono llega sin tamaño** desde el `layout.tsx`: lo pone quien lo pinta —16 px en la lateral y en
el menú de usuario, 24 px en la barra inferior—, porque el mismo elemento de React se usa en los
tres sitios.

---

### 8.9 La lista de boletas: una fuente de datos, dos presentaciones (D-107)

```
                     listTickets()   ← filtra, ordena y pagina en SQL
                          │
                   TicketListItem[]  ← el MISMO arreglo para las dos
                          │
                    TicketsList      ← data-tour="data-table"
                    ┌─────┴─────┐
              md:hidden      hidden md:block
            TicketCardList   TicketsTable
              (teléfono)      (escritorio)
```

**Ni una consulta más.** `TicketCardList` no consulta, no tiene efectos y no guarda estado: pinta lo
que el listado ya traía. El cliente, el estado de pago y el precio salen de las mismas columnas que
alimentaban las celdas que la tabla ocultaba bajo `md`. **No hay N+1**: 25 boletas siguen siendo una
sola lectura.

**Quién elige cuál se ve:** Tailwind. Las dos se renderizan y el navegador oculta una con
`display:none`, que además la saca del árbol de accesibilidad —un lector encuentra **una** lista, no
dos—. `useIsCompactScreen()` **no** decide esto: el servidor no conoce el ancho y habría un parpadeo
en cada carga. La consulta de medios sigue decidiendo solo comportamiento (si tocar marca o abre).

| Dato | En la tabla | En la tarjeta |
|---|---|---|
| Números diario y semanal | dos columnas | primera línea, `1234 / 5678`, con leyenda «Diario · Semanal» |
| Precio | columna, `—` si no hay | primera línea a la derecha; **se omite** si no hay venta |
| Cliente | columna oculta bajo `md` | tercera línea; «Sin cliente» cuando no lo tiene |
| Estado y estado de pago | dos columnas, `Pago` oculta bajo `md` | cuarta línea, dos insignias juntas |
| Rifa y vendedor | columnas ocultas bajo `md` | en la leyenda, truncadas (`R001 · Ana Torres`) |

**Comportamiento:** el mismo de la fila, reutilizando `row-activation.ts` y `useLongPress`. Toda la
tarjeta abre el detalle; en modo selección marca, y entonces la flecha desaparece. La casilla de
«toda esta página» —el equivalente al encabezado de la tabla— va en una barra propia sobre la lista,
y sin ella se perdería también la oferta «Seleccionar las N boletas del filtro».

**Filtros en el teléfono:** el buscador siempre visible; los desplegables detrás de «Filtros (n)», en
una hoja inferior (`components/ui/sheet.tsx`). Se escriben una vez y se pintan en los dos sitios con
`idPrefix` distinto; la hoja solo existe en el DOM mientras está abierta, así que en escritorio no
hay etiquetas duplicadas. El contador cuenta filtros, **no** la búsqueda: esa ya se ve escrita.

**Dónde se usa:** los dos listados de boletas, «Ver seleccionadas» y las boletas de la ficha de un
cliente. `TicketsTable` ya no se llama directamente desde ninguna pantalla.

### 8.10 La cabecera de «Boletas»: un bloque con ritmo (D-108)

Lo que hay entre el título y la primera boleta ocupaba **376 px de 844** en un teléfono de 390 px.
Ahora ocupa **322**, con este orden y sin ningún dato menos:

```
Mis boletas                       [ + Crear boletas ]   ← misma fila (inlineActions)
Busca por el número de la boleta o por el nombre…       ← ancho completo, fila propia
[ Número de boleta o cliente            ] [ 🔍 ]        ← 44 px (touchSize)
[ ⚙ Filtros ] [ ☑ Seleccionar varias ]                  ← 44 px, `grow`, md:hidden
─── las tarjetas ───
```

| Pieza | Qué cambió | Alcance |
|---|---|---|
| `PageHeader` | Nueva variante **opcional** `inlineActions`: rejilla donde el título y la acción comparten fila 1 y la descripción ocupa entera la fila 2. **Sin la bandera, el árbol de siempre, intacto** | Solo `/seller/tickets` la activa; las otras 27 pantallas no cambian |
| `SearchInput` | Nueva bandera **opcional** `touchSize`: campo y botón de 44 px bajo `md`, 36 px a partir de ahí | Solo la lista de boletas |
| `TicketFilters` | El recuadro (`border` + `p-4`) pasa a ser **de escritorio**: bajo `md` no hay caja. Nuevo hueco `secondaryAction` para el segundo botón de la fila | Los dos listados de boletas |
| `TicketSelectionModeButton` | **Nuevo.** Lo único que necesita el contexto de selección para encender o apagar el modo | Los dos listados de boletas |
| `TicketSelectionToolbar` | Deja de dibujar el botón de modo. Cuando no tiene nada que decir se queda en **`sr-only`**, no desmontado | Los dos listados, también en escritorio |

**Por qué el botón de modo salió de la barra de selección.** Su sitio en pantalla está junto a
«Filtros» —las dos preparan la lista— pero ese botón lo dibuja `TicketFilters`, que no vive dentro
del proveedor de selección en todos sus usos posibles. En vez de hacerle llamar al contexto, recibe
el nodo ya construido. Quien lo pasa decide además cuándo **no** pasarlo: `rows.length > 0`, la misma
condición que tenía la barra.

**Por qué la barra vacía queda en `sr-only` y no desmontada.** Contiene la región `aria-live` del
recuento, que debe estar montada **antes** de cambiar para que un lector la anuncie. Visible con
texto vacío costaba dos huecos de 24 px; `sr-only` la saca del flujo y la conserva anunciable.

**Por qué los botones usan `grow` y no mitades.** A 320 px una mitad son 140 px y «Seleccionar
varias» necesita 160. Con `grow` cada uno parte de su texto y se reparte lo que sobre. Peor caso
medido —320 px, «Filtros (5)»—: 114 + 8 + 166 = **288 px**, justo el ancho disponible.

**Escritorio no cambió**, salvo dos detalles que mejoran: el recuadro y sus desplegables siguen
igual, y desaparecen los 24 px muertos que dejaba la barra de selección vacía entre el recuadro y la
tabla.

### 8.11 Dos cabeceras de boletas, dos disposiciones (D-108, D-109)

Las dos pantallas que listan boletas comparten todo menos el encabezado: el buscador, el recuadro que
desaparece bajo `md` y la fila «Filtros» + «Seleccionar varias» salen de `TicketFilters`, que es la
misma pieza. Lo que cambia es **cuántas acciones tiene cada una**.

| | `/seller/tickets` | `/owner/tickets` |
|---|---|---|
| Título | «Mis boletas» (125 px) | «Boletas» (79 px) |
| Acciones | **1** — «Crear boletas» (132 px) | **2** — «Crear en lote» + «Nueva boleta» (272 px) |
| Disposición en el teléfono | Acción **en la fila del título** (`inlineActions`) | Acciones en **fila propia de 44 px**, de lado a lado |
| Cabe a 320 px | 125 + 12 + 132 = **269** ≤ 288 ✅ | 79 + 12 + 272 = **363** > 288 ❌ |
| Cómo se pide | Bandera `inlineActions` de `PageHeader` | `h-11 grow md:h-9 md:grow-0` en cada botón |

**Por qué la de dos acciones no usa una bandera.** `PageHeader` lo comparten 27 pantallas y esto
afecta a una: las clases van en los botones, donde se leen junto a lo que modifican, igual que
`touchSize` en `SearchInput` y `h-11 grow` en la fila de «Filtros». `PageHeader` no impone tamaño a
sus acciones y no debe empezar a hacerlo.

**Escritorio es idéntico en las dos**: acciones a la derecha del título, 36 px, ancho de contenido.

---

### 8.12 La paginación: un componente, dos repartos del ancho (D-111)

`DataTablePagination` es el **único** sitio donde se pagina: lo usan los ocho listados (boletas,
clientes y pagos de los dos portales, y dos reportes). Sigue siendo paginación de servidor —`page` en
la URL, el RSC reconsulta con `range()`— y eso no cambió. Lo que cambió es cómo reparte el ancho.

```
Teléfono (< md)                          Escritorio (≥ md, sin cambios)

      1–25 de 118 boletas                1–25 de 118 boletas   [‹ Anterior][Página 1 de 5][Siguiente ›]

[‹ Anterior]    1 de 5    [Siguiente ›]
```

| Regla | Dónde vive |
|---|---|
| Nombre de lo que cuenta cada lista, en singular y plural | `LIST_ITEM_LABELS` (`src/lib/constants.ts`); el parámetro `items` es **obligatorio** |
| Alto táctil y aire lateral solo en el teléfono | `h-11 has-[>svg]:px-3 md:h-8 md:has-[>svg]:px-2.5` en los dos botones |
| Que el indicador quede centrado entre los botones | `flex-1 text-center md:flex-none` |
| Que «Página» se anuncie aunque no se vea | `sr-only md:not-sr-only` |

**Tres cosas que no son evidentes:**

1. **El reporte de recaudo pagina días, no pagos.** Una fila es un día con su total. Por eso `items`
   no tiene valor por defecto: un genérico habría escondido el error.
2. **12 px de aire lateral, no 16.** A 320 px, con 16 px el indicador se queda con 48 px y «1 de 257»
   se parte en dos líneas. Con 12 px quedan 64, suficientes hasta para «1 de 1024».
3. **El corte es `md`, no `sm`.** Era el último componente que cambiaba de forma en 640 px, cuando la
   aplicación entera se vuelve teléfono en 768 (§8.8, §8.9). El tope de 448 px (`max-w-md`) evita que
   entre 448 y 768 los botones se separen a los extremos de una ventana ancha.

### 8.13 El panel del vendedor: siete piezas y un solo orden (D-112)

Rediseñado el 2026-08-25. Once bloques apilados pasaron a siete piezas, y **el mismo árbol** sirve
para el teléfono y el escritorio.

```
Escritorio (≥ lg)                              Teléfono (< lg)

Hola, X                    [11 a 17 ago 2026]  Hola, X · [11 a 17 ago 2026]
[Recaud.][Por cobrar][Cobranza][Ganancia]      Accesos rápidos
[   Resumen financiero  ][    Cobranza    ]    Indicadores (1 col)
[ Mis boletas   ][ Actividad reciente     ]    Resumen financiero
[ Tendencia     ][ Accesos rápidos        ]    Cobranza · Mis boletas
                                               Tendencia · Actividad reciente
```

**Cómo se consigue con una sola rejilla.** El contenedor es `flex flex-col` en el teléfono y
`lg:grid lg:grid-cols-2 lg:items-start`. El orden del móvil lo fijan clases `order-*` que se anulan
con `lg:order-none`. Las dos columnas de la tercera fila son envoltorios con **`contents`**: bajo
`lg` desaparecen y sus tarjetas quedan sueltas entre las demás —de modo que `order` puede
recolocarlas—; desde `lg` vuelven a existir y forman dos pilas independientes, que es lo que permite
que cada tarjeta conserve su altura natural. Es el mismo recurso de §8.8 (D-110).

**Container queries, no `sm:`.** Estas tarjetas ocupan media pantalla en escritorio, así que el
tamaño de la **ventana** no dice nada sobre el espacio que tienen dentro. Dos piezas responden al
ancho de su tarjeta con `@container`:

| Pieza | Umbral | Por qué |
|---|---|---|
| Anillo junto a su leyenda (`FinancialSummaryCard`) | `@min-[400px]` | Anillo 160 px + leyenda más larga 216 px. Con `sm:` la leyenda quedaba en 66 px y los nombres desaparecían |
| «Mis boletas» de 3×2 a seis en fila (`TicketsOverviewCard`) | `@min-[400px]/tickets` | Con `sm:` eran seis columnas de 43 px dentro de una tarjeta de media pantalla |

Los cuatro indicadores sí miran la ventana (`sm:grid-cols-2 xl:grid-cols-4`) porque ocupan el ancho
completo: en `lg` el contenido mide 720 px —la barra lateral se lleva 256— y cuatro columnas dejaban
78 px de texto para importes de 118.

**Gráficos: SVG en el servidor, sin librería.**

| Componente | Cómo escala |
|---|---|
| `DonutChart` | `stroke-dasharray` sobre un lienzo 100 × 100. **El tamaño lo pasa quien lo usa**: crecer con la ventana se comía la leyenda de al lado. El importe del centro es `text-base` fijo — a 20 px, «$13.600.000» se salía del anillo |
| `TrendChart` | `viewBox` con proporción conservada y `vector-effect="non-scaling-stroke"`. Los textos del eje van **fuera** del SVG, en la misma rejilla: dentro crecerían con él. Cada punto lleva `<title>` (globo nativo, cero JavaScript) y debajo va la misma información en una lista `sr-only` |

**Qué depende del período y qué no.** El selector escribe `range` en la URL (`7d`, `30d`, `month`,
`last-month`; el valor por defecto no se escribe). Manda sobre el dinero recaudado, su comparación
con el período inmediatamente anterior y la tendencia diaria. El inventario y la cobranza son la foto
de hoy: la base guarda el estado **actual** de cada boleta, no el que tenía hace siete días.

**Consultas.** Dos nuevas, dentro del mismo `Promise.all` que ya existía:

| Función | Fuente | Nota |
|---|---|---|
| `getSellerPartialTicketTotals` | `v_ticket_balances`, boletas `assigned` + `partial` | La **única** cifra que `v_seller_summary` no da. Todo el reparto por estado de pago se deduce de ella (`collection-breakdown.ts`), y por eso **no hizo falta migración**. Tope de 5.000 filas: por encima devuelve `null` y el anillo pasa a dos partes |
| `getSellerActivity` | `report_payments_by_day` y `report_payment_totals` (migración `0013`) | Las mismas que alimentan el reporte de recaudo. Se lee `active_amount`: un pago anulado permanece en el historial pero no es dinero recibido |

Y **tres menos**: `getSellerDashboard` dejó de pedir el recuento de clientes, los clientes recientes y
las ventas recientes, que ninguna pantalla pinta ya y se pedían también en `/seller/payments`.

**Reglas de negocio: ninguna cambió.** Los estados de pago siguen saliendo de `v_seller_summary`, la
comisión de `commission_summary` y el precio de `raffles.ticket_price`. Sin migraciones y sin
dependencias nuevas.

---

### 8.14 La ficha del cliente: una tira de datos y dos listados con tarjeta (D-113)

Rediseñada el 2026-08-25. **La misma pantalla en los dos portales**, con las diferencias que impone
el rol y ninguna más.

```
[←] Nombre  (Activo)              [+ Registrar abono] [Editar] [Archivar cliente]
[ Teléfono │ Correo │ Alta │ Estado ]      ← una fila en lg; 2 x 2 en el teléfono
[ Boletas ][ Total comprado ][ Total pagado ][ Saldo pendiente ]   ← KpiCard, 4 en xl
┌ Boletas de este cliente ─────────────────────────────┐
│  tabla (escritorio) / tarjetas (teléfono), sin borde │
└──────────────────────────────────────────────────────┘
┌ Historial de abonos ──────────────[+ Registrar abono]┐
│  tabla de pagos, sin borde                           │
└──────────────────────────────────────────────────────┘
```

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| `ClientInfoCard` | `features/clients/components/` | Teléfono, correo, alta y estado —más el vendedor en el portal administrativo—, cada uno con su icono en cuadrado. **Cuadrícula 2 × 2 en el teléfono** y una sola fila desde `lg`; lo que separa las celdas son bordes, no `gap`, y por eso la tarjeta mide 167 px y no 262. Las notas, cuando las hay, bajan a su propia línea |
| `ClientTotals` | `features/clients/components/` | Las cuatro cifras de `v_client_balances` en `KpiCard`, la tarjeta del panel (D-112) |
| `TableSection` | `components/data/` | La tarjeta con título y acción que envuelve cada listado. `SECTION_TABLE_CLASSES` aplana la tabla de dentro para no dibujar dos bordes |

**Qué se oculta y qué no.** Solo se esconde lo que es **constante por construcción**: la lista está
filtrada por `clientId`, así que la columna «Cliente» repetiría el mismo nombre en todas las filas
(`showClient={false}` en las dos tablas). «Rifa» se apaga únicamente en el portal del vendedor, por
D-088; en el administrativo se queda, igual que «Vendedor», porque ahí sí pueden variar.

**Acciones.** «Registrar abono» es la única de color y aparece dos veces —encabezado e historial—
bajo la **misma** condición de siempre: saldo pendiente mayor que cero y cliente no archivado. El
portal administrativo no la tiene: registrar abonos es del vendedor. La del encabezado lleva
`aria-label` con el nombre del cliente, para que quien la oiga sepa de quién es el abono.

**Sin consultas nuevas:** `getClientDetail`, `listTickets({ clientId })` y `listClientPayments`, las
mismas tres de antes y en el mismo `Promise.all`.

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

- Índices para todo filtro frecuente **y para todo orden por defecto** (ver `docs/DATA_MODEL.md` §5).
- Sin N+1: las vistas de listado consultan con `join`/vistas agregadas, no en bucle.
- `paid_amount` **materializado** en `tickets` y mantenido por trigger → los listados no agregan en
  tiempo real y los saldos son indexables.
- Paginación en servidor (`range`) para todas las tablas grandes.
- Creación masiva: virtualización de filas + envío en lotes de 100 con indicador de progreso.
- `revalidatePath` selectivo tras cada mutación; sin sobre-invalidar.

### 10.1 Reglas que salieron de medir con volumen real (D-102, D-103)

La auditoría del 2026-08-22 cargó una base local con 100.000 clientes, 300.000 boletas y 1.000.000
de abonos y midió cada pantalla. Cuatro reglas para no repetir lo que encontró:

0. **La métrica es lo que espera una persona, no lo que tarda el servidor.** Un TTFB de 150 ms
   convive perfectamente con tres segundos de espera. Se mide en un build de producción, desde el
   clic hasta que la pantalla se puede usar (D-104).
1. **Un `order by` sin índice es un barrido de la tabla, aunque haya `limit 25`.** Paginar en
   servidor no basta: PostgreSQL tiene que ordenar todo lo que cumple el filtro antes de recortar.
   Toda columna por la que un listado ordene **por defecto** necesita su índice.
2. **Los índices de orden no pueden empezar por `organization_id`.** La política compara esa columna
   contra un conjunto y eso rompe el orden del índice. Es la contrapartida de D-063.
3. **Agregar y luego recortar es al revés.** Una vista que agrupe la tabla entera para devolver 25
   filas se paga entera en cada carga. Con `left join lateral`, el agregado depende de la fila
   exterior y el planificador recorta primero (`v_client_balances`, D-102).
4. **Memoización por PETICIÓN, nunca entre peticiones.** `cache()` de React evita que una pantalla
   pida dos veces la misma lista dentro de la misma pasada y desaparece al terminar la respuesta.
   Cachear entre peticiones está prohibido para dinero, saldos y estados de boleta.
5. **Nada de `loading.tsx` en este proyecto** (D-104). Un fallback de Suspense obliga a React a
   mantenerlo unos 300 ms aunque los datos ya hayan llegado. El aviso de «se está abriendo» lo da
   `useLinkStatus` dentro de la entrada del menú, que no crea ningún fallback. Medido: 352 → 106 ms.
6. **Los enlaces de FILA no precargan** (`RowLink`). Veinticinco filas son veinticinco invocaciones
   del servidor que casi nadie va a usar, y en Vercel esa ráfaga reparte el trabajo entre instancias
   nuevas que luego atienden el clic siguiente en frío. El menú lateral sí precarga: son ocho
   destinos predecibles.

**Lo que sigue sin resolver, con el volumen al que empieza a doler:** I-062 (la búsqueda por texto no
puede usar su índice bajo RLS, ~1 s con 1.000.000 de clientes), I-063 (los agregados por rifa y
vendedor son lineales, ~500 ms con 1.000.000 de boletas), I-064 (conteo exacto del historial de
pagos) e I-065 (actualizaciones masivas sobre `tickets` y los índices GIN).

### 10.2 Cómo se mide

`docs/TEST_RESULTS.md` guarda las cifras y el procedimiento. En resumen: base **local** cargada con
volumen sintético, `explain (analyze, buffers)` con la sesión real de cada rol para el porqué, y
tiempo de respuesta del servidor por pantalla completa para el cuánto. Nunca contra el proyecto real.

---

## 11. Estrategia de datos de desarrollo (seed)

El seed vive en una sola pieza: **`scripts/seed.ts`** (D-042). Usa la clave de servicio únicamente
en servidor, crea usuarios de Auth y luego los datos de negocio requeridos por las pruebas. Contra
el remoto, la contraseña viene de `SEED_DEFAULT_PASSWORD`; contra local usa la constante pública de
desarrollo `LOCAL_SEED_PASSWORD`, válida solo para `127.0.0.1`.

Ejecución local: `npm run db:reset && npm run seed:local`. El primer comando aplica las 21
migraciones; el segundo siembra el estado conocido. `supabase/config.toml` todavía menciona un
`supabase/seed.sql` inexistente y por eso la CLI muestra una advertencia inocua (I-048). El seed real
es idempotente: si el dato existe, no lo duplica.

Detalle y datos exactos: `docs/IMPLEMENTATION_PLAN.md` Fase 2 y `docs/TESTING.md` §6.

---

## 12. Estrategia de despliegue

**Actualizado en la Fase 8 (D-066).** El diseño original de esta sección (Fase 0) separaba un
proyecto Supabase de "staging" para los Preview de Vercel de uno de producción. En la práctica, desde
la Fase 2 hasta la Fase 7 solo existió un proyecto Supabase remoto — "el proyecto real" — usado para
todas las verificaciones contra datos reales. La Fase 8 decidió, de forma explícita y consciente,
**no** aprovisionar un segundo proyecto: mantener uno solo y usarlo como producción.

| Entorno | Frontend | Base de datos | Propósito |
|---------|----------|---------------|-----------|
| Local | `next dev` (`npm run dev:local`) | Supabase local (Docker) | Desarrollo y pruebas de BD/RLS/E2E |
| Producción | Vercel Production (proyecto `gestion-rifas`) | El proyecto Supabase real | Operación real |

No hay un entorno de Preview con base de datos propia. Riesgo aceptado y documentado en
`docs/KNOWN_ISSUES.md` I-022: si alguna vez se activan las variables de Supabase en el scope
"Preview" de Vercel, un Pull Request escribiría sobre la misma base que usan las personas reales.
Mitigación actual: esas variables solo están puestas en el scope "Production" (`docs/DEPLOYMENT.md`
§3.1).

**Migraciones:** versionadas en `supabase/migrations`, inmutables una vez aplicadas a producción.
Cambios posteriores se hacen con una migración nueva. Promoción manual con el procedimiento de tres
pasos de `docs/DEPLOYMENT.md` §2.2 (`--dry-run`, `--yes`, `verify:remote`) — no hay CI que la aplique
sola todavía; el job `db` del pipeline (`.github/workflows/ci.yml`) valida que las migraciones se
aplican limpias desde cero, pero contra una instancia efímera, no contra el proyecto real.

**Variables de entorno:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (públicas,
D-028), `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, marcada como sensible en Vercel) y
`NEXT_PUBLIC_SITE_URL`/`TZ`. `scripts/check-env.ts` falla el build si falta alguna de las tres
primeras. Detalle completo en `docs/DEPLOYMENT.md` §3.1.

**Reversión:** cada migración incluye una nota de reversión documentada (manual, no ejecutable); los
despliegues de Vercel se revierten con "Instant Rollback" o un `git revert`.

**Backups:** el proyecto real está en el plan **Free** de Supabase — confirmado en el dashboard
(2026-08-04): sin scheduled backups, sin Point-in-Time Recovery, sin restore-to-new-project (D-070,
I-024). Mientras siga en ese plan, la recuperación ante desastres depende de un **respaldo lógico
manual** (`supabase db dump`, tres archivos: roles/schema/datos de `public`, guardados fuera del repo
y fuera de Supabase) que hay que generar a mano antes de cualquier migración o cambio riesgoso.
Procedimiento exacto, verificado, y sus dos advertencias reales (el aviso de `dotenv` que corrompe la
variable de conexión, y por qué el volcado de datos necesita `--schema public` mientras que el de
esquema no) en `docs/RUNBOOK.md` §5.

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
