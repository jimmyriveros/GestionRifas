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
| 8 | **162 ✅** | **254 ✅** | **142 ✅** | ✅ | ✅ |
| 9 | **163 ✅** | **266 ✅** | **142 ✅** | ✅ | ✅ |
| Post-9 vigente | **359 ✅** | **518 ✅** | **294 ✅** | ✅ | ✅ |

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

---

## Auditoría de contexto y continuidad — 2026-08-09

Mantenimiento documental posterior a la Fase 9 (D-086). No cambió código, esquema, configuración
ejecutable ni comportamiento; por eso no se reejecutó Playwright. La última suite E2E funcional
registrada sigue siendo 212/212.

| Comando / verificación | Resultado | Error encontrado | Corrección o decisión |
|---|---|---|---|
| `npx supabase start` | ✅ al reintentar | Primer intento: Docker Desktop no estaba iniciado y la CLI no pudo abrir su *pipe* | Se inició Docker Desktop y se repitió el comando |
| `npm run db:reset; npm run seed:local` | ✅ 20 migraciones + seed idempotente | La CLI avisa que `supabase/seed.sql` no existe | El seed real es `scripts/seed.ts`; deriva registrada como I-048, sin tocar configuración fuera de alcance |
| `npm run verify` | ✅ typecheck, lint, 286 unitarias y build de producción | 2 avisos conocidos de React Compiler por `useReactTable` y `useVirtualizer`; 0 errores | Sin cambio: las librerías son incompatibles con memoización automática y React omite esa optimización de forma segura |
| `npm run test:db` (dos corridas sin resembrar) | ✅ ambas: 16 archivos, 371/371 | — | Confirma que la suite actual conserva la idempotencia descrita en `TESTING.md` §6.1 |
| `npm run format:check` | ❌ 60 archivos existentes de código/pruebas | El árbol funcional actual no cumple el check global; ningún documento de esta auditoría apareció entre los fallos | No se hizo un reformateo masivo fuera de alcance; registrado como I-052 |
| `npx prettier --check <16 documentos modificados>` | ✅ | — | Confirma que la documentación de esta auditoría sí cumple Prettier |
| `git diff --check` | ✅ | — | Sin errores de espacios ni marcadores de conflicto |

---

## Clientes en la importación CSV/JSON — 2026-08-09

Mantenimiento funcional posterior a la Fase 9, solicitado por el usuario (BR-N12, D-087).
Migración `0021_ticket_import_clients.sql`, aplicada **solo en local**.

### Resultado verificado

- CSV y JSON admiten filas mezcladas con y sin cliente. Cuando hay cliente, nombre y celular son
  obligatorios juntos; una fila incompleta queda fuera antes de confirmar.
- Varias boletas con el mismo nombre + celular normalizados crean o reutilizan un solo cliente.
  Coincidencia archivada/múltiple o el mismo celular con otro nombre se bloquea; el ámbito nunca
  cruza vendedor u organización.
- Owner/Admin importa y asigna dentro de una transacción que reutiliza `assign_ticket_row`. Seller
  conserva la ruta anterior: sin cliente y `pending_approval`.
- Los archivos antiguos de dos columnas conservan parser, vista previa y persistencia anteriores.

### Comandos y resultados

| Comando / verificación | Resultado | Nota |
|---|---|---|
| Baseline: `npm run db:reset; npm run seed:local; npm run test:db; npm run verify` | ✅ 20 migraciones, 371/371 DB y 286 unitarias | Árbol limpio antes de implementar; 2 avisos conocidos de TanStack |
| `npx vitest run tests/unit/ticket-import.test.ts` | ✅ 33/33 | Alias CSV/JSON, par obligatorio, filas mixtas, normalización, conflictos y Seller |
| `npx vitest run --config vitest.db.config.mts tests/db/catalog.test.ts tests/db/ticket-import.test.ts` | ✅ 41/41 | Privilegios, ámbito, creación/reutilización, rollback y celular obligatorio |
| `npm run db:reset; npm run seed:local; npm run test:db` | ✅ 21 migraciones; 16 archivos, **378/378** | `0021` aplica desde cero y la suite usa sesiones reales |
| `npm run verify` | ✅ typecheck, lint, **293 unitarias** y build | 0 errores; los mismos 2 avisos conocidos de React Compiler/TanStack |
| `npx playwright test tests/e2e/importar-boletas.spec.ts --project=escritorio` tras reset + seed | ✅ **9/9** | Incluye lote mixto, un cliente para dos boletas y fila sin celular excluida |
| `npm run db:reset; npm run seed:local; npm run test:e2e` (corrida final) | ✅ **213/213** en 11,0 min | Escritorio + Pixel 7, un worker y base compartida |
| `npx supabase gen types typescript --local` comparado con `database.types.ts` | ✅ | Las cuatro funciones de `0021` están representadas; `archived_at` se conserva nullable por comportamiento real |
| `git diff --check` | ✅ | Sin espacios inválidos ni marcadores de conflicto antes del cierre |

### Errores encontrados y correcciones

| Hallazgo | Evidencia | Corrección / decisión |
|---|---|---|
| Playwright no pudo abrir Chromium después de la versión instalada | `Executable doesn't exist ... chromium_headless_shell-1234` antes de ejecutar el caso | `npx playwright install chromium`; el caso nuevo pasó inmediatamente después |
| La primera suite completa quedó **212/213** | La pantalla decía «2 con datos incompletos o mal escritos», pero la prueba histórica esperaba «2 con números mal escritos» | Se actualizó la expectativa: ahora el texto cubre números **y** cliente. Spec 9/9 y repetición completa 213/213 |
| Un reintento de la spec sin `db:reset` dio 5 falsos fallos de consultas | La suite completa anterior dejó rifas adicionales; la pantalla eligió una y el helper consultó la rifa original del seed | Se respetó la precondición de `TESTING.md`: reset + seed antes de E2E. Los 9 casos pasaron. No se cambió producto para acomodar datos contaminados |
| Dos nombres distintos con el mismo celular dentro del archivo podían verse como dos clientes nuevos hasta confirmar | La RPC abortaba de forma segura, pero la primera vista previa era demasiado optimista | La revisión local marca ambas filas como `client-conflict`; la RPC mantiene el rollback como última frontera |

### Estado de promoción

No se ejecutó `db push`, `verify:remote`, despliegue ni operación sobre el Supabase real. El frontend
con filas de cliente depende de `0021`; promoverlo antes de desplegar requiere autorización expresa,
respaldo y verificación remota (I-054). Los archivos sin cliente siguen usando el camino anterior.

### Nota posterior — promoción de `0021` al proyecto real

El usuario autorizó el 2026-08-09 el push a `main` para probar el cambio en Vercel. Como el frontend
depende de las RPC nuevas, se promovió primero la migración siguiendo D-070 y el procedimiento de
`DEPLOYMENT.md` §2.2.

| Comando / verificación | Resultado | Nota |
|---|---|---|
| Respaldo lógico externo | ✅ | `D:\Claude\Personal\Rifas-backups\2026-08-09-antes-0021`: `roles.sql`, `schema.sql` y `data.sql`; validación de datos: 0 referencias a `auth`, contraseñas o tokens |
| `npx supabase db push --dry-run` | ✅ | Mostró únicamente `0021_ticket_import_clients.sql` pendiente |
| `npx supabase db push --yes` | ✅ | `0021` aplicada al proyecto Supabase real |
| `npm run verify:remote` | ✅ **13/13** | RLS/FORCE RLS, vistas, `search_path`, privilegios de tablas y funciones, y ausencia de `DELETE` directo |
| Sonda de catálogo de `0021` | ✅ | Migración, cuatro funciones, las dos RPC `SECURITY DEFINER`, `search_path`, privilegios e índice verificados; `anon`/`PUBLIC` sin ejecución |
| Sonda transaccional como Owner | ✅ | Importó 3 filas: 2 asignadas al mismo cliente y 1 disponible; la vista previa encontró la coincidencia exacta |
| Rollback y comprobación posterior | ✅ **0 residuos** | 0 clientes y 0 boletas de la sonda en el proyecto real |

I-054 queda resuelto. La base se promovió antes del push del consumidor a `main`.

---

## Corrección autorizada de datos en producción — 2026-08-09

Intervención operativa solicitada explícitamente después de probar la importación con clientes. No
cambió código, esquema ni reglas del producto. Los nombres y celulares del cliente real no se copian
a este registro; la bitácora autoritativa de las filas vive en `audit_logs`.

| Comando / verificación | Resultado | Nota |
|---|---|---|
| Inspección de clientes, boletas, pagos, asignaciones y FK | ✅ | Dos boletas erróneas sin pagos; cliente duplicado con solo esas dos boletas; cliente demo con exactamente dos boletas anuladas, motivo demo y 0 pagos |
| Respaldo lógico externo | ✅ | `D:\Claude\Personal\Rifas-backups\2026-08-09-antes-correccion-clientes`: `roles.sql`, `schema.sql` y `data.sql`; archivos no vacíos y 0 referencias a Auth, contraseñas o tokens en datos |
| Transacción `SERIALIZABLE` con bloqueos de fila | ✅ | 2 reasignaciones al cliente correcto, 1 cliente duplicado eliminado, 2 boletas demo eliminadas y 1 cliente demo eliminado; cualquier deriva de identidad, estado, cantidad o pagos abortaba todo |
| Auditoría dentro de la transacción | ✅ **6/6** | 2 `ticket.update`, 2 `ticket.delete` y 2 `client.delete` generados por los triggers existentes |
| Verificación posterior desde una conexión nueva | ✅ | 2/2 boletas asignadas al destino correcto; 0 clientes objetivo residuales y 0 boletas demo residuales |
| `npm run verify:remote` | ✅ **13/13** | Las invariantes de seguridad y catálogo del proyecto real permanecen en verde |
| `https://gestion-rifas.vercel.app` | ✅ HTTP 200 | La aplicación siguió disponible; no hizo falta despliegue |

La eliminación física fue una excepción explícita para corregir datos erróneos/demo sin movimientos,
no una modificación de BR-C06 ni BR-N08. El flujo normal sigue siendo archivar clientes y conservar
boletas anuladas.

---

## Eliminación autorizada de las ocho boletas demo anuladas — 2026-08-09

Seguimiento operativo solicitado explícitamente después de la corrección anterior. No cambió código,
esquema ni reglas del producto.

| Comando / verificación | Resultado | Nota |
|---|---|---|
| Inspección de todas las boletas `cancelled` | ✅ **8 exactas** | Códigos consecutivos `R001-000024`–`R001-000031`; todas con motivo demo, cliente/precio nulos, saldo cero y 0 asignaciones de pago |
| Respaldo lógico externo | ✅ | `D:\Claude\Personal\Rifas-backups\2026-08-09-antes-eliminar-8-boletas-demo`: `roles.sql`, `schema.sql` y `data.sql`; archivos no vacíos y 0 referencias a Auth, contraseñas o tokens en datos |
| Transacción `SERIALIZABLE` con bloqueos de fila | ✅ **8/8** | El conjunto completo se volvió a validar antes del `DELETE`; cualquier novena fila, dependencia o cambio de estado abortaba todo |
| Auditoría dentro de la transacción | ✅ **8/8** | Ocho `ticket.delete` generados por el trigger existente |
| Verificación posterior desde una conexión nueva | ✅ | 0 boletas `cancelled` y 0 filas con los ocho códigos retirados |
| `npm run verify:remote` | ✅ **13/13** | Las invariantes de seguridad y catálogo permanecen en verde |
| `https://gestion-rifas.vercel.app` | ✅ HTTP 200 | La aplicación siguió disponible; no hizo falta despliegue |

El borrado físico fue una excepción explícita para retirar el inventario demo inicial, no una
modificación de BR-N08. Las boletas anuladas durante la operación normal se siguen conservando.

---

## Preflight de publicación estable — 2026-08-10

El usuario autorizó revisar y publicar todo lo pendiente en `main`. La comparación contra
`origin/main` encontró únicamente los dos commits documentales que registran las intervenciones de
datos del 2026-08-09; no había archivos sin commit ni cambios ejecutables.

| Comando / verificación | Resultado | Nota |
|---|---|---|
| `git diff --check origin/main..HEAD` | ✅ | Dos archivos documentales; sin cambios en código, pruebas, dependencias, configuración o migraciones |
| `npm run verify` | ✅ | Typecheck; lint con 0 errores y 2 avisos conocidos de TanStack; **293/293** unitarias; build de producción exitoso |
| `npm run verify:remote` | ✅ **13/13** | Invariantes de seguridad y catálogo del proyecto Supabase real en verde |
| `npx supabase db push --dry-run` | ✅ | `Remote database is up to date`; 0 migraciones, seeds o roles pendientes |
| `npx prettier --check docs/HANDOFF.md docs/TEST_RESULTS.md` | ✅ | Los documentos de cierre cumplen el formato del repositorio |

No se repitió `test:e2e`: los commits pendientes son exclusivamente documentales y no cambian rutas,
UI, autenticación, autorización ni integraciones. La última suite funcional completa permanece en
**213/213** y el CI vuelve a reconstruir el proyecto y la base desde cero después del push.

---

## «Mis boletas» sin filtro ni columna de rifa — 2026-08-10

Mantenimiento de interfaz posterior a la Fase 9, solicitado por el usuario (D-088). **Sin cambios de
base de datos, esquema, RLS ni consultas**: solo props de componentes que ya se parametrizaban.
En el mismo trabajo se corrigieron dos derivas documentales detectadas en la revisión previa.

| Comando / verificación | Resultado | Nota |
|---|---|---|
| `npm run typecheck` | ✅ | Sin errores |
| `npm run lint` | ✅ **0 errores** | Los 2 avisos de siempre: `useReactTable` y `useVirtualizer` (React Compiler / TanStack) |
| `npm run test` | ✅ **293/293** | 17 archivos; sin pruebas unitarias nuevas: el cambio es de composición de columnas |
| `npm run build` | ✅ | Build de producción completo |
| `npm run db:reset; npm run seed:local` | ✅ 21 migraciones + seed | Precondición de las E2E (`TESTING.md`) |
| `npx playwright test` (4 specs del vendedor) | ✅ **52/52** | Primera pasada dirigida: `seller-tickets`, `seleccion-multiple`, `seleccion-movil`, `filas-seleccionables` |
| `npm run test:e2e` (suite completa tras resembrar) | ✅ **213/213** en 10,7 min | Escritorio + Pixel 7. Confirma que el portal administrativo conserva filtro y columna |
| `npm run test:db` | ✅ **378/378** | 16 archivos. Se ejecuta como puerta del proyecto aunque el cambio no toque SQL |
| Comprobación visual de las dos pantallas | ✅ | Capturas de `/seller/tickets` y `/owner/tickets` generadas con el propio arnés de Playwright (`loginAs`), contra la base local |

### Qué se comprobó exactamente

- En `/seller/tickets` quedan tres filtros —Cliente, Estado de la boleta, Estado de pago— y seis
  columnas: número diario, número semanal, cliente, estado, pago y precio.
- «Ver seleccionadas» enseña las mismas columnas que la lista de detrás: es la misma pantalla, y por
  eso `TicketListSlot` recibe también `showRaffle`.
- `/owner/tickets` mantiene el filtro «Rifa» y la columna «Rifa» intactos.
- La prueba `seller-tickets.spec.ts` («la tabla no muestra la columna Vendedor…») gana dos
  aserciones: ni `columnheader` «Rifa» ni control etiquetado «Rifa».

### Errores encontrados y correcciones

| Hallazgo | Evidencia | Corrección / decisión |
|---|---|---|
| Docker Desktop no estaba iniciado al comenzar | `failed to connect to the docker API at npipe:…` | Se localizó el ejecutable en `%LOCALAPPDATA%\Programs\DockerDesktop` y se esperó al daemon antes de `supabase start`. Es la trampa ya registrada como I-028 |
| `prettier --check` marca 4 de los archivos tocados | `TicketsTable.tsx`, `SelectedTicketsView.tsx`, `seller/tickets/page.tsx`, `seller-tickets.spec.ts` | **Ya fallaban en `HEAD`**, comprobado ejecutando Prettier sobre las versiones originales extraídas con `git show`. Es I-052 preexistente; no se reformateó nada fuera de alcance |

### Estado de promoción

El usuario autorizó publicarlo el mismo día. **No se ejecutó ninguna escritura sobre el Supabase
real**: este cambio no lleva migración, y el `--dry-run` lo confirmó antes de empujar nada.

| Comando / verificación | Resultado | Nota |
|---|---|---|
| `npx supabase db push --dry-run` | ✅ | `Remote database is up to date`; 0 migraciones, seeds o roles pendientes. Es lo que descarta desplegar un frontend por delante de su base |
| `git push origin main` | ✅ `2043108..7b1bff5` | **Solo la rama.** Las etiquetas `fase-3`…`fase-9` siguen sin subir, como estaban |
| CI de GitHub Actions | ✅ **2/2** | «Typecheck, lint, unitarias, build» y «Migraciones desde cero + pruebas de base de datos» |
| Despliegue de Vercel | ✅ `READY` | `dpl_7tYWrsjYivbwybtFtKbAErA3rf5M`, target `production`, sobre el SHA `7b1bff5`; se comprobó el SHA en vez de fiarse de que la URL respondiera |
| `https://gestion-rifas.vercel.app/login` | ✅ HTTP 200 | Cabeceras intactas: CSP con nonce, HSTS con `preload`, `X-Content-Type-Options`, `X-Frame-Options: DENY` |

**Verificación manual pendiente del usuario:** entrar a producción como vendedor y confirmar la
pantalla. Un agente no inicia sesión en producción (Fase 8).

---

## I-055 — la prueba de importación afirmaba sobre la boleta equivocada — 2026-08-10

Corrección solicitada por el usuario tras ver el CI en rojo. **Solo pruebas**: no cambia producto,
esquema ni consultas.

### Cómo apareció, y por qué no era una regresión

El CI del commit `bb6db5f` —**solo documentación**— falló en `tests/db/ticket-import.test.ts:414`
con `expected 'available', received 'cancelled'`. El commit funcional anterior (`7b1bff5`) había
pasado 2/2 y la suite pasaba en local, así que la diferencia no podía estar en el código: el diff
entre ambos commits es prosa. Eso apuntaba a azar, no a regresión — pero no se cerró como
«intermitente» sin encontrar el mecanismo.

### Mecanismo

`recordarBoletas()` consultaba `.in('daily_number', …)` **sin el número semanal**, y `numeros()`
sortea los dígitos. Un número diario puede repetirse en otra combinación (BR-N07), así que el
`find()` podía quedarse con una boleta de otra prueba en vez de la recién importada.

