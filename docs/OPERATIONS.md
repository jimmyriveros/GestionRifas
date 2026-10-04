# MANUAL DE OPERACIÓN

**Actualizado:** 2026-10-04, tarde (revisión del dueño: **§6.a y §6.b**, sus lecturas como hipótesis con su siguiente comprobación; §6.b dice qué **no** escribe D-251; la prueba de redes, con un límite total). Antes, ese mismo día (D-251: **§6.b nueva**, qué dicen las dos líneas nuevas del registro del servidor, cuando se publique). Antes, 2026-10-02 (D-246: **§6.a nueva**, reconocer una lentitud de **conexión** —esperas de 1, 3 o
15 s antes de cargar— sin reiniciar ni revertir). Antes, 2026-10-01 (§4.e: el cierre de cuentas, **en producción**). Antes, 2026-09-30, por la noche (D-243:
§4.e — en la rifa activa ya está confirmado que los vendedores no
han entregado dinero al dueño y que no hubo premios pagados en los sorteos sin resultado). Antes, ese mismo día, al
final (D-242: §4.e — el primer día se registra la historia real, sin empezar desde cero, y lo de un vendedor a cargo se
registra antes de desactivarlo). Antes, ese mismo día (D-241: **§4.e nueva**, el cierre de cuentas, **solo en
local**). Antes, 2026-09-14
(D-198: §4, §4.b y §4.c). Para quien **opera el negocio** (Owner/Admin), no para quien
programa. Para desplegar la aplicación ver [`DEPLOYMENT.md`](DEPLOYMENT.md); para problemas
frecuentes, [`RUNBOOK.md`](RUNBOOK.md).

---

## 1. Alta de una organización nueva y su primer Owner

La aplicación **no** tiene una pantalla para esto: crear un Admin o un Vendedor requiere ya estar
logueado como Owner o Admin de esa organización (`/owner/users`, `/owner/sellers`), y la primera
persona de una organización nueva no puede loguearse todavía en ningún lado. Se resuelve con un
script de una sola vez, ejecutado por quien tenga acceso a las credenciales de servidor del proyecto:

```bash
npm run create-org -- --name "Nombre de la empresa" \
  --owner-email dueño@empresa.com \
  --owner-name "Nombre completo" \
  --owner-phone "3001234567"
```

Qué hace: crea la organización, envía una invitación por correo real a `owner-email` (el mismo
mecanismo que usa la aplicación para admins y vendedores — nunca una contraseña en texto plano,
D-045) y la deja como Owner. La persona invitada recibe el correo, sigue el enlace, fija su
contraseña y a partir de ahí usa `/login` con normalidad, llegando a `/owner/dashboard`.

Seguro de reintentar: si la organización ya existe la reutiliza; si ya tiene un Owner activo, se
detiene sin crear un segundo (un solo Owner por organización — BR-U04, reforzado además por una
restricción única en la base de datos).

Para probar el flujo sin tocar producción, agregar `--local` (requiere `npx supabase start` y apunta
a la instancia de Docker).

**Antes de operar con datos reales de una organización nueva**, revisar la nota de seguridad del
§4 sobre las cuentas de demostración que conviven en el mismo proyecto.

---

## 2. Alta de Administradores y Vendedores

Ya lo hace la aplicación — esto documenta el procedimiento, no código nuevo.

1. Como Owner o Admin, ir a **`/owner/users`** (administradores) o **`/owner/sellers`** (vendedores).
2. "Invitar" → nombre completo, alias (opcional), teléfono, correo.
3. La persona recibe un correo de invitación y fija su propia contraseña. Nunca se comparte ni se ve
   una contraseña desde la aplicación.
4. Para desactivar a alguien (deja de poder iniciar sesión, y si tenía una sesión abierta se le
   cierra): botón de activar/desactivar en su fila del listado. Reactivar es el mismo botón.

Restricciones que la aplicación ya impone: un Admin no puede desactivar ni "ascender" al Owner, ni
crear un segundo Owner — ni por la interfaz ni manipulando la petición (reforzado por RLS).

---

## 3. Rifas: crear, cerrar y anular

