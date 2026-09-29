-- =============================================================================
-- 0079_earning_reorganization_and_team_agreement_owner.sql
-- Dos correcciones de la configuracion de ganancias (D-237), antes de publicarla
--
-- Referencia: docs/DECISIONS.md D-238; docs/KNOWN_ISSUES.md I-180 e I-181;
-- docs/BUSINESS_RULES.md BR-G25, BR-G33 y BR-G34.
--
-- 1. REORGANIZAR RECALCULA AL PADRE NUEVO (I-180). `memberships_sync_commission`
--    recalculaba al integrante y, a mano, al padre ANTERIOR; al padre NUEVO lo
--    dejaba en manos de la cascada del motor. Pero el motor no cascadea cuando lo
--    del integrante no cambia —es su camino de idempotencia (BR-G08)—, y eso es
--    justo lo que pasa en un traslado entre equipos con el mismo acuerdo de equipo,
--    o al entrar a un equipo con una tarifa igual a la del acuerdo administrativo:
--    el padre anterior perdia las boletas y el nuevo no las recibia. El defecto es
--    de la `0031` (D-127), no de D-237: la `0078` conservo la misma estructura.
--    Ahora el padre nuevo se recalcula igual que el anterior, en las rifas del
--    integrante y con el integrante como procedencia de su linea de equipo. Si la
--    cascada ya lo hizo, el motor no escribe nada: no hay movimientos de mas.
--
--    Dos traslados cruzados a la vez —uno de A a B y otro de B a A— bloquearian
--    ahora las filas de los dos jefes en orden contrario. Por eso el disparador de
--    validacion toma, al reorganizar, los cerrojos de los DOS jefes en un orden
--    fijo (`commission_team_lock`, el de BR-G33): uno espera al otro.
--
-- 2. EL ACUERDO DE EQUIPO LO ADJUDICA SOLO EL PADRE (I-181, BR-G34). El
--    disparador de la `0078` dejaba cambiarlo al padre O a quien tuviera
--    `sellers.earnings.manage`, y la politica `memberships_update_staff` lo abria
--    por PostgREST al Dueño y al Administrador aunque la interfaz no ofreciera el
--    boton. Ahora solo el padre actual cambia `commission_model`,
--    `fixed_commission_amount` o `team_tier_list_id`; el personal sigue decidiendo
--    QUIEN es el padre (BR-E06, BR-E08) y los acuerdos administrativos. Completar
--    la lista general al entrar a un equipo lo hace la base, no quien reorganiza,
--    asi que no cuenta como cambiar el acuerdo. Sin sesion (la service role, una
--    migracion) no hay actor y no se mira.
--
-- LO QUE NO CAMBIA: el motor (`recalc_seller_commission`), las formulas, los dos
-- niveles, la compatibilidad padre-hijo, las rebajas, las RPC y sus privilegios.
-- Ni una fila de datos: la seccion 3 lo comprueba y se detiene si algo cambiaria.
-- =============================================================================

-- =============================================================================
-- 1. La validacion de los dos acuerdos, con el permiso del acuerdo de equipo en
--    su sitio y los cerrojos de una reorganizacion
--
-- Es la de la `0078` con tres cambios, y ninguna regla de acuerdo distinta:
--   * lo que PIDE quien escribe se mira ANTES de completar nada;
--   * los permisos van antes que las reglas del acuerdo, como el alta (E1-05):
--     quien no puede cambiar algo no recibe explicaciones de por que no valdria;
--   * al reorganizar se toman los cerrojos del jefe de antes y del de ahora.
-- =============================================================================

create or replace function memberships_validate_seller_agreements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid               uuid := auth.uid();
  v_insert            boolean := tg_op = 'INSERT';
  v_parent_changed    boolean;
  v_team_requested    boolean;
  v_team_changed      boolean;
  v_direct_changed    boolean;
  v_effective_changed boolean;
  v_kind              commission_tier_list_kind;
  v_owner             uuid;
  v_head              uuid;
  v_parent            record;
  v_child             record;
  v_problem           text;
  v_actor             text;
