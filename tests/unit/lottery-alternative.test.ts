/**
 * Lectores de fuentes alternativas y consenso en memoria (D-162, BR-L26).
 *
 * El caso real de regresión es la Cruz Roja del 2026-09-01, sorteo 3169,
 * número `7132`, serie `250`: la portada oficial todavía mostraba el sorteo
 * anterior y tres agregadores ya lo publicaban. Vive **solo** aquí, como
 * fixture; no es un dato del negocio y no está en ninguna migración ni
 * constante.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  ALTERNATIVE_CONSENSUS_MIN_SOURCES,
  ALTERNATIVE_SOURCES,
  ALLOWED_ALTERNATIVE_HOSTS,
} from '@/features/lottery/alternative-sources'
import { alternativeUrlFor } from '@/features/lottery/alternative-adapters'
import { collectConsensusForDraw, createTickPageCache } from '@/features/lottery/consensus'
import { ALLOWED_SOURCE_HOSTS } from '@/features/lottery/sources'
import {
  extractGanarChanceIndex,
  extractGanarChanceLottery,
  extractLoteriasDeHoy,
  extractPerlatodoIndex,
} from '@/features/lottery/parse/alternative'

import {
  GANARCHANCE_META,
  GANARCHANCE_PORTADA,
  LOTERIASDEHOY_CEROS,
  LOTERIASDEHOY_CRUZ_ROJA,
  LOTERIASDEHOY_DIA_ANTERIOR,
  LOTERIASDEHOY_META,
  PERLATODO_FILA_DEMORADOS,
  PERLATODO_INDICE,
  RUIDO_QUE_NO_ES_RESULTADO,
} from '../fixtures/lottery/alternative-html'

describe('Perlatodo: la tabla de demorados no es un resultado', () => {
  it('lee la fila de resultado y descarta la de DEMORADOS - PEPAS', () => {
    const observaciones = extractPerlatodoIndex(PERLATODO_INDICE)
    expect(observaciones).toHaveLength(1)
    expect(observaciones[0]).toMatchObject({
      lotteryCode: 'cruz_roja',
      winningNumber: '7132',
      officialDate: '2026-09-01',
    })
  })

  it('la fila de demorados por si sola no devuelve nada', () => {
    // `7130` no es el premio mayor de Medellin del 28 de agosto: es `2608`.
    // Que esto devuelva vacio es lo que impide repetir I-088.
    expect(extractPerlatodoIndex(PERLATODO_FILA_DEMORADOS)).toEqual([])
  })

  it('no publica numero de sorteo, y no se lo inventa', () => {
    expect(extractPerlatodoIndex(PERLATODO_INDICE)[0]?.drawNumber).toBeNull()
  })
})

describe('Ganar Chance', () => {
  it('la portada ata cada tarjeta a la fecha de SU seccion', () => {
    const observaciones = extractGanarChanceIndex(GANARCHANCE_PORTADA)
    const cruzRoja = observaciones.find((o) => o.lotteryCode === 'cruz_roja')
    expect(cruzRoja).toMatchObject({
      winningNumber: '7132',
      series: '250',
      officialDate: '2026-09-01',
    })
    // La seccion de hoy esta vacia: no se le adjudica ninguna tarjeta de ayer.
    expect(observaciones.filter((o) => o.officialDate === '2026-09-02')).toEqual([])
  })

  it('la pagina por loteria trae el historico con su fecha por fila', () => {
    const observaciones = extractGanarChanceLottery(GANARCHANCE_META, 'meta')
    expect(observaciones).toHaveLength(3)
    expect(observaciones[0]).toMatchObject({
      winningNumber: '8134',
      series: '096',
      officialDate: '2026-08-26',
    })
    expect(observaciones[1]?.winningNumber).toBe('6086')
  })
})

describe('Loterias de Hoy', () => {
  it('lee numero, serie, fecha sin preposiciones y numero de sorteo', () => {
    const [observacion] = extractLoteriasDeHoy(LOTERIASDEHOY_CRUZ_ROJA)
    expect(observacion).toMatchObject({
      lotteryCode: 'cruz_roja',
      winningNumber: '7132',
      series: '250',
      officialDate: '2026-09-01',
      drawNumber: '3169',
    })
  })

  it('conserva los ceros iniciales', () => {
    expect(extractLoteriasDeHoy(LOTERIASDEHOY_CEROS)[0]?.winningNumber).toBe('0046')
  })

  it('varios bloques en la misma pagina no se mezclan entre si', () => {
    const observaciones = extractLoteriasDeHoy(LOTERIASDEHOY_CRUZ_ROJA + LOTERIASDEHOY_META)
    expect(observaciones.map((o) => `${o.lotteryCode}:${o.winningNumber}`)).toEqual([
      'cruz_roja:7132',
      'meta:8134',
    ])
  })
})

describe('ruido que no es un resultado', () => {
  it('ningun lector saca un numero de estilos, scripts o banners', () => {
    expect(extractPerlatodoIndex(RUIDO_QUE_NO_ES_RESULTADO)).toEqual([])
    expect(extractGanarChanceIndex(RUIDO_QUE_NO_ES_RESULTADO)).toEqual([])
    expect(extractGanarChanceLottery(RUIDO_QUE_NO_ES_RESULTADO, 'meta')).toEqual([])
    expect(extractLoteriasDeHoy(RUIDO_QUE_NO_ES_RESULTADO)).toEqual([])
  })

  it('el ruido pegado a un resultado real no cambia lo que se lee', () => {
    const [observacion] = extractLoteriasDeHoy(RUIDO_QUE_NO_ES_RESULTADO + LOTERIASDEHOY_CRUZ_ROJA)
    expect(observacion?.winningNumber).toBe('7132')
  })
})

describe('las dos listas de dominios no se mezclan', () => {
  it('ningun host alternativo esta en la lista oficial', () => {
    for (const host of ALLOWED_ALTERNATIVE_HOSTS) {
      expect(ALLOWED_SOURCE_HOSTS as readonly string[]).not.toContain(host)
    }
  })

  it('ningun host oficial esta en la lista alternativa', () => {
    for (const host of ALLOWED_SOURCE_HOSTS) {
      expect(ALLOWED_ALTERNATIVE_HOSTS).not.toContain(host)
    }
  })

  it('cada fuente declara un host que su propia lista autoriza', () => {
    for (const source of ALTERNATIVE_SOURCES) {
      expect(ALLOWED_ALTERNATIVE_HOSTS).toContain(source.host)
    }
  })

  it('toda URL de una fuente alternativa es HTTPS y de su dominio', () => {
    for (const source of ALTERNATIVE_SOURCES) {
      const urls = [source.indexUrl, alternativeUrlFor(source.id, 'meta')].filter(
        (url): url is string => url !== null,
      )
      for (const url of urls) {
        expect(url.startsWith('https://')).toBe(true)
        expect(ALLOWED_ALTERNATIVE_HOSTS).toContain(new URL(url).hostname)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Consenso: lo que decide es cuantos DOMINIOS distintos coinciden
// ---------------------------------------------------------------------------

const SORTEO = {
  scheduleId: '11111111-1111-4111-8111-111111111111',
  lotteryCode: 'cruz_roja' as const,
  drawNumber: '3169',
  officialDate: '2026-09-01',
}

function fuente(html: string) {
  return async (sourceId: string) => ({
    ok: true as const,
    value: {
      sourceId: sourceId as never,
      sourceUrl: `https://${sourceId}.test/`,
      contentHash: 'a'.repeat(64),
      fetchedAt: '2026-09-02T12:00:00.000Z',
      observations:
        sourceId === 'perlatodo'
          ? extractPerlatodoIndex(html)
          : sourceId === 'ganarchance'
            ? extractGanarChanceIndex(html)
            : extractLoteriasDeHoy(html),
    },
    sourceUrl: `https://${sourceId}.test/`,
    contentType: 'text/html',
    contentHash: 'a'.repeat(64),
    fetchedAt: '2026-09-02T12:00:00.000Z',
  })
}

/** Una fuente que dice exactamente este numero para el sorteo esperado. */
function conNumero(sourceId: string, winningNumber: string) {
  return {
    ok: true as const,
    value: {
      sourceId: sourceId as never,
      sourceUrl: `https://${sourceId}.test/`,
      contentHash: 'c'.repeat(64),
      fetchedAt: '2026-09-02T12:00:00.000Z',
      observations: [
        {
          lotteryCode: 'cruz_roja' as const,
          officialDate: '2026-09-01',
          winningNumber,
          series: null,
          drawNumber: null,
        },
      ],
    },
    sourceUrl: `https://${sourceId}.test/`,
    contentType: 'text/html',
    contentHash: 'c'.repeat(64),
    fetchedAt: '2026-09-02T12:00:00.000Z',
  } as never
}

