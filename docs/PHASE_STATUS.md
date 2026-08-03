# ESTADO DE LAS FASES

Registro de lo entregado por fase. **Leer antes de iniciar cualquier fase.**
Ninguna fase comienza sin autorización explícita del usuario (`CLAUDE.md` §1).
Para arrancar una sesión nueva, empieza por [`HANDOFF.md`](HANDOFF.md).

- **Actualizado:** 2026-08-03 · **Fase actual:** 2 completada · **Siguiente:** 3 (no autorizada)

| Fase | Nombre | Estado | Commit / etiqueta |
|---|---|---|---|
| 0 | Arquitectura y planificación | ✅ | `b4b991c` · `fase-0` |
| 1 | Proyecto base y autenticación | ✅ | `34b3cb1` · `fase-1` |
| 2 | Base de datos, restricciones y RLS | ✅ | `954531c` · `fase-2` |
| 3 | Portal Owner y Admin | ⬜ | — |
| 4 | Portal Seller y clientes | ⬜ | — |
| 5 | Pagos, abonos y saldos | ⬜ | — |
| 6 | Dashboards, reportes y UI/UX | ⬜ | — |
| 7 | Pruebas, seguridad y endurecimiento | ⬜ | — |
| 8 | Despliegue y documentación operativa | ⬜ | — |
| 9 | Auditoría final independiente | ⬜ | — |

---

## ANTES DE EMPEZAR LA FASE 3 — revisar esto

1. **Confirmar autorización explícita** del usuario para la Fase 3.
2. **Leer** `CLAUDE.md`, `docs/HANDOFF.md` y la sección «Fase 3» de `docs/IMPLEMENTATION_PLAN.md`.
   No hace falta leer los demás documentos completos (guía en `HANDOFF.md` §5).
3. **Levantar el entorno** y comprobar que todo pasa antes de tocar nada:
   `npx supabase start` → `npm run db:reset && npm run seed:local` → `npm run test:db` (111 ✅) →
   `npm run verify` (✅).
4. **Usar las RPC existentes**, no DML directo, para asignar / aprobar / anular / crear en lote.
   Ya están escritas y probadas: reimplementar esa lógica en TypeScript sería un error.
5. **No reimplementar validaciones que la BD ya garantiza** (unicidad, sobrepago, estados). Sí hay
   que validar en cliente y servidor con Zod para dar buenos mensajes, pero la BD es la red final.
6. **Traducir errores de PostgreSQL** con `mapPgError` (`src/lib/errors.ts`). Las RPC devuelven
   mensajes de negocio en español ya listos para mostrar; conviene ampliar `mapPgError` en la Fase 3
   para propagarlos (hoy los códigos desconocidos caen a un mensaje genérico).
7. **Pendientes conocidos que tocan a la Fase 3:** I-007 (alta de usuarios necesita
   `createUser` + `updateUserById`) y `TanStack Table` + `@tanstack/react-virtual` todavía **no están
   instalados** (hacen falta para la tabla de boletas y la carga masiva de 1.000 filas).

---

## Fase 0 — Arquitectura y planificación ✅

**Funcionalidades:** ninguna (fase documental). Produjo los 10 documentos de `docs/`, el modelo de
datos, la matriz de permisos, el diseño de RLS y el plan de las 10 fases.
**Pruebas:** revisión de consistencia documental + verificación de versiones del stack en npm.
**Migraciones:** ninguna.
**Decisiones:** D-001 a D-026.
**Hallazgo:** `typescript-eslint@8` no soporta TypeScript 7 → se fijó TypeScript 5.9.3 (D-002).

---

## Fase 1 — Proyecto base y autenticación ✅

### Funcionalidades implementadas
- Next.js 16 (App Router) + TypeScript estricto + Tailwind 4 + shadcn/ui + ESLint + Prettier.
- Clientes Supabase: `client` (browser), `server` (RSC/Actions), `proxy` (sesión), `admin`
  (`server-only`, service role).
