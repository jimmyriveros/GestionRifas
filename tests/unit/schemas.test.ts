import { describe, expect, it } from 'vitest'

import {
  createRaffleSchema,
  changeRaffleStatusSchema,
  raffleFormDefaults,
} from '@/features/raffles/schemas'
import {
  cancelTicketSchema,
  createTicketSchema,
  ticketNumberSchema,
} from '@/features/tickets/schemas'
import { createUserSchema } from '@/features/users/schemas'
import {
  DEFAULT_TICKET_PRICE,
  RAFFLE_STATUS_TRANSITIONS,
  isOwnerOnlyRaffleTransition,
  type RaffleStatus,
} from '@/lib/constants'

// UUID v4 valido: z.uuid() comprueba tambien el digito de version y el de
// variante, no solo la forma general.
const UUID = '11111111-2222-4333-8444-555555555555'

describe('ticketNumberSchema (BR-N02, BR-N03)', () => {
  it('acepta de 1 a 4 digitos', () => {
    for (const value of ['1', '25', '007', '0000', '9999']) {
      expect(ticketNumberSchema.safeParse(value).success).toBe(true)
    }
  })

  it('rechaza los ejemplos invalidos del prompt', () => {
    for (const value of ['', '12345', '12A4', '-123', '12.5']) {
      expect(ticketNumberSchema.safeParse(value).success).toBe(false)
    }
  })

  it('no normaliza los ceros iniciales', () => {
    expect(ticketNumberSchema.parse('007')).toBe('007')
    expect(ticketNumberSchema.parse('0000')).toBe('0000')
  })
})

describe('createTicketSchema', () => {
  it('exige rifa, vendedor y los dos numeros', () => {
    const result = createTicketSchema.safeParse({
      raffleId: UUID,
      sellerId: UUID,
      dailyNumber: '0007',
      weeklyNumber: '12',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza un identificador de rifa que no es UUID', () => {
    const result = createTicketSchema.safeParse({
      raffleId: 'no-es-uuid',
      sellerId: UUID,
      dailyNumber: '1',
      weeklyNumber: '2',
    })
    expect(result.success).toBe(false)
  })
})

describe('cancelTicketSchema (BR-I10)', () => {
  it('exige un motivo de al menos 5 caracteres', () => {
    expect(cancelTicketSchema.safeParse({ ticketId: UUID, reason: 'ups' }).success).toBe(false)
    expect(
      cancelTicketSchema.safeParse({ ticketId: UUID, reason: 'Numero equivocado' }).success,
    ).toBe(true)
  })
})

describe('createRaffleSchema', () => {
  const base = {
    name: 'Rifa de prueba',
    description: '',
    ticketPrice: DEFAULT_TICKET_PRICE,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    allowSellerTicketCreation: false,
  }

  it('acepta una rifa valida con el precio predeterminado', () => {
    expect(createRaffleSchema.safeParse(base).success).toBe(true)
  })

  /**
   * BR-R04 y D-098. Es la unica constante de precio de toda la aplicacion: el
   * formulario de una rifa nueva llega con ella puesta y a partir de ahi manda
   * `raffles.ticket_price`. Si alguien la devuelve a $100.000, esto lo dice.
   */
  it('una rifa nueva llega con $120.000 puestos (BR-R04)', () => {
    expect(DEFAULT_TICKET_PRICE).toBe(120_000)
    expect(raffleFormDefaults.ticketPrice).toBe(120_000)
  })

  it('rechaza que la fecha de fin sea anterior a la de inicio (BR-R07)', () => {
    const result = createRaffleSchema.safeParse({ ...base, endDate: '2025-12-31' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['endDate'])
  })

  it('acepta que inicio y fin sean el mismo dia', () => {
    expect(createRaffleSchema.safeParse({ ...base, endDate: base.startDate }).success).toBe(true)
  })

  it('rechaza precios no enteros, cero o negativos (BR-P02)', () => {
    expect(createRaffleSchema.safeParse({ ...base, ticketPrice: 100000.5 }).success).toBe(false)
    expect(createRaffleSchema.safeParse({ ...base, ticketPrice: 0 }).success).toBe(false)
    expect(createRaffleSchema.safeParse({ ...base, ticketPrice: -1 }).success).toBe(false)
  })

  it('rechaza un nombre demasiado corto', () => {
    expect(createRaffleSchema.safeParse({ ...base, name: 'A' }).success).toBe(false)
  })
})

describe('transiciones de estado de rifa (BR-R03)', () => {
  it('permite exactamente las transiciones documentadas', () => {
    expect(RAFFLE_STATUS_TRANSITIONS.draft).toEqual(['active', 'cancelled'])
    expect(RAFFLE_STATUS_TRANSITIONS.active).toEqual(['closed', 'cancelled'])
    expect(RAFFLE_STATUS_TRANSITIONS.closed).toEqual(['active', 'cancelled'])
    expect(RAFFLE_STATUS_TRANSITIONS.cancelled).toEqual([])
  })

  it('reabrir una rifa cerrada es la unica transicion exclusiva del Owner', () => {
    expect(isOwnerOnlyRaffleTransition('closed', 'active')).toBe(true)

    const others: [RaffleStatus, RaffleStatus][] = [
      ['draft', 'active'],
      ['active', 'closed'],
      ['active', 'cancelled'],
      ['closed', 'cancelled'],
    ]
    for (const [from, to] of others) {
      expect(isOwnerOnlyRaffleTransition(from, to)).toBe(false)
    }
  })

  it('el esquema no acepta un estado inventado', () => {
    expect(changeRaffleStatusSchema.safeParse({ id: UUID, status: 'archivada' }).success).toBe(
      false,
    )
  })
})

describe('createUserSchema (BR-U08, BR-U03)', () => {
  const base = {
    fullName: 'Ana Perez',
    alias: '',
    phone: '3001234567',
    email: 'ANA@Demo.test',
    role: 'seller',
  }

  it('normaliza el correo a minusculas', () => {
    const result = createUserSchema.parse(base)
    expect(result.email).toBe('ana@demo.test')
  })

  it('exige telefono', () => {
    expect(createUserSchema.safeParse({ ...base, phone: '' }).success).toBe(false)
    expect(createUserSchema.safeParse({ ...base, phone: '123' }).success).toBe(false)
  })

  it('no admite crear un usuario con rol owner', () => {
    expect(createUserSchema.safeParse({ ...base, role: 'owner' }).success).toBe(false)
  })

  it('admite admin y seller', () => {
    expect(createUserSchema.safeParse({ ...base, role: 'admin' }).success).toBe(true)
    expect(createUserSchema.safeParse({ ...base, role: 'seller' }).success).toBe(true)
  })
})
