import { inflateSync } from 'node:zlib'

/**
 * Lector minimo de PDF, solo para leer el texto de un acta oficial (D-153).
 *
 * POR QUE NO SE ANADE UNA LIBRERIA
 *
 * Por lo mismo que con el xlsx del cronograma (D-144): lo que hace falta es
 * una porcion diminuta del formato —los flujos de contenido de las paginas y
 * los operadores que muestran texto— sobre documentos de una autoridad
 * conocida. Una libreria de PDF completa trae fuentes, formularios, cifrado y
 * javascript, superficie que este proyecto no necesita y tendria que auditar.
 *
 * QUE NO HACE, Y ES IMPORTANTE
 *
 * **No hace OCR.** Un PDF que solo contiene imagenes escaneadas no tiene
 * texto que leer, y este modulo lo dice (`textOperators === 0`) en vez de
 * devolver una cadena vacia que el llamador pueda confundir con «no aparece
 * el premio mayor». La diferencia importa: una es «el acta no se puede leer
 * automaticamente» y la otra seria «el acta se leyo y no dice nada».
 *
 * Tampoco resuelve codificaciones de fuente (`/ToUnicode`), ni posiciona el
 * texto: reconstruye lineas por los operadores de salto. Para localizar una
 * fila etiquetada es suficiente, y por eso cada linea se entrega tambien en
 * version `compact` —sin espacios—, que es inmune a que el generador parta
 * «PREMIO MAYOR» en varios fragmentos.
 */

/** Tope de bytes descomprimidos. Un acta legitima no se acerca. */
const MAX_DECODED_BYTES = 8_000_000

/** Tope de objetos recorridos, por si el documento viene mal formado. */
const MAX_OBJECTS = 5_000

export type PdfLine = {
  /** Texto con los espacios colapsados. */
  text: string
  /** El mismo texto sin un solo espacio. Sirve para etiquetas partidas. */
  compact: string
}

export type PdfTextExtraction = {
  lines: PdfLine[]
  /** Numero de operadores de texto encontrados. **0 = documento escaneado.** */
  textOperators: number
  /** Paginas declaradas en el documento. */
  pages: number
}

export class PdfUnsupportedError extends Error {}

/** Los cuatro primeros bytes de todo PDF. No se fia del `content-type`. */
export function isPdfSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d //   -
  )
}

/** Filtros de imagen: su contenido no es texto y no se intenta inflar. */
const IMAGE_FILTERS = /\/(DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode|RunLengthDecode)\b/

function decodeLiteralString(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = raw[i + 1]
    if (next === undefined) break
    i += 1
    switch (next) {
      case 'n':
        out += '\n'
        break
      case 'r':
        out += '\r'
        break
      case 't':
        out += '\t'
        break
      case 'b':
      case 'f':
        out += ' '
        break
      case '(':
      case ')':
      case '\\':
        out += next
        break
      case '\n':
        break
      default: {
        if (next >= '0' && next <= '7') {
          let octal = next
          while (octal.length < 3) {
            const digit = raw[i + 1]
            if (digit === undefined || digit < '0' || digit > '7') break
            octal += digit
            i += 1
          }
          out += String.fromCharCode(parseInt(octal, 8))
        } else {
          out += next
        }
      }
    }
  }
  return out
}

function decodeHexString(raw: string): string {
  const hex = raw.replace(/[^0-9A-Fa-f]/g, '')
  const even = hex.length % 2 === 0 ? hex : `${hex}0`
  const bytes = Buffer.from(even, 'hex')
  // Cadena UTF-16BE con marca de orden: se decodifica como tal.
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return bytes.subarray(2).swap16().toString('utf16le')
  }
  return bytes.toString('latin1')
}

type Collector = {
  lines: PdfLine[]
  current: string[]
  operators: number
}

function pushLine(collector: Collector): void {
  if (collector.current.length === 0) return
  const text = collector.current.join(' ').replace(/\s+/g, ' ').trim()
  collector.current = []
  if (!text) return
  collector.lines.push({ text, compact: text.replace(/\s+/g, '') })
}

