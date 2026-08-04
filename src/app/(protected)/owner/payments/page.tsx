import { WalletIcon } from 'lucide-react'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { getAdminDashboard } from '@/features/dashboard/queries'
import { PaymentFilters } from '@/features/payments/components/PaymentFilters'
import { PaymentsTable } from '@/features/payments/components/PaymentsTable'
import { listPayments } from '@/features/payments/queries'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { requireStaff } from '@/lib/auth/guards'
import { formatCOP } from '@/lib/money'
import { paymentMethodSchema } from '@/features/payments/schemas'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

function parseStatus(value: string | undefined): 'active' | 'voided' | undefined {
  return value === 'active' || value === 'voided' ? value : undefined
}

export default async function OwnerPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  await requireStaff()

  const method = paymentMethodSchema.safeParse(single(params.method))
  const requestedPage = Number.parseInt(single(params.page) ?? '1', 10)

  const [{ rows, total, page, pageSize }, sellers, dashboard] = await Promise.all([
    listPayments({
      sellerId: single(params.sellerId),
      clientId: single(params.clientId),
      status: parseStatus(single(params.status)),
      method: method.success ? method.data : undefined,
      dateFrom: single(params.dateFrom),
      dateTo: single(params.dateTo),
      page: Number.isNaN(requestedPage) ? 1 : requestedPage,
    }),
    listActiveSellerOptions(),
    getAdminDashboard(),
  ])

  const hasFilters = Boolean(
    single(params.sellerId) ??
    single(params.clientId) ??
    single(params.status) ??
    single(params.method) ??
    single(params.dateFrom) ??
    single(params.dateTo),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos"
        description="Todos los abonos de la organizacion. Anular un pago recalcula los saldos y queda auditado."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total vendido" value={formatCOP(dashboard.totals.totalSold)} />
        <MetricCard label="Total recaudado" value={formatCOP(dashboard.totals.totalCollected)} />
        <MetricCard label="Saldo pendiente" value={formatCOP(dashboard.totals.pendingAmount)} />
        <MetricCard
          label="Boletas por cobrar"
          value={dashboard.totals.ticketsUnpaid + dashboard.totals.ticketsPartial}
        />
      </div>

      <PaymentFilters
        sellers={sellers.map((seller) => ({ value: seller.id, label: seller.fullName }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<WalletIcon className="size-8" aria-hidden />}
          title={hasFilters ? 'Ningun pago coincide con los filtros' : 'Todavia no hay pagos'}
          description={
            hasFilters
              ? 'Prueba a limpiar los filtros o a ampliar el rango de fechas.'
              : 'Los abonos aparecen aqui en cuanto los vendedores empiecen a registrarlos.'
          }
        />
      ) : (
        <>
          <PaymentsTable payments={rows} clientBasePath="/owner/clients" showSeller canVoid />
          <DataTablePagination total={total} page={page} pageSize={pageSize} />
        </>
      )}
    </div>
  )
}
