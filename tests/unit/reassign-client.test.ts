import { describe, expect, it } from 'vitest'

import { canReassignClient, reassignBlockedReason } from '@/features/tickets/reassign-client'
import {
  reassignTicketClientSchema,
  reassignTicketToNewClientSchema,
  ticketClientSearchSchema,
} from '@/features/tickets/schemas'

const TICKET = '11111111-1111-4111-8111-111111111111'
const CLIENTE_A = '22222222-2222-4222-8222-222222222222'
const CLIENTE_B = '33333333-3333-4333-8333-333333333333'

const vendida = {
  inventoryStatus: 'assigned',
  clientId: CLIENTE_A,
  hasPaymentHistory: false,
  hasLotteryMatch: false,
}

describe('reassignBlockedReason (BR-I13, D-168)', () => {
  it('no bloquea una boleta vendida sin abonos ni coincidencias', () => {
    expect(reassignBlockedReason(vendida)).toBeNull()
    expect(canReassignClient(vendida)).toBe(true)
  })

  it('bloquea cuando hay historial de abonos, aunque el saldo sea cero', () => {
    const reason = reassignBlockedReason({ ...vendida, hasPaymentHistory: true })
    expect(reason).toMatch(/abonos en su historial/)
    expect(canReassignClient({ ...vendida, hasPaymentHistory: true })).toBe(false)
  })

  it('bloquea cuando la boleta aparece en un resultado de lotería', () => {
    const reason = reassignBlockedReason({ ...vendida, hasLotteryMatch: true })
    expect(reason).toMatch(/resultado registrado/)
    expect(canReassignClient({ ...vendida, hasLotteryMatch: true })).toBe(false)
  })

  it('el historial de abonos manda sobre la coincidencia: un solo motivo por pantalla', () => {
    expect(
      reassignBlockedReason({ ...vendida, hasPaymentHistory: true, hasLotteryMatch: true }),
    ).toMatch(/abonos en su historial/)
  })

  it('una boleta sin vender no ofrece la acción NI la explicación', () => {
    const disponible = { ...vendida, inventoryStatus: 'available', clientId: null }
    expect(reassignBlockedReason(disponible)).toBeNull()
    expect(canReassignClient(disponible)).toBe(false)
  })

  it('una boleta anulada tampoco', () => {
    const anulada = { ...vendida, inventoryStatus: 'cancelled' }
    expect(reassignBlockedReason(anulada)).toBeNull()
    expect(canReassignClient(anulada)).toBe(false)
  })
})

describe('reassignTicketClientSchema (BR-I13)', () => {
  const base = {
    ticketId: TICKET,
    expectedClientId: CLIENTE_A,
    newClientId: CLIENTE_B,
    reason: 'La vendí a otra persona',
  }

  it('acepta un cambio bien formado', () => {
    expect(reassignTicketClientSchema.safeParse(base).success).toBe(true)
  })

  it('rechaza identificadores que no son UUID', () => {
    for (const campo of ['ticketId', 'expectedClientId', 'newClientId'] as const) {
      const result = reassignTicketClientSchema.safeParse({ ...base, [campo]: 'no-es-uuid' })
      expect(result.success, campo).toBe(false)
    }
  })

  it('rechaza un cliente ausente', () => {
    const result = reassignTicketClientSchema.safeParse({ ...base, newClientId: null })
    expect(result.success).toBe(false)
  })

  it('rechaza el mismo cliente que ya tiene la boleta', () => {
    const result = reassignTicketClientSchema.safeParse({ ...base, newClientId: CLIENTE_A })
    expect(result.success).toBe(false)
    expect(result.error!.issues[0]?.message).toMatch(/ya es de ese cliente/i)
  })

  it('rechaza un motivo de menos de 5 caracteres, también si son espacios', () => {
    expect(reassignTicketClientSchema.safeParse({ ...base, reason: 'no' }).success).toBe(false)
    expect(reassignTicketClientSchema.safeParse({ ...base, reason: '        ' }).success).toBe(
      false,
    )
  })

  it('rechaza un motivo de más de 500 caracteres', () => {
    const result = reassignTicketClientSchema.safeParse({ ...base, reason: 'a'.repeat(501) })
    expect(result.success).toBe(false)
  })
})

describe('reassignTicketToNewClientSchema (D-050, D-168)', () => {
  const base = {
    ticketId: TICKET,
    expectedClientId: CLIENTE_A,
    reason: 'Se la puse a quien no era',
    client: { name: 'Ana Torres', alias: '', phone: '3101112233', email: '', notes: '' },
  }

  it('acepta el alta con los datos mínimos del cliente', () => {
    expect(reassignTicketToNewClientSchema.safeParse(base).success).toBe(true)
  })

  it('hereda las reglas del formulario de cliente: sin teléfono no pasa', () => {
    const result = reassignTicketToNewClientSchema.safeParse({
      ...base,
      client: { ...base.client, phone: '' },
    })
    expect(result.success).toBe(false)
  })

  it('exige el motivo igual que el cambio a un cliente existente', () => {
    expect(reassignTicketToNewClientSchema.safeParse({ ...base, reason: 'no' }).success).toBe(false)
  })
})

describe('ticketClientSearchSchema (D-168)', () => {
  it('acepta boleta y término, incluso vacío', () => {
    expect(ticketClientSearchSchema.safeParse({ ticketId: TICKET, term: 'ana' }).success).toBe(true)
    expect(ticketClientSearchSchema.safeParse({ ticketId: TICKET, term: '' }).success).toBe(true)
  })

  it('no acepta un vendedor: la cartera la resuelve el servidor a partir de la boleta', () => {
    const result = ticketClientSearchSchema.safeParse({
      ticketId: TICKET,
      term: 'ana',
      sellerId: CLIENTE_B,
    })
    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty('sellerId')
  })

  it('rechaza una boleta que no es UUID y un término desmesurado', () => {
    expect(ticketClientSearchSchema.safeParse({ ticketId: 'x', term: 'ana' }).success).toBe(false)
    expect(
      ticketClientSearchSchema.safeParse({ ticketId: TICKET, term: 'a'.repeat(101) }).success,
    ).toBe(false)
  })
})
