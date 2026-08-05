# REGLAS DE NEGOCIO

- **Versión:** 1.0 · **Fase:** 0 · **Actualizado:** 2026-08-02
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
| BR-U07 | Un vendedor nunca accede a información de otro vendedor por UI, URL, ID manipulado, request directo, API o cliente Supabase. | S, D | 2 |
| BR-U08 | El campo teléfono es obligatorio para todo usuario; el alias es opcional. | C, S, D | 3 |
| BR-U09 | Una organización tiene **siempre** un Owner activo: nadie, ni el propio Owner, puede dejarla sin propietario. | D | **9** |

**BR-U09 nació de un hueco real (A-02, I-025).** El índice `memberships_one_owner_per_org` garantiza
«como máximo un Owner», nunca «al menos uno», así que hasta la Fase 9 un Owner podía degradarse o
desactivarse a sí mismo con una llamada directa a PostgREST y dejar la organización **sin
propietario y sin forma de repararlo desde la aplicación** — el ex-Owner deja de ser staff y un Admin
no puede ascender a nadie a Owner (BR-U03). Lo cierra el trigger diferido de la migración `0016`
(D-071). Es **diferido** para que transferir la propiedad en una sola transacción siga siendo posible.

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
