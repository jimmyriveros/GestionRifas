import type { LotteryCode, LotteryMatchField } from '@/features/lottery/constants'
import { addIsoDays } from '@/features/lottery/dashboard'
import { isoWeekday } from '@/features/lottery/parse/excel-date'
import { RAFFLE_STATUS_LABELS, type RaffleStatus } from '@/lib/constants'
import { formatDateCsv, formatTimeEs, isoDateBogota } from '@/lib/dates'

import {
  PRIZE_CATEGORY_LABELS,
  PRIZE_DIGITS_FULL_LABELS,
  PRIZE_NUMBER_FIELD_LABELS,
  PRIZE_REWARD_MODE_LABELS,
  PRIZE_TRANSITION_COPY,
  prizeLotteryLabel,
  rewardText,
  scheduleSummary,
  validityText,
  type PrizeCategory,
  type PrizeRewardMode,
  type PrizeRewardOption,
} from './copy'
import { prizeDrawCutoff, type PrizeDigits } from './matching'
import {
  canonicalWeekdays,
  expandRules,
  fromRulePayload,
  isCalendarDate,
  lotteryForDate,
  PRIZE_RULES_MAX,
  toRulePayload,
  type PrizeRule,
  type PrizeRulePayload,
} from './schedule'

/**
 * La TRANSICION de una rifa que ya existe a premios configurables (Entrega 4,
 * D-204, BR-J13).
 *
 * PURO: no toca la base ni el reloj —el instante llega como argumento—. Aqui
 * vive lo que la base no puede saber sola:
 *
 *   * la configuracion CONFIRMADA de los seis premios, escrita una sola vez;
 *   * desde que sorteo empiezan el premio diario y el de los sabados: el
 *     primero que todavia no se jugo el dia de la transicion (respuesta del
 *     dueno, 2026-09-16);
 *   * y las lineas de la vista previa, con los textos de `copy.ts`.
 *
 * LA AUTORIDAD ES `transition_raffle_prize_mode` (migraciones `0063` y `0064`):
 * vuelve a validar todo, rechaza un premio que incluya un sorteo ya jugado, fija
 * el instante efectivo y lo hace en una transaccion. Los sorteos cuyo corte llego
 * antes de ese instante conservan el sistema de siempre (D-206). Esto solo
 * prepara la peticion y la lee.
 *
 * NO ELIGE NINGUNA RIFA. La rifa real se identifica por su identificador, su
 * organizacion, su nombre, su estado y sus fechas, y eso lo suministra quien
 * ejecuta la transicion en la Entrega 5.
 */

/** Un premio como lo recibe `transition_raffle_prize_mode`: las claves de las RPC. */
export type TransitionPrizePayload = {
  title: string
  category: PrizeCategory
  reward_mode: PrizeRewardMode
  reward_options: PrizeRewardOption[]
  number_field: LotteryMatchField
  digits: PrizeDigits
  rules: PrizeRulePayload[]
  conditions: string | null
}

/** Un problema de la configuracion que no se puede resolver sin una decision del dueno. */
export class TransitionPlanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransitionPlanError'
  }
}

/**
 * Las fechas fijas de los seis premios confirmados (2026-09-16).
 *
 * El INICIO del diario y del de los sabados no esta aqui a proposito: depende
 * del dia de la transicion y lo calcula `confirmedPrizeStarts`.
 */
export const CONFIRMED_PRIZE_PLAN = {
  /** El premio diario juega de lunes a viernes y termina este dia. No llega a diciembre. */
  dailyLastDate: '2026-11-27',
  /** El de fin de semana juega los sabados con Boyaca y termina este dia. */
  saturdayLastDate: '2026-11-28',
  /** El premio principal y el de tres cifras: lunes, con Cundinamarca. */
  mainDate: '2026-12-21',
  /** El millon con el numero semanal: todos los dias validos de estos dos tramos. */
  specialWeeklyPeriods: [
    { startDate: '2026-12-01', endDate: '2026-12-05' },
    { startDate: '2026-12-16', endDate: '2026-12-19' },
  ],
  /** Los siete millones con el numero semanal: martes, la loteria de ese dia es Cruz Roja. */
  december15Date: '2026-12-15',
} as const

/** Los dias con loteria de lunes a viernes y los de toda la semana (BR-L01). */
const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5] as const
const WEEKDAYS_ALL = [1, 2, 3, 4, 5, 6] as const
const SATURDAY = 6

