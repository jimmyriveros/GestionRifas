import { UsersIcon } from 'lucide-react'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { ClientFilters } from '@/features/clients/components/ClientFilters'
import { ClientsTable } from '@/features/clients/components/ClientsTable'
import { listClients } from '@/features/clients/queries'
import { listActiveSellerOptions } from '@/features/sellers/queries'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const requestedPage = Number.parseInt(single(params.page) ?? '1', 10)

  const [{ rows, total, page, pageSize }, sellers] = await Promise.all([
    listClients({
      sellerId: single(params.sellerId),
      search: single(params.q),
      includeArchived: single(params.archived) === '1',
      page: Number.isNaN(requestedPage) ? 1 : requestedPage,
    }),
    listActiveSellerOptions(),
  ])

  const hasFilters = Boolean(single(params.q) ?? single(params.sellerId) ?? single(params.archived))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Consulta global. Cada cliente pertenece a un vendedor; su creación y edición se hace desde el portal del vendedor."
      />

      <ClientFilters
        sellers={sellers.map((seller) => ({ value: seller.id, label: seller.fullName }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-8" aria-hidden />}
          title={hasFilters ? 'Ningún cliente coincide con los filtros' : 'Todavía no hay clientes'}
          description={
            hasFilters
              ? 'Prueba a limpiar los filtros o a buscar por otro dato.'
              : 'Los clientes aparecen aquí cuando un vendedor los registra al vender una boleta.'
          }
        />
      ) : (
        <>
          <ClientsTable clients={rows} basePath="/owner/clients" showSeller />
          <DataTablePagination total={total} page={page} pageSize={pageSize} items="clients" />
        </>
      )}
    </div>
  )
}
