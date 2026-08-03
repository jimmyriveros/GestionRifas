import 'server-only'

import { listOrgMembers, type OrgMember } from '@/features/users/queries'
import { createClient } from '@/lib/supabase/server'

/**
 * Vendedores con sus indicadores. La gestion (alta, edicion, activacion) vive
 * en `features/users`: un vendedor es una membresia con rol `seller`, no una
 * entidad aparte. Aqui solo se agregan sus numeros.
 */

export type SellerTotals = {
  ticketsTotal: number
  ticketsAvailable: number
  ticketsAssigned: number
  ticketsPendingApproval: number
  ticketsDraft: number
  ticketsCancelled: number
  ticketsUnpaid: number
  ticketsPartial: number
  ticketsPaid: number
  totalSold: number
  totalCollected: number
  pendingAmount: number
}

export type SellerWithTotals = OrgMember & SellerTotals

const ZERO: SellerTotals = {
  ticketsTotal: 0,
  ticketsAvailable: 0,
  ticketsAssigned: 0,
  ticketsPendingApproval: 0,
  ticketsDraft: 0,
  ticketsCancelled: 0,
  ticketsUnpaid: 0,
  ticketsPartial: 0,
  ticketsPaid: 0,
  totalSold: 0,
  totalCollected: 0,
  pendingAmount: 0,
}

type SellerSummaryRow = {
  tickets_total: number | null
  tickets_available: number | null
  tickets_assigned: number | null
  tickets_pending_approval: number | null
  tickets_draft: number | null
  tickets_cancelled: number | null
  tickets_unpaid: number | null
  tickets_partial: number | null
  tickets_paid: number | null
  total_sold: number | null
  total_collected: number | null
  pending_amount: number | null
}

function addTotals(acc: SellerTotals, row: SellerSummaryRow): SellerTotals {
  return {
    ticketsTotal: acc.ticketsTotal + (row.tickets_total ?? 0),
    ticketsAvailable: acc.ticketsAvailable + (row.tickets_available ?? 0),
    ticketsAssigned: acc.ticketsAssigned + (row.tickets_assigned ?? 0),
    ticketsPendingApproval: acc.ticketsPendingApproval + (row.tickets_pending_approval ?? 0),
    ticketsDraft: acc.ticketsDraft + (row.tickets_draft ?? 0),
    ticketsCancelled: acc.ticketsCancelled + (row.tickets_cancelled ?? 0),
    ticketsUnpaid: acc.ticketsUnpaid + (row.tickets_unpaid ?? 0),
    ticketsPartial: acc.ticketsPartial + (row.tickets_partial ?? 0),
    ticketsPaid: acc.ticketsPaid + (row.tickets_paid ?? 0),
    totalSold: acc.totalSold + (row.total_sold ?? 0),
    totalCollected: acc.totalCollected + (row.total_collected ?? 0),
    pendingAmount: acc.pendingAmount + (row.pending_amount ?? 0),
  }
}

/**
 * `v_seller_summary` agrupa por (organizacion, rifa, vendedor), asi que un
 * vendedor con boletas en tres rifas trae tres filas. Se suman en memoria: dos
 * consultas fijas en total, sin una por vendedor (docs/ARCHITECTURE.md 10).
 */
export async function listSellersWithTotals(raffleId?: string): Promise<SellerWithTotals[]> {
  const supabase = await createClient()

  let summaryQuery = supabase.from('v_seller_summary').select('*')
  if (raffleId) summaryQuery = summaryQuery.eq('raffle_id', raffleId)

  const [sellers, { data: summaries, error: summaryError }] = await Promise.all([
    listOrgMembers(['seller']),
    summaryQuery,
  ])

  if (summaryError) throw summaryError

  const totalsBySeller = new Map<string, SellerTotals>()
  for (const row of summaries ?? []) {
    if (!row.seller_id) continue
    totalsBySeller.set(row.seller_id, addTotals(totalsBySeller.get(row.seller_id) ?? ZERO, row))
  }

  return sellers.map((seller) => ({
    ...seller,
    ...(totalsBySeller.get(seller.profileId) ?? ZERO),
  }))
}

export type SellerDetail = SellerWithTotals & { clientsCount: number }

export async function getSellerWithTotals(profileId: string): Promise<SellerDetail | null> {
  const sellers = await listSellersWithTotals()
  const seller = sellers.find((item) => item.profileId === profileId)
  if (!seller) return null

  // Conteo EXACTO en la base de datos (`head: true` no trae filas): contar en
  // memoria seria erroneo, porque PostgREST corta las respuestas en 1.000 filas.
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', profileId)
    .is('archived_at', null)

  if (error) throw error

  return { ...seller, clientsCount: count ?? 0 }
}

export type SellerOption = { id: string; fullName: string; alias: string | null }

/** Vendedores ACTIVOS para selectores: solo ellos pueden recibir boletas. */
export async function listActiveSellerOptions(): Promise<SellerOption[]> {
  const members = await listOrgMembers(['seller'])
  return members
    .filter((member) => member.isActive)
    .map((member) => ({ id: member.profileId, fullName: member.fullName, alias: member.alias }))
}
