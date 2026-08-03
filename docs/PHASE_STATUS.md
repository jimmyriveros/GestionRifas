# ESTADO DE LAS FASES

Documento de control. **Antes de iniciar cualquier fase debe leerse este archivo.**
Ninguna fase comienza sin autorización explícita del usuario (`CLAUDE.md` §1).

- **Actualizado:** 2026-08-02
- **Fase actual:** 0 — completada
- **Siguiente fase autorizable:** 1 — Proyecto base y autenticación (**no autorizada todavía**)

---

## Tablero

| Fase | Nombre | Estado | Fecha | Commit |
|------|--------|--------|-------|--------|
| 0 | Arquitectura y planificación | ✅ Completada | 2026-08-02 | rama `main`, etiqueta `fase-0` |
| 1 | Proyecto base y autenticación | ⬜ No iniciada | — | — |
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

**Estado:** completada el 2026-08-02.

### Entregado
- [x] Inspección del repositorio (carpeta sin Git, sin código, con `CLAUDE.md.txt` y `PROMPT FASE 0.txt`)
- [x] `docs/MASTER_SPEC.md`
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/DATA_MODEL.md`
- [x] `docs/BUSINESS_RULES.md`
- [x] `docs/SECURITY.md`
- [x] `docs/IMPLEMENTATION_PLAN.md`
- [x] `docs/DECISIONS.md`
- [x] `docs/PHASE_STATUS.md`
- [x] `docs/KNOWN_ISSUES.md`
- [x] `docs/TESTING.md`
- [x] `CLAUDE.md` canónico, `README.md`, `.env.example`, `.gitignore`
- [x] Modelo de datos completo (9 tablas, relaciones, cardinalidades y pertenencia)
- [x] Estrategia multiorganización
- [x] Matriz de permisos Owner / Admin / Seller
- [x] Diseño de políticas RLS (sin implementar)
- [x] Diseño de funciones transaccionales
- [x] Estrategia de pagos, asignaciones y estados calculados
- [x] Arquitectura de carpetas, rutas de Next.js y componentes
- [x] Límites por fase y criterios de aceptación verificables
- [x] Riesgos técnicos y de seguridad, y casos extremos
- [x] Estrategias de pruebas, seed y despliegue
- [x] Revisión lógica obligatoria (15 puntos) resuelta

### No entregado a propósito
Código de aplicación, dependencias instaladas, migraciones, pantallas. Corresponden a fases
posteriores.

---

## Requisitos para iniciar la Fase 1

| # | Requisito | Estado |
|---|-----------|--------|
| 1 | Fase 0 completada | ✅ |
| 2 | Autorización explícita del usuario | ⬜ Pendiente |
| 3 | Node.js ≥ 20.9 | ✅ (20.20.2) |
| 4 | npm disponible | ✅ (10.8.2) |
| 5 | Git disponible | ✅ (2.49.0) |
| 6 | Supabase CLI instalada | ⬜ **No instalada** — se instalará como dependencia de desarrollo |
| 7 | Docker Desktop (para Supabase local) | ⬜ Sin verificar — necesario en la Fase 2 |
| 8 | Proyecto Supabase (local o remoto) y sus claves | ⬜ Pendiente del usuario |

Los puntos 6 y 7 no bloquean la Fase 1 salvo en su tarea de configuración de Supabase; el punto 8 sí
es necesario para probar el login de extremo a extremo.

---

## Historial de cambios

| Fecha | Fase | Cambio |
|-------|------|--------|
| 2026-08-02 | 0 | Fase 0 ejecutada y completada. Estructura documental creada, repositorio Git inicializado. |
