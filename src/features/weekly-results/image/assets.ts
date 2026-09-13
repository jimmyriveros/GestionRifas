import 'server-only'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { readFontMetrics, type FontMetrics } from './font-metrics'
import { WEEKLY_RESULTS_FONT_FAMILY } from './WeeklyResultsImage'

/**
 * Lo que la imagen lee del disco: el fondo maestro y tres pesos de Geist (D-194).
 *
 * EL FONDO ES UN JPEG, NO EL WEBP DEL ENCARGO, y no por gusto: Satori —lo que
 * usa `ImageResponse`— solo decodifica PNG, APNG, JPEG, GIF y SVG. Con un WebP
 * falla al medir la imagen. El JPEG está a calidad 90 con croma completo, que en
 * las zonas de humo y degradados no se distingue del PNG original (D-195).
 *
 * LAS FUENTES VAN EN EL REPOSITORIO porque `next/og` solo trae Geist Regular, y
 * Satori no inventa negritas: sin estos archivos, todo el PNG saldría delgado.
 * Son las instancias estáticas de Geist bajo licencia OFL (`fonts/OFL.txt`), la
 * misma familia que usa la aplicación. Nada se descarga al generar.
 *
 * SE LEE UNA VEZ POR PROCESO: se guarda la promesa, así dos peticiones a la vez
 * no leen dos veces; si la lectura falla, se olvida para que la siguiente lo
 * vuelva a intentar en vez de heredar el fallo.
 *
 * RUTAS DESDE `process.cwd()`, como la guía de `ImageResponse`. En Vercel el
 * trazado de archivos no las adivina, y por eso `next.config.ts` las incluye con
 * `outputFileTracingIncludes` para esta ruta.
 */

export const WEEKLY_RESULTS_BACKGROUND_FILE =
  'public/images/weekly-results/weekly-results-background.jpg'

export const WEEKLY_RESULTS_FONTS_DIR = 'src/features/weekly-results/image/fonts'

const FONT_FILES = [
  { file: 'Geist-SemiBold.ttf', weight: 600 },
  { file: 'Geist-ExtraBold.ttf', weight: 800 },
  { file: 'Geist-Black.ttf', weight: 900 },
] as const

export type WeeklyResultsFont = {
  name: string
  data: ArrayBuffer
  weight: (typeof FONT_FILES)[number]['weight']
  style: 'normal'
}

export type WeeklyResultsImageAssets = {
  backgroundSrc: string
  fonts: WeeklyResultsFont[]
  /** Las medidas del peso más grueso, que es el del nombre de la rifa. */
  metrics: FontMetrics
}

let assets: Promise<WeeklyResultsImageAssets> | null = null

export function loadWeeklyResultsImageAssets(): Promise<WeeklyResultsImageAssets> {
  assets ??= readAssets().catch((error: unknown) => {
    assets = null
    throw error
  })
  return assets
}

function toArrayBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

async function readAssets(): Promise<WeeklyResultsImageAssets> {
  const root = process.cwd()
  const [background, fonts] = await Promise.all([
    readFile(join(root, WEEKLY_RESULTS_BACKGROUND_FILE)),
    Promise.all(
      FONT_FILES.map(async ({ file, weight }) => ({
        weight,
        data: await readFile(join(root, WEEKLY_RESULTS_FONTS_DIR, file)),
      })),
    ),
  ])

  const black = fonts.find((font) => font.weight === 900)
  if (black === undefined) throw new Error('Falta el peso 900 de Geist')

  return {
    backgroundSrc: `data:image/jpeg;base64,${background.toString('base64')}`,
    fonts: fonts.map(({ weight, data }) => ({
      name: WEEKLY_RESULTS_FONT_FAMILY,
      data: toArrayBuffer(data),
      weight,
      style: 'normal' as const,
    })),
    metrics: readFontMetrics(black.data),
  }
}
