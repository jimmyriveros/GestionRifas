import 'server-only'

import { PAGE_SIZE, type AppRole, type SettlementAccountStatus } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/types/database.types'

import type { SettlementListFilters } from './schemas'

/**
 * Las lecturas del cierre de cuentas (D-241).
 *
 * TODO SALE DE POSTGRESQL. El saldo, el estado, el cierre vigente y cada cifra
 * del calculo los devuelven las funciones de la `0080`; aqui se copian columna a
 * columna y no se suma nada. Un total rehecho en TypeScript seria otra
 * definicion de la cuenta, y la unica es `settlement_account_rows` (BR-Z01).
 *
 * DOS CONTRATOS. El personal lee `staff_settlement_*`, cuyo tipo de retorno no
 * declara ni un dato de cliente ni de abonos; el vendedor lee
 * `seller_settlement_*`, que trae el nombre del cliente SOLO en sus propias
 * boletas y lo abonado sin pagar SOLO en su propia cuenta (BR-Z03, BR-Z13). Los
 * tipos de abajo lo repiten: `StaffSettlementPrize` no tiene campo de cliente.
 *
 * NINGUNA LECTURA RECIBE ORGANIZACION NI ACTOR: salen de la sesion, dentro de la
 * base. `sellerId` y `memberId` son el titular de la cuenta que se mira, y la
 * base decide si quien llama puede mirarla.
 *
 * UN FALLO ES UN FALLO: cada lectura devuelve `{ kind: 'error' }`, nunca una
 * lista vacia ni ceros (el patron de `features/prize-awards/queries.ts`).
 */

type TransferKind = Database['public']['Enums']['settlement_transfer_kind']
type PrizePayer = Database['public']['Enums']['settlement_prize_payer']
type LotteryCode = Database['public']['Enums']['lottery_code']

export type SettlementFigures = Record<string, number>

/** Las cifras que comparten las dos vistas de una cuenta. */
export type SettlementAccountBase = {
  sellerId: string
  sellerName: string
  members: number
  ticketsActive: number
  ticketsSold: number
  ticketsPaid: number
  ownTicketsPaid: number
  teamTicketsPaid: number
  collected: number
  holderEarned: number
  holderTeamEarned: number
  membersEarned: number
  ownerShare: number
  prizesPaid: number
  otherMovements: number
  totalDue: number
  delivered: number
  refunded: number
  balance: number
  awards: number
  awardsUnpaid: number
  paymentsOrphaned: number
  status: SettlementAccountStatus
  fingerprint: string
  /** Las cifras de hoy, con las mismas claves que guarda un cierre: la base las arma. */
  figures: SettlementFigures
  closingVersion: number | null
  closingFigures: SettlementFigures | null
  closedAt: string | null
  closedByName: string | null
  changedAfterClose: boolean
}

/** Una cuenta con el dueño, como la ve el personal. Sin cliente y sin abonos. */
export type StaffSettlementAccount = SettlementAccountBase & {
  sellerRole: AppRole
  sellerActive: boolean
  awardsBlocked: number
  prizeCost: number
  prizeCostOrg: number
  ownerGain: number | null
}

/** Una cuenta vista por su vendedor, o por su vendedor a cargo. */
export type SellerSettlementAccount = SettlementAccountBase & {
  counterpartId: string | null
  counterpartName: string | null
  ownTicketsSold: number
  /** Lo abonado a boletas sin pagar: solo en la cuenta PROPIA (BR-Z03). */
  partialPaid: number | null
  holderRate: number
}

/** Una fila del listado del personal. */
export type StaffSettlementListRow = {
  sellerId: string
  sellerName: string
  sellerRole: AppRole
  sellerActive: boolean
  members: number
  ticketsSold: number
  ticketsPaid: number
  delivered: number
  balance: number
  status: SettlementAccountStatus
  changedAfterClose: boolean
}

export type StaffSettlementOverview = {
  accounts: number
  closedAccounts: number
  pendingAccounts: number
  pendingTotal: number
  inFavorAccounts: number
  inFavorTotal: number
  missingInfoAccounts: number
  changedAccounts: number
  receivedTotal: number
  refundedTotal: number
}

