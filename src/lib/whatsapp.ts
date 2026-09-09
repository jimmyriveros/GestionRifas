/**
 * Lo comun de WhatsApp: normalizar un telefono y armar un enlace `wa.me`.
 *
 * NO HAY INTEGRACION CON WHATSAPP EN NINGUNA PARTE DE ESTE PROYECTO. Esto arma
 * una direccion `https://` y nada mas: no hay SDK, ni API, ni token, ni sesion,
 * ni forma de saber si el mensaje se envio. Abrirla no registra una venta, no
 * cambia el estado de una boleta y no crea nada.
 *
 * POR QUE VIVE EN `lib/` Y NO EN UN MODULO DE `features/`
 *
 * Nacio en `features/catalog/whatsapp.ts` para el boton «Solicitar» del catalogo
 * publico (BR-K09). Cuando la invitacion al grupo del vendedor (BR-W04) necesito
 * exactamente lo mismo, habia dos caminos: importar `catalog` desde `settings`
 * —dos funciones que no tienen nada que ver acopladas por un ayudante— o
 * duplicar cuarenta lineas. Ninguno es aceptable (`HANDOFF` 6.b: REUSE →
 * EXTEND → CREATE), asi que lo generico subio aqui.
 *
 * Lo que se quedo en `features/catalog/whatsapp.ts` es lo que solo entiende el
 * catalogo: como se saluda al vendedor y como se redacta la peticion de una
 * boleta. Lo propio de la invitacion al grupo vive, por la misma razon, en
 * `features/settings/whatsapp-invite.ts`.
 */

import { digitsOnly } from '@/lib/search'

/** Digitos de un movil colombiano sin indicativo: «3001234567». */
const NATIONAL_MOBILE_DIGITS = 10
const COLOMBIA_COUNTRY_CODE = '57'

/**
 * Deja un telefono como lo necesita `wa.me`: solo digitos, con indicativo.
 *
 * Se le anade el `57` a un movil colombiano de diez cifras porque es lo que la
 * gente escribe —«3001234567»— y porque esta aplicacion opera en un solo pais
 * (CLAUDE.md 6: COP, `America/Bogota`). Cualquier otra longitud se respeta tal
 * cual: quien escriba un numero de otro pais con su indicativo obtiene lo que
 * escribio.
 *
 * NO se supone Colombia a ciegas, que es justo lo que romperia un numero
 * internacional: solo se completa el caso que es inequivocamente un movil
 * nacional —diez digitos empezando por 3—. Un numero de diez digitos de otro
 * pais que empiece por otra cifra sale intacto.
 *
 * Quita `+`, espacios, parentesis, guiones y cualquier otro adorno, porque
 * `digitsOnly` se queda solo con las cifras. Es la misma funcion que ya usa la
 * busqueda por telefono, asi que las dos entienden lo mismo por «un telefono».
 *
 * Devuelve `null` cuando no queda nada utilizable, para que quien llame decida
 * si eso es un error de formulario o simplemente un campo vacio.
 */
export function normalizeWhatsappNumber(raw: string): string | null {
  const digits = digitsOnly(raw)
  if (digits === '') return null
  if (digits.length === NATIONAL_MOBILE_DIGITS && digits.startsWith('3')) {
    return `${COLOMBIA_COUNTRY_CODE}${digits}`
  }
  return digits
}

/** Lo mismo que exige el CHECK `memberships_public_whatsapp_format` (0043). */
export const WHATSAPP_REGEX = /^[1-9][0-9]{7,14}$/

export function isValidWhatsappNumber(value: string): boolean {
  return WHATSAPP_REGEX.test(value)
}

/**
 * El enlace completo hacia una conversacion, con el mensaje ya escrito.
 *
 * `encodeURIComponent` y no `URLSearchParams`: este ultimo codifica el espacio
 * como `+`, que WhatsApp muestra literalmente dentro del mensaje.
 */
export function whatsappUrl(whatsappNumber: string, message: string): string {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
}
