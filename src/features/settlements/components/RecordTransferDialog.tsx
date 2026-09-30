'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { focusTargetAfterClose, restoreFocus } from '@/components/feedback/restore-focus'

import { StatusBadge } from '@/components/data/StatusBadge'
import { MoneyInput } from '@/components/form/MoneyInput'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { todayBogota } from '@/lib/dates'
import { cn } from '@/lib/utils'

import { recordSettlementTransfer } from '../actions'
import { SETTLEMENT_COPY } from '../copy'
import { recordTransferSchema } from '../schemas'
import { BalanceList, BalanceRow } from './BalanceRows'

type Props = {
  raffleId: string
  /** El titular de la cuenta: quien entrega, o quien recibe la devolucion. */
  sellerId: string
  kind: 'delivery' | 'refund'
  /**
   * De quien viene el dinero, para la frase del dialogo: el vendedor que entrega
   * o, en una devolucion, su vendedor a cargo. Una devolucion del dueño no lleva
   * nombre: la dice `fromOwner`.
   */
  fromName: string
  fromOwner?: boolean
  /** El saldo que la persona tiene a la vista. Si cambio al confirmar, no se guarda nada. */
  balance: number
  /** Premios sin pago registrado: con ellos la cuenta no se cierra aunque quede en $0. */
  awardsUnpaid: number
  triggerLabel: string
  triggerAria?: string
  triggerVariant?: 'default' | 'outline'
  fullWidth?: boolean
}

/**
 * Confirmar dinero recibido: una entrega, o una devolucion (BR-Z05, BR-Z06).
 *
 * ES LA «Receipt Dialog» DE LA PROPUESTA (`329:771`), construida con el `Dialog`
 * de siempre: importe, fecha y el saldo que quedara. Lo confirma QUIEN RECIBE
 * —la base lo exige—, asi que este dialogo solo se ofrece a quien puede.
 *
 * NADA SE CALCULA AQUI PARA GUARDARLO. El saldo que quedara es una vista previa;
 * el de verdad lo recalcula la base con el cerrojo tomado. Si cambio mientras la
 * persona revisaba —otro pago, un premio, otra entrega—, la base NO guarda nada y
 * el dialogo enseña la diferencia antes de dejar seguir.
 *
 * UNA SOLICITUD POR APERTURA. El identificador se crea al abrir y viaja con cada
 * intento: un doble clic o un reintento tras un corte no escriben dos veces.
 */
