# ESTRATEGIA DE PRUEBAS

- **Versión:** 2.2 · **Actualizado:** 2026-08-03 (Fase 5)
- Este documento define la ESTRATEGIA. Los resultados por fase están en [`TEST_RESULTS.md`](TEST_RESULTS.md).
- **Implementado:** unitarias (Vitest), base de datos (Vitest + Supabase local) y **end-to-end
  (Playwright, escritorio y móvil)** desde la Fase 3.

---

## 1. Pirámide de pruebas

| Nivel | Herramienta | Qué cubre | Dónde vive | Velocidad |
|-------|-------------|-----------|------------|-----------|
| Unitarias | Vitest | Formato de dinero, validadores Zod, cálculo de estados, transformaciones de fecha, utilidades | `tests/unit/` | ms |
| Base de datos | Vitest + `@supabase/supabase-js` contra Supabase local | Restricciones, triggers, RPC, **RLS con sesiones reales** | `tests/db/` | segundos |
| Componentes | Vitest + Testing Library | Formularios críticos, tabla de carga masiva, entrada de números | `tests/unit/components/` | ms |
| E2E | Playwright | Flujos completos por rol, responsive, protección de rutas | `tests/e2e/` | minutos |
| Volumen | Vitest + Supabase local | Que los agregados sigan en SQL y que nada se trunque en silencio con 5.000 boletas | `tests/db/volume-phase6.test.ts` | ~10 s |

**Principio rector:** toda regla marcada como crítica en `docs/BUSINESS_RULES.md` tiene al menos una
prueba **de base de datos**, no solo de interfaz. Una regla que solo se prueba en la UI no está
probada: el atacante no usa la UI.

---

## 2. Entorno de pruebas

- **Base de datos:** instancia local de Supabase (`supabase start`), reconstruida con
  `supabase db reset` antes de la suite de base de datos. Nunca se ejecutan pruebas contra
  producción.
- **Sesiones reales por rol:** las pruebas de RLS **no** usan `SERVICE_ROLE`. Cada prueba inicia
  sesión con `signInWithPassword` como Owner, Admin, Seller A o Seller B y opera con la clave
  pública, exactamente como lo haría un atacante con acceso al navegador.
- **Aislamiento:** cada archivo de prueba parte de un estado conocido (seed) y limpia lo que crea.
- **Datos de otra organización:** el seed incluye una segunda organización con su propio Owner y
  vendedor, exclusivamente para probar el aislamiento.

Estructura mínima de una prueba de RLS:

```ts
const sellerA = await signInAs('sellerA@example.test')
const { data, error } = await sellerA.from('tickets').select('*').eq('id', ticketDeSellerB)
expect(data).toEqual([])   // RLS no distingue "no existe" de "sin permiso"
expect(error).toBeNull()   // no filtra información por el tipo de error
```

### 2.1 Pruebas end-to-end (desde la Fase 3)

- **Herramienta:** Playwright (`playwright.config.ts`), proyectos `escritorio` (Desktop Chrome) y
  `movil` (Pixel 7). Las specs `*responsive.spec.ts` y `*movil.spec.ts` solo se ejecutan en `movil`;
  el resto solo en `escritorio`.
- **Servidor:** el propio Playwright levanta `npm run dev:local`, que apunta **siempre** a la
  instancia local (D-047). Nunca se ejecutan contra el proyecto real.
- **Requisito previo:** base local sembrada (`npm run db:reset && npm run seed:local`).
- **Sin paralelismo** (`workers: 1`): comparten una única base de datos.
- **El inicio de sesión se hace por la interfaz**, no inyectando cookies: si el login se rompe, las
  pruebas se enteran.
- **`tests/e2e/db-setup.ts` usa la service role solo para PREPARAR** el estado de partida que aún no
  se puede construir por la interfaz (por ejemplo, una boleta en `pending_approval`, que crea el
  portal del vendedor de la Fase 4). El acto que se prueba siempre pasa por la interfaz (D-043).

Trampas aprendidas escribiendo estas pruebas:

