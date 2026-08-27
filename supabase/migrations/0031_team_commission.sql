-- =============================================================================
-- 0031_team_commission.sql
-- El equipo reparte UNA sola mitad: el padre cobra por las ventas de su equipo
-- y de ahi le paga al integrante
--
-- Referencia: docs/BUSINESS_RULES.md BR-G20..BR-G26, docs/DECISIONS.md D-127.
--
-- QUE ESTABA MAL, Y NO ERA UN DEFECTO SINO UNA REGLA QUE FALTABA
--
-- Hasta hoy el integrante de un equipo cobraba por tramos ($20.000–$40.000) y ese
-- dinero salia de la parte de la EMPRESA: de una boleta de $120.000 vendida por
-- un integrante, la empresa se quedaba $100.000, mientras que de una vendida por
-- cualquier otro vendedor se quedaba $60.000. El vendedor padre no cobraba nada
-- por las ventas de su equipo —BUSINESS_RULES lo decia con todas las letras: «es
-- una regla comercial que el dueño aun no ha definido»—.
--
-- El dueño la definio: **el dinero del integrante sale del bolsillo del padre**.
--
-- LA REGLA, EN UNA LINEA
--
-- Cada boleta cobrada por completo deja a la empresa la MITAD de su precio
-- oficial, la venda quien la venda. La otra mitad es el bolsillo del vendedor, y
-- cuando la vende un integrante ese bolsillo se REPARTE:
--
--     integrante  -> su tarifa (tramos o valor fijo)
--     padre       -> la mitad del precio − esa tarifa
--     empresa     -> la mitad del precio (igual que siempre)
--
-- Con la rifa en $120.000 y un integrante en el primer tramo:
--
--     integrante   $20.000
--     padre        $40.000     ($60.000 − $20.000)
--     empresa      $60.000
--                 --------
--                 $120.000
--
-- Y con ello la identidad de BR-G17 se vuelve UNIFORME, que antes no lo era:
--
--     cobrado a los clientes − comisiones pagadas = n × (precio oficial ÷ 2)
--
-- El lado derecho no depende de quien vendio, ni del tramo, ni del reparto
-- interno del equipo, ni de las rebajas: la rebaja la sigue asumiendo entera
-- quien la concedio (BR-G17, intacta).
--
-- DE AHI SALE EL TOPE, Y NO ES UNA CIFRA ELEGIDA A DEDO
--
-- El padre no puede pagarle a un integrante mas de lo que el mismo recibe por esa
-- boleta. El maximo es la mitad del precio de la rifa, y en ese extremo el padre
-- se queda con cero: ha cedido su parte entera. Nunca puede quedar en negativo
-- (BR-G23), igual que la comision nunca es negativa (BR-G19).
--
-- LA SEGUNDA MITAD DEL ENCARGO: DOS FORMAS DE PAGAR A UN INTEGRANTE
--
-- Hasta hoy todo integrante cobraba por tramos, sin alternativa. Ahora el padre
-- elige, al agregarlo o despues:
--
--     tiered            -> los tramos de la organizacion (lo de siempre, y sigue
--                          siendo el valor por defecto)
--     fixed_per_ticket  -> una cifra fija por cada boleta cobrada completa
--
-- La configuracion vive en `memberships`, que ES la relacion entre el padre y el
-- integrante: no hay tabla de equipos que sea otra cosa que esa fila.
--
-- LO QUE NO CAMBIA
--
-- El motor sigue siendo el mismo y por el mismo motivo (D-094): el importe es una
-- FUNCION DEL ESTADO, recalculada entera, nunca una suma de eventos. De ahi salen
-- gratis la idempotencia, la autocorreccion y el recalculo hacia atras. El ledger
-- sigue explicando el saldo al peso, el bloqueo de fila sigue serializando, y
-- `sale_price`, los pagos y los saldos no se tocan.
-- =============================================================================

-- =============================================================================
-- PARTE 1 — Como se le paga a un integrante
-- =============================================================================

create type commission_model as enum (
  'tiered',            -- los tramos de la organizacion (BR-G02, BR-G03)
  'fixed_per_ticket'   -- una cifra fija por boleta cobrada completa (BR-G24)
);

alter table memberships
  add column commission_model commission_model not null default 'tiered',
  add column fixed_commission_amount bigint;

-- El default `tiered` con importe nulo es exactamente el comportamiento anterior:
-- ninguna membresia existente cambia de forma de pago al aplicar esto, y por eso
-- esta migracion no le mueve un peso a nadie por este concepto (BR-G26).
comment on column memberships.commission_model is
  'Como se le paga a este vendedor cuando pertenece a un equipo: por tramos o una cifra fija por boleta. Inerte si parent_seller_id es nulo, porque entonces cobra la mitad del precio (BR-G13, BR-G24).';

