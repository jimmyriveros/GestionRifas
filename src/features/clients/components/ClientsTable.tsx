'use client'

import type { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import { DataTable } from '@/components/data/DataTable'
import { Badge } from '@/components/ui/badge'
import { formatCOP } from '@/lib/money'

import type { ClientListItem } from '../queries'

const columns: ColumnDef<ClientListItem>[] = [
  {
    accessorKey: 'name',
    header: 'Cliente',
    cell: ({ row }) => (
      <div className="min-w-40">
        <Link href={`/owner/clients/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
        {row.original.alias ? (
          <p className="text-muted-foreground text-xs">{row.original.alias}</p>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: 'phone',
    header: 'Telefono',
    cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.phone}</span>,
  },
  {
    accessorKey: 'sellerName',
    header: 'Vendedor',
    meta: { hideOnMobile: true },
    cell: ({ row }) => (
      <Link href={`/owner/sellers/${row.original.sellerId}`} className="text-sm hover:underline">
        {row.original.sellerName}
      </Link>
    ),
  },
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
    cell: ({ row }) => <span className="tabular-nums">{formatCOP(row.original.totalPaid)}</span>,
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
]

export function ClientsTable({ clients }: { clients: ClientListItem[] }) {
  return (
    <DataTable
      columns={columns}
      data={clients}
      getRowId={(row) => row.id}
      caption="Clientes de la organizacion"
    />
  )
}
