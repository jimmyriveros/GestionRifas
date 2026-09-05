# ESTRATEGIA DE PRUEBAS

- **Versión:** 2.16 · **Actualizado:** 2026-08-30
- Este documento define la ESTRATEGIA. Los resultados por fase están en [`TEST_RESULTS.md`](TEST_RESULTS.md).
- **Implementado:** unitarias (Vitest), base de datos (Vitest + Supabase local) y **end-to-end
  (Playwright, escritorio y móvil)** desde la Fase 3.

---

## 1. Pirámide de pruebas

| Nivel | Herramienta | Qué cubre | Dónde vive | Velocidad |
|-------|-------------|-----------|------------|-----------|
| Unitarias | Vitest | Formato de dinero, validadores Zod, cálculo de estados, transformaciones de fecha, utilidades | `tests/unit/` | ms |
| Base de datos | Vitest + `@supabase/supabase-js` contra Supabase local | Restricciones, triggers, RPC, **RLS con sesiones reales** | `tests/db/` | segundos |
| E2E | Playwright | Flujos completos por rol, responsive, protección de rutas | `tests/e2e/` | minutos |
| Volumen | Vitest + Supabase local | Agregados, reportes y CSV sin truncamiento silencioso con 5.000 boletas | `tests/db/volume-phase6.test.ts` | ~10 s |

**Principio rector:** las reglas críticas de integridad, dinero y autorización tienen prueba de base
de datos, no solo de interfaz. Navegación, selección, responsive y UX se cubren en la capa
unitaria/E2E que corresponde; el detalle trazable está en `TEST_RESULTS.md`.

---

## 2. Entorno de pruebas

- **Base de datos:** instancia local de Supabase (`supabase start`), reconstruida con
  `supabase db reset` antes de la suite de base de datos. Nunca se ejecutan pruebas contra
  producción.
- **Sesiones reales por rol:** el acto cuya RLS se comprueba inicia sesión como Owner, Admin, Seller
  A o Seller B y opera con la clave pública. `service_role`/PostgreSQL directo se reservan para
  preparar, comprobar o limpiar el escenario, nunca para la operación autorizada que se afirma
  probar (D-043).
- **Aislamiento:** cada archivo de prueba parte de un estado conocido (seed) y limpia lo que crea.
- **Datos de otra organización:** el seed incluye una segunda organización con su propio Owner y
  vendedor, exclusivamente para probar el aislamiento.

### 2.0 `format:check` no está en `verify` ni en el CI, y la mayoría de lo que reporta es ruido

`npm run verify` corre `typecheck`, `lint`, `test` y `build`; el CI corre eso mismo más
`test:db` (`.github/workflows/ci.yml`). **`npm run format:check` no está en ninguno de los dos**, así
que un archivo mal formateado nunca ha roto una construcción y no la romperá.

Si lo ejecutas, léelo con cuidado: el 2026-08-28 reportaba **53 archivos**, y **37 de ellos diferían
solo en el fin de línea**. Con `core.autocrlf=true` —lo normal en Windows— git deja CRLF en el disco,
Prettier espera LF, y los marca sin que haya nada malo en lo guardado. Se distingue así:

```bash
git show HEAD:<archivo> > src/__tmp.tsx && npx prettier --check src/__tmp.tsx; rm src/__tmp.tsx
```

El archivo temporal tiene que estar **dentro del proyecto**: fuera, Prettier no encuentra
`.prettierrc` y comprueba contra sus valores por defecto, que no son los de aquí.

Los **16 con deuda real** se corrigieron ese día. Los finales de línea **no se tocaron a propósito**:
normalizarlos exige un `.gitattributes` con `* text=auto eol=lf` y una reescritura del repositorio
entero, que es mucho ruido en el historial para un problema que solo existe en el disco de quien
programa. **No lo arregles «de paso» dentro de otro cambio.**

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
  el resto solo en `escritorio`. El retorno al origen tras un abono (D-133, D-135) vive en
  `payments.spec.ts` (escritorio) y `abono-desde-boleta-movil.spec.ts` (teléfono). Las tarjetas de
  «Mis clientes» (D-136) viven en `clientes-movil.spec.ts`. Editar el precio de una boleta
  asignada (D-137) vive en `precio-venta-editar.spec.ts` (escritorio) y
  `precio-venta-editar-movil.spec.ts` (teléfono). Cambiar el cliente de una
  boleta vendida (D-168) vive en `cambiar-cliente.spec.ts` (escritorio: los dos
  portales, crear el cliente desde el diálogo, la boleta que se mueve de ficha,
  la cartera acotada y los dos casos bloqueados) y `cambiar-cliente-movil.spec.ts`
  (teléfono: diana de 44 px, el botón de confirmar dentro de la ventana y el
  aviso que no desborda). Las dos **borran lo que crean** con `purgeTestData`
  (`db-setup.ts`): sin eso, sus catorce clientes empujaban fuera de la primera
  página al cliente que buscaba `seller-clients`, y sus catorce ventas de hoy
  rompían la cota de `ventas-por-fecha` — dos pruebas ajenas fallando por datos,
  no por producto (I-035). Esa limpieza es también el único sitio que **borra
  una fotografía de coincidencia**, apagando su disparador de inmutabilidad
  dentro de la misma transacción. Liberar una boleta (D-169) vive en
  `liberar-boleta.spec.ts` (escritorio: los dos portales, el diálogo con los dos
  números y el cliente, la boleta que sale de la ficha y **se vuelve a vender**,
  el motivo obligatorio, el aislamiento entre vendedores y los dos casos
  bloqueados) y `liberar-boleta-movil.spec.ts` (teléfono: los **dos** botones a
  44 px uno debajo de otro, el confirmar dentro de la ventana y el aviso que no
  desborda). Se limpian igual, y además apuntan sus **boletas** aparte: tras
  liberarlas ya no cuelgan de ningún cliente, así que `purgeTestData` no las
  encontraría por ahí. El rediseño de «Registrar abono»
  (D-138) vive en `abono-registrar-movil.spec.ts`; la lógica de dinero sigue en
  `payments.spec.ts`. Esa misma spec clava **D-139** (`appearance: none` del date y
  que a 360 px Fecha no se monta encima de Método). Playwright en Chromium **no
  reproduce** el desborde de tinta de iOS/Android; una pasada verde no sustituye
  mirarlo en un teléfono (I-079, I-066). El recuadro de resultados oficiales
  (D-147, D-167) vive en `loterias-panel.spec.ts` (escritorio: presencia, número
  mayor `0046`, pendiente vs último, y qué tarjeta recibe cada sorteo) y
  `loterias-panel-movil.spec.ts` (320 px: que quepa vacío, y **con datos**, que
  las dos tarjetas se apilen en una columna sin desbordar). Las filas de prueba
  y los localizadores de las dos tarjetas son **compartidos**, en
  `lottery-fixtures.ts`. Esas pruebas interceptan las peticiones y fallan si el
  Panel consulta un host de la allowlist. No crean fotografías de coincidencia:
  no se pueden borrar.
  En la prueba móvil el sorteo que viene es el de **mañana**, no el de hoy:
  una programación de hoy deja de tener hora futura al pasar su instante
  oficial —y entonces la tarjeta dice «Resultado pendiente», que es lo
  correcto—, así que es la única forma de comprobar la hora sin depender del
  reloj. El caso «Hoy» lo cubre la suite de escritorio.
  La cabecera contextual (D-150) vive en `cabecera-contextual.spec.ts`
  (escritorio: cruce, CTA, flecha, limpieza al navegar, anchos 768–1600) y
  `cabecera-contextual-movil.spec.ts` (reemplazo del nombre de la organización,
  320 y 390 px, dianas de 44 px). El umbral geométrico es unitario
  (`compact-header.test.ts`).
