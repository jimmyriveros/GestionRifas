import { WalletIcon } from 'lucide-react'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { getOrganizationTotals } from '@/features/dashboard/queries'
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

  // Las cuatro tarjetas de arriba necesitan CUATRO cifras, no el panel entero:
  // antes se llamaba a `getAdminDashboard()`, que ademas trae el resumen por
  // vendedor, las boletas recientes y otra pagina de pagos que esta pantalla no
  // usa (D-103).
  const [{ rows, total, page, pageSize }, sellers, totals] = await Promise.all([
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
    getOrganizationTotals(),
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
        description="Todos los abonos de la organización. Anular un pago recalcula los saldos y queda auditado."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total vendido" value={formatCOP(totals.totalSold)} />
        <MetricCard label="Total recaudado" value={formatCOP(totals.totalCollected)} />
        <MetricCard label="Saldo pendiente" value={formatCOP(totals.pendingAmount)} />
        <MetricCard
          label="Boletas por cobrar"
          value={totals.ticketsUnpaid + totals.ticketsPartial}
        />
      </div>

      <PaymentFilters
        sellers={sellers.map((seller) => ({ value: seller.id, label: seller.fullName }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<WalletIcon className="size-8" aria-hidden />}
          title={hasFilters ? 'Ningún pago coincide con los filtros' : 'Todavía no hay pagos'}
          description={
            hasFilters
              ? 'Prueba a limpiar los filtros o a ampliar el rango de fechas.'
              : 'Los abonos aparecen aquí en cuanto los vendedores empiecen a registrarlos.'
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
