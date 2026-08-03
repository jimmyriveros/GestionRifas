import Link from 'next/link'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { listRaffleOptions } from '@/features/raffles/queries'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { TicketForm } from '@/features/tickets/components/TicketForm'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function NewTicketPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const [raffles, sellers] = await Promise.all([listRaffleOptions(), listActiveSellerOptions()])

  // BR-R08: solo las rifas en borrador o activas admiten boletas nuevas.
  const openRaffles = raffles.filter(
    (raffle) => raffle.status === 'draft' || raffle.status === 'active',
  )

  if (openRaffles.length === 0 || sellers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nueva boleta" />
        <EmptyState
          title={
            openRaffles.length === 0
              ? 'No hay ninguna rifa que admita boletas'
              : 'No hay vendedores activos'
          }
          description={
            openRaffles.length === 0
              ? 'Crea una rifa (o reabre una cerrada) antes de generar boletas.'
              : 'Invita al menos a un vendedor activo: toda boleta pertenece a un vendedor.'
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
        title="Nueva boleta"
        description="La boleta queda disponible y lista para asignarse a un cliente."
      />
      <TicketForm
        raffles={openRaffles.map((raffle) => ({
          id: raffle.id,
          name: raffle.name,
          shortCode: raffle.shortCode,
        }))}
        sellers={sellers.map((seller) => ({ id: seller.id, fullName: seller.fullName }))}
        defaultRaffleId={single(params.raffleId)}
        defaultSellerId={single(params.sellerId)}
      />
    </div>
  )
}
