import type { LotteryCode } from '../constants'
import { LOTTERY_NOMINAL_WEEKDAY, OPERATOR_NAME_TO_CODE } from '../sources'
import type { NormalizedScheduleDraw } from '../types'
import {
  combineBogotaDateTime,
  excelFractionToBogotaTime,
  excelSerialToIsoDate,
  isoDateOnWeekday,
  isoWeekday,
} from './excel-date'
import { parseXlsxWorkbook } from './xlsx'

function lotteryCodeFromOperator(name: string): LotteryCode | null {
  const lowered = name.toLowerCase()
  if (/extra|extraordinar/.test(lowered)) return null
  for (const { pattern, code } of OPERATOR_NAME_TO_CODE) {
    if (pattern.test(name)) return code
  }
  return null
}

function headerIndex(header: string[], ...names: string[]): number {
  const needle = names.map((n) => n.toLowerCase())
  return header.findIndex((cell) => needle.some((n) => (cell ?? '').toLowerCase().includes(n)))
}

function classifyMove(
  officialDate: string,
  referenceDate: string,
): NormalizedScheduleDraw['scheduleStatus'] {
  if (officialDate === referenceDate) return 'scheduled'
  return officialDate < referenceDate ? 'rescheduled_earlier' : 'rescheduled_later'
}

function reasonFromMod(mod: string | undefined): NormalizedScheduleDraw['changeReason'] {
  if (!mod || !mod.trim()) return null
  const t = mod.toLowerCase()
  if (/festiv/.test(t)) return 'holiday'
  if (/oficio/.test(t)) return 'force_majeure'
  return 'official_change'
}

export function parseCnjsaOrdinariosWorkbook(bytes: Uint8Array): {
  draws: NormalizedScheduleDraw[]
  skippedExtraordinary: number
} {
  const sheets = parseXlsxWorkbook(bytes)
  const extraSheet = sheets.find((s) => /extraordinar/i.test(s.name))
  const ordinarySheet =
    sheets.find((s) => /^ordinarios$/i.test(s.name.trim())) ??
    sheets.find((s) => /ordinar/i.test(s.name) && !/extraordinar/i.test(s.name))

  if (!ordinarySheet || ordinarySheet.rows.length < 2) {
    throw new Error('El documento no trae una hoja de sorteos ordinarios.')
  }

  const header = ordinarySheet.rows[0] ?? []
  const colLottery = headerIndex(header, 'loter')
  const colDraw = headerIndex(header, 'núm', 'num', 'sorteo')
  const colDate = headerIndex(header, 'fecha')
  const colTime = headerIndex(header, 'hora')
  const colAcuerdo = header.findIndex((c) => /^acuerdo$/i.test((c ?? '').trim()))
  const colMod = headerIndex(header, 'modificator')
  if (colLottery < 0 || colDraw < 0 || colDate < 0) {
    throw new Error('La hoja de ordinarios no tiene las columnas esperadas.')
  }

  const draws: NormalizedScheduleDraw[] = []
  for (const row of ordinarySheet.rows.slice(1)) {
    if (!row) continue
    const operator = row[colLottery] ?? ''
    const code = lotteryCodeFromOperator(operator)
    if (!code) continue
    const rawDate = row[colDate] ?? ''
    if (!rawDate) continue
    const officialDate = /^\d+(\.\d+)?$/.test(rawDate)
      ? excelSerialToIsoDate(Number(rawDate))
      : rawDate.slice(0, 10)
    const timeSource = colTime >= 0 ? Number(row[colTime] || 0) : 0.958333
    const { hour, minute } = excelFractionToBogotaTime(Number.isFinite(timeSource) ? timeSource : 0)
    const officialScheduledAt = combineBogotaDateTime(officialDate, hour, minute)
    const nominal = LOTTERY_NOMINAL_WEEKDAY[code]
    const referenceDate =
      isoWeekday(officialDate) === nominal ? officialDate : isoDateOnWeekday(officialDate, nominal)
    const mod = colMod >= 0 ? row[colMod] : ''
    const acuerdo = colAcuerdo >= 0 ? row[colAcuerdo] : ''
    const drawNumber = String(row[colDraw] ?? '').replace(/[^\d]/g, '')
    if (!drawNumber) continue

    const cancelled = /no opero|suspend/i.test(operator + (row.join(' ') ?? ''))
    draws.push({
      lotteryCode: code,
      drawNumber,
      referenceDate,
      officialScheduledAt,
      originalScheduledAt: combineBogotaDateTime(referenceDate, hour, minute),
      scheduleStatus: cancelled ? 'cancelled' : classifyMove(officialDate, referenceDate),
      changeReason: cancelled ? 'official_change' : reasonFromMod(mod),
      acuerdo: acuerdo || null,
      acuerdoModificatorio: mod || null,
    })
  }

  const skippedExtraordinary = extraSheet
    ? extraSheet.rows.slice(1).filter((r) => r && r.some(Boolean)).length
    : 0

  return { draws, skippedExtraordinary }
}
