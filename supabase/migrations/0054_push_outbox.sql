-- =============================================================================
-- 0054_push_outbox.sql
-- La cola de avisos y su despachador — ETAPA 5
--
-- Referencia: docs/BUSINESS_RULES.md BR-V02, BR-V03, BR-V07, BR-V08,
--             docs/DECISIONS.md D-187 y D-191, docs/DATA_MODEL.md 4.19,
--             docs/SECURITY.md 4.17.
--
-- QUE ES
--
-- La mitad que faltaba. La 0052 dejo el motor escribiendo la campana; la 0053,
-- los dispositivos registrados. Esto es lo que hace que un aviso SALGA del
-- servidor y llegue a un telefono con la aplicacion cerrada.
--
-- LA OUTBOX NO ES UNA OPTIMIZACION: ES LO QUE PROTEGE EL AVISO INTERNO
--
-- La ocurrencia, la campana y la fila de esta cola se escriben en UNA
-- transaccion. El envio ocurre DESPUES, en otro proceso. Consecuencia exacta y
-- buscada (BR-V02): un servicio de push caido, un endpoint muerto, un tiempo de
-- espera agotado o un despachador que no arranca **no pueden perder el aviso
-- interno**, porque no participan en escribirlo. La campana es la fuente
-- durable (BR-V01) y esto es un canal extra que va encima.
--
-- LO QUE ESTA MIGRACION NO TRAE
--
-- El cifrado y la firma no estan aqui, y no es un olvido: viven en TypeScript
-- (`src/features/push/webpush.ts`), sobre el `crypto` de Node y sin ninguna
-- dependencia (BR-V03, D-187). Aqui solo esta la cola, su maquina de estados y
-- el toque que despierta al despachador.
--
-- Y EL TEXTO TAMPOCO. `payload` guarda **solo** de que tipo es el aviso; el
-- titulo y el cuerpo los compone la aplicacion al enviarlo (I-030, D-093). Asi
-- no hay ni una frase que mejorar con una migracion, y —mas importante— **no
-- hay nada personal que se pueda escapar por aqui** (BR-V05).
--
-- LA MIGRACION TOCA UNA FUNCION EXISTENTE: `process_due_payment_reminders`, que
-- pasa a encolar ademas de avisar. Todo lo demas es aditivo.
-- =============================================================================

-- =============================================================================
-- 1. push_outbox_status (BR-V02, BR-V07)
--
-- `queued`  — esperando su turno, o esperando el proximo reintento.
-- `sending` — un despachador la tomo. Si se muere con ella en la mano, vuelve a
--             `queued` sola (seccion 4).
-- `sent`    — al menos un dispositivo la acepto.
-- `failed`  — no se reintenta mas, y `last_error` dice por que.
-- =============================================================================
create type push_outbox_status as enum ('queued', 'sending', 'sent', 'failed');

comment on type push_outbox_status is
  'BR-V02: estado de un aviso en la cola de salida. La campana no depende de esto (BR-V01).';

-- =============================================================================
-- 2. push_outbox (BR-V02)
--
-- UNA FILA POR AVISO, no por dispositivo. La fila apunta a `notifications`, que
-- ya sabe a quien va dirigido; el despachador abre el abanico a los
-- dispositivos vivos de esa persona en el momento de enviar, que es lo correcto:
-- entre encolar y enviar alguien pudo registrar un telefono nuevo o quitar otro.
--
-- **La fuente durable es la fila de `notifications`, no esta.** Si esta se
-- borrara entera, no se perderia ningun aviso: se perderia el intento de
-- sacarlo del navegador.
-- =============================================================================
create table push_outbox (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications (id) on delete restrict,

  -- SOLO el tipo de aviso. Ni titulo, ni cuerpo, ni nada de quien lo recibe: el
  -- texto se compone al enviar (BR-V05, I-030).
  payload         jsonb not null,

  status          push_outbox_status not null default 'queued',
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at      timestamptz,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint push_outbox_attempts_range check (attempts between 0 and 20),
  -- Enviada es exactamente «tiene fecha de envio».
  constraint push_outbox_sent_coherent check ((status = 'sent') = (sent_at is not null)),
  -- El payload es un objeto con su tipo dentro, nunca un texto suelto.
  constraint push_outbox_payload_shape check (
    jsonb_typeof(payload) = 'object' and payload ? 'kind'
  )
);

