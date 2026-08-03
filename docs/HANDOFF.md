# HANDOFF — punto de entrada para una sesión nueva

**Lee este archivo primero. Es lo único obligatorio junto con `CLAUDE.md`.**
Los demás documentos se leen **solo si la fase autorizada los necesita** (ver §5).

---

## 1. Estado actual

| | |
|---|---|
| Última fase completada | **2 — Base de datos, restricciones y RLS** |
| Siguiente fase | **3 — Portal Owner y Admin** (requiere autorización explícita del usuario) |
| Rama / commit / etiqueta | `main` · `954531c` · `fase-2` |
| Remoto | `github.com/jimmyriveros/GestionRifas` (main y etiquetas subidas) |
| App | Next.js 16 corriendo: login, logout, recuperación y cambio de contraseña, redirección por rol |
| Base de datos | Esquema completo aplicado en **local y en el proyecto Supabase real** |
| Pruebas | 14 unitarias + **111 de base de datos**, todas en verde |

**Lo que existe hoy:** autenticación funcional + base de datos completa con todas las reglas de
negocio aplicadas.
**Lo que NO existe:** ninguna pantalla de rifas, boletas, clientes o pagos. Los dashboards son
placeholders. Eso es exactamente el trabajo de las fases 3 a 6.

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
npm run dev
```

Requisitos: Node ≥ 20.19, Docker Desktop, y un `.env.local` (ver §3).

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
`cancel_ticket`. Todas validan permisos internamente y auditan.

**Vistas de solo lectura:** `v_ticket_balances` · `v_client_balances` · `v_seller_summary` ·
`v_raffle_summary` · `v_payment_history`.

---

## 7. Verificar el estado real sin leer documentación

Si dudas de si la documentación está al día, pregúntale a la base de datos:

```bash
npm run test:db
```

111 pruebas que fallan si alguien rompió una invariante. Incluyen comprobaciones de catálogo que
detectan una tabla sin RLS, una función sin `search_path` o una vista sin `security_invoker`,
**aunque nadie escriba una prueba nueva**.

```bash
npm run verify
```

typecheck + lint + unitarias + build.

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
