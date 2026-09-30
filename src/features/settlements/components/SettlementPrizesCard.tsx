import type { ReactNode } from 'react'

import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { SETTLEMENT_COPY } from '../copy'
import { SettlementCard } from './SettlementParts'

/** Una fila ya redactada: las frases salen de `view.ts`, las cifras de la base. */
export type PrizeRowModel = {
  key: string
  title: string
  drawLine: string
  /** «Vendida por Ana» o, solo en la cuenta propia, «Cliente: María Torres». */
  detail?: string
  /** `null` = el valor todavia no se conoce: nunca se escribe «$0» (BR-Z08). */
  amount: number | null
  stateLabel: string
  stateTone: 'brand' | 'muted' | 'warning'
  warnings: string[]
  record?: ReactNode
  voidAction?: ReactNode
}

/**
 * Los premios de una cuenta: quien los pago, cuando y si se descuentan de la
 * entrega. Un premio sin pago registrado lo dice con palabras —«Falta registrar
 * quién lo pagó»— y, a quien puede, le ofrece registrarlo.
 */
export function SettlementPrizesCard({
  title,
  aside,
  rows,
  emptyText,
  children,
}: {
  title: string
  aside?: string
  rows: PrizeRowModel[]
  emptyText: string
  children?: ReactNode
}) {
  return (
    <SettlementCard title={title} aside={rows.length > 0 ? aside : undefined}>
      {rows.length === 0 ? (
        <p className="text-body-small text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((row) => (
            <li key={row.key} className="space-y-2 py-4 first:pt-0 last:pb-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
                <p className="text-label-medium break-words">{row.title}</p>
                <p className="text-label-medium text-right whitespace-nowrap tabular-nums">
                  {row.amount === null
                    ? SETTLEMENT_COPY.prizes.valuePending
                    : formatCOP(row.amount)}
                </p>
                <p className="text-caption-regular text-muted-foreground col-span-2 sm:col-span-1">
                  {row.drawLine}
                </p>
                <p
                  className={cn(
                    'text-label-small col-span-2 sm:col-span-1 sm:text-right',
                    row.stateTone === 'brand'
                      ? 'text-text-brand'
                      : row.stateTone === 'warning'
                        ? 'text-status-warning-text'
                        : 'text-muted-foreground',
                  )}
                >
                  {row.stateLabel}
                </p>
                {row.detail ? (
                  <p className="text-caption-regular text-muted-foreground col-span-2">
                    {row.detail}
                  </p>
                ) : null}
              </div>
              {row.warnings.map((warning) => (
                <p key={warning} className="text-caption-regular text-status-warning-text">
                  {warning}
                </p>
              ))}
              {row.record || row.voidAction ? (
                <div className="flex flex-wrap gap-2">
                  {row.record}
                  {row.voidAction}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {children}
    </SettlementCard>
  )
}
