/**
 * Prueba de VOLUMEN de la Fase 6 (docs/IMPLEMENTATION_PLAN.md, prueba 5):
 * «Rendimiento con volumen de prueba (≥5.000 boletas)».
 *
 * QUE BUSCA REALMENTE
 *
 * No es un banco de pruebas de rendimiento —una portatil con Docker no da
 * medidas comparables— sino una red de seguridad para dos fallos concretos que
 * SOLO aparecen con volumen y que en desarrollo son invisibles:
 *
 *   1. **Truncamiento silencioso (I-011).** PostgREST corta toda respuesta en
 *      1.000 filas sin devolver error. Un total calculado sobre el resultado
 *      sale mal y nadie se entera. Aqui se demuestra que ocurre y que las dos
 *      defensas —`count: 'exact'` y la paginacion por bloques— lo evitan.
 *   2. **Agregacion en el sitio equivocado.** Mientras las sumas las haga SQL,
 *      pasar de 30 a 5.000 boletas no cambia el numero de filas que viaja al
 *      servidor de aplicaciones. Si alguien moviera un agregado a TypeScript,
 *      estas comprobaciones de tamano de respuesta lo delatarian.
 *
 * IDEMPOTENTE. Crea su propia rifa la primera vez y la reutiliza despues, de
 * modo que repetir `npm run test:db` sin reiniciar la base no acumula decenas
 * de miles de boletas. Usa una rifa aparte para no alterar los conteos que
 * esperan las demas pruebas ni el seed.
 *
 * La rifa se crea en estado BORRADOR, no activa: asi ninguna pantalla ni
 * ninguna prueba end-to-end la confunde con «la rifa activa» de la
 * organizacion. `bulk_create_tickets` admite borradores (BR-R08).
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, signInAs, USERS, type Client } from './helpers'

/** ≥5.000 es lo que pide el plan; 5.000 justos bastan y mantienen la suite rapida. */
const TICKET_COUNT = 5000
const BATCH_SIZE = 1000
const RAFFLE_NAME = 'Rifa Volumen Fase 6'
/** Limite de filas por respuesta de PostgREST. No es configurable desde aqui. */
const POSTGREST_MAX_ROWS = 1000

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client
let seller1: Client
let raffleId: string

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  ctx = await loadSeedContext()
  owner = await signInAs(USERS.owner)
  seller1 = await signInAs(USERS.seller1)

  raffleId = await ensureVolumeRaffle()
}, 300_000)

afterAll(async () => {
  await db.end()
})

/**
 * Devuelve la rifa de volumen, creandola con sus 5.000 boletas si aun no
 * existe. Las combinaciones se generan de forma DETERMINISTA (daily 0000-4999,
 * weekly 0000) para que sean unicas sin depender del azar: con 5.000 filas,
 * numeros aleatorios de 4 digitos colisionarian casi con certeza.
 */
async function ensureVolumeRaffle(): Promise<string> {
  const { rows: existing } = await db.query(
    `select r.id, (select count(*) from tickets t where t.raffle_id = r.id)::int as tickets
     from raffles r where r.name = $1 and r.organization_id = $2`,
    [RAFFLE_NAME, ctx.demoOrg.id],
  )

  if (existing.length > 0 && existing[0].tickets >= TICKET_COUNT) {
    return existing[0].id as string
  }

  const id =
    existing.length > 0
      ? (existing[0].id as string)
      : await (async () => {
          const { data, error } = await owner
            .from('raffles')
            .insert({
              organization_id: ctx.demoOrg.id,
              name: RAFFLE_NAME,
              ticket_price: 100_000,
              start_date: '2026-01-01',
              end_date: '2026-12-31',
              status: 'draft',
              created_by: ctx.ids.owner,
            })
            .select('id')
            .single()
          if (error) throw new Error(`No se pudo crear la rifa de volumen: ${error.message}`)
          return data.id
        })()

  const yaCreadas = existing.length > 0 ? (existing[0].tickets as number) : 0

  for (let start = yaCreadas; start < TICKET_COUNT; start += BATCH_SIZE) {
    const rows = Array.from({ length: Math.min(BATCH_SIZE, TICKET_COUNT - start) }, (_, i) => {
      const n = start + i
      return {
        daily_number: String(n % 10000).padStart(4, '0'),
        weekly_number: String(Math.floor(n / 10000)).padStart(4, '0'),
      }
    })

    // Se reparten entre los dos vendedores para que el reporte por vendedor
    // tenga algo que separar.
    const sellerId = (start / BATCH_SIZE) % 2 === 0 ? ctx.ids.seller1 : ctx.ids.seller2
    const { error } = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: id,
      p_seller_id: sellerId,
      p_rows: rows,
    })
    if (error) throw new Error(`Fallo el lote desde ${start}: ${error.message}`)
  }

  return id
}

/**
 * Mide cuanto tarda una consulta, en milisegundos.
 *
 * Acepta `PromiseLike` y no `Promise`: los constructores de consulta de
 * supabase-js son «thenables», no promesas completas (no tienen `catch` ni
 * `finally`), asi que exigir `Promise<T>` los rechazaria.
 */
async function timed<T>(run: () => PromiseLike<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now()
  const result = await run()
  return { result, ms: performance.now() - start }
}

/**
 * Presupuesto de tiempo deliberadamente HOLGADO.
 *
 * No pretende medir rendimiento absoluto, sino cazar una regresion de orden de
 * magnitud: un agregado movido a la aplicacion, un indice perdido o una
 * consulta N+1. Un margen estrecho solo produciria fallos intermitentes en
 * maquinas cargadas, y una prueba que falla sin motivo se acaba ignorando.
 */
const TIME_BUDGET_MS = 5_000

