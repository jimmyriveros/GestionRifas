'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { nextListSort, type ListSort } from '@/lib/list-sort'

/**
 * La ordenacion vive en la URL, como los filtros y la pagina.
 *
 * Mismo patron que `DataTablePagination`: se escribe en `searchParams` y el
 * RSC vuelve a consultar. Asi el orden es compartible, sobrevive a un refresco
 * y —lo que de verdad importa— lo aplica la base sobre el conjunto filtrado
 * entero, no el navegador sobre las 25 filas que tenia a mano (P1-B).
 *
 * AL CAMBIAR EL ORDEN SE VUELVE A LA PAGINA 1. Es la unica respuesta
 * coherente: la pagina 7 del orden viejo no tiene nada que ver con la pagina 7
 * del nuevo, y quedarse ahi deja a la persona en un sitio que no pidio.
 *
 * LOS DOS PARAMETROS SE BORRAN AL VOLVER AL ORDEN POR DEFECTO, en vez de
 * escribir el valor por defecto. Una URL sin `sort` es la lista tal como la
 * sirve la consulta, y es la que se comparte el 99 % de las veces.
 */
export function useListSort(
  /**
   * `scroll: false` para una lista que no ocupa la pantalla entera (I-156): la
   * cabecera pulsada esta arriba de esa lista, y volver al principio de la
   * pagina dejaria a quien ordena lejos de lo que acaba de ordenar.
   */
  options: { scroll?: boolean } = {},
): {
  sort: ListSort | null
  /** Cabecera pulsada: recorre ascendente, descendente y vuelta al defecto. */
  toggle: (column: string) => void
  /**
   * Un orden CONCRETO, o `null` para volver al de siempre.
   *
   * Lo usa el control del telefono (D-215), donde no hay cabeceras que pulsar y
   * cada opcion nombra ya su columna y su sentido. Es la misma escritura en la
   * direccion que `toggle`, con las mismas reglas —se borra `page`, y el orden
   * por defecto no escribe parametros—, para que las dos formas de ordenar no
   * puedan separarse.
   */
  setSort: (next: ListSort | null) => void
  pending: boolean
} {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const rawColumn = searchParams.get('sort')
  // El servidor valida contra su lista blanca; aqui solo se transporta.
  const sort: ListSort | null =
    rawColumn === null
      ? null
      : { column: rawColumn, direction: searchParams.get('dir') === 'desc' ? 'desc' : 'asc' }

  function toggle(column: string) {
    setSort(nextListSort(sort, column))
  }

  function setSort(next: ListSort | null) {
    const params = new URLSearchParams(searchParams.toString())

    if (next === null) {
      params.delete('sort')
      params.delete('dir')
    } else {
      params.set('sort', next.column)
      // `asc` es el valor por defecto de la lectura: no hace falta escribirlo.
      if (next.direction === 'desc') params.set('dir', 'desc')
      else params.delete('dir')
    }

    params.delete('page')

    const query = params.toString()
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: options.scroll ?? true })
    })
  }

  return { sort, toggle, setSort, pending }
}
