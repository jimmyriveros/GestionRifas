-- =============================================================================
-- 0040_report_sales_by_date.sql
-- Agregado del reporte «Ventas por fecha» del portal del vendedor
--
-- Referencia normativa: docs/DECISIONS.md D-151, docs/BUSINESS_RULES.md BR-T05,
-- CLAUDE.md §24.
--
-- QUE CUENTA COMO VENTA, Y POR QUE NO SE INVENTA AQUI
--
-- La definicion no es nueva: es la MISMA que ya usan `v_seller_summary`,
-- `v_raffle_summary` y `v_client_balances` para decir «vendido», «recaudado» y
-- «saldo». Una boleta esta vendida cuando `inventory_status = 'assigned'`, y su
-- dinero es `sale_price` (el precio congelado al vender, BR-P03/BR-P07) contra
-- `paid_amount` (la columna que mantiene el disparador desde los pagos NO
-- anulados, BR-F07/BR-F08). Una boleta anulada no cuenta, exactamente igual que
-- en los totales que ya existen.
--
-- Lo unico propio de este reporte es la FECHA: se agrupa por `tickets.sale_date`
-- —el dia en que se vendio la boleta—, nunca por `created_at`, ni por
-- `assigned_at`, ni por `payments.payment_date`. De ahi sale el significado que
-- el reporte tiene que conservar: una boleta vendida el lunes y abonada el
-- martes pertenece a las ventas del LUNES, aunque el dinero entrara el martes.
-- El reporte «Pagos por fecha» (`0013`) responde a la otra pregunta y no se
-- toca.
--
-- POR QUE UNA FUNCION Y NO UNA VISTA NI UNA SUMA EN TYPESCRIPT
--
-- Por lo mismo que en `0013`: los cuatro indicadores tienen que ser EXACTOS
-- sobre todo el conjunto filtrado, no sobre la pagina visible. Sumarlos en el
-- servidor de aplicaciones exigiria traerse todas las boletas del rango, y
-- PostgREST corta cualquier respuesta en 1.000 filas sin devolver error
-- (I-011): con 1.001 ventas el total mostrado seria silenciosamente falso. Una
-- vista no sirve porque el rango es un PARAMETRO.
--
-- POR QUE ES `security invoker` Y NO ACEPTA VENDEDOR NI ORGANIZACION
--
-- Solo LEE, asi que no necesita ningun privilegio extra: se ejecuta con los
-- permisos de quien llama y la politica `tickets_select` se aplica intacta. Un
-- vendedor agrega SUS boletas y las de nadie mas, y no hace falta —ni se
-- permite— que el navegador diga de quien son: no hay `p_seller_id` ni
-- `p_organization_id` que manipular. Es la diferencia con `report_payment_totals`,
-- que si acepta vendedor porque el personal necesita acotar por vendedor; aqui
-- el reporte es del portal del vendedor y no tiene ese caso.
--
-- `set search_path = public, pg_temp` se mantiene aunque no sea definer: es la
-- regla 1 de docs/SECURITY.md §4.5 y cuesta nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- report_sales_totals — una sola fila con los cuatro indicadores del rango
--
-- LAS DOS FECHAS SON OBLIGATORIAS, Y NO ES UN CAPRICHO: ES LA DIFERENCIA ENTRE
-- 5 MS Y 67 MS
--
-- La primera version copiaba el patron de `report_payment_totals` (`0013`) y
-- escribia cada filtro como `(p_x is null or columna <op> p_x)`, para que un
-- parametro ausente significara «sin filtrar». Medido con 300.000 boletas, eso
-- convertia la funcion en un barrido de la tabla ENTERA, con indice o sin el:
--
--   con las guardas `is null` ....  67 ms · 8.374 buffers  (barrido)
--   sin ellas .....................  5,5 ms · 2.096 buffers (recorrido por indice)
--
-- El motivo es que un `OR` sobre un parametro no puede convertirse en una
-- condicion de indice: el planificador no puede saber que la rama de la derecha
-- se va a cumplir, asi que renuncia al indice y lee todo. No es la cache de
-- planes —se probo `plan_cache_mode = 'force_custom_plan'` y no cambia nada— y
-- tampoco se arregla con un indice mejor.
--
-- Quitarlas ademas describe mejor la realidad: la aplicacion SIEMPRE resuelve
-- las dos fechas antes de llamar (`resolveSalesDateRange`, D-151), asi que «sin
-- filtrar» no es un caso que este reporte tenga. Un parametro que nadie usa y
-- que cuesta un barrido de tabla no es flexibilidad, es una trampa.
--
-- `report_payment_totals` conserva sus guardas y NO se toca aqui: es otro
-- reporte, con otros indices y otros filtros opcionales de verdad (vendedor,
-- metodo, estado). Queda anotado por si algun dia se mide.
--
-- `pending_amount` se calcula como RESTA DE LAS DOS SUMAS, no como
-- `sum(sale_price - paid_amount)`. Las dos formas dan lo mismo mientras
-- `sale_price` no sea nulo —y en una boleta asignada no puede serlo, lo impide
-- `tickets_assigned_requires_sale` de 0002—, pero solo la primera garantiza la
-- identidad que la pantalla promete y que la prueba comprueba:
--
--     Total vendido - Abonado = Saldo pendiente
--
-- Con la segunda, un dato raro con `sale_price` nulo desapareceria de la resta
-- sin desaparecer de las otras dos sumas, y las tres cifras dejarian de cuadrar
-- entre si delante de quien las esta leyendo.
-- -----------------------------------------------------------------------------
create function report_sales_totals(
  p_date_from date,
  p_date_to   date
)
returns table (
  tickets_count  bigint,
  total_sold     bigint,
  paid_amount    bigint,
  pending_amount bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*)::bigint,
    coalesce(sum(t.sale_price), 0)::bigint,
    coalesce(sum(t.paid_amount), 0)::bigint,
    (coalesce(sum(t.sale_price), 0) - coalesce(sum(t.paid_amount), 0))::bigint
  from tickets t
  where t.inventory_status = 'assigned'
    and t.sale_date >= p_date_from
    and t.sale_date <= p_date_to;
