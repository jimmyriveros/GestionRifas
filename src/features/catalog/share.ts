/**
 * El mensaje con el que un vendedor reparte su catalogo (BR-K13, D-161).
 *
 * Logica PURA, como `slug.ts` y `whatsapp.ts`: la usan la tarjeta del panel y
 * las pruebas. Aqui no se toca `navigator`; eso vive en el componente.
 *
 * EL NOMBRE DE LA RIFA NO SE ESCRIBE EN EL CODIGO. Igual que el titulo de la
 * pagina publica (D-159), el encabezado se DERIVA de `raffles.name`: con la
 * rifa llamada «Sorteo Camioneta KIA» sale exactamente el texto pedido, y el
 * dia que la empresa cambie de premio no hay que desplegar nada.
 */

/** Encabezado del mensaje: «Números disponibles — Sorteo Camioneta KIA». */
export function catalogShareTitle(raffleName: string): string {
  return `Números disponibles — ${raffleName}`
}

/**
 * La invitacion, sin la direccion.
 *
 * Habla en primera persona —«mis números»— porque quien lo envia es el
 * vendedor, no la empresa: llega a un chat personal, y un texto corporativo en
 * ese sitio suena a reenvio.
 */
export const CATALOG_SHARE_PROMO =
  'Consulta mis números disponibles y solicita el que más te guste:'

/**
 * El mensaje entero, tal como se ve en el chat.
 *
 * Es lo que se le pasa a `navigator.share` como `text`, y NO incluye la
 * direccion: esa viaja aparte, en `url`, que es lo que permite a WhatsApp y a
 * los demas destinos pintar la vista previa del enlace. Quien no reciba `url`
 * —un destino que solo entiende texto— recibe igualmente el enlace, porque
 * `catalogShareMessage` lo pega al final.
 */
export function catalogShareText(raffleName: string): string {
  return `${catalogShareTitle(raffleName)}\n\n${CATALOG_SHARE_PROMO}`
}

/** El bloque completo, con la direccion incluida. */
export function catalogShareMessage(raffleName: string, url: string): string {
  return `${catalogShareText(raffleName)}\n\n${url}`
}

/**
 * Lo que se le entrega a `navigator.share()`.
 *
 * Los tres campos que pide el encargo. `title` lo usan los destinos que
 * componen una tarjeta (correo, notas); `text` y `url`, los que componen un
 * mensaje (WhatsApp, Telegram). Ningun destino usa los tres, y por eso el
 * encabezado va tambien dentro de `text`: si solo estuviera en `title`, en
 * WhatsApp se perderia.
 */
export type CatalogShareData = { title: string; text: string; url: string }

export function catalogShareData(raffleName: string, url: string): CatalogShareData {
  return {
    title: catalogShareTitle(raffleName),
    text: catalogShareText(raffleName),
    url,
  }
}

/**
 * `true` si el fallo de `navigator.share()` fue que la persona CERRO el menu.
 *
 * Es la diferencia entre callarse y avisar: quien cancela a proposito no ha
 * sufrido ningun error y no hay que decirle nada, y mucho menos copiarle algo
 * al portapapeles que no pidio. El navegador lo indica con `AbortError`.
 *
 * `NotAllowedError` NO cuenta como cancelacion: significa que el navegador
 * rechazo la llamada —normalmente porque perdio el gesto del usuario— y ahi el
 * enlace sí se copia, porque la persona quiso compartir y no pudo.
 */
export function isShareCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
