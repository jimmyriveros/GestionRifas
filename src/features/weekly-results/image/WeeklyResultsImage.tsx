/**
 * La composición del PNG de «Resultados de la semana» (BR-H04, D-194).
 *
 * PURO: recibe los datos ya leídos, el fondo ya cargado y las medidas de la
 * fuente, y devuelve el árbol que dibuja Satori. No lee archivos, ni la base, ni
 * la hora. Por eso la misma entrada da SIEMPRE la misma imagen —la misma para
 * todos los vendedores de una misma rifa— y las pruebas pueden recorrer el árbol
 * sin generar ningún PNG.
 *
 * LO QUE SATORI ADMITE MANDA SOBRE CÓMO SE ESCRIBE (guía de `ImageResponse`):
 * solo flexbox y posición absoluta —nada de `grid`—, todo `div` con más de un
 * hijo lleva `display: flex`, y los estilos van en línea. Las filas y columnas
 * de las tarjetas son explícitas.
 *
 * LOS ESPACIOS DE LA IMAGEN NO SE PUEDEN PARTIR (U+00A0). Satori mide cada tramo
 * entre dos puntos de corte sin interletraje y lo dibuja con él, así que con un
 * espacio normal deja un hueco de más detrás de cada palabra con pares como «LT»
 * o «TA»: «RESULTADOS␣␣DE LA SEMANA». Un texto sin puntos de corte se mide y se
 * dibuja entero, y el hueco sobrante queda al final, donde no se ve. Los saltos
 * de línea del nombre no los decide Satori: los decide `fitRaffleName` con las
 * medidas de la fuente (D-194).
 *
 * EL FONDO ES LA ÚNICA FUENTE DEL ARTE: vehículo, monedas, regalo, tickets,
 * confeti, humo, arco de luz y resplandores vienen dibujados en él. Aquí solo se
 * añade lo variable —el nombre, la semana, los seis números— y lo que lo hace
 * legible encima: un velo oscuro, las tarjetas y sus sombras.
 *
 * LAS MEDIDAS salen de la referencia aprobada (1122 × 1402) escalada a
 * 1080 × 1350, y se afinaron comparando las dos imágenes lado a lado
 * (`TEST_RESULTS`, 2026-09-13).
 */

import { createElement, type CSSProperties, type ReactElement } from 'react'

import { LOTTERY_CODES } from '@/features/lottery/constants'

import { WEEKLY_RESULTS_COPY } from '../copy'
import type { WeeklyLotteryResult } from '../results'
import { formatWeekShort, type ResultsWeek } from '../week'
import type { FontMetrics } from './font-metrics'
import {
  WEEKLY_RESULTS_CALENDAR_ICON,
  WEEKLY_RESULTS_LOTTERY_ICONS,
  type LucideIconNode,
} from './icons'

export const WEEKLY_RESULTS_IMAGE_SIZE = { width: 1080, height: 1350 } as const

/** El nombre con el que se registran las fuentes en `ImageResponse`. */
export const WEEKLY_RESULTS_FONT_FAMILY = 'Geist'

const WIDTH = WEEKLY_RESULTS_IMAGE_SIZE.width
const HEIGHT = WEEKLY_RESULTS_IMAGE_SIZE.height

/** La paleta del encargo. Vive solo aquí: la aplicación usa sus tokens; la imagen, no. */
const COLORS = {
  dark: '#080018',
  deep: '#191527',
  violet: '#843BEC',
  lilac: '#BB7EFF',
  lilacLight: '#D2C7FF',
  lime: '#B8ED50',
  white: '#FFFFFF',
} as const

/** Margen de seguridad a cada lado: nada que se lea queda más cerca del borde. */
const SIDE = 44
const CONTENT_WIDTH = WIDTH - SIDE * 2

/** Donde termina la cápsula de la semana. El nombre, el título y la cápsula se apilan hacia arriba desde aquí. */
const HEADER_BOTTOM = 660

