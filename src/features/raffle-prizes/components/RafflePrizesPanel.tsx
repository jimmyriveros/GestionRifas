'use client'

import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'

import { archivePrize, reorderPrizes, restorePrize } from '../actions'
import { PRIZE_PANEL_COPY } from '../copy'
import { PRIZE_LIMITS } from '../schemas'
import { PrizeDialog } from './PrizeDialog'
import { PrizeHistoryDialog } from './PrizeHistoryDialog'
import { PrizeList } from './PrizeList'

import type { PrizeListItem, PrizeRaffleContext } from '../queries'

/**
 * El panel de premios de una rifa (D-202).
 *
 * Los premios llegan del servidor y esta pantalla NO los vuelve a consultar: lo
 * que cambia lo refresca `revalidatePath` desde cada Server Action, más un
 * `router.refresh()` al terminar. Sin estado global, sin sondeo y sin Realtime
 * (el patrón de D-185).
 *
 * EL ORDEN SE CAMBIA CON «Subir» y «Bajar», no arrastrando: arrastrar en un
 * teléfono compite con el desplazamiento de la página y no tiene equivalente de
 * teclado. Cada pulsación manda la lista COMPLETA, que es lo que espera la RPC
 * y lo que hace la operación idempotente.
 *
 * UNA RIFA CERRADA O ANULADA ES DE SOLO LECTURA: no se ofrece ninguna acción
 * que la base vaya a rechazar; se explica por qué (`UX_COPY_GUIDELINES` §5).
 */
