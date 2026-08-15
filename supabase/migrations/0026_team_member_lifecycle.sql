-- =============================================================================
-- 0026_team_member_lifecycle.sql
-- Equipos de vendedores — corregir a un integrante mientras su invitación sigue
-- pendiente.
--
-- Referencia: docs/BUSINESS_RULES.md BR-E14..BR-E19, docs/DECISIONS.md D-097.
--
-- EL PROBLEMA
--
-- Un vendedor padre da de alta a alguien de su equipo escribiendo su correo a
-- mano (BR-E04). Si se equivoca —`gmial.com` por `gmail.com`— hasta hoy no
-- existía forma de arreglarlo: `updateUser` nunca tocó el correo, no hay
-- política que deje a un vendedor escribir el perfil de nadie, y en este
-- proyecto las personas no se borran (D-038). El alta quedaba muerta y ocupando
-- un correo.
--
-- QUÉ SIGNIFICA «PENDIENTE» Y POR QUÉ NO ERA DEDUCIBLE
--
-- La aplicación ya guardaba `memberships.is_active` y `profiles.is_active`,
-- pero eso es otra cosa: significa «el personal le quitó el acceso», no «esta
-- persona todavía no entró». Un integrante recién invitado está ACTIVO y a la
-- vez sin cuenta utilizable. No había ningún dato que los distinguiera.
--
-- `profiles.activated_at` guarda ese hecho a este lado, para que se pueda leer
-- bajo RLS sin la service role y sin una consulta por fila contra Auth.
--
-- LA CONDICIÓN ES LA CONTRASEÑA, Y NO SE PUEDE DEDUCIR DE `auth.users`
--
-- El encargo fue explícito: no vale «abrió el correo», tiene que ser «configuró
-- su cuenta». Lo primero que se intentó fue mirar `auth.users.encrypted_password`
-- —una cuenta invitada nace sin contraseña—, y la prueba BD E2-02 demostró que
-- no sirve: al verificar el enlace de invitación, GoTrue **escribe un hash
-- aleatorio** en esa columna. Con ese criterio, abrir el correo activaba la
-- cuenta; justo lo que había que evitar (D-097).
--
-- Así que el momento lo marca la aplicación, que es la única que lo sabe con
-- certeza: `mark_profile_activated()` se llama cuando la persona termina de
-- definir su contraseña en `/reset-password`, y también al entrar con
-- contraseña —quien inicia sesión así demostró tener una—. Es la misma pantalla
-- de la Fase 1, sin flujo nuevo.
--
-- QUÉ ABRE ESTA MIGRACIÓN, Y QUÉ NO
--
-- Tres funciones para el vendedor padre, ninguna política nueva. `authenticated`
-- tiene UPDATE sobre TODAS las columnas de `profiles` (0009/0010), así que una
-- política de escritura para el vendedor padre le habría permitido de paso
-- reescribir `is_active` de un integrante —dejarlo fuera de la aplicación— o su
-- correo sin pasar por Auth. Por función el permiso es exactamente el pedido y
-- ni una columna más; es el mismo criterio de `assign_ticket` y `bulk_*`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles.activated_at
-- -----------------------------------------------------------------------------
alter table profiles
  add column activated_at timestamptz;

comment on column profiles.activated_at is
  'Cuándo la persona configuró su contraseña y su cuenta quedó utilizable (BR-E14). NULL = invitación pendiente. Lo estampa mark_profile_activated() desde la aplicación; no se deduce de auth.users (D-097).';

-- Backfill: todo el que YA tiene contraseña está activado. Sin esto, cada
-- vendedor existente aparecería como «invitación pendiente» y —peor— pasaría a
-- ser borrable por su vendedor padre.
--
-- Aquí sí se usa `encrypted_password`, y de forma deliberada: para las cuentas
-- que ya existen el criterio se equivoca solo en un sentido —dar por activada a
-- alguien que abrió el enlace y nunca puso contraseña—, y ese error es el
-- seguro: quita permisos al vendedor padre, nunca da acceso a nadie.
--
-- La marca de tiempo es aproximada a propósito (no existe registro histórico de
-- cuándo se configuró cada contraseña); lo que gobierna las reglas es si es nula
-- o no, no su valor exacto.
update profiles p
set activated_at = coalesce(u.last_sign_in_at, u.email_confirmed_at, u.created_at, now())
from auth.users u
where u.id = p.id
  and coalesce(u.encrypted_password, '') <> '';

