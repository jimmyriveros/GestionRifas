# HANDOFF — punto de entrada para una sesión nueva

**Lee este archivo primero. Es lo único obligatorio junto con `CLAUDE.md`.**
Los demás documentos se leen **solo si la fase autorizada los necesita** (ver §5).

---

## 1. Estado actual

| | |
|---|---|
| Última fase completada | **8 — Despliegue y documentación operativa** |
| Siguiente fase | **9 — Auditoría final independiente** (requiere autorización explícita del usuario) |
| Rama / commit / etiqueta | `main` · `fase-8` (ver el hash exacto en `PHASE_STATUS.md`) |
| Remoto | `github.com/jimmyriveros/GestionRifas` — `main` al día hasta la Fase 7 (empujado en la Fase 8); el commit de cierre de la Fase 8 en sí, ver estado real con `git log` |
| **Producción** | **`https://gestion-rifas.vercel.app`** — proyecto Vercel `gestion-rifas`, desplegado y verificado (cabeceras, aislamiento de rutas, los 3 roles probados por el usuario) |
| App | Next.js 16: autenticación, portal administrativo, portal del vendedor, pagos/abonos y **reportes con exportación CSV**, todo funcionando **en producción** |
| Base de datos | 15 migraciones, **todas aplicadas en local y en el proyecto real** (el mismo que hace de producción, D-066) y verificadas con `npm run verify:remote`. **Plan Free: sin backups automáticos** (I-024) — respaldo lógico manual, ver §3.b |
| Pruebas | 162 unitarias + **254 de base de datos** + **142 end-to-end**, todas en verde. `npm audit`: **0 vulnerabilidades**. CI en GitHub Actions desde la Fase 8 |

**Lo que existe hoy:** el producto completo del MVP **en producción real** — crear rifas y boletas,
repartirlas entre vendedores, venderlas a clientes, cobrarlas con abonos, y consultar y exportar todo
eso en reportes. Los saldos y los estados de pago los calcula la base de datos. Endurecido en la
Fase 7 (CSP por nonce, limitación de intentos, RLS ~1.400× más rápida) y desplegado en la Fase 8, con
`docs/DEPLOYMENT.md`, `docs/OPERATIONS.md` y `docs/RUNBOOK.md` nuevos.
**Lo que NO existe:** backups automáticos de Supabase (plan Free — I-024, prerrequisito antes de datos
reales) y la auditoría final independiente (Fase 9).

---

## 2. Arranque en 4 comandos

```bash
npm install
```

```bash
npx supabase start
```

```bash
npm run db:reset && npm run seed:local
```

```bash
npm run dev:local
```

Requisitos: Node ≥ 20.19, Docker Desktop, y un `.env.local` (ver §3).

⚠️ **`npm run dev` apunta a donde diga `.env.local`, que hoy es el proyecto REAL** (I-013). Para
desarrollar y para las pruebas end-to-end usa **`npm run dev:local`** (D-047): inyecta las
credenciales de la instancia local y no toca producción.

---

## 3. Variables de entorno

`.env.local` **no está versionado**. Copiar de `.env.example` y completar.

