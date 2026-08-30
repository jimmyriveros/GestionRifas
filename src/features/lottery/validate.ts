import { LOTTERY_WINNING_NUMBER_REGEX } from './constants'
import type { AdapterFail, NormalizedLotteryResult } from './types'

export function validateWinningNumber(value: string | null | undefined): string | AdapterFail {
  if (!value) {
    return { ok: false, code: 'invalid_number', message: 'No hay un numero mayor publicado.' }
  }
  if (!LOTTERY_WINNING_NUMBER_REGEX.test(value)) {
    return {
      ok: false,
      code: 'invalid_number',
      message: 'El numero mayor no es un texto de cuatro digitos.',
    }
  }
  return value
}

export function validateNormalizedResult(
  result: NormalizedLotteryResult,
): NormalizedLotteryResult | AdapterFail {
  const number = validateWinningNumber(result.winningNumber)
  if (typeof number !== 'string') return number
  if (!result.drawNumber || !/^\d{1,6}$/.test(result.drawNumber)) {
    return { ok: false, code: 'ambiguous', message: 'El numero de sorteo no es inequívoco.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.officialDate)) {
    return { ok: false, code: 'ambiguous', message: 'La fecha oficial no es inequívoca.' }
  }
  return { ...result, winningNumber: number, series: result.series || null }
}
