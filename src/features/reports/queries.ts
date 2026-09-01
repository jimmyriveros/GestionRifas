import 'server-only'

import { listRaffleSummaries, type RaffleSummary } from '@/features/raffles/queries'
import { listSellersWithTotals } from '@/features/sellers/queries'
import { listOrgMembers } from '@/features/users/queries'
import {
  PAGE_SIZE,
  TICKET_INVENTORY_STATUS_LABELS,
  TICKET_PAYMENT_STATUS_LABELS,
  type PaymentMethod,
  type TicketInventoryStatus,
  type TicketPaymentStatus,
} from '@/lib/constants'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { createClient } from '@/lib/supabase/server'

import type { ReportFilters } from './schemas'

/**
 * Lecturas de los reportes (CLAUDE.md §24).
 *
 * DOS REGLAS QUE NO SE NEGOCIAN
 *
 * 1. **El dinero se agrega en SQL.** Ningun total sale de recorrer filas en el
 *    servidor de aplicaciones. Los agregados ya existen: `v_seller_summary` y
 *    `v_raffle_summary` (por rifa y vendedor), `v_client_balances` (por
 *    cliente) y, desde la Fase 6, `report_payment_totals` /
 *    `report_payments_by_day` para el recaudo por fechas.
 *
 *    Donde este archivo suma en TypeScript, lo hace sobre un conjunto ACOTADO
 *    y ya agregado por la base de datos —una fila por (rifa, vendedor)—, nunca
 *    sobre boletas o pagos individuales.
 *
 * 2. **El aislamiento lo hace la RLS, no estos filtros.** Todas las vistas son
 *    `security_invoker` y las dos funciones nuevas son `security invoker`: un
 *    vendedor que consulte cualquiera de ellas obtiene sus propios numeros y
 *    los de nadie mas. `sellerId` es una comodidad del portal administrativo
 *    para acotar la vista, no un control de seguridad (docs/SECURITY.md §1).
 */

export type ReportTotals = {
  ticketsTotal: number
  ticketsAssigned: number
  totalSold: number
  totalCollected: number
  pendingAmount: number
}

const ZERO_TOTALS: ReportTotals = {
  ticketsTotal: 0,
  ticketsAssigned: 0,
  totalSold: 0,
  totalCollected: 0,
  pendingAmount: 0,
}

// ---------------------------------------------------------------------------
// Reporte 1-3 — ventas, recaudo y saldo por vendedor
// ---------------------------------------------------------------------------

export type SellerReportRow = {
  sellerId: string
  sellerName: string
  alias: string | null
  isActive: boolean
  ticketsTotal: number
  ticketsAvailable: number
  ticketsAssigned: number
  ticketsUnpaid: number
  ticketsPartial: number
  ticketsPaid: number
  totalSold: number
  totalCollected: number
  pendingAmount: number
}

/**
 * Los tres reportes «por vendedor» de CLAUDE.md §24 son columnas de una misma
 * tabla: ventas, recaudo y saldo pendiente. Separarlos en tres pantallas
 * obligaria a comparar tres veces lo mismo (D-055).
 *
 * Parte de la lista de vendedores, no de la de boletas: un vendedor sin una
 * sola boleta debe aparecer con ceros, porque «no ha vendido nada» es
 * justamente lo que el reporte tiene que dejar ver.
 */
