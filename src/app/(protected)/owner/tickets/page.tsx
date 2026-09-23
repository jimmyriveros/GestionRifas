import { LayersIcon, PlusIcon, TicketIcon } from 'lucide-react'
import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { CompactActionSlot } from '@/components/layout/CompactHeader'
import { Button } from '@/components/ui/button'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { listRaffleOptions } from '@/features/raffles/queries'
import { adminTicketSearchEmptyDescription } from '@/features/search/hints'
import { ADMIN_TICKET_SORT_COLUMNS, listAdminTickets } from '@/features/tickets/admin-queries'
import { TicketFilters } from '@/features/tickets/components/TicketFilters'
import { TicketsList } from '@/features/tickets/components/TicketsList'
import { adminPaymentStateSchema, inventoryStatusSchema } from '@/features/tickets/schemas'
import { TicketListSlot } from '@/features/tickets/selection/components/SelectedTicketsView'
import { TicketSelectionModeButton } from '@/features/tickets/selection/components/TicketSelectionModeButton'
import { TicketSelectionToolbar } from '@/features/tickets/selection/components/TicketSelectionToolbar'
import { TicketSelectionProvider } from '@/features/tickets/selection/TicketSelectionContext'
import { parseListSort } from '@/lib/list-sort'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Las dos acciones del encabezado, en el telefono: una fila de 44 px que va de
 * lado a lado, con los dos botones repartiendose el ancho (D-109). En
 * escritorio vuelven a su tamano normal, a la derecha del titulo.
 *
 * NO SUBEN a la fila del titulo, como sí hace «Mis boletas». Ahi hay una sola
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

/**
 * «Boletas» del portal administrativo.
 *
 * LEE LA PROYECCION ADMINISTRATIVA (D-198, BR-Q02). Las filas salen de
 * `admin_list_tickets`: numeros, rifa, vendedor, estado de inventario, estado de
 * pago en dos valores y paz y salvo. No hay cliente, precio, abonado ni saldo
 * que pintar, porque no llegan.
 *
 * LOS FILTROS SON LOS DEL PERSONAL. Se busca solo por numero; `clientId` se
 * ignora; el estado de pago acepta `paid` y `unpaid`, y cualquier otro valor —un
 * `partial` de un enlace antiguo— se descarta en vez de aplicarse.
 */
export default async function TicketsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams

  // Los parametros llegan de la URL: se validan con el mismo enum que la base
  // de datos en vez de pasarlos crudos a la consulta.
  const inventoryStatus = inventoryStatusSchema.safeParse(single(params.inventoryStatus))
  const paymentState = adminPaymentStateSchema.safeParse(single(params.paymentStatus))
  const requestedPage = Number.parseInt(single(params.page) ?? '1', 10)
  // Lista blanca propia del personal: no incluye cliente ni dinero (D-198).
  const sort = parseListSort(single(params.sort), single(params.dir), ADMIN_TICKET_SORT_COLUMNS)

  const filters = {
    raffleId: single(params.raffleId),
    sellerId: single(params.sellerId),
    inventoryStatus: inventoryStatus.success ? inventoryStatus.data : undefined,
    paymentState: paymentState.success ? paymentState.data : undefined,
    search: single(params.q),
  }

  const [{ rows, total, page, pageSize }, raffles, sellers] = await Promise.all([
    listAdminTickets({
      ...filters,
      page: Number.isNaN(requestedPage) ? 1 : requestedPage,
      sort,
    }),
    listRaffleOptions(),
    listActiveSellerOptions(),
  ])

  const hasFilters = Boolean(
    filters.search ??
    filters.raffleId ??
    filters.sellerId ??
    filters.inventoryStatus ??
    filters.paymentState,
  )

  const emptyDescription = adminTicketSearchEmptyDescription(filters.search, hasFilters)

  // Los mismos filtros que la consulta, para que «seleccionar todas las que
  // coinciden» seleccione exactamente lo que hay en pantalla (seccion 16).
  const selectionFilters = {
    raffleId: filters.raffleId,
    sellerId: filters.sellerId,
    inventoryStatus: filters.inventoryStatus,
    paymentStatus: filters.paymentState,
    search: filters.search,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Boletas"
        description="Todas las boletas de la organización. Búscalas por su número diario o semanal."
        actions={
          <>
            <Button asChild variant="outline" className={HEADER_ACTION_CLASS}>
              <Link href="/owner/tickets/bulk">
                <LayersIcon className="size-4" aria-hidden />
                Crear en lote
              </Link>
            </Button>
            <CompactActionSlot>
              <Button asChild className={HEADER_ACTION_CLASS}>
                <Link href="/owner/tickets/new">
                  <PlusIcon className="size-4" aria-hidden />
                  Nueva boleta
                </Link>
              </Button>
            </CompactActionSlot>
          </>
        }
      />

      {/* La seleccion multiple envuelve filtros y tabla a la vez: los filtros
          viven en la URL, asi que buscar vuelve a consultar en el servidor sin
          desmontar este componente y sin perder lo marcado (seccion 11). */}
      <TicketSelectionProvider storageKey="owner-tickets" pageIds={rows.map((row) => row.id)}>
        <div className="space-y-6">
          <TicketFilters
            audience="staff"
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
              />
              <TicketListSlot basePath="/owner/tickets" showSeller>
                <TicketsList audience="staff" tickets={rows} basePath="/owner/tickets" />
                <DataTablePagination
                  total={total}
                  page={page}
                  pageSize={pageSize}
                  items="tickets"
                />
              </TicketListSlot>
            </>
          )}
        </div>
      </TicketSelectionProvider>
    </div>
  )
}
