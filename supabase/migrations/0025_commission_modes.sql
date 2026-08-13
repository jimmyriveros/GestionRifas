-- =============================================================================
-- 0025_commission_modes.sql
-- Comisiones: DOS formas de pago, no una
--
-- Referencia: docs/BUSINESS_RULES.md BR-G13..BR-G16, docs/DECISIONS.md D-096.
--
-- QUE CAMBIA Y POR QUE
--
-- `0024` asumio que todos los vendedores cobran por la tabla de tramos. El dueño
-- del producto lo corrigio al ver la pantalla en produccion: los tramos son de
-- quien fue creado DENTRO de un equipo. Quien no depende de nadie —el vendedor
-- que trabaja para el Dueño, y tambien el que arma un equipo— cobra distinto:
--
--   parent_seller_id NO nulo -> tramos       1–20 $20.000 · 21–30 $25.000 ·
--                                            31–50 $30.000 · 51+ $40.000
--   parent_seller_id nulo    -> LA MITAD del precio vigente de la rifa,
--                               por cada boleta cobrada por completo
--
-- Que el jefe de equipo se quede en la mitad es deliberado: si al agregar a su
-- primer integrante pasara a tramos, su pago por boleta caeria de $50.000 a
-- $20.000 y armar equipo lo castigaria.
--
-- «EL PRECIO VIGENTE», NO EL CONGELADO
--
-- Decision explicita del dueño. La comision usa `raffles.ticket_price` de hoy,
-- no el `sale_price` que la boleta guardo al venderse (BR-P04). Consecuencia
-- REAL y buscada: cambiar el precio de la rifa cambia lo que se debe por ventas
-- ya cobradas. Por eso esta migracion agrega un trigger sobre `raffles`: sin el,
-- el precio cambiaria y las comisiones se quedarian con el importe viejo.
--
-- LO QUE NO CAMBIA
--
-- El motor sigue siendo el mismo y por el mismo motivo (D-094): el importe es
-- `n × tarifa`, recalculado, nunca una suma de eventos. Lo unico que cambia es
-- de donde sale `tarifa`. El ledger, el bloqueo de fila, la idempotencia y la
-- invariante `sum(ledger) = earned` siguen exactamente igual.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- commission_rate_for_seller — cuanto vale cada boleta para ESTE vendedor
--
-- Un solo sitio decide la forma de pago. Las dos ramas devuelven una tarifa por
-- boleta, asi que todo lo que ya existia sigue sirviendo sin tocarlo.
-- -----------------------------------------------------------------------------
create function commission_rate_for_seller(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_seller_id       uuid,
  p_count           integer
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_por_tramos boolean;
  v_precio     bigint;
begin
  -- Sin boletas cobradas no hay tarifa que aplicar, igual que en 0024: asi la
  -- fila no muestra «$50.000 por boleta» junto a un cero.
  if p_count is null or p_count <= 0 then
    return 0;
  end if;

  select m.parent_seller_id is not null
    into v_por_tramos
  from memberships m
  where m.profile_id = p_seller_id
    and m.organization_id = p_organization_id;

  if v_por_tramos is null then
    return 0;  -- no es miembro de la organizacion
  end if;

  if v_por_tramos then
    return commission_rate_for(p_organization_id, p_count);
  end if;

  -- La mitad del precio VIGENTE de la rifa. Division entera sobre bigint: con
  -- un precio impar se trunca el peso suelto, que es lo mismo que hace el resto
  -- del sistema con el dinero (BR-P02, nunca punto flotante).
  select r.ticket_price / 2 into v_precio from raffles r where r.id = p_raffle_id;
  return coalesce(v_precio, 0);
end;
$$;

comment on function commission_rate_for_seller is
  'Tarifa por boleta cobrada segun la forma de pago del vendedor: tramos si pertenece a un equipo, mitad del precio vigente de la rifa si no (BR-G13).';

revoke execute on function commission_rate_for_seller(uuid, uuid, uuid, integer) from anon, public;

-- -----------------------------------------------------------------------------
-- El motor, con la tarifa nueva. Todo lo demas es identico a 0024.
-- -----------------------------------------------------------------------------
create or replace function recalc_seller_commission(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_seller_id       uuid,
  p_movement        commission_movement default null,
  p_ticket_id       uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n_before      integer;
  v_rate_before   bigint;
  v_earned_before bigint;
  v_n_after       integer;
  v_rate_after    bigint;
  v_earned_after  bigint;
  v_delta         integer;
  v_movement      commission_movement;
begin
  if p_seller_id is null or p_raffle_id is null then
    return;
  end if;

  insert into seller_commissions (organization_id, raffle_id, seller_id)
  values (p_organization_id, p_raffle_id, p_seller_id)
  on conflict (raffle_id, seller_id) do nothing;

  select tickets_paid, rate, earned
    into v_n_before, v_rate_before, v_earned_before
  from seller_commissions
  where raffle_id = p_raffle_id and seller_id = p_seller_id
  for update;

  select count(*)::integer into v_n_after
  from tickets t
  where t.raffle_id = p_raffle_id
    and t.seller_id = p_seller_id
    and t.inventory_status = 'assigned'
    and t.payment_status = 'paid';

  -- LA UNICA LINEA QUE CAMBIA respecto a 0024.
  v_rate_after := commission_rate_for_seller(
    p_organization_id, p_raffle_id, p_seller_id, v_n_after
  );
  v_earned_after := v_n_after::bigint * v_rate_after;

  if v_earned_after = v_earned_before and v_n_after = v_n_before then
    return;
  end if;

  v_delta := v_n_after - v_n_before;

  if v_delta <> 0 then
    v_movement := coalesce(
      p_movement,
      case when v_delta > 0 then 'sale'::commission_movement
           else 'sale_reverted'::commission_movement
      end
    );

    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id, v_movement,
      v_delta::bigint * v_rate_after, v_n_after, v_rate_after, p_ticket_id
    );
  end if;

  -- Ajuste retroactivo por cambio de TARIFA. En el modo por tramos es subir o
  -- bajar de nivel; en el modo de la mitad, un cambio de precio de la rifa o
  -- una entrada/salida de equipo. El movimiento se llama `tier_adjustment` en
  -- los dos casos: significa «la tarifa cambio, se ajustan las anteriores».
  if v_rate_after <> v_rate_before and v_n_before > 0 then
    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id, 'tier_adjustment',
      v_n_before::bigint * (v_rate_after - v_rate_before),
      v_n_after, v_rate_after, p_ticket_id
    );
  end if;

  update seller_commissions
     set tickets_paid = v_n_after,
         rate = v_rate_after,
         earned = v_earned_after,
         updated_at = now()
   where raffle_id = p_raffle_id and seller_id = p_seller_id;
