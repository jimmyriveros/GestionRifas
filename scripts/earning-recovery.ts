/**
 * RECUPERACIÓN a `0077`, ejecutable y con los PERMISOS DE ANTES — D-240, I-192, `RUNBOOK` §10.5.
 *
 *   npx tsx scripts/earning-recovery.ts <foto-de-antes-de-migrar.json>
 *        (--local | --production --project-ref <ref>) [--lock-timeout 5s] [--solo-privilegios]
 *
 * ESCRIBE. Se ejecuta con autorización expresa del dueño, con la pausa cerrada, y solo si
 * `scripts/earning-recovery-check.ts` dijo antes que se puede volver.
 *
 * Hace, en este orden, lo que antes eran pasos sueltos con `psql` —que no está instalado
 * en el equipo desde el que se opera—:
 *
 *   1. LA REFERENCIA. La foto de antes de migrar —la de P6 en producción— tiene que ser
 *      una foto completa y sin tocar, del MISMO destino al que se conecta esta orden, y de
 *      una base en `0077`. Si no, no se conecta nada.
 *   2. EL ESTADO. La base tiene que estar en `0078` o en `0079` (`earning-recovery-check`).
 *   3. EL ESQUEMA. `supabase/recovery/0079_a_0077.sql` tal cual, con su `lock_timeout`: una
 *      transacción, con su guardia —que se niega si ya hay acuerdos que no caben en 0077—
 *      y su comprobación de que no se mueve un peso. Si falla, no cambió nada.
 *   4. LOS PERMISOS (I-192). El script recrea unas funciones y les deja los privilegios
 *      del repositorio, que en el proyecto alojado NO son los que tenían: allí toda
 *      función nace ejecutable por `service_role` (I-132). Aquí cada función que el script
 *      recrea vuelve a tener EXACTAMENTE el ACL de la foto: se concede lo que tenía y le
 *      falta, se revoca lo que le sobra, y nada más. Una función que no tenía `EXECUTE`
 *      para `service_role` no lo recibe.
 *   5. LA COMPROBACIÓN. Todas las funciones de `public` —firma completa, cuerpo, dueño y
 *      ACL— tienen que ser las de la foto.
 *
 * Qué funciones toca el paso 4 se lee del propio script: las de sus líneas
 * `revoke all on function …`. No hay una segunda lista que pueda divergir.
 *
 * `--solo-privilegios` repite los pasos 4 y 5 sobre una base cuyo esquema ya es el de
 * `0077`: para reintentar si la orden se cortó entre el esquema y los permisos.
 *
 * Nunca imprime la cadena de conexión. Deja un informe en `build/gate/`. Termina en 0 si
 * la base quedó como la foto, en 2 si se negó o algo no coincide —dice qué— y en 1 si la
 * orden no se entiende.
 *
 * DESPUÉS, fuera de esta orden: `supabase migration repair --status reverted 0079 0078`,
 * `earning-recovery-check` —tiene que decir `0077`— y la estructura contra la foto.
 */
import { readFileSync } from 'node:fs'

import { Client } from 'pg'

import {
  classifyRelease,
  RECOVERY_SQL,
  RELEASE_STATE_SQL,
  type ReleaseFacts,
} from './earning-recovery-check'
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
  type Snapshot,
} from './gate-db'
import { aclStatements, foreignTarget, normalizeAcl, snapshotProblems } from './gate-diff'

const USAGE =
  'Uso: npx tsx scripts/earning-recovery.ts <foto-de-antes-de-migrar.json> ' +
  '(--local | --production --project-ref <ref>) [--lock-timeout 5s] [--solo-privilegios]'

type Row = Record<string, unknown>

/** Una función, como la guarda la foto y como se lee de la base. */
export type FunctionState = {
  firma: string
  acl: string | null
  propietario: string
  cuerpo: string
}

/** Lo mismo que lee `gate-snapshot` de cada función de `public`, para poder compararlo. */
export const FUNCTIONS_SQL = `
  select p.oid::regprocedure::text as firma, p.proacl::text as acl,
         pg_get_userbyid(p.proowner) as propietario,
         md5(replace(p.prosrc, chr(13), '')) as cuerpo
    from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`

/**
 * Las funciones que el script de recuperación recrea: las de sus líneas
 * `revoke all on function <firma> from …`, con la firma completa.
 */
