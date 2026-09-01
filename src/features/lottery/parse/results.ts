import type { LotteryCode } from '../constants'
import type { AdapterFail, NormalizedLotteryResult } from '../types'
import { anchorSection, labeledDigits, parseSpanishDate, stripTags } from './html'

/**
 * Extractores de las paginas oficiales de resultados.
 *
 * Todos siguen la MISMA forma, y la razon esta en D-154: hasta la etapa 3/6
 * cada campo se buscaba por separado en la pagina entera, de modo que un
 * numero de cuatro cifras encontrado en cualquier sitio —incluida una hoja de
 * estilos— podia publicarse como numero mayor. Ahora:
 *
 *   1. Se ancla en un encabezado que trae SORTEO y FECHA juntos. Ese
 *      encabezado identifica el bloque de resultado; una hoja de estilos o un
 *      desplegable de fechas anteriores no lo reproduce.
 *   2. El numero mayor y la serie se leen dentro de la ventana que sigue a ese
 *      encabezado, por su etiqueta, y la serie se busca DESPUES del numero
 *      mayor para no confundirla con la de un seco.
 *   3. Si algo no encaja, se falla. No se completa con lo que haya cerca.
 *
 * La fecha sale SIEMPRE del propio encabezado, nunca de la pagina entera: la
 * de Boyaca lista decenas de fechas anteriores en un desplegable y la de
 * Medellin trae `08-05-2024` en un comentario de Elementor.
 */

function fail(code: AdapterFail['code'], message: string): AdapterFail {
  return { ok: false, code, message }
}

function result(
  lotteryCode: LotteryCode,
  drawNumber: string,
  officialDate: string,
  winningNumber: string,
  series: string | null,
): NormalizedLotteryResult {
  return {
    lotteryCode,
    drawNumber,
    officialDate,
    winningNumber,
    series,
    sourceKind: 'official_page',
  }
}

/** Numero mayor y serie de una ventana ya anclada. La serie va detras. */
function prizeAndSeries(
  window: string,
  prizeLabel: RegExp,
): { winningNumber: string; series: string | null } | null {
  const prize = labeledDigits(window, prizeLabel, 4)
  if (!prize) return null
  const series = labeledDigits(window, /serie/i, 3, prize.index)
  return { winningNumber: prize.value, series: series?.value ?? null }
}

/**
 * Meta. Encabezado real del 2026-09-01: «Sorteo 3313 26/08/2026 Número 8134
 * Serie 096», seguido de la tabla de secos con la misma pareja de etiquetas.
 */
const META_ANCHOR = /sorteo\s+(\d{3,6})\s+(\d{1,2}\/\d{1,2}\/20\d{2})/i

export function extractMetaResult(html: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(html)
  if (!/loter[ií]a del meta/i.test(text) && !/sorteo\s+\d{3,}/i.test(text)) {
    return fail('structure_changed', 'La pagina no identifica la Loteria del Meta.')
  }
  const section = anchorSection(text, META_ANCHOR)
  if (!section) {
    return fail('structure_changed', 'No aparece el encabezado con sorteo y fecha del Meta.')
  }
  const draw = section.match[1]
  const date = parseSpanishDate(section.match[2] ?? '')
  const prize = prizeAndSeries(section.window, /n[uú]mero/i)
  if (!draw || !date || !prize) {
    return fail('ambiguous', 'No se pudo asociar sorteo, fecha y numero mayor de Meta.')
  }
  return result('meta', draw, date, prize.winningNumber, prize.series)
}

/**
 * Cruz Roja. La portada trae el mismo resultado dos veces: «SORTEO 3 1 6 8
 * FECHA 25/08/2026 …» —un digito por elemento— y «SORTEO 3168 DEL 25/08/2026
 * …». El anclaje admite las dos y junta los digitos del sorteo.
 */
const CRUZ_ROJA_ANCHOR = /sorteo\s+([\d\s]{1,12}?)\s*(?:del|fecha)\s+(\d{1,2}\/\d{1,2}\/20\d{2})/i

export function extractCruzRojaResult(html: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(html)
  if (!/cruz roja/i.test(text)) {
    return fail('structure_changed', 'La pagina no identifica la Loteria de la Cruz Roja.')
  }
  const section = anchorSection(text, CRUZ_ROJA_ANCHOR)
  if (!section) {
    return fail('structure_changed', 'No aparece el encabezado con sorteo y fecha de Cruz Roja.')
  }
  const draw = section.match[1]?.replace(/\D/g, '')
  const date = parseSpanishDate(section.match[2] ?? '')
  // «GANADOR SECO 200 MILLONES» viene detras: la etiqueta es «premio mayor».
  const prize = prizeAndSeries(section.window, /premio mayor/i)
  if (!draw || !date || !prize) {
    return fail('ambiguous', 'No se pudo asociar sorteo, fecha y numero mayor de Cruz Roja.')
  }
  return result('cruz_roja', draw, date, prize.winningNumber, prize.series)
}

/**
 * Medellin. La misma pagina publica el sorteo ordinario y el «Extra de la
 * Medellin», con la misma estructura. El ordinario se distingue por su
 * numeracion, muy alta; el extra iba por el 0018 el 2026-09-01.
 */
