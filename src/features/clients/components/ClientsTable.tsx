'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { RowLink } from '@/components/data/RowLink'
import { useMemo } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { Badge } from '@/components/ui/badge'
import { formatCOP } from '@/lib/money'

import type { ClientListItem } from '../queries'

type ClientsTableProps = {
  clients: ClientListItem[]
  /** `/owner/clients` o `/seller/clients`: la tabla sirve a los dos portales. */
  basePath: string
  /** El vendedor no necesita una columna «Vendedor»: todos son suyos. */
  showSeller?: boolean
}

export function ClientsTable({ clients, basePath, showSeller = false }: ClientsTableProps) {
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

    if (showSeller) {
      base.push({
        accessorKey: 'sellerName',
        header: 'Vendedor',
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <RowLink
            href={`/owner/sellers/${row.original.sellerId}`}
            className="text-sm hover:underline"
          >
            {row.original.sellerName}
          </RowLink>
        ),
      })
    }

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
        cell: ({ row }) =>
          row.original.archivedAt ? (
            <Badge variant="secondary">Archivado</Badge>
          ) : (
            <span className="text-muted-foreground text-sm">Activo</span>
          ),
      },
    )

    return base
  }, [basePath, showSeller])

  return (
    <DataTable
      columns={columns}
      data={clients}
      getRowId={(row) => row.id}
      rowHref={(row) => `${basePath}/${row.id}`}
      caption="Clientes"
    />
  )
}
