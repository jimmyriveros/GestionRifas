# REGLAS DE NEGOCIO

- **Versión:** 1.14 · **Estado:** normativo · **Actualizado:** 2026-09-03
- Cada regla tiene un identificador estable. Las pruebas de `docs/TESTING.md` lo referencian.
- Columna **Capas**: `C` = cliente (UX), `S` = servidor (Server Action/RPC), `D` = base de datos
  (restricción, trigger o política). Una regla crítica **siempre** incluye `D`.

---

## 1. Acceso y sesión (BR-A)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-A01 | Existe una sola página de autenticación (`/login`) con email y contraseña. | C, S | 1 |
| BR-A02 | Tras el login, Owner y Admin van a `/owner/dashboard`; Seller va a `/seller/dashboard`. | S | 1 |
| BR-A03 | Un usuario sin sesión no puede acceder a ninguna ruta protegida ni a sus datos. | S, D | 1 |
| BR-A04 | Un usuario inactivo no puede ingresar **ni** continuar operando con una sesión previamente emitida. La verificación ocurre en cada request del servidor y en RLS. | S, D | 1 |
| BR-A05 | El acceso efectivo requiere `profiles.is_active` **y** `memberships.is_active` **y** `organizations.is_active`. | S, D | 1 |
| BR-A06 | Existen recuperación y cambio de contraseña seguros; las contraseñas nunca se transmiten ni almacenan fuera de Supabase Auth. | S | 1 |
| BR-A07 | El rol se resuelve **siempre** en el servidor desde `memberships`, nunca desde datos enviados por el cliente. | S, D | 1 |
| BR-A08 | Un Seller que accede a una ruta `/owner/*` recibe acceso denegado, no un error 500 ni datos parciales. | S | 1 |

---

## 2. Organización (BR-O)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-O01 | Toda entidad de negocio pertenece a exactamente una organización. | D | 2 |
| BR-O02 | Ningún usuario puede leer ni escribir datos de otra organización por ninguna vía. | S, D | 2 |
| BR-O03 | Las relaciones entre entidades no pueden cruzar organizaciones (FK compuestas con `organization_id`). | D | 2 |
| BR-O04 | Cada organización tiene exactamente un Owner activo. | D | 2 |
| BR-O05 | La moneda del MVP es COP; el precio predeterminado de la organización es `120000` (D-098). La columna `organizations.default_ticket_price` existe y se mantiene coherente, pero **hoy no la lee ningún camino de código**: el formulario de rifa nueva usa `DEFAULT_TICKET_PRICE`. | D | 2 · post-9 |

---

## 3. Usuarios y roles (BR-U)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-U01 | Owner y Admin pueden crear administradores y vendedores. | S, D | 3 |
| BR-U02 | Un Admin **no** puede eliminar, desactivar ni modificar al Owner. | S, D | 3 |
| BR-U03 | Un Admin **no** puede convertirse en Owner ni transferir la propiedad de la organización. | S, D | 3 |
| BR-U04 | Solo el Owner puede transferir la propiedad de la organización (fuera del MVP como interfaz; la restricción sí existe). | D | 2 |
| BR-U05 | Un usuario tiene un único rol por organización. | D | 2 |
| BR-U06 | Desactivar a un usuario no borra sus datos históricos: sus boletas, clientes y pagos permanecen. | S, D | 3 |
| BR-U07 | Un vendedor nunca accede a información de otro vendedor por UI, URL, ID manipulado, request directo, API o cliente Supabase. **Única excepción, acotada: las ventas de su propio equipo (BR-E05).** | S, D | 2 |
| BR-U08 | El campo teléfono es obligatorio para todo usuario; el alias es opcional. | C, S, D | 3 |
| BR-U09 | Una organización tiene **siempre** un Owner activo: nadie, ni el propio Owner, puede dejarla sin propietario. | D | **9** |

**BR-U09 nació de un hueco real (A-02, I-025).** El índice `memberships_one_owner_per_org` garantiza
«como máximo un Owner», nunca «al menos uno», así que hasta la Fase 9 un Owner podía degradarse o
desactivarse a sí mismo con una llamada directa a PostgREST y dejar la organización **sin
propietario y sin forma de repararlo desde la aplicación** — el ex-Owner deja de ser staff y un Admin
no puede ascender a nadie a Owner (BR-U03). Lo cierra el trigger diferido de la migración `0016`
(D-071). Es **diferido** para que transferir la propiedad en una sola transacción siga siendo posible.

---

## 3.b Equipos de vendedores (BR-E)

Cualquier vendedor puede formar su equipo: no existe una categoría especial de «vendedor supervisor».
La diferencia entre un vendedor con equipo y uno sin equipo es solo que el primero creó integrantes.

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-E01 | Un integrante de equipo **es** una membresía con rol `seller` y `parent_seller_id` apuntando a su vendedor padre. No hay rol nuevo, ni tabla nueva, ni entidad separada. `parent_seller_id` nulo = vendedor a cargo del Dueño o el Administrador. | D | post-9 |
| BR-E02 | El vendedor padre debe ser un vendedor **activo de la misma organización**. La FK compuesta contra `(profile_id, organization_id)` lo hace imposible de violar entre organizaciones. | D | post-9 |
| BR-E03 | **Dos niveles.** Un vendedor que ya pertenece al equipo de alguien no puede formar el suyo. El modelo admite más profundidad; lo que la limita son el trigger `memberships_validate_parent_seller` y la política de alta. | S, D | post-9 |
| BR-E04 | Un vendedor solo crea integrantes **para su propio equipo** y **siempre con rol vendedor**. No puede crear administradores ni dueños, ni meter gente en el equipo de otro, ni crear vendedores sueltos a cargo del Dueño (eso sigue siendo BR-U01). | S, D | post-9 |
| BR-E05 | El vendedor padre ve las **ventas** de su equipo y los indicadores que salen de ellas, **solo dentro de «Mi equipo»** y a través de `team_sales_summary` / `team_member_sales`. **No** ve sus clientes, **no** ve sus pagos, **no** puede modificarles nada, y sus propias pantallas («Mis boletas», su panel, sus reportes, su búsqueda) siguen mostrando **únicamente lo suyo**. Es la única excepción a BR-U07 y no se amplía sin una decisión explícita (D-092). | S, D | post-9 |
| BR-E06 | Un vendedor no puede cambiar su propio `parent_seller_id` ni el de nadie. Reorganizar equipos es exclusivo del Dueño y el Administrador. | D | post-9 |
| BR-E07 | La visibilidad es **en un solo sentido**: un integrante no ve las ventas de su vendedor padre ni las de sus compañeros de equipo. | D | post-9 |
| BR-E08 | El Dueño y el Administrador conservan visibilidad y control totales: ven todos los equipos, pueden crear un vendedor ya dentro de un equipo y pueden moverlo de equipo. | S, D | post-9 |
| BR-E09 | Desactivar a un integrante no lo borra del equipo ni de su historial: sus ventas siguen contando para lo ya ocurrido y su vendedor padre las sigue viendo (mismo criterio que BR-U06). | D | post-9 |
| BR-E10 | Los avisos son **correspondencia dirigida**: cada persona ve solo los suyos, ni siquiera el Dueño ve la bandeja de otro. Nadie los escribe a mano; los crea la base de datos al ocurrir el hecho, en la misma transacción. Lo único que puede hacer el destinatario es marcarlos como leídos. | S, D | post-9 |
| BR-E11 | **Se avisa cuando alguien agrega un vendedor a su equipo.** Destinatarios: el Dueño y los Administradores. El primero de un equipo se cuenta distinto del resto («armó su equipo» / «agregó a»). | D | post-9 |
| BR-E12 | **Se avisa cuando se vende una boleta.** Destinatarios: el vendedor padre de quien vendió, si lo tiene, y el Dueño y los Administradores. A quien vende **no** se le avisa su propia venta. | D | post-9 |
| BR-E13 | El **texto** de un aviso no se guarda en la base de datos: se guarda qué pasó y con qué datos, y la frase la arma la aplicación (I-030, D-093). | S | post-9 |
| BR-E14 | Una cuenta está **activada** cuando su dueña configuró su contraseña, y eso lo marca la aplicación en `profiles.activated_at`. **Abrir el enlace de la invitación no activa nada**, aunque Auth dé el correo por confirmado y escriba un hash en `encrypted_password` (D-097). `activated_at` nulo = **invitación pendiente**, que es distinto de `is_active`: aquello dice si el personal le quitó el acceso. | S, D | post-9 |
| BR-E15 | El vendedor padre puede corregir **nombre, alias y celular** de los integrantes de **su** equipo, siempre, esté la cuenta pendiente o activa. Se hace por función (`team_update_member`), no por política: `authenticated` tiene UPDATE sobre todas las columnas de `profiles`, así que abrirla habría dejado además reescribir `is_active` de un integrante. | S, D | post-9 |
| BR-E16 | El **correo** solo se corrige mientras la invitación siga pendiente. Corregirlo obliga a rehacer la invitación, y la anterior queda **invalidada**: nunca hay dos válidas a la vez. Una vez activada la cuenta, el correo es de solo lectura para todos —es la credencial de esa persona—. Si el envío falla, el correo vuelve al anterior. | C, S, D | post-9 |
| BR-E17 | El vendedor padre puede **eliminar** un alta equivocada de su equipo: solo si nunca se activó y no tiene boletas, clientes ni pagos. Es el mismo verbo acotado de BR-B05, no un atajo para dar de baja: a quien ya ingresó se le **desactiva**, y eso sigue siendo del personal (BR-U06, D-038). | C, S, D | post-9 |
| BR-E18 | Eliminar borra la membresía y la cuenta de Auth; el perfil se va en cascada y con él cualquier invitación pendiente. No queda ningún enlace utilizable. | S, D | post-9 |
| BR-E19 | Corregir datos, cambiar de correo y eliminar quedan en `audit_logs` con el vendedor padre como actor (`user.update`, `user.email_change`, `user.delete`). El cambio de correo se anota **después** de ocurrir, nunca al autorizarlo. | D | post-9 |

