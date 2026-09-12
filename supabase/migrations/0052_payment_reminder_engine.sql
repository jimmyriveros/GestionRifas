-- =============================================================================
-- 0052_payment_reminder_engine.sql
-- Motor de recordatorios de pago: ocurrencias, campana y cron — ETAPA 3
--
-- Referencia: docs/BUSINESS_RULES.md BR-S08, BR-S10..BR-S14 y BR-V01,
--             docs/DECISIONS.md D-185 (decisiones 5 a 8), D-186 y D-189,
--             docs/DATA_MODEL.md 4.17, docs/ARCHITECTURE.md 8.24.
--
-- QUE HACE
--
-- La 0051 dejo la CONFIGURACION: cuando quiere el vendedor que le recordemos
-- mandar su mensaje de cobro. Esta trae lo que la hace sonar:
--
--   1. `payment_reminder_occurrences` — una fila por (recordatorio, instante
--      que le tocaba). Es el registro de que paso: se aviso, se atendio, o se
--      llego tarde y se omitio.
--   2. `process_due_payment_reminders()` — el motor. Toma los vencidos,
--      materializa su ocurrencia, escribe la campana y adelanta el reloj, todo
--      en la misma transaccion.
--   3. Un `pg_cron` cada minuto que lo llama. UNO GLOBAL, nunca uno por
--      vendedor (D-186).
--   4. `mark_reminder_occurrence_attended()` — el vendedor dice que ya lo hizo.
--
-- LO QUE ESTA MIGRACION NO HACE, Y ES DELIBERADO
--
-- No manda nada a WhatsApp: no hay integracion y no la va a haber aqui
-- (BR-W08). El motor prepara un aviso interno; el mensaje lo copia, lo pega y
-- lo envia una PERSONA con su propio dedo.
--
-- No trae Web Push. Ni suscripciones, ni claves VAPID, ni outbox, ni
-- dispatcher, ni oyente `push` en el service worker: son las etapas 4 y 5 y
-- cada una necesita su autorizacion. `pg_net` NO se usa aqui, y por eso este
-- cron NO habla con internet: lo unico que hace es escribir en tres tablas
-- propias.
--
-- No hay sondeo del navegador ni Realtime. Lo que hay que enterarse por
-- sorpresa llega por la campana, que ya se lee en cada carga de pagina.
--
-- POR QUE `pg_cron` DESPUES DE QUE D-148 LO DESCARTARA
--
-- D-148 rechazo `pg_cron` para los parsers de loterias, que son codigo Node que
-- lee HTML y PDF. Aqui no hay nada que descargar ni que interpretar: son cuatro
-- sentencias SQL sobre tablas propias. Y hay una razon nueva que manda: Vercel
-- Hobby da UNA corrida diaria por job con +-59 minutos de precision, y el
-- contrato pide recurrencia semanal con precision de MINUTO. El argumento
-- completo, con sus alternativas descartadas, esta en D-186.
--
-- LA MIGRACION ES ADITIVA salvo en un punto: vuelve a crear
-- `notifications_kind_check` con un valor mas, exactamente como hizo 0037. No
-- toca ninguna tabla, politica, funcion ni enum existente, y nadie gana un
-- privilegio sobre nada que ya existiera.
--
-- SOBRE LAS TILDES. Las frases NUEVAS que lee un usuario van acentuadas, como
-- 0050 y 0051. La deuda general de tildes en la base es I-030.
-- =============================================================================

-- =============================================================================
-- 1. reminder_occurrence_status (BR-S10, BR-S11)
--
-- `pending`  — vencio, se aviso y el vendedor todavia no ha dicho que lo hizo.
-- `attended` — el vendedor dijo que ya lo mando. LO DIJO EL, no nos consta
--              que WhatsApp entregara nada (BR-S14).
-- `missed`   — llego tarde de mas. Se guarda la fila y NO se avisa.
-- =============================================================================
create type reminder_occurrence_status as enum ('pending', 'attended', 'missed');

comment on type reminder_occurrence_status is
  'BR-S10/BR-S11: estado de una ocurrencia. attended lo declara el vendedor; missed no genera campana.';

