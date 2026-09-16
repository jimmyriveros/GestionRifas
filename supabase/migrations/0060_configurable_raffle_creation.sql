-- =============================================================================
-- 0060_configurable_raffle_creation.sql
-- Premios configurables por rifa — Entrega 2: una rifa NUEVA puede nacer en
-- modo `configurable` desde la aplicacion
--
-- Referencia normativa: docs/DECISIONS.md D-202 (esta entrega), D-199 (el
-- contrato), D-200 (la capacidad) y D-201 (la correccion);
-- docs/BUSINESS_RULES.md §12.i (BR-J13), docs/SECURITY.md §4.20.
--
-- QUE CAMBIA, Y NADA MAS
--
-- La `0058` cerro la puerta entera: `raffles_guard_prize_config` rechazaba
-- CUALQUIER insercion con `prize_mode <> 'legacy'` hecha desde una sesion,
-- porque en la Entrega 1 no habia pantalla y nadie tenia por que elegir el modo.
-- Con el panel ya existe quien lo elija, asi que la puerta se abre lo justo:
--
--   * una rifa NUEVA puede nacer `configurable` desde una sesion, pero solo si
--     quien la crea tiene la capacidad `raffles.prizes.manage` (D-200): no
--     basta con ser personal, y el dia que la capacidad se reparta de otra
--     forma esta comprobacion la sigue sin tocarse;
--   * sigue naciendo en BORRADOR, como en la `0058`;
--   * y **cambiar el modo de una rifa que ya existe sigue prohibido para
--     cualquier sesion**: la rama de UPDATE no se toca ni una linea. Una rifa
--     `legacy` no se convierte desde la aplicacion, y eso es la Entrega 4.
--
-- Todo lo demas del disparador —fechas que no dejen un premio fuera, y una rifa
-- configurable que no se activa sin configuracion valida— se conserva tal cual.
--
-- QUE NO HACE
--
--   * No crea tablas, columnas, politicas ni RPC.
--   * No cambia el modo de ninguna rifa existente: todas siguen en `legacy`.
--   * No toca el motor de coincidencias, los resultados ni la cartera.
--
-- SOBRE LAS TILDES. Las frases NUEVAS que puede leer una persona van
-- acentuadas; los comentarios siguen sin tildes. I-030 no se toca aqui.
-- =============================================================================

create or replace function raffles_guard_prize_config()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dates_changed boolean := false;
  v_activating    boolean := false;
  v_title         text;
  v_problem       text;
  v_prize         record;
begin
  if tg_op = 'INSERT' then
    if new.prize_mode = 'configurable' then
      -- Nace en borrador SIEMPRE, venga de donde venga: una rifa que se activa
      -- de golpe no ha podido pasar por la validacion de sus premios.
      if new.status <> 'draft' then
        raise exception 'Una rifa con premios configurables nace en borrador y se activa cuando sus premios están listos.'
          using errcode = 'check_violation';
      end if;

      -- Desde una sesion, solo con la capacidad (D-200, D-202). Sin sesion
      -- —un proceso interno con la service role— se permite como antes.
      if auth.uid() is not null
         and not has_org_capability(new.organization_id, 'raffles.prizes.manage') then
        raise exception 'No tienes permiso para crear una rifa con premios configurables.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    return new;
  end if;

  if new.prize_mode is distinct from old.prize_mode then
    if auth.uid() is not null then
      raise exception 'El sistema de premios de una rifa todavía no se cambia desde la aplicación.'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status <> 'draft' or new.status <> 'draft' then
      raise exception 'El sistema de premios de una rifa solo se puede cambiar mientras está en borrador.'
        using errcode = 'check_violation';
    end if;
    if new.prize_mode = 'legacy'
       and exists (select 1 from raffle_prizes p where p.raffle_id = new.id) then
      raise exception 'La rifa ya tiene premios configurados y no puede volver al sistema de siempre.'
        using errcode = 'check_violation';
    end if;
  end if;

  v_dates_changed := new.start_date is distinct from old.start_date
                  or new.end_date is distinct from old.end_date;
  v_activating := new.prize_mode = 'configurable'
              and new.status = 'active'
              and old.status is distinct from 'active';

  if not v_dates_changed and not v_activating then
    return new;
  end if;

  perform raffle_prize_lock(new.id);

  if v_dates_changed then
    select v.title into v_title
    from raffle_prizes p
    join raffle_prize_versions v on v.id = p.current_version_id
    join raffle_prize_schedule_rules r on r.version_id = v.id
    where p.raffle_id = new.id
      and p.status = 'active'
      and (r.start_date < new.start_date or r.end_date > new.end_date)
    order by p.position
    limit 1;

    if v_title is not null then
      raise exception 'El premio «%» tiene fechas fuera de las nuevas fechas de la rifa. Cambia primero el calendario del premio.',
        v_title
        using errcode = 'check_violation';
    end if;
  end if;

  if v_activating then
    if not exists (
      select 1 from raffle_prizes p where p.raffle_id = new.id and p.status = 'active'
    ) then
      raise exception 'La rifa necesita al menos un premio para activarse.'
        using errcode = 'check_violation';
    end if;

    for v_prize in
      select p.current_version_id
      from raffle_prizes p
      where p.raffle_id = new.id and p.status = 'active'
      order by p.position
    loop
      v_problem := raffle_prize_version_problem(v_prize.current_version_id, new.start_date, new.end_date);
      if v_problem is not null then
        raise exception '%', v_problem using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

comment on function raffles_guard_prize_config() is
  'BR-J13: una rifa nueva puede nacer configurable con la capacidad raffles.prizes.manage y en borrador (D-202); cambiar el modo de una rifa existente sigue prohibido para cualquier sesion.';

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- Revertir es una migracion NUEVA, nunca editar esta: se vuelve a escribir el
-- cuerpo de `raffles_guard_prize_config` tal como lo dejo la `0058`. Las rifas
-- configurables que ya existan seguirian existiendo —revertir la puerta no
-- deshace lo creado—, asi que antes conviene mirar:
--
--   select id, name, status from raffles where prize_mode = 'configurable';
-- =============================================================================
