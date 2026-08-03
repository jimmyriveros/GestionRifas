import 'server-only'

import { listOrgMembers } from '@/features/users/queries'
import { PAGE_SIZE } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

/**
 * Consulta GLOBAL de clientes para el portal administrativo (CLAUDE.md 21).
 * La creacion, edicion y archivado de clientes es del portal del vendedor y
 * llega en la Fase 4; aqui solo se lee.
 *
 * La politica `clients_select` ya limita las filas: el personal ve toda la
 * organizacion y un vendedor solo su propia cartera.
 */

export type ClientListItem = {
  id: string
  name: string
  alias: string | null
  phone: string
  email: string | null
  sellerId: string
  sellerName: string
  archivedAt: string | null
  ticketsCount: number
  totalPurchased: number
  totalPaid: number
  pendingAmount: number
}

export type ClientFilters = {
  sellerId?: string
  search?: string
  includeArchived?: boolean
  page?: number
  pageSize?: number
}

function sanitizeSearch(value: string): string {
  return value.replace(/[(),."'\\*%]/g, '').trim()
}

export async function listClients(
  filters: ClientFilters,
): Promise<{ rows: ClientListItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient()
  const pageSize = filters.pageSize ?? PAGE_SIZE
  const page = Math.max(1, filters.page ?? 1)

  let query = supabase.from('v_client_balances').select('*', { count: 'exact' })

  if (filters.sellerId) query = query.eq('seller_id', filters.sellerId)
  if (!filters.includeArchived) query = query.is('archived_at', null)

  // BR-C08: la busqueda opera sobre nombre, alias, telefono y correo.
  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search !== '') {
    query = query.or(
      [
        `name.ilike.%${search}%`,
        `alias.ilike.%${search}%`,
        `phone.ilike.%${search}%`,
        `email.ilike.%${search}%`,
      ].join(','),
    )
  }

  const { data, error, count } = await query
    .order('name', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (error) throw error

  const sellerNames = await sellerNameMap()

  return {
    rows: (data ?? []).map((row) => ({
      id: row.client_id ?? '',
      name: row.name ?? '',
      alias: row.alias,
      phone: row.phone ?? '',
      email: row.email,
      sellerId: row.seller_id ?? '',
      sellerName: sellerNames.get(row.seller_id ?? '') ?? 'Vendedor',
      archivedAt: row.archived_at,
      ticketsCount: row.tickets_count ?? 0,
      totalPurchased: row.total_purchased ?? 0,
      totalPaid: row.total_paid ?? 0,
      pendingAmount: row.pending_amount ?? 0,
    })),
    total: count ?? 0,
    page,
    pageSize,
  }
}

export type ClientDetail = ClientListItem & { notes: string | null; createdAt: string }

export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  const supabase = await createClient()

  const [{ data: balances, error: balancesError }, { data: client, error: clientError }] =
    await Promise.all([
      supabase.from('v_client_balances').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('clients').select('notes, created_at').eq('id', clientId).maybeSingle(),
    ])

  if (balancesError) throw balancesError
  if (clientError) throw clientError
  if (!balances || !client) return null

  const sellerNames = await sellerNameMap()

  return {
    id: balances.client_id ?? clientId,
    name: balances.name ?? '',
    alias: balances.alias,
    phone: balances.phone ?? '',
    email: balances.email,
    sellerId: balances.seller_id ?? '',
    sellerName: sellerNames.get(balances.seller_id ?? '') ?? 'Vendedor',
    archivedAt: balances.archived_at,
    ticketsCount: balances.tickets_count ?? 0,
    totalPurchased: balances.total_purchased ?? 0,
    totalPaid: balances.total_paid ?? 0,
    pendingAmount: balances.pending_amount ?? 0,
    notes: client.notes,
    createdAt: client.created_at,
  }
}

async function sellerNameMap(): Promise<Map<string, string>> {
  const members = await listOrgMembers(['owner', 'admin', 'seller'])
  return new Map(members.map((member) => [member.profileId, member.fullName]))
}
