import { UsersIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { SellersTable } from '@/features/sellers/components/SellersTable'
import { listSellersWithTotals } from '@/features/sellers/queries'
import { CreateUserButton } from '@/features/users/components/CreateUserButton'
import { requireStaff } from '@/lib/auth/guards'

export default async function SellersPage() {
  const membership = await requireStaff()
  const sellers = await listSellersWithTotals()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendedores"
        description="Cada vendedor ve unicamente sus boletas, sus clientes y sus pagos."
        actions={<CreateUserButton role="seller" label="Nuevo vendedor" />}
      />

      {sellers.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-8" aria-hidden />}
          title="Todavia no hay vendedores"
          description="Invita al primer vendedor para poder asignarle boletas."
          action={<CreateUserButton role="seller" label="Invitar vendedor" />}
        />
      ) : (
        <SellersTable
          sellers={sellers}
          currentRole={membership.role}
          currentProfileId={membership.profileId}
        />
      )}
    </div>
  )
}
