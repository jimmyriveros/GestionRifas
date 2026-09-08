import { describe, expect, it } from 'vitest'

import { buildCollectionBreakdown, percentageOf } from '@/features/dashboard/collection-breakdown'

/**
 * Reparto del dinero por estado de pago (D-112, D-171, D-172).
 *
 * LA PROPIEDAD QUE SE PRUEBA no es «que la ecuación cuadre»: es que el reparto
 * SEA el que garantizan las restricciones de PostgreSQL. Sobre las boletas
 * vendidas, `payment_status` es una columna generada y `paid_amount` está
 * acotado a `[0, sale_price]`, de modo que
 *
 *   pending = Σ_sin-pagos precio + (precio de las abonadas − lo abonado)
 *
 * es una identidad, no un ajuste. Cuando los datos no la cumplen —porque las dos
 * consultas son dos fotos distintas— no se reparte nada: se conserva el total
 * autoritativo y el detalle desaparece.
 */

/** Con datos coherentes, cada grupo vale lo que dice su definición. */
function esperarQueElRepartoSeaExacto(
  breakdown: ReturnType<typeof buildCollectionBreakdown>,
  esperado: { sinPagos: number; conAbonos: number; abonado: number; cobradoDePagadas: number },
) {
  const detail = breakdown.detail
  expect(detail, 'no se pudo repartir el dinero').not.toBeNull()
  if (!detail) return

  expect(detail.pendingBy.unpaid).toBe(esperado.sinPagos)
  expect(detail.pendingBy.partial).toBe(esperado.conAbonos)
  expect(detail.collectedOnPartial).toBe(esperado.abonado)
  expect(detail.collectedOnPaid).toBe(esperado.cobradoDePagadas)

  // Las tres igualdades que la sección enseña.
  expect(detail.pendingBy.unpaid + detail.pendingBy.partial).toBe(breakdown.pending)
  expect(detail.collectedOnPaid + detail.collectedOnPartial).toBe(breakdown.collected)
  expect(breakdown.collected + breakdown.pending).toBe(breakdown.totalSold)
  expect(breakdown.inconsistent).toBe(false)
}

