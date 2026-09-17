# MASTER SPEC — Sistema de Gestión de Rifas

> Especificación funcional consolidada. `AGENTS.md` y `CLAUDE.md` son instrucciones de agente, no
> especificaciones paralelas. En caso de conflicto se aplica la jerarquía de D-086 y se investiga la
> diferencia antes de cambiar comportamiento.

- **Versión del documento:** 1.12
- **Fase que lo produce:** Fase 0 — Arquitectura y planificación
- **Última actualización:** 2026-09-17 (§9.7: **premios configurables EN PRODUCCIÓN** —`0058`–`0066`
  aplicadas, `da81663` desplegado y la rifa real «SORTEO CAMIONETA KIA 2027» convertida, con sus seis
  premios, hasta el 21/12/2026—). Antes, el 2026-09-16 (§9.7, correcciones de D-206 antes de producción: los sorteos
  ya jugados conservan el sistema de siempre y cambiar las fechas de una rifa activa avisa —`0064`—, **a
  todas las personas activas, también a quien las cambia**, y la rifa real la extiende **el Dueño con su
  sesión** —`0065`—, **solo en local**). Antes, ese mismo día (§9.7, corrección de la Entrega 3: un sorteo **adelantado**
  corta a su hora oficial, así que un cambio publicado después de jugarse nunca le aplica —D-203
  Decisión 9, migración `0062`, **solo en local**—). Antes, ese mismo día (§9.7: premios
  configurables por rifa, **Entrega 3 de 5** —el
  motor de coincidencias, D-203, migración `0061`, **solo en local**—, con la regla del dueño: quien
  acierta las cuatro cifras no recibe además un premio de tres cifras en el mismo sorteo). Antes, el
  2026-09-15 (§9.7: premios configurables por rifa, Entrega 1 de 5 —el
  contrato, D-199, D-200 y **D-201**, migraciones `0058` y `0059`, **solo en local**—; y §9.5, corregida: las siete etapas
  del cobro están **en producción** desde el 2026-09-12). Antes, el 2026-09-14 (§7 F5, F7, F8 y F9, §8 reglas 14 y 17 y §9.1: la cartera es
  del vendedor —D-198, migración `0057`, **en producción desde el 2026-09-15**—). Antes, el 2026-09-13 (§9.6: el mensaje propio de «Resultados de la semana», con la
  migración `0056`, aplicada al proyecto real y desplegado ese mismo día en `6dd23e5`; antes, ese
  mismo día, «Resultados de la semana» del vendedor, ya
  desplegada y sin migraciones). Anterior: 2026-09-12 (§9.5: cuentas para recibir pagos y recordatorios de pago,
  **etapas 0 a 5 hechas de 7**; el canal está completo de punta a punta en local. Quedan la
  auditoría integrada y la promoción a producción)

---

## 1. Propósito

Automatizar la operación de una empresa que hoy administra manualmente rifas, vendedores, clientes,
boletas, abonos y pagos. El sistema debe reemplazar el control en papel/hojas de cálculo por una
aplicación web multiorganización, con aislamiento estricto por vendedor y trazabilidad completa del
dinero.

### 1.1 Objetivos medibles del MVP

| # | Objetivo | Criterio de éxito |
|---|----------|-------------------|
| O1 | Registro confiable de boletas | Ninguna combinación diario+semanal duplicada dentro de una rifa |
| O2 | Trazabilidad del dinero | Todo abono queda registrado, es auditable y nunca se elimina físicamente |
| O3 | Aislamiento entre vendedores | Un vendedor no puede leer ni escribir datos de otro, ni siquiera manipulando IDs |
| O4 | Saldos correctos | El saldo de cada boleta y cliente se calcula desde pagos no anulados, nunca a mano |
| O5 | Operación desde móvil | El vendedor completa asignación y registro de abono desde un teléfono |
| O6 | Carga masiva | Owner/Admin genera y completa hasta 1.000 boletas sin congelar el navegador |

---

## 2. Glosario

| Término | Definición |
|---------|------------|
| **Organización** | Empresa que administra rifas. Frontera de aislamiento de datos de máximo nivel. |
| **Rifa** (`raffle`) | Evento de venta con precio de boleta, fechas y estado propios. |
| **Boleta** (`ticket`) | Unidad vendible. Tiene dos números: uno de premio diario y uno de premio semanal. |
| **Número diario** | Texto de 1 a 4 dígitos, conserva ceros iniciales. Participa en el premio diario. |
| **Número semanal** | Texto de 1 a 4 dígitos, conserva ceros iniciales. Participa en el premio semanal. |
| **Combinación** | Par (`daily_number`, `weekly_number`). Único dentro de una rifa. |
| **Estado de inventario** | Ciclo de vida de la boleta: `draft`, `pending_approval`, `available`, `assigned`, `cancelled`. |
| **Estado de pago** | Estado financiero calculado: Sin pagar, Abonada, Pagada. Nunca se elige manualmente. |
| **Abono** | Pago parcial de una boleta. |
| **Pago** (`payment`) | Dinero recibido de un cliente en una fecha, repartido entre una o varias boletas. |
| **Asignación de pago** (`payment_allocation`) | Porción de un pago aplicada a una boleta concreta. |
| **Anulación** (`void`) | Marcar un pago como no válido sin borrarlo. Sus asignaciones dejan de contar. |
| **Snapshot de precio** | Al vender se congelan dos cifras: `tickets.sale_price` (lo que debe el cliente) y `tickets.base_price` (el precio de la rifa en ese momento). |
| **Rebaja** | Vender una boleta por debajo del precio de la rifa. Es `base_price - sale_price`, no se guarda, y sale íntegra de la ganancia del vendedor (BR-P09, D-099). |

