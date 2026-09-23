import 'server-only'

import { PAGE_SIZE } from '@/lib/constants'

import type { ListSort } from './list-sort'

/**
 * Ordenar y paginar EN EL SERVIDOR una lista que ya esta completa (P1-H).
 *
 * POR QUE EXISTE. Vendedores, Rifas y Administradores no se leen de una sola
 * consulta: cada fila se arma cruzando dos fuentes —los miembros de la
 * organizacion y el inventario contado por SQL, una fila por (rifa, vendedor)—.
 * Ese cruce se resuelve en el servidor, asi que no hay un `order by` ni un
 * `limit` que empujar a PostgREST sin escribir antes una funcion nueva.
 *
 * Lo que SI se arregla aqui, que es el defecto que se reporto:
 *
 *   * las tres pantallas enviaban al navegador TODAS las filas y no tenian
 *     paginacion; ahora viaja una pagina;
 *   * ordenar una cabecera reacomodaba lo que hubiera en pantalla; ahora el
 *     orden es del conjunto entero, antes de cortar la pagina;
 *   * y el corte de PostgREST en 1.000 filas dejaba de leerse sin avisar; las
 *     dos consultas que lo alimentan pasan por `fetchAllRows` (I-011).
 *
 * LO QUE NO HACE, y hay que decirlo: el orden y el corte ocurren sobre filas
 * que el servidor ya tiene en memoria. Es correcto y acotado —una organizacion
 * tiene decenas de vendedores y de rifas, no cientos de miles—, pero no es lo
 * mismo que un `limit` en SQL. Si alguna de las tres creciera a miles de filas,
 * lo que toca es una funcion que agregue y pagine en la base, no subir el tope
 * de aqui. Queda anotado en KNOWN_ISSUES.
 *
 * UNA PAGINA FUERA DE RANGO devuelve cero filas y el total de verdad, igual que
 * hacen las listas que si paginan en PostgREST: asi la barra sigue diciendo
 * cuantas hay y el camino de vuelta es cambiar de pagina.
 */

/** Como se compara una columna. Lo que no este aqui no se puede ordenar. */
export type ListComparators<T> = Record<string, (a: T, b: T) => number>

export type PagedList<T> = {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

/** Texto en español: «Ángela» va antes que «Beatriz», no despues de «Zoe». */
export function compareText(a: string | null, b: string | null): number {
  return (a ?? '').localeCompare(b ?? '', 'es', { sensitivity: 'base', numeric: true })
}

/** Numeros, con los nulos SIEMPRE al final, como `nullsFirst: false` en SQL. */
export function compareNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

/** Fechas en texto ISO; los nulos, al final. */
export function compareDate(a: string | null, b: string | null): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Booleanos: `true` primero en ascendente. Sirve para «Estado». */
export function compareBoolean(a: boolean, b: boolean): number {
  return a === b ? 0 : a ? -1 : 1
}

export function sortAndPaginate<T>(
  rows: readonly T[],
  options: {
    sort: ListSort | null
    page: number
    comparators: ListComparators<T>
    /**
     * Desempate final, SIEMPRE. Sin el, dos vendedores que se llamen igual
     * pueden cambiar de pagina entre dos visitas: uno se veria dos veces y el
     * otro ninguna. Es el mismo `id` que cierra el `order by` de las listas
     * que paginan en la base.
     */
    tiebreak: (row: T) => string
    pageSize?: number
  },
): PagedList<T> {
  const pageSize = options.pageSize ?? PAGE_SIZE
  const page = Math.max(1, options.page)

  const comparator = options.sort ? options.comparators[options.sort.column] : undefined

  /*
    Sin orden pedido —o con uno que esta fuera de la lista blanca— se conserva
    el orden con el que llego la lista, que es el de siempre de cada pantalla:
    los miembros por antigüedad, las rifas por codigo descendente. Ese orden ya
    viene desempatado por el `id` desde la consulta, asi que no hace falta
    volver a tocarlo aqui.
  */
  const ordered = comparator
    ? [...rows].sort((a, b) => {
        const diff = comparator(a, b)
        const signed = options.sort?.direction === 'desc' ? -diff : diff
        return signed !== 0 ? signed : options.tiebreak(a).localeCompare(options.tiebreak(b))
      })
    : rows

  const from = (page - 1) * pageSize

  return {
    rows: ordered.slice(from, from + pageSize),
    total: rows.length,
    page,
    pageSize,
  }
}
