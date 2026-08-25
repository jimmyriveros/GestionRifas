import { TrendChart, type TrendPoint } from '@/components/data/TrendChart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type CollectionTrendCardProps = {
  points: TrendPoint[]
  /** El periodo escrito: «11 a 17 de ago de 2026». */
  rangeLabel: string
  /** Suma de los puntos. Un cero cambia el texto, no el grafico. */
  collected: number
  className?: string
}

/**
 * «Tendencia de recaudado»: cuanto dinero entro cada dia del periodo (D-112).
 *
 * Es DINERO RECIBIDO, no boletas vendidas: la fuente son los abonos vigentes
 * agrupados por dia en SQL (`report_payments_by_day`), la misma que alimenta el
 * reporte de recaudo.
 *
 * NO lleva su propio selector de dias aunque el diseño lo insinuara: el panel ya
 * tiene uno arriba, y dos controles que hacen lo mismo en la misma pantalla
 * obligan a averiguar cual manda. Este grafico obedece al de arriba y escribe
 * bajo el titulo que periodo esta dibujando.
 */
export function CollectionTrendCard({
  points,
  rangeLabel,
  collected,
  className,
}: CollectionTrendCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-base">
          <h2>Tendencia de recaudado</h2>
        </CardTitle>
        <CardDescription className="tabular-nums">{rangeLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <TrendChart points={points} label={`Dinero recibido cada día del ${rangeLabel}`} />
        {collected === 0 ? (
          <p className="text-muted-foreground text-sm">
            En este período no recibiste ningún abono. Prueba con un período más largo.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
