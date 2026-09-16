'use client'

import type { ReactNode } from 'react'

import { EmptyState } from '@/components/data/EmptyState'
import { StatusBadge } from '@/components/data/StatusBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  PRIZE_CATEGORY_LABELS,
  PRIZE_DIGITS_FULL_LABELS,
  PRIZE_DIGITS_LABELS,
  PRIZE_NUMBER_FIELD_LABELS,
  PRIZE_NUMBER_FIELD_SHORT_LABELS,
  PRIZE_PANEL_COPY,
  PRIZE_STATUS_LABELS,
  prizeLotteryLabel,
  rewardText,
  scheduleSummary,
  validityText,
} from '../copy'

import type { PrizeListItem } from '../queries'

/**
 * Los premios de una rifa, TABLA en escritorio y TARJETAS en el teléfono
 * (D-202, sección 5 del encargo).
 *
 * Es una sola pieza con dos caras, no dos pantallas: las dos reciben las mismas
 * filas ya consultadas y las presentan en el mismo orden semántico. Bajo `md`
 * no se encoge la tabla —seis columnas dentro de 320 px no se leen—: la
 * información se reparte a lo alto.
 *
 * NO TIENE ESTADO NI CONSULTA NADA. Las acciones las pone quien la usa con
 * `renderActions`, así que la misma pieza sirve para el panel —donde se edita—
 * y para la revisión previa a activar, donde solo se lee.
 */

export type PrizeListProps = {
  prizes: PrizeListItem[]
  /** Los controles de cada fila. Sin esto, la lista es de solo lectura. */
  renderActions?: (prize: PrizeListItem, index: number) => ReactNode
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
}

export function PrizeList({
  prizes,
  renderActions,
  emptyTitle = PRIZE_PANEL_COPY.empty.title,
  emptyDescription = PRIZE_PANEL_COPY.empty.description,
  emptyAction,
}: PrizeListProps) {
  if (prizes.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {prizes.map((prize, index) => (
          <PrizeCard key={prize.id} prize={prize} actions={renderActions?.(prize, index)} />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{PRIZE_PANEL_COPY.columns.prize}</TableHead>
              <TableHead>{PRIZE_PANEL_COPY.columns.number}</TableHead>
              <TableHead>{PRIZE_PANEL_COPY.columns.digits}</TableHead>
              <TableHead>{PRIZE_PANEL_COPY.columns.schedule}</TableHead>
              <TableHead>{PRIZE_PANEL_COPY.columns.lottery}</TableHead>
              <TableHead>{PRIZE_PANEL_COPY.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prizes.map((prize, index) => (
              <TableRow key={prize.id}>
                <TableCell className="align-top">
                  <p className="font-medium">{prize.title}</p>
                  <p className="text-muted-foreground text-body-small">
                    {PRIZE_CATEGORY_LABELS[prize.category]}
                  </p>
                  <p className="text-body-small text-pretty">{rewardText(prize.reward)}</p>
                </TableCell>
                <TableCell className="align-top">
                  {PRIZE_NUMBER_FIELD_LABELS[prize.numberField]}
                </TableCell>
                <TableCell className="align-top">
                  {/* Se abrevia lo VISIBLE; el término entero se oye (D-114). */}
                  <span aria-hidden>{PRIZE_DIGITS_LABELS[prize.digits]}</span>
                  <span className="sr-only">{PRIZE_DIGITS_FULL_LABELS[prize.digits]}</span>
                </TableCell>
                <TableCell className="align-top">
                  <p className="text-pretty">{validityText(prize.rules)}</p>
                  <p className="text-muted-foreground text-body-small text-pretty">
                    {scheduleSummary(prize.rules)}
                  </p>
                </TableCell>
                <TableCell className="align-top">{prizeLotteryLabel(prize.rules)}</TableCell>
                <TableCell className="align-top">
                  <div className="space-y-2">
                    <StatusBadge tone={prize.status === 'active' ? 'success' : 'neutral'}>
                      {PRIZE_STATUS_LABELS[prize.status]}
                    </StatusBadge>
                    {renderActions ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {renderActions(prize, index)}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

/** La misma información, en el mismo orden, repartida a lo alto (D-107). */
function PrizeCard({ prize, actions }: { prize: PrizeListItem; actions?: ReactNode }) {
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium break-words">{prize.title}</p>
          <p className="text-muted-foreground text-body-small">
            {PRIZE_CATEGORY_LABELS[prize.category]}
          </p>
        </div>
        <StatusBadge tone={prize.status === 'active' ? 'success' : 'neutral'}>
          {PRIZE_STATUS_LABELS[prize.status]}
        </StatusBadge>
      </div>

      <p className="text-body-small text-pretty">{rewardText(prize.reward)}</p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <CardField label={PRIZE_PANEL_COPY.columns.number}>
          {PRIZE_NUMBER_FIELD_SHORT_LABELS[prize.numberField]}
          <span className="sr-only"> ({PRIZE_NUMBER_FIELD_LABELS[prize.numberField]})</span>
        </CardField>
        <CardField label={PRIZE_PANEL_COPY.columns.digits}>
          <span aria-hidden>{PRIZE_DIGITS_LABELS[prize.digits]}</span>
          <span className="sr-only">{PRIZE_DIGITS_FULL_LABELS[prize.digits]}</span>
        </CardField>
        <CardField label={PRIZE_PANEL_COPY.validity}>{validityText(prize.rules)}</CardField>
        <CardField label={PRIZE_PANEL_COPY.columns.lottery}>
          {prizeLotteryLabel(prize.rules)}
        </CardField>
      </dl>

      <p className="text-muted-foreground text-body-small text-pretty">
        {scheduleSummary(prize.rules)}
      </p>

      {actions ? <div className="flex flex-wrap items-center gap-1">{actions}</div> : null}
    </article>
  )
}

function CardField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-body-small">{label}</dt>
      <dd className="text-body-small break-words">{children}</dd>
    </div>
  )
}
