import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { LinearProgress } from '@/components/data/LinearProgress'
import { StatusBadge } from '@/components/data/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { tourTarget } from '@/features/tour/tours'
import { LIST_ITEM_LABELS } from '@/lib/constants'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { percentageOf, type CollectionBreakdown } from '../collection-breakdown'
import { TONE_FILL, TONE_TEXT, type MoneyTone } from '../tones'

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
  const { totalSold, collected, pending, detail } = breakdown

  // La MISMA definicion que el indicador «Cobranza» de arriba.
  const progress = percentageOf(collected, totalSold)

  // Las boletas que el vendedor puede reconocer en el desglose de abajo, y que
  // suman EXACTAMENTE lo que dice la insignia.
  const activeCount = inventory.available + inventory.sold

  // El recuento del grupo y el de la insignia salen de los MISMOS tres numeros
  // que se pintan debajo, no de `inventory.sold`: la seccion promete que las
  // categorias suman su titulo, y esa promesa no puede depender de que dos
  // filtros distintos coincidan.
  const toCollectCount = counts.unpaid + counts.partial
  const soldCount = toCollectCount + counts.paid

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

            <section className="space-y-3 border-t pt-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-heading-h4">Boletas vendidas según su pago</h3>
                <Badge variant="secondary">
                  {soldCount === 1 ? '1 boleta vendida' : `${soldCount} boletas vendidas`}
                </Badge>
              </div>

              {/* GRUPO 1 — lo que falta por cobrar, con las dos formas que
                  tiene de faltar. Va primero porque es sobre lo que se puede
                  actuar hoy.

                  Y es el anclaje del recorrido, en vez de la seccion entera:
                  con las tres cifras dentro, el globo no cabia en un telefono
                  —se midio a 943 px sobre una pantalla de 840— y ademas el paso
                  habla justo de estas dos. */}
              <div
                {...tourTarget('metrics-collection')}
                className="bg-muted/40 space-y-3 rounded-lg border p-3 @min-[380px]/estado:p-4"
              >
                <GroupHeading
                  tone="pending"
                  name="Falta cobrar"
                  count={toCollectCount}
                  amount={pending}
                />

                <div className="grid gap-3 @min-[380px]/estado:grid-cols-2">
                  <StateBlock
                    tone="unpaid"
                    name="Sin pagos"
                    count={counts.unpaid}
                    href="/seller/tickets?inventoryStatus=assigned&paymentStatus=unpaid"
                    /* Una boleta de la que no ha entrado nada debe su precio
                       entero: lo que falta y lo que vale son la misma cifra, y
                       por eso lleva el rol que pide atencion y no el gris. */
                    money={
                      detail
                        ? [{ label: 'Deben', amount: detail.pendingBy.unpaid, tone: 'unpaid' }]
                        : []
                    }
                  />

                  <StateBlock
                    tone="partial"
                    name="Con abonos"
                    count={counts.partial}
                    href="/seller/tickets?inventoryStatus=assigned&paymentStatus=partial"
                    /* LAS DOS CIFRAS QUE ANTES SE CONFUNDIAN EN UNA. Lo que
                       todavia deben es «todavia no» y va en gris; lo que ya
                       abonaron es dinero recibido y lleva el rol de los abonos.
                       El valor de venta de estas boletas —la suma de las dos—
                       no se escribe: era justo la cifra que se leia mal. */
                    money={
                      detail
                        ? [
                            {
                              label: 'Todavía deben',
                              amount: detail.pendingBy.partial,
                              tone: 'pending',
                            },
                            {
                              label: 'Ya abonaron',
                              amount: detail.collectedOnPartial,
                              tone: 'partial',
                              secondary: true,
                            },
                          ]
                        : []
                    }
                  />
                </div>

                {detail ? (
                  <PendingEquation
                    unpaid={detail.pendingBy.unpaid}
                    partial={detail.pendingBy.partial}
                  />
                ) : null}
              </div>

              {/* GRUPO 2 — lo que ya no hay que cobrar. Bloque aparte y no una
                  tercera columna: no comparte total con las de arriba. */}
              <StateBlock
                tone="paid"
                name="Pagadas"
                count={counts.paid}
                href="/seller/tickets?inventoryStatus=assigned&paymentStatus=paid"
                wide
                badge={<StatusBadge tone="success">Pago completo</StatusBadge>}
                money={
                  detail ? [{ label: 'Cobrado', amount: detail.collectedOnPaid, tone: 'paid' }] : []
                }
              />
            </section>

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

/**
 * El encabezado de un grupo: su punto de color, su nombre, cuantas boletas y
 * cuanto dinero.
 *
 * El punto NUNCA va solo: al lado esta escrito el nombre del grupo, porque ni
 * el color ni un dibujo pueden ser la unica forma de conocer un dato
 * (CLAUDE.md §27).
 */
function GroupHeading({
  tone,
  name,
  count,
  amount,
}: {
  tone: MoneyTone
  name: string
  count: number
  amount: number
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('size-2.5 shrink-0 rounded-full', TONE_FILL[tone])} aria-hidden />
        <h4 className="text-label-medium">{name}</h4>
        <span className="text-muted-foreground text-body-small tabular-nums">
          {ticketCount(count)}
        </span>
      </div>

      <p className={cn('text-heading-h3 tabular-nums', TONE_TEXT[tone])}>{formatCOP(amount)}</p>
    </div>
  )
}

type MoneyLine = { label: string; amount: number; tone: MoneyTone; secondary?: boolean }

