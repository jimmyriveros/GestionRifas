import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/types/database.types'

import { fetchLotteryResultForDraw } from './adapters'
import type { LotteryCode } from './constants'
import { decideResultFetch, officialResultFitsSchedule } from './publication'
import type { AdapterOutcome, NormalizedLotteryResult, NormalizedSchedule } from './types'

export type LotteryDb = SupabaseClient<Database>

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
    p_evidence: {
      lottery_code: input.lotteryCode,
      draw_number: input.drawNumber,
      official_date: input.officialDate,
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

export async function loadPendingResultDraws(client: LotteryDb): Promise<PendingDrawRow[]> {
  const { data, error } = await client
    .from('lottery_draw_schedules')
    .select('id, lottery_code, draw_number, official_scheduled_at, reference_date, schedule_status')
    .in('schedule_status', ['scheduled', 'rescheduled_later', 'rescheduled_earlier'])
    .not('official_scheduled_at', 'is', null)
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
    (results ?? []).map((row) => [row.schedule_id, row.validation_status as ResultFetchInputStatus]),
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

export async function releaseLotterySyncLock(
  client: LotteryDb,
  holder: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('release_lottery_sync_lock', {
    p_holder: holder,
  })
  if (error) throw error
  return data === true
}

export async function countResultAttempts(
  client: LotteryDb,
  lotteryCode: LotteryCode,
  sinceIso: string,
): Promise<{ failedAttempts: number; lastAttemptAt: string | null; lastErrorCode: string | null }> {
  const { data, error } = await client
    .from('lottery_sync_runs')
    .select('started_at, outcome, error_code')
    .eq('kind', 'results')
    .eq('lottery_code', lotteryCode)
    .gte('started_at', sinceIso)
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
    attempt?: number
    correlationId?: string | null
  },
): Promise<string> {
  const { data, error } = await client
    .from('lottery_sync_runs')
    .insert({
      kind: input.kind,
      lottery_code: input.lotteryCode ?? null,
      attempt: input.attempt ?? 1,
      correlation_id: input.correlationId ?? null,
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
  if (
    !officialResultFitsSchedule(extracted.value, {
      lotteryCode: schedule.lotteryCode,
      drawNumber: schedule.drawNumber,
      officialScheduledAt: schedule.officialScheduledAt,
    })
  ) {
    return { skipped: true, code: 'ambiguous' }
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
  })
}

type FetchResultFn = (
  lottery: LotteryCode,
  drawNumber: string,
) => Promise<AdapterOutcome<NormalizedLotteryResult>>

/**
 * Recorre sorteos locales pendientes y confirma los que ya toca consultar.
 * `fetchResult` se inyecta para las pruebas; en vivo usa los adaptadores.
 */
export async function syncDueLotteryResults(
  client: LotteryDb,
  input: { now?: Date; fetchResult?: FetchResultFn; correlationId?: string } = {},
): Promise<{ fetched: number; confirmed: number; skipped: number; failed: number }> {
  const now = input.now ?? new Date()
  const fetchResult = input.fetchResult ?? fetchLotteryResultForDraw
  const pending = await loadPendingResultDraws(client)
  let fetched = 0
  let confirmed = 0
  let skipped = 0
  let failed = 0

  for (const draw of pending) {
    const attempts = await countResultAttempts(client, draw.lotteryCode, draw.officialScheduledAt)
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
      attempt: attempts.failedAttempts + 1,
      correlationId: input.correlationId ?? null,
    })
    fetched += 1
    try {
      const extracted = await fetchResult(draw.lotteryCode, draw.drawNumber)
      const outcome = await confirmAdapterResult(client, draw, extracted)
      if ('skipped' in outcome) {
        failed += 1
        await finishLotterySyncRun(client, runId, {
          outcome: 'failed',
          recordsRead: 1,
          errorCode: outcome.code,
        })
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

  return { fetched, confirmed, skipped, failed }
}
