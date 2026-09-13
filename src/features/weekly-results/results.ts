/**
 * El estado de «Resultados de la semana»: listo, pendiente o error (BR-H02, BR-H03, D-194).
 *
 * PURO: recibe las filas que ya leyó `queries.ts` y decide qué hay. Por eso las
 * pruebas pueden fabricar un resultado en conflicto, uno rechazado o uno con un
 * número de tres cifras sin tocar la base.
 *
 * LA REGLA QUE ORDENA TODO: la imagen y el mensaje solo existen con los SEIS
 * resultados confirmados. Un sorteo pendiente, en conflicto o rechazado deja la
 * semana `pending` entera, y su número —si lo hubiera— no se enseña (BR-L08).
 * Nunca hay una imagen a medias.
 */

import type { CatalogSettings } from '@/features/catalog/queries'
import {
  LOTTERY_CODES,
  LOTTERY_LABELS,
  LOTTERY_MATCH_FIELD,
  LOTTERY_WINNING_NUMBER_REGEX,
  type LotteryCode,
  type LotteryMatchField,
} from '@/features/lottery/constants'
import type { RaffleStatus } from '@/lib/constants'
import type { Database } from '@/types/database.types'

import { lotteryReferenceDate, type ResultsWeek } from './week'

export type LotteryValidationStatus =
  Database['public']['Enums']['lottery_result_validation_status']

/** Una programación con su resultado, tal como la entrega `queries.ts`. */
export type WeeklyScheduleRow = {
  lotteryCode: string
  referenceDate: string
  result: { winningNumber: string | null; validationStatus: LotteryValidationStatus } | null
}

/**
 * Lo que se sabe de UNA lotería esa semana.
 *
 * `invalid` es un resultado marcado como confirmado cuyo número no son cuatro
 * cifras. El CHECK de `lottery_results` lo impide, así que no debería existir;
 * si aparece, se trata como lo que es —un dato que no se puede publicar— y no
 * como un número.
 */
export type WeeklyLotteryStatus = 'confirmed' | 'pending' | 'conflict' | 'rejected' | 'invalid'

export type WeeklyLotteryResult = {
  code: LotteryCode
  label: string
  /** El día nominal del premio (BR-L03), no el día en que se jugó. */
  referenceDate: string
  /** Con qué número de la boleta se compara (BR-L06). */
  matchField: LotteryMatchField
  status: WeeklyLotteryStatus
  /** Solo con `confirmed`: texto exacto de cuatro cifras, con sus ceros (BR-L06). */
  winningNumber: string | null
}

export type WeeklyResults =
  | { kind: 'ready'; week: ResultsWeek; results: WeeklyLotteryResult[] }
  | {
      kind: 'pending'
      week: ResultsWeek
      results: WeeklyLotteryResult[]
      /** Las loterías que faltan, en el orden de la semana. */
      missing: LotteryCode[]
    }
  | { kind: 'error'; week: ResultsWeek }

/** Qué dice un resultado. Sin fila, o sin número todavía, es `pending`. */
export function weeklyLotteryStatus(result: WeeklyScheduleRow['result']): WeeklyLotteryStatus {
  if (result === null) return 'pending'
  switch (result.validationStatus) {
    case 'confirmed':
      return result.winningNumber !== null &&
        LOTTERY_WINNING_NUMBER_REGEX.test(result.winningNumber)
        ? 'confirmed'
        : 'invalid'
    case 'conflict':
      return 'conflict'
    case 'rejected':
      return 'rejected'
    default:
      return 'pending'
  }
}

/**
 * Las seis loterías de la semana, SIEMPRE en el orden de `LOTTERY_CODES`.
 *
 * Cada lotería se busca por su código y por su día nominal dentro de esa semana
 * (`lotteryReferenceDate`). Una fila con otro día no cuenta: el índice único
 * `(lottery_code, reference_date)` garantiza que hay a lo sumo una por día, y así
 * tampoco se cuela un sorteo de otra semana.
 *
 * El número se copia tal cual, como texto: `0046` sale `0046` (BR-L06).
 */
export function buildWeeklyResults(
  week: ResultsWeek,
  rows: readonly WeeklyScheduleRow[],
): Exclude<WeeklyResults, { kind: 'error' }> {
  const results = LOTTERY_CODES.map((code): WeeklyLotteryResult => {
    const referenceDate = lotteryReferenceDate(week, code)
    const row = rows.find(
      (candidate) => candidate.lotteryCode === code && candidate.referenceDate === referenceDate,
    )
    const result = row?.result ?? null
    const status = weeklyLotteryStatus(result)
    return {
      code,
      label: LOTTERY_LABELS[code],
      referenceDate,
      matchField: LOTTERY_MATCH_FIELD[code],
      status,
      winningNumber: status === 'confirmed' ? (result?.winningNumber ?? null) : null,
    }
  })

  const missing = results.filter((item) => item.status !== 'confirmed').map((item) => item.code)
  return missing.length === 0
    ? { kind: 'ready', week, results }
    : { kind: 'pending', week, results, missing }
}

/** La rifa que encabeza la imagen, o por qué no hay ninguna. */
export type WeeklyResultsRaffle =
  { kind: 'ready'; name: string } | { kind: 'none' } | { kind: 'error' }

/**
 * Los estados de una rifa que participa en los sorteos: activa o cerrada
 * (BR-L05, D-140). Una rifa en borrador o anulada no juega con estos números, y
 * ponerla de título a «Verifica tu boleta» diría algo falso.
 */
const RAFFLE_STATUSES_WITH_DRAWS: readonly RaffleStatus[] = ['active', 'closed']

/**
 * El nombre de la rifa de la imagen: el de la rifa configurada en el catálogo
 * del vendedor, tal como está guardado (BR-H04).
 *
 * NO SE ADIVINA NINGUNA. Sin rifa configurada —o con una que no juega— devuelve
 * `null`, y la pantalla pide que se configure; nunca se toma «la rifa activa más
 * reciente» (D-140). Configurar esa rifa es del Dueño y del Administrador
 * (BR-K12).
 */
export function weeklyResultsRaffleName(
  settings: Pick<CatalogSettings, 'raffleId' | 'raffleName' | 'raffleStatus'> | null,
): string | null {
  if (settings === null || settings.raffleId === null || settings.raffleName === null) return null
  if (settings.raffleStatus === null) return null
  if (!RAFFLE_STATUSES_WITH_DRAWS.includes(settings.raffleStatus)) return null
  return settings.raffleName
}
