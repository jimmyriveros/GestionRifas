'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { PaymentProgressBar } from '@/components/data/PaymentProgressBar'
import { RowChevron } from '@/components/data/RowChevron'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { formatCOP } from '@/lib/money'

import { ticketFinancials } from '../financials'
import { TicketNumbersCell } from './TicketNumbers'

import type { TicketListItem } from '../queries'

type ClientTicketsTableProps = {
  tickets: TicketListItem[]
  /** `/owner/tickets` o `/seller/tickets`. */
  basePath: string
  /** Solo el portal administrativo: un cliente puede comprar en varias rifas. */
  showRaffle?: boolean
  /** Solo el portal administrativo, que ve la cartera de toda la organizacion. */
  showSeller?: boolean
  className?: string
}

/**
 * «Boletas de este cliente», en escritorio.
 *
 * ES OTRA TABLA QUE LA DE «MIS BOLETAS», A PROPOSITO. Aqui no se recorren
 * cientos de boletas buscando una: se miran las tres o cuatro de una persona
 * para decidir cuanto cobrarle. Eso cambia lo que debe verse y con que tamaño:
 *
 *   * NO se repite el cliente en cada fila —es el dueño de la ficha (D-113)—,
 *     y ese ancho se le devuelve a las cifras.
 *   * La barra vive DENTRO de «Estado de pago», debajo de su insignia, en vez
 *     de tener columna propia: son la misma idea contada dos veces.
 *   * Cada cifra lleva su «de $120.000» debajo, el mismo recurso del detalle de
 *     la boleta (D-124): sin el hay que buscar el precio para saber si «$50.000
 *     pendientes» es mucho o poco.
 *   * «Saldo pendiente» se escribe entero. En «Mis boletas» esa columna se
 *     llama «Falta» porque no cabe mas; aqui si cabe, y el termino del glosario
 *     es este.
 *
 * LAS CUENTAS SON LAS MISMAS. Salen de `ticketFinancials`, igual que en «Mis
 * boletas» y en el detalle: la boleta 0717 / 4992 enseña el mismo abonado, el
 * mismo saldo y el mismo porcentaje en las tres pantallas.
 */
export function ClientTicketsTable({
  tickets,
  basePath,
  showRaffle = false,
  showSeller = false,
  className,
}: ClientTicketsTableProps) {
  const columns = useMemo<ColumnDef<TicketListItem>[]>(() => {
    const raffleColumn: ColumnDef<TicketListItem>[] = showRaffle
      ? [
          {
            accessorKey: 'raffleShortCode',
            header: 'Rifa',
            meta: { showFrom: 'lg' },
            cell: ({ row }) => (
              <span className="text-sm" title={row.original.raffleName}>
                {row.original.raffleShortCode}
              </span>
            ),
          },
        ]
      : []

    const sellerColumn: ColumnDef<TicketListItem>[] = showSeller
      ? [
          {
            accessorKey: 'sellerName',
            header: 'Vendedor',
            meta: { showFrom: 'lg' },
            cell: ({ row }) => <span className="text-sm">{row.original.sellerName}</span>,
          },
        ]
      : []

    return [
      {
        accessorKey: 'dailyNumber',
        header: 'Boleta',
        cell: ({ row }) => (
          <TicketNumbersCell ticket={row.original} href={`${basePath}/${row.original.id}`}>
            <InventoryStatusBadge status={row.original.inventoryStatus} />
          </TicketNumbersCell>
        ),
      },
      ...raffleColumn,
      ...sellerColumn,
      {
        accessorKey: 'paymentStatus',
        header: 'Estado de pago',
        cell: ({ row }) => {
          const money = ticketFinancials(row.original)
          if (!money.sold) return <span className="text-muted-foreground text-sm">Sin venta</span>
          return (
            <div className="max-w-[16rem] space-y-2">
              <PaymentStatusBadge status={row.original.paymentStatus} />
              <div className="flex items-center gap-2">
                <PaymentProgressBar
                  className="min-w-[4rem] flex-1"
                  percentage={money.percentage}
                  status={row.original.paymentStatus}
                  label={`${money.percentage}% abonado`}
                />
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {money.percentage}%
                </span>
              </div>
            </div>
          )
        },
      },
      {
        id: 'paidAmount',
        accessorFn: (row) => ticketFinancials(row).paidAmount,
        header: 'Abonado',
        cell: ({ row }) => <Money ticket={row.original} pick="paidAmount" />,
      },
      {
        id: 'pendingAmount',
        accessorFn: (row) => ticketFinancials(row).pendingAmount,
        header: 'Saldo pendiente',
        cell: ({ row }) => <Money ticket={row.original} pick="pendingAmount" />,
      },
      {
        accessorKey: 'salePrice',
        header: 'Precio',
        meta: { align: 'right' },
        // Menos peso que «Abonado» y «Saldo pendiente»: el precio es el mismo en
        // todas las filas y no es lo que se viene a decidir aqui.
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm tabular-nums">
            {row.original.salePrice === null ? '—' : formatCOP(row.original.salePrice)}
          </span>
        ),
      },
      {
        id: 'chevron',
        enableSorting: false,
        header: () => <span className="sr-only">Ver la boleta</span>,
        cell: () => <RowChevron />,
      },
    ]
  }, [basePath, showRaffle, showSeller])

  return (
    <DataTable
      columns={columns}
      data={tickets}
      getRowId={(row) => row.id}
      rowHref={(row) => `${basePath}/${row.id}`}
      caption="Boletas de este cliente"
      className={className}
    />
  )
}

/**
 * Cuanto, y de cuanto. Sin venta no hay cifra: «—» no es lo mismo que «$0».
 */
function Money({ ticket, pick }: { ticket: TicketListItem; pick: 'paidAmount' | 'pendingAmount' }) {
  const money = ticketFinancials(ticket)
  if (!money.sold) return <span className="text-muted-foreground text-sm">—</span>
  return (
    <div>
      <p className="text-base font-semibold tabular-nums">{formatCOP(money[pick])}</p>
      <p className="text-muted-foreground text-xs tabular-nums">{`de ${formatCOP(money.price)}`}</p>
    </div>
  )
}