export async function getSellerReport(
  filters: Pick<ReportFilters, 'raffleId'>,
): Promise<{ rows: SellerReportRow[]; totals: ReportTotals }> {
  const sellers = await listSellersWithTotals(filters.raffleId)

  const rows: SellerReportRow[] = sellers
    .map((seller) => ({
      sellerId: seller.profileId,
      sellerName: seller.fullName,
      alias: seller.alias,
      isActive: seller.isActive,
      ticketsTotal: seller.ticketsTotal,
      ticketsAvailable: seller.ticketsAvailable,
      ticketsAssigned: seller.ticketsAssigned,
      ticketsUnpaid: seller.ticketsUnpaid,
      ticketsPartial: seller.ticketsPartial,
      ticketsPaid: seller.ticketsPaid,
      totalSold: seller.totalSold,
      totalCollected: seller.totalCollected,
      pendingAmount: seller.pendingAmount,
    }))
    // De mas a menos vendido: es el orden en el que se lee un reporte de ventas.
    .sort((a, b) => b.totalSold - a.totalSold || a.sellerName.localeCompare(b.sellerName, 'es'))

  const totals = rows.reduce<ReportTotals>(
    (acc, row) => ({
      ticketsTotal: acc.ticketsTotal + row.ticketsTotal,
      ticketsAssigned: acc.ticketsAssigned + row.ticketsAssigned,
      totalSold: acc.totalSold + row.totalSold,
      totalCollected: acc.totalCollected + row.totalCollected,
      pendingAmount: acc.pendingAmount + row.pendingAmount,
    }),
    { ...ZERO_TOTALS },
  )

  return { rows, totals }
}

// ---------------------------------------------------------------------------
// Reporte 4 — boletas por estado
// ---------------------------------------------------------------------------

export type TicketStatusReportRow = {
  group: 'inventory' | 'payment'
  groupLabel: string
  status: string
  statusLabel: string
  count: number
}

type SellerSummaryCounts = {
  tickets_total: number | null
  tickets_available: number | null
  tickets_assigned: number | null
  tickets_pending_approval: number | null
  tickets_draft: number | null
  tickets_cancelled: number | null
  tickets_unpaid: number | null
  tickets_partial: number | null
  tickets_paid: number | null
  total_sold: number | null
  total_collected: number | null
  pending_amount: number | null
}

/**
 * Conteo por estado de inventario y por estado de pago.
 *
 * Los numeros vienen contados por SQL en `v_seller_summary`; aqui solo se
 * suman las filas (una por rifa y vendedor), que son decenas, no miles.
 */
export async function getTicketStatusReport(
  filters: Pick<ReportFilters, 'raffleId' | 'sellerId'>,
): Promise<{ rows: TicketStatusReportRow[]; totals: ReportTotals }> {
  const supabase = await createClient()

  const { rows: summaries } = await fetchAllRows<SellerSummaryCounts>((from, to) => {
    let query = supabase.from('v_seller_summary').select('*')
    if (filters.raffleId) query = query.eq('raffle_id', filters.raffleId)
    if (filters.sellerId) query = query.eq('seller_id', filters.sellerId)
    return query.order('seller_id', { ascending: true }).range(from, to)
  })

  const counts = {
    draft: 0,
    pending_approval: 0,
    available: 0,
    assigned: 0,
    cancelled: 0,
    unpaid: 0,
    partial: 0,
    paid: 0,
  }
  const totals = { ...ZERO_TOTALS }

  for (const row of summaries) {
    counts.draft += row.tickets_draft ?? 0
    counts.pending_approval += row.tickets_pending_approval ?? 0
    counts.available += row.tickets_available ?? 0
    counts.assigned += row.tickets_assigned ?? 0
    counts.cancelled += row.tickets_cancelled ?? 0
    counts.unpaid += row.tickets_unpaid ?? 0
    counts.partial += row.tickets_partial ?? 0
    counts.paid += row.tickets_paid ?? 0

    totals.ticketsTotal += row.tickets_total ?? 0
    totals.ticketsAssigned += row.tickets_assigned ?? 0
    totals.totalSold += row.total_sold ?? 0
    totals.totalCollected += row.total_collected ?? 0
    totals.pendingAmount += row.pending_amount ?? 0
  }

  const rows: TicketStatusReportRow[] = [
    ...(['draft', 'pending_approval', 'available', 'assigned', 'cancelled'] as const).map(
      (status) => ({
        group: 'inventory' as const,
        groupLabel: 'Inventario',
        status,
        statusLabel: TICKET_INVENTORY_STATUS_LABELS[status],
        count: counts[status],
      }),
    ),
    ...(['unpaid', 'partial', 'paid'] as const).map((status) => ({
      group: 'payment' as const,
      groupLabel: 'Cobranza',
      status,
      statusLabel: TICKET_PAYMENT_STATUS_LABELS[status],
      count: counts[status],
    })),
  ]

  return { rows, totals }
}

