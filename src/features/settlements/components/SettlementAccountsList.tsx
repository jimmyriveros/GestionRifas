import { RowChevron } from '@/components/data/RowChevron'
import { RowLink } from '@/components/data/RowLink'
import { SettlementStatusBadge } from '@/components/data/StatusBadge'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { SETTLEMENT_COPY } from '../copy'
import type { StaffSettlementListRow } from '../queries'

const COPY = SETTLEMENT_COPY.staffList

/**
 * Las cuentas con el dueño: UNA consulta, DOS presentaciones (el patron de
 * `PrizeAwardsList`). En el telefono y la tableta, tarjetas; desde `lg`, la
 * tabla. Lo elige Tailwind y las dos reciben las mismas filas, ya filtradas y
 * paginadas en PostgreSQL. Es la «Account Row» de la propuesta (`325:8`), hecha
 * con la tabla y las piezas de siempre.
 *
 * Nada se esconde en el telefono: el vendedor, su equipo, las pagadas, lo que
 * falta y el estado van en las dos.
 */
export function SettlementAccountsList({
  rows,
  hrefFor,
}: {
  rows: StaffSettlementListRow[]
  hrefFor: (sellerId: string) => string
}) {
  return (
    <>
      <ul className="divide-border divide-y lg:hidden" aria-label={COPY.tableTitle}>
        {rows.map((row) => (
          <li key={row.sellerId}>
            <RowLink
              href={hrefFor(row.sellerId)}
              aria-label={COPY.reviewAria(displayName(row))}
              className="hover:bg-surface-accent focus-visible:ring-focus-ring flex items-start gap-3 rounded-md px-2 py-4 focus-visible:ring-2 focus-visible:outline-none"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="text-label-medium min-w-0 break-words">{displayName(row)}</p>
                  <SettlementStatusBadge status={row.status} />
                </div>
                <p className="text-caption-regular text-muted-foreground">
                  {COPY.teamLine(row.members)}
                </p>
                <p className="text-body-small text-muted-foreground">
                  {COPY.paidCount(row.ticketsPaid, row.ticketsSold)}
                </p>
                {/* La cifra con su rotulo, siempre en su propia linea: a 320 px no
                    cabe junto al recuento, y partirla segun el importe hacia que
                    cada tarjeta se leyera distinta. */}
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-body-small text-muted-foreground">
                    {row.balance < 0 ? COPY.owedLabel : COPY.columns.pending}
                  </p>
                  <Amount row={row} />
                </div>
                {row.changedAfterClose ? (
                  <p className="text-caption-regular text-status-warning-text">
                    {COPY.changedAfterClose}
                  </p>
                ) : null}
              </div>
              <RowChevron className="mt-1" />
            </RowLink>
          </li>
        ))}
      </ul>

      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{COPY.columns.seller}</TableHead>
              <TableHead className="text-right">{COPY.columns.paid}</TableHead>
              <TableHead className="text-right">{COPY.columns.pending}</TableHead>
              <TableHead>{COPY.columns.status}</TableHead>
              <TableHead>{COPY.columns.action}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.sellerId}>
                <TableCell className="py-4 whitespace-normal">
                  <p className="text-label-medium break-words">{displayName(row)}</p>
                  <p className="text-caption-regular text-muted-foreground">
                    {COPY.teamLine(row.members)}
                  </p>
                </TableCell>
                <TableCell className="py-4 text-right">
                  <p className="text-label-medium tabular-nums">{row.ticketsPaid}</p>
                  <p className="text-caption-regular text-muted-foreground">
                    {COPY.paidOf(row.ticketsSold)}
                  </p>
                </TableCell>
                <TableCell className="py-4 text-right">
                  <Amount row={row} />
                </TableCell>
                <TableCell className="py-4 whitespace-normal">
                  <div className="space-y-1">
                    <SettlementStatusBadge status={row.status} />
                    {row.changedAfterClose ? (
                      <p className="text-caption-regular text-status-warning-text">
                        {COPY.changedAfterClose}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <RowLink
                    href={hrefFor(row.sellerId)}
                    aria-label={COPY.reviewAria(displayName(row))}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  >
                    {row.status === 'closed' ? COPY.viewClosed : COPY.review}
                  </RowLink>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function displayName(row: StaffSettlementListRow): string {
  if (row.sellerRole !== 'seller') return COPY.formerSeller(row.sellerName)
  if (!row.sellerActive) return COPY.inactiveSeller(row.sellerName)
  return row.sellerName
}

/** Lo que falta recibir, o lo que se le debe al vendedor: nunca un número negativo. */
function Amount({ row }: { row: StaffSettlementListRow }) {
  if (row.balance < 0) {
    return (
      <p className="text-label-medium text-status-info-text tabular-nums">
        {COPY.inFavorAmount(-row.balance)}
      </p>
    )
  }
  return <p className="text-label-medium tabular-nums">{formatCOP(row.balance)}</p>
}
