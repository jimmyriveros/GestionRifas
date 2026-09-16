import { LOTTERY_LABELS } from '@/features/lottery/constants'
import type { LotteryMatchField } from '@/features/lottery/constants'
import { WEEKDAY_LABELS } from '@/lib/constants'
import { formatDateCsv, longDatePartsEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

import type { PrizeDigits } from './matching'
import {
  canonicalRules,
  expandRules,
  rangeRule,
  validityRange,
  type PrizeConflict,
  type PrizeRule,
  type PrizeRuleProblem,
} from './schedule'

/**
 * TODOS los textos de los premios configurables, juntos
 * (`UX_COPY_GUIDELINES.md`, Anexo B).
 *
 * El glosario manda: se dice **premio**, **número diario** y **número semanal**,
 * **cifras**, **lotería correspondiente**, **período** y **archivar**. Nunca
 * «ganador», que es la palabra prohibida de BR-L15: la aplicación detecta una
 * coincidencia numérica y no certifica ningún premio oficial.
 *
 * PURO: no toca la base ni el reloj. La Entrega 2 pinta con esto.
 */

export const PRIZE_CATEGORY_LABELS = {
  main: 'Premio principal',
  daily: 'Diario',
  weekly: 'Semanal',
  special: 'Especial',
} as const

export type PrizeCategory = keyof typeof PRIZE_CATEGORY_LABELS

export const PRIZE_CATEGORY_VALUES = Object.keys(PRIZE_CATEGORY_LABELS) as [
  PrizeCategory,
  ...PrizeCategory[],
]

/**
 * Las dos formas de recompensa (D-201).
 *
 * «Alternativas a elegir» y no «el ganador elige»: «ganador» es la palabra
 * prohibida de BR-L15, y quien acierta tiene una **coincidencia**. La
 * aplicación tampoco registra cuál alternativa se llevó: eso no existe todavía.
 */
export const PRIZE_REWARD_MODE_LABELS = {
  fixed: 'Premio único',
  winner_choice: 'Alternativas a elegir',
} as const

export type PrizeRewardMode = keyof typeof PRIZE_REWARD_MODE_LABELS

export const PRIZE_REWARD_MODE_VALUES = Object.keys(PRIZE_REWARD_MODE_LABELS) as [
  PrizeRewardMode,
  ...PrizeRewardMode[],
]

/** Lo que cabe en una columna estrecha; el término entero va en el `sr-only` (D-114). */
export const PRIZE_DIGITS_LABELS: Record<PrizeDigits, string> = {
  four: '4 cifras',
  last_three: 'Últimas 3',
}

/** El término entero, para el detalle y para quien escucha la pantalla. */
export const PRIZE_DIGITS_FULL_LABELS: Record<PrizeDigits, string> = {
  four: 'Cuatro cifras',
  last_three: 'Últimas tres cifras',
}

export const PRIZE_NUMBER_FIELD_LABELS: Record<LotteryMatchField, string> = {
  daily_number: 'Número diario',
  weekly_number: 'Número semanal',
}

export const PRIZE_NUMBER_FIELD_SHORT_LABELS: Record<LotteryMatchField, string> = {
  daily_number: 'Diario',
  weekly_number: 'Semanal',
}

export const PRIZE_STATUS_LABELS = {
  active: 'Vigente',
  archived: 'Archivado',
} as const

/** Lo que dice la columna «Lotería» de la tabla. */
export function prizeLotteryLabel(rules: PrizeRule[]): string {
  const lotteries = new Set(expandRules(rules).map((occurrence) => occurrence.lottery))
  const only = lotteries.size === 1 ? [...lotteries][0] : null
  return only ? LOTTERY_LABELS[only] : 'Correspondiente'
}

const WEEKDAY_PLURAL: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábados',
}

function joinEs(values: string[]): string {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0] ?? ''
  return `${values.slice(0, -1).join(', ')} y ${values[values.length - 1]}`
}

/** Lo mismo con «o»: las alternativas son excluyentes, no una suma. */
function joinEsOr(values: string[]): string {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0] ?? ''
  return `${values.slice(0, -1).join(', ')} o ${values[values.length - 1]}`
}

function isConsecutive(weekdays: number[]): boolean {
  return weekdays.every((day, index) => index === 0 || day === (weekdays[index - 1] ?? 0) + 1)
}

/** «los sábados», «de lunes a viernes», «los lunes y miércoles». */
function weekdaysText(weekdays: number[]): string {
  if (weekdays.length >= 3 && isConsecutive(weekdays)) {
    const first = weekdays[0] ?? 1
    const last = weekdays[weekdays.length - 1] ?? 1
    return `de ${WEEKDAY_LABELS[first]?.toLowerCase() ?? ''} a ${WEEKDAY_LABELS[last]?.toLowerCase() ?? ''}`
  }
  return `los ${joinEs(weekdays.map((day) => WEEKDAY_PLURAL[day] ?? ''))}`
}

