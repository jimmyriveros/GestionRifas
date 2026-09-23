# DESPLIEGUE

**Actualizado:** 2026-09-19, más tarde (§3.2.n: D-210 **desplegado**, `9acbfa8` servido). Antes, ese mismo día (§2 y §2.2: `0073` y `0074` **aplicadas** a las 17:53 UTC; §3.2.m: `6401bd0`
**desplegado** a las 17:57 UTC y comprobado técnicamente; §3.2.l: el CI en rojo era I-140, ya corregida). Antes, ese
mismo día (§2.2: la promoción de `0073` y `0074` **autorizada**, y su reversión **comprobada** en
local con el código anterior; §4.1: antes de volver a un despliegue, comprobar que sabe leer los datos nuevos). Antes,
ese mismo día (§2: `0073` y `0074`, D-209, **solo en local**, con su orden de promoción) y 2026-08-09. Procedimiento de despliegue y reversión. Para el manual de
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
| Migraciones (**74** aplicadas, hasta `0074`, desde el 2026-09-19 a las 17:53 UTC; antes, **72** desde el 2026-09-18; esta fila decía «50» hasta entonces) | Aplicadas y verificadas con `npm run verify:remote`. La cifra se quedó en «21» durante varias promociones; se corrigió al aplicar `0040` (2026-08-31) y `0041` (2026-09-01, D-156), y se mantiene desde entonces: `0042` (09-01), `0043`+`0044` (09-02), `0045` (09-02), `0046` (09-03), `0047` (09-03, D-168) y **`0048` (09-05, D-169)**, esta última con la migración aplicada **antes** del despliegue. y **`0049` (09-05, D-170)**, también con la migración por delante del despliegue. **`0049` es la primera desde `0027` que ESCRIBE DATOS** —la carga inicial del paz y salvo—, y por eso se promovió con el procedimiento reforzado que conviene repetir en cualquier migración con sentencias de datos: sonda de **solo lectura antes** (boletas, asignadas, cuántas recibirán el cambio, distribución por estado y totales de ventas, abonos, pagos y comisiones), `db push --dry-run` comprobando que **solo** aparece la migración nueva, aplicarla **antes** del despliegue, y **repetir la misma sonda después comparando bloque a bloque**: cambiaron exactamente dos cosas, la bitácora (+750, una por boleta) y el número de migración |
| **`0050` aplicada el 2026-09-08** (D-176) | La invitación al grupo de WhatsApp. **Aditiva y sin una sola sentencia de datos**: tres columnas nuevas en `memberships` que nacen nulas o en `false`, tres CHECK y una RPC; no toca ninguna tabla, política, función ni restricción existente. Promovida con el procedimiento completo: respaldo en `Rifas-backups/2026-09-08-pre-0050/` (4,1 MB, 19 tablas, **0** identidades de Auth), sonda de solo lectura **antes**, `db push --dry-run` confirmando que **solo** aparecía `0050`, aplicación **antes** del despliegue y la **misma sonda después**. **Las 30 cifras de negocio salieron idénticas** —981 boletas, 540 clientes, 352 pagos, $32.780.000 abonados, 4.816 de bitácora— y lo único que se movió fue el número de migración, las tres columnas y la RPC. Comprobado además que `memberships_update_staff` **sigue siendo la única política de escritura**, que la RPC **no es ejecutable por `anon`** y que **0 filas** tienen algo escrito en las columnas nuevas |
| **`0073` y `0074`: APLICADAS el 2026-09-19** (D-209), de 17:53:21 a 17:53:39 UTC | Bre-B y «Otros» en las cuentas para recibir pagos, con autorización expresa del dueño y el procedimiento de §2.2; su código, `6401bd0`, desde las 17:57:44 UTC (§3.2.m). Van en ese orden y en dos archivos —un valor de enumerado no se usa en la transacción que lo añade (`55P04`)—, **antes** del código: el código desplegado funciona con la base nueva (medido) y el nuevo no funciona con la vieja. La `0074` no escribe datos: una columna nula, dos CHECK, un índice reconstruido, dos funciones y dos RPC con firma nueva, y se comprueba a sí misma. `verify:remote` tendrá **dos comprobaciones en rojo a propósito** hasta aplicarlas. Orden completo en §2.2 |
| **`0075`, `0076` y `0077`: PENDIENTES — se espera que NO estén en producción** (anotado el 2026-09-23, **sin consultar producción**) | Existen solo en la rama `feature/premios-configurables`: `origin/main` —la referencia local, del último `fetch`— es `9acbfa8` y trae `0001`–`0074`. `0075` y `0076` son el orden y la paginación en la base (D-213, D-214); `0077`, el código de rifa desde R1000 (D-220). **Es una expectativa documental, no una comprobación remota**: lo primero de la próxima publicación es confirmarlo en solo lectura (§3.3) |
| RLS, RPC, vistas, auditoría | Igual que en local **hasta `0074`**. Lo que añaden `0075`–`0077` solo existe en local |
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

#### Promocion del encargo de cobro — 2026-09-12 (Etapa 7, D-193)

**La base de produccion pasa de 50 a 55 migraciones.** Se aplicaron `0051`, `0052`, `0053`, `0054`
y **`0055`**, siguiendo los tres pasos de arriba y con respaldo previo en
`Rifas-backups/2026-09-12-antes-0051-0055/`.

**La `0055` la escribio esta misma etapa, y es el hallazgo de la promocion.** Una sonda de
extensiones comparo el proyecto real contra local **antes de empujar nada**:

| Extension | Local | Proyecto real (antes) |
|---|---|---|
| `pg_cron` 1.6.4 | instalada, en `pg_catalog` | **NO** — la crea la `0052` |
| `supabase_vault` 0.3.1 | instalada | instalada |
| **`pg_net` 0.20.4** | **instalada, en `extensions`** | **NO, y ninguna migracion la creaba** |

Sin ella, las cuatro migraciones se aplican **sin un solo error** —el cuerpo de una funcion
`plpgsql` no resuelve sus referencias al crearse— y el fallo sale **una vez por minuto** en
produccion: `schema "net" does not exist` cada vez que el cron `push-dispatch-wake` toca al
despachador. Sin que nada se vea roto por delante, porque la campana no depende de eso (BR-V01).
Es **I-112**, la familia de I-020 e I-078 por tercera vez.

**Comprobado despues de aplicar:**

| Que | Resultado |
|---|---|
| `npm run verify:remote` | ✅ **24/24 en verde** |
| Extensiones | `pg_cron 1.6.4 -> pg_catalog` · `pg_net 0.20.4 -> extensions` · 12 funciones en `net` — **identico a local** |
| Los tres `pg_cron` | `payment-reminders-due` (`* * * * *`), `push-dispatch-wake` (`* * * * *`) y `payment-reminders-cron-cleanup` (`17 8 * * *`), **los tres activos** |
| Primeras corridas | `payment-reminders-due` y `push-dispatch-wake`, **`succeeded`** — la prueba de que la `0055` era necesaria y suficiente |
| Sonda de negocio antes/despues | **Ni una cifra movida**: $98.080.000 vendidos, $34.160.000 cobrados, 5.078 filas de bitacora, 564 clientes, 1.074 boletas. Solo 5 tablas nuevas **vacias**, +27 funciones, +4 politicas, +16 indices |

#### Promoción de `0056` — 2026-09-13 (D-197)

**La base de producción pasa de 55 a 56 migraciones**, con autorización expresa del usuario y los tres
pasos de arriba, **antes** de subir el código que la usa (§3.2.i). Respaldo previo en
`Rifas-backups/2026-09-13-antes-0056/`.

| Qué | Resultado |
|---|---|
| Respaldo | `roles.sql`, `schema.sql` y `data.sql` (4,4 MB, un `INSERT` por cada una de las 24 tablas de `public`). **Ningún nombre `"auth".` cualificado.** La comprobación de siempre imprimió **1**, por la **columna** `auth` de `push_subscriptions`: corregida en `RUNBOOK` §5.1 |
| `db push --dry-run` | Solo `0056_seller_weekly_results_message.sql` |
| `db push --yes` | Aplicada de 23:41:30 a 23:41:45 UTC; `migration list`, con `0001`–`0056` iguales en los dos entornos |
| `npm run verify:remote` | ✅ **24/24 en verde**, con la función nueva entre las RPC de negocio |
| Sonda de negocio antes/después | **La parte de negocio, idéntica línea a línea**: $98.080.000 vendidos, $34.280.000 cobrados, 5.082 filas de bitácora, 564 clientes, 1.074 boletas y la **huella de las 7 filas de `memberships`** sin las dos columnas nuevas. Solo cambia el catálogo: +1 función, +2 restricciones y +2 columnas |
| Lo que dejó `0056` | Las dos columnas con sus valores por defecto (`false` y `null`), los dos CHECK y `set_seller_weekly_results_message(boolean, text)`, `SECURITY DEFINER` con `search_path=public, pg_temp` y **sin `EXECUTE` para `anon` ni para `PUBLIC`**. **0** membresías con mensaje propio |

#### Promoción de `0057` — 2026-09-15 (D-198)

**La base de producción pasa de 56 a 57 migraciones**, con autorización expresa del usuario y los tres
pasos de arriba, **justo antes** de subir el código que la usa (§3.2.j): `0057` y su código no funcionan
por separado (I-118). Respaldo previo en `Rifas-backups/2026-09-15-antes-0057/`.

