# PROBLEMAS CONOCIDOS Y RIESGOS

**Actualizado:** 2026-08-04 (Fase 8). Este documento **no oculta errores**.
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
| I-015 | El historial **ocultaba** los pagos que registraba un administrador para el cliente de un vendedor | ✅ Resuelto (F5) | `v_payment_history` unía `profiles` con INNER JOIN para los nombres. Como la vista es `security_invoker` y un vendedor no ve el perfil del administrador, el JOIN eliminaba la fila **entera**: el pago existía en `payments` (y su política se lo permitía) pero no en su historial. Corregido por la migración **`0012`** con LEFT JOIN. Detectado por un sondeo previo a escribir la interfaz, no por una prueba |
| I-016 | `MoneyInput` **concatenaba** los dígitos al escribir sobre él de forma programática | ✅ Resuelto (F5) | El componente reescribía el contenido del input al enfocarlo (estado `raw`/`focused`), así que un `fill()` podía añadir en vez de reemplazar: «50000» + «30000» = «5000030000». Corregido derivando lo mostrado solo de `value` (D-053). Afectaba también a gestores de contraseñas y autocompletado móvil |
| I-014 | `notFound()` responde **200**, no 404, en segmentos con `loading.tsx` | Info | La respuesta ya iba en streaming cuando se resolvió `notFound()`, así que el código de estado ya estaba enviado. **No es una fuga**: la página muestra «Pagina no encontrada» y no revela ningún dato del recurso ajeno, y así lo comprueban las pruebas E2E de aislamiento. Afecta al SEO de rutas públicas, que aquí no existen |
| I-017 | Toda fecha de **día calendario** se mostraba **un día antes** | ✅ Resuelto (F6) | `payment_date`, `sale_date`, `start_date` y `end_date` son columnas `date`: PostgREST las entrega como `'AAAA-MM-DD'` y `new Date('2026-08-04')` es **medianoche UTC**, que en Bogotá (UTC-5) todavía es el día 3. Afectaba a la fecha de todo abono, toda venta y toda rifa en pantalla. Corregido en `src/lib/dates.ts`: las cadenas de solo fecha se anclan al mediodía UTC antes de formatearlas, con lo que se arreglan de golpe los 8 sitios que las mostraban. Regresión cubierta en `tests/unit/dates.test.ts` y en E2E |
| I-018 | El helper `logout()` de las pruebas E2E nunca funcionó | ✅ Resuelto (F6) | Buscaba un botón llamado `/menu de usuario\|cuenta/i`, pero el disparador del menú no tenía nombre accesible: su contenido eran las iniciales del avatar y un nombre oculto bajo `md`. Era código muerto —ninguna prueba lo usaba— hasta que la Fase 6 necesitó cambiar de usuario dentro de una prueba. Corregido añadiendo `aria-label="Menu de usuario: <nombre>"` al disparador, que además **arregla un defecto real de accesibilidad**: en un teléfono, un lector de pantalla anunciaba solo «CR» |
| I-019 | **Toda consulta con RLS llamaba a una función por fila**: ~1,7 s con 7.278 boletas | ✅ Resuelto (F7) | Lo destapó el `EXPLAIN ANALYZE` de la revisión de rendimiento. `is_org_staff(organization_id)` recibe una **columna**, así que el planificador no puede sacarla del bucle: una llamada por fila, y cada una consulta tres tablas (44.367 accesos a buffer para 566 páginas). No se ve en desarrollo, donde el seed tiene 30 boletas, y **empeora con los datos** porque el coste es por fila. Corregido por la migración **`0014`**: `columna in (select current_staff_org_ids())` se evalúa una sola vez. Medido: **1.667 ms → 1,18 ms**. Sin cambio de permisos (D-063) |
| I-020 | En el **proyecto real**, `anon` podía ejecutar **todas** las funciones de `public`, incluidas las 6 RPC de negocio | ✅ Resuelto (F7) | Apareció al verificar el catálogo **después** de aplicar `0012`–`0014`. Misma causa que D-038, ahora con funciones: Supabase concede por `ALTER DEFAULT PRIVILEGES` **directo al rol**, y `revoke execute … from public` no deshace eso. **No hubo fuga**: `anon` no tiene privilegios de tabla (`0010`) y toda RPC empieza por `require_auth()`, así que obtenía `permission denied for table payments` o «Debes iniciar sesion». Pero la invariante que `catalog.test.ts` daba por cierta era **falsa en producción**. Corregido por `0015` (revoca de `anon` **y** de `public`), más `npm run verify:remote` para que la divergencia no vuelva a esconderse |
| I-021 | Las cuentas de demostración (`owner@demo.test`, etc.) conviven en el mismo proyecto Supabase que se usa como producción (F8, D-066), con una contraseña **compartida y conocida** | Abierto | No es una fuga por sí sola (nadie externo conoce `SEED_DEFAULT_PASSWORD`), pero es una superficie innecesaria en cuanto haya datos reales. Recomendación operativa en `docs/OPERATIONS.md` §5: desactivarlas o rotarles la contraseña antes de operar con dinero o clientes reales. No se hizo automáticamente: es una decisión del dueño del negocio |
| I-022 | No existe un entorno de staging real: los Preview de Vercel, si llegaran a tener las variables de Supabase configuradas, escribirían sobre la misma base que producción | Mitigado | Consecuencia directa de D-066. Mitigación actual: las tres variables de Supabase solo están puestas en el scope **Production** del proyecto Vercel, nunca en Preview (`docs/DEPLOYMENT.md` §1 y §3.1). Si algún día se necesita Preview con datos, hace falta aprovisionar un segundo proyecto Supabase primero |
| I-023 | Un enlace de invitación o de recuperación de contraseña puede aterrizar en la portada en vez de en `/reset-password`, sin ningún error visible en el servidor | Mitigado | GoTrue solo respeta el `redirect_to` pedido (`/auth/callback?next=/reset-password`) si coincide con la lista blanca de Authentication → URL Configuration del proyecto Supabase; si no coincide, cae en silencio al `site_url` base, sin la ruta. Reproducido en local durante la Fase 8 al probar `scripts/create-organization.ts`: `supabase/config.toml` solo autoriza `https://127.0.0.1:3000` (sin ruta ni `http://`), así que el enlace real clicado desde Mailpit terminó en `error=access_denied&error_code=otp_expired`. **Acción requerida en producción**: agregar la URL real de Vercel (con comodín) en esa lista antes de invitar a nadie — `docs/DEPLOYMENT.md` §2.1 |
| I-024 | El proyecto real está en el plan **Free** de Supabase: sin scheduled backups, sin Point-in-Time Recovery, sin restore-to-new-project | Abierto | Confirmado en el dashboard (Database → Backups, 2026-08-04) por el usuario. No existe ningún backup restaurable desde el dashboard hoy. Mitigación de la Fase 8: respaldo lógico manual con `supabase db dump` (D-070), verificado localmente. **No es una solución permanente**: antes de operar con dinero o clientes reales hace falta actualizar a Pro o automatizar el respaldo manual desde fuera de Supabase (`docs/RUNBOOK.md` §5.3). Un intento inicial de generar el respaldo, sin restringir el esquema, volcó `auth.users` completo (contraseñas cifradas y tokens); se detectó al restaurar en local, se descartó de inmediato y no salió de la máquina — el procedimiento corregido (`--schema public` en el volcado de datos) ya no incluye nada de `auth` |

