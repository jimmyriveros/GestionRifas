# RESULTADOS DE PRUEBAS POR FASE

Registro cronológico de lo que se ejecutó, qué falló y cómo se corrigió.
La **estrategia** de pruebas (qué se prueba y con qué herramienta) vive en
[`TESTING.md`](TESTING.md); este archivo solo acumula resultados.

Convención: se registran también los errores encontrados, incluso si se corrigieron en el momento.
Un error corregido documentado es información; ocultarlo es deuda.

---

## Resumen

| Fase | Unitarias | Base de datos | Verify | Estado |
|---|---|---|---|---|
| 0 | — | — | — | ✅ (documental) |
| 1 | 14 ✅ | — | ✅ | ✅ |
| 2 | 14 ✅ | **111 ✅** | ✅ | ✅ |

Reejecución rápida: `npm run verify` y `npm run test:db`.

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
