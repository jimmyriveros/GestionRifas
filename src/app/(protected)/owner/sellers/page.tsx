import { UsersIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { SellersTable } from '@/features/sellers/components/SellersTable'
import { listSellersWithInventory } from '@/features/sellers/queries'
import { CreateUserButton } from '@/features/users/components/CreateUserButton'
import { requireStaff } from '@/lib/auth/guards'

/**
 * Vendedores de la organizacion.
 *
 * Desde D-198 la tabla dice cuantas boletas tiene cada uno, no cuanto dinero
 * mueve: lo vendido, el saldo y la ganancia son de su cartera (BR-Q08).
 */
export default async function SellersPage() {
  const membership = await requireStaff()

  const sellers = await listSellersWithInventory()

  // La estructura comercial, derivada de la misma lista: quien tiene equipo,
  // quien pertenece al de alguien y quien no (BR-E08). Sin consultas nuevas.
  const teamSizes = new Map<string, number>()
  const parentNames = new Map<string, string>()
  for (const seller of sellers) {
    parentNames.set(seller.profileId, seller.fullName)
    if (seller.parentSellerId) {
      teamSizes.set(seller.parentSellerId, (teamSizes.get(seller.parentSellerId) ?? 0) + 1)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendedores"
        description="Cada vendedor ve únicamente sus boletas, sus clientes y sus pagos."
        compactAction={<CreateUserButton role="seller" label="Nuevo vendedor" />}
      />

      {sellers.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-8" aria-hidden />}
          title="Todavía no hay vendedores"
          description="Invita al primer vendedor para poder asignarle boletas."
          action={<CreateUserButton role="seller" label="Invitar vendedor" />}
        />
      ) : (
        <SellersTable
          sellers={sellers}
          currentRole={membership.role}
          currentProfileId={membership.profileId}
          teamSizes={teamSizes}
          parentNames={parentNames}
        />
      )}
    </div>
  )
}
