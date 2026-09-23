import type { ListSortOption } from '@/components/data/ListSortSelect'
import {
  TICKET_INVENTORY_STATUS_LABELS,
  TICKET_INVENTORY_STATUS_VALUES,
  TICKET_PAYMENT_STATUS_LABELS,
  TICKET_PAYMENT_STATUS_VALUES,
} from '@/lib/constants'
import type { ListSort } from '@/lib/list-sort'

/**
 * Las columnas que LA CONSULTA acepta. Viven aqui, y no en `queries.ts`, porque
 * el control del telefono las necesita y es un componente de CLIENTE: `queries`
 * empieza con `server-only` y arrastra `next/headers`, asi que importarlo desde
 * el navegador rompe la pantalla entera (D-216). `queries.ts` las reexporta,
 * para que quien las pedia siga pidiendolas donde estaban.
 *
 * Son los `id` de las columnas de su tabla, para que la cabecera pulsada y el
 * parametro de la URL sean el mismo nombre. La lista del PERSONAL es otra y
 * vive en `admin-queries.ts`: alli no puede haber ni cliente ni dinero (D-198).
 */
export const TICKET_SORT_COLUMNS = [
  'dailyNumber',
  'raffleShortCode',
  'sellerName',
  'clientName',
  'inventoryStatus',
  'paymentStatus',
  'paidAmount',
  'pendingAmount',
  'percentage',
  'salePrice',
] as const

export type TicketSortColumn = (typeof TICKET_SORT_COLUMNS)[number]

/**
 * Como se puede ordenar «Mis boletas» DESDE EL TELEFONO (I-155, D-215).
 *
 * QUE ENTRA. Lo que la tarjeta ensena y se puede decir con palabras claras: los
 * dos numeros, el cliente, y las cuatro cifras de dinero. Cada opcion nombra la
 * columna y el sentido, porque en el telefono no hay cabecera que pulsar dos
 * veces para darle la vuelta.
 *
 * QUE NO ENTRA, Y POR QUE. Los dos estados. Se FILTRAN desde «Filtros», a un
 * toque de aqui, y ordenar por un estado responde peor esa misma pregunta.
 * Tampoco «Rifa» ni «Vendedor»: el vendedor opera una sola rifa y todas las
 * boletas son suyas, asi que esas dos columnas ni siquiera se pintan en su
 * portal (`showRaffle={false}`, `showSeller={false}`).
 *
 * OFRECER MENOS NO ES PODER MENOS, y de ahi sale `describeTicketSort` (D-216).
 * La consulta acepta las diez columnas de `TICKET_SORT_COLUMNS`; el telefono
 * ofrece seis. Un enlace traido de la pantalla grande —o guardado— puede pedir
 * una de las otras cuatro, y la consulta la aplica. El control tiene que
 * DECIRLO, no caer al orden por defecto: anunciar «Más recientes primero»
 * mientras la lista sale por rifa es exactamente la clase de mentira que
 * D-213 vino a quitar de la tabla.
 *
 * Los nombres son los del glosario, los mismos que encabezan la tabla de
 * escritorio.
 */
export const TICKET_SORT_OPTIONS: readonly ListSortOption[] = [
  // El orden de siempre de la lista: `created_at` descendente. Se dice por lo
  // que hace, no como «predeterminado», que no explica nada.
  { label: 'Más recientes primero', sort: null },
  { label: 'Boleta, de menor a mayor', sort: { column: 'dailyNumber', direction: 'asc' } },
  { label: 'Boleta, de mayor a menor', sort: { column: 'dailyNumber', direction: 'desc' } },
  { label: 'Cliente, de la A a la Z', sort: { column: 'clientName', direction: 'asc' } },
  { label: 'Cliente, de la Z a la A', sort: { column: 'clientName', direction: 'desc' } },
  { label: 'Falta, de mayor a menor', sort: { column: 'pendingAmount', direction: 'desc' } },
  { label: 'Falta, de menor a mayor', sort: { column: 'pendingAmount', direction: 'asc' } },
  { label: 'Abonado, de mayor a menor', sort: { column: 'paidAmount', direction: 'desc' } },
  { label: 'Abonado, de menor a mayor', sort: { column: 'paidAmount', direction: 'asc' } },
  { label: 'Progreso, de mayor a menor', sort: { column: 'percentage', direction: 'desc' } },
  { label: 'Progreso, de menor a mayor', sort: { column: 'percentage', direction: 'asc' } },
  { label: 'Precio, de mayor a menor', sort: { column: 'salePrice', direction: 'desc' } },
  { label: 'Precio, de menor a mayor', sort: { column: 'salePrice', direction: 'asc' } },
]

/**
 * El orden por defecto CAMBIA cuando se busca (D-216).
 *
 * Con termino de busqueda y sin columna pedida, «Mis boletas» no sale por fecha
 * sino por RELEVANCIA: `search_tickets` pone primero la coincidencia exacta del
 * numero diario, despues la del semanal, y con un nombre, el cliente cuyo
 * nombre completo coincide antes que aquel en quien la coincidencia es suelta.
 *
 * Es el mismo orden que ya tenia la pantalla; lo que faltaba era decirlo. Y hay
 * que decirlo tambien en la primera opcion, porque «restablecer el orden»
 * durante una busqueda devuelve AHI, no a la fecha.
 */
export const TICKET_RELEVANCE_LABEL = 'Las que mejor coinciden'

export function ticketDefaultSortLabel(searching: boolean): string {
  return searching ? TICKET_RELEVANCE_LABEL : 'Más recientes primero'
}

/** Nombre de cada columna que la consulta acepta pero el telefono no ofrece. */
const OTHER_COLUMN_LABELS: Record<string, string> = {
  raffleShortCode: 'Rifa',
  sellerName: 'Vendedor',
  inventoryStatus: 'Estado de la boleta',
  paymentStatus: 'Estado de pago',
}

/**
 * Como se lee un orden que la consulta SI aplica y este control no ofrece.
 *
 * Los estados se describen por su primera etiqueta —«primero Borrador»,
 * «primero Anulada»— y no con «de la A a la Z», que seria falso: su orden es el
 * de la lista de valores, no el alfabetico. Es lo que hacia imposible
 * OFRECERLOS con palabras claras, y aqui no estorba: describir uno que ya esta
 * puesto es mas facil que invitar a ponerlo.
 */
export function describeTicketSort(sort: ListSort): string | null {
  const name = OTHER_COLUMN_LABELS[sort.column]
  if (name === undefined) return null

  // El primer valor del enumerado con `asc`, el ultimo con `desc`: es el orden
  // en que PostgreSQL los compara, que es el de su declaracion.
  const edge = <T,>(values: readonly T[]): T | undefined =>
    sort.direction === 'asc' ? values[0] : values[values.length - 1]

  if (sort.column === 'inventoryStatus') {
    const first = edge(TICKET_INVENTORY_STATUS_VALUES)
    return first === undefined ? name : `${name}, primero ${TICKET_INVENTORY_STATUS_LABELS[first]}`
  }

  if (sort.column === 'paymentStatus') {
    const first = edge(TICKET_PAYMENT_STATUS_VALUES)
    return first === undefined ? name : `${name}, primero ${TICKET_PAYMENT_STATUS_LABELS[first]}`
  }

  return sort.direction === 'asc' ? `${name}, de la A a la Z` : `${name}, de la Z a la A`
}
