import type { ListSortOption } from '@/components/data/ListSortSelect'
import {
  ADMIN_TICKET_PAYMENT_STATE_LABELS,
  ADMIN_TICKET_PAYMENT_STATE_VALUES,
  TICKET_INVENTORY_STATUS_LABELS,
  TICKET_INVENTORY_STATUS_VALUES,
  TICKET_PAYMENT_STATUS_LABELS,
  TICKET_PAYMENT_STATUS_VALUES,
} from '@/lib/constants'
import type { ListSort } from '@/lib/list-sort'

import { clearanceShortLabel } from './clearance-receipt'

/**
 * Las columnas que LA CONSULTA acepta. Viven aqui, y no en `queries.ts`, porque
 * el control del telefono las necesita y es un componente de CLIENTE: `queries`
 * empieza con `server-only` y arrastra `next/headers`, asi que importarlo desde
 * el navegador rompe la pantalla entera (D-216). `queries.ts` las reexporta,
 * para que quien las pedia siga pidiendolas donde estaban.
 *
 * Son los `id` de las columnas de su tabla, para que la cabecera pulsada y el
 * parametro de la URL sean el mismo nombre. La lista del PERSONAL es otra
 * —`ADMIN_TICKET_SORT_COLUMNS`, mas abajo—: alli no puede haber ni cliente ni
 * dinero (D-198).
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

/* ---------------------------------------------------------------------------
 * PORTAL DEL PERSONAL (I-155 en «Boletas» del Dueño y del Administrador)
 * ------------------------------------------------------------------------- */

/**
 * Las columnas por las que el PERSONAL puede pedir orden (P1-B).
 *
 * Es mas corta que la del vendedor (`TICKET_SORT_COLUMNS`) y lo es a proposito:
 * aqui no hay cliente ni dinero, y ordenar por una columna es preguntar por
 * ella. Ordenar por saldo y mirar la primera fila diria quien debe mas sin que
 * ninguna celda lo escriba, asi que la privacidad de D-198 vale tambien para el
 * orden, no solo para lo que se pinta.
 *
 * Desde D-214 «Vendedor» SI esta: la funcion se une a `profiles` para poder
 * ordenar por el nombre. Sigue sin proyectarlo —la fila devuelta no cambia— y
 * sigue sin ser un dato de cliente.
 *
 * La lista se repite en SQL, dentro de `admin_list_tickets` (migracion 0076):
 * la pantalla no es una frontera de seguridad (CLAUDE.md 26). Vive aqui y no en
 * `admin-queries.ts` porque el control del telefono es un componente de
 * cliente y aquel archivo es `server-only` (misma razon que D-216).
 */
export const ADMIN_TICKET_SORT_COLUMNS = [
  'dailyNumber',
  'raffleShortCode',
  'sellerName',
  'inventoryStatus',
  'paymentState',
  'clearance',
] as const

export type AdminTicketSortColumn = (typeof ADMIN_TICKET_SORT_COLUMNS)[number]

/**
 * Como se puede ordenar «Boletas» del personal DESDE EL TELEFONO (I-155).
 *
 * Lo que la tarjeta del personal ensena (`StaffCardBody`) y se dice con
 * palabras claras: la boleta, la rifa y el vendedor. Salen de
 * `ADMIN_TICKET_SORT_COLUMNS`, asi que ninguna opcion puede pedir cliente ni
 * dinero: esa lista no los tiene (D-198). Una prueba unitaria lo vigila.
 *
 * QUE NO ENTRA, igual que en el vendedor (D-215): los dos ESTADOS, que se
 * filtran desde «Filtros», y el PAZ Y SALVO, que tampoco se ofrece en la
 * cabecera de la tabla de escritorio (`enableSorting: false`). Si llegan por la
 * direccion, el control los DESCRIBE con `describeStaffTicketSort` (D-216).
 *
 * «Rifa» y «Vendedor» SI entran, al reves que en «Mis boletas»: el personal
 * trabaja con todas las rifas y todos los vendedores, y la tarjeta escribe los
 * dos en su segunda linea.
 */
export const STAFF_TICKET_SORT_OPTIONS: readonly ListSortOption[] = [
  // `created_at` descendente, igual que `admin_list_tickets` sin busqueda.
  { label: 'Más recientes primero', sort: null },
  { label: 'Boleta, de menor a mayor', sort: { column: 'dailyNumber', direction: 'asc' } },
  { label: 'Boleta, de mayor a menor', sort: { column: 'dailyNumber', direction: 'desc' } },
  { label: 'Rifa, de la A a la Z', sort: { column: 'raffleShortCode', direction: 'asc' } },
  { label: 'Rifa, de la Z a la A', sort: { column: 'raffleShortCode', direction: 'desc' } },
  { label: 'Vendedor, de la A a la Z', sort: { column: 'sellerName', direction: 'asc' } },
  { label: 'Vendedor, de la Z a la A', sort: { column: 'sellerName', direction: 'desc' } },
]

/**
 * El primero y el ultimo de una lista de valores ordenada COMO TEXTO.
 *
 * `admin_list_tickets` ordena los estados con `::text` —el estado de la boleta
 * como `inventory_status::text`, y el de pago y el paz y salvo como las
 * palabras internas que calcula—, no por el orden de declaracion del enumerado
 * como hace la vista del vendedor. Asi que aqui «primero» es el alfabetico de
 * los valores internos: `assigned` antes que `draft`. Comprobado contra la base
 * local el 2026-09-23 y fijado por E2E (`orden-personal-movil.spec.ts`).
 */
function textEdge<T extends string>(
  values: readonly T[],
  direction: ListSort['direction'],
): T | undefined {
  const sorted = [...values].sort()
  return direction === 'asc' ? sorted[0] : sorted[sorted.length - 1]
}

/**
 * Como se lee un orden que `admin_list_tickets` SI aplica y el telefono del
 * personal no ofrece: los dos estados y el paz y salvo.
 *
 * Las boletas SIN VENDER no tienen estado de pago ni paz y salvo: la consulta
 * las deja al final en los dos sentidos (`nulls last`), y por eso la frase
 * habla solo de cual va primero.
 */
export function describeStaffTicketSort(sort: ListSort): string | null {
  if (sort.column === 'inventoryStatus') {
    const first = textEdge(TICKET_INVENTORY_STATUS_VALUES, sort.direction)
    return first === undefined
      ? null
      : `Estado de la boleta, primero ${TICKET_INVENTORY_STATUS_LABELS[first]}`
  }

  if (sort.column === 'paymentState') {
    const first = textEdge(ADMIN_TICKET_PAYMENT_STATE_VALUES, sort.direction)
    return first === undefined
      ? null
      : `Estado de pago, primero ${ADMIN_TICKET_PAYMENT_STATE_LABELS[first]}`
  }

  if (sort.column === 'clearance') {
    // `assumed` y `delivered` dicen lo mismo en pantalla —«Entregado»— y van
    // juntos: `assumed` < `delivered` < `pending`.
    const first = textEdge(['assumed', 'delivered', 'pending'] as const, sort.direction)
    return first !== undefined ? `Paz y salvo, primero ${clearanceShortLabel(first)}` : null
  }

  return null
}
