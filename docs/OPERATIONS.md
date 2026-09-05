# MANUAL DE OPERACIÓN

**Actualizado:** 2026-09-03. Para quien **opera el negocio** (Owner/Admin), no para quien
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

### Pago

Solo Owner/Admin — un vendedor no ve esta opción. Desde el detalle del pago (accesible desde
`/owner/payments` o desde el historial del cliente/boleta) → **"Anular pago"** → campo obligatorio
"Motivo de la anulacion" → confirmar. Efecto inmediato: las asignaciones de ese pago dejan de contar,
los saldos y el estado de pago (Sin pagar / Abonada / Pagada) de cada boleta afectada se recalculan
solos — nunca hay que ajustar nada a mano.

---

## 4.b Corregir el cliente de una boleta vendida

Cuando una boleta se le asignó a la persona equivocada, **no hay que anularla ni volver a venderla**.
Desde el detalle de la boleta —`/seller/tickets/[id]` para el vendedor, `/owner/tickets/[id]` para el
personal— hay un botón **«Cambiar cliente»** debajo de la tarjeta del cliente. Se elige el cliente
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

Lo puede hacer **el vendedor dueño de la boleta** y también el Dueño o un Administrador. El botón
desaparece, con su explicación en pantalla, cuando no se puede:

| Situación | Qué se ve | Qué hacer |
|---|---|---|
| La boleta tiene abonos en su historial —incluso anulados o corregidos a $0— | «Esta boleta tiene abonos en su historial: ya no puede cambiar de cliente ni liberarse.» | Si hubo dinero de por medio, la salida es **anular** la boleta (Dueño o Administrador), no liberarla |
| La boleta ya salió en un resultado de lotería | «Esta boleta ya hace parte de un resultado registrado: no puede cambiar de cliente ni liberarse.» | Nada: la fotografía del sorteo es inmutable a propósito |
| La rifa ya no está activa | «La rifa ya no está activa: esta boleta no se puede liberar.» | Ahí la única salida es **anularla**, y eso lo hace el Dueño o un Administrador |

**Liberar, anular y eliminar no son lo mismo**, y conviene tenerlo claro antes de tocar nada:

| | Qué pasa con la boleta | Qué pasa con sus números | Quién |
|---|---|---|---|
| **Liberar** | Vuelve a Disponible y se puede vender otra vez | Siguen siendo suyos | Su vendedor, o el personal |
| **Anular** | Queda Anulada para siempre | **Reservados**: no se reutilizan en esa rifa | Solo Dueño o Administrador |
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
