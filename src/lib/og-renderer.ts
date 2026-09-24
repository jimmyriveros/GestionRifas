/**
 * I-163 (D-223): `next/og` sigue dibujando con `sharp` aunque el optimizador de
 * imágenes le haya quitado el cargador SVG al proceso.
 *
 * `ImageResponse` en Node le pasa a `sharp` el SVG que produce Satori. El
 * optimizador de Next (`/_next/image`), la primera vez que carga `sharp`,
 * bloquea en TODO el proceso los cargadores de libvips salvo HEIF, JPEG, GIF,
 * PNG, TIFF y WebP. Desde ese momento el SVG no tiene cargador y la imagen de
 * «Resultados de la semana» respondía 500 hasta reiniciar el servidor.
 *
 * El arreglo no toca el bloqueo —no se desbloquea ningún cargador— y solo
 * afecta a `@vercel/og`:
 *
 *   1. Un gancho de resolución de módulos le entrega a `@vercel/og`, cuando
 *      importa `sharp`, la función `sharpForOg` de este archivo en vez del
 *      paquete. Nadie más la recibe: el optimizador sigue con su `sharp`.
 *   2. `sharpForOg` usa el `sharp` real. Si el cargador está bloqueado, el SVG
 *      se rasteriza en un proceso hijo de Node, que carga su propio `sharp` sin
 *      bloqueos, y el PNG vuelve por la salida estándar.
 *
 * Por qué no resvg, que `next/og` trae dentro: medido, tarda 4,3 s por imagen
 * frente a 0,8 s, y es síncrono; con diez peticiones a la vez bloqueaba el
 * proceso lo suficiente para que otras consultas agotaran su plazo (D-223).
 *
 * Lo registran `src/instrumentation.ts` (una vez, antes de atender peticiones)
 * y la prueba `tests/unit/weekly-results-image-sharp.test.ts`.
 */
import { spawn } from 'node:child_process'
import { register } from 'node:module'

import sharp from 'sharp'

const GLOBAL_KEY = 'rifas.ogSharp'
const FLAG = Symbol.for('rifas.ogRendererRegistered')

/** Plazo del proceso hijo: el render normal tarda menos de un segundo. */
const CHILD_TIMEOUT_MS = 30_000

const HOOK = `
const MODULE = 'data:text/javascript,' + encodeURIComponent(
  'export default globalThis[Symbol.for(${JSON.stringify(GLOBAL_KEY)})]'
)
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'sharp' && context.parentURL && context.parentURL.includes('/@vercel/og/')) {
    return { url: MODULE, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
`

/** Lee SVG de la entrada estándar y escribe el PNG en la salida estándar. */
const CHILD_SCRIPT = `
const sharp = require('sharp')
const width = Number(process.argv[1])
const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
  sharp(Buffer.concat(chunks)).resize(width).png().toBuffer()
    .then((png) => process.stdout.write(png))
    .catch((error) => { process.stderr.write(String(error && error.message)); process.exitCode = 1 })
})
`

function isBlockedLoader(error: unknown): boolean {
  return error instanceof Error && /unsupported image format/.test(error.message)
}

export function rasterizeSvgInChild(svg: Uint8Array, width: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', CHILD_SCRIPT, String(width)], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: CHILD_TIMEOUT_MS,
      windowsHide: true,
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) return resolve(Buffer.concat(out))
      const detail = Buffer.concat(err).toString().trim()
      reject(new Error(`og-renderer: el proceso hijo terminó con ${signal ?? code}: ${detail}`))
    })
    child.stdin.end(Buffer.from(svg))
  })
}

async function rasterize(svg: Uint8Array, width: number): Promise<Buffer> {
  try {
    return await sharp(svg).resize(width).png().toBuffer()
  } catch (error) {
    if (!isBlockedLoader(error)) throw error
    return rasterizeSvgInChild(svg, width)
  }
}

/**
 * Lo único que `@vercel/og` hace con `sharp`:
 * `sharp(svg).resize(width).png().toBuffer()`.
 */
export function sharpForOg(svg: Uint8Array) {
  return {
    resize: (width: number) => ({
      png: () => ({ toBuffer: () => rasterize(svg, width) }),
    }),
  }
}

export function registerOgRenderer(): void {
  const scope = globalThis as unknown as Record<symbol, unknown>
  if (scope[FLAG]) return
  scope[Symbol.for(GLOBAL_KEY)] = sharpForOg
  register(`data:text/javascript,${encodeURIComponent(HOOK)}`)
  scope[FLAG] = true
}
