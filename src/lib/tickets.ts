/**
 * Como se nombra una boleta delante de una persona (BR-N11).
 *
 * Vendedores y administradores identifican una boleta por sus numeros —«el
 * 1234 con el 5678», o «el 387» en una rifa de un solo numero (D-261)—, nunca
 * por su codigo interno, que lo genera el sistema y nadie memoriza. Ese codigo
 * sigue existiendo y sigue siendo el identificador administrativo, pero solo se
 * muestra dentro del detalle de la boleta.
 *
 * Vive en `lib/` y es una funcion PURA porque la necesitan tanto pantallas de
 * servidor como componentes de navegador, y tanto boletas como abonos. Escribir
 * «${daily} / ${weekly}» suelto en cada sitio es como se acaban teniendo cinco
 * formatos distintos para lo mismo.
 */

type TicketNumbers = {
  dailyNumber: string | null
  weeklyNumber: string | null
}

/**
 * Los numeros de una boleta, listos para mostrar: «1234 / 5678», o «387» si su
 * rifa tiene un solo numero (D-261): sin separador sobrante ni raya.
 *
 * `groupCount` es el de la rifa de la boleta. Sin el, una boleta sin segundo
 * numero se escribe con el suyo solo: en las pantallas que no lo pasan —abonos,
 * ventas del equipo, avisos, coincidencias— solo llegan boletas vendidas o
 * disponibles, que tienen todos sus numeros, asi que un segundo numero que
 * falta es que la rifa no lo tiene. Las listas que pueden traer BORRADORES lo
 * pasan siempre, para que un borrador a medias diga «0400 / —».
 *
 * Una boleta en borrador puede no tener ninguno todavia: en ese caso se dice, en
 * vez de pintar rayas que no explican nada.
 */
export function ticketLabel(
  { dailyNumber, weeklyNumber }: TicketNumbers,
  groupCount?: 1 | 2,
): string {
  if (dailyNumber === null && weeklyNumber === null) return 'Sin números'
  if (groupCount === 1 || (groupCount === undefined && weeklyNumber === null)) {
    return dailyNumber ?? '—'
  }
  return `${dailyNumber ?? '—'} / ${weeklyNumber ?? '—'}`
}
