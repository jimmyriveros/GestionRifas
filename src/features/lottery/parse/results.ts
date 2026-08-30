import type { LotteryCode } from '../constants'
import type { AdapterFail, NormalizedLotteryResult } from '../types'
import { digitsAfterLabel, fieldAfterLabel, parseSpanishDate, stripTags } from './html'

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

export function extractMetaResult(html: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(html)
  if (!/loter[ií]a del meta/i.test(text) && !/sorteo\s+\d{3,}/i.test(text)) {
    return fail('structure_changed', 'La pagina no identifica la Loteria del Meta.')
  }
  const draw = text.match(/sorteo\s+(\d{3,6})/i)?.[1]
  const date = parseSpanishDate(text)
  const number = fieldAfterLabel(html, /n[uú]mero(?!\s*de sorteo)/i, /(\d{4})/) ?? digitsAfterLabel(html, /n[uú]mero/i, 4)
  const series = fieldAfterLabel(html, /serie/i, /(\d{2,4})/)
  if (!draw || !date || !number) {
    return fail('ambiguous', 'No se pudo asociar sorteo, fecha y numero mayor de Meta.')
  }
  return result('meta', draw, date, number, series)
}

export function extractCruzRojaResult(html: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(html)
  if (!/cruz roja/i.test(text) && !/sorteo/i.test(text)) {
    return fail('structure_changed', 'La pagina no identifica la Loteria de la Cruz Roja.')
  }
  const draw = text.match(/sorteo\s+(\d{3,6})/i)?.[1]
  const date = parseSpanishDate(text)
  const number =
    digitsAfterLabel(html, /premio mayor/i, 4) ??
    digitsAfterLabel(html, /ganador\s+premio mayor/i, 4)
  const series = fieldAfterLabel(html, /serie/i, /(\d{2,4})/)
  if (!draw || !date || !number) {
    return fail('ambiguous', 'No se pudo asociar sorteo, fecha y numero mayor de Cruz Roja.')
  }
  return result('cruz_roja', draw, date, number, series)
}

export function extractMedellinResult(html: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(html)
  if (/extra de la medell/i.test(text) && !/sorteo n[uú]mero\s+\d{3,4}\s+del/i.test(text)) {
    return fail('not_ordinary', 'La pagina solo muestra el sorteo extraordinario.')
  }
  const matches = [
    ...text.matchAll(
      /sorteo n[uú]mero\s+(\d{3,4})\s+del\s+(\d{1,2}\s+de\s+[a-z]+\s+de\s+20\d{2})/gi,
    ),
  ]
  const ordinary = matches.find((m) => Number(m[1]) >= 100)
  if (!ordinary) {
    if (matches.length > 0) {
      return fail('not_ordinary', 'El sorteo extraido parece extraordinario.')
    }
    return fail('structure_changed', 'No aparece el sorteo ordinario de Medellin.')
  }
  const date = parseSpanishDate(ordinary[2] ?? '')
  const heading = ordinary[0] ?? ''
  const start = (ordinary.index ?? 0) + heading.length
  const after = text.slice(start, start + 160)
  // El encabezado es "Sorteo número 4850": no reutilizar ese "número" como premio mayor.
  const number = after.match(/n[uú]mero\s+(\d{4})/i)?.[1]
  const series = after.match(/serie\s+(\d{2,4})/i)?.[1] ?? null
  if (!date || !number || !ordinary[1]) {
    return fail('ambiguous', 'No se pudo asociar fecha y numero mayor de Medellin.')
  }
  return result('medellin', ordinary[1], date, number, series)
}

export function extractBoyacaResult(html: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(html)
  const draw = text.match(/resultado sorteo\s*#\s*(\d{3,6})/i)?.[1]
  const date = parseSpanishDate(text)
  const number = digitsAfterLabel(html, /n[uú]mero ganador/i, 4)
  const series = digitsAfterLabel(html, /\bserie\b/i, 3)
  if (!draw || !date || !number) {
    return fail('ambiguous', 'No se pudo asociar sorteo, fecha y numero mayor de Boyaca.')
  }
  return result('boyaca', draw, date, number, series)
}

export function extractCundinamarcaResult(input: string): NormalizedLotteryResult | AdapterFail {
  const trimmed = input.trim()
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as {
        data?: {
          draw?: { number?: string; date?: string }
          prizes?: { name?: string; number?: string; serie?: string }[]
        }
        prizes?: { name?: string; number?: string; serie?: string }[]
        drawNumber?: string
        date?: string
        winningNumber?: string
        series?: string
      }
      const prizes = json.data?.prizes ?? json.prizes
      const mayor = prizes?.find((p) => /mayor/i.test(p.name ?? ''))
      const draw = json.data?.draw?.number ?? json.drawNumber
      const date = json.data?.draw?.date ?? json.date
      const number = mayor?.number ?? json.winningNumber
      const series = mayor?.serie ?? json.series ?? null
      if (!draw || !date || !number) {
        return fail('ambiguous', 'El JSON oficial no trae sorteo, fecha y numero mayor.')
      }
      const iso = parseSpanishDate(String(date)) ?? String(date).slice(0, 10)
      return result('cundinamarca', String(draw), iso, String(number), series ? String(series) : null)
    } catch {
      return fail('parse_error', 'El JSON de Cundinamarca no se pudo leer.')
    }
  }

  const text = stripTags(input)
  if (!/cundinamarca/i.test(text) && !/sorteo/i.test(text)) {
    return fail('structure_changed', 'La pagina no identifica la Loteria de Cundinamarca.')
  }
  const draw = text.match(/sorteo\s*(?:n[uú]mero\s*)?(?:#\s*)?(\d{3,6})/i)?.[1]
  const date = parseSpanishDate(text)
  const number =
    digitsAfterLabel(input, /premio mayor/i, 4) ?? fieldAfterLabel(input, /n[uú]mero/i, /(\d{4})/)
  const series = fieldAfterLabel(input, /serie/i, /(\d{2,4})/)
  if (!draw || !date || !number) {
    return fail(
      'ambiguous',
      'Cundinamarca no publico el resultado en HTML; la SPA vacia no se inventa.',
    )
  }
  return result('cundinamarca', draw, date, number, series)
}

export function extractBogotaResult(html: string): NormalizedLotteryResult | AdapterFail {
  const text = stripTags(html)
  if (!/loter[ií]a de bogot/i.test(text) && !/sorteo/i.test(text)) {
    return fail('structure_changed', 'La pagina no identifica la Loteria de Bogota.')
  }
  const draw = text.match(/sorteo\s*(?:n[uú]mero\s*)?(?:#\s*)?(\d{3,6})/i)?.[1]
  const date = parseSpanishDate(text)
  const number =
    digitsAfterLabel(html, /premio mayor/i, 4) ?? fieldAfterLabel(html, /n[uú]mero/i, /(\d{4})/)
  const series = fieldAfterLabel(html, /serie/i, /(\d{2,4})/)
  if (!draw || !date || !number) {
    return fail('ambiguous', 'No se pudo asociar sorteo, fecha y numero mayor de Bogota.')
  }
  return result('bogota', draw, date, number, series)
}
