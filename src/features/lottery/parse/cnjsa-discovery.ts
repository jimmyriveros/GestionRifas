import type { CnjsaDiscoveredDocument, CnjsaDocumentKind } from '../types'

function decodeHref(href: string): string {
  return href.replace(/&amp;/g, '&')
}

function absoluteHref(href: string, base: string): string {
  try {
    return new URL(decodeHref(href), base).href
  } catch {
    return decodeHref(href)
  }
}

export function classifyCnjsaTitle(title: string): CnjsaDocumentKind {
  const t = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const extra = t.includes('extraordinar')
  const ordinary = t.includes('ordinar')
  if (t.includes('lineamiento') && extra) return 'extraordinary'
  if (extra && ordinary && t.includes('cronograma')) return 'consolidated'
  if (extra && !ordinary) return 'extraordinary'
  if (ordinary) return 'ordinary_acuerdo'
  if (t.includes('cronograma') && t.includes('sorteo')) return 'consolidated'
  return 'other'
}

export function discoverCnjsaDocuments(html: string, pageUrl: string): CnjsaDiscoveredDocument[] {
  const docs: CnjsaDiscoveredDocument[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const hrefRaw = match[1]
    const titleRaw = match[2]
    if (!hrefRaw || !titleRaw) continue
    const href = absoluteHref(hrefRaw, pageUrl)
    const title = titleRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!title || !/sorteo|acuerdo|cronograma|ordinar|extraordinar/i.test(title)) continue
    if (!/loader\.php|descargar|idFile|\.xlsx|\.xls|\.pdf/i.test(href + title)) continue
    if (seen.has(href)) continue
    seen.add(href)
    docs.push({ title, href, kind: classifyCnjsaTitle(title) })
  }
  return docs
}

/** Elige el xlsx consolidado vigente; no fija un idFile. */
export function selectConsolidatedWorkbook(
  docs: CnjsaDiscoveredDocument[],
  year: number,
): CnjsaDiscoveredDocument | null {
  const yearStr = String(year)
  const candidates = docs.filter(
    (d) =>
      d.kind === 'consolidated' &&
      d.title.includes(yearStr) &&
      !/lineamiento/i.test(d.title),
  )
  const xlsx = candidates.find((d) => /\.xlsx|xlsx|cronograma de sorteos ordinarios y extraordinarios/i.test(d.title + d.href))
  return xlsx ?? candidates[0] ?? null
}
