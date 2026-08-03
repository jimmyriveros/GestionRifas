# ESTRATEGIA DE PRUEBAS

- **Versión:** 1.0 · **Fase:** 0 (estrategia) · **Actualizado:** 2026-08-02
- **Estado actual:** no existe código ejecutable ni suites de prueba. Las herramientas se configuran
  en la Fase 1 y las suites crecen fase a fase.

---

## 1. Pirámide de pruebas

| Nivel | Herramienta | Qué cubre | Dónde vive | Velocidad |
|-------|-------------|-----------|------------|-----------|
| Unitarias | Vitest | Formato de dinero, validadores Zod, cálculo de estados, transformaciones de fecha, utilidades | `tests/unit/` | ms |
| Base de datos | Vitest + `@supabase/supabase-js` contra Supabase local | Restricciones, triggers, RPC, **RLS con sesiones reales** | `tests/db/` | segundos |
| Componentes | Vitest + Testing Library | Formularios críticos, tabla de carga masiva, entrada de números | `tests/unit/components/` | ms |
| E2E | Playwright | Flujos completos por rol, responsive, protección de rutas | `tests/e2e/` | minutos |

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

---

## 3. Matriz de trazabilidad — pruebas mínimas de `CLAUDE.md` §30

| # | Prueba mínima | Regla | Nivel | Fase |
|---|---------------|-------|-------|------|
| 1 | Login y redirección por rol | BR-A01, BR-A02 | E2E | 1 |
| 2 | Bloqueo de usuarios inactivos | BR-A04, BR-A05 | E2E + BD | 1 |
| 3 | Aislamiento entre organizaciones | BR-O02, BR-O03 | BD | 2 |
| 4 | Aislamiento entre vendedores | BR-U07 | BD | 2 |
| 5 | Creación de rifas | BR-R04, BR-R07 | E2E | 3 |
| 6 | Creación masiva de boletas | BR-N10 | E2E | 3 |
| 7 | Límite de cuatro dígitos | BR-N02 | Unit + BD | 2 |
| 8 | Conservación de ceros iniciales | BR-N03 | Unit + BD | 2 |
| 9 | Detección de combinaciones duplicadas | BR-N04 | BD | 2 |
| 10 | Duplicados entre vendedores | BR-N05 | BD | 2 |
| 11 | Asignación de boleta | BR-I07, BR-P03 | E2E + BD | 4 |
| 12 | Creación de cliente | BR-C02 | E2E | 4 |
| 13 | Registro de abono | BR-F02, BR-F06 | E2E + BD | 5 |
| 14 | Cambio a estado Abonada | BR-F07 | BD | 5 |
| 15 | Cambio a estado Pagada | BR-F07 | BD | 5 |
| 16 | Bloqueo de sobrepago | BR-F12 | BD | 2 |
| 17 | Pago entre varias boletas | BR-F02, BR-F05 | BD | 5 |
| 18 | Atomicidad de pagos | BR-F06 | BD | 5 |
| 19 | Anulación de pago | BR-F09, BR-F10 | E2E + BD | 5 |
| 20 | Recálculo de saldo | BR-F11 | BD | 5 |
| 21 | Bloqueo de cambio de cliente con pagos | BR-I12 | BD | 5 |
| 22 | Aprobación de boletas creadas por vendedor | BR-I09 | E2E | 3 |
| 23 | Restricciones de rifas cerradas | BR-R08, BR-R09 | BD | 3 |
| 24 | RLS | SECURITY §4 | BD | 2 |
| 25 | Protección de APIs y Server Actions | SECURITY §5 | E2E + integración | 7 |

Al cerrar la Fase 7, las 25 filas deben estar automatizadas y en verde.

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
| 6 | Métricas verificadas contra consultas SQL de control + responsive |
| 7 | Las 25 pruebas mínimas de `CLAUDE.md` §30, automatizadas |
| 8 | Prueba de humo en producción + restauración de copia de seguridad |
| 9 | Reejecución completa + informe de auditoría |

---

## 9. Registro de ejecuciones

Se completa al cierre de cada fase. Fase 0: no aplica (no hay código ejecutable).

