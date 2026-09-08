import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react'

import { TrendChart, type TrendPoint } from '@/components/data/TrendChart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import type { Comparison, DashboardRangeKey } from '../date-range'
import { DateRangeSelect } from './DateRangeSelect'

type CollectionTrendCardProps = {
  /** Opcion de periodo vigente, para el selector que vive en esta tarjeta. */
  rangeKey: DashboardRangeKey
  /** El periodo escrito: «11 a 17 de ago de 2026». */
  rangeLabel: string
  points: TrendPoint[]
  /** Suma de los puntos. Un cero cambia el texto, no el grafico. */
  collected: number
  comparison: Comparison
  /** Cuantos dias mide el periodo, para nombrar el anterior con exactitud. */
  periodDays: number
  className?: string
}

/**
 * «Recaudado»: cuanto dinero entro en el periodo elegido, y cuando (D-112).
 *
 * ES DINERO RECIBIDO, no boletas vendidas: la fuente son los abonos vigentes
 * agrupados por dia en SQL (`report_payments_by_day`), la misma que alimenta el
 * reporte de recaudo.
 *
 * POR QUE LA CIFRA VIVE AQUI. Era un indicador suelto de la fila superior, al
 * lado de «Por cobrar» y «Cobranza». Esos dos repetian cifras de «Estado de
 * cobro» y se fueron; este no —mide lo que ENTRO en unas fechas, mientras que
 * todo lo de aquella seccion es la foto acumulada de hoy—, asi que en vez de
 * desaparecer baja a la tarjeta que ya dibujaba esa misma serie. No es la cifra
 * repetida en dos sitios: es la cifra en el unico sitio donde se explica sola,
 * porque debajo esta el grafico que la reparte dia a dia.
 *
 * Y POR ESO EL SELECTOR DE PERIODO TAMBIEN ESTA AQUI. Mientras habia cuatro
 * indicadores arriba, el control vivia en el encabezado de la pantalla aunque
 * solo mandara sobre uno de ellos. Ahora manda sobre esta tarjeta y sobre nada
 * mas, y un control de pagina que gobierna una sola region hace creer que
 * gobierna todas —justo la confusion que D-112 se propuso evitar—. El contrato
 * `Pattern / Dashboard Page` lo dice con todas las letras: el selector del
 * vendedor es LOCAL a su region de dinero. El inventario y la cobranza siguen
 * siendo la foto de hoy y no se mueven al cambiarlo.
 *
 * NO LLEVA UN SEGUNDO SELECTOR, aunque el diseño original lo insinuara: el que
 * hay es el de la pantalla entera, y dos controles que hacen lo mismo obligan a
 * averiguar cual manda.
 */
export function CollectionTrendCard({
  rangeKey,
  rangeLabel,
  points,
  collected,
  comparison,
  periodDays,
  className,
}: CollectionTrendCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        {/* El selector baja bajo el titulo en el telefono, donde se pide el alto
            de 44 px y el ancho entero; a partir de `sm` vuelve a la derecha. No
            se usa `CardAction` porque esa ranura se estira a lo alto de las dos
            filas del encabezado y dejaria el boton flotando junto a la
            descripcion. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle>
              <h2 className="text-heading-h4">Recaudado</h2>
            </CardTitle>
            {/* Lo unico que la pantalla no enseña: que esta cifra es del
                periodo y no la acumulada que dice «Ya cobraste» un poco mas
                arriba. Son distintas en cuanto un cliente abona un dia despues
                de comprar, o sea casi siempre (D-151). */}
            <CardDescription>Lo que entró en estas fechas</CardDescription>
          </div>
          <DateRangeSelect value={rangeKey} rangeLabel={rangeLabel} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-metric-large tabular-nums">{formatCOP(collected)}</p>
          <ComparisonHint comparison={comparison} periodDays={periodDays} />
        </div>

        <TrendChart points={points} label={`Dinero recibido cada día del ${rangeLabel}`} />

        {collected === 0 ? (
          <p className="text-muted-foreground text-body-small">
            En este período no recibiste ningún abono. Prueba con un período más largo.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * «Subió 12% vs. los 7 días anteriores».
 *
 * El periodo anterior se nombra con su duracion real —siete dias, treinta— en
 * vez de «período anterior»: es la misma informacion dicha con palabras que no
 * hay que interpretar. Y cuando en ese periodo no entro nada, se dice tal cual;
 * un aumento desde cero no tiene porcentaje.
 *
 * La flecha no va sola: al lado esta escrito «Subió» o «Bajó», porque el color
 * y el icono no pueden ser la unica señal (CLAUDE.md §27).
 */
function ComparisonHint({
  comparison,
  periodDays,
}: {
  comparison: Comparison
  periodDays: number
}) {
  const previous = periodDays === 1 ? 'el día anterior' : `los ${periodDays} días anteriores`

  if (comparison.kind === 'unknown') {
    return <p className="text-muted-foreground text-body-small">Sin recaudo en {previous}</p>
  }

  if (comparison.kind === 'same') {
    return <p className="text-muted-foreground text-body-small">Igual que en {previous}</p>
  }

  const isUp = comparison.kind === 'up'
  const Icon = isUp ? TrendingUpIcon : TrendingDownIcon

  return (
    <p className="text-body-small flex flex-wrap items-center gap-x-1.5">
      <span
        className={cn(
          'inline-flex items-center gap-1 font-medium',
          isUp ? 'text-data-positive' : 'text-data-negative',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {isUp ? 'Subió' : 'Bajó'} {comparison.percentage}%
      </span>
      <span className="text-muted-foreground">vs. {previous}</span>
    </p>
  )
}