| Variable | Obligatoria | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | Clave pública (sujeta a RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | **Secreta.** Solo servidor y scripts; omite RLS |
| `SEED_DEFAULT_PASSWORD` | Sí (para el seed) | Contraseña de las cuentas de desarrollo |
| `SUPABASE_DB_URL` | Solo para migraciones al remoto | **Session pooler**, no conexión directa (I-005) |
| `NEXT_PUBLIC_SITE_URL` | Sí | Enlaces de recuperación de contraseña |
| `TZ` | Sí (`UTC`) | La conversión a `America/Bogota` es explícita (D-022) |

⚠️ **Trampa ya sufrida (I-010):** no generes valores de `.env` con redirecciones de shell en Windows.
Un `\r` invisible dentro del valor rompe el login de forma desconcertante (funciona por API, falla en
el navegador). Verificación rápida:

```bash
node -e "const b=require('fs').readFileSync('.env.local');console.log('CR:',[...b].filter(x=>x===13).length)"
```

Debe imprimir `CR: 0`.

✅ **Las 15 migraciones están aplicadas también en el proyecto real** (2026-08-04) y verificadas.

Al aplicar migraciones al proyecto real, el procedimiento completo son **tres** pasos, no dos:

```bash
npx supabase db push --dry-run --db-url "$SUPABASE_DB_URL"
```

```bash
npx supabase db push --yes --db-url "$SUPABASE_DB_URL"
```

```bash
npm run verify:remote
```

⚠️ **El tercero no es opcional.** Comprueba las invariantes de catálogo contra el proyecto real, y es
lo único que detecta que local y remoto han dejado de ser equivalentes. Ha hecho falta **dos veces**:
`authenticated` conservaba `DELETE` en el remoto (D-038) y `anon` podía ejecutar todas las funciones
(I-020). En ambos casos las pruebas locales pasaban.

---

## 3.b Copias de seguridad — el proyecto real está en plan Free (I-024)

**Sin scheduled backups, sin Point-in-Time Recovery, sin restore-to-new-project.** Confirmado en el
dashboard (Database → Backups) en la Fase 8. La única red de seguridad es un respaldo lógico manual:

```bash
npx supabase db dump -f "<fuera-del-repo>/roles.sql" --role-only --db-url "$SUPABASE_DB_URL"
npx supabase db dump -f "<fuera-del-repo>/schema.sql" --db-url "$SUPABASE_DB_URL"
npx supabase db dump -f "<fuera-del-repo>/data.sql" --schema public --data-only --db-url "$SUPABASE_DB_URL"
```

⚠️ El `--schema public` de la **tercera** línea es obligatorio (sin él, el volcado trae `auth.users`
completo — contraseñas cifradas y tokens). La **segunda** va **sin** restringir esquema a propósito
(restringirla rompe la extensión `pg_trgm`). Procedimiento completo, sus dos advertencias reales y
cómo restaurar (**solo en local**, nunca en el remoto sin mostrar el procedimiento exacto y recibir
autorización explícita) en `docs/RUNBOOK.md` §5.

**Generar un respaldo antes de cualquier migración o acción destructiva sobre el proyecto real.**
Antes de operar con dinero o clientes reales: actualizar a Pro o automatizar este procedimiento desde
fuera de Supabase (`docs/RUNBOOK.md` §5.3).

---

## 4. Cuentas de desarrollo

Creadas por `npm run seed` (remoto) o `npm run seed:local`. Contraseña: `SEED_DEFAULT_PASSWORD`
(en local es `DesarrolloLocal2026`).

| Correo | Rol | Organización |
|---|---|---|
| `owner@demo.test` | owner | Rifas Demo |
| `admin@demo.test` | admin | Rifas Demo |
| `vendedor1@demo.test` | seller | Rifas Demo |
| `vendedor2@demo.test` | seller | Rifas Demo |
| `owner@control.test` | owner | Rifas Control |
| `vendedor@control.test` | seller | Rifas Control |

«Rifas Control» existe **solo para probar aislamiento**: su rifa reutiliza a propósito las mismas
combinaciones de números que la de «Rifas Demo».

---

## 5. Qué documento leer y cuándo

No leas todo. Cuesta ~40k tokens y casi nunca hace falta.

| Vas a... | Lee |
|---|---|
| **Siempre** | `CLAUDE.md` + este archivo + `docs/PHASE_STATUS.md` |
| Tocar el esquema o escribir consultas | `docs/DATA_MODEL.md` |
| Escribir RLS, permisos o Server Actions | `docs/SECURITY.md` §2 (matriz) y §5 |
| Implementar reglas de negocio | `docs/BUSINESS_RULES.md` (busca el `BR-*` concreto) |
| Crear componentes o rutas | `docs/ARCHITECTURE.md` §5 y §6 |
| Saber el alcance exacto de tu fase | `docs/IMPLEMENTATION_PLAN.md` (solo tu sección) |
| Entender por qué algo está así | `docs/DECISIONS.md` (busca el `D-*` citado en el código) |
| Ver qué falla o qué evitar | `docs/KNOWN_ISSUES.md` |
| Ver resultados de pruebas anteriores | `docs/TEST_RESULTS.md` |
| Escribir pruebas end-to-end | `docs/TESTING.md` §E2E + `tests/e2e/fixtures.ts` |

El código cita las decisiones (`D-0xx`) y reglas (`BR-xxx`) que aplica: si un comentario dice
`(D-039)`, busca solo esa entrada, no el documento entero.

---

## 6. Esquema, en una pantalla

Evita leer `DATA_MODEL.md` (~5k tokens) solo para recordar nombres.

```
organizations ─┬─ memberships (profile_id, organization_id, role, is_active)
               ├─ raffles     (short_code, name, ticket_price, status, allow_seller_ticket_creation)
               ├─ clients     (seller_id, name, phone, archived_at)
               ├─ tickets     (raffle_id, seller_id, client_id, internal_code,
               │               daily_number, weekly_number, sale_price, paid_amount,
               │               inventory_status, payment_status)
               ├─ payments    (seller_id, client_id, total_amount, payment_date, voided_at)
               └─ audit_logs  (actor_profile_id, action, entity_type, entity_id, old/new_values)

payments 1─N payment_allocations N─1 tickets   (amount; SUM = payments.total_amount)
profiles 1─1 auth.users
```

**Enums:** `app_role` owner|admin|seller · `raffle_status` draft|active|closed|cancelled ·
`ticket_inventory_status` draft|pending_approval|available|assigned|cancelled ·
`ticket_payment_status` unpaid|partial|paid · `payment_method` cash|transfer|other

**Invariantes que la BD ya garantiza — no las reimplementes en la aplicación:**
- Combinación `(org, rifa, daily, weekly)` única, incluso entre vendedores y con boletas anuladas.
- Números como texto, 1–4 dígitos, ceros iniciales conservados.
- Dinero en `bigint`; `paid_amount` derivado por trigger; `payment_status` columna generada.
- Sobrepago imposible; pago y asignaciones cuadran exactamente; todo o nada.
- Ningún `DELETE` en ninguna tabla (ni política ni privilegio).
- Aislamiento por organización y por vendedor vía RLS forzada.

**Funciones a usar en vez de DML directo:**
`assign_ticket` · `create_payment` · `void_payment` · `bulk_create_tickets` · `approve_tickets` ·
`cancel_ticket`. Todas validan permisos internamente y auditan. Son `SECURITY DEFINER`: existen
precisamente para hacer cosas que la RLS del usuario prohíbe.

**Vistas de solo lectura:** `v_ticket_balances` · `v_client_balances` · `v_seller_summary` ·
`v_raffle_summary` · `v_payment_history`.

**Funciones de reporte** (`0013`, solo lectura): `report_payment_totals` y
`report_payments_by_day`. Al revés que las anteriores son **`SECURITY INVOKER`**, para heredar la
RLS de quien consulta (D-057). Úsalas para cualquier agregado de pagos que necesite parámetros.

---

## 6.b Qué reutilizar antes de escribir nada nuevo (desde la Fase 3)

```
components/data/    DataTable · DataTablePagination · StatusBadge · EmptyState
                    PageHeader · MetricCard
components/form/    MoneyInput · TicketNumberInput
components/feedback/ ConfirmDialog · PageSkeleton · TableSkeleton · ReportSkeleton
features/reports/   ReportsView (los dos portales) · ReportTable · ReportNav · ReportFilters
                    ExportCsvButton
lib/                action-result.ts · auth/guards.ts (authorizeAction, requireStaff)
                    csv.ts (toCsv, escapeCsvCell) · supabase/paginate.ts (fetchAllRows)
```

**`DataTable` o `ReportTable`.** `DataTable` ordena en el navegador: úsalo en los listados
operativos. En una tabla paginada en servidor esa ordenación afectaría **solo a la página visible**,
así que los reportes usan `ReportTable`, que es un Server Component sin ordenación y con el orden
puesto por SQL (D-058).

Convención de cada módulo de `features/`: `schemas.ts` (Zod, cliente **y** servidor) ·
`queries.ts` (`server-only`, lectura para RSC) · `actions.ts` (`use server`) · `components/`.

Toda Server Action sigue el mismo orden: `authorizeAction` → Zod → RPC o DML sujeto a RLS →
`mapPgError` → `revalidatePath` → `{ ok } | { error }`.

Los filtros y la paginación viven en la **URL**, no en estado de React: la página es compartible y el
RSC vuelve a consultar filtrando en SQL.

Las tablas y los filtros **sirven a los dos portales** y se parametrizan, no se duplican (D-051):
`TicketsTable` y `ClientsTable` reciben `basePath` / `showSeller` / `enableApproval`;
`PaymentsTable` recibe `clientBasePath` / `showSeller` / `canVoid`; `TicketFilters`,
`ClientFilters` y `PaymentFilters` ocultan los selectores que no se les pasan.

**El dinero se calcula en SQL, siempre.** `paid_amount` lo mantiene un trigger, `payment_status` es
una columna generada, los saldos salen de las vistas y los totales de cobranza por fechas, de las
funciones `report_*`. Lo único que vive en la aplicación es el reparto de un abono entre boletas
(`features/payments/allocation.ts`, funciones puras), y aun así `create_payment` lo revalida antes
de escribir. Donde los reportes suman en TypeScript, lo hacen sobre filas **ya agregadas** por la
base de datos —una por rifa y vendedor, decenas—, nunca sobre boletas o pagos sueltos.

**Ninguna lectura que pueda superar 1.000 filas usa `data.length`.** PostgREST corta ahí sin dar
error (I-011). Para contar, `count: 'exact', head: true`; para recorrer todo, `fetchAllRows`
(`lib/supabase/paginate.ts`), que pide bloques con un orden estable hasta que uno viene incompleto.

---

## 7. Verificar el estado real sin leer documentación

Si dudas de si la documentación está al día, pregúntale a la base de datos:

```bash
npm run test:db
```

254 pruebas que fallan si alguien rompió una invariante. Incluyen comprobaciones de catálogo que
detectan una tabla sin RLS, una función sin `search_path` o una vista sin `security_invoker`,
**aunque nadie escriba una prueba nueva**.

⚠️ Esta suite crea 5.000 boletas en una rifa **en borrador** llamada «Rifa Volumen Fase 6», para la
prueba de volumen. Es idempotente (las reutiliza en ejecuciones posteriores), pero deja la base
distinta de como la dejó el seed: **`db:reset` + `seed:local` antes de `test:e2e`**.

```bash
npm run verify
```

typecheck + lint + unitarias + build.

```bash
npm run test:e2e
```

89 pruebas end-to-end (Playwright) que recorren los dos portales con sesiones reales, en escritorio y
en móvil (Pixel 7). Levanta solo el servidor con `npm run dev:local`; **exigen la base local recién
sembrada** (`npm run db:reset && npm run seed:local`). Fueron las que destaparon I-011.

---

## 8. Reglas de trabajo que no se negocian

1. **Una fase a la vez, solo con autorización explícita.** No adelantar trabajo de fases siguientes.
2. **Migraciones inmutables** una vez aplicadas al proyecto real: los cambios van en una migración
   nueva (así nacieron `0009` y `0010`).
3. **Las pruebas de RLS nunca usan `service_role`** — omitiría RLS y pasarían aunque no existiera
   ninguna política (D-043).
4. **El dinero se calcula en SQL**, nunca en el frontend.
5. **`SUPABASE_SERVICE_ROLE_KEY` jamás llega al navegador** (`import 'server-only'`).
6. Al cerrar la fase: actualizar documentación, ejecutar `npm run verify` y `npm run test:db`,
   commit local + etiqueta `fase-N`. Detalle en `CLAUDE.md` §34.

---

## 9. Trampas conocidas (te ahorran horas)

| Síntoma | Causa | Ver |
|---|---|---|
| Login falla en navegador pero funciona por API | `\r` dentro de un valor de `.env.local` | I-010 |
| `invalid_credentials` tras crear un usuario | `createUser` no deja la contraseña usable; hace falta `updateUserById` después | I-007 |
| `invalid_credentials` con la contraseña correcta | Límite de intentos de Supabase Auth tras varios fallos | I-008 |
| `permission denied for table X` | Falta un `GRANT`: no confíes en los que Supabase pone por defecto | D-037 |
| DNS no resuelve `db.<ref>.supabase.co` | Usa el **session pooler** (`aws-0-<región>.pooler.supabase.com`) | I-005 |
| Un `sum()` de dinero llega como string | `sum(bigint)` devuelve `numeric`: castea a `bigint` | D-040 |
| Error de tipos al insertar en `tickets`/`raffles` | `internal_code`/`short_code` los pone un trigger | D-039 |
| `Could not embed … more than one relationship` | Hay 2 FK de `tickets` a `clients`: usa la pista `clients!tickets_client_org_fk` | §6 |
| Una consulta devuelve como mucho 1.000 filas | Límite `max_rows` de PostgREST. Para contar usa `count: 'exact', head: true`, nunca `data.length` | I-011 |
| Un `UPDATE` bloqueado por RLS **no** da error | Afecta cero filas en silencio: hay que comprobar `data.length === 0` (así se detecta que un Admin no pudo tocar al Owner) | BD `F3-03` |
| El desarrollo escribe en el proyecto real | `npm run dev` usa `.env.local`. Usa `npm run dev:local` | I-013 · D-047 |
| Un usuario desactivado desaparece del listado | Falta la migración `0011` en ese entorno | I-011 |
| Una fecha de pago, venta o rifa aparece **un día antes** | `new Date('2026-08-04')` es medianoche **UTC**, que en Bogotá aún es el día 3. Usa `formatDateEs`/`formatDateCsv`, que ya lo tratan | I-017 |
| El reporte «Pagos por fecha» falla en producción | Falta la migración `0013` en ese entorno | §3 |
| Una prueba E2E lee 0 filas de una tabla que sí está | `count()` y `allInnerTexts()` **no auto-esperan** y corren contra el `loading.tsx`. Ancla antes con `expect(...).toBeVisible()` | TESTING §3.1 |
| `loginAs` falla al cambiar de usuario en una prueba | Con sesión abierta, `/login` redirige al panel. Usa `logout(page)` | TESTING §3.1 |
| Un Route Handler dentro de `(protected)` es público | Los layouts no protegen `route.ts`. Comprobar sesión y rol dentro | D-060 |
| Una consulta con RLS tarda segundos | Una política llama a una función pasándole una **columna** → una llamada por fila. Usar `columna in (select current_staff_org_ids())` | I-019 · D-063 |
| Vitest no puede importar un módulo con `server-only` | Está aliasado a un stub en `vitest.config.mts`; si aparece el error, falta el alias | D-064 |
| Una prueba E2E deja el seed corrupto | Restituir por base de datos en un `afterEach` (`setMembershipActive`), no por la interfaz dentro de la prueba: si agota el tiempo, el `finally` no llega a ejecutarse | TESTING §3.1 |
| Una ruta inexistente devuelve 200 en vez de 404 | El segmento tiene `loading.tsx`: la respuesta ya iba en streaming. No filtra datos | I-014 |
| Una vista `security_invoker` pierde filas enteras | Un `JOIN` interno contra una tabla que quien consulta no ve borra la fila. **Usa LEFT JOIN** para los nombres | I-015 |
| Un pago registrado por un admin no aparece en el historial del vendedor | Falta la migración `0012` en ese entorno | I-015 |
| Aplicar migraciones al remoto sin ver la contraseña | `npx supabase db push --dry-run` primero, y `--yes` para no quedarse esperando la confirmación | §3 |
| Un despliegue de Vercel falla con `Faltan variables de entorno obligatorias` | Revisa el **nombre exacto** de cada variable (un solo carácter de más o de menos rompe `check:env`) y que el scope **Production** esté marcado | I-021·§3.b |
| Un volcado de `supabase db dump` sale con `LegacyDbConfigParseUrlError` | `require('dotenv').config()` imprime un aviso por `stdout` que se cuela en `$(...)` y corrompe la URL capturada. Lee el `.env.local` con `fs.readFileSync` en vez de `dotenv` | §3.b |
| Un volcado de datos (`db dump --data-only`) incluye contraseñas cifradas | Sin `--schema public`, arrastra `auth.users` completo. Con `--schema public` en el volcado de **esquema** en cambio, se rompe `pg_trgm` al restaurar — restríngelo solo en el de datos | §3.b · I-024 |
| Un enlace de invitación real cae en la portada al hacer clic, con `otp_expired` | La URL de destino no está en Authentication → URL Configuration del proyecto Supabase (local o real) | I-023 |
