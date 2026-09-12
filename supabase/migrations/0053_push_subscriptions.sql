-- =============================================================================
-- 0053_push_subscriptions.sql
-- Suscripciones Web Push, una por dispositivo — ETAPA 4
--
-- Referencia: docs/BUSINESS_RULES.md BR-V04, BR-V05, BR-V06,
--             docs/DECISIONS.md D-187 y D-190, docs/DATA_MODEL.md 4.18,
--             docs/SECURITY.md 4.16.
--
-- QUE ES
--
-- Donde se guarda «este telefono quiere recibir avisos». Nada mas. La 0052 dejo
-- el motor escribiendo la campana, que es la fuente durable (BR-V01); esto es la
-- mitad del canal EXTRA que va encima, y solo la mitad que vive en el navegador:
-- pedir permiso, suscribirse y guardar la suscripcion.
--
-- LO QUE ESTA MIGRACION NO HACE, Y ES DELIBERADO
--
-- NO ENVIA NI UN PUSH. No hay outbox, ni dispatcher, ni firma VAPID, ni cifrado
-- `aes128gcm`: eso es la Etapa 5 entera y necesita su autorizacion. Una fila de
-- esta tabla hoy no produce ninguna notificacion en ningun telefono.
--
-- Tampoco toca la campana, ni las ocurrencias, ni el cron, ni `pg_net`.
--
-- POR QUE LA SUSCRIPCION ES DE UNA PERSONA Y NO DE UNA ORGANIZACION
--
-- Es la unica tabla del encargo que NO lleva `organization_id`, y es a proposito
-- (D-190). Una suscripcion dice «este navegador, de esta persona, acepta
-- avisos»: no es un dato de negocio de ninguna organizacion, es transporte. El
-- despachador de la Etapa 5 llegara a ella desde `notifications`, que ya sabe a
-- quien va dirigido cada aviso; anadir aqui una organizacion obligaria a elegir
-- una para alguien que pertenezca a dos, y esa eleccion no significaria nada.
--
-- EL ENDPOINT ES UNICO EN TODA LA TABLA, Y ESO RESUELVE UN CASO REAL
--
-- Dos vendedores compartiendo un telefono no es raro aqui, es lo normal. El
-- navegador entrega SIEMPRE el mismo `endpoint` para el mismo dispositivo, asi
-- que cuando la segunda persona activa los avisos, la fila no se duplica: cambia
-- de dueno. La anterior deja de recibir en ese telefono, que es exactamente lo
-- que tiene que pasar.
--
-- LA MIGRACION ES ADITIVA. No toca ninguna tabla, politica, funcion, enum ni
-- restriccion existente.
-- =============================================================================

-- =============================================================================
-- 1. push_subscriptions (BR-V06)
--
-- `endpoint`, `p256dh` y `auth` son lo que el navegador entrega al suscribirse y
-- lo unico que hace falta para cifrarle un mensaje (RFC 8291). SON SENSIBLES:
-- quien los tenga puede mandar notificaciones a ese dispositivo si ademas firma
-- con la clave VAPID a la que la suscripcion esta atada. No salen nunca de la
-- base hacia otra persona, no se escriben en la bitacora y no se muestran en
-- ninguna pantalla.
-- =============================================================================
create table push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  -- De una PERSONA, no de una organizacion ni de un vendedor: la campana la
  -- tiene todo el mundo (D-190).
  profile_id      uuid not null references profiles (id) on delete restrict,

  -- La direccion del servicio de push del navegador. La da el, es opaca y NO se
  -- interpola en ninguna parte: se guarda y se usa tal cual para un POST.
  endpoint        text not null,
  -- Clave publica del dispositivo (P-256) y secreto de autenticacion, en
  -- base64url tal como los entrega `PushSubscription.toJSON()`.
  p256dh          text not null,
  auth            text not null,

  -- Para reconocer un dispositivo en un listado. Es informativo y puede faltar.
  user_agent      text,

  -- Diagnostico del canal, que llenara el despachador de la Etapa 5.
  success_count   integer not null default 0,
  failure_count   integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,

  -- Un 404 o un 410 del servicio de push significa que esta suscripcion murio
  -- (BR-V07). Se marca y NO se reintenta. La fila se conserva: es la diferencia
  -- entre «este dispositivo dijo que no» y «nunca dijo nada».
  revoked_at      timestamptz,
  revoked_reason  text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Un endpoint de Web Push es siempre https y siempre largo. No se acota a un
  -- dominio: la direccion la elige el navegador —Mozilla, Google, Microsoft— y
  -- una lista blanca de dominios envejeceria sola.
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%'),
  constraint push_subscriptions_endpoint_length check (
    length(endpoint) between 30 and 2048
  ),
  -- Las claves del RFC 8291 tienen tamano conocido: 65 bytes la publica y 16 el
  -- secreto, que en base64url son 87 y 22 caracteres. Se deja holgura por si
  -- algun navegador anade relleno, pero no se acepta cualquier cosa.
  constraint push_subscriptions_p256dh_shape check (
    p256dh ~ '^[A-Za-z0-9_-]{80,120}$'
  ),
  constraint push_subscriptions_auth_shape check (
    auth ~ '^[A-Za-z0-9_-]{16,40}$'
  ),
  constraint push_subscriptions_revoked_coherent check (
    (revoked_at is null) = (revoked_reason is null)
  )
);

