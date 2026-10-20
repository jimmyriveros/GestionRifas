import 'server-only'

import { listRaffleNumberFormats } from '@/features/raffles/number-formats'
import { PAGE_SIZE } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'
import type { RaffleNumberFormat } from '@/lib/ticket-number-format'

import { parseAvailability, type InventoryAvailability } from './rules'

/**
 * Lecturas del inventario comun (D-257). Todas por funciones de la 0081: las
 * tablas nuevas no conceden nada a una sesion, y lo que cada rol puede ver lo
 * decide el tipo de retorno de esas funciones, no lo que esta pantalla elija
 * pintar.
 */

// ---------------------------------------------------------------------------
// Generaciones (personal)
// ---------------------------------------------------------------------------

export type GenerationRun = {
  id: string
  raffleId: string
  raffleName: string
  raffleShortCode: string
  dailyFrom: string
  dailyTo: string
  /** `null` en una rifa de un solo número (D-261). */
  weeklyFrom: string | null
  weeklyTo: string | null
  totalCount: number
  processedCount: number
  createdCount: number
  existingCount: number
  existingGeneratedCount: number
  status: 'in_progress' | 'completed'
  createdByName: string | null
  createdAt: string
  completedAt: string | null
  /** D-261: los números de su rifa, para nombrar sus rangos. */
  numberFormat?: RaffleNumberFormat
}

type RunRow = {
  id: string
  raffle_id: string
  raffle_name: string
  raffle_short_code: string
  daily_from: string
  daily_to: string
  weekly_from: string | null
  weekly_to: string | null
  total_count: number
  processed_count: number
  created_count: number
  existing_count: number
  existing_generated_count: number
  status: string
  created_by_name: string | null
  created_at: string
  completed_at: string | null
}

function mapRun(row: RunRow): GenerationRun {
  return {
    id: row.id,
    raffleId: row.raffle_id,
    raffleName: row.raffle_name,
    raffleShortCode: row.raffle_short_code,
    dailyFrom: row.daily_from,
    dailyTo: row.daily_to,
    weeklyFrom: row.weekly_from,
    weeklyTo: row.weekly_to,
    totalCount: row.total_count,
    processedCount: row.processed_count,
    createdCount: row.created_count,
    existingCount: row.existing_count,
    existingGeneratedCount: row.existing_generated_count,
    status: row.status === 'completed' ? 'completed' : 'in_progress',
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

/** Las generaciones de la organizacion: primero las que quedaron sin terminar. */
export async function listGenerationRuns(raffleId?: string, limit = 20): Promise<GenerationRun[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_ticket_generation_runs', {
    ...(raffleId ? { p_raffle_id: raffleId } : {}),
    p_limit: limit,
  })
  if (error) throw error
  const formats = await listRaffleNumberFormats()
  return ((data ?? []) as RunRow[]).map((row) => ({
    ...mapRun(row),
    numberFormat: formats.get(row.raffle_id),
  }))
}

/** Una generacion, o `null` si no existe o no es de la organizacion de quien pregunta. */
export async function getGenerationRun(runId: string): Promise<GenerationRun | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_ticket_generation_runs', {
    p_run_id: runId,
    p_limit: 1,
  })
  if (error) throw error
  const row = (data ?? [])[0] as RunRow | undefined
  if (!row) return null
  const formats = await listRaffleNumberFormats()
  return { ...mapRun(row), numberFormat: formats.get(row.raffle_id) }
}

export type GenerationExistingItem = {
  ticketId: string
  dailyNumber: string
  /** `null` en una rifa de un solo número (D-261). */
  weeklyNumber: string | null
  inventoryStatus: string
  otherGeneration: boolean
}

/** Las combinaciones que ya existian, paginadas (BR-N17). */
export async function listGenerationExisting(
  runId: string,
  page: number,
  pageSize = PAGE_SIZE,
): Promise<{ rows: GenerationExistingItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient()
  const current = Math.max(1, page)
  const { data, error } = await supabase.rpc('admin_ticket_generation_existing', {
    p_run_id: runId,
    p_limit: pageSize,
    p_offset: (current - 1) * pageSize,
  })
  if (error) throw error
  const rows = data ?? []
  let total = Number(rows[0]?.total_count ?? 0)
  if (rows.length === 0 && current > 1) {
    const { data: first } = await supabase.rpc('admin_ticket_generation_existing', {
      p_run_id: runId,
      p_limit: 1,
      p_offset: 0,
    })
    total = Number(first?.[0]?.total_count ?? 0)
  }
  return {
    rows: rows.map((row) => ({
      ticketId: row.ticket_id,
      dailyNumber: row.daily_number,
      weeklyNumber: row.weekly_number,
      inventoryStatus: row.inventory_status,
      otherGeneration: row.other_generation,
    })),
    total,
    page: current,
    pageSize,
  }
}

// ---------------------------------------------------------------------------
// Configuracion de los apartados (cualquier persona activa la lee)
// ---------------------------------------------------------------------------

