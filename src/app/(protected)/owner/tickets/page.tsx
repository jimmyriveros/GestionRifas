import { LayersIcon, PlusIcon, TicketIcon } from 'lucide-react'
import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { listRaffleOptions } from '@/features/raffles/queries'
import { ticketSearchEmptyDescription } from '@/features/search/hints'
import { TicketFilters } from '@/features/tickets/components/TicketFilters'
import { TicketsTable } from '@/features/tickets/components/TicketsTable'
import { listTickets } from '@/features/tickets/queries'
import { inventoryStatusSchema, paymentStatusSchema } from '@/features/tickets/schemas'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function TicketsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams

  // Los parametros llegan de la URL: se validan con el mismo enum que la base
  // de datos en vez de pasarlos crudos a la consulta.
  const inventoryStatus = inventoryStatusSchema.safeParse(single(params.inventoryStatus))
  const paymentStatus = paymentStatusSchema.safeParse(single(params.paymentStatus))
  const requestedPage = Number.parseInt(single(params.page) ?? '1', 10)

  const [{ rows, total, page, pageSize }, raffles, sellers] = await Promise.all([
    listTickets({
      raffleId: single(params.raffleId),
      sellerId: single(params.sellerId),
      clientId: single(params.clientId),
      inventoryStatus: inventoryStatus.success ? inventoryStatus.data : undefined,
      paymentStatus: paymentStatus.success ? paymentStatus.data : undefined,
      search: single(params.q),
      page: Number.isNaN(requestedPage) ? 1 : requestedPage,
    }),
    listRaffleOptions(),
    listActiveSellerOptions(),
  ])

  const hasFilters = Boolean(
    single(params.q) ??
    single(params.raffleId) ??
    single(params.sellerId) ??
    single(params.clientId) ??
    single(params.inventoryStatus) ??
    single(params.paymentStatus),
  )

  const emptyDescription = ticketSearchEmptyDescription(single(params.q), hasFilters)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Boletas"
        description="Todas las boletas de la organización, con su vendedor, su cliente y su estado."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/owner/tickets/bulk">
                <LayersIcon className="size-4" aria-hidden />
                Crear en lote
              </Link>
            </Button>
            <Button asChild>
              <Link href="/owner/tickets/new">
                <PlusIcon className="size-4" aria-hidden />
                Nueva boleta
              </Link>
            </Button>
          </>
        }
      />

      <TicketFilters
        raffles={raffles.map((raffle) => ({
          value: raffle.id,
          label: `${raffle.shortCode} — ${raffle.name}`,
        }))}
        sellers={sellers.map((seller) => ({ value: seller.id, label: seller.fullName }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<TicketIcon className="size-8" aria-hidden />}
          title={hasFilters ? 'Ninguna boleta coincide con los filtros' : 'Todavía no hay boletas'}
          description={
            emptyDescription ?? 'Crea boletas en lote para repartirlas entre tus vendedores.'
          }
          action={
            hasFilters ? null : (
              <Button asChild>
                <Link href="/owner/tickets/bulk">Crear boletas en lote</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <TicketsTable tickets={rows} />
          <DataTablePagination total={total} page={page} pageSize={pageSize} />
        </>
      )}
    </div>
  )
}
