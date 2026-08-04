'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, ActionResultWith } from '@/lib/action-result'

import { comboKey, hasErrors, validateBulkRows } from '../bulk/duplicates'
import { createSellerTicketsSchema, updateSellerTicketNumbersSchema } from './schemas'

/**
 * Creacion de boletas por parte del vendedor (BR-I03, BR-R10).
 *
 * Las boletas nacen en `pending_approval` y las aprueba Owner o Admin: el
 * vendedor no puede auto-aprobarse. Eso NO depende de este codigo, lo impone la
 * politica `tickets_insert_seller`, que exige `inventory_status =
 * 'pending_approval'`, `client_id is null`, `seller_id = current_profile_id()` y
 * una rifa activa con `allow_seller_ticket_creation`. Verificado: cualquier
 * intento de saltarse eso devuelve 42501.
 *
 * Las comprobaciones de aqui existen para dar un mensaje entendible antes de
 * chocar contra RLS, no para sustituirla.
 */

export type SellerTicketsResult = {
  requested: number
  inserted: number
  /** Combinaciones `daily/weekly` que ya existian en la rifa. */
  conflicts: string[]
}

export async function createSellerTickets(
  input: unknown,
): Promise<ActionResultWith<SellerTicketsResult>> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = createSellerTicketsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const { raffleId, rows } = parsed.data

  // Segunda capa de la validacion por fila (BR-N10): el navegador ya la hizo,
  // pero una Server Action puede invocarse sin pasar por la interfaz.
  if (hasErrors(validateBulkRows(rows, { requireComplete: true }))) {
    return { error: 'Hay filas con numeros invalidos o repetidos entre si.' }
  }

  const supabase = await createClient()

  const { data: raffle, error: raffleError } = await supabase
    .from('raffles')
    .select('id, status, allow_seller_ticket_creation')
    .eq('id', raffleId)
    .maybeSingle()

  if (raffleError) return { error: mapPgError(raffleError) }
  if (!raffle) return { error: 'La rifa no existe o no tienes acceso a ella.' }

  if (raffle.status !== 'active') {
    return { error: 'La rifa no esta activa. No se pueden crear boletas.' }
  }
  if (!raffle.allow_seller_ticket_creation) {
    return {
      error: 'Esta rifa no permite que los vendedores creen boletas. Pidelas a tu administrador.',
    }
  }

  // ON CONFLICT DO NOTHING: una combinacion ya tomada no tumba el lote entero,
  // se informa por fila. El vendedor no puede consultar las boletas de otros
  // (BR-U07), asi que no hay forma de avisarle del choque antes de intentarlo:
  // la base de datos es quien lo sabe.
  const { data, error } = await supabase
    .from('tickets')
    .upsert(
      rows.map((row) => ({
        organization_id: auth.membership.organizationId,
        raffle_id: raffleId,
        seller_id: auth.membership.profileId,
        daily_number: row.dailyNumber,
        weekly_number: row.weeklyNumber,
        inventory_status: 'pending_approval' as const,
        created_by: auth.membership.profileId,
      })),
      {
        onConflict: 'organization_id,raffle_id,daily_number,weekly_number',
        ignoreDuplicates: true,
      },
    )
    .select('daily_number, weekly_number')

  if (error) return { error: mapPgError(error) }

  const insertedKeys = new Set(
    (data ?? []).flatMap((row) =>
      row.daily_number && row.weekly_number ? [comboKey(row.daily_number, row.weekly_number)] : [],
    ),
  )
  const conflicts = rows
    .map((row) => comboKey(row.dailyNumber, row.weeklyNumber))
    .filter((key) => !insertedKeys.has(key))

  revalidatePath('/seller/tickets')
  revalidatePath('/seller/dashboard')
  revalidatePath('/owner/tickets')
  revalidatePath('/owner/dashboard')

  return {
    ok: true,
    data: { requested: rows.length, inserted: insertedKeys.size, conflicts },
  }
}

/**
 * Correccion de los numeros por parte del vendedor, solo mientras la boleta no
 * este aprobada.
 *
 * La comprobacion real la hace `tickets_update_seller`, cuyo USING acota las
 * filas a `draft`/`pending_approval` propias: si la boleta ya esta disponible o
 * asignada, el UPDATE no encuentra fila y afecta CERO sin lanzar error
 * (docs/SECURITY.md 5.1). Por eso se comprueba el numero de filas.
 */
export async function updateSellerTicketNumbers(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = updateSellerTicketNumbersSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los numeros.' }
  }
  const { ticketId, dailyNumber, weeklyNumber } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tickets')
    .update({ daily_number: dailyNumber, weekly_number: weeklyNumber })
    .eq('id', ticketId)
    .select('id')

  if (error) return { error: mapPgError(error) }

  if (!data || data.length === 0) {
    return {
      error: 'Solo puedes cambiar los numeros de una boleta que todavia no ha sido aprobada.',
    }
  }

  revalidatePath('/seller/tickets')
  revalidatePath(`/seller/tickets/${ticketId}`)
  return { ok: true }
}