- **Servidor:** el propio Playwright levanta `npm run dev:local`, que apunta **siempre** a la
  instancia local (D-047). Nunca se ejecutan contra el proyecto real.
- **Requisito previo:** base local sembrada (`npm run db:reset && npm run seed:local`).
- **Sin paralelismo** (`workers: 1`): comparten una única base de datos.
- **El inicio de sesión se hace por la interfaz**, no inyectando cookies: si el login se rompe, las
  pruebas se enteran.
- **`tests/e2e/db-setup.ts` usa la service role solo para PREPARAR** el estado de partida que aún no
  se puede construir por la interfaz (por ejemplo, una boleta en `pending_approval`, que crea el
  portal del vendedor de la Fase 4). Los flujos ordinarios pasan por la interfaz; algunas pruebas
  adversarias llaman RPC directamente con el token real del navegador para demostrar que saltarse
  la pantalla tampoco evita autorización (D-043).

Trampas aprendidas escribiendo estas pruebas:

| Síntoma | Causa |
|---|---|
| `getByLabel('… fila 1')` casa también «fila 10», «fila 11» | Coincidencia por subcadena: usar `{ exact: true }` |
| Un nombre aparece dos veces en la página | El menú de usuario repite el nombre: acotar con `getByRole('table')` |
| Una spec responsive falla en escritorio | Faltaba `testIgnore` en el proyecto `escritorio` |
| Se espera 404 al pedir un recurso ajeno y llegaba 200 | **Ya no pasa** desde D-104: al retirar los `loading.tsx`, `notFound()` vuelve a resolverse antes de emitir nada y una boleta inexistente responde **404** (I-014, resuelto). Lo que sí cambió es la forma: esa pantalla se pinta con el layout raíz, **sin `<main>`**, así que una prueba que lea `main` no encuentra nada — hay que leer el `body` |
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
| 21.b | Corrección del cliente de una boleta vendida, y sus siete puertas cerradas | BR-I13 | `db/reassign-client.test.ts`, `unit/reassign-client.test.ts`, `e2e/cambiar-cliente*.spec.ts` | post-9 |
| 21.c | Liberación de una boleta vendida sin abonos, y sus siete puertas cerradas | BR-I14 | `db/release-ticket.test.ts`, `unit/release-ticket.test.ts`, `e2e/liberar-boleta*.spec.ts` | post-9 |
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

**Las lecturas que no auto-esperan corren contra una pantalla que aún no está.** `page.goto()`
resuelve antes de que el contenido esté puesto, así que `count()`, `allInnerTexts()` o `innerText()`
—que **no** auto-esperan, al contrario que `expect(...)`— devuelven cero elementos. Hay que anclar
primero con una aserción que sí espere:

> Desde D-104 ya **no hay `loading.tsx`** en el proyecto (costaban ~300 ms de espera por el fallback
> de Suspense), así que lo que se veía antes era un esqueleto y ahora es la pantalla anterior. La
> trampa es la misma y la solución también.

```ts
await page.goto('/owner/reports?report=sellers')
await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()
const filas = await page.getByRole('table').locator('tbody tr').count() // ahora sí
```

**Para cambiar de usuario hay que cerrar sesión de verdad.** Ir a `/login` con una sesión abierta
redirige al panel y el formulario no llega a existir; `loginAs` falla con un error confuso. Se usa
`logout(page)` de `tests/e2e/fixtures.ts`, que pasa por el menú de usuario.

### 3.2 Lo que esta suite NO puede ver, por construcción (2026-08-26, I-074)

`playwright.config.ts` arranca **`npm run dev:local`**. En `next dev`, Next renderiza **todo** por
petición y **no prerenderiza nada**, así que cualquier fallo que solo exista en un build de
producción es invisible para las 294 pruebas.

No es teórico. Es exactamente por lo que **I-070** —la pantalla de recuperación de contraseña, sin
JavaScript en producción porque estaba prerenderizada y la CSP por nonce le bloqueaba los scripts—
vivió desde la **Fase 7**, pasó la auditoría de endurecimiento de esa misma fase y la auditoría
independiente de la **Fase 9**, con las E2E en verde todo el tiempo.

**Qué hacer mientras el hueco siga abierto:**

1. **Todo cambio que dependa del modo de renderizado se comprueba a mano sobre `npm run build && npm
   start`.** No sobre `next dev`, donde nunca falla.
2. La regla concreta —una pantalla pública que necesite React va con `force-dynamic`— está en
   `SECURITY.md` §10.1.b.2, y `tests/unit/csp-dynamic-pages.test.ts` protege la lista.
3. Si se añade una pantalla pública con formulario, **añádela a esa lista** en la misma tanda.

La salida real, no aplicada por su coste en CI, es un segundo proyecto de Playwright que arranque
`npm run build && npm start` y ejecute un puñado de comprobaciones de humo sobre las pantallas
públicas. Ver I-074.

### 3.3 La primera prueba paga la compilación de todos los demás (2026-08-26, I-075)

**Si `.next/dev` está frío, `back-navigation.spec.ts:25` falla siempre.** No es intermitencia: es
determinista, y se reprodujo tres veces. Un solo presupuesto de 60 s tiene que pagar la compilación
bajo demanda de **cuatro** rutas encadenadas —`/login` y `/owner/dashboard` en el `beforeEach`,
`/owner/tickets` en el `goto`, y `/owner/tickets/[ticketId]` en el clic—, sobre un disco que el
propio Next marca en el registro del arnés como lento.

| Estado de `.next/dev` | Resultado de esa prueba |
|---|---|
| Frío (recién borrado) | ❌ agota los 60 s |
| Caliente | ✅ **3,3 s** |

**Antes de culpar a tu cambio, repite con la caché caliente.** Se comprobó que es ajeno al código
haciendo el mismo experimento en frío sobre un commit anterior: falló exactamente igual. Una pasada
completa en frío da `293 passed, 1 failed`; en caliente, `294 passed`.

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
| DB-12 | Pago de un peso por encima del precio de la boleta | Error |
| DB-13 | Dos pagos concurrentes que caben por separado pero no juntos | El segundo falla |
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

Casos de loterías (Etapa 1, `tests/db/lottery-results.test.ts` y `tests/unit/lottery-constants.test.ts`;
Etapa 2, `tests/unit/lottery-adapters.test.ts` y `tests/unit/lottery-fetch.test.ts`;
Etapa 3, `tests/db/lottery-sync.test.ts`, `tests/unit/lottery-sync.test.ts` y
`tests/unit/lottery-notifications.test.ts`;
Etapa 5–6, `tests/unit/lottery-cron.test.ts`, `tests/db/lottery-cron.test.ts` y
`tests/e2e/loterias-cron.spec.ts`; Etapa 6 clava que `vercel.json` declara los jobs Hobby;
horizonte y presupuesto, `tests/db/lottery-horizon.test.ts`, que monta un cronograma **anual** de
318 sorteos en la base local y ejerce el orquestador real sustituyendo solo la descarga externa;
acta oficial de Cundinamarca, `tests/unit/lottery-acta.test.ts` con los PDF fabricados por
`tests/fixtures/lottery/build-pdf.ts` —no se commitea el documento de un tercero— y la parte de
red en `tests/unit/lottery-fetch.test.ts`):

