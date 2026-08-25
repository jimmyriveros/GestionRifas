import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'

import { DonutChart, type DonutSegment } from '@/components/data/DonutChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { tourTarget } from '@/features/tour/tours'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { percentageOf, type CollectionBreakdown } from '../collection-breakdown'
import { TONE_FILL, TONE_STROKE, type MoneyTone } from '../tones'

type FinancialSummaryCardProps = {
  breakdown: CollectionBreakdown
  /**
   * `false` cuando no se pudo separar lo cobrado de lo abonado (ver
   * `getSellerPartialTicketTotals`). El grafico muestra entonces dos partes en
   * vez de tres: menos detalle, pero ninguna cifra inventada.
   */
  detailed: boolean
  className?: string
}

type Slice = { label: string; value: number; tone: MoneyTone }

/**
 * «Resumen financiero»: en que estado esta el dinero de las boletas vendidas
 * (D-112). Sustituye a la tarjeta «Resumen de cobranza» en el panel del
 * vendedor; el panel administrativo la conserva.
 *
 * LAS TRES PARTES SUMAN EL TOTAL, y esa es toda la gracia:
 *
 *   cobrado de las pagadas + abonado de las que aun deben + lo que falta
 *   = valor de todo lo vendido
 *
 * Los porcentajes se calculan sobre ese total, nunca se escriben a mano, y un
 * vendedor sin ventas no divide por cero: ve el estado vacio.
 */
export function FinancialSummaryCard({
  breakdown,
  detailed,
  className,
}: FinancialSummaryCardProps) {
  const { totalSold, collectedOnPaid, collectedOnPartial, pending } = breakdown

  const slices: Slice[] = detailed
    ? [
        { label: 'Pagadas', value: collectedOnPaid, tone: 'paid' },
        { label: 'Abonadas', value: collectedOnPartial, tone: 'partial' },
        { label: 'Por cobrar', value: pending, tone: 'pending' },
      ]
    : [
        { label: 'Cobrado', value: collectedOnPaid + collectedOnPartial, tone: 'paid' },
        { label: 'Por cobrar', value: pending, tone: 'pending' },
      ]

  const segments: DonutSegment[] = slices.map((slice) => ({
    label: slice.label,
    value: slice.value,
    className: TONE_STROKE[slice.tone],
  }))

  return (
    <Card className={cn(className)} {...tourTarget('financial-summary')}>
      <CardHeader>
        <CardTitle className="text-base">
          <h2>Resumen financiero</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalSold === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aún no tienes ventas registradas. Cuando vendas una boleta, aquí verás cuánto llevas
            cobrado y cuánto te falta.
          </p>
        ) : (
          <div className="@container space-y-4 @min-[400px]:space-y-6">
            {/*
              El anillo se pone al lado de la leyenda cuando LA TARJETA es lo
              bastante ancha, no cuando lo es la ventana: en escritorio esta
              tarjeta ocupa media pantalla, asi que un `sm:` —que mira la
              ventana— la partia en dos columnas de 192 y 66 px y los nombres
              de la leyenda desaparecian. El umbral son 400 px de TARJETA, que
              es lo que necesitan el anillo (160) y la leyenda mas larga (216).

              EN EL TELEFONO EL ANILLO MIDE 128 px, no 160. Con 160, la tarjeta
              llegaba a 422 px de alto y el globo del recorrido guiado no tenia
              donde ponerse sin taparla: centrada en una pantalla de 839 px
              dejaba 209 px libres a cada lado y el globo pide 226 con su
              separacion. Con 128 la tarjeta baja a ~374 y el globo cabe.
            */}
            <div className="flex flex-col items-center gap-4 @min-[400px]:flex-row @min-[400px]:items-center @min-[400px]:gap-6">
              <DonutChart
                className="size-32 @min-[400px]:size-40 @min-[560px]:size-48"
                segments={segments}
                total={totalSold}
                centerLabel="Total a cobrar"
                centerValue={formatCOP(totalSold)}
              />

              <ul className="w-full min-w-0 space-y-3">
                {slices.map((slice) => (
                  <li key={slice.label} className="flex items-center gap-3">
                    <span
                      className={cn('size-2.5 shrink-0 rounded-full', TONE_FILL[slice.tone])}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{slice.label}</span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {formatCOP(slice.value)}{' '}
                      <span className="text-muted-foreground font-normal">
                        ({percentageOf(slice.value, totalSold)}%)
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href="/seller/reports?report=client-balances"
              className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              Ver detalle de cobranza
              <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