1. **Crear**: `/owner/raffles` → "Nueva rifa". Precio predeterminado `$120.000`; se puede cambiar
   para esa rifa específica sin afectar el precio de boletas ya vendidas de otras rifas.

   ⚠️ **Cambiar el precio de una rifa activa mueve dinero de dos maneras** (BR-G15, D-096): a quien
   cobra «la mitad del precio» le cambia la comisión de las boletas **ya cobradas**, y el sistema lo
   recalcula solo. Lo que **no** cambia es el precio de las boletas ya vendidas (BR-P04): esas
   conservan el suyo. Corregir un precio mal configurado en boletas ya vendidas es otra cosa y **no
   se hace desde la pantalla**: exige una migración (BR-P07, D-098).
2. **Activar**: desde el detalle de la rifa (`/owner/raffles/[id]`), botón **"Activar rifa"**. Una
   rifa activa admite creación y asignación de boletas.
3. **Cerrar**: botón **"Cerrar rifa"**. Deja de admitir boletas nuevas o asignaciones, pero los
   abonos pendientes de boletas ya asignadas se pueden seguir registrando.
4. **Reabrir** una rifa cerrada: botón **"Reabrir rifa"** — **solo el Owner** lo ve y puede hacerlo,
   un Admin no.
5. **Anular**: botón **"Anular rifa"**, con confirmación explícita porque **es definitivo**: no se
   puede reabrir, ni admite boletas ni pagos nuevos. Los datos históricos (boletas y pagos ya
   registrados) se conservan intactos, solo se congela la rifa.

---

## 4. Anulaciones (boletas y pagos)

Ninguna anulación borra datos: todo queda en el historial marcado como anulado, con motivo, quién lo
hizo y cuándo (auditado en `audit_logs`).

### Boleta

Desde el detalle de la boleta (`/owner/tickets/[id]`) → **"Anular boleta"** → campo obligatorio
"Explica por que se anula esta boleta" → confirmar.

**Desde el 2026-09-14 (D-198) solo se anulan las boletas que no se han vendido.** Una vendida sin
abonos la libera primero su vendedor (§4.c) y después se anula; una con abonos en su historial, o de
una rifa que ya no está activa, **no se anula desde la aplicación** (I-116).

### Pago

**Suspendido desde el 2026-09-14 (D-198).** Nadie anula pagos desde la aplicación: `/owner/payments`
ya no existe y `void_payment` no la ejecuta ninguna sesión. Si un abono se registró por error, **su
vendedor** lo corrige —incluso a $0— desde el detalle de la boleta (BR-F16, BR-F17): queda en el
historial, deja de contar y el saldo y el estado de pago se recalculan solos. Volver a anular pagos
exige el procedimiento de reactivación de D-198.

---

## 4.b Corregir el cliente de una boleta vendida

Cuando una boleta se le asignó a la persona equivocada, **no hay que anularla ni volver a venderla**.
Desde el detalle de la boleta en el portal del vendedor (`/seller/tickets/[id]`) hay un botón
**«Cambiar cliente»** debajo de la tarjeta del cliente. **Desde D-198 lo hace solo el vendedor de la
boleta**: el Dueño y los Administradores ya no ven su cliente. Se elige el cliente
correcto (o se crea ahí mismo), se escribe el motivo y se confirma. Solo cambia el cliente: el
precio, la fecha de venta, los números y el estado quedan igual, y el equipo **no** recibe otra vez
el aviso de venta.

El botón desaparece, con su explicación en pantalla, cuando la boleta ya no puede corregirse:

| Situación | Qué se ve | Qué hacer |
|---|---|---|
| La boleta tiene abonos en su historial —incluso anulados o corregidos a $0— | «Esta boleta tiene abonos en su historial: ya no puede cambiar de cliente ni liberarse.» | Anular los abonos **no** la desbloquea: la fila se queda. Si de verdad hay que moverla, es una corrección de datos y la hace quien administre la base |
| La boleta ya salió en un resultado de lotería | «Esta boleta ya hace parte de un resultado registrado: no puede cambiar de cliente ni liberarse.» | Nada: la fotografía del sorteo es inmutable a propósito |