**Por qué la excepción de BR-E05 es tan estrecha.** Abrir la RLS es la parte irreversible de esta
funcionalidad: una vez que un rol ve una fila, cualquier pantalla —incluidas las que nadie ha escrito
todavía— puede enseñarla. Por eso ninguna política de `tickets`, `clients` o `payments` cambió: las
ventas del equipo se leen por dos funciones que solo saben responder por el equipo de quien llama
(D-092). Un vendedor padre puede responder «cuánto vendió Pedro», no «a quién se lo vendió» ni «cuánto
dinero recogió», y su propio «Mis boletas» sigue siendo exactamente el suyo.

**Por qué «activada» no se puede deducir de `auth.users` (BR-E14).** El primer diseño miraba
`encrypted_password`, porque una cuenta invitada nace sin contraseña. La prueba BD E2-02 lo desmontó:
al verificar el enlace de la invitación, GoTrue **escribe un hash aleatorio** en esa columna, así que
con ese criterio bastaba abrir el correo para quedar activado —justo lo que el encargo prohibía—.
El momento lo marca la aplicación, que es la única que lo sabe: al terminar de definir la contraseña
en `/reset-password` y al entrar con contraseña (D-097).

---

## 3.c Comisiones del vendedor (BR-G)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-G01 | La comisión se gana **por boleta pagada por completo** (`payment_status = 'paid'`), no por boleta vendida. Así la empresa nunca debe comisión por dinero que no entró. | D | post-9 |
| BR-G13 | **La forma de pago la decide el equipo.** Quien **no depende de nadie** —incluido el vendedor que armó su propio equipo— cobra **la mitad del precio vigente de la rifa** por cada boleta cobrada completa. Quien fue creado **dentro de un equipo** (`parent_seller_id` no nulo) cobra según su `commission_model`: **tramos** (BR-G02, BR-G03) o una **cifra fija** (BR-G24). *Actualizada el 2026-08-27 por D-127: antes decía que todo integrante cobraba por tramos, sin alternativa.* | D | post-9 |
| BR-G14 | En la forma «mitad del precio» **no hay niveles**: todas las boletas valen lo mismo y no existe «próximo nivel». La pantalla no puede hablarle de subir de nivel a quien no tiene niveles. | C, S | post-9 |
| BR-G15 | Esa mitad se calcula sobre el **precio vigente de la rifa**, no sobre el `sale_price` congelado en la boleta (BR-P04). Consecuencia buscada: **cambiar el precio de la rifa cambia lo que se debe** por ventas ya cobradas, y el sistema lo recalcula solo. | D | post-9 |
| BR-G16 | Entrar o salir de un equipo **cambia la forma de pago y se aplica hacia atrás**: el sistema recalcula todas las rifas de esa persona en el momento del cambio, sin esperar a su próxima venta. | D | post-9 |
| BR-G02 | La tarifa sube por tramos y es **retroactiva**: al alcanzar un tramo, **todas** las boletas acumuladas pasan a la tarifa nueva. 21 boletas son 21 × $25.000, no 20 × $20.000 + 1 × $25.000. | D | post-9 |
| BR-G03 | Tramos por defecto: **1–20 → $20.000 · 21–30 → $25.000 · 31–50 → $30.000 · 51+ → $40.000**. Viven en la tabla `commission_tiers`, por organización; cambiarlos es cambiar filas, no desplegar. | D | post-9 |
| BR-G04 | El ámbito es **la rifa**: el acumulado no se reinicia cada semana, y cada rifa lleva su propio conteo y su propio tramo. | D | post-9 |
| BR-G05 | El importe es **una función del estado actual** (`n × tarifa(n)`), no una suma de incrementos. El motor recuenta y registra la diferencia. | D | post-9 |
| BR-G06 | La comisión **baja sola** cuando deja de haber cobro: al anular un pago, la boleta deja de contar y el tramo se recalcula hacia atrás. | D | post-9 |
| BR-G07 | Si una boleta cambia de vendedor, deja de contar para uno y empieza a contar para el otro, y **ambos** se recalculan. En el esquema actual esto solo puede ocurrir con boletas **sin vender**: mover una vendida es imposible (ver nota). | D | post-9 |
| BR-G08 | **Nunca hay doble comisión.** Un evento repetido, un reintento o un doble clic recalculan el mismo `n × tarifa(n)`: la diferencia es cero y no se escribe nada. | D | post-9 |
| BR-G09 | Todo movimiento queda en `commission_ledger`, **solo anexado**: vendedor, rifa, boleta, fecha, tramo, monto y motivo. Nunca se modifica una cifra histórica en silencio. | D | post-9 |
| BR-G10 | **`SUM(commission_ledger.amount) = seller_commissions.earned`**, siempre. Es la invariante que comprueban las pruebas en cada escenario: si se rompe, el historial dejó de explicar el saldo. | D | post-9 |
| BR-G11 | Un vendedor **no puede modificar** su comisión, su tramo, su recuento ni su ganancia: no existe privilegio de escritura sobre las tres tablas para ninguna sesión. Todo lo escribe una función `SECURITY DEFINER`. | D | post-9 |
| BR-G12 | Cada quien ve su comisión; el vendedor padre, la de su equipo; el Dueño y el Administrador, la de toda la organización. El **detalle de movimientos** es de cada quien y del personal. | D | post-9 |
| BR-G17 | **La rebaja que concede un vendedor la asume él, entera.** Su comisión pasa a ser `n × tarifa(n) − Σ rebajas de sus boletas cobradas`. Lo que le queda a la empresa —`precio oficial − tarifa` por boleta— **no cambia nunca** por una rebaja. | D | post-9 |
| BR-G18 | El **descuento máximo** es la tarifa **mínima garantizada** de esa persona en esa rifa, no la que cobra hoy: el tramo más bajo de la organización para quien cobra por tramos, **su cifra fija para quien cobra fijo** (no se mueve con el volumen), y la mitad del precio para quien no pertenece a un equipo. La tarifa por tramos baja sola al anularse un pago (BR-G06), así que una rebaja calculada sobre la tarifa alta dejaría esa venta en comisión negativa. | C, S, D | post-9 |
| BR-G19 | La comisión **nunca es negativa**. `commission_floor_rate` ya lo impide por diseño; el recorte a cero del motor cubre los caminos que quedan —bajar el precio de la rifa después de una venta rebajada (BR-G15) y **bajar la cifra fija de un integrante que ya rebajó** (BR-G24)—. Este negocio no tiene deudas del vendedor hacia la empresa. | D | post-9 |
| BR-G20 | **El vendedor padre cobra por las ventas de su equipo, y de ahí sale la ganancia del integrante.** Por cada boleta que un integrante cobra por completo, el padre recibe **la mitad del precio vigente de la rifa menos la tarifa del integrante**. Se guarda aparte, en `seller_commissions.team_earned`, y no se mezcla con lo que ganó vendiendo él mismo. | D | post-9 |
| BR-G21 | **La empresa se queda siempre la mitad del precio de cada boleta cobrada, la venda quien la venda.** Es la consecuencia de BR-G20 y la invariante que ordena todo el reparto: `cobrado − Σ comisiones = n × (precio oficial ÷ 2)`. No depende del tramo, ni del reparto interno del equipo, ni de las rebajas. Lo comprueba `E10-06`. | D | post-9 |
| BR-G22 | El ledger separa las dos procedencias con `commission_ledger.team_movement`, y **BR-G10 se cumple por partes**: `sum(amount where not team_movement) = earned` y `sum(amount where team_movement) = team_earned`. Comprobarlas por separado es más fuerte que comprobar el total, donde un error podría compensarse entre las dos. `from_seller_id` dice de qué integrante vino, cuando lo provocó uno concreto. | D | post-9 |
| BR-G23 | La cifra fija de un integrante **no puede superar la mitad del precio de la rifa**: es el bolsillo entero de su vendedor padre por esa boleta (BR-G20). En el tope justo, el padre cede su parte completa y se queda con cero; nunca puede quedar en negativo. Lo aplica un trigger sobre `memberships`, así que cubre el alta y la edición por igual. | C, S, D | post-9 |
| BR-G24 | **Dos formas de pagarle a un integrante**, elegidas por su vendedor padre: `tiered` (los tramos de la organización, y el valor por defecto) o `fixed_per_ticket` (una cifra fija por boleta cobrada completa, sin niveles). Viven en `memberships.commission_model` y `fixed_commission_amount`, que **es** la relación entre el padre y el integrante. Con `parent_seller_id` nulo la configuración queda inerte, no se borra: volver a entrar al equipo la reactiva tal como estaba. | C, S, D | post-9 |
| BR-G25 | Cambiar la forma de pago **recalcula hacia atrás todas las rifas** del integrante y la parte de su vendedor padre, **en la misma transacción** que el cambio. Si el recálculo falla, la configuración no queda guardada: nunca hay una cifra nueva junto a unos importes viejos. Lo dispara el trigger `memberships_sync_commission`. | D | post-9 |
| BR-G26 | Solo el **vendedor padre** cambia la configuración de **su propio** equipo, por `team_set_commission_model` y bajo `team_member_guard` (la misma puerta que corregir y eliminar a un integrante). No existe política de UPDATE para un vendedor sobre `memberships`: una la habría dejado reescribir además `is_active`, `role` o `parent_seller_id`. Queda en `audit_logs` con la acción `user.commission_model`. | S, D | post-9 |

