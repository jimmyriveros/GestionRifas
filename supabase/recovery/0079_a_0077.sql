-- =============================================================================
-- RECUPERACIÓN: devolver el ESQUEMA de 0078-0079 al de 0077 SIN perder datos (D-238)
--
-- NO es una migración: vive fuera de `supabase/migrations/` para que la CLI no
-- la aplique nunca sola. Se ejecuta a mano, con autorización expresa del dueño,
-- y SOLO si hay que volver al código anterior (RUNBOOK §10.6): el código de
-- antes de D-237 no funciona con la 0078 aplicada —lee `commission_tiers` y
-- `team_max_fixed_commission`—, y el nuevo no funciona sin ella.
--
-- CONSERVA TODO LO QUE SE ESCRIBIÓ DESPUÉS DE MIGRAR. No toca boletas, pagos,
-- asignaciones, clientes ni la bitácora; `commission_ledger` no pierde ni gana
-- una fila. `seller_commissions` se recuenta con el motor de 0077 y la
-- recuperación se deshace entera si un solo peso cambiara.
--
-- SE NIEGA —y no cambia nada— si lo que existe ya no cabe en el esquema de 0077:
--   * un acuerdo administrativo que no sea la mitad (un fijo o unos tramos);
--   * una lista de tramos que no sea la versión 1 de la lista general;
--   * un integrante por tramos en otra versión que no sea la 1.
-- Eso solo puede pasar si alguien usó la configuración nueva después de migrar.
-- Entonces la salida es corregir hacia delante, o restaurar el respaldo con las
-- escrituras posteriores conciliadas (RUNBOOK §10.6); nunca forzar esta.
--
-- Qué se pierde AL VOLVER, a sabiendas: las dos correcciones de la 0079 —un
-- traslado con el mismo acuerdo vuelve a dejar al padre nuevo sin sus boletas
-- (I-180) y el personal vuelve a poder cambiar por PostgREST el acuerdo de un
-- integrante (I-181)—, el tramo del jefe con su equipo (BR-G27, sin efecto
-- mientras todos los jefes conservan la mitad) y `team_shortfall`, que solo medía.
--
-- Generado, no escrito a mano: las definiciones de las funciones y de los
-- disparadores son las de una base construida con las migraciones de este
-- repositorio hasta la 0077 (`pg_get_functiondef` y `pg_get_triggerdef`), con
-- sus comentarios y privilegios; `commission_tiers` es la de la 0024. En el
-- proyecto alojado, las funciones que se recrean quedan con los privilegios del
-- repositorio (I-132): compárese la estructura con la foto de antes de migrar.
--
-- Todo en UNA transacción.
--
-- DESPUÉS, para que el historial diga lo mismo que el esquema:
--   supabase migration repair --status reverted 0079 0078   (--local en el ensayo)
-- =============================================================================

begin;

-- ------------------------------------------------------------- 0. Se puede volver
-- EL GUARDIA es la ÚNICA definición de cuándo se puede volver sin perder datos.
-- `scripts/earning-recovery-check.ts` lee este bloque —entre las dos marcas— y lo
-- ejecuta en SOLO LECTURA antes de decidir nada (RUNBOOK §10.6, D-239): no hay una
-- segunda copia de estas reglas que pueda divergir. Solo consulta; si algo no cabe
-- en 0077, lanza UNA excepción con TODO lo que no cabe, una condición por línea.
-- guardia:inicio
do $guard$
declare
  v        text;
  motivos  text[] := '{}';
