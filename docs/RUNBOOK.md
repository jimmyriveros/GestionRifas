# RUNBOOK — problemas frecuentes en producción

**Actualizado:** 2026-09-18 (§9 nueva: **el procedimiento de promoción del historial de premios ganados**, preparado en la Etapa 3 de D-208 y **no ejecutado** —`0067`–`0071`, el cargador de los dos premios reconocidos y el despliegue, en cuatro puertas—; antes, el 2026-09-17, §8.0 y §8.1: **la puerta 1 pasa a `0058`–`0066`** y a un commit nuevo; el primer intento, autorizado el 2026-09-17, **se suspendió antes de escribir** porque el preflight vio que el proyecto alojado concede EXECUTE a `service_role` en toda función nueva (I-132, D-207); antes, el 2026-09-16, §8.3: **la puerta 2 la hace el Dueño con su sesión**, desde Editar, y el agente solo verifica en modo lectura; el aviso de fechas llega también al Dueño —`0065`, D-206 corregida—, y el bloque SQL sin sesión queda descartado porque dejaba la bitácora a nombre de «Sistema»; antes, ese mismo día, §8: el procedimiento de producción con **tres puertas** —migraciones y despliegue, extender la fecha de fin con su aviso, y la transición— y lo que pasa con los sorteos que conservan el sistema de siempre, D-206; antes, ese mismo día, la transición preparada para la Entrega 5, D-204). Guía de diagnóstico rápido para quien opera la aplicación en
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

> ⚠️ **PREPARADO EN LA ETAPA 3 (2026-09-18), NO EJECUTADO.** Nada de esta sección se ejecuta sin
> autorización expresa, y **cada puerta se autoriza por separado**. Preparar el procedimiento no autoriza
> ejecutarlo. El estado de producción que se cita aquí es el que dejó documentado la Entrega 5 el
> **2026-09-17** —`0001`–`0066` aplicadas y `da81663` desplegado— y **no se ha vuelto a comprobar**: la
> Etapa 3 no leyó ni escribió nada en producción. La primera acción de la Etapa 4 es comprobarlo (§9.1).

Lo que se promueve: las migraciones **`0067`–`0071`** —el historial, sus correcciones, la cobertura, la
lectura de quién aparece como vendedor y el inicio operativo que no se pliega— y el código de las pantallas
`/seller/prizes`, `/owner/prizes` y los dos resúmenes de ficha; y, con su propia puerta, **los dos premios
reconocidos por el dueño** (H1): Bogotá 2862 del 03/09/2026, boleta `3427 / 7702`, y Cundinamarca 4820 del
14/09/2026, boleta `9019 / 3294`, **Premio diario de $500.000 cada uno, $1.000.000 entre los dos**.

### 9.0 El orden y las puertas

| # | Puerta —se pregunta tal cual y se espera un «sí»— | Qué escribe | Por qué en ese orden |
|---|---|---|---|
| 0 | «¿Autorizas las comprobaciones de solo lectura del proyecto real de §9.1?» | Nada | Lo que se sabe de producción es del 2026-09-17 |
| 1 | «¿Autorizas aplicar las migraciones `0067`–`0071` en producción, con respaldo previo?» | Respaldo (§5.1), `db push`, `verify:remote` | **Antes que el código**: las pantallas llaman a funciones que solo existen desde esas migraciones; con el código primero, las cuatro superficies mostrarían «No pudimos cargar los premios ganados». Al revés no hay riesgo: el código desplegado hoy no usa nada de lo nuevo (§9.3) |
| 2 | «¿Autorizas reconocer en producción los dos premios confirmados, $1.000.000, con el cargador: vista previa y, si coincide, aplicar?» | Dos filas en `declared_prize_awards` y una en `audit_logs` | **Después de las migraciones y antes del código**: así la pantalla nace con los dos premios, y si algo no cuadra se corrige antes de que nadie la vea. Exige preparar antes el cargador (§9.4) |
| 3 | «¿Autorizas desplegar el commit <SHA> en producción?» | El despliegue | Último: con la base lista y conciliada |

La Etapa 0 de D-208 proponía cargar **después** del despliegue; se cambia el orden porque la carga no depende
del código y cargar antes evita que la pantalla se vea sin los dos premios. Si el dueño prefiere verlos
aparecer, las puertas 2 y 3 se pueden invertir sin más cambios: el cargador no toca ninguna pantalla.

