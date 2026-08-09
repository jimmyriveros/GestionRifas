# RESULTADOS DE PRUEBAS POR FASE

Registro cronológico de lo que se ejecutó, qué falló y cómo se corrigió.
La **estrategia** de pruebas (qué se prueba y con qué herramienta) vive en
[`TESTING.md`](TESTING.md); este archivo solo acumula resultados.

Convención: se registran también los errores encontrados, incluso si se corrigieron en el momento.
Un error corregido documentado es información; ocultarlo es deuda.

---

## Resumen

| Fase | Unitarias | Base de datos | E2E | Verify | Estado |
|---|---|---|---|---|---|
| 0 | — | — | — | — | ✅ (documental) |
| 1 | 14 ✅ | — | — | ✅ | ✅ |
| 2 | 14 ✅ | **111 ✅** | — | ✅ | ✅ |
| 3 | **55 ✅** | **143 ✅** | **41 ✅** | ✅ | ✅ |
| 4 | **74 ✅** | **170 ✅** | **72 ✅** | ✅ | ✅ |
| 5 | **101 ✅** | **199 ✅** | **89 ✅** | ✅ | ✅ |
| 6 | **126 ✅** | **238 ✅** | **120 ✅** | ✅ | ✅ |
| 7 | **162 ✅** | **253 ✅** | **142 ✅** | ✅ | ✅ |

Reejecución rápida: `npm run verify`, `npm run test:db` y `npm run test:e2e`.

---

## Fase 0 — 2026-08-02

| Comando | Resultado | Error | Corrección |
|---|---|---|---|
| `npm view <13 paquetes>` | Versiones estables verificadas | `typescript-eslint@8` exige TypeScript `<6.1.0`, incompatible con el `latest` 7.x | Se fija TypeScript 5.9.3 (D-002) |

Sin código ejecutable: la verificación fue de consistencia documental.

---

## Fase 1 — 2026-08-03

| Comando / prueba | Resultado | Error | Corrección |
|---|---|---|---|
| `npm install` | 456 paquetes | `@supabase/supabase-js` y `jsdom` exigían Node ≥22 | Versiones compatibles con Node 20 (D-029, D-030) |
| `typecheck` | ✅ | 2 errores por `noUncheckedIndexedAccess` en `errors.ts` | Variable intermedia antes de retornar |
| `lint` | ✅ | `eslint@10` rompía con el `eslint-plugin-react` interno de `eslint-config-next` | Se fija `eslint@9.39.5` (D-031) |
| `test` (vitest) | ✅ 14/14 | — | — |
| `build` | ✅ 10 rutas | `typedRoutes` rompía un `href` dinámico | Se desactiva `typedRoutes` (D-032) |
| `format` | ✅ 31 archivos | — | — |
| `supabase db push` (remoto) | ✅ | La conexión directa no resolvía por DNS | Session pooler (I-005) |
| Verificación de catálogo | ✅ | — | — |
| `seed` | ✅ idempotente | `createUser` no dejaba la contraseña usable | `updateUserById` de confirmación (D-035, I-007) |
| Login navegador — 3 roles | ✅ | Iconos pasados como componente de Server a Client Component | Iconos pre-renderizados (`ReactNode`) |
| Login inválido | ✅ | — | — |
| Seller → `/owner/*` | ✅ `/denied` | — | — |
| Sin sesión → ruta protegida | ✅ `/login` | — | — |
| Usuario inactivo | ✅ bloqueado | **Bug real:** relación ambigua `memberships`→`profiles` (2 FK) rompía el embed de PostgREST y se mostraba como «cuenta inactiva» | Embed desambiguado (`profiles!memberships_profile_id_fkey`) + log del error real en servidor |
| Logout y persistencia | ✅ | — | — |
| Recuperación de contraseña | ✅ | — | — |
| Interacción en viewport móvil | ⚠️ no concluyente | El clic no disparó el submit con la herramienta de este entorno; en escritorio funcionó siempre | Documentado como limitación de la herramienta (I-009); repetir en dispositivo real o Playwright |

---

## Fase 2 — 2026-08-03

### Resultado final: 111/111 pruebas de base de datos ✅

Todas ejecutadas con **sesiones reales por rol y clave pública**, nunca con `service_role` (D-043).

| Archivo | Nº | Cubre |
|---|---|---|
| `tickets-numbering.test.ts` | 24 | Obligatorias 1–6 y 12 |
| `rls-isolation.test.ts` | 26 | Obligatorias 7–9 |
| `payments.test.ts` | 19 | Obligatorias 10–11 |
| `rpc.test.ts` | 22 | Carga masiva, aprobación, anulación, asignación |
| `catalog.test.ts` | 20 | Obligatoria 15 + invariantes estructurales |

### Las 15 pruebas obligatorias del prompt

| # | Prueba | Estado |
|---|---|---|
| 1 | Duplicado en la misma rifa | ✅ rechazado (`23505`) |
| 2 | Duplicado entre vendedores | ✅ rechazado |
| 3 | Misma combinación en otra rifa | ✅ permitido |
| 4 | Más de cuatro dígitos | ✅ rechazado (`23514`) |
| 5 | Caracteres no numéricos | ✅ rechazado |
| 6 | Ceros iniciales | ✅ `'0042'` se conserva; `'007'` ≠ `'7'` |
| 7 | Aislamiento entre organizaciones | ✅ cero filas visibles |
| 8 | Seller consultando otro Seller | ✅ cero filas |
| 9 | Seller modificando otro Seller | ✅ cero filas afectadas |
| 10 | Sobrepago | ✅ rechazado, incluso con dos pagos **concurrentes** |
| 11 | Pago a boleta de otro cliente | ✅ rechazado |
| 12 | Restricciones de estados | ✅ transiciones inválidas rechazadas |
| 13 | Migración limpia desde cero | ✅ `db reset` repetido sin errores |
| 14 | Seed limpio | ✅ idempotente |
| 15 | Estrategia de reversión documentada | ✅ prueba que verifica la nota en cada migración |

### Cronología con errores encontrados

| Comando / prueba | Resultado | Error | Corrección |
|---|---|---|---|
| `npx supabase start` | ✅ PostgreSQL 17.6 | — | — |
| `db reset` (repetido) | ✅ 10 migraciones limpias | — | — |
| `seed:local` | ✅ 2 orgs, 33 boletas, 4 pagos | `service_role` sin privilegios DML **en local**: los `GRANT` por defecto de Supabase difieren entre entornos | Migración `0009_grants.sql` con privilegios explícitos (D-037) |
| Pruebas de numeración | ✅ 24 | — | — |
| Pruebas de aislamiento | ✅ 26 | — | — |
| Pruebas financieras | ✅ 19 | Las pruebas agotaban las 10 boletas disponibles del seed | Cada prueba crea su propia boleta en vez de competir por un inventario finito |
| Pruebas de catálogo | ✅ 20 | `pending_amount` salía `numeric` en las vistas (`sum(bigint)` promueve a `numeric`) | Cast explícito a `bigint` (D-040) |
| Pruebas de RPC | ✅ 22 | Una prueba tomaba una boleta sin filtrar por organización → `approve_tickets` devolvía `null` | Filtro por organización + prueba negativa añadida |
| `gen types --local` | ✅ 1.176 líneas | `internal_code`/`short_code` salían obligatorios al insertar | `DEFAULT ''` + `CHECK <> ''` (D-039). Cierra DT-10 |
| `verify` | ✅ | Variable sin usar en una prueba | Eliminada |
| `db push` al remoto | ✅ 9 migraciones | **`authenticated` conservaba `DELETE` en el remoto**: `GRANT` solo agrega, no revoca. Local y remoto no eran equivalentes | Migración `0010_harden_grants.sql` (D-038) |
| Verificación estructural del remoto | ✅ 9/9 | — | — |
| Login navegador contra el remoto | ✅ | `invalid_credentials` pese a funcionar por API | Un `\r` dentro de `SEED_DEFAULT_PASSWORD` en `.env.local` contaminaba la contraseña (I-010); archivo normalizado y seed reejecutado |

### Verificaciones estructurales (local y remoto)

Las 9 comprobaciones pasan en ambos entornos:
tablas sin RLS · tablas sin `FORCE RLS` · funciones `SECURITY DEFINER` sin `search_path` · vistas sin
`security_invoker` · políticas de `DELETE` · `DELETE` concedido a `authenticated` · pagos
descuadrados · boletas sobrepagadas · columnas monetarias que no sean `bigint`.

Todas devuelven **cero filas**, que es el resultado esperado.

---

## Fase 3 — 2026-08-03

### Totales

| Suite | Comando | Resultado |
|---|---|---|
| Unitarias | `npm run test` | **55 ✅** (14 previas + 41 nuevas) |
| Base de datos | `npm run test:db` | **143 ✅** (111 previas + 32 nuevas) |
| End-to-end | `npm run test:e2e` | **41 ✅** (37 escritorio + 4 móvil) |
| Typecheck · Lint · Build | `npm run verify` | ✅ (0 errores de lint, 2 avisos) |

### Pruebas obligatorias del prompt de la Fase 3

| # | Prueba | Dónde | Resultado |
|---|--------|-------|-----------|
| 1 | Crear rifa | E2E `owner-raffles` + BD `F3-01` | ✅ |
| 2 | Editar rifa | E2E `owner-raffles` | ✅ |
| 3 | Crear vendedor | E2E `owner-users` | ✅ |
| 4 | Desactivar vendedor | E2E `owner-users` | ✅ (destapó I-011) |
| 5 | Admin intentando modificar al Owner → bloqueado | E2E `owner-users` + BD `F3-03` | ✅ |
| 6 | Crear boleta válida | E2E `owner-tickets` + BD `F3-04` | ✅ |
| 7 | Rechazar más de 4 dígitos | Unitaria + E2E (`tickets` y `bulk`) | ✅ |
| 8 | Rechazar combinación repetida | Unitaria + E2E + BD `F3-04` | ✅ |
| 9 | Rechazar duplicado de otro vendedor | Unitaria + E2E + BD `F3-04` | ✅ |
| 10 | Crear lote | E2E `owner-bulk` + BD `F3-06` | ✅ |
| 11 | Guardar borrador | E2E `owner-bulk` + BD `F3-06` | ✅ |
| 12 | Aprobar boleta | E2E `owner-tickets` (individual y en lote) + BD `F3-05` | ✅ |
| 13 | Anular boleta | E2E `owner-tickets` + BD `F3-05` | ✅ |
| 14 | Protección de acciones por rol | E2E `owner-tickets` + BD `F3-01`, `F3-03` | ✅ |
| 15 | Responsive básico | E2E `owner-responsive` (Pixel 7) | ✅ |
| 16 | Build | `npm run build` | ✅ 21 rutas |
| 17 | Lint | `npm run lint` | ✅ 0 errores |
| 18 | Typecheck | `npm run typecheck` | ✅ |