begin
  if to_regclass('public.commission_tier_lists') is null then
    raise exception 'Esta base no tiene la 0078: no hay nada que revertir.';
  end if;

  select string_agg(m.profile_id::text, ', ') into v
  from memberships m
  where m.direct_commission_mode <> 'half_price'
     or m.direct_fixed_amount is not null
     or m.direct_tier_list_id is not null;
  if v is not null then
    motivos := motivos || format('Hay acuerdos administrativos distintos de la mitad (%s). El esquema de 0077 no puede guardarlos.', v);
  end if;

  select string_agg(l.id::text, ', ') into v
  from commission_tier_lists l
  where l.kind <> 'template' or l.template_version <> 1;
  if v is not null then
    motivos := motivos || format('Hay listas de tramos que no son la versión 1 de la lista general (%s). En 0077 solo cabe una lista por organización.', v);
  end if;

  select string_agg(m.profile_id::text, ', ') into v
  from memberships m
  where m.team_tier_list_id is not null
    and not exists (
      select 1 from commission_tier_lists l
      where l.id = m.team_tier_list_id and l.organization_id = m.organization_id
        and l.kind = 'template' and l.template_version = 1
    );
  if v is not null then
    motivos := motivos || format('Hay integrantes por tramos en una lista que no es la versión 1 (%s).', v);
  end if;

  select string_agg(o.id::text, ', ') into v
  from organizations o
  where not exists (
    select 1 from commission_tier_lists l
    where l.organization_id = o.id and l.kind = 'template' and l.template_version = 1
  );
  if v is not null then
    motivos := motivos || format('Hay organizaciones sin la versión 1 de su lista general (%s).', v);
  end if;

  if cardinality(motivos) > 0 then
    raise exception E'No se revierte:\n%', array_to_string(motivos, E'\n');
  end if;
end
$guard$;
-- guardia:fin

-- ------------------------------------------------- 1. La foto de antes, para comparar
create temporary table antes_0079_a_0077 on commit drop as
select raffle_id, seller_id, tickets_paid, earned, team_tickets_paid, team_earned
from seller_commissions;

create temporary table ledger_antes_0079_a_0077 on commit drop as
select count(*) as filas, coalesce(sum(amount), 0) as suma from commission_ledger;

-- ------------------------------------------ 2. commission_tiers, la de 0024, con la v1
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

alter table commission_tiers enable row level security;
alter table commission_tiers force row level security;

create policy commission_tiers_select on commission_tiers for select to authenticated
using (organization_id in (select current_org_ids()));

grant select on commission_tiers to authenticated;
grant all    on commission_tiers to service_role;

-- La versión 1 de cada organización ES su tabla de antes: la 0078 la copió tal
-- cual y el disparador de guardado no deja modificarla.
insert into commission_tiers (organization_id, min_tickets, rate)
select l.organization_id, i.min_tickets, i.rate
from commission_tier_lists l
join commission_tier_list_items i on i.list_id = l.id
where l.kind = 'template' and l.template_version = 1;

-- --------------------------------------------- 3. Fuera lo que la 0078 añadió
drop trigger raffles_validate_team_agreements on raffles;
drop trigger memberships_validate_seller_agreements on memberships;
drop trigger memberships_sync_commission on memberships;
drop trigger organizations_seed_commission_template on organizations;

alter table memberships
  drop column direct_commission_mode,
  drop column direct_fixed_amount,
  drop column direct_tier_list_id,
  drop column team_tier_list_id,
  drop constraint memberships_team_fixed_cap;

alter table seller_commissions
  drop column tier_tickets_paid,
  drop column team_shortfall;

drop table commission_tier_list_items;
drop table commission_tier_lists;

drop function commission_agreement_problems();
drop function commission_summary(uuid);
drop function team_commission_limits(uuid);
drop function staff_set_seller_agreement(uuid, commission_agreement_mode, bigint, jsonb);
drop function staff_create_seller_membership(uuid, uuid, commission_agreement_mode, bigint, jsonb);
drop function save_commission_template(uuid, jsonb);
drop function commission_direct_agreement_json(commission_agreement_mode, bigint, uuid);
drop function commission_resolve_tier_list(uuid, uuid, jsonb, uuid, uuid);
drop function raffles_validate_team_agreements();
drop function memberships_validate_seller_agreements();
drop function commission_discount_problem(uuid, uuid, commission_agreement_mode, bigint, uuid);
drop function commission_team_lock(uuid);
drop function commission_pair_problem(uuid, uuid, commission_agreement_mode, bigint, uuid, uuid, commission_agreement_mode, bigint, uuid, text, text);
drop function commission_person_name(uuid);
drop function commission_tickets_phrase(integer);
drop function commission_parent_cap(uuid, uuid, commission_agreement_mode, bigint, uuid);
drop function commission_pair_problem_detail(uuid, uuid, commission_agreement_mode, bigint, uuid, commission_agreement_mode, bigint, uuid);
drop function commission_half_raffle_violation(uuid, commission_agreement_mode, bigint, uuid, uuid, bigint, raffle_status);
drop function commission_pair_violation(commission_agreement_mode, bigint, uuid, commission_agreement_mode, bigint, uuid);
drop function commission_effective_agreement(uuid, uuid);
drop function commission_agreement_max(commission_agreement_mode, bigint, uuid, bigint);
drop function commission_agreement_floor(commission_agreement_mode, bigint, uuid, bigint);
drop function commission_agreement_rate(commission_agreement_mode, bigint, uuid, bigint, integer);
drop function commission_team_mode(commission_model);
drop function organizations_seed_commission_template();
drop function commission_create_tier_list(uuid, commission_tier_list_kind, uuid, jsonb, uuid);
drop function commission_current_template(uuid);
drop function commission_tier_lists_immutable();
drop function commission_tier_list_items_guard();
drop function commission_tier_lists_complete();
drop function commission_list_json(uuid);
drop function commission_tiers_normalized(jsonb);
drop function commission_tiers_problem(jsonb);

