# PLAN DE IMPLEMENTACIÓN

- **Versión:** 1.0 · **Fase:** 0 · **Actualizado:** 2026-08-02
- Cada fase se ejecuta **solo** con autorización explícita del usuario (`CLAUDE.md` §1).
- Formato por fase: Objetivo · Dependencias · Entregables · Archivos esperados · Pruebas ·
  Criterio de finalización · Fuera de alcance explícito.

---

## Vista general

| Fase | Nombre | Estado | Depende de |
|------|--------|--------|-----------|
| 0 | Arquitectura y planificación | **Completada** | — |
| 1 | Proyecto base y autenticación | Pendiente | 0 |
| 2 | Base de datos, restricciones y RLS | Pendiente | 1 |
| 3 | Portal Owner y Admin | Pendiente | 2 |
| 4 | Portal Seller y clientes | Pendiente | 3 |
| 5 | Pagos, abonos y saldos | Pendiente | 4 |
| 6 | Dashboards, reportes y UI/UX | Pendiente | 5 |
| 7 | Pruebas, seguridad y endurecimiento | Pendiente | 6 |
| 8 | Despliegue y documentación operativa | Pendiente | 7 |
| 9 | Auditoría final independiente | Pendiente | 8 |

---

## FASE 0 — Arquitectura y planificación

**Objetivo.** Transformar la especificación maestra en un plan técnico completo, consistente y
ejecutable, sin construir funcionalidad.

**Dependencias.** Ninguna.

**Entregables.**
1. Estructura documental completa en `docs/`.
2. Modelo de datos completo con relaciones, cardinalidades y pertenencia.
3. Estrategia multiorganización.
4. Matriz de permisos de los tres roles.
5. Diseño de políticas RLS (sin implementar).
6. Diseño de funciones transaccionales.
7. Estrategia de pagos, asignaciones y estados calculados.
8. Arquitectura de carpetas, rutas y componentes.
9. Límites, riesgos, casos extremos y criterios de aceptación por fase.
10. Estrategias de pruebas, seed y despliegue.

**Archivos esperados.**
`CLAUDE.md` · `README.md` · `.env.example` · `.gitignore` ·
`docs/MASTER_SPEC.md` · `docs/ARCHITECTURE.md` · `docs/DATA_MODEL.md` · `docs/BUSINESS_RULES.md` ·
`docs/SECURITY.md` · `docs/IMPLEMENTATION_PLAN.md` · `docs/DECISIONS.md` · `docs/PHASE_STATUS.md` ·
`docs/KNOWN_ISSUES.md` · `docs/TESTING.md`

**Pruebas.** Revisión lógica documental (no hay código ejecutable): checklist de 15 puntos de
`docs/MASTER_SPEC.md` §11, coherencia entre documentos y verificación de compatibilidad de versiones
del stack contra el registro de npm.

**Criterio de finalización.**
- Los 10 documentos existen y son mutuamente consistentes.
- Toda regla de `CLAUDE.md` §13–§20 tiene una regla `BR-*` correspondiente y un mecanismo de base de
  datos asignado.
- La revisión lógica obligatoria está resuelta punto por punto.
- No hay código de aplicación ni migraciones.

**Fuera de alcance explícito.** Cualquier página, formulario, autenticación, migración definitiva,
instalación de dependencias o inicio de la Fase 1.

---

## FASE 1 — Proyecto base y autenticación

**Objetivo.** Crear la base técnica, la autenticación, los layouts y la navegación por rol.

**Dependencias.** Fase 0 completada.

**Entregables.**
1. Proyecto Next.js 16 con App Router y TypeScript estricto.
2. Tailwind CSS 4 y shadcn/ui configurados.
3. ESLint + Prettier con scripts de verificación.
4. Clientes de Supabase (browser, server, middleware, admin con `server-only`).
5. `.env.example` y `scripts/check-env.ts`.
6. Middleware de sesión y protección de rutas.
7. Login, logout, recuperación y cambio de contraseña.
8. Redirección por rol y bloqueo de usuarios inactivos.
9. Layouts de los dos portales con navegación responsive (sidebar/drawer).
10. Dashboards placeholder funcionales.
11. Componentes base: encabezado, navegación, cierre de sesión, carga, error, acceso denegado.
12. Migración mínima: `organizations`, `profiles`, `memberships` (+ enum `app_role`), con RLS básica.
13. Estrategia documentada de usuarios de desarrollo (Owner, Admin, Seller).

