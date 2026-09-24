// @vitest-environment node
/**
 * I-163 (D-223): la imagen de «Resultados de la semana» tiene que salir aunque
 * el optimizador de imágenes de Next haya cargado `sharp` antes en el mismo
 * proceso.
 *
 * El optimizador (`next/dist/server/image-optimizer`), la primera vez que carga
 * `sharp`, bloquea TODOS los cargadores de libvips y desbloquea solo HEIF, JPEG,
 * GIF, PNG, TIFF y WebP. El bloqueo es del proceso entero, así que el SVG que
 * genera Satori ya no tenía cargador cuando `next/og` se lo pasaba a `sharp`:
 * «Input buffer contains unsupported image format». Medido en local, en HEAD y
 * en 9acbfa8 (D-222).
 *
 * El arreglo es `registerOgRenderer`, el mismo que registra
 * `src/instrumentation.ts`: la prueba no imita el registro, lo llama.
 *
 * Se usa LA FUNCIÓN REAL del optimizador, no una imitación: si Next cambia su
 * bloqueo, esta prueba lo sigue midiendo. Va en su propio archivo porque el
 * bloqueo es global al proceso y Vitest aísla cada archivo en uno propio.
 *
 * Los fallos del proceso hijo, uno por uno, están en `og-renderer-child.test.ts`;
 * aquí se prueba el recorrido entero de una imagen que falla por el hijo.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

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
  it('el optimizador deja fuera el cargador SVG de sharp en este proceso', async () => {
    optimizer.getSharp(null, 0)
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')
    await expect(sharp(svg).png().toBuffer()).rejects.toThrow(/unsupported image format/)
  })

  it('aun así la imagen sale: PNG de 1080 × 1350', async () => {
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

  it('si el proceso hijo falla, esa imagen da un error y la siguiente sale', async () => {
    optimizer.getSharp(null, 0)
    const pedir = () =>
      renderWeeklyResultsPng({ raffleName: 'Rifa Navidad 2026', week: AUG, results: results() })
    // El fondo y las fuentes se leen una sola vez por proceso desde
    // `process.cwd()`: tras esta primera imagen, cambiar de directorio solo le
    // quita `sharp` al hijo. Su SVG, unos 400 KB, no cabe en la tubería.
    await pedir()
    const sinSharp = mkdtempSync(path.join(tmpdir(), 'og-renderer-sin-sharp-'))
    const antes = process.cwd()
    // Ninguna excepción sin capturar: en el servidor solo la contendría Next.
    const escapadas: unknown[] = []
    const anotar = (error: unknown) => escapadas.push(error)
    process.on('uncaughtException', anotar)
    try {
      process.chdir(sinSharp)
      await expect(pedir()).rejects.toThrow(
        /el proceso hijo terminó con 1[\s\S]*Cannot find module 'sharp'/,
      )
      await new Promise((listo) => setImmediate(listo))
    } finally {
      process.off('uncaughtException', anotar)
      process.chdir(antes)
      rmSync(sinSharp, { recursive: true, force: true })
    }
    expect(escapadas, 'excepciones sin capturar').toEqual([])
    expect(dimensiones(await pedir())).toEqual({
      firma: [137, 80, 78, 71, 13, 10, 26, 10],
      ancho: 1080,
      alto: 1350,
    })
  })
})