| Qué | Resultado |
|---|---|
| Respaldo | `roles.sql` (370 B), `schema.sql` (412 KB) y `data.sql` (4,9 MB, 24 `INSERT`). **0** nombres `"auth".` cualificados, **0** `INSERT INTO "auth"` y **0** líneas con `encrypted_password`, `refresh_token` o `confirmation_token`; `admin_list_tickets` todavía no estaba en `schema.sql` |
| `db push --dry-run` | Solo `0057_admin_portfolio_privacy.sql` |
| `db push --yes` | Aplicada de 17:36:29 a 17:36:48 UTC; `migration list`, con `0001`–`0057` iguales en los dos entornos |
| `npm run verify:remote` | ✅ **27/27 en verde**, con las tres comprobaciones de D-198 |
| Sonda de negocio antes/después (`build/0057/`) | **Una sola diferencia, y no es de la migración**: un abono de $20.000 que un vendedor registró a las 17:36:03 —entre las dos pasadas y antes de aplicar—, con su pago, su asignación, su comisión y su fila de bitácora. Clientes, membresías, perfiles, coincidencias de loterías y la huella de los avisos **sin `sale_price`**, idénticos |
| Lo que dejó `0057` | +9 funciones —las siete `admin_*` con `SECURITY DEFINER`, `search_path` fijo y sin `EXECUTE` para `anon` ni `PUBLIC`, y las dos internas sin `EXECUTE` para `authenticated`—; −3 políticas del personal (`audit_logs_select_staff`, `payments_update_staff` y `tickets_update_staff`); +1 disparador; `void_payment` y las dos RPC de importación, sin `EXECUTE` para `authenticated`; y los **1.126** avisos `team.sale` del personal, sin `sale_price` |
| Sonda de comportamiento (identidad fijada como PostgREST, solo lectura) | ✅ El Dueño y el Administrador leen **0 filas** de las 8 tablas de la cartera; sus proyecciones traen exactamente sus claves y cuadran (1.171 de 1.171 boletas, 906 de 906 vendidas); buscar el nombre de un cliente real responde igual que uno inventado, y `partial` se rechaza. Un vendedor sigue leyendo sus boletas, clientes y pagos, y ninguna boleta ajena |
| Ventana | **~62 s** con la migración nueva y el código anterior (17:36:48 → 17:37:50 UTC). Ningún error de ejecución registrado |

#### Promoción de `0058`–`0066` — 2026-09-17 (Entrega 5, puerta 1 de `RUNBOOK` §8)

**La base de producción pasa de 57 a 66 migraciones**, con autorización expresa del dueño y los tres pasos de
arriba. Respaldo previo en `Rifas-backups/2026-09-17-antes-0058-0066/`, **validado restaurándolo en la base
local** (RUNBOOK §5.2): mismas cifras que la línea base.

| Qué | Resultado |
|---|---|
| Respaldo | `roles.sql` (370 B), `schema.sql` (429 KB) y `data.sql` (4,8 MB, 24 tablas). **0** nombres `"auth".` cualificados, **0** `INSERT INTO "auth"` y **0** líneas con credenciales |
| `db push --dry-run` | Exactamente `0058`–`0066`, en orden (13:58 y otra vez 14:03:50 UTC) |
| `db push --yes` | Aplicadas de **14:04:05 a 14:05:58 UTC**; `migration list` con `0001`–`0066` iguales en los dos entornos |
| `npm run verify:remote` | ✅ **41/41**, con las tres comprobaciones de la `0066` |
| Matriz de privilegios (D-207) | ✅ Las 62 funciones de premios con su `EXECUTE` exacto: seis RPC y `admin_audit_log` para `authenticated`; `transition_raffle_prize_mode`, `confirm_lottery_result` y `admin_audit_log` para `service_role`; las otras 53, nadie |
| Delta de estructura | **Idéntico al ensayado en local con los privilegios del proyecto alojado**: +6 tablas (vacías), +67 columnas, +67 restricciones (y 1 modificada), +20 índices, +15 disparadores, +5 políticas, +58 funciones (y 4 redefinidas) y +6 tipos |
| Datos | **Ninguna fila de negocio cambió**: las dos rifas quedaron en `legacy` con sus fechas, sin premios, sin transición y sin avisos nuevos |
| CI | ✅ 2/2 (run `35231507321`), incluido el job que aplica las 66 migraciones desde cero |

#### Promoción de `0067`–`0072` — 2026-09-18 (historial de premios ganados, puerta 1 de `RUNBOOK` §9)

**La base de producción pasa de 66 a 72 migraciones**, con autorización expresa del dueño —adelantada por él de la
franja de madrugada a ejecución inmediata—. Respaldo previo en `Rifas-backups/2026-09-18-antes-0067-0072/`,
**validado restaurándolo en la base local**: 30 tablas y 11.207 filas iguales a la foto `p1-antes`. Evidencia completa
en `TEST_RESULTS` («la promoción en producción»).

| Qué | Resultado |
|---|---|
| Respaldo (23:54:08–23:55:42 UTC) | `roles.sql` (370 B), `schema.sql` (594 KB) y `data.sql` (5,3 MB, 29 tablas con datos). **0** nombres `"auth".` cualificados, **0** `INSERT INTO "auth"` y **0** credenciales |
| Delta esperado | Regenerado con los privilegios de producción de ese momento: **idéntico byte a byte** al aprobado en la Etapa 4 |
| `db push --dry-run` | Exactamente `0067`–`0072`, en orden (23:57:36 UTC) |
| `db push --yes` | Aplicadas de **23:57:52 a 23:58:31 UTC**; `migration list` con `0001`–`0072` iguales en los dos entornos |
| `npm run verify:remote` | ✅ **44/44**, con las tres del historial que estaban en rojo a propósito |
| Comparación por fila (`--operation migrations`) | **CONTINUAR**: 0 diferencias con el delta ensayado, `declared_prize_awards` vacía, **ninguna fila de negocio tocada** |

#### `0073` y `0074` — Bre-B y «Otros» (D-209): **EJECUTADA el 2026-09-19**

**Resultado** (detalle, con horas, en `TEST_RESULTS` y en `build/gate/operacion-d209-2026-09-19.md`, que no se
versiona). La base de producción pasa de **72 a 74** migraciones:

| Qué | Resultado |
|---|---|
| Respaldo (17:49:13–17:51:02 UTC) | `Rifas-backups/2026-09-19-antes-0073-0074/`: `roles.sql` 370 B, `schema.sql` 639.640 B y `data.sql` 5.286.451 B (30 tablas con datos). **0** nombres `"auth".` cualificados, **0** `INSERT INTO "auth"`, **0** credenciales. **Validado restaurándolo en la base local**: 31 tablas y **11.231 filas iguales** a la foto tomada justo después |
| Delta esperado | Ensayado con los privilegios de producción de ese momento (55 sentencias): +1 columna, +1 restricción y 1 modificada, 1 índice modificado, +4 −2 funciones, 1 tipo modificado y +2 migraciones; `verify-remote` contra esa base local **46/46** |
| `db push --dry-run` | Exactamente `0073` y `0074`, en orden (17:53:07 UTC) |
| `db push --yes` | Aplicadas de **17:53:21 a 17:53:39 UTC**; la autocomprobación de la `0074` no abortó; `migration list` con `0001`–`0074` iguales en los dos entornos |
| `npm run verify:remote` | ✅ **46/46**, con las dos de D-209 que estaban en rojo a propósito |
| Comparación por fila (`--operation migrations`, con `--base`) | **CONTINUAR**: **0** diferencias con el delta ensayado, ninguna tabla nueva y **0 filas tocadas**; la Nequi que ya existía, con `identifier` nulo |
| Actividad durante la puerta | Tres ventas de boleta (17:47:52, 17:48:27 y 17:49:08) antes de aplicar, y otras dos y un pago antes y durante el despliegue: todas explicadas por la «Opción A» |

La tabla de abajo es el procedimiento tal como se autorizó y se siguió.

**Autorización expresa del dueño, el 2026-09-19, para una sola ejecución** y con las verificaciones previas cumplidas:
corregir I-140, integrar en `main` el candidato con el CI en verde, respaldo y comprobaciones de producción, aplicar
**exactamente** `0073` y `0074` y desplegar su código. **No** autoriza tocar datos del negocio, cargar premios, cambiar
rifas ni permisos de personas, ni promover otras migraciones. Sustituye a la nota anterior, que decía «preparada, no
autorizada». Lo que salió de cada paso, en `TEST_RESULTS` y `HANDOFF`. Las comprobaciones de «medido» de esta tabla se
hicieron **en la base local**.

