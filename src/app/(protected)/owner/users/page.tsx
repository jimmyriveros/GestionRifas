import { PageHeader } from '@/components/data/PageHeader'
import { CreateUserButton } from '@/features/users/components/CreateUserButton'
import { UsersTable } from '@/features/users/components/UsersTable'
import { listOrgMembers } from '@/features/users/queries'
import { requireStaff } from '@/lib/auth/guards'

export default async function UsersPage() {
  const membership = await requireStaff()
  const members = await listOrgMembers(['owner', 'admin'])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administradores"
        description="Personas con acceso al portal administrativo. Un administrador no puede editar ni desactivar al dueño de la organización."
        compactAction={<CreateUserButton role="admin" label="Nuevo administrador" />}
      />

      <UsersTable
        members={members}
        currentRole={membership.role}
        currentProfileId={membership.profileId}
      />
    </div>
  )
}
