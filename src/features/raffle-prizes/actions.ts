'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult, ActionResultWith } from '@/lib/action-result'
import { authorizeCapability } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

import { PRIZE_COPY, type PrizeCategory, type PrizeReward, type PrizeRewardMode } from './copy'
import type { PrizeDigits } from './matching'
import { fromRulePayload, type PrizeRule, type PrizeRulePayload } from './schedule'
import {
  createPrizeSchema,
  prizeHistorySchema,
  prizeVersionTargetSchema,
  publishPrizeVersionSchema,
  reorderPrizesSchema,
  toCreatePrizeArgs,
  toPublishPrizeArgs,
  PRIZE_LIMITS,
} from './schemas'

import type { LotteryMatchField } from '@/features/lottery/constants'

/**
 * Las escrituras de los premios configurables (BR-J01..BR-J15, D-199..D-202).
 *
 * TODAS AUTORIZAN POR CAPACIDAD, no por rol: `authorizeCapability` es la
 * primera linea y `has_org_capability` dentro de cada RPC es la que manda
 * (D-200). Ninguna accion recibe organizacion, actor ni rol: la RPC los saca de
 * la rifa y de la sesion.
 *
 * POR QUE RPC Y NO `insert`/`update`. Las cuatro tablas conceden **solo
 * `SELECT`** a `authenticated` y no tienen ninguna politica de escritura: un
 * `insert` directo devuelve `42501`. Es deliberado —las seis RPC son la unica
 * puerta, asi que la version nueva, el tope, la bitacora y el aviso no se
 * pueden esquivar— y por eso estas acciones no tienen alternativa.
 *
 * LOS AVISOS Y LA BITACORA LOS ESCRIBE LA BASE (BR-J11, BR-J12). Aqui no se
 * duplica ninguno de los dos.
 */

/**
 * Las tres pantallas que leen premios. Se revalidan por PATRON de ruta y no por
 * camino literal porque `publish`, `archive` y `restore` solo reciben el premio:
 * pedirles ademas la rifa seria un dato de la peticion que nadie comprueba.
 */
function revalidatePrizes() {
  revalidatePath('/owner/raffles/[raffleId]/prizes', 'page')
  revalidatePath('/owner/raffles/[raffleId]/review', 'page')
  revalidatePath('/owner/raffles/[raffleId]', 'page')
  revalidatePath('/owner/raffles')
}

export async function createPrize(input: unknown): Promise<ActionResult> {
  const auth = await authorizeCapability('raffles.prizes.manage')
  if ('error' in auth) return auth

  const parsed = createPrizeSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? PRIZE_COPY.form.invalid }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_raffle_prize', toCreatePrizeArgs(parsed.data))
  if (error) return { error: mapPgError(error) }

  revalidatePrizes()
  return { ok: true }
}

/**
 * CONTROL OPTIMISTA (BR-J09): quien publica manda la version que estaba
 * viendo. Si ya no es la vigente, la RPC rechaza con una frase que dice que
 * hacer, y la pantalla recarga en vez de sobrescribir.
 */
export async function publishPrizeVersion(
  input: unknown,
): Promise<ActionResultWith<{ versionNumber: number }>> {
  const auth = await authorizeCapability('raffles.prizes.manage')
  if ('error' in auth) return auth

  const parsed = publishPrizeVersionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? PRIZE_COPY.form.invalid }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'publish_raffle_prize_version',
    toPublishPrizeArgs(parsed.data),
  )
  if (error) return { error: mapPgError(error) }

  revalidatePrizes()
  // Un guardado que no cambia nada devuelve la version VIGENTE: la pantalla lo
  // compara con la que estaba viendo para no decir que guardo algo que no paso.
  const rows = (data ?? []) as unknown as { version_number: number }[]
  return { ok: true, data: { versionNumber: Number(rows[0]?.version_number ?? 0) } }
}

export async function archivePrize(input: unknown): Promise<ActionResult> {
  const auth = await authorizeCapability('raffles.prizes.manage')
  if ('error' in auth) return auth

  const parsed = prizeVersionTargetSchema.safeParse(input)
  if (!parsed.success) return { error: PRIZE_COPY.form.prizeRequired }

  const supabase = await createClient()
  const { error } = await supabase.rpc('archive_raffle_prize', {
    p_prize_id: parsed.data.prizeId,
    p_expected_version_id: parsed.data.expectedVersionId,
  })
  if (error) return { error: mapPgError(error) }

  revalidatePrizes()
  return { ok: true }
}

