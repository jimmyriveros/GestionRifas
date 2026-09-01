import 'server-only'

import { RAFFLE_STATUS_LABELS, TICKET_PAYMENT_STATUS_LABELS } from '@/lib/constants'
import { toCsv, type CsvColumn } from '@/lib/csv'
import { formatDateCsv } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { EXPORT_ROW_LIMIT } from '@/lib/supabase/paginate'
import { ticketLabel } from '@/lib/tickets'

import {
  getClientBalanceReport,
  getPaymentReport,
  getRaffleReport,
  getSalesByDateReport,
  getSellerReport,
  getTicketStatusReport,
  type ClientBalanceReportRow,
  type PaymentReportRow,
  type SalesByDateReportRow,
  type SellerReportRow,
  type TicketStatusReportRow,
} from './queries'
import { resolveSalesDateRange, type ReportFilters, type ReportKey } from './schemas'

/**
 * Exportacion de los reportes a CSV (CLAUDE.md §24).
 *
 * Las columnas se declaran una sola vez y describen exactamente lo que la
 * pantalla muestra: si la tabla y el archivo se separaran, tarde o temprano
 * dirian cosas distintas.
 *
 * MONEDA Y FECHAS. Los valores salen ya formateados —`$120.000`, `04/08/2026`—
 * porque el destinatario del archivo es una persona con Excel en configuracion
 * regional de Colombia, no otro programa. En esa configuracion ambos formatos
 * se reconocen como numero y como fecha, de modo que las columnas siguen
 * siendo sumables y ordenables (D-056).
 *
 * VOLUMEN. Ninguna consulta de aqui usa paginacion de pantalla: piden TODAS las
 * filas mediante `fetchAllRows`, que recorre bloques de 1.000 hasta agotarlas.
 * Un CSV incompleto y sin aviso seria peor que no tener exportacion (I-011).
 */

const sellerColumns: CsvColumn<SellerReportRow>[] = [
  { header: 'Vendedor', value: (row) => row.sellerName },
  { header: 'Alias', value: (row) => row.alias },
  { header: 'Estado', value: (row) => (row.isActive ? 'Activo' : 'Inactivo') },
  { header: 'Boletas', value: (row) => row.ticketsTotal },
  { header: 'Disponibles', value: (row) => row.ticketsAvailable },
  { header: 'Vendidas', value: (row) => row.ticketsAssigned },
  { header: 'Sin pagar', value: (row) => row.ticketsUnpaid },
  { header: 'Abonadas', value: (row) => row.ticketsPartial },
  { header: 'Pagadas', value: (row) => row.ticketsPaid },
  { header: 'Total vendido', value: (row) => formatCOP(row.totalSold) },
  { header: 'Total recaudado', value: (row) => formatCOP(row.totalCollected) },
  { header: 'Saldo pendiente', value: (row) => formatCOP(row.pendingAmount) },
]

const ticketStatusColumns: CsvColumn<TicketStatusReportRow>[] = [
  { header: 'Grupo', value: (row) => row.groupLabel },
  { header: 'Estado', value: (row) => row.statusLabel },
  { header: 'Boletas', value: (row) => row.count },
]

type RaffleReportRow = Awaited<ReturnType<typeof getRaffleReport>>['rows'][number]

const raffleColumns: CsvColumn<RaffleReportRow>[] = [
  { header: 'Código', value: (row) => row.shortCode },
  { header: 'Rifa', value: (row) => row.name },
  { header: 'Estado', value: (row) => RAFFLE_STATUS_LABELS[row.status] },
  { header: 'Precio de boleta', value: (row) => formatCOP(row.ticketPrice) },
  { header: 'Inicio', value: (row) => formatDateCsv(row.startDate) },
  { header: 'Fin', value: (row) => formatDateCsv(row.endDate) },
  { header: 'Boletas', value: (row) => row.ticketsTotal },
  { header: 'Disponibles', value: (row) => row.ticketsAvailable },
  { header: 'Vendidas', value: (row) => row.ticketsAssigned },
  { header: 'Por aprobar', value: (row) => row.ticketsPendingApproval },
  { header: 'Anuladas', value: (row) => row.ticketsCancelled },
  { header: 'Total vendido', value: (row) => formatCOP(row.totalSold) },
  { header: 'Total recaudado', value: (row) => formatCOP(row.totalCollected) },
  { header: 'Saldo pendiente', value: (row) => formatCOP(row.pendingAmount) },
]

const clientBalanceColumns: CsvColumn<ClientBalanceReportRow>[] = [
  { header: 'Cliente', value: (row) => row.name },
  { header: 'Alias', value: (row) => row.alias },
  { header: 'Teléfono', value: (row) => row.phone },
  { header: 'Vendedor', value: (row) => row.sellerName },
  { header: 'Boletas', value: (row) => row.ticketsCount },
  { header: 'Total comprado', value: (row) => formatCOP(row.totalPurchased) },
  { header: 'Total pagado', value: (row) => formatCOP(row.totalPaid) },
  { header: 'Saldo pendiente', value: (row) => formatCOP(row.pendingAmount) },
  { header: 'Archivado', value: (row) => (row.archivedAt ? 'Si' : 'No') },
]

