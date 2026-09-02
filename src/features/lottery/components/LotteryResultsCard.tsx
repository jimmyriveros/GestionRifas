import Link from 'next/link'

import { EmptyState } from '@/components/data/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LotteryScheduleBadge } from '@/features/lottery/components/LotteryScheduleBadge'
import {
  LOTTERY_DASHBOARD_COPY as COPY,
  LOTTERY_DASHBOARD_MATCH_LINKS,
  matchSummaryText,
  raffleSummaryText,
  type LotteryDashboard,
  type LotteryDashboardAudience,
  type LotteryDrawView,
} from '@/features/lottery/dashboard'
import { formatDateEs, formatDateTimeEs, formatTimeEs, formatWeekdayEs } from '@/lib/dates'
import { cn } from '@/lib/utils'

type LotteryResultsCardProps = {
  data: LotteryDashboard
  audience: LotteryDashboardAudience
  ticketBasePath: '/owner/tickets' | '/seller/tickets'
  className?: string
}

function verifiedLabel(draw: LotteryDrawView): string | null {
  if (!draw.lastVerifiedAt) return null
  const stamp = formatDateTimeEs(draw.lastVerifiedAt)
  return draw.resultKind === 'none'
    ? `${COPY.scheduleVerified}: ${stamp}`
    : `${COPY.lastVerified}: ${stamp}`
}

function pendingCopy(draw: LotteryDrawView, now: Date): string {
  if (draw.resultKind === 'rejected') return COPY.rejected
  if (draw.scheduleStatus === 'cancelled' || draw.scheduleStatus === 'suspended') {
    return draw.scheduleNotice ?? COPY.pending
  }
  if (draw.officialScheduledAt) {
    const at = Date.parse(draw.officialScheduledAt)
    if (!Number.isNaN(at) && at > now.getTime()) {
      return `Se juega el ${formatWeekdayEs(draw.officialScheduledAt)} a las ${formatTimeEs(draw.officialScheduledAt)}.`
    }
  }
  return COPY.pending
}

