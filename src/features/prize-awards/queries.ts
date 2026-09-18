import 'server-only'

import { PAGE_SIZE } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/types/database.types'

import type { PrizeAwardFilters } from './schemas'

/**
 * Las lecturas de «Premios ganados» (D-208, Etapa 2; BR-J17..BR-J23).
 *
 * TODO SALE DE POSTGRESQL, y por eso aquí no se suma nada. Las filas, los cuatro
 * indicadores y la cobertura los calculan las funciones de `0067`–`0069` sobre
 * TODO el filtro; la pantalla presenta y formatea. Un total rehecho con la
 * página visible sería el de veinticinco filas, no el del historial.
 *
 * DOS CONTRATOS, NO UNO CON CAMPOS ESCONDIDOS. El vendedor lee
 * `seller_prize_awards`, que trae su cliente; el personal lee
 * `admin_prize_awards`, cuyo tipo de retorno no declara ni un dato de cliente.
 * Aquí tampoco: `AdminPrizeAward` no tiene un solo campo de cliente, y su mapeo
 * copia columna a columna en vez de esparcir la fila, así que nada que la base
 * añadiera llegaría solo a la pantalla (BR-Q01, BR-Q02).
 *
 * NINGUNA LECTURA RECIBE ORGANIZACIÓN, VENDEDOR NI ACTOR DE LA SESIÓN: salen de
 * la sesión, dentro de la base. El `sellerId` del personal es un FILTRO dentro
 * de su organización, no un alcance.
 *
 * UN FALLO ES UN FALLO. Cada lectura devuelve `{ kind: 'error' }` en vez de una
 * lista vacía o de ceros: la pantalla no puede decir «sin premios» ni «$0»
 * cuando lo que pasó es que no pudo preguntar (el patrón de
 * `features/lottery/queries.ts` y `features/weekly-results/queries.ts`).
 */

type LotteryCode = Database['public']['Enums']['lottery_code']
type MatchField = Database['public']['Enums']['lottery_match_field']
type PrizeCategory = Database['public']['Enums']['raffle_prize_category']
type PrizeDigits = Database['public']['Enums']['raffle_prize_digits']
type RewardMode = Database['public']['Enums']['raffle_prize_reward_mode']

/**
 * De dónde viene el premio: el MOTOR lo escribió con la versión aplicada al
 * sorteo, o el NEGOCIO lo reconoció sobre una coincidencia que el motor no
 * podía premiar (BR-J19).
 */
export type PrizeAwardOrigin = 'engine' | 'declared'

/** Una alternativa de la recompensa, en su posición. Dinero, especie o los dos. */
export type PrizeAwardRewardOption = {
  position: number
  description: string | null
  amount: number | null
}

/**
 * Lo que los dos portales comparten de un premio: el sorteo, la boleta, el
 * premio y su valor. Ni cliente ni vendedor: cada portal añade SU persona.
 *
 * QUÉ RESPALDA CADA DATO (BR-J23): la fotografía, el campo y el número que
 * jugaron; la versión aplicada, título, categoría, cifras y recompensa —solo en
 * el origen del motor—; la declaración, su título y su recompensa, con
 * categoría, cifras y modo en `null` porque a ese sorteo no le aplicó ninguna
 * versión. `dailyNumber` y `weeklyNumber` son los de la boleta HOY.
 */
export type PrizeAwardBase = {
  key: string
  origin: PrizeAwardOrigin
  referenceDate: string
  lotteryCode: LotteryCode
  drawNumber: string
  winningNumber: string | null
  /** El resultado ya no está `confirmed`: el premio se queda y se marca (BR-J18). */
  resultConflict: boolean
  raffleId: string
  raffleName: string
  ticketId: string
  dailyNumber: string | null
  weeklyNumber: string | null
  matchField: MatchField
  matchedNumber: string
  /** El número de la boleta en `matchField` ya no es el fotografiado (BR-J18). */
  numbersChanged: boolean
  prizeTitle: string
  prizeCategory: PrizeCategory | null
  prizeDigits: PrizeDigits | null
  rewardMode: RewardMode | null
  rewardOptions: PrizeAwardRewardOption[]
  /** El dinero CIERTO de este premio, o `null` si no hay ninguno (BR-J20). */
  knownAmount: number | null
  /** Su valor completo no se conoce: alternativas excluyentes o algo en especie. */
  valuePending: boolean
}

/** Un premio del historial del vendedor: con su cliente. */
export type SellerPrizeAward = PrizeAwardBase & {
  clientId: string | null
  clientName: string | null
}