---

## 3. Actores

| Actor | Descripción | Portal |
|-------|-------------|--------|
| **Owner** | Dueño de la organización. Máximo privilegio. Único e insustituible por un Admin. | `/owner/*` |
| **Admin** | Administrador delegado. Opera como Owner salvo acciones exclusivas del Owner. | `/owner/*` |
| **Seller** | Vendedor. Solo ve y opera lo suyo. | `/seller/*` |

Referencia normativa de permisos: `docs/SECURITY.md` §2 (Matriz de permisos).

---

## 4. Configuración regional

| Parámetro | Valor |
|-----------|-------|
| Idioma de interfaz | Español (es-CO) |
| Zona horaria de negocio | `America/Bogota` (UTC-5, sin horario de verano) |
| Moneda | COP |
| Formato de presentación | `$120.000`, `$25.000`, `$0` (separador de miles `.`, sin decimales) |
| Precio predeterminado de boleta | `$120.000 COP` (corregido desde `$100.000` el 2026-08-15 — D-098, BR-P01) |
| Valor interno predeterminado | `120000` (entero, pesos completos) |

**Regla dura:** el dinero se almacena y se opera como entero de pesos colombianos. Nunca `float`,
`double`, `real` ni `number` con decimales. Los cálculos financieros autoritativos ocurren en
PostgreSQL; el frontend solo formatea para presentación.

---

## 5. Modelo multiorganización

- Existe la tabla `organizations`.
- Toda entidad de negocio referencia `organization_id` de forma **directa** (columna propia), incluso
  cuando la organización sea deducible por la relación padre. Esto permite políticas RLS simples,
  índices eficientes y restricciones únicas correctas.
- Ningún usuario puede leer ni escribir registros de otra organización, por ninguna vía
  (UI, URL, ID manipulado, request directo, API o cliente Supabase).
- La consistencia entre `organization_id` propio y el del padre se garantiza con claves foráneas
  compuestas (ver `docs/DATA_MODEL.md` §4.3).
- Aunque el arranque sea con una sola empresa, no se toman atajos de organización única.

---

## 6. Entidades del dominio

Resumen; el detalle normativo está en `docs/DATA_MODEL.md`.

| Entidad | Descripción | Pertenece a |
|---------|-------------|-------------|
| `organizations` | Empresa | — |
| `profiles` | Datos de la persona usuaria, 1:1 con `auth.users` | — |
| `memberships` | Vínculo usuario ↔ organización + rol + estado activo | organización |
| `raffles` | Rifas | organización |
| `clients` | Clientes | organización + vendedor |
| `tickets` | Boletas | organización + rifa + vendedor (+ cliente cuando se vende) |
| `payments` | Pagos recibidos | organización + vendedor + cliente |
| `payment_allocations` | Reparto de un pago entre boletas | pago + boleta |
| `audit_logs` | Bitácora de cambios críticos | organización |

---

## 7. Flujos principales

### F1 — Autenticación y enrutamiento por rol
1. Existe **una sola** página de autenticación (`/login`).
2. El usuario ingresa email + contraseña.
3. El servidor valida sesión, membresía activa y rol.
4. Redirección: Owner/Admin → `/owner/dashboard`; Seller → `/seller/dashboard`.
5. Un usuario inactivo no puede ingresar **ni continuar operando con una sesión previa**.

### F2 — Creación de una rifa
1. Owner/Admin crea la rifa con precio predeterminado `120000`.
2. Define fechas, estado inicial `draft` y `allow_seller_ticket_creation`.
3. Activa la rifa (`active`) para habilitar la operación.
4. Cambiar el precio de la rifa **no** altera el `sale_price` de boletas ya vendidas.

### F3 — Creación masiva de boletas (Owner/Admin)
1. Selecciona rifa y vendedor.
2. Indica cantidad entre 1 y 1.000.
3. El sistema genera las filas editables (paginadas/virtualizadas).
4. El usuario completa número diario y semanal por fila.
5. Puede guardar parcialmente como borrador (`draft`).
6. Validación por fila en cliente, servidor y base de datos.
7. Al completarse una fila válida y aprobada, la boleta queda `available`.

### F4 — Creación de boletas por vendedor
1. Solo si la rifa tiene `allow_seller_ticket_creation = true`.
2. El vendedor ingresa cantidad y los dos números.
3. Las boletas quedan en `pending_approval`.
4. Owner/Admin aprueba → `available`.
5. Si la opción está desactivada, la acción se oculta/deshabilita con explicación.

### F5 — Asignación de boleta a cliente
1. La boleta debe estar `available`, de la rifa correcta y del vendedor autenticado. **Desde D-198
   no existe la autorización administrativa**: el Dueño y el Administrador no venden (BR-Q06).
2. El vendedor selecciona o crea un cliente en el mismo flujo.
3. Se registran `client_id`, `assigned_at`, `sale_date`.
4. Se congelan `sale_price` (lo que debe el cliente) y `base_price` (el precio vigente de la rifa).
   Sin precio explícito los dos valen lo mismo; el vendedor puede **rebajar** `sale_price` hasta un
   mínimo que su propia ganancia pueda absorber (BR-P09..BR-P11).
5. El estado pasa a `assigned`.

### F6 — Registro de abono o pago
1. El vendedor registra un pago de un cliente: monto total, fecha, método, notas.
2. Reparte el total entre una o varias boletas **del mismo cliente**.
3. La suma de las asignaciones debe ser exactamente igual al total.
4. La operación es atómica: se guarda todo o nada (función transaccional en PostgreSQL).
5. El sistema recalcula `paid_amount`, `pending_amount` y el estado de pago de cada boleta.