-- El índice parcial sirve a la única pregunta que se hace de esta columna:
-- «¿quién sigue pendiente?». Los pendientes son unos pocos frente al total.
create index profiles_pending_activation_idx
  on profiles (id)
  where activated_at is null;

-- -----------------------------------------------------------------------------
-- El alta con contraseña ya nace activada
--
-- Reemplaza la función de 0001 conservando su comportamiento; lo único nuevo es
-- la última columna. Cubre el camino de `auth.admin.createUser({ password })`,
-- que usan el seed y las pruebas: esas cuentas nunca pasan por una invitación.
-- -----------------------------------------------------------------------------
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, alias, phone, email, activated_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'alias',
    coalesce(new.raw_user_meta_data ->> 'phone', '0000000'),
    new.email,
    case when coalesce(new.encrypted_password, '') <> '' then now() end
  );
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- mark_profile_activated — «ya configuré mi cuenta»
--
-- La llama la propia persona, y solo puede hablar de sí misma: el `where` es
-- `auth.uid()`, no un argumento. Lo peor que puede hacer alguien llamándola a
-- mano es declarar activada su propia cuenta, que es exactamente lo que la
-- pantalla de contraseña hace por él un segundo después.
--
-- Idempotente: la guarda `activated_at is null` conserva la primera fecha, así
-- que cambiar la contraseña más adelante no la mueve.
-- -----------------------------------------------------------------------------
create function mark_profile_activated()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update profiles
  set activated_at = now()
  where id = auth.uid()
    and activated_at is null;
$$;

comment on function mark_profile_activated is
  'Marca la cuenta de quien llama como activada. Se invoca al terminar de definir la contraseña y al entrar con contraseña (BR-E14).';

-- Sus privilegios se fijan con los de las demás, al final del archivo.

