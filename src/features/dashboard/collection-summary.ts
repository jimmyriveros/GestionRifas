/**
 * Calculo puro del resumen de cobranza del panel (reemplaza la tarjeta "Rifa
 * activa", D-090). Separado del componente visual para poder probar los casos
 * limite sin montar React: sin ventas, recaudo total y una posible
 * inconsistencia historica (recaudado > vendido) que la base de datos ya
 * impide, pero que la interfaz nunca debe romper si apareciera.
 */

export type CollectionTotals = {
  totalSold: number
  totalCollected: number
  pendingAmount: number
}

export type CollectionSummary = {
  /** false cuando no hay ninguna venta: la tarjeta muestra un estado vacio. */
  hasSales: boolean
  /** Redondeado y acotado a [0, 100] para la barra y el texto. */
  percentage: number
  /** pendingAmount nunca se muestra negativo, aunque el dato lo estuviera. */
  safePendingAmount: number
}

export function calculateCollectionSummary({
  totalSold,
  totalCollected,
  pendingAmount,
}: CollectionTotals): CollectionSummary {
  const hasSales = totalSold > 0
  const rawPercentage = hasSales ? (totalCollected / totalSold) * 100 : 0

  return {
    hasSales,
    percentage: Math.min(100, Math.max(0, Math.round(rawPercentage))),
    safePendingAmount: Math.max(0, pendingAmount),
  }
}