### F7 — Anulación de pago — **suspendida desde el 2026-09-14 (D-198)**

> `void_payment` conserva su cuerpo, pero ninguna sesión la ejecuta y la aplicación no ofrece anular
> pagos (BR-Q06). Los pasos describen la regla que devolvería el procedimiento de reactivación de D-198.

1. Solo Owner/Admin. El vendedor no puede anular.
2. Motivo obligatorio; se registran usuario y fecha de anulación.
3. El pago no se elimina: se marca `voided_at`.
4. Sus asignaciones dejan de contar; saldos y estados se recalculan.
5. Queda registro en `audit_logs`.

### F8 — Importación de boletas desde archivo

> **Desde el 2026-09-14 (D-198, BR-Q07) los dos portales importan solo boletas sin vender**: una fila
> con cliente o con abono se aparta en la vista previa y se rechaza en el servidor. Los pasos 3, 4, 6 y
> 6.b describen la importación con clientes y abonos, **suspendida**; la lectura del archivo se conserva
> para poder reactivarla.

1. Owner/Admin o Seller elige CSV o JSON, mapea columnas si hace falta y revisa una vista previa.
2. Elegir el archivo no escribe nada; guardar exige una confirmación posterior.
3. Cada fila puede incluir cliente; cuando lo hace, nombre y celular son obligatorios juntos. Las
   filas sin cliente y los archivos antiguos de dos columnas siguen admitidos.
4. Owner/Admin puede crear o reutilizar un cliente inequívoco de la cartera seleccionada y dejar la
   boleta asignada. Un celular con otro nombre, un cliente archivado o varias coincidencias bloquean
   esas filas; no se adivina la identidad ni se cruza vendedor u organización.
5. Un vendedor solo importa cuando la rifa permite crear boletas; quedan `pending_approval` y, por
   tanto, su archivo no admite cliente.
6. Cliente, boletas, asignaciones y abonos administrativos se guardan en una sola transacción y
   reutilizan las reglas de `assign_ticket_row` y `create_payment`.
6.b Una fila puede traer el **abono** ya cobrado de esa boleta —en miles, en pesos o «Cancelado»—.
   Exige cliente, es de su propia boleta y nunca se reparte; el estado de pago y el saldo los deriva
   la base de datos. El límite y el valor de «Cancelado» salen del precio vigente de la rifa, nunca
   de una cifra escrita en el código (BR-N14, D-129).
7. La base de datos detecta combinaciones tomadas sin revelar de qué vendedor son. Después de crear
   las boletas intenta registrar el evento sin guardar el archivo; si esa bitácora falla, conserva
   las boletas e informa `auditFailed` (BR-N12, D-081, D-087).

### F9 — Selección y acciones masivas sobre boletas
1. La selección usa `ticket.id`, admite hasta 1.000 y sobrevive a búsqueda, filtros y paginación.
2. Seller puede vender varias boletas elegibles al mismo cliente en una operación atómica.
3. Owner/Admin puede aprobar, anular las **no vendidas** (D-198), cambiar vendedor y eliminar boletas
   cargadas por error, según elegibilidad y permisos.
4. La interfaz explica incompatibles; PostgreSQL bloquea filas, revalida y aplica todo o nada en las
   acciones que declara atómicas (BR-B01..BR-B08, D-082..D-085; excepción conocida I-044).

---

## 8. Reglas críticas (resumen ejecutable)

Detalle normativo con identificadores en `docs/BUSINESS_RULES.md`.

1. `daily_number` y `weekly_number` son **texto**, 1 a 4 dígitos, con ceros iniciales conservados.
2. La combinación (`organization_id`, `raffle_id`, `daily_number`, `weekly_number`) es **única**.
3. La unicidad aplica **entre vendedores** y también a combinaciones **anuladas** (no se reutilizan en el MVP).
4. La misma combinación **sí** puede existir en otra rifa.
5. `sale_price` es lo que debe el cliente, fijado al vender: el precio de la rifa, o menos si el
   vendedor concedió una rebaja (BR-P09). Se puede **corregir** después con las mismas reglas
   (BR-P13), nunca recargar sobre el oficial congelado ni bajar de lo ya abonado.
6. Estado de inventario y estado de pago son **dimensiones separadas**.
7. El estado de pago se **calcula**; nunca se selecciona.
8. No se permiten sobrepagos, montos ≤ 0, ni pagos a boletas sin cliente.
9. Un pago y sus asignaciones se crean de forma atómica en el servidor/BD.
10. Los pagos se anulan, nunca se borran.
11. Una boleta con pagos activos no puede cambiar de cliente (BR-I12). Una boleta vendida **sin
    ninguna** fila en `payment_allocations` ni en `lottery_ticket_matches` sí puede corregirse al
    cliente correcto, dentro de la cartera de su mismo vendedor y con motivo (BR-I13); y, si además
    su rifa sigue activa, puede **liberarse** —volver a `available`, sin cliente ni venta— cuando el
    cliente desiste antes de abonar nada (BR-I14).
11.b Una boleta vendida registra si su **paz y salvo** —el desprendible— ya se entregó al
    cliente. Lo marca **solo el vendedor dueño** de la boleta, con la fecha del servidor, y es
    **independiente del pago**: una boleta Sin pagar puede tenerlo entregado y una Pagada puede
    no tenerlo. Vuelve a pendiente si la boleta cambia de cliente o se libera (BR-I15). Registra
    **cuándo se marcó la entrega**; no constituye prueba física ni legal de que el cliente
    recibió el documento.
