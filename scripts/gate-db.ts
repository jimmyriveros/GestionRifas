/**
 * Lo común de las herramientas de PUERTA (Etapa 4 de D-208, `RUNBOOK` §9.0): a qué
 * base se conectan, cómo se comprueba que es el proyecto esperado y cómo leen sin
 * poder escribir.
 *
 *   --local                                 la base local (127.0.0.1:54322)
 *   --production --project-ref <referencia> el proyecto real, por SUPABASE_DB_URL
 *
 * Contra producción, la referencia del proyecto se lee de la propia cadena de
 * conexión —el usuario del pooler es `postgres.<referencia>`— y tiene que ser la que
 * se escribió: una `.env.local` que apunte a otro proyecto no llega a conectarse.
 *
 * SOLO LECTURA: `readOnly` abre UNA transacción `repeatable read read only`, así que
 * todo lo que se lee es el mismo instante y cualquier escritura falla. Nunca se
 * imprime la cadena de conexión ni ninguna credencial.
 *
 * Mismas reglas de argumentos que la puerta del cargador: una opción desconocida,
 * repetida o sin valor detiene la orden.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { config } from 'dotenv'
import { Client } from 'pg'

export const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
/** Donde se guardan las fotos y los informes. Está en `.gitignore`: nunca se versionan. */
export const GATE_OUTPUT_DIR = path.join('build', 'gate')

/** Las columnas que la bitácora genérica no registra: cambian solas, derivadas. */
export const AUDIT_IGNORED_COLUMNS = [
  'updated_at',
  'ticket_counter',
  'raffle_counter',
  'paid_amount',
  'payment_status',
]

/**
 * Tablas cuya clave primaria identifica a un CLIENTE: la foto guarda `md5:<huella>`
 * en vez del identificador, y el comparador la busca igual.
 */
export const HASHED_KEY_TABLES = new Set(['clients'])

type SnapshotRow = Record<string, unknown>

/**
 * Lo que guarda `scripts/gate-snapshot.ts` y leen el comparador y el ensayo de privilegios.
 *
 * `formato`, `captura`, `proyecto`, `huella` y la captura y la huella de `base` existen
 * desde `gate-snapshot/v2` (I-145). Una foto sin ellos es ANTERIOR: no dice de qué
 * proyecto es, sirve como evidencia histórica y como estructura de un ensayo, y nunca
 * para un veredicto de puerta (`provenanceProblems`, en `gate-diff.ts`).
 */
export type Snapshot = {
  formato?: string
  /** Identificador único de esta captura: dos fotos nunca lo comparten. */
  captura?: string
  etiqueta: string
  entorno: 'local' | 'produccion'
  /**
   * La referencia del proyecto con la que se CONECTÓ la foto —`readOnly` no conecta si
   * `SUPABASE_DB_URL` nombra otro—; `null` en local. Nunca una credencial.
   */
  proyecto?: string | null
  base: { etiqueta: string; ahora: string; captura?: string; huella?: string } | null
  meta: {
    ahora: string
    reloj: string
    snapshot: string
    version: string
    usuario: string
    replica: boolean
  }
  migraciones: Array<{ version: string; name: string }>
  estructura: Record<string, SnapshotRow[] | { error: string }>
  filas: Record<
    string,
    {
      pk: string[]
      columnas_nuevas: string[]
      n: number
      filas: Record<string, Array<string | null>>
    }
  >
  hechos: Record<string, unknown>
  /** SHA-256 de la representación estable de todo lo anterior (`snapshotDigest`). */
  huella?: string
}

export type GateTarget = { kind: 'local' | 'production'; projectRef: string | null }

/** Una orden que no se ejecuta. El mensaje dice qué falta. */
export class GateArgsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GateArgsError'
  }
}

const PROJECT_REF = /^[a-z]{20}$/
const LOCAL_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '0.0.0.0',
  '::1',
  '[::1]',
  'host.docker.internal',
])

export type ParsedArgs = {
  switches: Set<string>
  values: Map<string, string>
  positional: string[]
}

/**
 * Lee los argumentos con las mismas reglas que las puertas: las opciones conocidas
 * se declaran, y cualquier otra detiene la orden.
 */
export function parseArgs(
  args: readonly string[],
  spec: { switches: readonly string[]; valued: readonly string[]; positional?: number },
): ParsedArgs {
  const switches = new Set<string>()
  const values = new Map<string, string>()
  const positional: string[] = []
  const switchSet = new Set(['--local', '--production', ...spec.switches])
  const valuedSet = new Set(['--project-ref', ...spec.valued])

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (switchSet.has(arg)) {
      if (switches.has(arg)) throw new GateArgsError(`${arg} está repetido.`)
      switches.add(arg)
      continue
    }
    if (valuedSet.has(arg)) {
      if (values.has(arg)) throw new GateArgsError(`${arg} está repetido.`)
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new GateArgsError(`Falta el valor de ${arg}.`)
      }
      values.set(arg, value)
      index += 1
      continue
    }
    if (!arg.startsWith('--') && positional.length < (spec.positional ?? 0)) {
      positional.push(arg)
      continue
    }
    throw new GateArgsError(`No reconozco «${arg}». Una opción mal escrita no se ignora.`)
  }
  return { switches, values, positional }
}