comment on table push_outbox is
  'BR-V02: cola de salida de los avisos. Desacopla el envio de la escritura del aviso interno, que es la fuente durable (BR-V01).';
comment on column push_outbox.payload is
  'Solo el TIPO de aviso. El titulo y el cuerpo los compone la aplicacion al enviar (BR-V05, I-030).';
comment on column push_outbox.claimed_at is
  'Cuando un despachador la tomo. Sirve para recuperarla si ese proceso se murio con ella.';

-- La UNICA consulta del despachador.
create index push_outbox_pending_idx
  on push_outbox (next_attempt_at)
  where status = 'queued';

-- Para recuperar las que se quedaron en la mano de un proceso que se murio.
create index push_outbox_claimed_idx
  on push_outbox (claimed_at)
  where status = 'sending';

create trigger push_outbox_set_updated_at
  before update on push_outbox
  for each row execute function set_updated_at();

-- =============================================================================
-- 3. RLS: esta tabla NO la lee nadie con sesion
--
-- Es la primera tabla del producto que `authenticated` no puede leer **en
-- absoluto**, y es deliberado: es infraestructura de transporte. Quien quiera
-- saber si tiene un aviso mira la campana, que para eso es la fuente durable.
--
-- Sin privilegios no hace falta politica, pero la RLS se activa igual: la
-- invariante del proyecto es «ninguna tabla sin RLS», y una excepcion aqui
-- obligaria a explicarla cada vez que alguien lea el catalogo.
-- =============================================================================
alter table push_outbox enable row level security;
alter table push_outbox force  row level security;

comment on table push_outbox is
  'BR-V02: cola de salida de los avisos. SIN privilegios para authenticated: es transporte, no algo que se consulte desde una pantalla.';

/*
 * EL REVOKE NO SOBRA, Y ESTO COSTO UNA PRUEBA EN ROJO PARA VERLO.
 *
 * En el esquema `public` hay un privilegio POR DEFECTO que concede `SELECT` a
 * `authenticated` sobre CADA tabla nueva:
 *
 *   postgres=arwdDxtm/postgres, authenticated=r/postgres, service_role=...
 *
 * Es decir: una tabla creada sin decir nada nace legible por cualquiera con
 * sesion. Aqui no se filtro ningun dato —la RLS esta activada y esta tabla no
 * tiene NINGUNA politica, asi que devuelve cero filas—, pero «sin privilegios»
 * tiene que estar escrito, no supuesto. Es exactamente la familia de I-020 e
 * I-078: lo que Supabase concede solo, y de forma distinta en cada entorno.
 */
revoke all on push_outbox from authenticated, anon;

grant all on push_outbox to service_role;

-- =============================================================================
-- 4. Los topes del reintento (BR-V07)
--
-- En un solo sitio, como `max_active_payment_reminders` y `payment_reminder_grace`.
-- =============================================================================
create function push_max_attempts()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select 5
$$;

comment on function push_max_attempts() is
  'BR-V07: intentos antes de dar un aviso por perdido. La campana sigue estando igual.';

/*
 * El retroceso: 1, 5, 25 minutos y despues el tope de 2 horas.
 *
 * Crece rapido a proposito. Un recordatorio de las 7:00 p. m. que no sale en la
 * primera media hora ya llega tarde, asi que insistir cada minuto solo castiga a
 * un servicio que dijo que no.
 */
create function push_retry_delay(p_attempts integer)
returns interval
language sql
immutable
set search_path = public, pg_temp
as $$
  select least(
    interval '1 minute' * power(5, greatest(coalesce(p_attempts, 1), 1) - 1),
    interval '2 hours'
  )
$$;

comment on function push_retry_delay(integer) is
  'BR-V07: retroceso entre intentos. 1, 5 y 25 minutos, con tope de 2 horas.';