12. RLS activo en todas las tablas de negocio; el frontend no es frontera de seguridad.
13. Una boleta se busca por número diario o semanal, entero o parcial, nunca por código interno
    (BR-N11).
14. Importar reutiliza las mismas reglas y validadores. **Desde D-198 solo se importan boletas sin
    vender**: una fila con cliente o con abono se rechaza en los dos portales (BR-N12, BR-Q07).
15. Selección, filtros y paginación son estados separados; limpiar uno no borra el otro (BR-B01).
16. Las acciones masivas sensibles se autorizan y revalidan en base de datos; la UI no es su frontera
    de seguridad (BR-B07, con la salvedad documentada en I-044).
17. **La cartera es del vendedor** (D-198): el Dueño y el Administrador no leen ni modifican clientes,
    precios de venta, abonos, saldos, pagos ni ganancias, por ninguna vía. Ven y administran el
    inventario, con el estado de pago en dos valores —Pagada o Sin pagar— (BR-Q01..BR-Q10).

---

## 9. Superficie funcional por portal

### 9.1 Portal Owner/Admin (`/owner/*`)
Panel de inventario · Rifas · Administradores · Vendedores · Boletas (tabla global sin cartera, búsqueda
por número, detalle, creación individual, masiva y por archivo sin vender; selección, aprobación,
anulación de las no vendidas, cambio de vendedor y eliminación controlada) · Reportes de recuentos con
exportación CSV. **Sin «Clientes» ni «Pagos» desde el 2026-09-14** (D-198, BR-Q08).

### 9.2 Portal Seller (`/seller/*`)
Dashboard propio · Boletas propias (búsqueda parcial por número diario o semanal; filtros por estado y
cliente; creación manual o por archivo cuando la rifa lo permite; selección y venta múltiple) ·
Clientes propios (crear, editar, archivar, perfil con historial) · Asignación de boletas · Registro de
abonos y pagos · Consulta de saldos e historial · Reportes propios con exportación CSV, sin el que
compara vendedores (D-059, D-080 a D-085).


### 9.3 Catálogo público (`/catalogo/<slug>`)
Una página por vendedor, **sin sesión**, con sus boletas libres y las que ya están tomadas de una
rifa configurada, buscador por número y un botón que abre WhatsApp con un mensaje ya escrito
(BR-K01..BR-K12, D-159, D-160). No reserva, no retiene, no crea clientes y no registra ventas: la
disponibilidad la sigue cambiando únicamente el vendedor desde su portal. La configuración —publicar,
WhatsApp público, rifa y regenerar el enlace— es de Dueño y Administrador; el vendedor ve y copia su
enlace.

### 9.4 Configuración del vendedor e invitación al grupo de WhatsApp (`/seller/settings`)
Cada vendedor guarda **su** grupo de WhatsApp y, si quiere, redacta su propio mensaje de invitación
(BR-W01..BR-W08, D-176). Después de registrar un cliente nuevo —desde el detalle de una boleta, desde
la venta masiva o desde «Mis clientes»— un diálogo le ofrece **invitarlo al grupo** con el mensaje ya
escrito: se abre un enlace `wa.me` y la persona pulsa Enviar. **No hay integración con WhatsApp**, así
que no se puede saber si el mensaje salió ni si el cliente se unió, y ningún texto lo insinúa.

El enlace del grupo **nunca forma parte del texto**: el vendedor escribe prosa y el sistema lo añade
al final, de modo que no hay marcador que se pueda romper. Configurar es exclusivo del **propio
vendedor** —ni el personal ni un vendedor padre pueden hacerlo por él— y la pantalla está pensada
para crecer con más secciones.

### 9.5 Cuentas para recibir pagos y recordatorios de pago — **EN PRODUCCIÓN (7 de 7 etapas)**

> Autorizado por el dueño del producto el **2026-09-11** (D-185, D-186, D-187) y **terminado**: las
> siete etapas están hechas y **en producción desde el 2026-09-12** (D-193, migraciones
> `0051`–`0055`). Contrato, base de datos (`0051`), configuración y formularios (D-188) y **el motor**
> (`0052`, D-189). Un vendedor guarda sus cuentas, programa sus recordatorios y
> **a la hora que eligió recibe el aviso en la campana**, que lo lleva a copiar el mensaje.
>
> Desde la **Etapa 4** (`0053`, D-190) cada dispositivo puede además **registrarse para recibir
> avisos**: un solo service worker, el permiso pedido en una pantalla y a propósito, y el aviso
> genérico que no dice nada.
>
> Y desde la **Etapa 5** (`0054`, D-191) el aviso **sale de verdad**: se encola en la misma
> transacción que la campana, un despachador protegido lo cifra con Web Push estándar —sin Firebase
> y sin ninguna dependencia— y llega al teléfono **con la aplicación cerrada**. Un 404 o un 410
> retiran ese dispositivo; lo demás se reintenta con retroceso; y **perder el envío nunca toca el
> aviso interno**.
>
> **En producción** (`0051`–`0055`, D-193): la base real las tiene y los tres `pg_cron` corren cada
> minuto. El canal es **opcional**: sin claves configuradas no se ofrece ni se envía nada, y la
> campana funciona igual.
> Reglas: BR-M01..BR-M09, BR-S01..BR-S14, BR-V01..BR-V08, **las veintinueve implementadas**.

Dos capacidades nuevas del **vendedor**, dentro de `/seller/settings`, que hoy tiene una sola sección
—la del grupo de WhatsApp (§9.4)— y pasará a tener tres, cada una en su subruta, con la página
principal como **resumen ligero**.

