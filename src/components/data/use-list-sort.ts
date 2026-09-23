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
export function useListSort(): {
  sort: ListSort | null
  toggle: (column: string) => void
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
    const next = nextListSort(sort, column)
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
      router.push(query ? `${pathname}?${query}` : pathname)
    })
  }

  return { sort, toggle, pending }
}