Reproducido de forma determinista plantando dos boletas con el mismo diario:

```
datos plantados: 4242/1111:cancelled   4242/2222:available
la consulta devuelve las dos; find() elige -> 4242/1111 -> cancelled
```

### Corrección y comprobación al revés

Se acota por la **combinación completa**, que es lo único único dentro de una rifa (BR-N04). Efecto
secundario bueno: la limpieza del `afterAll` ya no puede borrar boletas de otras pruebas (I-035).

| Comando / verificación | Resultado | Nota |
|---|---|---|
| Comprobación al revés con los mismos datos | ✅ | Lógica vieja → `cancelled`; lógica nueva → `available` |
| `npm run typecheck` · `npm run lint` | ✅ 0 errores | Los 2 avisos conocidos de TanStack |
| `npm run db:reset; npm run seed:local; npm run test:db` | ✅ **378/378** | Base recién sembrada, la condición del CI |
| `npm run test:db` ×3 más, **sin resembrar** | ✅ 378/378 cada una | Es el escenario donde la colisión era más probable |

---

## Flecha de volver en las pantallas de detalle — 2026-08-10

Mantenimiento posterior a la Fase 9, a petición explícita del usuario (BR-X09, D-089). Patrón de
navegación hacia atrás compartido para las pantallas de detalle. **Sin migraciones ni cambios de
esquema, RLS o consultas.**

### Comandos y resultados

| Comando / verificación | Resultado | Nota |
|---|---|---|
| `npm run typecheck` | ✅ | Sin errores, en cada iteración del diseño |
| `npm run lint` | ✅ **0 errores** | Los 2 avisos de siempre: `useReactTable` y `useVirtualizer` |
| `npm run test` | ✅ **293/293** | Sin pruebas unitarias nuevas: el mecanismo se verifica de punta a punta con Playwright, que es lo único que puede probar historial real del navegador |
| `npm run build` | ✅ | Build de producción completo |
| `npm run db:reset; npm run seed:local; npm run test:db` | ✅ **378/378** | Puerta del proyecto para cambios funcionales, aunque este no toque SQL |
| `npx playwright test tests/e2e/back-navigation.spec.ts --project=escritorio` | ✅ **9/9** | Historial real con filtro conservado, listado→detalle→volver en boletas/clientes/rifas, editar rifa vuelve al detalle, URL directa (misma pestaña y pestaña nueva), teclado, cambiar contraseña |
| `npx playwright test tests/e2e/back-navigation-movil.spec.ts --project=movil` | ✅ **2/2** | Diana de 44×44 con `tap()`, título largo sin desbordamiento horizontal |
| `npm run db:reset; npm run seed:local; npm run test:e2e` (suite completa) | ✅ **224/224** en 11,4 min | 213 anteriores + 11 nuevas (9 escritorio + 2 móvil); confirma que ninguna pantalla existente se rompió |
| `npx prettier --write` sobre 3 archivos con estilo pendiente | ✅ | Solo formato (indentación/salto de línea); recomprobado con `--check` y con las mismas 11 pruebas E2E después de escribir |

### Los 8 casos del encargo, y dónde se comprueban

| Caso | Qué pide | Dónde |
|---|---|---|
| A — Mis boletas → detalle → ← | Vuelve a Mis boletas | `back-navigation.spec.ts`, «boletas del vendedor» |
| B — Clientes → detalle → ← | Vuelve a Clientes | `back-navigation.spec.ts`, «clientes: vuelve al listado» |
| C — Lista con búsqueda y filtro → detalle → ← | Conserva el contexto | `back-navigation.spec.ts`, «Caso C, BR-N11» — literal: la URL de vuelta es bit a bit la misma, y el campo de búsqueda conserva el término escrito |
| D — Lista con scroll → detalle → ← | Restaura la posición aproximada | No tiene una prueba dedicada: lo hace la restauración de scroll nativa de Next.js/el navegador en una navegación con historial real (`router.back()`), y este trabajo no construye ningún mecanismo propio de scroll — hacerlo habría sido el «sistema de estado innecesariamente complejo» que el encargo pide evitar |
| E — URL directa → ← | Usa el destino de repuesto, nunca saca de la app | `back-navigation.spec.ts`, «sin historial real», dos pruebas: misma pestaña tras iniciar sesión, y una pestaña nueva de la misma sesión |
| F — Teclado | Foco + `Enter` activa | `back-navigation.spec.ts`, «teclado» |
| G — Móvil | Diana cómoda, título sin desbordar | `back-navigation-movil.spec.ts`, las dos pruebas |
| H — Cambios sin guardar | La flecha no debe saltarse la protección | No aplicable: este proyecto no tiene ninguna protección de cambios sin guardar en ningún formulario (comprobado con una búsqueda exhaustiva de `beforeunload`/`isDirty`/`formState` antes de tocar nada); no había nada que preservar ni nada que romper |

### El defecto de diseño que encontró la propia prueba del Caso E

La primera versión de `hasInternalHistory()` comparaba `window.history.length` contra una marca
guardada en `sessionStorage` al llegar a la pestaña. Parecía correcta hasta que la prueba «una boleta
abierta por URL directa usa el destino de repuesto» la desmintió: después de `loginAs()` (que hace un
`page.goto('/login')` real y luego una redirección), abrir el detalle directamente y pulsar «Volver»
terminaba en `/owner/dashboard`, no en el listado de boletas. `sessionStorage` sobrevive a una carga
dura, así que el historial que el detector encontraba era el del propio flujo de login, no nada
relacionado con la boleta. Corregido con un contador de **variable de módulo**: una carga dura
reinicia todo el contexto de JavaScript y lo deja en 0 sola, sin código adicional. Detalle completo,
con las alternativas descartadas, en `docs/DECISIONS.md` D-089.

### Otros dos hallazgos, menores

| Hallazgo | Corrección |
|---|---|
| Dos pruebas nuevas esperaban el encabezado de columna «Nombre» en clientes y en rifas | Los encabezados reales son «Cliente» y «Rifa»; se corrigió la prueba, no el producto |
| La primera pasada sobre `/owner/tickets` con filtro agotó el tiempo (60 s) | Compilación en frío de esa ruta bajo Turbopack en modo desarrollo, la primera vez que se visitaba en esa sesión del servidor. Aislada repitiendo la prueba sola (pasó en 4,6 s) y confirmada al repetir la suite completa con las rutas ya calientes (9/9) |

### Estado de promoción

El usuario autorizó publicarlo el mismo día. No se ejecutó `db push` ni `verify:remote`: este cambio
no lleva migración, y el `--dry-run` lo confirmó antes de empujar nada.

| Comando / verificación | Resultado | Nota |
|---|---|---|
| `npx supabase db push --dry-run` | ✅ | `Remote database is up to date`; 0 migraciones, seeds o roles pendientes |
| `git push origin main` | ✅ `e9d3444..a25a289` | Solo la rama; las etiquetas `fase-3`…`fase-9` siguen sin subir |
| CI de GitHub Actions | ✅ **2/2** | «Typecheck, lint, unitarias, build» y «Migraciones desde cero + pruebas de base de datos» |
| Despliegue de Vercel | ✅ `READY` | `dpl_DKSiVvf3YFDKd5HKLmwxkCEYqmQD`, target `production`, sobre el SHA `a25a289`; comprobado el SHA, no solo que la URL respondiera |
| `https://gestion-rifas.vercel.app/login` | ✅ HTTP 200 | CSP con nonce, HSTS, `X-Frame-Options: DENY` intactas |

**Verificación manual pendiente del usuario:** entrar a producción con los tres roles y comprobar la
flecha en cada pantalla de detalle. Un agente no inicia sesión en producción (Fase 8).

---

## Equipos, avisos y comisiones (post-9) — 2026-08-12

Funcionalidad completa de equipos de vendedores, avisos y comisiones por tramos
(D-091 a D-095, BR-E01..BR-E13, BR-G01..BR-G12). Migraciones `0022`, `0023` y `0024`,
**solo en local**: no se han promovido al proyecto real.

### Resultados

| Verificación | Resultado |
|---|---|
| `npm run test:db` | ✅ **429/429** (19 archivos). 51 pruebas nuevas: 21 de equipos, 11 de avisos, 19 de comisiones |
| `npm run test:db` **dos veces sobre la misma base** | ✅ 429/429 las dos pasadas — comprueba que las suites no se contaminan entre sí |
| `npm run verify` | ✅ typecheck · lint 0 errores (2 avisos preexistentes) · **299/299** unitarias · build |
| `npx playwright test` | ✅ **242/242** tras `db:reset` + `seed:local` (15 nuevas: 10 de equipo y comisión, 5 de móvil) |
| Revisión visual | ✅ 320, 375, 390, 430 px y escritorio, sin desbordamiento horizontal |

### Errores encontrados y corregidos

Todos salieron de las pruebas o de la revisión visual, no de releer el código.

| # | Error | Cómo se encontró | Corrección |
|---|---|---|---|
| 1 | **Recursión infinita de RLS**: la política de alta consultaba `memberships` dentro de una política de `memberships` | Primera ejecución de las pruebas de equipos | Función `current_profile_leads_team()` `SECURITY DEFINER`, como `current_org_ids()` (D-091) |
| 2 | **I-019 reintroducido**: `profiles_select` y `memberships_select` se reescribieron sobre el texto de `0001`/`0011` en vez del vigente de `0014`, volviendo a llamar una función por fila | Comprobaciones de catálogo F7-03 | Reescritas sobre la definición vigente. Lección anotada en D-091 |
| 3 | **Una función nueva nace ejecutable por `anon`** pese a las *default privileges* de `0015` | `catalog.test.ts` | `revoke execute … from anon, public` explícito, también en funciones de trigger (I-020) |
| 4 | **Ampliar `tickets_select` habría cambiado media docena de pantallas del vendedor** en silencio: «Mis boletas», panel, reportes, búsqueda, selección múltiple y detalle de boleta | Revisión de consumidores antes de construir la pantalla del equipo | Se revirtió: las ventas del equipo van por funciones que se autorizan solas (D-092) |
| 5 | `coalesce(p_movement, case … 'sale' … end)` — los literales de un `case` son `text` hasta castearlos al enum | Seed, al aplicar `0024` | Cast explícito a `commission_movement` |
| 6 | **Reasignar una boleta vendida es imposible**, y no por BR-B04 sino por el esquema: `tickets_client_seller_fk` es compuesta y no diferible | La prueba que iba a demostrar el recálculo | La prueba ahora afirma la realidad; el motor conserva su rama para boletas sin vender (nota de BR-G07) |
| 7 | **Contaminación entre suites**: mis pruebas montaban equipo sobre `vendedor1`, cuenta compartida del seed, y hacían fallar `phase3-admin` según el orden | Suite completa de base de datos | Cada suite crea sus propios vendedores padre (I-035) |
| 8 | **«La rifa activa más reciente» era una regla mala**: con varias activas eligió una sin ventas y mostró **$0 a un vendedor que tenía $80.000** | Primera revisión visual de la tarjeta | `getCurrentCommissionRaffle()` elige donde está el trabajo, y la pantalla dice de qué rifa habla (D-095) |
| 9 | **I-055 en dos suites preexistentes**: `importar-boletas` y `filas-seleccionables` identificaban boletas por el número diario suelto, que se repite entre combinaciones | Fallos intermitentes de la suite completa | Ambas identifican por el par completo. Eran defectos previos que este trabajo destapó |

### Lo que estas pruebas comprueban y antes no existía

* **Los tramos, uno por uno**: 0, 1, 20, **21**, 30, **31**, 50, **51** — y las bajadas 51→50, 31→30, 21→20.
* **La invariante del dinero**: `SUM(commission_ledger) = seller_commissions.earned` en **cada** escenario.
* **No hay doble comisión**: diez recálculos seguidos no escriben ni una fila.
* **La jerarquía del encargo entera**: Carlos ve a Pedro y Andrea y no a Felipe; Juan ve a Felipe y no a los de Carlos; el personal los ve a todos.
* **Los avisos llegan a quien deben y a nadie más**, y ni el Dueño puede leer la bandeja de otro.
* **El teléfono**: 320–430 px sin desbordamiento, el importe sin cortarse, la campanita y «Agregar vendedor» alcanzables.

### Promoción a producción — 2026-08-13

Autorizada explícitamente por el dueño del producto. Es la primera promoción de esta funcionalidad, y
la primera que lleva **tres** migraciones a la vez.

| Paso | Resultado |
|---|---|
| **Respaldo lógico previo** (obligatorio, plan Free — I-024) | ✅ `Rifas-backups/2026-08-13-pre-0022-0024/`: 2 organizaciones, 6 perfiles, 6 membresías, 2 rifas, 48 clientes, 140 boletas, 4 pagos. **0 referencias a `auth`**, ningún `encrypted_password` |
| `supabase db push --dry-run` | ✅ exactamente `0022`, `0023` y `0024`; nada más |
| `supabase db push --yes` | ✅ las tres aplicadas |
| `npm run verify:remote` | ✅ **13/13** sobre el proyecto real |
| CI de GitHub Actions | ✅ **2/2**, incluido «Migraciones desde cero + pruebas de base de datos» con las 24 |
| Despliegue de Vercel | ✅ `READY`, `dpl_5BAQgGXJvKpFKvpRK22hnKfPN6th`, target `production`, **SHA `6ce988f` comprobado** |
| `https://gestion-rifas.vercel.app/login` | ✅ HTTP 200; raíz 307. CSP con nonce, HSTS y `X-Frame-Options: DENY` intactas |

**Sonda de comportamiento sobre los datos reales**, además del catálogo:

| Comprobación | Resultado |
|---|---|
| Tramos sembrados por organización | ✅ 4 en «Rifas Demo» y 4 en «Rifas Control», de $20.000 a $40.000 |
| **Ningún vendedor convertido en sub-vendedor** | ✅ 0 membresías con `parent_seller_id` — la propiedad que más importaba de `0022` |
| Saldo de partida | ✅ Un vendedor con 2 boletas cobradas → `$40.000` a tarifa `$20.000` |
| `SUM(commission_ledger) = seller_commissions.earned` | ✅ cuadra en producción |

**Verificación manual pendiente del usuario:** entrar con los tres roles y recorrer «Mi equipo», la
tarjeta «Tu ganancia» y la campanita. Un agente no inicia sesión en producción (Fase 8).

---

## Dos formas de pago (post-9) — 2026-08-13

Corrección de alcance pedida por el dueño del producto al ver la pantalla en producción: los tramos
son de quien fue creado dentro de un equipo; quien no depende de nadie cobra **la mitad del precio
vigente de la rifa** (D-096, BR-G13..BR-G16). Migración `0025`.

| Verificación | Resultado |
|---|---|
| `npm run test:db` | ✅ **435/435** (20 archivos; 6 nuevas en `commission-modes.test.ts`) |
| `npm run verify` | ✅ typecheck · lint 0 errores · 299/299 unitarias · build |
| Revisión visual | ✅ las dos tarjetas a 390 px: la de la mitad sin niveles ni barra, la de tramos con progreso y proyección |

### Errores encontrados y corregidos

| # | Error | Cómo se encontró | Corrección |
|---|---|---|---|
| 1 | **Primera lectura equivocada de la regla**: se ocultó la tarjeta a quien no pertenece a un equipo | La segunda respuesta del dueño: no es que no ganen, es que ganan con otra regla | Se implementaron las **dos** formas de pago; ocultarla habría escondido dinero que sí se debe |
| 2 | La suite de tramos usaba un vendedor **sin equipo**, que desde `0025` cobra la mitad | 14 fallos en `commissions.test.ts` | Su vendedor pasa a pertenecer a un equipo; la otra forma vive en su propio archivo |
| 3 | **La bandeja de avisos se salía 42 px a 320 px** | `equipo-movil.spec.ts` | Tope de ancho; `w-80` son 320 px exactos y no dejaba margen |
| 4 | **La limpieza de las pruebas E2E fallaba en silencio**: cada ejecución dejaba **9 cuentas** sin borrar | El recorrido guiado empezó a fallar en la suite completa: el panel del Dueño crecía y el globo quedaba fuera de la pantalla | Causa de fondo: borrar las asignaciones sin su pago rompe el cuadre diferido, y borrar el pago primero choca con `alloc_payment_client_fk`; como cada petición de PostgREST es una transacción, no se podían agrupar. Nuevo `purgeSellers()` con conexión directa, en **una** transacción, y con los errores propagados. Comprobado: tras la suite quedan **3 vendedores, los del seed** |
| 5 | **`/owner/dashboard` se desplaza en horizontal a 320 px** | La misma prueba móvil | **Preexistente y ajeno**: tabla sin contenedor con `overflow-x`, en un archivo no tocado. Registrado como **I-056**; la prueba se acotó a la bandeja para no fallar por un defecto que no introduce ni arregla |

### Promoción a producción — 2026-08-13 (migración `0025`)

| Paso | Resultado |
|---|---|
| Respaldo lógico previo | ✅ `Rifas-backups/2026-08-13-pre-0025/`: 13 tablas con datos, **0 referencias a `auth`**, ningún `encrypted_password` |
| `db push --dry-run` | ✅ únicamente `0025_commission_modes.sql` |
| `db push --yes` | ✅ aplicada |
| `npm run verify:remote` | ✅ 13/13 |
| CI de GitHub Actions | ✅ 2/2 |
| Despliegue de Vercel | ✅ `READY`, `dpl_CGKfmRnTaXn5ttMaGWkJNgqB1Nnp`, **SHA `4138d20` comprobado** |
| `https://gestion-rifas.vercel.app/login` | ✅ HTTP 200; raíz 307; CSP, HSTS y `X-Frame-Options` intactas |

**Recálculo sobre datos reales, comprobado:** el único vendedor con boletas cobradas —sin equipo—
pasó de `$40.000` (tramos) a **`$100.000`** (2 boletas × la mitad de $100.000), y
`SUM(commission_ledger) = seller_commissions.earned` sigue cuadrando en producción.

---

## Corregir a un integrante pendiente (post-9) — 2026-08-14

Encargo del dueño del producto (`Equipo.txt`): mientras un integrante no haya activado su cuenta, su
vendedor padre puede corregirle los datos —**incluido el correo**— y eliminar el alta; después ya no.
Migración `0026`, decisión **D-097**, reglas **BR-E14..BR-E19**.

### Comprobaciones previas al diseño

Antes de escribir código se sondeó la instancia local para responder la pregunta de la que dependía
todo: **¿basta con cambiar el correo y reenviar para que el enlace anterior deje de servir?**

