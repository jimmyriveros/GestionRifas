import type { AdapterFail, NormalizedLotteryResult } from '../types'

import { extractPdfText, PdfUnsupportedError, type PdfLine } from './pdf'
import { parseSpanishDate } from './html'

/**
 * Lectura del acta oficial de resultados de la Loteria de Cundinamarca
 * (D-153, BR-L23).
 *
 * POR QUE EL ACTA Y NO LA PAGINA
 *
 * La pagina de resultados es una SPA cuyo HTML inicial es `<app-root></app-root>`
 * y el unico API publico del sitio es `/api/v1/result/public`, que segun el
 * propio codigo del sitio recibe `drawNumber`, `number` y `serie`: es un
 * VERIFICADOR DE BILLETES, no un descubridor del numero ganador —y ademas su
 * certificado esta vencido—. El acta en PDF es la unica publicacion oficial
 * que contiene el resultado (I-081, I-085).
 *
 * LA REGLA QUE MANDA AQUI: ANTE LA DUDA, NO SE PUBLICA
 *
 * Solo se acepta una fila **inequivoca** de PREMIO MAYOR. Si hay dos filas con
 * numeros distintos, si el sorteo del acta no es el que se pidio, o si el
 * numero no son cuatro digitos, el resultado NO se publica y se registra el
 * motivo. Nunca se deduce un numero de «los primeros cuatro digitos» de una
 * pagina.
 *
 * Los ceros iniciales se conservan porque el numero viaja como TEXTO de punta
 * a punta: `0046` no es `46` (BR-L06).
 */

/** Ni una tilde ni una mayuscula estorban a la busqueda de la etiqueta. */
function foldAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function fail(code: AdapterFail['code'], message: string): AdapterFail {
  return { ok: false, code, message }
}

export type ActaCandidate = {
  winningNumber: string
  series: string | null
}

/**
 * Busca la fila de PREMIO MAYOR sobre el texto SIN espacios de cada linea.
 * El generador del PDF puede partir «PREMIO MAYOR» en varios fragmentos, y
 * la version compacta es inmune a eso.
 */
export function findPremioMayorRows(lines: PdfLine[]): ActaCandidate[] {
  const found: ActaCandidate[] = []
  for (const line of lines) {
    const compact = foldAccents(line.compact)
    if (!compact.includes('PREMIOMAYOR')) continue
    // Un «seco» o un «premio mayor del sorteo extraordinario» no cuentan.
    if (/\bSECO/.test(compact) && compact.indexOf('SECO') < compact.indexOf('PREMIOMAYOR')) continue

    const after = compact.slice(compact.indexOf('PREMIOMAYOR') + 'PREMIOMAYOR'.length)
    const number = after.match(/^[^0-9]{0,24}(\d{4})(?![0-9])/)?.[1]
    if (!number) continue
    const series = after.match(/SERIE[^0-9]{0,6}(\d{2,3})(?![0-9])/)?.[1] ?? null
    found.push({ winningNumber: number, series })
  }
  return found
}

export function findActaDrawNumber(lines: PdfLine[]): string | null {
  for (const line of lines) {
    const compact = foldAccents(line.compact)
    const match = compact.match(/SORTEO(?:N[O°.]?|NUMERO)?[^0-9]{0,4}(\d{3,6})(?![0-9])/)
    if (match?.[1]) return match[1]
  }
  return null
}

export function findActaDate(lines: PdfLine[]): string | null {
  for (const line of lines) {
    const iso = parseSpanishDate(line.text)
    if (iso) return iso
  }
  return null
}

export type ActaExpectation = {
  /** Sorteo que la programacion oficial dice que debe traer este acta. */
  drawNumber: string
}

/**
 * Convierte el PDF del acta en un resultado normalizado, o en el motivo
 * exacto por el que no se puede publicar.
 */
export function extractCundinamarcaActa(
  bytes: Uint8Array,
  expected: ActaExpectation,
): NormalizedLotteryResult | AdapterFail {
  let extraction
  try {
    extraction = extractPdfText(bytes)
  } catch (error) {
    if (error instanceof PdfUnsupportedError) {
      return fail('unsupported_type', error.message)
    }
    return fail('parse_error', 'El acta oficial no se pudo leer como PDF.')
  }

  if (extraction.textOperators === 0) {
    return fail(
      'scanned_document',
      'El acta oficial es un PDF escaneado: no contiene texto que leer. No se hace OCR.',
    )
  }

  const rows = findPremioMayorRows(extraction.lines)
  if (rows.length === 0) {
    return fail('ambiguous', 'El acta no trae una fila de PREMIO MAYOR legible.')
  }

  const numbers = new Set(rows.map((row) => row.winningNumber))
  if (numbers.size > 1) {
    return fail(
      'ambiguous',
      'El acta trae mas de un PREMIO MAYOR distinto. No se elige uno por cuenta propia.',
    )
  }

  const row = rows[0]
  if (!row) {
    return fail('ambiguous', 'El acta no trae una fila de PREMIO MAYOR legible.')
  }

  const drawNumber = findActaDrawNumber(extraction.lines)
  if (!drawNumber) {
    return fail('ambiguous', 'El acta no identifica el numero de sorteo.')
  }
  if (drawNumber !== expected.drawNumber) {
    return fail(
      'ambiguous',
      `El acta corresponde al sorteo ${drawNumber} y se esperaba el ${expected.drawNumber}.`,
    )
  }

  const officialDate = findActaDate(extraction.lines)
  if (!officialDate) {
    return fail('ambiguous', 'El acta no trae una fecha inequivoca.')
  }

  return {
    lotteryCode: 'cundinamarca',
    drawNumber,
    officialDate,
    winningNumber: row.winningNumber,
    series: row.series,
    sourceKind: 'official_act',
    // Evidencia ESTRUCTURADA y minima: ni el PDF ni su texto (BR-L23).
    evidence: {
      prize_label: 'PREMIO MAYOR',
      acta_pages: extraction.pages,
      acta_text_operators: extraction.textOperators,
      acta_premio_mayor_rows: rows.length,
    },
  }
}