comment on column memberships.fixed_commission_amount is
  'Cifra fija por boleta cobrada completa, en pesos enteros. Obligatoria con fixed_per_ticket, nula con tiered (BR-G24, BR-P02).';

-- Las dos combinaciones validas, y ninguna mas. Un CHECK basta porque solo mira
-- su propia fila; el TOPE necesita consultar `raffles` y va en un trigger.
--
-- El `is not null` NO es redundante y quitarlo abre el agujero entero: un CHECK
-- se cumple cuando su resultado es NULL, y `fixed_commission_amount > 0` con la
-- columna nula vale NULL, no falso. Sin esa condicion explicita, la fila
-- `fixed_per_ticket` SIN importe pasaba la restriccion —y despues cobraba cero
-- por boleta, con el vendedor padre quedandose el bolsillo entero—. Lo cazo la
-- prueba E10-15.
alter table memberships
  add constraint memberships_commission_model_amount check (
    (commission_model = 'tiered' and fixed_commission_amount is null)
    or (
      commission_model = 'fixed_per_ticket'
      and fixed_commission_amount is not null
      and fixed_commission_amount > 0
    )
  );

-- -----------------------------------------------------------------------------
-- team_max_fixed_commission — hasta cuanto puede llegar el valor fijo
--
-- Es la mitad del precio de la rifa: el bolsillo entero del padre (BR-G23). Se
-- toma el precio MAS ALTO entre las rifas activas de la organizacion, no el mas
-- bajo, porque un tope calculado sobre la rifa mas barata rechazaria un valor
-- perfectamente legitimo para la cara. Con una sola rifa activa —que es como
-- opera el negocio (D-088)— las dos lecturas coinciden.
--
-- Sin rifas activas se cae a las que haya, y sin ninguna rifa devuelve NULL: ahi
-- no hay precio contra el que medir y quien valida lo dice con palabras en vez de
-- comparar contra un cero que rechazaria cualquier cifra.
-- -----------------------------------------------------------------------------
create function team_max_fixed_commission(p_organization_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select max(r.ticket_price) / 2 from raffles r
      where r.organization_id = p_organization_id and r.status = 'active'),
    (select max(r.ticket_price) / 2 from raffles r
      where r.organization_id = p_organization_id)
  )
$$;

comment on function team_max_fixed_commission is
  'Valor fijo maximo que un vendedor padre puede pagarle a un integrante: la mitad del precio de la rifa, que es su propio bolsillo por esa boleta (BR-G23). NULL si la organizacion no tiene ninguna rifa.';