const DAILY = {
  top: 700,
  columnGap: 16,
  rowGap: 14,
  height: 96,
  labelSize: 19,
  numberSize: 58,
} as const
const DAILY_CARD_WIDTH = (CONTENT_WIDTH - DAILY.columnGap) / 2

const WEEKLY = { top: 1036, height: 150, numberSize: 100 } as const
const FOOTER = { top: 1222, height: 62 } as const

const TITLE_SIZE = 50

/** Espacio de no separación. Ver arriba por qué ningún texto de la imagen lleva espacios normales. */
const NBSP = '\u00A0'

function unbreakable(text: string): string {
  return text.replaceAll(' ', NBSP)
}

/* ---------------------------------------------------------------------------
 * El nombre de la rifa: medirlo para que nunca se corte.
 * ------------------------------------------------------------------------- */

/** Ancho máximo de una línea del nombre: el lienzo menos 60 px por lado. */
export const RAFFLE_NAME_MAX_WIDTH = 960

/** De mayor a menor. Se usa el primero en el que el nombre cabe en las líneas que ese tamaño permite. */
const RAFFLE_NAME_SIZES = [84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32, 28] as const

const RAFFLE_NAME_LINE_HEIGHT = 1.04

/**
 * Cuántas líneas admite cada tamaño.
 *
 * Una línea grande antes que dos medianas: un nombre corto se lee de un golpe.
 * Con 28 px caben cuatro, que es lo que hace falta para los 120 caracteres que
 * admite `raffles.name` aunque fueran todos «W» —la letra más ancha de Geist—.
 */
function raffleNameMaxLines(fontSize: number): number {
  if (fontSize >= 60) return 1
  if (fontSize >= 44) return 2
  if (fontSize >= 36) return 3
  return 4
}

/**
 * Lo que mide un texto en píxeles a ese tamaño, con los avances reales de la
 * fuente y sin interletraje.
 *
 * Sin interletraje es lo que mide Satori para colocar, y lo dibujado nunca es
 * más ancho: el interletraje de Geist solo acerca letras. Por eso lo que cabe
 * medido así, cabe dibujado.
 */
export function textWidth(text: string, fontSize: number, metrics: FontMetrics): number {
  let em = 0
  for (const char of text) em += metrics.advance(char)
  return em * fontSize
}

/**
 * El nombre de la rifa tal como se dibuja: en mayúsculas y SOLO con los
 * caracteres que la fuente trae.
 *
 * No se reinterpreta nada —el texto es `raffles.name`—; lo único que se quita es
 * lo que la fuente no puede dibujar (un emoji, un símbolo), porque `@vercel/og`
 * iría a buscarlo a internet durante la generación. La pantalla sigue enseñando
 * el nombre completo.
 */
export function raffleNameForImage(name: string, metrics: FontMetrics): string {
  return Array.from(name.normalize('NFC').toLocaleUpperCase('es-CO'))
    .filter((char) => /\s/u.test(char) || metrics.hasGlyph(char))
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
}

export type RaffleNameLayout = { fontSize: number; lines: string[][] }

/** Parte una palabra que no cabe ni sola en una línea. Solo pasa con nombres absurdos, pero no se corta nada. */
function splitWord(word: string, fontSize: number, metrics: FontMetrics): string[] {
  if (textWidth(word, fontSize, metrics) <= RAFFLE_NAME_MAX_WIDTH) return [word]
  const pieces: string[] = []
  let piece = ''
  for (const char of word) {
    if (piece !== '' && textWidth(piece + char, fontSize, metrics) > RAFFLE_NAME_MAX_WIDTH) {
      pieces.push(piece)
      piece = char
    } else {
      piece += char
    }
  }
  if (piece !== '') pieces.push(piece)
  return pieces
}

