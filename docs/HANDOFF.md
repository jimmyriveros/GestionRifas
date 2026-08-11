# HANDOFF — punto de entrada para una sesión nueva

Memoria operativa compartida entre Claude Code y Codex. Lee primero las instrucciones de tu agente
(`CLAUDE.md` o `AGENTS.md`), revisa Git y continúa aquí. `PHASE_STATUS.md` responde qué estado tiene el
producto; este archivo responde qué necesita saber el siguiente agente para trabajar sin romper la
continuidad.

## 0. Cómo entregar el relevo

Después de trabajo significativo, actualiza el bloque §1.a con una sola fotografía vigente:

| Campo | Contenido obligatorio |
|---|---|
| Resultado | Qué se terminó y qué quedó deliberadamente fuera |
| Archivos | Archivos o carpetas realmente tocados |
| Reutilización | Patrones y piezas existentes que se conservaron o ampliaron |
| Decisiones | `D-*`, `BR-*`, suposiciones y alternativas descartadas |
| Verificación | Comandos, resultados, errores encontrados y correcciones |
| Advertencias | Trampas, precondiciones y acciones que no deben ejecutarse sin autorización |
| Pendiente | Problemas, bloqueos, confirmación humana y siguiente acción exacta |
| Git | Rama, commit base observado y cambios sin commit. El hash de entrega puede quedar en el reporte final; no crees otro commit solo para que un documento cite a su propio commit |

No conviertas este archivo en otro historial: el detalle cronológico vive en `TEST_RESULTS.md`,
`KNOWN_ISSUES.md` y el historial de Git. No copies aquí el estado completo de las fases.

---

## 1. Estado actual

| | |
|---|---|
| Última fase completada | **9 — Auditoría final independiente. El plan de 10 fases está terminado** |
| Siguiente fase | Ninguna. Todo mantenimiento posterior requiere una tarea y priorización explícitas (ver §1.b) |
| Último cambio funcional promovido | `45759f6` — resumen de cobranza en el panel, en vez de «Rifa activa» (D-090), 2026-08-11; desplegado en Vercel y verificado. No necesitó migración |
| Punto de partida del último mantenimiento | `main` en `c49ccc2`, igual a `origin/main`, con árbol limpio antes de implementar (2026-08-11) |
| Etiquetas | La última es `fase-9`, que apunta a `0becc47`. Solo `fase-0`, `fase-1` y `fase-2` están en el remoto; `fase-3` a `fase-9` siguen solo en local. No mover ni empujar etiquetas sin autorización |
| Remoto | `github.com/jimmyriveros/GestionRifas`. La igualdad local/remoto se comprobó en `929684d`; después de ese punto debe verificarse de nuevo con Git, no asumirse por este texto |
| **Producción** | **`https://gestion-rifas.vercel.app`** — proyecto Vercel `gestion-rifas`, desplegado y verificado (cabeceras, aislamiento de rutas, los 3 roles probados por el usuario) |
| App | Next.js 16: autenticación, portal administrativo, portal del vendedor, pagos/abonos y **reportes con exportación CSV**, todo funcionando **en producción** |
| Base de datos | **21 migraciones en local y en el proyecto real**; `0021` se promovió y verificó el 2026-08-09 después del respaldo externo requerido. **Plan Free: sin backups automáticos** (I-024), respaldo lógico manual en §3.b |
| Pruebas | **299 unitarias**, **378 de base de datos** y **227 E2E**, todas revalidadas el 2026-08-11; `verify` en verde. `npm audit`: **0 vulnerabilidades** en la última comprobación registrada. CI en GitHub Actions desde la Fase 8 |

**Lo que existe hoy:** el producto completo del MVP **en producción real** — crear rifas y boletas,
repartirlas entre vendedores, venderlas a clientes, cobrarlas con abonos, y consultar y exportar todo
eso en reportes. Los saldos y los estados de pago los calcula la base de datos. Endurecido en la
Fase 7 (CSP por nonce, limitación de intentos, RLS ~1.400× más rápida), desplegado en la Fase 8 y
auditado en la Fase 9 con **47 intentos deliberados de romperlo**, ninguno de los cuales consiguió
leer ni escribir un dato ajeno. Informe: `docs/AUDIT_REPORT.md`.
Desde el 2026-08-08 la lista de boletas admite **selección múltiple y acciones masivas** (BR-B01..
BR-B08), ya **en producción**.
El importador CSV/JSON admite además filas opcionales con cliente + celular obligatorio (D-087).
La base real ya tiene `0021`; el push coordinado de `main` activa el frontend correspondiente.
**Lo que NO existe:** backups automáticos de Supabase (plan Free — I-024, prerrequisito antes de datos
reales).