end;
$$;

-- =============================================================================
-- Dos hechos nuevos que ahora mueven dinero
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Cambia el precio de la rifa
--
-- Con la comision atada al precio VIGENTE, subir o bajar el precio cambia lo que
-- se debe por las boletas ya cobradas. Sin este trigger, el importe se quedaria
-- con la tarifa vieja hasta la siguiente venta de cada vendedor —y nadie se
-- enteraria—.
-- -----------------------------------------------------------------------------
create function raffles_sync_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila record;
begin
  if new.ticket_price is not distinct from old.ticket_price then
    return null;
  end if;

  for v_fila in
    select seller_id from seller_commissions where raffle_id = new.id
  loop
    perform recalc_seller_commission(new.organization_id, new.id, v_fila.seller_id);
  end loop;

  return null;
end;
$$;

create trigger raffles_sync_commission
  after update of ticket_price on raffles
  for each row execute function raffles_sync_commission();

revoke execute on function raffles_sync_commission() from anon, public;

-- -----------------------------------------------------------------------------
-- 2. Un vendedor entra o sale de un equipo
--
-- Es un cambio de FORMA DE PAGO: de la mitad del precio a tramos, o al reves.
-- Solo el personal puede moverlo (BR-E06), pero cuando ocurre hay que recalcular
-- todas sus rifas, no esperar a su proxima venta.
-- -----------------------------------------------------------------------------
create function memberships_sync_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila record;
begin
  if new.parent_seller_id is not distinct from old.parent_seller_id then
    return null;
  end if;

  for v_fila in
    select raffle_id from seller_commissions where seller_id = new.profile_id
  loop
    perform recalc_seller_commission(new.organization_id, v_fila.raffle_id, new.profile_id);
  end loop;

  return null;