/** Un premio del historial del personal: con su vendedor y SIN cliente. */
export type AdminPrizeAward = PrizeAwardBase & {
  sellerId: string
  sellerName: string | null
}

/** Los cuatro indicadores, sobre TODO el filtro (BR-J20). */
export type PrizeAwardTotals = {
  prizes: number
  clients: number
  knownAmount: number
  valuePending: number
}

export type PrizeAwardPage<T> =
  | {
      kind: 'ready'
      rows: T[]
      /** Premios que cumplen el filtro, no los de esta página. */
      total: number
      page: number
      pageSize: number
      totals: PrizeAwardTotals
    }
  | { kind: 'error' }

export type PrizeAwardTotalsResult = { kind: 'ready'; totals: PrizeAwardTotals } | { kind: 'error' }

/**
 * Lo que la base puede afirmar de la cobertura (`prize_award_coverage`, 0069).
 *
 * Es de la ORGANIZACIÓN, no del filtro de la pantalla: los sorteos son
 * nacionales y las ventanas son de las rifas. Solo cuenta sorteos YA jugados,
 * de rifas que participan y sin cancelar ni suspender, que no tienen resultado
 * confirmado desde el inicio operativo.
 *
 * `covered_from` y `covered_to` NO se leen a propósito: el primer y el último
 * sorteo con resultado no demuestran que todos los de en medio lo tengan, y
 * tener resultado no garantiza que cada premio de entonces esté reconocido.
 * Presentarlos como «cubierto» sería afirmar algo que la consulta no sabe.
 */
export type PrizeAwardCoverage = {
  historyStart: string
  pendingDraws: number
  pendingFrom: string | null
  pendingTo: string | null
}

export type PrizeAwardCoverageResult =
  { kind: 'ready'; coverage: PrizeAwardCoverage } | { kind: 'error' }

// -----------------------------------------------------------------------------
// Mapeo
// -----------------------------------------------------------------------------

type BaseRow = {
  award_key: string
  origin: string
  reference_date: string
  lottery_code: LotteryCode
  draw_number: string
  winning_number: string | null
  result_conflict: boolean
  raffle_id: string
  raffle_name: string
  ticket_id: string
  daily_number: string | null
  weekly_number: string | null
  match_field: MatchField
  matched_number: string
  numbers_changed: boolean
  prize_title: string
  prize_category: PrizeCategory | null
  prize_digits: PrizeDigits | null
  reward_mode: RewardMode | null
  reward_options: Json | null
  known_amount: number | null
  value_pending: boolean
  total_count: number
}

type TotalsRow = {
  prizes_count: number
  clients_count: number
  known_amount: number
  value_pending_count: number
}

/**
 * Las alternativas llegan como un jsonb ordenado armado en la base. Se leen
 * campo a campo: un valor que no tenga la forma esperada se descarta en vez de
 * inventarle un importe.
 */
function mapRewardOptions(value: Json | null): PrizeAwardRewardOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const option = item as Record<string, Json | undefined>
    const amount = option.amount
    const description = option.description
    return [
      {
        position: typeof option.position === 'number' ? option.position : 0,
        description: typeof description === 'string' ? description : null,
        amount: typeof amount === 'number' ? amount : null,
      },
    ]
  })
}

function mapBase(row: BaseRow): PrizeAwardBase {
  return {
    key: row.award_key,
    origin: row.origin === 'declared' ? 'declared' : 'engine',
    referenceDate: row.reference_date,
    lotteryCode: row.lottery_code,
    drawNumber: row.draw_number,
    winningNumber: row.winning_number,
    resultConflict: row.result_conflict,
    raffleId: row.raffle_id,
    raffleName: row.raffle_name,
    ticketId: row.ticket_id,
    dailyNumber: row.daily_number,
    weeklyNumber: row.weekly_number,
    matchField: row.match_field,
    matchedNumber: row.matched_number,
    numbersChanged: row.numbers_changed,
    prizeTitle: row.prize_title,
    prizeCategory: row.prize_category,
    prizeDigits: row.prize_digits,
    rewardMode: row.reward_mode,
    rewardOptions: mapRewardOptions(row.reward_options),
    knownAmount: row.known_amount === null ? null : Number(row.known_amount),
    valuePending: row.value_pending,
  }
}

function mapTotals(rows: TotalsRow[] | null): PrizeAwardTotals | null {
  const row = rows?.[0]
  if (!row) return null
  return {
    prizes: Number(row.prizes_count),
    clients: Number(row.clients_count),
    knownAmount: Number(row.known_amount),
    valuePending: Number(row.value_pending_count),
  }
}

