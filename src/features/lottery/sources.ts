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
 * Cundinamarca publica el resultado en una SPA; el lookup oficial de un
 * billete vive en esta API. No lista el ultimo sorteo por si sola.
 */
export const CUNDINAMARCA_RESULT_API =
  'https://plataforma.loteriadecundinamarca.com.co/api/v1/result/public'

/** Lookup JSON cuando ya se conoce el sorteo (I-081). No se inventa un numero de billete. */
export function cundinamarcaResultLookupUrl(drawNumber: string): string {
  const url = new URL(CUNDINAMARCA_RESULT_API)
  url.searchParams.set('sorteo', drawNumber)
  return url.href
}

export const ALLOWED_SOURCE_HOSTS = [
  'cnjsa.coljuegos.gov.co',
  'coljuegos.gov.co',
  'www.coljuegos.gov.co',
  'loteriadecundinamarca.com.co',
  'www.loteriadecundinamarca.com.co',
  'plataforma.loteriadecundinamarca.com.co',
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

export const FETCH_TIMEOUT_MS = 15_000
export const FETCH_MAX_BYTES = 2_000_000
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
