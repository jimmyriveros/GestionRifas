-- =============================================================================
-- 0056_seller_weekly_results_message.sql
-- Mensaje propio de «Resultados de la semana»
--
-- Referencia: docs/BUSINESS_RULES.md BR-H06, BR-H08..BR-H10,
-- docs/DECISIONS.md D-197 (corrige D-194, Decision 6).
--
-- QUE ES
--
-- «Resultados de la semana» (D-194) prepara la imagen de los numeros mayores y
-- el mensaje que la acompana en el grupo de WhatsApp del vendedor. Hasta hoy el
-- mensaje era siempre el predeterminado, escrito en la aplicacion. Desde esta
-- migracion cada vendedor puede usar uno propio, y lo UNICO que la base guarda es
-- eso: si lo usa y que escribio.
--
-- LO QUE NO ES: no se guarda ninguna imagen, ningun resultado semanal, ningun
-- PNG ni ningun mensaje ya compuesto. No hay tarea programada, ni IA, ni costo
-- recurrente, ni integracion con WhatsApp (BR-H08, BR-W08). La imagen se sigue
-- componiendo cada vez que se pide.
--
-- POR QUE DOS COLUMNAS EN `memberships` Y NO UNA TABLA
--
-- Es UNA configuracion por vendedor, pequena y del mismo tipo que
-- `whatsapp_use_custom_message` (0050): un interruptor y el texto que el vendedor
-- pega en SU grupo. No es una coleccion operativa como las cuentas o los
-- recordatorios de la 0051, que tienen varias filas por vendedor, tope, orden y
-- estados, y por eso viven en tablas propias. Y un vendedor no es una entidad
-- propia en este esquema: es una `membership` con rol `seller` (0043, 0050). Una
-- tabla `seller_settings` crearia una segunda entidad de vendedor y la pregunta
-- de cual de las dos manda cuando discrepen.
--
-- QUIEN PUEDE LEERLO, DICHO SIN ADORNOS. `memberships_select` no cambia: la fila
-- la ven su dueno, el personal de su organizacion y su vendedor padre. Es el
-- mismo alcance que ya tienen el enlace del grupo y el mensaje de invitacion, y
-- es aceptable por lo mismo: es un texto que el vendedor escribe para publicarlo
-- en un grupo con todos sus clientes. Algo mas privado necesitaria una tabla con
-- politica propia (BR-M01), no una columna.
--
-- POR QUE EL MENSAJE PREDETERMINADO NO ESTA AQUI
--
-- Vive en la aplicacion (`weeklyResultsMessage`, features/weekly-results/copy.ts)
-- y lleva la semana dentro: guardarlo seria congelar una fecha. Quien no usa uno
-- propio recibe cada semana la suya y cualquier mejora de la redaccion sin que
-- nadie toque la base. Es el razonamiento de BR-W02, aplicado a este mensaje.
--
-- LA MIGRACION ES ADITIVA. `add column ... default false` con una constante no
-- reescribe la tabla y no dispara `audit_memberships` —un disparador de fila no
-- corre por un cambio de esquema—: las membresias existentes quedan usando el
-- predeterminado SIN un solo UPDATE. No toca ninguna politica, ni
-- `memberships_update_staff`, ni ninguna funcion existente.
--
-- SOBRE LAS TILDES DE LOS MENSAJES. Las frases NUEVAS van acentuadas. La deuda
-- general de tildes en la base de datos es I-030 y no se arregla aqui.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las dos columnas
--
-- Nacen `false` y NULL: aplicar la migracion no cambia el mensaje de nadie.
--
-- Sin indice, a proposito: no hay busqueda, ni filtro, ni orden por estos
-- campos. Se leen SIEMPRE por `profile_id`, que ya es la clave.
-- -----------------------------------------------------------------------------
alter table memberships
  add column weekly_results_use_custom_message boolean not null default false,
  add column weekly_results_custom_message     text;

comment on column memberships.weekly_results_use_custom_message is
  'BR-H09: false = «Resultados de la semana» usa el mensaje predeterminado. Ese texto NO se guarda aqui: vive en features/weekly-results/copy.ts y lleva la semana dentro.';

comment on column memberships.weekly_results_custom_message is
  'BR-H09: el mensaje propio del vendedor, recortado y sin marcadores. Se usa literalmente: sus fechas no se actualizan solas. Se conserva aunque el interruptor este apagado; NULL si nunca escribio uno o lo vacio a proposito.';

-- -----------------------------------------------------------------------------
-- 2. Coherencia entre el interruptor y el texto
--
-- Usar mensaje propio SIN texto no es un estado: seria un vendedor que comparte
-- una imagen con un mensaje vacio. El CHECK lo hace imposible venga la escritura
-- por donde venga, tambien con la service role.
--
-- El camino contrario SI se permite y es deliberado: `use_custom = false` con un
-- texto guardado es alguien que escribio su mensaje y ahora prefiere el
-- predeterminado. Apagar el interruptor NO le borra lo que escribio, para que
-- volver a encenderlo se lo devuelva tal cual.
--
-- El tope de 1.000 caracteres es el mismo del mensaje de invitacion (0050) y de
-- los recordatorios (0051): un mensaje, no un documento.
-- -----------------------------------------------------------------------------
alter table memberships add constraint memberships_weekly_results_message_coherent check (
  not weekly_results_use_custom_message
  or (weekly_results_custom_message is not null and btrim(weekly_results_custom_message) <> '')
);

alter table memberships add constraint memberships_weekly_results_message_length check (
  weekly_results_custom_message is null
  or length(weekly_results_custom_message) <= 1000
);

