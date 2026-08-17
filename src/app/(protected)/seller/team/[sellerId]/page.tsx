import { notFound } from 'next/navigation'

import { EmptyState } from '@/components/data/EmptyState'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { AccountStatusBadge } from '@/components/data/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCommissionContext } from '@/features/commissions/queries'
import { TeamMemberActions } from '@/features/team/components/TeamMemberActions'
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

  const comisiones = await getCommissionContext()
  const raffle = comisiones.raffle

  const member = await getTeamMember(membership.profileId, sellerId, raffle?.id)
  if (!member) notFound()

  const sales = await listTeamMemberSales(sellerId)
  const commission = comisiones.bySeller.get(sellerId) ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        title={member.fullName}
        description={member.alias ?? 'Vendedor de tu equipo'}
        backHref="/seller/team"
        actions={<TeamMemberActions member={member} />}
      />

      {member.activatedAt === null ? (
        <p className="rounded-lg border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Le enviamos la invitación a {member.email} y todavía no ha creado su contraseña. Mientras
          tanto puedes corregir sus datos o eliminar el vendedor.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de contacto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Teléfono">{member.phone}</Field>
          <Field label="Correo">{member.email}</Field>
          <Field label="Estado">
            <AccountStatusBadge isActive={member.isActive} activatedAt={member.activatedAt} />
          </Field>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Cómo va</h2>
        {/* Cuántas lleva cobradas lo dice la tarjeta de ganancia, desde
            `seller_commissions`: aquí se repetiría con otro origen. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Boletas vendidas" value={member.ticketsAssigned} />
          <MetricCard label="Total vendido" value={formatCOP(member.totalSold)} />
          <MetricCard label="Falta por cobrar" value={formatCOP(member.pendingAmount)} />
        </div>
      </div>

      {commission !== null && commission.ticketsPaid > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lo que lleva ganado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-semibold tabular-nums">{formatCOP(commission.earned)}</p>
            <p className="text-muted-foreground text-sm">
              {commission.ticketsPaid}{' '}
              {commission.ticketsPaid === 1 ? 'boleta cobrada' : 'boletas cobradas'} ·{' '}
              {formatCOP(commission.rate)} por boleta
              {commission.ticketsToNext !== null && commission.nextRate !== null
                ? ` · le faltan ${commission.ticketsToNext} para llegar a ${formatCOP(commission.nextRate)}`
                : ''}
            </p>
            {/* Sin esto la cuenta no cuadraria a la vista: «2 cobradas a
                $60.000» encima de un total de $100.000 (BR-G17). */}
            {commission.discounts > 0 ? (
              <p className="text-muted-foreground text-sm">
                Menos {formatCOP(commission.discounts)} de las rebajas que hizo.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
