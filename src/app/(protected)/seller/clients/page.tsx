import { PlusIcon, UsersIcon } from 'lucide-react'
import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { ClientFilters } from '@/features/clients/components/ClientFilters'
import { ClientsTable } from '@/features/clients/components/ClientsTable'
import { listClients } from '@/features/clients/queries'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function SellerClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const requestedPage = Number.parseInt(single(params.page) ?? '1', 10)

  // Sin filtrar por vendedor: `clients_select` ya limita las filas a la cartera
  // de quien consulta (BR-C05, BR-U07).
  const { rows, total, page, pageSize } = await listClients({
    search: single(params.q),
    includeArchived: single(params.archived) === '1',
    page: Number.isNaN(requestedPage) ? 1 : requestedPage,
  })

  const hasFilters = Boolean(single(params.q) ?? single(params.archived))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis clientes"
        description="Las personas a las que les vendes. Puedes reutilizarlos al vender nuevas boletas."
        actions={
          <Button asChild>
            <Link href="/seller/clients/new">
              <PlusIcon className="size-4" aria-hidden />
              Nuevo cliente
            </Link>
          </Button>
        }
      />

      <ClientFilters />

      {rows.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-8" aria-hidden />}
          title={
            hasFilters ? 'Ningún cliente coincide con la búsqueda' : 'Todavía no tienes clientes'
          }
          description={
            hasFilters
              ? 'Prueba con otro nombre, alias, teléfono o correo.'
              : 'Registra a tu primer cliente para poder asignarle boletas.'
          }
          action={
            hasFilters ? null : (
              <Button asChild>
                <Link href="/seller/clients/new">Crear mi primer cliente</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <ClientsTable clients={rows} basePath="/seller/clients" />
          <DataTablePagination total={total} page={page} pageSize={pageSize} items="clients" />
        </>
      )}
    </div>
  )
}
