-- =============================================================================
-- 0023_notifications.sql
-- Equipos de vendedores — Fase 4: avisos
--
-- Referencia: docs/BUSINESS_RULES.md BR-E10..BR-E13, docs/DECISIONS.md D-093.
--
-- POR QUE EXISTE ESTA TABLA
--
-- El encargo pedia «reutilizar el sistema de notificaciones existente y no
-- crear uno paralelo». No habia ninguno: la aplicacion solo tenia toasts
-- (`sonner`), que son un mensaje efimero en la pantalla que ya estas mirando, y
-- `audit_logs`, que es una bitacora tecnica para el personal y no una bandeja
-- de nadie. Asi que se construye el primero, con la forma mas pequeña que
-- resuelve lo pedido: una tabla, una campanita y ningun tiempo real.
--
-- EL TEXTO NO SE GUARDA AQUI
--
-- La fila guarda QUE paso (`kind`) y los datos minimos para contarlo (`data`),
-- no la frase. La frase la arma la aplicacion. No es una preferencia de estilo:
-- I-030 documenta que los mensajes escritos dentro de la base de datos quedaron
-- sin tildes y corregirlos exige una migracion nueva y aplicarla a produccion.
-- Con el texto en la aplicacion, mejorar una redaccion es cambiar un archivo de
-- TypeScript, que es como se corrige todo lo demas que lee un usuario
-- (UX_COPY_GUIDELINES, Anexo B).
--
-- QUIEN RECIBE QUE (BR-E11)
--
--   team.member_added -> el personal (Dueño y Administradores) de la
--                        organizacion. Es un cambio en la estructura comercial y
--                        es exactamente lo que pidieron saber.
--   team.sale         -> el vendedor padre del vendedor que vendio, y el
--                        personal. Al vendedor que vende NO se le notifica su
--                        propia venta: acaba de hacerla.
-- =============================================================================

create table notifications (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations (id) on delete restrict,
  -- A quien va dirigida. Una fila por destinatario: es lo que permite que cada
  -- quien marque como leido lo suyo sin tocar lo de los demas.
  recipient_profile_id uuid not null references profiles (id) on delete restrict,
  -- Quien lo provoco. Puede ser nulo en procesos del sistema.
  actor_profile_id     uuid references profiles (id) on delete restrict,
  kind                 text not null check (kind in ('team.member_added', 'team.sale')),
  entity_type          text,
  entity_id            uuid,
  -- Datos para armar la frase: nombres y numeros, ya resueltos en el momento
  -- del hecho. Guardarlos evita que el destinatario tenga que poder consultar
  -- tablas que quiza no ve (un vendedor padre no ve la boleta de su equipo,
  -- D-092).
  data                 jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  read_at              timestamptz,

  constraint notifications_recipient_org_fk
    foreign key (recipient_profile_id, organization_id)
    references memberships (profile_id, organization_id) on delete restrict
);

comment on table notifications is
  'Avisos dirigidos a una persona concreta. El texto lo arma la aplicacion a partir de kind + data (I-030).';

-- La consulta que se hace en cada carga de pagina: mis avisos, los nuevos
-- primero. El indice parcial atiende ademas el contador de no leidos.
create index notifications_recipient_idx
  on notifications (recipient_profile_id, created_at desc);

create index notifications_unread_idx
  on notifications (recipient_profile_id)
  where read_at is null;

-- -----------------------------------------------------------------------------
-- RLS
--
-- Cada quien ve SOLO lo suyo. Ni siquiera el personal ve la bandeja de otro:
-- una notificacion es correspondencia dirigida, no un registro administrativo
-- —para eso esta `audit_logs`, que el personal si consulta entero (BR-D04)—.
-- -----------------------------------------------------------------------------
alter table notifications enable row level security;
alter table notifications force row level security;

create policy notifications_select on notifications for select to authenticated
using (recipient_profile_id = (select current_profile_id()));

-- Marcar como leido. El UPDATE existe, pero el privilegio esta acotado a la
-- COLUMNA `read_at` (ver los grants de abajo): aunque esta politica dejara
-- pasar la fila, no hay forma de reescribir el texto ni el destinatario.
create policy notifications_update_own on notifications for update to authenticated
using (recipient_profile_id = (select current_profile_id()))
with check (recipient_profile_id = (select current_profile_id()));

-- Sin politica de INSERT: nadie escribe avisos a mano. Solo los crea
-- `notify_profiles`, que es SECURITY DEFINER. Mismo diseño que `audit_logs`.

grant select on notifications to authenticated;
grant update (read_at) on notifications to authenticated;
grant all on notifications to service_role;

