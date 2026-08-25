import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Seccion con titulo que envuelve una tabla o una lista (D-113).
 *
 * Es la tarjeta que rodea a «Boletas de este cliente» y a «Historial de
 * abonos»: el titulo va DENTRO del borde, junto a la accion que le corresponde,
 * de modo que se ve de un vistazo donde empieza y donde acaba cada listado. Sin
 * ella, dos tablas seguidas con un `h2` suelto encima se leen como una sola
 * lista larga.
 *
 * La tabla de dentro se aplana con `SECTION_TABLE_CLASSES`: el borde y las
 * esquinas los pone la tarjeta una sola vez.
 */

type TableSectionProps = {
  title: string
  /** Accion del listado, alineada a la derecha del titulo. */
  action?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Lo que se le pasa a la tabla —o a la lista de tarjetas del telefono— para que
 * no dibuje su propio borde dentro de la tarjeta.
 *
 * El relleno de la seccion (`px-2 sm:px-4`) mas el de las celdas (`px-2`) suman
 * exactamente el del titulo, asi que la primera columna queda alineada con el.
 */
export const SECTION_TABLE_CLASSES = 'rounded-none border-0'

export function TableSection({ title, action, children, className }: TableSectionProps) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <CardTitle className="text-base">
          <h2>{title}</h2>
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="px-2 pb-2 sm:px-4 sm:pb-4">{children}</CardContent>
    </Card>
  )
}
