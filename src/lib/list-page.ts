/**
 * La forma de una lista paginada: las filas de una pagina y cuantas hay en
 * total.
 *
 * QUE HUBO AQUI ANTES, Y POR QUE YA NO. Entre D-213 y D-214 este modulo
 * contenia `sortAndPaginate`: Vendedores, Rifas y Administradores leian su
 * lista entera con `fetchAllRows` y la ordenaban y recortaban en el servidor,
 * porque cada fila cruza dos fuentes —los miembros de la organizacion y el
 * inventario contado en SQL— y no habia una relacion sobre la que empujar un
 * `order by` y un `limit`.
 *
 * D-214 creo esa relacion: `v_org_member_list` para los miembros y las
 * funciones `admin_list_sellers` y `admin_list_raffles` para las dos que
 * cuentan boletas —que el personal no puede leer, porque `tickets_select` solo
 * devuelve las del propio vendedor—. Con eso, ordenar y paginar volvio a ser
 * trabajo de PostgreSQL y el ayudante se quedo sin uso.
 *
 * Lo unico que sobrevive es el TIPO, que describe lo que devuelven esas tres
 * lecturas y las que ya paginaban por PostgREST.
 */
export type PagedList<T> = {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

/**
 * Una pagina que no existe: la 99 de una lista que tiene tres.
 *
 * PASA DE VERDAD —una direccion guardada, un enlace compartido, un filtro que
 * ahora devuelve menos filas— y hasta D-214 cada lista respondia una cosa
 * distinta:
 *
 *   * las que paginan por PostgREST con `count: 'exact'` respondian **416**
 *     (`PGRST103`), que llegaba a la pantalla como «Algo salió mal»;
 *   * las que paginan por una funcion devolvian cero filas y, con ellas, un
 *     total de **0**, porque el recuento viaja repetido en cada fila: la barra
 *     decia «0–0 de 0 boletas» en una lista que si tiene boletas.
 *
 * Las dos eran anteriores a este trabajo. Ahora las dos responden lo mismo:
 * CERO FILAS Y EL TOTAL DE VERDAD, que es lo que deja ver cuantas hay y volver
 * a una pagina que exista.
 */
export function pageBeyondEnd(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST103'
}
