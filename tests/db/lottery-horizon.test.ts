/**
 * Horizonte y presupuesto del sincronizador — mantenimiento (BR-L22, D-152).
 *
 * QUE REPRODUCE
 *
 * El cronograma CNJSA es ANUAL. Al importarlo nacen del orden de trescientos
 * sorteos de golpe, ninguno con resultado. Antes de D-152, el primer tick
 * recorria el ano entero e intentaba descargar CADA sorteo ya jugado: cientos
 * de consultas a fuentes oficiales dentro de una funcion con 180 s de margen.
 *
 * Aqui se monta ese cronograma completo en la base local y se ejerce el
 * orquestador REAL (`syncDueLotteryResults`), con la unica sustitucion de la
 * descarga externa —`fetchResult`— por un contador. Todo lo demas es de
 * verdad: PostgREST, el filtro, el orden, el limite, `lottery_sync_runs` y el
 * conteo de intentos por sorteo de la migracion `0041`.
 *
 * CONVENCION DE DATOS
 *
 * `lottery_draw_schedules` es nacional y las pruebas de loterias comparten la
 * tabla. Esta usa el ano **2095**, que no toca ni 2097 (lottery-sync) ni 2099
 * (lottery-results), y numeros de sorteo con prefijo propio. Al terminar,
 * borra lo suyo: bitacora, resultados y programacion, en ese orden, porque el
 * resultado referencia la programacion con `on delete restrict`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  LOTTERY_CODES,
  LOTTERY_RESULT_RETRY,
  LOTTERY_RESULT_SYNC,
  type LotteryCode,
} from '@/features/lottery/constants'
import { decideResultFetch, resultSyncHorizon } from '@/features/lottery/publication'
import {
  countResultAttempts,
  loadPendingResultDraws,
  syncDueLotteryResults,
} from '@/features/lottery/sync'
import type { AdapterOutcome, NormalizedLotteryResult } from '@/features/lottery/types'

import { loadSeedContext } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>

/** Mediodia de Bogota. El sorteo de ayer ya publico; el de hoy no ha jugado. */
const NOW = new Date('2095-09-01T12:00:00-05:00')

/** Medio ano hacia atras y medio hacia adelante: 53 fechas por loteria. */
const WEEKS_BACK = 26
const WEEKS_AHEAD = 26

/**
 * Dias entre `NOW` y el sorteo mas reciente de cada loteria, en el orden de
 * BR-L01. Cundinamarca juega el lunes, o sea AYER: es el caso que el encargo
 * exige cubrir.
 */
const DAYS_BEFORE_NOW: Record<LotteryCode, number> = {
  cundinamarca: 1,
  cruz_roja: 2,
  meta: 3,
  bogota: 4,
  medellin: 5,
  boyaca: 6,
}

const PREFIX = 'H95'

/**
 * Marca de esta prueba en `lottery_sync_runs`. Borrar por `schedule_id` no
 * sirve: trescientos UUID en un `in.()` pasan del tope de URI de PostgREST
 * —el mismo tope con el que tropezaba el sincronizador sin horizonte—.
 */
const RUN_TAG = '95000000-0000-4000-8000-000000000095'

type Draw = {
  id: string
  lotteryCode: LotteryCode
  drawNumber: string
  officialScheduledAt: string
}

/** `weeks` positivo va al pasado; 0 es el sorteo mas reciente ya jugado. */
const draws = new Map<string, Draw>()
let scheduleIds: string[] = []

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000)
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function key(lottery: LotteryCode, weeks: number): string {
  return `${lottery}:${weeks}`
}

function drawNumberOf(lottery: LotteryCode, weeks: number): string {
  return `${PREFIX}-${lottery}-${weeks}`
}

function drawOf(lottery: LotteryCode, weeks: number): Draw {
  const found = draws.get(key(lottery, weeks))
  if (!found) throw new Error(`No se preparo el sorteo ${key(lottery, weeks)}`)
  return found
}

type FetchResult = (
  lottery: LotteryCode,
  drawNumber: string,
) => Promise<AdapterOutcome<NormalizedLotteryResult>>

