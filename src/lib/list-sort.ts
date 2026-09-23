/**
 * La ordenacion de una lista larga: que columna, en que sentido, y quien tiene
 * permiso para pedirla (P1-B).
 *
 * EL PROBLEMA QUE RESUELVE. `DataTable` ordenaba en el navegador las filas que
 * ya tenia —las 25 de la pagina servida— y la cabecera lo anunciaba con
 * `aria-sort`, como si fuera el orden del conjunto. Medido en local: ordenando
 * «Abonado» de mayor a menor, la pantalla ensenaba $1.000 como maximo cuando el
 * maximo real eran $120.000. No era una imprecision: era una respuesta falsa a
 * la pregunta «cual es el mas grande».
 *
 * POR QUE VIVE AQUI. Es logica pura —texto entra, orden validado sale— y la
 * comparten siete listas de los dos portales. Las reglas se prueban sin
 * navegador (tests/unit/list-sort.test.ts), como `row-activation.ts`.
 *
 * LA LISTA BLANCA NO ES UNA FORMALIDAD. El nombre de la columna acaba en un
 * `order by` de la base, asi que lo que no este en la lista no se pide. Y la
 * lista es DISTINTA por audiencia: la de las boletas del personal no puede
 * contener cliente, precio, abonado ni saldo, porque el personal no los ve
 * (D-198, BR-Q01). Una lista compartida seria una puerta trasera a la cartera.
 */

export type SortDirection = 'asc' | 'desc'

export type ListSort<Column extends string = string> = {
  column: Column
  direction: SortDirection
}

/**
 * Lo que llega de la URL, convertido en un orden que se puede pedir, o `null`.
 *
 * `null` significa «usa el orden por defecto de la lista», que cada consulta ya
 * tiene y que NO se cambia: sin buscar, las boletas siguen saliendo por fecha
 * de creacion descendente, los clientes por nombre y los pagos por fecha.
 *
 * Un valor desconocido NO es un error: se ignora y se cae al orden por defecto.
 * Una URL vieja, un enlace compartido o alguien escribiendo a mano no deben
 * romper la pantalla, y tampoco deben poder nombrar una columna que su rol no
 * tiene permitido leer.
 */
export function parseListSort<Column extends string>(
  rawColumn: string | undefined,
  rawDirection: string | undefined,
  allowed: readonly Column[],
): ListSort<Column> | null {
  if (rawColumn === undefined) return null

  const column = allowed.find((candidate) => candidate === rawColumn)
  if (column === undefined) return null

  return { column, direction: rawDirection === 'desc' ? 'desc' : 'asc' }
}

/**
 * El siguiente paso del ciclo al pulsar una cabecera: ascendente, descendente
 * y de vuelta al orden por defecto.
 *
 * Tres estados y no dos, para que se pueda DESHACER. Con solo dos, quien
 * ordena por «Cliente» ya no puede volver a ver lo mas reciente primero sin
 * saber que hay que borrar un parametro de la direccion.
 */
export function nextListSort<Column extends string>(
  current: ListSort<Column> | null,
  column: Column,
): ListSort<Column> | null {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

/** Lo que `aria-sort` debe decir de una cabecera. */
export function ariaSortFor<Column extends string>(
  current: ListSort<Column> | null,
  column: Column,
): 'ascending' | 'descending' | 'none' {
  if (current === null || current.column !== column) return 'none'
  return current.direction === 'asc' ? 'ascending' : 'descending'
}
