'use client'

import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'
import { useMemo } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { ActiveBadge } from '@/components/data/StatusBadge'
import { UserRowActions } from '@/features/users/components/UserRowActions'
import type { AppRole } from '@/lib/constants'
import { formatCOP } from '@/lib/money'

import type { SellerWithTotals } from '../queries'

type SellersTableProps = {
  sellers: SellerWithTotals[]
  currentRole: AppRole
  currentProfileId: string
}

export function SellersTable({ sellers, currentRole, currentProfileId }: SellersTableProps) {
  const columns = useMemo<ColumnDef<SellerWithTotals>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Vendedor',
        cell: ({ row }) => (
          <div className="min-w-40">
            <Link
              href={`/owner/sellers/${row.original.profileId}`}
              className="font-medium hover:underline"
            >
              {row.original.fullName}
            </Link>
            <p className="text-muted-foreground text-xs">
              {row.original.alias ?? row.original.email}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'isActive',
        header: 'Estado',
        cell: ({ row }) => <ActiveBadge isActive={row.original.isActive} />,
      },
      {
        accessorKey: 'ticketsTotal',
        header: 'Boletas',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.ticketsTotal}</span>,
      },
      {
        accessorKey: 'ticketsAssigned',
        header: 'Vendidas',
        meta: { align: 'right', hideOnMobile: true },
        cell: ({ row }) => <span className="tabular-nums">{row.original.ticketsAssigned}</span>,
      },
      {
        accessorKey: 'ticketsPendingApproval',
        header: 'Por aprobar',
        meta: { align: 'right', hideOnMobile: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.ticketsPendingApproval}</span>
        ),
      },
      {
        accessorKey: 'totalSold',
        header: 'Vendido',
        meta: { align: 'right', hideOnMobile: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCOP(row.original.totalSold)}</span>
        ),
      },
      {
        accessorKey: 'pendingAmount',
        header: 'Saldo pendiente',
        meta: { align: 'right', hideOnMobile: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCOP(row.original.pendingAmount)}</span>
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
      data={sellers}
      getRowId={(row) => row.profileId}
      caption="Vendedores de la organizacion con sus indicadores"
    />
  )
}
