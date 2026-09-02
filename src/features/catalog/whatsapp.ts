/**
 * El enlace de WhatsApp del boton «Solicitar» (BR-K09).
 *
 * Logica PURA: la usan la pagina publica (servidor), el formulario de
 * configuracion (navegador) y las pruebas. Es un enlace normal —`https://wa.me/…`—
 * y no necesita ninguna dependencia nueva: abrirlo no registra una venta, no
 * cambia el estado de la boleta, no crea un cliente y no reserva nada.
 */

import { digitsOnly } from '@/lib/search'

/** Digitos de un movil colombiano sin indicativo: «3001234567». */
const NATIONAL_MOBILE_DIGITS = 10
const COLOMBIA_COUNTRY_CODE = '57'

/**
 * Deja un telefono como lo guarda la columna: solo digitos, con indicativo.
 *
 * Se le anade el `57` a un movil colombiano de diez cifras porque es lo que la
 * gente escribe —«3001234567»— y porque esta aplicacion opera en un solo pais
 * (CLAUDE.md 6: COP, `America/Bogota`). Cualquier otra longitud se respeta tal
 * cual: quien escriba un numero de otro pais con su indicativo obtiene lo que
 * escribio, y si no cumple el formato lo rechaza el CHECK de la base.
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
 * Como se saluda al vendedor en el mensaje: «Hola, Laura».
 *
 * El alias manda cuando existe, porque es el nombre que la propia persona
 * eligio para que la llamen (`profiles.alias`, CLAUDE.md 9). Sin alias se usa
 * el PRIMER nombre y no el nombre completo: «Hola, Laura Gómez Restrepo» no es
 * como se saluda a nadie por WhatsApp.
 */
export function shortSellerName(fullName: string, alias: string | null): string {
  const trimmedAlias = alias?.trim() ?? ''
  if (trimmedAlias !== '') return trimmedAlias
  return fullName.trim().split(/\s+/)[0] ?? fullName.trim()
}

/**
 * El mensaje que llega escrito en WhatsApp.
 *
 * SE NOMBRAN LOS DOS NUMEROS, Y NO ES UN CAPRICHO. En este proyecto una boleta
 * se identifica por su PAR (diario, semanal): lo unico unico dentro de una rifa
 * es la combinacion (`tickets_combo_unique`, BR-N04), y una boleta se nombra
 * «el 1234 con el 5678» (BR-N11, `lib/tickets.ts`). Un mensaje que dijera solo
 * «el número 1234» obligaria al vendedor a preguntar cual de las suyas es, que
 * es justo el trabajo que este catalogo viene a quitar.
 *
 * El texto no promete nada: pregunta si sigue disponible. Tocar el boton no
 * separa la boleta ni la reserva, y el mensaje no puede sugerir lo contrario.
 */
export function catalogWhatsappMessage(params: {
  sellerShortName: string
  dailyNumber: string
  weeklyNumber: string
}): string {
  const { sellerShortName, dailyNumber, weeklyNumber } = params
  return (
    `Hola, ${sellerShortName}. Quiero solicitar la boleta con diario ${dailyNumber} ` +
    `y semanal ${weeklyNumber} de la rifa. ¿Sigue disponible?`
  )
}

/**
 * El enlace completo.
 *
 * `encodeURIComponent` y no `URLSearchParams`: este ultimo codifica el espacio
 * como `+`, que WhatsApp muestra literalmente dentro del mensaje.
 */
export function whatsappUrl(whatsappNumber: string, message: string): string {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
}