### 9.1 Comprobaciones de solo lectura (puerta 0)

En el editor SQL del proyecto real o con `SUPABASE_DB_URL`, `begin transaction read only`. Ningún dato de
cliente sale de aquí: solo recuentos, estados y los números de boleta que el dueño ya confirmó.

```sql
-- 1. Qué migraciones tiene: tiene que terminar en 0066 (si no, se detiene todo).
select version from supabase_migrations.schema_migrations order by version desc limit 3;

-- 2. Las dos coincidencias reales siguen ahí, vendidas, del sistema de siempre y sin premio.
select s.lottery_code, s.reference_date, t.daily_number, t.weekly_number,
       m.match_field, m.matched_number, m.assignment_status,
       raffle_prize_draw_mode(m.raffle_id, s) as modo,
       r.validation_status,
       (select count(*) from lottery_ticket_match_prizes lp where lp.match_id = m.id) as enlaces
  from lottery_ticket_matches m
  join lottery_results r on r.id = m.result_id
  join lottery_draw_schedules s on s.id = r.schedule_id
  join tickets t on t.id = m.ticket_id
 where (s.lottery_code, s.reference_date, t.daily_number, t.weekly_number) in
       (('bogota', date '2026-09-03', '3427', '7702'), ('cundinamarca', date '2026-09-14', '9019', '3294'));
-- Esperado: 2 filas, `sold`, `daily_number`, número fotografiado = el diario de la boleta,
-- modo `legacy`, `confirmed` y 0 enlaces. Cualquier otra cosa detiene la puerta 2.

-- 3. El premio que el cargador va a nombrar: UNO vigente llamado exactamente «Premio diario».
select p.id, v.title, p.status from raffle_prizes p
  join raffle_prize_versions v on v.id = p.current_version_id
 where p.raffle_id = '<RIFA>' and v.title = 'Premio diario';

-- 4. La fotografía de negocio para comparar después (mismo patrón que la 0049 y la 0057).
select (select count(*) from tickets) boletas, (select count(*) from clients) clientes,
       (select count(*) from payments) pagos, (select count(*) from audit_logs) bitacora,
       (select count(*) from lottery_ticket_matches) fotografias,
       (select count(*) from lottery_ticket_match_prizes) enlaces,
       (select count(*) from lottery_results where validation_status = 'conflict') conflictos;
```

Y fuera de la base: el despliegue vigente en Vercel tiene que ser `da81663`, y `npm run verify:remote` tiene que
dar **todo en verde salvo las tres comprobaciones del historial**, que están en rojo a propósito hasta la puerta 1:
la matriz de las 15 funciones (`0067`, `0068`, `0070`), el cuerpo de la cobertura (`0069`) y el inicio operativo
que no se pliega (`0071`).

### 9.2 Respaldo

Respaldo lógico nuevo **justo antes** de la puerta 1, por §5.1, en `Rifas-backups/<fecha>-antes-0067-0071/`,
comprobando que no guarda identidades de Auth. Uno viejo no sirve.

### 9.3 Las migraciones (puerta 1)

```bash
npx supabase db push --dry-run --db-url "$SUPABASE_DB_URL"   # tiene que listar EXACTAMENTE 0067..0071, en orden
npx supabase db push --yes --db-url "$SUPABASE_DB_URL"
npx supabase migration list --db-url "$SUPABASE_DB_URL"        # 0001..0071 iguales en los dos entornos
npm run verify:remote                                          # todo en verde, las tres del historial incluidas
```

Qué cambian para lo que YA está en producción, y por qué es seguro aplicarlas con el código de hoy. No es el caso de la `0057` (`DEPLOYMENT` §3.3): la `0068` **estrecha** una política, pero el código desplegado solo la usa desde el portal del vendedor, con un vendedor activo, que no pierde nada:

| Migración | Efecto sobre lo desplegado |
|---|---|
| `0067` | Tabla nueva y funciones nuevas: nadie las usa todavía. **Y el cerrojo de BR-I16**: los números de una boleta con coincidencias ya no se pueden cambiar; hoy son **dos** boletas, y el personal recibe el mensaje de la base si lo intenta |
| `0068` | Las políticas de `lottery_ticket_matches` y `declared_prize_awards` exigen **rol de vendedor activo** (I-137). Un vendedor activo no pierde nada; quien fue vendedor y hoy es del personal deja de leer esas fotografías, que es la corrección |
| `0069`, `0071` | Cuerpos de dos funciones nuevas. Nada más |
| `0070` | Una función nueva de lectura para el personal |

**Si una falla**, `db push` se detiene en esa: las anteriores quedan aplicadas y cada una tiene su nota de
reversión al final. **No se improvisa**: se lee el error, se compara con la migración y se decide. Revertir la
`0068` **amplía** el acceso (vuelve I-137) y no se hace sin decidirlo. Ninguna de las cinco escribe datos de
negocio: el respaldo es para una recuperación que no debería hacer falta.

### 9.4 Preparar el cargador para producción (antes de la puerta 2, en local)

Hoy `scripts/record-prize-awards.ts` **se niega sin `--local`**, a propósito, y **esa protección no se retira**:
se añade, en la Etapa 4 y con pruebas, un modo de producción con la misma puerta que la transición
(`scripts/raffle-prize-transition-guard.ts`, D-205):

| Condición | Cómo |
|---|---|
| Destino explícito | `--production` obligatorio; con él, el destino tiene que resolver al proyecto de `.env.local` y **no** a `127.0.0.1`; sin él, solo local |
| Organización escrita dos veces | `--organization <uuid>` y `--confirm-organization <uuid>`, iguales |
| Aplicar exige una vista previa | `--apply` solo con `--preview-hash <huella>`: la huella de la salida de una vista previa con **las mismas entradas y el mismo destino**, que el script recalcula |
| Nada se imprime que no deba | Ni claves, ni tokens, ni contraseñas; solo el destino por su etiqueta |
| La lista no cambia | Las dos entradas siguen en `src/features/prize-awards/declared.ts`, una sola vez |

Con sus pruebas unitarias —las negativas de la puerta, como `raffle-prize-transition-guard`— y el ensayo local
de punta a punta que ya hizo la Etapa 1, repetido con el modo nuevo contra la base local.

### 9.5 Vista previa y aplicación (puerta 2)

```bash
npx tsx scripts/record-prize-awards.ts --production --organization <ORG> --confirm-organization <ORG>
```

**Salida esperada de la vista previa** —y ninguna otra—:

```
se reconocería  3427 / 7702    bogota 2026-09-03         Premio diario    $500.000
se reconocería  9019 / 3294    cundinamarca 2026-09-14   Premio diario    $500.000
Premios: 2 de 2
Dinero reconocido: $1.000.000
```

Una fila `rechazado` **detiene la puerta**: su frase dice por qué (no hay coincidencia, el modo del sorteo, la
ambigüedad del título, el suelo del historial) y se resuelve antes de volver a empezar. Con la vista previa
correcta, se aplica con la huella que imprimió:

```bash
npx tsx scripts/record-prize-awards.ts --production --organization <ORG> --confirm-organization <ORG> \
  --apply --preview-hash <HUELLA>
```

Esperado: las dos filas en `reconocido`, **$1.000.000**, y el script termina en 0 (si el dinero no fuera
$1.000.000, termina en 1 y no se sigue).

**Cambio de datos esperado, y ninguno más:** `declared_prize_awards` +2 (vigentes, con `recorded_by` nulo
—«Sistema»— y el respaldo del dueño en `basis`) y `audit_logs` +1 (`prize_award.record`). Ni boletas, ni
clientes, ni pagos, ni fotografías, ni enlaces, ni avisos.

### 9.6 Conciliación (después de la puerta 2, solo lectura)

```sql
select d.declared_title, d.amount, d.in_kind_description, d.voided_at,
       s.lottery_code, s.reference_date, t.daily_number, t.weekly_number
  from declared_prize_awards d
  join lottery_ticket_matches m on m.id = d.match_id
  join lottery_results r on r.id = m.result_id
  join lottery_draw_schedules s on s.id = r.schedule_id
  join tickets t on t.id = m.ticket_id
 where d.organization_id = '<ORG>';
-- Esperado: 2 filas vigentes, «Premio diario», $500.000 cada una, sin especie, en los dos sorteos de arriba.

select count(*), sum(amount) from declared_prize_awards where organization_id = '<ORG>' and voided_at is null;
-- Esperado: 2 y 1000000.
```