/** Reparte las palabras en líneas que caben, en orden y sin reordenar nada. */
function wrapRaffleName(
  words: readonly string[],
  fontSize: number,
  metrics: FontMetrics,
): string[][] {
  const space = metrics.advance(' ') * fontSize
  const lines: string[][] = []
  let line: string[] = []
  let lineWidth = 0
  for (const word of words.flatMap((item) => splitWord(item, fontSize, metrics))) {
    const wordWidth = textWidth(word, fontSize, metrics)
    const widthWithWord = line.length === 0 ? wordWidth : lineWidth + space + wordWidth
    if (line.length > 0 && widthWithWord > RAFFLE_NAME_MAX_WIDTH) {
      lines.push(line)
      line = [word]
      lineWidth = wordWidth
    } else {
      line.push(word)
      lineWidth = widthWithWord
    }
  }
  if (line.length > 0) lines.push(line)
  return lines
}

/**
 * El tamaño y las líneas del nombre (BR-H04).
 *
 * Las líneas se deciden AQUÍ, con las medidas de la fuente, y no se deja a
 * Satori partir el texto: así lo que se mide es exactamente lo que se dibuja, y
 * una prueba puede demostrar que ningún nombre admitido se sale del lienzo.
 */
export function fitRaffleName(name: string, metrics: FontMetrics): RaffleNameLayout {
  const words = name.split(' ').filter((word) => word !== '')
  let layout: RaffleNameLayout = { fontSize: RAFFLE_NAME_SIZES[0], lines: [words] }
  for (const fontSize of RAFFLE_NAME_SIZES) {
    layout = { fontSize, lines: wrapRaffleName(words, fontSize, metrics) }
    if (layout.lines.length <= raffleNameMaxLines(fontSize)) return layout
  }
  return layout
}

/* ---------------------------------------------------------------------------
 * Piezas de la composición. Funciones que devuelven elementos, no componentes:
 * Satori recorre el árbol y no ejecuta React.
 * ------------------------------------------------------------------------- */

function svgIcon(node: LucideIconNode, size: number, color: string, strokeWidth = 2): ReactElement {
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    ...node.map(([element, attributes], index) =>
      createElement(element, { ...attributes, key: `${element}-${index}` }),
    ),
  )
}

/** Texto rellenado con un degradado vertical. */
function gradientText(top: string, bottom: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`,
    backgroundClip: 'text',
    color: 'transparent',
  }
}

/**
 * Dos tonos EN UN SOLO NODO: blanco hasta `whiteUntil` píxeles y el degradado
 * lila a partir de ahí, como «KIA» y «NIRO HÍBRIDA 2027» en la referencia.
 *
 * Es UN degradado horizontal con un corte duro. No se pueden superponer dos capas:
 * recortado al texto, Satori solo pinta una. Y partirlo en dos nodos devolvería
 * el hueco de más que se evita con los espacios de no separación.
 */
function twoToneText(whiteUntil: number): CSSProperties {
  const cut = Math.round(whiteUntil)
  return {
    backgroundImage: `linear-gradient(90deg, ${COLORS.white} 0px, ${COLORS.white} ${cut}px, #EADFFF ${cut}px, ${COLORS.lilac} 100%)`,
    backgroundClip: 'text',
    color: 'transparent',
  }
}

/** La línea decorativa que acompaña a un texto centrado, desvaneciéndose hacia fuera. */
function flankLine(width: number, side: 'left' | 'right'): ReactElement {
  const fade = 'rgba(187, 126, 255, 0)'
  const solid = 'rgba(187, 126, 255, 0.9)'
  return (
    <div
      style={{
        display: 'flex',
        width,
        height: 3,
        borderRadius: 2,
        backgroundImage:
          side === 'left'
            ? `linear-gradient(90deg, ${fade} 0%, ${solid} 100%)`
            : `linear-gradient(90deg, ${solid} 0%, ${fade} 100%)`,
      }}
    />
  )
}

/** Oscurece la franja del título sin tocar el vehículo: empieza bajo las ruedas. */
function legibilityVeil(): ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 392,
        width: WIDTH,
        height: 320,
        display: 'flex',
        backgroundImage:
          'linear-gradient(180deg, rgba(8, 0, 24, 0) 0%, rgba(8, 0, 24, 0.5) 38%, rgba(8, 0, 24, 0.42) 78%, rgba(8, 0, 24, 0) 100%)',
      }}
    />
  )
}

const TEXT_GLOW = '0 0 24px rgba(132, 59, 236, 0.85)'

