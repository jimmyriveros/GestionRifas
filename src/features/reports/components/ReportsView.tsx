import { BarChart3Icon, CalendarIcon } from 'lucide-react'
import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { PaymentStatusBadge, RaffleStatusBadge } from '@/components/data/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { listRaffleOptions } from '@/features/raffles/queries'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { TicketNumbersCell } from '@/features/tickets/components/TicketNumbers'
import { ticketFinancials } from '@/features/tickets/financials'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

import {
  getClientBalanceReport,
  getPaymentReport,
  getRaffleReport,
  getSalesByDateReport,
  getSellerReport,
  getTicketStatusReport,
} from '../queries'
import {
  REPORT_DESCRIPTIONS,
  REPORT_LABELS,
  resolveReport,
  resolveSalesDateRange,
  type ReportFilters,
  type ReportKey,
  type SalesDateRange,
} from '../schemas'
import { ExportCsvButton } from './ExportCsvButton'
import { ReportFilters as ReportFiltersBar } from './ReportFilters'
import { ReportNav } from './ReportNav'
import { ReportTable, type ReportTableColumn } from './ReportTable'

/**
 * Pantalla de reportes, compartida por los dos portales (D-051).
 *
 * La diferencia entre `/owner/reports` y `/seller/reports` son dos parametros:
 * que reportes se ofrecen y si hay selector de vendedor. No hay una segunda
 * copia de estas tablas que pueda quedarse atras.
 *
 * El aislamiento NO depende de `withSellerFilter`: todas las consultas pasan por
 * vistas y funciones `security_invoker`, asi que un vendedor obtiene sus propios
 * numeros aunque manipule la URL (CLAUDE.md §24, docs/SECURITY.md §1).
 */

type ReportsViewProps = {
  filters: ReportFilters
  reports: readonly ReportKey[]
  basePath: string
  /** `/owner/clients` o `/seller/clients`, para enlazar cada cliente. */
  clientBasePath: string
  /** Solo el portal administrativo puede acotar por vendedor. */
  withSellerFilter?: boolean
  /** Solo el portal administrativo enlaza a la ficha de un vendedor. */
  sellerBasePath?: string
  /**
   * `/owner/tickets` o `/seller/tickets`, para abrir cada boleta.
   *
   * Obligatorio aunque hoy solo lo use «Ventas por fecha»: opcional, un portal
   * que ofreciera el reporte sin pasarlo lo dejaria de pintar en silencio.
   */
  ticketBasePath: string
}

