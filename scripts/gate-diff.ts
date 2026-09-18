/**
 * Lo PURO de las herramientas de puerta (Etapa 4 de D-208, `RUNBOOK` §9.0): de dónde
 * viene una foto y si sirve para una puerta, cómo se comparan dos fotos —estructura y
 * filas— y cómo se lee un ACL. Sin base, sin red y sin reloj, para poder probarlo
 * aislado (`tests/unit/gate-tools.test.ts`). Lo usan `scripts/gate-snapshot.ts`,
 * `scripts/gate-compare.ts` y `scripts/gate-mirror-privileges.ts`.
 */
import { createHash } from 'node:crypto'

import { gateTargetLabel, type GateTarget, type Snapshot } from './gate-db'
import { stableJson } from './record-prize-awards-guard'

type Row = Record<string, unknown>
export type CategoryDelta = {
  agregados: Record<string, string>
  quitados: string[]
  cambiados: Record<string, { antes: string; despues: string }>
}
export type Delta = Record<string, CategoryDelta>
export type Operation = 'none' | 'migrations' | 'awards'

// -----------------------------------------------------------------------------
// Procedencia de una foto (puro) — I-145
// -----------------------------------------------------------------------------

/**
 * El formato de las fotos que registran de qué destino son. Una foto sin `formato` es
 * anterior: evidencia histórica y estructura para un ensayo, nunca un veredicto.
 */
export const SNAPSHOT_FORMAT = 'gate-snapshot/v2'

/** Las categorías de estructura de toda foto. `cron` y `vault` pueden guardar `{ error }`. */
const STRUCTURE_CATEGORIES = [
  'tablas',
  'columnas',
  'restricciones',
  'indices',
  'disparadores',
  'politicas',
  'funciones',
  'tipos',
  'vistas',
  'extensiones',
  'publicaciones',
  'privilegios_por_defecto',
  'esquema_public',
]
const MAYBE_FAILED_CATEGORIES = ['cron', 'vault']

const PROJECT_REF = /^[a-z]{20}$/
const CAPTURE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DIGEST = /^[0-9a-f]{64}$/

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isInstant = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value))

/**
 * La huella de una foto: SHA-256 de su representación estable —claves ordenadas, la
 * misma que usa la huella de la vista previa del cargador— sin la propia huella.
 * Cambia si cambia cualquier cosa: una fila, la hora o el destino.
 */
export function snapshotDigest(snapshot: Snapshot): string {
  const rest: Record<string, unknown> = { ...snapshot }
  delete rest.huella
  return createHash('sha256').update(stableJson(rest)).digest('hex')
}

/** El destino de una foto, como se nombra en pantalla: sin la referencia entera. */
export function snapshotTargetLabel(snapshot: Pick<Snapshot, 'entorno' | 'proyecto'>): string {
  if (snapshot.entorno !== 'produccion') return gateTargetLabel({ kind: 'local', projectRef: null })
  return typeof snapshot.proyecto === 'string'
    ? gateTargetLabel({ kind: 'production', projectRef: snapshot.proyecto })
    : 'PRODUCCIÓN (sin proyecto registrado)'
}

const projectPrefix = (snapshot: Pick<Snapshot, 'proyecto'>) =>
  `${String(snapshot.proyecto).slice(0, 4)}…`

/**
 * De qué destino es una foto cuando NO es el pedido; `null` si lo es. Dos referencias
 * pueden empezar igual y aquí nunca se escriben enteras, así que la de otro proyecto se
 * nombra como «otro proyecto», no solo por su comienzo.
 */
export function foreignTarget(
  snapshot: Pick<Snapshot, 'entorno' | 'proyecto'>,
  target: GateTarget,
): string | null {
  if (target.kind === 'local') {
    return snapshot.entorno === 'local' ? null : snapshotTargetLabel(snapshot)
  }
  if (snapshot.entorno !== 'produccion') return snapshotTargetLabel(snapshot)
  return snapshot.proyecto === target.projectRef
    ? null
    : `otro proyecto de producción (${projectPrefix(snapshot)})`
}

