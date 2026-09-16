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
 * LAS CUATRO CIFRAS MANDAN SOBRE LAS TRES, POR CLIENTE (BR-J07, D-203).
 *
 * Recibe las candidatas de UN resultado. Si quien reclama —ver
 * `prizeClaimantKey`— tiene al menos una coincidencia elegible de cuatro
 * cifras, pierde TODAS sus coincidencias de tres cifras en ese resultado:
 * las de sus otras boletas y las del otro numero de la misma boleta. Otro
 * cliente que solo coincide en las tres ultimas cifras conserva su premio.
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

  const claimantsWithFour = new Set(
    candidates.filter((candidate) => candidate.digits === 'four').map(prizeClaimantKey),
  )
  return candidates.filter(
    (candidate) =>
      candidate.digits === 'four' || !claimantsWithFour.has(prizeClaimantKey(candidate)),
  )
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