// ---------------------------------------------------------------------------
// Reporte 7 — boletas por rifa
// ---------------------------------------------------------------------------

export async function getRaffleReport(): Promise<{
  rows: RaffleSummary[]
  totals: ReportTotals
}> {
  const rows = await listRaffleSummaries()

  const totals = rows.reduce<ReportTotals>(
    (acc, row) => ({
      ticketsTotal: acc.ticketsTotal + row.ticketsTotal,
      ticketsAssigned: acc.ticketsAssigned + row.ticketsAssigned,
      totalSold: acc.totalSold + row.totalSold,
      totalCollected: acc.totalCollected + row.totalCollected,
      pendingAmount: acc.pendingAmount + row.pendingAmount,
    }),
    { ...ZERO_TOTALS },
  )

  return { rows, totals }
}

// ---------------------------------------------------------------------------
// Reporte 5 — clientes con saldo pendiente
// ---------------------------------------------------------------------------

export type ClientBalanceReportRow = {
  clientId: string
  name: string
  alias: string | null
  phone: string
  sellerId: string
  sellerName: string
  archivedAt: string | null
  ticketsCount: number
  totalPurchased: number
  totalPaid: number
  pendingAmount: number
}

type ClientBalanceRow = {
  client_id: string | null
  name: string | null
  alias: string | null
  phone: string | null
  seller_id: string | null
  archived_at: string | null
  tickets_count: number | null
  total_purchased: number | null
  total_paid: number | null
  pending_amount: number | null
}

/**
 * Clientes que todavia deben dinero, del que más debe al que menos.
 *
 * Incluye a los ARCHIVADOS que tengan saldo: archivar a un cliente lo saca de
 * los selectores (BR-C07), no le perdona la deuda. Excluirlos aqui haria que la
 * suma de la columna no cuadrara con el saldo pendiente de la organizacion, que
 * es precisamente el numero que este reporte existe para explicar.
 */
export async function getClientBalanceReport(
  filters: Pick<ReportFilters, 'sellerId' | 'page'> & { all?: boolean },
): Promise<{
  rows: ClientBalanceReportRow[]
  total: number
  page: number
  pageSize: number
  totalPending: number
  /** Solo con `all`: se alcanzo el tope de exportacion y faltan filas. */
  truncated: boolean
}> {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)

  const build = (from: number, to: number) => {
    let query = supabase.from('v_client_balances').select('*').gt('pending_amount', 0)
    if (filters.sellerId) query = query.eq('seller_id', filters.sellerId)
    return (
      query
        .order('pending_amount', { ascending: false })
        // Segundo criterio estable: sin el, dos clientes que deban lo mismo
        // podrian intercambiarse entre paginas y salir repetidos en el CSV.
        .order('client_id', { ascending: true })
        .range(from, to)
    )
  }

  // El conteo lo hace SQL (`head: true` no trae filas): contar el arreglo seria
  // erroneo en cuanto hubiera mas de 1.000 clientes (I-011).
  let countQuery = supabase
    .from('v_client_balances')
    .select('client_id', { count: 'exact', head: true })
    .gt('pending_amount', 0)
  if (filters.sellerId) countQuery = countQuery.eq('seller_id', filters.sellerId)

  const [{ count, error: countError }, page1, sellerNames] = await Promise.all([
    countQuery,
    filters.all
      ? fetchAllRows<ClientBalanceRow>((from, to) => build(from, to))
      : build((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).then(({ data, error }) => {
          if (error) throw error
          return { rows: (data ?? []) as ClientBalanceRow[], truncated: false }
        }),
    sellerNameMap(),
  ])

  if (countError) throw countError

  // El saldo total sale del agregado por vendedor, no de sumar esta pagina:
  // cada boleta asignada pertenece a un cliente y a su vendedor, asi que ambos
  // agregados describen exactamente el mismo dinero.
  const totalPending = await pendingAmountTotal(filters.sellerId)

  return {
    rows: page1.rows.map((row) => ({
      clientId: row.client_id ?? '',
      name: row.name ?? '',
      alias: row.alias,
      phone: row.phone ?? '',
      sellerId: row.seller_id ?? '',
      sellerName: sellerNames.get(row.seller_id ?? '') ?? 'Otro vendedor',
      archivedAt: row.archived_at,
      ticketsCount: row.tickets_count ?? 0,
      totalPurchased: row.total_purchased ?? 0,
      totalPaid: row.total_paid ?? 0,
      pendingAmount: row.pending_amount ?? 0,
    })),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    totalPending,
    truncated: page1.truncated,
  }
}

