/**
 * COMPROBACIÓN PREVIA DE LA RECUPERACIÓN de la configuración de ganancias — D-239,
 * `RUNBOOK` §10.6.
 *
 *   npx tsx scripts/earning-recovery-check.ts (--local | --production --project-ref <ref>)
 *
 * Responde, en SOLO LECTURA —una transacción `repeatable read read only` de
 * `gate-db.ts`—, las dos preguntas que hay que contestar ANTES de tocar el código
 * servido o el esquema cuando algo falla después de migrar:
 *
 *   1. ¿EN QUÉ ESTADO ESTÁ LA BASE? El historial de migraciones y el esquema tienen
 *      que decir lo mismo: `0077` (ninguna aplicada), `0078` (solo la primera: la
 *      CLI confirma cada archivo por separado, así que puede pasar) o `0079` (las
 *      dos). Si no dicen lo mismo —`incoherente`—, se detiene: no se repara nada ni
 *      se marca ninguna migración a ciegas.
 *
 *   2. ¿SE PUEDE VOLVER A 0077 CONSERVANDO LOS DATOS? Lo decide el GUARDIA de
 *      `supabase/recovery/0079_a_0077.sql`, que este script lee del propio archivo
 *      —entre `-- guardia:inicio` y `-- guardia:fin`— y ejecuta tal cual: no hay
 *      una segunda copia de las reglas. Dice TODAS las condiciones que lo impiden.
 *
 * La recuperación se deshace además entera si su recuento moviera un peso; eso solo
 * se sabe ejecutándola, y con el guardia en verde no puede pasar: con todos los
 * acuerdos en la mitad o en la versión 1, las fórmulas de 0077 y de 0079 coinciden
 * (D-239). Si pasara, no cambia nada y se vuelve aquí.
 *
 * Imprime el camino que corresponde a cada estado, con sus órdenes exactas. Guarda
 * el informe en `build/gate/`. Termina en 0 si se puede volver o no hay nada que
 * revertir, en 2 si no se puede volver o el estado es incoherente, y en 1 sin
 * veredicto (una orden mal formada, una conexión que no se pudo comprobar).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  fileStamp,
  gateTarget,
  gateTargetLabel,
  parseArgs,
  readOnly,
  runGateTool,
  writeGateFile,
  type Query,
} from './gate-db'

const USAGE =
  'Uso: npx tsx scripts/earning-recovery-check.ts (--local | --production --project-ref <ref>)'

export const RECOVERY_SQL = path.join('supabase', 'recovery', '0079_a_0077.sql')

/** El guardia del script de recuperación, leído del propio archivo. */
export function recoveryGuard(script: string): string {
  const start = script.indexOf('-- guardia:inicio')
  const end = script.indexOf('-- guardia:fin')
  if (start < 0 || end < 0 || end < start || script.indexOf('-- guardia:inicio', start + 1) >= 0) {
    throw new Error(`${RECOVERY_SQL} no tiene exactamente un guardia entre sus dos marcas.`)
  }
  return script.slice(start + '-- guardia:inicio'.length, end).trim()
}

/** Lo que el historial y el esquema dicen de la publicación. Solo `select`. */
export const RELEASE_STATE_SQL = `
  select
    (select max(version) from supabase_migrations.schema_migrations) as ultima,
    (select coalesce(array_agg(version order by version), '{}')
       from supabase_migrations.schema_migrations where version >= '0077') as desde_0077,
    to_regclass('public.commission_tiers') is not null as tabla_0077,
    to_regclass('public.commission_tier_lists') is not null as tabla_0078,
    (select count(*)::int from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('memberships_validate_seller_agreements', 'memberships_sync_commission')
        and position('D-238' in p.prosrc) > 0) as funciones_0079`

export type ReleaseFacts = {
  ultima: string | null
  desde_0077: string[]
  tabla_0077: boolean
  tabla_0078: boolean
  funciones_0079: number
}