| Sonda | Resultado |
|---|---|
| Invitar → `admin.updateUserById({ email })` → `resetPasswordForEmail` | ❌ `confirmation_token` **intacto**. El enlace enviado al correo equivocado **seguía dando sesión**, ya con el correo nuevo. Quedaban DOS enlaces válidos |
| Invitar → `admin.updateUserById({ email })` → `inviteUserByEmail` | ✅ Auth reescribe el token en la misma ranura: el anterior pasa a «Email link is invalid or has expired» y solo funciona el nuevo |

El diseño se construyó sobre el segundo, y la prueba **E2-10** lo recorre entero para que una versión
futura de GoTrue que deje de rotar el token rompa la suite en vez de abrir un agujero.

### Verificaciones ejecutadas

| Comando | Resultado |
|---|---|
| `npm run test:db` | ✅ **457/457** (21 archivos; **22 nuevas** en `team-member-lifecycle.test.ts`) sobre base recién sembrada. Repetirlo es intermitente por un problema previo de aislamiento — ver la observación al final |
| `npm run verify` | ✅ typecheck · lint **0 errores, 2 avisos preexistentes** · **309/309** unitarias (10 nuevas) · build |
| `npx playwright test` | ✅ **246/246** (3 nuevas en `equipo.spec.ts`) |

### Errores encontrados y corregidos

| # | Error | Cómo se encontró | Corrección |
|---|---|---|---|
| 1 | **El primer diseño de «activada» era falso**: un trigger sobre `auth.users.encrypted_password` daba por activada la cuenta con solo **abrir** el correo | La prueba **E2-02**, escrita justo para esa condición del encargo, falló a la primera: GoTrue **escribe un hash aleatorio** al verificar el enlace de invitación | El momento lo marca la aplicación (`mark_profile_activated()`), llamada al definir la contraseña y al entrar con contraseña. El trigger se eliminó del diseño (D-097) |
| 2 | `form.watch()` en `UserDialog` desactivaba la memorización del componente entero | `lint` — aviso nuevo `react-hooks/incompatible-library` | Se cambió por `useWatch`, que sí es memorizable. Vuelta a los 2 avisos preexistentes |
| 3 | Un correo pegado **con un espacio al final** se rechazaba con «Ingresa un correo válido» | La prueba unitaria de normalización del esquema | `z.string().trim().toLowerCase().pipe(z.email())`: se limpia **antes** de validar. Afecta también al alta, y solo acepta más |
| 4 | La nota de reversión de `0026` llevaba tilde y `catalog.test.ts` busca «Nota de reversion» | `test:db` — DB-15 | Se adoptó la convención existente del resto de migraciones |
| 5 | **Dos pruebas E2E existentes afirmaban «Activo»** de cuentas recién invitadas | La suite completa, tras cambiar la etiqueta | `security.spec.ts` pasa a «Cuenta activa» (su vendedor es del seed, con contraseña). En `owner-users.spec.ts` la aserción era **incorrecta de raíz**: ese vendedor se acaba de crear por invitación, así que lo correcto es **«Invitación pendiente»** — el cambio de etiqueta lo dejó a la vista |
| 6 | Una aserción nueva de E2E chocaba con el modo estricto: el correo aparece en tres sitios | La propia prueba | `{ exact: true }` para apuntar a la ficha de contacto, no al aviso ni al toast |

### Observación registrada, no introducida por este trabajo

Repetir `test:db` sobre la misma base falla de forma **intermitente**, y conviene decirlo con
precisión porque contradice en parte lo que este documento venía afirmando.

| Qué se hizo | Resultado |
|---|---|
| `db:reset` + `seed:local`, dos pasadas seguidas | ✅ 457/457 y 457/457 — dos veces que se intentó |
| Otro `db:reset` + `seed:local`, dos pasadas seguidas | ⚠️ 457/457 y luego **11 fallos** |
| Pasadas 3 y 4 **excluyendo** la suite nueva | ⚠️ Fallan igual (11 y 2 fallos) |
| Solo la suite nueva y después `commission-modes` + `ticket-search` | ✅ 25/25 — la suite nueva **no** contamina |

Dos causas, las dos de aislamiento entre suites y ninguna del producto:

1. **El precio de la rifa compartida.** `payments.test.ts` lo sube a `250.000` y
   `commission-modes.test.ts` a `120.000`, cada uno restaurándolo al terminar. Cuando algo se cruza,
   otras pruebas leen el precio equivocado: `expected 60000 to be 50000` es exactamente la mitad de
   `120.000` en vez de la mitad de `100.000`. Se comprobó que el estado **queda limpio** entre
   pasadas (precio y tramos idénticos antes y después), así que no es residuo sino cruce.
2. **Combinaciones sorteadas.** `randomNumbers()` sortea cuatro dígitos y con las boletas acumuladas
   acaba chocando: `duplicate key value violates unique constraint "tickets_combo_unique"` revienta
   un `beforeAll` y salta el archivo entero.

**La primera pasada tras `db:reset && seed:local` siempre fue verde**, que es como se ejecuta en CI y
como está documentado el arranque. Registrado como **I-057**.

### Promoción a producción — 2026-08-14 (migración `0026`)

| Paso | Resultado |
|---|---|
| Respaldo lógico previo | ✅ `Rifas-backups/2026-08-14-pre-0026/`: 13 tablas con datos, **0** referencias a `auth`, **0** `encrypted_password` |
| `db push --dry-run` | ✅ únicamente `0026_team_member_lifecycle.sql` |
| `db push --yes` | ✅ aplicada |
| `npm run verify:remote` | ✅ 13/13 |
| CI de GitHub Actions | ✅ 2/2 (`31857668132`) |
| Despliegue de Vercel | ✅ `READY`, `dpl_5TJFHZSTsZBYKFRdyUUUhVgeByP6`, **SHA `7b26d99` comprobado** |
| `https://gestion-rifas.vercel.app/login` | ✅ HTTP 200; raíz 307; `/seller/team` 307 al login; CSP, HSTS, `X-Frame-Options` y `nosniff` intactas |

**Comprobado sobre los datos reales, no solo por catálogo** (sonda de solo lectura):

| Qué | Resultado |
|---|---|
| `profiles.activated_at` | `timestamp with time zone`, nullable |
| **Backfill** | 7 personas: **6 activadas**, 1 pendiente. Es lo que debía pasar: sin backfill, los 6 vendedores reales habrían aparecido como «Invitación pendiente» y sus vendedores padre habrían podido eliminarlos |
| Privilegios | `mark_profile_activated`, `team_update_member`, `team_confirm_email_change` y `team_delete_member` ejecutables por `authenticated`; **`team_member_guard` por nadie**; ninguna por `anon` |
| Índice parcial | `profiles_pending_activation_idx` presente |
| Triggers sobre `auth.users` | Los dos de siempre (`on_auth_user_created`, `on_auth_user_email_updated`). El diseño **no** añadió ninguno: esa fue justo la corrección de D-097 |

**La única cuenta pendiente es real y correcta:** `juanhernandez@gmail.com`, vendedor del equipo de
Armando Gordillo, con `last_sign_in_at` y `email_confirmed_at` nulos y sin boletas, clientes ni pagos.
Nunca abrió su invitación, así que la aplicación se lo muestra a Armando como «Invitación pendiente»
y le deja corregir el correo o eliminar el alta. Es la funcionalidad operando sobre datos reales.

### I-057 — el CI de un commit documental destapó un defecto previo de las pruebas — 2026-08-14

El commit `8e88e81`, que es **solo documentación**, tumbó el CI: 4 fallos en
`commission-modes.test.ts` sobre una base **recién creada**. El log dijo la causa sin rodeos:
`duplicate key value violates unique constraint "tickets_combo_unique"`.

**Qué pasaba.** Dos suites de comisiones construían los números de sus boletas a partir de una base de
dos cifras **sorteada**, y solo hay noventa:

| Archivo | Cómo sorteaba | Consecuencia al chocar |
|---|---|---|
| `commission-modes.test.ts` | Una base nueva en **cada** llamada, sin recordar las anteriores. Seis llamadas ⇒ ~15% de colisión por ejecución | Moría la prueba en curso. Si era antes de que E6-04 restaurase el precio, la rifa se quedaba en `$120.000` y hacía fallar la **ejecución siguiente** con `expected 60000 to be 50000` |
| `commissions.test.ts` | Una base para reservar un bloque de 60 boletas. Su comentario decía «sin azar», y no lo era | Reventaba el `beforeAll` y sus **19 casos salían como «skipped»** sin explicación |

El síntoma más visible —los importes que no cuadraban— apuntaba al precio de la rifa compartida, y en
un primer diagnóstico se registró así. Era la cascada, no la causa: **el log del CI, con el error de
clave duplicada, es lo que la identificó**.

**No lo introdujo `0026`.** El defecto vive en dos archivos que esa migración no toca, y se reprodujo
con la suite nueva excluida.

**Corrección.** En los dos archivos, el número se **busca** hasta encontrar uno libre en vez de
sortearse a ciegas, y solo se reintenta ante `23505`; cualquier otro error se propaga tal cual, para
no esconder un fallo de verdad detrás de un reintento.

| Verificación | Resultado |
|---|---|
| `test:db`, **10 pasadas seguidas** sobre la misma base | ✅ 457/457 en todas. Antes fallaba entre la segunda y la cuarta |
| `commission-modes` aislado, 5 pasadas | ✅ 6/6 en todas |
| `npm run verify` | ✅ typecheck · lint 0 errores · 309/309 · build |

---

## Retirada autorizada de los datos de prueba de un vendedor — 2026-08-14

Petición explícita del dueño del producto: borrar los clientes y las boletas de
`vendedor1@demo.test` (**Armando Gordillo**) en el proyecto real, por ser datos de demostración.
No cambió código, esquema ni reglas del producto.

**Lo que se comprobó antes de tocar nada.** Los datos eran, sin ambigüedad, el seed inicial: clientes
Ana Torres, Carlos Díaz y Beatriz Rojas, códigos `R001-000001`–`R001-000006` y fecha de venta
2026-08-03. Las seis boletas estaban **vendidas**, así que arrastraban dinero: se le explicó al dueño
que el borrado se llevaba por delante 4 pagos ($310.000 asignados) y su comisión de $100.000, y lo
autorizó con esa consecuencia a la vista. No era evitable: `payment_allocations.ticket_id` es
`on delete restrict` y un pago sin sus asignaciones rompe el cuadre diferido.

| Comando / verificación | Resultado | Nota |
|---|---|---|
| Inspección previa de dependencias cruzadas | ✅ | Las 5 asignaciones salen de sus propios pagos; 0 pagos suyos apuntan a boletas ajenas; 0 clientes suyos tienen pagos de otro vendedor |
| Respaldo lógico externo | ✅ | `Rifas-backups/2026-08-14-antes-purgar-armando/`: 13 tablas con datos, **0** referencias a `auth`, **0** credenciales, y las seis boletas presentes en el volcado |
| **Ensayo** en transacción `SERIALIZABLE` con `rollback` | ✅ | Mismo recuento que la ejecución real. Nada cambió |
| Ejecución con `commit` | ✅ | 5 asignaciones · 4 pagos · 6 boletas · 3 clientes · 5 filas de ledger · 1 de comisión |
| Verificación desde conexión **nueva** | ✅ | Armando en 0/0/0/0. Jaydin Fernando conserva sus 118 boletas y 44 clientes; Mateo Suárez sus 3 y 1 |
| Integridad del dinero restante | ✅ | 0 asignaciones huérfanas, 0 sin boleta, 0 boletas con cliente fantasma, 0 ledger sin resumen |
| Rastro en la bitácora | ✅ | 6 `ticket.delete` y 3 `client.delete` de los triggers de `0006`, más una fila `seller.purge_demo_data` que explica **por qué**, con el motivo y la ruta del respaldo |
| `npm run verify:remote` | ✅ 13/13 | Las invariantes de seguridad y catálogo siguen en verde |
| `https://gestion-rifas.vercel.app/login` | ✅ HTTP 200 | No hizo falta desplegar: no cambió código |

**Dos detalles que conviene no confundir en el futuro.** (1) El orden importa: la comisión se borra
**después** de las boletas, porque `tickets_sync_commission` se dispara `after delete` y volvería a
escribirla; por eso el ledger pasó de 2 filas a 5 durante la transacción antes de quedar en 0.
(2) Quedan tres boletas con códigos `R001-000001`–`R001-000003`, y **no son suyas**: los códigos
internos son por organización, así que esas son de Mateo Suárez en «Rifas Control».

La persona, su membresía, su cuenta y su equipo **no se tocaron**: Armando sigue activo y con Juan
Hernández a su cargo.

---

## Mantenimiento post-9 — corrección del precio de la boleta a $120.000 (2026-08-15)

Encargo del dueño: el precio real de la rifa siempre fue **$120.000**, no $100.000. Decisión y
criterio en **D-098**; reglas en **BR-P07** y **BR-P08**.

### 1. Sonda previa de SOLO LECTURA contra el proyecto real

Antes de escribir una línea, para no diseñar la migración sobre suposiciones. Sesión con
`default_transaction_read_only = on`.

| Hecho medido en producción | Valor |
|---|---|
| Organizaciones | 2 — «Rifas Demo» y «Rifas Control», ambas con `default_ticket_price = 100000` |
| Rifas | 2 — «Rifa Navidad 2026» (**$100.000**, `active`, 118 boletas, 57 vendidas) y «Rifa Control 2026» ($50.000, 3 boletas, 0 vendidas) |
| Boletas a corregir | **57**, todas con `sale_price = 100000` y `paid_amount = 0` |
| Boletas sin vender | 61 en la rifa afectada (`sale_price is null`) |
| **Pagos registrados** | **0** — ninguno, ni anulado. Recaudado vigente: **$0** |
| Boletas antes Pagadas a $100.000 | **0** |
| Boletas con `sale_price` distinto de 100000 | **0** |
| Pagos por encima de $100.000 o de $120.000 | **0** |
| Boletas anuladas con precio | **0** |
| Filas de comisión (`seller_commissions`, `commission_ledger`) | **0** |
| Defaults en el catálogo | `raffles.ticket_price` y `organizations.default_ticket_price` en `100000` |

**Consecuencia para el diseño:** en producción la corrección es aritméticamente trivial —no hay
dinero que respetar— pero la migración **no** se escribió para ese caso particular. El caso difícil
(boletas con abonos, incluida una con exactamente $100.000 pagados) se montó en local y se probó ahí,
porque es el que puede aparecer si se vende y se cobra entre hoy y el momento de aplicarla.

### 2. Lo que se ejecutó

| Comando | Resultado | Errores encontrados | Corrección |
|---|---|---|---|
| `npm run db:reset` (aplica `0027`) | ✅ 27 migraciones | Ninguno | — |
| `npm run seed:local` | ✅ rifa a $120.000 con los cuatro escenarios | Ninguno | — |
| `npm run test:db` (primera pasada) | ❌ **9 fallos** | Ver §3 | Ver §3 |
| `npm run test:db` (tras corregir) | ✅ **471/471** | — | — |
| `npm run typecheck` | ✅ | 10 errores `TS2345` en la suite nueva: `Record<string, string>` devuelve `string \| undefined` con `noUncheckedIndexedAccess` | Se tipó el mapa de boletas con claves literales |
| `npm run lint` | ✅ 0 errores | 2 avisos preexistentes de `useVirtualizer` | — |
| `npm test` | ✅ **312/312** | — | — |
| `npm run build` | ✅ | — | — |
| `npm run test:e2e` (primera pasada) | ❌ **1 fallo** de 246 | Ver §3 | Ver §3 |
| `npm run test:e2e` (tras corregir) | ✅ **247/247** (+1: el caso crítico en pantalla) | — | — |

### 3. Los diez fallos, y por qué ninguno era un fallo del producto

Todos tenían la misma causa: **una cifra de precio escrita a mano** en la prueba, comparada contra el
comportamiento correcto del sistema. Es exactamente el patrón que el encargo pedía erradicar, y
aparecer así lo hizo visible.

| Prueba | Síntoma | Causa real | Corrección |
|---|---|---|---|
| `catalog.test.ts` DB-15 | «0027 sin nota de reversion» | La comprobación busca `/Nota de reversion/i` **sin tilde**; la migración la escribió con tilde | Se ajustó el encabezado de `0027` a la convención del resto |
| `payments.test.ts` DB-10 ×4 | «expected null not to be null», «expected partial to be paid» | `$100.001` ya no es sobrepago y `$70.000 + $30.000` ya no completa la boleta | `PRICE` se lee de `raffles.ticket_price` y los importes se expresan relativos a él |
| `payments.test.ts` reparto | «expected partial to be paid» | El reparto de $130.000 dejaba la primera boleta incompleta | Total y asignaciones relativos a `PRICE` |
| `payments.test.ts` anulación | «expected partial to be paid» | Pagaba $100.000 y esperaba Pagada | Paga `PRICE` |
| `payments.test.ts` BR-P04 | «expected 120000 to be 100000» | Afirmaba el precio congelado como literal, y **restauraba la rifa a $100.000 al terminar** | Lee y restaura `PRICE` |
| `rpc.test.ts` BR-P03 | «expected 120000 to be 100000» | Comprobaba que `assign_ticket` copia $100.000 | Ahora comprueba que copia **el precio vigente leído de la rifa**, que es la regla |
| `seleccion-multiple.spec.ts` | No encuentra `$300.000` en el modal | 3 boletas × $100.000, con un comentario que decía «el total sale del precio vigente, no de una cifra fija» justo encima de la cifra fija | `formatCOP(3 × raffleTicketPrice(refs))` |

Además, sin llegar a fallar, se quitaron precios escritos a mano que habrían dejado boletas de
$100.000 dentro de una rifa de $120.000: `commissions`, `commission-modes`, `notifications`,
`seller-teams` y `equipo.spec.ts`.

### 4. La suite nueva: `tests/db/price-migration.test.ts` (14 pruebas)

`db reset` aplica `0027` sobre una base **vacía**, así que la corrección de datos no toca nada y no
demuestra nada. Esta suite monta el escenario que la migración se encontraría con dinero de por medio,
**lee el bloque `do $$ … $$` del propio archivo `.sql`** y lo ejecuta dentro de una transacción que
después revierte.