**Archivos esperados.**
`package.json` · `next.config.ts` · `tsconfig.json` · `eslint.config.mjs` · `.prettierrc` ·
`src/app/layout.tsx` · `src/app/globals.css` · `src/app/(public)/login/page.tsx` ·
`src/app/(public)/forgot-password/page.tsx` · `src/app/(public)/reset-password/page.tsx` ·
`src/app/auth/callback/route.ts` · `src/app/denied/page.tsx` ·
`src/app/(protected)/layout.tsx` · `src/app/(protected)/owner/layout.tsx` ·
`src/app/(protected)/owner/dashboard/page.tsx` · `src/app/(protected)/seller/layout.tsx` ·
`src/app/(protected)/seller/dashboard/page.tsx` · `src/app/(protected)/account/password/page.tsx` ·
`src/middleware.ts` · `src/lib/supabase/{client,server,middleware,admin}.ts` ·
`src/lib/auth/{guards.ts,session.ts}` · `src/lib/{money.ts,dates.ts,constants.ts,errors.ts}` ·
`src/components/layout/*` · `src/components/feedback/*` · `src/features/auth/*` ·
`supabase/config.toml` · `supabase/migrations/0001_core_identity.sql` · `scripts/seed-users.ts`

**Pruebas.**
1. Login válido · 2. Login inválido · 3. Redirección Owner · 4. Redirección Admin ·
5. Redirección Seller · 6. Seller bloqueado en rutas `/owner/*` · 7. Usuario no autenticado bloqueado
en `/seller/*` · 8. Usuario inactivo bloqueado · 9. Logout · 10. Persistencia y refresco de sesión ·
11. `npm run build` · 12. `npm run typecheck` · 13. `npm run lint`.

**Criterio de finalización.**
- Los tres roles inician sesión y llegan a su portal correspondiente.
- Un usuario desactivado no puede operar ni con una sesión previa.
- Build, typecheck y lint pasan sin errores ni advertencias silenciadas.
- Ninguna clave de servicio es accesible desde el navegador.

**Fuera de alcance explícito.** Gestión completa de rifas, vendedores, boletas, clientes y pagos;
esquema de boletas y pagos; reportes; Fase 2.

---

## FASE 2 — Base de datos, restricciones y RLS

**Objetivo.** Implementar el modelo de datos completo, la integridad, las políticas RLS, las
funciones de seguridad y los seeds de desarrollo.

**Dependencias.** Fase 1 completada.

**Entregables.**
1. Migraciones versionadas de `raffles`, `clients`, `tickets`, `payments`,
   `payment_allocations`, `audit_logs` y enums asociados.
2. UUID, claves foráneas (incluidas las compuestas con `organization_id`), `NOT NULL`, `CHECK`,
   restricciones únicas, índices, timestamps y archivado.
3. Reglas de boletas: numeración en texto, 1–4 dígitos, ceros conservados, combinación única por
   rifa, bloqueo entre vendedores, no reutilización de anuladas, estados válidos, precio entero,
   `sale_price` protegido.
4. Reglas de pagos: montos positivos, relación pago↔asignaciones, imposibilidad de pagar boletas de
   otro cliente o vendedor, bloqueo de sobrepago, historial de anulaciones.
5. Funciones transaccionales: `create_payment`, `void_payment`, `assign_ticket`,
   `bulk_create_tickets`, `approve_tickets`, `cancel_ticket`.
6. Funciones auxiliares de seguridad y políticas RLS de las 9 tablas.
7. Vistas con `security_invoker = true`.
8. Infraestructura de auditoría (triggers, sin ciclos).
9. Seed de desarrollo completo.
10. Tipos TypeScript generados.

**Archivos esperados.**
`supabase/migrations/0002_business_schema.sql` · `0003_constraints_indexes.sql` ·
`0004_functions_rpc.sql` · `0005_rls_policies.sql` · `0006_audit.sql` · `0007_views.sql` ·
`supabase/seed.sql` · `scripts/seed-users.ts` (ampliado) · `src/types/database.types.ts` ·
`tests/db/*.test.ts`

