import {
  LOTTERY_PUBLICATION_DELAY_MINUTES,
  LOTTERY_RESULT_RETRY,
  LOTTERY_SCHEDULE_SYNC,
  type LotteryCode,
} from './constants'

const bogotaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })
const bogotaHourParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Bogota',
  hour: '2-digit',
  hourCycle: 'h23',
})

export function bogotaIsoDate(value: string | Date): string {
  return bogotaDay.format(new Date(value))
}

export function bogotaHour(value: Date): number {
  const hour = bogotaHourParts.formatToParts(value).find((part) => part.type === 'hour')
  return Number(hour?.value ?? 0)
}

export function addIsoDays(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number)
  const year = parts[0]
  const month = parts[1]
  const day = parts[2]
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Fecha ISO invalida')
  }
  const utc = new Date(Date.UTC(year, month - 1, day + days, 12))
  return utc.toISOString().slice(0, 10)
}

export type ResultFetchDecision = 'fetch' | 'wait' | 'skip'

export type ResultFetchInput = {
  lotteryCode: LotteryCode
  officialScheduledAt: string
  now: Date
  validationStatus: 'none' | 'pending' | 'confirmed' | 'rejected' | 'conflict'
  failedAttempts: number
  lastAttemptAt: string | null
  lastErrorCode: string | null
}

export function isMorningReconciliation(now: Date, officialScheduledAt: string): boolean {
  if (bogotaIsoDate(now) <= bogotaIsoDate(officialScheduledAt)) return false
  const hour = bogotaHour(now)
  return hour >= LOTTERY_RESULT_RETRY.morningFromHour && hour < LOTTERY_RESULT_RETRY.morningToHour
}

/**
 * Decide si conviene consultar la fuente oficial ahora. No prueba que el
 * resultado exista: solo aplica instante oficial, margen, reintentos y la
 * conciliacion de la mañana siguiente.
 */
export function decideResultFetch(input: ResultFetchInput): ResultFetchDecision {
  if (input.validationStatus === 'confirmed' || input.validationStatus === 'conflict') {
    return 'skip'
  }

  const delayMs = LOTTERY_PUBLICATION_DELAY_MINUTES[input.lotteryCode] * 60_000
  const officialMs = new Date(input.officialScheduledAt).getTime()
  if (Number.isNaN(officialMs) || input.now.getTime() < officialMs + delayMs) {
    return 'wait'
  }

  if (input.failedAttempts >= LOTTERY_RESULT_RETRY.maxAttemptsTotal) return 'skip'

  if (input.lastAttemptAt) {
    const elapsed = input.now.getTime() - new Date(input.lastAttemptAt).getTime()
    if (elapsed < LOTTERY_RESULT_RETRY.minIntervalMinutes * 60_000) return 'wait'
  }

  const morning = isMorningReconciliation(input.now, input.officialScheduledAt)
  if (input.failedAttempts >= LOTTERY_RESULT_RETRY.maxAttemptsBeforeMorning && !morning) {
    return 'wait'
  }
  if (input.lastErrorCode === 'source_blocked' && input.failedAttempts >= 2 && !morning) {
    return 'wait'
  }

  return 'fetch'
}

/**
 * La programacion CNJSA se consulta como mucho una vez por dia calendario
 * de Bogota. Un fallo se reintenta pasado el margen, no en el tick siguiente.
 */
export function shouldSyncSchedule(input: {
  now: Date
  lastSuccessAt: string | null
  lastAttemptAt: string | null
}): boolean {
  if (input.lastSuccessAt && bogotaIsoDate(input.now) === bogotaIsoDate(input.lastSuccessAt)) {
    return false
  }
  if (input.lastAttemptAt) {
    const elapsed = input.now.getTime() - new Date(input.lastAttemptAt).getTime()
    if (Number.isNaN(elapsed)) return true
    if (elapsed < LOTTERY_SCHEDULE_SYNC.retryAfterHours * 3_600_000) return false
  }
  return true
}

export function officialResultFitsSchedule(
  result: { lotteryCode: LotteryCode; drawNumber: string; officialDate: string },
  schedule: { lotteryCode: LotteryCode; drawNumber: string; officialScheduledAt: string },
): boolean {
  if (result.lotteryCode !== schedule.lotteryCode) return false
  if (result.drawNumber !== schedule.drawNumber) return false
  const playedOn = bogotaIsoDate(schedule.officialScheduledAt)
  return result.officialDate === playedOn || result.officialDate === addIsoDays(playedOn, 1)
}