async function pendingAmountTotal(sellerId?: string): Promise<number> {
  const supabase = await createClient()
  const { rows } = await fetchAllRows<{ pending_amount: number | null }>((from, to) => {
    let query = supabase.from('v_seller_summary').select('pending_amount')
    if (sellerId) query = query.eq('seller_id', sellerId)
    return query.order('seller_id', { ascending: true }).range(from, to)
  })
  return rows.reduce((sum, row) => sum + (row.pending_amount ?? 0), 0)
}

// ---------------------------------------------------------------------------
// Reporte 6 — pagos por rango de fechas
// ---------------------------------------------------------------------------

export type PaymentReportRow = {
  paymentDate: string
  paymentsCount: number
  totalAmount: number
  activeAmount: number
  voidedAmount: number
}

export type PaymentReportTotals = {
  paymentsCount: number
  totalAmount: number
  activeCount: number
  activeAmount: number
  voidedCount: number
  voidedAmount: number
}

type PaymentRpcArgs = {
  p_date_from?: string
  p_date_to?: string
  p_seller_id?: string
  p_method?: PaymentMethod
  p_status?: string
}

/**
 * Un filtro ausente se OMITE del cuerpo de la llamada en vez de enviarse como
 * null: asi la funcion aplica su valor por defecto (`null` = sin filtrar) y no
 * hay dos formas distintas de decir lo mismo.
 */
function paymentRpcArgs(
  filters: Pick<ReportFilters, 'sellerId' | 'dateFrom' | 'dateTo' | 'method' | 'status'>,
): PaymentRpcArgs {
  return {
    ...(filters.dateFrom ? { p_date_from: filters.dateFrom } : {}),
    ...(filters.dateTo ? { p_date_to: filters.dateTo } : {}),
    ...(filters.sellerId ? { p_seller_id: filters.sellerId } : {}),
    ...(filters.method ? { p_method: filters.method } : {}),
    ...(filters.status ? { p_status: filters.status } : {}),
  }
}

/**
 * Recaudo dia a dia y totales exactos del rango.
 *
 * Los totales NO se suman a partir de las filas mostradas: los calcula
 * `report_payment_totals` en SQL, de modo que siguen siendo exactos aunque el
 * rango tenga mas dias de los que caben en una pagina (I-011).
 */