/** Descarga simulada: anota la llamada y nunca sale a internet. */
function counter(): { calls: string[]; fetchResult: FetchResult } {
  const calls: string[] = []
  return {
    calls,
    fetchResult: async (lottery, drawNumber) => {
      calls.push(drawNumber)
      return {
        ok: false,
        code: 'empty',
        message: `Prueba: ${lottery} todavia no publico.`,
      }
    },
  }
}

/** Deja a cero los intentos de los sorteos de esta prueba. */
async function resetRuns(): Promise<void> {
  const { error } = await ctx.svc.from('lottery_sync_runs').delete().eq('correlation_id', RUN_TAG)
  if (error) throw new Error(`No se pudo limpiar la bitacora: ${error.message}`)
}

/**
 * Borra todo lo de esta prueba, en el orden que exigen las claves foraneas.
 * Se llama tambien ANTES de montar el cronograma: si una ejecucion anterior
 * murio a medias, la siguiente no tiene que fallar por un numero repetido.
 */
async function cleanup(): Promise<void> {
  await ctx.svc.from('lottery_sync_runs').delete().eq('correlation_id', RUN_TAG)

  const { data } = await ctx.svc
    .from('lottery_draw_schedules')
    .select('id')
    .like('draw_number', `${PREFIX}-%`)
  const ids = (data ?? []).map((row) => row.id)
  for (const batch of chunk(ids, 40)) {
    await ctx.svc.from('lottery_results').delete().in('schedule_id', batch)
  }

  await ctx.svc.from('lottery_draw_schedules').delete().like('draw_number', `${PREFIX}-%`)
}

/** Ejerce el orquestador real marcando sus filas de bitacora. */
function tick(input: { fetchResult: FetchResult; maxFetches?: number }) {
  return syncDueLotteryResults(ctx.svc, {
    now: NOW,
    correlationId: RUN_TAG,
    fetchResult: input.fetchResult,
    maxFetches: input.maxFetches,
  })
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  await cleanup()

  const plan: { lottery: LotteryCode; weeks: number; drawNumber: string; at: string }[] = []
  for (const lottery of LOTTERY_CODES) {
    const mostRecent = addDays(NOW, -DAYS_BEFORE_NOW[lottery])
    for (let weeks = -WEEKS_AHEAD; weeks <= WEEKS_BACK; weeks += 1) {
      const day = addDays(mostRecent, -weeks * 7).toISOString().slice(0, 10)
      plan.push({
        lottery,
        weeks,
        drawNumber: drawNumberOf(lottery, weeks),
        at: `${day}T23:00:00-05:00`,
      })
    }
  }

  const { data, error } = await ctx.svc
    .from('lottery_draw_schedules')
    .insert(
      plan.map((entry) => ({
        lottery_code: entry.lottery,
        draw_number: entry.drawNumber,
        reference_date: entry.at.slice(0, 10),
        original_scheduled_at: entry.at,
        official_scheduled_at: entry.at,
        schedule_status: 'scheduled' as const,
      })),
    )
    .select('id, lottery_code, draw_number, official_scheduled_at')
  if (error) throw new Error(`No se pudo montar el cronograma anual: ${error.message}`)

  const byNumber = new Map((data ?? []).map((row) => [row.draw_number, row]))
  for (const entry of plan) {
    const row = byNumber.get(entry.drawNumber)
    if (!row?.official_scheduled_at) throw new Error(`Falta el sorteo ${entry.drawNumber}`)
    draws.set(key(entry.lottery, entry.weeks), {
      id: row.id,
      lotteryCode: entry.lottery,
      drawNumber: row.draw_number,
      officialScheduledAt: row.official_scheduled_at,
    })
  }
  scheduleIds = [...draws.values()].map((draw) => draw.id)
}, 60_000)

beforeEach(async () => {
  await resetRuns()
})

afterAll(async () => {
  await cleanup()
})