export function recreatedFunctions(script: string): string[] {
  const found = [...script.matchAll(/^revoke all on function ([a-z_0-9]+\([^)]*\)) from /gm)].map(
    (m) => m[1]!.replace(/\s+/g, ''),
  )
  if (found.length === 0) {
    throw new Error(`${RECOVERY_SQL} no nombra ninguna función que recree.`)
  }
  const repeated = found.filter((f, i) => found.indexOf(f) !== i)
  if (repeated.length > 0) {
    throw new Error(`${RECOVERY_SQL} nombra dos veces ${repeated.join(', ')}.`)
  }
  return found
}

/**
 * Lo que impide usar una foto como REFERENCIA de los permisos: tiene que ser una foto
 * completa y sin tocar, del mismo destino que se pide y de una base en `0077`.
 */
export function referenceProblems(reference: unknown, target: GateTarget): string[] {
  const problems = snapshotProblems(reference, 'de referencia')
  if (problems.length > 0) return problems
  const photo = reference as Snapshot
  const foreign = foreignTarget(photo, target)
  if (foreign) {
    return [
      `La foto de referencia («${photo.etiqueta}») es de ${foreign} y esta orden es para ${gateTargetLabel(target)}: los permisos se devuelven con una foto del mismo destino.`,
    ]
  }
  const versions = photo.migraciones.map((m) => m.version).sort()
  const last = versions.at(-1)
  if (last !== '0077') {
    return [
      `La foto de referencia («${photo.etiqueta}») no es de antes de migrar: su última migración es ${String(last)}, no 0077.`,
    ]
  }
  if (!Array.isArray(photo.estructura.funciones) || photo.estructura.funciones.length === 0) {
    return [`La foto de referencia («${photo.etiqueta}») no trae las funciones de public.`]
  }
  return []
}

/** Las funciones de la foto, por firma. */
export function referenceFunctions(photo: Snapshot): Map<string, FunctionState> {
  return new Map(
    (photo.estructura.funciones as Row[]).map((f) => [
      String(f.firma),
      {
        firma: String(f.firma),
        acl: (f.acl as string | null) ?? null,
        propietario: String(f.propietario),
        cuerpo: String(f.cuerpo),
      },
    ]),
  )
}

/** El ACL de una función sin ACL explícito: su dueño y PUBLIC, como lo da `acldefault`. */
const implicitAcl = (owner: string) => `{${owner}=X/${owner},=X/${owner}}`

/**
 * Las sentencias que devuelven el ACL de las funciones recreadas al de la foto, y lo que
 * impide hacerlo. Solo esas funciones, y solo sus diferencias: nada se concede porque sí.
 */
export function privilegeStatements(
  signatures: readonly string[],
  current: Map<string, FunctionState>,
  reference: Map<string, FunctionState>,
): { statements: string[]; problems: string[] } {
  const statements: string[] = []
  const problems: string[] = []
  for (const firma of signatures) {
    const now = current.get(firma)
    const before = reference.get(firma)
    if (!before) {
      problems.push(
        `${firma}: no estaba en la foto de referencia, así que no se sabe qué permisos tenía.`,
      )
      continue
    }
    if (!now) {
      problems.push(`${firma}: el script tenía que recrearla y no existe.`)
      continue
    }
    if (now.propietario !== before.propietario) {
      problems.push(
        `${firma}: su dueño es ${now.propietario} y en la foto era ${before.propietario}.`,
      )
      continue
    }
    if (now.cuerpo !== before.cuerpo) {
      problems.push(`${firma}: su cuerpo no es el de la foto de referencia.`)
      continue
    }
    statements.push(
      ...aclStatements(
        `function public.${firma}`,
        now.acl ?? implicitAcl(now.propietario),
        before.acl ?? implicitAcl(before.propietario),
        now.propietario,
      ),
    )
  }
  return { statements, problems }
}