| Síntoma | Causa |
|---|---|
| `getByLabel('… fila 1')` casa también «fila 10», «fila 11» | Coincidencia por subcadena: usar `{ exact: true }` |
| Un nombre aparece dos veces en la página | El menú de usuario repite el nombre: acotar con `getByRole('table')` |
| Una spec responsive falla en escritorio | Faltaba `testIgnore` en el proyecto `escritorio` |
| Se espera 404 al pedir un recurso ajeno y llega 200 | Con `loading.tsx` en el segmento, `notFound()` llega cuando la respuesta ya iba en streaming (I-014). **Comprobar que no se filtran datos**, no el código de estado |
| `fill()` sobre un campo de dinero deja los dígitos concatenados | Un componente que reescribe su propio valor al enfocar compite con la escritura. Era un defecto real del componente, no de la prueba (I-016) |
| Un título de tarjeta no aparece como `heading` | `CardTitle` de shadcn/ui renderiza un `div`. Usar `getByText` para los títulos de tarjeta y `getByRole('heading')` solo para los `h1`/`h2` de sección |
| Un localizador que funcionaba empieza a ser ambiguo | Una fase posterior añadió un botón que repite el mismo texto. Acotar con `exact: true` o con el contenedor |

**Nunca dejar el seed alterado.** Un script de sondeo de la Fase 4 restauró un valor «al que creía
que había» y dejó la rifa demo con `allow_seller_ticket_creation = false`. Si una prueba necesita
cambiar el seed, lo restaura en un `finally` con el valor leído antes, o se rehace con
`npm run db:reset && npm run seed:local`.

---

## 3. Matriz de trazabilidad — pruebas mínimas de `CLAUDE.md` §30

Las 25 filas están **automatizadas y en verde** desde la Fase 7. La columna «Dónde» cita el archivo,
para poder ir directo a la prueba en vez de buscarla.

| # | Prueba mínima | Regla | Dónde | Fase |
|---|---------------|-------|-------|------|
| 1 | Login y redirección por rol | BR-A01, BR-A02 | `e2e/security.spec.ts` | **7** |
| 2 | Bloqueo de usuarios inactivos | BR-A04, BR-A05 | `e2e/security.spec.ts` | **7** |
| 3 | Aislamiento entre organizaciones | BR-O02, BR-O03 | `db/rls-isolation.test.ts` | 2 |
| 4 | Aislamiento entre vendedores | BR-U07 | `db/rls-isolation.test.ts`, `db/seller-isolation.test.ts`, `db/audit-phase9.test.ts` (cobranza, **ambas direcciones**) | 2 · **9** |
| 5 | Creación de rifas | BR-R04, BR-R07 | `e2e/owner-raffles.spec.ts` | 3 |
| 6 | Creación masiva de boletas | BR-N10 | `e2e/owner-bulk.spec.ts` | 3 |
| 7 | Límite de cuatro dígitos | BR-N02 | `unit/schemas.test.ts`, `db/tickets-numbering.test.ts` | 2 |
| 8 | Conservación de ceros iniciales | BR-N03 | `db/tickets-numbering.test.ts` | 2 |
| 9 | Detección de combinaciones duplicadas | BR-N04 | `db/tickets-numbering.test.ts` | 2 |
| 10 | Duplicados entre vendedores | BR-N05 | `db/tickets-numbering.test.ts` | 2 |
| 11 | Asignación de boleta | BR-I07, BR-P03 | `e2e/seller-tickets.spec.ts`, `db/rpc.test.ts` | 4 |
| 12 | Creación de cliente | BR-C02 | `e2e/seller-clients.spec.ts` | 4 |
| 13 | Registro de abono | BR-F02, BR-F06 | `e2e/payments.spec.ts`, `db/payments-phase5.test.ts` | 5 |
| 14 | Cambio a estado Abonada | BR-F07 | `db/payments.test.ts` | 5 |
| 15 | Cambio a estado Pagada | BR-F07 | `db/payments.test.ts` | 5 |
| 16 | Bloqueo de sobrepago | BR-F12 | `db/payments.test.ts` (incluye concurrencia) | 2 |
| 17 | Pago entre varias boletas | BR-F02, BR-F05 | `db/payments-phase5.test.ts` | 5 |
| 18 | Atomicidad de pagos | BR-F06 | `db/payments.test.ts` | 5 |
| 19 | Anulación de pago | BR-F09, BR-F10 | `e2e/payments.spec.ts`, `db/payments-phase5.test.ts` | 5 |
| 20 | Recálculo de saldo | BR-F11 | `db/payments-phase5.test.ts` | 5 |
| 21 | Bloqueo de cambio de cliente con pagos | BR-I12 | `db/payments-phase5.test.ts` | 5 |
| 22 | Aprobación de boletas creadas por vendedor | BR-I09 | `e2e/seller-tickets.spec.ts` | 3 |
| 23 | Restricciones de rifas cerradas | BR-R08, BR-R09 | `db/phase3-admin.test.ts` | 3 |
| 24 | RLS | SECURITY §4 | `db/catalog.test.ts`, `db/rls-isolation.test.ts`, `db/security-phase7.test.ts` | 2 |
| 25 | Protección de APIs y Server Actions | SECURITY §5 | `unit/server-actions-guard.test.ts`, `e2e/security.spec.ts` | **7** |