| Paso | Qué | Por qué |
|---|---|---|
| 0 | **Autorización expresa**, con su franja | Escribe en producción. ✅ 2026-09-19 |
| 1 | **Solo lectura**: producción en `0001`–`0072`, el despliegue servido y fotos de puerta `gate-snapshot/v2` con su procedencia; **fuera** de las horas del sincronizador (UTC 3, 4, 5, 6, 12, 13, 15 y 16) y de un recordatorio que venza en la media hora siguiente | Partir del estado real, no del documentado (`RUNBOOK` §9 como referencia) |
| 2 | **Respaldo lógico validado** (`RUNBOOK` §5) | Plan Free sin copias automáticas (I-024) |
| 3 | **Ensayar el delta con los privilegios de producción** (`gate-mirror-privileges.ts` con esa foto) | Esperado: `create_…`/`update_seller_payment_account` con `postgres`, `authenticated` y `service_role`; `payment_account_identifier_trim`/`_problem` con `postgres` y `service_role`. Medido así en local, en el escenario B |
| 4 | **`db push --dry-run`**: exactamente `0073` y `0074` | Un valor de enumerado no se usa en la transacción que lo añade (`55P04`): dos archivos, dos transacciones |
| 5 | **`db push --yes`**, **antes** del código | El código desplegado funciona con la base nueva —medido: altas, ediciones, archivar, volver a usar y reordenar con la firma de la `0051`—; el nuevo con la vieja dejaría vacía la lista de cuentas. La `0074` se comprueba a sí misma y, si la matriz de EXECUTE no cuadra, **no deja nada** |
| 6 | **`npm run verify:remote`** | Sus dos comprobaciones de D-209 —«Cuentas de cobro: Bre-B, «Otros»…» y «Funciones de la regla del identificador…»— están **en rojo a propósito** hasta este paso |
| 7 | **Comparación por fila con `--base`** | La `0074` **añade una columna** a `seller_payment_accounts`, que es una tabla congelada para las puertas: con la línea base, ninguna fila existente puede cambiar. No escribe datos |
| 8 | **El código**: CI en verde **sobre el mismo SHA**, `main` por **avance rápido** —sin `force`—, **el** despliegue que dispara ese empuje —ninguno más— y la comprobación en vivo técnica. La comprobación **con la sesión del vendedor** es del dueño —el agente no inicia sesión—: una Bre-B con «@» y otra sin él, una «Otros» con ceros, un duplicado con su frase y el mensaje de un recordatorio | Lo que solo se ve con una sesión real |
| — | **Revertir** | Abajo: depende de si ya existen cuentas `breb` u `other` |

**La reversión, comprobada en local el 2026-09-19 —sin ejecutarla—.** El código anterior (`318357c`) **no sabe
enseñar** una cuenta Bre-B ni «Otros», así que volver a él no es una reversión completa en cuanto existe una. Medido
sirviendo `318357c` contra una base local en la `0074`, con una Nequi, una Bre-B y una «Otros» del mismo vendedor:

| Qué | Con el código anterior |
|---|---|
| «Cuentas para recibir pagos» | La Nequi, bien; la Bre-B y la «Otros» se leen **«· Ana Torres»**: sin forma y sin llave |
| El mensaje del recordatorio, el que lee el **cliente** | **«•  · Ana Torres»** por cada una: el cliente no ve a dónde pagar |
| Errores | Ninguno: las páginas responden 200 y la consola del navegador queda limpia |
| Editar una Bre-B con lo que manda el código anterior (`p_id`, titular y teléfono) | **La base lo rechaza** con «Escribe tu llave.» y la fila queda **idéntica**: la llave no se pierde. Archivar, volver a usar y ordenar son funciones de la `0051`, anteriores a la columna: no la nombran |

| Situación | Cómo se vuelve |
|---|---|
| **A. No existe ninguna cuenta `breb` ni `other`** —se comprueba justo antes, en solo lectura: `select count(*) from seller_payment_accounts where kind in ('breb', 'other')`— | *Instant Rollback* al despliegue **inmediatamente anterior**, el único que permite Hobby: `dpl_Fn6UBZjA6vTPbjViHDaV6GGWuemE` (`318357c`). **La base no se toca**: `0073` y `0074` se quedan, porque el código anterior funciona con ellas —altas, ediciones, archivar, volver a usar y ordenar, medido—. La pantalla del código anterior no ofrece esas dos formas, así que desde ella el recuento no crece |
| **B. Existe al menos una** | **No se vuelve a ciegas.** Se corrige **hacia delante**: un commit nuevo sobre el código de D-209, con su CI y su despliegue, que conserva las cuentas y sus llaves. Si un fallo obliga a detener la versión nueva antes de tener esa corrección, volver a `318357c` es **una decisión del dueño** con estas cifras delante: cuántas cuentas y de cuántos vendedores se verían sin llave —la misma consulta, agrupada por `seller_id`— y el aviso a esos vendedores de que no peguen el recordatorio hasta que vuelva la versión nueva. Las llaves siguen en la base y reaparecen enteras con ella |
| **Siempre** | **No** se borran cuentas ni llaves para poder volver; **no** se revierte la `0074` —su nota exige **cero** cuentas `breb` y `other`— y un valor de enumerado no se quita, así que la `0073` se queda siempre; **no** se restaura un respaldo sobre producción como respuesta automática a un fallo (`RUNBOOK` §5.2). Si la recuperación exige algo destructivo, se detiene y se consulta |

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
| `CRON_SECRET` | **Sensitive** | **Obligatoria para que el programador funcione.** La creas tú; Vercel **no** la genera al declarar `crons` (D-152). Vercel la envía como `Authorization: Bearer` en cada tick. Mínimo 16 caracteres. Cambiarla exige **redesplegar**: el valor viaja con el despliegue |
| `LOTTERY_SYNC_SECRET` | **Sensitive** | **Opcional.** El mismo secreto con otro nombre, para disparar el tick a mano (D-148). Si se pone, **tiene que ser idéntico** a `CRON_SECRET`: el handler prefiere esta y el cron envía la otra |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Plain | **Opcional, y es el interruptor de todo el canal.** La mitad pública del par VAPID. **Sin ella la tarjeta «Avisos en este dispositivo» ni se pinta** (D-190), así que la aplicación no ofrece nada que no pueda cumplir. Se genera con `npm run vapid` (D-193) |
| `VAPID_PRIVATE_KEY` | **Sensitive** | **Opcional, pero obligatoria si está la pública.** La otra mitad del **mismo** par. `check:env` avisa si hay pública sin privada, que es peor que no tener ninguna: la pantalla ofrece los avisos y el despachador no puede mandarlos |
| `VAPID_SUBJECT` | Plain | **Opcional.** El contacto que exige el RFC 8292 (`mailto:` o una URL). Si falta se usa `NEXT_PUBLIC_SITE_URL` |
| `PUSH_DISPATCH_SECRET` | **Sensitive** | **Opcional.** Protege `/api/push/dispatch`, que **falla cerrado** sin ella. Mínimo 16 caracteres; acepta `CRON_SECRET` como alternativa. **Tiene que ser idéntica al secreto `push_dispatch_secret` del Vault** (§3.1.d) |

`scripts/check-env.ts` (el `prebuild`) corta el build si falta alguna de las tres claves de Supabase.
Hoy no valida `NEXT_PUBLIC_SITE_URL`; comprobarla en Vercel sigue siendo un paso manual (I-049).
`LOTTERY_SYNC_SECRET` no entra en el prebuild: sin ella el Route Handler usa `CRON_SECRET` o responde 401.

### 3.1.d Los dos secretos del Vault de Supabase — tampoco los pone un agente (D-193)

Viven en la **base de datos**, no en Vercel, porque quien los lee es `wake_push_dispatcher()` desde
dentro de PostgreSQL. **Sin ellos la función no hace nada** —es su comportamiento por defecto y está
probado—, así que el sistema queda entero y callado hasta que se pongan.

En el SQL Editor del proyecto real, **una sola vez**:

```sql
select vault.create_secret('https://<dominio-real>/api/push/dispatch', 'push_dispatch_url');
select vault.create_secret('<el mismo valor de PUSH_DISPATCH_SECRET>', 'push_dispatch_secret');
```

⚠️ **El segundo tiene que ser idéntico al `PUSH_DISPATCH_SECRET` de Vercel.** Si no coinciden, el
toque llega al Route Handler y este responde **401**: el despachador no envía nada, y el síntoma es
exactamente el de I-083 con `CRON_SECRET` — todo parece bien y no pasa nada.

Comprobar que quedaron guardados, **sin imprimir su valor**:

```sql
select name, created_at from vault.secrets where name like 'push_dispatch%';
```

### 3.1.c Programador de loterías — activado (D-149, corregido en D-152)

`vercel.json` declara los **diez jobs diarios de Hobby** sobre `/api/lottery/sync`
(`src/features/lottery/cron-plan.ts`). Son válidos también en Pro. Un job `*/15`
rompería el despliegue en Hobby (I-082). Vercel envía `Authorization: Bearer` con
`CRON_SECRET`. El Route Handler no usa sesión. Fluid Compute se conserva.

> **Estado el 2026-09-01 (D-156):** `CRON_SECRET` **existe** en Production —comprobado con
> `vercel env ls production`, que muestra el nombre y nunca el valor— y `LOTTERY_SYNC_SECRET`
> **no existe**, así que el handler usa `CRON_SECRET`. El primer tick autorizado devolvió **200**.
> Los diez cron están **activos**: `vercel crons ls` los lista sin `(disabled)`.

**`CRON_SECRET` no aparece sola.** D-149 supuso que Vercel la inyectaba al declarar `crons`, y no
es así: hay que crearla en Settings → Environment Variables (scope Production, tipo Sensitive) y
**redesplegar**, porque el valor se resuelve en el despliegue. Del 2026-08-30 al 2026-09-01 los diez
jobs corrieron a diario **contra un 401**: ni un solo tick entró (I-083).