Cambiar el **vendedor** de una boleta ya vendida sigue siendo imposible (BR-G07): eso es otra cosa y
lo impide el esquema. Detalle de las dos reglas en `BUSINESS_RULES.md` (BR-I12, BR-I13).

---

## 4.c Liberar una boleta que el cliente ya no quiere

El cliente se echa atrás **antes de abonar nada**. La boleta no se anula —eso quemaría sus dos
números para el resto de la rifa (BR-N08)—: se **libera**, y vuelve al inventario con sus mismos
números, lista para venderse a otra persona.

Desde el mismo sitio que «Cambiar cliente», bajo la tarjeta del cliente, hay un botón **«Liberar
boleta»**. El diálogo enseña los dos números y el cliente actual, pide el **motivo de la liberación**
y se confirma. Al terminar, la boleta queda **Disponible**, sin cliente, sin precio y sin fecha de
venta, y se vende otra vez por el flujo normal —que vuelve a copiar el precio vigente de la rifa
(BR-P03)—.

Lo hace **el vendedor dueño de la boleta**; desde D-198, el Dueño y los Administradores no. El botón
desaparece, con su explicación en pantalla, cuando no se puede:

| Situación | Qué se ve | Qué hacer |
|---|---|---|
| La boleta tiene abonos en su historial —incluso anulados o corregidos a $0— | «Esta boleta tiene abonos en su historial: ya no puede cambiar de cliente ni liberarse.» | Desde D-198 **no hay salida desde la aplicación**: el personal ya no anula boletas vendidas. Si de verdad hay que retirarla, es una corrección de datos (I-116) |
| La boleta ya salió en un resultado de lotería | «Esta boleta ya hace parte de un resultado registrado: no puede cambiar de cliente ni liberarse.» | Nada: la fotografía del sorteo es inmutable a propósito |
| La rifa ya no está activa | «La rifa ya no está activa: esta boleta no se puede liberar.» | Igual que la primera fila: una boleta vendida ya no se anula desde la aplicación (I-116) |

**Liberar, anular y eliminar no son lo mismo**, y conviene tenerlo claro antes de tocar nada:

| | Qué pasa con la boleta | Qué pasa con sus números | Quién |
|---|---|---|---|
| **Liberar** | Vuelve a Disponible y se puede vender otra vez | Siguen siendo suyos | Su vendedor |
| **Anular** | Queda Anulada para siempre | **Reservados**: no se reutilizan en esa rifa | Solo Dueño o Administrador, y desde D-198 solo si no se ha vendido |
| **Eliminar** | Desaparece; solo si nunca se vendió ni tuvo abonos | Quedan libres | Solo Dueño o Administrador |

Todo queda en la bitácora: quién liberó, cuándo, a quién estaba vendida, por cuánto, en qué fecha y
por qué. Detalle de la regla en `BUSINESS_RULES.md` (BR-I14) y de la decisión en `DECISIONS.md`
(D-169).

---

## 4.d Entregar el paz y salvo de una boleta

Cada boleta trae un desprendible —el **paz y salvo**— que el vendedor le da en mano al cliente.
Desde el detalle de una boleta vendida, en el portal del vendedor, hay un interruptor:
**«Entrega del paz y salvo»**. Se toca, y la boleta pasa de **«Paz y salvo por entregar»** a
**«Paz y salvo entregado»**, con la fecha y la hora. Se puede volver a apagar; no pide
confirmación porque se deshace con otro toque.

En la lista de boletas se ve de un vistazo quién tiene ya el suyo: un icono junto al nombre del
cliente en el computador, y un «Entregado» / «Por entregar» en el teléfono.

**No tiene nada que ver con el pago.** Una boleta **Sin pagar** puede tener su paz y salvo
entregado, y una **Pagada** puede no tenerlo. Tocar el interruptor no mueve abonos, ni saldo, ni
estado de pago, ni ganancia. Tampoco hace falta que la rifa siga activa.

| Quién | Qué puede hacer |
|---|---|
| El **vendedor dueño** de la boleta | Marcarlo y desmarcarlo. Es su entrega y es su cliente |
| **Dueño** y **Administrador** | **Consultarlo** en el detalle de la boleta. No lo cambian: registrar una entrega que no hicieron no significaría nada |
| El vendedor que lidera un equipo | Nada sobre las boletas de sus integrantes |

