import type { LotteryCode } from '@/features/lottery/constants'
import { addIsoDays } from '@/features/lottery/dashboard'
import { isoWeekday } from '@/features/lottery/parse/excel-date'
import { LOTTERY_NOMINAL_WEEKDAY } from '@/features/lottery/sources'

/**
 * El calendario de un premio configurable (BR-J04, BR-J05, D-199).
 *
 * PURO: no mira el reloj, ni la base, ni el idioma. Los textos viven en
 * `copy.ts` y la validacion de formulario, en `schemas.ts`; aqui solo esta el
 * calendario: que dias juega un premio y con que loteria.
 *
 * TODO SE CALCULA SOBRE DIAS 'AAAA-MM-DD', nunca sobre instantes (I-017), con la
 * misma aritmetica que ya usan loterias y «Resultados de la semana»: no hay una
 * segunda.
 *
 * LA FORMA CANONICA es la que se guarda: dias ordenados y sin repetir, periodos
 * ordenados. Dos calendarios iguales producen exactamente la misma
 * representacion, y eso es lo que permite saber si un guardado no cambio nada.
 */

export type PrizeLotteryMode = 'corresponding' | 'fixed'

/** Un periodo del calendario: "del X al Y, estos dias, con esta loteria". */
export type PrizeRule = {
  startDate: string
  endDate: string
  /** Dias ISO 1 (lunes) .. 6 (sabado). El domingo no tiene loteria (BR-J04). */
  weekdays: number[]
  lotteryMode: PrizeLotteryMode
  lotteryCode: LotteryCode | null
}

/** Un dia en que juega el premio, con la loteria que le toca. */
export type PrizeOccurrence = {
  referenceDate: string
  lottery: LotteryCode
}

/** Los dias que tienen loteria, en orden (BR-L01). */
export const PRIZE_WEEKDAYS = [1, 2, 3, 4, 5, 6] as const

/** Tope de periodos por premio. El mismo que el CHECK de `position` en la base. */
export const PRIZE_RULES_MAX = 10

/**
 * La loteria que corresponde a un dia ISO, o `null` el domingo.
 *
 * Se deriva de `LOTTERY_NOMINAL_WEEKDAY`, que es la tabla con la que se importa
 * el cronograma: no hay una segunda lista de dias.
 */
export function lotteryForWeekday(weekday: number): LotteryCode | null {
  const entry = Object.entries(LOTTERY_NOMINAL_WEEKDAY).find(([, day]) => day === weekday)
  return entry ? (entry[0] as LotteryCode) : null
}

/** La loteria de una fecha de referencia, o `null` si es domingo. */
export function lotteryForDate(isoDate: string): LotteryCode | null {
  return lotteryForWeekday(isoWeekday(isoDate))
}

export function canonicalWeekdays(weekdays: number[]): number[] {
  return [...new Set(weekdays)].sort((a, b) => a - b)
}

export function canonicalRule(rule: PrizeRule): PrizeRule {
  return {
    startDate: rule.startDate,
    endDate: rule.endDate,
    weekdays: canonicalWeekdays(rule.weekdays),
    lotteryMode: rule.lotteryMode,
    lotteryCode: rule.lotteryMode === 'fixed' ? rule.lotteryCode : null,
  }
}

function ruleSortKey(rule: PrizeRule): string {
  return [
    rule.startDate,
    rule.endDate,
    rule.weekdays.join(','),
    rule.lotteryMode,
    rule.lotteryCode ?? '',
  ].join('|')
}

/** Los periodos en forma canonica y en el mismo orden que los guarda la base. */
export function canonicalRules(rules: PrizeRule[]): PrizeRule[] {
  return rules
    .map(canonicalRule)
    .sort((a, b) =>
      ruleSortKey(a) < ruleSortKey(b) ? -1 : ruleSortKey(a) > ruleSortKey(b) ? 1 : 0,
    )
}

