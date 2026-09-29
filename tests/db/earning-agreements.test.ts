/**
 * Configuracion de ganancias (migracion 0078, D-237, BR-G27..BR-G35).
 *
 * TODO OCURRE EN UNA ORGANIZACION PROPIA. Esta suite guarda versiones de la
 * lista general, crea rifas baratas, cambia precios y mete acuerdos que la
 * validacion rechaza: hacerlo en «Rifas Demo» le cambiaria a las demas suites la
 * lista con la que nacen sus integrantes y los topes de sus padres segun el
 * orden de ejecucion (la trampa de I-035). La organizacion nace con su lista
 * general v1 por el disparador de la 0078, como una empresa nueva de verdad.
 *
 * Las ESCRITURAS DE NEGOCIO van por las RPC y las sesiones reales —el Dueño de la
 * organizacion para lo administrativo, el vendedor padre para su equipo, cada
 * vendedor para vender y cobrar—; la base se prepara con PostgreSQL directo.
 *
 * Cada escenario comprueba ademas la invariante del ledger POR PARTES (BR-G22):
 * lo propio explica `earned` y lo del equipo explica `team_earned`.
 */
import { readFileSync } from 'node:fs'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { EARNING_0079_CHECKS, EARNING_FUNCTION_CHECKS } from '../../scripts/earning-function-grants'
import { RECOVERY_SQL, recoveryGuard } from '../../scripts/earning-recovery-check'

import {
  DB_URL,
  loadSeedContext,
  SEED_PASSWORD,
  signInAs,
  USERS,
  type Client,
} from './helpers'

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>

const STAMP = Date.now().toString(36)
const PRECIO = 120_000

let org: string
let duenoId: string
let dueno: Client
/** La rifa principal: activa, $120.000. */
let R1: string

type Tramo = { min_tickets: number; rate: number }
const PLANTILLA_V1: Tramo[] = [
  { min_tickets: 1, rate: 20_000 },
  { min_tickets: 21, rate: 25_000 },
  { min_tickets: 31, rate: 30_000 },
  { min_tickets: 51, rate: 40_000 },
]

const personas = new Map<string, { id: string; email: string }>()
const sesiones = new Map<string, Client>()
const clientes = new Map<string, string>()
const contador = new Map<string, number>()

// -----------------------------------------------------------------------------
// Preparacion
// -----------------------------------------------------------------------------

/** Cuenta de Auth idempotente: la bitacora las conserva como actores (BR-D02). */
async function persona(clave: string, nombre: string) {
  // En minusculas: Auth las guarda asi, y la busqueda idempotente de la
  // siguiente pasada no encontraria «hmarA».
  const email = `ganancias-${clave}@pruebas.test`.toLowerCase()
  const { data: existente } = await ctx.svc.from('profiles').select('id').eq('email', email).maybeSingle()
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
  }
  // I-007: la contrasena tiene que quedar utilizable.
  await ctx.svc.auth.admin.updateUserById(id, { password: SEED_PASSWORD })
  await db.query(
    `update profiles set full_name = $2, activated_at = coalesce(activated_at, now()) where id = $1`,
    [id, nombre],
  )
  personas.set(clave, { id, email })
  return id
}

async function sesion(clave: string): Promise<Client> {
  const ya = sesiones.get(clave)
  if (ya) return ya
  const nueva = await signInAs(personas.get(clave)!.email)
  sesiones.set(clave, nueva)
  return nueva
}

async function cliente(sellerId: string) {
  const { rows } = await db.query(
    `insert into clients (organization_id, seller_id, name, phone)
     values ($1, $2, 'Cliente de pruebas', '3009990000') returning id`,
    [org, sellerId],
  )
  clientes.set(sellerId, rows[0].id)
}

/** Alta del personal, por la RPC de la aplicacion (BR-G30). */
async function altaDirecta(
  clave: string,
  nombre: string,
  acuerdo: { mode: 'fixed_per_ticket' | 'tiered'; fixed?: number; tiers?: Tramo[] },
) {
  const id = await persona(clave, nombre)
  const { error } = await dueno.rpc('staff_create_seller_membership', {
    p_organization_id: org,
    p_profile_id: id,
    p_mode: acuerdo.mode,
    p_fixed_amount: acuerdo.fixed,
    p_tiers: acuerdo.tiers,
  })
  if (error) throw new Error(`Alta de ${nombre}: ${error.message}`)
  await cliente(id)
  return id
}

/** Alta de un integrante por SU vendedor padre, como en «Mi equipo» (BR-E04). */
async function altaIntegrante(
  clave: string,
  nombre: string,
  padre: string,
  modelo: { model: 'fixed_per_ticket' | 'tiered'; amount?: number },
) {
  const id = await persona(clave, nombre)
  const padreSesion = await sesion(padre)
  const { error } = await padreSesion.from('memberships').insert({
    organization_id: org,
    profile_id: id,
    role: 'seller',
    parent_seller_id: personas.get(padre)!.id,
    commission_model: modelo.model,
    fixed_commission_amount: modelo.amount ?? null,
  })
  if (error) throw new Error(`Alta de ${nombre}: ${error.message}`)
  await cliente(id)
  return id
}

/**
 * Un vendedor que YA existia antes de la 0078: sin sesion (la service role o un
 * script), la membresia nace con el acuerdo de siempre, la mitad.
 */
async function altaHeredada(clave: string, nombre: string, padre: string | null = null) {
  const id = await persona(clave, nombre)
  await db.query(
    `insert into memberships (organization_id, profile_id, role, parent_seller_id)
     values ($1, $2, 'seller', $3)`,
    [org, id, padre ? personas.get(padre)!.id : null],
  )
  await cliente(id)
  return id
}

async function nuevaRifa(nombre: string, precio: number, status = 'active') {
  const { rows } = await db.query(
    `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date, created_by)
     values ($1, $2, $3, $4, '2026-01-01', '2026-12-31', $5) returning id`,
    [org, nombre, precio, status, duenoId],
  )
  return rows[0].id as string
}

async function boletas(raffleId: string, sellerId: string, n: number): Promise<string[]> {
  const inicio = contador.get(raffleId) ?? 0
  contador.set(raffleId, inicio + n)
  const { rows } = await db.query(
    `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                          weekly_number, inventory_status)
     select $1, $2, $3, $4, lpad((($5::int + g) % 10000)::text, 4, '0'),
            lpad((($5::int + g) / 10000)::text, 4, '0'), 'available'
     from generate_series(1, $6::int) g
     returning id`,
    [org, raffleId, sellerId, duenoId, inicio, n],
  )
  return rows.map((r) => r.id as string)
}

async function vender(clave: string, raffleId: string, n: number, precio?: number) {
  const sellerId = personas.get(clave)!.id
  const ids = await boletas(raffleId, sellerId, n)
  const { error } = await (await sesion(clave)).rpc('bulk_assign_tickets', {
    p_ticket_ids: ids,
    p_client_id: clientes.get(sellerId)!,
    p_sale_price: precio,
  })
  if (error) throw new Error(`No se pudo vender: ${error.message}`)
  return ids
}

async function cobrar(clave: string, ids: string[]) {
  const sellerId = personas.get(clave)!.id
  const { rows } = await db.query(`select id, sale_price from tickets where id = any($1)`, [ids])
  const total = rows.reduce((s, r) => s + Number(r.sale_price), 0)
  const { error } = await (await sesion(clave)).rpc('create_payment', {
    p_client_id: clientes.get(sellerId)!,
    p_total_amount: total,
    p_allocations: rows.map((r) => ({ ticket_id: r.id, amount: Number(r.sale_price) })),
  })
  if (error) throw new Error(`No se pudo cobrar: ${error.message}`)
}

async function venderYCobrar(clave: string, raffleId: string, n: number, precio?: number) {
  const ids = await vender(clave, raffleId, n, precio)
  await cobrar(clave, ids)
  return ids
}

type Estado = {
  n: number
  rate: number
  earned: number
  teamN: number
  teamEarned: number
  tierN: number
  shortfall: number
}

async function estado(clave: string, raffleId = R1): Promise<Estado> {
  const { rows } = await db.query(
    `select tickets_paid, rate, earned, team_tickets_paid, team_earned, tier_tickets_paid, team_shortfall
       from seller_commissions where raffle_id = $1 and seller_id = $2`,
    [raffleId, personas.get(clave)!.id],
  )
  const f = rows[0]
  if (!f) return { n: 0, rate: 0, earned: 0, teamN: 0, teamEarned: 0, tierN: 0, shortfall: 0 }
  return {
    n: f.tickets_paid,
    rate: Number(f.rate),
    earned: Number(f.earned),
    teamN: f.team_tickets_paid,
    teamEarned: Number(f.team_earned),
    tierN: f.tier_tickets_paid,
    shortfall: Number(f.team_shortfall),
  }
}

/** BR-G22: el ledger explica lo propio y lo del equipo, cada uno por su lado. */
async function ledgerCuadra(clave: string, raffleId = R1) {
  const { rows } = await db.query(
    `select coalesce(sum(amount) filter (where not team_movement), 0)::bigint as propio,
            coalesce(sum(amount) filter (where team_movement), 0)::bigint as equipo
       from commission_ledger where raffle_id = $1 and seller_id = $2`,
    [raffleId, personas.get(clave)!.id],
  )
  const e = await estado(clave, raffleId)
  expect(Number(rows[0].propio), `${clave}: ledger propio`).toBe(e.earned)
  expect(Number(rows[0].equipo), `${clave}: ledger de equipo`).toBe(e.teamEarned)
}

async function plantillaVigente() {
  const { rows } = await db.query(
    `select id, template_version, commission_list_json(id) as tiers
       from commission_tier_lists where organization_id = $1 and kind = 'template'
      order by template_version desc limit 1`,
    [org],
  )
  return rows[0] as { id: string; template_version: number; tiers: Tramo[] }
}

async function membresia(clave: string) {
  const { rows } = await db.query(
    `select * from memberships where organization_id = $1 and profile_id = $2`,
    [org, personas.get(clave)!.id],
  )
  return rows[0]
}

async function problemas() {
  const { rows } = await db.query(
    `select problem, seller_id, parent_id, detail from commission_agreement_problems()
      where organization_id = $1`,
    [org],
  )
  return rows
}

/** Lo que responde la base a quien no es el padre y cambia el acuerdo de equipo (D-238). */
const SOLO_EL_PADRE =
  'La ganancia de un integrante la decide su vendedor a cargo. Pídele que la cambie desde «Mi equipo».'

/**
 * Cada cifra de `seller_commissions` de la organizacion contra un modelo escrito
 * aparte, en TypeScript, con las formulas de BR-G27 y BR-G20. Devuelve cuantas
 * filas comprobo.
 */
