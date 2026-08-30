/**
 * Ayudas para extraer campos ETIQUETADOS. Nunca se toman "los primeros cuatro
 * digitos" de una pagina (ResultadosLoterias §12).
 */

export function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripTags(html: string): string {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '))
}

export function looksLikeCloudflareChallenge(html: string): boolean {
  const t = html.toLowerCase()
  return (
    t.includes('just a moment') ||
    t.includes('cf-browser-verification') ||
    t.includes('cdn-cgi/challenge') ||
    t.includes('imunify-bot-check') ||
    t.includes('imunify360')
  )
}

/** Concatena digitos sueltos que siguen a una etiqueta, p. ej. 7 6 6 0 -> 7660. */
export function digitsAfterLabel(html: string, label: RegExp, count: number): string | null {
  const text = stripTags(html)
  const match = text.match(label)
  if (!match || match.index === undefined) return null
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + 80)
  const digits = after.replace(/\D/g, '')
  if (digits.length < count) return null
  return digits.slice(0, count)
}

export function fieldAfterLabel(html: string, label: RegExp, value: RegExp): string | null {
  const text = stripTags(html)
  const match = text.match(label)
  if (!match || match.index === undefined) return null
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + 120)
  const valueMatch = after.match(value)
  return valueMatch ? valueMatch[1] ?? valueMatch[0] : null
}

export function parseSpanishDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso?.[1] && iso[2] && iso[3]) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const numeric = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/)
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