/**
 * Lo que impide usar UNA foto en una puerta: un formato anterior, partes que faltan, un
 * destino incoherente o una huella que ya no coincide. Vacío = se puede usar. Nunca
 * atribuye un proyecto a una foto que no lo registró: solo dice que hay que tomarla otra vez.
 */
export function snapshotProblems(value: unknown, name: string): string[] {
  if (!isObject(value)) return [`La foto ${name} no es una foto de la puerta.`]
  const s = value
  const who = typeof s.etiqueta === 'string' ? `${name} («${s.etiqueta}»)` : name
  if (s.formato === undefined) {
    return [
      `La foto ${who} es de un formato anterior a ${SNAPSHOT_FORMAT}: no registra de qué proyecto es. ` +
        'Se conserva como evidencia histórica; para una puerta, vuelve a tomarla con scripts/gate-snapshot.ts.',
    ]
  }
  if (s.formato !== SNAPSHOT_FORMAT) {
    return [`La foto ${who} tiene un formato desconocido («${String(s.formato)}»).`]
  }

  const missing: string[] = []
  if (typeof s.etiqueta !== 'string' || s.etiqueta === '') missing.push('falta la etiqueta')
  if (typeof s.captura !== 'string' || !CAPTURE_ID.test(s.captura)) missing.push('falta la captura')
  if (s.entorno === 'produccion') {
    if (typeof s.proyecto !== 'string' || !PROJECT_REF.test(s.proyecto))
      missing.push('falta el proyecto de producción')
  } else if (s.entorno === 'local') {
    if (s.proyecto !== null) missing.push('nombra un proyecto y una foto local no nombra ninguno')
  } else missing.push('falta el destino')
  const base = s.base
  if (
    base !== null &&
    !(
      isObject(base) &&
      typeof base.etiqueta === 'string' &&
      isInstant(base.ahora) &&
      typeof base.captura === 'string' &&
      CAPTURE_ID.test(base.captura) &&
      typeof base.huella === 'string' &&
      DIGEST.test(base.huella)
    )
  ) {
    missing.push('falta la referencia completa de su foto base (o null, si no se tomó con --base)')
  }
  const meta = s.meta
  if (
    !isObject(meta) ||
    !isInstant(meta.ahora) ||
    !isInstant(meta.reloj) ||
    typeof meta.snapshot !== 'string' ||
    typeof meta.version !== 'string' ||
    typeof meta.usuario !== 'string' ||
    typeof meta.replica !== 'boolean'
  ) {
    missing.push('faltan los datos del instante (meta)')
  }
  if (!Array.isArray(s.migraciones)) missing.push('faltan las migraciones')
  const structure = s.estructura
  if (!isObject(structure)) missing.push('falta la estructura')
  else {
    for (const category of STRUCTURE_CATEGORIES) {
      if (!Array.isArray(structure[category])) missing.push(`falta la estructura «${category}»`)
    }
    for (const category of MAYBE_FAILED_CATEGORIES) {
      const c = structure[category]
      if (!Array.isArray(c) && !(isObject(c) && typeof c.error === 'string'))
        missing.push(`falta la estructura «${category}»`)
    }
  }
  const rows = s.filas
  if (!isObject(rows) || Object.keys(rows).length === 0) missing.push('faltan las filas')
  else {
    for (const [table, t] of Object.entries(rows)) {
      if (
        !isObject(t) ||
        !Array.isArray(t.pk) ||
        t.pk.length === 0 ||
        !Array.isArray(t.columnas_nuevas) ||
        !isObject(t.filas) ||
        t.n !== Object.keys(t.filas).length
      ) {
        missing.push(`faltan o no cuadran las filas de ${table}`)
      }
    }
  }
  if (!isObject(s.hechos)) missing.push('faltan los hechos')
  if (typeof s.huella !== 'string' || !DIGEST.test(s.huella)) missing.push('falta su huella')
  if (missing.length > 0) {
    return [`La foto ${who} está incompleta: ${missing.join('; ')}. Vuelve a tomarla.`]
  }
  if (snapshotDigest(s as Snapshot) !== s.huella) {
    return [
      `La foto ${who} no coincide con su huella: está incompleta o cambió después de tomarla. Vuelve a tomarla.`,
    ]
  }
  return []
}

