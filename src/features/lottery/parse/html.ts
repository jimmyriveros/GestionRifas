/**
 * Ayudas para extraer campos ETIQUETADOS de una pagina oficial.
 *
 * Nunca se toman "los primeros cuatro digitos" de una pagina
 * (ResultadosLoterias §12). La etapa 3/6 endurecio esto porque la validacion
 * en vivo demostro que no bastaba (D-154): la Loteria del Meta devolvia el
 * numero mayor `6262` leido de los nombres de clase `.tdi_62,.tdi_62` de una
 * hoja de estilos, y la serie `391` de `body.page-id-391`. Los dos pasaban la
 * validacion de cuatro digitos y encajaban con la programacion, porque el
 * sorteo y la fecha si eran correctos.
 *
 * De ahi las dos reglas de este modulo:
 *
 *   1. `stripTags` borra `<script>`, `<style>`, `<noscript>` y comentarios
 *      antes de quitar etiquetas. Lo que no ve un usuario no es texto.
 *   2. Un campo se lee dentro de una VENTANA anclada a un encabezado que ya
 *      trae sorteo y fecha, y la tirada de digitos que sigue a la etiqueta
 *      tiene que medir exactamente lo esperado. Si no, se falla.
 */

export function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Etiqueta HTML, respetando las comillas. Un atributo puede contener `>`
 * —`onkeyup="if (this.value.length > 4) …"` esta en la pagina real de la
 * Cruz Roja—, y con `<[^>]+>` ese `>` cierra la etiqueta antes de tiempo y
 * el resto del atributo se cuela en el texto como si fuera contenido.
 *
 * Cada vuelta del grupo consume al menos las dos comillas, asi que no hay
 * repeticion vacia y el recorrido es lineal.
 */
const HTML_TAG = /<[a-zA-Z!/][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g

/** Bloques cuyo CONTENIDO tampoco es texto visible. */
const NON_TEXT_BLOCKS = /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

export function stripTags(html: string): string {
  return decodeHtml(
    html
      .replace(NON_TEXT_BLOCKS, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(HTML_TAG, ' '),
  )
}

/**
 * Un desafio anti-bot REAL, no cualquier mencion de uno.
 *
 * `imunify-bot-check` NO esta en la lista, y no es un olvido: Imunify360
 * inyecta en las paginas que SI sirve un enlace-señuelo oculto
 * (`<a href="/imunify-bot-check" style="display:none">`) para cazar robots que
 * siguen enlaces invisibles. Buscar ese texto marcaba como «bloqueada» la
 * portada de la Cruz Roja entregada entera, con su resultado dentro (D-154).
 * El señuelo no se sigue, y tampoco se confunde con un muro.
 */
const CHALLENGE_MARKERS = [
  'just a moment',
  'attention required! | cloudflare',
  'enable javascript and cookies to continue',
  'cf-browser-verification',
  'cdn-cgi/challenge',
  'imunify360-webshield',
  'im360_captcha',
]

export function looksLikeCloudflareChallenge(html: string): boolean {
  const text = html.toLowerCase()
  return CHALLENGE_MARKERS.some((marker) => text.includes(marker))
}

export type AnchoredSection = {
  /** Coincidencia del encabezado: trae sorteo y fecha. */
  match: RegExpMatchArray
  /** Texto inmediatamente posterior, acotado. Ahi se leen los campos. */
  window: string
}

/**
 * Ancla la lectura a un encabezado y devuelve la ventana que le sigue.
 *
 * `pattern` debe identificar el bloque de resultado por si mismo —sorteo y
 * fecha juntos—, para que la ventana no pueda caer sobre una hoja de estilos,
 * un desplegable de fechas anteriores ni la tabla de secos.
 */
export function anchorSection(
  text: string,
  pattern: RegExp,
  windowLength = 240,
): AnchoredSection | null {
  const match = text.match(pattern)
  if (!match || match.index === undefined) return null
  const start = match.index + match[0].length
  return { match, window: text.slice(start, start + windowLength) }
}

/**
 * Digitos que siguen a una etiqueta DENTRO de una ventana ya acotada.
 *
 * Solo se aceptan digitos separados por espacios —la Cruz Roja y Boyaca
 * pintan `7 6 6 0`, un digito por elemento— y la tirada se corta en la
 * primera letra. El resultado se acepta solo si mide exactamente `count`:
 * una tirada mas larga significa que la etiqueta ya no manda sobre lo que
 * viene detras, y entonces se prefiere fallar a adivinar.
 */
export function labeledDigits(
  window: string,
  label: RegExp,
  count: number,
  from = 0,
): { value: string; index: number } | null {
  const scoped = window.slice(from)
  const match = scoped.match(label)
  if (!match || match.index === undefined) return null
  const start = match.index + match[0].length
  const run = scoped.slice(start).match(/^[\s]*[0-9](?:[\s]*[0-9])*/)
  if (!run) return null
  const digits = run[0].replace(/\D/g, '')
  if (digits.length !== count) return null
  return { value: digits, index: from + start + run[0].length }
}

export function parseSpanishDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso?.[1] && iso[2] && iso[3]) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const numeric = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](20\d{2})\b/)
  if (numeric?.[1] && numeric[2] && numeric[3]) {
    return `${numeric[3]}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`
  }

  const months: Record<string, string> = {
    enero: '01',
    febrero: '02',
    marzo: '03',
    abril: '04',
    mayo: '05',
    junio: '06',
    julio: '07',
    agosto: '08',
    septiembre: '09',
    setiembre: '09',
    octubre: '10',
    noviembre: '11',
    diciembre: '12',
  }
  const named = text.match(
    /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(20\d{2})/i,
  )
  if (named) {
    const day = named[1]
    const monthName = named[2]?.toLowerCase()
    const year = named[3]
    const month = monthName ? months[monthName] : undefined
    if (!day || !month || !year) return null
    return `${year}-${month}-${day.padStart(2, '0')}`
  }
  return null
}
