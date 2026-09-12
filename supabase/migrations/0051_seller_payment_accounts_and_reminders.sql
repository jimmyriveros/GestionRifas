-- =============================================================================
-- 0051_seller_payment_accounts_and_reminders.sql
-- Cuentas para recibir pagos y recordatorios de pago del vendedor — ETAPA 1
--
-- Referencia: docs/BUSINESS_RULES.md BR-M01..BR-M09 y BR-S01..BR-S06,
--             docs/DECISIONS.md D-185, docs/DATA_MODEL.md 4.bis,
--             docs/SECURITY.md 4.15.
--
-- QUE ES
--
-- Dos cosas que hasta hoy solo estaban en la cabeza del vendedor:
--
--   1. DONDE le consignan sus clientes — Nequi, Daviplata o una cuenta
--      bancaria—, para no tener que dictar el numero de memoria.
--   2. CUANDO quiere que la aplicacion le recuerde mandar el mensaje de cobro
--      a su grupo de WhatsApp.
--
-- LO QUE ESTA MIGRACION NO HACE, Y ES DELIBERADO
--
-- No trae el motor. No hay `pg_cron`, ni `pg_net`, ni ocurrencias, ni avisos,
-- ni outbox, ni Web Push: eso son las etapas 3, 4 y 5 del encargo y cada una
-- necesita su autorizacion. Aqui solo se guarda la CONFIGURACION, con sus
-- reglas puestas donde no se pueden esquivar. `next_run_at` ya se calcula y se
-- mantiene, para que el dia que llegue el motor solo tenga que leer un indice.
--
-- Tampoco cobra, ni mueve dinero, ni habla con Nequi, con Daviplata, con ningun
-- banco ni con WhatsApp. Lo que se guarda aqui acaba siendo TEXTO que el
-- vendedor pega en un chat con su propio dedo.
--
-- POR QUE TABLAS PROPIAS Y NO COLUMNAS EN `memberships`
--
-- Es la decision que ordena todo el encargo (D-185, decision 1), y no es una
-- preferencia de estilo: la escribio `docs/SECURITY.md` 4.14 al cerrar D-176,
-- antes de que este trabajo existiera.
--
--   «Quien puede LEER el enlace, dicho sin adornos. `memberships_select` no
--    cambia, asi que la fila la ven: su dueno, el PERSONAL de su organizacion y
--    su VENDEDOR PADRE. [...] Conviene saberlo antes de guardar aqui algo mas
--    sensible que un enlace de invitacion a un grupo: para eso haria falta una
--    tabla aparte con su propia politica, no una columna mas.»
--
-- El contrato dice que el vendedor es el UNICO usuario humano que ve sus
-- cuentas y sus recordatorios (BR-M02). Una columna mas en `memberships` daria
-- exactamente lo contrario —al personal y al vendedor padre— el mismo dia en que
-- se aplicara la migracion, sin que ninguna politica cambiara y sin que nada en
-- la pantalla lo delatara. Y el dato es mas sensible: el numero de una cuenta
-- bancaria con el nombre de su titular es lo que hace falta para suplantar un
-- cobro.
--
-- Lo que NO significa: no se crea una «segunda entidad de vendedor». Un vendedor
-- sigue siendo una `membership` con rol `seller`, y estas dos tablas cuelgan de
-- ella por la FK compuesta (seller_id, organization_id), igual que `tickets` y
-- `clients`. Se separa el DATO, no la identidad.
--
-- LA MIGRACION ES ADITIVA. No toca ninguna tabla, politica, funcion, enum ni
-- restriccion existente. Nadie gana un privilegio sobre nada que ya existiera.
--
-- SOBRE LAS TILDES. Las frases NUEVAS que lee un usuario van acentuadas, como
-- hizo 0050. La deuda general de tildes en la base es I-030 y se arregla entera
-- de una vez, no a trozos dentro de una migracion de otra cosa.
-- =============================================================================

-- =============================================================================
-- 1. Tipos enumerados (BR-M03, BR-S04)
--
-- `payment_account_kind` es un enum y no un texto libre a proposito: anadir una
-- forma de pago manana es `alter type ... add value` mas su rama en el CHECK de
-- forma, en una migracion nueva. Con texto libre, «Nequi», «nequi» y «NEQUI»
-- serian tres cosas distintas y ninguna pantalla podria decidir que campos pedir.
--
-- ⚠️ Al anadir un valor, recuerda D-099: `alter type ... add value` deja el
-- valor INUTILIZABLE hasta que la transaccion confirme. Si esa migracion
-- necesita ademas insertar o comparar con el valor nuevo, va en dos migraciones.
-- =============================================================================
create type payment_account_kind    as enum ('nequi', 'daviplata', 'bank');
create type bank_account_type       as enum ('savings', 'checking');
create type payment_reminder_status as enum ('active', 'paused', 'archived');

comment on type payment_account_kind is
  'BR-M03: forma de recibir un pago. Extensible con alter type ... add value (D-099).';
comment on type bank_account_type is
  'Ahorros o corriente. Solo aplica a las cuentas de tipo bank.';
comment on type payment_reminder_status is
  'BR-S04: un recordatorio esta activo, pausado o archivado. No se borra (D-038).';

