import { ProgressRing } from '@/components/data/ProgressRing'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { calculateCollectionSummary } from '@/features/dashboard/collection-summary'
import type { TicketInventoryStatus, TicketPaymentStatus } from '@/lib/constants'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

type TicketPaymentSummaryProps = {
  inventoryStatus: TicketInventoryStatus
  paymentStatus: TicketPaymentStatus
  /** NULL mientras la boleta no se ha vendido: no hay saldo que deber (BR-F08). */
  salePrice: number | null
  paidAmount: number
}

/**
 * Estado de la boleta y, si ya se vendio, en que va su cobro.
 *
 * Las dos cifras y el porcentaje salen de `sale_price` y `paid_amount`, que la
 * pantalla ya tiene: no se consulta nada nuevo. El reparto —cuanto de cada
 * abono toca a esta boleta— lo hizo la base de datos al registrar el pago; aqui
 * solo se presenta (BR-F08).
 *
 * Se reutiliza `calculateCollectionSummary` en vez de escribir la division
 * aparte: es la misma cuenta que hace el panel, ya probada para los casos
 * limite (sin ventas, cobro completo y un pendiente negativo que la base
 * impide pero que la interfaz nunca debe pintar).
 *
 * **Disposicion.** En escritorio son TRES secciones hermanas separadas por una
 * linea vertical —estado · estado de pago · resumen de pago—, y la tercera
 * reparte a su vez el anillo, lo abonado y lo pendiente en horizontal. En el
 * telefono los dos estados comparten fila y el resumen entero baja debajo,
 * separado por una linea horizontal. Es la misma rejilla en los dos casos: solo
 * cambia donde cae cada sección y de que lado se dibuja su linea.
 */
export function TicketPaymentSummary({
  inventoryStatus,
  paymentStatus,
  salePrice,
  paidAmount,
}: TicketPaymentSummaryProps) {
  const sold = inventoryStatus === 'assigned' && salePrice !== null

  const { percentage, safePendingAmount } = calculateCollectionSummary({
    totalSold: salePrice ?? 0,
    totalCollected: paidAmount,
    pendingAmount: (salePrice ?? 0) - paidAmount,
  })

  return (
    <Card>
      {/* Las dos primeras columnas se miden por su ROTULO, no por el badge:
          con menos ancho, «Estado de pago» parte en dos lineas a 1.024 px. */}
      <CardContent className="grid grid-cols-2 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-8">
        <Cell label="Estado" className="lg:col-start-1 lg:row-start-1">
          <InventoryStatusBadge status={inventoryStatus} />
        </Cell>

        <Cell label="Estado de pago" className="lg:col-start-2 lg:row-start-1 lg:border-l lg:pl-8">
          {inventoryStatus === 'assigned' ? (
            <PaymentStatusBadge status={paymentStatus} />
          ) : (
            <span className="text-muted-foreground text-sm">Sin venta</span>
          )}
        </Cell>

        {sold ? (
          // La linea que lo separa es horizontal en el telefono —porque el
          // bloque baja— y vertical en escritorio, donde es la tercera columna.
          <section className="col-span-2 border-t pt-5 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:flex lg:flex-col lg:justify-center lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Resumen de pago
            </p>
            {/* Tres columnas: el anillo ocupa lo que mide, y las dos cifras se
                reparten el resto por igual para que no bailen entre boletas. */}
            <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 sm:gap-6">
              <ProgressRing
                percentage={percentage}
                caption="abonado"
                label={`Abonado el ${percentage}% del precio de venta`}
              />
              <Cell label="Abonado">
                {/* El color solo aparece cuando dice algo: en cero no hay
                    dinero cobrado que destacar. */}
                <p
                  className={
                    paidAmount > 0
                      ? 'text-base font-semibold text-emerald-700 tabular-nums sm:text-lg dark:text-emerald-400'
                      : 'text-muted-foreground text-base font-semibold tabular-nums sm:text-lg'
                  }
                >
                  {formatCOP(paidAmount)}
                </p>
              </Cell>
              <Cell label="Pendiente">
                {/* El ambar dice «falta algo», igual que en «Abonada» y
                    «Pendiente de aprobación»; en cero no queda nada que
                    señalar y la cifra vuelve al gris de siempre. */}
                <p
                  className={
                    safePendingAmount > 0
                      ? 'text-base font-semibold text-amber-700 tabular-nums sm:text-lg dark:text-amber-400'
                      : 'text-muted-foreground text-base font-semibold tabular-nums sm:text-lg'
                  }
                >
                  {formatCOP(safePendingAmount)}
                </p>
              </Cell>
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Cell({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5 lg:flex lg:flex-col lg:justify-center', className)}>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      {children}
    </div>
  )
}