/**
 * Un texto con resplandor violeta Y con su propio relleno.
 *
 * Satori no puede hacer las dos cosas en un mismo nodo: con `textShadow`, un
 * texto recortado a su degradado sale teñido entero de violeta y el blanco
 * desaparece. Así que son DOS nodos con el mismo texto y la misma tipografía,
 * uno encima del otro: debajo, el resplandor; encima, el relleno sin sombra.
 * Como miden exactamente lo mismo, el de abajo solo asoma por el halo.
 */
function glowingText(text: string, typography: CSSProperties, fill: CSSProperties): ReactElement {
  return (
    <div style={{ display: 'flex', position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          ...typography,
          color: COLORS.violet,
          textShadow: TEXT_GLOW,
        }}
      >
        {text}
      </div>
      <div style={{ display: 'flex', ...typography, ...fill }}>{text}</div>
    </div>
  )
}

function raffleNameBlock(
  { fontSize, lines }: RaffleNameLayout,
  metrics: FontMetrics,
): ReactElement {
  const space = metrics.advance(' ') * fontSize
  const typography: CSSProperties = {
    fontSize,
    fontWeight: 900,
    lineHeight: RAFFLE_NAME_LINE_HEIGHT,
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: RAFFLE_NAME_MAX_WIDTH,
        marginBottom: 6,
      }}
    >
      {lines.map((line, lineIndex) => {
        const firstWord = line[0] ?? ''
        // La primera palabra en blanco y el resto en lila, como la referencia.
        // Es solo color: el texto es el nombre guardado, entero y en orden. El
        // corte cae en mitad del espacio que sigue a la primera palabra.
        const fill =
          lineIndex > 0
            ? gradientText('#F3EBFF', COLORS.lilac)
            : line.length === 1
              ? { color: COLORS.white }
              : twoToneText(textWidth(firstWord, fontSize, metrics) + space / 2)
        return (
          <div key={`linea-${lineIndex}`} style={{ display: 'flex' }}>
            {glowingText(line.join(NBSP), typography, fill)}
          </div>
        )
      })}
    </div>
  )
}

function titleRow(metrics: FontMetrics): ReactElement {
  const title = WEEKLY_RESULTS_COPY.image.title
  const lead = title.slice(0, title.lastIndexOf(' '))
  const space = metrics.advance(' ') * TITLE_SIZE
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: CONTENT_WIDTH,
        height: 62,
        marginBottom: 24,
      }}
    >
      {flankLine(70, 'left')}
      <div style={{ display: 'flex', marginLeft: 22, marginRight: 22 }}>
        {glowingText(
          unbreakable(title),
          { fontSize: TITLE_SIZE, fontWeight: 900 },
          twoToneText(textWidth(lead, TITLE_SIZE, metrics) + space / 2),
        )}
      </div>
      {flankLine(70, 'right')}
    </div>
  )
}

function weekPill(week: ResultsWeek): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: CONTENT_WIDTH,
        height: 60,
      }}
    >
      {flankLine(118, 'left')}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 60,
          marginLeft: 26,
          marginRight: 26,
          paddingLeft: 30,
          paddingRight: 34,
          borderRadius: 30,
          border: `2px solid ${COLORS.violet}`,
          backgroundImage:
            'linear-gradient(180deg, rgba(132, 59, 236, 0.36) 0%, rgba(60, 26, 112, 0.34) 100%)',
          boxShadow: '0 0 26px rgba(132, 59, 236, 0.55)',
        }}
      >
        {svgIcon(WEEKLY_RESULTS_CALENDAR_ICON, 32, COLORS.lilacLight)}
        <div
          style={{
            display: 'flex',
            marginLeft: 18,
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: 2.5,
            color: COLORS.white,
          }}
        >
          {unbreakable(formatWeekShort(week))}
        </div>
      </div>
      {flankLine(118, 'right')}
    </div>
  )
}

