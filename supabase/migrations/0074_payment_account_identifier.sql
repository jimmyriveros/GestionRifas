-- =============================================================================
-- 0074_payment_account_identifier.sql
-- Cuentas para recibir pagos: Bre-B y «Otros» — PASO 2 de 2
--
-- Referencia: docs/BUSINESS_RULES.md BR-M03, BR-M04, BR-M08 y BR-M10;
--             docs/DECISIONS.md D-185, D-188 y D-209; docs/DATA_MODEL.md 4.15
--             y 6.g.6; docs/SECURITY.md 4.15.
--
-- La 0051 ya se aplico y NO se reescribe: esta es la siguiente. Los valores
-- `breb` y `other` los anadio la 0073, que confirmo antes (un valor de enum
-- recien anadido no se puede usar en su misma transaccion: 55P04).
--
-- QUE ES
--
-- Dos formas nuevas de recibir un pago:
--
--   * Bre-B, el sistema de pagos inmediatos del Banco de la Republica. Se paga
--     a una LLAVE: un telefono, un correo, un documento o una llave como
--     «@maria». No siempre empieza por «@», y no se le anade ni se le exige.
--   * «Otros» (`other`): cualquier otra forma, con su numero o identificador.
--
-- Las dos guardan el titular —como las otras tres— y UN identificador de texto
-- libre, de una linea. La etiqueta privada («Nombre para reconocerla») sigue
-- siendo la de siempre y sigue sin viajar al mensaje.
--
-- LA COLUMNA NUEVA: `identifier`. No se reutiliza `phone` ni `account_number`:
-- sus CHECK son de digitos (`phone`, I-108; `account_number` empieza por un
-- digito) y una llave como «@Maria.Gomez» no cabe en ninguno. Relajarlos para
-- todos los tipos debilitaria Nequi, Daviplata y banco; relajarlos por tipo
-- seria esconder dos significados en una columna. Una columna propia deja cada
-- dato con su regla, y la de los tipos anteriores no cambia en nada.
--
-- LA REGLA DEL IDENTIFICADOR (BR-M10) — LA MISMA EN LAS TRES CAPAS
--
--   1. Se guarda SIN LOS ESPACIOS EXTERIORES, entendiendo por espacio
--      exactamente lo que quita `String.prototype.trim()` de JavaScript, que es
--      lo que ya quita `.trim()` de Zod en el formulario y en la Server Action.
--      NADA MAS se toca: ni mayusculas, ni ceros iniciales, ni simbolos. No se
--      convierte a numero y no se le quitan letras.
--   2. Entre 1 y 100 caracteres, contados como puntos de codigo
--      (`char_length`; en TypeScript, `[...texto].length`).
--   3. UNA SOLA LINEA Y NADA INVISIBLE: ni caracteres de control (U+0000 a
--      U+001F y U+007F a U+009F, que incluyen el salto de linea y el
--      tabulador), ni los separadores de linea y de parrafo (U+2028, U+2029),
--      ni los de formato que no se ven y se cuelan al copiar y pegar: el guion
--      discrecional (U+00AD), los de anchura cero y de direccion (U+200B a
--      U+200F, U+202A a U+202E), U+2060 a U+206F y U+FEFF.
--
--   Los dos conjuntos se escriben aqui con escapes hexadecimales `\x`, que en
--   una expresion regular de PostgreSQL son un punto de codigo. En TypeScript
--   (`src/features/payment-accounts/accounts.ts`) la clase prohibida son los
--   MISMOS rangos, escritos como numeros, y el recorte es el propio `trim()`.
--   Que digan lo mismo no se confia a la vista: una prueba de base recorre la
--   BMP entera, punto de codigo por punto de codigo, y compara el veredicto de
--   las dos funciones de abajo con el de TypeScript.
--
-- DUPLICADOS (BR-M08). El indice unico se reconstruye con una rama por forma:
--
--   * Nequi, Daviplata y banco siguen comparando SOLO DIGITOS, con la misma
--     expresion de la 0051: «300 123 4567» y «3001234567» son la misma cuenta.
--   * Bre-B y «Otros» comparan el IDENTIFICADOR COMPLETO, que ya esta guardado
--     sin espacios exteriores. «@maria» y «@pedro» no son la misma cuenta
--     aunque ninguno tenga digitos, ni «@maria123» y «@pedro123» aunque
--     compartan los mismos. DISTINGUE MAYUSCULAS: «@Maria» y «@maria» son dos
--     llaves, porque nadie documento una equivalencia y no se inventa una.
--
--   Siempre dentro del mismo vendedor y del mismo tipo, y solo entre cuentas
--   sin archivar, como antes. Es un indice unico y no una comprobacion en la
--   RPC: dos peticiones simultaneas con la misma llave no pueden pasar las dos
--   (la segunda espera a la primera y falla con 23505), y crear, editar y
--   volver a usar pasan por el mismo sitio.
--
-- LO QUE HACE, EN ORDEN
--
--   1. `identifier` en `seller_payment_accounts`, nula en todas las filas que
--      ya existen: no hay relleno ni reescritura de datos.
--   2. Dos funciones internas e INMUTABLES con la regla: el recorte y el
--      problema. Las usan los CHECK y las dos RPC, asi que la regla se escribe
--      una sola vez en SQL.
--   3. El CHECK de forma por tipo, rehecho con una rama por forma y `else
--      false`: un tipo que alguien anada manana sin decidir su rama queda
--      rechazado en vez de caer por descuido en la de al lado. Y el CHECK del
--      identificador.
--   4. El indice de duplicados, reconstruido.
--   5. `create_seller_payment_account` y `update_seller_payment_account`, con
--      un argumento mas al final —`p_identifier`, opcional— y el resto igual.
--      Cambia la firma, asi que se BORRAN Y SE CREAN: con `create or replace`
--      quedarian dos sobrecargas y PostgREST no sabria cual llamar. Las otras
--      tres RPC de cuentas no cambian.
--   6. Los privilegios, NOMBRANDO a cada rol, y una comprobacion de si misma
--      como la 0066 y la 0072: si el EXECUTE efectivo no es el de la lista, o
--      queda una sobrecarga sin clasificar, falla y no deja nada.
--
-- LO QUE NO CAMBIA: el tope de cinco, el orden, archivar y volver a usar, la
-- RLS —una politica de SELECT y ningun privilegio de escritura para
-- `authenticated`—, la bitacora —que sigue sin guardar el numero ni la llave—,
-- las RPC de recordatorios, el motor y ninguna tabla de negocio: ni boletas, ni
-- pagos, ni abonos, ni saldos, ni premios.
--
-- COMPATIBILIDAD CON EL CODIGO DESPLEGADO. Las llamadas de hoy no mandan
-- `p_identifier`, que es opcional: siguen funcionando igual para Nequi,
-- Daviplata y banco. Por eso el orden de una promocion es base de datos
-- primero y codigo despues.
--
-- SOBRE LAS TILDES. Los comentarios siguen sin tildes (I-030); las frases que
-- lee una persona van acentuadas, como en la 0050 y la 0051.
-- =============================================================================

