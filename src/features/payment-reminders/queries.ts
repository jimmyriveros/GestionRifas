import 'server-only'

import { getActiveMembership } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import type { PaymentReminder } from './reminders'

/**
 * Los recordatorios de pago del vendedor de la sesion (BR-S01).
 *
 * NO RECIBE NINGUN VENDEDOR, por lo mismo que `listPaymentAccounts`: la unica
 * politica de la tabla es `seller_id = current_profile_id()`.
 *
 * `next_run_at` NO se lee: en esta etapa no hay motor y la pantalla no promete
 * ninguna fecha concreta. Enseñar «suena el martes 15» sin que exista nada que
 * lo dispare seria decir algo que no es cierto (D-116).
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
