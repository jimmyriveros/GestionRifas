'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResultWith } from '@/lib/action-result'
import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

import { WEEKLY_RESULTS_COPY } from './copy'
import type { WeeklyResultsMessageSettings } from './message'
import { weeklyResultsMessageSchema } from './schemas'

/**
 * Guardar el mensaje de «Resultados de la semana» del vendedor (BR-H09, BR-H10,
 * D-197).
 *
 * SOLO EL PROPIO VENDEDOR, Y SOBRE SÍ MISMO. Ni esta acción ni la RPC reciben un
 * identificador de vendedor: los dos sacan a la persona de la sesión. Es el
 * patrón de `saveWhatsappSettings`, pero en su propio dominio: guardar este
 * mensaje no toca el grupo de WhatsApp ni la invitación.
 *
 * POR QUÉ UNA RPC Y NO UN UPDATE. `memberships_update_staff` es la única política
 * de escritura de esa tabla, solo deja pasar al personal y no se amplía: abriría
 * rol, estado, ganancia y vendedor padre a quien solo guarda un texto.
 * `set_seller_weekly_results_message` (0056) escribe dos columnas de una fila.
 *
 * La bitácora la escribe `audit_memberships` (0006) con los valores anterior y
 * nuevo. Llamar a `write_audit_log` aquí sería una segunda fila del mismo hecho.
 *
 * El TEXTO es texto y solo texto: se pinta en un `<textarea>` y en un nodo de
 * texto, nunca con `dangerouslySetInnerHTML`.
 */
export async function saveWeeklyResultsMessage(
  input: unknown,
): Promise<ActionResultWith<WeeklyResultsMessageSettings>> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = weeklyResultsMessageSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_seller_weekly_results_message', {
    p_use_custom_message: values.useCustomMessage,
    // El texto viaja aunque el interruptor esté apagado: se conserva para que
    // volver a encenderlo lo devuelva. Vacío no viaja, y la RPC guarda NULL.
    ...(values.customMessage === '' ? {} : { p_custom_message: values.customMessage }),
  })

  if (error) return { error: mapPgError(error) }

  const row = data?.[0]
  if (!row) {
    // La RPC devuelve la fila que escribió. Sin fila, el UPDATE no alcanzó
    // ninguna: quien llama dejó de ser un vendedor activo entre la carga de la
    // pantalla y el envío.
    return { error: WEEKLY_RESULTS_COPY.share.messageSaveForbidden }
  }

  revalidatePath('/seller/settings/weekly-results')

  return {
    ok: true,
    data: {
      useCustomMessage: row.weekly_results_use_custom_message,
      customMessage: row.weekly_results_custom_message,
    },
  }
}