-- =============================================================================
-- 2. notifications: un kind nuevo (BR-V01)
--
-- Mismo procedimiento que 0037: soltar la restriccion por su definicion —no por
-- su nombre, que pudo cambiar— y volver a crearla con la lista COMPLETA.
--
-- EL TEXTO NO VIVE AQUI. La base guarda que paso y con que datos; la frase se
-- arma en `src/features/notifications/text.ts`, para que mejorar una redaccion
-- sea cambiar un archivo y no aplicar una migracion a produccion (I-030, D-093).
-- =============================================================================
do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.notifications'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%kind%'
  loop
    execute format('alter table public.notifications drop constraint %I', r.conname);
  end loop;
end
$$;

alter table notifications
  add constraint notifications_kind_check
  check (kind in (
    'team.member_added',
    'team.sale',
    'lottery.result',
    'lottery.schedule_change',
    'payment_reminder.due'
  ));

comment on constraint notifications_kind_check on notifications is
  'Kinds de equipo (0023), de loteria (0037) y de recordatorio de pago (0052). El texto no vive aqui (I-030).';

-- Un aviso por ocurrencia. Es un cinturon sobre el tirante: la ocurrencia ya es
-- unica por (recordatorio, instante) y su fila se crea ANTES que el aviso, asi
-- que este indice no puede dispararse hoy. Existe para que, si alguien invierte
-- el orden de esas dos escrituras, falle aqui en vez de duplicar campanas.
create unique index notifications_payment_reminder_once
  on notifications (entity_id)
  where kind = 'payment_reminder.due';

-- =============================================================================
-- 3. payment_reminder_occurrences (BR-S10..BR-S12)
--
-- UNA FILA POR (RECORDATORIO, INSTANTE QUE LE TOCABA), y esa unicidad es LA
-- pieza de la idempotencia: el motor inserta con `on conflict do nothing`, asi
-- que ejecutarlo dos veces sobre el mismo vencimiento no crea dos avisos.
-- Mismo recurso que `notifications_lottery_result_once` (0037).
--
-- `scheduled_for` es el instante que le TOCABA; `processed_at`, aquel en que el
-- motor llego. La distancia entre los dos es el atraso, y es lo que decide si
-- la ocurrencia nace pendiente u omitida. Guardar los dos —en vez de uno y el
-- atraso ya calculado— permite responder «¿a que hora corrio el cron esa
-- noche?» sin adivinar.
--
-- Las ocurrencias SE CONSERVAN. Son pocas —14 por vendedor y semana como
-- mucho— y son la evidencia de que se aviso y de que se omitio. Sin la fila
-- omitida no habria forma de distinguir «el sistema no lo mando» de «el sistema
-- no se entero».
-- =============================================================================
create table payment_reminder_occurrences (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete restrict,
  seller_id       uuid not null,
  reminder_id     uuid not null references seller_payment_reminders (id) on delete restrict,
  scheduled_for   timestamptz not null,
  processed_at    timestamptz not null default now(),
  status          reminder_occurrence_status not null,
  -- NULL en las omitidas, a proposito: una ocurrencia omitida no genera campana
  -- (BR-S11). El CHECK de abajo lo impone.
  notification_id uuid references notifications (id) on delete restrict,
  attended_at     timestamptz,

  constraint payment_reminder_occurrences_seller_org_fk
    foreign key (seller_id, organization_id)
    references memberships (profile_id, organization_id) on delete restrict,

  -- BR-S11: una omitida NO avisa. Es la mitad que de verdad importa del estado
  -- `missed`, y por eso se defiende con una restriccion y no con una linea de
  -- codigo dentro del motor.
  constraint payment_reminder_occurrences_missed_silent check (
    status <> 'missed' or notification_id is null
  ),

  -- Atendida es exactamente «tiene fecha de atencion». Sin esto, una fila
  -- podria decir `attended` sin cuando, o traer un `attended_at` de una que
  -- nadie atendio.
  constraint payment_reminder_occurrences_attended_coherent check (
    (status = 'attended') = (attended_at is not null)
  ),

  -- El atraso no puede ser negativo: nadie procesa antes de que toque.
  constraint payment_reminder_occurrences_not_early check (
    processed_at >= scheduled_for
  )
);

