import type { ListSortOption } from '@/components/data/ListSortSelect'

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
 */
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