-- =============================================================================
-- 3. set_seller_weekly_results_message — el vendedor guarda SU mensaje
--
-- ES `set_seller_whatsapp_settings` (0050) PARA OTRAS DOS COLUMNAS, y a proposito
-- no es la misma funcion: el grupo de WhatsApp y el mensaje de los resultados son
-- dominios distintos, y guardar uno no puede pisar el otro.
--
-- POR QUE UNA RPC Y NO UN UPDATE
--
-- `memberships_update_staff` (0005/0014) es la UNICA politica de escritura sobre
-- esta tabla y solo deja pasar al personal. Esa politica NO se amplia: abriria
-- la fila entera —`role`, `is_active`, `parent_seller_id`, `commission_model`,
-- `fixed_commission_amount`, las `public_*` y las `whatsapp_*`— a quien solo
-- tenia que guardar un texto. Esta funcion escribe DOS columnas de la fila de
-- quien llama y no hay forma de pedirle otra cosa.
--
-- QUIEN PUEDE: SOLO UN VENDEDOR ACTIVO, Y SOLO SOBRE SI MISMO
--
-- No hay parametro de vendedor, ni de perfil, ni de organizacion, ni de
-- membresia. El vendedor sale de `auth.uid()`, asi que no existe el dato que
-- alguien pudiera manipular para escribir el mensaje de otro. Un vendedor padre
-- tampoco alcanza a un integrante de su equipo: el mensaje es de quien lo pega en
-- su grupo. El personal tampoco: `has_org_role(org, seller)` comprueba de una vez
-- el rol y que la membresia, el perfil y la organizacion sigan activos (BR-A04).
--
-- LA AUDITORIA YA ESTA
--
-- `audit_memberships` (0006) anota cualquier UPDATE de esta tabla con los campos
-- que cambiaron, sus valores anterior y nuevo, y quien lo hizo. No se llama a
-- `write_audit_log` aqui: seria una segunda fila describiendo el mismo hecho. Y
-- guardar lo mismo dos veces no anota nada la segunda: ese disparador descarta
-- un UPDATE sin cambios.
--
-- NORMALIZACION
--
-- El texto se recorta (`btrim`) y, si queda vacio, se guarda NULL: una cadena de
-- espacios no es un mensaje. La coherencia y la longitud se repiten ANTES de que
-- salten los CHECK, para dar una frase legible en vez del nombre de una
-- restriccion; los CHECK son los que mandan.
--
-- SI YA ESTA COMO SE PIDE, SE ESCRIBE IGUAL, como en la 0050: guardar es un acto
-- explicito de un formulario.
-- =============================================================================

create function set_seller_weekly_results_message(
  p_use_custom_message boolean,
  p_custom_message     text default null
)
returns table (
  weekly_results_use_custom_message boolean,
  weekly_results_custom_message     text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_org     uuid;
  v_message text := nullif(btrim(coalesce(p_custom_message, '')), '');
  v_use     boolean := coalesce(p_use_custom_message, false);
begin
  -- La membresia de vendedor ACTIVA de quien llama. Si no la tiene —es
  -- personal, o su cuenta esta inactiva— no hay mensaje que configurar.
  select m.organization_id into v_org
  from memberships m
  where m.profile_id = v_uid
    and m.role = 'seller'
    and m.is_active
  limit 1;

  if v_org is null or not has_org_role(v_org, array['seller']::app_role[]) then
    raise exception 'Solo un vendedor puede configurar el mensaje de «Resultados de la semana».'
      using errcode = 'insufficient_privilege';
  end if;

  -- El interruptor sin texto se rechaza AQUI y con la misma frase que la
  -- pantalla, en vez de dejar que salte el CHECK con su nombre tecnico.
  if v_use and v_message is null then
    raise exception 'Escribe tu mensaje o vuelve a usar el mensaje predeterminado.'
      using errcode = 'check_violation';
  end if;

  if v_message is not null and length(v_message) > 1000 then
    raise exception 'El mensaje no puede superar 1.000 caracteres.'
      using errcode = 'check_violation';
  end if;

  return query
  update memberships m
     set weekly_results_use_custom_message = v_use,
         -- Apagar el interruptor NO borra lo escrito: se conserva para que
         -- volver a encenderlo lo devuelva. Lo unico que lo borra es que la
         -- persona vacie el texto a proposito.
         weekly_results_custom_message     = v_message
   where m.profile_id = v_uid
     and m.role = 'seller'
  returning m.weekly_results_use_custom_message, m.weekly_results_custom_message;
end;
$$;

comment on function set_seller_weekly_results_message(boolean, text) is
  'Guarda el mensaje propio de «Resultados de la semana» del vendedor que llama. No recibe identificador de vendedor, perfil, organizacion ni membresia: sale de auth.uid(), asi que nadie puede configurar a otro. Solo escribe dos columnas de su propia membresia. BR-H09, BR-H10, D-197.';

-- Regla 2 de docs/SECURITY.md 4.5. `service_role` se nombra a proposito: en
-- produccion lo hereda del privilegio por defecto y en local NO (D-128), y esa
-- divergencia es la que costo I-078.
revoke execute on function set_seller_weekly_results_message(boolean, text) from public, anon;
grant  execute on function set_seller_weekly_results_message(boolean, text) to authenticated;
grant  execute on function set_seller_weekly_results_message(boolean, text) to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function set_seller_weekly_results_message(boolean, text);
-- alter table memberships
--   drop constraint memberships_weekly_results_message_length,
--   drop constraint memberships_weekly_results_message_coherent,
--   drop column weekly_results_custom_message,
--   drop column weekly_results_use_custom_message;
-- =============================================================================
