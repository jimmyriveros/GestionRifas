-- =============================================================================
-- 0030_read_performance.sql
-- Las pantallas que mas se abren dejan de leer la tabla entera
--
-- Referencia normativa: docs/DECISIONS.md D-102, docs/KNOWN_ISSUES.md I-062.
--
-- QUE RESUELVE, Y CON QUE EVIDENCIA
--
-- Se cargo una base LOCAL con el volumen que el negocio espera alcanzar
-- —100.000 clientes, 300.000 boletas, 1.000.000 de abonos— y se midio cada
-- pantalla con `explain (analyze, buffers)` usando la sesion real de un Dueño.
-- Cuatro consultas resultaron ser barridos completos de la tabla mas grande:
--
--   listado de boletas, pagina 1 ......  720 ms   (seq scan de 300.000 + sort)
--   listado de pagos, pagina 1 ........  872 ms   (join de 1.000.000 + sort)
--   listado de clientes, pagina 1 .....  429 ms   (agregado de 100.000, 35 MB
--                                                  de ordenacion en disco)
--   recuento de comision (por abono) ..   12 ms   (5.015 buffers por abono)
--
-- Las cuatro tienen la MISMA causa: se ordena o se agrega sobre la tabla
-- completa y solo despues se recortan 25 filas. Con treinta boletas eso no se
-- nota; con trescientas mil, es todo el tiempo de la pantalla.
--
-- LO QUE NO CAMBIA
--
-- Ni una regla de negocio, ni una politica de RLS, ni una columna, ni un
-- resultado. Cuatro indices nuevos y una vista reescrita para que devuelva
-- EXACTAMENTE las mismas filas con los mismos valores. Lo comprueban las
-- pruebas de `tests/db` que ya existian (512) mas las de esta migracion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. tickets — ordenar por fecha sin leer la tabla
--
-- `listTickets` ordena SIEMPRE por `created_at desc` y se queda con 25 filas.
-- Ninguno de los indices de 0003 empieza por `created_at`, asi que PostgreSQL
-- leia las 300.000 boletas y las ordenaba para descartar 299.975.
--
-- POR QUE EL INDICE NO LLEVA `organization_id` DELANTE
--
-- Se probaron las dos formas. Con `(organization_id, created_at desc)` el
-- planificador NO puede usarlo para ordenar: la politica compara la columna
-- contra un CONJUNTO (`organization_id in (select current_org_ids())`), y un
-- indice compuesto solo conserva el orden cuando la primera columna esta fijada
-- a un valor. Medido: seguia siendo un seq scan de 120 ms.
--
-- Con `(created_at desc)` a secas, el recorrido ya viene ordenado y la RLS se
-- aplica como filtro sobre la marcha: 2 ms. Un vendedor recorre unas pocas
-- filas de mas hasta juntar su pagina —las de sus companeros— y eso es
-- despreciable frente a leer la tabla entera.
-- -----------------------------------------------------------------------------
create index tickets_created_at_idx on tickets (created_at desc);

comment on index tickets_created_at_idx is
  'Orden por defecto del listado de boletas (created_at desc). Sin el, cada pagina lee la tabla entera (D-102).';

-- -----------------------------------------------------------------------------
-- 2. tickets — «ventas recientes» del panel
--
-- La consulta es `where inventory_status = 'assigned' order by assigned_at desc
-- limit 5`. Sin indice, PostgreSQL recogia las 200.000 boletas vendidas y las
-- ordenaba enteras para quedarse con cinco (77 ms).
--
-- LA CONDICION VA EN EL `where` DEL INDICE, NO EN SUS COLUMNAS
--
-- Se probaron las dos formas. Con `(inventory_status, assigned_at desc)` el
-- planificador seguia prefiriendo un mapa de bits y ordenando despues. Con el
-- indice PARCIAL, la condicion se resuelve al planificar —el indice ya SOLO
-- contiene boletas vendidas— y lo que queda es un recorrido ya ordenado que se
-- detiene en la quinta fila: 1,6 ms.
-- -----------------------------------------------------------------------------
create index tickets_assigned_at_idx
  on tickets (assigned_at desc)
  where inventory_status = 'assigned';

comment on index tickets_assigned_at_idx is
  'Ventas recientes del panel (assigned_at desc). Parcial sobre las boletas vendidas, que es como se consulta siempre (D-102).';

-- -----------------------------------------------------------------------------
-- 3. payments — ordenar el historial sin juntarlo entero
--
-- `v_payment_history` cruza pagos con el cliente y con tres perfiles. Con
-- 1.000.000 de pagos, PostgreSQL hacia los cuatro cruces sobre el millon de
-- filas y ORDENABA despues, para quedarse con 25.
--
-- El indice de 0003 (`payments_org_date_active_idx`) no servia por dos motivos
-- a la vez: es PARCIAL (`where voided_at is null`, y el listado sin filtro de
-- estado tambien muestra los anulados) y empieza por `organization_id`, que
-- otra vez es una comparacion contra un conjunto. No se toca: sigue siendo el
-- bueno para «pagos vigentes de la organizacion por fecha».
--
-- Con este, el plan pasa a ser recorrido ordenado por fecha -> 25 filas ->
-- cruces solo para esas 25. Medido: 872 ms -> 9 ms.
-- -----------------------------------------------------------------------------
create index payments_date_created_idx on payments (payment_date desc, created_at desc);

