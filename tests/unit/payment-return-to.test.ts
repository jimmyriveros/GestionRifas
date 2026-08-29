import { describe, expect, it } from 'vitest'

import { paymentNewHref, paymentReturnTo, parsePaymentOrigin } from '@/features/payments/return-to'

/**
 * Destino de «Registrar abono» (D-133, D-135).
 *
 * La ruta se interpola solo con un id que ya paso por la lista pagable o con
 * un UUID; un `from` o un `ticketId` ajenos no pueden mandar a otra boleta,
 * a otro cliente ni a una URL externa.
 */

const TICKET_A = '11111111-2222-4333-8444-555555555551'
const TICKET_B = '11111111-2222-4333-8444-555555555552'
const TICKET_AJENA = '11111111-2222-4333-8444-555555555559'
const CLIENT_A = '11111111-2222-4333-8444-555555555561'

describe('parsePaymentOrigin', () => {
  it('acepta solo la allowlist', () => {
    expect(parsePaymentOrigin('ticket')).toBe('ticket')
    expect(parsePaymentOrigin('client')).toBe('client')
    expect(parsePaymentOrigin('payments')).toBe('payments')
    expect(parsePaymentOrigin('dashboard')).toBe('dashboard')
  })

  it('ignora valores ajenos, vacios o con pinta de URL', () => {
    expect(parsePaymentOrigin(undefined)).toBeUndefined()
    expect(parsePaymentOrigin('')).toBeUndefined()
    expect(parsePaymentOrigin('https://evil.example')).toBeUndefined()
    expect(parsePaymentOrigin('/seller/tickets')).toBeUndefined()
    expect(parsePaymentOrigin('TICKET')).toBeUndefined()
  })
})

describe('paymentNewHref', () => {
  it('sin parametros es la ruta desnuda', () => {
    expect(paymentNewHref()).toBe('/seller/payments/new')
  })

  it('compone from, cliente y boleta en ese orden', () => {
    expect(paymentNewHref({ from: 'ticket', clientId: CLIENT_A, ticketId: TICKET_A })).toBe(
      `/seller/payments/new?from=ticket&clientId=${CLIENT_A}&ticketId=${TICKET_A}`,
    )
  })

  it('desde un cliente no arrastra ticketId', () => {
    expect(paymentNewHref({ from: 'client', clientId: CLIENT_A })).toBe(
      `/seller/payments/new?from=client&clientId=${CLIENT_A}`,
    )
  })

  it('desde pagos o el panel no pone ids', () => {
    expect(paymentNewHref({ from: 'payments' })).toBe('/seller/payments/new?from=payments')
    expect(paymentNewHref({ from: 'dashboard' })).toBe('/seller/payments/new?from=dashboard')
  })
})

describe('paymentReturnTo', () => {
  it('sin origen, vuelve al listado de abonos', () => {
    expect(paymentReturnTo({ payableTicketIds: [TICKET_A, TICKET_B] })).toEqual({
      originTicketId: undefined,
      href: '/seller/payments',
    })
  })

  it('con la boleta de esta pantalla y sin from, vuelve a su detalle (D-133)', () => {
    expect(
      paymentReturnTo({ fromTicketId: TICKET_B, payableTicketIds: [TICKET_A, TICKET_B] }),
    ).toEqual({
      originTicketId: TICKET_B,
      href: `/seller/tickets/${TICKET_B}`,
    })
  })

  it('from=ticket con la boleta de esta pantalla vuelve a su detalle', () => {
    expect(
      paymentReturnTo({
        from: 'ticket',
        fromTicketId: TICKET_B,
        payableTicketIds: [TICKET_A, TICKET_B],
      }),
    ).toEqual({
      originTicketId: TICKET_B,
      href: `/seller/tickets/${TICKET_B}`,
    })
  })

  it('from=client vuelve al cliente aunque haya boleta de origen', () => {
    expect(
      paymentReturnTo({
        from: 'client',
        clientId: CLIENT_A,
        fromTicketId: TICKET_A,
        payableTicketIds: [TICKET_A, TICKET_B],
      }),
    ).toEqual({
      originTicketId: TICKET_A,
      href: `/seller/clients/${CLIENT_A}`,
    })
  })

  it('from=payments vuelve a Mis pagos aunque haya boleta de origen', () => {
    expect(
      paymentReturnTo({
        from: 'payments',
        fromTicketId: TICKET_A,
        payableTicketIds: [TICKET_A],
      }),
    ).toEqual({
      originTicketId: TICKET_A,
      href: '/seller/payments',
    })
  })

  it('from=dashboard vuelve al panel', () => {
    expect(paymentReturnTo({ from: 'dashboard', payableTicketIds: [] })).toEqual({
      originTicketId: undefined,
      href: '/seller/dashboard',
    })
  })

  it('un ticketId que no esta entre las boletas pagables se ignora', () => {
    expect(
      paymentReturnTo({ fromTicketId: TICKET_AJENA, payableTicketIds: [TICKET_A, TICKET_B] }),
    ).toEqual({
      originTicketId: undefined,
      href: '/seller/payments',
    })
  })

  it('from=ticket con un ticketId ajeno cae en Mis pagos', () => {
    expect(
      paymentReturnTo({
        from: 'ticket',
        fromTicketId: TICKET_AJENA,
        payableTicketIds: [TICKET_A],
      }),
    ).toEqual({
      originTicketId: undefined,
      href: '/seller/payments',
    })
  })

  it('un ticketId vacio se ignora', () => {
    expect(paymentReturnTo({ fromTicketId: '', payableTicketIds: [TICKET_A] })).toEqual({
      originTicketId: undefined,
      href: '/seller/payments',
    })
  })

  it('no interpola en la ruta un id que no haya pasado la lista', () => {
    const forged = '../../../owner/tickets'
    const result = paymentReturnTo({ fromTicketId: forged, payableTicketIds: [TICKET_A] })
    expect(result.href).toBe('/seller/payments')
    expect(result.href).not.toContain(forged)
  })

  it('un from con pinta de URL externa se ignora', () => {
    expect(
      paymentReturnTo({
        from: 'https://evil.example/steal',
        clientId: CLIENT_A,
        payableTicketIds: [TICKET_A],
      }),
    ).toEqual({
      originTicketId: undefined,
      href: '/seller/payments',
    })
  })

  it('from=client con un clientId que no es UUID no interpola la ruta', () => {
    const forged = '../../owner/clients'
    const result = paymentReturnTo({
      from: 'client',
      clientId: forged,
      payableTicketIds: [],
    })
    expect(result.href).toBe('/seller/payments')
    expect(result.href).not.toContain(forged)
  })

  it('from=client sin clientId cae en Mis pagos', () => {
    expect(paymentReturnTo({ from: 'client', payableTicketIds: [] })).toEqual({
      originTicketId: undefined,
      href: '/seller/payments',
    })
  })
})
