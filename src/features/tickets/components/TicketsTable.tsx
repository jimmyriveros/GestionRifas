'use client'

import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import Link from 'next/link'
import { useMemo } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { SelectionCheckbox } from '@/components/form/SelectionCheckbox'
import { useOptionalTicketSelection } from '@/features/tickets/selection/TicketSelectionContext'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'

import type { TicketListItem } from '../queries'

type TicketsTableProps = {
  tickets: TicketListItem[]
  /** `/owner/tickets` o `/seller/tickets`: la tabla sirve a los dos portales. */
  basePath?: string
  /** El vendedor no necesita la columna «Vendedor»: todas las boletas son suyas. */
  showSeller?: boolean
}

/**
 * Tabla de boletas de los dos portales.
 *
 * La seleccion multiple es OPCIONAL: la columna de casillas aparece solo si la
 * tabla esta dentro de un `TicketSelectionProvider`. Las boletas de un cliente,
 * que se listan con esta misma tabla dentro de su ficha, no la necesitan y no
 * la muestran.
 *
 * En escritorio la columna esta siempre y la fila sigue abriendo el detalle. En
 * el telefono la columna aparece solo en modo seleccion, y entonces la fila
 * entera marca en vez de abrir (secciones 3 y 19 del encargo). Que la columna se
 * vea o no lo decide Tailwind, no JavaScript: asi no parpadea al cargar.
 */
export function TicketsTable({
  tickets,
  basePath = '/owner/tickets',
  showSeller = true,
}: TicketsTableProps) {
  const selection = useOptionalTicketSelection()

  const columns = useMemo<ColumnDef<TicketListItem>[]>(() => {
    const selectColumn: ColumnDef<TicketListItem>[] = selection
      ? [
          {
            id: 'select',
            enableSorting: false,
            // La columna esta siempre en escritorio y, en el telefono, solo en
            // modo seleccion. Se reutiliza `hideOnMobile`, que ya existe: es una
            // clase de Tailwind, asi que la decide el navegador sin JavaScript.
            meta: { hideOnMobile: !selection.selectionMode },
            header: () => (
              <SelectionCheckbox
                checked={
                  selection.pageAllSelected
                    ? true
                    : selection.pageSomeSelected
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(checked) => selection.togglePage(checked)}
                label="Seleccionar las boletas de esta página"
              />
            ),
            cell: ({ row }) => (
              <SelectionCheckbox
                checked={selection.isSelected(row.original.id)}
                onCheckedChange={() => selection.toggle(row.original.id)}
                label={`Seleccionar la boleta ${ticketLabel(row.original)}`}
              />
            ),
          },
        ]
      : []

    const sellerColumn: ColumnDef<TicketListItem>[] = showSeller
      ? [
          {
            accessorKey: 'sellerName',
            header: 'Vendedor',
            meta: { hideOnMobile: true },
            cell: ({ row }) => <span className="text-sm">{row.original.sellerName}</span>,
          },
        ]
      : []

    return [
      ...selectColumn,
      /*
        Los dos numeros son lo primero que se ve, y en columnas separadas: asi
        se recorre la lista con la vista por una sola de ellas, que es como se
        busca de verdad. El codigo interno no aparece aqui —vive en el detalle,
        junto al resto de la informacion administrativa (BR-N11)—, pero la fila
        se sigue abriendo por su `id`, igual que antes.

        El enlace se conserva sobre el numero diario, aunque la fila entera sea
        pulsable: da el menu contextual, «abrir en otra pestana» y una parada de
        teclado con nombre (ver DataTable).
      */
      {
        accessorKey: 'dailyNumber',
        // El encabezado se deja partir en dos lineas (`whitespace-normal` gana
        // al `nowrap` de la celda): en un telefono, «Número diario» y «Número
        // semanal» en una sola linea empujan la columna «Estado» fuera de la
        // pantalla.
        header: () => <span className="whitespace-normal">Número diario</span>,
        cell: ({ row }) => (
          <Link
            href={`${basePath}/${row.original.id}`}
            className="font-mono text-base font-medium tabular-nums hover:underline"
            aria-label={`Ver la boleta ${ticketLabel(row.original)}`}
          >
            {row.original.dailyNumber ?? '—'}
          </Link>
        ),
      },
      {
        accessorKey: 'weeklyNumber',
        header: () => <span className="whitespace-normal">Número semanal</span>,
        cell: ({ row }) => (
          <span className="font-mono text-base tabular-nums">
            {row.original.weeklyNumber ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'raffleShortCode',
        header: 'Rifa',
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <span className="text-sm" title={row.original.raffleName}>
            {row.original.raffleShortCode}
          </span>
        ),
      },
      ...sellerColumn,
      {
        accessorKey: 'clientName',
        header: 'Cliente',
        meta: { hideOnMobile: true },
        cell: ({ row }) => <span className="text-sm">{row.original.clientName ?? '—'}</span>,
      },
      {
        accessorKey: 'inventoryStatus',
        header: 'Estado',
        cell: ({ row }) => <InventoryStatusBadge status={row.original.inventoryStatus} />,
      },
      {
        accessorKey: 'paymentStatus',
        header: 'Pago',
        meta: { hideOnMobile: true },
        cell: ({ row }) =>
          row.original.inventoryStatus === 'assigned' ? (
            <PaymentStatusBadge status={row.original.paymentStatus} />
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          ),
      },
      {
        accessorKey: 'salePrice',
        header: 'Precio',
        meta: { align: 'right', hideOnMobile: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.salePrice === null ? '—' : formatCOP(row.original.salePrice)}
          </span>
        ),
      },
    ]
  }, [basePath, showSeller, selection])

  // TanStack necesita el mapa `{ id: true }` para pintar `data-state=selected`;
  // la verdad sigue siendo la lista de ids del contexto.
  const rowSelection = useMemo<RowSelectionState | undefined>(() => {
    if (!selection) return undefined
    const state: RowSelectionState = {}
    for (const ticket of tickets) {
      if (selection.isSelected(ticket.id)) state[ticket.id] = true
    }
    return state
  }, [selection, tickets])

  return (
    <DataTable
      columns={columns}
      data={tickets}
      getRowId={(row) => row.id}
      rowSelection={rowSelection}
      rowHref={(row) => `${basePath}/${row.id}`}
      onRowSelect={selection?.rowClickSelects ? (row) => selection.toggle(row.id) : undefined}
      onRowLongPress={
        selection && selection.compact && !selection.selectionMode
          ? (row) => selection.startSelectionMode(row.id)
          : undefined
      }
      caption="Boletas"
    />
  )
}
