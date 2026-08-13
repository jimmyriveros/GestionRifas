import { UsersIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/EmptyState'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { getCommissionContext } from '@/features/commissions/queries'
import { AddTeamMemberButton } from '@/features/team/components/AddTeamMemberButton'
import { TeamMemberList } from '@/features/team/components/TeamMemberList'
import { isTeamMember, listTeamWithTotals } from '@/features/team/queries'
import { requireRole } from '@/lib/auth/guards'
import { formatCOP } from '@/lib/money'

/**
 * «Mi equipo» — visible para TODO vendedor, tenga equipo o no (BR-E01).
 *
 * Un vendedor que ya pertenece al equipo de alguien no puede formar el suyo
 * (BR-E03, dos niveles). La pantalla se lo dice con palabras en vez de ofrecerle
 * un boton que la base de datos va a rechazar.
 */
export default async function TeamPage() {
  const membership = await requireRole(['seller'])

  const [belongsToTeam, comisiones] = await Promise.all([
    isTeamMember(membership.profileId),
    getCommissionContext(),
  ])
  const raffle = comisiones.raffle

  // Ventas y ganancia, de LA MISMA rifa (BR-G04). Mezclar «vendidas en todas
  // las rifas» con «ganado en esta» daria dos cifras que no se pueden comparar.
  const members = await listTeamWithTotals(membership.profileId, raffle?.id)

  const canAdd = !belongsToTeam
  // Se suman aqui los totales que SQL ya calculo por integrante, igual que
  // `listSellersWithTotals` suma sus filas por rifa. No es calcular dinero en el
  // navegador —esto corre en el servidor y los sumandos vienen de la base—, y es
  // correcto porque la lista no esta paginada: un equipo cabe entero. Si algun
  // dia se pagina, estos dos totales tienen que pasar a SQL.
  const teamSales = members.reduce((total, member) => total + member.ticketsAssigned, 0)
  const teamCollected = members.reduce((total, member) => total + member.totalCollected, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi equipo"
        description={
          raffle
            ? `Cómo va tu equipo en ${raffle.name}. Cada vendedor trabaja con sus propias boletas.`
            : 'Los vendedores que agregas trabajan con sus propias boletas y tú ves cómo les va.'
        }
        actions={canAdd && members.length > 0 ? <AddTeamMemberButton /> : undefined}
      />

      {members.length === 0 ? (
        canAdd ? (
          <EmptyState
            icon={<UsersIcon className="size-8" aria-hidden />}
            title="Todavía no tienes vendedores en tu equipo"
            description="Agrega vendedores que te ayuden con las ventas. Cada uno maneja sus propias boletas y sus propios clientes."
            action={<AddTeamMemberButton />}
          />
        ) : (
          <EmptyState
            icon={<UsersIcon className="size-8" aria-hidden />}
            title="Formas parte del equipo de otro vendedor"
            description="Por ahora, quien arma equipos es el vendedor a cargo. Tú puedes concentrarte en vender tus boletas."
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MetricCard label="Vendedores" value={members.length} />
            <MetricCard label="Boletas vendidas" value={teamSales} />
            <MetricCard label="Recaudado" value={formatCOP(teamCollected)} />
          </div>

          <TeamMemberList members={members} commissions={comisiones.bySeller} />
        </>
      )}
    </div>
  )
}
