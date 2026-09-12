import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Los dispositivos de quien consulta (BR-V06).
 *
 * NO RECIBE NINGUNA PERSONA, por lo mismo que las lecturas del encargo de
 * cobro: la única política de la tabla es `profile_id = current_profile_id()`,
 * así que un filtro aquí sería cosmético.
 *
 * Devuelve **solo los endpoints**, que es lo único que la pantalla necesita para
 * responder a su única pregunta: «¿este navegador está registrado?». Las claves
 * —`p256dh` y `auth`— **no se leen nunca**: con ellas se le puede escribir a ese
 * dispositivo, y la pantalla no tiene nada que hacer con ellas.
 *
 * El endpoint sí puede volver al navegador: es suyo, lo generó él y ya lo tiene.
 */
export async function listPushEndpoints(): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .is('revoked_at', null)

  if (error || !data) return []
  return data.map((row) => row.endpoint)
}