| Prueba | Qué demuestra |
|---|---|
| `E7-01` | Los defaults de `raffles.ticket_price` y `organizations.default_ticket_price` ya son `120000` |
| `E7-02` | Ninguna organización conserva $100.000 como precio base |
| `E7-03` | El escenario **parte del estado equivocado**: la boleta figura `paid` con $100.000 y saldo $0 |
| `E7-04` | La rifa afectada pasa a $120.000 |
| `E7-05` | Boleta sin pagos: sube de precio y sigue Sin pagar, con $120.000 pendientes |
| `E7-06` | Abono de $50.000: el abono no se mueve y el saldo pasa a $70.000 |
| **`E7-07`** | **CASO CRÍTICO**: $100.000 sobre $120.000 queda **Abonada** con $20.000 pendientes |
| `E7-08` | Fotografía de `payments` + `payment_allocations` **idéntica** antes y después |
| `E7-09` | No se creó ni un pago ni una asignación |
| `E7-10` | Intactas: boleta sin vender, boleta con precio legítimo distinto, boleta anulada y rifa cerrada |
| `E7-11` | La rifa de la otra organización sigue a $50.000 |
| `E7-12` | Las tres boletas corregidas dejaron su entrada `ticket.update` con el valor anterior y el nuevo |
| `E7-13` | El guardián `tickets_protect_sale_price` queda **otra vez activo** y sigue rechazando el UPDATE |
| `E7-14` | Ejecutarla dos veces no cambia nada |

**Por qué la transacción se revierte:** el criterio de la migración es `ticket_price = 100000` en toda
la base, no «las rifas de esta prueba», y otras suites (`rpc`, `phase3-admin`, `volume-phase6`) crean
rifas a ese precio. Dejar la corrección confirmada las habría modificado a su espalda, con fallos
intermitentes en archivos que nadie tocó — la familia de I-035, I-055 e I-057.

### 5. Promoción al proyecto real (2026-08-15, con autorización expresa)

| Paso | Resultado |
|---|---|
| Respaldo previo (`RUNBOOK.md` §5.1) | ✅ `Rifas-backups/2026-08-15-pre-0027/`: 9 tablas con datos, 121 boletas, las 2 rifas a `100000`/`50000` y los 57 `sale_price` a corregir. **0** referencias a `auth` en `data.sql` y **0** credenciales; en `schema.sql` la única mención a `auth` es la FK de `profiles`, como está documentado |
| `db push --dry-run` | ✅ Anuncia **solo** `0027` |
| `db push --yes` | ✅ Aplicada |
| `npm run verify:remote` | ✅ **13/13** |
| Sonda posterior de solo lectura | ✅ Detalle abajo |

**Lo que quedó en producción, medido:**

| Comprobación | Resultado |
|---|---|
| «Rifa Navidad 2026» | **$120.000** |
| Boletas corregidas | **57**, todas con `sale_price = 120000` |
| «Rifa Control 2026» | **$50.000**, intacta |
| Boletas sin vender | **61**, siguen sin precio (tomarán $120.000 al venderse) |
| `payments` / `payment_allocations` | **0 / 0** — no había ninguno y **no se creó ninguno** |
| `commission_ledger` | **0** movimientos |
| `default_ticket_price` de las 2 organizaciones | **120000** |
| Defaults de catálogo | `raffles.ticket_price` y `organizations.default_ticket_price` en **120000** |
| Sobrepagos · rifas sin corregir · boletas sin corregir · vendidas sin precio | **0 · 0 · 0 · 0** |
| Auditoría | **58** entradas del sistema (actor `NULL`): 1 `raffle.update` y 57 `ticket.update`, todas con `100000 → 120000` |

**Un efecto secundario observado, y por qué es inofensivo.** La migración dejó **una** fila nueva en
`seller_commissions` (Jaydin Fernando, «Rifa Navidad 2026») con `tickets_paid = 0`, `rate = 0` y
`earned = 0`. La causa: `tickets_sync_commission` se dispara al cambiar `sale_price`, y
`recalc_seller_commission` inserta la fila con `on conflict do nothing` **antes** de comprobar que no
hay nada que recalcular y salir. No implica dinero —la invariante `sum(ledger) = earned` se cumple con
`0 = 0`— y **no cambia ninguna pantalla**: `CommissionCard` trata `ticketsPaid === 0` por la misma
rama que «sin fila», así que el vendedor sigue viendo «Ganas … por cada boleta que te paguen
completa», ahora con la mitad del precio corregido ($60.000).

### 6. Despliegue del código (mismo día, con autorización expresa)

| Comprobación | Resultado |
|---|---|
| `git push origin main` | ✅ `66ca9a7..f6b0df9`, **solo la rama** (las etiquetas `fase-*` siguen en local) |
| CI de GitHub Actions (`31887615583`) | ✅ **2/2** — «Migraciones desde cero + pruebas de base de datos» y «Typecheck, lint, unitarias, build» |
| Despliegue de Vercel | ✅ `READY` — `dpl_DzRHxqoFERdnLzLhwiuMohgjhebZ` sobre el SHA **`f6b0df9`**, con el alias `gestion-rifas.vercel.app` |
| `https://gestion-rifas.vercel.app/login` | ✅ HTTP **200** con CSP por nonce, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy` |
| Rutas protegidas sin sesión | ✅ `/owner/raffles/new`, `/owner/dashboard` y `/seller/tickets` en **307** hacia `/login?next=…` |

**Lo que falta y no puede hacer un agente:** entrar con sesión real y ver que el detalle de una
boleta dice **$120.000** y que «Nueva rifa» llega con **$120.000** puesto.

### 6. Dos defectos de las propias pruebas, encontrados por el camino

Ninguno afecta al producto; los dos afectan a la fiabilidad de `test:db` y se documentan porque
ocultarlos sería dejar una trampa.

**I-059 — la limpieza de pagos por PostgREST falla en silencio.** El `afterAll` de la suite nueva
dejó **4 rifas y 28 boletas** en la base sin decir nada. `payments_balanced` es un constraint trigger
diferido; PostgREST manda cada `delete` en su propia transacción, así que borrar
`payment_allocations` a solas revienta con «El pago no cuadra: la suma de las asignaciones (0) debe
ser igual al total», y el cliente de Supabase **devuelve** el error en vez de lanzarlo. Al fallar el
primer borrado fallan los siguientes por clave foránea. Corregido en la suite nueva: limpia por `pg`
en una sola transacción y **afirma** que no quedó ninguna rifa suya. ⚠️ `commissions.test.ts` y
`commission-modes.test.ts` tienen el mismo patrón y **no se tocaron**, por estar fuera del alcance.

**I-060 — `ticket-search` puede insertar en una rifa y buscar en otra.** Apareció en la tercera
pasada seguida de `test:db`, con 8 fallos del tipo `expected [] to include '1111/2222'`. `searchOver()`
clona `select … from tickets where daily_number = '0100' limit 1` **sin `order by`**, y resuelve el
`p_raffle_id` con otro `limit 1` idéntico; como hay más de un `'0100'` en la base (el del seed y el de
«Rifa Volumen Fase 6»), las dos consultas pueden caer en rifas distintas. No es un defecto de
`search_tickets`. No se corrigió, por estar fuera del alcance.

**Estabilidad tras corregir I-059:** `db:reset && seed:local` y **seis pasadas seguidas** de
`test:db` sobre la misma base, 471/471 en todas. La suite nueva deja la base exactamente como la
encontró (30 boletas en «Rifa Navidad 2026», 3 en «Rifa Control 2026», 4 pagos).

---

## Mantenimiento post-9 — el vendedor puede rebajar el precio (2026-08-17)

Encargo `PriceChangeSeller.txt`. Decisión **D-099**, migración `0028_ticket_sale_discount.sql`.

### Resultado

| Suite | Resultado | Variación |
|---|---|---|
| Base de datos | **490/490** ✅ | +19 (`sale-discount.test.ts`, nueva) |
| Unitarias | **316/316** ✅ | +4 (`commonPriceRange`) |
| `typecheck` · `lint` · `build` | ✅ | 0 errores; 2 avisos preexistentes de TanStack |
| End-to-end | ver abajo | +4 (`precio-rebajado.spec.ts`, nueva) |

La suite nueva de base de datos se ejecutó **tres veces seguidas** sobre la misma base sin fallar
(I-057, I-059).

### Sonda empírica previa, antes de escribir nada de frontend

El motor se comprobó primero en SQL puro contra la base local, porque una regla financiera mal
traducida no la destapa un `typecheck`:

| Comprobación | Resultado |
|---|---|
| Suelo de quien no tiene equipo | `$60.000` = la mitad del precio → precio mínimo `$60.000` |
| Suelo de un integrante | El tramo más bajo, no la tarifa vigente |
| Vender en `$130.000` | Rechazado: «no puede ser mayor que el precio de la rifa ($120.000)» |
| Vender en `$50.000` | Rechazado: «puedes vender desde $60.000 hasta $120.000» |
| Vender en `$100.000` | `sale_price=100000`, `base_price=120000`, rebaja `20000` |
| Cobrar los `$100.000` | Boleta **Pagada**, con `$20.000` menos que el precio oficial |
| Un peso más | Rechazado: «supera su saldo pendiente (0)» |
| Comisión | 2 cobradas × `$60.000` − `$20.000` = **`$100.000`** |
| Ledger | `sale +60.000` y `discount −20.000`; `sum(ledger) = earned` |

### Errores encontrados y corregidos

| # | Error | Cómo apareció | Corrección |
|---|---|---|---|
| 1 | `create or replace view` sobre `v_ticket_balances` habría fallado: las columnas nuevas iban en medio y se perdían `assigned_at` y `created_at` | Al comparar con la definición original de `0008` antes de aplicar | Se retiró el cambio de vista entero. Ningún consumidor lo necesitaba y el detalle lee de `tickets` |
| 2 | `raffles.start_date` y `end_date` son `NOT NULL` | `beforeAll` de la suite nueva | Se añaden al alta de la rifa de prueba |
| 3 | El `afterAll` borraba clientes por una lista fijada de antemano y dejaba fuera el que crea la prueba del importador; la membresía ya no se podía borrar | Primera ejecución completa | Se borra **por vendedor**, no por lista |
| 4 | Las cuentas de Auth de la suite **no se pueden borrar**: son actores de `audit_logs`, que tiene FK contra el perfil (BR-D02) | La limpieza revirtió entera y dejó residuos, que hicieron fallar la ejecución siguiente con `raffles_org_name_key` | El alta es idempotente (reutiliza la cuenta) y se borra la **membresía**. La auditoría no se toca |
| 5 | El pago del CASO F lo intentaba un vendedor ajeno al cliente: fallaba en silencio, la boleta nunca quedaba pagada y la aserción medía cero | `E8-18` con un delta de `0` en vez de la tarifa | Lo registra el Dueño (BR-F02) y ahora se comprueba el error del pago |
| 6 | Vocabulario inconsistente entre capas: la base de datos decía «descuento» y la interfaz «rebaja» | Al repasar los textos contra `UX_COPY_GUIDELINES` §35.3 | Unificado en **rebaja**; añadido al glosario del Anexo A |
| 7 | `format_cop` dependía del locale: `to_char` con `G` usa `lc_numeric`, y el `replace(',', '.')` habría dejado el separador equivocado en un servidor con otro locale | Repaso del `.sql` antes de cerrar | `translate(…, ',. ', '...')`, que lleva coma, punto y espacio al punto colombiano. Y la función pasa a `stable`, que es lo que de verdad es |
| 8 | Con rebajas, «Tu ganancia» decía «2 boletas cobradas · $60.000 por boleta» encima de un total de `$100.000`: la cuenta no cuadraba a la vista | Repaso de la sección 11 del encargo | Línea «Menos $X de las rebajas que hiciste», derivada de las cifras que ya llegaban. Aplicada también al detalle del integrante y del vendedor |
| 9 | **El botón de confirmar del modal de venta múltiple quedaba FUERA de la pantalla.** `DialogContent` no tiene altura máxima ni scroll; el campo de precio nuevo empujó el modal —resumen + lista de números + precio + buscador + lista de clientes— por encima del alto de la ventana | E2E `seleccion-multiple`, con 106 reintentos de clic contra un elemento «visible, enabled and stable» pero *outside of the viewport* | `max-h-[calc(100dvh-2rem)] overflow-y-auto` en ese modal y en el de una sola boleta |

**El defecto 9 merece leerse dos veces.** No era un problema de la prueba: con esa selección **una
persona tampoco habría podido confirmar la venta**. El botón existía, se veía habilitado y no
respondía. Es justo lo que la lista de la §14 de `UX_COPY_GUIDELINES` pregunta con «¿el texto cabe
correctamente en móvil?», y lo que ninguna prueba unitaria ni de base de datos podía encontrar.

> **Cerrado el mismo día, en el componente compartido.** Ver la sección siguiente.

---

## Mantenimiento post-9 — el alto de los diálogos, resuelto en el componente (2026-08-17)

`DialogContent` pasa a acotar su alto (`max-h-[calc(100dvh-2rem)] overflow-y-auto`), de modo que la
clase entera de defecto desaparece en vez de parchearse diálogo a diálogo.

**Ya había pasado antes y nadie lo había visto como un problema del componente:**
`TicketImportDialog` llevaba desde su creación un `max-h-[90dvh] overflow-y-auto` propio. Eran dos
soluciones distintas al mismo problema, con límites distintos. Ahora hay una.

### La prueba se validó al revés, que es la única forma de que valga

`tests/e2e/dialogos-alcanzables.spec.ts` — cuatro diálogos × dos tamaños de ventana (1280×720 y
390×620) = 8 pruebas. No afirma que el diálogo sea bajo: afirma que **su última acción se alcanza**,
con `scrollIntoViewIfNeeded()` seguido de `toBeInViewport()`. En el diseño roto no había a dónde
desplazar.

| Estado del código | Resultado |
|---|---|
| Con el arreglo | **8/8** ✅ |
| **Retirando la clase del componente** | **2 fallos** ✅ *(la prueba sí detecta la regresión)* |
| Restaurado | **8/8** ✅ |

Una prueba de regresión que pasa con y sin el arreglo no vigila nada. Esta se comprobó en los dos
sentidos antes de darla por buena.

### Lo que se aceptó a cambio

El botón de cerrar (la X) es `absolute` dentro del contenedor que ahora desplaza, así que en un
diálogo muy alto deja de verse al bajar. No atrapa a nadie —`Esc`, «Cancelar» y pulsar fuera siguen
cerrando— y arreglarlo exigiría partir `DialogContent` en cabecera fija y cuerpo desplazable, que es
un cambio estructural de un componente compartido por nueve diálogos.

### Una ejecución E2E que hubo que descartar

La primera pasada completa de Playwright se lanzó **antes** de terminar los ajustes de interfaz, y las
ediciones posteriores recompilaron el servidor de desarrollo en caliente. Resultado: **4 fallos**, los
cuatro en el hook de inicio de sesión (`page.waitForURL` navegando a `/login` en bucle), ninguno en la
funcionalidad. Se descartó la ejecución, se detuvieron los procesos, y se repitió desde
`db:reset` + `seed:local` **sin tocar ni un archivo mientras corría**.

Es la misma familia de trampa que ya recoge `TESTING.md` §5.3: un resultado E2E solo vale si el árbol
estuvo quieto durante toda la ejecución.

---

# Mantenimiento post-9 — buscar boletas por el cliente, y llegar a su ficha (2026-08-21)

Decisiones **D-100** y **D-101**, regla **BR-N13**, migración `0029_ticket_search_by_client.sql`.

## Resumen

| Suite | Antes | Después | Resultado |
|---|---|---|---|
| Base de datos | 490 | **512** | ✅ (+21 de `ticket-search-client`, +1 al desglosar una prueba reescrita) |
| Unitarias | 316 | **320** | ✅ (+4 de `isTicketSearchTerm`) |
| E2E | 259 | **274** | ✅ (+15 de `boleta-cliente`) |
| `typecheck` · `lint` · `build` | — | — | ✅ (los 2 avisos de lint son los de siempre, de TanStack) |

La suite de base de datos se ejecutó **dos veces seguidas sobre la misma base** y dio 512/512 en las
dos: las pruebas nuevas trabajan dentro de transacciones que revierten, o borran lo que crean.

## Medición antes de decidir: se comprobó el plan, no se supuso

Antes de escribir la migración se midió con `explain (analyze, buffers)` sobre la base local, y
después sobre una base inflada dentro de una transacción revertida — **5.006 clientes y 20.033
boletas**, de ellas 20.008 vendidas:

| Búsqueda | Plan observado | Tiempo |
|---|---|---|
| Nombre de un cliente concreto (444 boletas de 111 clientes) | `Nested Loop` → `Seq Scan on clients` → **`Index Scan using tickets_client_idx`** | **1,4 ms** |
| `search_tickets('Zfalso Apellido42')`, extremo a extremo | — | **9 ms** |
| Término que coincide con **las 20.000** (peor caso imaginable) | El mismo plan + el recuento exacto | 181–229 ms |

**Conclusión que decidió el diseño:** la tabla grande (`tickets`) se alcanza siempre por índice. Los
5.000 clientes se recorren enteros porque a ese tamaño el planificador lo prefiere a su índice de
trigramas — es la tabla pequeña —, y `clients_search_text_trgm_idx` (de `0017`) sigue disponible para
cuando deje de serlo. **No se creó ningún índice nuevo**: añadir uno «por si acaso» cuesta en cada
inserción de boleta, y no había evidencia de que hiciera falta.

El peor caso es el precio del total exacto de la paginación (`count(*) over ()`), que la búsqueda por
número ya pagaba desde `0018`. No se cambió: un total aproximado haría que la paginación mintiera.

## Errores encontrados y corregidos

| # | Qué falló | Diagnóstico | Corrección |
|---|---|---|---|
| 1 | `ticket-search.test.ts` › «más de cuatro cifras no devuelve nada»: devolvía **3 filas** | No es un defecto. `12345` ya no se descarta: pasa por la rama de texto y encuentra al cliente cuyo **teléfono** contiene esas cifras, porque `clients.search_text` lo incluye (igual que el buscador de «Clientes», BR-C08) | Se corrigió **la prueba y el texto de la pantalla**, no la consulta. La pista del campo pasa a decir «Con más cifras buscamos el teléfono del cliente»: un resultado que la persona no sabe explicar parece un fallo |
| 2 | Tres pruebas del código interno afirmaban «devuelve cero filas» | Esa afirmación describía el mundo en el que un texto no podía encontrar nada. Con BR-N13 depende de qué clientes existan, así que era una prueba frágil disfrazada de regla | Reescritas para afirmar lo que de verdad importa: **escribir el código de una boleta no lleva a esa boleta**, comprobado con el código real de una boleta real y sus dos recortes |
| 3 | `seller-tickets.spec.ts` › «asigna una boleta a un cliente existente»: no encontraba el enlace | Consecuencia directa de D-101: el nombre accesible del enlace pasó de ser el nombre del cliente a «Cliente ‹nombre› ‹teléfono›», y la prueba lo pedía con `exact: true` | Se ancla en el rótulo (`^Cliente\s+‹nombre›`), que además la distingue del otro enlace con el mismo nombre («Registrar un abono de…») |
| 4 | La regla nueva se numeró primero **BR-N12** | Ya estaba tomada por la importación CSV/JSON desde D-081 | Renumerada a **BR-N13** en las 15 referencias de código, pruebas y migración |

Ninguno de los cuatro llegó a la aplicación: los tres primeros los destapó la propia suite en la
primera ejecución completa, y el cuarto una revisión de la documentación antes de escribirla.

## Lo que se probó del aislamiento, y cómo

El punto que no podía fallar es que **ampliar por dónde se busca no ampliara qué se puede ver**. Se
probó con sesiones reales y clave pública (nunca con service role), y con el escenario más incómodo
posible: **tres clientes que se llaman exactamente igual**, uno del vendedor 1, otro del vendedor 2 y
otro en la organización «Rifas Control».

| Quién busca ese nombre | Qué obtiene |
|---|---|
| Vendedor 1 | Solo su boleta. La del vendedor 2 **no aparece**, y su cliente homónimo tampoco se insinúa |
| Vendedor 2 | Solo la suya |
| Vendedor 1 pasando `p_seller_id` del vendedor 2 | **Cero filas**: el filtro acota, no abre |
| Dueño de «Rifas Demo» | Las dos de su organización; **nunca** la de «Rifas Control» |
| Dueño de «Rifas Control» | Solo la suya |
| Visitante anónimo | Error: no puede ejecutar la función (privilegios de `0018`, conservados por `create or replace`) |

Y en la interfaz: un vendedor que busca por el nombre del cliente de otro ve «Ninguna boleta coincide
con los filtros», mientras el personal encuentra esa misma boleta por el mismo camino.

## Una limitación conocida que se deja escrita

Desde «Boletas», un teléfono escrito **con separadores** no es simétrico: el término se compara tal
cual contra `search_text`, sin la reducción a número nacional que sí hace «Clientes» (`searchNeedle`,
regresión I-039). Buscar por **nombre** —que es la regla BR-N13— no se ve afectado, y por eso no se
añadió una segunda normalización solo para este camino.

## La pasada E2E completa, y las 3,8 horas que hubo que descartar antes

Al publicar (2026-08-21) la suite E2E se interrumpió a petición expresa. Después se pidió correrla
entera. El primer intento **no vale y se descarta**; el segundo dio **274/274 en 13,7 minutos**.

### Qué salió mal en el primer intento

| Síntoma | Dato |
|---|---|
| Duración | **3,8 horas** (lo normal son ~14 minutos) |
| Resultado | **86 pasaron**, ~188 no llegaron a ejecutarse |

**La causa no estaba en el producto ni en las pruebas.** `TaskStop` sobre la ejecución anterior mató
la consola pero **no el árbol de procesos**: la suite huérfana siguió viva. Al lanzar la nueva había
**dos Playwright y tres servidores de desarrollo** compitiendo por la misma base local, el mismo
puerto y la misma CPU. Se comprobó enumerando los procesos por su línea de órdenes:

```
node … @playwright/test/cli.js test      <- suite huerfana, todavia corriendo
npm run dev:local                        <- servidor de la vista previa, "detenido" pero vivo
npx next dev                             <- webServer de Playwright
```

Tras detenerlos por PID —y comprobando **0** navegadores de `ms-playwright` y el puerto 3000 libre—,
la repetición sobre una base recién sembrada dio 274/274. El navegador del usuario no se tocó: los
procesos de Chrome se filtraron por su ruta, no por su nombre.

### Dos lecciones que conviene no volver a aprender

1. **`TaskStop` no basta para una suite E2E.** Detiene la consola, no los procesos hijos. Hay que
   comprobar después que no quedan `@playwright/test`, `next dev` ni `dev:local` vivos.
2. **No canalizar la salida de Playwright por `tail`.** `npm run test:e2e | tail -40` devuelve el
   código de salida de `tail`, no el de Playwright: la primera ejecución terminó «con éxito» según
   la consola mientras 188 pruebas no se habían ejecutado. El resumen se lee del archivo completo.

### Estado final del trabajo (2026-08-21)

| | |
|---|---|
| Base de datos | **512/512** ✅ (dos pasadas seguidas sobre la misma base) |
| Unitarias | **320/320** ✅ |
| E2E | **274/274** ✅ en 13,7 min, pasada completa y limpia |
| `typecheck` · `lint` · `build` | ✅ (los dos avisos de lint son los de siempre, de TanStack) |
| CI en GitHub Actions | ✅ sobre el commit vigente |
| Migraciones | **29** en local y en el proyecto real |
| Producción | `https://gestion-rifas.vercel.app` — `READY` sobre `16a1b74` |

