import { InfoIcon } from 'lucide-react'

import { Notice } from '@/components/feedback/Notice'
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
 *
 * EL AVISO ES UN `Notice` INFORMATIVO (D-231). Explica una situacion de la
 * pantalla mientras su condicion sea cierta —por que no estan los botones—, que
 * es justo la responsabilidad de ese componente. Era un parrafo gris suelto; en
 * Figma es un aviso con icono. `compact`, porque vive dentro de una tarjeta.
 */
export function TicketClientActions({
  ticket,
  clients,
}: TicketClientActionsProps): React.ReactNode {
  const canReassign = canReassignClient(ticket)
  const canRelease = canReleaseTicket(ticket)
  const notice = ticketClientNotice(ticket)
  const noticeNode = notice ? (
    <Notice tone="info" density="compact" icon={<InfoIcon />}>
      {notice}
    </Notice>
  ) : null

  if (!canReassign && !canRelease) {
    return noticeNode
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
      {noticeNode}
    </div>
  )
}
