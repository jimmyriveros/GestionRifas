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
import { useLongPress } from '@/components/data/use-long-press'
import { SelectionCheckbox } from '@/components/form/SelectionCheckbox'
import { useOptionalTicketSelection } from '@/features/tickets/selection/TicketSelectionContext'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'
import { cn } from '@/lib/utils'

import { ticketFinancials } from '../financials'
import { ClearanceReceiptIndicator } from './ClearanceReceiptIndicator'
import { hasBothNumbers, TICKET_NUMBERS_LEGEND, TicketNumbersLink } from './TicketNumbers'

import type { TicketListItem } from '../queries'

/**
 * La lista de boletas TAL COMO SE VE EN UN TELEFONO (D-107).
 *
 * Es la otra cara de `TicketsTable`, no otra pantalla: las dos reciben las
 * MISMAS filas —`TicketListItem[]`, ya consultadas y paginadas en el servidor—
 * y las dos leen la misma seleccion multiple. Aqui no hay consulta, ni efecto,
 * ni estado propio: si algo se ve en la tarjeta es porque el listado ya lo
 * traia.
 *
 * POR QUE NO UNA TABLA ENCOGIDA. La tabla resolvia el ancho ocultando columnas
 * (`hideOnMobile`), y las que ocultaba eran cliente, estado de pago y precio:
 * justo lo que un vendedor necesita para saber a quien le cobra y cuanto le
 * falta. Una tabla de once columnas dentro de 320 px no se puede leer, asi que
 * la informacion se reparte a lo alto en vez de a lo ancho.
 *
 * DOS PIEZAS: CUERPO Y PIE.
 *
 *   1. El CUERPO identifica la boleta, en el mismo orden en que se busca:
 *      los dos numeros y el precio · la leyenda «Diario · Semanal», que dice
 *      cual es cual —en la tabla ese trabajo lo hacen los encabezados— ·
 *      el cliente · los dos estados, el de pago primero y con insignia, y
 *      «Asignada» detras, en gris, porque es el que menos se consulta.
 *
 *   2. El PIE dice como va el cobro: abonado, lo que falta, el porcentaje y la
 *      barra. Va separado por una linea y sobre un fondo apenas mas oscuro para
 *      que se lea como parte de la MISMA boleta —no como una segunda tarjeta—,
 *      y solo existe si la boleta esta vendida: en una disponible no hay dinero
 *      del que hablar y el pie robaria alto a la lista.
 *
 * COMPORTAMIENTO IDENTICO AL DE LA FILA. Toda la tarjeta abre el detalle, la
 * pulsacion larga entra en modo seleccion y, en modo seleccion, tocarla marca en
 * vez de abrir. No se reimplementa nada de eso: se reutilizan `row-activation`
 * y `useLongPress`, las mismas reglas que ya aplica `DataTable`.
 */

type TicketCardListProps = {
  tickets: TicketListItem[]
  /** `/owner/tickets` o `/seller/tickets`: la lista sirve a los dos portales. */
  basePath?: string
  /** El vendedor no necesita el nombre del vendedor: todas las boletas son suyas. */
  showSeller?: boolean
  /** Se oculta donde se opera una sola rifa: el portal del vendedor (D-088). */
  showRaffle?: boolean
  /** Se pasa a la lista; aplana su borde cuando ya va dentro de una tarjeta. */
  className?: string
}

