# REGLAS DE NEGOCIO

- **Versión:** 1.3 · **Estado:** normativo · **Actualizado:** 2026-08-10
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
| BR-O05 | La moneda del MVP es COP; el precio predeterminado de la organización es `100000`. | D | 2 |

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

**Por qué la excepción de BR-E05 es tan estrecha.** Abrir la RLS es la parte irreversible de esta
funcionalidad: una vez que un rol ve una fila, cualquier pantalla —incluidas las que nadie ha escrito
todavía— puede enseñarla. Por eso ninguna política de `tickets`, `clients` o `payments` cambió: las
ventas del equipo se leen por dos funciones que solo saben responder por el equipo de quien llama
(D-092). Un vendedor padre puede responder «cuánto vendió Pedro», no «a quién se lo vendió» ni «cuánto
dinero recogió», y su propio «Mis boletas» sigue siendo exactamente el suyo.

---

## 3.c Comisiones del vendedor (BR-G)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-G01 | La comisión se gana **por boleta pagada por completo** (`payment_status = 'paid'`), no por boleta vendida. Así la empresa nunca debe comisión por dinero que no entró. | D | post-9 |
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

**Nota sobre BR-G07 — reasignar una boleta vendida es imposible, no solo prohibido.**
`tickets_client_seller_fk` es una FK compuesta `(client_id, seller_id) → clients (id, seller_id)` y
**no es diferible**. Una boleta vendida siempre tiene cliente, y el cliente pertenece a su vendedor
(BR-C05): mover la boleta rompe la FK, mover el cliente primero rompe la de todas sus boletas, y no
hay transacción que lo salve. Comprobado con la *service role*, que se salta la RLS y las funciones de
negocio. El motor conserva su rama de cambio de vendedor porque cubre las boletas **sin vender**
(BR-B04) y deja el camino listo si algún día el negocio permite trasladar una cartera completa.

**Todavía no existe comisión del vendedor padre sobre las ventas de su equipo.** Es una regla
comercial que el dueño aún no ha definido. La arquitectura queda preparada —el ledger tiene tipo de
movimiento y el estado es por vendedor—, pero no se implementa nada de eso.

---

## 4. Rifas (BR-R)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-R01 | Una organización puede tener varias rifas. | D | 2 |
| BR-R02 | Estados válidos: `draft`, `active`, `closed`, `cancelled`. | D | 2 |
| BR-R03 | Transiciones permitidas: `draft → active`, `active → closed`, cualquiera → `cancelled`. `closed → active` solo por el Owner y queda auditado. | S, D | 3 |
| BR-R04 | Una rifa nueva usa `100000` como precio predeterminado. | C, S, D | 3 |
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

| BR-N12 | **Las boletas se pueden importar desde un archivo CSV o JSON.** La rifa y el vendedor los pone la pantalla. Cada fila lleva los dos números y puede añadir cliente, pero en ese caso **nombre y celular son obligatorios juntos**. Siempre hay vista previa y confirmación antes de guardar. | C, S, D | post-9 |

**BR-N12 en detalle** (migraciones `0019` y `0021`; D-081 y D-087). La importación **no añade ni relaja ninguna regla
de boletas**: valida con `validateBulkRows` —el mismo motor que la carga manual— y guarda por los
mismos caminos, así que BR-N01 a BR-N10 se aplican íntegras.

| Aspecto | Regla |
|---|---|
| Formatos | CSV (recomendado) y JSON (avanzado). Hasta **1.000** boletas por archivo, y hasta 1 MB |
| Columnas del CSV | Obligatorias: «Premio semanal» y «Premio diario». Administrativamente se pueden añadir «Cliente» y «Celular»; se reconocen sus alias en español e inglés sin distinguir mayúsculas, acentos ni guiones bajos |
| Columnas de más | Se ignoran, incluida la numeración `#` |
| Sin reconocer | **No se rechaza el archivo**: se pide elegir a mano qué columna es cada número |
| Claves del JSON | Números: `daily_number` / `weekly_number`, `premio_diario` / `premio_semanal` o camelCase. Cliente: `client_name` / `client_phone`, `nombre_cliente` / `celular` o camelCase |
| Cliente opcional por fila | Si aparece cliente, **nombre y celular son obligatorios juntos** (BR-C02). Una fila puede omitir ambos y quedar sin asignar; los archivos antiguos de dos columnas conservan el mismo resultado |
| Quién puede importar con cliente | Owner/Admin. Un Seller conserva el flujo anterior: sus boletas nacen `pending_approval` y sin cliente; una fila con cliente se bloquea para no saltarse BR-I03/BR-I09 |
| Identidad | Solo dentro de la cartera del vendedor seleccionado. Nombre normalizado + celular nacional normalizado agrupan filas; una coincidencia activa, exacta y única reutiliza el cliente. Cliente archivado, coincidencias múltiples o el mismo celular con otro nombre son conflicto visible; nunca se adivina ni se cruza cartera u organización |
| Números | **Texto siempre.** Ni `Number()`, ni `parseInt()`, ni relleno con ceros: «46» se guarda «46» y «0046» se guarda «0046» (BR-N03) |
| Qué se rechaza | Solo el archivo ilegible: vacío, sin dos columnas, JSON roto o sin ningún campo reconocible. Un problema de **fila** se muestra en la vista previa junto a las filas que sí sirven |
| Estado de las boletas | Sin cliente: `available` si las crea el personal, `pending_approval` si las crea un vendedor. Con cliente y desde Owner/Admin: `assigned`, con precio/fecha/auditoría aplicados por `assign_ticket_row` |
| Vista previa | Obligatoria. Elegir el archivo **no escribe nada** |
| Importación parcial | Permitida y **nunca silenciosa**: se dice cuántas quedan fuera antes de confirmar, y cuáles después |
| Atomicidad con clientes | Crear clientes, crear las boletas que no chocan y asignarlas ocurre en una sola RPC. Una ambigüedad o error de identidad revierte clientes, boletas y contador; una combinación ya tomada se informa como conflicto normal |
| Auditoría | Una fila `ticket.import` en `audit_logs` con quién, cuándo, rifa, vendedor, tipo de archivo y recuentos. **No se guarda el archivo** |

