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
| Migraciones (**40**, hasta `0040`) | Aplicadas y verificadas con `npm run verify:remote`. La cifra se quedó en «21» durante varias promociones; se corrige al aplicar `0040` (2026-08-31) |
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
| `LOTTERY_SYNC_SECRET` | **Sensitive** | **Opcional.** Autoriza `/api/lottery/sync` (D-148, D-149). Mínimo 16 caracteres. En producción basta `CRON_SECRET`, que Vercel inyecta al declarar `crons`. Si se pone, **tiene que ser el mismo** que `CRON_SECRET` |

`scripts/check-env.ts` (el `prebuild`) corta el build si falta alguna de las tres claves de Supabase.
Hoy no valida `NEXT_PUBLIC_SITE_URL`; comprobarla en Vercel sigue siendo un paso manual (I-049).
`LOTTERY_SYNC_SECRET` no entra en el prebuild: sin ella el Route Handler usa `CRON_SECRET` o responde 401.

### 3.1.c Programador de loterías — activado (D-149)

`vercel.json` declara los **diez jobs diarios de Hobby** sobre `/api/lottery/sync`
(`src/features/lottery/cron-plan.ts`). Son válidos también en Pro. Un job `*/15`
rompería el despliegue en Hobby (I-082). Vercel envía `Authorization: Bearer` con
`CRON_SECRET`. El Route Handler no usa sesión. Fluid Compute se conserva.

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

`vercel.json` **solo anula las propiedades que declara**. Declara `fluid` y los `crons` de loterías
(D-149). Las cabeceras de seguridad viven en `next.config.ts` y la CSP con nonce en `src/proxy.ts`,
y tenerlas en dos sitios sería peor que tenerlas en uno.

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

### 3.1.c Qué le pasa a la aplicación instalada en cada despliegue (D-115, D-116)

Desde el 2026-08-26 hay un service worker, así que un despliegue afecta a teléfonos que ya tienen la
aplicación en su pantalla de inicio. Lo que hay que saber:

| Pregunta | Respuesta |
|---|---|
| ¿Puede alguien quedarse con la versión vieja? | **No.** El HTML **nunca** sale de la caché: cada navegación trae el documento del despliegue vigente, que pide los fragmentos de su propio despliegue |
| ¿Puede mezclarse `index` nuevo con fragmentos viejos? | **No**, por lo mismo. Los fragmentos del despliegue anterior quedan como entradas huérfanas y caen solas al llegar al tope de 300 |
| ¿Cuándo se entera de la versión nueva? | Al cargar cualquier pantalla: el worker se registra como `/sw.js?v=<versión>` y esa versión cambia con el commit |
| ¿Se actualiza sola? | **No.** Se instala en segundo plano, espera, y aparece un aviso con botón. Solo al pulsarlo se activa y recarga. Es deliberado: recargar en mitad de un abono se lleva lo escrito |
| ¿Hay que hacer algo al desplegar? | **Nada.** No hay que purgar cachés ni avisar a nadie |

**Un requisito nuevo, y es duro:** `public/sw.js` y `/manifest.webmanifest` tienen que responder
**200 sin sesión**. Están excluidos del matcher de `src/proxy.ts` justo para eso. Si alguien los
devuelve a ese matcher, empezarán a responder con la redirección a `/login` y la aplicación dejará de
poder instalarse — sin que nada más falle ni dé señal.

**Comprobación posterior al despliegue** (resuelve además parte de I-069, porque `/sw.js` es público
y su versión cambia con cada commit):

```bash
curl -sI https://gestion-rifas.vercel.app/sw.js | head -3
```

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

### 6.1 Comprobar que el código nuevo está SERVIDO, y cuándo no se puede

Que Vercel diga `READY` sobre un SHA prueba que **construyó** ese commit. Comprobar que lo que
responde el dominio es ese build es un paso más, y el método depende de qué cambió:

| Qué cambió | Cómo se comprueba | Estado |
|---|---|---|
| Algo que genera **CSS nueva** (una clase de Tailwind que antes no existía) | Descargar la hoja de `/login` y buscar la clase escapada —`.lg\:p-5`—, construyendo la barra invertida con `String.fromCharCode(92)`. Mejor aún: comprobar también que las huellas del build **anterior desaparecieron** (D-113, §7.b) | ✅ Fiable |
| **Cualquier cambio**, desde el 2026-08-26 | Calcular el identificador de versión del commit y buscarlo en los fragmentos de JavaScript que sirve el dominio. Es el método de más abajo | ✅ **El bueno.** Vale para texto, lógica y CSS |
| Solo **texto**, con el método antiguo | No había huella en la CSS, y los fragmentos llevan un hash propio del build, así que el nombre local **no existe** en Vercel: se intentó el 2026-08-25 con D-114 y los dos dieron **404** | ❌ Superado por la fila de arriba (I-069 cerrado) |

**Cuando no se puede, no se inventa:** la evidencia es el SHA del despliegue, el alias apuntando a él
y el CI en verde sobre ese mismo commit, y se dice así de claro en el registro. No se debe escribir
«verificado que el código nuevo está servido» apoyándose en una comprobación que no se hizo.

#### El método, desde 2026-08-26 (I-069 cerrado)

El service worker necesitaba saber qué versión sirve, así que `next.config.ts` inyecta en el build
`NEXT_PUBLIC_APP_BUILD_ID` = **sha256 del commit, recortado a 12 hex** (D-115). Ese valor viaja
dentro del JavaScript servido, así que la comprobación es: calcularlo del commit local y buscarlo en
los fragmentos que responde el dominio.

Vale para **cualquier** tipo de cambio —texto, lógica o CSS— y **no publica el commit**, que era el
reparo que dejó abierta la salida propuesta antes.

```bash
node -e "const c=require('child_process').execSync('git rev-parse HEAD').toString().trim();console.log(require('crypto').createHash('sha256').update(c).digest('hex').slice(0,12))"
```

Después se descarga `/login`, se extraen los `src` de `/_next/` y se busca esa cadena: tiene que
aparecer al menos una vez. Estrenado en el despliegue de `cc64a99` — `f300e003e18b`, encontrado en 1
de los 15 fragmentos servidos.

**Sigue valiendo la regla de honestidad** del párrafo anterior: si algún día la comprobación no se
puede hacer, la evidencia es el SHA del despliegue, el alias y el CI, y se dice así de claro.

