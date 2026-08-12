import { UsersIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { AddTeamMemberButton } from '@/features/team/components/AddTeamMemberButton'
import { TeamMemberList } from '@/features/team/components/TeamMemberList'
import { isTeamMember, listTeamMembers } from '@/features/team/queries'
import { requireRole } from '@/lib/auth/guards'

/**
 * «Mi equipo» — visible para TODO vendedor, tenga equipo o no (BR-E01).
 *
 * Un vendedor que ya pertenece al equipo de alguien no puede formar el suyo
 * (BR-E03, dos niveles). La pantalla se lo dice con palabras en vez de ofrecerle
 * un boton que la base de datos va a rechazar.
 */
export default async function TeamPage() {
  const membership = await requireRole(['seller'])

  const [members, belongsToTeam] = await Promise.all([
    listTeamMembers(membership.profileId),
    isTeamMember(membership.profileId),
  ])

  const canAdd = !belongsToTeam

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi equipo"
        description="Los vendedores que agregas trabajan con sus propias boletas y tú ves cómo les va."
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
        <TeamMemberList members={members} />
      )}
    </div>
  )
}
