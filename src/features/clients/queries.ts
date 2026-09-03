import 'server-only'

import { listOrgMembers } from '@/features/users/queries'
import { PAGE_SIZE } from '@/lib/constants'
import { SEARCH_OPTIONS_LIMIT, searchNeedle } from '@/lib/search'
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

/**
 * Deja el termino listo para `ilike` contra `search_text`.
 *
 * Dos cosas distintas, en este orden:
 *
 * 1. `searchNeedle` lo normaliza como lo esta la columna —minusculas, sin
 *    acentos, y solo digitos si parece un telefono—. Es la misma funcion que
 *    usa el navegador, para que las dos capas busquen exactamente lo mismo.
 * 2. Se quitan los caracteres que romperian el filtro: `%` y `_` son comodines
 *    de `ilike`, y coma, parentesis y comillas son sintaxis de PostgREST.
 *
 * No es defensa contra inyeccion —de eso se encarga PostgREST, que envia el
 * valor como parametro—, es evitar que el termino signifique otra cosa.
 */
function sanitizeSearch(value: string): string {
  return searchNeedle(value).replace(/[(),."'\\*%_]/g, '')
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

  // BR-C08: nombre, alias, telefono y correo. Los cuatro estan concatenados y
  // normalizados en `search_text` (migracion 0017), asi que un solo `ilike`
  // sustituye al `or` de cuatro ramas de antes y ademas encuentra «José»
  // escribiendo «jose» y el telefono con cualquier formato.
  const search = filters.search ? sanitizeSearch(filters.search) : ''
  if (search !== '') {
    query = query.ilike('search_text', `%${search}%`)
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

export type ClientOption = {
  id: string
  name: string
  alias: string | null
  phone: string
}

/**
 * Tope del desplegable «Cliente» de los filtros de boletas.
 *
 * Ese desplegable NO tiene buscador: es una lista fija, asi que su tope es un
 * limite real de lo que se puede filtrar. Se conserva el que ya tenia (200)
 * para no recortar nada al pasar los selectores a busqueda en servidor; que un
 * desplegable fijo tenga techo es una limitacion anterior y aparte (I-037).
 */
export const CLIENT_FILTER_OPTIONS_LIMIT = 200

/**
 * Clientes elegibles para asignar una boleta.
 *
 * Excluye los archivados (BR-C07) y, por RLS, un vendedor solo obtiene los
 * suyos.
 *
 * Sin `search` devuelve el PRIMER bloque alfabetico, que es lo que se ve al
 * abrir el dialogo. Con `search` la consulta va a la base de datos entera: ese
 * es el punto. Antes se traian 200 clientes al navegador y se filtraban en
 * memoria, asi que a partir del cliente 201 no habia forma de encontrarlo
 * (I-036) — y el vendedor no recibia ningun aviso de que faltaban.
 *
 * `sellerId` ACOTA a una cartera concreta (D-168). Hace falta en el portal
 * administrativo: alli la RLS devuelve los clientes de toda la organizacion, y
 * al corregir el cliente de una boleta solo valen los del vendedor de ESA
 * boleta (BR-C05). Es un filtro de usabilidad, no una frontera: quien elige el
 * valor es el servidor, y `reassign_ticket_client` lo vuelve a comprobar.
 */
export async function listClientOptions(
  search?: string,
  limit = SEARCH_OPTIONS_LIMIT,
  scope?: { sellerId?: string },
): Promise<ClientOption[]> {
  const supabase = await createClient()
  let query = supabase.from('clients').select('id, name, alias, phone').is('archived_at', null)

  if (scope?.sellerId) query = query.eq('seller_id', scope.sellerId)

  const needle = search ? sanitizeSearch(search) : ''
  if (needle !== '') query = query.ilike('search_text', `%${needle}%`)

  const { data, error } = await query.order('name', { ascending: true }).limit(limit)

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    alias: row.alias,
    phone: row.phone,
  }))
}

async function sellerNameMap(): Promise<Map<string, string>> {
  const members = await listOrgMembers(['owner', 'admin', 'seller'])
  return new Map(members.map((member) => [member.profileId, member.fullName]))
}
