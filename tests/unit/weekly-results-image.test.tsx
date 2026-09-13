// @vitest-environment node
/**
 * La imagen de «Resultados de la semana»: la fuente, el nombre que nunca se
 * corta, el árbol que se dibuja y un PNG de verdad (BR-H03, BR-H04, D-194).
 *
 * Se usa la fuente REAL del repositorio, no un doble: lo que se quiere demostrar
 * es que con Geist Black ningún nombre admitido por `raffles.name` se sale del
 * lienzo, y eso solo lo dicen sus medidas de verdad.
 *
 * El PNG se genera de verdad con `ImageResponse` y con `fetch` bloqueado: si la
 * composición pidiera algo a internet —una fuente o un emoji que faltan—, la
 * prueba lo vería.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { LOTTERY_CODES, type LotteryCode } from '@/features/lottery/constants'
import { WEEKLY_RESULTS_FONTS_DIR } from '@/features/weekly-results/image/assets'
import { readFontMetrics, type FontMetrics } from '@/features/weekly-results/image/font-metrics'
import {
  WEEKLY_RESULTS_CALENDAR_ICON,
  WEEKLY_RESULTS_LOTTERY_ICONS,
} from '@/features/weekly-results/image/icons'
import { renderWeeklyResultsPng } from '@/features/weekly-results/image/render'
import {
  fitRaffleName,
  RAFFLE_NAME_MAX_WIDTH,
  raffleNameForImage,
  textWidth,
  weeklyResultsImage,
} from '@/features/weekly-results/image/WeeklyResultsImage'
import { buildWeeklyResults, type WeeklyLotteryResult } from '@/features/weekly-results/results'
import {
  formatWeekShort,
  lotteryReferenceDate,
  type ResultsWeek,
} from '@/features/weekly-results/week'

const AUG: ResultsWeek = { monday: '2026-08-17', saturday: '2026-08-22' }

const NUMBERS: Record<LotteryCode, string> = {
  cundinamarca: '2718',
  cruz_roja: '3141',
  meta: '0046',
  bogota: '1618',
  medellin: '5772',
  boyaca: '0007',
}

const BACKGROUND = 'data:image/jpeg;base64,AAAA'

let metrics: FontMetrics

beforeAll(() => {
  metrics = readFontMetrics(
    readFileSync(join(process.cwd(), WEEKLY_RESULTS_FONTS_DIR, 'Geist-Black.ttf')),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

function readyResults(week: ResultsWeek = AUG): WeeklyLotteryResult[] {
  const built = buildWeeklyResults(
    week,
    LOTTERY_CODES.map((code) => ({
      lotteryCode: code,
      referenceDate: lotteryReferenceDate(week, code),
      result: { winningNumber: NUMBERS[code], validationStatus: 'confirmed' as const },
    })),
  )
  if (built.kind !== 'ready') throw new Error('la semana de prueba tiene que estar lista')
  return built.results
}

type AnyElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>

/** Recorre el árbol como lo recorre Satori: elementos y textos, sin ejecutar React. */
function collect(node: ReactNode, elements: AnyElement[] = [], texts: string[] = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return { elements, texts }
  if (typeof node === 'string' || typeof node === 'number') {
    // La imagen escribe sus espacios como U+00A0 (ver `WeeklyResultsImage`): se
    // leen como espacios normales para comparar con lo que dice la pantalla.
    texts.push(String(node).replaceAll('\u00A0', ' '))
    return { elements, texts }
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child as ReactNode, elements, texts)
    return { elements, texts }
  }
  if (isValidElement(node)) {
    const element = node as AnyElement
    elements.push(element)
    collect(element.props.children, elements, texts)
  }
  return { elements, texts }
}

describe('la fuente de la imagen, medida de verdad', () => {
  it('lee los avances de Geist Black: la W es la más ancha y la I, estrecha', () => {
    expect(metrics.advance('W')).toBeCloseTo(1.061, 2)
    expect(metrics.advance('I')).toBeCloseTo(0.32, 2)
    expect(metrics.advance(' ')).toBeCloseTo(0.214, 2)
  })

  it('trae todo lo que escribe la imagen, tildes y signos incluidos', () => {
    for (const char of 'ÁÉÍÓÚÑÜ–·0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      expect(metrics.hasGlyph(char), char).toBe(true)
    }
  })

  it('y NO trae emojis ni otros alfabetos: esos se pedirían a internet', () => {
    for (const char of ['🎄', '🎉', '中', 'ع', 'क'])
      expect(metrics.hasGlyph(char), char).toBe(false)
  })
})

