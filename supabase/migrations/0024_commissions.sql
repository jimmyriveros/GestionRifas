-- =============================================================================
-- 0024_commissions.sql
-- Equipos de vendedores — Fases 5, 6 y 7: comision por tramos, motor y ledger
--
-- Referencia: docs/BUSINESS_RULES.md BR-G01..BR-G12, docs/DECISIONS.md D-094.
--
-- LA REGLA, EN UNA LINEA
--
-- La comision de un vendedor en una rifa es `n × tarifa(n)`, donde `n` son sus
-- boletas PAGADAS POR COMPLETO y la tarifa sube por tramos:
--
--   1–20  -> $20.000     21–30 -> $25.000     31–50 -> $30.000     51+ -> $40.000
--
-- Y es RETROACTIVA: al llegar a 21 no se cobran 20 a veinte mil y una a
-- veinticinco mil; se cobran las 21 a veinticinco mil.
--
-- POR QUE «PAGADA» Y NO «VENDIDA»
--
-- Decision explicita del dueño del producto: la comision se gana cuando la
-- boleta esta cobrada por completo (`payment_status = 'paid'`), no cuando se
-- asigna a un cliente. Asi la empresa nunca debe comision por dinero que no
-- entro. La consecuencia es que la comision BAJA sola cuando se anula un pago,
-- que es el camino real por el que hoy puede caer una venta —una boleta con
-- abonos activos no se puede anular (BR-I11)—.
--
-- EL DINERO NO SE ACUMULA SUMANDO EVENTOS
--
-- El importe correcto es una FUNCION del estado actual: `n × tarifa(n)`. Por eso
-- el motor no suma incrementos, sino que RECUENTA y calcula la diferencia contra
-- lo ya registrado. De ahi salen dos propiedades que no hay que programar:
--
--   * Es idempotente. Un doble clic, un reintento o un evento repetido vuelven a
--     calcular el mismo `n × tarifa(n)`: la diferencia es cero y no se escribe
--     nada. La doble comision no es «poco probable», es imposible.
--   * Se autocorrige. Si algun dia una fila del ledger se perdiera, el siguiente
--     movimiento del vendedor volveria a cuadrar el total.
--
-- El ledger es la EXPLICACION del importe, no su origen. Y aun asi tiene que
-- cuadrar exactamente: `sum(ledger) = seller_commissions.earned` es una
-- invariante que las pruebas comprueban en cada escenario.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Los tramos, en tabla y no en codigo
--
-- Cambiar cuanto se paga es cambiar filas, no desplegar una migracion. Van por
-- organizacion porque el dia que existan dos empresas no tienen por que pagar
-- igual, y el precio del trabajo es exactamente la clase de dato que cada una
-- decide.
-- -----------------------------------------------------------------------------
create table commission_tiers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete restrict,
  -- Desde cuantas boletas pagadas aplica esta tarifa.
  min_tickets     integer not null check (min_tickets >= 1),
  -- BR-P02: dinero como entero de pesos, nunca punto flotante.
  rate            bigint not null check (rate > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint commission_tiers_org_min_key unique (organization_id, min_tickets)
);

create trigger commission_tiers_set_updated_at
  before update on commission_tiers
  for each row execute function set_updated_at();

comment on table commission_tiers is
  'Tarifa por boleta pagada segun el total acumulado en la rifa. Retroactiva: al subir de tramo, TODAS las boletas pasan a la tarifa nueva (BR-G02).';

-- Los cuatro tramos del negocio, para las organizaciones que ya existen.
insert into commission_tiers (organization_id, min_tickets, rate)
select o.id, t.min_tickets, t.rate
from organizations o
cross join (values (1, 20000), (21, 25000), (31, 30000), (51, 40000))
  as t(min_tickets, rate);