-- Cuanto puede tener un despachador una fila en la mano antes de darla por
-- abandonada. Holgado respecto al tiempo de espera del envio (10 s por
-- dispositivo), para no recuperar una fila que todavia se esta enviando.
create function push_claim_timeout()
returns interval
language sql
immutable
set search_path = public, pg_temp
as $$
  select interval '5 minutes'
$$;

-- =============================================================================
-- 5. claim_push_outbox — el despachador toma un lote (BR-V02, BR-V08)
--
-- DEVUELVE UNA FILA POR (AVISO, DISPOSITIVO), y tambien **los avisos sin ningun
-- dispositivo vivo**, con las columnas del dispositivo en NULL. Sin eso, una
-- fila cuyo dueno quito todos sus telefonos entre encolar y enviar se quedaria
-- en `sending` para siempre, porque el despachador no llegaria a verla.
--
-- ANTES DE TOMAR NADA, RECUPERA LAS ABANDONADAS: un despachador que se murio con
-- filas en la mano las dejo en `sending`. Se devuelven a `queued` pasado el
-- plazo. Es la unica forma de que la cola se cure sola sin un proceso aparte.
--
-- `for update skip locked`: dos despachadores simultaneos trabajan sobre
-- conjuntos disjuntos en vez de bloquearse.
-- =============================================================================
create function claim_push_outbox(p_limit integer default 50)
returns table (
  outbox_id       uuid,
  attempts        integer,
  payload         jsonb,
  notification_id uuid,
  subscription_id uuid,
  endpoint        text,
  p256dh          text,
  auth            text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update push_outbox o
     set status = 'queued',
         last_error = 'Un despachador la dejó a medias.'
   where o.status = 'sending'
     and o.claimed_at < now() - push_claim_timeout();

  return query
  with tomadas as (
    select o.id
      from push_outbox o
     where o.status = 'queued'
       and o.next_attempt_at <= now()
     order by o.next_attempt_at
     limit greatest(coalesce(p_limit, 50), 1)
     for update skip locked
  ),
  marcadas as (
    update push_outbox o
       set status = 'sending',
           attempts = o.attempts + 1,
           claimed_at = now()
      from tomadas t
     where o.id = t.id
    returning o.id, o.attempts, o.payload, o.notification_id
  )
  select m.id, m.attempts, m.payload, m.notification_id,
         s.id, s.endpoint, s.p256dh, s.auth
    from marcadas m
    join notifications n on n.id = m.notification_id
    left join push_subscriptions s
      on s.profile_id = n.recipient_profile_id
     and s.revoked_at is null
   order by m.id;
end;
$$;

comment on function claim_push_outbox(integer) is
  'BR-V02: toma un lote con skip locked y devuelve una fila por (aviso, dispositivo). Recupera antes las abandonadas.';

-- =============================================================================
-- 6. Cerrar una fila (BR-V07)
-- =============================================================================
create function mark_push_outbox_sent(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update push_outbox
     set status = 'sent',
         sent_at = now(),
         last_error = null,
         claimed_at = null
   where id = p_id
$$;

comment on function mark_push_outbox_sent(uuid) is
  'Al menos un dispositivo acepto el aviso.';

/*
 * Un fallo. Si se puede reintentar y quedan intentos, vuelve a la cola con su
 * retroceso; si no, se da por perdida con el motivo escrito.
 *
 * PERDER UNA FILA DE AQUI NO PIERDE NINGUN AVISO: la campana ya esta escrita
 * (BR-V01). Por eso esta funcion no avisa a nadie ni escribe en la bitacora: lo
 * que cuenta es que la persona lo ve al entrar.
 */
create function mark_push_outbox_failed(
  p_id        uuid,
  p_reason    text,
  p_retryable boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
begin
  select attempts into v_attempts from push_outbox where id = p_id;
  if v_attempts is null then
    return;
  end if;

  if p_retryable and v_attempts < push_max_attempts() then
    update push_outbox
       set status = 'queued',
           next_attempt_at = now() + push_retry_delay(v_attempts),
           last_error = left(p_reason, 500),
           claimed_at = null
     where id = p_id;
  else
    update push_outbox
       set status = 'failed',
           last_error = left(p_reason, 500),
           claimed_at = null
     where id = p_id;
  end if;
end;
$$;

comment on function mark_push_outbox_failed(uuid, text, boolean) is
  'BR-V07: reintenta con retroceso mientras queden intentos; si no, la da por perdida con su motivo.';

-- =============================================================================
-- 7. revoke_push_subscription — un 404 o un 410 (BR-V07)
--
-- La suscripcion murio: el navegador se desinstalo, se limpiaron los datos del
-- sitio o caduco. **No se reintenta y no se borra la fila**: se marca. La
-- diferencia importa —una fila revocada dice «este dispositivo dijo que no»; que
-- no exista diria «nunca dijo nada»— y ademas es lo que hace que la pantalla
-- pueda ofrecer activarlos otra vez.
-- =============================================================================
create function revoke_push_subscription(p_endpoint text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  update push_subscriptions
     set revoked_at = now(),
         revoked_reason = left(coalesce(p_reason, 'El servicio de push la rechazó.'), 200),
         failure_count = failure_count + 1,
         last_failure_at = now()
   where endpoint = btrim(p_endpoint)
     and revoked_at is null
  returning id into v_id;

  return v_id is not null;
end;
$$;

comment on function revoke_push_subscription(text, text) is
  'BR-V07: un 404 o un 410 matan la suscripcion. Se marca, no se borra: la fila es la evidencia.';

-- Contadores de exito, para diagnostico. No son criticos y por eso no forman
-- parte de ninguna transaccion importante.
create function mark_push_subscription_sent(p_endpoint text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update push_subscriptions
     set success_count = success_count + 1,
         last_success_at = now()
   where endpoint = btrim(p_endpoint)
$$;

-- =============================================================================
-- 8. El motor pasa a ENCOLAR ademas de avisar (BR-V02)
--
-- Es el unico cambio no aditivo de esta migracion, y es una linea: despues de
-- escribir la campana, si esa persona tiene algun dispositivo vivo, se encola.
-- En la MISMA transaccion, que es el punto entero de BR-V02.
--
-- SI NO TIENE NINGUN DISPOSITIVO, NO SE ENCOLA NADA. Una fila que nace sin a
-- quien enviarse solo serviria para nacer fallada. La campana ya esta escrita y
-- es lo que importa.
--
-- El resto de la funcion es IDENTICO al de la 0052. Se reescribe entera porque
-- `create or replace` no admite parches, y se marcan los dos anadidos.
-- =============================================================================
create or replace function process_due_payment_reminders(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now             timestamptz := now();
  v_grace           interval    := payment_reminder_grace();
  v_created         integer     := 0;
  r                 record;
  v_can_operate     boolean;
  v_status          reminder_occurrence_status;
  v_occurrence_id   uuid;
  v_notification_id uuid;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 200;
  end if;

  for r in
    select rem.id, rem.organization_id, rem.seller_id,
           rem.weekday, rem.time_of_day, rem.next_run_at
      from seller_payment_reminders rem
     where rem.status = 'active'
       and rem.next_run_at <= v_now
     order by rem.next_run_at
     limit p_limit
     for update skip locked
  loop
    -- BR-S13: se comprueba AL PROCESAR, no solo al configurar. Un recordatorio
    -- guardado hace tres meses no puede seguir escribiendole a alguien a quien
    -- ya se le quito el acceso. Es BR-A04 aplicado tal cual.
    --
    -- No se usa `has_org_role`, que pregunta por `auth.uid()`: aqui no hay
    -- sesion, quien llama es el cron.
    select exists (
      select 1
        from memberships m
        join profiles p      on p.id = m.profile_id
        join organizations o on o.id = m.organization_id
       where m.profile_id = r.seller_id
         and m.organization_id = r.organization_id
         and m.role = 'seller'
         and m.is_active and p.is_active and o.is_active
    ) into v_can_operate;

    if v_can_operate then
      v_status := case
        when v_now - r.next_run_at <= v_grace then 'pending'
        else 'missed'
      end;

      insert into payment_reminder_occurrences (
        organization_id, seller_id, reminder_id, scheduled_for, processed_at, status
      )
      values (r.organization_id, r.seller_id, r.id, r.next_run_at, v_now, v_status)
      on conflict (reminder_id, scheduled_for) do nothing
      returning id into v_occurrence_id;

      -- Sin fila nueva: ya estaba materializada. No se avisa otra vez, pero el
      -- reloj SI se adelanta —si no, el motor volveria a mirarla cada minuto—.
      if v_occurrence_id is not null then
        v_created := v_created + 1;

        if v_status = 'pending' then
          -- La campana es la fuente DURABLE (BR-V01). Se escribe aqui, en la
          -- misma transaccion que la ocurrencia, y no depende de ninguna red:
          -- sin permiso de notificaciones, sin navegador compatible o con el
          -- envio caido, el aviso sigue existiendo y se ve al entrar.
          --
          -- `data` NO nombra a ningun cliente, ni dice ningun saldo, ni ningun
          -- importe (BR-S09): lleva cuando tocaba y cual de sus recordatorios
          -- es, que es lo que la frase necesita.
          insert into notifications (
            organization_id, recipient_profile_id, actor_profile_id,
            kind, entity_type, entity_id, data
          )
          values (
            r.organization_id,
            r.seller_id,
            null,  -- no lo provoco una persona: lo provoco el reloj
            'payment_reminder.due',
            'payment_reminder_occurrence',
            v_occurrence_id,
            jsonb_build_object(
              'reminder_id',   r.id,
              'weekday',       r.weekday,
              'time_of_day',   to_char(r.time_of_day, 'HH24:MI'),
              'scheduled_for', r.next_run_at
            )
          )
          returning id into v_notification_id;

          update payment_reminder_occurrences o
             set notification_id = v_notification_id
           where o.id = v_occurrence_id;

          -- ===== AÑADIDO EN LA 0054 (BR-V02) ==============================
          -- La cola, en la MISMA transaccion que la campana. Solo si hay a
          -- quien enviarselo: sin dispositivos, la fila solo serviria para
          -- nacer fallada.
          if exists (
            select 1 from push_subscriptions s
             where s.profile_id = r.seller_id
               and s.revoked_at is null
          ) then
            insert into push_outbox (notification_id, payload)
            values (v_notification_id, jsonb_build_object('kind', 'payment_reminder.due'));
          end if;
          -- ================================================================
        end if;
      end if;
    end if;

    -- El reloj avanza SIEMPRE, incluso cuando el vendedor ya no puede operar:
    -- si no, esas filas volverian a salir en la consulta cada minuto para nada.
    -- Al reactivarse la cuenta, el recordatorio retoma su horario de siempre
    -- sin arrastrar meses de vencimientos.
    --
    -- `next_run_at` se calcula desde AHORA, no sumando una semana: es lo que
    -- impide disparar las semanas perdidas (BR-S11).
    --
    -- Este UPDATE no despierta a `reminders_sync_next_run`, que solo recalcula
    -- si cambia el dia, la hora o se reactiva (0051, seccion 5.a). Si algun dia
    -- alguien lo cambiara para que recalcule siempre, este avance se pisaria y
    -- el recordatorio quedaria disparando en bucle. Hay pruebas que lo defienden.
    update seller_payment_reminders rem
       set next_run_at = next_reminder_run_at(rem.weekday, rem.time_of_day, v_now),
           last_run_at = v_now
     where rem.id = r.id;
  end loop;

  return v_created;
end;
$$;

comment on function process_due_payment_reminders(integer) is
  'BR-S10..BR-S13 y BR-V02: materializa, avisa por la campana, ENCOLA el push y adelanta el reloj. Todo en una transaccion.';

-- =============================================================================
-- 9. El toque que despierta al despachador (D-187, decision 3)
--
-- `pg_net` hace un POST al Route Handler. **Es un TOQUE, no una entrega**: si
-- falla, no pasa nada — la cola sigue ahi y el minuto siguiente vuelve a
-- intentarlo. La outbox es la que manda, no el toque.
--
-- LA URL Y EL SECRETO VIVEN EN EL VAULT DE SUPABASE, no en esta migracion ni en
-- una tabla en claro. Una migracion es un archivo versionado: escribir ahi un
-- secreto seria publicarlo. Y **sin los dos configurados esto no hace nada**,
-- igual que sin clave VAPID no se ofrecen avisos (D-190): el canal entero es
-- opcional hasta que alguien lo enciende a proposito.
--
-- Se configuran una vez, por entorno:
--
--   select vault.create_secret('https://<dominio>/api/push/dispatch', 'push_dispatch_url');
--   select vault.create_secret('<el secreto del despachador>',        'push_dispatch_secret');
--
-- NO TOCA NADA SI LA COLA ESTA VACIA. Un POST por minuto contra la aplicacion
-- para no hacer nada es gasto y ruido en los registros.
-- =============================================================================
create function wake_push_dispatcher()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (
    select 1 from push_outbox
     where status = 'queued' and next_attempt_at <= now()
  ) then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_dispatch_secret';

  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

comment on function wake_push_dispatcher() is
  'D-187: toca el despachador por pg_net si hay cola. Sin secretos en el vault no hace nada. Es un toque, no una entrega.';

select cron.schedule(
  'push-dispatch-wake',
  '* * * * *',
  $cron$select public.wake_push_dispatcher()$cron$
);

-- =============================================================================
-- 10. Privilegios (I-078, I-020)
--
-- NINGUNA de estas funciones la ejecuta una sesion. El despachador entra con
-- `service_role` y el toque lo hace el cron.
-- =============================================================================
revoke execute on function push_max_attempts()                                  from public, anon;
revoke execute on function push_retry_delay(integer)                            from public, anon;
revoke execute on function push_claim_timeout()                                 from public, anon;
revoke execute on function claim_push_outbox(integer)                           from public, anon;
revoke execute on function mark_push_outbox_sent(uuid)                          from public, anon;
revoke execute on function mark_push_outbox_failed(uuid, text, boolean)         from public, anon;
revoke execute on function revoke_push_subscription(text, text)                 from public, anon;
revoke execute on function mark_push_subscription_sent(text)                    from public, anon;
revoke execute on function wake_push_dispatcher()                               from public, anon;

grant execute on function push_max_attempts()                          to service_role;
grant execute on function push_retry_delay(integer)                    to service_role;
grant execute on function push_claim_timeout()                         to service_role;
grant execute on function claim_push_outbox(integer)                   to service_role;
grant execute on function mark_push_outbox_sent(uuid)                  to service_role;
grant execute on function mark_push_outbox_failed(uuid, text, boolean) to service_role;
grant execute on function revoke_push_subscription(text, text)         to service_role;
grant execute on function mark_push_subscription_sent(text)            to service_role;

-- =============================================================================
-- 11. Nota de reversion (manual, no ejecutable) — DB-15
--
-- Primero el job, que es lo unico que sigue corriendo:
--
--   select cron.unschedule('push-dispatch-wake');
--
--   drop function if exists wake_push_dispatcher();
--   drop function if exists mark_push_subscription_sent(text);
--   drop function if exists revoke_push_subscription(text, text);
--   drop function if exists mark_push_outbox_failed(uuid, text, boolean);
--   drop function if exists mark_push_outbox_sent(uuid);
--   drop function if exists claim_push_outbox(integer);
--   drop function if exists push_claim_timeout();
--   drop function if exists push_retry_delay(integer);
--   drop function if exists push_max_attempts();
--   drop table if exists push_outbox;
--   drop type if exists push_outbox_status;
--
-- Y `process_due_payment_reminders` hay que devolverla a la version de la 0052
-- —la unica diferencia es el bloque marcado «AÑADIDO EN LA 0054»—.
--
-- Revertir NO pierde ningun aviso: la campana esta en `notifications` y no se
-- toca. Lo que se pierde es la salida al telefono.
-- =============================================================================