**BR-N11 en detalle** (migración `0018`, D-080). Es la regla que gobierna búsqueda y presentación:

| Aspecto | Regla |
|---|---|
| Dónde se busca | `daily_number` y `weekly_number`. **Nunca** `internal_code` |
| Cómo se compara | Como **texto** y por **coincidencia parcial**: «123» encuentra `1234`, `0123` y `1237`; «00» encuentra `0017` |
| Qué término se acepta | De 1 a 4 dígitos (BR-N02). Cualquier otra cosa —letras, un código interno, 5 cifras— devuelve **cero resultados** y la pantalla explica por qué |
| Orden de los resultados | Diario exacto → diario empieza → diario contiene → semanal exacto → semanal empieza → semanal contiene. Dentro del mismo escalón, por número ascendente |
| Dónde se muestra el código | Solo en el detalle de la boleta, bajo «Información administrativa» |
| Qué NO cambia | El código interno sigue siendo el identificador administrativo, se sigue generando, se sigue guardando y se sigue indexando. Las claves primarias y las relaciones no se tocan |

BR-N03 (los ceros iniciales se conservan) manda también aquí: el término **no** se convierte a entero
en ninguna capa, porque `parseInt('0017')` perdería justo lo que distingue una boleta de otra.

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
| BR-P01 | El precio predeterminado de una boleta es `100000` COP. | D | 2 |
| BR-P02 | Todo valor monetario se almacena y opera como entero de pesos. Prohibido punto flotante. | C, S, D | 2 |
| BR-P03 | Al asignar o vender una boleta se copia el precio vigente de la rifa a `sale_price`. | S, D | 4 |
| BR-P04 | `sale_price` no cambia si después se modifica el precio de la rifa. | D | 2 |
| BR-P05 | `sale_price` es inmutable cuando la boleta tiene pagos activos, salvo procedimiento administrativo documentado (anular pagos → corregir → volver a registrar). | S, D | 2 |
| BR-P06 | Los saldos y estados se calculan usando `sale_price`, nunca el precio actual de la rifa. | D | 2 |

---

## 9. Pagos, abonos y saldos (BR-F)

| ID | Regla | Capas | Fase |
|----|-------|-------|------|
| BR-F01 | No existe pasarela de pagos; el registro es manual. | — | 5 |
| BR-F02 | Un pago pertenece a un cliente y se reparte entre una o varias boletas **de ese mismo cliente**. | S, D | 5 |
| BR-F03 | `payments.total_amount > 0`; `payment_allocations.amount > 0`. No se permiten montos cero ni negativos. | C, S, D | 2 |
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
| BR-F14 | Toda creación y anulación de pago queda registrada en auditoría. | D | 5 |
| BR-F15 | Un pago anulado no puede "desanularse"; se registra un pago nuevo si corresponde. (D-013) | S, D | 5 |

### Estados de pago (calculados, nunca seleccionados)

| Condición | Estado | Etiqueta |
|-----------|--------|----------|
| `paid_amount = 0` | `unpaid` | Sin pagar |
| `0 < paid_amount < sale_price` | `partial` | Abonada |
| `paid_amount = sale_price` | `paid` | Pagada |
| `paid_amount > sale_price` | — | **Imposible**: la operación se bloquea |

Para una boleta de `$100.000`: `$0` → Sin pagar; `$1`–`$99.999` → Abonada; `$100.000` → Pagada;
más de `$100.000` → operación rechazada.

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

## 13. Casos extremos y su resolución

| # | Situación | Resolución |
|---|-----------|------------|
| X1 | El vendedor no tiene boletas y la rifa permite crearlas | Se muestra una acción clara para crear boletas |
| X2 | El vendedor no tiene boletas y la rifa **no** permite crearlas | Se explica que el administrador debe asignarlas; la acción se oculta o deshabilita |
| X3 | Abono exactamente igual al saldo pendiente | Válido; la boleta pasa a Pagada |
| X4 | Abono de $1 sobre una boleta de $100.000 | Válido; la boleta pasa a Abonada |
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
