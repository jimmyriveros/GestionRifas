import { PaymentStatusBadge } from '@/components/data/StatusBadge'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'

import type { TeamMemberSale } from '../queries'

/**
 * Las ventas de un integrante del equipo.
 *
 * Es una lista propia y no `TicketsTable` por una razon de fondo, no de estilo:
 * aquella lleva columna de cliente, enlace al detalle de la boleta y —dentro de
 * un proveedor de seleccion— casillas para actuar sobre ella. Aqui no hay nada
 * de eso: el vendedor padre MIRA las ventas de su equipo, no las opera, y no ve
 * a sus clientes (BR-E05). Una tabla con la mitad de las columnas vacias y los
 * enlaces desactivados seria peor reutilizacion que esta lista.
 *
 * La boleta se nombra por sus dos numeros, con `ticketLabel` (BR-N11).
 */
export function TeamMemberSales({ sales }: { sales: TeamMemberSale[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {sales.map((sale) => (
        <li key={sale.ticketId} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="font-mono font-medium tabular-nums">{ticketLabel(sale)}</p>
            <p className="text-muted-foreground text-xs">
              {sale.saleDate ? formatDateEs(sale.saleDate) : 'Sin fecha de venta'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-medium tabular-nums">
                {sale.salePrice === null ? '—' : formatCOP(sale.salePrice)}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                Abonado {formatCOP(sale.paidAmount)}
              </p>
            </div>
            <PaymentStatusBadge status={sale.paymentStatus} />
          </div>
        </li>
      ))}
    </ul>
  )
}