export async function restorePrize(input: unknown): Promise<ActionResult> {
  const auth = await authorizeCapability('raffles.prizes.manage')
  if ('error' in auth) return auth

  const parsed = prizeVersionTargetSchema.safeParse(input)
  if (!parsed.success) return { error: PRIZE_COPY.form.prizeRequired }

  const supabase = await createClient()
  const { error } = await supabase.rpc('restore_raffle_prize', {
    p_prize_id: parsed.data.prizeId,
    p_expected_version_id: parsed.data.expectedVersionId,
  })
  if (error) return { error: mapPgError(error) }

  revalidatePrizes()
  return { ok: true }
}

/**
 * Reordenar manda la lista COMPLETA de premios vigentes, no un movimiento: es
 * lo que espera la RPC y lo que hace que «Subir» y «Bajar» sean idempotentes
 * (el mismo patron que las cuentas de cobro, D-188).
 */
export async function reorderPrizes(input: unknown): Promise<ActionResult> {
  const auth = await authorizeCapability('raffles.prizes.manage')
  if ('error' in auth) return auth

  const parsed = reorderPrizesSchema.safeParse(input)
  if (!parsed.success) return { error: PRIZE_COPY.form.orderInvalid }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_raffle_prizes', {
    p_raffle_id: parsed.data.raffleId,
    p_prize_ids: parsed.data.prizeIds,
  })
  if (error) return { error: mapPgError(error) }

  revalidatePrizes()
  return { ok: true }
}

/** Una version del historial de un premio (BR-J12). */
export type PrizeHistoryEntry = {
  versionId: string
  versionNumber: number
  change: 'created' | 'updated' | 'archived' | 'restored'
  status: 'active' | 'archived'
  title: string
  category: PrizeCategory
  numberField: LotteryMatchField
  digits: PrizeDigits
  conditions: string | null
  reward: PrizeReward
  rules: PrizeRule[]
  startsOn: string | null
  endsOn: string | null
  publishedAt: string
  publishedByName: string | null
}

export type PrizeHistoryPage = {
  entries: PrizeHistoryEntry[]
  total: number
  page: number
  pageSize: number
}

type HistoryRow = {
  version_id: string
  version_number: number
  change: string
  status: 'active' | 'archived'
  title: string
  category: PrizeCategory
  reward_mode: PrizeRewardMode
  reward_options: { description: string | null; amount: number | null }[]
  number_field: LotteryMatchField
  digits: PrizeDigits
  conditions: string | null
  rules: PrizeRulePayload[]
  starts_on: string | null
  ends_on: string | null
  published_at: string
  published_by_name: string | null
  total_count: number
}

/**
 * El historial, BAJO DEMANDA (seccion 9 y 12 del encargo): no viaja con el
 * listado, se pide cuando alguien lo abre y llega paginado.
 *
 * Es una lectura, pero entra por una Server Action porque la pide un componente
 * de cliente. Autoriza igual que las escrituras —una Server Action es un POST
 * alcanzable directamente— y ademas la RPC devuelve **cero filas** a quien no
 * tenga la capacidad.
 */
export async function fetchPrizeHistory(
  input: unknown,
): Promise<ActionResultWith<PrizeHistoryPage>> {
  const auth = await authorizeCapability('raffles.prizes.manage')
  if ('error' in auth) return auth

  const parsed = prizeHistorySchema.safeParse(input)
  if (!parsed.success) return { error: PRIZE_COPY.form.prizeRequired }

  const { prizeId, page } = parsed.data
  const pageSize = PRIZE_LIMITS.historyPageSize

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('raffle_prize_history', {
    p_prize_id: prizeId,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  })
  if (error) return { error: mapPgError(error) }

  const rows = (data ?? []) as unknown as HistoryRow[]

  return {
    ok: true,
    data: {
      entries: rows.map((row) => ({
        versionId: row.version_id,
        versionNumber: row.version_number,
        change: row.change as PrizeHistoryEntry['change'],
        status: row.status,
        title: row.title,
        category: row.category,
        numberField: row.number_field,
        digits: row.digits,
        conditions: row.conditions,
        reward: { mode: row.reward_mode, options: row.reward_options ?? [] },
        rules: fromRulePayload(row.rules ?? []),
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        publishedAt: row.published_at,
        publishedByName: row.published_by_name,
      })),
      total: Number(rows[0]?.total_count ?? 0),
      page,
      pageSize,
    },
  }
}
