import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  LOTTERY_CODES,
  LOTTERY_PUBLICATION_DELAY_MINUTES,
  LOTTERY_RESULT_SYNC,
} from '@/features/lottery/constants'
import { LOTTERY_DASHBOARD_LOOKBEHIND_DAYS } from '@/features/lottery/dashboard'
import {
  addIsoDays,
  bogotaIsoDate,
  decideResultFetch,
  isMorningReconciliation,
  officialResultFitsSchedule,
  resultSyncHorizon,
} from '@/features/lottery/publication'
import { ALLOWED_SOURCE_HOSTS } from '@/features/lottery/sources'

const ROOT = process.cwd()

describe('ventanas de publicacion (D-145)', () => {
  const official = '2099-06-15T23:00:00-05:00'

  it('no consulta antes del instante oficial mas el margen', () => {
    expect(
      decideResultFetch({
        lotteryCode: 'bogota',
        officialScheduledAt: official,
        now: new Date('2099-06-15T23:10:00-05:00'),
        validationStatus: 'none',
        failedAttempts: 0,
        lastAttemptAt: null,
        lastErrorCode: null,
      }),
    ).toBe('wait')

    expect(
      decideResultFetch({
        lotteryCode: 'bogota',
        officialScheduledAt: official,
        now: new Date('2099-06-15T23:26:00-05:00'),
        validationStatus: 'none',
        failedAttempts: 0,
        lastAttemptAt: null,
        lastErrorCode: null,
      }),
    ).toBe('fetch')
    expect(LOTTERY_PUBLICATION_DELAY_MINUTES.bogota).toBe(25)
  })

  it('deja de consultar cuando el resultado ya esta confirmado o en conflicto', () => {
    const base = {
      lotteryCode: 'meta' as const,
      officialScheduledAt: official,
      now: new Date('2099-06-16T08:30:00-05:00'),
      failedAttempts: 0,
      lastAttemptAt: null,
      lastErrorCode: null,
    }
    expect(decideResultFetch({ ...base, validationStatus: 'confirmed' })).toBe('skip')
    expect(decideResultFetch({ ...base, validationStatus: 'conflict' })).toBe('skip')
  })

  it('espera 30 minutos entre reintentos y pasa a la manana despues de cuatro fallos', () => {
    expect(
      decideResultFetch({
        lotteryCode: 'meta',
        officialScheduledAt: official,
        now: new Date('2099-06-15T23:20:00-05:00'),
        validationStatus: 'none',
        failedAttempts: 1,
        lastAttemptAt: '2099-06-15T23:10:00-05:00',
        lastErrorCode: 'timeout',
      }),
    ).toBe('wait')

    expect(
      decideResultFetch({
        lotteryCode: 'meta',
        officialScheduledAt: official,
        now: new Date('2099-06-16T00:30:00-05:00'),
        validationStatus: 'none',
        failedAttempts: 4,
        lastAttemptAt: '2099-06-16T00:00:00-05:00',
        lastErrorCode: 'empty',
      }),
    ).toBe('wait')

    expect(
      decideResultFetch({
        lotteryCode: 'meta',
        officialScheduledAt: official,
        now: new Date('2099-06-16T09:00:00-05:00'),
        validationStatus: 'none',
        failedAttempts: 4,
        lastAttemptAt: '2099-06-16T00:00:00-05:00',
        lastErrorCode: 'empty',
      }),
    ).toBe('fetch')
  })

  it('no machaca una fuente bloqueada durante la noche', () => {
    expect(
      decideResultFetch({
        lotteryCode: 'bogota',
        officialScheduledAt: official,
        now: new Date('2099-06-16T00:40:00-05:00'),
        validationStatus: 'none',
        failedAttempts: 2,
        lastAttemptAt: '2099-06-16T00:05:00-05:00',
        lastErrorCode: 'source_blocked',
      }),
    ).toBe('wait')
  })

  it('deja de intentar al tope total', () => {
    expect(
      decideResultFetch({
        lotteryCode: 'cruz_roja',
        officialScheduledAt: official,
        now: new Date('2099-06-16T09:00:00-05:00'),
        validationStatus: 'none',
        failedAttempts: 6,
        lastAttemptAt: '2099-06-16T08:30:00-05:00',
        lastErrorCode: 'source_blocked',
      }),
    ).toBe('skip')
  })

  it('la conciliacion de la manana es el dia siguiente en Bogota, entre las 8 y las 12', () => {
    expect(isMorningReconciliation(new Date('2099-06-16T09:00:00-05:00'), official)).toBe(true)
    expect(isMorningReconciliation(new Date('2099-06-15T23:30:00-05:00'), official)).toBe(false)
    expect(isMorningReconciliation(new Date('2099-06-16T07:59:00-05:00'), official)).toBe(false)
  })
})

