import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  authorizeLotterySync,
  configuredLotterySyncSecret,
  presentedLotterySyncSecret,
  secretsEqual,
} from '@/features/lottery/auth'
import {
  LOTTERY_CRON_JOBS_HOBBY,
  LOTTERY_CRON_JOBS_PRO,
  lotteryVercelCrons,
} from '@/features/lottery/cron-plan'
import { LOTTERY_SYNC_PATH, LOTTERY_SYNC_SECRET_MIN_LENGTH } from '@/features/lottery/constants'
import { runLotterySyncTick } from '@/features/lottery/job'
import { shouldSyncSchedule } from '@/features/lottery/publication'
import { __clearRateLimits } from '@/lib/rate-limit'
import type { LotteryDb } from '@/features/lottery/sync'

const ROOT = process.cwd()
const SECRET = 'lottery-sync-secret-ok'

beforeEach(() => {
  __clearRateLimits()
})

describe('autorizacion del proceso (D-148, BR-L21)', () => {
  it('compara secretos iguales y distintos sin filtrar longitud', () => {
    expect(secretsEqual(SECRET, SECRET)).toBe(true)
    expect(secretsEqual('abc', 'abcd')).toBe(false)
    expect(secretsEqual('', SECRET)).toBe(false)
  })

  it('lee Bearer o la cabecera propia, nunca el query', () => {
    const bearer = presentedLotterySyncSecret(
      new Request('https://example.test/api/lottery/sync?secret=no', {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    )
    expect(bearer).toBe(SECRET)

    const header = presentedLotterySyncSecret(
      new Request('https://example.test/api/lottery/sync', {
        headers: { 'x-lottery-sync-secret': SECRET },
      }),
    )
    expect(header).toBe(SECRET)

    const fromQuery = presentedLotterySyncSecret(
      new Request(`https://example.test/api/lottery/sync?secret=${SECRET}`),
    )
    expect(fromQuery).toBeNull()
  })

  it('falla cerrado sin secreto configurado, corto o distinto', () => {
    expect(configuredLotterySyncSecret({})).toBeNull()
    expect(configuredLotterySyncSecret({ LOTTERY_SYNC_SECRET: 'corto' })).toBeNull()
    expect(configuredLotterySyncSecret({ CRON_SECRET: SECRET })).toBe(SECRET)
    expect(
      authorizeLotterySync({ presented: SECRET, expected: null }).ok,
    ).toBe(false)
    expect(
      authorizeLotterySync({ presented: 'otro-secreto-largo1', expected: SECRET }).ok,
    ).toBe(false)
    expect(authorizeLotterySync({ presented: SECRET, expected: SECRET }).ok).toBe(true)
  })

  it('no distingue 401 de un secreto ausente y uno incorrecto', () => {
    const missing = authorizeLotterySync({ presented: null, expected: SECRET })
    const wrong = authorizeLotterySync({ presented: 'x'.repeat(20), expected: SECRET })
    expect(missing).toEqual({ ok: false, status: 401 })
    expect(wrong).toEqual({ ok: false, status: 401 })
  })
})

describe('cuando sincronizar la programacion', () => {
  const now = new Date('2099-06-16T08:00:00-05:00')

  it('consulta si nunca hubo exito', () => {
    expect(shouldSyncSchedule({ now, lastSuccessAt: null, lastAttemptAt: null })).toBe(true)
  })

  it('no vuelve a consultar el mismo dia de Bogota', () => {
    expect(
      shouldSyncSchedule({
        now,
        lastSuccessAt: '2099-06-16T07:10:00-05:00',
        lastAttemptAt: '2099-06-16T07:10:00-05:00',
      }),
    ).toBe(false)
  })

  it('reintenta al dia siguiente y espera 3 h tras un fallo', () => {
    expect(
      shouldSyncSchedule({
        now,
        lastSuccessAt: '2099-06-15T07:00:00-05:00',
        lastAttemptAt: '2099-06-15T07:00:00-05:00',
      }),
    ).toBe(true)

    expect(
      shouldSyncSchedule({
        now,
        lastSuccessAt: null,
        lastAttemptAt: '2099-06-16T06:00:00-05:00',
      }),
    ).toBe(false)

    expect(
      shouldSyncSchedule({
        now,
        lastSuccessAt: null,
        lastAttemptAt: '2099-06-16T04:50:00-05:00',
      }),
    ).toBe(true)
  })
})

describe('tick del sincronizador', () => {
  const dummyClient = {} as LotteryDb

  it('un segundo tick concurrente no consulta fuentes', async () => {
    let scheduleCalls = 0
    let resultCalls = 0
    const summary = await runLotterySyncTick({
      client: dummyClient,
      acquireLock: async () => false,
      releaseLock: async () => {
        throw new Error('no deberia soltar un cerrojo que no tomo')
      },
      syncSchedule: async () => {
        scheduleCalls += 1
        return { ran: true, outcome: 'success' }
      },
      syncResults: async () => {
        resultCalls += 1
        return { candidates: 1, fetched: 1, confirmed: 1, skipped: 0, failed: 0, deferred: 0 }
      },
    })
    expect(summary.skipped).toBe(true)
    expect(summary.reason).toBe('locked')
    expect(scheduleCalls).toBe(0)
    expect(resultCalls).toBe(0)
  })

  it('si la programacion falla, igual intenta los resultados', async () => {
    let released = false
    const summary = await runLotterySyncTick({
      now: new Date('2099-06-16T08:00:00-05:00'),
      correlationId: 'tick-1',
      client: dummyClient,
      acquireLock: async () => true,
      releaseLock: async () => {
        released = true
      },
      loadScheduleMeta: async () => ({ lastSuccessAt: null, lastAttemptAt: null }),
      syncSchedule: async () => ({ ran: true, outcome: 'failed', errorCode: 'timeout' }),
      syncResults: async () => ({ candidates: 4, fetched: 1, confirmed: 0, skipped: 3, failed: 1, deferred: 0 }),
    })
    expect(summary.skipped).toBe(false)
    expect(summary.schedule.outcome).toBe('failed')
    expect(summary.results.failed).toBe(1)
    expect(released).toBe(true)
  })

  it('omite la programacion si ya se sincronizo hoy y suelta el cerrojo', async () => {
    let scheduleCalls = 0
    let released = false
    const summary = await runLotterySyncTick({
      now: new Date('2099-06-16T23:30:00-05:00'),
      client: dummyClient,
      acquireLock: async () => true,
      releaseLock: async () => {
        released = true
      },
      loadScheduleMeta: async () => ({
        lastSuccessAt: '2099-06-16T07:05:00-05:00',
        lastAttemptAt: '2099-06-16T07:05:00-05:00',
      }),
      syncSchedule: async () => {
        scheduleCalls += 1
        return { ran: true, outcome: 'success' }
      },
      syncResults: async () => ({ candidates: 6, fetched: 0, confirmed: 0, skipped: 6, failed: 0, deferred: 0 }),
    })
    expect(summary.schedule).toEqual({ ran: false, outcome: 'skipped' })
    expect(scheduleCalls).toBe(0)
    expect(summary.results.skipped).toBe(6)
    expect(released).toBe(true)
  })

  it('si la etapa de resultados se cae entera, la programacion sincronizada se conserva', async () => {
    let released = false
    const summary = await runLotterySyncTick({
      now: new Date('2099-06-16T08:00:00-05:00'),
      client: dummyClient,
      acquireLock: async () => true,
      releaseLock: async () => {
        released = true
      },
      loadScheduleMeta: async () => ({ lastSuccessAt: null, lastAttemptAt: null }),
      syncSchedule: async () => ({ ran: true, outcome: 'success', inserted: 312, changed: 0 }),
      syncResults: async () => {
        throw new Error('fetch failed')
      },
    })

    expect(summary.skipped).toBe(false)
    expect(summary.schedule.outcome).toBe('success')
    expect(summary.schedule.inserted).toBe(312)
    expect(summary.results.errorCode).toBe('network_error')
    expect(summary.results.fetched).toBe(0)
    expect(released).toBe(true)
  })
})

describe('programador de produccion (D-149)', () => {
  it('el secreto minimo no es trivial y la ruta es la del Route Handler', () => {
    expect(LOTTERY_SYNC_SECRET_MIN_LENGTH).toBeGreaterThanOrEqual(16)
    expect(LOTTERY_SYNC_PATH).toBe('/api/lottery/sync')
  })

  it('Hobby usa jobs diarios; Pro, un intervalo de 15 minutos', () => {
    expect(LOTTERY_CRON_JOBS_HOBBY.length).toBeGreaterThanOrEqual(8)
    for (const job of LOTTERY_CRON_JOBS_HOBBY) {
      expect(job.path).toBe(LOTTERY_SYNC_PATH)
      expect(job.schedule).toMatch(/^\S+ \S+ \* \* \*$/)
      expect(job.schedule.startsWith('*/')).toBe(false)
    }
    expect(LOTTERY_CRON_JOBS_PRO[0]?.schedule).toContain('*/15')
  })

  it('vercel.json declara exactamente los jobs Hobby, sin intervalos subdiarios', () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
      fluid: boolean
      crons: { path: string; schedule: string }[]
    }
    expect(vercel.fluid).toBe(true)
    expect(vercel.crons).toEqual(lotteryVercelCrons())
    for (const job of vercel.crons) {
      expect(job.path).toBe(LOTTERY_SYNC_PATH)
      expect(job.schedule.startsWith('*/')).toBe(false)
    }
  })

  it('el proxy deja pasar la ruta y el handler exige el secreto', () => {
    const proxy = readFileSync(join(ROOT, 'src/lib/supabase/proxy.ts'), 'utf8')
    expect(proxy).toContain("'/api/lottery/sync'")

    const route = readFileSync(join(ROOT, 'src/app/api/lottery/sync/route.ts'), 'utf8')
    expect(route).toContain('authorizeLotterySyncRequest')
    expect(route).toContain('runLotterySyncTick')
    expect(route).not.toMatch(/getAuthUser|createClient\(/)
    expect(route).not.toMatch(/searchParams\.get\(['"]url['"]\)/)
  })

  it('el recuadro del Panel no importa el tick ni nada que salga a internet', () => {
    for (const file of ['queries.ts', 'dashboard.ts']) {
      const source = readFileSync(join(ROOT, `src/features/lottery/${file}`), 'utf8')
      expect(source).not.toContain('runLotterySyncTick')
      expect(source).not.toMatch(/from '\.\/(job|fetch|adapters|sync)'/)
      expect(source).not.toContain('downloadCundinamarcaActa')
      // Ni una llamada de red directa desde una pantalla (BR-L20).
      expect(source).not.toMatch(/\bfetch\s*\(/)
    }
  })
})
