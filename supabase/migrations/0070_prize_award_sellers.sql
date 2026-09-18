-- =============================================================================
-- 0070_prize_award_sellers.sql
-- Historial de premios ganados — Etapa 3: el personal puede elegir, desde su
-- pantalla, a quien vendio y hoy tiene otro rol
--
-- Referencia normativa: docs/DECISIONS.md D-208 (§«Etapa 3»), BR-J21, BR-Q01,
-- BR-Q02; D-207 (privilegios explicitos, I-132).
--
-- La `0067`, la `0068` y la `0069` ya se aplicaron y NO se reescriben
-- (AGENTS.md): esta es la siguiente, con el siguiente numero libre.
--
-- EL DEFECTO, REPRODUCIDO ANTES DE TOCARLO (E2E «punto B»). El desplegable
-- «Vendedor» de `/owner/prizes` se armaba con los miembros cuyo rol ACTUAL es
-- `seller`. Quien vendio, gano un premio con su cliente y despues paso a
-- Administrador conserva ese premio con su nombre (BR-J21), pero no aparecia en
-- el desplegable: solo se llegaba a sus premios escribiendo su identificador en
-- la direccion. Entrando por el menu, el Dueño no tenia forma de elegirlo.
--
-- El desplegable no puede saber, sin preguntarlo, QUIEN tiene premios en el
-- historial: el rol de hoy no lo dice, y las dos lecturas del personal son
-- paginadas o solo cuentan. Por eso una lectura nueva, del mismo patron que
-- `admin_prize_awards`:
--
--   * el alcance sale de la SESION (`current_staff_org_ids()`), no de un
--     parametro: un vendedor, un anonimo o una persona de otra organizacion no
--     obtiene ninguna fila;
--   * devuelve SOLO al vendedor de cada premio —su identificador de perfil y su
--     nombre, que el personal ya ve en cada fila de `admin_prize_awards`—. Ni un
--     dato de cliente, ni un importe, ni un recuento: no hace falta ninguno para
--     elegir a una persona (BR-Q01, BR-Q02);
--   * lee `prize_award_rows`, la UNICA definicion de que es un premio ganado, asi
--     que nadie aparece por tener una coincidencia sin premio.
--
-- QUE NO HACE: no toca `prize_award_rows`, ni las cuatro lecturas, ni la
-- cobertura, ni el cargador, ni el motor, ni ninguna politica. No amplia el
-- acceso de nadie: el personal ya veia a esas personas en cada fila; lo nuevo es
-- poder ELEGIRLAS sin escribir su identificador. El portal del vendedor no
-- cambia: quien paso a Administrador sigue sin entrar en el.
--
-- SOBRE LAS TILDES. Los comentarios siguen sin tildes (I-030).
-- =============================================================================

create function admin_prize_award_sellers()
returns table (
  seller_id   uuid,
  seller_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.seller_id, pr.full_name
    from prize_award_rows(array(select current_staff_org_ids())) a
    left join profiles pr on pr.id = a.seller_id
   group by a.seller_id, pr.full_name
   order by pr.full_name, a.seller_id
$$;

comment on function admin_prize_award_sellers() is
  'D-208 (Etapa 3): quienes aparecen como vendedor en el historial de premios ganados de la organizacion del personal, tambien si hoy estan inactivos o tienen otro rol. Solo identificador y nombre del VENDEDOR: ni un dato de cliente (BR-Q01).';

-- Privilegios explicitos (D-207, I-132): en el proyecto alojado toda funcion
-- nueva nace ejecutable por `service_role`, y esta es de sesion.
revoke execute on function admin_prize_award_sellers() from public, anon, service_role;
grant  execute on function admin_prize_award_sellers() to authenticated;

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   drop function admin_prize_award_sellers();
--
--   El desplegable vuelve a ofrecer solo a quien hoy es vendedor, y los premios
--   de quien cambio de rol vuelven a alcanzarse solo por la direccion.
-- =============================================================================