/** Qué funciones de `public` no son las de la foto: faltan, sobran o difieren. */
export function functionDifferences(
  current: Map<string, FunctionState>,
  reference: Map<string, FunctionState>,
): string[] {
  const out: string[] = []
  for (const [firma, before] of reference) {
    const now = current.get(firma)
    if (!now) {
      out.push(`${firma}: estaba en la foto y no existe`)
      continue
    }
    const acl = (f: FunctionState) => normalizeAcl(f.acl ?? implicitAcl(f.propietario))
    if (acl(now) !== acl(before)) out.push(`${firma}: permisos distintos de los de la foto`)
    if (now.cuerpo !== before.cuerpo) out.push(`${firma}: cuerpo distinto del de la foto`)
    if (now.propietario !== before.propietario) out.push(`${firma}: otro dueño`)
  }
  for (const firma of current.keys()) {
    if (!reference.has(firma)) out.push(`${firma}: existe y no estaba en la foto`)
  }
  return out
}

export type Options = {
  target: GateTarget
  reference: string
  lockTimeout: string
  onlyPrivileges: boolean
}

export function parseOptions(argv: readonly string[]): Options {
  const parsed = parseArgs(argv, {
    switches: ['--solo-privilegios'],
    valued: ['--lock-timeout'],
    positional: 1,
  })
  const reference = parsed.positional[0]
  if (!reference) throw new GateArgsError('Falta la foto de antes de migrar.')
  const lockTimeout = parsed.values.get('--lock-timeout') ?? '5s'
  if (!/^[1-9]\d{0,5}(ms|s)$/.test(lockTimeout)) {
    throw new GateArgsError('--lock-timeout es un tiempo como 900ms o 5s.')
  }
  return {
    target: gateTarget(parsed),
    reference,
    lockTimeout,
    onlyPrivileges: parsed.switches.has('--solo-privilegios'),
  }
}

/**
 * Las funciones de `public`, con el MISMO `search_path` con el que se tomó la foto
 * (`readOnly`, en `gate-db.ts`): de él depende cómo se escribe una firma.
 */
async function readFunctions(client: Client): Promise<Map<string, FunctionState>> {
  await client.query('begin read only')
  try {
    await client.query('set local search_path = public, pg_catalog')
    const { rows } = await client.query<FunctionState>(FUNCTIONS_SQL)
    return new Map(rows.map((r) => [r.firma, r]))
  } finally {
    await client.query('rollback').catch(() => {})
  }
}

async function readState(client: Client): Promise<ReleaseFacts> {
  return (await client.query<ReleaseFacts>(RELEASE_STATE_SQL)).rows[0]!
}

type Outcome = { ok: boolean; lines: string[]; report: Row }

