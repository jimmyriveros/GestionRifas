'use client'

import { ClipboardCheckIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { CompactActionSlot } from '@/components/layout/CompactHeader'
import { Button } from '@/components/ui/button'
import type { DraftActivation } from '@/features/raffle-prizes/review'
import {
  RAFFLE_STATUS_LABELS,
  RAFFLE_STATUS_TRANSITIONS,
  isOwnerOnlyRaffleTransition,
  type AppRole,
  type RaffleStatus,
} from '@/lib/constants'

import { changeRaffleStatus } from '../actions'

type RaffleStatusActionsProps = {
  raffleId: string
  status: RaffleStatus
  role: AppRole
  /**
   * Cómo se activa un BORRADOR (D-202), decidido en el servidor por
   * `draftActivation`. `direct` es «Activar rifa» con su confirmación, lo de
   * siempre; `review` pone en su lugar el enlace a la revisión, y `none` no
   * ofrece activarlo. Las demás transiciones no cambian.
   */
  draftActivation?: DraftActivation
}

const TRANSITION_COPY: Record<RaffleStatus, { action: string; description: string }> = {
  draft: { action: 'Volver a borrador', description: '' },
  active: {
    action: 'Activar rifa',
    description:
      'Una rifa activa admite creación y asignación de boletas. Podrás cerrarla cuando termine.',
  },
  closed: {
    action: 'Cerrar rifa',
    description:
      'Al cerrarla no se podrán crear ni asignar más boletas. Los pagos pendientes sí podrán seguir registrándose.',
  },
  cancelled: {
    action: 'Anular rifa',
    description:
      'Anular es definitivo: la rifa no podrá reabrirse, ni admitir boletas ni pagos. Los datos históricos se conservan.',
  },
}

export function RaffleStatusActions({
  raffleId,
  status,
  role,
  draftActivation = { kind: 'direct' },
}: RaffleStatusActionsProps) {
  const router = useRouter()
  const [target, setTarget] = useState<RaffleStatus | null>(null)
  const [isPending, startTransition] = useTransition()

  // D-202: el borrador de una rifa configurable se activa desde la revisión, que
  // es la que dice qué falta. Aquí no se ofrece activarlo directamente.
  const activatesElsewhere = status === 'draft' && draftActivation.kind !== 'direct'
  const review = status === 'draft' && draftActivation.kind === 'review' ? draftActivation : null

  const available = RAFFLE_STATUS_TRANSITIONS[status].filter(
    (next) =>
      // BR-R03: el Admin no ve la accion de reabrir, y la Server Action vuelve a
      // comprobarlo por si alguien la invoca directamente.
      !(isOwnerOnlyRaffleTransition(status, next) && role !== 'owner') &&
      !(activatesElsewhere && next === 'active'),
  )

  if (available.length === 0 && !review) return null

  function confirm() {
    if (!target) return
    startTransition(async () => {
      const result = await changeRaffleStatus({ id: raffleId, status: target })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(`La rifa quedo en estado ${RAFFLE_STATUS_LABELS[target].toLowerCase()}.`)
        router.refresh()
      }
      setTarget(null)
    })
  }

  return (
    <>
      {review ? (
        <CompactActionSlot>
          <Button asChild>
            <Link href={review.href}>
              <ClipboardCheckIcon className="size-4" aria-hidden />
              {review.label}
            </Link>
          </Button>
        </CompactActionSlot>
      ) : null}

      {available.map((next) => {
        const isPrimary = next === 'active'
        const label =
          status === 'closed' && next === 'active' ? 'Reabrir rifa' : TRANSITION_COPY[next].action
        const button = (
          <Button
            type="button"
            variant={
              next === 'cancelled' ? 'destructive' : next === 'active' ? 'default' : 'outline'
            }
            onClick={() => setTarget(next)}
            disabled={isPending}
          >
            {isPrimary ? (
              status === 'closed' ? (
                <RotateCcwIcon className="size-4" aria-hidden />
              ) : (
                <PlayIcon className="size-4" aria-hidden />
              )
            ) : null}
            {label}
          </Button>
        )
        return isPrimary ? (
          <CompactActionSlot key={next}>{button}</CompactActionSlot>
        ) : (
          <span key={next} className="contents">
            {button}
          </span>
        )
      })}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
        title={target ? TRANSITION_COPY[target].action : ''}
        description={target ? TRANSITION_COPY[target].description : ''}
        confirmLabel={target ? TRANSITION_COPY[target].action : 'Confirmar'}
        destructive={target === 'cancelled'}
        pending={isPending}
        onConfirm={confirm}
      />
    </>
  )
}