| ID | Caso | Resultado esperado |
|----|------|--------------------|
| L-01 | `0046` vs `46` | Solo coincide `0046` |
| L-02 | Asignada antes / después / creada después | `sold` / `late_assignment` / no coincide |
| L-03 | Varias rifas en la ventana | Coinciden todas; no se elige una |
| L-04 | Rifa anulada o borrador | No coincide |
| L-05 | Boyacá | Compara `weekly_number`, no el diario |
| L-06 | Matching repetido | `inserted = 0`; sin filas nuevas |
| L-07 | Segundo número mayor distinto | `conflict`; matching rechazado |
| L-08 | Vendedor lee coincidencias | Solo las suyas; la boleta ajena sigue oculta |
| L-09 | Owner lee coincidencias | Solo su organización |
| L-10 | `match_lottery_result` desde una sesión | Denegado |
| L-11 | Bogotá 2840 adelantado al 31 de marzo | `reference_date` = 2026-04-02; `rescheduled_earlier` |
| L-12 | Cruz Roja 3183 aplazada al 10 de diciembre | `reference_date` = 2026-12-08; no «siguiente hábil» |
| L-13 | `0046` extraído de HTML | Se conserva como texto; no se convierte en `46` |
| L-14 | Medellín extra 0018 en la misma página que 4850 | Premio mayor `2608`, no el número de sorteo ni el extra |
| L-15 | Host fuera de allowlist, HTTP o redirección ajena | `blocked_host` / `blocked_redirect` |
| L-16 | Cloudflare, Imunify o SPA vacía | `source_blocked` / `ambiguous`; no se inventa un número |
| L-17 | Acuerdo PDF o xlsx sin hoja de ordinarios | `unsupported_type` / `parse_error` |
| L-18 | Sincronizar el mismo sorteo dos veces | `inserted = 0`; `schedule_version` intacta si no cambió nada real |
| L-19 | Aplazar conservando `reference_date` y `original_scheduled_at` | Versión 2; la fecha de referencia no se mueve |
| L-20 | Confirmar + coincidir + avisar, y reintentar | Un resultado, una fotografía, un aviso por destinatario |
| L-21 | Vendedor sin coincidencias | Cero avisos `lottery.result` |
| L-22 | Pago previo al sorteo | La fotografía sigue `sold`; el pago no cuenta |
| L-23 | Resultado al día siguiente del instante oficial | Se confirma; pertenece a ese sorteo |
| L-24 | Dos confirmaciones concurrentes del mismo número | Un solo `lottery_results` |
| L-25 | Cambio de programación a meses vista | Cero avisos; dentro de 48 h sí avisa, y el reintento no duplica |
| L-26 | Tick sin secreto o con Bearer incorrecto | 401, no 307 a `/login`; el cuerpo no filtra esquema |
| L-27 | Sesión de dueño sin secreto | 401; la sesión no sustituye el proceso interno |
| L-28 | Segundo tick concurrente | `skipped: locked`; no descarga |
| L-29 | Programación ya sincronizada hoy | El tick omite CNJSA y sigue con resultados |
| L-30 | Cerrojo: segundo acquire, holder ajeno, caducado | Falso / no suelta / se puede tomar; la sesión no ejecuta las RPC |
| L-31 | Cronograma anual de 318 sorteos, ninguno con resultado | La selección de antes devuelve 318; la de ahora, **9** |
| L-32 | Primer tick sobre ese cronograma | **6** descargas exactas; `candidates = fetched + skipped + deferred` |
| L-33 | Horizonte | Todo candidato está entre «hace 10 días» y «ahora»; el de hace medio año no entra |
| L-34 | Orden | Dos consultas seguidas devuelven la misma lista, de la más reciente a la más antigua |
| L-35 | Cundinamarca del día anterior | Es el primer candidato y el tick lo consulta |
| L-36 | Sorteo de la semana que viene | No es candidato; `decideResultFetch` responde `wait` |
| L-37 | Tope bajado a 2 | Exactamente 2 descargas; el resto queda `deferred` |
| L-38 | Seis sorteos recién intentados | Ninguno se vuelve a descargar; el presupuesto lo heredan los atrasados |
| L-39 | Un sorteo con sus seis intentos agotados | Se salta él; el otro sorteo **de la misma lotería** sí se consulta |
| L-40 | Bitácora de un tick | Una fila `results` por sorteo, con `schedule_id` distinto |
| L-41 | Sorteo con resultado `confirmed` | Sigue siendo candidato y **no** gasta una descarga |
| L-42 | La etapa de resultados se cae entera | El tick informa `results.errorCode` y conserva `schedule.outcome = success` |
| L-43 | Acta válida con premio mayor | Sorteo, fecha, número mayor y serie; `sourceKind = official_act` |
| L-44 | Número ganador con cero inicial | `0046` se conserva como texto; nunca se vuelve entero |
| L-45 | Serie ausente | El acta sigue siendo válida con `series = null` |
| L-46 | Acta de otro sorteo, o sin fecha | `ambiguous`; no se publica |
| L-47 | Dos filas de PREMIO MAYOR con números distintos | `ambiguous`. Con el **mismo** número, sí se publica |
| L-48 | Premio mayor de tres cifras | `ambiguous`; no se publica |
| L-49 | PDF escaneado, sin capa de texto | `scanned_document`, distinto de «no aparece el premio mayor». Sin OCR |
| L-50 | PDF cifrado | `unsupported_type`; no se intenta abrir |
| L-51 | HTML servido como `application/pdf` | `unsupported_type` por la **firma** del archivo |
| L-52 | Documento demasiado grande | `too_large` antes de cargarlo entero |
| L-53 | Timeout pidiendo el acta | `timeout` |
| L-54 | 404 del acta | `not_published`, **no** `source_blocked`: se reintenta |
| L-55 | Host o ruta no permitidos | `blocked_host` / `blocked_path`; una redirección que sale de la ruta, `blocked_redirect` |
| L-56 | Qué se conserva del acta | URL final, hash y campos; **ni el PDF ni su texto** en la salida ni en la evidencia |
| L-57 | El verificador de billetes | No queda su URL, ni su host en la allowlist, ni la función que la armaba |
| L-58 | El tick de Cundinamarca | Pide la URL del acta y **solo** esa; ni SPA ni `result/public` |
| L-59 | Texto partido por el generador | Se lee igual con varios `Tj`, con `TJ` y con cadena hexadecimal |

Validación real de las seis fuentes (etapa 3/6, D-154). Los HTML de estas pruebas **reproducen
la estructura que servían las páginas el 2026-09-01**, trampas incluidas; no son inventados.

| Id | Escenario | Resultado esperado |
|---|---|---|
| L-60 | Un resultado que aún no se publica | Se reintenta esa misma noche, a diferencia de `source_blocked` |
| L-61 | Meta: encabezado, número mayor y serie | 3313 · 2026-08-26 · **8134** · 096 |
| L-62 | Meta con la hoja de estilos de tagDiv delante | **No** devuelve `6262` ni `391`: no se lee de un `<style>` |
| L-63 | Meta con la tabla de secos detrás | El primer número de la tabla no desplaza al mayor |
| L-64 | Cero inicial del premio **diario** | `0046` se conserva; la serie, `007` |
| L-65 | Cruz Roja: premio mayor, no el seco | 3168 · 2026-08-25 · **4939** |
| L-66 | Cruz Roja: la serie | **112**, no los «200 MILLONES» del seco |
| L-67 | Cruz Roja con el señuelo `imunify-bot-check` | La página **se lee**: un señuelo oculto no es un muro |
| L-68 | Interstitial real de Imunify | `source_blocked`. No se elude |
| L-69 | Medellín con el extra en la misma página | Toma el ordinario: 4850 · 2026-08-28 · 2608 · 301 |
| L-70 | Medellín con el comentario de Elementor | No fecha el sorteo con `08-05-2024` |
| L-71 | Medellín con solo el extra | `not_ordinary` |
| L-72 | Boyacá: número ganador y serie partidos en dígitos | 4639 · **7660** · 393 |
| L-73 | Boyacá con el desplegable de fechas anteriores | Fecha del encabezado, no la primera de la página |
| L-74 | Cero inicial del premio **semanal** | `0007` se conserva; la serie, `001` |
| L-75 | Tirada de dígitos de largo distinto al esperado | Tres cifras y cinco cifras: **no se publica** |
| L-76 | Desafío de Cloudflare por cabecera | `cf-mitigated: challenge` basta, sea cual sea el estado |
| L-77 | Portada sin bloque de resultado | `structure_changed`, distinto de un dato mal leído |
| L-78 | `confirmAdapterResult` con un sorteo anterior | Propaga `not_published` y **no llama a ninguna RPC** |