**Al empezar, todo lo ya vendido quedó marcado como entregado.** El día que se activó la función
se dieron por entregadas las boletas que ya estaban vendidas: si no, habrían aparecido todas «por
entregar» y no era cierto. Esas boletas dicen **«Marcado como entregado al activar esta función.
La fecha real de entrega no estaba registrada.»** y **no enseñan fecha**, porque la que hay es la
del día de la activación, no la de la entrega. Si alguna de ellas no se había entregado de verdad,
se apaga el interruptor; y cuando se entregue, al volver a encenderlo queda con su fecha real.

Las boletas vendidas **después** de ese día empiezan siempre por entregar.

**Si la boleta cambia de cliente o se libera, vuelve a «por entregar»**: el desprendible era para
la persona anterior. Una boleta **anulada** conserva lo que tuviera, pero ya no se puede cambiar.

⚠️ **Lo que esto es, y lo que no.** El sistema registra **cuándo se marcó la entrega**. No es por
sí solo una prueba física ni legal de que el cliente recibió el documento: lo marca quien lo
entrega, no quien lo recibe.

Todo queda en la bitácora: quién lo marcó, cuándo, y qué valor tenía antes. Detalle de la regla en
`BUSINESS_RULES.md` (BR-I15) y de la decisión en `DECISIONS.md` (D-170).

---

## 4.e Cierre de cuentas: recibir el dinero de los vendedores (D-241)

> ✅ **En producción desde el 2026-10-01** (`DEPLOYMENT` §3.2.v).

El dinero de una rifa sube por la cadena: **el integrante entrega a su vendedor a cargo, y el vendedor a cargo entrega
al dueño**. En «Cierre de cuentas» (`/owner/settlements`, Dueño y Administrador) se ve, por rifa, lo **recibido**, lo
que **falta recibir** y las cuentas **cerradas**; en «Mi cierre de cuentas» (`/seller/settlement`) cada vendedor ve lo
que tiene que entregar y, si tiene equipo, las cuentas de sus integrantes.

| Quiero… | Dónde | Quién |
|---|---|---|
| Confirmar dinero que me entregó un vendedor directo | Su cuenta → **«Registrar recibido»**. Se puede entregar por partes | Dueño o Administrador |
| Confirmar lo que me entregó un integrante de mi equipo | «Mi cierre de cuentas» → «Cuentas con tu equipo» → su cuenta | Su vendedor a cargo, y nadie más |
| Registrar quién pagó un premio | La cuenta, en «Premios» → **«Registrar premio pagado»** | Quien recibe las entregas del que pagó: si pagó un integrante, su vendedor a cargo; si pagó un vendedor directo, un vendedor a cargo o el dueño, el personal |
| Devolver dinero a un vendedor con saldo a su favor | Se le entrega fuera de la aplicación; **él** confirma «Devolución recibida» en su cierre | El vendedor que la recibe |
| Corregir una entrega o un pago de premio confirmados por error | En su fila → **«Anular»**, con el motivo. La fila se queda, marcada | Una entrega, quien la recibió: si la recibió el dueño, el Dueño o cualquier Administrador. Un premio, quien podría registrarlo hoy |
| Cerrar una cuenta que quedó en $0 por otro camino | **«Cerrar cuenta»** en su recuadro | Quien recibe sus entregas |

**Tres cosas que no se hacen:** confirmar dinero que todavía no se tiene en la mano; «cerrar» una cuenta para cerrar la
rifa —son dos cosas distintas, y cerrar una cuenta no toca la rifa—; y registrar a nombre de otra persona: la aplicación
solo deja confirmar a quien recibe.

**Si al confirmar sale «La cuenta cambió»**, alguien registró otro movimiento mientras se revisaba: **no se guardó
nada**. Se revisa el saldo nuevo y se vuelve a confirmar.

