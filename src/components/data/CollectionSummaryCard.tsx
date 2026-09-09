import { LinearProgress } from '@/components/data/LinearProgress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CollectionBreakdown } from '@/features/dashboard/collection-breakdown'
import { calculateCollectionSummary } from '@/features/dashboard/collection-summary'
import { CollectionBreakdownSection } from '@/features/dashboard/components/CollectionBreakdownSection'
import { tourTarget } from '@/features/tour/tours'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

type CollectionSummaryCardProps = {
  totalSold: number
  totalCollected: number
  pendingAmount: number
  /** Boletas vendidas con saldo pendiente > 0 (Sin pagar + Abonadas). */
  pendingTicketsCount: number
  /**
   * Los tres recuentos por estado de pago y el reparto del dinero entre ellos.
   *
   * Opcionales a proposito: sin ellos la tarjeta es exactamente la de siempre.
   * Quien los pasa gana el desglose de D-171 debajo del resumen; quien no, no
   * cambia en nada.
   */
  counts?: { unpaid: number; partial: number; paid: number }
  breakdown?: CollectionBreakdown
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
  counts,
  breakdown,
  className,
}: CollectionSummaryCardProps) {
  const { hasSales, percentage, safePendingAmount } = calculateCollectionSummary({
    totalSold,
    totalCollected,
    pendingAmount,
  })

  return (
    // EL ANCLAJE DEL RECORRIDO YA NO VA EN LA TARJETA, va en el resumen de
    // dentro (D-182). El recorrido centra en pantalla el elemento que explica y
    // pega el globo a el; con el reparto por estado de pago dentro, la tarjeta
    // pasó de 212 a ~640 px y su borde superior quedaba FUERA de la pantalla,
    // con el globo detrás — medido en −94 px. Es exactamente lo que D-171 ya
    // había resuelto en el panel del vendedor, y se resuelve igual: cada paso
    // apunta a la mitad que de verdad describe. `data-section` queda para que
    // las pruebas puedan seguir pidiendo la tarjeta entera.
    <Card className={cn(className)} data-section="resumen-de-cobranza">
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
            <div className="space-y-4" {...tourTarget('financial-summary')}>
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
            </div>

            {/* El reparto por estado de pago, cuando quien monta la tarjeta lo
                pasa. Es la MISMA pieza que usa el panel del vendedor (D-171),
                con sus enlaces apuntando a este portal: las tres cifras de
                boletas que antes vivian sueltas en su propia seccion —sin
                dinero al lado y sin poder llegar a ninguna lista— ahora dicen
                cuanto se debe de cada grupo y llevan a esas boletas. */}
            {counts && breakdown ? (
              <CollectionBreakdownSection
                className="border-t pt-4"
                counts={counts}
                breakdown={breakdown}
                basePath="/owner/tickets"
              />
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground text-body-small">Aún no tienes ventas registradas.</p>
        )}
      </CardContent>
    </Card>
  )
}