describe('F6-06 volumen: 5.000 boletas', () => {
  it('la rifa de volumen tiene al menos 5.000 boletas', async () => {
    const { rows } = await db.query(`select count(*)::int as n from tickets where raffle_id = $1`, [
      raffleId,
    ])
    expect(rows[0].n).toBeGreaterThanOrEqual(TICKET_COUNT)
  })

  it('DEMUESTRA el truncamiento silencioso de PostgREST (I-011)', async () => {
    // Sin error y sin aviso: exactamente 1.000 filas de 5.000. Contar
    // `data.length` aqui daria 1.000 y seria un dato falso.
    const { data, error } = await owner.from('tickets').select('id').eq('raffle_id', raffleId)

    expect(error).toBeNull()
    expect(data!.length).toBe(POSTGREST_MAX_ROWS)

    const real = await db.query(`select count(*)::int as n from tickets where raffle_id = $1`, [
      raffleId,
    ])
    expect(real.rows[0].n).toBeGreaterThan(data!.length)
  })

  it('`count: exact, head: true` SI devuelve el numero real', async () => {
    const { count, error } = await owner
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('raffle_id', raffleId)

    expect(error).toBeNull()

    const { rows } = await db.query(`select count(*)::int as n from tickets where raffle_id = $1`, [
      raffleId,
    ])
    expect(count).toBe(rows[0].n)
    expect(count).toBeGreaterThan(POSTGREST_MAX_ROWS)
  })

  it('la paginacion por bloques recupera TODAS las filas', async () => {
    // Es lo que hace `fetchAllRows` en la aplicacion, reproducido aqui contra
    // la base real: bloques de 1.000 hasta que uno venga incompleto.
    const todas: string[] = []
    for (;;) {
      const { data, error } = await owner
        .from('tickets')
        .select('id')
        .eq('raffle_id', raffleId)
        .order('id', { ascending: true })
        .range(todas.length, todas.length + POSTGREST_MAX_ROWS - 1)

      expect(error).toBeNull()
      todas.push(...(data ?? []).map((row) => row.id))
      if ((data ?? []).length < POSTGREST_MAX_ROWS) break
    }

    const { rows } = await db.query(`select count(*)::int as n from tickets where raffle_id = $1`, [
      raffleId,
    ])
    expect(todas.length).toBe(rows[0].n)
    expect(new Set(todas).size).toBe(todas.length) // sin repetidos entre bloques
  })

  it('el resumen por rifa devuelve UNA fila, no 5.000, y es correcto', async () => {
    const { result, ms } = await timed(() =>
      owner.from('v_raffle_summary').select('*').eq('raffle_id', raffleId),
    )

    expect(result.error).toBeNull()
    expect(result.data!.length).toBe(1)
    expect(ms).toBeLessThan(TIME_BUDGET_MS)

    const { rows } = await db.query(
      `select count(*)::int as total,
              count(*) filter (where inventory_status = 'available')::int as disponibles
       from tickets where raffle_id = $1`,
      [raffleId],
    )
    expect(result.data![0]!.tickets_total).toBe(rows[0].total)
    expect(result.data![0]!.tickets_available).toBe(rows[0].disponibles)
  })

  it('el resumen por vendedor agrega en SQL: una fila por vendedor y rifa', async () => {
    const { result, ms } = await timed(() =>
      owner.from('v_seller_summary').select('*').eq('raffle_id', raffleId),
    )

    expect(result.error).toBeNull()
    expect(ms).toBeLessThan(TIME_BUDGET_MS)
    // Dos vendedores: 2 filas para 5.000 boletas. Si esto creciera con el
    // numero de boletas, la agregacion habria dejado de estar en SQL.
    expect(result.data!.length).toBeLessThanOrEqual(2)

    const suma = (result.data ?? []).reduce((acc, row) => acc + (row.tickets_total ?? 0), 0)
    const { rows } = await db.query(`select count(*)::int as n from tickets where raffle_id = $1`, [
      raffleId,
    ])
    expect(suma).toBe(rows[0].n)
  })

  it('los totales de pagos siguen siendo exactos y rapidos con la base cargada', async () => {
    const { result, ms } = await timed(() => owner.rpc('report_payment_totals', {}))

    expect(result.error).toBeNull()
    expect(ms).toBeLessThan(TIME_BUDGET_MS)

    const { rows } = await db.query(
      `select coalesce(sum(total_amount), 0)::bigint as total from payments where organization_id = $1`,
      [ctx.demoOrg.id],
    )
    expect(Number(result.data![0]!.total_amount)).toBe(Number(rows[0].total))
  })

  it('un vendedor sigue viendo solo lo suyo con 5.000 boletas de por medio', async () => {
    const { count, error } = await seller1
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('raffle_id', raffleId)

    expect(error).toBeNull()

    const { rows } = await db.query(
      `select count(*)::int as n from tickets where raffle_id = $1 and seller_id = $2`,
      [raffleId, ctx.ids.seller1],
    )
    const { rows: totales } = await db.query(
      `select count(*)::int as n from tickets where raffle_id = $1`,
      [raffleId],
    )

    expect(count).toBe(rows[0].n)
    expect(count).toBeLessThan(totales[0].n)
  })

  it('el reporte de clientes con saldo cuenta en SQL, no trayendo filas', async () => {
    const { result, ms } = await timed(() =>
      owner
        .from('v_client_balances')
        .select('client_id', { count: 'exact', head: true })
        .gt('pending_amount', 0),
    )

    expect(result.error).toBeNull()
    expect(ms).toBeLessThan(TIME_BUDGET_MS)
    // `head: true` no trae ni una fila: solo la cabecera con el conteo.
    expect(result.data).toBeNull()
    expect(result.count).toBeGreaterThan(0)
  })
})
