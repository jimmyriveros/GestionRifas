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