async function modeloIndependiente(): Promise<number> {
  const { rows: miembros } = await db.query(
    `select profile_id, parent_seller_id, commission_model, fixed_commission_amount, team_tier_list_id,
            direct_commission_mode, direct_fixed_amount, direct_tier_list_id
       from memberships where organization_id = $1 and role = 'seller'`,
    [org],
  )
  const { rows: items } = await db.query(
    `select i.list_id, i.min_tickets, i.rate from commission_tier_list_items i
       join commission_tier_lists l on l.id = i.list_id where l.organization_id = $1`,
    [org],
  )
  const { rows: pagadas } = await db.query(
    `select t.raffle_id, t.seller_id, r.ticket_price, count(*)::int as n,
            sum(coalesce(t.base_price, t.sale_price) - t.sale_price)::bigint as rebajas
       from tickets t join raffles r on r.id = t.raffle_id
      where t.organization_id = $1 and t.inventory_status = 'assigned' and t.payment_status = 'paid'
      group by t.raffle_id, t.seller_id, r.ticket_price`,
    [org],
  )
  const { rows: filas } = await db.query(
    `select * from seller_commissions where organization_id = $1`,
    [org],
  )

  const listas = new Map<string, Tramo[]>()
  for (const i of items) {
    const l = listas.get(i.list_id) ?? []
    l.push({ min_tickets: i.min_tickets, rate: Number(i.rate) })
    listas.set(i.list_id, l)
  }
  for (const l of listas.values()) l.sort((a, b) => a.min_tickets - b.min_tickets)
  const tarifa = (m: (typeof miembros)[number], precio: number, n: number) => {
    if (n <= 0) return 0
    const directo = m.parent_seller_id === null
    const modo = directo ? m.direct_commission_mode : m.commission_model
    if (modo === 'half_price') return Math.floor(precio / 2)
    if (modo === 'fixed_per_ticket') return Number(directo ? m.direct_fixed_amount : m.fixed_commission_amount)
    const lista = listas.get(directo ? m.direct_tier_list_id : m.team_tier_list_id) ?? []
    return lista.filter((t) => t.min_tickets <= n).reduce((r, t) => t.rate, 0)
  }
  const porId = new Map(miembros.map((m) => [m.profile_id, m]))

  let comprobadas = 0
  for (const fila of filas) {
    const m = porId.get(fila.seller_id)
    if (!m) continue
    const propias = pagadas.find((p) => p.raffle_id === fila.raffle_id && p.seller_id === fila.seller_id)
    const precio = Number(
      (await db.query(`select ticket_price from raffles where id = $1`, [fila.raffle_id])).rows[0].ticket_price,
    )
    const n = propias?.n ?? 0
    const hijos =
      m.parent_seller_id === null
        ? miembros
            .filter((h) => h.parent_seller_id === m.profile_id)
            .map((h) => ({
              h,
              n: pagadas.find((p) => p.raffle_id === fila.raffle_id && p.seller_id === h.profile_id)?.n ?? 0,
            }))
            .filter((x) => x.n > 0)
        : []
    const nEquipo = hijos.reduce((s, x) => s + x.n, 0)
    const r = tarifa(m, precio, n + nEquipo)
    const propio = Math.max(0, n * r - Number(propias?.rebajas ?? 0))
    const equipo = hijos.reduce((s, x) => s + x.n * Math.max(0, r - tarifa(x.h, precio, x.n)), 0)

    expect(fila.tickets_paid, `${fila.seller_id}`).toBe(n)
    expect(fila.tier_tickets_paid, `${fila.seller_id}: conteo del tramo`).toBe(n + nEquipo)
    expect(fila.team_tickets_paid, `${fila.seller_id}: boletas del equipo`).toBe(nEquipo)
    expect(Number(fila.rate)).toBe(r)
    expect(Number(fila.earned)).toBe(propio)
    expect(Number(fila.team_earned), `${fila.seller_id}: lo del equipo`).toBe(equipo)
    comprobadas++
  }

  // Un jefe con boletas cobradas de su equipo tiene que TENER fila en esa rifa:
  // si no la tiene, el bucle de arriba no puede ver que le falta dinero.
  for (const p of pagadas) {
    const padre = porId.get(p.seller_id)?.parent_seller_id
    if (!padre) continue
    const fila = filas.find((f) => f.raffle_id === p.raffle_id && f.seller_id === padre)
    expect(fila, `el padre ${padre} no tiene fila en la rifa ${p.raffle_id}`).toBeDefined()
  }
  return comprobadas
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  const { rows } = await db.query(
    `insert into organizations (name) values ($1) returning id`,
    [`Ganancias pruebas ${STAMP}`],
  )
  org = rows[0].id

  duenoId = await persona('dueno', 'Dueña Ganancias')
  await db.query(`insert into memberships (organization_id, profile_id, role) values ($1, $2, 'owner')`, [
    org,
    duenoId,
  ])
  dueno = await sesion('dueno')

  R1 = await nuevaRifa(`Rifa G uno ${STAMP}`, PRECIO)
}, 120_000)

afterAll(async () => {
  // Todo lo de la organizacion en UNA transaccion, con los disparadores apagados:
  // las listas son inmutables y la bitacora conserva a sus actores. Las cuentas
  // de Auth se quedan (la siguiente pasada las reutiliza).
  await db.query('begin')
  try {
    await db.query(`set local session_replication_role = replica`)
    for (const tabla of [
      'payment_allocations',
      'payments',
      'notifications',
      'commission_ledger',
      'seller_commissions',
      'tickets',
      'clients',
      'audit_logs',
      'memberships',
      'commission_tier_list_items',
    ]) {
      if (tabla === 'commission_tier_list_items') {
        await db.query(
          `delete from commission_tier_list_items where list_id in
             (select id from commission_tier_lists where organization_id = $1)`,
          [org],
        )
      } else {
        await db.query(`delete from ${tabla} where organization_id = $1`, [org])
      }
    }
    await db.query(`delete from commission_tier_lists where organization_id = $1`, [org])
    await db.query(`delete from raffles where organization_id = $1`, [org])
    await db.query(`delete from organizations where id = $1`, [org])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }
  await db.end()
}, 120_000)

// =============================================================================

describe('E11 — la migracion conserva lo que habia', () => {
  it('E11-01: cada organizacion tiene su lista general v1 valida y ningun integrante queda sin version', async () => {
    const { rows: tabla } = await db.query(`select to_regclass('public.commission_tiers') as t`)
    expect(tabla[0].t).toBeNull()

    // La de esta suite nacio con los tramos de siempre, por el disparador.
    const vigente = await plantillaVigente()
    expect(vigente.template_version).toBe(1)
    expect(vigente.tiers).toEqual(PLANTILLA_V1)

    // Toda lista de la base cumple las reglas nuevas.
    const { rows: invalidas } = await db.query(
      `select id from commission_tier_lists where commission_tiers_problem(commission_list_json(id)) is not null`,
    )
    expect(invalidas).toEqual([])

    // Todo integrante por tramos tiene su version; nadie sin padre la «usa».
    const { rows: sinVersion } = await db.query(
      `select profile_id from memberships
        where parent_seller_id is not null and commission_model = 'tiered' and team_tier_list_id is null`,
    )
    expect(sinVersion).toEqual([])

    // Los vendedores del seed conservan la mitad (no se convirtio en una cifra).
    const { rows: seed } = await db.query(
      `select direct_commission_mode, direct_fixed_amount, direct_tier_list_id from memberships
        where profile_id = any($1)`,
      [[ctx.ids.seller1, ctx.ids.seller2]],
    )
    for (const m of seed) {
      expect(m).toEqual({ direct_commission_mode: 'half_price', direct_fixed_amount: null, direct_tier_list_id: null })
    }
  })
})

describe('E11 — altas del personal: fijo, lista general y tramos propios', () => {
  it('E11-02: alta con ganancia fija', async () => {
    await altaDirecta('fijo', 'Fija Treinta y Cinco', { mode: 'fixed_per_ticket', fixed: 35_000 })
    const m = await membresia('fijo')
    expect(m.direct_commission_mode).toBe('fixed_per_ticket')
    expect(Number(m.direct_fixed_amount)).toBe(35_000)
    expect(m.direct_tier_list_id).toBeNull()

    await venderYCobrar('fijo', R1, 3)
    const e = await estado('fijo')
    expect(e).toMatchObject({ n: 3, rate: 35_000, earned: 105_000, tierN: 3, teamEarned: 0 })
    await ledgerCuadra('fijo')
  })

  it('E11-03: alta con la lista general queda en su version, y el tramo es retroactivo', async () => {
    await altaDirecta('general', 'General Veinte', { mode: 'tiered' })
    const m = await membresia('general')
    const vigente = await plantillaVigente()
    expect(m.direct_commission_mode).toBe('tiered')
    expect(m.direct_tier_list_id).toBe(vigente.id)

    await venderYCobrar('general', R1, 20)
    expect(await estado('general')).toMatchObject({ n: 20, rate: 20_000, earned: 400_000 })

    await venderYCobrar('general', R1, 1)
    // 21 × $25.000, no 20 × $20.000 + $25.000 (BR-G02).
    expect(await estado('general')).toMatchObject({ n: 21, rate: 25_000, earned: 525_000 })

    const { rows } = await db.query(
      `select movement, amount from commission_ledger
        where raffle_id = $1 and seller_id = $2 order by created_at desc, amount desc limit 2`,
      [R1, personas.get('general')!.id],
    )
    expect(rows.map((r) => [r.movement, Number(r.amount)]).sort()).toEqual([
      ['sale', 25_000],
      ['tier_adjustment', 100_000],
    ])
    await ledgerCuadra('general')
  })

  it('E11-04: tramos personalizados en el alta, con los limites exactos', async () => {
    const tramos = [
      { min_tickets: 1, rate: 10_000 },
      { min_tickets: 6, rate: 15_000 },
      { min_tickets: 11, rate: 20_000 },
    ]
    await altaDirecta('propia', 'Propia Diez', { mode: 'tiered', tiers: tramos })
    const m = await membresia('propia')
    const { rows } = await db.query(
      `select kind, owner_profile_id, commission_list_json(id) as tiers from commission_tier_lists where id = $1`,
      [m.direct_tier_list_id],
    )
    expect(rows[0]).toEqual({ kind: 'custom', owner_profile_id: personas.get('propia')!.id, tiers: tramos })

    for (const [total, tarifa] of [
      [5, 10_000],
      [6, 15_000],
      [10, 15_000],
      [11, 20_000],
    ] as const) {
      const actual = (await estado('propia')).n
      await venderYCobrar('propia', R1, total - actual)
      expect(await estado('propia')).toMatchObject({ n: total, rate: tarifa, earned: total * tarifa })
    }
    await ledgerCuadra('propia')
  })

  it('E11-05: personalizar no cambia la lista general ni el acuerdo de nadie mas', async () => {
    const vigente = await plantillaVigente()
    expect(vigente.template_version).toBe(1)
    expect(vigente.tiers).toEqual(PLANTILLA_V1)
    expect((await membresia('general')).direct_tier_list_id).toBe(vigente.id)
    expect(await estado('general')).toMatchObject({ n: 21, rate: 25_000, earned: 525_000 })
  })

  it('E11-06: una lista general nueva no toca a quien ya tenia la suya', async () => {
    const antes = await db.query(
      `select updated_at from seller_commissions where seller_id = $1 and raffle_id = $2`,
      [personas.get('general')!.id, R1],
    )
    const ledgerAntes = await db.query(`select count(*)::int as n from commission_ledger where organization_id = $1`, [org])

    const v2 = [
      { min_tickets: 1, rate: 21_000 },
      { min_tickets: 21, rate: 26_000 },
      { min_tickets: 31, rate: 31_000 },
      { min_tickets: 51, rate: 41_000 },
    ]
    const { data, error } = await dueno.rpc('save_commission_template', {
      p_organization_id: org,
      p_tiers: v2,
    })
    expect(error).toBeNull()
    expect(data![0]).toMatchObject({ template_version: 2, changed: true })

    // Quien estaba en la v1 sigue en la v1, y no se recalculo nada.
    const general = await membresia('general')
    expect(general.direct_tier_list_id).not.toBe(data![0]!.list_id)
    expect(await estado('general')).toMatchObject({ rate: 25_000, earned: 525_000 })
    const despues = await db.query(
      `select updated_at from seller_commissions where seller_id = $1 and raffle_id = $2`,
      [personas.get('general')!.id, R1],
    )
    expect(despues.rows[0].updated_at).toEqual(antes.rows[0].updated_at)
    const ledgerDespues = await db.query(`select count(*)::int as n from commission_ledger where organization_id = $1`, [org])
    expect(ledgerDespues.rows[0].n).toBe(ledgerAntes.rows[0].n)

    // Un acuerdo NUEVO si toma la v2.
    await altaDirecta('general2', 'General Veintiuno', { mode: 'tiered' })
    expect((await membresia('general2')).direct_tier_list_id).toBe(data![0]!.list_id)
    await venderYCobrar('general2', R1, 1)
    expect(await estado('general2')).toMatchObject({ n: 1, rate: 21_000, earned: 21_000 })
  })

  it('E11-07: guardar lo mismo no crea version, y dos guardados a la vez crean UNA', async () => {
    const vigente = await plantillaVigente()
    const { data: repetido } = await dueno.rpc('save_commission_template', {
      p_organization_id: org,
      p_tiers: vigente.tiers,
    })
    expect(repetido![0]).toMatchObject({ list_id: vigente.id, template_version: 2, changed: false })

    // Dos sesiones a la vez con la misma lista nueva: la segunda ve la primera.
    const otra = await signInAs(personas.get('dueno')!.email)
    const v3 = [
      { min_tickets: 1, rate: 22_000 },
      { min_tickets: 21, rate: 27_000 },
    ]
    const [a, b] = await Promise.all([
      dueno.rpc('save_commission_template', { p_organization_id: org, p_tiers: v3 }),
      otra.rpc('save_commission_template', { p_organization_id: org, p_tiers: v3 }),
    ])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect([a.data![0]!.changed, b.data![0]!.changed].sort()).toEqual([false, true])
    expect(a.data![0]!.list_id).toBe(b.data![0]!.list_id)
    const { rows } = await db.query(
      `select count(*)::int as n from commission_tier_lists where organization_id = $1 and kind = 'template'`,
      [org],
    )
    expect(rows[0].n).toBe(3)
  })

  it('E11-08: una lista invalida no se guarda y lo dice con palabras', async () => {
    const casos: Array<[unknown, string]> = [
      [[], 'Escribe al menos un tramo.'],
      [[{ min_tickets: 2, rate: 20_000 }], 'El primer tramo tiene que empezar en 1 boleta.'],
      [
        [
          { min_tickets: 1, rate: 20_000 },
          { min_tickets: 1, rate: 25_000 },
        ],
        'Dos tramos empiezan desde 1 boleta.',
      ],
      [
        [
          { min_tickets: 1, rate: 20_000 },
          { min_tickets: 21, rate: 20_000 },
        ],
        'tiene que pagar más que el anterior',
      ],
      [[{ min_tickets: 1, rate: 0 }], 'La ganancia por boleta tiene que ser mayor que cero.'],
      [[{ min_tickets: 1, rate: 10_000_001 }], 'no puede pasar de $10.000.000'],
      [[{ min_tickets: 1, rate: 20_000.5 }], 'Escribe cantidades enteras'],
      [
        [
          { min_tickets: 1, rate: 1 },
          { min_tickets: 100_001, rate: 2 },
        ],
        'después de la boleta 100.000',
      ],
      [
        Array.from({ length: 21 }, (_, i) => ({ min_tickets: i * 10 + 1, rate: (i + 1) * 1_000 })),
        'como máximo 20 tramos',
      ],
    ]
    const antes = await plantillaVigente()
    for (const [tramos, mensaje] of casos) {
      const { error } = await dueno.rpc('save_commission_template', {
        p_organization_id: org,
        p_tiers: tramos as Tramo[],
      })
      expect(error, JSON.stringify(tramos).slice(0, 80)).not.toBeNull()
      expect(error!.message).toContain(mensaje)
    }
    expect((await plantillaVigente()).id).toBe(antes.id)
  })
})