export function RafflePrizesPanel({
  raffle,
  prizes,
}: {
  raffle: PrizeRaffleContext
  prizes: PrizeListItem[]
}) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PrizeListItem | undefined>(undefined)
  const [historyPrize, setHistoryPrize] = useState<PrizeListItem | null>(null)
  const [archiving, setArchiving] = useState<PrizeListItem | null>(null)
  const [restoring, setRestoring] = useState<PrizeListItem | null>(null)
  const [isPending, startTransition] = useTransition()

  const active = prizes.filter((prize) => prize.status === 'active')
  const archived = prizes.filter((prize) => prize.status === 'archived')
  const isFull = active.length >= PRIZE_LIMITS.activePrizesMax
  const readOnly = raffle.status === 'closed' || raffle.status === 'cancelled'
  const editable = !readOnly && !isPending

  function openCreate() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(prize: PrizeListItem) {
    setEditing(prize)
    setDialogOpen(true)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= active.length) return

    const ids = active.map((prize) => prize.id)
    const moved = ids[index]!
    ids[index] = ids[target]!
    ids[target] = moved

    startTransition(async () => {
      const result = await reorderPrizes({ raffleId: raffle.id, prizeIds: ids })
      if ('error' in result) {
        toast.error(result.error)
        router.refresh()
        return
      }
      toast.success(PRIZE_PANEL_COPY.reordered)
      router.refresh()
    })
  }

  function confirmArchive() {
    if (!archiving) return
    const prize = archiving
    startTransition(async () => {
      const result = await archivePrize({
        prizeId: prize.id,
        expectedVersionId: prize.versionId,
      })
      if ('error' in result) {
        toast.error(result.error)
        setArchiving(null)
        router.refresh()
        return
      }
      setArchiving(null)
      toast.success(PRIZE_PANEL_COPY.archived)
      router.refresh()
    })
  }

  function confirmRestore() {
    if (!restoring) return
    const prize = restoring
    startTransition(async () => {
      const result = await restorePrize({
        prizeId: prize.id,
        expectedVersionId: prize.versionId,
      })
      if ('error' in result) {
        toast.error(result.error)
        setRestoring(null)
        router.refresh()
        return
      }
      setRestoring(null)
      toast.success(PRIZE_PANEL_COPY.restored)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {readOnly ? <Notice tone="neutral">{PRIZE_PANEL_COPY.readOnlyNotice}</Notice> : null}
      {raffle.status === 'active' ? (
        <Notice tone="info">{PRIZE_PANEL_COPY.activeNotice}</Notice>
      ) : null}

      <PrizeList
        prizes={active}
        emptyAction={
          readOnly ? undefined : (
            <Button size="touch" onClick={openCreate}>
              <PlusIcon className="size-4" aria-hidden />
              {PRIZE_PANEL_COPY.add}
            </Button>
          )
        }
        renderActions={(prize, index) => (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              disabled={!editable || index === 0}
              onClick={() => move(index, -1)}
            >
              <ChevronUpIcon className="size-4" aria-hidden />
              <span className="sr-only">{`${PRIZE_PANEL_COPY.moveUp}: ${prize.title}`}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              disabled={!editable || index === active.length - 1}
              onClick={() => move(index, 1)}
            >
              <ChevronDownIcon className="size-4" aria-hidden />
              <span className="sr-only">{`${PRIZE_PANEL_COPY.moveDown}: ${prize.title}`}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={!editable}
              onClick={() => openEdit(prize)}
            >
              {PRIZE_PANEL_COPY.edit}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="touch"
              disabled={isPending}
              onClick={() => setHistoryPrize(prize)}
            >
              {PRIZE_PANEL_COPY.history}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="touch"
              disabled={!editable}
              onClick={() => setArchiving(prize)}
            >
              {PRIZE_PANEL_COPY.archive}
            </Button>
          </>
        )}
      />

      {active.length > 1 ? (
        <p className="text-muted-foreground text-body-small">{PRIZE_PANEL_COPY.orderHelp}</p>
      ) : null}

      {active.length > 0 && !readOnly ? (
        <div className="space-y-2">
          <Button size="touch" onClick={openCreate} disabled={isFull || isPending}>
            <PlusIcon className="size-4" aria-hidden />
            {PRIZE_PANEL_COPY.add}
          </Button>
          {/* El tope se dice cuando estorba, no antes (D-188). */}
          {isFull ? (
            <p className="text-muted-foreground text-body-small">{PRIZE_PANEL_COPY.addBlocked}</p>
          ) : null}
        </div>
      ) : null}

      {archived.length > 0 ? (
        <section className="space-y-3 border-t pt-6">
          <h3 className="text-heading-h5">{PRIZE_PANEL_COPY.archivedTitle}</h3>
          <p className="text-muted-foreground text-body-small">{PRIZE_PANEL_COPY.archivedHelp}</p>
          <PrizeList
            prizes={archived}
            renderActions={(prize) => (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  disabled={isPending}
                  onClick={() => setHistoryPrize(prize)}
                >
                  {PRIZE_PANEL_COPY.history}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  disabled={!editable || isFull}
                  onClick={() => setRestoring(prize)}
                >
                  {PRIZE_PANEL_COPY.restore}
                </Button>
              </>
            )}
          />
        </section>
      ) : null}

      <PrizeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        raffle={{ id: raffle.id, startDate: raffle.startDate, endDate: raffle.endDate }}
        prize={editing}
      />

      <PrizeHistoryDialog
        open={historyPrize !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryPrize(null)
        }}
        prize={historyPrize}
      />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null)
        }}
        title={PRIZE_PANEL_COPY.archiveConfirm.title}
        description={PRIZE_PANEL_COPY.archiveConfirm.description}
        confirmLabel={PRIZE_PANEL_COPY.archiveConfirm.confirm}
        pendingLabel={PRIZE_PANEL_COPY.archiveConfirm.pending}
        pending={isPending}
        onConfirm={confirmArchive}
      />

      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(open) => {
          if (!open) setRestoring(null)
        }}
        title={PRIZE_PANEL_COPY.restoreConfirm.title}
        description={PRIZE_PANEL_COPY.restoreConfirm.description}
        confirmLabel={PRIZE_PANEL_COPY.restoreConfirm.confirm}
        pendingLabel={PRIZE_PANEL_COPY.restoreConfirm.pending}
        pending={isPending}
        onConfirm={confirmRestore}
      />
    </div>
  )
}
