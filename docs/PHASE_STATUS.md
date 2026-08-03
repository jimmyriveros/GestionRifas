# ESTADO DE LAS FASES

Documento de control. **Antes de iniciar cualquier fase debe leerse este archivo.**
Ninguna fase comienza sin autorización explícita del usuario (`CLAUDE.md` §1).

- **Actualizado:** 2026-08-03
- **Fase actual:** 1 — completada
- **Siguiente fase autorizable:** 2 — Base de datos, restricciones y RLS (**no autorizada todavía**)

---

## Tablero

| Fase | Nombre | Estado | Fecha | Commit |
|------|--------|--------|-------|--------|
| 0 | Arquitectura y planificación | ✅ Completada | 2026-08-02 | `b4b991c`, etiqueta `fase-0` |
| 1 | Proyecto base y autenticación | ✅ Completada | 2026-08-03 | rama `main`, etiqueta `fase-1` |
| 2 | Base de datos, restricciones y RLS | ⬜ No iniciada | — | — |
| 3 | Portal Owner y Admin | ⬜ No iniciada | — | — |
| 4 | Portal Seller y clientes | ⬜ No iniciada | — | — |
| 5 | Pagos, abonos y saldos | ⬜ No iniciada | — | — |
| 6 | Dashboards, reportes y UI/UX | ⬜ No iniciada | — | — |
| 7 | Pruebas, seguridad y endurecimiento | ⬜ No iniciada | — | — |
| 8 | Despliegue y documentación operativa | ⬜ No iniciada | — | — |
| 9 | Auditoría final independiente | ⬜ No iniciada | — | — |

Leyenda: ✅ completada · 🟨 en curso · ⬜ no iniciada · ⛔ bloqueada

---

## Fase 0 — Arquitectura y planificación

**Estado:** completada el 2026-08-02. Ver detalle en el historial de commits (`git log`) y en
`docs/DECISIONS.md` D-001 a D-026.

---

## Fase 1 — Proyecto base y autenticación

**Estado:** completada el 2026-08-03.

### Entregado
- [x] Proyecto Next.js 16.2.12 (App Router) + TypeScript 5.9.3 estricto + Tailwind CSS 4 + shadcn/ui
- [x] ESLint (flat config) + Prettier configurados y en verde
- [x] Clientes de Supabase: browser, server, proxy (`src/proxy.ts`, D-027), admin (`server-only`)
- [x] `.env.example` actualizado (D-028) y `scripts/check-env.ts` (corre en `prebuild`)
- [x] Login, logout, recuperación de contraseña, cambio de contraseña — probados en vivo
- [x] Redirección por rol (Owner/Admin → `/owner/dashboard`, Seller → `/seller/dashboard`)
- [x] Bloqueo de usuarios inactivos, incluso con sesión previa (BR-A04) — probado en vivo
- [x] Layouts responsive de los dos portales (sidebar en escritorio, drawer en móvil)
- [x] Componentes base: AppShell, UserMenu, NavLinks/MobileNav, PageSkeleton, ErrorState, `/denied`,
      `error.tsx`, `not-found.tsx`
- [x] Dashboards placeholder funcionales (datos reales de sesión, métricas marcadas "disponible en
      fase N")
- [x] Migración `0001_core_identity.sql`: `organizations`, `profiles`, `memberships`, enum
      `app_role`, funciones de seguridad, RLS (solo lectura + perfil propio, D-036), triggers
- [x] Migración aplicada y verificada estructuralmente contra un proyecto Supabase real (RLS, FKs,
      índice de un solo Owner, funciones con `search_path` fijo)
- [x] `scripts/seed-users.ts`: Owner, Admin, 2 Sellers + organización demo, idempotente, ejecutado
      contra la base real
- [x] Pruebas unitarias (money, dates, errors) — 14/14 en verde
- [x] `npm run verify` (typecheck + lint + test + build) en verde
- [x] Pruebas manuales en navegador: login válido (3 roles), login inválido, bloqueo de rutas por
      rol, bloqueo de usuario inactivo, logout, persistencia de sesión, recuperación de contraseña

### Documentación actualizada
`docs/ARCHITECTURE.md` (D-027, D-028, D-029 a D-031), `docs/DECISIONS.md` (D-027 a D-036),
`docs/KNOWN_ISSUES.md` (I-001 a I-009, DT-07 a DT-12), `.env.example`, `README.md`, `docs/TESTING.md`.

### No entregado a propósito
Gestión completa de rifas, vendedores, boletas, clientes y pagos; esquema de negocio completo
(`raffles`, `clients`, `tickets`, `payments`, `payment_allocations`, `audit_logs`); reportes.
Corresponden a fases posteriores.

### Desviaciones de diseño respecto a la Fase 0 (documentadas)
- `middleware.ts` → `src/proxy.ts` (Next.js 16 renombró la convención) — D-027.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — D-028.
- Varias versiones de paquetes "latest" resultaron incompatibles entre sí y se fijaron a versiones
  anteriores compatibles con Node 20 — D-029, D-030, D-031 (mismo patrón que D-002 en la Fase 0).
- `typedRoutes` de Next.js no se activó — D-032.
- `database.types.ts` sigue escrito a mano (Docker no disponible para `supabase gen types`) — D-034.

---

## Requisitos para iniciar la Fase 2

| # | Requisito | Estado |
|---|-----------|--------|
| 1 | Fase 1 completada | ✅ |
| 2 | Autorización explícita del usuario | ⬜ Pendiente |
| 3 | Proyecto Supabase con credenciales | ✅ (proporcionado en la Fase 1) |
| 4 | Conexión utilizable para migraciones | ✅ Session pooler (ver `docs/KNOWN_ISSUES.md` I-005) |
| 5 | Docker Desktop (para Supabase local y `supabase gen types`) | ⬜ **No instalado** — ver I-002, I-006 |
| 6 | Esquema de identidad (`organizations`, `profiles`, `memberships`) | ✅ Aplicado y verificado |

El punto 5 no bloquea necesariamente la Fase 2 si se continúa aplicando migraciones contra el
proyecto remoto por el mismo mecanismo (Session pooler + `supabase db push --db-url`), pero sí
bloquea `supabase gen types` y las pruebas de Supabase local que `docs/TESTING.md` §2 da por
sentadas. Conviene instalar Docker Desktop antes de la Fase 2.

---

## Historial de cambios

| Fecha | Fase | Cambio |
|-------|------|--------|
| 2026-08-02 | 0 | Fase 0 ejecutada y completada. Estructura documental creada, repositorio Git inicializado. |
| 2026-08-03 | 1 | Fase 1 ejecutada y completada. Proyecto base, autenticación, migración de identidad aplicada a Supabase real, seed ejecutado, pruebas manuales en navegador exitosas. |