/** Un premio de una cuenta. Lo comun a los dos portales: ni cliente ni vendedor ajeno. */
export type SettlementPrizeBase = {
  matchId: string
  prizeId: string
  awardMissing: boolean
  referenceDate: string | null
  lotteryCode: LotteryCode | null
  drawNumber: string | null
  dailyNumber: string | null
  weeklyNumber: string | null
  ticketSellerId: string
  ticketSellerName: string
  prizeTitle: string | null
  knownAmount: number | null
  valuePending: boolean
  resultConflict: boolean
  numbersChanged: boolean
  paymentId: string | null
  payer: PrizePayer | null
  payerId: string | null
  payerName: string | null
  amount: number | null
  valueWasPending: boolean | null
  paidOn: string | null
  confirmedByName: string | null
  canRecord: boolean
}

export type StaffSettlementPrize = SettlementPrizeBase & {
  inAccount: boolean
  payerInAccount: boolean
  /** El vendedor a cargo de quien vendio la boleta, cuando la vendio un integrante. */
  parentId: string | null
  parentName: string | null
}

export type SellerSettlementPrize = SettlementPrizeBase & {
  ownTicket: boolean
  /** Solo en las boletas del propio vendedor (BR-Z13). */
  clientName: string | null
}

export type SettlementTransfer = {
  id: string
  kind: TransferKind
  sellerId: string
  sellerName: string
  counterpartId: string | null
  counterpartName: string | null
  amount: number
  receivedOn: string
  confirmedByName: string
  voidedAt: string | null
  voidedByName: string | null
  voidReason: string | null
  canVoid: boolean
}

export type SettlementTeamRow = {
  memberId: string
  memberName: string
  memberActive: boolean
  ticketsSold: number
  ticketsPaid: number
  totalDue: number
  delivered: number
  refunded: number
  balance: number
  awardsUnpaid: number
  status: SettlementAccountStatus
  changedAfterClose: boolean
}

export type Loaded<T> = { kind: 'ready'; value: T } | { kind: 'error' }

const n = (value: number | string | null | undefined): number => Number(value ?? 0)
const nn = (value: number | string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value)

function figures(value: Json | null): SettlementFigures | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const out: SettlementFigures = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' || typeof raw === 'string') out[key] = Number(raw)
  }
  return out
}

type BaseRow = {
  seller_id: string
  seller_name: string
  members: number
  tickets_active: number
  tickets_sold: number
  tickets_paid: number
  own_tickets_paid: number
  team_tickets_paid: number
  collected: number
  holder_earned: number
  holder_team_earned: number
  members_earned: number
  owner_share: number
  prizes_paid: number
  other_movements: number
  total_due: number
  delivered: number
  refunded: number
  balance: number
  awards: number
  awards_unpaid: number
  payments_orphaned: number
  status: SettlementAccountStatus
  fingerprint: string
  figures: Json
  closing_version: number | null
  closing_figures: Json | null
  closed_at: string | null
  closed_by_name: string | null
  changed_after_close: boolean
}

function baseAccount(row: BaseRow): SettlementAccountBase {
  return {
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    members: n(row.members),
    ticketsActive: n(row.tickets_active),
    ticketsSold: n(row.tickets_sold),
    ticketsPaid: n(row.tickets_paid),
    ownTicketsPaid: n(row.own_tickets_paid),
    teamTicketsPaid: n(row.team_tickets_paid),
    collected: n(row.collected),
    holderEarned: n(row.holder_earned),
    holderTeamEarned: n(row.holder_team_earned),
    membersEarned: n(row.members_earned),
    ownerShare: n(row.owner_share),
    prizesPaid: n(row.prizes_paid),
    otherMovements: n(row.other_movements),
    totalDue: n(row.total_due),
    delivered: n(row.delivered),
    refunded: n(row.refunded),
    balance: n(row.balance),
    awards: n(row.awards),
    awardsUnpaid: n(row.awards_unpaid),
    paymentsOrphaned: n(row.payments_orphaned),
    status: row.status,
    fingerprint: row.fingerprint,
    figures: figures(row.figures) ?? {},
    closingVersion: nn(row.closing_version),
    closingFigures: figures(row.closing_figures),
    closedAt: row.closed_at,
    closedByName: row.closed_by_name,
    changedAfterClose: row.changed_after_close,
  }
}

