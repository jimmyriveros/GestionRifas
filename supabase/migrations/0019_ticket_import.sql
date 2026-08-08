-- =============================================================================
-- 0019_ticket_import.sql
-- Importar boletas desde un archivo: comprobacion previa y bitacora
--
-- Referencia normativa: docs/BUSINESS_RULES.md BR-N12, docs/DECISIONS.md D-081.
--
-- El importador NO trae reglas nuevas de boletas: valida con las mismas de
-- siempre y guarda con `bulk_create_tickets` (personal) o con el `insert`
-- sujeto a `tickets_insert_seller` (vendedor). Esta migracion solo aporta las
-- dos piezas que la aplicacion no puede resolver por su cuenta.
--
-- 1. QUE COMBINACIONES YA ESTAN TOMADAS, TAMBIEN PARA UN VENDEDOR
--
-- La vista previa tiene que decir «esta combinacion ya existe» ANTES de
-- guardar. Para el personal basta una consulta normal, pero un vendedor no ve
-- las boletas de otros (`tickets_select`, BR-U07): preguntando por su cuenta
-- obtendria «disponible» para una combinacion que en realidad esta tomada, y se
-- llevaria la sorpresa al confirmar.
--
-- `taken_ticket_combinations` responde exactamente esa pregunta y nada mas:
-- devuelve, de la lista que se le pasa, cuales ya existen. No dice de quien
-- son, ni en que estado estan, ni cuando se crearon. Es lo mismo que el
-- vendedor averiguaria de todas formas al chocar contra la restriccion unica al
-- guardar; la diferencia es que ahora lo sabe antes y sin gastar el intento.
--
-- Es `security definer` justamente por eso: tiene que mirar por encima de la
-- RLS del vendedor para poder ocultar el detalle en vez de ocultar la fila.
-- Comprueba que quien llama pertenece a la organizacion de la rifa, de modo que
-- no sirve para husmear rifas ajenas.
--
-- La salida esta acotada por la ENTRADA (como mucho, tantas filas como
-- combinaciones se pregunten), no por el tamaño de la rifa: una rifa con 50.000
-- boletas responde igual de rapido, y no hay forma de vaciarla con esto.
--
-- 2. LA IMPORTACION EN LA BITACORA
--
-- `audit_logs` ya registra cada boleta creada (`ticket.create`, trigger de
-- 0006), asi que el QUE quedaba cubierto. Lo que no existia es el hecho
-- administrativo: quien importo, cuando, en que rifa, para que vendedor, cuantas
-- mando, cuantas entraron y desde que tipo de archivo. Eso es una fila, no una
-- tabla nueva: `audit_logs` tiene actor, organizacion, entidad y dos jsonb, que
-- es exactamente lo que hace falta (D-081).
--
-- No se guarda el archivo ni su contenido. Solo el recuento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- taken_ticket_combinations — de esta lista, ¿cuales ya existen?
-- -----------------------------------------------------------------------------
create function taken_ticket_combinations(
  p_raffle_id uuid,
  p_combos    jsonb
)
returns table (
  daily_number  text,
  weekly_number text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  perform require_auth();

  if p_combos is null or jsonb_typeof(p_combos) <> 'array' then
    raise exception 'No se recibio una lista valida de combinaciones.';
  end if;

  if jsonb_array_length(p_combos) > 1000 then
    raise exception 'No se pueden comprobar mas de 1.000 combinaciones a la vez.';
  end if;

  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if not found then
    raise exception 'La rifa no existe o no tienes acceso a ella.';
  end if;

  -- Pertenecer a la organizacion, cualquiera que sea el rol. Un vendedor de
  -- otra empresa no puede preguntar por esta rifa.
  if not (v_org in (select current_org_ids())) then
    raise exception 'No tienes acceso a esta rifa.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select t.daily_number, t.weekly_number
  from tickets t
  join (
    select
      c ->> 'daily_number'  as daily_number,
      c ->> 'weekly_number' as weekly_number
    from jsonb_array_elements(p_combos) as c
  ) pedido
    on pedido.daily_number = t.daily_number
   and pedido.weekly_number = t.weekly_number
  where t.raffle_id = p_raffle_id;
end;
$$;

comment on function taken_ticket_combinations(uuid, jsonb) is
  'De la lista dada, que combinaciones ya existen en la rifa. SECURITY DEFINER para que un vendedor lo sepa sin ver las boletas ajenas: devuelve la combinacion y nada mas (BR-N12, BR-U07).';

-- -----------------------------------------------------------------------------
-- log_ticket_import — una fila de bitacora por importacion
--
-- `entity_type = 'raffle'` y `entity_id = raffle_id`: lo que se importo es un
-- lote dentro de una rifa, y ninguna boleta concreta representa el hecho. Las
-- boletas ya tienen su propio `ticket.create` cada una.
-- -----------------------------------------------------------------------------
create function log_ticket_import(
  p_raffle_id uuid,
  p_seller_id uuid,
  p_source    text,
  p_requested integer,
  p_inserted  integer,
  p_skipped   integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_auth();
  v_org uuid;
begin
  if p_source not in ('csv', 'json') then
    raise exception 'Tipo de archivo no reconocido.';
  end if;

  select r.organization_id into v_org from raffles r where r.id = p_raffle_id;
  if not found then
    raise exception 'La rifa no existe o no tienes acceso a ella.';
  end if;

  -- El personal registra importaciones de su organizacion; un vendedor, solo
  -- las suyas. Nadie puede escribir bitacora a nombre de otro.
  if not (
    is_org_staff(v_org)
    or (p_seller_id = v_uid and v_org in (select current_org_ids()))
  ) then
    raise exception 'No tienes permiso para registrar esta importacion.'
      using errcode = 'insufficient_privilege';
  end if;

  perform write_audit_log(
    v_org,
    'ticket.import',
    'raffle',
    p_raffle_id,
    null,
    jsonb_build_object(
      'source',    p_source,
      'seller_id', p_seller_id,
      'requested', p_requested,
      'inserted',  p_inserted,
      'skipped',   p_skipped
    )
  );
end;
$$;

comment on function log_ticket_import(uuid, uuid, text, integer, integer, integer) is
  'Registra una importacion de boletas en audit_logs (accion ticket.import). No guarda el archivo, solo el recuento (D-081).';

-- -----------------------------------------------------------------------------
-- Privilegios (regla 3 de docs/SECURITY.md 4.5)
--
-- PostgreSQL concede EXECUTE a PUBLIC en toda funcion nueva y las default
-- privileges de 0015 no alcanzan a PUBLIC (I-020): se revoca explicitamente.
-- -----------------------------------------------------------------------------
revoke execute on function taken_ticket_combinations(uuid, jsonb) from public, anon;
revoke execute on function log_ticket_import(uuid, uuid, text, integer, integer, integer) from public, anon;

grant execute on function taken_ticket_combinations(uuid, jsonb) to authenticated;
grant execute on function log_ticket_import(uuid, uuid, text, integer, integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Indices: no hace falta ninguno nuevo.
--
-- La comprobacion cruza por `(raffle_id, daily_number, weekly_number)`, que es
-- justo el orden de `tickets_combo_unique` (0002) salvo por `organization_id`
-- delante; el planificador usa ese indice. Los de 0003 sobre
-- `(organization_id, raffle_id, daily_number)` cubren el resto.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   drop function log_ticket_import(uuid, uuid, text, integer, integer, integer);
--   drop function taken_ticket_combinations(uuid, jsonb);
--
-- Revertir deja la importacion de archivos sin comprobacion previa para el
-- vendedor y sin la fila de bitacora del lote. No afecta a las boletas ya
-- creadas ni a la carga masiva escrita a mano.
-- =============================================================================
