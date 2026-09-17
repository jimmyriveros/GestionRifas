/**
 * Los premios que el NEGOCIO reconoce sobre coincidencias que el motor no puede
 * premiar (D-208, respuesta H1 del dueño).
 *
 * POR QUÉ EXISTE ESTO, Y POR QUÉ NO ES UN PARCHE
 *
 * Los dos primeros premios de la operación real salieron de sorteos cuyo corte
 * es anterior al instante efectivo de la transición, así que conservan el
 * sistema de premios de siempre (D-206, BR-J13) y `lottery_ticket_match_prizes`
 * **no puede** tener una fila para ellos: el disparador de comprobación valida
 * los enlaces contra el motor configurable. Cuánto valía ese premio es
 * conocimiento del negocio, no un dato que la base pueda deducir.
 *
 * El dueño lo confirmó: los dos corresponden al **Premio diario**, $500.000
 * cada uno. Esa confirmación es el respaldo, y viaja con cada fila en `basis`.
 *
 * LO QUE ESTO NO DICE. No dice que las versiones publicadas el 17/09 se apliquen
 * hacia atrás: no se aplican, y por eso la fila no lleva `prize_version_id`. No
 * registra entrega, desembolso ni comprobante de pago: son **premios ganados**.
 *
 * LO QUE FALTA, Y SE DICE AQUÍ PARA QUE NO SE OLVIDE. Del 09/08 al 24/08/2026 la
 * plataforma no tiene ni un resultado confirmado (I-133), y el dueño todavía no
 * sabe si hubo premios en ese tramo. Ese período queda **pendiente de
 * información**, no en cero, y su incorporación tendrá su propia autorización.
 *
 * NINGÚN IDENTIFICADOR DE PRODUCCIÓN VIVE AQUÍ. La organización llega como
 * argumento del script; lo que hay aquí son los números de la boleta, la
 * lotería, la fecha de referencia del sorteo, el premio y su importe, que es lo
 * que el dueño confirmó.
 */

/** Una entrada del cargador: identifica la coincidencia que YA existe. */
export type DeclaredPrizeAwardInput = {
  /** Los dos números de la boleta, tal como están guardados (BR-N11). */
  daily_number: string
  weekly_number: string
  lottery_code: 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'
  /** Fecha de referencia del sorteo (BR-L03), no la fecha oficial. */
  reference_date: string
  /** El premio, por su título vigente en la rifa. */
  prize_title: string
  /** El componente en dinero reconocido, en pesos enteros. */
  amount?: number
  /** Lo que se entregó, cuando no es dinero. Al menos uno de los dos. */
  in_kind_description?: string
}

/** El título del premio que el dueño nombró para los dos casos. */
export const CONFIRMED_PRIZE_TITLE = 'Premio diario'

/** El respaldo de negocio, con el ROL que lo confirmó y nunca un nombre propio. */
export const CONFIRMED_AWARDS_BASIS =
  'Confirmación del Dueño en el encargo del historial de premios ganados (2026-09-17): ' +
  'las dos coincidencias corresponden al Premio diario, $500.000 cada una. ' +
  'No se aplican hacia atrás las versiones publicadas el 17/09.'

/**
 * Los DOS casos confirmados, escritos una sola vez.
 *
 * Bogotá 2862 y Cundinamarca 4820, que son las dos únicas coincidencias que la
 * operación real produjo antes de la transición.
 */
export const CONFIRMED_PRIZE_AWARDS: readonly DeclaredPrizeAwardInput[] = [
  {
    daily_number: '3427',
    weekly_number: '7702',
    lottery_code: 'bogota',
    reference_date: '2026-09-03',
    prize_title: CONFIRMED_PRIZE_TITLE,
    amount: 500_000,
  },
  {
    daily_number: '9019',
    weekly_number: '3294',
    lottery_code: 'cundinamarca',
    reference_date: '2026-09-14',
    prize_title: CONFIRMED_PRIZE_TITLE,
    amount: 500_000,
  },
]

/** Lo que suman en dinero los premios reconocidos de una lista. */
export function declaredAwardsKnownAmount(
  awards: readonly DeclaredPrizeAwardInput[] = CONFIRMED_PRIZE_AWARDS,
): number {
  return awards.reduce((total, award) => total + (award.amount ?? 0), 0)
}

/** Cuántos de esos premios tienen el valor completo pendiente de definir. */
export function declaredAwardsValuePending(
  awards: readonly DeclaredPrizeAwardInput[] = CONFIRMED_PRIZE_AWARDS,
): number {
  return awards.filter((award) => award.in_kind_description != null).length
}
