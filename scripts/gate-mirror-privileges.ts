/**
 * ENSAYO LOCAL con los privilegios del proyecto alojado (Etapa 4 de D-208, I-132, I-143).
 *
 *   npx tsx scripts/gate-mirror-privileges.ts <foto-de-producción.json>
 *
 * SOLO LA BASE LOCAL: la dirección está escrita aquí y no hay forma de apuntarla a
 * otra. Lee una foto de producción (`scripts/gate-snapshot.ts`) y deja en la base
 * local los MISMOS privilegios que tenía el proyecto real en ese momento:
 *
 *   * el ACL de cada función de `public` que existe en los dos lados;
 *   * el de cada tabla, vista y secuencia de `public` que existe en los dos lados;
 *   * los privilegios por defecto de `postgres` en `public` —funciones, tablas,
 *     secuencias y tipos—, que son los que heredará lo que cree una migración.
 *
 * Así el delta de una migración ensayado en local es el que tendrá en producción:
 * una matriz de privilegios comprobada con los privilegios de la pila local no dice
 * nada del proyecto alojado (I-132, I-143). Versiona el método de la Entrega 5
 * (`build/e5/p1/igualar-privilegios.mjs`).
 *
 * Todo en UNA transacción. Imprime cuántas sentencias aplicó, sin datos.
 */
import { readFileSync } from 'node:fs'

import { Client } from 'pg'

import { LOCAL_DB_URL, parseArgs, runGateTool, type Snapshot } from './gate-db'
import { aclEntries, aclStatements, DEFAULT_PRIVILEGE_CLASS, PRIVILEGE_NAME } from './gate-diff'

const USAGE = 'Uso: npx tsx scripts/gate-mirror-privileges.ts <foto-de-producción.json>'

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2), { switches: [], valued: [], positional: 1 })
  if (parsed.switches.size > 0 || parsed.values.size > 0) {
    throw new Error(`Esta herramienta solo trabaja contra la base local.\n\n${USAGE}`)
  }
  const file = parsed.positional[0]
  if (!file) throw new Error(USAGE)
  const production = JSON.parse(readFileSync(file, 'utf8')) as Snapshot
  if (production.entorno !== 'produccion') {
    throw new Error('La foto no es de producción: no hay privilegios que reflejar.')
  }

  const db = new Client({ connectionString: LOCAL_DB_URL })
  await db.connect()
  const statements: string[] = []
  try {
    // Funciones: una sola ACL por firma. Sin ACL, la de `acldefault`: dueño y PUBLIC.
    const { rows: functions } = await db.query<{
      firma: string
      acl: string | null
      dueno: string
    }>(
      `select p.oid::regprocedure::text as firma, p.proacl::text as acl, pg_get_userbyid(p.proowner) as dueno
         from pg_proc p where p.pronamespace = 'public'::regnamespace`,
    )
    const productionFunctions = new Map(
      (production.estructura.funciones as Array<Record<string, string | null>>).map((f) => [
        f.firma!,
        f,
      ]),
    )
    for (const f of functions) {
      const p = productionFunctions.get(f.firma)
      if (!p) continue
      const implicit = `{${f.dueno}=X/${f.dueno},=X/${f.dueno}}`
      statements.push(
        ...aclStatements(
          `function public.${f.firma}`,
          f.acl ?? implicit,
          p.acl ?? implicit,
          f.dueno,
        ),
      )
    }

    const { rows: relations } = await db.query<{
      nombre: string
      tipo: string
      acl: string | null
      dueno: string
    }>(
      `select c.relname as nombre, c.relkind::text as tipo, c.relacl::text as acl, pg_get_userbyid(c.relowner) as dueno
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','S','v')`,
    )
    const productionRelations = new Map(
      (production.estructura.tablas as Array<Record<string, string | null>>).map((t) => [
        t.nombre!,
        t,
      ]),
    )
    for (const r of relations) {
      const p = productionRelations.get(r.nombre)
      if (!p || r.acl === null || p.acl === null) continue
      const kind = r.tipo === 'S' ? 'sequence' : 'table'
      statements.push(
        ...aclStatements(`${kind} public."${r.nombre}"`, r.acl, p.acl ?? null, r.dueno),
      )
    }

    // Lo que HEREDARÁ lo que cree una migración: los privilegios por defecto de postgres en public.
    const { rows: defaults } = await db.query<{ tipo: string; acl: string | null }>(
      `select defaclobjtype::text as tipo, defaclacl::text as acl from pg_default_acl
        where pg_get_userbyid(defaclrole) = 'postgres' and defaclnamespace = 'public'::regnamespace`,
    )
    for (const d of production.estructura.privilegios_por_defecto as Array<
      Record<string, string>
    >) {
      if (d.rol !== 'postgres' || d.esquema !== 'public' || !DEFAULT_PRIVILEGE_CLASS[d.tipo!])
        continue
      const local = aclEntries(defaults.find((x) => x.tipo === d.tipo)?.acl)
      const wanted = aclEntries(d.acl)
      for (const role of new Set([...local.keys(), ...wanted.keys()])) {
        if (role === 'postgres') continue
        const has = local.get(role) ?? ''
        const wants = wanted.get(role) ?? ''
        const revoke = [...has]
          .filter((l) => !wants.includes(l))
          .map((l) => PRIVILEGE_NAME[l])
          .filter(Boolean)
        const grant = [...wants]
          .filter((l) => !has.includes(l))
          .map((l) => PRIVILEGE_NAME[l])
          .filter(Boolean)
        const cls = DEFAULT_PRIVILEGE_CLASS[d.tipo!]
        const base = 'alter default privileges for role postgres in schema public'
        if (revoke.length > 0)
          statements.push(`${base} revoke ${revoke.join(', ')} on ${cls} from "${role}"`)
        if (grant.length > 0)
          statements.push(`${base} grant ${grant.join(', ')} on ${cls} to "${role}"`)
      }
    }

    await db.query('begin')
    for (const s of statements) await db.query(s)
    await db.query('commit')
  } catch (error) {
    await db.query('rollback').catch(() => {})
    throw error
  } finally {
    await db.end()
  }

  const byKind = statements.reduce<Record<string, number>>((acc, s) => {
    const kind = s.startsWith('alter default') ? 'por defecto' : s.split(' on ')[1]!.split(' ')[0]!
    acc[kind] = (acc[kind] ?? 0) + 1
    return acc
  }, {})
  console.log(
    `LOCAL: ${statements.length} sentencias de privilegios aplicadas ${JSON.stringify(byKind)}`,
  )
  for (const s of statements.filter((x) => x.startsWith('alter default'))) console.log(`  ${s}`)
}

runGateTool(main, USAGE)