revoke execute on function team_max_fixed_commission(uuid) from anon, public;
grant execute on function team_max_fixed_commission(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- El tope, aplicado en la base de datos y no en el formulario
--
-- Va en un trigger y no en la funcion de escritura a proposito: la membresia de
-- un integrante tambien nace por la politica `memberships_insert_seller` (0022),
-- que inserta la fila DIRECTAMENTE con la sesion del vendedor padre. Si el tope
-- viviera solo dentro de una RPC, bastaria con crear al integrante por el camino
-- del alta con un `fixed_commission_amount` cualquiera para saltarselo. Aqui lo
-- cruzan los dos caminos y cualquier otro que se anada despues.
-- -----------------------------------------------------------------------------
create function memberships_validate_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max bigint;
begin
  if new.commission_model <> 'fixed_per_ticket' then
    return new;
  end if;

  v_max := team_max_fixed_commission(new.organization_id);

  if v_max is null then
    raise exception 'Todavía no hay ninguna rifa con precio, así que no se puede fijar una ganancia por boleta.'
      using errcode = 'check_violation';
  end if;

  if new.fixed_commission_amount > v_max then
    raise exception 'No puedes pagarle más de % por boleta: es lo que ganas tú por cada boleta y de ahí sale su ganancia.',
      format_cop(v_max)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger memberships_validate_commission
  before insert or update of commission_model, fixed_commission_amount on memberships
  for each row execute function memberships_validate_commission();

comment on function memberships_validate_commission is
  'Impide que un valor fijo supere la mitad del precio de la rifa, en cualquier camino de escritura (BR-G23).';

revoke execute on function memberships_validate_commission() from anon, public;

-- =============================================================================
-- PARTE 2 — La tarifa de cada quien
-- =============================================================================

-- -----------------------------------------------------------------------------
-- commission_rate_for_seller — cuanto vale cada boleta para ESTE vendedor
--
-- Tres ramas donde antes habia dos, y el orden es el que manda (BR-G13, BR-G24):
--
--   sin vendedor padre        -> la mitad del precio vigente de la rifa
--   con padre, tiered         -> los tramos de la organizacion
--   con padre, fixed          -> su cifra fija
--
-- `parent_seller_id` se pregunta PRIMERO: la configuracion de un vendedor que
-- salio de un equipo queda inerte, no se borra. Volver a meterlo la reactiva tal
-- como estaba, y su nuevo vendedor padre la ve y puede cambiarla (D-127).
-- -----------------------------------------------------------------------------
create or replace function commission_rate_for_seller(
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
  v_m      record;
  v_precio bigint;
begin
  -- Sin boletas cobradas no hay tarifa que aplicar, igual que en 0024: asi la
  -- fila no muestra «$50.000 por boleta» junto a un cero.
  if p_count is null or p_count <= 0 then
    return 0;
  end if;

  select m.parent_seller_id, m.commission_model, m.fixed_commission_amount
    into v_m
  from memberships m
  where m.profile_id = p_seller_id
    and m.organization_id = p_organization_id;

  if not found then
    return 0;  -- no es miembro de la organizacion
  end if;

  if v_m.parent_seller_id is null then
    -- La mitad del precio VIGENTE de la rifa. Division entera sobre bigint: con
    -- un precio impar se trunca el peso suelto, que es lo mismo que hace el
    -- resto del sistema con el dinero (BR-P02, nunca punto flotante).
    select r.ticket_price / 2 into v_precio from raffles r where r.id = p_raffle_id;
    return coalesce(v_precio, 0);
  end if;

  if v_m.commission_model = 'fixed_per_ticket' then
    return coalesce(v_m.fixed_commission_amount, 0);
  end if;

  return commission_rate_for(p_organization_id, p_count);
end;
$$;

comment on function commission_rate_for_seller is
  'Tarifa por boleta cobrada segun la forma de pago: mitad del precio si no pertenece a un equipo; dentro de un equipo, tramos o cifra fija segun su membresia (BR-G13, BR-G24).';

-- -----------------------------------------------------------------------------
-- commission_floor_rate — la tarifa MAS BAJA que este vendedor puede llegar a
-- tener en esta rifa, que es lo que fija su rebaja maxima (BR-G18)
--
-- La rama nueva es la del valor fijo, y ahi el suelo es el propio valor: no se
-- mueve con el volumen, asi que la tarifa minima y la actual son la misma cifra.
--
-- Queda un camino por el que el suelo puede bajar despues de una venta rebajada:
-- que el vendedor padre REBAJE el valor fijo. Es la misma familia que bajar el
-- precio de la rifa (BR-G15) y la cubre el mismo cinturon: el recorte a cero del
-- motor (BR-G19). No se le prohibe al padre bajar el valor —es su dinero— y el
-- aviso de la pantalla dice que la ganancia acumulada puede bajar.
-- -----------------------------------------------------------------------------
create or replace function commission_floor_rate(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_seller_id       uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_m      record;
  v_precio bigint;
begin
  select m.parent_seller_id, m.commission_model, m.fixed_commission_amount
    into v_m
  from memberships m
  where m.profile_id = p_seller_id
    and m.organization_id = p_organization_id;

  if not found then
    return 0;  -- no es miembro de la organizacion
  end if;

  if v_m.parent_seller_id is null then
    select r.ticket_price / 2 into v_precio from raffles r where r.id = p_raffle_id;
    return coalesce(v_precio, 0);
  end if;

  if v_m.commission_model = 'fixed_per_ticket' then
    return coalesce(v_m.fixed_commission_amount, 0);
  end if;

  -- Sin tramos configurados devuelve 0, que significa «no se permite descuento».
  -- Es el fallo seguro: antes se deja de poder rebajar que de pagar bien.
  return coalesce((
    select min(ct.rate)
    from commission_tiers ct
    where ct.organization_id = p_organization_id
  ), 0);
end;
$$;

-- =============================================================================
-- PARTE 3 — Lo que el padre gana por su equipo
-- =============================================================================

-- El estado del padre necesita dos cifras mas. Se guardan aparte de `earned` y
-- no sumadas dentro, porque son dinero de otra naturaleza y las pantallas tienen
-- que poder decir cual es cual: `earned` es lo que gano vendiendo el mismo, y de
-- ahi se deducen sus propias rebajas (BR-G17); `team_earned` es su parte de lo
-- que vendio su equipo, donde no hay rebajas suyas que restar.
alter table seller_commissions
  add column team_tickets_paid integer not null default 0 check (team_tickets_paid >= 0),
  add column team_earned       bigint  not null default 0 check (team_earned >= 0);

comment on column seller_commissions.team_earned is
  'Parte del bolsillo del vendedor que le queda a este vendedor padre por las boletas cobradas de SU equipo: por cada una, la mitad del precio menos la tarifa del integrante (BR-G20).';

comment on column seller_commissions.team_tickets_paid is
  'Boletas cobradas por completo por los integrantes del equipo de este vendedor, en esta rifa (BR-G20).';

-- -----------------------------------------------------------------------------
-- De donde vino cada movimiento
--
-- Sin esto no habria forma de separar en el ledger el dinero propio del que llega
-- del equipo, y la invariante de BR-G10 dejaria de poder comprobarse por partes.
-- Se resolvio con columnas y no con valores nuevos del enum de movimientos por
-- una razon dura: `alter type ... add value` deja el valor inutilizable hasta que
-- la transaccion confirma (nota de 0028), y esta migracion SI recalcula al final.
--
-- SON DOS COLUMNAS Y NO UNA, y el primer intento de hacerlo con una sola fallo:
-- marcar el movimiento de equipo unicamente con `from_seller_id` deja sin marca
-- el caso en que cambian TODOS los integrantes a la vez —sube el precio de la
-- rifa—, porque ahi no hay un integrante concreto de quien venga. Aquellas filas
-- quedaban con `from_seller_id` nulo y se contaban como propias, inflando la
-- comision aparente del vendedor padre en el historial. Lo cazo la prueba E10-24.
--
--   `team_movement`  -> QUE es: dinero del equipo o dinero propio. Nunca nulo,
--                       y es lo que separa las dos invariantes.
--   `from_seller_id` -> DE QUIEN vino, cuando se sabe. Enriquece, no decide.
-- -----------------------------------------------------------------------------
alter table commission_ledger
  add column team_movement  boolean not null default false,
  add column from_seller_id uuid;

alter table commission_ledger
  add constraint commission_ledger_from_seller_is_team
  check (from_seller_id is null or team_movement);

comment on column commission_ledger.team_movement is
  'Verdadero si este movimiento viene de las ventas del EQUIPO de seller_id, falso si de las suyas propias. Separa las dos invariantes de BR-G10 (BR-G22).';

comment on column commission_ledger.from_seller_id is
  'Integrante de cuyas ventas salio el movimiento, cuando lo provoco uno concreto. Nulo cuando cambiaron todos a la vez (un cambio de precio de la rifa). Solo tiene sentido con team_movement (BR-G22).';

create index commission_ledger_from_seller_idx
  on commission_ledger (from_seller_id, raffle_id)
  where from_seller_id is not null;

-- -----------------------------------------------------------------------------
-- commission_team_earned — la parte del padre, recontada entera
--
-- Recuenta, no acumula: mismo principio que el resto del motor (D-094). Por cada
-- integrante con boletas cobradas en esta rifa se calcula su tarifa con SU
-- recuento —la de tramos es retroactiva, asi que depende de cuantas lleve— y lo
-- que le sobra al padre por cada una.
--
-- `greatest(0, ...)` por integrante y no sobre el total: si una organizacion
-- configurara un tramo por encima de la mitad del precio, ese integrante le
-- costaria al padre exactamente cero, no dinero de los demas (BR-G23).
--
-- Las rebajas del integrante NO entran aqui, y es la parte que hay que leer dos
-- veces: la rebaja la asume entera quien la concedio (BR-G17). El padre recibe
-- `mitad − tarifa` aunque su integrante haya vendido mas barato; quien se queda
-- con menos es el integrante. Comprobado en E10-07.
-- -----------------------------------------------------------------------------
create function commission_team_earned(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_parent_id       uuid,
  out tickets_paid  integer,
  out earned        bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mitad bigint;
begin
  tickets_paid := 0;
  earned := 0;

  select r.ticket_price / 2 into v_mitad from raffles r where r.id = p_raffle_id;
  if v_mitad is null then
    return;
  end if;

  select
    coalesce(sum(hijo.n), 0)::integer,
    coalesce(sum(
      hijo.n::bigint * greatest(
        0,
        v_mitad - commission_rate_for_seller(
          p_organization_id, p_raffle_id, hijo.seller_id, hijo.n
        )
      )
    ), 0)::bigint
    into tickets_paid, earned
  from (
    select t.seller_id, count(*)::integer as n
    from tickets t
    join memberships m
      on m.profile_id = t.seller_id
     and m.organization_id = t.organization_id
    where t.raffle_id = p_raffle_id
      and t.organization_id = p_organization_id
      and t.inventory_status = 'assigned'
      and t.payment_status = 'paid'
      and m.parent_seller_id = p_parent_id
    group by t.seller_id
  ) as hijo;
end;
$$;

comment on function commission_team_earned is
  'Boletas cobradas por el equipo de un vendedor padre y lo que le queda a el por ellas: por cada una, la mitad del precio menos la tarifa del integrante (BR-G20, BR-G21).';

revoke execute on function commission_team_earned(uuid, uuid, uuid) from anon, public;
grant execute on function commission_team_earned(uuid, uuid, uuid) to service_role;

-- =============================================================================
-- PARTE 4 — El motor
--
-- Sigue siendo el de 0024 y hace lo mismo que hacia; lo que se le anade es un
-- SEGUNDO bloque, el del equipo, que se recuenta y se cuadra con la misma
-- tecnica: se compara con lo registrado y se anota la diferencia. Por eso el
-- equipo hereda gratis la idempotencia y el recalculo hacia atras.
--
-- LA CASCADA
--
-- Cuando cambia una boleta de un integrante, cambian DOS personas: el integrante
-- y su vendedor padre. El motor se llama a si mismo sobre el padre al terminar,
-- que es lo unico que garantiza que ningun camino se olvide de hacerlo —hay
-- muchos: registrar un abono, anularlo, anular la boleta, importarla, cambiarla
-- de vendedor, cambiar el precio de la rifa—.
--
-- `p_team_source` es el freno y la etiqueta a la vez. Nulo significa «llamada
-- normal, cascadea al padre si lo hay»; con valor significa «esta es la llamada
-- cascadeada, no vuelvas a cascadear, y estampa este integrante en el ledger».
-- La recursion termina en un paso y esta demostrado: un vendedor padre nunca
-- tiene padre (BR-E03, dos niveles), pero el freno no depende de esa regla.
--
-- EL ORDEN DE LOS CERROJOS es siempre integrante antes que padre, jamas al reves,
-- asi que dos ventas simultaneas de dos integrantes del mismo equipo se serializan
-- sobre la fila del padre sin poder abrazarse.
-- =============================================================================
drop function recalc_seller_commission(uuid, uuid, uuid, commission_movement, uuid);

create function recalc_seller_commission(
  p_organization_id uuid,
  p_raffle_id       uuid,
  p_seller_id       uuid,
  p_movement        commission_movement default null,
  p_ticket_id       uuid default null,
  p_team_source     uuid default null
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
  v_team_n_before integer;
  v_team_before   bigint;
  v_n_after       integer;
  v_rate_after    bigint;
  v_earned_after  bigint;
  v_descuentos    bigint;
  v_team          record;
  v_delta         integer;
  v_movement      commission_movement;
  v_anotado       bigint := 0;
  v_resto         bigint;
  v_padre         uuid;
begin
  if p_seller_id is null or p_raffle_id is null then
    return;
  end if;

  insert into seller_commissions (organization_id, raffle_id, seller_id)
  values (p_organization_id, p_raffle_id, p_seller_id)
  on conflict (raffle_id, seller_id) do nothing;

  select tickets_paid, rate, earned, team_tickets_paid, team_earned
    into v_n_before, v_rate_before, v_earned_before, v_team_n_before, v_team_before
  from seller_commissions
  where raffle_id = p_raffle_id and seller_id = p_seller_id
  for update;

  -- ---------------------------------------------------------------------------
  -- Bloque 1: lo que vendio el mismo. Identico a 0028.
  -- ---------------------------------------------------------------------------
  select
    count(*)::integer,
    coalesce(sum(coalesce(t.base_price, t.sale_price) - t.sale_price), 0)::bigint
    into v_n_after, v_descuentos
  from tickets t
  where t.raffle_id = p_raffle_id
    and t.seller_id = p_seller_id
    and t.inventory_status = 'assigned'
    and t.payment_status = 'paid';

  v_rate_after := commission_rate_for_seller(
    p_organization_id, p_raffle_id, p_seller_id, v_n_after
  );

  v_earned_after := greatest(0, v_n_after::bigint * v_rate_after - v_descuentos);

  -- ---------------------------------------------------------------------------
  -- Bloque 2: lo que vendio su equipo. Cero para quien no tiene equipo, y
  -- entonces esta migracion no le cambia nada a nadie que no lo tenga.
  -- ---------------------------------------------------------------------------
  select * into v_team
  from commission_team_earned(p_organization_id, p_raffle_id, p_seller_id);

  if v_earned_after = v_earned_before
     and v_n_after = v_n_before
     and v_team.earned = v_team_before
     and v_team.tickets_paid = v_team_n_before
  then
    -- Nada que registrar. Este es el camino de la idempotencia: un evento
    -- repetido llega hasta aqui y no escribe. Tampoco cascadea: si nada cambio
    -- para este vendedor, tampoco cambio para su padre por su culpa.
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

    v_anotado := v_anotado + v_delta::bigint * v_rate_after;

    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id, v_movement,
      v_delta::bigint * v_rate_after, v_n_after, v_rate_after, p_ticket_id
    );
  end if;

  if v_rate_after <> v_rate_before and v_n_before > 0 then
    v_anotado := v_anotado + v_n_before::bigint * (v_rate_after - v_rate_before);

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

  -- Lo que falte para cuadrar lo PROPIO: la rebaja concedida y el recorte a cero.
  -- Se calcula como resto y no como «diferencia de rebajas» a proposito, para que
  -- la invariante no dependa de que tres formulas sigan siendo consistentes.
  v_resto := (v_earned_after - v_earned_before) - v_anotado;

  if v_resto <> 0 then
    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id, 'discount',
      v_resto, v_n_after, v_rate_after, p_ticket_id
    );
  end if;

  -- El movimiento del equipo: UNA linea con la diferencia, marcada SIEMPRE como
  -- de equipo y, cuando se sabe, con el integrante que la provoco. Cuando el
  -- cambio es de todos a la vez —sube el precio de la rifa— no hay un integrante
  -- concreto y `from_seller_id` queda nulo, pero `team_movement` no: de eso
  -- depende que la invariante siga cuadrando por partes (BR-G22).
  -- Su `rate` es el reparto medio por boleta, no una tarifa de tramo.
  if v_team.earned <> v_team_before then
    insert into commission_ledger (
      organization_id, raffle_id, seller_id, movement, amount,
      tickets_paid, rate, ticket_id, team_movement, from_seller_id
    )
    values (
      p_organization_id, p_raffle_id, p_seller_id,
      case when v_team.earned > v_team_before then 'sale'::commission_movement
           else 'sale_reverted'::commission_movement
      end,
      v_team.earned - v_team_before,
      v_team.tickets_paid,
      case when v_team.tickets_paid > 0 then v_team.earned / v_team.tickets_paid else 0 end,
      p_ticket_id,
      true,
      p_team_source
    );
  end if;

  update seller_commissions
     set tickets_paid      = v_n_after,
         rate              = v_rate_after,
         earned            = v_earned_after,
         team_tickets_paid = v_team.tickets_paid,
         team_earned       = v_team.earned,
         updated_at        = now()
   where raffle_id = p_raffle_id and seller_id = p_seller_id;

  -- ---------------------------------------------------------------------------
  -- La cascada. Va al FINAL, con lo propio ya escrito: el padre recuenta las
  -- boletas de sus integrantes desde `tickets`, asi que no depende de esta fila,
  -- pero dejarla cuadrada antes hace que cualquier lectura intermedia vea un
  -- estado coherente.
  -- ---------------------------------------------------------------------------
  if p_team_source is null then
    select m.parent_seller_id into v_padre
    from memberships m
    where m.profile_id = p_seller_id
      and m.organization_id = p_organization_id;

    if v_padre is not null then
      perform recalc_seller_commission(
        p_organization_id, p_raffle_id, v_padre, null, p_ticket_id, p_seller_id
      );
    end if;
  end if;
end;
$$;

comment on function recalc_seller_commission is
  'Recuenta lo que vendio un vendedor Y lo que vendio su equipo, anota las diferencias en el ledger y actualiza su comision. Cascadea al vendedor padre. Idempotente por construccion (BR-G05, BR-G10, BR-G20).';

revoke execute on function recalc_seller_commission(uuid, uuid, uuid, commission_movement, uuid, uuid) from anon, public;
grant execute on function recalc_seller_commission(uuid, uuid, uuid, commission_movement, uuid, uuid) to service_role;

-- =============================================================================
-- PARTE 5 — Los hechos que mueven dinero
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cambia la configuracion de un integrante, o entra o sale de un equipo
--
-- Reemplaza al trigger de 0025, que solo escuchaba `parent_seller_id`. Ahora hay
-- tres columnas que cambian dinero y DOS o TRES personas afectadas por cada
-- cambio: el integrante, su vendedor padre de antes y el de ahora.
--
-- El recalculo ocurre DENTRO de la misma transaccion que el cambio, y de ahi sale
-- gratis lo que pedia el encargo: si el recalculo falla, el cambio de
-- configuracion no queda guardado. No hay forma de que la fila diga «valor fijo
-- $30.000» junto a unas cifras calculadas con el valor anterior.
-- -----------------------------------------------------------------------------
drop trigger memberships_sync_commission on memberships;

create or replace function memberships_sync_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila record;
begin
  if new.parent_seller_id is not distinct from old.parent_seller_id
     and new.commission_model is not distinct from old.commission_model
     and new.fixed_commission_amount is not distinct from old.fixed_commission_amount
  then
    return null;
  end if;

  -- El integrante, en todas sus rifas (BR-G16). La cascada de dentro del motor
  -- se encarga del vendedor padre ACTUAL en cada una de ellas.
  for v_fila in
    select raffle_id from seller_commissions where seller_id = new.profile_id
  loop
    perform recalc_seller_commission(new.organization_id, v_fila.raffle_id, new.profile_id);
  end loop;

  -- Y el vendedor padre ANTERIOR, al que la cascada ya no alcanza porque este
  -- integrante dejo de serlo. Sin esto, quien saca a alguien de su equipo seguiria
  -- cobrando por sus ventas hasta que otra cosa le moviera la fila.
  if old.parent_seller_id is not null
     and old.parent_seller_id is distinct from new.parent_seller_id
  then
    for v_fila in
      select raffle_id from seller_commissions where seller_id = old.parent_seller_id
    loop
      perform recalc_seller_commission(
        new.organization_id, v_fila.raffle_id, old.parent_seller_id, null, null, new.profile_id
      );
    end loop;
  end if;

  return null;
end;
$$;

create trigger memberships_sync_commission
  after update of parent_seller_id, commission_model, fixed_commission_amount on memberships
  for each row execute function memberships_sync_commission();

-- -----------------------------------------------------------------------------
-- Cambia el precio de la rifa
--
-- El de 0025 recorria `seller_commissions`, y eso ya no basta: un vendedor padre
-- cuyo equipo vendio pero que no ha vendido nada el mismo TIENE fila —se la crea
-- la cascada—, pero un integrante recien llegado podria no tenerla todavia. Se
-- recorre la union de las dos cosas para no dejar a nadie fuera.
-- -----------------------------------------------------------------------------
create or replace function raffles_sync_commission()
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
    union
    select distinct t.seller_id from tickets t
    where t.raffle_id = new.id and t.seller_id is not null
  loop
    perform recalc_seller_commission(new.organization_id, new.id, v_fila.seller_id);
  end loop;

  return null;
end;
$$;

-- =============================================================================
-- PARTE 6 — La escritura: el vendedor padre elige como pagar
-- =============================================================================

-- -----------------------------------------------------------------------------
-- team_set_commission_model — cambiar la forma de pago de un integrante
--
-- La autorizacion NO se escribe aqui: la pone `team_member_guard` (0026), la
-- misma puerta que ya gobierna corregir y eliminar a un integrante. Un vendedor
-- padre solo puede tocar a alguien de SU equipo, y quien no lidera equipo no
-- puede tocar a nadie. Un integrante ajeno y uno inexistente responden igual.
--
-- Hace falta una funcion —y no una politica de UPDATE— porque `authenticated`
-- tiene UPDATE sobre TODAS las columnas de `memberships` (0009/0010): una politica
-- para el vendedor padre le habria permitido de paso reescribir `is_active`,
-- `role` o `parent_seller_id` de su integrante. Es el mismo criterio de 0026.
--
-- El tope no se comprueba aqui: lo aplica el trigger `memberships_validate_commission`
-- sobre la fila, de modo que tambien cubre el alta. El recalculo tampoco: lo
-- dispara `memberships_sync_commission`, en esta misma transaccion.
-- -----------------------------------------------------------------------------
create function team_set_commission_model(
  p_member_id uuid,
  p_model     commission_model,
  p_amount    bigint default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid;
  v_before record;
  v_amount bigint := case when p_model = 'fixed_per_ticket' then p_amount else null end;
begin
  v_org := team_member_guard(p_member_id);

  if p_model = 'fixed_per_ticket' and coalesce(v_amount, 0) <= 0 then
    raise exception 'Escribe cuánto ganará por cada boleta que cobre completa.'
      using errcode = 'check_violation';
  end if;

  select m.commission_model, m.fixed_commission_amount
    into v_before
  from memberships m
  where m.profile_id = p_member_id and m.organization_id = v_org;

  update memberships
     set commission_model        = p_model,
         fixed_commission_amount = v_amount
   where profile_id = p_member_id
     and organization_id = v_org;

  perform write_audit_log(
    v_org, 'user.commission_model', 'user', p_member_id,
    jsonb_build_object('commission_model', v_before.commission_model,
                       'fixed_commission_amount', v_before.fixed_commission_amount),
    jsonb_build_object('commission_model', p_model,
                       'fixed_commission_amount', v_amount,
                       'changed_by', auth.uid())
  );
end;
$$;

comment on function team_set_commission_model(uuid, commission_model, bigint) is
  'Cambia como se le paga a un integrante del equipo de quien llama. El recalculo retroactivo lo dispara el trigger de memberships, en esta misma transaccion (BR-G24, BR-G25).';

revoke execute on function team_set_commission_model(uuid, commission_model, bigint) from public, anon;
grant execute on function team_set_commission_model(uuid, commission_model, bigint) to authenticated;

-- =============================================================================
-- PARTE 7 — Lectura
-- =============================================================================

drop function commission_summary(uuid);

create function commission_summary(p_raffle_id uuid default null)
returns table (
  seller_id        uuid,
  raffle_id        uuid,
  -- Con que regla se le paga. La pantalla lo necesita porque las tres se
  -- explican con palabras distintas y ninguna sirve para las otras dos:
  --   half_price -> la mitad del precio de la rifa, sin niveles
  --   tiered     -> tramos, y entonces SI hay «proximo nivel»
  --   fixed      -> una cifra fija pactada con su vendedor padre, sin niveles
  pay_model        text,
  -- Verdadero solo con `tiered`. Se conserva porque es exactamente la condicion
  -- que habilita hablar de subir de nivel, y ya la leen tres pantallas.
  by_tiers         boolean,
  tickets_paid     integer,
  rate             bigint,
  earned           bigint,
  -- Lo que le deja su equipo. Cero para quien no tiene equipo.
  team_tickets_paid integer,
  team_earned       bigint,
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
    case
      when m.parent_seller_id is null then 'half_price'
      when m.commission_model = 'fixed_per_ticket' then 'fixed'
      else 'tiered'
    end,
    (m.parent_seller_id is not null and m.commission_model = 'tiered'),
    sc.tickets_paid,
    sc.rate,
    sc.earned,
    sc.team_tickets_paid,
    sc.team_earned,
    -- El proximo tramo solo existe para quien cobra por tramos.
    case when tramos.si then siguiente.min_tickets end,
    case when tramos.si then siguiente.rate end,
    case when tramos.si then siguiente.min_tickets - sc.tickets_paid end,
    case when tramos.si then siguiente.min_tickets::bigint * siguiente.rate end
  from seller_commissions sc
  join memberships m
    on m.profile_id = sc.seller_id
   and m.organization_id = sc.organization_id
  cross join lateral (
    select (m.parent_seller_id is not null and m.commission_model = 'tiered') as si
  ) as tramos
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
  'Comision propia, comision de equipo, forma de pago y proximo tramo por vendedor y rifa. SECURITY INVOKER: hereda la RLS de seller_commissions (BR-G11, BR-G13, BR-G20, BR-G24).';

revoke execute on function commission_summary(uuid) from anon, public;
grant execute on function commission_summary(uuid) to authenticated;

-- =============================================================================
-- PARTE 8 — Recalculo de lo ya existente
--
-- ESTA MIGRACION SI CAMBIA DINERO, y hay que decirlo con todas las letras: a
-- partir de aqui un vendedor padre cobra por las ventas de su equipo, y eso antes
-- valia cero. Es exactamente lo que se decidio (D-127).
--
-- Lo que NO cambia: la comision de los integrantes, que siguen todos en `tiered`
-- por el default de la Parte 1; la de los vendedores sin equipo; y ni un peso de
-- ningun pago registrado.
--
-- No se reescribe el historico: se llama al motor, que anota la diferencia como
-- un movimiento mas y deja `sum(ledger) = earned + team_earned` cierto igual que
-- antes lo estaba `sum(ledger) = earned`.
-- =============================================================================
do $$
declare
  r record;
begin
  for r in
    select organization_id, raffle_id, seller_id from seller_commissions
    union
    select t.organization_id, t.raffle_id, m.parent_seller_id
    from tickets t
    join memberships m
      on m.profile_id = t.seller_id and m.organization_id = t.organization_id
    where m.parent_seller_id is not null
    group by t.organization_id, t.raffle_id, m.parent_seller_id
  loop
    perform recalc_seller_commission(r.organization_id, r.raffle_id, r.seller_id);
  end loop;
end
$$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function team_set_commission_model(uuid, commission_model, bigint);
-- drop trigger memberships_validate_commission on memberships;
-- drop function memberships_validate_commission();
-- drop function team_max_fixed_commission(uuid);
-- drop function commission_team_earned(uuid, uuid, uuid);
-- drop index commission_ledger_from_seller_idx;
-- alter table commission_ledger drop column from_seller_id;
-- alter table seller_commissions drop column team_earned, drop column team_tickets_paid;
-- alter table memberships drop constraint memberships_commission_model_amount;
-- alter table memberships drop column fixed_commission_amount, drop column commission_model;
-- drop type commission_model;
-- ... y volver a crear `recalc_seller_commission`, `commission_summary`,
-- `commission_rate_for_seller`, `commission_floor_rate`, `raffles_sync_commission`
-- y `memberships_sync_commission` con el cuerpo de 0025/0028, seguido del mismo
-- bucle de recalculo de arriba.
--
-- Revertir le QUITA a cada vendedor padre lo que gano por su equipo y devuelve
-- ese dinero a la empresa, y deja a todos los integrantes en tramos. Es un cambio
-- de lo que se le debe a la gente: no se hace sin decidirlo.
-- =============================================================================