-- =============================================================================
-- 2. seller_payment_accounts (BR-M01..BR-M09)
--
-- EL TOPE DE 5 NO ES UN TRIGGER: ES LA FORMA DE LA TABLA
--
-- Una cuenta activa ocupa una POSICION del 1 al 5, y esa posicion es unica por
-- vendedor. De ahi salen tres invariantes de una sola vez y sin contar filas:
--
--   * no puede haber una sexta cuenta activa, porque no hay una sexta posicion;
--   * el orden en que salen en el mensaje esta definido siempre;
--   * no hay condicion de carrera. Un trigger que cuenta filas puede dejar
--     pasar dos inserciones simultaneas; un indice unico, no.
--
-- Archivar libera la posicion (`sort_order` pasa a NULL), asi que una cuenta
-- archivada no consume cupo y varias conviven sin chocar: en PostgreSQL los
-- NULL de un indice unico se consideran distintos entre si.
--
-- El constraint es DEFERRABLE INITIALLY DEFERRED porque reordenar es permutar:
-- poner la cuenta 3 en el sitio 1 pasa por un estado intermedio con dos filas
-- compartiendo posicion. Diferir la comprobacion al COMMIT permite hacerlo en
-- una sola sentencia en vez de inventar posiciones temporales.
--
-- La columna se llama `sort_order` y no `position` porque `position` es una
-- funcion del estandar SQL (`position(x in y)`) y tenerla ademas como nombre de
-- columna obliga a acordarse de citarla para siempre.
-- =============================================================================
create table seller_payment_accounts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete restrict,
  seller_id        uuid not null,
  kind             payment_account_kind not null,
  -- El titular se pide SIEMPRE, en los tres tipos: es lo que el cliente compara
  -- en la pantalla de su banco antes de confirmar.
  holder_name      text not null,
  -- Nequi y Daviplata.
  phone            text,
  -- Cuenta bancaria.
  bank_name        text,
  account_type     bank_account_type,
  account_number   text,
  -- Opcional, del vendedor para el vendedor: «El Nequi de mi esposa».
  label            text,
  -- 1..5 mientras la cuenta este activa; NULL cuando se archiva.
  sort_order       smallint,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- BR-M07: se archiva, nunca se borra (D-038).
  archived_at      timestamptz,

  -- BR-M01: la cuenta es de un vendedor de ESTA organizacion. La FK compuesta
  -- es la misma garantia que usan `clients` y `tickets` (D-007).
  constraint seller_payment_accounts_seller_org_fk
    foreign key (seller_id, organization_id)
    references memberships (profile_id, organization_id) on delete restrict,

  -- BR-M04: que campos existen depende del tipo, y no es negociable. No existe
  -- una cuenta de Nequi con numero de cuenta bancaria, ni una bancaria sin
  -- banco. Se escribe con CASE para que anadir una forma de pago obligue a
  -- decidir su rama en vez de caer por descuido en la de al lado.
  constraint seller_payment_accounts_shape_by_kind check (
    case kind
      when 'bank' then
        phone is null
        and bank_name is not null
        and account_type is not null
        and account_number is not null
      else
        phone is not null
        and bank_name is null
        and account_type is null
        and account_number is null
    end
  ),

  constraint seller_payment_accounts_holder_length check (
    length(btrim(holder_name)) between 2 and 120
  ),
  -- El MISMO patron que `clients.phone` y `profiles.phone` (0002).
  -- ⚠️ Cuenta CARACTERES, no digitos: es I-108, heredada a proposito. Corregirla
  -- alcanza a tres tablas y exige censar los datos reales; no se hace de paso
  -- dentro de una migracion de otra cosa.
  constraint seller_payment_accounts_phone_format check (
    phone is null or phone ~ '^[0-9+ ()-]{7,20}$'
  ),
  constraint seller_payment_accounts_bank_length check (
    bank_name is null or length(btrim(bank_name)) between 2 and 60
  ),
  -- Digitos, espacios y guiones, empezando por un digito. Los bancos
  -- colombianos emiten numeros de largos distintos, asi que se acota el rango y
  -- no una longitud exacta: rechazar manana una cuenta legitima es mucho mas
  -- caro que aceptar una rara.
  constraint seller_payment_accounts_number_format check (
    account_number is null or account_number ~ '^[0-9][0-9 -]{4,29}$'
  ),
  constraint seller_payment_accounts_label_length check (
    label is null or length(btrim(label)) between 1 and 40
  ),

  -- Activa <=> tiene posicion. Las dos direcciones, para que no exista ni una
  -- cuenta activa sin sitio en el mensaje ni una archivada ocupando cupo.
  constraint seller_payment_accounts_slot_presence check (
    (archived_at is null) = (sort_order is not null)
  ),
  -- BR-M06: el tope de 5, dicho como rango.
  constraint seller_payment_accounts_slot_range check (
    sort_order is null or sort_order between 1 and 5
  ),
  constraint seller_payment_accounts_slot_unique
    unique (seller_id, sort_order) deferrable initially deferred
);

comment on table seller_payment_accounts is
  'BR-M01: cuentas donde un vendedor recibe pagos. Tabla propia y NO columnas de memberships, porque memberships_select deja leer esa fila al personal y al vendedor padre (SECURITY 4.14, D-185).';
comment on column seller_payment_accounts.sort_order is
  'BR-M05/BR-M06: 1..5 mientras la cuenta esta activa, NULL al archivarla. Es el orden en el mensaje Y el tope de cinco: no hay sexta posicion.';