describe('E11 — el padre y su equipo', () => {
  it('E11-09: padre $30.000 e hijo $20.000: el padre conserva $10.000 y la empresa $90.000', async () => {
    await altaDirecta('p30', 'Padre Treinta', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaIntegrante('h20', 'Hijo Veinte', 'p30', { model: 'fixed_per_ticket', amount: 20_000 })
    await venderYCobrar('h20', R1, 1)

    expect(await estado('h20')).toMatchObject({ n: 1, rate: 20_000, earned: 20_000 })
    expect(await estado('p30')).toMatchObject({ n: 0, earned: 0, teamN: 1, teamEarned: 10_000, tierN: 1, rate: 30_000 })

    // La empresa: lo cobrado menos todo lo que se paga por esa boleta.
    expect(PRECIO - 20_000 - 10_000).toBe(90_000)
    await ledgerCuadra('h20')
    await ledgerCuadra('p30')
  })

  it('E11-10: el ejemplo del encargo — 10 propias + 15 del equipo clasifican con 25', async () => {
    await altaDirecta('pej', 'Padre Ejemplo', {
      mode: 'tiered',
      tiers: [
        { min_tickets: 1, rate: 30_000 },
        { min_tickets: 21, rate: 40_000 },
      ],
    })
    await altaIntegrante('hej', 'Hijo Ejemplo', 'pej', { model: 'fixed_per_ticket', amount: 20_000 })

    // Primero el equipo: sin ventas propias, el padre ya esta en el primer tramo.
    await venderYCobrar('hej', R1, 15)
    expect(await estado('pej')).toMatchObject({ n: 0, tierN: 15, rate: 30_000, teamEarned: 15 * 10_000 })

    await venderYCobrar('pej', R1, 10)
    const padre = await estado('pej')
    expect(padre.tierN).toBe(25)
    expect(padre.rate).toBe(40_000)
    expect(padre.earned).toBe(400_000)
    expect(padre.teamEarned).toBe(300_000)
    expect(padre.earned + padre.teamEarned).toBe(700_000)
    expect(await estado('hej')).toMatchObject({ n: 15, rate: 20_000, earned: 300_000 })
    await ledgerCuadra('pej')
    await ledgerCuadra('hej')
  })

  it('E11-11: un padre sin ventas propias sube de tramo gracias al equipo', async () => {
    await altaDirecta('psin', 'Padre Sin Ventas', {
      mode: 'tiered',
      tiers: [
        { min_tickets: 1, rate: 30_000 },
        { min_tickets: 21, rate: 40_000 },
      ],
    })
    await altaIntegrante('hsin', 'Hijo De Sin Ventas', 'psin', { model: 'fixed_per_ticket', amount: 20_000 })

    await venderYCobrar('hsin', R1, 20)
    expect(await estado('psin')).toMatchObject({ n: 0, earned: 0, tierN: 20, rate: 30_000, teamEarned: 200_000 })

    await venderYCobrar('hsin', R1, 1)
    // Retroactivo: las 21 pasan a dejarle $20.000 cada una.
    expect(await estado('psin')).toMatchObject({ n: 0, earned: 0, tierN: 21, rate: 40_000, teamEarned: 420_000 })
    await ledgerCuadra('psin')
  })

  it('E11-12: varios integrantes con acuerdos distintos, cada uno con su conteo', async () => {
    await altaDirecta('pvar', 'Padre Varios', { mode: 'fixed_per_ticket', fixed: 45_000 })
    await altaIntegrante('hvar1', 'Hijo Fijo Veinte', 'pvar', { model: 'fixed_per_ticket', amount: 20_000 })
    await altaIntegrante('hvar2', 'Hijo Por Tramos', 'pvar', { model: 'tiered' })
    await altaIntegrante('hvar3', 'Hijo Fijo Treinta', 'pvar', { model: 'fixed_per_ticket', amount: 30_000 })

    // El de tramos quedo en la lista general VIGENTE (v3: $22.000 y $27.000 desde 21).
    const vigente = await plantillaVigente()
    expect((await membresia('hvar2')).team_tier_list_id).toBe(vigente.id)

    await venderYCobrar('hvar1', R1, 5)
    await venderYCobrar('hvar2', R1, 21)
    await venderYCobrar('hvar3', R1, 3)

    expect(await estado('hvar2')).toMatchObject({ n: 21, rate: 27_000, earned: 21 * 27_000 })
    const padre = await estado('pvar')
    expect(padre.teamN).toBe(29)
    expect(padre.teamEarned).toBe(5 * 25_000 + 21 * 18_000 + 3 * 15_000)
    await ledgerCuadra('pvar')
  })

  it('E11-13: la venta de un integrante sube la tarifa del padre y su margen sobre OTRO integrante', async () => {
    const lista = [
      { min_tickets: 1, rate: 30_000 },
      { min_tickets: 21, rate: 40_000 },
    ]
    await altaDirecta('pmar', 'Padre Margen', { mode: 'tiered', tiers: lista })
    await altaIntegrante('hmarA', 'Hijo Margen A', 'pmar', { model: 'fixed_per_ticket', amount: 20_000 })
    await altaIntegrante('hmarB', 'Hijo Margen B', 'pmar', { model: 'fixed_per_ticket', amount: 25_000 })
    await venderYCobrar('hmarA', R1, 10)
    await venderYCobrar('hmarB', R1, 10)
    expect(await estado('pmar')).toMatchObject({ tierN: 20, rate: 30_000, teamEarned: 10 * 10_000 + 10 * 5_000 })
    const bAntes = await estado('hmarB')

    await venderYCobrar('hmarA', R1, 1)
    expect(await estado('pmar')).toMatchObject({ tierN: 21, rate: 40_000, teamEarned: 11 * 20_000 + 10 * 15_000 })
    // La tarifa del compañero no cambia por eso: su acuerdo y su conteo son suyos.
    expect(await estado('hmarB')).toEqual(bAntes)
    await ledgerCuadra('pmar')
  })

  it('E11-14: una venta PROPIA del padre cambia el reparto de todo su equipo', async () => {
    const lista = [
      { min_tickets: 1, rate: 30_000 },
      { min_tickets: 21, rate: 40_000 },
    ]
    await altaDirecta('ppro', 'Padre Propia', { mode: 'tiered', tiers: lista })
    await altaIntegrante('hproA', 'Hijo Propia A', 'ppro', { model: 'fixed_per_ticket', amount: 20_000 })
    await altaIntegrante('hproB', 'Hijo Propia B', 'ppro', { model: 'fixed_per_ticket', amount: 25_000 })
    await venderYCobrar('hproA', R1, 10)
    await venderYCobrar('hproB', R1, 10)
    expect(await estado('ppro')).toMatchObject({ tierN: 20, rate: 30_000, teamEarned: 150_000, earned: 0 })

    await venderYCobrar('ppro', R1, 1)
    expect(await estado('ppro')).toMatchObject({
      n: 1,
      tierN: 21,
      rate: 40_000,
      earned: 40_000,
      teamEarned: 10 * 20_000 + 10 * 15_000,
    })
    // Y la empresa se queda precio − tarifa del jefe por CADA boleta del equipo.
    const { rows } = await db.query(
      `select coalesce(sum(t.sale_price), 0)::bigint as cobrado from tickets t
        where t.raffle_id = $1 and t.payment_status = 'paid' and t.inventory_status = 'assigned'
          and t.seller_id = any($2)`,
      [R1, ['ppro', 'hproA', 'hproB'].map((c) => personas.get(c)!.id)],
    )
    const p = await estado('ppro')
    const a = await estado('hproA')
    const b = await estado('hproB')
    const comisiones = p.earned + p.teamEarned + a.earned + b.earned
    expect(Number(rows[0].cobrado) - comisiones).toBe(21 * (PRECIO - 40_000))
    await ledgerCuadra('ppro')
  })

  it('E11-15: corregir un abono baja de tramo al integrante y al padre, hacia atras', async () => {
    const { rows } = await db.query(
      `select pa.payment_id, pa.ticket_id, pa.amount from payment_allocations pa
         join tickets t on t.id = pa.ticket_id
        where t.seller_id = $1 and t.raffle_id = $2 order by t.daily_number limit 1`,
      [personas.get('hproA')!.id, R1],
    )
    const { error } = await (await sesion('hproA')).rpc('update_payment_allocation', {
      p_payment_id: rows[0].payment_id,
      p_ticket_id: rows[0].ticket_id,
      p_amount: 60_000,
      p_expected_amount: Number(rows[0].amount),
    })
    expect(error).toBeNull()

    expect(await estado('hproA')).toMatchObject({ n: 9, earned: 9 * 20_000 })
    // 1 propia + 9 + 10 = 20: el padre vuelve al primer tramo EN TODAS.
    expect(await estado('ppro')).toMatchObject({
      tierN: 20,
      rate: 30_000,
      earned: 30_000,
      teamEarned: 9 * 10_000 + 10 * 5_000,
    })
    await ledgerCuadra('ppro')
    await ledgerCuadra('hproA')
  })
})

describe('E11 — compatibilidad padre–hijo (BR-G28)', () => {
  it('E11-16: el padre no puede pagarle a un integrante mas de lo que gana el', async () => {
    const { error } = await (await sesion('p30')).rpc('team_set_commission_model', {
      p_member_id: personas.get('h20')!.id,
      p_model: 'fixed_per_ticket',
      p_amount: 35_000,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('No puedes pagarle más de $30.000 por boleta')
    expect(await estado('h20')).toMatchObject({ rate: 20_000, earned: 20_000 })
  })

  it('E11-17: tampoco una lista que lo superaria MAS ADELANTE, en un tramo futuro', async () => {
    // Lista general v4: los tramos de siempre, que llegan a $40.000 desde 51.
    const { error: guardado } = await dueno.rpc('save_commission_template', {
      p_organization_id: org,
      p_tiers: PLANTILLA_V1,
    })
    expect(guardado).toBeNull()
    expect((await plantillaVigente()).template_version).toBe(4)

    await altaDirecta('pfut', 'Padre Futuro', {
      mode: 'tiered',
      tiers: [
        { min_tickets: 1, rate: 30_000 },
        { min_tickets: 21, rate: 35_000 },
        { min_tickets: 31, rate: 38_000 },
      ],
    })
    // Hoy nada lo delata: con 1 a 50 boletas el hijo gana menos que el padre.
    // Con 51, $40.000 contra $38.000.
    const id = await persona('hfut', 'Hijo Futuro')
    const { error } = await (await sesion('pfut')).from('memberships').insert({
      organization_id: org,
      profile_id: id,
      role: 'seller',
      parent_seller_id: personas.get('pfut')!.id,
      commission_model: 'tiered',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toBe(
      'Con la lista general, al llegar a 51 boletas cobradas ganaría $40.000 por boleta y tú ganas $38.000. Elige una ganancia fija de hasta $30.000.',
    )

    // La pantalla lo sabe antes de intentarlo.
    const { data: limites } = await (await sesion('pfut')).rpc('team_commission_limits', {
      p_organization_id: org,
    })
    expect(Number(limites![0]!.max_fixed)).toBe(30_000)
    expect(limites![0]!.template_problem).toContain('al llegar a 51 boletas')

    // Con un fijo que cabe, si.
    const { error: fijo } = await (await sesion('pfut')).from('memberships').insert({
      organization_id: org,
      profile_id: id,
      role: 'seller',
      parent_seller_id: personas.get('pfut')!.id,
      commission_model: 'fixed_per_ticket',
      fixed_commission_amount: 30_000,
    })
    expect(fijo).toBeNull()
  })

  it('E11-18: bajar el acuerdo del padre por debajo de un integrante se rechaza y no cambia nada', async () => {
    const antes = await membresia('p30')
    const { error } = await dueno.rpc('staff_set_seller_agreement', {
      p_seller_id: personas.get('p30')!.id,
      p_mode: 'fixed_per_ticket',
      p_fixed_amount: 15_000,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('Con este acuerdo, Padre Treinta ganaría $15.000 por boleta')
    expect(error!.message).toContain('Hijo Veinte, de su equipo, puede llegar a $20.000')
    const despues = await membresia('p30')
    expect(despues.direct_fixed_amount).toBe(antes.direct_fixed_amount)
    expect(await estado('p30')).toMatchObject({ teamEarned: 10_000 })
  })

  it('E11-19: un padre en la mitad pone el limite RIFA POR RIFA, y una rifa nueva o mas barata tambien', async () => {
    await altaHeredada('pmit', 'Padre Mitad')
    await altaHeredada('hmit', 'Hijo Mitad', 'pmit')
    // Entro por tramos en la version vigente (v4: hasta $40.000).
    expect((await membresia('hmit')).team_tier_list_id).toBe((await plantillaVigente()).id)

    // Una rifa a $70.000 dejaria al padre en $35.000 y el hijo puede llegar a $40.000.
    await expect(nuevaRifa(`Rifa barata ${STAMP}`, 70_000, 'draft')).rejects.toThrow(
      'Con la rifa «Rifa barata',
    )
    // A $80.000, la mitad son justo $40.000: cabe.
    const R3 = await nuevaRifa(`Rifa ochenta ${STAMP}`, 80_000, 'draft')
    await expect(db.query(`update raffles set ticket_price = 78000 where id = $1`, [R3])).rejects.toThrow(
      'Padre Mitad ganaría $39.000 por boleta',
    )
    // Subir nunca empeora nada.
    await db.query(`update raffles set ticket_price = 100000 where id = $1`, [R3])

    // Cerrada y sin boletas del hijo: bajarla no pone a nadie en riesgo...
    await db.query(`update raffles set status = 'active' where id = $1`, [R3])
    await db.query(`update raffles set status = 'closed', closed_at = now() where id = $1`, [R3])
    await db.query(`update raffles set ticket_price = 70000 where id = $1`, [R3])
    // ...pero reactivarla asi, si.
    await expect(db.query(`update raffles set status = 'active' where id = $1`, [R3])).rejects.toThrow(
      'Hijo Mitad, de su equipo, puede llegar a ganar $40.000',
    )
  })

  it('E11-20: en una rifa cerrada cuenta lo que el integrante YA vendio', async () => {
    const R4 = await nuevaRifa(`Rifa cerrada ${STAMP}`, 100_000)
    await venderYCobrar('hmit', R4, 2)
    // En la mitad: el padre recibe $50.000 − $20.000 por cada una.
    expect(await estado('pmit', R4)).toMatchObject({ rate: 50_000, teamN: 2, teamEarned: 2 * 30_000 })
    await db.query(`update raffles set status = 'closed', closed_at = now() where id = $1`, [R4])

    // Con 2 boletas el hijo gana $20.000: la mitad de $70.000 lo cubre.
    await db.query(`update raffles set ticket_price = 70000 where id = $1`, [R4])
    expect(await estado('pmit', R4)).toMatchObject({ rate: 35_000, teamEarned: 2 * 15_000 })
    // La de $30.000, no: $15.000 frente a $20.000.
    await expect(db.query(`update raffles set ticket_price = 30000 where id = $1`, [R4])).rejects.toThrow(
      'ganaría $15.000 por boleta',
    )
    await ledgerCuadra('pmit', R4)
  })
})

describe('E11 — equipos: entrar, salir y dos niveles', () => {
  it('E11-21: al entrar y salir de un equipo cada acuerdo se conserva y rige el que toca', async () => {
    await altaDirecta('movil', 'Vendedor Movil', {
      mode: 'tiered',
      tiers: [
        { min_tickets: 1, rate: 15_000 },
        { min_tickets: 11, rate: 18_000 },
      ],
    })
    const listaPropia = (await membresia('movil')).direct_tier_list_id

    // Meterlo en el equipo de Padre Treinta ($30.000) con el acuerdo de equipo por
    // defecto —la lista general v4, hasta $40.000— no cabe...
    const { error: noCabe } = await dueno
      .from('memberships')
      .update({ parent_seller_id: personas.get('p30')!.id })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('movil')!.id)
    expect(noCabe).not.toBeNull()
    expect(noCabe!.message).toContain('Vendedor Movil')

    // ...y el personal no puede arreglarlo poniendole un fijo en el MISMO cambio:
    // lo que gana un integrante lo adjudica su padre, no quien reorganiza (D-238).
    // Hasta la 0079 esto pasaba; era la excepcion de I-181.
    const { error: conFijo } = await dueno
      .from('memberships')
      .update({
        parent_seller_id: personas.get('p30')!.id,
        commission_model: 'fixed_per_ticket',
        fixed_commission_amount: 18_000,
      })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('movil')!.id)
    expect(conFijo?.message).toBe(SOLO_EL_PADRE)
    expect((await membresia('movil')).parent_seller_id).toBeNull()

    // Con un padre donde la lista general cabe (Padre Varios, $45.000), el
    // traslado si pasa, y rige la lista general hasta que su padre decida otra cosa.
    const pvarAntes = await estado('pvar')
    const { error } = await dueno
      .from('memberships')
      .update({ parent_seller_id: personas.get('pvar')!.id })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('movil')!.id)
    expect(error).toBeNull()
    expect((await membresia('movil')).team_tier_list_id).toBe((await plantillaVigente()).id)
    const { error: fijo } = await (await sesion('pvar')).rpc('team_set_commission_model', {
      p_member_id: personas.get('movil')!.id,
      p_model: 'fixed_per_ticket',
      p_amount: 18_000,
    })
    expect(fijo).toBeNull()
    await venderYCobrar('movil', R1, 2)
    expect(await estado('movil')).toMatchObject({ rate: 18_000, earned: 36_000 })
    expect(await estado('pvar')).toMatchObject({
      teamN: pvarAntes.teamN + 2,
      teamEarned: pvarAntes.teamEarned + 2 * 27_000,
    })

    // Sale: rige su acuerdo propio, hacia atras, y el padre deja de cobrar por el.
    await dueno
      .from('memberships')
      .update({ parent_seller_id: null })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('movil')!.id)
    const fuera = await membresia('movil')
    expect(fuera.direct_tier_list_id).toBe(listaPropia)
    expect(await estado('movil')).toMatchObject({ rate: 15_000, earned: 30_000 })
    expect(await estado('pvar')).toMatchObject({ teamN: pvarAntes.teamN, teamEarned: pvarAntes.teamEarned })

    // Vuelve: su acuerdo de equipo de antes, tal cual.
    await dueno
      .from('memberships')
      .update({ parent_seller_id: personas.get('pvar')!.id })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('movil')!.id)
    expect(await estado('movil')).toMatchObject({ rate: 18_000, earned: 36_000 })
    expect(await estado('pvar')).toMatchObject({ teamEarned: pvarAntes.teamEarned + 2 * 27_000 })
    await ledgerCuadra('movil')
    await ledgerCuadra('pvar')
  })

  it('E11-22: quien tiene equipo no pasa al equipo de otro (dos niveles, I-176)', async () => {
    const { error } = await dueno
      .from('memberships')
      .update({ parent_seller_id: personas.get('pvar')!.id })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('p30')!.id)
    expect(error).not.toBeNull()
    expect(error!.message).toBe(
      'Padre Treinta tiene su propio equipo y no puede pasar al equipo de otro vendedor.',
    )
  })
})

describe('E11 — rebajas y precios', () => {
  it('E11-23: la rebaja maxima sale del acuerdo de cada quien', async () => {
    const limite = async (clave: string) => {
      const [id] = await boletas(R1, personas.get(clave)!.id, 1)
      const { data, error } = await (await sesion(clave)).rpc('ticket_sale_price_limits', {
        p_ticket_id: id!,
      })
      expect(error).toBeNull()
      return Number(data![0]!.min_sale_price)
    }
    expect(await limite('propia')).toBe(PRECIO - 10_000) // su primer tramo
    expect(await limite('fijo')).toBe(PRECIO - 35_000) // su fijo
    expect(await limite('pmit')).toBe(PRECIO - 60_000) // la mitad
    expect(await limite('h20')).toBe(PRECIO - 20_000) // su acuerdo de equipo
  })

  it('E11-24: la rebaja del integrante la paga el, y ya concedida no deja bajarle el acuerdo', async () => {
    const padreAntes = await estado('p30')
    await venderYCobrar('h20', R1, 1, PRECIO - 15_000)
    expect(await estado('h20')).toMatchObject({ n: 2, earned: 2 * 20_000 - 15_000 })
    expect(await estado('p30')).toMatchObject({ teamEarned: padreAntes.teamEarned + 10_000 })

    const { error } = await (await sesion('p30')).rpc('team_set_commission_model', {
      p_member_id: personas.get('h20')!.id,
      p_model: 'fixed_per_ticket',
      p_amount: 12_000,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('Hijo Veinte ya rebajó $15.000')

    const { error: cabe } = await (await sesion('p30')).rpc('team_set_commission_model', {
      p_member_id: personas.get('h20')!.id,
      p_model: 'fixed_per_ticket',
      p_amount: 16_000,
    })
    expect(cabe).toBeNull()
    expect(await estado('h20')).toMatchObject({ rate: 16_000, earned: 2 * 16_000 - 15_000 })
    await ledgerCuadra('h20')
    await ledgerCuadra('p30')
  })

  it('E11-25: un cambio de precio mueve a quien cobra la mitad, no a quien tiene un fijo o tramos', async () => {
    const mitadAntes = await estado('pmit')
    await venderYCobrar('hmit', R1, 1)
    expect(await estado('pmit')).toMatchObject({ rate: 60_000, teamEarned: mitadAntes.teamEarned + 40_000 })
    const fijoAntes = await estado('p30')

    await db.query(`update raffles set ticket_price = 130000 where id = $1`, [R1])
    expect(await estado('pmit')).toMatchObject({ rate: 65_000, teamEarned: 1 * 45_000 })
    expect(await estado('p30')).toEqual(fijoAntes)
    await db.query(`update raffles set ticket_price = 120000 where id = $1`, [R1])
    expect(await estado('pmit')).toMatchObject({ rate: 60_000, teamEarned: 40_000 })
    await ledgerCuadra('pmit')
  })
})

describe('E11 — aislamiento y peticiones manipuladas', () => {
  it('E11-26: un vendedor no toca la lista general ni ningun acuerdo, tampoco el suyo', async () => {
    const vendedor = await sesion('p30')
    const plantilla = await vendedor.rpc('save_commission_template', {
      p_organization_id: org,
      p_tiers: PLANTILLA_V1,
    })
    expect(plantilla.error?.message).toContain('No tienes permiso')

    for (const objetivo of ['p30', 'h20']) {
      const { error } = await vendedor.rpc('staff_set_seller_agreement', {
        p_seller_id: personas.get(objetivo)!.id,
        p_mode: 'fixed_per_ticket',
        p_fixed_amount: 99_000,
      })
      expect(error?.message).toBe('El vendedor no existe o no tienes acceso a él.')
    }

    // Ni por PostgREST: no hay politica de UPDATE para un vendedor.
    await vendedor
      .from('memberships')
      .update({ direct_fixed_amount: 99_000 })
      .eq('profile_id', personas.get('p30')!.id)
    expect(Number((await membresia('p30')).direct_fixed_amount)).toBe(30_000)
  })

  it('E11-27: una lista personalizada solo la ven su dueño y el personal', async () => {
    const lista = (await membresia('propia')).direct_tier_list_id
    const otro = await sesion('general')
    const { data: ajena } = await otro.from('commission_tier_lists').select('id').eq('id', lista)
    expect(ajena).toEqual([])
    const { data: tramos } = await otro.from('commission_tier_list_items').select('rate').eq('list_id', lista)
    expect(tramos).toEqual([])

    const { data: propia } = await (await sesion('propia')).from('commission_tier_lists').select('id').eq('id', lista)
    expect(propia).toHaveLength(1)
    const { data: personal } = await dueno.from('commission_tier_lists').select('id').eq('id', lista)
    expect(personal).toHaveLength(1)

    // La general la lee cualquiera de la organizacion.
    const { data: general } = await otro
      .from('commission_tier_lists')
      .select('id')
      .eq('organization_id', org)
      .eq('kind', 'template')
    expect(general!.length).toBe(4)
  })

  it('E11-28: listas de otro vendedor o de otra organizacion, y el personal de otra organizacion', async () => {
    const ajena = (await membresia('propia')).direct_tier_list_id
    const { error: deOtro } = await dueno
      .from('memberships')
      .update({ direct_commission_mode: 'tiered', direct_fixed_amount: null, direct_tier_list_id: ajena })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('fijo')!.id)
    expect(deOtro?.message).toBe('Esa lista de tramos es de otro vendedor.')

    const { rows } = await db.query(
      `select id from commission_tier_lists where organization_id = $1 and kind = 'template' limit 1`,
      [ctx.demoOrg.id],
    )
    const { error: otraOrg } = await dueno
      .from('memberships')
      .update({ direct_commission_mode: 'tiered', direct_fixed_amount: null, direct_tier_list_id: rows[0].id })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('fijo')!.id)
    expect(otraOrg).not.toBeNull()
    expect(otraOrg!.code).toBe('23503')

    // Un integrante no puede usar una lista personalizada. El personal ni siquiera
    // llega a esa regla: el acuerdo de equipo lo adjudica su padre (D-238). La
    // regla de la lista vale en todo camino, tambien sin sesion; por el alta del
    // padre la prueba E13-06.
    const { error: equipo } = await dueno
      .from('memberships')
      .update({ team_tier_list_id: ajena })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('hvar2')!.id)
    expect(equipo?.message).toBe(SOLO_EL_PADRE)
    await expect(
      db.query(`update memberships set team_tier_list_id = $1 where organization_id = $2 and profile_id = $3`, [
        ajena,
        org,
        personas.get('hvar2')!.id,
      ]),
    ).rejects.toThrow('La ganancia por tramos de un integrante usa la lista general.')

    // El Dueño de otra organizacion: lo mismo que un identificador que no existe.
    const ajenoDueno = await signInAs(USERS.otherOrgOwner)
    const { error: cruzado } = await ajenoDueno.rpc('staff_set_seller_agreement', {
      p_seller_id: personas.get('fijo')!.id,
      p_mode: 'fixed_per_ticket',
      p_fixed_amount: 50_000,
    })
    expect(cruzado?.message).toBe('El vendedor no existe o no tienes acceso a él.')
    const { error: plantilla } = await ajenoDueno.rpc('save_commission_template', {
      p_organization_id: org,
      p_tiers: PLANTILLA_V1,
    })
    expect(plantilla?.message).toContain('No tienes permiso')
    expect(Number((await membresia('fijo')).direct_fixed_amount)).toBe(35_000)
  })

  it('E11-29: la mitad no se asigna de nuevo desde una sesion', async () => {
    const { error } = await dueno.rpc('staff_set_seller_agreement', {
      p_seller_id: personas.get('fijo')!.id,
      p_mode: 'half_price',
    })
    expect(error?.message).toContain('La mitad del precio se conserva para quien ya la tiene')

    const id = await persona('mitadnueva', 'Mitad Nueva')
    const { error: alta } = await dueno.rpc('staff_create_seller_membership', {
      p_organization_id: org,
      p_profile_id: id,
      p_mode: 'half_price',
    })
    expect(alta?.message).toContain('fija o por tramos')
    // Quien ya la tiene la conserva: guardarle la misma no es cambiarla.
    const { data } = await dueno.rpc('staff_set_seller_agreement', {
      p_seller_id: personas.get('pmit')!.id,
      p_mode: 'half_price',
    })
    expect(data![0]).toMatchObject({ changed: false })
  })
})

