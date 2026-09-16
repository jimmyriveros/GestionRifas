import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { RaffleStatus } from '@/lib/constants'

import type { PrizeCategory, PrizeReward, PrizeRewardMode } from './copy'
import type { PrizeDigits } from './matching'
import { fromRulePayload, type PrizeRule } from './schedule'

import type { LotteryMatchField } from '@/features/lottery/constants'

/**
 * Lecturas de los premios configurables para RSC (D-199, D-201, D-202).
 *
 * TODO PASA POR RLS. `raffle_prizes`, `raffle_prize_versions`,
 * `raffle_prize_schedule_rules` y `raffle_prize_reward_options` conceden solo
 * `SELECT` a `authenticated`, y su unica politica limita las filas a la
 * organizacion de quien pregunta: aqui no se filtra por organizacion por
 * seguridad, igual que en `raffles/queries.ts`.
 *
 * UNA SOLA CONSULTA POR PANTALLA. El premio, su version vigente, su recompensa
 * y su calendario llegan en una peticion embebida; no hay una consulta por
 * premio ni una por version (seccion 12 del encargo). El HISTORIAL no entra
 * aqui: se pide aparte y solo cuando alguien lo abre.
 */

export type PrizeListItem = {
  id: string
  position: number | null
  status: 'active' | 'archived'
  versionId: string
  versionNumber: number
  title: string
  category: PrizeCategory
  numberField: LotteryMatchField
  digits: PrizeDigits
  conditions: string | null
  reward: PrizeReward
  rules: PrizeRule[]
}

/** Lo que el panel necesita de la rifa, sin recuentos de boletas ni dinero. */
export type PrizeRaffleContext = {
  id: string
  name: string
  shortCode: string
  status: RaffleStatus
  startDate: string
  endDate: string
  prizeMode: 'legacy' | 'configurable'
}

const PRIZE_COLUMNS =
  'id, position, status, ' +
  'current:raffle_prize_versions!raffle_prizes_current_version_fk(' +
  'id, version_number, title, category, number_field, digits, conditions, reward_mode, ' +
  'reward:raffle_prize_reward_options(position, description, amount), ' +
  'rules:raffle_prize_schedule_rules(position, start_date, end_date, weekdays, lottery_mode, lottery_code)' +
  ')'

type PrizeRow = {
  id: string
  position: number | null
  status: 'active' | 'archived'
  current: {
    id: string
    version_number: number
    title: string
    category: PrizeCategory
    number_field: LotteryMatchField
    digits: PrizeDigits
    conditions: string | null
    reward_mode: PrizeRewardMode
    reward: { position: number; description: string | null; amount: number | null }[]
    rules: {
      position: number
      start_date: string
      end_date: string
      weekdays: number[]
      lottery_mode: 'corresponding' | 'fixed'
      lottery_code: string | null
    }[]
  } | null
}

function byPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position)
}

function mapPrize(row: PrizeRow): PrizeListItem | null {
  const version = row.current
  if (!version) return null

  return {
    id: row.id,
    position: row.position,
    status: row.status,
    versionId: version.id,
    versionNumber: version.version_number,
    title: version.title,
    category: version.category,
    numberField: version.number_field,
    digits: version.digits,
    conditions: version.conditions,
    reward: {
      mode: version.reward_mode,
      options: byPosition(version.reward).map((option) => ({
        description: option.description,
        amount: option.amount,
      })),
    },
    rules: fromRulePayload(
      byPosition(version.rules).map((rule) => ({
        start_date: rule.start_date,
        end_date: rule.end_date,
        weekdays: rule.weekdays,
        lottery_mode: rule.lottery_mode,
        lottery_code: rule.lottery_code as PrizeRule['lotteryCode'],
      })),
    ),
  }
}

/**
 * Los premios de una rifa: vigentes primero y en su orden, archivados al final.
 *
 * Un premio archivado no tiene posicion (la libera al archivarse), asi que el
 * orden lo da `position` con los nulos al final y, entre archivados, la fecha
 * de creacion.
 */
export async function listRafflePrizes(raffleId: string): Promise<PrizeListItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('raffle_prizes')
    .select(PRIZE_COLUMNS)
    .eq('raffle_id', raffleId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw error

  return ((data ?? []) as unknown as PrizeRow[])
    .map(mapPrize)
    .filter((prize): prize is PrizeListItem => prize !== null)
}

/** La rifa que se esta configurando. Sin recuentos: el panel no los usa. */
export async function getPrizeRaffleContext(raffleId: string): Promise<PrizeRaffleContext | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('raffles')
    .select('id, name, short_code, status, start_date, end_date, prize_mode')
    .eq('id', raffleId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    shortCode: data.short_code,
    status: data.status,
    startDate: data.start_date,
    endDate: data.end_date,
    prizeMode: data.prize_mode,
  }
}
