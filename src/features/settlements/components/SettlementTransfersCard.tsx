import type { ReactNode } from 'react'

import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { SETTLEMENT_COPY } from '../copy'
import { SettlementCard } from './SettlementParts'

export type TransferRowModel = {
  key: string
  /** «25 sept 2026 · Recibido por Andres Gomez». */
  line: string
  amount: number
  /** Una devolucion resta de lo recibido: se escribe con su signo. */
  refund: boolean
  /** El motivo, si se anulo: la fila se queda, tachada, con su porque (BR-Z14). */
  voidedReason: string | null
  note?: string
  voidAction?: ReactNode
}

/** Las entregas y devoluciones confirmadas de una cuenta, las anuladas incluidas. */
export function SettlementTransfersCard({
  title,
  rows,
}: {
  title: string
  rows: TransferRowModel[]
}) {
  return (
    <SettlementCard title={title} headingClassName="text-heading-h4">
      {rows.length === 0 ? (
        <p className="text-body-small text-muted-foreground">{SETTLEMENT_COPY.transfers.empty}</p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((row) => (
            <li key={row.key} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-4">
                <p
                  className={cn(
                    'text-body-small min-w-0 text-pretty',
                    row.voidedReason
                      ? 'text-muted-foreground line-through'
                      : 'text-muted-foreground',
                  )}
                >
                  {row.line}
                </p>
                <p
                  className={cn(
                    'text-label-medium shrink-0 whitespace-nowrap tabular-nums',
                    row.voidedReason && 'text-muted-foreground line-through',
                  )}
                >
                  {row.refund ? (
                    <>
                      <span className="sr-only">menos </span>
                      <span aria-hidden>− </span>
                    </>
                  ) : null}
                  {formatCOP(row.amount)}
                </p>
              </div>
              {row.voidedReason ? (
                <p className="text-caption-regular text-muted-foreground">
                  {SETTLEMENT_COPY.transfers.voided(row.voidedReason)}
                </p>
              ) : null}
              {row.note ? (
                <p className="text-caption-regular text-muted-foreground">{row.note}</p>
              ) : null}
              {row.voidAction ? <div>{row.voidAction}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </SettlementCard>
  )
}
