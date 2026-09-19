# REGLAS DE NEGOCIO

- **Versión:** 1.37 · **Estado:** normativo · **Actualizado:** 2026-09-19, más tarde (vigencia y §12.d: lo que
  añade D-209 **pasa a producción**, sin cambiar ninguna regla). Antes, ese mismo día (§12.d: **Bre-B y «Otros»** —D-209,
  migraciones `0073` y `0074`, **solo en local**—: **BR-M03, BR-M04 y BR-M08 precisadas** y **BR-M10 nueva**, la
  regla de la llave o el identificador: se guarda tal cual y sin espacios exteriores, de 1 a 100 caracteres, en una
  sola línea y sin caracteres invisibles, y dos cuentas de Bre-B u «Otros» son iguales solo si el identificador
  entero coincide, con mayúsculas). Antes, el 2026-09-18 (§12.i: **BR-J21 y BR-J22 precisadas**
  en la Etapa 3 del historial —auditoría en local, migración `0070`—: el personal elige desde su pantalla a
  quien vendió y hoy tiene otro rol, y el aviso de cobertura dice «sin confirmar o por verificar», que puede
  haber premios que no aparecen y, con cualquier filtro, que la cuenta es de la organización). Antes, el
  2026-09-17 (§12.i: **BR-J22 precisada** en la Etapa 2 del historial —migración `0069`, solo en local—: la cobertura pendiente cuenta solo los sorteos que
  **pudieron** dar un premio, I-138; y las pantallas existen). Antes, ese mismo día (§12.i: **BR-J23** y la
  corrección de la Etapa 1 —migración `0068`, solo en local—: qué respalda cada dato del historial, la
  unicidad de un reconocimiento es de lo **vigente** —así que anular y volver a registrar es posible—,
  el informe del cargador corresponde a lo **almacenado**, las lecturas del vendedor exigen su **rol**
  —y el mismo hueco era anterior a este encargo, I-137—, y la carrera de **I-134 queda cerrada** en
  BR-I16. Antes, ese mismo día, §12.i: **BR-J17..BR-J22**, el
  **historial de premios ganados** —D-208, migración `0067`, **solo en local**—, y §7: **BR-I16**, los
  números de una boleta con coincidencias no cambian por ninguna vía. Un premio ganado es una
  coincidencia `sold` con su premio; el pago **no** interviene; un conflicto posterior **no borra**
  historia; lo que el motor no puede premiar lo reconoce el negocio en una tabla aparte; los indicadores
  son **cuatro**; cada vendedor ve **solo lo suyo** y el personal, **sin un solo dato de cliente**; y un
  tramo sin resultados es **pendiente de información**, nunca cero premios. Llevan nota BR-L15 y BR-Q02);
  antes, ese mismo día (§12.i y §4: las reglas de premios
  configurables y el aviso de fechas **rigen en producción** desde ese día —`0058`–`0066`, `da81663` y la
  rifa real convertida—); antes, el 2026-09-16 (§4: **BR-R12 avisa también
  a quien cambia las fechas** —D-206 corregida, migración `0065`—: cada membresía activa recibe exactamente
  un aviso, incluida la de quien lo hizo, que sigue figurando como su actor; la exclusión del actor de
  **BR-J11** queda solo para los premios); antes, ese mismo día (§12.i: **BR-J13 con el
  instante efectivo** —D-206, migración `0064`—: los sorteos cuyo corte llegó antes de que una rifa
  cambie de sistema **conservan el sistema de siempre**, y un sorteo jugado sin resultado ya no detiene la
  transición; §4: **BR-R12 nueva**, el aviso de las fechas de una rifa activa); antes, ese mismo día
  (§12.i: **BR-J13
  implementada para transiciones controladas** —Entrega 4, D-204, migración `0063`—: una rifa que ya
  existía pasa a premios configurables solo por la operación interna, entera o nada, y no mientras
  quede un sorteo jugado sin confirmar; **BR-J03** precisa que el caso «semanal, un lunes, con
  Cundinamarca» es un ejemplo genérico, no un premio de la rifa real); antes, ese mismo día (§12.i:
  **BR-J09 corta en
  `least(original, oficial)`** —un sorteo adelantado ya no toma una versión publicada después de
  jugarse—, corrección de la Entrega 3, D-203 Decisión 9, migración `0062`, I-125); antes, ese mismo
  día (§12.i: **BR-J06 y BR-J07
  tienen motor** —Entrega 3, D-203, migración `0061`— y **BR-J07 pasa a aplicarse por cliente**, por
  respuesta del dueño; nota en BR-L06); antes, ese mismo día (§12.i: **BR-J16**
  precisa que la revisión es el único camino visible para activar un borrador configurable, corrección
  de D-202); antes, el 2026-09-15 (§12.i: premios
  configurables por rifa —BR-J01..BR-J16, D-199, D-200, **D-201** y **D-202**, migraciones `0058`,
  `0059` y `0060`, **solo en local**; **BR-J13 ampliada** y **BR-J16 nueva** con el panel y el
  proceso de tres pasos; antes, **BR-J02, BR-J07, BR-J08 y BR-J14 corregidas y BR-J15 nueva** al cerrarse A7—; antes,
  el 2026-09-14, §12.h: la cartera es del
  vendedor —BR-Q01..BR-Q10 nuevas y notas de D-198 en las reglas que acota—; antes, el 2026-09-13,
  §12.g: el mensaje propio de
  «Resultados de la semana» —BR-H09 y BR-H10 nuevas, BR-H06 y BR-H08 corregidas por D-197—; antes,
  ese mismo día, BR-K15: un corte pasajero de Supabase en el catálogo público, y §12.g, «Resultados de
  la semana»: BR-H01..BR-H08)
- Cada regla tiene un identificador estable. Las pruebas de `docs/TESTING.md` lo referencian.
- Columna **Capas**: `C` = cliente (UX), `S` = servidor (Server Action/RPC), `D` = base de datos
  (restricción, trigger o política). Una regla crítica **siempre** incluye `D`.
- Una regla se presume **implementada y vigente** salvo que su sección lo diga. Las secciones
  **12.d (BR-M)**, **12.e (BR-S)** y **12.f (BR-V)** se construyeron por etapas (D-185) y conservan su
  columna **Estado**, que dice en qué etapa nació cada regla. ✅ **Las veintinueve están implementadas
  y en producción desde el 2026-09-12** (D-193, migraciones `0051`–`0055`): la columna es historia,
  no una advertencia. Lo que D-209 añade a §12.d —Bre-B y «Otros» en BR-M03, BR-M04 y BR-M08, y
  **BR-M10** entera— está **en producción desde el 2026-09-19**: `0073` y `0074` a las 17:53 UTC y su
  código, `6401bd0`, a las 17:57 UTC. Hasta esa tarde vivió solo en local.
- La sección **12.i (BR-J)** es la única que describe algo que **todavía no está en el proyecto
  real**: las migraciones `0058` a `0063` —contrato, panel, motor y transición, entregas 1 a 4— viven
  **solo en local**. Promoverlas y convertir la rifa real es la Entrega 5.

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
| BR-E08 | El Dueño y el Administrador conservan visibilidad y control totales: ven todos los equipos, pueden crear un vendedor ya dentro de un equipo y pueden moverlo de equipo. **Acotada el 2026-09-14 (D-198):** la estructura, sí; lo que vende y gana cada integrante, no (BR-Q08). | S, D | post-9 |
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
| BR-G12 | Cada quien ve su comisión; el vendedor padre, la de su equipo; el Dueño y el Administrador, la de toda la organización. El **detalle de movimientos** es de cada quien y del personal. **Acotada el 2026-09-14 (D-198):** el Dueño y el Administrador ya no ven la comisión ni los movimientos de ningún vendedor (BR-Q08); la ficha solo dice con qué regla se le paga. | D | post-9 |
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

**Nota sobre BR-G07 — cambiar de VENDEDOR una boleta vendida es imposible, no solo prohibido.**
`tickets_client_seller_fk` es una FK compuesta `(client_id, seller_id) → clients (id, seller_id)` y
**no es diferible**. Una boleta vendida siempre tiene cliente, y el cliente pertenece a su vendedor
(BR-C05): mover la boleta rompe la FK, mover el cliente primero rompe la de todas sus boletas, y no
hay transacción que lo salve. Comprobado con la *service role*, que se salta la RLS y las funciones de
negocio. El motor conserva su rama de cambio de vendedor porque cubre las boletas **sin vender**
(BR-B04) y deja el camino listo si algún día el negocio permite trasladar una cartera completa.

> **Precisado el 2026-09-03 (BR-I13, D-168).** Esta nota, y las de `PHASE_STATUS` que la citaban,
> decían «reasignar una boleta vendida es imposible» a secas, y eso se leía como si tampoco se
> pudiera **corregir el cliente**. Son dos cosas distintas: lo que la FK compuesta impide es cambiar
> el **vendedor** conservando el cliente. Mover la boleta **entre dos clientes del mismo vendedor**
> no toca esa FK —el `seller_id` no cambia y el cliente de destino ya es de ese vendedor— y **sí se
> puede**, con las condiciones de BR-I13.

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
| BR-R01 | Una organización puede tener varias rifas. **Crear una es del personal**, y desde D-202 además exige la capacidad `raffles.prizes.manage`: la rifa nueva nace con premios configurables y quien la crea tiene que poder configurarlos (BR-J13). | D | 2 · ampliada en la Entrega 2 de premios |
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
| BR-R12 | **Cambiar la fecha de inicio o la de fin de una rifa activa avisa**, en la misma transacción que el cambio, a **cada membresía activa** de la organización —Dueño, Administradores y Vendedores—: **exactamente un aviso a cada una, incluida la de quien lo hizo**. La exclusión del actor de BR-J11 es de los premios y **no se extiende a esta regla**. Cada aviso guarda **quién hizo el cambio** como su actor, tomado de la sesión y nunca de un dato que alguien pueda escribir; un cambio sin sesión avisa igual, pero queda sin actor —«Sistema»—, y por eso las fechas de una rifa real se cambian con la sesión de quien decide (RUNBOOK §8.3). **Guardar las mismas fechas no avisa**, un borrador tampoco, y si el cambio se rechaza o se deshace no queda ningún aviso. El aviso identifica la rifa y sus fechas nuevas y anteriores, **no lleva clientes, ventas, pagos ni cartera**, no enlaza a ninguna pantalla y deja una fila semántica de bitácora con cuántos salieron. La pantalla de editar lo anuncia **antes de guardar**, solo cuando cambió una fecha, y dice que llega a **todas** las personas, también a quien guarda. | C, D | ✅ post-9 (D-206, `0064`; **`0065`** incluye a quien lo hizo) |

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
| BR-N13 | **El mismo buscador encuentra también por el cliente que tiene la boleta.** Un solo campo: si se escriben de 1 a 4 dígitos busca por número (BR-N11); si se escribe texto, busca por el cliente. El resultado es **siempre una lista de boletas**. **Acotada el 2026-09-14 (D-198):** solo en el portal del vendedor; el personal busca únicamente por número (BR-Q05). | C, S, D | post-9 |

| BR-N12 | **Las boletas se pueden importar desde un archivo CSV o JSON.** La rifa y el vendedor los pone la pantalla. Cada fila lleva los dos números y puede añadir cliente, pero en ese caso **nombre y celular son obligatorios juntos**. Siempre hay vista previa y confirmación antes de guardar. **Acotada el 2026-09-14 (D-198):** los dos portales importan solo boletas sin vender; una fila con cliente se aparta y se rechaza (BR-Q07). | C, S, D | post-9 |

