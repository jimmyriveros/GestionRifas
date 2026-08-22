'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { RowLink } from '@/components/data/RowLink'
import { useMemo } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { AccountStatusBadge } from '@/components/data/StatusBadge'
import { UserRowActions } from '@/features/users/components/UserRowActions'
import type { AppRole } from '@/lib/constants'
import { formatCOP } from '@/lib/money'

import type { SellerWithTotals } from '../queries'

type SellersTableProps = {
  sellers: SellerWithTotals[]
  currentRole: AppRole
  currentProfileId: string
  /** Cuantos integrantes tiene el equipo de cada vendedor (BR-E08). */
  teamSizes: Map<string, number>
  /** Nombre del vendedor a cargo, para quien pertenece al equipo de alguien. */
  parentNames: Map<string, string>
  /** Ganancia acumulada por vendedor en la rifa actual, ya calculada en SQL. */
  earnings: Map<string, number>
}

export function SellersTable({
  sellers,
  currentRole,
  currentProfileId,
  teamSizes,
  parentNames,
  earnings,
}: SellersTableProps) {
  const columns = useMemo<ColumnDef<SellerWithTotals>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Vendedor',
        cell: ({ row }) => (
          <div className="min-w-40">
            <RowLink
              href={`/owner/sellers/${row.original.profileId}`}
              className="font-medium hover:underline"
            >
              {row.original.fullName}
            </RowLink>
            <p className="text-muted-foreground text-xs">
              {row.original.alias ?? row.original.email}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'isActive',
        header: 'Estado',
        cell: ({ row }) => (
          <AccountStatusBadge
            isActive={row.original.isActive}
            activatedAt={row.original.activatedAt}
          />
        ),
      },
      {
        id: 'team',
        header: 'Equipo',
        enableSorting: false,
        // Tres situaciones distintas y ninguna ambigua: tiene equipo, pertenece
        // al de alguien, o ni una cosa ni la otra (BR-E08).
        cell: ({ row }) => {
          const size = teamSizes.get(row.original.profileId) ?? 0
          if (size > 0) {
            return (
              <span className="text-sm">
                {size} {size === 1 ? 'vendedor' : 'vendedores'}
              </span>
            )
          }
          const parent = row.original.parentSellerId
            ? parentNames.get(row.original.parentSellerId)
            : undefined
          return parent ? (
            <span className="text-muted-foreground text-sm">Con {parent}</span>
          ) : (
            <span className="text-muted-foreground text-sm">Sin equipo</span>
          )
        },
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
        id: 'earned',
        header: 'Ganancia',
        meta: { align: 'right', hideOnMobile: true },
        // Todos ganan; lo que cambia es CON QUE REGLA (BR-G13). El importe se
        // muestra igual para los dos, y el detalle del vendedor explica cual se
        // le aplica: aqui una raya seria esconder dinero que si se debe.
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatCOP(earnings.get(row.original.profileId) ?? 0)}
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
    [currentRole, currentProfileId, teamSizes, parentNames, earnings],
  )

  return (
    <DataTable
      columns={columns}
      data={sellers}
      getRowId={(row) => row.profileId}
      rowHref={(row) => `/owner/sellers/${row.profileId}`}
      caption="Vendedores de la organización con sus indicadores"
    />
  )
}