Lo único que no puede comprobar un agente y sigue abierto: **la pasada visual con sesión real en
producción**. Concretamente, que escribir un nombre en «Mis boletas» traiga sus boletas y que la fila
del cliente del detalle se sienta pulsable en el teléfono.
---

## Auditoría de rendimiento con volumen real (2026-08-22)

Encargo del usuario: comprobar que la plataforma seguirá sintiéndose rápida con cientos de miles de
registros, **midiendo antes de cambiar nada**. Decisiones resultantes: D-102 (base de datos) y D-103
(aplicación). Problemas que quedan abiertos: I-062 a I-065.

### a. Cómo se midió

No se tocó el proyecto real en ningún momento. Todo ocurrió sobre la base **local** de
`npx supabase start`, cargada con volumen sintético:

| | |
|---|---|
| Clientes | 100.005 |
| Boletas | 300.033 (200.008 vendidas, 100.020 disponibles) |
| Pagos | 1.000.006 |
| Asignaciones de pago | 1.000.005 |
| Vendedores | 20 sintéticos, 15.000 boletas y 5.000 clientes cada uno |

Tres instrumentos, cada uno para una pregunta distinta:

1. **`explain (analyze, buffers)`** con la sesión real de un Dueño y la de un vendedor
   (`set role authenticated` + `request.jwt.claims`) → *por qué* tarda.
2. **Consulta por consulta desde el cliente de Supabase**, tal como las escribe cada `queries.ts`
   → cuánto tarda el camino completo hasta PostgREST, con su conteo y sus relaciones incrustadas.
3. **Tiempo de respuesta del servidor por pantalla completa**, con `next build` + `next start`
   contra la base cargada y una sesión iniciada por la interfaz real → lo que espera una persona.

Cada cifra es el **mejor de 3 a 5 intentos**, para que el resultado no dependa de una pausa del
recolector de basura o de un fallo de caché. La comparación «antes/después» se hizo sobre el **mismo
equipo, la misma base y los mismos datos**, revirtiendo los cambios y volviéndolos a aplicar.

### b. Antes y después, por pantalla (tiempo de respuesta del servidor)

| Pantalla | Antes | Después | Mejora |
|---|---:|---:|---:|
| Pagos (Dueño) | 1.364 ms | 290 ms | **4,7×** |
| Panel administrativo | 1.291 ms | 306 ms | **4,2×** |
| Boletas (Dueño) | 1.088 ms | 151 ms | **7,2×** |
| Boletas · filtro por estado | 920 ms | 129 ms | **7,1×** |
| Clientes (Dueño) | 629 ms | 108 ms | **5,8×** |
| Reportes · saldos pendientes | 645 ms | 537 ms | 1,2× |
| Panel del vendedor | 414 ms | 239 ms | **1,7×** |
| Mis pagos (vendedor) | 394 ms | 217 ms | **1,8×** |
| Mis boletas (vendedor) | 220 ms | 138 ms | 1,6× |
| Mis clientes (vendedor) | 209 ms | 104 ms | **2,0×** |
| Vendedores | 257 ms | 262 ms | = |
| Reportes · por vendedor | 259 ms | 274 ms | = |
| Boletas · buscar «1234» | 179 ms | 182 ms | = |
| Boletas · buscar por cliente | 200 ms | 209 ms | = |
| Clientes · buscar | 258 ms | 268 ms | = |

Las filas marcadas `=` están dentro del ruido de la medición (±10 %): son pantallas cuyo cuello de
botella no era el orden ni el agregado, sino la búsqueda por texto (I-062) o los agregados por
vendedor (I-063), que esta tanda no resuelve.

### c. Antes y después, por consulta

| Consulta | Antes | Después |
|---|---:|---:|
| Listado de boletas, página 1 | 1.040 ms | 72 ms |
| Listado de boletas con filtro de estado | 859 ms | 61 ms |
| Historial de pagos, página 1 | 1.161 ms | 192 ms |
| Listado de clientes, página 1 | 566 ms | 27 ms |
| Boletas creadas recientemente (panel) | 331 ms | 4 ms |
| Ventas recientes (panel del vendedor) | 479 ms | 5 ms |
| Clientes recientes (panel) | 35 ms | 3 ms |
| Selector de cliente (primeros 50) | 37 ms | 4 ms |
| Recuento de comisión (**en cada abono**) | 12,0 ms · 5.015 buffers | 0,96 ms · 16 buffers |

Y dentro de la base de datos, con el plan a la vista:

| | Antes | Después |
|---|---:|---:|
| `tickets order by created_at desc limit 25` | 120 ms (barrido de 300.030 filas + ordenación) | 2,1 ms (recorrido por índice) |
| `v_payment_history … limit 25` | 1.170 ms (cruce de 1.000.004 filas + ordenación) | 9,3 ms (bucles anidados sobre 25) |
| `v_client_balances … limit 25` | 429 ms (agregado de 100.005, **35 MB en disco**) | 3,5 ms |
| `count(*)` de `v_client_balances` | 191 ms | 27 ms |
| `count(*)` del historial de pagos | 394 ms | 231 ms |

### d. Lo que NO mejoró, y por qué se deja así

| Consulta | Después | Motivo |
|---|---:|---|
| Buscar clientes por nombre | 97 ms con 100.000 fichas | **I-062**: `like`/`ilike` no son *leakproof* y con RLS el índice de trigramas no puede usarse. La misma consulta sin RLS tarda 2,7 ms. Las dos salidas tocan seguridad o comportamiento |
| `v_seller_summary` / `v_raffle_summary` | 160 ms / 180 ms | **I-063**: agregar la tabla de boletas entera es lineal. D-103 lo redujo de dos lecturas a una por pantalla; eliminarlo exige una tabla de resumen mantenida por disparadores |
| Conteo exacto del historial de pagos | 231 ms | **I-064**: se aceptó a propósito; `count=estimated` volvería aproximado el número de páginas |
| Buscar una boleta por **una** cifra («1») | 323 ms | `like '%1%'` coincide con un tercio de la tabla y el orden por relevancia obliga a materializarla. Solo ocurre pulsando «Buscar» a propósito: el mínimo para que salga sola son dos caracteres |

### e. Errores encontrados durante la propia medición

| Qué pasó | Diagnóstico | Qué se hizo |
|---|---|---|
| Un `update` de `paid_amount` sobre 200.000 boletas llevaba **más de 12 minutos** y hubo que cancelarlo | `payment_status` es una columna generada e indexada que depende de `paid_amount`, así que ninguna actualización puede ser HOT y hay que reescribir las catorce entradas de índice de cada fila, tres de ellas GIN | Se borraron los tres índices GIN, se hizo el `update` y se recrearon: **menos de 2 segundos** en total. Anotado como **I-065**, que es una precaución para futuras migraciones masivas, no un defecto de la operación normal |
| El primer índice probado para el listado de boletas no sirvió de nada | `(organization_id, created_at desc)` no conserva el orden, porque la política compara la organización contra un conjunto | Se cambió a `(created_at desc)` a secas: 120 ms → 2 ms. Documentado en `DATA_MODEL.md` §5 para que nadie lo «mejore» al revés |
| El primer índice probado para «ventas recientes» tampoco | Con `(inventory_status, assigned_at desc)` el planificador seguía prefiriendo un mapa de bits y ordenaba 200.000 filas | Se cambió a índice **parcial** `(assigned_at desc) where inventory_status = 'assigned'`: 77 ms → 1,6 ms |
| Se probó un índice de cobertura para el reporte de saldos | 316 ms frente a 298 ms sin él | Se descartó: un índice más en la tabla que más escribe, a cambio de nada |

### f. Correcciones funcionales que salieron de la auditoría

Aunque el encargo era de rendimiento, dos cosas se arreglaron porque eran defectos latentes:

1. **`v_payment_history` cruzaba el cliente con `join` interno.** Bajo RLS eso no oculta un nombre:
   borra el pago entero del historial. Es exactamente la trampa de I-015, que en 2026 se corrigió
   para los perfiles y quedó sin corregir para el cliente. Hoy no puede dispararse —las claves
   foráneas y las políticas coinciden—, pero dependía de esa coincidencia. Ahora es `left join`.
2. **El panel administrativo mezclaba dos fuentes para sus diez cifras.** El dinero venía del total
   por rifa y los estados de pago de recorrer la lista de vendedores: las boletas de alguien que
   hubiera dejado de tener el rol `seller` habrían contado en unas cifras y no en otras. Se
   comprobó que ambas fuentes daban lo mismo sobre 300.000 boletas y se unificó en una.

### g. Verificación

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ (los dos avisos de siempre, de TanStack Virtual) |
| `npm run test` (unitarias) | ✅ **320/320** |
| `npm run test:db` | ✅ **518/518** (512 anteriores + 6 nuevas de `read-performance`) |
| `npm run build` | ✅ |
| `v_client_balances` nueva vs. antigua, fila a fila sobre 100.005 clientes | ✅ **0 diferencias** en las cuatro columnas de dinero, mismos tipos |
| `v_payment_history`: filas de la vista vs. `payments` | ✅ **1.000.006 = 1.000.006** |
| Aislamiento: un vendedor solo ve su cartera y sus pagos en las vistas nuevas | ✅ |
| Errores y advertencias de consola en las 16 pantallas medidas | ✅ **ninguno** |
| Peticiones 4xx/5xx o recursos que no cargan | ✅ **ninguna** |

### h. Promoción a producción y verificación en el proyecto real (2026-08-22)

Autorizada por el dueño el mismo día. Procedimiento de `RUNBOOK` §5.1 y `DEPLOYMENT` §2.2.

| Comprobación | Resultado |
|---|---|
| Respaldo previo `Rifas-backups/2026-08-22-pre-0030/` | ✅ 13 tablas con datos · `grep -c '"auth"'` = **0** · `grep -c encrypted_password` = **0** |
| `db push --dry-run` | ✅ solo `0030_read_performance.sql` |
| `db push --yes` | ✅ aplicada |
| `npm run verify:remote` | ✅ **13/13** |
| Catálogo real: los 6 índices | ✅ los seis, con su definición exacta (las tres condiciones parciales incluidas) |
| Catálogo real: las 2 vistas | ✅ `security_invoker=true` en ambas |
| `schema_migrations` | ✅ `0030, 0029, 0028, 0027` |
| Equivalencia **sobre datos reales**: `v_client_balances` | ✅ **0 filas distintas** frente a la formulación con `group by`, sobre los 46 clientes |
| Equivalencia **sobre datos reales**: `v_payment_history` | ✅ **3 pagos = 3 filas** |
| Plan real del listado de boletas | ✅ `Index Scan using tickets_created_at_idx` |
| Despliegue | ✅ Vercel `READY`, `dpl_8C6NRgGVxUVwe5n7VMsj6dESGjVB` sobre `d15d386`, alias `gestion-rifas.vercel.app` |
| `/login` y cabeceras | ✅ 200 con las seis cabeceras; `/owner/*` y `/seller/*` en 307 al login |
| Pasada con sesión real (solo lectura), 9 pantallas | ✅ todas renderizan · **0 errores de consola** · **0 respuestas 4xx/5xx** |
| Clientes (vista reescrita) | ✅ 25 filas, «Mostrando 1–25 de 45» |
| Pagos (vista reescrita) | ✅ los 3 pagos, con cliente, boletas y estado |
| Ficha de cliente | ✅ «1 boleta · $120.000 comprado · $0 pagado · $120.000 pendiente» |

**No hay mejora de velocidad visible en producción, y es lo correcto.** La organización real tiene 46
clientes, 121 boletas y 3 pagos: con ese tamaño PostgreSQL elige un barrido secuencial porque *es* lo
más rápido, y así se ve en el plan del historial de pagos. `0030` es preventiva.

**Un error cometido en la verificación, registrado como I-066.** La primera sonda con sesión real
pulsó «Ingresar» antes de que React hidratara —la trampa de §5.3 de `TESTING.md`, cometida por quien
la había leído— y el formulario cayó a su envío nativo por `GET`: la contraseña de las cuentas
`@demo.test` viajó en la URL hasta Vercel. Se rehízo la sonda esperando la hidratación **y**
abortando cualquier petición con `password=` en la dirección; en la segunda pasada ese bloqueo no se
disparó ni una vez. Recomendación: rotar esa contraseña (I-021, I-066).

---

## Medición de la navegación completa (2026-08-22)

El dueño reportó que, pese a D-102 y D-103, seguía esperando **unos tres segundos** al cambiar de
menú. Tenía razón: aquellas mediciones eran del **tiempo de respuesta del servidor**, no del tiempo
que espera una persona. Esta tanda mide la cadena entera. Decisión: **D-104**. Problemas: **I-067**
abierto, **I-014** resuelto.

### a. Cómo se midió

Build de producción (`next build` + `next start`), sesión real iniciada por la interfaz, y un arnés
que cronometra dentro del navegador: clic → primera mutación del DOM → petición RSC → TTFB →
descarga → contenido de la pantalla visible. La petición se identifica por su **pathname de
destino**, no como «la primera»: con varias precargas en vuelo, la primera no es la de la
navegación —ese fue el primer error del arnés y falseaba el reparto—.

Dos escenarios, porque responden a preguntas distintas: **local** aísla el código (sin red ni
plataforma) y **Vercel** reproduce lo que sufre el usuario. Además se instrumentó temporalmente el
cliente de Supabase del servidor para contar **todas** sus llamadas de red por navegación.

### b. De dónde salían los tres segundos