---

## 1.a Último relevo significativo — resumen de cobranza en el panel (2026-08-11)

| Campo | Estado |
|---|---|
| Resultado | Se reemplazó el bloque «Rifa activa» de los dos paneles (Dueño y Vendedor) por un resumen ejecutivo de cobranza (`CollectionSummaryCard`, D-090): recaudado, pendiente, barra de progreso, porcentaje y boletas por cobrar. No usa datos nuevos: reutiliza exactamente `dashboard.totals`, la misma fuente que ya alimentaba las tarjetas de «Cobranza» y las de `/owner/payments`/`/seller/payments`. Se retiraron por redundancia las 3 tarjetas de dinero de esa fila (quedan las 3 de conteo: Sin pagar/Abonadas/Pagadas) y el botón «Crear boletas» del panel del vendedor (ya vive en `/seller/tickets`, encabezado + estado vacío). **No se tocó base de datos, esquema, RLS ni consultas de negocio** |
| Archivos | Nuevos: `CollectionSummaryCard.tsx`, `collection-summary.ts`, `tests/unit/collection-summary.test.ts`, `tests/e2e/dashboard-collection-summary.spec.ts`. Modificados: `owner/dashboard/page.tsx`, `seller/dashboard/page.tsx`, `dashboard/queries.ts`, `dashboard/seller-queries.ts`, `tour/tours.ts`. Documentación: `DECISIONS.md` (D-090), `ARCHITECTURE.md` §8.2 |
| Reutilización | `dashboard.totals` tal cual, sin ninguna consulta nueva; la barra de progreso copia el patrón accesible que ya existía en `BulkTicketCreator.tsx` (`role="progressbar"` + dos `div`, sin librería nueva); `MetricCard`, `Card`, `formatCOP` y `tourTarget` de siempre |
| Decisiones | **D-090**. La consistencia con `/owner/payments` y `/seller/payments` se verificó **end-to-end** (la prueba E2E lee ambas pantallas y compara los números), no solo revisando el código. `activeRaffle` y `canCreateTickets` (`SellerDashboard`/`AdminDashboard`) se retiraron por quedarse sin ningún consumidor tras el cambio — junto con la consulta `listRaffleOptions()` que solo existía para calcularlos en el panel del vendedor, una petición menos por carga |
| Verificación | `typecheck` ✅ · `lint` ✅ 0 errores · **299/299** unitarias ✅ (293 + 6 nuevas) · `build` ✅ · **378/378** de base de datos ✅ (sin cambios de esquema) · **227/227** E2E ✅ (224 anteriores + 3 nuevas). La primera pasada completa marcó 5 fallos en archivos que este trabajo no toca (`back-navigation`, `filas-seleccionables`, `importar-boletas`); repetidos solos tras `db:reset`+`seed:local` pasaron 27/27 — contaminación entre archivos de una corrida larga sin resets intermedios, no una regresión (mismo patrón que I-035/I-055) |
| Errores encontrados | Una prueba E2E propia asumía que `CardTitle` expone rol `heading`; en este sistema de diseño es un `<div>` sin rol ARIA — corregido antes de proponerlo, no era un defecto del producto |
| Advertencia | Mismo límite que en relevos anteriores: el navegador integrado de este entorno no compone fotogramas fuera de las pantallas más simples (I-012). El panel se leyó por texto sin problema, pero `/owner/payments` se quedó pegado al esqueleto en la vista previa aunque el servidor ya había respondido 200 — la verificación real fue con Playwright, que sí compara ambas pantallas |
| Publicación | **Desplegado en producción el 2026-08-11 con autorización expresa.** Sin migraciones que aplicar (`git diff` del commit confirma 0 archivos tocados bajo `supabase/migrations`). Después del push: CI 2/2 (`31529067336`), despliegue de Vercel `READY` sobre el SHA `45759f6` (`dpl_9i6SLt1vhEp6EfcA8jaFHxbmKg6d`, verificado por API, no solo porque la URL respondiera), y `https://gestion-rifas.vercel.app/login` en HTTP 200 con sus cabeceras; `/owner/dashboard` y `/seller/dashboard` en 307 hacia el login, como corresponde sin sesión |
| Pendiente | Verificación visual manual con sesión real (un agente no inicia sesión en producción). Aparte de eso, nada de este trabajo. Siguen abiertos los mismos riesgos operativos I-021, I-023 e I-024, y la deuda I-030, I-037 e I-046–I-052 |
| Git | Rama `main`, de `c49ccc2` a `45759f6`. Se empujó **solo la rama**: las etiquetas `fase-3`…`fase-9` siguen sin subir |