describe('cronograma anual recien importado (D-152)', () => {
  it('el cronograma entero se conserva: mas de trescientos sorteos', () => {
    expect(scheduleIds).toHaveLength(LOTTERY_CODES.length * (WEEKS_BACK + WEEKS_AHEAD + 1))
    expect(scheduleIds.length).toBeGreaterThan(300)
  })

  it('sin horizonte la seleccion era el ano entero; con el, una decena', async () => {
    // La consulta de antes de D-152, tal cual: sin ventana y sin limite.
    const { data, error } = await ctx.svc
      .from('lottery_draw_schedules')
      .select('id')
      .in('schedule_status', ['scheduled', 'rescheduled_later', 'rescheduled_earlier'])
      .not('official_scheduled_at', 'is', null)
      .like('draw_number', `${PREFIX}-%`)
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(300)

    const pending = await loadPendingResultDraws(ctx.svc, { now: NOW })
    expect(pending.length).toBeLessThan(20)
  })

  it('el primer tick no recorre el ano: se para en el tope de descargas', async () => {
    const { calls, fetchResult } = counter()
    const counts = await tick({ fetchResult })

    expect(calls.length).toBe(LOTTERY_RESULT_SYNC.maxFetchesPerTick)
    expect(counts.fetched).toBe(LOTTERY_RESULT_SYNC.maxFetchesPerTick)
    expect(counts.candidates).toBeLessThanOrEqual(LOTTERY_RESULT_SYNC.maxCandidates)
    // Lo que no cupo se aplaza; no se pierde ni se descarga a la fuerza.
    expect(counts.candidates).toBe(counts.fetched + counts.skipped + counts.deferred)
  })
})

