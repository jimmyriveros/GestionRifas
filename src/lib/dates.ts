const BOGOTA_TZ = 'America/Bogota'

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const timeFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const weekdayFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TZ,
  weekday: 'long',
})

// Dia, mes largo y ano por separado, para poder escribir un rango sin repetir
// el mes ni el ano: «del 1 al 5 de diciembre». El mes LARGO no se abrevia, asi
// que no depende de la version de CLDR (la trampa de D-195 era con las
// abreviaturas).
const longDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

// Hora de reloj, sin dia ni zona: la usa `formatClockEs` para un `time` de
// PostgreSQL. En UTC a proposito, para que la hora no se desplace.
const clockFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'UTC',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

// Formato en-CA produce YYYY-MM-DD por defecto: util para <input type="date">
// y para comparar/ordenar como texto.
const isoDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TZ })

// DD/MM/AAAA con digitos, para los CSV. Excel en configuracion regional de
// Colombia reconoce este formato como fecha; "04 ago 2026" lo dejaria como
// texto y la columna no se podria ordenar ni filtrar por rango (D-056).
const csvDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Convierte a `Date` distinguiendo un DIA CALENDARIO de un INSTANTE.
 *
 * `payment_date`, `sale_date`, `start_date` y `end_date` son columnas `date`:
 * PostgREST las entrega como 'AAAA-MM-DD' y `new Date()` interpreta esa forma
 * como MEDIANOCHE UTC, que en Bogota (UTC-5) es todavia el DIA ANTERIOR a las
 * 19:00. Formatearlas sin mas restaba un dia a toda fecha de pago, de venta y
 * de rifa que se mostrara en pantalla (I-017).
 *
 * Anclarlas al mediodia UTC las deja en el mismo dia en cualquier zona horaria
 * razonable. Los timestamps completos no se tocan: ahi la hora es informacion
 * real y la conversion a Bogota es justamente lo que se quiere.
 */
function toBogotaDate(value: string | Date): Date {
  if (typeof value === 'string' && DATE_ONLY_RE.test(value)) {
    return new Date(`${value}T12:00:00Z`)
  }
  return new Date(value)
}

/** Fecha de un instante en America/Bogota, como 'YYYY-MM-DD'. */
export function isoDateBogota(value: string | Date): string {
  return isoDateFormatter.format(toBogotaDate(value))
}

/** Fecha de hoy en America/Bogota, como 'YYYY-MM-DD'. */
export function todayBogota(): string {
  return isoDateBogota(new Date())
}

/** Formatea una fecha/timestamp para mostrar, en espanol y hora de Bogota. */
export function formatDateEs(value: string | Date): string {
  return dateFormatter.format(toBogotaDate(value))
}

/** Igual que formatDateEs pero incluyendo la hora. */
export function formatDateTimeEs(value: string | Date): string {
  return dateTimeFormatter.format(toBogotaDate(value))
}

/** Solo la hora en America/Bogota. Un instante, no un dia calendario. */
export function formatTimeEs(value: string | Date): string {
  return timeFormatter.format(toBogotaDate(value))
}

/**
 * Las tres piezas de una fecha larga: «21», «diciembre» y «2026». Quien escribe
 * un rango las compone sin repetir el mes cuando es el mismo (D-199).
 */
export function longDatePartsEs(value: string | Date): { day: string; month: string; year: string } {
  const parts = longDateFormatter.formatToParts(toBogotaDate(value))
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return { day: find('day'), month: find('month'), year: find('year') }
}

/** Una fecha larga completa: «21 de diciembre de 2026». */
export function formatLongDateEs(value: string | Date): string {
  const { day, month, year } = longDatePartsEs(value)
  return `${day} de ${month} de ${year}`
}

/**
 * Un rango de días en largo, con el año al final: «del 27 de julio al 21 de
 * diciembre de 2026». El mes y el año se escriben una sola vez cuando se
 * repiten —«del 3 al 27 de noviembre de 2026»—, y los dos años cuando el rango
 * cruza de año. Un solo día es «el 21 de diciembre de 2026».
 */