export function TicketCardList({
  tickets,
  basePath = '/owner/tickets',
  showSeller = true,
  showRaffle = true,
  className,
}: TicketCardListProps) {
  const router = useRouter()
  const selection = useOptionalTicketSelection()

  // Mismo atajo que en la tabla, y con la misma condicion: solo con el dedo,
  // solo en pantalla pequena y solo cuando aun no se esta seleccionando.
  const longPress = useLongPress<TicketListItem>(
    selection && selection.compact && !selection.selectionMode
      ? (ticket) => selection.startSelectionMode(ticket.id)
      : undefined,
  )

  const selecting = selection?.rowClickSelects ?? false

  function activate(ticket: TicketListItem) {
    if (selecting && selection) {
      selection.toggle(ticket.id)
      return
    }
    router.push(`${basePath}/${ticket.id}`)
  }

  function handleClick(event: MouseEvent<HTMLLIElement>, ticket: TicketListItem) {
    // Una pulsacion larga ya hizo su trabajo: el `click` que el navegador emite
    // despues no debe contar otra vez.
    if (longPress.consumeSuppressedClick()) return
    if (!shouldActivateRow(event.target, event.currentTarget)) return
    if (hasTextSelection(window.getSelection())) return
    activate(ticket)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>, ticket: TicketListItem) {
    // Con el foco en el enlace o en la casilla manda ese elemento: si no,
    // `Enter` navegaria dos veces y `Space` marcaria y navegaria a la vez.
    if (event.target !== event.currentTarget) return
    if (!isActivationKey(event.key)) return
    event.preventDefault() // `Space` desplazaria la pagina.
    activate(ticket)
  }

  return (
    <div className="space-y-2">
      {/* «Toda la pagina de una vez». En la tabla eso lo hace la casilla del
          encabezado, y en el telefono esa casilla aparecia al entrar en modo
          seleccion: sin ella aqui, tampoco se llegaria a «Seleccionar las N
          boletas del filtro», que la barra solo ofrece cuando la pagina entera
          esta marcada. Es la misma casilla y el mismo `togglePage`. */}
      {selection?.selectionMode ? (
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <SelectionCheckbox
            checked={
              selection.pageAllSelected
                ? true
                : selection.pageSomeSelected
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(checked) => selection.togglePage(checked)}
            label="Seleccionar las boletas de esta página"
          />
          <span className="text-sm">Seleccionar las boletas de esta página</span>
        </div>
      ) : null}

      <ul
        aria-label="Boletas"
        className={cn('divide-y overflow-hidden rounded-lg border', className)}
      >
        {tickets.map((ticket) => {
          const selected = selection?.isSelected(ticket.id) ?? false
          const label = ticketLabel(ticket)
          const money = ticketFinancials(ticket)
          // Lo que el vendedor no necesita —de quien es la boleta, de que rifa—
          // pero el administrador si. Va en la leyenda, truncado, porque a 320 px
          // un nombre largo no puede empujar nada.
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
              data-state={selected ? 'selected' : undefined}
              /* Lo marcado se anuncia con la casilla, que es un `checkbox` de
               verdad y ya lleva su estado. `aria-selected` sobre un `li` no es
               valido y `aria-current` significa otra cosa. */
              className={cn(
                'flex flex-col transition-colors',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
                selected ? 'bg-muted' : 'hover:bg-muted/50',
              )}
              onClick={(event) => handleClick(event, ticket)}
              onKeyDown={(event) => handleKeyDown(event, ticket)}
              {...longPress.getHandlers(ticket)}
            >
              <div className="flex items-start gap-2 px-3 py-2">
                {/* Las casillas solo aparecen en modo seleccion: en la lista
                    normal robarian sitio permanentemente al nombre del cliente. */}
                {selection?.selectionMode ? (
                  <SelectionCheckbox
                    checked={selected}
                    onCheckedChange={() => selection.toggle(ticket.id)}
                    label={`Seleccionar la boleta ${label}`}
                    className="mt-1 shrink-0"
                  />
                ) : null}

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    {/* El enlace se conserva aunque la tarjeta entera sea
                      pulsable: da el menu contextual, «abrir en otra pestana» y
                      una parada de teclado con nombre. */}
                    <TicketNumbersLink ticket={ticket} href={`${basePath}/${ticket.id}`} />
                    <div className="flex shrink-0 items-center gap-1.5">
                      {/* Una boleta sin vender no tiene precio, y una raya en el
                        sitio mas visible de la tarjeta no dice nada: se calla.
                        La insignia «Disponible» ya cuenta por que no hay cifra. */}
                      {ticket.salePrice === null ? null : (
                        <span className="text-sm font-medium tabular-nums">
                          {formatCOP(ticket.salePrice)}
                        </span>
                      )}
                      {/* En modo seleccion la tarjeta no abre nada: la flecha se
                        va, porque prometeria algo que ya no ocurre. */}
                      {selecting ? null : <RowChevron />}
                    </div>
                  </div>

                  {hasBothNumbers(ticket) || meta !== '' ? (
                    <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
                      <span className="shrink-0">
                        {hasBothNumbers(ticket) ? TICKET_NUMBERS_LEGEND : ''}
                      </span>
                      {meta === '' ? null : (
                        // El codigo corto de la rifa no dice de que rifa se trata:
                        // el nombre completo se queda a un toque largo, igual que
                        // en la columna «Rifa» de la tabla.
                        <span
                          className="truncate"
                          title={showRaffle ? ticket.raffleName : undefined}
                        >
                          {meta}
                        </span>
                      )}
                    </div>
                  ) : null}

                  <p
                    className={cn(
                      'truncate text-sm',
                      ticket.clientName === null && 'text-muted-foreground',
                    )}
                  >
                    {ticket.clientName ?? 'Sin cliente'}
                  </p>

                  {/* El estado de pago manda —es lo que se viene a mirar— y por
                      eso lleva insignia; «Asignada» lo acompaña en gris, a la
                      derecha, donde no compite con el.

                      El paz y salvo entra en ESTA fila, a la derecha, y no en
                      una linea propia: son hasta veinticinco tarjetas por
                      pantalla y una linea mas en cada una es una boleta menos
                      que se ve. A 320 px caben los tres —insignia, «Entregado»
                      y «Asignada»— con holgura. */}
                  <div className="flex items-center justify-between gap-2">
                    {ticket.inventoryStatus === 'assigned' ? (
                      <PaymentStatusBadge status={ticket.paymentStatus} />
                    ) : (
                      <InventoryStatusBadge status={ticket.inventoryStatus} />
                    )}
                    <div className="flex shrink-0 items-center gap-2">
                      <ClearanceReceiptIndicator ticket={ticket} variant="short" />
                      {ticket.inventoryStatus === 'assigned' ? (
                        <span className="text-muted-foreground text-xs">Asignada</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {money.sold ? (
                <TicketCardFooter
                  paidAmount={money.paidAmount}
                  pendingAmount={money.pendingAmount}
                  percentage={money.percentage}
                  status={ticket.paymentStatus}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * El pie de la tarjeta: como va el cobro de ESA boleta.
 *
 * Tres datos en una linea —abonado, falta y el porcentaje a la derecha— y la
 * barra debajo, ocupando el ancho. Las cifras se quedan en `text-sm`: esta es
 * la lista larga, y agrandarlas aqui costaria una boleta menos por pantalla en
 * la unica pantalla donde eso importa. La ficha del cliente, que enseña tres
 * boletas, si las agranda.
 */
function TicketCardFooter({
  paidAmount,
  pendingAmount,
  percentage,
  status,
}: {
  paidAmount: number
  pendingAmount: number
  percentage: number
  status: TicketListItem['paymentStatus']
}) {
  return (
    <div className="bg-muted/40 space-y-1 border-t px-3 py-1.5">
      {/* Rejilla, no `flex`: «Abonado» ocupa una columna de ANCHO FIJO y «Falta»
          empieza siempre en el mismo punto. Con anchos por contenido, «$0» y
          «$120.000» no miden lo mismo y «Falta» bailaba unos 20 px de una
          tarjeta a la siguiente — justo lo que impide recorrer la lista con la
          vista por una sola columna. De paso da el aire que «Falta» necesitaba
          a su izquierda: sin él, las dos cifras se leían como una sola. */}
      <div className="grid grid-cols-[6rem_1fr_auto] items-end gap-3">
        <FooterAmount label="Abonado" amount={paidAmount} />
        <FooterAmount label="Falta" amount={pendingAmount} />
        <span className="text-muted-foreground text-xs tabular-nums">{percentage}%</span>
      </div>
      <PaymentProgressBar
        percentage={percentage}
        status={status}
        label={`${percentage}% abonado`}
      />
    </div>
  )
}

function FooterAmount({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px] leading-tight">{label}</p>
      <p className="truncate text-sm font-medium tabular-nums">{formatCOP(amount)}</p>
    </div>
  )
}
