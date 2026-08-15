# RUNBOOK — problemas frecuentes en producción

**Actualizado:** 2026-08-04 (Fase 8). Guía de diagnóstico rápido para quien opera la aplicación en
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
grep -c '"auth"' "<CARPETA-FUERA-DEL-REPO>/data.sql"   # debe imprimir 0
```

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