/**
 * Lo que impide que DOS fotos den un veredicto de puerta (I-145). Se comprueba siempre,
 * antes de mirar si hay diferencias: las dos completas y de este formato, del MISMO
 * destino y del que se pidió, dos capturas distintas, la de después posterior a la de
 * antes y, si la de después se tomó con `--base`, que su base sea esa misma foto de antes.
 */
export function provenanceProblems(before: unknown, after: unknown, target: GateTarget): string[] {
  const problems = [
    ...snapshotProblems(before, 'de antes'),
    ...snapshotProblems(after, 'de después'),
  ]
  if (problems.length > 0) return problems
  const a = before as Snapshot
  const b = after as Snapshot

  if (a.captura === b.captura) {
    return [
      `Las dos fotos son la misma captura («${a.etiqueta}», ${a.meta.ahora}): una comparación necesita un antes y un después.`,
    ]
  }
  if (a.entorno !== b.entorno || a.proyecto !== b.proyecto) {
    problems.push(
      a.entorno === 'produccion' && b.entorno === 'produccion'
        ? `Las dos fotos son de proyectos distintos (${projectPrefix(a)} y ${projectPrefix(b)}): una comparación se hace entre dos fotos del mismo proyecto.`
        : `Las dos fotos son de destinos distintos: la de antes, de ${snapshotTargetLabel(a)}; la de después, de ${snapshotTargetLabel(b)}.`,
    )
    for (const [name, s] of [
      ['de antes', a],
      ['de después', b],
    ] as const) {
      const foreign = foreignTarget(s, target)
      if (foreign)
        problems.push(
          `Se pidió ${gateTargetLabel(target)} y la foto ${name} («${s.etiqueta}») es de ${foreign}.`,
        )
    }
  } else {
    const foreign = foreignTarget(a, target)
    if (foreign)
      problems.push(`Se pidió ${gateTargetLabel(target)} y las dos fotos son de ${foreign}.`)
  }
  const from = Date.parse(a.meta.ahora)
  const to = Date.parse(b.meta.ahora)
  if (to <= from) {
    problems.push(
      `La foto de después («${b.etiqueta}», ${b.meta.ahora}) no es posterior a la de antes («${a.etiqueta}», ${a.meta.ahora}): ` +
        (to < from ? 'el orden está invertido.' : 'se tomaron en el mismo instante.'),
    )
  }
  const base = b.base
  if (
    base !== null &&
    (base.captura !== a.captura ||
      base.huella !== a.huella ||
      base.etiqueta !== a.etiqueta ||
      base.ahora !== a.meta.ahora)
  ) {
    problems.push(
      `La foto de después («${b.etiqueta}») se tomó con --base de otra foto («${base.etiqueta}», ${base.ahora}), no de la de antes («${a.etiqueta}»).`,
    )
  }
  return problems
}

// -----------------------------------------------------------------------------
// Estructura (puro)
// -----------------------------------------------------------------------------

/** El ACL sin quién lo concedió y en orden: dos ACL iguales se escriben igual. */
export function normalizeAcl(acl: unknown): string | null {
  if (acl === null || acl === undefined) return null
  return String(acl)
    .replace(/^\{|\}$/g, '')
    .split(',')
    .filter(Boolean)
    .map((e) => e.replace(/^"|"$/g, '').replace(/\/[^/]*$/, ''))
    .sort()
    .join(',')
}

