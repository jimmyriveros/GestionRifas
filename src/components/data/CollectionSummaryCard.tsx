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
        {/* Un encabezado de verdad, no solo el titulo de una tarjeta: es la
            region mas importante de la pantalla y hasta ahora no aparecia en el
            esquema de titulos, asi que no se podia saltar a ella con un lector
            de pantalla. Y va en `Heading/H3` porque manda sobre las secciones
            que tiene debajo; con `H4` era el titulo MAS PEQUEÑO de la pagina. */}
        <CardTitle>
          <h2 className="text-heading-h3">Resumen de cobranza</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasSales ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-muted-foreground text-body-small">
                  Recaudado de {formatCOP(totalSold)} vendidos
                </p>
                {/* El rol, no `text-3xl font-bold sm:text-4xl`: la cifra estaba
                    fuera de la escala de metricas y era mas gruesa de lo que
                    ningun rol permite. */}
                <p className="text-metric-x-large tabular-nums">{formatCOP(totalCollected)}</p>
              </div>
              <div className="sm:text-right">
                {/* «Falta cobrar», sin posesivo: este panel lo lee quien
                    administra la organizacion, y ese dinero no es suyo. El
                    vendedor si dice «Ya cobraste» en SU panel (D-171). */}
                <p className="text-muted-foreground text-caption-regular">Falta cobrar</p>
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
