import { LOTTERY_CODES, type LotteryCode } from './constants'
import { fetchOfficialDocument } from './fetch'
import { sha256Hex } from './hash'
import { discoverCnjsaDocuments, selectConsolidatedWorkbook } from './parse/cnjsa-discovery'
import { parseCnjsaOrdinariosWorkbook } from './parse/cnjsa-ordinarios'
import { looksLikeCloudflareChallenge } from './parse/html'
import {
  extractBogotaResult,
  extractBoyacaResult,
  extractCruzRojaResult,
  extractCundinamarcaResult,
  extractMedellinResult,
  extractMetaResult,
} from './parse/results'
import { CNJSA_DISCOVERY_URL, cundinamarcaResultLookupUrl, LOTTERY_RESULT_URLS } from './sources'
import type {
  AdapterFail,
  AdapterOutcome,
  CnjsaDiscoveredDocument,
  NormalizedLotteryResult,
  NormalizedSchedule,
} from './types'
import { validateNormalizedResult } from './validate'

function fail(code: AdapterFail['code'], message: string, sourceUrl?: string): AdapterFail {
  return { ok: false, code, message, sourceUrl }
}

function asText(body: Uint8Array): string {
  return new TextDecoder('utf-8').decode(body)
}

const RESULT_EXTRACTORS: Record<
  LotteryCode,
  (input: string) => NormalizedLotteryResult | AdapterFail
> = {
  cundinamarca: extractCundinamarcaResult,
  cruz_roja: extractCruzRojaResult,
  meta: extractMetaResult,
  bogota: extractBogotaResult,
  medellin: extractMedellinResult,
  boyaca: extractBoyacaResult,
}

export function extractCnjsaDiscovery(html: string, pageUrl: string): CnjsaDiscoveredDocument[] {
  return discoverCnjsaDocuments(html, pageUrl)
}

export function extractCnjsaSchedule(
  bytes: Uint8Array,
  meta: { documentTitle: string; documentUrl: string },
): AdapterOutcome<NormalizedSchedule> {
  try {
    if (asText(bytes).startsWith('%PDF')) {
      return fail(
        'unsupported_type',
        'El acuerdo en PDF se registra, pero el matching de fechas usa el xlsx consolidado.',
        meta.documentUrl,
      )
    }
    const parsed = parseCnjsaOrdinariosWorkbook(bytes)
    if (parsed.draws.length === 0) {
      return fail('empty', 'El xlsx no trajo sorteos de las seis loterias.', meta.documentUrl)
    }
    return {
      ok: true,
      value: {
        authority: 'CNJSA',
        documentTitle: meta.documentTitle,
        documentUrl: meta.documentUrl,
        documentVersion: meta.documentTitle,
        draws: parsed.draws,
        skippedExtraordinary: parsed.skippedExtraordinary,
      },
      sourceUrl: meta.documentUrl,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentHash: sha256Hex(bytes),
      fetchedAt: new Date().toISOString(),
    }
  } catch (error) {
    return fail(
      'parse_error',
      error instanceof Error ? error.message : 'No se pudo leer el cronograma.',
      meta.documentUrl,
    )
  }
}

export function extractLotteryResult(
  lottery: LotteryCode,
  body: string,
  sourceUrl: string,
): AdapterOutcome<NormalizedLotteryResult> {
  if (looksLikeCloudflareChallenge(body) || body.includes('<app-root></app-root>')) {
    const code = body.includes('<app-root>') ? 'ambiguous' : 'source_blocked'
    const message = body.includes('<app-root>')
      ? 'La pagina oficial es una aplicacion vacia sin el resultado en HTML.'
      : 'La fuente oficial exige una verificacion que no se elude.'
    return fail(code, message, sourceUrl)
  }

  const extracted = RESULT_EXTRACTORS[lottery](body)
  if ('ok' in extracted) {
    return { ...extracted, sourceUrl, contentHash: sha256Hex(body) }
  }
  const validated = validateNormalizedResult(extracted)
  if ('ok' in validated) {
    return { ...validated, sourceUrl, contentHash: sha256Hex(body) }
  }
  return {
    ok: true,
    value: validated,
    sourceUrl,
    contentType: body.trim().startsWith('{') ? 'application/json' : 'text/html',
    contentHash: sha256Hex(body),
    fetchedAt: new Date().toISOString(),
  }
}

