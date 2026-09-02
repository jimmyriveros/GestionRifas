/**
 * Recuadro de resultados oficiales del Panel (Etapa 4, D-147, BR-L20).
 *
 * Modulo PURO a proposito: no consulta internet ni la base. Las paginas leen
 * filas locales en `queries.ts` y este archivo decide QUE sorteo es el actual,
 * cual es el ultimo confirmado y que aviso de programacion corresponde.
 *
 * El dia que manda es el de `official_scheduled_at` en America/Bogota, no el
 * dia nominal de la loteria. Un resultado anterior nunca se presenta como el
 * de hoy.
 */

import {
  LOTTERY_ASSIGNMENT_STATUS_LABELS,
  LOTTERY_LABELS,
  type LotteryCode,
} from '@/features/lottery/constants'
import { notificationMessage } from '@/features/notifications/text'
import { isoDateBogota } from '@/lib/dates'
import { ticketLabel } from '@/lib/tickets'

import type { Database } from '@/types/database.types'

type ScheduleStatus = Database['public']['Enums']['lottery_schedule_status']
type ChangeReason = Database['public']['Enums']['lottery_schedule_change_reason']
type ValidationStatus = Database['public']['Enums']['lottery_result_validation_status']
type AssignmentStatus = Database['public']['Enums']['lottery_assignment_status']

export const LOTTERY_DASHBOARD_LOOKBEHIND_DAYS = 10
export const LOTTERY_DASHBOARD_LOOKAHEAD_DAYS = 21
export const LOTTERY_DASHBOARD_MATCH_LINKS = 6

/**
 * Plazo maximo de la lectura LOCAL del recuadro (D-155).
 *
 * Desde que el recuadro vive en su propio limite de Suspense, una consulta
 * lenta ya no retrasa el resto del Panel: solo mantiene abierto ESE hueco. El
 * plazo existe para que el hueco tampoco se quede abierto indefinidamente si
 * PostgREST deja de responder —la respuesta HTTP no se cierra hasta que el
 * limite resuelve— y para que se vea el aviso de error en vez de una espera sin
 * final.
 *
 * Cubre las DOS consultas juntas, no cada una: es el presupuesto de la lectura
 * entera. 3 s es holgado; las dos consultas medidas en local tardan ~20 ms.
 */
export const LOTTERY_DASHBOARD_TIMEOUT_MS = 3_000

/** Proyeccion de programacion + resultado. Sin HTML ni coincidencias. */
export const LOTTERY_DASHBOARD_SCHEDULE_SELECT = [
  'id',
  'lottery_code',
  'draw_number',
  'reference_date',
  'original_scheduled_at',
  'official_scheduled_at',
  'schedule_status',
  'change_reason',
  'source_url',
  'source_authority',
  'verified_at',
  'lottery_results ( id, winning_number, series, validation_status, source_url, source_kind, evidence, fetched_at, confirmed_at )',
].join(', ')

/** Coincidencias del ambito de quien pregunta, con la boleta y la rifa. */
export const LOTTERY_DASHBOARD_MATCH_SELECT = [
  'result_id',
  'assignment_status',
  'matched_number',
  'ticket_id',
  'raffle:raffles!lottery_ticket_matches_raffle_org_fk ( name )',
  'ticket:tickets!lottery_ticket_matches_ticket_org_fk ( daily_number, weekly_number )',
  'client:clients!lottery_ticket_matches_client_org_fk ( name )',
].join(', ')

