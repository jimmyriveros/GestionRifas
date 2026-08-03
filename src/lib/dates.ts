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

/** Fecha de hoy en America/Bogota, como 'YYYY-MM-DD'. */
export function todayBogota(): string {
  return isoDateFormatter.format(new Date())
}

/** Formatea una fecha/timestamp para mostrar, en espanol y hora de Bogota. */
export function formatDateEs(value: string | Date): string {
  return dateFormatter.format(new Date(value))
}

/** Igual que formatDateEs pero incluyendo la hora. */
export function formatDateTimeEs(value: string | Date): string {
  return dateTimeFormatter.format(new Date(value))
}
