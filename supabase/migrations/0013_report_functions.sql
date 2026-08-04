-- =============================================================================
-- 0013_report_functions.sql
-- Fase 6 — Agregados de cobranza para el reporte «Pagos por rango de fechas»
--
-- Referencia normativa: CLAUDE.md §24, docs/BUSINESS_RULES.md BR-F13,
-- docs/DECISIONS.md D-055.
--
-- POR QUE NO BASTA CON `v_payment_history`
--
-- El reporte necesita DOS cosas que una vista no puede dar por si sola:
--
--   1. Totales EXACTOS del rango filtrado. Sumarlos en TypeScript exigiria
--      traerse todos los pagos, y PostgREST corta cualquier respuesta en 1.000
--      filas (I-011): con 1.001 pagos el total mostrado seria silenciosamente
--      falso. En un sistema de cobranza eso es inaceptable.
--   2. Un desglose por dia. Una vista tendria que agrupar tambien por vendedor,
--      metodo y estado para que esas columnas siguieran siendo filtrables, y la
--      cardinalidad resultante (dias x vendedores x 3 metodos x 2 estados)
--      vuelve a superar el limite de 1.000 filas.
--
-- Una funcion parametrizada resuelve ambas: filtra ANTES de agregar, agrega en
-- SQL y devuelve una cardinalidad acotada por el numero de dias del rango.
--
-- POR QUE SON `security invoker` Y NO `security definer`
--
-- Al reves que las RPC de 0007 —que existen precisamente para ejecutar
-- operaciones que la RLS del usuario prohibe—, estas funciones solo LEEN. No
-- necesitan ningun privilegio extra, asi que se dejan como SECURITY INVOKER
-- (el valor por defecto, aqui explicito para que se lea sin ambiguedad): se
-- ejecutan con los permisos de quien llama y por tanto la politica
-- `payments_select` se aplica intacta. Consecuencia directa: un vendedor
-- obtiene los totales de SUS pagos y de ningun otro, sin que estas funciones
-- tengan que filtrar por `seller_id` para protegerse (CLAUDE.md §24: «No
-- expongas datos de otros vendedores en reportes del portal Seller»).
--
-- El parametro `p_seller_id` existe solo para que el PERSONAL pueda acotar el
-- reporte a un vendedor concreto. No es un control de seguridad: si un vendedor
-- pasara el id de otro, la RLS devolveria cero filas igualmente.
--
-- `set search_path = public, pg_temp` se mantiene aunque no sean definer: es la
-- regla 1 de docs/SECURITY.md §4.5 y cuesta nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- report_payment_totals — una sola fila con los totales del rango
--
-- Separa lo vigente de lo anulado: un pago anulado permanece en el historial
-- (BR-F09) pero NO cuenta como recaudo. Mostrar ambos numeros evita la pregunta
-- «¿por que el total no cuadra con la suma de la tabla?».
-- -----------------------------------------------------------------------------
create function report_payment_totals(
  p_date_from date default null,
  p_date_to   date default null,
  p_seller_id uuid default null,
  p_method    payment_method default null,
  p_status    text default null
)
returns table (
  payments_count bigint,
  total_amount   bigint,
  active_count   bigint,
  active_amount  bigint,
  voided_count   bigint,
  voided_amount  bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*)::bigint,
    coalesce(sum(p.total_amount), 0)::bigint,
    count(*) filter (where p.voided_at is null)::bigint,
    coalesce(sum(p.total_amount) filter (where p.voided_at is null), 0)::bigint,
    count(*) filter (where p.voided_at is not null)::bigint,
    coalesce(sum(p.total_amount) filter (where p.voided_at is not null), 0)::bigint
  from payments p
  where (p_date_from is null or p.payment_date >= p_date_from)
    and (p_date_to   is null or p.payment_date <= p_date_to)
    and (p_seller_id is null or p.seller_id     = p_seller_id)
    and (p_method    is null or p.payment_method = p_method)
    and (p_status is null
         or (p_status = 'active' and p.voided_at is null)
         or (p_status = 'voided' and p.voided_at is not null));
$$;

comment on function report_payment_totals(date, date, uuid, payment_method, text) is
  'Totales exactos de pagos del rango filtrado, calculados en SQL (CLAUDE.md §24). SECURITY INVOKER: hereda payments_select, de modo que un vendedor solo agrega sus propios pagos.';

-- -----------------------------------------------------------------------------
-- report_payments_by_day — desglose diario del mismo rango
--
-- Una fila por dia calendario de Bogota (`payments.payment_date` ya es un dia,
-- no un instante: ver 0002). La cardinalidad la acota el rango pedido.
-- -----------------------------------------------------------------------------
create function report_payments_by_day(
  p_date_from date default null,
  p_date_to   date default null,
  p_seller_id uuid default null,
  p_method    payment_method default null,
  p_status    text default null
)
returns table (
  payment_date   date,
  payments_count bigint,
  total_amount   bigint,
  active_amount  bigint,
  voided_amount  bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.payment_date,
    count(*)::bigint,
    coalesce(sum(p.total_amount), 0)::bigint,
    coalesce(sum(p.total_amount) filter (where p.voided_at is null), 0)::bigint,
    coalesce(sum(p.total_amount) filter (where p.voided_at is not null), 0)::bigint
  from payments p
  where (p_date_from is null or p.payment_date >= p_date_from)
    and (p_date_to   is null or p.payment_date <= p_date_to)
    and (p_seller_id is null or p.seller_id     = p_seller_id)
    and (p_method    is null or p.payment_method = p_method)
    and (p_status is null
         or (p_status = 'active' and p.voided_at is null)
         or (p_status = 'voided' and p.voided_at is not null))
  group by p.payment_date
  order by p.payment_date desc;
$$;

comment on function report_payments_by_day(date, date, uuid, payment_method, text) is
  'Recaudo agrupado por dia para el reporte de pagos por rango de fechas (CLAUDE.md §24). SECURITY INVOKER: hereda payments_select.';

-- -----------------------------------------------------------------------------
-- Privilegios (regla 3 de docs/SECURITY.md §4.5)
--
-- PostgreSQL concede EXECUTE a PUBLIC en toda funcion nueva. Se revoca primero
-- y se concede despues solo a `authenticated`: `anon` no puede invocarlas.
-- -----------------------------------------------------------------------------
revoke execute on function report_payment_totals(date, date, uuid, payment_method, text) from public;
revoke execute on function report_payments_by_day(date, date, uuid, payment_method, text) from public;

grant execute on function report_payment_totals(date, date, uuid, payment_method, text) to authenticated;
grant execute on function report_payments_by_day(date, date, uuid, payment_method, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Indices: no hace falta ninguno nuevo.
--
-- 0003 ya creo los dos que estos reportes necesitan:
--   payments_org_date_active_idx (organization_id, payment_date desc)
--   payments_seller_date_idx     (seller_id, payment_date desc)
-- que cubren respectivamente el filtro del portal administrativo y el del
-- portal Seller (donde la RLS acota por `seller_id`).
-- -----------------------------------------------------------------------------

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function report_payments_by_day(date, date, uuid, payment_method, text);
-- drop function report_payment_totals(date, date, uuid, payment_method, text);
-- =============================================================================
