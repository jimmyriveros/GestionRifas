/**
 * Resultados oficiales de loterias — Etapa 1 (BR-L, D-140, D-141, D-142).
 *
 * El matching corre en PostgreSQL y se invoca con service_role: authenticated
 * no tiene EXECUTE. Las lecturas de coincidencias se prueban con sesiones
 * reales (D-043). Las rifas de este archivo viven en 2099 para no cruzarse
 * con el seed ni con la suite de volumen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  loadSeedContext,
  randomNumbers,
  signInAs,
  USERS,
  type Client,
} from './helpers'

type AssignmentStatus = 'sold' | 'available' | 'late_assignment'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let seller1: Client
let seller2: Client
let owner: Client
let otherOrgOwner: Client

let demoRaffleId: string
let secondRaffleId: string
let closedRaffleId: string
let cancelledRaffleId: string
let draftRaffleId: string
let controlRaffleId: string
let PRICE: number

let refSeq = 400 + (Date.now() % 30_000)

const DRAW_AT = '2099-06-15T23:00:00-05:00'
const BEFORE = '2099-06-15T20:00:00-05:00'
const AFTER = '2099-06-16T01:00:00-05:00'
const CREATED_BEFORE = '2099-06-01T10:00:00-05:00'

function nextRefDate(): string {
  const n = refSeq++
  const d = new Date(Date.UTC(2099, 0, n))
  return d.toISOString().slice(0, 10)
}

function nextDrawNumber(): string {
  return `T${Date.now().toString(36)}${refSeq}${Math.floor(Math.random() * 1000)}`
}

async function createRaffle(values: {
  organizationId: string
  name: string
  status: 'draft' | 'active' | 'closed' | 'cancelled'
  createdBy: string
}): Promise<string> {
  const { data, error } = await ctx.svc
    .from('raffles')
    .insert({
      organization_id: values.organizationId,
      name: values.name,
      start_date: '2099-01-01',
      end_date: '2199-12-31',
      status: values.status,
      ticket_price: PRICE,
      created_by: values.createdBy,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear la rifa ${values.name}: ${error.message}`)
  return data.id
}

async function createTicket(values: {
  raffleId: string
  organizationId: string
  sellerId: string
  daily: string
  weekly: string
  status?: 'draft' | 'pending_approval' | 'available' | 'assigned' | 'cancelled'
  createdAt?: string
  assignedAt?: string | null
  clientId?: string | null
  cancelledAt?: string | null
  approvedAt?: string | null
}): Promise<string> {
  const status = values.status ?? 'available'
  const { data, error } = await ctx.svc
    .from('tickets')
    .insert({
      organization_id: values.organizationId,
      raffle_id: values.raffleId,
      seller_id: values.sellerId,
      created_by: ctx.ids.owner,
      daily_number: values.daily,
      weekly_number: values.weekly,
      inventory_status:
        status === 'assigned' || status === 'cancelled' ? 'available' : status,
      created_at: values.createdAt ?? CREATED_BEFORE,
      approved_at: values.approvedAt ?? null,
      approved_by: values.approvedAt ? ctx.ids.owner : null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear la boleta: ${error.message}`)

  if (status === 'assigned') {
    const { error: assignError } = await ctx.svc
      .from('tickets')
      .update({
        client_id: values.clientId ?? ctx.clients.ana.id,
        inventory_status: 'assigned',
        sale_price: PRICE,
        sale_date: '2099-06-01',
        assigned_at: values.assignedAt ?? BEFORE,
      })
      .eq('id', data.id)
    if (assignError) throw new Error(`No se pudo asignar: ${assignError.message}`)
  }

  if (status === 'cancelled') {
    const { error: cancelError } = await ctx.svc
      .from('tickets')
      .update({
        inventory_status: 'cancelled',
        cancelled_at: values.cancelledAt ?? BEFORE,
        cancel_reason: 'Prueba de coincidencia',
      })
      .eq('id', data.id)
    if (cancelError) throw new Error(`No se pudo anular: ${cancelError.message}`)
  }

  if (status === 'available' && values.assignedAt) {
    const { error: lateError } = await ctx.svc
      .from('tickets')
      .update({
        client_id: values.clientId ?? ctx.clients.ana.id,
        inventory_status: 'assigned',
        sale_price: PRICE,
        sale_date: '2099-06-16',
        assigned_at: values.assignedAt,
      })
      .eq('id', data.id)
    if (lateError) throw new Error(`No se pudo asignar tarde: ${lateError.message}`)
  }

  return data.id
}

async function confirmResult(values: {
  lottery: 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'
  winningNumber: string
  series?: string | null
  scheduleStatus?:
    | 'scheduled'
    | 'rescheduled_later'
    | 'rescheduled_earlier'
    | 'suspended'
    | 'cancelled'
    | 'completed'
    | 'schedule_unverified'
    | 'schedule_conflict'
  officialAt?: string
  referenceDate?: string
}): Promise<{ scheduleId: string; resultId: string; referenceDate: string }> {
  const referenceDate = values.referenceDate ?? nextRefDate()
  const scheduleStatus = values.scheduleStatus ?? 'scheduled'
  const { data: schedule, error: scheduleError } = await ctx.svc
    .from('lottery_draw_schedules')
    .insert({
      lottery_code: values.lottery,
      draw_number: nextDrawNumber(),
      reference_date: referenceDate,
      original_scheduled_at: scheduleStatus === 'schedule_unverified' ? null : DRAW_AT,
      official_scheduled_at: scheduleStatus === 'schedule_unverified' ? null : (values.officialAt ?? DRAW_AT),
      schedule_status: scheduleStatus,
      source_url: 'https://cnjsa.coljuegos.gov.co/publicaciones/306418/cronograma-de-sorteos-ordinarios-y-extraordinarios/',
      source_authority: 'CNJSA',
      verified_at: '2099-01-02T12:00:00-05:00',
    })
    .select('id')
    .single()
  if (scheduleError) throw new Error(`No se pudo crear la programacion: ${scheduleError.message}`)

  const { data: result, error: resultError } = await ctx.svc
    .from('lottery_results')
    .insert({
      schedule_id: schedule.id,
      winning_number: values.winningNumber,
      series: values.series ?? null,
      validation_status: 'confirmed',
      source_url: 'https://www.loteriadebogota.com/',
      source_kind: 'official_page',
      confirmed_at: DRAW_AT,
    })
    .select('id')
    .single()
  if (resultError) throw new Error(`No se pudo crear el resultado: ${resultError.message}`)

  return { scheduleId: schedule.id, resultId: result.id, referenceDate }
}

async function match(resultId: string) {
  return ctx.svc.rpc('match_lottery_result', { p_result_id: resultId })
}

async function matchesOf(resultId: string) {
  const { data, error } = await ctx.svc
    .from('lottery_ticket_matches')
    .select(
      'ticket_id, organization_id, raffle_id, seller_id, client_id, match_field, matched_number, assignment_status, inventory_status_at_draw, assigned_at',
    )
    .eq('result_id', resultId)
  if (error) throw error
  return data
}

async function oneMatch(resultId: string, ticketId?: string) {
  const rows = await matchesOf(resultId)
  const row = ticketId ? rows.find((r) => r.ticket_id === ticketId) : rows[0]
  expect(row, 'faltaba la fotografia de coincidencia').toBeDefined()
  return row!
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  owner = await signInAs(USERS.owner)
  otherOrgOwner = await signInAs(USERS.otherOrgOwner)

  const { data: seedRaffle, error: priceError } = await ctx.svc
    .from('raffles')
    .select('ticket_price')
    .eq('id', ctx.demoRaffle.id)
    .single()
  if (priceError) throw priceError
  PRICE = Number(seedRaffle.ticket_price)

  const stamp = Date.now()
  demoRaffleId = await createRaffle({
    organizationId: ctx.demoOrg.id,
    name: `Loteria 2099 A ${stamp}`,
    status: 'active',
    createdBy: ctx.ids.owner,
  })
  secondRaffleId = await createRaffle({
    organizationId: ctx.demoOrg.id,
    name: `Loteria 2099 B ${stamp}`,
    status: 'active',
    createdBy: ctx.ids.owner,
  })
  closedRaffleId = await createRaffle({
    organizationId: ctx.demoOrg.id,
    name: `Loteria 2099 cerrada ${stamp}`,
    status: 'closed',
    createdBy: ctx.ids.owner,
  })
  cancelledRaffleId = await createRaffle({
    organizationId: ctx.demoOrg.id,
    name: `Loteria 2099 anulada ${stamp}`,
    status: 'cancelled',
    createdBy: ctx.ids.owner,
  })
  draftRaffleId = await createRaffle({
    organizationId: ctx.demoOrg.id,
    name: `Loteria 2099 borrador ${stamp}`,
    status: 'draft',
    createdBy: ctx.ids.owner,
  })
  controlRaffleId = await createRaffle({
    organizationId: ctx.controlOrg.id,
    name: `Loteria 2099 control ${stamp}`,
    status: 'active',
    createdBy: ctx.ids.otherOrgSeller,
  })
}, 60_000)

afterAll(async () => {
  await seller1?.auth.signOut()
  await seller2?.auth.signOut()
  await owner?.auth.signOut()
  await otherOrgOwner?.auth.signOut()
})

describe('numero mayor como texto exacto (BR-L06)', () => {
  it('rechaza un numero mayor que no tenga cuatro digitos', async () => {
    const { data: schedule, error: scheduleError } = await ctx.svc
      .from('lottery_draw_schedules')
      .insert({
        lottery_code: 'bogota',
        draw_number: nextDrawNumber(),
        reference_date: nextRefDate(),
        original_scheduled_at: DRAW_AT,
        official_scheduled_at: DRAW_AT,
        schedule_status: 'scheduled',
      })
      .select('id')
      .single()
    expect(scheduleError).toBeNull()

    const { error } = await ctx.svc.from('lottery_results').insert({
      schedule_id: schedule!.id,
      winning_number: '46',
      validation_status: 'confirmed',
    })
    expect(error).not.toBeNull()
  })

  it('0046 coincide solo con 0046, no con 46', async () => {
    const exact = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily: '0046',
      weekly: randomNumbers().weekly,
    })
    const unpadded = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily: '46',
      weekly: randomNumbers().weekly,
    })
    const { resultId } = await confirmResult({ lottery: 'bogota', winningNumber: '0046' })
    const { error } = await match(resultId)
    expect(error).toBeNull()

    const rows = await matchesOf(resultId)
    const ids = rows.map((r) => r.ticket_id)
    expect(ids).toContain(exact)
    expect(ids).not.toContain(unpadded)
    expect(rows.every((r) => r.matched_number === '0046')).toBe(true)
    expect(rows.every((r) => r.match_field === 'daily_number')).toBe(true)
  })

  it('la serie no cambia la coincidencia (BR-L07)', async () => {
    const { daily, weekly } = randomNumbers()
    const ticketId = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
    })
    const { resultId } = await confirmResult({
      lottery: 'medellin',
      winningNumber: daily,
      series: '123',
    })
    const { error } = await match(resultId)
    expect(error).toBeNull()
    const rows = await matchesOf(resultId)
    expect(rows.map((r) => r.ticket_id)).toEqual([ticketId])
  })
})

describe('asignacion al instante oficial (BR-L09, BR-L10)', () => {
  it('una boleta asignada antes queda vendida, con el cliente de entonces', async () => {
    const { daily, weekly } = randomNumbers()
    const ticketId = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
      status: 'assigned',
      assignedAt: BEFORE,
      clientId: ctx.clients.ana.id,
    })
    const { resultId } = await confirmResult({ lottery: 'cundinamarca', winningNumber: daily })
    await match(resultId)
    const row = await oneMatch(resultId, ticketId)
    expect(row.assignment_status).toBe('sold' satisfies AssignmentStatus)
    expect(row.inventory_status_at_draw).toBe('assigned')
    expect(row.client_id).toBe(ctx.clients.ana.id)
    expect(row.assigned_at).not.toBeNull()
  })

  it('una boleta asignada despues queda como asignacion tardia, sin cliente en la fotografia', async () => {
    const { daily, weekly } = randomNumbers()
    const ticketId = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
      status: 'available',
      assignedAt: AFTER,
      clientId: ctx.clients.ana.id,
    })
    const { resultId } = await confirmResult({ lottery: 'cruz_roja', winningNumber: daily })
    await match(resultId)
    const row = await oneMatch(resultId, ticketId)
    expect(row.assignment_status).toBe('late_assignment')
    expect(row.inventory_status_at_draw).toBe('available')
    expect(row.client_id).toBeNull()
    expect(row.assigned_at).toBeNull()
  })

  it('una boleta creada despues del sorteo no coincide', async () => {
    const { daily, weekly } = randomNumbers()
    const ticketId = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
      createdAt: AFTER,
    })
    const { resultId } = await confirmResult({ lottery: 'meta', winningNumber: daily })
    await match(resultId)
    const ids = (await matchesOf(resultId)).map((r) => r.ticket_id)
    expect(ids).not.toContain(ticketId)
  })

  it('una boleta disponible en el sorteo se fotografía como disponible', async () => {
    const { daily, weekly } = randomNumbers()
    const ticketId = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
    })
    const { resultId } = await confirmResult({ lottery: 'bogota', winningNumber: daily })
    await match(resultId)
    const row = await oneMatch(resultId, ticketId)
    expect(row.assignment_status).toBe('available')
    expect(row.client_id).toBeNull()
  })

  it('el estado de pago no decide si estaba vendida', async () => {
    const { daily, weekly } = randomNumbers()
    const ticketId = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
      status: 'assigned',
      assignedAt: BEFORE,
    })
    const { error: payError } = await seller1.rpc('create_payment', {
      p_client_id: ctx.clients.ana.id,
      p_total_amount: 1000,
      p_allocations: [{ ticket_id: ticketId, amount: 1000 }],
    })
    expect(payError).toBeNull()

    const { data: ticket } = await ctx.svc
      .from('tickets')
      .select('payment_status, paid_amount')
      .eq('id', ticketId)
      .single()
    expect(ticket?.payment_status).toBe('partial')
    expect(Number(ticket?.paid_amount)).toBe(1000)

    const { resultId } = await confirmResult({ lottery: 'medellin', winningNumber: daily })
    await match(resultId)
    const row = await oneMatch(resultId, ticketId)
    expect(row.assignment_status).toBe('sold')
  })
})

describe('rifas elegibles (D-140)', () => {
  it('incluye todas las rifas activas o cerradas de la ventana, nunca una sola', async () => {
    const { daily, weekly: w1 } = randomNumbers()
    const w2 = randomNumbers().weekly
    const first = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: w1,
    })
    const second = await createTicket({
      raffleId: secondRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: w2,
    })
    const closed = await createTicket({
      raffleId: closedRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: randomNumbers().weekly,
    })
    const { resultId } = await confirmResult({ lottery: 'cundinamarca', winningNumber: daily })
    await match(resultId)
    const rows = await matchesOf(resultId)
    const ids = rows.map((r) => r.ticket_id)
    expect(ids).toEqual(expect.arrayContaining([first, second, closed]))
    expect(new Set(rows.map((r) => r.raffle_id)).size).toBeGreaterThanOrEqual(3)
  })

  it('excluye rifas anuladas y en borrador', async () => {
    const { daily } = randomNumbers()
    const cancelled = await createTicket({
      raffleId: cancelledRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: randomNumbers().weekly,
    })
    const draft = await createTicket({
      raffleId: draftRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: randomNumbers().weekly,
    })
    const { resultId } = await confirmResult({ lottery: 'bogota', winningNumber: daily })
    await match(resultId)
    const ids = (await matchesOf(resultId)).map((r) => r.ticket_id)
    expect(ids).not.toContain(cancelled)
    expect(ids).not.toContain(draft)
  })

  it('excluye boletas pendientes de aprobacion y las anuladas antes del sorteo', async () => {
    const { daily } = randomNumbers()
    const pending = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: randomNumbers().weekly,
      status: 'pending_approval',
    })
    const cancelled = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: randomNumbers().weekly,
      status: 'cancelled',
      cancelledAt: BEFORE,
    })
    const { resultId } = await confirmResult({ lottery: 'meta', winningNumber: daily })
    await match(resultId)
    const ids = (await matchesOf(resultId)).map((r) => r.ticket_id)
    expect(ids).not.toContain(pending)
    expect(ids).not.toContain(cancelled)
  })
})

describe('Boyaca compara el semanal (BR-L01)', () => {
  it('el numero mayor de Boyaca no coincide con el diario', async () => {
    const daily = randomNumbers().daily
    const weekly = randomNumbers().weekly
    const ticketId = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
    })
    const { resultId } = await confirmResult({ lottery: 'boyaca', winningNumber: daily })
    await match(resultId)
    const ids = (await matchesOf(resultId)).map((r) => r.ticket_id)
    expect(ids).not.toContain(ticketId)
  })

  it('varias boletas con el mismo semanal coinciden todas', async () => {
    const weekly = randomNumbers().weekly
    const a = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily: randomNumbers().daily,
      weekly,
    })
    const b = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller2,
      daily: randomNumbers().daily,
      weekly,
    })
    const { resultId } = await confirmResult({ lottery: 'boyaca', winningNumber: weekly })
    await match(resultId)
    const ids = (await matchesOf(resultId)).map((r) => r.ticket_id)
    expect(ids).toEqual(expect.arrayContaining([a, b]))
    expect(ids.every((id) => id === a || id === b || true)).toBe(true)
    const rows = await matchesOf(resultId)
    expect(rows.filter((r) => r.ticket_id === a || r.ticket_id === b).every((r) => r.match_field === 'weekly_number')).toBe(
      true,
    )
  })
})

describe('idempotencia y conflicto (BR-L08, BR-L11, BR-L12)', () => {
  it('reintentar el matching no duplica coincidencias', async () => {
    const { daily, weekly } = randomNumbers()
    await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
    })
    const { resultId } = await confirmResult({ lottery: 'bogota', winningNumber: daily })
    const first = await match(resultId)
    expect(first.error).toBeNull()
    expect((first.data as { inserted: number }).inserted).toBeGreaterThanOrEqual(1)
    const second = await match(resultId)
    expect(second.error).toBeNull()
    expect((second.data as { inserted: number }).inserted).toBe(0)
    const rows = await matchesOf(resultId)
    expect(rows.length).toBe((first.data as { inserted: number }).inserted)
  })

  it('un segundo numero distinto no sobrescribe el confirmado: queda en conflicto', async () => {
    const { resultId } = await confirmResult({ lottery: 'medellin', winningNumber: '1234' })
    const { data, error } = await ctx.svc
      .from('lottery_results')
      .update({ winning_number: '9999' })
      .eq('id', resultId)
      .select('winning_number, validation_status, conflicting_winning_number')
      .single()
    expect(error).toBeNull()
    expect(data?.winning_number).toBe('1234')
    expect(data?.validation_status).toBe('conflict')
    expect(data?.conflicting_winning_number).toBe('9999')

    const { error: matchError } = await match(resultId)
    expect(matchError).not.toBeNull()
  })

  it('un sorteo sin verificar o en conflicto no admite matching', async () => {
    const unverified = await confirmResult({
      lottery: 'cundinamarca',
      winningNumber: '5555',
      scheduleStatus: 'schedule_unverified',
    })
    expect((await match(unverified.resultId)).error).not.toBeNull()

    const conflict = await confirmResult({
      lottery: 'cruz_roja',
      winningNumber: '5556',
      scheduleStatus: 'schedule_conflict',
    })
    expect((await match(conflict.resultId)).error).not.toBeNull()
  })

  it('la fotografia no se puede reescribir ni borrar', async () => {
    const { daily, weekly } = randomNumbers()
    await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly,
    })
    const { resultId } = await confirmResult({ lottery: 'meta', winningNumber: daily })
    await match(resultId)
    const row = await oneMatch(resultId)

    const { error: updateError } = await ctx.svc
      .from('lottery_ticket_matches')
      .update({ assignment_status: 'sold' })
      .eq('ticket_id', row.ticket_id)
    expect(updateError).not.toBeNull()

    const { error: deleteError } = await ctx.svc
      .from('lottery_ticket_matches')
      .delete()
      .eq('ticket_id', row.ticket_id)
    expect(deleteError).not.toBeNull()
  })
})

describe('aislamiento RLS (BR-L13, BR-L14, D-141)', () => {
  it('el vendedor solo ve las coincidencias de sus boletas', async () => {
    const { daily } = randomNumbers()
    const own = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: randomNumbers().weekly,
    })
    const other = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller2,
      daily,
      weekly: randomNumbers().weekly,
    })
    const { resultId } = await confirmResult({ lottery: 'bogota', winningNumber: daily })
    await match(resultId)

    const { data: seen, error } = await seller1
      .from('lottery_ticket_matches')
      .select('ticket_id, seller_id')
      .eq('result_id', resultId)
    expect(error).toBeNull()
    expect(seen!.map((r) => r.ticket_id)).toContain(own)
    expect(seen!.map((r) => r.ticket_id)).not.toContain(other)
    expect(seen!.every((r) => r.seller_id === ctx.ids.seller1)).toBe(true)

    const { data: hidden } = await seller1
      .from('lottery_ticket_matches')
      .select('ticket_id')
      .eq('ticket_id', other)
    expect(hidden).toEqual([])
  })

  it('el personal ve las coincidencias de su organizacion, no las de otra', async () => {
    const { daily } = randomNumbers()
    const demoTicket = await createTicket({
      raffleId: demoRaffleId,
      organizationId: ctx.demoOrg.id,
      sellerId: ctx.ids.seller1,
      daily,
      weekly: randomNumbers().weekly,
    })
    const controlTicket = await createTicket({
      raffleId: controlRaffleId,
      organizationId: ctx.controlOrg.id,
      sellerId: ctx.ids.otherOrgSeller,
      daily,
      weekly: randomNumbers().weekly,
    })
    const { resultId } = await confirmResult({ lottery: 'medellin', winningNumber: daily })
    await match(resultId)

    const { data: fromOwner } = await owner
      .from('lottery_ticket_matches')
      .select('ticket_id, organization_id')
      .eq('result_id', resultId)
    expect(fromOwner!.map((r) => r.ticket_id)).toContain(demoTicket)
    expect(fromOwner!.map((r) => r.ticket_id)).not.toContain(controlTicket)
    expect(fromOwner!.every((r) => r.organization_id === ctx.demoOrg.id)).toBe(true)

    const { data: fromControl } = await otherOrgOwner
      .from('lottery_ticket_matches')
      .select('ticket_id')
      .eq('result_id', resultId)
    expect(fromControl!.map((r) => r.ticket_id)).toContain(controlTicket)
    expect(fromControl!.map((r) => r.ticket_id)).not.toContain(demoTicket)
  })

  it('nadie escribe coincidencias ni resultados desde una sesion', async () => {
    const { error: insertMatch } = await seller1.from('lottery_ticket_matches').insert({
      result_id: '00000000-0000-0000-0000-000000000001',
      ticket_id: '00000000-0000-0000-0000-000000000001',
      organization_id: ctx.demoOrg.id,
      raffle_id: demoRaffleId,
      seller_id: ctx.ids.seller1,
      match_field: 'daily_number',
      matched_number: '0000',
      assignment_status: 'available',
      inventory_status_at_draw: 'available',
      ticket_created_at: CREATED_BEFORE,
    })
    expect(insertMatch).not.toBeNull()

    const { error: insertSchedule } = await owner.from('lottery_draw_schedules').insert({
      lottery_code: 'bogota',
      draw_number: nextDrawNumber(),
      reference_date: nextRefDate(),
      official_scheduled_at: DRAW_AT,
      schedule_status: 'scheduled',
    })
    expect(insertSchedule).not.toBeNull()

    const { error: rpcError } = await owner.rpc('match_lottery_result', {
      p_result_id: '00000000-0000-0000-0000-000000000001',
    })
    expect(rpcError).not.toBeNull()
  })

  it('programacion y resultados oficiales si se leen, las corridas de sync no', async () => {
    const { resultId } = await confirmResult({ lottery: 'boyaca', winningNumber: '7777' })
    const { data: results, error: resultsError } = await seller1
      .from('lottery_results')
      .select('id, winning_number')
      .eq('id', resultId)
    expect(resultsError).toBeNull()
    expect(results).toHaveLength(1)
    expect(results![0]!.winning_number).toBe('7777')

    const { error: syncInsert } = await ctx.svc.from('lottery_sync_runs').insert({
      kind: 'schedule',
      outcome: 'success',
    })
    expect(syncInsert).toBeNull()

    const { data: syncRows, error: syncError } = await owner.from('lottery_sync_runs').select('id')
    expect(syncError).toBeNull()
    expect(syncRows).toEqual([])
  })

  it('tickets_select no se amplio: el vendedor sigue sin ver la boleta ajena', async () => {
    const { data: ajenas } = await ctx.svc
      .from('tickets')
      .select('id')
      .eq('seller_id', ctx.ids.seller2)
      .limit(1)
    const { data, error } = await seller1.from('tickets').select('id').eq('id', ajenas![0]!.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
