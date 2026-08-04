import 'server-only'

import { listRaffleOptions, type RaffleOption } from '@/features/raffles/queries'
import { createClient } from '@/lib/supabase/server'

/**
 * Metricas del dashboard del vendedor (CLAUDE.md 23).
 *
 * No se filtra por `seller_id` en ninguna consulta: `v_seller_summary` se
 * ejecuta con `security_invoker`, hereda la RLS de `tickets` y por tanto un
 * vendedor solo puede agregar SUS boletas (BR-U07). Filtrar aqui seria
 * cosmetico; la garantia esta en la base de datos.
 */

export type SellerDashboard = {
  activeRaffle: RaffleOption | null
  /** Rifas activas que le permiten crear boletas (BR-R10). */
  canCreateTickets: boolean
  totals: {
    ticketsTotal: number
    ticketsAvailable: number
    ticketsAssigned: number
    ticketsPendingApproval: number
    ticketsDraft: number
    ticketsUnpaid: number
    ticketsPartial: number
    ticketsPaid: number
    totalSold: number
    totalCollected: number
    pendingAmount: number
  }
  clientsCount: number
  recentClients: { id: string; name: string; phone: string; createdAt: string }[]
  recentTickets: {
    id: string
    internalCode: string
    dailyNumber: string | null
    weeklyNumber: string | null
    assignedAt: string
    clientName: string | null
  }[]
}

const ZERO: SellerDashboard['totals'] = {
  ticketsTotal: 0,
  ticketsAvailable: 0,
  ticketsAssigned: 0,
  ticketsPendingApproval: 0,
  ticketsDraft: 0,
  ticketsUnpaid: 0,
  ticketsPartial: 0,
  ticketsPaid: 0,
  totalSold: 0,
  totalCollected: 0,
  pendingAmount: 0,
}

export async function getSellerDashboard(): Promise<SellerDashboard> {
  const supabase = await createClient()

  const [
    raffles,
    { data: summary, error: summaryError },
    { count: clientsCount, error: clientsCountError },
    { data: recentClients, error: recentClientsError },
    { data: recentTickets, error: recentTicketsError },
  ] = await Promise.all([
    listRaffleOptions(),
    supabase.from('v_seller_summary').select('*'),
    // Conteo EXACTO en SQL: contar filas en memoria seria erroneo porque
    // PostgREST corta las respuestas en 1.000 filas.
    supabase.from('clients').select('id', { count: 'exact', head: true }).is('archived_at', null),
    supabase
      .from('clients')
      .select('id, name, phone, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('tickets')
      .select(
        'id, internal_code, daily_number, weekly_number, assigned_at, client:clients!tickets_client_org_fk ( name )',
      )
      .eq('inventory_status', 'assigned')
      .order('assigned_at', { ascending: false })
      .limit(5),
  ])

  if (summaryError) throw summaryError
  if (clientsCountError) throw clientsCountError
  if (recentClientsError) throw recentClientsError
  if (recentTicketsError) throw recentTicketsError

  const totals = (summary ?? []).reduce<SellerDashboard['totals']>(
    (acc, row) => ({
      ticketsTotal: acc.ticketsTotal + (row.tickets_total ?? 0),
      ticketsAvailable: acc.ticketsAvailable + (row.tickets_available ?? 0),
      ticketsAssigned: acc.ticketsAssigned + (row.tickets_assigned ?? 0),
      ticketsPendingApproval: acc.ticketsPendingApproval + (row.tickets_pending_approval ?? 0),
      ticketsDraft: acc.ticketsDraft + (row.tickets_draft ?? 0),
      ticketsUnpaid: acc.ticketsUnpaid + (row.tickets_unpaid ?? 0),
      ticketsPartial: acc.ticketsPartial + (row.tickets_partial ?? 0),
      ticketsPaid: acc.ticketsPaid + (row.tickets_paid ?? 0),
      totalSold: acc.totalSold + (row.total_sold ?? 0),
      totalCollected: acc.totalCollected + (row.total_collected ?? 0),
      pendingAmount: acc.pendingAmount + (row.pending_amount ?? 0),
    }),
    { ...ZERO },
  )

  const activeRaffles = raffles.filter((raffle) => raffle.status === 'active')

  return {
    activeRaffle: activeRaffles[0] ?? null,
    canCreateTickets: activeRaffles.some((raffle) => raffle.allowSellerTicketCreation),
    totals,
    clientsCount: clientsCount ?? 0,
    recentClients: (recentClients ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      createdAt: row.created_at,
    })),
    recentTickets: (recentTickets ?? []).flatMap((row) =>
      row.assigned_at
        ? [
            {
              id: row.id,
              internalCode: row.internal_code,
              dailyNumber: row.daily_number,
              weeklyNumber: row.weekly_number,
              assignedAt: row.assigned_at,
              clientName: row.client?.name ?? null,
            },
          ]
        : [],
    ),
  }
}
