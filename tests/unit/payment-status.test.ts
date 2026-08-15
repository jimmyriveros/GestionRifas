import { describe, expect, it } from 'vitest'

import {
  distributeAmount,
  nonZeroAllocations,
  previewPaymentStatus,
  sumAllocations,
  validateAllocations,
  type PayableTicket,
} from '@/features/payments/allocation'
import { createPaymentSchema, voidPaymentSchema } from '@/features/payments/schemas'

/**
 * Logica pura del reparto de abonos y de la previsualizacion del estado de pago
 * (CLAUDE.md 18 y 19, BR-F03, BR-F05, BR-F07, BR-F08, BR-F12).
 *
 * El estado REAL lo calcula la base de datos en una columna generada; estas
 * pruebas cubren la previsualizacion del formulario y el reparto, que si viven
 * en la aplicacion.
 */

const UUID_A = '11111111-2222-4333-8444-555555555551'
const UUID_B = '11111111-2222-4333-8444-555555555552'
const UUID_C = '11111111-2222-4333-8444-555555555553'

function ticket(
  ticketId: string,
  pendingAmount: number,
  daily = '0001',
  weekly = '1001',
): PayableTicket {
  return { ticketId, dailyNumber: daily, weeklyNumber: weekly, pendingAmount }
}

describe('previewPaymentStatus (BR-F07, BR-F08)', () => {
  it('los tres estados para una boleta al precio vigente de $120.000', () => {
    expect(previewPaymentStatus(120_000, 0)).toBe('unpaid')
    expect(previewPaymentStatus(120_000, 1)).toBe('partial')
    expect(previewPaymentStatus(120_000, 50_000)).toBe('partial')
    expect(previewPaymentStatus(120_000, 119_999)).toBe('partial')
    expect(previewPaymentStatus(120_000, 120_000)).toBe('paid')
  })

  /**
   * El caso que motivo la correccion de precio (D-098). Antes, $100.000 era el
   * precio entero y dejaba la boleta Pagada; ahora es un abono al que le faltan
   * $20.000. Que esta linea exista es lo que impide volver atras sin darse
   * cuenta.
   */
  it('CASO CRITICO: $100.000 sobre una boleta de $120.000 es Abonada, no Pagada', () => {
    expect(previewPaymentStatus(120_000, 100_000)).toBe('partial')
    expect(previewPaymentStatus(120_000, 100_000)).not.toBe('paid')
  })

  it('el estado se mide contra el precio de la boleta, no contra una cifra fija', () => {
    // La misma cantidad pagada da un estado distinto segun lo que costo.
    expect(previewPaymentStatus(100_000, 100_000)).toBe('paid')
    expect(previewPaymentStatus(50_000, 50_000)).toBe('paid')
    expect(previewPaymentStatus(120_000, 100_000)).toBe('partial')
  })

  it('una boleta sin vender no tiene estado de pago', () => {
    expect(previewPaymentStatus(null, 0)).toBe('unpaid')
    expect(previewPaymentStatus(null, 50_000)).toBe('unpaid')
  })
})

describe('distributeAmount', () => {
  it('reparte de la primera boleta a la ultima sin pasarse del saldo', () => {
    const tickets = [ticket(UUID_A, 100_000), ticket(UUID_B, 100_000)]
    const result = distributeAmount(150_000, tickets)

    expect(result.get(UUID_A)).toBe(100_000)
    expect(result.get(UUID_B)).toBe(50_000)
  })

  it('cubre exactamente una sola boleta cuando alcanza', () => {
    const tickets = [ticket(UUID_A, 100_000), ticket(UUID_B, 100_000)]
    const result = distributeAmount(40_000, tickets)

    expect(result.get(UUID_A)).toBe(40_000)
    expect(result.get(UUID_B)).toBe(0)
  })

  it('si el total supera la deuda, no inventa un sobrepago', () => {
    const tickets = [ticket(UUID_A, 30_000)]
    const result = distributeAmount(50_000, tickets)

    expect(result.get(UUID_A)).toBe(30_000)
    // El sobrante queda sin repartir: el formulario lo muestra y no deja guardar.
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(30_000)
  })

  it('trabaja solo con enteros: nunca produce decimales', () => {
    const tickets = [ticket(UUID_A, 100_000), ticket(UUID_B, 100_000), ticket(UUID_C, 100_000)]
    const result = distributeAmount(100_000, tickets)

    for (const value of result.values()) {
      expect(Number.isInteger(value)).toBe(true)
    }
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(100_000)
  })

  it('un total de cero deja todas las filas en cero', () => {
    const result = distributeAmount(0, [ticket(UUID_A, 100_000)])
    expect(result.get(UUID_A)).toBe(0)
  })
})

