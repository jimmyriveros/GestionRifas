import Link from 'next/link'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { INVENTORY_COPY } from '@/features/inventory/copy'
import { CreationModeSwitch } from '@/features/inventory/components/CreationModeSwitch'
import { GenerationRunsList } from '@/features/inventory/components/GenerationRunsList'
import { TicketGenerator } from '@/features/inventory/components/TicketGenerator'
import { listGenerationRuns } from '@/features/inventory/queries'
import { listRaffleOptions } from '@/features/raffles/queries'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

const C = INVENTORY_COPY.generator

/**
 * «Generar boletas por rangos» (D-257, BR-N15..BR-N18).
 *
 * El segundo modo de «Crear en lote»: en vez de escribir los numeros de hasta
 * 1.000 boletas para un vendedor, se dan dos rangos y se crean todas sus
 * combinaciones —hasta 100.000— en el inventario comun de la rifa. Asignarlas a
 * vendedores es otra operacion, despues, desde «Boletas».
 *
 * El layout del portal ya exige Dueño o Administrador; las RPC lo vuelven a
 * comprobar.
 */
export default async function GenerateTicketsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const [raffles, runs] = await Promise.all([
    listRaffleOptions(),
    listGenerationRuns(undefined, 10),
  ])

  // BR-R08: solo rifas en borrador o activas admiten boletas nuevas.
  const openRaffles = raffles.filter(
    (raffle) => raffle.status === 'draft' || raffle.status === 'active',
  )
  const raffleId = single(params.raffleId)

  return (
    <div className="space-y-6">
      <PageHeader title={C.title} description={C.description} backHref="/owner/tickets" />

      <CreationModeSwitch current="generate" raffleId={raffleId} />

      {openRaffles.length === 0 ? (
        <EmptyState
          title={C.noRaffles}
          description={C.noRafflesDescription}
          action={
            <Button asChild>
              <Link href="/owner/raffles/new">Crear rifa</Link>
            </Button>
          }
        />
      ) : (
        <TicketGenerator
          raffles={openRaffles.map((raffle) => ({
            id: raffle.id,
            label: `${raffle.shortCode} — ${raffle.name}`,
            name: raffle.name,
            numberFormat: raffle.numberFormat,
          }))}
          defaultRaffleId={raffleId}
        />
      )}

      <section className="space-y-3" aria-labelledby="generation-runs-title">
        <h2 id="generation-runs-title" className="text-lg font-semibold">
          {C.runsTitle}
        </h2>
        <GenerationRunsList runs={runs} />
      </section>
    </div>
  )
}