/** El ancho de cuatro cifras de la más ancha: todos los números de una columna acaban a la misma altura. */
function numberBoxWidth(fontSize: number, metrics: FontMetrics): number {
  const widest = Math.max(...Array.from('0123456789', (digit) => metrics.advance(digit)))
  return Math.ceil(widest * 4 * fontSize) + 4
}

function dailyCard(result: WeeklyLotteryResult, numberBox: number, column: number): ReactElement {
  return (
    <div
      key={result.code}
      data-lottery={result.code}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: DAILY_CARD_WIDTH,
        height: DAILY.height,
        marginLeft: column === 0 ? 0 : DAILY.columnGap,
        paddingLeft: 18,
        paddingRight: 22,
        borderRadius: 18,
        border: '2px solid rgba(132, 59, 236, 0.8)',
        backgroundImage:
          'linear-gradient(180deg, rgba(38, 27, 66, 0.94) 0%, rgba(22, 16, 40, 0.94) 100%)',
        boxShadow: '0 0 20px rgba(132, 59, 236, 0.42)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: 60,
          height: 60,
          borderRadius: 30,
          border: '2px solid rgba(210, 199, 255, 0.55)',
          backgroundImage:
            'linear-gradient(145deg, rgba(132, 59, 236, 0.95) 0%, rgba(70, 30, 134, 0.95) 100%)',
          boxShadow: '0 0 14px rgba(132, 59, 236, 0.55)',
        }}
      >
        {svgIcon(
          WEEKLY_RESULTS_LOTTERY_ICONS[result.code],
          30,
          '#F3EBFF',
          result.code === 'cruz_roja' ? 3 : 2.2,
        )}
      </div>
      <div
        style={{
          display: 'flex',
          flexGrow: 1,
          flexShrink: 1,
          marginLeft: 16,
          fontSize: DAILY.labelSize,
          fontWeight: 800,
          letterSpacing: 0.5,
          color: COLORS.white,
        }}
      >
        {unbreakable(result.label.toLocaleUpperCase('es-CO'))}
      </div>
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          width: 2,
          height: 50,
          backgroundColor: 'rgba(187, 126, 255, 0.42)',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          flexShrink: 0,
          width: numberBox,
          marginLeft: 14,
          fontSize: DAILY.numberSize,
          fontWeight: 900,
          ...gradientText(COLORS.white, COLORS.lilacLight),
        }}
      >
        {result.winningNumber}
      </div>
    </div>
  )
}

function dailyCards(results: readonly WeeklyLotteryResult[], metrics: FontMetrics): ReactElement {
  const numberBox = numberBoxWidth(DAILY.numberSize, metrics)
  const rows: WeeklyLotteryResult[][] = []
  for (let index = 0; index < results.length; index += 2) rows.push(results.slice(index, index + 2))

  return (
    <div
      style={{
        position: 'absolute',
        left: SIDE,
        top: DAILY.top,
        width: CONTENT_WIDTH,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {rows.map((row, rowIndex) => (
        <div
          key={`fila-${rowIndex}`}
          style={{ display: 'flex', marginTop: rowIndex === 0 ? 0 : DAILY.rowGap }}
        >
          {row.map((result, column) => dailyCard(result, numberBox, column))}
        </div>
      ))}
    </div>
  )
}

function weeklyCard(result: WeeklyLotteryResult, metrics: FontMetrics): ReactElement {
  return (
    <div
      data-lottery={result.code}
      style={{
        position: 'absolute',
        left: SIDE,
        top: WEEKLY.top,
        width: CONTENT_WIDTH,
        height: WEEKLY.height,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 26,
        paddingRight: 34,
        borderRadius: 24,
        border: `3px solid ${COLORS.lime}`,
        backgroundImage:
          'linear-gradient(90deg, rgba(24, 34, 10, 0.95) 0%, rgba(10, 14, 8, 0.95) 100%)',
        boxShadow: '0 0 34px rgba(184, 237, 80, 0.5)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: 100,
          height: 100,
          borderRadius: 50,
          border: `4px solid ${COLORS.lime}`,
          backgroundColor: 'rgba(184, 237, 80, 0.1)',
          boxShadow: '0 0 20px rgba(184, 237, 80, 0.45)',
        }}
      >
        {svgIcon(WEEKLY_RESULTS_LOTTERY_ICONS[result.code], 52, COLORS.lime, 2.2)}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexGrow: 1,
          flexShrink: 1,
          marginLeft: 22,
        }}
      >
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 900, color: COLORS.white }}>
          {unbreakable(result.label.toLocaleUpperCase('es-CO'))}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 34,
            fontWeight: 900,
            color: COLORS.lime,
            marginLeft: 12,
            marginRight: 12,
          }}
        >
          •
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: 0.5,
            color: COLORS.lime,
          }}
        >
          {unbreakable(WEEKLY_RESULTS_COPY.image.weeklyResult)}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          width: 3,
          height: 88,
          backgroundColor: 'rgba(184, 237, 80, 0.5)',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          flexShrink: 0,
          width: numberBoxWidth(WEEKLY.numberSize, metrics),
          marginLeft: 22,
          fontSize: WEEKLY.numberSize,
          fontWeight: 900,
          ...gradientText('#E6FFB3', COLORS.lime),
        }}
      >
        {result.winningNumber}
      </div>
    </div>
  )
}

