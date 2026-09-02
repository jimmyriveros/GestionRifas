import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/types/database.types'

import { fetchLotteryResultForDraw } from './adapters'
import { collectConsensusForDraw, createTickPageCache, type TickPageCache } from './consensus'
import { LOTTERY_RESULT_SYNC, type LotteryCode } from './constants'
import {
  bogotaIsoDate,
  classifyOfficialResultFit,
  decideResultFetch,
  resultSyncHorizon,
} from './publication'
import type { AdapterOutcome, NormalizedLotteryResult, NormalizedSchedule } from './types'

export type LotteryDb = SupabaseClient<Database>

/**
 * Con que via se intento un resultado (D-162, BR-L26). Los reintentos se
 * cuentan por sorteo Y por estrategia: un sorteo que agoto sus seis intentos
 * contra una fuente oficial rota empieza de cero en la via alternativa, sin
 * que nadie borre ni reescriba la bitacora anterior.
 */
export type LotterySyncStrategy = 'official' | 'alternative'

export type LotterySyncSource = {
  url: string
  authority: string
  documentVersion: string | null
  contentHash: string
  verifiedAt?: string
}

export type ScheduleSyncCounts = {
  inserted: number
  changed: number
  skipped: number
  conflicts: number
}

export type ConfirmResultOutcome = {
  resultId: string
  validationStatus: string
  matchesInserted: number
  notificationsInserted: number
  scheduleStatus: string
}

function asRecord(value: Json | null): Record<string, Json | undefined> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value
  }
  return {}
}

function asNumber(value: Json | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: Json | undefined): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export async function applyLotterySchedule(
  client: LotteryDb,
  schedule: NormalizedSchedule,
  source: LotterySyncSource,
): Promise<ScheduleSyncCounts> {
  const draws: Json = schedule.draws.map((draw) => ({
    lottery_code: draw.lotteryCode,
    draw_number: draw.drawNumber,
    reference_date: draw.referenceDate,
    original_scheduled_at: draw.originalScheduledAt,
    official_scheduled_at: draw.officialScheduledAt,
    schedule_status: draw.scheduleStatus,
    change_reason: draw.changeReason,
  }))

  const { data, error } = await client.rpc('sync_lottery_schedules', {
    p_draws: draws,
    p_source: {
      url: source.url,
      authority: source.authority,
      document_version: source.documentVersion,
      content_hash: source.contentHash,
      verified_at: source.verifiedAt ?? new Date().toISOString(),
    },
  })
  if (error) throw error

  const row = asRecord(data)
  return {
    inserted: asNumber(row.inserted),
    changed: asNumber(row.changed),
    skipped: asNumber(row.skipped),
    conflicts: asNumber(row.conflicts),
  }
}

export async function notifyDueScheduleChanges(
  client: LotteryDb,
  now: Date = new Date(),
): Promise<{ considered: number; inserted: number }> {
  const { data, error } = await client.rpc('notify_lottery_schedule_changes', {
    p_now: now.toISOString(),
  })
  if (error) throw error
  const row = asRecord(data)
  return {
    considered: asNumber(row.considered),
    inserted: asNumber(row.inserted),
  }
}

export async function confirmOfficialResult(
  client: LotteryDb,
  input: {
    lotteryCode: LotteryCode
    drawNumber: string
    winningNumber: string
    series?: string | null
    sourceUrl: string
    sourceKind?: 'official_page' | 'official_bulletin' | 'official_act'
    sourceContentHash?: string | null
    officialDate: string
    fetchedAt?: string
    publishedAt?: string | null
    evidence?: Record<string, string | number | null>
  },
): Promise<ConfirmResultOutcome> {
  const { data, error } = await client.rpc('confirm_lottery_result', {
    p_lottery_code: input.lotteryCode,
    p_draw_number: input.drawNumber,
    p_winning_number: input.winningNumber,
    p_series: input.series ?? undefined,
    p_source_url: input.sourceUrl,
    p_source_kind: input.sourceKind ?? 'official_page',
    p_source_content_hash: input.sourceContentHash ?? undefined,
    // Evidencia estructurada y minima. Nunca el documento ni su texto
    // (BR-L16, BR-L23): solo campos extraidos y cifras de la lectura.
    p_evidence: {
      lottery_code: input.lotteryCode,
      draw_number: input.drawNumber,
      official_date: input.officialDate,
      ...(input.evidence ?? {}),
    },
    p_official_date: input.officialDate,
    p_fetched_at: input.fetchedAt ?? new Date().toISOString(),
    p_published_at: input.publishedAt ?? undefined,
  })
  if (error) throw error
  const row = asRecord(data)
  return {
    resultId: asString(row.result_id) ?? '',
    validationStatus: asString(row.validation_status) ?? 'pending',
    matchesInserted: asNumber(row.matches_inserted),
    notificationsInserted: asNumber(row.notifications_inserted),
    scheduleStatus: asString(row.schedule_status) ?? 'scheduled',
  }
}

