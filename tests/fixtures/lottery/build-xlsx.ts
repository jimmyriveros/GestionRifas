import { writeZip } from '@/features/lottery/parse/zip'

function cell(ref: string, value: string | number): string {
  if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function rowXml(r: number, values: Array<string | number>): string {
  const body = values
    .map((value, i) => cell(`${String.fromCharCode(65 + i)}${r}`, value))
    .join('')
  return `<row r="${r}">${body}</row>`
}

function sheetXml(rows: Array<Array<string | number>>): string {
  const body = rows.map((row, i) => rowXml(i + 1, row)).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

/** Serial Excel para una fecha ISO, identico al del parser. */
export function isoToExcelSerial(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return (Date.UTC(y!, m! - 1, d!) - Date.UTC(1899, 11, 30)) / 86_400_000
}

export const EXCEL_TIME = {
  h2315: 23.25 / 24,
  h2300: 23 / 24,
  h2255: (22 * 60 + 55) / (24 * 60),
  h2230: 22.5 / 24,
  h2000: 20 / 24,
} as const

const HEADER = [
  'Lotería',
  'Número de Sorteo',
  'Día de Sorteo',
  'Fecha de Sorteo',
  'Hora de Sorteo',
  'Acuerdo',
  'Acuerdo Modificatorio',
]

export function buildCnjsaOrdinariosXlsx(ordinaryRows: Array<Array<string | number>>): Uint8Array {
  const extra = [
    ['OPERADOR', 'Núm. De Sorteo', 'Fecha de Sorteo'],
    ['Sorteo Extraordinario de Colombia', '0013', isoToExcelSerial('2026-01-10')],
  ]
  return writeZip({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="Extraordinarios" sheetId="1" r:id="rId1"/>
<sheet name="Ordinarios" sheetId="2" r:id="rId2"/>
</sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`,
    'xl/worksheets/sheet1.xml': sheetXml(extra),
    'xl/worksheets/sheet2.xml': sheetXml([HEADER, ...ordinaryRows]),
  })
}
