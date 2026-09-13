/**
 * La semana de «Resultados de la semana» y cómo se escribe (BR-H01, BR-H02, D-194).
 *
 * PURO, como `lottery/dashboard.ts`: no mira el reloj ni la base. Quien llama le
 * pasa el día de Bogotá (`todayBogota()`), y por eso las pruebas pueden fijar un
 * domingo, un lunes o un 1 de enero sin falsear la hora del sistema.
 *
 * TODO SE CALCULA SOBRE DÍAS 'AAAA-MM-DD', nunca sobre instantes: la semana es de
 * calendario, y un instante en UTC ya cambió de día a las 7 p. m. de Bogotá
 * (I-017). La aritmética de fechas es la que ya usa el módulo de loterías
 * —`addIsoDays`, `isoWeekday`, `isoDateOnWeekday`—: no hay una segunda.
 */

import type { LotteryCode } from '@/features/lottery/constants'
import { addIsoDays } from '@/features/lottery/dashboard'
import { isoDateOnWeekday, isoWeekday } from '@/features/lottery/parse/excel-date'
import { LOTTERY_NOMINAL_WEEKDAY } from '@/features/lottery/sources'

/** Lunes y sábado de la semana del resumen, como 'AAAA-MM-DD'. */
export type ResultsWeek = {
  monday: string
  saturday: string
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONDAY = 1
const SUNDAY = 7

/**
 * La última semana TERMINADA, de lunes a sábado (BR-H01).
 *
 * El sábado juega Boyacá y su resultado sale esa misma noche, así que la semana
 * no se da por terminada hasta el DOMINGO: un domingo devuelve la que acaba de
 * cerrar y, de lunes a sábado, la anterior completa. Nunca la que está en curso,
 * que todavía no tiene sus seis sorteos.
 */
export function lastCompletedWeek(today: string): ResultsWeek {
  const weekday = isoWeekday(today)
  const lastSunday = weekday === SUNDAY ? today : addIsoDays(today, -weekday)
  return { monday: addIsoDays(lastSunday, -6), saturday: addIsoDays(lastSunday, -1) }
}

/** `true` si la cadena es un día que existe: `2026-02-30` tiene la forma y no existe. */
function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * La semana que pide la dirección de la imagen, o `null` si no se puede servir.
 *
 * Solo acepta el LUNES de una semana ya terminada —su domingo ya llegó—. La
 * pantalla siempre pide la última, pero el parámetro viaja con ella para que la
 * imagen sea la de la semana que se está viendo aunque se cruce la medianoche
 * del domingo entre pintar y pedir. Una semana en curso nunca se sirve (BR-H01).
 */
export function parseWeekParam(value: string | null, today: string): ResultsWeek | null {
  if (value === null || !isCalendarDate(value)) return null
  if (isoWeekday(value) !== MONDAY) return null
  if (addIsoDays(value, 6) > today) return null
  return { monday: value, saturday: addIsoDays(value, 5) }
}

/**
 * El día nominal de una lotería dentro de esa semana (BR-L01, BR-L03).
 *
 * Es `reference_date`, NO el día en que se jugó: un sorteo de Medellín aplazado
 * del viernes al sábado sigue siendo el del viernes (D-143). El día sale de
 * `LOTTERY_NOMINAL_WEEKDAY`, la misma tabla con la que se importa el cronograma.
 */
export function lotteryReferenceDate(week: ResultsWeek, code: LotteryCode): string {
  return isoDateOnWeekday(week.monday, LOTTERY_NOMINAL_WEEKDAY[code])
}

/**
 * Los meses, escritos a mano y no con `Intl` (D-194).
 *
 * `Intl` abrevia según la versión de CLDR que traiga cada motor: el mismo mes
 * sale «sep», «sept» o «sept.» según dónde se ejecute. La imagen y el mensaje
 * tienen que decir exactamente lo mismo en el servidor, en el navegador y en las
 * pruebas.
 */
const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

const MONTH_ABBREVIATIONS = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
] as const

function dayParts(isoDate: string): { day: number; month: number; year: number } {
  const match = ISO_DATE.exec(isoDate)
  if (!match) throw new Error(`Fecha invalida: ${isoDate}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? ''
}

function monthAbbreviation(month: number): string {
  return MONTH_ABBREVIATIONS[month - 1] ?? ''
}

/**
 * La semana en corto, para la cápsula de la imagen: «17–22 AGO 2026».
 *
 * Solo repite lo que cambia: el mes cuando la semana cruza de mes
 * («31 AGO – 5 SEP 2026») y el año cuando cruza de año
 * («29 DIC 2025 – 3 ENE 2026»).
 */
export function formatWeekShort(week: ResultsWeek): string {
  const from = dayParts(week.monday)
  const to = dayParts(week.saturday)
  if (from.year !== to.year) {
    return `${from.day} ${monthAbbreviation(from.month)} ${from.year} – ${to.day} ${monthAbbreviation(to.month)} ${to.year}`
  }
  if (from.month !== to.month) {
    return `${from.day} ${monthAbbreviation(from.month)} – ${to.day} ${monthAbbreviation(to.month)} ${to.year}`
  }
  return `${from.day}–${to.day} ${monthAbbreviation(to.month)} ${to.year}`
}

/**
 * La semana entera, para el mensaje y la pantalla: «del 17 al 22 de agosto de
 * 2026», «del 31 de agosto al 5 de septiembre de 2026» o «del 29 de diciembre de
 * 2025 al 3 de enero de 2026».
 */
export function formatWeekLong(week: ResultsWeek): string {
  const from = dayParts(week.monday)
  const to = dayParts(week.saturday)
  if (from.year !== to.year) {
    return `del ${from.day} de ${monthName(from.month)} de ${from.year} al ${to.day} de ${monthName(to.month)} de ${to.year}`
  }
  if (from.month !== to.month) {
    return `del ${from.day} de ${monthName(from.month)} al ${to.day} de ${monthName(to.month)} de ${to.year}`
  }
  return `del ${from.day} al ${to.day} de ${monthName(to.month)} de ${to.year}`
}

/** El nombre del PNG que se comparte o se descarga: `resultados-semana-2026-08-17.png`. */
export function weeklyResultsFileName(week: ResultsWeek): string {
  return `resultados-semana-${week.monday}.png`
}