export async function getPaymentReport(
  filters: Pick<
    ReportFilters,
    'sellerId' | 'dateFrom' | 'dateTo' | 'method' | 'status' | 'page'
  > & {
    all?: boolean
  },
): Promise<{
  rows: PaymentReportRow[]
  totals: PaymentReportTotals
  total: number
  page: number
  pageSize: number
  /** Solo con `all`: se alcanzo el tope de exportacion y faltan filas. */
  truncated: boolean
}> {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)
  const args = paymentRpcArgs(filters)

  const byDay = (from: number, to: number) =>
    supabase.rpc('report_payments_by_day', args).range(from, to)

  const [daysResult, { data: totalsData, error: totalsError }, { count, error: countError }] =
    await Promise.all([
      filters.all
        ? fetchAllRows((from, to) => byDay(from, to))
        : byDay((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).then(({ data, error }) => {
            if (error) throw error
            return { rows: data ?? [], truncated: false }
          }),
      supabase.rpc('report_payment_totals', args).maybeSingle(),
      supabase.rpc('report_payments_by_day', args, { count: 'exact', head: true }),
    ])

  if (totalsError) throw totalsError
  if (countError) throw countError

  return {
    rows: daysResult.rows.map((row) => ({
      paymentDate: row.payment_date,
      paymentsCount: Number(row.payments_count ?? 0),
      totalAmount: Number(row.total_amount ?? 0),
      activeAmount: Number(row.active_amount ?? 0),
      voidedAmount: Number(row.voided_amount ?? 0),
    })),
    totals: {
      paymentsCount: Number(totalsData?.payments_count ?? 0),
      totalAmount: Number(totalsData?.total_amount ?? 0),
      activeCount: Number(totalsData?.active_count ?? 0),
      activeAmount: Number(totalsData?.active_amount ?? 0),
      voidedCount: Number(totalsData?.voided_count ?? 0),
      voidedAmount: Number(totalsData?.voided_amount ?? 0),
    },
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    truncated: daysResult.truncated,
  }
}

// ---------------------------------------------------------------------------
// Ventas por fecha — las boletas vendidas en un dia o un rango (D-151)
// ---------------------------------------------------------------------------

export type SalesByDateReportRow = {
  ticketId: string
  /** `tickets.sale_date`: el dia en que se vendio, no en que entro el dinero. */
  saleDate: string | null
  dailyNumber: string | null
  weeklyNumber: string | null
  inventoryStatus: TicketInventoryStatus
  paymentStatus: TicketPaymentStatus
  salePrice: number | null
  paidAmount: number
  clientId: string | null
  clientName: string | null
}

export type SalesByDateTotals = {
  ticketsCount: number
  totalSold: number
  paidAmount: number
  pendingAmount: number
}

/**
 * Solo las columnas que la tabla pinta.
 *
 * `assigned_at` NO se pide aunque se ordene por ella: PostgREST admite ordenar
 * por una columna que no se selecciona, y traerla seria una marca tecnica que
 * la pantalla no enseña.
 *
 * El cliente viaja INCRUSTADO en la misma lectura. Resolver el nombre despues,
 * boleta a boleta, seria justamente la consulta N+1 que el encargo prohibe.
 */
const SALES_BY_DATE_SELECT = `
  id,
  daily_number,
  weekly_number,
  inventory_status,
  payment_status,
  sale_price,
  paid_amount,
  sale_date,
  client_id,
  client:clients!tickets_client_org_fk ( id, name )
`

type SalesByDateRow = {
  id: string
  daily_number: string | null
  weekly_number: string | null
  inventory_status: TicketInventoryStatus
  payment_status: TicketPaymentStatus
  sale_price: number | null
  paid_amount: number
  sale_date: string | null
  client_id: string | null
  client: { id: string; name: string } | null
}

/**
 * Las ventas de un rango de fechas, paginadas, con sus totales exactos.
 *
 * LA DEFINICION DE VENTA NO ES NUEVA (BR-T05). Boleta `assigned`, fechada por
 * `sale_date`. Es la misma que ya usan `v_seller_summary` y `v_client_balances`
 * para decir «vendido» y «saldo»; aqui solo se acota por fecha. Las anuladas no
 * entran, igual que no entran en esos totales.
 *
 * DOS LECTURAS, EN PARALELO, Y NI UNA MAS:
 *
 *   1. La PAGINA de filas, recortada por `range()` en el servidor. Nunca se
 *      traen todas las ventas para enseñar veinticinco.
 *   2. `report_sales_totals`, que agrega en SQL sobre TODO el conjunto
 *      filtrado. Los indicadores no se suman a partir de las filas visibles:
 *      con mas de una pagina serian falsos.
 *
 * NO HAY UNA TERCERA CONSULTA PARA CONTAR. El `tickets_count` de la funcion es
 * el total de la paginacion: cuenta exactamente el mismo predicado bajo la
 * misma RLS que la consulta de filas, asi que un `count: 'exact'` aparte
 * preguntaria dos veces lo mismo en cada carga de la pantalla.
 *
 * EL AISLAMIENTO NO ESTA AQUI. Ni la consulta ni la funcion filtran por
 * vendedor ni por organizacion: los dos caminos pasan por `tickets_select`, que
 * es `security invoker` en la funcion y se aplica sola en la tabla. Un vendedor
 * obtiene sus ventas aunque manipule la URL, porque no hay ningun parametro que
 * manipular (docs/SECURITY.md §1).
 */
