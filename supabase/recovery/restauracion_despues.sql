-- =============================================================================
-- RESTAURAR EL RESPALDO — paso 3 de 3: lo que el respaldo no trae (D-239)
--
-- NO es una migración. Va después de `restauracion_vaciar_public.sql` y de
-- `roles.sql`, `schema.sql` y `data.sql` del respaldo (RUNBOOK §5.2), con la pausa
-- de publicación todavía CERRADA. El historial de migraciones NO se toca aquí: se
-- repara con `supabase migration repair` hasta que diga lo mismo que la foto del
-- respaldo (RUNBOOK §10.6), y después se compara la estructura con esa foto.
--
-- 1. Los dos disparadores de `auth.users` (`0001`): el respaldo no incluye el
--    esquema `auth`, y vaciar `public` se los llevó con sus funciones. Sin ellos,
--    una persona invitada después no tendría perfil y un cambio de correo no
--    llegaría a `profiles` (medido en el ensayo de D-239).
-- 2. La ACL explícita de `raffle_prize_transitions` —solo su dueño—: `pg_dump` no la
--    escribe porque coincide con la de por defecto, así que vuelve sin ACL. El
--    permiso efectivo es el mismo; se materializa para que la estructura cuadre.
-- =============================================================================

begin;

do $despues$
begin
  if to_regprocedure('public.handle_new_auth_user()') is null
     or to_regprocedure('public.sync_profile_email()') is null then
    raise exception 'public no está restaurado: faltan las funciones de los disparadores de auth.users. No se cambió nada.';
  end if;
  -- Dos `if`, por lo mismo que en `restauracion_vaciar_public.sql` (D-240).
  if to_regclass('pausa.estado') is null then
    raise exception 'La pausa de publicación no está cerrada. No se cambió nada.';
  end if;
  if not exists (select 1 from pausa.estado where id = 1 and cerrada) then
    raise exception 'La pausa de publicación no está cerrada. No se cambió nada.';
  end if;
end
$despues$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

do $despues$
begin
  if to_regclass('public.raffle_prize_transitions') is not null then
    revoke all on table public.raffle_prize_transitions from public;
  end if;
end
$despues$;

commit;