Criterio de finalización («un Owner completa el ciclo: crear rifa → crear vendedor → generar 1.000
boletas → aprobar») cubierto por `tests/e2e/owner-ciclo.spec.ts`, que además comprueba que la
aprobación quedó auditada. Duración: 12,7 s.

### Cronología con errores encontrados

| Comando / prueba | Resultado | Error | Corrección |
|---|---|---|---|
| `npm run typecheck` (primera pasada) | ❌ 3 errores | `path` como `readonly` en `z.refine`; estrechamiento de un tipo unión en `RaffleForm`; índice posiblemente `undefined` en `errors.ts` | Quitar `as const`; separar las ramas de crear/editar; `?.[1] ?? null` |
| `npm run lint` (primera pasada) | ❌ 5 errores | `react-hooks/set-state-in-effect` en 3 componentes; `TData extends unknown`; import sin usar | Campos de búsqueda **no controlados** con `key` (la URL es la fuente de verdad); formulario del diálogo movido a un hijo que Radix monta y desmonta; `RowData` en la ampliación de tipos |
| Sondeo de PostgREST | ✅ | `client:clients(...)` fallaba: hay **dos** FK de `tickets` a `clients` | Se usa la pista explícita `clients!tickets_client_org_fk` |
| Revisión de `max_rows` | ✅ | PostgREST corta en **1.000 filas**: contar clientes en memoria daba cifras falsas y precargar todas las combinaciones de una rifa era inviable | Conteos con `count: 'exact', head: true`; los duplicados se consultan **solo** por los números presentes en el formulario |
| E2E `owner-tickets` (1ª ejecución) | ❌ 2 de 13 | El formulario de boleta preseleccionaba la **última rifa creada**, no la activa, así que el duplicado se creaba en otra rifa | **Defecto real de usabilidad**: `listRaffleOptions` ordena ahora las activas primero. La prueba selecciona la rifa explícitamente |
| E2E `owner-users` (1ª ejecución) | ❌ 2 de 8 | Al desactivar a un vendedor **desaparecía del listado** | **Defecto real de seguridad/UX (I-011)**: `profiles_select` exigía que la membresía objetivo estuviera activa. Migración `0011` + 2 pruebas de BD de regresión |
| E2E `owner-bulk` (1ª ejecución) | ❌ 1 de 8 | `getByLabel('… fila 1')` también casaba «fila 10», «fila 11»… | Localizadores con `exact: true` |
| E2E completo (1ª ejecución) | ❌ 2 de 45 | Las pruebas responsive se ejecutaban también en escritorio, con expectativas contrarias | `testIgnore` en el proyecto de escritorio |
| `npm run test:db` tras la migración 0011 | ✅ 143 | — | — |
| `npm run test:e2e` (final) | ✅ 41 | — | — |
| `npm run verify` (final) | ✅ | — | — |
| `supabase db push --dry-run` al remoto | ✅ solo `0011` pendiente | — | — |
| `supabase db push --yes` al remoto | ✅ `0011` aplicada | — | — |
| Verificación de `profiles_select` en el remoto | ✅ | — | Ya no exige `m_target.is_active`; sigue acotada por `is_org_staff` |
| 7 verificaciones estructurales en el remoto | ✅ 7/7 en cero filas | — | — |

### Avisos de lint que se mantienen a propósito

Dos avisos de `react-hooks/incompatible-library`, en `DataTable` (`useReactTable`) y en
`BulkTicketCreator` (`useVirtualizer`): el compilador de React no puede memoizar las funciones que
devuelven esas API y omite la optimización. Son las librerías que exige `CLAUDE.md` §5; el aviso es
informativo y no se silencia.

### Rendimiento medido en la carga masiva

| Métrica | Valor |
|---|---|
| Generar 1.000 filas | ~2 s |
| Filas realmente en el DOM con 1.000 generadas | < 60 (virtualización) |
| Guardar 1.000 boletas en lotes de 100 | ~5,4 s |
| Validar 1.000 filas (unitaria) | < 500 ms (umbral holgado para detectar un algoritmo cuadrático) |

---

## Fase 4 — 2026-08-03

### Totales

| Suite | Comando | Resultado |
|---|---|---|
| Unitarias | `npm run test` | **74 ✅** (55 previas + 19 nuevas) |
| Base de datos | `npm run test:db` | **170 ✅** (143 previas + 27 nuevas) |
| End-to-end | `npm run test:e2e` | **72 ✅** (41 previas + 31 nuevas; 63 escritorio + 9 móvil) |
| Typecheck · Lint · Build | `npm run verify` | ✅ (0 errores de lint, los 2 avisos conocidos de TanStack) |

### Pruebas obligatorias del prompt de la Fase 4

| # | Prueba | Dónde | Resultado |
|---|--------|-------|-----------|
| 1 | Crear cliente | E2E `seller-clients` + BD `F4-01` | ✅ |
| 2 | Editar cliente | E2E `seller-clients` | ✅ |
| 3 | Archivar cliente | E2E `seller-clients` + BD `F4-01` | ✅ |
| 4 | Buscar cliente | E2E `seller-clients` | ✅ |
| 5 | Asignar boleta | E2E `seller-tickets` + BD `F4-04` | ✅ |
| 6 | Crear cliente durante la asignación | E2E `seller-tickets` y `seller-ciclo-movil` | ✅ |
| 7 | Crear boleta cuando está permitido | E2E `seller-tickets` + BD `F4-02` | ✅ |
| 8 | Bloquear creación cuando no está permitido | E2E `seller-tickets` + BD `F4-02` | ✅ |
| 9 | Estado pendiente de aprobación | E2E `seller-tickets` + BD `F4-02` | ✅ |
| 10 | Bloquear boleta incompleta | E2E `seller-tickets` + BD `F4-02` | ✅ |
| 11 | Copia de `sale_price` | E2E `seller-tickets` + BD `F4-04` | ✅ |
| 12 | Aislamiento entre vendedores | E2E `seller-clients`, `seller-tickets` + BD `F4-01`, `F4-03`, `F4-05` | ✅ |
| 13 | Protección de rutas y acciones | E2E `seller-tickets` (4 rutas × 3 roles) | ✅ |
| 14 | Responsive móvil | E2E `seller-ciclo-movil` (Pixel 7) | ✅ |
| 15 | Build | `npm run build` | ✅ 28 rutas |
| 16 | Typecheck | `npm run typecheck` | ✅ |
| 17 | Lint | `npm run lint` | ✅ 0 errores |

Criterio de finalización («un vendedor completa el ciclo desde un teléfono: buscar boleta → crear
cliente → asignar») cubierto por `tests/e2e/seller-ciclo-movil.spec.ts`, que además comprueba que el
precio quedó congelado y que la venta aparece en el panel. Duración: 6,7 s.

### Sondeo previo contra la base de datos

Antes de escribir la interfaz se comprobaron con sesiones reales los puntos con riesgo. Todos se
comportaron como exige el diseño:

| Comprobación | Resultado |
|---|---|
| Insertar boletas con `allow_seller_ticket_creation = false` | ✅ rechazado (42501) |
| Insertar directamente en `available` (saltarse la aprobación) | ✅ rechazado (42501) |
| Insertar ya con `client_id` (auto-asignarse) | ✅ rechazado (42501) |
| Auto-aprobarse una boleta propia | ✅ rechazado (42501) |
| `upsert` con `ignoreDuplicates` para conflictos parciales | ✅ 1 de 2 insertadas, la duplicada reportada |
| `assign_ticket` como vendedor | ✅ copia `sale_price`, `sale_date` y `assigned_at` |
| Transferir un cliente propio a otro vendedor | ✅ rechazado (42501) |

**Error cometido durante el sondeo, y corregido:** el script dejó
`allow_seller_ticket_creation = false` en la rifa del seed, que el seed crea en `true`. Se detectó al
releer `scripts/seed.ts` y se corrigió con `db:reset` + `seed:local`. Lección aplicada: los scripts
de sondeo no restauran «al valor que creen que había», se rehace el seed.

### Cronología con errores encontrados

| Comando / prueba | Resultado | Error | Corrección |
|---|---|---|---|
| Sondeo de capacidades del vendedor | ✅ | El script alteró el seed (arriba) | `db:reset` + `seed:local` |
| `npm run test:db` (nuevas) | ✅ 27 | — | — |
| `npm run test` (nuevas) | ✅ 19 | — | — |
| E2E `seller-clients` (1ª ejecución) | ❌ 1 de 9 | Se esperaba HTTP **404** al abrir el cliente de otro vendedor y llegó **200** | **No era una fuga**: la página sí muestra «Pagina no encontrada». El 200 viene del streaming con `loading.tsx` (I-014). La prueba pasó a comprobar lo que importa: que no aparezca ni el nombre ni el teléfono del cliente ajeno |
| E2E `seller-tickets` | ✅ 17 | — | — |
| E2E `seller-ciclo-movil` | ✅ 5 | — | — |
| `npm run test:e2e` completo | ✅ 72 | — | — |
| `npm run verify` | ✅ | — | — |

### Aislamiento entre vendedores: qué se comprobó exactamente

No basta con que la interfaz no enseñe el enlace. Se verificó, con sesión real de vendedor:

- `clients`, `tickets`, `v_client_balances` y `v_ticket_balances` solo devuelven filas propias.
- Pedir por URL el cliente o la boleta de otro vendedor devuelve «Pagina no encontrada», sin filtrar
  nombre, teléfono ni código interno.
- `assign_ticket` rechaza tanto la boleta ajena como el cliente ajeno.
- Un `UPDATE` directo para auto-asignarse una boleta (saltándose la RPC, con precio inventado) deja
  **cero filas** y la boleta sigue `available` con `sale_price` nulo.
- Un vendedor no puede crear un cliente a nombre de otro ni transferirle el suyo.

---

## Fase 5 — 2026-08-03

### Totales

| Suite | Comando | Resultado |
|---|---|---|
| Unitarias | `npm run test` | **101 ✅** (74 previas + 27 nuevas) |
| Base de datos | `npm run test:db` | **199 ✅** (170 previas + 29 nuevas) |
| End-to-end | `npm run test:e2e` | **89 ✅** (72 previas + 17 nuevas) |
| Typecheck · Lint · Build | `npm run verify` | ✅ (0 errores de lint, los 2 avisos conocidos de TanStack) |

### Pruebas obligatorias del prompt de la Fase 5

