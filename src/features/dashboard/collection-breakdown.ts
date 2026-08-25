/**
 * Reparto del dinero de un vendedor por estado de pago (D-112).
 *
 * DE DONDE SALEN ESTAS CIFRAS Y POR QUE NO HAY UNA CONSULTA NUEVA
 *
 * `v_seller_summary` ya suma en SQL lo vendido, lo recaudado y el saldo, pero
 * NO los separa por estado de pago: no existe «cuanto dinero corresponde a las
 * boletas pagadas». Anadir esa columna significaria una migracion, y una
 * migracion hay que promoverla al proyecto real ANTES de desplegar el codigo o
 * el panel se cae en produccion.
 *
 * No hace falta. Basta con UNA cifra mas —lo abonado sobre las boletas que aun
 * deben— y el resto se deduce, porque las tres definiciones no dejan margen:
 *
 *   · una boleta «Sin pagar» tiene abonado 0;
 *   · una boleta «Pagada» tiene abonado exactamente su precio de venta;
 *   · lo recaudado es la suma de lo abonado en las tres.
 *
 * De ahi: `cobrado en pagadas = recaudado − abonado en las abonadas`, y el
 * valor de venta de cada grupo sale por la misma resta. Las boletas
 * «Abonadas» son ademas las pocas: una boleta solo queda a medias mientras
 * alguien va pagandola a plazos, asi que leerlas fila a fila es barato, y la
 * consulta que lo hace vive en `seller-queries.ts`.
 *
 * Modulo puro: sin `server-only`, sin consultas y con los casos limite
 * —vendedor sin ventas, division por cero, un dato historico incoherente—
 * cubiertos por pruebas unitarias.
 */

/** Los tres totales que ya calcula `v_seller_summary` sobre boletas vendidas. */
export type SellerMoneyTotals = {
  totalSold: number
  totalCollected: number
  pendingAmount: number
}

/** Sumas leidas de las boletas que estan «Abonadas» (0 < abonado < precio). */
export type PartialTicketTotals = {
  /** Suma de su precio de venta. */
  salePrice: number
  /** Suma de lo que ya se cobro de ellas. */
  paidAmount: number
}

export type CollectionBreakdown = {
  /** Valor de todas las boletas vendidas: el total del grafico. */
  totalSold: number
  /** Dinero recibido de boletas cobradas por completo. */
  collectedOnPaid: number
  /** Dinero recibido de boletas que todavia deben. */
  collectedOnPartial: number
  /** Lo que falta por cobrar. Nunca negativo. */
  pending: number
  /**
   * Cuanto valen las boletas de cada estado. Suma EXACTAMENTE `totalSold`, que
   * es lo que permite que la seccion «Cobranza» y el grafico cuadren entre si.
   */
  saleValue: { unpaid: number; partial: number; paid: number }
}

const clamp = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0)

export function buildCollectionBreakdown(
  totals: SellerMoneyTotals,
  partial: PartialTicketTotals,
): CollectionBreakdown {
  const totalSold = clamp(totals.totalSold)
  const collectedOnPartial = Math.min(clamp(partial.paidAmount), clamp(totals.totalCollected))
  const collectedOnPaid = clamp(totals.totalCollected - collectedOnPartial)
  const partialSale = Math.min(clamp(partial.salePrice), totalSold)

  return {
    totalSold,
    collectedOnPaid,
    collectedOnPartial,
    pending: clamp(totals.pendingAmount),
    saleValue: {
      // Una boleta pagada vale lo que se cobro de ella, por definicion.
      paid: collectedOnPaid,
      partial: partialSale,
      unpaid: clamp(totalSold - partialSale - collectedOnPaid),
    },
  }
}

/**
 * Porcentaje entero de una parte sobre un total, acotado a [0, 100].
 *
 * Un total de cero devuelve 0: es la unica respuesta que no produce NaN,
 * Infinity ni un grafico roto (encargo, seccion «Regla matematica del
 * grafico»).
 */
export function percentageOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((part / total) * 100)))
}
