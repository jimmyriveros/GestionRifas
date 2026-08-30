import 'server-only'

import {
  buildLotteryDashboard,
  LOTTERY_DASHBOARD_MATCH_SELECT,
  LOTTERY_DASHBOARD_SCHEDULE_SELECT,
  lotteryDashboardWindow,
  type LotteryDashboard,
  type LotteryMatchSnapshot,
  type LotteryScheduleSnapshot,
} from '@/features/lottery/dashboard'
import { LOTTERY_CODES, type LotteryCode } from '@/features/lottery/constants'
import { createClient } from '@/lib/supabase/server'
import { todayBogota } from '@/lib/dates'

/**
 * Lectura del recuadro de resultados para el Panel (D-147, BR-L20).
 *
 * Solo tablas locales. No importa adaptadores, descarga ni sincronizacion:
 * una fuente oficial caida no puede afectar esta consulta. La RLS de
 * `lottery_ticket_matches` recorta las coincidencias al ambito de quien
 * pregunta; programacion y resultado son nacionales (D-141).
 *
 * Un error se convierte en `{ kind: 'error' }` para que el resto del Panel
 * siga pintandose.
 */

type ResultEmbed = {
  id: string
  winning_number: string | null
  series: string | null
  validation_status: NonNullable<LotteryScheduleSnapshot['result']>['validationStatus']
  source_url: string | null
  fetched_at: string
  confirmed_at: string | null
}

type ScheduleQueryRow = {
  id: string
  lottery_code: string
  draw_number: string
  reference_date: string
  original_scheduled_at: string | null
  official_scheduled_at: string | null
  schedule_status: LotteryScheduleSnapshot['scheduleStatus']
  change_reason: LotteryScheduleSnapshot['changeReason']
  source_url: string | null
  source_authority: string | null
  verified_at: string | null
  lottery_results: ResultEmbed | ResultEmbed[] | null
}

type MatchQueryRow = {
  result_id: string
  assignment_status: LotteryMatchSnapshot['assignmentStatus']
  matched_number: string
  ticket_id: string
  raffle: { name: string } | { name: string }[] | null
  ticket:
    | { daily_number: string | null; weekly_number: string | null }
    | { daily_number: string | null; weekly_number: string | null }[]
    | null
  client: { name: string } | { name: string }[] | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function isLotteryCode(value: string): value is LotteryCode {
  return (LOTTERY_CODES as readonly string[]).includes(value)
}

export async function getLotteryDashboard(now: Date = new Date()): Promise<LotteryDashboard> {
  try {
    const supabase = await createClient()
    const today = todayBogota()
    const window = lotteryDashboardWindow(today)

    const { data: scheduleRows, error: scheduleError } = await supabase
      .from('lottery_draw_schedules')
      .select(LOTTERY_DASHBOARD_SCHEDULE_SELECT)
      .gte('reference_date', window.from)
      .lte('reference_date', window.to)
      .order('official_scheduled_at', { ascending: true, nullsFirst: false })

    if (scheduleError) return { kind: 'error' }

    const snapshots: LotteryScheduleSnapshot[] = []
    const resultIds: string[] = []

    for (const row of (scheduleRows ?? []) as unknown as ScheduleQueryRow[]) {
      if (!isLotteryCode(row.lottery_code)) continue
      const result = one(row.lottery_results)
      if (result) resultIds.push(result.id)
      snapshots.push({
        id: row.id,
        lotteryCode: row.lottery_code,
        drawNumber: row.draw_number,
        referenceDate: row.reference_date,
        originalScheduledAt: row.original_scheduled_at,
        officialScheduledAt: row.official_scheduled_at,
        scheduleStatus: row.schedule_status,
        changeReason: row.change_reason,
        sourceUrl: row.source_url,
        sourceAuthority: row.source_authority,
        verifiedAt: row.verified_at,
        result: result
          ? {
              id: result.id,
              winningNumber: result.winning_number,
              series: result.series,
              validationStatus: result.validation_status,
              sourceUrl: result.source_url,
              fetchedAt: result.fetched_at,
              confirmedAt: result.confirmed_at,
            }
          : null,
        matches: [],
      })
    }

    if (resultIds.length === 0) {
      return buildLotteryDashboard(snapshots, today, now)
    }

    const { data: matchRows, error: matchError } = await supabase
      .from('lottery_ticket_matches')
      .select(LOTTERY_DASHBOARD_MATCH_SELECT)
      .in('result_id', resultIds)

    if (matchError) return { kind: 'error' }

    const matchesByResult = new Map<string, LotteryMatchSnapshot[]>()
    for (const row of (matchRows ?? []) as unknown as MatchQueryRow[]) {
      const raffle = one(row.raffle)
      const ticket = one(row.ticket)
      const client = one(row.client)
      const list = matchesByResult.get(row.result_id) ?? []
      list.push({
        ticketId: row.ticket_id,
        assignmentStatus: row.assignment_status,
        matchedNumber: row.matched_number,
        raffleName: raffle?.name ?? null,
        dailyNumber: ticket?.daily_number ?? null,
        weeklyNumber: ticket?.weekly_number ?? null,
        clientName: client?.name ?? null,
      })
      matchesByResult.set(row.result_id, list)
    }

    for (const snapshot of snapshots) {
      if (!snapshot.result) continue
      snapshot.matches = matchesByResult.get(snapshot.result.id) ?? []
    }

    return buildLotteryDashboard(snapshots, today, now)
  } catch {
    return { kind: 'error' }
  }
}
