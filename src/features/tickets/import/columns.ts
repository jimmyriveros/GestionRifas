import { foldForSearch } from '@/lib/search'

/**
 * Reconocimiento de los encabezados de un archivo de boletas.
 *
 * El usuario lleva sus boletas en Excel y las exporta como CSV, asi que el
 * encabezado llega como lo haya escrito: «Premio semanal», «premio_semanal»,
 * «WEEKLY NUMBER», con espacios de mas o sin tilde. Reconocerlos aqui evita
 * obligarle a preparar el archivo antes de subirlo.
 *
 * La normalizacion afecta SOLO al encabezado. Los valores de los numeros no se
 * tocan nunca: son texto y conservan sus ceros de delante (BR-N03).
 */

/** Que dato del importador representa una columna. */
export type TicketColumn = 'daily' | 'weekly' | 'clientName' | 'clientPhone' | 'abono'

/**
 * Encabezado comparable: sin acentos, en minusculas, y con guiones bajos y
 * medios convertidos en espacios.
 *
 * `foldForSearch` ya recorta, colapsa espacios, quita acentos y baja a
 * minusculas; es la misma funcion que usa la busqueda, para no tener dos reglas
 * de normalizacion distintas en el proyecto.
 */
export function normalizeHeader(raw: string): string {
  return foldForSearch(raw.replace(/[_-]+/g, ' '))
}

/**
 * Encabezados que se reconocen solos, ya normalizados.
 *
 * La lista es corta a proposito: si alguno falta, el importador no rechaza el
 * archivo, muestra la pantalla de mapeo manual. Ampliarla es una comodidad, no
 * un requisito.
 */
const ALIASES: Record<TicketColumn, readonly string[]> = {
  weekly: ['premio semanal', 'numero semanal', 'semanal', 'weekly number', 'weekly'],
  daily: ['premio diario', 'numero diario', 'diario', 'daily number', 'daily'],
  clientName: [
    'cliente',
    'nombre',
    'nombre cliente',
    'nombre del cliente',
    'client',
    'client name',
  ],
  clientPhone: [
    'celular',
    'celular cliente',
    'celular del cliente',
    'telefono',
    'telefono cliente',
    'telefono del cliente',
    'client phone',
    'phone',
    'mobile',
  ],
  abono: ['abono', 'abonado', 'abono realizado', 'valor abonado', 'pago', 'pagado', 'payment'],
}

/** Que columna representa este encabezado, o `null` si no se reconoce. */
export function matchColumn(header: string): TicketColumn | null {
  const normalized = normalizeHeader(header)
  for (const [column, aliases] of Object.entries(ALIASES) as [TicketColumn, string[]][]) {
    if (aliases.includes(normalized)) return column
  }
  return null
}

/**
 * La misma tabla de alias, aplicada a la CLAVE de un objeto JSON (BR-N14).
 *
 * El JSON del encargo trae las claves escritas como los encabezados del CSV
 * («Premio semanal», «Nombre», «Abono»), mientras que los archivos que ya
 * funcionaban las traen en `snake_case` y en `camelCase` (`daily_number`,
 * `clientPhone`). Reconocer las tres formas con la MISMA lista evita mantener
 * dos juegos de alias que se van separando con el tiempo.
 *
 * `normalizeHeader` ya convierte los guiones bajos en espacios; lo unico que
 * hay que anadir es partir el camelCase antes de normalizar.
 */
export function matchJsonKey(key: string): TicketColumn | null {
  return matchColumn(key) ?? matchColumn(key.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
}

/** Indice de cada columna dentro del encabezado. `-1` si no se reconocio. */
export type ColumnMapping = {
  daily: number
  weekly: number
  clientName: number
  clientPhone: number
  abono: number
}

/**
 * Intenta emparejar los encabezados con los dos numeros.
 *
 * Se queda con la PRIMERA columna que reconoce de cada tipo: si un archivo trae
 * «Premio diario» dos veces, la segunda se ignora en vez de pisar a la primera.
 * Las columnas que no se reconocen —la numeracion «#», notas, cualquier otra—
 * simplemente no entran en el mapeo, que es la forma de ignorarlas.
 */
export function detectMapping(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    daily: -1,
    weekly: -1,
    clientName: -1,
    clientPhone: -1,
    abono: -1,
  }
  headers.forEach((header, index) => {
    const column = matchColumn(header)
    if (column && mapping[column] === -1) mapping[column] = index
  })
  return mapping
}

/** `true` si ya se sabe de que columna sale cada numero. */
export function isMappingComplete(mapping: ColumnMapping): boolean {
  return mapping.daily >= 0 && mapping.weekly >= 0
}

/** `true` si el archivo reconocio solo una de las dos columnas del cliente. */
export function hasPartialClientMapping(mapping: ColumnMapping): boolean {
  return mapping.clientName >= 0 !== mapping.clientPhone >= 0
}

/**
 * `true` si hay columna de abono pero no se sabe quien compro la boleta.
 *
 * Un abono no puede existir sin cliente (BR-F02): la boleta tiene que estar
 * vendida para que alguien le abone. Si el archivo trae «Abono» y no se
 * reconocio el cliente, lo mas probable es que esa columna se llame de otra
 * forma; se pregunta, en vez de aceptar el archivo con todas las filas
 * marcadas.
 */
export function hasAbonoWithoutClientMapping(mapping: ColumnMapping): boolean {
  return mapping.abono >= 0 && (mapping.clientName < 0 || mapping.clientPhone < 0)
}

/** `true` si hay que parar a preguntar de que columna sale cada dato. */
export function needsManualMapping(mapping: ColumnMapping): boolean {
  return (
    !isMappingComplete(mapping) ||
    hasPartialClientMapping(mapping) ||
    hasAbonoWithoutClientMapping(mapping)
  )
}