## 1.a.1 Relevo anterior — flecha de volver en las pantallas de detalle (2026-08-10)

Contexto histórico: ya publicado y verificado en producción (`a25a289`, con `e9d3444`/`bb6db5f`
previos de corrección/documentación). Resumen: patrón global de navegación hacia atrás (BR-X09,
D-089) en las 8 pantallas de detalle/edición y 2 más; prefiere el historial real de la sesión y cae en
un destino de repuesto por entidad cuando no hay pantalla anterior real. Detalle completo en
`DECISIONS.md` (D-089) y en el historial de Git.

## 1.b Qué queda abierto

**No hay trabajo técnico activo autorizado.** El plan de fases terminó, pero sí quedan decisiones del
dueño, deuda aceptada y límites verificados; no deben describirse como si no existieran:

| Asunto | Qué hace falta |
|---|---|
| **I-024** — plan Free sin backups automáticos ni PITR | Subir a Supabase Pro o automatizar el respaldo externo. **Prerrequisito antes de operar con dinero o clientes reales** (`RUNBOOK.md` §5.3) |
| **I-021** — cuentas de demostración en producción con contraseña compartida | Desactivarlas o rotarles la contraseña (`OPERATIONS.md` §5) |
| **I-023** — la URL permitida de Auth debe coincidir con la canónica de Vercel | Confirmar `https://gestion-rifas.vercel.app/**` en Vercel y Supabase antes de enviar invitaciones (`DEPLOYMENT.md` §2.1) |
| **I-030** — persisten mensajes de base de datos sin tildes | Autorizar una migración nueva que reescriba las definiciones vigentes y aplicarla al proyecto real (D-073) |
| **I-037** — filtro fijo de clientes topado en 200 | Priorizar un selector con búsqueda cuando el volumen lo justifique |
| **I-046 a I-053** — límites y derivas encontrados por esta auditoría | Revisar `KNOWN_ISSUES.md`: no se modificó código para corregirlos porque esta tarea es solo documental |

## 1.c Contexto histórico preservado

Las siguientes notas explican decisiones recientes de producción que siguen siendo trampas útiles;
no sustituyen el relevo vigente de §1.a ni el historial propietario de Git/`TEST_RESULTS`.

La última acción de ingeniería **sobre producción** fue aplicar la migración **`0021`** al proyecto
real (2026-08-09, autorizada explícitamente) y activar desde `main` el despliegue de los **clientes
con celular obligatorio en la importación CSV/JSON** (BR-N12, D-087). La selección múltiple y las
acciones masivas de boletas (BR-B01..BR-B08, D-082 a D-085) siguen disponibles: se marcan varias
boletas de la lista y se actúa sobre todas: el
vendedor las vende a un cliente de una vez; el Dueño y el Administrador aprueban, anulan, cambian de
vendedor y **eliminan** las que se cargaron por error. Lo que conviene saber antes de tocarlo:

* **No hay reglas de boletas nuevas.** El cuerpo de `assign_ticket` y `cancel_ticket` se extrajo a
  `assign_ticket_row` y `cancel_ticket_row`, que ahora usan tanto la acción individual como la
  masiva. Si cambias una regla de asignación o anulación, cámbiala **ahí** y afecta a las dos.
* **Eliminar sí es nuevo** y es borrado físico, acotado a boletas sin cliente, sin venta y sin
  abonos, y **nunca a una anulada** (su combinación queda reservada, BR-N08). Sigue sin haber
  privilegio de `DELETE` para nadie: ocurre dentro de una función `SECURITY DEFINER` (D-084).
* **La selección vive fuera de React**, en `sessionStorage` leído con `useSyncExternalStore`. Es lo
  que la hace sobrevivir a buscar, filtrar y recargar (D-082).
* **Al escribir pruebas E2E que pulsan lo primero al entrar a una pantalla**, usa `toggleCheckbox`
  de `fixtures.ts` o el mismo patrón: sin reintentar, el clic cae antes de la hidratación y la
  prueba culpa al producto (`TESTING.md` §5.3).

