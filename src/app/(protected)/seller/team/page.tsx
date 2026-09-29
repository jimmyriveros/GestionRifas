import { UsersIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/EmptyState'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { EARNINGS_COPY } from '@/features/commissions/copy'
import {
  getCommissionContext,
  getCommissionTemplate,
  getSellerAgreement,
  getTeamCommissionLimits,
} from '@/features/commissions/queries'
import { AddTeamMemberButton } from '@/features/team/components/AddTeamMemberButton'
import { TeamMemberList } from '@/features/team/components/TeamMemberList'
import { listTeamWithTotals } from '@/features/team/queries'
import type { CommissionOptions } from '@/features/users/components/UserDialog'
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

  const [agreement, comisiones, template] = await Promise.all([
    // Su acuerdo dice si pertenece a un equipo y con que regla cobra el; la
    // lista general, lo que recibiria un integrante por tramos (D-237). Van en
    // el mismo `Promise.all` que ya existia: la pantalla sigue costando UNA
    // espera antes de leer el equipo.
    getSellerAgreement(membership.organizationId, membership.profileId),
    getCommissionContext(),
    getCommissionTemplate(membership.organizationId),
  ])
  const raffle = comisiones.raffle
  const canAdd = agreement !== null && agreement.parentSellerId === null

  // Ventas y ganancia, de LA MISMA rifa (BR-G04). Mezclar «vendidas en todas
  // las rifas» con «ganado en esta» daria dos cifras que no se pueden comparar.
  //
  // Los limites de la seccion «Cómo le vas a pagar» (BR-G28) van en la misma
  // espera que el equipo, y solo si puede agregar: los pide la base a quien
  // lidera un equipo, y a nadie mas.
  const [members, limits] = await Promise.all([
    listTeamWithTotals(membership.profileId, raffle?.id),
    canAdd ? getTeamCommissionLimits(membership.organizationId) : Promise.resolve(null),
  ])

  const commissionOptions: CommissionOptions | null = limits
    ? {
        audience: 'team',
        tiers: template?.tiers ?? [],
        maxFixed: limits.maxFixed,
        parentTiered: agreement?.effective.mode === 'tiered',
        tieredDisabledReason:
          template === null ? EARNINGS_COPY.field.noTemplate : limits.templateProblem,
      }
    : null

  // Se suman aqui los totales que SQL ya calculo por integrante, igual que
  // `listSellersWithInventory` suma sus filas por rifa. No es calcular dinero en el
  // navegador —esto corre en el servidor y los sumandos vienen de la base—, y es
  // correcto porque la lista no esta paginada: un equipo cabe entero. Si algun
  // dia se pagina, estos dos totales tienen que pasar a SQL.
  const teamSales = members.reduce((total, member) => total + member.ticketsAssigned, 0)
  const teamCollected = members.reduce((total, member) => total + member.totalCollected, 0)

  // Lo que le deja el equipo a QUIEN MIRA (BR-G20). No se suma aqui: sale tal
  // cual de `seller_commissions`, que es la fuente que gobierna el dinero. Es la
  // cifra que contesta «¿para qué me sirve tener equipo?», y no aparecia en
  // ninguna pantalla.
  const propia = comisiones.bySeller.get(membership.profileId) ?? null
  const teamEarned = propia?.teamEarned ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi equipo"
        description={
          raffle
            ? `Cómo va tu equipo en ${raffle.name}. Cada vendedor trabaja con sus propias boletas.`
            : 'Los vendedores que agregas trabajan con sus propias boletas y tú ves cómo les va.'
        }
        compactAction={
          commissionOptions && members.length > 0 ? (
            <AddTeamMemberButton commission={commissionOptions} />
          ) : undefined
        }
      />

      {members.length === 0 ? (
        commissionOptions ? (
          <EmptyState
            icon={<UsersIcon className="size-8" aria-hidden />}
            title="Todavía no tienes vendedores en tu equipo"
            description="Agrega vendedores que te ayuden con las ventas. Cada uno maneja sus propias boletas y sus propios clientes, y tú ganas por cada boleta que cobren."
            action={<AddTeamMemberButton commission={commissionOptions} />}
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
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricCard label="Vendedores" value={members.length} />
              <MetricCard label="Boletas vendidas" value={teamSales} />
              <MetricCard label="Recaudado" value={formatCOP(teamCollected)} />
              {/* «Ganas tú» y no «Ganancia»: las otras tres cifras son del
                  equipo y esta es suya, y sin decirlo se leerian las cuatro
                  como si fueran lo mismo. */}
              <MetricCard label="Ganas tú" value={formatCOP(teamEarned)} />
            </div>
            {/* BR-G27: con tramos, lo que vende el equipo tambien lo sube de
                tramo. Es lo unico de esta pantalla que no se deduce mirandola,
                y solo es verdad para quien cobra por tramos. */}
            {agreement?.effective.mode === 'tiered' ? (
              <p className="text-muted-foreground text-body-small">
                {EARNINGS_COPY.seller.teamTierNote}
              </p>
            ) : null}
          </div>

          <TeamMemberList members={members} commissions={comisiones.bySeller} />
        </>
      )}
    </div>
  )
}
