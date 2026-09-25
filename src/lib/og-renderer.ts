/**
 * `next/og` dibuja con el `sharp` de este archivo, cargado al generar la primera
 * imagen (D-223, D-224, D-226).
 *
 * `ImageResponse` en Node rasteriza con `sharp` el SVG que produce Satori y, si
 * no puede importar `sharp`, cae en silencio a resvg: medido en D-223, 4,3 s por
 * imagen frente a 0,8 s y síncrono —con diez peticiones a la vez bloqueaba el
 * proceso—. Un gancho de resolución de módulos le entrega a `@vercel/og`, y solo
 * a él, la función `sharpForOg` en vez del paquete. Nadie más la recibe.
 *
 *   * `sharp` se carga al generar la primera imagen, NUNCA al importar este
 *     archivo (I-167): `instrumentation` lo importa al arrancar cada instancia, y
 *     un `sharp` que falta o no carga su parte nativa dejaba en 500 todas las
 *     rutas. Ahora solo falla la imagen, con el motivo en el registro de la ruta.
 *   * Sin `sharp`, la imagen FALLA: no se da por buena con resvg (D-224).
 *
 * `sharpForOg` hace exactamente lo que `@vercel/og` hace con `sharp`
 * —`sharp(svg).resize(width).png().toBuffer()`, sin opciones, comprobado en Next
 * 16.3.6—, así que recibe el SVG ya saneado por su Satori (GHSA-vcvr-r3jv-pc5j)
 * y no cambia qué se dibuja ni cómo.
 *
 * YA NO HAY PROCESO HIJO (D-226). Existía por I-163: el optimizador de
 * `/_next/image`, al cargar `sharp`, le quitaba a todo el proceso el cargador SVG
 * de libvips. Desde Next 16.3.6 el optimizador lo vuelve a habilitar, y
 * `tests/unit/weekly-results-image-sharp.test.ts` falla si una versión futura
 * vuelve a quitarlo. Un hijo con su propio `sharp`, además, rasterizaba sin los
 * bloqueos de cargadores que pone Next.
 *
 * Lo registra `src/instrumentation.ts`, una vez, antes de atender peticiones.
 */
import { register } from 'node:module'

import type sharpModule from 'sharp'

const GLOBAL_KEY = 'rifas.ogSharp'
const FLAG = Symbol.for('rifas.ogRendererRegistered')

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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

let loadingSharp: Promise<typeof sharpModule> | null = null

/**
 * El `sharp` del proceso, cargado una vez y solo cuando hace falta una imagen
 * (I-167). Si no se puede cargar, rechaza con el motivo y no guarda el fallo:
 * la siguiente imagen lo vuelve a intentar. Medido: Node sí recuerda, dentro del
 * mismo proceso, el paquete que no encontró o que falló al cargarse, así que
 * devolverlo exige una instancia nueva.
 */
function loadSharp(): Promise<typeof sharpModule> {
  loadingSharp ??= import('sharp').then(
    (loaded) => loaded.default,
    (error: unknown) => {
      loadingSharp = null
      throw new Error(`og-renderer: no se pudo cargar sharp: ${messageOf(error)}`, {
        cause: error,
      })
    },
  )
  return loadingSharp
}

async function rasterize(svg: Uint8Array, width: number): Promise<Buffer> {
  const sharp = await loadSharp()
  return sharp(svg).resize(width).png().toBuffer()
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
