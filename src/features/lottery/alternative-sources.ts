/**
 * Fuentes ALTERNATIVAS de resultados (D-162, BR-L26).
 *
 * No son autoridades. Son sitios que republican lo que las loterias publican,
 * y por eso un numero suyo NO se confirma nunca por si solo: hace falta que
 * el MISMO numero aparezca en al menos dos DOMINIOS distintos. Este archivo
 * solo declara las fuentes y como se arma su URL; leerlas es cosa de
 * `parse/alternative.ts` y decidir, de `consensus.ts`.
 *
 * Por que un dominio y no una URL: la pagina exterior de Paga Todo y su
 * iframe son dos rutas del mismo sitio, y contarlas como dos fuentes seria
 * fabricar un consenso de la nada. El consenso se cuenta por `id`, y cada
 * `id` es un dominio.
 *
 * VERIFICADO EN VIVO el 2026-09-02 desde este entorno, con las mismas
 * cabeceras honestas que usa `fetch.ts` (sin simular un navegador):
 *
 *   | Fuente          | Estado | Que trae                                    |
 *   |-----------------|--------|---------------------------------------------|
 *   | Paga Todo       | 403    | Cloudflare, cuerpo vacio. NO se elude       |
 *   | Perlatodo       | 200    | Indice con los ultimos ~3 dias, sin sorteo  |
 *   | Ganar Chance    | 200    | Pagina por loteria con los ultimos cinco    |
 *   | Loterias de Hoy | 200    | Pagina por loteria, CON numero de sorteo    |
 *
 * Paga Todo se conserva declarada a proposito: un desafio se configura y se
 * desconfigura, como demostro la Cruz Roja (I-089). Se intenta, falla
 * `source_blocked`, no cuenta como evidencia y no tumba el tick.
 */
import type { LotteryCode } from './constants'

export type AlternativeSourceId = 'pagatodo' | 'perlatodo' | 'ganarchance' | 'loteriasdehoy'

export type AlternativeSourceShape =
  /** Una sola pagina con varias loterias: se descarga UNA vez por tick. */
  | 'index'
  /** Una pagina por loteria: cada una cuesta una descarga. */
  | 'per_lottery'

export type AlternativeSource = {
  id: AlternativeSourceId
  label: string
  host: string
  shape: AlternativeSourceShape
  /** Pagina que agrupa varias loterias, si la fuente la tiene. */
  indexUrl: string | null
  /** URL de una loteria concreta, o `null` si la fuente no la publica. */
  lotteryUrl: (lottery: LotteryCode) => string | null
}

/**
 * Slugs COMPROBADOS uno a uno el 2026-09-02. No se adivinan: dos de los que
 * parecian obvios (`loteria-cundinamarca`, `loteria-medellin`) devuelven 404
 * en Loterias de Hoy, que los publica como `loteria-de-cundinamarca` y
 * `loteria-de-medellin`. Salen de los enlaces del propio menu del sitio.
 */
const LOTERIASDEHOY_SLUG = {
  cundinamarca: 'loteria-de-cundinamarca',
  cruz_roja: 'loteria-cruz-roja',
  meta: 'loteria-meta',
  bogota: 'loteria-de-bogota',
  medellin: 'loteria-de-medellin',
  boyaca: 'loteria-boyaca',
} as const satisfies Record<LotteryCode, string>

const GANARCHANCE_SLUG = {
  cundinamarca: 'loteria-cundinamarca',
  cruz_roja: 'loteria-cruz-roja',
  meta: 'loteria-meta',
  bogota: 'loteria-bogota',
  medellin: 'loteria-medellin',
  boyaca: 'loteria-boyaca',
} as const satisfies Record<LotteryCode, string>

export const ALTERNATIVE_SOURCES: readonly AlternativeSource[] = [
  {
    id: 'pagatodo',
    label: 'Paga Todo',
    host: 'www.pagatodo.com.co',
    shape: 'index',
    indexUrl: 'https://www.pagatodo.com.co/mobile-resultados-loterias/',
    lotteryUrl: () => null,
  },
  {
    id: 'perlatodo',
    label: 'Perlatodo',
    host: 'perlatodo.com',
    shape: 'index',
    indexUrl: 'https://perlatodo.com/perla/resultados/',
    lotteryUrl: () => null,
  },
  {
    id: 'ganarchance',
    label: 'Ganar Chance',
    host: 'www.ganarchance.com',
    shape: 'per_lottery',
    indexUrl: 'https://www.ganarchance.com/resultados-loterias-colombia',
    lotteryUrl: (lottery) => `https://www.ganarchance.com/resultado/${GANARCHANCE_SLUG[lottery]}`,
  },
  {
    id: 'loteriasdehoy',
    label: 'Loterías de Hoy',
    host: 'www.loteriasdehoy.com',
    shape: 'per_lottery',
    indexUrl: 'https://www.loteriasdehoy.com/',
    lotteryUrl: (lottery) => `https://www.loteriasdehoy.com/${LOTERIASDEHOY_SLUG[lottery]}`,
  },
] as const

export const ALTERNATIVE_SOURCE_BY_ID: Readonly<Record<AlternativeSourceId, AlternativeSource>> =
  Object.fromEntries(ALTERNATIVE_SOURCES.map((source) => [source.id, source])) as Record<
    AlternativeSourceId,
    AlternativeSource
  >

/**
 * Hosts de las fuentes alternativas. Lista aparte de la oficial a proposito:
 * que un agregador este autorizado NO lo convierte en autoridad, y ninguna
 * ruta oficial puede resolverse contra esta lista (BR-L26).
 *
 * Se incluyen las dos formas de cada dominio porque una redireccion entre
 * `host` y `www.host` es normal y no debe tumbar la descarga.
 */
export const ALLOWED_ALTERNATIVE_HOSTS: readonly string[] = [
  'pagatodo.com.co',
  'www.pagatodo.com.co',
  'perlatodo.com',
  'www.perlatodo.com',
  'ganarchance.com',
  'www.ganarchance.com',
  'loteriasdehoy.com',
  'www.loteriasdehoy.com',
] as const

/** Orden de consulta: primero las baratas, y Paga Todo el primero por encargo. */
export const ALTERNATIVE_SOURCE_ORDER: readonly AlternativeSourceId[] = [
  'pagatodo',
  'perlatodo',
  'ganarchance',
  'loteriasdehoy',
] as const

/**
 * Cuantos dominios distintos tienen que coincidir para confirmar (BR-L26).
 * Dos. No es configurable desde fuera: bajarlo a uno convierte un agregador
 * en autoridad, que es exactamente lo que esta regla existe para impedir.
 */
export const ALTERNATIVE_CONSENSUS_MIN_SOURCES = 2