describe('E11 — concurrencia, reintentos, fallos e historial', () => {
  it('E11-30: dos ventas a la vez de dos integrantes del mismo padre cuentan las dos', async () => {
    const antes = await estado('pmar')
    const a = await vender('hmarA', R1, 1)
    const b = await vender('hmarB', R1, 1)
    await Promise.all([cobrar('hmarA', a), cobrar('hmarB', b)])
    const despues = await estado('pmar')
    expect(despues.teamN).toBe(antes.teamN + 2)
    expect(despues.teamEarned).toBe(12 * 20_000 + 11 * 15_000)
    await ledgerCuadra('pmar')
  })

  it('E11-31: el cambio del padre y el de su integrante a la vez: uno espera al otro y queda compatible', async () => {
    // Padre Margen: tramos $30.000/$40.000. Subirle el fijo a su integrante B a
    // $28.000 cabe con su acuerdo de hoy; bajar al padre a un fijo de $25.000 cabe
    // con el integrante de hoy. Las dos juntas no caben: tiene que fallar una.
    const [padre, hijo] = await Promise.all([
      dueno.rpc('staff_set_seller_agreement', {
        p_seller_id: personas.get('pmar')!.id,
        p_mode: 'fixed_per_ticket',
        p_fixed_amount: 25_000,
      }),
      (await sesion('pmar')).rpc('team_set_commission_model', {
        p_member_id: personas.get('hmarB')!.id,
        p_model: 'fixed_per_ticket',
        p_amount: 28_000,
      }),
    ])
    const fallos = [padre.error, hijo.error].filter(Boolean)
    expect(fallos).toHaveLength(1)
    expect((await problemas()).filter((p) => p.problem === 'par_incompatible')).toEqual([])
  })

  it('E11-32: reintentar el mismo cambio no escribe nada', async () => {
    const auditoria = async () =>
      (
        await db.query(
          `select count(*)::int as n from audit_logs where organization_id = $1 and entity_id = $2`,
          [org, personas.get('fijo')!.id],
        )
      ).rows[0].n
    const ledger = async () =>
      (await db.query(`select count(*)::int as n from commission_ledger where organization_id = $1`, [org])).rows[0].n

    const antesA = await auditoria()
    const antesL = await ledger()
    const { data } = await dueno.rpc('staff_set_seller_agreement', {
      p_seller_id: personas.get('fijo')!.id,
      p_mode: 'fixed_per_ticket',
      p_fixed_amount: 35_000,
    })
    expect(data![0]).toMatchObject({ changed: false, raffles_recalculated: 0 })
    expect(await auditoria()).toBe(antesA)
    expect(await ledger()).toBe(antesL)

    // El padre: la misma ganancia otra vez tampoco deja otra fila en la bitacora.
    const antesH = (
      await db.query(`select count(*)::int as n from audit_logs where entity_id = $1`, [personas.get('h20')!.id])
    ).rows[0].n
    const { error } = await (await sesion('p30')).rpc('team_set_commission_model', {
      p_member_id: personas.get('h20')!.id,
      p_model: 'fixed_per_ticket',
      p_amount: 16_000,
    })
    expect(error).toBeNull()
    const despuesH = (
      await db.query(`select count(*)::int as n from audit_logs where entity_id = $1`, [personas.get('h20')!.id])
    ).rows[0].n
    expect(despuesH).toBe(antesH)
  })

  it('E11-33: un alta que falla no deja membresia ni lista a medias', async () => {
    const id = await persona('fallida', 'Alta Fallida')
    const { error } = await dueno.rpc('staff_create_seller_membership', {
      p_organization_id: org,
      p_profile_id: id,
      p_mode: 'tiered',
      p_tiers: [{ min_tickets: 2, rate: 10_000 }],
    })
    expect(error?.message).toBe('El primer tramo tiene que empezar en 1 boleta.')
    const { rows: m } = await db.query(`select 1 from memberships where profile_id = $1`, [id])
    expect(m).toEqual([])
    const { rows: l } = await db.query(`select 1 from commission_tier_lists where owner_profile_id = $1`, [id])
    expect(l).toEqual([])

    // Dos veces el mismo vendedor: la segunda falla y no deja su lista.
    const listasAntes = (
      await db.query(`select count(*)::int as n from commission_tier_lists where owner_profile_id = $1`, [
        personas.get('fijo')!.id,
      ])
    ).rows[0].n
    const { error: repetida } = await dueno.rpc('staff_create_seller_membership', {
      p_organization_id: org,
      p_profile_id: personas.get('fijo')!.id,
      p_mode: 'tiered',
      p_tiers: [
        { min_tickets: 1, rate: 11_000 },
        { min_tickets: 5, rate: 12_000 },
      ],
    })
    expect(repetida).not.toBeNull()
    const listasDespues = (
      await db.query(`select count(*)::int as n from commission_tier_lists where owner_profile_id = $1`, [
        personas.get('fijo')!.id,
      ])
    ).rows[0].n
    expect(listasDespues).toBe(listasAntes)
  })

  it('E11-34: el historial explica cada version y cada acuerdo', async () => {
    const { rows: versiones } = await db.query(
      `select new_values from audit_logs where organization_id = $1 and action = 'commission_template.update'
        order by created_at`,
      [org],
    )
    expect(versiones.map((v) => v.new_values.template_version)).toEqual([2, 3, 4])
    expect(versiones[2].new_values.tiers).toEqual(PLANTILLA_V1)

    const { rows: acuerdos } = await db.query(
      `select old_values, new_values from audit_logs
        where organization_id = $1 and action = 'user.commission_agreement' and entity_id = $2
        order by created_at`,
      [org, personas.get('propia')!.id],
    )
    expect(acuerdos[0].old_values).toBeNull()
    expect(acuerdos[0].new_values).toMatchObject({
      direct_commission_mode: 'tiered',
      tier_list_kind: 'custom',
      source: 'create',
    })
    expect(acuerdos[0].new_values.tiers).toHaveLength(3)
  })
})