export type HoldSettings = {
  raffleId: string
  durationMinutes: number
  maxActivePerSeller: number
  extensionMinutes: number
  isDefault: boolean
  /** Si quien pregunta puede cambiarla (`raffles.holds.manage`, el Dueño). */
  canManage: boolean
}

export async function getHoldSettings(raffleId: string): Promise<HoldSettings | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('raffle_hold_settings_for', { p_raffle_id: raffleId })
  if (error) throw error
  const row = data?.[0]
  if (!row) return null
  return {
    raffleId: row.raffle_id,
    durationMinutes: row.duration_minutes,
    maxActivePerSeller: row.max_active_per_seller,
    extensionMinutes: row.extension_minutes,
    isDefault: row.is_default,
    canManage: row.can_manage,
  }
}

// ---------------------------------------------------------------------------
// El catalogo interno (vendedor)
// ---------------------------------------------------------------------------

export type SellerInventoryRaffle = {
  raffleId: string
  raffleName: string
  raffleShortCode: string
  ticketPrice: number
  freeCount: number
  myActiveHolds: number
  durationMinutes: number
  maxActivePerSeller: number
  extensionMinutes: number
}

/** Las rifas activas del vendedor, con lo libre y su cupo. */
export async function getSellerInventorySummary(): Promise<SellerInventoryRaffle[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('seller_inventory_summary')
  if (error) throw error
  return (data ?? []).map((row) => ({
    raffleId: row.raffle_id,
    raffleName: row.raffle_name,
    raffleShortCode: row.raffle_short_code,
    ticketPrice: Number(row.ticket_price),
    freeCount: Number(row.free_count),
    myActiveHolds: Number(row.my_active_holds),
    durationMinutes: row.duration_minutes,
    maxActivePerSeller: row.max_active_per_seller,
    extensionMinutes: row.extension_minutes,
  }))
}

export type SellerInventoryItem = {
  /** `null` para lo ajeno: la base no lo devuelve (BR-I21). */
  ticketId: string | null
  dailyNumber: string
  /** `null` en una rifa de un solo número (D-261). */
  weeklyNumber: string | null
  availability: InventoryAvailability
  holdId: string | null
  holdExpiresAt: string | null
}

export type SellerInventoryFilters = {
  raffleId: string
  daily?: string
  weekly?: string
  onlyFree: boolean
  page?: number
  pageSize?: number
}

export async function listSellerInventoryTickets(filters: SellerInventoryFilters): Promise<{
  rows: SellerInventoryItem[]
  total: number
  page: number
  pageSize: number
}> {
  const supabase = await createClient()
  const pageSize = filters.pageSize ?? PAGE_SIZE
  const page = Math.max(1, filters.page ?? 1)

  const call = (limit: number, offset: number) =>
    supabase.rpc('seller_inventory_tickets', {
      p_raffle_id: filters.raffleId,
      ...(filters.daily ? { p_daily: filters.daily } : {}),
      ...(filters.weekly ? { p_weekly: filters.weekly } : {}),
      p_only_free: filters.onlyFree,
      p_limit: limit,
      p_offset: offset,
    })

  const { data, error } = await call(pageSize, (page - 1) * pageSize)
  if (error) throw error
  const rows = data ?? []

  let total = Number(rows[0]?.total_count ?? 0)
  if (rows.length === 0 && page > 1) {
    const { data: first, error: firstError } = await call(1, 0)
    if (firstError) throw firstError
    total = Number(first?.[0]?.total_count ?? 0)
  }

  return {
    rows: rows.map((row) => ({
      ticketId: row.ticket_id,
      dailyNumber: row.daily_number,
      weeklyNumber: row.weekly_number,
      availability: parseAvailability(row.availability),
      holdId: row.hold_id,
      holdExpiresAt: row.hold_expires_at,
    })),
    total,
    page,
    pageSize,
  }
}

export type SellerTicketHold = {
  holdId: string
  ticketId: string
  raffleId: string
  dailyNumber: string
  /** `null` en una rifa de un solo número (D-261). */
  weeklyNumber: string | null
  startedAt: string
  expiresAt: string
  extended: boolean
  /** Precio de la rifa y lo mas barato que puede venderla QUIEN la aparto (BR-P11). */
  basePrice: number
  minSalePrice: number
  /** La hora de la base al leer: la cuenta atras no se fia del reloj del telefono. */
  serverNow: string
  /** D-261: los números de su rifa, para nombrarlos. */
  numberFormat?: RaffleNumberFormat
}

export async function listSellerTicketHolds(raffleId?: string): Promise<SellerTicketHold[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'seller_ticket_holds',
    raffleId ? { p_raffle_id: raffleId } : {},
  )
  if (error) throw error
  const formats = await listRaffleNumberFormats()
  return (data ?? []).map((row) => ({
    numberFormat: formats.get(row.raffle_id),
    holdId: row.hold_id,
    ticketId: row.ticket_id,
    raffleId: row.raffle_id,
    dailyNumber: row.daily_number,
    weeklyNumber: row.weekly_number,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    extended: row.extended,
    basePrice: Number(row.base_price),
    minSalePrice: Number(row.min_sale_price),
    serverNow: row.server_now,
  }))
}
