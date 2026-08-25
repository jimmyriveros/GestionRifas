import 'server-only'

import { listPayments, type PaymentListItem } from '@/features/payments/queries'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { createClient } from '@/lib/supabase/server'

import type { PartialTicketTotals } from './collection-breakdown'
import { eachDay, previousRange, type DateRange } from './date-range'

/**
 * Metricas del dashboard del vendedor (CLAUDE.md 23).
 *
 * No se filtra por `seller_id` en ninguna consulta: `v_seller_summary` se
 * ejecuta con `security_invoker`, hereda la RLS de `tickets` y por tanto un
 * vendedor solo puede agregar SUS boletas (BR-U07). Filtrar aqui seria
 * cosmetico; la garantia esta en la base de datos.
 */

export type SellerDashboard = {
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
  /** Sus ultimos abonos (CLAUDE.md 23: «pagos recientes»). */
  recentPayments: PaymentListItem[]
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

  // DOS consultas, no cinco (D-112). El panel rediseñado dejo de mostrar
  // «Ventas recientes» y «Clientes recientes», y con ellas se fueron sus dos
  // lecturas y el recuento de clientes que alimentaba el boton grande de
  // «Nuevo cliente». Seguian pidiendose en cada carga del panel Y de
  // `/seller/payments`, que comparte esta funcion, para no pintarse en ninguna
  // de las dos. Si alguna vuelve a hacer falta, el historial de Git la tiene.
  const [{ data: summary, error: summaryError }, recentPayments] = await Promise.all([
    supabase.from('v_seller_summary').select('*'),
    // `listPayments` no filtra por vendedor: `v_payment_history` es
    // security_invoker y ya devuelve unicamente los pagos de quien consulta.
    listPayments({ pageSize: 5 }),
  ])

  if (summaryError) throw summaryError

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

  return { totals, recentPayments: recentPayments.rows }
}

// ---------------------------------------------------------------------------
// Panel rediseñado (D-112)
//
// Dos lecturas mas, y ninguna repite lo que ya trae `getSellerDashboard`.
// ---------------------------------------------------------------------------

/**
 * Tope de boletas «Abonadas» que se leen fila a fila.
 *
 * Una boleta solo esta a medias mientras alguien la va pagando a plazos, asi
 * que este numero no lo alcanza un vendedor real: el negocio entero tiene 121
 * boletas. Existe por la misma razon que `EXPORT_ROW_LIMIT` —acotar lo que se
 * carga en memoria—, y si se alcanzara, la funcion devuelve `null` en vez de
 * unas sumas cortas: el panel entonces muestra el dinero sin separar «Pagadas»
 * de «Abonadas», que es menos detalle pero sigue siendo cierto (I-011).
 */
const PARTIAL_TICKETS_LIMIT = 5_000

/**
 * Lo abonado y el precio de las boletas que estan a medias.
 *
 * Es la UNICA cifra que `v_seller_summary` no da y que el panel necesita para
 * repartir el dinero por estado de pago; todo lo demas se deduce de ella en
 * `collection-breakdown.ts`, que explica la aritmetica.
 *
 * Sin filtrar por vendedor: `v_ticket_balances` es `security_invoker` y hereda
 * la RLS de `tickets`, igual que el resto de este archivo.
 *
 * `inventory_status = 'assigned'` no es redundante aunque una boleta con abonos
 * no se pueda anular (BR-I11): el dinero de las demas cifras se suma con ese
 * mismo filtro, y usar dos criterios distintos para el mismo total es
 * exactamente como aparece una diferencia que nadie sabe explicar.
 */
export async function getSellerPartialTicketTotals(): Promise<PartialTicketTotals | null> {
  const supabase = await createClient()

  const { rows, truncated } = await fetchAllRows<{
    sale_price: number | null
    paid_amount: number | null
  }>(
    (from, to) =>
      supabase
        .from('v_ticket_balances')
        .select('sale_price, paid_amount')
        .eq('inventory_status', 'assigned')
        .eq('payment_status', 'partial')
        // Orden estable: sin el, dos bloques consecutivos pueden repetir filas.
        .order('ticket_id', { ascending: true })
        .range(from, to),
    PARTIAL_TICKETS_LIMIT,
  )

  if (truncated) return null

  return rows.reduce<PartialTicketTotals>(
    (acc, row) => ({
      salePrice: acc.salePrice + (row.sale_price ?? 0),
      paidAmount: acc.paidAmount + (row.paid_amount ?? 0),
    }),
    { salePrice: 0, paidAmount: 0 },
  )
}

export type SellerActivity = {
  /** Un punto por dia del rango, del mas antiguo al mas reciente y sin huecos. */
  trend: { date: string; amount: number }[]
  /** Dinero recibido dentro del rango. */
  collected: number
  /** Lo mismo en el periodo inmediatamente anterior, para la comparacion. */
  previousCollected: number
}

/**
 * Recaudo del periodo elegido, dia a dia, y el total del periodo anterior.
 *
 * Las dos cifras salen de las funciones que ya alimentan el reporte de pagos
 * (`0013`), no de una consulta nueva: son `security invoker`, de modo que un
 * vendedor agrega unicamente sus propios abonos, y suman en SQL. Se lee
 * `active_amount` —lo vigente— porque un pago anulado permanece en el historial
 * pero NO es dinero recibido (BR-F09).
 *
 * Los dias sin movimiento no vienen de la base de datos, que solo devuelve
 * filas de dias con pagos; se rellenan con cero para que el grafico conserve la
 * forma del periodo en vez de juntar dos fechas lejanas.
 */
export async function getSellerActivity(range: DateRange): Promise<SellerActivity> {
  const supabase = await createClient()
  const previous = previousRange(range)

  const [{ data: byDay, error: byDayError }, { data: previousTotals, error: previousError }] =
    await Promise.all([
      supabase.rpc('report_payments_by_day', { p_date_from: range.from, p_date_to: range.to }),
      supabase
        .rpc('report_payment_totals', { p_date_from: previous.from, p_date_to: previous.to })
        .maybeSingle(),
    ])

  if (byDayError) throw byDayError
  if (previousError) throw previousError

  const amounts = new Map<string, number>(
    (byDay ?? []).map((row) => [row.payment_date, Number(row.active_amount ?? 0)]),
  )

  const trend = eachDay(range).map((date) => ({ date, amount: amounts.get(date) ?? 0 }))

  return {
    trend,
    collected: trend.reduce((total, day) => total + day.amount, 0),
    previousCollected: Number(previousTotals?.active_amount ?? 0),
  }
}
