import { HandCoinsIcon, InfoIcon } from 'lucide-react'
import { redirect } from 'next/navigation'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { TableSection } from '@/components/data/TableSection'
import { Notice } from '@/components/feedback/Notice'
import { OfflineRetry } from '@/features/pwa/components/OfflineRetry'
import { listRaffleOptions } from '@/features/raffles/queries'
import { SettlementAccountsList } from '@/features/settlements/components/SettlementAccountsList'
import { SettlementListFilters } from '@/features/settlements/components/SettlementListFilters'
import { SettlementErrorCard } from '@/features/settlements/components/SettlementParts'
import { SettlementRaffleSelect } from '@/features/settlements/components/SettlementRaffleSelect'
import { SETTLEMENT_COPY } from '@/features/settlements/copy'
import {
  readStaffSettlementAccounts,
  readStaffSettlementOverview,
} from '@/features/settlements/queries'
import { parseSettlementListFilters } from '@/features/settlements/schemas'
import { hasCapability } from '@/lib/auth/capability-resolver'
import { requireStaff } from '@/lib/auth/guards'
import { formatCOP } from '@/lib/money'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const COPY = SETTLEMENT_COPY.staffList

/**
 * «Cierre de cuentas» del Dueño y el Administrador (D-241, BR-Z01..BR-Z18).
 *
 * UNA CUENTA POR VENDEDOR DIRECTO, con las ventas de su equipo dentro. Lo que un
 * integrante entrega a su vendedor a cargo es asunto de ellos dos y no suma a
 * «Recibido»: el dueño cierra con el vendedor a cargo.
 *
 * LAS CIFRAS SON DE LA BASE: el recibido, lo que falta y las cuentas cerradas
 * salen de `staff_settlement_overview`, y cada fila de `staff_settlement_accounts`,
 * filtrada y paginada en PostgreSQL. Es la excepcion acotada a BR-Q08 que pidio
 * el dueño: cifras agregadas por cuenta, nunca un cliente ni un abono (BR-Z13).
 *
 * Solo con la capacidad `settlements.manage`: la base la vuelve a exigir en cada
 * lectura y en cada confirmacion.
 */
export default async function OwnerSettlementsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const membership = await requireStaff()
  if (!(await hasCapability(membership, 'settlements.manage'))) redirect('/denied')

  const filters = parseSettlementListFilters(await searchParams)
  const raffles = await listRaffleOptions()

  const header = <PageHeader title={COPY.title} description={COPY.description} />

  if (raffles.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={<HandCoinsIcon className="size-8" aria-hidden />}
          title={SETTLEMENT_COPY.raffle.noRaffles.title}
          description={SETTLEMENT_COPY.raffle.noRaffles.description}
        />
      </div>
    )
  }

  const raffle = raffles.find((option) => option.id === filters.raffleId) ?? raffles[0]!
  const [overview, accounts] = await Promise.all([
    readStaffSettlementOverview(raffle.id),
    readStaffSettlementAccounts(raffle.id, filters),
  ])
  const base = `/owner/settlements?raffleId=${raffle.id}`
  const filtered = Boolean(filters.search) || filters.status !== 'all'

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:items-end">
        <SettlementRaffleSelect
          raffles={raffles.map((option) => ({
            value: option.id,
            label: `${option.name} · ${option.shortCode}`,
          }))}
          value={raffle.id}
        />
        <div className="space-y-0.5 md:pb-1">
          <p className="text-label-medium">{COPY.scopeTitle}</p>
          <p className="text-body-small text-muted-foreground">{COPY.scopeHint}</p>
        </div>
      </div>

      {overview.kind === 'error' || accounts.kind === 'error' ? (
        <SettlementErrorCard retry={<OfflineRetry href={base} className="sm:h-11" />} />
      ) : (
        <>
          {overview.value ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-3">
                <MetricCard
                  label={COPY.metrics.received}
                  value={formatCOP(overview.value.receivedTotal)}
                  hint={COPY.metrics.receivedHint}
                  className="bg-brand-subtle border-status-success-border"
                />
                <MetricCard
                  label={COPY.metrics.pending}
                  value={formatCOP(overview.value.pendingTotal)}
                  hint={COPY.metrics.pendingHint(overview.value.pendingAccounts)}
                />
                <MetricCard
                  label={COPY.metrics.closed}
                  value={COPY.metrics.closedValue(
                    overview.value.closedAccounts,
                    overview.value.accounts,
                  )}
                  hint={COPY.metrics.closedHint(
                    overview.value.accounts - overview.value.closedAccounts,
                  )}
                />
              </div>
              {overview.value.inFavorAccounts > 0 ? (
                <Notice tone="info" icon={<InfoIcon />}>
                  {COPY.metrics.inFavor(
                    overview.value.inFavorTotal,
                    overview.value.inFavorAccounts,
                  )}
                </Notice>
              ) : null}
            </>
          ) : null}

          <TableSection
            title={COPY.tableTitle}
            action={
              <p
                className="text-caption-regular text-muted-foreground whitespace-nowrap"
                aria-live="polite"
              >
                {COPY.count(accounts.value.total)}
              </p>
            }
          >
            <div className="space-y-4 px-2 pb-2">
              <SettlementListFilters />
              {accounts.value.total === 0 ? (
                <EmptyState
                  icon={<HandCoinsIcon className="size-8" aria-hidden />}
                  title={filtered ? COPY.emptyFiltered.title : COPY.empty.title}
                  description={filtered ? COPY.emptyFiltered.description : COPY.empty.description}
                />
              ) : (
                <SettlementAccountsList
                  rows={accounts.value.rows}
                  hrefFor={(sellerId) => `/owner/settlements/${sellerId}?raffleId=${raffle.id}`}
                />
              )}
              <p className="text-caption-regular text-muted-foreground">{COPY.internalNote}</p>
            </div>
          </TableSection>

          {accounts.value.total > 0 ? (
            <DataTablePagination
              total={accounts.value.total}
              page={accounts.value.page}
              pageSize={accounts.value.pageSize}
              items="sellers"
            />
          ) : null}
          <p className="text-caption-regular text-muted-foreground">
            {SETTLEMENT_COPY.money.footer}
          </p>
        </>
      )}
    </div>
  )
}