-- =============================================================================
-- Las tres operaciones del vendedor padre sobre su equipo
--
-- Las tres comparten la misma puerta: `current_profile_leads_team()` —la misma
-- condición que gobierna el alta desde 0022— más `parent_seller_id = auth.uid()`.
-- Un vendedor no puede tocar a nadie que no sea de SU equipo, y quien no lidera
-- un equipo no puede tocar a nadie.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- team_member_guard — la comprobación, escrita una sola vez
--
-- Devuelve la organización del integrante si quien llama puede administrarlo, y
-- levanta un error explicable si no. Interna: no se concede a nadie, la ejecutan
-- las tres funciones públicas de abajo (mismo criterio que `lock_ticket_batch`
-- en 0020).
-- -----------------------------------------------------------------------------
create function team_member_guard(p_member_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  perform require_auth();

  select m.organization_id into v_org
  from memberships m
  where m.profile_id = p_member_id
    and m.parent_seller_id = auth.uid()
    and m.role = 'seller'
    and m.organization_id in (select current_org_ids());

  -- Un integrante ajeno y uno inexistente responden igual, para no confirmar
  -- que ese vendedor existe (BR-E05, BR-U07).
  if v_org is null or not current_profile_leads_team(v_org) then
    raise exception 'Este vendedor no es de tu equipo.'
      using errcode = 'insufficient_privilege';
  end if;

  return v_org;
end;
$$;

comment on function team_member_guard is
  'Autoriza a un vendedor padre sobre un integrante de SU equipo y devuelve la organización. Uso interno de las funciones team_* (BR-E15).';

-- -----------------------------------------------------------------------------
-- team_update_member — corregir los datos de un integrante (BR-E15, BR-E16)
--
-- Nombre, alias y celular se pueden corregir SIEMPRE. El correo, solo mientras
-- la invitación siga pendiente: después de activar la cuenta es la credencial
-- con la que esa persona entra, y su dueña es ella (BR-E16).
--
-- La función NO escribe el correo nuevo. La fuente de verdad del correo es Auth
-- (comentario de `profiles.email` en 0001) y `sync_profile_email` lo copia solo
-- cuando Auth cambia de verdad. Aquí se decide si el cambio está PERMITIDO y se
-- devuelve el correo anterior, que es lo que la aplicación necesita para
-- deshacer si el envío falla.
-- -----------------------------------------------------------------------------
create function team_update_member(
  p_member_id uuid,
  p_full_name text,
  p_alias     text,
  p_phone     text,
  p_email     text default null
)
returns table (rotate_invitation boolean, previous_email text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid;
  v_before   record;
  v_email    text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_rotate   boolean := false;
begin
  v_org := team_member_guard(p_member_id);

  select p.full_name, p.alias, p.phone, p.email, p.activated_at
    into v_before
  from profiles p
  where p.id = p_member_id;

  if v_email is not null and v_email <> lower(v_before.email) then
    -- BR-E16: pasada la activación, el correo es de solo lectura para todos.
    if v_before.activated_at is not null then
      raise exception 'Esta persona ya activó su cuenta, así que su correo no se puede cambiar.'
        using errcode = 'check_violation';
    end if;

    -- Un correo por persona: Auth lo rechazaría igual, pero con un mensaje que
    -- no se puede mostrar y después de haber consumido el intento.
    -- Sin `errcode` a propósito: `unique_violation` (23505) no está entre los
    -- códigos cuyo mensaje propaga `mapPgError`, y la persona vería «Ya existe
    -- un registro con estos datos» en vez de saber qué corregir. P0001 es el
    -- código de un error de negocio redactado por nosotros (`lib/errors.ts`).
    if exists (select 1 from profiles p where p.id <> p_member_id and lower(p.email) = v_email) then
      raise exception 'Ese correo ya pertenece a otra persona.';
    end if;

    v_rotate := true;
  end if;

  update profiles
  set full_name = btrim(p_full_name),
      alias     = nullif(btrim(coalesce(p_alias, '')), ''),
      phone     = btrim(p_phone)
  where id = p_member_id;

  -- Solo los datos que esta función escribió de verdad. El cambio de correo lo
  -- registra `team_confirm_email_change`, cuando ya ocurrió.
  perform write_audit_log(
    v_org, 'user.update', 'user', p_member_id,
    jsonb_build_object('full_name', v_before.full_name, 'alias', v_before.alias, 'phone', v_before.phone),
    jsonb_build_object('full_name', btrim(p_full_name),
                       'alias', nullif(btrim(coalesce(p_alias, '')), ''),
                       'phone', btrim(p_phone))
  );

  return query select v_rotate, v_before.email;
end;
$$;

comment on function team_update_member(uuid, text, text, text, text) is
  'Corrige nombre, alias y celular de un integrante del equipo de quien llama. Autoriza además el cambio de correo mientras la invitación siga pendiente, sin escribirlo: eso es de Auth (BR-E15, BR-E16).';

-- -----------------------------------------------------------------------------
-- team_confirm_email_change — el cambio de correo, ya consumado (BR-E16)
--
-- Se llama DESPUÉS de que Auth aceptó el correo nuevo y salió la invitación. Por
-- eso el registro de auditoría se escribe aquí y no en `team_update_member`: una
-- bitácora que anota intenciones en vez de hechos no sirve para reconstruir nada.
--
-- Vuelve a comprobar que la cuenta sigue sin activarse. Cierra una carrera real
-- aunque estrecha: que la persona configure su contraseña justo entre la
-- autorización y el cambio. Si eso pasó, esto falla y la aplicación devuelve el
-- correo anterior a su sitio.
-- -----------------------------------------------------------------------------
create function team_confirm_email_change(
  p_member_id      uuid,
  p_previous_email text,
  p_new_email      text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  v_org := team_member_guard(p_member_id);

  if exists (select 1 from profiles p where p.id = p_member_id and p.activated_at is not null) then
    raise exception 'Esta persona activó su cuenta mientras se enviaba la invitación. Su correo no se puede cambiar.'
      using errcode = 'check_violation';
  end if;

  perform write_audit_log(
    v_org, 'user.email_change', 'user', p_member_id,
    jsonb_build_object('email', p_previous_email),
    jsonb_build_object('email', p_new_email)
  );
end;
$$;

comment on function team_confirm_email_change(uuid, text, text) is
  'Deja en la bitácora un cambio de correo de un integrante que YA ocurrió en Auth, y comprueba que la cuenta siga sin activarse (BR-E16).';

-- -----------------------------------------------------------------------------
-- team_delete_member — borrar un alta equivocada (BR-E17)
--
-- QUÉ ES Y QUÉ NO ES, otra vez
--
-- Es el mismo verbo acotado de `bulk_delete_tickets` (BR-B05, D-084): borrar
-- algo que nunca debió existir. No es «dar de baja» a un vendedor —eso es
-- DESACTIVAR, sigue siendo del personal y conserva todo (BR-U06, D-038)—. Aquí
-- se borra un alta que jamás llegó a ser una cuenta: sin contraseña, sin
-- boletas, sin clientes y sin pagos.
--
-- Esta función borra la MEMBRESÍA. La cuenta de Auth la borra después la
-- aplicación con la service role, y al hacerlo `profiles` se va en cascada
-- (0001) y con ella cualquier invitación pendiente: no queda ningún enlace que
-- pueda usarse (BR-E18).
-- -----------------------------------------------------------------------------
create function team_delete_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid;
  v_before record;
begin
  v_org := team_member_guard(p_member_id);

  select p.full_name, p.email, p.phone, p.activated_at
    into v_before
  from profiles p
  where p.id = p_member_id;

  if v_before.activated_at is not null then
    raise exception 'Esta persona ya activó su cuenta, así que no se puede eliminar. Pide a un administrador que la desactive.'
      using errcode = 'check_violation';
  end if;

  -- El personal puede haberle asignado boletas antes de que activara. Si hay
  -- rastro comercial, esto ya no es un alta equivocada.
  if exists (select 1 from tickets t where t.seller_id = p_member_id) then
    raise exception 'Este vendedor ya tiene boletas a su nombre, así que no se puede eliminar.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from clients c where c.seller_id = p_member_id) then
    raise exception 'Este vendedor ya tiene clientes a su nombre, así que no se puede eliminar.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from payments pay where pay.seller_id = p_member_id) then
    raise exception 'Este vendedor ya tiene pagos registrados, así que no se puede eliminar.'
      using errcode = 'check_violation';
  end if;

  -- El detalle se toma ANTES de borrar; después no habría de dónde sacarlo.
  perform write_audit_log(
    v_org, 'user.delete', 'user', p_member_id,
    jsonb_build_object('full_name', v_before.full_name, 'email', v_before.email,
                       'phone', v_before.phone, 'parent_seller_id', auth.uid()),
    null
  );

  delete from memberships
  where profile_id = p_member_id
    and organization_id = v_org;
end;
$$;

comment on function team_delete_member(uuid) is
  'Borra la membresía de un integrante que nunca activó su cuenta ni entró al flujo comercial. La cuenta de Auth la borra después la aplicación (BR-E17, BR-E18).';

-- =============================================================================
-- Privilegios (regla 3 de docs/SECURITY.md §4.5)
--
-- PostgreSQL concede EXECUTE a PUBLIC en toda función nueva y las default
-- privileges de 0015 no alcanzan a PUBLIC (I-020): se revoca explícitamente.
--
-- `team_member_guard` no se concede a nadie: es pieza interna de las otras tres,
-- que al ser SECURITY DEFINER la ejecutan con el dueño.
-- =============================================================================
revoke execute on function mark_profile_activated() from public, anon;
grant execute on function mark_profile_activated() to authenticated;

revoke execute on function team_member_guard(uuid) from public, anon, authenticated;

revoke execute on function team_update_member(uuid, text, text, text, text) from public, anon;
revoke execute on function team_confirm_email_change(uuid, text, text) from public, anon;
revoke execute on function team_delete_member(uuid) from public, anon;

grant execute on function team_update_member(uuid, text, text, text, text) to authenticated;
grant execute on function team_confirm_email_change(uuid, text, text) to authenticated;
grant execute on function team_delete_member(uuid) to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function team_delete_member(uuid);
-- drop function team_confirm_email_change(uuid, text, text);
-- drop function team_update_member(uuid, text, text, text, text);
-- drop function team_member_guard(uuid);
-- drop function mark_profile_activated();
-- drop index profiles_pending_activation_idx;
-- alter table profiles drop column activated_at;
--
-- `handle_new_auth_user` vuelve a su texto de 0001 (sin la columna activated_at).
--
-- Revertir NO borra datos de negocio: sin la columna, deja de distinguirse quién
-- tiene la invitación pendiente y las tres funciones del vendedor padre
-- desaparecen. Lo ya borrado con `team_delete_member` no vuelve.
-- =============================================================================
