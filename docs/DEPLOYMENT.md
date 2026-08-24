# DESPLIEGUE

**Actualizado:** 2026-08-09. Procedimiento de despliegue y reversión. Para el manual de
operación del negocio ver [`OPERATIONS.md`](OPERATIONS.md); para problemas frecuentes,
[`RUNBOOK.md`](RUNBOOK.md).

---

## 1. Entornos

| Entorno | Frontend | Base de datos | Propósito |
|---|---|---|---|
| Local | `next dev` (`npm run dev:local`) | Supabase local (Docker) | Desarrollo y `test:db`/`test:e2e` |
| Producción | Vercel (proyecto `gestion-rifas`) | Proyecto Supabase real (el mismo usado en Fases 2–7) | Operación real |

No existe un entorno de **staging** separado (Preview de Vercel con su propia base de datos), a
diferencia de lo que planteó `ARCHITECTURE.md` §12 en la Fase 0. Es una decisión explícita del
usuario para la Fase 8 — ver **D-066**. Consecuencia directa: **no actives variables de Supabase en
el scope "Preview" del proyecto Vercel**; si lo haces, cualquier Pull Request escribiría sobre la
misma base que usan las personas reales (`docs/KNOWN_ISSUES.md` I-022).

---

## 2. Supabase de producción

Ya provisto — es "el proyecto real" usado durante las Fases 2 a 7. Nada que crear.

| Elemento | Estado |
|---|---|
| Migraciones (21) | Aplicadas y verificadas con `npm run verify:remote` |
| RLS, RPC, vistas, auditoría | Igual que en local (mismo código, mismas migraciones) |
| Cuentas de prueba (`owner@demo.test`, etc.) | Existen en este proyecto — ver la nota de seguridad en `OPERATIONS.md` §4 antes de operar con datos reales |

### 2.1 Configuración de Auth que hay que revisar (una sola vez)

Dashboard de Supabase → **Authentication → URL Configuration**:

| Campo | Debe incluir |
|---|---|
| Site URL | La URL canónica de producción: `https://gestion-rifas.vercel.app` |
| Redirect URLs | La misma URL con comodín: `https://gestion-rifas.vercel.app/**` |

> **Verificación humana pendiente de esta auditoría:** una versión anterior de este documento usaba
> `https://gestion-rifas-jimmyriveros-projects.vercel.app`, mientras `HANDOFF.md`, el estado de Fase
> 8 y las comprobaciones de producción registran `https://gestion-rifas.vercel.app`. Confirma en los
> paneles de Vercel y Supabase Auth que la URL canónica y el comodín anteriores siguen configurados;
> si el alias largo todavía se usa, autorízalo además, no en sustitución del canónico (I-023).

**Por qué importa:** los enlaces de invitación y de recuperación de contraseña llevan un
`redirect_to` (`/auth/callback?next=/reset-password`, ver `src/features/users/actions.ts:70` y
`scripts/create-organization.ts`). Supabase Auth solo respeta ese destino si coincide con la lista
anterior; si no coincide, **no da error** — silenciosamente redirige a la URL base sin la ruta, y la
persona invitada llega a la portada en vez de a la pantalla para fijar su contraseña. Se comprobó
este mismo comportamiento en local durante la Fase 8: `supabase/config.toml` solo autoriza
`https://127.0.0.1:3000` (sin ruta), así que un enlace de invitación clicado de verdad aterriza con
`error=access_denied&error_code=otp_expired`. Ver **I-023**.

### 2.2 Promoción de migraciones futuras

Las 21 actuales ya están aplicadas. Para cualquier migración **nueva**, exige autorización explícita
y genera primero el respaldo de §4.2/`RUNBOOK.md` §5. Después la promoción son tres pasos —nunca dos
(ya hizo falta el tercero dos veces: D-038, D-065/I-020):

```bash
npx supabase db push --dry-run --db-url "$SUPABASE_DB_URL"
```

```bash
npx supabase db push --yes --db-url "$SUPABASE_DB_URL"
```

```bash
npm run verify:remote
```

`SUPABASE_DB_URL` es la cadena del **session pooler** (`aws-0-<región>.pooler.supabase.com:5432`),
nunca la conexión directa (I-005). El build de Vercel **no** aplica migraciones — `next build` no
toca la base de datos. Cada migración se promueve a mano, o desde un paso de CI que ejecute
exactamente estos tres comandos (fuera de alcance de esta fase: hoy el CI solo valida contra una
instancia local efímera, ver §5).

