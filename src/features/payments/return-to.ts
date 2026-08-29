/**
 * Destino de «Registrar abono» (D-133, D-135).
 *
 * El formulario es uno solo. Lo que cambia es a donde se vuelve al guardar,
 * al cancelar o al pulsar la flecha: a la boleta, al cliente, a «Mis pagos»
 * o al panel, segun desde donde se abrio.
 *
 * El origen viaja en la URL (`from`, y `ticketId` cuando aplica). No hay
 * estado global ni `sessionStorage`: si se recarga el formulario, el origen
 * sigue ahi. Nunca se interpola un valor crudo del navegador en una ruta:
 * `from` es una allowlist, `ticketId` solo cuenta si esta entre las boletas
 * pagables de este cliente (RLS + saldo) y `clientId` solo si es un UUID.
 * Un parametro ajeno, una URL externa o un id escrito a mano caen en
 * «Mis pagos», que es el destino seguro de siempre.
 *
 * `ticketId` y `from` no son lo mismo. El primero marca la boleta que se
 * cubre primero en el reparto (D-133) y, si no hay `from`, tambien el
 * destino (compatibilidad con los enlaces que solo traian `ticketId`).
 * El segundo decide el destino cuando viene informado: desde un cliente
 * se vuelve al cliente aunque el abono se haya sugerido en una boleta.
 */

const PAYMENTS_LIST_HREF = '/seller/payments'
const DASHBOARD_HREF = '/seller/dashboard'
const NEW_PAYMENT_HREF = '/seller/payments/new'

export const PAYMENT_ORIGINS = ['ticket', 'client', 'payments', 'dashboard'] as const
export type PaymentOrigin = (typeof PAYMENT_ORIGINS)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function parsePaymentOrigin(value: string | undefined): PaymentOrigin | undefined {
  return (PAYMENT_ORIGINS as readonly string[]).includes(value ?? '')
    ? (value as PaymentOrigin)
    : undefined
}

/**
 * Enlace al formulario compartido. Quien abre el flujo pone aqui el origen;
 * `ClientPicker` conserva los parametros al elegir el cliente, asi que `from`
 * sobrevive al paso intermedio.
 */
export function paymentNewHref(
  input: {
    from?: PaymentOrigin
    clientId?: string
    ticketId?: string
  } = {},
): string {
  const params = new URLSearchParams()
  if (input.from) params.set('from', input.from)
  if (input.clientId) params.set('clientId', input.clientId)
  if (input.ticketId) params.set('ticketId', input.ticketId)
  const query = params.toString()
  return query ? `${NEW_PAYMENT_HREF}?${query}` : NEW_PAYMENT_HREF
}

export function paymentReturnTo(input: {
  from?: string
  fromTicketId?: string
  clientId?: string
  payableTicketIds: readonly string[]
}): { originTicketId: string | undefined; href: string } {
  const originTicketId =
    input.fromTicketId !== undefined && input.payableTicketIds.includes(input.fromTicketId)
      ? input.fromTicketId
      : undefined

  const from = parsePaymentOrigin(input.from)

  if (from === 'client' && isUuid(input.clientId)) {
    return { originTicketId, href: `/seller/clients/${input.clientId}` }
  }
  if (from === 'dashboard') {
    return { originTicketId, href: DASHBOARD_HREF }
  }
  if (from === 'payments') {
    return { originTicketId, href: PAYMENTS_LIST_HREF }
  }
  if ((from === 'ticket' || from === undefined) && originTicketId) {
    return { originTicketId, href: `/seller/tickets/${originTicketId}` }
  }

  return { originTicketId, href: PAYMENTS_LIST_HREF }
}
