import { CalendarDaysIcon, RefreshCwIcon, TicketIcon, TrophyIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { EmptyState } from '@/components/data/EmptyState'
import { Notice } from '@/components/feedback/Notice'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LotteryCompactCard } from '@/features/lottery/components/LotteryCompactCard'
import { LotteryScheduleBadge } from '@/features/lottery/components/LotteryScheduleBadge'
import {
  LOTTERY_DASHBOARD_COPY as COPY,
  LOTTERY_DASHBOARD_MATCH_LINKS,
  compactMatchText,
  compactWhen,
  drawHasNumber,
  drawPlayDate,
  matchSummaryText,
  raffleSummaryText,
  relativeDayLabel,
  type LotteryDashboard,
  type LotteryDashboardAudience,
  type LotteryDrawView,
} from '@/features/lottery/dashboard'
import { formatDateEs, formatTimeEs, formatWeekdayEs, todayBogota } from '@/lib/dates'
import { cn } from '@/lib/utils'

/**
 * `full` es el recuadro de siempre; `compact`, la forma de dos filas que abre
 * el panel del vendedor (D-180).
 *
 * NO SON DOS COMPONENTES ni dos consultas: los mismos datos, el mismo límite de
 * Suspense y el MISMO detalle —lo que se despliega en `compact` es literalmente
 * lo que `full` pinta de entrada—.
 */
export type LotteryCardVariant = 'full' | 'compact'

type LotteryResultsCardProps = {
  data: LotteryDashboard
  audience: LotteryDashboardAudience
  ticketBasePath: '/owner/tickets' | '/seller/tickets'
  variant?: LotteryCardVariant
  className?: string
}

/**
 * Los dos papeles de una tarjeta, con su color (D-167).
 *
 * Azul = lo que va a pasar; verde = lo que ya pasó. El color NO va solo en
 * ninguno de los dos casos: la insignia del estado —«Programado», «Realizado»—
 * lleva su palabra escrita, y el rótulo del día también (CLAUDE.md §27). Se
 * usan las dos familias que ya distinguían esos estados en
 * `LotteryScheduleBadge`, para que la tarjeta y su insignia no hablen de
 * colores distintos.
 */
const TONE = {
  upcoming: {
    pill: 'bg-status-info-surface text-status-info-text',
    icon: 'bg-status-info-surface text-status-info-icon',
    value: 'text-status-info-text',
  },
  result: {
    pill: 'bg-status-success-surface text-status-success-text',
    icon: 'bg-status-success-surface text-status-success-icon',
    value: 'text-status-success-text',
  },
} as const

type DrawRole = keyof typeof TONE

/*
 * `hasNumber` y `playDate` vivían aquí. Se movieron a `dashboard.ts` —el módulo
 * puro— como `drawHasNumber` y `drawPlayDate` al aparecer la forma compacta,
 * que necesita las dos: una función, una definición (D-180).
 */

