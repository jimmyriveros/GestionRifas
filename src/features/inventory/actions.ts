'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResultWith } from '@/lib/action-result'
import { authorizeAction, authorizeCapability } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { numberFormatFromRow, RAFFLE_NUMBER_FORMAT_COLUMNS } from '@/lib/ticket-number-format'
import { createClient } from '@/lib/supabase/server'

import { INVENTORY_COPY } from './copy'
import {
  assignInventorySchema,
  generationChunkSchema,
  generationRangesProblem,
  generationPreviewSchema,
  generationStartSchema,
  holdIdSchema,
  holdSettingsSchema,
  recoverInventorySchema,
  takeHoldSchema,
} from './schemas'

/**
 * Escrituras del inventario comun (D-257).
 *
 * El orden de siempre: autorizar -> Zod -> RPC -> traducir el error -> revalidar
 * -> `{ ok } | { error }`. Quien decide de verdad son las funciones de la 0081,
 * que vuelven a comprobar rol, organizacion, estado de la rifa, apartado vigente
 * y cupo con las filas bloqueadas. Ninguna recibe organizacion ni identidad de
 * quien llama.
 */

function firstIssue(error: { issues: { message: string }[] }, fallback: string): string {
  return error.issues[0]?.message ?? fallback
}

function revalidateInventory() {
  revalidatePath('/owner/tickets')
  revalidatePath('/owner/tickets/generate')
  revalidatePath('/owner/dashboard')
  revalidatePath('/owner/raffles', 'layout')
  revalidatePath('/owner/sellers', 'layout')
  revalidatePath('/seller/inventory')
  revalidatePath('/seller/tickets')
  revalidatePath('/seller/dashboard')
}

// ---------------------------------------------------------------------------
// El generador (personal)
// ---------------------------------------------------------------------------

export type GenerationPreview = {
  total: number
  existing: number
  existingGenerated: number
  inProgressRunId: string | null
}

/**
 * Los rangos contra los números de LA rifa (D-261), con las frases de la base.
 * Una rifa que no aparece lo dice la función de la base, con su frase.
 */
async function rangesProblemFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  v: { raffleId: string; dailyFrom: string; dailyTo: string; weeklyFrom: string; weeklyTo: string },
): Promise<string | null> {
  const { data } = await supabase
    .from('raffles')
    .select(RAFFLE_NUMBER_FORMAT_COLUMNS)
    .eq('id', v.raffleId)
    .maybeSingle()
  if (!data) return null
  return generationRangesProblem(numberFormatFromRow(data).groups, v)?.message ?? null
}

/** Cuantas combinaciones y cuantas ya existen. No escribe nada. */
export async function previewTicketGeneration(
  input: unknown,
): Promise<ActionResultWith<GenerationPreview>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = generationPreviewSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Revisa los rangos.') }
  const v = parsed.data

  const supabase = await createClient()
  const problem = await rangesProblemFor(supabase, v)
  if (problem) return { error: problem }
  const { data, error } = await supabase.rpc('admin_ticket_generation_preview', {
    p_raffle_id: v.raffleId,
    p_daily_from: v.dailyFrom,
    p_daily_to: v.dailyTo,
    p_weekly_from: v.weeklyFrom,
    p_weekly_to: v.weeklyTo,
  })
  if (error) return { error: mapPgError(error) }
  const row = data?.[0]
  return {
    ok: true,
    data: {
      total: Number(row?.total_count ?? 0),
      existing: Number(row?.existing_count ?? 0),
      existingGenerated: Number(row?.existing_generated_count ?? 0),
      inProgressRunId: row?.in_progress_run_id ?? null,
    },
  }
}

export type GenerationProgress = {
  outcome: string
  runId: string
  raffleId: string
  totalCount: number
  processedCount: number
  createdCount: number
  existingCount: number
  existingGeneratedCount: number
  status: 'in_progress' | 'completed'
}

