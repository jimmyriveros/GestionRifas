import type { ListSortOption } from '@/components/data/ListSortSelect'

/**
 * Como se puede ordenar «Mis boletas» DESDE EL TELEFONO (I-155, D-215).
 *
 * QUE ENTRA. Lo que la tarjeta ensena y se puede decir con palabras claras: los
 * dos numeros, el cliente, y las cuatro cifras de dinero. Cada opcion nombra la
 * columna y el sentido, porque en el telefono no hay cabecera que pulsar dos
 * veces para darle la vuelta.
 *
 * QUE NO ENTRA, Y POR QUE. Los dos estados. Se FILTRAN desde «Filtros», a un
 * toque de aqui, y ordenar por un estado responde peor esa misma pregunta;
 * ademas no hay forma clara de decir su sentido —«de Borrador a Anulada» no lo
 * dice nadie—. Tampoco «Rifa» ni «Vendedor»: el vendedor opera una sola rifa y
 * todas las boletas son suyas, asi que esas dos columnas ni siquiera se pintan
 * en su portal (`showRaffle={false}`, `showSeller={false}`).
 *
 * Los nombres son los del glosario, los mismos que encabezan la tabla de
 * escritorio: «Boleta», «Cliente», «Falta», «Abonado», «Progreso», «Precio».
 * Las columnas salen de `TICKET_SORT_COLUMNS`, asi que ninguna opcion puede
 * pedir algo que la consulta no admita.
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