---

## 3. Vercel

| Elemento | Valor |
|---|---|
| Proyecto | `gestion-rifas` (equipo `jimmyriveros-projects`) — reutilizado, no uno nuevo (**D-067**) |
| Conectado a | `github.com/jimmyriveros/GestionRifas`, rama `main` (repo público) |
| Framework detectado | Next.js |
| Dominio | El subdominio gratuito de Vercel (`*.vercel.app`). Se puede añadir un dominio propio después, sin volver a desplegar nada |

Este proyecto ya existía antes de la Fase 8: Vercel lo creó automáticamente al importar el repo
(`importSource: "import-suggestions"`). El primer intento falló porque no tenía variables de entorno;
ese es un antecedente histórico, ya corregido. La aplicación actual está desplegada y verificada en
producción. Antes de un despliegue futuro se consulta `HANDOFF.md` y se compara Git, sin inferir el
estado actual a partir de aquel primer intento.

### 3.1 Variables de entorno (hacerlo en el dashboard de Vercel — no lo hace un agente)

Settings → Environment Variables del proyecto `gestion-rifas`, scope **Production** únicamente
(ver §1 sobre por qué no Preview):

| Variable | Tipo en Vercel | Valor |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Plain | El de `.env.local` (Supabase → Connect → Project URL) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Plain | El de `.env.local` (Supabase → Connect → Publishable key, D-028) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sensitive** | El de `.env.local` (Supabase → Connect → Service role key) |
| `NEXT_PUBLIC_SITE_URL` | Plain | La URL de producción, la misma de §2.1 |
| `TZ` | Plain | `UTC` (D-022 — la conversión a Bogotá es explícita en la presentación) |

`scripts/check-env.ts` (el `prebuild`) corta el build si falta alguna de las tres claves de Supabase.
Hoy no valida `NEXT_PUBLIC_SITE_URL`; comprobarla en Vercel sigue siendo un paso manual (I-049).

### 3.1.b Fluid Compute — obligatorio para que la navegación no tarde segundos

**Está declarado en `vercel.json`** (D-106, 2026-08-23):

```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "fluid": true }
```

Antes vivía **solo** como interruptor en el panel (Settings → Functions). El problema no era que
estuviera mal puesto, sino que un requisito de despliegue no dejaba rastro en Git: nadie lo veía en
una revisión y nadie se enteraba si se apagaba. Declarado en el repositorio, viaja con el código y se
revisa como cualquier otro cambio. El interruptor del panel sigue existiendo; lo que manda para cada
despliegue es este archivo.

`vercel.json` **solo anula las propiedades que declara**. Aquí no se declara ninguna otra a propósito:
las cabeceras de seguridad viven en `next.config.ts` y la CSP con nonce en `src/proxy.ts`, y tenerlas
en dos sitios sería peor que tenerlas en uno.

**Debe estar activado.** Sin él, la función que sirve las pantallas arranca en frío cada vez que pasa
un rato sin tráfico, y la primera navegación después de leer una pantalla cuesta **3–5 segundos**
(I-067, D-104). Medido sobre la misma ruta y la misma sesión: 261–333 ms con la función caliente
frente a 3.594–4.276 ms tras 45–90 s de pausa.

⚠️ **Cómo se comprueba, y cómo NO.** `curl -w "%{time_starttransfer}"` **no** mide el tiempo del
servidor: incluye DNS, TCP y TLS. Un pico ahí puede ser de tu propia red y no de Vercel — pasó el
2026-08-23 y costó media hora de diagnóstico equivocado. Desglosa siempre, y compara contra
`/denied`:

```bash
curl -s -o /dev/null -w "dns=%{time_namelookup} tcp=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer}\n" https://gestion-rifas.vercel.app/login
```

El tiempo del servidor es `time_starttransfer − time_appconnect`. Sano ronda los **130–270 ms**.

**No es una optimización de la aplicación y ningún cambio de código lo arregla**: se comprobó que
`/login`, que no consulta nada, sufre el mismo pico, y que `/denied`, que se sirve desde el CDN, no
lo sufre nunca.

⚠️ **Se aplica a los despliegues NUEVOS.** Cambiarlo no toca el despliegue que ya está en línea: hay
que volver a desplegar para que surta efecto. Está disponible también en el plan Hobby.