comment on column seller_payment_accounts.holder_name is
  'Titular. Se pide en los tres tipos. NO se guarda documento de identidad (D-185, decision 2).';
comment on column seller_payment_accounts.archived_at is
  'BR-M07: archivar es la unica salida. No hay DELETE en esta tabla (D-038).';

-- BR-M08: la misma cuenta dos veces sin archivar es un error de dedo, no una
-- configuracion. Se compara por DIGITOS, para que «300 123 4567» y
-- «3001234567» sean la misma cuenta: desde D-184 el teclado produce la primera
-- forma y la base guarda lo que le manden.
create unique index seller_payment_accounts_no_duplicates
  on seller_payment_accounts (
    seller_id,
    kind,
    regexp_replace(coalesce(phone, account_number), '[^0-9]', '', 'g')
  )
  where archived_at is null;

comment on index seller_payment_accounts_no_duplicates is
  'BR-M08: no dos cuentas iguales sin archivar del mismo vendedor, comparando solo digitos.';

create trigger seller_payment_accounts_set_updated_at
  before update on seller_payment_accounts
  for each row execute function set_updated_at();

-- =============================================================================
-- 3. seller_payment_reminders (BR-S01..BR-S06)
--
-- QUE ES UN RECORDATORIO: «los martes a las 7:00 p. m.». Nada mas. No se ata a
-- una rifa (BR-S01), porque el destino —el grupo de WhatsApp del vendedor—
-- tampoco lo esta, y atarlo obligaria a reconfigurarlo en cada rifa nueva.
--
-- `next_run_at` ESTA MATERIALIZADO, Y ESE ES SU PUNTO
--
-- Guardar el proximo instante en UTC permite que el motor de la etapa 3 lea un
-- INDICE —«dame los activos cuyo next_run_at ya paso»— en vez de recorrer todos
-- los recordatorios cada minuto calculando husos horarios por fila. Lo mantiene
-- un trigger, no la pantalla: asi la columna no puede quedar incoherente venga
-- la escritura por donde venga.
-- =============================================================================
create table seller_payment_reminders (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations (id) on delete restrict,
  seller_id          uuid not null,
  -- ISO: 1 lunes ... 7 domingo. El mismo criterio que `extract(isodow ...)`,
  -- que es lo que usa el calculo, para no tener que traducir en ningun sitio.
  weekday            smallint not null,
  time_of_day        time not null,
  status             payment_reminder_status not null default 'active',
  use_custom_message boolean not null default false,
  -- Prosa, SIN las cuentas y SIN marcadores. Las cuentas las anade la
  -- aplicacion al final, al componer (BR-S07). No hay nada que conservar aqui,
  -- asi que no hay nada que se pueda romper.
  custom_message     text,
  -- Lo pone el trigger de abajo. El DEFAULT solo existe para que la columna
  -- pueda ser NOT NULL y opcional al insertar, igual que `raffles.short_code`.
  next_run_at        timestamptz not null default now(),
  last_run_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint seller_payment_reminders_seller_org_fk
    foreign key (seller_id, organization_id)
    references memberships (profile_id, organization_id) on delete restrict,

  constraint seller_payment_reminders_weekday_range check (weekday between 1 and 7),
  -- BR-S02: la precision es de MINUTO. Un `time` admite segundos y
  -- microsegundos, y dos recordatorios a las 19:00:00 y 19:00:30 serian dos
  -- filas distintas que la pantalla pintaria identicas.
  constraint seller_payment_reminders_minute_precision check (
    extract(second from time_of_day) = 0
  ),
  -- BR-S06, copia literal de las de 0050 (BR-W03): «uso mi mensaje» sin
  -- mensaje es un recordatorio cuyo texto sale vacio. Que se pueda guardar un
  -- texto con el interruptor APAGADO es deliberado: apagarlo no borra lo
  -- escrito, para que volver a encenderlo lo devuelva tal cual.
  constraint seller_payment_reminders_message_coherent check (
    not use_custom_message
    or (custom_message is not null and btrim(custom_message) <> '')
  ),
  -- El mismo tope que las notas de un cliente y que el mensaje de WhatsApp: la
  -- longitud a partir de la cual un texto deja de ser un mensaje.
  constraint seller_payment_reminders_message_length check (
    custom_message is null or length(custom_message) <= 1000
  )
);

comment on table seller_payment_reminders is
  'BR-S01: recordatorios semanales de cobro de UN vendedor. No se atan a una rifa. Mismo aislamiento que seller_payment_accounts.';
comment on column seller_payment_reminders.weekday is
  'ISO 1..7, lunes a domingo. Mismo criterio que extract(isodow ...).';
comment on column seller_payment_reminders.next_run_at is
  'Instante UTC del proximo disparo, calculado en America/Bogota (BR-S03). Lo mantiene un trigger; la etapa 3 lo lee por indice.';
comment on column seller_payment_reminders.custom_message is
  'BR-S06/BR-S07: prosa del vendedor, SIN las cuentas y SIN marcadores. El predeterminado NO se guarda aqui: vive en la aplicacion (BR-W02).';

-- BR-S02: varios el mismo dia a horas distintas, si; dos identicos, no. Los
-- archivados quedan fuera para que archivar libere de verdad esa hora.
create unique index seller_payment_reminders_unique
  on seller_payment_reminders (seller_id, weekday, time_of_day)
  where status <> 'archived';