Antes de eso, la última acción sobre producción fue aplicar la migración **`0019`** (2026-08-08,
autorizada explícitamente): añade `taken_ticket_combinations` y `log_ticket_import`, las dos piezas
del importador de archivos (BR-N12, D-081). Respaldo previo en
`Rifas-backups/2026-08-08-antes-0019/`, comprobado sin `auth.users`. Verificada por catálogo
(`verify:remote` 13/13 + privilegios de las dos funciones) y **por comportamiento**, simulando una
sesión real con `request.jwt.claims` dentro de una transacción revertida: la combinación existente
se devuelve, la inexistente no, la respuesta trae **solo los dos números**, y la bitácora recibe una
fila con origen y recuentos. La transacción se revirtió: producción quedó con **0** filas
`ticket.import` de prueba. Por PostgREST, `anon` recibe `42501` en las dos —lo que además
demuestra que la caché de esquema se recargó—.

El mismo día se aplicó la **`0018`** (2026-08-08,
autorizada explícitamente): añade `search_tickets` y los dos índices de trigramas sobre los números
de la boleta (BR-N11, D-080). Respaldo previo en `Rifas-backups/2026-08-08-antes-0018/`, comprobado
sin `auth.users`. Verificada allí por catálogo (`verify:remote` 13/13) **y por comportamiento**
contra los datos reales: el número diario y el semanal encuentran la boleta enteros y en parte; el
código interno, entero o en prefijo, no encuentra nada; las coincidencias del diario salen primero; y
`anon` recibe `42501` al invocar la función por PostgREST, que además demuestra que la caché de
esquema se recargó.

Antes de esa se aplicó la **`0017`** (2026-08-07,
autorizada explícitamente): añade la normalización de acentos y teléfonos y los dos índices de
trigramas de la búsqueda (D-079). Respaldo previo en `Rifas-backups/2026-08-07-antes-0017/`.
Verificada allí por catálogo (13 comprobaciones) **y por comportamiento**: se insertó «Jesús Peña
Ñuñez» dentro de una transacción, se comprobó que aparece buscando «jesus», «pena», «nunez», el alias
sin tilde y el teléfono en dos formatos, y se revirtió — 6 clientes antes y 6 después.

Verificar después la búsqueda **desde el camino de datos de la aplicación** (no con SQL a mano) sacó a
la luz I-039: un teléfono guardado sin indicativo no se encontraba escribiéndolo con «+57». Corregido
sin migración nueva. Merece la pena repetir esa comprobación tras cualquier cambio de esquema: es
además la que demuestra que PostgREST recargó su caché y expone las columnas nuevas.

**Lo que falta y no puede hacer un agente:** entrar a producción por el navegador con los tres roles y
escribir en los buscadores. `login está prohibido para un agente` (Fase 8), así que esa pasada la hace
el usuario.

Antes de esa se aplicó la `0016` (2026-08-05): cierra I-025 —un Owner podía dejar su organización sin
propietario, de forma irrecuperable desde la aplicación— con un constraint trigger diferido (D-071).
Verificada también por catálogo y por comportamiento: degradar al Owner en producción es rechazado.

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

✅ **Las 21 migraciones están aplicadas también en el proyecto real** y verificadas el 2026-08-09
(`npm run verify:remote`, 13/13, más sonda específica de `0021` con rollback y 0 residuos).

Al aplicar migraciones al proyecto real, primero exige autorización explícita y genera el respaldo
de §3.b. Después, la promoción de base de datos tiene **tres** pasos, no dos:

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

El núcleo es obligatorio para ambos agentes, pero los documentos acumulativos se consultan por sus
secciones actuales y por los identificadores relacionados; no hace falta releer cada snapshot
histórico en una tarea sin relación.

### 5.1 Núcleo común

| Orden | Documento | Responsabilidad única |
|---|---|---|
| 1 | `AGENTS.md` **o** `CLAUDE.md` | Instrucciones del agente que trabaja |
| 2 | Este archivo | Relevo y contexto operativo actual |
| 3 | `PHASE_STATUS.md` | Estado del producto y de las fases |
| 4 | `MASTER_SPEC.md` | Alcance funcional consolidado |
| 5 | `ARCHITECTURE.md` | Diseño técnico y patrones vigentes |
| 6 | `BUSINESS_RULES.md` | Reglas normativas `BR-*` |
| 7 | `DECISIONS.md` | Decisiones `D-*`; lee las entradas relacionadas y sus notas de vigencia |

### 5.2 Según el cambio