end;
$$;

create trigger memberships_sync_commission
  after update of parent_seller_id on memberships
  for each row execute function memberships_sync_commission();

revoke execute on function memberships_sync_commission() from anon, public;

-- =============================================================================
-- Lectura: la pantalla necesita saber CON QUE REGLA se le paga
-- =============================================================================
drop function commission_summary(uuid);

create function commission_summary(p_raffle_id uuid default null)
returns table (
  seller_id        uuid,
  raffle_id        uuid,
  -- Verdadero si cobra por tramos; falso si cobra la mitad del precio. La
  -- pantalla necesita distinguirlos: a quien cobra la mitad no se le puede
  -- hablar de «subir de nivel», porque no hay niveles que subir.
  by_tiers         boolean,
  tickets_paid     integer,
  rate             bigint,
  earned           bigint,
  next_min_tickets integer,
  next_rate        bigint,
  tickets_to_next  integer,
  projected_earned bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    sc.seller_id,
    sc.raffle_id,
    (m.parent_seller_id is not null) as by_tiers,
    sc.tickets_paid,
    sc.rate,
    sc.earned,
    -- El proximo tramo solo existe para quien cobra por tramos.
    case when m.parent_seller_id is null then null else siguiente.min_tickets end,
    case when m.parent_seller_id is null then null else siguiente.rate end,
    case when m.parent_seller_id is null or siguiente.min_tickets is null then null
         else siguiente.min_tickets - sc.tickets_paid
    end,
    case when m.parent_seller_id is null or siguiente.min_tickets is null then null
         else siguiente.min_tickets::bigint * siguiente.rate
    end
  from seller_commissions sc
  join memberships m
    on m.profile_id = sc.seller_id
   and m.organization_id = sc.organization_id
  left join lateral (
    select ct.min_tickets, ct.rate
    from commission_tiers ct
    where ct.organization_id = sc.organization_id
      and ct.min_tickets > sc.tickets_paid
    order by ct.min_tickets
    limit 1
  ) as siguiente on true
  where (p_raffle_id is null or sc.raffle_id = p_raffle_id)
$$;

comment on function commission_summary is
  'Comision, forma de pago y proximo tramo por vendedor y rifa. SECURITY INVOKER: hereda la RLS de seller_commissions (BR-G11, BR-G13).';

revoke execute on function commission_summary(uuid) from anon, public;
grant execute on function commission_summary(uuid) to authenticated;

-- =============================================================================
-- Recalculo de lo ya existente
--
-- Al instalar esto, las comisiones guardadas se calcularon TODAS por tramos.
-- Hay que rehacerlas con la forma de pago que corresponde a cada quien. No se
-- reescribe el historico: se llama al motor, que anota la diferencia como un
-- movimiento mas y deja `sum(ledger) = earned` cierto igual que antes.
-- =============================================================================
do $$
declare
  r record;
begin
  for r in select organization_id, raffle_id, seller_id from seller_commissions loop
    perform recalc_seller_commission(r.organization_id, r.raffle_id, r.seller_id);
  end loop;
end
$$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop trigger memberships_sync_commission on memberships;
-- drop function memberships_sync_commission();
-- drop trigger raffles_sync_commission on raffles;
-- drop function raffles_sync_commission();
-- drop function commission_rate_for_seller(uuid, uuid, uuid, integer);
-- ... y volver a crear `recalc_seller_commission` y `commission_summary` con el
-- cuerpo de 0024, seguido del mismo bucle de recalculo de arriba.
--
-- Revertir devuelve a TODOS los vendedores al pago por tramos, incluidos los que
-- no pertenecen a ningun equipo. Es un cambio de lo que se le debe a la gente:
-- no se hace sin decidirlo.
-- =============================================================================