**Por qué BR-G17 es la traducción correcta del encargo.** El encargo pedía «el Admin nunca pierde
dinero por el descuento» y lo expresaba como `adminAmount = officialPrice × adminPercentage`. **Aquí
no se configura ningún porcentaje del Admin**: se configura al revés, lo que gana el vendedor
(BR-G13), y la parte de la empresa es lo que sobra. Con esa correspondencia la regla sale sola y se
comprueba como una identidad, no como una cifra:

```
cobrado a los clientes − comisión del vendedor = n × (precio oficial − tarifa)
```

El lado derecho **no contiene la rebaja**. Da igual cuánto rebaje el vendedor: lo que le queda a la
empresa depende solo del precio oficial y de la tarifa pactada. Lo comprueba `E8-10`.

**Matiz añadido el 2026-08-27 (BR-G20, D-127).** Ese lado derecho dejó de ser «lo de la empresa»
cuando quien vende es un integrante de equipo: de ahí sale además la parte de su vendedor padre. La
identidad sigue siendo cierta y sigue garantizando lo que garantizaba —la rebaja no la toca—, pero lo
que la empresa se queda de verdad es lo de BR-G21: **la mitad del precio, siempre**. Las dos se
comprueban por separado, `E8-10` y `E10-06`.

**Nota sobre BR-G07 — reasignar una boleta vendida es imposible, no solo prohibido.**
`tickets_client_seller_fk` es una FK compuesta `(client_id, seller_id) → clients (id, seller_id)` y
**no es diferible**. Una boleta vendida siempre tiene cliente, y el cliente pertenece a su vendedor
(BR-C05): mover la boleta rompe la FK, mover el cliente primero rompe la de todas sus boletas, y no
hay transacción que lo salve. Comprobado con la *service role*, que se salta la RLS y las funciones de
negocio. El motor conserva su rama de cambio de vendedor porque cubre las boletas **sin vender**
(BR-B04) y deja el camino listo si algún día el negocio permite trasladar una cartera completa.

> ~~**Todavía no existe comisión del vendedor padre sobre las ventas de su equipo.** Es una regla
> comercial que el dueño aún no ha definido. La arquitectura queda preparada —el ledger tiene tipo de
> movimiento y el estado es por vendedor—, pero no se implementa nada de eso.~~
>
> **Sustituido el 2026-08-27 por BR-G20 (D-127).** El dueño definió la regla: el vendedor padre cobra
> por las ventas de su equipo, y de ahí sale la ganancia del integrante. La previsión resultó
> acertada —el motor no cambió de principio y el ledger absorbió los movimientos nuevos con una
> columna— pero se quedó corta en un punto que costó una prueba encontrar: hizo falta separar el
> ledger por procedencia (BR-G22), porque el estado por vendedor ya no explica de dónde vino su
> dinero.

---

## 4. Rifas (BR-R)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-R01 | Una organización puede tener varias rifas. | D | 2 |
| BR-R02 | Estados válidos: `draft`, `active`, `closed`, `cancelled`. | D | 2 |
| BR-R03 | Transiciones permitidas: `draft → active`, `active → closed`, cualquiera → `cancelled`. `closed → active` solo por el Owner y queda auditado. | S, D | 3 |
| BR-R04 | Una rifa nueva usa `120000` como precio predeterminado (D-098). | C, S, D | 3 · post-9 |
| BR-R05 | Owner o Admin puede definir un precio distinto para una rifa futura. | S | 3 |
| BR-R06 | Cambiar el precio de la rifa **no** modifica el `sale_price` de boletas ya vendidas. | D | 2 |
| BR-R07 | `end_date` no puede ser anterior a `start_date`. | C, S, D | 3 |
| BR-R08 | En una rifa `closed` o `cancelled` no se pueden crear boletas nuevas ni asignar boletas a clientes. | S, D | 3 |
| BR-R09 | En una rifa `closed` **sí** se pueden registrar pagos de deudas pendientes; en una rifa `cancelled` no. (D-011) | S, D | 5 |
| BR-R10 | `allow_seller_ticket_creation` controla si los vendedores pueden crear boletas en esa rifa. | S, D | 3 |
| BR-R11 | El nombre de la rifa es único dentro de la organización (comparación sin distinción de mayúsculas ni espacios extremos). | D | 2 |

---

## 5. Clientes (BR-C)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-C01 | Cada cliente pertenece a una organización y a un vendedor. | D | 2 |
| BR-C02 | Nombre y teléfono son obligatorios; alias y email son opcionales. | C, S, D | 4 |
| BR-C03 | Un cliente puede tener múltiples boletas. | D | 2 |
| BR-C04 | Un vendedor puede reutilizar un cliente existente al vender nuevas boletas. | S | 4 |
| BR-C05 | Un cliente **no** se comparte automáticamente entre vendedores. | D | 2 |
| BR-C06 | Un cliente con movimientos históricos se archiva (`archived_at`), nunca se elimina físicamente. | S, D | 4 |
| BR-C07 | Un cliente archivado no aparece en los selectores de asignación, pero su historial sigue visible. | C, S | 4 |
| BR-C08 | La búsqueda de clientes opera sobre nombre, alias, teléfono y email. | S | 4 |
| BR-C09 | El perfil del cliente muestra: información general, boletas compradas con fecha y precio, total comprado, total pagado, saldo pendiente, estado de pago e historial de abonos. | C, S | 4 / 5 |

---

## 6. Numeración de boletas (BR-N) — reglas críticas

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-N01 | `daily_number` y `weekly_number` se almacenan como **texto**. | D | 2 |
| BR-N02 | Solo se aceptan dígitos, entre 1 y 4 caracteres (`^[0-9]{1,4}$`). | C, S, D | 2 |
| BR-N03 | Los ceros iniciales se conservan exactamente como se ingresaron. Prohibido `TRIM`, `LTRIM`, casteo numérico o normalización en cualquier capa. | C, S, D | 2 |
| BR-N04 | La combinación (`organization_id`, `raffle_id`, `daily_number`, `weekly_number`) es única. | D | 2 |
| BR-N05 | La unicidad aplica **entre vendedores**: dos vendedores no pueden tener la misma combinación en la misma rifa. | D | 2 |
| BR-N06 | La misma combinación **sí** puede existir en una rifa distinta. | D | 2 |
| BR-N07 | Un número individual puede repetirse mientras la combinación completa sea distinta (`1234/5678` y `1234/9999` coexisten). | D | 2 |
| BR-N08 | En el MVP, una combinación de una boleta **anulada no puede reutilizarse** dentro de la misma rifa. | D | 2 |
| BR-N09 | Una boleta fuera de `draft` debe tener ambos números; un campo vacío en una boleta disponible es inválido. | S, D | 2 |
| BR-N10 | La validación de duplicados ocurre en las tres capas: dentro del formulario, contra la base de datos y como restricción física. | C, S, D | 3 |
| BR-N11 | **Una boleta se busca por su número diario y, en segundo lugar, por su número semanal.** El código interno no participa en ninguna búsqueda de la interfaz y solo se muestra dentro del detalle de la boleta. | C, S, D | post-9 |
| BR-N13 | **El mismo buscador encuentra también por el cliente que tiene la boleta.** Un solo campo: si se escriben de 1 a 4 dígitos busca por número (BR-N11); si se escribe texto, busca por el cliente. El resultado es **siempre una lista de boletas**. | C, S, D | post-9 |

| BR-N12 | **Las boletas se pueden importar desde un archivo CSV o JSON.** La rifa y el vendedor los pone la pantalla. Cada fila lleva los dos números y puede añadir cliente, pero en ese caso **nombre y celular son obligatorios juntos**. Siempre hay vista previa y confirmación antes de guardar. | C, S, D | post-9 |

| BR-N14 | **Una fila del archivo puede traer el abono ya cobrado de esa boleta.** Se escribe en miles («20»), en pesos («20.000», «20000») o con la palabra **«Cancelado»**, que vale el precio completo de esa boleta. El abono es de SU boleta y **no se reparte** entre las demás del cliente. Exige cliente, porque solo se abona una boleta vendida. | C, S, D | post-9 |