describe('validateAllocations: cuadre exacto (BR-F05)', () => {
  const tickets = [ticket(UUID_A, 100_000, '0001', '1001'), ticket(UUID_B, 50_000, '0002', '1002')]

  it('acepta un reparto que cuadra', () => {
    const result = validateAllocations(
      120_000,
      [
        { ticketId: UUID_A, amount: 100_000 },
        { ticketId: UUID_B, amount: 20_000 },
      ],
      tickets,
    )
    expect(result.valid).toBe(true)
    expect(result.difference).toBe(0)
    expect(result.error).toBeNull()
  })

  it('rechaza cuando falta por repartir', () => {
    const result = validateAllocations(100_000, [{ ticketId: UUID_A, amount: 60_000 }], tickets)
    expect(result.valid).toBe(false)
    expect(result.difference).toBe(40_000)
    expect(result.error).toContain('Faltan por repartir')
  })

  it('rechaza cuando se reparte de mas', () => {
    const result = validateAllocations(
      50_000,
      [
        { ticketId: UUID_A, amount: 40_000 },
        { ticketId: UUID_B, amount: 30_000 },
      ],
      tickets,
    )
    expect(result.valid).toBe(false)
    expect(result.error).toContain('de más')
  })

  it('rechaza un total de cero o negativo (BR-F03)', () => {
    expect(validateAllocations(0, [{ ticketId: UUID_A, amount: 0 }], tickets).valid).toBe(false)
    expect(validateAllocations(-100, [{ ticketId: UUID_A, amount: -100 }], tickets).valid).toBe(
      false,
    )
  })

  it('rechaza un reparto sin ninguna boleta con valor', () => {
    const result = validateAllocations(
      10_000,
      [
        { ticketId: UUID_A, amount: 0 },
        { ticketId: UUID_B, amount: 0 },
      ],
      tickets,
    )
    expect(result.valid).toBe(false)
    expect(result.error).toContain('al menos una boleta')
  })
})

describe('validateAllocations: sobrepago por boleta (BR-F12)', () => {
  const tickets = [ticket(UUID_A, 100_000, '0001', '1001')]

  it('marca la boleta que recibe mas de lo que debe', () => {
    const result = validateAllocations(150_000, [{ ticketId: UUID_A, amount: 150_000 }], tickets)

    expect(result.valid).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.ticketId).toBe(UUID_A)
    // La boleta se nombra por sus numeros, no por su codigo interno (BR-N11).
    expect(result.issues[0]?.message).toContain('0001 / 1001')
  })

  it('acepta pagar exactamente el saldo pendiente', () => {
    const result = validateAllocations(100_000, [{ ticketId: UUID_A, amount: 100_000 }], tickets)
    expect(result.valid).toBe(true)
  })

  it('marca un importe negativo', () => {
    const result = validateAllocations(100, [{ ticketId: UUID_A, amount: -100 }], tickets)
    expect(result.issues[0]?.message).toContain('negativo')
  })

  it('marca una boleta que no es de este cliente', () => {
    const result = validateAllocations(1_000, [{ ticketId: UUID_C, amount: 1_000 }], tickets)
    expect(result.issues[0]?.message).toContain('no pertenece a este cliente')
  })
})

describe('sumAllocations y nonZeroAllocations', () => {
  it('suma todas las filas', () => {
    expect(
      sumAllocations([
        { ticketId: UUID_A, amount: 40_000 },
        { ticketId: UUID_B, amount: 60_000 },
      ]),
    ).toBe(100_000)
  })

  it('descarta las filas en cero antes de enviarlas: la RPC exige importes positivos', () => {
    const result = nonZeroAllocations([
      { ticketId: UUID_A, amount: 40_000 },
      { ticketId: UUID_B, amount: 0 },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.ticketId).toBe(UUID_A)
  })
})

describe('createPaymentSchema', () => {
  const base = {
    clientId: UUID_A,
    totalAmount: 50_000,
    paymentDate: '2026-08-03',
    paymentMethod: 'cash' as const,
    notes: '',
    allocations: [{ ticketId: UUID_B, amount: 50_000 }],
  }

  it('acepta un pago que cuadra', () => {
    expect(createPaymentSchema.safeParse(base).success).toBe(true)
  })

  it('rechaza que la suma no coincida con el total (BR-F05)', () => {
    const result = createPaymentSchema.safeParse({
      ...base,
      allocations: [{ ticketId: UUID_B, amount: 30_000 }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('igual al valor del abono')
  })

  it('rechaza importes decimales: el dinero es entero (BR-P02)', () => {
    expect(createPaymentSchema.safeParse({ ...base, totalAmount: 50_000.5 }).success).toBe(false)
  })

  it('rechaza importes menores o iguales a cero (BR-F03)', () => {
    expect(
      createPaymentSchema.safeParse({
        ...base,
        totalAmount: 0,
        allocations: [{ ticketId: UUID_B, amount: 0 }],
      }).success,
    ).toBe(false)
  })

  it('rechaza un pago sin reparto', () => {
    expect(createPaymentSchema.safeParse({ ...base, allocations: [] }).success).toBe(false)
  })

  it('rechaza un metodo de pago inventado', () => {
    expect(createPaymentSchema.safeParse({ ...base, paymentMethod: 'bitcoin' }).success).toBe(false)
  })

  it('acepta un pago repartido entre varias boletas', () => {
    const result = createPaymentSchema.safeParse({
      ...base,
      totalAmount: 100_000,
      allocations: [
        { ticketId: UUID_B, amount: 60_000 },
        { ticketId: UUID_C, amount: 40_000 },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('voidPaymentSchema (BR-F09)', () => {
  it('exige un motivo de al menos 5 caracteres', () => {
    expect(voidPaymentSchema.safeParse({ paymentId: UUID_A, reason: 'ups' }).success).toBe(false)
    expect(
      voidPaymentSchema.safeParse({ paymentId: UUID_A, reason: 'Cliente pidio devolucion' })
        .success,
    ).toBe(true)
  })

  it('recorta los espacios antes de medir el motivo', () => {
    expect(voidPaymentSchema.safeParse({ paymentId: UUID_A, reason: '        ' }).success).toBe(
      false,
    )
  })
})