| BR-N14 | **Una fila del archivo puede traer el abono ya cobrado de esa boleta.** Se escribe en miles («20»), en pesos («20.000», «20000») o con la palabra **«Cancelado»**, que vale el precio completo de esa boleta. El abono es de SU boleta y **no se reparte** entre las demás del cliente. Exige cliente, porque solo se abona una boleta vendida. **Suspendida el 2026-09-14 (D-198):** ningún portal importa abonos; la lectura de la columna se conserva para reactivarla (BR-Q07). | C, S, D | post-9 |

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
| BR-I10 | Solo Owner o Admin anulan boletas. **Desde el 2026-09-14 (D-198), solo las que no se han vendido** (BR-Q07). | S, D | 3 · post-9 |
| BR-I11 | Una boleta con pagos activos no puede anularse; primero deben anularse los pagos. | S, D | 5 |
| BR-I12 | Una boleta con pagos activos no puede cambiar de cliente. | S, D | 5 |
| BR-I13 | Una boleta vendida **puede** corregirse de cliente dentro de la cartera de su mismo vendedor, siempre que no tenga **ninguna** fila en `payment_allocations` ni en `lottery_ticket_matches`. **Desde el 2026-09-14 (D-198), solo la corrige su vendedor** (BR-Q06). | C, S, D | post-9 |
| BR-I14 | Una boleta vendida **puede liberarse** —volver a `available`, sin cliente ni venta— cuando el cliente desiste antes de abonar nada: exige rifa **activa** y **ninguna** fila en `payment_allocations` ni en `lottery_ticket_matches`. **Desde el 2026-09-14 (D-198), solo la libera su vendedor** (BR-Q06). | C, S, D | post-9 |
| BR-I15 | Una boleta vendida registra si su **paz y salvo** —el desprendible— ya se entregó físicamente al cliente. Lo marca **solo el vendedor dueño** de la boleta, es **independiente del pago** y vuelve a pendiente si la boleta cambia de cliente o se libera. | C, S, D | post-9 |
| BR-I16 | **Los números de una boleta con coincidencias no cambian.** Una boleta que tenga cualquier fila en `lottery_ticket_matches` deja de admitir un cambio de `daily_number` o `weekly_number` **por ninguna vía**: ni la RPC del personal, ni una política de `UPDATE`, ni una RPC futura, ni la service role. Lo garantiza un **disparador** sobre `tickets`, no una comprobación dentro de una función, acompañado de uno **diferido** que vuelve a mirar al COMMIT. Es la misma condición que ya usan BR-I13 y BR-I14, aplicada a los números: una boleta que hace parte de un resultado registrado no se retoca. **Y la carrera está cerrada** (I-134, migración `0068`): un disparador de restricción **diferido** sobre `lottery_ticket_matches` exige, al COMMIT, que `matched_number` sea el número de la boleta en `match_field`, así que la intercalación en la que las dos operaciones confirman **hace fallar al motor sin escribir nada** en vez de dejar una fotografía incoherente. El motor **no se tocó**: la defensa vive en su tabla. | C, S, D | post-9 |

**BR-I12 y BR-I13 no dicen lo mismo, y la diferencia importa.** BR-I12 es el disparador
`tickets_protect_client_change` de `0004`: protege el **saldo**, así que mira los pagos **activos** y
sigue puesto tal cual sobre cualquier `UPDATE`. BR-I13 es la operación de corrección de `0047`, y su
listón es el **historial**: rechaza si existe **cualquier** fila en `payment_allocations`, aunque su
pago esté anulado (BR-F09) o su importe corregido a $0 (BR-F17). `paid_amount = 0` no sirve para
comprobarlo: vuelve a cero al anular. Detalle y motivos en [`DECISIONS.md`](DECISIONS.md) D-168.

**Qué hace y qué no hace la corrección (BR-I13).** Escribe únicamente `tickets.client_id`. Conserva
`seller_id`, `organization_id`, `raffle_id`, los dos números, `inventory_status`, `sale_price`,
`base_price`, `sale_date`, `assigned_at`, `paid_amount` y los datos de creación y aprobación. No pasa
por `available`, no llama a `assign_ticket_row` y **no repite el aviso de venta**. Condiciones, todas
revalidadas en SQL con la fila bloqueada:

| Condición | Por qué |
|---|---|
| Boleta en `assigned` y con cliente | No es una venta: es corregir a quién se le vendió |
| Quien llama es el vendedor de la boleta, o personal de su organización | Misma puerta que `assign_ticket_row` y `update_ticket_sale_price`. El vendedor padre no entra (D-092) |
| Cliente de destino distinto del actual, y `p_expected_client_id` coincide con la fila | Bloqueo optimista: una pantalla vieja no pisa una corrección más reciente |
| Cliente de destino de la misma organización, del mismo vendedor y no archivado | BR-C05, BR-C07, y además `tickets_client_seller_fk` |
| Cero filas en `payment_allocations` | Un pago no se traslada de cliente (D-168) |
| Cero filas en `lottery_ticket_matches` | La fotografía del sorteo es inmutable (BR-L11, BR-L14) |
| Motivo de 5 caracteres o más | Es lo único que la bitácora no puede deducir sola |

La rifa **no** tiene que estar activa: es una corrección de identidad sobre una venta ya hecha, y
exigirlo dejaría el error grabado para siempre en una rifa cerrada (D-168). Queda auditada como
`ticket.reassign_client` con cliente anterior, cliente nuevo, motivo y actor, además de la
`ticket.update` automática de la fila.

**Liberar una boleta (BR-I14).** El cliente desiste antes de abonar nada y la boleta vuelve al
inventario, con sus mismos números, lista para venderse a otra persona. Es la operación
`release_ticket_client` de la migración `0048`, y escribe **seis** columnas, todas de la venta que se
deshace:

| Se borra | Se conserva |
|---|---|
| `inventory_status` → `available`, `client_id`, `sale_price`, `base_price`, `sale_date`, `assigned_at` | `seller_id`, `organization_id`, `raffle_id`, los dos números, `internal_code`, `paid_amount` (que ya vale 0) y los datos de creación y aprobación |

Condiciones, todas revalidadas en SQL con la fila bloqueada:

| Condición | Por qué |
|---|---|
| Boleta en `assigned` y con cliente | Solo se deshace una venta que existe |
| Quien llama es el vendedor de la boleta, o personal de su organización | Misma puerta que `assign_ticket_row` y `reassign_ticket_client`. El vendedor padre no entra (D-092) |
| `p_expected_client_id` coincide con la fila | Bloqueo optimista: una pantalla vieja no deshace una venta que ya cambió |
| **Rifa activa** | Liberar devuelve la boleta al inventario para volver a venderla, y eso es un acto comercial (BR-R08). Es la diferencia con BR-I13 |
| Cero filas en `payment_allocations` | Un abono no se queda apuntando a una venta que ya no existe (D-169) |
| Cero filas en `lottery_ticket_matches` | La fotografía del sorteo es inmutable (BR-L11, BR-L14) |
| Motivo de 5 caracteres o más | Es lo único que la bitácora no puede deducir sola |

**Liberar no es anular, y no es eliminar.** *Anular* (BR-I10) marca `cancelled`, escribe
`cancelled_at` con su motivo y **reserva la combinación de números para siempre** (BR-N08);
*eliminar* (BR-B05) borra físicamente una boleta que nunca se vendió y libera sus números. Liberar
deja la boleta viva, disponible y con sus mismos números. La transición `assigned → available` ya era
legal en `tickets_validate_status_transition` desde la Fase 2 —la máquina de estados la llama
«reversión administrativa»—; lo que faltaba era el camino para ejecutarla. Queda auditada como
`ticket.release_client` con cliente, precio, fecha de venta, `assigned_at` y números anteriores, el
motivo y el actor, además de la `ticket.update` automática de la fila.

**No crea ningún aviso.** `notify_ticket_sold` exige la transición **a** `assigned`, y aquí es la
contraria (D-169).

**Entrega del paz y salvo (BR-I15).** Cada boleta trae un desprendible que el vendedor entrega en
mano al cliente. Esto lo registra, y **nada más**: es un control de organización sobre una entrega
física, no un dato de cobranza. La operación es `set_ticket_clearance_delivery` (migración `0049`).

| Es independiente de | Quiere decir |
|---|---|
| Estado de pago, abonado, saldo pendiente y precio de venta | Una boleta **Sin pagar** puede tener su paz y salvo entregado, y una **Pagada** puede no tenerlo |
| Ganancia y comisiones | Marcarlo no mueve ni un peso ni un recuento |
| Estado de la rifa | Se sigue entregando el desprendible de lo vendido en una rifa cerrada. Es la diferencia con BR-I14 |
| Resultados de lotería | Una coincidencia no lo bloquea ni lo cambia |

**No es un estado de la boleta.** Son dos columnas propias: `clearance_receipt_delivered_at`
(`timestamptz`; **nulo = «Paz y salvo por entregar»**, con fecha = **«Paz y salvo entregado»**) y
`clearance_receipt_assumed_delivered` (`boolean`). No se toca `inventory_status` ni
`payment_status`.

**Qué significa la marca heredada.** `clearance_receipt_assumed_delivered = true` señala una boleta
que la **carga inicial** de `0049` dio por entregada al estrenar la función: su fecha es la de la
migración, **no la de una entrega real**, y la interfaz tiene prohibido presentarla como si lo fuera
(D-170). Solo puede ser verdadera acompañando a una fecha, y lo garantiza un CHECK. Una activación
manual la deja siempre en `false`, así que una boleta heredada que se desmarca y se vuelve a marcar
pasa a ser un registro manual con fecha real.

Condiciones, todas revalidadas en SQL con la fila bloqueada:

| Condición | Por qué |
|---|---|
| Boleta en `assigned` y con cliente | Se entrega el desprendible de una venta que existe |
| Quien llama es el **vendedor dueño** de la boleta | Es su entrega y es su cliente. El Dueño y el Administrador lo **consultan** pero no lo cambian, y el vendedor padre tampoco sobre la boleta de su equipo (D-092) |
| Membresía, perfil y organización activos | BR-A04: una sesión previa no sigue operando |
| `p_expected_delivered_at` coincide con la fila | Bloqueo optimista: una pantalla vieja no pisa un cambio más reciente |
| La fecha la escribe **PostgreSQL** | Es un dato de bitácora; el reloj del navegador no es una fuente |

Si el valor pedido ya es el actual **no se escribe nada**: ni `UPDATE`, ni bitácora. Al desactivar se
limpian la fecha **y** la marca heredada.

**La entrega es del cliente ACTUAL, y lo garantiza la base.** El disparador
`tickets_reset_clearance_receipt` la devuelve a pendiente cuando la boleta cambia de cliente (BR-I13)
o vuelve a `available` (BR-I14). Una boleta **anulada** conserva lo que tuviera —conserva su cliente,
BR-I06— y deja de ser editable. Registrar, corregir a $0 o anular abonos **nunca** lo cambia.

Queda auditada por `audit_tickets`, que escribe `ticket.update` con el actor, la boleta, el valor
anterior, el nuevo y el instante. La carga inicial es distinguible: su actor es **nulo** —el actor de
sistema— y lleva `assumed_delivered = true`.