**BR-N12 en detalle** (migraciones `0019` y `0021`; D-081 y D-087). La importación **no añade ni relaja ninguna regla
de boletas**: valida con `validateBulkRows` —el mismo motor que la carga manual— y guarda por los
mismos caminos, así que BR-N01 a BR-N10 se aplican íntegras.

| Aspecto | Regla |
|---|---|
| Formatos | CSV (recomendado) y JSON (avanzado). Hasta **1.000** boletas por archivo, y hasta 1 MB |
| Columnas del CSV | Obligatorias: «Premio semanal» y «Premio diario». Administrativamente se pueden añadir «Cliente» (o «Nombre»), «Celular» y «Abono»; se reconocen sus alias en español e inglés sin distinguir mayúsculas, acentos ni guiones bajos |
| Columnas de más | Se ignoran, incluida la numeración `#` |
| Sin reconocer | **No se rechaza el archivo**: se pide elegir a mano qué columna es cada número |
| Claves del JSON | **Las mismas que los encabezados del CSV**, y además en `snake_case` y `camelCase`: `daily_number`, `premio_diario`, `dailyNumber` y «Premio diario» son la misma columna. Una sola tabla de alias para los dos formatos (`matchJsonKey`, D-129) |
| Cliente opcional por fila | Si aparece cliente, **nombre y celular son obligatorios juntos** (BR-C02). Una fila puede omitir ambos y quedar sin asignar; los archivos antiguos de dos columnas conservan el mismo resultado |
| Abono opcional por fila | Vacío = sin abono y **sin ningún movimiento**. Con valor, exige cliente en la misma fila (BR-N14) |
| Quién puede importar con cliente | Owner/Admin. Un Seller conserva el flujo anterior: sus boletas nacen `pending_approval` y sin cliente; una fila con cliente se bloquea para no saltarse BR-I03/BR-I09 |
| Identidad | Solo dentro de la cartera del vendedor seleccionado. Nombre normalizado + celular nacional normalizado agrupan filas; una coincidencia activa, exacta y única reutiliza el cliente. Cliente archivado, coincidencias múltiples o el mismo celular con otro nombre son conflicto visible; nunca se adivina ni se cruza cartera u organización |
| Números | **Texto siempre.** Ni `Number()`, ni `parseInt()`, ni relleno con ceros: «46» se guarda «46» y «0046» se guarda «0046» (BR-N03) |
| Qué se rechaza | Solo el archivo ilegible: vacío, sin dos columnas, JSON roto o sin ningún campo reconocible. Un problema de **fila** se muestra en la vista previa junto a las filas que sí sirven |
| Estado de las boletas | Sin cliente: `available` si las crea el personal, `pending_approval` si las crea un vendedor. Con cliente y desde Owner/Admin: `assigned`, con precio/fecha/auditoría aplicados por `assign_ticket_row` |
| Vista previa | Obligatoria. Elegir el archivo **no escribe nada** |
| Importación parcial | Permitida y **nunca silenciosa**: se dice cuántas quedan fuera antes de confirmar, y cuáles después |
| Atomicidad con clientes | Crear clientes, crear las boletas que no chocan, asignarlas y cobrar sus abonos ocurre en una sola RPC. Una ambigüedad, un error de identidad o un abono inválido revierte pagos, clientes, boletas y contador; una combinación ya tomada se informa como conflicto normal |
| Auditoría | Una fila `ticket.import` en `audit_logs` con quién, cuándo, rifa, vendedor, tipo de archivo y recuentos. **No se guarda el archivo** |

**BR-N14 en detalle** (migración `0033`, D-129). Es la columna «Abono», y **no añade ninguna regla de
dinero nueva**: registra el abono llamando a `create_payment`, la misma función del formulario manual.

| Aspecto | Regla |
|---|---|
| Cómo se escribe | En miles (`20` → $20.000), en pesos (`20.000`, `20000` → $20.000) o **«Cancelado»**, que vale el precio completo de esa boleta. Mayúsculas, acentos y espacios laterales dan igual |
| Dónde está el corte | En `ticket_price / 1000`, **calculado**, nunca escrito. Con una rifa de $120.000 el corte es 120; con una de $50.000, 50 (D-098) |
| Qué se limpia | El símbolo `$`, los espacios y los separadores de miles (`.` y `,`) en grupos de tres. Un decimal (`20,5`) **no** es un abono: se rechaza en vez de leerse como 205 |
| Qué NO vale | «Completa», «Pagada» y parecidas: el mensaje dice cuál es la palabra buena. Cero, negativo, texto no reconocido y cualquier valor por encima del precio de la boleta |
| A quién pertenece | A **su** boleta. Un pago por fila, con una sola asignación; nunca se reparte ni se suma entre las boletas del mismo cliente |
| Qué exige | Cliente en la misma fila. Sin cliente la boleta no está vendida y no admite abonos (BR-F02, BR-F04) |
| Qué genera | Fila en `payments` y en `payment_allocations`, con método «Efectivo» —el mismo que trae puesto el formulario manual— y la nota «Abono importado desde archivo». De ahí derivan solos el saldo, el estado de pago (BR-F07) y la comisión |
| Estado resultante | Menos que el precio → **Abonada**; igual al precio → **Pagada** y saldo exactamente en cero. Sin abono → **Sin pagar**. Lo calcula la base de datos, no el importador |
| Quién puede | Owner/Admin. Un Seller no importa con cliente (BR-I03/BR-I09), así que tampoco con abono |
| Vista previa | Muestra el importe **ya convertido a pesos** y el estado en que quedará la boleta, antes de confirmar. Es donde se ve un dedazo |
| Validación | Tres capas, como todo lo demás: la lectura del archivo, el esquema Zod de la Server Action y la RPC, que compara contra el `ticket_price` **real** y deja la última palabra al tope de sobrepago de `create_payment` (BR-F12) |

**BR-N11 en detalle** (migración `0018`, D-080). Es la regla que gobierna búsqueda y presentación:

| Aspecto | Regla |
|---|---|
| Dónde se busca | `daily_number` y `weekly_number`. **Nunca** `internal_code` |
| Cómo se compara | Como **texto** y por **coincidencia parcial**: «123» encuentra `1234`, `0123` y `1237`; «00» encuentra `0017` |
| Qué término va por aquí | Exactamente de 1 a 4 dígitos (BR-N02). Cualquier otra cosa —letras, un código interno, 5 cifras— **ya no se descarta**: desde `0029` pasa por la búsqueda del cliente (BR-N13). Lo que sigue siendo cierto es que **no se interpreta como un número de boleta** |
| Orden de los resultados | Diario exacto → diario empieza → diario contiene → semanal exacto → semanal empieza → semanal contiene. Dentro del mismo escalón, por número ascendente |
| Dónde se muestra el código | Solo en el detalle de la boleta, bajo «Información administrativa» |
| Qué NO cambia | El código interno sigue siendo el identificador administrativo, se sigue generando, se sigue guardando y se sigue indexando. Las claves primarias y las relaciones no se tocan |

BR-N03 (los ceros iniciales se conservan) manda también aquí: el término **no** se convierte a entero
en ninguna capa, porque `parseInt('0017')` perdería justo lo que distingue una boleta de otra.

**BR-N13 en detalle** (migración `0029`, D-100). Amplía BR-N11 **sin tocar nada de lo que ya hacía**:
la rama de números quedó idéntica, y sus pruebas son la red que lo demuestra.

