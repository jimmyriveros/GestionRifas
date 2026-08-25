'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { RowLink } from '@/components/data/RowLink'
import { useMemo, useState } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'

import type { PaymentListItem } from '../queries'
import { PaymentDetailDialog } from './PaymentDetailDialog'

type PaymentsTableProps = {
  payments: PaymentListItem[]
  /** `/owner/clients` o `/seller/clients`: enlaza al perfil del cliente. */
  clientBasePath: string
  /** El portal del vendedor no muestra la columna «Vendedor». */
  showSeller?: boolean
  /**
   * Se apaga dentro de la ficha de UN cliente: ahi la columna repetiria el
   * mismo nombre en todas las filas, y ese nombre ya esta en el titulo.
   */
  showClient?: boolean
  /** BR-F10: solo Owner y Admin pueden anular. */
  canVoid?: boolean
  /** Se pasa a la tabla; sirve para aplanarla dentro de una `TableSection`. */
  className?: string
}

export function PaymentsTable({
  payments,
  clientBasePath,
  showSeller = false,
  showClient = true,
  canVoid = false,
  className,
}: PaymentsTableProps) {
  const [selected, setSelected] = useState<PaymentListItem | null>(null)

  const columns = useMemo<ColumnDef<PaymentListItem>[]>(() => {
    const sellerColumn: ColumnDef<PaymentListItem>[] = showSeller
      ? [
          {
            accessorKey: 'sellerName',
            header: 'Vendedor',
            meta: { hideOnMobile: true },
            cell: ({ row }) => (
              <span className="text-sm">{row.original.sellerName ?? 'Otro vendedor'}</span>
            ),
          },
        ]
      : []

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
      ...sellerColumn,
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
            <Badge
              variant="outline"
              className="border-emerald-300 text-emerald-900 dark:text-emerald-200"
            >
              Activo
            </Badge>
          ) : (
            <Badge variant="outline" className="border-rose-300 text-rose-900 dark:text-rose-200">
              Anulado
            </Badge>
          ),
      },
      {
        id: 'actions',
        header: '',
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
            Ver
          </Button>
        ),
      },
    ]
  }, [clientBasePath, showSeller, showClient])

  return (
    <>
      <DataTable
        columns={columns}
        data={payments}
        getRowId={(row) => row.id}
        onRowActivate={(row) => setSelected(row)}
        caption="Historial de pagos"
        className={className}
      />

      <PaymentDetailDialog
        payment={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        canVoid={canVoid}
      />
    </>
  )
}

/** Un pago anulado se muestra tachado: sigue en el historial, pero no suma. */
function cnAmount(isActive: boolean): string {
  return isActive ? 'tabular-nums' : 'text-muted-foreground tabular-nums line-through'
}
