import { HandCoinsIcon, InfoIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { OfflineRetry } from '@/features/pwa/components/OfflineRetry'
import { listRaffleOptions } from '@/features/raffles/queries'
import { BalanceList, BalanceRow } from '@/features/settlements/components/BalanceRows'
import { RecordPrizePaymentDialog } from '@/features/settlements/components/RecordPrizePaymentDialog'
import { RecordTransferDialog } from '@/features/settlements/components/RecordTransferDialog'
import {
  ChangedAfterCloseNotice,
  SettlementCard,
  SettlementErrorCard,
  SettlementHeroCard,
  SettlementTicketsCard,
} from '@/features/settlements/components/SettlementParts'
import {
  SettlementPrizesCard,
  type PrizeRowModel,
} from '@/features/settlements/components/SettlementPrizesCard'
import { SettlementRaffleSelect } from '@/features/settlements/components/SettlementRaffleSelect'
import {
  SettlementTransfersCard,
  type TransferRowModel,
} from '@/features/settlements/components/SettlementTransfersCard'
import { TeamAccountsCard } from '@/features/settlements/components/TeamAccountsCard'
import { VoidRecordButton } from '@/features/settlements/components/VoidRecordButton'
import { SETTLEMENT_COPY, firstName } from '@/features/settlements/copy'
import {
  readSellerSettlementAccount,
  readSellerSettlementPrizes,
  readSellerSettlementTeam,
  readSellerSettlementTransfers,
  type SellerSettlementAccount,
  type SellerSettlementPrize,
  type SettlementTransfer,
} from '@/features/settlements/queries'
import { parseSettlementRaffle } from '@/features/settlements/schemas'
import {
  earningsHint,
  headCanVoidPrize,
  headPrizePayers,
  prizeAmount,
  prizeDrawLine,
  prizeLabel,
  prizeState,
  prizeStateLabel,
  prizesSummary,
  teamPendingNotice,
} from '@/features/settlements/view'
import { requireRole } from '@/lib/auth/guards'
import { formatDateEs } from '@/lib/dates'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * «Mi cierre de cuentas» del vendedor (D-241).
 *
 * TRES FORMAS DE LA MISMA PANTALLA, decididas por la base:
 *
 *   vendedor directo sin equipo  lo que entrega al dueño;
 *   vendedor a cargo             lo que entrega al dueño —con las ventas de su
 *                                equipo dentro— y, aparte, la cuenta de cada
 *                                integrante con el;
 *   integrante                   lo que entrega a su vendedor a cargo.
 *
 * Lo abonado a boletas sin pagar y los nombres de los clientes son SUYOS: salen
 * aqui y en ninguna otra pantalla de otra persona (BR-Z03, BR-Z13).
 */
export default async function SellerSettlementPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const membership = await requireRole(['seller'])
  const raffles = await listRaffleOptions()
  const header = (description?: string) => (
    <PageHeader title={SETTLEMENT_COPY.sellerPage.title} description={description} />
  )

  if (raffles.length === 0) {
    return (
      <div className="space-y-6">
        {header()}
        <EmptyState
          icon={<HandCoinsIcon className="size-8" aria-hidden />}
          title={SETTLEMENT_COPY.raffle.noRaffles.title}
          description={SETTLEMENT_COPY.raffle.noRaffles.description}
        />
      </div>
    )
  }

  const requested = parseSettlementRaffle(await searchParams)
  const raffle = raffles.find((option) => option.id === requested) ?? raffles[0]!
  const raffleLabel = `${raffle.name} · ${raffle.shortCode}`
  const select =
    raffles.length > 1 ? (
      <div className="max-w-md">
        <SettlementRaffleSelect
          raffles={raffles.map((option) => ({
            value: option.id,
            label: `${option.name} · ${option.shortCode}`,
          }))}
          value={raffle.id}
        />
      </div>
    ) : null

  const [accountResult, prizesResult, transfersResult, teamResult] = await Promise.all([
    readSellerSettlementAccount(raffle.id),
    readSellerSettlementPrizes(raffle.id),
    readSellerSettlementTransfers(raffle.id),
    readSellerSettlementTeam(raffle.id),
  ])

  if (
    accountResult.kind === 'error' ||
    prizesResult.kind === 'error' ||
    transfersResult.kind === 'error' ||
    teamResult.kind === 'error'
  ) {
    return (
      <div className="space-y-6">
        {header(raffleLabel)}
        {select}
        <SettlementErrorCard
          retry={
            <OfflineRetry href={`/seller/settlement?raffleId=${raffle.id}`} className="sm:h-11" />
          }
        />
      </div>
    )
  }

  const account = accountResult.value
  if (!account) {
    return (
      <div className="space-y-6">
        {header(raffleLabel)}
        {select}
        <EmptyState
          icon={<HandCoinsIcon className="size-8" aria-hidden />}
          title={SETTLEMENT_COPY.sellerPage.empty.title}
          description={SETTLEMENT_COPY.sellerPage.empty.description}
        />
      </div>
    )
  }

  const viewerId = membership.profileId
  const team = teamResult.value
  const isMember = account.counterpartId !== null
  const isHead = !isMember && (account.members > 0 || team.length > 0)
  const teamIds = new Set(team.map((row) => row.memberId))
  const pendingNotice = isHead ? teamPendingNotice(team) : null

  return (
    <div className="space-y-6">
      {header(raffleLabel)}
      {select}

      {account.changedAfterClose ? (
        <ChangedAfterCloseNotice
          closedAt={account.closedAt}
          atClose={account.closingFigures}
          now={account.figures}
        />
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <OwnHero account={account} raffleId={raffle.id} isHead={isHead} />
          <SettlementTicketsCard
            variant="compact"
            active={account.ticketsActive}
            sold={account.ticketsSold}
            paid={account.ticketsPaid}
            own={account.ownTicketsPaid}
            team={account.teamTicketsPaid}
            partialPaid={account.partialPaid}
          />
          <OwnCalculation
            account={account}
            isHead={isHead}
            paidByMe={prizesResult.value.filter((prize) => prize.payerId === viewerId).length}
          />
        </div>

        <div className="space-y-6">
          {isHead ? (
            <>
              <TeamAccountsCard
                raffleId={raffle.id}
                rows={team}
                hrefFor={(memberId) => `/seller/settlement/team/${memberId}?raffleId=${raffle.id}`}
              />
              {pendingNotice ? (
                <Notice tone="info" icon={<InfoIcon />}>
                  {pendingNotice}
                </Notice>
              ) : null}
            </>
          ) : null}

          <SettlementPrizesCard
            title={SETTLEMENT_COPY.prizes.sellerTitle}
            aside={(() => {
              const summary = prizesSummary(prizesResult.value)
              return SETTLEMENT_COPY.prizes.summary(summary.count, summary.paid)
            })()}
            rows={prizesResult.value.map((prize) =>
              ownPrizeRow(prize, { viewerId, account, isHead, teamIds, raffleId: raffle.id }),
            )}
            emptyText={SETTLEMENT_COPY.prizes.empty}
          />

          <SettlementTransfersCard
            title={SETTLEMENT_COPY.transfers.sellerTitle}
            rows={transfersResult.value.map((transfer) => ownTransferRow(transfer, viewerId))}
          />
        </div>
      </div>

      <p className="text-caption-regular text-muted-foreground">{SETTLEMENT_COPY.money.footer}</p>
    </div>
  )
}

function OwnHero({
  account,
  raffleId,
  isHead,
}: {
  account: SellerSettlementAccount
  raffleId: string
  isHead: boolean
}) {
  const hero = SETTLEMENT_COPY.hero
  const head = account.counterpartName
  const rows: Array<{ label: string; amount: number }> = [
    { label: hero.delivered, amount: account.delivered },
  ]
  if (account.refunded > 0) rows.push({ label: hero.yourRefunds, amount: account.refunded })

  if (account.balance < 0) {
    return (
      <SettlementHeroCard
        status={account.status}
        label={hero.owedToYou}
        amount={-account.balance}
        rows={rows}
        action={
          <RecordTransferDialog
            raffleId={raffleId}
            sellerId={account.sellerId}
            kind="refund"
            fromName={head ?? ''}
            fromOwner={head === null}
            balance={account.balance}
            awardsUnpaid={account.awardsUnpaid}
            triggerLabel={hero.confirmRefund}
            fullWidth
          />
        }
        notes={[hero.confirmRefundHint]}
      />
    )
  }

  const notes = [
    head ? hero.headIs(firstName(head)) : isHead ? hero.includesTeam : '',
    account.status === 'closed'
      ? hero.yourClosed
      : account.status === 'missing_info'
        ? hero.yourMissingInfo
        : account.status === 'no_activity'
          ? hero.yourNoActivity
          : '',
  ]

  return (
    <SettlementHeroCard
      status={account.status}
      label={head ? hero.toHead(head) : hero.toOwner}
      amount={account.balance}
      rows={rows}
      notes={notes}
    />
  )
}

function OwnCalculation({
  account,
  isHead,
  paidByMe,
}: {
  account: SellerSettlementAccount
  isHead: boolean
  /** Cuantos premios pago el propio vendedor: «Premio que pagaste» o «Premios que pagaste». */
  paidByMe: number
}) {
  const calc = SETTLEMENT_COPY.sellerCalc
  const head = account.counterpartName
  return (
    <SettlementCard title={head ? calc.memberTitle : calc.ownTitle}>
      <BalanceList>
        <BalanceRow
          label={SETTLEMENT_COPY.calc.collectedOf(account.ticketsPaid)}
          amount={account.collected}
        />
        <BalanceRow
          label={calc.yourEarnings}
          amount={account.holderEarned + account.holderTeamEarned}
          sign="minus"
          hint={earningsHint(account)}
        />
        {isHead ? (
          <BalanceRow label={calc.teamEarnings} amount={account.membersEarned} sign="minus" />
        ) : null}
        {account.prizesPaid > 0 ? (
          <BalanceRow
            label={isHead ? calc.prizesYouAndTeam : calc.prizesYou(paidByMe)}
            amount={account.prizesPaid}
            sign="minus"
          />
        ) : null}
        {account.otherMovements !== 0 ? (
          <BalanceRow
            label={SETTLEMENT_COPY.calc.otherMovements}
            amount={Math.abs(account.otherMovements)}
            sign={account.otherMovements < 0 ? 'minus' : 'plus'}
            hint={SETTLEMENT_COPY.calc.otherMovementsHint}
          />
        ) : null}
        <BalanceRow
          label={head ? calc.totalFor(firstName(head)) : calc.totalForOwner}
          amount={account.totalDue}
          divided
          emphasis="total"
        />
        <BalanceRow label={calc.delivered} amount={account.delivered} sign="minus" />
        {account.refunded > 0 ? (
          <BalanceRow label={calc.refunded} amount={account.refunded} sign="plus" />
        ) : null}
        <BalanceRow
          label={account.balance < 0 ? calc.inYourFavor : calc.stillToDeliver}
          amount={Math.abs(account.balance)}
          divided
          emphasis="brand"
        />
      </BalanceList>
    </SettlementCard>
  )
}

function ownPrizeRow(
  prize: SellerSettlementPrize,
  context: {
    viewerId: string
    account: SellerSettlementAccount
    isHead: boolean
    teamIds: Set<string>
    raffleId: string
  },
): PrizeRowModel {
  const { viewerId, account, isHead, teamIds, raffleId } = context
  const payerInAccount =
    prize.payer === 'seller' &&
    prize.payerId !== null &&
    (prize.payerId === viewerId || (isHead && teamIds.has(prize.payerId)))
  const state = prizeState(prize, payerInAccount)
  const warnings: string[] = []
  if (state === 'conflict') warnings.push(SETTLEMENT_COPY.prizes.conflictHint)
  if (prize.numbersChanged) warnings.push(SETTLEMENT_COPY.prizes.numbersChanged)
  if (state === 'unpaid' && prize.ownTicket) {
    warnings.push(
      account.counterpartName
        ? SETTLEMENT_COPY.prizes.recordedByHead(firstName(account.counterpartName))
        : SETTLEMENT_COPY.prizes.recordedByStaff,
    )
  }
  const memberTicket = isHead && prize.ticketSellerId !== viewerId

  return {
    key: `${prize.matchId}:${prize.prizeId}`,
    title: prizeLabel(prize),
    drawLine: prizeDrawLine(prize, viewerId),
    detail: prize.ownTicket
      ? prize.clientName
        ? SETTLEMENT_COPY.prizes.client(prize.clientName)
        : undefined
      : SETTLEMENT_COPY.prizes.seller(prize.ticketSellerName),
    amount: prizeAmount(prize),
    stateLabel: prizeStateLabel(state, 'seller'),
    stateTone:
      state === 'discounted'
        ? 'brand'
        : state === 'owner' || state === 'other'
          ? 'muted'
          : 'warning',
    warnings,
    record:
      prize.canRecord && memberTicket ? (
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
      memberTicket && prize.paymentId && headCanVoidPrize(prize, prize.ticketSellerId) ? (
        <VoidRecordButton
          kind="prize"
          id={prize.paymentId}
          amount={prize.amount ?? 0}
          ariaLabel={`${SETTLEMENT_COPY.prizes.void}: ${prizeLabel(prize)}`}
        />
      ) : undefined,
  }
}

function ownTransferRow(transfer: SettlementTransfer, viewerId: string): TransferRowModel {
  const copy = SETTLEMENT_COPY.transfers
  const date = formatDateEs(transfer.receivedOn)
  const toHead = transfer.counterpartId !== null
  let line: string
  let note: string | undefined
  if (transfer.kind === 'refund') {
    line =
      transfer.sellerId === viewerId
        ? copy.refundYouConfirmed(date)
        : copy.refundConfirmedBy(date, transfer.sellerName)
  } else if (toHead) {
    line = date
    note = copy.confirmedByHead(firstName(transfer.counterpartName ?? ''))
  } else {
    line = copy.receivedBy(date, transfer.confirmedByName)
    note =
      transfer.sellerId !== viewerId
        ? SETTLEMENT_COPY.prizes.seller(transfer.sellerName)
        : undefined
  }
  return {
    key: transfer.id,
    line,
    amount: transfer.amount,
    refund: transfer.kind === 'refund',
    voidedReason: transfer.voidedAt ? (transfer.voidReason ?? '') : null,
    note,
    voidAction: transfer.canVoid ? (
      <VoidRecordButton
        kind="transfer"
        id={transfer.id}
        amount={transfer.amount}
        ariaLabel={copy.voidAria(date)}
      />
    ) : undefined,
  }
}
