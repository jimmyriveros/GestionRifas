'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { focusTargetAfterClose, restoreFocus } from '@/components/feedback/restore-focus'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { todayBogota } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

import { recordSettlementPrizePayment } from '../actions'
import { SETTLEMENT_COPY } from '../copy'
import { recordPrizePaymentSchema } from '../schemas'
import type { PrizePayerOption } from '../view'

type Props = {
  raffleId: string
  matchId: string
  prizeId: string
  /** «Premio diario · Boleta 1234 / 5678». */
  prizeLabel: string
  /** «Sorteo: 20 sept 2026». */
  drawLabel: string
  knownAmount: number | null
  valuePending: boolean
  /** La fecha del sorteo: el pago no puede ser anterior. */
  minDate: string | null
  /** Solo los pagadores que QUIEN ABRE el dialogo puede registrar (BR-Z07). */
  payers: PrizePayerOption[]
  triggerAria?: string
}

/**
 * Registrar quien pago un premio (BR-Z07, BR-Z08).
 *
 * Un premio ganado no es un premio pagado: hasta que alguien lo registra, la
 * cuenta dice «Falta información» y no se cierra. El dialogo ofrece SOLO los
 * pagadores que quien lo abre puede confirmar —elegir un nombre no autoriza a
 * registrar dinero a nombre de otra persona— y la base lo vuelve a exigir.
 *
 * EL VALOR NO SE ELIGE cuando se conoce: es el del premio. Solo un premio en
 * especie o con alternativas pide escribirlo, y nunca vale $0.
 */
export function RecordPrizePaymentDialog(props: Props) {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        size="touch"
        variant="outline"
        aria-label={props.triggerAria}
        onClick={() => {
          setSession((value) => value + 1)
          setOpen(true)
        }}
      >
        {SETTLEMENT_COPY.prizes.register}
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
  matchId,
  prizeId,
  prizeLabel,
  drawLabel,
  knownAmount,
  valuePending,
  minDate,
  payers,
  onClose,
}: Props & { onClose: () => void }) {
  const router = useRouter()
  const ids = useId()
  const copy = SETTLEMENT_COPY.prizeDialog
  const today = todayBogota()
  const fixedValue = !valuePending && knownAmount !== null
  const [payer, setPayer] = useState<string>(payers.length === 1 ? payers[0]!.value : '')
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(today)
  const [requestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const chosen = payers.find((option) => option.value === payer)

  function submit() {
    if (!chosen) {
      setError(copy.choosePayer)
      return
    }
    const parsed = recordPrizePaymentSchema.safeParse({
      raffleId,
      matchId,
      prizeId,
      payer: chosen.value === 'organization' ? 'organization' : 'seller',
      payerId: chosen.value === 'organization' ? undefined : chosen.value,
      amount: fixedValue ? undefined : (amount ?? undefined),
      paidOn: date,
      requestId,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
      return
    }
    if (!fixedValue && parsed.data.amount === undefined) {
      setError(copy.emptyValue)
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await recordSettlementPrizePayment(parsed.data)
      if ('error' in result) {
        setError(result.error)
        return
      }
      if (result.outcome === 'already_recorded') toast.info(copy.alreadySaved)
      else toast.success(result.closed ? copy.successClosed : copy.success)
      onClose()
      router.refresh()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>
          {prizeLabel}
          <br />
          {drawLabel}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-payer`}>{copy.whoPaid}</Label>
          <Select value={payer} onValueChange={setPayer} disabled={isPending}>
            <SelectTrigger id={`${ids}-payer`} size="touch" className="w-full">
              <SelectValue placeholder={copy.whoPaidPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {payers.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {fixedValue ? (
          <div className="space-y-1">
            <p className="text-label-medium">{copy.value}</p>
            <p className="text-heading-h4 tabular-nums">{formatCOP(knownAmount!)}</p>
            <p className="text-muted-foreground text-caption-regular">{copy.valueKnownHint}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-amount`}>{copy.valuePaid}</Label>
            <MoneyInput
              id={`${ids}-amount`}
              value={amount}
              onChange={setAmount}
              disabled={isPending}
              size="touch"
              placeholder="Escribe el valor"
              aria-describedby={`${ids}-amount-hint`}
            />
            <p id={`${ids}-amount-hint`} className="text-muted-foreground text-caption-regular">
              {copy.valuePendingHint}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-date`}>{copy.date}</Label>
          <Input
            id={`${ids}-date`}
            type="date"
            size="touch"
            value={date}
            min={minDate ?? undefined}
            max={today}
            onChange={(event) => setDate(event.target.value)}
            disabled={isPending}
          />
        </div>

        {chosen ? (
          <p className="text-body-small text-muted-foreground" aria-live="polite">
            {chosen.effect}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="touch" onClick={onClose} disabled={isPending}>
          {copy.cancel}
        </Button>
        <Button type="button" size="touch" onClick={submit} disabled={isPending || !chosen}>
          {isPending ? copy.saving : copy.confirm}
        </Button>
      </DialogFooter>
    </>
  )
}
