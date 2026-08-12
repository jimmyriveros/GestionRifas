-- =============================================================================
-- 0022_seller_teams.sql
-- Equipos de vendedores — Fase 1: modelo y jerarquia
--
-- Referencia: docs/BUSINESS_RULES.md BR-E01..BR-E07, docs/DECISIONS.md D-091.
--
-- QUE AGREGA
--
-- Cualquier vendedor puede formar un equipo: crea otros vendedores que quedan
-- colgados de el. No hay un rol nuevo ni una tabla nueva; un sub-vendedor SIGUE
-- SIENDO una membresia con rol `seller` (CLAUDE.md 8). Lo unico que cambia es
-- que esa membresia puede apuntar a su vendedor padre.
--
--   parent_seller_id null      -> vendedor que depende del Dueño/Administrador
--   parent_seller_id no nulo   -> integrante del equipo de ese vendedor
--
-- POR QUE UNA COLUMNA Y NO UNA TABLA DE RELACIONES
--
-- Un vendedor tiene como maximo un vendedor padre y la relacion vive y muere
-- con la membresia. Una tabla aparte obligaria a mantener sincronizadas dos
-- fuentes para el mismo hecho y a repetir el aislamiento por organizacion en
-- sus propias politicas. La FK COMPUESTA contra (profile_id, organization_id)
-- hace imposible por construccion que el padre sea de otra organizacion: no es
-- una comprobacion que haya que acordarse de escribir en cada consulta.
--
-- DOS NIVELES HOY, MAS EN EL FUTURO SIN REHACER EL MODELO
--
-- El modelo admite cualquier profundidad. Lo que la limita a dos niveles es una
-- sola condicion del trigger (`el padre no puede tener padre`) y la politica de
-- alta. El dia que el negocio quiera tres niveles se relajan esas dos y se
-- cambia `current_team_seller_ids()` por una version recursiva; la columna, las
-- FK, los indices y las pantallas siguen sirviendo igual.
--
-- QUE VE UN VENDEDOR PADRE (decision del producto, alcance minimo)
--
--   SI  -> las VENTAS de sus integrantes y sus indicadores, por las funciones
--          `team_sales_summary` y `team_member_sales` del final de este archivo.
--   NO  -> sus clientes, sus pagos, ni permiso para modificarles nada.
--
-- Ninguna politica de `tickets`, `clients` o `payments` cambia. Solo se amplian
-- `profiles_select` y `memberships_select`, que es lo minimo para poder mostrar
-- el nombre y el estado de un integrante, y no llevan dinero.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- La columna
-- -----------------------------------------------------------------------------
alter table memberships
  add column parent_seller_id uuid;

alter table memberships
  add constraint memberships_parent_seller_fk
  foreign key (parent_seller_id, organization_id)
  references memberships (profile_id, organization_id)
  on delete restrict;

-- Nadie es su propio jefe.
alter table memberships
  add constraint memberships_parent_not_self
  check (parent_seller_id is null or parent_seller_id <> profile_id);

-- Solo un vendedor pertenece al equipo de alguien. Un Dueño o un Administrador
-- con vendedor padre no significaria nada.
alter table memberships
  add constraint memberships_parent_only_for_sellers
  check (parent_seller_id is null or role = 'seller');

comment on column memberships.parent_seller_id is
  'Vendedor padre (BR-E01). NULL = depende del Dueño/Administrador. La FK compuesta con organization_id garantiza que el padre es de la misma organizacion.';

-- Indice parcial: la inmensa mayoria de las membresias no tiene padre, y todas
-- las consultas del equipo entran por aqui (listar integrantes, RLS de boletas).
create index memberships_parent_seller_idx
  on memberships (parent_seller_id)
  where parent_seller_id is not null;

-- -----------------------------------------------------------------------------
-- Validacion del vinculo
--
-- Lo que no puede expresar un CHECK (necesita mirar OTRA fila) va aqui. Es un
-- trigger normal, no diferido: a diferencia de la transferencia de propiedad
-- (0016), formar un equipo no exige pasar por ningun estado intermedio invalido.
-- -----------------------------------------------------------------------------
create function memberships_validate_parent_seller()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent record;
begin
  if new.parent_seller_id is null then
    return new;
  end if;

  select m.role, m.is_active, m.parent_seller_id
    into v_parent
  from memberships m
  where m.profile_id = new.parent_seller_id
    and m.organization_id = new.organization_id;

  -- La FK compuesta ya garantiza que la fila existe en esta organizacion; esto
  -- solo puede fallar por rol o por estado.
  if v_parent.role <> 'seller' or not v_parent.is_active then
    raise exception 'El vendedor a cargo del equipo no es un vendedor activo de la organizacion.'
      using errcode = 'check_violation';
  end if;

  -- BR-E03 — dos niveles. Cambiar esta condicion (y la politica
  -- `memberships_insert_seller`) es lo unico que hace falta para permitir mas.
  if v_parent.parent_seller_id is not null then
    raise exception 'Un vendedor que ya pertenece a un equipo no puede tener su propio equipo.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function memberships_validate_parent_seller is
  'Valida el vinculo con el vendedor padre: activo, con rol seller y sin padre propio (BR-E02, BR-E03).';

