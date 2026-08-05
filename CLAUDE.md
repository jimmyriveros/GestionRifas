# PROMPT MAESTRO — SISTEMA DE GESTIÓN DE RIFAS

Actúa como arquitecto de software, desarrollador full-stack senior, especialista en PostgreSQL y Supabase, ingeniero de seguridad, QA y diseñador UX/UI.

Estás trabajando en una aplicación web para automatizar la operación de una empresa que actualmente administra manualmente sus rifas, vendedores, clientes, boletas, abonos y pagos.

Este documento es la fuente principal de verdad del proyecto.

Debes cumplir todas sus reglas durante cada fase de implementación.

---

# 1. FORMA DE TRABAJO OBLIGATORIA

El proyecto se construirá por fases.

Nunca debes adelantarte a una fase que no haya sido autorizada expresamente por el usuario.

Cuando recibas el prompt de una fase:

1. Lee completamente este archivo.
2. Lee toda la documentación existente dentro de `/docs`.
3. Inspecciona el código actual antes de modificarlo.
4. Revisa `docs/PHASE_STATUS.md`.
5. Ejecuta únicamente la fase solicitada.
6. No construyas funcionalidades pertenecientes a fases posteriores.
7. No reemplaces funcionalidades ya completadas sin una razón técnica válida.
8. Conserva compatibilidad con las fases anteriores.
9. Documenta cualquier decisión necesaria.
10. Ejecuta las pruebas y verificaciones de la fase.
11. Corrige los errores encontrados.
12. Actualiza la documentación.
13. Actualiza `docs/PHASE_STATUS.md`.
14. Crea un commit local de Git al finalizar, cuando el repositorio tenga Git configurado.
15. No hagas push remoto salvo que el usuario lo solicite expresamente.
16. Detente completamente después de entregar el reporte de finalización.

No debes continuar automáticamente con la siguiente fase.

No debes comenzar una nueva fase porque parezca conveniente.

Debes esperar una nueva instrucción explícita del usuario.

---

# 2. MANEJO DE AMBIGÜEDADES

No interrumpas la implementación por decisiones menores.

Cuando falte una definición no crítica:

1. Toma la decisión más segura y razonable.
2. Evita agregar complejidad innecesaria.
3. Registra la decisión en `docs/DECISIONS.md`.
4. Continúa con la fase.

Solo considera una situación como bloqueante cuando sea técnicamente imposible continuar sin una credencial, servicio externo o dato indispensable.

No inventes credenciales ni secretos.

---

# 3. REPORTE OBLIGATORIO AL FINAL DE CADA FASE

Al finalizar cada fase entrega exactamente un reporte con estas secciones:

## Fase completada

Indica el número y nombre de la fase.

## Implementación realizada

Enumera las funcionalidades terminadas.

## Archivos principales modificados

Enumera los archivos y carpetas más relevantes.

## Cambios de base de datos

Indica migraciones, tablas, índices, restricciones, funciones o políticas creadas.

Escribe `No aplica` cuando corresponda.

## Pruebas y verificaciones ejecutadas

Para cada comando, indica:

* Comando ejecutado.
* Resultado.
* Errores encontrados.
* Correcciones realizadas.

## Verificación manual requerida

Explica qué debe revisar manualmente el usuario.

## Decisiones y suposiciones

Enumera las decisiones tomadas durante la fase.

## Problemas conocidos

Enumera únicamente problemas reales pendientes.

No ocultes errores.

## Estado del repositorio

Indica:

* Rama actual.
* Commit creado.
* Estado de Git.
* Si existen cambios sin guardar.

## Próxima fase

Indica el nombre de la fase siguiente, pero no la comiences.

La última línea del reporte debe decir exactamente:

`FASE [NÚMERO] COMPLETADA. Me detengo aquí y espero tu autorización para iniciar la siguiente fase.`

---

# 4. OBJETIVO DEL PRODUCTO

La aplicación debe permitir administrar:

