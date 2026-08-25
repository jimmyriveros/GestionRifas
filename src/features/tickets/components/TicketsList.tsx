import { tourTarget } from '@/features/tour/tours'

import { TicketCardList } from './TicketCardList'
import { TicketsTable } from './TicketsTable'

import type { TicketListItem } from '../queries'

/**
 * La lista de boletas: UNA fuente de datos, DOS presentaciones (D-107).
 *
 *   listTickets()  →  TicketListItem[]  →  ┬─ TicketsTable    (escritorio)
 *                                          └─ TicketCardList  (telefono)
 *
 * Las dos reciben exactamente el mismo arreglo, ya filtrado, ordenado y
 * paginado en el servidor. No hay una consulta para el telefono y otra para el
 * escritorio, ni una peticion por tarjeta: si la tabla puede pintar el cliente,
 * el estado de pago y el precio, la tarjeta tambien, porque son el mismo dato.
 *
 * QUIEN DECIDE CUAL SE VE: Tailwind, no JavaScript. Las dos se renderizan y el
 * navegador oculta una con `display:none` antes de que exista JavaScript, asi
 * que al cargar no parpadea ninguna. Es el mismo criterio que ya seguian
 * `hideOnMobile` y la barra de navegacion inferior, y el que pide
 * `lib/use-media-query.ts`: la consulta de medios decide COMPORTAMIENTO —si
 * tocar marca o abre—, nunca lo que se ve.
 *
 * Lo oculto tampoco molesta a quien no ve la pantalla: `display:none` lo saca
 * del arbol de accesibilidad, de modo que un lector de pantalla encuentra una
 * sola lista de boletas, no dos.
 */

type TicketsListProps = {
  tickets: TicketListItem[]
  /** `/owner/tickets` o `/seller/tickets`: la lista sirve a los dos portales. */
  basePath?: string
  /** El vendedor no necesita el vendedor: todas las boletas son suyas. */
  showSeller?: boolean
  /** Se oculta donde se opera una sola rifa: el portal del vendedor (D-088). */
  showRaffle?: boolean
  /** Se apaga en la ficha de UN cliente: ahi todas las boletas son suyas (D-113). */
  showClient?: boolean
  /** Se pasa a las dos presentaciones; aplana el borde dentro de una tarjeta. */
  className?: string
}

export function TicketsList(props: TicketsListProps) {
  return (
    /*
      El recorrido guiado apunta aqui, al envoltorio, y no a cada presentacion.
      `DataTable` marca su propio contenedor con el mismo nombre, pero el
      recorrido busca el PRIMERO del documento y este esta por encima: asi el
      paso «tus boletas» resalta lo que de verdad se ve, sea la tabla o las
      tarjetas. Si el nombre se pusiera en una de las dos, la otra pantalla
      apuntaria a un elemento oculto —de 0 x 0 px— y el paso desapareceria del
      recorrido sin que nadie se enterara (`usableSteps`).
    */
    <div {...tourTarget('data-table')}>
      <div className="md:hidden">
        <TicketCardList {...props} />
      </div>
      <div className="hidden md:block">
        <TicketsTable {...props} />
      </div>
    </div>
  )
}
