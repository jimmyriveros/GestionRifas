'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResultWith } from '@/lib/action-result'

import { bulkCreateTicketsSchema } from '../schemas'
import { comboKey, validateBulkRows, hasErrors } from './duplicates'

/**
 * Creacion masiva de boletas (CLAUDE.md 15).
 *
 * El guardado lo hace `bulk_create_tickets`, la RPC de la Fase 2: reserva el
 * bloque de codigos de una sola vez, inserta con ON CONFLICT DO NOTHING y
 * devuelve las combinaciones en conflicto sin abortar el lote. Asi un duplicado
 * en la fila 700 no tira por tierra las 999 restantes: se reportan por fila
 * para corregirlas.
 */

export type BulkCreateResult = {
  requested: number
  inserted: number
  /** Combinaciones `daily/weekly` que la base de datos rechazo por duplicadas. */
  conflicts: string[]
}

type RpcResult = {
  requested?: number
  inserted?: number
  conflicts?: { daily_number?: string | null; weekly_number?: string | null }[]
}

export async function bulkCreateTickets(
  input: unknown,
): Promise<ActionResultWith<BulkCreateResult>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = bulkCreateTicketsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  // Segunda capa de la validacion por fila (BR-N10): el navegador ya la hizo,
  // pero una Server Action puede invocarse sin pasar por la interfaz.
  if (hasErrors(validateBulkRows(values.rows))) {
    return { error: 'El lote tiene filas con numeros invalidos o repetidos entre si.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bulk_create_tickets', {
    p_raffle_id: values.raffleId,
    p_seller_id: values.sellerId,
    p_rows: values.rows.map((row) => ({
      // Una fila vacia se guarda como borrador para completarla despues.
      daily_number: row.dailyNumber === '' ? null : row.dailyNumber,
      weekly_number: row.weeklyNumber === '' ? null : row.weeklyNumber,
    })),
  })

  if (error) return { error: mapPgError(error) }

  const result = (data ?? {}) as RpcResult

  revalidatePath('/owner/tickets')
  revalidatePath('/owner/dashboard')
  revalidatePath(`/owner/raffles/${values.raffleId}`)

  return {
    ok: true,
    data: {
      requested: result.requested ?? values.rows.length,
      inserted: result.inserted ?? 0,
      conflicts: (result.conflicts ?? []).flatMap((conflict) =>
        conflict.daily_number && conflict.weekly_number
          ? [comboKey(conflict.daily_number, conflict.weekly_number)]
          : [],
      ),
    },
  }
}

/**
 * Comprueba contra la base de datos cuales de las combinaciones indicadas ya
 * existen en la rifa (BR-N10, capa de servidor previa al guardado).
 *
 * Se consulta solo por los numeros diarios presentes en el formulario, no por
 * todas las boletas de la rifa: una rifa puede tener decenas de miles y
 * PostgREST corta las respuestas en 1.000 filas, lo que daria un resultado
 * incompleto sin avisar. Aun asi es una ayuda, no una garantia: entre esta
 * consulta y el guardado alguien mas puede tomar la combinacion, y por eso la
 * palabra final la tiene `tickets_combo_unique`.
 */
export async function findExistingCombinations(
  raffleId: string,
  combos: readonly { dailyNumber: string; weeklyNumber: string }[],
): Promise<ActionResultWith<string[]>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const wanted = new Set(
    combos
      .filter((combo) => combo.dailyNumber !== '' && combo.weeklyNumber !== '')
      .map((combo) => comboKey(combo.dailyNumber, combo.weeklyNumber)),
  )
  if (wanted.size === 0) return { ok: true, data: [] }

  const dailyNumbers = [...new Set([...wanted].map((key) => key.split('/')[0] ?? ''))]

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tickets')
    .select('daily_number, weekly_number')
    .eq('raffle_id', raffleId)
    .in('daily_number', dailyNumbers)

  if (error) return { error: mapPgError(error) }

  const existing = (data ?? []).flatMap((row) =>
    row.daily_number && row.weekly_number ? [comboKey(row.daily_number, row.weekly_number)] : [],
  )

  return { ok: true, data: existing.filter((key) => wanted.has(key)) }
}