-- La UNICA consulta del motor de la etapa 3.
create index seller_payment_reminders_due_idx
  on seller_payment_reminders (next_run_at)
  where status = 'active';

create trigger seller_payment_reminders_set_updated_at
  before update on seller_payment_reminders
  for each row execute function set_updated_at();

-- =============================================================================
-- 4. next_reminder_run_at — el reloj (BR-S03)
--
-- El proximo instante, estrictamente posterior a `p_from`, en que son las
-- `p_time` de un `p_weekday` en Bogota.
--
-- SE CALCULA CON LA ZONA NOMBRADA, NUNCA CON UN «-05» ESCRITO A MANO. Colombia
-- no cambia la hora desde 1993 y probablemente no lo hara, pero el dia que una
-- ley lo cambie este no debe ser el sitio donde se descubra: `at time zone
-- 'America/Bogota'` seguira dando la respuesta correcta y un desfase fijo no.
--
-- Es STABLE y no IMMUTABLE: `at time zone` con nombre de zona depende de la
-- tabla de husos horarios del servidor, que puede actualizarse.
-- =============================================================================
create function next_reminder_run_at(
  p_weekday smallint,
  p_time    time,
  p_from    timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_local_now timestamp;
  v_candidate timestamp;
begin
  -- Hora de pared en Bogota, que es en la que piensa quien configura.
  v_local_now := p_from at time zone 'America/Bogota';

  -- El proximo dia de la semana pedido, contando hoy.
  v_candidate :=
    (v_local_now::date + ((p_weekday - extract(isodow from v_local_now)::int + 7) % 7)) + p_time;

  -- Estrictamente posterior: si el instante es exactamente ahora, ya paso.
  if v_candidate <= v_local_now then
    v_candidate := v_candidate + interval '7 days';
  end if;

  return v_candidate at time zone 'America/Bogota';
end;
$$;

comment on function next_reminder_run_at(smallint, time, timestamptz) is
  'BR-S03: proximo instante UTC en que son p_time de un p_weekday (ISO 1..7) en America/Bogota, estrictamente posterior a p_from.';

-- =============================================================================
-- 5. Los dos triggers del recordatorio
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.a El reloj se recalcula SOLO cuando cambia el horario o se reactiva.
--
-- Es la mitad importante: la etapa 3 avanzara `next_run_at` a la semana
-- siguiente al procesar, y un trigger que recalculara en CADA update pisaria ese
-- avance y dejaria el recordatorio disparando en bucle.
-- -----------------------------------------------------------------------------
create function reminders_sync_next_run()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT'
     or new.weekday is distinct from old.weekday
     or new.time_of_day is distinct from old.time_of_day
     or (new.status = 'active' and old.status <> 'active') then
    new.next_run_at := next_reminder_run_at(new.weekday, new.time_of_day);
  end if;
  return new;
end;
$$;

create trigger seller_payment_reminders_sync_next_run
  before insert or update on seller_payment_reminders
  for each row execute function reminders_sync_next_run();

-- -----------------------------------------------------------------------------
-- 5.b El tope de 14 activos (BR-S05)
--
-- Aqui SI hace falta contar, porque un recordatorio no ocupa una posicion como
-- una cuenta: pausarlo y reactivarlo tiene que devolverlo tal cual, y un
-- «slot» del 1 al 14 seria un concepto inventado que nadie ve en pantalla.
--
-- Contar abre una condicion de carrera —dos peticiones simultaneas contando 13
-- y guardando las dos—, asi que el trigger toma antes un cerrojo de aviso por
-- VENDEDOR. Serializa solo a esa persona consigo misma, dura lo que la
-- transaccion y no bloquea a nadie mas. Va en el trigger y no en la RPC a
-- proposito: asi lo cumple cualquier camino de escritura, no solo el previsto.
--
-- Un pausado NO cuenta, y reactivar vuelve a comprobar: si no, bastaria con
-- pausar, crear y reactivar para saltarse el tope.
-- -----------------------------------------------------------------------------
create function max_active_payment_reminders()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select 14
$$;

comment on function max_active_payment_reminders() is
  'BR-S05: tope de recordatorios activos por vendedor. Vive en un solo sitio; subirlo es una migracion.';

create function reminders_enforce_active_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_limit integer := max_active_payment_reminders();
  v_count integer;
begin
  -- Solo interesa el paso A activo. Editar uno que ya estaba activo no cambia
  -- el recuento, y pausarlo o archivarlo solo puede bajarlo.
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('payment_reminders:' || new.seller_id::text));

  select count(*) into v_count
  from seller_payment_reminders r
  where r.seller_id = new.seller_id
    and r.status = 'active'
    and r.id <> new.id;

  if v_count >= v_limit then
    raise exception 'Ya tienes % recordatorios activos, que es el máximo. Pausa o archiva uno para crear otro.', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger seller_payment_reminders_active_limit
  before insert or update on seller_payment_reminders
  for each row execute function reminders_enforce_active_limit();

