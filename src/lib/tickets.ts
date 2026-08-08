/**
 * Como se nombra una boleta delante de una persona (BR-N11).
 *
 * Vendedores y administradores identifican una boleta por sus DOS numeros —«el
 * 1234 con el 5678»—, nunca por su codigo interno, que lo genera el sistema y
 * nadie memoriza. Ese codigo sigue existiendo y sigue siendo el identificador
 * administrativo, pero solo se muestra dentro del detalle de la boleta.
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
 * Los dos numeros de una boleta, listos para mostrar: «1234 / 5678».
 *
 * Una boleta en borrador puede no tenerlos todavia: en ese caso se dice, en vez
 * de pintar dos rayas que no explican nada.
 */
export function ticketLabel({ dailyNumber, weeklyNumber }: TicketNumbers): string {
  if (dailyNumber === null && weeklyNumber === null) return 'Sin números'
  return `${dailyNumber ?? '—'} / ${weeklyNumber ?? '—'}`
}
