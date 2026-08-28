'use client'

import { useRouter } from 'next/navigation'
import type { KeyboardEvent, MouseEvent } from 'react'

import { PaymentProgressBar } from '@/components/data/PaymentProgressBar'
import { RowChevron } from '@/components/data/RowChevron'
import {
  hasTextSelection,
  isActivationKey,
  shouldActivateRow,
} from '@/components/data/row-activation'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { TICKET_INVENTORY_STATUS_LABELS, type TicketPaymentStatus } from '@/lib/constants'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { ticketFinancials } from '../financials'
import { hasBothNumbers, TICKET_NUMBERS_LEGEND, TicketNumbersLink } from './TicketNumbers'

import type { TicketListItem } from '../queries'

/**
 * «Boletas de este cliente», en un telefono.
 *
 * Es la hermana de `TicketCardList`, con las mismas cuentas y otra jerarquia.
 * Alli caben veinticinco boletas y cada milimetro de alto cuesta una fila
 * menos; aqui hay tres o cuatro, y lo que se hace con ellas es decidir cuanto
 * cobrarle a esta persona. Por eso:
 *
 *   * Cada boleta es una tarjeta con su borde, separada de la siguiente, en vez
 *     de una fila mas de una lista continua.
 *   * Las dos cifras van GRANDES y una linea entera para ellas: son la
 *     respuesta a la pregunta que trae aqui a quien mira.
 *   * La barra va debajo de las cifras —no metida en un pie— con «58 % abonado»
 *     escrito al pie, para que el porcentaje no dependa del color.
 *   * No se repite el nombre del cliente: es el dueño de la ficha (D-113).
 *
 * El comportamiento es el de siempre: la tarjeta entera abre el detalle, el
 * enlace de los numeros se conserva para el menu contextual y el teclado, y las
 * reglas de `row-activation` evitan que un mismo toque cuente dos veces. Aqui
 * no hay seleccion multiple: esta ficha no ofrece acciones en lote.
 */

type ClientTicketCardListProps = {
  tickets: TicketListItem[]
  /** `/owner/tickets` o `/seller/tickets`. */
  basePath: string
  /** Solo el portal administrativo: un cliente puede comprar en varias rifas. */
  showRaffle?: boolean
  /** Solo el portal administrativo, que ve la cartera de toda la organizacion. */
  showSeller?: boolean
}

export function ClientTicketCardList({
  tickets,
  basePath,
  showRaffle = false,
  showSeller = false,
}: ClientTicketCardListProps) {
  const router = useRouter()

  function handleClick(event: MouseEvent<HTMLLIElement>, ticket: TicketListItem) {
    if (!shouldActivateRow(event.target, event.currentTarget)) return
    if (hasTextSelection(window.getSelection())) return
    router.push(`${basePath}/${ticket.id}`)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>, ticket: TicketListItem) {
    if (event.target !== event.currentTarget) return
    if (!isActivationKey(event.key)) return
    event.preventDefault() // `Space` desplazaria la pagina.
    router.push(`${basePath}/${ticket.id}`)
  }

  return (
    <ul aria-label="Boletas de este cliente" className="space-y-3">
      {tickets.map((ticket) => {
        const money = ticketFinancials(ticket)
        const meta = [
          showRaffle ? ticket.raffleShortCode : null,
          showSeller ? ticket.sellerName : null,
        ]
          .filter((part) => part !== null)
          .join(' · ')

        return (
          <li
            key={ticket.id}
            tabIndex={0}
            className={cn(
              'bg-card rounded-lg border transition-colors',
              'hover:bg-muted/50 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
            )}
            onClick={(event) => handleClick(event, ticket)}
            onKeyDown={(event) => handleKeyDown(event, ticket)}
          >
            <div className="space-y-2 px-4 pt-3 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <TicketNumbersLink
                    ticket={ticket}
                    href={`${basePath}/${ticket.id}`}
                    className="text-lg"
                  />
                  {hasBothNumbers(ticket) || meta !== '' ? (
                    <p className="text-muted-foreground truncate text-xs">
                      {[hasBothNumbers(ticket) ? TICKET_NUMBERS_LEGEND : null, meta || null]
                        .filter((part) => part !== null)
                        .join(' · ')}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {ticket.salePrice === null ? null : (
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatCOP(ticket.salePrice)}
                    </span>
                  )}
                  <RowChevron />
                </div>
              </div>

              {/* El estado de pago es el principal y lleva insignia; el de
                  inventario lo acompaña debajo, en gris. */}
              <div className="space-y-1">
                {money.sold ? (
                  <PaymentStatusBadge status={ticket.paymentStatus} />
                ) : (
                  <InventoryStatusBadge status={ticket.inventoryStatus} />
                )}
                {money.sold ? (
                  <p className="text-muted-foreground text-xs">
                    {TICKET_INVENTORY_STATUS_LABELS[ticket.inventoryStatus]}
                  </p>
                ) : null}
              </div>
            </div>

            {money.sold ? (
              // La linea separa identificar la boleta de saber cuanto se le
              // debe: son dos lecturas distintas, y sin ella se mezclan.
              <div className="space-y-2 border-t px-4 pt-3 pb-3">
                <div className="grid grid-cols-2 gap-3">
                  <Amount label="Abonado" amount={money.paidAmount} status={ticket.paymentStatus} />
                  <Amount label="Saldo" amount={money.pendingAmount} />
                </div>
                <PaymentProgressBar
                  percentage={money.percentage}
                  status={ticket.paymentStatus}
                  label={`${money.percentage}% abonado`}
                />
                <p className="text-muted-foreground text-center text-xs tabular-nums">
                  {money.percentage}% abonado
                </p>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * El color de «Abonado» dice lo mismo que la barra que hay debajo, y solo
 * cuando dice algo: a cero no hay dinero cobrado que destacar (D-124).
 */
const AMOUNT_CLASSES: Record<TicketPaymentStatus, string | undefined> = {
  unpaid: undefined,
  partial: 'text-amber-600 dark:text-amber-400',
  paid: 'text-emerald-700 dark:text-emerald-400',
}

function Amount({
  label,
  amount,
  status,
}: {
  label: string
  amount: number
  /** Solo lo pasa «Abonado»: el saldo se escribe siempre en el color normal. */
  status?: TicketPaymentStatus
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          'truncate text-xl font-semibold tabular-nums',
          status ? AMOUNT_CLASSES[status] : undefined,
        )}
      >
        {formatCOP(amount)}
      </p>
    </div>
  )
}
