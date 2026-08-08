'use client'

import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { DataTable } from '@/components/data/DataTable'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'

import { approveTickets } from '../actions'
import type { TicketListItem } from '../queries'

type TicketsTableProps = {
  tickets: TicketListItem[]
  /** `/owner/tickets` o `/seller/tickets`: la tabla sirve a los dos portales. */
  basePath?: string
  /** El vendedor no necesita la columna «Vendedor»: todas las boletas son suyas. */
  showSeller?: boolean
  /**
   * Aprobacion en lote. Solo el portal administrativo la ofrece (BR-I09): un
   * vendedor no puede aprobar ni sus propias boletas, asi que mostrarle las
   * casillas seria prometerle algo que el servidor rechaza.
   */
  enableApproval?: boolean
}

export function TicketsTable({
  tickets,
  basePath = '/owner/tickets',
  showSeller = true,
  enableApproval = true,
}: TicketsTableProps) {
  const router = useRouter()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])
  const approvableCount = enableApproval
    ? tickets.filter((ticket) => ticket.inventoryStatus === 'pending_approval').length
    : 0

  const columns = useMemo<ColumnDef<TicketListItem>[]>(() => {
    const selectColumn: ColumnDef<TicketListItem>[] = enableApproval
      ? [
          {
            id: 'select',
            header: () => <span className="sr-only">Seleccionar</span>,
            enableSorting: false,
            cell: ({ row }) =>
              row.getCanSelect() ? (
                <Checkbox
                  checked={row.getIsSelected()}
                  onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
                  aria-label={`Seleccionar la boleta ${ticketLabel(row.original)}`}
                />
              ) : null,
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
  }, [basePath, showSeller, enableApproval])

  function confirmApprove() {
    startTransition(async () => {
      const result = await approveTickets({ ticketIds: selectedIds })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(
          result.data.count === 1
            ? 'Se aprobó 1 boleta.'
            : `Se aprobaron ${result.data.count} boletas.`,
        )
        setRowSelection({})
        router.refresh()
      }
      setConfirmOpen(false)
    })
  }

  return (
    <div className="space-y-3">
      {approvableCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {selectedIds.length === 0
              ? `${approvableCount} boleta(s) pendientes de aprobación en esta página.`
              : `${selectedIds.length} seleccionada(s).`}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={selectedIds.length === 0 || isPending}
            onClick={() => setConfirmOpen(true)}
          >
            Aprobar seleccionadas
          </Button>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={tickets}
        getRowId={(row) => row.id}
        rowSelection={enableApproval ? rowSelection : undefined}
        onRowSelectionChange={enableApproval ? setRowSelection : undefined}
        enableRowSelection={
          enableApproval ? (row) => row.inventoryStatus === 'pending_approval' : false
        }
        rowHref={(row) => `${basePath}/${row.id}`}
        caption="Boletas"
      />

      {enableApproval ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Aprobar boletas"
          description={`Las ${selectedIds.length} boleta(s) seleccionadas pasarán a estado Disponible y podrán asignarse a clientes.`}
          confirmLabel="Aprobar"
          pending={isPending}
          onConfirm={confirmApprove}
        />
      ) : null}
    </div>
  )
}
