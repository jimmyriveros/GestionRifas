import { deflateSync } from 'node:zlib'

/**
 * Constructor de PDF mínimos para las pruebas del acta de Cundinamarca
 * (D-153). Sigue el mismo criterio que `build-xlsx.ts`: se **fabrica** una
 * estructura representativa en vez de commitear el documento de un tercero.
 *
 * Los PDF que salen de aquí son válidos —cabecera, objetos, `xref`, `trailer`
 * y `%%EOF`—, así que la prueba ejerce el lector de verdad y no una cadena
 * de texto disfrazada.
 */

function escapeLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/** Cada elemento es una línea; una cadena se dibuja con `Tj`. */
export type PdfTextRow = string | { fragments: string[] } | { hex: string } | { tj: string[] }

function rowOperators(row: PdfTextRow): string {
  if (typeof row === 'string') return `(${escapeLiteral(row)}) Tj`
  if ('fragments' in row) {
    // Varios `Tj` en la misma línea: así parte el texto un generador real.
    return row.fragments.map((f) => `(${escapeLiteral(f)}) Tj`).join(' ')
  }
  if ('hex' in row) {
    return `<${Buffer.from(row.hex, 'latin1').toString('hex')}> Tj`
  }
  // Arreglo `TJ` con un ajuste grande entre fragmentos: eso es un espacio.
  const parts = row.tj.map((f) => `(${escapeLiteral(f)})`).join(' -300 ')
  return `[${parts}] TJ`
}

function buildObjects(objects: string[]): Uint8Array {
  const header = '%PDF-1.7\n'
  let body = ''
  const offsets: number[] = []
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(header.length + body.length)
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefAt = header.length + body.length
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return new Uint8Array(Buffer.from(header + body + xref + trailer, 'latin1'))
}

function contentObject(stream: string, compress: boolean): string {
  if (!compress) {
    return `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
  }
  const packed = deflateSync(Buffer.from(stream, 'latin1')).toString('latin1')
  return `<< /Length ${packed.length} /Filter /FlateDecode >>\nstream\n${packed}\nendstream`
}

/** PDF de una página con capa de texto real. */
export function buildTextPdf(rows: PdfTextRow[], options: { compress?: boolean } = {}): Uint8Array {
  const body = rows
    .map((row, i) => `${i === 0 ? '40 800' : '0 -16'} Td ${rowOperators(row)}`)
    .join('\n')
  const stream = `BT\n/F1 12 Tf\n${body}\nET`

  return buildObjects([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 595 842 ] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    contentObject(stream, options.compress ?? false),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ])
}

/**
 * PDF de solo imagen, como las actas reales de Cundinamarca: CamScanner las
 * sube escaneadas, sin una sola fuente ni operador de texto (I-085).
 */
export function buildScannedPdf(): Uint8Array {
  const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex').toString('latin1')
  const stream = 'q\n595 0 0 842 0 0 cm\n/X1 Do\nQ'

  return buildObjects([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 595 842 ] /Resources << /XObject << /X1 5 0 R >> >> /Contents 4 0 R >>',
    contentObject(stream, false),
    `<< /Length ${jpeg.length} /Type /XObject /Subtype /Image /Height 60 /Width 60 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [ /DCTDecode ] >>\nstream\n${jpeg}\nendstream`,
  ])
}

/** PDF cifrado: no se abre, se falla y se dice. */
export function buildEncryptedPdf(): Uint8Array {
  return buildObjects([
    '<< /Type /Catalog /Pages 2 0 R /Encrypt 3 0 R >>',
    '<< /Type /Pages /Kids [ ] /Count 0 >>',
    '<< /Filter /Standard /V 2 /R 3 /Length 128 >>',
  ])
}

export type ActaOptions = {
  drawNumber?: string
  date?: string
  premioMayor?: string
  serie?: string | null
  /** Filas adicionales, por ejemplo secos o un segundo premio mayor. */
  extraRows?: PdfTextRow[]
  compress?: boolean
}

/**
 * Estructura representativa de un acta oficial: encabezado con la lotería, la
 * línea del sorteo con su fecha, la fila de PREMIO MAYOR y algunos secos.
 */
export function buildActaPdf(options: ActaOptions = {}): Uint8Array {
  const drawNumber = options.drawNumber ?? '4817'
  const date = options.date ?? '31 de agosto de 2026'
  const premioMayor = options.premioMayor ?? '4593'
  const serie = options.serie === undefined ? '132' : options.serie

  const rows: PdfTextRow[] = [
    'LOTERIA DE CUNDINAMARCA',
    'ACTA DE RESULTADOS',
    `SORTEO No. ${drawNumber}`,
    `Bogota D.C., ${date}`,
    'PLAN DE PREMIOS',
    serie ? `PREMIO MAYOR ${premioMayor} SERIE ${serie}` : `PREMIO MAYOR ${premioMayor}`,
    'SECO DE 100 MILLONES 1234 SERIE 045',
    'SECO DE 50 MILLONES 5678 SERIE 099',
    ...(options.extraRows ?? []),
  ]
  return buildTextPdf(rows, { compress: options.compress ?? true })
}
