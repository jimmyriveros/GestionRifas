import { TicketCheckIcon, TicketIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import {
  clearanceLabel,
  clearanceShortLabel,
  clearanceState,
  type ClearanceEligibility,
} from '../clearance-receipt'

/**
 * Si el paz y salvo de una boleta está entregado, en una lista (BR-I15, D-170).
 *
 * DOS FORMAS, EL MISMO NOMBRE. En la tabla de escritorio solo cabe el icono
 * (`variant="icon"`); en la tarjeta del teléfono cabe el icono y una palabra
 * (`variant="short"`). En los dos casos el término completo —«Paz y salvo
 * entregado» / «Paz y salvo por entregar»— viaja en un `sr-only`, que sí cuenta
 * para el nombre accesible: se abrevia lo VISIBLE, nunca el término (D-114).
 *
 * LA AYUDA EMERGENTE ES `title`, NO UN COMPONENTE. Es lo que ya usan las otras
 * cuatro celdas de esta tabla —cliente, vendedor, rifa— para lo mismo, y aquí
 * pesa además que son hasta veinticinco por página en la pantalla que más se
 * abre: un componente de globo por fila monta veinticinco raíces de JavaScript
 * para enseñar una frase que el navegador enseña gratis. Quien no ve la pantalla
 * no depende de esto: para eso está el `sr-only`.
 *
 * NO DEPENDE DEL COLOR (`CLAUDE.md` §27). Los dos iconos tienen forma distinta
 * —uno lleva un visto— y los dos llevan su texto. El verde solo subraya.
 *
 * NO OCUPA UNA COLUMNA. La tabla de boletas ya está al límite de ancho, así que
 * esto vive dentro de la celda «Cliente», que es de quien es la entrega.
 *
 * Devuelve `null` en una boleta que todavía no se ha vendido: ahí no hay
 * entrega de la que hablar, y decir «por entregar» inventaría una tarea.
 */
export function ClearanceReceiptIndicator({
  ticket,
  variant,
  className,
}: {
  ticket: ClearanceEligibility
  variant: 'icon' | 'short'
  className?: string
}) {
  const state = clearanceState(ticket)
  if (state === null) return null

  const delivered = state !== 'pending'
  const Icon = delivered ? TicketCheckIcon : TicketIcon
  const long = clearanceLabel(state)

  return (
    <span
      // Solo donde el texto no se ve. Con la palabra al lado repetiría lo que ya
      // está escrito, y en un teléfono no hay cursor que lo abra.
      title={variant === 'icon' ? long : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-xs',
        delivered ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {variant === 'short' ? <span aria-hidden>{clearanceShortLabel(state)}</span> : null}
      <span className="sr-only">{long}</span>
    </span>
  )
}