El Panel no espera por las loterías (etapa 4/6, D-155, BR-L25). Las tres primeras miden **tiempos**
sobre un flujo real (`renderToPipeableStream`), no HTML final: sin eso, un límite de Suspense
retirado no daría ningún síntoma.

| Id | Escenario | Resultado esperado |
|---|---|---|
| L-79 | Consulta de loterías lenta (300 ms), Panel completo | El contenido principal va en el **primer** trozo; el recuadro llega en uno posterior |
| L-80 | Consulta instantánea | Mismo HTML final que antes del cambio |
| L-81 | El hueco de espera | `aria-busy`, texto para lector de pantalla y el **título real** en el armazón |
| L-82 | Las dos páginas del Panel | Ninguna importa ni espera `getLotteryDashboard`; las dos ponen `<LotteryResultsSection>` |
| L-83 | El plazo de la lectura local | Un solo `AbortSignal.timeout`, la **misma** señal en las dos consultas |
| L-84 | El plazo vence en la primera consulta | `{ kind: 'error' }`; no lanza |
| L-85 | El plazo vence en la de coincidencias | `{ kind: 'error' }`; no lanza |
| L-86 | Ventana del Panel y coincidencias, con la RLS puesta | Dentro del presupuesto para personal y vendedor (`tests/db`) |
| L-87 | Índice que sirve `result_id in (…)` | `(result_id, ticket_id, match_field)` conserva su definición |
| L-88 | Coincidencias de otra organización, con la proyección del Panel | Cero filas; la programación y el resultado sí se leen (D-141) |
| L-89 | Forma de la respuesta HTTP real (E2E, los dos portales) | El hueco aparece **antes** que el recuadro, y el contenido principal antes que los dos |
| L-90 | Ventana sin programaciones (E2E) | «Todavía no hay resultados oficiales» y el resto del Panel entero |
| L-91 | Resultado en conflicto (E2E) | Muestra el número y el aviso de verificación |
| L-92 | Fuente que aún no publica (E2E) | Hay fila de resultado, pero **ningún** número mayor |
| L-93 | Resultado que llega tarde (E2E) | El de ayer va bajo «Último resultado»; el de hoy sigue pendiente |

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

### 4.1 Precio de venta rebajado (`tests/db/sale-discount.test.ts`, 19 pruebas)

Añadidas con D-099. Cubren los casos A a G que pedía el encargo, y una cosa más importante que
cualquiera de ellos: **la identidad que garantiza que la empresa no pierde**.

| ID | Caso | Resultado esperado |
|----|------|--------------------|
| E8-01 | Vender sin precio explícito | `sale_price = base_price = precio de la rifa` |
| E8-02 | Vender rebajado | `sale_price` rebajado, `base_price` con el precio oficial congelado |
| E8-03 | Vender por encima del precio oficial | Rechazado |
| E8-04 | **Caso G** — rebajar por debajo del límite | Rechazado, y el límite es la mitad del precio para quien no tiene equipo |
| E8-05 | Límite de un integrante de equipo | Es su tramo **más bajo**, no la tarifa vigente (BR-G18) |
| E8-06 | **Caso A** — sin rebaja | Mitad y mitad |
| E8-07 | **Caso B** — rebaja de $20.000 | El vendedor gana `tarifa − 20.000`; la empresa, lo mismo que sin rebaja |
| E8-08 | **Caso C** — rebaja máxima | El vendedor gana $0; la empresa, lo mismo |
| E8-09 | **Caso D** — otra tarifa (por tramos) | La misma regla con una tarifa que no es un porcentaje |
| E8-10 | **La identidad**, para los dos vendedores | `cobrado − comisión = n × (precio oficial − tarifa)` |
| E8-11 | `sum(commission_ledger) = earned` con rebajas | Se mantiene (BR-G10) |
| E8-12 | La rebaja deja su propio movimiento | Fila `discount` con importe negativo |
| E8-13 | Ninguna comisión negativa | Cero filas con `earned < 0` |
| E8-14 | **Caso E** — abono parcial | Saldo contra el precio **rebajado** |
| E8-15 | **Caso E** — abono completo | **Pagada** con menos dinero que el precio oficial |
| E8-16 | Sobrepago | Bloqueado contra el precio rebajado |
| E8-17 | Cambiar el precio con abonos | Rechazado (BR-P05 sigue vigente) |
| E8-18 | **Caso F** — boleta sin `base_price` | Rebaja cero; comisión idéntica a antes de `0028` |
| E8-19 | Importación masiva sin precio | Vende al precio oficial (el contrato del CSV no cambia) |

⚠️ **Esta suite no puede borrar sus cuentas de Auth al terminar, y es correcto.** Sus vendedores
venden con su propia sesión, así que quedan como **actores** en `audit_logs`, que es de solo anexado
y tiene FK contra el perfil (BR-D02). Borrarlos exigiría reescribir la auditoría, que es justo lo que
ese diseño impide. Lo que sí borra es la **membresía**: sin ella la persona desaparece de la
organización y de todas las pantallas. Por eso el alta es **idempotente** — reutiliza la cuenta si ya
existe—, y por eso la suite aguanta ejecutarse muchas veces seguidas.

### 4.2 Índices y vistas de lectura (`tests/db/read-performance.test.ts`, 6 pruebas)

Añadidas con D-102. **No miden tiempos**: un banco de rendimiento sobre las treinta boletas del seed
no diría nada, y las medidas reales —con 300.000 boletas— están en `TEST_RESULTS.md`. Lo que cubren
es lo que puede romperse sin que nadie se entere.

| ID | Caso | Resultado esperado |
|----|------|--------------------|
| E9-01 | Los seis índices de `0030` existen **con su definición exacta** | Media migración es una condición parcial; si alguien la quita «limpiando», el índice sigue ahí y la pantalla vuelve a tardar un segundo **sin ningún síntoma visible** |
| E9-02 | `v_client_balances` coincide fila a fila con la formulación anterior (`group by`) | 0 diferencias en `tickets_count`, `total_purchased`, `total_paid` y `pending_amount` |
| E9-03 | `v_client_balances` sigue devolviendo también los clientes sin boletas | Tantas filas como clientes: el `left join lateral` no puede perder ninguno |
| E9-04 | `v_payment_history` no pierde ningún pago al cruzar con el cliente | Tantas filas como pagos |
| E9-05 | Las dos vistas conservan `security_invoker` | `create or replace view` **no** hereda las opciones: perderlo las dejaría leyendo sin RLS |
| E9-06 | Un vendedor sigue viendo solo su cartera y sus pagos en las dos vistas | Sesión real de vendedor, no service role |

**Por qué E9-01 compara el texto del índice y no solo su nombre.** Los tres índices parciales de esta
migración dependen por completo de su cláusula `where`: es lo único que permite al planificador
usarlos para ordenar. Un índice con el nombre correcto y la condición quitada pasa cualquier
comprobación de existencia y no sirve para nada.

### 4.2.b Ventas por fecha (`tests/db/reports-sales-by-date.test.ts`, 17 pruebas)

