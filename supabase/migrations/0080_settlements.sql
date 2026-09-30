-- =============================================================================
-- 0080 — Cierre de cuentas (D-241, BR-Z01..BR-Z18)
--
-- EL DINERO SIGUE LA CADENA DE LA ORGANIZACION: el integrante entrega a su
-- vendedor a cargo y el vendedor a cargo entrega al dueño. El dueño cierra UNA
-- cuenta por vendedor directo, con las ventas de su equipo dentro; el vendedor a
-- cargo cierra, por su lado, una cuenta con cada integrante. Nadie cobra dos
-- veces lo mismo: lo que un integrante entrega a su vendedor a cargo no aumenta
-- lo recibido por el dueño.
--
-- NO HAY UN MOTOR DE GANANCIAS NUEVO. Lo que gana cada quien sale de
-- `seller_commissions`, que escribe el motor publicado (0078, 0079): `earned` es
-- lo propio —ya con sus rebajas— y `team_earned` lo que un jefe gana por las
-- ventas de su equipo (su tarifa menos la del integrante, BR-G20). Aqui solo se
-- lee. El valor de una boleta pagada es su `sale_price`: lo que se cobro de
-- verdad, nunca el precio de hoy multiplicado otra vez.
--
-- TRES TABLAS, las tres INMUTABLES salvo la anulacion:
--
--   settlement_transfers      el dinero que pasa de una persona a otra: una
--                             ENTREGA hacia arriba o una DEVOLUCION hacia abajo.
--                             La confirma SIEMPRE quien recibe.
--   settlement_prize_payments quien pago un premio, cuanto y cuando. Un premio
--                             ganado no es un premio pagado, y ninguno se da por
--                             pagado sin este registro.
--   settlement_closings       la foto de una cuenta al quedar saldada. Un cambio
--                             posterior no la toca: se enseña como diferencia.
--
-- LA CUENTA SE CALCULA, NO SE GUARDA. Cada cifra sale de las boletas pagadas,
-- de `seller_commissions` y de estas tablas en el momento de leerla, con la
-- estructura de equipos de HOY. Lo que se guarda son los hechos —entregas,
-- premios pagados y cierres—, nunca un saldo.
--
-- CAMBIOS DE EQUIPO. El motor ya recalcula las ganancias con la estructura
-- actual (BR-G31). El DINERO, en cambio, se queda con quien lo recibio: una
-- entrega a un vendedor a cargo anterior sigue siendo dinero que TIENE el; no se
-- le atribuye al nuevo (BR-Z10). Por eso cada persona tiene su parte, y la
-- cuenta de un vendedor directo es la suma de la suya y la de su equipo de hoy:
--
--   parte(s) = cobrado(s) − ganado(s) − ganado_de_equipo(s) − premios_que_pago(s)
--              − entregado(s) + devuelto_a(s) + recibido_de_integrantes(s)
--              − devuelto_a_integrantes(s)
--
-- Las entregas dentro de una misma cuenta se anulan entre si; las que cruzan de
-- una cuenta a otra aparecen como «otros movimientos», explicitas.
--
-- PRIVACIDAD (BR-Z13). Es una excepcion ACOTADA a BR-Q01/BR-Q08 y a BR-E05: el
-- personal y el vendedor a cargo ven cifras AGREGADAS de una cuenta —boletas
-- pagadas, su valor, ganancias, premios y entregas—. Nunca un cliente, un abono
-- de una boleta sin pagar ni un pago de un cliente.
-- =============================================================================

-- =============================================================================
-- 1. Tipos
-- =============================================================================

create type settlement_transfer_kind as enum ('delivery', 'refund');

comment on type settlement_transfer_kind is
  'D-241: delivery = el vendedor entrega dinero hacia arriba (a su vendedor a cargo o al dueño); refund = le devuelven dinero que tenia a su favor.';

create type settlement_prize_payer as enum ('seller', 'organization');

comment on type settlement_prize_payer is
  'D-241: quien pago un premio. seller = el vendedor de la boleta o su vendedor a cargo (payer_id); organization = el dueño.';

create type settlement_close_cause as enum ('transfer', 'prize_payment', 'manual');

create type settlement_account_status as enum (
  'no_activity',   -- ni boletas pagadas ni movimientos
  'missing_info',  -- un premio sin pago registrado, o un pago que ya no tiene premio
  'pending',       -- saldo por recibir y ninguna entrega
  'partial',       -- saldo por recibir y alguna entrega
  'in_favor',      -- saldo a favor del vendedor
  'to_close',      -- saldo en cero, sin informacion pendiente y sin cierre vigente
  'closed'         -- saldo en cero y un cierre con estas mismas cifras
);

comment on type settlement_account_status is
  'D-241: estado DERIVADO de una cuenta. No se guarda: lo calcula settlement_account_rows.';

-- =============================================================================
-- 2. Las tablas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 Entregas y devoluciones
--
-- `seller_id` es SIEMPRE el vendedor de la cuenta: quien entrega en una entrega y
-- quien recibe en una devolucion. `counterpart_id` es el otro extremo: NULL es el
-- dueño (la organizacion) y un perfil es un vendedor a cargo. `balance_before` y
-- `balance_after` son el saldo de ESA cuenta al confirmar, para la auditoria.
-- -----------------------------------------------------------------------------
create table settlement_transfers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  raffle_id       uuid not null,
  kind            settlement_transfer_kind not null,
  seller_id       uuid not null,
  counterpart_id  uuid,
  amount          bigint not null,
  received_on     date not null,
  confirmed_by    uuid not null references profiles(id) on delete restrict,
  confirmed_at    timestamptz not null default now(),
  request_id      uuid not null,
  balance_before  bigint not null,
  balance_after   bigint not null,
  voided_at       timestamptz,
  voided_by       uuid references profiles(id) on delete restrict,
  void_reason     text,
  constraint settlement_transfers_raffle_org_fk
    foreign key (raffle_id, organization_id) references raffles(id, organization_id) on delete restrict,
  constraint settlement_transfers_seller_org_fk
    foreign key (seller_id, organization_id) references memberships(profile_id, organization_id) on delete restrict,
  constraint settlement_transfers_counterpart_org_fk
    foreign key (counterpart_id, organization_id) references memberships(profile_id, organization_id) on delete restrict,
  constraint settlement_transfers_request_key unique (organization_id, request_id),
  constraint settlement_transfers_amount_check check (amount between 1 and 100000000000),
  constraint settlement_transfers_counterpart_check check (counterpart_id is null or counterpart_id <> seller_id),
  constraint settlement_transfers_balance_check check (
    balance_after = case kind when 'delivery' then balance_before - amount else balance_before + amount end
  ),
  constraint settlement_transfers_void_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null
        and void_reason = btrim(void_reason) and char_length(void_reason) between 5 and 500)
  )
);

create index settlement_transfers_raffle_idx on settlement_transfers (organization_id, raffle_id);
create index settlement_transfers_seller_idx on settlement_transfers (raffle_id, seller_id);
create index settlement_transfers_counterpart_idx on settlement_transfers (raffle_id, counterpart_id)
  where counterpart_id is not null;

comment on table settlement_transfers is
  'D-241, BR-Z05: dinero que pasa de una persona a otra dentro de una rifa. Lo confirma quien lo recibe. Inmutable salvo la anulacion.';

-- -----------------------------------------------------------------------------
-- 2.2 Premios pagados
--
-- Un premio se identifica como en el historial (D-208): la coincidencia y el
-- premio. La FK compuesta a la coincidencia amarra organizacion, rifa, resultado
-- y campo; la boleta y su vendedor se copian para no depender de lo que cambie
-- despues.
-- -----------------------------------------------------------------------------
create table settlement_prize_payments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete restrict,
  raffle_id         uuid not null,
  result_id         uuid not null,
  match_id          uuid not null,
  match_field       lottery_match_field not null,
  prize_id          uuid not null,
  ticket_id         uuid not null,
  ticket_seller_id  uuid not null,
  payer             settlement_prize_payer not null,
  payer_id          uuid,
  amount            bigint not null,
  value_was_pending boolean not null,
  paid_on           date not null,
  confirmed_by      uuid not null references profiles(id) on delete restrict,
  confirmed_at      timestamptz not null default now(),
  request_id        uuid not null,
  voided_at         timestamptz,
  voided_by         uuid references profiles(id) on delete restrict,
  void_reason       text,
  constraint settlement_prize_payments_match_fk
    foreign key (match_id, result_id, organization_id, raffle_id, match_field)
    references lottery_ticket_matches(id, result_id, organization_id, raffle_id, match_field) on delete restrict,
  constraint settlement_prize_payments_prize_fk
    foreign key (prize_id, raffle_id, organization_id) references raffle_prizes(id, raffle_id, organization_id) on delete restrict,
  constraint settlement_prize_payments_ticket_org_fk
    foreign key (ticket_id, organization_id) references tickets(id, organization_id) on delete restrict,
  constraint settlement_prize_payments_ticket_seller_org_fk
    foreign key (ticket_seller_id, organization_id) references memberships(profile_id, organization_id) on delete restrict,
  constraint settlement_prize_payments_payer_org_fk
    foreign key (payer_id, organization_id) references memberships(profile_id, organization_id) on delete restrict,
  constraint settlement_prize_payments_request_key unique (organization_id, request_id),
  constraint settlement_prize_payments_payer_check check ((payer = 'organization') = (payer_id is null)),
  constraint settlement_prize_payments_amount_check check (amount between 1 and 10000000000),
  constraint settlement_prize_payments_void_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null
        and void_reason = btrim(void_reason) and char_length(void_reason) between 5 and 500)
  )
);

-- Un premio tiene UN pago vigente: el descuento no se puede aplicar dos veces
-- (BR-Z08), ni con dos pestañas ni con dos personas a la vez.
create unique index settlement_prize_payments_live_key
  on settlement_prize_payments (match_id, prize_id) where voided_at is null;
create index settlement_prize_payments_raffle_idx on settlement_prize_payments (organization_id, raffle_id);

comment on table settlement_prize_payments is
  'D-241, BR-Z07: quien pago un premio ganado, cuanto y cuando, y quien lo confirmo. Inmutable salvo la anulacion.';

-- -----------------------------------------------------------------------------
-- 2.3 Cierres
--
-- `seller_id` es el titular de la cuenta; `counterpart_id`, NULL para la cuenta
-- con el dueño y el vendedor a cargo para la de un integrante. `figures` son las
-- cifras con las que quedo saldada y `fingerprint` su huella: el cierre VIGENTE
-- es el de la ultima version cuya huella coincide con la de hoy.
-- -----------------------------------------------------------------------------
create table settlement_closings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  raffle_id       uuid not null,
  seller_id       uuid not null,
  counterpart_id  uuid,
  version         integer not null,
  fingerprint     text not null,
  figures         jsonb not null,
  closed_by       uuid not null references profiles(id) on delete restrict,
  closed_at       timestamptz not null default now(),
  cause           settlement_close_cause not null,
  cause_id        uuid,
  constraint settlement_closings_raffle_org_fk
    foreign key (raffle_id, organization_id) references raffles(id, organization_id) on delete restrict,
  constraint settlement_closings_seller_org_fk
    foreign key (seller_id, organization_id) references memberships(profile_id, organization_id) on delete restrict,
  constraint settlement_closings_counterpart_org_fk
    foreign key (counterpart_id, organization_id) references memberships(profile_id, organization_id) on delete restrict,
  constraint settlement_closings_version_key
    unique nulls not distinct (organization_id, raffle_id, seller_id, counterpart_id, version),
  constraint settlement_closings_version_check check (version >= 1),
  constraint settlement_closings_fingerprint_check check (fingerprint ~ '^[0-9a-f]{32}$'),
  constraint settlement_closings_cause_check check ((cause = 'manual') = (cause_id is null))
);

create index settlement_closings_raffle_idx on settlement_closings (organization_id, raffle_id);

comment on table settlement_closings is
  'D-241, BR-Z11: la foto auditable de una cuenta saldada. Cerrar una cuenta no cierra la rifa. Inmutable.';