| Etapa | Antes | Problema encontrado | Después |
|---|---:|---|---:|
| Clic → petición | 15–45 ms | — | 14–40 ms |
| Reacción visual | 33–43 ms | — | 14–40 ms (indicador en el menú) |
| Proxy + auth | ~80 ms | Dos `getUser()` por petición | ~80 ms (**no se tocó**) |
| Servidor + consultas (TTFB) | 47–51 ms local · 261–333 ms Vercel | — | igual |
| Descarga | 15–90 ms | — | igual |
| **Render** | **~300 ms** | **Fallback de Suspense de `loading.tsx`** | **12 ms** |
| **Arranque en frío** | **+1.600 a +5.000 ms** | **Plataforma (I-067)** | sin cambio |
| **TOTAL local** | **~840 ms** | | **~124–236 ms** |
| **TOTAL Vercel caliente** | **~840 ms** | | **~350 ms** |
| **TOTAL Vercel en frío** | **2.900–5.900 ms** | | 3.400–5.500 ms |

### c. La prueba de que el pico NO es la base de datos

| Ruta | Caliente | Tras 75–90 s de pausa |
|---|---:|---:|
| `/login` — dinámica, **no consulta nada** | 140–188 ms | **3.125 ms** |
| `/denied` — estática, desde el CDN | 103–131 ms | **115 ms** |
| `/owner/tickets` — dinámica con datos | 261–333 ms | 3.594–4.276 ms |

Una ruta que no toca la base de datos sufre el mismo pico. Una servida por el CDN no lo sufre nunca.

### d. La espera de 300 ms, aislada

| Pantalla | Respuesta completa | Esqueleto visible | Contenido visible | Espera |
|---|---:|---:|---:|---:|
| Boletas | 92 ms | 36 ms | 354 ms | 318 ms |
| Clientes | 95 ms | 43 ms | 350 ms | 307 ms |
| Pagos | 142 ms | 42 ms | 351 ms | 309 ms |

Siempre ~310 ms desde el esqueleto, llegara la respuesta a los 92 o a los 142. Prueba definitiva:
quitar el archivo bajó la misma navegación de **352 ms a 106 ms**.

### e. Lo que hacía el servidor en una sesión con dos navegaciones

| | Antes |
|---|---:|
| Invocaciones del proxy | **42** |
| Llamadas a `/auth/v1/user` | **41** |
| Consultas de datos reales | 25 |
| Precargas de fichas de boleta concretas | **16** |
| Ejecuciones de `ProtectedLayout` / `OwnerLayout` / campanita | **1 / 1 / 1** |

Los layouts **no** se vuelven a ejecutar al cambiar de menú: la sospecha de que cada navegación
reconsultaba usuario, organización y permisos era razonable y quedó descartada con evidencia.

### f. Navegación en Vercel, por pantalla (mediana de 3 vueltas)

| Pantalla | Antes | Después (caliente) |
|---|---:|---:|
| Boletas | 844 ms | **361 ms** |
| Clientes | 853 ms | **343 ms** |
| Rifas | 841 ms | 247–341 ms |
| Pagos | 837 ms | 365 ms |
| Vendedores | 857 ms | 352 ms |

Y en local, donde no hay red ni plataforma de por medio: Boletas 826 → **124 ms**, Rifas 873 →
**118 ms**, Clientes 829 → **137 ms**, Panel 857 → **233 ms**, Pagos 855 → **233 ms**, Reportes
840 → **236 ms**.

### g. Errores cometidos durante esta medición

| # | Error | Corrección |
|---|---|---|
| 1 | El arnés tomaba «la primera petición RSC tras el clic» como la de la navegación | Con precargas en vuelo esa no es la correcta. Se identifica por pathname de destino |
| 2 | Los selectores de contenido (`text=Rifas`, `text=Clientes`) coincidían con los **enlaces del menú**, así que cuatro pantallas parecían cargar en 30 ms sin haber cargado | Anclados dentro de `main` |
| 3 | La capa del recorrido guiado interceptaba los clics del menú | Se da por visto, como en las E2E |
| 4 | Se atribuyó el hueco de 250 ms a «trabajo de render» antes de comprobar que no había CPU | Se midió `longtask`: **0 ms**. Era una espera, no trabajo |

