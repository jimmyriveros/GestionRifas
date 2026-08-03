# PROBLEMAS CONOCIDOS Y RIESGOS

- **Versión:** 1.0 · **Actualizado:** 2026-08-02
- Este documento **no oculta errores**. Registra problemas reales, riesgos identificados y deuda
  técnica aceptada, con su plan de mitigación.

---

## 1. Problemas abiertos

| ID | Problema | Severidad | Estado | Plan |
|----|----------|-----------|--------|------|
| I-001 | La Supabase CLI no está instalada en la máquina de desarrollo | Media | Abierto | Se añadirá como dependencia de desarrollo en la Fase 1 (`npm i -D supabase`); no requiere instalación global |
| I-002 | No se ha verificado si Docker Desktop está disponible; Supabase local lo necesita | Media | Abierto | Verificar al inicio de la Fase 2. Alternativa: usar un proyecto Supabase remoto de desarrollo |
| I-003 | No existen credenciales de un proyecto Supabase | Alta para la Fase 1 | Abierto | El usuario debe crear el proyecto y entregar `URL`, `ANON_KEY` y `SERVICE_ROLE_KEY`, o autorizar el uso exclusivo de Supabase local |
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten con contenido idéntico | Baja | Abierto | `CLAUDE.md` es el canónico (D-003). Editar solo uno; conviene eliminar el `.txt` cuando el usuario lo confirme |

Ningún problema abierto bloquea el cierre de la Fase 0.

---

## 2. Riesgos técnicos

| ID | Riesgo | Prob. | Impacto | Mitigación | Fase de control |
|----|--------|:-----:|:-------:|------------|-----------------|
| R-01 | Recursión infinita en políticas RLS al consultar `memberships` desde políticas de `memberships` | Alta | Alto | Funciones auxiliares `SECURITY DEFINER STABLE` que omiten RLS (SECURITY §4.1) | 2 |
| R-02 | Sobrepago por concurrencia: dos abonos simultáneos sobre la misma boleta | Media | Alto | `SELECT … FOR UPDATE` ordenado por `ticket_id` en la RPC + `CHECK (paid_amount <= sale_price)` | 2, 5 |
| R-03 | Vista creada sin `security_invoker`: fuga de datos entre vendedores | Media | **Crítico** | Regla obligatoria + consulta de catálogo automatizada (TESTING §4) | 2, 7, 9 |
| R-04 | Función `SECURITY DEFINER` sin `search_path` fijo: secuestro de esquema | Media | **Crítico** | `SET search_path = public, pg_temp` obligatorio + verificación de catálogo | 2, 7, 9 |
| R-05 | Congelamiento del navegador con 1.000 filas en la carga masiva | Alta | Medio | Virtualización, validación con retardo, envío por lotes de 100 y detección de duplicados en el servidor | 3 |
| R-06 | Fuga de `SUPABASE_SERVICE_ROLE_KEY` al navegador | Baja | **Crítico** | `import 'server-only'` en el cliente admin + prohibición del prefijo `NEXT_PUBLIC_` para secretos | 1, 7 |
| R-07 | Desfase de zona horaria: pagos nocturnos contabilizados al día siguiente | Media | Medio | Fechas de negocio como `date` calculadas con `today_bogota()`; `TZ=UTC` en el proceso (D-022) | 2, 6 |
| R-08 | Trigger de recálculo de `paid_amount` que no cubre algún camino (borrado, anulación, actualización) | Media | Alto | Cobertura de los cuatro eventos + pruebas DB-17 y DB-13 | 2, 5 |
| R-09 | El índice único no aplica cuando los números son `NULL` en `draft` | Media | Bajo | Es el comportamiento buscado; los números son obligatorios al salir de `draft` (D-017) | 2 |
| R-10 | Consultas N+1 en listados con datos de cliente, rifa y saldo | Media | Medio | Vistas agregadas + `select` con relaciones; revisión con `EXPLAIN ANALYZE` | 3, 6, 7 |
| R-11 | Mensajes de error de PostgreSQL expuestos al usuario final | Media | Medio | `mapPgError` traduce a mensajes genéricos en español | 3, 7 |
| R-12 | Deriva entre el esquema real y `docs/DATA_MODEL.md` | Alta | Medio | Actualización obligatoria del documento en cada fase que modifique el esquema | 2+ |
| R-13 | Sesión de usuario recién desactivado que sigue operando | Media | Alto | `is_active` verificado en cada request y dentro de `current_org_ids()` (D-006) | 1, 2 |
| R-14 | Fallo parcial en la carga masiva que deja datos inconsistentes | Media | Medio | RPC por lote transaccional que devuelve filas insertadas y conflictos | 3 |
| R-15 | Bloqueo en `raffles.ticket_counter` al insertar 1.000 boletas de una en una | Media | Bajo | La RPC reserva el bloque completo de códigos en una sola actualización | 3 |
| R-16 | `bigint` de PostgreSQL serializado a `number` de JavaScript | Baja | Bajo | Los importes reales quedan muy por debajo de 2^53; documentado en D-008 y verificado en pruebas |
| R-17 | Vercel y Supabase en regiones distintas: latencia | Baja | Medio | Elegir regiones cercanas (`us-east`) al crear los proyectos | 8 |

---

## 3. Deuda técnica aceptada

| ID | Deuda | Razón | Revisión |
|----|-------|-------|----------|
| DT-01 | TypeScript fijado en 5.9.3 en lugar de 7.x | `typescript-eslint@8` exige `<6.1.0` (D-002) | Cuando `typescript-eslint` soporte TypeScript 7 |
| DT-02 | `paid_amount` desnormalizado en `tickets` | Rendimiento y posibilidad de `CHECK` de sobrepago (D-009) | Se mantiene; requiere que el trigger cubra todos los caminos |
| DT-03 | `organization_id` repetido en todas las tablas | Simplicidad y eficiencia de RLS (D-007) | Se mantiene |
| DT-04 | Sin catálogo configurable de métodos de pago | Innecesario para el MVP (D-020) | Si el negocio lo pide |
| DT-05 | Una sola organización en producción al arrancar | El modelo ya soporta varias | Ninguna acción pendiente |
| DT-06 | Sin internacionalización (solo español) | El negocio opera en Colombia | Fuera del MVP |

---

## 4. Limitaciones conocidas del MVP

Estas **no** son fallas: son alcance explícitamente excluido (`CLAUDE.md` §31).

- Sin pasarela de pagos: el registro de abonos es manual.
- Sin portal para clientes finales.
- Sin integración con loterías, sorteos automáticos ni números ganadores.
- Sin notificaciones por WhatsApp ni SMS.
- Sin facturación electrónica ni integraciones contables.
- Sin cálculo de comisiones de vendedores.
- Sin aplicación móvil nativa (la web es mobile-first).
- Una combinación anulada no se puede reutilizar dentro de la misma rifa (regla del MVP, BR-N08).
- La anulación de un pago es irreversible (D-013).

---

## 5. Historial

| Fecha | Fase | Cambio |
|-------|------|--------|
| 2026-08-02 | 0 | Creación del documento: 4 problemas abiertos, 17 riesgos y 6 deudas técnicas identificados. |