function assertIsoDate(value: string, label: string): void {
  if (!isCalendarDate(value)) {
    throw new TransitionPlanError(`${label} no es una fecha válida (AAAA-MM-DD).`)
  }
}

/**
 * Los periodos de un tramo SIN los sorteos cancelados (BR-J05).
 *
 * Un sorteo cancelado no va a tener resultado y la base rechaza incluirlo, asi
 * que el tramo se parte alrededor de el. Cada periodo lleva solo los dias que de
 * verdad caen en el —la base exige que cada dia elegido aparezca al menos una
 * vez (BR-J04)— y empieza y termina en un sorteo.
 */
export function periodsAvoiding(input: {
  startDate: string
  endDate: string
  weekdays: readonly number[]
  cancelledDates: ReadonlySet<string>
  lotteryCode: LotteryCode | null
}): PrizeRule[] {
  const rules: PrizeRule[] = []
  let run: string[] = []

  const flush = () => {
    const first = run[0]
    const last = run[run.length - 1]
    if (first && last) {
      rules.push({
        startDate: first,
        endDate: last,
        weekdays: canonicalWeekdays(run.map(isoWeekday)),
        lotteryMode: input.lotteryCode ? 'fixed' : 'corresponding',
        lotteryCode: input.lotteryCode,
      })
    }
    run = []
  }

  for (let date = input.startDate; date <= input.endDate; date = addIsoDays(date, 1)) {
    if (!input.weekdays.includes(isoWeekday(date))) continue
    if (input.cancelledDates.has(date)) {
      flush()
      continue
    }
    run.push(date)
  }
  flush()

  return rules
}

/** Desde cuando juegan los dos premios que ya estaban en curso, y que sorteos no se juegan. */
export type ConfirmedPrizeStarts = {
  /** Primer sorteo de lunes a viernes que todavia no se ha jugado el dia de la transicion. */
  dailyStart: string
  /** Primer sabado que todavia no se ha jugado. */
  saturdayStart: string
  /** Sorteos que la programacion oficial da por cancelados: no entran en ningun calendario. */
  cancelledDates?: readonly string[]
}

function singleDay(date: string, lotteryCode: LotteryCode | null): PrizeRule {
  return {
    startDate: date,
    endDate: date,
    weekdays: [isoWeekday(date)],
    lotteryMode: lotteryCode ? 'fixed' : 'corresponding',
    lotteryCode,
  }
}

function cashOnly(amount: number): PrizeRewardOption[] {
  return [{ description: null, amount }]
}

function requirePeriods(rules: PrizeRule[], title: string): PrizeRulePayload[] {
  if (rules.length === 0) {
    throw new TransitionPlanError(
      `El premio «${title}» ya no tiene ningún sorteo por jugar. Hace falta que el dueño decida qué hacer con él.`,
    )
  }
  if (rules.length > PRIZE_RULES_MAX) {
    throw new TransitionPlanError(
      `El premio «${title}» necesitaría más de ${PRIZE_RULES_MAX} períodos por los sorteos cancelados.`,
    )
  }
  return toRulePayload(rules)
}

/**
 * LOS SEIS PREMIOS CONFIRMADOS, en su orden (2026-09-16).
 *
 * Todo lo que no dice «tres cifras» juega con CUATRO. El caso «número semanal,
 * un lunes, con Cundinamarca» fue solo un EJEMPLO de que el sistema admite
 * excepciones: no es un premio de esta rifa y no esta aqui.
 *
 * El 15 de diciembre se escribe con la LOTERIA CORRESPONDIENTE, que ese martes
 * es Cruz Roja: es la instruccion original y, en una fecha valida, la fija y la
 * correspondiente dan la misma loteria (BR-J05, D-143). Escribir las dos seria
 * tener dos fuentes de verdad.
 */
