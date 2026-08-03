-- =============================================================================
-- 0006_audit.sql
-- Fase 2 — Infraestructura de auditoria
--
-- Referencia normativa: docs/SECURITY.md §6, docs/BUSINESS_RULES.md BR-D01..D04.
--
-- Prevencion de ciclos y recursion (requisito explicito del prompt de la Fase 2):
--   * audit_logs NO tiene triggers propios, por lo que escribir en ella no
--     puede disparar nada mas. El grafo de triggers es un arbol, no un ciclo.
--   * La escritura ocurre en una funcion SECURITY DEFINER, de modo que la RLS
--     de audit_logs (que no concede INSERT a nadie) no bloquea los triggers.
--   * Los triggers son AFTER: no interfieren con la validacion de la fila.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Escritura de bitacora. La usan tanto los triggers de esta migracion como las
-- funciones RPC de 0007 para registrar acciones semanticas (aprobar, anular...).
-- -----------------------------------------------------------------------------
create function write_audit_log(
  p_organization_id uuid,
  p_action          text,
  p_entity_type     text,
  p_entity_id       uuid,
  p_old_values      jsonb default null,
  p_new_values      jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into audit_logs (
    organization_id, actor_profile_id, action, entity_type, entity_id,
    old_values, new_values
  )
  values (
    p_organization_id,
    auth.uid(),  -- NULL en procesos del sistema (seed, scripts con service role)
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_values,
    p_new_values
  );
end;
$$;

revoke execute on function write_audit_log(uuid, text, text, uuid, jsonb, jsonb) from public;

comment on function write_audit_log is
  'Unico punto de escritura de audit_logs. SECURITY DEFINER porque la tabla no concede INSERT a ningun rol.';

-- -----------------------------------------------------------------------------
-- Trigger generico de auditoria.
--
-- Se instala con el tipo de entidad como argumento:
--   create trigger ... execute function audit_row_change('ticket');
--
-- En UPDATE registra unicamente los campos que cambiaron, para que la bitacora
-- sea legible: interesa "cambio daily_number de 0007 a 0123", no un volcado de
-- las 20 columnas.
--
-- Se ignoran dos clases de columnas, porque generarian ruido que ahogaria la
-- informacion util:
--   * Infraestructura (updated_at, contadores de codigos): crear 1.000 boletas
--     incrementa raffles.ticket_counter 1.000 veces; sin este filtro la bitacora
--     tendria 1.000 entradas "raffle.update" que no describen ninguna decision.
--   * Derivadas (paid_amount, payment_status): su origen real ya queda
--     registrado como payment.create / payment.void, con el detalle completo.
--
-- Si tras aplicar el filtro no queda ningun campo, no se registra nada.
-- -----------------------------------------------------------------------------
create function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity      text := tg_argv[0];
  v_old         jsonb;
  v_new         jsonb;
  v_old_changed jsonb;
  v_new_changed jsonb;
  v_org         uuid;
  v_entity_id   uuid;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    perform write_audit_log(
      (v_new ->> 'organization_id')::uuid,
      v_entity || '.create',
      v_entity,
      (v_new ->> 'id')::uuid,
      null,
      v_new
    );
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    perform write_audit_log(
      (v_old ->> 'organization_id')::uuid,
      v_entity || '.delete',
      v_entity,
      (v_old ->> 'id')::uuid,
      v_old,
      null
    );
    return null;
  end if;

  -- UPDATE
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  v_org := (v_new ->> 'organization_id')::uuid;
  v_entity_id := (v_new ->> 'id')::uuid;

  select
    coalesce(jsonb_object_agg(n.key, v_old -> n.key), '{}'::jsonb),
    coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb)
    into v_old_changed, v_new_changed
    from jsonb_each(v_new) n
   where n.key not in (
           -- infraestructura
           'updated_at', 'ticket_counter', 'raffle_counter',
           -- derivadas de los pagos (ya auditados como payment.create/void)
           'paid_amount', 'payment_status'
         )
     and (v_old -> n.key) is distinct from n.value;

  if v_new_changed = '{}'::jsonb then
    return null;
  end if;

  perform write_audit_log(
    v_org,
    v_entity || '.update',
    v_entity,
    v_entity_id,
    v_old_changed,
    v_new_changed
  );

  return null;
end;
$$;

comment on function audit_row_change is
  'Trigger generico. Recibe el tipo de entidad en TG_ARGV[0]. En UPDATE registra solo los campos modificados.';

-- -----------------------------------------------------------------------------
-- Instalacion de triggers (BR-D01)
--
-- Cubre: creacion y edicion de rifas, creacion y edicion de boletas, cambio de
-- numeros, asignacion de vendedor, asignacion de cliente, aprobacion y anulacion
-- de boletas (todo ello visible como cambios de columna), y creacion/activacion/
-- desactivacion/cambio de rol de usuarios.
--
-- payments no lleva trigger generico: su ciclo de vida (creacion y anulacion) lo
-- registran explicitamente las RPC de 0007 con acciones semanticas, junto con el
-- detalle de las asignaciones.
-- -----------------------------------------------------------------------------
create trigger audit_raffles
  after insert or update or delete on raffles
  for each row execute function audit_row_change('raffle');

create trigger audit_tickets
  after insert or update or delete on tickets
  for each row execute function audit_row_change('ticket');

create trigger audit_clients
  after insert or update or delete on clients
  for each row execute function audit_row_change('client');

create trigger audit_memberships
  after insert or update or delete on memberships
  for each row execute function audit_row_change('membership');

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
-- drop trigger audit_memberships on memberships;
-- drop trigger audit_clients on clients;
-- drop trigger audit_tickets on tickets;
-- drop trigger audit_raffles on raffles;
-- drop function audit_row_change();
-- drop function write_audit_log(uuid, text, text, uuid, jsonb, jsonb);
-- =============================================================================
