import type { LotteryCode } from './constants'
import { fetchOfficialDocument } from './fetch'
import { sha256Hex } from './hash'
import {
  ALLOWED_ALTERNATIVE_HOSTS,
  ALTERNATIVE_SOURCE_BY_ID,
  type AlternativeSourceId,
} from './alternative-sources'
import { looksLikeCloudflareChallenge } from './parse/html'
import {
  extractGanarChanceIndex,
  extractGanarChanceLottery,
  extractLoteriasDeHoy,
  extractPerlatodoIndex,
  type AlternativeObservation,
} from './parse/alternative'
import type { AdapterFail, AdapterOutcome } from './types'

/**
 * Descarga y lectura de UNA fuente alternativa (D-162, BR-L26).
 *
 * Descarga y lectura, nada mas: aqui no se decide si un numero es bueno. Eso
 * lo hace `record_lottery_observations` en PostgreSQL, que es quien puede
 * contar dominios distintos dentro de una transaccion.
 */

export type AlternativeFetch = {
  sourceId: AlternativeSourceId
  sourceUrl: string
  contentHash: string
  fetchedAt: string
  observations: AlternativeObservation[]
}

function fail(code: AdapterFail['code'], message: string, sourceUrl?: string): AdapterFail {
  return { ok: false, code, message, sourceUrl }
}

function asText(body: Uint8Array): string {
  return new TextDecoder('utf-8').decode(body)
}

/**
 * Que URL toca para esta fuente y esta loteria.
 *
 * Una fuente `index` publica varias loterias en una sola pagina y se descarga
 * UNA vez por tick, sea cual sea la loteria que se pregunte (el llamador
 * reutiliza el contenido en memoria). Una fuente `per_lottery` tiene una URL
 * por loteria y cada una cuesta una descarga del presupuesto.
 */
export function alternativeUrlFor(
  sourceId: AlternativeSourceId,
  lottery: LotteryCode,
): string | null {
  const source = ALTERNATIVE_SOURCE_BY_ID[sourceId]
  if (source.shape === 'index') return source.indexUrl
  return source.lotteryUrl(lottery)
}

function readObservations(
  sourceId: AlternativeSourceId,
  html: string,
  lottery: LotteryCode,
): AlternativeObservation[] {
  switch (sourceId) {
    case 'perlatodo':
      return extractPerlatodoIndex(html)
    case 'ganarchance':
      // La pagina por loteria trae historico; la portada, solo hoy y ayer.
      // Se prueban las dos lecturas sobre el MISMO documento: no cuesta otra
      // descarga y una de las dos acertara segun que URL se haya pedido.
      return [...extractGanarChanceLottery(html, lottery), ...extractGanarChanceIndex(html)]
    case 'loteriasdehoy':
      return extractLoteriasDeHoy(html)
    case 'pagatodo':
      // Verificado el 2026-09-02: responde 403 de Cloudflare con cuerpo vacio,
      // asi que nunca se llega aqui. Se deja declarada porque un desafio se
      // configura y se desconfigura (I-089), y sin lector una reapertura
      // pasaria desapercibida.
      return extractPerlatodoIndex(html)
    default:
      return []
  }
}

/**
 * Descarga una fuente alternativa y devuelve lo que dice, sin juzgarlo.
 *
 * Un fallo NUNCA tumba el tick: se devuelve como `AdapterFail` y el llamador
 * sigue con la fuente siguiente (BR-L26). Paga Todo, hoy, siempre cae aqui
 * con `source_blocked`, y eso es lo correcto: no se elude.
 */
export async function downloadAlternativeSource(
  sourceId: AlternativeSourceId,
  lottery: LotteryCode,
): Promise<AdapterOutcome<AlternativeFetch>> {
  const url = alternativeUrlFor(sourceId, lottery)
  if (!url) {
    return fail('empty', 'Esta fuente no publica esa loteria.')
  }

  const fetched = await fetchOfficialDocument(url, { allowHosts: ALLOWED_ALTERNATIVE_HOSTS })
  if (!fetched.ok) return fetched

  const html = asText(fetched.value.body)
  if (looksLikeCloudflareChallenge(html)) {
    return fail('source_blocked', 'La fuente exige una verificacion que no se elude.', url)
  }

  const contentHash = sha256Hex(fetched.value.body)
  const observations = readObservations(sourceId, html, lottery)
  if (observations.length === 0) {
    // Que la pagina responda y no traiga nada legible es un cambio de
    // maquetacion, no un exito vacio: se dice, para que se note.
    return fail('structure_changed', 'La fuente respondio pero no trae resultados legibles.', url)
  }

  return {
    ok: true,
    value: {
      sourceId,
      sourceUrl: fetched.value.url,
      contentHash,
      fetchedAt: new Date().toISOString(),
      observations,
    },
    sourceUrl: fetched.value.url,
    contentType: fetched.value.contentType,
    contentHash,
    fetchedAt: new Date().toISOString(),
  }
}
