import 'server-only'

import { listOrgMembers } from '@/features/users/queries'
import { PAGE_SIZE, type TicketInventoryStatus, type TicketPaymentStatus } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

/**
 * Lecturas de boletas. La politica `tickets_select` ya limita las filas a la
 * organizacion (y, para un vendedor, a las suyas): los filtros de aqui son de
 * usabilidad y eficiencia, no de seguridad (docs/ARCHITECTURE.md 7.1).
 */

export type TicketFilters = {
  raffleId?: string
  sellerId?: string
  clientId?: string
  inventoryStatus?: TicketInventoryStatus
  paymentStatus?: TicketPaymentStatus
  /** Codigo interno o numero exacto. */
  search?: string
  page?: number
  pageSize?: number
}

export type TicketListItem = {
  id: string
  internalCode: string
  dailyNumber: string | null
  weeklyNumber: string | null
  inventoryStatus: TicketInventoryStatus
  paymentStatus: TicketPaymentStatus
  salePrice: number | null
  paidAmount: number
  saleDate: string | null
  createdAt: string
  raffleId: string
  raffleName: string
  raffleShortCode: string
  sellerId: string
  sellerName: string
  clientId: string | null
  clientName: string | null
}

const TICKET_SELECT = `
  id,
  internal_code,
  daily_number,
  weekly_number,
  inventory_status,
  payment_status,
  sale_price,
  paid_amount,
  sale_date,
  created_at,
  raffle_id,
  seller_id,
  client_id,
  raffle:raffles!tickets_raffle_org_fk ( name, short_code ),
  client:clients!tickets_client_org_fk ( id, name )
`

type TicketRow = {
  id: string
  internal_code: string
  daily_number: string | null
  weekly_number: string | null
  inventory_status: TicketInventoryStatus
  payment_status: TicketPaymentStatus
  sale_price: number | null
  paid_amount: number
  sale_date: string | null
  created_at: string
  raffle_id: string
  seller_id: string
  client_id: string | null
  raffle: { name: string; short_code: string } | null
  client: { id: string; name: string } | null
}

/**
 * PostgREST rechaza `.or()` si un valor trae comas o parentesis: se escaparia
 * la propia sintaxis del filtro. Se limita la busqueda a caracteres inocuos.
 */
function sanitizeSearch(value: string): string {
  return value.replace(/[(),."'\\*%]/g, '').trim()
}

export async function listTickets(
  filters: TicketFilters,
): Promise<{ rows: TicketListItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient()
  const pageSize = filters.pageSize ?? PAGE_SIZE
  const page = Math.max(1, filters.page ?? 1)

  let query = supabase.from('tickets').select(TICKET_SELECT, { count: 'exact' })

  if (filters.raffleId) query = query.eq('raffle_id', filters.raffleId)
  if (filters.sellerId) query = query.eq('seller_id', filters.sellerId)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.inventoryStatus) query = query.eq('inventory_status', filters.inventoryStatus)
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus)

  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search !== '') {
    const conditions = [`internal_code.ilike.%${search}%`]
    // Los numeros se comparan como TEXTO EXACTO: buscar "07" no debe traer
    // "0007" ni "7" (BR-N03).
    if (/^[0-9]{1,4}$/.test(search)) {
      conditions.push(`daily_number.eq.${search}`, `weekly_number.eq.${search}`)
    }
    query = query.or(conditions.join(','))
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (error) throw error

  const sellerNames = await sellerNameMap()

  return {
    rows: ((data ?? []) as TicketRow[]).map((row) => mapTicketRow(row, sellerNames)),
    total: count ?? 0,
    page,
    pageSize,
  }
}

export type TicketDetail = TicketListItem & {
  approvedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  assignedAt: string | null
  raffleStatus: string
  raffleTicketPrice: number
}

export async function getTicketDetail(ticketId: string): Promise<TicketDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tickets')
    .select(
      `${TICKET_SELECT}, approved_at, cancelled_at, cancel_reason, assigned_at,
       raffle_full:raffles!tickets_raffle_org_fk ( status, ticket_price )`,
    )
    .eq('id', ticketId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as TicketRow & {
    approved_at: string | null
    cancelled_at: string | null
    cancel_reason: string | null
    assigned_at: string | null
    raffle_full: { status: string; ticket_price: number } | null
  }

  const sellerNames = await sellerNameMap()

  return {
    ...mapTicketRow(row, sellerNames),
    approvedAt: row.approved_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    assignedAt: row.assigned_at,
    raffleStatus: row.raffle_full?.status ?? 'draft',
    raffleTicketPrice: row.raffle_full?.ticket_price ?? 0,
  }
}

/** Boletas pendientes de aprobacion, para el aviso del dashboard. */
export async function countPendingApproval(raffleId?: string): Promise<number> {
  const supabase = await createClient()
  let query = supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('inventory_status', 'pending_approval')
  if (raffleId) query = query.eq('raffle_id', raffleId)

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

// El vendedor de una boleta apunta a `memberships`, no a `profiles`, asi que no
// puede incrustarse en la consulta. Los miembros de una organizacion son pocos:
// se traen una vez y se cruzan en memoria (sin N+1).
async function sellerNameMap(): Promise<Map<string, string>> {
  const members = await listOrgMembers(['owner', 'admin', 'seller'])
  return new Map(members.map((member) => [member.profileId, member.fullName]))
}

function mapTicketRow(row: TicketRow, sellerNames: Map<string, string>): TicketListItem {
  return {
    id: row.id,
    internalCode: row.internal_code,
    dailyNumber: row.daily_number,
    weeklyNumber: row.weekly_number,
    inventoryStatus: row.inventory_status,
    paymentStatus: row.payment_status,
    salePrice: row.sale_price,
    paidAmount: row.paid_amount,
    saleDate: row.sale_date,
    createdAt: row.created_at,
    raffleId: row.raffle_id,
    raffleName: row.raffle?.name ?? '',
    raffleShortCode: row.raffle?.short_code ?? '',
    sellerId: row.seller_id,
    sellerName: sellerNames.get(row.seller_id) ?? 'Vendedor',
    clientId: row.client_id,
    clientName: row.client?.name ?? null,
  }
}
