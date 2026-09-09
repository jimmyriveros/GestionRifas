import Link from 'next/link'
import type { ReactNode } from 'react'

import { StatusBadge } from '@/components/data/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { tourTarget } from '@/features/tour/tours'
import { LIST_ITEM_LABELS } from '@/lib/constants'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import type { CollectionBreakdown } from '../collection-breakdown'
import { TONE_FILL, TONE_TEXT, type MoneyTone } from '../tones'

type CollectionBreakdownSectionProps = {
  counts: { unpaid: number; partial: number; paid: number }
  breakdown: CollectionBreakdown
  /** A que listado llevan los bloques. Es lo UNICO que cambia entre portales. */
  basePath: '/owner/tickets' | '/seller/tickets'
  className?: string
}

/**
 * «Boletas vendidas según su pago»: el reparto del dinero por estado de pago.
 *
 * SE EXTRAJO DE `CollectionStateCard` (D-182) y no cambio ni una clase ni un
 * texto. Nacio en el panel del vendedor con D-171, y el panel administrativo
 * necesita exactamente lo mismo: los tres recuentos, el dinero que les
 * corresponde y el enlace a su lista ya filtrada. Duplicarlo habria dejado dos
 * copias de la unica parte del producto donde una etiqueta de estado NO puede
 * rotular una cifra de dinero — la regla mas facil de romper sin darse cuenta.
 *
 * LO UNICO QUE CAMBIA ENTRE LOS DOS PORTALES es `basePath`. Los rotulos no:
 * «Deben», «Todavía deben», «Ya abonaron» y «Cobrado» describen lo que hacen
 * los CLIENTES, no quien mira la pantalla, asi que valen igual para el vendedor
 * que cobra y para quien administra la organizacion.
 *
 * EL CONTENEDOR ES ESTA SECCION, no la tarjeta que la envuelve. Antes las
 * consultas miraban `@container/estado`, declarado en el `CardContent` del
 * vendedor; ahora la seccion declara el suyo. Mide lo mismo —es hija directa a
 * ancho completo de aquel— y a cambio la pieza se puede montar en cualquier
 * tarjeta sin que quien la monte tenga que acordarse de nombrar un contenedor.
 *
 * CUANDO EL REPARTO NO SE PUEDE DEMOSTRAR (D-172), `breakdown.detail` llega
 * vacio: se pintan los recuentos y sus enlaces, y **ninguna cifra de dinero ni
 * la ecuacion**, porque no habria forma de sostenerlas.
 */
export function CollectionBreakdownSection({
  counts,
  breakdown,
  basePath,
  className,
}: CollectionBreakdownSectionProps) {
  const { pending, detail } = breakdown

  // El recuento del grupo y el del titulo salen de los MISMOS tres numeros que
  // se pintan debajo: la seccion promete que las categorias suman su titulo, y
  // esa promesa no puede depender de que dos filtros distintos coincidan.
  const toCollectCount = counts.unpaid + counts.partial
  const soldCount = toCollectCount + counts.paid

  return (
    <section className={cn('@container/cobro space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-heading-h4">Boletas vendidas según su pago</h3>
        <Badge variant="secondary">
          {soldCount === 1 ? '1 boleta vendida' : `${soldCount} boletas vendidas`}
        </Badge>
      </div>

      {/* GRUPO 1 — lo que falta por cobrar, con las dos formas que tiene de
          faltar. Va primero porque es sobre lo que se puede actuar hoy.

          Y es el anclaje del recorrido, en vez de la seccion entera: con las
          tres cifras dentro, el globo no cabia en un telefono —se midio a 943 px
          sobre una pantalla de 840— y ademas el paso habla justo de estas dos. */}
      <div
        {...tourTarget('metrics-collection')}
        className="bg-muted/40 space-y-3 rounded-lg border p-3 @min-[380px]/cobro:p-4"
      >
        <GroupHeading tone="pending" name="Falta cobrar" count={toCollectCount} amount={pending} />

        <div className="grid gap-3 @min-[380px]/cobro:grid-cols-2">
          <StateBlock
            tone="unpaid"
            name="Sin pagos"
            count={counts.unpaid}
            href={`${basePath}?inventoryStatus=assigned&paymentStatus=unpaid`}
            /* Una boleta de la que no ha entrado nada debe su precio entero: lo
               que falta y lo que vale son la misma cifra, y por eso lleva el rol
               que pide atencion y no el gris. */
            money={
              detail ? [{ label: 'Deben', amount: detail.pendingBy.unpaid, tone: 'unpaid' }] : []
            }
          />

          <StateBlock
            tone="partial"
            name="Con abonos"
            count={counts.partial}
            href={`${basePath}?inventoryStatus=assigned&paymentStatus=partial`}
            /* LAS DOS CIFRAS QUE ANTES SE CONFUNDIAN EN UNA. Lo que todavia
               deben es «todavia no» y va en gris; lo que ya abonaron es dinero
               recibido y lleva el rol de los abonos. El valor de venta de estas
               boletas —la suma de las dos— no se escribe: era justo la cifra que
               se leia mal. */
            money={
              detail
                ? [
                    { label: 'Todavía deben', amount: detail.pendingBy.partial, tone: 'pending' },
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
          <PendingEquation unpaid={detail.pendingBy.unpaid} partial={detail.pendingBy.partial} />
        ) : null}
      </div>

      {/* GRUPO 2 — lo que ya no hay que cobrar. Bloque aparte y no una tercera
          columna: no comparte total con las de arriba. */}
      <StateBlock
        tone="paid"
        name="Pagadas"
        count={counts.paid}
        href={`${basePath}?inventoryStatus=assigned&paymentStatus=paid`}
        wide
        badge={<StatusBadge tone="success">Pago completo</StatusBadge>}
        money={detail ? [{ label: 'Cobrado', amount: detail.collectedOnPaid, tone: 'paid' }] : []}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

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
 * ES UN ENLACE ENTERO a la lista ya filtrada: ver que tienes 373 boletas sin
 * pagos y no poder llegar a ellas seria dejar el trabajo a medias. Al ocupar
 * todo el bloque, el area que se toca pasa holgadamente de los 44 px.
 *
 * EL DINERO VA APILADO —rotulo encima, cifra debajo— y no en una fila con el
 * rotulo a la izquierda: en dos columnas dentro de una tarjeta de media
 * pantalla, «Todavia deben» y «$8.700.000» no caben en la misma linea, y la
 * cifra es lo ultimo que puede encogerse.
 *
 * `wide` es para el bloque que va SOLO a lo ancho —«Pagadas»—: ahi el reparto
 * en columna deja media tarjeta vacia, asi que en cuanto hay sitio el dinero se
 * va a la derecha, como en el encabezado del grupo de arriba. Es la misma pieza
 * con dos disposiciones, no dos piezas.
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
      className="hover:bg-accent focus-visible:ring-ring bg-card block min-w-0 rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none @min-[380px]/cobro:p-4"
    >
      <div
        className={cn(
          'flex flex-col gap-3',
          wide &&
            '@min-[380px]/cobro:flex-row @min-[380px]/cobro:items-center @min-[380px]/cobro:justify-between @min-[380px]/cobro:gap-4',
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
          <dl className={cn('space-y-2', wide && '@min-[380px]/cobro:text-right')}>
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