describe('E11 — lo que ve la pantalla y la prueba contra un modelo independiente', () => {
  it('E11-35: commission_summary dice la regla, el conteo del tramo y el siguiente tramo correctos', async () => {
    const { data } = await (await sesion('general')).rpc('commission_summary', { p_raffle_id: R1 })
    expect(data![0]).toMatchObject({
      pay_model: 'tiered',
      by_tiers: true,
      tickets_paid: 21,
      tier_tickets_paid: 21,
      next_min_tickets: 31,
      next_rate: 30_000,
      tickets_to_next: 10,
      projected_earned: 31 * 30_000,
    })

    // Un jefe por tramos: el siguiente tramo cuenta tambien su equipo, y no se
    // proyecta lo propio porque depende de quien venda.
    const { data: jefe } = await (await sesion('ppro')).rpc('commission_summary', { p_raffle_id: R1 })
    const fila = jefe!.find((f) => f.seller_id === personas.get('ppro')!.id)!
    expect(fila).toMatchObject({ pay_model: 'tiered', tier_tickets_paid: 20, next_min_tickets: 21, tickets_to_next: 1 })
    expect(fila.projected_earned).toBeNull()

    const { data: fijo } = await (await sesion('fijo')).rpc('commission_summary', { p_raffle_id: R1 })
    expect(fijo![0]).toMatchObject({ pay_model: 'fixed', by_tiers: false, next_min_tickets: null })

    const { data: mitad } = await (await sesion('pmit')).rpc('commission_summary', { p_raffle_id: R1 })
    expect(mitad!.find((f) => f.seller_id === personas.get('pmit')!.id)).toMatchObject({ pay_model: 'half_price' })
  })

  it('E11-36: cada cifra de la organizacion coincide con un modelo independiente', async () => {
    expect(await modeloIndependiente()).toBeGreaterThan(20)
  })

  it('E11-37: ninguna fila de la organizacion deja de cuadrar por partes, y nada queda incompatible', async () => {
    const { rows } = await db.query(
      `select sc.seller_id from seller_commissions sc
        where sc.organization_id = $1
          and (sc.earned <> coalesce((select sum(l.amount) from commission_ledger l
                                       where l.raffle_id = sc.raffle_id and l.seller_id = sc.seller_id
                                         and not l.team_movement), 0)
            or sc.team_earned <> coalesce((select sum(l.amount) from commission_ledger l
                                            where l.raffle_id = sc.raffle_id and l.seller_id = sc.seller_id
                                              and l.team_movement), 0)
            or sc.earned < 0 or sc.team_earned < 0 or sc.team_shortfall <> 0)`,
      [org],
    )
    expect(rows).toEqual([])
    expect(await problemas()).toEqual([])
  })

  it('E11-38: un par incompatible que ya existiera se ANOTA como faltante, no se esconde', async () => {
    // Se fuerza por debajo de la validacion, dentro de una transaccion que se
    // deshace: es la forma que tendria un dato anterior a la 0078.
    await db.query('begin')
    try {
      await db.query(`alter table memberships disable trigger memberships_validate_seller_agreements`)
      await db.query(
        `update memberships set fixed_commission_amount = 35000
          where organization_id = $1 and profile_id = $2`,
        [org, personas.get('h20')!.id],
      )
      const { rows } = await db.query(
        `select team_earned, team_shortfall from seller_commissions where raffle_id = $1 and seller_id = $2`,
        [R1, personas.get('p30')!.id],
      )
      // Hijo Veinte, 2 boletas a $35.000 contra un padre de $30.000: la empresa
      // pone $5.000 por boleta, y queda escrito.
      expect(Number(rows[0].team_shortfall)).toBe(2 * 5_000)
      const { rows: diag } = await db.query(
        `select problem from commission_agreement_problems() where organization_id = $1 order by 1`,
        [org],
      )
      expect(diag.map((d) => d.problem)).toEqual(['faltante_de_equipo', 'par_incompatible'])
    } finally {
      await db.query('rollback')
    }
  })

  it('E11-39: quien ejecuta cada funcion es exactamente la lista de la 0078', async () => {
    for (const check of EARNING_FUNCTION_CHECKS) {
      const { rows } = await db.query(check.sql)
      expect(rows.map((r) => r.x), check.nombre).toHaveLength(check.esperado)
    }
  })
})