$$;

comment on function report_sales_totals(date, date) is
  'Boletas vendidas, total vendido, abonado y saldo pendiente de un rango de sale_date (D-151). SECURITY INVOKER: hereda tickets_select, de modo que un vendedor solo agrega sus propias ventas.';

-- -----------------------------------------------------------------------------
-- Privilegios (regla 3 de docs/SECURITY.md §4.5)
--
-- PostgreSQL concede EXECUTE a PUBLIC en toda funcion nueva. Se revoca primero
-- y se concede despues solo a `authenticated`: `anon` no puede invocarla.
-- -----------------------------------------------------------------------------
revoke execute on function report_sales_totals(date, date) from public;
grant execute on function report_sales_totals(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- tickets_sale_date_idx — el orden y el rango del reporte, sin leer la tabla
--
-- NO SE ELIGIO POR INTUICION. Se cargo la base LOCAL con 300.000 boletas
-- vendidas —150.006 de un solo vendedor, repartidas en 1.096 dias— y se midio
-- cada consulta con `explain (analyze, buffers)` usando la sesion real de un
-- vendedor, mejor de 5 intentos. Se probaron TRES formas:
--
--                                  sin indice        A: (seller_id,          B: (sale_date desc,
--                                                        sale_date desc,        assigned_at desc)
--                                                        assigned_at desc)
--   Totales del dia .......  59,0 ms · 8.372     5,3 ms · 2.096      0,74 ms ·   290
--   Pagina del dia ........  57,2 ms · 8.378     5,3 ms · 2.096      0,46 ms ·    67
--   Totales de un mes .....  60,1 ms · 8.372     5,7 ms · 2.103      0,94 ms ·   297
--   Pagina de un mes ......  59,6 ms · 8.372     5,6 ms · 2.369      0,49 ms ·    67
--   Totales de un año .....  63,3 ms · 8.372    26,6 ms · 4.791     21,8 ms · 3.367
--   Pagina 5 de un año ....  72,5 ms · 8.372    72,5 ms · 8.372      0,58 ms ·   267
--
-- POR QUE NO EMPIEZA POR `seller_id`, QUE ES LO QUE PARECE OBVIO
--
-- Es la misma leccion de D-102, otra vez. La politica compara el vendedor
-- contra `(select current_profile_id())`, que es un parametro de ejecucion y no
-- un valor conocido al planificar: con `seller_id` delante, el planificador usa
-- el indice pero no puede acotar con el —2.096 buffers para devolver 137
-- filas—, y en el caso mas ancho (un año, pagina 5) lo descarta y vuelve al
-- barrido. Con `sale_date` delante, que es justamente la columna por la que se
-- filtra Y por la que se ordena, el recorrido ya viene ordenado, la RLS se
-- aplica como filtro sobre la marcha y la pagina 5 de un año se resuelve con
-- una *incremental sort* que se detiene en la fila 126: 72,5 ms -> 0,58 ms.
--
-- Se probo tambien una tercera forma, `(seller_id, sale_date desc,
-- assigned_at desc, id)`, por si meter el tercer criterio de orden dentro del
-- indice evitaba la ordenacion: sale PEOR que A en todo (2.748 buffers frente a
-- 2.096) y tampoco arregla la pagina 5 del año. Descartada.
--
-- LA CONDICION PARCIAL NO ES DECORATIVA. `where inventory_status = 'assigned'`
-- deja fuera un tercio de la tabla y, sobre todo, resuelve esa condicion al
-- PLANIFICAR: el indice ya solo contiene boletas vendidas, que es como este
-- reporte consulta siempre. Es la misma forma que `tickets_assigned_at_idx`
-- (0030), y por la misma razon.
--
-- COSTE. 9,3 MB con 300.000 boletas, en la tabla que mas escribe. Se acepta a
-- cambio de que la pantalla de Reportes del vendedor pase de 59 ms a 0,74 ms en
-- su caso normal —el dia de hoy— sin leer la tabla entera en cada carga.
-- -----------------------------------------------------------------------------
create index tickets_sale_date_idx
  on tickets (sale_date desc, assigned_at desc)
  where inventory_status = 'assigned';

comment on index tickets_sale_date_idx is
  'Rango y orden del reporte «Ventas por fecha» (sale_date desc, assigned_at desc). Parcial sobre las boletas vendidas. NO empieza por seller_id a proposito: medido, es peor (D-151, misma leccion que D-102).';

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop index tickets_sale_date_idx;
-- drop function report_sales_totals(date, date);
--
-- Revertir NO cambia ningun dato ni ningun permiso: deja sin agregado al
-- reporte «Ventas por fecha» —que es lo unico que llama a la funcion— y
-- devuelve los planes lentos. Nada mas depende de este indice.
-- =============================================================================