| # | Prueba | Dónde | Resultado |
|---|--------|-------|-----------|
| 1 | Abono parcial → Abonada | E2E `payments` + BD `F5-01` | ✅ |
| 2 | Completar el pago → Pagada | E2E `payments` + BD `F5-01` | ✅ |
| 3 | Bloqueo de sobrepago | Unitaria + E2E + BD `F5-01` | ✅ |
| 4 | Pago repartido entre varias boletas | Unitaria + E2E + BD `F5-01` | ✅ |
| 5 | Suma distinta al total → rechazado | Unitaria + E2E + BD `F5-01` | ✅ |
| 6 | Atomicidad (fallo parcial no deja rastro) | BD `F5-01` | ✅ |
| 7 | Pago concurrente sobre la misma boleta | BD `payments.test.ts` (Fase 2, 2 pagos reales en paralelo) | ✅ |
| 8 | Anulación → recálculo de saldo y estado | E2E `payments` + BD `F5-02` | ✅ |
| 9 | Vendedor intentando anular → bloqueado | E2E `payments` + BD `F5-02` (42501) | ✅ |
| 10 | Bloqueo de cambio de cliente con pagos | BD `F5-03` | ✅ |
| 11 | Pago a boleta sin cliente → rechazado | BD `F5-01` | ✅ |
| 12 | Pago a boleta de otro cliente → rechazado | BD `F5-01` | ✅ |
| 13 | Build, typecheck y lint | `npm run verify` | ✅ 30 rutas |

### Sondeo previo contra la base de datos

Antes de escribir la interfaz se recorrieron con sesiones reales los caminos financieros. Todos se
comportaron como exige el diseño (sobrepago, cuadre, anulación por el personal, doble anulación,
boleta sin cliente, anulación de boleta con pagos, cambio de cliente con pagos)… **menos uno**:

| Comprobación | Resultado |
|---|---|
| El vendedor ve en su historial el pago que registró él | ✅ |
| El vendedor ve en `payments` el pago que registró un Owner | ✅ |
| El vendedor ve **en `v_payment_history`** ese mismo pago | ❌ **la fila desaparecía** |

Ese hallazgo (I-015) motivó la migración `0012` **antes** de escribir una sola pantalla. Tras
aplicarla, la misma comprobación devuelve el pago con `created_by_name = null`, que es lo correcto:
el nombre del administrador no es visible para el vendedor, pero el pago sí.

### Cronología con errores encontrados

| Comando / prueba | Resultado | Error | Corrección |
|---|---|---|---|
| Sondeo de pagos | ✅ 12 de 13 | **El historial ocultaba pagos legítimos** (I-015) | Migración `0012`: LEFT JOIN sobre `profiles` + `voided_by_name`; tipos regenerados |
| `npm run test` (nuevas) | ✅ 27 | — | — |
| `npm run test:db` (nuevas) | ✅ 29 | — | — |
| E2E `payments` (1ª ejecución) | ❌ 3 de 17 | (a) el reparto manual daba `5.000.030.000`; (b) un título de tarjeta no era `heading`; (c) «Camila Restrepo» aparecía también en el menú de usuario | (a) **defecto real en `MoneyInput`** (I-016): concatenaba en vez de reemplazar; corregido quitándole el estado interno (D-053). (b) y (c) localizadores de la prueba |
| `npm run test:e2e` completo | ❌ 1 de 89 | Una prueba de la Fase 4 pasó a ser ambigua: el detalle de boleta ahora ofrece «Registrar un abono de \<cliente\>», que repite el nombre | Localizador con `exact: true` |
| `npm run test:e2e` (final) | ✅ 89 | — | — |
| `npm run verify` (final) | ✅ | — | — |

### El dinero, comprobado donde importa

Todas estas comprobaciones se hacen contra la base de datos, no contra la pantalla:

- `paid_amount` y `payment_status` **nunca** los escribe la aplicación: un `UPDATE` directo de
  `paid_amount` falla con «columna derivada».
- Anular libera saldo y permite volver a cobrar sin sobrepasar.
- Anular uno de dos pagos deja intacto el saldo del otro.
- La anulación queda en `audit_logs` con `action = 'payment.void'`.
- `v_client_balances` cumple `pending_amount = total_purchased - total_paid` después de abonar.

---

## Fase 6 — 2026-08-04

### Punto de partida

Antes de tocar nada se levantó el entorno y se comprobó la línea base heredada de la Fase 5:
`npm run db:reset && npm run seed:local` → `npm run test:db` **199 ✅** → `npm run verify` **✅** →
`npm run test:e2e` **89 ✅**. Todo en verde, así que cualquier fallo posterior sería de esta fase.

### Sondeo previo a escribir la interfaz

Igual que en las fases 4 y 5, las funciones nuevas se probaron con **sesiones reales** antes de
construir una sola pantalla encima. Resultados de `report_payment_totals` / `report_payments_by_day`
recién aplicada la migración `0013`:

| Quién consulta | Resultado | Esperado |
|---|---|---|
| Owner | 4 pagos, $310.000 (vigente $290.000, anulado $20.000) | ✅ coincide con la suma directa de `payments` |
| Vendedor 1 | los mismos 4: son suyos | ✅ |
| Vendedor 2 | 0 pagos, $0 | ✅ no ve los de su compañero |
| Otra organización | 0 pagos, $0 | ✅ |
| Anónimo | `permission denied for function` | ✅ |
| Vendedor 2 pidiendo `p_seller_id` = Vendedor 1 | 0 pagos, $0 | ✅ **el parámetro no es una puerta**: manda la RLS |

En el mismo sondeo se confirmaron dos premisas de las que dependía el diseño de los reportes:

- `SUM(v_client_balances.pending_amount)` = `SUM(v_seller_summary.pending_amount)` = **$510.000**.
  Por eso el total del reporte «Clientes con saldo» puede salir del agregado por vendedor sin
  contradecir la tabla.
- `v_raffle_summary` se acota sola al vendedor que consulta (21 boletas de 30), porque el `LEFT JOIN`
  contra `tickets` hereda su RLS. No hacía falta una vista nueva para el portal Seller.

### Cronología con errores encontrados

| Comando / prueba | Resultado | Error | Corrección |
|---|---|---|---|
| Sondeo de las funciones `report_*` | ✅ 12 de 12 | — | — |
| Verificación en navegador (owner y vendedor) | ✅ | — | Cifras contrastadas con el sondeo: $800.000 / $290.000 / $510.000 en el portal admin y $600.000 / $290.000 / $310.000 en el del vendedor |
| Exportación CSV desde el navegador | ⚠️ | `response.text()` decía que **faltaba el BOM** | Falsa alarma: la especificación de `fetch` **elimina** el BOM al decodificar. Se comprobó con `arrayBuffer()` que los bytes `EF BB BF` sí viajan. Aun así se cambió el literal U+FEFF (invisible) por `String.fromCharCode(0xfeff)` y la prueba pasó a comparar el punto de código: **la prueba anterior habría pasado igual con el BOM borrado** |
| `npm run test` (nuevas) | ✅ 25 | — | — |
| `npm run test:db` (nuevas) | ✅ 39 | — | — |
| E2E `reports` (1ª ejecución) | ❌ 6 de 31 | (a) 5 fallos por leer con `count()`/`allInnerTexts()`, que **no auto-esperan**, contra el `loading.tsx` todavía en pantalla; (b) 3 fallos en `logout()` | (a) esperar a la primera fila con `expect(...).toBeVisible()` antes de leer; (b) **`logout()` llevaba tres fases sin funcionar** (I-018) |
| E2E `reports` (2ª ejecución) | ❌ 3 de 31 | `logout()` seguía sin encontrar el botón | El disparador del menú **no tenía nombre accesible**: su contenido eran las iniciales del avatar y un nombre oculto bajo `md`. Se le añadió `aria-label`, lo que **corrige también un defecto real de accesibilidad** |
| E2E `reports` (final) | ✅ 31 | — | — |
| `npm run test:e2e` completo | ✅ 120 | — | — |
| `npx tsc --noEmit` tras escribir las pruebas de BD | ❌ 21 errores | `tsc` también cubre `tests/`: (a) `as Record<string, number>` sobre filas de vista no solapa; (b) los constructores de supabase-js son *thenables*, no `Promise`, y `timed()` exigía `Promise` | (a) helper `sumar()` que comprueba el tipo en ejecución en vez de forzar el `as`; (b) `timed()` acepta `PromiseLike` |
| `npm run verify` (final) | ✅ | — | 126 unitarias, 0 errores de lint, build con las 3 rutas nuevas |

### Los dos defectos reales de esta fase

**I-017 — todas las fechas de día calendario se mostraban un día antes.** Apareció al escribir
`formatDateCsv`: `payment_date`, `sale_date`, `start_date` y `end_date` son columnas `date`, llegan
como `'AAAA-MM-DD'` y `new Date('2026-08-04')` es **medianoche UTC**, que en Bogotá todavía es el
día 3. Afectaba a los 8 sitios donde se muestran fechas de negocio, incluida la tabla de pagos de la
Fase 5. Se corrigió en `src/lib/dates.ts` —anclando las cadenas de solo fecha al mediodía UTC— en
vez de parchear cada llamada, y se cubrió con pruebas unitarias y una E2E.

**I-018 — el menú de usuario no tenía nombre accesible.** El helper `logout()` de las pruebas,
escrito en la Fase 3 y nunca usado hasta ahora, buscaba un botón que no existía. Al investigarlo se
vio que el disparador solo contenía el avatar y un nombre oculto en móvil: un lector de pantalla
anunciaba «CR». Se añadió `aria-label="Menu de usuario: <nombre>"`.

### Lo que se comprobó contra la base de datos, no contra la pantalla

- Cada conteo y cada importe del dashboard tiene una **consulta de control independiente**, escrita
  a mano sobre `tickets` y `payments`, sin pasar por las vistas que se están probando (F6-01, F6-02).
- `vendido − recaudado = saldo pendiente`, y el recaudado es la suma de los pagos **no anulados**
  (comprobado a la vez contra la suma de *todos*, que es mayor: si fueran iguales, la prueba no
  demostraría nada).
- El resumen por rifa y el resumen por vendedor suman lo mismo.
- Las funciones nuevas **no** son `SECURITY DEFINER` y **sí** fijan `search_path`; `anon` no puede
  ejecutarlas; devuelven dinero como `number` y no como texto (D-040).

### Volumen: 5.000 boletas (prueba 5 del plan)

`tests/db/volume-phase6.test.ts` crea una rifa en borrador con 5.000 boletas repartidas entre dos
vendedores, de forma idempotente. Lo relevante que demuestra:

| Comprobación | Resultado |
|---|---|
| Una consulta normal sobre 5.000 boletas | **devuelve 1.000 filas y `error: null`** — el truncamiento silencioso de PostgREST, reproducido (I-011) |
| `count: 'exact', head: true` | devuelve el número real, > 1.000 |
| Paginación por bloques (lo que hace `fetchAllRows`) | recupera las 5.000, sin repetidos entre bloques |
| `v_raffle_summary` con 5.000 boletas | **1 fila**, correcta, < 5 s |
| `v_seller_summary` con 5.000 boletas | **2 filas** (una por vendedor), suman 5.000 |
| Aislamiento con la base cargada | el vendedor sigue viendo solo lo suyo |

