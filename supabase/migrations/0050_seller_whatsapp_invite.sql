-- =============================================================================
-- 0050_seller_whatsapp_invite.sql
-- Invitacion al grupo de WhatsApp del vendedor
--
-- Referencia: docs/BUSINESS_RULES.md BR-W01..BR-W08, docs/DECISIONS.md D-176.
--
-- QUE ES
--
-- Cada vendedor mantiene a sus clientes en un grupo de WhatsApp propio. Hasta
-- hoy, despues de registrar un cliente nuevo tenia que salir de la aplicacion,
-- buscar el numero a mano y pasarle el enlace del grupo. Esta migracion guarda
-- lo unico que la aplicacion no podia saber: CUAL es su grupo y COMO quiere
-- redactar la invitacion.
--
-- LO QUE NO ES: NO hay integracion con WhatsApp. No se envia ningun mensaje, no
-- se consulta ninguna API, no se comprueba si el enlace sigue vivo y no se sabe
-- si el cliente se unio. Lo que se guarda aqui termina siendo un enlace
-- `https://wa.me/...` que abre el vendedor con el mensaje ya escrito, y que el
-- vendedor envia con su propio dedo (BR-W08).
--
-- POR QUE TRES COLUMNAS EN `memberships` Y NO UNA TABLA
--
-- Un vendedor NO es una entidad propia en este esquema: es una `membership` con
-- rol `seller`. Es exactamente el mismo razonamiento que 0043 escribio para el
-- catalogo publico, y la respuesta no cambia porque la configuracion sea otra:
-- una tabla `seller_settings` crearia una SEGUNDA entidad de vendedor y con ella
-- la pregunta de cual de las dos manda cuando discrepen.
--
-- POR QUE EL MENSAJE PREDETERMINADO NO ESTA AQUI
--
-- Vive en la aplicacion (`features/settings/whatsapp-invite.ts`), no en la base
-- de datos. Guardarlo repetido en cada membresia significaria que mejorar la
-- redaccion obligaria a un UPDATE masivo, y que dos vendedores dados de alta en
-- fechas distintas tendrian textos distintos sin haber elegido ninguno.
-- `whatsapp_custom_message` es NULL en quien usa el predeterminado, que es el
-- caso normal.
--
-- LA MIGRACION ES ADITIVA. No toca ninguna tabla, politica, funcion, enum ni
-- restriccion existente. Nadie gana un privilegio sobre `memberships`: la unica
-- escritura nueva ocurre DENTRO de una funcion `SECURITY DEFINER` que solo
-- alcanza la fila de quien llama.
--
-- SOBRE LAS TILDES DE LOS MENSAJES. Las frases NUEVAS van acentuadas. La deuda
-- general de tildes en la base de datos es I-030 y se arregla entera de una vez,
-- no a trozos dentro de una migracion de otra cosa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las tres columnas
--
-- Nacen NULL/false: ninguna membresia existente queda configurada por aplicar
-- esta migracion, y ningun vendedor ve cambiar nada hasta que entre a
-- «Configuración» y guarde su grupo.
--
-- Sin indice, a proposito: no hay busqueda, ni filtro, ni orden por estos
-- campos. Se leen SIEMPRE por `profile_id`, que ya es la clave (DATA_MODEL 5).
-- -----------------------------------------------------------------------------
alter table memberships
  add column whatsapp_group_url          text,
  add column whatsapp_use_custom_message boolean not null default false,
  add column whatsapp_custom_message     text;

comment on column memberships.whatsapp_group_url is
  'BR-W01: enlace de invitacion al grupo de WhatsApp de ESTE vendedor. NULL = todavia no lo configuro. No se comprueba que siga vivo: WhatsApp no ofrece forma de saberlo.';

comment on column memberships.whatsapp_use_custom_message is
  'BR-W03: false = se usa el mensaje predeterminado del sistema. El texto predeterminado NO se guarda aqui: vive en features/settings/whatsapp-invite.ts.';

comment on column memberships.whatsapp_custom_message is
  'BR-W03: la prosa que escribio el vendedor, SIN el enlace del grupo. El enlace lo anade siempre la aplicacion al final (BR-W04), asi que este texto no tiene marcadores que se puedan borrar.';