function clienteFalso() {
  const llamadas: unknown[] = []
  return {
    llamadas,
    rpc: vi.fn(async (_name: string, args: unknown) => {
      llamadas.push(args)
      return { data: { stored: 0, consensus: false }, error: null }
    }),
  }
}

describe('recoleccion de observaciones para un sorteo', () => {
  it('descarga una pagina compartida UNA sola vez por tick', async () => {
    const descargas: string[] = []
    const cache = createTickPageCache()
    const download = vi.fn(async (sourceId: string) => {
      descargas.push(sourceId)
      return (await fuente(PERLATODO_INDICE)(sourceId)) as never
    })
    const client = clienteFalso()

    // Dos sorteos distintos, el mismo tick y la misma caché.
    for (const drawNumber of ['3169', '3170']) {
      await collectConsensusForDraw(
        client as never,
        { ...SORTEO, drawNumber },
        { budget: 6, cache, download: download as never },
      )
    }

    // `perlatodo` es una fuente `index`: se pidió una vez, no dos.
    expect(descargas.filter((s) => s === 'perlatodo')).toHaveLength(1)
  })

  it('no gasta una descarga mas en cuanto tiene consenso', async () => {
    const descargas: string[] = []
    const download = vi.fn(async (sourceId: string) => {
      descargas.push(sourceId)
      // Paga Todo bloqueada, como en la realidad; las dos siguientes coinciden.
      if (sourceId === 'pagatodo') {
        return {
          ok: false as const,
          code: 'source_blocked' as const,
          message: 'bloqueada',
        } as never
      }
      return conNumero(sourceId, '7132')
    })
    const client = clienteFalso()

    const resultado = await collectConsensusForDraw(client as never, SORTEO, {
      budget: 6,
      cache: createTickPageCache(),
      download: download as never,
    })

    // pagatodo (falla) + perlatodo + ganarchance = para al llegar a dos.
    expect(descargas).toEqual(['pagatodo', 'perlatodo', 'ganarchance'])
    expect(resultado.downloads).toBe(3)
    expect(descargas).not.toContain('loteriasdehoy')
  })

  it('una fuente bloqueada no impide que las demas se consulten', async () => {
    const download = vi.fn(async (sourceId: string) => {
      if (sourceId === 'pagatodo') {
        return {
          ok: false as const,
          code: 'source_blocked' as const,
          message: 'bloqueada',
        } as never
      }
      return conNumero(sourceId, '7132')
    })
    const client = clienteFalso()

    const resultado = await collectConsensusForDraw(client as never, SORTEO, {
      budget: 6,
      cache: createTickPageCache(),
      download: download as never,
    })

    expect(resultado.attempts[0]).toMatchObject({ sourceId: 'pagatodo', ok: false })
    expect(resultado.attempts.filter((a) => a.ok).length).toBeGreaterThanOrEqual(2)
    expect(client.rpc).toHaveBeenCalledOnce()
  })

  it('nunca supera el presupuesto que se le da', async () => {
    const descargas: string[] = []
    const download = vi.fn(async (sourceId: string) => {
      descargas.push(sourceId)
      return { ok: false as const, code: 'source_blocked' as const, message: 'x' } as never
    })

    const resultado = await collectConsensusForDraw(clienteFalso() as never, SORTEO, {
      budget: 2,
      cache: createTickPageCache(),
      download: download as never,
    })

    expect(resultado.downloads).toBe(2)
    expect(descargas).toHaveLength(2)
  })

  it('una respuesta con la fecha de otro dia no llega a la base', async () => {
    const download = vi.fn(
      async (sourceId: string) => (await fuente(LOTERIASDEHOY_DIA_ANTERIOR)(sourceId)) as never,
    )
    const client = clienteFalso()

    const resultado = await collectConsensusForDraw(client as never, SORTEO, {
      budget: 6,
      cache: createTickPageCache(),
      download: download as never,
    })

    // El sorteo esperado es el 3169 del 2026-09-01; la pagina trae el 3168 del
    // 2026-08-25. No hay ni una observacion, y la RPC no se llama.
    expect(resultado.attempts.every((a) => a.matched === 0)).toBe(true)
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('una fuente que da dos numeros para el mismo sorteo se descarta entera', async () => {
    const download = vi.fn(async (sourceId: string) => {
      const observations = [
        ...extractLoteriasDeHoy(LOTERIASDEHOY_CRUZ_ROJA),
        {
          lotteryCode: 'cruz_roja' as const,
          officialDate: '2026-09-01',
          winningNumber: '9999',
          series: null,
          drawNumber: '3169',
        },
      ]
      return {
        ok: true as const,
        value: {
          sourceId: sourceId as never,
          sourceUrl: `https://${sourceId}.test/`,
          contentHash: 'b'.repeat(64),
          fetchedAt: '2026-09-02T12:00:00.000Z',
          observations,
        },
        sourceUrl: `https://${sourceId}.test/`,
        contentType: 'text/html',
        contentHash: 'b'.repeat(64),
        fetchedAt: '2026-09-02T12:00:00.000Z',
      } as never
    })
    const client = clienteFalso()

    await collectConsensusForDraw(client as never, SORTEO, {
      budget: 6,
      cache: createTickPageCache(),
      download: download as never,
    })

    // Ninguna fuente aporta una observacion inequivoca, asi que no hay nada
    // que guardar: ante la duda no se elige un numero.
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('el minimo de fuentes del consenso es dos, y no es configurable', () => {
    expect(ALTERNATIVE_CONSENSUS_MIN_SOURCES).toBe(2)
  })
})