⚠️ **El sistema registra cuándo se marcó la entrega. Eso no constituye por sí solo una prueba física o
legal de que el cliente recibió el documento.**

### Máquina de estados de inventario

```
draft ──(datos completos, creada por admin)──▶ available
draft ──(datos completos, creada por seller)──▶ pending_approval
pending_approval ──(aprueba owner/admin)──▶ available
pending_approval ──(rechaza owner/admin)──▶ cancelled
available ──(asignación a cliente)──▶ assigned
available ──(anulación)──▶ cancelled
assigned ──(anulación, solo sin pagos activos)──▶ cancelled
assigned ──(liberación, solo sin pagos activos)──▶ available
cancelled ──▶ (estado final, sin salidas)
```

Esa última transición se llamaba «reversión administrativa» y **no tenía camino en la aplicación**:
desde `0048` la ejecuta `release_ticket_client` (BR-I14, D-169). El diagrama describe lo que exige el
**disparador**, que es lo mismo de siempre —sin pagos activos—; la operación de BR-I14 es **más**
estricta: además pide rifa activa, cero filas en `payment_allocations` y cero coincidencias.

Cualquier transición no listada se rechaza en el trigger `tickets_validate_status_transition`.

---

## 7.b Selección múltiple y acciones masivas (BR-B)

Añadidas después de la Fase 9, a petición del usuario. Detalle de las decisiones en
[`DECISIONS.md`](DECISIONS.md) D-082 a D-085; las funciones viven en la migración `0020`.

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-B01 | Se pueden seleccionar varias boletas de la lista y actuar sobre todas a la vez. La selección se identifica **siempre** por `ticket.id`, nunca por posición, y admite como máximo **1.000** boletas por operación. | C, S, D | post-9 |
| BR-B02 | **Asignación múltiple (vendedor):** varias boletas se venden al mismo cliente en una sola operación, con las mismas reglas de BR-I07 y BR-P03 aplicadas a cada una. | C, S, D | post-9 |
| BR-B03 | **Anulación múltiple (Dueño/Administrador):** un único motivo cubre el lote. Mismas condiciones que BR-I10 y BR-I11. **Desde D-198, sin boletas vendidas** (BR-Q07). | C, S, D | post-9 |
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
| BR-P13 | **El precio de venta de una boleta ya asignada se puede corregir.** Es el mismo campo y las mismas validaciones de la asignación (BR-P09..BR-P11): techo el oficial congelado (`base_price`), suelo `ticket_sale_price_limits`, entero y mayor que cero. Además no puede ser menor que el total abonado vigente: no hay saldo a favor, ni devolución, ni reescritura de abonos. Si el nuevo precio iguala lo abonado, la boleta queda **Pagada**; si lo supera, vuelve a **Abonada** o **Sin pagar**. No cambia el precio de la rifa ni el de otras boletas. Lo hace `update_ticket_sale_price`. **Desde el 2026-09-14 (D-198), solo lo corrige el vendedor de la boleta** (BR-Q06). | C, S, D | post-9 |

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
| BR-F10 | Solo Owner o Admin pueden anular pagos. El vendedor no puede. **Suspendida el 2026-09-14 (D-198):** `void_payment` quedó dormida y ninguna sesión anula pagos (BR-Q06). | S, D | 5 · post-9 |
| BR-F11 | Al anular un pago, sus asignaciones dejan de contar y los saldos y estados se recalculan automáticamente. | D | 5 |
| BR-F12 | Está prohibido el sobrepago: `paid_amount` nunca puede superar `sale_price`, ni siquiera con dos operaciones concurrentes. | S, D | 2 |
| BR-F13 | El historial de abonos muestra fecha, valor, cliente, boleta, vendedor que registró, método, notas y estado (activo/anulado). | C, S | 5 |
| BR-F14 | Toda creación, corrección y anulación de pago queda registrada en auditoría. | D | 5 |
| BR-F15 | Un pago anulado no puede "desanularse"; se registra un pago nuevo si corresponde. (D-013) | S, D | 5 |
| BR-F16 | El vendedor dueño del cliente y el personal pueden corregir el **valor** de un abono vigente, **incluido bajarlo a $0** (D-158). Se reescribe esa asignación, no se crea otro pago. No se cambia de boleta, cliente ni vendedor. Un pago anulado no se edita (BR-F15). El recálculo de saldo, estado y ganancia es el de siempre (BR-F07, BR-F11, BR-G01, BR-G06). (D-134, D-158) **Desde el 2026-09-14 (D-198), solo el vendedor** (BR-Q06). | C, S, D | post-9 |
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
| BR-D04 | Solo Owner y Admin consultan la auditoría de su organización. **Desde el 2026-09-14 (D-198), redactada y sin las acciones de venta**, por `admin_audit_log`; la tabla no tiene política de lectura (BR-Q10). | D | 2 · post-9 |

---

## 11. Reportes (BR-T)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-T01 | Reportes mínimos: ventas por vendedor, recaudo por vendedor, saldo pendiente por vendedor, boletas por estado, clientes con saldo pendiente, pagos por rango de fechas y boletas por rifa. **Desde el 2026-09-14 (D-198)**, los de dinero y cartera son solo del vendedor; el personal conserva los de recuentos (BR-Q08). | S | 6 · post-9 |
| BR-T02 | Las tablas principales se exportan a CSV. | C, S | 6 |
| BR-T03 | Los reportes del portal Seller nunca exponen datos de otros vendedores. | S, D | 6 |
| BR-T04 | Todos los reportes son filtrables por rifa; los administrativos también por vendedor, cliente, estado y fecha. **Desde D-198 los administrativos no filtran por cliente** (BR-Q08). | S | 6 · post-9 |
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
| BR-L06 | La coincidencia es textual y exacta. El número mayor son cuatro dígitos. `0046` no coincide con `46`. Prohibido casteo, `lpad` o recorte de ceros. Lunes a viernes usan `daily_number`; Boyacá, `weekly_number`. **Desde D-203 esto describe las rifas heredadas (`prize_mode = 'legacy'`)**: en una rifa configurable, qué número juega, con cuántas cifras y qué día lo dicen sus premios (BR-J02, BR-J06, BR-J07), con la misma prohibición de castear o rellenar. | D | post-9 |
| BR-L07 | La serie es informativa, nullable, y no participa en la coincidencia ni en los avisos. | D | post-9 |
| BR-L08 | Un sorteo confirmado no admite un segundo número activo. Si una fuente trae otro, se marca `conflict` y no se sobrescribe. | D | post-9 |
| BR-L09 | Vendida = asignada con `assigned_at ≤ official_scheduled_at`. `payment_status` no interviene. | D | post-9 |
| BR-L10 | Una asignación posterior no convierte en vendida la fotografía. Queda `late_assignment` sin cliente. | D | post-9 |
| BR-L11 | Cada coincidencia es una fotografía inmutable (resultado + boleta + campo). Los reintentos no duplican. | D | post-9 |
| BR-L12 | El matching es una operación de conjunto en PostgreSQL, idempotente. | D | post-9 |
| BR-L13 | Programación y resultados son nacionales. Las coincidencias se aislan por organización. | D | post-9 |
| BR-L14 | El vendedor solo ve coincidencias de sus boletas. `tickets_select` no se amplía (D-141, D-092). | D | post-9 |
| BR-L15 | No se llama «ganador» al cliente ni a la boleta. La plataforma detecta coincidencia numérica; no certifica el premio oficial. **Precisada por BR-J17 (D-208):** el historial habla de **premios**, que son de la rifa, mientras el **resultado** y la **coincidencia** siguen siendo de la lotería; la prohibición de «ganador», «ganadora» y «premiada» no se relaja, y una prueba unitaria la vigila. | C | post-9 |
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
| BR-K15 | **Un corte pasajero de la base no se enseña al visitante, ni se disfraza.** Cada lectura del catálogo se repite **una vez** si Supabase responde 502, 503, 504, 520, 522 o 524, o si falla la red. Si el corte sigue, se pinta una página de error **del catálogo** —«No pudimos cargar los números disponibles»— que **no** es la de «no encontrado» de BR-K10, no enseña ningún detalle interno y ofrece «Reintentar», que vuelve a pedir los datos. Un 4xx o un 500 no se repiten (D-196, I-114). | C, S | post-9 |

---

## 12.bis Invitación al grupo de WhatsApp (BR-W)

Cada vendedor mantiene a sus clientes en un grupo de WhatsApp propio. Después de registrar un
cliente nuevo, la aplicación le ofrece invitarlo con el mensaje ya escrito. **No hay integración con
WhatsApp**: se abre un enlace `wa.me` y el vendedor pulsa Enviar (D-176).

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-W01 | El grupo es **de cada vendedor**, no de la organización: se guarda en su propia `membership` (`whatsapp_group_url`), junto a la configuración del catálogo. No hay una segunda entidad de vendedor. El enlace debe tener la forma `https://chat.whatsapp.com/<código>`, con `https` obligatorio; el código **no se acota a una longitud exacta**, porque WhatsApp los ha emitido de largos distintos. Que el grupo exista o siga abierto **no se puede comprobar** y no se finge comprobarlo. | C, S, D | post-9 |
| BR-W02 | El mensaje predeterminado **vive en la aplicación**, no en la base de datos: `whatsapp_custom_message` es NULL en quien lo usa, que es el caso normal. Guardarlo repetido por vendedor haría que mejorar la redacción exigiera un UPDATE masivo y que dos personas dadas de alta en fechas distintas tuvieran textos distintos sin haber elegido ninguno. | C, S | post-9 |
| BR-W03 | El interruptor `whatsapp_use_custom_message` manda sobre el texto guardado, no al revés. Apagarlo **no borra** lo escrito: volver a encenderlo lo devuelve tal cual. Lo único que lo borra es vaciar el campo a propósito. Un CHECK impide el estado incoherente «uso mi mensaje» sin mensaje. | C, S, D | post-9 |
| BR-W04 | **El enlace del grupo nunca forma parte del texto.** El vendedor escribe solo prosa y el sistema añade `Únete aquí: <enlace>` al final al construir el mensaje. No hay marcador que conservar, así que no hay nada que borrar, escribir mal ni duplicar, y no hace falta validación ni explicación de sintaxis. La pantalla de configuración muestra la **vista previa del mensaje completo**, con el enlace ya puesto. | C, S | post-9 |
| BR-W05 | La invitación se ofrece **solo cuando puede funcionar**. Sin grupo configurado, la acción se sustituye por «Configurar WhatsApp», que lleva a la pantalla; con un teléfono que no sirve para WhatsApp, se explica y **no se ofrece ninguna acción que vaya a fallar**. El teléfono se vuelve a comprobar aunque `PHONE_REGEX` lo haya aceptado: un fijo de siete cifras pasa el formulario y no es un número internacional válido. | C, S | post-9 |
| BR-W06 | El diálogo de éxito dice **lo que pasó de verdad**: desde una boleta, que el cliente quedó registrado y la boleta es suya —nombrándola por sus dos números (BR-N11), o diciendo cuántas si son varias—; desde «Mis clientes», solo que el cliente quedó registrado, y **no menciona ninguna boleta**. No se puede cerrar con `Escape`, pulsando fuera ni con una «X»: es una bifurcación, no un aviso. WhatsApp se abre **únicamente** con un clic explícito. **Y no se cierra solo NUNCA:** ni por temporizador, ni al terminar una revalidación, ni al re-renderizarse la pantalla, ni porque desaparezca lo que lo abrió. En concreto, **no puede vivir bajo ninguna condición que la propia operación vuelva falsa** —`canAssign`, `archived_at`, «quedan boletas disponibles»—: se monta en el layout del portal, que ninguna operación apaga (D-179). Lo único que lo cierra es un botón. | C | post-9 |
| BR-W07 | Un vendedor configura **solo lo suyo**. La escritura pasa por `set_seller_whatsapp_settings`, que **no recibe ningún identificador de vendedor**: sale de `auth.uid()`, así que no existe el dato que alguien pudiera manipular. `memberships_update_staff` sigue siendo la única política de escritura de esa tabla y **no se amplía**: hacerlo abriría rol, estado, vendedor padre y ganancia para poder guardar un enlace. El personal no puede usar la RPC; un vendedor padre tampoco sobre un integrante de su equipo. El cambio lo audita el disparador `audit_memberships` que ya existía. | S, D | post-9 |
| BR-W08 | **No hay integración con WhatsApp y no se finge que la haya.** Sin API, sin SDK, sin sesión, sin automatización y sin forma de saber si el mensaje se envió o si el cliente se unió al grupo. Ningún texto puede decir «cliente agregado», «aceptó» ni «se unió». Si el navegador bloquea la ventana, se dice; nunca se da por abierta. | C, S | post-9 |

