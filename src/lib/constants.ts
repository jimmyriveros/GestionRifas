import type { Database } from '@/types/database.types'

export type AppRole = Database['public']['Enums']['app_role']

/** CLAUDE.md, seccion 6: precio predeterminado de boleta en pesos colombianos. */
export const DEFAULT_TICKET_PRICE = 100_000

export const BULK_TICKET_MIN = 1
export const BULK_TICKET_MAX = 1000

/** daily_number / weekly_number: 1 a 4 digitos (docs/BUSINESS_RULES.md BR-N02). */
export const TICKET_NUMBER_MAX_LENGTH = 4
export const TICKET_NUMBER_REGEX = /^[0-9]{1,4}$/

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Dueno',
  admin: 'Administrador',
  seller: 'Vendedor',
}

/** Etiquetas de estado en espanol (docs/ARCHITECTURE.md 8.3). Se amplia en fases futuras. */
export const TICKET_INVENTORY_STATUS_LABELS = {
  draft: 'Borrador',
  pending_approval: 'Pendiente de aprobacion',
  available: 'Disponible',
  assigned: 'Asignada',
  cancelled: 'Anulada',
} as const

export const TICKET_PAYMENT_STATUS_LABELS = {
  unpaid: 'Sin pagar',
  partial: 'Abonada',
  paid: 'Pagada',
} as const

export const RAFFLE_STATUS_LABELS = {
  draft: 'Borrador',
  active: 'Activa',
  closed: 'Cerrada',
  cancelled: 'Anulada',
} as const
