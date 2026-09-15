import Link from 'next/link'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { listRaffleOptions } from '@/features/raffles/queries'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { BulkTicketCreator } from '@/features/tickets/bulk/components/BulkTicketCreator'
import { BULK_TICKET_MAX } from '@/lib/constants'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function BulkTicketsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const [raffles, sellers] = await Promise.all([listRaffleOptions(), listActiveSellerOptions()])

  // BR-R08: solo rifas en borrador o activas.
  const openRaffles = raffles.filter(
    (raffle) => raffle.status === 'draft' || raffle.status === 'active',
  )

  if (openRaffles.length === 0 || sellers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Crear boletas en lote" />
        <EmptyState
          title={
            openRaffles.length === 0
              ? 'No hay ninguna rifa que admita boletas'
              : 'No hay vendedores activos'
          }
          description={
            openRaffles.length === 0
              ? 'Crea una rifa antes de generar boletas.'
              : 'Invita al menos a un vendedor activo para poder repartirle boletas.'
          }
          action={
            <Button asChild>
              <Link href={openRaffles.length === 0 ? '/owner/raffles/new' : '/owner/sellers'}>
                {openRaffles.length === 0 ? 'Crear rifa' : 'Ir a vendedores'}
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crear boletas en lote"
        description={`Hasta ${BULK_TICKET_MAX} boletas por lote. Las filas sin números se guardan como borrador para completarlas después.`}
      />
      <BulkTicketCreator
        raffles={openRaffles.map((raffle) => ({
          id: raffle.id,
          label: `${raffle.shortCode} — ${raffle.name}`,
        }))}
        sellers={sellers.map((seller) => ({ id: seller.id, label: seller.fullName }))}
        defaultRaffleId={single(params.raffleId)}
        defaultSellerId={single(params.sellerId)}
      />
    </div>
  )
}
