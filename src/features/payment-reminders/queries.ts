import 'server-only'

import { getActiveMembership } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import type { PaymentReminder, PaymentReminderOccurrence } from './reminders'

/**
 * Los recordatorios de pago del vendedor de la sesion (BR-S01).
 *
 * NO RECIBE NINGUN VENDEDOR, por lo mismo que `listPaymentAccounts`: la unica
 * politica de la tabla es `seller_id = current_profile_id()`.
 *
 * `next_run_at` NO se lee, ni siquiera ahora que el motor existe: la pantalla
 * no promete una fecha de proximo envio. El dato es correcto, pero escribirlo
 * ataria la interfaz a un reloj que puede moverse por debajo —una pausa, un
 * cambio de hora, el propio motor— sin que la pantalla se entere (D-189).
 */
export async function listPaymentReminders(): Promise<PaymentReminder[]> {
  const membership = await getActiveMembership()
  if (!membership || membership.role !== 'seller') return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('seller_payment_reminders')
    .select('id, weekday, time_of_day, status, use_custom_message, custom_message')
    .order('weekday', { ascending: true })
    .order('time_of_day', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({
    id: row.id,
    weekday: row.weekday,
    timeOfDay: row.time_of_day,
    status: row.status,
    useCustomMessage: row.use_custom_message,
    customMessage: row.custom_message,
  }))
}

/** Cuantos activos hay, para la linea de estado del resumen. Sin traer filas. */
export async function countActivePaymentReminders(): Promise<number> {
  const membership = await getActiveMembership()
  if (!membership || membership.role !== 'seller') return 0

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('seller_payment_reminders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  if (error) return 0
  return count ?? 0
}

/**
 * Lo que este vendedor tiene por enviar (BR-S10, BR-S14).
 *
 * Trae la configuracion del recordatorio de cada ocurrencia —no su mensaje— y
 * se compone al pintar, con las cuentas vigentes (BR-S08).
 *
 * SE LEEN LAS PENDIENTES DE CUALQUIER RECORDATORIO, incluidos los que despues
 * se pausaron o archivaron: la ocurrencia ya vencio y su aviso ya esta en la
 * campana. Esconderla porque el recordatorio cambio despues dejaria a alguien
 * buscando un mensaje que la campanita le prometio.
 *
 * Las OMITIDAS no salen aqui, y es todo el sentido de que existan: el sistema
 * no las aviso, asi que ofrecer mandarlas a destiempo seria inventar una tarea
 * (BR-S11). Su fila queda como evidencia de que hubo un hueco.
 */
export async function listPendingReminderOccurrences(): Promise<PaymentReminderOccurrence[]> {
  const membership = await getActiveMembership()
  if (!membership || membership.role !== 'seller') return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payment_reminder_occurrences')
    .select(
      'id, scheduled_for, seller_payment_reminders!inner(id, weekday, time_of_day, status, use_custom_message, custom_message)',
    )
    .eq('status', 'pending')
    .order('scheduled_for', { ascending: true })

  if (error || !data) return []

  return data.map((row) => {
    const reminder = row.seller_payment_reminders
    return {
      id: row.id,
      scheduledFor: row.scheduled_for,
      reminder: {
        id: reminder.id,
        weekday: reminder.weekday,
        timeOfDay: reminder.time_of_day,
        status: reminder.status,
        useCustomMessage: reminder.use_custom_message,
        customMessage: reminder.custom_message,
      },
    }
  })
}

/** Cuantas hay por enviar, para la linea del resumen. Sin traer filas. */
export async function countPendingReminderOccurrences(): Promise<number> {
  const membership = await getActiveMembership()
  if (!membership || membership.role !== 'seller') return 0

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('payment_reminder_occurrences')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (error) return 0
  return count ?? 0
}