/**
 * Recorre un flujo de contenido y acumula lo que muestran `Tj`, `TJ`, `'` y
 * `"`. Los operadores de salto (`Td`, `TD`, `T*`, `'`, `"`) cierran la linea.
 */
function collectStreamText(content: string, collector: Collector): void {
  const token =
    /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\[|\]|-?\d+(?:\.\d+)?|(?:T\*|Td|TD|Tj|TJ|ET|BT|'|")/g
  let match: RegExpExecArray | null
  let pendingAdjustment = 0

  while ((match = token.exec(content))) {
    const raw = match[0]

    if (raw.startsWith('(')) {
      if (pendingAdjustment <= -100) collector.current.push(' ')
      pendingAdjustment = 0
      collector.current.push(decodeLiteralString(raw.slice(1, -1)))
      continue
    }
    if (raw.startsWith('<') && !raw.startsWith('<<')) {
      if (pendingAdjustment <= -100) collector.current.push(' ')
      pendingAdjustment = 0
      collector.current.push(decodeHexString(raw.slice(1, -1)))
      continue
    }
    if (/^-?\d/.test(raw)) {
      pendingAdjustment = Number(raw)
      continue
    }

    switch (raw) {
      case 'Tj':
      case 'TJ':
        collector.operators += 1
        pendingAdjustment = 0
        break
      case "'":
      case '"':
        collector.operators += 1
        pushLine(collector)
        break
      case 'Td':
      case 'TD':
      case 'T*':
      case 'ET':
        pendingAdjustment = 0
        pushLine(collector)
        break
      default:
        pendingAdjustment = 0
    }
  }
  pushLine(collector)
}

function streamPayload(body: string, dict: string): string | null {
  const start = body.indexOf('stream')
  if (start < 0) return null
  const end = body.indexOf('endstream', start)
  if (end < 0) return null
  const afterKeyword = body.slice(start + 'stream'.length)
  const offset = afterKeyword.startsWith('\r\n') ? 2 : afterKeyword.startsWith('\n') ? 1 : 0
  const raw = body.slice(start + 'stream'.length + offset, end)

  if (IMAGE_FILTERS.test(dict)) return null

  if (/\/FlateDecode\b/.test(dict)) {
    try {
      return inflateSync(Buffer.from(raw, 'latin1'), {
        maxOutputLength: MAX_DECODED_BYTES,
      }).toString('latin1')
    } catch {
      return null
    }
  }
  return raw
}

/**
 * Devuelve las lineas de texto del PDF. Lanza `PdfUnsupportedError` si el
 * documento esta cifrado: no se rompe una proteccion, se falla y se dice.
 */
export function extractPdfText(bytes: Uint8Array): PdfTextExtraction {
  const raw = Buffer.from(bytes).toString('latin1')

  if (/\/Encrypt\b/.test(raw)) {
    throw new PdfUnsupportedError('El PDF esta cifrado y no se intenta abrir.')
  }

  const pages = (raw.match(/\/Type\s*\/Page\b/g) ?? []).length
  const collector: Collector = { lines: [], current: [], operators: 0 }

  const objects = /\d+\s+\d+\s+obj\b([\s\S]*?)endobj/g
  let match: RegExpExecArray | null
  let seen = 0
  let decoded = 0

  while ((match = objects.exec(raw))) {
    seen += 1
    if (seen > MAX_OBJECTS) break
    const body = match[1] ?? ''
    const streamAt = body.indexOf('stream')
    if (streamAt < 0) continue
    const dict = body.slice(0, streamAt)
    if (/\/Subtype\s*\/Image\b/.test(dict)) continue
    if (/\/Type\s*\/(Metadata|XRef|ObjStm)\b/.test(dict)) continue

    const content = streamPayload(body, dict)
    if (content === null) continue
    decoded += content.length
    if (decoded > MAX_DECODED_BYTES) break
    collectStreamText(content, collector)
  }

  return { lines: collector.lines, textOperators: collector.operators, pages }
}