export type PendingDrawRow = {
  id: string
  lotteryCode: LotteryCode
  drawNumber: string
  officialScheduledAt: string
  referenceDate: string
  scheduleStatus: string
  validationStatus: ResultFetchInputStatus
}

type ResultFetchInputStatus = 'none' | 'pending' | 'confirmed' | 'rejected' | 'conflict'

/**
 * Sorteos que un tick puede consultar (D-152, BR-L22).
 *
 * Tres limites, y los tres viven en la CONSULTA, no en un filtro posterior:
 *
 *   1. Horizonte reciente: solo sorteos ya jugados dentro de los ultimos
 *      `lookbehindDays`. El cronograma anual se conserva entero —hace falta
 *      para avisar de cambios y festivos (BR-L18)—, pero un sorteo de hace
 *      cinco meses no se descarga.
 *   2. Orden determinista: del mas reciente al mas antiguo y, a igualdad de
 *      instante, por codigo de loteria. Dos ticks con los mismos datos eligen
 *      exactamente los mismos sorteos.
 *   3. Tope de filas examinadas.
 *
 * `limit` es el tope de candidatos, no de descargas: esa cuenta la lleva
 * `syncDueLotteryResults`.
 */
export async function loadPendingResultDraws(
  client: LotteryDb,
  input: { now?: Date; limit?: number } = {},
): Promise<PendingDrawRow[]> {
  const horizon = resultSyncHorizon(input.now ?? new Date())
  const limit = input.limit ?? LOTTERY_RESULT_SYNC.maxCandidates

  const { data, error } = await client
    .from('lottery_draw_schedules')
    .select('id, lottery_code, draw_number, official_scheduled_at, reference_date, schedule_status')
    .in('schedule_status', ['scheduled', 'rescheduled_later', 'rescheduled_earlier'])
    .not('official_scheduled_at', 'is', null)
    .gte('official_scheduled_at', horizon.fromIso)
    .lte('official_scheduled_at', horizon.toIso)
    .order('official_scheduled_at', { ascending: false })
    .order('lottery_code', { ascending: true })
    .limit(limit)
  if (error) throw error

  const rows = (data ?? []).filter(
    (row): row is typeof row & { official_scheduled_at: string } =>
      row.official_scheduled_at !== null,
  )
  if (rows.length === 0) return []

  const { data: results, error: resultsError } = await client
    .from('lottery_results')
    .select('schedule_id, validation_status')
    .in(
      'schedule_id',
      rows.map((row) => row.id),
    )
  if (resultsError) throw resultsError

  const statusBySchedule = new Map(
    (results ?? []).map((row) => [
      row.schedule_id,
      row.validation_status as ResultFetchInputStatus,
    ]),
  )

  return rows.map((row) => ({
    id: row.id,
    lotteryCode: row.lottery_code,
    drawNumber: row.draw_number,
    officialScheduledAt: row.official_scheduled_at,
    referenceDate: row.reference_date,
    scheduleStatus: row.schedule_status,
    validationStatus: statusBySchedule.get(row.id) ?? 'none',
  }))
}

export async function loadScheduleSyncMeta(client: LotteryDb): Promise<{
  lastSuccessAt: string | null
  lastAttemptAt: string | null
}> {
  const { data, error } = await client
    .from('lottery_sync_runs')
    .select('started_at, finished_at, outcome')
    .eq('kind', 'schedule')
    .order('started_at', { ascending: false })
    .limit(30)
  if (error) throw error

  const rows = data ?? []
  const lastAttemptAt = rows[0]?.started_at ?? null
  const success = rows.find((row) => row.outcome === 'success' || row.outcome === 'partial')
  return {
    lastSuccessAt: success?.finished_at ?? success?.started_at ?? null,
    lastAttemptAt,
  }
}

