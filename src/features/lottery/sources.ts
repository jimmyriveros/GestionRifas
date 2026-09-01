import type { LotteryCode } from './constants'

/**
 * Puntos estables de descubrimiento. Las URLs de descarga con `idFile` NO se
 * fijan: el adaptador CNJSA las descubre en esta pagina (BR-L02, D-144).
 */
export const CNJSA_DISCOVERY_URL =
  'https://cnjsa.coljuegos.gov.co/publicaciones/306418/cronograma-de-sorteos-ordinarios-y-extraordinarios/'

export const LOTTERY_RESULT_URLS = {
  cundinamarca: 'https://www.loteriadecundinamarca.com.co/resultados',
  cruz_roja: 'https://lotecruz.org.co/',
  meta: 'https://loteriadelmeta.gov.co/resultados/',
  bogota: 'https://loteriadebogota.com/',
  medellin: 'https://loteriademedellin.com.co/resultados/',
  boyaca: 'https://loteriadeboyaca.gov.co/resultados/',
} as const satisfies Record<LotteryCode, string>

/**
 * Actas oficiales de resultados de Cundinamarca (D-153, BR-L23).
 *
 * El sitio oficial enlaza cada acta en este host de almacenamiento, con esta
 * ruta exacta. Comprobado contra `/actas-resultados` el 2026-09-01: el propio
 * codigo del sitio lleva la lista
 * `{label: "Acta Sorteo 4817.pdf", url: ".../files/results-records/2026/4817.pdf"}`.
 *
 * **El host se autoriza junto con su ruta.** `blob.core.windows.net` es
 * almacenamiento compartido de Azure: cualquiera puede tener una cuenta ahi,
 * asi que confiar en el host entero convertiria en «fuente oficial» a medio
 * internet. Por eso `ALLOWED_SOURCE_PATHS` exige ademas el prefijo exacto.
 */
export const CUNDINAMARCA_ACTA_HOST = 'plataformaweb.blob.core.windows.net'

export const CUNDINAMARCA_ACTA_PATH = /^\/files\/results-records\/20\d{2}\/\d{1,6}\.pdf$/

export const CUNDINAMARCA_ACTAS_PAGE = 'https://www.loteriadecundinamarca.com.co/actas-resultados'

/** URL del acta de un sorteo concreto. No acepta nada del cliente. */
export function cundinamarcaActaUrl(year: number, drawNumber: string): string | null {
  if (!Number.isInteger(year) || year < 2000 || year > 2999) return null
  if (!/^\d{1,6}$/.test(drawNumber)) return null
  return `https://${CUNDINAMARCA_ACTA_HOST}/files/results-records/${year}/${drawNumber}.pdf`
}

export const ALLOWED_SOURCE_HOSTS = [
  'cnjsa.coljuegos.gov.co',
  'coljuegos.gov.co',
  'www.coljuegos.gov.co',
  'loteriadecundinamarca.com.co',
  'www.loteriadecundinamarca.com.co',
  CUNDINAMARCA_ACTA_HOST,
  'lotecruz.org.co',
  'www.lotecruz.org.co',
  'loteriadelmeta.gov.co',
  'www.loteriadelmeta.gov.co',
  'loteriadebogota.com',
  'www.loteriadebogota.com',
  'loteriademedellin.com.co',
  'www.loteriademedellin.com.co',
  'loteriadeboyaca.gov.co',
  'www.loteriadeboyaca.gov.co',
] as const

/**
 * Hosts que ademas exigen una ruta concreta. Un host que aparezca aqui NO
 * queda autorizado entero: se comprueba en la URL inicial y en cada
 * redireccion (D-153).
 */
export const ALLOWED_SOURCE_PATHS: Readonly<Record<string, RegExp>> = {
  [CUNDINAMARCA_ACTA_HOST]: CUNDINAMARCA_ACTA_PATH,
}

export const FETCH_TIMEOUT_MS = 15_000
export const FETCH_MAX_BYTES = 2_000_000
/**
 * Las actas de Cundinamarca son escaneos: las muestreadas el 2026-09-01 pesan
 * entre 1,16 y 1,52 MB. El tope general de 2 MB se les queda corto, asi que
 * el PDF tiene el suyo, con holgura pero acotado.
 */
export const FETCH_MAX_PDF_BYTES = 6_000_000
export const FETCH_MAX_REDIRECTS = 5

/** Dia de la semana ISO: 1 lunes .. 7 domingo (BR-L01). */
export const LOTTERY_NOMINAL_WEEKDAY = {
  cundinamarca: 1,
  cruz_roja: 2,
  meta: 3,
  bogota: 4,
  medellin: 5,
  boyaca: 6,
} as const satisfies Record<LotteryCode, number>

export const OPERATOR_NAME_TO_CODE: ReadonlyArray<{ pattern: RegExp; code: LotteryCode }> = [
  { pattern: /cruz\s*roja/i, code: 'cruz_roja' },
  { pattern: /cundinamarca|c\/marca|c\/marca/i, code: 'cundinamarca' },
  { pattern: /\bmeta\b/i, code: 'meta' },
  { pattern: /bogot/i, code: 'bogota' },
  { pattern: /medell/i, code: 'medellin' },
  { pattern: /boyac/i, code: 'boyaca' },
]
