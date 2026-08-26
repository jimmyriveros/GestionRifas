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
 * **Disposicion (D-124).** Dos bloques, uno encima del otro y separados por una
 * linea: arriba los dos estados; debajo, el cobro. Antes eran tres columnas
 * hermanas en escritorio y dos filas en el telefono —dos disposiciones
 * distintas que mantener—, y a cambio el resumen de pago se quedaba con un
 * tercio del ancho de la tarjeta justo donde estan las cifras que se miran.
 *
 * **Dentro del anillo, solo el porcentaje.** El dinero va fuera, a su lado, con
 * su rotulo y su «de $120.000» debajo para no tener que recordar cuanto valia
 * la boleta. En el telefono el anillo se sube encima de las dos cifras, que se
 * reparten el ancho en dos columnas; a partir de 400 px de tarjeta se pone a su
 * izquierda. No es la misma disposicion encogida: es otra.
 */
export function TicketPaymentSummary({
  inventoryStatus,
  paymentStatus,
  salePrice,
  paidAmount,
}: TicketPaymentSummaryProps) {
  const sold = inventoryStatus === 'assigned' && salePrice !== null
  const price = salePrice ?? 0

  const { percentage, safePendingAmount } = calculateCollectionSummary({
    totalSold: price,
    totalCollected: paidAmount,
    pendingAmount: price - paidAmount,
  })

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
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
          <section className="@container border-t pt-5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Resumen de pago
            </p>

            <div className="mt-4 flex flex-col gap-4 @min-[400px]:flex-row @min-[400px]:items-center @min-[400px]:gap-6">
              <ProgressRing
                className="size-24 self-center @min-[400px]:size-28 @min-[400px]:self-auto"
                percentage={percentage}
                caption="abonado"
                label={`Abonado el ${percentage}% del precio de venta`}
              />

              {/* Dos columnas iguales, en el telefono y en el escritorio: asi
                  las cifras no bailan de sitio al pasar de una boleta a otra. */}
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-4 @min-[400px]:gap-6">
                <Amount
                  label="Abonado"
                  amount={paidAmount}
                  price={price}
                  // El color solo aparece cuando dice algo: en cero no hay
                  // dinero cobrado que destacar.
                  className={paidAmount > 0 ? 'text-emerald-700 dark:text-emerald-400' : undefined}
                />
                {/* El ambar dice «falta algo», igual que en «Abonada» y
                    «Pendiente de aprobación»; en cero no queda nada que
                    señalar y la cifra vuelve al gris de siempre. */}
                <Amount
                  label="Pendiente"
                  amount={safePendingAmount}
                  price={price}
                  className={
                    safePendingAmount > 0 ? 'text-amber-700 dark:text-amber-400' : undefined
                  }
                  divided
                />
              </div>
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Una cifra del resumen: cuanto, y de cuanto.
 *
 * El «de $120.000» no es decoracion: sin el, «$20.000 pendiente» obliga a subir
 * a buscar el precio de la boleta para saber si eso es mucho o poco.
 */
function Amount({
  label,
  amount,
  price,
  className,
  divided,
}: {
  label: string
  amount: number
  price: number
  className?: string
  /** Dibuja la linea que la separa de la cifra anterior. */
  divided?: boolean
}) {
  return (
    <Cell label={label} className={divided ? 'border-l pl-4 @min-[400px]:pl-6' : undefined}>
      {/* La letra crece con la TARJETA: en 240 px «$120.000.000» a 20 px se
          saldria de su columna, y encoger la cifra principal para que quepa es
          justo lo que no se puede hacer. */}
      <p
        className={cn(
          'text-base font-semibold tabular-nums @min-[320px]:text-lg @min-[520px]:text-xl',
          className ?? 'text-muted-foreground',
        )}
      >
        {formatCOP(amount)}
      </p>
      <p className="text-muted-foreground text-xs tabular-nums">{`de ${formatCOP(price)}`}</p>
    </Cell>
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
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      {children}
    </div>
  )
}
