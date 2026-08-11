import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { RaffleForm } from '@/features/raffles/components/RaffleForm'
import { getRaffleDetail } from '@/features/raffles/queries'

export default async function EditRafflePage({
  params,
}: {
  params: Promise<{ raffleId: string }>
}) {
  const { raffleId } = await params
  const raffle = await getRaffleDetail(raffleId)

  if (!raffle) notFound()

  // BR-R08: una rifa cerrada o anulada no se edita. La Server Action lo vuelve
  // a comprobar; esto solo evita mostrar un formulario que no puede guardarse.
  if (raffle.status === 'closed' || raffle.status === 'cancelled') {
    redirect(`/owner/raffles/${raffle.id}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Editar ${raffle.name}`}
        description="Cambiar el precio no modifica las boletas que ya se vendieron."
        backHref={`/owner/raffles/${raffle.id}`}
      />
      <RaffleForm
        raffle={{
          id: raffle.id,
          name: raffle.name,
          description: raffle.description ?? '',
          ticketPrice: raffle.ticketPrice,
          startDate: raffle.startDate,
          endDate: raffle.endDate,
          allowSellerTicketCreation: raffle.allowSellerTicketCreation,
        }}
      />
    </div>
  )
}
