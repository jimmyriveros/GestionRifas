// @vitest-environment node
/**
 * I-163 (D-223, corrección del 2026-09-24): el proceso hijo que rasteriza el
 * SVG de `next/og` puede fallar, pero sin dejar ninguna excepción sin capturar.
 *
 * El defecto, reproducido antes de corregirlo: si el hijo terminaba antes de
 * leer el SVG entero —aquí, porque no encuentra `sharp`—, la escritura
 * pendiente en `child.stdin` emitía un `error` sin oyente y el proceso padre
 * moría con «Unhandled 'error' event — Error: write EOF» (EPIPE en Linux), sin
 * llegar al `catch` de la promesa. En el servidor de Next esa excepción solo la
 * contiene su manejador global (`⨯ uncaughtException`), del que no se depende.
 *
 * Se prueban los tres fallos —no arranca, termina antes de tiempo, agota el
 * plazo—, el camino correcto, que no queda nada abierto y que después de un
 * fallo la siguiente imagen sale. Con procesos de verdad: ningún `spawn`
 * imitado. Cada prueba falla si algo llega como excepción sin capturar.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { rasterizeSvgInChild, runChild } from '@/lib/og-renderer'

const NODE = process.execPath

/** SVG válido de unos 2 MB: mucho más que lo que cabe en la tubería. */
const SVG_GRANDE = (() => {
  const rect = '<rect x="10" y="10" width="30" height="30" fill="#1f6f4a"/>'
  const cuerpo = rect.repeat(Math.ceil((2 * 1024 * 1024) / rect.length))
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">${cuerpo}</svg>`,
  )
})()

const SVG_PEQUENO = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#c00"/></svg>',
)

/** Hijo que se queda vivo sin leer nada y no hace caso de SIGTERM. */
const COLGADO = `
require('node:fs').writeFileSync(process.argv[1], String(process.pid))
process.on('SIGTERM', () => {})
setInterval(() => {}, 1000)
`

let sinSharp: string
let trabajo: string

beforeAll(() => {
  sinSharp = mkdtempSync(path.join(tmpdir(), 'og-renderer-sin-sharp-'))
  trabajo = mkdtempSync(path.join(tmpdir(), 'og-renderer-trabajo-'))
})

afterAll(() => {
  rmSync(sinSharp, { recursive: true, force: true })
  rmSync(trabajo, { recursive: true, force: true })
})

// Vitest ya da por fallida la ejecución si aparece una; así además la señala
// la prueba que la provocó.
const escapadas: unknown[] = []
const anotar = (error: unknown) => escapadas.push(error)

beforeEach(() => {
  escapadas.length = 0
  process.on('uncaughtException', anotar)
})

afterEach(async () => {
  await new Promise((listo) => setImmediate(listo))
  process.off('uncaughtException', anotar)
  expect(escapadas, 'excepciones sin capturar').toEqual([])
})

function resuelveSharp(desde: string): boolean {
  try {
    createRequire(path.join(desde, 'x.js')).resolve('sharp')
    return true
  } catch {
    return false
  }
}

function dimensiones(png: Buffer) {
  return { firma: [...png.subarray(0, 8)], ancho: png.readUInt32BE(16), alto: png.readUInt32BE(20) }
}

/** Procesos hijos y tuberías que mantienen vivo este proceso. */
function abiertos(): number {
  return process
    .getActiveResourcesInfo()
    .filter((recurso) => recurso === 'ProcessWrap' || recurso === 'PipeWrap').length
}

async function esperarQueSeCierre(base: number): Promise<void> {
  const limite = Date.now() + 5_000
  while (abiertos() > base) {
    if (Date.now() > limite)
      throw new Error(`quedaron ${abiertos() - base} recursos del hijo abiertos`)
    await new Promise((listo) => setTimeout(listo, 20))
  }
}