/** «del 1 al 5 de diciembre», «del 30 de diciembre de 2026 al 2 de enero de 2027». */
function rangeText(startDate: string, endDate: string): string {
  const from = longDatePartsEs(startDate)
  const to = longDatePartsEs(endDate)
  if (from.year !== to.year) {
    return `del ${from.day} de ${from.month} de ${from.year} al ${to.day} de ${to.month} de ${to.year}`
  }
  if (from.month !== to.month) {
    return `del ${from.day} de ${from.month} al ${to.day} de ${to.month}`
  }
  return `del ${from.day} al ${to.day} de ${to.month}`
}

/**
 * Un período, en español: «el 21 de diciembre», «del 1 al 5 de diciembre»,
 * «los sábados del 1 al 31 de diciembre».
 *
 * El año se escribe solo cuando el período cruza de año: dentro de una rifa
 * todos los días son del mismo, y repetirlo en cada fila es ruido.
 */
export function summarizeRule(rule: PrizeRule): string {
  if (rule.startDate === rule.endDate) {
    const { day, month } = longDatePartsEs(rule.startDate)
    return `el ${day} de ${month}`
  }

  const range = rangeText(rule.startDate, rule.endDate)
  const everyDay = rangeRule(rule.startDate, rule.endDate).weekdays
  const sameDays =
    everyDay.length === rule.weekdays.length &&
    everyDay.every((day, index) => day === rule.weekdays[index])

  return sameDays ? range : `${weekdaysText(rule.weekdays)} ${range}`
}