### 3.2 Primer despliegue real

1. Confirmar que las variables de §3.1 están puestas (Production).
2. Confirmar la configuración de Auth de §2.1.
3. Disparar el despliegue: un `git push` a `main` con el código actual — Vercel construye
   automáticamente por su integración de GitHub ya conectada. **Un agente pide permiso explícito
   antes de este paso** (`CLAUDE.md` §1.15: nunca hace push remoto sin que se lo pidan).
4. Verificar que el build terminó en verde en el dashboard de Vercel (o con `list_deployments` /
   `get_deployment`).
5. Ejecutar la verificación de §6.

### 3.3 Despliegues futuros

Cada `git push` a `main` que se decida subir dispara un build y despliegue a producción automático
(la integración de GitHub ya está conectada). Si una migración nueva acompaña al cambio, aplicarla
**antes** de fusionar a `main` siguiendo el procedimiento de §2.2 — las migraciones son aditivas e
inmutables, así que aplicarlas antes que el código que las usa no rompe nada.

---

## 4. Reversión

### 4.1 Aplicación (Vercel)

Dos formas, de más rápida a más prolija:

1. **Instant Rollback** desde el dashboard de Vercel: pestaña Deployments del proyecto
   `gestion-rifas` → elegir el despliegue anterior que estaba en verde → promoverlo a producción. No
   requiere código nuevo ni build; efecto inmediato.
2. **`git revert`** del commit problemático + push a `main`: más lento (dispara un build), pero dejа
   el historial de git como fuente de verdad de lo que corre en producción. Preferible si el rollback
   va a durar más que unas horas.

### 4.2 Base de datos

Las migraciones son **inmutables** una vez aplicadas a producción (`HANDOFF.md` §8.2): nunca se edita
un archivo ya aplicado, un cambio posterior es una migración nueva. Cada migración incluye, al final,
una **nota de reversión manual, no ejecutable** (ver `supabase/migrations/0015_harden_function_grants.sql`
como ejemplo) — son instrucciones para quien necesite deshacer el efecto a mano, no un script
automático, porque revertir un cambio de esquema casi siempre implica una decisión de negocio
(¿qué pasa con los datos escritos mientras tanto?) que no se puede automatizar con seguridad.

**Antes de aplicar cualquier migración a producción, generar un respaldo manual** — el proyecto real
está en el plan Free de Supabase, sin backups automáticos (D-070, I-024). Procedimiento exacto y
verificado en `docs/RUNBOOK.md` §5.

---

## 5. CI

`.github/workflows/ci.yml` corre en cada `push`/`pull_request` a `main`:

| Job | Qué hace | Por qué |
|---|---|---|
| `verify` | `typecheck` + `lint` + `test` + `build` | Espejo exacto de `npm run verify` |
| `db` | Levanta Supabase local con la CLI, aplica todas las migraciones **desde cero**, siembra y corre `test:db` | Prueba en cada corrida lo que la Fase 8 exige a mano: "despliegue limpio en un entorno nuevo" y "migraciones aplicadas desde cero" |

`test:e2e` (Playwright) queda **fuera** del CI por defecto — decisión **D-069** — por duración y
complejidad en runners compartidos. Se sigue corriendo en local antes de cerrar cada fase.

---

## 6. Verificación tras desplegar

| Qué | Cómo |
|---|---|
| Cabeceras de seguridad | `curl -I https://<dominio-real>` — confirmar `Strict-Transport-Security` (solo aparece con `NODE_ENV=production`, que Vercel fija solo) y `Content-Security-Policy` |
| Ningún secreto llega al navegador | Estático: `npm run build` local + buscar `SERVICE_ROLE` en `.next/` (no debe aparecer). En vivo: DevTools → Network → confirmar que ninguna respuesta ni el HTML/JS servido contienen la service role key |
| Los tres roles funcionan | Login como `owner@demo.test`, `admin@demo.test`, `vendedor1@demo.test` (contraseña de `SEED_DEFAULT_PASSWORD` del proyecto real) y confirmar la redirección de cada uno a su portal |
| Variables de entorno completas | El build comprueba las tres claves de Supabase; revisar además `NEXT_PUBLIC_SITE_URL` y `TZ` en el panel (I-049) |

Detalle de qué hacer si algo de esto falla en `RUNBOOK.md`.