**Cuentas para recibir pagos.** El vendedor guarda dónde le consignan sus clientes: **Nequi**,
**Daviplata** y **cuentas bancarias**, con sitio para más formas después. De cada una se guarda el
**titular** y el **número** —teléfono, o banco + tipo de cuenta + número—; **no el documento de
identidad**. Máximo **5 activas**. Se archivan, no se borran.

**Recordatorios de pago.** El vendedor programa mensajes semanales de cobro: **cualquier día y hora,
con precisión de minuto**, varios el mismo día y ninguno repetido a la misma hora. Puede pausarlos,
reactivarlos, editarlos y archivarlos. Máximo **14 activos**. Cada uno usa el mensaje predeterminado
de la aplicación o uno propio, y **la aplicación añade sola las cuentas activas al final**: no hay
marcadores que escribir ni que romper, y cambiar una cuenta cambia los mensajes futuros **sin tocar
ningún recordatorio**.

**Cuando llega la hora**, la aplicación crea un aviso en la **campana** —que es obligatoria y es la
fuente durable— y, si el dispositivo lo permite, manda una notificación **genérica** por Web Push.
El vendedor abre el aviso, **copia** el mensaje, **abre** su grupo y **pega y envía**. Rifas **no
envía nada a WhatsApp**: «Copiado», «Grupo abierto» y «Marcado como atendido» describen actos
locales y **nunca** se presentan como confirmación de envío o de entrega.

**Quién lo ve:** solo el propio vendedor. **Ni el Dueño, ni el Administrador, ni su vendedor padre**
acceden a sus cuentas ni a sus recordatorios. Cambiar eso exige una decisión explícita y posterior.

**Etapas** (cada una necesita autorización propia):

| Etapa | Qué entrega |
|---|---|
| 0 | Contrato funcional y arquitectura documentada ✅ **2026-09-11** |
| 1 | Modelo de datos, restricciones, RLS, RPC, índices, tipos y pruebas de base de datos ✅ **2026-09-11** (`0051`, en local) |
| 2 | Configuración y formularios de cuentas, WhatsApp y recordatorios ✅ **2026-09-12** (D-188, en local) |
| 3 | Motor de vencimientos, ocurrencias, campana y flujo copiar–abrir–atender ✅ **2026-09-12** (`0052`, D-189, en local) |
| 4 | Suscripciones Web Push por dispositivo y extensión del service worker ✅ **2026-09-12** (`0053`, D-190, en local) |
| 5 | Outbox, dispatcher, reintentos y limpieza de endpoints inválidos ✅ **2026-09-12** (`0054`, D-191, en local) |
| 6 | Auditoría integrada de seguridad, rendimiento, UX y regresiones ✅ **2026-09-12** (D-192) |
| 7 | Promoción controlada a producción ✅ **2026-09-12** (`0055`, D-193) |

### 9.6 Resultados de la semana (`/seller/settings/weekly-results`) — desplegada, con el mensaje propio

> Encargo «Resultados de la semana», 2026-09-13 (D-194, D-195, BR-H01..BR-H08), **desplegado** el mismo
> día y sin migraciones. **Ampliado** ese mismo día con el mensaje propio del vendedor (D-197, BR-H09,
> BR-H10, migración **`0056`**), **también desplegado** ese día: `0056` aplicada al proyecto real y
> `6dd23e5` en producción.

Cuarta sección de «Configuración» del vendedor. Muestra los **seis números mayores** de la última
semana terminada —lunes a sábado, en hora de Bogotá— y prepara para su grupo una **imagen** vertical
de 1080 × 1350 y un **mensaje** ya escrito. El vendedor **comparte** la imagen con el menú del
teléfono o la **descarga**, **copia** el mensaje y **abre su grupo**; enviarlos lo hace él.

**El mensaje puede ser el suyo.** La aplicación sigue trayendo un mensaje predeterminado, escrito en el
código y con la semana correcta cada vez. Con «Usar mi propio mensaje», el vendedor escribe el suyo, lo
guarda y lo encuentra en sus próximas visitas y semanas; se usa **tal cual**, así que una fecha escrita
dentro no cambia sola. Puede apagarlo sin perderlo o volver al predeterminado. Lo que se ve en la vista
previa es exactamente lo que se copia y lo que se comparte con la imagen, y se puede preparar aunque
todavía falte algún resultado.

| Lo que sí hace | Lo que no hace |
|---|---|
| Compone la imagen al pedirla, con el fondo aprobado y los datos locales | Guardar imágenes, programar envíos, usar IA ni consultar fuentes externas |
| Encabezarla con la rifa del catálogo del vendedor | Elegir una rifa por su cuenta cuando no hay ninguna configurada |
| Esperar a los seis resultados confirmados y decir cuáles faltan | Componer una imagen o un mensaje con resultados a medias |
| Abrir el menú de compartir, la descarga y el grupo | Enviar nada a WhatsApp, ni saber si algo se envió |
| Guardar el mensaje propio de cada vendedor —si lo usa y qué escribió—, y solo eso | Guardar el mensaje ya compuesto; cambiar el mensaje de otro vendedor; actualizar solas las fechas de un texto propio |

La imagen es la misma para todos los vendedores de una rifa: no lleva datos de nadie, y el mensaje
propio no la cambia.

---

### 9.7 Premios configurables por rifa — **EN PRODUCCIÓN: contrato, panel, motor, transición y la rifa real convertida**

