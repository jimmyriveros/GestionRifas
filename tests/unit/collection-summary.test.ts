import { describe, expect, it } from 'vitest'

import { calculateCollectionSummary } from '@/features/dashboard/collection-summary'

describe('calculateCollectionSummary', () => {
  it('sin ventas: estado vacio, sin porcentaje ni pendiente', () => {
    const result = calculateCollectionSummary({
      totalSold: 0,
      totalCollected: 0,
      pendingAmount: 0,
    })
    expect(result).toEqual({ hasSales: false, percentage: 0, safePendingAmount: 0 })
  })

  it('ventas sin ningun recaudo: 0% y todo pendiente', () => {
    const result = calculateCollectionSummary({
      totalSold: 500_000,
      totalCollected: 0,
      pendingAmount: 500_000,
    })
    expect(result).toEqual({ hasSales: true, percentage: 0, safePendingAmount: 500_000 })
  })

  it('abonos parciales: redondea el porcentaje pero no lo que se muestra en dinero', () => {
    const result = calculateCollectionSummary({
      totalSold: 600_000,
      totalCollected: 290_000,
      pendingAmount: 310_000,
    })
    expect(result.hasSales).toBe(true)
    expect(result.percentage).toBe(48) // 48.33... redondeado
    expect(result.safePendingAmount).toBe(310_000)
  })

  it('todo pagado: 100% y nada pendiente', () => {
    const result = calculateCollectionSummary({
      totalSold: 600_000,
      totalCollected: 600_000,
      pendingAmount: 0,
    })
    expect(result).toEqual({ hasSales: true, percentage: 100, safePendingAmount: 0 })
  })

  it('monto grande: no rompe el calculo ni el redondeo', () => {
    const result = calculateCollectionSummary({
      totalSold: 120_500_000,
      totalCollected: 60_250_000,
      pendingAmount: 60_250_000,
    })
    expect(result.percentage).toBe(50)
  })

  it('inconsistencia (recaudado > vendido): la barra nunca pasa de 100 ni el pendiente baja de 0', () => {
    const result = calculateCollectionSummary({
      totalSold: 100_000,
      totalCollected: 150_000,
      pendingAmount: -50_000,
    })
    expect(result.percentage).toBe(100)
    expect(result.safePendingAmount).toBe(0)
  })
})
