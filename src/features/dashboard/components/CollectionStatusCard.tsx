import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { tourTarget } from '@/features/tour/tours'
import { TICKET_PAYMENT_STATUS_PLURAL_LABELS } from '@/lib/constants'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { percentageOf, type CollectionBreakdown } from '../collection-breakdown'
import { TONE_FILL, TONE_TEXT, type MoneyTone } from '../tones'

type CollectionStatusCardProps = {
  counts: { unpaid: number; partial: number; paid: number }
  breakdown: CollectionBreakdown
  /** `false`: no se pudo repartir el dinero por estado; se muestran solo los conteos. */
  detailed: boolean
  className?: string
}

/**
 * «Cobranza»: cuantas boletas hay en cada estado de pago y cuanto valen (D-112).
 *
 * Las tres etiquetas —Sin pagar, Abonada, Pagada— NO se escriben aqui: salen de
 * `constants.ts`, que es su unica fuente (CLAUDE.md §27). El importe de cada
 * estado es el VALOR DE VENTA de esas boletas, de modo que los tres suman
 * exactamente el total del resumen financiero y las dos tarjetas cuadran.
 *
 * Cada estado es un enlace a la lista de boletas ya filtrada: ver que tienes 55
 * boletas sin pagar y no poder llegar a ellas seria dejar el trabajo a medias.
 */
export function CollectionStatusCard({
  counts,
  breakdown,
  detailed,
  className,
}: CollectionStatusCardProps) {
  const total = counts.unpaid + counts.partial + counts.paid

  const columns = [
    {
      tone: 'unpaid' as MoneyTone,
      label: TICKET_PAYMENT_STATUS_PLURAL_LABELS.unpaid,
      count: counts.unpaid,
      amount: breakdown.saleValue.unpaid,
      href: '/seller/tickets?inventoryStatus=assigned&paymentStatus=unpaid',
    },
    {
      tone: 'partial' as MoneyTone,
      label: TICKET_PAYMENT_STATUS_PLURAL_LABELS.partial,
      count: counts.partial,
      amount: breakdown.saleValue.partial,
      href: '/seller/tickets?inventoryStatus=assigned&paymentStatus=partial',
    },
    {
      tone: 'paid' as MoneyTone,
      label: TICKET_PAYMENT_STATUS_PLURAL_LABELS.paid,
      count: counts.paid,
      amount: breakdown.saleValue.paid,
      href: '/seller/tickets?inventoryStatus=assigned&paymentStatus=paid',
    },
  ]

  return (
    <Card className={cn(className)} {...tourTarget('metrics-collection')}>
      <CardHeader>
        <CardTitle className="text-base">
          <h2>Cobranza</h2>
        </CardTitle>
        <CardDescription>
          Tus boletas vendidas, según lo que llevas cobrado de cada una.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no has vendido ninguna boleta, así que no hay nada por cobrar.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {columns.map((column) => (
                <Link
                  key={column.label}
                  href={column.href}
                  className="hover:bg-muted focus-visible:ring-ring -m-1 min-w-0 rounded-lg p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <p className="text-muted-foreground truncate text-xs sm:text-sm">
                    {column.label}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">{column.count}</p>
                  {detailed ? (
                    <p className={cn('truncate text-xs tabular-nums', TONE_TEXT[column.tone])}>
                      {formatCOP(column.amount)}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>

            {detailed && breakdown.totalSold > 0 ? (
              <div
                role="img"
                aria-label={columns
                  .map(
                    (column) =>
                      `${column.label}: ${percentageOf(column.amount, breakdown.totalSold)}%`,
                  )
                  .join(', ')}
                className="bg-muted flex h-2 w-full overflow-hidden rounded-full"
              >
                {columns.map((column) => (
                  <span
                    key={column.label}
                    className={TONE_FILL[column.tone]}
                    style={{ width: `${percentageOf(column.amount, breakdown.totalSold)}%` }}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
