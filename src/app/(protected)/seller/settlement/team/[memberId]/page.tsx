import { HandCoinsIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { OfflineRetry } from '@/features/pwa/components/OfflineRetry'
import { listRaffleOptions } from '@/features/raffles/queries'
import { BalanceList, BalanceRow } from '@/features/settlements/components/BalanceRows'
import { ReceiverHero } from '@/features/settlements/components/ReceiverHero'
import { RecordPrizePaymentDialog } from '@/features/settlements/components/RecordPrizePaymentDialog'
import {
  ChangedAfterCloseNotice,
  SettlementCard,
  SettlementErrorCard,
  SettlementTicketsCard,
} from '@/features/settlements/components/SettlementParts'
import {
  SettlementPrizesCard,
  type PrizeRowModel,
} from '@/features/settlements/components/SettlementPrizesCard'
import {
  SettlementTransfersCard,
  type TransferRowModel,
} from '@/features/settlements/components/SettlementTransfersCard'
import { VoidRecordButton } from '@/features/settlements/components/VoidRecordButton'
import { SETTLEMENT_COPY, firstName } from '@/features/settlements/copy'
import {
  readSellerSettlementAccount,
  readSellerSettlementPrizes,
  readSellerSettlementTransfers,
  type SellerSettlementAccount,
  type SellerSettlementPrize,
} from '@/features/settlements/queries'
import { parseSettlementRaffle } from '@/features/settlements/schemas'
import {
  headCanVoidPrize,
  headPrizePayers,
  prizeAmount,
  prizeDrawLine,
  prizeLabel,
  prizeState,
  prizeStateLabel,
  prizesSummary,
} from '@/features/settlements/view'
import { requireRole } from '@/lib/auth/guards'
import { formatDateEs } from '@/lib/dates'

type Params = Promise<{ memberId: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * La cuenta de un integrante con su vendedor a cargo, vista por este (D-241,
 * BR-Z06). Aqui el vendedor a cargo confirma lo que recibe y registra los
 * premios que pago su integrante.
 *
 * CIFRAS AGREGADAS, NADA DE CARTERA (BR-Z13): el valor de sus boletas pagadas,
 * su ganancia, sus premios —con la boleta, sin el cliente— y sus entregas. La
 * base responde vacio si quien mira no es su vendedor a cargo de hoy.
 */
export default async function TeamMemberSettlementPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  await requireRole(['seller'])
  const { memberId } = await params
  const raffles = await listRaffleOptions()
  const raffleId = parseSettlementRaffle(await searchParams) ?? raffles[0]?.id
  const raffle = raffles.find((option) => option.id === raffleId)
  const copy = SETTLEMENT_COPY.member
  const back = raffle ? `/seller/settlement?raffleId=${raffle.id}` : '/seller/settlement'

  const notFound = (
    <div className="space-y-6">
      <PageHeader title={SETTLEMENT_COPY.sellerPage.title} backHref={back} backLabel={copy.back} />
      <EmptyState
        icon={<HandCoinsIcon className="size-8" aria-hidden />}
        title={copy.notFound.title}
        description={copy.notFound.description}
      />
    </div>
  )
  if (!raffle) return notFound

  const [accountResult, prizesResult, transfersResult] = await Promise.all([
    readSellerSettlementAccount(raffle.id, memberId),
    readSellerSettlementPrizes(raffle.id, memberId),
    readSellerSettlementTransfers(raffle.id, memberId),
  ])

  if (
    accountResult.kind === 'error' ||
    prizesResult.kind === 'error' ||
    transfersResult.kind === 'error'
  ) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={SETTLEMENT_COPY.sellerPage.title}
          backHref={back}
          backLabel={copy.back}
        />
        <SettlementErrorCard
          retry={
            <OfflineRetry
              href={`/seller/settlement/team/${memberId}?raffleId=${raffle.id}`}
              className="sm:h-11"
            />
          }
        />
      </div>
    )
  }
  const account = accountResult.value
  if (!account) return notFound

  const first = firstName(account.sellerName)
  const raffleLabel = `${raffle.name} · ${raffle.shortCode}`

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title(account.sellerName)}
        description={copy.description(raffleLabel)}
        backHref={back}
        backLabel={copy.back}
      />

      {account.changedAfterClose ? (
        <ChangedAfterCloseNotice
          closedAt={account.closedAt}
          atClose={account.closingFigures}
          now={account.figures}
        />
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26.5rem)]">
        {/* El saldo va primero en el telefono; desde `lg`, a la derecha. */}
        <div className="lg:col-start-2 lg:row-start-1">
          <ReceiverHero raffleId={raffle.id} account={account} />
        </div>
        <div className="space-y-6 lg:col-start-1 lg:row-start-1">
          <SettlementTicketsCard
            variant="compact"
            active={account.ticketsActive}
            sold={account.ticketsSold}
            paid={account.ticketsPaid}
            own={account.ownTicketsPaid}
            team={0}
          />
          <MemberCalculation account={account} first={first} />
        </div>
      </div>

      <SettlementPrizesCard
        title={SETTLEMENT_COPY.prizes.memberTitle(first)}
        aside={(() => {
          const summary = prizesSummary(prizesResult.value)
          return SETTLEMENT_COPY.prizes.summary(summary.count, summary.paid)
        })()}
        rows={prizesResult.value.map((prize) => memberPrizeRow(prize, memberId, raffle.id))}
        emptyText={SETTLEMENT_COPY.prizes.empty}
      />

      <SettlementTransfersCard
        title={SETTLEMENT_COPY.transfers.memberTitle}
        rows={transfersResult.value.map((transfer): TransferRowModel => {
          const date = formatDateEs(transfer.receivedOn)
          return {
            key: transfer.id,
            line:
              transfer.kind === 'refund'
                ? SETTLEMENT_COPY.transfers.refundConfirmedBy(date, transfer.sellerName)
                : SETTLEMENT_COPY.transfers.deliveredFrom(date, first),
            amount: transfer.amount,
            refund: transfer.kind === 'refund',
            voidedReason: transfer.voidedAt ? (transfer.voidReason ?? '') : null,
            voidAction: transfer.canVoid ? (
              <VoidRecordButton
                kind="transfer"
                id={transfer.id}
                amount={transfer.amount}
                ariaLabel={SETTLEMENT_COPY.transfers.voidAria(date)}
              />
            ) : undefined,
          }
        })}
      />

      <p className="text-caption-regular text-muted-foreground">{SETTLEMENT_COPY.money.footer}</p>
    </div>
  )
}