comment on table payment_reminder_occurrences is
  'BR-S10: una fila por (recordatorio, instante programado). Su unicidad es la idempotencia del motor. No se borra (D-038).';
comment on column payment_reminder_occurrences.scheduled_for is
  'El instante que le tocaba, no el de proceso. La distancia con processed_at es el atraso.';
comment on column payment_reminder_occurrences.notification_id is
  'La campana que se escribio. NULL en las omitidas: una omitida no avisa (BR-S11).';
comment on column payment_reminder_occurrences.attended_at is
  'Cuando el VENDEDOR dijo que ya lo hizo. No es confirmacion de envio ni de entrega (BR-S14).';

-- LA idempotencia (BR-S10).
create unique index payment_reminder_occurrences_once
  on payment_reminder_occurrences (reminder_id, scheduled_for);

comment on index payment_reminder_occurrences_once is
  'BR-S10: correr el motor dos veces sobre el mismo vencimiento no crea dos avisos.';

-- La UNICA consulta de la pantalla: lo que este vendedor tiene por enviar.
-- Empieza por `seller_id`, que es la columna de la politica, para que el orden
-- del indice sobreviva a RLS (D-102, regla 2).
create index payment_reminder_occurrences_pending_idx
  on payment_reminder_occurrences (seller_id, scheduled_for desc)
  where status = 'pending';

-- =============================================================================
-- 4. RLS: lo mismo que las otras dos tablas del encargo
--
-- Una sola politica, y es de SELECT. `authenticated` no recibe INSERT, UPDATE
-- ni DELETE, asi que la unica forma de marcar una ocurrencia como atendida es
-- la RPC de mas abajo, y la unica forma de crear una es el motor.
--
-- El aislamiento es POR VENDEDOR, no por organizacion: ni el Dueno, ni el
-- Administrador, ni el vendedor padre (BR-M02, D-185 decision 9).
-- =============================================================================
alter table payment_reminder_occurrences enable row level security;
alter table payment_reminder_occurrences force  row level security;

create policy payment_reminder_occurrences_select on payment_reminder_occurrences
  for select to authenticated
  using (seller_id = (select current_profile_id()));

grant select on payment_reminder_occurrences to authenticated;
grant all    on payment_reminder_occurrences to service_role;

-- =============================================================================
-- 5. payment_reminder_grace — cuanto atraso se recupera (BR-S11)
--
-- Dos horas, en un solo sitio, por lo mismo que `max_active_payment_reminders`:
-- cambiarlo es una migracion y no un numero suelto dentro de una funcion larga.
--
-- Un recordatorio de las 7:00 p. m. que llega a las 2:00 a. m. no sirve de
-- nada, y despertar a alguien con el es peor que callarse.
-- =============================================================================
create function payment_reminder_grace()
returns interval
language sql
immutable
set search_path = public, pg_temp
as $$
  select interval '2 hours'
$$;

comment on function payment_reminder_grace() is
  'BR-S11: atraso maximo que todavia se recupera con campana. Mas alla, la ocurrencia nace omitida.';