/** `true` si dos calendarios significan lo mismo, aunque lleguen en otro orden. */
export function rulesEqual(a: PrizeRule[], b: PrizeRule[]): boolean {
  const left = canonicalRules(a).map(ruleSortKey)
  const right = canonicalRules(b).map(ruleSortKey)
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * Los dias en que juega un periodo, con su loteria.
 *
 * Con la loteria fija y con la correspondiente sale la MISMA loteria en una
 * fecha valida: la fecha de referencia es el dia nominal del sorteo (D-143). La
 * diferencia entre las dos modalidades es que la fija acota los dias validos.
 */
export function expandRule(rule: PrizeRule): PrizeOccurrence[] {
  const days = canonicalWeekdays(rule.weekdays)
  const occurrences: PrizeOccurrence[] = []

  for (let date = rule.startDate; date <= rule.endDate; date = addIsoDays(date, 1)) {
    if (!days.includes(isoWeekday(date))) continue
    const lottery = rule.lotteryMode === 'fixed' ? rule.lotteryCode : lotteryForDate(date)
    if (lottery) occurrences.push({ referenceDate: date, lottery })
  }

  return occurrences
}

/** Todos los dias en que juega un premio, ordenados. */
export function expandRules(rules: PrizeRule[]): PrizeOccurrence[] {
  return rules
    .flatMap(expandRule)
    .sort((a, b) =>
      a.referenceDate < b.referenceDate ? -1 : a.referenceDate > b.referenceDate ? 1 : 0,
    )
}

/** El primer dia que dos periodos del mismo premio comparten, o `null` (BR-J04). */
export function overlappingDay(rules: PrizeRule[]): string | null {
  const seen = new Set<string>()
  for (const rule of rules) {
    for (const occurrence of expandRule(rule)) {
      if (seen.has(occurrence.referenceDate)) return occurrence.referenceDate
      seen.add(occurrence.referenceDate)
    }
  }
  return null
}

export type PrizeRuleProblem =
  | 'invalid_date'
  | 'dates_reversed'
  | 'no_weekdays'
  | 'sunday'
  | 'weekday_not_covered'
  | 'fixed_lottery_missing'
  | 'fixed_lottery_weekday'
  | 'outside_raffle'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return false
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * El primer problema de un periodo, o `null`. Es la misma lista que comprueban
 * los CHECK y la RPC de la migracion `0058`; aqui esta para poder decirlo en el
 * formulario antes de enviarlo.
 */
export function ruleProblem(
  rule: PrizeRule,
  raffle?: { startDate: string; endDate: string },
): PrizeRuleProblem | null {
  if (!isCalendarDate(rule.startDate) || !isCalendarDate(rule.endDate)) return 'invalid_date'
  if (rule.endDate < rule.startDate) return 'dates_reversed'

  const days = canonicalWeekdays(rule.weekdays)
  if (days.length === 0) return 'no_weekdays'
  if (days.some((day) => day === 7)) return 'sunday'
  if (days.some((day) => day < 1 || day > 6)) return 'no_weekdays'

  if (rule.lotteryMode === 'fixed') {
    if (!rule.lotteryCode) return 'fixed_lottery_missing'
    const nominal = LOTTERY_NOMINAL_WEEKDAY[rule.lotteryCode]
    if (days.length !== 1 || days[0] !== nominal) return 'fixed_lottery_weekday'
  }

  // Cada dia elegido tiene que caer al menos una vez dentro del periodo: «del 1
  // al 2 de diciembre, los sabados» no produce ninguna fecha.
  const first = isoWeekday(rule.startDate)
  for (const day of days) {
    const offset = (day - first + 7) % 7
    if (addIsoDays(rule.startDate, offset) > rule.endDate) return 'weekday_not_covered'
  }

  if (raffle && (rule.startDate < raffle.startDate || rule.endDate > raffle.endDate)) {
    return 'outside_raffle'
  }

  return null
}

/**
 * Los tres modos sencillos de la pantalla (Entrega 2), aqui como constructores
 * puros: lo que se guarda es siempre la misma forma canonica.
 */

/** «Una fecha». Un domingo no produce periodo: no tiene loteria. */
export function singleDateRule(
  isoDate: string,
  lotteryMode: PrizeLotteryMode = 'corresponding',
): PrizeRule {
  const weekday = isoWeekday(isoDate)
  return {
    startDate: isoDate,
    endDate: isoDate,
    weekdays: [weekday],
    lotteryMode,
    lotteryCode: lotteryMode === 'fixed' ? lotteryForWeekday(weekday) : null,
  }
}

/** «Un rango»: todos los dias con loteria que caen dentro. */
export function rangeRule(startDate: string, endDate: string): PrizeRule {
  const weekdays: number[] = []
  for (let date = startDate; date <= endDate && weekdays.length < 6; date = addIsoDays(date, 1)) {
    const weekday = isoWeekday(date)
    if (weekday !== 7 && !weekdays.includes(weekday)) weekdays.push(weekday)
  }
  return {
    startDate,
    endDate,
    weekdays: canonicalWeekdays(weekdays),
    lotteryMode: 'corresponding',
    lotteryCode: null,
  }
}

/** «Se repite ciertos días». */
export function recurringRule(startDate: string, endDate: string, weekdays: number[]): PrizeRule {
  return {
    startDate,
    endDate,
    weekdays: canonicalWeekdays(weekdays),
    lotteryMode: 'corresponding',
    lotteryCode: null,
  }
}

/** Lo que viaja a la RPC: las mismas claves que leen `0058` y sus pruebas. */
export type PrizeRulePayload = {
  start_date: string
  end_date: string
  weekdays: number[]
  lottery_mode: PrizeLotteryMode
  lottery_code: LotteryCode | null
}

export function toRulePayload(rules: PrizeRule[]): PrizeRulePayload[] {
  return canonicalRules(rules).map((rule) => ({
    start_date: rule.startDate,
    end_date: rule.endDate,
    weekdays: rule.weekdays,
    lottery_mode: rule.lotteryMode,
    lottery_code: rule.lotteryCode,
  }))
}

export function fromRulePayload(rules: PrizeRulePayload[]): PrizeRule[] {
  return rules.map((rule) => ({
    startDate: rule.start_date,
    endDate: rule.end_date,
    weekdays: canonicalWeekdays(rule.weekdays),
    lotteryMode: rule.lottery_mode,
    lotteryCode: rule.lottery_code,
  }))
}