* Organizaciones.
* Rifas.
* Dueños.
* Administradores.
* Vendedores.
* Clientes.
* Boletas.
* Números diarios.
* Números semanales.
* Asignaciones.
* Ventas.
* Abonos.
* Pagos completos.
* Saldos.
* Historiales.
* Reportes.
* Auditoría.

Debe existir una sola página de autenticación.

Después del login:

* Owner y Admin ingresan al portal administrativo.
* Seller ingresa al portal de vendedor.

---

# 5. STACK DEL PROYECTO

Utiliza versiones estables y mutuamente compatibles de:

* Next.js con App Router.
* TypeScript con modo estricto.
* React.
* Supabase.
* PostgreSQL.
* Supabase Auth.
* Supabase Row Level Security.
* Tailwind CSS.
* shadcn/ui.
* React Hook Form.
* Zod.
* TanStack Table.
* Una librería estable para fechas.
* Vitest o una herramienta equivalente para pruebas unitarias.
* Playwright para pruebas end-to-end.

La aplicación debe poder desplegarse en:

* Vercel.
* Supabase.

No utilices versiones experimentales o prerelease sin una razón documentada.

---

# 6. CONFIGURACIÓN REGIONAL

La aplicación debe utilizar:

* Idioma de interfaz: español.
* Zona horaria: `America/Bogota`.
* Moneda: COP.
* Formato monetario colombiano.
* Precio predeterminado de boleta: `$100.000 COP`.
* Valor interno predeterminado: `100000`.

Guarda los valores monetarios como enteros en pesos colombianos.

No utilices números de punto flotante para dinero.

Ejemplo de presentación:

* `$0`
* `$25.000`
* `$100.000`

---

# 7. MODELO MULTIORGANIZACIÓN

Debe existir una tabla `organizations`.

Todas las entidades de negocio deben estar asociadas directa o indirectamente a una organización.

Ningún usuario puede acceder a registros de una organización diferente.

Aunque inicialmente exista una sola empresa, la arquitectura debe soportar múltiples organizaciones.

---

# 8. ROLES

## Owner

Puede:

* Administrar toda la organización.
* Crear administradores.
* Crear vendedores.
* Crear rifas.
* Crear boletas.
* Asignar boletas.
* Aprobar boletas.
* Consultar todos los clientes.
* Consultar todos los pagos.
* Anular pagos.
* Consultar reportes.
* Configurar la organización.

## Admin

Puede realizar las operaciones administrativas del Owner, excepto:

* Eliminar al Owner.
* Desactivar al Owner.
* Convertirse a sí mismo en Owner.
* Cambiar la propiedad de la organización.
* Modificar funciones exclusivas del Owner.

## Seller

Puede acceder únicamente a:

* Sus propias boletas.
* Sus propios clientes.
* Sus propias ventas.
* Sus propios pagos.
* Sus propios indicadores.

Un vendedor nunca puede acceder a la información de otro vendedor mediante:

* La interfaz.
* Modificación de URL.
* Manipulación de IDs.
* Requests directos.
* API.
* Cliente Supabase.

Esta regla debe protegerse con RLS y validaciones del servidor.

---

# 9. USUARIOS Y AUTENTICACIÓN

Los usuarios deben autenticarse mediante email y contraseña.

Cada usuario debe tener:

* Nombre.
* Alias opcional.
* Teléfono.
* Email.
* Rol.
* Organización.
* Estado activo o inactivo.
* Fecha de creación.

Owner y Admin pueden crear vendedores y administradores.

Debe existir un proceso seguro de:

* Invitación.
* Contraseña temporal.
* Recuperación de contraseña.
* Cambio de contraseña.

Un usuario inactivo no puede ingresar ni usar sesiones anteriores para continuar operando.

Después del login:

* Owner y Admin: `/owner/dashboard`
* Seller: `/seller/dashboard`

---

# 10. RIFAS

Debe existir la entidad `raffles`.

Campos mínimos:

* `id`
* `organization_id`
* `name`
* `description`
* `ticket_price`
* `currency`
* `start_date`
* `end_date`
* `status`
* `allow_seller_ticket_creation`
* `created_by`
* `created_at`
* `updated_at`

