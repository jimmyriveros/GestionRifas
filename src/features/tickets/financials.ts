import { calculateCollectionSummary } from '@/features/dashboard/collection-summary'
import type { TicketInventoryStatus } from '@/lib/constants'

/**
 * La cuenta de UNA boleta: cuanto se abono, cuanto falta y por donde va.
 *
 * FUENTE UNICA. Las tres pantallas que enseñan dinero de una boleta —«Mis
 * boletas», «Boletas de este cliente» y el detalle— pasan por aqui. Antes cada
 * una hacia su propia resta y su propia division, y con eso basta para que la
 * misma boleta salga al 42 % en una lista y al 41 % en otra.
 *
 * NO CONSULTA NADA. `salePrice` y `paidAmount` vienen ya en la fila del
 * listado: `paid_amount` es una columna de `tickets` que mantiene la base de
 * datos al registrar o anular un pago, contando solo las asignaciones de pagos
 * NO anulados (BR-F08). Que un abono cuente o no lo decide SQL; aqui solo se
 * presenta lo que ya venia decidido.
 *
 * REGLAS QUE NO SE TOCAN:
 *
 *   * El precio es el de la boleta (`sale_price`, congelado al vender), nunca
 *     una cifra escrita en el codigo (BR-P07, CLAUDE.md §14).
 *   * El porcentaje se acota a [0, 100] y el pendiente nunca se pinta negativo:
 *     la base impide el sobrepago, pero la interfaz no puede romperse si un
 *     dato historico lo trajera.
 *   * Una boleta que no se ha vendido no debe dinero: `sold` es falso y las
 *     cifras se callan en vez de escribir «$0 de $0».
 */

export type TicketFinancialsInput = {
  inventoryStatus: TicketInventoryStatus
  /** NULL mientras la boleta no se ha vendido (BR-F08). */
  salePrice: number | null
  paidAmount: number
}

export type TicketFinancials = {
  /** false cuando no hay venta: la pantalla no muestra cifras, muestra «—». */
  sold: boolean
  /** Precio real de ESTA boleta. 0 cuando no se ha vendido. */
  price: number
  paidAmount: number
  /** `price - paidAmount`, nunca negativo. */
  pendingAmount: number
  /** Entero de 0 a 100, para la barra y para el texto que la acompaña. */
  percentage: number
}

export function ticketFinancials({
  inventoryStatus,
  salePrice,
  paidAmount,
}: TicketFinancialsInput): TicketFinancials {
  // El mismo criterio que ya usaba el detalle: vendida es «asignada Y con
  // precio». Una boleta anulada deja de deber, aunque conserve su historial.
  const sold = inventoryStatus === 'assigned' && salePrice !== null
  const price = sold ? salePrice : 0
  const paid = sold ? Math.max(0, paidAmount) : 0

  const { percentage, safePendingAmount } = calculateCollectionSummary({
    totalSold: price,
    totalCollected: paid,
    pendingAmount: price - paid,
  })

  return { sold, price, paidAmount: paid, pendingAmount: safePendingAmount, percentage }
}
