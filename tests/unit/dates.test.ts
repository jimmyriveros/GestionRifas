import { describe, expect, it } from 'vitest'

import {
  formatDateCsv,
  formatDateEs,
  formatDateTimeEs,
  formatLongDateRangeEs,
  formatTimeEs,
  formatWeekdayEs,
  isoDateBogota,
  todayBogota,
} from '@/lib/dates'

describe('todayBogota', () => {
  it('devuelve una fecha en formato YYYY-MM-DD', () => {
    expect(todayBogota()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isoDateBogota y dia de la semana', () => {
  it('un instante despues de medianoche UTC sigue siendo el dia de Bogota', () => {
    expect(isoDateBogota('2026-04-01T04:00:00Z')).toBe('2026-03-31')
    expect(formatWeekdayEs('2026-03-31')).toBe('martes')
    expect(formatWeekdayEs('2026-04-02')).toBe('jueves')
  })

  it('la hora de un instante se lee en Bogota', () => {
    expect(formatTimeEs('2026-04-02T23:00:00-05:00')).toMatch(/11:00/)
  })
})

describe('formatDateEs', () => {
  it('formatea una fecha UTC interpretandola en America/Bogota', () => {
    const result = formatDateEs('2026-01-15T12:00:00Z')
    expect(result).toContain('2026')
    expect(result).toContain('15')
  })

  it('un pago tarde en la noche de Bogota no cruza al dia siguiente en UTC', () => {
    // 23:30 en Bogota (UTC-5) del dia 31 equivale a 04:30 UTC del dia 1.
    // formatDateEs debe seguir mostrando el 31, no el 1.
    const result = formatDateEs('2026-02-01T04:30:00Z')
    expect(result).toContain('31')
  })
})

/**
 * Regresion de I-017. Las columnas `date` (payment_date, sale_date, start_date,
 * end_date) llegan como 'AAAA-MM-DD' y se mostraban un dia antes: un abono del
 * 4 de agosto aparecia como 3 de agosto en el historial y en la tabla de pagos.
 */
describe('fechas de dia calendario (columnas `date`)', () => {
  it('formatDateEs no resta un dia a una fecha sin hora', () => {
    expect(formatDateEs('2026-08-04')).toContain('4')
    expect(formatDateEs('2026-08-04')).toContain('ago')
    expect(formatDateEs('2026-08-04')).not.toContain('3 de ago')
  })

  it('tampoco en el primer dia del mes, donde el error cambiaria tambien el mes', () => {
    expect(formatDateEs('2026-03-01')).toContain('mar')
    expect(formatDateEs('2026-01-01')).toContain('2026')
  })

  it('formatDateTimeEs conserva el dia de una fecha sin hora', () => {
    expect(formatDateTimeEs('2026-08-04')).toContain('4')
  })

  it('formatDateCsv usa DD/MM/AAAA y conserva el dia', () => {
    expect(formatDateCsv('2026-08-04')).toBe('04/08/2026')
    expect(formatDateCsv('2026-12-31')).toBe('31/12/2026')
  })

  it('formatDateCsv sigue convirtiendo los timestamps a hora de Bogota', () => {
    // 04:30 UTC del 1 de febrero son las 23:30 del 31 de enero en Bogota.
    expect(formatDateCsv('2026-02-01T04:30:00Z')).toBe('31/01/2026')
  })
})

/**
 * El rango largo del aviso de las fechas de una rifa (BR-R12, D-206): el año al
 * final, una sola vez si se repite, y los días calendario sin restar uno (I-017).
 */
describe('formatLongDateRangeEs', () => {
  it('escribe el mes y el año una sola vez cuando se repiten', () => {
    expect(formatLongDateRangeEs('2026-07-27', '2026-12-21')).toBe(
      'del 27 de julio al 21 de diciembre de 2026',
    )
    expect(formatLongDateRangeEs('2026-11-03', '2026-11-27')).toBe(
      'del 3 al 27 de noviembre de 2026',
    )
  })

  it('escribe los dos años cuando el rango cruza de año, y un solo día sin «del … al»', () => {
    expect(formatLongDateRangeEs('2026-12-01', '2027-01-15')).toBe(
      'del 1 de diciembre de 2026 al 15 de enero de 2027',
    )
    expect(formatLongDateRangeEs('2026-12-21', '2026-12-21')).toBe('el 21 de diciembre de 2026')
  })

  it('no resta un día a una fecha sin hora, tampoco el primero del mes', () => {
    expect(formatLongDateRangeEs('2026-03-01', '2026-04-01')).toBe(
      'del 1 de marzo al 1 de abril de 2026',
    )
  })
})
