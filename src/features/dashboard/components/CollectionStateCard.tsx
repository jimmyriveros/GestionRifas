import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'

import { LinearProgress } from '@/components/data/LinearProgress'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { tourTarget } from '@/features/tour/tours'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { percentageOf, type CollectionBreakdown } from '../collection-breakdown'
import { TONE_TEXT, type MoneyTone } from '../tones'
import { CollectionBreakdownSection } from './CollectionBreakdownSection'

type CollectionStateCardProps = {
  /**
   * El inventario OPERATIVO de hoy: lo que el vendedor puede vender y lo que ya
   * vendio. Son dos de las cifras de «Mis boletas», no se recalculan aqui.
   *
   * NO recibe `ticketsTotal` a proposito (D-172). Esa cifra cuenta ademas los
   * borradores, las pendientes de aprobacion y las anuladas, asi que
   * `disponibles + vendidas` no la alcanza y la tarjeta dejaba una diferencia
   * sin explicar. Aqui se suman las dos que si se enseñan.
   */
  inventory: { available: number; sold: number }
  counts: { unpaid: number; partial: number; paid: number }
  breakdown: CollectionBreakdown
  className?: string
}

/**
 * «Estado de cobro»: una sola seccion para el dinero del vendedor (D-171).
 *
 * SUSTITUYE a «Resumen financiero» y «Cobranza», que eran dos tarjetas
 * distintas contando el mismo dinero de dos formas. Ni las consultas ni las
 * reglas cambian: `v_seller_summary` sigue dando las mismas sumas y
 * `collection-breakdown.ts` sigue repartiendolas igual. Lo que cambia es que
 * cada cifra dice de que es.
 *
 * EL PROBLEMA QUE RESUELVE. «Abonadas $15.640.000» se leia como dinero
 * abonado, y era el VALOR DE VENTA de esas boletas: la cifra mas grande de la
 * pantalla no significaba lo que parecia. Aqui esa columna se parte en las dos
 * cifras que de verdad existen —«Todavia deben» y «Ya abonaron»— y el valor de
 * venta de las boletas a medias no se escribe en ningun sitio, porque no
 * responde a ninguna pregunta que se haga un vendedor.
 *
 * LAS TRES IGUALDADES QUE SOSTIENEN LA SECCION, y que se pueden comprobar
 * mirandola:
 *
 *   sin pagos + con abonos            = falta cobrar   (escrita a la vista)
 *   cobrado de pagadas + ya abonaron  = ya cobraste
 *   ya cobraste + falta cobrar        = total vendido
 *
 * La primera se escribe entera bajo las dos columnas porque es la que se
 * entendia mal; las otras dos se deducen leyendo el resumen de arriba.
 *
 * CUANDO EL REPARTO NO SE PUEDE DEMOSTRAR (D-172), `breakdown.detail` llega
 * vacio y la seccion se queda con lo que sigue siendo cierto: los cuatro
 * totales, los recuentos de cada estado y sus enlaces. **No se escribe la
 * ecuacion ni ninguna cifra por estado**, porque no habria forma de sostenerlas.
 *
 * QUE NO ENTRA AQUI. El indicador «Recaudado» de la fila superior sigue
 * dependiendo del periodo elegido y por eso vive fuera: mide lo que ENTRO en
 * unas fechas, mientras que todo lo de esta tarjeta es la foto acumulada de hoy
 * (D-112). Mezclarlos volveria a hacer imposible saber que cifra se esta
 * mirando.
 */
