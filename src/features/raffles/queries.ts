import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { RaffleStatus } from '@/lib/constants'

/**
 * Lecturas de rifas para RSC. Todas pasan por el cliente de servidor sujeto a
 * RLS: la politica `raffles_select` limita las filas a la organizacion del
 * usuario, asi que no hay que filtrar por `organization_id` por seguridad
 * (docs/ARCHITECTURE.md 7.1).
 */

export type RaffleSummary = {
  id: string
  shortCode: string
  name: string
  status: RaffleStatus
  ticketPrice: number
  startDate: string
  endDate: string
  allowSellerTicketCreation: boolean
  ticketsTotal: number
  ticketsAvailable: number
  ticketsAssigned: number
  ticketsPendingApproval: number
  ticketsCancelled: number
  totalSold: number
  totalCollected: number
  pendingAmount: number
}

export type RaffleDetail = RaffleSummary & {
  description: string | null
  createdAt: string
  closedAt: string | null
}

export async function listRaffleSummaries(): Promise<RaffleSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_raffle_summary')
    .select('*')
    .order('short_code', { ascending: false })

  if (error) throw error

  return (data ?? []).map(mapSummaryRow)
}

export async function getRaffleDetail(raffleId: string): Promise<RaffleDetail | null> {
  const supabase = await createClient()

  const [{ data: raffle, error: raffleError }, { data: summary, error: summaryError }] =
    await Promise.all([
      supabase.from('raffles').select('*').eq('id', raffleId).maybeSingle(),
      supabase.from('v_raffle_summary').select('*').eq('raffle_id', raffleId).maybeSingle(),
    ])

  if (raffleError) throw raffleError
  if (summaryError) throw summaryError
  if (!raffle) return null

  return {
    ...mapSummaryRow(summary ?? {}),
    id: raffle.id,
    shortCode: raffle.short_code,
    name: raffle.name,
    status: raffle.status,
    ticketPrice: raffle.ticket_price,
    startDate: raffle.start_date,
    endDate: raffle.end_date,
    allowSellerTicketCreation: raffle.allow_seller_ticket_creation,
    description: raffle.description,
    createdAt: raffle.created_at,
    closedAt: raffle.closed_at,
  }
}

export type RaffleOption = {
  id: string
  name: string
  shortCode: string
  status: RaffleStatus
  ticketPrice: number
  allowSellerTicketCreation: boolean
}

/**
 * Rifas para selectores (creacion de boletas, filtros).
 *
 * Las ACTIVAS van primero: son las que admiten venta, y son las que la persona
 * espera encontrar preseleccionadas al crear boletas. Ordenar solo por codigo
 * dejaba arriba la ultima rifa creada, que suele ser un borrador.
 */
const RAFFLE_STATUS_ORDER: Record<RaffleStatus, number> = {
  active: 0,
  draft: 1,
  closed: 2,
  cancelled: 3,
}

export async function listRaffleOptions(): Promise<RaffleOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('raffles')
    .select('id, name, short_code, status, ticket_price, allow_seller_ticket_creation')
    .order('short_code', { ascending: false })

  if (error) throw error

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      shortCode: row.short_code,
      status: row.status,
      ticketPrice: row.ticket_price,
      allowSellerTicketCreation: row.allow_seller_ticket_creation,
    }))
    .sort((a, b) => RAFFLE_STATUS_ORDER[a.status] - RAFFLE_STATUS_ORDER[b.status])
}

type SummaryRow = Partial<{
  raffle_id: string | null
  short_code: string | null
  name: string | null
  status: RaffleStatus | null
  ticket_price: number | null
  start_date: string | null
  end_date: string | null
  allow_seller_ticket_creation: boolean | null
  tickets_total: number | null
  tickets_available: number | null
  tickets_assigned: number | null
  tickets_pending_approval: number | null
  tickets_cancelled: number | null
  total_sold: number | null
  total_collected: number | null
  pending_amount: number | null
}>

// Las columnas de una vista llegan como opcionales en los tipos generados
// (PostgreSQL no puede garantizar NOT NULL a traves de una vista), aunque en la
// practica nunca son nulas. El mapeo las normaliza una sola vez.
function mapSummaryRow(row: SummaryRow): RaffleSummary {
  return {
    id: row.raffle_id ?? '',
    shortCode: row.short_code ?? '',
    name: row.name ?? '',
    status: row.status ?? 'draft',
    ticketPrice: row.ticket_price ?? 0,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    allowSellerTicketCreation: row.allow_seller_ticket_creation ?? false,
    ticketsTotal: row.tickets_total ?? 0,
    ticketsAvailable: row.tickets_available ?? 0,
    ticketsAssigned: row.tickets_assigned ?? 0,
    ticketsPendingApproval: row.tickets_pending_approval ?? 0,
    ticketsCancelled: row.tickets_cancelled ?? 0,
    totalSold: row.total_sold ?? 0,
    totalCollected: row.total_collected ?? 0,
    pendingAmount: row.pending_amount ?? 0,
  }
}