El presupuesto de tiempo (5 s) es deliberadamente holgado: no mide rendimiento absoluto —una portátil
con Docker no da medidas comparables— sino que caza una regresión de orden de magnitud, como mover un
agregado a TypeScript. Lo que sí es una aserción fuerte es el **número de filas** que devuelve cada
agregado: si creciera con el número de boletas, la suma habría dejado de estar en SQL.

---

## Fase 7 — 2026-08-04

### Punto de partida

`npm run test:db` **238 ✅** · `npm run verify` **✅** · E2E verificada en verde sobre el commit
`eb5457a` al cerrar la Fase 6. Todo en verde antes de tocar nada.

### La auditoría de la matriz: tres filas que mentían

Recorrer `TESTING.md` §3 fila por fila **hasta el archivo** destapó que tres de las 25 pruebas
mínimas se daban por cubiertas sin estarlo:

| # | Decía | Realidad |
|---|---|---|
| 1 | E2E, Fase 1 | El helper `loginAs` espera `/owner/dashboard` **o** `/seller/dashboard`: un vendedor que aterrizara en el portal administrativo habría pasado desapercibido |
| 2 | E2E + BD, Fase 1 | Verificado **a mano** en el navegador; sin prueba automatizada |
| 25 | Fase 7 | Correcto: no existía |

Las tres están ahora automatizadas en `tests/e2e/security.spec.ts` y
`tests/unit/server-actions-guard.test.ts`.

### El hallazgo grande: I-019

El `EXPLAIN ANALYZE` del entregable 8 mostró **1,7 s** para contar 7.278 boletas. La causa:
`is_org_staff(organization_id)` recibe una columna, así que se ejecuta una vez por fila.

Comprobado aislando la función sobre la misma tabla:

| Consulta | Tiempo |
|---|---|
| `count(*)` sin la función | 1,46 ms |
| `count(*)` con `is_org_staff(columna)` | **1.667,24 ms** |
| `count(*)` con el conjunto precalculado | 1,18 ms |

Antes y después de la migración `0014`, con la sesión de un Owner real:

| Consulta | Antes | Después |
|---|---|---|
| Listado de boletas paginado | 1.607,5 ms | **4,1 ms** |
| Búsqueda por número exacto | 1,6 ms | 2,0 ms |
| Boletas del vendedor filtradas | 1.291,5 ms | **2,4 ms** |
| `v_seller_summary` | 1.290,7 ms | **3,9 ms** |
| `v_raffle_summary` | 1.289,8 ms | **5,1 ms** |
| `v_client_balances` con saldo | 24,3 ms | **2,6 ms** |
| `v_payment_history` paginado | 53,7 ms | **7,1 ms** |
| `report_payment_totals` | 11,4 ms | **0,8 ms** |
| `report_payments_by_day` | 12,9 ms | **0,6 ms** |
| Conteo exacto (paginación) | 1.225,4 ms | **1,9 ms** |

Efecto colateral que confirma la medición: `npm run test:db` pasó de **38 s a 11 s**.

**Índices:** se probó uno sobre `(organization_id, created_at desc)` para el listado. El planificador
**siguió eligiendo *seq scan*** (el coste no estaba en leer las filas), así que no se añadió: habría
penalizado las cargas masivas de 1.000 boletas sin dar nada a cambio.

### Cronología con errores encontrados

| Comando / prueba | Resultado | Error | Corrección |
|---|---|---|---|
| `npm audit` | 3 altas | `postcss` y `sharp` dentro de Next 16.2.12 | **DT-12 saldada**: en la Fase 2 el «arreglo» era degradar Next a 2019; ahora era **subir** a `next@16.3.0`. Actualizado y fijado sin `^` |
| `npm run verify` tras subir Next | ✅ | — | — |
| Verificación de la CSP en navegador | ✅ | — | Login, hidratación y navegación sin una sola violación en consola |
| `npx vitest run tests/unit/rate-limit.test.ts` | ❌ | `server-only` **lanza** al importarse en jsdom | Alias a `tests/stubs/server-only.ts` en `vitest.config.mts` (D-064) |
| Prueba negativa del guardián de acciones | ✅ | — | Se creó a propósito una acción sin guarda y la prueba **falló**, como debía. Sin esa comprobación, una prueba estructural puede ser vacua |
| E2E `security` (1ª ejecución) | ❌ 5 de 17 | 4 expectativas **mías** equivocadas + 1 timeout | (a) el endpoint de exportación responde **307 al login**, no 401: no hay fuga, la asertiva estaba mal; (b) `anon` recibe `permission denied`, mejor que `[]`; (c) `textContent` incluye el payload RSC de desarrollo; (d) el botón no se llamaba como yo suponía |
| E2E `security` (2ª ejecución) | ❌ 1 de 17 | `loginAs` esperando 60 s un panel que nunca llegaría | Rellenar el formulario a mano en ese caso |
| **Seed corrompido** | ⚠️ | El timeout impidió que corriera el `finally`, y **`vendedor2` quedó inactivo** | Restituido, y la prueba pasó a restituir por **base de datos en un `afterEach`** (`setMembershipActive`), no por la interfaz: un `finally` no se ejecuta si la prueba agota su tiempo |
| E2E `security` (final) | ✅ 22 | — | — |
| `npm run test:db` tras reescribir 22 políticas RLS | ✅ 253 | — | Ninguna prueba de aislamiento cambió de resultado |
| `npm run test:e2e` completa | ✅ 142 | — | — |
| `npm run verify` (final) | ✅ | — | 162 unitarias, 0 errores de lint |

### Cómo se comprobó que la reescritura de la RLS no cambió permisos

No basta con que las pruebas sigan pasando; se comprueba la **equivalencia** directamente
(`F7-01`): para **cada** usuario del seed y **cada** organización, `current_staff_org_ids()` contiene
esa organización si y solo si `is_org_staff()` devolvía verdadero. Cero discrepancias.

Además, `F7-03` impide la regresión: falla si alguna política vuelve a usar `is_org_staff(` o deja
un `current_profile_id()` sin envolver.

### Código muerto eliminado

8 exports sin un solo uso en todo el repositorio: `ErrorState` (archivo completo), `useConfirmDialog`,
`AppError`, `isActionError`, `RAFFLE_STATUS_VALUES`, `getPaymentDetail`, `countPendingApproval` y
`getOrgMember`.

---

## Fase 8 — 2026-08-05