describe('el nombre de la rifa, tal como se dibuja (BR-H04)', () => {
  it('en mayúsculas, con sus tildes y sin reinterpretar nada', () => {
    expect(raffleNameForImage('Kia Niro Híbrida 2027', metrics)).toBe('KIA NIRO HÍBRIDA 2027')
    expect(raffleNameForImage('Sorteo Camioneta KIA 2026', metrics)).toBe(
      'SORTEO CAMIONETA KIA 2026',
    )
  })

  it('sin los caracteres que la fuente no trae, para no descargarlos al generar', () => {
    expect(raffleNameForImage('🎄 Rifa  Navidad 2026 🎁', metrics)).toBe('RIFA NAVIDAD 2026')
  })

  it('una tilde escrita como carácter aparte se une a su letra', () => {
    expect(raffleNameForImage('Bogotá', metrics)).toBe('BOGOTÁ')
  })

  it('un nombre corriente cabe en una línea y grande', () => {
    const medium = fitRaffleName('KIA NIRO HÍBRIDA 2027', metrics)
    expect(medium.lines).toHaveLength(1)
    expect(medium.fontSize).toBeGreaterThanOrEqual(76)
    expect(fitRaffleName('SORTEO CAMIONETA KIA 2026', metrics).lines).toHaveLength(1)
  })

  it('ningún nombre admitido se sale del lienzo ni pierde un carácter', () => {
    const nombres = [
      'W'.repeat(120),
      'M'.repeat(60),
      'WWWW MMMM '.repeat(12).trim().slice(0, 120),
      'Gran rifa de fin de año con camioneta híbrida y premios para todos los clientes 2026',
      'Rifa',
      'SUPERCALIFRAGILISTICOESPIALIDOSO EXTRAORDINARIAMENTE',
    ]
    for (const nombre of nombres) {
      const texto = raffleNameForImage(nombre, metrics)
      const layout = fitRaffleName(texto, metrics)
      expect(layout.lines.length, nombre).toBeLessThanOrEqual(4)
      expect(layout.fontSize, nombre).toBeGreaterThanOrEqual(28)
      for (const line of layout.lines) {
        expect(textWidth(line.join(' '), layout.fontSize, metrics), nombre).toBeLessThanOrEqual(
          RAFFLE_NAME_MAX_WIDTH,
        )
      }
      expect(layout.lines.flat().join(''), nombre).toBe(texto.replaceAll(' ', ''))
    }
  })
})

