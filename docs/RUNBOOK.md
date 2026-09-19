# RUNBOOK — problemas frecuentes en producción

**Actualizado:** 2026-09-19 (§5.2: un respaldo restaurado **no recrea los dos disparadores de `auth.users`**, medido al
validar el de la promoción de D-209). Antes, 2026-09-18 (§9 **rehecha en la Etapa 4 de D-208**: el estado real de producción comprobado en solo lectura —`0001`–`0066`, el despliegue servido es `6da9bcb` y no `da81663`, y las dos coincidencias, idénticas a lo confirmado—, el cargador con su modo de producción probado, las herramientas de puerta versionadas —foto por fila, comparación con la «Opción A» y sonda del historial—, la conciliación de totales **recalculados** en vez de «el historial tiene dos premios» y la recuperación; **sigue sin ejecutarse**. Antes, ese mismo día, §9 nueva: **el procedimiento de promoción del historial de premios ganados**, preparado en la Etapa 3 de D-208 y **no ejecutado** —`0067`–`0072`, el cargador de los dos premios reconocidos y el despliegue, en cuatro puertas, con la línea base por fila y la «Opción A» de la Entrega 5—; antes, el 2026-09-17, §8.0 y §8.1: **la puerta 1 pasa a `0058`–`0066`** y a un commit nuevo; el primer intento, autorizado el 2026-09-17, **se suspendió antes de escribir** porque el preflight vio que el proyecto alojado concede EXECUTE a `service_role` en toda función nueva (I-132, D-207); antes, el 2026-09-16, §8.3: **la puerta 2 la hace el Dueño con su sesión**, desde Editar, y el agente solo verifica en modo lectura; el aviso de fechas llega también al Dueño —`0065`, D-206 corregida—, y el bloque SQL sin sesión queda descartado porque dejaba la bitácora a nombre de «Sistema»; antes, ese mismo día, §8: el procedimiento de producción con **tres puertas** —migraciones y despliegue, extender la fecha de fin con su aviso, y la transición— y lo que pasa con los sorteos que conservan el sistema de siempre, D-206; antes, ese mismo día, la transición preparada para la Entrega 5, D-204). Guía de diagnóstico rápido para quien opera la aplicación en
producción. El detalle técnico de cada `I-0xx` citado está en
[`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) — aquí solo el síntoma y qué hacer.

---

## 1. El sitio no carga / el build de Vercel falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El build falla con `npm run build exited with 1` en el log de Vercel | Falta una de las tres variables de Supabase (`scripts/check-env.ts` corta el `prebuild`) | Settings → Environment Variables del proyecto `gestion-rifas`: confirmar las tres, scope Production (`DEPLOYMENT.md` §3.1) |
| El sitio carga pero cualquier pantalla que lea datos muestra un error genérico | Las variables apuntan a un proyecto Supabase equivocado, o las migraciones no están aplicadas ahí | `npm run verify:remote` contra ese proyecto; revisar `NEXT_PUBLIC_SUPABASE_URL` |
| El build tarda mucho o falla de forma intermitente | Puede ser ajeno a este proyecto (incidente de Vercel) | `list_deployments` / `get_deployment_build_logs` del proyecto para ver el log completo |

---

## 2. Login e invitaciones

| Síntoma | Causa | Qué hacer |
|---|---|---|
| Un enlace de invitación o de "olvidé mi contraseña" lleva a la portada en vez de a la pantalla para fijar contraseña | La URL de producción no está en la lista blanca de Supabase Auth (Authentication → URL Configuration) | Agregar la URL real con comodín (`DEPLOYMENT.md` §2.1). Ver **I-023** |
| `invalid_credentials` con la contraseña correcta, tras varios intentos fallidos | Límite de intentos: 10/5 min por correo en el login de la aplicación, más el límite duro de Supabase Auth (D-062) | Esperar la ventana (5 minutos) o, si es urgente, reiniciar el servicio de Vercel no ayuda — el límite es de Supabase Auth, no de la aplicación. Ver I-008 |
| Alguien queda bloqueado por el límite de intentos y jura que no fue él | La limitación de intentos de la aplicación es **en memoria, por instancia de servidor** (D-062): si Vercel corrió varias instancias, el límite efectivo se multiplicó, no se compartió | Es una limitación conocida y aceptada para este tamaño de operación. No hay acción del lado de operación; ver D-062 para la sustitución futura (contador compartido) si algún día hace falta |
| Un usuario que **debería** poder entrar no puede | Confirmar que su membresía sigue activa (`/owner/users`) — desactivar cierra también cualquier sesión que tuviera abierta (BR-A04) | Reactivarlo desde el listado |

---

## 3. Cabeceras de seguridad

Verificación rápida contra el dominio real:

```bash
curl -I https://<dominio-real>
```

| Debe aparecer | Si falta |
|---|---|
| `Strict-Transport-Security` | Solo se envía con `NODE_ENV=production`. Vercel lo fija solo — si falta, es señal de que el build no es el de producción (revisar en el dashboard qué target tiene el despliegue activo) |
| `Content-Security-Policy` con `nonce-` y `strict-dynamic` | Si falta o rompe alguna pantalla, revisar `docs/SECURITY.md` §10.1 y `src/proxy.ts` — no relajar la política agregando `unsafe-inline` (D-061) |
| `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | Se fijan en `next.config.ts`, iguales para toda respuesta incluida la estática |

---

## 4. Fechas que se ven raras

Si una fecha de pago, venta o vigencia de rifa aparece **un día antes** de lo esperado: ya se corrigió
en la Fase 6 (I-017) para toda la aplicación vía `src/lib/dates.ts`. Si vuelve a aparecer, es una
regresión — algún código nuevo está formateando una fecha sin pasar por `formatDateEs`/`formatDateCsv`.

---

## 5. Copias de seguridad y restauración

**El proyecto real está en el plan Free de Supabase, confirmado en el dashboard (Database → Backups,
2026-08-04).** Eso significa, explícitamente:

| Capacidad | ¿Disponible? |
|---|---|
| Scheduled backups (copias automáticas) | **No** |
| Point-in-Time Recovery (PITR) | **No** — requiere plan Pro + add-on |
| Restore to new project (backups físicos) | **No** — requiere plan Pro |

**No existe ningún backup restaurable desde el dashboard hoy.** Cualquier mención anterior a
"backups automáticos de Supabase" en la documentación de fases previas a la 8 asumía por defecto una
capacidad que este proyecto, en este plan, no tiene. Ver **I-024**.

### 5.1 Estrategia mientras el proyecto esté en el plan Free: respaldo lógico manual

Un volcado (`dump`) con la Supabase CLI, guardado **fuera del repositorio Git y fuera de Supabase**.
Verificado end-to-end en la Fase 8 (procedimiento y hallazgos abajo).

**Antes de cualquier migración o acción destructiva sobre el proyecto remoto, generar un respaldo
nuevo.** Reemplazar `<CARPETA-FUERA-DEL-REPO>` por una carpeta fuera de `Rifas/` (por ejemplo, una
carpeta hermana `Rifas-backups/` en el mismo equipo, y copiarla además a un lugar fuera de esta
máquina — un backup que vive solo en el mismo disco no protege contra la pérdida del equipo).

```bash
cd Rifas
export SUPABASE_DB_URL=$(node -e "
const fs = require('fs');
const c = fs.readFileSync('.env.local', 'utf8');
const m = c.match(/^SUPABASE_DB_URL=(.*)\$/m);
let v = m ? m[1].trim() : '';
if (v.startsWith('\"') && v.endsWith('\"')) v = v.slice(1, -1);
process.stdout.write(v);
")
```

⚠️ **No uses `require('dotenv').config()` para esto.** Los `dotenv` recientes imprimen un aviso
promocional por `stdout` (algo como `◇ injected env (12) from .env.local // tip: ...`), y si capturas
la salida con `$(...)` ese aviso se **cuela dentro del valor** y rompe la cadena de conexión con un
error `LegacyDbConfigParseUrlError`. Descubierto al generar este mismo respaldo en la Fase 8. El
`node -e` de arriba lee el archivo directamente, sin ese efecto secundario.

```bash
npx supabase db dump -f "<CARPETA-FUERA-DEL-REPO>/roles.sql" --role-only --db-url "$SUPABASE_DB_URL"
npx supabase db dump -f "<CARPETA-FUERA-DEL-REPO>/schema.sql" --db-url "$SUPABASE_DB_URL"
npx supabase db dump -f "<CARPETA-FUERA-DEL-REPO>/data.sql" --schema public --data-only --db-url "$SUPABASE_DB_URL"
```

⚠️ **El `--schema public` de la tercera línea NO es opcional.** Sin él, el volcado de datos incluye
el esquema `auth` **completo** — `auth.users` con `encrypted_password`, `confirmation_token`,
`recovery_token`, `reauthentication_token`, más `auth.sessions` e `identities` — exactamente lo que
la instrucción 4 de esta sección prohíbe. Ocurrió una vez al preparar este procedimiento: el volcado
por defecto no se limita a `public`. Verificar siempre después de generar:

```bash
grep -cE '"auth"[[:space:]]*\.' "<CARPETA-FUERA-DEL-REPO>/data.sql"   # debe imprimir 0
```

> **Corregido el 2026-09-13.** La comprobación decía `grep -c '"auth"'`, y desde que
> `push_subscriptions` tiene filas (`0053`) imprime **1** con un volcado correcto: esa tabla tiene una
> **columna** llamada `auth` —la clave de la suscripción Web Push— y su `INSERT` la nombra. Lo que
> delata el esquema `auth` es un nombre **cualificado**, `"auth"."users"`, y eso es lo que busca la
> línea de arriba. Se vio al respaldar antes de `0056`: nombres `"auth".` cualificados **0**,
> `INSERT INTO "auth"` **0** y ni una línea con `encrypted_password`, `refresh_token` ni
> `confirmation_token`. Esa columna es un dato del dispositivo, y por eso el respaldo sigue fuera del
> repositorio.

⚠️ **La segunda línea (`schema.sql`) va SIN `--schema public`, a propósito.** Restringirla igual que
la de datos rompe la restauración: la extensión `pg_trgm` no se vuelve a crear y la restauración falla
con `operator class "public.gin_trgm_ops" does not exist`. `schema.sql` sin restringir solo trae una
referencia inofensiva a `auth` (la definición de la llave foránea de `profiles`, no una tabla ni datos
de `auth`) — confirmado línea por línea en la Fase 8.

**Qué queda fuera de estos tres archivos, a propósito:**

* **Identidades de Auth** (`auth.users` y relacionadas): excluidas para no guardar contraseñas ni
  tokens. Consecuencia real: restaurar `data.sql` trae de vuelta las filas de `profiles`,
  `organizations`, `tickets`, `payments`, etc. — pero **nadie puede iniciar sesión** con esos perfiles
  hasta volver a invitarlos (`/owner/users`, `/owner/sellers`, o `scripts/create-organization.ts` para
  el primer Owner) o recuperar el acceso de otra forma. El dato de negocio se recupera completo; la
  identidad de acceso no, por diseño.
* **Objetos de Supabase Storage**: un volcado de PostgreSQL nunca incluye los archivos binarios
  guardados en Storage, solo su metadata si esa tabla estuviera incluida. Este proyecto no usa Storage
  hoy; si se empieza a usar, los archivos necesitan su propio respaldo aparte (por ejemplo,
  sincronizarlos a otro almacenamiento), este procedimiento no los cubre.

### 5.2 Restaurar — **solo en local**, nunca en el proyecto remoto sin autorización

> **Regla no negociable:** ningún agente ni persona restaura o resetea la base de datos del proyecto
> remoto sin mostrar antes el procedimiento exacto (comandos, archivo de origen, hora) y recibir
> autorización explícita de quien opera el negocio. Restaurar reemplaza datos; hacerlo sobre el
> proyecto que usan personas reales sin ese paso es irreversible y no se negocia.

Para **validar** que un respaldo sirve (probarlo sin arriesgar nada), restaurar contra la instancia
**local** de Docker, nunca contra el proyecto real:

```bash
docker exec supabase_db_Rifas psql -U postgres -d postgres -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker exec -i supabase_db_Rifas psql -U postgres -d postgres < roles.sql
docker exec -i supabase_db_Rifas psql -U postgres -d postgres -v ON_ERROR_STOP=1 < schema.sql
docker exec -i supabase_db_Rifas psql -U postgres -d postgres -v ON_ERROR_STOP=1 < data.sql
```

`roles.sql` deja **un error esperado e inofensivo** —
`ERROR: permission denied for parameter log_min_messages`— al intentar un `GRANT` que solo tiene
sentido en el proyecto alojado. No aborta nada importante; ignorarlo.

**Verificar después** (lista de la Fase 8, ejecutada y en verde el 2026-08-04):

```sql
select 'tablas', count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';        -- 9
select 'politicas RLS', count(*) from pg_policies where schemaname='public';                                             -- 25
select 'triggers', count(*) from information_schema.triggers where trigger_schema='public';                              -- 35
select 'vistas', count(*) from information_schema.views where table_schema='public';                                     -- 5
select 'tipos enum', count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'; -- 5
select 'organizations', count(*) from organizations;  -- filas restauradas, comparar con lo esperado
```

Y, si se quiere ir más allá de contar objetos, terminar con `npm run db:reset && npm run seed:local`
para dejar la instancia local en su estado normal de desarrollo otra vez (la restauración de prueba no
debe quedar pisando el seed habitual).

> **Medido el 2026-09-19 (D-209): un respaldo restaurado NO recrea los dos disparadores de `auth.users`.**
> `on_auth_user_created` —crea el perfil de cada persona nueva— y `on_auth_user_email_updated` —mantiene su correo en
> `profiles`— llaman a funciones de `public`: `DROP SCHEMA public CASCADE` se los lleva, y `schema.sql` no trae nada del
> esquema `auth`. En una restauración **de verdad** hay que volver a crearlos con su definición de la `0001`; sin ellos,
> una persona invitada después no tendría perfil. Validar la restauración comparando con una foto no lo delata si no se
> mira la estructura: la comparación de estructura con `gate-compare.ts --structure-only` sí los nombra.

**Cuándo restaurar de verdad, contra el proyecto remoto (con autorización explícita ya obtenida):**
mismos tres comandos `psql`, pero contra `$SUPABASE_DB_URL` en vez de `supabase_db_Rifas` — y después,
sin excepción:

```bash
npm run verify:remote
```

más una revisión de conteos clave contra lo esperado, y volver a invitar (o recuperar el acceso de)
cada persona cuya identidad de Auth no se restauró junto con los datos (§5.1).

### 5.3 Antes de operar con datos reales

Este respaldo manual es **para la Fase 8**, no una solución permanente. Antes de que la aplicación
maneje dinero o clientes reales, elegir una de estas dos (**I-024**, requisito abierto):

1. **Actualizar el proyecto a Pro** y activar backups automáticos (y PITR si el negocio lo justifica), o
2. **Automatizar** este mismo procedimiento manual desde fuera de Supabase (por ejemplo, una tarea
   programada que corra los tres `db dump` de §5.1 con regularidad y copie los archivos a un
   almacenamiento durable, no solo al disco de un equipo).

Documentar el incidente cuando se use de verdad —qué se perdió, desde cuándo hasta cuándo, por qué se
restauró— en `docs/KNOWN_ISSUES.md` o en un registro interno del negocio; esta guía no lo hace por ti.

### 5.4 Deshacer una corrección de precio (migración `0027`, D-098)

**No existe migración inversa, y es deliberado.** La corrección subió `raffles.ticket_price` y el
`sale_price` de las boletas de una rifa de `$100.000` a `$120.000`. Volver a bajarlo con un `update`
haría daño en cuanto haya pasado algo después:

- Una boleta cobrada por completo a `$120.000` rompería `paid_amount <= sale_price`, y el `update`
  fallaría a medias dejando unas boletas corregidas y otras no.
- Una boleta con `$110.000` abonados pasaría a figurar **Pagada** con `$10.000` de más que nadie
  cobró.
- Las comisiones de quien cobra «la mitad del precio» se recalcularían hacia abajo (BR-G15), moviendo
  dinero que ya se le comunicó a una persona.

**El procedimiento es restaurar, no revertir:**

1. Localizar el respaldo previo a la migración (`Rifas-backups/<fecha>-pre-0027/`, generado con §5.1
   **antes** del `db push`; sin él no hay vuelta atrás).
2. Restaurar siguiendo §5.2. Recordar que restaurar **descarta todo lo ocurrido después**: ventas,
   abonos y altas incluidas. Si hubo movimiento desde la migración, hay que decidir explícitamente qué
   pesa más, y esa decisión es del dueño, no del agente.
3. Si solo hace falta cambiar el precio **hacia adelante** —no deshacer la corrección—, eso sí es una
   operación normal: editar la rifa desde `/owner/raffles`. No toca las boletas ya vendidas (BR-P04).

Para comprobar qué dejó la migración sin necesidad de restaurar nada, la bitácora lo tiene todo: cada
boleta corregida escribió una entrada `ticket.update` con su `sale_price` anterior y el nuevo, y la
rifa una `raffle.update` (actor `NULL`, porque lo ejecutó el sistema).

---

## 6. Mensajes de error raros o que exponen algo que no deberían

La Fase 7 revisó explícitamente que ningún error revela estructura interna (nombres de tabla,
columnas, mensajes crudos de PostgreSQL) — ni con un id inexistente, ni uno malformado, ni en login,
ni en recuperación de contraseña (`mapPgError`, D-044). Si aparece un mensaje que huela a error de
base de datos crudo (por ejemplo, algo con `pg_` o un código como `23505`), es una regresión:
repórtalo como error de código, no como comportamiento esperado.

---

## 7. El recuadro de loterías no se actualiza

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El Panel muestra vacío o «Horario por confirmar» | Aún no hubo un tick con programación confirmada, o es un día sin sorteo oficial | El recuadro no consulta internet (BR-L20). Esperar el próximo cron o revisar `lottery_sync_runs` |
| Sigue vacío después de varios ticks | Falta `CRON_SECRET`, o hay un `LOTTERY_SYNC_SECRET` distinto, o los `crons` no están en `vercel.json` | El Route Handler responde 401. **`CRON_SECRET` la crea una persona: Vercel no la genera al declarar `crons`** (D-152). Créala y **redespliega**. Ver `DEPLOYMENT.md` §3.1.c. Los dos secretos, si existen, tienen que coincidir (D-149) |
| Un tick devuelve `results.deferred` mayor que cero | Normal: había más sorteos elegibles que el tope de descargas por tick | Se atienden en el tick siguiente, del más reciente al más antiguo (BR-L22). No se sube el tope para «ponerse al día» |
| Un tick devuelve `results.errorCode` con la programación en `success` | La etapa de resultados se cayó entera; la programación **sí** quedó guardada | Es el comportamiento previsto (D-152). Revisar `lottery_sync_runs` y esperar al tick siguiente |
| Hay que parar el programador | Sospecha de bucle, fuente bloqueada o despliegue a medias | Panel de Vercel → Settings → Cron Jobs → desactivar; o `vercel crons ls` para ver el estado. **Nunca** `POST /v1/projects/{id}/pause`: eso tumba la aplicación entera, no solo los cron |
| El tick corre y **Bogotá** no sale | **I-087**: su sitio entero responde con un desafío de Cloudflare y su único API de resultados exige un pase de Turnstile | **No se elude.** Queda registro `source_blocked` en `lottery_sync_runs`. Ese resultado se revisa a mano. No se retira la consulta: un desafío se configura y se desconfigura |
| El tick corre y **Cruz Roja** no sale | Ya no debería pasar: desde D-154 se confirma sola. Si vuelve a fallar, mirar **con qué código** | `source_blocked` = Imunify volvió a poner un muro real. `structure_changed` = cambió la maquetación de la portada, y hay que revisar el anclaje de `parse/results.ts` (§8.19.c de `ARCHITECTURE`) |
| Un resultado sale `structure_changed` o `ambiguous` en una lotería que venía funcionando | La página cambió de maquetación | **Es el fallo correcto: se prefiere no publicar a adivinar** (BR-L24). Abrir la página, ver el encabezado nuevo y ajustar el anclaje. Nunca relajar el largo exacto de la tirada de dígitos: eso es lo que producía I-088 |
| Un resultado sale `not_published` en una portada HTML | La página aún muestra el sorteo anterior | Normal poco después del sorteo. Se reintenta a los 30 min y en la conciliación de la mañana (D-154) |
| Cundinamarca registra `scanned_document` | **I-086**: la autoridad publica el acta como PDF escaneado, sin capa de texto | **No es un fallo del adaptador.** No se hace OCR. Ese resultado se revisa a mano en el acta (`/actas-resultados`). Si algún día el acta trae texto, el adaptador la lee sola |
| Cundinamarca registra `not_published` | El acta de ese sorteo todavía no está subida (404) | Normal poco después del sorteo. Se reintenta esa noche y en la conciliación de la mañana (BR-L23) |
| Cundinamarca registra `ambiguous` | El acta trae dos premios mayores distintos, es de otro sorteo, o el número no son cuatro cifras | **Ante la duda no se publica.** Revisar el acta a mano antes de tocar nada |
| Dos ticks a la vez | El segundo sale `skipped: locked` | Normal. El cerrojo caduca a los 5 min si uno se cae (D-148) |
| El resultado de un sorteo **anterior** al que muestra la portada sale `ambiguous` | **I-092**: Cruz Roja, Meta, Medellín y Boyacá publican en su portada **un solo** resultado, el último. El anterior ya no es legible por esa vía | **No es un fallo: es lo correcto.** Antes que adivinar, no se publica. Ese sorteo se mira a mano en la página de la lotería. **No se inserta a mano en la base** |
| `vercel crons ls` avisa de «N local changes pending deploy» y las filas dicen `0 6 * * * → …` | Artefacto del CLI: los diez jobs comparten `path`, así que los empareja por orden y cree que cambiaron | **No redespliegues.** Compara la lista remota con `vercel.json`: si los diez horarios están y ninguno dice `(disabled)`, está bien (D-157) |
| Hay que saber si un cron entró de verdad | Los registros de ejecución de Vercel en Hobby duran alrededor de **una hora** | La fuente es **`lottery_sync_runs`**, no los logs: un tick autorizado siempre deja al menos una corrida. Si no hay filas nuevas, no entró |
| Un resultado dice «Verificado por 2 fuentes» y no «Fuente oficial» | **Es lo correcto**: la fuente oficial no pudo entregarlo y lo confirmaron dos fuentes alternativas (BR-L26) | No es un fallo. Para un premio grande, contrastar con el acta o la página oficial antes de pagar |
| Un sorteo lleva días pendiente y las fuentes alternativas responden | Solo **una** fuente lo publica, o las que lo publican **no coinciden** | Mirar `lottery_source_observations` de ese sorteo: dice qué dijo cada una. **Con una sola fuente no se confirma, y es deliberado.** No se inserta el número a mano |
| `lottery_sync_runs` muestra `conflicto_entre_fuentes` | Dos números distintos con dos fuentes cada uno | **No se publica nada.** Revisar el acta oficial a mano. La evidencia completa está en `lottery_source_observations` |
| Paga Todo sale siempre `source_blocked` | **I-093**: responde 403 de Cloudflare con cuerpo vacío | Normal y esperado. **No se elude.** El consenso se logra con las otras tres |
| Un tick gasta 6 descargas y deja sorteos en `deferred` | Normal: el presupuesto es de seis por tick para las dos vías juntas | Se atienden en el tick siguiente, del más reciente al más antiguo. Con diez ticks al día se resuelve solo. **No se sube el tope** |

---

## 8. Transición de una rifa a premios configurables (Entrega 5, D-204, D-206)

> ⚠️ **Nada de esta sección se ejecuta sin autorización expresa, y cada puerta se autoriza por
> separado.** `scripts/raffle-prize-transition.ts` trabaja contra el proyecto real **solo con
> `--production`**, y **aplicar** exige además la huella de una vista previa anterior
> (`--preview-hash`), `--apply` y el identificador de la rifa escrito otra vez (`--confirm-raffle`)
> (D-205). Sin `--apply` es siempre una vista previa.

La transición pasa **una** rifa del sistema de premios de siempre a los **seis** premios confirmados
(`MASTER_SPEC` §9.7). Es **entera o nada**, no cambia el estado ni las fechas de la rifa, no toca
boletas, clientes, pagos ni coincidencias, y repetirla con la misma configuración no escribe nada.
**Desde la `0064` (D-206)** guarda su **instante efectivo**: los sorteos cuyo corte llegó antes
**conservan el sistema de siempre** —también si su resultado se confirma después— y los posteriores
usan solo los premios.

### 8.0 El orden y las tres puertas

| # | Puerta —se pregunta tal cual y se espera un «sí»— | Qué escribe | Por qué va en ese orden |
|---|---|---|---|
| 1 | «¿Autorizas aplicar las migraciones `0058`–`0066` y desplegar el commit <SHA> en producción?» | Respaldo nuevo (§5.1), `supabase db push`, despliegue y `npm run verify:remote` —**41/41**, con las tres de la `0066`— | La frontera y el aviso de fechas **son** de la `0064`, que el aviso llegue también al Dueño, de la `0065`, y quién ejecuta cada función de premios, de la `0066`: sin ella, 35 funciones internas quedarían ejecutables por la service role (I-132) |
| 2 | «¿Autorizas que el Dueño, con su sesión y desde Editar, extienda la fecha de fin de «<NOMBRE EXACTO>» hasta el <FECHA>, con el aviso a las <N> membresías activas, él incluido?» | **Lo escribe el Dueño**, no el agente: `raffles.end_date`, un aviso por membresía activa y la bitácora, a su nombre. El agente solo lee antes y después (§8.3) | La transición compara las fechas esperadas, y el premio principal juega el 21/12 |
| 3 | «¿Autorizas transformar esta rifa específica y enviar el aviso a las membresías activas indicadas?» | La transición (§8.4) | Última: con la fecha ya extendida y la vista previa revisada |

**Estado el 2026-09-17, cierre:** **las tres puertas están hechas.** Puerta 1: `0058`–`0066` aplicadas de
14:04:05 a 14:05:58 UTC con respaldo previo y `da81663` desplegado (`verify:remote` 41/41). Puerta 2: la rifa
termina el **21/12/2026** desde las 15:21:19 UTC, con 5 avisos —el del Dueño incluido— y la desviación aceptada
de abajo. Puerta 3: vista previa a las 17:39:28 y transición aplicada de 17:40:09 a 17:40:13 UTC —`af9cdbe2-0d50-43db-b12a-42ded57b1cae`,
huella `43880580a641…`, instante efectivo **17:40:12.566 UTC**—, con 6 premios, 5 avisos, 2 filas de
bitácora de «Sistema» y **45** sorteos anteriores con el sistema de siempre. **Lo único pendiente** es observar el
primer sorteo posterior al instante (§8.6).

**Estado el 2026-09-17, 15:24 UTC:** **puerta 1 hecha** —`0058`–`0066` aplicadas de 14:04:05 a 14:05:58 UTC con
respaldo previo, `da81663` desplegado y `verify:remote` 41/41— y **puerta 2 completada** a las 15:21:19 UTC: la rifa
termina el **21/12/2026**, sigue activa y en `legacy`, cada una de las **5** membresías activas recibió su aviso —el
del Dueño incluido—, no hay premios ni transición y los 25 sorteos de I-127 siguen intactos. **Desviación operativa,
aceptada por el dueño:** la fecha la guardó una **sesión autorizada de Administrador** de la organización, no la
sesión del Dueño que prevé §8.3. La bitácora (5908 `raffle.update`, 5909 `raffle.dates_change`) y los cinco avisos
**conservan a ese actor real**: no se corrigen, no se revierte la fecha y no se repite el cambio. **La puerta 3 no se
ha autorizado.**

**Estado el 2026-09-17, antes:** la puerta 1 se autorizó para `0058`–`0065` y `be26419`, y **se suspendió sin escribir
nada**: ni respaldo, ni migraciones, ni push. El preflight vio primero un pago nuevo de un vendedor (aceptado
como actividad normal) y, en solo lectura, que el privilegio por defecto del proyecto alojado concede `EXECUTE`
a `service_role` en toda función nueva (I-132). Lo corrige la `0066` (D-207), y **la próxima puerta 1 tiene
que autorizar `0058`–`0066` y el commit nuevo**. Las puertas 2 y 3 no se han pedido.

**Estado el 2026-09-16:** ninguna de las tres se había pedido. La rifa confirmada por el dueño es
`d64af684-1378-45b9-bb71-2141a58a5013`, de la organización `ec88961d-7c81-4b27-ae03-d9bccc73eda6`, con el
nombre exacto «SORTEO CAMIONETA KIA 2027» —el «2027» se conserva—, activa, **del 27/07/2026 al
01/11/2026**; el dueño decidió extenderla **hasta el 21/12/2026 inclusive** (I-129). Los identificadores
se escriben **en la orden**, nunca en el código.

### 8.1 Lo que hace falta antes

| Dato o condición | De dónde | Por qué |
|---|---|---|
| Migraciones `0058`–`0066` aplicadas y el código desplegado | Puerta 1 | La operación, la frontera, el aviso de fechas, el panel y quién ejecuta cada función son de esas migraciones |
| Que el **Dueño** pueda entrar a producción **con su propia sesión** | El dueño | La puerta 2 la hace él desde la pantalla de editar: así la bitácora conserva quién cambió la fecha. El agente nunca escribe su contraseña |
| Respaldo nuevo de la base | §5.1, **justo antes** de la puerta 1 | Antes de la primera escritura; uno viejo no sirve (D-205, Decisión 5) |
| Identificadores de la **organización** y de la **rifa** | Consulta de solo lectura. **Nunca se elige por nombre** | La base los compara |
| **Nombre exacto**, **estado** (`active`) y **fechas** | La misma consulta | La base los compara letra por letra |
| Que el **21 de diciembre** quede dentro de la rifa | Puerta 2 | Si termina antes, la transición se niega |
| Ningún sorteo de una **semana ya empezada** con la hora **desconocida** | §8.2 | Es lo único de la ventana que detiene la transición. El 2026-09-16: **cero** días sin programación y cero con una hora vacía |
| Los sorteos jugados **sin resultado confirmado** | §8.2 | **Ya no detienen nada** (D-206): conservan el sistema de siempre. El 2026-09-16 eran **25**, del 27/07 al 24/08 (I-127). **No se cargan ni se confirman** sin evidencia oficial |

### 8.2 Comprobaciones de solo lectura

Después de la puerta 1, en el editor SQL del proyecto real, con `<RIFA>` y `<ORG>` sustituidos. Las
funciones son internas —solo las ejecuta su dueño, que es el rol del editor—:

```sql
-- La rifa, tal como se va a esperar.
select id, organization_id, name, status, start_date, end_date, prize_mode
  from raffles where id = '<RIFA>' and organization_id = '<ORG>';

-- Que no haya ni transición ni premios anteriores (0 y 0).
select (select count(*) from raffle_prize_transitions where raffle_id = '<RIFA>') as transiciones,
       (select count(*) from raffle_prizes where raffle_id = '<RIFA>') as premios;

-- Lo ÚNICO que la detendría: sorteos de una semana ya empezada sin corte conocido. CERO filas.
select reference_date, lottery_code, draw_number
  from raffle_prize_transition_window_draws((select r from raffles r where r.id = '<RIFA>'), now())
 where mode is null and week_started;

-- Los que conservarán el sistema de siempre si se aplicara ahora: cuántos, con y sin resultado, y cuáles.
select raffle_prize_transition_legacy_summary((select r from raffles r where r.id = '<RIFA>'), now());

-- Sorteos cancelados de aquí a diciembre: el script los salta, pero conviene verlos.
select reference_date, lottery_code from lottery_draw_schedules
 where schedule_status = 'cancelled' and reference_date between current_date and '2026-12-31';
```

**Antes de la puerta 1** esas funciones no existen, y crearlas «para mirar» sería escribir en el proyecto
real. La consulta de sorteos pendientes de la `0063` —la réplica que usó el preflight del 2026-09-16—
**ya no sirve** para decidir: contaba como bloqueo lo que desde la `0064` conserva el sistema de siempre.

### 8.3 Extender la fecha de fin (puerta 2)

La fecha la cambia **el Dueño, con su sesión**, por el flujo normal de la aplicación. En la misma
transacción, la base escribe **un aviso por membresía activa —el Dueño incluido—**, todos con el Dueño como
actor, y la bitácora a su nombre (BR-R12, D-206 corregida por la `0065`). **Quién hizo el cambio sale de la
sesión** (`auth.uid()`), nunca de un dato que alguien pueda escribir, así que ninguna otra vía lo conserva:

| Vía | ¿Se usa? |
|---|---|
| **El Dueño, con su sesión, desde Rifas → la rifa → Editar** | ✅ **La única.** Avisos, `raffle.update` y `raffle.dates_change` a su nombre |
| Un `UPDATE` o un bloque SQL sin sesión —editor SQL, `psql`, service role— | ❌ Avisa, pero todo queda a nombre de «Sistema»: se pierde quién cambió la configuración |
| Una RPC que reciba el identificador del actor, o la service role con los `claims` del Dueño | ❌ Atribuye el cambio a quien no lo hizo. **No se crea ni se usa** |

**Quién hace qué.** El agente **no escribe contraseñas ni entra con la cuenta del Dueño**: un agente no
inicia sesión en producción (Fase 8). Si no tiene una sesión autenticada y segura del Dueño —lo normal—,
**se detiene en esta puerta**, le da al dueño los pasos del punto 2, **espera a que confirme que guardó** y
después hace **solo** la verificación de solo lectura del punto 3. No repite el cambio ni lo completa por
otra vía.

> **Registro del 2026-09-17 (desviación aceptada).** La extensión real la guardó una sesión autorizada de
> **Administrador**, no la del Dueño. Por eso, al repetir las consultas del punto 3 sobre ese guardado, **B2**
> da `con_otro_actor` = 5 y **B3** da `es_el_dueno` = false en las dos filas, con todo lo demás correcto. El dueño
> lo aceptó así: la bitácora dice quién lo hizo de verdad y **no se corrige**.

**1. Antes de que el Dueño guarde — solo lectura.** En el proyecto real, con `<RIFA>` y `<ORG>`
sustituidos. El formulario vuelve a enviar **todos** sus campos —nombre, descripción, precio, fechas y el
permiso de crear boletas—, así que primero se comprueba que guardar solo puede cambiar la fecha:

```sql
begin transaction read only;

-- A1. La rifa y la HUELLA de todo lo que no debe cambiar: se anota. «nombre_estable» y
--     «descripcion_estable» tienen que dar true: el formulario devuelve el nombre y la descripción
--     sin espacios en los extremos, y una descripción vacía como NULL. Con un false, guardar cambiaría
--     algo más que la fecha: se para y se avisa al dueño.
with espacio as (
  select '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]' as c
)
select r.name, r.status, r.prize_mode, r.start_date, r.end_date,
       md5((to_jsonb(r) - 'end_date' - 'updated_at' - 'ticket_counter')::text) as huella,
       r.name !~ ('^' || e.c || '|' || e.c || '$') as nombre_estable,
       (r.description is null
        or (r.description <> '' and r.description !~ ('^' || e.c || '|' || e.c || '$'))) as descripcion_estable
  from raffles r, espacio e
 where r.id = '<RIFA>' and r.organization_id = '<ORG>';

-- A2. Las membresías activas, por rol: son los avisos que tienen que salir.
select m.role, count(*) as personas
  from memberships m
  join profiles p on p.id = m.profile_id
  join organizations o on o.id = m.organization_id
 where m.organization_id = '<ORG>' and m.role in ('owner', 'admin', 'seller')
   and m.is_active and p.is_active and o.is_active
 group by m.role
 order by m.role;

-- A3. Todavía ningún aviso ni bitácora de fechas de esta rifa: 0 y 0.
select (select count(*) from notifications
         where kind = 'raffle.dates_changed' and data ->> 'raffle_id' = '<RIFA>') as avisos,
       (select count(*) from audit_logs
         where entity_id = '<RIFA>' and action = 'raffle.dates_change') as bitacora;

rollback;
```

| Resultado | Tiene que decir | Si no |
|---|---|---|
| A1 | La rifa esperada, `active` y `legacy`, del **2026-07-27** al **2026-11-01**, y `true` en las dos columnas «estable». **Se anota la huella**: deja fuera la fecha de fin, `updated_at` y el contador de boletas, que se mueve si alguien crea una mientras tanto | Parar: no se le pide al Dueño que guarde |
| A2 | Las membresías activas por rol. El 2026-09-16 se esperan **5** en total | Se le dice al dueño antes de seguir: es el número de avisos que van a salir |
| A3 | `0` y `0` | Parar: alguien ya cambió las fechas |

**2. El cambio — lo hace el Dueño.** Los pasos que se le dan, tal cual:

1. Entra a Rifas **con tu cuenta de Dueño**. Nadie más escribe tu contraseña.
2. Abre **Rifas → SORTEO CAMIONETA KIA 2027 → Editar**.
3. En **«Fecha de fin»** elige o escribe **21/12/2026**. **No cambies ningún otro campo.**
4. Antes de guardar tiene que aparecer: «Al guardar, avisaremos de las fechas nuevas a todas las personas de
   tu organización, también a ti.». Si no aparece, **no guardes** y avísame.
5. Toca **«Guardar cambios» una sola vez**. Tiene que salir «Rifa actualizada.». Si sale un error, no
   insistas: copia el mensaje y avísame. **No se guardó nada.**
6. Avísame de que guardaste. En tu campana verás: «Cambiaron las fechas de SORTEO CAMIONETA KIA 2027: ahora
   termina el 21 de diciembre de 2026.».

**3. Después de que el Dueño confirme — solo lectura.** Es lo único que hace el agente en esta puerta:

```sql
begin transaction read only;

-- B1. La fecha nueva y nada más: la fecha de fin nueva, el mismo inicio, estado y sistema de premios,
--     y la MISMA huella que en A1.
select r.name, r.status, r.prize_mode, r.start_date, r.end_date,
       md5((to_jsonb(r) - 'end_date' - 'updated_at' - 'ticket_counter')::text) as huella
  from raffles r
 where r.id = '<RIFA>' and r.organization_id = '<ORG>';

-- B2. Los avisos. membresias_activas = avisos = personas, del_dueno = 1, eventos = 1, y CERO en
--     sin_aviso, de_mas, con_otro_actor y de_otra_organizacion.
with activas as (
  select m.profile_id, m.role
    from memberships m
    join profiles p on p.id = m.profile_id
    join organizations o on o.id = m.organization_id
   where m.organization_id = '<ORG>' and m.role in ('owner', 'admin', 'seller')
     and m.is_active and p.is_active and o.is_active
), avisos as (
  select recipient_profile_id, actor_profile_id, entity_id, organization_id
    from notifications
   where kind = 'raffle.dates_changed' and data ->> 'raffle_id' = '<RIFA>'
)
select (select count(*) from activas) as membresias_activas,
       (select count(*) from avisos) as avisos,
       (select count(distinct recipient_profile_id) from avisos) as personas,
       (select count(*) from avisos a join activas x on x.profile_id = a.recipient_profile_id
         where x.role = 'owner') as del_dueno,
       (select count(distinct entity_id) from avisos) as eventos,
       (select count(*) from activas x
         where not exists (select 1 from avisos a where a.recipient_profile_id = x.profile_id)) as sin_aviso,
       (select count(*) from avisos a
         where not exists (select 1 from activas x where x.profile_id = a.recipient_profile_id)) as de_mas,
       (select count(*) from avisos a
         where a.actor_profile_id is distinct from (select profile_id from activas where role = 'owner')) as con_otro_actor,
       (select count(*) from avisos a where a.organization_id <> '<ORG>') as de_otra_organizacion;

-- B3. La bitácora de ESE guardado: las filas de su transacción, las dos del Dueño. raffle.update con
--     old_values y new_values que solo traen end_date; raffle.dates_change con el evento de B2
--     (mismo_evento = true) y notified = membresías activas.
select l.action,
       l.actor_profile_id = (select m.profile_id from memberships m
                              where m.organization_id = '<ORG>' and m.role = 'owner'
                                and m.is_active) as es_el_dueno,
       l.old_values, l.new_values,
       l.new_values ->> 'change_id' = (select distinct n.entity_id::text from notifications n
                                        where n.kind = 'raffle.dates_changed'
                                          and n.data ->> 'raffle_id' = '<RIFA>') as mismo_evento
  from audit_logs l
 where l.entity_id = '<RIFA>'
   and l.created_at = (select created_at from audit_logs
                        where entity_id = '<RIFA>' and action = 'raffle.dates_change')
 order by l.action desc;

rollback;
```

| Resultado | Tiene que decir |
|---|---|
| B1 | `end_date` **2026-12-21**; `start_date` **2026-07-27**, `active` y `legacy`, como en A1; y **la misma huella** que A1: no cambió nada más |
| B2 | `membresias_activas` = `avisos` = `personas` —**5** el 2026-09-16—, `del_dueno` **1**, `eventos` **1**, y **0** en `sin_aviso`, `de_mas`, `con_otro_actor` y `de_otra_organizacion` |
| B3 | **Dos filas**, las dos con `es_el_dueno` **true**: `raffle.update` con `old_values` `{"end_date": "2026-11-01"}` y `new_values` `{"end_date": "2026-12-21"}`, sin más claves; `raffle.dates_change` con `mismo_evento` **true** y `notified` igual a las membresías activas |

**Si algo no cuadra, no se corrige**: se para y se le cuenta al dueño con estos resultados. `con_otro_actor`
distinto de 0 o `es_el_dueno` vacío quieren decir que el cambio **no** se hizo con la sesión del Dueño.
Guardar otra vez la misma fecha no escribe nada, y las consultas dan lo mismo. Las tres comprobaciones se
ensayaron en local el 2026-09-16 con la sesión del Dueño, con un segundo guardado igual y con un cambio sin
sesión, que B2 y B3 delatan (`TEST_RESULTS`).

### 8.4 La vista previa y la transición (puerta 3)

La **vista previa** ejecuta la transición entera y la deshace:

```bash
npx tsx scripts/raffle-prize-transition.ts --production --organization <ORG> --raffle <RIFA> --name "<NOMBRE EXACTO>" --status active --start <AAAA-MM-DD> --end <AAAA-MM-DD>
```

Termina con **«Huella de la configuración: …»**, 64 caracteres. Si entre la vista previa y la aplicación
cambia algo —se juega un sorteo, cambia la programación—, la huella es otra y **no se aplica nada**.
Contra la base local, `--local` en lugar de `--production`.

| Línea | Tiene que decir |
|---|---|
| «Primer sorteo pendiente» | El primer lunes a viernes y el primer sábado que **todavía no se jugaron** hoy |
| Estado y fechas | La rifa **activa**, «(no cambia)», **hasta el 21/12/2026** |
| Premios | **Seis**, con los importes, números, cifras, calendarios y loterías de `MASTER_SPEC` §9.7. Ninguno semanal un lunes con Cundinamarca |
| Premio diario y de fin de semana | Terminan el **27** y el **28 de noviembre** |
| «Sorteos que ya se jugaron: N, con el sistema de premios de siempre» | Todos los de la ventana hasta hoy. **«Sin resultado confirmado»** tiene que incluir los 25 del 27/07 al 24/08, más los recientes que falten |
| Aviso | Tantas personas como membresías activas tenga la organización |

**Aplicar**, con la misma orden y lo que exige la puerta (D-205):

```bash
npx tsx scripts/raffle-prize-transition.ts --production --organization <ORG> --raffle <RIFA> --name "<NOMBRE EXACTO>" --status active --start <AAAA-MM-DD> --end <AAAA-MM-DD> --apply --preview-hash <HUELLA> --confirm-raffle <RIFA>
```

> **Ejecutada el 2026-09-17** (puerta 3). Vista previa **una sola vez** a las 17:39:28 UTC, idéntica línea por
> línea al ensayo local, con huella `43880580a6419fa4a97fa8808f13978d72653f7b17bab760d268307a8d683557`.
> Aplicada de 17:40:09 a 17:40:13 UTC: transición `af9cdbe2-0d50-43db-b12a-42ded57b1cae`, instante efectivo
> **17:40:12.566 UTC**, 6 premios, 6 versiones, 7 períodos, 9 alternativas, 5 avisos y 2 filas de bitácora de
> «Sistema» (5943 y 5944) — **37** filas propias, y ninguna boleta, pago, cliente, comisión ni coincidencia
> tocada. La vista previa y la que repite el aplicar consumieron los identificadores **5939–5942** de la
> secuencia de `audit_logs`: quedan sin fila, y **no se rellenan ni se reutilizan**.

El script repite la vista previa, compara la huella y solo entonces aplica. Se ejecuta **una vez**. Debe
decir «La rifa pasó a premios configurables.», el identificador de la transición y «Premios configurables
desde: …», el **instante efectivo**. Comprobación inmediata:

```sql
select prize_mode, status, start_date, end_date from raffles where id = '<RIFA>';           -- configurable, sin otro cambio
select count(*) from raffle_prizes where raffle_id = '<RIFA>' and status = 'active';       -- 6
select effective_at, transitioned_at from raffle_prize_transitions where raffle_id = '<RIFA>'; -- 1 fila
select effective_at = (select max(published_at) from raffle_prize_versions where raffle_id = '<RIFA>')
  from raffle_prize_transitions where raffle_id = '<RIFA>';                                -- true
select new_values -> 'legacy_draws' from audit_logs
 where entity_id = '<RIFA>' and action = 'raffle.prize_mode_transition';                   -- lo de la vista previa
```

Y en la aplicación, con la cuenta del dueño: `/owner/raffles/<RIFA>/prizes` enseña los seis premios, y
la campana de un vendedor dice «Cambiaron los premios de … para los próximos sorteos: ahora tiene 6
premios.».

### 8.5 Si se niega

**Nunca queda nada a medias**: cualquier rechazo deshace todo.

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| «Todavía no conocemos la hora oficial del sorteo de …» o «… de N sorteos de la rifa» | Un sorteo de una semana ya empezada no tiene corte conocido: no se sabe de qué lado cae (D-206) | Esperar a que el sincronizador publique la programación y repetir. **No** se inventa una hora |
| «La hora del sorteo de … ya pasó, así que el premio … no puede incluirlo» | Entre la vista previa y la aplicación se jugó un sorteo | Repetir el script: recalcula el primer sorteo pendiente |
| «Las fechas del premio … tienen que quedar dentro de las fechas de la rifa» | La rifa termina antes de algún premio | Falta la puerta 2 |
| «El sorteo del … está cancelado en la programación oficial…» o el script dice que un premio «ya no tiene ningún sorteo» | Un sorteo del calendario no se va a jugar, o la transición llegó tarde | Decisión del dueño |
| «La rifa con ese identificador se llama…», «La rifa está … y se esperaba…», «Las fechas de la rifa son…» | Los datos esperados no son los de la rifa | Revisar §8.1. **No** ajustar a ciegas hasta que coincida |
| «Esta rifa ya pasó a premios configurables con otra configuración» | Alguien ya la convirtió | Parar. Esta vía no cambia premios: eso es del panel |
| «Esta rifa tiene una transición registrada, pero sigue con el sistema de premios de siempre» o «… ya tiene premios guardados» | Un estado parcial escrito a mano | Parar e investigar. **No** se completa a ciegas |
| «La configuración cambió desde la vista previa que revisaste…» | Entre la vista previa y la aplicación cambió el primer sorteo pendiente o la programación. **No se aplicó nada** | Ejecutar otra vez la vista previa, **revisarla** y aplicar con la huella nueva |
| «Indica el destino…», «No reconozco…», «… está repetido», «--confirm-raffle no coincide…», «Para aplicar en producción hace falta una vista previa anterior…» o «Se pidió --production, pero…» | La puerta del script rechazó la orden **antes de tocar la base** | Corregir la orden (D-205) |
| **«No sabemos si la transición se aplicó…»** | Al aplicar, la respuesta no llegó completa. **Pudo aplicarse** | **No repetir la orden.** Consultar `select prize_mode from raffles where id = '<RIFA>'` y `select id, configuration_hash, effective_at from raffle_prize_transitions where raffle_id = '<RIFA>'`. Transición con la huella de la vista previa: **está aplicada**, seguir con §8.4. Sin transición y en `legacy`: no se aplicó, investigar antes de reintentar. Cualquier otra combinación: parar |

### 8.6 Después: los sorteos que conservan el sistema de siempre

> **Al 2026-09-17, tras la transición.** El primer sorteo posterior al instante efectivo es **Bogotá 2864 del
> 17/09**, con corte a las **04:15 UTC del 18/09**, y su **único premio aplicable es el Premio diario de
> $500.000** (número diario, cuatro cifras). Su observación **está pendiente**: el vigilante de solo lectura se
> detuvo a las 20:20 UTC por orden del dueño y se reiniciará antes del corte. **El motor todavía no se ha
> ejercitado con un resultado confirmado en producción**, y que Bogotá no se confirme sola —I-087, mitigada por
> consenso desde D-162— **no es, por sí solo, un fallo del motor**. Si no se confirma, el siguiente sorteo que
> puede confirmarse solo es **Medellín del 18/09** (corte 04:00 UTC del 19/09).

| Situación | Qué pasa | Qué hacer |
|---|---|---|
| Se confirma **con evidencia oficial** uno de los sorteos jugados antes del instante efectivo —por ejemplo, uno de los 25 de I-127— | Lo resuelve el **sistema de siempre**: número entero, diario o semanal según la lotería, **sin enlaces**, y avisa como cualquier resultado | Nada. Es lo que decidió el dueño (D-206). **Nunca** se carga un resultado sin evidencia |
| Se confirma un sorteo posterior al instante | Solo los **premios configurables**, con sus enlaces | Nada |
| «Este resultado ya tiene coincidencias de una rifa guardadas con el otro sistema de premios…» al confirmar | Alguien cambió **a mano** la programación de un sorteo ya resuelto y su corte cruzó el instante efectivo. **No se guardó nada nuevo** | Devolver la programación a la de la fuente oficial. **No** se borran fotografías ni enlaces (I-131) |
| «No se conoce la hora original anunciada de este sorteo…» | Un sorteo del lado de la rifa transformada, o de una configurable, sin hora original | Esperar la programación oficial; lo mismo que con una rifa configurable nueva |

Para saber de qué lado cae un sorteo concreto:

```sql
select raffle_prize_draw_mode('<RIFA>', s), raffle_prize_draw_cutoff(s)
  from lottery_draw_schedules s
 where s.lottery_code = '<LOTERÍA>' and s.reference_date = '<AAAA-MM-DD>';
```

### 8.7 Lo que NO se hace nunca

* **No** se desactiva `raffles_guard_prize_config`, `raffles_notify_dates_changed` ni ningún disparador.
* **No** se cambian las fechas de la rifa real con SQL sin sesión, con la service role ni con una RPC que
  reciba el actor, y **no** se suplanta al Dueño: ni con sus `claims`, ni escribiendo su contraseña. Lo hace
  el Dueño, con su sesión (§8.3).
* **No** se escribe a mano en `raffle_prize_transitions` —tampoco `effective_at`—, ni se cambia
  `raffles.prize_mode` con un `UPDATE`.
* **No** se crean los premios con las RPC de la aplicación antes de la transición.
* **No** se ejecuta la transición dentro de un despliegue ni de una migración.
* **No** se reprocesan resultados anteriores, **no** se cargan resultados sin evidencia oficial y **no** se
  corrige a mano la hora de un sorteo ya resuelto.

## 9. Promoción del historial de premios ganados (Etapa 4 de D-208)

> ⚠️ **EJECUTADO EL 2026-09-18/19, CON LA PUERTA 3 DETENIDA POR EL CI (I-140)** —ver la última nota de este aviso—.
> Se preparó y comprobó en solo lectura en la Etapa 4. Nada de esta sección que
> escriba se ejecuta sin autorización expresa, y **cada puerta se autoriza por separado**. El estado real de
> producción se leyó el 2026-09-18 entre las 19:14 y las 19:31 UTC (§9.1): **no** es el que decía el relevo en
> un punto —el despliegue servido es `6da9bcb`, no `da81663`— y la diferencia está explicada. La primera versión
> de esta sección (Etapa 3) exigía que todo el historial tuviera dos premios, comparaba recuentos y no tenía el
> cargador de producción: esta la sustituye entera.
>
> **Corregido el 2026-09-18, antes de la puerta 1 (I-145).** El comparador daba **CONTINUAR** con dos fotos
> locales presentadas como de producción y con la misma foto en los dos extremos. Las fotos son ahora
> `gate-snapshot/v2` y ningún veredicto sale sin comprobar su **procedencia** (§9.0). **Las fotos de la Etapa 4 no
> sirven para un veredicto:** son evidencia histórica, y en cada puerta se toman de nuevo.
>
> **Ejecutado el 2026-09-18/19**, con autorización expresa del dueño —adelantada por él de la franja de madrugada a
> ejecución inmediata, con todas las demás condiciones—: **puerta 1** ✅ (`0067`–`0072`, 23:57:52–23:58:31 UTC, respaldo
> validado, 44/44, CONTINUAR); **puerta 2** ✅ (los dos premios, 00:01:02–00:01:05 UTC, $1.000.000, conciliado); **puerta
> 3** ⚠️ **desplegada** (`318357c`, `dpl_Fn6UBZjA6vTPbjViHDaV6GGWuemE`) y en verde en vivo, en `verify:remote` y en la
> comparación, pero con el **CI en rojo por I-140**: no se dio por cerrada y **no se revirtió** (§9.8). Evidencia en
> `TEST_RESULTS` y `DEPLOYMENT` §2.2 y §3.2.l. Queda: la decisión del dueño sobre I-140 y los recorridos de §9.9.

Lo que se promueve: las migraciones **`0067`–`0072`** —el historial, sus correcciones, la cobertura, quién aparece
como vendedor para el personal, el inicio operativo que no se pliega y el permiso de `current_seller_org_ids()`
que no depende del privilegio por defecto (I-143)—; con su propia puerta, **los dos premios reconocidos por el
dueño** (H1), y con la suya, el código de las pantallas.

| Premio autorizado | Sorteo | Referencia | Boleta | Premio | Importe |
|---|---|---|---|---|---|
| 1 | Bogotá **2862** | 03/09/2026 | `3427 / 7702` | Premio diario | $500.000 |
| 2 | Cundinamarca **4820** | 14/09/2026 | `9019 / 3294` | Premio diario | $500.000 |

**$1.000.000 entre los dos.** Es la comprobación **del conjunto que se carga**, no del historial entero: el
historial puede tener otros premios legítimos —del motor configurable, o reconocidos en el futuro—, y otro
vendedor puede tenerlos. Los totales se **concilian**: los de antes, más el cambio esperado (§9.6).

### 9.0 El orden, las puertas y cómo se compara

| # | Puerta —se pregunta tal cual y se espera un «sí»— | Qué escribe | Estado |
|---|---|---|---|
| 0 | Comprobaciones de solo lectura del proyecto real | Nada | ✅ **Hecha el 2026-09-18** (§9.1). Se repite, como línea base, justo antes de cada puerta que escribe |
| 1 | «¿Autorizas aplicar en producción las migraciones `0067`–`0072`, con respaldo nuevo inmediatamente antes?» | Respaldo (§5.1), `db push` | ✅ **Hecha el 2026-09-18**, 23:57:52–23:58:31 UTC: respaldo validado en local, `verify:remote` 44/44, comparación CONTINUAR |
| 2 | «¿Autorizas reconocer en producción los dos premios confirmados, $1.000.000, con el cargador: vista previa y, si coincide, aplicar con su huella?» | 2 filas en `declared_prize_awards` y 1 en `audit_logs` | ✅ **Hecha el 2026-09-19**, 00:01:02–00:01:05 UTC: 2 reconocidos, $1.000.000, T1 conciliado |
| 3 | «¿Autorizas desplegar en producción el commit <SHA>?» | El despliegue | ⚠️ **Desplegada el 2026-09-19** (`318357ce…`, READY 00:04:55 UTC): en verde en vivo, 44/44 y CONTINUAR; **CI en rojo por I-140** → no cerrada, sin revertir |

**Por qué en este orden.** Las migraciones **antes que el código**: las pantallas llaman a funciones que solo
existen desde `0067`–`0072`, y con el código primero las cuatro superficies dirían «No pudimos cargar los premios
ganados». Al revés no hay riesgo: el código servido hoy no usa nada de lo nuevo (§9.3). La **carga antes que el
código**, para que la pantalla nazca con los dos premios; si el dueño prefiere verlos aparecer, las puertas 2 y 3
se pueden invertir sin más cambios.

**Las herramientas de la puerta, versionadas** (Etapa 4; antes vivían sin versionar en `build/e5/`). Todas leen en
**una transacción `repeatable read read only`** y guardan en `build/gate/`, que no se versiona:

| Herramienta | Para qué |
|---|---|
| `scripts/gate-snapshot.ts <etiqueta> --production --project-ref <REF>` | La **foto** (`gate-snapshot/v2`): su **procedencia** —una captura única, el proyecto con el que se conectó y, con `--base`, la captura y la huella de su base—, la estructura completa y una **huella por fila** de cada tabla de `public` —nunca su contenido; la clave de un cliente, en md5—, más los hechos: rifas, avisos por tipo, cifras de control, sincronizador, cron y recordatorios; y la **huella de la foto entera**. Ninguna credencial |
| `scripts/gate-compare.ts <antes> <después> --production --project-ref <REF> --operation none\|migrations\|awards` | La **comparación fila por fila** con la «Opción A» (abajo), **después** de comprobar la procedencia de las dos fotos (abajo). Termina en **0** con CONTINUAR, en **2** con DETENER y en **1** sin veredicto —una orden mal formada, fotos que no sirven o la conexión sin comprobar—. **Solo el 0 deja seguir** |
| `scripts/gate-compare.ts <a> <b> --structure-only [--save-delta <delta.json>]` | Solo la **estructura**, también entre producción y local y con fotos anteriores, para los **ensayos**. Dice **SIN VEREDICTO**, no se conecta y no admite destino, operación ni informe: **no autoriza continuar ninguna puerta** |
| `scripts/prize-awards-probe.ts <etiqueta> --production --project-ref <REF> --organization <ORG>` | La **sonda del historial**: las dos coincidencias campo por campo, el premio que resuelve el título, los premios que ya hay, las otras coincidencias vendidas del sistema de siempre, los totales esperados, la cobertura, la actividad y el sincronizador. Sin un dato de cliente |
| `scripts/gate-mirror-privileges.ts <foto de producción>` | **Solo local**: deja en la base local los privilegios de producción, para ensayar el delta de una migración (I-132, I-143). Es un insumo del ensayo y no da veredicto; en la puerta 1 se le pasa `p1-base`, recién tomada (§9.3) |

`<REF>` es la referencia de 20 letras del proyecto real (empieza por `zqwu`); `<ORG>` es
`ec88961d-7c81-4b27-ae03-d9bccc73eda6`. Las herramientas se niegan si `SUPABASE_DB_URL` no nombra ese proyecto, y el
cargador, si la URL de la API no es la suya. Antes de usar `<REF>` se confirma contra lo que sirve el dominio: la
cabecera `Content-Security-Policy` de `https://gestion-rifas.vercel.app/login` nombra un único proyecto, y tiene que
ser ese (§9.1).

**La procedencia de las fotos (I-145).** Una comparación que da veredicto comprueba esto **antes de mirar ninguna
diferencia, y aunque no haya ninguna**. Si algo falla, termina en **1**, sin veredicto, y **tampoco se sigue**:

| Comprobación | Por qué |
|---|---|
| Las dos fotos son `gate-snapshot/v2`, completas y con su huella intacta | Una foto anterior no dice de qué proyecto es. **No se reetiqueta**: es evidencia histórica, su estructura se puede comparar con `--structure-only`, y para una puerta se vuelve a tomar |
| Las dos son del **mismo destino** y del que se pidió: el mismo proyecto que `--project-ref` | Dos fotos locales no dicen nada de producción, ni dos de otro proyecto de este |
| Son **dos capturas distintas** y la de después es **posterior** | La misma foto dos veces, o al revés, no demuestra nada |
| Si la de después se tomó con `--base`, su base es **esa misma** foto de antes | Las huellas de las columnas nuevas se calcularon contra ella |
| La **conexión** con el proyecto pedido se comprueba, también sin filas que explicar | Una foto sola no basta para decir CONTINUAR de un proyecto al que la orden no puede conectarse |

**La «Opción A»: qué explica una fila distinta, y qué detiene.** Es la práctica que el dueño fijó en la Puerta 1 de
la Entrega 5, y **no se sustituye por recuentos**. El comparador la aplica fila por fila, con evidencia leída de la
base (identificadores, horas, relaciones y bitácora):

| La explica | Cómo la demuestra |
|---|---|
| **La operación autorizada** | `migrations`: las migraciones nuevas son exactamente las nombradas, el delta de estructura es exactamente el ensayado (§9.3) y las tablas nuevas nacen vacías. `awards`: cada fila nueva de `declared_prize_awards` es una de las entradas confirmadas, con su importe, su respaldo, sin actor y vigente, y hay **una** fila `prize_award.record` de esa carga. `none`: ninguna |
| **Una venta o una asignación de boleta** | Su bitácora `ticket.update` reconstruye la huella de la línea base y solo toca columnas de venta; con su cliente nuevo (`client.create`), su bitácora semántica y su aviso `team.sale` |
| **Un pago o su corrección** | Con su bitácora `payment.*`, asignaciones que suman el pago, saldo y estado derivados de sus boletas, movimientos de comisión de la misma transacción y su acumulado |
| **Un turno programado del sincronizador** | Una corrida que empieza en una hora de `vercel.json` —Hobby dispara en cualquier minuto de la hora—, con programaciones, observaciones, resultados, fotografías, enlaces del motor y avisos dentro de su ventana; o el candado tocado y libre en una de esas horas (un turno sin trabajo) |

**Todo lo demás DETIENE, y se reporta antes de seguir**: rifas, organizaciones, membresías, perfiles, configuración
de premios, transiciones, recordatorios y avisos al teléfono, cuentas de cobro, **crear o aprobar boletas**,
**editar clientes**, **marcar avisos como leídos**, filas borradas, estructura o migraciones distintas de las
autorizadas, relaciones que no cuadran o cualquier fila sin causa demostrable. **Nada se corrige en producción.**

> **Medido sobre producción, el 2026-09-18** (§9.1): en las 26 horas desde el cierre de la Entrega 5 el comparador
> explicó **534 filas** —19 ventas, 19 abonos, 3 turnos y uno sin trabajo— y habría detenido una puerta por **46
> boletas creadas por vendedores y aprobadas por el personal**, por la ampliación de los períodos de dos premios
> que hizo el Dueño y por dos ediciones de clientes. Esas actividades son **frecuentes** y no están en la lista:
> si ocurren durante una puerta, la detienen. **El dueño lo decidió el 2026-09-18: acepta que una puerta se detenga
> si ocurre actividad fuera de lo permitido.** Esa preferencia **no** autoriza a suspender cuentas, bloquear
> ventas, desactivar recordatorios ni modificar tareas programadas para evitarlo, y **no** se amplía la lista por
> analogía.

**Cuándo no.** Ni migraciones ni carga ni despliegue durante un turno del sincronizador (horas UTC **3, 4, 5, 6,
12, 13, 15 y 16**, en cualquier minuto), con un recordatorio activo que venza en la media hora siguiente, con
`lottery_sync_lock` tomado o con una corrida sin terminar. La franja más tranquila medida es **07:00–10:59 UTC
(02:00–05:59 en Bogotá)**: 0 a 4 filas de bitácora con actor en 14 días y ningún turno. Cada puerta vuelve a
mirarlo en su foto «antes».

#### 9.0.b Las pruebas que respaldan la promoción

Se conservan **tal como salieron**; ningún fallo conocido se presenta como aprobado:

| Etapa | Resultado |
|---|---|
| Etapa 3 (2026-09-18, `b96237e`) | `verify` exit 0 con **1.422/1.422** unitarias; `test:db` **1.347 aprobadas y 1 omitida** (la medición V5-01, que solo corre con `PREMIOS_EXPLAIN`); E2E completa **768/771**, con las **23** del historial aprobadas. Los 3 fallos son **I-075** (`back-navigation` `:25` y `:127`) e **I-090** (`ventas-por-fecha:163`, «recibido 54»), ajenos al historial; sus dos archivos solos, **27/27** (`TEST_RESULTS`, Etapa 3) |
| Etapa 4 (2026-09-18, preparación) | Línea base idéntica a la de la Etapa 3. Nuevas: la puerta del cargador y el resolvedor, **52** unitarias; las herramientas de puerta, **14**; el ensayo del cargador con el script de verdad, la sonda y el comparador, **11** de base. La E2E **no se repitió**: esta etapa no cambia ninguna pantalla, y su referencia sigue siendo la de la Etapa 3 con sus 3 fallos (`TEST_RESULTS`, Etapa 4) |
| Corrección I-145 (2026-09-18, antes de la puerta 1) | La procedencia de las fotos: **15** de base con las herramientas de verdad —**las 15 fallaban antes**— y **9** unitarias; `verify` **1.497/1.497** y `test:db` **1.373 y 1 omitida**. El ensayo de las seis migraciones, repetido con fotos nuevas: **el mismo delta, byte a byte**, y CONTINUAR. La E2E no se repitió (`TEST_RESULTS`, I-145) |

### 9.1 Estado real, comprobado en solo lectura (puerta 0, 2026-09-18, 19:14–19:31 UTC)

Evidencia completa en `TEST_RESULTS` (Etapa 4). Ningún dato de cliente salió de estas lecturas.

| Qué | Comprobado | Frente al relevo |
|---|---|---|
| **Proyecto** | La CSP que sirve el dominio nombra **un** proyecto, el de `.env.local` (`zqwu…`), y `SUPABASE_DB_URL` es de ese mismo proyecto | Igual |
| **Migraciones** | **`0001`–`0066`**, con los mismos nombres que el repositorio. Pendientes, por diferencia exacta: **`0067`, `0068`, `0069`, `0070`, `0071` y `0072`** | Igual |
| **Despliegue** | `dpl_CE4VvypDjs3nueph1g39Je9Lsya1`, **`6da9bcb`**, READY desde el 2026-09-17 20:33 UTC; el dominio sirve su identificador, **`c3d720898c56`** | ⚠️ **Distinto**: el relevo decía `da81663`. `6da9bcb` son dos commits **solo de documentación** encima (`git diff da81663 6da9bcb` fuera de `docs/`: vacío), así que el código servido es el mismo. Cambia el **punto de reversión** de la puerta 3 (§9.8) |
| **`verify:remote`** | **41 en verde y 3 en rojo, las esperadas**: la matriz de las 15 funciones del historial (todas «no existe»), el cuerpo de la cobertura (`0069`) y el inicio operativo (`0071`) | Igual |
| **Estructura en `0066`** | Idéntica a la de una base local en `0066` con los privilegios de producción: tablas, columnas, restricciones, índices, disparadores, políticas, las 225 funciones —cuerpo y ACL—, tipos, vistas, extensiones, cron y publicaciones. Solo difieren los 2 secretos del Vault (existen solo allí, D-193) y un esquema de la pila local | — |
| **Privilegios por defecto** (`postgres` en `public`) | Funciones: `service_role` con `EXECUTE` (I-132). Tablas: iguales que en local. Secuencias: `anon` y `authenticated` con `rwU` (en local, `w`). `0067`–`0072` no crean secuencias ni añaden columnas | — |
| **Fuera del historial** | **50 funciones** anteriores a los premios y `audit_logs_id_seq` tienen en producción privilegios que no tienen en local —la parte abierta de **I-132**, auditoría aparte—. No las toca esta promoción | — |
| **Las dos coincidencias** | Las dos existen, **una por entrada**: resultado `confirmed` sin número en conflicto (mayores `3427` y `9019`), programación `completed`, fotografía `sold` del **número diario** —el fotografiado es el de la boleta—, asignada antes del sorteo, **modo `legacy`**, **0 enlaces del motor**, la boleta sigue vendida al mismo cliente de la fotografía, y el mismo vendedor para las dos | Igual |
| **El premio que resuelve el título** | En la rifa `d64af684…` hay **un** «Premio diario» vigente —`9468104e-7548-4e43-8f1e-4a08f4563905`, versión 2 del 17/09 22:37 UTC, `fixed`, **$500.000**, diario, cuatro cifras— y ninguno archivado con ese nombre: la resolución es inequívoca | Igual |
| **El historial hoy** | **0** premios: `lottery_ticket_match_prizes` vacía y `declared_prize_awards` sin crear | Igual |
| **Otras coincidencias vendidas del sistema de siempre** | **Ninguna**: las dos del sistema de siempre son las de la tabla de arriba. Ninguna coincidencia no vendida | — |
| **Totales esperados tras la carga** | **2** premios, **2** clientes distintos, **$1.000.000**, **0** con valor pendiente (con los datos de hoy; se recalculan en la puerta 2) | — |
| **Cobertura** (definición de la `0069`) | **13** sorteos sin resultado confirmado, del **10/08** al **24/08** (I-133), y **21** confirmados del 25/08 al 17/09 | Igual (el 09/08 era domingo) |
| **Actividad desde el 17/09 22:00 UTC** | 10 ventas, 6 abonos, 5 clientes nuevos, 42 boletas creadas y aprobadas, y **un resultado**: Bogotá **2864** (17/09) = `0181`, por consenso de dos fuentes el 18/09 a las 05:02 UTC, **sin coincidencias** —el primer sorteo del lado configurable no produjo ningún premio (I-087)— | Actividad normal |
| **Sincronizador** | Últimos turnos: 04:00–06:00 UTC; el candado, libre desde las 16:57 UTC; ninguna corrida sin terminar | — |
| **Recordatorios** | 2 activos; vencen el 18/09 a las **21:15 UTC** y el 19/09 hacia las **23:00 UTC** (semanales) | — |

**Lo que solo se podrá comprobar después de la puerta 1:** la matriz de las 15 funciones en el proyecto real
(`verify:remote` **44/44**), los totales del historial con `prize_award_rows` —la definición única—, la cobertura con
esas mismas funciones y la **forma de la respuesta** de `record_declared_prize_awards` por la API del proyecto real
(la vista previa de la puerta 2 lo dice antes de escribir).

### 9.2 Respaldo

Respaldo lógico **nuevo, justo antes** de la puerta 1, por §5.1, en `Rifas-backups/<fecha>-antes-0067-0072/`:
`roles.sql`, `schema.sql` y `data.sql`, comprobando que **no** guarda identidades de Auth (0 nombres `"auth".`
cualificados, 0 `INSERT INTO "auth"`, 0 líneas con credenciales). Como en la Entrega 5, se **valida
restaurándolo en la base local** (§5.2) y comparando sus cifras con la foto «antes»; después, `db reset` y seed.
Un respaldo viejo no sirve.

### 9.3 Puerta 1 — las migraciones

**Antes, inmediatamente:**

1. **El delta esperado, regenerado** —el ensayo del «escenario B» con los privilegios de producción—:

   ```bash
   npx tsx scripts/gate-snapshot.ts p1-base --production --project-ref <REF>
   npx supabase db reset --local --version 0066
   npx tsx scripts/gate-mirror-privileges.ts build/gate/foto-p1-base-produccion-<instante>.json
   npx tsx scripts/gate-snapshot.ts p1-l0 --local
   npx tsx scripts/gate-compare.ts build/gate/foto-p1-base-produccion-<instante>.json build/gate/foto-p1-l0-local-<instante>.json --structure-only
   npx supabase migration up --local
   npx tsx scripts/gate-snapshot.ts p1-l1 --local --base build/gate/foto-p1-l0-local-<instante>.json
   npx tsx scripts/gate-compare.ts build/gate/foto-p1-l0-local-<instante>.json build/gate/foto-p1-l1-local-<instante>.json --structure-only --save-delta delta-esperado-0067-0072.json
   ```

   La comparación de producción con la base local en `0066` tiene que dar **solo** los 2 secretos del Vault y el
   esquema `supabase_functions` de la pila local. El delta tiene que ser el del 2026-09-18: **+1 tabla, +16
   columnas, +15 restricciones, +4 índices, +5 disparadores, +1 política y 1 modificada**
   (`lottery_ticket_matches.lottery_ticket_matches_select`, la corrección de I-137), **+15 funciones** y **+6
   migraciones**; nada quitado. Con los privilegios locales sale **idéntico**. Después, la base local vuelve a la
   normalidad: `npx supabase db reset`, reiniciar Kong, esperar a Auth y `npm run seed:local` (I-028).
2. **La ventana** (§9.0) y la **línea base**: `gate-snapshot.ts p1-antes`, `prize-awards-probe.ts p1-antes` y la
   comparación de `p1-base` → `p1-antes`, `--production --project-ref <REF> --operation none`: las dos son de hoy y
   `gate-snapshot/v2`; **las de la Etapa 4 no sirven para un veredicto** (I-145). Si dice DETENER, se reporta
   antes de seguir; si termina en 1, no hay veredicto y tampoco se sigue.
3. **El respaldo** (§9.2).

**La operación:**

```bash
npx supabase db push --dry-run --db-url "$SUPABASE_DB_URL"   # tiene que listar EXACTAMENTE 0067..0072, en orden
npx supabase db push --yes --db-url "$SUPABASE_DB_URL"
npx supabase migration list --db-url "$SUPABASE_DB_URL"        # 0001..0072 iguales en los dos entornos
```

**Después, inmediatamente:**

```bash
npm run verify:remote                                          # 44/44, las tres del historial incluidas
npx tsx scripts/gate-snapshot.ts p1-despues --production --project-ref <REF> --base build/gate/foto-p1-antes-produccion-<instante>.json
npx tsx scripts/gate-compare.ts build/gate/foto-p1-antes-produccion-<instante>.json build/gate/foto-p1-despues-produccion-<instante>.json \
  --production --project-ref <REF> --operation migrations --migrations 0067,0068,0069,0070,0071,0072 \
  --expected-delta build/gate/delta-esperado-0067-0072.json --report informe-p1.json
npx tsx scripts/prize-awards-probe.ts p1-despues --production --project-ref <REF> --organization <ORG>
```

Esperado: CONTINUAR; `declared_prize_awards` **vacía**; ninguna fila de negocio tocada por las migraciones —ensayado:
en local **no tocan ni una fila**—; y en la sonda, los objetos del historial presentes y los **totales de hoy (T0)**
leídos ya con `prize_award_rows`.

**Qué cambian para lo que YA está en producción**, y por qué es seguro con el código servido hoy. No es el caso de la
`0057` (`DEPLOYMENT` §3.3): la `0068` **estrecha** una política, pero el código servido solo la usa desde el portal
del vendedor, con un vendedor activo, que no pierde nada.

| Migración | Efecto sobre lo desplegado |
|---|---|
| `0067` | Tabla nueva y funciones nuevas: nadie las usa todavía. **Y el cerrojo de BR-I16**: los números de una boleta con coincidencias ya no se pueden cambiar; hoy son **dos** boletas, y el personal recibe el mensaje de la base si lo intenta |
| `0068` | Las políticas de `lottery_ticket_matches` y `declared_prize_awards` exigen **rol de vendedor activo** (I-137). Un vendedor activo no pierde nada; quien fue vendedor y hoy es del personal deja de leer esas fotografías, que es la corrección |
| `0069`, `0071` | Cuerpos de dos funciones nuevas. Nada más |
| `0070` | Una función nueva de lectura para el personal |
| `0072` | Repite el permiso de `current_seller_org_ids()` nombrando a `service_role` y **comprueba la matriz exacta de las 15 funciones del historial**: si en el proyecto real algo no cuadra, **falla y no deja nada**. Ese fallo no se arregla relajando la comprobación (I-143) |

**Si una falla**, `db push` se detiene en esa: las anteriores quedan aplicadas y cada una tiene su nota de reversión
al final. **No se improvisa ni se reintenta a ciegas**: `migration list` y una foto dicen qué quedó; se compara con
el delta esperado de las que sí entraron y se decide con el dueño. Revertir la `0068` **amplía** el acceso (vuelve
I-137) y no se hace sin decidirlo. Ninguna de las seis escribe datos de negocio: el respaldo es para una
recuperación que no debería hacer falta.

### 9.4 El cargador en modo de producción (hecho y probado en la Etapa 4)

`scripts/record-prize-awards.ts` y su puerta, `scripts/record-prize-awards-guard.ts`, que **reutiliza** las
comprobaciones de destino de la transición (`raffle-prize-transition-guard.ts`) y el resolvedor
(`supabase-target.ts`) en vez de copiarlos. **Un solo flujo para local y producción**; solo cambia el destino.

| Condición | Cómo |
|---|---|
| Destino explícito, uno solo | `--local` o `--production`, nunca los dos; con `--production`, el destino resuelto tiene que ser `https://….supabase.co` y **nunca** local —ni por la URL, ni por `SUPABASE_TARGET=local`— |
| El proyecto esperado | `--project-ref <REF>` obligatorio con `--production` —prohibido con `--local`— y el host resuelto tiene que ser **exactamente** `<REF>.supabase.co` |
| Organización escrita dos veces | `--organization` y `--confirm-organization`, **idénticas** carácter por carácter, también en la vista previa; y la organización tiene que existir en el destino |
| Vista previa por omisión | Sin `--apply` no escribe nada, contra cualquier destino |
| Aplicar exige una vista previa anterior | `--apply` solo con `--preview-hash`, **en los dos destinos**; el script repite la vista previa y exige la misma huella. La huella es SHA-256 de una representación estable —claves ordenadas, nulos explícitos— del destino y su proyecto, la organización, el respaldo, las entradas y **todo** lo que respondió la vista previa |
| Entradas y respuestas contrastadas | Las entradas se validan antes de tocar la red; cada informe de la base se contrasta con ellas fila por fila —números, lotería, fecha, premio, importe y número fotografiado—, y cualquier fila rechazada o discrepante impide aplicar |
| Una errata no es otra orden | Opciones desconocidas, repetidas, sin valor o contradictorias —`--preview-hash` sin `--apply`, `--project-ref` con `--local`— se rechazan |
| Lo que imprime | El destino por su etiqueta (`PRODUCCIÓN (proyecto zqwu…)`), la organización, las entradas y el informe de la base: números de boleta, sorteo, premio e importe. **Ni claves, ni la dirección del proyecto, ni un dato de cliente** |
| Nada que escribir | Si todas las entradas **ya estaban**, lo dice y termina en 0 **sin llamar a aplicar**: repetir no duplica ni añade bitácora |
| Cómo termina | **0** bien o nada que hacer · **1** no se escribió nada · **2** se escribió y lo almacenado no cuadra: se detiene · **3** respuesta incierta: no se repite a ciegas (§9.7) |

La autoridad sigue siendo `record_declared_prize_awards` (`0068`): entera o nada, idempotente, serializada por
organización y con el informe de **lo almacenado**. Probado así (`TESTING` §4.12):

| Prueba | Qué demuestra |
|---|---|
| `tests/unit/record-prize-awards-guard.test.ts` (52) | Todas las negativas de la puerta y del **resolvedor aislado** —`dotenv` simulado, sin red—, la huella estable y lo que la cambia, la lectura del informe y su contraste |
| `tests/db/record-prize-awards-script.test.ts` (11) | El **script de verdad** con `--local` contra la situación de producción reproducida: negativas desde fuera sin escribir (también `--production` contra una base local), vista previa sin escrituras, huella ajena, aplicación completa con $1.000.000, repetición sin duplicados ni bitácora, importe discrepante sin cambios, otra ejecución adelantándose entre dos vistas previas; la **sonda** validada antes y después, y el **comparador** con una carga autorizada, una venta y un abono reales (CONTINUAR) y con cambios prohibidos (DETENER) |

### 9.5 Puerta 2 — reconocer los dos premios

**Antes, inmediatamente:** la ventana, `gate-snapshot.ts p2-antes`, `prize-awards-probe.ts p2-antes` —que ya lee con
`prize_award_rows`: son los **totales T0** y los **esperados** de la carga— y la comparación de `p1-despues` →
`p2-antes`, `--operation none`. La sonda tiene que repetir §9.1: las dos coincidencias con los mismos campos, **0**
reconocidas, un único «Premio diario» vigente y, entre las coincidencias vendidas del sistema de siempre, las dos y
—si aparece alguna más— **identificada como pendiente**, sin reconocerla ni ponerle importe: eso exige confirmación
del dueño y autorización propia.

**La vista previa:**

```bash
npx tsx scripts/record-prize-awards.ts --production --project-ref <REF> --organization <ORG> --confirm-organization <ORG>
```

Salida esperada del informe —y ninguna otra—:

```
se reconocería  3427 / 7702    bogota 2026-09-03          Premio diario    $500.000
se reconocería  9019 / 3294    cundinamarca 2026-09-14    Premio diario    $500.000

Se reconocerían: 2 · Ya estaban: 0 · Rechazadas: 0
Dinero de estas entradas: $1.000.000

Huella de la vista previa: <64 caracteres hexadecimales>
```

Una fila `rechazado`, una discrepancia o una salida 1 **detienen la puerta**: la frase dice por qué y se resuelve
antes de volver a empezar. El mensaje de un importe distinto nombra las dos cifras con el separador de miles de la
base («$400,000», I-144).

**Aplicar**, con la huella que imprimió:

```bash
npx tsx scripts/record-prize-awards.ts --production --project-ref <REF> --organization <ORG> --confirm-organization <ORG> \
  --apply --preview-hash <HUELLA>
```

Esperado: `reconocido` en las dos filas, «Reconocidos ahora: 2 · Ya estaban: 0 · Rechazadas: 0», «Conciliación: 2
de 2 entradas almacenadas con su importe · $1.000.000» y salida **0**. Si entre la vista previa y aplicar cambió
algo, dice «La vista previa cambió desde la que revisaste» y no escribe nada: se vuelve a la vista previa.

**Después, inmediatamente:** `gate-snapshot.ts p2-despues`, la comparación `p2-antes` → `p2-despues` con
`--operation awards --organization <ORG>` —**CONTINUAR**: `declared_prize_awards` +2 y `audit_logs` +1 explicadas por
la carga; ni boletas, ni clientes, ni pagos, ni fotografías, ni enlaces, ni avisos por ella— y la sonda (§9.6).

### 9.6 Conciliación (después de la puerta 2, solo lectura)

La sonda `p2-despues` lo dice sin un dato de cliente, y tiene que dar:

| Qué | Esperado |
|---|---|
| Las dos coincidencias | `reconocidos_vigentes` **1** cada una; 0 anulados |
| Los dos registros | Vigentes, «Premio diario», **$500.000** cada uno, sin especie, en Bogotá 2862 y Cundinamarca 4820, con el respaldo del dueño y sin actor —«Sistema»— |
| Totales del historial (T1) | **Los de T0, más**: premios **+2**; dinero conocido **+$1.000.000**; con valor pendiente, **igual**; y clientes distintos **recalculados** —el valor que la sonda `p2-antes` dio como esperado, **no** T0 + 2—. Si entre T0 y T1 entró un premio del motor por un turno programado, se explica en la comparación y se suma a lo esperado |
| Lo que ya no está por reconocer | `entradas_por_reconocer` **0** |

Y, si hace falta mirarlo a mano, en `begin transaction read only`:

```sql
select d.declared_title, d.amount, d.in_kind_description, d.voided_at, d.recorded_by is null as sistema,
       s.lottery_code, s.reference_date, s.draw_number, t.daily_number, t.weekly_number
  from declared_prize_awards d
  join lottery_ticket_matches m on m.id = d.match_id
  join lottery_results r on r.id = m.result_id
  join lottery_draw_schedules s on s.id = r.schedule_id
  join tickets t on t.id = m.ticket_id
 where d.organization_id = '<ORG>';

select count(*) as premios, count(distinct client_id) as clientes,
       coalesce(sum(known_amount), 0) as dinero_conocido, count(*) filter (where value_pending) as con_valor_pendiente
  from prize_award_rows(array['<ORG>'::uuid], null, null, null, null, null);
```

### 9.7 Si la respuesta es incierta, parcial o discrepa

| Situación | Qué se hace |
|---|---|
| **El cargador termina en 3** (se cortó la conexión, un tiempo agotado) | **No se repite a ciegas.** Primero la sonda o la consulta de §9.6. Si las dos filas están, ya se aplicó. Si no hay ninguna, no se aplicó. Después, repetir la **vista previa**: si todo «ya estaba», el script lo dice y termina sin escribir; si no, se revisa la nueva huella antes de aplicar |
| **El cargador termina en 2** | Se escribió algo que no corresponde a lo pedido. **Se detiene todo** y se investiga con la sonda y la comparación; no se completa ni se corrige a mano |
| **Ejecución parcial** —una fila de dos— | No puede ocurrir por el cargador: es **entero o nada**, en una transacción. Si se ve, algo distinto escribió: se detiene todo y se investiga |
| **Importe discrepante** —«Ese premio ya está reconocido con … y la petición trae …»— | Hay un reconocimiento **vigente** con otro importe. **No se escribe nada** y no se edita el importe (es inmutable). Se confirma con el dueño cuál es el correcto; corregir exige **anular** el vigente —`voided_at`, `voided_by`, `void_reason`, lo único que los disparadores dejan cambiar— y volver a reconocer, con autorización expresa. Esa anulación hoy no tiene RPC ni pantalla (**I-136**) |
| **`db push` cortado o fallido** | `migration list` y una foto dicen qué entró; no se relanza sin comparar con el delta esperado (§9.3) |
| **El despliegue no llega a READY o su respuesta es incierta** | Se mira el estado del despliegue en Vercel antes de volver a empujar nada; un segundo empuje no arregla un primero dudoso |
| **La comparación dice DETENER** | Se reporta al dueño con su clasificación, antes de seguir. Nada se corrige en producción |
| **La comparación termina en 1, sin veredicto** | Las fotos no sirven —de otro destino o proyecto, de un formato anterior, incompletas, la misma captura, al revés o con otra base— o la conexión con el proyecto no se pudo comprobar (I-145). **No es un CONTINUAR**: no se sigue. Se corrige la orden o se vuelven a tomar las fotos; nada se toca en producción |

### 9.8 Puerta 3 — el despliegue

El commit candidato es el **HEAD de `feature/premios-configurables`** al cerrar la preparación (su SHA, en el reporte
de la Etapa 4 y en `HANDOFF` §1.a). Es un **avance rápido** desde `origin/main` (`6da9bcb`): 8 commits, sin fusión,
sin `force`, **sin cambios** en `package.json`, `package-lock.json`, `vercel.json`, `next.config.ts`, `.github/` ni
`.env.example`.

```bash
git fetch origin
git merge-base --is-ancestor origin/main <SHA>     # tiene que ser cierto: avance rápido
git push origin <SHA>:refs/heads/main              # nunca con --force
```

**Antes**: la ventana y la foto «antes» con `--operation none`. **Después**: CI en verde sobre `<SHA>`, Vercel READY,
el identificador de versión de `<SHA>` servido por el dominio (`DEPLOYMENT` §6.1), las cabeceras, las rutas
protegidas en 307, **0** secretos en lo servido, `verify:remote` **44/44** y la foto «después» con
`--operation none`, que tiene que dar CONTINUAR.

**Deshacer el código** es seguro: *Instant Rollback* al despliegue **`dpl_CE4VvypDjs3nueph1g39Je9Lsya1` (`6da9bcb`)**
—no al de `da81663`, que ya no es el vigente— (`DEPLOYMENT` §4.1). Las pantallas desaparecen y la base se queda como
está: el código anterior no usa nada de lo nuevo.

### 9.9 Después: qué se comprueba y con quién

`npm run verify:remote` **44/44**. Y los recorridos, **cada uno con la sesión de su dueño**: el agente no entra con
cuentas de otros ni escribe contraseñas (Fase 8); da los pasos, espera la confirmación y verifica en solo lectura.

| Quién | Qué tiene que ver |
|---|---|
| Dueño y Administrador | «Premios ganados» en el menú; los **totales T1** de §9.6 —con los datos de hoy, 2 premios, 2 clientes, $1.000.000 y 0 con valor pendiente—; el vendedor de cada premio; **ningún** nombre de cliente; y el aviso de cobertura con los sorteos del 10/08 al 24/08 (**I-133**) y los que falten entonces, «con el resultado sin confirmar o por verificar» |
| El vendedor de las dos boletas | Sus dos premios con el nombre de cada cliente; la ficha de cada cliente con «1 premio · $500.000 en dinero» y «Ver premios» |
| Otro vendedor | **Lo que le corresponda**: si no tiene premios, «Todavía no hay premios registrados»; si el motor le escribió alguno entre tanto, ese. Y el mismo aviso de cobertura |
| `anon` | `401` en las cinco lecturas y en la cobertura |

Y queda en observación lo que ya estaba: el **primer premio del motor configurable** (I-087: Bogotá 2864 del 17/09 no
produjo ninguna coincidencia) y el tramo del **10/08 al 24/08**, que sigue pendiente de información del dueño.

### 9.10 Recuperación sin perder el historial

| Qué falla | Cómo se vuelve, conservando lo escrito |
|---|---|
| El código | *Instant Rollback* a `dpl_CE4VvypDjs3nueph1g39Je9Lsya1` (§9.8). La base no se toca |
| Un reconocimiento equivocado | Se **anula** —nunca se borra— con motivo y autorización (§9.7); la fila anulada queda en el historial |
| Una migración | Su nota de reversión, **a mano**, con autorización y sabiendo qué amplía o qué deja sin usar; ninguna migración aplicada se edita |
| Lo demás | Restaurar el respaldo es el **último recurso** y exige autorización expresa (§5.2): borra toda la actividad posterior al respaldo |

### 9.11 Lo que NO se hace nunca

* **No** se reconocen premios del tramo 10/08–24/08: no hay fotografía que reconocer, y hacerlo exige una
  ampliación autorizada aparte (D-208).
* **No** se reconoce una coincidencia que el dueño no haya confirmado, ni se le pone un importe, ni un valor
  desconocido se convierte en cero.
* **No** se fabrica ninguna fotografía, **no** se escribe a mano en `declared_prize_awards` y **no** se borra
  nada: lo que sobra se anula.
* **No** se editan migraciones aplicadas ni se retiran las comprobaciones de `verify:remote` para que pasen.
* **No** se amplía la lista de actividad normal de la «Opción A» por analogía: una actividad nueva se le pregunta
  al dueño.
* **No** se lee el historial con la clave de servicio desde la aplicación.
* **No** se confirma el resultado de un sorteo antiguo sin evidencia oficial; y si un día se confirma uno del
  sistema de siempre con coincidencias vendidas, **su premio no aparece solo**: hay que reconocerlo (I-142).