| Comando / prueba | Resultado | Error | Corrección |
|---|---|---|---|
| `npm run db:reset && seed:local` → `test:db` → `verify` → `test:e2e` (entorno de partida) | ✅ 254 / ✅ / ✅ 142 | — | — |
| `scripts/create-organization.ts` contra local | ✅ | — | Org + Owner creados por invitación real; verificado por REST directo contra PostgREST (no solo por el mensaje de éxito del script) |
| Segunda corrida del mismo script, mismo nombre de organización | ✅ (rechazo correcto) | — | Detecta el Owner activo existente y se detiene sin crear un segundo, como debía (BR-U04) |
| Clic real al enlace de invitación generado en local (vía Mailpit) | ❌ | `error=access_denied&error_code=otp_expired` | No es un defecto del script: `supabase/config.toml` solo autoriza `https://127.0.0.1:3000` sin ruta en `additional_redirect_urls`, así que GoTrue cae al `site_url` base. Documentado como I-023 con la acción exacta para producción |
| 1er despliegue a Vercel (proyecto preexistente, importado automáticamente antes de esta fase) | ❌ | `npm run build` exited 1 — `injected env (0)`, falta `NEXT_PUBLIC_SUPABASE_URL` | Sin variables de entorno configuradas en el proyecto Vercel. Además construía un commit de hace 5 fases (el remoto de GitHub solo llegaba a `fase-2`) |
| 2º despliegue (usuario agregó las variables, redeploy del commit viejo) | ❌ | Mismo error: `injected env (0)` | Aún sin push del código actual; además las variables estaban en scope Production **y** Preview, no reflejaba el problema real todavía |
| `git push origin main` (12 commits, fast-forward, autorizado explícitamente) | ✅ | — | Repo público — se avisó antes de empujar |
| 3er despliegue (disparado por el push, commit `c457d96`) | ❌ | Mismo error otra vez: `injected env (0)` | Descartaba que fuera solo el scope Preview/Production |
| Revisión pedida al usuario del panel de variables | — | **Error de tipeo**: `NEXT_PUBLIC_SUPABASE_UR` sin la "L" final | Corregido por el usuario en el dashboard |
| 4º despliegue (Redeploy manual tras corregir el nombre) | ✅ `READY`, target `production` | — | Primer despliegue exitoso de la fase |
| `curl -I` a `https://gestion-rifas.vercel.app` | ✅ | — | HSTS, CSP con nonce (`connect-src` apuntando al proyecto Supabase correcto), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` — todas presentes |
| `curl -I` a `/owner/dashboard`, `/seller/dashboard`, `/api/reports/export` sin sesión | ✅ | — | Los tres devuelven 307 a `/login` |
| Búsqueda de `SERVICE_ROLE` en el HTML servido y en `.next/static` | ✅ 0 coincidencias | — | Confirmado en producción real y en el build local |
| Generar el respaldo lógico con `require('dotenv').config()` | ❌ | `LegacyDbConfigParseUrlError: failed to parse connection string` | El aviso promocional que `dotenv` imprime por `stdout` se coló dentro del valor capturado por `$(...)`. Corregido leyendo `.env.local` directamente con `fs.readFileSync`, sin pasar por `dotenv` |
| 1er volcado de `data.sql` (sin `--schema public`) | ⚠️ Técnicamente exitoso, pero **incorrecto** | Incluía `auth.users` completo: `encrypted_password`, `confirmation_token`, `recovery_token`, `reauthentication_token` de cada cuenta real | Detectado al restaurar en local (`ERROR: duplicate key value violates unique constraint "users_email_partial_key"`, una restricción de `auth`, no de ninguna tabla de negocio). Los tres archivos se borraron de inmediato — nunca salieron de la máquina — y se regeneraron con `--schema public --data-only` para los datos |
| Restauración local con `schema.sql` generado con `--schema public` | ❌ | `operator class "public.gin_trgm_ops" does not exist for access method "gin"` | Restringir el esquema del volcado de **estructura** (no el de datos) impide que se recree la extensión `pg_trgm`. Corregido generando `schema.sql` sin restringir esquema — solo trae una referencia inofensiva a `auth` (la FK de `profiles`), confirmado línea por línea |
| Restauración local final (roles + schema + data corregidos) | ✅ | Un único error esperado e inofensivo en `roles.sql` (`permission denied for parameter log_min_messages`, un `GRANT` que solo aplica al proyecto alojado) | — |
| Verificación de objetos restaurados (consultas directas a `information_schema`/`pg_policies`) | ✅ | — | 9 tablas, 25 políticas RLS, 35 triggers, 5 vistas, 5 enums |
| Verificación de filas restauradas | ✅ | — | 2 organizaciones, 6 perfiles, 6 membresías, 2 rifas, 6 clientes, 33 boletas, 4 pagos, 5 asignaciones de pago, 64 registros de auditoría |
| `db:reset && seed:local` para devolver el entorno local a su estado normal | ✅ | — | La instancia local no quedó pisando datos de la prueba de restauración |
| Prueba de humo de los 3 roles en producción | ✅ | — | **La ejecutó el usuario**: entrar una contraseña en un campo, aunque sea la de una cuenta de demostración que el propio agente conoce, está prohibido sin excepción |
| `npm run verify` + `npm run test:db` (cierre de fase) | ✅ / ✅ 254 | — | — |

### Por qué el respaldo contaminado no fue un incidente de seguridad real

Los tres archivos con `auth.users` completo existieron únicamente en
`D:\Claude\Personal\Rifas-backups\` de la máquina local, nunca se copiaron a ningún otro lugar, nunca
se versionaron (esa carpeta está fuera del repositorio a propósito) y se borraron en el mismo turno en
que se detectó el problema, antes de generar los archivos correctos. Ninguna de las contraseñas
cifradas ni los tokens llegó a mostrarse en la conversación ni en ninguna salida capturada.

---

## Fase 9 — 2026-08-05

### Punto de partida

Entorno verificado antes de auditar nada (`CLAUDE.md` §34.1): `npx supabase start`,
`db:reset` + `seed:local`, `test:db` **254 ✅**, `verify` ✅, `test:e2e` **142 ✅**.
La documentación decía la verdad.

### Método: probar, no releer

La auditoría se hizo **ejecutando el sistema**, no leyéndolo. Releer el código encuentra lo que su
autor ya sabía; ejecutarlo encuentra lo que creía y no era cierto — que es exactamente cómo
aparecieron I-011, I-015, I-019 e I-020 en fases anteriores.

| Instrumento | Qué hizo |
|---|---|
| Volcado del catálogo | 15 consultas escritas desde cero a `pg_class`, `pg_policies`, `pg_proc`, `pg_constraint`, `pg_indexes`, `pg_trigger` e `information_schema`, sin reutilizar las aserciones de `catalog.test.ts` |
| Sonda adversaria (2 tandas) | **47 intentos** con sesiones reales y clave pública, nunca `service_role` |
| `npm run verify:remote` | 13 invariantes de catálogo contra el **proyecto real**, solo lectura |

### La sonda adversaria: 47 intentos, 45 bloqueados

Los 2 «no bloqueados» se investigaron uno a uno y **ninguno era una fuga**:

| Intento | Parecía | Era |
|---|---|---|
| Vendedor1 lee 39 `payment_allocations` | fuga entre vendedores | Las 39 son suyas: `vendedor2` no tiene ninguna en el seed |
| `report_payment_totals` devuelve el total de la organización | fuga de cobranza | Los 36 pagos de la organización son suyos |
| Reutilizar la combinación de una boleta anulada | restricción ausente | La RPC la devolvió como **conflicto**, `inserted: 0`. Es su diseño (R-14, BR-N08) |

Los dos primeros tenían la misma raíz —el seed deja a `vendedor2` sin pagos— y de ahí salió **A-03**.
La lección de la tanda: *una sonda mal diseñada produce falsos positivos, y publicarlos sin
verificarlos habría sido peor que no haberla escrito*.

Verificación dirigida del aislamiento, ya con pagos en **ambos** vendedores:

| Superficie | vendedor1 ve | vendedor2 ve | Filas ajenas |
|---|---|---|---|
| `payments` | 36 | 1 | **0** |
| `payment_allocations` | 39 | 1 | **0** |
| `v_payment_history` | 36 | 1 | **0** |
| `report_payment_totals` | 1.592.001 | 7.777 | cada uno su verdad |

### Los dos hallazgos reales

**A-01 — 6 de las 28 Server Actions estaban fuera de la red estructural.**
`tests/unit/server-actions-guard.test.ts` recorría `features/<módulo>/actions.ts` a un solo nivel; el
código ya tenía tres módulos anidados (`tickets/assign`, `tickets/bulk`, `tickets/seller`). Las 6
acciones tienen su guarda correcta —se verificó una por una—, así que **no hubo vulnerabilidad**: lo
que faltaba era la red, y precisamente su valor declarado está en el futuro.

*Comprobado, no supuesto*: se inyectó temporalmente una acción sin guarda en
`tickets/assign/actions.ts`.

| Versión de la prueba | Resultado con la acción sin guarda |
|---|---|
| Anterior (un nivel) | habría pasado inadvertida |
| Corregida (recursiva) | **falla**: `acciones sin autorizacion: expected [ Array(1) ] to deeply equal []` |

El archivo se restauró de inmediato (`git status` limpio).

**A-02 — Una organización podía quedarse sin Owner.**
Reproducido con la clave pública y la sesión real del Owner:

| Paso | Resultado |
|---|---|
| `update memberships set role = 'seller' where profile_id = <owner>` | **1 fila afectada** |
| El ex-Owner intenta restaurarse | 0 filas — ya no es staff |
| El Admin intenta ascenderse a Owner | `42501` — BR-U03, correctamente |
| El Admin intenta restaurar al ex-Owner | `42501` |
| Owners activos restantes | **0** |

`memberships_one_owner_per_org` garantizaba «como máximo uno», nunca «al menos uno». Corregido con la
migración `0016` (constraint trigger **diferido**, D-071) y cubierto por `F9-01`, que incluye la
prueba de que la transferencia de propiedad en **una** transacción sigue siendo posible — la razón de
que el trigger sea diferido y no inmediato.

### Cronología con errores encontrados

| Paso | Resultado | Error | Corrección |
|---|---|---|---|
| `npx supabase start` | ❌ | `failed to connect to the docker API` | Docker Desktop no estaba arrancado. Se inició desde `%LOCALAPPDATA%\Programs\DockerDesktop` (no está en `C:\Program Files`) |
| Sondas escritas en el scratchpad | ❌ | `ERR_MODULE_NOT_FOUND: Cannot find package 'pg'` | Un script fuera del proyecto no resuelve sus dependencias. Se importó por ruta absoluta a `node_modules` |
| Primera sonda | ⚠️ 2 falsos positivos | — | Investigados y descartados con verificación dirigida (ver arriba) |
| `db:reset` + `seed:local` inmediato | ❌ | `AuthRetryableFetchError` (502) en `createUser` | GoTrue tarda más que Postgres en aceptar peticiones tras reiniciar los contenedores. Se espera a que `/auth/v1/health` devuelva 200. Registrado como **I-028** |
| `test:db` con `F9-02` recién escrita | ❌ 2 fallos | `F6-04` esperaba que `vendedor2` no tuviera pagos ni desglose diario | La limpieza por **anulación** no bastaba: un pago anulado sigue apareciendo en `report_payments_by_day`. Se cambió a borrado real en una sola transacción con la conexión de superusuario, que es lo único que devuelve el seed a su estado exacto |
| `test:db` dos veces seguidas sin resembrar | ✅ 266 / ✅ 266 | — | Confirma que la limpieza de `F9-02` es exacta y las pruebas siguen siendo idempotentes |

### Resultados finales

| Suite | Antes (Fase 8) | Ahora |
|---|---|---|
| Unitarias (`npm run test`) | 162 | **163 ✅** |
| Base de datos (`npm run test:db`) | 254 | **266 ✅** |
| End-to-end (`npm run test:e2e`) | 142 | **142 ✅** (reejecutadas tras la migración `0016`) |
| `npm run verify` | ✅ | ✅ (0 errores de lint; los 2 avisos conocidos de TanStack) |
| `npm run verify:remote` | 13/13 | **13/13 ✅** |

### Lo que se comprobó y NO falló

Un ataque que falla también es un resultado. Sin esta sección, «no encontré nada» no se distingue de
«no busqué».

| Área | Comprobación | Resultado |
|---|---|---|
| RLS | 9 tablas habilitada **y forzada**, 22 políticas, **0** de `DELETE` | ✅ |
| Privilegios | `anon` sin privilegios de tabla ni de función propia; `DELETE`/`TRUNCATE` solo para `postgres` y `service_role` | ✅ |
| Funciones | Las 25 propias con `search_path`; las 2 de reporte `SECURITY INVOKER` (D-057) | ✅ |
| Vistas | Las 5 con `security_invoker = true` | ✅ |
| Integridad | 27 `CHECK`, 22 índices únicos, 26 FK, 21 triggers, 1 columna generada | ✅ |
| Aislamiento | Entre vendedores y entre organizaciones, en lectura y escritura, por tabla, vista y RPC | ✅ |
| Dinero | Sobrepago, descuadre, importe cero, pago a boleta de otro cliente | ✅ rechazados |
| Rifa cerrada | Crear y asignar boletas | ✅ rechazados |
| Secretos | Ninguna vía al navegador: 15 módulos con `server-only`, y los 12 componentes cliente que tocan `queries.ts` lo hacen con `import type` | ✅ |
| Calidad | 1 `any` justificado, 0 `@ts-ignore`, 0 N+1, 0 `data.length` para contar | ✅ |

### Aplicación de `0016` al proyecto real — 2026-08-05

Autorizada explícitamente por el usuario tras la entrega de la Fase 9.

| Paso | Comando | Resultado | Errores |
|---|---|---|---|
| Respaldo lógico previo (obligatorio, I-024) | `supabase db dump` × 3 a `Rifas-backups/2026-08-05-pre-0016/` | ✅ 9 tablas de negocio, 228 líneas | — |
| Comprobación del respaldo | `grep -c '"auth"' data.sql` | ✅ **0** — ningún rastro de contraseñas ni tokens | — |
| Comprobación de secretos | `grep -ci "encrypted_password\|recovery_token\|..."` | ✅ **0** | — |
| Comparación con el respaldo de la Fase 8 | `md5sum` + `diff` | `roles.sql` y `schema.sql` **idénticos**; `data.sql` difiere solo en el token aleatorio de `pg_dump` → **los datos de producción no habían cambiado desde la Fase 8** | — |
| Ensayo en seco | `npx supabase db push --dry-run` | ✅ Una sola migración pendiente: `0016`. Ninguna otra | — |
| Aplicación | `npx supabase db push --yes` | ✅ `Applying migration 0016_organization_keeps_owner.sql` | — |
| Verificación de catálogo | `npm run verify:remote` | ✅ **13/13** | — |
| Verificación específica de `0016` (solo lectura) | Consulta directa al catálogo remoto | ✅ **9/9** | — |
| Verificación de **comportamiento** en producción | Transacción revertida con `SET CONSTRAINTS ALL IMMEDIATE` | ✅ `La organizacion quedaria sin ningun Owner activo.` → `ROLLBACK` | — |
| Estado tras la prueba de comportamiento | Owners antes vs. después | ✅ **Idéntico**: «Rifas Demo» y «Rifas Control» con 1 Owner activo cada una | — |

**Las 9 comprobaciones específicas de `0016` en el remoto:** la función existe · es `SECURITY
DEFINER` · declara `search_path=public, pg_temp` · **no es ejecutable por `anon` ni `public`** · el
trigger existe sobre `memberships` · es un `CONSTRAINT` trigger · es `DEFERRABLE INITIALLY DEFERRED` ·
la migración está registrada · toda organización tiene exactamente un Owner activo.

La cuarta es la que no se podía dar por hecha: las dos divergencias local/remoto anteriores de este
proyecto (D-038, I-020) fueron **ambas de privilegios**, ciertas en local y falsas en producción.

**Por qué se probó el comportamiento y no solo la estructura.** Que el objeto exista no demuestra que
proteja. La prueba se hizo contra producción dentro de una transacción que **nunca se confirma**: se
fuerza la validación del trigger diferido con `SET CONSTRAINTS ALL IMMEDIATE` —lo que aborta la
transacción con el error— y además se ejecuta `ROLLBACK` explícito. Se leyó el estado antes y después
para demostrar que no quedó ningún cambio.

Migraciones en el remoto tras esta operación: `0001`–`0016`, las mismas que en local.

---

## Usabilidad de tablas y listas — 2026-08-06

Trabajo de mantenimiento posterior a la Fase 9, solicitado por el usuario: fila seleccionable en las
tablas (D-076) y corrección de los estados visuales de la lista de clientes (D-077, I-033).

| Comando | Resultado | Notas |
|---|---|---|
| `npm run typecheck` | ✅ Sin errores | — |
| `npm run lint` | ✅ 0 errores | 2 avisos preexistentes de `react-hooks/incompatible-library` (TanStack Table y TanStack Virtual), ajenos a este cambio |
| `npm run test` | ✅ **207/207** en 14 archivos | +15 de `row-activation.test.ts` |
| `npm run build` | ✅ Compila | 34 rutas |
| `npm run db:reset && npm run seed:local` | ✅ 16 migraciones + 6 cuentas | Estado limpio antes de las E2E |
| `npx playwright test` (suite anterior completa) | ✅ **152/152** | Escritorio y Pixel 7 |
| `npx playwright test filas-seleccionables` | ✅ **9/9** | Suite nueva |
| Suite completa tras añadir la nueva | ✅ **161/161** | — |

### Errores encontrados durante el trabajo, y qué se hizo

| # | Qué pasó | Corrección |
|---|---|---|
| 1 | **El defecto reportado** (I-033): el cliente elegido se volvía ilegible al pasar el cursor. Contraste medido: **1,01** sobre un mínimo de 4,5 | Estados reescritos como ramas excluyentes en `OptionList` (D-077) |
| 2 | Las tres primeras pruebas de contraste daban ~1,00 **en textos perfectamente legibles** | El navegador devuelve los colores en `lab()`/`oklab()` con Tailwind 4, no en `rgb()`. Se pasó a pintarlos en un `canvas` y leer los píxeles (I-034) |
| 3 | La prueba de «no hay desplazamiento» comparaba 453 px contra 460 px | Medía durante la animación de entrada del diálogo. Se espera a que la caja deje de moverse |
| 4 | La prueba del nombre pasaba **con el CSS defectuoso puesto** | `transition-colors` seguía en marcha: medía un fondo intermedio. Se espera a que el color deje de cambiar |

### Comprobación inversa: las pruebas se vieron fallar

Con el CSS defectuoso restaurado a propósito (`hover:bg-accent` acumulado con
`bg-primary text-primary-foreground`), las dos pruebas de contraste **fallan**: 1,04 el nombre y
1,01 el teléfono. Restaurado el arreglo, 9/9 en verde. Una prueba visual que nunca se ha visto fallar
no demuestra nada.

### Verificación visual

Cuatro capturas de los estados —fila con el cursor encima, cliente sin elegir con el cursor encima,
cliente elegido, y cliente elegido con el cursor encima— tomadas con Playwright, que inicia sesión
con sus propias credenciales de prueba. **Un agente no inicia sesión a mano** (Fase 8): la sesión la
abre el arnés de pruebas, no el agente escribiendo una contraseña en un formulario.

### Dos fallos de pruebas destapados al certificar, ambos corregidos

Ninguno era un defecto del producto; los dos eran fragilidades reales de las pruebas y llevaban ahí
desde antes de este trabajo.

| Prueba | Qué pasaba | Corrección |
|---|---|---|
| `seller-tickets.spec.ts:93` (BR-I08) | Falla si la suite se corre varias veces sin `db:reset`: elige un cliente **sin escribir en el buscador** y el selector muestra solo los primeros 50 (I-035) | La suite nueva crea **un** cliente para sus cuatro pruebas y lo borra al terminar. Con el seed limpio: 161/161 |
| `tour-responsive.spec.ts:29` | El fallo intermitente de I-032, ahora **reproducido**: `boundingBox()` no auto-espera y la tarjeta del recorrido se reemplaza al cambiar de paso, así que a veces mide `null` | Medida reintentada con `expect.poll`. Verificado con 4 corridas seguidas y una suite completa |

**Corrida final, con la base recién sembrada:** `verify` ✅ · 207 unitarias ✅ · 266 de base de datos
✅ · **161 E2E ✅**.

---

## Búsqueda híbrida — 2026-08-06

Trabajo de mantenimiento posterior a la Fase 9, solicitado por el usuario (D-078, D-079).

| Comando | Resultado | Notas |
|---|---|---|
| `npm run typecheck` | ✅ Sin errores | — |
| `npm run lint` | ✅ 0 errores | 2 avisos preexistentes de `react-hooks/incompatible-library` |
| `npm run test` | ✅ **226/226** en 15 archivos | +19 de `search.test.ts` |
| `npm run build` | ✅ Compila | 34 rutas |
| `npm run test:db` | ✅ **292/292** en 13 archivos | +26 de `search.test.ts` (incluida la migración `0017`) |
| `npx playwright test` | ✅ **174/174** | Escritorio y Pixel 7, con la base recién sembrada |

### Medición del índice de boletas

Con 20.000 boletas insertadas a propósito, buscando `internal_code ilike '%000123%'`:

| | Tiempo | Páginas leídas |
|---|---|---|
| Sin índice (barrido secuencial) | 13,9 ms | 446 |
| Con `tickets_internal_code_trgm_idx` | **0,9 ms** | **89** |

La diferencia crece con la tabla: el barrido es lineal y el índice no.

### Errores encontrados durante el trabajo, y qué se hizo

| # | Qué pasó | Corrección |
|---|---|---|
| 1 | **El defecto de fondo** (I-036): los selectores de cliente precargaban 200 registros y filtraban en memoria; el cliente 201 era inencontrable | Búsqueda en servidor por Server Action, sin techo |
| 2 | El React Compiler rechazó tres cosas de los hooks nuevos: un `setState` síncrono en el cuerpo de un efecto y dos escrituras de `ref` durante el render | El apagado del indicador pasa a la limpieza del efecto; las refs se actualizan en efectos |
| 3 | `search_normalize()` nacía **ejecutable por `anon`**, rompiendo la invariante I-020 | `revoke execute … from anon, public` explícito en `0017`. **Lo destapó una prueba nueva**, no una revisión a ojo |
| 4 | El botón de limpiar se anunciaba «Limpiar buscar por código o número», que no es español | Nombre propio y corto: «Limpiar búsqueda» |
| 5 | Dos pruebas nuevas resultaron **vacías**: comparaban el `textContent` de una opción con su nombre accesible, que nunca coinciden, así que el `toHaveCount(0)` pasaba siempre | Reescritas contra el número de opciones. Comprobadas al revés: con el filtro roto, fallan |
| 6 | Al medir el hover, el ayudante devolvía el color **anterior** si las dos primeras lecturas caían antes de que el hover surtiera efecto | `backgroundAfterChange`: primero espera a que el valor cambie, después lo deja reposar |
| 7 | `aria-busy` no sirve para esperar a que termine una búsqueda: durante la pausa vale `false` sin que haya terminado nada | Las pruebas esperan al resultado real (que la lista se estreche), no al atributo |

### Comprobación inversa: las pruebas se vieron fallar

- Con el filtro del selector desactivado, «encuentra un cliente que no viene en el bloque inicial»
  falla (el cliente no aparece) y «encuentra un nombre con tildes» falla (12 opciones en vez de 1).
- Restaurado el filtro, 13/13 en verde.

### Una fragilidad ajena que salió a la luz (I-038)

`payments.spec.ts` **falla si la base ya trae pagos de una corrida anterior**, y el síntoma no es una
aserción sino `page.goto: net::ERR_ABORTED at /login`: una navegación en vuelo aborta a la siguiente.

Se aisló la causa con tres experimentos, no por descarte:

| Experimento | Resultado |
|---|---|
| `db:reset` + seed → `payments.spec.ts` dos veces seguidas, **con el código intacto** | 1.ª corrida 17/17 · 2.ª corrida **3 fallos** |
| Suite completa **sin** `busqueda-hibrida.spec.ts` | **161/161** |
| Suite completa **con** ella | 2 de 4 corridas con fallos en `payments` y `reports` |

Reducir la huella de la suite nueva no bastó: seguía fallando la mitad de las veces. La causa real
estaba en **`loginAs`**, el helper compartido. Tras `clearCookies()`, las peticiones RSC que quedaban
en vuelo se encuentran sin sesión, el navegador redirige al login por su cuenta y esa redirección
**aborta** el `page.goto('/login')` del helper. La captura del fallo mostraba la página de login ya
pintada: el producto estaba bien, la prueba perdía una carrera. Depende del tiempo total —la corrida
que pasó tardó 7,9 min y la que falló, 10,5—, y por eso aparecía al alargar la suite.

Corregido reintentando la navegación una vez ante `ERR_ABORTED` (`gotoLogin`, en `fixtures.ts`): la
segunda ya no compite con nada. Se conserva también la huella reducida de la suite nueva. Con las dos
cosas, la corrida completa da **174/174**. Los fallos de `reports.spec.ts` eran arrastre de estos.

### Aplicación de la migración `0017` al proyecto real — 2026-08-07

Autorizada explícitamente por el usuario. Procedimiento de `RUNBOOK.md` §5 y `HANDOFF.md` §3.

| Paso | Resultado |
|---|---|
| Respaldo lógico previo (roles, esquema, datos) | ✅ `Rifas-backups/2026-08-07-antes-0017/` |
| `grep -c '"auth"' data.sql` | ✅ **0** — sin contraseñas ni tokens |
| Estado previo de producción | 16 migraciones · 6 clientes · 33 boletas · 4 pagos |
| `supabase db push --dry-run` | ✅ Solo `0017` |
| `supabase db push --yes` | ✅ Aplicada |
| `npm run verify:remote` | ✅ **13/13** |
| Comprobaciones específicas de `0017` | ✅ **13/13** |
| Prueba de comportamiento (revertida) | ✅ Encuentra por «jesus», «pena», «nunez», «chucho» y el teléfono en dos formatos |
| Estado tras la prueba de comportamiento | ✅ **6 clientes antes, 6 después** |

**Las 13 comprobaciones específicas:** la migración está registrada · `clients.search_text` existe y
es **generada** (`attgenerated = 's'`) · `search_normalize` es `IMMUTABLE` · no es `SECURITY DEFINER` ·
**no es ejecutable por `anon`** · **ni por `public`** · sí por `authenticated` · los dos índices de
trigramas existen con `gin_trgm_ops` · `v_client_balances` conserva `security_invoker` tras
reescribirse · y expone `search_text` · los cuatro índices de `0003` siguen ahí · todas las filas
existentes quedaron con `search_text` poblado.

Las tres de privilegios son las que no se podían dar por hechas: las dos divergencias local/remoto
anteriores de este proyecto (D-038, I-020) fueron **ambas de privilegios**, ciertas en local y falsas
en producción. Aquí además había motivo concreto para dudar — en local esta misma función nació
ejecutable por `anon` pese a las default privileges de `0015`, y hubo que revocar a mano.

**Por qué se probó también el comportamiento.** Que la columna exista no demuestra que encuentre. La
prueba se hizo contra producción dentro de una transacción que **nunca se confirma**, con `ROLLBACK`
explícito, y se leyó el número de clientes antes y después para demostrar que no quedó nada.

**CI:** el push de `f2002f7` falló primero con `Failed to resolve latest Supabase CLI release: rate
limit exceeded` —la acción `supabase/setup-cli` no pudo descargar la CLI, nada que ver con el
código—. Se relanzó y quedó en verde **antes** de tocar producción.

### Verificación de la búsqueda en producción, desde el camino de datos de la app — 2026-08-07

**Un agente no inicia sesión en producción** (práctica fijada en la Fase 8), así que la comprobación
final por navegador con las tres cuentas la hace el usuario. Lo que sí se verificó aquí es todo el
camino que recorre la aplicación, que es donde estaba el riesgo tras un cambio de esquema.

| Comprobación | Resultado |
|---|---|
| PostgREST expone `clients.search_text` | ✅ 200 — la caché de esquema se recargó |
| PostgREST expone `v_client_balances.search_text` | ✅ 200 |
| Filtro `search_text=ilike.*…*` (el que envía la app) | ✅ 200 |
| Nombre exacto de un cliente real | ✅ lo encuentra |
| El mismo nombre en MAYÚSCULAS | ✅ lo encuentra |
| El mismo nombre con tildes añadidas («áná Tórrés») | ✅ lo encuentra |
| El mismo nombre con espacios sobrantes | ✅ lo encuentra |
| Control «zzzznoexiste» | ✅ 0 resultados |

Se usó la función real `searchNeedle` de `src/lib/search.ts` y el mismo saneado que
`src/features/clients/queries.ts`, contra la API REST de producción — no SQL a mano.

**Esta verificación encontró un defecto real: I-039.** El teléfono de un cliente está guardado como
`3101112233`; buscarlo como `+57 (310) 111-2233` **no lo encontraba**, porque el término normalizado
(`573101112233`) no es subcadena de lo guardado. Corregido reduciendo el término a su número nacional.
Tras el arreglo, los cinco formatos encuentran al cliente y el control sigue en cero:

| Escrito | Término | Resultado |
|---|---|---|
| `3101112233` | `3101112233` | ✅ |
| `+57 310 111-2233` | `3101112233` | ✅ |
| `+57 (310) 1112233` | `3101112233` | ✅ |
| `573101112233` | `3101112233` | ✅ |
| `310 111 2233` | `3101112233` | ✅ |
| `+57 (999) 999-9999` (ajeno) | — | ✅ 0 resultados |

La afirmación anterior —«encuentra el teléfono con cualquier formato»— era **más fuerte de lo que se
había probado**, y así queda anotado en I-039.

---

## Búsqueda de boletas por número — 2026-08-08

Trabajo de mantenimiento posterior a la Fase 9, solicitado por el usuario (BR-N11, D-080): la boleta
se busca por sus dos números y el código interno sale de la búsqueda y de las listas.

| Comando | Resultado | Notas |
|---|---|---|
| `npm run typecheck` | ✅ Sin errores | — |
| `npm run lint` | ✅ 0 errores | Los 2 avisos preexistentes de `react-hooks/incompatible-library` |
| `npm run test` | ✅ **238/238** en 15 archivos | +10: `ticketLabel`, las pistas del buscador y el rechazo del código interno |
| `npm run build` | ✅ Compila | 34 rutas |
| `npm run test:db` | ✅ **311/311** en 14 archivos | +19 del nuevo `ticket-search.test.ts` |
| `npx playwright test` | ✅ **178/178** | Escritorio y Pixel 7, con la base recién sembrada. +2 en `owner-tickets.spec.ts` |

### Los 8 casos del encargo, y dónde se comprueban

| Caso | Qué pide | Dónde |
|---|---|---|
| 1 | El número diario completo encuentra la boleta | `db/ticket-search.test.ts` |
| 2 | Parte del número diario también | `db/ticket-search.test.ts` |
| 3 | El número semanal completo | `db/ticket-search.test.ts` |
| 4 | Parte del número semanal | `db/ticket-search.test.ts` |
| 5 | El código interno **no** encuentra nada | `db/ticket-search.test.ts` (3 formas) + `e2e/owner-tickets.spec.ts` |
| 6 | El diario va antes que el semanal | `db/ticket-search.test.ts` (los 6 escalones) + `e2e/owner-tickets.spec.ts` |
| 7 | «00» encuentra «0017»: ceros conservados | `db/ticket-search.test.ts` + `unit/search.test.ts` |
| 8 | Limpiar restaura la lista | `e2e/busqueda-hibrida.spec.ts` (ya existía) |

Además, cuatro pruebas de que la función **hereda la RLS**: un vendedor no encuentra por número la
boleta de otro, ni pasando su `seller_id` como filtro; el personal sí las encuentra todas; y dos
organizaciones con la **misma combinación** de números no se cruzan.

### Rendimiento de los índices nuevos

Con 7.278 boletas, tras `analyze tickets`:

| Búsqueda | Plan | Páginas leídas |
|---|---|---|
| `%123%` (tres cifras) | **Bitmap Index Scan** sobre los dos índices de trigramas | 58 |
| `%00%` (dos cifras) | Barrido secuencial | 165 (1,2 ms) |

Con dos cifras PostgreSQL no puede extraer ningún trigrama completo del patrón. Queda anotado como
I-041: es una mejora parcial y conocida, no un remedio universal.

La función completa, medida de punta a punta: **4,6 ms** para «123» y **11,6 ms** para «00» —el peor
caso, 5.165 filas coincidentes que hay que ordenar—, ambas devolviendo una página de 20.

### Errores encontrados durante el trabajo, y qué se hizo

| # | Qué pasó | Corrección |
|---|---|---|
| 1 | **El orden de los resultados no tenía sentido para quien mira la lista**: buscar «010» devolvía «0100, 0103, 0109, 0105…» porque dentro del mismo escalón de relevancia ordenaba por fecha de creación | `order by relevancia, daily_number, weekly_number, id`. **Visto en pantalla**, en una captura de la tabla, no por una prueba |
| 2 | En un teléfono, «Número diario» y «Número semanal» en una sola línea empujaban la columna «Estado» fuera de la pantalla | El encabezado se deja partir en dos líneas (`whitespace-normal` gana al `nowrap` de la celda). Comprobado a 375 px |
| 3 | **La regla nueva se numeró dos veces mal**: `BR-N06` y `BR-N10` ya estaban ocupadas (misma combinación en otra rifa; validación en tres capas). Es BR-N11 | Renumerado en las 33 referencias, respetando las preexistentes |
| 4 | Cuatro pruebas nuevas de base de datos **pasaban solas y fallaban en la suite completa**: afirmaban sobre boletas del seed, y otras suites dejan miles creadas (la de volumen, 5.000) | Crean sus propias boletas con números aleatorios y las borran al terminar; las de orden acotan por `p_raffle_id` |
| 5 | **Cambió el orden del reparto de un abono** (efecto lateral real, no de las pruebas): al salir `internal_code` de la consulta de boletas por cobrar, el orden pasa de «por antigüedad» a «por número», que es el que se ve en el formulario | Se acepta —es el orden que el usuario ve— y se documenta en D-080. La prueba E2E que daba por hecho el orden de creación calcula ahora el mismo orden que la consulta |
| 6 | Una corrida completa falló en `payments.spec.ts:210` con `waitForURL` tras `clearCookies()` | **No es de este cambio**: es I-038, ya documentado. Pasa al ejecutarla sola y no volvió a aparecer en la corrida siguiente, 178/178 |

### Lo que NO cambió, comprobado

`internal_code` se sigue generando por trigger, conserva su índice único y su índice de trigramas,
sigue apareciendo en el detalle de la boleta y sigue siendo lo que identifica la fila en la base de
datos y en la auditoría. **Las claves primarias y las relaciones no se tocaron**: la fila de la tabla
se abre por `id`, igual que antes, y las 178 pruebas E2E —incluidas las de fila seleccionable— lo
confirman.

---

## Importar boletas desde CSV y JSON — 2026-08-08

Trabajo de mantenimiento posterior a la Fase 9, solicitado por el usuario (BR-N12, D-081).

| Comando | Resultado | Notas |
|---|---|---|
| `npm run typecheck` | ✅ Sin errores | — |
| `npm run lint` | ✅ 0 errores | Los 2 avisos preexistentes de `react-hooks/incompatible-library` |
| `npm run test` | ✅ **264/264** en 16 archivos | +26 del nuevo `ticket-import.test.ts` |
| `npm run build` | ✅ Compila | 34 rutas |
| `npm run test:db` | ✅ **325/325** en 15 archivos | +14 del nuevo `ticket-import.test.ts` |
| `npx playwright test` | ✅ **186/186** | +8 de `importar-boletas.spec.ts`, escritorio y Pixel 7 |

### Los 24 casos del encargo, y dónde se comprueban

| # | Caso | Dónde |
|---|---|---|
| 1 | CSV válido | `unit` |
| 2 | CSV con columna `#` | `unit` + `e2e` |
| 3 | CSV exportado de Excel (BOM + CRLF) | `unit` |
| 4 | CSV separado por `;` | `unit` + `e2e` |
| 5 | JSON válido | `unit` + `e2e` |
| 6 | JSON inválido | `unit` + `e2e` |
| 7 | Encabezado desconocido | `unit` + `e2e` |
| 8 | Mapeo manual | `unit` + `e2e` |
| 9, 10 | Falta el diario / el semanal | `unit` + `e2e` |
| 11 | Más de cuatro dígitos | `unit` + `e2e` |
| 12 | Letras y símbolos | `unit` |
| 13 | Ceros iniciales | `unit` + `e2e` (comprobado **en la base de datos** tras importar) |
| 14 | Duplicado dentro del archivo | `unit` + `e2e` |
| 15 | Duplicado existente en la rifa | `unit` + `db` + `e2e` |
| 16 | Duplicado de **otro vendedor** | `db` (y que no se revele de quién es) |
| 17 | 1.000 registros | `unit` (revisión medida) |
| 18 | Vendedor sin permiso | `db` |
| 19 | Owner/Admin | `e2e` |
| 20 | Constraint concurrente | `db` (conflicto dentro del mismo lote, informado sin tumbarlo) |
| 21 | Doble envío | `e2e` |
| 22 | Importación fallida sin datos parciales | `db` |
| 23 | Importación correcta | `e2e` |
| 24 | Auditoría | `db` |