**Antes de desactivar a un vendedor a cargo**, él registra lo que le entregó su equipo y los premios que pagaron sus
integrantes (BR-Z21). Con la cuenta desactivada nadie puede hacerlo por él, tampoco el personal (I-196), y reorganizar
el equipo (§2) con esas entregas sin registrar **no sirve**: solo se podrían confirmar como recibidas por el vendedor a
cargo nuevo, que no las recibió, y el anterior quedaría con saldo a su favor teniendo ese dinero. Lo que él entregó al
dueño y los premios que pagó él —también los de boletas de su equipo— los registra el personal, como siempre, y
**también antes de reorganizar**: después, un premio de su equipo que pagó él ya no se le puede atribuir. Si ya se
desactivó con cosas sin registrar, se reactiva un momento para que registre lo que recibió, se vuelve a desactivar y
**después** se reorganiza el equipo: lo que ya le habían entregado y lo que pagó se quedan en su cuenta.

**El primer día** el cierre no conoce las entregas ni los pagos de premios anteriores: se verá «Recibido $0» y
cuentas en «Falta información». **No se empieza a contar desde ese día ni se pone ninguna cuenta en cero**: la cuenta
suma todas las boletas pagadas de la rifa, y lo ya entregado seguiría apareciendo como pendiente. Cada entrega y cada
premio ya pagado se registran **con su fecha real**, por quien corresponde, después de que el dueño confirme lo que el
sistema no sabe —si hubo premios en los sorteos sin resultado guardado, y cómo se entregó el dinero— (`RUNBOOK` §11.2,
BR-Z19, BR-Z20).

**En la rifa activa ya está confirmado** (D-243): los vendedores todavía no le han entregado dinero al dueño y no hubo
premios pagados en los sorteos sin resultado guardado. Lo único por registrar son los 4 premios del historial, si se
pagaron: dónde se ven y qué dato falta de cada uno, en `RUNBOOK` §11.2.a.

**Diagnóstico en solo lectura** (quien opera, con la *service role*; ninguna sesión puede leer estas tablas):

```sql
-- Entregas y devoluciones vigentes de una rifa, por tipo y destino
select kind, counterpart_id is null as al_dueno, count(*), sum(amount)
  from settlement_transfers
 where raffle_id = '<RIFA>' and voided_at is null
 group by 1, 2;

-- Premios con más de un pago vigente (tiene que dar cero filas: lo impide un índice único)
select match_id, prize_id, count(*)
  from settlement_prize_payments
 where voided_at is null
 group by 1, 2 having count(*) > 1;
```

Nada de estas tablas se corrige a mano: una fila equivocada se **anula** desde la aplicación, y un cierre no se toca
nunca (BR-Z14, BR-Z18). Detalle de las reglas en `BUSINESS_RULES.md` §12.j y de la decisión en `DECISIONS.md` (D-241).

---

## 5. Seguridad operativa antes de lanzar con datos reales

**Cuentas de demostración.** El proyecto Supabase que se usa como producción (Fase 8, D-066) es el
mismo que se usó para desarrollo y pruebas desde la Fase 2. Contiene las cuentas de
`HANDOFF.md` §4 (`owner@demo.test`, `admin@demo.test`, etc.) con una contraseña **compartida y
conocida** (`SEED_DEFAULT_PASSWORD` del proyecto real). Antes de operar con dinero o clientes reales:

- Desactivarlas desde `/owner/users` (Owner/Admin, igual que cualquier otro usuario), **o**
- Si se van a conservar para seguir probando, cambiarles la contraseña individualmente (cada una
  desde "Olvidé mi contraseña" en `/login`) y no reutilizar la de `SEED_DEFAULT_PASSWORD`.

Esto es una recomendación, no algo que un agente deba hacer solo: desactivar cuentas es una decisión
del dueño del negocio. Ver **I-021**.

**Rifa e inventario de prueba.** «Rifa Navidad 2026» y «Rifa Control 2026» (y sus boletas, clientes y
pagos) son datos de demostración del mismo seed. Anúlalas (§3) cuando la operación real empiece, en
vez de dejarlas activas mezcladas con datos reales.

---

## 6. Si la aplicación tarda segundos al cambiar de pantalla

Lo primero que hay que mirar **no** es la base de datos: es si **Fluid Compute** sigue activo en el
proyecto de Vercel (Settings → Functions, `DEPLOYMENT.md` §3.1.b). Sin él, la función que sirve las
pantallas arranca en frío tras un rato sin tráfico y la primera navegación cuesta 3–5 segundos
(I-067).