### h. Verificación

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` · `lint` · `build` | ✅ |
| `npm run test` | ✅ **320/320** |
| `npm run test:db` | ✅ **518/518** |
| `npm run test:e2e` | **269/274**, y las **5** afectadas **48/48 en aislado** (ver abajo) |
| Carga dura con F5 | 271 → 253 ms: **sin degradación** |
| Errores de consola en producción | **ninguno** |

**Las cinco E2E.** Tres eran las inestables ya conocidas (`back-navigation` «editar rifa»,
`importar-boletas`, `tour`), que pasan en aislado y ya fallaban antes de estos cambios. **Dos eran
consecuencia real del cambio y merecen explicación**: `security.spec.ts` leía el texto de `main`, y
sin `loading.tsx` la pantalla de «no encontrado» se pinta con el layout raíz, que no tiene `<main>`.
Se comprobó a mano que la aplicación responde **404** con «Página no encontrada» y **500** con «Algo
salió mal», sin filtrar ninguna firma de PostgreSQL. El arnés pasa a leer el `body`, que cubre las
dos pantallas y **comprueba más, no menos**: si alguna vez se filtrara un mensaje fuera de `main`,
antes no se habría visto.

### i. Después de activar Fluid Compute (2026-08-22)

El dueño activó **Fluid Compute** en el proyecto de Vercel al leer el diagnóstico de I-067. La
opción **solo se aplica a despliegues nuevos**, y no caer en ello costó una tanda entera de
mediciones contradictorias —45 s daba 805 ms en una muestra y 4.196 ms en la siguiente—. Tras
redesplegar (`a854e8a`), y **esperando a que el despliegue se asentara** —medir en el minuto
siguiente da todo frío y tampoco sirve—, el resultado es consistente.

**Seis ciclos de «pausa de 60 s + una navegación», que es el patrón que producía los 3 segundos:**

| Ciclo | Ruta | TTFB |
|---|---|---:|
| 1 | `/owner/tickets` | 486 ms |
| 2 | `/owner/clients` | 747 ms |
| 3 | `/owner/payments` | 561 ms |
| 4 | `/owner/tickets` | 475 ms |
| 5 | `/owner/clients` | 690 ms |
| 6 | `/owner/payments` | 438 ms |

**mediana 561 ms · 0 de 6 por encima de 2 s.** Antes: 3.594–4.276 ms de forma sistemática.

**Navegación completa (clic → pantalla utilizable) en producción:**

| Escenario | Antes de todo | Ahora |
|---|---:|---:|
| Encadenada, sin pausas | ~840 ms | **~350 ms** |
| Con la ruta ya visitada | — | **490–511 ms** |
| Tras 60 s de lectura (mediana de 6) | 2.900–5.900 ms | **847 ms** |
| Peor caso de esos 6 | 5.965 ms | **1.357 ms** |
| Reacción visual al clic | 33–43 ms | **12–26 ms** |
| Render tras recibir la respuesta | ~300 ms | **14 ms** |

El desglose de una navegación tras pausa, con el waterfall: clic → petición **23 ms**, TTFB
**278 ms**, fin de la respuesta **476 ms**, título **y** tabla en pantalla **490 ms**. El título y la
cabecera de la tabla aparecen en el **mismo instante**: no hay coste de render de tabla, algo que se
sospechó y quedó descartado midiéndolo.

**Objetivos del encargo, contra estas cifras:**

| Objetivo | Estado |
|---|---|
| Feedback visual al clic < 100 ms | ✅ 12–26 ms |
| Navegación normal 300–500 ms | ✅ encadenada (~350) y con ruta visitada (~490) |
| Pantallas pesadas < 1 s | ✅ mediana 847 ms tras pausa; 1 de 6 en 1.357 ms |
| ~3 s no aceptable | ✅ **0 de 6 por encima de 2 s** |

---

## Rediseño del detalle de boleta (2026-08-22)

Cambio **solo de presentación** en `/seller/tickets/[ticketId]` (D-105). Como no toca consultas,
reglas ni base de datos, la verificación se concentró en dos preguntas: *¿se rompió algo que ya
funcionaba?* y *¿se ve y se usa bien en un teléfono?*

| Comando | Resultado | Error | Corrección |
|---|---|---|---|
| `npm run test` | **320/320 ✅** | — | — |
| `npx tsc --noEmit` | ✅ | Una vez: `Expected '</', got 'ident'`. Un comentario `{/* … */}` colocado como primer elemento **dentro** de un ternario `cond ? ( … )`, que es posición de expresión, no de hijos | El comentario sube a la posición de hijos, encima del `{cond ? (` |
| `npm run lint` | ✅ 0 errores | 2 advertencias, las mismas de antes (`BulkTicketCreator`, librería incompatible con el compilador de React) | Ninguna: preexistentes y ajenas |
| `npm run build` | ✅ | — | — |
| `npx playwright test --project=escritorio` | **239/239 ✅** (12,6 min) | — | — |
| `npx playwright test --project=movil` | **35/35 ✅** | — | — |

**Sin desbordamiento horizontal, medido y no supuesto.** Con la sesión de un vendedor real, en cinco
anchos, comparando `document.documentElement.scrollWidth` contra `window.innerWidth`:

| Ancho | scrollWidth / innerWidth | Qué se comprobó además |
|---|---|---|
| 320 px | 320 / 320 ✅ | Los rótulos «Número diario/semanal» **bajan de línea** en vez de recortarse, y las dos cifras de dinero caben junto al anillo |
| 390 px | 390 / 390 ✅ | La acción principal ocupa el ancho y mide **44 px** de alto |
| 768 px (tableta, con barra lateral) | 768 / 768 ✅ | Es el ancho útil **más estrecho** de todos: 464 px de contenido |
| 1024 px | 1024 / 1024 ✅ | El nombre del cliente **completo**, sin `…` |
| 1440 px | 1440 / 1440 ✅ | Las tres columnas y el historial en columnas alineadas |

**Comprobaciones de accesibilidad y de que nada se perdió** (prueba temporal, con sesión real):

| Qué | Resultado |
|---|---|
| La boleta sigue nombrándose por sus dos números | `heading "7 / 1004"` visible ✅ |
| El anillo publica su valor, no solo su color | `role="progressbar"`, `aria-valuenow="83"`, `aria-label="Abonado el 83% del precio de venta"` ✅ |
| El botón corto sigue teniendo nombre completo para quien lo oye | `link "Registrar un abono de Beatriz Rojas"` ✅ |
| La fila del cliente sigue siendo una diana cómoda y enfocable | 44 px de alto, recibe foco ✅ |
| Errores de consola | **0** ✅ |

**Tres errores encontrados durante la propia verificación**, todos de maquetación y corregidos antes
de cerrar:

| Síntoma | Causa | Corrección |
|---|---|---|
| La fecha del abono se montaba encima del icono del método | La columna «Fecha» medía 6 rem y «22 de ago de 2026» necesita ~7,5 | Columna a 9 rem |
| «Número semanal» y el nombre del cliente salían recortados a 768 y 1024 px | El corte de tres columnas estaba en `lg`: con la barra lateral, 1.024 px dejan 672 px de contenido | El corte pasa a `xl`, y el rótulo pierde `truncate` para poder bajar de línea |
| La palabra «abonado» se salía del anillo en el teléfono | El anillo encoge a 64 px y el texto no | El texto encoge con él (9 px en móvil, 11 desde `sm`) |

**Y una trampa de herramientas, no de código** (anotada en `HANDOFF.md` §9): al cambiar una clase de
Tailwind con valor entre corchetes, Turbopack sirvió la CSS **anterior** durante todo un ciclo de
capturas —la rejilla se veía de una sola columna— mientras el `build` de producción sí generaba la
clase nueva. Se confirmó leyendo el CSS generado y se resolvió con `rm -rf .next/dev`. El mismo
servidor de desarrollo empezó después a devolver 500 en todas las rutas tras un *cache compaction*
de Turbopack; reiniciarlo lo arregló.

**Verificación en producción (2026-08-22).** Vercel `READY` sobre `be4a8be`
(`dpl_vzGmPGBx3X6r8gwyYXgXCKXfVd6J`), CI 2/2, `/login` en 200 con sus seis cabeceras, las tres rutas
protegidas en 307 y ninguna clave de servicio en el paquete del navegador. Detalle en
`PHASE_STATUS.md` §7 del mantenimiento del rediseño.

---

## Navegación inferior en el teléfono (2026-08-23)

Verificación del cambio de navegación móvil (D-106). Entorno: Supabase local, `npm run dev:local`,
Playwright con perfil **Pixel 7** para móvil y **Desktop Chrome** para escritorio.

| Comando | Resultado | Errores | Corrección |
|---|---|---|---|
| `npm run typecheck` | ✅ | — | — |
| `npm run lint` | ✅ (2 avisos preexistentes de `react-hooks/incompatible-library` en `DataTable` y `BulkTicketCreator`) | — | — |
| `npm run test` | **325/325 ✅** (5 nuevas) | — | — |
| `npm run build` | ✅ | — | — |
| `npx playwright test --project=movil` | **44/44 ✅** | 4 al principio | Ver más abajo |
| `npx playwright test --project=escritorio` | **242/242 ✅** (11,7 min) | 1 intermitente | Ver más abajo |
| Errores de consola (14 rutas, los dos portales, viewport de teléfono) | **0 errores y 0 avisos**, en crudo | — | — |

### Lo que se comprobó, y no solo que la barra existiera

| Qué | Cómo | Resultado |
|---|---|---|
| Escritorio conserva su barra lateral **completa** | Las ocho entradas del portal administrativo, visibles | ✅ |
| Escritorio **no** muestra la barra inferior | `toBeHidden()` sobre `nav[aria-label="Navegación principal"]` | ✅ |
| Móvil **no** muestra la barra lateral | `[data-tour="nav-sidebar"]` oculto | ✅ |
| Exactamente **cuatro** opciones, en los **dos** portales | `toHaveCount(4)` y las cuatro por nombre | ✅ |
| El cajón lateral ya no existe | `getByRole('button', { name: 'Abrir menú' })` → 0 | ✅ |
| Cada opción lleva a **su ruta de siempre** y queda marcada | Recorridas las cuatro con `tap()`, leyendo `aria-current` | ✅ |
| Una **ruta hija** mantiene su módulo activo | Dentro de `/seller/tickets/<id>`: activo «Boletas», barra visible | ✅ |
| Una pantalla **fuera** de la barra no enciende ninguna | `/seller/team` → 0 opciones con `aria-current` | ✅ |
| El contenido **no queda tapado** | Con la página al final, el último elemento de `main` termina por encima del borde superior de la barra | ✅ |
| Reportes conserva ruta y permisos | Desde el menú de usuario → `/seller/reports`, pantalla real | ✅ |
| El menú de usuario **no repite** en escritorio | «Reportes» oculto ahí bajo `md` | ✅ |

**Errores de consola: medidos, no supuestos.** Con sesión real de vendedor y de dueño, viewport de
teléfono, recorriendo las **14 rutas** de los dos portales y además tocando las cuatro opciones de la
barra y abriendo el menú de usuario, escuchando `console` (`error` y `warning`) y `pageerror`:
**0 en crudo**, sin necesidad de filtrar ni un aviso.

**Los cuatro anchos del encargo**, con la sesión de un vendedor real:

| Ancho | `scrollWidth − clientWidth` | Diana de cada opción | «Clientes» sin cortar |
|---|---|---|---|
| 320 px | 0 ✅ | 80 × 56 px ✅ | ✅ |
| 375 px | 0 ✅ | 93 × 56 px ✅ | ✅ |
| 390 px | 0 ✅ | 97 × 56 px ✅ | ✅ |
| 430 px | 0 ✅ | 107 × 56 px ✅ | ✅ |

El corte se mide de verdad (`label.scrollWidth > label.clientWidth`), no a ojo: la etiqueta lleva
`truncate` como red de seguridad y sin esa comprobación un recorte pasaría inadvertido.

### Errores encontrados durante la verificación

| Síntoma | Causa | Corrección |
|---|---|---|
| «Panel» no respondía al toque: `<nextjs-portal> intercepts pointer events` | El **indicador de `next dev`** se dibuja por defecto abajo a la izquierda, justo encima de la primera opción de la barra. Solo existe en desarrollo | `devIndicators.position: 'top-left'` en `next.config.ts`. Arriba a la izquierda solo hay el nombre de la organización, que no se pulsa |
| 4 pruebas de móvil fallaban buscando el botón del cajón | Describían la navegación anterior: `owner-responsive`, `reports-responsive`, `seller-ciclo-movil` y `equipo-movil` | Reescritas contra la navegación nueva. Ninguna comprobación se perdió: las de Reportes y «Mi equipo» ahora entran por el menú de usuario |

### Una trampa del arnés, no del producto

La primera pasada de escritorio dio **235/242**, con 7 fallos en `importar-boletas`, `seller-clients`
y `seller-tickets`. **No eran del cambio**: las dos suites comparten una sola base de datos y esa
pasada arrancó sobre los datos que había dejado la suite de móvil, así que los selectores de cliente
llegaban con más filas de las que esperaban las pruebas.

Con `npm run db:reset && npm run seed:local` antes de correr, **35/35** en esos tres archivos. Es el
requisito que ya declara la cabecera de `playwright.config.ts`; queda escrito aquí porque el síntoma
—siete fallos repartidos por módulos sin relación entre sí— invita a buscar la causa en el código.

La pasada completa sobre base recién sembrada dio **241/242**, y el único fallo fue un
`page.goto('/owner/tickets/new')` agotando su plazo: una ruta que este trabajo **no toca**, y con el
servidor de desarrollo compartido con otra sesión de navegador. En aislado, `owner-tickets.spec.ts`
da **16/16**, ese caso incluido. Resultado real de escritorio: **242/242**.

### Verificación en producción (2026-08-23)

Vercel `READY` sobre **`79e107b`** (`dpl_JDjCmJxuV69GTAUpwyBMaVwpCUcX`), CI **2/2**, `/login` en 200
con sus seis cabeceras, las tres rutas protegidas en 307 y **0 apariciones** de `SERVICE_ROLE`,
`service_role` o `sb_secret` en los 15 fragmentos de JavaScript servidos (981 KB).

**La CSS de producción demuestra que el código nuevo está servido**, no solo desplegado:
`--bottom-nav-height: 3.5rem`, `--bottom-nav-space` con su `env(safe-area-inset-bottom, 0px)`, la
anulación a `0px` desde `md`, y las tres clases que **solo** existen en el código nuevo
—`height:var(--bottom-nav-height)`, `padding-bottom:env(safe-area-inset-bottom,0px)` y
`bottom:var(--bottom-nav-space)`—. Tailwind solo emite lo que encuentra en el código.

#### Un falso positivo de rendimiento, y cómo se descartó

Al comprobar que **Fluid Compute** seguía cumpliendo (I-067), las primeras medidas dieron picos de
**3,4 s** tras pausas de 45–90 s. Coincidían con el rango que D-104 midió como arranque en frío
(3.594–4.276 ms), así que se dio por bueno el parecido. **Era falso**, y hubo que tirar de dos
comprobaciones para verlo:

1. **El control de la propia D-104:** `/denied` se sirve desde el CDN y «no lo sufre nunca». Pues lo
   sufrió —3,43 s— en un ciclo en el que `/login`, que sí pasa por la función, salió en 344 ms. Una
   función arrancando en frío no puede ralentizar un archivo estático.
2. **El desglose por fases**, sobre diez ciclos con pausa de 45 s:

| Ciclo | Conexión completa (TLS lista) | **Servidor** (`ttfb − appconnect`) |
|---|---:|---:|
| c1 | 1.210 ms | **132 ms** |
| c2 | 301 ms | **265 ms** |
| c3 | 211 ms | **159 ms** |
| c4 | 298 ms | **153 ms** |
| c5 | 229 ms | **176 ms** |
| **c6** | **3.232 ms** | **173 ms** |
| c7 | 187 ms | **154 ms** |
| c8 | 277 ms | **162 ms** |
| c9 | 225 ms | **162 ms** |
| **c10** | **3.263 ms** | **173 ms** |

El servidor respondió entre **132 y 265 ms en los diez**, incluidos los dos que en total tardaron
3,4 s. Lo que se dispara es `time_connect`, y lo hace clavado en ~3,1 s: el plazo inicial de
retransmisión del SYN de TCP en Windows. **Es la red de la máquina que mide, no Vercel.**

**El error de método fue leer `time_starttransfer` como tiempo de servidor.** No lo es: incluye DNS,
TCP y TLS. Queda anotado en `HANDOFF.md` §9 para que la próxima medición empiece por el desglose.

### Fluid Compute declarado en `vercel.json` (2026-08-23)

Vercel `READY` sobre **`ded4181`** (`dpl_DLMzuufXZyqJig9535s7jhzgA2XF`), CI **2/2**. La clave `fluid`
fue aceptada: si no lo fuera, el build habría fallado.

**Lo que había que comprobar de verdad al crear un `vercel.json` por primera vez** es que no pisara
la configuración existente — el formato admite una clave `headers`, y ahí se podía haber roto la
seguridad en silencio:

| Comprobación | Resultado |
|---|---|
| Cabeceras de seguridad | **6 de 6**, todas siguen viniendo de `next.config.ts` y `src/proxy.ts` |
| Rutas protegidas | `/seller/tickets` y `/owner/dashboard` → **307** |
| Código de D-106 servido | `--bottom-nav-height: 3.5rem` sigue en la CSS de producción |

**Latencia, medida ya con el método correcto** (seis ciclos, pausa de 60 s, tiempo de servidor
aislado como `time_starttransfer − time_appconnect`):

| Ciclo | **Servidor** | Conexión |
|---|---:|---:|
| c1 | **254 ms** | 239 ms |
| c2 | **198 ms** | 221 ms |
| c3 | **200 ms** | **3.225 ms** |
| c4 | **149 ms** | 261 ms |
| c5 | **169 ms** | **3.265 ms** |
| c6 | **182 ms** | 213 ms |

Servidor entre **149 y 254 ms en los seis**, incluidos los dos cuya conexión tardó 3,2 s. Fluid
Compute cumple. Los picos vuelven a aparecer clavados en ~3,2 s del lado de la conexión, en ~1 de
cada 3 muestras: es el reintento del SYN de TCP de la máquina que mide, y **no** algo que se pueda
arreglar en el proyecto.

---

## «Boletas» en el teléfono: de tabla a tarjetas (2026-08-23)

Cambio de presentación (**D-107**). Sin migraciones, sin consultas nuevas y sin lógica de negocio
nueva, así que lo que había que demostrar era otra cosa: que **no se perdió nada por el camino** y
que **no se ganó ninguna petición**.

| Comando | Resultado | Error | Corrección |
|---|---|---|---|
| `npx tsc --noEmit` | ✅ | — | — |
| `npx eslint .` | ✅ 0 errores | 2 avisos `react-hooks/incompatible-library` | Preexistentes: `useReactTable` y `useVirtualizer`. No son de este cambio |
| `npx vitest run` | ✅ **325/325** | — | Ninguna nueva: no hay lógica nueva que probar |
| `npx playwright test --project=movil` | ✅ **49/49** | 1 fallo en la primera pasada del archivo nuevo | «Limpiar filtros» dejaba la hoja abierta y su botón quedaba tras el overlay. Se corrigió el **producto**, no la prueba: limpiar cierra |
| `npx playwright test --project=escritorio` | ✅ **242/242** | 7 fallos en una pasada previa | **No eran del cambio**: base sucia por correr móvil antes (I-055, I-060). Con `db:reset` + `seed:local`, en verde |

### Lo que se midió en el navegador, y con qué números

Medido sobre el servidor local con el vendedor 1 y con el dueño, a **375 px** y a **320 px**.

| Comprobación | Resultado |
|---|---:|
| Alto de una tarjeta (objetivo: 90–120 px) | **95–115 px** |
| Tarjetas en una página de resultados | 25 |
| `scrollWidth − clientWidth` a 375 px | **0** |
| `scrollWidth − clientWidth` a 320 px | **0** |
| Borde derecho más lejano dentro de una tarjeta, con viewport de 320 | **291 px** |
| Nombre de cliente de 56 caracteres | recortado con puntos suspensivos; alto **115 px**, sin cambio |
| Tabla de escritorio en móvil | `display: none`, alto 0 |
| Lista de tarjetas en escritorio (1.280 px) | `display: none`, alto 0 |
| Columnas de la tabla en escritorio | **7 de 7 visibles** (selección, dos números, cliente, estado, pago, precio) |
| Etiquetas de formulario duplicadas en escritorio | **0** |
| Fin de la paginación frente al borde de la barra inferior, a 320 px | 644 px vs **663 px** — no la tapa |

### Que no hay N+1, comprobado y no supuesto

Cargando `/seller/tickets` con **25 boletas**, la lista de peticiones del navegador contiene la
navegación a la página y los fragmentos estáticos de Next. **Ninguna** petición por tarjeta: ni una
consulta de cliente, ni de pagos, ni de estados. Es lo esperado —`TicketCardList` no consulta nada—,
pero era justamente lo que había que descartar. **0 errores de consola.**

### Los cuatro errores que aparecieron durante la verificación

1. **Se había perdido «seleccionar toda esta página».** En la tabla la pone la casilla del
   encabezado, que en el teléfono aparecía al entrar en modo selección (`hideOnMobile:
   !selectionMode`). La lista de tarjetas no la tenía, y con ella se perdía también la oferta
   «Seleccionar las N boletas del filtro», que la barra solo muestra cuando la página está completa.
   Añadida a `TicketCardList`, con la misma casilla y el mismo `togglePage`. Comprobado después: al
   marcarla, «25 seleccionadas» y aparece «Seleccionar las 1000 boletas del filtro».

2. **El recorrido guiado habría perdido un paso, sin dar error.** El paso «tus boletas» apunta a
   `data-tour="data-table"` y `usableSteps` descarta lo que mida 0 × 0 px. Con dos presentaciones,
   una siempre está oculta: si la marca hubiera quedado dentro de una de ellas, el paso habría
   desaparecido en la otra pantalla en silencio. Se puso en el envoltorio `TicketsList`, que es el
   primero del documento y siempre mide lo que se ve. Verificado en móvil:
   `firstTourTargetVisible: true`.

3. **«Limpiar filtros» dejaba la hoja abierta.** Lo detectó la prueba nueva, y el fallo era real:
   quien vacía los filtros quiere ver la lista entera, y el botón «Filtros» quedaba además detrás del
   overlay de Radix. Se corrigió el producto.

4. **Tres pruebas de móvil describían la tabla que ya no existe.** `seleccion-movil` buscaba
   `getByRole('row')` y `columnheader`; `owner-responsive` comprobaba que la columna «Vendedor»
   estuviera oculta; `navegacion-movil` esperaba el encabezado «Número diario». Reescritas por
   `list` / `listitem` y por lo que ahora sí se promete. Ninguna comprobación se perdió: la de
   `owner-responsive` pasó de «se ocultan columnas» a «no hay tabla y la tarjeta trae los seis datos».

### Lo que cubre la prueba nueva (`boletas-movil.spec.ts`, 5 casos)

| Caso | Qué demuestra |
|---|---|
| Una boleta vendida enseña sus seis datos | Los dos números, la leyenda, el cliente, `$120.000`, «Asignada» y «Sin pagar», todos en la misma tarjeta |
| Caben varias por pantalla | Tres tarjetas seguidas ocupan ≤ 400 px y ninguna se sale a lo ancho |
| Un nombre largo se recorta | La tarjeta no se estira ni desborda |
| Los filtros están detrás de un botón | El buscador visible, los desplegables no, y «Filtros (2)» con dos puestos |
| La hoja trae los mismos filtros | Cliente, estado y pago dentro; ocupa ≤ 90 % del alto; «Limpiar filtros» limpia y cierra |

### Verificación del despliegue (2026-08-23)

`d3ee139` desplegado a producción con autorización expresa. Vercel `READY`
(`dpl_CrTdZBMtj5NbXxgDQ47YyBkw8xWc`), CI **2/2**. Sin migraciones.

| Comprobación | Resultado |
|---|---|
| `/login` | **200** |
| Cabeceras de seguridad | **6 de 6** — CSP con nonce, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| `/seller/tickets`, `/owner/tickets`, `/owner/dashboard`, `/seller/dashboard` sin sesión | **307** |
| Clave de servicio en los 15 fragmentos JS servidos + el HTML | **0** |
| `85dvh` en la CSS de producción (solo lo genera la hoja de filtros) | **presente** |
| `ring-inset` en la CSS de producción (solo lo genera la tarjeta) | **presente** |
| `bottom-nav-height` (D-106) sigue en la CSS | **presente** |

**Latencia, con el desglose correcto** (`time_starttransfer − time_appconnect`, HANDOFF §9):

| Ciclo | **Servidor** | Conexión | Total |
|---|---:|---:|---:|
| c1 | **185 ms** | **1.282 ms** | 1.468 ms |
| c2 | **159 ms** | 205 ms | 429 ms |
| c3 | **158 ms** | 201 ms | 361 ms |
| `/denied` (control, CDN) | 169 ms | 185 ms | 355 ms |

Servidor entre **158 y 185 ms en los tres**, en línea con los 149–254 ms del despliegue anterior. El
pico de c1 cae del lado de la **conexión**, y el control servido por CDN tiene el mismo perfil: no es
arranque en frío ni tiene que ver con este cambio.

**Lo que un agente no puede verificar aquí:** que la lista se vea bien ya dentro de la sesión. Las
rutas están protegidas y entrar exige una contraseña, que un agente no debe manejar. Queda como
comprobación manual del dueño desde un teléfono real.

---

## La cabecera de «Boletas» deja de ser cuatro bloques sueltos (2026-08-24)

Cambio de presentación (**D-108**). Sin migraciones, sin consultas nuevas y sin lógica nueva: lo que
había que demostrar era que **la pantalla ocupa menos sin perder nada** y que **escritorio no se
movió**.

| Comando | Resultado | Error | Corrección |
|---|---|---|---|
| `npx tsc --noEmit` | ✅ | — | — |
| `npx eslint src tests` | ✅ 0 errores | 2 avisos `react-hooks/incompatible-library` | Preexistentes (`useReactTable`, `useVirtualizer`). No son de este cambio |
| `npx vitest run` | ✅ **325/325** | — | Ninguna nueva: no hay lógica nueva que probar |
| `npm run build` | ✅ | — | — |
| `npm run test:db` | ✅ **518/518** | — | El cambio no toca la base de datos; se ejecuta por protocolo |
| `npx playwright test --project=movil` | ✅ **49/49** | — | Sembrado limpio antes (`db:reset` + `seed:local`) |
| `npx playwright test --project=escritorio` | ✅ **242/242** | — | — |

### Lo que se midió en el navegador

Vendedor 1, servidor local, `/seller/tickets`.

| Comprobación | Antes | Después |
|---|---:|---:|
| **Primera boleta, a 390 px** | y = 448 px | **y = 322 px** |
| «Crear boletas» | fila propia, bajo la descripción | **misma fila que el título** |
| Ancho del buscador, a 390 px | 278 px | **310 px** |
| Alto del buscador | 36 px | **44 px** |
| Alto de «Filtros» y del botón de selección | 32 px | **44 px** |
| Distancia entre «Filtros» y el botón de selección | 24 px (bloques distintos) | **8 px, misma fila** |
| `scrollWidth − clientWidth` a 320 / 390 / 430 px | 0 | **0** |

**Peor caso de ancho, medido y no supuesto.** A **320 px** con **«Filtros (5)»** —el texto más largo
que puede tener ese botón— la fila mide **114 + 8 + 166 = 288 px**, exactamente el ancho disponible,
y ninguno de los dos botones desborda su caja (`scrollWidth == clientWidth`). Es la razón de usar
`grow` y no mitades exactas: dos mitades dan 140 px y «Seleccionar varias» necesita 160.

**Escritorio, a 1.280 px:** el recuadro de filtros conserva su borde de 1 px y su `padding` de 16 px,
los 3 desplegables siguen visibles, el buscador vuelve a 36 px y el botón móvil mide 0 × 0. El
encabezado del detalle de boleta —que lleva flecha de volver— conserva la descripción alineada bajo
el título (x = 332 px), como antes.

### Los tres errores que aparecieron durante la verificación

1. **La descripción se desalineaba en las pantallas con flecha de volver.** El primer intento
   convirtió `PageHeader` en una rejilla **para todas** las pantallas. En el detalle de una boleta,
   donde el título va precedido de la flecha, la descripción dejó de estar indentada bajo el título y
   se pegó al borde izquierdo (x = 280 en vez de 332). Se corrigió dejando **intacto** el árbol de
   siempre y añadiendo la rejilla solo como variante `inlineActions`. Verificado después: x = 332.
2. **Aviso de React: «Each child in a list should have a unique key prop», señalando `TicketFilters`.**
   Lo dispara el nodo `secondaryAction`, que crea un componente de servidor y React no puede dar por
   estático dentro de la lista de hijos de la fila. Se resolvió envolviéndolo en su propio fragmento.
   Comprobado en una pestaña limpia: **0 errores y 0 avisos de consola**.
3. **La barra de selección vacía dejaba 24 px de nada.** Al sacarle el botón de modo, el bloque
   quedaba con altura 0 pero seguía cobrando los dos márgenes de `space-y-6`. No se desmontó —dentro
   está la región `aria-live` del recuento, que debe existir antes de cambiar— sino que pasa a
   `sr-only`, fuera del flujo y todavía anunciable. La prueba que comprueba que tras «Cancelar» el
   recuento queda vacío sigue pasando **sin tocarla**.

### Pruebas adaptadas, y por qué

El botón que enciende el modo selección pasó de decir «Seleccionar» a **«Seleccionar varias»**
(D-108). Tres localizadores lo buscaban por nombre exacto:

| Archivo | Cambio |
|---|---|
| `tests/e2e/seleccion-movil.spec.ts` | Localizador de `activarModoSeleccion` y el título de una prueba |
| `tests/e2e/dialogos-alcanzables.spec.ts` | Localizador de entrada al modo bajo 768 px |

Ninguna afirmación cambió: solo el texto que se busca.

---

## La misma cabecera en el portal administrativo (2026-08-24)

Cambio de presentación (**D-109**), continuación de D-108 sobre `/owner/tickets`. Sin migraciones,
sin consultas nuevas y sin lógica nueva.

| Comando | Resultado | Error | Corrección |
|---|---|---|---|
| `npx tsc --noEmit` | ✅ | — | — |
| `npx eslint src tests` | ✅ 0 errores | 2 avisos `react-hooks/incompatible-library` | Preexistentes (TanStack). No son de este cambio |
| `npx vitest run` | ✅ **325/325** | — | Ninguna nueva: no hay lógica nueva que probar |
| `npx playwright test --project=movil` | ✅ **49/49** | — | Sembrado limpio antes (`db:reset` + `seed:local`) |
| `npx playwright test --project=escritorio` | ✅ **242/242** | — | — |
| `npm run build` | ✅ | — | — |

### Lo que se midió en el navegador

Dueño, servidor local, `/owner/tickets`.

| Comprobación | Resultado |
|---|---|
| «Crear en lote» y «Nueva boleta» a **320 px** | 139 + 8 + 141 = **288 px**, de lado a lado, **44 px** de alto |
| Las mismas a **390 px** | 174 + 8 + 176 = **358 px**, de lado a lado, 44 px |
| Las mismas a **1.280 px** | **131 y 133 px**, alto **36 px**, a la derecha del título (x = 969, y = 80) — idéntico a antes |
| `scrollWidth − clientWidth` a 320 y 390 px | **0** |
| Recuadro de filtros en escritorio | borde 1 px, `padding` 16 px, 3 desplegables — sin cambio |
| Fila «Filtros» + «Seleccionar varias» | **44 px** en las dos pantallas, sin cambio |

**Por qué no suben a la fila del título:** a 320 px el título mide 79 px y las dos acciones 272; con
su hueco suman **363 px** sobre los **288** disponibles. A 390 px quedan 267 para 272. Solo entran a
partir de 430 px.

### El error de diagnóstico que hubo que corregir, y cómo evitarlo

Durante la verificación aparecieron **dos veces** medidas que contradecían al CSS: primero los
botones a 44 px en escritorio (cuando `md:h-9` debía devolverlos a 36), y después a 36 px en el
teléfono (cuando `h-11` debía subirlos a 44). Las dos veces se concluyó que la culpa era del orden en
que Tailwind emite una variante de punto de corte combinada con un selector arbitrario, y **las dos
veces se escribió esa explicación en un comentario del código**.

**Era falso: era caché.** El servidor de desarrollo y la navegación del cliente servían un árbol
anterior mientras el CSS ya era el nuevo. Lo delató una comprobación sencilla: **un clon del mismo
elemento, con el mismo `className`, medía distinto que el original** — algo que la cascada no puede
producir. Confirmado además forzando `style.height` en línea sin que la medida cambiara.

Los comentarios se reescribieron para que no quede una explicación técnica falsa en el código.

**Regla para la próxima vez:** después de editar clases, **mide con una navegación limpia
(`?v=n`), no con `location.reload()`**; si algo sigue sin cuadrar, reinicia `next dev` antes de
culpar a la cascada.

---

## El hueco de la barra de selección múltiple (2026-08-24)

Corrección de presentación (**D-110**) sobre las dos pantallas de boletas. Sin migraciones, sin
consultas nuevas y sin lógica nueva.

| Comando | Resultado | Error | Corrección |
|---|---|---|---|
| `npx tsc --noEmit` | ✅ | — | — |
| `npx eslint .` | ✅ 0 errores | 2 avisos `react-hooks/incompatible-library` | Preexistentes (`DataTable.tsx`, `BulkTicketCreator.tsx`). No son de este cambio |
| `npx vitest run` | ✅ **325/325** | — | — |
| `npm run test:db` | ✅ **518/518** | — | Sin migración; se ejecuta para descartar arrastre |
| `npx playwright test --project=movil` | ✅ **50/50** | — | 49 anteriores + 1 nueva de regresión |
| `npx playwright test --project=escritorio` (selección, boletas de los dos portales) | ✅ **61/61** | — | `seleccion-multiple`, `filas-seleccionables`, `seller-tickets`, `owner-tickets` |
| `npm run build` | ✅ | — | — |

**La suite de escritorio se corrió parcial, a propósito:** bajo `md` la variable nueva vale 0 px, la
barra no se dibuja y el único cambio de DOM es una envoltura alrededor de un elemento ya oculto. Se
eligieron los cuatro archivos que tocan selección y listas de boletas. Si se promueve el cambio, CI
corre las dos suites completas.

### Lo que se midió en el navegador

Vendedor, servidor local, `/seller/tickets`, con **una boleta marcada** y modo selección encendido.

| Comprobación | Antes | Después |
|---|---:|---:|
| «Limpiar selección» → cabecera de la lista, a 375 px | **128 px** | **24 px** |
| Hueco entre la barra de acciones y la de navegación | 24 px | **0** (−1 px: el borde de la navegación queda debajo) |
| Paginación → barra, al final de la lista | **−9 px** (tapada) | **15 px** |
| `padding-bottom` de `<main>` con selección | 72 px | **128 px** |
| `padding-bottom` de `<main>` sin selección | 72 px | **72 px** (sin cambio) |
| A 1.280 y 1.440 px: `--selection-bar-space` | — | **0px**; `padding` 24 px y separaciones de 24 px, sin cambio |

### La prueba de regresión se verificó al revés

No basta con que pase: se comprobó que **falla sin el arreglo**, cada mitad por su causa.

| Se deshizo | Fallo obtenido |
|---|---|
| Devolver `<div className="h-20 md:hidden">` al componente | `expect(received).toBeLessThan(40)` — recibido **113** |
| Quitar `--selection-bar-space` del `padding` de `AppShell` | La paginación queda por debajo de la barra |

### Dos hallazgos que conviene no olvidar

**1. El margen de un `space-y-*` mueve un elemento fijo.** La barra estaba 24 px por encima de donde
decía su `bottom`. No era la variable ni el `z-index`: al ser hija directa del `space-y-6` de la
pantalla recibía `margin-bottom: 24px`, y en un elemento posicionado por `bottom` ese margen entra en
la ecuación que lo coloca. Se confirmó poniendo `style.marginBottom = '0px'` desde la consola: el
borde inferior pasó de `y = 732` a `y = 756`, exactamente los 24 px.

**2. El bloque de 80 px no era «de móvil»: era de menos de 768 px.** Se reportó como que ocurría
«tanto en escritorio como en móvil», y a 1.280 y 1.440 px no ocurre —el espaciador es `md:hidden`—.
Sí ocurría en cualquier ventana de escritorio estrechada por debajo de `md`, que es como estaban
hechas las capturas del reporte.

### Verificación tras desplegar (2026-08-24)

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`ef6bcb2`** (`dpl_KkU3vKAFr169yzRhfA5VBrPpxB7A`), alias `gestion-rifas.vercel.app` |
| CI | **2/2** en verde |
| `/login` | **200** con las 6 cabeceras (`CSP`, `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) |
| Rutas protegidas sin sesión | 4 de 4 en **307** |
| Clave de servicio | **0** apariciones en el HTML y en los **27** recursos estáticos que sirve `/login` |
| CSS de producción | Trae las tres huellas del cambio: `body:has([data-selection-bar])`, el `calc` de tres sumandos en el `padding-bottom` de `<main>` y el único `display:contents` de la aplicación |
| Tiempo de servidor (3 ciclos) | **150, 169 y 202 ms** |

**Lo que no se puede verificar desde aquí:** el comportamiento con sesión iniciada. Entrar exige una
contraseña de producción, y eso no lo maneja un agente. Queda para el dueño, en un teléfono real: al
marcar una boleta, la lista debe empezar justo debajo del recuento, y al final de la lista
«Siguiente» debe poder tocarse sin que la barra lo tape.

---

## La paginación en el teléfono (2026-08-24)

Rediseño de presentación (**D-111**) sobre el componente que comparten los ocho listados. Sin
migraciones, sin consultas nuevas y sin tocar el cálculo de páginas.

| Comando | Resultado | Error | Corrección |
|---|---|---|---|
| `npx tsc --noEmit` | ✅ | — | — |
| `npx eslint .` | ✅ 0 errores | 2 avisos `react-hooks/incompatible-library` | Preexistentes (`DataTable.tsx`, `BulkTicketCreator.tsx`). No son de este cambio |
| `npx vitest run` | ✅ **325/325** | — | — |
| `npx playwright test --project=movil` | ✅ **51/51** (1 nueva) | — | `db:reset` + `seed:local` antes de la pasada |
| `npx playwright test --project=escritorio` | ✅ **242/242** | — | Suite completa: el componente lo usan las ocho listas |
| `npm run build` | ✅ | — | — |

### Lo que se midió en el navegador

Vendedor, servidor local, `/seller/tickets` con **6.410 boletas** (257 páginas): el peor caso real
para el ancho, porque el indicador tiene que escribir tres cifras.

| Comprobación | 320 px | 375 px | 1.280 px |
|---|---|---|---|
| Alto de los botones | **44 px** | **44 px** | **32 px** (sin cambio) |
| Aire lateral de los botones | 12 px | 12 px | **10 px** (sin cambio) |
| «Anterior» / «Siguiente» | 100 y 108 px, pegados a los dos márgenes | 100 y 108 px, ídem | 96 y 104 px, a la derecha |
| Indicador | «1 de 257» en **una línea**, 64 px | «1 de 257», 119 px | «Página 1 de 257» |
| Centrado del indicador entre los botones | exacto (156 vs 156) | exacto (183,5 vs 183,5) | n/a |
| Ancho de la fila de controles | 288 px | 343 px | **314 px** (sin cambio) |
| `scrollWidth − clientWidth` | **0** | **0** | 0 |

**Espaciado pedido y espaciado obtenido, a 375 px:**

| | Pedido | Medido |
|---|---|---|
| Última boleta → recuento | 24 px | **24 px** |
| Recuento → botones | 12–16 px | **16 px** |
| Botones → barra inferior | 24–32 px | **23 px** (8 de `pb-2` + 16 del armazón, menos el borde) |

**Estados deshabilitados.** En la página 1, «Anterior» sigue visible con `opacity: 0.5` y
`pointer-events: none`; en la 257, «Siguiente». **Las coordenadas de los dos botones son idénticas en
ambas páginas** (x = 16 y x = 196 a 320 px): nada se mueve bajo el dedo al cambiar de página.

### Lo que se comprobó en las ocho listas

| Pantalla | Recuento |
|---|---|
| `/seller/tickets` | «1–25 de 6410 boletas» |
| `/seller/clients` | «1–25 de 47 clientes» |
| `/seller/payments` | «1–25 de 45 pagos» |
| Reporte «clientes con saldo» | «1–25 de 29 clientes» |
| Reporte de recaudo | «1–1 de **1 día**» — singular correcto, y **días**, no pagos |

Ese último es el hallazgo del trabajo: el reporte de recaudo pagina **días**, no pagos. Un valor por
defecto genérico lo habría escondido; por eso `items` no lo tiene.

### La prueba de regresión se verificó al revés

Con el componente anterior en su sitio, la prueba nueva falla en la primera afirmación —el texto
«1–25 de N boletas» no existe— y no en un detalle de píxeles.

### Un tropiezo del arnés, no del producto

Al arrancar el servidor local, `/seller/tickets` devolvió 500 con
`PGRST303: JWT issued at future`: la sesión guardada del navegador tenía un `iat` por delante del
reloj del contenedor de Supabase. Se resolvió volviendo a entrar. **No es un fallo de la aplicación
ni tiene que ver con este cambio**, pero conviene reconocerlo la próxima vez en vez de buscar la
causa en el código.

### Verificación tras desplegar (2026-08-24)

| Comprobación | Resultado |
|---|---|
| Vercel | `READY` sobre **`7d7cf18`** (`dpl_3fLMzy1uxwJYN9gfMrba7i6GQuUs`) |
| CI | **2/2** en verde |
| `/login` | **200** con las 6 cabeceras |
| Rutas protegidas sin sesión | 4 de 4 en **307** |
| Clave de servicio | **0** apariciones en el HTML y en los **27** recursos estáticos |
| CSS de producción | Dentro de `@media (min-width:48rem)`: `.md\:not-sr-only`, `.md\:has-[>svg]\:px-2.5`, `.md\:max-w-none` y `.md\:flex-none` |
| Tiempo de servidor (3 ciclos) | **149, 156 y 186 ms** |

**Un apunte para la próxima verificación, que costó tres intentos.** En la CSS de producción los dos
puntos, los corchetes y el punto decimal de una clase van **escapados con barra invertida**
(`.md\:has-\[\>svg\]\:px-2\.5`), así que un patrón escrito como se lee en el JSX no encuentra nada y
parece que el despliegue no trae el código. **Y pasar de `grep` a `String.indexOf` no basta:** entre
el shell y Node la barra invertida del patrón se pierde por el camino —se comprobó imprimiendo el
patrón, que llegaba sin ella—, así que la búsqueda vuelve a fallar por la misma causa y sigue
pareciendo un problema del despliegue.

**Lo que sí funciona:** construir la barra con `String.fromCharCode(92)` dentro del script, sin
escribirla en el fuente. Así se confirmaron las cuatro reglas. **Antes de concluir que la CSS de
producción no trae una clase, imprime el patrón que estás buscando:** si le falta la barra, el
problema está en tu comando, no en el despliegue.

---

## El panel del vendedor, rediseñado (2026-08-25)

Decisión **D-112**. Sin migraciones y sin dependencias nuevas.

| Comando | Resultado | Errores | Corrección |
|---|---|---|---|
| `npm run typecheck` | ✅ | — | — |
| `npm run lint` | ✅ 0 errores | `DonutChart` reasignaba un acumulador **durante el render** (`react-hooks/immutability`) | Los arcos y sus desplazamientos se calculan de una vez, antes de dibujar |
| `npm run test` | ✅ **359/359** | — | 34 pruebas nuevas: 20 del período y 14 del reparto del dinero |
| `npm run test:db` | ✅ **518/518** | — | Sin cambios de esquema; se ejecutó para comprobar que no los hay |
| `npm run build` | ✅ | — | — |
| `npx playwright test --project=escritorio` | ✅ **243/243 (1 nueva)** | Ver abajo | — |
| `npx playwright test --project=movil` | ✅ **51/51** | — | — |

### Los cinco errores que encontró la verificación en pantalla

Ninguno lo habría visto una prueba unitaria: todos aparecieron midiendo la página real.

**1. «Ganancia por boleta» mostraba $0 a quien no ha cobrado nada.** `commission_summary` devuelve
fila **también** para un vendedor sin boletas cobradas, y en esa fila la tarifa vale 0 porque el
primer tramo empieza en la boleta 1. La tarjeta «Tu ganancia» lo evitaba tratando `ticketsPaid === 0`
como caso vacío; al pasar la cifra al indicador se perdió esa condición. Detectado con
`vendedor@control.test`, cuyo panel debía decir **$25.000** —la mitad de una boleta de $50.000— y
decía $0. Corregido: la fila solo manda cuando hay boletas cobradas.

**2. La lista del selector de período aparecía a 1.400 px del botón.** Medido: botón en (1022, 80),
lista en (4, 1443). La causa no es evidente: la colocación por defecto de Radix (`item-aligned`)
alinea la opción elegida con el **texto del botón** y para eso necesita un `SelectValue` que medir;
este botón lleva las fechas escritas a mano, así que no hay nada que medir y la colocación nunca se
resuelve. Con `position="popper"` la lista se ancla al botón: medida después, en (1031, 112) con el
mismo borde derecho que el botón. **El mismo componente en `/seller/reports` funcionaba bien**, lo que
al principio apuntaba en la dirección equivocada; la diferencia es exactamente el `SelectValue`.

**3. El eje del gráfico decía «$1» cuando no había entrado dinero.** Es el valor que se usa para no
dividir por cero, y se había colado en la etiqueta. Un eje que dice «$1 · $1 · $0» sobre una línea
plana no informa de nada. Ahora el eje escribe solo «$0» y la escala interna se queda donde debe.

**4. Tres piezas se rompían en escritorio y no en el móvil.** Es el error que más veces se repitió, y
tiene una sola causa: **estas tarjetas ocupan media pantalla en escritorio, así que el tamaño de la
ventana no dice nada del espacio que tienen dentro.** Medido a 1.024 px:

| Pieza | Qué pasaba | Arreglo |
|---|---|---|
| Leyenda del anillo | Los nombres tenían **0 px** de ancho: el anillo ocupaba 192 y la leyenda 66 | Container query `@min-[400px]` y el tamaño del anillo lo pasa quien lo usa |
| «Mis boletas» | Seis columnas de **43 px**: «Disponibles» necesita 62 | Container query `@min-[400px]/tickets`, 3 × 2 por debajo |
| Indicadores | «$2.325.000» necesita 118 px y tenía **78** | Cuatro en fila desde `xl`, no desde `lg` |

**5. El nombre del cliente se quedaba en 38 px** a 320 px en «Actividad reciente», porque el importe
y la palabra «(anulado)» se llevaban su columna. Corregido subiendo el importe a la misma línea que
el nombre y dejando la fecha sola en la segunda: medido después, 104 px para el nombre y 162 para la
fecha, sin desbordamiento de página.

### Lo que se midió, y a qué anchos

| Ancho | Comprobado |
|---|---|
| **320 px** | Desbordamiento horizontal **0**. Los siete bloques en una columna, con «Accesos rápidos» el primero. Ningún texto cortado salvo dos nombres de cliente de la base de pruebas —«Boleta con pagos mt7w245b523»— que no son nombres reales |
| **375 px** | Orden del móvil verificado por coordenadas: accesos rápidos (294), indicadores, resumen financiero (1110), cobranza (1548), mis boletas (1798), tendencia (2016), actividad reciente (2259) |
| **768 px** | Indicadores en **2 × 2**, secciones a una columna, desbordamiento 0 |
| **1.024 px** | Indicadores 2 × 2, «Mis boletas» 3 × 2, cero textos cortados |
| **1.280 px** | Indicadores **4 en fila**, «Mis boletas» **6 en fila** (63 px por columna), anillo junto a su leyenda, cero textos cortados |

**La aritmética, comprobada contra la pantalla real** (vendedor1, base de pruebas):

```
Total a cobrar   $3.100.000
Pagadas            $360.000  (12 %)
Abonadas           $415.000  (13 %)
Por cobrar       $2.325.000  (75 %)   → suman exactamente el total ✓

Cobranza:  Sin pagar $1.660.000 + Abonadas $1.080.000 + Pagadas $360.000
                                                     = $3.100.000 ✓
Indicador «Cobranza» 25 % = 775.000 / 3.100.000 ✓
Indicador «Por cobrar» $2.325.000 = 3.100.000 − 775.000 ✓
```

**Vendedor sin ventas** (`vendedor@control.test`): estados vacíos limpios en las tres secciones, cero
apariciones de `NaN` o `Infinity`, y el precio leído de **su** rifa ($50.000, no $120.000), que es la
comprobación de que la cifra no está escrita en el código.

**El recorrido guiado sigue completo**: los siete pasos del panel del vendedor se recorrieron de
principio a fin y los cuatro elementos que resaltan (`quick-actions`, `financial-summary`,
`metrics-inventory`, `metrics-collection`) siguen existiendo en la pantalla nueva.

### Dos fallos de prueba que NO eran del cambio

**a) Dos pruebas del recorrido del portal administrativo fallaron en una tanda y pasaron en otra.**
Son del panel del **dueño**, que este trabajo no toca. La causa es la trampa que `HANDOFF.md` ya
documenta: `equipo.spec.ts` crea vendedores de verdad, el panel administrativo crece con cada uno, y
el globo del recorrido acaba fuera de la ventana. Con la base recién sembrada, **8/8**.