| Vas a... | Lee además |
|---|---|
| Tocar esquema, consulta, índice o migración | `DATA_MODEL.md`, migraciones y `database.types.ts` |
| Escribir auth, RLS, permisos, RPC, Server Action o Route Handler | `SECURITY.md` y pruebas de aislamiento |
| Crear o modificar UI responsive | `ARCHITECTURE.md` §8 y `UX_COPY_GUIDELINES.md` |
| Escribir o cambiar cualquier texto visible | `UX_COPY_GUIDELINES.md` completa y `src/lib/constants.ts` |
| Escribir pruebas | `TESTING.md`; `TEST_RESULTS.md` si buscas una regresión o trampa conocida |
| Ejecutar una fase formal | `IMPLEMENTATION_PLAN.md`, solo la sección autorizada |
| Desplegar o tocar producción | `DEPLOYMENT.md`, `OPERATIONS.md`, `RUNBOOK.md` y `KNOWN_ISSUES.md` |
| Operar el negocio | `OPERATIONS.md` |
| Diagnosticar un incidente | `KNOWN_ISSUES.md`, `RUNBOOK.md` y, si aplica, el snapshot de `AUDIT_REPORT.md` |

### 5.3 Propiedad de la información

| Hecho | Documento propietario |
|---|---|
| Estado operativo y próximo relevo | `HANDOFF.md` |
| Estado de fase/producto | `PHASE_STATUS.md` |
| Problema, riesgo o deuda | `KNOWN_ISSUES.md` |
| Evidencia de pruebas | `TEST_RESULTS.md` |
| Procedimiento de producción | `DEPLOYMENT.md` / `RUNBOOK.md` |
| Razón estable | `DECISIONS.md` |
| Regla funcional | `BUSINESS_RULES.md` |
| Patrón técnico | `ARCHITECTURE.md` |

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
- Ningún `DELETE` en ninguna tabla (ni política ni privilegio). La **única** excepción controlada es
  `bulk_delete_tickets` (`0020`), que borra boletas cargadas por error desde dentro de una función
  `SECURITY DEFINER`; nadie gana el privilegio (D-084).
- Aislamiento por organización y por vendedor vía RLS forzada.
- Una organización nunca se queda sin Owner activo (`0016`, aplicada en local y en producción).

**Funciones a usar en vez de DML directo:**
`assign_ticket` · `create_payment` · `void_payment` · `bulk_create_tickets` · `approve_tickets` ·
`cancel_ticket` · `bulk_assign_tickets` · `bulk_cancel_tickets` · `bulk_change_ticket_seller` ·
`bulk_delete_tickets`. Todas validan permisos internamente y auditan. Son `SECURITY DEFINER`: existen
precisamente para hacer cosas que la RLS del usuario prohíbe.

**Importación con cliente (`0021`, local y producción):** `match_ticket_import_clients` acota la
vista previa a una cartera e `import_tickets_with_clients` crea/reutiliza clientes y llama a
`assign_ticket_row` en una sola transacción (D-087).

⚠️ **`assign_ticket` y `cancel_ticket` ya no llevan las reglas dentro**: delegan en
`assign_ticket_row` y `cancel_ticket_row`, que comparten con las masivas. Si cambias una regla,
cámbiala ahí (D-083).

**Vistas de solo lectura:** `v_ticket_balances` · `v_client_balances` · `v_seller_summary` ·
`v_raffle_summary` · `v_payment_history`.

**Funciones de reporte** (`0013`, solo lectura): `report_payment_totals` y
`report_payments_by_day`. Al revés que las anteriores son **`SECURITY INVOKER`**, para heredar la
RLS de quien consulta (D-057). Úsalas para cualquier agregado de pagos que necesite parámetros.

---

## 6.b REUSE → EXTEND → CREATE: qué reutilizar antes de escribir nada nuevo

```
components/data/    DataTable · DataTablePagination · StatusBadge · EmptyState
                    PageHeader (backHref = flecha de volver, D-089) · BackButton · MetricCard
lib/navigation-history.ts  detecta si hay historial real en esta pestaña, para
                    BackButton. Contador de modulo, no sessionStorage (D-089)
components/form/    MoneyInput · TicketNumberInput
components/feedback/ ConfirmDialog · PageSkeleton · TableSkeleton · ReportSkeleton
features/tickets/import/  importador de archivos CSV/JSON: UN componente para los tres
                    roles, parametrizado por contexto (D-081/D-087). Antes de escribir otro
                    lector o resolver clientes, míralo: columnas/csv/json/clients/rows/review
features/tickets/selection/  selección múltiple y acciones masivas (D-082..D-085):
                    contexto + almacén fuera de React + elegibilidad + diálogos
components/form/    SelectionCheckbox (20 px a la vista, 44 px de diana)
lib/use-media-query.ts  consulta de medios sin romper la hidratación. Solo para
                    COMPORTAMIENTO; lo que se ve lo decide Tailwind
features/tour/      recorrido guiado: pasos y textos en tours.ts, nada disperso (D-074)
features/reports/   ReportsView (los dos portales) · ReportTable · ReportNav · ReportFilters
                    ExportCsvButton
lib/                action-result.ts · auth/guards.ts (authorizeAction, requireStaff)
                    csv.ts (toCsv, escapeCsvCell) · supabase/paginate.ts (fetchAllRows)
                    tickets.ts (ticketLabel: «1234 / 5678», BR-N11)
```