describe('resultado publicado despues de medianoche', () => {
  it('acepta la fecha oficial o el dia siguiente, con el mismo sorteo', () => {
    const schedule = {
      lotteryCode: 'bogota' as const,
      drawNumber: '2840',
      officialScheduledAt: '2026-03-31T23:00:00-05:00',
    }
    expect(
      officialResultFitsSchedule(
        {
          lotteryCode: 'bogota',
          drawNumber: '2840',
          officialDate: '2026-03-31',
        },
        schedule,
      ),
    ).toBe(true)
    expect(
      officialResultFitsSchedule(
        {
          lotteryCode: 'bogota',
          drawNumber: '2840',
          officialDate: '2026-04-01',
        },
        schedule,
      ),
    ).toBe(true)
    expect(
      officialResultFitsSchedule(
        {
          lotteryCode: 'bogota',
          drawNumber: '2840',
          officialDate: '2026-04-02',
        },
        schedule,
      ),
    ).toBe(false)
    expect(
      officialResultFitsSchedule(
        {
          lotteryCode: 'medellin',
          drawNumber: '2840',
          officialDate: '2026-03-31',
        },
        schedule,
      ),
    ).toBe(false)
  })

  it('Bogota el 31 de marzo sigue siendo el jueves 2 de abril como fecha de referencia, no esta funcion', () => {
    expect(bogotaIsoDate('2026-03-31T23:00:00-05:00')).toBe('2026-03-31')
    expect(addIsoDays('2026-03-31', 1)).toBe('2026-04-01')
  })
})

describe('el verificador de billetes ya no es una fuente (D-153, I-085)', () => {
  it('no queda ni la URL, ni el host, ni una funcion que la arme', () => {
    const sources = readFileSync(join(ROOT, 'src/features/lottery/sources.ts'), 'utf8')
    expect(sources).not.toContain('cundinamarcaResultLookupUrl')
    expect(sources).not.toContain('api/v1/result/public')
    // El host del verificador sale de la allowlist: su certificado esta
    // vencido y ademas no descubre ningun numero.
    expect(sources).not.toContain('plataforma.loteriadecundinamarca.com.co')
    expect(ALLOWED_SOURCE_HOSTS).not.toContain('plataforma.loteriadecundinamarca.com.co')
  })

  it('el adaptador de Cundinamarca ya no consulta la SPA ni el JSON', () => {
    const adapters = readFileSync(join(ROOT, 'src/features/lottery/adapters.ts'), 'utf8')
    expect(adapters).not.toContain('downloadCundinamarcaResult')
    expect(adapters).toContain('downloadCundinamarcaActa')
  })
})

describe('horizonte del sincronizador (D-152, BR-L22)', () => {
  const now = new Date('2026-09-01T12:00:00-05:00')

  it('abre diez dias atras, al comenzar el dia de Bogota, y cierra ahora', () => {
    const horizon = resultSyncHorizon(now)
    expect(horizon.fromIso).toBe('2026-08-22T00:00:00-05:00')
    expect(horizon.toIso).toBe(now.toISOString())
    expect(new Date(horizon.fromIso).getTime()).toBeLessThan(now.getTime())
  })

  it('cubre el sorteo del dia anterior y deja fuera el del ano pasado', () => {
    const horizon = resultSyncHorizon(now)
    const from = new Date(horizon.fromIso).getTime()
    const to = new Date(horizon.toIso).getTime()

    const ayer = new Date('2026-08-31T23:00:00-05:00').getTime()
    expect(ayer).toBeGreaterThanOrEqual(from)
    expect(ayer).toBeLessThanOrEqual(to)

    const enero = new Date('2026-01-12T23:00:00-05:00').getTime()
    expect(enero).toBeLessThan(from)
  })

  it('el horizonte hacia atras es el mismo que mira el Panel', () => {
    expect(LOTTERY_RESULT_SYNC.lookbehindDays).toBe(LOTTERY_DASHBOARD_LOOKBEHIND_DAYS)
  })

  it('un tick puede cubrir las seis loterias una vez, y no mas', () => {
    expect(LOTTERY_RESULT_SYNC.maxFetchesPerTick).toBe(LOTTERY_CODES.length)
    expect(LOTTERY_RESULT_SYNC.maxCandidates).toBeGreaterThan(
      LOTTERY_RESULT_SYNC.maxFetchesPerTick,
    )
  })
})
