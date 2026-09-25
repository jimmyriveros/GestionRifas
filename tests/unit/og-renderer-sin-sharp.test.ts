// @vitest-environment node
/**
 * I-167: `sharp` no es un requisito para arrancar.
 *
 * `src/instrumentation.ts` importa `og-renderer` al arrancar cada instancia del
 * servidor. Mientras ese archivo importaba `sharp` al cargarse, un `sharp` que
 * faltaba —o que no cargaba su parte nativa— dejaba en 500 TODAS las rutas:
 * medido en un `standalone` aislado, «Failed to prepare server … loading
 * instrumentation hook». Ahora se carga al generar la primera imagen.
 *
 * Aquí `sharp` no existe: importarlo lanza, como en un artefacto que no lo
 * trae. Lo que se exige es que el archivo cargue y registre su gancho, que la
 * imagen FALLE con el motivo —nunca un PNG inventado— y que cada imagen lo
 * vuelva a intentar en vez de heredar el fallo. El arranque en frío de verdad,
 * con rutas que siguen respondiendo, se mide en el artefacto (D-223, I-167).
 */
import { describe, expect, it, vi } from 'vitest'

const intentos = vi.hoisted(() => ({ n: 0 }))

vi.mock('sharp', () => {
  intentos.n += 1
  throw new Error("Cannot find package 'sharp' (simulado para la prueba)")
})

function motivos(error: unknown): string[] {
  const vistos: string[] = []
  for (let actual = error; actual instanceof Error; actual = actual.cause)
    vistos.push(actual.message)
  return vistos
}

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>',
)

describe('I-167 — og-renderer sin sharp', () => {
  it('el archivo se importa y registra su gancho sin cargar sharp', async () => {
    const { registerOgRenderer } = await import('@/lib/og-renderer')
    expect(() => registerOgRenderer()).not.toThrow()
    expect(intentos.n).toBe(0)
  })

  it('la imagen falla con el motivo, y no se da por buena', async () => {
    const { sharpForOg } = await import('@/lib/og-renderer')
    const error = await sharpForOg(SVG)
      .resize(64)
      .png()
      .toBuffer()
      .then(
        () => null,
        (rechazo: unknown) => rechazo,
      )
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/^og-renderer: no se pudo cargar sharp: /)
    // Vitest envuelve el error de la fábrica; el motivo original sigue en la cadena.
    expect(motivos(error)).toContain("Cannot find package 'sharp' (simulado para la prueba)")
  })

  it('cada imagen lo vuelve a intentar: el fallo no se queda guardado', async () => {
    const { sharpForOg } = await import('@/lib/og-renderer')
    const antes = intentos.n
    await expect(sharpForOg(SVG).resize(64).png().toBuffer()).rejects.toThrow(/no se pudo cargar/)
    await expect(sharpForOg(SVG).resize(64).png().toBuffer()).rejects.toThrow(/no se pudo cargar/)
    expect(intentos.n).toBe(antes + 2)
  })
})