> **Estado al 2026-09-17 (Entrega 5 cerrada).** `0058`–`0066` están en el proyecto real, el código va
> desplegado en `da81663` y la rifa **«SORTEO CAMIONETA KIA 2027»** —activa, del 27/07/2026 al
> **21/12/2026**— es **configurable** desde las **17:40:12.566 UTC**, con sus **seis** premios y la
> transición `af9cdbe2-0d50-43db-b12a-42ded57b1cae`. Las tres puertas de `RUNBOOK` §8 se ejecutaron ese
> día. Lo de abajo se conserva como historia de cada entrega.

> Encargo «premios configurables por rifa», 2026-09-15 (D-199, D-200 y **D-201**; reglas
> BR-J01..BR-J15; migraciones **`0058`** y **`0059`**). **No hay panel** (Entrega 2), **no hay motor
> de coincidencias** (Entrega 3), **ninguna rifa cambió de sistema** y las migraciones **no están en
> el proyecto real**.
>
> **Estado al 2026-09-16:** existen el **panel** (Entrega 2, D-202, `0060`) y el **motor de
> coincidencias** (Entrega 3, **D-203**, `0061`). Las rifas que ya existían siguen con el comparador
> de siempre hasta la Entrega 4, y nada de esto está en el proyecto real.
>
> **Actualizado el mismo día (Entrega 4, D-204, `0063`):** existe **la transición** de una rifa que ya
> existía, y la configuración de los **seis** premios confirmados está escrita y probada. **Ninguna
> rifa real ha cambiado de sistema**: identificarla y convertirla es la Entrega 5.
>
> **Corregido antes de producción (D-206, `0064`, solo en local):** los sorteos que ya se jugaron cuando
> una rifa cambia de sistema **conservan el sistema de siempre**, también si su resultado llega después, y
> cambiar las fechas de una rifa activa **avisa** a su organización. La rifa real —«SORTEO CAMIONETA KIA
> 2027»— se extenderá hasta el **21 de diciembre de 2026**, con su aviso, antes de la transición.
>
> **Corregido otra vez (D-206, `0065`, solo en local):** ese aviso llega a **todas** las personas activas,
> **también a quien cambió las fechas**, y la extensión la hace **el Dueño con su sesión**, desde la
> pantalla de editar, para que quede a su nombre.

**Cómo pasa una rifa que ya existía a premios configurables (Entrega 4).** No lo hace nadie desde la
aplicación: lo hace **una vez**, por rifa, un proceso interno, y o queda **entera** —premios, sistema
nuevo, un aviso a cada persona activa de la organización y el registro en la bitácora— o no queda
nada. La rifa **conserva su estado, sus fechas, sus boletas, sus clientes, sus pagos y sus
coincidencias**: nada de eso se toca ni se recalcula. Antes se ve **exactamente** lo que va a quedar.

**Los sorteos que ya se jugaron siguen con el sistema de siempre** (D-206, respuesta del dueño). Un
sorteo cuya hora ya había llegado cuando la rifa cambió de sistema se resuelve **con el comparador de
siempre**, también si su resultado se confirma después; uno posterior, **solo con los premios nuevos**.
No se inventan ni se cargan resultados: si un sorteo viejo nunca tuvo resultado, se queda así hasta que
lo haya con evidencia oficial, y entonces avisa como cualquier otro. Lo único que detiene el cambio es un
sorteo de una semana ya empezada **cuya hora no se conoce**: no se sabe de qué lado cae.

**Cambiar las fechas de una rifa activa se avisa** (BR-R12): cada persona activa de la organización
—**también quien lo hizo**— recibe **un** aviso en la campana con la fecha nueva, sin nada de clientes,
ventas ni pagos, y el aviso y la bitácora dicen quién hizo el cambio. Guardar las mismas fechas no avisa, y
la pantalla de editar lo dice antes de guardar.

**Los seis premios confirmados de la rifa de diciembre** (D-204). Todo juega con **cuatro cifras**
salvo el que dice tres:

| Premio | Qué entrega | Con qué número | Cuándo y con qué lotería |
|---|---|---|---|
| Premio diario | $500.000 | Diario | De lunes a viernes, **desde el primer sorteo pendiente el día de la transición hasta el 27 de noviembre**, con la lotería de cada día |
| Premio fin de semana | $2.000.000 | Semanal | Los sábados, **desde el primer sábado pendiente hasta el 28 de noviembre**, con Boyacá |
| Premio principal | **Una** de cuatro alternativas: Camioneta KIA · Renault Alaskan modelo 2023 y $20.000.000 · $120.000.000 · Renault Logan Zen público modelo 2023 y $70.000.000 | Diario | Lunes 21 de diciembre, con Cundinamarca |
| Premio especial de tres cifras | $1.000.000 | Diario, **últimas tres cifras** | Lunes 21 de diciembre, con Cundinamarca. Quien acierta las cuatro no lo recibe además, por ninguna de sus boletas |
| Premio especial semanal | $1.000.000 | Semanal | Del 1 al 5 y del 16 al 19 de diciembre, todos los días con lotería, sábados incluidos |
| Premio especial del 15 de diciembre | $7.000.000 | Semanal | Martes 15 de diciembre, con la lotería de ese día: Cruz Roja |

«Número semanal, un lunes, con Cundinamarca» **fue un ejemplo** de que el sistema admite excepciones:
**no es un séptimo premio** y no está en la rifa.