comment on table push_subscriptions is
  'BR-V06: un navegador que acepta avisos. De una PERSONA, no de una organizacion (D-190). Transporte, no dato de negocio.';
comment on column push_subscriptions.endpoint is
  'Direccion opaca del servicio de push. UNICA en toda la tabla: el mismo dispositivo no puede estar en dos filas.';
comment on column push_subscriptions.auth is
  'Secreto de autenticacion del RFC 8291. SENSIBLE: no sale de la base ni se escribe en la bitacora.';
comment on column push_subscriptions.revoked_at is
  'BR-V07: el servicio de push respondio 404 o 410. No se reintenta y la fila se conserva.';

-- LA pieza de «un dispositivo, una fila». Global, no por persona: es lo que hace
-- que activar los avisos en un telefono compartido cambie el dueno en vez de
-- duplicar la suscripcion.
create unique index push_subscriptions_endpoint_key
  on push_subscriptions (endpoint);

comment on index push_subscriptions_endpoint_key is
  'Un dispositivo, una fila. Activar en un telefono compartido reasigna, no duplica (D-190).';

-- La consulta del despachador de la Etapa 5: las vivas de una persona.
create index push_subscriptions_profile_idx
  on push_subscriptions (profile_id)
  where revoked_at is null;

create trigger push_subscriptions_set_updated_at
  before update on push_subscriptions
  for each row execute function set_updated_at();

-- =============================================================================
-- 2. RLS: cada quien ve SOLO sus dispositivos
--
-- Mismo patron que las tres tablas del encargo: una politica, y es de SELECT.
-- `authenticated` no recibe INSERT, UPDATE ni DELETE, asi que las dos RPC de
-- abajo son la unica puerta.
--
-- Ni el personal ni nadie mas ve los dispositivos de otra persona. No es una
-- decision de producto sino de higiene: la lista de dispositivos de alguien, con
-- su `user_agent`, dice donde y con que se conecta.
-- =============================================================================
alter table push_subscriptions enable row level security;
alter table push_subscriptions force  row level security;

create policy push_subscriptions_select on push_subscriptions
  for select to authenticated
  using (profile_id = (select current_profile_id()));

grant select on push_subscriptions to authenticated;
grant all    on push_subscriptions to service_role;

-- =============================================================================
-- 3. upsert_push_subscription — «este dispositivo quiere avisos» (BR-V06)
--
-- NO RECIBE IDENTIFICADOR DE PERSONA: sale de `auth.uid()`, igual que las nueve
-- RPC del encargo. Lo que la hace segura no es una comprobacion, es la firma.
--
-- REASIGNA EN VEZ DE DUPLICAR. Si el endpoint ya existe —el mismo telefono, otra
-- persona— la fila cambia de dueno y se limpia su historial: los contadores y la
-- revocacion describian a la suscripcion anterior y aplicarlos a la nueva seria
-- mentir sobre un dispositivo que acaba de empezar.
-- =============================================================================
create function upsert_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns push_subscriptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_auth();
  v_org uuid;
  v_row push_subscriptions;
