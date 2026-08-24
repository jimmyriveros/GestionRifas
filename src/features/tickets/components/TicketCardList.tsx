'use client'

import { ChevronRightIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { KeyboardEvent, MouseEvent } from 'react'

import { RowLink } from '@/components/data/RowLink'
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
 * falta. Una tabla de seis columnas dentro de 320 px no se puede leer, asi que
 * la informacion se reparte en cuatro renglones en vez de en seis columnas.
 *
 * ORDEN DE LOS RENGLONES, de lo que mas se busca a lo que menos:
 *
 *   1. Los dos numeros —asi se nombra una boleta (BR-N11)— y el precio.
 *   2. «Diario · Semanal», la leyenda que dice cual es cual. En la tabla ese
 *      trabajo lo hacian los encabezados de columna; sin ellos, dos cifras
 *      seguidas no se distinguen.
 *   3. El cliente, que es lo segundo que se busca con la vista.
 *   4. Los dos estados, en insignias pequenas y en la misma linea.
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
}

export function TicketCardList({
  tickets,
  basePath = '/owner/tickets',
  showSeller = true,
  showRaffle = true,
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

      <ul aria-label="Boletas" className="divide-y overflow-hidden rounded-lg border">
        {tickets.map((ticket) => {
          const selected = selection?.isSelected(ticket.id) ?? false
          const label = ticketLabel(ticket)
          // La leyenda solo se pone cuando hay dos numeros que distinguir: en un
          // borrador sin numeros diria cual es cual de nada.
          const hasBothNumbers = ticket.dailyNumber !== null && ticket.weeklyNumber !== null
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
                'flex items-start gap-2 px-3 py-2.5 transition-colors',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
                selected ? 'bg-muted' : 'hover:bg-muted/50',
              )}
              onClick={(event) => handleClick(event, ticket)}
              onKeyDown={(event) => handleKeyDown(event, ticket)}
              {...longPress.getHandlers(ticket)}
            >
              {/* Las casillas solo aparecen en modo seleccion: en la lista normal
                robarian sitio permanentemente al nombre del cliente. */}
              {selection?.selectionMode ? (
                <SelectionCheckbox
                  checked={selected}
                  onCheckedChange={() => selection.toggle(ticket.id)}
                  label={`Seleccionar la boleta ${label}`}
                  className="mt-1.5 shrink-0"
                />
              ) : null}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  {/* El enlace se conserva aunque la tarjeta entera sea pulsable:
                    da el menu contextual, «abrir en otra pestana» y una parada
                    de teclado con nombre. */}
                  <RowLink
                    href={`${basePath}/${ticket.id}`}
                    className="truncate font-mono text-base font-medium tabular-nums hover:underline"
                    aria-label={`Ver la boleta ${label}`}
                  >
                    {label}
                  </RowLink>
                  {/* Una boleta sin vender no tiene precio, y una raya en el sitio
                    mas visible de la tarjeta no dice nada: se calla. La insignia
                    «Disponible» ya cuenta por que no hay cifra. */}
                  {ticket.salePrice === null ? null : (
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {formatCOP(ticket.salePrice)}
                    </span>
                  )}
                </div>

                {hasBothNumbers || meta !== '' ? (
                  <div className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs">
                    <span className="shrink-0">{hasBothNumbers ? 'Diario · Semanal' : ''}</span>
                    {meta === '' ? null : (
                      // El codigo corto de la rifa no dice de que rifa se trata:
                      // el nombre completo se queda a un toque largo, igual que
                      // en la columna «Rifa» de la tabla.
                      <span className="truncate" title={showRaffle ? ticket.raffleName : undefined}>
                        {meta}
                      </span>
                    )}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'truncate text-sm',
                      ticket.clientName === null && 'text-muted-foreground',
                    )}
                  >
                    {ticket.clientName ?? 'Sin cliente'}
                  </span>
                  {/* En modo seleccion la tarjeta no abre nada: la flecha se va,
                    porque prometeria algo que ya no ocurre. */}
                  {selecting ? null : (
                    <ChevronRightIcon
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <InventoryStatusBadge status={ticket.inventoryStatus} />
                  {ticket.inventoryStatus === 'assigned' ? (
                    <PaymentStatusBadge status={ticket.paymentStatus} />
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
