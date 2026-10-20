import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'

import { LinearProgress } from '@/components/data/LinearProgress'
import { StatusBadge } from '@/components/data/StatusBadge'
import { formatDateTimeEs } from '@/lib/dates'

import { INVENTORY_COPY } from '../copy'
import type { GenerationRun } from '../queries'
import { formatCount } from '../rules'

const C = INVENTORY_COPY.generator

/**
 * Las generaciones recientes: primero las que quedaron sin terminar, que son las
 * que piden algo —continuarlas—. Cada fila lleva a su detalle, donde se continua
 * y se consultan, paginadas, las combinaciones que ya existian.
 */
export function GenerationRunsList({ runs }: { runs: GenerationRun[] }) {
  if (runs.length === 0) {
    return <p className="text-muted-foreground text-sm">{C.runsEmpty}</p>
  }

  return (
    <ul className="divide-y rounded-lg border">
      {runs.map((run) => (
        <li key={run.id}>
          <Link
            href={`/owner/tickets/generate/${run.id}`}
            className="hover:bg-accent focus-visible:ring-ring flex items-center justify-between gap-3 p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {run.raffleShortCode} — {run.raffleName}
                </span>
                <StatusBadge tone={run.status === 'completed' ? 'success' : 'warning'}>
                  {run.status === 'completed' ? C.runCompleted : C.runInProgress}
                </StatusBadge>
              </div>
              <p className="text-muted-foreground font-mono text-sm tabular-nums">
                {C.runRanges(
                  run.numberFormat?.groups.map((group) => group.name) ?? [],
                  run.dailyFrom,
                  run.dailyTo,
                  run.weeklyFrom,
                  run.weeklyTo,
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                {C.runCounts(run.processedCount, run.totalCount, run.createdCount)} ·{' '}
                {formatDateTimeEs(run.createdAt)}
              </p>
              {run.status !== 'completed' ? (
                <LinearProgress
                  value={run.processedCount}
                  max={run.totalCount}
                  label={C.progressLabel}
                  valueText={`${formatCount(run.processedCount)} de ${formatCount(run.totalCount)}`}
                  className="max-w-xs"
                />
              ) : null}
            </div>
            <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
            <span className="sr-only">{C.runOpen}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
