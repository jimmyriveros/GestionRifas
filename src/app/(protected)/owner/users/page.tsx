import { DataTablePagination } from '@/components/data/DataTablePagination'
import { PageHeader } from '@/components/data/PageHeader'
import { CreateUserButton } from '@/features/users/components/CreateUserButton'
import { UsersTable } from '@/features/users/components/UsersTable'
import { listOrgMembersPage, MEMBER_SORT_COLUMNS } from '@/features/users/queries'
import { requireStaff } from '@/lib/auth/guards'
import { parseListSort } from '@/lib/list-sort'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const membership = await requireStaff()
  const params = await searchParams
  const requestedPage = Number.parseInt(single(params.page) ?? '1', 10)
  // Lo que no este en la lista blanca se ignora y manda el orden por defecto.
  const sort = parseListSort(single(params.sort), single(params.dir), MEMBER_SORT_COLUMNS)

  const { rows: members, total, page, pageSize } = await listOrgMembersPage(['owner', 'admin'], {
    page: Number.isNaN(requestedPage) ? 1 : requestedPage,
    sort,
  })

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
      <DataTablePagination total={total} page={page} pageSize={pageSize} items="admins" />
    </div>
  )
}
