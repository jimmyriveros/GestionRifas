import { PlusIcon, TicketIcon } from 'lucide-react'
import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { CLIENT_FILTER_OPTIONS_LIMIT, listClientOptions } from '@/features/clients/queries'
import { listRaffleOptions } from '@/features/raffles/queries'
import { ticketSearchEmptyDescription } from '@/features/search/hints'
import { TicketFilters } from '@/features/tickets/components/TicketFilters'
import { TicketsTable } from '@/features/tickets/components/TicketsTable'
import { listTickets } from '@/features/tickets/queries'
import { inventoryStatusSchema, paymentStatusSchema } from '@/features/tickets/schemas'
import { TicketListSlot } from '@/features/tickets/selection/components/SelectedTicketsView'
import { TicketSelectionToolbar } from '@/features/tickets/selection/components/TicketSelectionToolbar'
import { TicketSelectionProvider } from '@/features/tickets/selection/TicketSelectionContext'
import { SEARCH_OPTIONS_LIMIT } from '@/lib/search'

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
    // Alimenta el desplegable «Cliente» de los filtros, que no tiene buscador:
    // su tope es el de siempre, no el pequeno de los selectores con busqueda.
    listClientOptions(undefined, CLIENT_FILTER_OPTIONS_LIMIT),
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

  // Los mismos filtros que la consulta, para que «seleccionar todas las que
  // coinciden» seleccione exactamente lo que hay en pantalla (seccion 16).
  const selectionFilters = {
    raffleId: single(params.raffleId),
    clientId: single(params.clientId),
    inventoryStatus: inventoryStatus.success ? inventoryStatus.data : undefined,
    paymentStatus: paymentStatus.success ? paymentStatus.data : undefined,
    search: single(params.q),
  }

  // Precio vigente de cada rifa: el total de una venta se suma boleta a boleta,
  // nunca con una cifra fija (seccion 30).
  const rafflePrices = Object.fromEntries(raffles.map((raffle) => [raffle.id, raffle.ticketPrice]))

  // Primeros clientes del vendedor para el selector del dialogo; a partir de
  // ahi se busca en el servidor (I-036).
  const clientOptions = clients.slice(0, SEARCH_OPTIONS_LIMIT)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis boletas"
        description="Busca por el número de la boleta o por el nombre del cliente, y asigna las que ya vendiste."
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

      {/* La seleccion multiple envuelve filtros y tabla a la vez: buscar
          varias veces y quedarse con boletas de cada busqueda es justo el caso
          de un vendedor que atiende a un cliente (seccion 11). */}
      <TicketSelectionProvider storageKey="seller-tickets" pageIds={rows.map((row) => row.id)}>
        <div className="space-y-6">
          {/* Sin selector de rifa: el negocio opera una sola y elegirla no
              acota nada. La consulta sigue aceptando `raffleId` por URL, asi
              que un enlace antiguo sigue funcionando (D-088). */}
          <TicketFilters
            clients={clients.map((client) => ({ value: client.id, label: client.name }))}
          />

          {rows.length === 0 ? (
            <EmptyState
              icon={<TicketIcon className="size-8" aria-hidden />}
              title={
                hasFilters ? 'Ninguna boleta coincide con los filtros' : 'Todavía no tienes boletas'
              }
              description={
                ticketSearchEmptyDescription(single(params.q), hasFilters) ??
                (canCreate
                  ? 'Puedes crear tus propias boletas: quedarán pendientes de aprobación.'
                  : 'Tu administrador todavía no te ha asignado boletas. Pídeselas cuando las necesites.')
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
              <TicketSelectionToolbar
                portal="seller"
                total={total}
                filters={selectionFilters}
                clients={clientOptions}
                rafflePrices={rafflePrices}
              />
              <TicketListSlot basePath="/seller/tickets" showSeller={false} showRaffle={false}>
                <TicketsTable
                  tickets={rows}
                  basePath="/seller/tickets"
                  showSeller={false}
                  showRaffle={false}
                />
                <DataTablePagination total={total} page={page} pageSize={pageSize} />
              </TicketListSlot>
            </>
          )}
        </div>
      </TicketSelectionProvider>
    </div>
  )
}
