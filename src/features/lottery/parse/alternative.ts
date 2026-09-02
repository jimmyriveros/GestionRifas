/**
 * Lectores de las fuentes ALTERNATIVAS (D-162, BR-L26).
 *
 * Mismo principio que `results.ts` y por el mismo motivo (I-088): un campo se
 * lee dentro del BLOQUE de su loteria, nunca buscando cifras sueltas en la
 * pagina. Aqui el anclaje es ESTRUCTURAL —la fila o la tarjeta de la
 * loteria— porque estas paginas separan las loterias por marcado, no por un
 * encabezado con sorteo y fecha.
 *
 * La trampa que obliga a leer la estructura, y no el texto plano: Perlatodo
 * publica DOS tablas con la misma pinta. La primera son resultados; la
 * segunda se titula «DEMORADOS - PEPAS» y sus columnas son
 * `Loteria/Sorteo | Demorados | Fecha Ultimo Resultado`. Sus cifras NO son
 * premios mayores: comprobado el 2026-09-02, esa tabla daba `7130` para
 * Medellin del 28 de agosto cuando el premio mayor oficial de ese sorteo es
 * `2608`, y `1789` para Boyaca cuando el oficial es `7660`. Se distinguen por
 * la clase del elemento: `balotera-home` es resultado y `balotera-home-dem`
 * es demorado. Leer la segunda habria publicado numeros inventados con la
 * fecha correcta, que es justo el fallo de I-088.
 */
import { LOTTERY_CODES, type LotteryCode } from '../constants'
import { OPERATOR_NAME_TO_CODE } from '../sources'
import { decodeHtml, parseSpanishDate } from './html'

/** Una lectura suelta: una loteria, una fecha y un numero, sin juzgar. */
export type AlternativeObservation = {
  lotteryCode: LotteryCode
  /** Fecha del sorteo segun la fuente, `YYYY-MM-DD`. */
  officialDate: string
  winningNumber: string
  series: string | null
  /** Numero de sorteo, solo si la fuente lo publica. Nunca se inventa. */
  drawNumber: string | null
}

const FOUR_DIGITS = /^[0-9]{4}$/

function lotteryFromName(name: string): LotteryCode | null {
  const clean = decodeHtml(name)
  // Un nombre puede contener otro: «Lotería de Bogotá» y «Bogotá» conviven con
  // muchos chances regionales. Se exige que el patron del glosario acierte y
  // que NO acierte ninguno de los otros cinco, para no adjudicar una fila
  // ambigua a la loteria equivocada.
  const hits = OPERATOR_NAME_TO_CODE.filter((entry) => entry.pattern.test(clean))
  if (hits.length !== 1) return null
  const code = hits[0]?.code
  return code && (LOTTERY_CODES as readonly string[]).includes(code) ? code : null
}

function digitsFrom(html: string, pattern: RegExp): string {
  return [...html.matchAll(pattern)].map((match) => match[1] ?? '').join('')
}

/**
 * PERLATODO — `perlatodo.com/perla/resultados/`
 *
 * Cada resultado es una fila `<tr>` con tres celdas: nombre, baloteras y
 * fecha ISO. Solo cuentan los `div.balotera-home`; una fila cuyos digitos
 * esten en `div.balotera-home-dem` es de la tabla de demorados y se descarta
 * entera. No publica numero de sorteo.
 */
export function extractPerlatodoIndex(html: string): AlternativeObservation[] {
  const rows = [
    ...html.matchAll(
      /<tr>\s*<td>\s*([^<]{2,60}?)\s*<\/td>\s*<td>\s*<div class="cajon-baloteras">([\s\S]{0,800}?)<\/div>\s*<\/td>\s*<td>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/g,
    ),
  ]
  const out: AlternativeObservation[] = []
  for (const row of rows) {
    const lottery = lotteryFromName(row[1] ?? '')
    if (!lottery) continue
    const cell = row[2] ?? ''
    // La clase decide. Si la fila trae CUALQUIER digito de demorados, no es
    // una fila de resultado y no se mira mas.
    if (/balotera-home-dem/.test(cell) && !/class="balotera-home"/.test(cell)) continue
    const winningNumber = digitsFrom(cell, /<div class="balotera-home">(\d)<\/div>/g)
    if (!FOUR_DIGITS.test(winningNumber)) continue
    const officialDate = parseSpanishDate(row[3] ?? '')
    if (!officialDate) continue
    out.push({ lotteryCode: lottery, officialDate, winningNumber, series: null, drawNumber: null })
  }
  return out
}

/**
 * GANAR CHANCE — `ganarchance.com/resultado/{loteria}`
 *
 * La pagina de cada loteria trae «Tabla con los resultados de …» con las
 * ultimas cinco fechas: `Fecha | Numero | Serie`. La fecha es prosa en
 * español y viene en la misma fila que el numero, asi que el vinculo entre
 * los dos es inequivoco. No publica numero de sorteo.
 */