### 3.0 Lo que la Fase 7 encontró al auditar esta matriz

Tres filas se daban por cubiertas y **no lo estaban**:

| # | Qué decía la matriz | Qué había en realidad |
|---|---|---|
| 1 | E2E, Fase 1 | Ninguna prueba comprobaba el destino **por rol**: el helper `loginAs` acepta `/owner/dashboard` **o** `/seller/dashboard`, así que un vendedor que aterrizara en el portal administrativo habría pasado desapercibido |
| 2 | E2E + BD, Fase 1 | Verificado **a mano** en el navegador durante la Fase 1; no existía prueba automatizada. Es además el caso difícil: la sesión ya estaba abierta cuando se desactivó la cuenta |
| 25 | Diferida a la Fase 7 | Correcto: no existía |

Es la razón de ser de una fase de endurecimiento. Una matriz que se marca sola a sí misma como
cubierta no prueba nada; hay que ir fila por fila hasta el archivo.

### 3.0.b Lo que la Fase 9 encontró al reauditarla

Esta vez las 25 filas apuntan a pruebas que existen y comprueban lo que dicen. Aparecieron dos
debilidades **en las pruebas mismas**, no en el producto (`AUDIT_REPORT.md` A-01 y A-03):

| Fila | Qué fallaba | Corrección |
|---|---|---|
| 25 | `server-actions-guard.test.ts` recorría `features/<módulo>/actions.ts` a **un solo nivel**: 6 de las 28 acciones —las de `tickets/assign`, `tickets/bulk` y `tickets/seller`— nunca se analizaban. Las 6 tenían su guarda; lo que faltaba era la red | Recorrido recursivo, mínimo elevado de 15 a 28, y una prueba que compara la lista analizada contra el listado real de archivos |
| 4 | El aislamiento de **cobranza** entre vendedores solo se probaba en la dirección débil: como el seed deja a `vendedor2` sin pagos, «el total de vendedor1» y «el total de la organización» son el mismo número, y esa igualdad no distingue filtrado de no filtrado | `F9-02` monta el escenario con pagos en ambos y añade la aserción que faltaba: el total propio es **estrictamente menor** que el de la organización |

**Cómo se comprobó que la corrección de la fila 25 sirve:** inyectando temporalmente una acción sin
guarda en `tickets/assign/actions.ts`. Con la versión anterior habría pasado inadvertida; con la
corregida, falla. Una prueba que nunca se ha visto fallar no es una prueba: es una esperanza.

### 3.1 Dos trampas al escribir pruebas E2E de esta aplicación (Fase 6)

**Las lecturas que no auto-esperan corren contra el esqueleto de carga.** Las rutas con `loading.tsx`
envían primero el esqueleto y el contenido llega en *streaming*. `page.goto()` resuelve antes, así
que `count()`, `allInnerTexts()` o `innerText()` —que **no** auto-esperan, al contrario que
`expect(...)`— devuelven cero elementos. Hay que anclar primero con una aserción que sí espere:

```ts
await page.goto('/owner/reports?report=sellers')
await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()
const filas = await page.getByRole('table').locator('tbody tr').count() // ahora sí
```

**Para cambiar de usuario hay que cerrar sesión de verdad.** Ir a `/login` con una sesión abierta
redirige al panel y el formulario no llega a existir; `loginAs` falla con un error confuso. Se usa
`logout(page)` de `tests/e2e/fixtures.ts`, que pasa por el menú de usuario.

---

## 4. Casos de prueba de base de datos obligatorios (Fase 2)

| ID | Caso | Resultado esperado |
|----|------|--------------------|
| DB-01 | Insertar dos boletas con `1234/5678` en la misma rifa | Error de restricción única |
| DB-02 | Igual que DB-01 pero con vendedores distintos | Error de restricción única |
| DB-03 | Insertar `1234/5678` en una rifa distinta | Éxito |
| DB-04 | Insertar `12345` como número diario | Error de `CHECK` |
| DB-05 | Insertar `12A4` | Error de `CHECK` |
| DB-06 | Insertar `007` y leerlo | Devuelve exactamente `'007'` |
| DB-07 | Insertar `007` y `7` como números distintos en combinaciones distintas | Ambas conviven |
| DB-08 | Anular una boleta y reinsertar su combinación en la misma rifa | Error de restricción única |
| DB-09 | Seller A consulta boletas de Seller B | Cero filas |
| DB-10 | Seller A actualiza una boleta de Seller B | Cero filas afectadas |
| DB-11 | Usuario de la organización 1 consulta datos de la organización 2 | Cero filas |
| DB-12 | Pago de $100.001 sobre una boleta de $100.000 | Error |
| DB-13 | Dos pagos concurrentes de $60.000 sobre una boleta de $100.000 | El segundo falla |
| DB-14 | Asignación de pago a una boleta de otro cliente | Error de clave foránea |
| DB-15 | Asignación de pago a una boleta sin cliente | Error de clave foránea |
| DB-16 | Pago cuya suma de asignaciones no coincide con el total | Error al confirmar |
| DB-17 | Anular un pago y consultar `paid_amount` | Vuelve al valor previo |
| DB-18 | Intentar `DELETE` sobre `payments` | Denegado por RLS |
| DB-19 | Intentar `UPDATE`/`DELETE` sobre `audit_logs` | Denegado por RLS |
| DB-20 | Cambiar `client_id` de una boleta con pagos activos | Error de trigger |
| DB-21 | Cambiar `sale_price` de una boleta con pagos | Error de trigger |
| DB-22 | Cambiar `raffles.ticket_price` y revisar boletas vendidas | `sale_price` sin cambios |
| DB-23 | Crear una segunda membresía `owner` activa | Error de índice único |
| DB-24 | Admin ascendiendo a otro usuario a `owner` | Denegado por RLS |
| DB-25 | Seller creando boleta con la rifa sin permiso | Denegado por RLS |
| DB-26 | Transición de estado inválida (`cancelled → available`) | Error de trigger |
| DB-27 | Usuario desactivado consultando cualquier tabla | Cero filas |
| DB-28 | Consulta a una vista como Seller A | Solo datos propios (verifica `security_invoker`) |

Verificaciones de catálogo (automatizadas, Fases 2, 7 y 9):

```sql
-- Ninguna tabla de negocio sin RLS
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

-- Ninguna función SECURITY DEFINER sin search_path fijo
SELECT proname FROM pg_proc
WHERE prosecdef AND (proconfig IS NULL OR NOT proconfig::text LIKE '%search_path%');

-- Ninguna vista sin security_invoker
SELECT relname FROM pg_class
WHERE relkind = 'v' AND (reloptions IS NULL OR NOT reloptions::text LIKE '%security_invoker=true%');
```

Las tres consultas deben devolver cero filas.

---

## 5. Pruebas unitarias clave