Cómo distinguirlo en treinta segundos, sin herramientas:

1. Abre una pantalla, espera un minuto sin tocar nada y pulsa otro menú. Si **esa** navegación es
   lenta y las siguientes van bien, es arranque en frío.
2. Si **todas** van lentas por igual, entonces sí toca mirar los datos (`KNOWN_ISSUES.md` I-062 e
   I-063 dicen a qué volumen empieza a doler cada cosa).

Y recuerda que **activar Fluid Compute no cambia el despliegue que ya está en línea**: hay que volver
a desplegar para que tome efecto.

### 6.a Si tarda **antes** de que empiece a cargar (I-203)

Si la pantalla se queda en blanco segundos antes de que aparezca nada —o Chrome enseña su página
triste—, la espera puede estar en la **conexión** y no en la aplicación. Desde el equipo del dueño se ha
medido que algunas conexiones **nuevas** hacia Vercel tardan ≈1, ≈3, ≈7 o ≈15 s en abrirse y las
**reutilizadas** no (D-246, I-203). Esos tiempos coinciden con los reintentos de Windows para abrir una
conexión, pero **un tiempo, solo, no demuestra la causa**: es compatible con un paquete perdido y
reenviado, con una espera en algún equipo del camino o con algo del propio equipo. Reiniciar, desplegar
o revertir no lo cambia: pasa antes de que la petición llegue a la aplicación.

**Cómo medirlo sin cambiar nada del equipo:** `build/i203/prueba-redes.ps1` (fuera de Git). Separa DNS,
conexión, TLS y espera, en conexiones nuevas y en una reutilizada, hacia Rifas, otro sitio de Vercel y
Cloudflare, y anota el adaptador y la puerta de enlace local de cada ejecución. Dura **como máximo 4
minutos** (`-LimiteSegundos`, más unos segundos de resumen); si se agotan, deja de pedir, conserva lo
medido y lo marca: la última fila del CSV dice `(fin);incompleta`, y una ejecución cortada a mano no
tiene fila de fin. Para una comprobación rápida a mano, unas diez veces, en PowerShell:

```powershell
curl.exe -s -o NUL -w "tcp=%{time_connect} tls=%{time_appconnect} primer_byte=%{time_starttransfer} total=%{time_total}`n" https://gestion-rifas.vercel.app/favicon.ico
```

y lo mismo con `https://www.cloudflare.com/favicon.ico`.

**La comparación entre redes la hace el dueño.** El cambio de red —de la de casa a los datos del
teléfono— lo hace él, y las dos ejecuciones se coordinan: el agente **no** ejecuta las dos dando por hecho
que la red cambió, y antes de comparar mira en el CSV que el adaptador o la puerta de enlace cambiaron de
verdad. Lo que sale se lee como **hipótesis**, nunca como conclusión:

| Lo que se ve | Hipótesis que deja abierta | Siguiente comprobación |
|---|---|---|
| Las conexiones nuevas a Rifas tardan con la red de casa y no con los datos del teléfono | Algo del camino entre la red de casa y Vercel: el router, el proveedor, una ruta | Repetir las dos en otra franja; si se repite, decidir con el dueño si se consulta al proveedor |
| Tardan en las dos redes, también hacia Cloudflare | Algo del propio equipo, o algo común a las dos redes | Medir desde otro dispositivo; no se cambia ninguna configuración del equipo sin el dueño |
| Tardan en las dos redes, pero solo hacia Vercel (Rifas y `vercel.com`) | La ruta hacia Vercel desde esta zona, o su borde | Mirar qué centro respondió (`centro`), repetir en otra franja y contrastar con el estado de Vercel |
| Las nuevas tardan y las reutilizadas no | La espera está al **abrir** conexiones, no en el servidor ni en la descarga | Las filas de arriba |
| Solo `rifas-login` tarda, y en la **espera**, no al conectar | El servidor: un arranque en frío o una llamada lenta | El registro del servidor, dentro de la hora (§6.b) |
| Nada tarda en ninguna | Que la lentitud sea intermitente y no coincidiera con la prueba | Repetir cuando vuelva a pasar, apuntando la hora |

