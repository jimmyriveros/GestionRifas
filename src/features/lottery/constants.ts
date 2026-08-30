/**
 * Codigos y etiquetas de las seis loterias ordinarias (BR-L01).
 *
 * La coincidencia vive en PostgreSQL (`match_lottery_result`). Aqui solo esta
 * el mapa estable codigo → campo de la boleta y los nombres que vera la
 * persona. El Panel y los avisos (etapas 3 y 4) reutilizan esto; no hay una
 * segunda tabla de nombres.
 *
 * La serie no aparece: es informativa y no participa en la coincidencia
 * (BR-L07). "Ganador" no es un termino de este producto.
 */

export const LOTTERY_CODES = [
  'cundinamarca',
  'cruz_roja',
  'meta',
  'bogota',
  'medellin',
  'boyaca',
] as const

export type LotteryCode = (typeof LOTTERY_CODES)[number]

export const LOTTERY_MATCH_FIELD = {
  cundinamarca: 'daily_number',
  cruz_roja: 'daily_number',
  meta: 'daily_number',
  bogota: 'daily_number',
  medellin: 'daily_number',
  boyaca: 'weekly_number',
} as const satisfies Record<LotteryCode, 'daily_number' | 'weekly_number'>

export type LotteryMatchField = (typeof LOTTERY_MATCH_FIELD)[LotteryCode]

/** Nombres oficiales, en el mismo orden de BR-L01. */
export const LOTTERY_LABELS = {
  cundinamarca: 'Cundinamarca',
  cruz_roja: 'Cruz Roja',
  meta: 'Meta',
  bogota: 'Bogotá',
  medellin: 'Medellín',
  boyaca: 'Boyacá',
} as const satisfies Record<LotteryCode, string>

/** El numero mayor de una loteria colombiana son exactamente cuatro digitos. */
export const LOTTERY_WINNING_NUMBER_REGEX = /^[0-9]{4}$/

export const LOTTERY_SCHEDULE_STATUS_LABELS = {
  scheduled: 'Programado',
  rescheduled_later: 'Aplazado',
  rescheduled_earlier: 'Adelantado',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
  completed: 'Realizado',
  schedule_unverified: 'Horario por confirmar',
  schedule_conflict: 'La programación oficial requiere verificación',
} as const

export const LOTTERY_ASSIGNMENT_STATUS_LABELS = {
  sold: 'Asignada antes del sorteo',
  available: 'Disponible al momento del sorteo',
  late_assignment: 'Asignada después del sorteo',
} as const
