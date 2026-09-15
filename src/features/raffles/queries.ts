import 'server-only'

import {
  addInventory,
  readAdminTicketInventory,
  ZERO_INVENTORY,
  type InventoryCounts,
} from '@/features/tickets/admin-queries'
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

/**
 * Las rifas con su dinero, para el reporte «Boletas por rifa» del VENDEDOR.
 *
 * `v_raffle_summary` es `security_invoker`: a un vendedor le suma solo sus
 * boletas. El personal ya no la usa (D-198); lee `listAdminRaffleSummaries`.
 */
export async function listRaffleSummaries(): Promise<RaffleSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_raffle_summary')
    .select('*')
    .order('short_code', { ascending: false })

  if (error) throw error

  return (data ?? []).map(mapSummaryRow)
}

/**
 * Una rifa en el portal ADMINISTRATIVO (D-198, BR-Q08): sus datos y los
 * recuentos de sus boletas, sin lo vendido, lo recaudado ni el saldo.
 *
 * El precio de la rifa si esta: es su configuracion, no lo que un vendedor
 * negocio con un cliente.
 */
export type AdminRaffleSummary = {
  id: string
  shortCode: string
  name: string
  status: RaffleStatus
  ticketPrice: number
  startDate: string
  endDate: string
  allowSellerTicketCreation: boolean
} & InventoryCounts

export type AdminRaffleDetail = AdminRaffleSummary & {
  description: string | null
  createdAt: string
  closedAt: string | null
}

const ADMIN_RAFFLE_COLUMNS =
  'id, short_code, name, status, ticket_price, start_date, end_date, allow_seller_ticket_creation, description, created_at, closed_at'

type AdminRaffleRow = {
  id: string
  short_code: string
  name: string
  status: RaffleStatus
  ticket_price: number
  start_date: string
  end_date: string
  allow_seller_ticket_creation: boolean
  description: string | null
  created_at: string
  closed_at: string | null
}

function inventoryByRaffle(
  rows: Awaited<ReturnType<typeof readAdminTicketInventory>>,
): Map<string, InventoryCounts> {
  const byRaffle = new Map<string, InventoryCounts>()
  for (const row of rows) {
    byRaffle.set(row.raffleId, addInventory(byRaffle.get(row.raffleId) ?? ZERO_INVENTORY, row))
  }
  return byRaffle
}

function mapAdminRaffle(row: AdminRaffleRow, counts: InventoryCounts): AdminRaffleDetail {
  return {
    id: row.id,
    shortCode: row.short_code,
    name: row.name,
    status: row.status,
    ticketPrice: row.ticket_price,
    startDate: row.start_date,
    endDate: row.end_date,
    allowSellerTicketCreation: row.allow_seller_ticket_creation,
    description: row.description,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    ...counts,
  }
}

/**
 * Las rifas con sus recuentos, para el personal. Dos lecturas fijas: la tabla
 * de rifas —que el personal si lee— y el agregado de `admin_ticket_inventory`.
 */
export async function listAdminRaffleSummaries(): Promise<AdminRaffleSummary[]> {
  const supabase = await createClient()
  const [{ data, error }, inventory] = await Promise.all([
    supabase.from('raffles').select(ADMIN_RAFFLE_COLUMNS).order('short_code', { ascending: false }),
    readAdminTicketInventory(null),
  ])

  if (error) throw error

  const byRaffle = inventoryByRaffle(inventory)
  return ((data ?? []) as AdminRaffleRow[]).map((row) =>
    mapAdminRaffle(row, byRaffle.get(row.id) ?? ZERO_INVENTORY),
  )
}

export async function getAdminRaffleDetail(raffleId: string): Promise<AdminRaffleDetail | null> {
  const supabase = await createClient()
  const [{ data, error }, inventory] = await Promise.all([
    supabase.from('raffles').select(ADMIN_RAFFLE_COLUMNS).eq('id', raffleId).maybeSingle(),
    readAdminTicketInventory(raffleId),
  ])

  if (error) throw error
  if (!data) return null

  return mapAdminRaffle(
    data as AdminRaffleRow,
    inventoryByRaffle(inventory).get(raffleId) ?? ZERO_INVENTORY,
  )
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
