/**
 * Reparto de un abono entre las boletas de un cliente (CLAUDE.md 18, BR-F05).
 *
 * Funciones PURAS, sin dependencias: se ejecutan en el navegador mientras la
 * persona escribe y en el servidor antes de llamar a la RPC, con el mismo
 * resultado. La palabra final la tiene `create_payment`, que vuelve a validar
 * el cuadre y el sobrepago dentro de una transaccion.
 *
 * Todo en PESOS ENTEROS. Ni un solo calculo con decimales: repartir 100.000
 * entre 3 boletas da 33.334 + 33.333 + 33.333, nunca 33.333,33 (BR-P02).
 */

import { ticketLabel } from '@/lib/tickets'

export type PayableTicket = {
  ticketId: string
  /** Los dos numeros: con ellos se nombra la boleta al avisar de un error (BR-N11). */
  dailyNumber: string | null
  weeklyNumber: string | null
  /** Saldo pendiente de esta boleta, en pesos enteros. */
  pendingAmount: number
}

export type Allocation = {
  ticketId: string
  amount: number
}

export type AllocationIssue = {
  ticketId: string
  message: string
}

export type AllocationValidation = {
  /** Suma de lo repartido. */
  allocated: number
  /** Diferencia contra el total del pago: 0 es lo unico aceptable (BR-F05). */
  difference: number
  issues: AllocationIssue[]
  /** Mensaje general del formulario, si el reparto no cuadra. */
  error: string | null
  valid: boolean
}

/**
 * Reparte `total` entre las boletas indicadas, de la primera a la ultima, sin
 * pasarse del saldo de ninguna.
 *
 * Es la sugerencia por omision: cubre el caso habitual —«me dio $50.000, abona
 * lo que puedas»— y la persona puede ajustar cualquier fila despues. Si el
 * total supera la deuda completa, devuelve el reparto maximo posible y el
 * sobrante queda sin asignar, para que el formulario lo muestre en vez de
 * inventarse un sobrepago.
 */
export function distributeAmount(
  total: number,
  tickets: readonly PayableTicket[],
): Map<string, number> {
  const result = new Map<string, number>()
  let remaining = Math.max(0, Math.trunc(total))

  for (const ticket of tickets) {
    if (remaining <= 0) {
      result.set(ticket.ticketId, 0)
      continue
    }
    const amount = Math.min(remaining, Math.max(0, ticket.pendingAmount))
    result.set(ticket.ticketId, amount)
    remaining -= amount
  }

  return result
}

/** Suma de un reparto, ignorando las filas en cero. */
export function sumAllocations(allocations: readonly Allocation[]): number {
  return allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
}

/** Solo las filas con valor: la RPC rechaza importes menores o iguales a cero. */
export function nonZeroAllocations(allocations: readonly Allocation[]): Allocation[] {
  return allocations.filter((allocation) => allocation.amount > 0)
}

/**
 * Valida un reparto contra el total y contra el saldo de cada boleta.
 *
 * Reglas comprobadas (BR-F03, BR-F05, BR-F12):
 *   * ningun importe negativo;
 *   * ningun importe por encima del saldo pendiente de su boleta;
 *   * al menos una boleta con importe;
 *   * la suma es EXACTAMENTE el total del pago.
 */
export function validateAllocations(
  total: number,
  allocations: readonly Allocation[],
  tickets: readonly PayableTicket[],
): AllocationValidation {
  const pendingByTicket = new Map(tickets.map((ticket) => [ticket.ticketId, ticket.pendingAmount]))
  const labelByTicket = new Map(tickets.map((ticket) => [ticket.ticketId, ticketLabel(ticket)]))
  const issues: AllocationIssue[] = []

  for (const allocation of allocations) {
    if (allocation.amount < 0) {
      issues.push({ ticketId: allocation.ticketId, message: 'No puede ser negativo.' })
      continue
    }

    const pending = pendingByTicket.get(allocation.ticketId)
    if (pending === undefined) {
      issues.push({
        ticketId: allocation.ticketId,
        message: 'Esa boleta no pertenece a este cliente.',
      })
      continue
    }

    // BR-F12: el sobrepago se bloquea aqui, en el servidor y en la base de
    // datos. Las tres capas dicen lo mismo.
    if (allocation.amount > pending) {
      issues.push({
        ticketId: allocation.ticketId,
        message:
          `Supera el saldo pendiente de la boleta ${labelByTicket.get(allocation.ticketId) ?? ''}.`.trim(),
      })
    }
  }

  const allocated = sumAllocations(allocations)
  const difference = total - allocated

  let error: string | null = null
  if (!Number.isInteger(total) || total <= 0) {
    error = 'El valor del abono debe ser mayor que cero.'
  } else if (nonZeroAllocations(allocations).length === 0) {
    error = 'Reparte el abono entre al menos una boleta.'
  } else if (difference !== 0) {
    error =
      difference > 0
        ? `Faltan por repartir ${difference} pesos.`
        : `Se repartieron ${Math.abs(difference)} pesos de más.`
  }

  return {
    allocated,
    difference,
    issues,
    error,
    valid: error === null && issues.length === 0,
  }
}

/**
 * Estado de pago de una boleta (BR-F07, BR-F08).
 *
 * La base de datos ya lo calcula en una columna GENERADA y es la unica fuente
 * de verdad: esta funcion existe solo para PREVISUALIZAR en el formulario como
 * quedara la boleta si se confirma el abono. Ninguna pantalla guarda ni deduce
 * el estado a partir de ella.
 */
export function previewPaymentStatus(
  salePrice: number | null,
  paidAmount: number,
): 'unpaid' | 'partial' | 'paid' {
  if (salePrice === null || paidAmount <= 0) return 'unpaid'
  if (paidAmount < salePrice) return 'partial'
  return 'paid'
}
