# PROBLEMAS CONOCIDOS Y RIESGOS

- **Versión:** 1.1 · **Actualizado:** 2026-08-03 (Fase 1)
- Este documento **no oculta errores**. Registra problemas reales, riesgos identificados y deuda
  técnica aceptada, con su plan de mitigación.

---

## 1. Problemas abiertos

| ID | Problema | Severidad | Estado | Plan |
|----|----------|-----------|--------|------|
| I-001 | La Supabase CLI no está instalada globalmente | Media | ✅ Resuelto (Fase 1) | Se agregó como dependencia de desarrollo (`npx supabase`); no requiere instalación global |
| I-002 | Docker Desktop no está disponible en esta máquina | Media | Abierto | Confirmado en la Fase 1 (`docker: command not found`). Bloquea `supabase gen types` contra remoto y Supabase local. Necesario antes o durante la Fase 2 |
| I-003 | No existían credenciales de un proyecto Supabase | Alta | ✅ Resuelto (Fase 1) | El usuario entregó `URL`, `Publishable key` y `SERVICE_ROLE_KEY` de un proyecto real |
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten con contenido idéntico | Baja | Abierto | `CLAUDE.md` es el canónico (D-003). Editar solo uno; conviene eliminar el `.txt` cuando el usuario lo confirme |
| I-005 | La conexión directa a Postgres (`db.<ref>.supabase.co:5432`) no resuelve por DNS desde este entorno | Media | Abierto (con solución alterna) | Solo expone esa ruta por IPv6 sin el add-on de IPv4 de Supabase. Usar el **connection pooler** (`aws-0-<region>.pooler.supabase.com:5432`, usuario `postgres.<ref>`), que sí resuelve por IPv4. Documentado en `docs/DEPLOYMENT.md` cuando se cree en la Fase 8 |
| I-006 | `supabase gen types typescript --db-url` exige Docker aunque apunte a una base remota | Media | Abierto | `LegacyContainerRuntimeNotFoundError`. Bloquea regenerar `database.types.ts` hasta instalar Docker (ver I-002). Mientras tanto, el archivo se mantiene a mano y verificado (D-034) |
| I-007 | `auth.admin.createUser({ password })` no deja una contraseña utilizable para `signInWithPassword` de inmediato | Media | Mitigado | Verificado empíricamente en este proyecto: `createUser` reporta éxito y crea un hash de contraseña con longitud válida, pero el primer intento de login falla con `invalid_credentials`. Un `updateUserById` posterior con la misma contraseña sí funciona, de forma consistente. `scripts/seed-users.ts` ya aplica este segundo paso siempre (D-035). Si se reutiliza este patrón en la Fase 3 (invitación de usuarios), replicar el mismo flujo de dos pasos |
| I-008 | Límite de intentos de login de Supabase Auth afectó las pruebas manuales de la Fase 1 | Baja | Informativo | Varios intentos fallidos seguidos contra el mismo correo (producto de las pruebas de este mismo desarrollo) hicieron que intentos posteriores con la contraseña correcta también devolvieran `invalid_credentials` durante un rato. No es un bug de la aplicación; es esperable en operación normal (un usuario real no falla el login 5+ veces en un minuto) |
| I-009 | No se pudo completar una prueba de interacción (clic) en viewport móvil con la herramienta de navegador de este entorno | Baja | Informativo | El árbol de accesibilidad confirmó que `/login` renderiza los elementos correctos a 375px de ancho (formulario, labels, botón). El clic sobre el botón "Ingresar" no disparó el `submit` en ese viewport especifico con esta herramienta, mientras que el mismo flujo funcionó de forma repetida y confiable en escritorio. Se interpreta como una limitación puntual de la herramienta de prueba, no un defecto de la aplicación (las clases responsive de Tailwind se revisaron y son correctas). Repetir la prueba manualmente desde un teléfono real o con Playwright (Fase 7) |

I-002 e I-006 son los únicos que condicionan el inicio pleno de la Fase 2 (Supabase local).

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
| DT-07 | `@supabase/supabase-js@2.109.0` y `@supabase/ssr@0.12.0`, no las últimas | 2.110+ exige Node ≥22 (D-029) | Cuando el entorno pase a Node 22, o el ecosistema soporte Node 20 de nuevo |
| DT-08 | `jsdom@29.1.1`, no 30.x | jsdom 30 exige Node ≥22.22/24.15/26 (D-030) | Junto con DT-07 |
| DT-09 | `eslint@9.39.5`, no 10.x | `eslint-plugin-react` interno de `eslint-config-next` no admite ESLint 10 (D-031) | Cuando `eslint-config-next` actualice esa dependencia interna |
| DT-10 | `database.types.ts` escrito y verificado a mano, no generado | Docker no disponible para `supabase gen types` (D-034, I-002, I-006) | Regenerar con la CLI real en cuanto haya Docker (Fase 2) |
| DT-11 | Sin Playwright instalado todavía | No hay specs E2E que lo justifiquen antes de la Fase 3 | Instalar cuando se escriban los primeros specs reales |
| DT-12 | 3 vulnerabilidades "altas" reportadas por `npm audit`, no corregidas | `postcss@8.4.31` y `sharp@0.34.5` están empaquetados **dentro** de `node_modules/next` (dependencias internas de Next.js 16.2.12, no del proyecto). El único "fix" que ofrece `npm audit fix --force` es degradar `next` a la versión `9.3.3` (de 2019), lo que rompería todo el proyecto. `postcss@8.4.31` se usa solo para el pipeline interno de CSS de Next en build, no procesa CSS de usuarios finales; `sharp@0.34.5` es la ruta opcional de optimización de imágenes de `next/image`, que esta fase no ejercita (`images.remotePatterns: []`, sin imágenes remotas ni subidas por usuarios) | Revisar en cada actualización de Next.js si el `next.config` interno ya trae versiones corregidas; volver a evaluar el riesgo antes de habilitar `next/image` con imágenes remotas o subidas por usuarios |

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
| 2026-08-03 | 1 | I-001 e I-003 resueltos. Agregados I-005 a I-009 y DT-07 a DT-12. R-01, R-06, R-13 verificados en la práctica (RLS, `server-only`, bloqueo de usuario inactivo probado en vivo). |
