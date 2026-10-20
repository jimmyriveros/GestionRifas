import type { LotteryMatchField } from '@/features/lottery/constants'

/**
 * Como se compara el numero de una boleta con el numero mayor de una loteria
 * (BR-J06, BR-J07, D-199, D-203).
 *
 * PURO. Aqui esta la REGLA, escrita para poder probarla; el motor que crea las
 * coincidencias vive en PostgreSQL (`match_lottery_result`, migracion `0061`) y
 * es el unico que decide lo que se guarda. Las pruebas de base de datos
 * comprueban que el motor responde lo mismo que estas funciones.
 *
 * LOS NUMEROS SON TEXTO (BR-N01, BR-N03, BR-L06). Nunca se castean, ni se
 * rellenan con ceros, ni se recortan: `0046` no es `46`.
 */

export type PrizeDigits = 'four' | 'last_three' | 'last_two'

/** Cuantas cifras compara cada modalidad (D-261): la prioridad va por esto. */
export const PRIZE_DIGITS_COUNT: Record<PrizeDigits, 2 | 3 | 4> = {
  four: 4,
  last_three: 3,
  last_two: 2,
}

/** Las tres modalidades, de mas cifras a menos. */
export const PRIZE_DIGITS_VALUES: readonly PrizeDigits[] = ['four', 'last_three', 'last_two']

/** El numero mayor de una loteria colombiana son exactamente cuatro cifras. */
const WINNING_NUMBER = /^[0-9]{4}$/

/**
 * `four`: igualdad textual exacta con el numero mayor.
 * `last_three`: las tres ultimas cifras, y el numero de la boleta tiene que
 * tener al menos tres caracteres — `46` no participa, `046` y `1046` si.
 * `last_two` (D-261): las dos ultimas, con al menos dos caracteres — con 5307,
 * `07` coincide y `7` no.
 */
export function prizeNumberMatches(
  ticketNumber: string | null | undefined,
  winningNumber: string,
  digits: PrizeDigits,
): boolean {
  if (!ticketNumber || !WINNING_NUMBER.test(winningNumber)) return false

  if (digits === 'four') return ticketNumber === winningNumber
  const count = PRIZE_DIGITS_COUNT[digits]
  if (ticketNumber.length < count) return false
  return ticketNumber.slice(-count) === winningNumber.slice(-count)
}

/**
 * Una coincidencia candidata en UN resultado: una boleta, con uno de sus dos
 * numeros, contra un premio que juega ese sorteo.
 */
export type PrizeCandidate = {
  prizeId: string
  versionId: string
  numberField: LotteryMatchField
  digits: PrizeDigits
  ticketId: string
  /** La prioridad no cruza rifas: cada rifa es su propio juego de premios. */
  raffleId: string
  /**
   * El cliente FOTOGRAFIADO por el motor: quien tenia la boleta vendida en el
   * instante oficial del sorteo (BR-L09). `null` si no estaba vendida —libre o
   * asignada despues—, y entonces la boleta es su propia unidad.
   */
  clientId: string | null
}

/**
 * Quien reclama una coincidencia (D-203): el cliente fotografiado dentro de su
 * rifa, o la boleta cuando no habia cliente. Dos clientes distintos nunca
 * comparten clave, y dos boletas sin vender tampoco.
 */
export function prizeClaimantKey(
  candidate: Pick<PrizeCandidate, 'raffleId' | 'clientId' | 'ticketId'>,
): string {
  return candidate.clientId
    ? `${candidate.raffleId}:client:${candidate.clientId}`
    : `${candidate.raffleId}:ticket:${candidate.ticketId}`
}

/**
 * Dos premios que juegan el MISMO sorteo con el mismo numero de la boleta y las
 * mismas cifras. BR-J08 lo impide al guardar, asi que no deberia existir; si
 * aparece, no se elige ninguno (D-203).
 */
export class PrizeSignatureConflictError extends Error {
  constructor(readonly prizeIds: [string, string]) {
    super('Dos premios juegan este sorteo con el mismo número de la boleta y las mismas cifras.')
    this.name = 'PrizeSignatureConflictError'
  }
}