/** El destino de una herramienta de puerta: uno solo, y el proyecto esperado si es producción. */
export function gateTarget(parsed: ParsedArgs): GateTarget {
  const local = parsed.switches.has('--local')
  const production = parsed.switches.has('--production')
  if (local === production) {
    throw new GateArgsError('Indica un solo destino: --local o --production.')
  }
  const projectRef = parsed.values.get('--project-ref') ?? null
  if (local) {
    if (projectRef !== null) throw new GateArgsError('--project-ref solo se usa con --production.')
    return { kind: 'local', projectRef: null }
  }
  if (projectRef === null || !PROJECT_REF.test(projectRef)) {
    throw new GateArgsError(
      'Con --production indica el proyecto esperado con --project-ref: 20 letras minúsculas.',
    )
  }
  return { kind: 'production', projectRef }
}

/**
 * La referencia del proyecto que nombra una cadena de conexión de Supabase: el
 * usuario del pooler (`postgres.<referencia>`) o el host directo
 * (`db.<referencia>.supabase.co`). `null` si no nombra ninguno.
 */
export function projectRefFromDbUrl(connectionString: string): string | null {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    return null
  }
  if (LOCAL_HOSTS.has(url.hostname)) return null
  const user = decodeURIComponent(url.username)
  const fromUser = user.startsWith('postgres.') ? user.slice('postgres.'.length) : null
  const fromHost = /^db\.([a-z]{20})\.supabase\.co$/.exec(url.hostname)?.[1] ?? null
  const ref = fromUser ?? fromHost
  return ref !== null && PROJECT_REF.test(ref) ? ref : null
}

/**
 * La cadena de conexión del destino, comprobada. Para producción lee `.env.local`
 * —solo aquí— y exige que nombre exactamente el proyecto esperado.
 */
export function connectionStringFor(target: GateTarget): string {
  if (target.kind === 'local') return LOCAL_DB_URL
  config({ path: '.env.local', quiet: true })
  const connectionString = process.env.SUPABASE_DB_URL
  if (!connectionString) {
    throw new GateArgsError(
      'Falta SUPABASE_DB_URL en .env.local (cadena del session pooler, I-005).',
    )
  }
  const ref = projectRefFromDbUrl(connectionString)
  if (ref === null) {
    throw new GateArgsError('SUPABASE_DB_URL no nombra ningún proyecto remoto de Supabase.')
  }
  if (ref !== target.projectRef) {
    throw new GateArgsError(
      'SUPABASE_DB_URL no corresponde a --project-ref: no es el proyecto esperado. No se conectó nada.',
    )
  }
  return connectionString
}

/** Cómo se nombra el destino en pantalla, sin la dirección ni la referencia entera. */
export function gateTargetLabel(target: GateTarget): string {
  return target.kind === 'local'
    ? 'LOCAL (127.0.0.1:54322)'
    : `PRODUCCIÓN (proyecto ${target.projectRef!.slice(0, 4)}…)`
}

export type Query = <T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

/**
 * Conecta y ejecuta `work` dentro de UNA transacción `repeatable read read only`,
 * que siempre se deshace. Nada de lo que haga `work` puede escribir.
 */
export async function readOnly<T>(
  target: GateTarget,
  work: (query: Query) => Promise<T>,
  statementTimeout = '180s',
): Promise<T> {
  const client = new Client({
    connectionString: connectionStringFor(target),
    ssl: target.kind === 'production' ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()
  try {
    await client.query('begin isolation level repeatable read read only')
    await client.query(`set local statement_timeout = '${statementTimeout}'`)
    await client.query('set local search_path = public, pg_catalog')
    const query: Query = async (sql, params = []) => (await client.query(sql, params)).rows as never
    return await work(query)
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end().catch(() => {})
  }
}

/** Guarda un archivo de la herramienta en `build/gate/` y devuelve su ruta. */
export function writeGateFile(name: string, content: unknown): string {
  mkdirSync(GATE_OUTPUT_DIR, { recursive: true })
  const file = path.join(GATE_OUTPUT_DIR, name)
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 1))
  return file
}

/** Una marca de tiempo que sirve para un nombre de archivo. */
export function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-')
}

/** Termina con el mensaje de una orden mal formada; cualquier otro error, solo su mensaje. */
export function runGateTool(main: () => Promise<void>, usage: string): void {
  main().catch((error: unknown) => {
    if (error instanceof GateArgsError) {
      console.error(`${error.message}\n\n${usage}`)
      process.exit(1)
    }
    // Solo el mensaje: un error de conexión podría arrastrar la cadena.
    console.error(error instanceof Error ? error.message : 'Error inesperado.')
    process.exit(1)
  })
}
