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
 *      bloqueos, y el PNG vuelve por la salida estándar. Si el hijo no arranca,
 *      termina antes de leer el SVG o agota el plazo, la imagen falla con un
 *      error y el servidor sigue atendiendo (`runChild`).
 *
 * Por qué no resvg, que `next/og` trae dentro: medido, tarda 4,3 s por imagen
 * frente a 0,8 s, y es síncrono; con diez peticiones a la vez bloqueaba el
 * proceso lo suficiente para que otras consultas agotaran su plazo (D-223).
 *
 * Lo registran `src/instrumentation.ts` (una vez, antes de atender peticiones)
 * y la prueba `tests/unit/weekly-results-image-sharp.test.ts`. Los fallos del
 * proceso hijo los prueba `tests/unit/og-renderer-child.test.ts`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
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

export interface ChildOptions {
  /** Desde dónde resuelve el hijo `sharp`. Por defecto, el del servidor. */
  cwd?: string
  timeoutMs?: number
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Termina el hijo si sigue vivo y cierra sus tres canales. */
function stop(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) {
    try {
      child.kill('SIGKILL')
    } catch {
      // Si ni siquiera se puede matar, la promesa ya está rechazada.
    }
  }
  child.stdin?.destroy()
  child.stdout?.destroy()
  child.stderr?.destroy()
}

/**
 * Lanza `command`, le escribe `input` por la entrada estándar y resuelve con
 * su salida estándar si termina con 0.
 *
 * Cualquier otro final —no arranca, termina antes de leer toda la entrada o
 * con otro código, o agota el plazo— RECHAZA la promesa una sola vez y deja
 * cerrados el hijo, sus canales y el temporizador. El proceso y sus tres
 * canales tienen oyente de `error` toda su vida: un `error` sin oyente es una
 * excepción sin capturar, que termina un proceso de Node y que en el servidor
 * solo contendría el manejador global de Next.
 *
 * Si la escritura falla porque el hijo terminó antes de leerlo todo, se espera
 * a su `close`, cuyo registro de errores dice por qué terminó (un `sharp` que no
 * se resuelve, por ejemplo); el plazo acota esa espera.
 *
 * El plazo es propio y no la opción `timeout` de `spawn`: esa solo manda una
 * señal y deja la promesa esperando un `close` que puede no llegar.
 */
export function runChild(
  command: string,
  args: readonly string[],
  input: Uint8Array,
  { cwd = process.cwd(), timeoutMs = CHILD_TIMEOUT_MS }: ChildOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess
    try {
      child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    } catch (error) {
      reject(new Error(`og-renderer: no se pudo lanzar el proceso hijo: ${messageOf(error)}`))
      return
    }

    let settled = false
    const timer = setTimeout(() => {
      fail(`el proceso hijo superó el plazo de ${timeoutMs} ms`)
    }, timeoutMs)
    const fail = (reason: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stop(child)
      reject(new Error(`og-renderer: ${reason}`))
    }

    child.on('error', (error) => fail(`no se pudo lanzar el proceso hijo: ${error.message}`))
    const { stdin, stdout, stderr } = child
    if (!stdin || !stdout || !stderr) return fail('el proceso hijo arrancó sin sus canales')

    const out: Buffer[] = []
    const err: Buffer[] = []
    let inputError: Error | undefined
    stdout.on('data', (chunk: Buffer) => out.push(chunk))
    stderr.on('data', (chunk: Buffer) => err.push(chunk))
    stdout.on('error', (error) => fail(`salida del proceso hijo: ${error.message}`))
    stderr.on('error', (error) => fail(`errores del proceso hijo: ${error.message}`))
    stdin.on('error', (error) => {
      inputError ??= error
    })

    child.on('close', (code, signal) => {
      if (settled) return
      if (code === 0 && !inputError) {
        settled = true
        clearTimeout(timer)
        return resolve(Buffer.concat(out))
      }
      const partial = inputError ? ` sin recibir la entrada completa (${inputError.message})` : ''
      const detail = Buffer.concat(err).toString().trim()
      fail(`el proceso hijo terminó con ${signal ?? code}${partial}: ${detail}`)
    })

    stdin.end(input)
  })
}

export function rasterizeSvgInChild(
  svg: Uint8Array,
  width: number,
  options?: ChildOptions,
): Promise<Buffer> {
  return runChild(process.execPath, ['-e', CHILD_SCRIPT, String(width)], svg, options)
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