-- =============================================================================
-- 6. RLS: cada vendedor ve SOLO lo suyo, y nadie mas ve nada
--
-- Este es el aislamiento mas estrecho del producto. No es «por organizacion»,
-- ni «por vendedor y su cadena de mando»: es POR VENDEDOR. Ni el Dueno, ni el
-- Administrador, ni el vendedor padre del equipo.
--
-- HAY POLITICA DE SELECT Y NO HAY MAS. Ni INSERT, ni UPDATE, ni DELETE: toda
-- escritura pasa por las RPC de mas abajo, que corren con el dueno de la tabla
-- y por tanto omiten RLS. Es lo que hace que el tope, el orden, la coherencia y
-- la bitacora sean inevitables en vez de ser cosas que la pantalla se acuerda
-- de hacer. `authenticated` recibe SELECT y nada mas, asi que ni siquiera hace
-- falta confiar en que falte la politica.
-- =============================================================================
alter table seller_payment_accounts  enable row level security;
alter table seller_payment_accounts  force  row level security;
alter table seller_payment_reminders enable row level security;
alter table seller_payment_reminders force  row level security;

create policy seller_payment_accounts_select on seller_payment_accounts
  for select to authenticated
  using (seller_id = (select current_profile_id()));

create policy seller_payment_reminders_select on seller_payment_reminders
  for select to authenticated
  using (seller_id = (select current_profile_id()));

-- `select current_profile_id()` entre parentesis, no la llamada suelta: es lo
-- que hace que se evalue UNA vez por consulta y no una por fila (I-019, D-063).

grant select on seller_payment_accounts  to authenticated;
grant select on seller_payment_reminders to authenticated;
grant all    on seller_payment_accounts  to service_role;
grant all    on seller_payment_reminders to service_role;

-- =============================================================================
-- 7. require_seller_org — quien llama y si puede
--
-- Se extrae porque las nueve RPC de abajo empiezan igual, y repetir nueve veces
-- una comprobacion de permisos es repetir nueve veces la oportunidad de
-- escribirla mal una.
--
-- `has_org_role(org, seller)` comprueba de una vez el rol Y que la membresia, el
-- perfil y la organizacion sigan activos (BR-A04): una cuenta desactivada no
-- configura nada.
-- =============================================================================
create function require_seller_org()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_auth();
  v_org uuid;
begin
  select m.organization_id into v_org
  from memberships m
  where m.profile_id = v_uid
    and m.role = 'seller'
    and m.is_active
  limit 1;

  if v_org is null or not has_org_role(v_org, array['seller']::app_role[]) then
    raise exception 'Solo un vendedor puede administrar sus cuentas y sus recordatorios.'
      using errcode = 'insufficient_privilege';
  end if;

  return v_org;
end;
$$;

comment on function require_seller_org() is
  'Organizacion de la membresia de vendedor ACTIVA de quien llama, o excepcion. Interna: no la ejecuta ninguna sesion.';

-- =============================================================================
-- 8. Las cuentas: cuatro RPC
--
-- NINGUNA RECIBE IDENTIFICADOR DE VENDEDOR. El perfil sale de `auth.uid()`, asi
-- que no existe el dato que alguien pudiera manipular para configurar a otro
-- (BR-M02). Es lo mismo que hace `set_seller_whatsapp_settings` y, como alli, lo
-- que las hace seguras no es una comprobacion: es la FIRMA.
--
-- LA BITACORA NO GUARDA EL NUMERO. `audit_logs` lo consulta el personal entero
-- (BR-D04), asi que volcar ahi la cuenta bancaria desharia el aislamiento por la
-- puerta de atras. Se anota QUE cambio —el tipo, la etiqueta, los nombres de los
-- campos tocados—, nunca el valor.
-- =============================================================================

create function create_seller_payment_account(
  p_kind           payment_account_kind,
  p_holder_name    text,
  p_phone          text default null,
  p_bank_name      text default null,
  p_account_type   bank_account_type default null,
  p_account_number text default null,
  p_label          text default null
)
returns seller_payment_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_org    uuid := require_seller_org();
  v_slot   smallint;
  v_row    seller_payment_accounts;
  v_holder text := nullif(btrim(coalesce(p_holder_name, '')), '');
  v_phone  text := nullif(btrim(coalesce(p_phone, '')), '');
  v_bank   text := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_number text := nullif(btrim(coalesce(p_account_number, '')), '');
  v_label  text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if v_holder is null then
    raise exception 'Escribe el nombre del titular de la cuenta.'
      using errcode = 'check_violation';
  end if;

  -- La menor posicion libre. Devuelve NULL cuando las cinco estan ocupadas, y
  -- entonces se dice con una frase en vez de dejar que salte el constraint.
  select min(s)::smallint into v_slot
  from generate_series(1, 5) s
  where not exists (
    select 1 from seller_payment_accounts a
    where a.seller_id = v_uid and a.sort_order = s
  );

  if v_slot is null then
    raise exception 'Ya tienes 5 cuentas activas, que es el máximo. Archiva una para agregar otra.'
      using errcode = 'check_violation';
  end if;

  insert into seller_payment_accounts (
    organization_id, seller_id, kind, holder_name,
    phone, bank_name, account_type, account_number, label, sort_order
  )
  values (
    v_org, v_uid, p_kind, v_holder,
    v_phone, v_bank, p_account_type, v_number, v_label, v_slot
  )
  returning * into v_row;

  perform write_audit_log(
    v_org, 'payment_account.create', 'payment_account', v_row.id,
    null,
    jsonb_build_object('kind', p_kind::text, 'label', v_label, 'sort_order', v_slot)
  );

  return v_row;
end;
$$;

