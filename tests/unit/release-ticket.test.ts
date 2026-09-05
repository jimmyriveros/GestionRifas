import { describe, expect, it } from 'vitest'

import {
  canReleaseTicket,
  hasTicketClientActions,
  ticketClientNotice,
  type ReleaseEligibility,
} from '@/features/tickets/release-ticket'
import { canReassignClient } from '@/features/tickets/reassign-client'
import { releaseTicketSchema } from '@/features/tickets/schemas'

const TICKET = '11111111-1111-4111-8111-111111111111'
const CLIENTE_A = '22222222-2222-4222-8222-222222222222'

const vendida: ReleaseEligibility = {
  inventoryStatus: 'assigned',
  clientId: CLIENTE_A,
  hasPaymentHistory: false,
  hasLotteryMatch: false,
  raffleStatus: 'active',
}

describe('canReleaseTicket (BR-I14, D-169)', () => {
  it('una boleta vendida sin abonos, sin coincidencias y con la rifa activa se puede liberar', () => {
    expect(canReleaseTicket(vendida)).toBe(true)
    expect(ticketClientNotice(vendida)).toBeNull()
  })

  it('no se ofrece con abonos en el historial, aunque el saldo sea cero', () => {
    expect(canReleaseTicket({ ...vendida, hasPaymentHistory: true })).toBe(false)
  })

  it('no se ofrece si la boleta aparece en un resultado de lotería', () => {
    expect(canReleaseTicket({ ...vendida, hasLotteryMatch: true })).toBe(false)
  })

  it('no se ofrece con la rifa cerrada, anulada o en borrador', () => {
    for (const raffleStatus of ['closed', 'cancelled', 'draft']) {
      expect(canReleaseTicket({ ...vendida, raffleStatus }), raffleStatus).toBe(false)
    }
  })

  it('no se ofrece sobre una boleta que no está vendida', () => {
    expect(canReleaseTicket({ ...vendida, inventoryStatus: 'available', clientId: null })).toBe(
      false,
    )
    expect(canReleaseTicket({ ...vendida, inventoryStatus: 'cancelled' })).toBe(false)
    expect(canReleaseTicket({ ...vendida, inventoryStatus: 'draft', clientId: null })).toBe(false)
    expect(
      canReleaseTicket({ ...vendida, inventoryStatus: 'pending_approval', clientId: null }),
    ).toBe(false)
  })

  it('una boleta assigned sin cliente —imposible por CHECK— tampoco se libera', () => {
    expect(canReleaseTicket({ ...vendida, clientId: null })).toBe(false)
  })
})

describe('ticketClientNotice: UNA frase, nunca dos (D-169)', () => {
  it('con abonos nombra las DOS acciones que se cierran', () => {
    const aviso = ticketClientNotice({ ...vendida, hasPaymentHistory: true })
    expect(aviso).toMatch(/abonos en su historial/)
    expect(aviso).toMatch(/cambiar de cliente/)
    expect(aviso).toMatch(/liberarse/)
  })

  it('con coincidencia de lotería, igual', () => {
    const aviso = ticketClientNotice({ ...vendida, hasLotteryMatch: true })
    expect(aviso).toMatch(/resultado registrado/)
    expect(aviso).toMatch(/cambiar de cliente/)
    expect(aviso).toMatch(/liberarse/)
  })

  it('el historial de abonos manda sobre la coincidencia: un solo motivo por pantalla', () => {
    expect(
      ticketClientNotice({ ...vendida, hasPaymentHistory: true, hasLotteryMatch: true }),
    ).toMatch(/abonos en su historial/)
  })

  it('con la rifa cerrada habla SOLO de liberar: corregir el cliente sí se puede (D-168)', () => {
    const cerrada = { ...vendida, raffleStatus: 'closed' }
    const aviso = ticketClientNotice(cerrada)
    expect(aviso).toMatch(/rifa ya no está activa/)
    expect(aviso).toMatch(/no se puede liberar/)
    expect(aviso).not.toMatch(/cambiar de cliente/)
    // Y el botón de corregir el cliente sigue ahí.
    expect(canReassignClient(cerrada)).toBe(true)
    expect(canReleaseTicket(cerrada)).toBe(false)
  })

  it('no ofrece anular como salida: anular es del personal (BR-I10)', () => {
    expect(ticketClientNotice({ ...vendida, raffleStatus: 'closed' })).not.toMatch(/anúla|anular/i)
  })

  it('una boleta sin vender no enseña ni acción ni aviso', () => {
    const disponible = { ...vendida, inventoryStatus: 'available', clientId: null }
    expect(ticketClientNotice(disponible)).toBeNull()
    expect(canReleaseTicket(disponible)).toBe(false)
    expect(canReassignClient(disponible)).toBe(false)
  })

  it('una boleta sin vender en una rifa cerrada tampoco: no hay venta que deshacer', () => {
    expect(
      ticketClientNotice({
        ...vendida,
        inventoryStatus: 'available',
        clientId: null,
        raffleStatus: 'closed',
      }),
    ).toBeNull()
  })
})

