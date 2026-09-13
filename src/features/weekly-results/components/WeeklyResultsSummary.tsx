import { StatusBadge } from '@/components/data/StatusBadge'
import { Notice } from '@/components/feedback/Notice'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatDayMonthEs } from '@/lib/dates'

import { WEEKLY_RESULTS_COPY as COPY, lotteryWeekdayLabel, missingLotteriesText } from '../copy'
import type { WeeklyResults } from '../results'
import { formatWeekLong } from '../week'

/**
 * La semana, su estado y los seis resultados (BR-H02, BR-H03).
 *
 * EL ESTADO SE DICE CON CIFRAS Y CON PALABRAS: la insignia cuenta «6 de 6
 * resultados» y el aviso nombra las loterías que faltan. El verde y el ámbar
 * solo lo subrayan (CLAUDE.md §27).
 *
 * Una lotería sin confirmar NO enseña número, ni siquiera el de un conflicto: lo
 * que se ve aquí es lo mismo que irá en la imagen (BR-L08). Los números se
 * escriben como texto, con sus ceros.
 *
 * Sin estado propio ni efectos: se pinta en el servidor.
 */
export function WeeklyResultsSummary({
  results,
  raffleName,
}: {
  results: Exclude<WeeklyResults, { kind: 'error' }>
  /** `null` cuando el catálogo no tiene una rifa que pueda encabezar la imagen. */
  raffleName: string | null
}) {
  const confirmed = results.results.filter((result) => result.status === 'confirmed').length
  const ready = results.kind === 'ready'

  return (
    <Card data-slot="weekly-results-summary" data-state={results.kind} className="gap-4">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="min-w-0 space-y-1">
          <h2 className="text-heading-h4">{COPY.week.heading(formatWeekLong(results.week))}</h2>
          {raffleName === null ? null : (
            <p className="text-body-small text-muted-foreground break-words">
              {COPY.week.raffle(raffleName)}
            </p>
          )}
        </div>
        <StatusBadge tone={ready ? 'success' : 'warning'}>
          {COPY.week.count(confirmed, results.results.length)}
        </StatusBadge>
      </CardHeader>

      <CardContent className="space-y-4">
        {raffleName === null ? <Notice tone="warning">{COPY.week.noRaffle}</Notice> : null}
        {results.kind === 'pending' ? (
          <Notice tone="warning">
            {COPY.week.pending(missingLotteriesText(results.missing), results.missing.length)}
          </Notice>
        ) : null}

        <ul className="divide-y" aria-label={COPY.week.listLabel}>
          {results.results.map((result) => (
            <li
              key={result.code}
              data-lottery={result.code}
              data-status={result.status}
              className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-body-medium font-medium">{result.label}</p>
                <p className="text-body-small text-muted-foreground">
                  {COPY.row.detail(
                    lotteryWeekdayLabel(result.code),
                    formatDayMonthEs(result.referenceDate),
                    COPY.row.field[result.matchField],
                  )}
                </p>
              </div>
              {result.status === 'confirmed' ? (
                <p className="text-heading-h3 shrink-0 tabular-nums">
                  <span className="sr-only">{COPY.row.numberLabel} </span>
                  {result.winningNumber}
                </p>
              ) : (
                <StatusBadge tone={result.status === 'pending' ? 'neutral' : 'warning'}>
                  {COPY.row.status[result.status]}
                </StatusBadge>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