export function confirmedRafflePrizes(starts: ConfirmedPrizeStarts): TransitionPrizePayload[] {
  assertIsoDate(starts.dailyStart, 'El inicio del premio diario')
  assertIsoDate(starts.saturdayStart, 'El inicio del premio de fin de semana')

  const plan = CONFIRMED_PRIZE_PLAN
  const cancelled = new Set(starts.cancelledDates ?? [])

  if (starts.dailyStart > plan.dailyLastDate) {
    throw new TransitionPlanError(
      'El premio diario terminaba el 27 de noviembre y ya no le queda ningún sorteo. Hace falta que el dueño decida qué hacer con él.',
    )
  }
  if (starts.saturdayStart > plan.saturdayLastDate) {
    throw new TransitionPlanError(
      'El premio de fin de semana terminaba el 28 de noviembre y ya no le queda ningún sábado. Hace falta que el dueño decida qué hacer con él.',
    )
  }
  if (isoWeekday(starts.saturdayStart) !== SATURDAY) {
    throw new TransitionPlanError('El premio de fin de semana empieza un sábado.')
  }

  for (const date of [plan.mainDate, plan.december15Date]) {
    if (cancelled.has(date)) {
      throw new TransitionPlanError(
        `El sorteo del ${formatDateCsv(date)} está cancelado en la programación oficial. Hace falta que el dueño decida qué hacer con su premio.`,
      )
    }
  }

  const daily: TransitionPrizePayload = {
    title: 'Premio diario',
    category: 'daily',
    reward_mode: 'fixed',
    reward_options: cashOnly(500_000),
    number_field: 'daily_number',
    digits: 'four',
    rules: requirePeriods(
      periodsAvoiding({
        startDate: starts.dailyStart,
        endDate: plan.dailyLastDate,
        weekdays: WEEKDAYS_MON_FRI,
        cancelledDates: cancelled,
        lotteryCode: null,
      }),
      'Premio diario',
    ),
    conditions: null,
  }

  const weekend: TransitionPrizePayload = {
    title: 'Premio fin de semana',
    category: 'weekly',
    reward_mode: 'fixed',
    reward_options: cashOnly(2_000_000),
    number_field: 'weekly_number',
    digits: 'four',
    rules: requirePeriods(
      periodsAvoiding({
        startDate: starts.saturdayStart,
        endDate: plan.saturdayLastDate,
        weekdays: [SATURDAY],
        cancelledDates: cancelled,
        lotteryCode: 'boyaca',
      }),
      'Premio fin de semana',
    ),
    conditions: null,
  }

  // UN premio con CUATRO alternativas excluyentes, no cuatro premios (D-201). El
  // texto de cada alternativa es su componente en especie; el dinero se escribe
  // aparte y la aplicacion compone «Renault Alaskan modelo 2023 y $20.000.000».
  const main: TransitionPrizePayload = {
    title: 'Premio principal',
    category: 'main',
    reward_mode: 'winner_choice',
    reward_options: [
      { description: 'Camioneta KIA', amount: null },
      { description: 'Renault Alaskan modelo 2023', amount: 20_000_000 },
      { description: null, amount: 120_000_000 },
      { description: 'Renault Logan Zen público modelo 2023', amount: 70_000_000 },
    ],
    number_field: 'daily_number',
    digits: 'four',
    rules: toRulePayload([singleDay(plan.mainDate, 'cundinamarca')]),
    conditions: null,
  }

  // El MISMO dia y la misma loteria que el principal, con las tres ultimas
  // cifras: conviven a proposito (BR-J07, BR-J08) y la prioridad es por cliente.
  const lastThree: TransitionPrizePayload = {
    title: 'Premio especial de tres cifras',
    category: 'special',
    reward_mode: 'fixed',
    reward_options: cashOnly(1_000_000),
    number_field: 'daily_number',
    digits: 'last_three',
    rules: toRulePayload([singleDay(plan.mainDate, 'cundinamarca')]),
    conditions: null,
  }

  const specialWeekly: TransitionPrizePayload = {
    title: 'Premio especial semanal',
    category: 'special',
    reward_mode: 'fixed',
    reward_options: cashOnly(1_000_000),
    number_field: 'weekly_number',
    digits: 'four',
    rules: requirePeriods(
      plan.specialWeeklyPeriods.flatMap((period) =>
        periodsAvoiding({
          startDate: period.startDate,
          endDate: period.endDate,
          weekdays: WEEKDAYS_ALL,
          cancelledDates: cancelled,
          lotteryCode: null,
        }),
      ),
      'Premio especial semanal',
    ),
    conditions: null,
  }

  const december15: TransitionPrizePayload = {
    title: 'Premio especial del 15 de diciembre',
    category: 'special',
    reward_mode: 'fixed',
    reward_options: cashOnly(7_000_000),
    number_field: 'weekly_number',
    digits: 'four',
    rules: toRulePayload([singleDay(plan.december15Date, null)]),
    conditions: null,
  }

  return [daily, weekend, main, lastThree, specialWeekly, december15]
}

/** Un sorteo de la programacion oficial, con lo que hace falta para saber si ya se jugo. */
export type TransitionDraw = {
  referenceDate: string
  lotteryCode: LotteryCode
  scheduleStatus: string
  originalScheduledAt: string | null
  officialScheduledAt: string | null
}

