import { ClientTicketCardList } from './ClientTicketCardList'
import { ClientTicketsTable } from './ClientTicketsTable'

import type { TicketListItem } from '../queries'

/**
 * «Boletas de este cliente»: UNA fuente de datos, DOS presentaciones.
 *
 *   listTickets({ clientId })  →  TicketListItem[]  →  ┬─ ClientTicketsTable
 *                                                      └─ ClientTicketCardList
 *
 * Mismo reparto que `TicketsList` y por las mismas razones: las dos reciben el
 * mismo arreglo —ya consultado en el servidor, sin una peticion por boleta— y
 * quien decide cual se ve es Tailwind, no JavaScript, para que al cargar no
 * parpadee ninguna. Lo oculto sale del arbol de accesibilidad, asi que un
 * lector de pantalla encuentra una sola lista.
 *
 * NO ES `TicketsList`. Comparten las cuentas (`ticketFinancials`), la insignia,
 * la barra y el formato del dinero, pero no la disposicion: esta lista enseña
 * tres boletas de una persona y aquella, veinticinco de una rifa (seccion 6 del
 * encargo).
 */

type ClientTicketsListProps = {
  tickets: TicketListItem[]
  /** `/owner/tickets` o `/seller/tickets`. */
  basePath: string
  /** Solo el portal administrativo: un cliente puede comprar en varias rifas. */
  showRaffle?: boolean
  /** Solo el portal administrativo, que ve la cartera de toda la organizacion. */
  showSeller?: boolean
  /** Se pasa a la tabla; la aplana cuando ya va dentro de una tarjeta. */
  className?: string
}

export function ClientTicketsList({ className, ...props }: ClientTicketsListProps) {
  return (
    <>
      <div className="px-2 pb-1 md:hidden">
        <ClientTicketCardList {...props} />
      </div>
      <div className="hidden md:block">
        <ClientTicketsTable {...props} className={className} />
      </div>
    </>
  )
}