**Cómo se comprueba, y cómo se pausa.** `vercel crons ls` lista los jobs —y dice `(disabled)`
cuando están pausados—; el panel de Vercel los desactiva y los vuelve a activar en
Settings → Cron Jobs sin tocar `vercel.json`. **El CLI no puede activarlos ni desactivarlos**: sus
subcomandos son `add`, `list` y `run`, y `run` se niega mientras estén pausados. Con ellos activos,
`vercel crons run /api/lottery/sync` dispara **un** tick inmediato: lo invoca Vercel, que pone su
propio `Authorization: Bearer`, así que es la forma de probar el programador **sin ver ni descargar
el secreto** (D-156). **No** se pausan con
`POST /v1/projects/{id}/pause`: eso bloquea el despliegue de producción entero y tumba la
aplicación para los usuarios. Los ticks se leen en los registros de ejecución filtrando por
`/api/lottery/sync`; un 401 significa secreto ausente o distinto.

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

### 3.2.b Release del sistema de diseño y del panel del vendedor — 2026-09-08

**El despliegue más grande desde la Fase 9, y el que menos tocó la base de datos: nada.**

| Dato | Valor |
|---|---|
| Commit desplegado | **`a56e4088bc7e0202482dd9f1cff6be47174c7e77`** |
| Commit anterior en producción | `124445b941f0b7fec5fe0e587de25a632e58a82c` |
| Rama de origen | `design-system/migration` |
| Integración | **fast-forward** — `main` era ancestro directo; sin merge, sin conflictos, sin reescritura, **43 commits** conservados |
| Despliegue Vercel | `dpl_E4No3eMgdYcE2XwcquF2VcopcGwn` — READY en 43 s |
| Despliegue anterior (**punto de reversión**) | `dpl_4aa83tLbCtT25caU4EEQQ9yfbLtk` |
| **Migraciones** | **NINGUNA.** `supabase/` y `scripts/` son **byte a byte idénticos** a producción. Siguen siendo 49, hasta `0049` |
| Variables de entorno nuevas | **ninguna** — `.env.example` sin cambios y **cero** `process.env` nuevos en el diff |
| Dependencias | **sin cambios** — `package.json` y `package-lock.json` intactos |

**Qué entró:** 140 archivos, +12.063/−1.449. El sistema de diseño completo (tokens, tipografía
semántica, 39 componentes compartidos), la adopción por producto —boletas, reportes, pagos, personas,
catálogo—, el rediseño del panel del vendedor (D-171 → D-175) y el arreglo de raíz de `cn` (I-099).

**Validación previa:** `verify` en verde (typecheck, lint 0 errores, **815/815** unitarias, build),
`test:db` **812/812**, E2E **escritorio 417/419** y **móvil 125/125** sobre servidor y base recién
creados. Los 2 fallos son el par **I-090** ya documentado. **CI 2/2** sobre el commit desplegado,
incluido el job que aplica las 49 migraciones **desde cero**.

**Verificación en vivo:** identificador de versión **`0d41e7dfdecc`** servido por el dominio y el
anterior (`fa0953a48609`) **desaparecido**; 19 rutas comprobadas (públicas 200, protegidas 307,
**ningún 5xx**); 7/7 cabeceras de seguridad; **0 secretos** en 1.074 KB servidos; la CSS servida trae
los roles tipográficos, los roles de dato y **59 reglas `.dark`**; claro y oscuro correctos y **0
desbordamiento horizontal** a 1360 y a 375; **0 errores de ejecución** en Vercel tras el despliegue.

> **Lo que este release NO verificó, y hay que decirlo:** las pantallas **autenticadas** en
> producción. Comprobarlas exige iniciar sesión con una cuenta real y **un agente no introduce
> contraseñas**. La evidencia de que el código nuevo está servido es el SHA desplegado, el CI en verde
> sobre ese mismo commit y el identificador de versión encontrado en el JavaScript del dominio — que
> es exactamente lo que admite §6.1. La revisión visual autenticada queda para una persona.

### 3.2.c Release del panel administrativo — 2026-09-09

**Cuatro commits juntos, y la base de datos sin tocar.**

| Dato | Valor |
|---|---|
| Commit desplegado | **`523b4bcf1eddc827ed555d50611b6cda43849f29`** |
| Commit anterior en producción | `6b76e34e95a8adbe01335eb9b10f55e66b909005` |
| Integración | **fast-forward** — `main` estaba 4 commits por delante y nada en producción faltaba en local; sin merge, sin reescritura, sin force |
| Commits | `23063bf` (etapa 1), `3f653b7` (etapa 2), `ba8cdf8` (etapa 3), `523b4bc` (documentación) |
| Despliegue Vercel | `dpl_21taEfbycPDNwcpQ6aDtuRwoEix1` — READY en **30 s**, `aliasError: null` |
| Despliegue anterior (**punto de reversión**) | `dpl_4zMYWup2V5PPRt9MWZAbZgxgKpN2` |
| **Migraciones** | **NINGUNA.** `supabase/` y `scripts/` con **0 líneas de diferencia**. Siguen siendo 50, hasta `0050` |
| Variables de entorno nuevas | **ninguna** — `.env.example` sin cambios y **cero** `process.env` nuevos en el diff |
| Dependencias y configuración | **sin cambios** — `package.json`, `package-lock.json`, `next.config.ts`, `vercel.json`, `tsconfig.json` y `.github/` con 0 líneas de diferencia |

**Qué entró:** 15 archivos, +1.086/−477 — 10 de producto y pruebas, 5 de documentación. El rediseño del
panel del dueño en tres etapas (D-182, D-183): el dinero pasa de cuarto a primero, absorbe el reparto por
estado de pago —la **misma** pieza que el vendedor— y «Resumen por vendedor» e «Inventario» comparten fila
en 7/5 desde `lg`. Se retira `recentTickets` **y su consulta**.

**Validación previa:** `verify` en verde (typecheck, lint 0 errores, **857/857** unitarias, build) y E2E
**escritorio 445** y **móvil 130/130** — los 2 fallos son el par **I-090** ya documentado. **CI 2/2** sobre
el commit desplegado, incluido el job que aplica las 50 migraciones **desde cero**. `verify:remote` **17/17**.

**Verificación en vivo:** identificador de versión **`0a985f866b45`** servido por el dominio (1 de 15
fragmentos) y el anterior (`389ba2cda690`) **desaparecido**; `/login` y `/offline` en 200, **15 rutas
protegidas en 307**, el cron sin secreto en 401, un catálogo inexistente en 404 y **ningún 5xx**; **7/7**
cabeceras de seguridad; **0 secretos** en 975 KB servidos; **59 reglas `.dark`** en la CSS servida, claro y
oscuro correctos y **0 desbordamiento horizontal** a 375 px; **0 errores de ejecución** tras el despliegue.

**La base de producción no se tocó, y se comprobó:** la sonda de solo lectura da **50 migraciones, última
`0050`** — la misma de antes. Las cifras de negocio (1.034 boletas, 554 clientes, 364 pagos, $33.430.000
abonados, 4.974 de bitácora) son **mayores** que las del despliegue anterior porque hay **actividad real de
personas usando la aplicación**, no por efecto de este despliegue, que no escribe ni una fila.

> **Lo que este release NO verificó:** el panel rediseñado **en vivo**. Vive tras el inicio de sesión y **un
> agente no introduce contraseñas**, así que la evidencia de que el código nuevo está servido es el SHA
> desplegado, el CI en verde sobre ese commit y el identificador de versión encontrado en el JavaScript del
> dominio — exactamente lo que admite §6.1. La revisión visual autenticada queda para una persona.

### 3.2.d Release de la máscara del teléfono — 2026-09-10

**Dos commits juntos, sin migración, y con una sonda de los teléfonos reales antes y después.**

| Dato | Valor |
|---|---|
| Commit desplegado | **`99006355b70ed784c52310cf8982fcec306203cc`** |
| Commit anterior en producción | `30c7b05b8a528379df5a093dd34bae3743844853` |
| Integración | **fast-forward** — `main` estaba 2 commits por delante y nada de producción faltaba en local; sin merge, sin reescritura, sin force |
| Commits | `95dcf0c` (la máscara, D-184) y `9900635` (pruebas de «no reescribir» y de pegar, y documentación) |
| Despliegue Vercel | `dpl_AfSADmrRTSeH8t5ccDcxUn5hn9UE` — READY en **35 s**, `aliasError: null` |
| Despliegue anterior (**punto de reversión**) | `dpl_7VQE96REXpuSL1xVd5i6TAeJjJgK` (`30c7b05`) |
| **Migraciones** | **NINGUNA.** `supabase/` y `scripts/` con **0 archivos de diferencia**. Siguen siendo 50, hasta `0050` |
| Variables de entorno nuevas | **ninguna** — `.env.example` sin cambios y **cero** `process.env` nuevos en el diff |
| Dependencias y configuración | **sin cambios** — `package.json`, `package-lock.json`, `next.config.ts`, `vercel.json`, `tsconfig.json` y `.github/` sin tocar |

**Qué entró:** 23 archivos, +2.173/−27 — el campo `PhoneInput` y `lib/phone.ts` con sus tres
consumidores, **39** pruebas unitarias y **34** E2E nuevas, y la documentación. **Ninguna fila de la
base cambia**: la máscara solo decide cómo se ve el campo.

