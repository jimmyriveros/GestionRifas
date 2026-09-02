-- =============================================================================
-- 0045_lottery_source_observations.sql
-- Observaciones por fuente y confirmacion por consenso
--
-- Referencia normativa: docs/DECISIONS.md D-162, docs/BUSINESS_RULES.md BR-L26.
-- Reutiliza 0036 (lottery_draw_schedules, lottery_results, el disparador
-- lottery_results_protect_confirmed) y 0037 (confirm_lottery_result,
-- match_lottery_result).
--
-- QUE PROBLEMA RESUELVE
--
-- Hasta hoy un resultado solo podia venir de la fuente oficial, y tres de las
-- seis loterias no la tienen utilizable: Cundinamarca publica actas escaneadas
-- (I-086), Bogota esta tras un desafio de Cloudflare (I-087) y el Meta bloquea
-- a la IP de Vercel (I-091). Esos sorteos se quedaban sin resultado para
-- siempre.
--
-- La salida NO es fiarse de un agregador: es exigir que el MISMO numero
-- aparezca en al menos DOS dominios distintos antes de confirmarlo (BR-L26).
-- Una sola fuente no confirma nunca, por buena que parezca.
--
-- POR QUE UNA TABLA NUEVA Y NO EL `evidence` DE `lottery_results`
--
-- Se evaluo reutilizar `lottery_results.evidence` (REUSE) y no sirve, por tres
-- razones que no son de gusto:
--
--   1. `lottery_results` tiene UNIQUE (schedule_id): una fila por sorteo. Las
--      observaciones son VARIAS por sorteo, una por fuente, y hay que poder
--      añadirlas de a una entre ticks distintos.
--   2. Mientras no hay consenso NO existe fila de resultado donde guardarlas,
--      y crear una `pending` con un numero sin confirmar es exactamente lo que
--      BR-L26 prohibe: pondria un numero no verificado al alcance del matching.
--   3. Un `jsonb` no tiene UNIQUE (schedule_id, source_id), asi que dos ticks
--      seguidos duplicarian la observacion de la misma fuente y la fabricarian
--      «consenso» ellos solos. La unicidad tiene que ser del motor.
--
-- Por eso CREATE, y pequeña: nueve columnas y un indice.
--
-- LO QUE ESTA TABLA NO GUARDA
--
-- Ni HTML, ni PDF, ni capturas, ni texto sin procesar (BR-L16). Solo los
-- campos extraidos, la URL final, el hash y la hora.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- lottery_source_observations
-- -----------------------------------------------------------------------------
create table lottery_source_observations (
  id                   uuid primary key default gen_random_uuid(),
  schedule_id          uuid not null
    references lottery_draw_schedules (id) on delete cascade,
  -- Identidad de la fuente = DOMINIO. La pagina exterior de Paga Todo y su
  -- iframe son el mismo `source_id` a proposito: contarlos como dos seria
  -- fabricar un consenso con una sola fuente (BR-L26).
  source_id            text not null check (
    source_id in ('official', 'pagatodo', 'perlatodo', 'ganarchance', 'loteriasdehoy')
  ),
  source_class         text not null check (source_class in ('official', 'alternative')),
  source_url           text not null check (source_url ~ '^https://'),
  observed_date        date not null,
  winning_number       text not null check (winning_number ~ '^[0-9]{4}$'),
  series               text check (series is null or series ~ '^[0-9]{1,3}$'),
  -- Solo si la fuente lo publica. Nunca se rellena con el de la programacion:
  -- que la fuente NO diga el sorteo es un dato, y se conserva como nulo.
  observed_draw_number text check (observed_draw_number is null or observed_draw_number ~ '^[0-9]{1,32}$'),
  content_hash         text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  fetched_at           timestamptz not null default now(),
  evidence             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Una observacion por fuente y por sorteo. Es lo que hace el consenso
  -- honesto: dos ticks de la misma fuente no suman dos votos, actualizan uno.
  constraint lottery_source_observations_source_key unique (schedule_id, source_id),
  -- `official` solo puede ser de clase oficial, y al reves.
  constraint lottery_source_observations_class_check check (
    (source_id = 'official') = (source_class = 'official')
  )
);

comment on table lottery_source_observations is
  'Lo que dijo CADA fuente sobre un sorteo. No confirma nada por si sola: la confirmacion exige dos dominios distintos con el mismo numero (BR-L26, D-162). No guarda documentos (BR-L16).';

comment on column lottery_source_observations.source_id is
  'Dominio de la fuente. Dos rutas del mismo sitio comparten source_id: no son dos fuentes.';

create trigger lottery_source_observations_set_updated_at
  before update on lottery_source_observations
  for each row execute function set_updated_at();

-- El consenso pregunta siempre lo mismo: las observaciones de ESTE sorteo.
create index lottery_source_observations_schedule_idx
  on lottery_source_observations (schedule_id, source_class);