-- I-020: PostgreSQL concede EXECUTE a PUBLIC al crear una funcion y las default
-- privileges de 0015 no siempre lo alcanzan, asi que hay que revocarlo a mano
-- aunque sea una funcion de trigger. Es seguro: el privilegio se comprueba al
-- CREAR el trigger, no cada vez que se dispara (nota de 0015).
revoke execute on function memberships_validate_parent_seller() from anon, public;

create trigger memberships_validate_parent_seller
  before insert or update of parent_seller_id, role, organization_id on memberships
  for each row execute function memberships_validate_parent_seller();

-- -----------------------------------------------------------------------------
-- current_team_seller_ids() — quienes forman el equipo de quien consulta
--
-- SECURITY DEFINER por el mismo motivo que `current_org_ids()` (0001): se usa
-- DENTRO de politicas de RLS y consultar `memberships` con el rol del usuario
-- provocaria recursion. STABLE para que PostgreSQL la evalue una sola vez por
-- consulta cuando se usa como subselect (D-063, I-019): pasarle una columna la
-- convertiria en una llamada POR FILA y hundiria el rendimiento de la tabla mas
-- grande del sistema.
--
-- Devuelve los integrantes DIRECTOS, que hoy son el equipo entero (dos niveles).
-- Incluye a los desactivados a proposito: sus ventas siguen existiendo y el
-- vendedor padre debe seguir viendo su historial (mismo criterio que BR-U06).
--
-- Se usa en `profiles_select` y `memberships_select`, NO en `tickets_select`:
-- las ventas del equipo van por `team_sales_summary` / `team_member_sales`.
-- -----------------------------------------------------------------------------
create function current_team_seller_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.profile_id
  from memberships m
  where m.parent_seller_id = auth.uid()
$$;

comment on function current_team_seller_ids is
  'Perfiles del equipo del usuario actual (integrantes directos). Pensada para usarse como subselect en politicas de RLS (D-063).';

revoke execute on function current_team_seller_ids() from anon, public;
grant execute on function current_team_seller_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- current_profile_leads_team(org) — quien llama puede tener equipo propio
--
-- Responde a la pregunta completa de BR-E04 en una sola condicion: el usuario
-- actual es un vendedor ACTIVO de esa organizacion y NO pertenece al equipo de
-- nadie (dos niveles, BR-E03).
--
-- Existe por una razon concreta y comprobada: la primera version de la politica
-- de alta llevaba dentro un `not exists (select ... from memberships ...)` y
-- PostgreSQL respondio `infinite recursion detected in policy for relation
-- "memberships"` —una politica de memberships no puede consultar memberships con
-- el rol del usuario—. Es el mismo motivo por el que existen `current_org_ids()`
-- y `has_org_role()` desde 0001 (docs/ARCHITECTURE.md §13.1).
--
-- Recibe la organizacion como argumento, igual que `has_org_role()`: se evalua
-- sobre la fila que se inserta, no sobre una tabla entera, asi que no incurre en
-- el problema de rendimiento de D-063/I-019.
-- -----------------------------------------------------------------------------
create function current_profile_leads_team(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from memberships m
    join profiles p on p.id = m.profile_id
    join organizations o on o.id = m.organization_id
    where m.profile_id = auth.uid()
      and m.organization_id = p_org
      and m.role = 'seller'
      and m.parent_seller_id is null
      and m.is_active and p.is_active and o.is_active
  )
$$;

comment on function current_profile_leads_team is
  'True si el usuario actual es un vendedor activo de esa organizacion que no pertenece al equipo de nadie, y por tanto puede formar el suyo (BR-E03, BR-E04).';

revoke execute on function current_profile_leads_team(uuid) from anon, public;
grant execute on function current_profile_leads_team(uuid) to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles — el vendedor padre ve el nombre y el contacto de su equipo
--
-- Sin esto, la pantalla «Equipo» mostraria filas sin nombre: la politica solo
-- deja a cada quien su propio perfil y al personal los de su organizacion. Se
-- conserva intacto lo demas, incluida la visibilidad de los perfiles inactivos
-- para el personal (0011, I-011).
--
-- ⚠️ Se parte de la version VIGENTE, la de 0014, no de la de 0011: aquella
-- llamaba a `is_org_staff(<columna>)` y a `current_profile_id()` sin envolver,
-- que es el patron de una llamada POR FILA que costo 1.667 ms (I-019, D-063).
-- Reescribirla desde el texto antiguo reintroduciria el problema en silencio;
-- lo detectan las comprobaciones de catalogo F7-03.
-- -----------------------------------------------------------------------------
drop policy profiles_select on profiles;

