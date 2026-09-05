import type { ClientOption } from '@/features/clients/queries'
import { ticketLabel } from '@/lib/tickets'

import { canReassignClient } from '../reassign-client'
import { canReleaseTicket, ticketClientNotice, type ReleaseEligibility } from '../release-ticket'

import { ReassignTicketClientDialog } from './ReassignTicketClientDialog'
import { ReleaseTicketDialog } from './ReleaseTicketDialog'

type TicketClientActionsProps = {
  ticket: ReleaseEligibility & {
    id: string
    dailyNumber: string | null
    weeklyNumber: string | null
    clientName: string | null
    clientPhone: string | null
  }
  /** Primer bloque de la cartera del vendedor de la boleta, ya acotado en SQL. */
  clients: ClientOption[]
}

/**
 * Lo que se puede hacer con el cliente de una boleta, bajo su tarjeta.
 *
 * Se monta SOLO cuando `hasTicketClientActions` dice que hay algo que pintar: un
 * elemento de React siempre es «verdadero» aunque no pinte nada, y
 * `ClientLinkCard` cambia su árbol de HTML en cuanto recibe una `action`.
 *
 * Ocupa la ranura `action` de `ClientLinkCard` (D-168) en los DOS portales: la
 * regla y el aspecto son los mismos para el vendedor y para el personal, y lo
 * unico que cambia entre ellos —la cartera que se ofrece— ya viene resuelto en
 * `clients`. Se comparte en vez de repetirse en cada `page.tsx` (`AGENTS.md`
 * §6): antes vivia suelto y las dos paginas ya habian empezado a envolverlo con
 * clases distintas.
 *
 * Puede haber dos botones, uno, o ninguno con un aviso en su lugar. Nunca dos
 * avisos: la explicacion la elige `ticketClientNotice`, que escribe UNA frase
 * por causa, no una por accion (D-169).
 */
export function TicketClientActions({
  ticket,
  clients,
}: TicketClientActionsProps): React.ReactNode {
  const canReassign = canReassignClient(ticket)
  const canRelease = canReleaseTicket(ticket)
  const notice = ticketClientNotice(ticket)

  if (!canReassign && !canRelease) {
    return notice ? <p className="text-muted-foreground px-1 text-sm">{notice}</p> : null
  }

  // BR-N11: la boleta se nombra por sus dos numeros, y con la MISMA funcion que
  // el resto de la aplicacion.
  const numbers = ticketLabel(ticket)

  return (
    <div className="space-y-2">
      {/* En el telefono, uno debajo de otro y a lo ancho: son dos dianas de
          44 px. Desde `sm` comparten fila con su ancho natural. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canReassign && ticket.clientId ? (
          <ReassignTicketClientDialog
            ticketId={ticket.id}
            ticketNumbers={numbers}
            currentClientId={ticket.clientId}
            currentClientName={ticket.clientName ?? 'Cliente'}
            currentClientPhone={ticket.clientPhone}
            clients={clients}
          />
        ) : null}
        {canRelease && ticket.clientId ? (
          <ReleaseTicketDialog
            ticketId={ticket.id}
            ticketNumbers={numbers}
            dailyNumber={ticket.dailyNumber}
            weeklyNumber={ticket.weeklyNumber}
            currentClientId={ticket.clientId}
            currentClientName={ticket.clientName ?? 'Cliente'}
          />
        ) : null}
      </div>
      {notice ? <p className="text-muted-foreground px-1 text-sm">{notice}</p> : null}
    </div>
  )
}
