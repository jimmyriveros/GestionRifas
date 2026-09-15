import type { TicketInventoryStatus } from '@/lib/constants'

/**
 * Que se puede hacer con cada boleta seleccionada, y por que no cuando no se
 * puede (seccion 27 del encargo, BR-B06).
 *
 * Los datos vienen tal cual de SQL —`ticket_bulk_eligibility` para el vendedor
 * (migracion 0020) y `admin_ticket_bulk_eligibility` para el personal (0057)—:
 * las REGLAS estan alli y no se repiten aqui. Este archivo solo agrupa, cuenta y
 * pone en palabras lo que la base de datos ya decidio, para que la pantalla
 * pueda explicarlo en vez de limitarse a deshabilitar un boton.
 *
 * Es codigo puro: sin acceso a red y sin `server-only`, para que lo usen igual
 * el navegador y las pruebas unitarias.
 */

export const BULK_ACTIONS = ['approve', 'assign', 'cancel', 'changeSeller', 'delete'] as const
export type BulkAction = (typeof BULK_ACTIONS)[number]

type EligibilityBase = {
  ticketId: string
  dailyNumber: string | null
  weeklyNumber: string | null
  inventoryStatus: TicketInventoryStatus
  sellerId: string
  raffleId: string
  raffleActive: boolean
  can: Record<BulkAction, boolean>
}

/** Lo que recibe el VENDEDOR: sabe si hay cliente, abonos y entre que precios vende. */
export type SellerTicketEligibility = EligibilityBase & {
  audience: 'seller'
  hasClient: boolean
  hasActivePayments: boolean
  hasPayments: boolean
  /** Precio oficial vigente de su rifa (BR-P10). */
  basePrice: number
  /** Lo mas barato que se puede vender esta boleta (BR-P11). Lo calcula SQL a
   *  partir de la forma de pago de SU vendedor; la pantalla no lo deduce. */
  minSalePrice: number
}

/**
 * Lo que recibe el PERSONAL (D-198): sin cliente, sin abonos y sin precios.
 *
 * `admin_ticket_bulk_eligibility` no los devuelve y este tipo tampoco los
 * declara, asi que ningun dialogo del portal administrativo los puede pintar.
 */
export type AdminTicketEligibility = EligibilityBase & { audience: 'staff' }

export type TicketEligibility = SellerTicketEligibility | AdminTicketEligibility

/**
 * El precio de venta que puede ofrecerse para TODO el lote (BR-P09, D-099).
 *
 * Solo existe si las boletas coinciden en las dos cifras: una seleccion que
 * mezcle rifas de precios distintos —o vendedores con formas de pago
 * distintas— no tiene un unico precio que proponer, y en ese caso la pantalla
 * no ofrece la casilla y cada boleta se vende al precio de su rifa. Solo tiene
 * sentido para el vendedor: el personal no vende.
 */
export function commonPriceRange(
  rows: readonly TicketEligibility[],
): { basePrice: number; minSalePrice: number } | null {
  const sellerRows = rows.filter((row): row is SellerTicketEligibility => row.audience === 'seller')
  const first = sellerRows[0]
  if (!first || sellerRows.length !== rows.length) return null

  const igual = sellerRows.every(
    (row) => row.basePrice === first.basePrice && row.minSalePrice === first.minSalePrice,
  )

  return igual ? { basePrice: first.basePrice, minSalePrice: first.minSalePrice } : null
}

/** Como se llama cada accion en pantalla. Un termino, un nombre (Anexo A). */
export const BULK_ACTION_LABELS: Record<BulkAction, string> = {
  approve: 'Aprobar boletas',
  assign: 'Asignar a un cliente',
  cancel: 'Anular boletas',
  changeSeller: 'Cambiar vendedor',
  delete: 'Eliminar boletas',
}

export function countEligible(rows: readonly TicketEligibility[], action: BulkAction): number {
  return rows.reduce((total, row) => total + (row.can[action] ? 1 : 0), 0)
}

