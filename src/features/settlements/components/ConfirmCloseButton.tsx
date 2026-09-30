'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'

import { confirmSettlementClose } from '../actions'
import { SETTLEMENT_COPY } from '../copy'

type Props = {
  raffleId: string
  sellerId: string
  sellerName: string
  /** La huella de las cifras a la vista: si cambio, la base no cierra nada. */
  fingerprint: string
}

/**
 * Cerrar una cuenta que quedo en $0 por otro camino que una entrega (BR-Z11):
 * una anulacion o un cambio de acuerdo. Una entrega o un premio que la dejan en
 * cero la cierran solos. Se envia la huella de lo que la persona tenia a la vista;
 * si ya no es la de hoy, no se cierra y se le pide revisar.
 */
export function ConfirmCloseButton({ raffleId, sellerId, sellerName, fingerprint }: Props) {
  const router = useRouter()
  const copy = SETTLEMENT_COPY.closeDialog
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await confirmSettlementClose({ raffleId, sellerId, fingerprint })
      if ('error' in result) {
        setError(result.error)
        return
      }
      if ('changed' in result) {
        setError(copy.changed)
        router.refresh()
        return
      }
      toast.success(copy.success)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" size="touch" className="w-full" onClick={() => setOpen(true)}>
        {SETTLEMENT_COPY.hero.closeAccount}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setError(null)
        }}
        title={copy.title}
        description={copy.description(sellerName)}
        confirmLabel={copy.confirm}
        pending={isPending}
        pendingLabel={copy.saving}
        onConfirm={confirm}
      >
        {error ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  )
}