-- =============================================================================
-- 1. La columna
-- =============================================================================
alter table seller_payment_accounts add column identifier text;

comment on column seller_payment_accounts.identifier is
  'BR-M10: llave de Bre-B o numero/identificador de «Otros», tal como se escribio y sin espacios exteriores. NULL en Nequi, Daviplata y banco. Ni la bitacora ni el mensaje la transforman.';

-- =============================================================================
-- 2. La regla, escrita una vez
--
-- INMUTABLES de verdad: solo expresiones regulares con puntos de codigo
-- explicitos y `char_length`, que no dependen del idioma ni de la collation de
-- la base (los rangos de una clase son de puntos de codigo). Por eso pueden
-- vivir dentro de un CHECK.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.a El recorte: lo que quita `String.prototype.trim()` de JavaScript.
--
-- Ese conjunto es TAB, LF, VT, FF, CR, el espacio, U+00A0, U+1680, U+2000 a
-- U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 y U+FEFF. `btrim` de
-- PostgreSQL solo quita el espacio, y con el la base y el formulario dirian
-- cosas distintas de «@maria» con un tabulador delante.
--
-- `strict`: NULL entra, NULL sale. Con un texto, devuelve siempre un texto
-- —vacio si no quedaba nada—, nunca NULL; el CHECK de abajo depende de eso.
-- -----------------------------------------------------------------------------
create function payment_account_identifier_trim(p_value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public, pg_temp
as $$
  select regexp_replace(
    p_value,
    '^[\t\n\v\f\r \xa0\x1680\x2000-\x200a\x2028\x2029\x202f\x205f\x3000\xfeff]+|[\t\n\v\f\r \xa0\x1680\x2000-\x200a\x2028\x2029\x202f\x205f\x3000\xfeff]+$',
    '',
    'g'
  )
$$;

comment on function payment_account_identifier_trim(text) is
  'BR-M10: el identificador sin los espacios exteriores que quita String.prototype.trim() de JavaScript. Interna: la usan el CHECK y las RPC de cuentas.';

-- -----------------------------------------------------------------------------
-- 2.b El problema, dicho como se le dice a quien lo escribe; NULL si no hay.
--
-- Recibe el identificador YA RECORTADO. Devuelve la frase que la RPC levanta
-- tal cual —la misma que dice el formulario, letra por letra: estan en
-- `ACCOUNT_COPY` y una prueba compara las dos—, y el CHECK solo mira si es
-- NULL.
--
-- Para Nequi, Daviplata y banco no aplica ninguna regla de identificador y
-- devuelve NULL: que ahi el identificador tenga que estar vacio lo dice el
-- CHECK de forma, no esta funcion.
-- -----------------------------------------------------------------------------
create function payment_account_identifier_problem(
  p_kind  payment_account_kind,
  p_value text
)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_kind is null or p_kind not in ('breb', 'other') then null
    when p_value is null or p_value = '' then
      case p_kind
        when 'breb' then 'Escribe tu llave.'
        else 'Escribe el número o identificador.'
      end
    when char_length(p_value) > 100 then
      case p_kind
        when 'breb' then 'La llave es demasiado larga. Usa 100 caracteres como máximo.'
        else 'El número o identificador es demasiado largo. Usa 100 caracteres como máximo.'
      end
    when p_value ~ '[\x0-\x1f\x7f-\x9f\xad\x200b-\x200f\x2028-\x202e\x2060-\x206f\xfeff]' then
      case p_kind
        when 'breb' then 'La llave tiene saltos de línea o caracteres invisibles. Escríbela de nuevo en una sola línea.'
        else 'El número o identificador tiene saltos de línea o caracteres invisibles. Escríbelo de nuevo en una sola línea.'
      end
  end
$$;

comment on function payment_account_identifier_problem(payment_account_kind, text) is
  'BR-M10: por que un identificador de Bre-B o de «Otros» no vale, en la frase que lee el vendedor; NULL si vale. Interna: la usan el CHECK y las RPC de cuentas.';

-- =============================================================================
-- 3. Los CHECK
-- =============================================================================

-- La forma por tipo (BR-M04), rehecha. Una rama por forma y `else false`: la
-- 0051 mandaba todo lo que no fuera banco a la rama del telefono, y con dos
-- formas mas eso ya no vale. Validar las filas que ya existen no puede fallar:
-- su `identifier` es NULL y el resto no cambia.
alter table seller_payment_accounts
  drop constraint seller_payment_accounts_shape_by_kind;

alter table seller_payment_accounts
  add constraint seller_payment_accounts_shape_by_kind check (
    case
      when kind in ('nequi', 'daviplata') then
        phone is not null
        and bank_name is null
        and account_type is null
        and account_number is null
        and identifier is null
      when kind = 'bank' then
        phone is null
        and bank_name is not null
        and account_type is not null
        and account_number is not null
        and identifier is null
      when kind in ('breb', 'other') then
        identifier is not null
        and phone is null
        and bank_name is null
        and account_type is null
        and account_number is null
      else false
    end
  );

-- El identificador (BR-M10): guardado ya recortado, y sin ningun problema. Con
-- un texto, el recorte nunca es NULL (2.a), asi que la comparacion no puede
-- dar NULL y colar la fila.
alter table seller_payment_accounts
  add constraint seller_payment_accounts_identifier_format check (
    identifier is null
    or (
      identifier = payment_account_identifier_trim(identifier)
      and payment_account_identifier_problem(kind, identifier) is null
    )
  );

-- =============================================================================
-- 4. Duplicados (BR-M08)
--
-- Mismo nombre que el de la 0051, para que la aplicacion lo siga reconociendo
-- (`CONSTRAINT_MESSAGES` en `src/lib/errors.ts`). Se borra y se crea en la
-- misma transaccion: `drop index` bloquea la tabla hasta el final, asi que no
-- hay un instante sin el.
--
-- Crearlo sobre los datos que ya existen no puede fallar: para Nequi,
-- Daviplata y banco la clave es la misma de antes y ya era unica, y todavia no
-- existe ninguna cuenta de Bre-B ni de «Otros».
-- =============================================================================
drop index seller_payment_accounts_no_duplicates;

create unique index seller_payment_accounts_no_duplicates
  on seller_payment_accounts (
    seller_id,
    kind,
    (case
       when kind in ('breb', 'other') then identifier
       else regexp_replace(coalesce(phone, account_number), '[^0-9]', '', 'g')
     end)
  )
  where archived_at is null;

comment on index seller_payment_accounts_no_duplicates is
  'BR-M08: no dos cuentas iguales sin archivar del mismo vendedor y tipo. Nequi, Daviplata y banco comparan solo digitos; Bre-B y «Otros», el identificador completo, que se guarda sin espacios exteriores y distingue mayusculas (0074).';

-- =============================================================================
-- 5. Las dos RPC que escriben un identificador
--
-- Mismo cuerpo que en la 0051 y mismas frases, con tres diferencias:
--
--   * reciben `p_identifier` y lo recortan con 2.a;
--   * si el tipo es Bre-B o «Otros», lo validan con 2.b y levantan su frase
--     ANTES de tocar nada —asi la persona lee que le falta, no el nombre de un
--     CHECK—;
--   * `update_...` lee antes el tipo de la FILA, porque no lo recibe: el tipo
--     no se cambia al editar (D-188, decision 3), y es el tipo guardado el que
--     dice que se valida.
--
-- Siguen SIN recibir identificador de vendedor (BR-M02): sale de `auth.uid()`.
-- Y la bitacora sigue sin guardar el numero, el telefono ni la llave (BR-D04):
-- `audit_logs` lo consulta el personal entero.
-- =============================================================================

drop function create_seller_payment_account(
  payment_account_kind, text, text, text, bank_account_type, text, text
);

create function create_seller_payment_account(
  p_kind           payment_account_kind,
  p_holder_name    text,
  p_phone          text default null,
  p_bank_name      text default null,
  p_account_type   bank_account_type default null,
  p_account_number text default null,
  p_label          text default null,
  p_identifier     text default null
)
returns seller_payment_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := require_auth();
  v_org        uuid := require_seller_org();
  v_slot       smallint;
  v_row        seller_payment_accounts;
  v_holder     text := nullif(btrim(coalesce(p_holder_name, '')), '');
  v_phone      text := nullif(btrim(coalesce(p_phone, '')), '');
  v_bank       text := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_number     text := nullif(btrim(coalesce(p_account_number, '')), '');
  v_label      text := nullif(btrim(coalesce(p_label, '')), '');
  v_identifier text := nullif(payment_account_identifier_trim(p_identifier), '');
  v_problem    text;
begin
  if v_holder is null then
    raise exception 'Escribe el nombre del titular de la cuenta.'
      using errcode = 'check_violation';
  end if;

  v_problem := payment_account_identifier_problem(p_kind, v_identifier);
  if v_problem is not null then
    raise exception '%', v_problem
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
    phone, bank_name, account_type, account_number, identifier, label, sort_order
  )
  values (
    v_org, v_uid, p_kind, v_holder,
    v_phone, v_bank, p_account_type, v_number, v_identifier, v_label, v_slot
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

comment on function create_seller_payment_account(payment_account_kind, text, text, text, bank_account_type, text, text, text) is
  'BR-M02/BR-M04/BR-M06/BR-M10: crea una cuenta del vendedor que llama. No recibe identificador de vendedor. La bitacora NO guarda el numero, el telefono ni la llave.';

drop function update_seller_payment_account(
  uuid, text, text, text, bank_account_type, text, text
);

create function update_seller_payment_account(
  p_id             uuid,
  p_holder_name    text,
  p_phone          text default null,
  p_bank_name      text default null,
  p_account_type   bank_account_type default null,
  p_account_number text default null,
  p_label          text default null,
  p_identifier     text default null
)
returns seller_payment_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := require_auth();
  v_org        uuid := require_seller_org();
  v_kind       payment_account_kind;
  v_row        seller_payment_accounts;
  v_holder     text := nullif(btrim(coalesce(p_holder_name, '')), '');
  v_phone      text := nullif(btrim(coalesce(p_phone, '')), '');
  v_bank       text := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_number     text := nullif(btrim(coalesce(p_account_number, '')), '');
  v_label      text := nullif(btrim(coalesce(p_label, '')), '');
  v_identifier text := nullif(payment_account_identifier_trim(p_identifier), '');
  v_problem    text;
begin
  if v_holder is null then
    raise exception 'Escribe el nombre del titular de la cuenta.'
      using errcode = 'check_violation';
  end if;

  -- El tipo de la FILA, que es el que dice que se valida: la RPC no lo recibe.
  select a.kind into v_kind
  from seller_payment_accounts a
  where a.id = p_id
    and a.seller_id = v_uid
    and a.archived_at is null;

  if v_kind is null then
    raise exception 'Esa cuenta no existe o ya no está activa.'
      using errcode = 'insufficient_privilege';
  end if;

  v_problem := payment_account_identifier_problem(v_kind, v_identifier);
  if v_problem is not null then
    raise exception '%', v_problem
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
         identifier     = v_identifier,
         label          = v_label
   where a.id = p_id
     and a.seller_id = v_uid
     and a.archived_at is null
  returning * into v_row;

  -- La archivaron entre la lectura y la escritura: la misma frase de siempre.
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

comment on function update_seller_payment_account(uuid, text, text, text, bank_account_type, text, text, text) is
  'BR-M02/BR-M10: corrige una cuenta ACTIVA del vendedor que llama. El tipo no se cambia: se archiva y se crea otra.';

-- =============================================================================
-- 6. Privilegios, nombrando a cada rol (D-207, I-132, I-143)
--
-- Una funcion NUEVA nace ejecutable por PUBLIC; en el proyecto alojado,
-- ademas, por `service_role` (su privilegio por defecto es
-- `{postgres=X, service_role=X}`, y en la pila local `{postgres=X}`). Por eso
-- no se confia en ninguno de los dos: se revoca y se concede por nombre, y el
-- resultado es el mismo en los dos entornos.
--
--   * Las dos RPC, como en la 0051: `authenticated` —el vendedor, desde su
--     sesion— y `service_role`.
--   * Las dos de la regla, SOLO `service_role`. Ninguna sesion las necesita:
--     las RPC corren con los privilegios de su dueno. Pero los CHECK se evaluan
--     con los de quien escribe, y la service role tiene `grant all` sobre la
--     tabla desde la 0051: sin EXECUTE, cualquier escritura suya fallaria con
--     «permission denied for function». No le da ningun poder que no tuviera.
-- =============================================================================
revoke execute on function create_seller_payment_account(payment_account_kind, text, text, text, bank_account_type, text, text, text) from public, anon;
revoke execute on function update_seller_payment_account(uuid, text, text, text, bank_account_type, text, text, text) from public, anon;
grant  execute on function create_seller_payment_account(payment_account_kind, text, text, text, bank_account_type, text, text, text) to authenticated, service_role;
grant  execute on function update_seller_payment_account(uuid, text, text, text, bank_account_type, text, text, text) to authenticated, service_role;

revoke execute on function payment_account_identifier_trim(text) from public, anon, authenticated;
revoke execute on function payment_account_identifier_problem(payment_account_kind, text) from public, anon, authenticated;
grant  execute on function payment_account_identifier_trim(text) to service_role;
grant  execute on function payment_account_identifier_problem(payment_account_kind, text) to service_role;

-- =============================================================================
-- 7. Comprobacion: la matriz exacta de las funciones de cuentas
--
-- Como la 0066 y la 0072: si el EXECUTE efectivo de alguna no es exactamente
-- el de la lista, o queda una sobrecarga sin clasificar —la firma de la 0051
-- que tenia que desaparecer—, falla y no deja nada. Entran tambien las tres
-- RPC de cuentas que no cambian, para que la lista sea la del modulo entero.
-- =============================================================================
do $$
declare
  v_problemas text;
begin
  with esperado (firma, publico, anonimo, autenticado, servicio) as (
    values
      ('create_seller_payment_account(payment_account_kind,text,text,text,bank_account_type,text,text,text)', false, false, true, true),
      ('update_seller_payment_account(uuid,text,text,text,bank_account_type,text,text,text)', false, false, true, true),
      ('archive_seller_payment_account(uuid)', false, false, true, true),
      ('restore_seller_payment_account(uuid)', false, false, true, true),
      ('reorder_seller_payment_accounts(uuid[])', false, false, true, true),
      ('payment_account_identifier_trim(text)', false, false, false, true),
      ('payment_account_identifier_problem(payment_account_kind,text)', false, false, false, true)
  ),
  resuelto as (
    select e.*, to_regprocedure('public.' || e.firma)::oid as funcion from esperado e
  ),
  efectivo as (
    select r.*,
           exists (
             select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = r.funcion and a.grantee = 0 and a.privilege_type = 'EXECUTE'
           ) as v_publico,
           case when r.funcion is not null then has_function_privilege('anon', r.funcion, 'EXECUTE') end as v_anonimo,
           case when r.funcion is not null then has_function_privilege('authenticated', r.funcion, 'EXECUTE') end as v_autenticado,
           case when r.funcion is not null then has_function_privilege('service_role', r.funcion, 'EXECUTE') end as v_servicio
      from resuelto r
  )
  select string_agg(
           firma || case when funcion is null then ' no existe' else ' (PUBLIC=' || v_publico || ', anon=' || v_anonimo
             || ', authenticated=' || v_autenticado || ', service_role=' || v_servicio || ')' end,
           '; ' order by firma)
    into v_problemas
    from efectivo
   where funcion is null
      or v_publico is distinct from publico
      or v_anonimo is distinct from anonimo
      or v_autenticado is distinct from autenticado
      or v_servicio is distinct from servicio;

  if v_problemas is not null then
    raise exception 'La 0074 no dejó el EXECUTE esperado en las cuentas para recibir pagos: %', v_problemas;
  end if;

  select string_agg(p.oid::regprocedure::text, '; ')
    into v_problemas
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = any (array['create_seller_payment_account', 'update_seller_payment_account',
                                'archive_seller_payment_account', 'restore_seller_payment_account',
                                'reorder_seller_payment_accounts', 'payment_account_identifier_trim',
                                'payment_account_identifier_problem'])
     and p.oid::regprocedure::text <> all (array[
           'create_seller_payment_account(payment_account_kind,text,text,text,bank_account_type,text,text,text)',
           'update_seller_payment_account(uuid,text,text,text,bank_account_type,text,text,text)',
           'archive_seller_payment_account(uuid)',
           'restore_seller_payment_account(uuid)',
           'reorder_seller_payment_accounts(uuid[])',
           'payment_account_identifier_trim(text)',
           'payment_account_identifier_problem(payment_account_kind,text)']);

  if v_problemas is not null then
    raise exception 'Funciones de cuentas sin clasificar en la 0074: %', v_problemas;
  end if;
end;
$$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Solo es posible si NINGUNA fila usa `breb` ni `other`: sus datos viven en
-- `identifier`, y el CHECK de la 0051 no los admite.
--
--   drop function update_seller_payment_account(uuid, text, text, text, bank_account_type, text, text, text);
--   drop function create_seller_payment_account(payment_account_kind, text, text, text, bank_account_type, text, text, text);
--   -- y volver a crear las dos de la 0051, con sus privilegios.
--   drop index seller_payment_accounts_no_duplicates;
--   -- y volver a crear el de la 0051.
--   alter table seller_payment_accounts drop constraint seller_payment_accounts_identifier_format;
--   alter table seller_payment_accounts drop constraint seller_payment_accounts_shape_by_kind;
--   -- y volver a crear el de la 0051.
--   drop function payment_account_identifier_problem(payment_account_kind, text);
--   drop function payment_account_identifier_trim(text);
--   alter table seller_payment_accounts drop column identifier;
--
-- Revertir no toca ningun dato de negocio: ni una boleta, ni un pago, ni un
-- cliente.
-- =============================================================================
