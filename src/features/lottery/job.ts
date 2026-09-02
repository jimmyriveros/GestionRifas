import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

import { downloadCnjsaConsolidatedSchedule } from './adapters'
import { bogotaIsoDate, shouldSyncSchedule } from './publication'
import {
  applyLotterySchedule,
  finishLotterySyncRun,
  loadScheduleSyncMeta,
  notifyDueScheduleChanges,
  recordLotterySyncRun,
  releaseLotterySyncLock,
  syncDueLotteryResults,
  tryAcquireLotterySyncLock,
  type LotteryDb,
} from './sync'
import type { AdapterOutcome, NormalizedSchedule } from './types'

export type ScheduleTickResult = {
  ran: boolean
  outcome: 'success' | 'partial' | 'failed' | 'skipped'
  inserted?: number
  changed?: number
  skipped?: number
  conflicts?: number
  notices?: number
  errorCode?: string
}

export type ResultsTickResult = {
  candidates: number
  fetched: number
  confirmed: number
  skipped: number
  failed: number
  deferred: number
  /** Solo si la etapa entera se cayo. La programacion ya sincronizada se conserva. */
  errorCode?: string
}

const NO_RESULTS: ResultsTickResult = {
  candidates: 0,
  fetched: 0,
  confirmed: 0,
  skipped: 0,
  failed: 0,
  deferred: 0,
}

export type LotteryTickSummary = {
  correlationId: string
  skipped: boolean
  reason?: 'locked'
  schedule: ScheduleTickResult
  results: ResultsTickResult
}

type FetchScheduleFn = (year: number) => Promise<AdapterOutcome<NormalizedSchedule>>

export type LotteryTickDeps = {
  now?: Date
  correlationId?: string
  client?: LotteryDb
  acquireLock?: (holder: string) => Promise<boolean>
  releaseLock?: (holder: string) => Promise<void>
  loadScheduleMeta?: () => Promise<{
    lastSuccessAt: string | null
    lastAttemptAt: string | null
  }>
  fetchSchedule?: FetchScheduleFn
  syncSchedule?: (
    client: LotteryDb,
    now: Date,
    correlationId: string,
  ) => Promise<ScheduleTickResult>
  syncResults?: (client: LotteryDb, now: Date, correlationId: string) => Promise<ResultsTickResult>
}

function sanitizeErrorCode(code: string | undefined): string {
  if (!code) return 'sync_error'
  return code.replace(/[^a-z0-9_]/gi, '_').slice(0, 64)
}

export async function syncOfficialSchedule(
  client: LotteryDb,
  input: {
    now?: Date
    correlationId?: string
    fetchSchedule?: FetchScheduleFn
  } = {},
): Promise<ScheduleTickResult> {
  const now = input.now ?? new Date()
  const year = Number(bogotaIsoDate(now).slice(0, 4))
  const fetchSchedule = input.fetchSchedule ?? downloadCnjsaConsolidatedSchedule
  const runId = await recordLotterySyncRun(client, {
    kind: 'schedule',
    correlationId: input.correlationId ?? null,
  })

  try {
    const extracted = await fetchSchedule(year)
    if (!extracted.ok) {
      const errorCode = sanitizeErrorCode(extracted.code)
      await finishLotterySyncRun(client, runId, {
        outcome: 'failed',
        errorCode,
      })
      return { ran: true, outcome: 'failed', errorCode }
    }

    const counts = await applyLotterySchedule(client, extracted.value, {
      url: extracted.sourceUrl,
      authority: extracted.value.authority,
      documentVersion: extracted.value.documentVersion,
      contentHash: extracted.contentHash,
      verifiedAt: extracted.fetchedAt,
    })
    const notices = await notifyDueScheduleChanges(client, now)
    const outcome = counts.conflicts > 0 ? 'partial' : 'success'
    await finishLotterySyncRun(client, runId, {
      outcome,
      recordsRead: extracted.value.draws.length,
      recordsChanged: counts.inserted + counts.changed,
      recordsSkipped: counts.skipped,
    })
    return {
      ran: true,
      outcome,
      inserted: counts.inserted,
      changed: counts.changed,
      skipped: counts.skipped,
      conflicts: counts.conflicts,
      notices: notices.inserted,
    }
  } catch (error) {
    const errorCode = sanitizeErrorCode(
      error instanceof Error && /timeout|network|fetch/i.test(error.message)
        ? 'network_error'
        : 'rpc_error',
    )
    await finishLotterySyncRun(client, runId, {
      outcome: 'failed',
      errorCode,
    })
    return { ran: true, outcome: 'failed', errorCode }
  }
}

/**
 * Un tick: toma el cerrojo, sincroniza programacion si toca, confirma
 * resultados pendientes y suelta. Idempotente. No se llama desde una pagina.
 */
export async function runLotterySyncTick(deps: LotteryTickDeps = {}): Promise<LotteryTickSummary> {
  const now = deps.now ?? new Date()
  const correlationId = deps.correlationId ?? crypto.randomUUID()
  const client = deps.client ?? createAdminClient()
  const acquire =
    deps.acquireLock ?? ((holder: string) => tryAcquireLotterySyncLock(client, holder))
  const release =
    deps.releaseLock ??
    ((holder: string) => releaseLotterySyncLock(client, holder).then(() => undefined))

  const locked = await acquire(correlationId)
  if (!locked) {
    return {
      correlationId,
      skipped: true,
      reason: 'locked',
      schedule: { ran: false, outcome: 'skipped' },
      results: { ...NO_RESULTS },
    }
  }

  try {
    const meta = deps.loadScheduleMeta
      ? await deps.loadScheduleMeta()
      : await loadScheduleSyncMeta(client)
    const runSchedule =
      deps.syncSchedule ??
      ((db: LotteryDb, when: Date, id: string) =>
        syncOfficialSchedule(db, {
          now: when,
          correlationId: id,
          fetchSchedule: deps.fetchSchedule,
        }))
    const schedule: ScheduleTickResult = shouldSyncSchedule({ now, ...meta })
      ? await runSchedule(client, now, correlationId)
      : { ran: false, outcome: 'skipped' }

    const syncResults =
      deps.syncResults ??
      ((db: LotteryDb, when: Date, id: string) =>
        // El tick es el UNICO sitio del proyecto que enciende el respaldo por
        // consenso: es el unico autorizado a salir a internet (BR-L20, BR-L26).
        // El interruptor esta apagado por omision en `syncDueLotteryResults`
        // justamente para que nadie mas pueda hacerlo sin querer.
        syncDueLotteryResults(db, {
          now: when,
          correlationId: id,
          enableAlternativeSources: true,
        }))

    // Las dos etapas son independientes: la programacion ya se guardo en su
    // propia transaccion (`sync_lottery_schedules`). Si la de resultados se
    // cae entera —la fuente, la red, una consulta—, el tick lo dice y
    // conserva lo que la primera dejo hecho. No se deshace nada (D-152).
    let results: ResultsTickResult
    try {
      results = await syncResults(client, now, correlationId)
    } catch (error) {
      results = {
        ...NO_RESULTS,
        errorCode: sanitizeErrorCode(
          error instanceof Error && /timeout|network|fetch/i.test(error.message)
            ? 'network_error'
            : 'results_stage_error',
        ),
      }
    }

    return { correlationId, skipped: false, schedule, results }
  } finally {
    try {
      await release(correlationId)
    } catch {
      // El cerrojo caduca solo; no tapes el resultado del tick.
    }
  }
}