begin
  -- Cualquier rol ACTIVO, no solo un vendedor: la campana la tiene todo el
  -- mundo. `current_org_ids()` ya comprueba de una vez que la membresia, el
  -- perfil y la organizacion siguen activos (BR-A04).
  select org into v_org from current_org_ids() as org limit 1;
  if v_org is null then
    raise exception 'Tu cuenta no está activa en ninguna organización.'
      using errcode = 'insufficient_privilege';
  end if;

  -- El `user_agent` se acota aqui y no con un CHECK: llega del navegador, es
  -- informativo y no vale la pena rechazar una suscripcion buena porque alguien
  -- tenga una cadena larguisima.
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth), left(p_user_agent, 400))
  on conflict (endpoint) do update
     set profile_id      = excluded.profile_id,
         p256dh          = excluded.p256dh,
         auth            = excluded.auth,
         user_agent      = excluded.user_agent,
         success_count   = 0,
         failure_count   = 0,
         last_success_at = null,
         last_failure_at = null,
         revoked_at      = null,
         revoked_reason  = null
  returning * into v_row;

  -- La bitacora anota QUE se activo y en que fila, nunca el endpoint ni las
  -- claves: `audit_logs` la lee el personal entero (BR-D04).
  perform write_audit_log(
    v_org, 'push_subscription.enable', 'push_subscription', v_row.id,
    null, null
  );

  return v_row;
end;
$$;

comment on function upsert_push_subscription(text, text, text, text) is
  'BR-V06: registra o reasigna la suscripcion de ESTE dispositivo para quien llama. No recibe identificador de persona.';

-- =============================================================================
-- 4. delete_push_subscription — «este dispositivo ya no» (BR-V06)
--
-- AQUI SI SE BORRA, y es una de las dos unicas excepciones a D-038 que el
-- contrato acepta (`SECURITY` §4.15): una suscripcion es transporte, no
-- historial. Quien apaga los avisos en su telefono espera que no quede nada
-- esperando a reactivarse solo.
--
-- El borrado ocurre DENTRO de esta funcion: `authenticated` no tiene privilegio
-- de `DELETE` sobre la tabla y no existe ninguna politica de `DELETE`, igual que
-- en `bulk_delete_tickets` (BR-B05).
--
-- Borra por ENDPOINT y solo si es suyo. Un endpoint ajeno no encuentra nada y se
-- responde lo mismo que si no existiera: quien pruebe direcciones no aprende
-- cuales estan registradas.
-- =============================================================================
create function delete_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_auth();
  v_org uuid;
  v_id  uuid;
begin
  select org into v_org from current_org_ids() as org limit 1;
  if v_org is null then
    raise exception 'Tu cuenta no está activa en ninguna organización.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from push_subscriptions s
   where s.endpoint = btrim(p_endpoint)
     and s.profile_id = v_uid
  returning s.id into v_id;

  if v_id is null then
    return false;
  end if;

  perform write_audit_log(
    v_org, 'push_subscription.disable', 'push_subscription', v_id,
    null, null
  );

  return true;
end;
$$;

comment on function delete_push_subscription(text) is
  'BR-V06: quita la suscripcion de ESTE dispositivo. Devuelve false si no habia ninguna suya con ese endpoint.';

-- =============================================================================
-- 5. Privilegios (I-078, I-020)
-- =============================================================================
revoke execute on function upsert_push_subscription(text, text, text, text) from public, anon;
revoke execute on function delete_push_subscription(text)                    from public, anon;

grant execute on function upsert_push_subscription(text, text, text, text) to authenticated, service_role;
grant execute on function delete_push_subscription(text)                    to authenticated, service_role;

-- =============================================================================
-- 6. Nota de reversion (manual, no ejecutable) — DB-15
--
-- No se ejecuta aqui. Queda escrita para que revertir sea leer, no recordar.
--
--   drop function if exists delete_push_subscription(text);
--   drop function if exists upsert_push_subscription(text, text, text, text);
--   drop table if exists push_subscriptions;
--
-- Revertir borra las suscripciones, que son TRANSPORTE: no se pierde ningun
-- dato de negocio y ningun aviso de la campana se ve afectado (BR-V01). Lo que
-- ocurre es que cada dispositivo tendria que volver a activarse, porque el
-- navegador conserva su suscripcion pero la base ya no la conoce. La pantalla lo
-- detecta sola: compara lo que dice el navegador con lo que devuelve la base.
-- =============================================================================