-- -----------------------------------------------------------------------------
-- 2.4 Inmutabilidad
--
-- Nada se borra. De una entrega o de un pago de premio solo se puede escribir la
-- anulacion, una vez; un cierre no se toca nunca.
-- -----------------------------------------------------------------------------
create function settlement_rows_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los registros del cierre de cuentas no se borran: se anulan.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_table_name = 'settlement_closings' then
    raise exception 'Un cierre no se modifica. Los cambios posteriores se revisan como diferencia.'
      using errcode = 'insufficient_privilege';
  end if;

  if old.voided_at is not null then
    raise exception 'Este registro ya está anulado.' using errcode = 'check_violation';
  end if;

  if new.voided_at is null
     or (to_jsonb(new) - array['voided_at', 'voided_by', 'void_reason'])
        is distinct from (to_jsonb(old) - array['voided_at', 'voided_by', 'void_reason'])
  then
    raise exception 'De este registro solo se puede escribir su anulación.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger settlement_transfers_guard
  before update or delete on settlement_transfers
  for each row execute function settlement_rows_guard();

create trigger settlement_prize_payments_guard
  before update or delete on settlement_prize_payments
  for each row execute function settlement_rows_guard();

create trigger settlement_closings_guard
  before update or delete on settlement_closings
  for each row execute function settlement_rows_guard();

-- -----------------------------------------------------------------------------
-- 2.5 Acceso: solo por las funciones de este archivo
--
-- RLS activa y forzada SIN politicas: ninguna sesion lee ni escribe filas
-- directamente. Todo pasa por las RPC, que autorizan y proyectan. La service
-- role conserva la lectura para el diagnostico operativo.
-- -----------------------------------------------------------------------------
alter table settlement_transfers enable row level security;
alter table settlement_transfers force row level security;
alter table settlement_prize_payments enable row level security;
alter table settlement_prize_payments force row level security;
alter table settlement_closings enable row level security;
alter table settlement_closings force row level security;

revoke all on settlement_transfers from public, anon, authenticated, service_role;
revoke all on settlement_prize_payments from public, anon, authenticated, service_role;
revoke all on settlement_closings from public, anon, authenticated, service_role;
grant select on settlement_transfers to service_role;
grant select on settlement_prize_payments to service_role;
grant select on settlement_closings to service_role;

-- =============================================================================
-- 3. La capacidad (D-200): recibir el dinero de los vendedores
--
-- Los mismos dos espejos de siempre: aqui y `src/lib/auth/capabilities.ts`,
-- comparados por una prueba. El Dueño las tiene todas; el Administrador recibe
-- esta por la politica predeterminada, porque el dueño pidio que ambos cierren
-- cuentas (D-241). `create or replace` conserva el propietario y los privilegios
-- que dejo la 0066.
-- =============================================================================

create or replace function app_capability_catalog()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array['raffles.prizes.manage', 'sellers.earnings.manage', 'settlements.manage']::text[]
$$;

create or replace function app_role_default_capabilities(p_role app_role)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_role
    when 'owner' then app_capability_catalog()
    when 'admin' then array['raffles.prizes.manage', 'sellers.earnings.manage', 'settlements.manage']::text[]
    else array[]::text[]
  end
$$;

