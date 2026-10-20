import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { InventoryStatusBadge, StatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { INVENTORY_COPY } from '@/features/inventory/copy'
import { GenerationRunContinue } from '@/features/inventory/components/GenerationRunContinue'
import { getGenerationRun, listGenerationExisting } from '@/features/inventory/queries'
import { formatCount } from '@/features/inventory/rules'
import { TicketNumbersCell } from '@/features/tickets/components/TicketNumbers'
import { formatDateTimeEs } from '@/lib/dates'
import type { TicketInventoryStatus } from '@/lib/constants'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const C = INVENTORY_COPY.generator

/**
 * Una generacion por rangos: que pidio, cuanto lleva, continuarla si quedo a
 * medias y, PAGINADAS, las combinaciones que ya existian (BR-N17). Nunca la
 * lista entera de lo creado: para eso esta «Boletas», filtrada por el
 * inventario comun.
 */
export default async function GenerationRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>
  searchParams: SearchParams
}) {
  const { runId } = await params
  if (!z.uuid().safeParse(runId).success) notFound()

  const query = await searchParams
  const pageParam = Array.isArray(query.page) ? query.page[0] : query.page
  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)

  const run = await getGenerationRun(runId)
  if (!run) notFound()

  const existing = await listGenerationExisting(runId, page)

  return (
    <div className="space-y-6">
      <PageHeader
        title={C.runTitle}
        description={`${run.raffleShortCode} — ${run.raffleName}`}
        backHref="/owner/tickets/generate"
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2">
          <CardTitle className="font-mono text-base tabular-nums">
            {C.runRanges(
              run.numberFormat?.groups.map((group) => group.name) ?? [],
              run.dailyFrom,
              run.dailyTo,
              run.weeklyFrom,
              run.weeklyTo,
            )}
          </CardTitle>
          <StatusBadge tone={run.status === 'completed' ? 'success' : 'warning'}>
            {run.status === 'completed' ? C.runCompleted : C.runInProgress}
          </StatusBadge>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Combinaciones" value={formatCount(run.totalCount)} />
            <MetricCard label="Revisadas" value={formatCount(run.processedCount)} />
            <MetricCard label="Creadas" value={formatCount(run.createdCount)} />
            <MetricCard
              label="Ya existían"
              value={formatCount(run.existingCount)}
              hint={
                run.existingGeneratedCount > 0
                  ? C.previewExistingGenerated(run.existingGeneratedCount)
                  : undefined
              }
            />
          </div>

          <p className="text-muted-foreground text-sm">
            {run.createdByName ? `${run.createdByName} · ` : ''}
            {formatDateTimeEs(run.createdAt)}
          </p>

          {run.status === 'in_progress' ? (
            <GenerationRunContinue
              initial={{
                outcome: 'loaded',
                runId: run.id,
                raffleId: run.raffleId,
                totalCount: run.totalCount,
                processedCount: run.processedCount,
                createdCount: run.createdCount,
                existingCount: run.existingCount,
                existingGeneratedCount: run.existingGeneratedCount,
                status: run.status,
              }}
            />
          ) : (
            <Button asChild variant="outline" size="touch">
              <Link href={`/owner/tickets?custody=common&raffleId=${run.raffleId}`}>
                {C.viewInventory}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="generation-existing-title">
        <div className="space-y-1">
          <h2 id="generation-existing-title" className="text-lg font-semibold">
            {C.existingTitle}
          </h2>
          <p className="text-muted-foreground text-sm">{C.existingDescription}</p>
        </div>

        {existing.total === 0 ? (
          <p className="text-muted-foreground text-sm">{C.existingEmpty}</p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {existing.rows.map((row) => (
                <li
                  key={row.ticketId}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <TicketNumbersCell
                    ticket={{
                      dailyNumber: row.dailyNumber,
                      weeklyNumber: row.weeklyNumber,
                      numberFormat: run.numberFormat,
                    }}
                    href={`/owner/tickets/${row.ticketId}`}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <InventoryStatusBadge status={row.inventoryStatus as TicketInventoryStatus} />
                    <span className="text-muted-foreground text-xs">
                      {row.otherGeneration ? C.existingOtherGeneration : C.existingOtherWay}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <DataTablePagination
              total={existing.total}
              page={existing.page}
              pageSize={existing.pageSize}
              items="tickets"
            />
          </>
        )}
      </section>
    </div>
  )
}
