-- =============================================================================
-- 0077 — Códigos de rifa a partir de 1.000 (I-157, D-220)
--
-- EL DEFECTO. `raffles_set_short_code` (0004) construía el código con
-- `'R' || lpad(contador, 3, '0')`, y `lpad` RECORTA cuando el texto es más largo
-- que el ancho: `lpad('1000', 3, '0')` da `'100'`. La rifa 1.000 de una
-- organización nacía como `R100`: si la 100 existía, el `insert` fallaba con
-- `raffles_org_short_code_key`; si no, se creaba con un código engañoso.
-- Reproducido en local el 2026-09-23, en los dos casos.
--
-- LA DECISIÓN (autorizada por el dueño el 2026-09-23). Se conservan todos los
-- códigos que existen y se continúa R999 → R1000 → R1001: mínimo tres cifras,
-- sin recortar nunca. Hasta la 999 el código es exactamente el de siempre.
--
-- QUÉ NO CAMBIA.
--   * Ninguna fila: no se renumera ni se toca ninguna rifa.
--   * El contador `organizations.raffle_counter` y su bloqueo de fila, que es lo
--     que impide que dos rifas creadas a la vez reciban el mismo número.
--   * La unicidad por organización (`raffles_org_short_code_key`).
--   * Un código escrito a mano se respeta, como antes.
--   * Los privilegios: `create or replace` conserva los de la función, que desde
--     0032 son solo del propietario y de `service_role`. Se comprueba abajo.
--   * El código interno de las boletas: se arma con el de la rifa TAL CUAL
--     (`R1000-000001`), así que hereda el arreglo sin tocarlo.
--
-- NO se reescribe 0004: esta migración solo redefine la función.
-- =============================================================================

create or replace function raffles_set_short_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counter int;
  v_digits  text;
begin
  if new.short_code is not null and btrim(new.short_code) <> '' then
    return new;
  end if;

  -- UPDATE ... RETURNING toma un lock de fila: dos rifas creadas a la vez en la
  -- misma organizacion no pueden recibir el mismo codigo.
  update organizations
     set raffle_counter = raffle_counter + 1
   where id = new.organization_id
  returning raffle_counter into v_counter;

  if v_counter is null then
    raise exception 'La organizacion % no existe', new.organization_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Tres cifras como minimo, y NUNCA menos de las que tiene el numero: el ancho
  -- de `lpad` es el mayor de los dos, asi que 7 -> R007 y 1000 -> R1000 (I-157).
  v_digits := v_counter::text;
  new.short_code := 'R' || lpad(v_digits, greatest(3, length(v_digits)), '0');
  return new;
end;
$$;

comment on function raffles_set_short_code() is
  'Genera raffles.short_code: R + el contador de la organizacion con al menos tres cifras y sin recortar (R001, R999, R1000). 0004, corregida en 0077 (I-157).';

-- -----------------------------------------------------------------------------
-- La migración se comprueba a sí misma.
-- -----------------------------------------------------------------------------
do $$
declare
  v_fn regprocedure := 'raffles_set_short_code()'::regprocedure;
begin
  -- Los privilegios siguen siendo los de 0032: nadie de la sesión la ejecuta.
  if has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception '0077: raffles_set_short_code quedó ejecutable por anon o authenticated';
  end if;

  -- Sigue siendo SECURITY DEFINER y con search_path fijo.
  if not (select prosecdef from pg_proc where oid = v_fn) then
    raise exception '0077: raffles_set_short_code dejó de ser SECURITY DEFINER';
  end if;

  -- El disparador sigue colgado de `raffles`, antes de insertar.
  if not exists (
    select 1 from pg_trigger
     where tgname = 'raffles_set_short_code'
       and tgrelid = 'raffles'::regclass
       and tgfoid = v_fn
       and not tgisinternal
  ) then
    raise exception '0077: falta el disparador raffles_set_short_code en raffles';
  end if;

  -- La regla, en los cuatro límites que importan.
  if 'R' || lpad('7', greatest(3, length('7')), '0') <> 'R007'
     or 'R' || lpad('999', greatest(3, length('999')), '0') <> 'R999'
     or 'R' || lpad('1000', greatest(3, length('1000')), '0') <> 'R1000'
     or 'R' || lpad('10000', greatest(3, length('10000')), '0') <> 'R10000' then
    raise exception '0077: la regla del código no da R007, R999, R1000 y R10000';
  end if;
end;
$$;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Reversible sin perdida de datos: no se crea ni se cambia ninguna tabla, fila,
-- restriccion ni privilegio. Para volver a la 0004 se redefine la funcion con
-- `'R' || lpad(v_counter::text, 3, '0')`. OJO: si ya existe alguna rifa R1000 o
-- mayor, volver atras hace que la siguiente vuelva a recortarse y a chocar.
-- =============================================================================
