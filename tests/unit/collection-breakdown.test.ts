import { describe, expect, it } from 'vitest'

import { buildCollectionBreakdown, percentageOf } from '@/features/dashboard/collection-breakdown'

/**
 * Reparto del dinero por estado de pago (D-112, D-171).
 *
 * La propiedad que sostiene la seccion «Estado de cobro» del panel es una
 * sola, y por eso se comprueba en casi todos los casos:
 *
 *   cobrado de las pagadas + abonado de las que deben + lo que falta = vendido
 *
 * Si esa igualdad se rompe, el resumen del dinero deja de cuadrar con los
 * grupos que tiene debajo y la pantalla se contradice consigo misma.
 */

function esperarQueCuadre(breakdown: ReturnType<typeof buildCollectionBreakdown>) {
  expect(breakdown.collectedOnPaid + breakdown.collectedOnPartial + breakdown.pending).toBe(
    breakdown.totalSold,
  )
  expect(breakdown.saleValue.unpaid + breakdown.saleValue.partial + breakdown.saleValue.paid).toBe(
    breakdown.totalSold,
  )
}

describe('buildCollectionBreakdown', () => {
  it('vendedor sin ventas: todo en cero y nada negativo', () => {
    const breakdown = buildCollectionBreakdown(
      { totalSold: 0, totalCollected: 0, pendingAmount: 0 },
      { salePrice: 0, paidAmount: 0 },
    )

    expect(breakdown).toEqual({
      totalSold: 0,
      collectedOnPaid: 0,
      collectedOnPartial: 0,
      pending: 0,
      saleValue: { unpaid: 0, partial: 0, paid: 0 },
      pendingBy: { unpaid: 0, partial: 0 },
    })
    esperarQueCuadre(breakdown)
  })

  it('todo sin pagar: el valor entero es de las boletas sin pagar', () => {
    const breakdown = buildCollectionBreakdown(
      { totalSold: 600_000, totalCollected: 0, pendingAmount: 600_000 },
      { salePrice: 0, paidAmount: 0 },
    )

    expect(breakdown.collectedOnPaid).toBe(0)
    expect(breakdown.collectedOnPartial).toBe(0)
    expect(breakdown.pending).toBe(600_000)
    expect(breakdown.saleValue).toEqual({ unpaid: 600_000, partial: 0, paid: 0 })
    esperarQueCuadre(breakdown)
  })

  it('todo pagado: no queda nada por cobrar', () => {
    const breakdown = buildCollectionBreakdown(
      { totalSold: 360_000, totalCollected: 360_000, pendingAmount: 0 },
      { salePrice: 0, paidAmount: 0 },
    )

    expect(breakdown.collectedOnPaid).toBe(360_000)
    expect(breakdown.saleValue).toEqual({ unpaid: 0, partial: 0, paid: 360_000 })
    esperarQueCuadre(breakdown)
  })

  it('solo abonos: lo recibido es de boletas que todavia deben', () => {
    // Dos boletas de $120.000 con $50.000 abonados entre las dos.
    const breakdown = buildCollectionBreakdown(
      { totalSold: 240_000, totalCollected: 50_000, pendingAmount: 190_000 },
      { salePrice: 240_000, paidAmount: 50_000 },
    )

    expect(breakdown.collectedOnPaid).toBe(0)
    expect(breakdown.collectedOnPartial).toBe(50_000)
    expect(breakdown.saleValue).toEqual({ unpaid: 0, partial: 240_000, paid: 0 })
    esperarQueCuadre(breakdown)
  })

  it('los tres estados a la vez: cada peso cae en un solo sitio', () => {
    // 5 boletas de $120.000 = $600.000. Una pagada ($120.000), dos abonadas
    // ($240.000 de valor con $90.000 recibidos) y dos sin pagar ($240.000).
    const breakdown = buildCollectionBreakdown(
      { totalSold: 600_000, totalCollected: 210_000, pendingAmount: 390_000 },
      { salePrice: 240_000, paidAmount: 90_000 },
    )

    expect(breakdown.collectedOnPaid).toBe(120_000)
    expect(breakdown.collectedOnPartial).toBe(90_000)
    expect(breakdown.pending).toBe(390_000)
    expect(breakdown.saleValue).toEqual({
      unpaid: 240_000,
      partial: 240_000,
      paid: 120_000,
    })
    esperarQueCuadre(breakdown)
  })

  it('boletas rebajadas: el reparto sale de los importes, no del precio de la rifa', () => {
    // Una boleta rebajada a $80.000 y cobrada, otra de $120.000 sin pagar
    // (D-099: `sale_price` es lo que debe el cliente).
    const breakdown = buildCollectionBreakdown(
      { totalSold: 200_000, totalCollected: 80_000, pendingAmount: 120_000 },
      { salePrice: 0, paidAmount: 0 },
    )

    expect(breakdown.saleValue).toEqual({ unpaid: 120_000, partial: 0, paid: 80_000 })
    esperarQueCuadre(breakdown)
  })

  it('un dato incoherente no produce cifras negativas', () => {
    // Recaudado mayor que lo vendido: la base de datos lo impide, la pantalla
    // no puede romperse si apareciera.
    const breakdown = buildCollectionBreakdown(
      { totalSold: 100_000, totalCollected: 150_000, pendingAmount: -50_000 },
      { salePrice: 500_000, paidAmount: 500_000 },
    )

    expect(breakdown.pending).toBe(0)
    expect(breakdown.collectedOnPartial).toBeGreaterThanOrEqual(0)
    expect(breakdown.saleValue.unpaid).toBe(0)
    expect(breakdown.saleValue.partial).toBeLessThanOrEqual(breakdown.totalSold)
  })

  it('sin el detalle de las abonadas, lo recaudado se atribuye entero a las pagadas', () => {
    // Es lo que hace la pantalla cuando no pudo leer las boletas abonadas: el
    // total sigue siendo cierto, y por eso el grafico pasa a dos partes.
    const breakdown = buildCollectionBreakdown(
      { totalSold: 600_000, totalCollected: 210_000, pendingAmount: 390_000 },
      { salePrice: 0, paidAmount: 0 },
    )

    expect(breakdown.collectedOnPaid + breakdown.collectedOnPartial).toBe(210_000)
    esperarQueCuadre(breakdown)
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

/**
 * El reparto de lo que FALTA por cobrar (D-171).
 *
 * La seccion «Estado de cobro» escribe esta igualdad a la vista del vendedor
 * —«$44.760.000 + $8.700.000 = $53.460.000»—, asi que no puede depender de que
 * dos restas independientes coincidan: las dos partes salen del pendiente
 * total, que es la cifra que suma `v_seller_summary` en SQL.
 */
describe('buildCollectionBreakdown · pendingBy', () => {
  function esperarQueSumeElPendiente(breakdown: ReturnType<typeof buildCollectionBreakdown>) {
    expect(breakdown.pendingBy.unpaid + breakdown.pendingBy.partial).toBe(breakdown.pending)
    expect(breakdown.pendingBy.unpaid).toBeGreaterThanOrEqual(0)
    expect(breakdown.pendingBy.partial).toBeGreaterThanOrEqual(0)
  }

  it('los datos de referencia del panel: cada cifra de la seccion cuadra', () => {
    // 855 boletas, 714 vendidas: 373 sin pagos, 131 con abonos y 210 pagadas.
    const breakdown = buildCollectionBreakdown(
      { totalSold: 85_600_000, totalCollected: 32_140_000, pendingAmount: 53_460_000 },
      { salePrice: 15_640_000, paidAmount: 6_940_000 },
    )

    // Resumen del dinero.
    expect(breakdown.totalSold).toBe(85_600_000)
    expect(breakdown.collectedOnPaid + breakdown.collectedOnPartial).toBe(32_140_000)
    expect(breakdown.pending).toBe(53_460_000)
    expect(percentageOf(32_140_000, 85_600_000)).toBe(38)

    // Grupo «Falta cobrar» y sus dos columnas.
    expect(breakdown.pendingBy.unpaid).toBe(44_760_000)
    expect(breakdown.pendingBy.partial).toBe(8_700_000)
    expect(breakdown.collectedOnPartial).toBe(6_940_000)

    // Grupo «Pagadas».
    expect(breakdown.collectedOnPaid).toBe(25_200_000)

    esperarQueCuadre(breakdown)
    esperarQueSumeElPendiente(breakdown)
  })

  it('con datos coherentes, lo que deben las boletas sin pagos es su precio entero', () => {
    const breakdown = buildCollectionBreakdown(
      { totalSold: 600_000, totalCollected: 210_000, pendingAmount: 390_000 },
      { salePrice: 240_000, paidAmount: 90_000 },
    )

    expect(breakdown.pendingBy.unpaid).toBe(breakdown.saleValue.unpaid)
    expect(breakdown.pendingBy.partial).toBe(150_000)
    esperarQueSumeElPendiente(breakdown)
  })

  it('sin boletas a medias, todo lo pendiente es de las que no han pagado nada', () => {
    const breakdown = buildCollectionBreakdown(
      { totalSold: 600_000, totalCollected: 120_000, pendingAmount: 480_000 },
      { salePrice: 0, paidAmount: 0 },
    )

    expect(breakdown.pendingBy).toEqual({ unpaid: 480_000, partial: 0 })
    esperarQueSumeElPendiente(breakdown)
  })

  it('todo cobrado: no queda nada que repartir', () => {
    const breakdown = buildCollectionBreakdown(
      { totalSold: 360_000, totalCollected: 360_000, pendingAmount: 0 },
      { salePrice: 0, paidAmount: 0 },
    )

    expect(breakdown.pendingBy).toEqual({ unpaid: 0, partial: 0 })
    esperarQueSumeElPendiente(breakdown)
  })

  it('un dato incoherente no rompe la igualdad ni produce cifras negativas', () => {
    // Boletas a medias que suman mas de lo vendido: la base lo impide, la
    // pantalla no puede escribir una suma que no cuadre si apareciera.
    const breakdown = buildCollectionBreakdown(
      { totalSold: 100_000, totalCollected: 10_000, pendingAmount: 90_000 },
      { salePrice: 500_000, paidAmount: 5_000 },
    )

    esperarQueSumeElPendiente(breakdown)

    // Y al reves: recaudado mayor que lo vendido deja el pendiente en cero.
    const roto = buildCollectionBreakdown(
      { totalSold: 100_000, totalCollected: 150_000, pendingAmount: -50_000 },
      { salePrice: 500_000, paidAmount: 500_000 },
    )

    expect(roto.pendingBy).toEqual({ unpaid: 0, partial: 0 })
    esperarQueSumeElPendiente(roto)
  })
})