**b) «Un vendedor no ve la ganancia de otro» falló por una coincidencia numérica.** La prueba buscaba
que el importe ganado por `vendedor1` —**$60.000**— no apareciera en el panel de `vendedor2`. Resulta
que $60.000 es también la tarifa de `vendedor2`: la mitad de una boleta de $120.000. Con la tarjeta
anterior no colisionaba porque ese número vivía dentro de una frase; en el indicador es un importe
suelto. **No era un fallo de aislamiento** —se comprobó que el resto del panel de `vendedor2` es
suyo—, sino una prueba que verificaba un número en vez de un significado. Reescrita para comprobar la
frase completa («Llevas $60.000 ganados»), que solo puede aparecer si el importe se presenta como
ganancia propia.

**c) Y una tercera, en el recorrido guiado del teléfono, que sí venía de este cambio pero no era
lo que parecía.** «El globo cabe en la pantalla en todos los pasos» falló midiendo el globo
**1.056 px** abajo en una pantalla de 839. La causa inmediata era la medición: la prueba tomaba la
caja en cuanto el globo existía, y al cambiar de paso el recorrido lleva el elemento a la vista
con un **scroll suave** que el globo persigue cuadro a cuadro — o sea, se estaba midiendo un globo
en pleno vuelo hacia algo que venía de 1.000 px más abajo. Se corrigió esperando a que **dos
lecturas seguidas coincidan**, que es la posición en reposo, la única que dice si cabe. **Y detrás
había algo real**: la tarjeta del resumen financiero medía **422 px** de alto en el móvil, y
centrada en 839 px dejaba 209 libres a cada lado cuando el globo pide 226; encajaba solo tapando
la tarjeta que estaba explicando. El anillo del teléfono bajó de 160 a **128 px** y la tarjeta a
**374**, medido. Los dos arreglos eran necesarios: sin el primero la prueba seguiría siendo una
lotería, y sin el segundo el recorrido taparía lo que explica.
