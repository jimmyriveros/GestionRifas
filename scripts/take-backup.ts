/**
 * TOMAR UN RESPALDO LÓGICO, deteniéndose ante el PRIMER fallo — I-024, `RUNBOOK` §5.1.
 *
 *   npx tsx scripts/take-backup.ts <carpeta-nueva-fuera-del-repositorio>
 *        (--local | --production --project-ref <ref>)
 *
 * SOLO LEE de la base. Contra el proyecto real, extrae los datos del negocio —también los de los
 * clientes—: se ejecuta solo con la autorización expresa del dueño y la carpeta tiene que quedar
 * FUERA de este repositorio. En local sirve para ensayar el respaldo y su restauración con datos
 * sintéticos.
 *
 * Son las tres órdenes de §5.1, que hasta ahora se escribían a mano, con lo que antes había que
 * acordarse de comprobar:
 *
 *   0. ANTES DE CONECTAR: un solo destino; para producción, que `SUPABASE_DB_URL` nombre el
 *      proyecto esperado (`gate-db.ts`); y una carpeta NUEVA —que no exista o esté vacía— y
 *      fuera del repositorio, para que un respaldo nunca acabe en Git.
 *   1. Los recuentos de filas de cada tabla de `public` y la última migración, en una transacción
 *      de solo lectura (`readOnly`). Solo números: ningún dato de nadie.
 *   2. `roles.sql`  (`supabase db dump --role-only`).
 *   3. `schema.sql` (`supabase db dump`, SIN `--schema`: con él se rompe `pg_trgm`).
 *   4. `data.sql`   (`supabase db dump --schema public --data-only`: sin `auth`, a propósito).
 *   5. Comprobar los tres con la MISMA regla que usa la restauración (`backupProblems`, de
 *      `restore-backup.ts`): que no estén vacíos, que no traigan órdenes de `psql` y que `data.sql`
 *      no nombre el esquema `auth` —ni una contraseña cifrada ni un token—.
 *   6. Los recuentos otra vez. Si cambiaron, hubo escrituras durante el volcado: el respaldo vale
 *      —`pg_dump` lee un solo instante—, pero no se puede contrastar fila a fila con esos recuentos,
 *      y el manifiesto lo dice.
 *
 * CADA PASO SOLO EMPIEZA SI EL ANTERIOR TERMINÓ. Al final escribe `manifiesto.json`: destino, hora,
 * versión de la CLI, última migración, recuentos, y la huella SHA-256 y el tamaño de cada archivo,
 * con `estado` COMPLETO o INCOMPLETO —el paso en que se detuvo y los que no se ejecutaron—.
 * `restore-backup.ts` se niega a cargar un respaldo INCOMPLETO o cuyos archivos ya no tienen la
 * huella del manifiesto, y al terminar compara los recuentos.
 *
 * Nunca imprime la cadena de conexión: lo que la CLI escribe en su salida de error se muestra
 * solo después de quitarle cualquier dirección `postgres://`. Termina en 0 si el respaldo está
 * COMPLETO, en 2 si se detuvo y en 1 si la orden no se entiende.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  BACKUP_FILES,
  countsDiffer,
  fileDigest,
  MANIFEST_FILE,
  MANIFEST_FORMAT,
  readCounts,
  type BackupFileName,
  type Counts,
  type Manifest,
} from './backup-manifest'
import {
  connectionStringFor,
  GateArgsError,
  gateTarget,
  gateTargetLabel,
  parseArgs,
  readOnly,
  runGateTool,
  type GateTarget,
} from './gate-db'
import { backupProblems } from './restore-backup'

const USAGE =
  'Uso: npx tsx scripts/take-backup.ts <carpeta-nueva-fuera-del-repositorio> (--local | --production --project-ref <ref>)'

/** Los pasos, en el orden en que se ejecutan. */
export const BACKUP_STEPS = [
  'recuentos antes',
  'roles.sql',
  'schema.sql',
  'data.sql',
  'comprobar archivos',
  'recuentos después',
] as const
export type BackupStep = (typeof BACKUP_STEPS)[number]