export function extractGanarChanceLottery(
  html: string,
  lottery: LotteryCode,
): AlternativeObservation[] {
  // Se acota por posicion, no con un cuantificador: entre el titulo y el
  // `<tbody>` hay un `<caption>` y un `<thead>` completos —469 caracteres en
  // la pagina real del Meta—, y un tope pequeño hacia fallar la lectura
  // entera sin decir por que.
  const titleAt = html.indexOf('Tabla con los resultados')
  if (titleAt < 0) return []
  const scope = html.slice(titleAt, titleAt + 8000)
  const body = scope.match(/<tbody>([\s\S]*?)<\/tbody>/)
  if (!body?.[1]) return []
  const rows = [
    ...body[1].matchAll(
      /<tr[^>]*>\s*<td>\s*([^<]{6,60}?)\s*<\/td>\s*<td>\s*(\d{3,4})\s*<\/td>\s*<td>\s*(\d{0,3})\s*<\/td>/g,
    ),
  ]
  const out: AlternativeObservation[] = []
  for (const row of rows) {
    const officialDate = parseSpanishDate(row[1] ?? '')
    const winningNumber = row[2] ?? ''
    if (!officialDate || !FOUR_DIGITS.test(winningNumber)) continue
    out.push({
      lotteryCode: lottery,
      officialDate,
      winningNumber,
      series: row[3] ? row[3] : null,
      drawNumber: null,
    })
  }
  return out
}

/**
 * GANAR CHANCE — portada `ganarchance.com/resultados-loterias-colombia`
 *
 * La portada agrupa por dia con un `<h2>` que trae la fecha completa
 * («Resultados de ayer martes 1 de septiembre de 2026»), y debajo las
 * tarjetas `.flex-item`. La fecha es de la SECCION, asi que cada tarjeta se
 * lee dentro de la seccion que la contiene y nunca despues del `<h2>`
 * siguiente.
 */
export function extractGanarChanceIndex(html: string): AlternativeObservation[] {
  const sections = [...html.matchAll(/<h2[^>]*>([\s\S]{0,200}?)<\/h2>([\s\S]{0,20000}?)(?=<h2|$)/g)]
  const out: AlternativeObservation[] = []
  for (const section of sections) {
    const officialDate = parseSpanishDate(decodeHtml(section[1] ?? ''))
    if (!officialDate) continue
    const items = [
      ...(section[2] ?? '').matchAll(
        /<div class="flex-item">\s*<div class="nombre">\s*([\s\S]{2,60}?)\s*<\/div>\s*<div class="numero">\s*(\d{4})\s*(?:<span class="serie">\s*(\d{1,3})\s*<\/span>)?/g,
      ),
    ]
    for (const item of items) {
      const lottery = lotteryFromName(item[1] ?? '')
      const winningNumber = item[2] ?? ''
      if (!lottery || !FOUR_DIGITS.test(winningNumber)) continue
      out.push({
        lotteryCode: lottery,
        officialDate,
        winningNumber,
        series: item[3] ?? null,
        drawNumber: null,
      })
    }
  }
  return out
}

/**
 * LOTERIAS DE HOY — `loteriasdehoy.com/{slug}` y su portada
 *
 * La fuente mas rica: cada bloque `.juego` trae nombre, fecha, los cuatro
 * digitos uno por elemento, la serie y —lo importante— el NUMERO DE SORTEO.
 * Con el, la observacion se puede contrastar contra el cronograma CNJSA en
 * vez de fiarse solo de la fecha.
 */
export function extractLoteriasDeHoy(html: string): AlternativeObservation[] {
  // Se parte por el marcador en vez de acotar con un cuantificador: el ultimo
  // bloque de una pagina por loteria llega hasta el final del documento —12.632
  // caracteres en la del Meta— y ningun tope razonable lo cubre. Partir da
  // ademas la garantia que importa: un campo no puede venir del bloque vecino.
  const chunks = html.split('<div class="juego">').slice(1)
  const out: AlternativeObservation[] = []
  for (const chunk of chunks) {
    const heading = chunk.match(/^<h3>([\s\S]{2,120}?)<\/h3>/)
    if (!heading) continue
    const lottery = lotteryFromName(heading[1] ?? '')
    if (!lottery) continue
    const body = chunk.slice(heading[0].length)
    const officialDate = parseSpanishDate(
      decodeHtml((body.match(/<span class="fecha-resultado">([^<]*)<\/span>/) ?? [])[1] ?? ''),
    )
    if (!officialDate) continue
    const four = (body.match(/<div class="cuatro-cifras">([\s\S]{0,600}?)<\/div>\s*<div/) ?? [])[1]
    const winningNumber = digitsFrom(four ?? '', /<i class="num">(\d)<\/i>/g)
    if (!FOUR_DIGITS.test(winningNumber)) continue
    const serieBlock = (body.match(/<div class="serie">([\s\S]{0,600}?)<\/div>\s*<\/div>/) ?? [])[1]
    const series = digitsFrom(serieBlock ?? '', /<i class="num">(\d)<\/i>/g)
    const drawNumber = (body.match(/<span class="sorteo">\s*Sorteo\s*(\d{1,6})/) ?? [])[1] ?? null
    out.push({
      lotteryCode: lottery,
      officialDate,
      winningNumber,
      series: series.length === 3 ? series : null,
      drawNumber,
    })
  }
  return out
}
