import type { Database } from '@/types/database.types'

export type AppRole = Database['public']['Enums']['app_role']
export type RaffleStatus = Database['public']['Enums']['raffle_status']
export type TicketInventoryStatus = Database['public']['Enums']['ticket_inventory_status']
export type TicketPaymentStatus = Database['public']['Enums']['ticket_payment_status']
export type PaymentMethod = Database['public']['Enums']['payment_method']

/** CLAUDE.md, seccion 6: precio predeterminado de boleta en pesos colombianos. */
export const DEFAULT_TICKET_PRICE = 100_000

export const BULK_TICKET_MIN = 1
export const BULK_TICKET_MAX = 1000

/**
 * Filas por llamada a bulk_create_tickets. La RPC acepta hasta 1.000 de una
 * vez, pero enviarlas en lotes permite mostrar progreso real y acotar el
 * tamano de cada request (docs/ARCHITECTURE.md 10).
 */
export const BULK_TICKET_BATCH_SIZE = 100

/**
 * Maximo de boletas que un VENDEDOR crea de una vez (CLAUDE.md 16).
 *
 * Mas bajo que el limite del personal a proposito: la creacion del vendedor no
 * pasa por `bulk_create_tickets`, que reserva el bloque de codigos de una sola
 * vez, sino por un INSERT normal cuyo trigger genera el codigo fila por fila
 * (riesgo R-15). Cien es de sobra para el caso real y evita ese cuello (D-049).
 */
export const SELLER_TICKET_MAX = 100

/**
 * Maximo de boletas que se pueden seleccionar a la vez para una accion masiva
 * (BR-B01, D-082).
 *
 * Es el mismo tope que ya usan `bulk_create_tickets` y
 * `taken_ticket_combinations`: mil boletas es de sobra para cualquier operacion
 * real, y por encima de eso ni la persona puede revisar lo que va a cambiar ni
 * tiene sentido resolver la seleccion en una sola llamada.
 */
export const BULK_SELECTION_MAX = 1000

/** daily_number / weekly_number: 1 a 4 digitos (docs/BUSINESS_RULES.md BR-N02). */
export const TICKET_NUMBER_MAX_LENGTH = 4
export const TICKET_NUMBER_REGEX = /^[0-9]{1,4}$/

/** Filas por pagina en las tablas paginadas en servidor. */
export const PAGE_SIZE = 25

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  seller: 'Vendedor',
}

/** Etiquetas de estado en espanol (docs/ARCHITECTURE.md 8.3). */
export const TICKET_INVENTORY_STATUS_LABELS: Record<TicketInventoryStatus, string> = {
  draft: 'Borrador',
  pending_approval: 'Pendiente de aprobación',
  available: 'Disponible',
  assigned: 'Asignada',
  cancelled: 'Anulada',
}

export const TICKET_PAYMENT_STATUS_LABELS: Record<TicketPaymentStatus, string> = {
  unpaid: 'Sin pagar',
  partial: 'Abonada',
  paid: 'Pagada',
}

export const RAFFLE_STATUS_LABELS: Record<RaffleStatus, string> = {
  draft: 'Borrador',
  active: 'Activa',
  closed: 'Cerrada',
  cancelled: 'Anulada',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  other: 'Otro',
}

export const TICKET_INVENTORY_STATUS_VALUES = Object.keys(
  TICKET_INVENTORY_STATUS_LABELS,
) as TicketInventoryStatus[]

export const TICKET_PAYMENT_STATUS_VALUES = Object.keys(
  TICKET_PAYMENT_STATUS_LABELS,
) as TicketPaymentStatus[]

/**
 * Transiciones de estado de rifa permitidas (BR-R03). `closed -> active`
 * existe pero es exclusiva del Owner: lo verifica la Server Action, porque la
 * base de datos no distingue owner de admin al actualizar `raffles`.
 */
export const RAFFLE_STATUS_TRANSITIONS: Record<RaffleStatus, RaffleStatus[]> = {
  draft: ['active', 'cancelled'],
  active: ['closed', 'cancelled'],
  closed: ['active', 'cancelled'],
  cancelled: [],
}

/** BR-R03: reabrir una rifa cerrada es una accion exclusiva del Owner. */
export function isOwnerOnlyRaffleTransition(from: RaffleStatus, to: RaffleStatus): boolean {
  return from === 'closed' && to === 'active'
}

/** Telefono: mismo formato que el CHECK de profiles/clients en la base de datos. */
export const PHONE_REGEX = /^[0-9+ ()-]{7,20}$/