**Una boleta se nombra con `ticketLabel`, nunca escribiendo `${daily} / ${weekly}` a mano.** Es lo que
evita acabar con cinco formatos para lo mismo, y lo que hace que el código interno no se vuelva a
colar en una lista (BR-N11, D-080).

**`DataTable` o `ReportTable`.** `DataTable` ordena en el navegador: úsalo en los listados
operativos. En una tabla paginada en servidor esa ordenación afectaría **solo a la página visible**,
así que los reportes usan `ReportTable`, que es un Server Component sin ordenación y con el orden
puesto por SQL (D-058).

Convención de cada módulo de `features/`: `schemas.ts` (Zod, cliente **y** servidor) ·
`queries.ts` (`server-only`, lectura para RSC) · `actions.ts` (`use server`) · `components/`.

Toda Server Action parametrizada de negocio debe seguir el mismo orden: `authorizeAction` → Zod →
RPC o DML sujeto a RLS → `mapPgError` → `revalidatePath` → `{ ok } | { error }`. Autenticación y
`logout` tienen guardas propias. I-051 registra una excepción preexistente; no debe copiarse y queda
pendiente de endurecimiento.

Los filtros y la paginación viven en la **URL**, no en estado de React: la página es compartible y el
RSC vuelve a consultar filtrando en SQL.

Las tablas y los filtros **sirven a los dos portales** y se parametrizan, no se duplican (D-051):
`TicketsTable` y `ClientsTable` reciben `basePath` / `showSeller` / `showRaffle` / `enableApproval`;
`PaymentsTable` recibe `clientBasePath` / `showSeller` / `canVoid`; `TicketFilters`,
`ClientFilters` y `PaymentFilters` ocultan los selectores que no se les pasan.

En `/seller/tickets` no hay filtro ni columna «Rifa»: el negocio opera una sola (D-088). Se consigue
**no pasando** `raffles` a `TicketFilters` y pasando `showRaffle={false}` a la tabla y a
`TicketListSlot` —«Ver seleccionadas» es la misma pantalla y debe enseñar las mismas columnas—. El
portal administrativo los conserva, y la consulta sigue aceptando `raffleId` por la URL.

**El dinero se calcula en SQL, siempre.** `paid_amount` lo mantiene un trigger, `payment_status` es
una columna generada, los saldos salen de las vistas y los totales de cobranza por fechas, de las
funciones `report_*`. Lo único que vive en la aplicación es el reparto de un abono entre boletas
(`features/payments/allocation.ts`, funciones puras), y aun así `create_payment` lo revalida antes
de escribir. Donde los reportes suman en TypeScript, lo hacen sobre filas **ya agregadas** por la
base de datos —una por rifa y vendedor, decenas—, nunca sobre boletas o pagos sueltos.

Para contar, usa `count: 'exact', head: true`; para recorrer todo, `fetchAllRows`
(`lib/supabase/paginate.ts`), que pide bloques con un orden estable hasta que uno viene incompleto.
No supongas que todos los caminos actuales ya cumplen esta regla: la auditoría de continuidad encontró
lecturas auxiliares e historiales todavía acotados o sujetos al límite de PostgREST (I-046).

---

## 7. Verificar el estado real sin leer documentación

Si dudas de si la documentación está al día, pregúntale a la base de datos:

```bash
npm run test:db
```

378 pruebas que fallan si alguien rompió una invariante. Incluyen comprobaciones de catálogo que
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

213 pruebas end-to-end (Playwright) que recorren los dos portales con sesiones reales, en escritorio y
en móvil (Pixel 7). Levanta solo el servidor con `npm run dev:local`; **exigen la base local recién
sembrada** (`npm run db:reset && npm run seed:local`). Fueron las que destaparon I-011.

---

## 8. Reglas de trabajo que no se negocian

1. **Una fase a la vez, solo con autorización explícita.** No adelantar trabajo de fases siguientes.
2. **Migraciones inmutables** una vez aplicadas al proyecto real: los cambios van en una migración
   nueva (así nacieron `0009` y `0010`).
3. **El acto cuya RLS se prueba nunca usa `service_role`** — omitiría RLS y pasaría aunque no
   existiera ninguna política. La clave de servicio puede preparar/comprobar/limpiar el escenario
   fuera de ese acto (D-043).
