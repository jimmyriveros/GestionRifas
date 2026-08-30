/**
 * Serial de Excel (sistema 1900) a fecha ISO y hora. 2026 cae muy por encima
 * del bug del 29/02/1900, asi que no se corrige ese dia.
 */
export function excelSerialToIsoDate(serial: number): string {
  const day = Math.floor(serial)
  const ms = Date.UTC(1899, 11, 30) + day * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

export function excelFractionToBogotaTime(fraction: number): { hour: number; minute: number } {
  const totalMinutes = Math.round(((fraction % 1) + 1e-12) * 24 * 60)
  const hour = Math.floor(totalMinutes / 60) % 24
  const minute = totalMinutes % 60
  return { hour, minute }
}

export function combineBogotaDateTime(isoDate: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${isoDate}T${hh}:${mm}:00-05:00`
}

function splitIso(isoDate: string): { y: number; m: number; d: number } {
  const parts = isoDate.split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  const d = parts[2]
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error('Fecha ISO invalida')
  }
  return { y, m, d }
}

/** Lunes=1 ... Domingo=7, anclado a America/Bogota via la fecha ISO. */
export function isoWeekday(isoDate: string): number {
  const { y, m, d } = splitIso(isoDate)
  const utc = new Date(Date.UTC(y, m - 1, d, 12))
  const day = utc.getUTCDay()
  return day === 0 ? 7 : day
}

export function isoDateOnWeekday(isoDate: string, weekday: number): string {
  const current = isoWeekday(isoDate)
  const delta = weekday - current
  const { y, m, d } = splitIso(isoDate)
  const utc = new Date(Date.UTC(y, m - 1, d + delta))
  return utc.toISOString().slice(0, 10)
}
