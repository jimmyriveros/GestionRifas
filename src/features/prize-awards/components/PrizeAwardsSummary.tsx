import { MetricCard } from '@/components/data/MetricCard'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { PRIZE_AWARDS_COPY as COPY } from '../copy'
import type { PrizeAwardTotals } from '../queries'

/**
 * Los cuatro indicadores del historial (BR-J20), tal como los calcula
 * PostgreSQL sobre TODO el filtro: aquí no se suma nada, solo se formatea.
 *
 * Premios y clientes van por separado porque no son lo mismo —quien gana tres
 * premios es un cliente y tres premios—, y el dinero dice que es el CONOCIDO:
 * lo que está pendiente de valorar no entra, y el cuarto indicador cuenta
 * cuántos premios están así.
 *
 * Reutiliza `MetricCard`, la tarjeta de siempre. En el teléfono el dinero y lo
 * pendiente ocupan la fila entera: una cifra como «$120.000.000» no cabe en
 * media tarjeta de 320 px, y ninguna se recorta —la cifra baja de línea antes
 * que salirse—.
 */
export function PrizeAwardsSummary({
  totals,
  className,
}: {
  totals: PrizeAwardTotals
  className?: string
}) {
  return (
    <div
      data-slot="prize-awards-summary"
      className={cn('grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4', className)}
    >
      <MetricCard label={COPY.summary.prizes} value={<Cifra>{String(totals.prizes)}</Cifra>} />
      <MetricCard
        label={COPY.summary.clients}
        value={<Cifra>{String(totals.clients)}</Cifra>}
        hint={COPY.summary.clientsHint}
      />
      <MetricCard
        className="col-span-2 lg:col-span-1"
        label={COPY.summary.knownAmount}
        value={<Cifra>{formatCOP(totals.knownAmount)}</Cifra>}
        hint={COPY.summary.knownAmountHint}
      />
      <MetricCard
        className="col-span-2 lg:col-span-1"
        label={COPY.summary.valuePending}
        value={<Cifra>{String(totals.valuePending)}</Cifra>}
        hint={COPY.summary.valuePendingHint}
      />
    </div>
  )
}

/** Una cifra que baja de línea antes que salirse de su tarjeta. */
function Cifra({ children }: { children: string }) {
  return <span className="[overflow-wrap:anywhere]">{children}</span>
}