/** Cada objeto de la estructura, por categoría y nombre, con su definición como texto. */
export function structureMap(snapshot: Snapshot): Record<string, Record<string, string>> {
  const e = snapshot.estructura
  const map: Record<string, Record<string, string>> = {}
  const put = (category: string, key: string, value: unknown) =>
    ((map[category] ??= {})[key] = JSON.stringify(value))
  const list = (name: string) => (Array.isArray(e[name]) ? (e[name] as Row[]) : [])
  for (const x of list('tablas'))
    put('tablas', String(x.nombre), {
      tipo: x.tipo,
      rls: x.rls,
      rls_forzada: x.rls_forzada,
      acl: normalizeAcl(x.acl),
    })
  for (const x of list('columnas'))
    put('columnas', `${String(x.tabla)}.${String(x.columna)}`, {
      tipo: x.tipo,
      no_nulo: x.no_nulo,
      defecto: x.defecto,
      acl: normalizeAcl(x.acl),
    })
  for (const x of list('restricciones'))
    put('restricciones', `${String(x.objeto)}.${String(x.nombre)}`, {
      tipo: x.tipo,
      def: x.def,
      validada: x.validada,
    })
  for (const x of list('indices')) put('indices', `${String(x.tabla)}.${String(x.nombre)}`, x.def)
  for (const x of list('disparadores'))
    put('disparadores', `${String(x.tabla)}.${String(x.nombre)}`, { estado: x.estado, def: x.def })
  for (const x of list('politicas'))
    put('politicas', `${String(x.tabla)}.${String(x.nombre)}`, {
      permissive: x.permissive,
      roles: x.roles,
      cmd: x.cmd,
      qual: x.qual,
      with_check: x.with_check,
    })
  for (const x of list('funciones'))
    put('funciones', String(x.firma), {
      tipo: x.tipo,
      sd: x.security_definer,
      vol: x.volatilidad,
      config: x.config,
      cuerpo: x.cuerpo,
      devuelve: x.devuelve,
      acl: normalizeAcl(x.acl),
      propietario: x.propietario,
    })
  for (const x of list('tipos'))
    put('tipos', String(x.nombre), { tipo: x.tipo, valores: x.valores })
  for (const x of list('vistas')) put('vistas', String(x.nombre), x.def)
  for (const x of list('extensiones'))
    put('extensiones', String(x.nombre), { version: x.version, esquema: x.esquema })
  for (const x of list('cron'))
    put('cron', String(x.nombre), { schedule: x.schedule, active: x.active, comando: x.comando })
  for (const x of list('vault')) put('vault', String(x.nombre), true)
  for (const x of list('publicaciones'))
    put(
      'publicaciones',
      `${String(x.pubname)}.${String(x.schemaname)}.${String(x.tablename)}`,
      true,
    )
  for (const x of list('privilegios_por_defecto'))
    put(
      'privilegios_por_defecto',
      `${String(x.rol)}.${String(x.esquema)}.${String(x.tipo)}`,
      normalizeAcl(x.acl),
    )
  for (const x of list('esquema_public')) put('esquema_public', 'public', normalizeAcl(x.acl))
  for (const x of snapshot.migraciones) put('migraciones', x.version, x.name)
  return map
}

/** Lo que se añadió, se quitó y cambió entre dos estructuras. */
export function structureDelta(before: Snapshot, after: Snapshot): Delta {
  const a = structureMap(before)
  const b = structureMap(after)
  const delta: Delta = {}
  for (const category of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[category] ?? {}
    const y = b[category] ?? {}
    const d: CategoryDelta = { agregados: {}, quitados: [], cambiados: {} }
    for (const k of Object.keys(y)) {
      if (!(k in x)) d.agregados[k] = y[k]!
      else if (x[k] !== y[k]) d.cambiados[k] = { antes: x[k]!, despues: y[k]! }
    }
    for (const k of Object.keys(x)) if (!(k in y)) d.quitados.push(k)
    d.quitados.sort()
    if (Object.keys(d.agregados).length || d.quitados.length || Object.keys(d.cambiados).length) {
      delta[category] = d
    }
  }
  return delta
}

