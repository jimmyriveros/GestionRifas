/**
 * «Resultados de la semana» contra la base local, con sesiones reales
 * (BR-H02..BR-H05, D-194).
 *
 * Se ejercen las MISMAS funciones de producción —`getWeeklyResults` y
 * `getWeeklyResultsRaffle`—. Lo único que se sustituye es de dónde sale el
 * cliente de Supabase: en la aplicación, de las cookies de la petición; aquí, de
 * `signInAs`. Así lo que se prueba es la RLS de verdad (D-043), no un doble.
 *
 * La semana de estas pruebas vive en 2098, lejos del seed y de las demás suites
 * de loterías (2099 en adelante). Sus programaciones llevan el prefijo `WR-` y se
 * borran al empezar y al terminar; la configuración del catálogo que se toque se
 * devuelve tal como estaba.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { LOTTERY_CODES, type LotteryCode } from '@/features/lottery/constants'
import { lastCompletedWeek, lotteryReferenceDate } from '@/features/weekly-results/week'

import { anonClient, loadSeedContext, serviceClient, signInAs, USERS, type Client } from './helpers'

const sesion = vi.hoisted(() => ({ client: null as unknown }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => sesion.client,
}))

const { getWeeklyResults, getWeeklyResultsRaffle } =
  await import('@/features/weekly-results/queries')

const WEEK = lastCompletedWeek('2098-06-15')
const PREFIX = 'WR-'

const NUMBERS: Record<LotteryCode, string> = {
  cundinamarca: '2718',
  cruz_roja: '3141',
  meta: '0046',
  bogota: '1618',
  medellin: '5772',
  boyaca: '0007',
}

type ResultValue = {
  winningNumber: string | null
  status: 'confirmed' | 'pending' | 'conflict' | 'rejected'
}

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let seller2: Client
let otherOrgSeller: Client
let originalRaffleId: string | null = null
const scheduleIds = new Map<LotteryCode, string>()

async function removeFixtures(): Promise<void> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('lottery_draw_schedules')
    .select('id')
    .like('draw_number', `${PREFIX}%`)
  if (error) throw error
  const ids = (data ?? []).map((row) => row.id)
  if (ids.length === 0) return
  const results = await svc.from('lottery_results').delete().in('schedule_id', ids)
  if (results.error) throw results.error
  const schedules = await svc.from('lottery_draw_schedules').delete().in('id', ids)
  if (schedules.error) throw schedules.error
}

/**
 * Deja el resultado de una lotería como se pide, BORRANDO y volviendo a crear la
 * fila: un UPDATE de un número confirmado lo convierte en conflicto a propósito
 * (`lottery_results_protect_confirmed`, BR-L08), y eso no es lo que se prueba.
 */
async function setResult(code: LotteryCode, value: ResultValue | null): Promise<void> {
  const svc = serviceClient()
  const scheduleId = scheduleIds.get(code)
  if (scheduleId === undefined) throw new Error(`Sin programacion de ${code}`)
  const removed = await svc.from('lottery_results').delete().eq('schedule_id', scheduleId)
  if (removed.error) throw removed.error
  if (value === null) return
  const at = `${lotteryReferenceDate(WEEK, code)}T23:00:00-05:00`
  const inserted = await svc.from('lottery_results').insert({
    schedule_id: scheduleId,
    winning_number: value.winningNumber,
    validation_status: value.status,
    source_url: 'https://cnjsa.coljuegos.gov.co/',
    source_kind: 'official_page',
    confirmed_at: value.status === 'confirmed' ? at : null,
  })
  if (inserted.error) throw inserted.error
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  ;[seller1, seller2, otherOrgSeller] = await Promise.all([
    signInAs(USERS.seller1),
    signInAs(USERS.seller2),
    signInAs(USERS.otherOrgSeller),
  ])

  const { data: membership, error: membershipError } = await ctx.svc
    .from('memberships')
    .select('public_raffle_id')
    .eq('profile_id', ctx.ids.seller1)
    .single()
  if (membershipError) throw membershipError
  originalRaffleId = membership.public_raffle_id

  await removeFixtures()
  for (const code of LOTTERY_CODES) {
    const referenceDate = lotteryReferenceDate(WEEK, code)
    const at = `${referenceDate}T22:30:00-05:00`
    const { data, error } = await ctx.svc
      .from('lottery_draw_schedules')
      .insert({
        lottery_code: code,
        draw_number: `${PREFIX}${code}`,
        reference_date: referenceDate,
        original_scheduled_at: at,
        official_scheduled_at: at,
        schedule_status: 'completed',
        source_url: 'https://cnjsa.coljuegos.gov.co/',
        source_authority: 'CNJSA',
        verified_at: at,
      })
      .select('id')
      .single()
    if (error) throw error
    scheduleIds.set(code, data.id)
    await setResult(code, { winningNumber: NUMBERS[code], status: 'confirmed' })
  }
})

afterAll(async () => {
  await removeFixtures()
  if (ctx) {
    await ctx.svc
      .from('memberships')
      .update({ public_raffle_id: originalRaffleId })
      .eq('profile_id', ctx.ids.seller1)
  }
})