-- Y para las que se creen despues. Sin esto, una organizacion nueva tendria
-- comision cero y nadie se enteraria hasta que alguien reclamara su dinero.
create function organizations_seed_commission_tiers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into commission_tiers (organization_id, min_tickets, rate)
  values (new.id, 1, 20000), (new.id, 21, 25000), (new.id, 31, 30000), (new.id, 51, 40000);
  return null;
end;
$$;

create trigger organizations_seed_commission_tiers
  after insert on organizations
  for each row execute function organizations_seed_commission_tiers();

revoke execute on function organizations_seed_commission_tiers() from anon, public;

-- -----------------------------------------------------------------------------
-- commission_rate_for — cuanto vale cada boleta con `n` pagadas
-- -----------------------------------------------------------------------------
create function commission_rate_for(p_org uuid, p_count integer)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select ct.rate
    from commission_tiers ct
    where ct.organization_id = p_org
      and ct.min_tickets <= p_count
    order by ct.min_tickets desc
    limit 1
  ), 0)
$$;

comment on function commission_rate_for is
  'Tarifa vigente por boleta con p_count boletas pagadas. Cero cuando no hay ninguna: sin boletas no hay tarifa que aplicar.';

revoke execute on function commission_rate_for(uuid, integer) from anon, public;

-- -----------------------------------------------------------------------------
-- El estado, materializado
--
-- Una fila por vendedor y rifa. Existe por dos razones distintas:
--
--   1. Rendimiento: el panel lee UNA fila en vez de recorrer la historia del
--      vendedor en cada carga (encargo del usuario, seccion PERFORMANCE).
--   2. Concurrencia: es la fila que se BLOQUEA para serializar dos ventas
--      simultaneas del mismo vendedor. Sin ella, dos transacciones podrian leer
--      «20 boletas» a la vez y las dos creerse la numero 21.
--
-- Mismo patron que `tickets.paid_amount` (D-009): derivado, mantenido por
-- trigger, y nadie puede escribirle un valor arbitrario porque no hay
-- privilegio de escritura para `authenticated`.
-- -----------------------------------------------------------------------------
create table seller_commissions (
  organization_id uuid not null references organizations (id) on delete restrict,
  raffle_id       uuid not null,
  seller_id       uuid not null,
  tickets_paid    integer not null default 0 check (tickets_paid >= 0),
  rate            bigint  not null default 0 check (rate >= 0),
  earned          bigint  not null default 0 check (earned >= 0),
  updated_at      timestamptz not null default now(),

  primary key (raffle_id, seller_id),
  constraint seller_commissions_raffle_org_fk
    foreign key (raffle_id, organization_id) references raffles (id, organization_id)
    on delete restrict,
  constraint seller_commissions_seller_org_fk
    foreign key (seller_id, organization_id) references memberships (profile_id, organization_id)
    on delete restrict
);

create index seller_commissions_seller_idx on seller_commissions (seller_id);

comment on table seller_commissions is
  'Comision acumulada por vendedor y rifa. Derivada de las boletas pagadas; la mantiene recalc_seller_commission (BR-G05).';

-- -----------------------------------------------------------------------------
-- El ledger: por que el importe es el que es
--
-- Solo se anexa. No se actualiza ni se borra: un movimiento equivocado se
-- corrige con otro movimiento, igual que un pago se anula en vez de borrarse
-- (BR-F09, BR-D02).
-- -----------------------------------------------------------------------------
create type commission_movement as enum (
  'sale',                 -- una boleta mas quedo pagada
  'sale_reverted',        -- dejo de estarlo (pago anulado, boleta anulada)
  'tier_adjustment',      -- cambio de tramo: afecta a TODAS las anteriores
  'seller_change',        -- la boleta paso a otro vendedor
  'initial_balance'       -- saldo de partida al instalar esta migracion
);

