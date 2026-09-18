/**
 * LA PROCEDENCIA DE LAS FOTOS DE PUERTA, con las herramientas de verdad (I-145, `RUNBOOK` §9.0).
 *
 * El defecto que encontró el dueño al revisar la Etapa 4: `scripts/gate-compare.ts`
 * aceptaba dos fotos LOCALES presentadas como de producción —con un proyecto inventado— y
 * respondía «PRODUCCIÓN», CONTINUAR y exit 0; también con la misma foto en los dos
 * extremos. Las fotos solo decían «local» o «producción», el comparador no miraba de
 * dónde ni de cuándo eran, y cuando no cambiaba ninguna fila no llegaba a conectarse.
 *
 * Aquí se toman fotos REALES de la base local con `scripts/gate-snapshot.ts` y se comparan
 * con `scripts/gate-compare.ts`, como procesos aparte, igual que en una puerta. Las fotos
 * «de producción» son esas mismas fotos REETIQUETADAS con un proyecto ficticio y su huella
 * recalculada: NUNCA se conecta a producción. El entorno de los procesos apunta a
 * 127.0.0.1 (`localScriptEnv`), así que una foto reetiquetada que llegue a pedir conexión
 * se queda en la negativa de `connectionStringFor`.
 *
 * La huella se recalcula con la definición del formato —SHA-256 de `stableJson` sin la
 * propia huella—, escrita aquí y no con `snapshotDigest`: la prueba fija ese contrato.
 * El ensayo de las seis migraciones (`0067`–`0072`) necesita `db reset --version 0066`, que
 * rompería al resto de la suite, y se hace aparte (`TEST_RESULTS`, I-145).
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { stableJson } from '../../scripts/record-prize-awards-guard'

import { localScriptEnv } from './helpers'

const RAIZ = path.resolve(import.meta.dirname, '../..')
const TSX = path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'cli.mjs')
/** El proyecto inventado del defecto, tal como lo reprodujo el dueño. */
const INVENTADO = 'aaaaaaaaaaaaaaaaaaaa'
const R1 = 'proyectoficticiounoa'
const R2 = 'otroproyectoficticio'
const FORMATO = 'gate-snapshot/v2'

type Foto = Record<string, unknown> & {
  captura?: string
  base?: Record<string, unknown> | null
  filas?: Record<string, { filas: Record<string, unknown[]> }>
}
type Corrida = { code: number | null; stdout: string; salida: string }

let dir = ''
const creadas: string[] = []

