/**
 * RESTAURAR UN RESPALDO, deteniéndose ante el PRIMER fallo — D-240, `RUNBOOK` §5.2.
 *
 *   npx tsx scripts/restore-backup.ts <carpeta-del-respaldo>
 *        (--local | --production --project-ref <ref>)
 *
 * ESCRIBE, y reemplaza datos. En el proyecto real solo con autorización expresa del dueño
 * y con lo escrito después del respaldo ya enumerado (`RUNBOOK` §10.7). En local sirve para
 * VALIDAR un respaldo.
 *
 * Son los pasos 2 a 4 de `RUNBOOK` §5.2, que antes eran cinco órdenes sueltas de `psql`
 * —que no está instalado en el equipo desde el que se opera—. En el ensayo de P3, una
 * cadena de esas órdenes siguió adelante después de que el vaciado se negara, y `data.sql`
 * insertó filas sobre una base sin vaciar. Aquí eso no puede pasar:
 *
 *   0. ANTES DE CONECTAR: los tres archivos del respaldo existen, tienen la forma que esta
 *      herramienta sabe ejecutar y `data.sql` no trae nada del esquema `auth` (§5.1).
 *   1. `supabase/recovery/restauracion_vaciar_public.sql` — se niega sin la pausa cerrada.
 *   2. `roles.sql`, sentencia por sentencia.
 *   3. `schema.sql`.
 *   4. `data.sql`.
 *   5. `supabase/recovery/restauracion_despues.sql`.
 *
 * CADA PASO SOLO EMPIEZA SI EL ANTERIOR TERMINÓ SIN ERROR. Cada uno va en su propia
 * conexión, como cada `psql -f`: lo que un archivo fija en la sesión no pasa al siguiente.
 * Los pasos 1, 3, 4 y 5 se envían enteros: o se aplican completos o no dejan nada.
 *
 * LA ÚNICA EXCEPCIÓN, y es una sola sentencia: `GRANT SET ON PARAMETER "log_min_messages"
 * TO …` de `roles.sql` falla con `42501` porque `postgres` no puede concederlo; es el error
 * esperado que documenta §5.2. Se tolera ESA sentencia con ESE código. Cualquier otro error
 * de `roles.sql` —u otra sentencia con ese código— detiene la restauración.
 *
 * El historial de migraciones NO se toca aquí: se repara después con `supabase migration
 * repair`, y la estructura y las filas se comparan con la foto del respaldo (§5.2, 5 y 6).
 *
 * Nunca imprime la cadena de conexión ni el detalle de un error de datos —podría llevar el
 * contenido de una fila—: solo su código y su mensaje. Deja un informe en `build/gate/`.
 * Termina en 0 si los cinco pasos terminaron, en 2 si se detuvo —dice en cuál y qué pasos
 * NO se ejecutaron— y en 1 si la orden no se entiende.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { Client } from 'pg'

import {
  connectionStringFor,
  fileStamp,
  GateArgsError,
  gateTarget,
  gateTargetLabel,
  parseArgs,
  runGateTool,
  writeGateFile,
  type GateTarget,
} from './gate-db'

const USAGE =
  'Uso: npx tsx scripts/restore-backup.ts <carpeta-del-respaldo> (--local | --production --project-ref <ref>)'

const RECOVERY_DIR = path.join('supabase', 'recovery')
export const EMPTY_PUBLIC_SQL = path.join(RECOVERY_DIR, 'restauracion_vaciar_public.sql')
export const AFTER_RESTORE_SQL = path.join(RECOVERY_DIR, 'restauracion_despues.sql')

export type BackupFiles = { roles: string; schema: string; data: string }

/** Los pasos, en el orden en que se ejecutan. */
export const RESTORE_STEPS = [
  'vaciar public',
  'roles.sql',
  'schema.sql',
  'data.sql',
  'después de restaurar',
] as const
export type RestoreStep = (typeof RESTORE_STEPS)[number]

/**
 * Las sentencias de `roles.sql`, una por una. El volcado de roles son sentencias de una
 * línea, sin cuerpos ni cadenas partidas; si un día trae otra cosa, se dice en vez de
 * partirla mal.
 */