**Validación previa:** `verify` en verde (typecheck, lint 0 errores, **896/896** unitarias, build),
`test:db` **827/827**, E2E dirigidas **46/46** el 2026-09-10 y suite completa **597/599** el
2026-09-09 —los 2 son **I-090** e **I-106**, preexistentes y verdes en aislamiento—. `verify:remote`
**17/17**. **2/2** en verde en el CI (run 34483170884), incluido el job que aplica las 50 migraciones desde cero.

**La sonda de los teléfonos reales**, de solo lectura y solo con recuentos, **antes y después**: 558
de clientes y 7 de usuarios, **0 con espacios en los bordes** —lo único que el `trim` de siempre
cambiaría al guardar sin tocar— y las mismas cifras por forma en las dos pasadas. Detalle en
`TEST_RESULTS.md`.

**Verificación en vivo:** identificador de versión **`4bf03d43cdd6`** servido por el dominio (1 de 15
fragmentos) y el anterior (`2e75301adecf`) **desaparecido**; `/login`, `/offline`, `/sw.js` y
`/manifest.webmanifest` en 200, `/` y **15 rutas protegidas en 307**, el cron sin secreto en 401, un
catálogo inexistente en 404 y **ningún 5xx**; **7/7** cabeceras de seguridad; **0 secretos** en 962 KB
servidos; **0 errores de ejecución** en la hora siguiente al despliegue.

> **Lo que este release NO verificó:** el campo **en vivo**. Vive tras el inicio de sesión y **un
> agente no introduce contraseñas**, así que la evidencia es el identificador del build servido, el CI
> sobre ese commit y las pruebas locales. La revisión con una cuenta real —y en un teléfono de verdad,
> cuyo teclado no reproduce Chromium— queda para una persona.

### 3.2.e Release de «Resultados de la semana» y de la disposición de recordatorios — 2026-09-13

**Dos commits juntos y sin migración.**

| Dato | Valor |
|---|---|
| Commit desplegado | **`a929e23b6846215ab01dc8797a07ed11443acef7`** |
| Commit anterior en producción | `53f193059aa17d41a311c4a854f1848a356590fc` |
| Integración | **fast-forward** — la rama estaba 2 commits por delante de `main` y nada de producción faltaba en local; sin merge, sin reescritura, sin force |
| Commits | `a3b7953` (disposición de «Recordatorios de pago», I-113) y `a929e23` («Resultados de la semana», D-194 y D-195) |
| Despliegue Vercel | `dpl_GqmtKzfL6GAWYKtyYHYJSNbWmTDS` — READY en **39 s**, `aliasError: null` |
| Despliegue anterior (**punto de reversión**) | `dpl_HoVD8rW9qm9YAk63NKU5XRTvtMmp` (`53f1930`) |
| **Migraciones** | **NINGUNA.** `supabase/` sin diferencias. Siguen siendo 55, hasta `0055` |
| Variables de entorno nuevas | **ninguna** — `check:env` del build sin un solo aviso |
| Dependencias y configuración | `package.json`, `package-lock.json`, `vercel.json` y `.github/` sin tocar. **`next.config.ts` cambia**: `outputFileTracingIncludes` mete el fondo y las tres fuentes en el paquete de `/api/weekly-results/image` |

**Qué entró:** la sección «Resultados de la semana» con su ruta de imagen (`ImageResponse`,
1080 × 1350), el fondo en JPEG, tres pesos de Geist con su licencia, **109** pruebas nuevas —75
unitarias, 10 de base de datos y 24 E2E— y la disposición de «Recordatorios de pago».

**Validación previa:** `verify` en verde (**1.079/1.079** unitarias), `test:db` **992/992** y suite E2E
completa **670/674** —los 4 son **I-090** e **I-106**, preexistentes y verdes en aislamiento—. CI:
✅ **2/2** (run 34769729323), incluido el job que aplica las 55 migraciones desde cero.

**Verificación en vivo:** identificador **`a2a604d89b3e`** servido (1 de 15 fragmentos) y el anterior
(`f01b6a137cdc`) **desaparecido**; `/login`, `/offline`, `/sw.js` y `/manifest.webmanifest` en 200; `/` y
**14 rutas protegidas en 307**, incluida la sección nueva; `/api/weekly-results/image` en 307 **sin
entregar ningún PNG**; el cron sin secreto en 401; un catálogo inexistente en 404; **ningún 5xx**;
**7/7** cabeceras; **0 secretos** en 944 KB; 0 errores de ejecución en los 5 minutos siguientes al despliegue (16:50–16:55 UTC).

> **Lo que este release NO verificó:** que la ruta **genere el PNG en Vercel**. Vive tras el inicio de
> sesión y un agente no introduce contraseñas. La evidencia es el build de producción local contra la
> base local —con un trazado que incluye el fondo, las fuentes y el WebAssembly—, el CI y el
> identificador servido. **La primera persona que abra la sección en producción es la prueba real**:
> si faltara un archivo en el paquete, la vista previa diría «No pudimos preparar la imagen» y el
> resto de la pantalla seguiría funcionando.
### 3.2.f Release del ajuste visual de la imagen semanal — 2026-09-13

**Un commit, sin migración y solo en el PNG.**

| Dato | Valor |
|---|---|
| Commit desplegado | **`1a6b4af5c76a1d361b6f45a4669a49b1318d50a0`** |
| Commit anterior en producción | `20e954e944f048cd6b6c6239f1f379251118f1c5` |
| Integración | **fast-forward** `20e954e..1a6b4af` — sin merge, sin reescritura, sin force |
| Despliegue Vercel | `dpl_3pJj2LiMoXksZ82BM3qyCzf4fQL6` — READY en **24,5 s**, `aliasError: null` |
| Despliegue anterior (**punto de reversión**) | `dpl_4m2nLYgEBH6nuXwAeaDKhVDsB1jT` (`20e954e`) |
| **Migraciones** | **NINGUNA.** Siguen siendo 55, hasta `0055` |
| Variables de entorno, dependencias y configuración | **Sin cambios** — ni `package.json`, ni `vercel.json`, ni `next.config.ts`, ni `.github/` |

**Qué entró:** en la imagen de «Resultados de la semana», Cundinamarca se escribe **«CUNDI.»** y los
cinco nombres de las tarjetas diarias pasan de 19 a **24,7 px** (+30 %). `LOTTERY_LABELS`, la pantalla
y el mensaje no cambian.

**Validación previa:** `verify` en verde (**1.082/1.082** unitarias), las suites de «Resultados de la
semana» **78/78** y un PNG de prueba **idéntico píxel a píxel**, fuera de los cinco nombres, a la imagen
que generaba producción. CI: ✅ **2/2** (run 34772443344), incluido el job que aplica las 55 migraciones desde cero.

**Verificación en vivo:** identificador **`47d2fbf601ec`** servido (1 de 15 fragmentos) y el anterior (`4256c8fdc70e`) **desaparecido**; **23/23** rutas como se esperaba —la sección y la ruta de la imagen en 307 sin sesión, sin entregar ningún PNG—; **7/7** cabeceras con CSP por nonce; **0 secretos** en 944 KB; **ningún 5xx**; **0 errores de ejecución** en los 5 minutos siguientes al despliegue.

> **Lo que este release NO verificó:** la imagen nueva **en vivo**, que vive tras el inicio de sesión.
> La anterior sí se generó en producción —la compartió el usuario—, y este cambio solo toca el árbol del
> PNG, sin archivos, rutas ni configuración nuevos. Descargarla una vez con una cuenta de vendedor lo
> confirma.
### 3.2.g Release del reintento del catálogo público — 2026-09-13

**Un commit, sin migración: el arreglo de I-114.**

| Dato | Valor |
|---|---|
| Commit desplegado | **`8767f9e40fbb20ec1367ff8614033cbe684c1a85`** |
| Commit anterior en producción | `389ba89c4cf2607d5655330757eb060dc00337a8` |
| Integración | **fast-forward** `389ba89..8767f9e` — sin merge, sin reescritura, sin force |
| Despliegue Vercel | `dpl_KTj4781pHbTdj7px1KtcPwV3Uijo` — READY tras **28,1 s** de build, `aliasError: null` |
| Despliegue anterior (**punto de reversión**) | `dpl_4EUTp1ebRzLQCEdUdJ7LHz6TAdGx` (`389ba89`) |
| **Migraciones** | **NINGUNA.** Siguen siendo 55, hasta `0055` |
| Variables de entorno, dependencias y configuración | **Sin cambios** |

**Qué entró:** cada lectura del catálogo público se repite **una vez** ante un corte pasajero de
Supabase —502, 503, 504, 520, 522, 524 o la red— y, si el corte sigue, lo recoge una **página de error
del catálogo** con un «Reintentar» que vuelve a pedir los datos (D-196, BR-K15, I-114).

**Validación previa:** `verify` en verde (**1.097/1.097** unitarias), E2E del catálogo público
**58/58** sobre base recién sembrada y el corte **reproducido en local** deteniendo PostgREST. CI:
✅ **2/2** (run 34774381321), incluido el job que aplica las 55 migraciones desde cero.

**Verificación en vivo:** identificador **`87df7489b033`** servido (1 de 15 fragmentos) y el anterior (`e8dba788423e`) **desaparecido**; **23/23** rutas como se esperaba, con el catálogo inexistente en **404**; **7/7** cabeceras con CSP por nonce; **0 secretos** en 944 KB; **ningún 5xx**; **0 errores de ejecución** en los 5 minutos siguientes al despliegue.

