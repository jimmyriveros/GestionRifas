/**
 * Liberar una boleta vendida: quien puede, y que se le dice a quien no puede
 * (BR-I14, D-169).
 *
 * Vive aparte —igual que `sale-price.ts` y `reassign-client.ts`— porque lo
 * necesitan las DOS pantallas de detalle, la del vendedor y la administrativa, y
 * porque asi se puede probar sin montar React.
 *
 * Esto NO autoriza nada: decide que se ofrece en pantalla. La frontera es
 * `release_ticket_client`, que vuelve a comprobarlo todo con la fila bloqueada.
 */

import {
  canReassignClient,
  reassignBlockedReason,
  type ReassignEligibility,
} from './reassign-client'

/**
 * Lo mismo que pide corregir el cliente, mas el estado de la rifa.
 *
 * Liberar devuelve la boleta al INVENTARIO para volver a venderla, y eso es un
 * acto comercial: en una rifa cerrada dejaria disponible algo que ya no se puede
 * vender (BR-R08). Corregir el cliente no lo exige, a proposito (D-168).
 */
export type ReleaseEligibility = ReassignEligibility & {
  /** `raffles.status` de la rifa de la boleta. */
  raffleStatus: string
}

/** Se ofrece el boton «Liberar boleta». */
export function canReleaseTicket(ticket: ReleaseEligibility): boolean {
  return (
    ticket.inventoryStatus === 'assigned' &&
    ticket.clientId !== null &&
    !ticket.hasPaymentHistory &&
    !ticket.hasLotteryMatch &&
    ticket.raffleStatus === 'active'
  )
}

/**
 * Hay algo que pintar bajo la tarjeta del cliente: un boton, o una explicacion.
 *
 * Lo pregunta la pagina ANTES de montar `TicketClientActions`, porque un
 * elemento de React siempre es «verdadero» aunque su componente no pinte nada, y
 * `ClientLinkCard` cambia su arbol de HTML en cuanto recibe una `action`
 * (D-168). Una boleta ANULADA conserva su cliente y no tiene ni acciones ni
 * aviso: sin esta pregunta se quedaria con un hueco vacio debajo.
 */
export function hasTicketClientActions(ticket: ReleaseEligibility): boolean {
  return (
    canReassignClient(ticket) || canReleaseTicket(ticket) || ticketClientNotice(ticket) !== null
  )
}

/**
 * La UNICA explicacion que se pinta bajo la tarjeta del cliente. `null` cuando
 * no falta ninguna de las dos acciones, y tambien cuando la boleta ni siquiera
 * se ha vendido: ahi no hay ni venta que deshacer ni cliente que corregir.
 *
 * Se pinta UNA sola frase, nunca dos. Las dos causas compartidas —abonos en el
 * historial y coincidencia de loteria— ya nombran las dos acciones en
 * `reassignBlockedReason`; la rifa cerrada es la unica que afecta solo a
 * liberar, porque corregir el cliente si se puede con la rifa cerrada (D-168).
 */
export function ticketClientNotice(ticket: ReleaseEligibility): string | null {
  const shared = reassignBlockedReason(ticket)
  if (shared !== null) return shared

  if (ticket.inventoryStatus !== 'assigned' || ticket.clientId === null) return null
  if (ticket.raffleStatus !== 'active') {
    // Sin ofrecer «anúlala» como salida: anular es del personal (BR-I10) y a un
    // vendedor le estaria mandando a hacer algo que su pantalla no le deja.
    return 'La rifa ya no está activa: esta boleta no se puede liberar.'
  }
  return null
}