/** «Jueves 03 sept 2026». La fecha completa, con su día de la semana. */
function longDate(isoDate: string): string {
  const weekday = formatWeekdayEs(isoDate)
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${formatDateEs(isoDate)}`
}

/**
 * Parte la hora en la cifra y su sufijo: «11:15» + «p. m.».
 *
 * El sufijo se escribe más pequeño al lado, no dentro de la cifra grande: a
 * 320 px «11:15 p. m.» entero al tamaño del dato principal desborda la
 * tarjeta, y encoger la cifra sería renunciar justo al dato que se vino a leer.
 */
function splitTime(value: string): { clock: string; suffix: string } {
  const at = value.indexOf(' ')
  if (at === -1) return { clock: value, suffix: '' }
  return { clock: value.slice(0, at), suffix: value.slice(at + 1) }
}

/**
 * Encabezado de la hora, según el día en que se juega.
 * Devuelve `null` cuando la hora ya pasó: entonces la tarjeta dice qué falta,
 * no cuándo jugó (es la misma condición que traía `pendingCopy`).
 */
function timeBlock(
  draw: LotteryDrawView,
  today: string,
  now: Date,
): { lead: string; clock: string; suffix: string } | null {
  if (!draw.officialScheduledAt) return null
  const at = Date.parse(draw.officialScheduledAt)
  if (Number.isNaN(at) || at <= now.getTime()) return null
  const day = drawPlayDate(draw)
  const lead =
    day === today
      ? COPY.playsToday
      : relativeDayLabel(day, today) === COPY.tomorrow
        ? COPY.playsTomorrow
        : COPY.playsOn(formatWeekdayEs(day))
  return { lead, ...splitTime(formatTimeEs(draw.officialScheduledAt)) }
}

/** Lo que se dice cuando no hay número ni hora futura que mostrar. */
function pendingCopy(draw: LotteryDrawView): string {
  if (draw.resultKind === 'rejected') return COPY.rejected
  if (draw.scheduleStatus === 'cancelled' || draw.scheduleStatus === 'suspended') {
    return draw.scheduleNotice ?? COPY.pending
  }
  return COPY.pending
}

/**
 * Una tarjeta de sorteo: la de hoy o la del último resultado (D-167).
 *
 * El reparto de la información es siempre el mismo y de arriba abajo, porque
 * es el que cabe igual en un teléfono de 320 px y en media pantalla de
 * escritorio: rótulo del día e identidad de la lotería, la fecha, el DATO
 * GRANDE —la hora si todavía no ha jugado, el número mayor si ya jugó— y por
 * último lo que se deriva de él: las coincidencias con las boletas.
 *
 * `@container/draw` mide LA TARJETA, no la ventana: la misma tarjeta vive a
 * ancho completo por debajo de `lg` y a media pantalla por encima, así que un
 * `sm:` de ventana la ensancharía justo cuando se estrecha.
 */
function LotteryDrawBlock({
  draw,
  role,
  audience,
  ticketBasePath,
  today,
  now,
}: {
  draw: LotteryDrawView
  role: DrawRole
  audience: LotteryDashboardAudience
  ticketBasePath: LotteryResultsCardProps['ticketBasePath']
  today: string
  now: Date
}) {
  const tone = TONE[role]
  const day = drawPlayDate(draw)
  const showNumber = drawHasNumber(draw)
  const time = showNumber ? null : timeBlock(draw, today, now)
  const skipPending =
    draw.scheduleStatus === 'cancelled' ||
    draw.scheduleStatus === 'suspended' ||
    draw.scheduleStatus === 'schedule_unverified' ||
    draw.scheduleStatus === 'schedule_conflict'
  const summary = matchSummaryText(draw, audience)
  const raffles = raffleSummaryText(draw.raffleNames)
  const visibleMatches = draw.matches.slice(0, LOTTERY_DASHBOARD_MATCH_LINKS)
  const extraMatches = draw.matches.length - visibleMatches.length
  const hasMatches = draw.matches.length > 0
  const referenceDiffers = draw.officialDate !== null && draw.officialDate !== draw.referenceDate
  const Icon = role === 'result' ? TrophyIcon : CalendarDaysIcon

  return (
    <section
      data-slot={role === 'result' ? 'lottery-draw-result' : 'lottery-draw-upcoming'}
      aria-labelledby={`lottery-${draw.scheduleId}`}
      className="@container/draw flex min-w-0 flex-1 flex-col gap-4 rounded-xl border p-4 sm:p-5"
    >
      {/* La insignia del estado baja a su propia línea en una tarjeta estrecha
          (@xs = 20 rem de TARJETA, que en un teléfono no se alcanza nunca).
          Compartiendo fila con la identidad le quitaba a «Sorteo 3314» la
          mitad del ancho y lo partía en dos renglones: aquí se abrevia el
          espacio, nunca el término (D-114). */}
      <div className="flex min-w-0 flex-col gap-3 @xs/draw:flex-row @xs/draw:items-start @xs/draw:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone.icon)}
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <span
              className={cn(
                'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                tone.pill,
              )}
            >
              {relativeDayLabel(day, today)}
            </span>
            <h3
              id={`lottery-${draw.scheduleId}`}
              className="mt-1.5 text-xl font-semibold break-words"
            >
              {draw.lotteryLabel}
            </h3>
            <p className="text-muted-foreground text-sm">{COPY.drawNumber(draw.drawNumber)}</p>
          </div>
        </div>
        <div className="min-w-0 shrink-0">
          <LotteryScheduleBadge status={draw.scheduleStatus} />
        </div>
      </div>

      <div className="text-muted-foreground min-w-0 space-y-0.5 text-sm">
        <p className="flex min-w-0 items-center gap-1.5">
          <CalendarDaysIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{longDate(day)}</span>
        </p>
        {referenceDiffers ? (
          <p className="text-xs break-words">{COPY.referenceDay(longDate(draw.referenceDate))}</p>
        ) : null}
      </div>

      {draw.scheduleNotice ? (
        <Notice tone="warning" density="compact">
          {draw.scheduleNotice}
        </Notice>
      ) : null}

      {/* El dato grande. Va centrado en su propia franja: es lo que se viene a
          leer, y separarlo del bloque de identidad lo hace encontrable de un
          vistazo tanto apilado como al lado de la otra tarjeta.

          Cuando no hay ninguno de los tres —sorteo cancelado, suspendido o con
          el horario por confirmar— la franja NO se dibuja vacía: el aviso ámbar
          de arriba ya explica qué pasa, y un recuadro con una raya y nada
          dentro solo haría dudar de si falta algo por cargar. */}
      {showNumber && draw.winningNumber ? (
        <div className="flex min-w-0 flex-1 flex-col justify-center border-t pt-4 text-center">
          <p className="text-muted-foreground text-sm">{COPY.winningNumber}</p>
          <p
            className={cn(
              'mt-0.5 font-mono text-5xl leading-none font-bold tracking-widest tabular-nums @sm/draw:text-6xl',
              tone.value,
            )}
            aria-label={`${COPY.winningNumber} ${draw.winningNumber}`}
          >
            {draw.winningNumber}
          </p>
          {draw.series ? (
            <p className="text-muted-foreground mt-2 text-xs">
              {COPY.series} {draw.series}
            </p>
          ) : null}
        </div>
      ) : time ? (
        <div className="flex min-w-0 flex-1 flex-col justify-center border-t pt-4 text-center">
          <p className="text-muted-foreground text-sm">{time.lead}</p>
          <p
            className={cn(
              'mt-0.5 flex flex-wrap items-baseline justify-center gap-1.5 leading-none',
              tone.value,
            )}
          >
            <span className="text-4xl font-bold tabular-nums @sm/draw:text-5xl">{time.clock}</span>
            {time.suffix ? <span className="text-lg font-semibold">{time.suffix}</span> : null}
          </p>
        </div>
      ) : skipPending ? null : (
        <div className="flex min-w-0 flex-1 flex-col justify-center border-t pt-4 text-center">
          <p className="text-base font-medium">{pendingCopy(draw)}</p>
        </div>
      )}

      {draw.resultKind === 'conflict' ? (
        <Notice tone="warning" density="compact">
          {COPY.conflict}
        </Notice>
      ) : null}

      {/* Coincidencias. Con boletas coincidentes la franja se marca —borde y
          texto en negrita—, porque es la única línea de la tarjeta que puede
          obligar a hacer algo; sin ellas se dice igual, en tono suave, para no
          dejar al vendedor preguntándose si se comprobó. */}
      {summary ? (
        <div
          className={cn(
            'flex min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-sm',
            hasMatches
              ? 'border-status-info-border bg-status-info-surface text-status-info-text border font-semibold'
              : 'bg-status-info-surface/70 text-status-info-text',
          )}
        >
          <TicketIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="break-words">{summary}</p>
            {raffles ? <p className="text-xs font-normal opacity-80">{raffles}</p> : null}
            {visibleMatches.length > 0 ? (
              <ul className="space-y-0.5 pt-1 text-sm font-normal">
                {visibleMatches.map((match) => (
                  <li key={match.ticketId} className="min-w-0 break-words">
                    <Link
                      href={`${ticketBasePath}/${match.ticketId}`}
                      className="font-mono font-semibold underline-offset-2 hover:underline"
                    >
                      {match.label}
                    </Link>
                    <span className="opacity-80">
                      {' · '}
                      {match.assignmentLabel}
                      {audience === 'seller' && match.clientName ? ` · ${match.clientName}` : ''}
                    </span>
                  </li>
                ))}
                {extraMatches > 0 ? <li className="opacity-80">y {extraMatches} más</li> : null}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Procedencia del número, obligatoria y en letra pequeña (D-162,
          BR-L26): quien va a pagar un premio tiene que poder distinguir un
          número publicado por la lotería de uno confirmado por dos fuentes que
          la copian. Se escribe solo cuando hay número —es de él de quien
          habla— y al pie, para no competir con el número mismo. La hora de la
          última verificación ya no se pinta: era ruido técnico y la línea del
          pie del recuadro ya dice que esto se actualiza solo (D-167). */}
      {showNumber ? (
        <p className="text-muted-foreground min-w-0 text-xs break-words">
          {draw.sourceUrl ? (
            <a
              href={draw.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {draw.consensusSources
                ? COPY.consensusSource(draw.consensusSources)
                : COPY.officialSource}
            </a>
          ) : draw.consensusSources ? (
            <span>{COPY.consensusSource(draw.consensusSources)}</span>
          ) : draw.sourceAuthority ? (
            <span>
              {COPY.officialSource}: {draw.sourceAuthority}
            </span>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}

/**
 * Las dos tarjetas grandes, sus avisos y el pie: el cuerpo entero del recuadro.
 *
 * Se extrajo al aparecer la forma compacta (D-180) y NO cambió ni una clase:
 * es lo que el portal administrativo sigue viendo de entrada y lo que el
 * vendedor despliega en «Ver detalle». Un solo sitio que mantener.
 */
function LotteryResultsBody({
  upcoming,
  results,
  weekAlerts,
  noDrawToday,
  audience,
  ticketBasePath,
  today,
  now,
  split,
}: {
  upcoming: LotteryDrawView[]
  results: LotteryDrawView[]
  weekAlerts: LotteryDrawView[]
  noDrawToday: boolean
  audience: LotteryDashboardAudience
  ticketBasePath: LotteryResultsCardProps['ticketBasePath']
  today: string
  now: Date
  /**
   * Cuándo se ponen las dos tarjetas una al lado de otra.
   *
   * `window` es la regla de siempre (`lg:`), y el recuadro completo la conserva
   * intacta. `container` mide LA TARJETA, y lo necesita el detalle de la forma
   * compacta: vive dentro de una región de 5 de 12 columnas, así que a 1360 px
   * de ventana `lg:` la partiría en dos columnas de 190 px y rompería «Sorteo
   * 3315» en dos renglones (D-180).
   */
  split: 'window' | 'container'
}) {
  const twoColumns = upcoming.length > 0 && results.length > 0

  return (
    <div className="min-w-0 space-y-4">
      {noDrawToday ? <p className="text-muted-foreground text-sm">{COPY.noDrawToday}</p> : null}

      <div
        className={cn(
          'grid min-w-0 items-stretch gap-4',
          twoColumns &&
            (split === 'window'
              ? 'lg:grid-cols-2 lg:gap-6'
              : '@3xl/detalle:grid-cols-2 @3xl/detalle:gap-6'),
        )}
      >
        {upcoming.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-4">
            {upcoming.map((draw) => (
              <LotteryDrawBlock
                key={draw.scheduleId}
                draw={draw}
                role="upcoming"
                audience={audience}
                ticketBasePath={ticketBasePath}
                today={today}
                now={now}
              />
            ))}
          </div>
        ) : null}

        {results.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-4">
            {results.map((draw) => (
              <LotteryDrawBlock
                key={draw.scheduleId}
                draw={draw}
                role="result"
                audience={audience}
                ticketBasePath={ticketBasePath}
                today={today}
                now={now}
              />
            ))}
          </div>
        ) : null}
      </div>

      {weekAlerts.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-muted-foreground text-sm font-medium">{COPY.weekChanges}</h3>
          {weekAlerts.map((draw) => (
            <Notice key={draw.scheduleId} tone="warning" density="compact">
              {draw.scheduleNotice}
            </Notice>
          ))}
        </div>
      ) : null}

      <p className="text-muted-foreground flex items-center justify-center gap-1.5 pt-1 text-xs">
        <RefreshCwIcon className="size-3 shrink-0" aria-hidden />
        {COPY.autoUpdate}
      </p>
    </div>
  )
}

/**
 * Una de las dos filas de la forma compacta (D-180).
 *
 * ROTULO ARRIBA, DATO DEBAJO, y el dato es una sola frase con separadores: es
 * la única forma que cabe igual en los 238 px de contenido de un teléfono de
 * 320 y en los 398 de media pantalla de escritorio, sin recortar ningún término
 * ni obligar a la tarjeta a cambiar de forma dos veces.
 *
 * EL ICONO ES DECORACIÓN. Distingue de un vistazo lo que viene de lo que ya
 * pasó, pero quien no lo ve tiene el rótulo escrito al lado: ni el icono ni su
 * color llevan solos ningún significado (CLAUDE.md §27).
 */
function LotteryCompactRow({
  role,
  label,
  value,
  footnote,
}: {
  role: DrawRole
  label: string
  value: ReactNode
  footnote?: string | null
}) {
  const tone = TONE[role]
  const Icon = role === 'result' ? TrophyIcon : CalendarDaysIcon

  return (
    <div
      data-slot={role === 'result' ? 'lottery-compact-result' : 'lottery-compact-upcoming'}
      className="flex min-w-0 items-start gap-3"
    >
      <span
        className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tone.icon)}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-label-small text-muted-foreground">{label}</p>
        <p className="text-body-medium min-w-0 break-words">{value}</p>
        {footnote ? (
          <p className="text-muted-foreground mt-0.5 text-xs break-words">{footnote}</p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Recuadro compartido de resultados y próximo sorteo. Server Component: no hay
 * JavaScript de cliente y no hay fetch a páginas externas (D-147).
 *
 * QUÉ REPARTE ESTE COMPONENTE, y qué no. El reparto de sorteos —cuál es el de
 * hoy, cuál el último confirmado, qué avisos de la semana— sigue entero en
 * `buildLotteryDashboard`; aquí solo se clasifica lo que ya llegó en dos
 * columnas según tenga número publicado o no. Un sorteo de hoy ya confirmado
 * cae por eso en la columna verde, que es donde se lee un número, sin que
 * ninguna regla cambie (BR-L20).
 *
 * DOS COLUMNAS DESDE `lg`, una debajo por debajo. `lg` y no `md` porque las dos
 * páginas del Panel abren su barra lateral justo ahí: en una tableta de 768 px
 * el ancho útil de cada mitad no alcanza para un número de cuatro cifras
 * grande y su franja de coincidencias. Cuando solo hay una columna con
 * contenido, ocupa el ancho completo en vez de dejar media tarjeta vacía.
 *
 * LA FORMA COMPACTA (`variant="compact"`, D-180) abre el panel del vendedor y
 * dice lo mínimo para decidir si hay que mirar: cuándo juega la próxima lotería
 * y qué salió en la última. Todo lo demás —el número grande, la fecha completa,
 * el reparto de coincidencias con enlace a cada boleta, los cambios de
 * programación— **no se pierde**: está detrás de «Ver detalle», que es un
 * `<details>` nativo, sin JavaScript, y por tanto sigue viajando en el mismo
 * HTML y dentro del mismo límite de Suspense (D-155).
 */
export function LotteryResultsCard({
  data,
  audience,
  ticketBasePath,
  variant = 'full',
  className,
}: LotteryResultsCardProps) {
  const now = new Date()
  const today = todayBogota()

  const upcoming =
    data.kind === 'ready'
      ? [
          ...data.todayDraws.filter((draw) => !drawHasNumber(draw)),
          ...(data.nextDraw ? [data.nextDraw] : []),
        ]
      : []
  const results =
    data.kind === 'ready'
      ? [
          ...data.todayDraws.filter(drawHasNumber),
          ...(data.previousConfirmed ? [data.previousConfirmed] : []),
        ]
      : []

  if (variant === 'compact') {
    return (
      <LotteryResultsCompact
        data={data}
        upcoming={upcoming}
        results={results}
        audience={audience}
        ticketBasePath={ticketBasePath}
        today={today}
        now={now}
        className={className}
      />
    )
  }

  return (
    <Card data-slot="lottery-results" data-variant="full" className={cn('min-w-0', className)}>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <TicketIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
          <h2 className="min-w-0 break-words">{COPY.title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {data.kind === 'error' ? (
          <EmptyState title={COPY.errorTitle} description={COPY.errorDescription} />
        ) : null}

        {data.kind === 'empty' ? (
          <EmptyState title={COPY.emptyTitle} description={COPY.emptyDescription} />
        ) : null}

        {data.kind === 'ready' ? (
          <LotteryResultsBody
            upcoming={upcoming}
            results={results}
            weekAlerts={data.weekAlerts}
            noDrawToday={data.todayDraws.length === 0}
            audience={audience}
            ticketBasePath={ticketBasePath}
            today={today}
            now={now}
            split="window"
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

/** La procedencia del número, escrita igual que al pie de la tarjeta grande. */
function sourceLine(draw: LotteryDrawView): string | null {
  if (!drawHasNumber(draw)) return null
  if (draw.consensusSources) return COPY.consensusSource(draw.consensusSources)
  if (draw.sourceUrl || draw.sourceAuthority) return COPY.officialSource
  return null
}

function LotteryResultsCompact({
  data,
  upcoming,
  results,
  audience,
  ticketBasePath,
  today,
  now,
  className,
}: {
  data: LotteryDashboard
  upcoming: LotteryDrawView[]
  results: LotteryDrawView[]
  audience: LotteryDashboardAudience
  ticketBasePath: LotteryResultsCardProps['ticketBasePath']
  today: string
  now: Date
  className?: string
}) {
  const ready = data.kind === 'ready' ? data : null

  /*
   * La fila «Próxima» prefiere el sorteo de hoy que todavía no ha jugado y, si
   * no lo hay, el siguiente programado. `nextScheduled` existe justo para esto:
   * `nextDraw` se calla cuando hoy hay sorteo, y entonces esta fila —que es
   * fija— se quedaría sin nada que decir el mismo día en que se juega (D-180).
   */
  const nextUp = upcoming[0] ?? ready?.nextScheduled ?? null
  const when = nextUp ? compactWhen(nextUp, today, now) : null
  const last = results[0] ?? null

  // Lo que se despliega usa la MISMA próxima que la fila de arriba, para que
  // abrir el detalle no enseñe otra lotería distinta de la que se acaba de leer.
  const detailUpcoming = upcoming.length > 0 ? upcoming : nextUp ? [nextUp] : []

  const notices = [nextUp, last]
    .filter((draw): draw is LotteryDrawView => draw !== null && draw.scheduleNotice !== null)
    .filter((draw, index, all) => all.findIndex((d) => d.scheduleId === draw.scheduleId) === index)

  return (
    <LotteryCompactCard
      className={className}
      title={COPY.compactTitle}
      showLabel={COPY.showDetail}
      hideLabel={COPY.hideDetail}
      subject={COPY.detailSubject}
      /*
        El detalle se dibuja AQUÍ, en el servidor, y baja como un nodo ya hecho:
        el componente cliente solo decide si se ve. Sin sorteos que enseñar no
        se pasa nada, y entonces tampoco hay botón (D-181).
      */
      detail={
        ready ? (
          <LotteryResultsBody
            upcoming={detailUpcoming}
            results={results}
            weekAlerts={ready.weekAlerts}
            noDrawToday={ready.todayDraws.length === 0}
            audience={audience}
            ticketBasePath={ticketBasePath}
            today={today}
            now={now}
            split="container"
          />
        ) : null
      }
    >
      {data.kind === 'error' ? (
        <EmptyState title={COPY.errorTitle} description={COPY.errorDescription} />
      ) : null}

      {data.kind === 'empty' ? (
        <EmptyState title={COPY.emptyTitle} description={COPY.emptyDescription} />
      ) : null}

      {ready ? (
        <>
          <LotteryCompactRow
            role="upcoming"
            label={COPY.upcomingRow}
            value={
              nextUp && when ? (
                <>
                  {`${nextUp.lotteryLabel} · ${when.day}`}
                  {when.time ? (
                    <>
                      {', '}
                      {/* La hora entera o en la línea siguiente, nunca partida
                          entre «p.» y «m.», que se lee como una errata. */}
                      <span className="whitespace-nowrap">{when.time}</span>
                    </>
                  ) : null}
                </>
              ) : (
                COPY.noDrawToday
              )
            }
          />

          <LotteryCompactRow
            role="result"
            label={COPY.lastResultRow}
            value={
              last && last.winningNumber ? (
                <>
                  {last.lotteryLabel}
                  {' · '}
                  <span className="font-mono font-semibold tabular-nums">
                    <span className="sr-only">{COPY.winningNumber} </span>
                    {last.winningNumber}
                  </span>
                  {' · '}
                  {compactMatchText(last)}
                </>
              ) : (
                COPY.pending
              )
            }
            footnote={last ? sourceLine(last) : null}
          />

          {/* Un número en conflicto se avisa ARRIBA, nunca detrás del
              desplegable: la fila de al lado lo acaba de escribir como si
              fuera el resultado, y quien vaya a pagar un premio tiene que
              saber que la fuente oficial publicó otro (D-162). */}
          {last?.resultKind === 'conflict' ? (
            <Notice tone="warning" density="compact">
              {COPY.conflict}
            </Notice>
          ) : null}

          {/* Un cambio de programación tampoco: es lo único de este recuadro
              que puede obligar a hacer algo. Los de otros días de la semana
              sí van al detalle. */}
          {notices.map((draw) => (
            <Notice key={draw.scheduleId} tone="warning" density="compact">
              {draw.scheduleNotice}
            </Notice>
          ))}
        </>
      ) : null}
    </LotteryCompactCard>
  )
}