function correr(script: string, args: string[]): Corrida {
  const r = spawnSync(process.execPath, [TSX, script, ...args], {
    cwd: RAIZ,
    env: localScriptEnv(),
    encoding: 'utf8',
    timeout: 120_000,
  })
  return { code: r.status, stdout: r.stdout ?? '', salida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** Toma una foto de la base local; lo que guarde se borra al terminar, salga como salga. */
function fotografiar(etiqueta: string, ...extra: string[]): Corrida & { ruta: string | null } {
  const r = correr('scripts/gate-snapshot.ts', [etiqueta, '--local', ...extra])
  const archivo = r.salida.match(/Guardada en (.+\.json)/)?.[1]
  const ruta = archivo ? path.join(RAIZ, archivo.trim()) : null
  if (ruta) creadas.push(ruta)
  return { ...r, ruta }
}

/** Una foto REAL de la base local. Devuelve su ruta. */
function capturar(etiqueta: string, ...extra: string[]): string {
  const r = fotografiar(etiqueta, ...extra)
  expect(r.code, r.salida).toBe(0)
  if (!r.ruta) throw new Error(`La foto no dijo dónde se guardó:\n${r.salida}`)
  return r.ruta
}

function comparar(antes: string, despues: string, args: string[]): Corrida {
  return correr('scripts/gate-compare.ts', [antes, despues, ...args])
}

const leer = (ruta: string) => JSON.parse(readFileSync(ruta, 'utf8')) as Foto

function escribir(nombre: string, foto: Foto): string {
  const ruta = path.join(dir, nombre)
  writeFileSync(ruta, JSON.stringify(foto))
  return ruta
}

/** La huella del formato: SHA-256 de la representación estable, sin la propia huella. */
function conHuella(foto: Foto): Foto {
  const resto: Foto = { ...foto }
  delete resto.huella
  return { ...foto, huella: createHash('sha256').update(stableJson(resto)).digest('hex') }
}

/** La misma foto, presentada como de un proyecto de producción, con su huella al día. */
function deProduccion(ruta: string, proyecto: string, nombre: string): string {
  return escribir(nombre, conHuella({ ...leer(ruta), entorno: 'produccion', proyecto }))
}

/** La misma foto sin nada de lo que registra el formato nuevo: como las de la Etapa 4. */
function comoAntigua(ruta: string, nombre: string): string {
  const foto = leer(ruta)
  for (const campo of ['formato', 'captura', 'proyecto', 'huella']) delete foto[campo]
  if (foto.base) {
    delete foto.base.captura
    delete foto.base.huella
  }
  return escribir(nombre, foto)
}

function informe(corrida: Corrida): Record<string, unknown> & {
  antes: Record<string, unknown>
  despues: Record<string, unknown>
} {
  try {
    return JSON.parse(corrida.stdout) as never
  } catch {
    throw new Error(`La comparación no devolvió un informe:\n${corrida.salida}`)
  }
}

/** Una negativa: no hay veredicto, y la salida no dice CONTINUAR. */
function sinVeredicto(corrida: Corrida, motivo: RegExp): void {
  expect(corrida.code, corrida.salida).toBe(1)
  expect(corrida.salida).toMatch(motivo)
  expect(corrida.salida).not.toMatch(/CONTINUAR/)
}

let a = ''
let b = ''

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'gate-procedencia-'))
  // Dos fotos seguidas de la misma base, sin nada en medio: la de después, posterior.
  a = capturar('procedencia-a')
  b = capturar('procedencia-b')
}, 240_000)