Lo que **demostraría** una pérdida de paquetes es verlos: una captura en el equipo del dueño (por
ejemplo, con `pktmon`, la herramienta de Windows), que necesita permisos de administrador y solo se hace
si el dueño lo autoriza. Los registros de Vercel **no** ven nada de esto: anotan la petición cuando la
conexión ya existe, y sin duración.

### 6.b Si tarda **después** de conectar: el registro del servidor (D-251, cuando se publique)

Con D-251 publicado, el registro de Vercel escribe dos líneas que antes no escribía, y **solo** cuando pasan:

| Línea | Qué dice | Qué no dice |
|---|---|---|
| `[rifas:instancia] nueva · región iad1 · versión …` | Arrancó una instancia; la primera petición que atendió pagó ese arranque | Cuánto tardó esa petición |
| `[rifas:supabase] GET /rest/v1/… → 200 en 1840 ms` | Esa llamada a Supabase tardó **1 s o más** —medida desde la función, con la red entre Vercel y Supabase dentro—, o respondió **5xx**, o **no respondió** | Que la causa fuera Supabase y no el camino; nada de las llamadas que tardan menos |

**Lo que NO escribe:** ningún 4xx —ni el 401 `PGRST303` de I-202, que es rápido, ni el 423 de la pausa,
ni un 404— ni una llamada que falle rápido. **No captura todos los errores.** Los que la aplicación escribe
o lanza salen en las agrupaciones de errores de Vercel (`get_runtime_errors`); un 4xx que la aplicación
trata sin escribir nada no queda en ningún registro suyo. **I-202 se sigue con otras señales, que ya
existen**: esa agrupación y los 401 de `/rest/v1` en los registros de Supabase (`RUNBOOK` §12.6).

Cómo leerlo: Vercel → el proyecto → **Logs**, el minuto de la queja, y buscar `[rifas:`. **Solo guarda una
hora.** Ninguna de las dos líneas lleva datos de nadie: la ruta es la tabla o la función, sin la consulta.
Lo que sugiere cada caso es una **hipótesis**:

| En ese minuto | Hipótesis | Siguiente comprobación |
|---|---|---|
| Una o varias `[rifas:supabase]` | Supabase, o el camino entre Vercel y Supabase, tardó | El estado de Supabase, si se repite a la misma hora y, mientras guarden un día, sus registros |
| Una `[rifas:instancia] nueva` justo antes | Esa petición pagó un arranque en frío | Si se repite tras ratos sin uso |
| Ninguna de las dos | La espera estuvo fuera de lo que este registro mide: el navegador, la conexión, o llamadas que tardaron menos de 1 s cada una | La prueba de redes (§6.a) y la pestaña Red del navegador, con la hora |

---

## 7. Resultados oficiales de loterías

El recuadro del Panel muestra la programación y el número mayor **ya guardados**. No consulta
las páginas de las loterías al abrirlo. El proceso que las consulta corre aparte, con un
secreto de servidor.

El programador de producción (D-149) consulta las fuentes oficiales en segundo plano.
El recuadro puede aparecer vacío o con «Horario por confirmar» hasta el primer tick
exitoso: eso no es un fallo de la pantalla.

**Tres de las seis loterías se confirman solas; tres hay que mirarlas a mano.** Estado
comprobado **en el primer tick real de producción**, el **2026-09-01** (D-156), y **revalidado ese
mismo día contra las fuentes en vivo** (D-157, etapa 6/6): los tres números guardados siguen siendo
los que publica la fuente, dígito a dígito.

| Lotería | Día | Estado |
|---|---|---|
| Cruz Roja | martes | ✅ Se confirma sola — 3168 · **4939** · serie 112 |
| Medellín | viernes | ✅ Se confirma sola — 4850 · **2608** · serie 301 |
| Boyacá | sábado | ✅ Se confirma sola — 4639 · **7660** · serie 393 |
| Meta | miércoles | ⚠️ **A mano.** Responde a Colombia, pero **bloquea a la IP de Vercel** (**I-091**). D-154 la había dado por automatizable midiéndola desde aquí; desde el servidor no lo es |
| Cundinamarca | lunes | ⚠️ **A mano.** Sus actas son escaneos sin texto (I-086) |
| Bogotá | jueves | ⚠️ **A mano.** El sitio está tras un desafío de Cloudflare y su API exige un CAPTCHA (I-087) |

