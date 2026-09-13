/**
 * Lo que la imagen necesita saber de su fuente: qué caracteres trae y cuánto
 * mide cada uno (BR-H04, D-194).
 *
 * POR QUÉ SE LEE LA FUENTE A MANO. Satori no avisa cuando un texto no cabe: lo
 * pinta y lo deja salirse del lienzo. El nombre de la rifa lo escribe una persona
 * y mide de 2 a 120 caracteres (`raffles.name`), así que la única forma de
 * garantizar que nunca se corta es MEDIRLO antes de componerlo.
 *
 * Y HAY UNA RAZÓN DE SEGURIDAD. Cuando un carácter no está en la fuente —un
 * emoji, un símbolo raro—, `@vercel/og` lo pide a internet (Google Fonts o el CDN
 * de Twemoji) en mitad de la generación. Saber qué glifos hay permite no dibujar
 * esos caracteres, y que la imagen no consulte nada afuera.
 *
 * Solo lee las dos tablas que hacen falta de un TrueType —`cmap` en formato 4
 * (Unicode, plano básico) y `hmtx`—, sin dependencias. Si la fuente no tiene esa
 * forma, lanza: componer sin medir es justo lo que se quiere evitar.
 */

export type FontMetrics = {
  /** `true` si la fuente trae un glifo para ese carácter. */
  hasGlyph: (char: string) => boolean
  /** Lo que avanza ese carácter, en em: 1 es el tamaño de la letra. */
  advance: (char: string) => number
}

function tag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

export function readFontMetrics(data: Uint8Array): FontMetrics {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  const tables = new Map<string, number>()
  const numTables = view.getUint16(4)
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16
    tables.set(tag(view, record), view.getUint32(record + 8))
  }

  const table = (name: string): number => {
    const offset = tables.get(name)
    if (offset === undefined) throw new Error(`La fuente no tiene la tabla ${name}`)
    return offset
  }

  const unitsPerEm = view.getUint16(table('head') + 18)
  const numberOfHMetrics = view.getUint16(table('hhea') + 34)
  const hmtx = table('hmtx')
  const cmap = table('cmap')

  let subtable = -1
  const numSubtables = view.getUint16(cmap + 2)
  for (let index = 0; index < numSubtables; index += 1) {
    const platform = view.getUint16(cmap + 4 + index * 8)
    const encoding = view.getUint16(cmap + 6 + index * 8)
    const offset = cmap + view.getUint32(cmap + 8 + index * 8)
    if (platform === 3 && encoding === 1 && view.getUint16(offset) === 4) subtable = offset
  }
  if (subtable < 0) throw new Error('La fuente no tiene una tabla Unicode de formato 4')

  const segmentCount = view.getUint16(subtable + 6) / 2
  const endCodes = subtable + 14
  const startCodes = endCodes + segmentCount * 2 + 2
  const idDeltas = startCodes + segmentCount * 2
  const idRangeOffsets = idDeltas + segmentCount * 2

  function glyphIndex(codePoint: number): number {
    if (codePoint > 0xffff) return 0
    for (let segment = 0; segment < segmentCount; segment += 1) {
      if (codePoint > view.getUint16(endCodes + segment * 2)) continue
      const start = view.getUint16(startCodes + segment * 2)
      if (codePoint < start) return 0
      const delta = view.getUint16(idDeltas + segment * 2)
      const rangeOffset = view.getUint16(idRangeOffsets + segment * 2)
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff
      const glyph = view.getUint16(
        idRangeOffsets + segment * 2 + rangeOffset + (codePoint - start) * 2,
      )
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff
    }
    return 0
  }

  const codePointOf = (char: string): number => char.codePointAt(0) ?? 0

  return {
    hasGlyph: (char) => glyphIndex(codePointOf(char)) !== 0,
    advance: (char) => {
      const glyph = Math.min(glyphIndex(codePointOf(char)), numberOfHMetrics - 1)
      return view.getUint16(hmtx + glyph * 4) / unitsPerEm
    },
  }
}
