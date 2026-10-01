import { RowLink } from '@/components/data/RowLink'
import { RowLinkPendingChevron } from '@/components/data/RowLinkPending'
import { SETTLEMENT_STATUS_LABELS } from '@/lib/constants'
import { formatCOP } from '@/lib/money'

import { SETTLEMENT_COPY, firstName } from '../copy'
import type { SettlementTeamRow } from '../queries'
import { RecordTransferDialog } from './RecordTransferDialog'
import { SettlementCard } from './SettlementParts'

/**
 * «Cuentas con tu equipo»: la cuenta de cada integrante con su vendedor a cargo
 * (BR-Z06). Cada fila lleva a su detalle y, si le falta entregar, el boton para
 * confirmar lo que se recibio de el. Solo cifras agregadas: ni clientes ni
 * abonos del integrante (BR-Z13).
 *
 * Mientras se abre la cuenta de un integrante, su fila cambia de fondo y la
 * flecha gira, como en la lista del personal (D-244).
 */
export function TeamAccountsCard({
  raffleId,
  rows,
  hrefFor,
}: {
  raffleId: string
  rows: SettlementTeamRow[]
  hrefFor: (memberId: string) => string
}) {
  const copy = SETTLEMENT_COPY.team
  const closed = rows.filter((row) => row.status === 'closed').length

  return (
    <SettlementCard title={copy.title}>
      {rows.length === 0 ? (
        <p className="text-body-small text-muted-foreground">{copy.empty}</p>
      ) : (
        <>
          <p className="text-caption-regular text-muted-foreground -mt-2">
            {copy.closedCount(closed, rows.length)}
          </p>
          <ul className="divide-border divide-y">
            {rows.map((row) => (
              <li key={row.memberId} className="space-y-3 py-3 first:pt-0 last:pb-0">
                <RowLink
                  href={hrefFor(row.memberId)}
                  aria-label={copy.view(row.memberName)}
                  className="hover:bg-surface-accent focus-visible:ring-focus-ring has-[[data-link-pending=true]]:bg-surface-accent -mx-2 flex items-start gap-3 rounded-md px-2 py-2 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-label-medium min-w-0 break-words">{row.memberName}</p>
                      <p className="text-label-medium shrink-0 tabular-nums">
                        {formatCOP(Math.abs(row.balance))}
                      </p>
                    </div>
                    <p className="text-caption-regular text-muted-foreground">
                      {copy.line(row.ticketsPaid, SETTLEMENT_STATUS_LABELS[row.status])}
                    </p>
                  </div>
                  <RowLinkPendingChevron
                    className="mt-1"
                    announcement={copy.opening(row.memberName)}
                  />
                </RowLink>
                {row.balance > 0 ? (
                  <RecordTransferDialog
                    raffleId={raffleId}
                    sellerId={row.memberId}
                    kind="delivery"
                    fromName={row.memberName}
                    balance={row.balance}
                    awardsUnpaid={row.awardsUnpaid}
                    triggerLabel={SETTLEMENT_COPY.hero.register}
                    triggerAria={SETTLEMENT_COPY.hero.registerAria(firstName(row.memberName))}
                    fullWidth
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </SettlementCard>
  )
}
