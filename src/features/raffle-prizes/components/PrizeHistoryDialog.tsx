'use client'

import { useEffect, useState, useTransition } from 'react'

import { Notice } from '@/components/feedback/Notice'
import { StatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTimeEs } from '@/lib/dates'

import { fetchPrizeHistory, type PrizeHistoryPage } from '../actions'
import {
  PRIZE_CHANGE_LABELS,
  PRIZE_DIGITS_FULL_LABELS,
  PRIZE_HISTORY_COPY,
  PRIZE_NUMBER_FIELD_LABELS,
  PRIZE_STATUS_LABELS,
  prizeActorLabel,
  rewardText,
  scheduleSummary,
  validityText,
} from '../copy'

/**
 * El historial de un premio (BR-J12, D-202).
 *
 * SE PIDE AL ABRIRLO, no antes: el listado de premios no carga ni una versión
 * antigua (sección 12 del encargo). Llega paginado, de la más reciente a la más
 * antigua, y la vigente se distingue de las demás con su propia insignia.
 *
 * La fecha se escribe en hora de Bogotá con el ayudante de siempre, y un actor
 * nulo se presenta como «Sistema».
 */
export function PrizeHistoryDialog({
  open,
  onOpenChange,
  prize,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prize: { id: string; title: string; versionId: string } | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{PRIZE_HISTORY_COPY.title}</DialogTitle>
          <DialogDescription>{PRIZE_HISTORY_COPY.description}</DialogDescription>
        </DialogHeader>

        {prize ? <PrizeHistoryBody prize={prize} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function PrizeHistoryBody({ prize }: { prize: { id: string; title: string; versionId: string } }) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PrizeHistoryPage | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    startTransition(async () => {
      const response = await fetchPrizeHistory({ prizeId: prize.id, page })
      if (cancelled) return
      if ('error' in response) {
        setFailed(response.error)
        return
      }
      setFailed(null)
      setResult(response.data)
    })
    return () => {
      cancelled = true
    }
  }, [prize.id, page])

  if (failed) {
    return (
      <Notice
        tone="warning"
        action={
          <Button type="button" variant="outline" size="touch" onClick={() => setPage(page)}>
            {PRIZE_HISTORY_COPY.retry}
          </Button>
        }
      >
        {PRIZE_HISTORY_COPY.failed}
      </Notice>
    )
  }

  if (!result) {
    return (
      <div className="space-y-3" aria-busy>
        <span className="sr-only">{PRIZE_HISTORY_COPY.loading}</span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const from = (result.page - 1) * result.pageSize + 1
  const to = Math.min(result.page * result.pageSize, result.total)

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {result.entries.map((entry) => (
          <li key={entry.versionId} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-small font-medium">
                  {PRIZE_HISTORY_COPY.version(entry.versionNumber)}
                </span>
                <StatusBadge tone={entry.status === 'active' ? 'success' : 'neutral'}>
                  {PRIZE_STATUS_LABELS[entry.status]}
                </StatusBadge>
                {entry.versionId === prize.versionId ? (
                  <StatusBadge tone="info">{PRIZE_HISTORY_COPY.current}</StatusBadge>
                ) : null}
              </div>
              <span className="text-muted-foreground text-body-small">
                {PRIZE_CHANGE_LABELS[entry.change]}
              </span>
            </div>

            <p className="text-muted-foreground text-body-small">
              {`${formatDateTimeEs(entry.publishedAt)} · ${PRIZE_HISTORY_COPY.by} ${prizeActorLabel(entry.publishedByName)}`}
            </p>

            <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
              <Row label={PRIZE_HISTORY_COPY.reward}>{rewardText(entry.reward)}</Row>
              <Row label={PRIZE_HISTORY_COPY.number}>
                {PRIZE_NUMBER_FIELD_LABELS[entry.numberField]}
              </Row>
              <Row label={PRIZE_HISTORY_COPY.digits}>{PRIZE_DIGITS_FULL_LABELS[entry.digits]}</Row>
              <Row label={PRIZE_HISTORY_COPY.validity}>{validityText(entry.rules)}</Row>
              <Row label={PRIZE_HISTORY_COPY.schedule}>{scheduleSummary(entry.rules)}</Row>
              {entry.conditions ? (
                <Row label={PRIZE_HISTORY_COPY.conditions}>{entry.conditions}</Row>
              ) : null}
            </dl>
          </li>
        ))}
      </ol>

      {result.total > result.pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-body-small">
            {PRIZE_HISTORY_COPY.counter(from, to, result.total)}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending || result.page <= 1}
              onClick={() => setPage(result.page - 1)}
            >
              {PRIZE_HISTORY_COPY.previous}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending || to >= result.total}
              onClick={() => setPage(result.page + 1)}
            >
              {PRIZE_HISTORY_COPY.next}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-body-small">{label}</dt>
      <dd className="text-body-small break-words">{children}</dd>
    </div>
  )
}