Añadidas con D-151. Comprueban `report_sales_totals` con el criterio de la Fase 6: **cada cifra se
reproduce con una consulta SQL de control** escrita a mano contra las tablas base, y lo que se prueba
se pide siempre con una sesión real y la clave pública.

**Sus ventas viven en marzo de 2020.** La función no acepta rifa ni vendedor: agrega todo lo que la
RLS deja ver dentro de un rango. Con fechas de hoy, las boletas del seed y las que crean otras suites
entrarían en la cuenta y los números dependerían del orden de ejecución (la trampa de I-035). Una
ventana que nadie más toca aísla el conjunto sin aislar la base. De paso demuestra sola la regla
principal: las boletas se crean y se asignan **hoy** y aun así cuentan en 2020, porque lo único que
las fecha es `sale_date`.

| ID | Caso | Resultado esperado |
|----|------|--------------------|
| D151-01 | Conteo, `total_sold`, `paid_amount` y la identidad `vendido − abonado = saldo` | Coinciden con la consulta de control. `paid_amount` se compara contra la **suma de asignaciones no anuladas**, no contra `tickets.paid_amount`: así detecta también un disparador roto |
| D151-01e | Totales exactos con **más filas que una página** | La página trae 25; los totales cuentan 27. Si alguien moviera la suma a la página visible, esto lo delata |
| D151-02 | Fuera del rango, `sale_date` manda, boleta anulada, rango de un solo día | Una venta de febrero no entra; anular una boleta la saca de la cuenta y del dinero |
| D151-03 | Aislamiento con sesiones reales | Vendedor1 no cuenta las ventas de vendedor2 **del mismo día**; pasar el id ajeno devuelve cero filas; la otra organización queda aislada en los dos sentidos; `anon` no puede ejecutar la función |
| D151-04 | Un abono posterior y su anulación | Sube y baja «Abonado» sin mover la venta de fecha ni el conteo. El pago es de **hoy** y la venta sigue siendo de 2020 |
| D151-05 | Catálogo | `stable`, `security invoker`, `search_path` fijo, `EXECUTE` para `authenticated` y no para `anon`, e índice con **su definición exacta** (misma razón que E9-01) |

### 4.3 Reparto del equipo y forma de pago (`tests/db/team-commission.test.ts`, 26 pruebas)

Añadidas con D-127. Cubren las dos reglas nuevas —**el vendedor padre cobra por su equipo** (BR-G20) y
**elige cómo pagarle a cada integrante** (BR-G24)— y, sobre todo, la invariante que las ordena.

Trabajan sobre una **rifa propia**: cambian el precio y la configuración de pago, y las dos cosas
recalculan dinero hacia atrás. Hacerlo sobre la rifa del seed le movería las cifras a las demás
suites según el orden de ejecución (la trampa de I-035).

| ID | Caso | Resultado esperado |
|----|------|--------------------|
| E10-01 | El integrante cobra su tramo | El padre recibe `mitad − tarifa`; el integrante no tiene equipo propio |
| E10-02 | El padre vende lo suyo | Cobra la mitad, y lo del equipo no se toca: son dos bloques |
| E10-03 | Vendedor sin equipo | La mitad del precio; `team_earned = 0`. Nada de esto le afecta |
| E10-04 | El integrante sube al tramo 21 | Le sube a él y **le BAJA al padre**, retroactivo en las 21 |
| E10-05 | Anular el pago | Baja de tramo y se lo quita a los dos |
| E10-06 | **La invariante** (BR-G21) | `cobrado − Σ comisiones = n × (precio ÷ 2)`, exacto |
| E10-07 | El integrante rebaja una boleta | La asume él entero; la parte del padre no lleva rastro de la rebaja |
| E10-08 | Integrante nuevo | Nace en `tiered` sin importe: **compatibilidad** (BR-G26) |
| E10-09 | Valor fijo | Cada boleta vale lo mismo, sin niveles |
| E10-10 | `commission_summary` | `pay_model` distingue `half_price`/`tiered`/`fixed`; sin niveles no hay «próximo» |
| E10-11 | Cambiar el valor fijo | Recalcula hacia atrás, y **le sale del bolsillo al padre** |
| E10-12 | De fijo a tramos | Recalcula con su recuento real |
| E10-13 | De tramos a fijo | Recalcula por el valor fijo |
| E10-14 | Valor por encima de la mitad | Rechazado; el tope justo se acepta y deja al padre en cero |
| E10-15 | `tiered` con importe / `fixed` sin importe | Las dos rechazadas |
| E10-16 | El padre cambia la configuración | Funciona y queda en `audit_logs` con quién lo hizo |
| E10-17 | Un vendedor toca a alguien de otro equipo | Rechazado, sin cambiar nada |
| E10-18 | Un integrante intenta subirse la tarifa a sí mismo | Rechazado |
| E10-19 | El tope, por la RPC | También lo aplica ahí, no solo el trigger |
| E10-20 | `fixed_per_ticket` sin importe por la RPC | Mensaje que dice qué falta escribir |
| E10-21 | Volver a tramos | No exige importe y lo deja nulo |
| E10-22 | Sacar a un integrante | Pasa a la mitad del precio; el ex padre deja de cobrar por él |
| E10-23 | Volver a meterlo | Recupera su configuración y el padre su parte |
| E10-24 | Cambiar el precio de la rifa | Recalcula el reparto entero; los tramos no dependen del precio |
| E10-25 | Recalcular a mano | No duplica ni una fila del ledger (BR-G08) |
| E10-26 | Ninguna comisión negativa | Cero filas con `earned < 0` o `team_earned < 0` |

**Cada prueba comprueba además la invariante del ledger, y por partes** (BR-G22): `sum(amount where
not team_movement) = earned` **y** `sum(amount where team_movement) = team_earned`. Sumarlas en un
solo total dejaría pasar un error que se compensara entre las dos, que es exactamente lo que ocurrió
durante el desarrollo (D-127, segundo error).

⚠️ **E10-04 y E10-07 comprueban que la ganancia del padre BAJA**, y no es una errata. Los tramos son
retroactivos: cuando su integrante llega a la boleta 21, la tarifa de las 21 sube a $25.000 y lo que
le queda al padre cae de $40.000 a $35.000 **en todas ellas**. El equipo vendió más y el padre cobra
menos. Es el efecto buscado de BR-G20 + BR-G02, y quien vea ese número por primera vez pensará que es
un error si esto no está escrito.

---

### 4.4 Catálogo público (`tests/db/public-catalog.test.ts`, 34 pruebas)

La única lectura del proyecto que sirve datos **sin sesión**, así que la suite va por los dos caminos
que importan y no por uno solo:

* **Lo que puede hacer un visitante** se prueba con el cliente `anon` REAL contra PostgREST —igual
  que alguien con la consola del navegador abierta—, no confiando en el `grant`: se comprueba que
  las tablas devuelven cero filas y que las tres funciones dan error al invocarlas.
* **Lo que devuelven las funciones** se prueba llamándolas por `pg`, porque lo que se verifica es su
  **cuerpo** —filtros y proyección—, no el transporte.

Cubre: privilegios en el catálogo de PostgreSQL (`anon` ✗, `authenticated` ✗, `service_role` solo
las dos públicas, las tres `SECURITY DEFINER` con `search_path` fijo); la proyección exacta (tres
columnas por boleta, ningún uuid, ningún cliente, ningún importe); los siete casos de «no publica»;
que no se escapa a otro vendedor ni a otra organización; ceros iniciales y orden numérico; unicidad
y formato del slug y del WhatsApp; la FK de la rifa a su organización; el tope de página, que no se
puede evadir; la estabilidad de la paginación; y la búsqueda, incluida una de inyección.

