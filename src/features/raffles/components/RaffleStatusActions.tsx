'use client'

import { PlayIcon, RotateCcwIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { CompactActionSlot } from '@/components/layout/CompactHeader'
import { Button } from '@/components/ui/button'
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

export function RaffleStatusActions({ raffleId, status, role }: RaffleStatusActionsProps) {
  const router = useRouter()
  const [target, setTarget] = useState<RaffleStatus | null>(null)
  const [isPending, startTransition] = useTransition()

  const available = RAFFLE_STATUS_TRANSITIONS[status].filter(
    // BR-R03: el Admin no ve la accion de reabrir, y la Server Action vuelve a
    // comprobarlo por si alguien la invoca directamente.
    (next) => !(isOwnerOnlyRaffleTransition(status, next) && role !== 'owner'),
  )

  if (available.length === 0) return null

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
