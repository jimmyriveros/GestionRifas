# RUNBOOK — problemas frecuentes en producción

**Actualizado:** 2026-09-16 (§8: la transición de una rifa a premios configurables, preparada para la Entrega 5, D-204). Guía de diagnóstico rápido para quien opera la aplicación en
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

## 8. Transición de una rifa a premios configurables (Entrega 5, D-204)

> ⚠️ **Nada de esta sección se ejecuta sin autorización expresa.** Es el procedimiento que dejó
> preparado la Entrega 4 para convertir la rifa real. Hasta la Entrega 5, `scripts/raffle-prize-transition.ts`
> **se niega** a trabajar contra el proyecto real, y habilitarlo es cambiar esa única comprobación,
> revisada, dentro de la Entrega 5.

La transición pasa **una** rifa del sistema de premios de siempre a los **seis** premios confirmados
(`MASTER_SPEC` §9.7). Es **entera o nada**, no cambia el estado ni las fechas de la rifa, no toca
boletas, clientes, pagos ni coincidencias, y repetirla con la misma configuración no escribe nada.

### 8.1 Lo que hace falta antes

| Dato o condición | De dónde | Por qué |
|---|---|---|
| Migraciones `0058`–`0063` aplicadas y el código desplegado | Promoción de la Entrega 5 | La operación y el panel son de esas migraciones |
| Respaldo nuevo de la base | §5.1 | Antes de cualquier cambio sobre el proyecto real |
| Identificador de la **organización** | Consulta de solo lectura en el proyecto real | La base lo compara con el de la rifa |
| Identificador de la **rifa** | La misma consulta. **Nunca se elige por nombre** | Un nombre se repite o cambia |
| **Nombre exacto**, **estado** (`active`) y **fechas** de inicio y fin | La misma consulta | La base los compara letra por letra: un identificador pegado mal no convierte otra rifa |
| Que el **21 de diciembre** quede dentro de la rifa | Las fechas de arriba | Si termina antes, la base rechaza la transición. Cambiar la fecha de fin es una **decisión del dueño**, no del procedimiento |
| **Ningún sorteo** de la ventana jugado **sin resultado confirmado** | §8.2 | Si lo hay, la transición se niega (**I-127**) |

### 8.2 Comprobaciones de solo lectura

En el editor SQL del proyecto real, con `<RIFA>` y `<ORG>` sustituidos:

```sql
-- La rifa, tal como se va a esperar.
select id, organization_id, name, status, start_date, end_date, prize_mode
  from raffles where id = '<RIFA>' and organization_id = '<ORG>';

-- Que no haya ni transición ni premios anteriores (0 y 0).
select (select count(*) from raffle_prize_transitions where raffle_id = '<RIFA>') as transiciones,
       (select count(*) from raffle_prizes where raffle_id = '<RIFA>') as premios;

-- Los sorteos que la detendrían: tiene que devolver CERO filas.
select * from raffle_prize_transition_pending_draws(
  (select r from raffles r where r.id = '<RIFA>'), now());

-- Sorteos cancelados de aquí a diciembre: el script los salta, pero conviene verlos.
select reference_date, lottery_code from lottery_draw_schedules
 where schedule_status = 'cancelled' and reference_date between current_date and '2026-12-31';
```

Después, la **vista previa**, que ejecuta la transición entera y la deshace:

```bash
npx tsx scripts/raffle-prize-transition.ts <DESTINO> --organization <ORG> --raffle <RIFA> --name "<NOMBRE EXACTO>" --status active --start <AAAA-MM-DD> --end <AAAA-MM-DD>
```

Qué revisar en lo que imprime, línea por línea:

| Línea | Tiene que decir |
|---|---|
| «Primer sorteo pendiente» | El primer lunes a viernes y el primer sábado que **todavía no se jugaron** hoy |
| Estado | La rifa **activa**, «(no cambia)» |
| Premios | **Seis**, con los importes, números, cifras, calendarios y loterías de `MASTER_SPEC` §9.7. Ninguno semanal un lunes con Cundinamarca |
| Premio diario y de fin de semana | Terminan el **27** y el **28 de noviembre** |
| Aviso | Tantas personas como membresías activas tenga la organización |

### 8.3 Aplicar

La misma orden con `--apply`. Debe decir «La rifa pasó a premios configurables.» con el identificador
de la transición. Comprobación inmediata:

```sql
select prize_mode, status, start_date, end_date from raffles where id = '<RIFA>';           -- configurable, sin otro cambio
select count(*) from raffle_prizes where raffle_id = '<RIFA>' and status = 'active';       -- 6
select count(*) from raffle_prize_transitions where raffle_id = '<RIFA>';                  -- 1
select count(*) from audit_logs where entity_id = '<RIFA>' and action = 'raffle.prize_mode_transition'; -- 1
```

Y en la aplicación, con la cuenta del dueño: `/owner/raffles/<RIFA>/prizes` enseña los seis premios, y
la campana de un vendedor dice «Cambiaron los premios de … para los próximos sorteos: ahora tiene 6
premios.».

### 8.4 Si se niega

**Nunca queda nada a medias**: cualquier rechazo deshace todo.

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| «Hay N sorteos de la rifa sin resultado confirmado…» o «El sorteo de … ya se jugó y todavía no tiene el resultado confirmado» | **I-127**: la lista entera va debajo | Confirmar esos resultados por el camino de siempre, o **decisión del dueño**. No se relaja la comprobación |
| «Todavía no conocemos la hora oficial del sorteo de …» | Falta la programación oficial de un sorteo de una semana ya empezada | Esperar a que el sincronizador la publique y repetir |
| «La hora del sorteo de … ya pasó, así que el premio … no puede incluirlo» | Entre la vista previa y la aplicación se jugó un sorteo | Repetir el script: recalcula el primer sorteo pendiente |
| «Las fechas del premio … tienen que quedar dentro de las fechas de la rifa» | La rifa termina antes de algún premio | Decisión del dueño sobre las fechas de la rifa |
| «El sorteo del … está cancelado en la programación oficial…» o el script dice que un premio «ya no tiene ningún sorteo» | Un sorteo del calendario no se va a jugar, o la transición llegó tarde | Decisión del dueño |
| «La rifa con ese identificador se llama…», «La rifa está … y se esperaba…», «Las fechas de la rifa son…» | Los datos esperados no son los de la rifa | Revisar §8.1. **No** ajustar a ciegas hasta que coincida |
| «Esta rifa ya pasó a premios configurables con otra configuración» | Alguien ya la convirtió | Parar. Esta vía no cambia premios: eso es del panel |
| «Esta rifa tiene una transición registrada, pero sigue con el sistema de premios de siempre» o «… ya tiene premios guardados» | Un estado parcial escrito a mano | Parar e investigar. **No** se completa a ciegas |

### 8.5 Lo que NO se hace nunca

* **No** se desactiva `raffles_guard_prize_config` ni ningún disparador.
* **No** se escribe a mano en `raffle_prize_transitions`, ni se cambia `raffles.prize_mode` con un
  `UPDATE`.
* **No** se crean los premios con las RPC de la aplicación antes de la transición.
* **No** se ejecuta la transición dentro de un despliegue ni de una migración.
* **No** se reprocesan resultados anteriores: los sorteos que ya se jugaron quedan como los resolvió el
  sistema de siempre.
