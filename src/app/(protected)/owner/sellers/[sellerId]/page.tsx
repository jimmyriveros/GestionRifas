import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { ActiveBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSellerWithTotals } from '@/features/sellers/queries'
import { UserRowActions } from '@/features/users/components/UserRowActions'
import { requireStaff } from '@/lib/auth/guards'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

export default async function SellerDetailPage({
  params,
}: {
  params: Promise<{ sellerId: string }>
}) {
  const { sellerId } = await params
  const membership = await requireStaff()
  const seller = await getSellerWithTotals(sellerId)

  if (!seller) notFound()

  return (
    <div className="space-y-6">
      <PageHeader
        title={seller.fullName}
        description={seller.alias ?? undefined}
        actions={
          <UserRowActions
            member={seller}
            currentRole={membership.role}
            currentProfileId={membership.profileId}
          />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de contacto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Correo">{seller.email}</Field>
          <Field label="Teléfono">{seller.phone}</Field>
          <Field label="Estado">
            <ActiveBadge isActive={seller.isActive} />
          </Field>
          <Field label="Alta">{formatDateEs(seller.createdAt)}</Field>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Inventario</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Boletas" value={seller.ticketsTotal} />
          <MetricCard label="Disponibles" value={seller.ticketsAvailable} />
          <MetricCard label="Asignadas" value={seller.ticketsAssigned} />
          <MetricCard label="Pendientes de aprobación" value={seller.ticketsPendingApproval} />
          <MetricCard label="Borradores" value={seller.ticketsDraft} />
          <MetricCard label="Clientes" value={seller.clientsCount} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Dinero</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Total vendido" value={formatCOP(seller.totalSold)} />
          <MetricCard label="Total recaudado" value={formatCOP(seller.totalCollected)} />
          <MetricCard label="Saldo pendiente" value={formatCOP(seller.pendingAmount)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/owner/tickets?sellerId=${seller.profileId}`}>Ver sus boletas</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/owner/clients?sellerId=${seller.profileId}`}>Ver sus clientes</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/owner/tickets/bulk?sellerId=${seller.profileId}`}>Asignarle boletas</Link>
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}
