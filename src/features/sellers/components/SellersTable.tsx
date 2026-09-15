'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { RowLink } from '@/components/data/RowLink'
import { useMemo } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { AccountStatusBadge } from '@/components/data/StatusBadge'
import { UserRowActions } from '@/features/users/components/UserRowActions'
import type { AppRole } from '@/lib/constants'

import type { SellerWithInventory } from '../queries'

type SellersTableProps = {
  sellers: SellerWithInventory[]
  currentRole: AppRole
  currentProfileId: string
  /** Cuantos integrantes tiene el equipo de cada vendedor (BR-E08). */
  teamSizes: Map<string, number>
  /** Nombre del vendedor a cargo, para quien pertenece al equipo de alguien. */
  parentNames: Map<string, string>
}

/**
 * Vendedores con sus recuentos. Sin «Vendido», «Saldo pendiente» ni «Ganancia»
 * desde D-198: son cifras de la cartera del vendedor, y la fila ya no las trae.
 */
export function SellersTable({
  sellers,
  currentRole,
  currentProfileId,
  teamSizes,
  parentNames,
}: SellersTableProps) {
  const columns = useMemo<ColumnDef<SellerWithInventory>[]>(
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
        id: 'actions',
        // Plural: esta columna abre un MENU con varias opciones, y «Acciones»
        // es la palabra que ya usa el propio boton (D-114).
        header: 'Acciones',
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
    [currentRole, currentProfileId, teamSizes, parentNames],
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
