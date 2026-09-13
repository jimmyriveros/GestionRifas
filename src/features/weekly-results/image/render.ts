import 'server-only'

import { ImageResponse } from 'next/og'

import type { WeeklyLotteryResult } from '../results'
import type { ResultsWeek } from '../week'
import { loadWeeklyResultsImageAssets } from './assets'
import { WEEKLY_RESULTS_IMAGE_SIZE, weeklyResultsImage } from './WeeklyResultsImage'

/**
 * El PNG de la semana, entero, en memoria (BR-H04, D-194).
 *
 * SE ESPERA AL ÚLTIMO BYTE antes de responder. `ImageResponse` devuelve una
 * respuesta 200 en cuanto se crea y dibuja mientras la envía, así que un fallo
 * de Satori llegaría como un PNG cortado con estado 200. Leyéndola aquí, un
 * fallo es una excepción que la ruta convierte en un 500 sin detalles, y la
 * respuesta lleva su `Content-Length` real. Una imagen pesa del orden de 1,6 MB.
 *
 * Sin caché de ningún tipo: se genera cuando se pide (BR-H08).
 */
export async function renderWeeklyResultsPng(input: {
  raffleName: string
  week: ResultsWeek
  results: readonly WeeklyLotteryResult[]
}): Promise<ArrayBuffer> {
  const assets = await loadWeeklyResultsImageAssets()
  const element = weeklyResultsImage({
    ...input,
    backgroundSrc: assets.backgroundSrc,
    metrics: assets.metrics,
  })
  const image = new ImageResponse(element, { ...WEEKLY_RESULTS_IMAGE_SIZE, fonts: assets.fonts })
  return image.arrayBuffer()
}
