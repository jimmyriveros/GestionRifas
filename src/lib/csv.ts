/**
 * Generacion de CSV para la exportacion de reportes (CLAUDE.md §24).
 *
 * Funciones puras, sin dependencias de Next ni de Supabase: se prueban solas y
 * sirven igual desde un Route Handler que desde un script.
 *
 * DECISIONES DE FORMATO (docs/DECISIONS.md D-056)
 *
 * * Separador `;` y no `,`. En Windows con configuracion regional de Colombia
 *   —la de las personas que van a abrir estos archivos— el separador de listas
 *   de Excel es el punto y coma. Un CSV separado por comas se abre ahi con
 *   TODAS las columnas amontonadas en la primera celda, que es exactamente el
 *   problema que una exportacion debe evitar.
 * * BOM UTF-8 al inicio. Sin el, Excel interpreta el archivo como ANSI y los
 *   nombres con tildes o ñ salen corruptos.
 * * Fin de linea CRLF, que es lo que exige RFC 4180.
 */

export type CsvColumn<T> = {
  header: string
  value: (row: T) => string | number | null | undefined
}

const DELIMITER = ';'
const NEWLINE = '\r\n'
/**
 * Marca de orden de bytes UTF-8. Sin ella Excel rompe los acentos.
 *
 * Se construye por codigo y no como caracter literal a proposito: U+FEFF es
 * INVISIBLE en el editor, de modo que cualquiera podria borrarlo sin darse
 * cuenta al tocar esta linea, y la prueba que lo comprueba tampoco lo veria.
 */
const BOM = String.fromCharCode(0xfeff)

/**
 * Caracteres con los que Excel y LibreOffice interpretan la celda como una
 * FORMULA en vez de como texto. Un cliente llamado `=HYPERLINK(...)` se
 * convertiria en codigo ejecutable en la maquina de quien abre el archivo
 * (inyeccion CSV). Se neutraliza anteponiendo una comilla simple.
 */
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/

/**
 * Excepcion a la regla anterior: telefonos (`+57 300 000 0000`) y cifras
 * negativas empiezan por `+` o `-` de forma legitima y no contienen nada
 * ejecutable. Solo se consideran seguros si TODO el valor son digitos,
 * espacios y puntuacion numerica.
 */
const NUMERIC_LIKE_RE = /^[+-]?[\d\s()./,-]+$/

function neutralizeFormula(text: string): string {
  if (!FORMULA_PREFIX_RE.test(text)) return text
  if (NUMERIC_LIKE_RE.test(text)) return text
  return `'${text}`
}

/** Escapa una celda segun RFC 4180 y neutraliza formulas. */
export function escapeCsvCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const text = typeof raw === 'number' ? String(raw) : raw
  if (text === '') return ''

  const safe = neutralizeFormula(text)
  // Las comillas dobles internas se duplican; la celda entera se entrecomilla
  // si contiene el separador, comillas o un salto de linea.
  return /["\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * Serializa filas a CSV con su encabezado.
 *
 * Devuelve el contenido completo del archivo, BOM incluido: quien lo llame solo
 * tiene que ponerlo en la respuesta.
 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: readonly T[]): string {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(DELIMITER)
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.value(row))).join(DELIMITER),
  )
  return BOM + [header, ...body].join(NEWLINE) + NEWLINE
}

/**
 * Nombre de archivo con la fecha del dia, saneado.
 *
 * El nombre viaja en la cabecera `Content-Disposition`: cualquier caracter
 * fuera de la lista blanca podria partir la cabecera en dos (inyeccion de
 * encabezados), asi que se filtra en origen en vez de confiar en el llamador.
 */
export function csvFilename(prefix: string, isoDate: string): string {
  const clean = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `${clean(prefix)}-${clean(isoDate)}.csv`
}

/** Cabeceras de una respuesta de descarga de CSV. */
export function csvHeaders(filename: string): Record<string, string> {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    // Un reporte refleja el estado del momento en que se pidio: nunca se cachea.
    'Cache-Control': 'no-store',
  }
}
