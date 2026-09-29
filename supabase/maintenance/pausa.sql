-- =============================================================================
-- PAUSA DE PUBLICACIÓN — instalar (D-239, RUNBOOK §10)
--
-- NO es una migración: vive fuera de `supabase/migrations/` para que la CLI no la
-- aplique nunca sola, y se retira al terminar la ventana (`pausa_retirar.sql`).
-- La instala y la maneja `scripts/maintenance-pause.ts`; este archivo es su
-- única definición y también se puede ejecutar con `psql -v ON_ERROR_STOP=1`.
--
-- SE INSTALA ABIERTA: no rechaza nada hasta que alguien la cierra.
--
-- CÓMO FUNCIONA. PostgREST llama a `pausa.comprobar_peticion()` al empezar CADA
-- petición de la API de datos —de `anon`, de `authenticated` y de `service_role`,
-- lecturas, escrituras y RPC— dentro de su transacción y antes de tocar ninguna
-- tabla (`pgrst.db_pre_request`, el mecanismo que documenta Supabase en «Securing
-- your API»). Con la pausa cerrada la petición se rechaza con HTTP 423 y el código
-- `RIFAS_PAUSA`. No hay otra puerta a los datos: el navegador no habla con la base
-- y el servidor no usa `pg` (D-239). Lo que NO pasa por aquí —las conexiones
-- directas de quien opera, `pg_cron` y Supabase Auth— lo explica el RUNBOOK.
--
-- 423 Y NO 503. `postgrest-js` reintenta un GET que recibe 503 tres veces,
-- esperando lo que diga `Retry-After` o 1, 2 y 4 s: cada pantalla tardaría 7 s en
-- enterarse. Un 423 no se reintenta, y el cuerpo dice qué pasa.
--
-- EL DRENAJE. Mientras está instalada, cada petición toma primero un cerrojo
-- consultivo COMPARTIDO de su transacción. Quien opera, al cerrar, pide el mismo
-- cerrojo en EXCLUSIVA: se lo dan cuando termina la última petición que ya estaba
-- dentro, y mientras espera nadie nuevo entra —un `try` compartido no pasa delante
-- de un exclusivo en cola—. Así se sabe que no queda ninguna petición en curso.
--
-- LOS PERMITIDOS. Cerrada, solo pasan las peticiones de los perfiles de
-- `permitidos` —el Dueño que comprueba la publicación— y nunca mientras alguien
-- tiene el cerrojo en exclusiva. `service_role` no tiene perfil: no pasa nunca.
--
-- No toca `public` ni ningún dato: un esquema propio, una fila y una función.
-- =============================================================================

begin;

-- Si PostgREST ya tiene OTRO gancho, no se pisa: se detiene sin cambiar nada.
do $pausa$
begin
  if exists (
    select 1
      from pg_db_role_setting s
      cross join lateral unnest(s.setconfig) as c(valor)
     where s.setrole = 'authenticator'::regrole
       and c.valor like 'pgrst.db_pre_request=%'
       and c.valor <> 'pgrst.db_pre_request=pausa.comprobar_peticion'
  ) then
    raise exception 'authenticator ya tiene otro pgrst.db_pre_request: la pausa no lo pisa. No se instaló nada.';
  end if;
end
$pausa$;

create schema if not exists pausa;
comment on schema pausa is
  'Pausa de publicación (D-239): se instala para una ventana y se retira al terminarla. Ver supabase/maintenance/pausa.sql.';

revoke all on schema pausa from public;
grant usage on schema pausa to anon, authenticated, service_role;

-- SIN clave primaria, a propósito. El respaldo de la ventana (`RUNBOOK` §5.1) se toma
-- con la pausa instalada y su volcado de esquema —que va sin restringir, por
-- `pg_trgm`— la incluye. Todo lo de este archivo sale en él de forma que se puede
-- repetir sobre una pausa que ya existe (`if not exists`, `or replace`, `grant`)
-- salvo una clave primaria, que sale como `alter table … add constraint` y cortaba
-- la restauración con `ON_ERROR_STOP` (medido en el ensayo de D-239). La fila única
-- la garantizan el `check` y la inserción condicional.
create table if not exists pausa.estado (
  id          smallint not null default 1 check (id = 1),
  cerrada     boolean not null default false,
  -- Perfiles que pueden usar la aplicación con la pausa cerrada.
  permitidos  uuid[] not null default '{}',
  motivo      text,
  cambiada_en timestamptz not null default now()
);

comment on table pausa.estado is
  'Una sola fila: si la pausa está cerrada y quién puede pasar. La escribe solo quien opera, por conexión directa.';

-- Nadie de la API la lee ni la escribe: la función es SECURITY DEFINER.
revoke all on table pausa.estado from public, anon, authenticated, service_role;

insert into pausa.estado (id) select 1 where not exists (select 1 from pausa.estado);

create or replace function pausa.comprobar_peticion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cerrada    boolean;
  v_permitidos uuid[];
  v_claims     text := nullif(pg_catalog.current_setting('request.jwt.claims', true), '');
  v_sub        text;
  v_uid        uuid;
begin
  -- 1. La barrera del drenaje: si quien opera tiene el cerrojo en exclusiva, o lo
  --    está esperando, esta petición no entra.
  if pg_catalog.pg_try_advisory_xact_lock_shared(8675320, 1) then
    select e.cerrada, e.permitidos
      into v_cerrada, v_permitidos
      from pausa.estado e
     where e.id = 1;

    -- 2. Abierta: pasa, y la respuesta lo dice (así se comprueba que PostgREST
    --    recargó el gancho antes de cerrar nada).
    if not coalesce(v_cerrada, false) then
      perform pg_catalog.set_config('response.headers', '[{"X-Rifas-Pausa": "abierta"}]', true);
      return;
    end if;

    -- 3. Cerrada: solo un perfil permitido, con su sesión.
    v_sub := case when v_claims is not null then v_claims::json ->> 'sub' end;
    if v_sub ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      v_uid := v_sub::uuid;
    end if;
    if v_uid is not null and v_uid = any (v_permitidos) then
      perform pg_catalog.set_config('response.headers', '[{"X-Rifas-Pausa": "permitida"}]', true);
      return;
    end if;
  end if;

  raise sqlstate 'PGRST' using
    message = pg_catalog.json_build_object(
      'code', 'RIFAS_PAUSA',
      'message', 'Estamos actualizando Rifas. Vuelve a intentarlo en unos minutos.',
      'details', null,
      'hint', null
    )::text,
    detail = pg_catalog.json_build_object(
      'status', 423,
      'headers', pg_catalog.json_build_object('X-Rifas-Pausa', 'cerrada')
    )::text;
end;
$$;

comment on function pausa.comprobar_peticion() is
  'Gancho db_pre_request de PostgREST durante una ventana de publicación (D-239): con la pausa cerrada rechaza toda petición con 423 RIFAS_PAUSA salvo la de un perfil permitido, y toma el cerrojo compartido del drenaje.';

revoke all on function pausa.comprobar_peticion() from public;
grant execute on function pausa.comprobar_peticion() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'pausa.comprobar_peticion';
-- Se entrega al confirmar: PostgREST recarga su configuración cuando la función ya existe.
notify pgrst, 'reload config';

commit;