/** El calendario entero: «del 1 al 5 de diciembre y del 16 al 19 de diciembre». */
export function summarizeRules(rules: PrizeRule[]): string {
  return joinEs(canonicalRules(rules).map(summarizeRule))
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** El resumen del calendario como lo lee la tabla: con mayúscula inicial. */
export function scheduleSummary(rules: PrizeRule[]): string {
  return capitalize(summarizeRules(rules))
}

/**
 * Una alternativa: lo que se entrega si esa es la elegida (D-201).
 *
 * Los dos componentes son opcionales y al menos uno está: una camioneta, el
 * dinero, o la camioneta **y** el dinero. No hay un título aparte, porque un
 * título libre al lado podría contradecir lo que de verdad se entrega.
 */
export type PrizeRewardOption = { description: string | null; amount: number | null }

export type PrizeReward = { mode: PrizeRewardMode; options: PrizeRewardOption[] }

/** «Camioneta KIA», «$120.000.000», «Renault Alaskan 2023 y $20.000.000». */
export function rewardOptionText(option: PrizeRewardOption): string {
  const parts: string[] = []
  if (option.description) parts.push(option.description)
  if (option.amount !== null) parts.push(formatCOP(option.amount))
  return joinEs(parts)
}

/** Las alternativas, separadas por «o»: son excluyentes y solo se lleva una. */
export function rewardOptionsText(options: PrizeRewardOption[]): string {
  return joinEsOr(options.map(rewardOptionText))
}

/**
 * Lo que entrega un premio, en una frase. Con una sola recompensa se dice tal
 * cual; con varias, que hay que elegir una.
 */
export function rewardText(reward: PrizeReward): string {
  if (reward.mode === 'fixed') {
    const only = reward.options[0]
    return only ? rewardOptionText(only) : ''
  }
  return `una de estas alternativas: ${rewardOptionsText(reward.options)}`
}

/**
 * Desde cuándo y hasta cuándo aplica un premio: «Del 3 al 27 de noviembre»,
 * «Solo el 21 de diciembre» (D-201).
 *
 * Son el primer y el último día en que juega **de verdad**, no las fechas
 * escritas en sus períodos: «los sábados del 1 al 31 de diciembre» empieza el 5.
 */
export function validityText(rules: PrizeRule[]): string {
  const range = validityRange(rules)
  if (!range) return ''
  if (range.from === range.to) {
    const { day, month } = longDatePartsEs(range.from)
    return `Solo el ${day} de ${month}`
  }
  return capitalize(rangeText(range.from, range.to))
}

/**
 * El conflicto entre dos premios, con las MISMAS palabras que responde la base
 * (`raffle_prize_version_problem`): quien lo vea dos veces no tiene por qué
 * entender que son dos sistemas distintos.
 *
 * La fecha va en DD/MM/AAAA, que es lo que escribe la migración; `formatDateCsv`
 * es el único ayudante que ya da ese formato.
 */
export function prizeConflictMessage(title: string, conflict: PrizeConflict): string {
  return `El premio «${title}» y el premio «${conflict.other}» juegan el ${formatDateCsv(conflict.referenceDate)} con el mismo número de la boleta, las mismas cifras y la misma lotería. Cambia las fechas, el número o las cifras de uno de los dos.`
}

/**
 * La vista previa del premio, en una frase:
 *
 * «Del 1 al 5 de diciembre juega con las cuatro cifras del número semanal y la
 * lotería correspondiente de cada día por $1.000.000.»
 *
 * Cuando todos sus días juegan con la misma lotería se dice cuál, que es más
 * útil que repetir «correspondiente».
 */
export function prizePreviewSentence(prize: {
  rules: PrizeRule[]
  numberField: LotteryMatchField
  digits: PrizeDigits
  reward: PrizeReward
}): string {
  const when = scheduleSummary(prize.rules)
  const digits = prize.digits === 'four' ? 'las cuatro cifras' : 'las tres últimas cifras'
  const field = PRIZE_NUMBER_FIELD_LABELS[prize.numberField].toLowerCase()
  const lotteries = new Set(expandRules(prize.rules).map((occurrence) => occurrence.lottery))
  const only = lotteries.size === 1 ? [...lotteries][0] : null
  const lottery = only
    ? `la lotería de ${LOTTERY_LABELS[only]}`
    : 'la lotería correspondiente de cada día'

  return `${when} juega con ${digits} del ${field} y ${lottery} por ${rewardText(prize.reward)}.`
}

/** Quién publicó una versión. Sin actor, fue un proceso del sistema. */
export function prizeActorLabel(name: string | null | undefined): string {
  return name && name.trim() !== '' ? name : 'Sistema'
}

export const PRIZE_COPY = {
  /** Lo que se dice de cada problema de un período, con la misma voz que la base. */
  ruleProblems: {
    invalid_date: 'Una de las fechas del calendario no existe. Revísala.',
    dates_reversed: 'En cada período, la fecha final no puede ser anterior a la inicial.',
    no_weekdays: 'Elige al menos un día de la semana en cada período.',
    sunday: 'El domingo no tiene lotería, así que un premio no puede jugar ese día.',
    weekday_not_covered:
      'El período no incluye todos los días que elegiste. Revisa las fechas o los días.',
    fixed_lottery_missing: 'Elige la lotería con la que juega el premio.',
    fixed_lottery_weekday:
      'La lotería que elegiste solo juega un día de la semana. En ese período deja únicamente ese día.',
    outside_raffle: 'Las fechas del premio tienen que quedar dentro de las fechas de la rifa.',
  } satisfies Record<PrizeRuleProblem, string>,

  form: {
    titleRequired: 'Escribe el nombre del premio.',
    titleShort: 'El nombre del premio debe tener al menos 2 caracteres.',
    titleLong: 'El nombre del premio no puede superar 80 caracteres.',
    categoryRequired: 'Elige la categoría del premio.',
    numberFieldRequired: 'Elige con qué número de la boleta juega el premio.',
    digitsRequired: 'Elige con cuántas cifras juega el premio.',
    rewardModeRequired: 'Elige si el premio entrega una sola recompensa o varias alternativas.',
    rewardRequired: 'Escribe qué entrega el premio.',
    optionsTooMany: 'Un premio admite como máximo 6 alternativas.',
    optionEmpty: 'En cada alternativa escribe el dinero, lo que se entrega, o las dos cosas.',
    optionsRepeated:
      'Hay dos alternativas iguales. Cada alternativa tiene que entregar algo distinto.',
    /** Las dos frases que explican la semántica, con la salida en la misma línea. */
    fixedNeedsOne:
      'Un «Premio único» lleva una sola recompensa. Si quieres que se elija entre varias, cámbialo a «Alternativas a elegir».',
    choiceNeedsTwo:
      '«Alternativas a elegir» necesita al menos dos. Agrega otra alternativa o cámbialo a «Premio único».',
    amountRequired: 'Escribe el valor del premio en pesos.',
    amountNotInteger: 'El valor del premio se escribe en pesos enteros.',
    amountTooHigh: 'El valor del premio no puede superar $10.000.000.000.',
    descriptionShort: 'La descripción del premio debe tener al menos 2 caracteres.',
    descriptionLong: 'La descripción del premio no puede superar 160 caracteres.',
    conditionsLong: 'Las aclaraciones no pueden superar 1.000 caracteres.',
    rulesRequired: 'Agrega al menos un período al calendario del premio.',
    rulesTooMany: 'Un premio admite como máximo 10 períodos.',
    rulesOverlap:
      'Dos períodos del premio incluyen el mismo día. Deja cada día en un solo período.',
    prizeRequired: 'Premio no válido.',
    raffleRequired: 'Rifa no válida.',
    versionRequired: 'Vuelve a abrir el premio para ver cómo quedó.',
    orderInvalid: 'El orden que enviaste no corresponde a los premios vigentes de la rifa.',
    /** Lo único que la pantalla no enseña: quién más puede leer las aclaraciones. */
    conditionsNotice:
      'Las aclaraciones se pueden compartir con los vendedores y con sus clientes: escríbelas pensando en ellos.',
  },
} as const