**Sin bloqueantes para la Fase 8.**

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
| R-10 | Consultas N+1 en listados | Vistas agregadas + `select` con relaciones; nombres de vendedor resueltos con **un** mapa en memoria | ✅ Reverificado F6 con 5.000 boletas: los reportes devuelven 1–2 filas agregadas, no 5.000 |
| R-18 | **Truncamiento silencioso de PostgREST a 1.000 filas** en agregados y exportaciones | `fetchAllRows` (bloques de 1.000 con orden estable) y `count: 'exact', head: true`; nunca `data.length` | ✅ Verificado F6 con una prueba que **demuestra** el truncamiento y luego lo evita |
| R-19 | Una exportación que alcance el tope de 50.000 filas parecería completa | `fetchAllRows` devuelve `truncated`, y el CSV termina con una línea `AVISO;…` que dice que está incompleto | ✅ Implementado F6. No alcanzable con el volumen real de este negocio; existe para que nunca sea silencioso |
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
| DT-12 | ~~3 vulnerabilidades altas de `npm audit`~~ | ✅ **Saldada en la Fase 7.** En la Fase 2 el único «arreglo» que ofrecía npm era degradar Next a la versión de 2019, así que se aceptó como deuda. Al reevaluarla en la Fase 7 la situación había cambiado: el arreglo pasó a ser **subir** a `next@16.3.0`, dentro de la misma major | Hecho: Next y `eslint-config-next` a 16.3.0 (versiones fijas, sin `^`), `npm audit` en **0 vulnerabilidades**, y las tres suites en verde tras la subida |

