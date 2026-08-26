import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import sharp from 'sharp'

/**
 * Genera TODOS los iconos de la aplicación a partir de los SVG de la marca.
 *
 *     npm run icons
 *
 * Existe porque el logo va a cambiar varias veces (D-122, I-071). Cambiarlo debe
 * ser soltar archivos en una carpeta y ejecutar un comando, no acordarse de qué
 * tamaños hacían falta ni de por qué dos de ellos no pueden llevar transparencia.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO SE CAMBIA EL LOGO
 *
 *   1. Borra los SVG que haya en `public/icons/source/`.
 *   2. Deja los nuevos ahí. El NOMBRE da igual; lo que se lee es el atributo
 *      `width` del propio SVG, que dice para qué tamaño está afinado ese dibujo.
 *   3. `npm run icons`.
 *   4. Revisa los PNG y haz commit de todo, fuentes incluidas.
 *
 * Con un solo SVG basta: se usaría para todo. Varios permiten afinar los
 * tamaños pequeños —el logo actual, por ejemplo, agranda los puntos del billete
 * a 16 px y quita las líneas finas, que a ese tamaño solo ensucian—.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * POR QUÉ HAY TRES VARIANTES Y NO UNA
 *
 * `any` — El dibujo tal cual, transparencia incluida. Es el icono de la pestaña
 * del navegador y el hueco «clásico» de Android, donde las esquinas redondeadas
 * del propio logo se ven como se dibujaron.
 *
 * `maskable` — Android lo RECORTA con la forma que elija el fabricante (círculo,
 * cuadrado redondeado, gota) y solo garantiza el círculo central del 80 %. Aquí
 * la transparencia es un error: lo que sobra del recorte tiene que ser fondo, no
 * agujero. Por eso se pinta el dibujo sobre un fondo opaco a sangre, y lo único
 * que se pierde en el recorte son las esquinas. El script deja además una VISTA
 * PREVIA del recorte más agresivo, para poder juzgarlo de un vistazo.
 *
 * `apple-touch-icon` — iOS aplica su propia máscara y, si el icono tiene
 * transparencia, la rellena de negro antes de recortar. Mismo tratamiento que
 * `maskable`: fondo opaco a sangre.
 */

const ROOT = process.cwd()
const SOURCE_DIR = path.join(ROOT, 'public', 'icons', 'source')
const ICONS_DIR = path.join(ROOT, 'public', 'icons')
const FAVICON = path.join(ROOT, 'src', 'app', 'favicon.ico')
/** Vista previa del recorte. Ignorada por Git: es para mirar, no para publicar. */
const PREVIEW_DIR = path.join(ROOT, '.icons-preview')

/**
 * Fondo de las variantes sin transparencia.
 *
 * Solo se usa si no se puede deducir del propio dibujo (ver `resolveBackground`),
 * es decir, cuando el logo NO es una placa de color sino una marca suelta.
 */
const FALLBACK_BACKGROUND = { r: 17, g: 7, b: 71, alpha: 1 }

type Source = { file: string; size: number; svg: Buffer }

/** Cada SVG declara en su `width` para qué tamaño está afinado. */
function loadSources(): Source[] {
  if (!existsSync(SOURCE_DIR)) {
    throw new Error(
      `No existe ${path.relative(ROOT, SOURCE_DIR)}. Ahí van los SVG del logo; ver la cabecera de este archivo.`,
    )
  }

  const sources: Source[] = []
  for (const file of readdirSync(SOURCE_DIR).sort()) {
    if (!file.toLowerCase().endsWith('.svg')) continue
    const svg = readFileSync(path.join(SOURCE_DIR, file))
    const width = /\swidth="(\d+(?:\.\d+)?)"/.exec(svg.toString('utf8'))
    if (!width?.[1]) {
      throw new Error(
        `${file} no declara un atributo \`width\`, así que no se sabe a qué tamaño corresponde.`,
      )
    }
    sources.push({ file, size: Math.round(Number(width[1])), svg })
  }

  if (sources.length === 0) {
    throw new Error(`No hay ningún .svg en ${path.relative(ROOT, SOURCE_DIR)}.`)
  }

  // Dos dibujos para el mismo tamaño no es una preferencia, es un despiste:
  // casi siempre significa que quedó un archivo de la versión anterior.
  const seen = new Map<number, string>()
  for (const source of sources) {
    const previous = seen.get(source.size)
    if (previous) {
      throw new Error(
        `Hay dos SVG declarados a ${source.size} px: ${previous} y ${source.file}. ` +
          `Deja uno solo por tamaño (¿sobró alguno de la versión anterior?).`,
      )
    }
    seen.set(source.size, source.file)
  }

  return sources
}