/** Si un sorteo ya alcanzo su corte efectivo en `now` (BR-J09, `raffle_prize_draw_cutoff`). */
export function drawAlreadyCut(draw: TransitionDraw | undefined, now: Date): boolean {
  if (!draw) return false
  const cutoff = prizeDrawCutoff(draw)
  return cutoff !== null && Date.parse(cutoff) <= now.getTime()
}

/**
 * Desde que sorteo empiezan el premio diario y el de los sabados (respuesta del
 * dueno, 2026-09-16): el PRIMERO que todavia no se jugo el dia de la
 * transicion. Los anteriores ya los resolvio el sistema de siempre y no se
 * tocan.
 *
 * Un sorteo cuyo corte todavia no se conoce cuenta como pendiente: si su semana
 * ya empezo, la base rechaza la transicion hasta que se publique la hora, que
 * es lo seguro. Los cancelados se saltan y se devuelven, para que ningun
 * calendario los incluya.
 */
export function confirmedPrizeStarts(input: {
  draws: readonly TransitionDraw[]
  now: Date
  raffleStartDate: string
}): ConfirmedPrizeStarts {
  const plan = CONFIRMED_PRIZE_PLAN
  const today = isoDateBogota(input.now)
  const from = input.raffleStartDate > today ? input.raffleStartDate : today

  const byDate = new Map(
    input.draws.map((draw) => [`${draw.referenceDate}:${draw.lotteryCode}`, draw]),
  )
  const drawOn = (date: string, lotteryCode: LotteryCode): TransitionDraw | undefined =>
    byDate.get(`${date}:${lotteryCode}`)

  const cancelledDates = [
    ...new Set(
      input.draws
        .filter((draw) => draw.scheduleStatus === 'cancelled' && draw.referenceDate >= from)
        .map((draw) => draw.referenceDate),
    ),
  ].sort()
  const cancelled = new Set(cancelledDates)

  const firstPending = (weekdays: readonly number[], lastDate: string): string | null => {
    for (let date = from; date <= lastDate; date = addIsoDays(date, 1)) {
      if (!weekdays.includes(isoWeekday(date)) || cancelled.has(date)) continue
      const lotteryCode = lotteryForDate(date)
      if (lotteryCode && !drawAlreadyCut(drawOn(date, lotteryCode), input.now)) return date
    }
    return null
  }

  const dailyStart = firstPending(WEEKDAYS_MON_FRI, plan.dailyLastDate)
  if (!dailyStart) {
    throw new TransitionPlanError(
      'No queda ningún sorteo de lunes a viernes hasta el 27 de noviembre: el premio diario ya no puede empezar. Hace falta que el dueño decida qué hacer con él.',
    )
  }

  const saturdayStart = firstPending([SATURDAY], plan.saturdayLastDate)
  if (!saturdayStart) {
    throw new TransitionPlanError(
      'No queda ningún sábado por jugar hasta el 28 de noviembre: el premio de fin de semana ya no puede empezar. Hace falta que el dueño decida qué hacer con él.',
    )
  }

  return { dailyStart, saturdayStart, cancelledDates }
}

/** Un premio en la respuesta de `transition_raffle_prize_mode`. */
export type TransitionResultPrize = {
  position: number
  prize_id?: string
  version_id?: string
  title: string
  category: PrizeCategory
  reward_mode: PrizeRewardMode
  reward_options: PrizeRewardOption[]
  number_field: LotteryMatchField
  digits: PrizeDigits
  conditions: string | null
  rules: PrizeRulePayload[]
  starts_on: string | null
  ends_on: string | null
  draws: number
}

/** Un sorteo que ya se jugo y todavia no tiene resultado confirmado (D-206). */
export type TransitionUnconfirmedDraw = {
  reference_date: string
  lottery_code: LotteryCode
  draw_number: string | null
}

/**
 * Los sorteos de la ventana de la rifa que CONSERVAN el sistema de siempre
 * (D-206): los que ya alcanzaron su corte en el instante efectivo, con resultado
 * o sin el. Los que no lo tienen se enumeran: si se confirman despues, con
 * evidencia, los resuelve el sistema de siempre.
 */
export type TransitionLegacyDraws = {
  total: number
  confirmed: number
  unconfirmed: number
  first_date: string | null
  last_date: string | null
  unconfirmed_draws: TransitionUnconfirmedDraw[]
}