// =============================================================================
// E12 — Reorganizar equipos (D-238, I-180)
//
// El traslado lo hace el personal por PostgREST (BR-E06, BR-E08) y cambia QUIEN
// es el padre, no lo que el integrante gana. El padre nuevo tiene que recibir sus
// boletas en ese mismo cambio aunque el integrante gane exactamente lo mismo que
// antes: es el caso en que el motor no cascadea (se detiene en su camino de
// idempotencia) y el padre nuevo se quedaba sin saberlo.
// =============================================================================

/** Traslada a un vendedor de equipo: solo cambia `parent_seller_id` (BR-E06). */
async function trasladar(clave: string, padre: string | null, actor?: Client) {
  const { data, error } = await (actor ?? dueno)
    .from('memberships')
    .update({ parent_seller_id: padre === null ? null : personas.get(padre)!.id })
    .eq('organization_id', org)
    .eq('profile_id', personas.get(clave)!.id)
    .select('profile_id')
  if (error) throw new Error(`Traslado de ${clave}: ${error.message} (${error.code})`)
  expect(data, `traslado de ${clave}`).toHaveLength(1)
}

/** Lo que el ledger de EQUIPO de un padre atribuye a un integrante (BR-G22). */
async function equipoDesde(padre: string, integrante: string, raffleId = R1) {
  const { rows } = await db.query(
    `select coalesce(sum(amount), 0)::bigint as suma, count(*)::int as n
       from commission_ledger
      where raffle_id = $1 and seller_id = $2 and team_movement and from_seller_id = $3`,
    [raffleId, personas.get(padre)!.id, personas.get(integrante)!.id],
  )
  return { suma: Number(rows[0].suma), n: rows[0].n as number }
}

/** Cuantas filas tiene el ledger de la organizacion, y cuanto suman. */
async function ledgerDeLaOrganizacion() {
  const { rows } = await db.query(
    `select count(*)::int as n, coalesce(sum(amount), 0)::bigint as suma
       from commission_ledger where organization_id = $1`,
    [org],
  )
  return { n: rows[0].n as number, suma: Number(rows[0].suma) }
}

/** BR-G22 en TODAS las filas de la organizacion. Devuelve las que no cuadran. */
async function filasQueNoCuadran() {
  const { rows } = await db.query(
    `select sc.seller_id, sc.raffle_id from seller_commissions sc
      where sc.organization_id = $1
        and (sc.earned <> coalesce((select sum(l.amount) from commission_ledger l
                                     where l.raffle_id = sc.raffle_id and l.seller_id = sc.seller_id
                                       and not l.team_movement), 0)
          or sc.team_earned <> coalesce((select sum(l.amount) from commission_ledger l
                                          where l.raffle_id = sc.raffle_id and l.seller_id = sc.seller_id
                                            and l.team_movement), 0))`,
    [org],
  )
  return rows
}

/** Un Administrador de la organizacion: la segunda persona del personal. */
async function administrador(): Promise<Client> {
  const id = await persona('adminorg', 'Administradora Ganancias')
  await db.query(
    `insert into memberships (organization_id, profile_id, role) values ($1, $2, 'admin')
     on conflict do nothing`,
    [org, id],
  )
  return sesion('adminorg')
}