describe('buildCollectionBreakdown · datos coherentes', () => {
  it('vendedor sin ventas: todo en cero y nada negativo', () => {
    const breakdown = buildCollectionBreakdown(
      { totalSold: 0, totalCollected: 0, pendingAmount: 0 },
      { salePrice: 0, paidAmount: 0 },
    )

    expect(breakdown).toEqual({
      totalSold: 0,
      collected: 0,
      pending: 0,
      detail: { collectedOnPaid: 0, collectedOnPartial: 0, pendingBy: { unpaid: 0, partial: 0 } },
      inconsistent: false,
    })
  })

  it('solo boletas sin pagos: lo que deben es su precio entero', () => {
    // 5 boletas de $120.000, ninguna con un peso encima.
    const breakdown = buildCollectionBreakdown(
      { totalSold: 600_000, totalCollected: 0, pendingAmount: 600_000 },
      { salePrice: 0, paidAmount: 0 },
    )

    esperarQueElRepartoSeaExacto(breakdown, {
      sinPagos: 600_000,
      conAbonos: 0,
      abonado: 0,
      cobradoDePagadas: 0,
    })
  })

  it('solo boletas con abonos: lo que todavía deben es su precio menos lo abonado', () => {
    // Dos boletas de $120.000 con $50.000 abonados entre las dos.
    const breakdown = buildCollectionBreakdown(
      { totalSold: 240_000, totalCollected: 50_000, pendingAmount: 190_000 },
      { salePrice: 240_000, paidAmount: 50_000 },
    )

    esperarQueElRepartoSeaExacto(breakdown, {
      sinPagos: 0,
      conAbonos: 190_000,
      abonado: 50_000,
      cobradoDePagadas: 0,
    })
  })

  it('solo boletas pagadas: no queda nada por cobrar y todo lo cobrado es de ellas', () => {
    const breakdown = buildCollectionBreakdown(
      { totalSold: 360_000, totalCollected: 360_000, pendingAmount: 0 },
      { salePrice: 0, paidAmount: 0 },
    )

    esperarQueElRepartoSeaExacto(breakdown, {
      sinPagos: 0,
      conAbonos: 0,
      abonado: 0,
      cobradoDePagadas: 360_000,
    })
  })

  it('los tres estados a la vez: cada peso cae en un solo sitio', () => {
    // 5 boletas de $120.000 = $600.000. Una pagada ($120.000), dos abonadas
    // ($240.000 de valor con $90.000 recibidos) y dos sin pagar ($240.000).
    const breakdown = buildCollectionBreakdown(
      { totalSold: 600_000, totalCollected: 210_000, pendingAmount: 390_000 },
      { salePrice: 240_000, paidAmount: 90_000 },
    )

    esperarQueElRepartoSeaExacto(breakdown, {
      sinPagos: 240_000,
      conAbonos: 150_000,
      abonado: 90_000,
      cobradoDePagadas: 120_000,
    })
  })

  it('boletas rebajadas: el reparto sale de los importes, no del precio de la rifa', () => {
    // Una boleta rebajada a $80.000 y cobrada, otra de $120.000 sin pagar
    // (D-099: `sale_price` es lo que debe el cliente).
    const breakdown = buildCollectionBreakdown(
      { totalSold: 200_000, totalCollected: 80_000, pendingAmount: 120_000 },
      { salePrice: 0, paidAmount: 0 },
    )

    esperarQueElRepartoSeaExacto(breakdown, {
      sinPagos: 120_000,
      conAbonos: 0,
      abonado: 0,
      cobradoDePagadas: 80_000,
    })
  })

  it('los datos de referencia del panel: cada cifra de la sección cuadra', () => {
    // 714 vendidas: 373 sin pagos, 131 con abonos y 210 pagadas.
    const breakdown = buildCollectionBreakdown(
      { totalSold: 85_600_000, totalCollected: 32_140_000, pendingAmount: 53_460_000 },
      { salePrice: 15_640_000, paidAmount: 6_940_000 },
    )

    esperarQueElRepartoSeaExacto(breakdown, {
      sinPagos: 44_760_000,
      conAbonos: 8_700_000,
      abonado: 6_940_000,
      cobradoDePagadas: 25_200_000,
    })
    expect(percentageOf(breakdown.collected, breakdown.totalSold)).toBe(38)
  })
})

describe('buildCollectionBreakdown · sin el detalle de las abonadas', () => {
  it('conserva los totales y NO inventa un reparto', () => {
    // Es lo que llega cuando había demasiadas boletas abonadas para leerlas una
    // a una (I-011).
    const breakdown = buildCollectionBreakdown(
      { totalSold: 600_000, totalCollected: 210_000, pendingAmount: 390_000 },
      null,
    )

    expect(breakdown.totalSold).toBe(600_000)
    expect(breakdown.collected).toBe(210_000)
    expect(breakdown.pending).toBe(390_000)
    expect(breakdown.detail).toBeNull()
    // No haber podido leerlo no es una anomalía: no se registra como tal.
    expect(breakdown.inconsistent).toBe(false)
  })
})

