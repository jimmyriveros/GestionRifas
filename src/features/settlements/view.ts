import { formatDateEs } from '@/lib/dates'

import { SETTLEMENT_COPY, firstName } from './copy'
import type {
  SellerSettlementAccount,
  SettlementPrizeBase,
  SettlementTeamRow,
  StaffSettlementAccount,
  StaffSettlementPrize,
} from './queries'

/**
 * Lo que las pantallas del cierre deciden SIN tocar dinero: que frase va en
 * cada fila, que pagadores se ofrecen y que avisos se ven (D-241).
 *
 * PURO Y SIN `server-only`: lo prueban las unitarias. Ninguna funcion suma una
 * cifra de la cuenta; cuando una frase lleva un importe, es uno que ya llego de
 * la base.
 */

// -----------------------------------------------------------------------------
// Premios
// -----------------------------------------------------------------------------

/** Quien pudo pagar el premio, como opcion: `organization` o el perfil de un vendedor. */
export type PrizePayerOption = {
  value: 'organization' | string
  label: string
  /** Lo que pasa con las cuentas si lo pago esta persona. */
  effect: string
}

/** «Premio diario · Boleta 1234 / 5678». */
export function prizeLabel(prize: SettlementPrizeBase, withTicket = true): string {
  const title = prize.prizeTitle ?? 'Premio'
  return withTicket
    ? `${title} · ${SETTLEMENT_COPY.prizes.ticket(prize.dailyNumber, prize.weeklyNumber)}`
    : title
}

/** «Sorteo: 20 sept 2026 · Ana pagó el 21 sept 2026». */
export function prizeDrawLine(prize: SettlementPrizeBase, viewerId?: string): string {
  const copy = SETTLEMENT_COPY.prizes
  const parts = [copy.draw(prize.referenceDate ? formatDateEs(prize.referenceDate) : '—')]
  if (prize.paymentId && prize.paidOn) {
    const date = formatDateEs(prize.paidOn)
    if (prize.payer === 'organization') parts.push(copy.paidByOwner(date))
    else if (prize.payerId && prize.payerId === viewerId) parts.push(copy.paidByYouOn(date))
    else parts.push(copy.paidBy(firstName(prize.payerName ?? 'Vendedor'), date))
  }
  return parts.join(' · ')
}

export type PrizeState = 'discounted' | 'owner' | 'other' | 'unpaid' | 'conflict' | 'missing'

/** En que situacion esta un premio respecto de una cuenta. */
export function prizeState(prize: SettlementPrizeBase, payerInAccount: boolean): PrizeState {
  if (prize.awardMissing) return 'missing'
  if (!prize.paymentId) return prize.resultConflict ? 'conflict' : 'unpaid'
  if (prize.payer === 'organization') return 'owner'
  return payerInAccount ? 'discounted' : 'other'
}

export function prizeStateLabel(state: PrizeState, audience: 'staff' | 'seller'): string {
  const copy = SETTLEMENT_COPY.prizes
  switch (state) {
    case 'discounted':
      return audience === 'staff' ? copy.discounted : copy.discountedFromYou
    case 'owner':
      return copy.ownerPaid
    case 'other':
      return copy.otherTeam
    case 'conflict':
      return copy.conflict
    case 'missing':
      return copy.missingAward
    case 'unpaid':
      return copy.unpaid
  }
}

/** El importe de una fila: lo pagado, el valor conocido, o nada si aun no se sabe. */
export function prizeAmount(prize: SettlementPrizeBase): number | null {
  if (prize.amount !== null) return prize.amount
  if (!prize.valuePending && prize.knownAmount !== null) return prize.knownAmount
  return null
}

/** «3 premios · $450.000»: lo PAGADO de esos premios, nunca un valor por confirmar. */
export function prizesSummary(prizes: SettlementPrizeBase[]): { count: number; paid: number } {
  return {
    count: prizes.length,
    paid: prizes.reduce((sum, prize) => sum + (prize.paymentId ? (prize.amount ?? 0) : 0), 0),
  }
}

