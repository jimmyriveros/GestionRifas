import 'server-only'

import {
  addInventory,
  readAdminTicketInventory,
  ZERO_INVENTORY,
  type InventoryCounts,
} from '@/features/tickets/admin-queries'
import { listOrgMembers, type OrgMember } from '@/features/users/queries'
import { PAGE_SIZE } from '@/lib/constants'
import type { PagedList } from '@/lib/list-page'
import type { ListSort } from '@/lib/list-sort'
import { createClient } from '@/lib/supabase/server'

/**
 * Vendedores con sus indicadores. La gestion (alta, edicion, activacion) vive
 * en `features/users`: un vendedor es una membresia con rol `seller`, no una
 * entidad aparte. Aqui solo se agregan sus numeros.
 *
 * DESDE D-198 SON RECUENTOS, NO DINERO. Estas lecturas sirven al portal
 * administrativo, y el personal ya no ve lo vendido, lo recaudado ni el saldo de
 * cada vendedor (alcance B, BR-Q08). Salen de `admin_ticket_inventory`, que no
 * devuelve ningun importe, asi que no hay cifra de dinero que se pueda pintar.
 */

export type SellerWithInventory = OrgMember & InventoryCounts

/**
 * Los vendedores de la organizacion con sus recuentos, en dos consultas fijas:
 * la lista de personas y el agregado; nunca una por vendedor
 * (docs/ARCHITECTURE.md 10).
 */
export async function listSellersWithInventory(raffleId?: string): Promise<SellerWithInventory[]> {
  const [sellers, rows] = await Promise.all([
    listOrgMembers(['seller']),
    readAdminTicketInventory(raffleId ?? null),
  ])

  const bySeller = new Map<string, InventoryCounts>()
  for (const row of rows) {
    bySeller.set(row.sellerId, addInventory(bySeller.get(row.sellerId) ?? ZERO_INVENTORY, row))
  }

  return sellers.map((seller) => ({
    ...seller,
    ...(bySeller.get(seller.profileId) ?? ZERO_INVENTORY),
  }))
}

export async function getSellerWithInventory(
  profileId: string,
): Promise<SellerWithInventory | null> {
  const sellers = await listSellersWithInventory()
  return sellers.find((item) => item.profileId === profileId) ?? null
}

export type SellerOption = { id: string; fullName: string; alias: string | null }

/** Vendedores ACTIVOS para selectores: solo ellos pueden recibir boletas. */
export async function listActiveSellerOptions(): Promise<SellerOption[]> {
  const members = await listOrgMembers(['seller'])
  return members
    .filter((member) => member.isActive)
    .map((member) => ({ id: member.profileId, fullName: member.fullName, alias: member.alias }))
}

/**
 * Una PAGINA de «Vendedores», ordenada y contada POR LA BASE (D-214).
 *
 * Va por `admin_list_sellers` (migracion 0076) y no por PostgREST, porque la
 * fila cruza dos cosas que el personal NO puede leer directamente: las boletas
 * —`tickets_select` solo devuelve las del propio vendedor— y sus recuentos. La
 * funcion es `security definer` y se acota con `current_staff_org_ids()`.
 *
 * El equipo viene RESUELTO desde SQL —cuantos tiene a su cargo y de quien
 * depende—, que es lo que antes obligaba a recorrer la lista completa: cortando
 * primero, un vendedor cuyo equipo cayera en otra pagina aparecia sin el.
 *
 * DEVUELVE RECUENTOS, NUNCA DINERO (D-198, BR-Q08).
 */
export async function listSellersPage(options: {
  page: number
  sort: ListSort | null
  raffleId?: string
}): Promise<PagedList<SellerWithInventory> & { team: SellerTeamInfo }> {
  const supabase = await createClient()
  const pageSize = PAGE_SIZE
  const page = Math.max(1, options.page)

  const { data, error } = await supabase.rpc('admin_list_sellers', {
    ...(options.raffleId ? { p_raffle_id: options.raffleId } : {}),
    ...(options.sort
      ? { p_sort_column: options.sort.column, p_sort_direction: options.sort.direction }
      : {}),
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  })

  if (error) throw error

  const rows = data ?? []
  const teamSizes = new Map<string, number>()
  const parentNames = new Map<string, string>()

  const sellers = rows.map((row) => {
    const profileId = row.profile_id ?? ''
    teamSizes.set(profileId, Number(row.team_size ?? 0))
    if (row.parent_seller_id && row.parent_seller_name) {
      parentNames.set(row.parent_seller_id, row.parent_seller_name)
    }
    return {
      membershipId: row.membership_id ?? '',
      profileId,
      role: row.role ?? 'seller',
      isActive: row.account_active ?? false,
      fullName: row.full_name ?? '',
      alias: row.alias,
      phone: row.phone ?? '',
      email: row.email ?? '',
      createdAt: row.created_at ?? '',
      parentSellerId: row.parent_seller_id,
      commissionModel: row.commission_model ?? 'tiered',
      fixedCommissionAmount:
        row.fixed_commission_amount === null ? null : Number(row.fixed_commission_amount),
      activatedAt: row.activated_at,
      ticketsTotal: Number(row.tickets_total ?? 0),
      ticketsAvailable: Number(row.tickets_available ?? 0),
      ticketsAssigned: Number(row.tickets_assigned ?? 0),
      ticketsPendingApproval: Number(row.tickets_pending_approval ?? 0),
      ticketsDraft: Number(row.tickets_draft ?? 0),
      ticketsCancelled: Number(row.tickets_cancelled ?? 0),
      ticketsPaid: Number(row.tickets_paid ?? 0),
      ticketsNotPaid: Number(row.tickets_not_paid ?? 0),
    }
  })

  /*
    UNA PAGINA QUE NO EXISTE devuelve cero filas, y con ellas se iria el
    recuento: `total_count` viaja repetido en CADA fila, asi que sin filas la
    barra diria «de 0» en una lista que si tiene. Se vuelve a preguntar por la
    primera, que es una sola fila, y solo en ese caso.
  */
  let total = Number(rows[0]?.total_count ?? 0)
  if (rows.length === 0 && page > 1) {
    const { data: primera } = await supabase.rpc('admin_list_sellers', {
      ...(options.raffleId ? { p_raffle_id: options.raffleId } : {}),
      p_limit: 1,
      p_offset: 0,
    })
    total = Number(primera?.[0]?.total_count ?? 0)
  }

  return {
    rows: sellers,
    total,
    page,
    pageSize,
    team: { teamSizes, parentNames },
  }
}

/** Lo que la columna «Equipo» necesita, ya resuelto por SQL (BR-E08). */
export type SellerTeamInfo = {
  teamSizes: Map<string, number>
  parentNames: Map<string, string>
}

/**
 * Las columnas por las que se puede ordenar «Vendedores» (P1-H).
 *
 * «Equipo» no esta: es una celda con tres formas distintas —tiene equipo,
 * pertenece al de alguien, o ninguna—, no un valor por el que ordenar.
 * «Acciones» tampoco, que no es un dato. Y no hay ninguna de dinero: el
 * personal no ve la cartera de nadie (D-198).
 */
export const SELLER_SORT_COLUMNS = [
  'fullName',
  'isActive',
  'ticketsTotal',
  'ticketsAssigned',
  'ticketsPendingApproval',
] as const