/**
 * MANDAN LAS MAS CIFRAS: 4 > 3 > 2, POR CLIENTE (BR-J07, D-203; D-261).
 *
 * Recibe las candidatas de UN resultado. Quien reclama —ver
 * `prizeClaimantKey`— conserva solo sus coincidencias de la MAYOR cantidad de
 * cifras acertadas en ese resultado y pierde todas las de menos: las de sus
 * otras boletas y las de sus otros numeros. Con una de cuatro, pierde las de
 * tres y las de dos; si su mejor es de tres, pierde las de dos. Otro cliente
 * conserva las suyas. Entre las de la misma cantidad no se elige ninguna.
 *
 * El valor economico, la categoria, el nombre y el orden NO deciden nada. Varias
 * coincidencias de cuatro cifras con numeros distintos de la boleta se
 * conservan todas: eso no es un cruce.
 *
 * Si dos candidatas de la misma boleta y el mismo numero traen premios
 * distintos con las mismas cifras, la configuracion es imposible (BR-J08) y se
 * lanza `PrizeSignatureConflictError` en vez de escoger. El motor hace lo mismo
 * a nivel de sorteo: falla aunque ninguna boleta coincida.
 */
export function resolvePrizeLinks(candidates: PrizeCandidate[]): PrizeCandidate[] {
  const bySignature = new Map<string, string>()
  for (const candidate of candidates) {
    const signature = `${candidate.ticketId}:${candidate.numberField}:${candidate.digits}`
    const seen = bySignature.get(signature)
    if (seen !== undefined && seen !== candidate.prizeId) {
      throw new PrizeSignatureConflictError([seen, candidate.prizeId])
    }
    bySignature.set(signature, candidate.prizeId)
  }

  const best = new Map<string, number>()
  for (const candidate of candidates) {
    const key = prizeClaimantKey(candidate)
    best.set(key, Math.max(best.get(key) ?? 0, PRIZE_DIGITS_COUNT[candidate.digits]))
  }
  return candidates.filter(
    (candidate) => PRIZE_DIGITS_COUNT[candidate.digits] === best.get(prizeClaimantKey(candidate)),
  )
}

/** Una version de un premio, como la necesita el calculo de vigencia. */
export type PrizeVersionRef = {
  id: string
  versionNumber: number
  publishedAt: string
  status: 'active' | 'archived'
}

/** Las dos horas de un sorteo que deciden su corte. */
export type PrizeDrawTimes = {
  originalScheduledAt: string | null
  officialScheduledAt: string | null
}

/**
 * El CORTE EFECTIVO de un sorteo (BR-J09, D-203 Decision 9): la MENOR entre la
 * hora original anunciada y la oficial.
 *
 * Sin cambio, las dos coinciden. Un sorteo APLAZADO conserva como corte la hora
 * original; uno ADELANTADO corta en la hora oficial, que es cuando de verdad se
 * juega. Asi nunca aplica una version publicada despues de que el sorteo ya
 * debio jugarse.
 *
 * Si falta cualquiera de las dos horas —o no se puede leer— devuelve `null`: no
 * se supone. Es el espejo de `raffle_prize_draw_cutoff` (migracion `0062`), que
 * es la que decide en la base, y una prueba de base de datos compara las dos.
 */
export function prizeDrawCutoff(times: PrizeDrawTimes): string | null {
  const { originalScheduledAt: original, officialScheduledAt: official } = times
  if (!original || !official) return null

  const originalAt = Date.parse(original)
  const officialAt = Date.parse(official)
  if (Number.isNaN(originalAt) || Number.isNaN(officialAt)) return null

  return officialAt < originalAt ? official : original
}

/**
 * La version que le aplica a un sorteo: la ULTIMA publicada ESTRICTAMENTE antes
 * de su corte (BR-J09).
 *
 * El corte es el EFECTIVO, `prizeDrawCutoff`: la hora original, salvo que el
 * sorteo se adelante, y entonces la oficial. Llegada esa hora la ocurrencia
 * queda bloqueada, y por eso una version nueva solo afecta a los sorteos que
 * todavia no se jugaron: no hace falta reescribir nada hacia atras. Una version
 * publicada EXACTAMENTE en el corte ya no aplica.
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
