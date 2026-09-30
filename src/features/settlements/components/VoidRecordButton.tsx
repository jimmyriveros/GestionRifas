'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { voidSettlementPrizePayment, voidSettlementTransfer } from '../actions'
import { SETTLEMENT_COPY } from '../copy'
import { voidPrizePaymentSchema, voidTransferSchema } from '../schemas'

type Props = {
  kind: 'transfer' | 'prize'
  id: string
  amount: number
  /** «Anular la entrega del 25 sept 2026»: el verbo solo no dice cual. */
  ariaLabel: string
}

/**
 * Anular una entrega o un pago de premio confirmados por error (BR-Z14).
 *
 * La fila no se borra: queda en el historial, marcada, con su motivo. Un cierre
 * que la incluia tampoco cambia; la cuenta pasa a enseñar la diferencia. Solo se
 * ofrece a quien pudo confirmarlo, y la base lo vuelve a exigir.
 *
 * El motivo sobrevive a un rechazo del servidor: solo se limpia al cerrar, como
 * en «Liberar boleta» (D-169).
 */
export function VoidRecordButton({ kind, id, amount, ariaLabel }: Props) {
  const router = useRouter()
  const ids = useId()
  const copy = SETTLEMENT_COPY.voidDialog
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const transfer = kind === 'transfer'

  function confirm() {
    const parsed = transfer
      ? voidTransferSchema.safeParse({ transferId: id, reason })
      : voidPrizePaymentSchema.safeParse({ paymentId: id, reason })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? copy.reasonLength)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = transfer
        ? await voidSettlementTransfer({ transferId: id, reason })
        : await voidSettlementPrizePayment({ paymentId: id, reason })
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(transfer ? copy.successTransfer : copy.successPrize)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      {/* Fantasma y alineado al texto de su fila (`-ms-4` le devuelve su
          relleno), pero con la diana de 44 px del telefono. */}
      <Button
        type="button"
        variant="ghost"
        size="touch"
        className="text-destructive hover:text-destructive -ms-4"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        {transfer ? SETTLEMENT_COPY.transfers.void : SETTLEMENT_COPY.prizes.void}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setReason('')
            setError(null)
          }
        }}
        title={transfer ? copy.transferTitle : copy.prizeTitle}
        description={transfer ? copy.transferDescription(amount) : copy.prizeDescription(amount)}
        confirmLabel={transfer ? copy.confirmTransfer : copy.confirmPrize}
        pending={isPending}
        pendingLabel={copy.saving}
        destructive
        confirmDisabled={reason.trim().length < 5}
        onConfirm={confirm}
      >
        <div className="space-y-3">
          {error ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
            >
              {error}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-reason`}>{copy.reason}</Label>
            <Input
              id={`${ids}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={isPending}
              maxLength={500}
              size="touch"
              aria-describedby={`${ids}-reason-hint`}
            />
            <p id={`${ids}-reason-hint`} className="text-muted-foreground text-xs">
              {copy.reasonHint}
            </p>
          </div>
        </div>
      </ConfirmDialog>
    </>
  )
}