Estados:

* `draft`
* `active`
* `closed`
* `cancelled`

Reglas:

* Una organización puede tener varias rifas.
* Las boletas pertenecen a una rifa específica.
* Los reportes deben poder filtrarse por rifa.
* Una rifa nueva utiliza como valor predeterminado `$100.000 COP`.
* Owner o Admin puede definir un precio diferente para una futura rifa.
* El precio de boletas vendidas anteriormente no debe cambiar si se modifica el precio de la rifa.

---

# 11. VENDEDORES

Owner y Admin pueden crear vendedores con:

* Nombre.
* Alias.
* Teléfono.
* Email.
* Estado activo o inactivo.

Owner y Admin pueden:

* Consultar su información.
* Editar su información.
* Ver sus clientes.
* Ver sus boletas.
* Ver sus pagos.
* Ver sus saldos.
* Ver sus indicadores.
* Asignarles boletas.

---

# 12. CLIENTES

Cada cliente pertenece a:

* Una organización.
* Un vendedor.

Campos mínimos:

* `id`
* `organization_id`
* `seller_id`
* `name`
* `alias`
* `phone`
* `email`
* `notes`
* `created_at`
* `updated_at`
* `archived_at`

Reglas:

* Nombre obligatorio.
* Teléfono obligatorio.
* Alias opcional.
* Email opcional.
* Un vendedor puede reutilizar el cliente al vender nuevas boletas.
* Un cliente puede tener múltiples boletas.
* Un cliente no se comparte automáticamente entre vendedores.
* Los clientes con movimientos históricos deben archivarse en lugar de eliminarse físicamente.

Búsquedas:

* Nombre.
* Alias.
* Teléfono.
* Email.

El perfil de cliente debe mostrar:

* Información general.
* Boletas compradas.
* Fecha de compra de cada boleta.
* Precio de cada boleta.
* Total comprado.
* Total pagado.
* Saldo pendiente.
* Estado de pago.
* Historial de abonos y pagos.

---

# 13. BOLETAS

Cada boleta debe tener dos números:

* Número de premio diario.
* Número de premio semanal.

Campos mínimos de `tickets`:

* `id`
* `organization_id`
* `raffle_id`
* `seller_id`
* `client_id`
* `internal_code`
* `daily_number`
* `weekly_number`
* `sale_price`
* `inventory_status`
* `assigned_at`
* `sale_date`
* `created_by`
* `approved_by`
* `approved_at`
* `created_at`
* `updated_at`
* `cancelled_at`

## Reglas de numeración

Los campos `daily_number` y `weekly_number`:

* Se guardan como texto.
* Conservan ceros iniciales.
* Aceptan únicamente números.
* Deben tener entre 1 y 4 dígitos.
* Utilizan validación equivalente a `^\d{1,4}$`.

Ejemplos válidos:

* `1`
* `25`
* `007`
* `0000`
* `9999`

Ejemplos inválidos:

* Campo vacío para una boleta disponible.
* `12345`
* `12A4`
* `-123`
* `12.5`

## Unicidad

La combinación completa de:

* `daily_number`
* `weekly_number`

debe ser única dentro de toda la rifa.

La combinación no puede repetirse entre vendedores.

Debe existir una restricción de base de datos equivalente a:

```sql
UNIQUE (
  organization_id,
  raffle_id,
  daily_number,
  weekly_number
)
```

Una combinación puede repetirse en una rifa diferente.

Los números individuales sí pueden aparecer en combinaciones distintas.

Permitido:

* Diario `1234`, semanal `5678`.
* Diario `1234`, semanal `9999`.
* Diario `0001`, semanal `5678`.

No permitido dentro de la misma rifa:

* Dos boletas con diario `1234` y semanal `5678`.

Para este MVP, una combinación anulada tampoco puede reutilizarse dentro de la misma rifa.

## Estados de inventario

* `draft`
* `pending_approval`
* `available`
* `assigned`
* `cancelled`

