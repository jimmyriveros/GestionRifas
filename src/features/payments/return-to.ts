/**
 * Destino despues de guardar un abono (D-133).
 *
 * El formulario de abonos es el mismo tanto si se abre desde una boleta como
 * desde el listado o la ficha del cliente. Lo que cambia es a donde se vuelve
 * cuando el guardado QUEDA confirmado: a la boleta de origen, o al listado de
 * abonos, que es lo de siempre.
 *
 * `fromTicketId` llega por la URL. Solo se acepta si esa boleta esta entre las
 * que este cliente puede pagar en esta pantalla: asi un `?ticketId=` escrito a
 * mano no manda a cualquier sitio, y el identificador que se interpola en la
 * ruta ya paso por RLS.
 */

const PAYMENTS_LIST_HREF = '/seller/payments'

export function paymentReturnTo(
  fromTicketId: string | undefined,
  payableTicketIds: readonly string[],
): { originTicketId: string | undefined; href: string } {
  const originTicketId =
    fromTicketId !== undefined && payableTicketIds.includes(fromTicketId)
      ? fromTicketId
      : undefined

  return {
    originTicketId,
    href: originTicketId ? `/seller/tickets/${originTicketId}` : PAYMENTS_LIST_HREF,
  }
}
