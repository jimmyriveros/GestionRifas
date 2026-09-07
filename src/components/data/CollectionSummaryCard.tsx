import { LinearProgress } from '@/components/data/LinearProgress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { calculateCollectionSummary } from '@/features/dashboard/collection-summary'
import { tourTarget } from '@/features/tour/tours'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

type CollectionSummaryCardProps = {
  totalSold: number
  totalCollected: number
  pendingAmount: number
  /** Boletas vendidas con saldo pendiente > 0 (Sin pagar + Abonadas). */
  pendingTicketsCount: number
  className?: string
}

/**
 * Resumen ejecutivo de cobranza del panel: reemplaza la tarjeta "Rifa activa"
 * (D-090). Recibe los mismos totales ya agregados por SQL que usan las demas
 * tarjetas del dashboard — no recalcula nada, solo los presenta.
 */
export function CollectionSummaryCard({
  totalSold,
  totalCollected,
  pendingAmount,
  pendingTicketsCount,
  className,
}: CollectionSummaryCardProps) {
  const { hasSales, percentage, safePendingAmount } = calculateCollectionSummary({
    totalSold,
    totalCollected,
    pendingAmount,
  })

  return (
    <Card className={cn(className)} {...tourTarget('financial-summary')}>
      <CardHeader>
        <CardTitle className="text-heading-h4">Resumen de cobranza</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasSales ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-muted-foreground text-body-small">
                  Recaudado de {formatCOP(totalSold)} vendidos
                </p>
                <p className="text-3xl font-bold tabular-nums sm:text-4xl">
                  {formatCOP(totalCollected)}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-muted-foreground text-caption-regular">Te falta cobrar</p>
                <p className="text-body-large font-semibold tabular-nums">
                  {formatCOP(safePendingAmount)}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <LinearProgress value={percentage} label="Porcentaje recaudado" />
              <p className="text-muted-foreground text-caption-regular">
                {percentage}% recaudado
                {pendingTicketsCount > 0
                  ? ` · ${pendingTicketsCount} ${pendingTicketsCount === 1 ? 'boleta' : 'boletas'} por cobrar`
                  : ''}
              </p>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-body-small">Aún no tienes ventas registradas.</p>
        )}
      </CardContent>
    </Card>
  )
}
