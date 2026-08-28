import type { TicketPaymentStatus } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * Barra fina de cobro de UNA boleta: que parte de su precio esta abonada.
 *
 * Es la hermana lineal de `ProgressRing`. El anillo se usa donde hay sitio —el
 * detalle de la boleta, el panel—; esta se usa donde no lo hay: dentro de una
 * fila de tabla y dentro de una tarjeta del telefono, que no pueden crecer a lo
 * alto sin dejar de ser listas que se recorren de un vistazo.
 *
 * EL COLOR NUNCA ES LA UNICA SEÑAL (CLAUDE.md §27). La barra siempre va
 * acompañada de la insignia de estado —«Pagada», «Abonada», «Sin pagar»— y del
 * porcentaje escrito; ademas se publica como `progressbar` con su valor, de
 * modo que quien no ve la pantalla oye lo mismo.
 *
 * Los tres colores son los que ya significan eso en toda la aplicacion: verde
 * cobrado, ambar «falta algo», gris «todavia no» (D-112).
 */

const FILL: Record<TicketPaymentStatus, string> = {
  // A cero no se dibuja nada, pero el color existe por si un dato raro
  // trajera avance con estado «Sin pagar»: gris, que es lo que significa.
  unpaid: 'bg-muted-foreground/40',
  partial: 'bg-amber-500 dark:bg-amber-400',
  paid: 'bg-emerald-600 dark:bg-emerald-400',
}

type PaymentProgressBarProps = {
  /** Entero de 0 a 100. Se acota igual aqui para que un dato raro no rompa el dibujo. */
  percentage: number
  status: TicketPaymentStatus
  /** Que mide la barra, para quien no puede verla. */
  label: string
  className?: string
}

export function PaymentProgressBar({
  percentage,
  status,
  label,
  className,
}: PaymentProgressBarProps) {
  const safe = Math.min(100, Math.max(0, Math.round(percentage)))

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safe}
      aria-label={label}
      // 4 px: se ve de lejos y no estira la fila (secciones 4.1 y 12 del encargo).
      className={cn('bg-muted h-1 w-full overflow-hidden rounded-full', className)}
    >
      <div className={cn('h-full rounded-full', FILL[status])} style={{ width: `${safe}%` }} />
    </div>
  )
}
