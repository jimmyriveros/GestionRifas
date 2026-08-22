import 'server-only'

import { listPayments, type PaymentListItem } from '@/features/payments/queries'
import {
  listSellersWithTotals,
  readSellerSummary,
  type SellerWithTotals,
} from '@/features/sellers/queries'
import { createClient } from '@/lib/supabase/server'

/**
 * Metricas del dashboard administrativo (CLAUDE.md 23).
 *
 * Se apoyan en las vistas agregadas de la Fase 2, que suman en SQL: el dinero
 * jamas se calcula en el navegador ni recorriendo filas en memoria. Lo unico
 * que se suma aqui son las filas YA AGREGADAS por la base de datos: una por
 * rifa y vendedor, decenas en total, nunca boletas sueltas.
 *
 * Desde D-103 las diez cifras del panel salen de UNA sola de esas vistas
 * (`v_seller_summary`), memoizada por peticion: antes se agregaba la tabla de
 * boletas dos veces por pantalla y las cifras venian de dos fuentes que podian
 * discrepar.
 */

export type OrganizationTotals = {
  ticketsTotal: number
  ticketsAvailable: number
  ticketsAssigned: number
  ticketsPendingApproval: number
  ticketsUnpaid: number
  ticketsPartial: number
  ticketsPaid: number
  totalSold: number
  totalCollected: number
  pendingAmount: number
}

const ZERO_TOTALS: OrganizationTotals = {
  ticketsTotal: 0,
  ticketsAvailable: 0,
  ticketsAssigned: 0,
  ticketsPendingApproval: 0,
  ticketsUnpaid: 0,
  ticketsPartial: 0,
  ticketsPaid: 0,
  totalSold: 0,
  totalCollected: 0,
  pendingAmount: 0,
}

/**
 * Inventario y dinero de TODA la organizacion, en una sola consulta (D-103).
 *
 * Sale de `v_seller_summary`, que agrupa por (organizacion, rifa, vendedor):
 * como cada boleta tiene exactamente un vendedor, sumar todas sus filas es
 * sumar todas las boletas. No se filtra por nada; la RLS de `tickets` decide
 * que se puede sumar, igual que en el resto del proyecto.
 *
 * POR QUE NO SE USA `v_raffle_summary`, QUE ES LO QUE HABIA
 *
 * Daba exactamente las mismas cifras —se comprobo fila a fila sobre 300.000
 * boletas— pero obligaba a un SEGUNDO agregado sobre la tabla entera, porque
 * los conteos por estado de pago del panel ya salian de `v_seller_summary`. Y
 * mezclarlos tenia un riesgo: los estados de pago se sumaban recorriendo la
 * lista de vendedores, de modo que las boletas de alguien que hubiera dejado de
 * tener el rol `seller` habrian dejado de contarse ahi mientras seguian
 * contando en el total de la rifa. Con una sola fuente, las diez cifras del
 * panel vienen del mismo sitio y no pueden discrepar.
 *
 * La lectura en crudo vive en `features/sellers` y esta memoizada por peticion,
 * de modo que en el panel administrativo —donde el resumen por vendedor la
 * necesita tambien— el agregado sobre la tabla de boletas se hace UNA sola vez.
 * Alli dentro se pagina con `fetchAllRows`, porque PostgREST corta en 1.000
 * filas SIN avisar (I-011) y un panel de dinero no puede quedarse corto en
 * silencio.
 */
export async function getOrganizationTotals(): Promise<OrganizationTotals> {
  const rows = await readSellerSummary(null)

  return rows.reduce<OrganizationTotals>(
    (acc, row) => ({
      ticketsTotal: acc.ticketsTotal + (row.tickets_total ?? 0),
      ticketsAvailable: acc.ticketsAvailable + (row.tickets_available ?? 0),
      ticketsAssigned: acc.ticketsAssigned + (row.tickets_assigned ?? 0),
      ticketsPendingApproval: acc.ticketsPendingApproval + (row.tickets_pending_approval ?? 0),
      ticketsUnpaid: acc.ticketsUnpaid + (row.tickets_unpaid ?? 0),
      ticketsPartial: acc.ticketsPartial + (row.tickets_partial ?? 0),
      ticketsPaid: acc.ticketsPaid + (row.tickets_paid ?? 0),
      totalSold: acc.totalSold + (row.total_sold ?? 0),
      totalCollected: acc.totalCollected + (row.total_collected ?? 0),
      pendingAmount: acc.pendingAmount + (row.pending_amount ?? 0),
    }),
    { ...ZERO_TOTALS },
  )
}

export type AdminDashboard = {
  sellers: SellerWithTotals[]
  activeSellers: number
  totals: OrganizationTotals
  recentTickets: {
    id: string
    dailyNumber: string | null
    weeklyNumber: string | null
    createdAt: string
    raffleShortCode: string
  }[]
  /** Ultimos abonos de la organizacion (CLAUDE.md 23: «pagos recientes»). */
  recentPayments: PaymentListItem[]
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const supabase = await createClient()

  const [totals, sellers, { data: recent, error: recentError }, recentPayments] = await Promise.all(
    [
      getOrganizationTotals(),
      listSellersWithTotals(),
      supabase
        .from('tickets')
        .select(
          // Los dos numeros, no el codigo interno: es como se reconoce una
          // boleta de un vistazo (BR-N11).
          'id, daily_number, weekly_number, created_at, raffle:raffles!tickets_raffle_org_fk ( short_code )',
        )
        .order('created_at', { ascending: false })
        .limit(5),
      // Incluye los anulados a proposito: el panel debe reflejar lo que paso,
      // y la tabla los muestra tachados (BR-F09).
      listPayments({ pageSize: 5 }),
    ],
  )

  if (recentError) throw recentError

  return {
    sellers,
    // Los vendedores ya vienen en `sellers`: contarlos aqui evita repetir la
    // consulta de membresias que esa lista acaba de hacer.
    activeSellers: sellers.filter((seller) => seller.isActive).length,
    totals,
    recentTickets: (recent ?? []).map((row) => ({
      id: row.id,
      dailyNumber: row.daily_number,
      weeklyNumber: row.weekly_number,
      createdAt: row.created_at,
      raffleShortCode: row.raffle?.short_code ?? '',
    })),
    recentPayments: recentPayments.rows,
  }
}