describe('la lectura de los seis resultados (BR-H02)', () => {
  it('un vendedor los lee confirmados, en el orden de la semana y con sus ceros', async () => {
    sesion.client = seller1
    const week = await getWeeklyResults(WEEK)
    expect(week.kind).toBe('ready')
    if (week.kind !== 'ready') return
    expect(week.results.map((item) => item.code)).toEqual([...LOTTERY_CODES])
    expect(Object.fromEntries(week.results.map((item) => [item.code, item.winningNumber]))).toEqual(
      NUMBERS,
    )
  })

  it('son nacionales: el vendedor de otra organización lee los mismos seis', async () => {
    sesion.client = otherOrgSeller
    const week = await getWeeklyResults(WEEK)
    expect(week.kind).toBe('ready')
    if (week.kind === 'ready')
      expect(week.results.find((item) => item.code === 'meta')?.winningNumber).toBe('0046')
  })

  it('sin sesión no se lee nada: `anon` no tiene ni el permiso, así que nunca está listo', async () => {
    // Más fuerte que la RLS: `0036` concede SELECT solo a `authenticated`. La
    // consulta falla por permiso y la pantalla cae en su estado de error.
    const anon = anonClient()
    const directa = await anon.from('lottery_draw_schedules').select('id').limit(1)
    expect(directa.data ?? []).toEqual([])
    expect(directa.error?.code).toBe('42501')

    sesion.client = anon
    const week = await getWeeklyResults(WEEK)
    expect(week.kind).toBe('error')
  })
})

describe('nunca un resumen parcial (BR-H03)', () => {
  it('con un resultado sin publicar, la semana está pendiente y no enseña ese número', async () => {
    await setResult('meta', { winningNumber: null, status: 'pending' })
    try {
      sesion.client = seller1
      const week = await getWeeklyResults(WEEK)
      expect(week.kind).toBe('pending')
      if (week.kind !== 'pending') return
      expect(week.missing).toEqual(['meta'])
      expect(week.results.find((item) => item.code === 'meta')?.winningNumber).toBeNull()
      expect(week.results.find((item) => item.code === 'boyaca')?.winningNumber).toBe('0007')
    } finally {
      await setResult('meta', { winningNumber: NUMBERS.meta, status: 'confirmed' })
    }
  })

  it('sin fila de resultado, igual', async () => {
    await setResult('cundinamarca', null)
    try {
      sesion.client = seller1
      const week = await getWeeklyResults(WEEK)
      expect(week.kind).toBe('pending')
      if (week.kind === 'pending') expect(week.missing).toEqual(['cundinamarca'])
    } finally {
      await setResult('cundinamarca', { winningNumber: NUMBERS.cundinamarca, status: 'confirmed' })
    }
  })

  it('un conflicto no cuenta, y su número no sale de la base hacia la pantalla', async () => {
    await setResult('bogota', { winningNumber: '9217', status: 'conflict' })
    try {
      sesion.client = seller1
      const week = await getWeeklyResults(WEEK)
      expect(week.kind).toBe('pending')
      if (week.kind !== 'pending') return
      expect(week.results.find((item) => item.code === 'bogota')).toMatchObject({
        status: 'conflict',
        winningNumber: null,
      })
      expect(JSON.stringify(week)).not.toContain('9217')
    } finally {
      await setResult('bogota', { winningNumber: NUMBERS.bogota, status: 'confirmed' })
    }
  })

  it('un rechazado tampoco', async () => {
    await setResult('medellin', { winningNumber: null, status: 'rejected' })
    try {
      sesion.client = seller1
      const week = await getWeeklyResults(WEEK)
      expect(week.kind).toBe('pending')
    } finally {
      await setResult('medellin', { winningNumber: NUMBERS.medellin, status: 'confirmed' })
    }
  })
})

describe('la rifa de la imagen sale del catálogo de quien pregunta (BR-H04, BR-H05)', () => {
  it('con la rifa configurada, su nombre tal como está guardado', async () => {
    const updated = await ctx.svc
      .from('memberships')
      .update({ public_raffle_id: ctx.demoRaffle.id })
      .eq('profile_id', ctx.ids.seller1)
    expect(updated.error).toBeNull()

    sesion.client = seller1
    expect(await getWeeklyResultsRaffle(ctx.ids.seller1)).toEqual({
      kind: 'ready',
      name: ctx.demoRaffle.name,
    })
  })

  it('con el identificador de otro vendedor, la base no devuelve su rifa', async () => {
    sesion.client = seller2
    expect(await getWeeklyResultsRaffle(ctx.ids.seller1)).toEqual({ kind: 'none' })

    sesion.client = otherOrgSeller
    expect(await getWeeklyResultsRaffle(ctx.ids.seller1)).toEqual({ kind: 'none' })
  })

  it('sin rifa configurada, ninguna: no se toma la activa más reciente', async () => {
    sesion.client = otherOrgSeller
    expect(await getWeeklyResultsRaffle(ctx.ids.otherOrgSeller)).toEqual({ kind: 'none' })
  })
})