### La prueba de «todo o nada», y por qué la primera versión no valía

El primer intento hacía fallar el lote pasando un vendedor inexistente. **Pasaba sin probar nada**:
`bulk_create_tickets` valida el vendedor *antes* de tocar la base de datos, así que no había nada que
deshacer. Reescrita para que falle **después** de haber empezado a escribir: la función reserva el
bloque de códigos (`raffles.ticket_counter`) y solo entonces inserta, de modo que un número de cinco
cifras revienta contra el CHECK con el contador ya subido.

| Comprobación | Resultado |
|---|---|
| Lote correcto de 3 filas (1 en conflicto) | 2 creadas, 1 informada, contador **+3** |
| Lote que falla a mitad | 0 creadas y contador **sin mover** |

La primera fila es la que da sentido a la segunda: si el contador no se moviera nunca, comprobar que
«no se movió» no demostraría nada.

### Errores encontrados durante el trabajo, y qué se hizo

| # | Qué pasó | Corrección |
|---|---|---|
| 1 | **La comprobación previa se rechazaba entera si el archivo traía un solo número mal escrito**, y la pantalla mostraba un mensaje de validación desconcertante. La Server Action valida lo que recibe —como debe—, pero se le estaban mandando también las filas inválidas | Se envían solo las filas con formato válido: un «12345» no cabe en la columna, así que preguntar por él no aporta nada. **Lo destapó una captura de pantalla**, no una prueba |
| 2 | El botón decía «Importando...» mientras aún estaba **comprobando** contra la rifa: las dos esperas compartían el mismo `useTransition` | Estado propio para el guardado; ahora dice «Comprobando...» y solo después «Importando...» |
| 3 | La prueba de «sin datos parciales» pasaba sin probar nada (ver arriba) | Reescrita contra el contador de códigos |
| 4 | El diálogo duplicaba `tableToRows` con una copia local | Se usa la función del módulo |

