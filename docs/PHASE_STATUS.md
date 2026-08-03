# ESTADO DE LAS FASES

Documento de control. **Antes de iniciar cualquier fase debe leerse este archivo.**
Ninguna fase comienza sin autorización explícita del usuario (`CLAUDE.md` §1).

- **Actualizado:** 2026-08-03
- **Fase actual:** 2 — completada
- **Siguiente fase autorizable:** 3 — Portal Owner y Admin (**no autorizada todavía**)

---

## Tablero

| Fase | Nombre | Estado | Fecha | Commit |
|------|--------|--------|-------|--------|
| 0 | Arquitectura y planificación | ✅ Completada | 2026-08-02 | `b4b991c`, etiqueta `fase-0` |
| 1 | Proyecto base y autenticación | ✅ Completada | 2026-08-03 | `34b3cb1`, etiqueta `fase-1` |
| 2 | Base de datos, restricciones y RLS | ✅ Completada | 2026-08-03 | rama `main`, etiqueta `fase-2` |
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

**Estado:** completada el 2026-08-02. Decisiones D-001 a D-026.

## Fase 1 — Proyecto base y autenticación

**Estado:** completada el 2026-08-03. Decisiones D-027 a D-036.
Next.js 16 + TypeScript estricto + Tailwind 4 + shadcn/ui, autenticación completa con redirección por
rol y bloqueo de usuarios inactivos, migración `0001_core_identity.sql`.

---

## Fase 2 — Base de datos, restricciones y RLS

**Estado:** completada el 2026-08-03.

### Entregado

**Esquema completo (9 migraciones nuevas, `0002` a `0010`)**
- [x] `raffles`, `clients`, `tickets`, `payments`, `payment_allocations`, `audit_logs`
- [x] 5 tipos enumerados, UUID, timestamps, archivado y anulación
- [x] Claves foráneas **compuestas** con `organization_id`: es estructuralmente imposible
      relacionar entidades de organizaciones distintas
- [x] FK compuesta `(ticket_id, client_id)`: imposible pagar la boleta de otro cliente o una boleta
      sin cliente, sin depender de ninguna validación de aplicación
- [x] 23 índices, incluidos `pg_trgm` para búsqueda parcial de clientes

**Reglas de boletas**
- [x] `daily_number`/`weekly_number` como texto, `^[0-9]{1,4}$`, ceros iniciales conservados
- [x] Combinación única por organización+rifa, aplicando **entre vendedores** y a **anuladas**
- [x] Máquina de estados de inventario y coherencia estado↔datos por `CHECK`
- [x] `sale_price` como entero, inmutable con pagos activos

**Reglas de pagos**
- [x] Montos enteros positivos; cuadre exacto pago↔asignaciones (constraint trigger diferido)
- [x] Sobrepago imposible: validación en RPC con bloqueo de fila **y** `CHECK` sobre `paid_amount`
- [x] `paid_amount` materializado por trigger; `payment_status` como columna generada
- [x] Anulación sin borrado, con recálculo automático de saldos

**Seguridad**
- [x] RLS habilitada y **forzada** en las 9 tablas, con políticas de SELECT/INSERT/UPDATE
- [x] Sin `DELETE` en ninguna tabla: ni política ni privilegio (dos capas independientes)
- [x] Protección del Owner frente a un Admin en ambas direcciones (`USING` + `WITH CHECK`)
- [x] 20 funciones `SECURITY DEFINER` con `search_path` fijo y validación interna de permisos
- [x] 5 vistas con `security_invoker = true`
- [x] Privilegios `GRANT` explícitos, idénticos en local y en el proyecto alojado

**Funciones transaccionales**
- [x] `create_payment`, `void_payment`, `assign_ticket`, `bulk_create_tickets`,
      `approve_tickets`, `cancel_ticket`

**Auditoría**
- [x] `audit_logs` de solo anexado, sin ciclos (la tabla no tiene triggers propios)
- [x] Trigger genérico con diff de campos + acciones semánticas desde las RPC

**Seed y pruebas**
- [x] `scripts/seed.ts`: 2 organizaciones, 6 usuarios, 2 rifas, 6 clientes, 33 boletas en todos los
      estados y 4 pagos (parcial, completo, repartido y anulado)
- [x] **111 pruebas de base de datos** en `tests/db/`, todas con sesiones reales por rol
- [x] Migraciones aplicadas y verificadas en local **y** en el proyecto Supabase real

### Cobertura de las 15 pruebas obligatorias del prompt

| # | Prueba | Estado |
|---|--------|--------|
| 1 | Duplicado en la misma rifa | ✅ |
| 2 | Duplicado entre vendedores | ✅ |
| 3 | Misma combinación en otra rifa | ✅ |
| 4 | Más de cuatro dígitos | ✅ |
| 5 | Caracteres no numéricos | ✅ |
| 6 | Ceros iniciales | ✅ |
| 7 | Aislamiento entre organizaciones | ✅ |
| 8 | Seller consultando otro Seller | ✅ |
| 9 | Seller modificando otro Seller | ✅ |
| 10 | Sobrepago (incluido concurrente) | ✅ |
| 11 | Pago para boleta de otro cliente | ✅ |
| 12 | Restricciones de estados | ✅ |
| 13 | Migración limpia desde cero | ✅ |
| 14 | Seed limpio | ✅ |
| 15 | Estrategia de reversión documentada | ✅ |

### No entregado a propósito
Portal Owner completo, portal Seller completo, interfaz de pagos. Corresponden a las fases 3, 4 y 5.

### Desviaciones respecto al diseño de la Fase 0 (documentadas)
- Seed unificado en `scripts/seed.ts` en lugar de `supabase/seed.sql` — D-042.
- Dos migraciones nuevas no previstas (`0009`, `0010`) para privilegios explícitos — D-037, D-038.
- `short_code`/`internal_code` con `DEFAULT ''` + `CHECK` — D-039.
- Agregaciones monetarias de las vistas casteadas a `bigint` — D-040.

---

## Requisitos para iniciar la Fase 3

| # | Requisito | Estado |
|---|-----------|--------|
| 1 | Fase 2 completada | ✅ |
| 2 | Autorización explícita del usuario | ⬜ Pendiente |
| 3 | Esquema completo aplicado (local y remoto) | ✅ |
| 4 | Tipos TypeScript generados desde el esquema real | ✅ |
| 5 | Datos de desarrollo disponibles | ✅ (`npm run seed` / `npm run seed:local`) |
| 6 | Docker para Supabase local y pruebas de BD | ✅ |

No hay bloqueantes.

---

## Comandos útiles

```bash
npx supabase start          # levanta la instancia local (Docker)
npm run db:reset            # aplica todas las migraciones desde cero en local
npm run seed:local          # datos de desarrollo en local
npm run seed                # datos de desarrollo en el proyecto de .env.local
npm run test:db             # 111 pruebas de base de datos (requiere local + seed)
npm run verify              # typecheck + lint + pruebas unitarias + build
```

---

## Historial de cambios

| Fecha | Fase | Cambio |
|-------|------|--------|
| 2026-08-02 | 0 | Fase 0 ejecutada y completada. Estructura documental creada, repositorio Git inicializado. |
| 2026-08-03 | 1 | Fase 1 ejecutada y completada. Proyecto base, autenticación, migración de identidad aplicada a Supabase real, seed ejecutado, pruebas manuales en navegador exitosas. |
| 2026-08-03 | 2 | Fase 2 ejecutada y completada. Esquema de negocio completo, RLS, funciones transaccionales, auditoría, seed y 111 pruebas de base de datos. Aplicado a local y al proyecto real. |