4. **El dinero se calcula en SQL**, nunca en el frontend.
5. **`SUPABASE_SERVICE_ROLE_KEY` jamás llega al navegador** (`import 'server-only'`).
6. Al cerrar la fase: actualizar documentación, ejecutar `npm run verify` y `npm run test:db`,
   commit local + etiqueta `fase-N`. Detalle en las instrucciones del agente.
7. **Revisar Git antes de implementar.** Todo cambio sin commit se presume del usuario u otro agente;
   no se resetea, descarta, sobrescribe ni reformatea sin necesidad.
8. **REUSE → EXTEND → CREATE.** Buscar primero las piezas de §6.b y los patrones del código real. No
   crear capas `services`, stores globales, wrappers o componentes paralelos por preferencia.
9. **Política de cambio mínimo.** Sin refactors, renombramientos, movimientos, dependencias ni limpieza
   fuera del alcance autorizado.
10. **Continuar el trabajo del otro agente.** Leer `HANDOFF`, `PHASE_STATUS`, diff, commits y archivos
    tocados; no reimplementar ni sustituir silenciosamente una decisión arquitectónica.
11. **Documentar por propiedad.** Actualizar solo el documento cuyo tema cambió; los snapshots
    históricos se conservan. D-086 fija la jerarquía y el protocolo común.