-- -----------------------------------------------------------------------------
-- notify_profiles — unico punto de escritura
--
-- Mismo patron y mismo motivo que `write_audit_log` (0006): la tabla no concede
-- INSERT a nadie, asi que solo puede escribir una funcion que corra con el
-- dueño. Se le pasan los destinatarios ya resueltos.
-- -----------------------------------------------------------------------------
create function notify_profiles(
  p_organization_id uuid,
  p_recipients      uuid[],
  p_kind            text,
  p_actor           uuid default null,
  p_entity_type     text default null,
  p_entity_id       uuid default null,
  p_data            jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into notifications (
    organization_id, recipient_profile_id, actor_profile_id, kind,
    entity_type, entity_id, data
  )
  select
    p_organization_id, r, p_actor, p_kind, p_entity_type, p_entity_id, p_data
  from unnest(p_recipients) as r
  -- Nadie se notifica a si mismo lo que acaba de hacer, y el destinatario tiene
  -- que ser miembro de la organizacion: la FK compuesta lo exigiria igual, pero
  -- aqui se descarta en silencio en vez de tumbar la operacion de negocio. Un
  -- aviso que no se puede entregar no puede impedir una venta.
  where r is distinct from p_actor
    and exists (
      select 1 from memberships m
      where m.profile_id = r and m.organization_id = p_organization_id
    );
end;
$$;

comment on function notify_profiles is
  'Unico punto de escritura de notifications. SECURITY DEFINER porque la tabla no concede INSERT a ningun rol.';

revoke execute on function notify_profiles(uuid, uuid[], text, uuid, text, uuid, jsonb) from anon, public;

-- Personal de una organizacion, para dirigirles un aviso.
create function org_staff_profile_ids(p_org uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(m.profile_id), array[]::uuid[])
  from memberships m
  where m.organization_id = p_org
    and m.role in ('owner', 'admin')
    and m.is_active
$$;

comment on function org_staff_profile_ids is
  'Perfiles del Dueño y los Administradores activos de una organizacion, destinatarios de los avisos de estructura (BR-E11).';

revoke execute on function org_staff_profile_ids(uuid) from anon, public;

-- =============================================================================
-- Los dos hechos que se avisan
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Alguien agrego un vendedor a su equipo (BR-E11)
--
-- Va en un trigger y no dentro de la Server Action a proposito: asi el aviso
-- ocurre en la MISMA transaccion que el alta y no depende del camino por el que
-- se creo la membresia. Si algun dia el personal crea un vendedor ya dentro de
-- un equipo, el aviso sale igual.
--
-- `is_first` distingue «creo un equipo» de «agrego a alguien mas»: es la unica
-- diferencia entre los dos textos que pidio el encargo, y se calcula aqui donde
-- el dato esta a mano.
-- -----------------------------------------------------------------------------
create function notify_team_member_added()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_name text;
  v_member_name text;
  v_is_first    boolean;
begin
  if new.parent_seller_id is null then
    return null;
  end if;

  select p.full_name into v_parent_name from profiles p where p.id = new.parent_seller_id;
  select p.full_name into v_member_name from profiles p where p.id = new.profile_id;

  select count(*) = 1 into v_is_first
  from memberships m
  where m.parent_seller_id = new.parent_seller_id
    and m.organization_id = new.organization_id;

  perform notify_profiles(
    new.organization_id,
    org_staff_profile_ids(new.organization_id),
    'team.member_added',
    auth.uid(),
    'membership',
    new.id,
    jsonb_build_object(
      'parent_name', v_parent_name,
      'member_name', v_member_name,
      'is_first', v_is_first
    )
  );

  return null;
end;
$$;

create trigger notify_team_member_added
  after insert on memberships
  for each row execute function notify_team_member_added();

revoke execute on function notify_team_member_added() from anon, public;

-- -----------------------------------------------------------------------------
-- 2. Un vendedor vendio una boleta (BR-E12)
--
-- En un trigger sobre `tickets` y no dentro de `assign_ticket_row`, porque una
-- boleta llega a `assigned` por varios caminos —asignacion individual, masiva e
-- importacion con clientes— y el aviso debe salir en todos sin tener que
-- acordarse de añadirlo en cada uno.
--
-- La boleta se nombra por sus dos numeros (BR-N11), guardados en `data`: el
-- vendedor padre no puede leer la boleta de su equipo (D-092), asi que el dato
-- tiene que viajar con el aviso.
-- -----------------------------------------------------------------------------
create function notify_ticket_sold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent      uuid;
  v_seller_name text;
  v_recipients  uuid[];
begin
  -- Solo la TRANSICION a vendida. Un update posterior de la misma boleta —un
  -- abono, por ejemplo— no vuelve a avisar.
  if new.inventory_status <> 'assigned' or old.inventory_status = 'assigned' then
    return null;
  end if;

  select m.parent_seller_id into v_parent
  from memberships m
  where m.profile_id = new.seller_id
    and m.organization_id = new.organization_id;

  select p.full_name into v_seller_name from profiles p where p.id = new.seller_id;

  v_recipients := org_staff_profile_ids(new.organization_id);
  if v_parent is not null then
    v_recipients := v_recipients || v_parent;
  end if;

  perform notify_profiles(
    new.organization_id,
    v_recipients,
    'team.sale',
    auth.uid(),
    'ticket',
    new.id,
    jsonb_build_object(
      'seller_name', v_seller_name,
      'daily_number', new.daily_number,
      'weekly_number', new.weekly_number,
      'sale_price', new.sale_price
    )
  );

  return null;
end;
$$;

create trigger notify_ticket_sold
  after update of inventory_status on tickets
  for each row execute function notify_ticket_sold();

revoke execute on function notify_ticket_sold() from anon, public;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop trigger notify_ticket_sold on tickets;
-- drop function notify_ticket_sold();
-- drop trigger notify_team_member_added on memberships;
-- drop function notify_team_member_added();
-- drop function org_staff_profile_ids(uuid);
-- drop function notify_profiles(uuid, uuid[], text, uuid, text, uuid, jsonb);
-- drop table notifications;
--
-- Revertir borra los avisos ya entregados. No borra ningun dato de negocio: un
-- aviso es una copia de algo que ya esta en `tickets`, `memberships` y
-- `audit_logs`.
-- =============================================================================
