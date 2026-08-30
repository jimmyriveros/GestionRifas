import { describe, expect, it } from 'vitest'

import {
  LOTTERY_ASSIGNMENT_STATUS_LABELS,
  LOTTERY_CODES,
  LOTTERY_LABELS,
  LOTTERY_MATCH_FIELD,
  LOTTERY_NOTIFICATION_KIND,
  LOTTERY_PUBLICATION_DELAY_MINUTES,
  LOTTERY_SCHEDULE_STATUS_LABELS,
  LOTTERY_WINNING_NUMBER_REGEX,
} from '@/features/lottery/constants'
import { Constants } from '@/types/database.types'

describe('loterias — mapa estable (BR-L01, BR-L06)', () => {
  it('los seis codigos coinciden con el enum generado', () => {
    expect([...LOTTERY_CODES]).toEqual(Constants.public.Enums.lottery_code)
  })

  it('lunes a viernes comparan el diario; Boyaca, el semanal', () => {
    expect(LOTTERY_MATCH_FIELD.cundinamarca).toBe('daily_number')
    expect(LOTTERY_MATCH_FIELD.cruz_roja).toBe('daily_number')
    expect(LOTTERY_MATCH_FIELD.meta).toBe('daily_number')
    expect(LOTTERY_MATCH_FIELD.bogota).toBe('daily_number')
    expect(LOTTERY_MATCH_FIELD.medellin).toBe('daily_number')
    expect(LOTTERY_MATCH_FIELD.boyaca).toBe('weekly_number')
  })

  it('el numero mayor exige exactamente cuatro digitos, como texto', () => {
    expect(LOTTERY_WINNING_NUMBER_REGEX.test('0046')).toBe(true)
    expect(LOTTERY_WINNING_NUMBER_REGEX.test('0000')).toBe(true)
    expect(LOTTERY_WINNING_NUMBER_REGEX.test('9999')).toBe(true)
    expect(LOTTERY_WINNING_NUMBER_REGEX.test('46')).toBe(false)
    expect(LOTTERY_WINNING_NUMBER_REGEX.test('046')).toBe(false)
    expect(LOTTERY_WINNING_NUMBER_REGEX.test('00460')).toBe(false)
    expect(LOTTERY_WINNING_NUMBER_REGEX.test('12A4')).toBe(false)
  })

  it('hay etiqueta para cada codigo, estado de programacion y fotografia', () => {
    for (const code of LOTTERY_CODES) {
      expect(LOTTERY_LABELS[code].length).toBeGreaterThan(0)
    }
    for (const status of Constants.public.Enums.lottery_schedule_status) {
      expect(LOTTERY_SCHEDULE_STATUS_LABELS[status].length).toBeGreaterThan(0)
    }
    for (const status of Constants.public.Enums.lottery_assignment_status) {
      expect(LOTTERY_ASSIGNMENT_STATUS_LABELS[status].length).toBeGreaterThan(0)
    }
  })

  it('cada loteria tiene un margen de publicacion y los avisos no se llaman ganador', () => {
    for (const code of LOTTERY_CODES) {
      expect(LOTTERY_PUBLICATION_DELAY_MINUTES[code]).toBeGreaterThanOrEqual(0)
    }
    expect(LOTTERY_NOTIFICATION_KIND.result).toBe('lottery.result')
    expect(LOTTERY_NOTIFICATION_KIND.scheduleChange).toBe('lottery.schedule_change')
  })

  it('ninguna etiqueta llama ganador al cliente ni a la boleta', () => {
    const textos = [
      ...Object.values(LOTTERY_LABELS),
      ...Object.values(LOTTERY_SCHEDULE_STATUS_LABELS),
      ...Object.values(LOTTERY_ASSIGNMENT_STATUS_LABELS),
    ].join(' ')
    expect(textos.toLowerCase()).not.toMatch(/ganador/)
  })
})