-- -----------------------------------------------------------------------------
-- 2. La forma del enlace
--
-- Un enlace de invitacion a un grupo es `https://chat.whatsapp.com/<codigo>`.
-- Lo que se comprueba aqui es lo que hace que el enlace PUEDA funcionar: el
-- esquema, el dominio y que haya un codigo detras. Que el grupo exista, que
-- siga abierto o que el vendedor siga siendo administrador NO se puede saber
-- desde aqui —ni desde ningun sitio sin hablar con WhatsApp—, y fingir que se
-- valida seria peor que no validar.
--
-- El codigo no se acota a una longitud exacta a proposito: WhatsApp los ha
-- emitido de largos distintos y un CHECK demasiado estrecho rechazaria manana
-- un enlace legitimo, que es un fallo mucho mas caro que aceptar uno raro.
--
-- Se admite una cola `?` o `#` porque WhatsApp la anade el mismo al compartir
-- («?mode=ac_t»), y quien copia el enlace copia lo que le dieron.
--
-- `https` obligatorio, en minusculas: es lo unico que WhatsApp emite, y aceptar
-- `http` seria guardar un enlace que degrada la conexion de quien lo abra.
-- -----------------------------------------------------------------------------
alter table memberships add constraint memberships_whatsapp_group_url_format check (
  whatsapp_group_url is null
  or whatsapp_group_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{6,64}([?#][^\s]*)?$'
);

-- -----------------------------------------------------------------------------
-- 3. Coherencia entre el interruptor y el texto
--
-- Usar mensaje personalizado SIN texto no es un estado: seria un vendedor cuya
-- invitacion sale vacia. El CHECK lo hace imposible, en vez de dejar que lo
-- descubra el cliente que recibe el mensaje.
--
-- El camino contrario SI se permite y es deliberado: `use_custom = false` con un
-- texto guardado es alguien que escribio su mensaje y ahora mismo prefiere el
-- predeterminado. Apagar el interruptor NO le borra lo que escribio, para que
-- volver a encenderlo se lo devuelva tal cual (BR-W03).
--
-- El tope de 1.000 caracteres es el mismo que ya usan las notas de un cliente
-- (`clients_notes_length`, 0002). No es una regla nueva: es la longitud a partir
-- de la cual un texto deja de ser un mensaje y pasa a ser un documento.
-- -----------------------------------------------------------------------------
alter table memberships add constraint memberships_whatsapp_message_coherent check (
  not whatsapp_use_custom_message
  or (whatsapp_custom_message is not null and btrim(whatsapp_custom_message) <> '')
);

alter table memberships add constraint memberships_whatsapp_message_length check (
  whatsapp_custom_message is null
  or length(whatsapp_custom_message) <= 1000
);

-- =============================================================================
-- 4. set_seller_whatsapp_settings — el vendedor guarda SU configuracion
--
-- POR QUE UNA RPC Y NO UN UPDATE
--
-- `memberships_update_staff` (0005/0014) es la UNICA politica de escritura sobre
-- esta tabla, y solo deja pasar al personal. Un vendedor no puede escribir su
-- propia membresia, y esa politica NO se amplia: ampliarla para tres columnas
-- abriria la fila entera —`role`, `is_active`, `parent_seller_id`,
-- `commission_model`, `fixed_commission_amount`, las cuatro `public_*`— a quien
-- solo tenia que guardar el enlace de su grupo. Un vendedor podria ascenderse a
-- Dueno o subirse la ganancia con una peticion a mano.
--
-- Aqui, en cambio, la funcion escribe TRES columnas de UNA fila —la suya— y no
-- hay forma de pedirle otra cosa: no recibe ningun identificador de vendedor.
--
-- QUIEN PUEDE: SOLO UN VENDEDOR, Y SOLO SOBRE SI MISMO
--
-- No hay parametro `p_profile_id` a proposito. El vendedor sale de `auth.uid()`,
-- asi que no existe el identificador que alguien pudiera manipular para
-- configurar a otro (BR-W07). Un vendedor padre tampoco puede sobre un
-- integrante de su equipo: el grupo de WhatsApp es suyo y la invitacion la manda
-- el desde su propio telefono.
--
-- El personal tampoco: `has_org_role(org, seller)` comprueba de una vez el rol y
-- que la membresia, el perfil y la organizacion sigan activos (BR-A04).
--
-- LA AUDITORIA YA ESTA
--
-- `audit_memberships` (0006) anota cualquier UPDATE de esta tabla con sus
-- valores anterior y nuevo. No se llama a `write_audit_log` aqui: seria una
-- segunda fila describiendo el mismo hecho.
--
-- NORMALIZACION
--
-- El enlace se recorta (`btrim`) porque quien lo pega desde WhatsApp arrastra
-- espacios. El texto personalizado tambien, y si queda vacio se guarda NULL: una
-- cadena de espacios no es un mensaje.
--
-- SI YA ESTA COMO SE PIDE, SE ESCRIBE IGUAL. A diferencia de
-- `set_ticket_clearance_delivery`, aqui no se ahorra el UPDATE: guardar es un
-- acto explicito de un formulario, y quien pulsa «Guardar cambios» sin haber
-- cambiado nada espera que se guarde, no que se le diga que no hacia falta.
-- =============================================================================

create function set_seller_whatsapp_settings(
  p_group_url          text,
  p_use_custom_message boolean,
  p_custom_message     text default null
)
returns table (
  whatsapp_group_url          text,
  whatsapp_use_custom_message boolean,
  whatsapp_custom_message     text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := require_auth();
  v_org     uuid;
  v_url     text := nullif(btrim(coalesce(p_group_url, '')), '');
  v_message text := nullif(btrim(coalesce(p_custom_message, '')), '');
  v_use     boolean := coalesce(p_use_custom_message, false);
begin
  -- La membresia de vendedor de quien llama. Si no la tiene —es personal, o su
  -- cuenta esta inactiva— no hay nada que configurar.
  select m.organization_id into v_org
  from memberships m
  where m.profile_id = v_uid
    and m.role = 'seller'
    and m.is_active
  limit 1;

  if v_org is null or not has_org_role(v_org, array['seller']::app_role[]) then
    raise exception 'Solo un vendedor puede configurar su grupo de WhatsApp.'
      using errcode = 'insufficient_privilege';
  end if;

  -- El interruptor sin texto se rechaza AQUI y con una frase que se puede leer,
  -- en vez de dejar que salte el CHECK con su mensaje de restriccion.
  if v_use and v_message is null then
    raise exception 'Escribe tu mensaje o vuelve a usar el mensaje predeterminado.'
      using errcode = 'check_violation';
  end if;

  -- El formato del enlace lo comprueba el CHECK, que es el que manda. Esto solo
  -- adelanta una frase util: `mapPgError` no puede redactar uno bueno a partir
  -- del nombre de una restriccion.
  if v_url is not null
     and v_url !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{6,64}([?#][^\s]*)?$' then
    raise exception 'Ese enlace no parece de un grupo de WhatsApp. Debe empezar por https://chat.whatsapp.com/'
      using errcode = 'check_violation';
  end if;

  return query
  update memberships m
     set whatsapp_group_url          = v_url,
         whatsapp_use_custom_message = v_use,
         -- Apagar el interruptor NO borra lo escrito (BR-W03): se conserva para
         -- que volver a encenderlo lo devuelva. Lo unico que lo borra es que la
         -- persona vacie el campo a proposito.
         whatsapp_custom_message     = v_message
   where m.profile_id = v_uid
     and m.role = 'seller'
  returning m.whatsapp_group_url, m.whatsapp_use_custom_message, m.whatsapp_custom_message;
end;
$$;

comment on function set_seller_whatsapp_settings(text, boolean, text) is
  'Guarda el grupo de WhatsApp y el mensaje de invitacion del vendedor que llama. No recibe identificador de vendedor: sale de auth.uid(), asi que nadie puede configurar a otro. Solo escribe tres columnas de su propia membresia. BR-W01..BR-W03, BR-W07, D-176.';

-- Regla 2 de docs/SECURITY.md 4.5. `service_role` se nombra a proposito: en
-- produccion lo hereda del privilegio por defecto y en local NO (D-128), y esa
-- divergencia es exactamente la que costo I-078 y obligo a la 0044.
revoke execute on function set_seller_whatsapp_settings(text, boolean, text) from public, anon;
grant  execute on function set_seller_whatsapp_settings(text, boolean, text) to authenticated;
grant  execute on function set_seller_whatsapp_settings(text, boolean, text) to service_role;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop function set_seller_whatsapp_settings(text, boolean, text);
-- alter table memberships
--   drop constraint memberships_whatsapp_message_length,
--   drop constraint memberships_whatsapp_message_coherent,
--   drop constraint memberships_whatsapp_group_url_format,
--   drop column whatsapp_custom_message,
--   drop column whatsapp_use_custom_message,
--   drop column whatsapp_group_url;
-- =============================================================================
