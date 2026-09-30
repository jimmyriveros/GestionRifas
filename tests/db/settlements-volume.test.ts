/**
 * El cierre de cuentas CON VOLUMEN (D-241): cien vendedores, cinco mil boletas,
 * doscientos premios ganados y doscientas entregas.
 *
 * DOS COSAS, y ninguna usa la definicion que prueba para calcular lo esperado:
 *
 *   1. CUADRE. Cada cuenta —las veinte de vendedores a cargo con su equipo, las
 *      veinte de vendedores directos y las sesenta de integrantes— se recalcula
 *      AQUI, en TypeScript, con las filas crudas: boletas pagadas, la comision
 *      que dejo el motor, los pagos de premios y las entregas. Si la base sumara
 *      una sola cifra distinta en cualquier cuenta, esta suite lo dice.
 *   2. TIEMPOS. Las lecturas del personal y del vendedor por PostgREST, con la
 *      sesion real, frente a dos lecturas que ya existen sobre los mismos datos
 *      (`admin_list_sellers` y `commission_summary`). El informe va a
 *      `build/cierre-volumen/`, fuera de Git; la prueba solo pone un techo que
 *      delataria un recorrido cuadratico.
 *
 * LOS DATOS DE PARTIDA SE ESCRIBEN CON SQL: esto mide la lectura, no la venta.
 * Las boletas nacen vendidas y pagadas, la comision la calcula el motor de
 * verdad (`recalc_seller_commission`) y los premios, pagos y entregas se
 * insertan con sus restricciones intactas. Las reglas de quien confirma las
 * prueba `settlements.test.ts`.
 *
 * TODO EN UNA ORGANIZACION PROPIA, que se borra al terminar.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, SEED_PASSWORD, signInAs, type Client } from './helpers'

const STAMP = Date.now().toString(36)
const PRECIO = 120_000
const SORTEO = `CIV-${STAMP}`
const JEFES = 20
const INTEGRANTES_POR_JEFE = 3
const DIRECTOS = 20
const BOLETAS = 50
const PAGADAS = 40
const ABONADAS = 5

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let org: string
let raffle: string
let duenoId: string
let dueno: Client
let jefe0: Client
const jefes: string[] = []
const integrantes = new Map<string, string>() // integrante → jefe
const directos: string[] = []
const informe: string[] = []

async function persona(clave: string, nombre: string): Promise<string> {
  const email = `cierre-vol-${clave}@pruebas.test`
  const { data: existente } = await ctx.svc
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  let id = existente?.id ?? null
  if (id === null) {
    const { data, error } = await ctx.svc.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: nombre, phone: '3001234567' },
    })
    if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
    id = data.user.id
    await ctx.svc.auth.admin.updateUserById(id, { password: SEED_PASSWORD })
  }
  await db.query(
    `update profiles set full_name = $2, activated_at = coalesce(activated_at, now()) where id = $1`,
    [id, nombre],
  )
  return id
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  const { rows: restos } = await db.query(
    `select id from organizations where name like 'Cierre volumen %'`,
  )
  for (const resto of restos) await limpiar(resto.id)

  const { rows } = await db.query(`insert into organizations (name) values ($1) returning id`, [
    `Cierre volumen ${STAMP}`,
  ])
  org = rows[0].id
  duenoId = await persona('dueno', 'Dueña Volumen')
  await db.query(
    `insert into memberships (organization_id, profile_id, role) values ($1, $2, 'owner')`,
    [org, duenoId],
  )

  // --- Vendedores: 20 a cargo con 3 integrantes y 20 directos -----------------
  for (let j = 0; j < JEFES; j += 1) {
    const id = await persona(`jefe-${j}`, `Jefe ${String(j).padStart(2, '0')}`)
    await db.query(
      `insert into memberships (organization_id, profile_id, role, direct_commission_mode, direct_fixed_amount)
       values ($1, $2, 'seller', 'fixed_per_ticket', 30000)`,
      [org, id],
    )
    jefes.push(id)
    for (let i = 0; i < INTEGRANTES_POR_JEFE; i += 1) {
      const miembro = await persona(`int-${j}-${i}`, `Integrante ${j}-${i}`)
      await db.query(
        `insert into memberships (organization_id, profile_id, role, parent_seller_id,
                                  commission_model, fixed_commission_amount)
         values ($1, $2, 'seller', $3, 'fixed_per_ticket', 20000)`,
        [org, miembro, id],
      )
      integrantes.set(miembro, id)
    }
  }
  for (let d = 0; d < DIRECTOS; d += 1) {
    const id = await persona(`dir-${d}`, `Directo ${String(d).padStart(2, '0')}`)
    await db.query(
      `insert into memberships (organization_id, profile_id, role, direct_commission_mode, direct_fixed_amount)
       values ($1, $2, 'seller', 'fixed_per_ticket', 25000)`,
      [org, id],
    )
    directos.push(id)
  }
  const todos = [...jefes, ...integrantes.keys(), ...directos]

  // --- La rifa, con un premio de $100.000 ----------------------------------------
  const { rows: rifa } = await db.query(
    `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date, created_by, prize_mode)
     values ($1, $2, $3, 'draft', '2026-01-01', '2089-12-31', $4, 'configurable') returning id`,
    [org, `Rifa volumen ${STAMP}`, PRECIO, duenoId],
  )
  raffle = rifa[0].id
  dueno = await signInAs(`cierre-vol-dueno@pruebas.test`)
  const { data: premio, error: errorPremio } = await dueno.rpc('create_raffle_prize', {
    p_raffle_id: raffle,
    p_title: 'Premio volumen',
    p_category: 'daily',
    p_reward_mode: 'fixed',
    p_reward_options: [{ description: null, amount: 100_000 }],
    p_number_field: 'daily_number',
    p_digits: 'four',
    p_rules: [
      {
        start_date: '2089-03-05',
        end_date: '2089-03-28',
        weekdays: [1, 2, 3, 4, 5],
        lottery_mode: 'corresponding',
        lottery_code: null,
      },
    ],
  })
  if (errorPremio) throw new Error(errorPremio.message)
  const { prize_id: prizeId, version_id: versionId } = (
    premio as unknown as Array<{ prize_id: string; version_id: string }>
  )[0]!
  await db.query(`update raffles set status = 'active' where id = $1`, [raffle])

  // --- Clientes y boletas: 40 pagadas, 5 abonadas y 5 libres por vendedor ------
  // Nacen LIBRES y con sus disparadores —el codigo interno lo pone uno de ellos—,
  // se venden con el mismo UPDATE que usa la suite del historial y lo pagado se
  // escribe aparte, con los disparadores apartados: aqui se mide la lectura.
  await db.query(
    `insert into clients (organization_id, seller_id, name, phone)
     select $1, s, 'Cliente volumen', '3009990000' from unnest($2::uuid[]) as s`,
    [org, todos],
  )
  await db.query(
    `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, weekly_number,
                          inventory_status)
     select $1, $2, v.seller_id, $3,
            lpad(((v.ord * ${BOLETAS} + g) % 10000)::text, 4, '0'),
            lpad(((v.ord * ${BOLETAS} + g) / 10000 + 1)::text, 4, '0'),
            'available'
       from unnest($4::uuid[]) with ordinality as v(seller_id, ord)
      cross join generate_series(1, ${BOLETAS}) g`,
    [org, raffle, duenoId, todos],
  )
  await db.query(
    `update tickets t
        set client_id = c.id, inventory_status = 'assigned', sale_price = ${PRECIO},
            sale_date = date '2026-09-01', assigned_at = timestamptz '2026-09-01 10:00-05'
       from clients c
      where t.raffle_id = $1 and c.seller_id = t.seller_id and c.organization_id = t.organization_id
        and (t.daily_number::int % ${BOLETAS}) between 1 and ${PAGADAS + ABONADAS}`,
    [raffle],
  )
  await db.query('begin')
  try {
    await db.query('set local session_replication_role = replica')
    await db.query(
      `update tickets set paid_amount = case when (daily_number::int % ${BOLETAS}) between 1 and ${PAGADAS}
                                            then sale_price else 40000 end
        where raffle_id = $1 and inventory_status = 'assigned'`,
      [raffle],
    )
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }

  // --- La comision, del motor de verdad: integrantes antes que su jefe ---------
  for (const seller of [...integrantes.keys(), ...jefes, ...directos]) {
    await db.query(`select recalc_seller_commission($1, $2, $3)`, [org, raffle, seller])
  }

  // --- 40 sorteos ya jugados, cada uno con 5 boletas premiadas ----------------
  const { rows: libres } = await db.query<{ code: string; fecha: string }>(
    `with c as (
       select l.code as code, d::date as fecha
         from unnest(enum_range(null::lottery_code)) as l(code)
        cross join generate_series(date '2026-08-10', today_bogota() - 1, interval '1 day') as d
     )
     select c.code::text as code, c.fecha::text as fecha from c
      where not exists (select 1 from lottery_draw_schedules s where s.lottery_code = c.code and s.reference_date = c.fecha)
      order by c.fecha, c.code limit 40`,
  )
  expect(libres).toHaveLength(40)
  const { rows: pagadas } = await db.query<{ id: string; seller_id: string }>(
    `select id, seller_id from tickets where raffle_id = $1 and payment_status = 'paid' order by id`,
    [raffle],
  )
  await db.query('begin')
  try {
    await db.query('set local session_replication_role = replica')
    for (let k = 0; k < libres.length; k += 1) {
      const { rows: prog } = await db.query(
        `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date, original_scheduled_at,
                                           official_scheduled_at, schedule_status)
       values ($1, $2, $3, now(), now(), 'scheduled') returning id`,
        [libres[k]!.code, `${SORTEO}-${k}`, libres[k]!.fecha],
      )
      const { rows: res } = await db.query(
        `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, '0001', 'confirmed', 'official_page', now()) returning id`,
        [prog[0].id],
      )
      for (let t = 0; t < 5; t += 1) {
        const boleta = pagadas[(k * 97 + t * 13) % pagadas.length]!
        const { rows: foto } = await db.query(
          `insert into lottery_ticket_matches (result_id, ticket_id, organization_id, raffle_id, seller_id, client_id,
                                             match_field, matched_number, assignment_status, inventory_status_at_draw,
                                             assigned_at, ticket_created_at)
         select $1, t.id, t.organization_id, t.raffle_id, t.seller_id, t.client_id, 'daily_number', t.daily_number,
                'sold', 'assigned', t.assigned_at, t.created_at
           from tickets t where t.id = $2
         on conflict do nothing
         returning id`,
          [res[0].id, boleta.id],
        )
        if (!foto[0]) continue
        await db.query(
          `insert into lottery_ticket_match_prizes (organization_id, raffle_id, result_id, match_id, match_field,
                                                  prize_id, prize_version_id)
         values ($1, $2, $3, $4, 'daily_number', $5, $6)`,
          [org, raffle, res[0].id, foto[0].id, prizeId, versionId],
        )
        // Tres de cada cuatro ya tienen pago: del vendedor, de su jefe o del dueño.
        if ((k + t) % 4 === 3) continue
        const jefe = integrantes.get(boleta.seller_id)
        const turno = (k + t) % 3
        const pagador =
          turno === 0 ? null : turno === 1 ? boleta.seller_id : (jefe ?? boleta.seller_id)
        await db.query(
          `insert into settlement_prize_payments (organization_id, raffle_id, result_id, match_id, match_field,
                                                prize_id, ticket_id, ticket_seller_id, payer, payer_id, amount,
                                                value_was_pending, paid_on, confirmed_by, request_id)
         values ($1, $2, $3, $4, 'daily_number', $5, $6, $7, $8, $9, 100000, false, $10, $11, $12)`,
          [
            org,
            raffle,
            res[0].id,
            foto[0].id,
            prizeId,
            boleta.id,
            boleta.seller_id,
            pagador === null ? 'organization' : 'seller',
            pagador,
            libres[k]!.fecha,
            duenoId,
            randomUUID(),
          ],
        )
      }
    }
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }

  // --- Entregas: cada titular al dueño, cada integrante a su jefe --------------
  const entrega = async (seller: string, contraparte: string | null, monto: number) => {
    await db.query(
      `insert into settlement_transfers (organization_id, raffle_id, kind, seller_id, counterpart_id, amount,
                                         received_on, confirmed_by, request_id, balance_before, balance_after)
       values ($1, $2, 'delivery', $3, $4, $5, '2026-09-20', $6, $7, $5, 0)`,
      [org, raffle, seller, contraparte, monto, contraparte ?? duenoId, randomUUID()],
    )
  }
  for (const [j, jefe] of jefes.entries()) {
    await entrega(jefe, null, 1_000_000 + j * 10_000)
    await entrega(jefe, null, 500_000)
  }
  for (const [d, directo] of directos.entries()) await entrega(directo, null, 800_000 + d * 5_000)
  for (const [miembro, jefe] of integrantes) {
    await entrega(miembro, jefe, 2_000_000)
    await entrega(miembro, jefe, 300_000)
  }
  jefe0 = await signInAs(`cierre-vol-jefe-0@pruebas.test`)
}, 600_000)

/** Borra una organizacion de esta suite, con los disparadores apartados (todo es inmutable). */
async function limpiar(orgId: string) {
  await db.query('begin')
  try {
    await db.query('set local session_replication_role = replica')
    for (const tabla of [
      'settlement_closings',
      'settlement_prize_payments',
      'settlement_transfers',
      'lottery_ticket_match_prizes',
      'lottery_ticket_matches',
      'commission_ledger',
      'seller_commissions',
      'notifications',
      'payment_allocations',
      'payments',
      'tickets',
      'clients',
      'audit_logs',
      'raffle_prize_schedule_rules',
      'raffle_prize_reward_options',
      'raffle_prizes',
      'raffle_prize_versions',
      'memberships',
    ]) {
      await db.query(`delete from ${tabla} where organization_id = $1`, [orgId])
    }
    await db.query(
      `delete from commission_tier_list_items where list_id in (select id from commission_tier_lists where organization_id = $1)`,
      [orgId],
    )
    await db.query(`delete from commission_tier_lists where organization_id = $1`, [orgId])
    await db.query(`delete from raffles where organization_id = $1`, [orgId])
    await db.query(`delete from organizations where id = $1`, [orgId])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

afterAll(async () => {
  if (org) await limpiar(org)
  await db.query(
    `delete from lottery_results where schedule_id in (select id from lottery_draw_schedules where draw_number like $1)`,
    ['CIV-%'],
  )
  await db.query(`delete from lottery_draw_schedules where draw_number like $1`, ['CIV-%'])
  await db.end()
  if (informe.length > 0) {
    mkdirSync('build/cierre-volumen', { recursive: true })
    writeFileSync('build/cierre-volumen/informe.md', informe.join('\n'), 'utf8')
  }
}, 120_000)

// =============================================================================
describe('V1 — cada cuenta cuadra con un calculo hecho aparte', () => {
  it('V1-01: las 100 cuentas, cifra por cifra', async () => {
    const n = (v: unknown) => Number(v ?? 0)
    const { rows: boletas } = await db.query(
      `select seller_id, count(*) filter (where payment_status = 'paid')::int as pagadas,
              coalesce(sum(sale_price) filter (where payment_status = 'paid'), 0)::bigint as cobrado
         from tickets where raffle_id = $1 group by seller_id`,
      [raffle],
    )
    const { rows: comisiones } = await db.query(
      `select seller_id, earned, team_earned from seller_commissions where raffle_id = $1`,
      [raffle],
    )
    const { rows: pagos } = await db.query(
      `select payer_id, sum(amount)::bigint as total from settlement_prize_payments
        where raffle_id = $1 and payer = 'seller' and voided_at is null group by payer_id`,
      [raffle],
    )
    const { rows: entregas } = await db.query(
      `select seller_id, counterpart_id, sum(amount)::bigint as total from settlement_transfers
        where raffle_id = $1 and voided_at is null and kind = 'delivery' group by seller_id, counterpart_id`,
      [raffle],
    )
    const cobrado = new Map(boletas.map((b) => [b.seller_id as string, n(b.cobrado)]))
    const ganado = new Map(
      comisiones.map((c) => [c.seller_id as string, n(c.earned) + n(c.team_earned)]),
    )
    const premios = new Map(pagos.map((p) => [p.payer_id as string, n(p.total)]))
    const alDueno = new Map<string, number>()
    const alJefe = new Map<string, number>()
    for (const e of entregas) {
      const mapa = e.counterpart_id === null ? alDueno : alJefe
      mapa.set(e.seller_id, (mapa.get(e.seller_id) ?? 0) + n(e.total))
    }
    const parte = (s: string) =>
      (cobrado.get(s) ?? 0) - (ganado.get(s) ?? 0) - (premios.get(s) ?? 0)

    const { rows: cuentas } = await db.query(`select * from settlement_account_rows($1, $2)`, [
      org,
      raffle,
    ])
    expect(cuentas).toHaveLength(JEFES + DIRECTOS + JEFES * INTEGRANTES_POR_JEFE)
    let comprobadas = 0
    for (const cuenta of cuentas) {
      const titular = cuenta.holder_id as string
      if (cuenta.counterpart_id === null) {
        const equipo = [
          titular,
          ...[...integrantes].filter(([, j]) => j === titular).map(([m]) => m),
        ]
        const debe = equipo.reduce((s, x) => s + parte(x), 0)
        const recibido = equipo.reduce((s, x) => s + (alDueno.get(x) ?? 0), 0)
        expect(n(cuenta.total_due), `total de ${titular}`).toBe(debe)
        expect(n(cuenta.delivered)).toBe(recibido)
        expect(n(cuenta.balance), `saldo de ${titular}`).toBe(debe - recibido)
      } else {
        expect(cuenta.counterpart_id).toBe(integrantes.get(titular))
        expect(n(cuenta.total_due)).toBe(parte(titular))
        expect(n(cuenta.balance), `saldo de ${titular}`).toBe(
          parte(titular) - (alJefe.get(titular) ?? 0),
        )
      }
      comprobadas += 1
    }
    expect(comprobadas).toBe(100)
    informe.push(
      `# Cierre de cuentas con volumen (${new Date().toISOString()})`,
      '',
      `- Cuentas comprobadas: ${comprobadas}`,
    )
  }, 120_000)

  it('V1-02: el listado del personal suma lo mismo que las cuentas', async () => {
    const { rows } = await db.query(
      `select coalesce(sum(balance) filter (where balance > 0), 0)::bigint as falta,
              coalesce(sum(delivered), 0)::bigint as recibido,
              count(*) filter (where status <> 'no_activity')::int as cuentas
         from settlement_account_rows($1, $2) where counterpart_id is null`,
      [org, raffle],
    )
    const { data, error } = await dueno.rpc('staff_settlement_overview', { p_raffle_id: raffle })
    expect(error).toBeNull()
    expect(Number(data![0]!.pending_total)).toBe(Number(rows[0].falta))
    expect(Number(data![0]!.received_total)).toBe(Number(rows[0].recibido))
    expect(data![0]!.accounts).toBe(rows[0].cuentas)
  })
})

describe('V2 — tiempos frente a lecturas que ya existen', () => {
  it('V2-01: las lecturas del cierre, por PostgREST y con la sesion real', async () => {
    const medir = async (nombre: string, llamada: () => PromiseLike<{ error: unknown }>) => {
      const tiempos: number[] = []
      for (let i = 0; i < 20; i += 1) {
        const t0 = performance.now()
        const { error } = await llamada()
        tiempos.push(performance.now() - t0)
        if (error) throw new Error(`${nombre}: ${JSON.stringify(error)}`)
      }
      tiempos.sort((a, b) => a - b)
      informe.push(
        `- ${nombre}: mediana ${tiempos[10]!.toFixed(1)} ms · p95 ${tiempos[18]!.toFixed(1)} ms · máx ${tiempos[19]!.toFixed(1)} ms`,
      )
      return tiempos[10]!
    }
    informe.push('', '## PostgREST, 20 llamadas cada una', '')
    const base = await medir('BASE admin_list_sellers (página 1)', () =>
      dueno.rpc('admin_list_sellers', { p_raffle_id: raffle }),
    )
    await medir('BASE commission_summary (jefe)', () =>
      jefe0.rpc('commission_summary', { p_raffle_id: raffle }),
    )
    const cierre = [
      await medir('staff_settlement_overview', () =>
        dueno.rpc('staff_settlement_overview', { p_raffle_id: raffle }),
      ),
      await medir('staff_settlement_accounts (página 1)', () =>
        dueno.rpc('staff_settlement_accounts', { p_raffle_id: raffle }),
      ),
      await medir('staff_settlement_account (un jefe)', () =>
        dueno.rpc('staff_settlement_account', { p_raffle_id: raffle, p_seller_id: jefes[0]! }),
      ),
      await medir('staff_settlement_prizes (un jefe)', () =>
        dueno.rpc('staff_settlement_prizes', { p_raffle_id: raffle, p_seller_id: jefes[0]! }),
      ),
      await medir('staff_settlement_transfers (un jefe)', () =>
        dueno.rpc('staff_settlement_transfers', { p_raffle_id: raffle, p_seller_id: jefes[0]! }),
      ),
      await medir('seller_settlement_account (jefe)', () =>
        jefe0.rpc('seller_settlement_account', { p_raffle_id: raffle }),
      ),
      await medir('seller_settlement_team (jefe)', () =>
        jefe0.rpc('seller_settlement_team', { p_raffle_id: raffle }),
      ),
      await medir('seller_settlement_prizes (jefe)', () =>
        jefe0.rpc('seller_settlement_prizes', { p_raffle_id: raffle }),
      ),
    ]
    informe.push('', `Base admin_list_sellers: ${base.toFixed(1)} ms.`)
    // Un techo generoso: lo que delata es un recorrido que crece con el cuadrado.
    for (const mediana of cierre) expect(mediana).toBeLessThan(1500)
  }, 180_000)

  it('V2-02: el plan de la cuenta completa, en la base', async () => {
    const { rows } = await db.query(
      `explain (analyze, buffers, format text) select * from settlement_account_rows($1, $2)`,
      [org, raffle],
    )
    const plan = rows.map((r) => r['QUERY PLAN'] as string)
    const total = plan.find((l) => l.startsWith('Execution Time'))
    informe.push('', '## settlement_account_rows (100 cuentas)', '', '```', ...plan, '```')
    expect(total).toBeDefined()
  })
})