- `src/proxy.ts` — refresco de sesión y guardas de ruta (Next 16 renombró `middleware` → `proxy`).
- Login, logout, recuperación y cambio de contraseña.
- Redirección por rol: owner/admin → `/owner/dashboard`, seller → `/seller/dashboard`.
- Bloqueo de usuarios inactivos, **incluso con sesión previa** (BR-A04).
- Layouts responsive de los dos portales (sidebar escritorio / drawer móvil), `/denied`,
  `error.tsx`, `not-found.tsx`, dashboards placeholder.
- `src/lib/`: `money.ts` (COP entero), `dates.ts` (America/Bogota), `errors.ts`, `constants.ts`.

### Pruebas ejecutadas y resultados
| Prueba | Resultado |
|---|---|
| Unitarias (money, dates, errors) | ✅ 14/14 |
| `typecheck` · `lint` · `build` | ✅ |
| Login válido (3 roles) en navegador | ✅ |
| Login inválido | ✅ mensaje correcto |
| Seller → `/owner/*` | ✅ redirige a `/denied` |
| Sin sesión → ruta protegida | ✅ redirige a `/login` |
| Usuario inactivo | ✅ bloqueado y sesión cerrada |
| Logout y persistencia de sesión | ✅ |
| Recuperación de contraseña | ✅ sin revelar si el correo existe |

### Migraciones
`0001_core_identity.sql` — `organizations`, `profiles`, `memberships`, enum `app_role`, funciones de
seguridad, RLS de solo lectura, triggers sobre `auth.users`.