export const LOTTERY_DASHBOARD_COPY = {
  title: 'Resultados oficiales',
  emptyTitle: 'Todavía no hay resultados oficiales',
  emptyDescription:
    'Cuando se publique la programación de los sorteos, el número mayor aparecerá aquí.',
  errorTitle: 'No se pudieron cargar los resultados oficiales',
  errorDescription: 'El resto del panel sigue disponible. Intenta recargar la página.',
  loading: 'Buscando los resultados oficiales…',
  pending: 'Resultado pendiente',
  rejected: 'No se pudo confirmar el resultado.',
  conflict: 'La fuente oficial publicó otro número. Requiere verificación.',
  noDrawToday: 'Hoy no hay sorteo programado.',
  lastResult: 'Último resultado',
  nextDraw: 'Próximo sorteo',
  winningNumber: 'Número mayor',
  series: 'Serie informativa',
  officialSource: 'Fuente oficial',
  // Un resultado por consenso NO se presenta como oficial (D-162, BR-L26).
  // Se dice cuantas fuentes lo respaldan, con el numero real.
  consensusSource: (fuentes: number) => `Verificado por ${fuentes} fuentes`,
  lastVerified: 'Última verificación',
  scheduleVerified: 'Programación verificada',
  weekChanges: 'Cambios de programación',
  noMatchSeller: 'Ninguna de tus boletas coincidió con este número.',
  noMatchStaff: 'Ninguna boleta coincidió con este número.',
} as const

export type LotteryDashboardAudience = 'staff' | 'seller'

export type LotteryMatchSnapshot = {
  ticketId: string
  assignmentStatus: AssignmentStatus
  matchedNumber: string
  raffleName: string | null
  dailyNumber: string | null
  weeklyNumber: string | null
  clientName: string | null
}

export type LotteryResultSnapshot = {
  id: string
  winningNumber: string | null
  series: string | null
  validationStatus: ValidationStatus
  sourceUrl: string | null
  /** `alternative_consensus` si lo confirmaron dos fuentes, no la autoridad. */
  sourceKind: string | null
  /** Cuantos dominios formaron el consenso. Nulo si vino de la fuente oficial. */
  consensusSources: number | null
  fetchedAt: string
  confirmedAt: string | null
}

export type LotteryScheduleSnapshot = {
  id: string
  lotteryCode: LotteryCode
  drawNumber: string
  referenceDate: string
  originalScheduledAt: string | null
  officialScheduledAt: string | null
  scheduleStatus: ScheduleStatus
  changeReason: ChangeReason | null
  sourceUrl: string | null
  sourceAuthority: string | null
  verifiedAt: string | null
  result: LotteryResultSnapshot | null
  matches: LotteryMatchSnapshot[]
}

export type LotteryMatchView = {
  ticketId: string
  label: string
  assignmentStatus: AssignmentStatus
  assignmentLabel: string
  raffleName: string | null
  clientName: string | null
}

export type LotteryResultKind = 'none' | 'pending' | 'confirmed' | 'rejected' | 'conflict'

export type LotteryDrawView = {
  scheduleId: string
  lotteryCode: LotteryCode
  lotteryLabel: string
  drawNumber: string
  referenceDate: string
  officialScheduledAt: string | null
  originalScheduledAt: string | null
  officialDate: string | null
  scheduleStatus: ScheduleStatus
  changeReason: ChangeReason | null
  scheduleNotice: string | null
  resultKind: LotteryResultKind
  winningNumber: string | null
  series: string | null
  sourceUrl: string | null
  sourceAuthority: string | null
  /**
   * Cuantas fuentes respaldan el numero cuando NO lo confirmo la autoridad.
   * Nulo = vino de la fuente oficial. El Panel no puede presentar un consenso
   * como si fuera oficial (D-162).
   */
  consensusSources: number | null
  lastVerifiedAt: string | null
  matches: LotteryMatchView[]
  soldCount: number
  availableCount: number
  lateCount: number
  raffleNames: string[]
}

export type LotteryDashboardReady = {
  kind: 'ready'
  todayDraws: LotteryDrawView[]
  nextDraw: LotteryDrawView | null
  previousConfirmed: LotteryDrawView | null
  weekAlerts: LotteryDrawView[]
}

export type LotteryDashboard = { kind: 'error' } | { kind: 'empty' } | LotteryDashboardReady

function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function lotteryDashboardWindow(today: string): { from: string; to: string } {
  return {
    from: addIsoDays(today, -LOTTERY_DASHBOARD_LOOKBEHIND_DAYS),
    to: addIsoDays(today, LOTTERY_DASHBOARD_LOOKAHEAD_DAYS),
  }
}

