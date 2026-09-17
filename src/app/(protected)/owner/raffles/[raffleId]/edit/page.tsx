import { notFound, redirect } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { RaffleForm } from '@/features/raffles/components/RaffleForm'
import { parseRaffleEditOrigin, raffleEditReturnHref } from '@/features/raffles/edit-origin'
import { getAdminRaffleDetail } from '@/features/raffles/queries'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function EditRafflePage({
  params,
  searchParams,
}: {
  params: Promise<{ raffleId: string }>
  searchParams: SearchParams
}) {
  const [{ raffleId }, query] = await Promise.all([params, searchParams])
  // La lectura del personal: la rifa y sus recuentos, sin dinero (D-198).
  const raffle = await getAdminRaffleDetail(raffleId)

  if (!raffle) notFound()

  // BR-R08: una rifa cerrada o anulada no se edita. La Server Action lo vuelve
  // a comprobar; esto solo evita mostrar un formulario que no puede guardarse.
  if (raffle.status === 'closed' || raffle.status === 'cancelled') {
    redirect(`/owner/raffles/${raffle.id}`)
  }

  // D-202: se vuelve a donde se abrió —el detalle o los premios del proceso—.
  // El origen es una lista cerrada y el destino se compone con el id que RLS ya
  // dejó ver, nunca con lo que traiga la URL.
  const returnHref = raffleEditReturnHref(raffle.id, parseRaffleEditOrigin(query.from))

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Editar ${raffle.name}`}
        description="Cambiar el precio no modifica las boletas que ya se vendieron."
        backHref={returnHref}
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
        status={raffle.status}
        returnHref={returnHref}
      />
    </div>
  )
}