### Variables de entorno
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SITE_URL`, `TZ`, `SEED_DEFAULT_PASSWORD`.

### Decisiones
D-027 a D-036. Destacadas: `proxy.ts` en vez de `middleware.ts` (D-027); versiones fijadas por
incompatibilidad con Node 20 (D-029/030/031); `typedRoutes` desactivado (D-032).

---

## Fase 2 — Base de datos, restricciones y RLS ✅

### Funcionalidades implementadas
- **Esquema completo:** `raffles`, `clients`, `tickets`, `payments`, `payment_allocations`,
  `audit_logs` + 5 enums.
- **Integridad estructural:** FK compuestas con `organization_id` (imposible cruzar organizaciones) y
  FK `(ticket_id, client_id)` (imposible pagar la boleta de otro cliente o una sin cliente).
- **Numeración:** texto `^[0-9]{1,4}$`, ceros conservados, combinación única por rifa — aplica entre
  vendedores y a boletas anuladas.
- **Dinero:** `bigint`; `paid_amount` materializado por trigger; `payment_status` columna generada;
  sobrepago imposible incluso concurrente.
- **Pagos:** cuadre exacto pago↔asignaciones (constraint trigger diferido); anulación sin borrado con
  recálculo automático.
- **RLS** habilitada y forzada en las 9 tablas; protección del Owner frente al Admin en ambas
  direcciones; **ningún `DELETE`**: ni política ni privilegio.
- **6 RPC transaccionales:** `assign_ticket`, `create_payment`, `void_payment`,
  `bulk_create_tickets`, `approve_tickets`, `cancel_ticket`.
- **5 vistas** con `security_invoker = true`; **auditoría** append-only sin ciclos.
- **Seed unificado** (`scripts/seed.ts`) con 2 organizaciones para probar aislamiento.

### Pruebas ejecutadas y resultados
**111/111 en verde** (`npm run test:db`), todas con sesiones reales por rol y clave pública.

| Archivo | Nº | Cubre |
|---|---|---|
| `tickets-numbering.test.ts` | 24 | Obligatorias 1–6 y 12: duplicados, dígitos, ceros iniciales, estados |
| `rls-isolation.test.ts` | 26 | Obligatorias 7–9: aislamiento entre vendedores y organizaciones |
| `payments.test.ts` | 19 | Obligatorias 10–11: sobrepago (incl. concurrente), atomicidad, anulación |
| `rpc.test.ts` | 22 | Carga masiva de 1.000 filas, aprobación, anulación, asignación |
| `catalog.test.ts` | 20 | Obligatoria 15 + invariantes: RLS, `search_path`, `security_invoker`, dinero |

Las 15 pruebas obligatorias del prompt están cubiertas. Detalle cronológico con errores y
correcciones en [`TEST_RESULTS.md`](TEST_RESULTS.md).

Además: `npm run verify` ✅ · `db reset` limpio ✅ · seed limpio ✅ · verificación estructural del
proyecto remoto 9/9 ✅ · login en navegador contra el remoto ✅.

### Migraciones
| Archivo | Contenido |
|---|---|
| `0001_core_identity.sql` | (Fase 1) organizations, profiles, memberships, funciones de seguridad |
| `0002_business_schema.sql` | 6 tablas de negocio, enums, todas las restricciones |
| `0003_indexes.sql` | 23 índices (incluye `pg_trgm` para búsqueda de clientes) |
| `0004_triggers.sql` | Códigos, protección de precio/cliente, máquina de estados, recálculo de saldos, cuadre diferido |
| `0005_rls_policies.sql` | RLS de las 9 tablas + protección del Owner |
| `0006_audit.sql` | Bitácora append-only con diff de campos |
| `0007_functions_rpc.sql` | Las 6 RPC transaccionales |
| `0008_views.sql` | 5 vistas con `security_invoker` |
| `0009_grants.sql` | Privilegios explícitos por rol |
| `0010_harden_grants.sql` | Revoca `DELETE`/`TRUNCATE`; iguala local y remoto |

Todas aplicadas en **local y en el proyecto Supabase real**. Cada archivo incluye su nota de
reversión.

### Variables de entorno
Las de la Fase 1 **más** `SUPABASE_DB_URL` (solo para `supabase db push` al remoto; debe ser la
cadena del **session pooler**, no la conexión directa — I-005).

### Problemas reales que permanecen
| ID | Problema | Impacto |
|---|---|---|
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten | Bajo. Riesgo de editar el equivocado; pendiente de que el usuario autorice borrar el `.txt` |
| I-005 | La conexión directa a Postgres no resuelve por DNS aquí | Ninguno con la solución alterna: usar el session pooler |
| I-007 | `createUser` no deja la contraseña usable de inmediato | **Afecta a la Fase 3**: al invitar usuarios hay que llamar `updateUserById` después |
| I-009 | No se pudo automatizar un clic en viewport móvil con la herramienta de este entorno | Bajo. Falta validar responsive en dispositivo real o con Playwright (Fase 7) |
| DT-11 | Playwright no instalado | Se instalará cuando existan specs E2E (Fase 3 en adelante) |
| DT-12 | 3 vulnerabilidades altas de `npm audit` | Están **dentro** de dependencias internas de Next.js (`postcss`, `sharp`); el único «fix» degradaría Next a 2019. Reevaluar al habilitar `next/image` con imágenes remotas |

Ninguno bloquea la Fase 3.

### Decisiones
D-037 a D-043. Destacadas: `GRANT` explícitos porque los de Supabase difieren entre entornos
(D-037/038); agregaciones monetarias casteadas a `bigint` (D-040); seed unificado que usa las RPC
reales (D-042); las pruebas de RLS nunca usan `service_role` (D-043).

---

## Comandos

```bash
npx supabase start     # instancia local (Docker)
npm run db:reset       # reaplica las 10 migraciones desde cero (local)
npm run seed:local     # datos de desarrollo en local
npm run seed           # datos de desarrollo en el proyecto de .env.local
npm run test:db        # 111 pruebas de base de datos
npm run verify         # typecheck + lint + unitarias + build
npm run dev            # servidor de desarrollo
```

Aplicar migraciones al proyecto real:

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
```

---

## Historial

| Fecha | Fase | Cambio |
|---|---|---|
| 2026-08-02 | 0 | Documentación completa, repositorio inicializado. |
| 2026-08-03 | 1 | Proyecto base, autenticación, migración de identidad, seed, pruebas en navegador. |
| 2026-08-03 | 2 | Esquema de negocio, RLS, RPC, auditoría, seed y 111 pruebas de BD. Aplicado a local y remoto. |
| 2026-08-03 | — | Documentación reestructurada para continuidad entre sesiones: se añaden `HANDOFF.md` y `TEST_RESULTS.md`, y `CLAUDE.md` §34. |