**Datos propios, no los del seed.** La suite crea su propia rifa: `public_catalog_tickets` devuelve
todo el inventario publicable de un vendedor, y usar la del seed haría que las boletas que dejan
otras suites cambiaran las cuentas según el orden de ejecución (la trampa de I-035). Limpia **por
nombre** de rifa y también al empezar, de modo que una ejecución interrumpida no bloquea la
siguiente; borra antes `commission_ledger` y `seller_commissions`, que apuntan a la rifa.

### 5.4 Los tres botones del catálogo (`catalogo-panel*.spec.ts`, 22 pruebas)

**El menú nativo del sistema no existe dentro de un navegador de pruebas.** Pulsar «Compartir» en
Chromium no abre ninguna hoja del teléfono, así que lo comprobable —y lo que de verdad importa— es
**qué le pide la aplicación al navegador y qué hace con cada una de sus respuestas**.

`stubShareAndClipboard` (en `catalogo-helpers.ts`) sustituye `navigator.share` y
`navigator.clipboard` con `addInitScript`, o sea **antes de que cargue la página**, porque el
componente los lee al pulsar y no al montarse. Con eso se ejercen los cuatro caminos de compartir
—comparte, la persona cancela, el navegador rechaza, no existe `navigator.share`— y el fallo del
portapapeles, y se puede afirmar lo que en otro sitio sería una suposición: que **cancelar no escribe
nada en el portapapeles ni muestra ningún aviso**.

El reparto entre escritorio y móvil no es casual: la **URL larga** comprueba en escritorio el
*mecanismo* del recorte (`overflow`, `text-overflow`, `white-space`) y en móvil el *efecto*
(`scrollWidth > clientWidth`). Exigir recorte visible en una tarjeta ancha, donde la dirección cabe
entera, sería exigir que se recorte algo que no sobra — y fue un fallo real de la primera versión de
esa prueba.

### 5.5 Que solo se descargue UNA composición del hero (`catalogo-publico*.spec.ts`, D-163)

La afirmación central del rediseño —«el navegador no descarga las dos imágenes»— no se comprueba
mirando el HTML: dos `<img>` ocultos con CSS también salen en el HTML, y aun así se descargan los
dos. Se comprueba **escuchando la red**: las pruebas registran cada respuesta cuya URL sea una imagen
o pase por `/_next/image`, filtran las del hero y exigen **exactamente una**, además de cuál.

Hay **una por proyecto de Playwright**, y no es duplicación: el proyecto de escritorio afirma que baja
la composición **horizontal** y el del teléfono, la **vertical**. Es justo lo que `<source media>`
decide y lo que un `hidden md:block` rompería sin que ninguna prueba de DOM se enterara.

En la misma tanda entran dos comprobaciones que solo tienen sentido después del rediseño: que el
encabezado fijo **ocupa menos del 14 % de la altura** del teléfono —antes llevaba dentro el título y
el buscador—, y que el botón «Limpiar búsqueda» **se puede pulsar** aunque el campo lleve un fondo
desenfocado, que es la regresión de I-095.

### 5.6 Los cinco estados del buscador que se posa (`catalogo-publico*.spec.ts`, D-164)

Lo que hace comprobables estos estados es que el buscador **es uno**: no se comprueba «cuál de los
dos se ve», se comprueba **dónde está el único que hay**. Por eso cada prueba afirma también
`toHaveCount(1)` sobre el `searchbox` — si alguien volviera a dos instancias, todas fallarían.

Los cinco: arriba del todo, scroll intermedio (título posado y buscador no), scroll bajo (los dos
posados), vuelta arriba, y la transición sin perder valor ni foco. La **ventana intermedia** se
calcula a partir de las cajas reales en vez de fijar un número de píxeles: entre que el título pasa
bajo el encabezado y el buscador lo alcanza hay unas decenas de píxeles, y un número fijo se rompe
en cuanto cambia una línea del texto de introducción.

**Trampa que costó una instrumentación:** al escribir en el buscador, el enrutador navega a `?q=…` y
**devuelve la página al principio**. Cualquier prueba que baje y luego mida tiene que esperar a que
esa navegación aterrice, o medirá el scroll deshecho.

## 5. Pruebas unitarias clave

| Módulo | Casos |
|--------|-------|
| `lib/money.ts` | `0 → "$0"`, `25000 → "$25.000"`, `120000 → "$120.000"`; rechazo de decimales; ida y vuelta sin pérdida |
| `features/tickets/schemas.ts` | `'1'`, `'25'`, `'007'`, `'0000'`, `'9999'` válidos; `'12345'`, `'12A4'`, `'-123'`, `'12.5'`, `''` inválidos |
| Cálculo de estado de pago | Sobre una boleta de $120.000: 0 → Sin pagar; 1..119.999 → Abonada; 120.000 → Pagada; 120.001 → error. Incluye el caso crítico de D-098: **$100.000 → Abonada**, nunca Pagada |
| `lib/dates.ts` | Un pago del 31 a las 23:00 en Bogotá pertenece al día 31, no al 1 |
| Detección de duplicados en el formulario masivo | Detecta repetidos entre 1.000 filas sin bloquear la interfaz |
| `lib/errors.ts` | Cada código de error de PostgreSQL se traduce a un mensaje en español sin filtrar detalles internos |
| `features/tour/tours.ts` | Ids únicos y estables; cada recorrido termina con el cierre; ningún recorrido del portal administrativo alcanza a un vendedor; los textos cumplen la guía de redacción (títulos de 2 a 7 palabras, glosario, tuteo) |
| `features/tour/use-tour.ts` + `storage.ts` | Un paso cuyo elemento falta, mide cero o está oculto se descarta sin romper el resto; el cierre sobrevive siempre; la memoria es por perfil y por recorrido, y no se repite si el navegador bloquea el almacenamiento |

### 5.0 Los diálogos y sus botones (`dialogos-alcanzables.spec.ts`)

Cuatro diálogos × dos tamaños de ventana (1280×720 y **390×620**). Nació de un defecto real: un
diálogo alto crecía más que la ventana y su pie —confirmar y cancelar— quedaba **fuera de la
pantalla**, sin nada que desplazar (D-099).

Lo que afirma no es que el diálogo sea bajo, sino que **su última acción se alcanza**:
`scrollIntoViewIfNeeded()` y después `toBeInViewport()`. Es la única formulación que distingue el
antes del después, porque en el diseño roto el desplazamiento no existía.

No usa el proyecto `movil` de Playwright —solo recoge `*-movil` y `*responsive`— porque esto no es
emulación táctil sino geometría: basta con `test.use({ viewport })`.