---

## 12.d Cuentas para recibir pagos (BR-M)

> **COMPLETA Y EN PRODUCCIÓN desde el 2026-09-12** (`0051`, Etapa 1; pantalla, Etapa 2, D-188;
> promoción, Etapa 7, D-193). Un vendedor agrega, corrige, ordena y archiva sus cuentas desde
> `/seller/settings/accounts`, también en el proyecto real.
>
> Dos cosas salieron de implementarlo y conviene leerlas antes de tocar nada: **el tope de cinco no
> es un trigger, es la forma de la tabla** (una cuenta activa ocupa una posición del 1 al 5, única
> por vendedor, así que no hay sexta), y **las tablas no tienen política de escritura**: las RPC son
> la única puerta, de modo que el tope, el orden y la bitácora son inevitables en vez de ser cosas
> que la pantalla se acuerda de hacer.

Cada vendedor administra las cuentas donde sus clientes le consignan: Nequi, Daviplata y cuentas
bancarias, con sitio para más formas en el futuro. Son **datos operativos del vendedor**, no parte de
su perfil personal, y **solo él los ve** (D-185).

> **Desde el 2026-09-19 (D-209, `0073` y `0074`; en producción desde esa misma tarde): dos formas más, Bre-B y «Otros».** Las
> pidió el dueño del producto con sus campos y sus reglas; lo que distingue a esas dos formas es que
> no se identifican con un teléfono ni con un número de cuenta, sino con **un texto libre** —la
> llave de Bre-B, o el número o identificador de otra forma de pago—, que tiene su propia regla
> (BR-M10) y su propia forma de comparar duplicados (BR-M08). **Nada cambia para Nequi, Daviplata ni
> banco.** **Todavía no está en producción.**

**La letra es `M` de «medios de cobro»**, porque `C` ya nombra a los clientes y `P` al precio; no hay
más significado.

| ID | Regla | Capas | Estado |
|----|-------|-------|--------|
| BR-M01 | Las cuentas viven en una **tabla propia** (`seller_payment_accounts`), con RLS forzada y política propia, **nunca** en columnas de `memberships`. `memberships_select` deja leer esa fila al personal de la organización y al vendedor padre, así que una columna más publicaría el dato a quien el contrato excluye. La tabla cuelga de la membresía por la FK compuesta `(seller_id, organization_id)`, igual que `tickets` y `clients`: se separa el dato, no la identidad del vendedor. | D | ✅ `0051` |
| BR-M02 | Una cuenta pertenece a **un vendedor**, que es el único usuario humano que puede leerla, crearla, editarla y archivarla. **Ni el Dueño, ni el Administrador, ni el vendedor padre** acceden —ni por pantalla, ni por reporte, ni por exportación, ni por PostgREST—. La escritura pasa por una RPC `SECURITY DEFINER` que **no recibe identificador de vendedor**: sale de `auth.uid()`, el mismo patrón que BR-W07. Cambiarlo exige una decisión explícita y posterior del dueño del producto. | C, S, D | ✅ `0051` |
| BR-M03 | El tipo de cuenta es un **enumerado**: `nequi`, `daviplata`, `bank` y, desde D-209, **`breb` (Bre-B)** y **`other` («Otros»)**. Añadir una forma futura es `alter type … add value` más su CHECK, en una migración nueva; nunca un texto libre. **El valor nuevo y lo que lo usa van en dos migraciones**: PostgreSQL no deja usar un valor de enumerado en la transacción que lo añade (`55P04`, medido), y el CLI aplica cada archivo en la suya (`0073` y `0074`). | D | ✅ `0051` · Bre-B y «Otros»: `0073` (solo local) |
| BR-M04 | Qué se guarda, según el tipo, y **un CHECK lo impone**: Nequi y Daviplata piden **titular y teléfono**; una cuenta bancaria pide **banco, tipo de cuenta (ahorros o corriente), número y titular**; **Bre-B pide su llave y titular, y «Otros» su número o identificador y titular** (D-209), los dos en la columna `identifier`. Los campos que no corresponden al tipo quedan nulos: no existe una cuenta de Nequi con número de cuenta bancaria ni con llave. El CHECK tiene **una rama por forma y `else false`**: una forma nueva que no decida su rama se rechaza. **No se guarda el documento de identidad del titular** (D-185, Decisión 2). | C, S, D | ✅ `0051` · Bre-B y «Otros»: `0074` (solo local) |
| BR-M05 | Cada cuenta lleva una **etiqueta opcional** que escribe el vendedor y un **orden**, que es el orden en que aparece en el mensaje. El orden lo decide el vendedor; si no lo toca, es el de creación. | C, S, D | ✅ Etapa 2 |
| BR-M06 | **Tope duro de 5 cuentas sin archivar por vendedor**, comprobado en la base y no solo en la pantalla. La sexta se rechaza con un mensaje que dice qué hacer. Subir la cifra es una migración. | S, D | ✅ `0051` |
| BR-M07 | Una cuenta **se archiva, nunca se borra**: no hay `DELETE` en este producto (D-038). Archivar la saca del listado y del mensaje y conserva la fila. Una cuenta archivada no cuenta para el tope y se puede volver a activar, sujeta al tope. | C, S, D | ✅ `0051` |
| BR-M08 | **No se permiten dos cuentas iguales sin archivar** del mismo vendedor: mismo tipo y mismo número —teléfono o número de cuenta, comparado solo por sus dígitos—. Dos filas idénticas en el mensaje son un error de dedo, no una configuración. **Bre-B y «Otros» comparan el identificador ENTERO** (D-209), ya guardado sin espacios exteriores (BR-M10) y **distinguiendo mayúsculas**: «@maria» y «@pedro» no son la misma cuenta aunque ninguna tenga dígitos, ni «@maria123» y «@pedro123» aunque compartan los mismos, ni «@Maria» y «@maria». Siempre dentro del mismo vendedor y del mismo tipo. Lo impone un **índice único** —no una comprobación de la RPC—, así que vale igual al agregar, al editar, al volver a usar una archivada y con dos peticiones a la vez. | S, D | ✅ `0051` · Bre-B y «Otros»: `0074` (solo local) |
| BR-M09 | Las cuentas **no viajan a ninguna superficie pública**. No salen en el catálogo público (BR-K07 fija su proyección y no se amplía), no salen en un push (BR-V05), no salen en un reporte ni en un CSV, y no se consultan desde ningún layout ni panel. El único sitio donde se leen es la pantalla del propio vendedor y la composición de su mensaje. | C, S, D | ✅ Etapa 2 |
| BR-M10 | **La llave de Bre-B y el número o identificador de «Otros» se guardan TAL COMO SE ESCRIBEN**: letras, números, símbolos, ceros iniciales y mayúsculas. **No se les añade ni se les exige un «@»**, no se convierten a número y no se les quita nada **salvo los espacios exteriores** —exactamente los que quita `String.prototype.trim()`, en las tres capas—. Tienen que tener **de 1 a 100 caracteres** (puntos de código) y **una sola línea**: se rechazan los caracteres de control (U+0000–U+001F, U+007F–U+009F), los separadores de línea y párrafo (U+2028, U+2029) y los de formato invisibles que se cuelan al copiar y pegar (U+00AD, U+200B–U+200F, U+202A–U+202E, U+2060–U+206F, U+FEFF). **La misma regla y las mismas frases** en el formulario, la Server Action, la RPC y el CHECK. Es un dato para recibir pagos: la aplicación **no comprueba con ningún banco que la llave exista**. El límite de 100 y la lista de invisibles son decisiones técnicas de D-209, no del dueño. | C, S, D | ✅ `0074` (solo local) |

---

## 12.e Recordatorios de pago del vendedor (BR-S)

> **LAS CATORCE REGLAS ESTÁN IMPLEMENTADAS EN LOCAL**: base (`0051`, Etapa 1), pantalla (Etapa 2,
> D-188) y **motor** (`0052`, Etapa 3, D-189). Un vendedor crea, edita, pausa, reanuda y archiva sus
> recordatorios; a la hora que eligió, un `pg_cron` materializa la ocurrencia y **escribe el aviso en
> la campana**, que lleva a la pantalla donde copia el mensaje, abre su grupo y lo marca como
> atendido.
>
> **UN MATIZ QUE LA COLUMNA «ESTADO» NO CABE A DECIR.** La pantalla **sigue sin enseñar la fecha del
> próximo envío**, por decisión y no por falta: el reloj se mueve por debajo (D-189, Decisión 9).
>
> ✅ **En producción desde el 2026-09-12** (Etapa 7, D-193), con el push de las etapas 4 y 5 incluido.

Cada vendedor programa mensajes semanales de cobro. La aplicación se los recuerda a la hora que él
eligió y le prepara el texto; **él** lo pega en su grupo de WhatsApp y lo envía.

**La letra es `S`** de «recordatorios **s**emanales»; `R` ya nombra a las rifas.

