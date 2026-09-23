import type { ListSortOption } from '@/components/data/ListSortSelect'
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
export const CLIENT_SORT_COLUMNS = [
  'name',
  'phone',
  'ticketsCount',
  'totalPurchased',
  'totalPaid',
  'pendingAmount',
  'archivedAt',
] as const

export type ClientSortColumn = (typeof CLIENT_SORT_COLUMNS)[number]

/**
 * Como se puede ordenar «Mis clientes» DESDE EL TELEFONO (I-155, D-215).
 *
 * Mismo criterio que en boletas: lo que la tarjeta ensena —nombre, telefono,
 * cuantas boletas y el saldo— y nada mas. «Comprado» y «Pagado» existen en la
 * tabla de escritorio pero la tarjeta no los pinta (`hideOnMobile`), asi que
 * ofrecerlos aqui seria ordenar por algo que no se ve.
 *
 * «Estado» tampoco: archivado o activo se decide con el interruptor «Incluir
 * archivados», que esta justo encima.
 *
 * El orden de siempre de esta lista es por NOMBRE, ascendente, asi que la
 * primera opcion lo dice tal cual en vez de llamarse «predeterminado». De paso
 * responde algo que la pantalla nunca habia contado: en que orden llegan.
 *
 * AQUI LA BUSQUEDA NO CAMBIA EL ORDEN, al reves que en boletas: el termino se
 * aplica como un `ilike` sobre la misma consulta y el `order by` sigue siendo
 * el mismo. Por eso esta lista no necesita una etiqueta de relevancia (D-216).
 */
/**
 * El orden de siempre de esta lista, ESCRITO (D-216, corregido).
 *
 * `listClients` ordena por `name` ascendente cuando nadie pide otra cosa, asi
 * que `?sort=name` y una direccion limpia dan exactamente la misma lista. El
 * control lo necesita para ensenar las dos igual; sin esto, `?sort=name` no
 * casaba con ninguna opcion —la del defecto vale `null`— y se quedaba sin
 * valor que mostrar.
 */
export const CLIENT_DEFAULT_SORT: ListSort = { column: 'name', direction: 'asc' }

export const CLIENT_SORT_OPTIONS: readonly ListSortOption[] = [
  { label: 'Nombre, de la A a la Z', sort: null },
  { label: 'Nombre, de la Z a la A', sort: { column: 'name', direction: 'desc' } },
  { label: 'Teléfono, de la A a la Z', sort: { column: 'phone', direction: 'asc' } },
  { label: 'Teléfono, de la Z a la A', sort: { column: 'phone', direction: 'desc' } },
  { label: 'Boletas, de más a menos', sort: { column: 'ticketsCount', direction: 'desc' } },
  { label: 'Boletas, de menos a más', sort: { column: 'ticketsCount', direction: 'asc' } },
  { label: 'Saldo, de mayor a menor', sort: { column: 'pendingAmount', direction: 'desc' } },
  { label: 'Saldo, de menor a mayor', sort: { column: 'pendingAmount', direction: 'asc' } },
]

/** Nombre de cada columna que la consulta acepta pero el telefono no ofrece. */
const OTHER_COLUMN_LABELS: Record<string, string> = {
  totalPurchased: 'Comprado',
  totalPaid: 'Pagado',
  archivedAt: 'Estado',
}

/**
 * Como se lee un orden que la consulta SI aplica y este control no ofrece
 * (D-216). Un enlace traido de la pantalla grande puede pedir «Comprado», y la
 * consulta lo aplica: el control lo dice en vez de caer al orden por defecto.
 */
export function describeClientSort(sort: ListSort): string | null {
  const name = OTHER_COLUMN_LABELS[sort.column]
  if (name === undefined) return null

  if (sort.column === 'archivedAt') {
    // `archived_at` es una fecha, y `nullsFirst: false` deja a los activos
    // —que no la tienen— siempre al final. Se dice por lo que se ve arriba.
    return sort.direction === 'asc'
      ? `${name}, primero los archivados`
      : `${name}, los archivados más recientes primero`
  }

  return sort.direction === 'desc'
    ? `${name}, de mayor a menor`
    : `${name}, de menor a mayor`
}
