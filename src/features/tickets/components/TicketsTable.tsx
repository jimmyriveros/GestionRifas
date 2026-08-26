'use client'

import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { RowLink } from '@/components/data/RowLink'
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
  /** Se oculta donde se opera una sola rifa: el portal del vendedor (D-088). */
  showRaffle?: boolean
  /** Se apaga en la ficha de UN cliente: ahi todas las boletas son suyas (D-113). */
  showClient?: boolean
  /** Se pasa al contenedor de la tabla; la aplana dentro de una tarjeta. */
  className?: string
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
/**
 * «Núm. diario» y «Núm. semanal» en la cabecera de la tabla (D-114).
 *
 * SE VE abreviado y SE OYE entero. La abreviatura es lo unico que cabe en el
 * ancho de la columna —«Número diario» partia en dos lineas y empujaba «Estado»
 * fuera de la pantalla en un telefono—, pero el termino del glosario es «numero
 * diario», y quien escucha la pantalla debe oir ese, no «num punto».
 *
 * Es el mismo recurso que la paginacion usa con «Página» (D-111): lo visible se
 * marca `aria-hidden` y la palabra entera viaja en un `sr-only`. Como el texto
 * `sr-only` SI cuenta para el nombre accesible, el encabezado se sigue llamando
 * «Número diario» para un lector de pantalla —y para las pruebas que lo buscan
 * por ese nombre.
 */
function NumberHeader({ cual }: { cual: 'diario' | 'semanal' }) {
  return (
    <span className="whitespace-normal">
      <span aria-hidden>Núm.</span>
      <span className="sr-only">Número</span> {cual}
    </span>
  )
}

export function TicketsTable({
  tickets,
  basePath = '/owner/tickets',
  showSeller = true,
  showRaffle = true,
  showClient = true,
  className,
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

    const raffleColumn: ColumnDef<TicketListItem>[] = showRaffle
      ? [
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
        ]
      : []

    const clientColumn: ColumnDef<TicketListItem>[] = showClient
      ? [
          {
            accessorKey: 'clientName',
            header: 'Cliente',
            meta: { hideOnMobile: true },
            cell: ({ row }) => <span className="text-sm">{row.original.clientName ?? '—'}</span>,
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
        header: () => <NumberHeader cual="diario" />,
        cell: ({ row }) => (
          <RowLink
            href={`${basePath}/${row.original.id}`}
            className="font-mono text-base font-medium tabular-nums hover:underline"
            aria-label={`Ver la boleta ${ticketLabel(row.original)}`}
          >
            {row.original.dailyNumber ?? '—'}
          </RowLink>
        ),
      },
      {
        accessorKey: 'weeklyNumber',
        header: () => <NumberHeader cual="semanal" />,
        cell: ({ row }) => (
          <span className="font-mono text-base tabular-nums">
            {row.original.weeklyNumber ?? '—'}
          </span>
        ),
      },
      ...raffleColumn,
      ...sellerColumn,
      ...clientColumn,
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
  }, [basePath, showSeller, showRaffle, showClient, selection])

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
      className={className}
    />
  )
}