begin
  v_parent_changed := v_insert or new.parent_seller_id is distinct from old.parent_seller_id;

  -- 0. Lo que PIDE quien escribe en el acuerdo de equipo, antes de que el paso 2
  --    complete la lista. Un alta que no dice nada toma el valor por defecto
  --    —tramos con la lista general— y eso no es pedir nada (D-238).
  v_team_requested := case
    when v_insert then new.commission_model <> 'tiered'
                       or new.fixed_commission_amount is not null
                       or new.team_tier_list_id is not null
    else (new.commission_model, new.fixed_commission_amount, new.team_tier_list_id)
         is distinct from (old.commission_model, old.fixed_commission_amount, old.team_tier_list_id)
  end;
  v_direct_changed := v_insert
    or (new.direct_commission_mode, new.direct_fixed_amount, new.direct_tier_list_id)
       is distinct from (old.direct_commission_mode, old.direct_fixed_amount, old.direct_tier_list_id);

  -- 1. Quien puede (BR-G34). Solo con sesion: un proceso de la service role o
  --    una migracion no tienen `auth.uid()`.
  if v_uid is not null then
    -- El alta de un vendedor, antes que cualquier regla de su acuerdo: solo el
    -- personal con la capacidad o su propio vendedor padre (E1-05).
    if v_insert and new.role = 'seller'
       and not (new.parent_seller_id is not distinct from v_uid
                or has_org_capability(new.organization_id, 'sellers.earnings.manage')) then
      raise exception 'No tienes permiso para dar de alta a este vendedor.'
        using errcode = 'insufficient_privilege';
    end if;

    -- El acuerdo administrativo, el personal con la capacidad.
    if ((not v_insert and v_direct_changed) or (v_insert and new.direct_commission_mode <> 'half_price'))
       and not has_org_capability(new.organization_id, 'sellers.earnings.manage') then
      raise exception 'No tienes permiso para cambiar cómo se le paga a este vendedor.'
        using errcode = 'insufficient_privilege';
    end if;

    -- El acuerdo de equipo, SOLO su vendedor padre, el de antes y el de ahora: el
    -- personal decide quien es el padre, no lo que este le paga (D-238, I-181). El
    -- padre no puede cambiar `parent_seller_id` (BR-E06), asi que en su propio
    -- cambio los dos coinciden.
    if v_team_requested
       and not (new.parent_seller_id is not distinct from v_uid
                and (v_insert or old.parent_seller_id is not distinct from v_uid)) then
      raise exception 'La ganancia de un integrante la decide su vendedor a cargo. Pídele que la cambie desde «Mi equipo».'
        using errcode = 'insufficient_privilege';
    end if;

    -- La mitad del precio se conserva para quien ya la tiene; ninguna sesion la
    -- asigna de nuevo, ni al dar de alta ni al cambiar un acuerdo (BR-G30).
    if new.role = 'seller' and new.direct_commission_mode = 'half_price'
       and ((v_insert and new.parent_seller_id is null)
            or (not v_insert and old.direct_commission_mode <> 'half_price')) then
      raise exception 'La mitad del precio se conserva para quien ya la tiene, pero no se puede asignar de nuevo. Elige una ganancia fija o por tramos.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- 2. El acuerdo de equipo, completo. Con fijo no hay lista; por tramos dentro
  --    de un equipo, la version de la lista general que rige al empezar a regir
  --    (entrar al equipo o pasar a tramos). Fuera de un equipo queda como este.
  if new.commission_model = 'fixed_per_ticket' then
    new.team_tier_list_id := null;
  elsif new.parent_seller_id is not null and new.team_tier_list_id is null then
    new.team_tier_list_id := commission_current_template(new.organization_id);
  end if;

  v_team_changed := v_insert
    or (new.commission_model, new.fixed_commission_amount, new.team_tier_list_id)
       is distinct from (old.commission_model, old.fixed_commission_amount, old.team_tier_list_id);

  -- 3. Que lista puede usar cada acuerdo (la organizacion la garantizan las FK
  --    compuestas). El de equipo usa la lista general: el padre elige tramos o
  --    fijo, no escribe tramos (BR-G24). El administrativo, la general o una
  --    personalizada DE ESTE vendedor (BR-G29).
  if new.team_tier_list_id is not null
     and (v_insert or new.team_tier_list_id is distinct from old.team_tier_list_id) then
    select l.kind into v_kind from commission_tier_lists l where l.id = new.team_tier_list_id;
    if v_kind is distinct from 'template' then
      raise exception 'La ganancia por tramos de un integrante usa la lista general.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.direct_tier_list_id is not null
     and (v_insert or new.direct_tier_list_id is distinct from old.direct_tier_list_id) then
    select l.kind, l.owner_profile_id into v_kind, v_owner
    from commission_tier_lists l where l.id = new.direct_tier_list_id;
    if v_kind = 'custom' and v_owner is distinct from new.profile_id then
      raise exception 'Esa lista de tramos es de otro vendedor.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- 4. Dos niveles (BR-E03). Quien ya tiene equipo no pasa al de otro (I-176).
  if new.parent_seller_id is not null and v_parent_changed
     and exists (
       select 1 from memberships h
       where h.parent_seller_id = new.profile_id
         and h.organization_id = new.organization_id
     ) then
    raise exception '% tiene su propio equipo y no puede pasar al equipo de otro vendedor.',
      commission_person_name(new.profile_id)
      using errcode = 'check_violation';
  end if;

  -- 5. Reorganizar toca DOS equipos: el de antes pierde al integrante y el de
  --    ahora lo recibe, y `memberships_sync_commission` recalcula a los dos. Sus
  --    cerrojos se toman aqui, antes que ninguna fila, en un orden fijo: dos
  --    traslados cruzados se esperan en vez de abrazarse (D-238). El del padre
  --    nuevo se vuelve a pedir en el paso 6; el mismo cerrojo dos veces en una
  --    transaccion no espera.
  if not v_insert and v_parent_changed then
    for v_head in
      select distinct j
      from unnest(array[old.parent_seller_id, new.parent_seller_id]) as j
      where j is not null
      order by j
    loop
      perform commission_team_lock(v_head);
    end loop;
  end if;

  if new.role <> 'seller' then
    return new;
  end if;

  -- 6. Compatibilidad padre–hijo (BR-G28), bajo el cerrojo del equipo.
  if new.parent_seller_id is not null and (v_parent_changed or v_team_changed) then
    perform commission_team_lock(new.parent_seller_id);

    select m.direct_commission_mode, m.direct_fixed_amount, m.direct_tier_list_id
      into v_parent
    from memberships m
    where m.profile_id = new.parent_seller_id
      and m.organization_id = new.organization_id;

    v_actor := case when v_uid is not null and v_uid = new.parent_seller_id then 'parent' else 'staff' end;

    v_problem := commission_pair_problem(
      new.organization_id,
      new.parent_seller_id, v_parent.direct_commission_mode, v_parent.direct_fixed_amount,
      v_parent.direct_tier_list_id,
      new.profile_id, commission_team_mode(new.commission_model), new.fixed_commission_amount,
      new.team_tier_list_id,
      'child', v_actor
    );
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;
  end if;

  if new.parent_seller_id is null and not v_insert and v_direct_changed then
    perform commission_team_lock(new.profile_id);

    for v_child in
      select m.profile_id, m.commission_model, m.fixed_commission_amount, m.team_tier_list_id
      from memberships m
      where m.parent_seller_id = new.profile_id
        and m.organization_id = new.organization_id
      order by m.profile_id
    loop
      v_problem := commission_pair_problem(
        new.organization_id,
        new.profile_id, new.direct_commission_mode, new.direct_fixed_amount, new.direct_tier_list_id,
        v_child.profile_id, commission_team_mode(v_child.commission_model),
        v_child.fixed_commission_amount, v_child.team_tier_list_id,
        'parent', 'staff'
      );
      if v_problem is not null then
        raise exception '%', v_problem using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  -- 7. Las rebajas ya concedidas tienen que seguir cabiendo (BR-G31).
  v_effective_changed := not v_insert and (
    v_parent_changed
    or (new.parent_seller_id is null and v_direct_changed)
    or (new.parent_seller_id is not null and v_team_changed)
  );

  if v_effective_changed then
    if new.parent_seller_id is null then
      v_problem := commission_discount_problem(
        new.organization_id, new.profile_id,
        new.direct_commission_mode, new.direct_fixed_amount, new.direct_tier_list_id
      );
    else
      v_problem := commission_discount_problem(
        new.organization_id, new.profile_id,
        commission_team_mode(new.commission_model), new.fixed_commission_amount, new.team_tier_list_id
      );
    end if;
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function memberships_validate_seller_agreements() is
  'D-237, D-238: completa el acuerdo de equipo con la version vigente de la lista general, y valida en todo camino quien puede cambiar cada acuerdo (BR-G34: el administrativo el personal con la capacidad; el de equipo SOLO su vendedor padre), que nadie reciba la mitad de nuevo (BR-G30), la lista que usa cada acuerdo, los dos niveles (I-176), la compatibilidad padre-hijo (BR-G28) y las rebajas ya concedidas (BR-G31). Al reorganizar toma los cerrojos de los dos jefes en orden.';