comment on function create_seller_payment_account(payment_account_kind, text, text, text, bank_account_type, text, text) is
  'BR-M02/BR-M04/BR-M06: crea una cuenta del vendedor que llama. No recibe identificador de vendedor. La bitacora NO guarda el numero.';

create function update_seller_payment_account(
  p_id             uuid,
  p_holder_name    text,
  p_phone          text default null,
  p_bank_name      text default null,
  p_account_type   bank_account_type default null,
  p_account_number text default null,
  p_label          text default null
)
returns seller_payment_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_org    uuid := require_seller_org();
  v_row    seller_payment_accounts;
  v_holder text := nullif(btrim(coalesce(p_holder_name, '')), '');
  v_phone  text := nullif(btrim(coalesce(p_phone, '')), '');
  v_bank   text := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_number text := nullif(btrim(coalesce(p_account_number, '')), '');
  v_label  text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if v_holder is null then
    raise exception 'Escribe el nombre del titular de la cuenta.'
      using errcode = 'check_violation';
  end if;

  -- El tipo NO se puede cambiar: un Nequi que pasa a ser una cuenta bancaria es
  -- otra cuenta, y dejarlo cambiar obligaria a vaciar y rellenar cuatro campos
  -- en la misma operacion. Se archiva y se crea la nueva.
  update seller_payment_accounts a
     set holder_name    = v_holder,
         phone          = v_phone,
         bank_name      = v_bank,
         account_type   = p_account_type,
         account_number = v_number,
         label          = v_label
   where a.id = p_id
     and a.seller_id = v_uid
     and a.archived_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Esa cuenta no existe o ya no está activa.'
      using errcode = 'insufficient_privilege';
  end if;

  perform write_audit_log(
    v_org, 'payment_account.update', 'payment_account', v_row.id,
    null,
    jsonb_build_object('kind', v_row.kind::text, 'label', v_label)
  );

  return v_row;
end;
$$;

comment on function update_seller_payment_account(uuid, text, text, text, bank_account_type, text, text) is
  'BR-M02: corrige una cuenta ACTIVA del vendedor que llama. El tipo no se cambia: se archiva y se crea otra.';

create function archive_seller_payment_account(p_id uuid)
returns seller_payment_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_auth();
  v_org uuid := require_seller_org();
  v_row seller_payment_accounts;
begin
  -- Archivar libera la posicion, que es lo que hace que deje de consumir cupo
  -- y lo que la saca del mensaje (BR-M07).
  update seller_payment_accounts a
     set archived_at = now(),
         sort_order  = null
   where a.id = p_id
     and a.seller_id = v_uid
     and a.archived_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Esa cuenta no existe o ya está archivada.'
      using errcode = 'insufficient_privilege';
  end if;

  perform write_audit_log(
    v_org, 'payment_account.archive', 'payment_account', v_row.id,
    null,
    jsonb_build_object('kind', v_row.kind::text)
  );

  return v_row;
end;
$$;

comment on function archive_seller_payment_account(uuid) is
  'BR-M07: archiva una cuenta del vendedor que llama y libera su posicion. No hay borrado (D-038).';

create function restore_seller_payment_account(p_id uuid)
returns seller_payment_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := require_auth();
  v_org  uuid := require_seller_org();
  v_slot smallint;
  v_row  seller_payment_accounts;
begin
  select min(s)::smallint into v_slot
  from generate_series(1, 5) s
  where not exists (
    select 1 from seller_payment_accounts a
    where a.seller_id = v_uid and a.sort_order = s
  );

  if v_slot is null then
    raise exception 'Ya tienes 5 cuentas activas, que es el máximo. Archiva una para recuperar esta.'
      using errcode = 'check_violation';
  end if;

  update seller_payment_accounts a
     set archived_at = null,
         sort_order  = v_slot
   where a.id = p_id
     and a.seller_id = v_uid
     and a.archived_at is not null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Esa cuenta no existe o ya está activa.'
      using errcode = 'insufficient_privilege';
  end if;

  perform write_audit_log(
    v_org, 'payment_account.restore', 'payment_account', v_row.id,
    null,
    jsonb_build_object('kind', v_row.kind::text, 'sort_order', v_slot)
  );

  return v_row;
end;
$$;

comment on function restore_seller_payment_account(uuid) is
  'BR-M07: devuelve al listado una cuenta archivada, sujeta al tope de cinco.';

create function reorder_seller_payment_accounts(p_ids uuid[])
returns setof seller_payment_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := require_auth();
  v_org    uuid := require_seller_org();
  v_active integer;
begin
  select count(*) into v_active
  from seller_payment_accounts a
  where a.seller_id = v_uid and a.archived_at is null;

  -- El conjunto tiene que ser EXACTAMENTE el de sus cuentas activas. Aceptar un
  -- subconjunto dejaria huecos y aceptar un id ajeno seria tocar lo de otro:
  -- las dos cosas se rechazan comparando cardinalidades, que es lo mismo que
  -- comparar los conjuntos cuando la RPC ya filtra por `seller_id`.
  if p_ids is null
     or array_length(p_ids, 1) is distinct from v_active
     or v_active <> (
       select count(*) from seller_payment_accounts a
       where a.seller_id = v_uid and a.archived_at is null and a.id = any (p_ids)
     )
     or v_active <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'El orden que enviaste no corresponde a tus cuentas activas.'
      using errcode = 'check_violation';
  end if;

  -- Una sola sentencia. Funciona porque el constraint de posicion es
  -- DEFERRABLE: el estado intermedio con dos filas compartiendo sitio existe,
  -- pero se comprueba al COMMIT, cuando ya no existe.
  update seller_payment_accounts a
     set sort_order = nuevo.orden
    from (select id, row_number() over ()::smallint as orden
            from unnest(p_ids) as id) as nuevo
   where a.id = nuevo.id
     and a.seller_id = v_uid;

  perform write_audit_log(
    v_org, 'payment_account.reorder', 'payment_account', null,
    null,
    jsonb_build_object('count', v_active)
  );

  return query
    select * from seller_payment_accounts a
    where a.seller_id = v_uid and a.archived_at is null
    order by a.sort_order;
