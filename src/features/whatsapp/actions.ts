'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResultWith } from '@/lib/action-result'

import type { WhatsappSettings } from './invite'
import { whatsappSettingsSchema } from './schemas'

/**
 * Guardar el grupo de WhatsApp y el mensaje del vendedor (BR-W01..BR-W03).
 *
 * SOLO EL PROPIO VENDEDOR, Y SOBRE SI MISMO. La accion no recibe ningun
 * identificador de vendedor y la RPC tampoco: los dos sacan a la persona de la
 * sesion. No hay nada que manipular en la peticion para escribir la
 * configuracion de otro (BR-W07, seccion 22 del encargo).
 *
 * POR QUE UNA RPC Y NO UN UPDATE. `memberships_update_staff` es la unica
 * politica de escritura de esa tabla y solo deja pasar al personal; un vendedor
 * no puede escribir su propia membresia. Ampliar la politica para tres columnas
 * habria abierto la fila entera —rol, estado, ganancia, vendedor padre— a quien
 * solo tenia que guardar un enlace. `set_seller_whatsapp_settings` (0050)
 * escribe tres columnas de una fila y no acepta otra.
 *
 * La auditoria la escribe `audit_memberships` (0006), que ya anota cualquier
 * cambio de esta tabla con sus valores anterior y nuevo. No se llama a
 * `write_audit_log` aqui: seria una segunda fila describiendo el mismo hecho.
 *
 * El TEXTO del mensaje es texto y solo texto: se guarda como lo escribio la
 * persona y se pinta en un `<textarea>` y dentro de un nodo de texto, nunca con
 * `dangerouslySetInnerHTML`. No hay forma de que lo que se escriba aqui se
 * ejecute como HTML.
 */
export async function saveWhatsappSettings(
  input: unknown,
): Promise<ActionResultWith<WhatsappSettings>> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = whatsappSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_seller_whatsapp_settings', {
    p_group_url: values.groupUrl === '' ? null : values.groupUrl,
    p_use_custom_message: values.useCustomMessage,
    // El texto se conserva aunque el interruptor este apagado, para que volver
    // a encenderlo lo devuelva (BR-W03). Vaciarlo a proposito si lo borra.
    p_custom_message: values.customMessage.trim() === '' ? null : values.customMessage.trim(),
  })

  if (error) return { error: mapPgError(error) }

  const row = data?.[0]
  if (!row) {
    // La RPC devuelve la fila que escribio. Sin fila, el UPDATE no alcanzo
    // ninguna: quien llama dejo de ser un vendedor activo entre la carga de la
    // pantalla y el envio del formulario.
    return { error: 'No pudimos guardar los cambios. Revisa tus permisos.' }
  }

  // El enlace y el mensaje se leen en el panel (la tarjeta de WhatsApp), en el
  // alta de cliente y en el detalle de una boleta, que es desde donde se vende.
  revalidatePath('/seller/settings')
  revalidatePath('/seller/dashboard')
  revalidatePath('/seller/clients/new')
  revalidatePath('/seller/tickets/[ticketId]', 'page')

  return {
    ok: true,
    data: {
      groupUrl: row.whatsapp_group_url,
      useCustomMessage: row.whatsapp_use_custom_message,
      customMessage: row.whatsapp_custom_message,
    },
  }
}