export async function getSalesByDateReport(params: {
  /** Fechas ya resueltas por `resolveSalesDateRange`, nunca las crudas de la URL. */
  from: string
  to: string
  page?: number
  /** Exportacion: todas las filas del rango, no una pagina. */
  all?: boolean
}): Promise<{
  rows: SalesByDateReportRow[]
  totals: SalesByDateTotals
  total: number
  page: number
  pageSize: number
  /** Solo con `all`: se alcanzo el tope de exportacion y faltan filas. */
  truncated: boolean
}> {
  const supabase = await createClient()
  const page = Math.max(1, params.page ?? 1)

  const build = (from: number, to: number) =>
    supabase
      .from('tickets')
      .select(SALES_BY_DATE_SELECT)
      .eq('inventory_status', 'assigned')
      .gte('sale_date', params.from)
      .lte('sale_date', params.to)
      .order('sale_date', { ascending: false })
      // Segundo y tercer criterio para que el orden sea ESTABLE: sin ellos, dos
      // ventas del mismo dia podrian intercambiarse entre paginas y salir
      // repetidas —o desaparecer— en la pagina siguiente y en el CSV.
      .order('assigned_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)

  // `payment_status` es una columna GENERADA, y los tipos generados la marcan
  // anulable aunque nunca lo sea en una boleta vendida. Se estrecha aqui, en un
  // solo sitio y con el mismo `as` que ya usa `listTickets`, en vez de arrastrar
  // un `| null` imposible hasta la pantalla.
  const fetchPage = (from: number, to: number) =>
    build(from, to).then(({ data, error }) => ({
      data: (data ?? []) as SalesByDateRow[],
      error,
    }))

  const [pageResult, { data: totalsData, error: totalsError }] = await Promise.all([
    params.all
      ? fetchAllRows<SalesByDateRow>(fetchPage)
      : fetchPage((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).then(({ data, error }) => {
          if (error) throw error
          return { rows: data, truncated: false }
        }),
    supabase
      .rpc('report_sales_totals', { p_date_from: params.from, p_date_to: params.to })
      .maybeSingle(),
  ])

  if (totalsError) throw totalsError

  return {
    rows: pageResult.rows.map((row) => ({
      ticketId: row.id,
      saleDate: row.sale_date,
      dailyNumber: row.daily_number,
      weeklyNumber: row.weekly_number,
      inventoryStatus: row.inventory_status,
      paymentStatus: row.payment_status,
      salePrice: row.sale_price,
      paidAmount: row.paid_amount,
      clientId: row.client?.id ?? row.client_id,
      clientName: row.client?.name ?? null,
    })),
    totals: {
      ticketsCount: Number(totalsData?.tickets_count ?? 0),
      totalSold: Number(totalsData?.total_sold ?? 0),
      paidAmount: Number(totalsData?.paid_amount ?? 0),
      pendingAmount: Number(totalsData?.pending_amount ?? 0),
    },
    total: Number(totalsData?.tickets_count ?? 0),
    page,
    pageSize: PAGE_SIZE,
    truncated: pageResult.truncated,
  }
}

// ---------------------------------------------------------------------------

async function sellerNameMap(): Promise<Map<string, string>> {
  const members = await listOrgMembers(['owner', 'admin', 'seller'])
  return new Map(members.map((member) => [member.profileId, member.fullName]))
}