function footer(): ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: FOOTER.top,
        width: WIDTH,
        height: FOOTER.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {flankLine(150, 'left')}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: FOOTER.height,
          marginLeft: 28,
          marginRight: 28,
          paddingLeft: 40,
          paddingRight: 40,
          borderRadius: FOOTER.height / 2,
          border: '2px solid rgba(132, 59, 236, 0.85)',
          backgroundColor: 'rgba(25, 21, 39, 0.92)',
          boxShadow: '0 0 24px rgba(132, 59, 236, 0.45)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            fontWeight: 600,
            ...gradientText(COLORS.lilacLight, COLORS.lilac),
          }}
        >
          {unbreakable(WEEKLY_RESULTS_COPY.image.footer)}
        </div>
      </div>
      {flankLine(150, 'right')}
    </div>
  )
}

export type WeeklyResultsImageInput = {
  raffleName: string
  week: ResultsWeek
  results: readonly WeeklyLotteryResult[]
  /** El fondo maestro como `data:` URI. Lo carga `assets.ts`. */
  backgroundSrc: string
  metrics: FontMetrics
}

/**
 * El árbol de la imagen.
 *
 * LANZA si la semana no está completa: la ruta ya lo comprueba antes, pero una
 * imagen parcial no puede salir de aquí ni por descuido de quien llame (BR-H03).
 */
export function weeklyResultsImage({
  raffleName,
  week,
  results,
  backgroundSrc,
  metrics,
}: WeeklyResultsImageInput): ReactElement {
  const complete =
    results.length === LOTTERY_CODES.length &&
    results.every((result) => result.status === 'confirmed' && result.winningNumber !== null)
  const daily = results.filter((result) => result.matchField === 'daily_number')
  const weekly = results.find((result) => result.matchField === 'weekly_number')
  if (!complete || weekly === undefined) {
    throw new Error('La imagen solo se compone con los seis resultados confirmados')
  }

  const displayName = raffleNameForImage(raffleName, metrics)
  if (displayName === '') {
    throw new Error('El nombre de la rifa no tiene caracteres que la imagen pueda dibujar')
  }

  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: COLORS.dark,
        fontFamily: WEEKLY_RESULTS_FONT_FAMILY,
        color: COLORS.white,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori solo entiende <img>: next/image no existe dentro de un PNG. */}
      <img
        src={backgroundSrc}
        alt=""
        width={WIDTH}
        height={HEIGHT}
        style={{ position: 'absolute', top: 0, left: 0, width: WIDTH, height: HEIGHT }}
      />
      {legibilityVeil()}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: WIDTH,
          height: HEADER_BOTTOM,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        {raffleNameBlock(fitRaffleName(displayName, metrics), metrics)}
        {titleRow(metrics)}
        {weekPill(week)}
      </div>
      {dailyCards(daily, metrics)}
      {weeklyCard(weekly, metrics)}
      {footer()}
    </div>
  )
}