---

## 4. Estado del proyecto Supabase real

**Las migraciones `0001`–`0015` están aplicadas y verificadas** (2026-08-04).

Comprobación reproducible en cualquier momento, de solo lectura:

```bash
npm run verify:remote
```

Ejecuta contra el proyecto real las mismas invariantes de catálogo que
`tests/db/catalog.test.ts` comprueba en local: RLS habilitada y forzada, `search_path` en las
funciones `SECURITY DEFINER`, `security_invoker` en las vistas, ausencia de políticas y privilegios
de `DELETE`, `anon` sin privilegios de tabla **ni de función**, dinero en `bigint` y ninguna política
llamando a una función por fila.

**Por qué existe este script (I-020).** Dos veces ya, una invariante era cierta en local y falsa en
el proyecto alojado, porque Supabase concede privilegios por `ALTER DEFAULT PRIVILEGES` y el
resultado depende del rol que aplique la migración:

| Cuándo | Qué divergía | Se corrigió con |
|---|---|---|
| Fase 2 (D-038) | `authenticated` conservaba `DELETE` en el remoto | `0010` |
| Fase 7 (I-020) | `anon` podía ejecutar **todas** las funciones | `0015` |

Las pruebas locales no podían detectarlo. Verificar el remoto es lo único que lo detecta.

Historial de aplicaciones al proyecto real:

| Fecha | Migraciones | Nota |
|---|---|---|
| 2026-08-03 | `0001`–`0010` | Alta inicial del esquema |
| 2026-08-03 | `0011` | Corrige I-011. Cambio de política de lectura: no alteró datos ni estructura |
| 2026-08-04 | `0012`, `0013`, `0014` | Historial de pagos, funciones de reporte y rendimiento de la RLS. `--dry-run` primero; las tres se aplicaron sin error |
| 2026-08-04 | `0015` | Cierra I-020, detectado al verificar el catálogo **después** de aplicar las tres anteriores |

Todas las verificaciones de `npm run verify:remote` quedaron en verde tras aplicar `0015`.

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
| 2026-08-03 | 5 | +I-015 y +I-016, ambos resueltos en la misma fase (migración `0012` y `MoneyInput`). R-02 y R-16 reverificados con la interfaz de pagos. |
| 2026-08-04 | 6 | +I-017 y +I-018, ambos resueltos en la misma fase (fechas de día calendario y nombre accesible del menú de usuario). Migración `0013` **pendiente de aplicar al proyecto real**. I-011 verificado con una prueba explícita a 5.000 boletas. |
| 2026-08-04 | 7 | +I-019 (**RLS llamando a una función por fila**, ~1.400× más lenta), resuelto con la migración `0014`. DT-12 saldada subiendo Next a 16.3.0: `npm audit` en 0. Cabeceras de seguridad con CSP por nonce, limitación de intentos, y las 25 pruebas mínimas automatizadas por fin (la 1, la 2 y la 25 no lo estaban). R-03, R-04 y R-11 reverificados. |
