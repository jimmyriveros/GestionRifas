import { ProgressRing } from '@/components/data/ProgressRing'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { calculateCollectionSummary } from '@/features/dashboard/collection-summary'
import type { TicketInventoryStatus, TicketPaymentStatus } from '@/lib/constants'
import { formatCOP } from '@/lib/money'

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
      <CardContent className="grid gap-5 lg:flex lg:items-center lg:gap-8">
        <div className="grid grid-cols-2 gap-4 lg:flex-1 lg:gap-8">
          <Cell label="Estado">
            <InventoryStatusBadge status={inventoryStatus} />
          </Cell>
          <Cell label="Estado de pago">
            {inventoryStatus === 'assigned' ? (
              <PaymentStatusBadge status={paymentStatus} />
            ) : (
              <span className="text-muted-foreground text-sm">Sin venta</span>
            )}
          </Cell>
        </div>

        {sold ? (
          // En movil el bloque del dinero baja debajo de los estados, separado
          // por una linea; en escritorio pasa a ser la parte derecha de la
          // misma fila.
          <div className="border-t pt-5 lg:ml-auto lg:min-w-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Resumen de pago
            </p>
            <div className="mt-3 flex items-center gap-4 sm:gap-6">
              <ProgressRing
                percentage={percentage}
                caption="abonado"
                label={`Abonado el ${percentage}% del precio de venta`}
              />
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-4 sm:gap-8">
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
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      {children}
    </div>
  )
}