Reglas:

* `draft`: faltan datos o la boleta aún no está lista.
* `pending_approval`: creada por un vendedor y esperando aprobación.
* `available`: completa, aprobada y sin cliente.
* `assigned`: asignada a un cliente.
* `cancelled`: anulada y no utilizable.

No se puede asignar una boleta:

* Incompleta.
* Pendiente de aprobación.
* Anulada.
* De otra rifa.
* De otro vendedor sin autorización administrativa.

---

# 14. PRECIO DE VENTA

El precio predeterminado de una boleta es:

`100000 COP`

Cuando una boleta se asigna o vende a un cliente:

* Copia el precio actual de la rifa a `sale_price`.
* Utiliza `sale_price` para calcular pagos y saldos.
* No modifiques `sale_price` si posteriormente cambia el precio de la rifa.

Una boleta vendida inicialmente por `$100.000` mantiene ese precio histórico.

---

# 15. CREACIÓN MASIVA DE BOLETAS

Owner y Admin pueden:

1. Seleccionar una rifa.
2. Seleccionar un vendedor.
3. Indicar una cantidad entre 1 y 1.000.
4. Generar esa cantidad de registros.
5. Completar el número diario y semanal.
6. Guardar parcialmente como borrador.
7. Completar los registros posteriormente.

La interfaz debe soportar hasta 1.000 registros mediante:

* Paginación.
* Virtualización.
* Edición eficiente.
* Guardado por lotes.
* Validación por fila.
* Indicadores de progreso.

No renderices 1.000 formularios completos e independientes de manera ineficiente.

Debes validar:

* Duplicados dentro del formulario.
* Duplicados existentes en la base de datos.
* Duplicados asignados a otros vendedores.
* Caracteres inválidos.
* Más de cuatro dígitos.

La validación debe ocurrir en:

* Cliente.
* Servidor.
* Base de datos.

Los errores deben mostrarse por fila.

---

# 16. CREACIÓN DE BOLETAS POR VENDEDORES

Cada rifa tiene la propiedad:

`allow_seller_ticket_creation`

Cuando está activada:

* El vendedor puede crear boletas.
* Puede indicar una cantidad.
* Puede ingresar los dos números.
* Las boletas quedan en `pending_approval`.
* Owner o Admin debe aprobarlas.
* Después de la aprobación quedan `available`.

Cuando está desactivada:

* El vendedor solo puede utilizar las boletas asignadas por Owner o Admin.

Si el vendedor no tiene boletas y la opción está activada, debe mostrarse una acción clara para crear boletas.

---

# 17. ASIGNACIÓN DE BOLETAS A CLIENTES

Una boleta puede tener un solo cliente activo.

Un cliente puede tener varias boletas.

Al asignar una boleta:

* La boleta debe estar disponible.
* Debe pertenecer al vendedor autenticado o existir autorización administrativa.
* Se registra `client_id`.
* Se registra `assigned_at`.
* Se registra `sale_date`.
* Se copia el precio de la rifa a `sale_price`.
* El estado cambia a `assigned`.

El vendedor debe poder:

* Seleccionar un cliente existente.
* Buscar un cliente.
* Crear un cliente durante la asignación.

Una boleta con pagos activos no puede cambiar de cliente.

Para cambiar el cliente deben anularse o corregirse primero los movimientos mediante un administrador.

---

# 18. PAGOS Y ABONOS

En esta fase del producto no existe pasarela de pagos.

Los vendedores registran manualmente los pagos recibidos.

Debe existir:

## Tabla `payments`

Campos mínimos:

* `id`
* `organization_id`
* `seller_id`
* `client_id`
* `total_amount`
* `payment_date`
* `payment_method`
* `notes`
* `created_by`
* `created_at`
* `voided_at`
* `voided_by`
* `void_reason`

## Tabla `payment_allocations`

Campos mínimos:

* `id`
* `payment_id`
* `ticket_id`
* `amount`
* `created_at`

Un pago puede distribuirse entre una o varias boletas.

