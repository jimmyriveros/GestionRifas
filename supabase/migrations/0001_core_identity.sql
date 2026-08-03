-- =============================================================================
-- 0001_core_identity.sql
-- Fase 1 — Proyecto base y autenticacion
--
-- Alcance de esta migracion (persistencia minima permitida por la Fase 1):
--   * organizations, profiles, memberships
--   * Funciones auxiliares de seguridad (SECURITY DEFINER, sin recursion RLS)
--   * RLS habilitada y forzada en las 3 tablas, con politicas de SOLO LECTURA
--   * Trigger que crea el profile automaticamente al crear un auth.users
--
-- Explicitamente FUERA de alcance (se agregan en la Fase 2):
--   * raffles, clients, tickets, payments, payment_allocations, audit_logs
--   * Politicas INSERT/UPDATE de memberships/profiles para gestion de usuarios
--     (creacion de administradores/vendedores, proteccion completa del Owner
--     ante un Admin). En la Fase 1 estas tres tablas solo se escriben desde
--     scripts/seed-users.ts con la service role, que omite RLS por diseno.
--
-- Referencia normativa: docs/DATA_MODEL.md §2-4, docs/SECURITY.md §4.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensiones
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type app_role as enum ('owner', 'admin', 'seller');

-- -----------------------------------------------------------------------------
-- Utilidad generica: mantiene updated_at
-- -----------------------------------------------------------------------------
create function set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
create table organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (length(btrim(name)) between 2 and 120),
  default_ticket_price   bigint not null default 100000 check (default_ticket_price > 0),
  currency               char(3) not null default 'COP' check (currency = 'COP'),
  timezone               text not null default 'America/Bogota',
  raffle_counter         int not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

comment on table organizations is 'Empresa duena de rifas, vendedores y clientes. Frontera de aislamiento multiorganizacion.';

-- -----------------------------------------------------------------------------
-- profiles (1:1 con auth.users)
-- -----------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (length(btrim(full_name)) >= 2),
  alias       text,
  phone       text not null check (phone ~ '^[0-9+ ()-]{7,20}$'),
  email       text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

comment on table profiles is 'Datos de la persona usuaria. Se crea automaticamente al registrarse en auth.users.';
comment on column profiles.email is 'Copia desnormalizada de auth.users.email para busqueda; la fuente de verdad es Auth.';

-- -----------------------------------------------------------------------------
-- memberships (usuario x organizacion x rol)
-- -----------------------------------------------------------------------------
create table memberships (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete restrict,
  profile_id       uuid not null references profiles (id) on delete restrict,
  role             app_role not null,
  is_active        boolean not null default true,
  invited_by       uuid references profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint memberships_org_profile_key unique (organization_id, profile_id),
  -- Habilita las FK compuestas de tablas hijas en fases futuras (garantia de organizacion)
  constraint memberships_profile_org_key unique (profile_id, organization_id)
);

create trigger memberships_set_updated_at
  before update on memberships
  for each row execute function set_updated_at();

-- Exactamente un Owner activo por organizacion
create unique index memberships_one_owner_per_org
  on memberships (organization_id)
  where role = 'owner' and is_active;

create index memberships_org_role_active_idx
  on memberships (organization_id, role)
  where is_active;

create index memberships_profile_active_idx
  on memberships (profile_id)
  where is_active;

comment on table memberships is 'Vinculo usuario-organizacion-rol. Acceso efectivo = profile.is_active AND membership.is_active AND organization.is_active.';

-- -----------------------------------------------------------------------------
-- Trigger: crear profile automaticamente al registrar un auth.users
-- Lee full_name/phone desde raw_user_meta_data (provisto por
-- supabase.auth.admin.createUser({ user_metadata: {...} })).
-- -----------------------------------------------------------------------------
create function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, alias, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'alias',
    coalesce(new.raw_user_meta_data ->> 'phone', '0000000'),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Trigger: mantener profiles.email sincronizado con auth.users.email
-- -----------------------------------------------------------------------------
create function sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function sync_profile_email();

-- =============================================================================
-- Funciones auxiliares de seguridad (docs/SECURITY.md §4.1)
--
-- SECURITY DEFINER a proposito: al omitir RLS evitan la recursion infinita
-- que se produciria si una politica de memberships consultara memberships
-- con el propio rol de "authenticated" (que si aplica RLS).
-- =============================================================================

create function current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid()
$$;

create function current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.organization_id
  from memberships m
  join profiles p on p.id = m.profile_id
  join organizations o on o.id = m.organization_id
  where m.profile_id = auth.uid()
    and m.is_active and p.is_active and o.is_active
$$;

create function has_org_role(p_org uuid, p_roles app_role[])
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
      and m.role = any (p_roles)
      and m.is_active and p.is_active and o.is_active
  )
$$;

create function is_org_staff(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select has_org_role(p_org, array['owner','admin']::app_role[])
$$;

revoke execute on function current_profile_id() from public;
revoke execute on function current_org_ids() from public;
revoke execute on function has_org_role(uuid, app_role[]) from public;
revoke execute on function is_org_staff(uuid) from public;

grant execute on function current_profile_id() to authenticated;
grant execute on function current_org_ids() to authenticated;
grant execute on function has_org_role(uuid, app_role[]) to authenticated;
grant execute on function is_org_staff(uuid) to authenticated;

-- =============================================================================
-- Row Level Security
--
-- Solo politicas de LECTURA en esta fase (ver nota de alcance al inicio del
-- archivo). Sin una politica aplicable, PostgreSQL deniega: es el
-- comportamiento buscado.
-- =============================================================================

alter table organizations enable row level security;
alter table organizations force row level security;
alter table profiles enable row level security;
alter table profiles force row level security;
alter table memberships enable row level security;
alter table memberships force row level security;

-- organizations: visible para miembros activos
create policy organizations_select on organizations for select to authenticated
using (
  id in (select current_org_ids())
);

-- profiles: el propio perfil, y el personal (owner/admin) ve los perfiles
-- de su organizacion
create policy profiles_select on profiles for select to authenticated
using (
  id = current_profile_id()
  or exists (
    select 1
    from memberships m_target
    where m_target.profile_id = profiles.id
      and m_target.is_active
      and is_org_staff(m_target.organization_id)
  )
);

-- profiles: cada quien edita su propio perfil (campos basicos)
create policy profiles_update_self on profiles for update to authenticated
using (id = current_profile_id())
with check (id = current_profile_id());

-- memberships: el propio registro, y el personal ve las de su organizacion
create policy memberships_select on memberships for select to authenticated
using (
  profile_id = current_profile_id()
  or is_org_staff(organization_id)
);

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop trigger on_auth_user_email_updated on auth.users;
-- drop trigger on_auth_user_created on auth.users;
-- drop function sync_profile_email();
-- drop function handle_new_auth_user();
-- drop table memberships;
-- drop table profiles;
-- drop table organizations;
-- drop function is_org_staff(uuid);
-- drop function has_org_role(uuid, app_role[]);
-- drop function current_org_ids();
-- drop function current_profile_id();
-- drop function set_updated_at();
-- drop type app_role;
-- =============================================================================