| Aspecto | Regla |
|---|---|
| Cuántos buscadores hay | **Uno.** No hay pestañas, ni selector de «buscar por…», ni pantalla intermedia. Quien busca escribe lo que recuerda y la consulta distingue sola |
| Cómo se decide la rama | `^[0-9]{1,4}$` → números (BR-N11). Cualquier otro texto → cliente. Un dígito suelto sigue siendo una boleta; una sola letra no busca nada |
| Contra qué se compara | `clients.search_text` (migración `0017`): nombre, alias, teléfono —con y sin separadores— y correo, normalizados sin tildes ni mayúsculas. Es **la misma columna** que usa el buscador de «Clientes»; no hay una segunda forma de normalizar |
| Consecuencia buscada | Escribir «Jimmy» en «Boletas» devuelve **las boletas de Jimmy**, cada una con sus dos números, su cliente y su estado. **No** devuelve una ficha de Jimmy: seguimos en «Boletas», y tocar un resultado abre **esa** boleta |
| Orden de los resultados | Nombre completo exacto → el nombre empieza por lo escrito → una de sus palabras empieza por lo escrito (así «Riveros» encuentra a «Jimmy Riveros») → el resto. Dentro del mismo escalón: por nombre, y las boletas de una misma persona **juntas** y por número |
| Nombres repetidos | Dos personas pueden llamarse igual y salen **las boletas de las dos**. Se agrupan y se navega **por `id`**; el nombre nunca identifica a nadie |
| Boleta sin cliente | No puede coincidir con ningún nombre y no aparece. Por su número se sigue encontrando igual |
| Permisos | Los mismos de siempre, sin una línea nueva: `search_tickets` es `security invoker` y lee `tickets` bajo `tickets_select` y `clients` bajo `clients_select`, que son simétricas. Un vendedor solo encuentra **sus** boletas por el nombre de **sus** clientes, y el cliente de otro vendedor no se revela ni existiendo con el mismo nombre |
| Comodines | `%`, `_` y `\` se **borran** del término antes de comparar: se escriben, no se ejecutan |

Ejemplos normativos:

| Valor | ¿Válido? | Motivo |
|-------|----------|--------|
| `1`, `25`, `007`, `0000`, `9999` | Sí | 1–4 dígitos |
| `12345` | No | 5 dígitos |
| `12A4` | No | Carácter no numérico |
| `-123` | No | Signo |
| `12.5` | No | Separador decimal |
| `` (vacío) en boleta disponible | No | BR-N09 |

---

## 7. Inventario de boletas (BR-I)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-I01 | Estados de inventario: `draft`, `pending_approval`, `available`, `assigned`, `cancelled`. | D | 2 |
| BR-I02 | `draft`: faltan datos o la boleta no está lista. | D | 2 |
| BR-I03 | `pending_approval`: creada por un vendedor y pendiente de aprobación administrativa. | S, D | 3 |
| BR-I04 | `available`: completa, aprobada y sin cliente. | D | 2 |
| BR-I05 | `assigned`: tiene cliente, `sale_price`, `sale_date` y `assigned_at`. | D | 2 |
| BR-I06 | `cancelled`: anulada, no utilizable, conserva sus números. | D | 2 |
| BR-I07 | No se puede asignar una boleta incompleta, pendiente de aprobación, anulada, de otra rifa, o de otro vendedor sin autorización administrativa. | S, D | 4 |
| BR-I08 | Una boleta tiene un solo cliente activo. | D | 2 |
| BR-I09 | Solo Owner o Admin aprueban boletas en `pending_approval`. | S, D | 3 |
| BR-I10 | Solo Owner o Admin anulan boletas. | S, D | 3 |
| BR-I11 | Una boleta con pagos activos no puede anularse; primero deben anularse los pagos. | S, D | 5 |
| BR-I12 | Una boleta con pagos activos no puede cambiar de cliente. | S, D | 5 |

### Máquina de estados de inventario

```
draft ──(datos completos, creada por admin)──▶ available
draft ──(datos completos, creada por seller)──▶ pending_approval
pending_approval ──(aprueba owner/admin)──▶ available
pending_approval ──(rechaza owner/admin)──▶ cancelled
available ──(asignación a cliente)──▶ assigned
available ──(anulación)──▶ cancelled
assigned ──(anulación, solo sin pagos activos)──▶ cancelled
assigned ──(reversión administrativa, sin pagos activos)──▶ available
cancelled ──▶ (estado final, sin salidas)
```

Cualquier transición no listada se rechaza en el trigger `tickets_validate_status_transition`.

---

## 7.b Selección múltiple y acciones masivas (BR-B)

Añadidas después de la Fase 9, a petición del usuario. Detalle de las decisiones en
[`DECISIONS.md`](DECISIONS.md) D-082 a D-085; las funciones viven en la migración `0020`.

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-B01 | Se pueden seleccionar varias boletas de la lista y actuar sobre todas a la vez. La selección se identifica **siempre** por `ticket.id`, nunca por posición, y admite como máximo **1.000** boletas por operación. | C, S, D | post-9 |
| BR-B02 | **Asignación múltiple (vendedor):** varias boletas se venden al mismo cliente en una sola operación, con las mismas reglas de BR-I07 y BR-P03 aplicadas a cada una. | C, S, D | post-9 |
| BR-B03 | **Anulación múltiple (Dueño/Administrador):** un único motivo cubre el lote. Mismas condiciones que BR-I10 y BR-I11. | C, S, D | post-9 |
| BR-B04 | **Cambio de vendedor múltiple (Dueño/Administrador):** ni asignadas ni anuladas (BR-C05), y el destino debe ser un vendedor activo de la organización. | C, S, D | post-9 |
| BR-B05 | **Eliminación (Dueño/Administrador):** borrado **físico**, solo para registros cargados por error. Exige estado `draft`, `pending_approval` o `available`, sin cliente, sin `sale_price` y sin ninguna asignación de pago —ni siquiera de un pago anulado—. **Una boleta anulada nunca se elimina**: su combinación queda reservada (BR-N08). Motivo obligatorio. | C, S, D | post-9 |
| BR-B06 | Antes de ejecutar, la pantalla dice cuántas boletas admiten la acción y **cuáles no y por qué**. Si una sola no la admite, la acción se deshabilita para el grupo entero. | C, S | post-9 |
| BR-B07 | **Todo o nada.** El servidor revalida rol, organización, propiedad y estado de cada boleta con las filas bloqueadas; si falta una sola condición, no se modifica ninguna. Nunca hay resultados parciales silenciosos. | S, D | post-9 |
| BR-B08 | Toda acción masiva queda auditada dos veces: la fila de cada boleta (`ticket.cancel`, `ticket.assign_client`, `ticket.update`, `ticket.delete`) y una del lote (`ticket.bulk_*`) con el recuento y el motivo. En una eliminación, el detalle —rifa, vendedor, id y los dos números— se guarda **antes** de borrar. | D | post-9 |

> **Decisión pendiente:** `approve_tickets`, anterior a BR-B07, omite las boletas que ya no están
> pendientes y puede producir un resultado parcial; la interfaz evita ofrecer ese lote, pero la base
> de datos no garantiza «todo o nada» para esa acción (I-044). No se considera resuelta la
> contradicción hasta que el dueño del producto confirme si BR-B07 también debe cubrir aprobación.

**Anular y eliminar no son lo mismo, y la diferencia importa:**

| | Anular | Eliminar |
|---|---|---|
| Para qué | Retirar de circulación una boleta que existió | Corregir un registro que nunca debió existir |
| Qué pasa con la fila | Se conserva, en estado `cancelled` | Se borra físicamente |
| Qué pasa con la combinación | Queda **reservada** para siempre en esa rifa (BR-N08) | Vuelve a estar libre |
| Con cliente o abonos | Se puede (tras anular los abonos) | **Nunca** |
| Estado de partida | Cualquiera menos `cancelled` | Solo `draft`, `pending_approval` o `available` |

---

## 8. Precio de venta (BR-P)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-P01 | El precio predeterminado de una boleta es `120000` COP. **Corregido desde `100000` el 2026-08-15 (D-098): la cifra anterior era un dato equivocado, no un precio anterior.** | D | 2 · post-9 |
| BR-P02 | Todo valor monetario se almacena y opera como entero de pesos. Prohibido punto flotante. | C, S, D | 2 |
| BR-P03 | Al asignar o vender una boleta se copia el precio vigente de la rifa a `sale_price`. | S, D | 4 |
| BR-P04 | `sale_price` no cambia si después se modifica el precio de la rifa. | D | 2 |
| BR-P05 | Un `UPDATE` directo de `sale_price` sigue bloqueado cuando la boleta tiene pagos activos. **Actualizada el 2026-08-29 (D-137):** la corrección documentada ya no obliga a anular los abonos. Se hace con `update_ticket_sale_price` (BR-P13), que no puede dejar el precio por debajo de lo abonado. | S, D | 2 · post-9 |
| BR-P06 | Los saldos y estados se calculan usando `sale_price`, nunca el precio actual de la rifa. | D | 2 |
| BR-P07 | **Corregir un precio mal configurado no es subirlo.** Cuando el precio guardado nunca fue el correcto, se arrastra el `sale_price` de las boletas de esa rifa por migración versionada (excepción de BR-P05 prevista ahí mismo), y **nunca** se tocan `payments.total_amount` ni `payment_allocations.amount`: lo pagado sigue siendo lo pagado y la diferencia queda como saldo pendiente. Una subida real de precio se rige por BR-P04 y no toca nada anterior. | D | post-9 |
| BR-P08 | No existe un «precio efectivo» aparte: `sale_price` **es** lo que debe el cliente. Una boleta puede tener un precio propio distinto del de su rifa, y ninguna corrección masiva puede pisarlo. **Actualizada el 2026-08-17 (D-099):** desde entonces ese precio propio puede nacer de una rebaja del vendedor; lo que sigue sin existir es un segundo número que se calcule aparte. | D | post-9 |
| BR-P09 | **El vendedor puede vender una boleta por debajo del precio oficial.** La rebaja pertenece a **esa** venta: no cambia el precio de la rifa, ni el de las demás boletas, ni el de ninguna venta anterior. Sin precio explícito se vende al precio vigente de la rifa, que sigue siendo el camino normal. | C, S, D | post-9 |
| BR-P10 | Al vender se congela también el **precio oficial** en `tickets.base_price`. La rebaja concedida es `base_price - sale_price` y **no se guarda**: se deriva. `base_price` nulo —toda boleta vendida antes de D-099— equivale a rebaja cero. | D | post-9 |
| BR-P11 | El precio de venta debe estar entre el **mínimo** y el precio oficial. El mínimo lo calcula `ticket_sale_price_limits`, que es la **única** definición del límite y la comparten la validación, el diálogo de venta y el detalle de la boleta. Vender por encima del precio oficial se rechaza: esto es para rebajar, no para recargar. | C, S, D | post-9 |
| BR-P12 | Rebajar **no cambia nada más**: el saldo del cliente sigue siendo `sale_price - paid_amount`, la boleta queda **Pagada** al completar el precio rebajado —aunque sea menor que el oficial— y el sobrepago se bloquea contra el precio rebajado. **Actualizada el 2026-08-29 (D-137):** con abonos registrados el precio ya no es inmutable; se corrige por BR-P13, sin tocar los abonos. | D | post-9 |
| BR-P13 | **El precio de venta de una boleta ya asignada se puede corregir.** Es el mismo campo y las mismas validaciones de la asignación (BR-P09..BR-P11): techo el oficial congelado (`base_price`), suelo `ticket_sale_price_limits`, entero y mayor que cero. Además no puede ser menor que el total abonado vigente: no hay saldo a favor, ni devolución, ni reescritura de abonos. Si el nuevo precio iguala lo abonado, la boleta queda **Pagada**; si lo supera, vuelve a **Abonada** o **Sin pagar**. No cambia el precio de la rifa ni el de otras boletas. Lo hace `update_ticket_sale_price`. | C, S, D | post-9 |

**BR-P12 y la trampa de D-098 son opuestas y conviene no confundirlas.** Una boleta de `$120.000`
con `$100.000` abonados está **Abonada**, y darla por Pagada es un defecto. Una boleta **vendida en**
`$100.000` con `$100.000` abonados está **Pagada**, y no darla por Pagada es otro defecto. La
diferencia está en `sale_price`, que es —y siempre fue— el único límite. Ninguna capa compara contra
una cifra escrita en el código.

---

## 9. Pagos, abonos y saldos (BR-F)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-F01 | No existe pasarela de pagos; el registro es manual. | — | 5 |
| BR-F02 | Un pago pertenece a un cliente y se reparte entre una o varias boletas **de ese mismo cliente**. | S, D | 5 |
| BR-F03 | **Al registrar**, `payments.total_amount > 0` y `payment_allocations.amount > 0`: un abono nuevo de cero no existe. Lo garantizan `create_payment`, el esquema Zod de alta y un disparador `BEFORE INSERT` en las dos tablas (`0042`). **Corregir a cero un abono que ya existe sí se puede** (BR-F16, D-158): ahí el límite de fila es `>= 0`. **Ningún importe es negativo, nunca, en ninguna capa.** | C, S, D | 2 / post-9 |
| BR-F04 | No se permiten pagos a boletas sin cliente. | D | 2 |
| BR-F05 | `SUM(payment_allocations.amount) = payments.total_amount` exactamente. | S, D | 2 |
| BR-F06 | La creación de un pago y sus asignaciones es atómica: si algo falla, no se guarda nada. Se ejecuta en una función transaccional de PostgreSQL, no como secuencia de llamadas desde el navegador. | S, D | 2 / 5 |
| BR-F07 | `paid_amount` de una boleta = suma de asignaciones de pagos **no anulados**. | D | 2 |
| BR-F08 | `pending_amount` = `sale_price - paid_amount`. | D | 2 |
| BR-F09 | Los pagos nunca se eliminan físicamente: se anulan con `voided_at`, `voided_by` y `void_reason` obligatorio. | S, D | 5 |
| BR-F10 | Solo Owner o Admin pueden anular pagos. El vendedor no puede. | S, D | 5 |
| BR-F11 | Al anular un pago, sus asignaciones dejan de contar y los saldos y estados se recalculan automáticamente. | D | 5 |
| BR-F12 | Está prohibido el sobrepago: `paid_amount` nunca puede superar `sale_price`, ni siquiera con dos operaciones concurrentes. | S, D | 2 |
| BR-F13 | El historial de abonos muestra fecha, valor, cliente, boleta, vendedor que registró, método, notas y estado (activo/anulado). | C, S | 5 |
| BR-F14 | Toda creación, corrección y anulación de pago queda registrada en auditoría. | D | 5 |
| BR-F15 | Un pago anulado no puede "desanularse"; se registra un pago nuevo si corresponde. (D-013) | S, D | 5 |
| BR-F16 | El vendedor dueño del cliente y el personal pueden corregir el **valor** de un abono vigente, **incluido bajarlo a $0** (D-158). Se reescribe esa asignación, no se crea otro pago. No se cambia de boleta, cliente ni vendedor. Un pago anulado no se edita (BR-F15). El recálculo de saldo, estado y ganancia es el de siempre (BR-F07, BR-F11, BR-G01, BR-G06). (D-134, D-158) | C, S, D | post-9 |
| BR-F17 | Un abono corregido a **$0** deja la boleta como si no se hubiera registrado, **sin borrar nada**: la asignación se queda en el historial valiendo cero, con su fecha, su método y quién la registró, la bitácora anota el paso (BR-F14) y el valor se puede volver a subir. Si todas las asignaciones de un pago quedan en cero, su `total_amount` es `0` y el pago **sigue vigente** (`voided_at` nulo): eso es lo que lo distingue de uno anulado, que no se reactiva (BR-F15). (D-158) | S, D | post-9 |

### Estados de pago (calculados, nunca seleccionados)

| Condición | Estado | Etiqueta |
|-----------|--------|----------|
| `paid_amount = 0` | `unpaid` | Sin pagar |
| `0 < paid_amount < sale_price` | `partial` | Abonada |
| `paid_amount = sale_price` | `paid` | Pagada |
| `paid_amount > sale_price` | — | **Imposible**: la operación se bloquea |

Para una boleta al precio vigente de `$120.000`: `$0` → Sin pagar; `$1`–`$119.999` → Abonada;
`$120.000` → Pagada; más de `$120.000` → operación rechazada.

⚠️ **`$100.000` sobre una boleta de `$120.000` es Abonada, con `$20.000` pendientes** — no Pagada. Es
el caso que dejó la corrección de precio de D-098 y el que más fácil se rompe al tocar esta lógica.
El límite siempre es `sale_price`, nunca una cifra escrita en el código.

---

## 10. Auditoría (BR-D)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-D01 | Se registran como mínimo: creación de usuarios, activación/desactivación, creación y edición de rifas, creación y edición de boletas, cambio de números, asignación de vendedor, asignación de cliente, aprobación de boletas, anulación de boletas, creación de pagos y anulación de pagos. | D | 2 |
| BR-D02 | `audit_logs` es de solo anexado: no se actualiza ni se borra. | D | 2 |
| BR-D03 | Cada registro guarda organización, actor, acción, entidad, valores anteriores y nuevos, e IP cuando esté disponible. | S, D | 2 |
| BR-D04 | Solo Owner y Admin consultan la auditoría de su organización. | D | 2 |

---

## 11. Reportes (BR-T)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-T01 | Reportes mínimos: ventas por vendedor, recaudo por vendedor, saldo pendiente por vendedor, boletas por estado, clientes con saldo pendiente, pagos por rango de fechas y boletas por rifa. | S | 6 |
| BR-T02 | Las tablas principales se exportan a CSV. | C, S | 6 |
| BR-T03 | Los reportes del portal Seller nunca exponen datos de otros vendedores. | S, D | 6 |
| BR-T04 | Todos los reportes son filtrables por rifa; los administrativos también por vendedor, cliente, estado y fecha. | S | 6 |
| BR-T05 | **«Ventas por fecha»** (portal Seller, D-151). Una venta es una boleta con `inventory_status = 'assigned'`, fechada **exclusivamente** por `tickets.sale_date` —nunca por `created_at`, `assigned_at` ni `payments.payment_date`—. Sus cuatro indicadores son el número de boletas, `SUM(sale_price)`, `SUM(paid_amount)` y la resta de ambas, calculados en SQL sobre **todo** el rango. | S, D | post-9 |
| BR-T06 | «Abonado» de BR-T05 es lo que llevan pagado **hoy** esas boletas, **no** el dinero recibido en esas fechas. El dinero por fecha de ingreso lo responde «Pagos por fecha» (`report_payment_totals`), que no cambia. Los dos números difieren en cuanto un cliente abona un día después de comprar. | S | post-9 |
| BR-T07 | El reporte inicial depende del **portal**: `/seller/reports` abre «Ventas por fecha» y `/owner/reports` conserva «Por vendedor». Un `report` que el portal no ofrece cae al primero de su lista; el Route Handler del CSV lo rechaza con 403 en vez de sustituirlo. | C, S | post-9 |

---

## 12. Interfaz y presentación (BR-X)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-X01 | Interfaz en español, mobile-first y responsive. | C | 1+ |
| BR-X02 | Los estados se muestran con **texto**, no solo con color. | C | 1+ |
| BR-X03 | El dinero se presenta con formato colombiano sin decimales: `$0`, `$25.000`, `$100.000`. | C | 1+ |
| BR-X04 | Las acciones sensibles (anular, desactivar, aprobar, archivar) requieren confirmación explícita. | C | 3+ |
| BR-X05 | Existen estados vacíos, skeletons de carga, toasts y mensajes de error comprensibles. | C | 1+ |
| BR-X06 | Los errores de restricción de la base de datos se traducen a mensajes en español entendibles, sin exponer detalles internos. | S, C | 3 |
| BR-X07 | Los filtros son fáciles de limpiar; siempre hay una acción visible de «Limpiar filtros». | C | 3 |
| BR-X08 | Todo texto visible se redacta según [`UX_COPY_GUIDELINES.md`](UX_COPY_GUIDELINES.md) (tuteo, palabras comunes, consecuencias explicadas, glosario del Anexo A). | C | Permanente |
| BR-X09 | Las pantallas de detalle usan una flecha de navegación hacia atrás junto al título, no un botón o enlace de texto «Volver a…». Vuelve al contexto real desde el que llegó el usuario cuando existe; si no, usa una ruta de repuesto segura que nunca saca de la aplicación. | C, S | post-9 |

---

## 12.b Resultados oficiales de loterías (BR-L)

Mantenimiento posterior a la Fase 9. Etapas 1 a 6: contrato persistente, adaptadores,
sincronización, avisos, recuadro del Panel, Route Handler y programador de
producción (D-149).

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-L01 | Se cubren seis loterías ordinarias: Cundinamarca (lun), Cruz Roja (mar), Meta (mié), Bogotá (jue), Medellín (vie) y Boyacá (sáb). El día es la fecha de referencia, no necesariamente el día en que se juega. | D | post-9 |
| BR-L02 | No se mezclan sorteos ordinarios y extraordinarios. | D | post-9 |
| BR-L03 | `reference_date` es la fecha nominal del premio y no cambia si el sorteo se adelanta o se aplaza. | D | post-9 |
| BR-L04 | `official_scheduled_at` es el instante vigente. Decide qué boletas ya existían y si estaban asignadas. Un festivo no fabrica por sí solo una fecha nueva. | D | post-9 |
| BR-L05 | Participan las rifas `active` o `closed` cuya ventana (`start_date`–`end_date`) cubre `reference_date`. Todas, nunca «la activa más reciente» (D-140). | D | post-9 |
| BR-L06 | La coincidencia es textual y exacta. El número mayor son cuatro dígitos. `0046` no coincide con `46`. Prohibido casteo, `lpad` o recorte de ceros. Lunes a viernes usan `daily_number`; Boyacá, `weekly_number`. | D | post-9 |
| BR-L07 | La serie es informativa, nullable, y no participa en la coincidencia ni en los avisos. | D | post-9 |
| BR-L08 | Un sorteo confirmado no admite un segundo número activo. Si una fuente trae otro, se marca `conflict` y no se sobrescribe. | D | post-9 |
| BR-L09 | Vendida = asignada con `assigned_at ≤ official_scheduled_at`. `payment_status` no interviene. | D | post-9 |
| BR-L10 | Una asignación posterior no convierte en vendida la fotografía. Queda `late_assignment` sin cliente. | D | post-9 |
| BR-L11 | Cada coincidencia es una fotografía inmutable (resultado + boleta + campo). Los reintentos no duplican. | D | post-9 |
| BR-L12 | El matching es una operación de conjunto en PostgreSQL, idempotente. | D | post-9 |
| BR-L13 | Programación y resultados son nacionales. Las coincidencias se aislan por organización. | D | post-9 |
| BR-L14 | El vendedor solo ve coincidencias de sus boletas. `tickets_select` no se amplía (D-141, D-092). | D | post-9 |
| BR-L15 | No se llama «ganador» al cliente ni a la boleta. La plataforma detecta coincidencia numérica; no certifica el premio oficial. | C | post-9 |
| BR-L16 | No se guarda HTML ni el documento externo. Se conservan URL, autoridad, versión, hash y campos extraídos. | D | post-9 |
| BR-L17 | La consulta a una fuente oficial es HTTPS, allowlist, timeout y tope de tamaño. Un desafío anti-bot **no se elude** (D-144, I-081). **Sustituida en parte por BR-L26 (D-162, 2026-09-02):** desde entonces sí se consultan fuentes alternativas cuando la oficial no sirve, pero **solo bajo consenso de dos dominios**, nunca como sustituto directo de una autoridad. Lo que no cambia: no se resuelven CAPTCHA, no se usan proxies, no se falsifica un navegador y no se copian cookies de una sesión humana. | D | post-9 |
| BR-L18 | La sincronización de programación es idempotente. Conserva `reference_date` y `original_scheduled_at`. Solo incrementa `schedule_version` cuando cambia la hora oficial, el estado o el motivo. Un hash nuevo del mismo contenido no avisa (D-145). | D | post-9 |
| BR-L19 | Hay como máximo un aviso de resultado por sorteo y destinatario, y uno por cambio, versión y destinatario. No se avisa a quien no tiene coincidencias. El texto vive en la aplicación (D-146, I-030). | D | post-9 |
| BR-L20 | El Panel lee solo datos locales ya persistidos. No consulta fuentes oficiales al navegar. Un resultado anterior no se presenta como el de hoy (D-147). | C, S | post-9 |
| BR-L21 | El sincronizador corre fuera de la navegación, con un secreto de servidor, sin sesión. No acepta URLs del cliente. Un resultado confirmado no se vuelve a pedir. En producción lo dispara Vercel Cron con el plan Hobby (D-148, D-149). | S | post-9 |
| BR-L22 | Un tick consulta resultados **solo** de sorteos ya jugados dentro de los últimos 10 días —el mismo horizonte que mira el Panel hacia atrás— y descarga **como máximo 6 fuentes** por ejecución, en orden determinista del más reciente al más antiguo. El cronograma anual se conserva entero: lo acotado es la consulta de resultados, no la programación. Los reintentos se cuentan **por sorteo** (`lottery_sync_runs.schedule_id`), nunca por lotería. Un fallo de la etapa de resultados no deshace la programación ya sincronizada (D-152). | S | post-9 |
| BR-L23 | El resultado de **Cundinamarca** se lee del **acta oficial en PDF**, cuya URL se arma con el año y el sorteo de la programación (`/files/results-records/{año}/{sorteo}.pdf`). El host de almacenamiento se autoriza **solo con esa ruta**, en la URL inicial y en cada redirección. Se validan estado, tipo de contenido y **firma del archivo**. Un **404 es «aún no publicada»** y se reintenta; un PDF **sin capa de texto** es `scanned_document` y **no se hace OCR**. Solo se publica una fila **inequívoca** de `PREMIO MAYOR` cuyo sorteo coincida con el esperado; ante dos candidatas distintas, no se publica. No se guarda el documento ni su texto: URL final, autoridad, hash y evidencia estructurada mínima. El verificador de billetes queda retirado como fuente (D-153). | S, D | post-9 |
| BR-L24 | Un campo de un resultado se lee **anclado a un encabezado que trae sorteo y fecha juntos**, dentro de la ventana que le sigue; nunca buscando la primera coincidencia en la página. La **fecha** sale de ese mismo encabezado. La **serie** se busca después del número mayor. La tirada de dígitos tras una etiqueta se corta en la primera letra y tiene que medir **exactamente** lo esperado —cuatro para el número mayor, tres para la serie—: con más o con menos, no se publica. Antes de leer nada se descartan `<script>`, `<style>`, `<noscript>`, `<template>` y los comentarios, y las etiquetas se quitan respetando las comillas de los atributos. Un **enlace-señuelo** anti-robot en una página servida entera **no** es un desafío: no se sigue, y tampoco se toma por un bloqueo. Un resultado que corresponde a un sorteo **anterior** al esperado **y** a una fecha anterior es `not_published` —una espera que se reintenta—, no `ambiguous` (D-154). | S, D | post-9 |
| BR-L25 | El contenido principal del Panel **no espera** por la lectura de loterías. El recuadro se dibuja dentro de su propio límite de Suspense y llega por el mismo flujo HTTP, con un hueco pequeño y accesible mientras tanto; ninguna de las dos páginas la mete en su `Promise.all`. La lectura es local y sujeta a RLS, de **dos consultas como máximo** —una de programación y una de coincidencias— sin importar cuántos sorteos, resultados o boletas haya, y las dos comparten un **plazo único** (`LOTTERY_DASHBOARD_TIMEOUT_MS`): si vence, la petición se cancela y el recuadro cae en «error» sin arrastrar al resto (D-155). | C, S | post-9 |
| BR-L26 | Cuando la fuente oficial **no** puede entregar un sorteo —todavía muestra el anterior, `not_published`, acta escaneada, bloqueada, SPA vacía, timeout o estructura cambiada— se consultan **fuentes alternativas**, que **no son autoridades**. Un número solo se confirma si el **mismo** número aparece en **al menos dos DOMINIOS distintos**, para la misma lotería y la fecha oficial del sorteo según el cronograma CNJSA. Dos rutas del mismo sitio son **una sola** fuente. Si la fuente publica número de sorteo, tiene que coincidir; si no lo publica, se exigen lotería y fecha exactas y **no se inventa**. Una sola fuente **nunca** confirma; dos números con dos fuentes cada uno es **conflicto** y no genera coincidencias ni avisos; una discrepancia minoritaria **se conserva** como evidencia. La serie sigue siendo informativa y no participa en el matching. Una fuente oficial **válida pero distinta** es un conflicto, y **no** se resuelve con agregadores. Todas las consultas son frescas (`cache: 'no-store'`); una respuesta con la fecha de otro día no es un éxito. El presupuesto de **6 descargas por tick** es único para las dos vías, y una página compartida se descarga **una vez por tick**. Los reintentos se cuentan por **sorteo y estrategia**. El Panel **nunca** consulta estas páginas (D-162). | S, D | post-9 |
---

## 12.c Catálogo público del vendedor (BR-K)

Mantenimiento posterior a la Fase 9. Primera entrega: una página pública por vendedor,
`/catalogo/<slug>`, que muestra sus boletas libres y las que ya están tomadas y lleva a WhatsApp
(D-159, D-160). **La letra es `K` porque `C` ya nombra a los clientes**; no hay más significado.

Lo que esta entrega **no** hace, y conviene tener presente al leer las reglas: no reserva, no
retiene, no crea clientes, no registra ventas y no toca la máquina de estados de una boleta.

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-K01 | La página es pública: se sirve sin sesión y sin cookie. Una sola ruta dinámica sirve a todos los vendedores; no hay página ni despliegue por vendedor. Se envía `noindex, nofollow`: la dirección es pública para quien la reciba, pero el catálogo no se promociona en buscadores. | C, S | post-9 |
| BR-K02 | El `slug` es único en **todo el sistema**, no por organización: la URL no lleva organización y tiene que resolver a una sola persona. Formato normalizado `^[a-z0-9]+(-[a-z0-9]+)*$`, de 3 a 80 caracteres. Lo genera el servidor como nombre legible + sufijo aleatorio de 4 caracteres. **No es un secreto ni sustituye a la autorización.** | S, D | post-9 |
| BR-K03 | El `slug` es **estable**: cambiar el nombre del vendedor no cambia su URL, y guardar la configuración tampoco. Regenerarlo es una acción explícita y aparte, y rompe a propósito el enlace anterior. | S, D | post-9 |
| BR-K04 | El catálogo se habilita y se deshabilita sin borrar nada. Apagado, su enlace deja de resolver; al encenderlo de nuevo publica lo mismo que antes. | S, D | post-9 |
| BR-K05 | El WhatsApp público es un dato **propio del catálogo**, distinto del teléfono interno de la persona (`profiles.phone`): se configura a conciencia y nunca se publica solo. Se guarda en formato internacional de solo dígitos (`^[1-9][0-9]{7,14}$`). | C, S, D | post-9 |
| BR-K06 | La rifa publicada es **explícita**. El esquema permite varias rifas activas a la vez (BR-R01, caso A5), así que no se adivina cuál publicar: se elige. La rifa tiene que ser de la misma organización que la membresía, y lo garantiza una FK compuesta. | S, D | post-9 |
| BR-K07 | La proyección pública la define el **tipo de retorno** de dos funciones `SECURITY DEFINER`, no una política: nombre del vendedor, su alias, el WhatsApp público, el nombre de la rifa, su precio oficial, **los dos conteos del catálogo** (disponibles y tomadas, D-164) y los dos números de cada boleta publicada. **Desde `0046` ya no viaja «si está tomada»**: solo se publican las disponibles, así que la columna sobraba. Nada más puede salir. No viaja ni un identificador interno, ni el código interno, ni cliente, ni pagos, ni saldos, ni notas, ni auditoría. `anon` sigue sin un solo privilegio sobre ninguna tabla de negocio y no puede ejecutar esas funciones: solo el rol servidor. | S, D | post-9 |
| BR-K08 | Se publican **únicamente** las boletas del vendedor resuelto, de la rifa publicada, en estado **`available`** (Disponible). Desde D-164 una boleta **`assigned` no se publica**: no se pinta en gris, no se oculta con CSS y **no viaja al navegador** — solo cuenta en las cifras (BR-K14). `draft`, `pending_approval` y `cancelled` **no aparecen de ninguna forma** ni cuentan en nada, tampoco buscándolas por su número. El filtro de disponibilidad se aplica **antes** de `limit`/`offset`, de modo que la paginación se calcula sobre las disponibles. Los números conservan sus ceros iniciales y se ordenan numéricamente. Se busca por número diario o semanal, entero o en parte; un término que no puede ser un número de boleta (BR-N02) no devuelve nada. | C, S, D | post-9 |
| BR-K09 | «Solicitar» es un enlace normal a `https://wa.me/<número>?text=<mensaje>`. **No registra una venta, no cambia el estado de la boleta, no crea un cliente y no reserva nada**, y el texto no puede sugerir lo contrario. El mensaje nombra la boleta por sus **dos** números, porque es el par lo que la identifica (BR-N04, BR-N11). La página mantiene visible que el vendedor confirmará la disponibilidad. | C | post-9 |
| BR-K10 | Vendedor inexistente, perfil inactivo, membresía inactiva, rol distinto de vendedor, organización inactiva, catálogo apagado o rifa no activa producen **la misma** respuesta pública de «no encontrado». No se revela cuál de las siete ocurrió, ni se filtra el nombre del vendedor o de la rifa. | C, S, D | post-9 |
| BR-K11 | La página no carga el inventario: pide como máximo `50 + 1` boletas por petición y la fila sobrante solo sirve para saber si hay página siguiente —no se cuenta el total—. El tope lo impone la función en SQL, así que no se puede evadir desde fuera. Búsqueda y página viven en la URL. Sin Realtime y sin sondeo: la disponibilidad se refresca al recuperar el foco. | C, S, D | post-9 |
| BR-K12 | Configurar el catálogo (habilitar, WhatsApp, rifa, regenerar el enlace) es exclusivo de Dueño y Administrador. El vendedor **ve y copia** el suyo, y no puede consultar ni modificar el de otro: lo impone `memberships_select`/`memberships_update_staff`, no la interfaz. El cambio queda auditado por el disparador de `memberships` que ya existía. | C, S, D | post-9 |
| BR-K13 | El vendedor **llega a su catálogo desde la aplicación**: el panel muestra «Mi catálogo público» con su estado, la dirección y tres acciones —**Compartir**, **Copiar enlace** y **Ver catálogo**—. La dirección puede recortarse a la vista, pero las tres acciones usan **siempre la completa**. «Compartir» abre el menú nativo del sistema con `navigator.share()`; **cancelarlo no es un error** y no dispara nada, mientras que cualquier otro fallo —o no tener `navigator.share`— copia el enlace. El estado dice **Activo** solo si el enlace abre de verdad: apagado, sin enlace generado o con la rifa no activa dice **Inactivo** y **no se dibuja ninguna acción**, porque un botón hacia un «no encontrado» es peor que no tener botón. | C, S | post-9 |
| BR-K14 | El catálogo publica **sus cifras completas**: cuántas boletas quedan disponibles, cuántas están tomadas y qué porcentaje del total ya tiene dueño. Son de **todo el catálogo** de ese vendedor en esa rifa, y **no cambian** al pasar de página, al buscar ni cuando una búsqueda no encuentra nada — la función que las devuelve no recibe ni página ni término. Salen de **un solo agregado** en la misma llamada de metadatos que ya se hacía; no se cuentan en el navegador, no se descarga el catálogo para contarlo y no hay contadores persistentes que puedan quedar obsoletos. `total = disponibles + tomadas`, y el porcentaje se redondea al entero y se acota a 0–100: un catálogo vacío da **0 %**, nunca `NaN`. | C, S, D | post-9 |

