# ESTRATEGIA DE PRUEBAS

- **Versión:** 2.30 · **Actualizado:** 2026-09-18 (**§4.12**, Etapa 3 del historial de premios —la auditoría, D-208, `0070`, `0071` y `0072`—: `prize-award-history.test.ts` pasa a **70** —H5-04 y H8-08 observan el bloqueo, H7-05, H9-07, H12-03 y la matriz **H13** por PostgREST—, nace `prize-award-volume.test.ts` (**8**, con un modelo del motor en TypeScript y la medición de rendimiento a petición), las expectativas del aviso de cobertura se escriben a mano, y la E2E gana el punto A, el punto B, lo ajeno frente a lo inexistente, los parámetros manipulados, la combinación de filtros y los 375 px). Antes, el 2026-09-17 (**§4.12**, Etapa 2 del historial de premios —D-208, `0069`—: H10-01 sin espera fija, **H12** para la cobertura, `prize-awards-history.test.ts` (22), `prize-awards-view.test.tsx` (9), cuatro invariantes nuevas en `admin-privacy.test.ts` y **17** pruebas E2E en `premios-ganados.spec.ts` y `premios-ganados-movil.spec.ts`). Antes, ese mismo día (**§4.11**: D-207, `0066` —quién ejecuta cada función de premios—: `prize-function-privileges.test.ts` nueva (**15**) con la lista exacta de las 62 funciones, las comprobaciones de `verify:remote` y su fallo si reaparece cualquiera de los 35 permisos del preflight; el motor pasa a interno y `lottery-results` y `raffle-prize-matching` lo corren con `runLotteryEngine`; M8-05 exige que la service role no lo ejecute). Antes, el 2026-09-16 (**§4.11**: la corrección de D-206, `0065` —el aviso de fechas llega también a quien las cambia—: `raffle-date-notices.test.ts` pasa a **12** con R1-02 reescrita y R1-04 nueva, `rifa-fechas-aviso.spec.ts` a **4**, con la comprobación en la base después de guardar como Dueño, y F7 exige «todas las personas, también a ti»; volver a excluir al actor lo detectan las dos). Antes, ese mismo día (**§4.11**: la corrección local de la Entrega 5, D-206 —`raffle-prize-transition.test.ts` pasa a **51** con la frontera del instante efectivo en 2066, el reloj real y la carrera con el motor; `raffle-date-notices.test.ts` (**11**) y `rifa-fechas-aviso.spec.ts` (**3**) nuevas; cinco mutaciones detectadas—). Antes, ese mismo día (**§4.11**: la Entrega 4 —`raffle-prize-transition.test.ts` de base (38) y unitaria (30), `premios-transicion.spec.ts` (4), J13 con los seis premios confirmados y J3-03 como ejemplo genérico, D-204—). Antes, ese mismo día (**§4.11**: la corrección de la Entrega 3 —M12 y
  J8-03 para el corte efectivo de I-125, `prizeDrawCutoff`, y los textos de I-126 en
  `lottery-notifications.test.ts`, `lottery-dashboard.test.ts` y `loterias-panel.spec.ts`—). Antes,
  ese mismo día (**§4.11**: el motor de premios configurables,
  Entrega 3, D-203 —`raffle-prize-matching.test.ts` y la prioridad por cliente—; y la corrección de
  un desfase heredado: la tabla no registraba `premios-loteria-fija.spec.ts` y atribuía 10 pruebas a
  `raffle-activation.test.tsx`, que tiene 11). Antes, el 2026-09-15 (**§4.11**: premios configurables por rifa, Entrega
  1, D-199 y D-200). Antes, el 2026-09-14 (§4.10: la cartera es del vendedor, D-198); antes,
  el 2026-09-13 (§4.9: el mensaje propio de «Resultados de la semana», D-197)
- Este documento define la ESTRATEGIA. Los resultados por fase están en [`TEST_RESULTS.md`](TEST_RESULTS.md).
- ⚠️ En la **§4.8** (cuentas de cobro y recordatorios de pago) conviven las dos cosas: las **etapas 1
  y 2 están escritas y ejecutadas** (62 de base, 19 E2E y 37 unitarias), y las **etapas 3 a 6 son
  criterio de aceptación** todavía sin código. Cada bloque lo dice.
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
  La máscara visual del teléfono (D-184) vive en `telefono-mascara.spec.ts`
  (escritorio: lo que se ve, el cursor, y sobre todo **lo que se guarda** —los
  cinco caminos por los que un teléfono vuelve a la base (ficha del cliente,
  vendedor y administrador del portal, integrante de equipo por su RPC y el
  WhatsApp del catálogo), con la fila leída DESPUÉS y comparada carácter por
  carácter, y `updated_at` como prueba de que abrir y salir sin guardar no
  escribe nada—, más **Ctrl+V con el portapapeles del sistema**, que `fill()`
  no es, y la búsqueda por los cuatro formatos) y
  `telefono-mascara-movil.spec.ts` (320 px: desbordamiento, los 44 px del campo,
  escribir y borrar con el teclado del teléfono). Las dos **borran lo que crean**
  con `purgeTestData` y `purgeSellers`. El teclado nativo de un teléfono real no
  lo reproduce Chromium, así que una pasada verde no sustituye mirarlo en un
  móvil (la misma limitación de I-079 e I-066).
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

