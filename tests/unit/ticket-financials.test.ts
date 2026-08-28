import { describe, expect, it } from 'vitest'

import { ticketFinancials } from '@/features/tickets/financials'

/**
 * La cuenta que comparten «Mis boletas», «Boletas de este cliente» y el detalle
 * de la boleta. Se prueba aqui, una sola vez, porque una sola vez se escribe:
 * si las tres pantallas coinciden es porque llaman a esta funcion, no porque
 * tres implementaciones distintas den la casualidad de coincidir.
 *
 * Los estados de pago (`unpaid` / `partial` / `paid`) los calcula la base de
 * datos y llegan en la fila; aqui se comprueba que las CIFRAS que acompañan a
 * cada uno son las que corresponden.
 */

const VENDIDA = { inventoryStatus: 'assigned', salePrice: 120_000 } as const

describe('ticketFinancials', () => {
  it('boleta pagada: nada pendiente y el 100%', () => {
    expect(ticketFinancials({ ...VENDIDA, paidAmount: 120_000 })).toEqual({
      sold: true,
      price: 120_000,
      paidAmount: 120_000,
      pendingAmount: 0,
      percentage: 100,
    })
  })

  it('boleta abonada: lo abonado, lo que falta y la proporcion', () => {
    expect(ticketFinancials({ ...VENDIDA, paidAmount: 50_000 })).toEqual({
      sold: true,
      price: 120_000,
      paidAmount: 50_000,
      pendingAmount: 70_000,
      percentage: 42,
    })
  })

  it('boleta sin pagar: todo el precio pendiente y el 0%', () => {
    expect(ticketFinancials({ ...VENDIDA, paidAmount: 0 })).toEqual({
      sold: true,
      price: 120_000,
      paidAmount: 0,
      pendingAmount: 120_000,
      percentage: 0,
    })
  })

  it('varios abonos llegan ya sumados en `paid_amount`: la funcion no los suma', () => {
    // Es lo que hace la base de datos al registrar cada pago (BR-F08). Un pago
    // anulado deja de contar alli, asi que aqui no hay nada que descontar: si
    // se anula el abono de $70.000 de una boleta con $90.000 abonados, la fila
    // vuelve a llegar con 20.000.
    expect(ticketFinancials({ ...VENDIDA, paidAmount: 90_000 }).pendingAmount).toBe(30_000)
    expect(ticketFinancials({ ...VENDIDA, paidAmount: 20_000 }).pendingAmount).toBe(100_000)
  })

  it('el precio es el de LA BOLETA, no una cifra fija (BR-P07)', () => {
    const rebajada = ticketFinancials({
      inventoryStatus: 'assigned',
      salePrice: 90_000,
      paidAmount: 45_000,
    })
    expect(rebajada).toMatchObject({ price: 90_000, pendingAmount: 45_000, percentage: 50 })
  })

  it('un precio de cero no divide por cero: 0% y sin saldo negativo', () => {
    expect(ticketFinancials({ inventoryStatus: 'assigned', salePrice: 0, paidAmount: 0 })).toEqual({
      sold: true,
      price: 0,
      paidAmount: 0,
      pendingAmount: 0,
      percentage: 0,
    })
  })

  it('un abono mayor que el precio se acota: ni mas del 100% ni saldo negativo', () => {
    // La base impide el sobrepago (BR-F05); esto protege a la interfaz de un
    // dato historico que lo trajera, para que no pinte «-$30.000» ni el 125%.
    expect(ticketFinancials({ ...VENDIDA, paidAmount: 150_000 })).toMatchObject({
      pendingAmount: 0,
      percentage: 100,
    })
  })

  it('un abono negativo tampoco se pinta', () => {
    expect(ticketFinancials({ ...VENDIDA, paidAmount: -1 })).toMatchObject({
      paidAmount: 0,
      pendingAmount: 120_000,
      percentage: 0,
    })
  })

  it('boleta sin vender: no debe nada y la pantalla escribe «—»', () => {
    for (const inventoryStatus of ['draft', 'pending_approval', 'available'] as const) {
      expect(ticketFinancials({ inventoryStatus, salePrice: null, paidAmount: 0 })).toEqual({
        sold: false,
        price: 0,
        paidAmount: 0,
        pendingAmount: 0,
        percentage: 0,
      })
    }
  })

  it('boleta anulada: conserva su historial pero deja de deber', () => {
    expect(
      ticketFinancials({ inventoryStatus: 'cancelled', salePrice: 120_000, paidAmount: 50_000 }),
    ).toMatchObject({ sold: false, pendingAmount: 0 })
  })

  it('el porcentaje es entero y se redondea, para que la barra y el texto coincidan', () => {
    expect(ticketFinancials({ ...VENDIDA, paidAmount: 1 }).percentage).toBe(0)
    expect(ticketFinancials({ ...VENDIDA, paidAmount: 70_000 }).percentage).toBe(58)
    expect(ticketFinancials({ ...VENDIDA, paidAmount: 119_999 }).percentage).toBe(100)
  })
})