### Comprobación visual

Capturas del importador en escritorio (1280) y en teléfono (375). En el teléfono el resumen va
primero, la tabla pierde las columnas «Fila» y «Problema», y el motivo de cada fila pasa a leerse
debajo de su estado. Ninguna tabla obliga a desplazarse en horizontal.

---

## Selección múltiple y acciones masivas de boletas — 2026-08-08

Solicitado por el usuario después de la Fase 9, sin abrir fase nueva.
Reglas: BR-B01 a BR-B08. Decisiones: D-082 a D-085. Migración: `0020`.

### Suites

| Comando | Antes | Ahora |
|---|---|---|
| `npm run test` (unitarias) | 264 | **286 ✅** (+22 de `ticket-selection.test.ts`) |
| `npm run test:db` | 325 | **371 ✅** (+46 de `bulk-actions.test.ts`) |
| `npm run test:e2e` | 186 | **212 ✅** (+19 escritorio, +7 teléfono) |
| `npm run verify` | ✅ | ✅ (0 errores de lint; los 2 avisos conocidos de TanStack) |

### Qué cubre cada suite

Las tres capas prueban cosas distintas a propósito:

| Capa | Qué demuestra |
|---|---|
| Unitarias | Los recuentos y el **motivo** que se le enseña a la persona, y que el almacén de la selección aguanta lo raro: contenido corrupto, tope superado, referencias estables |
| Base de datos | Que el servidor decide. Todo o nada, concurrencia real, propiedad, organización y rol, con sesiones reales y clave pública |
| End-to-end | Que la selección sobrevive a buscar y filtrar, que la fila no se mueve, que el teléfono se puede usar con el dedo, y que llamar a las funciones **a mano** no sirve de nada |