describe('releaseTicketSchema (BR-I14)', () => {
  const base = {
    ticketId: TICKET,
    expectedClientId: CLIENTE_A,
    reason: 'El cliente ya no la quiere',
  }

  it('acepta una liberación bien formada', () => {
    expect(releaseTicketSchema.safeParse(base).success).toBe(true)
  })

  it('rechaza identificadores que no son UUID', () => {
    for (const campo of ['ticketId', 'expectedClientId'] as const) {
      expect(releaseTicketSchema.safeParse({ ...base, [campo]: 'no-es-uuid' }).success, campo).toBe(
        false,
      )
    }
  })

  it('rechaza un motivo de menos de 5 caracteres, también si son espacios', () => {
    expect(releaseTicketSchema.safeParse({ ...base, reason: 'no' }).success).toBe(false)
    expect(releaseTicketSchema.safeParse({ ...base, reason: '        ' }).success).toBe(false)
  })

  it('rechaza un motivo de más de 500 caracteres', () => {
    expect(releaseTicketSchema.safeParse({ ...base, reason: 'a'.repeat(501) }).success).toBe(false)
  })

  it('no acepta cliente nuevo, precio ni fecha: liberar no vende nada', () => {
    const result = releaseTicketSchema.safeParse({
      ...base,
      newClientId: CLIENTE_A,
      salePrice: 120_000,
      saleDate: '2026-09-05',
    })
    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty('newClientId')
    expect(result.data).not.toHaveProperty('salePrice')
    expect(result.data).not.toHaveProperty('saleDate')
  })
})

describe('hasTicketClientActions: la ranura `action` de ClientLinkCard (D-169)', () => {
  it('una boleta vendida y libre tiene los dos botones', () => {
    expect(hasTicketClientActions(vendida)).toBe(true)
  })

  it('una boleta bloqueada tiene su aviso', () => {
    expect(hasTicketClientActions({ ...vendida, hasPaymentHistory: true })).toBe(true)
    expect(hasTicketClientActions({ ...vendida, hasLotteryMatch: true })).toBe(true)
    expect(hasTicketClientActions({ ...vendida, raffleStatus: 'closed' })).toBe(true)
  })

  it('una boleta ANULADA conserva su cliente y no tiene nada que pintar', () => {
    // Sin esta pregunta, `ClientLinkCard` cambiaría su árbol de HTML por una
    // acción que no pinta nada: un elemento de React siempre es «verdadero».
    const anulada = { ...vendida, inventoryStatus: 'cancelled' }
    expect(hasTicketClientActions(anulada)).toBe(false)
    expect(ticketClientNotice(anulada)).toBeNull()
  })

  it('una boleta anulada en una rifa cerrada, tampoco', () => {
    expect(
      hasTicketClientActions({
        ...vendida,
        inventoryStatus: 'cancelled',
        raffleStatus: 'closed',
      }),
    ).toBe(false)
  })

  it('una boleta sin vender, tampoco', () => {
    expect(
      hasTicketClientActions({ ...vendida, inventoryStatus: 'available', clientId: null }),
    ).toBe(false)
  })
})
