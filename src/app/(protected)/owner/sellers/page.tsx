import { UsersIcon } from 'lucide-react'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { SellersTable } from '@/features/sellers/components/SellersTable'
import { listSellersPage, SELLER_SORT_COLUMNS } from '@/features/sellers/queries'
import { CreateUserButton } from '@/features/users/components/CreateUserButton'
import { requireStaff } from '@/lib/auth/guards'
import { parseListSort } from '@/lib/list-sort'

/**
 * Vendedores de la organizacion.
 *
 * Desde D-198 la tabla dice cuantas boletas tiene cada uno, no cuanto dinero
 * mueve: lo vendido, el saldo y la ganancia son de su cartera (BR-Q08).
 */
type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function SellersPage({ searchParams }: { searchParams: SearchParams }) {
  const membership = await requireStaff()
  const params = await searchParams
  const requestedPage = Number.parseInt(single(params.page) ?? '1', 10)
  const sort = parseListSort(single(params.sort), single(params.dir), SELLER_SORT_COLUMNS)

  /*
    UNA PAGINA, contada y ordenada en SQL (D-214). La funcion devuelve ademas el
    equipo ya resuelto —cuantos tiene cada uno a su cargo y de quien depende—,
    que es lo unico que antes obligaba a traer la lista entera: cortando
    primero, un vendedor cuyo equipo cayera en otra pagina aparecia sin el.
  */
  const { rows, total, page, pageSize, team } = await listSellersPage({
    page: Number.isNaN(requestedPage) ? 1 : requestedPage,
    sort,
  })
  const { teamSizes, parentNames } = team

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendedores"
        description="Cada vendedor ve únicamente sus boletas, sus clientes y sus pagos."
        compactAction={<CreateUserButton role="seller" label="Nuevo vendedor" />}
      />

      {/* El estado vacio es de la LISTA, no de la pagina: con `rows` una pagina
          fuera de rango decia «todavia no hay» teniendo filas (D-214). */}
      {total === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-8" aria-hidden />}
          title="Todavía no hay vendedores"
          description="Invita al primer vendedor para poder asignarle boletas."
          action={<CreateUserButton role="seller" label="Invitar vendedor" />}
        />
      ) : (
        <>
          <SellersTable
            sellers={rows}
            currentRole={membership.role}
            currentProfileId={membership.profileId}
            teamSizes={teamSizes}
            parentNames={parentNames}
          />
          <DataTablePagination total={total} page={page} pageSize={pageSize} items="sellers" />
        </>
      )}
    </div>
  )
}
