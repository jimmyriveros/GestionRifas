import type { ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type KpiCardProps = {
  label: string
  /** Ya formateado: dinero con `formatCOP`, porcentajes con su signo. */
  value: string
  icon: ReactNode
  /** Segunda linea: la comparacion, el detalle o una barra de progreso. */
  hint?: ReactNode
  className?: string
}

/**
 * Tarjeta de indicador de la fila superior del panel del vendedor (D-112).
 *
 * POR QUE NO ES `MetricCard`. La de siempre —label arriba, cifra debajo— la
 * comparten ocho pantallas y sigue igual. Esta lleva icono a la izquierda y una
 * segunda linea que a veces es texto y a veces una barra de progreso, o sea
 * otro arbol de HTML; meterle a `MetricCard` una segunda disposicion habria
 * puesto a tocar el componente de ocho pantallas para rediseñar una sola, que
 * es justo lo que pide evitar el cambio minimo (CLAUDE.md §36.3).
 *
 * Se quedo en `features/dashboard`, donde nacio, aunque desde D-113 la reutilice
 * tambien la ficha del cliente (`ClientTotals`): son las cuatro cifras de una
 * persona presentadas igual que las del panel, y duplicar la tarjeta para no
 * cruzar una carpeta habria sido crear la quinta forma de mostrar un indicador.
 */
export function KpiCard({ label, value, icon, hint, className }: KpiCardProps) {
  return (
    <Card className={cn('gap-0 py-4', className)}>
      <CardContent className="space-y-3 px-4">
        <div className="flex items-center gap-3">
          <span
            className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl [&>svg]:size-5"
            aria-hidden
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-muted-foreground truncate text-sm font-medium">{label}</p>
            <p className="truncate text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        </div>
        {hint}
      </CardContent>
    </Card>
  )
}