-- =============================================================================
-- 4. Las lecturas internas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 Las cifras de cada persona en una rifa
--
-- Una fila por cada persona con algo en la rifa: boletas, ganancias, entregas,
-- premios o pagos de premios. Todo con la estructura de HOY (`parent_id`).
--
--   collected      lo que valen sus boletas PAGADAS (su `sale_price`, BR-Z02)
--   partial_paid   lo abonado a sus boletas vendidas y aun no pagadas; solo lo
--                  ve ella misma (BR-Z03)
--   earned         lo propio, del motor, con sus rebajas
--   team_earned    lo que gana por las ventas de su equipo, del motor
--   prizes_paid    los premios que pago ella, de cualquier boleta
--   prize_cost     lo pagado por los premios de SUS boletas, lo pagara quien lo pagara
--   sent_*/back_*  lo que entrego y lo que le devolvieron: al dueño, a cualquier
--                  vendedor a cargo, y al de HOY
--   got_members    lo que le entregaron sus integrantes (de hoy o de antes)
--   paid_members   lo que devolvio a sus integrantes
-- -----------------------------------------------------------------------------
create function settlement_seller_figures(p_org uuid, p_raffle uuid)
returns table (
  seller_id         uuid,
  seller_name       text,
  seller_role       app_role,
  seller_active     boolean,
  parent_id         uuid,
  tickets_active    integer,
  tickets_sold      integer,
  tickets_paid      integer,
  collected         bigint,
  partial_paid      bigint,
  earned            bigint,
  team_earned       bigint,
  rate              bigint,
  prizes_paid       bigint,
  prize_cost        bigint,
  prize_cost_org    bigint,
  sent_org          bigint,
  back_org          bigint,
  sent_heads        bigint,
  back_heads        bigint,
  sent_parent       bigint,
  back_parent       bigint,
  got_members       bigint,
  paid_members      bigint,
  awards            integer,
  awards_unpaid     integer,
  awards_blocked    integer,
  payments_orphaned integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with
  tk as (
    select t.seller_id,
           count(*) filter (where t.inventory_status in ('available', 'assigned'))::integer as tickets_active,
           count(*) filter (where t.inventory_status = 'assigned')::integer as tickets_sold,
           count(*) filter (where t.inventory_status = 'assigned' and t.payment_status = 'paid')::integer as tickets_paid,
           coalesce(sum(t.sale_price) filter (where t.inventory_status = 'assigned' and t.payment_status = 'paid'), 0)::bigint as collected,
           coalesce(sum(t.paid_amount) filter (where t.inventory_status = 'assigned' and t.payment_status <> 'paid'), 0)::bigint as partial_paid
    from tickets t
    where t.organization_id = p_org and t.raffle_id = p_raffle
    group by t.seller_id
  ),
  cm as (
    select sc.seller_id, sc.earned, sc.team_earned, sc.rate
    from seller_commissions sc
    where sc.organization_id = p_org and sc.raffle_id = p_raffle
  ),
  tr as (
    select x.kind, x.seller_id, x.counterpart_id, x.amount
    from settlement_transfers x
    where x.organization_id = p_org and x.raffle_id = p_raffle and x.voided_at is null
  ),
  aw as (
    select distinct on (a.match_id, a.prize_id) a.match_id, a.prize_id, a.seller_id, a.result_conflict
    from prize_award_rows(array[p_org], null, p_raffle, null, null, null) a
    order by a.match_id, a.prize_id, a.origin desc
  ),
  pp as (
    select y.match_id, y.prize_id, y.ticket_seller_id, y.payer, y.payer_id, y.amount
    from settlement_prize_payments y
    where y.organization_id = p_org and y.raffle_id = p_raffle and y.voided_at is null
  ),
  aw_s as (
    select aw.seller_id,
           count(*)::integer as awards,
           count(*) filter (where pp.match_id is null)::integer as awards_unpaid,
           count(*) filter (where pp.match_id is null and aw.result_conflict)::integer as awards_blocked
    from aw
    left join pp on pp.match_id = aw.match_id and pp.prize_id = aw.prize_id
    group by aw.seller_id
  ),
  pp_payer as (
    select pp.payer_id as seller_id, sum(pp.amount)::bigint as prizes_paid
    from pp
    where pp.payer = 'seller'
    group by pp.payer_id
  ),
  pp_ticket as (
    select pp.ticket_seller_id as seller_id,
           sum(pp.amount)::bigint as prize_cost,
           coalesce(sum(pp.amount) filter (where pp.payer = 'organization'), 0)::bigint as prize_cost_org,
           count(*) filter (where aw.match_id is null)::integer as payments_orphaned
    from pp
    left join aw on aw.match_id = pp.match_id and aw.prize_id = pp.prize_id
    group by pp.ticket_seller_id
  ),
  tr_out as (
    select tr.seller_id,
           coalesce(sum(tr.amount) filter (where tr.kind = 'delivery' and tr.counterpart_id is null), 0)::bigint as sent_org,
           coalesce(sum(tr.amount) filter (where tr.kind = 'refund' and tr.counterpart_id is null), 0)::bigint as back_org,
           coalesce(sum(tr.amount) filter (where tr.kind = 'delivery' and tr.counterpart_id is not null), 0)::bigint as sent_heads,
           coalesce(sum(tr.amount) filter (where tr.kind = 'refund' and tr.counterpart_id is not null), 0)::bigint as back_heads
    from tr
    group by tr.seller_id
  ),
  tr_parent as (
    select tr.seller_id,
           coalesce(sum(tr.amount) filter (where tr.kind = 'delivery'), 0)::bigint as sent_parent,
           coalesce(sum(tr.amount) filter (where tr.kind = 'refund'), 0)::bigint as back_parent
    from tr
    join memberships m
      on m.organization_id = p_org
     and m.profile_id = tr.seller_id
     and m.role = 'seller'
     and m.parent_seller_id = tr.counterpart_id
    group by tr.seller_id
  ),
  tr_in as (
    select tr.counterpart_id as seller_id,
           coalesce(sum(tr.amount) filter (where tr.kind = 'delivery'), 0)::bigint as got_members,
           coalesce(sum(tr.amount) filter (where tr.kind = 'refund'), 0)::bigint as paid_members
    from tr
    where tr.counterpart_id is not null
    group by tr.counterpart_id
  ),
  ids as (
    select tk.seller_id from tk
    union select cm.seller_id from cm
    union select tr.seller_id from tr
    union select tr.counterpart_id from tr where tr.counterpart_id is not null
    union select aw.seller_id from aw
    union select pp.ticket_seller_id from pp
    union select pp.payer_id from pp where pp.payer_id is not null
  )
  select i.seller_id,
         coalesce(nullif(btrim(p.full_name), ''), 'Vendedor'),
         m.role,
         (m.is_active and p.is_active),
         case when m.role = 'seller' then m.parent_seller_id end,
         coalesce(tk.tickets_active, 0),
         coalesce(tk.tickets_sold, 0),
         coalesce(tk.tickets_paid, 0),
         coalesce(tk.collected, 0),
         coalesce(tk.partial_paid, 0),
         coalesce(cm.earned, 0),
         coalesce(cm.team_earned, 0),
         coalesce(cm.rate, 0),
         coalesce(pp_payer.prizes_paid, 0),
         coalesce(pp_ticket.prize_cost, 0),
         coalesce(pp_ticket.prize_cost_org, 0),
         coalesce(tr_out.sent_org, 0),
         coalesce(tr_out.back_org, 0),
         coalesce(tr_out.sent_heads, 0),
         coalesce(tr_out.back_heads, 0),
         coalesce(tr_parent.sent_parent, 0),
         coalesce(tr_parent.back_parent, 0),
         coalesce(tr_in.got_members, 0),
         coalesce(tr_in.paid_members, 0),
         coalesce(aw_s.awards, 0),
         coalesce(aw_s.awards_unpaid, 0),
         coalesce(aw_s.awards_blocked, 0),
         coalesce(pp_ticket.payments_orphaned, 0)
  from ids i
  join memberships m on m.organization_id = p_org and m.profile_id = i.seller_id
  join profiles p on p.id = i.seller_id
  left join tk on tk.seller_id = i.seller_id
  left join cm on cm.seller_id = i.seller_id
  left join aw_s on aw_s.seller_id = i.seller_id
  left join pp_payer on pp_payer.seller_id = i.seller_id
  left join pp_ticket on pp_ticket.seller_id = i.seller_id
  left join tr_out on tr_out.seller_id = i.seller_id
  left join tr_parent on tr_parent.seller_id = i.seller_id
  left join tr_in on tr_in.seller_id = i.seller_id
$$;

comment on function settlement_seller_figures(uuid, uuid) is
  'D-241: las cifras de cada persona de una rifa para el cierre de cuentas, con la estructura de equipos de hoy. Lee el motor de ganancias, no lo reemplaza. Interna.';

-- -----------------------------------------------------------------------------
-- 4.2 Las cuentas
--
-- Una fila por CUENTA: las de los vendedores directos con el dueño
-- (`counterpart_id` NULL, con su equipo de hoy dentro) y las de cada integrante
-- con su vendedor a cargo. El estado, la huella y el cierre vigente salen de
-- aqui y de ningun otro sitio.
--
--   owner_share      lo que queda para arriba despues de las ganancias
--   total_due        owner_share − premios que pagaron + otros movimientos
--   balance          total_due − entregado + devuelto
--   owner_gain       parte del dueño menos TODOS los premios pagados de las
--                    boletas de la cuenta, los pagara quien los pagara (BR-Z09).
--                    Solo en la cuenta con el dueño.
-- -----------------------------------------------------------------------------
create function settlement_account_rows(p_org uuid, p_raffle uuid)
returns table (
  holder_id           uuid,
  counterpart_id      uuid,
  holder_name         text,
  holder_role         app_role,
  holder_active       boolean,
  counterpart_name    text,
  members             integer,
  tickets_active      integer,
  tickets_sold        integer,
  tickets_paid        integer,
  own_tickets_paid    integer,
  team_tickets_paid   integer,
  collected           bigint,
  holder_earned       bigint,
  holder_team_earned  bigint,
  members_earned      bigint,
  owner_share         bigint,
  prizes_paid         bigint,
  other_movements     bigint,
  total_due           bigint,
  delivered           bigint,
  refunded            bigint,
  balance             bigint,
  awards              integer,
  awards_unpaid       integer,
  awards_blocked      integer,
  payments_orphaned   integer,
  prize_cost          bigint,
  prize_cost_org      bigint,
  owner_gain          bigint,
  holder_partial_paid bigint,
  holder_tickets_sold integer,
  status              settlement_account_status,
  fingerprint         text,
  figures             jsonb,
  closing_version     integer,
  closing_figures     jsonb,
  closed_at           timestamptz,
  closed_by_name      text,
  changed_after_close boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with
  f as (
    select * from settlement_seller_figures(p_org, p_raffle)
  ),
  top_accounts as (
    select coalesce(f.parent_id, f.seller_id) as holder_id,
           null::uuid as counterpart_id,
           (count(*) filter (where f.parent_id is not null))::integer as members,
           sum(f.tickets_active)::integer as tickets_active,
           sum(f.tickets_sold)::integer as tickets_sold,
           sum(f.tickets_paid)::integer as tickets_paid,
           coalesce(sum(f.tickets_paid) filter (where f.parent_id is null), 0)::integer as own_tickets_paid,
           coalesce(sum(f.tickets_paid) filter (where f.parent_id is not null), 0)::integer as team_tickets_paid,
           sum(f.collected)::bigint as collected,
           coalesce(sum(f.earned) filter (where f.parent_id is null), 0)::bigint as holder_earned,
           coalesce(sum(f.team_earned) filter (where f.parent_id is null), 0)::bigint as holder_team_earned,
           coalesce(sum(f.earned + f.team_earned) filter (where f.parent_id is not null), 0)::bigint as members_earned,
           sum(f.prizes_paid)::bigint as prizes_paid,
           sum(f.back_heads - f.sent_heads + f.got_members - f.paid_members)::bigint as other_movements,
           sum(f.sent_org)::bigint as delivered,
           sum(f.back_org)::bigint as refunded,
           sum(f.awards)::integer as awards,
           sum(f.awards_unpaid)::integer as awards_unpaid,
           sum(f.awards_blocked)::integer as awards_blocked,
           sum(f.payments_orphaned)::integer as payments_orphaned,
           sum(f.prize_cost)::bigint as prize_cost,
           sum(f.prize_cost_org)::bigint as prize_cost_org,
           coalesce(sum(f.partial_paid) filter (where f.parent_id is null), 0)::bigint as holder_partial_paid,
           coalesce(sum(f.tickets_sold) filter (where f.parent_id is null), 0)::integer as holder_tickets_sold
    from f
    group by coalesce(f.parent_id, f.seller_id)
  ),
  team_accounts as (
    select f.seller_id as holder_id,
           f.parent_id as counterpart_id,
           0 as members,
           f.tickets_active,
           f.tickets_sold,
           f.tickets_paid,
           f.tickets_paid as own_tickets_paid,
           0 as team_tickets_paid,
           f.collected,
           f.earned as holder_earned,
           f.team_earned as holder_team_earned,
           0::bigint as members_earned,
           f.prizes_paid,
           ((f.back_heads - f.back_parent) - (f.sent_heads - f.sent_parent)
             + f.got_members - f.paid_members - f.sent_org + f.back_org)::bigint as other_movements,
           f.sent_parent as delivered,
           f.back_parent as refunded,
           f.awards,
           f.awards_unpaid,
           f.awards_blocked,
           f.payments_orphaned,
           f.prize_cost,
           f.prize_cost_org,
           f.partial_paid as holder_partial_paid,
           f.tickets_sold as holder_tickets_sold
    from f
    where f.parent_id is not null
  ),
  base as (
    select * from top_accounts
    union all
    select * from team_accounts
  ),
  calc as (
    select b.*,
           (b.collected - b.holder_earned - b.holder_team_earned - b.members_earned)::bigint as owner_share,
           (b.collected - b.holder_earned - b.holder_team_earned - b.members_earned
             - b.prizes_paid + b.other_movements)::bigint as total_due
    from base b
  ),
  fig as (
    select c.*,
           (c.total_due - c.delivered + c.refunded)::bigint as balance,
           jsonb_build_object(
             'tickets_paid', c.tickets_paid,
             'collected', c.collected,
             'earned', c.holder_earned + c.holder_team_earned + c.members_earned,
             'prizes_paid', c.prizes_paid,
             'other_movements', c.other_movements,
             'total_due', c.total_due,
             'delivered', c.delivered,
             'refunded', c.refunded,
             'balance', c.total_due - c.delivered + c.refunded,
             'awards', c.awards,
             'awards_unpaid', c.awards_unpaid,
             'prize_cost', c.prize_cost
           ) as figures
    from calc c
  ),
  cl as (
    select distinct on (s.seller_id, s.counterpart_id)
           s.seller_id, s.counterpart_id, s.version, s.fingerprint, s.figures, s.closed_at, s.closed_by
    from settlement_closings s
    where s.organization_id = p_org and s.raffle_id = p_raffle
    order by s.seller_id, s.counterpart_id, s.version desc
  )
  select fig.holder_id,
         fig.counterpart_id,
         coalesce(nullif(btrim(hp.full_name), ''), 'Vendedor'),
         hm.role,
         (hm.is_active and hp.is_active),
         case when fig.counterpart_id is not null
              then coalesce(nullif(btrim(cp.full_name), ''), 'Vendedor') end,
         fig.members,
         fig.tickets_active,
         fig.tickets_sold,
         fig.tickets_paid,
         fig.own_tickets_paid,
         fig.team_tickets_paid,
         fig.collected,
         fig.holder_earned,
         fig.holder_team_earned,
         fig.members_earned,
         fig.owner_share,
         fig.prizes_paid,
         fig.other_movements,
         fig.total_due,
         fig.delivered,
         fig.refunded,
         fig.balance,
         fig.awards,
         fig.awards_unpaid,
         fig.awards_blocked,
         fig.payments_orphaned,
         fig.prize_cost,
         fig.prize_cost_org,
         case when fig.counterpart_id is null then fig.owner_share - fig.prize_cost end,
         fig.holder_partial_paid,
         fig.holder_tickets_sold,
         case
           when fig.tickets_paid = 0 and fig.delivered = 0 and fig.refunded = 0 and fig.prizes_paid = 0
                and fig.other_movements = 0 and fig.awards = 0 and fig.payments_orphaned = 0
                and fig.prize_cost = 0 and cl.version is null
             then 'no_activity'::settlement_account_status
           when fig.awards_unpaid > 0 or fig.payments_orphaned > 0
             then 'missing_info'::settlement_account_status
           when fig.balance > 0 and fig.delivered > 0 then 'partial'::settlement_account_status
           when fig.balance > 0 then 'pending'::settlement_account_status
           when fig.balance < 0 then 'in_favor'::settlement_account_status
           when cl.fingerprint = md5(fig.figures::text) then 'closed'::settlement_account_status
           else 'to_close'::settlement_account_status
         end,
         md5(fig.figures::text),
         fig.figures,
         cl.version,
         cl.figures,
         cl.closed_at,
         case when cl.version is not null
              then coalesce(nullif(btrim(cb.full_name), ''), 'Alguien de la organización') end,
         (cl.version is not null and cl.fingerprint <> md5(fig.figures::text))
  from fig
  join memberships hm on hm.organization_id = p_org and hm.profile_id = fig.holder_id
  join profiles hp on hp.id = fig.holder_id
  left join profiles cp on cp.id = fig.counterpart_id
  left join cl on cl.seller_id = fig.holder_id and cl.counterpart_id is not distinct from fig.counterpart_id
  left join profiles cb on cb.id = cl.closed_by
$$;

comment on function settlement_account_rows(uuid, uuid) is
  'D-241: las cuentas de una rifa —con el dueño y de cada integrante con su vendedor a cargo—, con su saldo, su estado derivado y su cierre vigente. La unica definicion de una cuenta. Interna.';

-- -----------------------------------------------------------------------------
-- 4.3 Los premios de una rifa con su pago
--
-- Cada premio ganado (`prize_award_rows`, la unica definicion, D-208) con el
-- pago vigente que tenga, y cada pago vigente cuyo premio ya no aparezca
-- (`award_missing`): ese pago sigue contando como dinero que salio, y su cuenta
-- queda por revisar. Lleva `client_id`: SOLO la lectura del propio vendedor lo
-- usa.
-- -----------------------------------------------------------------------------
create function settlement_award_rows(p_org uuid, p_raffle uuid)
returns table (
  match_id          uuid,
  prize_id          uuid,
  result_id         uuid,
  match_field       lottery_match_field,
  award_origin      text,
  award_missing     boolean,
  reference_date    date,
  lottery_code      lottery_code,
  draw_number       text,
  ticket_id         uuid,
  daily_number      text,
  weekly_number     text,
  client_id         uuid,
  ticket_seller_id  uuid,
  ticket_seller_name text,
  account_holder_id uuid,
  prize_title       text,
  prize_category    raffle_prize_category,
  reward_mode       raffle_prize_reward_mode,
  reward_options    jsonb,
  known_amount      bigint,
  value_pending     boolean,
  result_conflict   boolean,
  numbers_changed   boolean,
  payment_id        uuid,
  payer             settlement_prize_payer,
  payer_id          uuid,
  payer_name        text,
  payer_holder_id   uuid,
  amount            bigint,
  value_was_pending boolean,
  paid_on           date,
  confirmed_by      uuid,
  confirmed_by_name text,
  confirmed_at      timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with
  aw as (
    select distinct on (a.match_id, a.prize_id) a.*
    from prize_award_rows(array[p_org], null, p_raffle, null, null, null) a
    order by a.match_id, a.prize_id, a.origin desc
  ),
  pp as (
    select y.*
    from settlement_prize_payments y
    where y.organization_id = p_org and y.raffle_id = p_raffle and y.voided_at is null
  ),
  j as (
    select coalesce(aw.match_id, pp.match_id) as match_id,
           coalesce(aw.prize_id, pp.prize_id) as prize_id,
           coalesce(aw.result_id, pp.result_id) as result_id,
           coalesce(aw.match_field, pp.match_field) as match_field,
           aw.origin as award_origin,
           (aw.match_id is null) as award_missing,
           aw.reference_date as aw_reference_date,
           aw.lottery_code as aw_lottery_code,
           aw.draw_number as aw_draw_number,
           coalesce(aw.ticket_id, pp.ticket_id) as ticket_id,
           aw.client_id as aw_client_id,
           coalesce(aw.seller_id, pp.ticket_seller_id) as ticket_seller_id,
           aw.prize_title as aw_prize_title,
           aw.prize_category,
           aw.reward_mode,
           aw.reward_options,
           aw.known_amount,
           coalesce(aw.value_pending, false) as value_pending,
           coalesce(aw.result_conflict, false) as result_conflict,
           coalesce(aw.numbers_changed, false) as numbers_changed,
           pp.id as payment_id,
           pp.payer,
           pp.payer_id,
           pp.amount,
           pp.value_was_pending,
           pp.paid_on,
           pp.confirmed_by,
           pp.confirmed_at
    from aw
    full join pp on pp.match_id = aw.match_id and pp.prize_id = aw.prize_id
  )
  select j.match_id,
         j.prize_id,
         j.result_id,
         j.match_field,
         j.award_origin,
         j.award_missing,
         coalesce(j.aw_reference_date, s.reference_date),
         coalesce(j.aw_lottery_code, s.lottery_code),
         coalesce(j.aw_draw_number, s.draw_number),
         j.ticket_id,
         t.daily_number,
         t.weekly_number,
         coalesce(j.aw_client_id, m.client_id),
         j.ticket_seller_id,
         coalesce(nullif(btrim(sp.full_name), ''), 'Vendedor'),
         coalesce(case when sm.role = 'seller' then sm.parent_seller_id end, j.ticket_seller_id),
         coalesce(j.aw_prize_title, v.title),
         j.prize_category,
         j.reward_mode,
         j.reward_options,
         j.known_amount,
         j.value_pending,
         j.result_conflict,
         j.numbers_changed,
         j.payment_id,
         j.payer,
         j.payer_id,
         case when j.payer = 'seller' then coalesce(nullif(btrim(pyp.full_name), ''), 'Vendedor') end,
         case when j.payer = 'seller'
              then coalesce(case when pym.role = 'seller' then pym.parent_seller_id end, j.payer_id) end,
         j.amount,
         j.value_was_pending,
         j.paid_on,
         j.confirmed_by,
         case when j.payment_id is not null
              then coalesce(nullif(btrim(cbp.full_name), ''), 'Alguien de la organización') end,
         j.confirmed_at
  from j
  left join lottery_ticket_matches m on m.id = j.match_id
  left join lottery_results r on r.id = j.result_id
  left join lottery_draw_schedules s on s.id = r.schedule_id
  left join tickets t on t.id = j.ticket_id
  left join raffle_prizes rp on rp.id = j.prize_id
  left join raffle_prize_versions v on v.id = rp.current_version_id
  left join memberships sm on sm.organization_id = p_org and sm.profile_id = j.ticket_seller_id
  left join profiles sp on sp.id = j.ticket_seller_id
  left join memberships pym on pym.organization_id = p_org and pym.profile_id = j.payer_id
  left join profiles pyp on pyp.id = j.payer_id
  left join profiles cbp on cbp.id = j.confirmed_by
$$;

comment on function settlement_award_rows(uuid, uuid) is
  'D-241: los premios ganados de una rifa con su pago vigente, y los pagos vigentes sin premio. Trae client_id: solo la lectura del propio vendedor lo proyecta. Interna.';

-- =============================================================================
-- 5. Piezas internas de escritura
-- =============================================================================

-- Un cerrojo por cuenta con el dueño: toda escritura que mueve una cuenta —una
-- entrega de su titular o de un integrante, un premio de una de sus boletas, un
-- cierre— pasa por el mismo, y dos confirmaciones simultaneas se ordenan en vez
-- de pisarse (BR-Z12).
create function settlement_lock(p_raffle uuid, p_holder uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select pg_advisory_xact_lock(hashtextextended('settlement:' || p_raffle::text || ':' || p_holder::text, 0))
$$;

comment on function settlement_lock(uuid, uuid) is
  'D-241, BR-Z12: el cerrojo transaccional de una cuenta con el dueño. Interna.';

-- Si quien llama puede registrar que `p_payer`/`p_payer_id` pago el premio de una
-- boleta de `p_ticket_seller`. NULL = puede; si no, el motivo (BR-Z07):
--
--   * lo que pago un INTEGRANTE lo registra su vendedor a cargo, que es quien
--     recibe sus entregas;
--   * lo que pago un vendedor directo o un vendedor a cargo lo registra el
--     personal, que es quien recibe las suyas;
--   * lo que pago el dueño, el personal.
--
-- Elegir un nombre en un formulario no autoriza a registrar dinero a nombre de
-- otra persona: el pagador tiene que ser el vendedor de la boleta, su vendedor a
-- cargo de hoy o el dueño, y quien confirma es siempre quien recibe.
create function settlement_payer_problem(
  p_org           uuid,
  p_ticket_seller uuid,
  p_parent        uuid,
  p_payer         settlement_prize_payer,
  p_payer_id      uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if p_payer is null then
    return 'Elige quién pagó el premio.';
  end if;

  if p_payer = 'organization' then
    if p_payer_id is not null then
      return 'Elige quién pagó el premio.';
    end if;
    if not has_org_capability(p_org, 'settlements.manage') then
      return 'Un premio que pagó el dueño lo registra el dueño o un administrador.';
    end if;
    return null;
  end if;

  if p_payer_id is null then
    return 'Elige quién pagó el premio.';
  end if;

  if p_payer_id = p_ticket_seller then
    if p_parent is not null then
      if v_actor is distinct from p_parent or not current_profile_leads_team(p_org) then
        return format('Lo que pagó %s lo registra su vendedor a cargo, %s.',
                      commission_person_name(p_ticket_seller), commission_person_name(p_parent));
      end if;
      return null;
    end if;
    if v_actor = p_ticket_seller then
      return 'Lo que pagaste tú lo registra quien recibe tus entregas.';
    end if;
    if not has_org_capability(p_org, 'settlements.manage') then
      return format('Lo que pagó %s lo registra el dueño o un administrador.',
                    commission_person_name(p_ticket_seller));
    end if;
    return null;
  end if;

  if p_parent is not null and p_payer_id = p_parent then
    if v_actor = p_parent then
      return 'Lo que pagaste tú lo registra quien recibe tus entregas.';
    end if;
    if not has_org_capability(p_org, 'settlements.manage') then
      return format('Lo que pagó %s lo registra el dueño o un administrador.',
                    commission_person_name(p_parent));
    end if;
    return null;
  end if;

  if p_parent is not null then
    return format('Este premio lo pudo pagar %s, su vendedor a cargo %s o el dueño.',
                  commission_person_name(p_ticket_seller), commission_person_name(p_parent));
  end if;
  return format('Este premio lo pudo pagar %s o el dueño.', commission_person_name(p_ticket_seller));
end;
$$;

comment on function settlement_payer_problem(uuid, uuid, uuid, settlement_prize_payer, uuid) is
  'D-241, BR-Z07: si quien llama puede registrar ese pago de premio. NULL si puede; si no, el motivo. Interna.';

-- Guarda un cierre si la cuenta esta saldada y sin nada pendiente. Devuelve si
-- la cuenta queda cerrada. Se llama con el cerrojo de la cuenta tomado.
create function settlement_try_close(
  p_org          uuid,
  p_raffle       uuid,
  p_holder       uuid,
  p_counterpart  uuid,
  p_cause        settlement_close_cause,
  p_cause_id     uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_id  uuid;
begin
  select a.* into v_row
  from settlement_account_rows(p_org, p_raffle) a
  where a.holder_id = p_holder and a.counterpart_id is not distinct from p_counterpart;

  if not found then
    return false;
  end if;
  if v_row.status = 'closed' then
    return true;
  end if;
  if v_row.status <> 'to_close' then
    return false;
  end if;

  insert into settlement_closings (
    organization_id, raffle_id, seller_id, counterpart_id, version, fingerprint, figures,
    closed_by, cause, cause_id
  )
  values (
    p_org, p_raffle, p_holder, p_counterpart, coalesce(v_row.closing_version, 0) + 1,
    v_row.fingerprint, v_row.figures, auth.uid(), p_cause, p_cause_id
  )
  returning id into v_id;

  perform write_audit_log(
    p_org, 'settlement.close', 'settlement_closing', v_id,
    v_row.closing_figures,
    v_row.figures || jsonb_build_object(
      'raffle_id', p_raffle, 'seller_id', p_holder, 'counterpart_id', p_counterpart,
      'version', coalesce(v_row.closing_version, 0) + 1, 'cause', p_cause, 'cause_id', p_cause_id
    )
  );
  return true;
end;
$$;

comment on function settlement_try_close(uuid, uuid, uuid, uuid, settlement_close_cause, uuid) is
  'D-241, BR-Z11: guarda el cierre de una cuenta si quedo saldada y sin nada pendiente. Interna; se llama con el cerrojo tomado.';

-- =============================================================================
-- 6. Las escrituras de una sesion
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6.1 Confirmar una entrega o una devolucion (BR-Z05, BR-Z06, BR-Z12)
--
-- La confirma QUIEN RECIBE: el personal lo que entrega un vendedor directo, el
-- vendedor a cargo lo que entrega un integrante, y el propio vendedor una
-- devolucion. Nadie confirma su propia entrega.
--
-- `p_expected_balance` es el saldo que la persona tenia a la vista. Si cambio
-- mientras revisaba, NO se guarda nada y se devuelve 'balance_changed' con el
-- saldo de ahora. `p_request_id` hace el reintento inofensivo: el mismo
-- identificador con los mismos datos devuelve 'already_recorded'.
-- -----------------------------------------------------------------------------
create function settlement_record_transfer(
  p_raffle_id        uuid,
  p_seller_id        uuid,
  p_kind             settlement_transfer_kind,
  p_amount           bigint,
  p_received_on      date,
  p_expected_balance bigint,
  p_request_id       uuid
)
returns table (
  outcome         text,
  transfer_id     uuid,
  balance_before  bigint,
  balance_after   bigint,
  current_balance bigint,
  closed          boolean
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_actor       uuid := auth.uid();
  v_org         uuid;
  v_start       date;
  v_parent      uuid;
  v_holder      uuid;
  v_existing    settlement_transfers;
  v_balance     bigint;
  v_after       bigint;
  v_id          uuid;
  v_closed      boolean;
begin
  if v_actor is null then
    raise exception 'Tu sesión terminó. Vuelve a ingresar.' using errcode = 'insufficient_privilege';
  end if;
  if p_raffle_id is null or p_seller_id is null or p_kind is null or p_request_id is null then
    raise exception 'Faltan datos de la entrega. Vuelve a abrir la cuenta.';
  end if;

  select r.organization_id, r.start_date into v_org, v_start from raffles r where r.id = p_raffle_id;
  if v_org is null or not exists (select 1 from current_org_ids() o where o = v_org) then
    raise exception 'No encontramos esa cuenta. Vuelve a abrir el cierre de cuentas.'
      using errcode = 'insufficient_privilege';
  end if;

  -- La estructura de HOY decide a quien se entrega. `for share` impide que un
  -- cambio de equipo se cuele entre esta lectura y la confirmacion.
  select case when m.role = 'seller' then m.parent_seller_id end
    into v_parent
  from memberships m
  where m.organization_id = v_org and m.profile_id = p_seller_id
  for share;
  if not found then
    raise exception 'No encontramos esa cuenta. Vuelve a abrir el cierre de cuentas.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_kind = 'delivery' then
    if v_actor = p_seller_id then
      raise exception 'Una entrega la confirma quien recibe el dinero, no quien lo entrega.'
        using errcode = 'insufficient_privilege';
    end if;
    if v_parent is null then
      if not has_org_capability(v_org, 'settlements.manage') then
        raise exception 'Solo el dueño o un administrador confirma el dinero que recibe de un vendedor.'
          using errcode = 'insufficient_privilege';
      end if;
    elsif v_actor is distinct from v_parent or not current_profile_leads_team(v_org) then
      raise exception '%',
        format('Lo que entrega %s lo confirma su vendedor a cargo, %s.',
               commission_person_name(p_seller_id), commission_person_name(v_parent))
        using errcode = 'insufficient_privilege';
    end if;
  else
    if v_actor is distinct from p_seller_id or not has_org_role(v_org, array['seller']::app_role[]) then
      raise exception 'Una devolución la confirma quien recibe el dinero.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  v_holder := coalesce(v_parent, p_seller_id);
  perform settlement_lock(p_raffle_id, v_holder);

  -- El reintento: el mismo identificador de solicitud no escribe dos veces.
  select x.* into v_existing
  from settlement_transfers x
  where x.organization_id = v_org and x.request_id = p_request_id;
  if found then
    if v_existing.raffle_id = p_raffle_id and v_existing.seller_id = p_seller_id
       and v_existing.kind = p_kind and v_existing.amount = p_amount
       and v_existing.received_on = p_received_on and v_existing.confirmed_by = v_actor
    then
      select a.balance into v_balance
      from settlement_account_rows(v_org, p_raffle_id) a
      where a.holder_id = p_seller_id and a.counterpart_id is not distinct from v_existing.counterpart_id;
      return query
        select 'already_recorded'::text, v_existing.id, v_existing.balance_before, v_existing.balance_after,
               coalesce(v_balance, 0),
               exists (select 1 from settlement_closings c where c.cause_id = v_existing.id);
      return;
    end if;
    raise exception 'Esta confirmación ya se había enviado con otros datos. Vuelve a abrir la cuenta.';
  end if;

  -- El saldo de AHORA, con el cerrojo tomado.
  select a.balance into v_balance
  from settlement_account_rows(v_org, p_raffle_id) a
  where a.holder_id = p_seller_id and a.counterpart_id is not distinct from v_parent;
  v_balance := coalesce(v_balance, 0);

  if p_expected_balance is null then
    raise exception 'Vuelve a abrir la cuenta para ver su saldo de ahora.';
  end if;
  if p_expected_balance <> v_balance then
    return query select 'balance_changed'::text, null::uuid, p_expected_balance, null::bigint, v_balance, false;
    return;
  end if;

  if p_amount is null or p_amount < 1 then
    raise exception 'Escribe cuánto dinero recibiste.';
  end if;
  if p_amount > 100000000000 then
    raise exception 'Ese valor es demasiado alto. Revísalo.';
  end if;
  if p_kind = 'delivery' then
    if v_balance <= 0 then
      raise exception 'Esta cuenta no tiene dinero por recibir.';
    end if;
    if p_amount > v_balance then
      raise exception '%',
        format('No puedes confirmar más de %s: es lo que falta por recibir.', format_cop(v_balance));
    end if;
  else
    if v_balance >= 0 then
      raise exception 'Esta cuenta no tiene saldo a favor del vendedor.';
    end if;
    if p_amount > -v_balance then
      raise exception '%',
        format('No puedes confirmar más de %s: es lo que falta devolver.', format_cop(-v_balance));
    end if;
  end if;
  if p_received_on is null or p_received_on > today_bogota() then
    raise exception 'La fecha no puede ser posterior a hoy.';
  end if;
  if p_received_on < v_start then
    raise exception '%',
      format('La fecha no puede ser anterior al inicio de la rifa (%s).', to_char(v_start, 'DD/MM/YYYY'));
  end if;

  v_after := case when p_kind = 'delivery' then v_balance - p_amount else v_balance + p_amount end;

  insert into settlement_transfers (
    organization_id, raffle_id, kind, seller_id, counterpart_id, amount, received_on,
    confirmed_by, request_id, balance_before, balance_after
  )
  values (
    v_org, p_raffle_id, p_kind, p_seller_id, v_parent, p_amount, p_received_on,
    v_actor, p_request_id, v_balance, v_after
  )
  returning id into v_id;

  perform write_audit_log(
    v_org, 'settlement.transfer', 'settlement_transfer', v_id, null,
    jsonb_build_object(
      'raffle_id', p_raffle_id, 'kind', p_kind, 'seller_id', p_seller_id, 'counterpart_id', v_parent,
      'amount', p_amount, 'received_on', p_received_on,
      'balance_before', v_balance, 'balance_after', v_after
    )
  );

  v_closed := settlement_try_close(v_org, p_raffle_id, p_seller_id, v_parent, 'transfer', v_id);

  return query select 'recorded'::text, v_id, v_balance, v_after, v_after, v_closed;
end;
$$;

comment on function settlement_record_transfer(uuid, uuid, settlement_transfer_kind, bigint, date, bigint, uuid) is
  'D-241, BR-Z05, BR-Z06, BR-Z12: confirma una entrega o una devolucion. La confirma quien recibe; revalida el saldo con el cerrojo tomado y es idempotente por p_request_id.';

-- -----------------------------------------------------------------------------
-- 6.2 Registrar quien pago un premio (BR-Z07, BR-Z08)
-- -----------------------------------------------------------------------------
-- `p_payer_id` y `p_amount` van al final y con valor por defecto: PostgREST
-- elige la funcion por los NOMBRES de los argumentos que recibe, y el pago del
-- dueño no lleva pagador, ni un premio de valor conocido lleva importe.
create function settlement_record_prize_payment(
  p_raffle_id  uuid,
  p_match_id   uuid,
  p_prize_id   uuid,
  p_payer      settlement_prize_payer,
  p_paid_on    date,
  p_request_id uuid,
  p_payer_id   uuid default null,
  p_amount     bigint default null
)
returns table (
  outcome    text,
  payment_id uuid,
  closed     boolean
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_actor    uuid := auth.uid();
  v_org      uuid;
  v_award    record;
  v_parent   uuid;
  v_holder   uuid;
  v_problem  text;
  v_amount   bigint;
  v_pending  boolean;
  v_existing settlement_prize_payments;
  v_id       uuid;
  v_closed   boolean;
  v_team     boolean;
begin
  if v_actor is null then
    raise exception 'Tu sesión terminó. Vuelve a ingresar.' using errcode = 'insufficient_privilege';
  end if;
  if p_raffle_id is null or p_match_id is null or p_prize_id is null or p_request_id is null then
    raise exception 'Faltan datos del premio. Vuelve a abrir la cuenta.';
  end if;

  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or not exists (select 1 from current_org_ids() o where o = v_org) then
    raise exception 'No encontramos ese premio en esta rifa.' using errcode = 'insufficient_privilege';
  end if;

  select a.* into v_award
  from prize_award_rows(array[v_org], null, p_raffle_id, null, null, null) a
  where a.match_id = p_match_id and a.prize_id = p_prize_id
  order by a.origin desc
  limit 1;
  if not found then
    raise exception 'No encontramos ese premio en esta rifa.' using errcode = 'insufficient_privilege';
  end if;

  select case when m.role = 'seller' then m.parent_seller_id end into v_parent
  from memberships m
  where m.organization_id = v_org and m.profile_id = v_award.seller_id
  for share;

  v_problem := settlement_payer_problem(v_org, v_award.seller_id, v_parent, p_payer, p_payer_id);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'insufficient_privilege';
  end if;

  if v_award.result_conflict then
    raise exception 'El resultado de ese sorteo está por verificar. Registra el pago cuando se confirme.';
  end if;

  -- El valor: el del premio si se conoce; si no —en especie o con alternativas—,
  -- el que se escribe, que nunca es cero (BR-Z08).
  if not v_award.value_pending and v_award.known_amount is not null then
    if p_amount is not null and p_amount <> v_award.known_amount then
      raise exception '%',
        format('Este premio vale %s. Registra ese valor.', format_cop(v_award.known_amount));
    end if;
    v_amount := v_award.known_amount;
    v_pending := false;
  else
    if p_amount is null or p_amount < 1 then
      raise exception 'Escribe el valor del premio que se pagó.';
    end if;
    if p_amount > 10000000000 then
      raise exception 'Ese valor es demasiado alto. Revísalo.';
    end if;
    v_amount := p_amount;
    v_pending := true;
  end if;

  if p_paid_on is null or p_paid_on > today_bogota() then
    raise exception 'La fecha de pago no puede ser posterior a hoy.';
  end if;
  if p_paid_on < v_award.reference_date then
    raise exception '%',
      format('La fecha de pago no puede ser anterior al sorteo del %s.',
             to_char(v_award.reference_date, 'DD/MM/YYYY'));
  end if;

  v_holder := coalesce(v_parent, v_award.seller_id);
  perform settlement_lock(p_raffle_id, v_holder);

  select y.* into v_existing
  from settlement_prize_payments y
  where y.organization_id = v_org and y.request_id = p_request_id;
  if found then
    if v_existing.match_id = p_match_id and v_existing.prize_id = p_prize_id
       and v_existing.payer = p_payer and v_existing.payer_id is not distinct from p_payer_id
       and v_existing.amount = v_amount and v_existing.paid_on = p_paid_on
       and v_existing.confirmed_by = v_actor
    then
      return query
        select 'already_recorded'::text, v_existing.id,
               exists (select 1 from settlement_closings c where c.cause_id = v_existing.id);
      return;
    end if;
    raise exception 'Esta confirmación ya se había enviado con otros datos. Vuelve a abrir la cuenta.';
  end if;

  if exists (
    select 1 from settlement_prize_payments y
    where y.match_id = p_match_id and y.prize_id = p_prize_id and y.voided_at is null
  ) then
    raise exception 'Este premio ya tiene un pago registrado.';
  end if;

  insert into settlement_prize_payments (
    organization_id, raffle_id, result_id, match_id, match_field, prize_id, ticket_id,
    ticket_seller_id, payer, payer_id, amount, value_was_pending, paid_on, confirmed_by, request_id
  )
  values (
    v_org, p_raffle_id, v_award.result_id, p_match_id, v_award.match_field, p_prize_id,
    v_award.ticket_id, v_award.seller_id, p_payer, p_payer_id, v_amount, v_pending, p_paid_on,
    v_actor, p_request_id
  )
  returning id into v_id;

  perform write_audit_log(
    v_org, 'settlement.prize_payment', 'settlement_prize_payment', v_id, null,
    jsonb_build_object(
      'raffle_id', p_raffle_id, 'match_id', p_match_id, 'prize_id', p_prize_id,
      'ticket_id', v_award.ticket_id, 'ticket_seller_id', v_award.seller_id,
      'payer', p_payer, 'payer_id', p_payer_id, 'amount', v_amount,
      'value_was_pending', v_pending, 'paid_on', p_paid_on
    )
  );

  -- Un pago puede dejar saldada la cuenta con el dueño y, si la boleta es de un
  -- integrante, tambien la suya con su vendedor a cargo.
  v_closed := settlement_try_close(v_org, p_raffle_id, v_holder, null, 'prize_payment', v_id);
  v_team := false;
  if v_parent is not null then
    v_team := settlement_try_close(v_org, p_raffle_id, v_award.seller_id, v_parent, 'prize_payment', v_id);
  end if;

  -- Lo que quien registra ve: el vendedor a cargo, la cuenta de su integrante; el
  -- personal, la cuenta con el dueño.
  return query
    select 'recorded'::text, v_id,
           case when v_parent is not null and v_actor = v_parent then v_team else v_closed end;
end;
$$;

comment on function settlement_record_prize_payment(uuid, uuid, uuid, settlement_prize_payer, date, uuid, uuid, bigint) is
  'D-241, BR-Z07, BR-Z08: registra quien pago un premio ganado. Lo confirma quien recibe las entregas del pagador; el valor es el del premio o, si es en especie, el que se escribe. Idempotente por p_request_id.';

-- -----------------------------------------------------------------------------
-- 6.3 Anular una entrega o un pago de premio (BR-Z14)
--
-- Lo anula quien pudo confirmarlo. La fila se queda, marcada; un cierre que la
-- incluia no se borra: la cuenta pasa a enseñar la diferencia.
-- -----------------------------------------------------------------------------
create function settlement_void_transfer(p_transfer_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth.uid();
  v_t      settlement_transfers;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_a      uuid;
  v_b      uuid;
begin
  if v_actor is null then
    raise exception 'Tu sesión terminó. Vuelve a ingresar.' using errcode = 'insufficient_privilege';
  end if;

  select x.* into v_t from settlement_transfers x where x.id = p_transfer_id;
  if not found or not exists (select 1 from current_org_ids() o where o = v_t.organization_id) then
    raise exception 'No encontramos esa entrega.' using errcode = 'insufficient_privilege';
  end if;

  if v_t.kind = 'delivery' and v_t.counterpart_id is null then
    if not has_org_capability(v_t.organization_id, 'settlements.manage') then
      raise exception 'Solo el dueño o un administrador anula lo que confirmó como recibido.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif v_t.kind = 'delivery' then
    if v_actor is distinct from v_t.counterpart_id
       or not has_org_role(v_t.organization_id, array['seller']::app_role[]) then
      raise exception 'Solo quien recibió este dinero puede anular la entrega.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif v_actor is distinct from v_t.seller_id
        or not has_org_role(v_t.organization_id, array['seller']::app_role[]) then
    raise exception 'Solo quien recibió la devolución puede anularla.'
      using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Escribe el motivo de la anulación, de 5 a 500 caracteres.';
  end if;

  -- Las dos cuentas que toca, en orden fijo: la de quien entrego y la de quien
  -- recibio (pueden ser la misma).
  select coalesce(case when m.role = 'seller' then m.parent_seller_id end, m.profile_id) into v_a
  from memberships m where m.organization_id = v_t.organization_id and m.profile_id = v_t.seller_id;
  v_b := v_a;
  if v_t.counterpart_id is not null then
    select coalesce(case when m.role = 'seller' then m.parent_seller_id end, m.profile_id) into v_b
    from memberships m where m.organization_id = v_t.organization_id and m.profile_id = v_t.counterpart_id;
  end if;
  perform settlement_lock(v_t.raffle_id, least(v_a, v_b));
  if v_b is distinct from v_a then
    perform settlement_lock(v_t.raffle_id, greatest(v_a, v_b));
  end if;

  update settlement_transfers
     set voided_at = now(), voided_by = v_actor, void_reason = v_reason
   where id = p_transfer_id and voided_at is null;
  if not found then
    raise exception 'Esta entrega ya está anulada.';
  end if;

  perform write_audit_log(
    v_t.organization_id, 'settlement.transfer_void', 'settlement_transfer', v_t.id,
    jsonb_build_object('amount', v_t.amount, 'kind', v_t.kind, 'seller_id', v_t.seller_id,
                       'counterpart_id', v_t.counterpart_id, 'received_on', v_t.received_on),
    jsonb_build_object('void_reason', v_reason)
  );
end;
$$;

comment on function settlement_void_transfer(uuid, text) is
  'D-241, BR-Z14: anula una entrega o una devolucion. Solo quien la recibio; con motivo. Interna a una sesion.';

create function settlement_void_prize_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   uuid := auth.uid();
  v_p       settlement_prize_payments;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_parent  uuid;
  v_problem text;
  v_a       uuid;
  v_b       uuid;
begin
  if v_actor is null then
    raise exception 'Tu sesión terminó. Vuelve a ingresar.' using errcode = 'insufficient_privilege';
  end if;

  select y.* into v_p from settlement_prize_payments y where y.id = p_payment_id;
  if not found or not exists (select 1 from current_org_ids() o where o = v_p.organization_id) then
    raise exception 'No encontramos ese pago de premio.' using errcode = 'insufficient_privilege';
  end if;

  select case when m.role = 'seller' then m.parent_seller_id end into v_parent
  from memberships m where m.organization_id = v_p.organization_id and m.profile_id = v_p.ticket_seller_id;

  v_problem := settlement_payer_problem(v_p.organization_id, v_p.ticket_seller_id, v_parent, v_p.payer, v_p.payer_id);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Escribe el motivo de la anulación, de 5 a 500 caracteres.';
  end if;

  v_a := coalesce(v_parent, v_p.ticket_seller_id);
  v_b := v_a;
  if v_p.payer_id is not null then
    select coalesce(case when m.role = 'seller' then m.parent_seller_id end, m.profile_id) into v_b
    from memberships m where m.organization_id = v_p.organization_id and m.profile_id = v_p.payer_id;
  end if;
  perform settlement_lock(v_p.raffle_id, least(v_a, v_b));
  if v_b is distinct from v_a then
    perform settlement_lock(v_p.raffle_id, greatest(v_a, v_b));
  end if;

  update settlement_prize_payments
     set voided_at = now(), voided_by = v_actor, void_reason = v_reason
   where id = p_payment_id and voided_at is null;
  if not found then
    raise exception 'Este pago de premio ya está anulado.';
  end if;

  perform write_audit_log(
    v_p.organization_id, 'settlement.prize_payment_void', 'settlement_prize_payment', v_p.id,
    jsonb_build_object('amount', v_p.amount, 'payer', v_p.payer, 'payer_id', v_p.payer_id,
                       'match_id', v_p.match_id, 'prize_id', v_p.prize_id, 'paid_on', v_p.paid_on),
    jsonb_build_object('void_reason', v_reason)
  );
end;
$$;

comment on function settlement_void_prize_payment(uuid, text) is
  'D-241, BR-Z14: anula un pago de premio. Solo quien podria registrarlo hoy; con motivo.';

-- -----------------------------------------------------------------------------
-- 6.4 Cerrar una cuenta saldada que no se cerro sola (BR-Z11)
--
-- Una entrega o un premio que dejan la cuenta en cero la cierran solos. Este es
-- el caso restante: la cuenta quedo en cero por otro camino —una anulacion, un
-- cambio del motor—. Se compara la huella que la persona tenia a la vista.
-- -----------------------------------------------------------------------------
create function settlement_confirm_close(p_raffle_id uuid, p_seller_id uuid, p_fingerprint text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth.uid();
  v_org    uuid;
  v_parent uuid;
  v_row    record;
  v_closed boolean;
begin
  if v_actor is null then
    raise exception 'Tu sesión terminó. Vuelve a ingresar.' using errcode = 'insufficient_privilege';
  end if;

  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or not exists (select 1 from current_org_ids() o where o = v_org) then
    raise exception 'No encontramos esa cuenta. Vuelve a abrir el cierre de cuentas.'
      using errcode = 'insufficient_privilege';
  end if;

  select case when m.role = 'seller' then m.parent_seller_id end into v_parent
  from memberships m
  where m.organization_id = v_org and m.profile_id = p_seller_id
  for share;
  if not found then
    raise exception 'No encontramos esa cuenta. Vuelve a abrir el cierre de cuentas.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_parent is null then
    if v_actor = p_seller_id or not has_org_capability(v_org, 'settlements.manage') then
      raise exception 'Solo el dueño o un administrador cierra la cuenta de un vendedor.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif v_actor is distinct from v_parent or not current_profile_leads_team(v_org) then
    raise exception '%',
      format('La cuenta de %s la cierra su vendedor a cargo, %s.',
             commission_person_name(p_seller_id), commission_person_name(v_parent))
      using errcode = 'insufficient_privilege';
  end if;

  perform settlement_lock(p_raffle_id, coalesce(v_parent, p_seller_id));

  select a.* into v_row
  from settlement_account_rows(v_org, p_raffle_id) a
  where a.holder_id = p_seller_id and a.counterpart_id is not distinct from v_parent;
  if not found then
    raise exception 'Esta cuenta todavía no se puede cerrar: no tiene boletas pagadas.';
  end if;

  if v_row.status = 'closed' then
    return 'already_closed';
  end if;
  if p_fingerprint is distinct from v_row.fingerprint then
    return 'changed';
  end if;
  if v_row.status <> 'to_close' then
    raise exception '%', 'Esta cuenta todavía no se puede cerrar: ' || case
      when v_row.status = 'missing_info' then 'falta registrar quién pagó un premio.'
      when v_row.balance > 0 then format('aún falta recibir %s.', format_cop(v_row.balance))
      when v_row.balance < 0 then format('hay %s a favor del vendedor.', format_cop(-v_row.balance))
      else 'no tiene boletas pagadas.'
    end;
  end if;

  v_closed := settlement_try_close(v_org, p_raffle_id, p_seller_id, v_parent, 'manual', null);
  return case when v_closed then 'closed' else 'changed' end;
end;
$$;

comment on function settlement_confirm_close(uuid, uuid, text) is
  'D-241, BR-Z11: cierra una cuenta saldada comparando la huella que se tenia a la vista. La cierra quien recibe sus entregas.';

-- =============================================================================
-- 7. Las lecturas de una sesion
--
-- NINGUNA DEVUELVE UN CLIENTE salvo `seller_settlement_prizes`, y solo para las
-- boletas del propio vendedor (BR-Z13). Las del personal responden cero filas a
-- quien no tiene la capacidad; las del vendedor, a quien no es vendedor activo
-- de la organizacion.
-- =============================================================================

-- Las cifras de arriba del listado del personal.
create function staff_settlement_overview(p_raffle_id uuid)
returns table (
  accounts              integer,
  closed_accounts       integer,
  pending_accounts      integer,
  pending_total         bigint,
  in_favor_accounts     integer,
  in_favor_total        bigint,
  missing_info_accounts integer,
  changed_accounts      integer,
  received_total        bigint,
  refunded_total        bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or not has_org_capability(v_org, 'settlements.manage') then
    return;
  end if;

  return query
  select (count(*) filter (where a.status <> 'no_activity'))::integer,
         (count(*) filter (where a.status = 'closed'))::integer,
         (count(*) filter (where a.balance > 0))::integer,
         coalesce(sum(a.balance) filter (where a.balance > 0), 0)::bigint,
         (count(*) filter (where a.balance < 0))::integer,
         coalesce(-sum(a.balance) filter (where a.balance < 0), 0)::bigint,
         (count(*) filter (where a.status = 'missing_info'))::integer,
         (count(*) filter (where a.changed_after_close))::integer,
         coalesce(sum(a.delivered), 0)::bigint,
         coalesce(sum(a.refunded), 0)::bigint
  from settlement_account_rows(v_org, p_raffle_id) a
  where a.counterpart_id is null;
end;
$$;

comment on function staff_settlement_overview(uuid) is
  'D-241: recibido, falta recibir y cuentas cerradas de una rifa, para el personal con settlements.manage. Solo cifras agregadas.';

-- El listado de cuentas con el dueño.
create function staff_settlement_accounts(
  p_raffle_id uuid,
  p_search    text default null,
  p_status    text default null,
  p_limit     integer default 25,
  p_offset    integer default 0
)
returns table (
  seller_id           uuid,
  seller_name         text,
  seller_role         app_role,
  seller_active       boolean,
  members             integer,
  tickets_sold        integer,
  tickets_paid        integer,
  delivered           bigint,
  balance             bigint,
  status              settlement_account_status,
  changed_after_close boolean,
  total_count         bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org    uuid;
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or not has_org_capability(v_org, 'settlements.manage') then
    return;
  end if;

  return query
  select a.holder_id, a.holder_name, a.holder_role, a.holder_active, a.members,
         a.tickets_sold, a.tickets_paid, a.delivered, a.balance, a.status, a.changed_after_close,
         count(*) over ()
  from settlement_account_rows(v_org, p_raffle_id) a
  where a.counterpart_id is null
    and (v_search is null
         or search_normalize(a.holder_name) like '%' || search_normalize(v_search) || '%')
    and (p_status is null
         or (p_status = 'open' and a.status in ('pending', 'partial', 'missing_info', 'in_favor', 'to_close'))
         or (p_status = 'closed' and a.status = 'closed')
         or (p_status = 'no_activity' and a.status = 'no_activity'))
  order by case when a.status in ('pending', 'partial', 'missing_info', 'in_favor', 'to_close') then 0
                when a.status = 'closed' then 1
                else 2 end,
           search_normalize(a.holder_name), a.holder_id
  limit v_limit offset v_offset;
end;
$$;

comment on function staff_settlement_accounts(uuid, text, text, integer, integer) is
  'D-241: las cuentas con el dueño de una rifa, filtradas y paginadas en la base. Sin un solo dato de cliente.';

-- Una cuenta con el dueño.
create function staff_settlement_account(p_raffle_id uuid, p_seller_id uuid)
returns table (
  seller_id           uuid,
  seller_name         text,
  seller_role         app_role,
  seller_active       boolean,
  members             integer,
  tickets_active      integer,
  tickets_sold        integer,
  tickets_paid        integer,
  own_tickets_paid    integer,
  team_tickets_paid   integer,
  collected           bigint,
  holder_earned       bigint,
  holder_team_earned  bigint,
  members_earned      bigint,
  owner_share         bigint,
  prizes_paid         bigint,
  other_movements     bigint,
  total_due           bigint,
  delivered           bigint,
  refunded            bigint,
  balance             bigint,
  awards              integer,
  awards_unpaid       integer,
  awards_blocked      integer,
  payments_orphaned   integer,
  prize_cost          bigint,
  prize_cost_org      bigint,
  owner_gain          bigint,
  status              settlement_account_status,
  fingerprint         text,
  closing_version     integer,
  closing_figures     jsonb,
  closed_at           timestamptz,
  closed_by_name      text,
  changed_after_close boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid;
begin
  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or not has_org_capability(v_org, 'settlements.manage') then
    return;
  end if;

  return query
  select a.holder_id, a.holder_name, a.holder_role, a.holder_active, a.members,
         a.tickets_active, a.tickets_sold, a.tickets_paid, a.own_tickets_paid, a.team_tickets_paid,
         a.collected, a.holder_earned, a.holder_team_earned, a.members_earned, a.owner_share,
         a.prizes_paid, a.other_movements, a.total_due, a.delivered, a.refunded, a.balance,
         a.awards, a.awards_unpaid, a.awards_blocked, a.payments_orphaned, a.prize_cost,
         a.prize_cost_org, a.owner_gain, a.status, a.fingerprint, a.closing_version,
         a.closing_figures, a.closed_at, a.closed_by_name, a.changed_after_close
  from settlement_account_rows(v_org, p_raffle_id) a
  where a.counterpart_id is null and a.holder_id = p_seller_id;
end;
$$;

comment on function staff_settlement_account(uuid, uuid) is
  'D-241: una cuenta con el dueño, con su calculo. Cifras agregadas, sin cliente ni abonos.';

-- Los premios de una cuenta con el dueño: los de sus boletas y los que pagaron
-- sus vendedores. Sin cliente.
create function staff_settlement_prizes(p_raffle_id uuid, p_seller_id uuid)
returns table (
  match_id           uuid,
  prize_id           uuid,
  award_missing      boolean,
  reference_date     date,
  lottery_code       lottery_code,
  draw_number        text,
  daily_number       text,
  weekly_number      text,
  match_field        lottery_match_field,
  ticket_seller_id   uuid,
  ticket_seller_name text,
  in_account         boolean,
  prize_title        text,
  prize_category     raffle_prize_category,
  reward_mode        raffle_prize_reward_mode,
  reward_options     jsonb,
  known_amount       bigint,
  value_pending      boolean,
  result_conflict    boolean,
  numbers_changed    boolean,
  payment_id         uuid,
  payer              settlement_prize_payer,
  payer_id           uuid,
  payer_name         text,
  payer_in_account   boolean,
  amount             bigint,
  value_was_pending  boolean,
  paid_on            date,
  confirmed_by_name  text,
  confirmed_at       timestamptz,
  can_record         boolean,
  parent_id          uuid,
  parent_name        text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid;
begin
  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or not has_org_capability(v_org, 'settlements.manage') then
    return;
  end if;

  return query
  select a.match_id, a.prize_id, a.award_missing, a.reference_date, a.lottery_code, a.draw_number,
         a.daily_number, a.weekly_number, a.match_field, a.ticket_seller_id, a.ticket_seller_name,
         (a.account_holder_id = p_seller_id),
         a.prize_title, a.prize_category, a.reward_mode, a.reward_options, a.known_amount,
         a.value_pending, a.result_conflict, a.numbers_changed, a.payment_id, a.payer, a.payer_id,
         a.payer_name, coalesce(a.payer_holder_id = p_seller_id, false), a.amount,
         a.value_was_pending, a.paid_on,
         a.confirmed_by_name, a.confirmed_at,
         (a.payment_id is null and not a.award_missing and not a.result_conflict
          and a.account_holder_id = p_seller_id),
         case when a.account_holder_id <> a.ticket_seller_id then a.account_holder_id end,
         case when a.account_holder_id <> a.ticket_seller_id
              then commission_person_name(a.account_holder_id) end
  from settlement_award_rows(v_org, p_raffle_id) a
  where a.account_holder_id = p_seller_id or a.payer_holder_id = p_seller_id
  order by a.reference_date desc nulls last, a.prize_title, a.match_id;
end;
$$;

comment on function staff_settlement_prizes(uuid, uuid) is
  'D-241: los premios de una cuenta con el dueño y su pago. Numeros de boleta y premio, nunca el cliente (BR-J21, BR-Z13).';

-- Lo que el dueño recibio de una cuenta, y lo que le devolvio.
create function staff_settlement_transfers(p_raffle_id uuid, p_seller_id uuid)
returns table (
  transfer_id       uuid,
  kind              settlement_transfer_kind,
  seller_id         uuid,
  seller_name       text,
  amount            bigint,
  received_on       date,
  confirmed_by_name text,
  confirmed_at      timestamptz,
  balance_before    bigint,
  balance_after     bigint,
  voided_at         timestamptz,
  voided_by_name    text,
  void_reason       text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_org uuid;
begin
  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or not has_org_capability(v_org, 'settlements.manage') then
    return;
  end if;

  return query
  select x.id, x.kind, x.seller_id, commission_person_name(x.seller_id), x.amount, x.received_on,
         commission_person_name(x.confirmed_by), x.confirmed_at, x.balance_before, x.balance_after,
         x.voided_at, case when x.voided_by is not null then commission_person_name(x.voided_by) end,
         x.void_reason
  from settlement_transfers x
  where x.organization_id = v_org
    and x.raffle_id = p_raffle_id
    and x.counterpart_id is null
    and (x.seller_id = p_seller_id
         or x.seller_id in (select m.profile_id from memberships m
                             where m.organization_id = v_org and m.role = 'seller'
                               and m.parent_seller_id = p_seller_id))
  order by x.received_on desc, x.confirmed_at desc;
end;
$$;

comment on function staff_settlement_transfers(uuid, uuid) is
  'D-241: las entregas y devoluciones entre una cuenta y el dueño, anuladas incluidas.';

-- La cuenta propia del vendedor, o —para su vendedor a cargo— la de un
-- integrante. `p_member_id` NULL = la propia.
create function seller_settlement_account(p_raffle_id uuid, p_member_id uuid default null)
returns table (
  seller_id           uuid,
  seller_name         text,
  counterpart_id      uuid,
  counterpart_name    text,
  members             integer,
  tickets_active      integer,
  tickets_sold        integer,
  tickets_paid        integer,
  own_tickets_sold    integer,
  own_tickets_paid    integer,
  team_tickets_paid   integer,
  collected           bigint,
  holder_earned       bigint,
  holder_team_earned  bigint,
  members_earned      bigint,
  owner_share         bigint,
  prizes_paid         bigint,
  other_movements     bigint,
  total_due           bigint,
  delivered           bigint,
  refunded            bigint,
  balance             bigint,
  awards              integer,
  awards_unpaid       integer,
  payments_orphaned   integer,
  partial_paid        bigint,
  status              settlement_account_status,
  fingerprint         text,
  closing_version     integer,
  closing_figures     jsonb,
  closed_at           timestamptz,
  closed_by_name      text,
  changed_after_close boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_actor  uuid := auth.uid();
  v_org    uuid;
  v_parent uuid;
  v_holder uuid;
  v_own    boolean := p_member_id is null;
begin
  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or v_actor is null
     or not exists (select 1 from current_seller_org_ids() o where o = v_org) then
    return;
  end if;

  if v_own then
    v_holder := v_actor;
    select m.parent_seller_id into v_parent
    from memberships m where m.organization_id = v_org and m.profile_id = v_actor;
  else
    if not current_profile_leads_team(v_org)
       or not exists (select 1 from memberships m
                       where m.organization_id = v_org and m.profile_id = p_member_id
                         and m.role = 'seller' and m.parent_seller_id = v_actor) then
      return;
    end if;
    v_holder := p_member_id;
    v_parent := v_actor;
  end if;

  return query
  select a.holder_id, a.holder_name, a.counterpart_id, a.counterpart_name, a.members,
         a.tickets_active, a.tickets_sold, a.tickets_paid, a.holder_tickets_sold,
         a.own_tickets_paid, a.team_tickets_paid, a.collected, a.holder_earned,
         a.holder_team_earned, a.members_earned, a.owner_share, a.prizes_paid, a.other_movements,
         a.total_due, a.delivered, a.refunded, a.balance, a.awards, a.awards_unpaid,
         a.payments_orphaned,
         -- Lo abonado a boletas sin pagar es cartera: solo lo ve su vendedor (BR-Z03).
         case when v_own then a.holder_partial_paid end,
         a.status, a.fingerprint, a.closing_version, a.closing_figures, a.closed_at,
         a.closed_by_name, a.changed_after_close
  from settlement_account_rows(v_org, p_raffle_id) a
  where a.holder_id = v_holder and a.counterpart_id is not distinct from v_parent;
end;
$$;

comment on function seller_settlement_account(uuid, uuid) is
  'D-241: la cuenta propia del vendedor —con el dueño o con su vendedor a cargo— o, para un vendedor a cargo, la de un integrante suyo. Sin cliente; lo abonado sin pagar, solo en la propia.';

-- Las cuentas de un vendedor a cargo con cada integrante de su equipo.
create function seller_settlement_team(p_raffle_id uuid)
returns table (
  member_id           uuid,
  member_name         text,
  member_active       boolean,
  tickets_sold        integer,
  tickets_paid        integer,
  total_due           bigint,
  delivered           bigint,
  refunded            bigint,
  balance             bigint,
  awards_unpaid       integer,
  status              settlement_account_status,
  changed_after_close boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
begin
  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or v_actor is null or not current_profile_leads_team(v_org) then
    return;
  end if;

  return query
  select a.holder_id, a.holder_name, a.holder_active, a.tickets_sold, a.tickets_paid,
         a.total_due, a.delivered, a.refunded, a.balance, a.awards_unpaid, a.status,
         a.changed_after_close
  from settlement_account_rows(v_org, p_raffle_id) a
  where a.counterpart_id = v_actor
  order by case when a.status in ('pending', 'partial', 'missing_info', 'in_favor', 'to_close') then 0
                when a.status = 'closed' then 1
                else 2 end,
           search_normalize(a.holder_name), a.holder_id;
end;
$$;

comment on function seller_settlement_team(uuid) is
  'D-241: las cuentas de los integrantes de quien llama con el. Solo cifras agregadas (BR-Z13).';

-- Los premios que ve un vendedor: los de su cuenta propia —con el cliente SOLO en
-- sus boletas— o, para su vendedor a cargo, los de un integrante, sin cliente.
create function seller_settlement_prizes(p_raffle_id uuid, p_member_id uuid default null)
returns table (
  match_id           uuid,
  prize_id           uuid,
  award_missing      boolean,
  reference_date     date,
  lottery_code       lottery_code,
  draw_number        text,
  daily_number       text,
  weekly_number      text,
  match_field        lottery_match_field,
  ticket_seller_id   uuid,
  ticket_seller_name text,
  own_ticket         boolean,
  client_name        text,
  prize_title        text,
  prize_category     raffle_prize_category,
  reward_mode        raffle_prize_reward_mode,
  reward_options     jsonb,
  known_amount       bigint,
  value_pending      boolean,
  result_conflict    boolean,
  numbers_changed    boolean,
  payment_id         uuid,
  payer              settlement_prize_payer,
  payer_id           uuid,
  payer_name         text,
  amount             bigint,
  value_was_pending  boolean,
  paid_on            date,
  confirmed_by_name  text,
  confirmed_at       timestamptz,
  can_record         boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_actor  uuid := auth.uid();
  v_org    uuid;
  v_parent uuid;
  v_leads  boolean;
begin
  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or v_actor is null
     or not exists (select 1 from current_seller_org_ids() o where o = v_org) then
    return;
  end if;

  v_leads := current_profile_leads_team(v_org);

  if p_member_id is not null then
    if not v_leads
       or not exists (select 1 from memberships m
                       where m.organization_id = v_org and m.profile_id = p_member_id
                         and m.role = 'seller' and m.parent_seller_id = v_actor) then
      return;
    end if;

    return query
    select a.match_id, a.prize_id, a.award_missing, a.reference_date, a.lottery_code, a.draw_number,
           a.daily_number, a.weekly_number, a.match_field, a.ticket_seller_id, a.ticket_seller_name,
           false, null::text, a.prize_title, a.prize_category, a.reward_mode, a.reward_options,
           a.known_amount, a.value_pending, a.result_conflict, a.numbers_changed, a.payment_id,
           a.payer, a.payer_id, a.payer_name, a.amount, a.value_was_pending, a.paid_on,
           a.confirmed_by_name, a.confirmed_at,
           (a.payment_id is null and not a.award_missing and not a.result_conflict
            and a.ticket_seller_id = p_member_id)
    from settlement_award_rows(v_org, p_raffle_id) a
    where a.ticket_seller_id = p_member_id or a.payer_id = p_member_id
    order by a.reference_date desc nulls last, a.prize_title, a.match_id;
    return;
  end if;

  select m.parent_seller_id into v_parent
  from memberships m where m.organization_id = v_org and m.profile_id = v_actor;

  return query
  select a.match_id, a.prize_id, a.award_missing, a.reference_date, a.lottery_code, a.draw_number,
         a.daily_number, a.weekly_number, a.match_field, a.ticket_seller_id, a.ticket_seller_name,
         (a.ticket_seller_id = v_actor),
         case when a.ticket_seller_id = v_actor then c.name end,
         a.prize_title, a.prize_category, a.reward_mode, a.reward_options, a.known_amount,
         a.value_pending, a.result_conflict, a.numbers_changed, a.payment_id, a.payer, a.payer_id,
         a.payer_name, a.amount, a.value_was_pending, a.paid_on, a.confirmed_by_name,
         a.confirmed_at,
         -- Un vendedor a cargo registra lo que pagaron SUS integrantes (BR-Z07).
         (v_parent is null and v_leads and a.payment_id is null and not a.award_missing
          and not a.result_conflict and a.ticket_seller_id <> v_actor
          and a.account_holder_id = v_actor)
  from settlement_award_rows(v_org, p_raffle_id) a
  left join clients c on c.id = a.client_id and c.seller_id = v_actor and a.ticket_seller_id = v_actor
  where (v_parent is null and (a.account_holder_id = v_actor or a.payer_holder_id = v_actor))
     or (v_parent is not null and (a.ticket_seller_id = v_actor or a.payer_id = v_actor))
  order by a.reference_date desc nulls last, a.prize_title, a.match_id;
end;
$$;

comment on function seller_settlement_prizes(uuid, uuid) is
  'D-241: los premios de la cuenta de un vendedor. El nombre del cliente solo en sus propias boletas; los de un integrante, sin cliente (BR-Z13).';

-- Las entregas que ve un vendedor.
--
--   propia, vendedor directo:  lo que su cuenta entrego al dueño y lo que el
--                              dueño le devolvio;
--   propia, integrante:        lo que entrego y lo que le devolvieron;
--   de un integrante:          lo que ese integrante le entrego a quien llama.
create function seller_settlement_transfers(p_raffle_id uuid, p_member_id uuid default null)
returns table (
  transfer_id       uuid,
  kind              settlement_transfer_kind,
  seller_id         uuid,
  seller_name       text,
  counterpart_id    uuid,
  counterpart_name  text,
  amount            bigint,
  received_on       date,
  confirmed_by_name text,
  confirmed_at      timestamptz,
  voided_at         timestamptz,
  voided_by_name    text,
  void_reason       text,
  can_void          boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_actor  uuid := auth.uid();
  v_org    uuid;
  v_parent uuid;
begin
  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if v_org is null or v_actor is null
     or not exists (select 1 from current_seller_org_ids() o where o = v_org) then
    return;
  end if;

  if p_member_id is not null then
    if not current_profile_leads_team(v_org)
       or not exists (select 1 from memberships m
                       where m.organization_id = v_org and m.profile_id = p_member_id
                         and m.role = 'seller' and m.parent_seller_id = v_actor) then
      return;
    end if;

    return query
    select x.id, x.kind, x.seller_id, commission_person_name(x.seller_id), x.counterpart_id,
           commission_person_name(x.counterpart_id), x.amount, x.received_on,
           commission_person_name(x.confirmed_by), x.confirmed_at, x.voided_at,
           case when x.voided_by is not null then commission_person_name(x.voided_by) end,
           x.void_reason,
           (x.voided_at is null and x.kind = 'delivery')
    from settlement_transfers x
    where x.organization_id = v_org and x.raffle_id = p_raffle_id
      and x.seller_id = p_member_id and x.counterpart_id = v_actor
    order by x.received_on desc, x.confirmed_at desc;
    return;
  end if;

  select m.parent_seller_id into v_parent
  from memberships m where m.organization_id = v_org and m.profile_id = v_actor;

  return query
  select x.id, x.kind, x.seller_id, commission_person_name(x.seller_id), x.counterpart_id,
         case when x.counterpart_id is not null then commission_person_name(x.counterpart_id) end,
         x.amount, x.received_on, commission_person_name(x.confirmed_by), x.confirmed_at,
         x.voided_at, case when x.voided_by is not null then commission_person_name(x.voided_by) end,
         x.void_reason,
         -- Una devolucion la anula quien la recibio: el propio vendedor.
         (x.voided_at is null and x.kind = 'refund' and x.seller_id = v_actor)
  from settlement_transfers x
  where x.organization_id = v_org and x.raffle_id = p_raffle_id
    and (
      (v_parent is not null and x.seller_id = v_actor)
      or (v_parent is null and x.counterpart_id is null
          and (x.seller_id = v_actor
               or x.seller_id in (select m.profile_id from memberships m
                                   where m.organization_id = v_org and m.role = 'seller'
                                     and m.parent_seller_id = v_actor)))
    )
  order by x.received_on desc, x.confirmed_at desc;
end;
$$;

comment on function seller_settlement_transfers(uuid, uuid) is
  'D-241: las entregas y devoluciones que ve un vendedor, propias o de un integrante suyo.';

-- =============================================================================
-- 8. Quien ejecuta cada funcion (D-207, I-132): una lista explicita
--
-- En el proyecto alojado toda funcion nueva nace ejecutable por `service_role`;
-- en local no. Se quita a TODOS y se concede solo lo que hace falta. Espejo:
-- `scripts/settlement-function-grants.ts`, que usan `verify-remote` y las pruebas.
-- =============================================================================

-- Nadie, para todo lo interno.
revoke execute on function settlement_rows_guard() from public, anon, authenticated, service_role;
revoke execute on function settlement_seller_figures(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function settlement_account_rows(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function settlement_award_rows(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function settlement_lock(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function settlement_payer_problem(uuid, uuid, uuid, settlement_prize_payer, uuid) from public, anon, authenticated, service_role;
revoke execute on function settlement_try_close(uuid, uuid, uuid, uuid, settlement_close_cause, uuid) from public, anon, authenticated, service_role;

-- Las RPC de una sesion: autorizan dentro, por la capacidad o por la relacion.
revoke execute on function settlement_record_transfer(uuid, uuid, settlement_transfer_kind, bigint, date, bigint, uuid) from public, anon, authenticated, service_role;
revoke execute on function settlement_record_prize_payment(uuid, uuid, uuid, settlement_prize_payer, date, uuid, uuid, bigint) from public, anon, authenticated, service_role;
revoke execute on function settlement_void_transfer(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function settlement_void_prize_payment(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function settlement_confirm_close(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function staff_settlement_overview(uuid) from public, anon, authenticated, service_role;
revoke execute on function staff_settlement_accounts(uuid, text, text, integer, integer) from public, anon, authenticated, service_role;
revoke execute on function staff_settlement_account(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function staff_settlement_prizes(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function staff_settlement_transfers(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function seller_settlement_account(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function seller_settlement_team(uuid) from public, anon, authenticated, service_role;
revoke execute on function seller_settlement_prizes(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function seller_settlement_transfers(uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function settlement_record_transfer(uuid, uuid, settlement_transfer_kind, bigint, date, bigint, uuid) to authenticated;
grant execute on function settlement_record_prize_payment(uuid, uuid, uuid, settlement_prize_payer, date, uuid, uuid, bigint) to authenticated;
grant execute on function settlement_void_transfer(uuid, text) to authenticated;
grant execute on function settlement_void_prize_payment(uuid, text) to authenticated;
grant execute on function settlement_confirm_close(uuid, uuid, text) to authenticated;
grant execute on function staff_settlement_overview(uuid) to authenticated;
grant execute on function staff_settlement_accounts(uuid, text, text, integer, integer) to authenticated;
grant execute on function staff_settlement_account(uuid, uuid) to authenticated;
grant execute on function staff_settlement_prizes(uuid, uuid) to authenticated;
grant execute on function staff_settlement_transfers(uuid, uuid) to authenticated;
grant execute on function seller_settlement_account(uuid, uuid) to authenticated;
grant execute on function seller_settlement_team(uuid) to authenticated;
grant execute on function seller_settlement_prizes(uuid, uuid) to authenticated;
grant execute on function seller_settlement_transfers(uuid, uuid) to authenticated;

-- =============================================================================
-- 9. Autocomprobacion
--
-- Si algo de lo anterior no quedo como se describe, la migracion se deshace
-- entera: privilegios de EXECUTE efectivos, RLS forzada sin politicas y ningun
-- privilegio de tabla para una sesion.
-- =============================================================================

do $$
declare
  v_privilegios text;
  v_tablas      text;
begin
  select string_agg(format('%s (%s)', f.firma, f.quien), ', ')
    into v_privilegios
  from (
    select p.oid::regprocedure::text as firma,
           concat_ws('+',
             case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
             case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end,
             case when has_function_privilege('service_role', p.oid, 'EXECUTE') then 'service_role' end
           ) as quien,
           p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'settlement\_%' or p.proname like 'staff\_settlement\_%'
           or p.proname like 'seller\_settlement\_%')
  ) f
  where f.quien is distinct from (
    case
      when f.proname in ('settlement_record_transfer', 'settlement_record_prize_payment',
                         'settlement_void_transfer', 'settlement_void_prize_payment',
                         'settlement_confirm_close')
        or f.proname like 'staff\_settlement\_%' or f.proname like 'seller\_settlement\_%'
        then 'authenticated'
      else ''
    end
  );

  if v_privilegios is not null then
    raise exception '0080: privilegios de EXECUTE distintos de los esperados: %', v_privilegios;
  end if;

  select string_agg(c.relname, ', ')
    into v_tablas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('settlement_transfers', 'settlement_prize_payments', 'settlement_closings')
    and (not c.relrowsecurity or not c.relforcerowsecurity
         or exists (select 1 from pg_policies pol where pol.schemaname = 'public' and pol.tablename = c.relname)
         or has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
         or has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE'));

  if v_tablas is not null then
    raise exception '0080: tablas del cierre de cuentas con acceso directo para una sesión: %', v_tablas;
  end if;

  if not ('settlements.manage' = any (app_capability_catalog()))
     or not ('settlements.manage' = any (app_role_default_capabilities('admin')))
     or 'settlements.manage' = any (app_role_default_capabilities('seller')) then
    raise exception '0080: la capacidad settlements.manage no quedó como se describe.';
  end if;
end
$$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA. Sin filas en las tres tablas, es exacto:
--
--   1. Comprobar: select count(*) from settlement_transfers;
--                 select count(*) from settlement_prize_payments;
--                 select count(*) from settlement_closings;
--   2. Retirar las catorce RPC de la seccion 6 y 7, las internas de las
--      secciones 4 y 5 y el disparador, en ese orden.
--   3. drop table settlement_closings, settlement_prize_payments, settlement_transfers;
--   4. drop type settlement_account_status, settlement_close_cause,
--      settlement_prize_payer, settlement_transfer_kind;
--   5. Volver a definir app_capability_catalog() y app_role_default_capabilities()
--      como en la 0078.
--
-- CON FILAS, retirarlas borra la historia del dinero entregado: antes hay que
-- exportarlas y conservarlas fuera de la base.
-- =============================================================================
