import { readZipEntries } from './zip'

function decodeXml(xml: string): string {
  return xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<t(?: xml:space="preserve")?>([^<]*)<\/t>/g)].map((m) =>
    decodeXml(m[1] ?? '').replace(/\s+/g, ' ').trim(),
  )
}

function colIndex(col: string): number {
  let n = 0
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export type XlsxSheet = { name: string; rows: string[][] }

export function parseXlsxWorkbook(bytes: Uint8Array): XlsxSheet[] {
  const zip = readZipEntries(bytes)
  const workbook = zip.get('xl/workbook.xml')
  const rels = zip.get('xl/_rels/workbook.xml.rels')
  const sst = zip.get('xl/sharedStrings.xml')
  if (!workbook || !rels) {
    throw new Error('El xlsx no trae workbook.')
  }

  const strings = sst ? sharedStrings(sst.toString('utf8')) : []
  const relMap = new Map<string, string>()
  for (const m of rels.toString('utf8').matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    const id = m[1]
    const target = m[2]
    if (!id || !target) continue
    relMap.set(id, target.replace(/^\//, '').replace(/^\.\.\//, 'xl/'))
  }
  for (const m of rels.toString('utf8').matchAll(/Target="([^"]+)"[^>]*Id="([^"]+)"/g)) {
    const target = m[1]
    const id = m[2]
    if (!id || !target || relMap.has(id)) continue
    relMap.set(id, target.replace(/^\/?/, ''))
  }

  const sheets: XlsxSheet[] = []
  for (const m of workbook
    .toString('utf8')
    .matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const name = m[1]
    const rid = m[2]
    if (!name || !rid) continue
    const target = relMap.get(rid)
    if (!target) continue
    const path = target.startsWith('xl/') ? target : `xl/${target}`
    const sheetXml = zip.get(path)
    if (!sheetXml) continue
    sheets.push({ name: decodeXml(name), rows: parseSheet(sheetXml.toString('utf8'), strings) })
  }
  return sheets
}

function parseSheet(xml: string, strings: string[]): string[][] {
  const rows: string[][] = []
  for (const row of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const index = Number(row[1]) - 1
    const body = row[2]
    if (!body) continue
    const cells: string[] = []
    for (const c of body.matchAll(
      /<c r="([A-Z]+)(\d+)"([^>]*)>(?:<is><t(?: xml:space="preserve")?>([^<]*)<\/t><\/is>|<v>([^<]*)<\/v>)?/g,
    )) {
      const ref = c[1]
      if (!ref) continue
      const col = colIndex(ref)
      const inline = c[4]
      const raw = c[5] ?? ''
      const attrs = c[3] ?? ''
      if (inline !== undefined) {
        cells[col] = decodeXml(inline).replace(/\s+/g, ' ').trim()
      } else if (attrs.includes('t="s"')) {
        cells[col] = strings[Number(raw)] ?? ''
      } else {
        cells[col] = raw
      }
    }
    rows[index] = cells
  }
  return rows
}