> **Desde el 2026-09-02 esto cambió (D-162, BR-L26).** Cuando la fuente oficial no puede entregar
> un sorteo, la aplicación consulta **fuentes alternativas** —Perlatodo, Ganar Chance y Loterías de
> Hoy— y confirma el número **solo si dos dominios distintos dicen lo mismo**. Con eso, **las tres
> loterías que había que mirar a mano ya no lo necesitan**: comprobado en vivo, Cundinamarca 4818 →
> 3478, Bogotá 2861 → 7280 y Meta 3313 → 8134.
>
> **Lo que hay que entender antes de fiarse:** esas fuentes **no son autoridades**. El Panel lo dice
> con todas las letras —«Verificado por 2 fuentes» en vez de «Fuente oficial»— y ahí conviene mirar
> el acta o la página oficial antes de pagar un premio grande. Si las fuentes se contradicen, la
> aplicación **no publica nada**: prefiere dejarlo pendiente.
>
> **Paga Todo no se usa**: responde 403 de Cloudflare a una consulta automatizada (I-093). No se
> elude.

> **Lo que cambia para quien opera:** los miércoles hay que mirar el resultado del Meta en
> `loteriadelmeta.gov.co` desde un navegador normal, igual que ya se hacía con Bogotá y
> Cundinamarca. La aplicación **no inventa** el número que no puede leer.

Lo que no se puede confirmar **no se muestra como resultado**: la plataforma detecta
coincidencias solo con lo que tiene confirmado, y nunca inventa un número.

**Lo que hay que mirar la primera vez que corra de verdad.** Estos cuatro adaptadores se
validaron contra el **último sorteo ya publicado** de cada lotería, que es lo máximo que se
puede comprobar sin esperar a un sorteo nuevo. En la primera ejecución real de cada uno —Cruz
Roja el martes, Meta el miércoles, Medellín el viernes, Boyacá el sábado— conviene abrir el
Panel al día siguiente y comparar el número mayor con la página oficial. Si no coincide, o si
`lottery_sync_runs` registra `structure_changed`, la página cambió de maquetación: ver
`RUNBOOK.md` §7.

**Un sorteo que no se capture a tiempo se pierde, y conviene saberlo.** Cruz Roja, Meta, Medellín
y Boyacá publican en su portada **un solo** resultado: el último. Mientras está ahí se lee; en cuanto
la entidad publica el siguiente, el anterior deja de ser legible por esa vía y la aplicación
**prefiere no publicar nada** antes que adivinar. Por eso el programador consulta a diez horas
distintas del día. Cundinamarca no tiene este problema —su acta vive en una URL por sorteo— y ya
pasó una vez: **Boyacá 4638**, del 22 de agosto, quedó sin resultado (I-092). No afecta a ninguna
boleta y **no se rellena a mano**.

**El primer tick no lo trae todo de golpe, y es a propósito.** Cada ejecución consulta como
mucho **seis** sorteos, de los jugados en los **últimos diez días**, empezando por el más
reciente (D-152). Si se importa el cronograma de un año, lo viejo no se rellena: se atiende lo
que el Panel enseña, y lo demás espera al tick siguiente. Un resultado ya confirmado no se
vuelve a pedir nunca.

**Dónde mirar las dos que no se confirman solas.** El acta de cada sorteo de Cundinamarca está
en `loteriadecundinamarca.com.co/actas-resultados`; el resultado de Bogotá, en
`loteriadebogota.com` desde un navegador normal —el desafío de Cloudflare solo estorba a una
consulta automática—.

Si hace falta dispararlo a mano en local: `npm run lottery:sync -- --probe` (solo
comprueba el secreto) o sin `--probe` (consulta de verdad), con `npm run dev:local` y
`LOTTERY_SYNC_SECRET` en `.env.local`.

Si el recuadro en producción se queda desactualizado, ver `RUNBOOK.md`.