export function splitRoleStatements(sql: string): string[] {
  const statements: string[] = []
  for (const raw of sql.split('\n')) {
    const line = raw.replace(/\r$/, '').trim()
    if (line === '' || line.startsWith('--')) continue
    if (!line.endsWith(';') || line.includes('$') || (line.match(/'/g) ?? []).length % 2 !== 0) {
      throw new Error(
        'roles.sql trae una sentencia que no cabe en una línea: esta herramienta no sabe partirla.',
      )
    }
    statements.push(line)
  }
  return statements
}

const TOLERATED_ROLE_STATEMENT = /^GRANT SET ON PARAMETER "log_min_messages" TO "[a-z_]+";$/

/**
 * El ÚNICO error que se deja pasar (§5.2): `postgres` no puede conceder ese parámetro.
 * La sentencia exacta y el código exacto; ninguno de los dos por separado.
 */
export function toleratedRoleError(statement: string, code: string | undefined): boolean {
  return code === '42501' && TOLERATED_ROLE_STATEMENT.test(statement)
}

/** Órdenes de `psql` que `pg_dump` puede escribir y que aquí no se pueden ejecutar. */
const PSQL_ONLY = /^(\\(restrict|unrestrict|connect|\.)|COPY .+ FROM stdin;)/m

/**
 * Lo que impide restaurar un respaldo, ANTES de conectar: con `public` ya vacío sería
 * tarde para descubrir que un archivo no se puede cargar.
 */
export function backupProblems(files: BackupFiles): string[] {
  const problems: string[] = []
  for (const [name, text] of [
    ['roles.sql', files.roles],
    ['schema.sql', files.schema],
    ['data.sql', files.data],
  ] as const) {
    if (text.trim() === '') problems.push(`${name} está vacío.`)
    else if (PSQL_ONLY.test(text)) {
      problems.push(
        `${name} trae órdenes de psql (\\restrict, \\connect o COPY … FROM stdin) que esta herramienta no ejecuta. Vuelve a generar el respaldo con \`supabase db dump\` (RUNBOOK §5.1).`,
      )
    }
  }
  if (files.roles.trim() !== '') {
    try {
      splitRoleStatements(files.roles)
    } catch (error) {
      problems.push((error as Error).message)
    }
  }
  if (!/^CREATE TABLE /m.test(files.schema)) problems.push('schema.sql no crea ninguna tabla.')
  if (!/^INSERT INTO /m.test(files.data)) problems.push('data.sql no inserta ninguna fila.')
  if (/"auth"\s*\./.test(files.data)) {
    problems.push(
      'data.sql nombra el esquema «auth»: no es un volcado de datos de `public` (RUNBOOK §5.1) y no se carga.',
    )
  }
  return problems
}

export function parseOptions(argv: readonly string[]): { target: GateTarget; folder: string } {
  const parsed = parseArgs(argv, { switches: [], valued: [], positional: 1 })
  const folder = parsed.positional[0]
  if (!folder) throw new GateArgsError('Falta la carpeta del respaldo.')
  return { target: gateTarget(parsed), folder }
}

/** Solo el código y el mensaje: el detalle de un error de datos puede llevar una fila. */
function errorText(error: unknown): string {
  const code = (error as { code?: string }).code
  const message = error instanceof Error ? error.message.split('\n')[0]! : 'error'
  return code ? `${code} · ${message}` : message
}

type StepResult = { paso: RestoreStep; ok: boolean; ms: number; error?: string; notas?: string[] }

/** Un paso en su propia conexión. Devuelve si terminó; nunca lanza. */
async function runStep(
  target: GateTarget,
  paso: RestoreStep,
  work: (client: Client) => Promise<string[] | void>,
): Promise<StepResult> {
  const started = Date.now()
  let client: Client | null = null
  try {
    client = new Client({
      connectionString: connectionStringFor(target),
      ssl: target.kind === 'production' ? { rejectUnauthorized: false } : undefined,
    })
    await client.connect()
    const notas = (await work(client)) ?? undefined
    return { paso, ok: true, ms: Date.now() - started, notas }
  } catch (error) {
    // Un archivo enviado entero que falla deja su transacción abierta: se deshace.
    await client?.query('rollback').catch(() => {})
    if (error instanceof GateArgsError) throw error
    return { paso, ok: false, ms: Date.now() - started, error: errorText(error) }
  } finally {
    await client?.end().catch(() => {})
  }
}

/** `roles.sql`, sentencia por sentencia: se tolera una, y cualquier otro error detiene. */
async function runRoles(client: Client, statements: readonly string[]): Promise<string[]> {
  const notas: string[] = []
  for (const statement of statements) {
    try {
      await client.query(statement)
    } catch (error) {
      const code = (error as { code?: string }).code
      if (!toleratedRoleError(statement, code)) throw error
      notas.push(`Tolerado, el único previsto (RUNBOOK §5.2): ${errorText(error)}`)
    }
  }
  return notas
}

async function main(): Promise<void> {
  const { target, folder } = parseOptions(process.argv.slice(2))

  // ---- 0. Los archivos, antes de conectar
  const read = (name: string) => {
    const file = path.join(folder, name)
    if (!existsSync(file)) throw new GateArgsError(`En la carpeta del respaldo falta ${name}.`)
    return readFileSync(file, 'utf8')
  }
  const files: BackupFiles = {
    roles: read('roles.sql'),
    schema: read('schema.sql'),
    data: read('data.sql'),
  }
  const emptyPublic = readFileSync(EMPTY_PUBLIC_SQL, 'utf8')
  const afterRestore = readFileSync(AFTER_RESTORE_SQL, 'utf8')

  console.log(`Restauración de un respaldo · ${gateTargetLabel(target)}`)
  const problems = backupProblems(files)
  if (problems.length > 0) {
    console.log(
      '  NO: el respaldo no se puede restaurar con esta herramienta. No se conectó ni se cambió nada.',
    )
    for (const p of problems) console.log(`  · ${p}`)
    process.exit(2)
  }
  const roleStatements = splitRoleStatements(files.roles)

  const plan: Array<[RestoreStep, (client: Client) => Promise<string[] | void>]> = [
    ['vaciar public', async (c) => void (await c.query(emptyPublic))],
    ['roles.sql', (c) => runRoles(c, roleStatements)],
    ['schema.sql', async (c) => void (await c.query(files.schema))],
    ['data.sql', async (c) => void (await c.query(files.data))],
    ['después de restaurar', async (c) => void (await c.query(afterRestore))],
  ]

  // ---- 1 a 5. Cada paso, solo si el anterior terminó
  const results: StepResult[] = []
  for (const [paso, work] of plan) {
    const result = await runStep(target, paso, work)
    results.push(result)
    console.log(
      `  ${result.ok ? 'OK ' : 'FALLÓ'} ${paso} · ${result.ms} ms${result.error ? ` · ${result.error}` : ''}`,
    )
    for (const nota of result.notas ?? []) console.log(`      ${nota}`)
    if (!result.ok) break
  }

  const failed = results.find((r) => !r.ok)
  const skipped = RESTORE_STEPS.slice(results.length)
  const now = new Date().toISOString()
  const file = writeGateFile(
    `restauracion-${target.kind === 'local' ? 'local' : 'produccion'}-${fileStamp(now)}.json`,
    {
      destino: gateTargetLabel(target),
      ahora: now,
      ok: !failed,
      pasos: results,
      pasos_no_ejecutados: skipped,
    },
  )

  if (failed) {
    console.log(`  DETENIDA en «${failed.paso}».`)
    if (skipped.length > 0) console.log(`  NO se ejecutaron: ${skipped.join(', ')}.`)
    console.log(
      failed.paso === 'vaciar public'
        ? '  No se cambió nada: el vaciado es una transacción y no se cargó ningún archivo del respaldo.'
        : '  public quedó a medias. Con la causa resuelta, la restauración se repite ENTERA, con la pausa cerrada: es repetible (RUNBOOK §5.2).',
    )
  } else {
    console.log('  RESTAURADO: los cinco pasos terminaron sin errores.')
    console.log(
      '  Ahora: `supabase migration repair` hasta que el historial diga lo que la foto del respaldo,',
    )
    console.log(
      '  y `gate-snapshot` + `gate-compare` contra esa foto: estructura y filas (RUNBOOK §5.2, 5 y 6).',
    )
  }
  console.log(`Informe: ${file}`)
  process.exit(failed ? 2 : 0)
}

// Solo al ejecutarlo, no al importarlo (las pruebas unitarias importan las funciones).
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/restore-backup.ts')) {
  runGateTool(main, USAGE)
}
