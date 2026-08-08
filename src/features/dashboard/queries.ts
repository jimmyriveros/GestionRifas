import 'server-only'

import { listPayments, type PaymentListItem } from '@/features/payments/queries'
import { listRaffleSummaries, type RaffleSummary } from '@/features/raffles/queries'
import { listSellersWithTotals, type SellerWithTotals } from '@/features/sellers/queries'
import { listOrgMembers } from '@/features/users/queries'
import { createClient } from '@/lib/supabase/server'

/**
 * Metricas del dashboard administrativo (CLAUDE.md 23).
 *
 * Se apoyan en las vistas agregadas de la Fase 2, que suman en SQL: el dinero
 * jamas se calcula en el navegador ni recorriendo filas en memoria. Lo unico
 * que se suma aqui son las filas YA AGREGADAS por la base de datos: una por
 * rifa y una por vendedor, decenas en total, nunca boletas sueltas.
 */

export type AdminDashboard = {
  activeRaffle: RaffleSummary | null
  raffles: RaffleSummary[]
  sellers: SellerWithTotals[]
  activeSellers: number
  totals: {
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

  const [raffles, sellers, members, { data: recent, error: recentError }, recentPayments] =
    await Promise.all([
      listRaffleSummaries(),
      listSellersWithTotals(),
      listOrgMembers(['seller']),
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
    ])

  if (recentError) throw recentError

  // La rifa "activa" del encabezado: la primera activa; si no hay ninguna, la
  // mas reciente, para que el panel nunca quede vacio sin explicacion.
  const activeRaffle = raffles.find((raffle) => raffle.status === 'active') ?? raffles[0] ?? null

  const totals = raffles.reduce(
    (acc, raffle) => ({
      ticketsTotal: acc.ticketsTotal + raffle.ticketsTotal,
      ticketsAvailable: acc.ticketsAvailable + raffle.ticketsAvailable,
      ticketsAssigned: acc.ticketsAssigned + raffle.ticketsAssigned,
      ticketsPendingApproval: acc.ticketsPendingApproval + raffle.ticketsPendingApproval,
      ticketsUnpaid: acc.ticketsUnpaid,
      ticketsPartial: acc.ticketsPartial,
      ticketsPaid: acc.ticketsPaid,
      totalSold: acc.totalSold + raffle.totalSold,
      totalCollected: acc.totalCollected + raffle.totalCollected,
      pendingAmount: acc.pendingAmount + raffle.pendingAmount,
    }),
    {
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
    },
  )

  // Los estados de pago vienen contados por SQL en `v_seller_summary`; aqui
  // solo se suman los vendedores (BR-F07: nunca se recalculan en la aplicacion).
  for (const seller of sellers) {
    totals.ticketsUnpaid += seller.ticketsUnpaid
    totals.ticketsPartial += seller.ticketsPartial
    totals.ticketsPaid += seller.ticketsPaid
  }

  return {
    activeRaffle,
    raffles,
    sellers,
    activeSellers: members.filter((member) => member.isActive).length,
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
