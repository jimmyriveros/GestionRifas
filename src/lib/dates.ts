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

/** Fecha de hoy en America/Bogota, como 'YYYY-MM-DD'. */
export function todayBogota(): string {
  return isoDateFormatter.format(new Date())
}

/** Formatea una fecha/timestamp para mostrar, en espanol y hora de Bogota. */
export function formatDateEs(value: string | Date): string {
  return dateFormatter.format(toBogotaDate(value))
}

/** Igual que formatDateEs pero incluyendo la hora. */
export function formatDateTimeEs(value: string | Date): string {
  return dateTimeFormatter.format(toBogotaDate(value))
}

/** Fecha para una celda de CSV, como DD/MM/AAAA en hora de Bogota (D-056). */
export function formatDateCsv(value: string | Date): string {
  return csvDateFormatter.format(toBogotaDate(value))
}
