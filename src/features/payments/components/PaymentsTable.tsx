'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { EyeIcon } from 'lucide-react'
import { RowLink } from '@/components/data/RowLink'
import { useMemo, useState } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { useListSort } from '@/components/data/use-list-sort'
import { Button } from '@/components/ui/button'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'

import type { PaymentListItem } from '../queries'
import { PaymentDetailDialog } from './PaymentDetailDialog'
import { StatusBadge } from '@/components/data/StatusBadge'

type PaymentsTableProps = {
  payments: PaymentListItem[]
  /** `/seller/clients`: enlaza al perfil del cliente (D-198: solo el vendedor ve pagos). */
  clientBasePath: string
  /**
   * Se apaga dentro de la ficha de UN cliente: ahi la columna repetiria el
   * mismo nombre en todas las filas, y ese nombre ya esta en el titulo.
   */
  showClient?: boolean
  /** Se pasa a la tabla; sirve para aplanarla dentro de una `TableSection`. */
  className?: string
  /**
   * `true` SOLO donde la lista pagina en el servidor: «Mis pagos» (P1-B).
   *
   * En la ficha de un cliente esta misma tabla recibe los pagos de ESE cliente
   * ya completos —`listClientPayments`, sin paginar—, asi que ahi ordenar en el
   * navegador es correcto y pedir el orden a la base seria escribir un
   * parametro en la URL que nadie lee. El valor por defecto es el seguro.
   */
  serverSorted?: boolean
}

export function PaymentsTable({
  payments,
  clientBasePath,
  showClient = true,
  className,
  serverSorted = false,
}: PaymentsTableProps) {
  const [selected, setSelected] = useState<PaymentListItem | null>(null)
  const { sort, toggle } = useListSort()

  const columns = useMemo<ColumnDef<PaymentListItem>[]>(() => {
    const clientColumn: ColumnDef<PaymentListItem>[] = showClient
      ? [
          {
            accessorKey: 'clientName',
            header: 'Cliente',
            cell: ({ row }) => (
              <RowLink
                href={`${clientBasePath}/${row.original.clientId}`}
                className="font-medium hover:underline"
              >
                {row.original.clientName}
              </RowLink>
            ),
          },
        ]
      : []

    return [
      {
        accessorKey: 'paymentDate',
        header: 'Fecha',
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap">
            {formatDateEs(row.original.paymentDate)}
          </span>
        ),
      },
      ...clientColumn,
      {
        accessorKey: 'totalAmount',
        header: 'Valor',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span
            className={cnAmount(row.original.isActive)}
            title={row.original.isActive ? undefined : 'Pago anulado: no cuenta en los saldos'}
          >
            {formatCOP(row.original.totalAmount)}
          </span>
        ),
      },
      {
        id: 'tickets',
        header: 'Boletas',
        enableSorting: false,
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-sm tabular-nums">
            {row.original.allocations.length === 1 && row.original.allocations[0]
              ? ticketLabel(row.original.allocations[0])
              : `${row.original.allocations.length} boletas`}
          </span>
        ),
      },
      {
        accessorKey: 'paymentMethod',
        header: 'Método',
        meta: { hideOnMobile: true },
        cell: ({ row }) => (
          <span className="text-sm">{PAYMENT_METHOD_LABELS[row.original.paymentMethod]}</span>
        ),
      },
      {
        accessorKey: 'isActive',
        header: 'Estado',
        cell: ({ row }) =>
          row.original.isActive ? (
            <StatusBadge tone="success">Activo</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Anulado</StatusBadge>
          ),
      },
      {
        id: 'actions',
        // Una columna sin rotulo no la puede nombrar quien escucha la pantalla,
        // y aqui hay UNA accion: «Acción», en singular (D-114).
        header: 'Acción',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(row.original)}
            aria-label={`Ver el pago de ${row.original.clientName} del ${formatDateEs(row.original.paymentDate)}`}
          >
            <EyeIcon className="size-4" aria-hidden />
            Ver
          </Button>
        ),
      },
    ]
  }, [clientBasePath, showClient])

  return (
    <>
      <DataTable
        columns={columns}
        data={payments}
        getRowId={(row) => row.id}
        onRowActivate={(row) => setSelected(row)}
        caption="Historial de pagos"
        className={className}
        // El orden viaja en la URL y lo aplica la base sobre el conjunto
        // filtrado entero, no esta tabla sobre las filas que tiene (P1-B).
        // Sin `serverSorted` se mantiene el orden en el navegador, que es lo
        // correcto donde la lista llega completa.
        sort={serverSorted ? sort : undefined}
        onSortToggle={serverSorted ? toggle : undefined}
      />

      <PaymentDetailDialog
        payment={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      />
    </>
  )
}

/** Un pago anulado se muestra tachado: sigue en el historial, pero no suma. */
function cnAmount(isActive: boolean): string {
  return isActive ? 'tabular-nums' : 'text-muted-foreground tabular-nums line-through'
}
