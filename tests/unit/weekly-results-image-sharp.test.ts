// @vitest-environment node
/**
 * I-163 (D-223, D-226): la imagen de «Resultados de la semana» tiene que salir
 * aunque el optimizador de imágenes de Next haya cargado `sharp` antes en el
 * mismo proceso.
 *
 * El optimizador (`next/dist/server/image-optimizer`), la primera vez que carga
 * `sharp`, bloquea TODOS los cargadores de libvips y desbloquea una lista. Hasta
 * Next 16.3.5 esa lista no traía el SVG, y el que genera Satori ya no tenía
 * cargador cuando `next/og` se lo pasaba a `sharp` (D-222). D-223 lo rodeó con un
 * proceso hijo; desde Next 16.3.6 la lista trae `VipsForeignLoadSvg` y el hijo se
 * retiró (D-226), demostrado antes de quitarlo.
 *
 * Por eso la primera prueba es un VIGÍA: si una versión futura de Next vuelve a
 * quitar el cargador SVG, falla aquí antes que en la pantalla. En ese caso no se
 * relaja la prueba: se vuelve a evaluar I-163 (D-223, D-226).
 *
 * Se usa LA FUNCIÓN REAL del optimizador, no una imitación. Va en su propio
 * archivo porque el bloqueo es global al proceso y Vitest aísla cada archivo en
 * uno propio. El registro es `registerOgRenderer`, el mismo que
 * `src/instrumentation.ts`: la prueba no lo imita, lo llama.
 */
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'

import { LOTTERY_CODES, type LotteryCode } from '@/features/lottery/constants'
import { renderWeeklyResultsPng } from '@/features/weekly-results/image/render'
import { registerOgRenderer } from '@/lib/og-renderer'
import { buildWeeklyResults, type WeeklyLotteryResult } from '@/features/weekly-results/results'
import { lotteryReferenceDate, type ResultsWeek } from '@/features/weekly-results/week'

// `getSharp` es un export de CommonJS del optimizador de Next 16.3.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const optimizer = require('next/dist/server/image-optimizer') as {
  getSharp: (concurrency: number | null | undefined, cache: number | undefined) => unknown
}

const AUG: ResultsWeek = { monday: '2026-08-17', saturday: '2026-08-22' }
const NUMBERS: Record<LotteryCode, string> = {
  cundinamarca: '2718',
  cruz_roja: '3141',
  meta: '0046',
  bogota: '1618',
  medellin: '5772',
  boyaca: '0007',
}

function results(): WeeklyLotteryResult[] {
  const built = buildWeeklyResults(
    AUG,
    LOTTERY_CODES.map((code) => ({
      lotteryCode: code,
      referenceDate: lotteryReferenceDate(AUG, code),
      result: { winningNumber: NUMBERS[code], validationStatus: 'confirmed' as const },
    })),
  )
  if (built.kind !== 'ready') throw new Error('la semana de prueba tiene que estar lista')
  return built.results
}

function dimensiones(buffer: ArrayBuffer) {
  const png = new Uint8Array(buffer)
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return {
    firma: [...png.slice(0, 8)],
    ancho: view.getUint32(16),
    alto: view.getUint32(20),
  }
}

registerOgRenderer()

afterAll(() => {
  sharp.unblock({ operation: ['VipsForeignLoad'] })
})

describe('I-163 — la imagen semanal con el optimizador de Next ya cargado', () => {
  it('el optimizador deja disponible el cargador SVG de sharp en este proceso', async () => {
    optimizer.getSharp(null, 0)
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')
    const png = await sharp(svg)
      .png()
      .toBuffer()
      .catch((error: unknown) => {
        throw new Error(
          'El optimizador de Next volvió a quitar el cargador SVG de sharp: I-163 regresa y la ' +
            `imagen semanal fallará tras usar /_next/image. Revisa D-223 y D-226. (${String(error)})`,
        )
      })
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })

  it('la imagen sale: PNG de 1080 × 1350', async () => {
    optimizer.getSharp(null, 0)
    const png = await renderWeeklyResultsPng({
      raffleName: 'Rifa Navidad 2026',
      week: AUG,
      results: results(),
    })
    expect(dimensiones(png)).toEqual({
      firma: [137, 80, 78, 71, 13, 10, 26, 10],
      ancho: 1080,
      alto: 1350,
    })
  })
})