| ID | Regla | Capas | Estado |
|----|-------|-------|--------|
| BR-S01 | Un recordatorio es **del vendedor, no de una rifa**: no se ata a ninguna, no se reconfigura al abrir una rifa nueva y no deja de sonar al cerrarse una. Vive en tabla propia (`seller_payment_reminders`) con el mismo aislamiento que BR-M01 y BR-M02. | C, S, D | ✅ `0051` |
| BR-S02 | La recurrencia es **semanal**: un día de la semana y una hora **con precisión de minuto**. El vendedor puede crear **varios el mismo día** a horas distintas. **No puede crear dos idénticos**: mismo día y misma hora es una sola fila, y lo impone un índice único. | C, S, D | ✅ `0051` |
| BR-S03 | El reloj se interpreta **siempre en `America/Bogota`**, con la zona nombrada y nunca con un desfase escrito a mano. Colombia no cambia la hora desde 1993, pero el día que una ley lo cambie ese no debe ser el sitio donde se descubra. | S, D | ✅ `0051` |
| BR-S04 | Un recordatorio está **activo**, **pausado** o **archivado**. Pausar lo calla sin perder su configuración; reactivar lo devuelve tal cual; archivar lo retira del listado y conserva la fila. **No se borra** (D-038). | C, S, D | ✅ `0051` |
| BR-S05 | **Tope duro de 14 recordatorios activos por vendedor**, comprobado en la base. Un pausado no cuenta, y **reactivar vuelve a comprobar el tope**: si no, bastaría con pausar, crear y reactivar para saltárselo. | S, D | ✅ `0051` |
| BR-S06 | El recordatorio guarda **prosa y nada más**: su propio mensaje o el predeterminado de la aplicación, con el mismo interruptor y la misma coherencia que BR-W02 y BR-W03 —el predeterminado **vive en TypeScript**, no en la base; apagar el interruptor **no borra** lo escrito; «uso mi mensaje» sin mensaje es un estado imposible—. | C, S, D | ✅ `0051` |
| BR-S07 | **Las cuentas activas se añaden solas al final del mensaje**, en su orden, y **no forman parte del texto que escribe el vendedor**. **Quedan prohibidos los marcadores editables** —`{{cuentas}}`, `{{nequi}}` o cualquier otro—: no hay nada que conservar, así que no hay nada que borrar, escribir mal ni duplicar. Es BR-W04 aplicado a este mensaje. La pantalla muestra la **vista previa del mensaje completo**. | C, S | ✅ Etapa 2 |
| BR-S08 | El mensaje **se compone cuando el vendedor lo abre o lo copia**, con la configuración vigente en ese instante. Consecuencia buscada: **cambiar una cuenta cambia los mensajes futuros sin reescribir ni un recordatorio**, y sin tocar los ya materializados. | C, S | ✅ `0052` |
| BR-S09 | El mensaje **no nombra a ningún cliente, no dice ningún saldo y no dice ningún importe**. Va a un grupo donde están todos los clientes del vendedor: escribir ahí quién debe cuánto publicaría la deuda de una persona delante de las demás. | C, S | ✅ Etapa 2 |
| BR-S10 | Cuando llega su hora, un recordatorio activo produce una **ocurrencia** (`payment_reminder_occurrences`): una fila por `(recordatorio, instante programado)`, con **índice único**. Esa unicidad es lo que hace el proceso **idempotente**: ejecutarlo dos veces sobre el mismo vencimiento no crea dos avisos. | S, D | ✅ `0052` |
| BR-S11 | Una ocurrencia **atrasada hasta 2 horas se recupera**: se materializa pendiente, con campana y con push. **Más allá de 2 horas se registra como omitida**, **sin** campana y **sin** push, y el recordatorio avanza a la semana siguiente. La fila omitida se guarda igual: es lo que distingue «no se mandó» de «nadie se enteró». Si se saltaron varias semanas, **no se disparan todas**: se registra una omitida y el reloj salta al próximo instante futuro. | S, D | ✅ `0052` |
| BR-S12 | El proceso **tolera concurrencia**: las filas vencidas se toman con `for update skip locked`, de modo que dos ejecuciones simultáneas trabajan sobre conjuntos disjuntos. Materializar la ocurrencia, escribir la campana, encolar el push y avanzar el reloj ocurren **en la misma transacción**: o pasan las cuatro, o no pasa ninguna. | S, D | ✅ `0052` |
| BR-S13 | Un recordatorio **no se procesa** si su vendedor ya no puede operar: cuenta inactiva, membresía que dejó de ser de vendedor u organización desactivada. Se comprueba **al procesar**, no solo al configurar (BR-A04). | S, D | ✅ `0052` |
| BR-S14 | El flujo del vendedor es **copiar → abrir → atender**, y los tres describen **actos locales**: «Copiado» dice que el texto está en el portapapeles de ese teléfono, «Grupo abierto» que se abrió el enlace, y «Marcado como atendido» que **lo dijo el vendedor**. **Ninguno puede presentarse como confirmación de envío o de entrega de WhatsApp**: no hay integración y no se sabe si el mensaje salió (BR-W08). | C, S | ✅ `0052` |

---

## 12.f Entrega de avisos: campana y Web Push (BR-V)

> **LAS OCHO ESTÁN IMPLEMENTADAS**, en tres etapas: BR-V01 con el motor (`0052`, D-189); BR-V04,
> BR-V05 y BR-V06 con las suscripciones y el service worker (`0053`, D-190); y BR-V02, BR-V03,
> BR-V07 y BR-V08 con **la outbox y el despachador** (`0054`, D-191).
>
> El canal está **completo**: un recordatorio que vence escribe su campana, encola su aviso y llega
> al teléfono con la aplicación cerrada. El cifrado es propio, sobre el `crypto` de Node y **sin
> ninguna dependencia**, comprobado contra los vectores publicados en el RFC 8291.
>
> ✅ **En producción desde el 2026-09-12** (Etapa 7, D-193), y **opcional hasta que se configura**:
> sin claves VAPID no se ofrecen los avisos ni se envía nada, y sin secreto el despachador falla
> cerrado. La campana interna no depende de nada de esto (BR-V01). Lo único sin comprobar es que un
> aviso llegue a un teléfono de verdad, que necesita un dispositivo.
>
> La **campana ya existía** desde D-093 y estas reglas no la cambian: describen cómo se le añade un
> canal encima.

**La letra es `V`** de «a**v**isos». Estas reglas gobiernan **la entrega**, no el contenido: valen
para el recordatorio de pago y para cualquier aviso futuro que quiera salir del navegador.

| ID | Regla | Capas | Estado |
|----|-------|-------|--------|
| BR-V01 | **La campana interna es obligatoria y es la fuente durable.** Todo aviso se escribe en `notifications` (D-093) y se lee ahí. Web Push es **una mejora encima**: sin permiso, sin soporte del navegador o con el envío caído, el aviso sigue existiendo y se ve al entrar. | S, D | ✅ `0052` |
| BR-V02 | El push sale por una **outbox desacoplada** (`push_outbox`): el aviso interno y la fila de la cola se escriben en la misma transacción, y el **envío ocurre después, en otro proceso**. Un fallo de red, un endpoint caducado o un dispatcher caído **no pueden perder el aviso interno**, porque no participan en escribirlo. | S, D | ✅ `0054` |
| BR-V03 | Se usa **Web Push estándar** —VAPID (RFC 8292) y cifrado `aes128gcm` (RFC 8291)—, implementado sobre el `crypto` de Node. **No se usa Firebase**, no entra SDK en el navegador y **la CSP no se abre a ningún dominio nuevo**: al servicio de push lo llama el servidor. | S | ✅ `0054` |
| BR-V04 | **Hay un solo service worker** y su alcance es la raíz. Los oyentes `push` y `notificationclick` se añaden **al final de `public/sw.js`**, en su propia sección. **Queda prohibido crear un segundo service worker.** El worker **sigue sin guardar ni una respuesta con datos de negocio** (D-116): recibir un push no cambia esa regla. | C | ✅ `0053` |
| BR-V05 | **El push es genérico.** No lleva cuentas, ni números de cuenta, ni el mensaje personalizado, ni nombres de clientes, ni importes, ni saldos: lo lee cualquiera que mire una pantalla bloqueada, y dos vendedores compartiendo un teléfono es el caso normal aquí. Lleva que hay un recordatorio y a dónde ir. **El contenido se compone al abrir la aplicación, con sesión.** | C, S | ✅ `0053` |
| BR-V06 | Una suscripción es **de un dispositivo**, identificada por su `endpoint`, que es único. Una persona puede tener varias. El permiso se pide **en una pantalla y a propósito**, nunca al cargar la aplicación: pedirlo sin contexto es la forma más rápida de que lo denieguen para siempre. | C, S, D | ✅ `0053` |
| BR-V07 | Un `404` o un `410` del servicio de push significa que esa suscripción **murió**: se marca revocada y **no se reintenta**. Los demás fallos reintentan con retroceso y tope; la fila que agota los intentos queda marcada con su motivo, y **la campana sigue ahí**. | S, D | ✅ `0054` |
| BR-V08 | El dispatcher es un **Route Handler Node protegido** que no usa sesión: secreto por cabecera, comparado a **tiempo constante**, con longitud mínima, limitación de intentos y **fallo cerrado** si no está configurado. **El secreto nunca viaja por la URL.** Es el patrón de `/api/lottery/sync` (D-148), reutilizado, no reinventado. Un Route Handler **no hereda la guarda de su layout** (D-060). | S | ✅ `0054` |

---

## 12.g Resultados de la semana (BR-H)

Mantenimiento posterior a la Fase 9 (2026-09-13, D-194, D-195; el mensaje propio, D-197). Una sección
de «Configuración» del vendedor que prepara la **imagen** y el **mensaje** con los números mayores de
la última semana terminada, para que **él** los envíe a su grupo. **No hay integración con WhatsApp y
no se guarda nada de lo que se genera**: la imagen se compone cada vez que se pide. Lo único que se
guarda es el mensaje propio del vendedor, si decide usar uno (BR-H09, BR-H10).