export async function tryAcquireLotterySyncLock(
  client: LotteryDb,
  holder: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('try_acquire_lottery_sync_lock', {
    p_holder: holder,
  })
  if (error) throw error
  return data === true
}

export async function releaseLotterySyncLock(client: LotteryDb, holder: string): Promise<boolean> {
  const { data, error } = await client.rpc('release_lottery_sync_lock', {
    p_holder: holder,
  })
  if (error) throw error
  return data === true
}

/**
 * Intentos de ESTE sorteo, no de esta loteria (D-152, BR-L22).
 *
 * Contarlos por `lottery_code` mezclaba sorteos: Cundinamarca juega todos los
 * lunes, y con dos fechas abiertas cada intento de la mas nueva envejecia el
 * cupo de la mas vieja. `schedule_id` (migracion `0041`) los separa.
 */
export async function countResultAttempts(
  client: LotteryDb,
  scheduleId: string,
  strategy: LotterySyncStrategy = 'official',
): Promise<{ failedAttempts: number; lastAttemptAt: string | null; lastErrorCode: string | null }> {
  const { data, error } = await client
    .from('lottery_sync_runs')
    .select('started_at, outcome, error_code')
    .eq('kind', 'results')
    .eq('schedule_id', scheduleId)
    .eq('strategy', strategy)
    .order('started_at', { ascending: false })
  if (error) throw error

  const rows = data ?? []
  const last = rows[0]
  return {
    failedAttempts: rows.filter((row) => row.outcome === 'failed').length,
    lastAttemptAt: last?.started_at ?? null,
    lastErrorCode: last?.error_code ?? null,
  }
}

