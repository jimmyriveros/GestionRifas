/**
 * Lo PURO de las herramientas de puerta (Etapa 4 de D-208, `RUNBOOK` §9.0): cómo se
 * comparan dos fotos —estructura y filas— y cómo se lee un ACL. Sin base, sin red y
 * sin reloj, para poder probarlo aislado (`tests/unit/gate-diff.test.ts`). Lo usan
 * `scripts/gate-compare.ts` y `scripts/gate-mirror-privileges.ts`.
 */
import type { Snapshot } from './gate-db'

type Row = Record<string, unknown>
export type CategoryDelta = {
  agregados: Record<string, string>
  quitados: string[]
  cambiados: Record<string, { antes: string; despues: string }>
}
export type Delta = Record<string, CategoryDelta>
export type Operation = 'none' | 'migrations' | 'awards'

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
