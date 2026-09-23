'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { RowLink } from '@/components/data/RowLink'
import { useMemo } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { useListSort } from '@/components/data/use-list-sort'
import { formatCOP } from '@/lib/money'

import type { ClientListItem } from '../queries'
import { ClientStatusBadge } from '@/components/data/StatusBadge'

type ClientsTableProps = {
  clients: ClientListItem[]
  /** `/seller/clients`: solo el vendedor ve clientes, y solo los suyos (D-198). */
  basePath: string
}

/**
 * Tabla de clientes de «Mis clientes».
 *
 * Por debajo de `md` no hay tabla: hay tarjetas (`ClientCardList`). Las
 * pantallas no llaman a esta tabla directamente —pasan por `ClientsList`—,
 * para que las dos presentaciones reciban el mismo arreglo (D-136).
 */

export function ClientsTable({ clients, basePath }: ClientsTableProps) {
  const { sort, toggle } = useListSort()

  const columns = useMemo<ColumnDef<ClientListItem>[]>(() => {
    const base: ColumnDef<ClientListItem>[] = [
      {
        accessorKey: 'name',
        header: 'Cliente',
        cell: ({ row }) => (
          <div className="min-w-40">
            <RowLink
              href={`${basePath}/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.name}
            </RowLink>
            {row.original.alias ? (
              <p className="text-muted-foreground text-xs">{row.original.alias}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Teléfono',
        cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.phone}</span>,
      },
    ]

    base.push(
      {
        accessorKey: 'ticketsCount',
        header: 'Boletas',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums">{row.original.ticketsCount}</span>,
      },
      {
        accessorKey: 'totalPurchased',
        header: 'Comprado',
        meta: { align: 'right', hideOnMobile: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCOP(row.original.totalPurchased)}</span>
        ),
      },
      {
        accessorKey: 'totalPaid',
        header: 'Pagado',
        meta: { align: 'right', hideOnMobile: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCOP(row.original.totalPaid)}</span>
        ),
      },
      {
        accessorKey: 'pendingAmount',
        header: 'Saldo',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCOP(row.original.pendingAmount)}</span>
        ),
      },
      {
        accessorKey: 'archivedAt',
        header: 'Estado',
        meta: { hideOnMobile: true },
        cell: ({ row }) => <ClientStatusBadge archived={row.original.archivedAt !== null} />,
      },
    )

    return base
  }, [basePath])

  return (
    <DataTable
      columns={columns}
      data={clients}
      getRowId={(row) => row.id}
      rowHref={(row) => `${basePath}/${row.id}`}
      caption="Clientes"
      // El orden viaja en la URL y lo aplica la base sobre el conjunto
      // filtrado entero, no esta tabla sobre la pagina servida (P1-B).
      sort={sort}
      onSortToggle={toggle}
    />
  )
}
