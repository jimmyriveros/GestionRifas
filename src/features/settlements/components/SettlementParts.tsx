import { TriangleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { SettlementStatusBadge } from '@/components/data/StatusBadge'
import { Notice } from '@/components/feedback/Notice'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import type { SettlementAccountStatus } from '@/lib/constants'
import { cn } from '@/lib/utils'

import { SETTLEMENT_COPY } from '../copy'
import type { SettlementFigures } from '../queries'
import { BalanceList, BalanceRow } from './BalanceRows'

/**
 * Las piezas de una cuenta que comparten las tres pantallas —la del personal, la
 * del vendedor y la de un integrante vista por su vendedor a cargo—. Ninguna
 * calcula nada: pintan lo que la base devolvio.
 */

/** Una tarjeta con titulo de seccion (`h2`): el titulo de la pantalla es el `h1`. */
export function SettlementCard({
  title,
  aside,
  children,
  className,
  headingClassName = 'text-heading-h3',
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
  headingClassName?: string
}) {
  return (
    <Card className={cn('gap-4 py-5 sm:py-6', className)}>
      <CardContent className="space-y-4 px-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className={headingClassName}>{title}</h2>
          {aside ? (
            <p className="text-label-medium text-muted-foreground tabular-nums">{aside}</p>
          ) : null}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

/**
 * El recuadro del saldo: «Falta recibir de Carlos», o «Para entregar al dueño».
 * Es el de la propuesta: fondo de marca suave, borde de exito, la insignia del
 * estado arriba y la cifra en grande. La cifra baja un tamaño cuando la tarjeta
 * es estrecha —un telefono de 320 px—, en vez de salirse (se mide la tarjeta, no
 * la ventana).
 */
export function SettlementHeroCard({
  status,
  label,
  amount,
  rows,
  action,
  notes,
}: {
  status: SettlementAccountStatus
  label: string
  amount: number
  rows: Array<{ label: string; amount: number }>
  action?: ReactNode
  notes: string[]
}) {
  return (
    <Card
      data-slot="settlement-hero"
      className="bg-brand-subtle border-status-success-border gap-4 py-5 sm:py-6"
    >
      <CardContent className="@container/hero space-y-4 px-4 sm:px-6">
        <SettlementStatusBadge status={status} />
        <div className="space-y-1">
          <p className="text-label-medium">{label}</p>
          <p className="text-metric-x-large @min-[18rem]/hero:text-display-large break-words tabular-nums">
            {formatCOP(amount)}
          </p>
        </div>
        {rows.length > 0 ? (
          <BalanceList>
            {rows.map((row) => (
              <BalanceRow key={row.label} label={row.label} amount={row.amount} />
            ))}
          </BalanceList>
        ) : null}
        {action}
        {notes.filter(Boolean).map((note) => (
          <p key={note} className="text-caption-regular text-muted-foreground text-pretty">
            {note}
          </p>
        ))}
      </CardContent>
    </Card>
  )
}

/** Las boletas de la cuenta: activas, vendidas y pagadas, y lo que aun no entra. */
export function SettlementTicketsCard({
  variant,
  active,
  sold,
  paid,
  own,
  team,
  partialPaid,
}: {
  /** `grid` para el personal (tres cifras); `compact` para el vendedor (una). */
  variant: 'grid' | 'compact'
  active: number
  sold: number
  paid: number
  own: number
  team: number
  /** Solo en la cuenta propia (BR-Z03). */
  partialPaid?: number | null
}) {
  const copy = SETTLEMENT_COPY.tickets
  const unpaid = Math.max(0, sold - paid)

  if (variant === 'compact') {
    return (
      <Card className="gap-3 py-5">
        <CardContent className="space-y-2 px-4 sm:px-6">
          <dl className="space-y-1">
            <dt className="text-label-medium text-muted-foreground">{copy.sold}</dt>
            <dd className="text-heading-h2 tabular-nums">{copy.soldOf(sold, active)}</dd>
            <dd className="text-body-small text-muted-foreground">{copy.soldHint(paid, unpaid)}</dd>
          </dl>
          <p className="text-caption-regular text-muted-foreground text-pretty">
            {copy.earningsFromPaid}
          </p>
          {partialPaid && partialPaid > 0 ? (
            <p className="text-caption-regular text-muted-foreground text-pretty">
              {copy.ownPartial(partialPaid)}
            </p>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="gap-3 py-5">
      <CardContent className="space-y-3 px-4 sm:px-6">
        <dl className="grid grid-cols-3 gap-3">
          {[
            [copy.active, active],
            [copy.sold, sold],
            [copy.paid, paid],
          ].map(([label, value]) => (
            <div key={label as string} className="min-w-0 space-y-1">
              <dt className="text-label-small text-muted-foreground sm:text-label-medium">
                {label}
              </dt>
              <dd className="text-heading-h3 sm:text-heading-h2 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-caption-regular text-muted-foreground text-pretty">
          {[copy.includes(paid, own, team), copy.unpaidOut(unpaid)].filter(Boolean).join(' ')}
        </p>
      </CardContent>
    </Card>
  )
}

/** Las cifras de un cierre que cuentan cosas, no pesos. */
const COUNT_KEYS = new Set(['tickets_paid', 'awards', 'awards_unpaid'])

/**
 * La diferencia entre el cierre y hoy (BR-Z11). El cierre no se toca: se enseña
 * que cambio, cifra por cifra, solo las que cambiaron.
 */
export function ChangedAfterCloseNotice({
  closedAt,
  atClose,
  now,
}: {
  closedAt: string | null
  atClose: SettlementFigures | null
  now: SettlementFigures
}) {
  const copy = SETTLEMENT_COPY.changed
  const keys = Object.keys(copy.fields).filter(
    (key) => atClose !== null && (atClose[key] ?? 0) !== (now[key] ?? 0),
  )
  // Un saldo negativo es dinero a favor del vendedor: se dice con palabras, no
  // con un signo que se lee como «menos».
  const money = (key: string, value: number) =>
    COUNT_KEYS.has(key)
      ? String(value)
      : key === 'balance' && value < 0
        ? SETTLEMENT_COPY.changed.inFavor(-value)
        : formatCOP(value)

  // Dentro de un aviso solo cabe contenido de frase: una linea por cifra, con
  // las dos palabras escritas —«Al cerrar» y «Ahora»—, que se leen igual de
  // corrido que en una tabla.
  return (
    <Notice tone="warning" icon={<TriangleAlertIcon />}>
      <span className="block font-medium">
        {copy.title(closedAt ? formatDateEs(closedAt) : '—')}
      </span>
      <span className="block">{copy.hint}</span>
      {keys.map((key) => (
        <span key={key} className="mt-1 block tabular-nums">
          <span className="font-medium">{copy.fields[key]}</span>
          {` — ${copy.atClose}: ${money(key, atClose?.[key] ?? 0)} · ${copy.now}: ${money(key, now[key] ?? 0)}`}
        </span>
      ))}
    </Notice>
  )
}

/** El error de una lectura: nunca una lista vacia ni ceros (`PrizeAwardsView`). */
export function SettlementErrorCard({ retry }: { retry: ReactNode }) {
  return (
    <Card data-slot="settlement-error" className="gap-4">
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-heading-h4">{SETTLEMENT_COPY.error.title}</h2>
          <p className="text-body-small text-muted-foreground">
            {SETTLEMENT_COPY.error.description}
          </p>
        </div>
        {retry}
      </CardContent>
    </Card>
  )
}