La suma de `payment_allocations.amount` debe coincidir exactamente con `payments.total_amount`.

La creación de un pago y sus asignaciones debe ser atómica.

Si una parte falla, no debe guardarse ninguna.

No utilices únicamente operaciones secuenciales desde el navegador.

Implementa una transacción segura mediante PostgreSQL, RPC o una operación equivalente del servidor.

---

# 19. ESTADOS DE PAGO

El vendedor no selecciona manualmente el estado.

El sistema lo calcula usando asignaciones de pagos no anulados.

Para cada boleta:

* `paid_amount`: total abonado.
* `pending_amount`: `sale_price - paid_amount`.

Estados:

## Sin pagar

`paid_amount = 0`

## Abonada

`paid_amount > 0` y `paid_amount < sale_price`

## Pagada

`paid_amount = sale_price`

Para una boleta de `$100.000`:

* `$0`: Sin pagar.
* `$1` a `$99.999`: Abonada.
* `$100.000`: Pagada.
* Más de `$100.000`: bloquear operación.

No se permiten sobrepagos.

No se permiten pagos negativos o iguales a cero.

No se permiten pagos para boletas sin cliente.

---

# 20. HISTORIAL Y ANULACIONES

Cada abono debe permanecer en el historial.

Debe mostrar:

* Fecha.
* Valor.
* Cliente.
* Boleta.
* Vendedor que lo registró.
* Método.
* Notas.
* Estado activo o anulado.

Los pagos no se eliminan físicamente.

Owner o Admin puede anular un pago indicando:

* Motivo obligatorio.
* Usuario que anuló.
* Fecha de anulación.

Después de anular un pago:

* Sus asignaciones dejan de contar.
* Los saldos se recalculan.
* Los estados de pago se recalculan.
* La acción queda auditada.

El vendedor no puede anular pagos directamente.

---

# 21. PORTAL OWNER Y ADMIN

Rutas mínimas:

* `/owner/dashboard`
* `/owner/raffles`
* `/owner/users`
* `/owner/sellers`
* `/owner/tickets`
* `/owner/payments`
* `/owner/reports`

Funciones:

* Dashboard general.
* Gestión de rifas.
* Gestión de administradores.
* Gestión de vendedores.
* Creación masiva de boletas.
* Asignación de boletas.
* Aprobación de boletas.
* Consulta global de clientes.
* Consulta global de pagos.
* Anulación de pagos.
* Reportes.
* Filtros por rifa, vendedor, cliente, estado y fecha.

---

# 22. PORTAL SELLER

Rutas mínimas:

* `/seller/dashboard`
* `/seller/tickets`
* `/seller/clients`
* `/seller/payments`

Funciones:

* Consultar sus boletas.
* Buscar por número diario.
* Buscar por número semanal.
* Buscar por código.
* Filtrar por estado.
* Filtrar por cliente.
* Crear clientes.
* Editar clientes.
* Archivar clientes.
* Asignar boletas.
* Registrar abonos.
* Registrar pagos.
* Consultar historiales.
* Consultar saldos.
* Crear boletas cuando esté permitido.

---

# 23. DASHBOARDS

## Dashboard administrativo

Debe mostrar:

* Rifa activa.
* Vendedores activos.
* Total de boletas.
* Boletas disponibles.
* Boletas asignadas.
* Boletas pendientes de aprobación.
* Boletas sin pagar.
* Boletas abonadas.
* Boletas pagadas.
* Total vendido.
* Total recaudado.
* Saldo pendiente.
* Pagos recientes.
* Resumen por vendedor.

## Dashboard vendedor

Debe mostrar únicamente sus datos:

* Rifa activa.
* Total de boletas.
* Boletas disponibles.
* Boletas vendidas.
* Boletas sin pagar.
* Boletas abonadas.
* Boletas pagadas.
* Total vendido.
* Total recaudado.
* Saldo pendiente.
* Clientes recientes.
* Pagos recientes.

---

# 24. REPORTES

Reportes mínimos:

* Ventas por vendedor.
* Recaudo por vendedor.
* Saldo pendiente por vendedor.
* Boletas por estado.
* Clientes con saldo pendiente.
* Pagos por rango de fechas.
* Boletas por rifa.

Permite exportar a CSV las tablas principales.

No expongas datos de otros vendedores en reportes del portal Seller.

---

# 25. AUDITORÍA

Debe existir `audit_logs`.

Registra como mínimo:

* Creación de usuarios.
* Activación y desactivación.
* Creación y edición de rifas.
* Creación y edición de boletas.
* Cambio de números.
* Asignación de vendedor.
* Asignación de cliente.
* Aprobación de boletas.
* Anulación de boletas.
* Creación de pagos.
* Anulación de pagos.

Campos sugeridos:

* `organization_id`
* `user_id`
* `action`
* `entity_type`
* `entity_id`
* `old_values`
* `new_values`
* `created_at`
* IP cuando sea posible

---

# 26. SEGURIDAD

Reglas obligatorias:

* RLS activado en todas las tablas de negocio.
* El frontend no es una frontera de seguridad.
* Validar permisos en servidor y base de datos.
* Nunca exponer `SUPABASE_SERVICE_ROLE_KEY` al navegador.
* No almacenar secretos en Git.
* Usar variables de entorno.
* Validar todos los formularios.
* Validar todas las operaciones sensibles en servidor.
* Evitar acceso por identificadores manipulados.
* Evitar mass assignment.
* Proteger Server Actions y Route Handlers.
* Verificar organización y rol en cada operación sensible.
* Implementar restricciones de base de datos.
* Manejar errores sin exponer información sensible.

---

# 27. EXPERIENCIA DE USUARIO

La interfaz debe ser:

* Mobile-first.
* Responsive.
* Clara.
* Moderna.
* Accesible.
* Fácil de utilizar por vendedores desde teléfonos.

Utiliza:

* Sidebar en escritorio.
* Drawer o navegación compacta en móvil.
* Formularios simples.
* Buscadores visibles.
* Filtros fáciles de limpiar.
* Tablas responsivas.
* Tarjetas de métricas.
* Badges con texto.
* Estados vacíos.
* Skeletons.
* Toasts.
* Confirmaciones para acciones sensibles.
* Mensajes de error comprensibles.

No dependas únicamente del color.

Etiquetas en español:

* Borrador.
* Pendiente de aprobación.
* Disponible.
* Asignada.
* Anulada.
* Sin pagar.
* Abonada.
* Pagada.

Estas ocho etiquetas y su redacción exacta se definen una sola vez en `src/lib/constants.ts`
(`docs/ARCHITECTURE.md` §8.3). **Cualquier otro texto visible se redacta según §35.**

---

# 28. DOCUMENTACIÓN OBLIGATORIA

Mantén actualizados:

* `README.md`
* `CLAUDE.md`
* `docs/MASTER_SPEC.md`
* `docs/ARCHITECTURE.md`
* `docs/DATA_MODEL.md`
* `docs/BUSINESS_RULES.md`
* `docs/SECURITY.md`
* `docs/IMPLEMENTATION_PLAN.md`
* `docs/DECISIONS.md`
* `docs/PHASE_STATUS.md`
* `docs/KNOWN_ISSUES.md`
* `docs/TESTING.md`
* `docs/UX_COPY_GUIDELINES.md`
* `.env.example`

Nunca incluyas secretos reales.

---

# 29. CALIDAD DEL CÓDIGO

Debes:

* Utilizar TypeScript estricto.
* Evitar `any` salvo justificación documentada.
* Separar presentación y lógica de negocio.
* Crear componentes reutilizables.
* Evitar archivos excesivamente grandes.
* Evitar código duplicado.
* Utilizar nombres claros.
* Manejar estados de carga y error.
* Evitar consultas N+1.
* Crear índices para consultas frecuentes.
* Evitar cálculos financieros únicamente en frontend.
* Eliminar código muerto.
* Mantener imports limpios.
* No silenciar errores de TypeScript o lint sin justificación.

