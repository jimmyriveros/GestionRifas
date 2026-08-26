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
 *
 * DONDE VA CADA COSA (D-124). En el centro del anillo, el porcentaje
 * recaudado —tres caracteres que miden siempre lo mismo—; el dinero, fuera y al
 * lado, donde puede crecer hasta «$120.000.000» sin encoger la letra ni pisar
 * el dibujo. El reparto en tres partes baja debajo, a lo ancho de la tarjeta.
 *
 * «TOTAL VENDIDO», NO «TOTAL A COBRAR». Es el valor de las boletas ya vendidas;
 * lo que falta por cobrar es «Por cobrar», que es otra cifra y esta dos lineas
 * mas abajo. El centro del anillo era el unico sitio de la aplicacion que
 * llamaba «Total a cobrar» a lo vendido: las otras diez pantallas —Pagos,
 * reportes, CSV— ya decian «Total vendido». Solo cambia el rotulo: ni una
 * propiedad, consulta ni calculo.
 */
export function FinancialSummaryCard({
  breakdown,
  detailed,
  className,
}: FinancialSummaryCardProps) {
  const { totalSold, collectedOnPaid, collectedOnPartial, pending } = breakdown

  // La MISMA definicion de «recaudado» que ya usa el indicador «Cobranza» de
  // arriba (`percentageOf(totalCollected, totalSold)`): las dos partes cobradas
  // del reparto son, por construccion, lo recaudado.
  const collectedPercentage = percentageOf(collectedOnPaid + collectedOnPartial, totalSold)

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
          <div className="@container space-y-5 @min-[400px]:space-y-6">
            {/*
              El anillo y el total se miden contra LA TARJETA, no contra la
              ventana: en escritorio esta tarjeta ocupa media pantalla, asi que
              un `sm:` —que mira la ventana— la partia en columnas de 192 y
              66 px y los nombres desaparecian.

              Los dos van SIEMPRE en la misma fila salvo en el telefono mas
              estrecho. Con 240 px de tarjeta —una pantalla de 320— el importe
              mas largo que puede darse, «$120.000.000», no cabe al lado del
              anillo, y ahi es donde la fila se convierte en columna: es la
              unica forma de no encoger la cifra hasta lo ilegible.
            */}
            <div className="flex flex-col items-center gap-4 text-center @min-[280px]:flex-row @min-[280px]:gap-5 @min-[280px]:text-left @min-[400px]:gap-6">
              <DonutChart
                className="size-24 @min-[400px]:size-32 @min-[560px]:size-40"
                segments={segments}
                total={totalSold}
                centerValue={`${collectedPercentage}%`}
                centerCaption="recaudado"
              />

              <div className="min-w-0">
                <p className="text-muted-foreground text-sm font-medium">Total vendido</p>
                {/* Crece con la tarjeta, no al reves: la cifra manda sobre el
                    tamaño de letra que puede permitirse cada ancho. */}
                <p className="mt-0.5 text-xl font-semibold tabular-nums @min-[400px]:text-2xl @min-[560px]:text-3xl">
                  {formatCOP(totalSold)}
                </p>
              </div>
            </div>

            <ul className="space-y-3">
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