afterAll(() => {
  for (const ruta of creadas) rmSync(ruta, { force: true })
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('P1 — las fotos dicen de qué destino son', () => {
  it('P1-01: cada foto nueva registra su formato, una captura propia, su destino sin credenciales y su huella', () => {
    const fa = leer(a)
    const fb = leer(b)
    expect(fa.formato).toBe(FORMATO)
    expect(fa.entorno).toBe('local')
    expect(fa.proyecto).toBeNull()
    expect(fa.captura).toMatch(/^[0-9a-f-]{36}$/)
    expect(fb.captura).not.toBe(fa.captura)
    expect(conHuella(fa).huella).toBe(fa.huella)
    expect(readFileSync(a, 'utf8')).not.toMatch(/postgres:postgres|password|SUPABASE_DB_URL/i)
  })
})

describe('P2 — el defecto: fotos locales presentadas como de producción', () => {
  it('P2-01: dos fotos locales con --production y un proyecto inventado no dan veredicto', () => {
    sinVeredicto(
      comparar(a, b, ['--production', '--project-ref', INVENTADO, '--operation', 'none']),
      /Se pidió PRODUCCIÓN \(proyecto aaaa…\) y las dos fotos son de LOCAL/,
    )
  })

  it('P2-02: la misma foto en los dos extremos no da veredicto, tampoco con el destino correcto', () => {
    sinVeredicto(
      comparar(a, a, ['--production', '--project-ref', INVENTADO, '--operation', 'none']),
      /misma captura/,
    )
    sinVeredicto(comparar(a, a, ['--local', '--operation', 'none']), /misma captura/)
  })
})

describe('P3 — el mismo destino, y el que se pidió', () => {
  it('P3-01: fotos de dos proyectos distintos no dan veredicto', () => {
    const p1 = deProduccion(a, R1, 'p3-uno.json')
    const p2 = deProduccion(b, R2, 'p3-dos.json')
    const r = comparar(p1, p2, ['--production', '--project-ref', R1, '--operation', 'none'])
    sinVeredicto(r, /proyectos distintos \(proy… y otro…\)/)
    expect(r.salida).toMatch(
      /la foto de después \(«procedencia-b»\) es de otro proyecto de producción/,
    )
  })

  it('P3-02: fotos de un proyecto con --project-ref de otro no dan veredicto', () => {
    const p1a = deProduccion(a, R1, 'p3-uno-a.json')
    const p1b = deProduccion(b, R1, 'p3-uno-b.json')
    const r = comparar(p1a, p1b, ['--production', '--project-ref', R2, '--operation', 'none'])
    sinVeredicto(r, /Se pidió PRODUCCIÓN \(proyecto otro…\) y las dos fotos son de otro proyecto/)
    // Nunca la referencia entera, de ninguno de los dos.
    expect(r.salida).not.toContain(R1)
    expect(r.salida).not.toContain(R2)
  })

  it('P3-03: fotos de producción con --local no dan veredicto', () => {
    const p1a = deProduccion(a, R1, 'p3-local-a.json')
    const p1b = deProduccion(b, R1, 'p3-local-b.json')
    sinVeredicto(
      comparar(p1a, p1b, ['--local', '--operation', 'none']),
      /Se pidió LOCAL .* y las dos fotos son de PRODUCCIÓN/,
    )
  })
})

describe('P4 — fotos anteriores, incompletas, repetidas o al revés', () => {
  it('P4-01: las fotos de la Etapa 4, sin identidad, se rechazan para una puerta y no se les atribuye proyecto', () => {
    const va = comoAntigua(a, 'p4-antigua-a.json')
    const vb = comoAntigua(b, 'p4-antigua-b.json')
    const local = comparar(va, vb, ['--local', '--operation', 'none'])
    sinVeredicto(local, /formato anterior a gate-snapshot\/v2/)
    expect(local.salida).toMatch(/evidencia histórica/)
    expect(local.salida).toMatch(/vuelve a tomarla/)
    sinVeredicto(
      comparar(va, vb, ['--production', '--project-ref', INVENTADO, '--operation', 'none']),
      /formato anterior/,
    )
  })

  it('P4-02: una foto tocada después de tomarla, o sin una de sus partes, se rechaza', () => {
    // Una sola huella de fila cambiada, sin recalcular la de la foto.
    const tocada = leer(b)
    const [, datos] = Object.entries(tocada.filas!)[0]!
    const [clave] = Object.keys(datos.filas)
    datos.filas[clave!] = ['otra', 'huella', null]
    sinVeredicto(
      comparar(a, escribir('p4-tocada.json', tocada), ['--local', '--operation', 'none']),
      /no coincide con su huella/,
    )

    // Sin sus filas, aunque la huella se recalcule.
    const incompleta = leer(b)
    delete incompleta.filas
    sinVeredicto(
      comparar(a, escribir('p4-incompleta.json', conHuella(incompleta)), [
        '--local',
        '--operation',
        'none',
      ]),
      /está incompleta: faltan las filas/,
    )
  })

  it('P4-03: el orden invertido no da veredicto', () => {
    sinVeredicto(comparar(b, a, ['--local', '--operation', 'none']), /el orden está invertido/)
  })

  it('P4-04: una foto de después tomada con --base de otra foto no se compara con esta', () => {
    const c = capturar('procedencia-c', '--base', a)
    expect(leer(c).base).toMatchObject({ captura: leer(a).captura, huella: leer(a).huella })
    // Con su base, sí.
    const conSuBase = comparar(a, c, ['--local', '--operation', 'none'])
    expect(conSuBase.code, conSuBase.salida).toBe(0)
    expect(informe(conSuBase).despues).toMatchObject({ con_base: true })
    // Con otra foto de antes, no.
    sinVeredicto(comparar(b, c, ['--local', '--operation', 'none']), /--base de otra foto/)
  }, 180_000)

  it('P4-05: la foto no se toma con --base de una foto anterior o de otro destino', () => {
    const antigua = comoAntigua(a, 'p4-base-antigua.json')
    const conAntigua = fotografiar('procedencia-x', '--base', antigua)
    expect(conAntigua.code, conAntigua.salida).toBe(1)
    expect(conAntigua.salida).toMatch(/formato anterior/)
    expect(conAntigua.ruta).toBeNull()

    const deOtro = deProduccion(a, R1, 'p4-base-produccion.json')
    const conOtro = fotografiar('procedencia-y', '--base', deOtro)
    expect(conOtro.code, conOtro.salida).toBe(1)
    expect(conOtro.salida).toMatch(/mismo destino/)
    expect(conOtro.ruta).toBeNull()
  })
})

describe('P5 — lo que sí da veredicto', () => {
  it('P5-01: dos fotos válidas del mismo destino, sin cambios: CONTINUAR, con su procedencia en el informe', () => {
    const r = comparar(a, b, ['--local', '--operation', 'none'])
    expect(r.code, r.salida).toBe(0)
    const i = informe(r)
    expect(i.veredicto).toBe('CONTINUAR')
    expect(i.formato).toBe(FORMATO)
    expect(i.destino).toBe('LOCAL (127.0.0.1:54322)')
    expect(i.antes).toMatchObject({ etiqueta: 'procedencia-a', captura: leer(a).captura })
    expect(i.despues).toMatchObject({ etiqueta: 'procedencia-b', captura: leer(b).captura })
    expect(i.filas_tocadas).toEqual({})
  })

  it('P5-02: sin diferencias, el veredicto sigue exigiendo la conexión comprobada del proyecto pedido', () => {
    // Fotos coherentes de un proyecto ficticio, pedidas con ese proyecto: la procedencia
    // cuadra, no cambió ninguna fila… y aun así no hay veredicto, porque este entorno no
    // puede conectarse a ese proyecto (SUPABASE_DB_URL apunta a la base local).
    const pa = deProduccion(a, R1, 'p5-a.json')
    const pb = deProduccion(b, R1, 'p5-b.json')
    sinVeredicto(
      comparar(pa, pb, ['--production', '--project-ref', R1, '--operation', 'none']),
      /SUPABASE_DB_URL no nombra ningún proyecto remoto/,
    )
  })
})

describe('P6 — la comparación de estructura entre entornos, para los ensayos, sin veredicto', () => {
  it('P6-01: producción frente a local se compara, se rotula SIN VEREDICTO y acepta fotos anteriores', () => {
    const pa = deProduccion(a, R1, 'p6-produccion.json')
    const cruzada = comparar(pa, b, ['--structure-only'])
    expect(cruzada.code, cruzada.salida).toBe(0)
    expect(cruzada.salida).toMatch(/SIN VEREDICTO/)
    expect(cruzada.salida).toMatch(/PRODUCCIÓN \(proyecto proy…\)/)
    expect(cruzada.salida).not.toMatch(/CONTINUAR|DETENER|"veredicto"/)

    const antigua = comoAntigua(a, 'p6-antigua.json')
    const conAntigua = comparar(antigua, b, ['--structure-only'])
    expect(conAntigua.code, conAntigua.salida).toBe(0)
    expect(conAntigua.salida).toMatch(/formato anterior/)
  })

  it('P6-02: --structure-only no admite destino, operación ni informe: no puede pasar por un veredicto', () => {
    for (const extra of [
      ['--local'],
      ['--production', '--project-ref', R1],
      ['--operation', 'none'],
      ['--report', 'informe.json'],
    ]) {
      const r = comparar(a, b, ['--structure-only', ...extra])
      expect(r.code, r.salida).toBe(1)
      expect(r.salida).toMatch(/no da veredicto/)
    }
  })
})