---

# 30. PRUEBAS MÍNIMAS DEL PROYECTO

El proyecto terminado debe comprobar:

1. Login y redirección por rol.
2. Bloqueo de usuarios inactivos.
3. Aislamiento entre organizaciones.
4. Aislamiento entre vendedores.
5. Creación de rifas.
6. Creación masiva de boletas.
7. Límite de cuatro dígitos.
8. Conservación de ceros iniciales.
9. Detección de combinaciones duplicadas.
10. Duplicados entre vendedores.
11. Asignación de boleta.
12. Creación de cliente.
13. Registro de abono.
14. Cambio a estado Abonada.
15. Cambio a estado Pagada.
16. Bloqueo de sobrepago.
17. Pago entre varias boletas.
18. Atomicidad de pagos.
19. Anulación de pago.
20. Recálculo de saldo.
21. Bloqueo de cambio de cliente con pagos.
22. Aprobación de boletas creadas por vendedor.
23. Restricciones de rifas cerradas.
24. RLS.
25. Protección de APIs y Server Actions.

---

# 31. FUNCIONALIDADES FUERA DEL MVP

No implementar todavía:

* Pagos en línea.
* Portal de clientes.
* Integración con loterías.
* Sorteos automáticos.
* Números ganadores.
* WhatsApp.
* SMS.
* Facturación electrónica.
* Comisiones de vendedores.
* Aplicación móvil nativa.
* Integraciones contables.

No construyas estas funciones durante las fases actuales.

---

# 32. DEFINICIÓN GENERAL DE TERMINADO

Una funcionalidad no está terminada únicamente porque la pantalla existe.

Debe incluir:

* Interfaz.
* Persistencia real.
* Validación.
* Autorización.
* Manejo de errores.
* Estados de carga.
* Pruebas apropiadas.
* Documentación.
* Compatibilidad responsive.
* Integridad de datos.

No reemplaces implementaciones reales con mocks.

Los seeds de desarrollo sí están permitidos.

---

# 33. ORDEN DE FASES

El proyecto se desarrolla en este orden:

* Fase 0: Arquitectura y planificación.
* Fase 1: Proyecto base y autenticación.
* Fase 2: Base de datos, restricciones y RLS.
* Fase 3: Portal Owner y Admin.
* Fase 4: Portal Seller y clientes.
* Fase 5: Pagos, abonos y saldos.
* Fase 6: Dashboards, reportes y UI/UX.
* Fase 7: Pruebas, seguridad y endurecimiento.
* Fase 8: Despliegue y documentación operativa.
* Fase 9: Auditoría final independiente.

Ejecuta solamente la fase autorizada en el prompt actual.

---

# 34. CONTINUIDAD ENTRE SESIONES

Cada fase puede ejecutarse desde una sesión o un computador distintos. La documentación es el único
puente entre ellas: si algo no está escrito, se pierde.

## 34.1 Al iniciar una sesión

Lee, en este orden:

1. `CLAUDE.md` (este archivo).
2. `docs/HANDOFF.md` — estado actual, arranque, credenciales, trampas conocidas.
3. `docs/PHASE_STATUS.md` — qué quedó hecho y qué revisar antes de empezar.

No leas el resto de `docs/` completo. Consulta cada documento solo cuando la tarea lo requiera,
según la guía de `docs/HANDOFF.md` §5. Leerlo todo cuesta unas 40.000 fichas y casi nunca aporta.

Antes de escribir código, verifica que el entorno está sano:

* `npx supabase start`
* `npm run db:reset && npm run seed:local`
* `npm run test:db`
* `npm run verify`

Si alguno falla, arréglalo antes de continuar: la documentación puede estar desactualizada, pero las
pruebas no mienten.

## 34.2 Al cerrar una fase

Actualiza **siempre**, aunque el cambio parezca menor:

* `docs/PHASE_STATUS.md` — sección nueva de la fase con los seis puntos obligatorios de §34.3.
* `docs/DECISIONS.md` — toda decisión no evidente, con su alternativa descartada y el porqué.
* `docs/KNOWN_ISSUES.md` — problemas, riesgos verificados y deuda técnica.
* `docs/TEST_RESULTS.md` — comandos ejecutados, resultados y errores encontrados.
* `docs/HANDOFF.md` — estado actual, comandos nuevos y trampas nuevas.
* Cualquier documento afectado: `DATA_MODEL.md` si cambió el esquema, `SECURITY.md` si cambió la
  autorización, `ARCHITECTURE.md` si cambiaron rutas o dependencias, `README.md` si cambió el uso.

Después: `npm run verify` y `npm run test:db` en verde, commit local y etiqueta `fase-N`.

## 34.3 Contenido obligatorio por fase en `docs/PHASE_STATUS.md`

1. **Funcionalidades implementadas.**
2. **Pruebas ejecutadas y sus resultados**, incluidos los errores encontrados y corregidos.
3. **Migraciones que existen**, con una línea de qué hace cada una.
4. **Variables de entorno requeridas.**
5. **Problemas reales que permanecen**, con su impacto.
6. **Qué debe revisar el siguiente agente antes de comenzar.**

## 34.4 Cómo escribir la documentación

* Tablas antes que prosa. Una línea por hecho.
* Sin repetir entre documentos: enlaza en lugar de duplicar.
* Cita los identificadores (`D-0xx`, `BR-xxx`, `I-0xx`) en el código y en los documentos, para que
  quien lea busque solo esa entrada y no el archivo entero.
* Registra los errores encontrados aunque se hayan corregido: un error documentado es información,
  uno omitido es una trampa para la siguiente sesión.
* Los documentos que crecen en cada fase (resultados de pruebas) van en su propio archivo, para que
  los normativos no se vuelvan ilegibles.

---

# 35. UX WRITING Y REDACCIÓN DE TEXTOS

La guía permanente de redacción es `docs/UX_COPY_GUIDELINES.md` y se importa aquí, de modo que está
cargada en toda sesión:

@docs/UX_COPY_GUIDELINES.md

## 35.1 Cuándo aplica

**Siempre que una tarea cree, modifique, revise o proponga un texto que un usuario pueda leer.** Eso
incluye, sin ser una lista cerrada:

* Recorridos guiados (product tours), popups y tooltips.
* Botones, enlaces y elementos de menú.
* Etiquetas, textos de ejemplo y ayudas de formulario.
* Mensajes de confirmación y advertencias.
* Mensajes de error, incluidos los que devuelven el servidor y la base de datos.
* Estados vacíos, alertas, mensajes de éxito e instrucciones.
* Encabezados, títulos de pantalla y descripciones.

Aplica igual a los **textos nuevos** y a los **textos existentes que se modifiquen**.

## 35.2 Reglas obligatorias

1. **Revisa antes de cerrar.** Ningún cambio de interfaz se considera terminado sin pasar la lista de
   comprobación de la §14 de la guía. Es parte de la definición de terminado (§32), no un extra.
2. **No reemplaces un texto existente sin entender su contexto**: en qué pantalla aparece, qué acción
   acompaña, qué rol lo lee y qué pasa si el usuario se equivoca. Un texto que suena mejor pero
   describe peor la acción es un retroceso.
3. **Un término, un nombre.** Antes de nombrar algo, consulta el glosario del Anexo A de la guía. Si
   hace falta un término nuevo, se añade primero al glosario.
4. **Si un texto solicitado contradice la guía**, prioriza en este orden: prevención de errores,
   facilidad de comprensión, claridad. Después señala la contradicción en una o dos frases y sigue
   adelante; no bloquees la tarea por esto.
5. **Las etiquetas de estado no se improvisan.** Las ocho de §27 viven en `src/lib/constants.ts`.
   Cambiar una es cambiar ese archivo.
6. **Esta guía es la fuente principal** en materia de redacción. Si otro documento del proyecto dice
   algo distinto sobre cómo escribir un texto, manda la guía y el otro documento se corrige.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
