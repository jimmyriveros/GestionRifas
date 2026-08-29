import { describe, expect, it } from 'vitest'

import { paymentReturnTo } from '@/features/payments/return-to'

/**
 * Destino despues de guardar un abono (D-133).
 *
 * La ruta se interpola solo con un id que ya esta en la lista pagable: un
 * `?ticketId=` ajeno o mal formado no puede mandar a otra boleta.
 */

const TICKET_A = '11111111-2222-4333-8444-555555555551'
const TICKET_B = '11111111-2222-4333-8444-555555555552'
const TICKET_AJENA = '11111111-2222-4333-8444-555555555559'

describe('paymentReturnTo', () => {
  it('sin boleta de origen, vuelve al listado de abonos', () => {
    expect(paymentReturnTo(undefined, [TICKET_A, TICKET_B])).toEqual({
      originTicketId: undefined,
      href: '/seller/payments',
    })
  })

  it('con la boleta de esta pantalla, vuelve a su detalle', () => {
    expect(paymentReturnTo(TICKET_B, [TICKET_A, TICKET_B])).toEqual({
      originTicketId: TICKET_B,
      href: `/seller/tickets/${TICKET_B}`,
    })
  })

  it('un ticketId que no esta entre las boletas pagables se ignora', () => {
    expect(paymentReturnTo(TICKET_AJENA, [TICKET_A, TICKET_B])).toEqual({
      originTicketId: undefined,
      href: '/seller/payments',
    })
  })

  it('un ticketId vacio se ignora', () => {
    expect(paymentReturnTo('', [TICKET_A])).toEqual({
      originTicketId: undefined,
      href: '/seller/payments',
    })
  })

  it('no interpola en la ruta un id que no haya pasado la lista', () => {
    const forged = '../../../owner/tickets'
    const result = paymentReturnTo(forged, [TICKET_A])
    expect(result.href).toBe('/seller/payments')
    expect(result.href).not.toContain(forged)
  })
})