> **Lo que este release NO verificó:** el reintento en marcha en producción, que solo se ve durante un
> corte real de Supabase. Si vuelve a pasar, un único 504 ya no debería acabar en un 500 del catálogo.

### 3.2.h Release de «Reintentar» en la página de error general — 2026-09-13

**Un commit, sin migración: la Decisión 3 de D-196.**

| Dato | Valor |
|---|---|
| Commit desplegado | **`787e4205782082be15c059f27b15e901c0018370`** |
| Commit anterior en producción | `faaffa24c60aac9e80bb63b2fd1756f9c1697ac5` |
| Integración | **fast-forward** `faaffa2..787e420` — sin merge, sin reescritura, sin force |
| Despliegue Vercel | `dpl_GeAq2iASntwCWv1QkV1mXpvwui62` — READY tras **24,4 s** de build, `aliasError: null` |
| Despliegue anterior (**punto de reversión**) | `dpl_3SvKnaGnXqXa6rRBXxk1om1ySqAP` (`faaffa2`) |
| **Migraciones** | **NINGUNA.** Siguen siendo 55, hasta `0055` |
| Variables de entorno, dependencias y configuración | **Sin cambios** |

**Qué entró:** el «Reintentar» de la página de error general vuelve a pedir la pantalla con `retry()`
—antes llamaba a `reset()`, que repinta sin pedir nada—, con el mismo botón que la página de error del
catálogo (`RetryButton`, D-196). Los textos no cambian.

**Validación previa:** `verify` en verde (**1.100/1.100** unitarias), E2E de seguridad y del catálogo
público **80/80** sobre base recién sembrada, y la página **comprobada en un navegador** contra la base
local: vuelve entera sin recargar. CI: ✅ **2/2** (run 34782088029), incluido el job que aplica las 55 migraciones desde cero.

**Verificación en vivo:** identificador **`1f3f14b36e57`** servido (1 de 15 fragmentos) y el anterior (`888d83e03b82`) **desaparecido**; **23/23** rutas como se esperaba; **7/7** cabeceras con CSP por nonce; **0 secretos** en 945 KB; **ningún 5xx**; **0 errores de ejecución** en los 5 minutos siguientes al despliegue.

> **Lo que este release NO verificó:** la página de error general con un fallo real en producción, que
> solo aparece cuando una pantalla falla. Y **I-115 sigue abierta**: durante un corte de PostgREST, las
> pantallas con sesión todavía cierran la sesión en vez de enseñar esta página.

### 3.2.i Release del mensaje propio de «Resultados de la semana» — 2026-09-13

**Un commit y una migración: `0056`, aplicada antes de subir el código (§2.2).**

| Dato | Valor |
|---|---|
| Commit desplegado | **`6dd23e508c91afd3f7f748ca54edac2f7a0cc057`** |
| Commit anterior en producción | `73dd284f77c68ef1290d9ad023dd4e6a748b7214` |
| Integración | **fast-forward** `73dd284..6dd23e5` — sin merge, sin reescritura, sin force |
| Despliegue Vercel | `dpl_37A7ydZucjhBGuyjv5rHD5tXW2ye` — READY tras **36,1 s** de build, `aliasError: null` |
| Despliegue anterior (**punto de reversión**) | `dpl_HPpXCdNdrWK3VUn4FwwbmMgVmz6R` (`73dd284`) |
| **Migraciones** | **`0056`**, aplicada **antes** del código. Son 56, hasta `0056` |
| Variables de entorno, dependencias y configuración | **Sin cambios**: ni `package.json`, ni `vercel.json`, ni `next.config.ts`, ni `.github/`, ni `.env.example` |

**Qué entró:** «Usar mi propio mensaje» dentro de «Mensaje para tu grupo», en «Resultados de la
semana»: el vendedor escribe su mensaje, lo guarda, lo conserva al apagarlo y puede volver al
predeterminado, que sigue en el código (D-197, BR-H09, BR-H10). La imagen, su ruta y su diseño no
cambian.

**Validación previa:** `verify` en verde (**1.141/1.141** unitarias), `test:db` **1.016/1.016** y suite
E2E completa **681/683** —los 2 son **I-090**, verdes en aislamiento—. CI: ✅ **2/2** (run 34790475383),
incluido el job que aplica las **56** migraciones desde cero.

**Verificación en vivo:** identificador **`1a11ca507be5`** servido (1 de 15 fragmentos) y el anterior
(`70878ef95854`) **desaparecido**; **7/7** cabeceras con CSP por nonce; **0 secretos** en 945 KB; la
sección y `/api/weekly-results/image` en 307 sin sesión, **sin entregar ningún PNG**. **La primera
pasada dio 24/25**: un catálogo inexistente respondió **500** porque Supabase devolvió `Gateway Timeout`
también en el reintento (23:45:02 UTC, **I-114**), en código que este commit no toca. Seis repeticiones,
un minuto después, dieron su **404**, y la segunda pasada completa, **25/25** y ningún 5xx. **Errores de
ejecución** en los 5 minutos siguientes al despliegue: **uno**, ese 504; ninguno del código nuevo.

> **Lo que este release NO verificó:** el editor **en vivo**, que vive tras el inicio de sesión —un
> agente no introduce contraseñas—; la hoja de compartir con el mensaje propio en **un teléfono de
> verdad**; y el editor en **modo oscuro**. La evidencia es la base comprobada en su catálogo, el
> identificador servido, el CI sobre este commit y las pruebas locales. **Revertir el código no obliga a
> revertir la base**: las dos columnas tienen valor por defecto y el código anterior no las lee.

### 3.2.j Release de «la cartera es del vendedor» — 2026-09-15

**Dos commits y una migración: `0057`, aplicada justo antes de subir el código (§2.2).**

| Dato | Valor |
|---|---|
| Commit desplegado | **`46b7cf0ae5801e17970e59ce1d938b6b9d22da49`**. El código va en `8c102c9750418a275ca90eb1a39a3357f220d16d`; `46b7cf0` solo añade documentación |
| Commit anterior en producción | `42c413ea6cc5a552d4e40e4ad428d42d78849fcf` |
| Integración | **fast-forward** `42c413e..46b7cf0` — sin merge, sin reescritura, sin force |
| Despliegue Vercel | `dpl_HkWWTCfaFsthpHHwA2nW7LxGmUqs` — READY a las 17:37:50 UTC, **56 s** después de empezar (compilación de 41 s), `aliasError: null` |
| Despliegue anterior (**punto de reversión del código**) | `dpl_Dh1wMK77ogHvKMNUdYWto9hhhh3H` (`42c413e`). ⚠️ Revertir solo el código deja al personal leyendo tablas que `0057` ya no le devuelve (I-118) |
| **Migraciones** | **`0057`**, aplicada **antes** del código. Son 57, hasta `0057` |
| Vistas previas de la rama | `8c102c9` y `46b7cf0`, en **ERROR** por `check:env`, como todas las de la rama: Preview no tiene variables de Supabase, a propósito (D-066) |
| Variables de entorno, dependencias y configuración | **Sin cambios**: ni `package.json`, ni `package-lock.json`, ni `vercel.json`, ni `next.config.ts`, ni `.github/`, ni `.env.example` |

**Qué entró:** el Dueño y el Administrador dejan de leer y de tocar la cartera de los vendedores
—clientes, precios, abonos, saldos, pagos y ganancias— en la base, en el servidor y en la pantalla (D-198,
BR-Q01..BR-Q10). Administran el inventario por siete proyecciones de lista blanca; sin «Clientes» ni
«Pagos»; panel, vendedores, rifas y reportes con recuentos. El portal del vendedor no cambia, salvo
que tampoco importa ventas (I-116).

**Validación previa:** `verify` en verde (**1.155/1.155** unitarias), `test:db` **1.048/1.048** y suite
E2E completa **706/710** —dos de **I-090** y uno de **I-106**, verdes en aislamiento, y una prueba de
D-198 corregida (3/3)—. CI: ✅ **2/2** (run 35002363156), incluido el job que aplica las **57** migraciones
desde cero (17:36:54 → 17:41:37 UTC).

**Verificación en vivo:** identificador **`0654bc1cb1db`** servido (1 de 15 fragmentos) y el anterior
(`07cf1f76ffdc`) **desaparecido**; **24/24** rutas y ningún 5xx, con `/owner/clients` y `/owner/payments` en
307 sin sesión; la exportación de cuatro reportes, **sin ningún CSV** sin sesión; **7/7** cabeceras con CSP
por nonce; **0 secretos** en 945 KB. **Errores de ejecución** desde las 17:30 UTC: **ninguno**.

> **Lo que este release NO verificó:** las pantallas **con sesión** —un agente no introduce
> contraseñas—; lo que ve cada rol está comprobado con la sonda de comportamiento sobre la base real
> (§2.2), las pruebas locales y el CI. Tampoco un teléfono de verdad ni el modo oscuro. **Revertir el
> código obliga a pensar en la base**: el código anterior lee tablas que `0057` cerró al personal, así
> que volver atrás de verdad es el procedimiento de D-198, con una migración nueva.

### 3.2.k Release de premios configurables — 2026-09-17

**Nueve migraciones y el código de la Entrega 5, con la rifa real convertida el mismo día (puertas 1 a 3).**

