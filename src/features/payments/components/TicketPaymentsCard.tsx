import { ArrowLeftRightIcon, BanknoteIcon, WalletIcon, type LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/constants'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

import type { PaymentListItem } from '../queries'

/**
 * Abonos aplicados a UNA boleta (BR-F13).
 *
 * Recibe los pagos del cliente y se queda con la porcion que toca esta boleta.
 * Los anulados se muestran tachados: siguen en el historial, pero no cuentan en
 * el saldo (BR-F09, BR-F11).
 *
 * Una sola lista para los dos tamaños de pantalla. En un telefono cada abono es
 * una tarjeta apilada —fecha y valor arriba, lo secundario debajo—; a partir de
 * `lg` la MISMA lista se reordena en columnas alineadas con su encabezado. No
 * hay dos arboles de HTML ni una tabla encogida hasta lo ilegible.
 */

const METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  cash: BanknoteIcon,
  transfer: ArrowLeftRightIcon,
  other: WalletIcon,
}

// El mismo reparto de columnas para el encabezado y para cada fila: si se
// cambia aqui, las dos se mueven juntas.
const COLUMNS = 'lg:grid-cols-[9rem_8rem_7rem_minmax(0,1fr)_minmax(0,1.2fr)]'

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
          <>
            {/* Rotulos visuales de las columnas. Van marcados como decorativos
                porque cada fila lleva su propio rotulo para lectores de
                pantalla: sin eso, en escritorio se oiria un nombre suelto sin
                saber que es «quien lo registro». */}
            <div
              aria-hidden
              className={`text-muted-foreground hidden gap-4 border-b pb-2 text-xs font-medium tracking-wide uppercase lg:grid ${COLUMNS}`}
            >
              <span>Fecha</span>
              <span>Método de pago</span>
              <span className="text-right">Abonado</span>
              <span>Registrado por</span>
              <span>Nota</span>
            </div>

            <ul className="divide-y">
              {applied.map(({ payment, amount }) => {
                const MethodIcon = METHOD_ICONS[payment.paymentMethod]

                return (
                  <li
                    key={payment.id}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 py-3 first:pt-3 last:pb-0 lg:items-center lg:gap-y-0 lg:py-3 ${COLUMNS}`}
                  >
                    <span className="col-start-1 row-start-1 text-sm whitespace-nowrap lg:col-start-1">
                      {formatDateEs(payment.paymentDate)}
                    </span>

                    <span className="col-start-1 row-start-2 flex items-center gap-1.5 text-sm lg:col-start-2 lg:row-start-1">
                      <MethodIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <span className="sr-only">Método de pago: </span>
                      {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                    </span>

                    <span className="col-start-2 row-start-1 flex flex-col items-end gap-1 lg:col-start-3">
                      <span
                        className={
                          payment.isActive
                            ? 'text-sm font-semibold tabular-nums'
                            : 'text-muted-foreground text-sm font-semibold tabular-nums line-through'
                        }
                      >
                        {formatCOP(amount)}
                      </span>
                      {payment.isActive ? null : (
                        <Badge
                          variant="outline"
                          className="border-rose-300 text-rose-900 dark:text-rose-200"
                        >
                          Anulado
                        </Badge>
                      )}
                    </span>

                    <span className="text-muted-foreground col-span-2 col-start-1 row-start-3 text-xs lg:col-span-1 lg:col-start-4 lg:row-start-1">
                      <span className="lg:sr-only">Registrado por </span>
                      {payment.createdByName ?? 'un administrador'}
                      {payment.voidReason ? ` · Anulado: ${payment.voidReason}` : ''}
                    </span>

                    {payment.notes ? (
                      <span className="text-muted-foreground col-span-2 col-start-1 row-start-4 text-xs lg:col-span-1 lg:col-start-5 lg:row-start-1">
                        <span className="lg:sr-only">Nota: </span>
                        {payment.notes}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