/**
 * El dibujo afinado para el tamaño más parecido al que se pide.
 *
 * NO se elige por resolución: son vectores y cualquiera de ellos se rasteriza
 * nítido a cualquier medida. Se elige por AFINADO, que es lo que distingue a un
 * SVG de 16 px de uno de 512. En un empate gana el mayor, que lleva más detalle.
 */
function pickSource(sources: Source[], target: number): Source {
  return sources.reduce((best, candidate) => {
    const dBest = Math.abs(best.size - target)
    const dCandidate = Math.abs(candidate.size - target)
    if (dCandidate < dBest) return candidate
    if (dCandidate === dBest && candidate.size > best.size) return candidate
    return best
  })
}

function render(source: Source, size: number) {
  // `density` alto para que el rasterizador trabaje con margen antes de reducir.
  return sharp(source.svg, { density: 512 }).resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
}

/**
 * El color de fondo, deducido del propio dibujo.
 *
 * Se mira el píxel del centro del borde superior: en un logo de placa —como el
 * actual— cae dentro de la placa y da su color, así que el relleno de las
 * esquinas encaja solo y no hay nada que configurar al cambiar de logo. Si ese
 * píxel es transparente, el logo no es una placa y se usa el color de repuesto.
 */
async function resolveBackground(source: Source) {
  const { data, info } = await render(source, 64)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const x = Math.floor(info.width / 2)
  const offset = (0 * info.width + x) * info.channels
  const alpha = data[offset + 3] ?? 0
  if (alpha < 250) return FALLBACK_BACKGROUND

  return { r: data[offset] ?? 0, g: data[offset + 1] ?? 0, b: data[offset + 2] ?? 0, alpha: 1 }
}

/**
 * Recorta el icono `maskable` con un círculo y lo guarda aparte, para mirarlo.
 *
 * POR QUÉ UNA VISTA PREVIA Y NO UNA COMPROBACIÓN AUTOMÁTICA. Se intentaron tres
 * formas de medir «cuánto ocupa el dibujo» y las tres se estrellan contra el
 * mismo muro: un icono de aplicación suele ser una PLACA con una marca dentro, y
 * la placa está justamente para que el recorte se la coma. Separar una de otra a
 * ojo de píxel no es fiable:
 *
 *   · «lo que se aparte del color de una esquina» — con la placa en degradado,
 *     la esquina opuesta ya se aparta y cuenta la placa entera: 361 px de 362.
 *   · «lo que cambie al desenfocar» — el desenfoque reparte el contraste unos
 *     40 px hacia fuera y acaba midiendo su propio halo: 246 px.
 *   · «contraste entre píxeles vecinos» — el más limpio de los tres, pero
 *     detecta el borde redondeado de la placa, que es exactamente lo que SÍ debe
 *     recortarse: 351 px.
 *
 * Un aviso que salta con el estilo de icono más común es peor que no tenerlo:
 * se aprende a ignorarlo. Así que el script no opina y enseña. El círculo es el
 * recorte más agresivo que aplica Android; si la marca se entiende ahí dentro,
 * aguanta cualquier otra forma.
 *
 * Va a una carpeta ignorada por Git: es material para mirar, no para publicar.
 */
