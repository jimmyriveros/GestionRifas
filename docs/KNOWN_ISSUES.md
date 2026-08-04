# PROBLEMAS CONOCIDOS Y RIESGOS

**Actualizado:** 2026-08-03 (Fase 4). Este documento **no oculta errores**.
Las trampas más frecuentes están resumidas en [`HANDOFF.md`](HANDOFF.md) §9.

---

## 1. Problemas

`Abierto` = requiere acción · `Mitigado` = hay que seguir un procedimiento · `Info` = no es un defecto

| ID | Problema | Estado | Qué hacer |
|---|---|---|---|
| I-001 | Supabase CLI no instalada globalmente | ✅ Resuelto (F1) | Se usa como devDependency vía `npx supabase` |
| I-002 | Docker no disponible | ✅ Resuelto (F2) | Instalado. Necesario para BD local, `test:db` y `gen types` |
| I-003 | Sin credenciales de Supabase | ✅ Resuelto (F1) | Proyecto real configurado en `.env.local` |
| I-004 | `CLAUDE.md` y `CLAUDE.md.txt` coexisten | Abierto | `CLAUDE.md` es el canónico (D-003). Editar solo ese. Pendiente que el usuario autorice borrar el `.txt` |
| I-005 | `db.<ref>.supabase.co` no resuelve por DNS | Mitigado | Supabase solo lo expone por IPv6 sin el add-on de IPv4. **Usar el session pooler**: `aws-0-<región>.pooler.supabase.com:5432`, usuario `postgres.<ref>`, contraseña percent-encoded |
| I-006 | `gen types --db-url` exige Docker | ✅ Resuelto (F2) | Se genera con `--local`. Cierra D-034 y DT-10 |
| I-007 | `auth.admin.createUser({password})` no deja la contraseña usable de inmediato | Mitigado | Verificado: el primer `signInWithPassword` falla; un `updateUserById` posterior con la misma contraseña sí funciona. `scripts/seed.ts` ya lo aplica. **Ya no afecta al alta de usuarios**: la Fase 3 invita por correo y nunca crea contraseñas (D-045). Sigue vigente solo para el seed |
| I-008 | `invalid_credentials` con la contraseña correcta | Info | Límite de intentos de Supabase Auth tras varios fallos seguidos. Esperable en desarrollo, no en operación normal |
| I-009 | Clic en viewport móvil no automatizable con la herramienta de este entorno | Info | La estructura a 375px se verificó por árbol de accesibilidad. Validar en dispositivo real o con Playwright (F7) |
| I-010 | Un `\r` dentro de un valor de `.env.local` | ✅ Resuelto (F2) | Se generó con `openssl … > archivo` en Git Bash sobre Windows; `tr -d '\n'` dejó el retorno de carro. Efecto: contraseña imposible de teclear, login OK por API y fallido en navegador. **Nunca construir valores de `.env` con redirecciones de shell en Windows** |
| I-011 | Al desactivar a un usuario, desaparecía del listado y era imposible reactivarlo | ✅ Resuelto (F3) | La política `profiles_select` de 0001 exigía `m_target.is_active`: sin perfil visible, `listOrgMembers` descartaba la fila. Corregido por la migración **`0011_profiles_visible_when_inactive.sql`**, aplicada en local **y en el proyecto real**. Lo detectó una prueba end-to-end, no una revisión de código |
| I-012 | La vista previa del navegador integrado no revela el contenido en Suspense | Info | React revela los límites de Suspense con `requestAnimationFrame`; si el panel no está visible, no compone fotogramas y el esqueleto se queda fijo. El servidor sí devuelve el HTML completo (200). No afecta a usuarios reales ni a Playwright |
| I-013 | `.env.local` apunta al proyecto **real**, no al local | Mitigado | `npm run dev` usaría producción para desarrollar. Usar `npm run dev:local` (D-047) para desarrollar y para las pruebas E2E |
| I-014 | `notFound()` responde **200**, no 404, en segmentos con `loading.tsx` | Info | La respuesta ya iba en streaming cuando se resolvió `notFound()`, así que el código de estado ya estaba enviado. **No es una fuga**: la página muestra «Pagina no encontrada» y no revela ningún dato del recurso ajeno, y así lo comprueban las pruebas E2E de aislamiento. Afecta al SEO de rutas públicas, que aquí no existen |

