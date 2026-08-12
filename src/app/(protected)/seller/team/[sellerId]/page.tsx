import { notFound } from 'next/navigation'

import { EmptyState } from '@/components/data/EmptyState'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { ActiveBadge } from '@/components/data/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamMemberSales } from '@/features/team/components/TeamMemberSales'
import { getTeamMember, listTeamMemberSales } from '@/features/team/queries'
import { requireRole } from '@/lib/auth/guards'
import { formatCOP } from '@/lib/money'

/**
 * Detalle de un integrante del equipo (BR-E05).
 *
 * Si el id no es de su equipo, `getTeamMember` devuelve null y esto responde
 * 404: un vendedor ajeno no debe distinguirse de uno inexistente. La barrera de
 * verdad no es este `if`, sino que `team_sales_summary` y `team_member_sales`
 * solo saben responder por el equipo de quien llama.
 */
export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ sellerId: string }>
}) {
  const { sellerId } = await params
  const membership = await requireRole(['seller'])

  const member = await getTeamMember(membership.profileId, sellerId)
  if (!member) notFound()

  const sales = await listTeamMemberSales(sellerId)

  return (
    <div className="space-y-6">
      <PageHeader
        title={member.fullName}
        description={member.alias ?? 'Vendedor de tu equipo'}
        backHref="/seller/team"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de contacto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Teléfono">{member.phone}</Field>
          <Field label="Correo">{member.email}</Field>
          <Field label="Estado">
            <ActiveBadge isActive={member.isActive} />
          </Field>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Cómo va</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Boletas vendidas" value={member.ticketsAssigned} />
          <MetricCard label="Ya pagadas" value={member.ticketsPaid} />
          <MetricCard label="Total vendido" value={formatCOP(member.totalSold)} />
          <MetricCard label="Falta por cobrar" value={formatCOP(member.pendingAmount)} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Sus ventas</h2>
        {sales.length === 0 ? (
          <EmptyState
            title="Todavía no ha vendido boletas"
            description="Aquí verás cada boleta que venda, con su fecha y cuánto lleva pagado."
          />
        ) : (
          <TeamMemberSales sales={sales} />
        )}
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
