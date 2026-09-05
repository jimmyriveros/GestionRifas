/**
 * Entrega del paz y salvo: qué se ofrece, qué se dice y cómo se llama cada
 * estado (BR-I15, D-170).
 *
 * Vive aparte —igual que `sale-price.ts`, `reassign-client.ts` y
 * `release-ticket.ts`— porque lo necesitan las DOS pantallas de detalle, las
 * CUATRO listas de boletas y las pruebas unitarias, que no montan React.
 *
 * TODOS LOS TEXTOS ESTÁN AQUÍ, juntos, por lo mismo que `search/hints.ts` y
 * `notifications/text.ts`: un término se escribe una sola vez o acaba habiendo
 * tres (`UX_COPY_GUIDELINES` Anexo B).
 *
 * Esto NO autoriza nada: decide qué se pinta. La frontera es
 * `set_ticket_clearance_delivery`, que vuelve a comprobarlo todo con la fila
 * bloqueada.
 */

/**
 * Lo que hace falta saber de una boleta para hablar de su paz y salvo. Sale tal
 * cual de `TicketListItem`, así que las listas no piden ni una columna extra.
 */
export type ClearanceEligibility = {
  inventoryStatus: string
  clientId: string | null
  /** Cuándo se registró la entrega. `null` = por entregar. */
  clearanceDeliveredAt: string | null
  /** La marcó la migración `0049` al estrenar la función, no una persona. */
  clearanceAssumedDelivered: boolean
}

/**
 * Los tres estados que se pueden pintar, más `null`.
 *
 * `null` es una boleta que todavía no se ha vendido: no hay entrega de la que
 * hablar, y una lista que dijera «por entregar» de una boleta disponible
 * estaría inventando una tarea.
 *
 * `assumed` es «entregado», pero SIN fecha que se pueda enseñar: es un registro
 * que puso el sistema al estrenar la función.
 */
export type ClearanceState = 'delivered' | 'assumed' | 'pending' | null

export function clearanceState(ticket: ClearanceEligibility): ClearanceState {
  if (ticket.clientId === null) return null
  if (ticket.inventoryStatus !== 'assigned' && ticket.inventoryStatus !== 'cancelled') return null
  if (ticket.clearanceDeliveredAt === null) return 'pending'
  return ticket.clearanceAssumedDelivered ? 'assumed' : 'delivered'
}

/**
 * El interruptor se puede mover.
 *
 * Una boleta ANULADA conserva lo que se le hubiera registrado (BR-I06) y se
 * enseña en modo lectura: ya no hay nada que entregar. La rifa cerrada NO
 * bloquea nada —entregar un papel no es un acto comercial—, y por eso este
 * módulo no necesita saber en qué estado está la rifa: es la diferencia con
 * `release-ticket.ts` (D-169).
 */
export function canEditClearanceReceipt(ticket: ClearanceEligibility): boolean {
  return ticket.inventoryStatus === 'assigned' && ticket.clientId !== null
}

/**
 * Todo lo que se lee en pantalla sobre el paz y salvo.
 *
 * «Paz y salvo» se escribe SIEMPRE entero donde cabe; en la tabla y en la
 * tarjeta del teléfono se abrevia lo VISIBLE —`short`— y el término completo
 * viaja en un `sr-only` —`long`—, que es lo que se anuncia (D-114).
 */
export const CLEARANCE_COPY = {
  /** Título del bloque, en el detalle de la boleta. */
  title: 'Entrega del paz y salvo',
  /** Lo único que la pantalla no enseña: qué NO cambia al mover el interruptor. */
  help: 'Solo registra la entrega física. No cambia abonos, saldo ni estado de pago.',
  delivered: {
    long: 'Paz y salvo entregado',
    short: 'Entregado',
  },
  pending: {
    long: 'Paz y salvo por entregar',
    short: 'Por entregar',
  },
  /**
   * Un registro heredado dice QUE está entregado y POR QUÉ no hay fecha. Nunca
   * se escribe «Entregado el <fecha de la migración>», ni la fecha de
   * asignación, ni una fecha calculada: sería inventar el dato que falta.
   */
  assumedNote:
    'Marcado como entregado al activar esta función. La fecha real de entrega no estaba registrada.',
  /** Mientras el servidor confirma. Nunca se inventa una hora en el navegador. */
  saving: 'Guardando…',
} as const

/** «Entregado el 5 sept 2026, 3:04 p. m.» — solo para un registro manual. */
export function clearanceDeliveredLabel(formattedDateTime: string): string {
  return `Entregado el ${formattedDateTime}`
}

/**
 * El estado en las palabras del glosario. `assumed` y `delivered` dicen lo
 * MISMO —la boleta está entregada—: lo que los separa es si hay una fecha que
 * enseñar, no cómo se llama el estado.
 */
export function clearanceLabel(state: Exclude<ClearanceState, null>): string {
  return state === 'pending' ? CLEARANCE_COPY.pending.long : CLEARANCE_COPY.delivered.long
}

/** Lo que se ve cuando no cabe la frase entera (tabla y tarjeta del teléfono). */
export function clearanceShortLabel(state: Exclude<ClearanceState, null>): string {
  return state === 'pending' ? CLEARANCE_COPY.pending.short : CLEARANCE_COPY.delivered.short
}
