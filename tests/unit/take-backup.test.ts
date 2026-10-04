/**
 * EL RESPALDO QUE SE DETIENE ANTE EL PRIMER FALLO, sin base (I-024, `RUNBOOK` §5.1).
 *
 * `scripts/take-backup.ts` toma los tres volcados de §5.1, los comprueba con la misma regla que la
 * restauración y escribe un manifiesto; `restore-backup.ts` lo lee antes de cargar nada. Aquí se
 * prueba lo que deciden sin conectarse: la orden, la carpeta, qué se oculta de la salida de la CLI,
 * con qué opciones se vuelca cada archivo y qué manifiesto impide restaurar. El ensayo completo
 * —tomar, restaurar y comparar en la base local con datos sintéticos— está en `TEST_RESULTS`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))

import {
  countDifferences,
  countsDiffer,
  digestOf,
  manifestProblems,
  MANIFEST_FORMAT,
  type Manifest,
} from '../../scripts/backup-manifest'
import {
  BACKUP_STEPS,
  dumpArgs,
  folderProblems,
  isInside,
  parseOptions,
  redact,
} from '../../scripts/take-backup'

const temporales: string[] = []
const carpetaTemporal = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'respaldo-prueba-'))
  temporales.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of temporales.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('R1 — la orden', () => {
  it('R1-01: un solo destino, la carpeta obligatoria y el proyecto esperado con --production', () => {
    expect(parseOptions(['C:/respaldos/r1', '--local'])).toEqual({
      folder: 'C:/respaldos/r1',
      target: { kind: 'local', projectRef: null },
    })
    expect(() => parseOptions(['--local'])).toThrow('Falta la carpeta')
    expect(() => parseOptions(['C:/r', '--local', '--production'])).toThrow('un solo destino')
    expect(() => parseOptions(['C:/r', '--production'])).toThrow('--project-ref')
    expect(() => parseOptions(['C:/r', '--locla'])).toThrow('No reconozco')
  })

  it('R1-02: los pasos, en su orden: recuentos, los tres volcados, la comprobación y recuentos', () => {
    expect([...BACKUP_STEPS]).toEqual([
      'recuentos antes',
      'roles.sql',
      'schema.sql',
      'data.sql',
      'comprobar archivos',
      'recuentos después',
    ])
  })
})

describe('R2 — la carpeta, antes de conectar', () => {
  it('R2-01: dentro del repositorio —también en build/— se niega', () => {
    const repo = carpetaTemporal()
    expect(folderProblems(path.join(repo, 'build', 'respaldo'), repo)).toEqual([
      expect.stringContaining('dentro del repositorio'),
    ])
    expect(folderProblems(repo, repo)).toEqual([expect.stringContaining('dentro del repositorio')])
  })

  it('R2-02: en Windows no distingue mayúsculas, y una carpeta hermana con el mismo prefijo es otra', () => {
    expect(isInside('D:/Claude/RIFAS/build', 'd:/claude/rifas', 'win32')).toBe(true)
    expect(isInside('D:/Claude/Rifas-backups/r1', 'D:/Claude/Rifas', 'win32')).toBe(false)
  })

  it('R2-03: una carpeta nueva o vacía sirve; una con archivos, o un archivo, no', () => {
    const repo = carpetaTemporal()
    const fuera = carpetaTemporal()
    expect(folderProblems(path.join(fuera, 'nueva'), repo)).toEqual([])
    expect(folderProblems(fuera, repo)).toEqual([])

    writeFileSync(path.join(fuera, 'data.sql'), 'x')
    expect(folderProblems(fuera, repo)).toEqual([expect.stringContaining('ya tiene archivos')])

    const archivo = path.join(fuera, 'data.sql')
    expect(folderProblems(archivo, repo)).toEqual([expect.stringContaining('no es una carpeta')])

    mkdirSync(path.join(fuera, 'otra'))
    expect(folderProblems(path.join(fuera, 'otra'), repo)).toEqual([])
  })
})

describe('R3 — lo que se vuelca y lo que se muestra', () => {
  it('R3-01: datos solo de public, esquema SIN restringir (pg_trgm) y roles aparte', () => {
    expect(dumpArgs('data.sql', 'x/data.sql')).toEqual([
      'db',
      'dump',
      '-f',
      'x/data.sql',
      '--schema',
      'public',
      '--data-only',
    ])
    expect(dumpArgs('schema.sql', 'x/schema.sql')).toEqual(['db', 'dump', '-f', 'x/schema.sql'])
    expect(dumpArgs('roles.sql', 'x/roles.sql')).toEqual([
      'db',
      'dump',
      '-f',
      'x/roles.sql',
      '--role-only',
    ])
  })

  it('R3-02: ninguna dirección de PostgreSQL llega a la pantalla', () => {
    const salida =
      'pg_dump: error: connection to "postgresql://postgres.abcdefghijklmnopqrst:s3cr%40to@aws-0-us-east-1.pooler.supabase.com:5432/postgres" failed'
    expect(redact(salida)).not.toContain('s3cr')
    expect(redact(salida)).not.toContain('pooler')
    expect(redact('url postgres://u:p@h/db y otra POSTGRESQL://x:y@z/w')).toBe(
      'url postgresql://[oculto] y otra postgresql://[oculto]',
    )
  })
})

const manifiesto = (parcial: Partial<Manifest> = {}): Manifest => ({
  formato: MANIFEST_FORMAT,
  estado: 'COMPLETO',
  destino: 'LOCAL (127.0.0.1:54322)',
  entorno: 'local',
  proyecto: null,
  inicio: '2026-10-04T13:00:00.000Z',
  fin: '2026-10-04T13:01:00.000Z',
  cli: '2.111.0',
  recuentos: { migracion: '0080', filas: { tickets: 3, clients: 2 } },
  escrituras_durante_el_volcado: false,
  archivos: {
    'roles.sql': digestOf(Buffer.from('roles')),
    'schema.sql': digestOf(Buffer.from('schema')),
    'data.sql': digestOf(Buffer.from('data')),
  },
  pasos: [],
  pasos_no_ejecutados: [],
  problemas: [],
  ...parcial,
})
const archivos = {
  'roles.sql': Buffer.from('roles'),
  'schema.sql': Buffer.from('schema'),
  'data.sql': Buffer.from('data'),
}

describe('R4 — el manifiesto que impide restaurar', () => {
  it('R4-01: completo y con las tres huellas, nada que objetar', () => {
    expect(manifestProblems(manifiesto(), archivos)).toEqual([])
  })

  it('R4-02: INCOMPLETO no se restaura', () => {
    expect(manifestProblems(manifiesto({ estado: 'INCOMPLETO' }), archivos)).toEqual([
      expect.stringContaining('INCOMPLETO'),
    ])
  })

  it('R4-03: un archivo que cambió desde que se tomó —un byte— no se restaura', () => {
    const cambiado = { ...archivos, 'data.sql': Buffer.from('datA') }
    expect(manifestProblems(manifiesto(), cambiado)).toEqual([
      'data.sql no tiene la huella del manifiesto: cambió desde que se tomó el respaldo.',
    ])
  })

  it('R4-04: sin la huella de un archivo, o de otro formato, tampoco', () => {
    const sinHuella = manifiesto({ archivos: { 'roles.sql': digestOf(Buffer.from('roles')) } })
    expect(manifestProblems(sinHuella, archivos)).toHaveLength(2)
    expect(
      manifestProblems({ ...manifiesto(), formato: 'otro' as typeof MANIFEST_FORMAT }, archivos),
    ).toEqual([expect.stringContaining('otro formato')])
  })
})

describe('R5 — las filas, solo como números', () => {
  it('R5-01: las tablas que no coinciden, con las dos cifras; las que faltan o sobran también', () => {
    expect(countDifferences({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, d: 4 })).toEqual([
      { tabla: 'b', esperado: 2, ahora: 5 },
      { tabla: 'c', esperado: 3, ahora: null },
      { tabla: 'd', esperado: null, ahora: 4 },
    ])
    expect(countDifferences({ a: 1 }, { a: 1 })).toEqual([])
  })

  it('R5-02: una migración nueva entre las dos lecturas también cuenta como cambio', () => {
    expect(
      countsDiffer({ migracion: '0080', filas: { a: 1 } }, { migracion: '0080', filas: { a: 1 } }),
    ).toBe(false)
    expect(
      countsDiffer({ migracion: '0080', filas: { a: 1 } }, { migracion: '0081', filas: { a: 1 } }),
    ).toBe(true)
    expect(
      countsDiffer({ migracion: '0080', filas: { a: 1 } }, { migracion: '0080', filas: { a: 2 } }),
    ).toBe(true)
  })
})
