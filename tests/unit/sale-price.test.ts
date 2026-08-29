import { describe, expect, it } from 'vitest'

import { checkSalePrice } from '@/features/tickets/sale-price'
import { updateTicketSalePriceSchema } from '@/features/tickets/schemas'

const UUID_A = '11111111-1111-4111-8111-111111111111'

const range = { officialPrice: 120_000, minSalePrice: 60_000, paidAmount: 0 }

describe('checkSalePrice (BR-P11, BR-P13)', () => {
  it('acepta un precio entre el minimo y el oficial', () => {
    expect(checkSalePrice(100_000, range)).toBeNull()
    expect(checkSalePrice(120_000, range)).toBeNull()
    expect(checkSalePrice(60_000, range)).toBeNull()
  })

  it('rechaza vacio, cero y negativo', () => {
    expect(checkSalePrice(null, range)).toMatch(/Escribe el precio/)
    expect(checkSalePrice(0, range)).toMatch(/Escribe el precio/)
    expect(checkSalePrice(-1, range)).toMatch(/Escribe el precio/)
  })

  it('rechaza un recargo sobre el oficial', () => {
    expect(checkSalePrice(120_001, range)).toMatch(/más barato, no más caro/)
  })

  it('rechaza una rebaja mayor de la que se puede asumir', () => {
    expect(checkSalePrice(59_999, range)).toMatch(/precio más bajo/)
  })

  it('rechaza un precio menor que lo ya abonado, aunque quepa en la rebaja', () => {
    expect(
      checkSalePrice(80_000, { ...range, paidAmount: 100_000 }),
    ).toMatch(/menor que el total abonado/)
  })
})

describe('updateTicketSalePriceSchema (BR-P13)', () => {
  const base = {
    ticketId: UUID_A,
    salePrice: 100_000,
    expectedSalePrice: 120_000,
  }

  it('acepta un valor entero positivo', () => {
    expect(updateTicketSalePriceSchema.safeParse(base).success).toBe(true)
  })

  it('rechaza cero, negativo, vacio y decimal (BR-P02)', () => {
    expect(updateTicketSalePriceSchema.safeParse({ ...base, salePrice: 0 }).success).toBe(false)
    expect(updateTicketSalePriceSchema.safeParse({ ...base, salePrice: -1 }).success).toBe(false)
    expect(updateTicketSalePriceSchema.safeParse({ ...base, salePrice: 10.5 }).success).toBe(false)
    expect(
      updateTicketSalePriceSchema.safeParse({ ...base, salePrice: undefined }).success,
    ).toBe(false)
  })

  it('exige el identificador de la boleta', () => {
    expect(
      updateTicketSalePriceSchema.safeParse({ ...base, ticketId: 'no-es-uuid' }).success,
    ).toBe(false)
  })
})