comment on index payments_date_created_idx is
  'Orden del historial de pagos (payment_date desc, created_at desc), incluidos los anulados (D-102).';

-- -----------------------------------------------------------------------------
-- 4. clients — orden alfabetico de la cartera activa
--
-- El listado de clientes ordena por nombre y oculta los archivados. Sin indice,
-- cada pagina ordenaba 100.000 nombres. Parcial por `archived_at is null`
-- porque es la vista por defecto de las dos pantallas; pedir los archivados es
-- la excepcion y puede permitirse el orden en memoria.
-- -----------------------------------------------------------------------------
create index clients_name_active_idx
  on clients (name)
  where archived_at is null;

comment on index clients_name_active_idx is
  'Orden alfabetico del listado de clientes activos (D-102).';

-- -----------------------------------------------------------------------------
-- 5. clients — «clientes recientes» del panel
-- -----------------------------------------------------------------------------
create index clients_created_at_idx
  on clients (created_at desc)
  where archived_at is null;

comment on index clients_created_at_idx is
  'Clientes recientes del panel (created_at desc), solo los activos (D-102).';

-- -----------------------------------------------------------------------------
-- 6. tickets — el recuento que corre en CADA abono
--
-- `recalc_seller_commission` (0024) cuenta las boletas cobradas de un vendedor
-- en una rifa cada vez que cambia `paid_amount`, `sale_price`,
-- `inventory_status`, `seller_id` o `raffle_id`. Es decir: en cada abono, en
-- cada venta, en cada anulacion y en cada fila de una accion masiva.
--
-- Ese recuento no tenia un indice que lo cubriera y acababa leyendo las filas
-- de la tabla. Medido sobre un vendedor con 10.000 boletas vendidas:
--
--   sin indice ..... 12,0 ms y 5.015 buffers
--   con indice .....  0,96 ms y     16 buffers
--
-- El orden de las columnas es el del `where` de la funcion y termina en
-- `payment_status`, que es lo que permite un *index only scan*: PostgreSQL
-- cuenta sin tocar la tabla. La condicion parcial repite la del `where`.
--
-- Es un indice mas que mantener en la tabla que mas escribe. Compensa: la
-- escritura que lo actualiza es exactamente la que dispara el recuento que
-- ahorra once milisegundos.
-- -----------------------------------------------------------------------------
create index tickets_commission_count_idx
  on tickets (seller_id, raffle_id, payment_status)
  where inventory_status = 'assigned';

comment on index tickets_commission_count_idx is
  'Recuento de boletas cobradas por vendedor y rifa que hace recalc_seller_commission en cada abono (D-102).';

-- =============================================================================
-- 7. v_client_balances — agregar 25 clientes en vez de 100.000
--
-- LA VERSION ANTERIOR
--
--   from clients c left join tickets t on t.client_id = c.id
--   group by c.id
--
-- Para devolver la primera pagina, PostgreSQL tenia que cruzar las 100.000
-- fichas con las 300.000 boletas, agrupar las 200.000 filas resultantes
-- —35 MB de ordenacion EN DISCO— y solo entonces quedarse con 25.
--
-- LA VERSION NUEVA
--
--   from clients c left join lateral (select ... from tickets t
--                                     where t.client_id = c.id ...) b on true
--
-- Es la MISMA cuenta escrita de otra forma: por cada cliente, sus boletas
-- vendidas. La diferencia esta en que ahora el agregado depende de la fila de
-- `clients`, asi que el planificador puede ordenar y recortar PRIMERO —con el
-- indice de arriba— y calcular los saldos solo de los 25 que sobreviven. Cada
-- uno de esos calculos entra por `tickets_client_idx` (0003).
--
-- Medido:
--   pagina 1 del listado ....  429 ms -> 3,5 ms
--   `count(*)` del listado ...  191 ms -> 27 ms   (el `left join lateral` no
--                                                  puede anadir ni quitar
--                                                  filas, asi que para contar
--                                                  ni siquiera se ejecuta)
--   busqueda por nombre .....  190 ms -> 29 ms
--
-- LAS FILAS Y LOS VALORES SON LOS MISMOS
--
--   * `left join lateral ... on true` conserva TODOS los clientes, tambien los
--     que no tienen ninguna boleta, igual que el `left join` anterior.
--   * La subconsulta es un agregado sin `group by`: devuelve siempre una fila,
--     con `count = 0` y las sumas en `NULL`, que el `coalesce` convierte en 0.
--     Es exactamente lo que producian los `filter (where ...)` de antes.
--   * El filtro `inventory_status = 'assigned'` pasa del `filter` al `where`
--     de la subconsulta: mismo conjunto de boletas (las anuladas no deben
--     dinero, BR-C09).
--   * Los tipos de las cuatro columnas no cambian (`bigint`), asi que los
--     tipos generados de la aplicacion siguen valiendo tal cual.
--
-- `security_invoker` hay que volver a declararlo: `create or replace view` no
-- conserva las opciones de la vista anterior, y perderlo la dejaria
-- ejecutandose con los permisos de su dueno —es decir, sin RLS— (misma nota
-- que en 0017).
-- =============================================================================
create or replace view v_client_balances
with (security_invoker = true) as
select
  c.id                as client_id,
  c.organization_id,
  c.seller_id,
  c.name,
  c.alias,
  c.phone,
  c.email,
  c.archived_at,
  saldo.tickets_count,
  saldo.total_purchased,
  saldo.total_paid,
  saldo.pending_amount,
  c.search_text