export function pickCnjsaWorkbook(
  html: string,
  pageUrl: string,
  year: number,
): CnjsaDiscoveredDocument | AdapterFail {
  const docs = discoverCnjsaDocuments(html, pageUrl)
  const extra = docs.filter((d) => d.kind === 'extraordinary')
  const chosen = selectConsolidatedWorkbook(docs, year)
  if (!chosen) {
    return fail('empty', 'No hay un cronograma consolidado de sorteos ordinarios en la pagina.')
  }
  if (chosen.kind === 'extraordinary') {
    return fail('not_ordinary', 'El documento elegido es de sorteos extraordinarios.')
  }
  void extra
  return chosen
}

function isAdapterFail(
  value: CnjsaDiscoveredDocument | AdapterFail,
): value is AdapterFail {
  return 'ok' in value && value.ok === false
}

/**
 * Descubre el xlsx consolidado vigente, sin fijar un idFile, y lo extrae.
 * Prueba el año de Bogota, el anterior y el siguiente (D-144, D-148).
 */
export async function downloadCnjsaConsolidatedSchedule(
  year: number,
): Promise<AdapterOutcome<NormalizedSchedule>> {
  const discovery = await downloadCnjsaDiscovery()
  if (!discovery.ok) return discovery

  const years = [year, year - 1, year + 1]
  let lastFail: AdapterFail | null = null
  let chosen: CnjsaDiscoveredDocument | null = null
  for (const candidateYear of years) {
    const pick = pickCnjsaWorkbook(discovery.value.html, discovery.sourceUrl, candidateYear)
    if (isAdapterFail(pick)) {
      lastFail = pick
      continue
    }
    chosen = pick
    break
  }
  if (!chosen) {
    return (
      lastFail ??
      fail('empty', 'No hay un cronograma consolidado de sorteos ordinarios en la pagina.')
    )
  }

  const file = await fetchOfficialDocument(chosen.href)
  if (!file.ok) return file
  return extractCnjsaSchedule(file.value.body, {
    documentTitle: chosen.title,
    documentUrl: file.value.url,
  })
}

/** Descarga en vivo. La orquesta el tick (Etapa 5). */
export async function downloadCnjsaDiscovery(): Promise<
  AdapterOutcome<{ documents: CnjsaDiscoveredDocument[]; html: string }>
> {
  const fetched = await fetchOfficialDocument(CNJSA_DISCOVERY_URL)
  if (!fetched.ok) return fetched
  const html = asText(fetched.value.body)
  return {
    ok: true,
    value: { documents: discoverCnjsaDocuments(html, fetched.value.url), html },
    sourceUrl: fetched.value.url,
    contentType: fetched.value.contentType,
    contentHash: sha256Hex(fetched.value.body),
    fetchedAt: new Date().toISOString(),
  }
}

/** Descarga en vivo. La orquesta el tick (Etapa 5). */
export async function downloadLotteryResultPage(
  lottery: LotteryCode,
): Promise<AdapterOutcome<NormalizedLotteryResult>> {
  const fetched = await fetchOfficialDocument(LOTTERY_RESULT_URLS[lottery])
  if (!fetched.ok) return fetched
  return extractLotteryResult(lottery, asText(fetched.value.body), fetched.value.url)
}

/**
 * Cundinamarca: el HTML es una SPA vacia (I-081). Con el numero de sorteo de
 * la programacion se consulta el JSON oficial. No se elude el resto.
 */
export async function downloadCundinamarcaResult(
  drawNumber: string,
): Promise<AdapterOutcome<NormalizedLotteryResult>> {
  const fetched = await fetchOfficialDocument(cundinamarcaResultLookupUrl(drawNumber))
  if (!fetched.ok) return fetched
  return extractLotteryResult('cundinamarca', asText(fetched.value.body), fetched.value.url)
}

export async function fetchLotteryResultForDraw(
  lottery: LotteryCode,
  drawNumber: string,
): Promise<AdapterOutcome<NormalizedLotteryResult>> {
  if (lottery === 'cundinamarca') {
    const json = await downloadCundinamarcaResult(drawNumber)
    if (json.ok) return json
    const page = await downloadLotteryResultPage('cundinamarca')
    if (page.ok) return page
    return json
  }
  return downloadLotteryResultPage(lottery)
}

export const LOTTERY_ADAPTER_CODES = LOTTERY_CODES
