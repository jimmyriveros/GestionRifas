/**
 * Lectura de un CSV exportado desde Excel.
 *
 * No se usa ninguna libreria: el formato que hay que soportar es una tabla de
 * dos columnas de digitos, y las tres cosas que de verdad rompen un CSV de
 * Excel —la marca BOM, los saltos de linea de Windows y el separador punto y
 * coma de la configuracion regional española/colombiana— caben en este archivo.
 * Anadir un parser de terceros por esto seria mas peso y mas superficie que
 * mantener.
 *
 * Aun asi se respetan las comillas de RFC 4180: Excel entrecomilla cualquier
 * celda que contenga el separador, y partir por comas a lo bruto convertiria
 * «"Premio, semanal"» en dos columnas.
 *
 * Funciones PURAS: no tocan el DOM ni la red, asi que se prueban sin navegador.
 */

import { ImportParseError } from './errors'

export type CsvTable = {
  /** Primera fila del archivo, tal cual viene. */
  headers: string[]
  /** Filas de datos, sin el encabezado. */
  rows: string[][]
  /** El separador que se detecto, para poder explicarlo si algo sale raro. */
  delimiter: string
}

const DELIMITERS = [',', ';', '\t'] as const

/**
 * Quita la marca de orden de bytes que Excel pone al guardar como «CSV UTF-8».
 *
 * Es invisible, va pegada al primer encabezado y hace que «Premio semanal» deje
 * de reconocerse por un caracter que nadie ve. Es la causa numero uno de que un
 * CSV de Excel «no funcione».
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Separador mas probable: el que mas veces aparece en la primera linea, fuera
 * de comillas.
 *
 * Excel usa coma o punto y coma segun la configuracion regional de quien
 * exporta, y el usuario no tiene por que saber cual le toco. Si no aparece
 * ninguno se usa la coma, que es lo que espera casi todo el mundo.
 */
function detectDelimiter(firstLine: string): string {
  let best = ','
  let bestCount = 0

  for (const delimiter of DELIMITERS) {
    let count = 0
    let inQuotes = false
    for (let i = 0; i < firstLine.length; i += 1) {
      const char = firstLine[i]
      if (char === '"') inQuotes = !inQuotes
      else if (char === delimiter && !inQuotes) count += 1
    }
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }

  return best
}

/**
 * Divide el texto completo en filas de celdas.
 *
 * Se recorre caracter a caracter en vez de partir por lineas y luego por
 * comas, porque una celda entrecomillada puede contener un salto de linea y
 * partir antes lo romperia. Los tres finales de linea (`\r\n`, `\n`, `\r`) se
 * tratan igual: el archivo puede venir de Windows, de Mac o de una exportacion
 * web.
 */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        // Dos comillas seguidas dentro de un campo son una comilla literal.
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      pushField()
    } else if (char === '\r') {
      // `\r\n` cuenta como un solo final de linea.
      if (text[i + 1] === '\n') i += 1
      pushRow()
    } else if (char === '\n') {
      pushRow()
    } else {
      field += char
    }
  }

  // La ultima fila solo cuenta si quedo algo escrito: un archivo que termina en
  // salto de linea no tiene una fila vacia al final.
  if (field !== '' || row.length > 0) pushRow()

  return rows
}

/** `true` si la fila no aporta nada: sin celdas o con todas en blanco. */
function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === '')
}

/**
 * Convierte el contenido de un CSV en encabezados y filas.
 *
 * Las filas en blanco se descartan —Excel deja alguna al final— y las celdas
 * se recortan por los extremos: un espacio accidental delante de un numero no
 * debe convertirlo en invalido. Recortar NO es modificar el numero: dentro no
 * puede haber espacios.
 */
export function parseCsv(content: string): CsvTable {
  const text = stripBom(content)
  if (text.trim() === '') {
    throw new ImportParseError('El archivo está vacío.')
  }

  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? ''
  const delimiter = detectDelimiter(firstLine)

  const all = splitRows(text, delimiter)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => !isBlankRow(row))

  const headers = all[0]
  if (!headers) {
    throw new ImportParseError('El archivo no tiene ninguna fila.')
  }
  if (headers.length < 2) {
    throw new ImportParseError(
      'El archivo necesita dos columnas: una con el número diario y otra con el semanal.',
    )
  }

  return { headers, rows: all.slice(1), delimiter }
}
