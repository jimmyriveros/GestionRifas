import { PlusIcon, TicketIcon } from 'lucide-react'
import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { RafflesTable } from '@/features/raffles/components/RafflesTable'
import { listAdminRafflesPage, RAFFLE_SORT_COLUMNS } from '@/features/raffles/queries'
import { parseListSort } from '@/lib/list-sort'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function RafflesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const requestedPage = Number.parseInt(single(params.page) ?? '1', 10)
  const sort = parseListSort(single(params.sort), single(params.dir), RAFFLE_SORT_COLUMNS)

  // Una pagina, contada y ordenada en SQL. Recuentos del personal, sin dinero
  // de cartera (D-198, D-214).
  const { rows, total, page, pageSize } = await listAdminRafflesPage({
    page: Number.isNaN(requestedPage) ? 1 : requestedPage,
    sort,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rifas"
        description="Cada boleta pertenece a una rifa. El precio se copia a la boleta en el momento de la venta."
        compactAction={
          <Button asChild>
            <Link href="/owner/raffles/new">
              <PlusIcon className="size-4" aria-hidden />
              Nueva rifa
            </Link>
          </Button>
        }
      />

      {/* El estado vacio es de la LISTA, no de la pagina: con `rows` una pagina
          fuera de rango decia «todavia no hay» teniendo filas (D-214). */}
      {total === 0 ? (
        <EmptyState
          icon={<TicketIcon className="size-8" aria-hidden />}
          title="Todavía no hay rifas"
          description="Crea la primera rifa para empezar a generar boletas y asignarlas a tus vendedores."
          action={
            <Button asChild>
              <Link href="/owner/raffles/new">Crear la primera rifa</Link>
            </Button>
          }
        />
      ) : (
        <>
          <RafflesTable raffles={rows} />
          <DataTablePagination total={total} page={page} pageSize={pageSize} items="raffles" />
        </>
      )}
    </div>
  )
}