-- =============================================================================
-- 6. process_due_payment_reminders — el motor (BR-S10..BR-S13)
--
-- Lo llama el cron cada minuto, y no lo llama nadie mas: `authenticated` no
-- recibe EXECUTE.
--
-- QUE HACE, EN ORDEN, PARA CADA RECORDATORIO VENCIDO
--
--   1. Comprueba que su vendedor todavia puede operar (BR-S13).
--   2. Materializa la ocurrencia, pendiente u omitida segun el atraso.
--   3. Si es pendiente, escribe la campana y la enlaza.
--   4. Adelanta el reloj al proximo instante FUTURO.
--
-- Los cuatro pasos van en la MISMA transaccion. O pasan todos, o no pasa
-- ninguno: no existe el estado «se aviso pero el reloj no avanzo», que dejaria
-- el recordatorio sonando en bucle, ni el contrario, que lo dejaria mudo una
-- semana.
--
-- POR QUE NO SE DISPARAN LAS SEMANAS PERDIDAS. El reloj no avanza «una semana»:
-- salta al proximo instante posterior a AHORA (BR-S11). Si el proyecto estuvo
-- pausado un mes, se registra UNA omitida y se sigue, en vez de cuatro avisos
-- de golpe.
--
-- CONCURRENCIA. Las filas se toman con `for update skip locked`, asi que dos
-- corridas simultaneas trabajan sobre conjuntos disjuntos en vez de bloquearse
-- (BR-S12). Y aunque las dos llegaran al mismo vencimiento, el indice unico de
-- la ocurrencia haria que la segunda no escribiera nada.
--
-- UN SOLO «AHORA» PARA TODA LA CORRIDA: `now()` es el instante en que empezo la
-- transaccion, asi que dos recordatorios de la misma tanda no pueden quedar con
-- criterios de atraso distintos.
-- =============================================================================
create function process_due_payment_reminders(p_limit integer default 200)
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
  'BR-S10..BR-S13: materializa las ocurrencias vencidas, escribe la campana y adelanta el reloj. Idempotente. La llama el cron.';

-- =============================================================================
-- 7. mark_reminder_occurrence_attended — «ya lo mande» (BR-S14)
--
-- LO DICE EL VENDEDOR, Y ESO ES TODO LO QUE SIGNIFICA. No sabemos si el mensaje
-- salio, si llego o si alguien lo leyo: no hay integracion con WhatsApp y no la
-- va a haber (BR-W08). «Marcado como atendido» describe un acto local, igual
-- que «Copiado» y «Grupo abierto».
--
-- NO RECIBE IDENTIFICADOR DE VENDEDOR, como las ocho de la 0051: el perfil sale
-- de `auth.uid()`, asi que no existe el dato que alguien pudiera manipular para
-- marcar lo de otro.
--
-- NO TOCA LA CAMPANA. El estado de leido de un aviso es de la campanita y se
-- cambia con «Marcar como leídas»; atender una ocurrencia no es leer un aviso, y
-- mezclar las dos cosas haria que una accion cambiara en silencio algo de otra
-- pantalla.
-- =============================================================================
create function mark_reminder_occurrence_attended(p_id uuid)
returns payment_reminder_occurrences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_auth();
  v_org uuid := require_seller_org();
  v_row payment_reminder_occurrences;
begin
  update payment_reminder_occurrences o
     set status      = 'attended',
         attended_at = now()
   where o.id = p_id
     and o.seller_id = v_uid
     and o.status = 'pending'
  returning * into v_row;

  -- Una sola frase para los cuatro casos —no existe, es de otro, ya se atendio,
  -- nacio omitida— a proposito: distinguirlos le contaria a quien prueba ids
  -- ajenos cuales existen, y a quien la lee de verdad no le cambia nada.
  if v_row.id is null then
    raise exception 'Ese recordatorio ya no está pendiente.'
      using errcode = 'insufficient_privilege';
  end if;

  perform write_audit_log(
    v_org, 'payment_reminder.attended', 'payment_reminder_occurrence', v_row.id,
    null,
    jsonb_build_object('scheduled_for', v_row.scheduled_for)
  );

  return v_row;
end;
$$;

comment on function mark_reminder_occurrence_attended(uuid) is
  'BR-S14: el vendedor declara que ya mando el mensaje. No es confirmacion de envio ni de entrega de WhatsApp.';