-- -----------------------------------------------------------------------------
-- lottery_sync_runs.strategy — los intentos se cuentan por ESTRATEGIA
--
-- Sin esto, los sorteos que ya gastaron sus seis intentos contra una fuente
-- oficial rota (Cundinamarca 4818, Bogota 2861, Meta 3313) nunca probarian la
-- via nueva: `decideResultFetch` los da por agotados y devuelve `skip`.
--
-- La alternativa habria sido borrar o reescribir `lottery_sync_runs`, y eso
-- destruye la bitacora de por que fallaron. Con una columna, las filas viejas
-- se quedan como estan —son intentos `official`, que es la verdad— y el
-- contador de `alternative` empieza en cero para todos. Nadie reinicia nada.
-- -----------------------------------------------------------------------------
alter table lottery_sync_runs
  add column strategy text not null default 'official'
    check (strategy in ('official', 'alternative'));

comment on column lottery_sync_runs.strategy is
  'Con que via se intento: la fuente oficial o el consenso alternativo. Los reintentos se cuentan por sorteo Y por estrategia (BR-L26, D-162).';

create index lottery_sync_runs_strategy_idx
  on lottery_sync_runs (schedule_id, strategy, started_at desc)
  where schedule_id is not null;

-- -----------------------------------------------------------------------------
-- RLS: bitacora operativa, como lottery_sync_runs (0036)
--
-- Sin politica de SELECT para `authenticated`: un vendedor no tiene por que
-- ver numeros que todavia no estan confirmados. El Panel no lee esta tabla.
-- -----------------------------------------------------------------------------
alter table lottery_source_observations enable row level security;
alter table lottery_source_observations force  row level security;

-- -----------------------------------------------------------------------------
-- `alternative_consensus` como tipo de fuente de un resultado
--
-- El Panel tiene que poder decir de donde salio un numero sin mentir: un
-- resultado por consenso NO se presenta como oficial (D-162).
-- -----------------------------------------------------------------------------
alter table lottery_results
  drop constraint lottery_results_source_kind_check;

alter table lottery_results
  add constraint lottery_results_source_kind_check check (
    source_kind is null
    or source_kind in (
      'official_page', 'official_bulletin', 'official_act', 'cnjsa_schedule',
      'alternative_consensus'
    )
  );

-- `confirm_lottery_result` (0037) NO se toca. Valida el tipo tambien en su
-- cuerpo, con su propia lista de cuatro, y reemplazarla obligaria a copiar sus
-- 250 lineas dentro de esta migracion —con el riesgo de que las dos versiones
-- se separen sin que nadie lo note—. Como su comprobacion es
-- `p_source_kind is not null and ... not in (...)`, un `null` pasa: se confirma
-- con tipo nulo y se fija la procedencia justo despues, en la misma
-- transaccion. El disparador `lottery_results_protect_confirmed` solo reacciona
-- al numero mayor, asi que escribir `source_kind` no lo despierta.