**Sin bloqueantes para la Fase 4.**

---

## 2. Riesgos técnicos

| ID | Riesgo | Mitigación | Estado |
|---|---|---|---|
| R-01 | Recursión de RLS al consultar `memberships` desde sus propias políticas | Funciones `SECURITY DEFINER STABLE` que omiten RLS | ✅ Verificado F2 |
| R-02 | Sobrepago por concurrencia | `FOR UPDATE` ordenado + snapshot nuevo por sentencia + `CHECK` | ✅ Probado con pagos concurrentes reales |
| R-03 | Vista sin `security_invoker` → fuga entre vendedores | Regla obligatoria + prueba de catálogo que falla sola | ✅ Verificado F2 · revisar F7/F9 |
| R-04 | Función `SECURITY DEFINER` sin `search_path` | Obligatorio en las 20 funciones + prueba de catálogo | ✅ Verificado F2 · revisar F7/F9 |
| R-05 | Navegador congelado con 1.000 filas | Virtualización (`@tanstack/react-virtual`), validación pura O(n), lotes de 100 | ✅ Verificado F3: 1.000 filas generadas y guardadas en ~5 s, <60 filas en el DOM |
| R-06 | Fuga de `SERVICE_ROLE_KEY` al navegador | `import 'server-only'` + prohibido `NEXT_PUBLIC_` en secretos | ✅ Verificado F1 |
| R-07 | Desfase de zona horaria en pagos nocturnos | Fechas de negocio como `date` con `today_bogota()`; `TZ=UTC` | ✅ Implementado F2 |
| R-08 | Recálculo de `paid_amount` que no cubra algún camino | Cubre INSERT/UPDATE/DELETE + cambio de `voided_at`; prueba que compara con la suma real | ✅ Verificado F2 |
| R-09 | El índice único no aplica con números `NULL` en `draft` | Es el comportamiento buscado; obligatorios al salir de `draft` (D-017) | ✅ Por diseño |
| R-10 | Consultas N+1 en listados | Vistas agregadas + `select` con relaciones; nombres de vendedor resueltos con **un** mapa en memoria | ✅ Verificado F3 · revisar F6 |
| R-11 | Errores de PostgreSQL expuestos al usuario | `mapPgError` traduce por código y por restricción, y propaga solo los mensajes de negocio propios (D-044) | ✅ Ampliado en F3 |
| R-12 | Deriva entre el esquema real y `DATA_MODEL.md` | Actualización obligatoria + tipos generados + pruebas de catálogo | 🔄 Permanente |
| R-13 | Sesión de usuario recién desactivado | `is_active` verificado en cada request y en `current_org_ids()` | ✅ Verificado F1/F2 |
| R-14 | Fallo parcial en carga masiva | RPC por lote que devuelve insertados y conflictos sin abortar; la interfaz conserva solo las filas rechazadas | ✅ Verificado F3 |
| R-15 | Bloqueo del contador al insertar 1.000 boletas | La RPC reserva el bloque completo de una vez | ✅ Implementado F2 |
| R-16 | `bigint` serializado a `number` en JS | Importes muy por debajo de 2^53 (D-008) | ✅ Aceptado |
| R-17 | Vercel y Supabase en regiones distintas | Elegir regiones cercanas | ⬜ Control en F8 |

---

## 3. Deuda técnica aceptada