type ProgressRow = {
  outcome: string
  run_id: string
  raffle_id: string
  total_count: number
  processed_count: number
  created_count: number
  existing_count: number
  existing_generated_count: number
  status: string
}

function toProgress(row: ProgressRow): GenerationProgress {
  return {
    outcome: row.outcome,
    runId: row.run_id,
    raffleId: row.raffle_id,
    totalCount: row.total_count,
    processedCount: row.processed_count,
    createdCount: row.created_count,
    existingCount: row.existing_count,
    existingGeneratedCount: row.existing_generated_count,
    status: row.status === 'completed' ? 'completed' : 'in_progress',
  }
}

/**
 * Empieza una generacion —o devuelve la que ya empezo esta misma solicitud, o
 * continua una igual sin terminar—. No crea boletas: eso es cada bloque.
 */
export async function startTicketGeneration(
  input: unknown,
): Promise<ActionResultWith<GenerationProgress>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = generationStartSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Revisa los rangos.') }
  const v = parsed.data

  const supabase = await createClient()
  const problem = await rangesProblemFor(supabase, v)
  if (problem) return { error: problem }
  const { data, error } = await supabase.rpc('admin_start_ticket_generation', {
    p_raffle_id: v.raffleId,
    p_daily_from: v.dailyFrom,
    p_daily_to: v.dailyTo,
    p_weekly_from: v.weeklyFrom,
    p_weekly_to: v.weeklyTo,
    p_request_id: v.requestId,
  })
  if (error) return { error: mapPgError(error) }
  const row = data?.[0]
  if (!row) return { error: INVENTORY_COPY.generator.startFailed }
  revalidatePath('/owner/tickets/generate')
  return { ok: true, data: toProgress(row) }
}

/**
 * Procesa UN bloque. `processedCount` es el avance que la pantalla tiene por
 * confirmado: si la base ya lo paso (un reintento), no hace nada y devuelve el
 * avance real, del que la pantalla sigue.
 */
export async function processTicketGenerationChunk(
  input: unknown,
): Promise<ActionResultWith<GenerationProgress>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = generationChunkSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Revisa la generación.') }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_process_ticket_generation', {
    p_run_id: parsed.data.runId,
    p_processed_count: parsed.data.processedCount,
  })
  if (error) return { error: mapPgError(error) }
  const row = data?.[0]
  if (!row) return { error: INVENTORY_COPY.generator.continueFailed }

  const progress = toProgress(row)
  if (progress.status === 'completed') revalidateInventory()
  return { ok: true, data: progress }
}

// ---------------------------------------------------------------------------
// Lotes (personal)
// ---------------------------------------------------------------------------

export async function assignInventoryTickets(
  input: unknown,
): Promise<ActionResultWith<{ count: number; message: string }>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = assignInventorySchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Revisa los datos ingresados.') }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_assign_inventory_tickets', {
    p_ticket_ids: parsed.data.ticketIds,
    p_seller_id: parsed.data.sellerId,
  })
  if (error) return { error: mapPgError(error) }

  revalidateInventory()
  const count = Number(
    (data as { requested?: number } | null)?.requested ?? parsed.data.ticketIds.length,
  )
  return { ok: true, data: { count, message: INVENTORY_COPY.staff.assignDone(count) } }
}

export async function recoverInventoryTickets(
  input: unknown,
): Promise<ActionResultWith<{ count: number; message: string }>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = recoverInventorySchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Revisa los datos ingresados.') }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_recover_inventory_tickets', {
    p_ticket_ids: parsed.data.ticketIds,
  })
  if (error) return { error: mapPgError(error) }

  revalidateInventory()
  const count = Number(
    (data as { requested?: number } | null)?.requested ?? parsed.data.ticketIds.length,
  )
  return { ok: true, data: { count, message: INVENTORY_COPY.staff.recoverDone(count) } }
}

// ---------------------------------------------------------------------------
// Configuracion de los apartados (el Dueño: `raffles.holds.manage`)
// ---------------------------------------------------------------------------