describe('lo que se dibuja (BR-H03, BR-H04)', () => {
  function tree(raffleName = 'Kia Niro Híbrida 2027', results = readyResults()) {
    return collect(
      weeklyResultsImage({ raffleName, week: AUG, results, backgroundSrc: BACKGROUND, metrics }),
    )
  }

  it('el nombre, el título, la semana, las seis loterías y el pie', () => {
    const { texts } = tree()
    for (const expected of [
      'KIA NIRO HÍBRIDA 2027',
      'RESULTADOS DE LA SEMANA',
      formatWeekShort(AUG),
      'CUNDINAMARCA',
      'CRUZ ROJA',
      'META',
      'BOGOTÁ',
      'MEDELLÍN',
      'BOYACÁ',
      'RESULTADO SEMANAL',
      'Verifica tu boleta',
    ]) {
      expect(texts, expected).toContain(expected)
    }
  })

  it('los seis números exactos, con sus ceros', () => {
    const { texts } = tree()
    for (const number of Object.values(NUMBERS)) expect(texts).toContain(number)
    expect(texts).not.toContain('46')
    expect(texts).not.toContain('7')
  })

  it('una tarjeta por lotería, en el orden de la semana, con su icono de lucide', () => {
    const { elements } = tree()
    const lotteries = elements
      .map((element) => element.props['data-lottery'])
      .filter((value): value is string => typeof value === 'string')
    expect(lotteries).toEqual([...LOTTERY_CODES])
    // Seis iconos de lotería y el calendario de la semana.
    expect(elements.filter((element) => element.type === 'svg')).toHaveLength(7)
  })

  it('el fondo va como una sola capa del tamaño del lienzo', () => {
    const images = tree().elements.filter((element) => element.type === 'img')
    expect(images).toHaveLength(1)
    expect(images[0]?.props).toMatchObject({ src: BACKGROUND, width: 1080, height: 1350 })
  })

  it('ningún texto lleva un espacio que Satori pueda partir', () => {
    // Con un espacio normal Satori deja un hueco de más tras «RESULTADOS» (D-194).
    const raw: string[] = []
    const walk = (node: ReactNode): void => {
      if (typeof node === 'string') raw.push(node)
      else if (Array.isArray(node)) node.forEach((child) => walk(child as ReactNode))
      else if (isValidElement(node)) walk((node as AnyElement).props.children)
    }
    walk(
      weeklyResultsImage({
        raffleName: 'Sorteo Camioneta KIA 2026',
        week: AUG,
        results: readyResults(),
        backgroundSrc: BACKGROUND,
        metrics,
      }),
    )
    for (const text of raw) expect(text, JSON.stringify(text)).not.toContain(' ')
  })

  it('sin grid, que Satori no dibuja', () => {
    for (const element of tree().elements) {
      const style = element.props.style as { display?: string } | undefined
      expect(style?.display).not.toBe('grid')
    }
  })

  it('nada de ganadores, series, teléfonos ni clientes', () => {
    const joined = tree().texts.join(' | ')
    expect(joined).not.toMatch(/ganador|serie|cliente|\+57|\d{10}/i)
  })

  it('la misma entrada da exactamente el mismo árbol', () => {
    const input = {
      raffleName: 'Rifa 2026',
      week: AUG,
      results: readyResults(),
      backgroundSrc: BACKGROUND,
      metrics,
    }
    expect(JSON.stringify(weeklyResultsImage(input))).toBe(
      JSON.stringify(weeklyResultsImage(input)),
    )
  })

  it('NUNCA compone una imagen parcial', () => {
    const pendiente = readyResults().map((item) =>
      item.code === 'meta' ? { ...item, status: 'pending' as const, winningNumber: null } : item,
    )
    expect(() => tree('Rifa 2026', pendiente)).toThrow()
    expect(() => tree('Rifa 2026', readyResults().slice(0, 5))).toThrow()
  })

  it('un nombre sin nada que dibujar no produce una imagen sin título', () => {
    expect(() => tree('🎄🎁')).toThrow()
  })
})

describe('los iconos salen de lucide, con sus trazos', () => {
  it('cada lotería y el calendario traen elementos SVG de verdad', () => {
    const permitidos = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'])
    for (const node of [
      ...Object.values(WEEKLY_RESULTS_LOTTERY_ICONS),
      WEEKLY_RESULTS_CALENDAR_ICON,
    ]) {
      expect(node.length).toBeGreaterThan(0)
      for (const [element] of node) expect(permitidos.has(element), element).toBe(true)
    }
  })
})

describe('un PNG de verdad', () => {
  it('1080 × 1350, PNG, y sin pedir nada a internet', { timeout: 60_000 }, async () => {
    // `@vercel/og` carga su WebAssembly con `fetch` sobre una dirección `data:`,
    // que está en memoria: eso se deja pasar. Cualquier OTRA dirección sería
    // una descarga de verdad —una fuente o un emoji que faltan— y se bloquea y
    // se anota.
    const realFetch = globalThis.fetch
    const network: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith('data:')) return realFetch(input, init)
      network.push(url)
      throw new Error('sin red')
    })

    const png = new Uint8Array(
      await renderWeeklyResultsPng({
        raffleName: '🎄 Sorteo Camioneta KIA 2026',
        week: AUG,
        results: readyResults(),
      }),
    )

    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    expect(view.getUint32(16)).toBe(1080)
    expect(view.getUint32(20)).toBe(1350)
    expect(network).toEqual([])
  })
})
