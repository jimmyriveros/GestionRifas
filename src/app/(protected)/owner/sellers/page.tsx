import { UsersIcon } from 'lucide-react'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { SellersTable } from '@/features/sellers/components/SellersTable'
import {
  listSellersWithInventory,
  SELLER_COMPARATORS,
  SELLER_SORT_COLUMNS,
} from '@/features/sellers/queries'
import { CreateUserButton } from '@/features/users/components/CreateUserButton'
import { requireStaff } from '@/lib/auth/guards'
import { sortAndPaginate } from '@/lib/list-page'
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

  const sellers = await listSellersWithInventory()

  // La estructura comercial, derivada de la misma lista: quien tiene equipo,
  // quien pertenece al de alguien y quien no (BR-E08). Sin consultas nuevas.
  const teamSizes = new Map<string, number>()
  const parentNames = new Map<string, string>()
  for (const seller of sellers) {
    parentNames.set(seller.profileId, seller.fullName)
    if (seller.parentSellerId) {
      teamSizes.set(seller.parentSellerId, (teamSizes.get(seller.parentSellerId) ?? 0) + 1)
    }
  }

  /*
    El corte va DESPUES de contar los equipos, a proposito: quien tiene equipo
    y de quien es cada integrante se cuenta sobre la lista completa. Cortando
    primero, un vendedor cuyo equipo cayera en otra pagina apareceria sin el.
  */
  const { rows, total, page, pageSize } = sortAndPaginate(sellers, {
    page: Number.isNaN(requestedPage) ? 1 : requestedPage,
    sort,
    tiebreak: (seller) => seller.profileId,
    comparators: SELLER_COMPARATORS,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendedores"
        description="Cada vendedor ve únicamente sus boletas, sus clientes y sus pagos."
        compactAction={<CreateUserButton role="seller" label="Nuevo vendedor" />}
      />

      {sellers.length === 0 ? (
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