| Módulo | Casos |
|--------|-------|
| `lib/money.ts` | `0 → "$0"`, `25000 → "$25.000"`, `100000 → "$100.000"`; rechazo de decimales; ida y vuelta sin pérdida |
| `features/tickets/schemas.ts` | `'1'`, `'25'`, `'007'`, `'0000'`, `'9999'` válidos; `'12345'`, `'12A4'`, `'-123'`, `'12.5'`, `''` inválidos |
| Cálculo de estado de pago | 0 → Sin pagar; 1..99.999 → Abonada; 100.000 → Pagada; 100.001 → error |
| `lib/dates.ts` | Un pago del 31 a las 23:00 en Bogotá pertenece al día 31, no al 1 |
| Detección de duplicados en el formulario masivo | Detecta repetidos entre 1.000 filas sin bloquear la interfaz |
| `lib/errors.ts` | Cada código de error de PostgreSQL se traduce a un mensaje en español sin filtrar detalles internos |
| `features/tour/tours.ts` | Ids únicos y estables; cada recorrido termina con el cierre; ningún recorrido del portal administrativo alcanza a un vendedor; los textos cumplen la guía de redacción (títulos de 2 a 7 palabras, glosario, tuteo) |
| `features/tour/use-tour.ts` + `storage.ts` | Un paso cuyo elemento falta, mide cero o está oculto se descarta sin romper el resto; el cierre sobrevive siempre; la memoria es por perfil y por recorrido, y no se repite si el navegador bloquea el almacenamiento |

### 5.1 El recorrido guiado y las demás pruebas E2E

El recorrido se abre **solo** la primera vez y su capa bloquea los clics, así que taparía cualquier
prueba que entre a un panel. `loginAs` lo da por visto escribiendo en `localStorage` las claves
reales (`rifas.tour.<perfil>.<recorrido>`), con los ids de perfil leídos de la base: **no hay ningún
interruptor de pruebas en el código de producción**. Las pruebas del recorrido piden verlo con
`loginAs(page, email, { withTour: true })`.

| Archivo | Cubre |
|---|---|
| `e2e/tour.spec.ts` (F10-01) | Aparece la primera vez, avanza y retrocede, termina con el cierre, se recuerda al omitirlo, se reinicia desde el menú, cada pantalla trae el suyo, el vendedor no ve pasos del portal administrativo, el globo cabe en la pantalla |
| `e2e/tour-responsive.spec.ts` (F10-02) | En teléfono se descarta el paso de la barra lateral y toma su lugar el del botón de menú; el globo cabe en pantalla en todos los pasos |

### 5.2 Pruebas de comportamiento visual

| Archivo | Cubre |
|---|---|
| `unit/row-activation.test.ts` | Qué clic abre una fila y cuál lo atiende otro elemento: zona libre, enlace, casilla, botón, contenido de un botón, **menú en portal**, selección de texto, teclas de activación |
| `e2e/filas-seleccionables.spec.ts` | La fila abre el detalle desde cualquier celda y con `Enter`; la casilla y el menú de acciones **no** lo abren; y los estados de la lista de clientes (hover, elegido, elegido+hover) conservan contraste, marcan la elección con algo más que color y no desplazan el contenido |

**Cómo se mide el color, y por qué así** (I-034): pintando el color en un `canvas` y leyendo los
píxeles, no leyendo `getComputedStyle`. Con Tailwind 4 el navegador devuelve los colores en
`lab()`/`oklab()`, y leer sus números como canales RGB da contrastes falsos de 1,00 en textos
perfectamente legibles. Hay que esperar además a que termine `transition-colors`: medir justo después
de un `hover()` captura un fotograma intermedio.

**Estas pruebas se comprobaron al revés.** Con el CSS defectuoso restaurado a propósito, las dos de
contraste fallan (1,01 y 1,04). Una prueba visual que no se ha visto fallar no demuestra nada.

---

## 6. Datos de prueba (seed)

Definido en la Fase 2, ejecutable con `supabase db reset && npm run seed:users`.

**Organización 1 — «Rifas Demo»**
- Owner: `owner@demo.test`
- Admin: `admin@demo.test`
- Seller A: `vendedor1@demo.test`
- Seller B: `vendedor2@demo.test`
- Rifa `active` de `$100.000` con `allow_seller_ticket_creation = true`
- 3 clientes de Seller A y 2 de Seller B
- Boletas: 10 `available`, 6 `assigned`, 2 `pending_approval`, 1 `cancelled`, 3 `draft`
- Pagos: uno parcial (`$40.000`), uno completo (`$100.000`), uno repartido entre 2 boletas y uno
  anulado