Casos de loterías (Etapa 1, `tests/db/lottery-results.test.ts` —desde D-207 corre el motor con
`runLotteryEngine`, porque `match_lottery_result` ya no es ejecutable por la service role— y
`tests/unit/lottery-constants.test.ts`;
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

### 4.5 Entrega del paz y salvo (`tests/db/ticket-clearance.test.ts`, 33 pruebas)

Cubre BR-I15 por sus tres frentes: **quién puede** (el vendedor dueño sí; otro vendedor, un
vendedor padre sobre su equipo, el Dueño, el Administrador, otra organización, una sesión anónima
y una **cuenta desactivada**, no), **qué se escribe** (la fecha sale del reloj del servidor, la
activación manual deja la marca heredada en `false`, desactivar limpia las dos, y una fila
heredada que se desmarca y se vuelve a marcar pasa a manual) y **qué NO se toca** (se compara la
fila entera antes y después en `unpaid`, `partial` y `paid`: ninguna columna de negocio se mueve).

Además: el bloqueo optimista, que pedir el valor que ya está **no escribe ni deja bitácora**, que
la rifa cerrada **no** bloquea, que cambiar de cliente y liberar la boleta lo devuelven a
pendiente —también con un `UPDATE` directo por la clave de servicio, que es lo que demuestra que
la regla vive en la base—, que los abonos no lo cambian en ninguno de sus tres caminos (registrar,
corregir a $0, anular), los dos CHECK de coherencia, la auditoría con su actor, y que
`search_tickets` devuelve las dos columnas **sin** cambiar su firma, su `SECURITY INVOKER`, sus
privilegios ni su aislamiento.

**La carga inicial se prueba leyendo la sentencia del propio archivo de migración** (E13-09). En
una base local recién reiniciada el `UPDATE` de `0049` afecta a **cero filas** —`db:reset` aplica
las migraciones y el seed vende sus boletas después—, así que no deja rastro que comprobar. La
prueba lee el `update tickets` final de `0049`, comprueba que conserva sus tres condiciones, lo
ejecuta sobre la tabla entera dentro de una transacción y hace `rollback`. Así lo que se verifica
es **la sentencia que se va a aplicar en producción**, no una copia que puede quedar desfasada:
que marca exactamente las vendidas, que no roza disponibles, borradores ni anuladas, que no mueve
ni un campo financiero o de identidad, y que su auditoría queda con **actor nulo**.

### 4.6 Configuración de WhatsApp del vendedor (`tests/db/whatsapp-settings.test.ts`, 15 pruebas)

Cubre BR-W01..BR-W03 y BR-W07 desde la base, que es donde de verdad se decide. **Quién puede:** un
vendedor sobre sí mismo sí; el personal, no —y la RPC lo dice con una frase legible—; y **nadie
sobre otro**, lo que aquí se demuestra de una forma poco habitual: la función **no tiene parámetro de
vendedor**, así que la prueba comprueba que dos vendedores llamándola en la misma sesión de pruebas
acaban cada uno con **su** enlace, sin que ninguno pueda apuntar al otro.

Las tres pruebas que importan más son las que atacan el camino que la RPC existe para cerrar: un
vendedor intentando un `UPDATE` directo sobre la membresía **de otro** (cero filas), sobre **la
suya** (cero filas también — por eso existe la función) y leyendo la de un vendedor ajeno a su equipo
(cero filas). Si la segunda empezara a devolver una fila, alguien habría ampliado
`memberships_update_staff` y con ella el rol, el estado y la ganancia.

**Los CHECK se prueban con la clave de servicio, a propósito.** La service role omite la RLS pero
**no** los CHECK, así que es la única forma de demostrar que el estado incoherente —«uso mi mensaje»
sin mensaje, o un enlace que no es de WhatsApp— no puede existir venga por donde venga, y no solo
cuando se pasa por la pantalla.

### 4.7 La invitación en el navegador (`whatsapp-invitacion*.spec.ts`, 15 pruebas)

**No se abre WhatsApp en ninguna prueba, y no es por comodidad.** `wa.me` es una web de terceros: la
prueba no tiene por qué tener internet, y esperar a que una navegación externa se comprometa es lo
que hacía fallar la primera versión de esta suite (`popup.url()` devolvía `about:blank`).
`spyOnWindowOpen` sustituye `window.open` con `addInitScript` y **devuelve un objeto, no `null`** —con
`null`, la aplicación creería que el navegador bloqueó la ventana y recorrería otro camino—. Con eso
se puede afirmar exactamente lo que interesa: que la dirección lleva el teléfono **normalizado con su
indicativo** y el mensaje **con el enlace del grupo dentro**.

Lo demás que solo se ve en un navegador: que el diálogo **no se cierra** con `Escape`, pulsando el
fondo ni con una «X» que no existe —y que «Cerrar» **sí** lo cierra, que es la otra mitad de la
regla—; que dice cosas distintas en cada flujo, incluida la que **no** dice («boleta» no aparece
cuando se creó un cliente a secas); y que sin grupo configurado el botón cambia, lleva a
«Configuración» y **el cliente recién creado sigue en la cartera**.

En móvil se comprueban los cuatro anchos del encargo —320, 375, 390 y 430— más tableta, y se mide
que los dos botones no bajen de la diana táctil. Esa prueba encontró un defecto real: medían 36 px.

### 4.8 Cuentas de cobro y recordatorios de pago (BR-M, BR-S, BR-V; D-185, D-188..D-193)

> **Las SIETE etapas hechas, y EN PRODUCCIÓN** desde el 2026-09-12 (D-193). Base: `payment-accounts-reminders.test.ts` (62),
> `payment-reminder-engine.test.ts` (32), `push-subscriptions.test.ts` (21),
> `push-outbox.test.ts` (27) y `push-dispatch.test.ts` (12, **con la base real y el cifrado real**).
> Navegador: `configuracion-cobro.spec.ts` (25), `configuracion-cobro-movil.spec.ts` (9) y
> `push-dispatch.spec.ts` (5). Unitarias: 108, incluidas **12 que ejecutan `public/sw.js` de
> verdad** y **15 contra los vectores publicados del RFC 8291 y del RFC 8292**.
>
> **La Etapa 6 —auditoría integrada— está hecha** (D-192): 47 sondas adversarias, medición con
> volumen, comparación línea a línea de la función reescrita y barrido de textos. El informe está en
> `AUDIT_REPORT` §10 a §19, y de ahí salió `P-04b`, la prueba número 21 de
> `push-subscriptions.test.ts`: **fija el comportamiento aceptado de I-110** para que endurecerlo la
> rompa a propósito.
>
> **Las etapas 4, 5 y 6 fueron criterio de aceptación escrito antes de construir**, para que
> no se escribiera después a la medida de lo que saliera. Y donde la Etapa 3 se apartó de su propio
> criterio, está dicho abajo con su razón: no se reescribió el criterio para que encajara.
>
> **La Etapa 7 —promoción a producción— está hecha** (D-193), y su hallazgo es una prueba que
> **ninguna suite local podía dar**: `pg_net` estaba instalada en local por la propia pila de Supabase y
> **no en el proyecto real**, donde ninguna migración la creaba (**I-112**). Lo encontró una **sonda**
> **de extensiones** que compara los dos entornos, no `verify:remote` y no una prueba. **La lección para**
> **esta sección: una suite verde contra la instancia local no dice nada sobre lo que el entorno**
> **local trae puesto y el real no.** Lo que queda sin comprobar sigue siendo lo mismo: **que un aviso**
> **llegue a un teléfono de verdad**, que necesita claves configuradas y un dispositivo.

**Cada etapa se cierra con `npm run verify` y `npm run test:db` en verde**, más lo suyo. Una etapa
que no pueda demostrar su tabla de abajo **no está terminada** (`CLAUDE.md` §32).

#### Etapa 1 — base de datos ✅ (`tests/db/payment-accounts-reminders.test.ts`, 62 pruebas)

Es la etapa con más carga de prueba, porque es donde de verdad se decide el aislamiento. El acto
cuya RLS se prueba **nunca** usa `service_role` (D-043); la clave de servicio solo prepara, comprueba
y limpia.

| Qué se demuestra | Cómo |
|---|---|
| Un vendedor ve y escribe **solo lo suyo** (BR-M02, BR-S01) | Dos vendedores en la misma organización: cada uno lee 0 filas del otro, con sesión real |
| **El personal no ve nada** | Dueño y Administrador leen 0 cuentas y 0 recordatorios de un vendedor, y su `UPDATE` directo afecta 0 filas |
| **El vendedor padre tampoco** | El caso que un `memberships_select` haría pasar: un padre contra su integrante, 0 filas |
| Nadie configura a otro | Las RPC **no tienen parámetro de vendedor**: dos vendedores en la misma sesión de pruebas acaban cada uno con lo suyo (el método de §4.6) |
| Los CHECK por tipo de cuenta (BR-M04) | **Con `service_role`, a propósito**: omite la RLS pero **no** los CHECK, que es la única forma de probar que el estado incoherente no existe venga por donde venga |
| Topes de **5** y **14** (BR-M06, BR-S05) | La sexta y la quince se rechazan; **reactivar un pausado con 14 activos también** |
| Sin duplicados (BR-M08, BR-S02) | Dos cuentas iguales sin archivar; dos recordatorios al mismo día y hora |
| Segundos a cero en la hora (BR-S02) | Un `time` con segundos se rechaza |
| `next_reminder_run_at` en `America/Bogota` (BR-S03) | Tabla de casos: mismo día antes y después de la hora, cambio de semana, y el borde de medianoche |
| Ningún `DELETE` (D-038) | El catálogo de privilegios no concede `DELETE` sobre las tablas de configuración, y un `delete` con sesión real devuelve `42501` |
| Las funciones nuevas no las ejecuta `anon` ni `authenticated` cuando no debe | `tests/db/catalog.test.ts` y `verify:remote`, **las dos listas juntas** (§4.5 de `SECURITY`). I-020 e I-078 explican por qué esto se olvida |

**Y se comprobó al revés, que es lo que dice si las pruebas sirven.** Con la política de `SELECT`
cambiada a la «clásica» —`organization_id in (select current_org_ids())`, que es exactamente el error
que esta función no se puede permitir—, **12 pruebas fallan**, entre ellas las cinco del aislamiento:
M-02 (otro vendedor), M-03 (Dueño), M-04 (Administrador), M-05 (vendedor padre) y S-02. Después se
restauró el estado con `db:reset`, para que la base sea lo que dicen las migraciones y no lo que dejó
una prueba.

#### Etapa 3 — el motor ✅ (`tests/db/payment-reminder-engine.test.ts`, 31 pruebas)

| Qué se demuestra | Cómo | |
|---|---|---|
| **Idempotencia** (BR-S10) | Ejecutar `process_due_payment_reminders()` **dos veces** sobre el mismo vencimiento deja **una** ocurrencia y **un** aviso — y se fuerza además el mismo `scheduled_for` a mano, para que lo pare el índice único y no el reloj | E-03 |
| **Atomicidad** (BR-S12) | El recordatorio se crea **confirmado** desde otra conexión; el vencimiento vive solo dentro de la transacción de la prueba, que se deshace. Fuera no queda **ni ocurrencia, ni aviso, ni reloj adelantado** | E-13 |
| Recuperación ≤ 2 h y omisión > 2 h (BR-S11) | Reloj controlado: media hora tarde nace pendiente **con** campana; cinco horas tarde nace omitida **sin** campana. Y se mide el **borde**: 119 minutos avisa, 121 no | E-01, E-04, E-05 |
| Varias semanas perdidas | Treinta días de atraso dejan **una** omitida y el reloj **en el futuro**; la segunda corrida ya no encuentra nada | E-06 |
| El reloj **avanza siempre** | También cuando no se materializa nada, que es lo que impide que una fila vuelva a salir cada minuto para siempre | E-02, E-08 |
| Un pausado y un archivado **no se procesan** (BR-S04) | Se cambia el estado **sin** tocar el reloj, así que siguen vencidos, y el motor los ignora | E-07 |
| Vendedor inactivo (BR-S13) | Se desactiva **la membresía** y también **el perfil**: en los dos casos no se materializa nada, y el reloj **sí** avanza | E-08, E-09 |
| El aviso **no nombra clientes ni importes** (BR-S09) | La fila de `notifications` lleva exactamente cuatro claves, y se comprueban por nombre | E-10 |
| El lote acota el trabajo | Tres vencidos y `p_limit = 2`: 2, 1 y 0 | E-11 |
| La ocurrencia **omitida no puede avisar** | Con `service_role`, que salta la RLS pero **no** los CHECK: el `missed_silent` la rechaza | O-01 |
| Atendida ⇔ tiene fecha, y nadie procesa antes de tiempo | Los otros dos CHECK, por el mismo camino | O-02, O-03 |
| **Solo el dueño ve sus ocurrencias** | Dueño, Administrador, otro vendedor y un visitante leen **0 filas** | A-01 |
| Atender es del vendedor, y solo de `pending` | Una omitida y una ya atendida responden la misma frase; el personal y otro vendedor no pueden; el `UPDATE` directo devuelve `42501` | A-03..A-07 |
| La bitácora no guarda datos de cobro (BR-D04) | La fila de `payment_reminder.attended` lleva **solo** el instante programado | A-08 |
| El cron existe y el esquema `cron` **no** es accesible | Los dos jobs activos con su horario, y `has_schema_privilege` en `false` para `authenticated` y `anon` | catálogo |

**Dos cosas de esta tabla se apartaron del criterio escrito antes de construir, y se dicen:**

1. **La concurrencia NO se ejerce con dos conexiones vivas** (E-12 es estructural: comprueba que el
   motor conserva `for update skip locked`). Hacerlo de verdad exigiría dejar un vencimiento
   **confirmado** en la base —un bloqueo solo se ve entre transacciones que ven la misma fila— y ahí
   el `pg_cron` de cada minuto competiría con la prueba: ganaría o perdería según el segundo en que
   se lance. Una prueba que depende del reloj es peor que ninguna. Lo que ese `skip locked` garantiza
   —que dos corridas no dupliquen— lo defiende **E-03** con el índice único, que es la pieza que de
   verdad lo impide.
2. **La atomicidad se prueba por `rollback`, no forzando un fallo dentro de la función.** Forzar el
   fallo exigiría modificar el motor para que fallara, que es probar otro código. El `rollback`
   demuestra exactamente lo que se afirma: que las cuatro escrituras comparten una transacción.

**Y se comprobó al revés.** Con la gracia de dos horas puesta en cien años y la comprobación de
BR-S13 desactivada, **fallan cinco pruebas y son exactamente las cinco correctas**: E-04, E-05 y E-06
(lo que debía omitirse ya no se omite) y E-08 y E-09 (un vendedor desactivado recibiría avisos).
Después se restauró el estado con `db:reset`.

#### Etapa 3 — navegador ✅ (`configuracion-cobro.spec.ts`, +6 · `configuracion-cobro-movil.spec.ts`, +1)

| Qué se demuestra | Cómo |
|---|---|
| **Lo que se copia es el mensaje completo** (BR-S07, BR-S08) | Se sustituye `navigator.clipboard` y se lee lo que la aplicación escribió: lleva «Puedes pagar aquí:», la cuenta con su formato de dictado y **ningún `{{`** |
| Ningún texto dice que el mensaje se envió (BR-S14, BR-W08) | La sección no contiene «Enviado», «Entregado» ni «Se envió», y **sí** contiene «Rifas no lo envía por ti» |
| Abrir el grupo abre **ese** enlace | Se sustituye `window.open` y se compara la URL exacta |
| Sin grupo se ofrece **configurarlo** (BR-W05) | «Abrir grupo» no existe; hay un enlace a `/seller/settings/whatsapp` y la causa escrita |
| Atender lo saca de la lista **y del resumen** | «1 para enviar» desaparece, y el recordatorio **sigue activo**: atender no lo pausa ni lo archiva |
| **La campana lleva a donde se copia** (BR-V01, D-189) | Se abre la campanita en el panel, se pulsa el aviso y se aterriza en `/seller/settings/reminders` con la sección visible |
| Cabe a **320 px**, con los tres botones en la diana de 44 px | El mensaje con una cuenta bancaria —el bloque más ancho de la pantalla— sin desbordamiento horizontal |

La ocurrencia pendiente se fabrica llamando a la RPC del motor, no esperando al cron: **una prueba
que espere hasta un minuto para empezar no es una prueba, es una pausa.** Que el cron lo llame solo
cada minuto lo comprueban el catálogo y `verify:remote`.


#### Etapas 4 y 5 — Web Push

| Qué se demuestra | Cómo |
|---|---|
| **El cifrado es correcto** (BR-V03) | Unitarias contra los **vectores de prueba del RFC 8291** y la firma VAPID contra los del RFC 8292. Sin esto, la implementación propia no se acepta |
| El push **no lleva datos sensibles** (BR-V05) | Unitaria sobre el payload: ninguna cuenta, ningún número, ningún cliente, ningún importe. Y una prueba que **falla si alguien mete el mensaje dentro** |
| La outbox **desacopla** (BR-V02) | Se fuerza un fallo total de envío: el aviso de la campana **sigue estando** y la fila queda reintentable |
| `404`/`410` revocan sin reintentar (BR-V07) | Servicio de push simulado |
| El dispatcher **falla cerrado** (BR-V08) | Sin secreto → no funciona; secreto corto → no funciona; secreto por query string → no funciona; secreto correcto → vacía la cola. Es el juego de pruebas de `/api/lottery/sync`, reutilizado |
| **Un solo service worker** (BR-V04) | Una prueba que falla si aparece un segundo archivo de worker en `public/`, y que el worker sigue **sin guardar** respuestas con datos (D-116) |

#### Etapa 2 — navegador ✅ (`configuracion-cobro.spec.ts`, 15 · `configuracion-cobro-movil.spec.ts`, 4)

Lo que solo se ve en un navegador. **El aislamiento por vendedor no se repite aquí**: vive en la base
y ya tiene sus 62 pruebas.

| Qué se demuestra | Cómo |
|---|---|
| El resumen **no carga los formularios** (D-185) | Se afirma por lo que **no** está: ni «Agregar cuenta», ni «Crear recordatorio», ni el campo del enlace de WhatsApp |
| Una cuenta se escribe como se dicta | «Nequi · 300 111 2233 · Ana Torres», con los separadores que produce `PhoneInput` (D-184) |
| Los campos cambian con el tipo, y el tipo **no se puede cambiar al editar** | Se comprueba que el desplegable **desaparece** y queda el dato |
| El **nombre para reconocerla** se ve en la lista y **no viaja al mensaje** | Prueba por lo que **no** aparece en la vista previa |
| La vista previa enseña el **mensaje completo**, con las cuentas al final y **sin marcadores** (BR-S07) | Se busca `{{` en el diálogo y falla si aparece |
| Cambiar una cuenta cambia el mensaje **sin tocar el recordatorio** (BR-S08) | Se corrige el titular y se vuelve a abrir el recordatorio |
| Sin cuentas se dice **fuera** del mensaje, con la salida a mano | El encabezado «Puedes pagar aquí:» **no** aparece |
| El tope se dice **cuando estorba** | Con cuatro cuentas no hay contador; con cinco, el botón se apaga y explica |
| **Pausar no es archivar** | El pausado conserva su día y su hora, y el botón dice «Reanudar» |
| **320 px** y la **diana táctil de 44 px** | Cuatro pantallas sin desbordamiento horizontal, y `getComputedStyle().height` —no `boundingBox()`, que miente mientras algo se escala (D-177)— sobre botones y campos |

**Dos defectos propios los encontraron estas pruebas** (D-188): los `SelectTrigger` llevaban un `id` a
mano que pisaba el de `FormControl` y dejaba al desplegable **sin nombre accesible**; y un ayudante
esperaba al aviso en vez de al cierre del diálogo, lo que en un bucle de cinco cuentas producía dos
avisos iguales a la vez.

#### Etapa 6 — comprobado en el navegador ✅ (D-192)

* «Copiado», «Grupo abierto» y «Marcado como atendido» **no dicen** que se envió nada (BR-S14):
  prueba por lo que **no** aparece, como la de «boleta» en §4.7. Con el método de esa sección: **no se
  abre WhatsApp en ninguna prueba** —`spyOnWindowOpen`, que devuelve un objeto y no `null`—.
* **375, 390 y 430 px**, además de los 320 que la Etapa 2 ya mide. **Estaban sin medir**, y este era
  el único criterio de la etapa que no se cumplía. No se reescribió el criterio: se midió, sobre las
  **cuatro pantallas** del módulo y **los dos diálogos** —el mensaje con las cuentas al final es el
  bloque más ancho que pinta—. **8/8, sin desbordamiento en ninguno.** Un resultado negativo se
  escribe igual: un ancho intermedio puede romperse donde el estrecho no, porque es donde cambian
  los puntos de corte y una fila pasa de apilada a horizontal.
* Y la regla de `HANDOFF` §1.b: si se toca infraestructura de interfaz compartida, se comprueban
  **las dos** presentaciones. Esta etapa **no tocó ninguna**: su único cambio de código son los
  comentarios restaurados en la `0054` y dos archivos de prueba.

#### Disposición de «Recordatorios de pago» — navegador ✅ (`configuracion-cobro.spec.ts`, +2 · `configuracion-cobro-movil.spec.ts`, +1)

Mantenimiento **solo de presentación** (2026-09-12): el encabezado lleva la única acción de crear y,
desde `lg`, la pantalla va en dos columnas (`ARCHITECTURE` §8.23). **No hay ni un texto ni un dato
nuevo que probar**, así que se mide la **geometría relativa** —qué va encima o a la derecha de qué— y
nunca píxeles fijos, que cambiarían con cualquier ajuste de espaciado sin que nada se hubiera roto.

| Qué se demuestra | Cómo |
|---|---|
| **Un solo** «Crear recordatorio», en el encabezado y a la derecha del título | `toHaveCount(1)` con lista y pendientes; su caja, a la derecha del `h1` y en su franja, a 768, 1024, 1280 y 1440 px |
| Lo pendiente va antes que la lista, con sus tres botones **en una fila y en su orden** | Mismo `y` (±1 px) y `x` creciente: copiar → configurar → atender |
| El teclado recorre la pantalla **en el orden en que se lee** | Desde crear, cada `Tab` cae en copiar, configurar, atender, editar, pausar y archivar |
| Teléfono: crear **a ancho completo**, lo pendiente con sus botones **apilados** y en orden, y la lista | A 390 px, crear mide lo que la sección (±1 px) y cada botón empieza donde acaba el anterior |
| Todo lo que se toca, en la diana de 44 px | `getComputedStyle().height` (D-177) sobre crear, los tres del flujo y las tres acciones de la lista |
| Sin desbordamiento horizontal | `scrollWidth − clientWidth ≤ 0` a 390, 768, 1024, 1280 y 1440; los 320, 375 y 430 ya los medían las pruebas de siempre |

**Lo que esta suite no puede ver, y se midió aparte:** la tarjeta «Avisos en este dispositivo» **no se
pinta sin clave VAPID** (D-190), y la suite corre sin ella. Su sitio —columna lateral desde `lg`, al
final en el teléfono— se comprobó con un servidor levantado con una **clave pública de verificación**
y sus estados forzados en el navegador (`TEST_RESULTS`, misma fecha). Tampoco es infraestructura de
interfaz compartida (`HANDOFF` §1.b): no se tocó ningún primitivo.

### 4.9 Resultados de la semana (BR-H01..BR-H10; D-194, D-195, D-197)

| Suite | Pruebas | Qué demuestra |
|---|---|---|
| `tests/unit/weekly-results.test.ts` | 42 | La semana un domingo, un lunes, un martes y un sábado; cambio de mes, de año y 29 de febrero; 400 días seguidos; qué semana acepta la URL; orden fijo; cero inicial; seis confirmados, uno y varios pendientes, conflicto, rechazado y formato inválido; qué rifa vale; la semana en corto y en largo; el mensaje exacto; ningún «ganador» ni «enviado»; compartir un archivo y guardarlo |
| `tests/unit/weekly-results-image.test.tsx` | 20 | Las medidas reales de Geist Black; nombres de 2 a 120 caracteres que nunca se salen ni pierden letras; el árbol —textos, seis números con sus ceros, siete iconos de lucide, una sola capa de fondo, sin `grid`, sin espacios que Satori pueda partir, determinista y nunca parcial—; y **un PNG real de 1080 × 1350 con `fetch` bloqueado** |
| `tests/unit/weekly-results-view.test.tsx` | **22** (+9, D-197) | Lo que llega en el HTML de cada estado —listo, pendiente, conflicto, sin rifa, sin grupo, enlace de grupo inválido y **error de lectura**—, con los botones desactivados donde toca. **Desde D-197**, el mensaje propio: predeterminado en modo lectura, propio editable con «Volver», texto conservado con el interruptor apagado, **HTML hostil que no llega a ser elemento**, saltos de línea y emojis, editor usable con la semana pendiente, lectura fallida sin editor, y la sección entera con mensaje propio y con esa lectura caída |
| `tests/unit/weekly-results-message.test.tsx` | **32** (nuevo, D-197) | `activeWeeklyResultsMessage`: predeterminado, dinámico por semana, propio, apagar conserva, volver, datos incoherentes, Unicode y ningún marcador. El esquema: vacío, 1.000 exactos y 1.001, recorta antes de medir, emojis más estrictos que la base y sin campos de vendedor ni organización. La lectura (`ready`, vacía, `error`, excepción) con sesión y Supabase sustituidos. Y **la pantalla montada** con `react-dom/client`: copiar y compartir con el mensaje activo, lo escrito sin guardar, encender la primera vez, apagar y recuperar, volver al predeterminado, el vacío que no se manda, guardar con lo que devuelve el servidor, el error del servidor, el fallo de red y la semana pendiente |
| `tests/db/weekly-results.test.ts` | 10 | Las funciones de producción con **sesiones reales**: seis resultados en orden y con ceros, nacionales para otra organización, `anon` sin permiso (`42501`), nunca parcial —pendiente, sin fila, conflicto, rechazado— y la rifa del catálogo, que otro vendedor no puede leer |
| `tests/db/weekly-results-message.test.ts` | **24** (nuevo, D-197) | Las columnas y sus valores sin UPDATE masivo; guardar recortado con saltos de línea y emojis; apagar conserva; vaciar guarda NULL; 1.000 caracteres de PostgreSQL; los dos CHECK con la service role; **la firma sin vendedor** y un identificador colado que no alcanza a nadie; dos vendedores, cada uno con lo suyo; Dueño y Administrador rechazados; **el vendedor padre sin alcance sobre su integrante**; la cuenta desactivada; `anon` y PUBLIC sin `EXECUTE`; `UPDATE` directo bloqueado sobre la propia fila y sobre la ajena; **la auditoría una sola vez**, con actor y valores; y la lectura de producción con sesiones reales |
| `tests/db/catalog.test.ts` | sin cambio de número | La RPC nueva entra en la lista blanca de ejecutables por `authenticated` y en la comprobación positiva, que pasa de 17 a 18 (D-197) |
| `tests/e2e/resultados-semana.spec.ts` | **29** (+8, D-197) | La tarjeta sin pedir la imagen; listo con la imagen 4:5 y el mensaje; la ruta —200 `image/png` de 1080 × 1350 y `private, no-store`, 307 sin sesión, 403 al administrador, 400 con semanas inválidas o en curso, 409 pendiente, sin rifa y desde otra organización—; descargar **los mismos bytes** que la vista previa; compartir el archivo con título y mensaje; cancelar sin aviso; sin soporte para archivos; copiar y su fallo; la imagen que falla y se reintenta; con y sin grupo; teclado —que ahora pasa por el interruptor, el área y «Guardar cambios»—; ningún «enviado». **Y el mensaje propio**: predeterminado inicial en modo lectura; encender, escribir con la vista previa en vivo, guardar y recargar; copiar y compartir con el texto propio en cuanto se guarda, **sin volver a pedir la imagen**; apagar conserva y encender recupera; «Volver al mensaje predeterminado» vacía; el vacío que no se guarda; el tope de 1.000; y con un resultado pendiente, se guarda pero copiar y compartir siguen bloqueados |
| `tests/e2e/resultados-semana-movil.spec.ts` | **4** (+1, D-197) | A 320 px: sin desplazamiento lateral, vista previa en 4:5, dianas de 44 px, pendiente y sin rifa. **Y el mensaje propio** con una palabra de 310 caracteres sin espacios: sin desbordamiento, la fila del interruptor, «Guardar cambios» y «Volver al mensaje predeterminado» de 44 px, y **tocar la fila fuera del interruptor lo cambia** |
| `tests/e2e/security.spec.ts` | +1 ruta | `/seller/settings/weekly-results` entra en `RUTAS_PROTEGIDAS` |

**Lo que estas suites no pueden ver, y cómo se cubrió:**

| Hueco | Cobertura |
|---|---|
| El error de la LECTURA no se provoca desde un navegador | La unitaria de vista, con las lecturas sustituidas |
| El render dentro de un build de producción (I-074) | A mano, sobre `next build` + `next start` contra la base local (`TEST_RESULTS`, 2026-09-13) |
| Si la imagen se PARECE a la referencia | Inspección visual de PNG reales, lado a lado con la referencia (`TEST_RESULTS`) |
| El mensaje propio en la hoja de compartir de un teléfono real, y cómo lo recibe WhatsApp | **Sin cubrir** (D-197): el doble de `navigator.share` comprueba qué texto se entrega, no qué hace el sistema con él |
| El editor del mensaje en modo oscuro | **Sin cubrir** (D-197): en la verificación visual, emular `prefers-color-scheme: dark` no cambió el tema de la aplicación |

⚠️ **Trampa de esta E2E: la CSP no deja hacer `fetch` a una dirección `blob:`** (`connect-src`). Por
eso la igualdad de bytes entre la descarga y la vista previa se comprueba contra el **cuerpo de la
respuesta** del PNG —la única petición que hace la página—, no releyendo la vista previa.

⚠️ **Otra, de D-197: en `next dev` la imagen se pide DOS veces al montar.** El modo estricto de React
(`reactStrictMode: true`) ejecuta el efecto dos veces: la primera petición sale abortada y la segunda
responde 200, 1 ms después. En producción es una. Por eso «guardar no vuelve a pedir la imagen» se
comprueba **comparando antes y después de guardar**, no contra 1. La primera versión de la prueba lo
hizo contra 1 y falló sin que el producto estuviera mal (`TEST_RESULTS`, 2026-09-13).

⚠️ **Y `getByLabel('Mensaje para tu grupo')` resuelve a dos elementos** —medido—: la sección y el área
de texto comparten nombre accesible. Las pruebas buscan el campo con `getByRole('textbox', { name })`.

### 4.10 La cartera es del vendedor (BR-Q01..BR-Q10; D-198)

| Suite | Pruebas | Qué demuestra |
|---|---|---|
| `tests/db/admin-privacy.test.ts` | **29** (nuevo) | Con sesiones reales del Dueño, del Administrador, de dos vendedores y de otra organización. **BR-Q01:** tablas, vistas, comisiones, límites de precio y `audit_logs` no le devuelven cartera al personal. **BR-Q02:** las siete proyecciones devuelven EXACTAMENTE sus claves, el catálogo no declara columnas prohibidas en su `returns table` y ningún valor secreto del escenario aparece en ninguna respuesta. **BR-Q04:** una Abonada es `unpaid` para el personal y `partial` para el vendedor; el filtro se aplica antes de contar y `partial` es un error. **BR-Q05:** buscar el nombre, el teléfono, el correo, el código interno o `12345` responde lo mismo que algo inexistente. **BR-Q06/BR-Q07:** las escrituras directas fallan; las RPC de venta y cobro responden al personal con el mensaje de un vendedor ajeno; anular una vendida da el mismo mensaje sin pagar, abonada y pagada, suelta y en lote; otra organización responde como lo inexistente. **BR-Q03:** editar números e insertar con id propio sin pedir la fila de vuelta. **BR-Q09:** avisos `team.sale` del personal sin `sale_price`, también al ascender a alguien. Y los privilegios de las siete proyecciones y de las dos piezas internas, más la regresión del vendedor |
| `tests/unit/admin-privacy.test.ts` | **17** (nuevo) | Etiquetas de dos estados; el esquema rechaza `partial`; pistas del buscador del personal; sus `whyNot` no nombran abonos, pagos, precios ni saldos; descripciones de reporte por público; frases del importador; recorridos sin «owner-payments» ni dinero. Y la **red estructural**: las rutas retiradas no existen, el menú no las nombra, ningún archivo del portal administrativo importa las lecturas del vendedor, los tipos administrativos no declaran cartera, las Server Actions de la cartera exigen `seller` y el CSV toma el público de la sesión |
| `tests/e2e/privacidad-admin.spec.ts` | **18** (nuevo) | Para el Dueño y el Administrador: lista, detalle, búsqueda por nombre, alias, correo y teléfono **idéntica** a la de algo inexistente, filtro de pago de dos estados con el recuento de la base y parámetros antiguos ignorados, selección y «Ver seleccionadas», menú y direcciones retiradas (404), panel, vendedores, rifas y reportes sin dinero, y CSV. **En cada caso se buscan los valores secretos del escenario en el HTML, la carga RSC y las respuestas de red**, no solo en lo que se pinta. Y la regresión del vendedor sobre la misma boleta |
| `tests/e2e/privacidad-admin-movil.spec.ts` | **5** (nuevo) | Lo mismo en el teléfono: tarjeta y detalle, barra inferior de dos opciones, menú de usuario y direcciones retiradas; y la tarjeta del vendedor |
| `tests/e2e/privacidad-escenario.ts` | — | No es una suite: el escenario compartido —un cliente con todos sus datos, una boleta rebajada y un abono parcial— y la búsqueda de sus valores en lo recibido |
| Suites adaptadas | — | Las que usaban al personal para leer, vender, cobrar, anular o importar pasaron a la sesión del vendedor —o a comprobar que el personal ya no puede— **sin quitar aserciones**. La lista, con el motivo de cada conversión, en `TEST_RESULTS` (2026-09-14) |

**Lo que estas suites no pueden ver, y cómo se cubrió:**

| Hueco | Cobertura |
|---|---|
| Una proyección nueva que olvide la lista blanca | La prueba de catálogo compara el `returns table` de las siete contra las columnas prohibidas |
| Un valor que llegue por una respuesta que la prueba de navegador no provoca | Las RPC y tablas se prueban directamente en `admin-privacy.test.ts`; la E2E cubre lo que cada pantalla pide |
| Que reactivar el acceso funcione | **Sin prueba**: el procedimiento de D-198 exige devolver desde Git las pruebas convertidas (I-119) |

⚠️ **Las RPC dormidas ya no se prueban desde una sesión.** `asProfile` (`tests/db/helpers.ts`) y
`voidPaymentAsStaff` (`tests/e2e/db-setup.ts`) fijan `request.jwt.claims` en una conexión directa para
ejecutar el cuerpo real de `void_payment` o de la importación. Prueban la regla, **no la RLS**.

⚠️ **Buscar una cifra secreta en lo recibido necesita límites.** `23450` puede aparecer dentro de un
uuid o del nombre de un fragmento de JavaScript: `privacidad-escenario.ts` la busca con límites a los
dos lados. Y lo que la prueba escribe —el término de búsqueda, el id de la URL— vuelve en la respuesta
y se excluye a propósito.

⚠️ **Una ruta retirada responde 404 con sesión, y sin sesión redirige al login.** El proxy exige sesión
antes de resolver la ruta, así que desde fuera no se distingue una que no existe.

### 4.11 Premios configurables por rifa (BR-J01..BR-J16, BR-R12; D-199 a D-207)

| Suite | Pruebas | Qué demuestra |
|---|---|---|
| `tests/db/raffle-prizes.test.ts` | **94** (93 + **1** de la corrección de D-203; la Entrega 4 no cambia el número) | **Entrega 4 (D-204):** **J13 carga los SEIS premios confirmados** desde `confirmedRafflePrizes` —ya no el séptimo, «semanal, lunes 14, Cundinamarca, $400.000», que nadie dio— y **J3-03 se identifica como EJEMPLO GENÉRICO**, no un premio de la rifa real; J11 añade a sus internas la operación y las piezas de la transición. **J13 vive en 2054** (D-205, I-128 resuelta): la rifa se activa, y en una rifa activa publicar, archivar y restaurar comprueban las semanas ya empezadas; con las fechas reales de 2026, J13-06 fallaba desde el 2 de noviembre. 2054 tiene el calendario de 2026 y no lo usa ninguna otra suite —2065 es de la transición, que confirma resultados en esas fechas—, y J13 afirma que no le queda ninguna fecha de 2026. Se comprobó con el reloj de la base local simulado antes, durante y después de noviembre y diciembre de 2026. **Corte efectivo (D-203 Decisión 9, J8-03):** publicar en una rifa activa se rechaza —«hora oficial del sorteo»— si una ocurrencia de una semana ya empezada tiene hora original pero **no** oficial, porque su corte ya no se conoce. Con sesiones reales del Dueño, del Administrador, de un vendedor y de otra organización. **BR-J10:** crea y modifica quien tiene la capacidad; el vendedor y otra organización reciben **el mismo mensaje** que ante una rifa inexistente; una cuenta desactivada deja de poder; la política de capacidades de PostgreSQL **se compara rol a rol con la de la aplicación**, y **el resolvedor de la aplicación responde lo mismo que `has_org_capability`** con la membresía real del Dueño, del Administrador y de un vendedor (J1-08); una capacidad inventada es «no» hasta para el Dueño. **BR-J13:** ninguna sesión cambia `prize_mode`, una rifa heredada no admite premios, una configurable sin premios no se activa, acortar las fechas no deja un premio fuera y una rifa cerrada ya no se toca. **BR-J04/BR-J05:** domingo, lotería fija fuera de su día, el ejemplo genérico —número semanal, lunes, Cundinamarca, que no es un premio de la rifa real (D-204)—, varias ventanas, días repetidos, fechas fuera de la rifa y períodos que no incluyen sus días. **BR-J02/BR-J06:** dinero contra especie —también con la service role—, cuatro cifras por defecto y los límites **en el borde**. **BR-J09:** versión nueva, inmutabilidad de la anterior, control optimista con **dos ediciones a la vez**, un guardado sin cambios que no escribe nada y la versión que aplica a un corte. **BR-J08:** dos premios que juegan el mismo día con el mismo número, las mismas cifras y la misma lotería **se rechazan nombrando los dos y el día**; cuatro cifras y últimas tres **conviven**, y el otro número de la boleta tampoco choca. **BR-J02 (D-201):** premio único en dinero, en especie y con las dos cosas; **cuatro alternativas excluyentes** en su orden; `fixed` con más de una y `winner_choice` con una sola rechazados **por la RPC y por un disparador diferido**; alternativas repetidas y más de seis rechazadas; la recompensa de una versión anterior **inmutable**; archivar y restaurar la copian tal cual; cambiar una alternativa o su **orden** avisa. **BR-J15:** la vigencia en el historial. **La configuración de aceptación entera** —los cierres del 27 y el 28 de noviembre, el premio mayor con sus cuatro alternativas y el de tres cifras del mismo día—, que se crea, **activa la rifa** y rechaza los dos cruces si se alargan sus fechas. **BR-J11/BR-J12:** una fila de bitácora por guardado, historial con actor y fecha, borrador sin avisos, rifa activa que avisa **a cada membresía activa menos a quien lo hizo**, reordenar que no avisa y la bitácora del personal sin cartera. Y el catálogo: privilegios, RLS forzada, solo políticas de `SELECT`, índices y la **regresión de D-198** |
| `tests/db/raffle-prize-matching.test.ts` | **50** (40 de la Entrega 3, D-203, y **10** de su corrección, M12) | **M12, el corte efectivo (D-203 Decisión 9, I-125):** sin cambio de programación, el corte es la hora común; **aplazado**, aplica la versión anterior a la hora original y no la publicada entre la original y la oficial; **adelantado**, la anterior a la hora oficial y no la publicada entre la oficial y la original; una versión publicada **exactamente** en el corte no aplica, sin cambio y adelantado; después de buscar, ni otra versión, ni un cambio de programación, ni un reintento alteran la versión enlazada; la defensa rechaza un enlace con una versión posterior al corte efectivo; la rama heredada no cambia en un sorteo adelantado y no necesita la hora original; sin corte **no queda nada escrito** —ni resultado, ni fotografías heredadas, ni enlaces—; **la reproducción de I-125 es M12-04**, por `confirm_lottery_result`; y `raffle_prize_draw_cutoff` dice lo mismo que `prizeDrawCutoff` en cinco casos más una programación inexistente. **El motor**, con premios publicados de verdad por las RPC y sorteos en fechas propias —diciembre de 2082 y semanas de 2083—. **Regresión heredada:** lunes con el diario y cuatro cifras exactas, Boyacá con el semanal, ningún enlace y los avisos contando lo mismo. **Elegibilidad lado a lado:** las mismas boletas —vendida, libre, tardía, pendiente, anuladas antes y después, con y sin aprobación, creada después— dan lo mismo en una rifa heredada y en una configurable, y una configurable en borrador o anulada no participa y una cerrada sí. **BR-J06:** cuatro cifras con el diario y con el semanal, las tres últimas con ceros, los números cortos fuera y **una tabla que compara el motor con `prizeNumberMatches`**. **Calendario:** una fecha, un tramo, días concretos, varias ventanas, día fuera, lotería correspondiente, fija e incorrecta, y **el predicado del motor contra `raffle_prize_rule_dates` en 21 días × 6 loterías**. **BR-J09:** versión anterior al corte, cambio posterior que no altera el sorteo, versión archivada que no juega —y archivada después, que sí—, sorteo aplazado con su corte original y la venta decidida por la hora oficial, y sin hora original **falla sin escribir**. **D-203, prioridad por cliente:** Ana con `1234` y `9234`, Carlos, Beatriz, Diego y una boleta libre; el otro número de otra boleta; cuatro cifras por los dos números a la vez; la identidad **fotografiada**; la prioridad que **no cruza rifas**; y la base rechazando un enlace a mano que rompería la prioridad o una fotografía sin enlace. **BR-J08:** dos premios con la misma firma escritos fuera de las RPC hacen fallar la confirmación **entera** —ni resultado, ni fotografías heredadas— con un detalle sin datos de clientes, y falla aunque ninguna boleta coincida. **Reintento, concurrencia** —la segunda ejecución **espera al cerrojo**, comprobado en `pg_stat_activity`— **y nada de reprocesar**. **Aislamiento y permisos:** cada organización con lo suyo, las FK que impiden enlaces cruzados, lectura del vendedor sí, del otro vendedor, del personal, de otra organización y de `anon` no, nadie escribe —tampoco la service role— y la inmutabilidad frente a PostgreSQL directo. **Después del sorteo:** la fotografía y su premio no cambian si cambian cliente o vendedor, la boleta queda bloqueada y la descartada por la prioridad no. **Volumen:** 5.000 boletas, **los enlaces coinciden uno a uno con `resolvePrizeLinks`** y ninguna función se llama más de tres veces por premio (`pg_stat_xact_user_functions`). **El 21 de diciembre** entero, con los avisos contando boletas **D-207 (`0066`):** el motor ya no es ejecutable por la service role; `buscar` lo corre con `runLotteryEngine` (PostgreSQL directo) y **M8-05** exige que `match_lottery_result` no lo ejecute la service role y `confirm_lottery_result` sí |
| `tests/db/raffle-prize-transition.test.ts` | **51** (38 de la Entrega 4 y **13** de D-206; T3-05, T3-07, T3-08 y T3-09 reescritas) | **D-206, el instante efectivo.** **T1-05b:** la frontera y las cinco piezas nuevas no las ejecuta nadie, y la espera de la `0063` ya no existe. **T2:** después de aplicar con el reloj real, `trasladarInstante` lleva el instante al **1 de septiembre de 2065**: los sorteos de agosto quedan del lado de siempre —T2-16 vuelve a confirmarlos sin cambiar nada— y **T2-17** confirma después uno que llegó **sin resultado** —el equivalente de los 25 de I-127—: sistema de siempre, **sin enlaces**, con su aviso y sin duplicar al repetir. **T3-05:** un resultado sin confirmar, pendiente o en conflicto **ya no detiene** nada —falla el premio que lo incluye— y queda del lado de siempre; **T3-08:** la clasificación entera de la ventana con un instante fijo; **T3-12:** un borrador también espera a un corte desconocido. **T4-03:** un resultado confirmado **mientras la transición no ha terminado espera** al cerrojo y usa los premios. **T6, 2066, la frontera exacta:** el corte **igual** al instante, el sistema de siempre; **un microsegundo después**, solo los premios; aplazados y adelantados a cada lado según `raffle_prize_draw_cutoff`; en los mismos resultados, la heredada compara como siempre y la **nativa** usa sus premios; repetir o confirmar **dos a la vez** no duplica fotografías, enlaces ni avisos; sin hora original no se supone nada; un corte que **cruza** el instante después de resolverse hace fallar el motor sin mezclar; y ningún enlace escrito a mano entra del lado de siempre. **T7, con el reloj de verdad:** una rifa alrededor de hoy con los sorteos de las dos semanas empezadas —uno resuelto antes—: la transición **no espera**, su instante cae dentro de la llamada, la respuesta y la bitácora cuentan los sorteos de siempre, uno de la semana pasada se resuelve con el sistema de siempre y el del martes que viene solo con el premio. **Mutaciones de D-206:** frontera con `<` (4 pruebas la detectan), motor sin el cerrojo de las rifas (T4-03), enrutamiento que ignora la transición (8), aviso de fechas que no excluye a quien cambia (R1-02) y disparador sin comparar las fechas (R2-01 y R3-02). **Hasta aquí, Entrega 4 (D-204):** **La transición de una rifa existente, en la base.** La rifa **equivalente** vive en **2065**, que tiene el calendario de 2026, con la configuración real de `confirmedRafflePrizes` trasladada de año; los sorteos ya jugados, en **2018**: ninguna prueba depende del día en que corre. **T1, la puerta:** ni Dueño, Administrador, vendedor, otra organización ni visitante ejecutan la operación ni cambian el modo con un `UPDATE`; la service role tampoco con un `UPDATE` suelto sobre una rifa activa; nadie lee ni escribe `raffle_prize_transitions` (RLS forzada, sin políticas ni privilegios); las piezas internas no las ejecuta nadie; una fila de **otra transacción** no abre la puerta y el estado parcial se rechaza; por la puerta no se cambian estado ni fechas ni se pasa sin premios. **T2, los seis premios** con boletas vendidas, abonos por la sesión real del vendedor, dos sorteos resueltos con el sistema de siempre y seis sorteos futuros sin resultado: la **vista previa** devuelve los seis con vigencias y sorteos y no deja nada; organización, rifa, nombre, estado o fechas equivocados no cambian nada; la operación la hace, la rifa **sigue activa** con sus fechas y otra rifa sigue heredada; **boletas, clientes, pagos, asignaciones, precios, estados, membresías, fotografías y resultados quedan idénticos** —conteos globales y huella fila por fila—; la configuración guardada es **exactamente** la confirmada, día por día y lotería por lotería; el ejemplo semanal del lunes no está; historial del «Sistema»; **una** fila semántica de bitácora sin nada de la cartera; **un** aviso por membresía activa, ninguno a la inactiva ni a otra organización; los tres roles leen los seis y otra organización ninguno; repetir no escribe nada y otra configuración se rechaza; **el motor encuentra las coincidencias** —el 21 las cuatro cifras mandan sobre las tres por cliente, el 3 y el 7 de noviembre juegan diario y fin de semana, el 5 y el 15 de diciembre los especiales, y el 30 de noviembre la rifa convertida no coincide mientras la heredada sí—; y volver a confirmar un sorteo anterior no cambia sus fotografías. **T3:** premios sueltos en una rifa heredada, un conflicto que deshace también lo ya escrito, un sorteo ya jugado, un sorteo **adelantado** jugado, un resultado **sin confirmar, pendiente o en conflicto**, una hora oficial desconocida, varios pendientes con su lista, la **clasificación con un instante fijo**, un cancelado que no cuenta, rifas cerradas, anuladas o nacidas configurables, y un borrador que la hace sin avisos. **T4:** un intento fallido no deja nada y **dos a la vez** se serializan. **T5:** los espejos de loterías y estados. **Mutaciones:** puerta sin `xact_id` (1 prueba la detecta), sin sorteos pendientes (4), corte solo con la hora original (1) y reintento sin huella (3) |
| `tests/unit/raffle-prize-transition-guard.test.ts` | **26** (nuevo, Entrega 5, D-205) | **La puerta del script contra producción, pura.** El destino se dice siempre y es uno; una opción desconocida, repetida o sin valor se rechaza en vez de ignorarse; aplicar en producción exige a la vez la huella de una vista previa anterior, `--apply` y el identificador de la rifa **exactamente** igual —ni mayúsculas ni espacios—; sin `--apply` la huella y la confirmación sobran; `--production` contra la base local, `http`, `localhost` o un dominio que no es `*.supabase.co` se rechaza; el nombre del destino no escribe la dirección del proyecto; una huella distinta no aplica nada; un SQLSTATE es un rechazo cierto y la red, una pasarela o la clase `08` dejan la duda; y **ningún identificador de producción** vive en el script ni en la puerta, que se consulta antes de resolver el destino. Cuatro mutaciones de la puerta —sin confirmación, sin `supabase.co`, sin comparar la huella y toda respuesta cierta— las detecta **una prueba cada una** |
| `tests/unit/raffle-prize-transition.test.ts` | **32** (30 de la Entrega 4 y **2** de D-206) | **D-206:** la vista previa cuenta los sorteos que conservan el sistema de siempre, con y sin resultado y con las fechas ordenadas —«ninguno», uno solo y todos confirmados incluidos—, no pinta instante en la vista previa y, aplicada, dice «Premios configurables desde» en hora de Bogotá; ningún texto nuevo dice `configurable` ni «ganador». **Entrega 4:** **La configuración confirmada, pura:** son seis y en su orden; el ejemplo del lunes no está y sigue siendo un calendario válido; importes, número, cifras, categoría y alternativas exactos; el diario hasta el 27 y el de fin de semana hasta el 28 sin llegar a diciembre, sin un solo conflicto entre parejas; el principal es **uno** con cuatro alternativas; cuatro y tres cifras el 21; los nueve días del millón semanal; el 15 con Cruz Roja como lotería correspondiente; una transición tardía deja solo los días que quedan; un cancelado **parte** el período; y lo que necesita una decisión del dueño lanza `TransitionPlanError`. **Desde qué sorteo empiezan:** antes y después de la hora de hoy, la hora exacta del corte, un sorteo adelantado ya jugado, sin programación, cancelados, una rifa que aún no empieza y ningún sorteo pendiente. **La vista previa y el aviso:** qué dice, cada premio entero, aplicada, repetida, un borrador que no avisa, sin «ganador» ni palabras del código, y el aviso único en singular, plural y sin datos |
| `tests/db/raffle-date-notices.test.ts` | **12** (11 de D-206 y **1** de su corrección, `0065`; R1-02 reescrita) | **El aviso de las fechas de una rifa activa, en la base.** El sistema extiende el fin: **un aviso por membresía activa**, ninguno a la inactiva ni a otra organización, un solo evento y la bitácora con cuántos salieron. **Con la sesión del Dueño (R1-02), a TODAS las membresías activas, también a él**, sin duplicados, con él como actor de cada aviso y de la bitácora —`raffle.update` solo con la fecha que cambió y `raffle.dates_change`—; **con la del Administrador (R1-04), igual**, y él lee el suyo con su sesión; cada quien lee **solo el suyo**; un vendedor no puede cambiarlas. **Cuándo no:** guardar las mismas fechas —el reintento de la pantalla—, cambiar otra cosa, un borrador, una rifa cerrada o una que se cierra en el mismo cambio. **Atómico:** un cambio que rechaza el disparador de premios no deja aviso, y uno deshecho tampoco; **dos cambios iguales a la vez** dan un solo evento; dos distintos, dos; y el índice único rechaza un duplicado del mismo evento. **Lo que dice:** exactamente la rifa y las fechas, nada de la cartera, y el texto de la campana. **Mutación de la corrección:** volver a excluir al actor hace fallar R1-02 y R1-04 |
| `tests/db/prize-function-privileges.test.ts` | **15** (nuevo, D-207, `0066`, I-132) | **Quién ejecuta cada función de premios.** **P1:** las funciones que crean o redefinen `0058`–`0065`, leídas de los archivos, son **exactamente** las 62 de `scripts/prize-function-grants.ts`; su `EXECUTE` efectivo para PUBLIC, anon, authenticated y service_role es el de la lista; la service role ejecuta solo `transition_raffle_prize_mode`, `confirm_lottery_result` y `admin_audit_log` (de las **nuevas**, solo la transición); las tres comprobaciones de `verify:remote` pasan, y **fallan si reaparece cualquiera de los 35 permisos** del preflight, uno por uno. **P2:** `raffle_prize_insert_version`, `raffle_prize_notify` —también por la API— y las 53 internas dan **42501** como anon, authenticated y service_role; la transición, 42501 desde una sesión; las seis RPC y el motor, 42501 con la service role. **P3:** las seis RPC del panel funcionan con la sesión del Dueño; `confirm_lottery_result` con la service role confirma y el motor encuentra la boleta; la vista previa y la aplicación de la transición funcionan. **P4:** las seis tablas conceden exactamente lo de sus migraciones y ninguna función de la entrega tiene PUBLIC ni anon. Pasa igual con los privilegios por defecto locales y con los de producción (`TEST_RESULTS`) |
| `tests/unit/raffle-dates-notification.test.ts` | **7** (nuevo, D-206, BR-R12; F7 reescrita en la corrección) | El texto del aviso: fin, inicio, las dos —en el mismo año, cruzando de año y un solo día—, datos incompletos o raros sin inventar fechas, y nada de la cartera ni enlace. Y la pantalla de editar: la frase **solo** con la rifa activa y una fecha distinta de la guardada, y dice que avisará **a todas las personas, también a quien guarda** —nunca «las demás»— |
| `tests/unit/dates.test.ts` | **+3** (D-206) | `formatLongDateRangeEs`: mes y año una vez, dos años al cruzar, un solo día y el primero del mes sin restar un día (I-017) |
| `tests/e2e/rifa-fechas-aviso.spec.ts` | **4** (3 de D-206 y **1** de su corrección, `0065`) | Rifas de **2063**, borradas al final con sus avisos y su bitácora, y una membresía **inactiva** que crea la prueba y también borra; cada fecha se escribe **cuando React ya hidrató el campo** —antes, la hidratación repone la guardada (§5.3)—. La pantalla de editar una rifa activa **no dice nada** hasta cambiar una fecha, dice que avisará **a todas las personas, también a quien guarda**, lo retira al volver a la guardada, y guarda como **Dueño**. **Después, en la base:** exactamente **un aviso por membresía activa** —el Dueño, el Administrador y cada vendedor activo, uno cada uno—, **ninguno** a la inactiva ni a otra organización, **un solo evento**, el Dueño como actor de todos y la bitácora a su nombre: `raffle.update` solo con `end_date` y `raffle.dates_change` con el evento y cuántos salieron. **En la campana:** el Dueño que guardó, el Administrador y el vendedor leen **un** aviso cada uno. Un borrador no anuncia nada. **Mutación:** volver a excluir al actor hace fallar la segunda y la tercera |
| `tests/e2e/premios-transicion.spec.ts` | **4** (nuevo, Entrega 4, D-204) | Una rifa heredada activa de **2071** —calendario de 2026—, convertida con la service role y **borrada al final**: el panel del Dueño enseña los **seis** premios con sus importes, alternativas, calendarios y loterías y el aviso de rifa activa; la revisión dice «Esta rifa ya está activa.» y no ofrece activarla; el historial dice «Por Sistema»; y la campana del vendedor tiene **un** aviso «Cambiaron los premios de … para los próximos sorteos: ahora tiene 6 premios.» |
| `tests/unit/raffle-prizes.test.ts` | **84** (70 + **9** de D-203 + **5** de su corrección) | **`prizeDrawCutoff` (D-203 Decisión 9):** sorteo normal, aplazado, adelantado —el caso de I-125—, versión publicada exactamente en el corte, y `null` si falta una hora o no se puede leer. El calendario puro —un día, un rango, una recurrencia, varias ventanas, forma canónica y solapes—, la semántica de `0046`, `046`, `1046` y `46`, la prioridad de cuatro cifras sobre tres, **qué versión aplica a un sorteo**, el resumen en español —incluida la frase exacta del encargo—, los esquemas **sin organización, actor ni rol** y con las cifras en cuatro por omisión y el texto del aviso, que no lleva clientes ni precios y no enlaza a ninguna pantalla. **D-203:** la prioridad **por cliente** —Ana pierde el de tres cifras de su otra boleta y del otro número, otro cliente lo conserva, dos clientes no se mezclan, una boleta sin cliente es su propia unidad, no cruza rifas y no depende del orden—, `prizeClaimantKey` y `PrizeSignatureConflictError` cuando dos premios traen la misma firma |
| `tests/unit/raffle-prizes-panel.test.ts` | **17** (nuevo, D-202) | Lo puro que añade la pantalla: el **esquema del formulario** —uno solo para crear y para publicar, sin identificadores—, que las aclaraciones vacías **se omiten** en vez de viajar como `null`, **qué impide activar** una rifa (sin premios, fechas fuera, conflicto dicho **una** vez y la convivencia de cuatro cifras con tres), con qué control se vuelve a pintar cada período, y que ningún texto nuevo escribe «ganador», «eliminar» ni «borrar» |
| `tests/unit/capabilities.test.ts` | **18** (nuevo, corrección de D-202) | **El resolvedor central** (`hasCapability`): el Dueño tiene todo el catálogo, el Administrador la capacidad de premios y el vendedor nada, y es asíncrono. **La guarda** le pasa la **misma membresía** de la sesión, y con `roles` rechaza a un rol de fuera **sin consultarlo**. **`createRaffle`**: Dueño y Administrador crean la rifa configurable en su organización; el vendedor se rechaza antes de abrir la base; y sin la capacidad responde con la frase de la base. **Reemplazar el resolvedor basta**: con otra política —un Administrador sin la capacidad— `createRaffle` y `archivePrize` obedecen sin tocar una línea suya. Y **la estructura**: solo `lib/auth` lee la política por rol, todo el que nombra una capacidad la resuelve con la guarda o el resolvedor, y `createRaffle` y las seis acciones de premios usan `authorizeCapability` |
| `tests/unit/prize-history-retry.test.tsx` | **6** (nuevo, corrección de D-202) | El diálogo **montado de verdad** con la acción sustituida: primera lectura fallida → «Reintentar» → el aviso se va y se ve la espera → segunda lectura correcta → el historial **sin duplicados** y pidiendo **la misma página**. También: la acción que **lanza** (sin conexión), un segundo fallo, **repetir la página 2** después de cambiar de página, conservar la página anterior mientras llega otra y **descartar la respuesta** de una petición anterior. Contra el componente anterior fallan 5 de las 6 |
| `tests/unit/raffle-activation.test.tsx` | **11** (10 de la corrección de D-202 y **1** del cierre visual, I-124) | `draftActivation` y el detalle montado: un borrador **configurable no presenta «Activar rifa»** y **presenta «Revisar y activar»** hacia `/review`; un borrador **heredado conserva «Activar rifa»** con su confirmación y llama a `changeRaffleStatus`; sin la capacidad no hay ninguna de las dos; y las demás transiciones —cerrar, anular, **reabrir solo el Dueño**— no cambian. **Cierre visual:** el aviso de activar, cerrar, reabrir y anular dice **«quedó»** con tilde y ninguno vuelve a escribir «quedo» (I-124) |
| `tests/unit/lottery-dashboard.test.ts` | **+2** (1 de D-203 y **1** de su corrección) | Una boleta que coincide con **sus dos números** —dos fotografías— se enseña y se cuenta **una vez** en el recuadro del Panel. **I-126:** sin coincidencias, el recuadro dice «Ninguna de tus boletas coincidió con este resultado.» y «Ninguna boleta coincidió con este resultado.», y ningún texto del recuadro dice «con este número» |
| `tests/unit/lottery-notifications.test.ts` | **12** (7 + **5** de la corrección de D-203, I-126) | Los tres avisos de un resultado con su **texto exacto** —asignada, disponible y personal— y los casos que la corrección hizo posibles: varias vendidas con «Una de ellas es de …», vendidas y disponibles juntas en singular y en plural, varias disponibles, el aviso del personal que **calla el grupo que vale cero**, y un barrido que falla si algún aviso dice «con este número», «ganador», «ganadora», «premiada», «cuatro cifras» o «número exacto» |
| `tests/e2e/loterias-panel.spec.ts` | Sin pruebas nuevas (I-126) | La prueba del vendedor sin coincidencias espera ahora «Ninguna de tus boletas coincidió con este resultado.» |
| `tests/unit/raffle-edit-origin.test.tsx` | **9** (nuevo, corrección de D-202) | El origen de la edición es una **lista cerrada**: una URL externa, `//…`, `javascript:` o una ruta escrita a mano vuelven al detalle; el destino se compone con el id de la rifa. Y el formulario montado: **desde los premios**, guardar y cancelar vuelven a los premios; **desde el detalle**, al detalle; con historial dentro de la aplicación, cancelar vuelve atrás, como la flecha |
| `tests/e2e/premios.spec.ts` | **17** (11 de D-202 y 6 de su corrección) | Con la sesión real del Dueño y del Administrador: crear una rifa configurable que **queda en borrador**; un premio en especie, uno **mixto** y el **premio mayor con cuatro alternativas**, con su frase entera; editar y ver el **historial** con su versión vigente; archivar y restaurar; ordenar con «Subir»; un **conflicto** que nombra el otro premio y el día, y que con las últimas tres cifras **sí** se puede; la revisión que **no deja activar sin premios** y que activa cuando todo está bien; una rifa **cerrada** en solo lectura; una rifa **heredada** sin configuración; que un vendedor no llega. **Corrección:** el detalle de un borrador configurable **no ofrece «Activar rifa»** y lleva a «Revisar y activar», que sin premios bloquea; un borrador **heredado** —preparado con la service role— se activa y se anula como siempre; corregir los datos **desde los premios** vuelve a los premios al guardar y al cancelar, también con una carga directa; **desde el detalle**, al detalle; y un `from` escrito a mano no decide el destino |
| `tests/e2e/premios-loteria-fija.spec.ts` | **6** (cierre visual de la Entrega 2, I-123) | Una por ancho —**320, 375, 390, 430, 768 y 1280 px**—, con el viewport fijado en el proyecto de escritorio: con «Una lotería fija» y ninguna lotería elegida, «Elige la lotería con la que juega el premio.» **se lee entera** —cabe en su zona a lo ancho y a lo alto, nada queda escondido por `overflow`, sin puntos suspensivos ni letra encogida—, **sin desplazamiento lateral** del documento ni del diálogo, diana de **44 × 44** en el teléfono y, desde `sm`, **una sola línea** con el alto del desplegable vecino. La rifa y el premio se preparan una vez por las RPC; cada ancho cancela sin guardar. Contra el componente anterior **falla a 768 y 1280 px** |
| `tests/e2e/premios-movil.spec.ts` | **7** (3 de D-202 y 4 de su corrección) | Lo que solo se ve con un ancho de verdad: cada premio es una **tarjeta** y la tabla no se ve, **cero desbordamiento** del listado a 320, 375, 390 y 430 px, y el formulario se guarda con el pulgar a 320. **La comprobación parametrizada** recorre, en **los cuatro anchos** y sin guardar nada, el **formulario completo** —el premio mayor con **cuatro alternativas** y **tres períodos**—, el **historial**, las confirmaciones de **archivar** y de **activar**, y la **revisión**: ni el documento ni el diálogo se desplazan de lado, ningún control se sale del diálogo, **toda diana mide 44 × 44** —botones, enlaces, desplegables, campos y las etiquetas de los días— y las acciones principales **caben enteras en la ventana**. Encontró I-122. Sustituye a la que medía solo la revisión a 320 px |

**Las trampas que costaron una pasada en rojo, y que valen para cualquier suite de premios:**

1. **Dos premios no pueden compartir un día con la misma regla de juego** (BR-J08, D-201). Y la
   recompensa **ya no los distingue**: hasta la `0059` bastaba con cambiar el importe, y desde la
   `0059` eso es exactamente lo mismo que un cruce. Aquí cada premio juega **su propio día** —un
   contador los reparte a partir de `futureMonday + 70`, lejos de las fechas escritas a mano— y las
   pruebas que necesitan el choque fijan el calendario. Cambiar esto rompe media suite de golpe.
2. **La programación de loterías es NACIONAL.** Un sorteo sembrado como `cancelled` para probar
   BR-J05 afecta a **todas** las rifas, no solo a la de esa prueba: va en una fecha lejos de la
   ventana común y se borra en cuanto se comprueba.
3. **Un disparador de restricción diferido no salta hasta el COMMIT.** La prueba que comprueba que
   ni la service role puede dejar un «Premio único» con dos alternativas tiene que **confirmar la
   transacción**: con un `rollback` la inserción parece haber pasado y la prueba miente.
4. **El listado de premios tiene DOS caras y las dos están en el DOM** (D-202). En el proyecto de
   escritorio la tarjeta del teléfono existe pero está **oculta**, así que `getByText(...).first()`
   resuelve a un elemento invisible y la prueba se cae sin que nada esté mal. Las aserciones de
   escritorio miran `getByRole('table')`; las del teléfono, `getByRole('article')`.
5. **Una rifa nueva ya no se activa en dos clics** (BR-J16). Cualquier prueba que necesite una rifa
   activa pasa por `createRaffleWithPrize` (`tests/e2e/fixtures.ts`), que recorre los tres pasos. Y
   la fecha inicial que reciba **no puede caer en domingo**: es el período que trae el primer premio.
6. **Un diálogo no desborda el DOCUMENTO aunque se desplace de lado por dentro** (I-122). Es `fixed`
   y tiene su propio `overflow`, así que `document.scrollWidth` da cero con el contenido recortado a
   la vista. Se mide `scrollWidth - clientWidth` **del diálogo** y que ningún control se salga de su
   caja; y la causa hay que medirla, no suponerla: la primera hipótesis de I-122 era la fila de las
   alternativas, y el desbordamiento siguió **idéntico** hasta arreglar también los desplegables.
7. **El HTML de una página contiene su propia URL**: Next la guarda en el estado del enrutador. Buscar
   en `page.content()` el valor de `?from=` para probar que no se usa da un rojo falso; se comprueba lo
   que importa —ningún enlace apunta ahí y cancelar lleva al destino compuesto—.

⚠️ **La limpieza no puede ser un `delete` normal.** Las versiones y sus períodos son inmutables
también para la service role, y no hay privilegio de `DELETE`: el `afterAll` borra por PostgreSQL con
`session_replication_role = replica` dentro de una transacción. Sin eso, cada pasada dejaría premios,
avisos y bitácora.

**Lo que estas suites no pueden ver, y cómo se cubrirá:**

| Hueco | Cobertura |
|---|---|
| ~~La pantalla de premios~~ | **Existe** desde la Entrega 2 (D-202): `premios.spec.ts` y `premios-movil.spec.ts` |
| ~~Que el motor use estos premios~~ | **Existe** desde la Entrega 3 (D-203): `raffle-prize-matching.test.ts`, 40 pruebas de base de datos, **50** desde su corrección |
| ~~Que el motor respete que dos premios no se acumulan~~ | **Probado** (D-203): dos premios con la misma firma, escritos fuera de las RPC, hacen fallar el motor entero (M6-01, M6-02) |
| Un premio en pantalla para vendedores o clientes | **No existe** y no es de esta entrega. Ninguna prueba de navegador del motor: la confirmación la hace el tick, sin sesión, y el Panel sigue leyendo lo mismo |
| ~~Un sorteo **adelantado** con un cambio de premio entre que se juega y su hora original~~ | **Probado** desde la corrección de D-203 (Decisión 9): el dueño decidió el corte `least(original, oficial)` y la reproducción de **I-125** es **M12-04**, con el resto de la suite M12 y J8-03 |

**Dos trampas de la frontera (D-206), para cualquier suite que transforme rifas:**

1. **Con el reloj real, todo sorteo de un año de prueba cae DESPUÉS de la transición.** Para ver el
   motor a los dos lados, la suite aplica con el reloj real y después traslada `effective_at` como
   superusuario con `session_replication_role = replica` (`trasladarInstante`). T7 hace lo contrario
   —fechas de verdad alrededor de hoy— y por eso solo fallaría si corriera justo al pasar del domingo al
   lunes.
2. **Una CTE que llama a una función puede evaluarse una vez POR FILA.** PostgreSQL integra en la
   consulta una CTE que no está materializada, y la frontera de la defensa de las fotografías se llamó
   **114 veces** con 5.000 boletas hasta marcarla `materialized`: lo detectó M10-01, no ninguna prueba
   de la transición.

**Tres trampas del motor (D-203), para cualquier suite que confirme resultados:**

1. **El motor mira TODAS las rifas que participan en una fecha**, de todas las organizaciones. Dos
   escenarios con fechas cruzadas se contaminan: `raffle-prize-matching.test.ts` reparte **semanas
   propias de 2083** —diciembre de 2082 es del caso del 21— y ninguna otra suite usa esos años.
2. **Una fotografía de una rifa configurable se escribe con su enlace en la MISMA sentencia.** Los dos
   disparadores de comprobación son de sentencia: una prueba que inserte una fotografía a mano y el
   enlace en otra sentencia recibe un error, y eso es lo esperado.
3. **Para saber si algo se llama por fila, cuenta llamadas, no milisegundos.** `set local
   track_functions = 'all'` y `pg_stat_xact_user_functions` dentro de la misma transacción dicen
   cuántas veces se ejecutó cada función; con más de cien enlaces, una por fila saltaría a la vista.
   Y **una mutación que no hace fallar nada puede ser equivalente**: quitar el filtro de pendientes de
   la rama configurable no cambia nada, porque el bloque de aprobación ya las excluye.

### 5.3.b La diana táctil de un diálogo (`dialogos-diana-tactil.spec.ts`, 7 pruebas)

**No es lo mismo que `dialogos-alcanzables.spec.ts`, y por eso son dos archivos.** Aquella comprueba
que la acción final **se pueda alcanzar** —geometría de alto y desplazamiento dentro del diálogo—;
esta, que **se pueda acertar** —geometría de diana—. Un diálogo puede tener su botón perfectamente
visible, centrado y habilitado, y aun así ser un objetivo de 36 px para un pulgar.

**Se mide `getComputedStyle().height`, NUNCA `boundingBox()`**, y esto costó una vuelta entera al
resolver I-102. La caja del navegador devolvía **43,07 px** sobre un botón que la hoja de estilos
dejaba en 44: `AlertDialogContent` entra con `zoom-in-95`, así que mientras dura la animación la caja
mide el fotograma y no el contrato. Por la misma razón, un `h-9` medía «35» y no 36 — que es de donde
salió la cifra equivocada de I-102. La altura calculada es exacta y estable.

**Se miden TODOS los botones del diálogo, no solo el de confirmar.** «Cancelar» es el que pulsa quien
se arrepiente, y fallar ese toque delante de una acción destructiva es el peor caso de los dos.

**Cubre las DOS familias de diálogo, porque se arreglaron de formas distintas** (D-177, D-178).
`AlertDialog` trae el suelo en el primitivo, así que basta con vigilarlo; `Dialog` lo adopta pantalla
por pantalla, así que es donde de verdad hace falta una prueba que mire desde fuera — el día que
alguien añada un diálogo nuevo y se olvide, esta suite es lo único que lo dirá. Se miden **todos** los
botones del pie **y la «X» de la esquina**, que `getByRole('button')` incluye: era la diana más
pequeña de la aplicación.

**La suite tiene dos mitades y las dos hacen falta.** A 320 px se exige el suelo de **44**; a 1280 se
exige lo contrario —que el botón **no** haya crecido— porque `touch` es `h-11 sm:h-9` y el sistema de
diseño libera el suelo por encima de `sm` a propósito. Sin la segunda mitad, «subir la diana» podría
convertirse en «engordar la aplicación» sin que nadie se enterara. El viewport se fija con
`test.use()` en vez de usar el proyecto `movil`, por lo mismo que explica la otra suite: lo que se
mide es geometría, no emulación táctil.

### 5.3.c Que un diálogo PERMANEZCA (`whatsapp-modal-persistencia.spec.ts`, 4 pruebas)

**La dimensión que faltaba era el tiempo.** Existían pruebas de que `Escape` y el clic fuera no
cerraban el diálogo de éxito, y **las dos pasaban** mientras el defecto estaba vivo: el modal
desaparecía a los pocos cientos de milisegundos, después de que la aserción hubiera pasado (I-105).
Una prueba que comprueba un estado **en un instante** no dice nada sobre si ese estado **permanece**.

Por eso estas esperan de verdad —15 s, comprobando cada 3— y lo hacen en los **dos** flujos. El de la
boleta es además el caso importante: no hace falta provocar ningún refetch, porque **la propia venta
lo dispara**; si el diálogo sigue ahí después, es que ya no depende de la sección que la venta borra.
Y se comprueba que la venta **sí** ocurrió detrás —«Asignada», y el botón de asignar ya no está—,
para que «sigue abierto» no pueda pasar por no haberse refrescado nada.

**Regla general que deja esta suite:** cualquier requisito de la forma «esto tiene que seguir ahí»
necesita una prueba con tiempo dentro. Comprobarlo justo después de la acción es comprobar otra cosa.

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

### 4.12 Historial de premios ganados (BR-J17..BR-J23, BR-I16; D-208)

`tests/db/prize-award-history.test.ts` — **70** pruebas, migraciones `0067` a `0072`, **solo en local**.

**Dos rifas, porque los dos orígenes viven en lados distintos de la frontera de D-206.** `R_MOTOR` nace
configurable y juega en **2087**, así que el motor escribe enlaces a premios. `R_HISTORICA` es una rifa
que ya existía y pasa a configurable **por el mismo camino interno que la transición de verdad**
(`raffle_prize_transition_apply`), con sorteos **ya jugados**: su corte es anterior al instante efectivo,
conservan el sistema de siempre y el motor **no puede** premiarlos nunca. Es la situación exacta de los
dos casos reales.

**Las fechas se calculan, no se escriben.** `R_HISTORICA` necesita a la vez sorteos pasados —para que su
corte quede del lado de siempre— y un premio que juegue en el futuro —la transición no admite un
calendario con sorteos cuyo corte ya pasó—, así que su ventana son **tres semanas alrededor de hoy**, con
sus 18 fechas programadas, recalculadas en cada corrida. Es la lección de **I-128**: una fecha escrita a
mano caduca. Y la **limpieza es por prefijo y corre al empezar y al terminar**, porque
`lottery_draw_schedules` es nacional y única por lotería y fecha: un resto de una corrida abortada
bloquearía la siguiente.

| Grupo | Qué comprueba |
|---|---|
| **H1** (3) | Una boleta vendida a tiempo con su enlace entra, con el importe de **su versión** y con la boleta **sin pagar**; una libre y una tardía **no entran** aunque el motor las fotografíe; las alternativas **no inventan importe** y **no multiplican filas** |
| **H2** (8) | La vista previa dice qué se reconocería y **no escribe**; los dos premios de $500.000 suman **$1.000.000** y son **dos clientes**; repetirlo **no duplica**; el respaldo se guarda y el actor técnico queda en «Sistema»; **entera o nada** con una entrada mala; un sorteo que ya premió el motor se rechaza **y la defensa de la base lo impide aunque el cargador se equivoque**; un reconocimiento **no se modifica ni se borra** |
| **H3** (3) | Los dos orígenes se **agregan** sin duplicarse; premios y clientes distintos se cuentan **por separado**; los filtros y la paginación **no recortan** los totales |
| **H4** (4) | Cambiar el importe del premio de hoy **no mueve** el histórico; renombrarlo **no cambia** el título declarado; un resultado que entra en **conflicto** conserva el premio, no mueve los totales y queda **marcado**; anular un reconocimiento lo saca del historial **sin borrarlo** |
| **H5** (8) | Los números no cambian por la RPC del personal ni con PostgreSQL directo; una boleta **sin** coincidencias sí se corrige; con una edición **en vuelo** la escritura del motor **espera** —desde la Etapa 3 lo **observa** con `pg_blocking_pids` y deja terminar al motor; antes lo deducía de un `statement_timeout` de 3 s—; los **dos** disparadores existen y uno es **diferido**; una fotografía **incoherente no se puede escribir** (`0068`); `numbers_changed` sigue marcando una fotografía **heredada** incoherente; y el número viejo movido al **otro campo** ya no esconde la discrepancia |
| **H6** (7) | Otro vendedor de la misma organización **no ve nada**; tener equipo **no concede** el historial de los integrantes —se lee la definición de la función—; otra organización no ve ni una fila; el personal recibe el historial **sin un solo dato de cliente** —se recorren las claves de cada fila y se buscan el identificador y el nombre—; sí ve al vendedor y sus recuentos; ni el vendedor ni el personal pueden llamar al cargador; `anon` no alcanza ninguna de las cuatro lecturas |
| **H7** (5) | Las **15** funciones de `0067`, `0068` y `0070` están clasificadas y su EXECUTE es **exactamente** el de la lista; toda función que crean las migraciones `0067` a `0072` está en la lista **y ninguna más**; **H7-05** (Etapa 3, I-143): toda función que la lista le niega a `service_role` tiene, **después de su última creación**, un `revoke` que lo nombra —es lo único que se puede comprobar en local de lo que pasará con el privilegio por defecto del proyecto alojado, que concede `EXECUTE` a `service_role` en toda función nueva (I-132)—; **falló** con `current_seller_org_ids()` antes de la `0072`; la tabla tiene RLS forzada y concede **solo `SELECT`**; y nada de la suite tocó abonos, asignaciones ni movimientos de comisión |
| **H8** (8) | La corrección de la Etapa 1: la unicidad es de lo **vigente** y no de la historia; se reconoce, se **anula** y se vuelve a reconocer con otro importe, quedando las dos filas y **un** premio en el historial; dos vigentes del mismo premio son imposibles; un reintento idéntico dice «ya estaba» y no duplica; una petición con **otro importe** se rechaza nombrando **las dos cifras** y no escribe; un **duplicado dentro de la petición** se rechaza; la vista previa anticipa **límites** y **ambigüedad por título** —solo cuentan los premios vigentes—; y **dos ejecuciones a la vez** se serializan: una reconoce, la otra ve lo escrito, y queda **una** fila. **Desde la Etapa 3** la primera deja su transacción abierta y se **observa** que la segunda la espera: antes se lanzaban a la vez y se confiaba en que coincidieran —sin el cerrojo fallaba 5/5, pero por coincidencia de tiempos—; ahora falla 5/5 por construcción |
| **H9** (6) | La autorización, con **sesiones reales**: el vendedor activo ve lo suyo por la función **y** por la tabla; el **mismo perfil ya Administrador** no ve nada por ninguna de las dos, y lee su historial por la proyección del personal **sin cliente**; un vendedor **desactivado** no ve nada; el **padre** no ve el historial de su equipo; y otra **organización** tampoco. **H9-07** (Etapa 3, `0070`): el personal obtiene en `admin_prize_award_sellers` a quien vendió y hoy es Administrador —solo perfil y nombre—; una fotografía sin premio no pone a nadie en la lista; un vendedor, otra organización y `anon` no la reciben. **Crea sus propios vendedores**, porque ascender a alguien tiene un efecto irreversible sobre sus avisos |
| **H10** (2) | La **carrera determinista** de I-134: con la edición confirmada primero, el motor **no deja una fotografía incoherente** —falla al confirmar y no escribe—, y se comprueba el estado final de **las dos** operaciones; y sin edición de por medio, el motor fotografía con normalidad. **Sin esperas fijas** (Etapa 2): la prueba sigue solo cuando `pg_blocking_pids` dice que la conexión del motor está bloqueada por la de la edición, con un plazo de 10 s, y la limpieza suelta la edición, espera la consulta del motor y cierra las dos conexiones pase lo que pase |
| **H12** (3) | La **cobertura** cuenta solo lo que pudo dar un premio (`0069`, I-138): en una semana que ninguna otra rifa cubre —se comprueba—, un sorteo cancelado, uno suspendido y los de rifas en borrador o anuladas **no** son pendientes; el de una rifa activa y el de una cerrada, sí (+2 de seis). Y un sorteo con resultado confirmado deja de serlo. **Falló con la `0068`** (+6) antes de escribir la corrección. **H12-03** (Etapa 3): un sorteo **ya jugado** con un premio reconocido de $500.000 cuyo resultado entra en conflicto **vuelve a contar** como pendiente, y el premio **se queda** con su importe, marcado —es lo que el aviso de la pantalla tiene que poder explicar—. Elige un sorteo que la cobertura **cuenta** —programado, jugado y cubierto por una rifa que participa—, en un orden fijo, y **demuestra** que lo cuenta antes de seguir: su primera versión tomaba «el primero que saliera», que a veces era uno de los que H12-01 crea para **no** contar, y falló una vez sin que nada estuviera mal. **H13** (6, Etapa 3): la **matriz de acceso por PostgREST** —vendedor propio, otro vendedor, Dueño, Administrador, quien pasó a Administrador, otra organización (Dueño y vendedor), vendedor desactivado y `anon`, contra las cinco lecturas, la cobertura, el inicio y las tres tablas—; las funciones internas y el cargador inalcanzables desde cuatro sesiones; ninguna escritura sobre las tres tablas; **seis pares ajeno/inexistente idénticos**; y un plan **reutilizado** no le abre `prize_award_history_start` a `anon` (`0071`, I-141) |
| **H11** (6) | El **contrato de lectura** de la Etapa 2: la lectura trae campo, número fotografiado, premio, recompensa y alternativas; el origen **declarado** no presenta las condiciones de hoy como históricas; un premio de alternativas **no multiplica filas**; el personal recibe lo mismo **sin cliente**; el **inicio operativo** lo garantiza la base y no un filtro de la URL; y la **cobertura pendiente** la calcula la base |

`tests/unit/prize-awards-declared.test.ts` — **6** pruebas sobre los dos casos confirmados: son dos, del
Premio diario, suman $1.000.000, ninguno tiene el valor pendiente, sus números son **texto** con sus
cifras (BR-N03), el respaldo nombra el **rol** y dice que las versiones del 17/09 **no aplican hacia
atrás**, y ningún texto dice «ganador» (BR-L15).

**La corrección de la Etapa 1 (`0068`) reprodujo sus siete hallazgos antes de tocarlos**, incluida la
carrera de I-134 con dos conexiones y un orden fijo, y la evidencia de cada uno está en `TEST_RESULTS`
(2026-09-17). **El cargador se ensayó de punta a punta en local** con un fixture que reproduce la situación de
producción —las dos fechas y los dos pares de números reales— y la constante de verdad: vista previa →
aplicar (`reconocido`, $1.000.000) → repetir (`ya estaba`, $1.000.000) → el historial del vendedor lo
lee. El fixture vive en `build/`, que no se versiona. Detalle en `TEST_RESULTS` (2026-09-17, Etapa 1).

**Las pantallas (Etapa 2).**

| Archivo | Qué comprueba |
|---|---|
| `tests/unit/prize-awards-history.test.ts` (24) | **Desde la Etapa 3**, el aviso de cobertura contra **frases escritas a mano** —«por verificar», «puede que tengan premios que no aparecen», el alcance de la organización, sin «mientras tanto»— (P2-13, P2-14, P3-01, P3-02). Los filtros de la URL por portal —el vendedor acepta cliente y nunca vendedor; el personal, al revés; un valor corrupto o una fecha que no existe se descartan—; el valor de cada premio —cierto, dinero y especie, solo especie, alternativas— sin «$0» ni suma de alternativas; el aviso de cobertura con lo que puede afirmar y cuándo se calla; los resúmenes; y el vocabulario: ni «ganador» ni «entregado», «pagado» o «desembolsado» |
| `tests/unit/prize-awards-view.test.tsx` (11) | **Desde la Etapa 3**, un premio conservado cuyo resultado entró en conflicto junto al aviso que ya no lo desmiente (P3V-01), y el alcance con **cualquier** filtro (P3V-02). Lo que pinta la pantalla con cada respuesta, con `react-dom/server`: el **error de lectura** —que el navegador no puede provocar— no pinta ni un cero; la cobertura que falla no tumba la lista; fechas al revés, vacío, página inexistente con los totales del conjunto; el filtro de cliente, y que «este cliente no tiene premios» solo se diga cuando el cliente es el **único** filtro; el personal sin columna de cliente y sin enlazar fichas que no existen; y lo que requiere verificación |
| `tests/unit/admin-privacy.test.ts` (+4) | Invariantes estructurales: `PrizeAwardBase` y `AdminPrizeAward` no declaran cliente; `readAdminPrizeAwards` pide solo sus dos proyecciones y no esparce la fila; las pantallas del personal no importan la lectura del vendedor ni `features/clients`; y el filtro de cliente no existe para el personal |
| `tests/e2e/premios-ganados.spec.ts` (13) | Con un escenario que pasa por el motor, la transición y el cargador de verdad y cuyas cifras están calculadas a mano (`premios-ganados-escenario.ts`): menú, cabecera y aviso de cobertura igual al de la base; totales **independientes de la página**, página 2, Atrás y recarga; filtros que vuelven a la página 1; alternativas, especie, tres cifras y ceros; conflicto y número cambiado con su importe; los **dos premios reconocidos de $500.000 = $1.000.000** sin cifras inventadas; ficha del cliente y enlace filtrado; cliente archivado; fechas al revés; **otro vendedor** no ve nada ni pidiendo un cliente ajeno; el **Dueño y el Administrador** sin un solo dato de cliente en el HTML, la carga RSC y la red; vendedor **desactivado**; y quien pasó a **Administrador** |
| `tests/e2e/premios-ganados.spec.ts` — Etapa 3 (+5, 18 en total) | **Punto A**: el premio reconocido de Fabio cuyo resultado entra en conflicto se queda con su importe y su marca, y el aviso dice «por verificar» y «puede que tengan premios que no aparecen», con el alcance de la organización; **punto B**: el Dueño elige desde el menú a quien vendió y hoy es Administrador, con sus totales y sin un dato de cliente; lo **ajeno frente a lo inexistente** —cliente de otro vendedor para el vendedor; vendedor y rifa de otra organización para el personal—, con el mismo estado HTTP y el mismo texto; siete **parámetros manipulados** y una navegación RSC sin un dato de cliente; y la **combinación** de rifa, vendedor y fechas con recarga y Atrás |
| `tests/e2e/premios-ganados-movil.spec.ts` (5) | La barra inferior conserva sus cuatro y la sección se alcanza desde el menú de usuario; cada tarjeta enseña lo indispensable; **sin desplazamiento lateral** a 412 y a 320 px con un nombre larguísimo —y a **375 px** en seis rutas de los dos portales, desde la Etapa 3—; el resumen del cliente y su enlace; y el personal con tarjetas de vendedor y sin cliente |
| `navegacion.spec.ts`, `navegacion-movil.spec.ts`, `menu-lateral.spec.ts` y `equipo.spec.ts` (ajustadas) | «Premios ganados» en el menú de los dos portales. Y la comprobación de D-198 —la ficha del vendedor no dice lo que gana— sigue buscando «Ganancia» en **toda** la página, pero «ganados» solo en la ficha **sin** la sección nueva, que usa la palabra con otro sentido: buscarla en toda la página falló en la E2E completa (`TEST_RESULTS`, Etapa 2) |

**Con volumen (Etapa 3).** `tests/db/prize-award-volume.test.ts` (**8**): 3.000 boletas de cuatro vendedores —uno se desactiva y otro pasa a Administrador—, 600 clientes, diez semanas de sorteos de 2089 con cinco premios —el diario con una **versión nueva** a mitad de camino— y una rifa transformada con 24 reconocimientos, todo con una **semilla fija**. Las expectativas salen de un **modelo del motor escrito en TypeScript** —premios que juegan, versión vigente al procesar, prioridad de cuatro cifras **por cliente**, boletas libres y tardías, valor cierto y pendiente—, nunca de las lecturas. Compara las filas por su huella, los cuatro indicadores con nueve filtros y combinaciones, las páginas de 25 contra una lectura de 1.000 (sin huecos, sin repetidos, en el orden de la base), la página inexistente, el desplazamiento negativo y el límite, y comprueba que el escenario **ejercita** la prioridad y las boletas no vendidas. **V5-01** mide los planes anidados (`auto_explain`, con `supabase_admin` local) y 20 llamadas por PostgREST, **solo** con `PREMIOS_EXPLAIN=<archivo>`.

**Las expectativas del aviso de cobertura se escriben a mano (Etapa 3).** Las unitarias comparan con frases literales, y la E2E cuenta los pendientes con su propia consulta (`coberturaIndependiente`) y escribe el texto en `avisoEsperado`: comparar el aviso con la misma `coverageNotice()` no demostraba que dijera lo correcto.

El escenario E2E se **limpia por prefijo al empezar y al terminar** y crea sus dos cuentas propias —el
vendedor que se desactiva y el que pasa a Administrador—: ascender a una cuenta del seed tiene efectos
irreversibles sobre sus avisos (Etapa 1).

**La preparación de la promoción (Etapa 4).** El modo de producción del cargador **no se ensaya contra
producción**: sus condiciones se prueban aisladas, sin red, y el flujo entero —el mismo para los dos destinos— se
ensaya con `--local` y el script de verdad. Las herramientas de puerta (`RUNBOOK` §9.0) se prueban igual: lo puro,
aislado; la clasificación con evidencia, contra la base local.

| Archivo | Qué comprueba |
|---|---|
| `tests/unit/record-prize-awards-guard.test.ts` (52) | **A1–A5**: destino explícito y uno solo, opciones desconocidas, repetidas o sin valor, la organización escrita dos veces **también en la vista previa** —idéntica, carácter por carácter—, `--project-ref` obligatorio con `--production` y prohibido con `--local`, y la huella exigida para aplicar **en los dos destinos**. **A6–A7**: `--production` rechaza cualquier destino local —por la URL, por `http`, por un host ajeno o por `SUPABASE_TARGET=local`— y cualquier proyecto que no sea el esperado; el **resolvedor** (`resolveTarget`) se prueba **aislado**, con `dotenv` simulado y sin leer `.env.local`. **A8–A10**: las entradas se validan antes de la red; el informe de la base se lee con su forma o no se lee; y se contrasta fila por fila —otra fila, otro importe, un número fotografiado ajeno, un resultado imposible en su momento—. **A11–A12**: la huella es estable y cambia con el destino, el proyecto, la organización, el respaldo y cualquier campo de las entradas o de la vista previa. **A13–A14**: qué error es incierto, los cuatro códigos de salida, ningún identificador de producción en el código y el orden de la puerta dentro del script |
| `tests/unit/gate-tools.test.ts` (14) | Las herramientas de puerta sin base: la orden, el proyecto esperado leído de la **propia cadena** de conexión —y ningún mensaje que la escriba—, el delta de estructura y su contraste con el ensayado en las tres direcciones, los cambios por fila —incluida una tabla nueva que no nace vacía—, las horas UTC de `vercel.json` y las sentencias que llevan un ACL local al de producción |
| `tests/db/record-prize-awards-script.test.ts` (11) | El **script de verdad**, como proceso aparte y con un entorno que **nunca ve una credencial de producción**, contra la situación real reproducida —una rifa transformada con su instante efectivo después de los dos sorteos, las dos boletas vendidas y las dos fotografías del motor—. **S1**: las negativas desde fuera, también `--production` contra la base local, sin escribir nada. **S2–S5**: la vista previa **no escribe** y su huella se repite; una huella ajena no escribe; aplicar reconoce los dos, con **una** fila de bitácora y $1.000.000 conciliados; repetirlo no duplica **ni escribe bitácora**. **S6**: con otro importe vigente, la vista previa lo rechaza nombrando las dos cifras y nada cambia. **S7**: otra ejecución se adelanta entre dos vistas previas —la huella cambia, no se escribe nada, y la vista previa nueva distingue «ya estaba» de lo que falta—. **S2b y S4b**: la **sonda** de la puerta, antes y después, con los totales esperados iguales a los que lee después la definición única y sin un identificador de cliente. **S8**: el **comparador** —una carga autorizada con una venta y un abono hechos con la sesión real del vendedor da CONTINUAR; la misma diferencia sin autorizar la carga, o renombrar la rifa y marcar un aviso como leído, DETENER— |

Limpia por prefijo al empezar y al terminar, también lo que deja S8 (pagos, asignaciones, comisiones, avisos,
bitácora y el cliente de ensayo). Dura unos 25 s: cada escenario arranca procesos de `tsx`.

## 5. Pruebas unitarias clave

| Módulo | Casos |
|--------|-------|
| `lib/money.ts` | `0 → "$0"`, `25000 → "$25.000"`, `120000 → "$120.000"`; rechazo de decimales; ida y vuelta sin pérdida |
| `features/tickets/schemas.ts` | `'1'`, `'25'`, `'007'`, `'0000'`, `'9999'` válidos; `'12345'`, `'12A4'`, `'-123'`, `'12.5'`, `''` inválidos |
| Cálculo de estado de pago | Sobre una boleta de $120.000: 0 → Sin pagar; 1..119.999 → Abonada; 120.000 → Pagada; 120.001 → error. Incluye el caso crítico de D-098: **$100.000 → Abonada**, nunca Pagada |
| `lib/dates.ts` | Un pago del 31 a las 23:00 en Bogotá pertenece al día 31, no al 1 |
| Detección de duplicados en el formulario masivo | Detecta repetidos entre 1.000 filas sin bloquear la interfaz |
| `lib/errors.ts` | Cada código de error de PostgreSQL se traduce a un mensaje en español sin filtrar detalles internos |
| `lib/phone.ts` (D-184) | Además de cómo se ve, **cuatro propiedades sobre 32 formatos**: es idempotente, no pierde ni un dígito, lo que `PHONE_REGEX` aceptaba se sigue aceptando —y lo que rechazaba se sigue rechazando— y nada de lo que produce pasa de 20 caracteres. Más el cursor: escribir al final, escribir en medio, pegar, borrar junto a un separador y **vaciar el campo en diez pulsaciones**, que es la regresión de un defecto real |
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