**La letra es `H`** de «**h**oja de resultados»: `R`, `S` e `I` ya nombran rifas, recordatorios e
inventario.

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-H01 | **La semana es la última TERMINADA, de lunes a sábado, en `America/Bogota`.** Un domingo es la que acaba de cerrar; de lunes a sábado, la anterior completa; **nunca la semana en curso**. Se decide por día calendario, y cada lotería se busca por su **`reference_date`** —su día nominal (BR-L01, BR-L03)—: un sorteo adelantado o aplazado sigue siendo el de su día. | S | post-9 |
| BR-H02 | **Se leen solo `lottery_draw_schedules` y `lottery_results`, bajo la RLS de quien pregunta**, en una consulta y sin ninguna fuente externa (BR-L20). Las seis loterías salen **siempre en el orden de `LOTTERY_CODES`**, y el número mayor se copia **como texto**: `0046` es `0046` (BR-L06). No se leen ni se muestran serie, coincidencias, boletas ni clientes. | S, D | post-9 |
| BR-H03 | **Lista solo con los SEIS resultados `confirmed` y de cuatro cifras.** Sin programación, sin resultado, `pending`, `rejected`, `conflict` o un número con otra forma dejan la semana **pendiente**: se nombran las loterías que faltan, **no se compone ninguna imagen parcial**, el mensaje no se presenta como listo y compartir, descargar y copiar se desactivan. El número de un sorteo sin confirmar **no se enseña**, ni siquiera el de un conflicto (BR-L08). | C, S | post-9 |
| BR-H04 | **La imagen es un PNG de 1080 × 1350** sobre el fondo maestro fijo, con nombre, semana, tarjetas, iconos y pie dibujados por código. El nombre es **`raffles.name` de la rifa configurada en el catálogo del vendedor** (BR-K06), en mayúsculas y sin reinterpretar, y solo cuenta si esa rifa está **activa o cerrada** (BR-L05). **Sin rifa no hay imagen y no se elige ninguna** (D-140). Es la misma para todos los vendedores de una rifa: sin vendedor, teléfono, enlaces, precios ni QR, y **nunca dice «ganador»** (BR-L15). Lo que la fuente no puede dibujar —un emoji— se omite **solo en la imagen** (D-195). | S | post-9 |
| BR-H05 | **`GET /api/weekly-results/image?week=AAAA-MM-DD` se protege a mano** (D-060): sesión (401), membresía activa (403), rol vendedor (403) y `week` = el lunes de una semana ya terminada (400). Sin rifa o sin la semana completa responde **409** y no dibuja nada. **No acepta ningún identificador** de vendedor, organización ni rifa. Toda respuesta lleva `Cache-Control: private, no-store`, y los errores son genéricos. | S, D | post-9 |
| BR-H06 | **El mensaje predeterminado vive en el código y nunca se guarda**: no lleva el enlace del grupo ni números, y dice la semana entera en español («del 17 al 22 de agosto de 2026»). Los días y la lotería del número semanal salen de las constantes de loterías. Quien no usa uno propio recibe cada semana el de esa semana y cualquier mejora de la redacción. **Desde D-197, cada vendedor puede sustituirlo por uno propio (BR-H09)**: la parte de esta regla que decía «no se personaliza en esta versión» quedó sustituida. | C, S | post-9 |
| BR-H07 | **La imagen se pide una vez y es la misma en la vista previa, al compartir y al descargar.** Compartir usa `navigator.share` con el **archivo** —y título y **mensaje activo** (BR-H09) si el navegador los acepta— **solo** si `canShare({ files })` lo permite; cancelar el menú **no es un error**; sin soporte no se ofrece y se propone descargar. Copiar pone **solo el mensaje activo**. «Abrir mi grupo» abre el enlace validado en otra pestaña con `noopener noreferrer`; sin grupo se ofrece configurarlo y **lo demás sigue disponible**. **Nada se envía solo y ningún texto dice que algo se envió** (BR-W08). | C | post-9 |
| BR-H08 | **No se guarda nada de lo que se genera, y no hay costo recurrente**: ni imágenes, ni resultados semanales, ni PNG, ni mensajes compuestos, ni bucket, ni cron, ni IA, ni integración con WhatsApp. **La única persistencia autorizada es la preferencia y el texto del mensaje propio de cada vendedor**: dos columnas de su `membership` (migración `0056`, BR-H09). La parte de esta regla que prohibía toda migración quedó sustituida por D-197. El resumen de «Configuración» **no** genera la imagen, ni consulta los resultados, ni lee el mensaje: su tarjeta tiene una línea fija. | S, D | post-9 |
| BR-H09 | **El vendedor puede usar su propio mensaje**, con el interruptor «Usar mi propio mensaje». Apagado se usa el predeterminado de la semana, y el área lo enseña en modo lectura. Encendido, el texto propio **sustituye entero** al predeterminado y se usa **literalmente**: no hay marcadores (`{{semana}}`, `{{fecha}}`…), así que una fecha escrita dentro no se actualiza sola, y la pantalla lo advierte. La primera vez que se enciende arranca con una copia del predeterminado que se está viendo. **Apagar no borra el texto**: encender lo devuelve. «Volver al mensaje predeterminado» apaga **y** vacía el texto. Máximo **1.000 caracteres**, recortado por fuera al guardar; «usar mi propio mensaje» sin texto **no se puede guardar**. **La vista previa, «Copiar mensaje» y «Compartir imagen» usan el mismo mensaje activo, esté guardado o no**, y con datos incoherentes se cae al predeterminado. El mensaje **se edita y se guarda aunque falten resultados**: lo que espera a la semana completa son la vista previa, copiar y compartir (BR-H03). Si su configuración no se puede leer, la sección se pinta, se dice, se usa el predeterminado y **no se ofrece guardar**. Siempre se pinta como texto. | C, S, D | post-9 |
| BR-H10 | **Cada vendedor configura solo su mensaje.** La escritura pasa por `set_seller_weekly_results_message`, que **no recibe identificador** de vendedor, perfil, organización ni membresía —sale de `auth.uid()`—, exige un vendedor **activo** y escribe dos columnas de su propia fila. El Dueño, el Administrador y el vendedor padre **no pueden** usarla sobre nadie, y `anon` no puede ejecutarla. `memberships_update_staff` **no se amplía**. Cambiar un mensaje no afecta a ningún otro vendedor, y lo anota una sola vez el disparador `audit_memberships` que ya existía. El personal y el vendedor padre pueden leer el texto, como ya leían el enlace del grupo (BR-W07): es un mensaje hecho para publicarse. | S, D | post-9 |

---

## 12.h La cartera es del vendedor (BR-Q)

Mantenimiento posterior a la Fase 9 (2026-09-14, D-198, migración `0057`). El Dueño y el
Administrador **administran el inventario**; la **venta** —a quién, a qué precio, cuánto se abonó y
cuánto se debe— es de cada vendedor, y no la ven ni la tocan. Se aplica en la base de datos, no en la
pantalla. Alcance **B**, elegido por el usuario: tampoco ven dinero ni ganancias por vendedor.

**La letra es `Q`** de «**q**uién vende»: `C`, `V` y `P` ya nombran clientes, avisos y precios.

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-Q01 | **La cartera es del vendedor.** El Dueño y el Administrador no leen ni modifican, por ninguna vía —pantalla, URL, Server Action, PostgREST, RPC, vista, reporte, CSV, aviso o bitácora—, los clientes de un vendedor (nombre, alias, teléfono, correo, notas e identificador), el precio de venta ni el precio base de una boleta, lo abonado, el saldo, el porcentaje, los pagos ni sus asignaciones. Tampoco pidiéndolos por un identificador conocido. | C, S, D | post-9 |
| BR-Q02 | **Lo que el personal sí ve de una boleta es una lista blanca**: números diario y semanal, código interno, rifa, vendedor, estado de inventario, estado de pago administrativo (BR-Q04), paz y salvo, fecha de venta —solo si está vendida— y las fechas y el motivo de creación, aprobación y anulación. **Ampliada por BR-J21 (D-208)** con los campos del historial de premios ganados —sorteo, número mayor, número que coincidió, premio e importe—, que **no son de la cartera** y llegan por su propia proyección, también sin un solo dato de cliente. Llega por las funciones `admin_*`, que no devuelven ningún otro campo, y los tipos de la aplicación tampoco los declaran. | S, D | post-9 |
| BR-Q03 | **El inventario sigue siendo del personal**: crear boletas sin venta, editar números, aprobar, cambiar de vendedor, eliminar las que nunca entraron en la operación y anular las que no se han vendido. | C, S, D | post-9 |
| BR-Q04 | **El personal ve dos estados de pago: «Pagada» y «Sin pagar».** «Sin pagar» incluye las boletas con abonos parciales, y una boleta sin vender no tiene estado de pago («—»). El filtro se resuelve en SQL **antes** de contar y paginar, y un `partial` recibido es un error, nunca «Abonada». El enum, `TICKET_PAYMENT_STATUS_LABELS` y la insignia global no cambian: «Abonada» sigue siendo del vendedor. | C, S, D | post-9 |
| BR-Q05 | **El personal busca solo por número.** Un término que no sea de 1 a 4 dígitos no consulta nada y responde lo mismo que uno inexistente: buscar un nombre no confirma que ese cliente exista. No hay filtro por cliente, y un `clientId` en la URL se ignora. | C, S, D | post-9 |
| BR-Q06 | **Solo el vendedor de la boleta o del cliente vende y cobra**: asignar, cambiar o liberar el cliente, corregir el precio, registrar o corregir abonos y crear, editar o archivar clientes. El personal recibe **el mismo mensaje** que un vendedor ajeno. **Nadie anula pagos desde la aplicación**: `void_payment` queda sin `EXECUTE` para las sesiones, con su cuerpo intacto. | S, D | post-9 |
| BR-Q07 | **Ningún rechazo delata la cartera.** El personal no anula una boleta vendida, tenga o no abonos, y el rechazo es el mismo para las tres; la selección múltiple lo explica sin nombrar abonos, clientes ni precios. **La importación, en los dos portales, admite solo boletas sin vender**: una fila con cliente o con abono se aparta en la vista previa y se rechaza en el servidor. | C, S, D | post-9 |
| BR-Q08 | **Sin dinero ni cartera en las pantallas del personal** (alcance B): su portal no tiene «Clientes» ni «Pagos»; el panel, «Vendedores», la ficha del vendedor, «Rifas» y «Reportes» cuentan boletas —Pagadas y Sin pagar incluidas— y no enseñan vendido, recaudado, saldo ni ganancia. Sus reportes son «Por vendedor», «Boletas por estado» y «Boletas por rifa», y su CSV sale de las mismas lecturas. | C, S, D | post-9 |
| BR-Q09 | **Avisos y coincidencias sin cartera.** El aviso de venta que recibe el personal no lleva el precio —tampoco los antiguos, y un disparador lo quita al ascender a alguien a Dueño o Administrador—; el del vendedor padre lo conserva. Las coincidencias de lotería del personal no traen cliente. | S, D | post-9 |
| BR-Q10 | **La bitácora del personal va redactada**: `admin_audit_log` no enseña las acciones de venta y de precio ni las entidades cliente y pago, deja de cada fila solo claves de lista blanca y omite la que se queda vacía. `audit_logs` no tiene política de lectura; la entera solo la lee la service role. | S, D | post-9 |

**Reversible.** Volver a dar acceso es una migración nueva y cambios explícitos de aplicación; el
procedimiento está en D-198. Llevan nota de lo que esta sección acota: BR-E08, BR-G12, BR-N12, BR-N13,
BR-N14, BR-I10, BR-I13, BR-I14, BR-B03, BR-P13, BR-F10, BR-F16, BR-D04, BR-T01 y BR-T04.

---

## 12.i Premios configurables por rifa (BR-J)

Mantenimiento posterior a la Fase 9 (2026-09-15, D-199 y D-200, migración `0058`). Cada rifa define
**sus** premios: qué se gana, con qué número de la boleta, con cuántas cifras, qué días y con qué
lotería. Hasta aquí el único comparador era el fijo de BR-L06, que no se toca.

**La letra es `J`** de «**j**uega»: cada premio juega con un número y una lotería. `P`, `R` y `K` ya
nombran precios, rifas y catálogo.

> **EN PRODUCCIÓN desde el 2026-09-17: el contrato, el panel, el motor, la transición y la rifa real
> convertida.** Existen el
> modelo, las reglas, la autorización, la auditoría y los avisos (Entrega 1), el panel y el proceso de
> tres pasos (Entrega 2), **el motor de coincidencias** (Entrega 3, D-203) y **la transición de una
> rifa que ya existía** (Entrega 4, D-204): una operación interna la pasa a premios configurables con
> los seis premios confirmados. La **Entrega 5** promovió `0058`–`0066`, desplegó `da81663` y convirtió la
> rifa real «SORTEO CAMIONETA KIA 2027» el 2026-09-17 (`RUNBOOK` §8). La columna **Estado** dice qué entrega
> construye cada regla.

