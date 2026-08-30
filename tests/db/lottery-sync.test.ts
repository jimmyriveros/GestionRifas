/**
 * Sincronizacion, coincidencias y avisos — Etapa 3 (BR-L18, BR-L19, D-145, D-146).
 *
 * Las escrituras van por RPC con service_role. Las lecturas de avisos y
 * coincidencias se comprueban con sesiones reales (D-043).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LOTTERY_NOTIFICATION_KIND } from '@/features/lottery/constants'

import {
  loadSeedContext,
  randomNumbers,
  signInAs,
  USERS,
  type Client,
} from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let seller2: Client
let owner: Client
let otherOrgOwner: Client

let raffleA: string
let raffleB: string
let PRICE: number
let seq = 700 + (Date.now() % 20_000)

const CREATED_BEFORE = '2097-06-01T10:00:00-05:00'
const BEFORE = '2097-06-15T20:00:00-05:00'
const DRAW_AT = '2097-06-15T23:00:00-05:00'
const AFTER = '2097-06-16T01:00:00-05:00'

const SOURCE = {
  url: 'https://cnjsa.coljuegos.gov.co/publicaciones/306418/cronograma-de-sorteos-ordinarios-y-extraordinarios/',
  authority: 'CNJSA',
  document_version: 'xlsx-prueba-etapa-3',
  content_hash: 'ab'.repeat(32),
  verified_at: '2097-01-02T12:00:00-05:00',
}

function nextRefDate(): string {
  const n = seq++
  const d = new Date(Date.UTC(2097, 0, n))
  return d.toISOString().slice(0, 10)
}

function nextDrawNumber(): string {
  return `S${Date.now().toString(36)}${seq}${Math.floor(Math.random() * 1000)}`
}

function isoAt(date: string, hour = 23): string {
  return `${date}T${String(hour).padStart(2, '0')}:00:00-05:00`
}

async function createRaffle(name: string): Promise<string> {
  const { data, error } = await ctx.svc
    .from('raffles')
    .insert({
      organization_id: ctx.demoOrg.id,
      name,
      start_date: '2097-01-01',
      end_date: '2199-12-31',
      status: 'active',
      ticket_price: PRICE,
      created_by: ctx.ids.owner,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear la rifa: ${error.message}`)
  return data.id
}

async function createTicket(values: {
  raffleId: string
  sellerId: string
  daily: string
  weekly: string
  status?: 'available' | 'assigned'
  assignedAt?: string
}): Promise<string> {
  const { data, error } = await ctx.svc
    .from('tickets')
    .insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: values.raffleId,
      seller_id: values.sellerId,
      created_by: ctx.ids.owner,
      daily_number: values.daily,
      weekly_number: values.weekly,
      inventory_status: 'available',
      created_at: CREATED_BEFORE,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear la boleta: ${error.message}`)

  if (values.status === 'assigned') {
    const { error: assignError } = await ctx.svc
      .from('tickets')
      .update({
        client_id: ctx.clients.ana.id,
        inventory_status: 'assigned',
        sale_price: PRICE,
        sale_date: '2097-06-01',
        assigned_at: values.assignedAt ?? BEFORE,
      })
      .eq('id', data.id)
    if (assignError) throw new Error(`No se pudo asignar: ${assignError.message}`)
  }
  return data.id
}

function drawPayload(values: {
  lottery: 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'
  drawNumber: string
  referenceDate: string
  officialAt?: string
  originalAt?: string
  status?: string
  reason?: string | null
}) {
  const official = values.officialAt ?? isoAt(values.referenceDate)
  return {
    lottery_code: values.lottery,
    draw_number: values.drawNumber,
    reference_date: values.referenceDate,
    original_scheduled_at: values.originalAt ?? isoAt(values.referenceDate),
    official_scheduled_at: official,
    schedule_status: values.status ?? 'scheduled',
    change_reason: values.reason ?? null,
  }
}

async function syncDraws(draws: ReturnType<typeof drawPayload>[], hash = SOURCE.content_hash) {
  return ctx.svc.rpc('sync_lottery_schedules', {
    p_draws: draws,
    p_source: { ...SOURCE, content_hash: hash },
  })
}

async function confirm(values: {
  lottery: 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'
  drawNumber: string
  winningNumber: string
  officialDate: string
  series?: string | null
}) {
  return ctx.svc.rpc('confirm_lottery_result', {
    p_lottery_code: values.lottery,
    p_draw_number: values.drawNumber,
    p_winning_number: values.winningNumber,
    p_series: values.series ?? undefined,
    p_source_url: 'https://www.loteriadebogota.com/',
    p_source_kind: 'official_page',
    p_official_date: values.officialDate,
    p_fetched_at: isoAt(values.officialDate),
  })
}

async function inbox(client: Client, kind: string, entityId?: string) {
  let query = client.from('notifications').select('id, kind, data, entity_id').eq('kind', kind)
  if (entityId) query = query.eq('entity_id', entityId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
  otherOrgOwner = await signInAs(USERS.otherOrgOwner)

  const { data: seedRaffle, error } = await ctx.svc
    .from('raffles')
    .select('ticket_price')
    .eq('id', ctx.demoRaffle.id)
    .single()
  if (error) throw error
  PRICE = Number(seedRaffle.ticket_price)

  const stamp = Date.now()
  raffleA = await createRaffle(`Loteria sync A ${stamp}`)
  raffleB = await createRaffle(`Loteria sync B ${stamp}`)
}, 60_000)

afterAll(async () => {
  await seller1?.auth.signOut()
  await seller2?.auth.signOut()
  await owner?.auth.signOut()
  await otherOrgOwner?.auth.signOut()
})

describe('sincronizacion de programacion (BR-L18)', () => {
  it('inserta, reintentar no duplica, y un hash nuevo sin cambio real no sube la version', async () => {
    const drawNumber = nextDrawNumber()
    const referenceDate = nextRefDate()
    const first = await syncDraws([
      drawPayload({ lottery: 'bogota', drawNumber, referenceDate }),
    ])
    expect(first.error).toBeNull()
    expect((first.data as { inserted: number }).inserted).toBe(1)

    const second = await syncDraws(
      [drawPayload({ lottery: 'bogota', drawNumber, referenceDate })],
      'cd'.repeat(32),
    )
    expect(second.error).toBeNull()
    expect((second.data as { inserted: number; skipped: number }).inserted).toBe(0)
    expect((second.data as { skipped: number }).skipped).toBe(1)

    const { data, error } = await ctx.svc
      .from('lottery_draw_schedules')
      .select('schedule_version, source_content_hash, reference_date')
      .eq('lottery_code', 'bogota')
      .eq('draw_number', drawNumber)
      .single()
    expect(error).toBeNull()
    expect(data?.schedule_version).toBe(1)
    expect(data?.source_content_hash).toBe('cd'.repeat(32))
    expect(data?.reference_date).toBe(referenceDate)
  })

  it('conserva original_scheduled_at y reference_date al aplazar', async () => {
    const drawNumber = nextDrawNumber()
    const referenceDate = nextRefDate()
    const original = isoAt(referenceDate)
    await syncDraws([
      drawPayload({
        lottery: 'cundinamarca',
        drawNumber,
        referenceDate,
        officialAt: original,
        originalAt: original,
      }),
    ])
    const later = isoAt(addDays(referenceDate, 1))
    const changed = await syncDraws([
      drawPayload({
        lottery: 'cundinamarca',
        drawNumber,
        referenceDate,
        officialAt: later,
        originalAt: later,
        status: 'rescheduled_later',
        reason: 'official_change',
      }),
    ])
    expect((changed.data as { changed: number }).changed).toBe(1)

    const { data } = await ctx.svc
      .from('lottery_draw_schedules')
      .select(
        'reference_date, original_scheduled_at, official_scheduled_at, schedule_status, schedule_version',
      )
      .eq('draw_number', drawNumber)
      .single()
    expect(data?.reference_date).toBe(referenceDate)
    expect(new Date(data?.original_scheduled_at ?? '').getTime()).toBe(new Date(original).getTime())
    expect(data?.schedule_status).toBe('rescheduled_later')
    expect(data?.schedule_version).toBe(2)
  })

  it('una fecha de referencia distinta para el mismo sorteo queda en conflicto, sin reescribirla', async () => {
    const drawNumber = nextDrawNumber()
    const referenceDate = nextRefDate()
    await syncDraws([drawPayload({ lottery: 'meta', drawNumber, referenceDate })])
    const otherRef = nextRefDate()
    const conflicted = await syncDraws([
      drawPayload({ lottery: 'meta', drawNumber, referenceDate: otherRef }),
    ])
    expect((conflicted.data as { conflicts: number }).conflicts).toBe(1)

    const { data } = await ctx.svc
      .from('lottery_draw_schedules')
      .select('reference_date, schedule_status')
      .eq('draw_number', drawNumber)
      .single()
    expect(data?.reference_date).toBe(referenceDate)
    expect(data?.schedule_status).toBe('schedule_conflict')
  })

  it('authenticated no puede sincronizar', async () => {
    const { error } = await owner.rpc('sync_lottery_schedules', {
      p_draws: [],
      p_source: SOURCE,
    })
    expect(error).not.toBeNull()
  })
})

describe('confirmacion, matching y avisos (BR-L19)', () => {
  it('confirma, fotografía y avisa una vez; el reintento no duplica', async () => {
    const { daily, weekly } = randomNumbers()
    await createTicket({
      raffleId: raffleA,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
      status: 'assigned',
    })
    const drawNumber = nextDrawNumber()
    const referenceDate = nextRefDate()
    await syncDraws([
      drawPayload({
        lottery: 'bogota',
        drawNumber,
        referenceDate,
        officialAt: DRAW_AT,
        originalAt: DRAW_AT,
      }),
    ])

    const first = await confirm({
      lottery: 'bogota',
      drawNumber,
      winningNumber: daily,
      officialDate: '2097-06-15',
    })
    expect(first.error).toBeNull()
    const payload = first.data as {
      result_id: string
      matches_inserted: number
      notifications_inserted: number
      validation_status: string
      schedule_status: string
    }
    expect(payload.validation_status).toBe('confirmed')
    expect(payload.schedule_status).toBe('completed')
    expect(payload.matches_inserted).toBeGreaterThanOrEqual(1)
    expect(payload.notifications_inserted).toBeGreaterThanOrEqual(1)

    const second = await confirm({
      lottery: 'bogota',
      drawNumber,
      winningNumber: daily,
      officialDate: '2097-06-15',
    })
    expect(second.error).toBeNull()
    expect((second.data as { matches_inserted: number }).matches_inserted).toBe(0)
    expect((second.data as { notifications_inserted: number }).notifications_inserted).toBe(0)

    const sellerNotes = await inbox(seller1, LOTTERY_NOTIFICATION_KIND.result, payload.result_id)
    expect(sellerNotes).toHaveLength(1)
    expect(sellerNotes[0]?.data).toMatchObject({
      audience: 'seller',
      winning_number: daily,
      sold_count: 1,
    })

    const seller2Notes = await inbox(seller2, LOTTERY_NOTIFICATION_KIND.result, payload.result_id)
    expect(seller2Notes).toHaveLength(0)

    const ownerNotes = await inbox(owner, LOTTERY_NOTIFICATION_KIND.result, payload.result_id)
    expect(ownerNotes).toHaveLength(1)
    expect(ownerNotes[0]?.data).toMatchObject({ audience: 'staff' })

    const otherNotes = await inbox(
      otherOrgOwner,
      LOTTERY_NOTIFICATION_KIND.result,
      payload.result_id,
    )
    expect(otherNotes).toHaveLength(0)
  })

  it('varias rifas coinciden todas y el personal ve el recuento', async () => {
    const { daily } = randomNumbers()
    await createTicket({
      raffleId: raffleA,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: randomNumbers().weekly,
    })
    await createTicket({
      raffleId: raffleB,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: randomNumbers().weekly,
    })
    const drawNumber = nextDrawNumber()
    const referenceDate = nextRefDate()
    await syncDraws([
      drawPayload({
        lottery: 'medellin',
        drawNumber,
        referenceDate,
        officialAt: DRAW_AT,
      }),
    ])
    const { data, error } = await confirm({
      lottery: 'medellin',
      drawNumber,
      winningNumber: daily,
      officialDate: '2097-06-15',
    })
    expect(error).toBeNull()
    const resultId = (data as { result_id: string }).result_id
    const { data: matches } = await ctx.svc
      .from('lottery_ticket_matches')
      .select('raffle_id')
      .eq('result_id', resultId)
    expect(new Set((matches ?? []).map((row) => row.raffle_id)).size).toBeGreaterThanOrEqual(2)

    const staff = await inbox(owner, LOTTERY_NOTIFICATION_KIND.result, resultId)
    const staffData = staff[0]?.data as Record<string, unknown> | undefined
    expect(Number(staffData?.raffle_count)).toBeGreaterThanOrEqual(2)
  })

  it('el pago no cambia el estado de venta de la fotografia', async () => {
    const { daily, weekly } = randomNumbers()
    const ticketId = await createTicket({
      raffleId: raffleA,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
      status: 'assigned',
    })
    const { error: payError } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 1000,
      p_allocations: [{ ticket_id: ticketId, amount: 1000 }],
    })
    expect(payError).toBeNull()

    const drawNumber = nextDrawNumber()
    await syncDraws([
      drawPayload({
        lottery: 'meta',
        drawNumber,
        referenceDate: nextRefDate(),
        officialAt: DRAW_AT,
      }),
    ])
    const { data, error } = await confirm({
      lottery: 'meta',
      drawNumber,
      winningNumber: daily,
      officialDate: '2097-06-15',
    })
    expect(error).toBeNull()
    const { data: photo } = await ctx.svc
      .from('lottery_ticket_matches')
      .select('assignment_status, ticket_id')
      .eq('result_id', (data as { result_id: string }).result_id)
      .eq('ticket_id', ticketId)
      .single()
    expect(photo?.assignment_status).toBe('sold')
  })

  it('una asignacion tardia se fotografia como late_assignment, no como vendida', async () => {
    const { daily, weekly } = randomNumbers()
    const ticketId = await createTicket({
      raffleId: raffleA,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
    })
    await ctx.svc
      .from('tickets')
      .update({
        client_id: ctx.clients.ana.id,
        inventory_status: 'assigned',
        sale_price: PRICE,
        sale_date: '2097-06-16',
        assigned_at: AFTER,
      })
      .eq('id', ticketId)

    const drawNumber = nextDrawNumber()
    await syncDraws([
      drawPayload({
        lottery: 'cruz_roja',
        drawNumber,
        referenceDate: nextRefDate(),
        officialAt: DRAW_AT,
      }),
    ])
    const { data, error } = await confirm({
      lottery: 'cruz_roja',
      drawNumber,
      winningNumber: daily,
      officialDate: '2097-06-15',
    })
    expect(error).toBeNull()
    const { data: photo } = await ctx.svc
      .from('lottery_ticket_matches')
      .select('assignment_status, client_id')
      .eq('result_id', (data as { result_id: string }).result_id)
      .eq('ticket_id', ticketId)
      .single()
    expect(photo?.assignment_status).toBe('late_assignment')
    expect(photo?.client_id).toBeNull()
  })

  it('acepta un resultado publicado el dia siguiente (despues de medianoche)', async () => {
    const drawNumber = nextDrawNumber()
    await syncDraws([
      drawPayload({
        lottery: 'boyaca',
        drawNumber,
        referenceDate: nextRefDate(),
        officialAt: DRAW_AT,
      }),
    ])
    const { error } = await confirm({
      lottery: 'boyaca',
      drawNumber,
      winningNumber: '0046',
      officialDate: '2097-06-16',
    })
    expect(error).toBeNull()
  })

  it('un segundo numero distinto queda en conflicto y no avisa de nuevo', async () => {
    const drawNumber = nextDrawNumber()
    await syncDraws([
      drawPayload({
        lottery: 'bogota',
        drawNumber,
        referenceDate: nextRefDate(),
        officialAt: DRAW_AT,
      }),
    ])
    const first = await confirm({
      lottery: 'bogota',
      drawNumber,
      winningNumber: '1111',
      officialDate: '2097-06-15',
    })
    expect(first.error).toBeNull()
    const second = await confirm({
      lottery: 'bogota',
      drawNumber,
      winningNumber: '2222',
      officialDate: '2097-06-15',
    })
    expect(second.error).toBeNull()
    expect((second.data as { validation_status: string }).validation_status).toBe('conflict')
    expect((second.data as { notifications_inserted: number }).notifications_inserted).toBe(0)
  })

  it('un sorteo suspendido no se confirma', async () => {
    const drawNumber = nextDrawNumber()
    await syncDraws([
      drawPayload({
        lottery: 'medellin',
        drawNumber,
        referenceDate: nextRefDate(),
        officialAt: DRAW_AT,
        status: 'suspended',
        reason: 'force_majeure',
      }),
    ])
    const { error } = await confirm({
      lottery: 'medellin',
      drawNumber,
      winningNumber: '3333',
      officialDate: '2097-06-15',
    })
    expect(error).not.toBeNull()
  })

  it('una interrupcion (resultado ya confirmado, avisos pendientes) se completa al reintentar', async () => {
    const { daily, weekly } = randomNumbers()
    await createTicket({
      raffleId: raffleA,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
    })
    const drawNumber = nextDrawNumber()
    await syncDraws([
      drawPayload({
        lottery: 'cundinamarca',
        drawNumber,
        referenceDate: nextRefDate(),
        officialAt: DRAW_AT,
      }),
    ])
    const { data: schedule } = await ctx.svc
      .from('lottery_draw_schedules')
      .select('id')
      .eq('draw_number', drawNumber)
      .single()
    const { data: result, error: insertError } = await ctx.svc
      .from('lottery_results')
      .insert({
        schedule_id: schedule!.id,
        winning_number: daily,
        validation_status: 'confirmed',
        source_url: 'https://www.loteriadecundinamarca.com.co/resultados',
        source_kind: 'official_page',
        confirmed_at: DRAW_AT,
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    const retry = await confirm({
      lottery: 'cundinamarca',
      drawNumber,
      winningNumber: daily,
      officialDate: '2097-06-15',
    })
    expect(retry.error).toBeNull()
    expect((retry.data as { result_id: string }).result_id).toBe(result!.id)
    expect((retry.data as { matches_inserted: number }).matches_inserted).toBeGreaterThanOrEqual(1)
    expect((retry.data as { notifications_inserted: number }).notifications_inserted).toBeGreaterThanOrEqual(
      1,
    )
  })

  it('dos confirmaciones concurrentes del mismo numero dejan un solo resultado', async () => {
    const drawNumber = nextDrawNumber()
    await syncDraws([
      drawPayload({
        lottery: 'bogota',
        drawNumber,
        referenceDate: nextRefDate(),
        officialAt: DRAW_AT,
      }),
    ])
    const params = {
      lottery: 'bogota' as const,
      drawNumber,
      winningNumber: '7777',
      officialDate: '2097-06-15',
    }
    const [a, b] = await Promise.all([confirm(params), confirm(params)])
    expect(a.error ?? b.error).toBeFalsy()
    const { data: schedule } = await ctx.svc
      .from('lottery_draw_schedules')
      .select('id')
      .eq('draw_number', drawNumber)
      .single()
    const { data: results } = await ctx.svc
      .from('lottery_results')
      .select('id, winning_number')
      .eq('schedule_id', schedule!.id)
    expect(results).toHaveLength(1)
    expect(results![0]!.winning_number).toBe('7777')
  })

  it('authenticated no puede confirmar', async () => {
    const { error } = await owner.rpc('confirm_lottery_result', {
      p_lottery_code: 'bogota',
      p_draw_number: '0',
      p_winning_number: '0000',
    })
    expect(error).not.toBeNull()
  })
})

describe('avisos de programacion (D-146)', () => {
  it('no avisa un aplazamiento a meses vista; si avisa dentro de 48 horas', async () => {
    const farNumber = nextDrawNumber()
    const farRef = nextRefDate()
    const farOfficial = isoAt(addDays(farRef, 1))
    await syncDraws([
      drawPayload({
        lottery: 'cundinamarca',
        drawNumber: farNumber,
        referenceDate: farRef,
        officialAt: farOfficial,
        status: 'rescheduled_later',
        reason: 'official_change',
      }),
    ])
    const far = await ctx.svc.rpc('notify_lottery_schedule_changes', {
      p_now: isoAt(addDays(farRef, -40), 12),
    })
    expect(far.error).toBeNull()

    const { data: farSchedule } = await ctx.svc
      .from('lottery_draw_schedules')
      .select('id')
      .eq('draw_number', farNumber)
      .single()
    expect(await inbox(owner, LOTTERY_NOTIFICATION_KIND.scheduleChange, farSchedule!.id)).toHaveLength(
      0,
    )

    const nearNumber = nextDrawNumber()
    const nearRef = nextRefDate()
    const nearOfficial = isoAt(nearRef)
    await syncDraws([
      drawPayload({
        lottery: 'cundinamarca',
        drawNumber: nearNumber,
        referenceDate: nearRef,
        officialAt: nearOfficial,
        status: 'rescheduled_later',
        reason: 'official_change',
      }),
    ])
    const nearNow = new Date(new Date(nearOfficial).getTime() - 36 * 3600_000).toISOString()
    const near = await ctx.svc.rpc('notify_lottery_schedule_changes', {
      p_now: nearNow,
    })
    expect(near.error).toBeNull()
    const { data: nearSchedule } = await ctx.svc
      .from('lottery_draw_schedules')
      .select('id')
      .eq('draw_number', nearNumber)
      .single()
    const notes = await inbox(
      owner,
      LOTTERY_NOTIFICATION_KIND.scheduleChange,
      nearSchedule!.id,
    )
    expect(notes.length).toBeGreaterThanOrEqual(1)
    expect(notes[0]?.data).toMatchObject({
      lottery_code: 'cundinamarca',
      schedule_status: 'rescheduled_later',
    })

    const again = await ctx.svc.rpc('notify_lottery_schedule_changes', {
      p_now: new Date(new Date(nearOfficial).getTime() - 12 * 3600_000).toISOString(),
    })
    expect(again.error).toBeNull()
    expect(
      await inbox(owner, LOTTERY_NOTIFICATION_KIND.scheduleChange, nearSchedule!.id),
    ).toHaveLength(notes.length)
  })

  it('un cambio historico del cronograma anual no genera avisos', async () => {
    const drawNumber = nextDrawNumber()
    const referenceDate = nextRefDate()
    const officialAt = isoAt(addDays(referenceDate, -2))
    await syncDraws([
      drawPayload({
        lottery: 'bogota',
        drawNumber,
        referenceDate,
        officialAt,
        originalAt: isoAt(referenceDate),
        status: 'rescheduled_earlier',
        reason: 'official_change',
      }),
    ])
    await ctx.svc.rpc('notify_lottery_schedule_changes', {
      p_now: isoAt(addDays(referenceDate, 120), 12),
    })
    const { data: schedule } = await ctx.svc
      .from('lottery_draw_schedules')
      .select('id')
      .eq('draw_number', drawNumber)
      .single()
    expect(await inbox(owner, LOTTERY_NOTIFICATION_KIND.scheduleChange, schedule!.id)).toHaveLength(0)
  })
})

function addDays(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number)
  const year = parts[0]!
  const month = parts[1]!
  const day = parts[2]!
  const utc = new Date(Date.UTC(year, month - 1, day + days, 12))
  return utc.toISOString().slice(0, 10)
}