Y la fotografía de negocio de §9.1 repetida: solo cambian la bitácora (+1) y `declared_prize_awards`.

### 9.7 Si la respuesta es incierta, parcial o discrepa

| Situación | Qué se hace |
|---|---|
| **Respuesta incierta** (se cortó la conexión, un tiempo agotado) | **No se repite a ciegas.** Primero la consulta de §9.6. Si las dos filas están, ya se aplicó. Si no hay ninguna, no se aplicó. Repetir con las mismas entradas es seguro —responde «ya estaba» y no duplica—, pero se hace después de mirar |
| **Ejecución parcial** —una fila de dos— | No puede ocurrir por el cargador: es **entero o nada**, en una transacción. Si se ve, algo distinto escribió: **se detiene todo** y se investiga; no se completa a mano |
| **Importe discrepante** —«Ese premio ya está reconocido con … y la petición trae …»— | Hay un reconocimiento **vigente** con otro importe. **No se escribe nada** y no se edita el importe (es inmutable). Se confirma con el dueño cuál es el correcto; corregir exige **anular** el vigente —`voided_at`, `voided_by`, `void_reason`, lo único que los disparadores dejan cambiar— y volver a reconocer, con autorización expresa. Esa anulación hoy no tiene RPC ni pantalla (**I-136**) |
| La vista previa rechaza una entrada | No se aplica nada. Se lee la frase del rechazo |

### 9.8 El despliegue (puerta 3)

Por el camino de siempre (`DEPLOYMENT` §3.3): el commit autorizado a `main`, CI en verde y Vercel en READY, con
las comprobaciones en vivo de las promociones anteriores —cabeceras, rutas protegidas en 307, `0` secretos en lo
servido y el identificador de versión nuevo—.

**Deshacer el código** es seguro: *Instant Rollback* de Vercel al despliegue anterior (`DEPLOYMENT` §4.1). Las pantallas desaparecen
y la base se queda como está; las funciones nuevas no las usa nadie más.

### 9.9 Después: qué se comprueba y con quién

`npm run verify:remote` **todo en verde**. Y los recorridos, **cada uno con la sesión de su dueño**: el agente
no entra con cuentas de otros ni escribe contraseñas (Fase 8); da los pasos, espera la confirmación y verifica
en solo lectura.

| Quién | Qué tiene que ver |
|---|---|
| Dueño y Administrador | «Premios ganados» en el menú; **2** premios, **2** clientes, **$1.000.000**, **0** con valor pendiente; el vendedor de cada uno; **ningún** nombre de cliente; el aviso de cobertura con los sorteos del 09/08 al 24/08 (**I-133**) y los que falten entonces, «con el resultado sin confirmar o por verificar» |
| El vendedor de las dos boletas | Sus dos premios con el nombre de cada cliente; la ficha de cada cliente con «1 premio · $500.000 en dinero» y «Ver premios» |
| Otro vendedor | «Todavía no hay premios registrados» y el mismo aviso de cobertura |
| `anon` | `401` en las cinco lecturas y en la cobertura |

Y queda en observación lo que ya estaba: el **primer sorteo configurable posterior al 17/09** (I-087), que
escribirá sus premios solo, y el tramo del **09/08 al 24/08**, que sigue pendiente de información del dueño.

### 9.10 Lo que NO se hace nunca

* **No** se reconocen premios del tramo 09/08–24/08: no hay fotografía que reconocer, y hacerlo exige una
  ampliación autorizada aparte (D-208).
* **No** se fabrica ninguna fotografía, **no** se escribe a mano en `declared_prize_awards` y **no** se borra
  nada: lo que sobra se anula.
* **No** se editan migraciones aplicadas ni se retiran las comprobaciones de `verify:remote` para que pasen.
* **No** se lee el historial con la clave de servicio desde la aplicación.
* **No** se confirma el resultado de un sorteo antiguo sin evidencia oficial; y si un día se confirma uno del
  sistema de siempre con coincidencias vendidas, **su premio no aparece solo**: hay que reconocerlo (I-142).