describe('E12 — reorganizar equipos: el padre nuevo recibe al integrante (I-180)', () => {
  let R5: string
  let R6: string

  it('E12-01: trasladar un integrante que gana lo mismo lleva sus boletas al padre NUEVO', async () => {
    await altaDirecta('tra', 'Padre De Antes', { mode: 'fixed_per_ticket', fixed: 25_000 })
    await altaDirecta('trb', 'Padre De Ahora', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaIntegrante('trh', 'Hijo Trasladado', 'tra', { model: 'fixed_per_ticket', amount: 20_000 })
    await venderYCobrar('trh', R1, 10)
    expect(await estado('tra')).toMatchObject({ tierN: 10, teamN: 10, teamEarned: 10 * 5_000 })
    const hijo = await estado('trh')
    expect(hijo).toMatchObject({ n: 10, rate: 20_000, earned: 200_000 })

    await trasladar('trh', 'trb')

    // El integrante no cambia: su acuerdo de equipo es el mismo.
    expect(await estado('trh')).toEqual(hijo)
    // El padre de antes deja de contarlo...
    expect(await estado('tra')).toMatchObject({ tierN: 0, teamN: 0, teamEarned: 0 })
    // ...y el de ahora lo cuenta EN EL MISMO CAMBIO: 10 boletas y $10.000 por cada una.
    expect(await estado('trb')).toMatchObject({
      n: 0,
      earned: 0,
      rate: 30_000,
      tierN: 10,
      teamN: 10,
      teamEarned: 100_000,
    })
    // El historial dice de quien vino cada peso, en los dos padres (BR-G22).
    expect(await equipoDesde('tra', 'trh')).toMatchObject({ suma: 0 })
    expect(await equipoDesde('trb', 'trh')).toEqual({ suma: 100_000, n: 1 })
    for (const c of ['tra', 'trb', 'trh']) await ledgerCuadra(c)
  })

  it('E12-02: un vendedor directo entra a un equipo ganando lo mismo que con su acuerdo propio', async () => {
    await altaDirecta('trs', 'Suelto Que Entra', { mode: 'fixed_per_ticket', fixed: 20_000 })
    await altaDirecta('trc', 'Padre Cuarenta y Cinco', { mode: 'fixed_per_ticket', fixed: 45_000 })
    await venderYCobrar('trs', R1, 10)
    const antes = await estado('trs')
    expect(antes).toMatchObject({ n: 10, rate: 20_000, earned: 200_000, tierN: 10 })

    // Entra con su acuerdo de equipo de siempre —la lista general vigente—, que
    // con 10 boletas paga $20.000: lo mismo que su fijo.
    await trasladar('trs', 'trc')

    expect((await membresia('trs')).team_tier_list_id).toBe((await plantillaVigente()).id)
    expect(await estado('trs')).toEqual(antes)
    expect(await estado('trc')).toMatchObject({ tierN: 10, rate: 45_000, teamN: 10, teamEarned: 10 * 25_000 })
    expect(await equipoDesde('trc', 'trs')).toEqual({ suma: 250_000, n: 1 })
    await ledgerCuadra('trs')
    await ledgerCuadra('trc')
  })

  it('E12-03: al salir del equipo rige otra vez su acuerdo propio y el padre deja de contarlo', async () => {
    const antes = await estado('trs')
    await trasladar('trs', null)

    expect(await estado('trs')).toEqual(antes)
    expect(await estado('trc')).toMatchObject({ tierN: 0, teamN: 0, teamEarned: 0 })
    // Una fila al entrar y otra al salir, las dos atribuidas a quien se movio.
    expect(await equipoDesde('trc', 'trs')).toEqual({ suma: 0, n: 2 })
    await ledgerCuadra('trc')
  })

  it('E12-04: un padre por tramos sube de tramo al recibir al integrante y baja al perderlo, hacia atras', async () => {
    await altaDirecta('trt', 'Padre Tramos Traslado', {
      mode: 'tiered',
      tiers: [
        { min_tickets: 1, rate: 30_000 },
        { min_tickets: 21, rate: 40_000 },
      ],
    })
    await venderYCobrar('trt', R1, 15)
    expect(await estado('trt')).toMatchObject({ n: 15, tierN: 15, rate: 30_000, earned: 450_000, teamEarned: 0 })
    await altaIntegrante('trh2', 'Hijo Que Sube el Tramo', 'tra', { model: 'fixed_per_ticket', amount: 20_000 })
    await venderYCobrar('trh2', R1, 10)

    await trasladar('trh2', 'trt')

    // 15 propias + 10 del integrante = 25: TODAS las propias pasan a $40.000.
    expect(await estado('trt')).toMatchObject({
      n: 15,
      tierN: 25,
      rate: 40_000,
      earned: 600_000,
      teamN: 10,
      teamEarned: 200_000,
    })
    expect(await estado('tra')).toMatchObject({ teamN: 0, teamEarned: 0 })
    // El ajuste de tramo es de lo PROPIO y el integrante es del EQUIPO: el
    // historial los separa, y dice de quien vino lo del equipo.
    const { rows } = await db.query(
      `select movement, amount, team_movement, from_seller_id from commission_ledger
        where raffle_id = $1 and seller_id = $2
          and created_at = (select max(created_at) from commission_ledger where raffle_id = $1 and seller_id = $2)
        order by amount`,
      [R1, personas.get('trt')!.id],
    )
    expect(rows.map((r) => [r.movement, Number(r.amount), r.team_movement, r.from_seller_id])).toEqual([
      ['tier_adjustment', 150_000, false, null],
      ['sale', 200_000, true, personas.get('trh2')!.id],
    ])
    await ledgerCuadra('trt')

    await trasladar('trh2', 'tra')

    expect(await estado('trt')).toMatchObject({
      n: 15,
      tierN: 15,
      rate: 30_000,
      earned: 450_000,
      teamN: 0,
      teamEarned: 0,
    })
    expect(await estado('tra')).toMatchObject({ teamN: 10, teamEarned: 10 * 5_000 })
    await ledgerCuadra('trt')
    await ledgerCuadra('tra')
  })

  it('E12-05: el traslado alcanza TODAS las rifas del integrante, al padre nuevo y al de antes', async () => {
    R5 = await nuevaRifa(`Rifa traslado A ${STAMP}`, 100_000)
    R6 = await nuevaRifa(`Rifa traslado B ${STAMP}`, 120_000)
    await altaIntegrante('trh3', 'Hijo Varias Rifas', 'tra', { model: 'fixed_per_ticket', amount: 20_000 })
    await venderYCobrar('trh3', R1, 3)
    await venderYCobrar('trh3', R5, 4)
    await vender('trh3', R6, 2) // vendidas sin cobrar: no cuentan (BR-G01)
    expect(await estado('tra', R5)).toMatchObject({ teamN: 4, teamEarned: 4 * 5_000 })
    const bR1 = await estado('trb', R1)

    await trasladar('trh3', 'trb')

    expect(await estado('trb', R1)).toMatchObject({
      teamN: bR1.teamN + 3,
      teamEarned: bR1.teamEarned + 3 * 10_000,
      tierN: bR1.tierN + 3,
    })
    expect(await estado('trb', R5)).toMatchObject({ tierN: 4, teamN: 4, teamEarned: 4 * 10_000 })
    expect(await estado('trb', R6)).toMatchObject({ tierN: 0, teamN: 0, teamEarned: 0 })
    expect(await estado('tra', R5)).toMatchObject({ tierN: 0, teamN: 0, teamEarned: 0 })
    for (const rifa of [R1, R5, R6]) {
      for (const c of ['tra', 'trb', 'trh3']) await ledgerCuadra(c, rifa)
    }
  })

  it('E12-06: repetir el traslado, pedirlo dos veces a la vez o ir y volver no deja movimientos de mas', async () => {
    const admin = await administrador()
    const antes = { r1: await estado('trb', R1), r5: await estado('trb', R5), ledger: await ledgerDeLaOrganizacion() }

    // El mismo padre otra vez: no es un cambio, y no escribe nada.
    await trasladar('trh3', 'trb')
    expect(await ledgerDeLaOrganizacion()).toEqual(antes.ledger)

    // El mismo traslado dos veces a la vez, por dos personas del personal: uno lo
    // hace y el otro lo encuentra hecho.
    const aR5 = await estado('tra', R5)
    await Promise.all([trasladar('trh3', 'tra'), trasladar('trh3', 'tra', admin)])
    expect(await estado('tra', R5)).toMatchObject({ teamN: aR5.teamN + 4, teamEarned: aR5.teamEarned + 4 * 5_000 })
    expect(await estado('trb', R5)).toMatchObject({ teamN: 0, teamEarned: 0 })

    // Y de vuelta: todo queda como estaba, con el historial compensado.
    await trasladar('trh3', 'trb')
    expect(await estado('trb', R1)).toEqual(antes.r1)
    expect(await estado('trb', R5)).toEqual(antes.r5)
    const despues = await ledgerDeLaOrganizacion()
    expect(despues.suma).toBe(antes.ledger.suma)

    // Recalcular a mano todas las filas no escribe nada (BR-G08).
    const { rows: filas } = await db.query(
      `select raffle_id, seller_id from seller_commissions where organization_id = $1`,
      [org],
    )
    for (const f of filas) {
      await db.query(`select recalc_seller_commission($1, $2, $3)`, [org, f.raffle_id, f.seller_id])
    }
    expect(await ledgerDeLaOrganizacion()).toEqual(despues)
  })

  it('E12-07: dos traslados cruzados a la vez se esperan en vez de abrazarse, y cuadran', async () => {
    const admin = await administrador()
    await altaIntegrante('trx', 'Hijo Cruza Uno', 'tra', { model: 'fixed_per_ticket', amount: 20_000 })
    await altaIntegrante('try', 'Hijo Cruza Dos', 'trb', { model: 'fixed_per_ticket', amount: 20_000 })
    for (const c of ['trx', 'try']) {
      await venderYCobrar(c, R1, 2)
      await venderYCobrar(c, R5, 1)
    }

    // Seis vueltas: en cada una, cada integrante pasa al equipo del otro a la vez.
    const duraciones: number[] = []
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const [destinoX, destinoY] = vuelta % 2 === 0 ? ['trb', 'tra'] : ['tra', 'trb']
      const inicio = Date.now()
      await Promise.all([trasladar('trx', destinoX), trasladar('try', destinoY, admin)])
      duraciones.push(Date.now() - inicio)
    }
    // Sin los cerrojos de los dos jefes en orden, cada par se abrazaba: la base lo
    // detecta al cumplirse `deadlock_timeout` (1 s), aborta una transaccion y
    // PostgREST la reintenta sin decir nada. Medido (D-238): 52 interbloqueos en
    // 60 pares y 1.015 ms de mediana por par; con los cerrojos, 0 y 16 ms. La
    // mediana por debajo de medio segundo es la firma de que nadie espero al
    // detector.
    duraciones.sort((a, b) => a - b)
    expect(duraciones[3], `duraciones: ${duraciones.join(', ')} ms`).toBeLessThan(500)

    expect((await membresia('trx')).parent_seller_id).toBe(personas.get('tra')!.id)
    expect((await membresia('try')).parent_seller_id).toBe(personas.get('trb')!.id)
    expect(await filasQueNoCuadran()).toEqual([])
    await modeloIndependiente()
  })

  it('E12-08: un traslado y un cobro del mismo integrante a la vez: el padre nuevo cuenta la boleta', async () => {
    const ids = await vender('trx', R1, 1)
    const b = await estado('trb', R1)
    const a = await estado('tra', R1)

    await Promise.all([trasladar('trx', 'trb'), cobrar('trx', ids)])

    expect(await estado('trx')).toMatchObject({ n: 3, earned: 3 * 20_000 })
    expect(await estado('trb', R1)).toMatchObject({ teamN: b.teamN + 3, teamEarned: b.teamEarned + 3 * 10_000 })
    expect(await estado('tra', R1)).toMatchObject({ teamN: a.teamN - 2, teamEarned: a.teamEarned - 2 * 5_000 })
    await modeloIndependiente()
  })

  it('E12-09: despues de reorganizar, cada cifra coincide con el modelo, cuadra por partes y nada es incompatible', async () => {
    expect(await modeloIndependiente()).toBeGreaterThan(30)
    expect(await filasQueNoCuadran()).toEqual([])
    expect(await problemas()).toEqual([])
  })

  it('E12-10: las comprobaciones de la 0079 que corre verify:remote pasan contra la base', async () => {
    for (const check of EARNING_0079_CHECKS) {
      const { rows } = await db.query(check.sql)
      expect(rows.map((r) => r.x), check.nombre).toHaveLength(check.esperado)
    }
  })
})

// =============================================================================
// E13 — El acuerdo de equipo lo cambia su vendedor padre, y nadie mas (D-238, I-181)
//
// BR-G34: el personal configura la lista general y los acuerdos administrativos;
// el acuerdo de equipo de un integrante lo adjudica su padre. Reorganizar (decidir
// QUIEN es el padre) sigue siendo del personal (BR-E06, BR-E08). Cada rechazo se
// comprueba contra una foto de acuerdos, ganancias, ledger y bitacora.
// =============================================================================

/** Lo que un rechazo no puede tocar: acuerdos, ganancias, historial y bitacora. */
async function fotoDinero() {
  const { rows } = await db.query(
    `select
       (select jsonb_agg(jsonb_build_object(
                 'p', m.profile_id, 'padre', m.parent_seller_id, 'modelo', m.commission_model,
                 'fijo', m.fixed_commission_amount, 'lista', m.team_tier_list_id,
                 'directo', m.direct_commission_mode, 'directoFijo', m.direct_fixed_amount,
                 'directoLista', m.direct_tier_list_id) order by m.profile_id)
          from memberships m where m.organization_id = $1) as acuerdos,
       (select jsonb_agg(to_jsonb(sc) - 'updated_at' order by sc.raffle_id, sc.seller_id)
          from seller_commissions sc where sc.organization_id = $1) as ganancias,
       (select count(*) from commission_ledger where organization_id = $1)::int as ledger,
       (select count(*) from audit_logs where organization_id = $1)::int as bitacora`,
    [org],
  )
  return rows[0]
}

