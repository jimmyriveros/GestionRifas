/**
 * Pruebas de base de datos de la Fase 7: endurecimiento y rendimiento de la RLS.
 *
 * Dos cosas distintas que conviene no confundir:
 *
 *   1. Que la reescritura de las politicas (migracion 0014) NO cambio quien ve
 *      que. Se comprueba por equivalencia: `current_staff_org_ids()` devuelve
 *      exactamente las organizaciones donde `is_org_staff()` decia que si, para
 *      TODOS los usuarios y TODAS las organizaciones del seed.
 *   2. Que el patron lento no vuelva a colarse. Es una invariante de catalogo,
 *      del mismo tipo que las de `catalog.test.ts`: falla sola si alguien
 *      escribe manana una politica con una funcion por fila, sin que nadie
 *      tenga que acordarse de escribir una prueba nueva.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, signInAs, USERS, type Client } from './helpers'

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client
let seller1: Client

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  ctx = await loadSeedContext()
  owner = await signInAs(USERS.owner)
  seller1 = await signInAs(USERS.seller1)
})

afterAll(async () => {
  await db.end()
})

// ===========================================================================
// F7-01 — La reescritura no cambio ningun permiso
// ===========================================================================

describe('F7-01 `current_staff_org_ids()` equivale exactamente a `is_org_staff()`', () => {
  it('coinciden para toda combinacion de usuario y organizacion del seed', async () => {
    const { rows: usuarios } = await db.query(`select id, email from profiles order by email`)
    const { rows: orgs } = await db.query(`select id, name from organizations order by name`)

    const discrepancias: string[] = []

    for (const usuario of usuarios) {
      // Se ejecuta con el JWT de cada usuario, igual que hace PostgREST.
      await db.query('begin')
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: usuario.id, role: 'authenticated' }),
      ])

      const { rows: conjunto } = await db.query(`select current_staff_org_ids() as org`)
      const delConjunto = new Set(conjunto.map((r) => r.org))

      for (const org of orgs) {
        const { rows } = await db.query(`select is_org_staff($1) as es_staff`, [org.id])
        const porFuncion = rows[0].es_staff as boolean
        const porConjunto = delConjunto.has(org.id)

        if (porFuncion !== porConjunto) {
          discrepancias.push(
            `${usuario.email} / ${org.name}: is_org_staff=${porFuncion} conjunto=${porConjunto}`,
          )
        }
      }

      await db.query('rollback')
    }

    expect(discrepancias).toEqual([])
    // Si no hubiera datos, la prueba pasaria sin comprobar nada.
    expect(usuarios.length).toBeGreaterThanOrEqual(6)
    expect(orgs.length).toBeGreaterThanOrEqual(2)
  })

  it('un vendedor no es personal de ninguna organizacion', async () => {
    await db.query('begin')
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: ctx.ids.seller1, role: 'authenticated' }),
    ])
    const { rows } = await db.query(`select current_staff_org_ids() as org`)
    await db.query('rollback')

    expect(rows).toEqual([])
  })

  it('una membresia desactivada deja de contar como personal', async () => {
    // Es la razon por la que la funcion filtra por `is_active`: si no lo
    // hiciera, desactivar a un admin no le quitaria el acceso.
    await db.query('begin')
    try {
      await db.query(`update memberships set is_active = false where profile_id = $1`, [
        ctx.ids.admin,
      ])
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: ctx.ids.admin, role: 'authenticated' }),
      ])
      const { rows } = await db.query(`select current_staff_org_ids() as org`)
      expect(rows).toEqual([])
    } finally {
      await db.query('rollback')
    }
  })
})

// ===========================================================================
// F7-02 — El aislamiento sigue intacto tras la reescritura
// ===========================================================================

describe('F7-02 el aislamiento sobrevive a la reescritura de politicas', () => {
  it('un vendedor sigue viendo solo sus boletas', async () => {
    const { data } = await seller1.from('tickets').select('seller_id').limit(1000)
    expect(data!.length).toBeGreaterThan(0)
    expect([...new Set(data!.map((t) => t.seller_id))]).toEqual([ctx.ids.seller1])
  })

  it('un vendedor sigue viendo solo sus clientes y sus pagos', async () => {
    const [{ data: clientes }, { data: pagos }] = await Promise.all([
      seller1.from('clients').select('seller_id'),
      seller1.from('payments').select('seller_id'),
    ])

    for (const fila of clientes ?? []) expect(fila.seller_id).toBe(ctx.ids.seller1)
    for (const fila of pagos ?? []) expect(fila.seller_id).toBe(ctx.ids.seller1)
  })

  it('el personal sigue viendo toda su organizacion y solo la suya', async () => {
    const { data } = await owner.from('tickets').select('organization_id').limit(1000)
    expect(data!.length).toBeGreaterThan(0)
    expect([...new Set(data!.map((t) => t.organization_id))]).toEqual([ctx.demoOrg.id])
  })

  it('un vendedor no puede leer la bitacora', async () => {
    const { data } = await seller1.from('audit_logs').select('id')
    expect(data).toEqual([])
  })
})

// ===========================================================================
// F7-03 — El patron lento no puede volver
// ===========================================================================

describe('F7-03 ninguna politica llama a una funcion por fila (I-019)', () => {
  /**
   * `is_org_staff(<columna>)` recibe un valor de la fila, asi que PostgreSQL no
   * puede sacarlo del bucle y lo ejecuta una vez por fila. Medido: 1,46 ms
   * pasan a 1.667 ms sobre 7.278 boletas. La forma correcta es
   * `<columna> in (select current_staff_org_ids())`, que se evalua una vez.
   */
  it('ninguna politica usa `is_org_staff(` en su expresion', async () => {
    const { rows } = await db.query(`
      select tablename, policyname
      from pg_policies
      where schemaname = 'public'
        and (coalesce(qual, '') like '%is_org_staff(%'
             or coalesce(with_check, '') like '%is_org_staff(%')
      order by tablename, policyname
    `)

    expect(rows.map((r) => `${r.tablename}.${r.policyname}`)).toEqual([])
  })

  it('las llamadas a `current_profile_id()` van envueltas en un subselect', async () => {
    // Sin envolver, se evalua tambien por fila.
    const { rows } = await db.query(`
      select tablename, policyname, qual, with_check
      from pg_policies
      where schemaname = 'public'
        and (coalesce(qual, '') like '%current_profile_id()%'
             or coalesce(with_check, '') like '%current_profile_id()%')
    `)

    const malEnvueltas = rows.filter((r) => {
      const expresion = `${r.qual ?? ''} ${r.with_check ?? ''}`
      // PostgreSQL normaliza el subselect a `( SELECT current_profile_id() ...`.
      const sueltas = expresion.split('current_profile_id()').length - 1
      const envueltas = expresion.split('SELECT current_profile_id()').length - 1
      return sueltas > envueltas
    })

    expect(malEnvueltas.map((r) => `${r.tablename}.${r.policyname}`)).toEqual([])
  })

  it('`current_staff_org_ids` existe, es STABLE y no la puede ejecutar anon', async () => {
    const { rows } = await db.query(`
      select p.provolatile, p.prosecdef,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
             (p.proconfig is not null and array_to_string(p.proconfig, ',') like '%search_path%') as fija_path
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'current_staff_org_ids'
    `)

    expect(rows).toHaveLength(1)
    expect(rows[0].provolatile).toBe('s')
    expect(rows[0].prosecdef).toBe(true)
    expect(rows[0].anon).toBe(false)
    expect(rows[0].auth).toBe(true)
    expect(rows[0].fija_path).toBe(true)
  })
})