---

## 13. Casos extremos y su resolución

| # | Situación | Resolución |
|---|-----------|------------|
| X1 | El vendedor no tiene boletas y la rifa permite crearlas | Se muestra una acción clara para crear boletas |
| X2 | El vendedor no tiene boletas y la rifa **no** permite crearlas | Se explica que el administrador debe asignarlas; la acción se oculta o deshabilita |
| X3 | Abono exactamente igual al saldo pendiente | Válido; la boleta pasa a Pagada |
| X4 | Abono de $1 sobre una boleta de $120.000 | Válido; la boleta pasa a Abonada |
| X4b | Abono de $100.000 sobre una boleta de $120.000 | Válido; queda **Abonada** con $20.000 pendientes, nunca Pagada (D-098) |
| X5 | Pago que cubre varias boletas y sobra dinero | Rechazado: la suma debe coincidir exactamente con el total |
| X6 | Dos abonos concurrentes que juntos exceden el saldo | El segundo falla con mensaje de saldo insuficiente |
| X7 | Anulación del único pago de una boleta | La boleta vuelve a Sin pagar |
| X8 | Anulación parcial de un pago | No existe: se anula el pago completo y se registra uno nuevo si corresponde |
| X9 | Intento de asignar una boleta ya asignada | Rechazado por estado y por restricción |
| X10 | Vendedor intentando ver la boleta de otro por URL | RLS devuelve "no encontrado"; la UI muestra acceso denegado |
| X11 | Rifa cerrada con deudas pendientes | Se permiten pagos; no se permiten nuevas boletas ni asignaciones |
| X12 | Carga masiva con duplicados dentro del mismo formulario | Se marca la fila en conflicto antes de enviar |
| X13 | Carga masiva con duplicados ya existentes en la base | El servidor devuelve las filas en conflicto; las demás se guardan |
| X14 | Vendedor desactivado a mitad de una sesión | El siguiente request del servidor bloquea el acceso |
| X15 | Cliente con boletas que se intenta eliminar | Solo se permite archivar |
| X16 | Boleta creada por vendedor cuando la rifa deja de permitirlo | Las ya creadas siguen su flujo; no se pueden crear nuevas |