**Pruebas (contra base de datos real).**
1. Duplicado en la misma rifa → rechazado · 2. Duplicado entre vendedores → rechazado ·
3. Misma combinación en otra rifa → aceptada · 4. Más de 4 dígitos → rechazado ·
5. Caracteres no numéricos → rechazado · 6. Ceros iniciales conservados (`'007' ≠ '7'`) ·
7. Aislamiento entre organizaciones · 8. Seller consultando datos de otro Seller → vacío ·
9. Seller modificando datos de otro Seller → rechazado · 10. Sobrepago → rechazado ·
11. Pago a boleta de otro cliente → rechazado · 12. Restricciones de estados ·
13. Migración limpia desde cero (`supabase db reset`) · 14. Seed limpio · 15. Estrategia de
reversión documentada y probada.

**Criterio de finalización.**
- `supabase db reset` reconstruye el esquema y el seed sin errores desde cero.
- Las 15 pruebas pasan.
- Ninguna tabla de negocio queda sin RLS (`ENABLE` + `FORCE`).
- Ninguna función `SECURITY DEFINER` sin `search_path` fijo; ninguna vista sin `security_invoker`.

**Fuera de alcance explícito.** Portal Owner completo, portal Seller completo, interfaz de pagos,
Fase 3.

---

## FASE 3 — Portal Owner y Admin

**Objetivo.** Construir el portal funcional de Owner y Admin conectado a la base de datos real.

**Dependencias.** Fase 2 completada.

**Entregables.**
1. Dashboard administrativo inicial con las métricas disponibles hasta esta fase.
2. Rifas: listado, creación, edición, cambio de estado, precio, fechas, permiso de creación por
   vendedores, validaciones y restricciones de rifas cerradas.
3. Administradores: listado, invitación/creación, edición, activación, desactivación, protección del
   Owner y restricciones de rol.
4. Vendedores: listado, búsqueda, creación, invitación, edición, activación, desactivación, vista
   detallada, resumen básico y acceso a sus boletas y clientes.
5. Boletas: tabla global con filtros y búsquedas (número diario, semanal, código, rifa, vendedor,
   cliente, estado), detalle, creación individual, edición permitida, anulación, asignación de
   vendedor y aprobación de boletas creadas por vendedores.
6. Creación masiva de 1 a 1.000 boletas con virtualización, validación por fila, detección de
   duplicados locales y en base de datos, guardado por lotes, manejo de errores parciales e
   indicador de progreso.

**Archivos esperados.**
`src/app/(protected)/owner/{dashboard,raffles,users,sellers,tickets,clients}/**` ·
`src/features/{raffles,users,sellers,tickets}/{schemas,queries,actions,mappers}.ts` ·
`src/features/tickets/bulk/*` · `src/components/data/DataTable.tsx` ·
`src/components/form/TicketNumberInput.tsx` · `src/components/form/MoneyInput.tsx` ·
`tests/unit/*` · `tests/e2e/owner-*.spec.ts`

**Pruebas.**
1. Crear rifa · 2. Editar rifa · 3. Crear vendedor · 4. Desactivar vendedor · 5. Admin intentando
modificar al Owner → bloqueado · 6. Crear boleta válida · 7. Rechazar más de 4 dígitos ·
8. Rechazar combinación repetida · 9. Rechazar duplicado de otro vendedor · 10. Crear lote ·
11. Guardar borrador · 12. Aprobar boleta · 13. Anular boleta · 14. Protección de acciones por rol ·
15. Responsive básico · 16. Build · 17. Lint · 18. Typecheck.

**Criterio de finalización.**
- Un Owner completa el ciclo: crear rifa → crear vendedor → generar 1.000 boletas → aprobar.
- La carga masiva de 1.000 filas se maneja sin congelar el navegador.
- Todas las validaciones muestran errores por fila y por campo, en español.
- Un Admin no puede realizar ninguna acción exclusiva del Owner.

**Fuera de alcance explícito.** Experiencia completa del Seller, registro completo de pagos,
reportes avanzados, Fase 4.