export function ineligibleFor(
  rows: readonly TicketEligibility[],
  action: BulkAction,
): TicketEligibility[] {
  return rows.filter((row) => !row.can[action])
}

export function allEligible(rows: readonly TicketEligibility[], action: BulkAction): boolean {
  return rows.length > 0 && rows.every((row) => row.can[action])
}

/**
 * Por que esta boleta concreta no admite esta accion.
 *
 * Una sola razon, la primera que aplica, y siempre la mas util para decidir
 * que hacer a continuacion. Encadenar «y ademas...» alarga el mensaje sin
 * ayudar: si la boleta esta anulada, da igual lo demas.
 */
export function whyNot(row: TicketEligibility, action: BulkAction): string {
  if (row.can[action]) return ''
  if (row.audience === 'staff') return staffWhyNot(row, action)

  if (action === 'approve') {
    if (row.inventoryStatus === 'cancelled') return 'Está anulada.'
    if (row.inventoryStatus === 'draft') return 'Le faltan los números.'
    return 'Ya está aprobada.'
  }

  if (action === 'assign') {
    if (row.inventoryStatus === 'assigned') return 'Ya está vendida a un cliente.'
    if (row.inventoryStatus === 'cancelled') return 'Está anulada.'
    if (row.inventoryStatus === 'pending_approval') return 'Falta que un administrador la apruebe.'
    if (row.inventoryStatus === 'draft') return 'Le faltan los números.'
    if (!row.raffleActive) return 'Su rifa no está activa.'
    return 'No está disponible.'
  }

  if (action === 'cancel') {
    if (row.inventoryStatus === 'cancelled') return 'Ya está anulada.'
    if (row.hasActivePayments) return 'Tiene abonos activos: anúlalos primero.'
    return 'No se puede anular.'
  }

  if (action === 'changeSeller') {
    if (row.inventoryStatus === 'assigned') return 'Ya está vendida: el cliente es de su vendedor.'
    if (row.inventoryStatus === 'cancelled') return 'Está anulada.'
    return 'No puede cambiar de vendedor.'
  }

  // delete
  if (row.inventoryStatus === 'cancelled') return 'Está anulada: sus números quedan reservados.'
  if (row.hasClient) return 'Ya está vendida a un cliente.'
  if (row.hasPayments) return 'Tiene abonos en su historial.'
  return 'Ya entró en la operación: solo se puede anular.'
}

/**
 * Por que el PERSONAL no puede (D-198, BR-Q07).
 *
 * Se explica con el estado de inventario, que es lo unico que el personal ve.
 * Nunca «tiene abonos»: sobre una boleta que el personal ve «Sin pagar», eso le
 * diria que esta abonada.
 */
function staffWhyNot(row: AdminTicketEligibility, action: BulkAction): string {
  if (action === 'approve') {
    if (row.inventoryStatus === 'cancelled') return 'Está anulada.'
    if (row.inventoryStatus === 'draft') return 'Le faltan los números.'
    return 'Ya está aprobada.'
  }

  if (action === 'assign') return 'Solo su vendedor puede asignarla a un cliente.'

  if (action === 'cancel') {
    if (row.inventoryStatus === 'cancelled') return 'Ya está anulada.'
    if (row.inventoryStatus === 'assigned') return 'Ya está vendida y no se puede anular.'
    return 'No se puede anular.'
  }

  if (action === 'changeSeller') {
    if (row.inventoryStatus === 'assigned') return 'Ya está vendida: el cliente es de su vendedor.'
    if (row.inventoryStatus === 'cancelled') return 'Está anulada.'
    return 'No puede cambiar de vendedor.'
  }

  // delete
  if (row.inventoryStatus === 'cancelled') return 'Está anulada: sus números quedan reservados.'
  if (row.inventoryStatus === 'assigned') return 'Ya está vendida.'
  return 'Ya entró en la operación: solo se puede anular.'
}