| ID | Deuda | Razón | Revisión |
|---|---|---|---|
| DT-01 | TypeScript 5.9.3, no 7.x | `typescript-eslint@8` exige `<6.1.0` (D-002) | Cuando lo soporte |
| DT-02 | `paid_amount` desnormalizado | Permite el `CHECK` de sobrepago y filtrar sin agregar (D-009) | Se mantiene |
| DT-03 | `organization_id` repetido en todas las tablas | RLS simple y eficiente + FK compuestas (D-007) | Se mantiene |
| DT-04 | Métodos de pago no configurables | Innecesario para el MVP (D-020) | Si el negocio lo pide |
| DT-05 | Una sola organización real | El modelo ya soporta varias | Ninguna |
| DT-06 | Sin internacionalización | El negocio opera en Colombia | Fuera del MVP |
| DT-07 | `supabase-js@2.109` / `ssr@0.12.0`, no las últimas | 2.110+ exige Node ≥22 (D-029) | Al pasar a Node 22 |
| DT-08 | `jsdom@29`, no 30 | 30 exige Node ≥22.22 (D-030) | Junto con DT-07 |
| DT-09 | `eslint@9`, no 10 | El `eslint-plugin-react` interno de `eslint-config-next` no admite 10 (D-031) | Al actualizarse |
| ~~DT-10~~ | ~~`database.types.ts` a mano~~ | **Saldada en F2**: se genera con `gen types --local` | — |
| ~~DT-11~~ | ~~Playwright no instalado~~ | **Saldada en F3**: `@playwright/test` + Chromium instalados, 41 specs en `tests/e2e/` | — |
| DT-12 | 3 vulnerabilidades altas de `npm audit` | `postcss` y `sharp` **internos de Next 16**, no del proyecto. El único «fix» degradaría Next a la versión de 2019. `postcss` solo procesa CSS propio en build; `sharp` es la ruta opcional de `next/image`, hoy sin imágenes remotas | Reevaluar al habilitar `next/image` con imágenes remotas o de usuarios |

---

## 4. Estado del proyecto Supabase real

Las **11 migraciones** están aplicadas. La `0011` se aplicó el 2026-08-03 con:

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
```

`SUPABASE_DB_URL` debe ser la cadena del **session pooler** (I-005). Fue un cambio de política de
lectura: no alteró datos ni estructura, y es reversible con la nota del propio archivo.

Comprobado tras aplicarla, contra el proyecto real:

- `profiles_select` ya no exige `m_target.is_active` y sigue acotada por `is_org_staff`.
- Las 7 verificaciones estructurales siguen en cero filas: tablas sin RLS · sin `FORCE RLS` ·
  funciones `SECURITY DEFINER` sin `search_path` · vistas sin `security_invoker` · políticas de
  `DELETE` · `DELETE` concedido a `authenticated` · columnas monetarias que no sean `bigint`.

---

## 5. Fuera del MVP (no son fallas)

Pagos en línea · portal de clientes · integración con loterías · sorteos automáticos · números
ganadores · WhatsApp/SMS · facturación electrónica · comisiones · app nativa · contabilidad.

Reglas del MVP que podrían confundirse con defectos:
- Una combinación anulada **no** se reutiliza dentro de la misma rifa (BR-N08).
- La anulación de un pago es **irreversible**: se registra uno nuevo si hubo error (D-013).

---

## 6. Historial

| Fecha | Fase | Cambio |
|---|---|---|
| 2026-08-02 | 0 | 4 problemas, 17 riesgos, 6 deudas identificados. |
| 2026-08-03 | 1 | I-001 e I-003 resueltos. +I-005..I-009, +DT-07..DT-12. R-06 y R-13 verificados. |
| 2026-08-03 | 2 | I-002 e I-006 resueltos. +I-010. DT-10 saldada. R-01, R-02, R-03, R-04, R-08 verificados con pruebas automatizadas. |
| 2026-08-03 | 3 | +I-011 (resuelto con la migración 0011), +I-012, +I-013. DT-11 saldada. R-05, R-10, R-11, R-14 verificados. |
| 2026-08-03 | 4 | +I-014. R-13 reverificado con el portal del vendedor. Sin migraciones ni deuda nueva. |