/**
 * Los pagadores que el PERSONAL puede registrar para un premio de una cuenta
 * con el dueño (BR-Z07): el vendedor directo cuando la boleta es suya, el
 * vendedor a cargo cuando es de un integrante, y el dueño. Lo que pago un
 * integrante lo registra su vendedor a cargo, no el personal.
 */
export function staffPrizePayers(
  prize: StaffSettlementPrize,
  account: Pick<StaffSettlementAccount, 'sellerId' | 'sellerName'>,
): PrizePayerOption[] {
  const effect = SETTLEMENT_COPY.prizeDialog.effect
  const holder = firstName(account.sellerName)
  const options: PrizePayerOption[] = []
  if (prize.ticketSellerId === account.sellerId) {
    options.push({
      value: account.sellerId,
      label: account.sellerName,
      effect: effect.ticketSeller(holder),
    })
  } else if (prize.parentId === account.sellerId) {
    options.push({
      value: account.sellerId,
      label: account.sellerName,
      effect: effect.head(holder, firstName(prize.ticketSellerName)),
    })
  }
  options.push({
    value: 'organization',
    label: SETTLEMENT_COPY.prizeDialog.ownerOption,
    effect: effect.owner,
  })
  return options
}

/** El unico pagador que un vendedor a cargo registra: su integrante (BR-Z07). */
export function headPrizePayers(prize: SettlementPrizeBase): PrizePayerOption[] {
  return [
    {
      value: prize.ticketSellerId,
      label: prize.ticketSellerName,
      effect: SETTLEMENT_COPY.prizeDialog.effect.ticketSellerMember(
        firstName(prize.ticketSellerName),
      ),
    },
  ]
}

/**
 * Si el personal puede anular el pago de un premio de esta cuenta: el mismo que
 * podria registrarlo hoy (BR-Z14). Lo del integrante es de su vendedor a cargo.
 */
export function staffCanVoidPrize(prize: StaffSettlementPrize, holderId: string): boolean {
  if (!prize.paymentId) return false
  if (prize.payer === 'organization') return true
  if (prize.payerId === holderId && prize.ticketSellerId === holderId) return true
  return prize.payerId === holderId && prize.parentId === holderId
}

/** Si un vendedor a cargo puede anular el pago: el de su integrante, registrado por el. */
export function headCanVoidPrize(prize: SettlementPrizeBase, memberId: string): boolean {
  return (
    Boolean(prize.paymentId) &&
    prize.payer === 'seller' &&
    prize.payerId === memberId &&
    prize.ticketSellerId === memberId
  )
}

// -----------------------------------------------------------------------------
// Equipo
// -----------------------------------------------------------------------------

/**
 * «Los $500.000 pendientes de Ana ya están incluidos en tu entrega al dueño»:
 * lo que el equipo todavia no le entrego al vendedor a cargo. Es la suma de sus
 * saldos POSITIVOS, que ya vienen de la base.
 */
export function teamPendingNotice(rows: SettlementTeamRow[]): string | null {
  const pending = rows.filter((row) => row.balance > 0)
  if (pending.length === 0) return null
  const total = pending.reduce((sum, row) => sum + row.balance, 0)
  return SETTLEMENT_COPY.team.pendingIncluded(
    total,
    pending.length === 1 ? firstName(pending[0]!.memberName) : null,
  )
}

// -----------------------------------------------------------------------------
// La ganancia del vendedor, en palabras
// -----------------------------------------------------------------------------

/**
 * La linea bajo «Tu ganancia». Con equipo, cuanto sale de sus ventas y cuanto de
 * las del equipo. Sin equipo, la tarifa por boleta —y si la ganancia no es
 * `pagadas × tarifa`, es que hubo rebajas, y se dice—.
 */
export function earningsHint(account: SellerSettlementAccount): string | undefined {
  const copy = SETTLEMENT_COPY.sellerCalc
  if (account.counterpartId === null && account.members > 0) {
    return copy.yourEarningsSplit(account.holderEarned, account.holderTeamEarned)
  }
  if (account.holderRate <= 0 || account.ownTicketsPaid === 0) return undefined
  return account.holderEarned === account.ownTicketsPaid * account.holderRate
    ? copy.perTicket(account.holderRate)
    : copy.perTicketWithDiscounts(account.holderRate)
}
