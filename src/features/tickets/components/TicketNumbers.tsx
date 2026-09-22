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

/**
 * Lo UNICO que estas tres piezas necesitan de una boleta.
 *
 * Pedir un `TicketListItem` entero obligaria a cada lista nueva a traerse la
 * rifa, el vendedor y el codigo interno —o a inventarselos— solo para escribir
 * dos cifras. El reporte «Ventas por fecha» (D-151) selecciona unicamente las
 * columnas que enseña, y aun asi reutiliza esta celda tal cual. Los llamadores
 * de siempre siguen pasando su `TicketListItem`, que encaja sin cambiar nada.
 */
export type TicketNumbersSource = Pick<TicketListItem, 'dailyNumber' | 'weeklyNumber'>

export function hasBothNumbers(ticket: TicketNumbersSource): boolean {
  return ticket.dailyNumber !== null && ticket.weeklyNumber !== null
}

export function TicketNumbersLink({
  ticket,
  href,
  className,
  interactive = true,
}: {
  ticket: TicketNumbersSource
  href: string
  className?: string
  /**
   * `false` en MODO SELECCION: los numeros se escriben como texto, no como
   * enlace (P1-A).
   *
   * Mientras se esta seleccionando, la tarjeta no abre nada —marca—, asi que un
   * enlace aqui hacia dos cosas malas a la vez. La primera se veia: tocar los
   * numeros, que son el objetivo mas grande de la tarjeta, abria el detalle en
   * lugar de marcar la boleta. `shouldActivateRow` hace bien su trabajo al no
   * activar la fila desde dentro de un `a[href]` —ese enlace ya atiende su
   * propio clic—, de modo que la regla no estaba mal: sobraba el enlace. La
   * segunda no se veia hasta volver: `selectionMode` es estado de React de la
   * pantalla que se abandona, asi que al regresar las casillas ya no estaban y
   * habia que entrar otra vez en «Seleccionar varias». LO MARCADO NO SE PERDIA:
   * vive en `sessionStorage` (`selection-store.ts`) y sobrevive a la
   * navegacion. El informe de la auditoria dijo lo contrario y se corrigio.
   *
   * Es la misma decision que ya tomo `RowChevron`, que desaparece en este modo
   * porque «prometeria algo que ya no ocurre» (D-108). Aqui se aplica al
   * enlace: sin `href` que seguir, el toque llega a la tarjeta y la marca.
   *
   * Quien escucha la pantalla no pierde nada: la casilla de la misma tarjeta ya
   * se llama «Seleccionar la boleta 1234 / 5678», y la tarjeta sigue siendo una
   * parada de teclado que marca con Enter.
   */
  interactive?: boolean
}) {
  const label = ticketLabel(ticket)
  const shared = cn('truncate font-mono text-base font-medium tabular-nums', className)

  if (!interactive) {
    // Sin `hover:underline`: nada debe sugerir que esto lleva a otra pantalla.
    return <span className={shared}>{label}</span>
  }

  return (
    <RowLink
      href={href}
      className={cn(shared, 'hover:underline')}
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
  interactive = true,
}: {
  ticket: TicketNumbersSource
  href: string
  children?: ReactNode
  /** Ver `TicketNumbersLink`: `false` mientras se seleccionan boletas. */
  interactive?: boolean
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <TicketNumbersLink ticket={ticket} href={href} interactive={interactive} />
      {hasBothNumbers(ticket) ? (
        <p className="text-muted-foreground text-xs">{TICKET_NUMBERS_LEGEND}</p>
      ) : null}
      {children}
    </div>
  )
}