function sigueVivo(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function esperarQueMuera(pid: number): Promise<void> {
  const limite = Date.now() + 5_000
  while (sigueVivo(pid)) {
    if (Date.now() > limite) throw new Error(`el hijo ${pid} sigue vivo`)
    await new Promise((listo) => setTimeout(listo, 20))
  }
}

async function unaImagenSale(): Promise<void> {
  const png = await rasterizeSvgInChild(SVG_PEQUENO, 64)
  expect(dimensiones(png)).toEqual({
    firma: [137, 80, 78, 71, 13, 10, 26, 10],
    ancho: 64,
    alto: 64,
  })
}

describe('rasterizeSvgInChild — el hijo de verdad', () => {
  it('camino correcto: el PNG es el mismo que da sharp en el propio proceso', async () => {
    const base = abiertos()
    const hijo = await rasterizeSvgInChild(SVG_PEQUENO, 64)
    const aqui = await sharp(SVG_PEQUENO).resize(64).png().toBuffer()
    expect(dimensiones(hijo)).toEqual({
      firma: [137, 80, 78, 71, 13, 10, 26, 10],
      ancho: 64,
      alto: 64,
    })
    expect(hijo.equals(aqui)).toBe(true)
    await esperarQueSeCierre(base)
  })

  it('camino correcto con un SVG de 2 MB: lo lee entero', async () => {
    const png = await rasterizeSvgInChild(SVG_GRANDE, 108)
    expect(dimensiones(png)).toMatchObject({ ancho: 108, alto: 135 })
  })

  it('la reproducción del encargo: directorio sin sharp y SVG de 2 MB rechazan sin tumbar el proceso', async () => {
    expect(resuelveSharp(sinSharp), `${sinSharp} no debería resolver sharp`).toBe(false)
    const base = abiertos()
    const antes = process.cwd()
    process.chdir(sinSharp)
    try {
      await expect(rasterizeSvgInChild(SVG_GRANDE, 1080)).rejects.toThrow(
        /el proceso hijo terminó con 1[\s\S]*Cannot find module 'sharp'/,
      )
    } finally {
      process.chdir(antes)
    }
    await esperarQueSeCierre(base)
    // La petición siguiente se atiende con normalidad.
    await unaImagenSale()
  })

  it('fallo de arranque: un directorio que no existe rechaza, y la siguiente sale', async () => {
    const base = abiertos()
    await expect(
      rasterizeSvgInChild(SVG_GRANDE, 1080, { cwd: path.join(sinSharp, 'no-existe') }),
    ).rejects.toThrow(/no se pudo lanzar el proceso hijo: .*ENOENT/)
    await esperarQueSeCierre(base)
    await unaImagenSale()
  })

  it('plazo vencido: rechaza, cierra el hijo y la siguiente sale', async () => {
    const base = abiertos()
    await expect(rasterizeSvgInChild(SVG_GRANDE, 1080, { timeoutMs: 1 })).rejects.toThrow(
      'og-renderer: el proceso hijo superó el plazo de 1 ms',
    )
    await esperarQueSeCierre(base)
    await unaImagenSale()
  })

  it('fallos y aciertos a la vez no se mezclan', async () => {
    const base = abiertos()
    const resultados = await Promise.allSettled([
      rasterizeSvgInChild(SVG_GRANDE, 1080, { cwd: sinSharp }),
      rasterizeSvgInChild(SVG_PEQUENO, 64),
      rasterizeSvgInChild(SVG_GRANDE, 1080, { timeoutMs: 1 }),
      rasterizeSvgInChild(SVG_PEQUENO, 64),
    ])
    expect(resultados.map((resultado) => resultado.status)).toEqual([
      'rejected',
      'fulfilled',
      'rejected',
      'fulfilled',
    ])
    await esperarQueSeCierre(base)
  })
})

describe('runChild — el ciclo de vida del proceso', () => {
  it('devuelve la salida estándar entera, aunque entrada y salida pesen megas', async () => {
    const eco = await runChild(NODE, ['-e', 'process.stdin.pipe(process.stdout)'], SVG_GRANDE)
    expect(eco.equals(SVG_GRANDE)).toBe(true)
  })

  it('otro código de salida rechaza con lo que el hijo escribió en su registro de errores', async () => {
    const script =
      "process.stdin.resume(); process.stdin.on('end', () => { process.stderr.write('a propósito'); process.exitCode = 3 })"
    await expect(runChild(NODE, ['-e', script], SVG_PEQUENO)).rejects.toThrow(
      /el proceso hijo terminó con 3.*: a propósito$/,
    )
  })

  it('salida anticipada sin leer 2 MB de entrada: rechaza, no deja nada abierto y la siguiente sale', async () => {
    const base = abiertos()
    await expect(runChild(NODE, ['-e', 'process.exit(7)'], SVG_GRANDE)).rejects.toThrow(
      /el proceso hijo terminó con 7/,
    )
    await esperarQueSeCierre(base)
    await unaImagenSale()
  })

  it('fallo de arranque: un comando que no existe rechaza', async () => {
    const base = abiertos()
    await expect(runChild(path.join(sinSharp, 'no-existe'), [], SVG_GRANDE)).rejects.toThrow(
      /no se pudo lanzar el proceso hijo: .*ENOENT/,
    )
    await esperarQueSeCierre(base)
  })

  it('fallo de arranque: si spawn lanza en el acto, rechaza en vez de lanzar', async () => {
    const promesa = runChild(NODE, ['-e', 'a\u0000b'], SVG_PEQUENO)
    await expect(promesa).rejects.toThrow(/no se pudo lanzar el proceso hijo: .*null bytes/)
  })

  it('plazo vencido con el hijo colgado: rechaza a tiempo y lo mata aunque ignore SIGTERM', async () => {
    const base = abiertos()
    const archivo = path.join(trabajo, 'pid-colgado')
    const inicio = Date.now()
    await expect(
      runChild(NODE, ['-e', COLGADO, archivo], SVG_GRANDE, { timeoutMs: 1_500 }),
    ).rejects.toThrow('og-renderer: el proceso hijo superó el plazo de 1500 ms')
    expect(Date.now() - inicio).toBeLessThan(4_500)

    const pid = Number(readFileSync(archivo, 'utf8'))
    expect(pid).toBeGreaterThan(0)
    await esperarQueMuera(pid)
    await esperarQueSeCierre(base)
    await unaImagenSale()
  }, 20_000)
})