**Organización 2 — «Rifas Control»** (solo para pruebas de aislamiento)
- Owner: `owner@control.test`, Seller: `vendedor@control.test`
- Una rifa con boletas que **reutilizan** las mismas combinaciones de la organización 1, para
  demostrar que la unicidad es por rifa y no global

Las contraseñas provienen de variables de entorno (`SEED_DEFAULT_PASSWORD`) y nunca se versionan.
El seed es idempotente.

**Lo que añade `npm run test:db`** (Fase 6): una tercera rifa, «Rifa Volumen Fase 6», en estado
**borrador** y con 5.000 boletas, para la prueba de volumen. Es idempotente —las reutiliza en
ejecuciones posteriores en vez de acumularlas— y está en borrador para que ninguna pantalla ni
ninguna prueba la confunda con la rifa activa. Aun así, deja la base distinta de como la dejó el
seed: **`db:reset` + `seed:local` antes de `test:e2e`**.

### 6.1 Una asimetría del seed de la que dependen dos pruebas (Fase 9)

**`vendedor2` no tiene ningún pago.** Los 36 pagos de «Rifas Demo» son de `vendedor1`. Dos pruebas
dependen de ese equilibrio en direcciones opuestas:

| Prueba | Qué asume |
|---|---|
| `F6-04` | Que `vendedor2` ve **cero** pagos y un desglose diario **vacío** |
| `F9-02` | Que puede darle un pago a `vendedor2` y **devolver el seed exactamente a su estado** |

Por eso `F9-02` no anula su pago de prueba, lo **borra**: un pago anulado sigue apareciendo en
`report_payments_by_day` con su `voided_amount`, y `F6-04` fallaría. El borrado va en una sola
transacción (asignaciones y pago) con la conexión de superusuario que las pruebas ya usan para leer
la verdad de referencia — `DELETE` está revocado para la aplicación (`0010`) precisamente para que
esto solo sea posible ahí.

Quien toque el seed o el orden de los archivos debe tener esto presente. Se comprueba solo: ejecutar
`npm run test:db` **dos veces seguidas sin resembrar** debe dar 266 ✅ las dos veces.

---

## 7. Comandos

Se definen en la Fase 1 dentro de `package.json`:

```bash
npm run dev           # desarrollo
npm run build         # build de producción
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run test          # vitest run (unitarias)
npm run test:db       # vitest run tests/db (requiere Supabase local)
npm run test:e2e      # playwright test
npm run verify        # typecheck + lint + test + build
```

`npm run verify` es la puerta de calidad que debe pasar al cierre de cada fase.

---

## 8. Criterios de aceptación por fase

| Fase | Verde significa |
|------|-----------------|
| 1 | 13 pruebas de autenticación + build/typecheck/lint |
| 2 | 28 pruebas DB-01…DB-28 + 3 consultas de catálogo en cero + `db reset` limpio |
| 3 | 18 pruebas del portal administrativo, incluida la carga de 1.000 filas |
| 4 | 17 pruebas del portal del vendedor, incluido el aislamiento |
| 5 | 13 pruebas financieras, incluidas atomicidad y concurrencia |
| 6 | Métricas verificadas contra consultas SQL de control + reportes sin fuga entre vendedores + CSV + responsive y accesibilidad |
| 7 | Las 25 pruebas mínimas de `CLAUDE.md` §30, automatizadas |
| 8 | Prueba de humo en producción + restauración de copia de seguridad |
| 9 | Reejecución completa + informe de auditoría |

---

## 9. Resultados

Los resultados de cada fase (con los errores encontrados y como se corrigieron) viven en
[`TEST_RESULTS.md`](TEST_RESULTS.md), para que este documento describa solo la ESTRATEGIA y no
crezca en cada fase.

Estado al cierre de la Fase 5: **101 pruebas unitarias + 199 de base de datos + 89 end-to-end, todas
en verde**.
