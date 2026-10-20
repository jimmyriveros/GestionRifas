import { BoxesIcon } from 'lucide-react'
import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { CatalogRefreshOnFocus } from '@/features/catalog/components/CatalogRefreshOnFocus'
import { listClientOptions } from '@/features/clients/queries'
import { INVENTORY_COPY } from '@/features/inventory/copy'
import { InventoryResults } from '@/features/inventory/components/InventoryResults'
import { InventorySearchForm } from '@/features/inventory/components/InventorySearchForm'
import { SellerHoldsPanel } from '@/features/inventory/components/SellerHoldsPanel'
import {
  getSellerInventorySummary,
  listSellerInventoryTickets,
  listSellerTicketHolds,
} from '@/features/inventory/queries'
import { listRaffleNumberFormats } from '@/features/raffles/number-formats'
import { inventorySearchSchema } from '@/features/inventory/schemas'
import { getWhatsappSettings } from '@/features/whatsapp/queries'
import { cn } from '@/lib/utils'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

const C = INVENTORY_COPY.seller

/** Cada cuanto se vuelve a pedir la pagina mientras se mira (D-257). */
const REFRESH_EVERY_MS = 30_000

/**
 * «Inventario común»: el catalogo interno del vendedor (D-257, BR-I20..BR-I25).
 *
 * Busca en TODA la rifa por numero diario, semanal o los dos. Lo libre se puede
 * apartar; lo propio se reconoce; lo ajeno solo se ve como «No disponible». Las
 * boletas apartadas se venden desde «Tus apartados», con el mismo formulario de
 * venta de siempre.
 *
 * LA PANTALLA NO SE QUEDA VIEJA, pero tampoco decide nada: se vuelve a pedir al
 * volver a la pestaña, cada 30 segundos mientras se mira y justo despues de que
 * venza uno de sus apartados. Quien decide si una boleta sigue libre o si un
 * apartado sigue vigente es la base, al confirmar.
 */
export default async function SellerInventoryPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const parsed = inventorySearchSchema.safeParse({
    raffleId: single(params.raffleId),
    daily: single(params.daily),
    weekly: single(params.weekly),
    show: single(params.show),
    page: single(params.page),
  })
  const search = parsed.success ? parsed.data : {}

  const summary = await getSellerInventorySummary()

  if (summary.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={C.title} />
        <EmptyState
          icon={<BoxesIcon className="size-8" aria-hidden />}
          title={C.noRaffle}
          description={C.noRaffleDescription}
        />
      </div>
    )
  }

  const raffle = summary.find((item) => item.raffleId === search.raffleId) ?? summary[0]!
  const daily = search.daily ?? ''
  const weekly = search.weekly ?? ''
  const show = search.show ?? 'free'
  const searching = daily !== '' || weekly !== ''

  const [holds, results, clients, whatsappSettings, formats] = await Promise.all([
    listSellerTicketHolds(raffle.raffleId),
    listSellerInventoryTickets({
      raffleId: raffle.raffleId,
      daily: daily || undefined,
      weekly: weekly || undefined,
      onlyFree: show !== 'all',
      page: search.page,
    }),
    listClientOptions(),
    getWhatsappSettings(),
    listRaffleNumberFormats(),
  ])
  // D-261: los números de ESTA rifa, para el buscador y los resultados.
  const numberFormat = formats.get(raffle.raffleId)

  const capReached = holds.length >= raffle.maxActivePerSeller

  return (
    <div className="space-y-6">
      <CatalogRefreshOnFocus
        intervalMs={REFRESH_EVERY_MS}
        refreshAt={holds.map((hold) => Date.parse(hold.expiresAt))}
      />

      <PageHeader title={C.title} description={C.description(raffle.durationMinutes)} />

      {summary.length > 1 ? (
        <nav aria-label={C.raffleLabel}>
          <ul className="flex flex-wrap gap-2">
            {summary.map((item) => {
              const active = item.raffleId === raffle.raffleId
              return (
                <li key={item.raffleId}>
                  <Link
                    href={`/seller/inventory?raffleId=${item.raffleId}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'focus-visible:ring-ring inline-flex h-11 items-center rounded-md border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none sm:h-9',
                      active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                    )}
                  >
                    {item.raffleShortCode} — {item.raffleName}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      ) : null}

      {/* Con 0 libres no se avisa: el estado vacío de abajo ya lo dice. */}
      {raffle.freeCount > 0 ? (
        <Notice tone="info" density="compact">
          {C.myTicketsNotice(raffle.freeCount)}
        </Notice>
      ) : null}

      <SellerHoldsPanel
        holds={holds}
        activeCount={holds.length}
        maxActive={raffle.maxActivePerSeller}
        clients={clients}
        whatsappSettings={whatsappSettings}
      />

      <section className="space-y-3" aria-labelledby="inventory-search-title">
        <h2 id="inventory-search-title" className="text-lg font-semibold">
          {C.searchLegend}
        </h2>
        <InventorySearchForm
          raffleId={summary.length > 1 ? raffle.raffleId : null}
          daily={daily}
          weekly={weekly}
          show={show}
          numberFormat={numberFormat}
        />

        {results.total === 0 ? (
          <EmptyState
            icon={<BoxesIcon className="size-8" aria-hidden />}
            title={searching ? C.resultsEmptySearch : C.resultsEmptyFree}
            description={
              searching ? C.resultsEmptySearchDescription : C.resultsEmptyFreeDescription
            }
          />
        ) : (
          <>
            {capReached ? (
              <p className="text-muted-foreground text-sm">
                {raffle.maxActivePerSeller === 0
                  ? C.holdsCount(holds.length, raffle.maxActivePerSeller)
                  : C.capReached(holds.length, raffle.maxActivePerSeller)}
              </p>
            ) : null}
            <InventoryResults
              rows={results.rows}
              durationMinutes={raffle.durationMinutes}
              capReached={capReached}
              numberFormat={numberFormat}
            />
            <DataTablePagination
              total={results.total}
              page={results.page}
              pageSize={results.pageSize}
              items="tickets"
            />
          </>
        )}
      </section>
    </div>
  )
}
