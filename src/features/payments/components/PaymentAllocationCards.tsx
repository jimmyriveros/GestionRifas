'use client'

import { MoneyInput } from '@/components/form/MoneyInput'
import { Label } from '@/components/ui/label'
import { TICKET_PAYMENT_STATUS_LABELS } from '@/lib/constants'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'
import { cn } from '@/lib/utils'

import { previewPaymentStatus } from '../allocation'
import type { PayableTicketDetail } from '../queries'

/**
 * Las boletas del abono TAL COMO SE VEN EN UN TELEFONO (D-138).
 *
 * Es la otra cara de la tabla de `PaymentForm`, no otra pantalla: recibe las
 * MISMAS boletas, el mismo `amounts` y el mismo `setAmount`. Aqui no hay
 * consulta, ni efecto, ni cuenta propia. El saldo que «quedara» es el
 * `pendingAmount` que ya calculo SQL menos lo que se esta escribiendo; no se
 * vuelve a restar `sale_price - paid_amount` (BR-F08).
 *
 * POR QUE NO UNA TABLA ENCOGIDA. Boleta · Debe · Abona ahora · Quedara no
 * caben en 320 px: el input se come el valor y aparece un scroll horizontal.
 * La informacion se reparte a lo alto, igual que `TicketCardList` (D-107).
 */

type PaymentAllocationCardsProps = {
  tickets: PayableTicketDetail[]
  amounts: Record<string, number>
  issueByTicket: Map<string, string>
  originTicketId?: string
  disabled: boolean
  onAmountChange: (ticketId: string, value: number | null) => void
}

export function PaymentAllocationCards({
  tickets,
  amounts,
  issueByTicket,
  originTicketId,
  disabled,
  onAmountChange,
}: PaymentAllocationCardsProps) {
  return (
    <ul aria-label="Reparto del abono entre las boletas del cliente" className="space-y-2">
      {tickets.map((ticket) => {
        const amount = amounts[ticket.ticketId] ?? 0
        const issue = issueByTicket.get(ticket.ticketId)
        const isOrigin = ticket.ticketId === originTicketId
        const label = ticketLabel(ticket)
        const remaining = ticket.pendingAmount - amount
        const nextStatus = previewPaymentStatus(ticket.salePrice, ticket.paidAmount + amount)
        const inputId = `card-amount-${ticket.ticketId}`
        const issueId = `${inputId}-issue`

        return (
          <li
            key={ticket.ticketId}
            className={cn(
              'bg-card min-w-0 scroll-mb-[calc(var(--bottom-nav-space)+1rem)] rounded-lg border p-4',
              issue && 'border-destructive/40 bg-destructive/5',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">Boleta</p>
                <p className="text-lg font-semibold tabular-nums">{label}</p>
                {isOrigin ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">La que estabas viendo</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-muted-foreground text-xs">Debe</p>
                <p className="text-lg font-semibold whitespace-nowrap tabular-nums">
                  {formatCOP(ticket.pendingAmount)}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              <Label htmlFor={inputId}>Abonar ahora</Label>
              <MoneyInput
                id={inputId}
                aria-label={`Valor abonado a la boleta ${label}`}
                aria-invalid={Boolean(issue)}
                aria-describedby={issue ? issueId : undefined}
                value={amount === 0 ? null : amount}
                onChange={(value) => onAmountChange(ticket.ticketId, value)}
                disabled={disabled}
                placeholder="$0"
                className="h-12 scroll-mb-[calc(var(--bottom-nav-space)+1rem)]"
              />
              {issue ? (
                <p id={issueId} className="text-destructive text-xs">
                  {issue}
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex items-baseline justify-between gap-2">
              <p className="text-muted-foreground min-w-0 text-sm">Saldo después del abono</p>
              <RemainingPreview nextStatus={nextStatus} amount={amount} remaining={remaining} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function RemainingPreview({
  nextStatus,
  amount,
  remaining,
}: {
  nextStatus: 'unpaid' | 'partial' | 'paid'
  amount: number
  remaining: number
}) {
  if (nextStatus === 'paid') {
    return (
      <p className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400">
        {TICKET_PAYMENT_STATUS_LABELS.paid}
      </p>
    )
  }

  // Sin un valor escrito, se muestra el estado actual (Sin pagar / Abonada),
  // que es lo que ya pintaba la tabla. Con un abono parcial, el resultado
  // concreto: cuanto quedara.
  if (amount === 0) {
    return (
      <p className="text-muted-foreground shrink-0 font-medium">
        {TICKET_PAYMENT_STATUS_LABELS[nextStatus]}
      </p>
    )
  }

  return (
    <p className="shrink-0 font-medium whitespace-nowrap text-amber-700 tabular-nums dark:text-amber-400">
      Quedará {formatCOP(remaining)}
    </p>
  )
}