-- =============================================================================
-- 2. Reorganizar recalcula al padre nuevo (I-180)
-- =============================================================================

create or replace function memberships_sync_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila record;
begin
  if (new.parent_seller_id, new.commission_model, new.fixed_commission_amount, new.team_tier_list_id,
      new.direct_commission_mode, new.direct_fixed_amount, new.direct_tier_list_id)
     is not distinct from
     (old.parent_seller_id, old.commission_model, old.fixed_commission_amount, old.team_tier_list_id,
      old.direct_commission_mode, old.direct_fixed_amount, old.direct_tier_list_id)
  then
    return null;
  end if;

  -- El afectado, en todas sus rifas (BR-G16, BR-G25). Si es un jefe, su fila
  -- recuenta lo propio y lo del equipo; si es un integrante y su cifra cambia, la
  -- cascada lleva el cambio a su padre ACTUAL.
  for v_fila in
    select raffle_id from seller_commissions where seller_id = new.profile_id
  loop
    perform recalc_seller_commission(new.organization_id, v_fila.raffle_id, new.profile_id);
  end loop;

  -- El padre NUEVO, en las rifas del integrante (D-238, I-180). La cascada del
  -- motor solo lo alcanza si lo del integrante cambio: en un traslado con el
  -- mismo acuerdo de equipo, o al entrar con una tarifa igual a la de su acuerdo
  -- administrativo, el motor se detiene en su camino de idempotencia y el padre
  -- nuevo nunca se enteraba. Si la cascada ya lo recalculo, aqui no escribe nada
  -- (BR-G08). La linea de equipo lleva al integrante como procedencia (BR-G22).
  if new.parent_seller_id is not null
     and new.parent_seller_id is distinct from old.parent_seller_id
  then
    for v_fila in
      select raffle_id from seller_commissions where seller_id = new.profile_id
    loop
      perform recalc_seller_commission(
        new.organization_id, v_fila.raffle_id, new.parent_seller_id, null, null, new.profile_id
      );
    end loop;
  end if;

  -- Y el padre ANTERIOR, al que la cascada ya no alcanza.
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

