import { PlusIcon, TicketIcon } from 'lucide-react'
import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { listClientOptions } from '@/features/clients/queries'
import { listRaffleOptions } from '@/features/raffles/queries'
import { TicketFilters } from '@/features/tickets/components/TicketFilters'
import { TicketsTable } from '@/features/tickets/components/TicketsTable'
import { listTickets } from '@/features/tickets/queries'
import { inventoryStatusSchema, paymentStatusSchema } from '@/features/tickets/schemas'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function SellerTicketsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams

  const inventoryStatus = inventoryStatusSchema.safeParse(single(params.inventoryStatus))
  const paymentStatus = paymentStatusSchema.safeParse(single(params.paymentStatus))
  const requestedPage = Number.parseInt(single(params.page) ?? '1', 10)

  // No se filtra por `sellerId`: `tickets_select` ya limita las filas a las
  // boletas de quien consulta (BR-U07). Pasar el id por la URL no cambiaria
  // nada, y por eso tampoco se acepta.
  const [{ rows, total, page, pageSize }, raffles, clients] = await Promise.all([
    listTickets({
      raffleId: single(params.raffleId),
      clientId: single(params.clientId),
      inventoryStatus: inventoryStatus.success ? inventoryStatus.data : undefined,
      paymentStatus: paymentStatus.success ? paymentStatus.data : undefined,
      search: single(params.q),
      page: Number.isNaN(requestedPage) ? 1 : requestedPage,
    }),
    listRaffleOptions(),
    listClientOptions(),
  ])

  const canCreate = raffles.some(
    (raffle) => raffle.status === 'active' && raffle.allowSellerTicketCreation,
  )

  const hasFilters = Boolean(
    single(params.q) ??
    single(params.raffleId) ??
    single(params.clientId) ??
    single(params.inventoryStatus) ??
    single(params.paymentStatus),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis boletas"
        description="Busca por codigo o por numero, y asigna las que ya vendiste."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/seller/tickets/new">
                <PlusIcon className="size-4" aria-hidden />
                Crear boletas
              </Link>
            </Button>
          ) : null
        }
      />

      <TicketFilters
        raffles={raffles.map((raffle) => ({
          value: raffle.id,
          label: `${raffle.shortCode} — ${raffle.name}`,
        }))}
        clients={clients.map((client) => ({ value: client.id, label: client.name }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<TicketIcon className="size-8" aria-hidden />}
          title={
            hasFilters ? 'Ninguna boleta coincide con los filtros' : 'Todavia no tienes boletas'
          }
          description={
            hasFilters
              ? 'Prueba a limpiar los filtros o a buscar por otro numero.'
              : canCreate
                ? 'Puedes crear tus propias boletas: quedaran pendientes de aprobacion.'
                : 'Tu administrador todavia no te ha asignado boletas. Pideselas cuando las necesites.'
          }
          action={
            !hasFilters && canCreate ? (
              <Button asChild>
                <Link href="/seller/tickets/new">Crear mis primeras boletas</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <TicketsTable
            tickets={rows}
            basePath="/seller/tickets"
            showSeller={false}
            enableApproval={false}
          />
          <DataTablePagination total={total} page={page} pageSize={pageSize} />
        </>
      )}
    </div>
  )
}