async function writeMaskablePreview(png: Buffer, size: number): Promise<string> {
  const mascara = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  )

  const recortado = await sharp(png)
    .composite([{ input: mascara, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer()

  mkdirSync(PREVIEW_DIR, { recursive: true })
  const destino = path.join(PREVIEW_DIR, 'maskable-recorte-circular.png')
  writeFileSync(destino, recortado)
  return path.relative(ROOT, destino)
}

/** Contenedor ICO con varios PNG dentro, que es lo que admite el formato. */
function buildIco(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)

  const entries: Buffer[] = []
  let offset = 6 + 16 * pngs.length
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(entry)
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

function report(label: string, file: string, bytes: number, extra = '') {
  const kb = `${(bytes / 1024).toFixed(1)} KB`
  console.log(`  ${label.padEnd(24)} ${file.padEnd(30)} ${kb.padStart(9)}  ${extra}`)
}

async function main() {
  const sources = loadSources()
  console.log(`\nFuentes en public/icons/source/ (${sources.length}):`)
  for (const source of sources)
    console.log(`  ${source.size.toString().padStart(4)} px  ${source.file}`)

  const background = await resolveBackground(pickSource(sources, 512))
  const hex = `#${[background.r, background.g, background.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  console.log(`\nFondo de las variantes opacas: ${hex}\n`)

  let preview = ''

  // 1. `any`: el dibujo tal cual, con su transparencia.
  for (const size of [192, 512]) {
    const file = `icon-${size}.png`
    const data = await render(pickSource(sources, size), size)
      .png({ compressionLevel: 9 })
      .toBuffer()
    writeFileSync(path.join(ICONS_DIR, file), data)
    report('any (con transparencia)', file, data.length, `desde ${pickSource(sources, size).file}`)
  }

  // 2. `maskable` y 3. apple-touch-icon: a sangre sobre fondo opaco.
  const opacos: { file: string; size: number; maskable: boolean }[] = [
    { file: 'icon-maskable-192.png', size: 192, maskable: true },
    { file: 'icon-maskable-512.png', size: 512, maskable: true },
    { file: 'apple-touch-icon.png', size: 180, maskable: false },
  ]
  for (const { file, size, maskable } of opacos) {
    const source = pickSource(sources, size)
    const data = await render(source, size)
      .flatten({ background })
      .png({ compressionLevel: 9 })
      .toBuffer()
    writeFileSync(path.join(ICONS_DIR, file), data)

    if (maskable && size === 512) preview = await writeMaskablePreview(data, size)
    report(
      maskable ? 'maskable (opaco)' : 'apple-touch (opaco)',
      file,
      data.length,
      `desde ${source.file}`,
    )
  }

  // 4. Favicon: 16, 32 y 48 en un solo contenedor.
  const pngs = []
  for (const size of [16, 32, 48]) {
    const source = pickSource(sources, size)
    pngs.push({ size, data: await render(source, size).png({ compressionLevel: 9 }).toBuffer() })
  }
  const ico = buildIco(pngs)
  writeFileSync(FAVICON, ico)
  report(
    'favicon (16/32/48)',
    'src/app/favicon.ico',
    ico.length,
    `desde ${pngs.map((p) => pickSource(sources, p.size).file).join(', ')}`,
  )

  // Huella de las fuentes, para poder ver en un diff si el logo cambió.
  const huella = createHash('sha256')
  for (const source of sources) huella.update(source.svg)
  console.log(`\nListo. Huella de las fuentes: ${huella.digest('hex').slice(0, 12)}`)
  console.log(
    `\nMIRA ${preview} antes de darlo por bueno: es el icono recortado en círculo,\n` +
      'que es lo más agresivo que hace Android. Si la marca se entiende ahí dentro,\n' +
      'aguanta cualquier forma. Después, commit de todo, fuentes incluidas.\n',
  )
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
