import { InfoIcon } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { listRaffleOptions } from '@/features/raffles/queries'
import { SellerTicketForm } from '@/features/tickets/seller/components/SellerTicketForm'

export default async function NewSellerTicketsPage() {
  const raffles = await listRaffleOptions()

  // BR-R10: solo las rifas ACTIVAS que lo permiten explicitamente.
  const allowed = raffles.filter(
    (raffle) => raffle.status === 'active' && raffle.allowSellerTicketCreation,
  )

  if (allowed.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Crear boletas" />
        <EmptyState
          icon={<InfoIcon className="size-8" aria-hidden />}
          title="Ninguna rifa activa te permite crear boletas"
          description="Es una decisión de tu administrador, rifa por rifa. Pídele que te asigne boletas o que habilite la opción."
          action={
            <Button asChild variant="outline">
              <Link href="/seller/tickets">Volver a mis boletas</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crear boletas"
        description="Escribe los dos números de cada boleta. Quedarán pendientes de aprobación hasta que tu administrador las revise."
      />
      <SellerTicketForm
        raffles={allowed.map((raffle) => ({
          id: raffle.id,
          label: `${raffle.shortCode} — ${raffle.name}`,
        }))}
      />
    </div>
  )
}