export async function ReportsView({
  filters,
  reports,
  basePath,
  clientBasePath,
  withSellerFilter = false,
  sellerBasePath,
  ticketBasePath,
}: ReportsViewProps) {
  // Si la URL pide un reporte que este portal no ofrece, se muestra el primero
  // de su lista en vez de un error: un enlace copiado entre portales no debe
  // romperse, y asi cada portal conserva su propio predeterminado (D-151).
  const report = resolveReport(filters.report, reports)

  // Las fechas efectivas se resuelven UNA vez y bajan a los tres sitios que
  // tienen que coincidir: los campos «Desde» y «Hasta», la consulta y el enlace
  // de exportacion. Solo para este reporte: los demas no las usan asi.
  const salesRange = report === 'sales-by-date' ? resolveSalesDateRange(filters) : null

  const activeFilters: ReportFilters = {
    ...filters,
    report,
    // El CSV lleva las fechas YA resueltas, no las crudas de la URL: si la
    // pantalla lleva abierta desde ayer, el archivo debe traer el dia que se
    // esta viendo, no el de hoy.
    ...(salesRange ? { dateFrom: salesRange.from, dateTo: salesRange.to } : {}),
  }

  const [raffles, sellers] = await Promise.all([
    listRaffleOptions(),
    withSellerFilter ? listActiveSellerOptions() : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description={REPORT_DESCRIPTIONS[report]}
        actions={<ExportCsvButton filters={activeFilters} />}
      />

      <ReportNav reports={reports} current={report} basePath={basePath} />

      <ReportFiltersBar
        report={report}
        raffles={raffles.map((raffle) => ({
          value: raffle.id,
          label: `${raffle.shortCode} · ${raffle.name}`,
        }))}
        sellers={
          withSellerFilter
            ? sellers.map((seller) => ({ value: seller.id, label: seller.fullName }))
            : undefined
        }
        dateDefaults={salesRange ? { from: salesRange.from, to: salesRange.to } : undefined}
      />

      {report === 'sellers' ? (
        <SellersReport filters={activeFilters} basePath={sellerBasePath} />
      ) : null}
      {report === 'sales-by-date' && salesRange ? (
        <SalesByDateReport
          range={salesRange}
          page={activeFilters.page}
          clientBasePath={clientBasePath}
          ticketBasePath={ticketBasePath}
        />
      ) : null}
      {report === 'ticket-status' ? <TicketStatusReport filters={activeFilters} /> : null}
      {report === 'raffles' ? <RafflesReport /> : null}
      {report === 'client-balances' ? (
        <ClientBalancesReport
          filters={activeFilters}
          clientBasePath={clientBasePath}
          showSeller={withSellerFilter}
        />
      ) : null}
      {report === 'payments' ? <PaymentsReport filters={activeFilters} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

async function SellersReport({ filters, basePath }: { filters: ReportFilters; basePath?: string }) {
  const { rows, totals } = await getSellerReport(filters)

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3Icon className="size-8" aria-hidden />}
        title="Todavía no hay vendedores"
        description="Invita al primer vendedor para empezar a medir ventas y recaudo."
      />
    )
  }

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    {
      header: 'Vendedor',
      cell: (row) => (
        <div className="min-w-0">
          {basePath ? (
            <Link href={`${basePath}/${row.sellerId}`} className="font-medium hover:underline">
              {row.sellerName}
            </Link>
          ) : (
            <span className="font-medium">{row.sellerName}</span>
          )}
          {row.isActive ? null : (
            <Badge variant="outline" className="ml-2 align-middle text-xs">
              Inactivo
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Boletas',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular-nums">{row.ticketsTotal}</span>,
      footer: <span className="tabular-nums">{totals.ticketsTotal}</span>,
    },
    {
      header: 'Vendidas',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.ticketsAssigned}</span>,
      footer: <span className="tabular-nums">{totals.ticketsAssigned}</span>,
    },
    {
      header: 'Vendido',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{formatCOP(row.totalSold)}</span>,
      footer: <span className="tabular-nums">{formatCOP(totals.totalSold)}</span>,
    },
    {
      header: 'Recaudado',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular-nums">{formatCOP(row.totalCollected)}</span>,
      footer: <span className="tabular-nums">{formatCOP(totals.totalCollected)}</span>,
    },
    {
      header: 'Saldo',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{formatCOP(row.pendingAmount)}</span>,
      footer: <span className="tabular-nums">{formatCOP(totals.pendingAmount)}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Vendedores" value={rows.length} />
        <MetricCard label="Total vendido" value={formatCOP(totals.totalSold)} />
        <MetricCard label="Total recaudado" value={formatCOP(totals.totalCollected)} />
        <MetricCard label="Saldo pendiente" value={formatCOP(totals.pendingAmount)} />
      </div>

      <ReportTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.sellerId}
        caption={`${REPORT_LABELS.sellers}: ventas, recaudo y saldo pendiente de cada vendedor`}
        showFooter
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * «Ventas por fecha»: las boletas que el vendedor vendio en un dia o un rango
 * (D-151, BR-T05).
 *
 * QUE PREGUNTA RESPONDE, Y CUAL NO. Cuenta boletas por su FECHA DE VENTA, y su
 * columna «Abonado» dice cuanto llevan pagado HOY esas boletas. No es el dinero
 * que entro ese dia: eso lo responde «Pagos por fecha», que no se toca. Los dos
 * numeros son distintos en cuanto alguien abona un dia despues de comprar, que
 * es lo normal, y por eso la pantalla lo dice con palabras en vez de confiar en
 * que se deduzca.
 *
 * NO HAY FILA DE TOTALES EN LA TABLA, a proposito. `ReportTable` sabe pintarla,
 * pero aqui sumaria solo las veinticinco filas de la pagina y quedaria justo
 * debajo de unos indicadores que suman el rango entero: dos cifras distintas
 * para lo mismo, a cuatro centimetros. Los totales viven arriba y los calcula
 * SQL sobre todo el conjunto.
 */
async function SalesByDateReport({
  range,
  page,
  clientBasePath,
  ticketBasePath,
}: {
  range: SalesDateRange
  page: number
  clientBasePath: string
  ticketBasePath: string
}) {
  // Un rango dado la vuelta no se corrige solo ni se consulta a medias: se dice
  // lo que pasa y se deja corregir arriba, en los dos campos (§3 del encargo).
  if (range.invalid) {
    return (
      <EmptyState
        icon={<CalendarIcon className="size-8" aria-hidden />}
        title="Las fechas están al revés"
        description="«Desde» es posterior a «Hasta». Cambia una de las dos para ver las ventas de ese período."
      />
    )
  }

  const {
    rows,
    totals,
    total,
    page: currentPage,
    pageSize,
  } = await getSalesByDateReport({
    from: range.from,
    to: range.to,
    page,
  })

  const periodo =
    range.from === range.to
      ? formatDateEs(range.from)
      : `Del ${formatDateEs(range.from)} al ${formatDateEs(range.to)}`

  const nota = (
    <p className="text-muted-foreground text-sm">
      Aquí las boletas se cuentan por su fecha de venta. «Abonado» es lo que llevan pagado hoy, no
      el dinero que entró ese día: una boleta vendida el lunes y abonada el martes suma en las
      ventas del lunes. El dinero recibido cada día está en «Pagos por fecha».
    </p>
  )

  if (total === 0) {
    return (
      <div className="space-y-4">
        {nota}
        <EmptyState
          icon={<BarChart3Icon className="size-8" aria-hidden />}
          title="No vendiste boletas en este período"
          description="Elige otro día o amplía el rango con «Desde» y «Hasta» para ver más ventas."
        />
      </div>
    )
  }

  // La cuenta de cada boleta sale de `ticketFinancials`, la misma funcion que
  // usan «Mis boletas», la ficha del cliente y el detalle: ninguna pantalla hace
  // su propia resta (D-130).
  const filas = rows.map((row) => ({
    ...row,
    money: ticketFinancials({
      inventoryStatus: row.inventoryStatus,
      salePrice: row.salePrice,
      paidAmount: row.paidAmount,
    }),
  }))

  const columns: ReportTableColumn<(typeof filas)[number]>[] = [
    {
      header: 'Fecha',
      cell: (row) => (
        <span className="font-medium whitespace-nowrap">
          {row.saleDate ? formatDateEs(row.saleDate) : '—'}
        </span>
      ),
    },
    {
      header: 'Boleta',
      cell: (row) => <TicketNumbersCell ticket={row} href={`${ticketBasePath}/${row.ticketId}`} />,
    },
    {
      header: 'Cliente',
      cell: (row) =>
        row.clientId && row.clientName ? (
          <Link href={`${clientBasePath}/${row.clientId}`} className="font-medium hover:underline">
            {row.clientName}
          </Link>
        ) : (
          // No deberia ocurrir —una boleta vendida tiene cliente (BR-I05)—, pero
          // una raya no explicaria nada si un dato raro llegara hasta aqui.
          <span className="text-muted-foreground">Sin cliente</span>
        ),
    },
    {
      header: 'Precio',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular-nums">{formatCOP(row.money.price)}</span>,
    },
    {
      header: 'Abonado',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular-nums">{formatCOP(row.money.paidAmount)}</span>,
    },
    {
      header: 'Falta',
      align: 'right',
      cell: (row) => (
        <div className="space-y-0.5">
          <span className="font-medium tabular-nums">{formatCOP(row.money.pendingAmount)}</span>
          {/* Lo abonado NO desaparece en el telefono: la columna se oculta, pero
              la cifra baja aqui, que es la celda que si se ve (§14). */}
          <p className="text-muted-foreground text-xs tabular-nums md:hidden">
            Abonado {formatCOP(row.money.paidAmount)} de {formatCOP(row.money.price)}
          </p>
        </div>
      ),
    },
    {
      header: 'Pago',
      cell: (row) => <PaymentStatusBadge status={row.paymentStatus} />,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Boletas vendidas" value={totals.ticketsCount} hint={periodo} />
        <MetricCard label="Total vendido" value={formatCOP(totals.totalSold)} />
        <MetricCard
          label="Abonado"
          value={formatCOP(totals.paidAmount)}
          hint="Lo que llevan pagado hoy estas boletas"
        />
        <MetricCard label="Saldo pendiente" value={formatCOP(totals.pendingAmount)} />
      </div>

      {nota}

      <ReportTable
        columns={columns}
        rows={filas}
        getRowId={(row) => row.ticketId}
        caption={
          range.from === range.to
            ? `${REPORT_LABELS['sales-by-date']}: boletas vendidas el ${formatDateEs(range.from)}`
            : `${REPORT_LABELS['sales-by-date']}: boletas vendidas del ${formatDateEs(range.from)} al ${formatDateEs(range.to)}`
        }
      />

      <DataTablePagination total={total} page={currentPage} pageSize={pageSize} items="tickets" />
    </div>
  )
}

// ---------------------------------------------------------------------------

async function TicketStatusReport({ filters }: { filters: ReportFilters }) {
  const { rows, totals } = await getTicketStatusReport(filters)

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    { header: 'Grupo', cell: (row) => <span className="text-sm">{row.groupLabel}</span> },
    { header: 'Estado', cell: (row) => <span className="font-medium">{row.statusLabel}</span> },
    {
      header: 'Boletas',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.count}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total de boletas" value={totals.ticketsTotal} />
        <MetricCard label="Total vendido" value={formatCOP(totals.totalSold)} />
        <MetricCard label="Total recaudado" value={formatCOP(totals.totalCollected)} />
        <MetricCard label="Saldo pendiente" value={formatCOP(totals.pendingAmount)} />
      </div>

      <p className="text-muted-foreground text-sm">
        Los estados de cobranza (Sin pagar, Abonada y Pagada) solo cuentan boletas vendidas: una
        boleta disponible todavía no debe dinero.
      </p>

      <ReportTable
        columns={columns}
        rows={rows}
        getRowId={(row) => `${row.group}-${row.status}`}
        caption={`${REPORT_LABELS['ticket-status']}: cuantas boletas hay en cada estado`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

async function RafflesReport() {
  const { rows, totals } = await getRaffleReport()

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3Icon className="size-8" aria-hidden />}
        title="Todavía no hay rifas"
        description="Crea una rifa para empezar a registrar boletas y ventas."
      />
    )
  }

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    {
      header: 'Rifa',
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-medium">{row.name}</span>
          <p className="text-muted-foreground font-mono text-xs">{row.shortCode}</p>
        </div>
      ),
    },
    {
      header: 'Estado',
      cell: (row) => <RaffleStatusBadge status={row.status} />,
    },
    {
      header: 'Vigencia',
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {formatDateEs(row.startDate)} — {formatDateEs(row.endDate)}
        </span>
      ),
    },
    {
      header: 'Boletas',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.ticketsTotal}</span>,
      footer: <span className="tabular-nums">{totals.ticketsTotal}</span>,
    },
    {
      header: 'Vendidas',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular-nums">{row.ticketsAssigned}</span>,
      footer: <span className="tabular-nums">{totals.ticketsAssigned}</span>,
    },
    {
      header: 'Vendido',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{formatCOP(row.totalSold)}</span>,
      footer: <span className="tabular-nums">{formatCOP(totals.totalSold)}</span>,
    },
    {
      header: 'Recaudado',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular-nums">{formatCOP(row.totalCollected)}</span>,
      footer: <span className="tabular-nums">{formatCOP(totals.totalCollected)}</span>,
    },
    {
      header: 'Saldo',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{formatCOP(row.pendingAmount)}</span>,
      footer: <span className="tabular-nums">{formatCOP(totals.pendingAmount)}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Rifas" value={rows.length} />
        <MetricCard label="Total vendido" value={formatCOP(totals.totalSold)} />
        <MetricCard label="Total recaudado" value={formatCOP(totals.totalCollected)} />
        <MetricCard label="Saldo pendiente" value={formatCOP(totals.pendingAmount)} />
      </div>

      <ReportTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        caption={`${REPORT_LABELS.raffles}: inventario y dinero de cada rifa`}
        showFooter
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

async function ClientBalancesReport({
  filters,
  clientBasePath,
  showSeller,
}: {
  filters: ReportFilters
  clientBasePath: string
  showSeller: boolean
}) {
  const { rows, total, page, pageSize, totalPending } = await getClientBalanceReport(filters)

  if (total === 0) {
    return (
      <EmptyState
        icon={<BarChart3Icon className="size-8" aria-hidden />}
        title="Nadie debe dinero"
        description="Todas las boletas vendidas están pagadas por completo."
      />
    )
  }

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    {
      header: 'Cliente',
      cell: (row) => (
        <div className="min-w-0">
          <Link href={`${clientBasePath}/${row.clientId}`} className="font-medium hover:underline">
            {row.name}
          </Link>
          <p className="text-muted-foreground text-xs tabular-nums">{row.phone}</p>
          {row.archivedAt ? (
            <Badge variant="outline" className="mt-1 text-xs">
              Archivado
            </Badge>
          ) : null}
        </div>
      ),
    },
    ...(showSeller
      ? [
          {
            header: 'Vendedor',
            hideOnMobile: true,
            cell: (row: (typeof rows)[number]) => <span className="text-sm">{row.sellerName}</span>,
          },
        ]
      : []),
    {
      header: 'Boletas',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular-nums">{row.ticketsCount}</span>,
    },
    {
      header: 'Comprado',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => <span className="tabular-nums">{formatCOP(row.totalPurchased)}</span>,
    },
    {
      header: 'Pagado',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{formatCOP(row.totalPaid)}</span>,
    },
    {
      header: 'Saldo',
      align: 'right',
      cell: (row) => (
        <span className="font-medium tabular-nums">{formatCOP(row.pendingAmount)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Clientes con saldo" value={total} />
        <MetricCard label="Saldo pendiente total" value={formatCOP(totalPending)} />
        <MetricCard
          label="Saldo promedio"
          value={formatCOP(total === 0 ? 0 : Math.round(totalPending / total))}
          hint="Saldo pendiente dividido entre los clientes que deben"
        />
      </div>

      <ReportTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.clientId}
        caption={`${REPORT_LABELS['client-balances']}: clientes ordenados de mayor a menor deuda`}
      />

      <DataTablePagination total={total} page={page} pageSize={pageSize} items="clients" />
    </div>
  )
}

// ---------------------------------------------------------------------------

async function PaymentsReport({ filters }: { filters: ReportFilters }) {
  const { rows, totals, total, page, pageSize } = await getPaymentReport(filters)

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    {
      header: 'Fecha',
      cell: (row) => (
        <span className="font-medium whitespace-nowrap">{formatDateEs(row.paymentDate)}</span>
      ),
    },
    {
      header: 'Pagos',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{row.paymentsCount}</span>,
      footer: <span className="tabular-nums">{totals.paymentsCount}</span>,
    },
    {
      header: 'Recaudado',
      align: 'right',
      cell: (row) => <span className="tabular-nums">{formatCOP(row.activeAmount)}</span>,
      footer: <span className="tabular-nums">{formatCOP(totals.activeAmount)}</span>,
    },
    {
      header: 'Anulado',
      align: 'right',
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-muted-foreground tabular-nums">{formatCOP(row.voidedAmount)}</span>
      ),
      footer: (
        <span className="text-muted-foreground tabular-nums">{formatCOP(totals.voidedAmount)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Pagos registrados" value={totals.paymentsCount} />
        <MetricCard
          label="Recaudado"
          value={formatCOP(totals.activeAmount)}
          hint={`${totals.activeCount} pago(s) vigente(s)`}
        />
        <MetricCard
          label="Anulado"
          value={formatCOP(totals.voidedAmount)}
          hint={`${totals.voidedCount} pago(s) anulado(s)`}
        />
        <MetricCard label="Días con recaudo" value={total} />
      </div>

      {total === 0 ? (
        <EmptyState
          icon={<BarChart3Icon className="size-8" aria-hidden />}
          title="Ningún pago en este rango"
          description="Prueba a ampliar las fechas o a quitar los demás filtros."
        />
      ) : (
        <>
          <ReportTable
            columns={columns}
            rows={rows}
            getRowId={(row) => row.paymentDate}
            caption={`${REPORT_LABELS.payments}: recaudo día a día`}
            showFooter
            footerLabel="Total del rango"
          />
          <DataTablePagination total={total} page={page} pageSize={pageSize} items="days" />
        </>
      )}
    </div>
  )
}