/**
 * «Ventas por fecha» (D-151).
 *
 * La boleta se nombra por sus DOS numeros, como en la pantalla y como se dice
 * en voz alta (BR-N11). El codigo interno no aparece: es el identificador
 * administrativo, no la forma de reconocer una boleta.
 *
 * Aqui si caben los terminos enteros —«Precio de venta», «Saldo pendiente»—,
 * que en la tabla se acortan a «Precio» y «Falta» por ancho. Un archivo de
 * Excel no tiene ese problema.
 */
const salesByDateColumns: CsvColumn<SalesByDateReportRow>[] = [
  { header: 'Fecha de venta', value: (row) => (row.saleDate ? formatDateCsv(row.saleDate) : '') },
  { header: 'Boleta', value: (row) => ticketLabel(row) },
  { header: 'Número diario', value: (row) => row.dailyNumber },
  { header: 'Número semanal', value: (row) => row.weeklyNumber },
  { header: 'Cliente', value: (row) => row.clientName },
  { header: 'Precio de venta', value: (row) => formatCOP(row.salePrice ?? 0) },
  { header: 'Abonado', value: (row) => formatCOP(row.paidAmount) },
  {
    header: 'Saldo pendiente',
    value: (row) => formatCOP(Math.max(0, (row.salePrice ?? 0) - row.paidAmount)),
  },
  { header: 'Estado', value: (row) => TICKET_PAYMENT_STATUS_LABELS[row.paymentStatus] },
]

const paymentColumns: CsvColumn<PaymentReportRow>[] = [
  { header: 'Fecha', value: (row) => formatDateCsv(row.paymentDate) },
  { header: 'Pagos', value: (row) => row.paymentsCount },
  { header: 'Recaudado', value: (row) => formatCOP(row.activeAmount) },
  { header: 'Anulado', value: (row) => formatCOP(row.voidedAmount) },
  { header: 'Total registrado', value: (row) => formatCOP(row.totalAmount) },
]

/** Prefijo del nombre de archivo, en espanol y sin acentos. */
const FILE_PREFIXES: Record<ReportKey, string> = {
  sellers: 'reporte-por-vendedor',
  'sales-by-date': 'reporte-ventas-por-fecha',
  'ticket-status': 'reporte-boletas-por-estado',
  raffles: 'reporte-boletas-por-rifa',
  'client-balances': 'reporte-clientes-con-saldo',
  payments: 'reporte-pagos-por-fecha',
}

export function reportFilePrefix(report: ReportKey): string {
  return FILE_PREFIXES[report]
}

/**
 * Aviso que se anexa cuando la exportacion alcanza el tope de `EXPORT_ROW_LIMIT`.
 *
 * Un archivo incompleto que PARECE completo es el peor resultado posible: quien
 * lo abra sumara una columna y obtendra una cifra falsa sin motivo para
 * sospechar. Si alguna vez se llega al tope, el archivo lo dice en su ultima
 * linea (I-011, R-18).
 */
function truncationNotice(): string {
  return `\r\nAVISO;El archivo alcanzó el límite de ${EXPORT_ROW_LIMIT} filas y está INCOMPLETO. Filtra el reporte para exportarlo por partes.\r\n`
}

/**
 * Consulta el reporte completo —sin paginar— y lo serializa a CSV.
 *
 * El aislamiento no depende de este codigo: cada consulta pasa por vistas y
 * funciones `security_invoker`, de modo que un vendedor que descargue el
 * archivo obtiene sus propias filas y las de nadie mas (CLAUDE.md §24).
 */
export async function buildReportCsv(filters: ReportFilters): Promise<string> {
  switch (filters.report) {
    // Los tres primeros no pueden truncarse: devuelven una fila por vendedor,
    // por estado o por rifa, siempre muy por debajo del tope.
    case 'sellers': {
      const { rows } = await getSellerReport(filters)
      return toCsv(sellerColumns, rows)
    }
    case 'ticket-status': {
      const { rows } = await getTicketStatusReport(filters)
      return toCsv(ticketStatusColumns, rows)
    }
    case 'raffles': {
      const { rows } = await getRaffleReport()
      return toCsv(raffleColumns, rows)
    }
    case 'client-balances': {
      const { rows, truncated } = await getClientBalanceReport({ ...filters, all: true })
      return toCsv(clientBalanceColumns, rows) + (truncated ? truncationNotice() : '')
    }
    case 'payments': {
      const { rows, truncated } = await getPaymentReport({ ...filters, all: true })
      return toCsv(paymentColumns, rows) + (truncated ? truncationNotice() : '')
    }
    // Una fila por BOLETA vendida: es el unico reporte que puede truncarse por
    // volumen de ventas. Las fechas se resuelven con la MISMA funcion que usa la
    // pantalla, de modo que un archivo pedido sin `dateFrom` ni `dateTo` trae el
    // mismo dia que se estaba viendo (D-151).
    case 'sales-by-date': {
      const range = resolveSalesDateRange(filters)
      if (range.invalid) return toCsv(salesByDateColumns, [])

      const { rows, truncated } = await getSalesByDateReport({
        from: range.from,
        to: range.to,
        all: true,
      })
      return toCsv(salesByDateColumns, rows) + (truncated ? truncationNotice() : '')
    }
  }
}