export async function recordLotterySyncRun(
  client: LotteryDb,
  input: {
    kind: 'schedule' | 'results'
    lotteryCode?: LotteryCode | null
    scheduleId?: string | null
    attempt?: number
    correlationId?: string | null
    strategy?: LotterySyncStrategy
  },
): Promise<string> {
  const { data, error } = await client
    .from('lottery_sync_runs')
    .insert({
      kind: input.kind,
      lottery_code: input.lotteryCode ?? null,
      schedule_id: input.scheduleId ?? null,
      attempt: input.attempt ?? 1,
      correlation_id: input.correlationId ?? null,
      strategy: input.strategy ?? 'official',
      outcome: 'failed',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function finishLotterySyncRun(
  client: LotteryDb,
  id: string,
  input: {
    outcome: 'success' | 'partial' | 'failed' | 'skipped'
    recordsRead?: number
    recordsChanged?: number
    recordsSkipped?: number
    errorCode?: string | null
  },
): Promise<void> {
  const { error } = await client
    .from('lottery_sync_runs')
    .update({
      outcome: input.outcome,
      finished_at: new Date().toISOString(),
      records_read: input.recordsRead ?? 0,
      records_changed: input.recordsChanged ?? 0,
      records_skipped: input.recordsSkipped ?? 0,
      error_code: input.errorCode ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function confirmAdapterResult(
  client: LotteryDb,
  schedule: PendingDrawRow,
  extracted: AdapterOutcome<NormalizedLotteryResult>,
): Promise<ConfirmResultOutcome | { skipped: true; code: string }> {
  if (!extracted.ok) {
    return { skipped: true, code: extracted.code }
  }
  // Una portada que todavia muestra el sorteo anterior no es un formato roto:
  // es un resultado que aun no esta publicado, y se reintenta (D-154).
  const fit = classifyOfficialResultFit(extracted.value, {
    lotteryCode: schedule.lotteryCode,
    drawNumber: schedule.drawNumber,
    officialScheduledAt: schedule.officialScheduledAt,
  })
  if (fit !== 'match') {
    return { skipped: true, code: fit }
  }
  return confirmOfficialResult(client, {
    lotteryCode: extracted.value.lotteryCode,
    drawNumber: extracted.value.drawNumber,
    winningNumber: extracted.value.winningNumber,
    series: extracted.value.series,
    sourceUrl: extracted.sourceUrl,
    sourceKind: extracted.value.sourceKind,
    sourceContentHash: extracted.contentHash,
    officialDate: extracted.value.officialDate,
    fetchedAt: extracted.fetchedAt,
    evidence: extracted.value.evidence,
  })
}

type FetchResultFn = (
  lottery: LotteryCode,
  drawNumber: string,
  context: { year: number },
) => Promise<AdapterOutcome<NormalizedLotteryResult>>

export type ResultsSyncCounts = {
  candidates: number
  fetched: number
  confirmed: number
  skipped: number
  failed: number
  /** Candidatos que este tick no llego a examinar: agoto su presupuesto. */
  deferred: number
  /** Confirmados por consenso alternativo, no por la fuente oficial. */
  consensusConfirmed: number
}

/**
 * Recorre sorteos locales pendientes y confirma los que ya toca consultar.
 * `fetchResult` se inyecta para las pruebas; en vivo usa los adaptadores.
 *
 * El numero de descargas externas por tick esta acotado (D-152, BR-L22):
 * como mucho `maxFetchesPerTick`. Lo que sobra no se pierde, se aplaza al
 * tick siguiente, que vuelve a mirar la misma ventana en el mismo orden.
 * Un sorteo que no toca consultar —confirmado, todavia sin publicar, en su
 * margen entre reintentos— no gasta presupuesto porque no se descarga.
 */
export async function syncDueLotteryResults(
  client: LotteryDb,
  input: {
    now?: Date
    fetchResult?: FetchResultFn
    correlationId?: string
    maxFetches?: number
    /**
     * Enciende el respaldo por consenso. **Apagado por omision, a proposito.**
     *
     * Esta etapa sale a internet, y el unico sitio del proyecto autorizado a
     * hacerlo es el tick (BR-L20). Si el respaldo estuviera encendido por
     * omision, cualquier llamada futura a esta funcion —una prueba, un script,
     * una pantalla por error— descargaria paginas externas sin querer. Con el
     * interruptor apagado eso es imposible: hay que pedirlo, y el unico que lo
     * pide es `runLotterySyncTick`.
     */
    enableAlternativeSources?: boolean
    /** Solo para pruebas: sustituye la recoleccion de fuentes alternativas. */
    collectConsensus?: typeof collectConsensusForDraw
  } = {},
): Promise<ResultsSyncCounts> {
  const now = input.now ?? new Date()
  const fetchResult = input.fetchResult ?? fetchLotteryResultForDraw
  const maxFetches = input.maxFetches ?? LOTTERY_RESULT_SYNC.maxFetchesPerTick
  const pending = await loadPendingResultDraws(client, { now })
  // El presupuesto es UNO para las dos vias: oficiales y alternativas salen
  // del mismo bolsillo de seis descargas por tick (BR-L22, BR-L26).
  const pageCache = createTickPageCache()
  let fetched = 0
  let confirmed = 0
  let skipped = 0
  let failed = 0
  let deferred = 0
  let consensusConfirmed = 0

  for (const draw of pending) {
    if (fetched >= maxFetches) {
      deferred += 1
      continue
    }

    const attempts = await countResultAttempts(client, draw.id)
    const decision = decideResultFetch({
      lotteryCode: draw.lotteryCode,
      officialScheduledAt: draw.officialScheduledAt,
      now,
      validationStatus: draw.validationStatus,
      failedAttempts: attempts.failedAttempts,
      lastAttemptAt: attempts.lastAttemptAt,
      lastErrorCode: attempts.lastErrorCode,
    })
    if (decision !== 'fetch') {
      skipped += 1
      continue
    }

    const runId = await recordLotterySyncRun(client, {
      kind: 'results',
      lotteryCode: draw.lotteryCode,
      scheduleId: draw.id,
      attempt: attempts.failedAttempts + 1,
      correlationId: input.correlationId ?? null,
    })
    fetched += 1
    try {
      // El ano sale de la programacion oficial, no de la fecha de hoy: el
      // acta de un sorteo del 31 de diciembre se archiva bajo SU ano (D-153).
      const year = Number(bogotaIsoDate(draw.officialScheduledAt).slice(0, 4))
      const extracted = await fetchResult(draw.lotteryCode, draw.drawNumber, { year })
      const outcome = await confirmAdapterResult(client, draw, extracted)
      if ('skipped' in outcome) {
        failed += 1
        await finishLotterySyncRun(client, runId, {
          outcome: 'failed',
          recordsRead: 1,
          errorCode: outcome.code,
        })
        // La fuente oficial no pudo entregar ESTE sorteo. Es justo el caso
        // que activa el respaldo: se intenta el consenso con lo que quede de
        // presupuesto (BR-L26). Un resultado oficial VALIDO pero distinto no
        // llega aqui —lo habria confirmado—, asi que un conflicto nunca se
        // resuelve en silencio con agregadores.
        if (input.enableAlternativeSources || input.collectConsensus) {
          const gastadas = await tryAlternativeConsensus(client, draw, {
            now,
            budget: maxFetches - fetched,
            cache: pageCache,
            correlationId: input.correlationId ?? null,
            collect: input.collectConsensus,
          })
          fetched += gastadas.downloads
          if (gastadas.confirmed) consensusConfirmed += 1
        }
        continue
      }
      confirmed += 1
      await finishLotterySyncRun(client, runId, {
        outcome: outcome.validationStatus === 'conflict' ? 'partial' : 'success',
        recordsRead: 1,
        recordsChanged: 1,
      })
    } catch {
      failed += 1
      await finishLotterySyncRun(client, runId, {
        outcome: 'failed',
        recordsRead: 1,
        errorCode: 'rpc_error',
      })
    }
  }

  return {
    candidates: pending.length,
    fetched,
    confirmed,
    skipped,
    failed,
    deferred,
    consensusConfirmed,
  }
}

/**
 * Respaldo por consenso de un sorteo cuya fuente oficial no sirvio (BR-L26).
 *
 * Lleva su propia cuenta de intentos —`strategy = 'alternative'`— para que un
 * sorteo que agoto sus seis intentos contra una fuente oficial rota pueda
 * probar esta via sin que nadie borre ni reescriba la bitacora anterior
 * (D-162). Devuelve cuantas descargas gasto, que el llamador resta del
 * presupuesto del tick.
 */
async function tryAlternativeConsensus(
  client: LotteryDb,
  draw: PendingDrawRow,
  input: {
    now: Date
    budget: number
    cache: TickPageCache
    correlationId: string | null
    collect?: typeof collectConsensusForDraw
  },
): Promise<{ downloads: number; confirmed: boolean }> {
  if (input.budget <= 0) return { downloads: 0, confirmed: false }

  const collect = input.collect ?? collectConsensusForDraw
  const attempts = await countResultAttempts(client, draw.id, 'alternative')
  const decision = decideResultFetch({
    lotteryCode: draw.lotteryCode,
    officialScheduledAt: draw.officialScheduledAt,
    now: input.now,
    validationStatus: draw.validationStatus,
    failedAttempts: attempts.failedAttempts,
    lastAttemptAt: attempts.lastAttemptAt,
    lastErrorCode: attempts.lastErrorCode,
  })
  if (decision !== 'fetch') return { downloads: 0, confirmed: false }

  const runId = await recordLotterySyncRun(client, {
    kind: 'results',
    lotteryCode: draw.lotteryCode,
    scheduleId: draw.id,
    attempt: attempts.failedAttempts + 1,
    correlationId: input.correlationId,
    strategy: 'alternative',
  })

  try {
    const outcome = await collect(
      client,
      {
        scheduleId: draw.id,
        lotteryCode: draw.lotteryCode,
        drawNumber: draw.drawNumber,
        officialDate: bogotaIsoDate(draw.officialScheduledAt),
      },
      { budget: input.budget, cache: input.cache },
    )

    const confirmed = outcome.recorded?.consensus === true
    await finishLotterySyncRun(client, runId, {
      outcome: confirmed ? 'success' : 'failed',
      recordsRead: outcome.attempts.length,
      recordsChanged: confirmed ? 1 : 0,
      errorCode: confirmed ? undefined : (outcome.recorded?.reason ?? 'sin_observaciones'),
    })
    return { downloads: outcome.downloads, confirmed }
  } catch {
    await finishLotterySyncRun(client, runId, { outcome: 'failed', errorCode: 'rpc_error' })
    return { downloads: 0, confirmed: false }
  }
}