function LotteryDrawBlock({
  draw,
  audience,
  ticketBasePath,
  heading,
  now,
}: {
  draw: LotteryDrawView
  audience: LotteryDashboardAudience
  ticketBasePath: LotteryResultsCardProps['ticketBasePath']
  heading?: string
  now: Date
}) {
  const showNumber = draw.resultKind === 'confirmed' || draw.resultKind === 'conflict'
  const skipPending =
    draw.scheduleStatus === 'cancelled' ||
    draw.scheduleStatus === 'suspended' ||
    draw.scheduleStatus === 'schedule_unverified' ||
    draw.scheduleStatus === 'schedule_conflict'
  const summary = matchSummaryText(draw, audience)
  const raffles = raffleSummaryText(draw.raffleNames)
  const verified = verifiedLabel(draw)
  const officialDiffers = draw.officialDate !== null && draw.officialDate !== draw.referenceDate
  const visibleMatches = draw.matches.slice(0, LOTTERY_DASHBOARD_MATCH_LINKS)
  const extraMatches = draw.matches.length - visibleMatches.length

  return (
    <section className="min-w-0 space-y-3" aria-labelledby={`lottery-${draw.scheduleId}`}>
      {heading ? <h3 className="text-muted-foreground text-sm font-medium">{heading}</h3> : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`lottery-${draw.scheduleId}`} className="text-base font-semibold">
            {draw.lotteryLabel}
          </h3>
          <p className="text-muted-foreground text-sm">
            Sorteo {draw.drawNumber}
            {' · '}
            correspondiente al {formatWeekdayEs(draw.referenceDate)}{' '}
            {formatDateEs(draw.referenceDate)}
          </p>
          {officialDiffers && draw.officialScheduledAt ? (
            <p className="text-muted-foreground text-sm">
              Se juega el {formatWeekdayEs(draw.officialScheduledAt)}{' '}
              {formatDateTimeEs(draw.officialScheduledAt)}
            </p>
          ) : null}
        </div>
        <LotteryScheduleBadge status={draw.scheduleStatus} />
      </div>

      {draw.scheduleNotice ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
          {draw.scheduleNotice}
        </p>
      ) : null}

      {showNumber && draw.winningNumber ? (
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">{COPY.winningNumber}</p>
          <p
            className="font-mono text-4xl font-semibold tracking-widest tabular-nums"
            aria-label={`${COPY.winningNumber} ${draw.winningNumber}`}
          >
            {draw.winningNumber}
          </p>
          {draw.series ? (
            <p className="text-muted-foreground mt-1 text-sm">
              {COPY.series} {draw.series}
            </p>
          ) : null}
        </div>
      ) : skipPending ? null : (
        <p className="text-sm">{pendingCopy(draw, now)}</p>
      )}

      {draw.resultKind === 'conflict' ? (
        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm dark:border-rose-900 dark:bg-rose-950">
          {COPY.conflict}
        </p>
      ) : null}

      {summary ? (
        <div className="space-y-1 text-sm">
          <p>{summary}</p>
          {raffles ? <p className="text-muted-foreground">{raffles}</p> : null}
        </div>
      ) : null}

      {visibleMatches.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {visibleMatches.map((match) => (
            <li key={match.ticketId} className="min-w-0">
              <Link
                href={`${ticketBasePath}/${match.ticketId}`}
                className="font-mono hover:underline"
              >
                {match.label}
              </Link>
              <span className="text-muted-foreground">
                {' · '}
                {match.assignmentLabel}
                {audience === 'seller' && match.clientName ? ` · ${match.clientName}` : ''}
              </span>
            </li>
          ))}
          {extraMatches > 0 ? (
            <li className="text-muted-foreground">y {extraMatches} más</li>
          ) : null}
        </ul>
      ) : null}

      <p className="text-muted-foreground text-xs">
        {draw.sourceUrl ? (
          <a href={draw.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {/* Un numero confirmado por consenso NO se presenta como oficial:
                se dice cuantas fuentes lo respaldan (D-162, BR-L26). */}
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
        {verified ? (
          <>
            {draw.sourceUrl || draw.sourceAuthority ? ' · ' : null}
            {verified}
          </>
        ) : null}
      </p>
    </section>
  )
}

/**
 * Recuadro compartido de resultados oficiales. Server Component: no hay
 * JavaScript de cliente y no hay fetch a paginas externas (D-147).
 */
export function LotteryResultsCard({
  data,
  audience,
  ticketBasePath,
  className,
}: LotteryResultsCardProps) {
  const now = new Date()

  return (
    <Card data-slot="lottery-results" className={cn('min-w-0', className)}>
      <CardHeader>
        <CardTitle className="text-base">
          <h2>{COPY.title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-6">
        {data.kind === 'error' ? (
          <EmptyState title={COPY.errorTitle} description={COPY.errorDescription} />
        ) : null}

        {data.kind === 'empty' ? (
          <EmptyState title={COPY.emptyTitle} description={COPY.emptyDescription} />
        ) : null}

        {data.kind === 'ready' ? (
          <>
            {data.todayDraws.length === 0 ? (
              <p className="text-sm">{COPY.noDrawToday}</p>
            ) : (
              data.todayDraws.map((draw) => (
                <LotteryDrawBlock
                  key={draw.scheduleId}
                  draw={draw}
                  audience={audience}
                  ticketBasePath={ticketBasePath}
                  now={now}
                />
              ))
            )}

            {data.nextDraw ? (
              <LotteryDrawBlock
                draw={data.nextDraw}
                audience={audience}
                ticketBasePath={ticketBasePath}
                heading={COPY.nextDraw}
                now={now}
              />
            ) : null}

            {data.previousConfirmed ? (
              <LotteryDrawBlock
                draw={data.previousConfirmed}
                audience={audience}
                ticketBasePath={ticketBasePath}
                heading={COPY.lastResult}
                now={now}
              />
            ) : null}

            {data.weekAlerts.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-muted-foreground text-sm font-medium">{COPY.weekChanges}</h3>
                {data.weekAlerts.map((draw) => (
                  <p
                    key={draw.scheduleId}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950"
                  >
                    {draw.scheduleNotice}
                  </p>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