| Dato | Valor |
|---|---|
| Commit desplegado | **`da81663a2a5fe19db53ec0002e74a8a4af3f7137`**. El código y la `0066` van en `1d194dc`; `da81663` solo corrige documentación |
| Commit anterior en producción | `c48437a0f7ff3ecadf23264a66aa03616a959e48` |
| Integración | **fast-forward** `c48437a..da81663`, 14 commits, sin merge, sin force y sin etiqueta (push de 14:07:21 a 14:07:34 UTC) |
| Despliegue Vercel | `dpl_7uUohsc1foH9FHaoY8s2hZKJpRQo` — READY a las **14:08:53 UTC**, alias `gestion-rifas.vercel.app`, `aliasError: null` |
| Despliegue anterior (**punto de reversión del código**) | `dpl_DDiadqkXLcyympoUppJcWSqcVXnE` (`c48437a`). El código anterior solo usa `confirm_lottery_result` de las 62 funciones, que conserva su permiso: puede convivir con la base migrada |
| **Migraciones** | `0058`–`0066`, aplicadas **antes** del código (§2.2) |
| Variables de entorno, dependencias y configuración | **Sin cambios**: ni `package.json`, ni `package-lock.json`, ni `vercel.json`, ni `next.config.ts`, ni `.github/`, ni `.env.example` |

**Verificación en vivo:** identificador **`9c2d9748c2e7`** servido (1 de 15 fragmentos) desde las 14:09:02 UTC y
el anterior (`95c3e4a0b3a2`) **desaparecido**; **28/28** rutas como se esperaba —las de premios cerradas sin
sesión— y **ningún 5xx**; las cuatro exportaciones de reportes sin CSV sin sesión; **7/7** cabeceras con CSP por
nonce; **0 secretos** en 950 KB. Autenticación básica sin iniciar sesión: `/login` con sus campos, las rutas
protegidas redirigidas y el Auth de Supabase respondiendo. **Errores de ejecución:** ninguno.

> **Lo que este release NO verificó:** las pantallas **con sesión** —un agente no introduce contraseñas—. Lo que
> ve cada rol está comprobado con las pruebas locales, el CI y las sondas de solo lectura sobre la base real.

> **Nota posterior (2026-09-18, Etapa 4 de D-208, solo lectura):** el despliegue vigente **ya no es este**. A las
> **20:33:25 UTC** del 17/09, el push del cierre documental de la Entrega 5 desplegó **`6da9bcb`**
> (`dpl_CE4VvypDjs3nueph1g39Je9Lsya1`, READY): dos commits **solo de documentación** sobre `da81663`
> —`git diff da81663 6da9bcb` fuera de `docs/`, vacío—, y el dominio sirve su identificador, **`c3d720898c56`**
> (el de `da81663`, `9c2d9748c2e7`, ya no aparece). El código servido es el mismo; lo que cambia es el **punto de
> reversión** de la próxima promoción, que pasa a ser `dpl_CE4VvypDjs3nueph1g39Je9Lsya1` (`RUNBOOK` §9.8).

### 3.2.l Release del historial de premios ganados — 2026-09-19

**Las seis migraciones (§2.2), los dos premios reconocidos por el dueño y el código de las pantallas, en tres
puertas** (`RUNBOOK` §9). La tercera quedó **desplegada y en verde en vivo, con el CI en rojo por I-140**.

| Dato | Valor |
|---|---|
| Commit desplegado | **`318357ce0139e93ded27cf23cb8416b75e7f8bcc`**, el autorizado —no el HEAD posterior de la rama— |
| Commit anterior en producción | `6da9bcbc9c42e17bc142adbf41c84ecfba9d0efd` |
| Integración | **fast-forward** `6da9bcb..318357c`, 9 commits, sin merge, sin force y sin etiqueta (push de 00:03:51 a 00:03:58 UTC) |
| Despliegue Vercel | `dpl_Fn6UBZjA6vTPbjViHDaV6GGWuemE` — READY a las **00:04:55 UTC**, alias `gestion-rifas.vercel.app`, sin error de alias |
| Despliegue anterior (**punto de reversión del código**) | `dpl_CE4VvypDjs3nueph1g39Je9Lsya1` (`6da9bcb`): el **inmediatamente anterior** y candidato a *Instant Rollback* —en Hobby solo se puede volver a ese—. Comprobado en solo lectura con la cuenta **OWNER** de la CLI; **no se ejecutó** |
| **Migraciones** | `0067`–`0072`, aplicadas **antes** del código (§2.2) |
| **Datos** | Dos reconocimientos en `declared_prize_awards` —Bogotá 2862 y Cundinamarca 4820, «Premio diario», $500.000 cada uno, sin actor— y una fila `prize_award.record` de bitácora, por el cargador y con la huella de su vista previa |
| Variables de entorno, dependencias y configuración | **Sin cambios**: ni `package.json`, ni `package-lock.json`, ni `vercel.json`, ni `next.config.ts`, ni `.github/`, ni `.env.example` |

**Verificación en vivo** (`build/gate/en-vivo-p3.mjs`): identificador **`76a253b25ca1`** servido (1 de 15 fragmentos) y
el anterior (`c3d720898c56`) **desaparecido**; **30/30** rutas —`/owner/prizes` y `/seller/prizes` cerradas sin
sesión— y **ningún 5xx**; las cuatro exportaciones sin CSV sin sesión; **7/7** cabeceras con CSP por nonce; **0
secretos** en 950 KB. `verify:remote` **44/44**, la comparación por fila **CONTINUAR** y **ningún error de ejecución**
en Vercel desde el despliegue.

> ⚠️ **El CI de `318357c` terminó en rojo** (run `35408036412`): «Typecheck, lint, unitarias, build» en verde y, en el
> job de base, **1 prueba fallida de 1.374** —`admin-privacy.test.ts`, la de I-140—, porque en el runner corrieron
> antes cinco suites que crean premios. Las migraciones desde cero entraron. La puerta 3 **no se dio por cerrada** y
> **no se revirtió**: no hay un fallo atribuible al despliegue. Qué hacer, en `KNOWN_ISSUES` I-140.

> **Lo que este release NO verificó:** las pantallas **con sesión** —un agente no introduce contraseñas—. Los
> recorridos del dueño, el administrador y los vendedores están en `RUNBOOK` §9.9.

> **Nota posterior (2026-09-19, D-209):** el CI en rojo de este release era **I-140**, un defecto de la prueba. Se
> corrigió en `6401bd0`, y su CI —en el PR y en `main`— está en verde (§3.2.m).

### 3.2.m Release de Bre-B y «Otros» — 2026-09-19

**`0073` y `0074` primero (§2.2) y después el código**, con autorización expresa del dueño para una sola ejecución, e
**I-140 corregida** antes de publicar.

| Dato | Valor |
|---|---|
| Commit desplegado | **`6401bd0276ee74094e27634f688bdd9e50d65bea`**, el verificado: el mismo SHA del PR #1 con el CI en verde |
| Commit anterior en producción | `318357ce0139e93ded27cf23cb8416b75e7f8bcc` |
| Integración | **Avance rápido** `318357c..6401bd0`, 3 commits —`735eb67` (solo documentación de D-208), `94eaa4d` (D-209) y `6401bd0` (I-140 y documentación)—, sin fusión, sin `force` y sin etiqueta (push de 17:56:48 a 17:56:50 UTC). El PR #1 sirvió para el CI; no se fusionó desde GitHub |
| Despliegue Vercel | `dpl_5XSSrdetXhFpNoyig8SHEHgfYG7y` — creado a las 17:56:52 y **READY a las 17:57:44 UTC**, el único que disparó ese empuje |
| Despliegue anterior (**punto de reversión del código**) | `dpl_Fn6UBZjA6vTPbjViHDaV6GGWuemE` (`318357c`): el **inmediatamente anterior** y candidato a *Instant Rollback*, comprobado en solo lectura antes y después con la sesión **OWNER** de la CLI; **no se ejecutó**. Cuándo se puede usar, en §2.2: hoy hay **0** cuentas Bre-B y «Otros» |
| **Migraciones** | `0073` y `0074`, aplicadas **antes** del código (§2.2) |
| **Datos** | Ninguno escrito por la promoción: la comparación por fila dio 0 filas tocadas |
| Variables de entorno, dependencias y configuración | **Sin cambios**: ni `package.json`, ni `package-lock.json`, ni `vercel.json`, ni `next.config.ts`, ni `.github/`, ni `.env.example`, ni `tsconfig.json` |
| CI | En el PR, run `35457272858` sobre `6401bd0`: ✅ 2/2, con `admin-privacy.test.ts` **después** de las cinco suites de premios —el orden que tumbó `318357c`—. En `main`, run **`35459633957`** (17:56:54–18:03:23 UTC): ✅ **2/2** —1.522/1.522 unitarias; migraciones desde cero y 1.402 + 1 omitida, con el mismo orden— |

**Verificación en vivo** (`build/gate/en-vivo-d209.mjs`): identificador **`73db0e617455`** servido (1 de 15 fragmentos) y
el anterior (`76a253b25ca1`) **desaparecido**; **33/33** rutas —las tres de «Configuración» del vendedor cerradas sin
sesión— y **ningún 5xx**; las cuatro exportaciones sin CSV sin sesión; **7/7** cabeceras con CSP por nonce; **0 secretos**
en 950 KB. `verify:remote` **46/46**; la comparación por fila, **CONTINUAR** —un pago de un vendedor, explicado—; **ningún
error de ejecución** desde el despliegue, y en sus registros ni un 5xx ni una línea de error o aviso.

