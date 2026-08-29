import { tourTarget } from '@/features/tour/tours'

import { ClientCardList } from './ClientCardList'
import { ClientsTable } from './ClientsTable'

import type { ClientListItem } from '../queries'

/**
 * La lista de clientes: UNA fuente de datos, DOS presentaciones (D-136).
 *
 *   listClients()  →  ClientListItem[]  →  ┬─ ClientsTable    (escritorio)
 *                                          └─ ClientCardList  (telefono)
 *
 * Las dos reciben exactamente el mismo arreglo, ya filtrado, ordenado y
 * paginado en el servidor. No hay una consulta para el telefono y otra para el
 * escritorio, ni una peticion por tarjeta: si la tabla puede pintar el nombre,
 * el celular, las boletas y el saldo, la tarjeta tambien, porque son el mismo
 * dato.
 *
 * QUIEN DECIDE CUAL SE VE: Tailwind, no JavaScript. Las dos se renderizan y el
 * navegador oculta una con `display:none` antes de que exista JavaScript, asi
 * que al cargar no parpadea ninguna. Es el mismo criterio que ya seguian
 * `TicketsList` (D-107) y la barra de navegacion inferior, y el que pide
 * `lib/use-media-query.ts`: la consulta de medios decide COMPORTAMIENTO, nunca
 * lo que se ve.
 *
 * Lo oculto tampoco molesta a quien no ve la pantalla: `display:none` lo saca
 * del arbol de accesibilidad, de modo que un lector de pantalla encuentra una
 * sola lista de clientes, no dos. Lo que deja de estar «activo» en el DOM es
 * el layout y la accesibilidad, no el HTML: pintar las 25 filas dos veces es
 * el mismo coste que ya paga «Mis boletas», y evita un efecto que midiera el
 * ancho.
 *
 * El recorrido guiado apunta aqui, al envoltorio, y no a cada presentacion.
 * `DataTable` marca su propio contenedor con el mismo nombre, pero el
 * recorrido busca el PRIMERO del documento y este esta por encima: asi el
 * paso «tus clientes» resalta lo que de verdad se ve.
 */

type ClientsListProps = {
  clients: ClientListItem[]
  /** `/owner/clients` o `/seller/clients`: la lista sirve a los dos portales. */
  basePath: string
  /** El vendedor no necesita una columna «Vendedor»: todos son suyos. */
  showSeller?: boolean
}

export function ClientsList(props: ClientsListProps) {
  return (
    <div {...tourTarget('data-table')}>
      <div className="md:hidden">
        <ClientCardList {...props} />
      </div>
      <div className="hidden md:block">
        <ClientsTable {...props} />
      </div>
    </div>
  )
}