create policy profiles_select on profiles for select to authenticated
using (
  id = (select current_profile_id())
  or id in (select current_team_seller_ids())
  or exists (
    select 1
    from memberships m_target
    where m_target.profile_id = profiles.id
      and m_target.organization_id in (select current_staff_org_ids())
  )
);

comment on table profiles is
  'Datos de la persona usuaria. Se crea automaticamente al registrarse en auth.users. El personal ve los perfiles de su organizacion, incluidos los inactivos (0011); un vendedor ve ademas los de su equipo (0022).';

-- -----------------------------------------------------------------------------
-- memberships — el vendedor padre ve el estado de sus integrantes
--
-- Necesario para saber si un integrante sigue activo y para pintar la jerarquia.
-- No le da ningun permiso de escritura: no existe politica de UPDATE para quien
-- no es personal, asi que un vendedor no puede cambiar el rol, el estado ni el
-- vendedor padre de nadie, empezando por si mismo (BR-E06).
-- -----------------------------------------------------------------------------
drop policy memberships_select on memberships;

create policy memberships_select on memberships for select to authenticated
using (
  profile_id = (select current_profile_id())
  or profile_id in (select current_team_seller_ids())
  or organization_id in (select current_staff_org_ids())
);

-- =============================================================================
-- Las ventas del equipo — por funcion, NO ampliando `tickets_select`
--
-- POR QUE NO SE TOCA LA POLITICA DE BOLETAS
--
-- La primera version de esta migracion agregaba una tercera via a
-- `tickets_select` (`or seller_id in (select current_team_seller_ids())`).
-- Funcionaba, pero cambiaba el significado de una invariante de la que dependia
-- en silencio medio portal del vendedor: «lo que devuelve la RLS es lo mio».
-- Al probarlo se vio el alcance real del cambio — «Mis boletas», el panel, los
-- reportes, la busqueda y la seleccion multiple habrian empezado a incluir
-- boletas del equipo sin que nadie lo pidiera, y cada consulta NUEVA que
-- alguien escribiera en el futuro heredaria la misma trampa.
--
-- Aqui el acceso del vendedor padre es explicito: dos funciones que solo pueden
-- responder por su propio equipo. La autorizacion no es un parametro que se
-- pueda manipular, es el `where m.parent_seller_id = auth.uid()` del cuerpo: no
-- existe forma de preguntar por el equipo de otro. Es el mismo patron que usa
-- todo el proyecto para lo que la RLS no expresa bien (`assign_ticket`,
-- `bulk_*`, `report_*`).
--
-- Consecuencia buscada: `tickets_select` sigue diciendo exactamente lo que
-- decia, y ninguna pantalla existente cambia de comportamiento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- team_sales_summary — como va cada integrante, en UNA consulta
--
-- Una fila por integrante. Sin N+1: el panel del equipo no consulta por
-- vendedor, pide esto una vez (encargo del usuario, seccion PERFORMANCE).
--
-- `tickets_paid` cuenta las boletas PAGADAS por completo, que son las que
-- cuentan para la comision (decision del usuario). Se devuelve junto a
-- `tickets_assigned` —las vendidas— para que la pantalla pueda decir las dos
-- cosas sin mezclarlas.
-- -----------------------------------------------------------------------------
create function team_sales_summary(p_raffle_id uuid default null)
returns table (
  seller_id        uuid,
  tickets_total    bigint,
  tickets_assigned bigint,
  tickets_paid     bigint,
  total_sold       bigint,
  total_collected  bigint,
  pending_amount   bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.seller_id,
    count(*)::bigint,
    count(*) filter (where t.inventory_status = 'assigned')::bigint,
    count(*) filter (where t.inventory_status = 'assigned' and t.payment_status = 'paid')::bigint,
    coalesce(sum(t.sale_price)  filter (where t.inventory_status = 'assigned'), 0)::bigint,
    coalesce(sum(t.paid_amount) filter (where t.inventory_status = 'assigned'), 0)::bigint,
    coalesce(sum(t.sale_price - t.paid_amount)
               filter (where t.inventory_status = 'assigned'), 0)::bigint
  from tickets t
  join memberships m
    on m.profile_id = t.seller_id
   and m.organization_id = t.organization_id
  where m.parent_seller_id = auth.uid()
    -- Quien llama tiene que seguir siendo miembro activo: la funcion omite RLS,
    -- asi que una sesion desactivada no puede colarse por aqui (BR-A04).
    and t.organization_id in (select current_org_ids())
    and (p_raffle_id is null or t.raffle_id = p_raffle_id)
  group by t.seller_id
$$;

comment on function team_sales_summary is
  'Indicadores de los integrantes del equipo de quien consulta, una fila por vendedor (BR-E05). No admite preguntar por un equipo ajeno.';

revoke execute on function team_sales_summary(uuid) from anon, public;
grant execute on function team_sales_summary(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- team_member_sales — las ventas de UN integrante
--
-- Devuelve la boleta y su dinero, nunca el cliente: el equipo comparte ventas,
-- no cartera (BR-E05). Si `p_member_id` no es del equipo de quien llama, el
-- resultado es vacio; no hace falta un error distinto porque no revela nada.
-- -----------------------------------------------------------------------------
create function team_member_sales(p_member_id uuid, p_limit integer default 20)
returns table (
  ticket_id      uuid,
  daily_number   text,
  weekly_number  text,
  sale_price     bigint,
  paid_amount    bigint,
  payment_status ticket_payment_status,
  sale_date      date,
  assigned_at    timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.id, t.daily_number, t.weekly_number, t.sale_price, t.paid_amount,
    t.payment_status, t.sale_date, t.assigned_at
  from tickets t
  join memberships m
    on m.profile_id = t.seller_id
   and m.organization_id = t.organization_id
  where m.parent_seller_id = auth.uid()
    and t.seller_id = p_member_id
    and t.inventory_status = 'assigned'
    and t.organization_id in (select current_org_ids())
  order by t.assigned_at desc nulls last, t.daily_number
  limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

comment on function team_member_sales is
  'Ventas de un integrante del equipo de quien consulta, sin datos del cliente (BR-E05).';

revoke execute on function team_member_sales(uuid, integer) from anon, public;
grant execute on function team_member_sales(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- memberships — alta de integrantes por un vendedor (BR-E04)
--
-- Hasta ahora solo el personal podia crear membresias. Esta politica abre una
-- puerta muy estrecha, y cada condicion cierra un abuso concreto:
--
--   role = 'seller'                -> nadie se crea un Administrador ni un Dueño.
--   parent_seller_id = quien llama -> nadie mete gente en el equipo de otro, y
--                                     tampoco crea vendedores sueltos a cargo
--                                     del Dueño, que sigue siendo de BR-U01.
--   current_profile_leads_team()   -> quien llama es vendedor activo de ESA
--                                     organizacion y no pertenece al equipo de
--                                     nadie (BR-E03, dos niveles).
--
-- La cuenta de Auth se sigue creando por invitacion desde el servidor con la
-- service role (D-045): esta politica gobierna el dato de negocio, que es lo
-- que decide quien manda sobre quien.
-- -----------------------------------------------------------------------------
create policy memberships_insert_seller on memberships for insert to authenticated
with check (
  organization_id in (select current_org_ids())
  and role = 'seller'
  and parent_seller_id = (select current_profile_id())
  and current_profile_leads_team(organization_id)
);

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop policy memberships_insert_seller on memberships;
-- drop function team_member_sales(uuid, integer);
-- drop function team_sales_summary(uuid);
--
-- Las dos siguientes restauran la version de 0014 (la vigente antes de esta
-- migracion), NO la de 0001/0011: usar aquel texto reintroduciria I-019.
--
-- drop policy memberships_select on memberships;
-- create policy memberships_select on memberships for select to authenticated
-- using (
--   profile_id = (select current_profile_id())
--   or organization_id in (select current_staff_org_ids())
-- );
--
-- drop policy profiles_select on profiles;
-- create policy profiles_select on profiles for select to authenticated
-- using (
--   id = (select current_profile_id())
--   or exists (
--     select 1 from memberships m_target
--     where m_target.profile_id = profiles.id
--       and m_target.organization_id in (select current_staff_org_ids())
--   )
-- );
--
-- drop function current_profile_leads_team(uuid);
-- drop function current_team_seller_ids();
-- drop trigger memberships_validate_parent_seller on memberships;
-- drop function memberships_validate_parent_seller();
-- drop index memberships_parent_seller_idx;
-- alter table memberships drop constraint memberships_parent_only_for_sellers;
-- alter table memberships drop constraint memberships_parent_not_self;
-- alter table memberships drop constraint memberships_parent_seller_fk;
-- alter table memberships drop column parent_seller_id;
--
-- Revertir NO borra datos de negocio: sin la columna, todos los vendedores
-- vuelven a depender del Dueño/Administrador y sus equipos dejan de existir.
-- =============================================================================