/**
 * El total de la paginación. Con filas, el `total_count` de la misma consulta;
 * sin filas —una página fuera de rango—, el recuento de los indicadores, que es
 * el del mismo filtro. Así una página que no existe no convierte el historial
 * en cero.
 */
function pageTotal(rows: { total_count: number }[], totals: PrizeAwardTotals): number {
  const first = rows[0]
  return first ? Number(first.total_count) : totals.prizes
}

// -----------------------------------------------------------------------------
// El vendedor
// -----------------------------------------------------------------------------

/** El historial del vendedor de la sesión, con sus cuatro indicadores. */
export async function readSellerPrizeAwards(
  filters: PrizeAwardFilters,
): Promise<PrizeAwardPage<SellerPrizeAward>> {
  const pageSize = PAGE_SIZE
  const scope = {
    p_raffle_id: filters.raffleId,
    p_client_id: filters.clientId,
    p_from: filters.dateFrom,
    p_to: filters.dateTo,
  }

  try {
    const supabase = await createClient()
    // La página y los indicadores, a la vez: dos lecturas fijas, ninguna por fila.
    const [list, totals] = await Promise.all([
      supabase.rpc('seller_prize_awards', {
        ...scope,
        p_limit: pageSize,
        p_offset: (filters.page - 1) * pageSize,
      }),
      supabase.rpc('seller_prize_award_totals', scope),
    ])
    if (list.error || totals.error) return { kind: 'error' }

    const summary = mapTotals(totals.data)
    if (!summary) return { kind: 'error' }

    const rows = list.data ?? []
    return {
      kind: 'ready',
      rows: rows.map((row) => ({
        ...mapBase(row),
        clientId: row.client_id,
        clientName: row.client_name,
      })),
      total: pageTotal(rows, summary),
      page: filters.page,
      pageSize,
      totals: summary,
    }
  } catch {
    return { kind: 'error' }
  }
}

/** Los cuatro indicadores de UN cliente, para su ficha. */
export async function readClientPrizeTotals(clientId: string): Promise<PrizeAwardTotalsResult> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('seller_prize_award_totals', {
      p_client_id: clientId,
    })
    if (error) return { kind: 'error' }
    const totals = mapTotals(data)
    return totals ? { kind: 'ready', totals } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

// -----------------------------------------------------------------------------
// El personal
// -----------------------------------------------------------------------------

/** El historial de la organización, sin un solo dato de cliente. */
export async function readAdminPrizeAwards(
  filters: PrizeAwardFilters,
): Promise<PrizeAwardPage<AdminPrizeAward>> {
  const pageSize = PAGE_SIZE
  const scope = {
    p_raffle_id: filters.raffleId,
    p_seller_id: filters.sellerId,
    p_from: filters.dateFrom,
    p_to: filters.dateTo,
  }

  try {
    const supabase = await createClient()
    const [list, totals] = await Promise.all([
      supabase.rpc('admin_prize_awards', {
        ...scope,
        p_limit: pageSize,
        p_offset: (filters.page - 1) * pageSize,
      }),
      supabase.rpc('admin_prize_award_totals', scope),
    ])
    if (list.error || totals.error) return { kind: 'error' }

    const summary = mapTotals(totals.data)
    if (!summary) return { kind: 'error' }

    const rows = list.data ?? []
    return {
      kind: 'ready',
      rows: rows.map((row) => ({
        ...mapBase(row),
        sellerId: row.seller_id,
        sellerName: row.seller_name,
      })),
      total: pageTotal(rows, summary),
      page: filters.page,
      pageSize,
      totals: summary,
    }
  } catch {
    return { kind: 'error' }
  }
}

/** Los cuatro indicadores de UN vendedor —también inactivo—, para su ficha. */
export async function readAdminSellerPrizeTotals(
  sellerId: string,
): Promise<PrizeAwardTotalsResult> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('admin_prize_award_totals', {
      p_seller_id: sellerId,
    })
    if (error) return { kind: 'error' }
    const totals = mapTotals(data)
    return totals ? { kind: 'ready', totals } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

// -----------------------------------------------------------------------------
// La cobertura, para los dos portales
// -----------------------------------------------------------------------------

export async function readPrizeAwardCoverage(): Promise<PrizeAwardCoverageResult> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('prize_award_coverage')
    if (error) return { kind: 'error' }
    const row = data?.[0]
    if (!row) return { kind: 'error' }
    return {
      kind: 'ready',
      coverage: {
        historyStart: row.history_start,
        pendingDraws: Number(row.pending_draws),
        pendingFrom: row.pending_from,
        pendingTo: row.pending_to,
      },
    }
  } catch {
    return { kind: 'error' }
  }
}