-- -----------------------------------------------------------------------------
-- record_lottery_observations — la unica puerta para una observacion
--
-- Recibe TODAS las observaciones de un tick para un sorteo, las guarda de
-- forma idempotente y evalua el consenso en la MISMA transaccion. Si se
-- alcanza, confirma llamando a `confirm_lottery_result`, que es quien hace el
-- matching y los avisos: no hay una segunda ruta de confirmacion.
--
-- Devuelve siempre el estado, tambien cuando no confirma, para que el tick lo
-- registre en `lottery_sync_runs` sin volver a consultar.
-- -----------------------------------------------------------------------------
create function record_lottery_observations(
  p_schedule_id  uuid,
  p_observations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_schedule       lottery_draw_schedules;
  v_item           jsonb;
  v_official_date  date;
  v_stored         integer := 0;
  v_top_number     text;
  v_top_sources    integer := 0;
  v_tied           integer := 0;
  v_sources        text[];
  v_confirm        jsonb;
  v_existing       lottery_results;
begin
  select * into v_schedule
    from lottery_draw_schedules
   where id = p_schedule_id
   for update;
  if not found then
    raise exception 'No hay programacion para ese sorteo.';
  end if;
  if v_schedule.official_scheduled_at is null then
    raise exception 'Este sorteo no tiene horario oficial.';
  end if;

  v_official_date := (v_schedule.official_scheduled_at at time zone 'America/Bogota')::date;

  -- 1) Guardar cada observacion. Una fecha que no es la del sorteo se
  --    DESCARTA aqui: no se guarda, no vota y no se puede confundir despues.
  for v_item in select * from jsonb_array_elements(coalesce(p_observations, '[]'::jsonb))
  loop
    if (v_item->>'winning_number') !~ '^[0-9]{4}$' then
      continue;
    end if;
    if (v_item->>'observed_date')::date is distinct from v_official_date
       and (v_item->>'observed_date')::date is distinct from (v_official_date + 1) then
      continue;
    end if;
    -- Si la fuente publica numero de sorteo, tiene que ser EL del cronograma.
    if (v_item->>'observed_draw_number') is not null
       and (v_item->>'observed_draw_number') is distinct from v_schedule.draw_number then
      continue;
    end if;

    insert into lottery_source_observations (
      schedule_id, source_id, source_class, source_url, observed_date,
      winning_number, series, observed_draw_number, content_hash, fetched_at, evidence
    ) values (
      p_schedule_id,
      v_item->>'source_id',
      v_item->>'source_class',
      v_item->>'source_url',
      (v_item->>'observed_date')::date,
      v_item->>'winning_number',
      nullif(v_item->>'series', ''),
      nullif(v_item->>'observed_draw_number', ''),
      nullif(v_item->>'content_hash', ''),
      coalesce((v_item->>'fetched_at')::timestamptz, now()),
      coalesce(v_item->'evidence', '{}'::jsonb)
    )
    on conflict (schedule_id, source_id) do update
      set source_url           = excluded.source_url,
          observed_date        = excluded.observed_date,
          winning_number       = excluded.winning_number,
          series               = excluded.series,
          observed_draw_number = excluded.observed_draw_number,
          content_hash         = excluded.content_hash,
          fetched_at           = excluded.fetched_at,
          evidence             = excluded.evidence;
    v_stored := v_stored + 1;
  end loop;

  -- 2) Contar votos: cuantos DOMINIOS distintos respaldan cada numero.
  select o.winning_number, o.n, array_agg_sources
    into v_top_number, v_top_sources, v_sources
    from (
      select winning_number,
             count(distinct source_id) as n,
             array_agg(distinct source_id order by source_id) as array_agg_sources
        from lottery_source_observations
       where schedule_id = p_schedule_id
         and source_class = 'alternative'
       group by winning_number
       order by n desc, winning_number asc
       limit 1
    ) o;

  if v_top_number is null then
    return jsonb_build_object(
      'stored', v_stored, 'consensus', false, 'reason', 'sin_observaciones'
    );
  end if;

  -- Empate real: dos numeros distintos con dos o mas fuentes cada uno.
  select count(*) into v_tied
    from (
      select winning_number
        from lottery_source_observations
       where schedule_id = p_schedule_id
         and source_class = 'alternative'
       group by winning_number
      having count(distinct source_id) >= 2
    ) t;

  if v_tied > 1 then
    -- No se confirma NADA y no hay matching. El conflicto queda en la tabla
    -- de observaciones, que es donde se puede auditar cual dijo que.
    return jsonb_build_object(
      'stored', v_stored, 'consensus', false, 'reason', 'conflicto_entre_fuentes',
      'tied_numbers', v_tied
    );
  end if;

  if v_top_sources < 2 then
    return jsonb_build_object(
      'stored', v_stored, 'consensus', false, 'reason', 'una_sola_fuente',
      'number', v_top_number, 'sources', to_jsonb(v_sources)
    );
  end if;

  -- 3) Consenso. Si ya hay un resultado confirmado, no se vuelve a confirmar:
  --    el disparador de 0036 ya protege el numero, pero repetir la llamada
  --    reharia el matching sin necesidad.
  select * into v_existing from lottery_results where schedule_id = p_schedule_id;
  if found and v_existing.validation_status in ('confirmed', 'conflict')
     and v_existing.winning_number = v_top_number then
    return jsonb_build_object(
      'stored', v_stored, 'consensus', true, 'already_confirmed', true,
      'number', v_top_number, 'sources', to_jsonb(v_sources)
    );
  end if;

  v_confirm := confirm_lottery_result(
    v_schedule.lottery_code,
    v_schedule.draw_number,
    v_top_number,
    null,
    'https://' || (v_sources)[1] || '/',
    null,
    null,
    jsonb_build_object(
      'lottery_code', v_schedule.lottery_code,
      'draw_number', v_schedule.draw_number,
      'official_date', v_official_date,
      'consensus_sources', to_jsonb(v_sources),
      'consensus_count', v_top_sources
    ),
    v_official_date,
    now(),
    null
  );

  -- La procedencia, ahora que la fila existe. Es lo que permite al Panel decir
  -- «Verificado por 2 fuentes» en vez de hacerlo pasar por oficial (D-162).
  update lottery_results
     set source_kind = 'alternative_consensus'
   where schedule_id = p_schedule_id
     and source_kind is null;

  return jsonb_build_object(
    'stored', v_stored, 'consensus', true, 'number', v_top_number,
    'sources', to_jsonb(v_sources), 'confirm', v_confirm
  );
end;
$$;

revoke execute on function record_lottery_observations(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function record_lottery_observations(uuid, jsonb) to service_role;

comment on function record_lottery_observations(uuid, jsonb) is
  'Guarda lo que dijo cada fuente sobre un sorteo y confirma solo si dos dominios distintos coinciden (BR-L26, D-162).';

-- =============================================================================
-- Nota de reversion (manual, no ejecutable)
--
--   drop function if exists record_lottery_observations(uuid, jsonb);
--   drop table if exists lottery_source_observations;
--   alter table lottery_results drop constraint lottery_results_source_kind_check;
--   alter table lottery_results add constraint lottery_results_source_kind_check
--     check (source_kind is null or source_kind in
--       ('official_page','official_bulletin','official_act','cnjsa_schedule'));
--   -- y restaurar confirm_lottery_result tal como la define 0037.
-- =============================================================================
