/**
 * Corregir el cliente de una boleta vendida: quien puede, y que se le dice a
 * quien no puede (BR-I13, D-168).
 *
 * Vive aparte —igual que `sale-price.ts`— porque lo necesitan las DOS pantallas
 * de detalle, la del vendedor y la administrativa, y porque asi se puede probar
 * sin montar React.
 *
 * Esto NO autoriza nada: decide que se ofrece en pantalla. La frontera es
 * `reassign_ticket_client`, que vuelve a comprobarlo todo con la fila
 * bloqueada.
 */

export type ReassignEligibility = {
  inventoryStatus: string
  clientId: string | null
  /**
   * La boleta tiene ALGUNA fila en `payment_allocations`, aunque su pago este
   * anulado o el importe se haya corregido a $0. El historial es el criterio,
   * no el saldo (D-168).
   */
  hasPaymentHistory: boolean
  /** La boleta aparece en alguna coincidencia de loteria (BR-L14). */
  hasLotteryMatch: boolean
}

/**
 * Por que esta boleta no puede cambiar de cliente, en las palabras de quien la
 * mira. `null` cuando si puede.
 *
 * Tambien devuelve `null` cuando la boleta ni siquiera se ha vendido: ahi no
 * hay nada que corregir, y explicar por que no se puede corregir algo que no
 * existe seria ruido. En ese caso la pantalla no ensena ni el boton ni el
 * aviso; quien decide cual de las dos cosas es `canReassignClient`.
 *
 * LAS DOS FRASES NOMBRAN TAMBIEN «liberar» (D-169). Desde que la tarjeta del
 * cliente ofrece dos acciones, estas dos causas cierran las dos puertas a la
 * vez: escribir una frase por accion pondria dos avisos casi identicos uno
 * encima del otro. Se explica la CAUSA una sola vez, con sus dos consecuencias.
 * El aviso que se pinta lo elige `ticketClientNotice`, en `release-ticket.ts`.
 */
export function reassignBlockedReason(ticket: ReassignEligibility): string | null {
  if (ticket.inventoryStatus !== 'assigned' || ticket.clientId === null) return null
  if (ticket.hasPaymentHistory) {
    return 'Esta boleta tiene abonos en su historial: ya no puede cambiar de cliente ni liberarse.'
  }
  if (ticket.hasLotteryMatch) {
    return 'Esta boleta ya hace parte de un resultado registrado: no puede cambiar de cliente ni liberarse.'
  }
  return null
}

/** Se ofrece el boton «Cambiar cliente». */
export function canReassignClient(ticket: ReassignEligibility): boolean {
  return (
    ticket.inventoryStatus === 'assigned' &&
    ticket.clientId !== null &&
    reassignBlockedReason(ticket) === null
  )
}