export function deltaSummary(delta: Delta): Record<string, string> {
  return Object.fromEntries(
    Object.entries(delta).map(([c, d]) => [
      c,
      `+${Object.keys(d.agregados).length} −${d.quitados.length} ~${Object.keys(d.cambiados).length}`,
    ]),
  )
}

/**
 * Qué difiere entre el delta esperado —el del ensayo local con los privilegios de
 * producción— y el observado. Vacío = idénticos.
 */
export function compareDeltas(expected: Delta, observed: Delta): string[] {
  const problems: string[] = []
  const empty: CategoryDelta = { agregados: {}, quitados: [], cambiados: {} }
  for (const category of new Set([...Object.keys(expected), ...Object.keys(observed)])) {
    const e = expected[category] ?? empty
    const o = observed[category] ?? empty
    for (const k of new Set([...Object.keys(e.agregados), ...Object.keys(o.agregados)])) {
      if (!(k in o.agregados)) problems.push(`${category} «${k}»: se esperaba crearlo y no se creó`)
      else if (!(k in e.agregados)) problems.push(`${category} «${k}»: se creó sin esperarlo`)
      else if (e.agregados[k] !== o.agregados[k])
        problems.push(`${category} «${k}»: se creó con otra definición`)
    }
    for (const k of new Set([...e.quitados, ...o.quitados])) {
      if (!o.quitados.includes(k)) problems.push(`${category} «${k}»: se esperaba quitarlo y sigue`)
      else if (!e.quitados.includes(k)) problems.push(`${category} «${k}»: se quitó sin esperarlo`)
    }
    for (const k of new Set([...Object.keys(e.cambiados), ...Object.keys(o.cambiados)])) {
      if (!(k in o.cambiados))
        problems.push(`${category} «${k}»: se esperaba que cambiara y no cambió`)
      else if (!(k in e.cambiados)) problems.push(`${category} «${k}»: cambió sin esperarlo`)
      else if (e.cambiados[k]!.despues !== o.cambiados[k]!.despues)
        problems.push(`${category} «${k}»: quedó distinto de lo esperado`)
    }
  }
  return problems
}

// -----------------------------------------------------------------------------
// Filas (puro)
// -----------------------------------------------------------------------------

export type TableChanges = {
  agregadas: string[]
  quitadas: string[]
  modificadas: Array<{ k: string; soloIgnoradas: boolean; soloLectura: boolean }>
}

/**
 * Qué filas se añadieron, se quitaron o cambiaron, tabla por tabla, comparando sus
 * huellas. Una tabla con columnas nuevas solo es comparable si la foto de después se
 * tomó con `--base` de la de antes.
 */
export function rowChanges(
  before: Snapshot,
  after: Snapshot,
): {
  cambios: Record<string, TableChanges>
  tablasNuevas: Record<string, number>
  problemas: string[]
} {
  const cambios: Record<string, TableChanges> = {}
  const tablasNuevas: Record<string, number> = {}
  const problemas: string[] = []
  const usesBase = after.base !== null && after.base.ahora === before.meta.ahora
  const columns = (s: Snapshot, table: string) =>
    ((s.estructura.columnas as Row[]) ?? [])
      .filter((c) => c.tabla === table)
      .map((c) => String(c.columna))
      .sort()
      .join(',')

  for (const [table, d] of Object.entries(after.filas)) {
    const a = before.filas[table]
    if (!a) {
      tablasNuevas[table] = d.n
      if (d.n > 0)
        problemas.push(`La tabla nueva ${table} tiene ${d.n} filas y tenía que nacer vacía`)
      continue
    }
    const withNewColumns = columns(before, table) !== columns(after, table)
    if (withNewColumns && !(usesBase && d.columnas_nuevas.length > 0)) {
      problemas.push(
        `${table} tiene columnas distintas y la foto de después no se tomó con --base: no es comparable`,
      )
      continue
    }
    const c: TableChanges = { agregadas: [], quitadas: [], modificadas: [] }
    for (const [k, v] of Object.entries(d.filas)) {
      const va = a.filas[k]
      if (!va) {
        c.agregadas.push(k)
        continue
      }
      const [h, hc, hr] = withNewColumns ? [v[3], v[4], v[5]] : [v[0], v[1], v[2]]
      if (h !== va[0]) {
        c.modificadas.push({
          k,
          soloIgnoradas: hc === va[1],
          soloLectura: hr != null && hr === va[2],
        })
      }
    }
    for (const k of Object.keys(a.filas)) if (!d.filas[k]) c.quitadas.push(k)
    if (c.agregadas.length || c.quitadas.length || c.modificadas.length) cambios[table] = c
  }
  for (const table of Object.keys(before.filas)) {
    if (!after.filas[table]) problemas.push(`La tabla ${table} desapareció`)
  }
  for (const [table, c] of Object.entries(cambios)) {
    if (c.quitadas.length > 0) problemas.push(`${c.quitadas.length} fila(s) borradas en ${table}`)
  }
  return { cambios, tablasNuevas, problemas }
}