describe('E13 — el acuerdo de equipo lo cambia su vendedor padre, y nadie mas (I-181)', () => {
  it('E13-01: ni el Dueño ni el Administrador cambian el acuerdo de un integrante por PostgREST', async () => {
    await altaDirecta('kp', 'Padre Permisos', { mode: 'fixed_per_ticket', fixed: 30_000 })
    await altaIntegrante('kh', 'Hijo Permisos', 'kp', { model: 'fixed_per_ticket', amount: 20_000 })
    await venderYCobrar('kh', R1, 2)
    const admin = await administrador()
    const vigente = (await plantillaVigente()).id
    const antes = await fotoDinero()

    for (const actor of [dueno, admin]) {
      for (const cambio of [
        { fixed_commission_amount: 15_000 },
        { commission_model: 'tiered' as const, fixed_commission_amount: null },
        { team_tier_list_id: vigente },
      ]) {
        const { error } = await actor
          .from('memberships')
          .update(cambio)
          .eq('organization_id', org)
          .eq('profile_id', personas.get('kh')!.id)
        expect(error?.message, JSON.stringify(cambio)).toBe(SOLO_EL_PADRE)
        expect(error?.code).toBe('42501')
      }
    }
    expect(await fotoDinero()).toEqual(antes)
  })

  it('E13-02: tampoco escondido en un traslado, ni al dar de alta a alguien dentro de un equipo', async () => {
    await altaIntegrante('kh2', 'Hijo Permisos Dos', 'kp', { model: 'fixed_per_ticket', amount: 20_000 })
    const antes = await fotoDinero()

    const { error: conTraslado } = await dueno
      .from('memberships')
      .update({ parent_seller_id: personas.get('trb')!.id, fixed_commission_amount: 18_000 })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('kh2')!.id)
    expect(conTraslado?.message).toBe(SOLO_EL_PADRE)

    // El personal puede dar de alta a alguien dentro de un equipo (BR-E08), pero
    // no ponerle la ganancia: esa la adjudica su padre.
    const nuevo = await persona('kh3', 'Hijo Permisos Tres')
    const { error: alta } = await dueno.from('memberships').insert({
      organization_id: org,
      profile_id: nuevo,
      role: 'seller',
      parent_seller_id: personas.get('kp')!.id,
      commission_model: 'fixed_per_ticket',
      fixed_commission_amount: 20_000,
    })
    expect(alta?.message).toBe(SOLO_EL_PADRE)
    expect(await fotoDinero()).toEqual(antes)
  })

  it('E13-03: reorganizar sigue siendo del personal; lo que el integrante gana, de su padre nuevo', async () => {
    // Un traslado puro: el personal decide QUIEN es el padre.
    await trasladar('kh2', 'trb')
    expect((await membresia('kh2')).parent_seller_id).toBe(personas.get('trb')!.id)

    // Un alta dentro de un equipo con la ganancia por defecto: la lista general,
    // completada por la base.
    const nuevo = personas.get('kh3')!.id
    const { error: alta } = await dueno.from('memberships').insert({
      organization_id: org,
      profile_id: nuevo,
      role: 'seller',
      parent_seller_id: personas.get('kp')!.id,
    })
    // El padre de kh3 gana $30.000 y la lista general llega a $40.000: no cabe, y
    // el rechazo es de compatibilidad (BR-G28), no de permisos.
    expect(alta?.message).toContain('Hijo Permisos Tres')
    expect(alta?.message).not.toBe(SOLO_EL_PADRE)
    const { error: altaQueCabe } = await dueno.from('memberships').insert({
      organization_id: org,
      profile_id: nuevo,
      role: 'seller',
      parent_seller_id: personas.get('trc')!.id,
    })
    expect(altaQueCabe).toBeNull()
    expect((await membresia('kh3')).team_tier_list_id).toBe((await plantillaVigente()).id)

    // Y quien adjudica la ganancia es su padre, por su camino de siempre.
    const { error } = await (await sesion('trb')).rpc('team_set_commission_model', {
      p_member_id: personas.get('kh2')!.id,
      p_model: 'fixed_per_ticket',
      p_amount: 18_000,
    })
    expect(error).toBeNull()
    expect(Number((await membresia('kh2')).fixed_commission_amount)).toBe(18_000)
  })

  it('E13-04: ni el personal por la RPC del padre, ni el personal de otra organizacion', async () => {
    const antes = await fotoDinero()

    const { error: rpcDelPadre } = await dueno.rpc('team_set_commission_model', {
      p_member_id: personas.get('kh')!.id,
      p_model: 'fixed_per_ticket',
      p_amount: 15_000,
    })
    expect(rpcDelPadre?.message).toBe('Este vendedor no es de tu equipo.')

    const ajeno = await signInAs(USERS.otherOrgOwner)
    const { data: filas, error: porPostgrest } = await ajeno
      .from('memberships')
      .update({ fixed_commission_amount: 15_000 })
      .eq('profile_id', personas.get('kh')!.id)
      .select('profile_id')
    expect(porPostgrest).toBeNull()
    expect(filas).toEqual([])
    const { error: rpcAdministrativa } = await ajeno.rpc('staff_set_seller_agreement', {
      p_seller_id: personas.get('kh')!.id,
      p_mode: 'fixed_per_ticket',
      p_fixed_amount: 15_000,
    })
    expect(rpcAdministrativa?.message).toBe('El vendedor no existe o no tienes acceso a él.')
    const { error: rpcAjena } = await ajeno.rpc('team_set_commission_model', {
      p_member_id: personas.get('kh')!.id,
      p_model: 'fixed_per_ticket',
      p_amount: 15_000,
    })
    expect(rpcAjena?.message).toBe('Este vendedor no es de tu equipo.')

    expect(await fotoDinero()).toEqual(antes)
  })

  it('E13-05: ningun vendedor cambia su propio acuerdo, ni el de un compañero, ni el de otro equipo', async () => {
    const antes = await fotoDinero()
    const intentos: Array<[string, string]> = [
      ['kh', 'kh'], // el integrante, el suyo
      ['trh', 'kh'], // un integrante de otro equipo
      ['trb', 'kh'], // otro jefe
    ]
    for (const [actor, objetivo] of intentos) {
      const { error } = await (await sesion(actor)).rpc('team_set_commission_model', {
        p_member_id: personas.get(objetivo)!.id,
        p_model: 'fixed_per_ticket',
        p_amount: 29_000,
      })
      expect(error?.message, `${actor} → ${objetivo}`).toBe('Este vendedor no es de tu equipo.')
    }
    // Por PostgREST no hay politica de escritura para un vendedor: cero filas.
    for (const actor of ['kh', 'kp']) {
      const { data } = await (await sesion(actor))
        .from('memberships')
        .update({ fixed_commission_amount: 29_000, direct_fixed_amount: 99_000 })
        .eq('organization_id', org)
        .in('profile_id', [personas.get('kh')!.id, personas.get('kp')!.id])
        .select('profile_id')
      expect(data ?? []).toEqual([])
    }
    // El padre tampoco cambia el suyo por la RPC del personal.
    const { error: suyo } = await (await sesion('kp')).rpc('staff_set_seller_agreement', {
      p_seller_id: personas.get('kp')!.id,
      p_mode: 'fixed_per_ticket',
      p_fixed_amount: 99_000,
    })
    expect(suyo?.message).toBe('El vendedor no existe o no tienes acceso a él.')
    expect(await fotoDinero()).toEqual(antes)
  })

  it('E13-06: el padre si, por su RPC y en su alta; y un integrante sigue sin poder usar una lista personalizada', async () => {
    const { error } = await (await sesion('kp')).rpc('team_set_commission_model', {
      p_member_id: personas.get('kh')!.id,
      p_model: 'fixed_per_ticket',
      p_amount: 25_000,
    })
    expect(error).toBeNull()
    expect(await estado('kh')).toMatchObject({ rate: 25_000, earned: 2 * 25_000 })
    expect(await estado('kp')).toMatchObject({ teamEarned: 2 * 5_000 })
    await ledgerCuadra('kp')

    // Su alta pide una lista personalizada: la base la rechaza por la lista, no
    // por permisos, porque quien la pide si puede adjudicar la ganancia.
    const personalizada = (await membresia('propia')).direct_tier_list_id
    const nuevo = await persona('kh4', 'Hijo Permisos Cuatro')
    const { error: lista } = await (await sesion('kp')).from('memberships').insert({
      organization_id: org,
      profile_id: nuevo,
      role: 'seller',
      parent_seller_id: personas.get('kp')!.id,
      commission_model: 'tiered',
      team_tier_list_id: personalizada,
    })
    expect(lista?.message).toBe('La ganancia por tramos de un integrante usa la lista general.')
  })
})

// =============================================================================
// I-184 — LIMITACION ACEPTADA (D-239): un traslado cuyo acuerdo de equipo no cabe
// en el padre nuevo se RECHAZA. No se rebaja la ganancia del integrante, el
// personal no gana permisos sobre ese acuerdo y la empresa no pone la diferencia.
// Lo que falta demostrar, y demuestran estas dos pruebas: que el rechazo lo
// explica con la frase de siempre (BR-G28) y que no cambia NADA.
// =============================================================================

/** Todo lo que un rechazo no puede tocar, con los avisos ademas de `fotoDinero`. */
async function fotoCompleta(clave: string) {
  const { rows } = await db.query(
    `select (select count(*)::int from notifications where organization_id = $1) as avisos`,
    [org],
  )
  return { ...(await fotoDinero()), avisos: rows[0].avisos, fila: await membresia(clave) }
}

describe('E13 — un traslado que no cabe en el padre nuevo se rechaza y no cambia nada (I-184)', () => {
  it('E13-07: con un fijo del padre de antes, la frase dice el par y las cifras, y nada se mueve', async () => {
    await altaDirecta('kq', 'Padre Veinte Mil', { mode: 'fixed_per_ticket', fixed: 20_000 })
    const admin = await administrador()
    // Hijo Permisos gana $25.000 fijos con Padre Permisos ($30.000) desde E13-06.
    expect(Number((await membresia('kh')).fixed_commission_amount)).toBe(25_000)
    const antes = await fotoCompleta('kh')

    for (const actor of [dueno, admin]) {
      const { error } = await actor
        .from('memberships')
        .update({ parent_seller_id: personas.get('kq')!.id })
        .eq('organization_id', org)
        .eq('profile_id', personas.get('kh')!.id)
      expect(error?.code).toBe('23514')
      expect(error?.message).toBe(
        'Hijo Permisos no puede ganar $25.000 por boleta: Padre Veinte Mil gana $20.000 por boleta y de ahí sale su ganancia.',
      )
    }
    // Ni el padre, ni su ganancia, ni un peso, ni una linea de bitacora o de aviso.
    expect(await fotoCompleta('kh')).toEqual(antes)
  })

  it('E13-08: por tramos pasa igual, y el unico camino es el de siempre: su padre de ahora ajusta primero', async () => {
    await altaIntegrante('kt', 'Hijo Por Tramos', 'pvar', { model: 'tiered' })
    await venderYCobrar('kt', R1, 2)
    const antes = await fotoCompleta('kt')

    const { error } = await dueno
      .from('memberships')
      .update({ parent_seller_id: personas.get('trb')!.id })
      .eq('organization_id', org)
      .eq('profile_id', personas.get('kt')!.id)
    expect(error?.code).toBe('23514')
    expect(error?.message).toBe(
      'Con 51 boletas cobradas, Hijo Por Tramos ganaría $40.000 por boleta y Padre De Ahora gana $30.000. La ganancia de un integrante sale de la de su vendedor a cargo y no puede superarla.',
    )
    expect(await fotoCompleta('kt')).toEqual(antes)

    // El padre de ahora es quien decide lo que gana (BR-G34): si le fija algo que el
    // padre nuevo cubre, el traslado entra. Nadie lo hace por el; D-239 no añade otro camino.
    const { error: ajuste } = await (
      await sesion('pvar')
    ).rpc('team_set_commission_model', {
      p_member_id: personas.get('kt')!.id,
      p_model: 'fixed_per_ticket',
      p_amount: 30_000,
    })
    expect(ajuste).toBeNull()
    await trasladar('kt', 'trb')
    expect(await estado('kt')).toMatchObject({ rate: 30_000, earned: 2 * 30_000 })
    await ledgerCuadra('kt')
    await ledgerCuadra('trb')
  })
})

// =============================================================================
// D-239 — la comprobacion previa de la recuperacion ejecuta el GUARDIA del propio
// script, en solo lectura, y dice TODO lo que impide volver a 0077.
// =============================================================================

describe('E14 — el guardia de la recuperacion, en solo lectura (D-239)', () => {
  it('E14-01: nombra cada condicion de esta organizacion a la vez y no cambia nada', async () => {
    const guard = recoveryGuard(readFileSync(RECOVERY_SQL, 'utf8'))
    const antes = await fotoCompleta('kp')

    let message = ''
    await db.query('begin isolation level repeatable read read only')
    try {
      await db.query(guard)
    } catch (error) {
      message = (error as Error).message
    } finally {
      await db.query('rollback')
    }

    const lineas = message.split('\n')
    expect(lineas[0]).toBe('No se revierte:')
    // Un acuerdo administrativo fijo (Padre Permisos), una lista personalizada, la
    // version vigente de la lista general y un integrante por tramos en ella: las
    // tres condiciones, cada una en su linea y con sus identificadores.
    const acuerdos = lineas.find((l) =>
      l.startsWith('Hay acuerdos administrativos distintos de la mitad'),
    )
    const listas = lineas.find((l) => l.startsWith('Hay listas de tramos que no son la versión 1'))
    const integrantes = lineas.find((l) => l.startsWith('Hay integrantes por tramos en una lista'))
    expect(acuerdos).toContain(personas.get('kp')!.id)
    expect(listas).toContain((await membresia('propia')).direct_tier_list_id)
    expect(listas).toContain((await plantillaVigente()).id)
    expect(integrantes).toContain(personas.get('hmit')!.id)
    expect(await fotoCompleta('kp')).toEqual(antes)
  })
})