create table commission_ledger (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete restrict,
  raffle_id       uuid not null,
  seller_id       uuid not null,
  movement        commission_movement not null,
  -- Positivo o negativo, en pesos enteros. La suma de todos los movimientos de
  -- un vendedor en una rifa es EXACTAMENTE su `earned`.
  amount          bigint not null,
  -- Fotografia del momento: con cuantas boletas y a que tarifa quedo.
  tickets_paid    integer not null,
  rate            bigint not null,
  ticket_id       uuid,
  created_at      timestamptz not null default now(),

  constraint commission_ledger_raffle_org_fk
    foreign key (raffle_id, organization_id) references raffles (id, organization_id)
    on delete restrict
);

create index commission_ledger_seller_idx
  on commission_ledger (seller_id, raffle_id, created_at desc);

comment on table commission_ledger is
  'Historial de movimientos de comision, solo anexado. Explica el importe; no lo origina (BR-G09).';

-- =============================================================================
-- El motor
-- =============================================================================

-- -----------------------------------------------------------------------------
-- recalc_seller_commission — la unica funcion que escribe dinero de comision
--
-- Recuenta, compara con lo registrado y anota la diferencia. La descomposicion
-- en dos movimientos es la que pidio el encargo y la que entiende un vendedor:
--
--   21 ventas, viniendo de 20:
--     sale              +$25.000   (la boleta nueva, a la tarifa nueva)
--     tier_adjustment  +$100.000   (las 20 anteriores, de $20.000 a $25.000)
--                      ---------
--                      +$125.000
--
-- Comprobacion algebraica de que siempre cuadra, con d = n_despues - n_antes:
--
--   d·tarifa_nueva + n_antes·(tarifa_nueva − tarifa_vieja)
--     = n_despues·tarifa_nueva − n_antes·tarifa_vieja
--     = ganado_despues − ganado_antes
-- -----------------------------------------------------------------------------
create function recalc_seller_commission(
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
  v_n_before  integer;
  v_rate_before bigint;
  v_earned_before bigint;
  v_n_after   integer;
  v_rate_after bigint;
  v_earned_after bigint;
  v_delta     integer;
  v_movement  commission_movement;
begin
  if p_seller_id is null or p_raffle_id is null then
    return;
  end if;

  -- La fila existe siempre a partir de aqui: es el cerrojo.
  insert into seller_commissions (organization_id, raffle_id, seller_id)
  values (p_organization_id, p_raffle_id, p_seller_id)
  on conflict (raffle_id, seller_id) do nothing;

  -- Bloquea a los escritores concurrentes de ESTE vendedor en ESTA rifa. En
  -- READ COMMITTED, la sentencia siguiente toma un snapshot nuevo y ya ve lo
  -- que confirmo quien nos tenia esperando (mismo par de pasos que
  -- recalc_ticket_paid_amount, 0004).
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

  v_rate_after := commission_rate_for(p_organization_id, v_n_after);
  v_earned_after := v_n_after::bigint * v_rate_after;

  if v_earned_after = v_earned_before and v_n_after = v_n_before then
    -- Nada que registrar. Este es el camino de la idempotencia: un evento
    -- repetido llega hasta aqui y no escribe.
    return;
  end if;

  v_delta := v_n_after - v_n_before;

  if v_delta <> 0 then
    -- Los literales van casteados: sin el `::commission_movement`, PostgreSQL
    -- los toma como `text` y el `coalesce` no puede juntarlos con el parametro.
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

  -- El ajuste retroactivo: solo si la tarifa cambio y habia boletas anteriores
  -- a las que aplicar el cambio.
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

comment on function recalc_seller_commission is
  'Recuenta las boletas pagadas de un vendedor en una rifa, anota la diferencia en el ledger y actualiza su comision. Idempotente por construccion (BR-G05, BR-G10).';

revoke execute on function recalc_seller_commission(uuid, uuid, uuid, commission_movement, uuid) from anon, public;

-- `authenticated` NO la recibe: nadie mueve dinero de comision desde una
-- sesion, ni siquiera la suya. `service_role` si, y a proposito: es el rol de
-- los scripts de servidor y deja abierta la reparacion operativa «recalcula la
-- comision de este vendedor», que es exactamente lo que hace falta si algun dia
-- se sospecha de una cifra. Los `grant ... to service_role` de 0009 son de
-- entonces y no alcanzan a las funciones creadas despues.
grant execute on function recalc_seller_commission(uuid, uuid, uuid, commission_movement, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- El disparador
--
-- Sobre `tickets` y no dentro de las funciones de negocio, porque el estado que
-- importa —«esta boleta esta pagada»— cambia por muchos caminos: registrar un
-- abono, anular un pago, anular la boleta, cambiarla de vendedor. Todos acaban
-- en un UPDATE de `tickets`, asi que aqui se atienden todos a la vez.
--
-- `payment_status` es una columna GENERADA a partir de `paid_amount`, que a su
-- vez mantiene el trigger de 0004. Un trigger AFTER ya la ve calculada.
-- -----------------------------------------------------------------------------
create function tickets_sync_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform recalc_seller_commission(old.organization_id, old.raffle_id, old.seller_id);
    return null;
  end if;

  if tg_op = 'UPDATE' and old.seller_id is distinct from new.seller_id then
    -- Reasignacion: los DOS vendedores cambian. El de origen pierde la boleta y
    -- puede bajar de tramo; el de destino la gana y puede subir. Cada uno se
    -- recuenta por separado y cada uno recibe su propio movimiento.
    perform recalc_seller_commission(
      old.organization_id, old.raffle_id, old.seller_id, 'seller_change', old.id
    );
    perform recalc_seller_commission(
      new.organization_id, new.raffle_id, new.seller_id, 'seller_change', new.id
    );
    return null;
  end if;

  perform recalc_seller_commission(
    new.organization_id, new.raffle_id, new.seller_id, null, new.id
  );
  return null;
end;
$$;

-- Solo las columnas que pueden cambiar el recuento. Un cambio de notas o de
-- fecha no dispara nada.
create trigger tickets_sync_commission
  after insert or delete or update of paid_amount, sale_price, inventory_status, seller_id, raffle_id
  on tickets
  for each row execute function tickets_sync_commission();

revoke execute on function tickets_sync_commission() from anon, public;

-- =============================================================================
-- Saldo de partida (MIGRACIONES: «nunca duplicar movimientos historicos»)
--
-- Al instalar esto ya hay boletas pagadas. NO se inventa una historia de ventas
-- que nadie registro: se anota UN movimiento `initial_balance` por vendedor y
-- rifa con lo que le corresponde hoy. Es honesto —dice «aqui empezamos a
-- contar»— y deja la invariante `sum(ledger) = earned` cierta desde el primer
-- momento.
-- =============================================================================
do $$
declare
  r record;
begin
  for r in
    select t.organization_id, t.raffle_id, t.seller_id, count(*)::integer as n
    from tickets t
    where t.inventory_status = 'assigned' and t.payment_status = 'paid'
    group by t.organization_id, t.raffle_id, t.seller_id
  loop
    insert into seller_commissions (
      organization_id, raffle_id, seller_id, tickets_paid, rate, earned
    )
    values (
      r.organization_id, r.raffle_id, r.seller_id, r.n,
      commission_rate_for(r.organization_id, r.n),
      r.n::bigint * commission_rate_for(r.organization_id, r.n)
    )
    on conflict (raffle_id, seller_id) do nothing;

    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount, tickets_paid, rate
    )
    values (
      r.organization_id, r.raffle_id, r.seller_id, 'initial_balance',
      r.n::bigint * commission_rate_for(r.organization_id, r.n),
      r.n, commission_rate_for(r.organization_id, r.n)
    );
  end loop;
end
$$;

-- =============================================================================
-- Lectura
-- =============================================================================

alter table commission_tiers enable row level security;
alter table commission_tiers force row level security;
alter table seller_commissions enable row level security;
alter table seller_commissions force row level security;
alter table commission_ledger enable row level security;
alter table commission_ledger force row level security;

-- Los tramos son la regla del juego: todo miembro de la organizacion puede
-- leerlos. Nadie los escribe desde la aplicacion (no hay politica de INSERT ni
-- UPDATE): cambiarlos es una operacion administrativa deliberada.
create policy commission_tiers_select on commission_tiers for select to authenticated
using (organization_id in (select current_org_ids()));

-- Cada quien su comision; el vendedor padre, la de su equipo (BR-E05); el
-- personal, la de toda la organizacion.
create policy seller_commissions_select on seller_commissions for select to authenticated
using (
  organization_id in (select current_org_ids())
  and (
    organization_id in (select current_staff_org_ids())
    or seller_id = (select current_profile_id())
    or seller_id in (select current_team_seller_ids())
  )
);

-- El detalle de los movimientos es de cada quien y del personal. El vendedor
-- padre ve CUANTO lleva ganado su equipo, no el desglose de cada ajuste.
create policy commission_ledger_select on commission_ledger for select to authenticated
using (
  organization_id in (select current_org_ids())
  and (
    organization_id in (select current_staff_org_ids())
    or seller_id = (select current_profile_id())
  )
);

-- Sin INSERT ni UPDATE ni DELETE para nadie: las tres tablas las escribe solo
-- `recalc_seller_commission`, que es SECURITY DEFINER. Un vendedor no puede
-- tocar su comision, su tramo, su recuento ni su ganancia (encargo, SEGURIDAD).
grant select on commission_tiers    to authenticated;
grant select on seller_commissions  to authenticated;
grant select on commission_ledger   to authenticated;
grant all    on commission_tiers    to service_role;
grant all    on seller_commissions  to service_role;
grant all    on commission_ledger   to service_role;

-- -----------------------------------------------------------------------------
-- commission_summary — lo que necesita una pantalla para explicarse
--
-- Devuelve el estado y el proximo tramo en una sola llamada, para el vendedor,
-- para su equipo y para el personal. Es el «motor central» de la Fase 6: ninguna
-- pantalla calcula dinero por su cuenta, todas preguntan aqui.
--
-- `SECURITY INVOKER` a proposito, al contrario que el resto: solo lee, y asi
-- hereda la politica de `seller_commissions` en vez de repetir sus condiciones
-- en dos sitios que podrian separarse (mismo criterio que D-057).
-- -----------------------------------------------------------------------------
create function commission_summary(p_raffle_id uuid default null)
returns table (
  seller_id        uuid,
  raffle_id        uuid,
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
    sc.tickets_paid,
    sc.rate,
    sc.earned,
    siguiente.min_tickets,
    siguiente.rate,
    case when siguiente.min_tickets is null then null
         else siguiente.min_tickets - sc.tickets_paid
    end,
    case when siguiente.min_tickets is null then null
         else siguiente.min_tickets::bigint * siguiente.rate
    end
  from seller_commissions sc
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
  'Comision y proximo tramo por vendedor y rifa. SECURITY INVOKER: hereda la RLS de seller_commissions, asi que cada quien recibe lo suyo, su equipo o su organizacion (BR-G11).';

revoke execute on function commission_summary(uuid) from anon, public;
grant execute on function commission_summary(uuid) to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function commission_summary(uuid);
-- drop trigger tickets_sync_commission on tickets;
-- drop function tickets_sync_commission();
-- drop function recalc_seller_commission(uuid, uuid, uuid, commission_movement, uuid);
-- drop table commission_ledger;
-- drop type commission_movement;
-- drop table seller_commissions;
-- drop function commission_rate_for(uuid, integer);
-- drop trigger organizations_seed_commission_tiers on organizations;
-- drop function organizations_seed_commission_tiers();
-- drop table commission_tiers;
--
-- Revertir borra el historial de comisiones. Los datos de negocio (boletas,
-- pagos) no se tocan, asi que volver a instalar la migracion recalcularia los
-- mismos importes desde cero: el saldo de partida es funcion de las boletas
-- pagadas, no de lo que hubiera en el ledger.
-- =============================================================================