/** Las horas UTC en que `vercel.json` programa el sincronizador. */
export function cronHours(vercelJson: string): Set<number> {
  const crons = (JSON.parse(vercelJson) as { crons?: Array<{ schedule: string }> }).crons ?? []
  return new Set(crons.map((c) => Number(c.schedule.split(' ')[1])))
}

/** Las letras de un ACL de PostgreSQL y el privilegio que nombran. */
export const PRIVILEGE_NAME: Record<string, string> = {
  a: 'insert',
  r: 'select',
  w: 'update',
  d: 'delete',
  D: 'truncate',
  x: 'references',
  t: 'trigger',
  m: 'maintain',
  X: 'execute',
  U: 'usage',
  C: 'create',
}
/** Las clases de objeto de `pg_default_acl`, como las nombra `alter default privileges`. */
export const DEFAULT_PRIVILEGE_CLASS: Record<string, string> = {
  f: 'functions',
  S: 'sequences',
  r: 'tables',
  T: 'types',
}

/** `{postgres=X/postgres,service_role=X/postgres}` → rol → letras. `public` es el rol vacío. */
export function aclEntries(acl: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!acl) return map
  for (const raw of acl
    .replace(/^\{|\}$/g, '')
    .split(',')
    .filter(Boolean)) {
    const entry = raw.replace(/^"|"$/g, '')
    const eq = entry.indexOf('=')
    const who = entry.slice(0, eq)
    const letters = entry
      .slice(eq + 1)
      .replace(/\/.*$/, '')
      .replace(/\*/g, '')
    map.set(who === '' ? 'public' : who, letters)
  }
  return map
}

/** Las sentencias que llevan el ACL local al de producción, sin tocar al dueño. */
export function aclStatements(
  object: string,
  localAcl: string | null,
  productionAcl: string | null,
  owner: string,
): string[] {
  const local = aclEntries(localAcl)
  const production = aclEntries(productionAcl)
  const out: string[] = []
  for (const role of new Set([...local.keys(), ...production.keys()])) {
    if (role === owner) continue
    const has = local.get(role) ?? ''
    const wants = production.get(role) ?? ''
    const revoke = [...has]
      .filter((l) => !wants.includes(l))
      .map((l) => PRIVILEGE_NAME[l])
      .filter(Boolean)
    const grant = [...wants]
      .filter((l) => !has.includes(l))
      .map((l) => PRIVILEGE_NAME[l])
      .filter(Boolean)
    const who = role === 'public' ? 'public' : `"${role}"`
    if (revoke.length > 0) out.push(`revoke ${revoke.join(', ')} on ${object} from ${who}`)
    if (grant.length > 0) out.push(`grant ${grant.join(', ')} on ${object} to ${who}`)
  }
  return out
}