---

## FASE 4 — Portal Seller y clientes

**Objetivo.** Construir el portal del vendedor, la gestión de clientes y la asignación de boletas.

**Dependencias.** Fase 3 completada.

**Entregables.**
1. Dashboard del vendedor con métricas disponibles hasta esta fase (boletas totales, disponibles,
   asignadas, pendientes de aprobación, clientes y actividad reciente).
2. Boletas propias: tabla, búsquedas (diario, semanal, código), filtros (cliente, estado), detalle,
   edición cuando corresponde, bloqueo de edición cuando no, historial básico.
3. Creación de boletas por el vendedor cuando la rifa lo permite, con estado `pending_approval` y
   explicación; ocultación o deshabilitación clara cuando no está permitido.
4. Clientes: listado, búsqueda, filtros, creación, edición, archivado y vista detallada.
5. Perfil del cliente con boletas, fechas, números, precio, estado de inventario, estado de pago
   disponible hasta esta fase y total comprado.
6. Asignación de boletas: selección o creación de cliente en el flujo, `sale_date`, copia de
   `sale_price`, cambio a `assigned`, con todos los bloqueos correspondientes.

**Archivos esperados.**
`src/app/(protected)/seller/{dashboard,tickets,clients}/**` ·
`src/features/clients/{schemas,queries,actions}.ts` · `src/features/tickets/assign/*` ·
`tests/e2e/seller-*.spec.ts` · `tests/db/seller-isolation.test.ts`

**Pruebas.**
1. Crear cliente · 2. Editar cliente · 3. Archivar cliente · 4. Buscar cliente · 5. Asignar boleta ·
6. Crear cliente durante la asignación · 7. Crear boleta cuando está permitido · 8. Bloquear creación
cuando no está permitido · 9. Estado pendiente de aprobación · 10. Bloquear boleta incompleta ·
11. Copia de `sale_price` · 12. Aislamiento entre vendedores · 13. Protección de rutas y acciones ·
14. Responsive móvil · 15. Build · 16. Typecheck · 17. Lint.

**Criterio de finalización.**
- Un vendedor completa el ciclo desde un teléfono: buscar boleta → crear cliente → asignar.
- Un vendedor no puede ver ni tocar datos de otro por UI, URL, ID manipulado o request directo.
- El precio se copia correctamente y no cambia al modificar el precio de la rifa.

**Fuera de alcance explícito.** Pagos completos, anulación de pagos, reportes financieros completos,
Fase 5.

---

## FASE 5 — Pagos, abonos y saldos

**Objetivo.** Implementar el registro de pagos y abonos, el cálculo de saldos, los estados de pago y
la anulación administrativa.

**Dependencias.** Fase 4 completada.

**Entregables.**
1. Registro de pagos por el vendedor: monto, fecha, método, notas y reparto entre boletas del mismo
   cliente, sobre la RPC atómica `create_payment`.
2. Validación de cuadre exacto, bloqueo de sobrepago, de montos ≤ 0 y de boletas sin cliente.
3. Cálculo y presentación de `paid_amount`, `pending_amount` y estado de pago por boleta y por
   cliente.
4. Historial de abonos con todos los campos exigidos (BR-F13).
5. Anulación de pagos por Owner/Admin con motivo obligatorio, recálculo de saldos y auditoría.
6. Consulta global de pagos en el portal administrativo con filtros.
7. Bloqueo de cambio de cliente y de anulación de boletas con pagos activos.

**Archivos esperados.**
`src/app/(protected)/seller/payments/**` · `src/app/(protected)/owner/payments/**` ·
`src/features/payments/{schemas,queries,actions,components}` ·
`tests/db/payments-*.test.ts` · `tests/unit/payment-status.test.ts` · `tests/e2e/payments.spec.ts`

**Pruebas.**
1. Registrar abono parcial → estado Abonada · 2. Completar el pago → estado Pagada · 3. Bloqueo de
sobrepago · 4. Pago repartido entre varias boletas · 5. Suma distinta al total → rechazado ·
6. Atomicidad (fallo parcial no deja rastro) · 7. Pago concurrente sobre la misma boleta ·
8. Anulación de pago → recálculo de saldo y estado · 9. Vendedor intentando anular → bloqueado ·
10. Bloqueo de cambio de cliente con pagos · 11. Pago a boleta sin cliente → rechazado ·
12. Pago a boleta de otro cliente → rechazado · 13. Build, typecheck y lint.