export async function saveHoldSettings(
  input: unknown,
): Promise<ActionResultWith<{ durationMinutes: number; maxActivePerSeller: number }>> {
  const auth = await authorizeCapability('raffles.holds.manage', {
    roles: ['owner', 'admin'],
    deniedMessage: 'No tienes permiso para cambiar los apartados de esta rifa.',
  })
  if ('error' in auth) return auth

  const parsed = holdSettingsSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Revisa los valores.') }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_raffle_hold_settings', {
    p_raffle_id: parsed.data.raffleId,
    p_duration_minutes: parsed.data.durationMinutes,
    p_max_active_per_seller: parsed.data.maxActivePerSeller,
  })
  if (error) return { error: mapPgError(error) }
  const row = data?.[0]

  revalidatePath(`/owner/raffles/${parsed.data.raffleId}`)
  revalidatePath('/seller/inventory')
  return {
    ok: true,
    data: {
      durationMinutes: row?.duration_minutes ?? parsed.data.durationMinutes,
      maxActivePerSeller: row?.max_active_per_seller ?? parsed.data.maxActivePerSeller,
    },
  }
}

// ---------------------------------------------------------------------------
// Apartados (vendedor)
// ---------------------------------------------------------------------------

export type HoldResult = {
  outcome: string
  holdId: string
  ticketId: string
  dailyNumber: string
  weeklyNumber: string
  expiresAt: string
  extended: boolean
  isActive: boolean
  activeCount: number
  maxActive: number
}

/** Apartar. Repetir la MISMA solicitud devuelve el mismo apartado (BR-I25). */
export async function takeTicketHold(input: unknown): Promise<ActionResultWith<HoldResult>> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = takeHoldSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Revisa la boleta elegida.') }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('take_ticket_hold', {
    p_ticket_id: parsed.data.ticketId,
    p_request_id: parsed.data.requestId,
  })
  if (error) return { error: mapPgError(error) }
  const row = data?.[0]
  if (!row) return { error: INVENTORY_COPY.seller.takeFailed }

  revalidatePath('/seller/inventory')
  return {
    ok: true,
    data: {
      outcome: row.outcome,
      holdId: row.hold_id,
      ticketId: row.ticket_id,
      dailyNumber: row.daily_number,
      weeklyNumber: row.weekly_number,
      expiresAt: row.expires_at,
      extended: row.extended,
      isActive: row.is_active,
      activeCount: Number(row.active_count),
      maxActive: row.max_active,
    },
  }
}

/** Los 30 minutos de mas: una sola vez. Repetirla no suma otra vez. */
export async function extendTicketHold(
  input: unknown,
): Promise<ActionResultWith<{ outcome: string; expiresAt: string }>> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = holdIdSchema.safeParse(input)
  if (!parsed.success)
    return { error: firstIssue(parsed.error, 'El apartado no existe o no es tuyo.') }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('extend_ticket_hold', {
    p_hold_id: parsed.data.holdId,
  })
  if (error) return { error: mapPgError(error) }
  const row = data?.[0]
  if (!row) return { error: INVENTORY_COPY.seller.extendFailed }

  revalidatePath('/seller/inventory')
  return { ok: true, data: { outcome: row.outcome, expiresAt: row.expires_at } }
}

/** Devolver antes de que venza. Repetirla no hace nada mas. */
export async function returnTicketHold(
  input: unknown,
): Promise<ActionResultWith<{ outcome: string }>> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = holdIdSchema.safeParse(input)
  if (!parsed.success)
    return { error: firstIssue(parsed.error, 'El apartado no existe o no es tuyo.') }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('return_ticket_hold', {
    p_hold_id: parsed.data.holdId,
  })
  if (error) return { error: mapPgError(error) }

  revalidatePath('/seller/inventory')
  return { ok: true, data: { outcome: data?.[0]?.outcome ?? 'returned' } }
}