type PrizeBaseRow = {
  match_id: string
  prize_id: string
  award_missing: boolean
  reference_date: string | null
  lottery_code: LotteryCode | null
  draw_number: string | null
  daily_number: string | null
  weekly_number: string | null
  ticket_seller_id: string
  ticket_seller_name: string
  prize_title: string | null
  known_amount: number | null
  value_pending: boolean
  result_conflict: boolean
  numbers_changed: boolean
  payment_id: string | null
  payer: PrizePayer | null
  payer_id: string | null
  payer_name: string | null
  amount: number | null
  value_was_pending: boolean | null
  paid_on: string | null
  confirmed_by_name: string | null
  can_record: boolean
}

function basePrize(row: PrizeBaseRow): SettlementPrizeBase {
  return {
    matchId: row.match_id,
    prizeId: row.prize_id,
    awardMissing: row.award_missing,
    referenceDate: row.reference_date,
    lotteryCode: row.lottery_code,
    drawNumber: row.draw_number,
    dailyNumber: row.daily_number,
    weeklyNumber: row.weekly_number,
    ticketSellerId: row.ticket_seller_id,
    ticketSellerName: row.ticket_seller_name,
    prizeTitle: row.prize_title,
    knownAmount: nn(row.known_amount),
    valuePending: row.value_pending,
    resultConflict: row.result_conflict,
    numbersChanged: row.numbers_changed,
    paymentId: row.payment_id,
    payer: row.payer,
    payerId: row.payer_id,
    payerName: row.payer_name,
    amount: nn(row.amount),
    valueWasPending: row.value_was_pending,
    paidOn: row.paid_on,
    confirmedByName: row.confirmed_by_name,
    canRecord: row.can_record,
  }
}

// -----------------------------------------------------------------------------
// Personal
// -----------------------------------------------------------------------------

export async function readStaffSettlementOverview(
  raffleId: string,
): Promise<Loaded<StaffSettlementOverview | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('staff_settlement_overview', { p_raffle_id: raffleId })
  if (error) return { kind: 'error' }
  const row = data?.[0]
  if (!row) return { kind: 'ready', value: null }
  return {
    kind: 'ready',
    value: {
      accounts: n(row.accounts),
      closedAccounts: n(row.closed_accounts),
      pendingAccounts: n(row.pending_accounts),
      pendingTotal: n(row.pending_total),
      inFavorAccounts: n(row.in_favor_accounts),
      inFavorTotal: n(row.in_favor_total),
      missingInfoAccounts: n(row.missing_info_accounts),
      changedAccounts: n(row.changed_accounts),
      receivedTotal: n(row.received_total),
      refundedTotal: n(row.refunded_total),
    },
  }
}

export async function readStaffSettlementAccounts(
  raffleId: string,
  filters: SettlementListFilters,
): Promise<
  Loaded<{ rows: StaffSettlementListRow[]; total: number; page: number; pageSize: number }>
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('staff_settlement_accounts', {
    p_raffle_id: raffleId,
    p_search: filters.search ?? undefined,
    p_status: filters.status === 'all' ? undefined : filters.status,
    p_limit: PAGE_SIZE,
    p_offset: (filters.page - 1) * PAGE_SIZE,
  })
  if (error) return { kind: 'error' }
  const rows = (data ?? []).map((row) => ({
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    sellerRole: row.seller_role,
    sellerActive: row.seller_active,
    members: n(row.members),
    ticketsSold: n(row.tickets_sold),
    ticketsPaid: n(row.tickets_paid),
    delivered: n(row.delivered),
    balance: n(row.balance),
    status: row.status,
    changedAfterClose: row.changed_after_close,
  }))
  return {
    kind: 'ready',
    value: { rows, total: n(data?.[0]?.total_count), page: filters.page, pageSize: PAGE_SIZE },
  }
}

export async function readStaffSettlementAccount(
  raffleId: string,
  sellerId: string,
): Promise<Loaded<StaffSettlementAccount | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('staff_settlement_account', {
    p_raffle_id: raffleId,
    p_seller_id: sellerId,
  })
  if (error) return { kind: 'error' }
  const row = data?.[0]
  if (!row) return { kind: 'ready', value: null }
  return {
    kind: 'ready',
    value: {
      ...baseAccount(row),
      sellerRole: row.seller_role,
      sellerActive: row.seller_active,
      awardsBlocked: n(row.awards_blocked),
      prizeCost: n(row.prize_cost),
      prizeCostOrg: n(row.prize_cost_org),
      ownerGain: nn(row.owner_gain),
    },
  }
}