drop type commission_tier_list_kind;
drop type commission_agreement_mode;

-- ------------------------------ 4. Las funciones de 0077, con comentario y privilegios
-- commission_rate_for(uuid,integer) — ACL en 0077: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.commission_rate_for(p_org uuid, p_count integer)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select ct.rate
    from commission_tiers ct
    where ct.organization_id = p_org
      and ct.min_tickets <= p_count
    order by ct.min_tickets desc
    limit 1
  ), 0)
$function$;
comment on function commission_rate_for(uuid,integer) is 'Tarifa vigente por boleta con p_count boletas pagadas. Cero cuando no hay ninguna: sin boletas no hay tarifa que aplicar.';
revoke all on function commission_rate_for(uuid,integer) from public, anon, authenticated, service_role;

-- commission_rate_for_seller(uuid,uuid,uuid,integer) — ACL en 0077: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.commission_rate_for_seller(p_organization_id uuid, p_raffle_id uuid, p_seller_id uuid, p_count integer)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
comment on function commission_rate_for_seller(uuid,uuid,uuid,integer) is 'Tarifa por boleta cobrada segun la forma de pago: mitad del precio si no pertenece a un equipo; dentro de un equipo, tramos o cifra fija segun su membresia (BR-G13, BR-G24).';
revoke all on function commission_rate_for_seller(uuid,uuid,uuid,integer) from public, anon, authenticated, service_role;

