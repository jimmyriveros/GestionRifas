/**
 * Periodo del panel del vendedor: los cuatro rangos que se pueden elegir
 * arriba a la derecha, y la aritmetica de fechas que necesitan (D-112).
 *
 * ES UN MODULO PURO A PROPOSITO. No consulta nada y no importa `server-only`:
 * lo usan el componente de servidor que arma el panel y el selector de cliente
 * que cambia la URL, y ademas asi los casos limite —el mes pasado en enero, el
 * periodo anterior de un rango de un dia, una comparacion contra cero— se
 * prueban sin montar React ni levantar la base de datos.
 *
 * TODAS las fechas son dias calendario de Bogota en formato 'AAAA-MM-DD', los
 * mismos que guarda `payments.payment_date` (columna `date`, ver 0002). Se
 * opera anclando cada dia al MEDIODIA UTC por la razon que ya explica
 * `src/lib/dates.ts`: a medianoche, cualquier desplazamiento de zona horaria
 * cambia el dia y las cifras se moverian un dia entero.
 */

export const DASHBOARD_RANGE_KEYS = ['7d', '30d', 'month', 'last-month'] as const

export type DashboardRangeKey = (typeof DASHBOARD_RANGE_KEYS)[number]

/** Lo que se lee en el desplegable. Un termino, un nombre (UX_COPY, Anexo A). */
export const DASHBOARD_RANGE_LABELS: Record<DashboardRangeKey, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  month: 'Este mes',
  'last-month': 'Mes pasado',
}

/** Siete dias: lo que pidio el encargo y lo que cabe en el grafico del telefono. */
export const DEFAULT_DASHBOARD_RANGE: DashboardRangeKey = '7d'

export type DateRange = {
  /** Primer dia incluido, 'AAAA-MM-DD'. */
  from: string
  /** Ultimo dia incluido, 'AAAA-MM-DD'. */
  to: string
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function toUtcNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`)
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Suma (o resta) dias calendario a un 'AAAA-MM-DD'. */
export function addDays(iso: string, days: number): string {
  const date = toUtcNoon(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toIso(date)
}

/** Dias que abarca el rango, contando los dos extremos. Nunca menor que 1. */
export function rangeLength({ from, to }: DateRange): number {
  const diff = (toUtcNoon(to).getTime() - toUtcNoon(from).getTime()) / 86_400_000
  return Math.max(1, Math.round(diff) + 1)
}

/** Todos los dias del rango, del mas antiguo al mas reciente y sin huecos. */
export function eachDay(range: DateRange): string[] {
  const days: string[] = []
  for (let i = 0; i < rangeLength(range); i += 1) days.push(addDays(range.from, i))
  return days
}

/** Valida lo que llega por la URL. Cualquier otra cosa cae en el rango por defecto. */
export function parseDashboardRange(value: string | undefined): DashboardRangeKey {
  return DASHBOARD_RANGE_KEYS.includes(value as DashboardRangeKey)
    ? (value as DashboardRangeKey)
    : DEFAULT_DASHBOARD_RANGE
}

/**
 * Convierte la opcion elegida en dos fechas concretas.
 *
 * `today` se recibe en vez de leerse del reloj para que el resultado sea
 * comprobable: es siempre `todayBogota()` en la aplicacion.
 */
export function resolveDashboardRange(key: DashboardRangeKey, today: string): DateRange {
  const reference = ISO_DATE_RE.test(today) ? today : toIso(new Date())

  switch (key) {
    case '30d':
      return { from: addDays(reference, -29), to: reference }
    case 'month':
      return { from: `${reference.slice(0, 7)}-01`, to: reference }
    case 'last-month': {
      const firstOfThisMonth = `${reference.slice(0, 7)}-01`
      const lastOfPrevMonth = addDays(firstOfThisMonth, -1)
      return { from: `${lastOfPrevMonth.slice(0, 7)}-01`, to: lastOfPrevMonth }
    }
    case '7d':
    default:
      return { from: addDays(reference, -6), to: reference }
  }
}

/**
 * El periodo INMEDIATAMENTE anterior, de la misma duracion (encargo, seccion
 * «Comparacion contra periodo anterior»): 11–17 de agosto se compara con 4–10.
 */
export function previousRange(range: DateRange): DateRange {
  const length = rangeLength(range)
  const to = addDays(range.from, -1)
  return { from: addDays(to, -(length - 1)), to }
}

export type Comparison =
  | { kind: 'up' | 'down' | 'same'; percentage: number }
  /**
   * No hay con que comparar: en el periodo anterior no entro nada. Un aumento
   * desde cero no es «+100%» ni «+∞%», es un dato que no existe, y la pantalla
   * lo dice con palabras (encargo: nada de NaN, Infinity ni porcentajes
   * inventados).
   */
  | { kind: 'unknown'; percentage: null }

export function comparePeriods(current: number, previous: number): Comparison {
  if (previous <= 0) return { kind: 'unknown', percentage: null }

  const change = Math.round(((current - previous) / previous) * 100)
  if (change > 0) return { kind: 'up', percentage: change }
  if (change < 0) return { kind: 'down', percentage: Math.abs(change) }
  return { kind: 'same', percentage: 0 }
}