function mondayOfWeek(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`)
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (weekday - 1))
  return date.toISOString().slice(0, 10)
}

function officialBogotaDate(row: LotteryScheduleSnapshot): string | null {
  if (row.officialScheduledAt) return isoDateBogota(row.officialScheduledAt)
  if (row.scheduleStatus === 'schedule_unverified') return row.referenceDate
  return null
}

function sortInstant(row: LotteryScheduleSnapshot): number {
  if (row.officialScheduledAt) {
    const value = Date.parse(row.officialScheduledAt)
    return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
  }
  return Date.parse(`${row.referenceDate}T23:59:59-05:00`)
}

function isNotableSchedule(status: ScheduleStatus, reason: ChangeReason | null): boolean {
  if (
    status === 'rescheduled_later' ||
    status === 'rescheduled_earlier' ||
    status === 'suspended' ||
    status === 'cancelled' ||
    status === 'schedule_unverified' ||
    status === 'schedule_conflict'
  ) {
    return true
  }
  return status === 'scheduled' && reason === 'holiday'
}

function resultKind(result: LotteryResultSnapshot | null): LotteryResultKind {
  if (!result) return 'none'
  if (result.validationStatus === 'confirmed') return 'confirmed'
  if (result.validationStatus === 'conflict') return 'conflict'
  if (result.validationStatus === 'rejected') return 'rejected'
  return 'pending'
}

function winningNumberOf(result: LotteryResultSnapshot | null): string | null {
  if (!result) return null
  if (result.validationStatus !== 'confirmed' && result.validationStatus !== 'conflict') {
    return null
  }
  return result.winningNumber
}

function scheduleNotice(row: LotteryScheduleSnapshot): string | null {
  if (!isNotableSchedule(row.scheduleStatus, row.changeReason)) return null
  const officialDate = row.officialScheduledAt ? isoDateBogota(row.officialScheduledAt) : null
  return notificationMessage('lottery.schedule_change', {
    lottery_code: row.lotteryCode,
    schedule_status: row.scheduleStatus,
    change_reason: row.changeReason,
    reference_date: row.referenceDate,
    official_date: officialDate,
  })
}

function toMatchView(match: LotteryMatchSnapshot): LotteryMatchView {
  return {
    ticketId: match.ticketId,
    label: ticketLabel({
      dailyNumber: match.dailyNumber,
      weeklyNumber: match.weeklyNumber,
    }),
    assignmentStatus: match.assignmentStatus,
    assignmentLabel: LOTTERY_ASSIGNMENT_STATUS_LABELS[match.assignmentStatus],
    raffleName: match.raffleName,
    clientName: match.clientName,
  }
}

export function toDrawView(row: LotteryScheduleSnapshot): LotteryDrawView {
  const matches = row.matches.map(toMatchView)
  const raffleNames = [
    ...new Set(
      matches.map((match) => match.raffleName).filter((name): name is string => Boolean(name)),
    ),
  ]
  const result = row.result
  return {
    scheduleId: row.id,
    lotteryCode: row.lotteryCode,
    lotteryLabel: LOTTERY_LABELS[row.lotteryCode],
    drawNumber: row.drawNumber,
    referenceDate: row.referenceDate,
    officialScheduledAt: row.officialScheduledAt,
    originalScheduledAt: row.originalScheduledAt,
    officialDate: officialBogotaDate(row),
    scheduleStatus: row.scheduleStatus,
    changeReason: row.changeReason,
    scheduleNotice: scheduleNotice(row),
    resultKind: resultKind(result),
    winningNumber: winningNumberOf(result),
    series: result?.series ?? null,
    sourceUrl: result?.sourceUrl ?? row.sourceUrl,
    sourceAuthority: row.sourceAuthority,
    consensusSources:
      result?.sourceKind === 'alternative_consensus' ? (result.consensusSources ?? 2) : null,
    lastVerifiedAt: result?.fetchedAt ?? row.verifiedAt,
    matches,
    soldCount: matches.filter((match) => match.assignmentStatus === 'sold').length,
    availableCount: matches.filter((match) => match.assignmentStatus === 'available').length,
    lateCount: matches.filter((match) => match.assignmentStatus === 'late_assignment').length,
    raffleNames,
  }
}

export function matchSummaryText(
  draw: Pick<LotteryDrawView, 'soldCount' | 'availableCount' | 'lateCount' | 'resultKind'>,
  audience: LotteryDashboardAudience,
): string | null {
  if (draw.resultKind !== 'confirmed' && draw.resultKind !== 'conflict') return null
  const { soldCount, availableCount, lateCount } = draw
  if (soldCount === 0 && availableCount === 0 && lateCount === 0) {
    return audience === 'seller'
      ? LOTTERY_DASHBOARD_COPY.noMatchSeller
      : LOTTERY_DASHBOARD_COPY.noMatchStaff
  }
  const parts: string[] = []
  if (soldCount > 0) {
    parts.push(
      soldCount === 1
        ? '1 boleta asignada antes del sorteo'
        : `${soldCount} boletas asignadas antes del sorteo`,
    )
  }
  if (availableCount > 0) {
    parts.push(
      availableCount === 1 ? '1 boleta disponible' : `${availableCount} boletas disponibles`,
    )
  }
  if (lateCount > 0) {
    parts.push(
      lateCount === 1
        ? '1 boleta asignada después del sorteo'
        : `${lateCount} boletas asignadas después del sorteo`,
    )
  }
  return parts.join(' · ')
}

export function raffleSummaryText(names: string[]): string | null {
  if (names.length === 1) return `en ${names[0]}`
  if (names.length > 1) return `en ${names.length} rifas`
  return null
}

/**
 * Elige los sorteos que el recuadro debe mostrar.
 *
 * `today` es el dia calendario de Bogota (`YYYY-MM-DD`). `now` decide si un
 * sorteo de hoy todavia no se ha jugado.
 */
export function buildLotteryDashboard(
  rows: LotteryScheduleSnapshot[],
  today: string,
  now: Date = new Date(`${today}T12:00:00-05:00`),
): LotteryDashboard {
  if (rows.length === 0) return { kind: 'empty' }

  const views = [...rows].sort((a, b) => sortInstant(a) - sortInstant(b)).map(toDrawView)

  const todayDraws = views.filter((draw) => draw.officialDate === today)

  const todayIds = new Set(todayDraws.map((draw) => draw.scheduleId))
  const todayHasConfirmed = todayDraws.some(
    (draw) => draw.resultKind === 'confirmed' || draw.resultKind === 'conflict',
  )

  const previousConfirmed = todayHasConfirmed
    ? null
    : (views
        .filter(
          (draw) =>
            (draw.resultKind === 'confirmed' || draw.resultKind === 'conflict') &&
            !todayIds.has(draw.scheduleId),
        )
        .sort((a, b) => {
          const aTime = a.officialScheduledAt ?? a.referenceDate
          const bTime = b.officialScheduledAt ?? b.referenceDate
          return Date.parse(bTime) - Date.parse(aTime)
        })[0] ?? null)

  const nowMs = now.getTime()
  const nextDraw =
    views.find((draw) => {
      if (todayIds.has(draw.scheduleId)) return false
      if (draw.scheduleStatus === 'cancelled' || draw.scheduleStatus === 'suspended') {
        return false
      }
      if (draw.officialScheduledAt) {
        const at = Date.parse(draw.officialScheduledAt)
        return !Number.isNaN(at) && at > nowMs
      }
      return draw.referenceDate > today
    }) ?? null

  const weekStart = mondayOfWeek(today)
  const weekEnd = addIsoDays(weekStart, 6)
  const shownNext = todayDraws.length === 0 ? nextDraw : null
  const shownIds = new Set([
    ...todayIds,
    ...(shownNext ? [shownNext.scheduleId] : []),
    ...(previousConfirmed ? [previousConfirmed.scheduleId] : []),
  ])
  const weekAlerts = views.filter((draw) => {
    if (shownIds.has(draw.scheduleId)) return false
    if (!isNotableSchedule(draw.scheduleStatus, draw.changeReason)) return false
    const date = draw.referenceDate
    return date >= weekStart && date <= weekEnd
  })

  return {
    kind: 'ready',
    todayDraws,
    nextDraw: shownNext,
    previousConfirmed,
    weekAlerts,
  }
}