⚠️ **Al tocar `DialogContent`, comprueba que esta suite falla si retiras el arreglo.** Se validó así
al escribirla (2 de 8 se caen). Una prueba de regresión que pasa en los dos casos no vigila nada.

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
| `unit/search.test.ts` | Normalización del término: espacios, acentos, ñ, teléfonos en cualquier formato, mínimos por pantalla, números de boleta |
| `db/search.test.ts` | Que `search_normalize()` en SQL dé **lo mismo** que `foldForSearch()` en TypeScript, la columna generada, los índices y que la vista siga siendo `security_invoker` |
| `unit/ticket-import.test.ts` | Lectura de archivos y revisión (BR-N12): CSV mínimo, con columna `#`, tal como lo exporta Excel (BOM + CRLF), separado por `;`, con comillas y con espacios sobrantes; JSON canónico, alias en español y números sin comillas; encabezados desconocidos y mapeo manual; por fila: falta un número, más de 4 dígitos, letras, ceros de delante, repetida y ya existente. Añade CSV/JSON con cliente, aliases de nombre/celular, par obligatorio, filas mezcladas, agrupación normalizada y bloqueo del flujo Seller. Incluye 1.000 filas para comprobar que la revisión no es cuadrática |
| `unit/ticket-import-abono.test.ts` | La columna «Abono» (BR-N14, D-129), en tres bloques: **leer la casilla** (la tabla entera del encargo, «Cancelado» en cualquier caja, «Completa» rechazada con el mensaje que dice la palabra buena, cero, negativo, decimal, texto y por encima del precio); **revisar la fila** (estado esperado, abono sin cliente, resumen, el importe convertido a pesos, y sin precio no se inventa uno); y **CSV frente a JSON**, que comparan el ejemplo del encargo en sus dos formatos y exigen resultado idéntico. El precio entra por parámetro y hay casos con $120.000 **y** con $50.000, para que atar el corte a una cifra fija falle |
| `db/ticket-import.test.ts` | Lo que solo se puede probar contra PostgreSQL (BR-N12): un **vendedor** conoce una combinación tomada **sin ver de quién es**, aislamiento, bitácora y rollback de códigos; para `0021`, lote mixto, una identidad → un cliente, reutilización exacta, vista previa acotada a la cartera, celular con otro nombre y nombre sin celular con rollback total, Seller rechazado y otra organización aislada. Para `0033` (BR-N14): que el abono queda como **pago y asignación** —no como un campo acumulado—, que el estado y el saldo los deriva la base de datos, que cada abono es de **su** boleta (dos `payment_id` distintos), y el rollback total ante un abono por encima del precio, sin cliente, en cero, negativo, decimal o llegado como texto |
| `e2e/importar-boletas.spec.ts` | El recorrido entero en los dos portales: elegir archivo → vista previa → confirmar → resultado; no escribir antes de confirmar; importar válidas avisando descartes; mapeo manual; archivo ilegible; doble clic; Seller `pending_approval`; lote administrativo mixto donde dos filas normalizadas crean un cliente, una queda sin asignar y una cuarta se excluye por faltar el celular; y la **columna «Abono»**, que comprueba lo que dice la vista previa antes de confirmar, lo que dice el resultado después, el estado de las tres boletas y que existen los **dos** pagos con su asignación |
| `db/ticket-search.test.ts` | Los 7 casos del encargo de BR-N11: encuentra por número diario y semanal, entero o en parte; **el código interno no lleva a su boleta** por ninguno de sus recortes; el orden por relevancia en sus seis escalones; los ceros de delante; el total exacto de la paginación; y que la función hereda la RLS (un vendedor no encuentra la boleta de otro ni pasando su id, ni se cruzan dos organizaciones con la misma combinación) |
| `e2e/busqueda-hibrida.spec.ts` | Una sola consulta para cuatro teclas; `Enter` inmediato; `Enter`+pausa no duplican; el mínimo no encierra; limpiar restaura; no se pierde el foco; la página vuelve a la primera; convive con los filtros; **una respuesta lenta no pisa a la actual**; y que se encuentre a un cliente que no viene en el bloque inicial |
| `db/ticket-search-client.test.ts` | Lo que añade BR-N13 (migración `0029`): que el mismo buscador encuentre por **nombre completo, primer nombre, apellido y parte del nombre**, sin tildes y en minúsculas; que un cliente con varias boletas devuelva **todas** y cada una con su propio id; que dos personas llamadas igual salgan las dos sin mezclarse; que una boleta **sin cliente** no aparezca por nombre y sí por su número; que `%` y `_` se escriban y no se ejecuten; el orden por relevancia del nombre en sus cuatro escalones y las boletas de una persona juntas; el total exacto de la paginación; la **regresión de la rama de números** (de 1 a 4 dígitos nunca pasa por el cliente); y el aislamiento con **tres clientes que se llaman igual** —uno por vendedor y uno en otra organización— más el visitante anónimo |
| `e2e/boleta-cliente.spec.ts` | El recorrido completo de D-100 y D-101: buscar por nombre en «Boletas» y abrir **esa** boleta; apellido sin tildes; nombres repetidos; un vendedor que **no** encuentra lo ajeno y el personal que sí; sin resultados, el texto que explica qué se puede buscar; que buscar por número siga igual; escribir y borrar rápido sin que una respuesta vieja pise a la nueva; y del detalle: la fila del cliente pulsada **en su borde derecho**, la ficha de siempre, volver → boleta → lista **con el término intacto**, la boleta sin cliente sin ningún enlace, el mismo camino en el portal administrativo, la diana de **44 px** en el teléfono y el foco + `Enter` con teclado |
| `e2e/filas-seleccionables.spec.ts` | La fila abre el detalle desde cualquier celda y con `Enter`; la casilla y el menú de acciones **no** lo abren; y los estados de la lista de clientes (hover, elegido, elegido+hover) conservan contraste, marcan la elección con algo más que color y no desplazan el contenido |
| `unit/ticket-selection.test.ts` | Las dos piezas puras de la selección múltiple (BR-B01): los recuentos de elegibilidad, la lista de incompatibles y el **motivo concreto** de cada una; y el almacén de la selección — que separa portales, avisa a quien esté suscrito, aguanta contenido corrupto, respeta el tope de 1.000 y **devuelve siempre la misma referencia cuando está vacío**, que es lo que evita un bucle infinito en `useSyncExternalStore` |
| `db/bulk-actions.test.ts` | Lo que solo se puede probar contra PostgreSQL (BR-B01..BR-B08): elegibilidad heredando la RLS; **todo o nada** en las cuatro acciones; concurrencia real (otra sesión anula una mientras el lote está abierto); que un vendedor no anule, no elimine y no se reparta boletas; que otra organización no toque nada ni con los ids exactos; que una boleta con cliente, con abonos —aunque estén anulados— o **anulada** no se pueda eliminar; que el `DELETE` directo siga prohibido (D-038); la bitácora por boleta y del lote; e ids repetidos, inventados, lista vacía y **1.000 en una sola llamada** |
| `e2e/seleccion-multiple.spec.ts` | El recorrido en escritorio: marcar, desmarcar y limpiar; que la selección **sobreviva a buscar, filtrar y cambiar de página**; que «Limpiar filtros» no la borre; que marcar **no mueva la fila de sitio**; la casilla del encabezado y el segundo paso explícito para «todas las que coinciden»; «Ver seleccionadas»; anular, cambiar vendedor, eliminar y aprobar en lote; y tres llamadas **directas a la API**, saltándose la pantalla, con los ids de otro vendedor |
| `e2e/seleccion-movil.spec.ts` | Lo táctil (proyecto `movil`): en modo normal no hay casillas y la fila abre el detalle; en modo selección la **fila entera** marca y ya no abre; la casilla se ve de 20 px y **se toca en 44**; la pulsación larga entra en el modo; la barra se queda pegada abajo tras hacer scroll y sobrevive a la búsqueda; «Cancelar» limpia y devuelve el comportamiento normal |
| `e2e/back-navigation.spec.ts` | Flecha de volver de las pantallas de detalle (BR-X09, D-089): boletas, clientes y rifas conservan filtro/búsqueda al volver por historial real; editar rifa vuelve al detalle, no al listado; abrir una boleta o un cliente por URL directa (o en una pestaña nueva) cae en el destino de repuesto sin salir de la aplicación; se activa con teclado (foco + `Enter`); y ya no queda ningún enlace textual «Volver a…» |
| `e2e/back-navigation-movil.spec.ts` | Lo táctil (proyecto `movil`): la flecha mide al menos 44×44 y responde a `tap()`; un título largo no produce scroll horizontal ni empuja la flecha fuera de la pantalla |
| `unit/sidebar-preference.test.ts` | Cómo se combinan la preferencia guardada, el sitio disponible y la superposición (D-131, D-132): una cookie ausente o manipulada abre la barra; sin sitio se cierra **sin borrar** la preferencia; flotando se abre aunque no quepa; la cookie lleva `path`, caducidad y `secure` solo en HTTPS. Y el guardián que **no puede escribirse de otra forma**: que el punto de corte de `globals.css` y el de TypeScript sigan siendo el mismo número, porque el CSS no se importa |
| `e2e/menu-lateral.spec.ts` | La barra lateral de escritorio (D-131, D-132). Cada prueba **fija su ventana**, porque el ancho es lo que se prueba: a 1.600 abierta con sus ocho nombres; cerrarla a mano deja los iconos y le da a la tabla **más de 150 px**; sigue cerrada al navegar **y tras recargar** (la cookie); el globo aparece con el ratón **y con el foco**; se estrecha a 1.360 (208 px) y a 1.100 se cierra sola sin perder la preferencia, que vuelve al ensanchar; una barra cerrada a mano sigue cerrada aunque sobre sitio. Y a 1.100, donde no cabe abierta, el bloque **flotante**: que se abra encima con el contenido **quieto al píxel**, que se cierre al elegir una opción, al pulsar fuera, con `Escape` y **al llevarse el foco fuera con el tabulador** —la única rama que exige una ventana con foco de verdad, y por eso vive aquí y no en el navegador de las mediciones—, y que flotar **no escriba la cookie**. Además, a 1.360 —el ancho más apretado— se mide que **ningún nombre se parte en dos líneas ni se recorta** |
| `e2e/boleta-estrecha-movil.spec.ts` | Regresión de **I-076** (D-125): el detalle de una boleta **a 320 px** —fija su propio ancho, más estrecho que el Pixel 7 del proyecto— con un cliente de **nombre largo**, en los dos portales. Comprueba **dos** cosas: que la página no desborde horizontalmente y que el nombre esté **recortado de verdad**; sin la segunda, el día que el nombre cupiera de sobra la prueba pasaría sin comprobar nada. Las tres condiciones juntas —detalle, 320 px y nombre largo— son las que la comprobación de desbordamiento de `seller-ciclo-movil.spec.ts` no reúne, y por eso el fallo vivió sin que ninguna prueba lo viera |