const MEDELLIN_ANCHOR =
  /sorteo n[uú]mero\s+(\d{3,6})\s+del\s+(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+20\d{2})/gi

export function extractMedellinResult(html: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(html)
  const matches = [...text.matchAll(MEDELLIN_ANCHOR)]
  const ordinary = matches.find((m) => Number(m[1]) >= 100)
  if (!ordinary) {
    if (matches.length > 0) {
      return fail('not_ordinary', 'La pagina solo muestra el sorteo extraordinario.')
    }
    return fail('structure_changed', 'No aparece el sorteo ordinario de Medellin.')
  }
  const start = (ordinary.index ?? 0) + (ordinary[0]?.length ?? 0)
  const window = text.slice(start, start + 240)
  const date = parseSpanishDate(ordinary[2] ?? '')
  // El encabezado es «Sorteo número 4850»: no reutilizar ese «número».
  const prize = prizeAndSeries(window, /n[uú]mero/i)
  if (!date || !prize || !ordinary[1]) {
    return fail('ambiguous', 'No se pudo asociar fecha y numero mayor de Medellin.')
  }
  return result('medellin', ordinary[1], date, prize.winningNumber, prize.series)
}

/**
 * Boyaca. «Resultado sorteo #4639 Sábado 29 de agosto de 2026 Número Ganador
 * 7 6 6 0 Serie 3 9 3», precedido de un desplegable con decenas de fechas
 * anteriores en formato ISO: la fecha tiene que salir del encabezado.
 */
const BOYACA_ANCHOR =
  /resultado sorteo\s*#\s*(\d{3,6})\s+(?:[a-záéíóúñ]+\s+)?(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+20\d{2})/i

export function extractBoyacaResult(html: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(html)
  const section = anchorSection(text, BOYACA_ANCHOR)
  if (!section) {
    return fail('structure_changed', 'No aparece el encabezado con sorteo y fecha de Boyaca.')
  }
  const draw = section.match[1]
  const date = parseSpanishDate(section.match[2] ?? '')
  const prize = prizeAndSeries(section.window, /n[uú]mero ganador/i)
  if (!draw || !date || !prize) {
    return fail('ambiguous', 'No se pudo asociar sorteo, fecha y numero mayor de Boyaca.')
  }
  return result('boyaca', draw, date, prize.winningNumber, prize.series)
}

/**
 * La pagina publica de Cundinamarca. **No es la fuente automatica**: desde
 * D-153 el resultado se lee del acta oficial en PDF
 * (`parse/acta-cundinamarca.ts`). Esto se conserva porque el mapa de
 * extractores cubre las seis loterias, y porque deja escrito lo que pasa si
 * alguien vuelve a apuntar aqui: la SPA no trae el resultado y no se inventa.
 */
const CUNDINAMARCA_ANCHOR =
  /sorteo\s*(?:n[uú]mero\s*)?(?:#\s*)?(\d{3,6})\s+(?:del\s+)?(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+20\d{2}|\d{1,2}\/\d{1,2}\/20\d{2})/i

export function extractCundinamarcaResult(input: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(input)
  if (!/cundinamarca/i.test(text)) {
    return fail('structure_changed', 'La pagina no identifica la Loteria de Cundinamarca.')
  }
  const section = anchorSection(text, CUNDINAMARCA_ANCHOR)
  const draw = section?.match[1]
  const date = section ? parseSpanishDate(section.match[2] ?? '') : null
  const prize = section ? prizeAndSeries(section.window, /premio mayor/i) : null
  if (!draw || !date || !prize) {
    return fail(
      'ambiguous',
      'Cundinamarca no publico el resultado en HTML; la SPA vacia no se inventa.',
    )
  }
  return result('cundinamarca', draw, date, prize.winningNumber, prize.series)
}

/**
 * Bogota. Se conserva por la misma razon que Cundinamarca: el mapa cubre las
 * seis loterias. Hoy no se llega a ejecutar, porque el sitio entero responde
 * con un desafio de Cloudflare y su unico API de resultados exige un pase de
 * Turnstile (I-087). No se elude ninguno de los dos.
 */
const BOGOTA_ANCHOR =
  /sorteo\s*(?:n[uú]mero\s*)?(?:#\s*)?(\d{3,6})\s+(?:del\s+)?(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+20\d{2}|\d{1,2}\/\d{1,2}\/20\d{2})/i

export function extractBogotaResult(html: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(html)
  if (!/loter[ií]a de bogot/i.test(text)) {
    return fail('structure_changed', 'La pagina no identifica la Loteria de Bogota.')
  }
  const section = anchorSection(text, BOGOTA_ANCHOR)
  if (!section) {
    return fail('structure_changed', 'No aparece el encabezado con sorteo y fecha de Bogota.')
  }
  const draw = section.match[1]
  const date = parseSpanishDate(section.match[2] ?? '')
  const prize = prizeAndSeries(section.window, /premio mayor/i)
  if (!draw || !date || !prize) {
    return fail('ambiguous', 'No se pudo asociar sorteo, fecha y numero mayor de Bogota.')
  }
  return result('bogota', draw, date, prize.winningNumber, prize.series)
}