export function formatLongDateRangeEs(from: string | Date, to: string | Date): string {
  return longDateSpanEs(from, to, 'del', 'al')
}

/**
 * Lo mismo, pero diciendo que unas fechas CAEN dentro del tramo, no que lo
 * llenan: «entre el 9 y el 24 de agosto de 2026» (D-208). Es la forma de hablar
 * de unos sorteos sueltos cuyo primero y último se conocen, sin prometer que
 * todos los días de en medio estén en el mismo caso. Un solo día es «el 24 de
 * agosto de 2026».
 */
export function formatLongDateBetweenEs(from: string | Date, to: string | Date): string {
  return longDateSpanEs(from, to, 'entre el', 'y el')
}

function longDateSpanEs(
  from: string | Date,
  to: string | Date,
  opening: string,
  joiner: string,
): string {
  const a = longDatePartsEs(from)
  const b = longDatePartsEs(to)
  if (a.year !== b.year) {
    return `${opening} ${a.day} de ${a.month} de ${a.year} ${joiner} ${b.day} de ${b.month} de ${b.year}`
  }
  if (a.month !== b.month) {
    return `${opening} ${a.day} de ${a.month} ${joiner} ${b.day} de ${b.month} de ${b.year}`
  }
  if (a.day !== b.day) {
    return `${opening} ${a.day} ${joiner} ${b.day} de ${b.month} de ${b.year}`
  }
  return `el ${b.day} de ${b.month} de ${b.year}`
}

/**
 * Una hora de RELOJ, no un instante: «19:00:00» → «7:00 p. m.» (D-188).
 *
 * `formatTimeEs` recibe una fecha completa y la traduce a Bogota; esto recibe
 * un `time` de PostgreSQL, que no tiene dia ni zona. Se formatea en UTC sobre
 * una fecha ficticia precisamente para que no se desplace: la hora que entra es
 * la que sale.
 *
 * Va con `hour: 'numeric'` y no `'2-digit'` —«7:00 p. m.», no «07:00 p. m.»—
 * porque aqui la hora la eligio una persona en un desplegable y asi es como la
 * diria. El recuadro de loterias usa 2-digit para horas de sorteo, que son
 * siempre de dos cifras y donde no se nota.
 */
export function formatClockEs(time: string): string {
  const [rawHour, rawMinute] = time.split(':')
  const hour = Number(rawHour)
  const minute = Number(rawMinute)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return time
  return clockFormatter.format(new Date(Date.UTC(2000, 0, 1, hour, minute)))
}

/** Dia de la semana en minusculas (`lunes` … `domingo`), en America/Bogota. */
export function formatWeekdayEs(value: string | Date): string {
  return weekdayFormatter.format(toBogotaDate(value)).toLowerCase()
}

/** Fecha para una celda de CSV, como DD/MM/AAAA en hora de Bogota (D-056). */
export function formatDateCsv(value: string | Date): string {
  return csvDateFormatter.format(toBogotaDate(value))
}

// Dia y mes, sin año: para el eje de un grafico, donde el año se repite en
// todos los puntos y no hay ancho que gastar en el (D-112).
const dayMonthFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TZ,
  day: 'numeric',
  month: 'short',
})

/** «7 de ago». Solo para ejes y listas apretadas; una fecha completa usa `formatDateEs`. */
export function formatDayMonthEs(value: string | Date): string {
  return dayMonthFormatter.format(toBogotaDate(value))
}

/**
 * Un periodo escrito de corrido: «11 a 17 de ago de 2026» (D-112).
 *
 * `formatRange` de Intl junta lo que las dos fechas tienen en comun, de modo
 * que dentro de un mismo mes no se repite el mes ni el año, y entre dos años
 * distintos los escribe los dos. Escribirlo a mano habria significado decidir
 * eso mismo caso por caso.
 */
export function formatDateRangeEs(from: string | Date, to: string | Date): string {
  return dateFormatter.formatRange(toBogotaDate(from), toBogotaDate(to))
}