### Concurrencia: cómo se probó de verdad

No basta con afirmar que el servidor revalida. Las pruebas simulan lo que pasa entre seleccionar y
confirmar: con el lote ya elegido, **otra sesión** (`admin`) anula una de las boletas, y solo entonces
se confirma. Resultado en las dos acciones probadas —anular y asignar—: error, y las demás boletas
**intactas**.

### Los 55 puntos del encargo (§47)

| Bloque | Dónde |
|---|---|
| Selección (1–18) | `e2e/seleccion-multiple.spec.ts` y `e2e/seleccion-movil.spec.ts`; el almacén, en `unit/ticket-selection.test.ts` |
| Admin (19–29) | `db/bulk-actions.test.ts` + `e2e/seleccion-multiple.spec.ts` |
| Vendedor (30–41) | `db/bulk-actions.test.ts` + los dos `e2e` |
| Seguridad (42–47) | `db/bulk-actions.test.ts` (sesiones reales) + tres pruebas E2E que llaman a las funciones **saltándose la pantalla**, con el token real del navegador |
| Rendimiento (48–50) | `db/bulk-actions.test.ts`: 100, 500 y **1.000** boletas, cada una en **una sola llamada** |
| Calidad (51–55) | Doble envío (botón deshabilitado + `pending`), `typecheck`, `lint`, `test`, `build` |

### Errores encontrados durante el trabajo, y qué se hizo

| # | Qué pasó | Corrección |
|---|---|---|
| 1 | **13 de 16 pruebas E2E fallaban a la primera** y el producto estaba bien: el clic caía en el hueco entre que el HTML del servidor está pintado —Playwright ya lo considera pulsable— y que React lo hidrata. La misma prueba pasaba si antes se tocaba cualquier otra cosa | `toggleCheckbox` y `activarModoSeleccion` reintentan el gesto con una espera corta dentro, para que un fallo real siga fallando rápido. Documentado en `TESTING.md` §5.3 |
| 2 | En el teléfono, los toques se perdían en silencio en cuanto la barra de selección empujaba la tabla hacia abajo | `locator.tap()` en vez de `touchscreen.tap(x, y)`: el primero desplaza a la vista y espera |
| 3 | Una prueba localizaba la fila por el **número diario**, y dos boletas distintas compartían ese número —lo único único es la pareja (BR-N04)— | Se localiza por el nombre accesible de la casilla, que lleva la combinación completa |
| 4 | Una preparación de datos llamaba a `cancel_ticket` con la clave de servicio; la RPC necesita `auth.uid()` y no hacía nada, así que la prueba comprobaba un escenario que no existía | La preparación pasa a ser un `UPDATE` directo (D-043: la service role prepara, no actúa) |
| 5 | Cambiar el texto de un `toast` rompió dos pruebas de fases anteriores: «X registrado y boleta asignada» pasó a «X registrado. Boleta asignada» | Se recuperó la redacción original y se extendió al plural: «X registrado y 6 boletas asignadas» |
| 6 | El compilador de React rechazó cuatro `setState` dentro de efectos | Se dedujeron los estados en vez de sincronizarlos: el modo selección sale de `compact && solicitado`, y «se está consultando» sale de comparar la lista de ids con la que produjo el resultado |

### Lo que se decidió no cambiar, y por qué

| Asunto | Decisión |
|---|---|
| `approve_tickets` no es todo-o-nada en la base de datos | Se deja como estaba desde la Fase 3. La pantalla lo compensa habilitando el botón solo cuando todas se pueden aprobar. Registrado como I-044 |
| Eliminar no pide contraseña ni PIN | Este proyecto no tiene reautenticación; se usa el mismo mecanismo que anular (rol + confirmación + motivo). Registrado como I-045 y D-084 |
| La `0020` no se aplicó al proyecto real | Requiere autorización explícita y respaldo previo, como todas. **Desplegar sin aplicarla rompe la selección múltiple y el cambio de vendedor individual** — I-043 |

### Aplicación de la `0020` al proyecto real — 2026-08-08

Autorizada explícitamente por el usuario para poder probar la función en Vercel.

| Paso | Resultado |
|---|---|
| Respaldo lógico previo (`Rifas-backups/2026-08-08-antes-0020/`) | ✅ 9 tablas de negocio · **0** referencias a `"auth"` · **0** `encrypted_password` |
| `db push --dry-run` | ✅ solo `0020` pendiente (las 19 anteriores ya estaban) |
| `db push --yes` | ✅ aplicada |
| `npm run verify:remote` | ✅ **13/13**, incluidas «Políticas de DELETE», «DELETE concedido a authenticated» y «Funciones propias ejecutables por anon», todas en cero |
| Privilegios de las 8 funciones nuevas | ✅ las 4 que escriben son `SECURITY DEFINER` con `search_path`, ejecutables por `authenticated` y **no** por `anon`/`public`; `ticket_bulk_eligibility` es `SECURITY INVOKER`; las 3 piezas internas **no las puede ejecutar nadie** |
| `assign_ticket` y `cancel_ticket` tras la sustitución | ✅ siguen ejecutables por `authenticated` y su definición delega en los helpers |
| Comportamiento, con sesión simulada en transacción revertida | ✅ elegibilidad, delegación intacta, una anulada no se elimina (BR-N08), todo-o-nada, y las cuatro acciones masivas responden |
| Estado de producción tras revertir | ✅ **95 boletas antes y 95 después**, 0 filas de bitácora de la prueba |
| Exposición por PostgREST con la clave pública | ✅ las cinco funciones devuelven **401 / `42501`**: están expuestas (la caché de esquema se recargó) y `anon` no puede ejecutarlas |

**Un error propio durante la verificación, y por qué importa.** La primera sonda de PostgREST mandó
el cuerpo vacío (`{}`) y las cinco funciones respondieron `404 PGRST202`. Lo interpreté como «la
caché de esquema no se ha recargado», que habría significado que la función estaría rota en
producción. Era falso: **PostgREST resuelve una función por su nombre y por las claves del cuerpo**,
así que con `{}` no encontraba ninguna sobrecarga sin argumentos. Repitiendo con los parámetros
correctos, las cinco dan `42501`. La lección para la próxima migración con funciones: sondear siempre
con los argumentos reales, porque `PGRST202` y «no está expuesta» se parecen mucho y significan cosas
distintas.

También quedó corregida una comprobación demasiado amplia: contar `action like 'ticket.bulk_%'` para
verificar que la prueba no dejó rastro incluye `ticket.bulk_create`, que existe desde la Fase 2 y es
de una carga real del usuario. Se acotó a las cuatro acciones nuevas.
