'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { EyeIcon } from 'lucide-react'
import { RowLink } from '@/components/data/RowLink'

import { DataTable } from '@/components/data/DataTable'
import { RaffleStatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

import type { RaffleSummary } from '../queries'

const columns: ColumnDef<RaffleSummary>[] = [
  {
    accessorKey: 'shortCode',
    header: 'Código',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.shortCode}</span>,
  },
  {
    accessorKey: 'name',
    header: 'Rifa',
    cell: ({ row }) => (
      <RowLink href={`/owner/raffles/${row.original.id}`} className="font-medium hover:underline">
        {row.original.name}
      </RowLink>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ row }) => <RaffleStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'ticketPrice',
    header: 'Precio',
    meta: { align: 'right' },
    cell: ({ row }) => <span className="tabular-nums">{formatCOP(row.original.ticketPrice)}</span>,
  },
  {
    accessorKey: 'ticketsTotal',
    header: 'Boletas',
    meta: { hideOnMobile: true, align: 'right' },
    cell: ({ row }) => <span className="tabular-nums">{row.original.ticketsTotal}</span>,
  },
  {
    accessorKey: 'ticketsAssigned',
    header: 'Asignadas',
    meta: { hideOnMobile: true, align: 'right' },
    cell: ({ row }) => <span className="tabular-nums">{row.original.ticketsAssigned}</span>,
  },
  {
    accessorKey: 'startDate',
    header: 'Vigencia',
    meta: { hideOnMobile: true },
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm whitespace-nowrap">
        {formatDateEs(row.original.startDate)} — {formatDateEs(row.original.endDate)}
      </span>
    ),
  },
  {
    id: 'actions',
    // Una sola accion en la columna: «Acción», igual que en el historial de
    // abonos (D-114).
    header: 'Acción',
    enableSorting: false,
    meta: { align: 'right' },
    cell: ({ row }) => (
      <Button asChild variant="ghost" size="sm">
        <RowLink href={`/owner/raffles/${row.original.id}`}>
          <EyeIcon className="size-4" aria-hidden />
          Ver
        </RowLink>
      </Button>
    ),
  },
]

export function RafflesTable({ raffles }: { raffles: RaffleSummary[] }) {
  return (
    <DataTable
      columns={columns}
      data={raffles}
      getRowId={(row) => row.id}
      rowHref={(row) => `/owner/raffles/${row.id}`}
      caption="Listado de rifas de la organización"
    />
  )
}
