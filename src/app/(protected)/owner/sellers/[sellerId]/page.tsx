import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { AccountStatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCommissionContext } from '@/features/commissions/queries'
import { getSellerWithTotals } from '@/features/sellers/queries'
import { listOrgMembers } from '@/features/users/queries'
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

  // Su lugar en la estructura comercial y lo que lleva ganado (BR-E08, BR-G12).
  const [comisiones, orgSellers] = await Promise.all([
    getCommissionContext(),
    listOrgMembers(['seller']),
  ])
  const raffle = comisiones.raffle
  const commission = comisiones.bySeller.get(sellerId) ?? null

  const team = orgSellers.filter((member) => member.parentSellerId === sellerId)
  const parent = seller.parentSellerId
    ? (orgSellers.find((member) => member.profileId === seller.parentSellerId) ?? null)
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title={seller.fullName}
        description={seller.alias ?? undefined}
        backHref="/owner/sellers"
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
            <AccountStatusBadge isActive={seller.isActive} activatedAt={seller.activatedAt} />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipo y comisión</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vendedor a cargo">
              {parent ? (
                <Link href={`/owner/sellers/${parent.profileId}`} className="hover:underline">
                  {parent.fullName}
                </Link>
              ) : (
                <span className="text-muted-foreground">Depende del Dueño o el Administrador</span>
              )}
            </Field>
            <Field label={raffle ? `Ganancia en ${raffle.name}` : 'Ganancia'}>
              {commission && commission.ticketsPaid > 0 ? (
                <span>
                  <span className="font-medium tabular-nums">{formatCOP(commission.earned)}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {commission.ticketsPaid} cobradas a {formatCOP(commission.rate)}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">Todavía no ha cobrado ninguna boleta</span>
              )}
            </Field>

            {/* BR-G13: dos formas de pago. Decirlo aquí evita que el Dueño tenga
                que deducirla del número. */}
            <Field label="Cómo se le paga">
              {parent === null ? (
                <span>La mitad del precio de cada boleta que cobre completa</span>
              ) : (
                <span>Por niveles, según el total de boletas que lleve cobradas</span>
              )}
            </Field>
          </div>

          <div>
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Su equipo
            </p>
            {team.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No tiene vendedores a su cargo. Cualquier vendedor puede armar el suyo.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {team.map((member) => (
                  <li key={member.profileId}>
                    <Link
                      href={`/owner/sellers/${member.profileId}`}
                      className="bg-muted hover:bg-accent inline-flex rounded-md px-2 py-1 text-sm"
                    >
                      {member.fullName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

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