describe('horizonte reciente (BR-L22)', () => {
  it('solo entran sorteos ya jugados de los ultimos dias, no el ano entero', async () => {
    const horizon = resultSyncHorizon(NOW)
    const pending = await loadPendingResultDraws(ctx.svc, { now: NOW })

    expect(pending.length).toBeGreaterThan(0)
    expect(pending.length).toBeLessThanOrEqual(LOTTERY_RESULT_SYNC.maxCandidates)

    for (const draw of pending) {
      const at = new Date(draw.officialScheduledAt).getTime()
      expect(at).toBeGreaterThanOrEqual(new Date(horizon.fromIso).getTime())
      expect(at).toBeLessThanOrEqual(NOW.getTime())
    }

    const mine = pending.filter((draw) => draw.drawNumber.startsWith(PREFIX))
    expect(mine.length).toBeLessThan(20)
    expect(mine.map((draw) => draw.id)).not.toContain(drawOf('boyaca', WEEKS_BACK).id)
    expect(mine.map((draw) => draw.id)).not.toContain(drawOf('cundinamarca', 3).id)
  })

  it('el orden es determinista: del mas reciente al mas antiguo', async () => {
    const first = await loadPendingResultDraws(ctx.svc, { now: NOW })
    const second = await loadPendingResultDraws(ctx.svc, { now: NOW })

    expect(second.map((draw) => draw.id)).toEqual(first.map((draw) => draw.id))
    const times = first.map((draw) => new Date(draw.officialScheduledAt).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('el sorteo de Cundinamarca del dia anterior sigue siendo elegible', async () => {
    const yesterday = drawOf('cundinamarca', 0)
    const pending = await loadPendingResultDraws(ctx.svc, { now: NOW })
    expect(pending[0]?.id).toBe(yesterday.id)

    const { calls, fetchResult } = counter()
    await tick({ fetchResult })
    expect(calls).toContain(yesterday.drawNumber)
  })

  it('una fecha futura espera: no es candidata y la decision es esperar', async () => {
    const nextWeek = drawOf('cundinamarca', -1)
    const pending = await loadPendingResultDraws(ctx.svc, { now: NOW })
    expect(pending.map((draw) => draw.id)).not.toContain(nextWeek.id)

    expect(
      decideResultFetch({
        lotteryCode: 'cundinamarca',
        officialScheduledAt: nextWeek.officialScheduledAt,
        now: NOW,
        validationStatus: 'none',
        failedAttempts: 0,
        lastAttemptAt: null,
        lastErrorCode: null,
      }),
    ).toBe('wait')

    const { calls, fetchResult } = counter()
    await tick({ fetchResult })
    expect(calls).not.toContain(nextWeek.drawNumber)
  })
})

describe('presupuesto de descargas por tick (BR-L22)', () => {
  it('el tope se respeta exactamente y lo que sobra queda aplazado', async () => {
    const { calls, fetchResult } = counter()
    const counts = await tick({ fetchResult, maxFetches: 2 })

    expect(calls.length).toBe(2)
    expect(counts.fetched).toBe(2)
    expect(counts.deferred).toBeGreaterThan(0)
  })

  it('un sorteo que espera su margen no gasta presupuesto: lo heredan los atrasados', async () => {
    // Los seis sorteos mas recientes acaban de intentarse: les toca esperar
    // los 30 minutos de `minIntervalMinutes`.
    const recent = LOTTERY_CODES.map((lottery) => drawOf(lottery, 0))
    const { error } = await ctx.svc.from('lottery_sync_runs').insert(
      recent.map((draw) => ({
        kind: 'results' as const,
        lottery_code: draw.lotteryCode,
        schedule_id: draw.id,
        outcome: 'failed' as const,
        error_code: 'empty',
        correlation_id: RUN_TAG,
        started_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
      })),
    )
    expect(error).toBeNull()

    const { calls, fetchResult } = counter()
    const counts = await tick({ fetchResult })

    for (const draw of recent) expect(calls).not.toContain(draw.drawNumber)
    expect(counts.skipped).toBeGreaterThanOrEqual(recent.length)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.length).toBeLessThanOrEqual(LOTTERY_RESULT_SYNC.maxFetchesPerTick)
    expect(calls).toContain(drawOf('cundinamarca', 1).drawNumber)
  })
})

describe('reintentos por sorteo, no por loteria (migracion 0041)', () => {
  it('los intentos de un sorteo no envejecen a otro de la misma loteria', async () => {
    const recent = drawOf('cundinamarca', 0)
    const older = drawOf('cundinamarca', 1)
    const total = LOTTERY_RESULT_RETRY.maxAttemptsTotal

    const { error } = await ctx.svc.from('lottery_sync_runs').insert(
      Array.from({ length: total }, (_, index) => ({
        kind: 'results' as const,
        lottery_code: 'cundinamarca' as const,
        schedule_id: older.id,
        outcome: 'failed' as const,
        attempt: index + 1,
        error_code: 'empty',
        correlation_id: RUN_TAG,
        started_at: new Date(NOW.getTime() - (index + 2) * 3_600_000).toISOString(),
      })),
    )
    expect(error).toBeNull()

    const olderAttempts = await countResultAttempts(ctx.svc, older.id)
    const recentAttempts = await countResultAttempts(ctx.svc, recent.id)
    expect(olderAttempts.failedAttempts).toBe(total)
    expect(recentAttempts.failedAttempts).toBe(0)

    // Con presupuesto de sobra, el agotado se salta y el reciente se consulta.
    const { calls, fetchResult } = counter()
    await tick({ fetchResult, maxFetches: 50 })
    expect(calls).toContain(recent.drawNumber)
    expect(calls).not.toContain(older.drawNumber)
  })

  it('cada descarga queda anotada contra su propio sorteo', async () => {
    const { fetchResult } = counter()
    await tick({ fetchResult })

    const { data, error } = await ctx.svc
      .from('lottery_sync_runs')
      .select('schedule_id, kind')
      .eq('correlation_id', RUN_TAG)
    expect(error).toBeNull()

    const rows = data ?? []
    expect(rows.length).toBe(LOTTERY_RESULT_SYNC.maxFetchesPerTick)
    expect(rows.every((row) => row.kind === 'results')).toBe(true)
    expect(new Set(rows.map((row) => row.schedule_id)).size).toBe(rows.length)
  })
})

describe('un resultado confirmado no se vuelve a consultar (BR-L21)', () => {
  it('el sorteo sigue siendo candidato pero no gasta una descarga', async () => {
    const draw = drawOf('cruz_roja', 0)
    const { error } = await ctx.svc.from('lottery_results').insert({
      schedule_id: draw.id,
      winning_number: '0046',
      validation_status: 'confirmed',
      source_url: 'https://ejemplo-oficial.test/resultado',
      confirmed_at: NOW.toISOString(),
    })
    expect(error).toBeNull()

    const pending = await loadPendingResultDraws(ctx.svc, { now: NOW })
    expect(pending.find((row) => row.id === draw.id)?.validationStatus).toBe('confirmed')

    const { calls, fetchResult } = counter()
    await tick({ fetchResult, maxFetches: 50 })
    expect(calls).not.toContain(draw.drawNumber)
  })
})