/** La respuesta de `transition_raffle_prize_mode` (migraciones `0063` y `0064`). */
export type TransitionResult = {
  applied: boolean
  already_applied: boolean
  transition_id: string | null
  organization_id: string
  raffle_id: string
  raffle?: { name: string; status: RaffleStatus; start_date: string; end_date: string }
  /**
   * El instante efectivo (D-206): la publicacion de la ultima version inicial.
   * `null` en la vista previa, porque esa transicion no va a existir.
   */
  effective_at?: string | null
  legacy_draws?: TransitionLegacyDraws
  prize_ids: string[]
  prizes?: TransitionResultPrize[]
  notified: number
  configuration_hash: string
}

/**
 * La vista previa, o el resultado, en lineas de texto que se leen sin abrir la
 * base: la rifa, el cambio de sistema y cada premio con su recompensa, su
 * numero, sus cifras, su calendario, su vigencia y su loteria.
 */
export function transitionPreviewLines(result: TransitionResult): string[] {
  const copy = PRIZE_TRANSITION_COPY
  const lines: string[] = []

  lines.push(
    result.already_applied ? copy.alreadyApplied : result.applied ? copy.applied : copy.preview,
  )
  lines.push('')
  lines.push(copy.raffleHeading)

  if (result.raffle) {
    lines.push(`  ${copy.name}: ${result.raffle.name}`)
  }
  lines.push(`  ${copy.id}: ${result.raffle_id}`)
  lines.push(`  ${copy.organization}: ${result.organization_id}`)

  if (result.raffle) {
    lines.push(`  ${copy.status(RAFFLE_STATUS_LABELS[result.raffle.status])}`)
    lines.push(
      `  ${copy.dates(formatDateCsv(result.raffle.start_date), formatDateCsv(result.raffle.end_date))}`,
    )
  }
  lines.push(`  ${copy.mode}`)

  if (result.transition_id) {
    lines.push(`  ${copy.transition}: ${result.transition_id}`)
  }
  if (result.effective_at) {
    lines.push(
      `  ${copy.effective(formatDateCsv(result.effective_at), formatTimeEs(result.effective_at))}`,
    )
  }

  const legacy = result.legacy_draws
  if (legacy) {
    lines.push('')
    lines.push(copy.legacyHeading(legacy.total))
    if (legacy.total > 0) {
      lines.push(`  ${copy.legacyConfirmed(legacy.confirmed)}`)
      const pending = [...legacy.unconfirmed_draws].sort((a, b) =>
        a.reference_date.localeCompare(b.reference_date),
      )
      const first = pending[0]
      const last = pending[pending.length - 1]
      lines.push(
        first && last
          ? `  ${copy.legacyUnconfirmed(legacy.unconfirmed, formatDateCsv(first.reference_date), formatDateCsv(last.reference_date))}`
          : `  ${copy.legacyUnconfirmed(0)}`,
      )
      lines.push(`  ${copy.legacyExplanation}`)
    }
  }

  const prizes = result.prizes ?? []
  if (prizes.length > 0) {
    lines.push('')
    lines.push(copy.prizesHeading(prizes.length))

    for (const prize of [...prizes].sort((a, b) => a.position - b.position)) {
      const rules = fromRulePayload(prize.rules)
      const reward = { mode: prize.reward_mode, options: prize.reward_options }

      lines.push(`  ${prize.position}. ${prize.title} · ${PRIZE_CATEGORY_LABELS[prize.category]}`)
      lines.push(
        `     ${copy.reward}: ${PRIZE_REWARD_MODE_LABELS[prize.reward_mode]} · ${rewardText(reward)}`,
      )
      lines.push(
        `     ${copy.plays}: ${PRIZE_NUMBER_FIELD_LABELS[prize.number_field]} · ${PRIZE_DIGITS_FULL_LABELS[prize.digits]}`,
      )
      lines.push(`     ${copy.schedule}: ${scheduleSummary(rules)}`)
      lines.push(
        `     ${copy.validity}: ${validityText(rules)} · ${copy.draws(expandRules(rules).length)}`,
      )
      lines.push(`     ${copy.lottery}: ${prizeLotteryLabel(rules)}`)
      if (prize.prize_id) lines.push(`     ${copy.id}: ${prize.prize_id}`)
    }
  } else if (result.prize_ids.length > 0) {
    lines.push('')
    lines.push(copy.prizesHeading(result.prize_ids.length))
    for (const id of result.prize_ids) lines.push(`  ${copy.id}: ${id}`)
  }

  if (!result.already_applied && result.raffle) {
    lines.push('')
    lines.push(result.raffle.status === 'active' ? copy.notices(result.notified) : copy.noNotices)
  }

  return lines
}
