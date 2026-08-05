import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

import type { PaymentListItem } from '../queries'

/**
 * Abonos aplicados a UNA boleta (BR-F13).
 *
 * Recibe los pagos del cliente y se queda con la porcion que toca esta boleta.
 * Los anulados se muestran tachados: siguen en el historial, pero no cuentan en
 * el saldo (BR-F09, BR-F11).
 */
export function TicketPaymentsCard({
  payments,
  ticketId,
}: {
  payments: PaymentListItem[]
  ticketId: string
}) {
  const applied = payments.flatMap((payment) => {
    const allocation = payment.allocations.find((item) => item.ticketId === ticketId)
    return allocation ? [{ payment, amount: allocation.amount }] : []
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Abonos de esta boleta</CardTitle>
      </CardHeader>
      <CardContent>
        {applied.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no tiene abonos registrados.</p>
        ) : (
          <ul className="divide-y">
            {applied.map(({ payment, amount }) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
              >
                <span className="text-sm">
                  {formatDateEs(payment.paymentDate)} ·{' '}
                  {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                  <span className="text-muted-foreground block text-xs">
                    Registrado por {payment.createdByName ?? 'un administrador'}
                    {payment.voidReason ? ` · Anulado: ${payment.voidReason}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      payment.isActive
                        ? 'tabular-nums'
                        : 'text-muted-foreground tabular-nums line-through'
                    }
                  >
                    {formatCOP(amount)}
                  </span>
                  {payment.isActive ? null : (
                    <Badge variant="outline" className="border-rose-300">
                      Anulado
                    </Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