/**
 * Un estado de pago: cuantas boletas hay y que dinero les corresponde.
 *
 * ES UN ENLACE ENTERO a la lista ya filtrada, como lo eran las tres columnas de
 * la seccion «Cobranza» que esto sustituye: ver que tienes 373 boletas sin
 * pagos y no poder llegar a ellas seria dejar el trabajo a medias. Al ocupar
 * todo el bloque, el area que se toca pasa holgadamente de los 44 px.
 *
 * EL DINERO VA APILADO —rotulo encima, cifra debajo— y no en una fila con el
 * rotulo a la izquierda: en dos columnas dentro de una tarjeta de media
 * pantalla, «Todavia deben» y «$8.700.000» no caben en la misma linea, y la
 * cifra es lo ultimo que puede encogerse.
 *
 * `wide` es para el bloque que va SOLO a lo ancho de la tarjeta —«Pagadas»—:
 * ahi el reparto en columna deja media tarjeta vacia, asi que en cuanto hay
 * sitio el dinero se va a la derecha, como en el encabezado del grupo de
 * arriba. Es la misma pieza con dos disposiciones, no dos piezas.
 */
function StateBlock({
  tone,
  name,
  count,
  href,
  money,
  badge,
  wide,
}: {
  tone: MoneyTone
  name: string
  count: number
  href: string
  money: MoneyLine[]
  badge?: ReactNode
  wide?: boolean
}) {
  return (
    <Link
      href={href}
      className="hover:bg-accent focus-visible:ring-ring bg-card block min-w-0 rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none @min-[380px]/estado:p-4"
    >
      <div
        className={cn(
          'flex flex-col gap-3',
          wide &&
            '@min-[380px]/estado:flex-row @min-[380px]/estado:items-center @min-[380px]/estado:justify-between @min-[380px]/estado:gap-4',
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('size-2.5 shrink-0 rounded-full', TONE_FILL[tone])} aria-hidden />
            <span className="text-label-medium">{name}</span>
            {badge}
          </div>
          <p className="text-heading-h4 mt-1 tabular-nums">{ticketCount(count)}</p>
        </div>

        {money.length > 0 ? (
          <dl className={cn('space-y-2', wide && '@min-[380px]/estado:text-right')}>
            {money.map((line) =>
              line.secondary ? (
                <div
                  key={line.label}
                  className="text-body-small flex flex-wrap items-baseline gap-x-1.5"
                >
                  <dt className="text-muted-foreground">{line.label}</dt>
                  <dd className={cn('tabular-nums', TONE_TEXT[line.tone])}>
                    {formatCOP(line.amount)}
                  </dd>
                </div>
              ) : (
                <div key={line.label} className="min-w-0">
                  <dt className="text-muted-foreground text-caption-regular">{line.label}</dt>
                  <dd className={cn('text-heading-h3 tabular-nums', TONE_TEXT[line.tone])}>
                    {formatCOP(line.amount)}
                  </dd>
                </div>
              ),
            )}
          </dl>
        ) : null}
      </div>
    </Link>
  )
}

/**
 * «$44.760.000 + $8.700.000 = $53.460.000».
 *
 * Es la razon de ser del grupo: sin ella, las dos columnas parecen dos cifras
 * sueltas y no las dos mitades del total que tienen encima. Los colores repiten
 * los de las cifras de las que salen, de modo que la vista las empareja sin
 * releer los rotulos.
 *
 * PARA QUIEN NO VE LA PANTALLA no se leen simbolos —«mas» e «igual» no siempre
 * se anuncian—, se lee la frase entera; el dibujo queda oculto. Es el mismo
 * recurso de D-114: se abrevia lo visible, nunca lo que se dice.
 *
 * SE PARTE EN TRES PIEZAS, no en cinco: en el telefono la linea no cabe entera,
 * y con cada simbolo suelto la primera linea terminaba en «=» y el resultado se
 * quedaba huerfano en la siguiente. Cada operador viaja pegado a su cifra, de
 * modo que un salto solo puede caer donde se sigue entendiendo.
 *
 * La igualdad no puede no cuadrar: las dos partes se reparten a partir del
 * pendiente total en `buildCollectionBreakdown`, no se calculan por separado.
 */
function PendingEquation({ unpaid, partial }: { unpaid: number; partial: number }) {
  const total = formatCOP(unpaid + partial)

  return (
    <p className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 text-center">
      <span className="sr-only">
        {`${formatCOP(unpaid)} de las boletas sin pagos más ${formatCOP(partial)} de las boletas con abonos son los ${total} que faltan por cobrar.`}
      </span>
      <span
        aria-hidden
        className="text-data-unpaid-foreground text-body-small whitespace-nowrap tabular-nums"
      >
        {formatCOP(unpaid)}
      </span>
      <span
        aria-hidden
        className="text-data-pending-foreground text-body-small whitespace-nowrap tabular-nums"
      >
        <span className="text-muted-foreground">+</span> {formatCOP(partial)}
      </span>
      <span
        aria-hidden
        className="text-data-pending-foreground text-label-medium whitespace-nowrap tabular-nums"
      >
        <span className="text-muted-foreground">=</span> {total}
      </span>
    </p>
  )
}

/** «504 boletas», «1 boleta». El nombre de la unidad vive en `constants.ts` (D-111). */
function ticketCount(count: number): string {
  const { one, many } = LIST_ITEM_LABELS.tickets
  return `${count} ${count === 1 ? one : many}`
}
