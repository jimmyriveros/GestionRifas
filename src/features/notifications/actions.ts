'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/action-result'

/**
 * Marcar los avisos como leidos.
 *
 * No recibe ids: marca los del propio usuario. Asi no hay nada que validar ni
 * nada que manipular —el privilegio de `authenticated` sobre `notifications`
 * esta acotado a la COLUMNA `read_at` (0023), y la politica, a las filas
 * propias—. Lo peor que puede hacer alguien con esta accion es marcar como
 * leidos sus propios avisos.
 */
export async function markNotificationsRead(): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const supabase = await createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)

  if (error) return { error: mapPgError(error) }

  // La campanita se pinta en el armazon, que esta en TODAS las pantallas
  // protegidas: revalidar la ruta actual basta para que el contador baje.
  revalidatePath('/', 'layout')
  return { ok: true }
}