**Cuándo un premio le toca a una boleta (Entrega 3).** Al confirmarse el resultado de una lotería, se
miran los premios que **de verdad juegan** ese sorteo —el día y la lotería están en su calendario—,
con las condiciones **que tenían anunciadas antes del corte** del sorteo: su hora original, aunque
después se aplace, o su **hora oficial si se adelantó**. Un cambio publicado cuando el sorteo ya debía
haberse jugado **nunca** le aplica, tampoco a uno adelantado, y si falta cualquiera de las dos horas no
se supone ninguna (corrección del 2026-09-16, D-203 Decisión 9). Se compara el número de la boleta
que diga cada premio, con las cuatro cifras o con las tres últimas. **Si un cliente acierta las
cuatro cifras, se queda con ese premio y no recibe además uno de
tres cifras en el mismo sorteo, por ninguna de sus boletas**: ese premio queda para los demás clientes
(respuesta del dueño, D-203). Lo que se guarda es **con qué premio y con qué versión** coincidió cada
boleta, y **no cambia** si después se edita el premio. La aplicación **sigue sin registrar** qué
alternativa se lleva quien acierta, ni pagos o entregas de premios.

Cada rifa podrá definir **sus** premios en vez de depender del único comparador fijo de siempre
(BR-L06). Un premio dice **qué se gana**, **con cuál de los dos números** de la boleta juega, **con
cuántas cifras** —las cuatro, o las tres últimas—, **qué días** y **con qué lotería**, además de sus
aclaraciones y su estado.

**Lo que se gana puede ser una cosa o una elección.** Un premio entrega una sola recompensa —dinero,
algo en especie, o las dos cosas juntas— o varias **alternativas excluyentes** de las que se lleva
**una**: así se escribe el premio mayor del 21 de diciembre, que ofrece una camioneta, dos
combinaciones de vehículo y dinero, o dinero solo. La aplicación **no registra cuál se llevó**.

**Los premios no se acumulan.** Dos premios que el mismo día jugarían con el mismo número, las mismas
cifras y la misma lotería no se pueden resolver: es un **error de configuración** y se dice cuáles y
qué día. Los cruces se evitan **con las fechas** —por eso cada premio dice desde cuándo y hasta
cuándo aplica—, y un premio de cuatro cifras y otro de tres **sí** conviven el mismo día: son cosas
distintas y el de cuatro manda sobre el de tres.

| Lo que ya existe (Entrega 1) | Lo que todavía no |
|---|---|
| El modelo: identidad, versiones inmutables y períodos de calendario, con su historial completo | ~~La pantalla donde se crean y se editan (Entrega 2)~~ — existe desde D-202 |
| Las seis RPC —crear, publicar, archivar, restaurar, reordenar e historial— con control optimista | ~~El motor que crea las coincidencias con estos premios (Entrega 3)~~ — existe desde D-203 |
| La capacidad **`raffles.prizes.manage`**, en la aplicación y en PostgreSQL (D-200) | ~~La configuración de la rifa de diciembre y la transición por rifa (Entrega 4)~~ — existen desde D-204, **solo en local** |
| La auditoría semántica y el aviso a toda la organización cuando cambia una rifa activa | La promoción a producción y la transición de la rifa real (Entrega 5) |

**El calendario es lo que más se usa y por eso es lo más acotado:** un período son fechas, días de la
semana y lotería; se admiten **varias ventanas separadas**; **el domingo no se programa** porque no
hay lotería; una **lotería fija** solo puede ponerse en su día; y un mismo día **no puede estar en dos
períodos** del mismo premio.

**Una rifa en borrador se edita libremente. Una activa también**, pero cada cambio afecta **solo a los
sorteos que todavía no se jugaron**: el que ya pasó conserva las condiciones con las que se anunció.
Cuando eso no se puede saber —porque falta la hora oficial de un sorteo de esta semana—, **no se
guarda** y se dice por qué.

**Quién lo ve y quién lo cambia:** lo cambian el Dueño y el Administrador, por capacidad y no por
rol; lo **leen** todos los miembros de la organización, porque son condiciones hechas para contarle a
un cliente. Nada de esto toca la cartera del vendedor (D-198).

---

## 10. Fuera de alcance del MVP

Pagos en línea · Portal de clientes · Integración con loterías · Sorteos automáticos · Números
ganadores · ~~WhatsApp~~ (solo como **enlace saliente**: el catálogo público, D-159, y la invitación al grupo del vendedor, D-176. **No hay integración con la WhatsApp Business Platform** en ninguno de los dos, y no se puede saber si un mensaje se envió) · SMS · Facturación electrónica · ~~Comisiones de vendedores~~ · App móvil
nativa · Integraciones contables.

Estas funciones **no** se construyen durante las fases 0 a 9.

⚠️ **Las comisiones de vendedores salieron de esta lista el 2026-08-12**, por encargo explícito del
dueño del producto y junto con los equipos de vendedores (D-091, D-094). Están implementadas y
probadas; su regla vive en BR-G01..BR-G12.

⚠️ **Las cuentas para recibir pagos y los recordatorios de pago del vendedor se autorizaron el
2026-09-11** (D-185) y **no** sacan nada de esta lista: **siguen sin existir pagos en línea**. La
aplicación guarda dónde le consignan a un vendedor y le prepara un mensaje; **no cobra, no mueve
dinero, no se conecta a Nequi, a Daviplata ni a ningún banco, y no envía nada a WhatsApp** (§9.5).
Las notificaciones que añade son **Web Push estándar**, sin Firebase y sin servicio de terceros
(D-187).

