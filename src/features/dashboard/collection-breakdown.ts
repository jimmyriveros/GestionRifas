/**
 * Reparto del dinero de un vendedor por estado de pago (D-112, D-171, D-172).
 *
 * DE DONDE SALEN ESTAS CIFRAS Y POR QUE NO HAY UNA CONSULTA NUEVA
 *
 * `v_seller_summary` ya suma en SQL lo vendido, lo recaudado y el saldo, pero
 * NO los separa por estado de pago: no existe «cuanto dinero corresponde a las
 * boletas pagadas». Anadir esa columna significaria una migracion, y una
 * migracion hay que promoverla al proyecto real ANTES de desplegar el codigo o
 * el panel se cae en produccion.
 *
 * No hace falta. Basta con UNA cifra mas —el precio y lo abonado de las boletas
 * que aun deben, que lee `getPartialTicketTotals`— y el resto se deduce.
 * Las boletas «Abonadas» son ademas las pocas: una boleta solo queda a medias
 * mientras alguien va pagandola a plazos, asi que leerlas fila a fila es barato.
 *
 * Modulo puro: sin `server-only`, sin consultas y con los casos limite
 * —vendedor sin ventas, division por cero, un dato incoherente— cubiertos por
 * pruebas unitarias.
 *
 * ---------------------------------------------------------------------------
 * LA DERIVACION, Y POR QUE ES EXACTA (D-172)
 * ---------------------------------------------------------------------------
 *
 * NO es «repartir una diferencia para que la ecuacion cuadre». Es una igualdad
 * que la base de datos garantiza. Sobre el conjunto A de las boletas del
 * vendedor con `inventory_status = 'assigned'`:
 *
 *   · `tickets_assigned_requires_sale` (0002) obliga a que toda boleta de A
 *     tenga `sale_price` no nulo;
 *   · `tickets_paid_amount_range` (0002, BR-F12) obliga a
 *     `0 <= paid_amount <= sale_price`, asi que el sobrepago es imposible;
 *   · `payment_status` es una columna GENERADA (0002, BR-F07) y, con
 *     `sale_price` no nulo, parte A en tres bloques sin solape ni hueco:
 *         unpaid  <=> paid_amount = 0
 *         partial <=> 0 < paid_amount < sale_price
 *         paid    <=> paid_amount = sale_price  (por el CHECK, «no menor» es «igual»)
 *
 * Y `v_seller_summary.pending_amount` es `sum(sale_price - paid_amount)` sobre
 * ese mismo A. Desarrollando por bloques:
 *
 *   pending = Σ_unpaid (sale_price - 0)
 *           + Σ_partial (sale_price - paid_amount)
 *           + Σ_paid    (sale_price - sale_price)
 *           = Σ_unpaid sale_price + (precio de las abonadas - lo abonado) + 0
 *
 * De donde, EXACTAMENTE:
 *
 *   lo que deben las boletas sin pagos = pending - (precio abonadas - abonado)
 *
 * y eso es su precio de venta entero, que es justo lo que se pinta. No hay
 * termino de ajuste, ni redondeo, ni aproximacion: son pesos enteros.
 *
 * ---------------------------------------------------------------------------
 * LO QUE LA BASE NO GARANTIZA, Y POR ESO SE COMPRUEBA
 * ---------------------------------------------------------------------------
 *
 * Las cifras llegan de DOS consultas distintas —`v_seller_summary` y
 * `v_ticket_balances`—, tomadas una despues de otra. Entre ellas puede
 * registrarse un abono, y entonces describen dos instantes: la igualdad deja de
 * cumplirse aunque cada dato sea correcto por separado. Por eso `detail` es
 * opcional y se comprueba antes de darlo por bueno.
 *
 * Cuando no cuadra, la pantalla se queda con el total autoritativo de «Falta
 * cobrar» —que sigue siendo cierto— y **no inventa un reparto ni escribe la
 * ecuacion**. Lo mismo cuando el detalle ni siquiera se pudo leer (I-011).
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

/**
 * El dinero repartido por estado de pago.
 *
 * Existe SOLO cuando se pudo leer el detalle de las boletas abonadas y ademas
 * cuadra con los totales. Nunca contiene una cifra deducida a la fuerza.
 */
