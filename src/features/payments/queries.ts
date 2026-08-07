import 'server-only'

import { PAGE_SIZE, type PaymentMethod } from '@/lib/constants'
import { SEARCH_OPTIONS_LIMIT, searchNeedle } from '@/lib/search'
import { createClient } from '@/lib/supabase/server'

import type { PayableTicket } from './allocation'

/**
 * Lecturas de pagos. Todas sobre `v_payment_history`, que se ejecuta con
 * `security_invoker`: el personal ve los pagos de su organizacion y un vendedor
 * solo los suyos, sin que este codigo tenga que filtrar por seguridad
 * (docs/ARCHITECTURE.md 7.1).
 */

export type PaymentAllocationRow = {
  ticketId: string
  internalCode: string
  dailyNumber: string | null
  weeklyNumber: string | null
  amount: number
}

export type PaymentListItem = {
  id: string
  clientId: string
  clientName: string
  sellerId: string
  /** NULL si quien consulta no puede ver ese perfil (I-015). */
  sellerName: string | null
  totalAmount: number
  paymentDate: string
  paymentMethod: PaymentMethod
  notes: string | null
  createdAt: string
  createdByName: string | null
  isActive: boolean
  voidedAt: string | null
  voidedByName: string | null
  voidReason: string | null
  allocations: PaymentAllocationRow[]
}

export type PaymentFilters = {
  clientId?: string
  sellerId?: string
  /** `active` = vigentes, `voided` = anulados, sin valor = todos. */
  status?: 'active' | 'voided'
  method?: PaymentMethod
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

type HistoryRow = {
  payment_id: string | null
  client_id: string | null
  client_name: string | null
  seller_id: string | null
  seller_name: string | null
  total_amount: number | null
  payment_date: string | null
  payment_method: PaymentMethod | null
  notes: string | null
  created_at: string | null
  created_by_name: string | null
  is_active: boolean | null
  voided_at: string | null
  voided_by_name: string | null
  void_reason: string | null
  allocations: unknown
}

function mapAllocations(value: unknown): PaymentAllocationRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const row = item as Record<string, unknown>
    if (typeof row.ticket_id !== 'string') return []
    return [
      {
        ticketId: row.ticket_id,
        internalCode: typeof row.internal_code === 'string' ? row.internal_code : '',
        dailyNumber: typeof row.daily_number === 'string' ? row.daily_number : null,
        weeklyNumber: typeof row.weekly_number === 'string' ? row.weekly_number : null,
        amount: typeof row.amount === 'number' ? row.amount : 0,
      },
    ]
  })
}

function mapPayment(row: HistoryRow): PaymentListItem {
  return {
    id: row.payment_id ?? '',
    clientId: row.client_id ?? '',
    clientName: row.client_name ?? '',
    sellerId: row.seller_id ?? '',
    sellerName: row.seller_name,
    totalAmount: row.total_amount ?? 0,
    paymentDate: row.payment_date ?? '',
    paymentMethod: row.payment_method ?? 'cash',
    notes: row.notes,
    createdAt: row.created_at ?? '',
    createdByName: row.created_by_name,
    isActive: row.is_active ?? true,
    voidedAt: row.voided_at,
    voidedByName: row.voided_by_name,
    voidReason: row.void_reason,
    allocations: mapAllocations(row.allocations),
  }
}

export async function listPayments(
  filters: PaymentFilters,
): Promise<{ rows: PaymentListItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient()
  const pageSize = filters.pageSize ?? PAGE_SIZE
  const page = Math.max(1, filters.page ?? 1)

  let query = supabase.from('v_payment_history').select('*', { count: 'exact' })

  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  if (filters.sellerId) query = query.eq('seller_id', filters.sellerId)
  if (filters.method) query = query.eq('payment_method', filters.method)
  if (filters.dateFrom) query = query.gte('payment_date', filters.dateFrom)
  if (filters.dateTo) query = query.lte('payment_date', filters.dateTo)
  // BR-F09: los pagos anulados NO desaparecen; se filtran, que es distinto.
  if (filters.status === 'active') query = query.is('voided_at', null)
  if (filters.status === 'voided') query = query.not('voided_at', 'is', null)

  const { data, error, count } = await query
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (error) throw error

  return {
    rows: ((data ?? []) as HistoryRow[]).map(mapPayment),
    total: count ?? 0,
    page,
    pageSize,
  }
}

/** Historial de un cliente concreto, para su perfil (BR-C09, BR-F13). */
export async function listClientPayments(clientId: string): Promise<PaymentListItem[]> {
  const { rows } = await listPayments({ clientId, pageSize: 100 })
  return rows
}

export type PayableTicketDetail = PayableTicket & {
  dailyNumber: string | null
  weeklyNumber: string | null
  salePrice: number
  paidAmount: number
}

/**
 * Boletas de un cliente que todavia deben dinero.
 *
 * Sale de `v_ticket_balances`, donde `pending_amount` lo calcula SQL a partir
 * de `sale_price - paid_amount` (BR-F08). La aplicacion nunca resta saldos por
 * su cuenta.
 */
export async function listPayableTickets(clientId: string): Promise<PayableTicketDetail[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_ticket_balances')
    .select(
      'ticket_id, internal_code, daily_number, weekly_number, sale_price, paid_amount, pending_amount',
    )
    .eq('client_id', clientId)
    .eq('inventory_status', 'assigned')
    .order('internal_code', { ascending: true })

  if (error) throw error

  return (data ?? []).flatMap((row) => {
    const pending = row.pending_amount ?? 0
    if (!row.ticket_id || pending <= 0) return []
    return [
      {
        ticketId: row.ticket_id,
        internalCode: row.internal_code ?? '',
        dailyNumber: row.daily_number,
        weeklyNumber: row.weekly_number,
        salePrice: row.sale_price ?? 0,
        paidAmount: row.paid_amount ?? 0,
        pendingAmount: pending,
      },
    ]
  })
}

/** Clientes del vendedor con saldo pendiente, para elegir a quien abonar. */
export type ClientWithBalance = {
  id: string
  name: string
  alias: string | null
  phone: string
  pendingAmount: number
  ticketsCount: number
}

/**
 * Clientes con saldo pendiente, para elegir a quien se le abona.
 *
 * Sin `search` devuelve el primer bloque alfabetico; con `search` consulta
 * contra todos los que el vendedor puede ver. Como en los selectores de
 * asignacion, antes se traian 200 y se filtraban en memoria: el cliente 201 no
 * aparecia por mucho que se escribiera su nombre (I-036).
 */
export async function listClientsWithBalance(
  search?: string,
  limit = SEARCH_OPTIONS_LIMIT,
): Promise<ClientWithBalance[]> {
  const supabase = await createClient()
  let query = supabase
    .from('v_client_balances')
    .select('client_id, name, alias, phone, pending_amount, tickets_count')
    .is('archived_at', null)
    .gt('pending_amount', 0)

  const needle = search ? searchNeedle(search).replace(/[(),."'\\*%_]/g, '') : ''
  if (needle !== '') query = query.ilike('search_text', `%${needle}%`)

  const { data, error } = await query.order('name', { ascending: true }).limit(limit)

  if (error) throw error

  return (data ?? []).flatMap((row) =>
    row.client_id
      ? [
          {
            id: row.client_id,
            name: row.name ?? '',
            alias: row.alias,
            phone: row.phone ?? '',
            pendingAmount: row.pending_amount ?? 0,
            ticketsCount: row.tickets_count ?? 0,
          },
        ]
      : [],
  )
}
