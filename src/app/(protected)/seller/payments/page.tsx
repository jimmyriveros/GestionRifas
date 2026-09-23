import { PlusIcon, WalletIcon } from 'lucide-react'
import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { PaymentsTable } from '@/features/payments/components/PaymentsTable'
import { listPayments, PAYMENT_SORT_COLUMNS } from '@/features/payments/queries'
import { parseListSort } from '@/lib/list-sort'
import { paymentNewHref } from '@/features/payments/return-to'
import { getSellerDashboard } from '@/features/dashboard/seller-queries'
import { formatCOP } from '@/lib/money'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function SellerPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const requestedPage = Number.parseInt(single(params.page) ?? '1', 10)
  // Lo que no este en la lista blanca se ignora y manda el orden por defecto.
  const sort = parseListSort(single(params.sort), single(params.dir), PAYMENT_SORT_COLUMNS)

  // Sin filtrar por vendedor: `payments_select` ya limita las filas a las suyas.
  const [{ rows, total, page, pageSize }, dashboard] = await Promise.all([
    listPayments({
      clientId: single(params.clientId),
      page: Number.isNaN(requestedPage) ? 1 : requestedPage,
      sort,
    }),
    getSellerDashboard(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis pagos"
        description="Todos los abonos que has registrado. Los anulados siguen aquí, marcados."
        compactAction={
          <Button asChild>
            <Link href={paymentNewHref({ from: 'payments' })}>
              <PlusIcon className="size-4" aria-hidden />
              Registrar abono
            </Link>
          </Button>
        }
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

      {rows.length === 0 ? (
        <EmptyState
          icon={<WalletIcon className="size-8" aria-hidden />}
          title="Todavía no has registrado abonos"
          description="Cuando un cliente te pague, registra el abono y el saldo se actualiza solo."
          action={
            <Button asChild>
              <Link href={paymentNewHref({ from: 'payments' })}>Registrar el primer abono</Link>
            </Button>
          }
        />
      ) : (
        <>
          <PaymentsTable payments={rows} clientBasePath="/seller/clients" serverSorted />
          <DataTablePagination total={total} page={page} pageSize={pageSize} items="payments" />
        </>
      )}
    </div>
  )
}