export type CollectionDetail = {
  /** Dinero recibido de boletas cobradas por completo. */
  collectedOnPaid: number
  /** Dinero recibido de boletas que todavia deben. */
  collectedOnPartial: number
  /**
   * De quien es cada peso de `pending`: lo que deben las boletas de las que no
   * ha entrado nada —su precio de venta entero— y lo que TODAVIA deben las que
   * ya abonaron una parte. Suman `pending` por la igualdad de arriba, no por un
   * ajuste.
   */
  pendingBy: { unpaid: number; partial: number }
}

export type CollectionBreakdown = {
  /** Valor de todas las boletas vendidas. */
  totalSold: number
  /** Todo lo recibido por ellas. Siempre disponible. */
  collected: number
  /** Lo que falta por cobrar. Cifra autoritativa; siempre disponible. */
  pending: number
  /** `null` si el detalle no se pudo leer o no cuadra con los totales. */
  detail: CollectionDetail | null
  /**
   * `true` solo cuando el detalle SE LEYO y no cuadra: eso es una anomalia y
   * quien llama puede registrarla. Un detalle que no se leyo (I-011) no es una
   * anomalia y deja esto en `false`.
   */
  inconsistent: boolean
}

const isMoney = (value: number) => Number.isFinite(value) && value >= 0

export function buildCollectionBreakdown(
  totals: SellerMoneyTotals,
  partial: PartialTicketTotals | null,
): CollectionBreakdown {
  const { totalSold, totalCollected, pendingAmount } = totals

  // Los tres totales llegan de la MISMA fila agregada, asi que su relacion es
  // interna a una sola foto. Si no se cumple, no hay nada fiable que repartir.
  const totalsOk =
    isMoney(totalSold) &&
    isMoney(totalCollected) &&
    isMoney(pendingAmount) &&
    pendingAmount === totalSold - totalCollected

  const base = {
    totalSold: isMoney(totalSold) ? totalSold : 0,
    collected: isMoney(totalCollected) ? totalCollected : 0,
    pending: isMoney(pendingAmount) ? pendingAmount : 0,
  }

  if (partial === null) return { ...base, detail: null, inconsistent: false }

  const { salePrice, paidAmount } = partial

  // Lo que todavia deben las boletas con abonos, SIN acotar: si sale negativo es
  // que los datos no describen el mismo instante, y entonces no se muestra nada
  // en vez de taparlo con un `Math.max`.
  const pendingOnPartial = salePrice - paidAmount
  const pendingOnUnpaid = pendingAmount - pendingOnPartial
  const collectedOnPaid = totalCollected - paidAmount

  const detailOk =
    totalsOk &&
    isMoney(salePrice) &&
    isMoney(paidAmount) &&
    // Las abonadas son un subconjunto de las vendidas: ni su precio ni lo que
    // han pagado pueden pasarse de los totales.
    salePrice <= totalSold &&
    paidAmount <= totalCollected &&
    // Una boleta abonada tiene 0 < pagado < precio, luego la suma tambien.
    pendingOnPartial >= 0 &&
    // Y lo que queda es el precio de las que no han pagado nada: nunca negativo.
    pendingOnUnpaid >= 0 &&
    collectedOnPaid >= 0

  if (!detailOk) return { ...base, detail: null, inconsistent: true }

  return {
    ...base,
    detail: {
      collectedOnPaid,
      collectedOnPartial: paidAmount,
      pendingBy: { unpaid: pendingOnUnpaid, partial: pendingOnPartial },
    },
    inconsistent: false,
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