export type ReleaseState = '0077' | '0078' | '0079' | 'incoherente'

/** El estado, solo si el historial y el esquema dicen lo mismo; si no, por qué no. */
export function classifyRelease(f: ReleaseFacts): { estado: ReleaseState; motivos: string[] } {
  const history = f.desde_0077.join(',')
  const motivos: string[] = []
  const expect = (ok: boolean, motivo: string) => {
    if (!ok) motivos.push(motivo)
  }

  if (history === '0077') {
    expect(f.tabla_0077, 'el historial dice 0077 y falta commission_tiers')
    expect(!f.tabla_0078, 'el historial dice 0077 y ya existe commission_tier_lists')
    expect(f.funciones_0079 === 0, 'el historial dice 0077 y hay funciones de la 0079')
    return { estado: motivos.length ? 'incoherente' : '0077', motivos }
  }
  if (history === '0077,0078') {
    expect(!f.tabla_0077, 'el historial dice 0078 y sigue commission_tiers')
    expect(f.tabla_0078, 'el historial dice 0078 y falta commission_tier_lists')
    expect(f.funciones_0079 === 0, 'el historial dice 0078 y hay funciones de la 0079')
    return { estado: motivos.length ? 'incoherente' : '0078', motivos }
  }
  if (history === '0077,0078,0079') {
    expect(!f.tabla_0077, 'el historial dice 0079 y sigue commission_tiers')
    expect(f.tabla_0078, 'el historial dice 0079 y falta commission_tier_lists')
    expect(
      f.funciones_0079 === 2,
      `el historial dice 0079 y ${f.funciones_0079} de las 2 funciones son de la 0079`,
    )
    return { estado: motivos.length ? 'incoherente' : '0079', motivos }
  }
  return {
    estado: 'incoherente',
    motivos: [
      `el historial desde 0077 es «${history || 'vacío'}»: esta herramienta solo conoce 0077, 0078 y 0079`,
    ],
  }
}

export type Verdict = 'nada_que_revertir' | 'se_puede_volver' | 'no_se_puede_volver' | 'incoherente'

/** Lo que corresponde hacer en cada caso, con las órdenes exactas. */
export function pathFor(estado: ReleaseState, verdict: Verdict): string[] {
  const recover = [
    'psql "<SUPABASE_DB_URL>" -v ON_ERROR_STOP=1 -c "set lock_timeout = \'5s\'" -f supabase/recovery/0079_a_0077.sql',
    `npx supabase migration repair --status reverted ${estado === '0079' ? '0079 0078' : '0078'} --db-url "<SUPABASE_DB_URL>"`,
    'Otra vez esta comprobación: tiene que decir 0077. Después el código anterior (RUNBOOK §10.6).',
  ]
  switch (verdict) {
    case 'incoherente':
      return [
        'DETENER. El historial y el esquema no dicen lo mismo: no se repara, no se marca ninguna migración y no se cambia el código servido.',
        'La pausa sigue cerrada. Se investiga con `gate-compare --structure-only` contra la foto de antes de migrar.',
      ]
    case 'nada_que_revertir':
      return [
        'La base sigue en 0077: ninguna de las dos migraciones quedó aplicada.',
        'Si la migración falló por cerrojo o por tráfico: resolver la causa, `db push --dry-run` tiene que listar 0078 y 0079, y repetir P6. Si falló una comprobación propia: volver a P1.',
      ]
    case 'no_se_puede_volver':
      return [
        'NO se vuelve al código anterior: con esta base rompe, y el script de recuperación se negaría igual.',
        'Se conserva un estado controlado: la pausa CERRADA y el código nuevo, que es el que entiende esta base. Se prepara una corrección hacia delante, o una restauración del respaldo con las escrituras posteriores enumeradas y conciliadas (RUNBOOK §10.6), y lo decide el dueño.',
        'Nunca se fuerza la recuperación ni se transforman acuerdos para que pase.',
      ]
    case 'se_puede_volver':
      return estado === '0078'
        ? [
            'Solo está la 0078. Dos caminos, los dos con la pausa cerrada:',
            '  CONTINUAR (si la 0079 falló por cerrojo, conexión o tráfico): `db push --dry-run` tiene que listar SOLO 0079; después `db push` con el mismo `lock_timeout`. La 0079 es atómica: si vuelve a fallar, la base sigue en 0078.',
            '  VOLVER a 0077 (si la 0079 se detuvo por su comprobación de dinero, o el dueño lo decide):',
            ...recover.map((line) => `    ${line}`),
          ]
        : [
            'Se puede volver a 0077 conservando los datos. En este orden, con la pausa cerrada:',
            ...recover.map((line, index) => `  ${index + 1}. ${line}`),
          ]
  }
}

