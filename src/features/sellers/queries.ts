import 'server-only'

import {
  addInventory,
  readAdminTicketInventory,
  ZERO_INVENTORY,
  type InventoryCounts,
} from '@/features/tickets/admin-queries'
import { listOrgMembers, type OrgMember } from '@/features/users/queries'

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