comment on function memberships_sync_commission() is
  'D-237, D-238: al cambiar un acuerdo o el padre, recalcula en la misma transaccion al afectado en todas sus rifas, a su padre NUEVO en las rifas del integrante (aunque lo del integrante no cambie, I-180) y a su padre ANTERIOR (BR-G16, BR-G25, BR-G33).';

-- `create or replace` conserva los privilegios; se repiten por si acaso (I-132).
revoke execute on function memberships_validate_seller_agreements() from public, anon, authenticated, service_role;
revoke execute on function memberships_sync_commission() from public, anon, authenticated, service_role;

-- =============================================================================
-- 3. La prueba de que no mueve dinero, y de quien ejecuta que
--
-- Esta migracion no cambia ninguna formula: recontar todo con el motor tiene que
-- dejar cada cifra y el ledger exactamente como estaban. Si algo cambiara es que
-- ya habia una fila desfasada —por ejemplo, un traslado hecho con la `0078` y sin
-- esta correccion—: arreglarla cambia dinero y lo decide el dueño (BR-G35), asi
-- que la migracion se deshace entera y lo dice.
-- =============================================================================

do $$
declare
  r             record;
  v_distintas   integer;
  v_antes       record;
  v_ledger      record;
  v_privilegios text;
begin
  create temporary table antes_0079 as
  select raffle_id, seller_id, tickets_paid, rate, earned, team_tickets_paid, team_earned,
         tier_tickets_paid, team_shortfall
  from seller_commissions;

  select count(*) as filas, coalesce(sum(amount), 0) as suma into v_antes from commission_ledger;

  -- Todas las filas, y la de todo jefe con boletas COBRADAS de su equipo: si le
  -- faltara, es exactamente lo que I-180 dejaba sin escribir. Un jefe cuyo equipo
  -- solo tiene boletas sin cobrar no necesita fila, y no se le crea una en cero.
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
  from seller_commissions sc
  left join antes_0079 a using (raffle_id, seller_id)
  where a.seller_id is null
     or (a.tickets_paid, a.rate, a.earned, a.team_tickets_paid, a.team_earned,
         a.tier_tickets_paid, a.team_shortfall)
        is distinct from
        (sc.tickets_paid, sc.rate, sc.earned, sc.team_tickets_paid, sc.team_earned,
         sc.tier_tickets_paid, sc.team_shortfall);

  select count(*) as filas, coalesce(sum(amount), 0) as suma into v_ledger from commission_ledger;
  drop table antes_0079;

  if v_distintas <> 0 or v_ledger.filas <> v_antes.filas or v_ledger.suma <> v_antes.suma then
    raise exception '0079 encontró % filas de comisión desfasadas (ledger de % a % filas). Arreglarlas cambia dinero: revisa el diagnóstico de RUNBOOK §10 antes de aplicarla. No se aplica.',
      v_distintas, v_antes.filas, v_ledger.filas;
  end if;

  -- Las dos funciones de esta migracion, internas: nadie las ejecuta.
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_privilegios
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('memberships_validate_seller_agreements', 'memberships_sync_commission')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or has_function_privilege('service_role', p.oid, 'EXECUTE'));

  if v_privilegios is not null then
    raise exception '0079: privilegios de EXECUTE distintos de los esperados: %', v_privilegios;
  end if;
end
$$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Volver a los cuerpos de la `0078` de `memberships_validate_seller_agreements`
-- (seccion 7) y `memberships_sync_commission` (seccion 9), con `create or
-- replace`. No toca datos. Revertirla devuelve los dos defectos: un traslado con
-- el mismo acuerdo deja al padre nuevo sin sus boletas, y el personal vuelve a
-- poder cambiar por PostgREST el acuerdo de equipo de un integrante. La
-- recuperacion completa de la publicacion esta en
-- `supabase/recovery/0079_a_0077.sql` y `docs/RUNBOOK.md` §10.
-- =============================================================================