⚠️ **Los resultados oficiales de seis loterías colombianas salieron de «Integración con loterías» /
«Números ganadores» el 2026-08-30**, por el encargo `ResultadosLoterias.txt`. No es pasarela, ni
sorteo automático, ni portal de clientes: es programación oficial, número mayor y coincidencia
textual con las boletas (BR-L01..BR-L20, D-140..D-147). La Etapa 1 dejó el contrato persistente; la
Etapa 2, los adaptadores; la Etapa 3, la sincronización, el matching en vivo y los avisos; la
Etapa 4, el recuadro del Panel; la Etapa 5, el Route Handler y el tick; la Etapa 6, las
migraciones, el cron de Vercel y la producción (D-149). Desde el 2026-09-01, el mantenimiento
del encargo `CorrecionesLoterias.txt` acota lo que un tick puede consultar hacia afuera
(BR-L22, D-152, migración `0041`, **sin desplegar**). El resto de la lista sigue fuera
de alcance.

---

## 11. Verificación lógica obligatoria (Fase 0)

Checklist exigido por el prompt de Fase 0. Cada punto está resuelto en el diseño y localizado aquí.

| # | Punto a verificar | Resolución de diseño | Dónde se aplica | Referencia |
|---|-------------------|----------------------|-----------------|------------|
| 1 | Precio predeterminado `$120.000 COP` | `raffles.ticket_price bigint NOT NULL DEFAULT 120000` (migración `0027`) | BD (default) + UI (valor inicial del formulario) | DATA_MODEL §4.4, BR-P01, D-098 |
| 2 | Dinero como enteros | Todas las columnas monetarias `bigint`; prohibido `numeric`/`float` | BD + tipos TS + Zod `z.int()` | DATA_MODEL §3.2, BR-P02 |
| 3 | Números guardados como texto | `daily_number text`, `weekly_number text` | BD | DATA_MODEL §4.6, BR-N01 |
| 4 | Máximo 4 dígitos | `CHECK (daily_number ~ '^[0-9]{1,4}$')` + Zod `regex` | BD + servidor + cliente | BR-N02 |
| 5 | Conservación de ceros iniciales | Nunca se castea a numérico; comparación por texto; sin `TRIM`/`LTRIM` | BD + servidor + cliente | BR-N03 |
| 6 | Combinación única por rifa | `UNIQUE (organization_id, raffle_id, daily_number, weekly_number)` | BD | DATA_MODEL §4.6.3, BR-N04 |
| 7 | Prohibición de duplicados entre vendedores | La restricción única **no** incluye `seller_id` | BD | BR-N05 |
| 8 | Snapshot de `sale_price` | Se copia al asignar; se corrige con `update_ticket_sale_price` (BR-P13); el UPDATE directo con abonos sigue bloqueado | BD (trigger + RPC) + servidor | BR-P03, BR-P04, BR-P13 |
| 9 | Separación inventario / pago | `inventory_status` (enum) vs `payment_status` (columna generada desde `paid_amount`) | BD | DATA_MODEL §4.6.4 |
| 10 | Pagos distribuidos entre boletas | `payments` 1:N `payment_allocations`; `SUM(amount) = total_amount` validado | BD (trigger diferido) + RPC | BR-F05 |
| 11 | Atomicidad de pagos | RPC `create_payment(...)` en una única transacción con bloqueo de filas | BD (`SECURITY DEFINER`) | ARCHITECTURE §7.2 |
| 12 | Anulación sin eliminación física | `voided_at`, `voided_by`, `void_reason`; sin `DELETE` permitido por RLS | BD + servidor | BR-F09 |
| 13 | RLS para vendedores | Políticas por `seller_id = current_profile_id()` en 4 tablas + `payment_allocations` vía `EXISTS` | BD | SECURITY §4 |
| 14 | RLS entre organizaciones | Toda política exige `organization_id IN (SELECT ... current_user_org_ids())` | BD | SECURITY §4.2 |
| 15 | Auditoría | `audit_logs` append-only, escrita por triggers y RPC `SECURITY DEFINER` | BD | SECURITY §6 |

**Conclusión de la revisión:** no se detectaron contradicciones internas en la especificación.
Las ambigüedades encontradas se resolvieron y quedaron registradas en `docs/DECISIONS.md`
(D-001 a D-026).

---

## 12. Trazabilidad histórica con la especificación original (`CLAUDE.md`)

Esta tabla conserva la relación con el prompt que originó la Fase 0. No convierte `CLAUDE.md` en una
segunda fuente funcional ni incluye por sí sola el mantenimiento posterior; para eso rige D-086.

| Sección de `CLAUDE.md` | Documento que la desarrolla |
|------------------------|-----------------------------|
| §4, §10–§24 Producto y módulos | `docs/MASTER_SPEC.md`, `docs/BUSINESS_RULES.md` |
| §5 Stack | `docs/ARCHITECTURE.md` §2 |
| §6 Configuración regional | `docs/ARCHITECTURE.md` §9 |
| §7 Multiorganización | `docs/DATA_MODEL.md` §2, `docs/SECURITY.md` §4.2 |
| §8, §9 Roles y usuarios | `docs/SECURITY.md` §2, §3 |
| §13–§20 Boletas y pagos | `docs/DATA_MODEL.md` §4, `docs/BUSINESS_RULES.md` |
| §25 Auditoría | `docs/SECURITY.md` §6 |
| §26 Seguridad | `docs/SECURITY.md` completo |
| §27 UX | `docs/ARCHITECTURE.md` §8 |
| §35 UX Writing y redacción | `docs/UX_COPY_GUIDELINES.md` (fuente única de todo texto visible) |
| §28 Documentación | Este conjunto de documentos |
| §30 Pruebas mínimas | `docs/TESTING.md` §3 (matriz de trazabilidad) |
| §33 Orden de fases | `docs/IMPLEMENTATION_PLAN.md` |