export function RecordTransferDialog(props: Props) {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        size="touch"
        variant={props.triggerVariant ?? 'default'}
        className={cn(props.fullWidth && 'w-full')}
        aria-label={props.triggerAria}
        onClick={() => {
          setSession((value) => value + 1)
          setOpen(true)
        }}
      >
        {props.triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* El dialogo es controlado y sin `DialogTrigger`: sin esto, al cerrar el
            foco quedaria en `body` (I-152). Vuelve al boton, o al contenido si
            el boton ya no esta —una entrega que salda la cuenta lo retira—. */}
        <DialogContent
          className="sm:max-w-md"
          onCloseAutoFocus={(event) => {
            const main = document.querySelector('main')
            const target = focusTargetAfterClose(trigger.current, main)
            if (target === null) return
            event.preventDefault()
            restoreFocus(target, main)
          }}
        >
          {open ? <Fields key={session} {...props} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Fields({
  raffleId,
  sellerId,
  kind,
  fromName,
  fromOwner = false,
  balance,
  awardsUnpaid,
  onClose,
}: Props & { onClose: () => void }) {
  const router = useRouter()
  const ids = useId()
  const refund = kind === 'refund'
  const text = refund ? SETTLEMENT_COPY.refundDialog : SETTLEMENT_COPY.receiptDialog
  const [expected, setExpected] = useState(balance)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const max = Math.abs(expected)
  const [amount, setAmount] = useState<number | null>(max)
  const today = todayBogota()
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState<{ before: number; now: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  const remaining = amount === null ? max : Math.max(0, max - amount)
  const preview =
    remaining > 0
      ? text.willStayOpen
      : !refund && awardsUnpaid > 0
        ? SETTLEMENT_COPY.receiptDialog.willStayMissing
        : text.willClose

  function submit() {
    if (amount !== null && amount > max) {
      setError(text.tooMuch(max))
      return
    }
    const parsed = recordTransferSchema.safeParse({
      raffleId,
      sellerId,
      kind,
      amount,
      receivedOn: date,
      expectedBalance: expected,
      requestId,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await recordSettlementTransfer(parsed.data)
      if ('changed' in result) {
        setChanged(result.changed)
        // No se guardo nada: la proxima confirmacion es otra solicitud.
        setRequestId(crypto.randomUUID())
        router.refresh()
        return
      }
      if ('error' in result) {
        setError(result.error)
        return
      }
      if (result.outcome === 'already_recorded') {
        toast.info(SETTLEMENT_COPY.receiptDialog.alreadySaved)
      } else {
        toast.success(text.success(parsed.data.amount, result.closed))
      }
      onClose()
      router.refresh()
    })
  }

  function review() {
    if (!changed) return
    const stillApplies = refund ? changed.now < 0 : changed.now > 0
    if (!stillApplies) {
      onClose()
      return
    }
    setExpected(changed.now)
    setAmount(Math.abs(changed.now))
    setChanged(null)
  }

  const description = refund
    ? fromOwner
      ? SETTLEMENT_COPY.refundDialog.descriptionFromOwner
      : SETTLEMENT_COPY.refundDialog.description(fromName)
    : SETTLEMENT_COPY.receiptDialog.description(fromName)

  if (changed) {
    const copy = SETTLEMENT_COPY.changedDialog
    return (
      <>
        <DialogHeader>
          <div>
            <StatusBadge tone="warning">{copy.badge}</StatusBadge>
          </div>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div aria-live="polite" className="space-y-3">
          <BalanceList>
            <BalanceRow label={copy.before} amount={Math.abs(changed.before)} />
            <BalanceRow label={copy.now} amount={Math.abs(changed.now)} emphasis="total" />
          </BalanceList>
          <p className="text-caption-regular text-muted-foreground">{copy.notSaved}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="touch" onClick={onClose}>
            {SETTLEMENT_COPY.receiptDialog.cancel}
          </Button>
          <Button type="button" size="touch" onClick={review}>
            {copy.review}
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{text.title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-amount`}>{text.amount}</Label>
          <MoneyInput
            id={`${ids}-amount`}
            value={amount}
            onChange={setAmount}
            disabled={isPending}
            size="touch"
            placeholder="Escribe el valor"
            aria-invalid={error !== null}
            aria-describedby={`${ids}-amount-hint${error ? ` ${ids}-error` : ''}`}
          />
          <p id={`${ids}-amount-hint`} className="text-muted-foreground text-caption-regular">
            {text.amountHelper}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-date`}>{text.date}</Label>
          <Input
            id={`${ids}-date`}
            type="date"
            size="touch"
            value={date}
            max={today}
            onChange={(event) => setDate(event.target.value)}
            disabled={isPending}
          />
        </div>

        <div className="border-border space-y-2 border-t pt-4" aria-live="polite">
          <BalanceList>
            <BalanceRow label={text.remaining} amount={remaining} emphasis="total" />
          </BalanceList>
          <p className="text-body-small text-muted-foreground">{preview}</p>
        </div>

        {error ? (
          <p
            id={`${ids}-error`}
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        <p className="text-caption-regular text-muted-foreground">
          {SETTLEMENT_COPY.receiptDialog.revalidate}
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="touch" onClick={onClose} disabled={isPending}>
          {SETTLEMENT_COPY.receiptDialog.cancel}
        </Button>
        <Button
          type="button"
          size="touch"
          onClick={submit}
          disabled={isPending || amount === null || amount < 1}
        >
          {isPending ? SETTLEMENT_COPY.receiptDialog.saving : text.confirm}
        </Button>
      </DialogFooter>
    </>
  )
}
