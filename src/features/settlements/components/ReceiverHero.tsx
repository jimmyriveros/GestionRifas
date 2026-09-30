import { formatDateEs } from '@/lib/dates'
import type { SettlementAccountStatus } from '@/lib/constants'

import { SETTLEMENT_COPY, firstName } from '../copy'
import { ConfirmCloseButton } from './ConfirmCloseButton'
import { RecordTransferDialog } from './RecordTransferDialog'
import { SettlementHeroCard } from './SettlementParts'

type ReceiverAccount = {
  sellerId: string
  sellerName: string
  status: SettlementAccountStatus
  balance: number
  delivered: number
  refunded: number
  awardsUnpaid: number
  fingerprint: string
  closedAt: string | null
}

/**
 * El recuadro del saldo para QUIEN RECIBE: el personal mirando una cuenta con el
 * dueño, o un vendedor a cargo mirando la de un integrante (BR-Z05, BR-Z06).
 *
 *   saldo > 0   «Falta recibir de Carlos» y el boton para confirmar lo recibido;
 *   saldo < 0   «Falta devolver a Marta»: la devolucion la confirma ella;
 *   saldo = 0   cerrada, por cerrar (con su boton) o con un premio por registrar.
 *
 * `audience` decide el POSESIVO, nada mas (D-182): el vendedor a cargo lee «Ya
 * recibiste» y «Debes devolver», porque ese dinero es suyo; el personal lee
 * «Recibido» y «Falta devolver», porque es de la organizacion y quien mira puede
 * no ser quien lo recibio.
 */
export function ReceiverHero({
  raffleId,
  account,
  audience,
}: {
  raffleId: string
  account: ReceiverAccount
  audience: 'staff' | 'head'
}) {
  const hero = SETTLEMENT_COPY.hero
  const staff = audience === 'staff'
  const first = firstName(account.sellerName)
  const rows: Array<{ label: string; amount: number }> = [
    { label: staff ? hero.staffReceived : hero.received, amount: account.delivered },
  ]
  if (account.refunded > 0) {
    rows.push({ label: staff ? hero.staffRefunded : hero.refunded, amount: account.refunded })
  }

  if (account.balance < 0) {
    return (
      <SettlementHeroCard
        status={account.status}
        label={staff ? hero.staffOwedTo(first) : hero.owedTo(first)}
        amount={-account.balance}
        rows={rows}
        notes={[hero.refundByReceiver(first)]}
      />
    )
  }

  const action =
    account.balance > 0 ? (
      <RecordTransferDialog
        raffleId={raffleId}
        sellerId={account.sellerId}
        kind="delivery"
        fromName={account.sellerName}
        balance={account.balance}
        awardsUnpaid={account.awardsUnpaid}
        triggerLabel={hero.register}
        triggerAria={hero.registerAria(first)}
        fullWidth
      />
    ) : account.status === 'to_close' ? (
      <ConfirmCloseButton
        raffleId={raffleId}
        sellerId={account.sellerId}
        sellerName={account.sellerName}
        fingerprint={account.fingerprint}
      />
    ) : undefined

  const notes =
    account.balance > 0
      ? [
          hero.onlyWhatYouHave,
          account.awardsUnpaid > 0 ? hero.missingInfo(account.awardsUnpaid) : '',
        ]
      : account.status === 'closed'
        ? [account.closedAt ? hero.closedOn(formatDateEs(account.closedAt)) : '', hero.closedNote]
        : account.status === 'to_close'
          ? [hero.toCloseHint, hero.closedNote]
          : account.status === 'missing_info'
            ? [hero.missingInfo(account.awardsUnpaid)]
            : [hero.noActivity]

  return (
    <SettlementHeroCard
      status={account.status}
      label={hero.pendingFrom(first)}
      amount={account.balance}
      rows={rows}
      action={action}
      notes={notes}
    />
  )
}
