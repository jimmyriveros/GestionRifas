import 'server-only'

import { getActiveMembership } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import { EMPTY_WHATSAPP_SETTINGS, type WhatsappSettings } from './invite'

/**
 * La configuracion de WhatsApp del vendedor de la sesion (BR-W07).
 *
 * NO RECIBE NINGUN VENDEDOR. Se lee siempre la fila de quien pregunta, que sale
 * de la sesion: no hay parametro que manipular para leer la de otro. Ademas
 * `memberships_select` solo devolveria la propia, la del personal de su
 * organizacion y la de su equipo, asi que aunque alguien colara un id ajeno la
 * base no lo serviria.
 *
 * SE LEE UNA VEZ POR PETICION, EN SERVIDOR, Y VIAJA CON EL HTML. Es lo que hace
 * que esta funcion no cueste nada en la navegacion normal (seccion 21 del
 * encargo): el dialogo de exito no consulta al abrirse —ya tiene el dato— y no
 * hay estado global, ni sondeo, ni peticion adicional. `getActiveMembership()`
 * esta memoizado por peticion (React `cache`), asi que llamarla desde dos
 * pantallas de la misma peticion no la consulta dos veces. Dos de las tres
 * pantallas que la usan la piden dentro de su `Promise.all`, asi que ni siquiera
 * anaden un viaje en serie.
 *
 * POR QUE NO SE METIO EN `getActiveMembership`, que ya lee esta misma fila. Se
 * consideró —el encargo pide evitar llamadas que puedan ir con la configuracion
 * existente (seccion 21)— y se descarto: esa funcion corre en el layout de
 * TODAS las peticiones protegidas, incluidas las del Dueño y el Administrador,
 * que no tienen grupo de WhatsApp ni pueden tenerlo. Cargar tres columnas de una
 * funcion de vendedor en el objeto de sesion de todo el mundo, para ahorrar UNA
 * consulta —ya paralela— en tres rutas, es peor negocio del que parece: encarece
 * el 100 % de las peticiones para abaratar el 3 % de las pantallas.
 *
 * Devuelve la configuracion vacia —no un error— cuando quien pregunta no es un
 * vendedor o no tiene fila: para la interfaz eso significa «no hay grupo
 * configurado», que es exactamente lo que hay que pintar.
 */
export async function getWhatsappSettings(): Promise<WhatsappSettings> {
  const membership = await getActiveMembership()
  if (!membership || membership.role !== 'seller') return EMPTY_WHATSAPP_SETTINGS

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select('whatsapp_group_url, whatsapp_use_custom_message, whatsapp_custom_message')
    .eq('profile_id', membership.profileId)
    .eq('role', 'seller')
    .maybeSingle()

  // Un fallo de lectura no puede tumbar la pantalla en la que aparece: esto se
  // pinta dentro del panel, del formulario de cliente y del detalle de una
  // boleta. Sin configuracion, el dialogo ofrece «Configurar WhatsApp», que es
  // el peor caso aceptable; lanzar dejaria sin registrar al cliente.
  if (error || !data) return EMPTY_WHATSAPP_SETTINGS

  return {
    groupUrl: data.whatsapp_group_url,
    useCustomMessage: data.whatsapp_use_custom_message,
    customMessage: data.whatsapp_custom_message,
  }
}