| ID | Regla | Capas | Estado |
|----|-------|-------|--------|
| BR-J01 | Un premio es una **identidad estable** con **versiones inmutables**: cada guardado inserta una versión nueva y ninguna anterior se reescribe. **Nada se borra**: un premio se archiva, y archivar y restaurar también son versiones. | S, D | ✅ Entrega 1 |
| BR-J02 | Una versión define **título**, **categoría**, **recompensa**, **cuál de los dos números de la boleta juega**, **cuántas cifras**, su **calendario**, su **lotería** y sus **aclaraciones**. La **recompensa** son una o varias **alternativas** con **posición estable**: cada una lleva un componente **en especie**, un **importe en pesos**, o **los dos**, y al menos uno. El **modo es explícito** y no se deduce contando: **«Premio único»** lleva exactamente una alternativa y **«Alternativas a elegir»**, dos o más, excluyentes entre sí. La aplicación **no registra cuál alternativa se llevó quien acertó**. | C, S, D | ✅ Entrega 1 · corregida en D-201 |
| BR-J03 | **La categoría es informativa.** Sirve para presentar y para plantillas; **nunca** decide el número, las cifras, el calendario ni la lotería. «Premio semanal, un lunes, cuatro cifras, con Cundinamarca» es válido. **Es un ejemplo genérico** de que el sistema admite excepciones, **no un premio de la rifa real**, que tiene seis y ninguno así (D-204). | C, S, D | ✅ Entrega 1 · precisada en D-204 |
| BR-J04 | El calendario son **períodos canónicos**: fecha inicial, fecha final y un conjunto de **días ISO 1..6**, ordenado y sin repetir. **El domingo no se programa** mientras no haya lotería ese día. Cada día elegido tiene que **caer al menos una vez** dentro del período, **dos períodos del mismo premio no pueden compartir un día** y todos quedan **dentro de las fechas de la rifa**. Máximo **10 períodos** por premio. | C, S, D | ✅ Entrega 1 |
| BR-J05 | La lotería es **la correspondiente de cada día** (lunes Cundinamarca … sábado Boyacá, BR-L01) o una **fija**, que solo puede publicarse en **su** día nominal. Como la fecha de referencia **es** ese día (D-143), en una fecha válida las dos dan la misma lotería. Un sorteo **futuro** que la programación oficial da por **cancelado** se rechaza: no va a tener resultado. | C, S, D | ✅ Entrega 1 |
| BR-J06 | **Cuatro cifras por defecto.** `four` es igualdad textual exacta con el número mayor; `last_three` compara las **tres últimas** y exige un número de al menos **tres caracteres**. `0046` ≠ `46`; `046` y `1046` sí participan en las tres últimas. Nunca se castea, ni se rellena con ceros, ni se recorta (BR-N03, BR-L06). El motor compara el número de la boleta **que dice la versión aplicable**, en la fecha y con la lotería **del resultado**. | C, S, D | ✅ Entrega 1 (regla) · ✅ Entrega 3 (motor, D-203) |
| BR-J07 | **Las cuatro cifras mandan sobre las tres, POR CLIENTE.** Si un cliente tiene **al menos una** coincidencia elegible de cuatro cifras en un resultado, pierde **todas** sus coincidencias de tres cifras en ese resultado —las de sus otras boletas y las del otro número de la misma boleta—; otro cliente que solo coincide en las tres últimas **conserva** su premio. El cliente es el **fotografiado** por el motor (BR-L09); una boleta **sin cliente** en la fotografía es su propia unidad, y la prioridad **no cruza rifas**. Una coincidencia descartada **no se fotografía**. Varias de cuatro cifras con **números distintos** de la boleta conviven. El **valor económico no decide nada**. Por eso un premio de cuatro cifras y otro de tres **conviven a propósito** el mismo día: son especificidades distintas y BR-J08 no los considera un conflicto. Dos premios de la **misma** especificidad **no pueden coincidir** (BR-J08), y si aun así aparecen, el motor **falla sin escribir nada** en vez de elegir. | S, D | ✅ Entrega 1 (regla) · ✅ Entrega 3 (motor) · **por cliente desde D-203**, respuesta del dueño (antes, por boleta) |
| BR-J08 | **Los premios no se acumulan.** Dos premios **vigentes** que, para una **misma fecha**, juegan con el **mismo número de la boleta**, las **mismas cifras** y la **misma lotería efectiva** son un **conflicto de configuración**: no se puede publicar ni activar esa rifa, y el mensaje nombra **los dos premios y el día**. La **recompensa no entra** en la comparación y el **nombre tampoco**; el cruce se corrige con las **fechas**. **Cuatro cifras y últimas tres sí conviven** (BR-J07), y dos premios con **números distintos** de la boleta tampoco chocan. | S, D | ✅ Entrega 1 · corregida en D-201 |
| BR-J09 | **Una rifa en borrador se edita libremente.** En una **activa**, una versión nueva solo afecta a lo que todavía no se jugó: aplica **la última versión publicada estrictamente antes del corte**. El corte es **la más temprana entre la hora original anunciada y la hora oficial** del sorteo: en un sorteo normal coinciden; uno **aplazado** conserva la hora original; uno **adelantado** corta a la hora oficial, así que una versión publicada después de que el sorteo debía jugarse **nunca** le aplica. Una versión publicada **exactamente** en el corte no aplica. Si falta cualquiera de las dos horas, **no se supone nada**. La versión de una ocurrencia bloqueada **no se reescribe jamás**. Si el corte de una ocurrencia de una semana **ya empezada** no se conoce, la publicación **se rechaza** en vez de suponer. Una rifa **cerrada o anulada no se edita**, y una **activa** conserva al menos un premio vigente. | C, S, D | ✅ Entrega 1 · corte efectivo el 2026-09-16 (D-203, Decisión 9, `0062`, I-125) |
| BR-J10 | Configurar premios exige la capacidad **`raffles.prizes.manage`**: el **Dueño** activo siempre la tiene, el **Administrador** activo la recibe por la política inicial y el **Vendedor nunca**. Se comprueba en la aplicación **y** en PostgreSQL, con la organización y el actor **de la sesión**. Las tres tablas **no admiten escritura directa**: las seis RPC son la única puerta. | C, S, D | ✅ Entrega 1 |
| BR-J11 | En una rifa **activa**, un cambio **material** —recompensa, número, cifras, fechas o lotería efectivas, estado o aclaraciones— escribe **un aviso por membresía activa** de la organización, menos a quien lo hizo. Esa exclusión es **de esta regla**: el aviso de las fechas de la rifa sí llega a quien las cambia (BR-R12). El **nombre y la categoría no son materiales**, un borrador **no avisa** y **reordenar tampoco**. El aviso es **idempotente**, identifica la rifa y el premio, **no lleva clientes, pagos, saldos ni precios de venta** y **no enlaza a ninguna pantalla** mientras el vendedor no tenga una. | S, D | ✅ Entrega 1 |
| BR-J12 | **Una acción semántica de bitácora por guardado** (`raffle_prize.create`, `.publish`, `.archive`, `.restore`, `.reorder`), con rifa, premio, versión anterior y nueva y un resumen seguro. El **historial funcional sale de las versiones**, no de `audit_logs`, se lee paginado y **solo con la capacidad**; un actor nulo se presenta como **«Sistema»**. | S, D | ✅ Entrega 1 |
| BR-J13 | **La transición es por rifa.** Una rifa **nueva** nace `configurable` y **en borrador**, y solo puede crearla así quien tiene la capacidad `raffles.prizes.manage` (D-202). **Ninguna sesión puede cambiar el modo de una rifa.** Una rifa que **ya existía** —en borrador o activa— pasa a `configurable` **solo** por la operación interna `transition_raffle_prize_mode`, que ejecuta la service role: elegida por su identificador y comprobados su organización, su nombre, su estado y sus fechas; **entera o nada** —premios, versiones, períodos, alternativas, modo, aviso y bitácora en una transacción—; **sin cambiar su estado ni sus fechas**; con las mismas validaciones que el panel (BR-J02, BR-J04, BR-J05, BR-J08); **sin incluir ningún sorteo cuyo corte ya pasó** (BR-J09); y **no mientras quede en su ventana —activa o en borrador— un sorteo de una semana ya empezada cuyo corte no se conoce**. **La frontera es el instante efectivo** de la transición —la publicación de su última versión inicial— con el corte de BR-J09: un sorteo con corte **hasta** ese instante **conserva el sistema de siempre** para esa rifa, también si su resultado se confirma después, y **nunca lleva enlaces**; uno con corte **posterior** usa **solo** los premios configurables. Por eso un sorteo jugado **sin resultado confirmado ya no detiene la transición** (D-206). No toca boletas, clientes, pagos ni coincidencias, y no reprocesa nada. Repetirla con la misma configuración no escribe nada; con otra, se rechaza. Deja **un** aviso por membresía activa si la rifa está activa (BR-J11) y **una** fila semántica de bitácora del «Sistema» (BR-J12). Activar una rifa configurable exige configuración válida **comprobada en PostgreSQL** —al menos un premio vigente y sin conflictos—, y **acortar las fechas** de una rifa no puede dejar el calendario de un premio fuera. | C, S, D | ✅ Entrega 1 · ampliada en Entrega 2 · ✅ **Entrega 4: transiciones controladas** (D-204, `0063`) · ✅ **instante efectivo** (D-206, `0064`); la rifa real, en la Entrega 5 |
| BR-J16 | **Una rifa se crea en tres pasos**: sus datos, sus premios y una revisión que la activa. El primer paso la deja en **borrador**, así que se puede salir y seguir después. La revisión **dice qué falta** —sin premios, con fechas fuera de la rifa o con un conflicto— y **no ofrece activar** hasta que no falte nada; activar es una acción explícita con confirmación, y **guardar el último premio no activa nada**. **La revisión es el único camino visible para activar un borrador configurable**: su detalle ofrece «Revisar y activar» en lugar de «Activar rifa», y una rifa heredada conserva la activación de siempre. | C, S, D | ✅ Entrega 2 (D-202) · corregida el 2026-09-16 |
| BR-J14 | Los **miembros activos** de la organización **leen** los premios de sus rifas, como leen las rifas. Los límites son explícitos y los mismos en la aplicación y en la base: título 2–80, **descripción de una alternativa** 2–160, aclaraciones ≤ 1.000, **importe de una alternativa** 1–10.000.000.000, **6 alternativas** por premio, 10 períodos por premio y 50 premios vigentes por rifa. | C, S, D | ✅ Entrega 1 · ampliada en D-201 |
| BR-J15 | Un premio dice **desde cuándo y hasta cuándo aplica**: el **primer y el último día en que juega de verdad**, no lo escrito en sus períodos —«los sábados del 1 al 31 de diciembre» empieza el 5—. **Varios períodos separados siguen siendo válidos** y el calendario detallado se conserva entero. Es lo que permite evitar un cruce (BR-J08) moviendo fechas en vez de adivinar. | C, S, D | ✅ Entrega 1 (D-201) |

**Lo que la Entrega 1 NO hacía, dicho para que no se lea de más:** no buscaba coincidencias con estos
premios, no reprocesaba resultados, no reconstruía premios históricos a partir del comparador fijo, no
cambiaba ni una fila de `lottery_ticket_matches` y no activaba el motor configurable en ninguna rifa.

**Lo que la Entrega 3 SÍ hace, y lo que sigue sin hacer (D-203):** busca las coincidencias de las
rifas **configurables** al confirmar un resultado y guarda cada una con su premio y la **versión**
aplicada al corte del sorteo (BR-J09). **No** reprocesa resultados anteriores, **no** enlaza
fotografías viejas, **no** recalcula nada si después cambia un premio, **no** cambia el modo de
ninguna rifa y **no** registra qué alternativa se eligió ni ningún pago o entrega de premios.

**Corregida el mismo día, antes de la Entrega 4 (D-203, Decisiones 9 y 10, migración `0062`):** el
corte de BR-J09 deja de ser solo la hora original y pasa a ser `least(original, oficial)`, con **una
sola definición** (`raffle_prize_draw_cutoff`) que usan el motor, la defensa de los enlaces y la
validación de publicaciones (I-125). Y los avisos de un resultado dicen que una boleta **coincide con
este resultado**, nunca «con este número»: puede coincidir solo en las tres últimas cifras (I-126).
Ninguna rifa cambió de modo y nada se reprocesó.