end;
$$;

comment on function reorder_seller_payment_accounts(uuid[]) is
  'BR-M05: reordena las cuentas ACTIVAS del vendedor que llama. Exige el conjunto completo, sin repetidos y sin ajenos.';

-- =============================================================================
-- 9. Los recordatorios: tres RPC
-- =============================================================================

create function create_payment_reminder(
  p_weekday            smallint,
  p_time_of_day        time,
  p_use_custom_message boolean default false,
  p_custom_message     text default null
)
returns seller_payment_reminders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_org     uuid := require_seller_org();
  v_row     seller_payment_reminders;
  v_message text := nullif(btrim(coalesce(p_custom_message, '')), '');
  v_use     boolean := coalesce(p_use_custom_message, false);
begin
  -- El interruptor sin texto se rechaza AQUI y con una frase que se puede leer,
  -- en vez de dejar que salte el CHECK con su nombre de restriccion.
  if v_use and v_message is null then
    raise exception 'Escribe tu mensaje o vuelve a usar el mensaje predeterminado.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from seller_payment_reminders r
    where r.seller_id = v_uid
      and r.weekday = p_weekday
      and r.time_of_day = p_time_of_day
      and r.status <> 'archived'
  ) then
    raise exception 'Ya tienes un recordatorio ese día a esa hora.'
      using errcode = 'check_violation';
  end if;

  insert into seller_payment_reminders (
    organization_id, seller_id, weekday, time_of_day,
    use_custom_message, custom_message
  )
  values (v_org, v_uid, p_weekday, p_time_of_day, v_use, v_message)
  returning * into v_row;

  -- La bitacora guarda el horario, que no es sensible, y NO el mensaje: es
  -- prosa personal y `audit_logs` lo lee el personal entero (BR-D04).
  perform write_audit_log(
    v_org, 'payment_reminder.create', 'payment_reminder', v_row.id,
    null,
    jsonb_build_object(
      'weekday', p_weekday,
      'time_of_day', p_time_of_day::text,
      'use_custom_message', v_use
    )
  );

  return v_row;
end;
$$;

comment on function create_payment_reminder(smallint, time, boolean, text) is
  'BR-S01..BR-S06: crea un recordatorio del vendedor que llama. No recibe identificador de vendedor.';

create function update_payment_reminder(
  p_id                 uuid,
  p_weekday            smallint,
  p_time_of_day        time,
  p_use_custom_message boolean default false,
  p_custom_message     text default null
)
returns seller_payment_reminders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_org     uuid := require_seller_org();
  v_row     seller_payment_reminders;
  v_message text := nullif(btrim(coalesce(p_custom_message, '')), '');
  v_use     boolean := coalesce(p_use_custom_message, false);
begin
  if v_use and v_message is null then
    raise exception 'Escribe tu mensaje o vuelve a usar el mensaje predeterminado.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from seller_payment_reminders r
    where r.seller_id = v_uid
      and r.weekday = p_weekday
      and r.time_of_day = p_time_of_day
      and r.status <> 'archived'
      and r.id <> p_id
  ) then
    raise exception 'Ya tienes un recordatorio ese día a esa hora.'
      using errcode = 'check_violation';
  end if;

  update seller_payment_reminders r
     set weekday            = p_weekday,
         time_of_day        = p_time_of_day,
         use_custom_message = v_use,
         -- Apagar el interruptor NO borra lo escrito (BR-S06, como BR-W03).
         custom_message     = v_message
   where r.id = p_id
     and r.seller_id = v_uid
     and r.status <> 'archived'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Ese recordatorio no existe o está archivado.'
      using errcode = 'insufficient_privilege';
  end if;

  perform write_audit_log(
    v_org, 'payment_reminder.update', 'payment_reminder', v_row.id,
    null,
    jsonb_build_object(
      'weekday', p_weekday,
      'time_of_day', p_time_of_day::text,
      'use_custom_message', v_use
    )
  );

  return v_row;
end;
$$;

comment on function update_payment_reminder(uuid, smallint, time, boolean, text) is
  'BR-S02/BR-S06: corrige un recordatorio no archivado del vendedor que llama. El trigger recalcula next_run_at si cambio el horario.';

create function set_payment_reminder_status(
  p_id     uuid,
  p_status payment_reminder_status
)
returns seller_payment_reminders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_auth();
  v_org uuid := require_seller_org();
  v_row seller_payment_reminders;