async function check(query: Query) {
  const [facts] = await query<ReleaseFacts>(RELEASE_STATE_SQL)
  const { estado, motivos } = classifyRelease(facts!)
  if (estado === 'incoherente') {
    return { facts: facts!, estado, veredicto: 'incoherente' as Verdict, motivos, condiciones: [] }
  }
  if (estado === '0077') {
    return {
      facts: facts!,
      estado,
      veredicto: 'nada_que_revertir' as Verdict,
      motivos,
      condiciones: [],
    }
  }
  // El guardia, tal cual, dentro de un punto de guardado: si lanza, la transacción sigue viva.
  const guard = recoveryGuard(readFileSync(RECOVERY_SQL, 'utf8'))
  await query('savepoint guardia')
  try {
    await query(guard)
    await query('release savepoint guardia')
    return {
      facts: facts!,
      estado,
      veredicto: 'se_puede_volver' as Verdict,
      motivos,
      condiciones: [],
    }
  } catch (error) {
    await query('rollback to savepoint guardia')
    const message = error instanceof Error ? error.message : String(error)
    const condiciones = message.split('\n').slice(message.startsWith('No se revierte:') ? 1 : 0)
    return {
      facts: facts!,
      estado,
      veredicto: 'no_se_puede_volver' as Verdict,
      motivos,
      condiciones,
    }
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2), { switches: [], valued: [] })
  const target = gateTarget(parsed)
  const { ahora, resultado } = await readOnly(target, async (query) => {
    const [meta] = await query(`select now() as ahora`)
    return { ahora: new Date(meta!.ahora as string).toISOString(), resultado: await check(query) }
  })

  const camino = pathFor(resultado.estado, resultado.veredicto)
  const file = writeGateFile(
    `recuperacion-0079-${target.kind === 'local' ? 'local' : 'produccion'}-${fileStamp(ahora)}.json`,
    { destino: gateTargetLabel(target), ahora, ...resultado, camino },
  )

  console.log(
    `Comprobación previa de la recuperación · ${gateTargetLabel(target)} · ${ahora} · solo lectura`,
  )
  console.log(
    `Estado: ${resultado.estado} (historial desde 0077: ${resultado.facts.desde_0077.join(', ') || '—'})`,
  )
  for (const motivo of resultado.motivos) console.log(`  · ${motivo}`)
  console.log(`Veredicto: ${resultado.veredicto.toUpperCase().replace(/_/g, ' ')}`)
  for (const condicion of resultado.condiciones) console.log(`  · ${condicion}`)
  console.log('Camino:')
  for (const line of camino) console.log(`  ${line}`)
  console.log(`Informe: ${file}`)
  process.exit(
    resultado.veredicto === 'se_puede_volver' || resultado.veredicto === 'nada_que_revertir'
      ? 0
      : 2,
  )
}

// Solo al ejecutarlo, no al importarlo (las pruebas unitarias importan las funciones).
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/earning-recovery-check.ts')) {
  runGateTool(main, USAGE)
}
