import { TicketCheckIcon, TicketIcon } from 'lucide-react'

import { formatDateTimeEs } from '@/lib/dates'

import {
  CLEARANCE_COPY,
  clearanceDeliveredLabel,
  clearanceLabel,
  clearanceState,
  type ClearanceEligibility,
} from '../clearance-receipt'

/**
 * El paz y salvo de una boleta, solo para mirar (BR-I15, D-170).
 *
 * Lo usan DOS sitios y por dos razones distintas:
 *
 *   * el detalle ADMINISTRATIVO, siempre: el Dueño y el Administrador consultan
 *     el dato pero no lo cambian — registrar una entrega que no hicieron no
 *     significa nada—, así que ahí no hay interruptor ni lo va a haber;
 *   * el detalle del VENDEDOR sobre una boleta ANULADA, que conserva lo que se
 *     hubiera registrado (BR-I06) y ya no tiene nada que entregar.
 *
 * Dice tres cosas: el estado, de qué TIPO es el registro y, solo si es manual,
 * cuándo fue. De una carga inicial escribe por qué no hay fecha; nunca la de la
 * migración, ni la de asignación, ni una calculada.
 */
export function ClearanceReceiptReadOnly({ ticket }: { ticket: ClearanceEligibility }) {
  const state = clearanceState(ticket)
  if (state === null) return null

  const delivered = state !== 'pending'
  const Icon = delivered ? TicketCheckIcon : TicketIcon

  return (
    <div className="space-y-0.5">
      <p className="flex items-center gap-1.5 text-sm">
        <Icon
          className={
            delivered
              ? 'size-4 shrink-0 text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground size-4 shrink-0'
          }
          aria-hidden
        />
        {clearanceLabel(state)}
      </p>
      {state === 'assumed' ? (
        <p className="text-muted-foreground text-xs">{CLEARANCE_COPY.assumedNote}</p>
      ) : null}
      {state === 'delivered' && ticket.clearanceDeliveredAt !== null ? (
        <p className="text-muted-foreground text-xs">
          {clearanceDeliveredLabel(formatDateTimeEs(ticket.clearanceDeliveredAt))}
        </p>
      ) : null}
    </div>
  )
}
