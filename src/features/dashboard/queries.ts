import 'server-only'

import { listSellersWithInventory, type SellerWithInventory } from '@/features/sellers/queries'
import {
  addInventory,
  readAdminTicketInventory,
  ZERO_INVENTORY,
  type InventoryCounts,
} from '@/features/tickets/admin-queries'

/**
 * Metricas del panel administrativo (CLAUDE.md 23).
 *
 * DESDE D-198 SOLO HAY RECUENTOS. La cartera es de cada vendedor: el personal ya
 * no ve lo vendido, lo recaudado, el saldo ni los pagos recientes (alcance B,
 * BR-Q08). Lo que queda es el inventario de la organizacion y los dos estados de
 * pago administrativos, «Pagadas» y «Sin pagar», contados en SQL por
 * `admin_ticket_inventory`.
 *
 * Una sola lectura para las cifras y el resumen por vendedor, memoizada por
 * peticion: la misma regla que D-103 dejo para `v_seller_summary`.
 */

export type AdminDashboard = {
  sellers: SellerWithInventory[]
  activeSellers: number
  totals: InventoryCounts
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const [rows, sellers] = await Promise.all([
    readAdminTicketInventory(null),
    listSellersWithInventory(),
  ])

  return {
    sellers,
    // Los vendedores ya vienen en `sellers`: contarlos aqui evita repetir la
    // consulta de membresias que esa lista acaba de hacer.
    activeSellers: sellers.filter((seller) => seller.isActive).length,
    totals: rows.reduce(addInventory, { ...ZERO_INVENTORY }),
  }
}