async function recover(client: Client, options: Options, photo: Snapshot): Promise<Outcome> {
  const lines: string[] = []
  const script = readFileSync(RECOVERY_SQL, 'utf8')
  const signatures = recreatedFunctions(script)
  const reference = referenceFunctions(photo)
  const timings: Record<string, number> = {}

  // ---- 2. El estado
  const facts = await readState(client)
  const schemaIs0077 = facts.tabla_0077 && !facts.tabla_0078 && facts.funciones_0079 === 0
  if (options.onlyPrivileges) {
    if (!schemaIs0077) {
      return {
        ok: false,
        lines: [
          'NO: --solo-privilegios es para una base cuyo esquema ya es el de 0077, y esta no lo es. No se cambió nada.',
        ],
        report: { estado: facts },
      }
    }
  } else {
    const { estado, motivos } = classifyRelease(facts)
    if (estado !== '0078' && estado !== '0079') {
      return {
        ok: false,
        lines: [
          estado === '0077'
            ? 'NO: la base ya está en 0077: no hay nada que revertir. Si el esquema volvió y faltan los permisos, repite con --solo-privilegios.'
            : `NO: el historial y el esquema no dicen lo mismo (${motivos.join('; ')}). No se cambió nada.`,
        ],
        report: { estado: facts },
      }
    }

    // ---- 3. El esquema: el script tal cual, en su transacción
    const started = Date.now()
    try {
      await client.query(`set lock_timeout = '${options.lockTimeout}'`)
      await client.query(script)
    } catch (error) {
      await client.query('rollback').catch(() => {})
      return {
        ok: false,
        lines: [
          `NO: el script de recuperación se detuvo y no cambió nada: ${error instanceof Error ? error.message.split('\n').join(' · ') : 'error'}`,
        ],
        report: { estado: facts, ms: Date.now() - started },
      }
    } finally {
      await client.query('reset lock_timeout').catch(() => {})
    }
    timings.esquema_ms = Date.now() - started
    lines.push(`Esquema devuelto a 0077 en ${timings.esquema_ms} ms (desde ${estado}).`)
  }

  // ---- 4. Los permisos, como en la foto
  const started = Date.now()
  const { statements, problems } = privilegeStatements(
    signatures,
    await readFunctions(client),
    reference,
  )
  if (problems.length > 0) {
    return {
      ok: false,
      lines: [
        ...lines,
        'NO se tocaron los permisos: las funciones recreadas no son las de la foto de referencia.',
        ...problems.map((p) => `  · ${p}`),
      ],
      report: { estado: facts, problemas: problems, ...timings },
    }
  }
  await client.query('begin')
  try {
    for (const statement of statements) await client.query(statement)
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    return {
      ok: false,
      lines: [
        ...lines,
        `NO se cambiaron los permisos: ${error instanceof Error ? error.message : 'error'}. Repite con --solo-privilegios.`,
      ],
      report: { estado: facts, sentencias: statements, ...timings },
    }
  }
  timings.permisos_ms = Date.now() - started
  lines.push(
    statements.length === 0
      ? `Permisos: las ${signatures.length} funciones recreadas ya tenían los de la foto. Nada que cambiar.`
      : `Permisos: ${statements.length} sentencia(s) sobre las ${signatures.length} funciones recreadas, para dejarlas como en la foto.`,
  )
  for (const statement of statements) lines.push(`  · ${statement}`)

  // ---- 5. Todas las funciones, contra la foto
  const differences = functionDifferences(await readFunctions(client), reference)
  if (differences.length > 0) {
    lines.push(`LAS FUNCIONES NO SON LAS DE LA FOTO (${differences.length}):`)
    for (const d of differences.slice(0, 20)) lines.push(`  · ${d}`)
  } else {
    lines.push(
      `Comprobado: las ${reference.size} funciones de public —firma, cuerpo, dueño y permisos— son las de la foto «${photo.etiqueta}».`,
    )
  }
  return {
    ok: differences.length === 0,
    lines,
    report: {
      estado_inicial: facts,
      funciones_recreadas: signatures,
      sentencias: statements,
      diferencias: differences,
      ...timings,
    },
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))

  // ---- 1. La referencia, antes de conectar
  let photo: unknown
  try {
    photo = JSON.parse(readFileSync(options.reference, 'utf8'))
  } catch {
    throw new GateArgsError(
      `No se pudo leer la foto «${options.reference}»: no existe o no es un JSON completo.`,
    )
  }
  const problems = referenceProblems(photo, options.target)
  if (problems.length > 0) {
    console.log(`Recuperación a 0077 · ${gateTargetLabel(options.target)}`)
    console.log('  NO: la foto de referencia no sirve. No se conectó nada.')
    for (const p of problems) console.log(`  · ${p}`)
    process.exit(2)
  }

  const client = new Client({
    connectionString: connectionStringFor(options.target),
    ssl: options.target.kind === 'production' ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()
  let outcome: Outcome
  try {
    await client.query(`set statement_timeout = '120s'`)
    outcome = await recover(client, options, photo as Snapshot)
  } finally {
    await client.end().catch(() => {})
  }

  const now = new Date().toISOString()
  const file = writeGateFile(
    `recuperar-0079-${options.target.kind === 'local' ? 'local' : 'produccion'}-${fileStamp(now)}.json`,
    {
      destino: gateTargetLabel(options.target),
      ahora: now,
      referencia: (photo as Snapshot).etiqueta,
      solo_privilegios: options.onlyPrivileges,
      ok: outcome.ok,
      ...outcome.report,
    },
  )
  console.log(`Recuperación a 0077 · ${gateTargetLabel(options.target)} · ${now}`)
  for (const line of outcome.lines) console.log(`  ${line}`)
  if (outcome.ok && !options.onlyPrivileges) {
    console.log(
      '  Ahora: `supabase migration repair --status reverted` de las migraciones que estaban aplicadas,',
    )
    console.log(
      '  `earning-recovery-check` —tiene que decir 0077— y la estructura contra esta misma foto.',
    )
  }
  console.log(`Informe: ${file}`)
  process.exit(outcome.ok ? 0 : 2)
}

// Solo al ejecutarlo, no al importarlo (las pruebas unitarias importan las funciones).
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/earning-recovery.ts')) {
  runGateTool(main, USAGE)
}
