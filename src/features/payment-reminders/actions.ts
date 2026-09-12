'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/lib/action-result'
import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

import {
  attendOccurrenceSchema,
  paymentReminderSchema,
  setReminderStatusSchema,
  toMinutePrecision,
  updateReminderSchema,
} from './schemas'

/**
 * Las cuatro escrituras de los recordatorios de pago (BR-S01..BR-S06, BR-S14).
 *
 * SOLO EL PROPIO VENDEDOR, Y SOBRE LO SUYO: ni estas acciones ni las RPC de la
 * `0051` reciben identificador de vendedor. Lo mismo que las cuentas y por la
 * misma razon (BR-M02, BR-S01).
 *
 * `seller_payment_reminders` concede **solo `SELECT`**: un `insert` directo
 * devuelve `42501`. Las RPC son la unica puerta, y por eso el tope de catorce y
 * la bitacora no se pueden esquivar.
 */

function revalidateSettings() {
  revalidatePath('/seller/settings')
  revalidatePath('/seller/settings/reminders')
}

export async function createPaymentReminder(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = paymentReminderSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_payment_reminder', {
    p_weekday: values.weekday,
    // La precision es de MINUTO: el CHECK `minute_precision` rechaza cualquier
    // segundo distinto de cero, asi que se descartan aqui en vez de dejar que
    // salte una restriccion con su nombre tecnico (BR-S02).
    p_time_of_day: toMinutePrecision(values.timeOfDay),
    p_use_custom_message: values.useCustomMessage,
    ...(values.customMessage.trim() === ''
      ? {}
      : { p_custom_message: values.customMessage.trim() }),
  })
  if (error) return { error: mapPgError(error) }

  revalidateSettings()
  return { ok: true }
}

export async function updatePaymentReminder(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = updateReminderSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_payment_reminder', {
    p_id: values.reminderId,
    p_weekday: values.weekday,
    p_time_of_day: toMinutePrecision(values.timeOfDay),
    p_use_custom_message: values.useCustomMessage,
    // El texto se conserva aunque el interruptor este apagado, para que volver
    // a encenderlo lo devuelva (BR-S06). Vaciarlo a proposito si lo borra.
    ...(values.customMessage.trim() === ''
      ? {}
      : { p_custom_message: values.customMessage.trim() }),
  })
  if (error) return { error: mapPgError(error) }

  revalidateSettings()
  return { ok: true }
}

/**
 * Pausar, reanudar y archivar son la MISMA escritura con distinto estado, igual
 * que en la base: una sola RPC.
 *
 * Pausar NO es archivar (`UX_COPY_GUIDELINES`): pausar conserva el recordatorio
 * tal cual y se reanuda de un toque; archivar lo saca del listado. Ninguno de
 * los dos borra nada (D-038).
 */
export async function setPaymentReminderStatus(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = setReminderStatusSchema.safeParse(input)
  if (!parsed.success) return { error: 'Recordatorio no válido.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_payment_reminder_status', {
    p_id: parsed.data.reminderId,
    p_status: parsed.data.status,
  })
  if (error) return { error: mapPgError(error) }

  revalidateSettings()
  return { ok: true }
}

/**
 * «Ya lo mandé» (BR-S14).
 *
 * ES UNA DECLARACION DEL VENDEDOR, no una confirmación de nada. La aplicación
 * no manda el mensaje: lo copia, abre el grupo y ahí termina su trabajo. No
 * sabemos si el mensaje salió, si llegó o si alguien lo leyó, y ningún texto de
 * este flujo puede sugerirlo (BR-W08, D-116).
 *
 * No lleva el aviso de la campanita a leído: eso es de la campanita y tiene su
 * propia acción. Una operación que cambiara en silencio algo de otra pantalla
 * sería peor que un contador de más.
 */
export async function markReminderOccurrenceAttended(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = attendOccurrenceSchema.safeParse(input)
  if (!parsed.success) return { error: 'Recordatorio no válido.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_reminder_occurrence_attended', {
    p_id: parsed.data.occurrenceId,
  })
  if (error) return { error: mapPgError(error) }

  revalidateSettings()
  return { ok: true }
}