-- commission_floor_rate(uuid,uuid,uuid) — ACL en 0077: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.commission_floor_rate(p_organization_id uuid, p_raffle_id uuid, p_seller_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
comment on function commission_floor_rate(uuid,uuid,uuid) is 'Tarifa minima garantizada de un vendedor en una rifa. Fija el descuento maximo: nunca se concede mas de lo que la comision puede absorber (BR-G18).';
revoke all on function commission_floor_rate(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function commission_floor_rate(uuid,uuid,uuid) to service_role;

-- commission_team_earned(uuid,uuid,uuid) — ACL en 0077: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.commission_team_earned(p_organization_id uuid, p_raffle_id uuid, p_parent_id uuid, OUT tickets_paid integer, OUT earned bigint)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
comment on function commission_team_earned(uuid,uuid,uuid) is 'Boletas cobradas por el equipo de un vendedor padre y lo que le queda a el por ellas: por cada una, la mitad del precio menos la tarifa del integrante (BR-G20, BR-G21).';
revoke all on function commission_team_earned(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function commission_team_earned(uuid,uuid,uuid) to service_role;

-- recalc_seller_commission(uuid,uuid,uuid,commission_movement,uuid,uuid) — ACL en 0077: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.recalc_seller_commission(p_organization_id uuid, p_raffle_id uuid, p_seller_id uuid, p_movement commission_movement DEFAULT NULL::commission_movement, p_ticket_id uuid DEFAULT NULL::uuid, p_team_source uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
comment on function recalc_seller_commission(uuid,uuid,uuid,commission_movement,uuid,uuid) is 'Recuenta lo que vendio un vendedor Y lo que vendio su equipo, anota las diferencias en el ledger y actualiza su comision. Cascadea al vendedor padre. Idempotente por construccion (BR-G05, BR-G10, BR-G20).';
revoke all on function recalc_seller_commission(uuid,uuid,uuid,commission_movement,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function recalc_seller_commission(uuid,uuid,uuid,commission_movement,uuid,uuid) to service_role;

-- memberships_validate_commission() — ACL en 0077: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.memberships_validate_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
comment on function memberships_validate_commission() is 'Impide que un valor fijo supere la mitad del precio de la rifa, en cualquier camino de escritura (BR-G23).';
revoke all on function memberships_validate_commission() from public, anon, authenticated, service_role;

-- memberships_sync_commission() — ACL en 0077: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.memberships_sync_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
revoke all on function memberships_sync_commission() from public, anon, authenticated, service_role;

-- team_set_commission_model(uuid,commission_model,bigint) — ACL en 0077: {postgres=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION public.team_set_commission_model(p_member_id uuid, p_model commission_model, p_amount bigint DEFAULT NULL::bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
comment on function team_set_commission_model(uuid,commission_model,bigint) is 'Cambia como se le paga a un integrante del equipo de quien llama. El recalculo retroactivo lo dispara el trigger de memberships, en esta misma transaccion (BR-G24, BR-G25).';
revoke all on function team_set_commission_model(uuid,commission_model,bigint) from public, anon, authenticated, service_role;
grant execute on function team_set_commission_model(uuid,commission_model,bigint) to authenticated;

-- team_max_fixed_commission(uuid) — ACL en 0077: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.team_max_fixed_commission(p_organization_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select max(r.ticket_price) / 2 from raffles r
      where r.organization_id = p_organization_id and r.status = 'active'),
    (select max(r.ticket_price) / 2 from raffles r
      where r.organization_id = p_organization_id)
  )
$function$;
comment on function team_max_fixed_commission(uuid) is 'Valor fijo maximo que un vendedor padre puede pagarle a un integrante: la mitad del precio de la rifa, que es su propio bolsillo por esa boleta (BR-G23). NULL si la organizacion no tiene ninguna rifa.';
revoke all on function team_max_fixed_commission(uuid) from public, anon, authenticated, service_role;
grant execute on function team_max_fixed_commission(uuid) to authenticated;
grant execute on function team_max_fixed_commission(uuid) to service_role;

-- commission_summary(uuid) — ACL en 0077: {postgres=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION public.commission_summary(p_raffle_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(seller_id uuid, raffle_id uuid, pay_model text, by_tiers boolean, tickets_paid integer, rate bigint, earned bigint, team_tickets_paid integer, team_earned bigint, next_min_tickets integer, next_rate bigint, tickets_to_next integer, projected_earned bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
comment on function commission_summary(uuid) is 'Comision propia, comision de equipo, forma de pago y proximo tramo por vendedor y rifa. SECURITY INVOKER: hereda la RLS de seller_commissions (BR-G11, BR-G13, BR-G20, BR-G24).';
revoke all on function commission_summary(uuid) from public, anon, authenticated, service_role;
grant execute on function commission_summary(uuid) to authenticated;

-- organizations_seed_commission_tiers() — ACL en 0077: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.organizations_seed_commission_tiers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into commission_tiers (organization_id, min_tickets, rate)
  values (new.id, 1, 20000), (new.id, 21, 25000), (new.id, 31, 30000), (new.id, 51, 40000);
  return null;
end;
$function$;
revoke all on function organizations_seed_commission_tiers() from public, anon, authenticated, service_role;

-- app_capability_catalog() — ACL en 0077: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.app_capability_catalog()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select array['raffles.prizes.manage']::text[]
$function$;
comment on function app_capability_catalog() is 'D-200: catalogo cerrado de capacidades. Espejo de APP_CAPABILITIES.';
revoke all on function app_capability_catalog() from public, anon, authenticated, service_role;

-- app_role_default_capabilities(app_role) — ACL en 0077: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.app_role_default_capabilities(p_role app_role)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_role
    when 'owner' then app_capability_catalog()
    when 'admin' then array['raffles.prizes.manage']::text[]
    else array[]::text[]
  end
$function$;
comment on function app_role_default_capabilities(app_role) is 'D-200: politica inicial por rol, mientras no exista el modulo de permisos. Espejo de ROLE_DEFAULT_CAPABILITIES.';
revoke all on function app_role_default_capabilities(app_role) from public, anon, authenticated, service_role;

-- admin_audit_redact(text,jsonb) — ACL en 0077: {postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_audit_redact(p_entity_type text, p_values jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when p_values is null then null
    when p_entity_type in ('raffle', 'user') then p_values
    else coalesce(
      (
        select jsonb_object_agg(e.key, e.value)
          from jsonb_each(p_values) e
         where e.key = any (
           case p_entity_type
             when 'ticket' then array[
               'id', 'organization_id', 'raffle_id', 'seller_id', 'internal_code',
               'daily_number', 'weekly_number', 'inventory_status', 'created_by',
               'created_at', 'approved_by', 'approved_at', 'cancelled_at',
               'cancel_reason', 'clearance_receipt_delivered_at',
               'clearance_receipt_assumed_delivered', 'count', 'reason',
               'ticket_ids', 'tickets', 'requested', 'inserted', 'skipped', 'source'
             ]
             when 'membership' then array[
               'id', 'organization_id', 'profile_id', 'role', 'is_active', 'invited_by',
               'created_at', 'parent_seller_id', 'commission_model',
               'fixed_commission_amount', 'public_slug', 'public_catalog_enabled',
               'public_whatsapp_number', 'public_raffle_id'
             ]
             when 'raffle_prize' then array[
               'raffle_id', 'prize_id', 'prize_ids', 'version_id', 'version_number',
               'previous_version_id', 'change', 'status', 'title', 'category',
               'reward_mode', 'reward_options', 'number_field', 'digits', 'rules_count',
               'material', 'notified', 'position', 'count'
             ]
             else array[]::text[]
           end
         )
      ),
      '{}'::jsonb
    )
  end
$function$;
revoke all on function admin_audit_redact(text,jsonb) from public, anon, authenticated, service_role;

-- ------------------------------------------------ 5. Los disparadores de 0077
CREATE TRIGGER organizations_seed_commission_tiers AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION organizations_seed_commission_tiers();
CREATE TRIGGER memberships_validate_commission BEFORE INSERT OR UPDATE OF commission_model, fixed_commission_amount ON public.memberships FOR EACH ROW EXECUTE FUNCTION memberships_validate_commission();
CREATE TRIGGER memberships_sync_commission AFTER UPDATE OF parent_seller_id, commission_model, fixed_commission_amount ON public.memberships FOR EACH ROW EXECUTE FUNCTION memberships_sync_commission();

-- ------------------------- 6. Recuento con el motor de 0077, y la prueba de que no movió dinero
do $recuento$
declare
  r           record;
  v_distintas integer;
  v_nuevas    integer;
  v_antes     record;
  v_despues   record;
begin
  for r in
    select organization_id, raffle_id, seller_id from seller_commissions
    union
    select t.organization_id, t.raffle_id, m.parent_seller_id
    from tickets t
    join memberships m
      on m.profile_id = t.seller_id and m.organization_id = t.organization_id
    where m.parent_seller_id is not null
      and t.inventory_status = 'assigned'
      and t.payment_status = 'paid'
    group by t.organization_id, t.raffle_id, m.parent_seller_id
  loop
    perform recalc_seller_commission(r.organization_id, r.raffle_id, r.seller_id);
  end loop;

  select count(*) into v_distintas
  from antes_0079_a_0077 a
  join seller_commissions sc using (raffle_id, seller_id)
  where (a.tickets_paid, a.earned, a.team_tickets_paid, a.team_earned)
        is distinct from (sc.tickets_paid, sc.earned, sc.team_tickets_paid, sc.team_earned);

  select count(*) into v_nuevas
  from seller_commissions sc
  where not exists (select 1 from antes_0079_a_0077 a where a.raffle_id = sc.raffle_id and a.seller_id = sc.seller_id)
    and (sc.tickets_paid <> 0 or sc.earned <> 0 or sc.team_tickets_paid <> 0 or sc.team_earned <> 0);

  select * into v_antes from ledger_antes_0079_a_0077;
  select count(*) as filas, coalesce(sum(amount), 0) as suma into v_despues from commission_ledger;

  if v_distintas <> 0 or v_nuevas <> 0 or v_despues.filas <> v_antes.filas or v_despues.suma <> v_antes.suma then
    raise exception 'La recuperación cambiaría dinero: % filas distintas, % filas nuevas con importe, ledger de % a % filas. No se aplica.',
      v_distintas, v_nuevas, v_antes.filas, v_despues.filas;
  end if;

  raise notice 'Recuperación a 0077: esquema devuelto y % filas de comisión recontadas sin mover dinero.',
    (select count(*) from seller_commissions);
end
$recuento$;

commit;