**Criterio de finalización.**
- Los estados de pago se calculan siempre desde la base de datos; ninguna pantalla los deduce.
- No existe forma conocida de dejar un pago descuadrado o de sobrepagar una boleta.
- Toda anulación queda auditada y los saldos se recalculan de inmediato.

**Fuera de alcance explícito.** Reportes avanzados, exportación CSV, dashboards finales, Fase 6.

---

## FASE 6 — Dashboards, reportes y UI/UX

**Objetivo.** Completar los dashboards, los reportes con exportación y el pulido de la experiencia.

**Dependencias.** Fase 5 completada.

**Entregables.**
1. Dashboard administrativo completo: rifa activa, vendedores activos, totales de boletas por estado,
   totales por estado de pago, total vendido, total recaudado, saldo pendiente, pagos recientes y
   resumen por vendedor.
2. Dashboard del vendedor completo con sus propios equivalentes.
3. Reportes: ventas por vendedor, recaudo por vendedor, saldo pendiente por vendedor, boletas por
   estado, clientes con saldo pendiente, pagos por rango de fechas y boletas por rifa.
4. Filtros por rifa, vendedor, cliente, estado y fecha; exportación a CSV de las tablas principales.
5. Pulido de UX: estados vacíos, skeletons, toasts, confirmaciones, badges con texto, tablas
   responsivas, accesibilidad y navegación móvil.

**Archivos esperados.**
`src/app/(protected)/owner/{dashboard,reports}/**` · `src/app/(protected)/seller/dashboard/**` ·
`src/features/reports/*` · `src/lib/csv.ts` · `supabase/migrations/00XX_report_views.sql` ·
`tests/e2e/reports.spec.ts`

**Pruebas.**
1. Cada métrica del dashboard coincide con una consulta de control en SQL · 2. Los reportes del
Seller no exponen datos de otros vendedores · 3. Exportación CSV con formato correcto de moneda y
fechas · 4. Filtros combinados · 5. Rendimiento con volumen de prueba (≥5.000 boletas) ·
6. Responsive en móvil, tablet y escritorio · 7. Accesibilidad básica · 8. Build, typecheck y lint.

**Criterio de finalización.**
- Cada número mostrado es reproducible con una consulta SQL de control.
- Ningún reporte del portal Seller filtra datos ajenos.
- La aplicación es utilizable de principio a fin desde un teléfono.

**Fuera de alcance explícito.** Nuevas capacidades de negocio, funciones fuera del MVP, Fase 7.

---

## FASE 7 — Pruebas, seguridad y endurecimiento

**Objetivo.** Cerrar la cobertura de pruebas, ejecutar la revisión de seguridad y endurecer la
aplicación.

**Dependencias.** Fase 6 completada.

