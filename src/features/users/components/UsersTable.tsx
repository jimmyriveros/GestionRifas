'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { ActiveBadge } from '@/components/data/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { ROLE_LABELS, type AppRole } from '@/lib/constants'
import { formatDateEs } from '@/lib/dates'

import type { OrgMember } from '../queries'
import { UserRowActions } from './UserRowActions'

type UsersTableProps = {
  members: OrgMember[]
  currentRole: AppRole
  currentProfileId: string
}

export function UsersTable({ members, currentRole, currentProfileId }: UsersTableProps) {
  const columns = useMemo<ColumnDef<OrgMember>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Nombre',
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="font-medium">{row.original.fullName}</p>
            {row.original.alias ? (
              <p className="text-muted-foreground text-xs">{row.original.alias}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Rol',
        cell: ({ row }) => <Badge variant="secondary">{ROLE_LABELS[row.original.role]}</Badge>,
      },
      {
        accessorKey: 'email',
        header: 'Correo',
        meta: { hideOnMobile: true },
        cell: ({ row }) => <span className="text-sm">{row.original.email}</span>,
      },
      {
        accessorKey: 'phone',
        header: 'Telefono',
        meta: { hideOnMobile: true },
        cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.phone}</span>,
      },
      {
        accessorKey: 'isActive',
        header: 'Estado',
        cell: ({ row }) => <ActiveBadge isActive={row.original.isActive} />,
      },
      {
        accessorKey: 'createdAt',
        header: 'Alta',
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {formatDateEs(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <UserRowActions
            member={row.original}
            currentRole={currentRole}
            currentProfileId={currentProfileId}
          />
        ),
      },
    ],
    [currentRole, currentProfileId],
  )

  return (
    <DataTable
      columns={columns}
      data={members}
      getRowId={(row) => row.profileId}
      caption="Usuarios administrativos de la organizacion"
    />
  )
}