**Lo que la Entrega 4 SÍ hace, y lo que sigue sin hacer (D-204, migración `0063`):** construye y
prueba la transición de una rifa existente (BR-J13) y deja escrita, una sola vez, la configuración de
los **seis** premios confirmados —diario hasta el 27 de noviembre, fin de semana hasta el 28, principal
con cuatro alternativas y tres cifras el 21 de diciembre, el millón semanal del 1 al 5 y del 16 al 19
de diciembre, y los siete millones del 15—. El diario y el de los sábados empiezan en el **primer sorteo
pendiente el día de la transición** (respuesta del dueño). **No** convierte la rifa real, **no** toca
el proyecto real y **no** reprocesa nada: eso es la Entrega 5.

**Corregida antes de llevarla a producción (D-206, migración `0064`):** el preflight encontró 25 sorteos
de la rifa real jugados sin resultado confirmado (I-127), y el dueño no aceptó ni dejarlos sin
coincidencias para siempre ni cargar resultados sin evidencia. **Sustituye esa alternativa la
compatibilidad temporal con el motor de siempre**: cada transición guarda su **instante efectivo**, y
el motor decide, rifa por rifa y sorteo por sorteo, con una sola frontera —corte `<=` instante, el
sistema de siempre; corte `>` instante, los premios—. Una rifa configurable creada directamente y una
heredada que no se transforma se comportan **exactamente igual que antes**. Nada se reprocesa ni se
confirma.

---

### Historial de premios ganados (BR-J17..BR-J23)

Mantenimiento posterior a la Fase 9 (2026-09-17, **D-208**, migración `0067`, **solo en local**). El
vendedor ve los premios que ganaron sus clientes; el Dueño y el Administrador, los de su organización
**sin un solo dato de cliente**. Se extiende `BR-J` porque es el mismo dominio —los premios de una
rifa—, no una letra nueva.

> **En local desde el 2026-09-17, con su corrección del mismo día** (migración `0068`). Existen la
> tabla, las cuatro lecturas, el cargador, el cerrojo de los números y la defensa de la fotografía.
> **Desde la Etapa 2 (ese mismo día, migración `0069`) existen también las pantallas**: `/seller/prizes`,
> `/owner/prizes` y los resúmenes de las fichas del cliente y del vendedor (D-208, «Etapa 2»). El
> proyecto real **no tiene ni la `0067`, ni la `0068`, ni la `0069`**, ni el código de las pantallas.

| ID | Regla | Capas | Estado |
|----|-------|-------|--------|
| BR-J17 | **Un premio ganado es una coincidencia `sold` con su premio.** Entra en el historial cuando el resultado está `confirmed`, la fotografía de `lottery_ticket_matches` es `sold` —que ya implica cliente y `assigned_at <= official_scheduled_at`, BR-L09 y BR-L10— y existe **o** su enlace del motor con la **versión histórica** aplicada (BR-J09) **o** un reconocimiento vigente del negocio (BR-J19). Quedan fuera las boletas libres y las de asignación tardía, y las coincidencias que la prioridad de cuatro cifras descartó, que **no se fotografían** (D-203). **El pago no interviene**: una boleta sin pagar o a medias gana igual, y no se añade paz y salvo ni confirmación humana (respuesta H3 del dueño). El historial **no recalcula** nada: lee lo que el motor ya escribió. | C, S, D | ✅ Etapa 1 (local) |
| BR-J18 | **Un resultado que entra en conflicto después NO borra historia.** La pertenencia la deciden la fotografía y su enlace, que son inmutables (BR-L11), nunca el estado actual del resultado: el registro se queda, los totales no se mueven y la fila queda **marcada** para que se verifique. Lo mismo con un número de boleta que ya no coincida con el fotografiado: se **marca**, no se esconde. | C, S, D | ✅ Etapa 1 (local) |
| BR-J19 | **Un premio que el motor no puede producir lo reconoce el NEGOCIO, en una tabla aparte.** `declared_prize_awards` cuelga de una fotografía que ya existe y solo se admite donde el motor **nunca** podrá escribir un enlace: una fotografía `sold` de un sorteo que, para su rifa, se resuelve con el sistema de siempre (`raffle_prize_draw_mode` = `legacy`, D-206). Así el doble conteo es imposible por construcción. Guarda el **título declarado** —renombrar el premio no reescribe la historia—, el importe, su **respaldo de negocio** con el **rol** que lo confirmó, y el **actor técnico** de la carga, que es otra cosa y puede ser un proceso del sistema. **No lleva versión de premio**: a esos sorteos no les aplicó ninguna, y apuntar a una sería falso. Es **inmutable** salvo su anulación con motivo, y no se borra. **Solo puede haber uno VIGENTE** por coincidencia y premio —la unicidad es parcial, `where voided_at is null`—, así que anular y volver a registrar **sí es posible** y la historia de anulaciones y sustituciones se conserva entera. La única puerta es `record_declared_prize_awards`, de la **service role**: vista previa por omisión, **entera o nada**, **idempotente** y **serializada** por organización. **Su informe corresponde a lo ALMACENADO**, no a la petición: un reintento idéntico dice «ya estaba», y una petición incompatible con lo vigente —otro importe u otra recompensa— **se rechaza nombrando las dos cifras** y no escribe nada. Rechaza también un **duplicado dentro de la misma petición**, y su vista previa anticipa lo que la aplicación comprobará: el **modo** del sorteo, los **límites** del importe, la **ambigüedad** al resolver el premio por su título —solo cuentan los **vigentes**— y el **suelo** del historial. | S, D | ✅ Etapa 1 (local) |
| BR-J20 | **Los indicadores son cuatro, y ninguno se inventa**: cantidad de premios, cantidad de **clientes distintos** con premio, **total conocido del componente en dinero** y **cantidad de premios cuyo valor completo está pendiente**. Quien gana tres premios es **un** cliente y **tres** premios. Un importe es cierto solo con recompensa de **«Premio único»** y dinero en su única alternativa; con **«Alternativas a elegir»** no se suman, no se elige una y no se toma la de efectivo; un componente **en especie no se valora en cero** y deja el valor pendiente. Todo se calcula en **PostgreSQL**, en **pesos enteros**, sobre **todo el ámbito o filtro** y no sobre la página, y las alternativas **no multiplican filas ni importes**. | C, S, D | ✅ Etapa 1 (local) |
| BR-J21 | **Cada vendedor ve solo lo suyo, exige su ROL y tener equipo no concede nada más**: el alcance es `current_seller_org_ids()` —vendedor **activo**— más `seller_id = current_profile_id()`, en las lecturas **y** en las políticas de las dos tablas. Quien vendía y pasa a Dueño o Administrador **deja de leer** por esas vías las coincidencias que dejó atrás, aunque conserven su identificador, y pasa a ver lo que le corresponde por las proyecciones del personal (I-137). El **Dueño y el Administrador** ven el historial de su organización y el de cada vendedor —también de uno **inactivo**—, por una proyección `admin_*` de **lista blanca** cuyo tipo de retorno **no declara** nombre, identificador ni ningún otro dato de cliente (BR-Q01, BR-Q02); el recuento de clientes distintos se calcula **dentro** de la base y solo sale el número. El historial **no abre** cartera, pagos, saldos, precios de venta ni comisiones, y **conserva** rifas cerradas, clientes archivados y cuentas inactivas. Ninguna lectura recibe organización, vendedor ni actor: salen de la sesión. **Precisada en la Etapa 3 (`0070`):** el personal puede **elegir** en su pantalla a quien aparece como vendedor en el historial aunque hoy tenga otro rol —«Nombre (ya no vende)»—, por una lectura que solo devuelve su perfil y su nombre; no gana ninguna ficha ni ningún acceso nuevo, y el portal del vendedor le sigue cerrado. | C, S, D | ✅ Etapa 1 (local) |
| BR-J22 | **La cobertura se dice, no se rellena.** El período empieza en el **inicio operativo de la plataforma en producción**, verificado: **2026-08-09**. Un tramo **sin resultados confirmados** —del 09/08 al 24/08/2026— es **pendiente de información**, nunca «cero premios», y su incorporación futura necesita autorización y evidencia propias (respuesta H2). **No se asignan al pasado los importes de hoy** (BR-J09), no se cargan resultados de loterías sin la evidencia que exige BR-L26, y una reconstrucción **no se presenta** como dato histórico comprobado (I-080). **Solo cuenta como pendiente un sorteo que PUDO dar un premio** (`0069`, I-138): ya jugado, de una rifa `active` o `closed` —las que mira el motor— y ni `cancelled` ni `suspended`. La cuenta es de la **organización**, no del filtro de la pantalla, y la pantalla lo dice; dice también **entre** qué fechas caen los pendientes, nunca que llenen el tramo. **Precisada en la Etapa 3:** un sorteo cuyo resultado entró en **conflicto** —también después de confirmarse— sigue contando, así que el aviso habla de sorteos «con el resultado sin confirmar o por verificar» y de que **puede haber premios que no aparecen**, nunca de que «no se sabe si hubo premios»: ese sorteo puede tener ya un premio en la lista, conservado y marcado (BR-J18). Tampoco promete que confirmar un sorteo complete lo demás: uno del sistema de siempre necesita que el negocio reconozca su premio (I-142). La aclaración del alcance acompaña a **cualquier** filtro —rifa, fechas, vendedor o cliente—. | C, S, D | ✅ Etapa 1 (local) · ✅ Etapa 2 (local): precisada y en pantalla |
| BR-J23 | **Lo que muestra el historial está respaldado, y se sabe por qué.** La **fotografía** respalda organización, rifa, vendedor, cliente, **el campo que participó** y **el número fotografiado**; la **versión aplicada** respalda —**solo en el origen del motor**— título, categoría, cifras y recompensa con sus alternativas; la **declaración** respalda —solo en el origen reconocido— su título y su recompensa, y **no** categoría ni cifras, que van en **NULL** porque a ese sorteo no le aplicó ninguna versión y las de hoy no son las de entonces. La boleta y el cliente de **hoy** solo aportan los dos números actuales y el nombre, que **no** se presentan como históricos, y `numbers_changed` avisa cuando el número fotografiado ya no es el de la boleta **en su campo**. Las **alternativas** viajan agregadas y **no multiplican filas ni importes**. **El inicio operativo lo garantiza la base** —`prize_award_history_start()` es el suelo de la lectura, así que un filtro que pida más atrás no saca ni una fila— y la **cobertura pendiente** la calcula `prize_award_coverage()` con el alcance de la sesión, sin depender de ningún parámetro del navegador. | C, S, D | ✅ Etapa 1 corregida (local) |

**Lo que el historial NO hace, dicho para que no se lea de más:** no construye otro motor, no recalcula
ganadores desde las boletas de hoy, no reprocesa resultados, no cambia el modo de ninguna rifa, no
registra qué alternativa se llevó quien acertó —eso sigue fuera (BR-J02)— y no registra entregas,
desembolsos ni pagos de premios. **Son premios ganados.**

**Nota sobre BR-L15.** El historial habla de **premios**, que es lo que una rifa entrega a quien acierta
(D-199), y sigue sin llamar «ganador», «ganadora» ni «premiada» a una persona o a una boleta: el
**resultado** y la **coincidencia** son de la lotería, el **premio** es de la rifa, y una prueba unitaria
falla si esas palabras aparecen. BR-L15 no se relaja.

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