export async function readStaffSettlementPrizes(
  raffleId: string,
  sellerId: string,
): Promise<Loaded<StaffSettlementPrize[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('staff_settlement_prizes', {
    p_raffle_id: raffleId,
    p_seller_id: sellerId,
  })
  if (error) return { kind: 'error' }
  return {
    kind: 'ready',
    value: (data ?? []).map((row) => ({
      ...basePrize(row),
      inAccount: row.in_account,
      payerInAccount: row.payer_in_account,
      parentId: row.parent_id,
      parentName: row.parent_name,
    })),
  }
}

export async function readStaffSettlementTransfers(
  raffleId: string,
  sellerId: string,
): Promise<Loaded<SettlementTransfer[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('staff_settlement_transfers', {
    p_raffle_id: raffleId,
    p_seller_id: sellerId,
  })
  if (error) return { kind: 'error' }
  return {
    kind: 'ready',
    value: (data ?? []).map((row) => ({
      id: row.transfer_id,
      kind: row.kind,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      counterpartId: null,
      counterpartName: null,
      amount: n(row.amount),
      receivedOn: row.received_on,
      confirmedByName: row.confirmed_by_name,
      voidedAt: row.voided_at,
      voidedByName: row.voided_by_name,
      voidReason: row.void_reason,
      // Lo que recibio el dueño lo anula el personal; una devolucion, quien la recibio.
      canVoid: row.voided_at === null && row.kind === 'delivery',
    })),
  }
}

// -----------------------------------------------------------------------------
// Vendedor
// -----------------------------------------------------------------------------

export async function readSellerSettlementAccount(
  raffleId: string,
  memberId?: string,
): Promise<Loaded<SellerSettlementAccount | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('seller_settlement_account', {
    p_raffle_id: raffleId,
    p_member_id: memberId,
  })
  if (error) return { kind: 'error' }
  const row = data?.[0]
  if (!row) return { kind: 'ready', value: null }
  return {
    kind: 'ready',
    value: {
      ...baseAccount(row),
      counterpartId: row.counterpart_id,
      counterpartName: row.counterpart_name,
      ownTicketsSold: n(row.own_tickets_sold),
      partialPaid: nn(row.partial_paid),
      holderRate: n(row.holder_rate),
    },
  }
}

export async function readSellerSettlementTeam(
  raffleId: string,
): Promise<Loaded<SettlementTeamRow[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('seller_settlement_team', { p_raffle_id: raffleId })
  if (error) return { kind: 'error' }
  return {
    kind: 'ready',
    value: (data ?? []).map((row) => ({
      memberId: row.member_id,
      memberName: row.member_name,
      memberActive: row.member_active,
      ticketsSold: n(row.tickets_sold),
      ticketsPaid: n(row.tickets_paid),
      totalDue: n(row.total_due),
      delivered: n(row.delivered),
      refunded: n(row.refunded),
      balance: n(row.balance),
      awardsUnpaid: n(row.awards_unpaid),
      status: row.status,
      changedAfterClose: row.changed_after_close,
    })),
  }
}

export async function readSellerSettlementPrizes(
  raffleId: string,
  memberId?: string,
): Promise<Loaded<SellerSettlementPrize[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('seller_settlement_prizes', {
    p_raffle_id: raffleId,
    p_member_id: memberId,
  })
  if (error) return { kind: 'error' }
  return {
    kind: 'ready',
    value: (data ?? []).map((row) => ({
      ...basePrize(row),
      ownTicket: row.own_ticket,
      clientName: row.client_name,
    })),
  }
}

export async function readSellerSettlementTransfers(
  raffleId: string,
  memberId?: string,
): Promise<Loaded<SettlementTransfer[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('seller_settlement_transfers', {
    p_raffle_id: raffleId,
    p_member_id: memberId,
  })
  if (error) return { kind: 'error' }
  return {
    kind: 'ready',
    value: (data ?? []).map((row) => ({
      id: row.transfer_id,
      kind: row.kind,
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      counterpartId: row.counterpart_id,
      counterpartName: row.counterpart_name,
      amount: n(row.amount),
      receivedOn: row.received_on,
      confirmedByName: row.confirmed_by_name,
      voidedAt: row.voided_at,
      voidedByName: row.voided_by_name,
      voidReason: row.void_reason,
      canVoid: row.can_void,
    })),
  }
}
