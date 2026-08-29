import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { PaymentListItem } from '@/features/payments/queries'
import { paymentNewHref } from '@/features/payments/return-to'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

type RecentActivityCardProps = {
  payments: PaymentListItem[]
  className?: string
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

/**
 * «Actividad reciente»: los ultimos abonos recibidos (D-112).
 *
 * Es la misma lista de «Pagos recientes» que ya traia `getSellerDashboard`, sin
 * una consulta nueva. Sustituye a las TRES listas que habia antes —ventas,
 * clientes y pagos—: las boletas vendidas y los clientes tienen sus propias
 * pantallas, y repetir aqui las tres convertia el panel en un indice.
 *
 * Un abono anulado sigue apareciendo, tachado (BR-F09): el panel refleja lo que
 * paso, no una version limpia de lo que paso.
 *
 * NO se filtra por el periodo elegido arriba. «Los ultimos pagos recibidos» son
 * los ultimos: dejar la lista vacia porque esta semana nadie pago, teniendo
 * pagos de la semana pasada, seria esconder informacion util.
 */
export function RecentActivityCard({ payments, className }: RecentActivityCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">
            <h2>Actividad reciente</h2>
          </CardTitle>
          <CardDescription>Últimos pagos recibidos</CardDescription>
        </div>
        <Link
          href="/seller/payments"
          className="text-primary shrink-0 text-sm font-medium hover:underline"
        >
          Ver todos
        </Link>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no has registrado ningún abono.{' '}
            <Link href={paymentNewHref({ from: 'dashboard' })} className="underline">
              Registra el primero
            </Link>
            .
          </p>
        ) : (
          <ul className="-mx-2 divide-y">
            {payments.map((payment) => (
              <li key={payment.id}>
                <Link
                  href={`/seller/clients/${payment.clientId}`}
                  className="hover:bg-muted focus-visible:ring-ring flex items-center gap-3 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span
                    className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                    aria-hidden
                  >
                    {initialsFor(payment.clientName)}
                  </span>

                  {/*
                    El importe comparte linea con el nombre en vez de ocupar una
                    columna propia a la derecha: a 320 px esa columna dejaba 38
                    px al nombre del cliente, que es tanto como no mostrarlo. Y
                    la fecha, que es la linea mas larga, se queda sola en la
                    segunda con todo el ancho disponible.
                  */}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {payment.clientName}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-sm font-medium tabular-nums',
                          payment.isActive
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground line-through',
                        )}
                      >
                        {formatCOP(payment.totalAmount)}
                      </span>
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {/* Un abono anulado sigue en la lista (BR-F09) y lo dice
                          con palabras, al principio: si la linea se corta, esa
                          es la que no puede perderse. El tachado del importe
                          solo lo ve quien puede verlo. */}
                      {payment.isActive ? null : 'Anulado · '}
                      {formatDateEs(payment.paymentDate)} ·{' '}
                      {payment.allocations.length === 1
                        ? '1 boleta'
                        : `${payment.allocations.length} boletas`}
                    </span>
                  </span>

                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
