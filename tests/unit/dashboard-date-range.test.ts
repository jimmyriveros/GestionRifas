import { describe, expect, it } from 'vitest'

import {
  addDays,
  comparePeriods,
  eachDay,
  parseDashboardRange,
  previousRange,
  rangeLength,
  resolveDashboardRange,
} from '@/features/dashboard/date-range'

/**
 * Periodo del panel del vendedor (D-112).
 *
 * Lo que de verdad se prueba aqui son los bordes: el cambio de mes, el cambio
 * de año y la comparacion contra un periodo en el que no entro nada. Los tres
 * dan una cifra equivocada sin que nada avise.
 */

describe('resolveDashboardRange', () => {
  it('«últimos 7 días» incluye hoy y los seis anteriores', () => {
    expect(resolveDashboardRange('7d', '2026-08-17')).toEqual({
      from: '2026-08-11',
      to: '2026-08-17',
    })
  })

  it('«últimos 30 días» incluye hoy y cruza el cambio de mes', () => {
    expect(resolveDashboardRange('30d', '2026-08-17')).toEqual({
      from: '2026-07-19',
      to: '2026-08-17',
    })
  })

  it('«este mes» va del dia 1 a hoy, no a fin de mes', () => {
    expect(resolveDashboardRange('month', '2026-08-17')).toEqual({
      from: '2026-08-01',
      to: '2026-08-17',
    })
  })

  it('«mes pasado» es el mes completo anterior', () => {
    expect(resolveDashboardRange('last-month', '2026-08-17')).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    })
  })

  it('«mes pasado» en enero es diciembre del año anterior', () => {
    expect(resolveDashboardRange('last-month', '2026-01-09')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    })
  })

  it('«mes pasado» en marzo respeta la duracion real de febrero', () => {
    expect(resolveDashboardRange('last-month', '2026-03-02')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    // 2024 fue bisiesto: el 29 existe y tiene que entrar.
    expect(resolveDashboardRange('last-month', '2024-03-02').to).toBe('2024-02-29')
  })

  it('el primero de mes, «este mes» es un solo dia', () => {
    const range = resolveDashboardRange('month', '2026-08-01')
    expect(range).toEqual({ from: '2026-08-01', to: '2026-08-01' })
    expect(rangeLength(range)).toBe(1)
  })
})

describe('parseDashboardRange', () => {
  it('acepta las cuatro opciones conocidas', () => {
    expect(parseDashboardRange('30d')).toBe('30d')
    expect(parseDashboardRange('last-month')).toBe('last-month')
  })

  it('cualquier otra cosa en la URL cae en el rango por defecto', () => {
    expect(parseDashboardRange(undefined)).toBe('7d')
    expect(parseDashboardRange('')).toBe('7d')
    expect(parseDashboardRange('todo')).toBe('7d')
    expect(parseDashboardRange('../../etc')).toBe('7d')
  })
})

describe('eachDay y rangeLength', () => {
  it('devuelve todos los dias, sin huecos y del mas antiguo al mas reciente', () => {
    const range = { from: '2026-08-11', to: '2026-08-17' }
    expect(rangeLength(range)).toBe(7)
    expect(eachDay(range)).toEqual([
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
      '2026-08-17',
    ])
  })

  it('un rango de un solo dia tiene un punto, no cero', () => {
    expect(eachDay({ from: '2026-08-17', to: '2026-08-17' })).toEqual(['2026-08-17'])
  })

  it('cruza el cambio de año sin perder ni repetir dias', () => {
    const dias = eachDay({ from: '2025-12-30', to: '2026-01-02' })
    expect(dias).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'])
  })

  it('addDays no se descuadra al cambiar de mes ni de año', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('previousRange', () => {
  it('11–17 de agosto se compara con 4–10 de agosto', () => {
    expect(previousRange({ from: '2026-08-11', to: '2026-08-17' })).toEqual({
      from: '2026-08-04',
      to: '2026-08-10',
    })
  })

  it('conserva la duracion exacta del periodo, sea cual sea', () => {
    const range = { from: '2026-07-01', to: '2026-07-31' }
    const previous = previousRange(range)
    expect(rangeLength(previous)).toBe(rangeLength(range))
    expect(previous).toEqual({ from: '2026-05-31', to: '2026-06-30' })
  })

  it('un rango de un dia se compara con el dia anterior', () => {
    expect(previousRange({ from: '2026-08-01', to: '2026-08-01' })).toEqual({
      from: '2026-07-31',
      to: '2026-07-31',
    })
  })
})

describe('comparePeriods', () => {
  it('mas que antes: sube, con el porcentaje redondeado', () => {
    expect(comparePeriods(1_120_000, 1_000_000)).toEqual({ kind: 'up', percentage: 12 })
  })

  it('menos que antes: baja, y el porcentaje se muestra en positivo', () => {
    expect(comparePeriods(920_000, 1_000_000)).toEqual({ kind: 'down', percentage: 8 })
  })

  it('lo mismo que antes: ni sube ni baja', () => {
    expect(comparePeriods(500_000, 500_000)).toEqual({ kind: 'same', percentage: 0 })
  })

  it('antes no entro nada: no hay porcentaje que calcular', () => {
    // Ni +100%, ni +∞%, ni NaN: la pantalla lo dice con palabras.
    expect(comparePeriods(300_000, 0)).toEqual({ kind: 'unknown', percentage: null })
    expect(comparePeriods(0, 0)).toEqual({ kind: 'unknown', percentage: null })
  })

  it('caer a cero desde algo es una bajada del 100%, no un dato desconocido', () => {
    expect(comparePeriods(0, 400_000)).toEqual({ kind: 'down', percentage: 100 })
  })
})
