import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { EARNINGS_COPY } from '../copy'
import { tierRanges, type Tier } from '../tiers'

/**
 * Una lista de tramos, para LEERLA (D-237): la general en la tarjeta de
 * eleccion, la de un vendedor en su ficha.
 *
 * Sustituye a la tabla que vivia dentro de `CommissionModelField` (D-127), que
 * leia `commission_tiers`: el «hasta» se sigue derivando del siguiente tramo y
 * el ultimo sigue siendo «o más», ahora con `tierRanges`, la misma funcion que
 * usa el editor. Los tramos llegan por props: el negocio los cambia sin
 * desplegar y la tabla no puede prometer una cifra que la base no paga.
 */
export function TierTable({
  tiers,
  className,
}: {
  tiers: readonly Tier[]
  className?: string
}) {
  if (tiers.length === 0) return null

  return (
    <dl className={cn('space-y-1 text-xs', className)}>
      {tierRanges(tiers).map((range) => (
        <div key={range.from} className="flex justify-between gap-2">
          <dt className="text-muted-foreground">
            {range.to === null
              ? `${range.from} ${range.from === 1 ? 'boleta' : 'boletas'} ${EARNINGS_COPY.editor.orMore}`
              : range.from === range.to
                ? `${range.from} ${range.from === 1 ? 'boleta' : 'boletas'}`
                : `${range.from} a ${range.to} boletas`}
          </dt>
          <dd className="tabular-nums">{formatCOP(range.rate)}</dd>
        </div>
      ))}
    </dl>
  )
}
