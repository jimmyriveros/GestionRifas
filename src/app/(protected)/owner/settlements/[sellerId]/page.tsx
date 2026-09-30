import { HandCoinsIcon, InfoIcon } from 'lucide-react'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { OfflineRetry } from '@/features/pwa/components/OfflineRetry'
import { listRaffleOptions } from '@/features/raffles/queries'
import { BalanceList, BalanceRow } from '@/features/settlements/components/BalanceRows'
import { RecordPrizePaymentDialog } from '@/features/settlements/components/RecordPrizePaymentDialog'
import { ReceiverHero } from '@/features/settlements/components/ReceiverHero'
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
  readStaffSettlementAccount,
  readStaffSettlementPrizes,
  readStaffSettlementTransfers,
  type StaffSettlementAccount,
  type StaffSettlementPrize,
} from '@/features/settlements/queries'
import { parseSettlementRaffle } from '@/features/settlements/schemas'
import {
  prizeAmount,
  prizeDrawLine,
  prizeLabel,
  prizeState,
  prizeStateLabel,
  prizesSummary,
  staffCanVoidPrize,
  staffPrizePayers,
} from '@/features/settlements/view'
import { hasCapability } from '@/lib/auth/capability-resolver'
import { requireStaff } from '@/lib/auth/guards'
import { formatDateEs } from '@/lib/dates'

type Params = Promise<{ sellerId: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * La cuenta de un vendedor directo con el dueño (D-241): como se calcula lo que
 * debe entregar, lo que ya se recibio, sus premios y sus entregas.
 *
 * EL CALCULO ES EL DE LA BASE, linea a linea: valor de las boletas pagadas,
 * ganancias —del motor, con la del vendedor a cargo y la de sus integrantes—,
 * parte del dueño, premios que pagaron y total. La pantalla no suma ni resta;
 * cada cifra llega de `staff_settlement_account`.
 *
 * SIN CLIENTES (BR-Z13): los premios traen la boleta y quien la vendio, nunca a
 * quien. Los nombres de los clientes solo estan en la cuenta de su vendedor.
 */
export default async function OwnerSettlementDetailPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const membership = await requireStaff()
  if (!(await hasCapability(membership, 'settlements.manage'))) redirect('/denied')

  const { sellerId } = await params
  const raffles = await listRaffleOptions()
  const raffleId = parseSettlementRaffle(await searchParams) ?? raffles[0]?.id
  const raffle = raffles.find((option) => option.id === raffleId)
  const back = raffle ? `/owner/settlements?raffleId=${raffle.id}` : '/owner/settlements'
  const copy = SETTLEMENT_COPY.staffDetail

  const notFound = (
    <div className="space-y-6">
      <PageHeader title={SETTLEMENT_COPY.staffList.title} backHref={back} backLabel={copy.back} />
      <EmptyState
        icon={<HandCoinsIcon className="size-8" aria-hidden />}
        title={copy.notFound.title}
        description={copy.notFound.description}
      />
    </div>
  )
  if (!raffle) return notFound

  const [accountResult, prizesResult, transfersResult] = await Promise.all([
    readStaffSettlementAccount(raffle.id, sellerId),
    readStaffSettlementPrizes(raffle.id, sellerId),
    readStaffSettlementTransfers(raffle.id, sellerId),
  ])

  if (
    accountResult.kind === 'error' ||
    prizesResult.kind === 'error' ||
    transfersResult.kind === 'error'
  ) {
    return (
      <div className="space-y-6">
        <PageHeader title={SETTLEMENT_COPY.staffList.title} backHref={back} backLabel={copy.back} />
        <SettlementErrorCard
          retry={
            <OfflineRetry
              href={`/owner/settlements/${sellerId}?raffleId=${raffle.id}`}
              className="sm:h-11"
            />
          }
        />
      </div>
    )
  }
  const account = accountResult.value
  if (!account) return notFound

  const name = account.sellerName
  const first = firstName(name)
  const team = account.members > 0
  const raffleLabel = `${raffle.name} · ${raffle.shortCode}`

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title(name)}
        description={copy.description(raffleLabel, team)}
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

      <SettlementTicketsCard
        variant="grid"
        active={account.ticketsActive}
        sold={account.ticketsSold}
        paid={account.ticketsPaid}
        own={account.ownTicketsPaid}
        team={account.teamTicketsPaid}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26.5rem)]">
        {/* El saldo va primero: en el telefono se lee y se toca antes que el
            calculo que lo explica. Desde `lg` se coloca a su derecha. */}
        <div className="lg:col-start-2 lg:row-start-1">
          <ReceiverHero raffleId={raffle.id} account={account} />
        </div>
        <div className="lg:col-start-1 lg:row-start-1">
          <Calculation account={account} first={first} team={team} />
        </div>
      </div>

      <SettlementPrizesCard
        title={SETTLEMENT_COPY.prizes.staffTitle}
        aside={(() => {
          const summary = prizesSummary(prizesResult.value)
          return SETTLEMENT_COPY.prizes.summary(summary.count, summary.paid)
        })()}
        rows={prizesResult.value.map((prize) => prizeRow(prize, account, raffle.id))}
        emptyText={SETTLEMENT_COPY.prizes.empty}
      >
        {account.prizeCostOrg > 0 ? (
          <Notice tone="info" icon={<InfoIcon />}>
            {SETTLEMENT_COPY.prizes.ownerPaidNotice(account.prizeCostOrg)}
          </Notice>
        ) : null}
        {account.ownerGain !== null && account.awards > 0 ? (
          <BalanceList>
            <BalanceRow
              label={SETTLEMENT_COPY.prizes.ownerGain}
              amount={account.ownerGain}
              emphasis="total"
              hint={
                account.awardsUnpaid > 0
                  ? SETTLEMENT_COPY.prizes.ownerGainPending(account.awardsUnpaid)
                  : undefined
              }
            />
          </BalanceList>
        ) : null}
      </SettlementPrizesCard>

      <SettlementTransfersCard
        title={SETTLEMENT_COPY.transfers.staffTitle}
        rows={transfersResult.value.map((transfer): TransferRowModel => ({
          key: transfer.id,
          line:
            transfer.kind === 'refund'
              ? SETTLEMENT_COPY.transfers.refundConfirmedBy(
                  formatDateEs(transfer.receivedOn),
                  transfer.sellerName,
                )
              : SETTLEMENT_COPY.transfers.receivedBy(
                  formatDateEs(transfer.receivedOn),
                  transfer.confirmedByName,
                ),
          amount: transfer.amount,
          refund: transfer.kind === 'refund',
          voidedReason: transfer.voidedAt ? (transfer.voidReason ?? '') : null,
          note:
            team && transfer.sellerId !== account.sellerId
              ? SETTLEMENT_COPY.prizes.seller(transfer.sellerName)
              : undefined,
          voidAction: transfer.canVoid ? (
            <VoidRecordButton
              kind="transfer"
              id={transfer.id}
              amount={transfer.amount}
              ariaLabel={SETTLEMENT_COPY.transfers.voidAria(formatDateEs(transfer.receivedOn))}
            />
          ) : undefined,
        }))}
      />

      <p className="text-caption-regular text-muted-foreground">{copy.privacy}</p>
    </div>
  )
}

