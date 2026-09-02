import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/types/database.types'

import {
  ALTERNATIVE_CONSENSUS_MIN_SOURCES,
  ALTERNATIVE_SOURCE_BY_ID,
  ALTERNATIVE_SOURCE_ORDER,
  type AlternativeSourceId,
} from './alternative-sources'
import { alternativeUrlFor, downloadAlternativeSource } from './alternative-adapters'
import type { LotteryCode } from './constants'
import type { AlternativeObservation } from './parse/alternative'

/**
 * Consenso entre fuentes alternativas (D-162, BR-L26).
 *
 * Regla: un numero NO se confirma por venir de una fuente alternativa. Hacen
 * falta al menos DOS DOMINIOS distintos diciendo el mismo numero para el mismo
 * sorteo. Quien cuenta los dominios y confirma es
 * `record_lottery_observations` en PostgreSQL, dentro de una transaccion:
 * aqui solo se descarga, se lee y se entrega lo leido.
 *
 * Este modulo NO lo importa ninguna pantalla. Lo llama el tick, y solo el
 * tick (BR-L20): el Panel jamas consulta internet.
 */

export type ConsensusDb = SupabaseClient<Database>

export type ConsensusDraw = {
  scheduleId: string
  lotteryCode: LotteryCode
  drawNumber: string
  /** Fecha oficial del sorteo en Bogota, `YYYY-MM-DD`. */
  officialDate: string
}

export type SourceAttempt = {
  sourceId: AlternativeSourceId
  ok: boolean
  errorCode?: string
  /** Observaciones que corresponden a ESTE sorteo, ya filtradas. */
  matched: number
}

export type ConsensusOutcome = {
  /** Descargas reales gastadas del presupuesto del tick. */
  downloads: number
  attempts: SourceAttempt[]
  /** Lo que devolvio la RPC, o `null` si no se llego a llamar. */
  recorded: ConsensusRecord | null
}

export type ConsensusRecord = {
  stored: number
  consensus: boolean
  reason?: string
  number?: string
  sources?: string[]
  alreadyConfirmed?: boolean
}

/**
 * Caché de UNA ejecucion del tick, en memoria y nada mas.
 *
 * Una fuente `index` publica varias loterias en la misma pagina: sin esto, seis
 * sorteos pendientes gastarian seis descargas en pedir el MISMO documento. Se
 * crea al empezar el tick y se tira al acabar; no persiste, no es un caché de
 * red y no sobrevive a la ejecucion (D-162).
 */
export type TickPageCache = Map<string, Awaited<ReturnType<typeof downloadAlternativeSource>>>

export function createTickPageCache(): TickPageCache {
  return new Map()
}

/** Solo lo que corresponde a este sorteo: misma loteria y misma fecha oficial. */
function matchesDraw(observation: AlternativeObservation, draw: ConsensusDraw): boolean {
  if (observation.lotteryCode !== draw.lotteryCode) return false
  // La publicacion puede caer despues de medianoche, igual que en la via
  // oficial (`classifyOfficialResultFit`): el dia siguiente tambien vale.
  const nextDay = new Date(`${draw.officialDate}T12:00:00Z`)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const nextIso = nextDay.toISOString().slice(0, 10)
  if (observation.officialDate !== draw.officialDate && observation.officialDate !== nextIso) {
    return false
  }
  // Si la fuente publica numero de sorteo, tiene que ser el del cronograma.
  // Que no lo publique no descalifica: se exige loteria y fecha exactas.
  if (observation.drawNumber !== null && observation.drawNumber !== draw.drawNumber) return false
  return true
}

/**
 * Consulta las fuentes alternativas de un sorteo hasta lograr consenso.
 *
 * Para y devuelve en cuanto tiene `ALTERNATIVE_CONSENSUS_MIN_SOURCES` dominios
 * de acuerdo: no se gastan descargas en confirmar lo ya confirmado. Una fuente
 * caida no interrumpe a las demas.
 */
export async function collectConsensusForDraw(
  client: ConsensusDb,
  draw: ConsensusDraw,
  options: {
    /** Descargas que este sorteo puede gastar. Nunca las supera. */
    budget: number
    cache: TickPageCache
    download?: typeof downloadAlternativeSource
  },
): Promise<ConsensusOutcome> {
  const download = options.download ?? downloadAlternativeSource
  const attempts: SourceAttempt[] = []
  const observations: {
    source_id: string
    source_class: 'alternative'
    source_url: string
    observed_date: string
    winning_number: string
    series: string | null
    observed_draw_number: string | null
    content_hash: string
    fetched_at: string
    evidence: Record<string, string | number | null>
  }[] = []
  let downloads = 0
  const agreeing = new Map<string, Set<AlternativeSourceId>>()

  for (const sourceId of ALTERNATIVE_SOURCE_ORDER) {
    if (downloads >= options.budget) break
    // ¿Ya hay consenso? Entonces no se descarga una fuente mas.
    if ([...agreeing.values()].some((set) => set.size >= ALTERNATIVE_CONSENSUS_MIN_SOURCES)) break

    const url = alternativeUrlFor(sourceId, draw.lotteryCode)
    if (!url) continue

    // Una pagina `index` ya descargada en este tick se reutiliza en memoria.
    const shape = ALTERNATIVE_SOURCE_BY_ID[sourceId].shape
    const cacheKey = shape === 'index' ? `${sourceId}:index` : `${sourceId}:${url}`
    let result = options.cache.get(cacheKey)
    if (result === undefined) {
      result = await download(sourceId, draw.lotteryCode)
      options.cache.set(cacheKey, result)
      downloads += 1
    }

    if (!result.ok) {
      attempts.push({ sourceId, ok: false, errorCode: result.code, matched: 0 })
      continue
    }

    const mine = result.value.observations.filter((observation) => matchesDraw(observation, draw))
    attempts.push({ sourceId, ok: true, matched: mine.length })
    // Una fuente que trae DOS numeros distintos para el mismo sorteo se
    // descarta entera: no se elige uno.
    const distinct = new Set(mine.map((observation) => observation.winningNumber))
    if (distinct.size !== 1) continue
    const observation = mine[0]
    if (!observation) continue

    observations.push({
      source_id: sourceId,
      source_class: 'alternative',
      source_url: result.value.sourceUrl,
      observed_date: observation.officialDate,
      winning_number: observation.winningNumber,
      series: observation.series,
      observed_draw_number: observation.drawNumber,
      content_hash: result.value.contentHash,
      fetched_at: result.value.fetchedAt,
      evidence: {
        source: sourceId,
        published_draw_number: observation.drawNumber,
        observed_date: observation.officialDate,
      },
    })

    const set = agreeing.get(observation.winningNumber) ?? new Set<AlternativeSourceId>()
    set.add(sourceId)
    agreeing.set(observation.winningNumber, set)
  }

  if (observations.length === 0) {
    return { downloads, attempts, recorded: null }
  }

  const { data, error } = await client.rpc('record_lottery_observations', {
    p_schedule_id: draw.scheduleId,
    p_observations: observations as unknown as Json,
  })
  if (error) throw error

  const row = (data ?? {}) as Record<string, unknown>
  return {
    downloads,
    attempts,
    recorded: {
      stored: typeof row.stored === 'number' ? row.stored : 0,
      consensus: row.consensus === true,
      reason: typeof row.reason === 'string' ? row.reason : undefined,
      number: typeof row.number === 'string' ? row.number : undefined,
      sources: Array.isArray(row.sources) ? (row.sources as string[]) : undefined,
      alreadyConfirmed: row.already_confirmed === true,
    },
  }
}
