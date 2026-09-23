import 'server-only'

import {
  addInventory,
  readAdminTicketInventory,
  ZERO_INVENTORY,
  type InventoryCounts,
} from '@/features/tickets/admin-queries'
import { listOrgMembers, type OrgMember } from '@/features/users/queries'
import {
  compareBoolean,
  compareNumber,
  compareText,
  type ListComparators,
} from '@/lib/list-page'

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
 * Las columnas por las que se puede ordenar «Vendedores» (P1-H).
 *
 * «Equipo» no esta: esa celda se arma en la pantalla contando, sobre la lista
 * completa, quien pertenece al equipo de quien, y no es un dato de la fila.
 * «Acciones» tampoco, que no es un dato.
 */
export const SELLER_SORT_COLUMNS = [
  'fullName',
  'isActive',
  'ticketsTotal',
  'ticketsAssigned',
  'ticketsPendingApproval',
] as const

export const SELLER_COMPARATORS: ListComparators<SellerWithInventory> = {
  fullName: (a, b) => compareText(a.fullName, b.fullName),
  isActive: (a, b) => compareBoolean(a.isActive, b.isActive),
  ticketsTotal: (a, b) => compareNumber(a.ticketsTotal, b.ticketsTotal),
  ticketsAssigned: (a, b) => compareNumber(a.ticketsAssigned, b.ticketsAssigned),
  ticketsPendingApproval: (a, b) =>
    compareNumber(a.ticketsPendingApproval, b.ticketsPendingApproval),
}
