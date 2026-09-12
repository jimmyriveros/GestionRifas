'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/lib/action-result'
import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

import { pushEndpointSchema, pushSubscriptionSchema } from './schemas'

/**
 * Las dos escrituras de los avisos en el teléfono (BR-V06, D-190).
 *
 * **LOS TRES ROLES**, no solo el vendedor: la campana la tiene todo el mundo y
 * una suscripción es de una persona, no de una organización (D-190). Hoy lo
 * único que produce avisos son los recordatorios de pago, que son del vendedor,
 * pero el modelo no tiene por qué estrecharse por eso.
 *
 * `push_subscriptions` concede **solo `SELECT`**: un `insert` directo devuelve
 * `42501`. Las RPC son la única puerta, y por eso el endpoint único y la
 * bitácora no se pueden esquivar.
 *
 * ESTO NO ENVÍA NADA. Guardar la suscripción es todo lo que hace la Etapa 4; el
 * despachador que de verdad manda el aviso es la Etapa 5.
 */

function revalidateReminders() {
  revalidatePath('/seller/settings/reminders')
}

/**
 * «Este dispositivo quiere avisos».
 *
 * Si el endpoint ya existía —el mismo teléfono, otra persona— la RPC **reasigna**
 * en vez de duplicar: en un móvil compartido, quien activa pasa a ser el dueño y
 * el anterior deja de recibir ahí. Es el caso normal en este producto, no el
 * raro.
 */
export async function enablePushNotifications(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = pushSubscriptionSchema.safeParse(input)
  // El mensaje de Zod no se propaga a propósito: lo que llega aquí lo produjo el
  // navegador, así que un fallo es un defecto nuestro y no algo que quien mira
  // la pantalla pueda arreglar leyendo una regla de validación.
  if (!parsed.success) return { error: 'No pudimos activar los avisos en este dispositivo.' }
  const values = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('upsert_push_subscription', {
    p_endpoint: values.endpoint,
    p_p256dh: values.p256dh,
    p_auth: values.auth,
    ...(values.userAgent === undefined ? {} : { p_user_agent: values.userAgent }),
  })
  if (error) return { error: mapPgError(error) }

  revalidateReminders()
  return { ok: true }
}

/**
 * «Este dispositivo ya no».
 *
 * Aquí **sí se borra la fila**, y es una de las dos únicas excepciones a D-038
 * que el contrato acepta: una suscripción es transporte, no historial. Quien
 * apaga los avisos espera que no quede nada esperando a reactivarse solo.
 */
export async function disablePushNotifications(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = pushEndpointSchema.safeParse(input)
  if (!parsed.success) return { error: 'No pudimos apagar los avisos en este dispositivo.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_push_subscription', {
    p_endpoint: parsed.data.endpoint,
  })
  if (error) return { error: mapPgError(error) }

  // La RPC devuelve `false` cuando no había ninguna suya con ese endpoint, y eso
  // NO es un error: el navegador acaba de dejar de estar suscrito igual, que es
  // lo que la persona pidió.
  revalidateReminders()
  return { ok: true }
}