begin
  -- Reactivar puede chocar con otro recordatorio a la misma hora que se creo
  -- mientras este estaba pausado o archivado. Se dice con una frase antes de
  -- que lo diga el indice unico.
  if p_status = 'active' and exists (
    select 1
    from seller_payment_reminders r
    join seller_payment_reminders mio on mio.id = p_id and mio.seller_id = v_uid
    where r.seller_id = v_uid
      and r.id <> p_id
      and r.status <> 'archived'
      and r.weekday = mio.weekday
      and r.time_of_day = mio.time_of_day
  ) then
    raise exception 'Ya tienes otro recordatorio ese día a esa hora.'
      using errcode = 'check_violation';
  end if;

  update seller_payment_reminders r
     set status = p_status
   where r.id = p_id
     and r.seller_id = v_uid
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Ese recordatorio no existe.'
      using errcode = 'insufficient_privilege';
  end if;

  perform write_audit_log(
    v_org, 'payment_reminder.status', 'payment_reminder', v_row.id,
    null,
    jsonb_build_object('status', p_status::text)
  );

  return v_row;
end;
$$;

comment on function set_payment_reminder_status(uuid, payment_reminder_status) is
  'BR-S04/BR-S05: activa, pausa o archiva un recordatorio del vendedor que llama. Reactivar vuelve a comprobar el tope.';

-- =============================================================================
-- 10. Privilegios de las funciones
--
-- Regla 2 de docs/SECURITY.md 4.5, y la trampa de siempre: PostgreSQL concede
-- EXECUTE a PUBLIC en CADA funcion nueva, y las default privileges de 0015 y
-- 0032 no alcanzan a lo que se cree despues (I-020, I-078). Por eso se revoca
-- explicitamente y se concede por nombre.
--
-- `service_role` se nombra a proposito: en produccion lo hereda del privilegio
-- por defecto y en local NO (D-128), y esa divergencia es exactamente la que
-- costo I-078 y obligo a la 0044.
--
-- Las DOS internas —`require_seller_org` y las de trigger— no reciben nada:
-- `authenticated` no tiene por que poder invocarlas, y una funcion de trigger
-- ni siquiera necesita EXECUTE (el permiso se comprueba sobre la TABLA).
-- =============================================================================
revoke execute on function next_reminder_run_at(smallint, time, timestamptz) from public, anon;
revoke execute on function max_active_payment_reminders() from public, anon;
revoke execute on function require_seller_org() from public, anon;
revoke execute on function reminders_sync_next_run() from public, anon;
revoke execute on function reminders_enforce_active_limit() from public, anon;

revoke execute on function create_seller_payment_account(payment_account_kind, text, text, text, bank_account_type, text, text) from public, anon;
revoke execute on function update_seller_payment_account(uuid, text, text, text, bank_account_type, text, text) from public, anon;
revoke execute on function archive_seller_payment_account(uuid) from public, anon;
revoke execute on function restore_seller_payment_account(uuid) from public, anon;
revoke execute on function reorder_seller_payment_accounts(uuid[]) from public, anon;
revoke execute on function create_payment_reminder(smallint, time, boolean, text) from public, anon;
revoke execute on function update_payment_reminder(uuid, smallint, time, boolean, text) from public, anon;
revoke execute on function set_payment_reminder_status(uuid, payment_reminder_status) from public, anon;

grant execute on function create_seller_payment_account(payment_account_kind, text, text, text, bank_account_type, text, text) to authenticated, service_role;
grant execute on function update_seller_payment_account(uuid, text, text, text, bank_account_type, text, text) to authenticated, service_role;
grant execute on function archive_seller_payment_account(uuid) to authenticated, service_role;
grant execute on function restore_seller_payment_account(uuid) to authenticated, service_role;
grant execute on function reorder_seller_payment_accounts(uuid[]) to authenticated, service_role;
grant execute on function create_payment_reminder(smallint, time, boolean, text) to authenticated, service_role;
grant execute on function update_payment_reminder(uuid, smallint, time, boolean, text) to authenticated, service_role;
grant execute on function set_payment_reminder_status(uuid, payment_reminder_status) to authenticated, service_role;

-- Las internas solo las necesita el proceso de servidor y la propia base.
grant execute on function next_reminder_run_at(smallint, time, timestamptz) to service_role;
grant execute on function max_active_payment_reminders() to service_role;
grant execute on function require_seller_org() to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function set_payment_reminder_status(uuid, payment_reminder_status);
-- drop function update_payment_reminder(uuid, smallint, time, boolean, text);
-- drop function create_payment_reminder(smallint, time, boolean, text);
-- drop function reorder_seller_payment_accounts(uuid[]);
-- drop function restore_seller_payment_account(uuid);
-- drop function archive_seller_payment_account(uuid);
-- drop function update_seller_payment_account(uuid, text, text, text, bank_account_type, text, text);
-- drop function create_seller_payment_account(payment_account_kind, text, text, text, bank_account_type, text, text);
-- drop function require_seller_org();
-- drop table seller_payment_reminders;   -- se lleva sus dos triggers
-- drop function reminders_enforce_active_limit();
-- drop function reminders_sync_next_run();
-- drop function max_active_payment_reminders();
-- drop function next_reminder_run_at(smallint, time, timestamptz);
-- drop table seller_payment_accounts;
-- drop type payment_reminder_status;
-- drop type bank_account_type;
-- drop type payment_account_kind;
--
-- Revertir borra la configuracion de cobro de cada vendedor. No toca ningun
-- dato de negocio: ni una boleta, ni un pago, ni un cliente.
-- =============================================================================