| `unit/reports-sales-by-date.test.ts` | Lo que decide **qué conjunto se consulta** en «Ventas por fecha» (D-151), antes de tocar la base: el predeterminado de cada portal —el vendedor abre «Ventas por fecha», el personal conserva «Por vendedor», un `report` ajeno o inventado cae en el primero de su lista—; las fechas efectivas —hoy sin escribirlo en la URL, un solo extremo, rango de un día, cambio de año, fecha corrupta descartada, y «Desde» posterior a «Hasta» marcado inválido **sin corregirse solo**—; y que los parámetros del CSV sean los de la pantalla, con las fechas **ya resueltas** y sin `page` |
| `e2e/ventas-por-fecha.spec.ts` | El recorrido entero en el portal del vendedor (D-151): entrar a Reportes lo abre **sin redirección** y con la URL limpia; hoy no hubo ventas y lo dice; los dos campos muestran el día que se consulta; elegir otro día cambia URL, indicadores y tabla; los indicadores cuadran (`vendido − abonado = saldo`); un rango suma los dos días; la fila enlaza a la boleta y al cliente; día sin ventas → estado vacío, no tabla vacía; rango al revés → aviso con las dos fechas intactas; «Limpiar filtros» vuelve a hoy; el CSV trae el mismo rango con filas **fuera de la primera página**, con BOM, `;` y `DD/MM/AAAA`; el CSV sin fechas pide el mismo día que la pantalla; y no contiene ni una boleta ajena. Además: el Dueño conserva «Por vendedor» como inicial, pedirlo por URL no lo habilita en su portal, los cuatro reportes anteriores del vendedor siguen accesibles, y **los dos 403 cruzados** del CSV |
| `e2e/ventas-por-fecha-movil.spec.ts` | El mismo reporte en teléfono: sin desbordamiento horizontal **a 320 y a 390 px**; la tabla se desplaza dentro de su bloque; **lo abonado no desaparece** al ocultarse su columna —baja bajo «Falta»—; el `caption` dice qué se está viendo; y el estado de pago lleva texto, no solo color |

**Cómo se mide el color, y por qué así** (I-034): pintando el color en un `canvas` y leyendo los
píxeles, no leyendo `getComputedStyle`. Con Tailwind 4 el navegador devuelve los colores en
`lab()`/`oklab()`, y leer sus números como canales RGB da contrastes falsos de 1,00 en textos
perfectamente legibles. Hay que esperar además a que termine `transition-colors`: medir justo después
de un `hover()` captura un fotograma intermedio.

**Estas pruebas se comprobaron al revés.** Con el CSS defectuoso restaurado a propósito, las dos de
contraste fallan (1,01 y 1,04). Una prueba visual que no se ha visto fallar no demuestra nada.

### 5.3 Una trampa más de las E2E: pulsar antes de que React hidrate

Entre que el HTML del servidor está pintado —y por tanto Playwright ya considera el botón
pulsable— y que React le engancha su manejador, hay un hueco. Un clic ahí **no hace nada**, y la
comprobación siguiente falla culpando al producto de una carrera del arnés. Apareció al escribir las
pruebas de selección múltiple: la misma prueba fallaba sola y pasaba si antes se tocaba cualquier
otra cosa.

La solución es reintentar el gesto hasta que surta efecto, con una espera **corta** dentro para que
un fallo real siga fallando rápido:

```ts
await expect(async () => {
  await box.click()
  await expect(box).toBeChecked({ timeout: 1500 })
}).toPass({ timeout: 20_000 })
```

Vive en `toggleCheckbox` (`tests/e2e/fixtures.ts`) y en `activarModoSeleccion`
(`seleccion-movil.spec.ts`). Si escribes una prueba que pulsa lo primero al entrar a una pantalla,
usa el mismo patrón.

**Y en el teléfono, `locator.tap()` en vez de `touchscreen.tap(x, y)`.** El primero desplaza el
elemento a la vista y espera a que sea pulsable; el segundo toca unas coordenadas de pantalla y, en
cuanto la barra de selección empuja la tabla hacia abajo, el toque cae fuera del viewport y se pierde
sin decir nada.

---

## 6. Datos de prueba (seed)

Definido en la Fase 2 y unificado después por D-042. Estado conocido local:
`npm run db:reset && npm run seed:local`.

**Organización 1 — «Rifas Demo»**
- Owner: `owner@demo.test`
- Admin: `admin@demo.test`
- Seller A: `vendedor1@demo.test`
- Seller B: `vendedor2@demo.test`
- Rifa `active` de `$120.000` con `allow_seller_ticket_creation = true`
- 3 clientes de Seller A y 2 de Seller B
- Boletas: 10 `available`, 6 `assigned`, 2 `pending_approval`, 1 `cancelled`, 3 `draft`
- Pagos: uno parcial (`$40.000`), uno completo (`$120.000`), uno repartido entre 2 boletas
  (`$100.000` + `$50.000`) y uno anulado
- Los cuatro estados de cobro quedan visibles a propósito (D-098): Sin pagar · Abonada con
  `$80.000` pendientes · **Abonada con `$20.000` pendientes** —el caso crítico: `$100.000` sobre una
  boleta de `$120.000`— · Pagada

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
`npm run test:db` **dos veces seguidas sin resembrar** debe dar 378 ✅ las dos veces.

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

Estado vigente registrado el 2026-08-09: **293 pruebas unitarias + 378 de base de datos + 213
end-to-end**. Los resultados y errores de cada ejecución viven en `TEST_RESULTS.md`.