// ===========================================================================
// F7-04 — Rendimiento con la RLS puesta
// ===========================================================================

describe('F7-04 las consultas principales no degradan con el volumen', () => {
  /**
   * Presupuesto holgado a proposito: no mide rendimiento absoluto, sino que
   * caza el regreso del patron por fila, que multiplica los tiempos por mil.
   * Antes de 0014 esta misma consulta tardaba 1.667 ms con 7.278 boletas.
   */
  const PRESUPUESTO_MS = 400

  async function tiempoDe(sql: string, profileId: string): Promise<number> {
    await db.query('begin')
    await db.query(`set local role authenticated`)
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: profileId, role: 'authenticated' }),
    ])
    const { rows } = await db.query(`explain (analyze, format json) ${sql}`)
    await db.query('rollback')

    const plan = rows[0]['QUERY PLAN'] as [{ 'Execution Time': number }]
    return plan[0]['Execution Time']
  }

  it('contar boletas con la RLS del Owner es rapido', async () => {
    const ms = await tiempoDe('select count(*) from tickets', ctx.ids.owner)
    expect(ms, `tardo ${ms} ms`).toBeLessThan(PRESUPUESTO_MS)
  })

  it('listar boletas paginadas es rapido', async () => {
    const ms = await tiempoDe(
      'select id, internal_code from tickets order by created_at desc limit 25',
      ctx.ids.owner,
    )
    expect(ms, `tardo ${ms} ms`).toBeLessThan(PRESUPUESTO_MS)
  })

  it('el resumen por vendedor es rapido', async () => {
    const ms = await tiempoDe('select * from v_seller_summary', ctx.ids.owner)
    expect(ms, `tardo ${ms} ms`).toBeLessThan(PRESUPUESTO_MS)
  })

  it('tambien para un vendedor, que ve menos filas pero pasa por la misma politica', async () => {
    const ms = await tiempoDe('select count(*) from tickets', ctx.ids.seller1)
    expect(ms, `tardo ${ms} ms`).toBeLessThan(PRESUPUESTO_MS)
  })

  it('los totales de pagos son rapidos', async () => {
    const ms = await tiempoDe(
      'select * from report_payment_totals(null,null,null,null,null)',
      ctx.ids.owner,
    )
    expect(ms, `tardo ${ms} ms`).toBeLessThan(PRESUPUESTO_MS)
  })
})
