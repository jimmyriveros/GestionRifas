import { PlusIcon, TicketIcon } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { RafflesTable } from '@/features/raffles/components/RafflesTable'
import { listRaffleSummaries } from '@/features/raffles/queries'

export default async function RafflesPage() {
  const raffles = await listRaffleSummaries()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rifas"
        description="Cada boleta pertenece a una rifa. El precio se copia a la boleta en el momento de la venta."
        actions={
          <Button asChild>
            <Link href="/owner/raffles/new">
              <PlusIcon className="size-4" aria-hidden />
              Nueva rifa
            </Link>
          </Button>
        }
      />

      {raffles.length === 0 ? (
        <EmptyState
          icon={<TicketIcon className="size-8" aria-hidden />}
          title="Todavia no hay rifas"
          description="Crea la primera rifa para empezar a generar boletas y asignarlas a tus vendedores."
          action={
            <Button asChild>
              <Link href="/owner/raffles/new">Crear la primera rifa</Link>
            </Button>
          }
        />
      ) : (
        <RafflesTable raffles={raffles} />
      )}
    </div>
  )
}