describe('buildCollectionBreakdown · datos incoherentes', () => {
  /** Ante cualquier incoherencia: total autoritativo, cero reparto, y se avisa. */
  function esperarQueSeCalle(breakdown: ReturnType<typeof buildCollectionBreakdown>) {
    expect(breakdown.detail).toBeNull()
    expect(breakdown.inconsistent).toBe(true)
  }

  it('lo abonado supera el precio de las boletas abonadas', () => {
    esperarQueSeCalle(
      buildCollectionBreakdown(
        { totalSold: 600_000, totalCollected: 210_000, pendingAmount: 390_000 },
        { salePrice: 100_000, paidAmount: 150_000 },
      ),
    )
  })

  it('las boletas abonadas valen más que todo lo vendido', () => {
    esperarQueSeCalle(
      buildCollectionBreakdown(
        { totalSold: 100_000, totalCollected: 10_000, pendingAmount: 90_000 },
        { salePrice: 500_000, paidAmount: 5_000 },
      ),
    )
  })

  it('lo que falta de las abonadas se come todo el pendiente y lo pasa', () => {
    // Sin la comprobación, «Sin pagos» saldría negativo o acotado a cero, y la
    // ecuación escrita en pantalla sería falsa.
    esperarQueSeCalle(
      buildCollectionBreakdown(
        { totalSold: 600_000, totalCollected: 500_000, pendingAmount: 100_000 },
        { salePrice: 400_000, paidAmount: 100_000 },
      ),
    )
  })

  it('lo abonado supera todo lo recaudado', () => {
    esperarQueSeCalle(
      buildCollectionBreakdown(
        { totalSold: 600_000, totalCollected: 50_000, pendingAmount: 550_000 },
        { salePrice: 300_000, paidAmount: 200_000 },
      ),
    )
  })

  it('los tres totales no cuadran entre sí', () => {
    esperarQueSeCalle(
      buildCollectionBreakdown(
        { totalSold: 600_000, totalCollected: 210_000, pendingAmount: 999_999 },
        { salePrice: 0, paidAmount: 0 },
      ),
    )
  })

  it('recaudado mayor que lo vendido: ni cifras negativas ni reparto', () => {
    const breakdown = buildCollectionBreakdown(
      { totalSold: 100_000, totalCollected: 150_000, pendingAmount: -50_000 },
      { salePrice: 500_000, paidAmount: 500_000 },
    )

    esperarQueSeCalle(breakdown)
    expect(breakdown.pending).toBe(0)
    expect(breakdown.totalSold).toBeGreaterThanOrEqual(0)
    expect(breakdown.collected).toBeGreaterThanOrEqual(0)
  })

  it('un dato que no es un número no rompe nada', () => {
    const breakdown = buildCollectionBreakdown(
      { totalSold: Number.NaN, totalCollected: 0, pendingAmount: 0 },
      { salePrice: 0, paidAmount: 0 },
    )

    esperarQueSeCalle(breakdown)
    expect(breakdown.totalSold).toBe(0)
  })

  it('NUNCA se fabrica una ecuación que cuadre a la vista', () => {
    // El punto entero de D-172: con datos torcidos, antes se acotaba el reparto
    // con `Math.min` y la pantalla escribía una suma correcta sobre cifras que
    // no lo eran. Ahora no hay ninguna cifra que escribir.
    const torcidos = [
      { totalSold: 600_000, totalCollected: 500_000, pendingAmount: 100_000 },
      { totalSold: 100_000, totalCollected: 150_000, pendingAmount: -50_000 },
      { totalSold: 300_000, totalCollected: 100_000, pendingAmount: 200_000 },
    ]
    const partial = { salePrice: 900_000, paidAmount: 10_000 }

    for (const totals of torcidos) {
      const breakdown = buildCollectionBreakdown(totals, partial)
      expect(breakdown.detail, JSON.stringify(totals)).toBeNull()
    }
  })
})

describe('percentageOf', () => {
  it('reparte sobre el total y redondea a entero', () => {
    expect(percentageOf(210_000, 600_000)).toBe(35)
    expect(percentageOf(1, 3)).toBe(33)
  })

  it('total en cero: devuelve 0, nunca NaN ni Infinity', () => {
    expect(percentageOf(0, 0)).toBe(0)
    expect(percentageOf(500, 0)).toBe(0)
  })

  it('se mantiene entre 0 y 100 aunque el dato venga mal', () => {
    expect(percentageOf(900, 600)).toBe(100)
    expect(percentageOf(-100, 600)).toBe(0)
    expect(percentageOf(Number.NaN, 600)).toBe(0)
  })
})