export function parseOptions(argv: readonly string[]): { target: GateTarget; folder: string } {
  const parsed = parseArgs(argv, { switches: [], valued: [], positional: 1 })
  const folder = parsed.positional[0]
  if (!folder) throw new GateArgsError('Falta la carpeta donde se guarda el respaldo.')
  return { target: gateTarget(parsed), folder }
}

/** ¿`inner` está dentro de `outer` (o es la misma carpeta)? Sin distinguir mayúsculas en Windows. */
export function isInside(inner: string, outer: string, platform = process.platform): boolean {
  const normalize = (p: string) => {
    const resolved = path.resolve(p)
    return platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  const relative = path.relative(normalize(outer), normalize(inner))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * Por qué no se puede guardar el respaldo en esa carpeta, ANTES de conectar: dentro del
 * repositorio acabaría en Git —o en `build/`, que no se versiona pero sigue en este equipo y en
 * cualquier copia del proyecto—, y en una carpeta con archivos se mezclaría con otro respaldo.
 */
export function folderProblems(folder: string, repoRoot: string): string[] {
  const problems: string[] = []
  if (isInside(folder, repoRoot)) {
    problems.push(
      'La carpeta está dentro del repositorio. Un respaldo lleva datos de clientes: guárdalo fuera (RUNBOOK §5.1).',
    )
  }
  if (existsSync(folder)) {
    if (!statSync(folder).isDirectory()) problems.push('La ruta existe y no es una carpeta.')
    else if (readdirSync(folder).length > 0) {
      problems.push('La carpeta ya tiene archivos. Usa una carpeta nueva para cada respaldo.')
    }
  }
  return problems
}

/**
 * Quita de un texto cualquier dirección de PostgreSQL —con usuario y contraseña— antes de
 * mostrarlo. La CLI puede repetir la orden que ejecutó en su salida de error.
 */
export function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://[oculto]')
}

/** Los argumentos de `supabase db dump` para cada archivo. La dirección va aparte, al final. */
export function dumpArgs(file: BackupFileName, output: string): string[] {
  const base = ['db', 'dump', '-f', output]
  if (file === 'roles.sql') return [...base, '--role-only']
  if (file === 'schema.sql') return base
  return [...base, '--schema', 'public', '--data-only']
}

const CLI_ENTRY = path.join('node_modules', 'supabase', 'dist', 'supabase.js')

function cliVersion(): string | null {
  const result = spawnSync(process.execPath, [CLI_ENTRY, '--version'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim().split('\n').pop()!.trim() : null
}

/** Un volcado con la CLI del proyecto, sin pasar por una consola. Devuelve el error o `null`. */
function runDump(target: GateTarget, file: BackupFileName, output: string): string | null {
  const args = dumpArgs(file, output)
  if (target.kind === 'local') args.push('--local')
  else args.push('--db-url', connectionStringFor(target))
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) return redact(result.error.message)
  if (result.status !== 0) {
    const tail = redact(`${result.stderr ?? ''}`)
      .trim()
      .split('\n')
      .slice(-3)
      .join(' · ')
    return `la CLI terminó con ${result.status}${tail ? `: ${tail}` : ''}`
  }
  if (!existsSync(output)) return 'la CLI terminó sin escribir el archivo'
  return null
}

async function main(): Promise<void> {
  const { target, folder } = parseOptions(process.argv.slice(2))
  const repoRoot = process.cwd()

  // ---- 0. La orden y la carpeta, antes de conectar
  if (target.kind === 'production') connectionStringFor(target)
  const problems = folderProblems(folder, repoRoot)
  console.log(`Respaldo lógico · ${gateTargetLabel(target)}`)
  if (problems.length > 0) {
    console.log('  NO: no se conectó ni se escribió nada.')
    for (const p of problems) console.log(`  · ${p}`)
    process.exit(2)
  }
  mkdirSync(folder, { recursive: true })

  const inicio = new Date().toISOString()
  const pasos: Manifest['pasos'] = []
  const archivos: Manifest['archivos'] = {}
  let recuentos: Counts | null = null
  let escrituras: boolean | null = null
  let problemas: string[] = []

  const step = async (paso: BackupStep, work: () => Promise<string | null>): Promise<boolean> => {
    const started = Date.now()
    let error: string | null
    try {
      error = await work()
    } catch (caught) {
      if (caught instanceof GateArgsError) throw caught
      error = redact(caught instanceof Error ? caught.message.split('\n')[0]! : 'error')
    }
    const ms = Date.now() - started
    pasos.push(error === null ? { paso, ok: true, ms } : { paso, ok: false, ms, error })
    console.log(
      `  ${error === null ? 'OK ' : 'FALLÓ'} ${paso} · ${ms} ms${error ? ` · ${error}` : ''}`,
    )
    return error === null
  }

  // ---- 1 a 6. Cada paso, solo si el anterior terminó
  const plan: Array<[BackupStep, () => Promise<string | null>]> = [
    [
      'recuentos antes',
      async () => {
        recuentos = await readOnly(target, readCounts)
        return null
      },
    ],
    ...BACKUP_FILES.map((file): [BackupStep, () => Promise<string | null>] => [
      file,
      async () => {
        const output = path.join(folder, file)
        const error = runDump(target, file, output)
        if (error === null) archivos[file] = fileDigest(output)
        return error
      },
    ]),
    [
      'comprobar archivos',
      async () => {
        const read = (name: BackupFileName) => readFileSync(path.join(folder, name), 'utf8')
        problemas = backupProblems({
          roles: read('roles.sql'),
          schema: read('schema.sql'),
          data: read('data.sql'),
        })
        return problemas.length === 0
          ? null
          : `${problemas.length} problema(s): ${problemas.join(' ')}`
      },
    ],
    [
      'recuentos después',
      async () => {
        const after = await readOnly(target, readCounts)
        escrituras = countsDiffer(recuentos!, after)
        return null
      },
    ],
  ]
  for (const [paso, work] of plan) {
    if (!(await step(paso, work))) break
  }

  const failed = pasos.find((p) => !p.ok)
  const manifest: Manifest = {
    formato: MANIFEST_FORMAT,
    estado: failed ? 'INCOMPLETO' : 'COMPLETO',
    destino: gateTargetLabel(target),
    entorno: target.kind === 'local' ? 'local' : 'produccion',
    proyecto: target.projectRef,
    inicio,
    fin: new Date().toISOString(),
    cli: cliVersion(),
    recuentos,
    escrituras_durante_el_volcado: escrituras,
    archivos,
    pasos,
    pasos_no_ejecutados: BACKUP_STEPS.slice(pasos.length),
    problemas,
  }
  writeFileSync(path.join(folder, MANIFEST_FILE), JSON.stringify(manifest, null, 1))

  if (failed) {
    console.log(
      `  DETENIDO en «${failed.paso}». El respaldo está INCOMPLETO: no sirve para restaurar.`,
    )
    if (manifest.pasos_no_ejecutados.length > 0) {
      console.log(`  NO se ejecutaron: ${manifest.pasos_no_ejecutados.join(', ')}.`)
    }
  } else {
    console.log('  COMPLETO: los tres archivos, comprobados, con su huella en el manifiesto.')
    if (escrituras) {
      console.log(
        '  Hubo escrituras durante el volcado: el respaldo vale, pero sus recuentos no son los del archivo de datos.',
      )
    }
    console.log(
      '  Ahora: copiarlo fuera de este equipo (RUNBOOK §5.1) y, de vez en cuando, restaurarlo en local (§5.2).',
    )
  }
  console.log(`Manifiesto: ${path.join(folder, MANIFEST_FILE)}`)
  process.exit(failed ? 2 : 0)
}

// Solo al ejecutarlo, no al importarlo (las pruebas unitarias importan las funciones).
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/take-backup.ts')) {
  runGateTool(main, USAGE)
}
