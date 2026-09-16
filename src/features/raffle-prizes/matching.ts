import type { LotteryMatchField } from '@/features/lottery/constants'

/**
 * Como se compara el numero de una boleta con el numero mayor de una loteria
 * (BR-J06, BR-J07, D-199).
 *
 * PURO Y SIN MOTOR. Aqui esta la REGLA; el motor que crea las coincidencias es
 * la Entrega 3 y no existe todavia. Se escribe ahora porque es el contrato del
 * que dependen la pantalla y la migracion, y porque es lo que hay que poder
 * probar antes de tocar `lottery_ticket_matches`.
 *
 * LOS NUMEROS SON TEXTO (BR-N01, BR-N03, BR-L06). Nunca se castean, ni se
 * rellenan con ceros, ni se recortan: `0046` no es `46`.
 */

export type PrizeDigits = 'four' | 'last_three'

/** El numero mayor de una loteria colombiana son exactamente cuatro cifras. */
const WINNING_NUMBER = /^[0-9]{4}$/

/**
 * `four`: igualdad textual exacta con el numero mayor.
 * `last_three`: las tres ultimas cifras, y el numero de la boleta tiene que
 * tener al menos tres caracteres — `46` no participa, `046` y `1046` si.
 */
export function prizeNumberMatches(
  ticketNumber: string | null | undefined,
  winningNumber: string,
  digits: PrizeDigits,
): boolean {
  if (!ticketNumber || !WINNING_NUMBER.test(winningNumber)) return false

  if (digits === 'four') return ticketNumber === winningNumber
  if (ticketNumber.length < 3) return false
  return ticketNumber.slice(-3) === winningNumber.slice(-3)
}

/** Un premio que podria aplicarle a una boleta en un resultado concreto. */
export type PrizeCandidate = {
  prizeId: string
  versionId: string
  numberField: LotteryMatchField
  digits: PrizeDigits
}

/**
 * Las cuatro cifras mandan sobre las tres (BR-J07).
 *
 * Para UNA boleta y UN resultado: si alguna coincidencia elegible es de cuatro
 * cifras, las de tres cifras de ese resultado no cuentan — ni siquiera las del
 * otro numero de la boleta. El valor economico NO decide nada.
 *
 * VARIAS COINCIDENCIAS DE LA MISMA ESPECIFICIDAD SE CONSERVAN TODAS, y desde
 * D-201 eso ya no es una pregunta abierta: los premios NO se acumulan, asi que
 * dos premios vigentes no pueden compartir dia, numero de la boleta, cifras y
 * loteria —la configuracion se rechaza antes de guardarse (BR-J08)—. Lo unico
 * que puede quedar aqui con la misma especificidad son premios que juegan con
 * NUMEROS DISTINTOS de la boleta, que si conviven a proposito: una boleta cuyo
 * numero diario y cuyo numero semanal coincidan los dos se relaciona con los
 * dos premios, y eso no es un cruce.
 *
 * ⚠️ PARA LA ENTREGA 3, y por eso esta escrito aqui: esta funcion no reordena
 * ni descarta por valor, y no tiene forma de saber si dos candidatos vienen de
 * una configuracion anterior a la `0059`. La regla de conflicto vive en la base
 * y protege lo que se guarda de ahora en adelante; el motor tendra que decidir
 * que hace si alguna vez recibe dos candidatos con el mismo numero y las mismas
 * cifras para un mismo sorteo. Hoy no existe ninguno.
 */
export function resolvePrizeLinks(candidates: PrizeCandidate[]): PrizeCandidate[] {
  const hasFour = candidates.some((candidate) => candidate.digits === 'four')
  return hasFour ? candidates.filter((candidate) => candidate.digits === 'four') : candidates
}

/** Una version de un premio, como la necesita el calculo de vigencia. */
export type PrizeVersionRef = {
  id: string
  versionNumber: number
  publishedAt: string
  status: 'active' | 'archived'
}

/**
 * La version que le aplica a un sorteo: la ULTIMA publicada antes de su corte
 * (BR-J09).
 *
 * El corte es la hora ORIGINAL anunciada del sorteo, aunque despues se aplace.
 * Llegada esa hora la ocurrencia queda bloqueada, y por eso una version nueva
 * solo afecta a los sorteos que todavia no se jugaron: no hace falta reescribir
 * nada hacia atras.
 *
 * Si la version que sale es una ARCHIVADA, el premio no aplica a ese sorteo.
 * Devuelve `null` cuando ninguna version se publico antes del corte.
 */
export function applicableVersion(
  versions: PrizeVersionRef[],
  cutoff: string,
): PrizeVersionRef | null {
  const cutoffAt = Date.parse(cutoff)
  if (Number.isNaN(cutoffAt)) return null

  return (
    versions
      .filter((version) => Date.parse(version.publishedAt) < cutoffAt)
      .sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null
  )
}