-- =============================================================================
-- 8. El cron (D-186)
--
-- UN SOLO JOB GLOBAL, cada minuto. Nunca uno por vendedor: eso seria crear una
-- fila de `cron.job` —un objeto de infraestructura— cada vez que alguien se da
-- de alta, imposible de revisar y de revertir.
--
-- `cron.schedule(nombre, ...)` REEMPLAZA el job que tenga ese nombre en vez de
-- anadir otro, asi que volver a aplicar esta migracion no duplica nada.
--
-- El nombre de la funcion va con esquema (`public.`) porque el cron no corre
-- con el `search_path` de la aplicacion.
--
-- La extension se crea AQUI, en una migracion versionada, y nunca a mano desde
-- el panel de Supabase: lo que se hace a mano no se reproduce en local ni en el
-- CI y no deja rastro en el historial.
--
-- RIESGO OPERATIVO CONOCIDO, Y NO ESCONDIDO: el proyecto real esta en plan Free
-- (I-024), que PAUSA un proyecto a los 7 dias sin trafico, y un proyecto pausado
-- no corre `pg_cron`. El producto se usa a diario y los diez cron de loterias
-- tocan la base todos los dias, asi que el escenario es improbable; sigue siendo
-- un motivo mas para subir a Pro. Y el hueco se VE: las ocurrencias omitidas lo
-- dejan escrito en vez de esconderlo.
-- =============================================================================
create extension if not exists pg_cron;

select cron.schedule(
  'payment-reminders-due',
  '* * * * *',
  $cron$select public.process_due_payment_reminders()$cron$
);

-- -----------------------------------------------------------------------------
-- Y la limpieza de su propia bitacora.
--
-- `pg_cron` escribe una fila en `cron.job_run_details` por cada corrida: 1.440
-- al dia, medio millon al ano. En un proyecto Free de 500 MB eso es espacio que
-- se come solo, por un registro que solo sirve para diagnosticar los ultimos
-- dias. Se purga a los 7, de madrugada en Bogota.
--
-- El cron corre en UTC, asi que las 08:17 UTC son las 3:17 a. m. de Bogota. No
-- se escribe «-05» en ningun sitio donde importe la hora de negocio; aqui solo
-- decide a que hora molesta menos una purga.
-- -----------------------------------------------------------------------------
select cron.schedule(
  'payment-reminders-cron-cleanup',
  '17 8 * * *',
  $cron$delete from cron.job_run_details where end_time < now() - interval '7 days'$cron$
);

-- =============================================================================
-- 9. Privilegios (I-078, I-020)
--
-- El motor es INTERNO: lo llama el cron, y `authenticated` no puede tocarlo.
-- Dejarlo ejecutable desde una sesion permitiria a cualquiera forzar el
-- procesamiento de TODA la organizacion desde el navegador.
--
-- `anon` no ejecuta ninguna de las tres, como ninguna funcion de este producto.
-- =============================================================================
revoke execute on function payment_reminder_grace()                from public, anon;
revoke execute on function process_due_payment_reminders(integer)  from public, anon;
revoke execute on function mark_reminder_occurrence_attended(uuid) from public, anon;

-- La UNICA que llama la aplicacion.
grant execute on function mark_reminder_occurrence_attended(uuid) to authenticated, service_role;

-- Internas: solo el proceso.
grant execute on function payment_reminder_grace()               to service_role;
grant execute on function process_due_payment_reminders(integer) to service_role;

-- =============================================================================
-- 10. Nota de reversion (manual, no ejecutable) — DB-15
--
-- No se ejecuta aqui. Queda escrita para que revertir sea leer, no recordar.
-- El orden importa: primero los jobs, que son lo unico que sigue corriendo.
--
--   select cron.unschedule('payment-reminders-due');
--   select cron.unschedule('payment-reminders-cron-cleanup');
--
--   drop function if exists mark_reminder_occurrence_attended(uuid);
--   drop function if exists process_due_payment_reminders(integer);
--   drop function if exists payment_reminder_grace();
--   drop index if exists notifications_payment_reminder_once;
--   drop table if exists payment_reminder_occurrences;
--   drop type if exists reminder_occurrence_status;
--
--   alter table notifications drop constraint notifications_kind_check;
--   alter table notifications add constraint notifications_kind_check
--     check (kind in ('team.member_added','team.sale',
--                     'lottery.result','lottery.schedule_change'));
--
-- `drop extension pg_cron` NO esta en la lista a proposito: puede haber otros
-- jobs y quitarla se los llevaria por delante. Hoy no los hay; manana, quiza.
--
-- Revertir BORRA las ocurrencias, que son evidencia de que se aviso. Los avisos
-- de la campana sobreviven —`notifications` no se toca— pero quedarian con un
-- `entity_id` que ya no apunta a nada.
-- =============================================================================