export function CollectionStateCard({
  inventory,
  counts,
  breakdown,
  className,
}: CollectionStateCardProps) {
  const { totalSold, collected, pending } = breakdown

  // La MISMA definicion que el indicador «Cobranza» de arriba.
  const progress = percentageOf(collected, totalSold)

  // Las boletas que el vendedor puede reconocer en el desglose de abajo, y que
  // suman EXACTAMENTE lo que dice la insignia.
  const activeCount = inventory.available + inventory.sold

  const hasSales = totalSold > 0

  return (
    <Card className={cn(className)} data-section="estado-de-cobro">
      <CardHeader>
        <CardTitle>
          <h2 className="text-heading-h3">Estado de cobro</h2>
        </CardTitle>
        {/* El inventario operativo, en una linea, y la insignia dice EXACTAMENTE
            lo que suman las dos cifras de al lado (D-172): las que puedes vender
            mas las que ya vendiste. Antes decia el total registrado, que cuenta
            ademas borradores, pendientes de aprobacion y anuladas, y dejaba una
            diferencia que la tarjeta no explicaba en ninguna parte. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge variant="secondary">
            {activeCount === 1 ? '1 boleta activa' : `${activeCount} boletas activas`}
          </Badge>
          <p className="text-muted-foreground text-body-small">
            {`${inventory.available} ${inventory.available === 1 ? 'disponible' : 'disponibles'} · ${inventory.sold} ${inventory.sold === 1 ? 'vendida' : 'vendidas'}`}
          </p>
        </div>
      </CardHeader>

      {/*
        UN SOLO CONTENEDOR PARA TODA LA TARJETA. Las medidas se toman contra
        ella y no contra la ventana: en escritorio ocupa el ancho del contenido
        y en el telefono unos 290 px, y un `sm:` —que mira la ventana— no
        distingue esos dos casos. Es el mismo recurso que ya usan «Mis boletas»
        y el resumen de pago de una boleta.

        LOS UMBRALES SON DE CONTENIDO, NO DE TARJETA: una consulta de contenedor
        mide la caja de contenido, asi que los 48 px de `px-6` ya estan
        descontados. Medido en la aplicacion, ese ancho vale 240 px en una
        pantalla de 320, 293 en una de 375, 416 en una tableta de 768 y 1039 en
        un escritorio de 1360.
      */}
      <CardContent className="@container/estado">
        {hasSales ? (
          <div className="space-y-5">
            {/*
              LOS DOS ANCLAJES DEL RECORRIDO VAN DENTRO, no en la tarjeta.

              El recorrido centra en pantalla el elemento que explica y coloca
              el globo pegado a el. Una tarjeta mas alta que el telefono queda
              centrada con su borde superior FUERA de la pantalla, y el globo se
              va detras: se vio en `tour-responsive`, con el globo a -138 px del
              borde. Cada paso apunta ahora a la mitad que de verdad describe
              —las cifras arriba, el reparto por estado de pago abajo—, que
              ademas es lo que hay que iluminar (D-171).
            */}
            <MoneySummary
              totalSold={totalSold}
              collected={collected}
              pending={pending}
              progress={progress}
            />

            <CollectionBreakdownSection
              className="border-t pt-5"
              counts={counts}
              breakdown={breakdown}
              basePath="/seller/tickets"
            />

            <Link
              href="/seller/reports?report=client-balances"
              className="text-text-brand text-label-medium inline-flex items-center gap-1 hover:underline"
            >
              Ver detalle de cobranza
              <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="text-muted-foreground text-body-small">
            Aún no tienes ventas registradas. Cuando vendas una boleta, aquí verás cuánto llevas
            cobrado y cuánto te falta.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

/**
 * Las cuatro cifras de arriba, y la barra que las resume.
 *
 * TODO ACUMULADO. Ninguna depende del periodo elegido en el encabezado de la
 * pantalla: lo que valen tus boletas vendidas no es una pregunta sobre la
 * semana pasada, y la base de datos guarda el estado de hoy, no el de hace
 * siete dias (D-112).
 *
 * La barra es `LinearProgress` y no una barra repartida en categorias: aqui no
 * se reparte nada, se mide cuanto falta para haberlo cobrado todo, que es
 * exactamente el caso que ese componente describe.
 */
function MoneySummary({
  totalSold,
  collected,
  pending,
  progress,
}: {
  totalSold: number
  collected: number
  pending: number
  progress: number
}) {
  return (
    <section className="space-y-4" {...tourTarget('financial-summary')}>
      {/* Una columna por debajo de 340 px de tarjeta —una pantalla de 320—,
          donde dos importes de once digitos no caben uno al lado del otro sin
          encogerlos; dos hasta que la tarjeta da para las cuatro en fila. */}
      <dl className="grid gap-3 @min-[280px]/estado:grid-cols-2 @min-[640px]/estado:grid-cols-4">
        <Figure label="Total vendido" value={formatCOP(totalSold)} />
        <Figure label="Ya cobraste" value={formatCOP(collected)} tone="paid" />
        <Figure label="Falta cobrar" value={formatCOP(pending)} tone="pending" />
        <Figure label="Avance del cobro" value={`${progress}%`} />
      </dl>

      <LinearProgress
        value={progress}
        label="Avance del cobro"
        valueText={`${formatCOP(collected)} de ${formatCOP(totalSold)}`}
      />
    </section>
  )
}

/** Una de las cuatro cifras del resumen: su nombre y su valor. */
function Figure({ label, value, tone }: { label: string; value: string; tone?: MoneyTone }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-label-medium">{label}</dt>
      {/* La letra crece con la TARJETA, no al reves: con 240 px de contenido,
          «$102.600.000» a 24 px se saldria de su columna, y encoger la cifra
          principal hasta que quepa es justo lo que no se puede hacer. */}
      <dd
        className={cn(
          'text-heading-h4 @min-[400px]/estado:text-heading-h3 @min-[820px]/estado:text-metric-large mt-0.5 tabular-nums',
          tone ? TONE_TEXT[tone] : undefined,
        )}
      >
        {value}
      </dd>
    </div>
  )
}