from clients c
left join lateral (
  select
    count(t.id)                                            as tickets_count,
    coalesce(sum(t.sale_price), 0)::bigint                 as total_purchased,
    coalesce(sum(t.paid_amount), 0)::bigint                as total_paid,
    coalesce(sum(t.sale_price - t.paid_amount), 0)::bigint as pending_amount
  from tickets t
  where t.client_id = c.id
    and t.inventory_status = 'assigned'
) saldo on true;

comment on view v_client_balances is 'Total comprado, pagado y saldo por cliente. Solo cuenta boletas asignadas (las anuladas no deben dinero).';

-- =============================================================================
-- 8. v_payment_history — el cliente se cruza con `left join`, como los perfiles
--
-- La vista cruzaba `payments` con `clients` con un `join` INTERNO y con
-- `profiles` con `left join`. Ese cruce interno tiene dos consecuencias, una de
-- correccion y otra de rendimiento, y las dos se arreglan igual.
--
-- CORRECCION (el mismo razonamiento de I-015)
--
-- Un `join` interno bajo RLS no oculta un NOMBRE: borra la FILA ENTERA. Si
-- alguna vez quien consulta pudiera ver un pago pero no su cliente, el pago
-- desapareceria del historial sin que nada avisara —y un historial de dinero
-- que omite pagos en silencio es peor que uno con un hueco donde va un nombre—.
-- Hoy no puede ocurrir (`payments_client_org_fk` y `payments_client_seller_fk`
-- atan el pago y el cliente a la misma organizacion y al mismo vendedor, y las
-- dos politicas son simetricas), asi que el cambio NO altera ni una fila. Lo
-- que hace es que deje de depender de esa coincidencia.
--
-- RENDIMIENTO
--
-- Contar el historial —lo que hace la paginacion en cada carga— obligaba a
-- cruzar el millon de pagos con los cien mil clientes, porque un `join` interno
-- SI puede quitar filas y por tanto no se puede omitir al contar. Con
-- `left join`, PostgreSQL sabe que el cruce no cambia el numero de filas y lo
-- elimina del plan: 394 ms -> 231 ms.
--
-- Lo demas de la vista queda EXACTAMENTE igual, incluido el `join` interno
-- contra `tickets` de la subconsulta de asignaciones —ahi si es la condicion de
-- busqueda, no un adorno— y `security_invoker`, que hay que volver a declarar.
-- =============================================================================
create or replace view v_payment_history
with (security_invoker = true) as
select
  p.id              as payment_id,
  p.organization_id,
  p.seller_id,
  p.client_id,
  c.name            as client_name,
  seller.full_name  as seller_name,
  p.total_amount,
  p.payment_date,
  p.payment_method,
  p.notes,
  p.created_at,
  p.created_by,
  creator.full_name as created_by_name,
  p.voided_at,
  p.voided_by,
  voider.full_name  as voided_by_name,
  p.void_reason,
  (p.voided_at is null) as is_active,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'ticket_id',     pa.ticket_id,
             'internal_code', t.internal_code,
             'daily_number',  t.daily_number,
             'weekly_number', t.weekly_number,
             'amount',        pa.amount)
           order by t.internal_code)
    from payment_allocations pa
    join tickets t on t.id = pa.ticket_id
    where pa.payment_id = p.id
  ), '[]'::jsonb) as allocations
from payments p
left join clients c        on c.id = p.client_id
left join profiles seller  on seller.id = p.seller_id
left join profiles creator on creator.id = p.created_by
left join profiles voider  on voider.id = p.voided_by;

comment on view v_payment_history is 'Historial de pagos con cliente, vendedor, metodo, estado y detalle de asignaciones (BR-F13). Los nombres se cruzan con left join: pueden faltar, el pago no (I-015).';

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   drop index tickets_commission_count_idx;
--   drop index clients_created_at_idx;
--   drop index clients_name_active_idx;
--   drop index payments_date_created_idx;
--   drop index tickets_assigned_at_idx;
--   drop index tickets_created_at_idx;
--
-- y volver a ejecutar el `create or replace view v_client_balances` de 0017
-- (el que agrupa con `group by c.id`) y el `create view v_payment_history` de
-- 0008 (el del `join clients` interno), sin olvidar en ninguno de los dos
-- `with (security_invoker = true)`.
--
-- Revertir NO cambia ningun dato ni ningun permiso: solo devuelve los planes
-- lentos. Nada de la aplicacion depende de que estos indices existan.
-- =============================================================================