> **Lo que este release NO verificó:** las pantallas **con sesión**. Las comprobaciones del vendedor —una Bre-B con «@»
> y otra sin él, una «Otros» con ceros, un duplicado con su frase y el mensaje de un recordatorio— son del dueño (§2.2,
> paso 8). **El commit de documentación posterior** a esta promoción se queda en la rama y **no** se empuja a `main`:
> desplegaría otra versión y, en Hobby, movería el punto de reversión lejos de `318357c` (D-209 §7).

### 3.2.n Release de alineación de campos (D-210) — 2026-09-19

**Sin migración.** Un cambio de aplicación: `FormItem` pasa a `grid content-start gap-2`. Autorización expresa para
publicar esta corrección, incluyendo rama, PR, `main` y el despliegue automático.

| Dato | Valor |
|---|---|
| Commit desplegado | **`9acbfa85b84806c157dc75d828b6aba5e6e622e3`**, el verificado: el mismo SHA del PR #2 con el CI en verde |
| Commit anterior en producción | `6401bd0276ee74094e27634f688bdd9e50d65bea` |
| Integración | **Avance rápido** `6401bd0..9acbfa8`, 3 commits —`2c82a01` (cierre documental de D-209), `73f3e83` (D-210) y `9acbfa8` (prueba de oscuro)—, sin fusión, sin `force` y sin etiqueta (push de `9acbfa8` a `main` a las **21:09:36 UTC**). El PR #2 sirvió para el CI; GitHub lo marca fusionado por ese avance rápido |
| Despliegue Vercel | GitHub Production **6545741433**, alias `gestion-rifas-dkeif5tbg-jimmyriveros-projects.vercel.app`, inspector `7zSzWDRhCKFaiDvbUoJB9A89VPrT` — creado y **success a las 21:10:11 UTC**, el único de producción que disparó ese empuje. La CLI de Vercel no estaba autenticada en esta sesión, así que el `dpl_` no se leyó aquí |
| Despliegue anterior (**punto de reversión**) | `dpl_5XSSrdetXhFpNoyig8SHEHgfYG7y` (`6401bd0`): el **inmediatamente anterior**, D-209, que **sí** enseña Bre-B y «Otros». **No** es `318357c`. Instant Rollback de Hobby, **sin tocar la base** |
| **Migraciones** | **NINGUNA.** `supabase/` y `scripts/` con 0 líneas de diferencia. Siguen **74** |
| Variables de entorno, dependencias y configuración | **Sin cambios**: ni `package.json`, ni `package-lock.json`, ni `vercel.json`, ni `next.config.ts`, ni `.github/`, ni `.env.example` |
| CI | En el PR, run **`35469232380`** sobre `9acbfa8`: ✅ 2/2. En `main`, run **`35469563720`** (21:09:37–21:15:36 UTC): ✅ **2/2** |

**Verificación en vivo:** identificador **`484ebe210458`** servido (1 de 15 fragmentos) y el anterior (`73db0e617455`) **desaparecido**; la CSS servida trae **`content-start`** (2 hojas); **27/27** rutas —públicas 200, protegidas 307, APIs 401, catálogo inexistente 404— y **ningún 5xx**; **7/7** cabeceras con CSP por nonce; **0 secretos** en 1.128 KB. `verify:remote` **46/46**.

> **Lo que este release NO verificó:** las pantallas **con sesión** (Día/Hora y filas equivalentes). Un agente no
> introduce contraseñas. Quedan pendientes del dueño. **El commit de documentación posterior** se queda en la rama y
> **no** se empuja a `main`: desplegaría otra versión y, en Hobby, movería el punto de reversión lejos de `6401bd0`.

### 3.3 Despliegues futuros

#### 3.3.a Próxima publicación: D-211 a D-220 (preparada, NO autorizada)

Tres cosas distintas, que no se mezclan:

| | Qué | Fuente |
|---|---|---|
| **Documentado como publicado** | Migraciones `0001`–`0074`; código `9acbfa8` (D-210), el último release registrado; `verify:remote` **46/46** el 2026-09-19 a las 21:15 UTC, **la última comprobación contra producción que consta** | §2 y §3.2.n |
| **Pendiente, esperado** | Migraciones **`0075`, `0076` y `0077`**; el código de la rama desde `9acbfa8`: D-211 a D-220, 16 commits a 2026-09-23 | Git local: `origin/main..HEAD` |
| **Requiere confirmación contra producción** | Que producción siga en `0074` y en `9acbfa8`; que nadie haya aplicado ni desplegado nada desde el 2026-09-19; que `verify:remote` siga en verde. **Nada de esto se ha comprobado desde esa fecha** | — |

**Lista de verificación, en este orden.** Cada paso que escribe en producción necesita **su propia autorización
expresa** del dueño.

1. **Base local limpia y E2E completa**: `npm run db:reset`, reiniciar Kong, `npm run seed:local` y
   `npm run test:e2e` completa con `npm run dev:local` (nunca `npm run dev`, que apunta al proyecto real).
2. **Tratamiento de cada fallo de la E2E**, uno por uno y por escrito en `TEST_RESULTS`:
   * repetir el archivo **solo**, tras `db:reset` + `seed:local`;
   * si pasa solo, comprobar que es un problema **ya registrado** —I-090 (acumulación en «Ventas por fecha»),
     I-148 (premios con el servidor caliente), I-151 (selección con restos), I-075—, con **la misma firma**
     (mismo archivo, misma línea, mismo tipo de diferencia);
   * si falla solo, o su firma no coincide con ninguno registrado, **se detiene la publicación**: se
     reproduce, se corrige en local y se repite desde el paso 1. Nunca se quita ni se salta una prueba
     para seguir.
3. `npm run verify` y `npm run test:db` en verde, este último sobre base recién sembrada.
4. **Solo lectura en producción** (§9.1 de `RUNBOOK` como modelo): confirmar que la última migración aplicada es
   `0074`, qué commit está servido y `verify:remote`. Si algo no coincide con la fila «Documentado como
   publicado», **se detiene** y se explica la diferencia antes de seguir.
5. `supabase db push --dry-run` debe listar **exactamente** `0075`, `0076` y `0077`, y nada más.
6. **Respaldo** nuevo (`RUNBOOK` §5.1) inmediatamente antes, validado restaurándolo en local.
7. **Privilegios de lo que crean** (I-132): el proyecto alojado concede `EXECUTE` a `service_role` en toda
   función nueva y el local no. Leído en los archivos: `0075` **borra y vuelve a crear** `search_tickets` y
   `admin_list_tickets` con firma nueva; `0076` crea las vistas `v_seller_ticket_list` y `v_org_member_list` y
   las funciones `admin_list_sellers` y `admin_list_raffles`, y redefine las dos de `0075`; `0077` redefine
   `raffles_set_short_code` (`create or replace`, conserva privilegios y se comprueba a sí misma). Ensayar el
   escenario B y H7-05 como en D-207/D-208.
8. Aplicar las migraciones **antes** del código (§2.2). **No son todas aditivas**: `0075` borra y recrea dos
   funciones. Sus parámetros nuevos tienen valor por defecto y el código servido (`9acbfa8`) las llama con
   argumentos con nombre que siguen existiendo, así que **se espera** que siga funcionando con la base nueva.
   **Es una lectura del código, no una medición**: hay que comprobarlo en local —base con `0077`, código de
   `9acbfa8`— antes de aplicar, y medir si queda un instante sin función hasta que PostgREST recarga su caché.
   Con la sonda de solo lectura antes y después.
9. Push a `main` y despliegue; comprobar el código **servido** (§6.1) y `verify:remote`.
10. Revisión del dueño **con sesión** en un teléfono real: el control de orden (D-215 a D-218) y el historial
    de abonos (D-219). Un agente no introduce contraseñas.

**Registrados y NO incluidos en esta publicación** (no se implementan sin encargo): **I-159** (boletas de la ficha
cortadas en 100), **I-160** (orden de los códigos de rifa como texto desde R1000; decisión pendiente) e **I-161**
(código interno de boleta a 6 cifras).

#### 3.3.b Cómo se despliega

Cada `git push` a `main` que se decida subir dispara un build y despliegue a producción automático
(la integración de GitHub ya está conectada). Si una migración nueva acompaña al cambio, aplicarla
**antes** de fusionar a `main` siguiendo el procedimiento de §2.2 — las migraciones son aditivas e
inmutables, así que aplicarlas antes que el código que las usa no rompe nada.

> **Excepción, 2026-09-15 (D-198):** una migración que **quita** permisos —como `0057`— sí rompe el
> código anterior mientras llega el nuevo. Ahí el código se sube en el mismo comando, solo si la
> migración terminó bien, y se mide la ventana: con `0057` fueron unos 62 s (§3.2.j).

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

**Antes de volver a un despliegue anterior, comprueba que su código sabe leer lo que la base ya tiene** (D-209). Las
migraciones se quedan, y un código viejo puede no fallar y aun así enseñar mal un dato nuevo: `318357c` pinta una
cuenta Bre-B como «· Ana Torres», sin forma ni llave, también en el mensaje que lee el cliente (§2.2). En Hobby, además,
solo se puede volver al despliegue **inmediatamente anterior**, así que cualquier despliegue nuevo a producción mueve ese
punto.

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

