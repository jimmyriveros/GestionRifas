/**
 * EL MANIFIESTO DE UN RESPALDO LÓGICO — I-024, `RUNBOOK` §5.1 y §5.2.
 *
 * Lo escribe `take-backup.ts` al terminar y lo lee `restore-backup.ts` antes de cargar nada. Dice
 * si el respaldo está COMPLETO, la huella SHA-256 de cada archivo —una copia que ya no la tiene se
 * corrompió o la cambió alguien— y cuántas filas tenía cada tabla de `public`, para comprobar la
 * restauración sin leer ni un dato de nadie.
 *
 * No contiene datos personales ni credenciales: nombres de tablas, números, huellas y la
 * referencia del proyecto.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { Query } from './gate-db'

export const MANIFEST_FILE = 'manifiesto.json'
export const MANIFEST_FORMAT = 'respaldo/v1'

export type BackupFileName = 'roles.sql' | 'schema.sql' | 'data.sql'
export const BACKUP_FILES: readonly BackupFileName[] = ['roles.sql', 'schema.sql', 'data.sql']

export type Counts = { migracion: string | null; filas: Record<string, number> }

export type Manifest = {
  formato: typeof MANIFEST_FORMAT
  estado: 'COMPLETO' | 'INCOMPLETO'
  destino: string
  entorno: 'local' | 'produccion'
  /** La referencia del proyecto, nunca una credencial. `null` en local. */
  proyecto: string | null
  inicio: string
  fin: string
  cli: string | null
  /** Recuentos leídos en solo lectura justo antes del volcado. */
  recuentos: Counts | null
  /** `true` si los recuentos de después no coinciden con los de antes. */
  escrituras_durante_el_volcado: boolean | null
  archivos: Partial<Record<BackupFileName, { bytes: number; sha256: string }>>
  pasos: Array<{ paso: string; ok: boolean; ms: number; error?: string }>
  pasos_no_ejecutados: string[]
  problemas: string[]
}

/** Huella y tamaño de un contenido, tal como está en disco. */
export function digestOf(content: Buffer): { bytes: number; sha256: string } {
  return { bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') }
}

export function fileDigest(file: string): { bytes: number; sha256: string } {
  return digestOf(readFileSync(file))
}

/** ¿Cambiaron los recuentos entre dos lecturas? */
export function countsDiffer(before: Counts, after: Counts): boolean {
  return (
    before.migracion !== after.migracion || countDifferences(before.filas, after.filas).length > 0
  )
}

/** Las tablas cuyo recuento no coincide, con las dos cifras. Solo nombres y números. */
export function countDifferences(
  expected: Record<string, number>,
  actual: Record<string, number>,
): Array<{ tabla: string; esperado: number | null; ahora: number | null }> {
  const tables = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
  return tables
    .filter((tabla) => expected[tabla] !== actual[tabla])
    .map((tabla) => ({ tabla, esperado: expected[tabla] ?? null, ahora: actual[tabla] ?? null }))
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** Filas por tabla de `public` y la última migración. Solo números. */
export async function readCounts(query: Query): Promise<Counts> {
  const tables = await query<{ tabla: string }>(
    `select c.relname as tabla
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname`,
  )
  const filas: Record<string, number> = {}
  for (const { tabla } of tables) {
    const [row] = await query<{ n: number }>(
      `select count(*)::int as n from public.${quoteIdent(tabla)}`,
    )
    filas[tabla] = row!.n
  }
  const [migration] = await query<{ v: string | null }>(
    `select max(version) as v from supabase_migrations.schema_migrations`,
  )
  return { migracion: migration?.v ?? null, filas }
}

/** El manifiesto de una carpeta de respaldo, o `null` si no tiene (un respaldo anterior a I-024). */
export function readManifest(folder: string): Manifest | null {
  const file = path.join(folder, MANIFEST_FILE)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest
}

/**
 * Por qué no se debe cargar un respaldo, según su manifiesto, ANTES de conectar: que esté
 * INCOMPLETO, que sea de otro formato o que un archivo ya no tenga la huella con la que se tomó.
 */
export function manifestProblems(
  manifest: Manifest,
  files: Partial<Record<BackupFileName, Buffer>>,
): string[] {
  const problems: string[] = []
  if (manifest.formato !== MANIFEST_FORMAT) {
    problems.push(`El manifiesto es de otro formato («${manifest.formato}»).`)
    return problems
  }
  if (manifest.estado !== 'COMPLETO') {
    problems.push(
      'El manifiesto dice que el respaldo está INCOMPLETO: se detuvo al tomarlo y no sirve para restaurar.',
    )
  }
  for (const name of BACKUP_FILES) {
    const expected = manifest.archivos[name]
    const content = files[name]
    if (!expected) {
      problems.push(`El manifiesto no tiene la huella de ${name}.`)
    } else if (content && digestOf(content).sha256 !== expected.sha256) {
      problems.push(
        `${name} no tiene la huella del manifiesto: cambió desde que se tomó el respaldo.`,
      )
    }
  }
  return problems
}
