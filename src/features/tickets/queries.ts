import 'server-only'

import { listOrgMembers } from '@/features/users/queries'
import { PAGE_SIZE, type TicketInventoryStatus, type TicketPaymentStatus } from '@/lib/constants'
import { isTicketNumberTerm, normalizeSearchTerm } from '@/lib/search'
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
  /** Numero diario o semanal, entero o en parte (BR-N11). El codigo interno no. */
  search?: string
  /**
   * Boletas concretas por su id: lo usa la seleccion multiple, que se acumula
   * entre busquedas distintas y por tanto no se puede describir con filtros
   * (BR-B01). Convive con el resto de filtros, aunque en la practica se usa sola.
   */
  ticketIds?: readonly string[]
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

export async function listTickets(
  filters: TicketFilters,
): Promise<{ rows: TicketListItem[]; total: number; page: number; pageSize: number }> {
  const pageSize = filters.pageSize ?? PAGE_SIZE
  const page = Math.max(1, filters.page ?? 1)

  const search = filters.search ? normalizeSearchTerm(filters.search) : ''
  if (search !== '') return searchTicketsByNumber(filters, search, page, pageSize)

  const supabase = await createClient()
  let query = supabase.from('tickets').select(TICKET_SELECT, { count: 'exact' })

  if (filters.ticketIds) query = query.in('id', [...filters.ticketIds])
  if (filters.raffleId) query = query.eq('raffle_id', filters.raffleId)
  if (filters.sellerId) query = query.eq('seller_id', filters.sellerId)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.inventoryStatus) query = query.eq('inventory_status', filters.inventoryStatus)
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus)

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

/**
 * Busqueda por numero diario y semanal, ordenada por relevancia (BR-N11).
 *
 * Va por la funcion `search_tickets` (migracion 0018) y no por PostgREST
 * porque el orden depende del termino buscado —el numero diario manda sobre el
 * semanal— y eso no es una columna por la que se pueda ordenar. Reordenar en el
 * navegador tampoco vale: la lista esta paginada en servidor, asi que solo
 * reacomodaria las filas de la pagina que ya se esta viendo.
 *
 * La funcion es `security invoker`: hereda `tickets_select`, de modo que un
 * vendedor sigue encontrando unicamente sus boletas.
 */
async function searchTicketsByNumber(
  filters: TicketFilters,
  search: string,
  page: number,
  pageSize: number,
): Promise<{ rows: TicketListItem[]; total: number; page: number; pageSize: number }> {
  // Un termino que no es un numero de boleta no puede coincidir con ninguna:
  // se responde sin ir a la base de datos. La funcion aplica la misma regla,
  // asi que esto es un atajo, no la unica defensa.
  if (!isTicketNumberTerm(search)) {
    return { rows: [], total: 0, page, pageSize }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_tickets', {
    p_search: search,
    p_raffle_id: filters.raffleId,
    p_seller_id: filters.sellerId,
    p_client_id: filters.clientId,
    p_inventory_status: filters.inventoryStatus,
    p_payment_status: filters.paymentStatus,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  })

  if (error) throw error

  const rows = data ?? []
  const sellerNames = await sellerNameMap()

  return {
    // `total_count` viaja repetido en cada fila; sin filas, no hay resultados.
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((row) => ({
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
      raffleName: row.raffle_name ?? '',
      raffleShortCode: row.raffle_short_code ?? '',
      sellerId: row.seller_id,
      sellerName: sellerNames.get(row.seller_id) ?? 'Vendedor',
      clientId: row.client_id,
      clientName: row.client_name,
    })),
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