12. **Mantenimiento no es una fase.** Después de la Fase 9 se usan pruebas proporcionales, commit local
    y relevo; no se crea una etiqueta `fase-*` nueva sin autorización.

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
| El seed falla con `AuthRetryableFetchError` (502) justo después de `db:reset` | GoTrue tarda más que Postgres en arrancar tras reiniciar los contenedores. Espera a que `curl http://127.0.0.1:54321/auth/v1/health` dé 200, o reintenta: el seed es idempotente | I-028 |
| Una Server Action nueva en un módulo anidado parece no tener red de pruebas | Ya la tiene: desde la Fase 9 el recorrido de `server-actions-guard.test.ts` es recursivo | I-026 |
| `F6-04` empieza a fallar después de tocar el seed o las pruebas de pagos | Depende de que `vendedor2` **no** tenga ningún pago. `F9-02` le crea uno y lo **borra** al terminar | TESTING §6.1 |
| Cambias un texto de la interfaz y las E2E fallan pese a haber actualizado las cadenas | Las pruebas también lo buscan dentro de **expresiones regulares** (`/menú de usuario/i`, `/de más/`), que ningún reemplazo de cadenas encuentra. Búscalas aparte con `grep -oE "/[^/]*palabra[^/]*/i?"` | D-073 |
| Un reemplazo masivo de textos rompe el `typecheck` con `Cannot find name` | El script confundió una línea de código con prosa y renombró un **identificador** (`numeros` → `números`). Pasó dos veces. Por eso el orden es corregir → `typecheck` → `lint` → unitarias → BD → E2E | D-073 · I-029 |
| Muchas pruebas E2E fallan de golpe con la pantalla tapada | El **recorrido guiado** se abre solo la primera vez y su capa bloquea los clics. `loginAs` lo desactiva por `localStorage`; si escribes una prueba que no lo use, pásale `{ withTour: true }` a propósito | D-074 · `tests/e2e/fixtures.ts` |
| Al añadir un paso al recorrido, el contador no cuadra o el paso no aparece | Un paso cuyo `data-tour` no exista **o no esté visible** se descarta al arrancar. Comprueba que el atributo esté en el DOM en esa ruta y ese rol | `ARCHITECTURE.md` §8.4 |
| Una prueba espera a `aria-busy="false"` y sigue antes de tiempo | Durante la pausa del debounce **todavía no se está buscando**, así que vale `false` sin que haya terminado nada. Espera al resultado real: que la lista se estreche | D-078 |
| Una función nueva resulta ejecutable por `anon` pese a las default privileges de `0015` | PostgreSQL concede EXECUTE a PUBLIC por defecto y aquella regla no lo alcanza. Añade `revoke execute … from anon, public` explícito en tu migración | I-020 · `0017` |
| Cambias `foldForSearch()` y la búsqueda de clientes deja de encontrar | Hay una copia de esa misma regla en SQL (`search_normalize`, `0017`). Las dos tienen que coincidir; lo comprueba `tests/db/search.test.ts` | D-079 |
| Buscas una boleta por su código interno y no aparece nada | Es lo esperado desde BR-N11: se busca por número diario o semanal, nunca por el código. La pantalla lo explica; el código sigue estando en el detalle de la boleta | D-080 |
| Una búsqueda de boletas devuelve las filas en un orden que parece aleatorio | Dentro del mismo escalón de relevancia el orden es **por número**, no por fecha. Si vuelve a verse desordenado, alguien tocó el `order by` de `search_tickets` | D-080 |
| Un CSV exportado de Excel «no funciona» y el encabezado parece correcto | La marca **BOM** va pegada al primer encabezado y es invisible. `parseCsv` ya la quita; si escribes otro lector, quítala tú | `import/csv.ts` |
| La comprobación previa del importador falla entera por una fila mala | La Server Action valida lo que recibe: mandarle un «12345» tumba la llamada completa. Manda solo las filas con formato válido — las demás no pueden existir en la base de datos igualmente | D-081 |
| Una prueba nueva sobre boletas del seed falla solo al correr la suite entera | Otras suites de `tests/db` dejan boletas creadas —la de volumen, 5.000—. Afirma sobre boletas que cree la propia prueba, o acota por `p_raffle_id`, en vez de contar filas del seed | I-035 · `ticket-search.test.ts` |
| Una prueba E2E falla con `page.goto: net::ERR_ABORTED at /login` y en la captura el login SÍ aparece | Otra navegación ganó la carrera: tras `clearCookies()` las peticiones RSC pendientes redirigen solas. `loginAs` ya lo reintenta; si aparece en otro `goto`, haz lo mismo | I-038 · `fixtures.ts` |
| Una prueba mide un contraste de **1,00** en un texto que se lee perfectamente | Con Tailwind 4 el navegador devuelve el color en `lab()`/`oklab()`, no en `rgb()`: leer sus números como canales de 0 a 255 da basura. Píntalo en un `canvas` y lee los píxeles | I-034 · `filas-seleccionables.spec.ts` |
| Un estado visual «se pierde» al pasar el cursor: texto claro sobre fondo claro | `hover:*` añade una pseudoclase y gana al fondo del estado elegido, pero el color del texto se queda. Escribe los estados como **ramas excluyentes**, cada una con su propio hover | D-077 · I-033 |
| Un clic en un menú de Radix dispara además la acción de la fila que lo contiene | El menú vive en un portal, pero React propaga el evento por el **árbol de componentes**. Comprueba `fila.contains(objetivo)` antes de mirar si el objetivo es interactivo | D-076 · `row-activation.ts` |
| Una medida de color o de tamaño sale distinta cada vez que se ejecuta la prueba | `transition-colors` y la animación de entrada del diálogo: estás midiendo un fotograma intermedio. Espera a que el valor deje de cambiar | I-034 |
| `seller-tickets.spec.ts` (BR-I08) empieza a fallar tras correr la suite varias veces sin `db:reset` | El selector de cliente del diálogo muestra los **primeros 50** cuando no se ha escrito nada en el buscador, y esa prueba no escribe. Cada ejecución que deja clientes nuevos acerca el límite. Una prueba que cree clientes debe borrarlos al terminar | I-035 |
| Una prueba E2E pulsa un botón y **no pasa nada**, pero a mano funciona | El clic cayó entre que el HTML del servidor está pintado —Playwright ya lo cree pulsable— y que React lo hidrató. Reintenta el gesto con `toggleCheckbox` (`fixtures.ts`) o el mismo patrón | `TESTING.md` §5.3 |
| En el teléfono, un toque se pierde en silencio al aparecer una barra o un aviso | `page.touchscreen.tap(x, y)` toca coordenadas de pantalla y no desplaza nada. Usa `locator.tap()`, que lleva el elemento a la vista y espera | `TESTING.md` §5.3 |
| Cambias una regla de asignación o anulación de boletas y la versión masiva no se entera | Desde `0020` la regla vive en `assign_ticket_row` / `cancel_ticket_row`; `assign_ticket` y `cancel_ticket` delegan. Cámbiala ahí, no en las funciones públicas | D-083 |
| Un `setState` dentro de un `useEffect` rompe el lint con «cascading renders» | El compilador de React lo rechaza. Deduce el estado en vez de sincronizarlo, o mueve el `setState` al `.then()` de una promesa | D-085 · `TicketSelectionContext.tsx` |
| Una prueba de boletas falla sola de vez en cuando, con un estado que no pusiste tú | Buscar una boleta por **el número diario solo** no la identifica: puede repetirse en otra combinación (BR-N07), así que `find()` acaba en la boleta de otra prueba. Acota siempre por el **par completo**, que es lo único único en la rifa (BR-N04) | I-055 · I-035 |