**Entregables.**
1. Cobertura completa de las 25 pruebas mínimas de `CLAUDE.md` §30.
2. Suite E2E de Playwright para los flujos críticos de los tres roles.
3. Pruebas de RLS con sesiones reales de cada rol.
4. Pruebas de concurrencia de pagos.
5. Limitación de intentos de inicio de sesión y de acciones sensibles.
6. Endurecimiento de cabeceras (CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`).
7. Revisión de errores: ningún mensaje expone estructura interna.
8. Revisión de rendimiento e índices con `EXPLAIN ANALYZE` sobre las consultas principales.
9. Revisión de dependencias (`npm audit`) y eliminación de código muerto.

**Archivos esperados.**
`tests/e2e/**` · `tests/db/**` · `tests/unit/**` · `next.config.ts` (cabeceras) ·
`docs/TESTING.md` (actualizado con resultados) · `docs/KNOWN_ISSUES.md` (actualizado)

**Pruebas.** La matriz completa de `docs/TESTING.md` §3, ejecutada de principio a fin.

**Criterio de finalización.**
- Las 25 pruebas mínimas pasan y están automatizadas.
- No hay vulnerabilidades conocidas de severidad alta o crítica.
- Build, typecheck, lint y la suite completa pasan en limpio.

**Fuera de alcance explícito.** Nuevas funcionalidades, Fase 8.

---

## FASE 8 — Despliegue y documentación operativa

**Objetivo.** Poner el sistema en producción y dejar documentada su operación.

**Dependencias.** Fase 7 completada.

**Entregables.**
1. Proyecto Supabase de producción con migraciones aplicadas.
2. Proyecto Vercel con variables de entorno configuradas y `SERVICE_ROLE` marcada como sensible.
3. Procedimiento de despliegue y de reversión.
4. Copias de seguridad y recuperación ante desastres.
5. Manual de operación: alta de la organización, alta del Owner, creación de usuarios, cierre de
   rifas, anulaciones.
6. Guía de resolución de problemas frecuentes.
7. `README.md` final con instalación, desarrollo local, pruebas y despliegue.

**Archivos esperados.**
`README.md` · `docs/DEPLOYMENT.md` · `docs/OPERATIONS.md` · `docs/RUNBOOK.md` ·
`.github/workflows/ci.yml` (si se habilita CI)

**Pruebas.**
1. Despliegue limpio en un entorno nuevo · 2. Migraciones aplicadas desde cero en producción ·
3. Prueba de humo de los tres roles en producción · 4. Prueba de restauración de copia de seguridad ·
5. Verificación de variables de entorno y de que ningún secreto llega al navegador.

**Criterio de finalización.**
- La aplicación funciona en producción para los tres roles.
- Un tercero puede desplegar el proyecto siguiendo solo la documentación.

**Fuera de alcance explícito.** Nuevas funcionalidades, Fase 9.

---

## FASE 9 — Auditoría final independiente

**Objetivo.** Revisar el sistema completo con mirada independiente y reportar hallazgos.

**Dependencias.** Fase 8 completada.

**Entregables.**
1. Auditoría de seguridad: RLS por tabla, funciones `SECURITY DEFINER`, vistas con
   `security_invoker`, manejo de secretos, protección de Server Actions.
2. Auditoría de integridad de datos: verificación de las 15 restricciones críticas.
3. Auditoría funcional contra `CLAUDE.md` §30 y `docs/BUSINESS_RULES.md`.
4. Auditoría de calidad: `any` sin justificar, duplicación, archivos excesivos, código muerto,
   consultas N+1.
5. Informe de hallazgos clasificados por severidad con recomendación por cada uno.
6. Actualización de `docs/KNOWN_ISSUES.md`.

**Archivos esperados.** `docs/AUDIT_REPORT.md` · `docs/KNOWN_ISSUES.md` (actualizado)

**Pruebas.** Reejecución completa de la matriz de pruebas + verificaciones de catálogo de PostgreSQL
(`pg_policies`, `pg_proc.proconfig`, `pg_class.reloptions`).

**Criterio de finalización.**
- Informe entregado con todos los hallazgos, sin ocultar errores.
- Los hallazgos críticos y altos están corregidos o explícitamente aceptados por el usuario.

**Fuera de alcance explícito.** Funciones fuera del MVP (`CLAUDE.md` §31).

---

## Dependencias transversales

| Elemento | Se diseña en | Se implementa en | Se prueba en | Se pule en |
|----------|--------------|------------------|--------------|------------|
| Modelo de datos | 0 | 2 | 2, 7 | — |
| RLS | 0 | 2 | 2, 4, 7, 9 | 7 |
| Funciones transaccionales | 0 | 2 | 2, 5, 7 | 5 |
| Autenticación | 0 | 1 | 1, 7 | 7 |
| Boletas | 0 | 2, 3 | 3, 4, 7 | 6 |
| Clientes | 0 | 2, 4 | 4, 7 | 6 |
| Pagos | 0 | 2, 5 | 5, 7 | 6 |
| Auditoría | 0 | 2 | 2, 7, 9 | — |
| Dashboards | 0 | 3, 4, 6 | 6 | 6 |
| Reportes | 0 | 6 | 6, 7 | 6 |
| Despliegue | 0 | 8 | 8 | 8 |