| Fecha | Fase | Comando | Resultado | Errores | Corrección |
|-------|------|---------|-----------|---------|------------|
| 2026-08-02 | 0 | `npm view <paquete> version` (13 paquetes) | Versiones estables verificadas | Incompatibilidad `typescript-eslint` ↔ TypeScript 7.x | Se fija TypeScript 5.9.3 (D-002) |
| 2026-08-03 | 1 | `npm install` | 456 paquetes instalados | `@supabase/supabase-js`/`jsdom` exigían Node ≥22 | Se fijan versiones compatibles con Node 20 (D-029, D-030) |
| 2026-08-03 | 1 | `npm run typecheck` | 0 errores | 2 errores iniciales por `noUncheckedIndexedAccess` en `lib/errors.ts` | Variable intermedia antes de retornar el valor indexado |
| 2026-08-03 | 1 | `npm run lint` | 0 errores | `eslint@10` incompatible con `eslint-plugin-react` interno de `eslint-config-next` | Se fija `eslint@9.39.5` (D-031) |
| 2026-08-03 | 1 | `npm run test` (vitest) | 14/14 pruebas en verde (money, dates, errors) | Ninguno | — |
| 2026-08-03 | 1 | `npm run build` | Build de producción exitoso, 10 rutas | `typedRoutes: true` rompía un `href` calculado dinámicamente | Se desactiva `typedRoutes` (D-032) |
| 2026-08-03 | 1 | `npm run format:check` / `npm run format` | 31 archivos reformateados (orden de clases Tailwind, comillas) | Ninguno | — |
| 2026-08-03 | 1 | `supabase db push --db-url <pooler>` | Migración `0001_core_identity.sql` aplicada | Conexión directa (`db.*.supabase.co:5432`) no resolvía por DNS | Se usa el Session pooler (I-005) |
| 2026-08-03 | 1 | Verificación de catálogo (RLS, funciones, triggers, políticas, enum, índices) vía `pg` directo | Todo coincide exactamente con el diseño | Ninguno | — |
| 2026-08-03 | 1 | `npm run seed:users` | Organización + 4 usuarios creados, idempotente en 2ª ejecución | `auth.admin.createUser` no dejaba una contraseña utilizable de inmediato | Se agrega `updateUserById` de confirmación (D-035, I-007) |
| 2026-08-03 | 1 | Login manual en navegador — Owner, Admin, Seller | Los 3 llegan al dashboard correcto con datos reales de sesión | Error de React "functions cannot be passed to Client Components" al pasar iconos de navegación | Los íconos se pasan pre-renderizados (`ReactNode`), no como referencia de componente |
| 2026-08-03 | 1 | Login manual — credenciales inválidas | Mensaje "Correo o contraseña incorrectos" | Ninguno | — |
| 2026-08-03 | 1 | Acceso de Seller a `/owner/dashboard` | Redirigido a `/denied` con mensaje claro | Ninguno | — |
| 2026-08-03 | 1 | Acceso no autenticado a `/seller/dashboard` y `/owner/dashboard` | Redirigido a `/login` | Ninguno | — |
| 2026-08-03 | 1 | Desactivación de membresía + intento de login | Bloqueado con "Tu cuenta está inactiva" | Bug real: error de PostgREST por relación ambigua (`memberships` tiene 2 FK hacia `profiles`) se interpretaba como cuenta inactiva | Se desambigua el embed (`profiles!memberships_profile_id_fkey`) y se registra el error real en el servidor |
| 2026-08-03 | 1 | Logout + verificación de sesión cerrada | Cookie de sesión invalidada, `/owner/dashboard` vuelve a redirigir a `/login` | Ninguno | — |
| 2026-08-03 | 1 | Persistencia de sesión tras re-navegación | Sesión se mantiene, dashboard renderiza sin pedir login de nuevo | Ninguno | — |
| 2026-08-03 | 1 | Recuperación de contraseña (`/forgot-password`) | Acción responde `ok` sin revelar si el correo existe | Ninguno | — |
| 2026-08-03 | 1 | Interacción en viewport móvil (375px) vía herramienta de navegador | Estructura de accesibilidad correcta; el clic del botón "Ingresar" no disparó el submit con esta herramienta específica | No reproducido en escritorio (mismo flujo exitoso repetidas veces) | Se documenta como limitación de la herramienta, no de la app (I-009); pendiente de repetir en dispositivo real o Playwright |
