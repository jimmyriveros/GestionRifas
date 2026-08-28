import type { ReactNode } from 'react'

import { RowLink } from '@/components/data/RowLink'
import { ticketLabel } from '@/lib/tickets'
import { cn } from '@/lib/utils'

import type { TicketListItem } from '../queries'

/**
 * La columna «Boleta»: los dos numeros juntos y, debajo, cual es cual.
 *
 * UNA SOLA COLUMNA, NO DOS. Antes habia «Núm. diario» y «Núm. semanal» en
 * celdas separadas, con dos encabezados abreviados que costaban dos veces mas
 * ancho que la propia cifra. Una boleta se nombra por sus dos numeros juntos
 * —«el 1234 con el 5678» (BR-N11)—, asi que se escriben como se dicen y la
 * leyenda «Diario · Semanal» hace, en pequeño, el trabajo que hacian los dos
 * encabezados. Es la misma leyenda que ya usaba la tarjeta del telefono
 * (D-107): el termino del glosario, en el orden en que aparecen las cifras.
 *
 * El enlace se conserva aunque la fila entera sea pulsable: da el menu
 * contextual, «abrir en otra pestaña» y una parada de teclado con nombre.
 * Su nombre accesible no cambia —«Ver la boleta 1234 / 5678»—, de modo que
 * quien navega con teclado o con lector de pantalla encuentra lo mismo que
 * antes.
 */

/** Dice cual de las dos cifras es cual. Se calla cuando falta alguna. */
export const TICKET_NUMBERS_LEGEND = 'Diario · Semanal'

export function hasBothNumbers(ticket: TicketListItem): boolean {
  return ticket.dailyNumber !== null && ticket.weeklyNumber !== null
}

export function TicketNumbersLink({
  ticket,
  href,
  className,
}: {
  ticket: TicketListItem
  href: string
  className?: string
}) {
  const label = ticketLabel(ticket)
  return (
    <RowLink
      href={href}
      className={cn(
        'truncate font-mono text-base font-medium tabular-nums hover:underline',
        className,
      )}
      aria-label={`Ver la boleta ${label}`}
    >
      {label}
    </RowLink>
  )
}

/**
 * La celda entera de la columna «Boleta»: numeros, leyenda y —donde hace
 * falta— lo que se quiera colgar debajo, como el estado de inventario en la
 * ficha de un cliente.
 */
export function TicketNumbersCell({
  ticket,
  href,
  children,
}: {
  ticket: TicketListItem
  href: string
  children?: ReactNode
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <TicketNumbersLink ticket={ticket} href={href} />
      {hasBothNumbers(ticket) ? (
        <p className="text-muted-foreground text-xs">{TICKET_NUMBERS_LEGEND}</p>
      ) : null}
      {children}
    </div>
  )
}