function MemberCalculation({
  account,
  first,
}: {
  account: SellerSettlementAccount
  first: string
}) {
  const copy = SETTLEMENT_COPY.member
  return (
    <SettlementCard title={copy.calcTitle}>
      <BalanceList>
        <BalanceRow
          label={SETTLEMENT_COPY.calc.collectedOf(account.ticketsPaid)}
          amount={account.collected}
        />
        <BalanceRow
          label={copy.earningsOf(first)}
          amount={account.holderEarned + account.holderTeamEarned}
          sign="minus"
        />
        {account.prizesPaid > 0 ? (
          <BalanceRow label={copy.prizesOf(first)} amount={account.prizesPaid} sign="minus" />
        ) : null}
        {account.otherMovements !== 0 ? (
          <BalanceRow
            label={SETTLEMENT_COPY.calc.otherMovements}
            amount={Math.abs(account.otherMovements)}
            sign={account.otherMovements < 0 ? 'minus' : 'plus'}
            hint={SETTLEMENT_COPY.calc.otherMovementsHint}
          />
        ) : null}
        <BalanceRow label={copy.totalForYou} amount={account.totalDue} divided emphasis="total" />
        <BalanceRow
          label={SETTLEMENT_COPY.calc.delivered}
          amount={account.delivered}
          sign="minus"
        />
        {account.refunded > 0 ? (
          <BalanceRow label={SETTLEMENT_COPY.hero.refunded} amount={account.refunded} sign="plus" />
        ) : null}
        <BalanceRow
          label={
            account.balance < 0
              ? SETTLEMENT_COPY.hero.owedTo(first)
              : SETTLEMENT_COPY.hero.pendingFrom(first)
          }
          amount={Math.abs(account.balance)}
          divided
          emphasis="brand"
        />
      </BalanceList>
    </SettlementCard>
  )
}

function memberPrizeRow(
  prize: SellerSettlementPrize,
  memberId: string,
  raffleId: string,
): PrizeRowModel {
  const state = prizeState(prize, prize.payer === 'seller' && prize.payerId === memberId)
  const warnings: string[] = []
  if (state === 'conflict') warnings.push(SETTLEMENT_COPY.prizes.conflictHint)
  if (prize.numbersChanged) warnings.push(SETTLEMENT_COPY.prizes.numbersChanged)

  return {
    key: `${prize.matchId}:${prize.prizeId}`,
    title: prizeLabel(prize),
    drawLine: prizeDrawLine(prize),
    amount: prizeAmount(prize),
    stateLabel:
      state === 'discounted' ? SETTLEMENT_COPY.prizes.discounted : prizeStateLabel(state, 'staff'),
    stateTone:
      state === 'discounted'
        ? 'brand'
        : state === 'owner' || state === 'other'
          ? 'muted'
          : 'warning',
    warnings,
    record: prize.canRecord ? (
      <RecordPrizePaymentDialog
        raffleId={raffleId}
        matchId={prize.matchId}
        prizeId={prize.prizeId}
        prizeLabel={prizeLabel(prize)}
        drawLabel={SETTLEMENT_COPY.prizes.draw(
          prize.referenceDate ? formatDateEs(prize.referenceDate) : '—',
        )}
        knownAmount={prize.knownAmount}
        valuePending={prize.valuePending}
        minDate={prize.referenceDate}
        payers={headPrizePayers(prize)}
        triggerAria={SETTLEMENT_COPY.prizes.registerAria(prizeLabel(prize))}
      />
    ) : undefined,
    voidAction:
      prize.paymentId && headCanVoidPrize(prize, memberId) ? (
        <VoidRecordButton
          kind="prize"
          id={prize.paymentId}
          amount={prize.amount ?? 0}
          ariaLabel={`${SETTLEMENT_COPY.prizes.void}: ${prizeLabel(prize)}`}
        />
      ) : undefined,
  }
}