function Calculation({
  account,
  first,
  team,
}: {
  account: StaffSettlementAccount
  first: string
  team: boolean
}) {
  const calc = SETTLEMENT_COPY.calc
  const earnings = account.holderEarned + account.holderTeamEarned + account.membersEarned
  return (
    <SettlementCard title={calc.staffTitle}>
      <BalanceList>
        <BalanceRow label={calc.collected} amount={account.collected} />
        <BalanceRow
          label={calc.earningsOf(first, team)}
          amount={earnings}
          sign="minus"
          hint={
            team
              ? calc.earningsSplit(
                  first,
                  account.holderEarned + account.holderTeamEarned,
                  account.membersEarned,
                )
              : undefined
          }
        />
        <BalanceRow label={calc.ownerShare} amount={account.ownerShare} divided emphasis="total" />
        {account.prizesPaid > 0 ? (
          <BalanceRow label={calc.prizesOf(first, team)} amount={account.prizesPaid} sign="minus" />
        ) : null}
        {account.otherMovements !== 0 ? (
          <BalanceRow
            label={calc.otherMovements}
            amount={Math.abs(account.otherMovements)}
            sign={account.otherMovements < 0 ? 'minus' : 'plus'}
            hint={calc.otherMovementsHint}
          />
        ) : null}
        <BalanceRow label={calc.totalDue} amount={account.totalDue} divided emphasis="total" />
      </BalanceList>
    </SettlementCard>
  )
}

function prizeRow(
  prize: StaffSettlementPrize,
  account: StaffSettlementAccount,
  raffleId: string,
): PrizeRowModel {
  const state = prizeState(prize, prize.payerInAccount)
  const warnings: string[] = []
  if (state === 'conflict') warnings.push(SETTLEMENT_COPY.prizes.conflictHint)
  if (prize.numbersChanged) warnings.push(SETTLEMENT_COPY.prizes.numbersChanged)
  if (state === 'unpaid' && prize.parentId === account.sellerId) {
    warnings.push(
      SETTLEMENT_COPY.prizes.memberPaidByHead(
        firstName(prize.ticketSellerName),
        firstName(account.sellerName),
      ),
    )
  }

  return {
    key: `${prize.matchId}:${prize.prizeId}`,
    title: prizeLabel(prize),
    drawLine: prizeDrawLine(prize),
    detail:
      prize.ticketSellerId !== account.sellerId
        ? SETTLEMENT_COPY.prizes.seller(prize.ticketSellerName)
        : undefined,
    amount: prizeAmount(prize),
    stateLabel: prizeStateLabel(state, 'staff'),
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
        payers={staffPrizePayers(prize, account)}
        triggerAria={SETTLEMENT_COPY.prizes.registerAria(prizeLabel(prize))}
      />
    ) : undefined,
    voidAction:
      prize.paymentId && staffCanVoidPrize(prize, account.sellerId) ? (
        <VoidRecordButton
          kind="prize"
          id={prize.paymentId}
          amount={prize.amount ?? 0}
          ariaLabel={`${SETTLEMENT_COPY.prizes.void}: ${prizeLabel(prize)}`}
        />
      ) : undefined,
  }
}
