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
import { TicketsList } from '@/features/tickets/components/TicketsList'
import { listTickets } from '@/features/tickets/queries'
import { inventoryStatusSchema, paymentStatusSchema } from '@/features/tickets/schemas'
import { TicketListSlot } from '@/features/tickets/selection/components/SelectedTicketsView'
import { TicketSelectionModeButton } from '@/features/tickets/selection/components/TicketSelectionModeButton'
import { TicketSelectionToolbar } from '@/features/tickets/selection/components/TicketSelectionToolbar'
import { TicketSelectionProvider } from '@/features/tickets/selection/TicketSelectionContext'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Las dos acciones del encabezado, en el telefono: una fila de 44 px que va de
 * lado a lado, con los dos botones repartiendose el ancho (D-109). En
 * escritorio vuelven a su tamano normal, a la derecha del titulo.
 *
 * NO suben a la fila del titulo, como sí hace «Mis boletas». Ahi hay una sola
 * accion; aqui son dos: a 320 px el titulo mide 79 px y las acciones 272, que
 * con su hueco suman 363 sobre los 288 disponibles. Esconder «Crear en lote»
 * detras de un menu para que cupieran habria enterrado la accion con la que se
 * cargan las boletas de una rifa entera.
 *
 * Las clases van en los botones y no en el contenedor de `PageHeader`: es el
 * mismo patron que ya usan `SearchInput` y la fila de «Filtros», y deja fuera
 * del componente que comparten 27 pantallas una decision que solo afecta a
 * esta.
 */
const HEADER_ACTION_CLASS = 'h-11 grow md:h-9 md:grow-0'

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

  // Los mismos filtros que la consulta, para que «seleccionar todas las que
  // coinciden» seleccione exactamente lo que hay en pantalla (seccion 16).
  const selectionFilters = {
    raffleId: single(params.raffleId),
    sellerId: single(params.sellerId),
    clientId: single(params.clientId),
    inventoryStatus: inventoryStatus.success ? inventoryStatus.data : undefined,
    paymentStatus: paymentStatus.success ? paymentStatus.data : undefined,
    search: single(params.q),
  }

  // Precio vigente de cada rifa: el total de una venta se suma boleta a boleta,
  // nunca con una cifra fija (seccion 30).
  const rafflePrices = Object.fromEntries(raffles.map((raffle) => [raffle.id, raffle.ticketPrice]))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Boletas"
        description="Todas las boletas de la organización. Búscalas por su número o por el nombre del cliente."
        actions={
          <>
            <Button asChild variant="outline" className={HEADER_ACTION_CLASS}>
              <Link href="/owner/tickets/bulk">
                <LayersIcon className="size-4" aria-hidden />
                Crear en lote
              </Link>
            </Button>
            <Button asChild className={HEADER_ACTION_CLASS}>
              <Link href="/owner/tickets/new">
                <PlusIcon className="size-4" aria-hidden />
                Nueva boleta
              </Link>
            </Button>
          </>
        }
      />

      {/* La seleccion multiple envuelve filtros y tabla a la vez: los filtros
          viven en la URL, asi que buscar vuelve a consultar en el servidor sin
          desmontar este componente y sin perder lo marcado (seccion 11). */}
      <TicketSelectionProvider storageKey="owner-tickets" pageIds={rows.map((row) => row.id)}>
        <div className="space-y-6">
          <TicketFilters
            raffles={raffles.map((raffle) => ({
              value: raffle.id,
              label: `${raffle.shortCode} — ${raffle.name}`,
            }))}
            sellers={sellers.map((seller) => ({ value: seller.id, label: seller.fullName }))}
            // Junto a «Filtros», en la misma fila (D-108). Sin boletas en la
            // lista no se ofrece: no habria nada que seleccionar.
            secondaryAction={rows.length > 0 ? <TicketSelectionModeButton /> : null}
          />

          {rows.length === 0 ? (
            <EmptyState
              icon={<TicketIcon className="size-8" aria-hidden />}
              title={
                hasFilters ? 'Ninguna boleta coincide con los filtros' : 'Todavía no hay boletas'
              }
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
              <TicketSelectionToolbar
                portal="owner"
                total={total}
                filters={selectionFilters}
                sellers={sellers.map((seller) => ({ id: seller.id, fullName: seller.fullName }))}
                rafflePrices={rafflePrices}
              />
              <TicketListSlot basePath="/owner/tickets" showSeller>
                <TicketsList tickets={rows} />
                <DataTablePagination total={total} page={page} pageSize={pageSize} />
              </TicketListSlot>
            </>
          )}
        </div>
      </TicketSelectionProvider>
    </div>
  )
}
