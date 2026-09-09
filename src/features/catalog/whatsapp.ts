/**
 * Lo que solo entiende el catalogo publico: el saludo al vendedor y la peticion
 * de una boleta (BR-K09).
 *
 * Logica PURA: la usan la pagina publica (servidor), el formulario de
 * configuracion (navegador) y las pruebas. Es un enlace normal —`https://wa.me/…`—
 * y no necesita ninguna dependencia nueva: abrirlo no registra una venta, no
 * cambia el estado de la boleta, no crea un cliente y no reserva nada.
 *
 * NORMALIZAR EL TELEFONO Y ARMAR EL ENLACE YA NO ESTAN AQUI. Eso es comun a
 * todo el proyecto y vive en `lib/whatsapp.ts` desde D-176, porque la
 * invitacion al grupo del vendedor necesita exactamente lo mismo y la
 * alternativa era duplicarlo. Se reexportan las tres piezas que el catalogo
 * usaba para no cambiar los sitios que ya las pedian aqui.
 */

export {
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
  whatsappUrl,
  WHATSAPP_REGEX,
} from '@/lib/whatsapp'

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

/*
 * `catalogContactMessage` existio entre D-163 y D-164 para el boton general de
 * WhatsApp del encabezado. Se retiro con el boton: un mensaje que no nombra
 * ninguna boleta obliga al vendedor a preguntar cual, que es justo el trabajo
 * que este catalogo viene a quitarle. El unico camino a WhatsApp es «Solicitar»,
 * y ese SI nombra la boleta por sus dos numeros.
 */
